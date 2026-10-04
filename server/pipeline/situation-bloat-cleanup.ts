/**
 * Edge Setter — retroactive situation churn cleanup (Phase 1).
 *
 * Deletes the rows ESPN's re-reported injuries minted: one duplicate
 * situation_created event per listed player per day (per poll before #64), each
 * fanning out into a near-identical snapshot and a snapshot_created event.
 * situation_events reached ~1.1GB, the worst situations hold 2,500-3,600 rows,
 * and that is what took /api/v2/situations down and crash-looped #70. #72/#73
 * stopped the bleeding going forward; this is the only thing that removes what
 * already landed.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THIS NEVER RUNS BY ITSELF. No boot hook, no ingestion-cycle hook, no cron, no
 * import from server/index.ts or ingestion.ts — a guard test asserts those files
 * do not reference this module. The ONLY way in is an authenticated admin POST to
 * /api/pipeline/admin/situation-cleanup. The reason is the incident history: the
 * last two situations outages were a boot-time job and an unbounded read loop on
 * a service whose DB driver is synchronous, and a destructive job that can start
 * itself is a job that will start during the next deploy, unattended, with the
 * operator asleep. Everything below assumes a human is watching:
 *   - the POST returns immediately and the work runs in the background,
 *   - a kill switch in pipeline_meta is checked between every chunk,
 *   - maxSituations defaults to 25, so the first run is small by default,
 *   - dryRun plans everything and deletes nothing.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ORDER OF OPERATIONS, per situation, inside ONE transaction:
 *   1. INSERT OR IGNORE the situation_founding_audit row, recording the LIVE
 *      founding count taken BEFORE any delete. Phase 0 (#74) made both guard read
 *      paths consult that row; writing it after the delete, or in a separate
 *      transaction that could fail independently, would hand a still-corrupted
 *      situation's inflated confidence back to customers.
 *   2. Delete the duplicate situation_created events.
 *   3. Delete the redundant snapshots.
 *   4. Delete the snapshot_created events paired with exactly those snapshots —
 *      never the paired event of a snapshot we kept.
 *
 * WHAT IS NOT TOUCHED. The history tables (situation_confidence_history,
 * situation_state_history, situation_relationships,
 * situation_public_confirmations) and situations itself: not a row. No VACUUM —
 * reclaiming the free pages is a separate, long, exclusive operation and this job
 * is already the risky part. evidence_event_ids_json, previous_snapshot_hash and
 * every replay_hash are left exactly as written, so replay parity is unaffected.
 *
 * A note on that last point, because it looks like a dangling reference and is
 * not a bug: a kept snapshot's evidence_event_ids may name events this job
 * deleted. Nothing dereferences that list — every reader uses only its LENGTH
 * (isUsableSituation, the record's evidence depth) — and rewriting it would
 * change snapshot content, hence replay hashes, which requirement 9 forbids and
 * which the append-only guards would refuse anyway.
 */

import type Database from "better-sqlite3";

import { trackJob } from "../event-loop-monitor";
import { computeSituationCleanupPlan, type SituationCleanupPlan } from "./situation-bloat-plan";
import { fetchBloatPlanEvents, fetchBloatPlanSnapshots } from "./situation-bloat-rows";
import {
  dropSituationCleanupDeleteGuards,
  ensureSituationSchema,
  restoreSituationCleanupDeleteGuards,
  situationAppendOnlyGuardStatus,
} from "./situations-store";
import { getPipelineDb, getPipelineMeta, setPipelineMeta } from "./store";

const JOB_NAME = "situation-bloat-cleanup";
const LOG = "[situation-cleanup]";

const VALID_LEAGUES = ["NBA", "MLB", "NFL", "CFB"] as const;

/** Situations read per keyset page. Read-only; only the page is held in memory. */
const SITUATION_PAGE_SIZE = 200;

/** Rows per delete transaction, before adaptation. */
const CHUNK_TARGET_ROWS = 200;
/** Floor for the adaptive chunk size. Below this the per-chunk overhead dominates. */
const CHUNK_MIN_ROWS = 25;
/** A chunk slower than this halves the target: better-sqlite3 is synchronous, so a
 *  slow transaction IS event-loop lag, and lag is what failed the Render health
 *  check in September. */
const CHUNK_SLOW_MS = 1000;
/** A chunk faster than this grows the target back toward CHUNK_TARGET_ROWS. */
const CHUNK_FAST_MS = 200;
/** WAL truncation cadence. The WAL is what filled /var/data; deletes grow it. */
const CHECKPOINT_EVERY_CHUNKS = 25;

const DEFAULT_MAX_SITUATIONS = 25;

const META_PREFIX = "situation_bloat_cleanup";
/** One global kill switch: there is only ever one run in flight. */
const STOP_KEY = `${META_PREFIX}:stop`;

function scopeKey(league: string, type: string | null): string {
  return type ? `${league}:${type}` : league;
}
function doneKey(scope: string): string {
  return `${META_PREFIX}:done:${scope}`;
}
function cursorKey(scope: string): string {
  return `${META_PREFIX}:cursor:${scope}`;
}

export interface SituationBloatCleanupOptions {
  readonly league: string;
  readonly type?: string | null;
  /** Cap on situations this run DELETES from. Default 25. */
  readonly maxSituations?: number;
  /** Plan everything, delete nothing, write no marker and no cursor. */
  readonly dryRun?: boolean;
  readonly db?: Database.Database;
  /**
   * Test seam. Called inside the chunk transaction AFTER the deletes and BEFORE
   * the guard triggers are restored; throwing from it proves that a mid-chunk
   * failure rolls the dropped trigger back along with the rows.
   */
  readonly beforeChunkCommit?: (chunkIndex: number) => void;
}

export type SituationBloatCleanupStatus =
  | "idle"
  | "running"
  /** Walked the whole scope; the completion marker is written. */
  | "completed"
  /** The kill switch fired between chunks. Resumable. */
  | "stopped"
  /** maxSituations reached. Resumable. */
  | "capped"
  /** The scope already carries a completion marker; nothing was read. */
  | "skipped"
  | "failed";

export interface SituationBloatCleanupResult {
  readonly status: SituationBloatCleanupStatus;
  readonly scope: string;
  readonly league: string;
  readonly type: string | null;
  readonly dryRun: boolean;
  readonly maxSituations: number;
  readonly situationsScanned: number;
  readonly situationsCleaned: number;
  readonly eventsDeleted: number;
  readonly snapshotsDeleted: number;
  readonly duplicateFoundingDeleted: number;
  readonly redundantSnapshotEventsDeleted: number;
  readonly bytesFreed: number;
  readonly auditRowsWritten: number;
  readonly keepKey: {
    created_from_event_id: number;
    earliest_no_match: number;
    earliest_no_created_from: number;
    founder_not_earliest: number;
  };
  readonly chunks: number;
  readonly finalChunkSize: number;
  readonly deleteMs: number;
  readonly elapsedMs: number;
  readonly cursor: string | null;
  readonly error: string | null;
}

interface Progress {
  status: SituationBloatCleanupStatus;
  scope: string | null;
  league: string | null;
  type: string | null;
  dryRun: boolean;
  maxSituations: number;
  startedAt: string | null;
  finishedAt: string | null;
  chunks: number;
  chunkSize: number;
  lastChunkMs: number;
  deleteMs: number;
  situationsScanned: number;
  situationsCleaned: number;
  eventsDeleted: number;
  snapshotsDeleted: number;
  bytesFreed: number;
  cursor: string | null;
  error: string | null;
}

function idleProgress(): Progress {
  return {
    status: "idle",
    scope: null,
    league: null,
    type: null,
    dryRun: false,
    maxSituations: DEFAULT_MAX_SITUATIONS,
    startedAt: null,
    finishedAt: null,
    chunks: 0,
    chunkSize: CHUNK_TARGET_ROWS,
    lastChunkMs: 0,
    deleteMs: 0,
    situationsScanned: 0,
    situationsCleaned: 0,
    eventsDeleted: 0,
    snapshotsDeleted: 0,
    bytesFreed: 0,
    cursor: null,
    error: null,
  };
}

let progress: Progress = idleProgress();
let inFlight: Promise<SituationBloatCleanupResult> | null = null;

/* ── Kill switch ─────────────────────────────────────────────────────────── */

/**
 * Raise the kill switch. Durable (pipeline_meta), so it also survives a restart
 * and stops a job that a restart would otherwise have resumed by hand.
 */
export function requestSituationBloatCleanupStop(db: Database.Database = getPipelineDb()): { stopRequested: true; running: boolean } {
  setPipelineMeta(STOP_KEY, new Date().toISOString(), db);
  console.log(`${LOG} stop requested (running=${progress.status === "running"})`);
  return { stopRequested: true, running: progress.status === "running" };
}

/**
 * pipeline_meta rows are upserted, never deleted, so "cleared" is the empty
 * string rather than a missing key — and an empty string must NOT read as a stop,
 * or the first stop ever issued would wedge every future run.
 */
function stopRequested(db: Database.Database): boolean {
  const value = getPipelineMeta(STOP_KEY, db);
  return value !== null && value !== "";
}

function clearStop(db: Database.Database): void {
  setPipelineMeta(STOP_KEY, "", db);
}

/* ── Status ──────────────────────────────────────────────────────────────── */

export interface SituationBloatCleanupStatusReport {
  readonly progress: Progress;
  readonly stopRequested: boolean;
  readonly completedScopes: { scope: string; finished_at: string }[];
  readonly cursors: { scope: string; situation_id: string }[];
}

export function getSituationBloatCleanupStatus(
  db: Database.Database = getPipelineDb(),
): SituationBloatCleanupStatusReport {
  const rows = db.prepare(
    `SELECT key, value FROM pipeline_meta WHERE key LIKE ? ORDER BY key ASC`,
  ).all(`${META_PREFIX}:%`) as { key: string; value: string | null }[];

  const completedScopes: { scope: string; finished_at: string }[] = [];
  const cursors: { scope: string; situation_id: string }[] = [];
  let stop = false;
  for (const row of rows) {
    if (row.key === STOP_KEY) { stop = Boolean(row.value); continue; }
    if (row.key.startsWith(`${META_PREFIX}:done:`)) {
      completedScopes.push({ scope: row.key.slice(`${META_PREFIX}:done:`.length), finished_at: row.value ?? "" });
    } else if (row.key.startsWith(`${META_PREFIX}:cursor:`)) {
      cursors.push({ scope: row.key.slice(`${META_PREFIX}:cursor:`.length), situation_id: row.value ?? "" });
    }
  }
  return { progress: { ...progress }, stopRequested: stop, completedScopes, cursors };
}

/* ── Entry point ─────────────────────────────────────────────────────────── */

/**
 * Start the cleanup in the background and return immediately.
 *
 * Refuses a second concurrent run: two of these interleaving would drop each
 * other's guard triggers and double-count the cursor.
 */
export function startSituationBloatCleanup(
  options: SituationBloatCleanupOptions,
): { accepted: boolean; reason?: string; scope: string } {
  const league = options.league?.toUpperCase?.() ?? "";
  const scope = scopeKey(league, options.type ?? null);
  if (inFlight) return { accepted: false, reason: "a situation cleanup is already running", scope };

  const run = trackJob(JOB_NAME, () => runSituationBloatCleanup(options));
  inFlight = run;
  void run
    .catch((err: unknown) => {
      console.error(`${LOG} job failed:`, err instanceof Error ? err.message : err);
      return null;
    })
    .finally(() => { inFlight = null; });
  return { accepted: true, scope };
}

/** Awaitable form, used by the tests and by {@link startSituationBloatCleanup}. */
export async function runSituationBloatCleanup(
  options: SituationBloatCleanupOptions,
): Promise<SituationBloatCleanupResult> {
  const db = options.db ?? getPipelineDb();
  const league = (options.league ?? "").toUpperCase();
  const type = options.type?.trim() ? options.type.trim() : null;
  const dryRun = options.dryRun === true;
  const maxSituations = Math.max(1, Math.floor(options.maxSituations ?? DEFAULT_MAX_SITUATIONS));
  const scope = scopeKey(league, type);

  if (!VALID_LEAGUES.includes(league as typeof VALID_LEAGUES[number])) {
    throw new Error(`league must be one of: ${VALID_LEAGUES.join(", ")}`);
  }

  // The ONLY ensureSituationSchema in this module, and it is before the loop.
  // Inside the loop it would rebuild the schema per chunk and, worse, re-create
  // the very guard trigger a chunk had just dropped — hiding an unguarded table.
  ensureSituationSchema(db);

  const startedGuards = situationAppendOnlyGuardStatus(db);
  if (!startedGuards.ok) {
    throw new Error(`refusing to start: append-only guards already missing (${startedGuards.missing.join(", ")})`);
  }

  const startedAt = Date.now();
  const counters = {
    situationsScanned: 0,
    situationsCleaned: 0,
    eventsDeleted: 0,
    snapshotsDeleted: 0,
    duplicateFoundingDeleted: 0,
    redundantSnapshotEventsDeleted: 0,
    bytesFreed: 0,
    auditRowsWritten: 0,
    keepKey: {
      created_from_event_id: 0,
      earliest_no_match: 0,
      earliest_no_created_from: 0,
      founder_not_earliest: 0,
    },
  };

  let chunks = 0;
  let chunkSize = CHUNK_TARGET_ROWS;
  let deleteMs = 0;

  /**
   * Two cursors, because they answer different questions.
   *
   * pageCursor drives the keyset walk and advances as soon as a page is READ. It
   * has to: without it the walk re-reads the same page forever, which is exactly
   * what a dry run did when it shared one cursor with the durable one and so never
   * moved it.
   *
   * committedCursor is the durable resume point and advances only when a chunk
   * COMMITS, so it never runs ahead of the deletes. A run that stops or caps
   * mid-page leaves it on the last situation actually committed, and the next run
   * re-reads from there — re-planning a cleaned situation is a no-op, so a little
   * overlap is free and a gap would not be.
   */
  let pageCursor = dryRun ? "" : getPipelineMeta(cursorKey(scope), db) ?? "";
  let committedCursor: string | null = pageCursor || null;

  progress = {
    ...idleProgress(),
    status: "running",
    scope, league, type, dryRun, maxSituations,
    startedAt: new Date(startedAt).toISOString(),
    chunkSize,
    cursor: committedCursor,
  };

  const finish = (status: SituationBloatCleanupStatus, error: string | null = null): SituationBloatCleanupResult => {
    progress = {
      ...progress,
      status,
      error,
      finishedAt: new Date().toISOString(),
      chunks,
      chunkSize,
      deleteMs,
      cursor: committedCursor,
      situationsScanned: counters.situationsScanned,
      situationsCleaned: counters.situationsCleaned,
      eventsDeleted: counters.eventsDeleted,
      snapshotsDeleted: counters.snapshotsDeleted,
      bytesFreed: counters.bytesFreed,
    };
    const result: SituationBloatCleanupResult = {
      status, scope, league, type, dryRun, maxSituations,
      ...counters,
      chunks,
      finalChunkSize: chunkSize,
      deleteMs,
      elapsedMs: Date.now() - startedAt,
      cursor: committedCursor,
      error,
    };
    console.log(`${LOG} ${status} scope=${scope} dryRun=${dryRun} ${JSON.stringify({
      scanned: counters.situationsScanned,
      cleaned: counters.situationsCleaned,
      events: counters.eventsDeleted,
      snapshots: counters.snapshotsDeleted,
      mb: Math.round(counters.bytesFreed / 1048.576) / 1000,
      chunks,
      deleteMs,
      elapsedMs: result.elapsedMs,
    })}`);
    return result;
  };

  // A finished scope costs one point lookup, never a scan.
  if (!dryRun && getPipelineMeta(doneKey(scope), db)) {
    return finish("skipped");
  }

  // Starting is an explicit intent that supersedes an earlier stop; otherwise a
  // single stop would permanently wedge every future run.
  if (!dryRun) clearStop(db);

  const situationPage = db.prepare(`
    SELECT situation_id, created_from_event_id
    FROM situations
    WHERE situation_id > ?
      AND league = ?
      ${type ? "AND situation_type = ?" : ""}
    ORDER BY situation_id ASC
    LIMIT ?
  `);

  const insertAudit = db.prepare(`
    INSERT OR IGNORE INTO situation_founding_audit (
      situation_id, founding_row_count, kept_event_id, keep_key_source,
      deleted_row_count, audited_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const deleteEvent = db.prepare(`DELETE FROM situation_events WHERE event_id = ?`);
  const deleteSnapshot = db.prepare(`DELETE FROM situation_snapshots WHERE snapshot_id = ?`);
  const writeCursor = db.prepare(`
    INSERT INTO pipeline_meta (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  /** Situations planned but not yet committed, plus the window's last situation_id. */
  let pending: { situationId: string; plan: SituationCleanupPlan }[] = [];
  let pendingRows = 0;
  let windowLastId: string | null = null;

  /**
   * Commit one chunk: drop the delete guards, write each situation's audit row and
   * then its deletes, restore the guards, advance the cursor — all in ONE
   * transaction. SQLite rolls DDL back with everything else, so a throw anywhere
   * in here restores the triggers along with the rows: the table is never left
   * open to deletes, not even for the width of a crash.
   */
  const commitChunk = db.transaction((batch: typeof pending, cursorTo: string | null, chunkIndex: number) => {
    dropSituationCleanupDeleteGuards(db);
    const auditedAt = new Date().toISOString();

    for (const { situationId, plan } of batch) {
      // (1) The audit row FIRST, carrying the pre-delete live count.
      if (plan.foundingRowCount > 0 && plan.keepKeySource) {
        const written = insertAudit.run(
          situationId,
          plan.foundingRowCount,
          plan.keptFoundingEventId,
          plan.keepKeySource,
          plan.duplicateFoundingCount,
          auditedAt,
        );
        if (written.changes > 0) counters.auditRowsWritten++;
      }
      // (2) + (4) duplicate founding rows and the paired events of (3).
      for (const eventId of plan.deleteEventIds) deleteEvent.run(eventId);
      // (3) the redundant snapshots themselves.
      for (const snapshotId of plan.deleteSnapshotIds) deleteSnapshot.run(snapshotId);
    }

    options.beforeChunkCommit?.(chunkIndex);

    restoreSituationCleanupDeleteGuards(db);
    if (cursorTo !== null) writeCursor.run(cursorKey(scope), cursorTo, auditedAt);
  });

  const flush = (): void => {
    const cursorTo = dryRun ? null : windowLastId;
    const batch = pending;
    pending = [];
    const rows = pendingRows;
    pendingRows = 0;

    if (batch.length === 0 && cursorTo === null) return;

    if (dryRun) {
      // Nothing to commit, but the plans still count. Chunk accounting is kept
      // identical to the real run so the two are comparable.
      if (batch.length === 0) return;
      chunks++;
      for (const { plan } of batch) tally(plan);
      console.log(`${LOG} chunk ${chunks} (dry-run) situations=${batch.length} rows=${rows} target=${chunkSize}`);
      return;
    }

    if (batch.length === 0) {
      // Pure scan window: advance the cursor so the next run does not re-walk it.
      writeCursor.run(cursorKey(scope), cursorTo, new Date().toISOString());
      committedCursor = cursorTo;
      return;
    }

    chunks++;
    const chunkStart = Date.now();
    commitChunk(batch, cursorTo, chunks);
    const chunkMs = Date.now() - chunkStart;
    deleteMs += chunkMs;
    if (cursorTo !== null) committedCursor = cursorTo;

    for (const { plan } of batch) tally(plan);

    // The verification requirement 6 asks for, and the reason it is ensure-free:
    // a verify that could re-create the trigger would always report ok.
    const guards = situationAppendOnlyGuardStatus(db);
    if (!guards.ok) {
      throw new Error(`append-only guards missing after chunk ${chunks}: ${guards.missing.join(", ")}`);
    }

    console.log(`${LOG} chunk ${chunks} situations=${batch.length} rows=${rows} ms=${chunkMs} target=${chunkSize} cumulative={events:${counters.eventsDeleted},snapshots:${counters.snapshotsDeleted},deleteMs:${deleteMs}}`);

    // Adaptive: measured on the transaction, because that is the span that blocks
    // the event loop and failed the Render health check in September.
    if (chunkMs > CHUNK_SLOW_MS && chunkSize > CHUNK_MIN_ROWS) {
      chunkSize = Math.max(CHUNK_MIN_ROWS, Math.floor(chunkSize / 2));
      console.log(`${LOG} chunk ${chunks} took ${chunkMs}ms -> target ${chunkSize}`);
    } else if (chunkMs < CHUNK_FAST_MS && chunkSize < CHUNK_TARGET_ROWS) {
      chunkSize = Math.min(CHUNK_TARGET_ROWS, chunkSize * 2);
      console.log(`${LOG} chunk ${chunks} took ${chunkMs}ms -> target ${chunkSize}`);
    }

    if (chunks % CHECKPOINT_EVERY_CHUNKS === 0) {
      // Outside any transaction. Deletes grow the WAL, and a full /var/data is
      // what silently repointed the DB resolvers at /tmp in September.
      db.pragma("wal_checkpoint(TRUNCATE)");
      console.log(`${LOG} wal_checkpoint(TRUNCATE) after chunk ${chunks}`);
    }

    progress = {
      ...progress,
      chunks,
      chunkSize,
      lastChunkMs: chunkMs,
      deleteMs,
      cursor: committedCursor,
      situationsScanned: counters.situationsScanned,
      situationsCleaned: counters.situationsCleaned,
      eventsDeleted: counters.eventsDeleted,
      snapshotsDeleted: counters.snapshotsDeleted,
      bytesFreed: counters.bytesFreed,
    };
  };

  function tally(plan: SituationCleanupPlan): void {
    counters.situationsCleaned++;
    counters.eventsDeleted += plan.deleteEventIds.length;
    counters.snapshotsDeleted += plan.deleteSnapshotIds.length;
    counters.duplicateFoundingDeleted += plan.duplicateFoundingCount;
    counters.redundantSnapshotEventsDeleted += plan.redundantSnapshotEventCount;
    counters.bytesFreed += plan.bytes;
    if (plan.keepKeySource) counters.keepKey[plan.keepKeySource]++;
    if (plan.founderNotEarliest) counters.keepKey.founder_not_earliest++;
  }

  let outcome: SituationBloatCleanupStatus = "completed";

  try {
    walk: for (;;) {
      if (stopRequested(db)) { outcome = "stopped"; break; }

      const params = type ? [pageCursor, league, type, SITUATION_PAGE_SIZE] : [pageCursor, league, SITUATION_PAGE_SIZE];
      const page = situationPage.all(...params) as { situation_id: string; created_from_event_id: string | null }[];
      if (page.length === 0) break;
      // Advance the walk the moment the page is read, not when it commits — the
      // durable resume point is committedCursor and moves separately.
      pageCursor = page[page.length - 1].situation_id;

      for (const situation of page) {
        // Rows are fetched one situation at a time rather than a page at a time:
        // the worst prod situation carries ~1,803 snapshots and ~1,803 events, so
        // a 200-situation page of those is hundreds of thousands of rows resident
        // at once. Flat memory matters more than query count on this service.
        const events = fetchBloatPlanEvents(db, [situation.situation_id]).get(situation.situation_id) ?? [];
        const snapshots = fetchBloatPlanSnapshots(db, [situation.situation_id]).get(situation.situation_id) ?? [];
        const plan = computeSituationCleanupPlan({
          situationId: situation.situation_id,
          createdFromEventId: situation.created_from_event_id,
          events,
          snapshots,
        });

        counters.situationsScanned++;
        windowLastId = situation.situation_id;

        const rows = plan.deleteEventIds.length + plan.deleteSnapshotIds.length;
        if (rows > 0) {
          pending.push({ situationId: situation.situation_id, plan });
          pendingRows += rows;
        }

        // maxSituations is a HARD cap and has to be enforced here, at the push,
        // not after a flush: a page of 200 situations holding one removable row
        // each never crosses the row budget, so a flush-time check would let a
        // run asked for 25 situations delete from 200.
        if (counters.situationsCleaned + pending.length >= maxSituations) {
          flush();
          outcome = "capped";
          break walk;
        }

        // A situation's audit row and its deletes are never split across
        // transactions, so the row budget is a floor to cross rather than a hard
        // cap: one churned situation can exceed it on its own and becomes its own
        // chunk. Atomicity per situation is the requirement; the budget is there
        // to bound how LONG a transaction runs.
        if (pendingRows >= chunkSize) {
          flush();
          if (stopRequested(db)) { outcome = "stopped"; break walk; }
          await yieldToLoop();
        }
      }

      flush();
      if (counters.situationsCleaned >= maxSituations) { outcome = "capped"; break; }
      await yieldToLoop();
    }

    flush();
    if (outcome === "completed" && !dryRun) {
      setPipelineMeta(doneKey(scope), new Date().toISOString(), db);
    }
    return finish(outcome);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // The transaction has already rolled back, triggers included. Say plainly
    // whether that held, because "the guards are gone" is the one outcome here
    // that must never be inferred from silence.
    const guards = situationAppendOnlyGuardStatus(db);
    console.error(`${LOG} FAILED scope=${scope}: ${message} | guards_intact=${guards.ok}${guards.ok ? "" : ` missing=${guards.missing.join(",")}`}`);
    return finish("failed", guards.ok ? message : `${message} (APPEND-ONLY GUARDS MISSING: ${guards.missing.join(", ")})`);
  }
}

/**
 * Hand the event loop back between chunks. better-sqlite3 is synchronous, so
 * without this the whole walk is one uninterruptible block and the health check
 * times out — the exact failure mode of the September restarts.
 */
function yieldToLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
