/**
 * Edge Setter — the reads that feed {@link computeSituationCleanupPlan}.
 *
 * Split out from situation-bloat-plan.ts so the plan stays pure, and kept in ONE
 * place so the dry-run report and the delete job cannot disagree about row ORDER.
 * Order is the whole game here: the plan's "first snapshot" and "unchanged vs the
 * last kept" are order-dependent, and the duplicate rows of a churned situation
 * share a created_at, so two callers ordering by timestamp would silently keep
 * different rows. Both get rows in rowid order, from this module, or the equality
 * the dry-run promises is a coincidence.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * INCIDENT 2026-10-04 03:17-03:22 UTC. A DRY RUN of NFL:injury — zero deletes —
 * blocked the event loop for 10-35s at a time ("still blocked 30s | active:
 * situation-bloat-cleanup") and Render killed the instance twice on health-check
 * timeouts. #76 had sliced the DELETE transactions to 200 rows, but every PLAN
 * READ was still a single unbounded .all(): NFL injury situations carry up to ~6MB
 * of payload each (764MB over 2,064 situations) and prod cold-disk reads measured
 * ~4MB/s, so one situation alone could be a multi-second synchronous step.
 *
 * So reads are now paginated, budgeted and yielded between, exactly like the
 * deletes. Three measured findings shaped how:
 * ════════════════════════════════════════════════════════════════════════════
 *
 * (1) PAGINATION ORDER IS NOT PLAN ORDER, and it cannot be. The obvious keyset —
 *     WHERE situation_id = ? AND rowid > ? ORDER BY rowid LIMIT N — plans as
 *     "SEARCH USING INDEX idx_situation_events_situation + USE TEMP B-TREE FOR
 *     ORDER BY", because that index is (situation_id, recorded_at, event_id) and so
 *     orders rows WITHIN a situation by recorded_at, not rowid. Every page would
 *     re-sort the whole situation: measured worst step 39.6ms against 26.0ms for
 *     the entire unbounded read, i.e. O(n^2) and strictly worse than the bug it was
 *     meant to fix. Paginating on the index's OWN key columns instead has no temp
 *     B-tree and a worst step of 3.3ms on the same fixture. Rows are then sorted by
 *     rowid in memory — a few thousand narrow rows, microseconds — so the planner
 *     still sees exact rowid order and the plan is byte-identical. A test pins both
 *     query plans against TEMP B-TREE, because this is a silent, severe regression
 *     if the index ever changes. Deliberately no new index: building one over a
 *     1.1GB situation_events on prod is itself a long blocking write.
 *
 * (2) octet_length(payload_json), NOT length(CAST(payload_json AS BLOB)). The CAST
 *     makes the argument an expression rather than a column, which defeats SQLite's
 *     OPFLAG_LENGTHARG optimisation and forces the full value — overflow pages and
 *     all — to be read just to measure it. Measured on 4,000 rows of 20KB payloads:
 *     length(CAST(...)) 130.7ms, length() 187.7ms, octet_length() 42.9ms, which is
 *     the same as not touching the payload at all. The numbers are identical: all
 *     ten value shapes tested (empty, ASCII, 2/3/4-byte UTF-8, 5KB-100KB
 *     overflowing, and NULL) agree exactly. Note length() alone would be WRONG —
 *     it counts characters, so it under-reports every multi-byte row.
 *
 * (3) json_extract IS GUARDED BY KIND. Only snapshot_created rows carry a
 *     snapshot_id, and their payloads are tiny; situation_created payloads are the
 *     big ones. Extracting unconditionally parses every one of them. Combined with
 *     (2): 161.6ms -> 56.5ms on a mixed table, for identical output.
 *
 * WHAT REMAINS UNAVOIDABLE, and is budgeted for rather than optimised away: prod's
 * typical event payload (~1.7KB) fits inline in a 4KB leaf page, so the narrow
 * columns live in the same pages as the payload. Reading ANY column of a situation
 * means reading its leaf pages. A full NFL:injury dry run must therefore move
 * ~764MB off disk however it is written; what this module guarantees is that it
 * does so in ~1MB steps with the event loop handed back between them, never in one
 * step that outlives a health check.
 *
 * Every query is bounded by situation_id and served by
 * idx_situation_events_situation / idx_situation_snapshots_situation. Nothing here
 * aggregates either table whole: a single GROUP BY over situation_events measured
 * 208s on prod. Only scalar columns and measured LENGTHS are selected, never
 * payload_json or confidence_json themselves.
 */

import type Database from "better-sqlite3";

import type { BloatPlanEventRow, BloatPlanSnapshotRow } from "./situation-bloat-plan";

/** Default rows per read step. Adaptive; see {@link PlanReadController}. */
export const READ_TARGET_ROWS = 250;
/** Floor for the adaptive row budget. */
export const READ_MIN_ROWS = 25;
/**
 * Soft byte ceiling per read step. At the ~4MB/s prod cold-read rate this is about
 * 250ms, which is the real mechanism for keeping a step under ~300ms; the time
 * check is the backstop for when the rate is worse than that.
 */
export const READ_BYTE_BUDGET = 1_048_576;

export interface PlanReadStep {
  readonly table: "events" | "snapshots";
  readonly situationId: string;
  readonly rows: number;
  readonly bytes: number;
  readonly ms: number;
  /** Rows the step was allowed to ask for, so a log line explains its own size. */
  readonly rowBudget: number;
}

/**
 * Read policy, owned by the caller.
 *
 * The reader stays dumb — page, measure, report, pause — and the job keeps the
 * throttling and the logging, so the same sizing discipline that governs delete
 * transactions governs reads. Tests substitute a controller that records every
 * step and counts pauses.
 */
export interface PlanReadController {
  /** Rows to request for the next step. */
  rowBudget(): number;
  /** Observe a completed step; this is where adaptation happens. */
  observe(step: PlanReadStep): void;
  /** Hand the event loop back. Called between steps, never with a cursor open. */
  pause(): Promise<void>;
}

/** A controller with no throttling, for CLI scripts that cannot block anything. */
export function unthrottledPlanReads(rows = READ_TARGET_ROWS): PlanReadController {
  return {
    rowBudget: () => rows,
    observe: () => {},
    pause: () => Promise.resolve(),
  };
}

/* ── Column lists ─────────────────────────────────────────────────────────────
 * octet_length, and json_extract only where a snapshot_id can exist. See (2)/(3).
 * rowid is selected because it is the plan's ordering key — the pagination order
 * below is the index's, not the plan's. */

const EVENT_COLUMNS = `
  rowid AS rowid_,
  event_id,
  kind,
  normalized_event_id,
  CASE WHEN kind = 'snapshot_created'
       THEN json_extract(payload_json, '$.snapshot_id') END AS snapshot_id,
  octet_length(payload_json) AS payload_bytes
`;

const SNAPSHOT_COLUMNS = `
  rowid AS rowid_,
  snapshot_id,
  lifecycle_state,
  confidence_score,
  summary,
  escalation_score,
  created_at,
  octet_length(confidence_json)
    + octet_length(evidence_event_ids_json)
    + octet_length(summary) AS payload_bytes
`;

/* Keyset pagination follows each table's OWN index order — finding (1). For
 * situation_events that is (recorded_at ASC, event_id ASC) within a situation, and
 * event_id is the primary key so the pair is unique. Separate first/next statements
 * rather than a sentinel value, so the first page carries no comparison at all. */

/* recorded_at is selected as well as ordered by, because it is half the keyset
 * cursor. It is a narrow column in the same leaf page, so it costs nothing. */
const EVENTS_FIRST = `
  SELECT ${EVENT_COLUMNS}, recorded_at FROM situation_events
  WHERE situation_id = ?
  ORDER BY recorded_at ASC, event_id ASC
  LIMIT ?
`;
const EVENTS_NEXT = `
  SELECT ${EVENT_COLUMNS}, recorded_at FROM situation_events
  WHERE situation_id = ?
    AND (recorded_at > ? OR (recorded_at = ? AND event_id > ?))
  ORDER BY recorded_at ASC, event_id ASC
  LIMIT ?
`;

/* idx_situation_snapshots_situation is (situation_id, created_at DESC,
 * snapshot_id ASC), so the cheap order here is DESC on created_at. */
const SNAPSHOTS_FIRST = `
  SELECT ${SNAPSHOT_COLUMNS} FROM situation_snapshots
  WHERE situation_id = ?
  ORDER BY created_at DESC, snapshot_id ASC
  LIMIT ?
`;
const SNAPSHOTS_NEXT = `
  SELECT ${SNAPSHOT_COLUMNS} FROM situation_snapshots
  WHERE situation_id = ?
    AND (created_at < ? OR (created_at = ? AND snapshot_id > ?))
  ORDER BY created_at DESC, snapshot_id ASC
  LIMIT ?
`;

/** The four paginated statements, exposed so a test can assert their query plans. */
export const PLAN_READ_SQL = {
  eventsFirst: EVENTS_FIRST,
  eventsNext: EVENTS_NEXT,
  snapshotsFirst: SNAPSHOTS_FIRST,
  snapshotsNext: SNAPSHOTS_NEXT,
} as const;

interface RawEventRow extends BloatPlanEventRow {
  rowid_: number;
  recorded_at?: string;
}
interface RawSnapshotRow extends BloatPlanSnapshotRow {
  rowid_: number;
}

function clampRows(requested: number): number {
  return Math.max(1, Math.min(READ_TARGET_ROWS, Math.floor(requested)));
}

/**
 * Page through one situation's events, pausing between steps.
 *
 * Uses .all() per page and never holds a better-sqlite3 iterator across an await:
 * an open iterator keeps the connection busy, so anything else touching the DB
 * during the pause would throw.
 */
export async function readBloatPlanEvents(
  db: Database.Database,
  situationId: string,
  controller: PlanReadController,
): Promise<BloatPlanEventRow[]> {
  const first = db.prepare(EVENTS_FIRST);
  const next = db.prepare(EVENTS_NEXT);

  const collected: RawEventRow[] = [];
  let cursor: { recorded_at: string; event_id: string } | null = null;

  for (;;) {
    const limit = clampRows(controller.rowBudget());
    const startedAt = Date.now();
    const page = (cursor === null
      ? first.all(situationId, limit)
      : next.all(situationId, cursor.recorded_at, cursor.recorded_at, cursor.event_id, limit)) as RawEventRow[];
    const ms = Date.now() - startedAt;
    if (page.length === 0) break;

    let bytes = 0;
    for (const row of page) bytes += row.payload_bytes;
    collected.push(...page);
    const last = page[page.length - 1];
    cursor = { recorded_at: last.recorded_at!, event_id: last.event_id };

    controller.observe({ table: "events", situationId, rows: page.length, bytes, ms, rowBudget: limit });
    if (page.length < limit) break;
    await controller.pause();
  }

  // Index order in, ROWID order out — the plan's ordering is rowid and nothing
  // else. Sorting a few thousand narrow rows costs microseconds.
  collected.sort((a, b) => a.rowid_ - b.rowid_);
  return collected;
}

/** Page through one situation's snapshots. See {@link readBloatPlanEvents}. */
export async function readBloatPlanSnapshots(
  db: Database.Database,
  situationId: string,
  controller: PlanReadController,
): Promise<BloatPlanSnapshotRow[]> {
  const first = db.prepare(SNAPSHOTS_FIRST);
  const next = db.prepare(SNAPSHOTS_NEXT);

  const collected: RawSnapshotRow[] = [];
  let cursor: { created_at: string; snapshot_id: string } | null = null;

  for (;;) {
    const limit = clampRows(controller.rowBudget());
    const startedAt = Date.now();
    const page = (cursor === null
      ? first.all(situationId, limit)
      : next.all(situationId, cursor.created_at, cursor.created_at, cursor.snapshot_id, limit)) as RawSnapshotRow[];
    const ms = Date.now() - startedAt;
    if (page.length === 0) break;

    let bytes = 0;
    for (const row of page) bytes += row.payload_bytes;
    collected.push(...page);
    const last = page[page.length - 1];
    cursor = { created_at: last.created_at, snapshot_id: last.snapshot_id };

    controller.observe({ table: "snapshots", situationId, rows: page.length, bytes, ms, rowBudget: limit });
    if (page.length < limit) break;
    await controller.pause();
  }

  collected.sort((a, b) => a.rowid_ - b.rowid_);
  return collected;
}
