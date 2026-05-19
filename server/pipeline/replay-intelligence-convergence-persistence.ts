import crypto from "crypto";

import {
  listReplayIntelligenceAuditRowsByReplayId,
} from "./replay-intelligence-audit-store";
import {
  listReplayConvergenceHistoryRows,
  type ReplayConvergenceHistoryRow,
} from "./replay-convergence-history-store";
import { reduceReplayConvergenceAnalytics } from "./replay-convergence-reducer";
import {
  listReplayIntelligenceHistoryLineageChildren,
  listReplayIntelligenceHistoryLineageRows,
} from "./replay-intelligence-history-store";

const CONVERGENCE_PERSISTED_AT = "2026-01-01T00:00:00.000Z";

export interface ReplayIntelligenceConvergencePersistenceRecord {
  readonly convergence_hash: string;
  readonly source_convergence_hash: string;
  readonly replay_hash: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly sequence: number;
  readonly convergence_score: number;
  readonly instability_score: number;
  readonly stability_index: number;
  readonly replay_count: number;
  readonly longitudinal: ReplayIntelligenceConvergenceLongitudinalPersistence;
  readonly stability: ReplayIntelligenceConvergenceStabilityPersistence;
  readonly drift: ReplayIntelligenceConvergenceDriftPersistence;
  readonly anomalies: ReplayIntelligenceConvergenceAnomalyPersistence;
  readonly lineage: ReplayIntelligenceConvergenceLineagePersistence;
  readonly reducer: ReplayIntelligenceConvergenceReducerPersistence;
  readonly trend: ReplayIntelligenceConvergenceTrendPersistence;
  readonly reconstruction: ReplayIntelligenceConvergenceReconstructionPersistence;
  readonly deterministic_hash: string;
}

export interface ReplayIntelligenceConvergenceLongitudinalPersistence {
  readonly replay_hash: string;
  readonly record_count: number;
  readonly first_generated_at: string;
  readonly latest_generated_at: string;
  readonly convergence_hashes: readonly string[];
  readonly longitudinal_hash: string;
}

export interface ReplayIntelligenceConvergenceStabilityPersistence {
  readonly replay_hash: string;
  readonly current_stability_index: number;
  readonly previous_stability_index: number | null;
  readonly stability_delta: number;
  readonly stability_band: "stable" | "watch" | "unstable";
  readonly evolution: readonly ReplayIntelligenceConvergenceStabilityEvolution[];
  readonly stability_hash: string;
}

export interface ReplayIntelligenceConvergenceStabilityEvolution {
  readonly generated_at: string;
  readonly convergence_hash: string;
  readonly stability_index: number;
  readonly delta_from_previous: number;
}

export interface ReplayIntelligenceConvergenceDriftPersistence {
  readonly replay_hash: string;
  readonly drift_count: number;
  readonly total_stability_delta: number;
  readonly total_convergence_delta: number;
  readonly fields: readonly string[];
  readonly events: readonly ReplayIntelligenceConvergenceDriftEvent[];
  readonly drift_hash: string;
}

export interface ReplayIntelligenceConvergenceDriftEvent {
  readonly generated_at: string;
  readonly from_convergence_hash: string;
  readonly to_convergence_hash: string;
  readonly changed_fields: readonly string[];
  readonly convergence_delta: number;
  readonly instability_delta: number;
  readonly stability_delta: number;
  readonly replay_count_delta: number;
}

export interface ReplayIntelligenceConvergenceAnomalyPersistence {
  readonly replay_hash: string;
  readonly anomaly_count: number;
  readonly statuses: readonly string[];
  readonly anomalies: readonly ReplayIntelligenceConvergenceAnomalyEvent[];
  readonly anomaly_hash: string;
}

export interface ReplayIntelligenceConvergenceAnomalyEvent {
  readonly generated_at: string;
  readonly audit_hash: string;
  readonly validation_status: string;
  readonly route_group_count: number;
}

export interface ReplayIntelligenceConvergenceLineagePersistence {
  readonly replay_hash: string;
  readonly parent_replay_hash: string | null;
  readonly children: readonly string[];
  readonly lineage_depth: number;
  readonly lineage: Readonly<Record<string, string | null>>;
  readonly lineage_hash: string;
}

export interface ReplayIntelligenceConvergenceReducerPersistence {
  readonly replay_hash: string;
  readonly input_count: number;
  readonly input_hashes: readonly string[];
  readonly reduced: ReturnType<typeof reduceReplayConvergenceAnalytics>;
  readonly reducer_hash: string;
}

export interface ReplayIntelligenceConvergenceTrendPersistence {
  readonly replay_hash: string;
  readonly direction: "improving" | "degrading" | "flat";
  readonly convergence_delta: number;
  readonly instability_delta: number;
  readonly stability_delta: number;
  readonly trend_hash: string;
}

export interface ReplayIntelligenceConvergenceReconstructionPersistence {
  readonly replay_hash: string;
  readonly source_record_hashes: readonly string[];
  readonly source_convergence_hashes: readonly string[];
  readonly reconstruction_hash: string;
}

export function listReplayIntelligenceConvergencePersistenceRecords():
  readonly ReplayIntelligenceConvergencePersistenceRecord[] {
  const rowsByReplay = groupConvergenceRowsByReplay();
  const records = Array.from(rowsByReplay.values()).flatMap((rows) =>
    rows.map((row, index) => buildConvergencePersistenceRecord(row, rows, index)),
  ).sort((left, right) =>
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.generated_at.localeCompare(right.generated_at) ||
    left.convergence_hash.localeCompare(right.convergence_hash),
  );

  return deepFreeze(records);
}

export function buildReplayIntelligenceConvergencePersistenceSummary() {
  const records = listReplayIntelligenceConvergencePersistenceRecords();
  const replayHashes = Array.from(new Set(
    records.map((record) => record.replay_hash),
  )).sort((left, right) => left.localeCompare(right));
  const reducer = reduceReplayConvergenceAnalytics(records.map((record) => ({
    convergence_score: record.convergence_score,
    instability_score: record.instability_score,
    replay_count: record.replay_count,
  })));
  const payload = {
    generated_at: latestTimestamp(records.map((record) => record.generated_at)),
    persisted_at: CONVERGENCE_PERSISTED_AT,
    convergence_count: records.length,
    replay_count: replayHashes.length,
    drift_count: records.reduce((sum, record) => sum + record.drift.drift_count, 0),
    anomaly_count: records.reduce((sum, record) => sum + record.anomalies.anomaly_count, 0),
    reducer,
    convergence_hashes: records.map((record) => record.convergence_hash),
    replay_hashes: replayHashes,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

export function getReplayIntelligenceConvergencePersistenceByHash(
  convergenceHash: string,
): ReplayIntelligenceConvergencePersistenceRecord | null {
  return listReplayIntelligenceConvergencePersistenceRecords().find(
    (record) => record.convergence_hash === convergenceHash ||
      record.source_convergence_hash === convergenceHash,
  ) ?? null;
}

export function buildReplayIntelligenceConvergencePersistenceHistory(
  convergenceHash: string,
) {
  const record = getReplayIntelligenceConvergencePersistenceByHash(convergenceHash);
  if (!record) return null;
  const records = listReplayIntelligenceConvergencePersistenceRecords()
    .filter((candidate) => candidate.replay_hash === record.replay_hash)
    .sort((left, right) =>
      left.generated_at.localeCompare(right.generated_at) ||
      left.convergence_hash.localeCompare(right.convergence_hash),
    );
  const payload = {
    convergence_hash: record.convergence_hash,
    replay_hash: record.replay_hash,
    count: records.length,
    history: records.map((candidate) => ({
      convergence_hash: candidate.convergence_hash,
      source_convergence_hash: candidate.source_convergence_hash,
      generated_at: candidate.generated_at,
      convergence_score: candidate.convergence_score,
      instability_score: candidate.instability_score,
      stability_index: candidate.stability_index,
      replay_count: candidate.replay_count,
      reconstruction_hash: candidate.reconstruction.reconstruction_hash,
    })),
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

export function buildReplayIntelligenceConvergencePersistenceStability(
  convergenceHash: string,
) {
  const record = getReplayIntelligenceConvergencePersistenceByHash(convergenceHash);
  if (!record) return null;
  const payload = {
    convergence_hash: record.convergence_hash,
    replay_hash: record.replay_hash,
    stability: record.stability,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

export function buildReplayIntelligenceConvergencePersistenceDrift(
  convergenceHash: string,
) {
  const record = getReplayIntelligenceConvergencePersistenceByHash(convergenceHash);
  if (!record) return null;
  const payload = {
    convergence_hash: record.convergence_hash,
    replay_hash: record.replay_hash,
    drift: record.drift,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

export function buildReplayIntelligenceConvergencePersistenceLineage(
  convergenceHash: string,
) {
  const record = getReplayIntelligenceConvergencePersistenceByHash(convergenceHash);
  if (!record) return null;
  const payload = {
    convergence_hash: record.convergence_hash,
    replay_hash: record.replay_hash,
    lineage: record.lineage,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

function buildConvergencePersistenceRecord(
  row: ReplayConvergenceHistoryRow,
  replayRows: readonly ReplayConvergenceHistoryRow[],
  index: number,
): ReplayIntelligenceConvergencePersistenceRecord {
  const rowsThroughCurrent = replayRows.slice(0, index + 1);
  const longitudinal = buildLongitudinalPersistence(row.replay_id, rowsThroughCurrent);
  const stability = buildStabilityPersistence(row.replay_id, rowsThroughCurrent);
  const drift = buildDriftPersistence(row.replay_id, rowsThroughCurrent);
  const anomalies = buildAnomalyPersistence(row.replay_id, row.generated_at);
  const lineage = buildLineagePersistence(row.replay_id);
  const reducer = buildReducerPersistence(row.replay_id, rowsThroughCurrent);
  const trend = buildTrendPersistence(row.replay_id, rowsThroughCurrent);
  const reconstruction = buildReconstructionPersistence(row.replay_id, rowsThroughCurrent);
  const seed = {
    kind: "replay_intelligence_convergence_persistence",
    source_convergence_hash: row.convergence_hash,
    replay_hash: row.replay_id,
    generated_at: row.generated_at,
    sequence: index,
    convergence_score: row.convergence_score,
    instability_score: row.instability_score,
    stability_index: row.stability_index,
    replay_count: row.replay_count,
    longitudinal_hash: longitudinal.longitudinal_hash,
    stability_hash: stability.stability_hash,
    drift_hash: drift.drift_hash,
    anomaly_hash: anomalies.anomaly_hash,
    lineage_hash: lineage.lineage_hash,
    reducer_hash: reducer.reducer_hash,
    trend_hash: trend.trend_hash,
    reconstruction_hash: reconstruction.reconstruction_hash,
  };
  const convergenceHash = deterministicHash(seed);
  const payload = {
    convergence_hash: convergenceHash,
    source_convergence_hash: row.convergence_hash,
    replay_hash: row.replay_id,
    generated_at: row.generated_at,
    persisted_at: CONVERGENCE_PERSISTED_AT,
    sequence: index,
    convergence_score: row.convergence_score,
    instability_score: row.instability_score,
    stability_index: row.stability_index,
    replay_count: row.replay_count,
    longitudinal,
    stability,
    drift,
    anomalies,
    lineage,
    reducer,
    trend,
    reconstruction,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

function buildLongitudinalPersistence(
  replayHash: string,
  rows: readonly ReplayConvergenceHistoryRow[],
): ReplayIntelligenceConvergenceLongitudinalPersistence {
  const payload = {
    replay_hash: replayHash,
    record_count: rows.length,
    first_generated_at: rows[0]?.generated_at ?? CONVERGENCE_PERSISTED_AT,
    latest_generated_at: rows[rows.length - 1]?.generated_at ?? CONVERGENCE_PERSISTED_AT,
    convergence_hashes: rows.map((row) => row.convergence_hash),
  };

  return deepFreeze({
    ...payload,
    longitudinal_hash: deterministicHash(payload),
  });
}

function buildStabilityPersistence(
  replayHash: string,
  rows: readonly ReplayConvergenceHistoryRow[],
): ReplayIntelligenceConvergenceStabilityPersistence {
  const current = rows[rows.length - 1];
  const previous = rows[rows.length - 2] ?? null;
  const evolution = rows.map((row, index) => {
    const previousRow = rows[index - 1] ?? null;
    return {
      generated_at: row.generated_at,
      convergence_hash: row.convergence_hash,
      stability_index: row.stability_index,
      delta_from_previous: previousRow ? row.stability_index - previousRow.stability_index : 0,
    };
  });
  const payload = {
    replay_hash: replayHash,
    current_stability_index: current?.stability_index ?? 0,
    previous_stability_index: previous?.stability_index ?? null,
    stability_delta: current && previous ? current.stability_index - previous.stability_index : 0,
    stability_band: stabilityBand(current?.stability_index ?? 0),
    evolution,
  };

  return deepFreeze({
    ...payload,
    stability_hash: deterministicHash(payload),
  });
}

function buildDriftPersistence(
  replayHash: string,
  rows: readonly ReplayConvergenceHistoryRow[],
): ReplayIntelligenceConvergenceDriftPersistence {
  const events = rows.slice(1).map((row, index) => {
    const previous = rows[index] as ReplayConvergenceHistoryRow;
    const changedFields = [
      previous.convergence_score !== row.convergence_score ? "convergence_score" : null,
      previous.instability_score !== row.instability_score ? "instability_score" : null,
      previous.stability_index !== row.stability_index ? "stability_index" : null,
      previous.replay_count !== row.replay_count ? "replay_count" : null,
      previous.convergence_hash !== row.convergence_hash ? "convergence_hash" : null,
    ].filter((field): field is string => field !== null).sort((left, right) =>
      left.localeCompare(right),
    );

    return {
      generated_at: row.generated_at,
      from_convergence_hash: previous.convergence_hash,
      to_convergence_hash: row.convergence_hash,
      changed_fields: changedFields,
      convergence_delta: row.convergence_score - previous.convergence_score,
      instability_delta: row.instability_score - previous.instability_score,
      stability_delta: row.stability_index - previous.stability_index,
      replay_count_delta: row.replay_count - previous.replay_count,
    };
  });
  const fields = Array.from(new Set(events.flatMap((event) => event.changed_fields)))
    .sort((left, right) => left.localeCompare(right));
  const payload = {
    replay_hash: replayHash,
    drift_count: events.length,
    total_stability_delta: events.reduce((sum, event) => sum + event.stability_delta, 0),
    total_convergence_delta: events.reduce((sum, event) => sum + event.convergence_delta, 0),
    fields,
    events,
  };

  return deepFreeze({
    ...payload,
    drift_hash: deterministicHash(payload),
  });
}

function buildAnomalyPersistence(
  replayHash: string,
  generatedAt: string,
): ReplayIntelligenceConvergenceAnomalyPersistence {
  const anomalies = listReplayIntelligenceAuditRowsByReplayId(replayHash)
    .filter((row) => row.generated_at <= generatedAt && row.validation_status !== "passed")
    .sort((left, right) =>
      left.generated_at.localeCompare(right.generated_at) ||
      left.validation_status.localeCompare(right.validation_status) ||
      left.analytics_hash.localeCompare(right.analytics_hash),
    )
    .map((row) => ({
      generated_at: row.generated_at,
      audit_hash: deterministicHash(row),
      validation_status: row.validation_status,
      route_group_count: row.route_group_count,
    }));
  const statuses = Array.from(new Set(anomalies.map((event) => event.validation_status)))
    .sort((left, right) => left.localeCompare(right));
  const payload = {
    replay_hash: replayHash,
    anomaly_count: anomalies.length,
    statuses,
    anomalies,
  };

  return deepFreeze({
    ...payload,
    anomaly_hash: deterministicHash(payload),
  });
}

function buildLineagePersistence(
  replayHash: string,
): ReplayIntelligenceConvergenceLineagePersistence {
  const lineageRows = listReplayIntelligenceHistoryLineageRows()
    .sort((left, right) =>
      left.generated_at.localeCompare(right.generated_at) ||
      left.replay_hash.localeCompare(right.replay_hash),
    );
  const lineage = lineageRows.reduce<Record<string, string | null>>((acc, row) => {
    acc[row.replay_hash] = row.parent_replay_hash;
    return acc;
  }, {});
  const parentReplayHash = lineage[replayHash] ?? null;
  const children = listReplayIntelligenceHistoryLineageChildren(replayHash)
    .map((row) => row.replay_hash)
    .sort((left, right) => left.localeCompare(right));
  const lineageDepth = computeLineageDepth(replayHash, lineage);
  const payload = {
    replay_hash: replayHash,
    parent_replay_hash: parentReplayHash,
    children,
    lineage_depth: lineageDepth,
    lineage: deepFreeze({ ...lineage }),
  };

  return deepFreeze({
    ...payload,
    lineage_hash: deterministicHash(payload),
  });
}

function buildReducerPersistence(
  replayHash: string,
  rows: readonly ReplayConvergenceHistoryRow[],
): ReplayIntelligenceConvergenceReducerPersistence {
  const reduced = reduceReplayConvergenceAnalytics([...rows]);
  const payload = {
    replay_hash: replayHash,
    input_count: rows.length,
    input_hashes: rows.map((row) => row.convergence_hash),
    reduced,
  };

  return deepFreeze({
    ...payload,
    reducer_hash: deterministicHash(payload),
  });
}

function buildTrendPersistence(
  replayHash: string,
  rows: readonly ReplayConvergenceHistoryRow[],
): ReplayIntelligenceConvergenceTrendPersistence {
  const first = rows[0];
  const latest = rows[rows.length - 1];
  const convergenceDelta = latest && first ? latest.convergence_score - first.convergence_score : 0;
  const instabilityDelta = latest && first ? latest.instability_score - first.instability_score : 0;
  const stabilityDelta = latest && first ? latest.stability_index - first.stability_index : 0;
  const payload = {
    replay_hash: replayHash,
    direction: stabilityDelta > 0 ? "improving" as const : stabilityDelta < 0 ? "degrading" as const : "flat" as const,
    convergence_delta: convergenceDelta,
    instability_delta: instabilityDelta,
    stability_delta: stabilityDelta,
  };

  return deepFreeze({
    ...payload,
    trend_hash: deterministicHash(payload),
  });
}

function buildReconstructionPersistence(
  replayHash: string,
  rows: readonly ReplayConvergenceHistoryRow[],
): ReplayIntelligenceConvergenceReconstructionPersistence {
  const sourceRecordHashes = rows.map((row) => deterministicHash({
    replay_id: row.replay_id,
    generated_at: row.generated_at,
    convergence_score: row.convergence_score,
    instability_score: row.instability_score,
    stability_index: row.stability_index,
    replay_count: row.replay_count,
    convergence_hash: row.convergence_hash,
  }));
  const payload = {
    replay_hash: replayHash,
    source_record_hashes: sourceRecordHashes,
    source_convergence_hashes: rows.map((row) => row.convergence_hash),
  };

  return deepFreeze({
    ...payload,
    reconstruction_hash: deterministicHash(payload),
  });
}

function groupConvergenceRowsByReplay(): Map<string, ReplayConvergenceHistoryRow[]> {
  const rowsByReplay = new Map<string, ReplayConvergenceHistoryRow[]>();
  for (const row of sortConvergenceRows(listReplayConvergenceHistoryRows())) {
    const rows = rowsByReplay.get(row.replay_id) ?? [];
    rows.push(row);
    rowsByReplay.set(row.replay_id, rows);
  }

  return rowsByReplay;
}

function sortConvergenceRows(
  rows: readonly ReplayConvergenceHistoryRow[],
): ReplayConvergenceHistoryRow[] {
  return [...rows].sort((left, right) =>
    left.replay_id.localeCompare(right.replay_id) ||
    left.generated_at.localeCompare(right.generated_at) ||
    left.convergence_hash.localeCompare(right.convergence_hash) ||
    left.id.localeCompare(right.id),
  );
}

function computeLineageDepth(
  replayHash: string,
  lineage: Readonly<Record<string, string | null>>,
): number {
  let depth = 0;
  let current = lineage[replayHash] ?? null;
  const visited = new Set<string>([replayHash]);
  while (current && !visited.has(current)) {
    visited.add(current);
    depth += 1;
    current = lineage[current] ?? null;
  }

  return depth;
}

function stabilityBand(
  stabilityIndex: number,
): ReplayIntelligenceConvergenceStabilityPersistence["stability_band"] {
  if (stabilityIndex >= 90) return "stable";
  if (stabilityIndex >= 80) return "watch";
  return "unstable";
}

function latestTimestamp(timestamps: readonly string[]): string {
  return [...timestamps].sort((left, right) => right.localeCompare(left))[0] ??
    CONVERGENCE_PERSISTED_AT;
}

function deterministicHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(value))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) {
      deepFreeze(item);
    }
  }

  return value;
}
