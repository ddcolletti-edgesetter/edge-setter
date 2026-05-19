import crypto from "node:crypto";

import type {
  ReplayIntelligenceReducerState,
  ReplayIntelligenceReplaybackCheckpoint,
  ReplayIntelligenceReplaybackState,
} from "./replay-intelligence-reducer";
import type {
  ReplayIntelligenceReplayTimeline,
} from "./replay-intelligence-restoration";

export interface ReplayIntelligenceReconstructionState {
  readonly reconstruction_id: string;
  readonly reducer_id: string;
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly recovery_hash: string;
  readonly restoration_id: string;
  readonly replay_timeline_hash: string;
  readonly replayback_hash: string;
  readonly checkpoint_hash: string;
  readonly reconstruction_hash: string;
  readonly traversal_hash: string;
  readonly diff_hash: string;
  readonly analytics_hash: string;
  readonly reconstructed_at: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly restored: boolean;
  readonly replayback_ready: boolean;
  readonly timeline_event_count: number;
}

export interface ReplayIntelligenceReplayTraversal {
  readonly reconstruction_id: string;
  readonly reducer_id: string;
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly recovery_hash: string;
  readonly restoration_id: string;
  readonly replay_timeline_hash: string;
  readonly replayback_hash: string;
  readonly checkpoint_hash: string;
  readonly reconstruction_hash: string;
  readonly traversal_hash: string;
  readonly diff_hash: string;
  readonly analytics_hash: string;
  readonly reconstructed_at: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly restored: boolean;
  readonly replayback_ready: boolean;
  readonly traversal_steps: readonly ReplayIntelligenceTraversalStep[];
}

export interface ReplayIntelligenceTraversalStep {
  readonly step_index: number;
  readonly step_type:
    | "orchestration"
    | "recovery"
    | "restoration"
    | "replayback"
    | "checkpoint";
  readonly step_hash: string;
}

export interface ReplayIntelligenceStateDiff {
  readonly reconstruction_id: string;
  readonly reducer_id: string;
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly recovery_hash: string;
  readonly restoration_id: string;
  readonly replay_timeline_hash: string;
  readonly replayback_hash: string;
  readonly checkpoint_hash: string;
  readonly reconstruction_hash: string;
  readonly traversal_hash: string;
  readonly diff_hash: string;
  readonly analytics_hash: string;
  readonly reconstructed_at: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly restored: boolean;
  readonly replayback_ready: boolean;
  readonly diff_count: number;
  readonly equivalent: boolean;
}

export interface ReplayIntelligenceConvergenceAnalytics {
  readonly reconstruction_id: string;
  readonly reducer_id: string;
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly recovery_hash: string;
  readonly restoration_id: string;
  readonly replay_timeline_hash: string;
  readonly replayback_hash: string;
  readonly checkpoint_hash: string;
  readonly reconstruction_hash: string;
  readonly traversal_hash: string;
  readonly diff_hash: string;
  readonly analytics_hash: string;
  readonly reconstructed_at: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly restored: boolean;
  readonly replayback_ready: boolean;
  readonly convergence_density: number;
  readonly replayback_complete: boolean;
}

export function buildReplayIntelligenceReconstructionState(
  reducerState: ReplayIntelligenceReducerState,
  replaybackState: ReplayIntelligenceReplaybackState,
  replayTimeline: ReplayIntelligenceReplayTimeline,
  checkpoint: ReplayIntelligenceReplaybackCheckpoint,
  reconstructed_at: string,
): ReplayIntelligenceReconstructionState {
  const base = {
    reducer_id: reducerState.reducer_id,
    snapshot_id: reducerState.snapshot_id,
    orchestration_hash: reducerState.orchestration_hash,
    recovery_hash: reducerState.recovery_hash,
    restoration_id: reducerState.restoration_id,
    replay_timeline_hash: replayTimeline.replay_timeline_hash,
    replayback_hash: replaybackState.replayback_hash,
    checkpoint_hash: checkpoint.checkpoint_hash,
    reconstructed_at,
    convergence_score: replaybackState.convergence_score,
    lineage_node_count: replaybackState.lineage_node_count,
    anomaly_cluster_count: replaybackState.anomaly_cluster_count,
    forecast_count: replaybackState.forecast_count,
    heatmap_cell_count: replaybackState.heatmap_cell_count,
    restored: replaybackState.restored,
    replayback_ready: replaybackState.replayback_ready &&
      replaybackState.replay_timeline_hash === replayTimeline.replay_timeline_hash,
    timeline_event_count: replayTimeline.timeline_events.length,
  };
  const reconstructionHash = computeReconstructionHash({
    kind: "replay_intelligence_reconstruction_state",
    ...base,
  });
  const reconstructionId = `replay-intelligence-reconstruction:${reconstructionHash}`;
  const traversalSteps = buildTraversalSteps({
    orchestration_hash: base.orchestration_hash,
    recovery_hash: base.recovery_hash,
    restoration_id: base.restoration_id,
    replayback_hash: base.replayback_hash,
    checkpoint_hash: base.checkpoint_hash,
  });
  const traversalHash = buildTraversalHash(reconstructionId, traversalSteps);
  const diffHash = buildDiffHash(reconstructionId, base, true);
  const analyticsHash = buildAnalyticsHash(reconstructionId, base);

  return {
    reconstruction_id: reconstructionId,
    ...base,
    reconstruction_hash: reconstructionHash,
    traversal_hash: traversalHash,
    diff_hash: diffHash,
    analytics_hash: analyticsHash,
  };
}

export function buildReplayIntelligenceReplayTraversal(
  reconstructionState: ReplayIntelligenceReconstructionState,
): ReplayIntelligenceReplayTraversal {
  const traversalSteps = buildTraversalSteps({
    orchestration_hash: reconstructionState.orchestration_hash,
    recovery_hash: reconstructionState.recovery_hash,
    restoration_id: reconstructionState.restoration_id,
    replayback_hash: reconstructionState.replayback_hash,
    checkpoint_hash: reconstructionState.checkpoint_hash,
  });

  return {
    ...copyReconstructionCore(reconstructionState),
    traversal_hash: buildTraversalHash(
      reconstructionState.reconstruction_id,
      traversalSteps,
    ),
    traversal_steps: traversalSteps,
  };
}

export function buildReplayIntelligenceStateDiff(
  reconstructionState: ReplayIntelligenceReconstructionState,
): ReplayIntelligenceStateDiff {
  const equivalent = validateReplayIntelligenceReconstructionState(reconstructionState).length === 0;
  const diffCount = equivalent ? 0 : 1;

  return {
    ...copyReconstructionCore(reconstructionState),
    diff_hash: buildDiffHash(
      reconstructionState.reconstruction_id,
      reconstructionState,
      equivalent,
    ),
    diff_count: diffCount,
    equivalent,
  };
}

export function buildReplayIntelligenceConvergenceAnalytics(
  reconstructionState: ReplayIntelligenceReconstructionState,
): ReplayIntelligenceConvergenceAnalytics {
  return {
    ...copyReconstructionCore(reconstructionState),
    analytics_hash: buildAnalyticsHash(
      reconstructionState.reconstruction_id,
      reconstructionState,
    ),
    convergence_density: computeConvergenceDensity(reconstructionState),
    replayback_complete: reconstructionState.restored &&
      reconstructionState.replayback_ready,
  };
}

export function validateReplayIntelligenceReconstructionState(
  reconstructionState: ReplayIntelligenceReconstructionState,
): readonly string[] {
  const errors: string[] = [];

  if (!reconstructionState.reconstruction_id) errors.push("reconstruction_id is required");
  if (!reconstructionState.reducer_id) errors.push("reducer_id is required");
  if (!reconstructionState.snapshot_id) errors.push("snapshot_id is required");
  if (!reconstructionState.orchestration_hash) errors.push("orchestration_hash is required");
  if (!reconstructionState.recovery_hash) errors.push("recovery_hash is required");
  if (!reconstructionState.restoration_id) errors.push("restoration_id is required");
  if (!reconstructionState.replay_timeline_hash) errors.push("replay_timeline_hash is required");
  if (!reconstructionState.replayback_hash) errors.push("replayback_hash is required");
  if (!reconstructionState.checkpoint_hash) errors.push("checkpoint_hash is required");
  if (!reconstructionState.reconstructed_at) errors.push("reconstructed_at is required");
  if (!reconstructionState.restored) errors.push("state is not restored");
  if (!reconstructionState.replayback_ready) errors.push("state is not replayback ready");

  return errors.sort((left, right) => left.localeCompare(right));
}

function copyReconstructionCore(
  reconstructionState: ReplayIntelligenceReconstructionState,
) {
  return {
    reconstruction_id: reconstructionState.reconstruction_id,
    reducer_id: reconstructionState.reducer_id,
    snapshot_id: reconstructionState.snapshot_id,
    orchestration_hash: reconstructionState.orchestration_hash,
    recovery_hash: reconstructionState.recovery_hash,
    restoration_id: reconstructionState.restoration_id,
    replay_timeline_hash: reconstructionState.replay_timeline_hash,
    replayback_hash: reconstructionState.replayback_hash,
    checkpoint_hash: reconstructionState.checkpoint_hash,
    reconstruction_hash: reconstructionState.reconstruction_hash,
    traversal_hash: reconstructionState.traversal_hash,
    diff_hash: reconstructionState.diff_hash,
    analytics_hash: reconstructionState.analytics_hash,
    reconstructed_at: reconstructionState.reconstructed_at,
    convergence_score: reconstructionState.convergence_score,
    lineage_node_count: reconstructionState.lineage_node_count,
    anomaly_cluster_count: reconstructionState.anomaly_cluster_count,
    forecast_count: reconstructionState.forecast_count,
    heatmap_cell_count: reconstructionState.heatmap_cell_count,
    restored: reconstructionState.restored,
    replayback_ready: reconstructionState.replayback_ready,
  };
}

function buildTraversalSteps(params: {
  readonly orchestration_hash: string;
  readonly recovery_hash: string;
  readonly restoration_id: string;
  readonly replayback_hash: string;
  readonly checkpoint_hash: string;
}): readonly ReplayIntelligenceTraversalStep[] {
  return [
    {
      step_index: 0,
      step_type: "orchestration",
      step_hash: params.orchestration_hash,
    },
    {
      step_index: 1,
      step_type: "recovery",
      step_hash: params.recovery_hash,
    },
    {
      step_index: 2,
      step_type: "restoration",
      step_hash: params.restoration_id,
    },
    {
      step_index: 3,
      step_type: "replayback",
      step_hash: params.replayback_hash,
    },
    {
      step_index: 4,
      step_type: "checkpoint",
      step_hash: params.checkpoint_hash,
    },
  ];
}

function buildTraversalHash(
  reconstructionId: string,
  traversalSteps: readonly ReplayIntelligenceTraversalStep[],
): string {
  return computeReconstructionHash({
    kind: "replay_intelligence_replay_traversal",
    reconstruction_id: reconstructionId,
    traversal_steps: traversalSteps,
  });
}

function buildDiffHash(
  reconstructionId: string,
  value: unknown,
  equivalent: boolean,
): string {
  return computeReconstructionHash({
    kind: "replay_intelligence_state_diff",
    reconstruction_id: reconstructionId,
    equivalent,
    value,
  });
}

function buildAnalyticsHash(
  reconstructionId: string,
  value: {
    readonly convergence_score: number;
    readonly lineage_node_count: number;
    readonly anomaly_cluster_count: number;
    readonly forecast_count: number;
    readonly heatmap_cell_count: number;
    readonly restored: boolean;
    readonly replayback_ready: boolean;
  },
): string {
  return computeReconstructionHash({
    kind: "replay_intelligence_convergence_analytics",
    reconstruction_id: reconstructionId,
    convergence_score: value.convergence_score,
    lineage_node_count: value.lineage_node_count,
    anomaly_cluster_count: value.anomaly_cluster_count,
    forecast_count: value.forecast_count,
    heatmap_cell_count: value.heatmap_cell_count,
    restored: value.restored,
    replayback_ready: value.replayback_ready,
  });
}

function computeConvergenceDensity(
  reconstructionState: ReplayIntelligenceReconstructionState,
): number {
  const denominator =
    reconstructionState.lineage_node_count +
    reconstructionState.anomaly_cluster_count +
    reconstructionState.forecast_count +
    reconstructionState.heatmap_cell_count;

  if (denominator === 0) {
    return 0;
  }

  return Number((reconstructionState.convergence_score / denominator).toFixed(4));
}

function computeReconstructionHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableReconstructionStringify(value))
    .digest("hex");
}

function stableReconstructionStringify(value: unknown): string {
  return JSON.stringify(sortReconstructionKeys(value));
}

function sortReconstructionKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortReconstructionKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortReconstructionKeys((value as Record<string, unknown>)[key]);
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
