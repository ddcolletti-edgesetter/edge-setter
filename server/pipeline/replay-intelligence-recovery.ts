import crypto from "node:crypto";

import type {
  ReplayIntelligenceOrchestrationSnapshot,
} from "./replay-intelligence-orchestration";
import type {
  ReplayIntelligencePersistentSnapshot,
  ReplayIntelligenceRecoveryMetadata,
} from "./replay-intelligence-persistence";

export interface ReplayIntelligenceRecoverySnapshot {
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly recovered_at: string;
  readonly recovery_hash: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly snapshot: ReplayIntelligenceOrchestrationSnapshot;
}

export interface ReplayIntelligenceRecoveryResult {
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly recovered_at: string;
  readonly recovery_hash: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly restored: boolean;
  readonly validation_errors: readonly string[];
}

export interface ReplayIntelligenceRollbackCandidate {
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly recovered_at: string;
  readonly recovery_hash: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly rollback_candidate_hash: string;
  readonly eligible: boolean;
}

export function buildReplayIntelligenceRecoverySnapshot(
  snapshot: ReplayIntelligenceOrchestrationSnapshot,
  persistentSnapshot: ReplayIntelligencePersistentSnapshot,
  recoveryMetadata: ReplayIntelligenceRecoveryMetadata,
  recovered_at: string,
): ReplayIntelligenceRecoverySnapshot {
  const base = {
    snapshot_id: persistentSnapshot.snapshot_id,
    orchestration_hash: snapshot.orchestration_hash,
    generated_at: snapshot.generated_at,
    persisted_at: persistentSnapshot.persisted_at,
    recovered_at,
    convergence_score: snapshot.convergence_score,
    lineage_node_count: snapshot.lineage_nodes.length,
    anomaly_cluster_count: snapshot.anomaly_clusters.length,
    forecast_count: snapshot.forecasts.length,
    heatmap_cell_count: snapshot.heatmap.length,
    source_recovery_hash: recoveryMetadata.recovery_hash,
  };

  return {
    snapshot_id: base.snapshot_id,
    orchestration_hash: base.orchestration_hash,
    generated_at: base.generated_at,
    persisted_at: base.persisted_at,
    recovered_at: base.recovered_at,
    recovery_hash: computeReplayIntelligenceRecoveryHash({
      kind: "replay_intelligence_recovery_snapshot",
      ...base,
    }),
    convergence_score: base.convergence_score,
    lineage_node_count: base.lineage_node_count,
    anomaly_cluster_count: base.anomaly_cluster_count,
    forecast_count: base.forecast_count,
    heatmap_cell_count: base.heatmap_cell_count,
    snapshot,
  };
}

export function buildReplayIntelligenceRecoveryResult(
  recoverySnapshot: ReplayIntelligenceRecoverySnapshot,
): ReplayIntelligenceRecoveryResult {
  const validationErrors = validateReplayIntelligenceRecoverySnapshot(recoverySnapshot);

  return {
    snapshot_id: recoverySnapshot.snapshot_id,
    orchestration_hash: recoverySnapshot.orchestration_hash,
    generated_at: recoverySnapshot.generated_at,
    persisted_at: recoverySnapshot.persisted_at,
    recovered_at: recoverySnapshot.recovered_at,
    recovery_hash: recoverySnapshot.recovery_hash,
    convergence_score: recoverySnapshot.convergence_score,
    lineage_node_count: recoverySnapshot.lineage_node_count,
    anomaly_cluster_count: recoverySnapshot.anomaly_cluster_count,
    forecast_count: recoverySnapshot.forecast_count,
    heatmap_cell_count: recoverySnapshot.heatmap_cell_count,
    restored: validationErrors.length === 0,
    validation_errors: validationErrors,
  };
}

export function buildReplayIntelligenceRollbackCandidate(
  recoverySnapshot: ReplayIntelligenceRecoverySnapshot,
): ReplayIntelligenceRollbackCandidate {
  const validationErrors = validateReplayIntelligenceRecoverySnapshot(recoverySnapshot);
  const base = {
    snapshot_id: recoverySnapshot.snapshot_id,
    orchestration_hash: recoverySnapshot.orchestration_hash,
    generated_at: recoverySnapshot.generated_at,
    persisted_at: recoverySnapshot.persisted_at,
    recovered_at: recoverySnapshot.recovered_at,
    recovery_hash: recoverySnapshot.recovery_hash,
    convergence_score: recoverySnapshot.convergence_score,
    lineage_node_count: recoverySnapshot.lineage_node_count,
    anomaly_cluster_count: recoverySnapshot.anomaly_cluster_count,
    forecast_count: recoverySnapshot.forecast_count,
    heatmap_cell_count: recoverySnapshot.heatmap_cell_count,
  };

  return {
    ...base,
    rollback_candidate_hash: computeReplayIntelligenceRecoveryHash({
      kind: "replay_intelligence_rollback_candidate",
      ...base,
      validation_errors: validationErrors,
    }),
    eligible: validationErrors.length === 0,
  };
}

export function validateReplayIntelligenceRecoverySnapshot(
  recoverySnapshot: ReplayIntelligenceRecoverySnapshot,
): readonly string[] {
  const errors: string[] = [];

  if (!recoverySnapshot.snapshot_id) errors.push("snapshot_id is required");
  if (!recoverySnapshot.orchestration_hash) errors.push("orchestration_hash is required");
  if (!recoverySnapshot.generated_at) errors.push("generated_at is required");
  if (!recoverySnapshot.persisted_at) errors.push("persisted_at is required");
  if (!recoverySnapshot.recovered_at) errors.push("recovered_at is required");
  if (!recoverySnapshot.recovery_hash) errors.push("recovery_hash is required");
  if (recoverySnapshot.orchestration_hash !== recoverySnapshot.snapshot.orchestration_hash) {
    errors.push("orchestration_hash does not match source snapshot");
  }
  if (recoverySnapshot.generated_at !== recoverySnapshot.snapshot.generated_at) {
    errors.push("generated_at does not match source snapshot");
  }
  if (recoverySnapshot.convergence_score !== recoverySnapshot.snapshot.convergence_score) {
    errors.push("convergence_score does not match source snapshot");
  }
  if (recoverySnapshot.lineage_node_count !== recoverySnapshot.snapshot.lineage_nodes.length) {
    errors.push("lineage_node_count does not match source snapshot");
  }
  if (recoverySnapshot.anomaly_cluster_count !== recoverySnapshot.snapshot.anomaly_clusters.length) {
    errors.push("anomaly_cluster_count does not match source snapshot");
  }
  if (recoverySnapshot.forecast_count !== recoverySnapshot.snapshot.forecasts.length) {
    errors.push("forecast_count does not match source snapshot");
  }
  if (recoverySnapshot.heatmap_cell_count !== recoverySnapshot.snapshot.heatmap.length) {
    errors.push("heatmap_cell_count does not match source snapshot");
  }

  return errors.sort((left, right) => left.localeCompare(right));
}

function computeReplayIntelligenceRecoveryHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableReplayIntelligenceRecoveryStringify(value))
    .digest("hex");
}

function stableReplayIntelligenceRecoveryStringify(value: unknown): string {
  return JSON.stringify(sortReplayIntelligenceRecoveryKeys(value));
}

function sortReplayIntelligenceRecoveryKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortReplayIntelligenceRecoveryKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortReplayIntelligenceRecoveryKeys(
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
