import crypto from "node:crypto";

import type {
  ReplayIntelligenceReducerState,
  ReplayIntelligenceReplaybackCheckpoint,
  ReplayIntelligenceReplaybackState,
  ReplayIntelligenceRestorationReducerResult,
} from "./replay-intelligence-reducer";
import type {
  ReplayIntelligenceReplayTimeline,
} from "./replay-intelligence-restoration";

export interface ReplayIntelligenceReplaybackApiResponse {
  readonly reducer_id: string;
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly recovery_hash: string;
  readonly restoration_id: string;
  readonly replay_timeline_hash: string;
  readonly replayback_hash: string;
  readonly checkpoint_hash: string;
  readonly generated_at: string;
  readonly replayed_at: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly restored: boolean;
  readonly replayback_ready: boolean;
  readonly reconstruction_hash: string;
  readonly validation_errors: readonly string[];
}

export interface ReplayIntelligenceReplaybackHistoryResponse {
  readonly reducer_id: string;
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly recovery_hash: string;
  readonly restoration_id: string;
  readonly replay_timeline_hash: string;
  readonly replayback_hash: string;
  readonly checkpoint_hash: string;
  readonly generated_at: string;
  readonly replayed_at: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly restored: boolean;
  readonly replayback_ready: boolean;
  readonly reconstruction_hash: string;
  readonly timeline_event_count: number;
  readonly replayback_history_hash: string;
}

export interface ReplayIntelligenceReplayReconstructionResponse {
  readonly reducer_id: string;
  readonly snapshot_id: string;
  readonly orchestration_hash: string;
  readonly recovery_hash: string;
  readonly restoration_id: string;
  readonly replay_timeline_hash: string;
  readonly replayback_hash: string;
  readonly checkpoint_hash: string;
  readonly generated_at: string;
  readonly replayed_at: string;
  readonly convergence_score: number;
  readonly lineage_node_count: number;
  readonly anomaly_cluster_count: number;
  readonly forecast_count: number;
  readonly heatmap_cell_count: number;
  readonly restored: boolean;
  readonly replayback_ready: boolean;
  readonly reconstruction_hash: string;
}

export function buildReplayIntelligenceReplaybackApiResponse(
  replaybackState: ReplayIntelligenceReplaybackState,
  reducerResult: ReplayIntelligenceRestorationReducerResult,
  checkpoint: ReplayIntelligenceReplaybackCheckpoint,
): ReplayIntelligenceReplaybackApiResponse {
  return {
    ...buildReplaybackApiBase(replaybackState, checkpoint.checkpoint_hash),
    restored: reducerResult.restored,
    replayback_ready: reducerResult.replayback_ready,
    reconstruction_hash: buildReplayReconstructionHash(replaybackState),
    validation_errors: reducerResult.validation_errors,
  };
}

export function buildReplayIntelligenceReplaybackHistoryResponse(
  replaybackState: ReplayIntelligenceReplaybackState,
  replayTimeline: ReplayIntelligenceReplayTimeline,
): ReplayIntelligenceReplaybackHistoryResponse {
  const reconstructionHash = buildReplayReconstructionHash(replaybackState);
  const base = {
    ...buildReplaybackApiBase(replaybackState, replaybackState.checkpoint_hash),
    restored: replaybackState.restored,
    replayback_ready: replaybackState.replayback_ready,
    reconstruction_hash: reconstructionHash,
    timeline_event_count: replayTimeline.timeline_events.length,
  };

  return {
    ...base,
    replayback_history_hash: computeReplaybackApiHash({
      kind: "replay_intelligence_replayback_history",
      ...base,
      timeline_events: replayTimeline.timeline_events,
    }),
  };
}

export function buildReplayIntelligenceReplayReconstructionResponse(
  replaybackState: ReplayIntelligenceReplaybackState,
): ReplayIntelligenceReplayReconstructionResponse {
  return {
    ...buildReplaybackApiBase(replaybackState, replaybackState.checkpoint_hash),
    restored: replaybackState.restored,
    replayback_ready: replaybackState.replayback_ready,
    reconstruction_hash: buildReplayReconstructionHash(replaybackState),
  };
}

export function validateReplayIntelligenceReplaybackApiResponse(
  response: ReplayIntelligenceReplaybackApiResponse,
): readonly string[] {
  const errors: string[] = [];

  if (!response.reducer_id) errors.push("reducer_id is required");
  if (!response.snapshot_id) errors.push("snapshot_id is required");
  if (!response.orchestration_hash) errors.push("orchestration_hash is required");
  if (!response.recovery_hash) errors.push("recovery_hash is required");
  if (!response.restoration_id) errors.push("restoration_id is required");
  if (!response.replay_timeline_hash) errors.push("replay_timeline_hash is required");
  if (!response.replayback_hash) errors.push("replayback_hash is required");
  if (!response.checkpoint_hash) errors.push("checkpoint_hash is required");
  if (!response.generated_at) errors.push("generated_at is required");
  if (!response.replayed_at) errors.push("replayed_at is required");
  if (!response.reconstruction_hash) errors.push("reconstruction_hash is required");
  if (!response.restored) errors.push("response is not restored");
  if (!response.replayback_ready) errors.push("response is not replayback ready");

  return errors.sort((left, right) => left.localeCompare(right));
}

function buildReplaybackApiBase(
  replaybackState: ReplayIntelligenceReplaybackState,
  checkpointHash: string,
) {
  return {
    reducer_id: replaybackState.reducer_id,
    snapshot_id: replaybackState.snapshot_id,
    orchestration_hash: replaybackState.orchestration_hash,
    recovery_hash: replaybackState.recovery_hash,
    restoration_id: replaybackState.restoration_id,
    replay_timeline_hash: replaybackState.replay_timeline_hash,
    replayback_hash: replaybackState.replayback_hash,
    checkpoint_hash: checkpointHash,
    generated_at: replaybackState.reduced_at,
    replayed_at: replaybackState.replayed_at,
    convergence_score: replaybackState.convergence_score,
    lineage_node_count: replaybackState.lineage_node_count,
    anomaly_cluster_count: replaybackState.anomaly_cluster_count,
    forecast_count: replaybackState.forecast_count,
    heatmap_cell_count: replaybackState.heatmap_cell_count,
  };
}

function buildReplayReconstructionHash(
  replaybackState: ReplayIntelligenceReplaybackState,
): string {
  return computeReplaybackApiHash({
    kind: "replay_intelligence_reconstruction",
    reducer_id: replaybackState.reducer_id,
    snapshot_id: replaybackState.snapshot_id,
    orchestration_hash: replaybackState.orchestration_hash,
    recovery_hash: replaybackState.recovery_hash,
    restoration_id: replaybackState.restoration_id,
    replay_timeline_hash: replaybackState.replay_timeline_hash,
    replayback_hash: replaybackState.replayback_hash,
    replayed_at: replaybackState.replayed_at,
    convergence_score: replaybackState.convergence_score,
    lineage_node_count: replaybackState.lineage_node_count,
    anomaly_cluster_count: replaybackState.anomaly_cluster_count,
    forecast_count: replaybackState.forecast_count,
    heatmap_cell_count: replaybackState.heatmap_cell_count,
  });
}

function computeReplaybackApiHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableReplaybackApiStringify(value))
    .digest("hex");
}

function stableReplaybackApiStringify(value: unknown): string {
  return JSON.stringify(sortReplaybackApiKeys(value));
}

function sortReplaybackApiKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortReplaybackApiKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortReplaybackApiKeys((value as Record<string, unknown>)[key]);
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

export type ReplayIntelligenceReplaybackApiSource =
  | ReplayIntelligenceReducerState
  | ReplayIntelligenceReplaybackState;
