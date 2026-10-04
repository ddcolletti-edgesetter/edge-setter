/**
 * Edge Setter — removal plan for the retroactive situation churn cleanup.
 *
 * ONE source of truth, shared by the dry-run report
 * (server/scripts/report-situation-event-bloat.ts) and the job that actually
 * deletes (situation-bloat-cleanup.ts). They used to be two implementations of
 * "what is removable", which is exactly the kind of pair that drifts silently:
 * the report says 1.1GB, the job deletes something else, and nobody finds out
 * until the rows are gone. Everything below is pure — rows in, ids out, no DB
 * handle, no clock — so both callers get identical answers by construction and a
 * test can assert dry-run counts equal real-run counts.
 *
 * WHAT IS REMOVABLE, per situation:
 *   - every situation_created event except the founder (see KEEP KEY),
 *   - snapshots that restate the previous KEPT snapshot's state,
 *   - the snapshot_created event paired with each of those snapshots.
 * Real state changes, every evidence event, and all history tables are kept.
 *
 * ORDERING IS ROWID, NOT TIMESTAMP. This is the correction that matters most.
 * The churn this cleans up is ESPN re-reporting one static injury listing over
 * and over, so the duplicate rows of a churned situation frequently share a
 * single created_at/recorded_at to the millisecond, and snapshot_id is a content
 * hash — a tie broken by hash is a tie broken arbitrarily. "The first snapshot"
 * and "unchanged vs the last kept" are both order-dependent judgements, so
 * evaluating them in an arbitrary order makes the plan itself arbitrary: the same
 * fixture could keep a different row on a different machine. rowid is SQLite's
 * insertion order and is total, so it is the only stable reading of "first"
 * available here. (Neither table is WITHOUT ROWID, so both have one.)
 */

import type { SituationFoundingKeepKeySource } from "./situations-store";

/** A situation_events row, in rowid order. payload_bytes is measured, not modelled. */
export interface BloatPlanEventRow {
  readonly event_id: string;
  readonly kind: string;
  readonly normalized_event_id: string | null;
  /** json_extract(payload_json, '$.snapshot_id') — the snapshot this event announced. */
  readonly snapshot_id: string | null;
  readonly payload_bytes: number;
}

/** A situation_snapshots row, in rowid order. */
export interface BloatPlanSnapshotRow {
  readonly snapshot_id: string;
  readonly lifecycle_state: string;
  readonly confidence_score: number;
  readonly summary: string;
  readonly escalation_score: number;
  /** Needed only to re-derive which snapshot the read path currently serves. */
  readonly created_at: string;
  readonly payload_bytes: number;
}

export interface SituationCleanupPlan {
  /** The surviving situation_created row, or null when the situation has none. */
  readonly keptFoundingEventId: string | null;
  /** Why that row was chosen; null when there are no founding rows to choose from. */
  readonly keepKeySource: SituationFoundingKeepKeySource | null;
  /** The founder is not the earliest founding row (450 such situations on prod). */
  readonly founderNotEarliest: boolean;
  /** Live situation_created count BEFORE this plan is applied — the audit value. */
  readonly foundingRowCount: number;
  /** The snapshot the read path serves today, pinned so the API cannot move. */
  readonly servedSnapshotId: string | null;
  readonly deleteEventIds: readonly string[];
  readonly deleteSnapshotIds: readonly string[];
  readonly duplicateFoundingCount: number;
  readonly redundantSnapshotCount: number;
  readonly redundantSnapshotEventCount: number;
  readonly bytes: number;
}

export interface SituationCleanupPlanInput {
  readonly situationId: string;
  /** situations.created_from_event_id — the authoritative keep key. */
  readonly createdFromEventId: string | null;
  /** Events for this situation, ALREADY in rowid order. */
  readonly events: readonly BloatPlanEventRow[];
  /** Snapshots for this situation, ALREADY in rowid order. */
  readonly snapshots: readonly BloatPlanSnapshotRow[];
}

/**
 * The snapshot a reader gets back today.
 *
 * Mirrors getLatestSituationSnapshot and the listCanonicalSituations LEFT JOIN
 * verbatim: ORDER BY created_at DESC, snapshot_id ASC LIMIT 1. Re-derived here
 * rather than queried so the plan stays pure, and so the rule sits next to the
 * reason it exists.
 */
function servedSnapshotId(snapshots: readonly BloatPlanSnapshotRow[]): string | null {
  let winner: BloatPlanSnapshotRow | null = null;
  for (const snapshot of snapshots) {
    if (winner === null) { winner = snapshot; continue; }
    if (snapshot.created_at > winner.created_at) { winner = snapshot; continue; }
    if (snapshot.created_at === winner.created_at && snapshot.snapshot_id < winner.snapshot_id) winner = snapshot;
  }
  return winner?.snapshot_id ?? null;
}

/**
 * Does this snapshot restate the last kept one?
 *
 * The four fields are the same tuple situations-engine.ts now tests before it
 * writes a snapshot at all, so this is the retroactive half of that fix rather
 * than a second, looser rule.
 *
 * escalation_score is compared rounded because the engine stores it already
 * rounded (Math.round(deriveEscalationScore(...))) while rows written before that
 * may carry a fraction; rounding makes the two eras comparable, and it is what
 * the shipped dry-run report already measured prod with. It cannot cost the read
 * path anything, because the snapshot the read path serves is pinned regardless
 * of what this returns.
 */
function restatesLastKept(candidate: BloatPlanSnapshotRow, lastKept: BloatPlanSnapshotRow): boolean {
  return lastKept.lifecycle_state === candidate.lifecycle_state
    && lastKept.confidence_score === candidate.confidence_score
    && lastKept.summary === candidate.summary
    && Math.round(lastKept.escalation_score) === Math.round(candidate.escalation_score);
}

/**
 * Resolve the surviving founding row.
 *
 * KEEP KEY: the situation_created row whose normalized_event_id equals
 * situations.created_from_event_id — the event the situation records being
 * founded from. NOT "the earliest row": measured on prod 2026-10-02, 450
 * situations have an earliest founding row that is not their founder, so "keep
 * the first" would have deleted the founder on every one of them.
 * Earliest-by-rowid is the fallback, used only when there is nothing to match.
 */
function resolveKeptFounding(
  createdFromEventId: string | null,
  foundingRows: readonly BloatPlanEventRow[],
): { keptEventId: string; source: SituationFoundingKeepKeySource; founderNotEarliest: boolean } | null {
  if (foundingRows.length === 0) return null;
  const founder = createdFromEventId
    ? foundingRows.find((event) => event.normalized_event_id === createdFromEventId)
    : undefined;
  if (founder) {
    return {
      keptEventId: founder.event_id,
      source: "created_from_event_id",
      founderNotEarliest: founder.event_id !== foundingRows[0].event_id,
    };
  }
  return {
    keptEventId: foundingRows[0].event_id,
    source: createdFromEventId ? "earliest_no_match" : "earliest_no_created_from",
    founderNotEarliest: false,
  };
}

/**
 * Compute one situation's removal plan. Pure, and safe to call on an
 * already-clean situation, where it returns empty delete lists — which is what
 * makes a resumed run a no-op on finished situations even without the cursor.
 *
 * Throws if it ever condemns the kept founding row. That is unreachable by
 * construction, which is the point: if the construction changes, this aborts the
 * chunk instead of deleting the founder.
 */
export function computeSituationCleanupPlan(input: SituationCleanupPlanInput): SituationCleanupPlan {
  const { events, snapshots } = input;

  /* ── Snapshots first: a condemned snapshot also condemns its paired event. ── */
  const served = servedSnapshotId(snapshots);
  const deleteSnapshotIds: string[] = [];
  const keptSnapshotIds = new Set<string>();
  let bytes = 0;
  let lastKept: BloatPlanSnapshotRow | null = null;

  for (const snapshot of snapshots) {
    // Pin the snapshot the read path serves today. The four-field rule alone does
    // not leave the API alone: the served row is chosen by created_at DESC,
    // snapshot_id ASC, and on a churned situation every snapshot shares one
    // created_at, so the winner is the smallest content hash — very often one of
    // the restatements. It carries the same state as the row we keep (that is why
    // it is a restatement) but its OWN replay_hash, previous_snapshot_hash,
    // timing_pressure and evidence_event_ids, and situations-api serves replayHash
    // and timingPressure straight off it. Deleting it moves those on a cleaned
    // situation, which the Phase 0 contract forbids. Keeping it is strictly more
    // conservative than the rule it extends, and it is a no-op on any situation
    // whose served snapshot was already a kept one.
    const isServed = snapshot.snapshot_id === served;
    const keep = lastKept === null || isServed || !restatesLastKept(snapshot, lastKept);

    if (keep) {
      lastKept = snapshot;
      keptSnapshotIds.add(snapshot.snapshot_id);
    } else {
      deleteSnapshotIds.push(snapshot.snapshot_id);
      bytes += snapshot.payload_bytes;
    }
  }
  const condemnedSnapshotIds = new Set(deleteSnapshotIds);

  /* ── Founding rows: resolve the keeper first, it can sit anywhere in the log. ── */
  const foundingRows = events.filter((event) => event.kind === "situation_created");
  const kept = resolveKeptFounding(input.createdFromEventId, foundingRows);

  const deleteEventIds: string[] = [];
  let duplicateFoundingCount = 0;
  let redundantSnapshotEventCount = 0;

  for (const event of events) {
    if (event.kind === "situation_created") {
      if (kept && event.event_id !== kept.keptEventId) {
        deleteEventIds.push(event.event_id);
        duplicateFoundingCount++;
        bytes += event.payload_bytes;
      }
      continue;
    }
    if (event.kind === "snapshot_created" && event.snapshot_id) {
      // Never the paired event of a KEPT snapshot: that would orphan a surviving
      // snapshot's own announcement. Checked positively, so an id that somehow
      // lands in both sets keeps the event.
      if (keptSnapshotIds.has(event.snapshot_id)) continue;
      if (condemnedSnapshotIds.has(event.snapshot_id)) {
        deleteEventIds.push(event.event_id);
        redundantSnapshotEventCount++;
        bytes += event.payload_bytes;
      }
      // An event naming a snapshot_id in neither set announces a snapshot this
      // situation does not hold. Already orphaned; not ours to clean up.
    }
  }

  if (kept && deleteEventIds.includes(kept.keptEventId)) {
    throw new Error(`[bloat-plan] ${input.situationId}: plan would delete its own kept founding row`);
  }

  return {
    keptFoundingEventId: kept?.keptEventId ?? null,
    keepKeySource: kept?.source ?? null,
    founderNotEarliest: kept?.founderNotEarliest ?? false,
    foundingRowCount: foundingRows.length,
    servedSnapshotId: served,
    deleteEventIds,
    deleteSnapshotIds,
    duplicateFoundingCount,
    redundantSnapshotCount: deleteSnapshotIds.length,
    redundantSnapshotEventCount,
    bytes,
  };
}
