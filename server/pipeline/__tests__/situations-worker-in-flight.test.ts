// @vitest-environment node
import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { Worker } from "worker_threads";

/**
 * Name the statement that never finished.
 *
 * PROD, 2026-10-07 03:20 UTC (the #81 deploy): the boot warm-up cached 4 of 6
 * shapes in 74s and TWO builds hit SITUATIONS_BUILD_TIMEOUT_MS (30s). Not one
 * line said what they were running. The accounting hook from the previous PR
 * times a statement and logs it when it RETURNS — and these never returned,
 * because the worker was terminated mid-statement, terminating the thread being
 * the only way to stop a synchronous better-sqlite3 call. The slowest statements
 * on this service are therefore exactly the ones it could not name.
 *
 * Nor can the worker be asked. A thread wedged inside SQLite is not running its
 * event loop, so a postMessage from in there is never sent — that
 * unresponsiveness is the whole reason the build was moved to a worker. The only
 * channel that still works is memory both threads can see: the worker writes the
 * statement into a SharedArrayBuffer BEFORE running it, and the parent reads it
 * out when it kills the thread.
 *
 * WHAT THIS SUITE ASSERTS
 *  1. A worker genuinely wedged inside a synchronous statement can be read from
 *     the outside, naming that statement and how long it has been running.
 *     CONTROL: an identical worker that does not publish reads back as nothing,
 *     so a test that could not detect the real thing cannot pass by reading a
 *     stale or fabricated buffer.
 *  2. The real path logs it: a build that exceeds the timeout produces a
 *     `[sql-slow] … (in flight, never completed)` line naming the SQL.
 *  3. An idle publisher reports nothing in flight — "it died outside SQLite" is
 *     a different, and also useful, answer.
 *  4. Overhead, measured rather than asserted about.
 *
 * THE WORKERS HERE ARE STUBS, ON PURPOSE. What is under test is the contract
 * between a parent and ANY wedged thread; a knob inside situations-worker.ts to
 * make it hang would put test-only code in the production build. They are
 * compiled against the REAL server/sql-accounting.ts, because the publisher is
 * the thing being tested and so cannot be a reimplementation of itself.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-inflight-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;
process.env.DATA_DIR = TMP_DIR;

const CACHE_DIR = path.resolve(process.cwd(), "node_modules", ".cache", "edge-setter-tests");
const ACCOUNTING_CJS = path.join(CACHE_DIR, "sql-accounting.cjs");
const WEDGED_WORKER = path.join(CACHE_DIR, "inflight-wedged-worker.cjs");
const SILENT_WORKER = path.join(CACHE_DIR, "inflight-silent-worker.cjs");

/** Rows in the recursive CTE each burn statement runs — roughly a second each. */
const BURN_ROWS = 6_000_000;

/**
 * The burn, as one SQL string, shared by the stubs and by the assertions. A test
 * cannot then pass by matching a substring the worker never ran.
 */
const BURN_SQL =
  `WITH RECURSIVE burn(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM burn WHERE i < ${BURN_ROWS}) ` +
  `SELECT count(*) AS c FROM burn`;

vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
  storage: { upsertSourceScore: vi.fn() },
  insertSettledOutcome: vi.fn(),
  getSettledOutcomesForAccuracy: vi.fn(() => []),
}));

let accounting: typeof import("../../sql-accounting");
let cache: typeof import("../situations-cache");

/**
 * A worker that speaks the real protocol, publishes through the real
 * sql-accounting, and then never answers: every build runs one synchronous
 * statement after another until the parent kills it.
 */
function wedgedWorkerSource(publish: boolean): string {
  const requirePath = JSON.stringify(ACCOUNTING_CJS.replace(/\\/g, "/"));
  const publishLine = publish
    ? "accounting.publishInFlightStatements(workerData && workerData.inFlightBuffer);"
    : "/* CONTROL: this worker publishes nothing */";
  return [
    'const { parentPort, workerData } = require("worker_threads");',
    'const Database = require("better-sqlite3");',
    `const accounting = require(${requirePath});`,
    publishLine,
    "accounting.installSqlAccounting();",
    'const db = new Database(":memory:");',
    'parentPort.postMessage({ kind: "ready", bootMs: 0 });',
    'parentPort.on("message", () => {',
    "  // One uninterruptible statement after another, the exact shape of the prod",
    "  // failure. No reply is ever posted: the parent's timeout is what ends this.",
    `  for (;;) db.prepare(${JSON.stringify(BURN_SQL)}).get();`,
    "});",
    "",
  ].join("\n");
}

async function compile(entry: string, outfile: string): Promise<void> {
  const { build } = await import("esbuild");
  await build({
    entryPoints: [entry], outfile, platform: "node", format: "cjs",
    bundle: true, packages: "external", logLevel: "silent",
  });
}

beforeAll(async () => {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  // The real publisher, bundled so a stub worker can require it.
  await compile(path.resolve(process.cwd(), "server", "sql-accounting.ts"), ACCOUNTING_CJS);
  fs.writeFileSync(WEDGED_WORKER, wedgedWorkerSource(true));
  fs.writeFileSync(SILENT_WORKER, wedgedWorkerSource(false));
  accounting = await import("../../sql-accounting");
  cache = await import("../situations-cache");
}, 180_000);

afterAll(async () => {
  await cache.shutdownSituationsWorker();
  accounting.publishInFlightStatements(null);
});

/** Spawn `entry`, wait for its `ready`, hand back the worker and its buffer. */
async function spawnWedged(entry: string): Promise<{ worker: Worker; buffer: SharedArrayBuffer }> {
  const buffer = accounting.createInFlightBuffer();
  const worker = new Worker(entry, { workerData: { inFlightBuffer: buffer } });
  worker.unref();
  await new Promise<void>((resolve, reject) => {
    worker.once("message", () => resolve());
    worker.once("error", reject);
  });
  return { worker, buffer };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("the statement in flight when a worker is killed", () => {
  it("CONTROL: a worker that does not publish reads back as nothing in flight", async () => {
    const { worker, buffer } = await spawnWedged(SILENT_WORKER);
    try {
      worker.postMessage({ id: 1, query: {} });
      await sleep(500);
      const read = accounting.readInFlightStatement(buffer);
      console.log(`[measured] CONTROL (no publisher): readInFlightStatement -> ${JSON.stringify(read)}`);
      // This worker IS wedged — it just never said so. Without this control, the
      // test below could pass against a buffer something else had written.
      expect(read).toBeNull();
    } finally {
      await worker.terminate();
    }
  }, 60_000);

  it("names the statement a wedged worker is inside, and how long it has been running", async () => {
    const { worker, buffer } = await spawnWedged(WEDGED_WORKER);
    try {
      worker.postMessage({ id: 1, query: {} });
      await sleep(500);
      const first = accounting.readInFlightStatement(buffer);
      expect(first).not.toBeNull();
      expect(first!.sql).toContain("WITH RECURSIVE burn");
      expect(first!.sql).toContain(String(BURN_ROWS));
      expect(first!.runningMs).toBeGreaterThan(0);

      // The clock is the statement's own start, not the read's: reading again
      // later reports a longer run.
      await sleep(500);
      const second = accounting.readInFlightStatement(buffer);
      expect(second).not.toBeNull();
      console.log(
        `[measured] wedged worker: "${first!.sql.slice(0, 60)}…" ` +
        `runningMs ${first!.runningMs} -> ${second!.runningMs}`,
      );
      expect(second!.runningMs).toBeGreaterThan(first!.runningMs);
    } finally {
      await worker.terminate();
    }
  }, 60_000);

  it("still reads after the thread is terminated — the buffer belongs to the parent", async () => {
    const { worker, buffer } = await spawnWedged(WEDGED_WORKER);
    worker.postMessage({ id: 1, query: {} });
    await sleep(500);
    await worker.terminate();
    const read = accounting.readInFlightStatement(buffer);
    console.log(`[measured] after terminate(): ${read ? `${read.sql.slice(0, 50)}…` : "null"}`);
    expect(read).not.toBeNull();
    expect(read!.sql).toContain("WITH RECURSIVE burn");
  }, 60_000);

  it("truncates a statement longer than the buffer instead of overflowing it", async () => {
    const { worker, buffer } = await spawnWedged(WEDGED_WORKER);
    try {
      worker.postMessage({ id: 1, query: {} });
      await sleep(500);
      const read = accounting.readInFlightStatement(buffer);
      expect(read).not.toBeNull();
      // Collapsed to the same 200-char budget the completion-time [sql-slow]
      // line uses, out of a buffer bounded well under a KB.
      expect(read!.sql.length).toBeLessThanOrEqual(200);
      expect(accounting.IN_FLIGHT_BUFFER_BYTES).toBeLessThanOrEqual(1024);
    } finally {
      await worker.terminate();
    }
  }, 60_000);

  it("reports nothing in flight between statements", async () => {
    const buffer = accounting.createInFlightBuffer();
    const Database = (await import("better-sqlite3")).default;
    accounting.installSqlAccounting();
    accounting.publishInFlightStatements(buffer);
    try {
      const db = new Database(":memory:");
      db.prepare("SELECT 1 AS one").get();
      db.close();
    } finally {
      accounting.publishInFlightStatements(null);
    }
    expect(accounting.readInFlightStatement(buffer)).toBeNull();
    expect(accounting.formatInFlightStatement(buffer, "test")).toBe("");
  });
});

describe("through the cache: a build that exceeds the timeout", () => {
  it("logs a [sql-slow] line naming the statement that never completed", async () => {
    const previous = {
      path: process.env.SITUATIONS_WORKER_PATH,
      timeout: process.env.SITUATIONS_BUILD_TIMEOUT_MS,
      wait: process.env.SITUATIONS_COLD_WAIT_MS,
    };
    process.env.SITUATIONS_WORKER_PATH = WEDGED_WORKER;
    process.env.SITUATIONS_BUILD_TIMEOUT_MS = "1500";
    process.env.SITUATIONS_COLD_WAIT_MS = "4000";
    await cache.shutdownSituationsWorker();
    cache.resetSituationsCache();

    const warnings: string[] = [];
    const realWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(args.join(" ")); };
    try {
      const result = await cache.getSituationsPayload({ league: "NFL", limit: 100 });
      // The build never answered, so the request is answered empty. The point
      // of this test is the log line, not the payload.
      expect(result.state).toBe("timeout");
    } finally {
      console.warn = realWarn;
      await cache.shutdownSituationsWorker();
      cache.resetSituationsCache();
      const restore = (name: string, value: string | undefined) => {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      };
      restore("SITUATIONS_WORKER_PATH", previous.path);
      restore("SITUATIONS_BUILD_TIMEOUT_MS", previous.timeout);
      restore("SITUATIONS_COLD_WAIT_MS", previous.wait);
    }

    const slow = warnings.filter((line) => line.startsWith("[sql-slow]"));
    console.log(`[measured] timeout produced ${slow.length} [sql-slow] line(s):\n  ${slow.join("\n  ")}`);
    expect(slow.length).toBeGreaterThan(0);
    const line = slow[0];
    expect(line).toContain("in flight, never completed");
    expect(line).toContain("WITH RECURSIVE burn");
    expect(line).toContain("build exceeded 1500ms");
    // "how long it had been running" — a real number, not a placeholder, and
    // bounded by the timeout that produced it.
    const ms = Number(/\[sql-slow\] ([\d.]+)ms/.exec(line)?.[1]);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(1500 + 2000);
  }, 60_000);
});

describe("overhead of publishing", () => {
  /**
   * REPORTED, NOT ASSERTED TO A BUDGET. Sequential arms on this machine have
   * reported +14% and then −10% from identical code, so the arms are interleaved
   * and the noise floor (the same arm run again) is printed next to the result.
   * A budget assertion on a number that noisy is a flaky test, not a guard.
   */
  it("reports the per-statement cost of publishing", async () => {
    const Database = (await import("better-sqlite3")).default;
    const buffer = accounting.createInFlightBuffer();
    accounting.installSqlAccounting();
    const db = new Database(":memory:");
    const stmt = db.prepare("SELECT 1 AS one");
    const N = 20_000;

    const arm = (publish: boolean): number => {
      accounting.publishInFlightStatements(publish ? buffer : null);
      const finish = accounting.beginSqlAccounting("overhead");
      const started = process.hrtime.bigint();
      for (let i = 0; i < N; i++) stmt.get();
      const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
      finish();
      accounting.publishInFlightStatements(null);
      return elapsed;
    };

    arm(false); arm(true); // warm both paths
    const off: number[] = [], on: number[] = [], floor: number[] = [];
    for (let round = 0; round < 5; round++) {
      off.push(arm(false));
      on.push(arm(true));
      floor.push(arm(false)); // the same arm again: the noise floor
    }
    const best = (xs: number[]) => Math.min(...xs);
    const perStatementNs = ((best(on) - best(off)) / N) * 1e6;
    console.log(
      `[measured] ${N} statements, best of 5, interleaved — publishing ` +
      `off ${best(off).toFixed(1)}ms / on ${best(on).toFixed(1)}ms / ` +
      `off again ${best(floor).toFixed(1)}ms ` +
      `(noise floor ${Math.abs(best(floor) - best(off)).toFixed(1)}ms) => ` +
      `${perStatementNs.toFixed(0)}ns per statement published`,
    );
    db.close();
    // The only thing worth asserting is the order of magnitude: a situations
    // build runs ~150 statements, so even 10µs each would be 1.5ms against a
    // 22,669ms request.
    expect(perStatementNs).toBeLessThan(10_000);
  }, 180_000);
});
