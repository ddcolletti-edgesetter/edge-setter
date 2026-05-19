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
  buildReplayIntelligenceRestorationCheckpoint,
  buildReplayIntelligenceRestorationResult,
  buildReplayIntelligenceRestorationSnapshot,
} from "../pipeline/replay-intelligence-restoration";

const PERSISTED_AT = "2026-01-03T00:00:00.000Z";
const RECOVERED_AT = "2026-01-04T00:00:00.000Z";
const RESTORED_AT = "2026-01-05T00:00:00.000Z";

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
const restorationSnapshotAgain =
  buildReplayIntelligenceRestorationSnapshot(
    orchestrationSnapshot,
    recoverySnapshot,
    rollbackCandidate,
    RESTORED_AT,
  );
const restorationResult =
  buildReplayIntelligenceRestorationResult(restorationSnapshot);
const replayTimeline =
  buildReplayIntelligenceReplayTimeline(restorationSnapshot);
const replayTimelineAgain =
  buildReplayIntelligenceReplayTimeline(restorationSnapshotAgain);
const checkpoint =
  buildReplayIntelligenceRestorationCheckpoint(restorationSnapshot);
const checkpointAgain =
  buildReplayIntelligenceRestorationCheckpoint(restorationSnapshotAgain);

assertEqual(
  restorationSnapshot.restoration_id,
  restorationSnapshotAgain.restoration_id,
  "restoration ID is not stable",
);
assertEqual(
  replayTimeline.replay_timeline_hash,
  replayTimelineAgain.replay_timeline_hash,
  "replay timeline hash is not stable",
);
assertEqual(
  checkpoint.checkpoint_hash,
  checkpointAgain.checkpoint_hash,
  "checkpoint hash is not stable",
);
assertEqual(
  restorationSnapshot.orchestration_hash,
  orchestrationSnapshot.orchestration_hash,
  "orchestration hash mismatch",
);
assertEqual(
  restorationSnapshot.recovery_hash,
  recoverySnapshot.recovery_hash,
  "recovery hash mismatch",
);
assertEqual(
  restorationSnapshot.rollback_candidate_hash,
  rollbackCandidate.rollback_candidate_hash,
  "rollback candidate hash mismatch",
);
assertEqual(
  rollbackCandidate.recovery_hash,
  recoverySnapshot.recovery_hash,
  "rollback candidate recovery linkage mismatch",
);
assertEqual(
  restorationSnapshot.convergence_score,
  orchestrationSnapshot.convergence_score,
  "convergence score mismatch",
);
assertEqual(
  restorationSnapshot.lineage_node_count,
  orchestrationSnapshot.lineage_nodes.length,
  "lineage_node_count mismatch",
);
assertEqual(
  restorationSnapshot.anomaly_cluster_count,
  orchestrationSnapshot.anomaly_clusters.length,
  "anomaly_cluster_count mismatch",
);
assertEqual(
  restorationSnapshot.forecast_count,
  orchestrationSnapshot.forecasts.length,
  "forecast_count mismatch",
);
assertEqual(
  restorationSnapshot.heatmap_cell_count,
  orchestrationSnapshot.heatmap.length,
  "heatmap_cell_count mismatch",
);
assertEqual(
  restorationResult.restored,
  true,
  "restoration result should be restored",
);
assertEqual(
  restorationResult.validation_errors.length,
  0,
  "restoration result should not have validation errors",
);
assertEqual(
  checkpoint.restoration_id,
  restorationSnapshot.restoration_id,
  "checkpoint restoration ID mismatch",
);
assertEqual(
  checkpoint.checkpoint_status,
  "restorable",
  "checkpoint should be restorable",
);

console.log("Replay intelligence restoration validation passed.");
console.log(JSON.stringify({
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
  replay_timeline_hash: replayTimeline.replay_timeline_hash,
  checkpoint_hash: checkpoint.checkpoint_hash,
  restored: restorationResult.restored,
  checkpoint_status: checkpoint.checkpoint_status,
}, null, 2));

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}
