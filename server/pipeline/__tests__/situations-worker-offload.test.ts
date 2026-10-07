// @vitest-environment node
import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import type BetterSqlite3 from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * GET /api/v2/situations must not block the event loop, however slow it is.
 *
 * PROD, 2026-10-07 02:19:31 UTC: a cold GET /api/v2/situations ran ~44s and
 * Render killed the instance (server_failed, "HTTP health check failed"). A
 * second, warm request on the same instance still took 22,669ms for 130
 * statements. #51, #78 and #80 each made this endpoint do less work; none of them
 * changed the fact that the work is one uninterruptible synchronous span, because
 * better-sqlite3 is synchronous. A span is a span: /healthz does not run during
 * it, no matter how short we make it, so a bad enough day always kills the box.
 *
 * WHAT THIS SUITE ASSERTS, IN THE ORDER IT MATTERS
 *
 *  1. THE LOOP STAYS FREE. A build that takes seconds — a real synchronous SQL
 *     statement burning real CPU inside the worker — must not produce a single
 *     main-thread span over MAX_SPAN_MS. Paired with a CONTROL that runs the same
 *     burn in-thread and asserts it DOES block, so a measurement that could not
 *     detect blocking cannot pass this test by measuring nothing.
 *
 *  2. THE PAYLOAD IS IDENTICAL. The worker path is deep-equal to the in-thread
 *     path on the same fixture, replayHash and corpus hashes included. A faster
 *     endpoint that returns different bytes is not this endpoint.
 *
 *  3. THE CACHE STATES ARE WHAT THE ROUTE PROMISES. fresh / stale / cold /
 *     timeout, one rebuild at a time, and a bounded number of cached shapes.
 *
 * THE WORKER UNDER TEST IS THE BUILT ARTIFACT. `tsx` does not carry its loader
 * into a worker thread and Node ignores a Worker execArgv that would add one
 * (both measured), so a .ts worker cannot be spawned under vitest any more than
 * under `npm run dev`. Rather than test a mock, this suite compiles
 * server/pipeline/situations-worker.ts with esbuild exactly as script/build.mjs
 * does and spawns THAT — the same artifact shape prod runs. It is written under
 * node_modules/.cache (gitignored, and inside the tree so the worker's
 * `require("better-sqlite3")` still resolves).
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-sit-worker-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;
process.env.DATA_DIR = TMP_DIR;

// 5ms sampling, as in boot-cycle-loop-lag.test.ts: fine enough to resolve a 300ms
// budget, and the same monitor code that runs in production.
process.env.LOOP_SAMPLE_MS = "5";
process.env.LOOP_ATTRIBUTE_MS = "10";
process.env.LOOP_WARN_MS = "5000";

/** The budget. One span this long still leaves 4.7s of Render's 5s health check. */
const MAX_SPAN_MS = 300;
/** How long the deliberately slow build burns, in the worker and in the control. */
const SLOW_BUILD_MS = 1_500;

const CACHE_DIR = path.resolve(process.cwd(), "node_modules", ".cache", "edge-setter-tests");
const REAL_WORKER = path.join(CACHE_DIR, "situations-worker.cjs");
const SLOW_WORKER = path.join(CACHE_DIR, "slow-situations-worker.cjs");

vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
  storage: { upsertSourceScore: vi.fn() },
  insertSettledOutcome: vi.fn(),
  getSettledOutcomesForAccuracy: vi.fn(() => []),
}));

let store: typeof import("../store");
let sitStore: typeof import("../situations-store");
let sitApi: typeof import("../situations-api");
let cache: typeof import("../situations-cache");
let workerModule: typeof import("../situations-worker");
let monitor: typeof import("../../event-loop-monitor");
let db: BetterSqlite3.Database;

/* ─── Fixture ─────────────────────────────────────────────── */

const N_GAMES = 60;
const N_SITUATIONS = 40;
const EVENTS_PER_SITUATION = 4;
const SNAPSHOTS_PER_SITUATION = 2;

const LEAGUES = ["NFL", "NBA", "MLB", "CFB"];
const SIT_TYPES = ["injury_status", "roster_move", "market_move", "lineup_watch"];
const STATES = ["watching", "emerging", "developing", "escalating", "confirmed", "official"];
const iso = (minutes: number) => new Date(Date.UTC(2026, 9, 1) + minutes * 60_000).toISOString();

function seed(target: BetterSqlite3.Database): void {
  target.transaction(() => {
    const game = target.prepare(`
      INSERT INTO games (id, league, home_team, away_team, game_time, status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?)
    `);
    for (let i = 0; i < N_GAMES; i++) {
      // Half in the future, so listCanonicalSituations' game_time filter keeps a
      // realistic share rather than everything or nothing.
      const future = i % 2 === 0;
      game.run(`g${i}`, LEAGUES[i % 4], `H${i % 12}`, `A${i % 11}`,
        new Date(Date.now() + (future ? 1 : -1) * (1 + (i % 200)) * 3_600_000).toISOString(),
        future ? "scheduled" : "final", iso(i), iso(i));
    }

    const situation = target.prepare(`
      INSERT INTO situations
        (situation_id, canonical_hash, sport, league, game_id, teams_json, players_json,
         situation_type, semantic_fingerprint, created_from_event_id, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `);
    const event = target.prepare(`
      INSERT INTO situation_events
        (event_id, situation_id, kind, raw_event_id, normalized_event_id, source_id,
         observed_at, recorded_at, replay_hash, lineage_hash, payload_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `);
    const snapshot = target.prepare(`
      INSERT INTO situation_snapshots
        (snapshot_id, situation_id, lifecycle_state, confidence_score, confidence_json,
         summary, escalation_score, timing_pressure, evidence_event_ids_json,
         replay_hash, previous_snapshot_hash, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const stateHistory = target.prepare(`
      INSERT INTO situation_state_history
        (history_id, situation_id, previous_state, new_state, transition_reason,
         trigger_event_id, metadata_json, replay_hash, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);
    const confHistory = target.prepare(`
      INSERT INTO situation_confidence_history
        (history_id, situation_id, previous_confidence, new_confidence,
         factor_breakdown_json, reasoning_json, event_id, replay_hash, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);

    for (let i = 0; i < N_SITUATIONS; i++) {
      const id = `sit_${i}`;
      situation.run(id, `chash_${i}`, "football", LEAGUES[i % 4], `g${i % N_GAMES}`,
        JSON.stringify([`H${i % 12}`]), JSON.stringify([`Player ${i}`]),
        SIT_TYPES[i % SIT_TYPES.length], `fp_${i}`, `ev_${i}_0`, iso(i));

      for (let e = 0; e < EVENTS_PER_SITUATION; e++) {
        event.run(`ev_${i}_${e}`, id, e === 0 ? "situation_created" : "evidence_added",
          `raw_${i}_${e}`, `norm_${i}_${e}`, `src_${e % 5}`,
          iso(i + e), iso(i + e), `rh_${i}_${e}`, `lh_${i}_${e}`,
          JSON.stringify({ signal_id: `sig_${i}_${e}`, designation: "Questionable" }));
      }
      for (let s = 0; s < SNAPSHOTS_PER_SITUATION; s++) {
        snapshot.run(`snap_${i}_${s}`, id, STATES[(i + s) % STATES.length], 40 + ((i * 7 + s * 11) % 55),
          JSON.stringify({
            score: 40 + ((i * 7 + s * 11) % 55),
            factors: { official_confirmation: s, contradiction_penalty: 0 },
            explanation: { why_increased: ["more sources"], why_not_higher: ["no official word"] },
          }),
          `Summary for ${id} snapshot ${s}`, (i * 3 + s) % 100, s === 0 ? "routine" : "urgent",
          JSON.stringify([`ev_${i}_0`]), `snaprh_${i}_${s}`, s === 0 ? null : `snaprh_${i}_${s - 1}`,
          iso(i + s * 10));
      }
      stateHistory.run(`sh_${i}`, id, "watching", STATES[i % STATES.length],
        "evidence threshold", `ev_${i}_1`, JSON.stringify({}), `shrh_${i}`, iso(i + 1));
      confHistory.run(`ch_${i}`, id, 40, 55,
        JSON.stringify({ source_count: 2 }), JSON.stringify(["second source"]),
        `ev_${i}_1`, `chrh_${i}`, iso(i + 2));
    }
  })();
}

/* ─── Worker artifacts ────────────────────────────────────── */

/**
 * Compile the real worker the way script/build.mjs does.
 *
 * `packages: "external"` leaves every node_modules import to runtime require,
 * which is why the output has to live inside the repo tree: better-sqlite3 is a
 * native module and cannot be bundled.
 */
async function buildRealWorker(): Promise<void> {
  const { build } = await import("esbuild");
  await build({
    entryPoints: [path.resolve(process.cwd(), "server", "pipeline", "situations-worker.ts")],
    outfile: REAL_WORKER,
    platform: "node",
    format: "cjs",
    bundle: true,
    packages: "external",
    alias: { "@shared": path.resolve(process.cwd(), "shared") },
    logLevel: "silent",
  });
}

/**
 * A worker that speaks the real protocol but spends SLOW_BUILD_MS inside one
 * synchronous better-sqlite3 call before answering.
 *
 * Why a stub and not a knob in the real worker: the thing under test here is the
 * contract between the main thread and ANY slow worker — that the main thread
 * stays free while one runs. A test-only env branch inside situations-worker.ts
 * would put test code in the production build to measure something that is not
 * about the production build at all. The burn is a recursive CTE, so it is a real
 * uninterruptible SQL statement of the exact kind prod is suffering from, not a
 * busy loop pretending to be one.
 */
function writeSlowWorker(): void {
  fs.writeFileSync(SLOW_WORKER, `
const { parentPort } = require("worker_threads");
const Database = require("better-sqlite3");
const db = new Database(":memory:");
parentPort.postMessage({ kind: "ready", bootMs: 0 });
parentPort.on("message", (msg) => {
  const deadline = Date.now() + ${SLOW_BUILD_MS};
  let rows = 200_000; // ~40ms each, so the burn lands close to its budget
  // One synchronous statement at a time until the budget is spent. Each is
  // uninterruptible, exactly like the statements this endpoint runs on prod.
  while (Date.now() < deadline) {
    db.prepare("WITH RECURSIVE burn(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM burn WHERE i < " + rows + ") SELECT count(*) AS c FROM burn").get();
  }
  parentPort.postMessage({
    kind: "result", id: msg.id, ok: true,
    payload: { count: 0, situations: [] },
    usage: { statements: 1, ms: ${SLOW_BUILD_MS}, slowest: [], route: "slow-stub" },
    buildMs: ${SLOW_BUILD_MS},
  });
});
`);
}

/** The same burn, on the main thread. The control for the loop-lag assertion. */
function burnInThread(ms: number): void {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    db.prepare(
      "WITH RECURSIVE burn(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM burn WHERE i < 200000) SELECT count(*) AS c FROM burn",
    ).get();
  }
}

beforeAll(async () => {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  store = await import("../store");
  sitStore = await import("../situations-store");
  sitApi = await import("../situations-api");
  cache = await import("../situations-cache");
  workerModule = await import("../situations-worker");
  monitor = await import("../../event-loop-monitor");
  db = store.getPipelineDb();
  sitStore.ensureSituationSchema(db);
  seed(db);
  writeSlowWorker();
  await buildRealWorker();
  monitor.startEventLoopMonitor();
}, 120_000);

afterAll(async () => {
  await cache.shutdownSituationsWorker();
});

/** Run `work` with the worker path pointed at `workerPath`. */
async function withWorker<T>(workerPath: string, work: () => Promise<T>): Promise<T> {
  const previous = process.env.SITUATIONS_WORKER_PATH;
  process.env.SITUATIONS_WORKER_PATH = workerPath;
  await cache.shutdownSituationsWorker();
  cache.resetSituationsCache();
  try {
    return await work();
  } finally {
    await cache.shutdownSituationsWorker();
    cache.resetSituationsCache();
    if (previous === undefined) delete process.env.SITUATIONS_WORKER_PATH;
    else process.env.SITUATIONS_WORKER_PATH = previous;
  }
}

/** Max single main-thread span, and how many 1ms ticks got through, during `work`. */
async function measureLoop<T>(work: () => Promise<T>): Promise<{ value: T; maxSpanMs: number; ticks: number }> {
  monitor.resetStepStats();
  let ticks = 0;
  const ticker = setInterval(() => { ticks++; }, 1);
  try {
    const value = await work();
    // Let one more sampler tick land, so a span that ended with the work is
    // charged before it is read (the one-tick-late mechanic in the monitor).
    await new Promise((r) => setTimeout(r, 30));
    return { value, maxSpanMs: monitor.getMaxObservedBlockMs(), ticks };
  } finally {
    clearInterval(ticker);
  }
}

describe("situations build, off the main thread", () => {
  describe("the event loop stays free", () => {
    it(`CONTROL: the same burn in-thread blocks well over ${MAX_SPAN_MS}ms`, async () => {
      // Without this, a measureLoop that silently measured nothing would let the
      // worker test below pass for the wrong reason.
      const measured = await measureLoop(async () => burnInThread(SLOW_BUILD_MS));
      console.log(`[measured] CONTROL in-thread burn: maxSpan=${measured.maxSpanMs}ms ticks=${measured.ticks}`);
      expect(measured.maxSpanMs).toBeGreaterThan(MAX_SPAN_MS);
    }, 60_000);

    it(`a ${SLOW_BUILD_MS}ms build in the worker never blocks the loop past ${MAX_SPAN_MS}ms`, async () => {
      const measured = await withWorker(SLOW_WORKER, () =>
        measureLoop(() => cache.getSituationsPayload({ league: "NFL", limit: 100 })));

      console.log(
        `[measured] worker build: state=${measured.value.state} ` +
        `maxSpan=${measured.maxSpanMs}ms ticks=${measured.ticks} (1ms timer)`,
      );
      // The build finished inside the cold wait, so the request was answered with
      // real data — and the loop never stalled while it happened.
      expect(measured.value.state).toBe("cold");
      expect(measured.maxSpanMs).toBeLessThan(MAX_SPAN_MS);
      // The loop was not merely unblocked, it was running: a 1ms timer got
      // hundreds of turns during a 1.5s build.
      expect(measured.ticks).toBeGreaterThan(100);
    }, 60_000);

    it("a stale rebuild never blocks the loop either", async () => {
      await withWorker(SLOW_WORKER, async () => {
        process.env.SITUATIONS_CACHE_TTL_MS = "0"; // everything is immediately stale
        try {
          const first = await cache.getSituationsPayload({ league: "NFL", limit: 100 });
          expect(first.state).toBe("cold");

          // Second request: served from the stale copy at once, rebuild behind it.
          const measured = await measureLoop(async () => {
            const started = Date.now();
            const result = await cache.getSituationsPayload({ league: "NFL", limit: 100 });
            return { result, waitedMs: Date.now() - started };
          });
          console.log(
            `[measured] stale serve: state=${measured.value.result.state} ` +
            `waited=${measured.value.waitedMs}ms maxSpan=${measured.maxSpanMs}ms`,
          );
          expect(measured.value.result.state).toBe("stale");
          // The whole point: answered without waiting for the 1.5s rebuild.
          expect(measured.value.waitedMs).toBeLessThan(MAX_SPAN_MS);
          expect(measured.maxSpanMs).toBeLessThan(MAX_SPAN_MS);
        } finally {
          delete process.env.SITUATIONS_CACHE_TTL_MS;
        }
      });
    }, 60_000);

    it("never moves a failed background rebuild onto the main thread", async () => {
      // The bug this pins: if a background (stale) rebuild falls back in-thread
      // when the worker dies, killing the worker converts a request that was
      // already answered instantly into a 20s+ synchronous block out of nowhere —
      // the exact failure this whole change exists to prevent. A cold request may
      // fall back (it has nothing to serve and that is the old behaviour); a
      // background one may not.
      await withWorker(SLOW_WORKER, async () => {
        const query = { league: "MLB", limit: 100 } as const;
        const first = await cache.getSituationsPayload(query);
        expect(first.state).toBe("cold");

        process.env.SITUATIONS_CACHE_TTL_MS = "0";
        try {
          const stale = await cache.getSituationsPayload(query);
          expect(stale.state).toBe("stale");

          // Kill the worker under the in-flight background rebuild, then watch the
          // main thread. An in-thread fallback would show up as a span; nothing
          // else here can produce one.
          const measured = await measureLoop(async () => {
            await cache.shutdownSituationsWorker();
            await new Promise((r) => setTimeout(r, SLOW_BUILD_MS + 300));
          });
          console.log(`[measured] killed background rebuild: maxSpan=${measured.maxSpanMs}ms`);
          expect(measured.maxSpanMs).toBeLessThan(MAX_SPAN_MS);

          // And the stale payload is still being served, unchanged.
          const after = await cache.getSituationsPayload(query);
          expect(after.payload).toBe(first.payload);
        } finally {
          delete process.env.SITUATIONS_CACHE_TTL_MS;
        }
      });
    }, 60_000);

    it("answers an empty payload rather than waiting past the cold bound", async () => {
      await withWorker(SLOW_WORKER, async () => {
        process.env.SITUATIONS_COLD_WAIT_MS = "200"; // well under the 1.5s build
        try {
          const started = Date.now();
          const result = await cache.getSituationsPayload({ league: "NBA", limit: 100 });
          const waitedMs = Date.now() - started;
          console.log(`[measured] cold timeout: state=${result.state} waited=${waitedMs}ms`);
          expect(result.state).toBe("timeout");
          expect(result.payload).toEqual({ count: 0, situations: [] });
          expect(waitedMs).toBeLessThan(1_000);

          // The abandoned build was NOT cancelled — it populates the cache, so the
          // next request is a hit rather than another timeout.
          //
          // Polled, not slept: the stub's burn overshoots its budget by up to one
          // statement, so a fixed sleep is a race. An earlier version slept
          // SLOW_BUILD_MS + 500 and failed when a single recursive CTE took 500ms.
          let second = await cache.getSituationsPayload({ league: "NBA", limit: 100 });
          const giveUpAt = Date.now() + 15_000;
          while (second.state !== "fresh" && Date.now() < giveUpAt) {
            await new Promise((r) => setTimeout(r, 100));
            second = await cache.getSituationsPayload({ league: "NBA", limit: 100 });
          }
          expect(second.state).toBe("fresh");
        } finally {
          delete process.env.SITUATIONS_COLD_WAIT_MS;
        }
      });
    }, 60_000);
  });

  describe("the payload is identical to the in-thread build", () => {
    it("deep-equals the in-thread build, replay hashes and all", async () => {
      const query = { league: "NFL", limit: 100 } as const;
      const inThread = workerModule.buildSituationsPayload(query).payload;

      const fromWorker = await withWorker(REAL_WORKER, async () => {
        const result = await cache.getSituationsPayload(query);
        expect(result.state).toBe("cold"); // actually built, not served from cache
        return result;
      });

      expect(fromWorker.payload.count).toBe(inThread.count);
      expect(fromWorker.payload.count).toBeGreaterThan(0); // the fixture must deliver rows
      // Deep-equal over the whole body. The corpus records are canonically hashed,
      // so this is simultaneously the replay-hash guarantee.
      expect(fromWorker.payload).toEqual(inThread);
      expect(fromWorker.payload.situations.map((s) => s.replayHash))
        .toEqual(inThread.situations.map((s) => s.replayHash));
      console.log(
        `[measured] parity: ${fromWorker.payload.count} situations, ` +
        `${fromWorker.usage?.statements} statements in the worker`,
      );
    }, 120_000);

    it("matches across every query shape the client sends", async () => {
      const shapes = [
        { limit: 100, orderBy: "operational_visibility_score" as const },
        { league: "NBA", activeOnly: true, limit: 100, orderBy: "operational_visibility_score" as const },
        { league: "MLB", limit: 250, orderBy: "escalation_score" as const },
        { limit: 15, orderBy: "operational_visibility_score" as const },
        { limit: 500 },
      ];
      await withWorker(REAL_WORKER, async () => {
        for (const shape of shapes) {
          const expected = workerModule.buildSituationsPayload(shape).payload;
          const actual = await cache.getSituationsPayload(shape);
          expect(actual.payload, `shape ${JSON.stringify(shape)}`).toEqual(expected);
        }
      });
    }, 120_000);

    it("reports the worker's own SQL accounting for the request log", async () => {
      await withWorker(REAL_WORKER, async () => {
        const result = await cache.getSituationsPayload({ league: "NFL", limit: 100 });
        expect(result.usage?.statements ?? 0).toBeGreaterThan(0);
        // The origin string is what keeps `sql=130/22669ms` from being read as
        // main-thread time.
        expect(result.usage?.origin).toContain("worker");
        expect(result.usage?.origin).toContain("cold");
      });
    }, 120_000);
  });

  describe("cache behaviour", () => {
    it("serves fresh from cache without rebuilding", async () => {
      await withWorker(REAL_WORKER, async () => {
        const query = { league: "NFL", limit: 100 } as const;
        const first = await cache.getSituationsPayload(query);
        expect(first.state).toBe("cold");
        const second = await cache.getSituationsPayload(query);
        expect(second.state).toBe("fresh");
        // Same object graph, not a rebuild: the cache serves what it holds.
        expect(second.payload).toBe(first.payload);
      });
    }, 120_000);

    it("keys distinct query shapes separately and caps how many it keeps", async () => {
      await withWorker(REAL_WORKER, async () => {
        const keyA = cache.situationsCacheKey({ league: "NFL", limit: 100 });
        const keyB = cache.situationsCacheKey({ league: "NBA", limit: 100 });
        expect(keyA).not.toBe(keyB);
        // Field order is fixed by the key function, not by object insertion order.
        expect(cache.situationsCacheKey({ limit: 100, league: "NFL" })).toBe(keyA);

        // 40 distinct shapes against a 32-entry cap: the map must not grow past it.
        // An uncapped cache keyed on free-text query params is the memory leak
        // that OOM-killed this endpoint once already (#51).
        for (let i = 0; i < 40; i++) {
          await cache.getSituationsPayload({ league: `L${i}`, limit: 100 });
        }
        expect(cache.situationsCacheStats().entries).toBeLessThanOrEqual(32);
      });
    }, 180_000);

    it("coalesces concurrent cold requests into one build", async () => {
      await withWorker(SLOW_WORKER, async () => {
        const query = { league: "CFB", limit: 100 } as const;
        const results = await Promise.all([
          cache.getSituationsPayload(query),
          cache.getSituationsPayload(query),
          cache.getSituationsPayload(query),
        ]);
        // All three answered, and all three from the same build — one payload
        // object, not three. Three builds would serialize into 4.5s.
        expect(results.every((r) => r.state === "cold")).toBe(true);
        expect(results[1].payload).toBe(results[0].payload);
        expect(results[2].payload).toBe(results[0].payload);
      });
    }, 60_000);

    it("warms exactly the shapes the client asks for, one build at a time", async () => {
      await withWorker(REAL_WORKER, async () => {
        const warmed = await cache.warmSituationsCache();
        expect(warmed).toBe(cache.WARMUP_SHAPES.length);

        // Every warmed shape is now a hit. If a warm-up shape differed from what
        // the route builds by even one field it would be a different cache key and
        // the whole warm-up would be wasted work, so this is the assertion that
        // makes the feature real.
        for (const shape of cache.WARMUP_SHAPES) {
          const result = await cache.getSituationsPayload(shape);
          expect(result.state, `shape ${JSON.stringify(shape)}`).toBe("fresh");
        }
      });
    }, 120_000);

    it("leaves room in the build queue while warming", async () => {
      // The warm-up must not fill the bounded queue, or a real cold request
      // arriving during it would be answered EMPTY — the warm-up causing the very
      // failure it exists to prevent. Sequential building is what guarantees it.
      await withWorker(SLOW_WORKER, async () => {
        const warming = cache.warmSituationsCache();
        await new Promise((r) => setTimeout(r, 50)); // let the first build start
        expect(cache.situationsCacheStats().queuedBuilds).toBeLessThanOrEqual(1);

        // A real request for an unwarmed shape still gets through.
        const live = await cache.getSituationsPayload({ league: "XYZ", limit: 100 });
        expect(live.state).not.toBe("timeout");
        await warming;
      });
    }, 180_000);

    it("falls back in-thread when no worker is available", async () => {
      const previous = process.env.SITUATIONS_WORKER_PATH;
      process.env.SITUATIONS_WORKER_PATH = path.join(CACHE_DIR, "does-not-exist.cjs");
      await cache.shutdownSituationsWorker();
      cache.resetSituationsCache();
      try {
        expect(cache.situationsWorkerAvailable()).toBe(false);
        const result = await cache.getSituationsPayload({ league: "NFL", limit: 100 });
        // Correct answer, in-thread, flagged as such — this is the dev and vitest
        // path, and it blocks the loop exactly as it did before this change.
        expect(result.payload).toEqual(workerModule.buildSituationsPayload({ league: "NFL", limit: 100 }).payload);
        expect(result.usage?.origin).toContain("in-thread");
      } finally {
        if (previous === undefined) delete process.env.SITUATIONS_WORKER_PATH;
        else process.env.SITUATIONS_WORKER_PATH = previous;
        cache.resetSituationsCache();
      }
    }, 120_000);
  });
});
