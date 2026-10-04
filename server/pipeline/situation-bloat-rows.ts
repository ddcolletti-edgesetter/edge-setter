/**
 * Edge Setter — the reads that feed {@link computeSituationCleanupPlan}.
 *
 * Split out from situation-bloat-plan.ts so the plan stays pure, and kept in ONE
 * place so the dry-run report and the delete job cannot disagree about row ORDER.
 * Order is the whole game here: the plan's "first snapshot" and "unchanged vs the
 * last kept" are order-dependent, and the duplicate rows of a churned situation
 * share a created_at, so two callers ordering by timestamp would silently keep
 * different rows. Both order by rowid, from this module, or the equality the
 * dry-run promises is a coincidence.
 *
 * Every query is bounded by situation_id and so served by
 * idx_situation_events_situation / idx_situation_snapshots_situation. Nothing here
 * aggregates either table whole: a single GROUP BY over situation_events measured
 * 208s on prod.
 *
 * Only scalar columns and measured LENGTHS are selected, never payload_json or
 * confidence_json themselves, so peak memory is flat no matter how many rows a
 * situation carries (the worst prod situation holds 1,803 snapshots). That matters
 * on this service: situation_snapshots bloat is what OOM-crash-looped
 * /api/v2/situations in September.
 */

import type Database from "better-sqlite3";

import type { BloatPlanEventRow, BloatPlanSnapshotRow } from "./situation-bloat-plan";

/** length(CAST(x AS BLOB)) is bytes, where length(x) on TEXT would be characters. */
const EVENT_SQL = `
  SELECT situation_id,
         event_id,
         kind,
         normalized_event_id,
         json_extract(payload_json, '$.snapshot_id') AS snapshot_id,
         length(CAST(payload_json AS BLOB)) AS payload_bytes
  FROM situation_events
  WHERE situation_id IN (__IDS__)
  ORDER BY situation_id ASC, rowid ASC
`;

const SNAPSHOT_SQL = `
  SELECT situation_id,
         snapshot_id,
         lifecycle_state,
         confidence_score,
         summary,
         escalation_score,
         created_at,
         length(CAST(confidence_json AS BLOB))
           + length(CAST(evidence_event_ids_json AS BLOB))
           + length(CAST(summary AS BLOB)) AS payload_bytes
  FROM situation_snapshots
  WHERE situation_id IN (__IDS__)
  ORDER BY situation_id ASC, rowid ASC
`;

function expand(sql: string, count: number): string {
  return sql.replace("__IDS__", Array.from({ length: count }, () => "?").join(","));
}

function groupBySituation<T extends { situation_id: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.situation_id);
    if (bucket) bucket.push(row);
    else grouped.set(row.situation_id, [row]);
  }
  return grouped;
}

/** Events for the given situations, grouped, each group in rowid order. */
export function fetchBloatPlanEvents(
  db: Database.Database,
  situationIds: readonly string[],
): Map<string, BloatPlanEventRow[]> {
  if (situationIds.length === 0) return new Map();
  const rows = db.prepare(expand(EVENT_SQL, situationIds.length))
    .all(...situationIds) as Array<BloatPlanEventRow & { situation_id: string }>;
  return groupBySituation(rows);
}

/** Snapshots for the given situations, grouped, each group in rowid order. */
export function fetchBloatPlanSnapshots(
  db: Database.Database,
  situationIds: readonly string[],
): Map<string, BloatPlanSnapshotRow[]> {
  if (situationIds.length === 0) return new Map();
  const rows = db.prepare(expand(SNAPSHOT_SQL, situationIds.length))
    .all(...situationIds) as Array<BloatPlanSnapshotRow & { situation_id: string }>;
  return groupBySituation(rows);
}
