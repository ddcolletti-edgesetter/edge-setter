import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Does the Deploy 2 sweep starve the live app's writes? Measured: no.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY THIS NEEDS A SECOND PROCESS, and cannot be faked in one.
 *
 * better-sqlite3 is synchronous. Inside one process there is no moment at which
 * a second writer can attempt the lock while our transaction holds it — the
 * call stack is busy holding it. A single-process "concurrency" test would only
 * ever write between chunks, which is the easy case and proves nothing. So the
 * contending writer here is a real child process with its own connection to the
 * same file, hammering writes for the whole duration of the sweep.
 *
 * WHAT IT MEASURES. The child records, per attempt, the wall-clock time its
 * write took including any wait for the lock, and reports max/avg plus any
 * SQLITE_BUSY. The number that matters is max wait against busy_timeout
 * (5,000ms): that is where a blocked app write gives up, and it is also
 * Render's health-check budget.
 *
 * WHAT IT ASSERTS vs WHAT IT REPORTS. It asserts only machine-independent
 * properties — zero SQLITE_BUSY, writes genuinely got through for ~the whole
 * sweep, max wait comfortably under the timeout. The millisecond figures are
 * printed, not asserted: a threshold tuned on this laptop would flake on CI and
 * would be a lie about prod (0.5 CPU, cold disk, multi-GB file).
 *
 * The paced and unpaced arms are both printed, but their DIFFERENCE means
 * nothing: an unpaced sweep over the same rows finishes far sooner, so the child
 * overlaps it briefly and collides less. See the note on the second test. What
 * both arms do show is the thing worth knowing — a 500-row chunk holds the write
 * lock for tens of milliseconds, nowhere near the 5,000ms at which a blocked app
 * write would fail.
 *
 * One observation this test cannot attribute: the contending writer's worst wait
 * has been seen at several times the longest single chunk hold. That is too big
 * to be one of our transactions and most likely a WAL auto-checkpoint (which
 * takes the write lock on whichever connection trips the 1,000-page threshold),
 * but this test does not prove that, and it is well inside the timeout either
 * way.
 * ────────────────────────────────────────────────────────────────────────────
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-inplay-conc-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;
process.env.DATA_DIR = TMP_DIR;

// storage.ts is NOT mocked here, unlike the unit suite: the sweep's mirror pass
// has to do real work so the chunk timings include it.
type StoreMod = typeof import("../store");
type SweepMod = typeof import("../inplay-closing-exclusion");

let store: StoreMod;
let sweep: SweepMod;

const CANDIDATES = 6_000;
const CHUNK = 500;
/** Safety ceiling only — the parent normally stops the child by file signal. */
const CHILD_CEILING_MS = 120_000;

/** The contending writer, as a standalone script run by `node`. */
const CHILD_SOURCE = `
const Database = require(process.argv[2]);
const db = new Database(process.argv[3]);
db.pragma("busy_timeout = " + process.argv[4]);
// Runs until the parent creates the stop file, so the window always covers the
// whole sweep however long it takes under test-suite load. The ceiling is a
// safety net against a parent that dies without signalling, not a schedule.
const fsmod = require("fs");
const stopPath = process.argv[5];
const ceiling = Date.now() + Number(process.argv[6]);

// A small, realistic app-shaped write against the same file the sweep is
// updating: one row, one upsert, same lock.
const stmt = db.prepare(
  "INSERT INTO pipeline_meta (key, value, updated_at) VALUES (?, ?, ?)" +
  " ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
);

let attempts = 0, busy = 0, errors = 0, maxWaitMs = 0, totalWaitMs = 0, slowWrites = 0;
const startedAt = Date.now();
while (Date.now() < ceiling && !fsmod.existsSync(stopPath)) {
  const t0 = Date.now();
  try {
    stmt.run("concurrency_probe", String(attempts), new Date().toISOString());
  } catch (e) {
    const code = String(e && (e.code || e.message));
    if (code.indexOf("BUSY") !== -1) busy++; else { errors++; }
  }
  const waited = Date.now() - t0;
  attempts++;
  totalWaitMs += waited;
  if (waited > maxWaitMs) maxWaitMs = waited;
  // A write that took more than a couple of ms almost certainly queued behind
  // the sweep. Counting them is how we know the arms actually overlapped.
  if (waited >= 2) slowWrites++;
  // Deliberately a writer, not a spin lock: a tight loop would monopolise the
  // lock itself and we would be measuring the child against the child.
  const spinUntil = Date.now() + 1;
  while (Date.now() < spinUntil) { /* brief gap */ }
}
process.stdout.write(JSON.stringify({
  attempts, busy, errors, maxWaitMs, slowWrites,
  avgWaitMs: attempts > 0 ? Math.round((totalWaitMs / attempts) * 100) / 100 : 0,
  startedAt, endedAt: Date.now(),
}));
`;

const CHILD_PATH = path.join(TMP_DIR, "contending-writer.cjs");
let BETTER_SQLITE_PATH = "";

interface ChildReport {
  attempts: number;
  busy: number;
  errors: number;
  maxWaitMs: number;
  avgWaitMs: number;
  /** Writes that took >= 2ms — the evidence that the arms really overlapped. */
  slowWrites: number;
  startedAt: number;
  endedAt: number;
}

beforeAll(async () => {
  store = await import("../store");
  sweep = await import("../inplay-closing-exclusion");

  BETTER_SQLITE_PATH = createRequire(import.meta.url).resolve("better-sqlite3");
  fs.writeFileSync(CHILD_PATH, CHILD_SOURCE, "utf8");

  const db = store.getPipelineDb();
  const iso = (ms: number) => new Date(ms).toISOString();
  const DAY = 86_400_000, HOUR = 3_600_000;
  const base = Date.parse("2026-02-01T00:00:00.000Z");

  const insGame = db.prepare(
    `INSERT INTO games (id,league,home_team,away_team,game_time,status,spread_line,spread_team,total_line,updated_at,created_at)
     VALUES (?,?,?,?,?,'final',-3.5,'DAL',45.5,?,?)`);
  const insSnap = db.prepare(
    `INSERT INTO odds_snapshots (id,game_id,league,sportsbook,market_source,spread_line,snapshot_at,created_at)
     VALUES (?,?,?,'pinnacle','the_odds_api',-3.5,?,?)`);
  const insSig = db.prepare(
    `INSERT INTO live_signals (id,league,game_id,signal_type,headline,team,sources,source_count,verdict,confidence,betting_relevance,created_at,updated_at,signal_time,first_seen_at)
     VALUES (?,?,?,'line_move','h','DAL','[]',1,'confirmed',85,1,?,?,?,?)`);
  const insOut = db.prepare(
    `INSERT INTO outcomes (id,signal_id,game_id,market,line_at_signal,closing_line,hit,clv,created_at)
     VALUES (?,?,?,'spread',-3.5,-9.5,1,6,?)`);

  db.transaction(() => {
    for (let i = 0; i < CANDIDATES; i++) {
      const kickoff = base + i * HOUR;
      const g = `cg${i}`;
      insGame.run(g, "NFL", "DAL", "NYG", iso(kickoff), iso(kickoff), iso(kickoff));
      insSnap.run(`cs${i}pre`, g, "NFL", iso(kickoff - 2 * HOUR), iso(kickoff - 2 * HOUR));
      // Post-kickoff snapshot — this is what makes the row a candidate.
      insSnap.run(`cs${i}live`, g, "NFL", iso(kickoff + HOUR), iso(kickoff + HOUR));
      const sig = `csig${i}`;
      const created = iso(kickoff - DAY);
      insSig.run(sig, "NFL", g, created, created, created, created);
      insOut.run(`cout${i}`, sig, g, iso(kickoff + 4 * HOUR));
    }
  })();
});

afterAll(() => {
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* best effort */ }
});

/**
 * Start the contending writer and return a promise for its report.
 *
 * MUST be the async `spawn`, not `spawnSync`. The first version of this test
 * used spawnSync and passed with a 1ms max wait — because spawnSync blocks the
 * parent, so the sweep made no progress while the child ran and the child was
 * measuring an idle database. It asserted nothing. The child now runs truly
 * alongside the sweep, and `slowWrites` plus the reported windows are what
 * prove it.
 */
function startContendingWriter(stopPath: string, ceilingMs: number): Promise<ChildReport> {
  const child = spawn(
    process.execPath,
    [
      CHILD_PATH,
      BETTER_SQLITE_PATH,
      path.join(TMP_DIR, "pipeline.db"),
      String(sweep.SWEEP_BUSY_TIMEOUT_MS),
      stopPath,
      String(ceilingMs),
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let out = "", err = "";
  child.stdout.on("data", (d) => { out += String(d); });
  child.stderr.on("data", (d) => { err += String(d); });

  return new Promise<ChildReport>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`contending writer exited ${code}: ${err.slice(0, 500)}`));
      try { resolve(JSON.parse(out) as ChildReport); }
      catch (e) { reject(new Error(`unparseable child output: ${out.slice(0, 200)}`)); }
    });
  });
}

/**
 * Run the sweep and a contending writer at the same time, for real.
 *
 * The child is started BEFORE runSweep and keeps writing until the parent
 * signals it to stop AFTER the sweep finishes, so its window always covers the
 * whole sweep no matter how slow the machine is. Both windows are returned so
 * the caller can assert the overlap actually happened — without that check this
 * test would silently degrade into measuring an idle database, which is exactly
 * how its first version passed while proving nothing.
 */
interface ContentionRun {
  child: ChildReport;
  lock: Awaited<ReturnType<SweepMod["runSweep"]>>["lock_hold"];
  chunks: number;
  sweepStartedAt: number;
  sweepEndedAt: number;
  /** Milliseconds during which both the sweep and the child were running. */
  overlapMs: number;
}

async function sweepWithContention(pauseMs: number): Promise<ContentionRun> {
  const stopPath = path.join(TMP_DIR, `stop-${pauseMs}-${Date.now()}`);
  const childPromise = startContendingWriter(stopPath, CHILD_CEILING_MS);
  // Let the child open its connection and start writing before we begin, so
  // the first chunk is already contended rather than racing process startup.
  await new Promise((r) => setTimeout(r, 300));

  const sweepStartedAt = Date.now();
  const res = await sweep.runSweep({
    direction: "forward",
    write: true,
    refreshAccuracy: false,
    chunkSize: CHUNK,
    pauseMs,
  });
  const sweepEndedAt = Date.now();

  fs.writeFileSync(stopPath, "1");
  const child = await childPromise;
  const overlapMs = Math.max(
    0,
    Math.min(sweepEndedAt, child.endedAt) - Math.max(sweepStartedAt, child.startedAt),
  );

  if (res.lock_hold.chunks === 0) throw new Error("sweep produced no chunks, so nothing contended");
  return {
    child,
    lock: res.lock_hold,
    chunks: res.lock_hold.chunks,
    sweepStartedAt,
    sweepEndedAt,
    overlapMs,
  };
}

describe("a second connection writing during a sweep", () => {
  it("is never starved: no SQLITE_BUSY, and its worst wait stays well under busy_timeout", async () => {
    // Paced run first, at the shipped default. 6,000 rows / 500 per chunk = 12
    // chunks, 11 pauses of 250ms, so ~3s of sweep; the child gets 6s.
    const paced = await sweepWithContention(sweep.SWEEP_PAUSE_MS_DEFAULT);

    console.log(
      `[concurrency] PACED  pause=${sweep.SWEEP_PAUSE_MS_DEFAULT}ms chunk=${CHUNK} ` +
      `chunks=${paced.chunks} | sweep lock-hold: pipeline max ${paced.lock.pipeline_ms_max}ms, ` +
      `storage max ${paced.lock.storage_ms_max}ms, worst chunk ${paced.lock.worst_chunk_ms}ms ` +
      `| contending writer: ${paced.child.attempts} writes, ${paced.child.busy} SQLITE_BUSY, ` +
      `max wait ${paced.child.maxWaitMs}ms, avg ${paced.child.avgWaitMs}ms, ` +
      `${paced.child.slowWrites} writes >=2ms | overlap ${paced.overlapMs}ms`,
    );

    // ── Anti-vacuity first. Without these the rest is a claim about an idle DB.
    const sweepMs = paced.sweepEndedAt - paced.sweepStartedAt;
    expect(sweepMs).toBeGreaterThan(0);
    // The child must have been writing for essentially the whole sweep.
    expect(paced.overlapMs).toBeGreaterThanOrEqual(sweepMs * 0.9);
    expect(paced.child.attempts).toBeGreaterThan(100);

    // ── The actual properties, all machine-independent.
    expect(paced.child.errors).toBe(0);
    expect(paced.child.busy).toBe(0);
    expect(paced.child.maxWaitMs).toBeLessThan(sweep.SWEEP_BUSY_TIMEOUT_MS);
    // And the sweep's own chunks stayed far from the limit.
    expect(paced.lock.worst_chunk_ms).toBeLessThan(sweep.SWEEP_BUSY_TIMEOUT_MS / 2);
  }, 120_000);

  it("reports an unpaced arm for contrast, which is NOT a controlled comparison", async () => {
    // Reset so this arm has the same candidate set as the first.
    store.getPipelineDb()
      .prepare("UPDATE outcomes SET excluded_stale = 0, excluded_reason = NULL WHERE excluded_reason = ?")
      .run(sweep.INPLAY_CLOSING_REASON);

    const unpaced = await sweepWithContention(0);

    console.log(
      `[concurrency] UNPACED pause=0ms chunk=${CHUNK} ` +
      `chunks=${unpaced.chunks} | sweep lock-hold: pipeline max ${unpaced.lock.pipeline_ms_max}ms, ` +
      `storage max ${unpaced.lock.storage_ms_max}ms, worst chunk ${unpaced.lock.worst_chunk_ms}ms ` +
      `| contending writer: ${unpaced.child.attempts} writes, ${unpaced.child.busy} SQLITE_BUSY, ` +
      `max wait ${unpaced.child.maxWaitMs}ms, avg ${unpaced.child.avgWaitMs}ms, ` +
      `${unpaced.child.slowWrites} writes >=2ms | overlap ${unpaced.overlapMs}ms`,
    );

    const sweepMs = unpaced.sweepEndedAt - unpaced.sweepStartedAt;
    expect(unpaced.overlapMs).toBeGreaterThanOrEqual(sweepMs * 0.9);
    // Deliberately lower than the paced arm's bar: an unpaced sweep over the
    // same rows finishes in ~100ms, so the child simply has less time in which
    // to attempt anything. That is the point of the note above.
    expect(unpaced.child.attempts).toBeGreaterThan(20);

    // READ THE OVERLAP BEFORE READING THE WAIT. An unpaced sweep over the same
    // rows finishes in a fraction of the time, so the child overlaps it for far
    // fewer milliseconds and gets correspondingly fewer chances to collide. A
    // lower max wait here is therefore NOT evidence that pacing hurts, and a
    // higher one in the paced arm is not evidence that it helps. The two arms
    // are reported side by side because both numbers are informative about the
    // same thing — how little of the lock this job actually takes — not because
    // their difference means anything.
    //
    // Even unpaced it must not produce SQLITE_BUSY — if it does, the default
    // pause is load-bearing for correctness and not just for politeness, and
    // that is worth knowing loudly.
    expect(unpaced.child.errors).toBe(0);
    expect(unpaced.child.maxWaitMs).toBeLessThan(sweep.SWEEP_BUSY_TIMEOUT_MS);
  }, 120_000);
});
