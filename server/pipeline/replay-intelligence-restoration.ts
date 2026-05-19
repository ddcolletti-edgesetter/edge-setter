import crypto from "node:crypto";

import type {
  ReplayIntelligenceOrchestrationSnapshot,
} from "./replay-intelligence-orchestration";
import type {
  ReplayIntelligenceRecoveryResult,
  ReplayIntelligenceRecoverySnapshot,
  ReplayIntelligenceRollbackCandidate,
} from "./replay-intelligence-recovery";

export interface ReplayIntelligenceRestorationSnapshot {
  readonly restoration_id: string;
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly recovery_hash: string;
  readonly rollback_candidate_hash: string;
  readonly restored_at: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly replay_timeline_hash: string;
  readonly checkpoint_hash: string;
  readonly orchestration_snapshot: ReplayIntelligenceOrchestrationSnapshot;
}

export interface ReplayIntelligenceRestorationResult {
  readonly restoration_id: string;
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly recovery_hash: string;
  readonly rollback_candidate_hash: string;
  readonly restored_at: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly replay_timeline_hash: string;
  readonly checkpoint_hash: string;
  readonly restored: boolean;
  readonly validation_errors: readonly string[];
}

export interface ReplayIntelligenceReplayTimeline {
  readonly restoration_id: string;
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly recovery_hash: string;
  readonly rollback_candidate_hash: string;
  readonly restored_at: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly replay_timeline_hash: string;
  readonly timeline_events: readonly ReplayIntelligenceReplayTimelineEvent[];
}

export interface ReplayIntelligenceReplayTimelineEvent {
  readonly event_index: number;
  readonly event_type:
    | "recovery_snapshot"
    | "rollback_candidate"
    | "restoration_snapshot";
  readonly event_hash: string;
  readonly occurred_at: string;
}

export interface ReplayIntelligenceRestorationCheckpoint {
  readonly restoration_id: string;
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly recovery_hash: string;
  readonly rollback_candidate_hash: string;
  readonly restored_at: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly replay_timeline_hash: string;
  readonly checkpoint_hash: string;
  readonly checkpoint_status: "restorable" | "blocked";
}

export function buildReplayIntelligenceRestorationSnapshot(
  orchestrationSnapshot: ReplayIntelligenceOrchestrationSnapshot,
  recoverySnapshot: ReplayIntelligenceRecoverySnapshot,
  rollbackCandidate: ReplayIntelligenceRollbackCandidate,
  restored_at: string,
): ReplayIntelligenceRestorationSnapshot {
  const base = buildRestorationBase(
    orchestrationSnapshot,
    recoverySnapshot,
    rollbackCandidate,
    restored_at,
  );
  const restorationId = buildReplayIntelligenceRestorationId({
    kind: "replay_intelligence_restoration_snapshot",
    ...base,
  });
  const replayTimelineHash = computeReplayIntelligenceRestorationHash({
    kind: "replay_intelligence_replay_timeline",
    restoration_id: restorationId,
    ...base,
  });
  const checkpointHash = computeReplayIntelligenceRestorationHash({
    kind: "replay_intelligence_restoration_checkpoint",
    restoration_id: restorationId,
    replay_timeline_hash: replayTimelineHash,
    ...base,
  });

  return {
    restoration_id: restorationId,
    ...base,
    replay_timeline_hash: replayTimelineHash,
    checkpoint_hash: checkpointHash,
    orchestration_snapshot: orchestrationSnapshot,
  };
}

export function buildReplayIntelligenceRestorationResult(
  restorationSnapshot: ReplayIntelligenceRestorationSnapshot,
): ReplayIntelligenceRestorationResult {
  const validationErrors = validateReplayIntelligenceRestorationSnapshot(restorationSnapshot);

  return {
    restoration_id: restorationSnapshot.restoration_id,
    snapshot_id: restorationSnapshot.snapshot_id,
    orchestration_hash: restorationSnapshot.orchestration_hash,
    recovery_hash: restorationSnapshot.recovery_hash,
    rollback_candidate_hash: restorationSnapshot.rollback_candidate_hash,
    restored_at: restorationSnapshot.restored_at,
    convergence_score: restorationSnapshot.convergence_score,
    lineage_node_count: restorationSnapshot.lineage_node_count,
    anomaly_cluster_count: restorationSnapshot.anomaly_cluster_count,
    forecast_count: restorationSnapshot.forecast_count,
    heatmap_cell_count: restorationSnapshot.heatmap_cell_count,
    replay_timeline_hash: restorationSnapshot.replay_timeline_hash,
    checkpoint_hash: restorationSnapshot.checkpoint_hash,
    restored: validationErrors.length === 0,
    validation_errors: validationErrors,
  };
}

export function buildReplayIntelligenceReplayTimeline(
  restorationSnapshot: ReplayIntelligenceRestorationSnapshot,
): ReplayIntelligenceReplayTimeline {
  const timelineEvents: ReplayIntelligenceReplayTimelineEvent[] = [
    {
      event_index: 0,
      event_type: "recovery_snapshot",
      event_hash: restorationSnapshot.recovery_hash,
      occurred_at: restorationSnapshot.orchestration_snapshot.generated_at,
    },
    {
      event_index: 1,
      event_type: "rollback_candidate",
      event_hash: restorationSnapshot.rollback_candidate_hash,
      occurred_at: restorationSnapshot.restored_at,
    },
    {
      event_index: 2,
      event_type: "restoration_snapshot",
      event_hash: restorationSnapshot.restoration_id,
      occurred_at: restorationSnapshot.restored_at,
    },
  ];

  return {
    restoration_id: restorationSnapshot.restoration_id,
    snapshot_id: restorationSnapshot.snapshot_id,
    orchestration_hash: restorationSnapshot.orchestration_hash,
    recovery_hash: restorationSnapshot.recovery_hash,
    rollback_candidate_hash: restorationSnapshot.rollback_candidate_hash,
    restored_at: restorationSnapshot.restored_at,
    convergence_score: restorationSnapshot.convergence_score,
    lineage_node_count: restorationSnapshot.lineage_node_count,
    anomaly_cluster_count: restorationSnapshot.anomaly_cluster_count,
    forecast_count: restorationSnapshot.forecast_count,
    heatmap_cell_count: restorationSnapshot.heatmap_cell_count,
    replay_timeline_hash: computeReplayIntelligenceRestorationHash({
      kind: "replay_intelligence_replay_timeline_record",
      restoration_id: restorationSnapshot.restoration_id,
      events: timelineEvents,
    }),
    timeline_events: timelineEvents,
  };
}

export function buildReplayIntelligenceRestorationCheckpoint(
  restorationSnapshot: ReplayIntelligenceRestorationSnapshot,
): ReplayIntelligenceRestorationCheckpoint {
  const validationErrors = validateReplayIntelligenceRestorationSnapshot(restorationSnapshot);

  return {
    restoration_id: restorationSnapshot.restoration_id,
    snapshot_id: restorationSnapshot.snapshot_id,
    orchestration_hash: restorationSnapshot.orchestration_hash,
    recovery_hash: restorationSnapshot.recovery_hash,
    rollback_candidate_hash: restorationSnapshot.rollback_candidate_hash,
    restored_at: restorationSnapshot.restored_at,
    convergence_score: restorationSnapshot.convergence_score,
    lineage_node_count: restorationSnapshot.lineage_node_count,
    anomaly_cluster_count: restorationSnapshot.anomaly_cluster_count,
    forecast_count: restorationSnapshot.forecast_count,
    heatmap_cell_count: restorationSnapshot.heatmap_cell_count,
    replay_timeline_hash: restorationSnapshot.replay_timeline_hash,
    checkpoint_hash: computeReplayIntelligenceRestorationHash({
      kind: "replay_intelligence_restoration_checkpoint_record",
      restoration_id: restorationSnapshot.restoration_id,
      snapshot_id: restorationSnapshot.snapshot_id,
      replay_timeline_hash: restorationSnapshot.replay_timeline_hash,
      checkpoint_hash: restorationSnapshot.checkpoint_hash,
      validation_errors: validationErrors,
    }),
    checkpoint_status: validationErrors.length === 0 ? "restorable" : "blocked",
  };
}

export function validateReplayIntelligenceRestorationSnapshot(
  restorationSnapshot: ReplayIntelligenceRestorationSnapshot,
): readonly string[] {
  const errors: string[] = [];
  const source = restorationSnapshot.orchestration_snapshot;

  if (!restorationSnapshot.restoration_id) errors.push("restoration_id is required");
  if (!restorationSnapshot.snapshot_id) errors.push("snapshot_id is required");
  if (!restorationSnapshot.orchestration_hash) errors.push("orchestration_hash is required");
  if (!restorationSnapshot.recovery_hash) errors.push("recovery_hash is required");
  if (!restorationSnapshot.rollback_candidate_hash) errors.push("rollback_candidate_hash is required");
  if (!restorationSnapshot.restored_at) errors.push("restored_at is required");
  if (!restorationSnapshot.replay_timeline_hash) errors.push("replay_timeline_hash is required");
  if (!restorationSnapshot.checkpoint_hash) errors.push("checkpoint_hash is required");
  if (restorationSnapshot.orchestration_hash !== source.orchestration_hash) {
    errors.push("orchestration_hash does not match source snapshot");
  }
  if (restorationSnapshot.convergence_score !== source.convergence_score) {
    errors.push("convergence_score does not match source snapshot");
  }
  if (restorationSnapshot.lineage_node_count !== source.lineage_nodes.length) {
    errors.push("lineage_node_count does not match source snapshot");
  }
  if (restorationSnapshot.anomaly_cluster_count !== source.anomaly_clusters.length) {
    errors.push("anomaly_cluster_count does not match source snapshot");
  }
  if (restorationSnapshot.forecast_count !== source.forecasts.length) {
    errors.push("forecast_count does not match source snapshot");
  }
  if (restorationSnapshot.heatmap_cell_count !== source.heatmap.length) {
    errors.push("heatmap_cell_count does not match source snapshot");
  }

  return errors.sort((left, right) => left.localeCompare(right));
}

function buildRestorationBase(
  orchestrationSnapshot: ReplayIntelligenceOrchestrationSnapshot,
  recoverySnapshot: ReplayIntelligenceRecoverySnapshot,
  rollbackCandidate: ReplayIntelligenceRollbackCandidate,
  restored_at: string,
) {
  return {
    snapshot_id: recoverySnapshot.snapshot_id,
    orchestration_hash: orchestrationSnapshot.orchestration_hash,
    recovery_hash: recoverySnapshot.recovery_hash,
    rollback_candidate_hash: rollbackCandidate.rollback_candidate_hash,
    restored_at,
    convergence_score: orchestrationSnapshot.convergence_score,
    lineage_node_count: orchestrationSnapshot.lineage_nodes.length,
    anomaly_cluster_count: orchestrationSnapshot.anomaly_clusters.length,
    forecast_count: orchestrationSnapshot.forecasts.length,
    heatmap_cell_count: orchestrationSnapshot.heatmap.length,
  };
}

function buildReplayIntelligenceRestorationId(value: unknown): string {
  return `replay-intelligence-restoration:${computeReplayIntelligenceRestorationHash(value)}`;
}

function computeReplayIntelligenceRestorationHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableReplayIntelligenceRestorationStringify(value))
    .digest("hex");
}

function stableReplayIntelligenceRestorationStringify(value: unknown): string {
  return JSON.stringify(sortReplayIntelligenceRestorationKeys(value));
}

function sortReplayIntelligenceRestorationKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortReplayIntelligenceRestorationKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortReplayIntelligenceRestorationKeys(
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
