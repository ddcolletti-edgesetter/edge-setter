/**
 * Edge Setter — retroactive exclusion of outcomes graded against an in-play line.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT WENT WRONG. `getClosingSnapshot(gameId)` is "newest odds_snapshots row
 * for this game", with no kickoff bound. Before the kickoff guard
 * (fix/odds-kickoff-guard) the odds adapter kept polling a game after it
 * started, so for any game it sampled in-play the newest snapshot holds a LIVE
 * price. Settlement then used that as the closing line, and both contamination
 * paths end in a wrong `hit`, not merely a wrong CLV:
 *
 *   - line_move          hit = clv > 0, and clv = line_at_signal − closing_line.
 *                        A live price decides the outcome outright.
 *   - injury_update,     closingLine = games.spread_line and
 *     lineup_change,     hit = favoriteCovers(game, …), which reads the same
 *     lineup_confirm     column. The adapter overwrote it in the same loop pass
 *                        that wrote the snapshot, so it is live too.
 *
 * That is why these rows are excluded rather than recomputed: a graded result
 * taken against a third-quarter number is not a pre-game forecast that needs a
 * better line, it is not a forecast at all. The rows are kept for audit, as
 * excluded_stale rows always have been — nothing here deletes anything.
 *
 * THE PREDICATE, and why EXISTS is the same question as MAX. The contaminated
 * set is "games whose NEWEST snapshot is post-kickoff", because that is the row
 * getClosingSnapshot returned. We test "games with ANY post-kickoff snapshot",
 * which is the identical set: if some snapshot is after kickoff then the max is
 * at least that one, hence also after kickoff; and conversely. The EXISTS form
 * is a seek on idx_odds_snapshots_game_time (game_id, snapshot_at DESC) instead
 * of a GROUP BY aggregate over the whole table, and the plan is pinned by test.
 *
 * WHY NOT games.updated_at. It looks like the obvious discriminator and it is
 * useless: touchGameSchedule and every status write bump it, so virtually every
 * finished game has updated_at > game_time. odds_snapshots is the only durable
 * record of when the adapter actually sampled a game.
 *
 * REVERSIBILITY is the reason excluded_reason exists. excluded_stale is one
 * boolean shared by every exclusion reason, so a reverse pass keyed on it would
 * release rows that the null-game stale sweep excluded for a completely
 * different and still-valid reason. So:
 *
 *   - forward claims only rows at excluded_stale = 0, and stamps its reason;
 *   - forward additionally SKIPS any row that also satisfies the null-game
 *     stale predicate, so it cannot claim a row that sweep owns even when it
 *     runs first (on a fresh DB, or if the backlog migration's completion
 *     marker is ever cleared);
 *   - reverse releases only rows carrying this sweep's own reason.
 *
 * Together those make the reverse incapable of un-excluding a stale-matched
 * row, in either run order. inplay-closing-exclusion.test.ts asserts exactly
 * that, in both orders, because it is the property an operator is trusting when
 * they type --reverse at 2am.
 *
 * NEVER RUNS BY ITSELF — no boot hook, no cycle hook, no cron, no route. The
 * only entry point is script/deploy2-inplay-closing.ts, which an operator runs
 * by hand and which plans-and-prints unless given --write. The incident history
 * behind that stance is in situation-bloat-cleanup.ts; the short version is
 * that this DB driver is synchronous and a destructive job able to start itself
 * will start during a deploy with nobody watching.
 * ────────────────────────────────────────────────────────────────────────────
 */
import type Database from "better-sqlite3";

import { yieldToLoop } from "../event-loop-monitor";
import { getPipelineDb } from "./store";
import {
  markSettledOutcomesExcluded,
  clearSettledOutcomesExcluded,
  countSettledOutcomesByReason,
  countStaleSettledOutcomes,
  getSettledOutcomeSignalIdsByReason,
  countSettledOutcomesPendingExclusion,
  setStorageBusyTimeoutMs,
} from "../storage";

/** The one value this sweep writes to outcomes.excluded_reason. */
export const INPLAY_CLOSING_REASON = "inplay_closing";

export const SWEEP_LEAGUES = ["CFB", "NFL", "NBA", "MLB"] as const;
export type SweepLeague = (typeof SWEEP_LEAGUES)[number];

export type SweepDirection = "forward" | "reverse";

/**
 * Rows per transaction. 500 is BOTH the default and the hard maximum.
 *
 * It is a maximum because --chunk scales the write-lock hold on both databases
 * linearly, and holding that lock is the one way this job can hurt the live
 * service: the app sets no busy_timeout of its own, so a blocked main-thread
 * write waits out better-sqlite3's 5,000ms default and then throws SQLITE_BUSY
 * — and 5s is also Render's health-check budget. There is no operator reason to
 * want a bigger batch (the job is minutes either way, by design), and a
 * mistyped --chunk 50000 would put 50,000 UPDATEs inside one transaction on
 * pipeline.db and the whole id list inside one on storage.db.
 */
export const SWEEP_CHUNK_MAX = 500;
const SWEEP_CHUNK_DEFAULT = 500;

/**
 * Milliseconds of real sleep between chunks, default.
 *
 * yieldToLoop() alone is NOT pacing. It is a setImmediate, so it yields this
 * process's event loop — and this process is not the app's. What the app needs
 * is wall-clock time during which the write lock is free, because SQLite's busy
 * handler is a retry loop, not a fair queue: committing and immediately
 * reacquiring means the app has to win a race on each retry. 250ms between
 * chunks is a window it cannot lose.
 */
export const SWEEP_PAUSE_MS_DEFAULT = 250;
export const SWEEP_PAUSE_MS_MAX = 60_000;

/**
 * Busy timeout this job sets on BOTH handles, explicitly.
 *
 * 5,000ms is deliberately the same number better-sqlite3 uses when the option
 * is omitted (lib/database.js: `'timeout' in options ? options.timeout : 5000`).
 * Setting it explicitly changes no behaviour today — the point is that the
 * value is now stated and pinned here rather than inherited from a dependency
 * default that could change under us, and that `PRAGMA busy_timeout` is visible
 * in the DB session an operator can inspect. Nothing else in this repo sets it;
 * see the note in situations-store.ts.
 *
 * This is OUR patience when the app holds the lock. It is not a safety limit on
 * how long we hold it — that is SWEEP_CHUNK_MAX and SWEEP_PAUSE_MS_DEFAULT.
 */
export const SWEEP_BUSY_TIMEOUT_MS = 5_000;

/**
 * Apply the busy timeout to both handles. Called by the entry-point script, not
 * by runSweep, and the distinction is deliberate: these handles are
 * process-wide singletons, so this mutates the session for everything else in
 * the process. In the operator script that is the whole process and exactly
 * what we want. If runSweep did it and were ever called in-process by the app,
 * it would silently retune the app's own writes.
 */
export function applySweepBusyTimeout(ms: number = SWEEP_BUSY_TIMEOUT_MS): void {
  getPipelineDb().pragma(`busy_timeout = ${Math.round(ms)}`);
  setStorageBusyTimeoutMs(Math.round(ms));
}

const sleep = (ms: number) =>
  ms <= 0 ? yieldToLoop() : new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface CandidateRow {
  id: string;
  signal_id: string;
  game_id: string;
  league: string;
  signal_type: string;
  hit: number | null;
  closing_line: number | null;
  clv: number | null;
  game_time: string | null;
  newest_snapshot_at: string | null;
}

export interface SweepCounts {
  /** outcomes rows excluded for any reason. */
  pipeline_excluded_total: number;
  /** outcomes rows carrying this sweep's reason. */
  pipeline_inplay_closing: number;
  /** settled_outcomes rows excluded for any reason (storage.db). */
  storage_excluded_total: number;
  /** settled_outcomes rows carrying this sweep's reason (storage.db). */
  storage_inplay_closing: number;
  /**
   * Rows every accuracy / leaderboard / calibration query actually counts:
   * hit IS NOT NULL AND excluded_stale = 0. This is the number that moves.
   */
  accuracy_eligible: number;
}

export interface SweepPlan {
  direction: SweepDirection;
  league: SweepLeague | null;
  /** The rows this run will act on — already truncated to max_rows. */
  candidates: CandidateRow[];
  /**
   * How many rows matched before max_rows truncated the list. Equal to
   * candidates.length when no cap applied. The operator needs both numbers:
   * one is this run's work, the other is how much is left.
   */
  candidates_in_scope: number;
  /** The --max-rows cap in force, or null for uncapped. */
  max_rows: number | null;
  /** True when the cap actually bit, i.e. candidates_in_scope > max_rows. */
  capped: boolean;
  /** Candidates with a graded hit — the subset that changes accuracy. */
  graded_candidates: number;
  /**
   * settled_outcomes rows out of step with outcomes for this reason, BEFORE
   * this run — the fingerprint of an earlier interrupted run. A write pass
   * repairs these whether or not it has candidates of its own.
   */
  mirror_drift: number;
  counts_before: SweepCounts;
  /** counts_before with this plan applied. In a dry run this is a projection. */
  counts_projected: SweepCounts;
}

/**
 * How long a write transaction actually held its database's write lock.
 *
 * Measured around the transaction call itself, so it includes any time spent
 * waiting on busy_timeout for the lock in the first place. That is the honest
 * boundary for "how long could the app have been blocked by, or behind, us":
 * a chunk that waited 3s to start and ran for 20ms is a 3s event for whoever
 * was queued behind it, not a 20ms one.
 */
export interface LockHoldStats {
  chunks: number;
  pipeline_ms_max: number;
  pipeline_ms_total: number;
  storage_ms_max: number;
  storage_ms_total: number;
  /** Worst single chunk, pipeline + storage — the number to compare to 5,000. */
  worst_chunk_ms: number;
}

export interface SweepResult extends SweepPlan {
  wrote: boolean;
  pipeline_changed: number;
  storage_changed: number;
  /** Of storage_changed, how many were repairs of an earlier interrupted run. */
  mirror_repaired: number;
  accuracy_refreshed: boolean;
  /** Re-read after the writes. Equals counts_before on a dry run. */
  counts_after: SweepCounts;
  /** All zeroes on a dry run, which holds no write lock at all. */
  lock_hold: LockHoldStats;
  /** Chunk size and pause actually used, after clamping. */
  chunk_size: number;
  pause_ms: number;
}

/* ─── Counting ──────────────────────────────────────────────────────────── */

export function countExclusions(db: Database.Database = getPipelineDb()): SweepCounts {
  const one = (sql: string, ...params: unknown[]) =>
    (db.prepare(sql).get(...params) as { n: number }).n;

  return {
    pipeline_excluded_total: one("SELECT COUNT(*) AS n FROM outcomes WHERE excluded_stale = 1"),
    pipeline_inplay_closing: one(
      "SELECT COUNT(*) AS n FROM outcomes WHERE excluded_reason = ?",
      INPLAY_CLOSING_REASON,
    ),
    storage_excluded_total: countStaleSettledOutcomes(),
    storage_inplay_closing: countSettledOutcomesByReason(INPLAY_CLOSING_REASON),
    accuracy_eligible: one(
      "SELECT COUNT(*) AS n FROM outcomes WHERE hit IS NOT NULL AND excluded_stale = 0",
    ),
  };
}

/* ─── Planning ──────────────────────────────────────────────────────────── */

/* The null-game stale predicate, verbatim from runSettlementBacklogMigration's
 * step 2 (settlement.ts). Duplicated rather than imported because that function
 * embeds it in an UPDATE and exports nothing reusable; the window numbers are
 * settlementWindowDays' per-league values. If those change, both copies move —
 * which inplay-closing-exclusion.test.ts guards by asserting a row matching this
 * predicate is never claimed. */
const NULL_GAME_STALE_PREDICATE = `
  s.game_id IS NULL
  AND julianday(g.game_time) - julianday(s.created_at) >
      (CASE s.league
         WHEN 'MLB' THEN 2 WHEN 'NBA' THEN 3
         WHEN 'NFL' THEN 8 WHEN 'CFB' THEN 8 ELSE 8 END)
`;

const FORWARD_SELECT = (leagueFilter: string) => `
  SELECT o.id, o.signal_id, o.game_id, o.hit, o.closing_line, o.clv,
         s.league, s.signal_type, g.game_time,
         (SELECT MAX(os2.snapshot_at) FROM odds_snapshots os2
          WHERE os2.game_id = o.game_id) AS newest_snapshot_at
  FROM outcomes o
  JOIN live_signals s ON s.id = o.signal_id
  JOIN games g        ON g.id = o.game_id
  WHERE o.excluded_stale = 0
    AND o.closing_line IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM odds_snapshots os
      WHERE os.game_id = o.game_id
        AND os.snapshot_at > g.game_time
    )
    AND NOT (${NULL_GAME_STALE_PREDICATE})
    ${leagueFilter}
  ORDER BY o.created_at ASC
`;

const REVERSE_SELECT = (leagueFilter: string) => `
  SELECT o.id, o.signal_id, o.game_id, o.hit, o.closing_line, o.clv,
         s.league, s.signal_type, g.game_time,
         (SELECT MAX(os2.snapshot_at) FROM odds_snapshots os2
          WHERE os2.game_id = o.game_id) AS newest_snapshot_at
  FROM outcomes o
  JOIN live_signals s ON s.id = o.signal_id
  LEFT JOIN games g   ON g.id = o.game_id
  WHERE o.excluded_reason = ?
    ${leagueFilter}
  ORDER BY o.created_at ASC
`;

/** The forward SELECT, exposed so the plan-pin test can EXPLAIN it. */
export function forwardCandidateSql(league: SweepLeague | null): string {
  return FORWARD_SELECT(league ? "AND s.league = ?" : "");
}

export function selectCandidates(
  direction: SweepDirection,
  league: SweepLeague | null,
  db: Database.Database = getPipelineDb(),
): CandidateRow[] {
  const leagueFilter = league ? "AND s.league = ?" : "";
  if (direction === "forward") {
    const sql = FORWARD_SELECT(leagueFilter);
    const params = league ? [league] : [];
    return db.prepare(sql).all(...params) as CandidateRow[];
  }
  const sql = REVERSE_SELECT(leagueFilter);
  const params: unknown[] = league
    ? [INPLAY_CLOSING_REASON, league]
    : [INPLAY_CLOSING_REASON];
  return db.prepare(sql).all(...params) as CandidateRow[];
}

function project(
  before: SweepCounts,
  direction: SweepDirection,
  candidates: CandidateRow[],
): SweepCounts {
  const n = candidates.length;
  const graded = candidates.filter((c) => c.hit !== null).length;
  const sign = direction === "forward" ? 1 : -1;
  return {
    pipeline_excluded_total: before.pipeline_excluded_total + sign * n,
    pipeline_inplay_closing: before.pipeline_inplay_closing + sign * n,
    // storage.db holds a settled_outcomes row only for signals that actually
    // settled, so the mirror moves by AT MOST n. Projected as the upper bound;
    // counts_after reports what really moved.
    storage_excluded_total: before.storage_excluded_total + sign * n,
    storage_inplay_closing: before.storage_inplay_closing + sign * n,
    accuracy_eligible: before.accuracy_eligible - sign * graded,
  };
}

/** Signal ids carrying this reason in each DB, for the reconcile/drift check. */
function mirrorSides(db: Database.Database): { pipeline: Set<string>; storage: Set<string> } {
  const pipeline = new Set(
    (db.prepare("SELECT signal_id FROM outcomes WHERE excluded_reason = ?")
      .all(INPLAY_CLOSING_REASON) as Array<{ signal_id: string }>).map((r) => r.signal_id),
  );
  const storage = new Set(getSettledOutcomeSignalIdsByReason(INPLAY_CLOSING_REASON));
  return { pipeline, storage };
}

/**
 * REPAIRABLE drift only, and the distinction matters.
 *
 * A pipeline outcome whose signal has no settled_outcomes row at all is not a
 * half-written mirror — the signal never settled into storage.db, or the row
 * predates a reseed of that file. Counting those would print a permanent
 * "an earlier run was interrupted" notice on every run, which trains the
 * operator to ignore the one notice that is supposed to mean something. So the
 * mark side is narrowed to rows storage.db actually holds and could still flip,
 * which is exactly what the repair pass will change.
 */
function countMirrorDrift(db: Database.Database): number {
  const { pipeline, storage } = mirrorSides(db);
  const pendingMark = [...pipeline].filter((id) => !storage.has(id));
  // The clear side needs no such narrowing: these rows are in storage.db by
  // definition, carrying our reason, with no pipeline row still claiming them.
  const pendingClear = [...storage].filter((id) => !pipeline.has(id));
  return countSettledOutcomesPendingExclusion(pendingMark) + pendingClear.length;
}

export function planSweep(
  direction: SweepDirection,
  league: SweepLeague | null,
  db: Database.Database = getPipelineDb(),
  maxRows: number | null = null,
): SweepPlan {
  const counts_before = countExclusions(db);
  const inScope = selectCandidates(direction, league, db);
  // The cap truncates the ORDERED list (created_at ASC), so repeated capped
  // runs walk the backlog oldest-first and never re-offer a row they already
  // flagged — the candidate predicate excludes it on the next pass.
  const candidates = maxRows != null ? inScope.slice(0, maxRows) : inScope;
  return {
    direction,
    league,
    candidates,
    candidates_in_scope: inScope.length,
    max_rows: maxRows,
    capped: maxRows != null && inScope.length > maxRows,
    graded_candidates: candidates.filter((c) => c.hit !== null).length,
    mirror_drift: countMirrorDrift(db),
    counts_before,
    // Projected from the CAPPED list, because that is the work this run does.
    counts_projected: project(counts_before, direction, candidates),
  };
}

/* ─── Running ───────────────────────────────────────────────────────────── */

export interface RunSweepOptions {
  direction: SweepDirection;
  league?: SweepLeague | null;
  /** Nothing is written unless this is true. Default false. */
  write?: boolean;
  /** Rows per transaction. Default 500, CLAMPED to [1, SWEEP_CHUNK_MAX]. */
  chunkSize?: number;
  /** Real sleep between chunks. Default 250ms, clamped to [0, 60000]. */
  pauseMs?: number;
  /** Stop after this many rows. Default null = uncapped. */
  maxRows?: number | null;
  /**
   * Run forceAccuracyRecompute + resetLeaderboardCache after a successful
   * write. Default true. Tests turn it off to keep the fixture pure SQL.
   */
  refreshAccuracy?: boolean;
  onChunk?: (progress: {
    done: number;
    total: number;
    /** Lock-hold for this chunk's pipeline.db transaction, ms. */
    pipelineMs: number;
    /** Lock-hold for this chunk's storage.db transaction, ms. */
    storageMs: number;
  }) => void;
  db?: Database.Database;
}

export async function runSweep(opts: RunSweepOptions): Promise<SweepResult> {
  const db = opts.db ?? getPipelineDb();
  const direction = opts.direction;
  const league = opts.league ?? null;
  const write = opts.write === true;
  // Clamped, not rejected: the caller that passes 50000 is a typo, and the
  // right response to a typo on a job like this is to do the safe thing and say
  // so. The script prints the clamp when it bites.
  const chunkSize = Math.min(SWEEP_CHUNK_MAX, Math.max(1, opts.chunkSize ?? SWEEP_CHUNK_DEFAULT));
  const pauseMs = Math.min(SWEEP_PAUSE_MS_MAX, Math.max(0, opts.pauseMs ?? SWEEP_PAUSE_MS_DEFAULT));
  const maxRows = opts.maxRows != null ? Math.max(0, Math.round(opts.maxRows)) : null;

  const plan = planSweep(direction, league, db, maxRows);

  const noLock: LockHoldStats = {
    chunks: 0,
    pipeline_ms_max: 0, pipeline_ms_total: 0,
    storage_ms_max: 0, storage_ms_total: 0,
    worst_chunk_ms: 0,
  };

  if (!write) {
    return {
      ...plan,
      wrote: false,
      pipeline_changed: 0,
      storage_changed: 0,
      mirror_repaired: 0,
      accuracy_refreshed: false,
      counts_after: plan.counts_before,
      lock_hold: noLock,
      chunk_size: chunkSize,
      pause_ms: pauseMs,
    };
  }

  // Each statement repeats the direction's own guard (excluded_stale = 0 going
  // forward, excluded_reason = ? coming back) on top of the id list. The ids
  // were snapshotted before the loop, so without that guard a concurrent writer
  // — or a re-run after a crash — could flip a row twice. With it, every chunk
  // is idempotent on its own.
  const forwardUpdate = db.prepare(`
    UPDATE outcomes
    SET excluded_stale = 1, excluded_reason = ?
    WHERE excluded_stale = 0 AND id = ?
  `);
  const reverseUpdate = db.prepare(`
    UPDATE outcomes
    SET excluded_stale = 0, excluded_reason = NULL
    WHERE excluded_reason = ? AND id = ?
  `);

  // One transaction per chunk, not per row: under WAL an auto-committed
  // statement fsyncs on its own, so a row-at-a-time pass over thousands of rows
  // is minutes of blocked loop. See the same note in settlement.ts.
  const applyChunk = db.transaction((rows: CandidateRow[]) => {
    let changed = 0;
    for (const r of rows) {
      const res = direction === "forward"
        ? forwardUpdate.run(INPLAY_CLOSING_REASON, r.id)
        : reverseUpdate.run(INPLAY_CLOSING_REASON, r.id);
      changed += res.changes;
    }
    return changed;
  });

  let pipeline_changed = 0;
  let storage_changed = 0;
  let mirror_repaired = 0;
  const lock_hold: LockHoldStats = {
    chunks: 0,
    pipeline_ms_max: 0, pipeline_ms_total: 0,
    storage_ms_max: 0, storage_ms_total: 0,
    worst_chunk_ms: 0,
  };

  for (let i = 0; i < plan.candidates.length; i += chunkSize) {
    const slice = plan.candidates.slice(i, i + chunkSize);

    // Timed around the transaction call, so the figure includes any wait for
    // the lock itself, not just the work once held. See LockHoldStats.
    const tPipeline = Date.now();
    pipeline_changed += applyChunk(slice);
    const pipelineMs = Date.now() - tPipeline;

    // Mirror into storage.db. Separate DB handle, so this is its own
    // transaction and cannot be rolled back with the pipeline chunk above: a
    // crash in between leaves pipeline.db flagged and storage.db not. That is
    // NOT self-healing on its own — the forward candidate query requires
    // excluded_stale = 0, so a re-run would find nothing left to do and never
    // revisit the row. The reconcile pass after this loop is what closes that
    // gap, and it is the reason a re-run can be described as safe.
    const signalIds = slice.map((r) => r.signal_id);
    const tStorage = Date.now();
    storage_changed += direction === "forward"
      ? markSettledOutcomesExcluded(signalIds, INPLAY_CLOSING_REASON)
      : clearSettledOutcomesExcluded(signalIds, INPLAY_CLOSING_REASON);
    const storageMs = Date.now() - tStorage;

    lock_hold.chunks++;
    lock_hold.pipeline_ms_total += pipelineMs;
    lock_hold.storage_ms_total += storageMs;
    if (pipelineMs > lock_hold.pipeline_ms_max) lock_hold.pipeline_ms_max = pipelineMs;
    if (storageMs > lock_hold.storage_ms_max) lock_hold.storage_ms_max = storageMs;
    if (pipelineMs + storageMs > lock_hold.worst_chunk_ms) {
      lock_hold.worst_chunk_ms = pipelineMs + storageMs;
    }

    opts.onChunk?.({
      done: Math.min(i + chunkSize, plan.candidates.length),
      total: plan.candidates.length,
      pipelineMs,
      storageMs,
    });

    // Real sleep, not setImmediate: the point is wall-clock time with the write
    // lock free, so the app can win it. Skipped after the final chunk — there
    // is nothing left to pace against.
    const isLastChunk = i + chunkSize >= plan.candidates.length;
    if (!isLastChunk) await sleep(pauseMs);
  }

  // ── Reconcile storage.db against pipeline.db for this reason ────────────
  // pipeline.db is the source of truth. Anything carrying the reason there must
  // be excluded in storage.db, and anything carrying it ONLY in storage.db is a
  // leftover from an interrupted run and must be released. Both statements are
  // idempotent and scoped to this reason, so this is a no-op on a clean run and
  // a repair on a dirty one — including a run whose candidate list came back
  // empty precisely because an earlier attempt had already flagged the rows.
  {
    const { pipeline: pipelineIds, storage: storageIds } = mirrorSides(db);
    const toMark = [...pipelineIds].filter((id) => !storageIds.has(id));
    const toClear = [...storageIds].filter((id) => !pipelineIds.has(id));

    if (toMark.length > 0) {
      const repaired = markSettledOutcomesExcluded(toMark, INPLAY_CLOSING_REASON);
      storage_changed += repaired;
      mirror_repaired += repaired;
    }
    if (toClear.length > 0) {
      const repaired = clearSettledOutcomesExcluded(toClear, INPLAY_CLOSING_REASON);
      storage_changed += repaired;
      mirror_repaired += repaired;
    }
    await yieldToLoop();
  }

  let accuracy_refreshed = false;
  // Gated on work actually done, not on the candidate count: a run whose only
  // effect was repairing the mirror still changed what the leaderboard reads.
  if (opts.refreshAccuracy !== false && (pipeline_changed > 0 || storage_changed > 0)) {
    // Imported here, not at module load: settlement.ts pulls in every score
    // adapter, and this module is also imported by a test that has no business
    // loading them.
    const { forceAccuracyRecompute } = await import("./settlement");
    const { resetLeaderboardCache } = await import("../leaderboard-cache");
    forceAccuracyRecompute();
    // Honest caveat for the operator: this clears the cache in THIS process. The
    // live server holds its own module-scoped copy that no settlement path
    // invalidates today, so after an out-of-process run the leaderboard stays
    // stale until its 60s TTL expires. 60s, not indefinitely — see
    // leaderboard-cache.ts.
    resetLeaderboardCache();
    accuracy_refreshed = true;
  }

  return {
    ...plan,
    wrote: true,
    pipeline_changed,
    storage_changed,
    mirror_repaired,
    accuracy_refreshed,
    counts_after: countExclusions(db),
    lock_hold,
    chunk_size: chunkSize,
    pause_ms: pauseMs,
  };
}
