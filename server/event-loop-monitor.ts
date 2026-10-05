/**
 * Event-loop lag monitor and per-step block attribution.
 *
 * Why: Render killed the instance repeatedly (Sept 22 2026, ~10:20-10:35 PM PT;
 * again Oct 5 2026, 02:57-03:03 UTC) with "HTTP health check failed (timed out
 * after 5 seconds)" while the health endpoint itself answers in 2-30ms. That
 * means the event loop was blocked (better-sqlite3 is synchronous; large JSON
 * work is synchronous). This module detects blocks and attributes them to the
 * work that was running, so the real blocker is identified from production data
 * instead of guessed.
 *
 * How: a timer is scheduled every CHECK_MS. If it fires more than CHECK_MS late,
 * the loop was blocked for roughly that long. The lag is charged to every
 * tracked step and in-flight request whose lifetime OVERLAPS the blocked
 * interval, and each step reports its own worst block when it finishes.
 *
 * Three mechanics matter, each learned from a misread of the Oct 5 logs:
 *
 *   1. Overlap, not "active right now". The old version listed the jobs active
 *      at log time, which is AFTER the block ended. The Oct 5 boot-1 line
 *      `blocked ~2780ms | jobs: none` was the settlement backlog migration,
 *      which had finished 70ms earlier; `~13765ms | jobs: roster-refresh |
 *      requests: none` was really GET /api/v2/signals, which finished 4ms before
 *      the line was written. Both are named correctly now because finished
 *      entries stay in a ring buffer and are matched against the blocked
 *      interval [now - lag, now].
 *
 *   2. A step's summary is emitted one tick LATE, on purpose. A step that ends
 *      at the end of its own worst block (the migration above) would otherwise
 *      report maxBlock=0, because the tick that measures the block has not run
 *      yet. Finished steps are queued and flushed by the next tick, after that
 *      tick has charged its lag.
 *
 *   3. CHECK_MS is configurable (LOOP_SAMPLE_MS). At the old fixed 500ms a
 *      300ms block was frequently invisible: if it fits entirely between two
 *      ticks it delays neither. Sampling at 100ms makes sub-second steps
 *      measurable in production; tests drop it to single-digit ms to measure
 *      spans precisely. A measured span never OVERSTATES the real one — it can
 *      understate it by up to CHECK_MS.
 */

import { watchdogJobEvent } from "./loop-watchdog";

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

/** Sampling interval. Also the resolution of every block measurement below. */
const CHECK_MS = envInt("LOOP_SAMPLE_MS", 100, 1, 1000);
/** Lag at or above this gets a `[loop-lag]` line of its own. */
const WARN_THRESHOLD_MS = envInt("LOOP_WARN_MS", 1000, 50, 60_000);
/** Lag at or above this is charged to the overlapping steps. Below it is noise. */
const ATTRIBUTE_MIN_MS = envInt("LOOP_ATTRIBUTE_MS", 50, 1, 1000);
/** A finished step reports itself once its worst block reaches this. */
const STEP_REPORT_MS = envInt("LOOP_STEP_REPORT_MS", 250, 1, 60_000);
/** Report every step regardless of how fast it was (measurement runs, tests). */
const STEP_LOG_ALL = process.env.LOOP_STEP_LOG_ALL === "true";
/** How many finished entries stay available for overlap attribution. */
const RECENT_LIMIT = 64;

type Entry = {
  id: number;
  name: string;
  kind: "job" | "request";
  startedAt: number;
  endedAt: number | null;
  /** Worst single block charged to this entry. */
  maxBlockMs: number;
  /** Sum of the blocks charged to it, and how many there were. */
  blockedMs: number;
  blocks: number;
};

/** Accumulated per step name, for the measurement table and the regression test. */
export type StepStat = {
  name: string;
  calls: number;
  maxWallMs: number;
  totalWallMs: number;
  maxBlockMs: number;
  blocks: number;
};

const active = new Map<number, Entry>();
/** Finished entries, newest last. Kept so a block can be charged to work that
 *  ended inside it — the Oct 5 misattribution. */
const recent: Entry[] = [];
/** Finished entries awaiting their summary line; flushed by the next tick. */
let pendingReports: Entry[] = [];
const stats = new Map<string, StepStat>();
let nextId = 1;
/** Max lag seen since the last resetStepStats(), whatever was running. */
let maxObservedBlockMs = 0;

function finish(entry: Entry): void {
  entry.endedAt = Date.now();
  active.delete(entry.id);
  recent.push(entry);
  if (recent.length > RECENT_LIMIT) recent.shift();
  // Without a running sampler nothing would ever flush the queue, and unit tests
  // that call trackJob would grow it forever.
  if (started) pendingReports.push(entry);
  else record(entry);
}

function record(entry: Entry): void {
  const wall = (entry.endedAt ?? Date.now()) - entry.startedAt;
  let stat = stats.get(entry.name);
  if (!stat) {
    stat = { name: entry.name, calls: 0, maxWallMs: 0, totalWallMs: 0, maxBlockMs: 0, blocks: 0 };
    stats.set(entry.name, stat);
  }
  stat.calls++;
  stat.totalWallMs += wall;
  if (wall > stat.maxWallMs) stat.maxWallMs = wall;
  if (entry.maxBlockMs > stat.maxBlockMs) stat.maxBlockMs = entry.maxBlockMs;
  stat.blocks += entry.blocks;

  if (STEP_LOG_ALL || entry.maxBlockMs >= STEP_REPORT_MS) {
    console.log(
      `[step] ${entry.name} wall=${wall}ms maxBlock=${entry.maxBlockMs}ms` +
      `${entry.blocks > 1 ? ` blocks=${entry.blocks} blockedTotal=${entry.blockedMs}ms` : ""}`,
    );
  }
}

/**
 * Wrap a scheduled job or a named step inside one so it shows up in lag reports
 * and reports its own worst synchronous block when it finishes. Nesting is fine:
 * a block inside an inner step is charged to the inner step AND to every step
 * enclosing it, which is what makes the outer cycle's number meaningful.
 */
export async function trackJob<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
  const entry: Entry = {
    id: nextId++, name, kind: "job", startedAt: Date.now(), endedAt: null,
    maxBlockMs: 0, blockedMs: 0, blocks: 0,
  };
  active.set(entry.id, entry);
  watchdogJobEvent("start", entry.id, name);
  try {
    return await fn();
  } finally {
    finish(entry);
    watchdogJobEvent("end", entry.id, name);
  }
}

/** Called by the request logger middleware. Returns a function to call on finish. */
export function trackRequest(label: string): () => void {
  const entry: Entry = {
    id: nextId++, name: label, kind: "request", startedAt: Date.now(), endedAt: null,
    maxBlockMs: 0, blockedMs: 0, blocks: 0,
  };
  active.set(entry.id, entry);
  watchdogJobEvent("start", entry.id, label);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    finish(entry);
    watchdogJobEvent("end", entry.id, label);
  };
}

/** Hand the event loop back. The unit of "one bounded step" everywhere else. */
export function yieldToLoop(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

/** How long one synchronous span may run before the loop gets a turn. */
export const SPAN_BUDGET_MS = envInt("LOOP_SPAN_BUDGET_MS", 200, 10, 5000);

/**
 * Walk `items`, handing the event loop back whenever the current span has run
 * longer than `budgetMs`.
 *
 * Time, not a row count, is the budget: the per-item cost in these loops spans
 * three orders of magnitude (settling a signal that finds no game is a single
 * indexed lookup; settling one that does writes an outcome, a settled_outcome, a
 * state change and a link), and it changes again by a factor of ten when the
 * disk is cold. A row count tuned for one of those cases is wrong for the
 * others, whereas a time budget self-corrects: a slow item yields after itself,
 * a fast one runs with the others until the budget is spent. The guarantee is
 * one item's cost over the budget, never a whole collection's.
 */
export async function forEachBounded<T>(
  items: readonly T[],
  work: (item: T, index: number) => void,
  budgetMs: number = SPAN_BUDGET_MS,
): Promise<void> {
  let spanStart = Date.now();
  for (let i = 0; i < items.length; i++) {
    work(items[i], i);
    if (Date.now() - spanStart >= budgetMs) {
      await yieldToLoop();
      spanStart = Date.now();
    }
  }
}

/* ─── Measurement surface (tests + the admin measurement run) ───────────── */

export function getStepStats(): StepStat[] {
  return Array.from(stats.values()).sort((a, b) => b.maxBlockMs - a.maxBlockMs);
}

/** Worst block observed since the last reset, attributed or not. */
export function getMaxObservedBlockMs(): number {
  return maxObservedBlockMs;
}

export function resetStepStats(): void {
  stats.clear();
  maxObservedBlockMs = 0;
}

/**
 * Record the steps still queued for their one-tick-late summary.
 *
 * A caller that reads getStepStats() the instant a cycle returns would otherwise
 * miss the cycle's last few steps — they finished after the final sampler tick.
 * Waiting a tick first (so their blocks are charged) and then flushing gives the
 * complete table.
 */
export function flushStepReports(): void {
  if (pendingReports.length === 0) return;
  const flushing = pendingReports;
  pendingReports = [];
  for (const e of flushing) record(e);
}

/** step -> max single block, as a table. Used by the regression test's output. */
export function formatStepStats(): string {
  const rows = getStepStats();
  if (rows.length === 0) return "(no steps recorded)";
  const pad = Math.max(...rows.map((r) => r.name.length));
  return rows
    .map((r) =>
      `${r.name.padEnd(pad)}  maxBlock=${String(r.maxBlockMs).padStart(6)}ms` +
      `  maxWall=${String(r.maxWallMs).padStart(6)}ms  calls=${r.calls}`,
    )
    .join("\n");
}

/* ─── The sampler ────────────────────────────────────────────────────────── */

function describe(entries: Array<{ entry: Entry; overlapMs: number }>): string {
  if (entries.length === 0) return "none";
  const now = Date.now();
  return entries
    .sort((a, b) => b.overlapMs - a.overlapMs)
    .map(({ entry: e, overlapMs }) =>
      `${e.name} (${(e.endedAt ?? now) - e.startedAt}ms${e.endedAt ? ", ended" : ""}, overlap ${overlapMs}ms)`)
    .join(", ");
}

/**
 * Everything whose lifetime overlaps [from, to], with the overlap in ms.
 *
 * The overlap, not the whole lag, is what a step gets charged. A step that ran
 * for 1ms inside a 50ms block cannot have caused 50ms of it, and charging it the
 * full lag made short steps look like the blocker — the first version of this
 * file reported exactly that. The overlap is still an upper bound (a step that
 * was parked in `await fetch` for its whole overlap gets charged anyway), so when
 * two steps overlap the same span the report names both and lets the reader
 * decide; it never charges a step less than it actually blocked.
 */
function overlapping(from: number, to: number, kind: Entry["kind"]): Array<{ entry: Entry; overlapMs: number }> {
  const out: Array<{ entry: Entry; overlapMs: number }> = [];
  const consider = (e: Entry) => {
    if (e.kind !== kind) return;
    const start = Math.max(from, e.startedAt);
    const end = Math.min(to, e.endedAt ?? to);
    if (end <= start) return;
    out.push({ entry: e, overlapMs: end - start });
  };
  active.forEach(consider);
  for (const e of recent) consider(e);
  return out;
}

let started = false;

export function startEventLoopMonitor(): void {
  if (started) return;
  started = true;
  let expected = Date.now() + CHECK_MS;
  const timer = setInterval(() => {
    const now = Date.now();
    const lag = now - expected;
    expected = now + CHECK_MS;

    if (lag >= ATTRIBUTE_MIN_MS) {
      if (lag > maxObservedBlockMs) maxObservedBlockMs = lag;
      const from = now - lag;
      const jobs = overlapping(from, now, "job");
      const requests = overlapping(from, now, "request");
      for (const { entry, overlapMs } of [...jobs, ...requests]) {
        const charged = Math.min(lag, overlapMs);
        if (charged > entry.maxBlockMs) entry.maxBlockMs = charged;
        entry.blockedMs += charged;
        entry.blocks++;
      }
      if (lag >= WARN_THRESHOLD_MS) {
        console.warn(
          `[loop-lag] event loop blocked ~${lag}ms | jobs: ${describe(jobs)} | requests: ${describe(requests)}`,
        );
      }
    }

    // Flush AFTER attribution, so a step that ended at the end of its own worst
    // block still reports that block.
    if (pendingReports.length > 0) {
      const flushing = pendingReports;
      pendingReports = [];
      for (const e of flushing) record(e);
    }
  }, CHECK_MS);
  timer.unref();
  console.log(
    `[loop-lag] monitor started (sample every ${CHECK_MS}ms, attribute at >=${ATTRIBUTE_MIN_MS}ms, ` +
    `warn at >=${WARN_THRESHOLD_MS}ms, step report at >=${STEP_REPORT_MS}ms${STEP_LOG_ALL ? ", logging every step" : ""})`,
  );
}
