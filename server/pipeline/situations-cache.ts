/**
 * Edge Setter — stale-while-revalidate cache in front of the situations build.
 *
 * The worker thread (situations-worker.ts) is what keeps a slow build off the
 * event loop. This is what keeps a slow build off the REQUEST: a request that
 * waits 22s for a worker is still a request that fails at the client's 12s abort,
 * it just no longer kills the instance. So the payload is cached, every request
 * is answered from the cache, and the rebuild happens behind it.
 *
 * THE FOUR STATES A REQUEST CAN BE IN
 *   fresh    — cached, younger than the TTL. Answered immediately, no rebuild.
 *   stale    — cached, older than the TTL. Answered immediately from the stale
 *              copy, with a rebuild kicked off behind it. Serving data that is 45
 *              seconds old is the whole point; this endpoint describes situations
 *              that move over hours.
 *   cold     — nothing cached (the first request after a deploy). Waits for the
 *              build, bounded by SITUATIONS_COLD_WAIT_MS. See below.
 *   timeout  — cold, and the build did not finish inside that bound. Answers with
 *              an empty payload. The build is NOT cancelled; it keeps running and
 *              populates the cache for the next request.
 *
 * WHY A COLD REQUEST WAITS INSTEAD OF ANSWERING EMPTY IMMEDIATELY
 * Measured against the client, not guessed. `fetchCanonicalSituations` goes
 * through `apiRequest`, which is `fetchWithTimeout(..., 12000)`, and all four
 * league boards plus the homepage pass `poll: false` — one shot per mount. So an
 * empty first answer is not "retried in a moment"; it is what that visitor sees
 * until they reload. On the boards an empty payload degrades to the legacy signal
 * feed (`buildBoardSituations` fallback, "Watching, nothing confirmed"); on
 * FlagshipHome it falls through to /api/v2/signals. Both are real, intended
 * degradations — and both are strictly worse than waiting 3 seconds for the real
 * answer. Waiting is also free here in the way it was not before: the wait happens
 * while the event loop is idle, so /healthz keeps answering and the instance
 * survives. The bound is 9s, under the client's 12s abort, so the client sees our
 * empty payload rather than its own AbortError.
 *
 * (Worth stating plainly: at prod's current 22.9s, EVERY situations request
 * already exceeds the 12s client abort. Nobody is being served this endpoint
 * today. A 9s cold wait that answers with real data most of the time is an
 * improvement on that, not a regression from it.)
 *
 * ONE REBUILD AT A TIME, GLOBALLY
 * There is one worker, and better-sqlite3 inside it is synchronous, so two
 * concurrent builds would serialize anyway — queued explicitly so the queue is
 * bounded instead of being an unbounded pile of pending postMessage calls. A
 * request for a key that is already building joins that build rather than adding
 * one.
 */
import fs from "fs";
import path from "path";
import { Worker } from "worker_threads";
import type { CanonicalSituationApiQuery } from "./situations-api";
import type { SituationsPayload, SituationsWorkerMessage } from "./situations-worker";
import type { SqlUsage } from "../sql-accounting";

export type SituationsCacheState = "fresh" | "stale" | "cold" | "timeout";

export interface SituationsResult {
  readonly payload: SituationsPayload;
  readonly state: SituationsCacheState;
  /** Age of the payload in ms; 0 for a payload built by this request. */
  readonly ageMs: number;
  /** SQL accounting of the build that produced this payload, for the request log. */
  readonly usage?: SqlUsage;
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

/** How long a payload counts as fresh. Matches the build caches in situations-api. */
const ttlMs = () => envInt("SITUATIONS_CACHE_TTL_MS", 45_000, 0, 3_600_000);
/** How long a cold request waits for a build. Must stay under the client's 12s. */
const coldWaitMs = () => envInt("SITUATIONS_COLD_WAIT_MS", 9_000, 0, 60_000);
/** A build over this is abandoned and the worker recycled. */
const buildTimeoutMs = () => envInt("SITUATIONS_BUILD_TIMEOUT_MS", 30_000, 1_000, 600_000);
/**
 * Distinct query shapes kept. league x sport x type x state x limit x order is
 * unbounded in the free-text fields, so without a cap a caller varying `?league=`
 * is a memory leak that ends in the OOM-kill this endpoint already caused once
 * (#51). 32 covers every shape the client actually sends: 4 boards + homepage +
 * the detail page.
 */
const MAX_CACHE_ENTRIES = 32;
/** Builds that may be queued at once before a cold request is answered empty. */
const MAX_QUEUED_BUILDS = 4;
/** Consecutive worker failures after which the worker is given up on. */
const MAX_WORKER_FAILURES = 3;

const EMPTY_PAYLOAD: SituationsPayload = { count: 0, situations: [] };
/** Error.name for a build the worker did not finish in time. */
const BUILD_TIMEOUT = "SituationsBuildTimeout";

interface CacheEntry {
  payload: SituationsPayload;
  builtAt: number;
  usage: SqlUsage;
  source: "worker" | "in-thread";
}

/** Insertion-ordered, and re-inserted on read, so the first key is the LRU. */
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<CacheEntry | null>>();
let queuedBuilds = 0;
/** Serializes builds. Resolved-or-rejected either way; a failure must not wedge it. */
let buildChain: Promise<unknown> = Promise.resolve();

/**
 * Stable key for a query. Field order is fixed by this function, not by the
 * object's insertion order, so two equivalent queries cannot land on two entries.
 */
export function situationsCacheKey(query: CanonicalSituationApiQuery): string {
  return JSON.stringify([
    query.league ?? "", query.sport ?? "", query.situationType ?? "",
    query.lifecycleState ?? "", query.activeOnly ? 1 : 0,
    query.orderBy ?? "", query.limit ?? "",
  ]);
}

function readCache(key: string): CacheEntry | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  cache.delete(key);
  cache.set(key, entry); // most-recently-used last
  return entry;
}

function writeCache(key: string, entry: CacheEntry): void {
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

/* ─── The worker ───────────────────────────────────────────────────────────── */

type Pending = {
  resolve: (value: { payload: SituationsPayload; usage: SqlUsage; buildMs: number }) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

let worker: Worker | null = null;
let workerBoot: Promise<Worker | null> | null = null;
let workerFailures = 0;
let workerGaveUp = false;
let warnedNoWorker = false;
const pending = new Map<number, Pending>();
let nextRequestId = 1;

/**
 * Where the built worker is. There is deliberately no TypeScript candidate:
 * `tsx` does not carry its loader into a worker thread ("Unknown file extension
 * .ts") and Node ignores a Worker execArgv that would add one — both measured —
 * so a `.ts` path would be a spawn failure on every dev boot rather than a
 * fallback. SITUATIONS_WORKER_PATH overrides, which is how the tests point at a
 * worker they built themselves.
 */
export function resolveSituationsWorkerPath(): string | null {
  const override = process.env.SITUATIONS_WORKER_PATH;
  if (override) return fs.existsSync(override) ? override : null;
  // Under vitest, only an explicit override spawns a worker. Otherwise whether a
  // test runs in-thread or in a worker would depend on whether someone had run
  // `npm run build` on that machine — and a worker does not see the test's
  // `vi.mock("../../storage")`, so the two paths are not interchangeable. The
  // offload suite sets the override and exercises the real artifact; everything
  // else stays in-thread, the same way in CI as on a laptop with a stale dist/.
  if (process.env.VITEST) return null;
  const built = path.resolve(process.cwd(), "dist", "situations-worker.cjs");
  return fs.existsSync(built) ? built : null;
}

/** True when a situations build will run off the main thread. */
export function situationsWorkerAvailable(): boolean {
  if (process.env.SITUATIONS_WORKER === "0" || workerGaveUp) return false;
  return resolveSituationsWorkerPath() !== null;
}

function failPending(error: Error): void {
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(error);
  }
  pending.clear();
}

function dropWorker(reason: string): void {
  const dying = worker;
  worker = null;
  workerBoot = null;
  failPending(new Error(`situations worker unavailable: ${reason}`));
  if (dying) void dying.terminate().catch(() => {});
}

function spawnWorker(): Promise<Worker | null> {
  const entry = resolveSituationsWorkerPath();
  if (!entry) return Promise.resolve(null);

  return new Promise<Worker | null>((resolve) => {
    let settled = false;
    const settle = (value: Worker | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    let next: Worker;
    try {
      next = new Worker(entry);
    } catch (e: any) {
      console.warn(`[situations-worker] spawn failed: ${e?.message ?? e}`);
      workerFailures++;
      settle(null);
      return;
    }
    next.unref(); // a pending build must never hold the process open

    // Booting opens a cold DB handle and runs the schema check. If that never
    // reports ready, treat the worker as unusable rather than waiting forever.
    const bootTimer = setTimeout(() => {
      console.warn(`[situations-worker] boot timed out after ${buildTimeoutMs()}ms`);
      workerFailures++;
      dropWorker("boot timeout");
      settle(null);
    }, buildTimeoutMs());
    bootTimer.unref();

    next.on("message", (message: SituationsWorkerMessage) => {
      if (message.kind === "ready") {
        clearTimeout(bootTimer);
        workerFailures = 0;
        console.log(`[situations-worker] ready in ${message.bootMs}ms (${entry})`);
        settle(next);
        return;
      }
      const p = pending.get(message.id);
      if (!p) return; // timed out already, or a reply to a recycled worker
      pending.delete(message.id);
      clearTimeout(p.timer);
      if (message.ok) p.resolve({ payload: message.payload, usage: message.usage, buildMs: message.buildMs });
      else p.reject(new Error(message.error));
    });

    next.on("error", (e) => {
      console.warn(`[situations-worker] error: ${e.message}`);
      clearTimeout(bootTimer);
      workerFailures++;
      dropWorker(e.message);
      settle(null);
    });

    next.on("exit", (code) => {
      clearTimeout(bootTimer);
      if (worker === next) {
        if (code !== 0) workerFailures++;
        dropWorker(`exited with code ${code}`);
      }
      settle(null);
    });

    worker = next;
  });
}

async function ensureWorker(): Promise<Worker | null> {
  if (process.env.SITUATIONS_WORKER === "0" || workerGaveUp) return null;
  if (worker && workerBoot) return workerBoot;
  if (!resolveSituationsWorkerPath()) {
    if (!warnedNoWorker) {
      warnedNoWorker = true;
      const expected = process.env.SITUATIONS_WORKER_PATH
        ? `SITUATIONS_WORKER_PATH=${process.env.SITUATIONS_WORKER_PATH}`
        : "dist/situations-worker.cjs";
      console.log(
        `[situations-worker] no worker at ${expected} — building situations ` +
        "in-thread (expected under npm run dev and vitest)",
      );
    }
    return null;
  }
  if (workerFailures >= MAX_WORKER_FAILURES) {
    workerGaveUp = true;
    console.warn(
      `[situations-worker] giving up after ${workerFailures} failures — ` +
      "serving situations in-thread, which can block the event loop",
    );
    return null;
  }
  workerBoot = spawnWorker();
  return workerBoot;
}

function buildInWorker(w: Worker, query: CanonicalSituationApiQuery) {
  return new Promise<{ payload: SituationsPayload; usage: SqlUsage; buildMs: number }>((resolve, reject) => {
    const id = nextRequestId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      // A synchronous better-sqlite3 call cannot be interrupted; terminating the
      // thread is the only way to stop it, and leaving it running would block
      // every later build behind it.
      workerFailures++;
      dropWorker(`build exceeded ${buildTimeoutMs()}ms`);
      const error = new Error(`situations build exceeded ${buildTimeoutMs()}ms`);
      error.name = BUILD_TIMEOUT; // never retried in-thread — see startBuild
      reject(error);
    }, buildTimeoutMs());
    timer.unref();
    pending.set(id, { resolve, reject, timer });
    try {
      w.postMessage({ id, query });
    } catch (e: any) {
      pending.delete(id);
      clearTimeout(timer);
      reject(new Error(String(e?.message ?? e)));
    }
  });
}

/**
 * The in-thread fallback: today's behaviour exactly, including its ability to
 * block the loop. Loaded lazily so requiring this module does not pull the whole
 * situations build graph into a process that only wants the cache.
 */
async function buildInThread(query: CanonicalSituationApiQuery) {
  const { buildSituationsPayload } = await import("./situations-worker");
  return buildSituationsPayload(query);
}

/* ─── Build scheduling ─────────────────────────────────────────────────────── */

function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = buildChain.then(fn, fn);
  buildChain = run.then(() => undefined, () => undefined);
  return run;
}

/**
 * Build one payload for `key`.
 *
 * `blocking` says whether a request is waiting on this build with nothing to
 * serve, and it decides the one dangerous question here: may this fall back to an
 * in-thread build if the worker fails?
 *
 *   blocking (a cold request)  — yes. The alternative is answering empty to a
 *     visitor who gets one shot, and an in-thread build is exactly what shipped
 *     before this change, so it is no worse than the status quo.
 *   background (a stale revalidate) — NO. There is already a good payload to
 *     serve, so nothing is gained, and the cost is a 20s+ synchronous block
 *     arriving out of nowhere on a request that was answered instantly. An
 *     earlier version of this file did fall back here, and the stale-rebuild test
 *     caught it: killing the worker mid-rebuild put the whole build back on the
 *     main thread, which is the failure this entire PR exists to prevent.
 *
 * A build that failed by TIMEOUT never falls back, blocking or not. A build that
 * just took longer than 30s in the worker is the last thing to re-run on the
 * thread answering health checks.
 */
async function startBuild(
  key: string,
  query: CanonicalSituationApiQuery,
  blocking: boolean,
): Promise<CacheEntry | null> {
  const existing = inFlight.get(key);
  if (existing) return existing;
  if (queuedBuilds >= MAX_QUEUED_BUILDS) return null;

  queuedBuilds++;
  const run = (async (): Promise<CacheEntry | null> => {
    try {
      return await exclusive(async () => {
        const w = await ensureWorker();
        let built: { payload: SituationsPayload; usage: SqlUsage; buildMs: number };
        let source: CacheEntry["source"] = "worker";
        if (w) {
          try {
            built = await buildInWorker(w, query);
          } catch (e: any) {
            const timedOut = e?.name === BUILD_TIMEOUT;
            if (timedOut || !blocking) {
              // Nothing to fall back to that is better than what the caller
              // already has. Let it through; getSituationsPayload answers from
              // the stale copy, or `timeout` if there is none.
              throw e;
            }
            console.warn(`[situations-worker] build failed, falling back in-thread: ${e?.message ?? e}`);
            built = await buildInThread(query);
            source = "in-thread";
          }
        } else {
          // No worker at all — the dev and vitest path. In-thread is not a
          // fallback here, it is the only implementation, so a background
          // revalidate uses it too or the cache would never refresh.
          built = await buildInThread(query);
          source = "in-thread";
        }
        const entry: CacheEntry = {
          payload: built.payload,
          builtAt: Date.now(),
          usage: { ...built.usage, origin: source },
          source,
        };
        writeCache(key, entry);
        return entry;
      });
    } catch (e: any) {
      console.warn(`[situations-cache] build failed: ${e?.message ?? e}`);
      return null;
    } finally {
      queuedBuilds--;
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, run);
  return run;
}

function resultFor(entry: CacheEntry, state: SituationsCacheState, now: number): SituationsResult {
  const ageMs = Math.max(0, now - entry.builtAt);
  return {
    payload: entry.payload,
    state,
    ageMs,
    usage: { ...entry.usage, origin: `${entry.source},${state},age=${(ageMs / 1000).toFixed(1)}s` },
  };
}

/**
 * The route's entry point. Never throws, never blocks the loop for longer than
 * the in-thread fallback would, and always answers with a valid payload shape.
 */
export async function getSituationsPayload(query: CanonicalSituationApiQuery): Promise<SituationsResult> {
  const key = situationsCacheKey(query);
  const cached = readCache(key);
  const now = Date.now();

  if (cached) {
    const ageMs = now - cached.builtAt;
    if (ageMs < ttlMs()) return resultFor(cached, "fresh", now);
    // Stale: answer from the stale copy and rebuild behind it. Deliberately not
    // awaited — and the rejection is swallowed, because a failed background
    // rebuild must not become an unhandled rejection on a request that succeeded.
    void startBuild(key, query, false).catch(() => undefined);
    return resultFor(cached, "stale", now);
  }

  const wait = coldWaitMs();
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), wait);
    timer.unref();
  });
  try {
    // The build is not cancelled when the deadline wins: it keeps running and
    // populates the cache, so the next request is a hit rather than another wait.
    const built = await Promise.race([startBuild(key, query, true), deadline]);
    if (built) return resultFor(built, "cold", Date.now());
  } finally {
    if (timer) clearTimeout(timer);
  }
  return { payload: EMPTY_PAYLOAD, state: "timeout", ageMs: 0 };
}

/* ─── Boot warm-up ─────────────────────────────────────────────────────────── */

/**
 * Exactly the query shapes the client asks for, so a warm-up actually lands on
 * the keys real requests will read.
 *
 * Taken from client/src/lib/situationsApi.ts and the pages that call it: the four
 * league boards send `limit=100&orderBy=operational_visibility_score` with their
 * league and no activeOnly (all four pass `poll: false`), FlagshipHome sends
 * `limit=15`, and the story page's /:id route builds `limit=500`. A shape that
 * differs in any field is a different cache key and the warm-up would be wasted
 * work, which is why these are written out rather than guessed at.
 */
export const WARMUP_SHAPES: readonly CanonicalSituationApiQuery[] = [
  { limit: 15, activeOnly: false, orderBy: "operational_visibility_score" },
  { league: "NFL", limit: 100, activeOnly: false, orderBy: "operational_visibility_score" },
  { league: "NBA", limit: 100, activeOnly: false, orderBy: "operational_visibility_score" },
  { league: "MLB", limit: 100, activeOnly: false, orderBy: "operational_visibility_score" },
  { league: "CFB", limit: 100, activeOnly: false, orderBy: "operational_visibility_score" },
  { limit: 500 },
];

/**
 * Build each shape once, in sequence, so the first visitor after a deploy gets a
 * cache hit instead of a cold build.
 *
 * SEQUENTIALLY, and this is the whole design of it. Firing all six at once would
 * put six builds in a queue bounded at MAX_QUEUED_BUILDS, and a real request
 * arriving during the warm-up would find the queue full and be answered EMPTY —
 * the warm-up would have caused the thing it exists to prevent. One at a time
 * leaves room in the queue, and a real request for a shape already being warmed
 * joins that build rather than adding one.
 *
 * Returns the number of shapes that ended up cached, for the boot log.
 */
export async function warmSituationsCache(
  shapes: readonly CanonicalSituationApiQuery[] = WARMUP_SHAPES,
): Promise<number> {
  let warmed = 0;
  for (const shape of shapes) {
    const key = situationsCacheKey(shape);
    if (cache.has(key)) { warmed++; continue; }
    const entry = await startBuild(key, shape, false).catch(() => null);
    if (entry) warmed++;
  }
  return warmed;
}

/**
 * Schedule the warm-up for after listen. SITUATIONS_WARMUP=0 disables it.
 *
 * Deferred past the health check and past the DB-shape report, and last on the
 * boot ladder relative to nothing — it runs in the worker, so unlike every other
 * entry on that ladder it does not compete for the event loop. Without a worker
 * (dev, vitest) it would build in-thread and block, so it is skipped there: a
 * warm-up is an optimisation, and an optimisation that blocks the loop for a
 * minute at boot is not one.
 */
export function scheduleSituationsWarmup(): void {
  if (process.env.SITUATIONS_WARMUP === "0") return;
  if (!situationsWorkerAvailable()) {
    console.log("[situations-cache] warm-up skipped: no worker, and warming in-thread would block the loop");
    return;
  }
  const raw = Number(process.env.SITUATIONS_WARMUP_DELAY_MS);
  const delay = Number.isFinite(raw) && raw >= 0 ? Math.min(600_000, Math.round(raw)) : 12_000;
  const timer = setTimeout(() => {
    const started = Date.now();
    void warmSituationsCache()
      .then((warmed) => console.log(
        `[situations-cache] warm-up cached ${warmed}/${WARMUP_SHAPES.length} shapes in ${Date.now() - started}ms`,
      ))
      .catch((e: any) => console.warn(`[situations-cache] warm-up failed: ${e?.message ?? e}`));
  }, delay);
  timer.unref();
}

/* ─── Test and ops surface ─────────────────────────────────────────────────── */

/** Drop every cached payload. Does not touch the worker. */
export function resetSituationsCache(): void {
  cache.clear();
  inFlight.clear();
}

/** Stop the worker and forget it. Safe to call when there is none. */
export async function shutdownSituationsWorker(): Promise<void> {
  const dying = worker;
  worker = null;
  workerBoot = null;
  workerFailures = 0;
  workerGaveUp = false;
  warnedNoWorker = false;
  failPending(new Error("situations worker shut down"));
  if (dying) await dying.terminate().catch(() => {});
}

/** For tests and the admin surface: what the cache currently holds. */
export function situationsCacheStats(): {
  entries: number;
  queuedBuilds: number;
  workerAvailable: boolean;
  workerPath: string | null;
} {
  return {
    entries: cache.size,
    queuedBuilds,
    workerAvailable: situationsWorkerAvailable(),
    workerPath: resolveSituationsWorkerPath(),
  };
}
