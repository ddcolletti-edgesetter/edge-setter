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
} from "../pipeline/replay-intelligence-reducer";
import {
  buildReplayIntelligenceConvergenceAnalytics,
  buildReplayIntelligenceReconstructionState,
  buildReplayIntelligenceReplayTraversal,
  buildReplayIntelligenceStateDiff,
} from "../pipeline/replay-intelligence-reconstruction";

const PERSISTED_AT = "2026-01-03T00:00:00.000Z";
const RECOVERED_AT = "2026-01-04T00:00:00.000Z";
const RESTORED_AT = "2026-01-05T00:00:00.000Z";
const REPLAYED_AT = "2026-01-06T00:00:00.000Z";
const RECONSTRUCTED_AT = "2026-01-07T00:00:00.000Z";

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
const replaybackState =
  buildReplayIntelligenceReplaybackState(
    reducerState,
    replayTimeline,
    REPLAYED_AT,
  );
const replaybackCheckpoint =
  buildReplayIntelligenceReplaybackCheckpoint(replaybackState);
const reconstructionState =
  buildReplayIntelligenceReconstructionState(
    reducerState,
    replaybackState,
    replayTimeline,
    replaybackCheckpoint,
    RECONSTRUCTED_AT,
  );
const reconstructionStateAgain =
  buildReplayIntelligenceReconstructionState(
    reducerState,
    replaybackState,
    replayTimeline,
    replaybackCheckpoint,
    RECONSTRUCTED_AT,
  );
const traversal =
  buildReplayIntelligenceReplayTraversal(reconstructionState);
const traversalAgain =
  buildReplayIntelligenceReplayTraversal(reconstructionStateAgain);
const diff =
  buildReplayIntelligenceStateDiff(reconstructionState);
const diffAgain =
  buildReplayIntelligenceStateDiff(reconstructionStateAgain);
const analytics =
  buildReplayIntelligenceConvergenceAnalytics(reconstructionState);
const analyticsAgain =
  buildReplayIntelligenceConvergenceAnalytics(reconstructionStateAgain);

assertEqual(
  reconstructionState.reconstruction_id,
  reconstructionStateAgain.reconstruction_id,
  "reconstruction ID is not stable",
);
assertEqual(
  traversal.traversal_hash,
  traversalAgain.traversal_hash,
  "traversal hash is not stable",
);
assertEqual(
  diff.diff_hash,
  diffAgain.diff_hash,
  "diff hash is not stable",
);
assertEqual(
  analytics.analytics_hash,
  analyticsAgain.analytics_hash,
  "analytics hash is not stable",
);
assertEqual(
  reconstructionState.orchestration_hash,
  orchestrationSnapshot.orchestration_hash,
  "orchestration linkage mismatch",
);
assertEqual(
  reconstructionState.recovery_hash,
  recoverySnapshot.recovery_hash,
  "recovery linkage mismatch",
);
assertEqual(
  reconstructionState.restoration_id,
  restorationSnapshot.restoration_id,
  "restoration linkage mismatch",
);
assertEqual(
  reconstructionState.replayback_hash,
  replaybackState.replayback_hash,
  "replayback linkage mismatch",
);
assertEqual(
  reconstructionState.replay_timeline_hash,
  replayTimeline.replay_timeline_hash,
  "replay timeline linkage mismatch",
);
assertEqual(
  reconstructionState.convergence_score,
  orchestrationSnapshot.convergence_score,
  "convergence score mismatch",
);
assertEqual(
  reconstructionState.lineage_node_count,
  orchestrationSnapshot.lineage_nodes.length,
  "lineage_node_count mismatch",
);
assertEqual(
  reconstructionState.anomaly_cluster_count,
  orchestrationSnapshot.anomaly_clusters.length,
  "anomaly_cluster_count mismatch",
);
assertEqual(
  reconstructionState.forecast_count,
  orchestrationSnapshot.forecasts.length,
  "forecast_count mismatch",
);
assertEqual(
  reconstructionState.heatmap_cell_count,
  orchestrationSnapshot.heatmap.length,
  "heatmap_cell_count mismatch",
);
assertEqual(
  reconstructionState.restored,
  true,
  "reconstruction should be restored",
);
assertEqual(
  reconstructionState.replayback_ready,
  true,
  "reconstruction should be replayback ready",
);

console.log("Replay intelligence reconstruction validation passed.");
console.log(JSON.stringify({
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
  traversal_hash: traversal.traversal_hash,
  diff_hash: diff.diff_hash,
  analytics_hash: analytics.analytics_hash,
  reconstructed_at: reconstructionState.reconstructed_at,
  convergence_score: reconstructionState.convergence_score,
  lineage_node_count: reconstructionState.lineage_node_count,
  anomaly_cluster_count: reconstructionState.anomaly_cluster_count,
  forecast_count: reconstructionState.forecast_count,
  heatmap_cell_count: reconstructionState.heatmap_cell_count,
  restored: reconstructionState.restored,
  replayback_ready: reconstructionState.replayback_ready,
  diff_equivalent: diff.equivalent,
  replayback_complete: analytics.replayback_complete,
}, null, 2));

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}
