import crypto from "node:crypto";

import type {
  ReplayIntelligenceOrchestrationSnapshot,
} from "./replay-intelligence-orchestration";
import type {
  ReplayIntelligencePersistentSnapshot,
} from "./replay-intelligence-persistence";
import type {
  ReplayIntelligenceRecoverySnapshot,
} from "./replay-intelligence-recovery";
import type {
  ReplayIntelligenceReplayTimeline,
  ReplayIntelligenceRestorationSnapshot,
} from "./replay-intelligence-restoration";

export interface ReplayIntelligenceReducerState {
  readonly reducer_id: string;
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly recovery_hash: string;
  readonly restoration_id: string;
  readonly replay_timeline_hash: string;
  readonly replayback_hash: string;
  readonly checkpoint_hash: string;
  readonly reduced_at: string;
  readonly replayed_at: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly restored: boolean;
  readonly replayback_ready: boolean;
}

export interface ReplayIntelligenceReplaybackState {
  readonly reducer_id: string;
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly recovery_hash: string;
  readonly restoration_id: string;
  readonly replay_timeline_hash: string;
  readonly replayback_hash: string;
  readonly checkpoint_hash: string;
  readonly reduced_at: string;
  readonly replayed_at: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly restored: boolean;
  readonly replayback_ready: boolean;
  readonly timeline_event_count: number;
}

export interface ReplayIntelligenceRestorationReducerResult {
  readonly reducer_id: string;
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly recovery_hash: string;
  readonly restoration_id: string;
  readonly replay_timeline_hash: string;
  readonly replayback_hash: string;
  readonly checkpoint_hash: string;
  readonly reduced_at: string;
  readonly replayed_at: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly restored: boolean;
  readonly replayback_ready: boolean;
  readonly validation_errors: readonly string[];
}

export interface ReplayIntelligenceReplaybackCheckpoint {
  readonly reducer_id: string;
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly recovery_hash: string;
  readonly restoration_id: string;
  readonly replay_timeline_hash: string;
  readonly replayback_hash: string;
  readonly checkpoint_hash: string;
  readonly reduced_at: string;
  readonly replayed_at: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly restored: boolean;
  readonly replayback_ready: boolean;
}

export function buildReplayIntelligenceReducerState(
  orchestrationSnapshot: ReplayIntelligenceOrchestrationSnapshot,
  persistentSnapshot: ReplayIntelligencePersistentSnapshot,
  recoverySnapshot: ReplayIntelligenceRecoverySnapshot,
  restorationSnapshot: ReplayIntelligenceRestorationSnapshot,
): ReplayIntelligenceReducerState {
  const base = buildReducerBase(
    orchestrationSnapshot,
    persistentSnapshot,
    recoverySnapshot,
    restorationSnapshot,
  );
  const reducerId = buildReplayIntelligenceReducerId({
    kind: "replay_intelligence_reducer_state",
    ...base,
  });
  const replaybackHash = computeReplayIntelligenceReducerHash({
    kind: "replay_intelligence_reducer_replayback_seed",
    reducer_id: reducerId,
    ...base,
  });
  const checkpointHash = computeReplayIntelligenceReducerHash({
    kind: "replay_intelligence_reducer_checkpoint_seed",
    reducer_id: reducerId,
    replayback_hash: replaybackHash,
    ...base,
  });

  return {
    reducer_id: reducerId,
    ...base,
    replayback_hash: replaybackHash,
    checkpoint_hash: checkpointHash,
  };
}

export function buildReplayIntelligenceReplaybackState(
  reducerState: ReplayIntelligenceReducerState,
  replayTimeline: ReplayIntelligenceReplayTimeline,
  replayed_at: string,
): ReplayIntelligenceReplaybackState {
  const base = {
    reducer_id: reducerState.reducer_id,
    snapshot_id: reducerState.snapshot_id,
    orchestration_hash: reducerState.orchestration_hash,
    recovery_hash: reducerState.recovery_hash,
    restoration_id: reducerState.restoration_id,
    replay_timeline_hash: replayTimeline.replay_timeline_hash,
    reduced_at: reducerState.reduced_at,
    replayed_at,
    convergence_score: reducerState.convergence_score,
    lineage_node_count: reducerState.lineage_node_count,
    anomaly_cluster_count: reducerState.anomaly_cluster_count,
    forecast_count: reducerState.forecast_count,
    heatmap_cell_count: reducerState.heatmap_cell_count,
    restored: reducerState.restored,
    replayback_ready: reducerState.restored &&
      replayTimeline.replay_timeline_hash === reducerState.replay_timeline_hash,
    timeline_event_count: replayTimeline.timeline_events.length,
  };
  const replaybackHash = computeReplayIntelligenceReducerHash({
    kind: "replay_intelligence_replayback_state",
    ...base,
  });
  const checkpointHash = computeReplayIntelligenceReducerHash({
    kind: "replay_intelligence_replayback_checkpoint",
    replayback_hash: replaybackHash,
    ...base,
  });

  return {
    ...base,
    replayback_hash: replaybackHash,
    checkpoint_hash: checkpointHash,
  };
}

export function buildReplayIntelligenceRestorationReducerResult(
  replaybackState: ReplayIntelligenceReplaybackState,
): ReplayIntelligenceRestorationReducerResult {
  const validationErrors = validateReplayIntelligenceReplaybackState(replaybackState);

  return {
    reducer_id: replaybackState.reducer_id,
    snapshot_id: replaybackState.snapshot_id,
    orchestration_hash: replaybackState.orchestration_hash,
    recovery_hash: replaybackState.recovery_hash,
    restoration_id: replaybackState.restoration_id,
    replay_timeline_hash: replaybackState.replay_timeline_hash,
    replayback_hash: replaybackState.replayback_hash,
    checkpoint_hash: replaybackState.checkpoint_hash,
    reduced_at: replaybackState.reduced_at,
    replayed_at: replaybackState.replayed_at,
    convergence_score: replaybackState.convergence_score,
    lineage_node_count: replaybackState.lineage_node_count,
    anomaly_cluster_count: replaybackState.anomaly_cluster_count,
    forecast_count: replaybackState.forecast_count,
    heatmap_cell_count: replaybackState.heatmap_cell_count,
    restored: replaybackState.restored && validationErrors.length === 0,
    replayback_ready: replaybackState.replayback_ready && validationErrors.length === 0,
    validation_errors: validationErrors,
  };
}

export function buildReplayIntelligenceReplaybackCheckpoint(
  replaybackState: ReplayIntelligenceReplaybackState,
): ReplayIntelligenceReplaybackCheckpoint {
  const checkpointHash = computeReplayIntelligenceReducerHash({
    kind: "replay_intelligence_replayback_checkpoint_record",
    reducer_id: replaybackState.reducer_id,
    snapshot_id: replaybackState.snapshot_id,
    replayback_hash: replaybackState.replayback_hash,
    replay_timeline_hash: replaybackState.replay_timeline_hash,
    replayed_at: replaybackState.replayed_at,
  });

  return {
    reducer_id: replaybackState.reducer_id,
    snapshot_id: replaybackState.snapshot_id,
    orchestration_hash: replaybackState.orchestration_hash,
    recovery_hash: replaybackState.recovery_hash,
    restoration_id: replaybackState.restoration_id,
    replay_timeline_hash: replaybackState.replay_timeline_hash,
    replayback_hash: replaybackState.replayback_hash,
    checkpoint_hash: checkpointHash,
    reduced_at: replaybackState.reduced_at,
    replayed_at: replaybackState.replayed_at,
    convergence_score: replaybackState.convergence_score,
    lineage_node_count: replaybackState.lineage_node_count,
    anomaly_cluster_count: replaybackState.anomaly_cluster_count,
    forecast_count: replaybackState.forecast_count,
    heatmap_cell_count: replaybackState.heatmap_cell_count,
    restored: replaybackState.restored,
    replayback_ready: replaybackState.replayback_ready,
  };
}

export function validateReplayIntelligenceReplaybackState(
  replaybackState: ReplayIntelligenceReplaybackState,
): readonly string[] {
  const errors: string[] = [];

  if (!replaybackState.reducer_id) errors.push("reducer_id is required");
  if (!replaybackState.snapshot_id) errors.push("snapshot_id is required");
  if (!replaybackState.orchestration_hash) errors.push("orchestration_hash is required");
  if (!replaybackState.recovery_hash) errors.push("recovery_hash is required");
  if (!replaybackState.restoration_id) errors.push("restoration_id is required");
  if (!replaybackState.replay_timeline_hash) errors.push("replay_timeline_hash is required");
  if (!replaybackState.replayback_hash) errors.push("replayback_hash is required");
  if (!replaybackState.checkpoint_hash) errors.push("checkpoint_hash is required");
  if (!replaybackState.reduced_at) errors.push("reduced_at is required");
  if (!replaybackState.replayed_at) errors.push("replayed_at is required");
  if (!replaybackState.restored) errors.push("state is not restored");
  if (!replaybackState.replayback_ready) errors.push("state is not replayback ready");

  return errors.sort((left, right) => left.localeCompare(right));
}

function buildReducerBase(
  orchestrationSnapshot: ReplayIntelligenceOrchestrationSnapshot,
  persistentSnapshot: ReplayIntelligencePersistentSnapshot,
  recoverySnapshot: ReplayIntelligenceRecoverySnapshot,
  restorationSnapshot: ReplayIntelligenceRestorationSnapshot,
) {
  return {
    snapshot_id: persistentSnapshot.snapshot_id,
    orchestration_hash: orchestrationSnapshot.orchestration_hash,
    recovery_hash: recoverySnapshot.recovery_hash,
    restoration_id: restorationSnapshot.restoration_id,
    replay_timeline_hash: restorationSnapshot.replay_timeline_hash,
    reduced_at: restorationSnapshot.restored_at,
    replayed_at: restorationSnapshot.restored_at,
    convergence_score: orchestrationSnapshot.convergence_score,
    lineage_node_count: orchestrationSnapshot.lineage_nodes.length,
    anomaly_cluster_count: orchestrationSnapshot.anomaly_clusters.length,
    forecast_count: orchestrationSnapshot.forecasts.length,
    heatmap_cell_count: orchestrationSnapshot.heatmap.length,
    restored: restorationSnapshot.snapshot_id === persistentSnapshot.snapshot_id &&
      recoverySnapshot.snapshot_id === persistentSnapshot.snapshot_id &&
      restorationSnapshot.orchestration_hash === orchestrationSnapshot.orchestration_hash,
    replayback_ready: restorationSnapshot.replay_timeline_hash.length > 0,
  };
}

function buildReplayIntelligenceReducerId(value: unknown): string {
  return `replay-intelligence-reducer:${computeReplayIntelligenceReducerHash(value)}`;
}

function computeReplayIntelligenceReducerHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableReplayIntelligenceReducerStringify(value))
    .digest("hex");
}

function stableReplayIntelligenceReducerStringify(value: unknown): string {
  return JSON.stringify(sortReplayIntelligenceReducerKeys(value));
}

function sortReplayIntelligenceReducerKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortReplayIntelligenceReducerKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortReplayIntelligenceReducerKeys(
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
