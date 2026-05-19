import crypto from "node:crypto";

import type {
  ReplayIntelligenceOrchestrationSnapshot,
} from "./replay-intelligence-orchestration";

export interface ReplayIntelligencePersistentSnapshot {
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly snapshot: ReplayIntelligenceOrchestrationSnapshot;
}

export interface ReplayIntelligenceConvergenceHistoryRecord {
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
}

export interface ReplayIntelligencePredictivePersistenceRecord {
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly forecast_hashes: readonly string[];
}

export interface ReplayIntelligenceRecoveryMetadata {
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly recovery_hash: string;
}

export function buildReplayIntelligencePersistentSnapshot(
  snapshot: ReplayIntelligenceOrchestrationSnapshot,
  persisted_at: string,
): ReplayIntelligencePersistentSnapshot {
  return {
    ...buildBasePersistenceFields(snapshot, persisted_at),
    snapshot,
  };
}

export function buildReplayIntelligenceConvergenceHistoryRecord(
  snapshot: ReplayIntelligenceOrchestrationSnapshot,
  persisted_at: string,
): ReplayIntelligenceConvergenceHistoryRecord {
  return buildBasePersistenceFields(snapshot, persisted_at);
}

export function buildReplayIntelligenceRecoveryMetadata(
  snapshot: ReplayIntelligenceOrchestrationSnapshot,
  persisted_at: string,
): ReplayIntelligenceRecoveryMetadata {
  const base = buildBasePersistenceFields(snapshot, persisted_at);

  return {
    ...base,
    recovery_hash: computeReplayIntelligencePersistenceHash({
      kind: "replay_intelligence_recovery_metadata",
      snapshot_id: base.snapshot_id,
      orchestration_hash: base.orchestration_hash,
      generated_at: base.generated_at,
      persisted_at: base.persisted_at,
      convergence_score: base.convergence_score,
      lineage_node_count: base.lineage_node_count,
      anomaly_cluster_count: base.anomaly_cluster_count,
      forecast_count: base.forecast_count,
      heatmap_cell_count: base.heatmap_cell_count,
    }),
  };
}

function buildBasePersistenceFields(
  snapshot: ReplayIntelligenceOrchestrationSnapshot,
  persisted_at: string,
): ReplayIntelligenceConvergenceHistoryRecord {
  const base = {
    orchestration_hash: snapshot.orchestration_hash,
    generated_at: snapshot.generated_at,
    persisted_at,
    convergence_score: snapshot.convergence_score,
    lineage_node_count: snapshot.lineage_nodes.length,
    anomaly_cluster_count: snapshot.anomaly_clusters.length,
    forecast_count: snapshot.forecasts.length,
    heatmap_cell_count: snapshot.heatmap.length,
  };

  return {
    snapshot_id: buildReplayIntelligenceSnapshotId(base),
    ...base,
  };
}

function buildReplayIntelligenceSnapshotId(value: unknown): string {
  return `replay-intelligence-snapshot:${computeReplayIntelligencePersistenceHash(value)}`;
}

function computeReplayIntelligencePersistenceHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableReplayIntelligencePersistenceStringify(value))
    .digest("hex");
}

function stableReplayIntelligencePersistenceStringify(value: unknown): string {
  return JSON.stringify(sortReplayIntelligencePersistenceKeys(value));
}

function sortReplayIntelligencePersistenceKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortReplayIntelligencePersistenceKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortReplayIntelligencePersistenceKeys(
          (value as Record<string, unknown>)[key],
        );
        return acc;
      }, {});
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    return null;
  }

  if (typeof value === "undefined") {
    return null;
  }

  return value;
}
