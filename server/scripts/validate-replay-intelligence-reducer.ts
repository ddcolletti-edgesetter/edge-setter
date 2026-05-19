import {
  buildDeterministicReplayIntelligenceOrchestrationScaffold,
} from "../pipeline/replay-intelligence-orchestration";
import {
  buildReplayIntelligencePersistentSnapshot,
  buildReplayIntelligenceRecoveryMetadata,
} from "../pipeline/replay-intelligence-persistence";
import {
  buildReplayIntelligenceRecoverySnapshot,
  buildReplayIntelligenceRollbackCandidate,
} from "../pipeline/replay-intelligence-recovery";
import {
  buildReplayIntelligenceReplayTimeline,
  buildReplayIntelligenceRestorationSnapshot,
} from "../pipeline/replay-intelligence-restoration";
import {
  buildReplayIntelligenceReducerState,
  buildReplayIntelligenceReplaybackCheckpoint,
  buildReplayIntelligenceReplaybackState,
  buildReplayIntelligenceRestorationReducerResult,
} from "../pipeline/replay-intelligence-reducer";

const PERSISTED_AT = "2026-01-03T00:00:00.000Z";
const RECOVERED_AT = "2026-01-04T00:00:00.000Z";
const RESTORED_AT = "2026-01-05T00:00:00.000Z";
const REPLAYED_AT = "2026-01-06T00:00:00.000Z";

const orchestrationSnapshot =
  buildDeterministicReplayIntelligenceOrchestrationScaffold();
const persistentSnapshot =
  buildReplayIntelligencePersistentSnapshot(orchestrationSnapshot, PERSISTED_AT);
const recoveryMetadata =
  buildReplayIntelligenceRecoveryMetadata(orchestrationSnapshot, PERSISTED_AT);
const recoverySnapshot =
  buildReplayIntelligenceRecoverySnapshot(
    orchestrationSnapshot,
    persistentSnapshot,
    recoveryMetadata,
    RECOVERED_AT,
  );
const rollbackCandidate =
  buildReplayIntelligenceRollbackCandidate(recoverySnapshot);
const restorationSnapshot =
  buildReplayIntelligenceRestorationSnapshot(
    orchestrationSnapshot,
    recoverySnapshot,
    rollbackCandidate,
    RESTORED_AT,
  );
const replayTimeline =
  buildReplayIntelligenceReplayTimeline(restorationSnapshot);
const reducerState =
  buildReplayIntelligenceReducerState(
    orchestrationSnapshot,
    persistentSnapshot,
    recoverySnapshot,
    restorationSnapshot,
  );
const reducerStateAgain =
  buildReplayIntelligenceReducerState(
    orchestrationSnapshot,
    persistentSnapshot,
    recoverySnapshot,
    restorationSnapshot,
  );
const replaybackState =
  buildReplayIntelligenceReplaybackState(
    reducerState,
    replayTimeline,
    REPLAYED_AT,
  );
const replaybackStateAgain =
  buildReplayIntelligenceReplaybackState(
    reducerStateAgain,
    replayTimeline,
    REPLAYED_AT,
  );
const reducerResult =
  buildReplayIntelligenceRestorationReducerResult(replaybackState);
const checkpoint =
  buildReplayIntelligenceReplaybackCheckpoint(replaybackState);
const checkpointAgain =
  buildReplayIntelligenceReplaybackCheckpoint(replaybackStateAgain);

assertEqual(
  reducerState.reducer_id,
  reducerStateAgain.reducer_id,
  "reducer ID is not stable",
);
assertEqual(
  replaybackState.replayback_hash,
  replaybackStateAgain.replayback_hash,
  "replayback hash is not stable",
);
assertEqual(
  checkpoint.checkpoint_hash,
  checkpointAgain.checkpoint_hash,
  "checkpoint hash is not stable",
);
assertEqual(
  reducerState.orchestration_hash,
  orchestrationSnapshot.orchestration_hash,
  "orchestration hash mismatch",
);
assertEqual(
  reducerState.recovery_hash,
  recoverySnapshot.recovery_hash,
  "recovery hash mismatch",
);
assertEqual(
  reducerState.restoration_id,
  restorationSnapshot.restoration_id,
  "restoration linkage mismatch",
);
assertEqual(
  replaybackState.restoration_id,
  restorationSnapshot.restoration_id,
  "replayback restoration linkage mismatch",
);
assertEqual(
  replaybackState.replay_timeline_hash,
  replayTimeline.replay_timeline_hash,
  "replay timeline linkage mismatch",
);
assertEqual(
  replaybackState.convergence_score,
  orchestrationSnapshot.convergence_score,
  "convergence score mismatch",
);
assertEqual(
  replaybackState.lineage_node_count,
  orchestrationSnapshot.lineage_nodes.length,
  "lineage_node_count mismatch",
);
assertEqual(
  replaybackState.anomaly_cluster_count,
  orchestrationSnapshot.anomaly_clusters.length,
  "anomaly_cluster_count mismatch",
);
assertEqual(
  replaybackState.forecast_count,
  orchestrationSnapshot.forecasts.length,
  "forecast_count mismatch",
);
assertEqual(
  replaybackState.heatmap_cell_count,
  orchestrationSnapshot.heatmap.length,
  "heatmap_cell_count mismatch",
);
assertEqual(
  replaybackState.replayback_ready,
  true,
  "replayback should be ready",
);
assertEqual(
  reducerResult.restored,
  true,
  "reducer result should be restored",
);
assertEqual(
  reducerResult.replayback_ready,
  true,
  "reducer result should be replayback ready",
);
assertEqual(
  reducerResult.validation_errors.length,
  0,
  "reducer result should not have validation errors",
);
assertEqual(
  checkpoint.replayback_hash,
  replaybackState.replayback_hash,
  "checkpoint replayback hash mismatch",
);

console.log("Replay intelligence reducer validation passed.");
console.log(JSON.stringify({
  reducer_id: reducerState.reducer_id,
  snapshot_id: reducerState.snapshot_id,
  orchestration_hash: reducerState.orchestration_hash,
  recovery_hash: reducerState.recovery_hash,
  restoration_id: reducerState.restoration_id,
  replay_timeline_hash: replaybackState.replay_timeline_hash,
  replayback_hash: replaybackState.replayback_hash,
  checkpoint_hash: checkpoint.checkpoint_hash,
  reduced_at: reducerState.reduced_at,
  replayed_at: replaybackState.replayed_at,
  convergence_score: replaybackState.convergence_score,
  lineage_node_count: replaybackState.lineage_node_count,
  anomaly_cluster_count: replaybackState.anomaly_cluster_count,
  forecast_count: replaybackState.forecast_count,
  heatmap_cell_count: replaybackState.heatmap_cell_count,
  restored: reducerResult.restored,
  replayback_ready: reducerResult.replayback_ready,
}, null, 2));

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}
