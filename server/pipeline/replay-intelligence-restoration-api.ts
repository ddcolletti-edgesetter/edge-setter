import type {
  ReplayIntelligenceOrchestrationSnapshot,
} from "./replay-intelligence-orchestration";
import type {
  ReplayIntelligenceRecoverySnapshot,
  ReplayIntelligenceRollbackCandidate,
} from "./replay-intelligence-recovery";
import type {
  ReplayIntelligenceReplayTimeline,
  ReplayIntelligenceRestorationCheckpoint,
  ReplayIntelligenceRestorationResult,
  ReplayIntelligenceRestorationSnapshot,
} from "./replay-intelligence-restoration";

export interface ReplayIntelligenceRestorationApiResponse {
  readonly restoration_id: string;
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly recovery_hash: string;
  readonly rollback_candidate_hash: string;
  readonly restored_at: string;
  readonly generated_at: string;
  readonly convergence_score: number;
  readonly replay_timeline_hash: string;
  readonly checkpoint_hash: string;
  readonly restored: boolean;
  readonly rollback_eligible: boolean;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly validation_errors: readonly string[];
}

export interface ReplayIntelligenceRollbackApiResponse {
  readonly restoration_id: string;
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly recovery_hash: string;
  readonly rollback_candidate_hash: string;
  readonly restored_at: string;
  readonly generated_at: string;
  readonly convergence_score: number;
  readonly replay_timeline_hash: string;
  readonly checkpoint_hash: string;
  readonly restored: boolean;
  readonly rollback_eligible: boolean;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
}

export interface ReplayIntelligenceReplayTimelineApiResponse {
  readonly restoration_id: string;
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly recovery_hash: string;
  readonly rollback_candidate_hash: string;
  readonly restored_at: string;
  readonly generated_at: string;
  readonly convergence_score: number;
  readonly replay_timeline_hash: string;
  readonly checkpoint_hash: string;
  readonly restored: boolean;
  readonly rollback_eligible: boolean;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly timeline: ReplayIntelligenceReplayTimeline;
}

export function buildReplayIntelligenceRestorationApiResponse(
  restorationSnapshot: ReplayIntelligenceRestorationSnapshot,
  restorationResult: ReplayIntelligenceRestorationResult,
  checkpoint: ReplayIntelligenceRestorationCheckpoint,
): ReplayIntelligenceRestorationApiResponse {
  return {
    ...buildBaseRestorationApiFields(restorationSnapshot),
    restored: restorationResult.restored,
    rollback_eligible: checkpoint.checkpoint_status === "restorable",
    validation_errors: restorationResult.validation_errors,
  };
}

export function buildReplayIntelligenceRollbackApiResponse(
  rollbackCandidate: ReplayIntelligenceRollbackCandidate,
  restorationSnapshot: ReplayIntelligenceRestorationSnapshot,
): ReplayIntelligenceRollbackApiResponse {
  return {
    ...buildBaseRestorationApiFields(restorationSnapshot),
    restored: rollbackCandidate.eligible,
    rollback_eligible: rollbackCandidate.eligible,
  };
}

export function buildReplayIntelligenceReplayTimelineApiResponse(
  replayTimeline: ReplayIntelligenceReplayTimeline,
  restorationSnapshot: ReplayIntelligenceRestorationSnapshot,
): ReplayIntelligenceReplayTimelineApiResponse {
  return {
    ...buildBaseRestorationApiFields(restorationSnapshot),
    restored: validateReplayIntelligenceRestorationApiSource(restorationSnapshot).length === 0,
    rollback_eligible: true,
    replay_timeline_hash: replayTimeline.replay_timeline_hash,
    timeline: replayTimeline,
  };
}

export function validateReplayIntelligenceRestorationApiSource(
  restorationSnapshot: ReplayIntelligenceRestorationSnapshot,
): readonly string[] {
  const errors: string[] = [];
  const source: ReplayIntelligenceOrchestrationSnapshot =
    restorationSnapshot.orchestration_snapshot;

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

function buildBaseRestorationApiFields(
  restorationSnapshot: ReplayIntelligenceRestorationSnapshot,
) {
  return {
    restoration_id: restorationSnapshot.restoration_id,
    snapshot_id: restorationSnapshot.snapshot_id,
    orchestration_hash: restorationSnapshot.orchestration_hash,
    recovery_hash: restorationSnapshot.recovery_hash,
    rollback_candidate_hash: restorationSnapshot.rollback_candidate_hash,
    restored_at: restorationSnapshot.restored_at,
    generated_at: restorationSnapshot.orchestration_snapshot.generated_at,
    convergence_score: restorationSnapshot.convergence_score,
    replay_timeline_hash: restorationSnapshot.replay_timeline_hash,
    checkpoint_hash: restorationSnapshot.checkpoint_hash,
    lineage_node_count: restorationSnapshot.lineage_node_count,
    anomaly_cluster_count: restorationSnapshot.anomaly_cluster_count,
    forecast_count: restorationSnapshot.forecast_count,
    heatmap_cell_count: restorationSnapshot.heatmap_cell_count,
  };
}

export type ReplayIntelligenceRestorationApiSource =
  | ReplayIntelligenceRecoverySnapshot
  | ReplayIntelligenceRestorationSnapshot;
