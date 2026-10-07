// @vitest-environment node
import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * The boot warm-up must not overlap the boot ingestion cycle.
 *
 * PROD, 2026-10-07 03:20 UTC (the #81 deploy). The warm-up fired 12s after
 * listen and cached 4 of 6 shapes in 74s. During it the MAIN THREAD blocked 6.8s
 * in `ingest:settlement`, 6.66s of that in `settlement:read-nullgame`, while the
 * worker was doing its own cold reads of the same 5.02GB pipeline.db. The #80
 * boot ran the same settlement step with no such block — and had no warm-up.
 *
 * The worker keeps the BUILD off the event loop. It does not give the process a
 * second disk. Two threads cold-reading one 5GB file contend in the page cache
 * and at the device, and a 6.8s main-thread span is over Render's 5s
 * health-check budget — the thing #81 exists to prevent, reintroduced by #81's
 * own optimisation.
 *
 * So the warm-up now waits for BOTH:
 *   - `ingestion-initial` to finish (index.ts passes whenInitialIngestionSettled)
 *   - a floor of SITUATIONS_WARMUP_DELAY_MS after listen, default 120s (was 12s)
 * bounded by SITUATIONS_WARMUP_MAX_WAIT_MS (default 600s) so a cycle that never
 * finishes does not delete the warm-up altogether.
 *
 * Both conditions matter and each has its own test, plus a CONTROL that the old
 * ungated schedule would have started during the cycle — without it, a test that
 * waited for nothing would pass.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-warmup-gate-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;
process.env.DATA_DIR = TMP_DIR;

const CACHE_DIR = path.resolve(process.cwd(), "node_modules", ".cache", "edge-setter-tests");
const FAST_WORKER = path.join(CACHE_DIR, "warmup-fast-worker.cjs");

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

/**
 * A worker that answers instantly. What is under test here is WHEN the warm-up
 * starts, not what it builds, and an instant worker keeps the timing assertions
 * about the gate rather than about the fixture.
 */
const FAST_WORKER_SOURCE = [
  'const { parentPort } = require("worker_threads");',
  'parentPort.postMessage({ kind: "ready", bootMs: 0 });',
  'parentPort.on("message", (msg) => {',
  "  parentPort.postMessage({",
  '    kind: "result", id: msg.id, ok: true,',
  "    payload: { count: 0, situations: [] },",
  '    usage: { statements: 0, ms: 0, slowest: [], route: "warmup-stub" },',
  "    buildMs: 0,",
  "  });",
  "});",
  "",
].join("\n");

const ENV_KEYS = [
  "SITUATIONS_WARMUP", "SITUATIONS_WARMUP_DELAY_MS", "SITUATIONS_WARMUP_MAX_WAIT_MS",
  "SITUATIONS_WORKER_PATH",
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeAll(async () => {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(FAST_WORKER, FAST_WORKER_SOURCE);
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  cache = await import("../situations-cache");
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key]!;
  }
  await cache.shutdownSituationsWorker();
  cache.resetSituationsCache();
});

afterAll(async () => {
  await cache.shutdownSituationsWorker();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** A promise that resolves after `ms`, standing in for the ingestion cycle. */
const cycleTaking = (ms: number) => sleep(ms);
const never = () => new Promise<void>(() => {});

describe("awaitWarmupWindow", () => {
  it("waits for the ingestion cycle when the cycle outlasts the floor", async () => {
    process.env.SITUATIONS_WARMUP_DELAY_MS = "100";
    process.env.SITUATIONS_WARMUP_MAX_WAIT_MS = "5000";
    const started = Date.now();
    const window = await cache.awaitWarmupWindow(cycleTaking(600), started);
    console.log(`[measured] cycle 600ms / floor 100ms -> waited ${window.waitedMs}ms, gate=${window.gate}`);
    expect(window.gate).toBe("settled");
    expect(window.waitedMs).toBeGreaterThanOrEqual(600);
    expect(window.waitedMs).toBeLessThan(5_000);
  }, 30_000);

  it("waits for the floor when the floor outlasts the cycle", async () => {
    process.env.SITUATIONS_WARMUP_DELAY_MS = "700";
    process.env.SITUATIONS_WARMUP_MAX_WAIT_MS = "5000";
    const started = Date.now();
    const window = await cache.awaitWarmupWindow(cycleTaking(50), started);
    console.log(`[measured] cycle 50ms / floor 700ms -> waited ${window.waitedMs}ms, gate=${window.gate}`);
    expect(window.gate).toBe("settled");
    // The floor is measured from listen, not from the cycle finishing.
    expect(window.waitedMs).toBeGreaterThanOrEqual(700);
  }, 30_000);

  it("gives up on a cycle that never finishes, and says so", async () => {
    process.env.SITUATIONS_WARMUP_DELAY_MS = "100";
    process.env.SITUATIONS_WARMUP_MAX_WAIT_MS = "600";
    const started = Date.now();
    const window = await cache.awaitWarmupWindow(never(), started);
    console.log(`[measured] cycle never settles / cap 600ms -> waited ${window.waitedMs}ms, gate=${window.gate}`);
    // A warm-up that overlaps ingestion is a worse boot. One that never runs is
    // a cold ~44s build for the first visitor after every deploy.
    expect(window.gate).toBe("timeout");
    expect(window.waitedMs).toBeGreaterThanOrEqual(600);
    expect(window.waitedMs).toBeLessThan(2_000);
  }, 30_000);

  it("still waits for the floor when a cycle has already failed", async () => {
    process.env.SITUATIONS_WARMUP_DELAY_MS = "400";
    process.env.SITUATIONS_WARMUP_MAX_WAIT_MS = "5000";
    const started = Date.now();
    // whenInitialIngestionSettled() resolves in a `finally`, but a rejected
    // promise must not take the warm-up down with it either.
    const window = await cache.awaitWarmupWindow(Promise.reject(new Error("cycle blew up")), started);
    expect(window.gate).toBe("settled");
    expect(window.waitedMs).toBeGreaterThanOrEqual(400);
  }, 30_000);

  it("defaults to a 120s floor — the 12s that overlapped ingestion is gone", async () => {
    delete process.env.SITUATIONS_WARMUP_DELAY_MS;
    delete process.env.SITUATIONS_WARMUP_MAX_WAIT_MS;
    const settled = await Promise.race([
      cache.awaitWarmupWindow(Promise.resolve(), Date.now()).then(() => "warmed" as const),
      sleep(400).then(() => "still waiting" as const),
    ]);
    console.log(`[measured] default floor, cycle instant, 400ms later: ${settled}`);
    // Under the old 12s default this would already have fired at 12s; under 120s
    // it is still waiting, and 400ms is nowhere near either bound.
    expect(settled).toBe("still waiting");
  }, 30_000);
});

describe("scheduleSituationsWarmup", () => {
  it("builds nothing while the ingestion cycle is still running", async () => {
    process.env.SITUATIONS_WORKER_PATH = FAST_WORKER;
    process.env.SITUATIONS_WARMUP_DELAY_MS = "50";
    process.env.SITUATIONS_WARMUP_MAX_WAIT_MS = "10000";

    let cycleDone = false;
    const cycle = sleep(800).then(() => { cycleDone = true; });
    const listenedAt = Date.now();
    const warmup = cache.scheduleSituationsWarmup(cycle);

    // Sampled across the whole cycle, not probed once at the end: a single
    // late probe could not tell "waited" from "finished early".
    const samples: { atMs: number; entries: number }[] = [];
    while (!cycleDone) {
      samples.push({ atMs: Date.now() - listenedAt, entries: cache.situationsCacheStats().entries });
      await sleep(50);
    }
    const duringCycle = samples.reduce((max, s) => Math.max(max, s.entries), 0);

    await warmup;
    const after = cache.situationsCacheStats().entries;
    console.log(
      `[measured] ${samples.length} samples over the 800ms cycle, floor 50ms — ` +
      `max entries during the cycle ${duringCycle}, after the warm-up ${after}`,
    );
    expect(duringCycle).toBe(0);
    expect(after).toBe(cache.WARMUP_SHAPES.length);
  }, 60_000);

  it("CONTROL: with no cycle to wait for, the same warm-up runs during it", async () => {
    process.env.SITUATIONS_WORKER_PATH = FAST_WORKER;
    process.env.SITUATIONS_WARMUP_DELAY_MS = "50";

    // The old behaviour: a short floor and nothing to gate on. If this also
    // built nothing, the test above would be measuring its own sampling, not
    // the gate.
    const warmup = cache.scheduleSituationsWarmup(undefined);
    await sleep(400);
    const duringWhatWouldHaveBeenTheCycle = cache.situationsCacheStats().entries;
    await warmup;
    console.log(
      `[measured] ungated, floor 50ms — entries 400ms in: ${duringWhatWouldHaveBeenTheCycle}`,
    );
    expect(duringWhatWouldHaveBeenTheCycle).toBeGreaterThan(0);
  }, 60_000);

  it("SITUATIONS_WARMUP=0 still skips it entirely", async () => {
    process.env.SITUATIONS_WORKER_PATH = FAST_WORKER;
    process.env.SITUATIONS_WARMUP = "0";
    process.env.SITUATIONS_WARMUP_DELAY_MS = "0";
    await cache.scheduleSituationsWarmup(Promise.resolve());
    expect(cache.situationsCacheStats().entries).toBe(0);
  }, 30_000);
});
