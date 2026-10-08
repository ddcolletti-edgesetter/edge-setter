// @vitest-environment node
import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * A boot warm-up build gets its own, longer timeout than a request build.
 *
 * PROD, 2026-10-08 05:20 UTC (the boot after #82): two warm-up builds were
 * terminated at SITUATIONS_BUILD_TIMEOUT_MS (30s) with "over 25s" and "over 29s"
 * in flight on getCleanFoundingSituationConfidences — the statement #82's
 * in-flight logging was added to name. The third build of the same warm-up ran
 * in 3.9s. Nothing was wrong with the worker: the first two attempts were
 * reading a cold 5GB file and were killed just short of finishing, and all they
 * left behind was a warmed page cache for the attempt that completed. Three cold
 * reads, one kept result.
 *
 * TWO THINGS ARE ASSERTED, and the second is the one with teeth.
 *
 *  1. THE WARM-UP USES ITS OWN BUDGET. With a build slower than the request
 *     budget but faster than the warm-up budget, a warm-up build completes and
 *     caches while a request build on the same worker is killed and caches
 *     nothing. That is the prod behaviour this change exists to fix.
 *
 *  2. NO NUMBER OF BUILD TIMEOUTS MOVES BUILDS ONTO THE MAIN THREAD. The
 *     give-up guard (MAX_WORKER_FAILURES, 3) falls back to building in-thread,
 *     which for this endpoint is the failure #81 exists to prevent. Six timeouts
 *     — twice the guard — must leave the worker in use, and this asserts it for
 *     the warm-up path AND for the request path, because the reason is the same
 *     for both and it is not obvious: dropWorker kills the thread, the next
 *     build spawns a replacement, and the "ready" handler resets the failure
 *     count to 0. The counter only accumulates across spawn/boot failures.
 *
 *     This test exists because the first draft of the change it guards assumed
 *     the opposite — that warm-up timeouts were accumulating towards the guard,
 *     and that they needed exempting. They were not, and they did not. If
 *     someone later removes the reset, these two cases fail and say so.
 *
 * The stub worker is plain JS with no better-sqlite3 and no DB: this suite is
 * about timeout accounting, not about the build. It burns synchronously in a
 * while loop, which is uninterruptible in exactly the way a better-sqlite3 call
 * is, and only for the shapes that ask for it — so the same stub serves both the
 * slow builds and the fast one that proves the worker is still being used.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-warmup-timeout-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;
process.env.DATA_DIR = TMP_DIR;
// A cold request must give up quickly here; the build it started keeps running.
process.env.SITUATIONS_COLD_WAIT_MS = "300";

/**
 * Longer than the short budgets below, shorter than the long one. Comfortably
 * over envInt's 1,000ms floor for both timeout knobs, so "short" is a budget the
 * clamp actually honours rather than one it silently raises.
 */
const SLOW_BUILD_MS = 2_500;
/** The floor envInt enforces on both budgets, and the short budget in each test. */
const SHORT_BUDGET_MS = 1_000;
/** MAX_WORKER_FAILURES in situations-cache.ts is 3; six timeouts is twice that. */
const TIMEOUT_ATTEMPTS = 6;

const CACHE_DIR = path.resolve(process.cwd(), "node_modules", ".cache", "edge-setter-tests");
const STUB_WORKER = path.join(CACHE_DIR, "warmup-timeout-worker.cjs");

vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
  storage: { upsertSourceScore: vi.fn() },
  insertSettledOutcome: vi.fn(),
  getSettledOutcomesForAccuracy: vi.fn(() => []),
}));

let cache: typeof import("../situations-cache");

const envBefore = {
  build: process.env.SITUATIONS_BUILD_TIMEOUT_MS,
  warmup: process.env.SITUATIONS_WARMUP_BUILD_TIMEOUT_MS,
  workerPath: process.env.SITUATIONS_WORKER_PATH,
};

beforeAll(async () => {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(STUB_WORKER, `
const { parentPort } = require("worker_threads");
parentPort.postMessage({ kind: "ready", bootMs: 0 });
parentPort.on("message", (msg) => {
  // Only the shapes that ask for it burn, so one stub covers both halves of
  // every test: the slow builds that must time out, and the fast build that
  // proves the worker is still the one answering.
  if ((msg.query || {}).league === "SLOW") {
    const deadline = Date.now() + ${SLOW_BUILD_MS};
    while (Date.now() < deadline) { /* uninterruptible, like a SQLite call */ }
  }
  parentPort.postMessage({
    kind: "result", id: msg.id, ok: true,
    payload: { count: 0, situations: [] },
    usage: { statements: 0, ms: 0, slowest: [], route: "warmup-timeout-stub" },
    buildMs: 0,
  });
});
`);
  process.env.SITUATIONS_WORKER_PATH = STUB_WORKER;
  cache = await import("../situations-cache");
});

afterEach(async () => {
  // Resets workerFailures and workerGaveUp, so each test starts from a worker
  // that has not failed yet.
  await cache.shutdownSituationsWorker();
  cache.resetSituationsCache();
});

afterAll(() => {
  for (const [key, value] of [
    ["SITUATIONS_BUILD_TIMEOUT_MS", envBefore.build],
    ["SITUATIONS_WARMUP_BUILD_TIMEOUT_MS", envBefore.warmup],
    ["SITUATIONS_WORKER_PATH", envBefore.workerPath],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  // TMP_DIR is deliberately left behind: the store's handle is still open and
  // Windows refuses the unlink (EBUSY), which would fail the suite in teardown.
});

const slowShape = (limit: number) => ({ league: "SLOW", limit });
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("warm-up build timeout", () => {
  it("completes a build the request budget would have killed", async () => {
    process.env.SITUATIONS_BUILD_TIMEOUT_MS = String(SHORT_BUDGET_MS);  // < SLOW_BUILD_MS
    process.env.SITUATIONS_WARMUP_BUILD_TIMEOUT_MS = "8000";            // > SLOW_BUILD_MS

    // The warm-up build survives its 1.5s and lands in the cache.
    const warmed = await cache.warmSituationsCache([slowShape(1)]);
    expect(warmed).toBe(1);

    const hit = await cache.getSituationsPayload(slowShape(1));
    expect(hit.state).toBe("fresh");
    // origin is "<source>,<state>,age=…"; the source is the half that matters.
    expect(hit.usage?.origin).toMatch(/^worker,/);

    // The same build on the request path is killed at 500ms and caches nothing.
    const entriesBefore = cache.situationsCacheStats().entries;
    const miss = await cache.getSituationsPayload(slowShape(2));
    expect(miss.state).toBe("timeout");

    // Long enough for the killed build to have finished had it survived.
    await sleep(SLOW_BUILD_MS + 500);
    expect(cache.situationsCacheStats().entries).toBe(entriesBefore);
  }, 30_000);

  it("keeps the worker after six warm-up timeouts", async () => {
    process.env.SITUATIONS_BUILD_TIMEOUT_MS = "8000";                   // boot gets this too
    process.env.SITUATIONS_WARMUP_BUILD_TIMEOUT_MS = String(SHORT_BUDGET_MS); // < SLOW_BUILD_MS

    const shapes = Array.from({ length: TIMEOUT_ATTEMPTS }, (_, i) => slowShape(100 + i));
    expect(await cache.warmSituationsCache(shapes)).toBe(0);

    // Twice MAX_WORKER_FAILURES of timeouts, and the worker is still the thing
    // that builds. If this ever fails, situations builds have moved onto the
    // main thread and the next cold one takes the instance down.
    expect(cache.situationsWorkerAvailable()).toBe(true);
    expect(cache.situationsCacheStats().workerAvailable).toBe(true);

    const fast = await cache.getSituationsPayload({ league: "FAST", limit: 1 });
    expect(fast.state).toBe("cold");
    expect(fast.usage?.origin).toMatch(/^worker,/);
    expect(fast.usage?.origin).not.toMatch(/in-thread/);
  }, 30_000);

  it("keeps the worker after the same number of REQUEST timeouts, for the same reason", async () => {
    process.env.SITUATIONS_BUILD_TIMEOUT_MS = String(SHORT_BUDGET_MS);  // < SLOW_BUILD_MS
    process.env.SITUATIONS_WARMUP_BUILD_TIMEOUT_MS = "8000";

    let timedOut = 0;
    for (let i = 0; i < TIMEOUT_ATTEMPTS; i++) {
      const result = await cache.getSituationsPayload(slowShape(200 + i));
      if (result.state === "timeout") timedOut++;
      // The request path gives up at the cold wait (300ms), while the kill does
      // not happen until the budget elapses. Wait past both, so each attempt is
      // one completed timeout rather than a build still queued behind the last
      // one on the build mutex.
      await sleep(SHORT_BUDGET_MS + 800);
    }
    // Proves the attempts were killed builds rather than a worker that never
    // booted — otherwise this would pass by failing for another reason.
    expect(timedOut).toBeGreaterThanOrEqual(3);

    // Same conclusion as the warm-up case: the counter was reset by each
    // respawn, so the guard was never approached. The budget is the only thing
    // that differs between the two paths — which is exactly what this change
    // changed, and all it changed.
    expect(cache.situationsWorkerAvailable()).toBe(true);

    // And the next build still goes to a worker, not in-thread.
    const fast = await cache.getSituationsPayload({ league: "FAST", limit: 2 });
    expect(fast.usage?.origin).toMatch(/^worker,/);
  }, 60_000);

  it("falls back to the default budgets when the env vars are absent or junk", async () => {
    // Nothing to assert against the private getters directly; what is observable
    // is that a junk value does not become the budget. 1.5s builds must survive
    // a warm-up whose budget has fallen back to the 120s default.
    delete process.env.SITUATIONS_BUILD_TIMEOUT_MS;
    process.env.SITUATIONS_WARMUP_BUILD_TIMEOUT_MS = "not-a-number";
    expect(await cache.warmSituationsCache([slowShape(300)])).toBe(1);
  }, 30_000);
});
