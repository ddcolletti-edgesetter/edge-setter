import {
  buildDeterministicReplayIntelligenceOrchestrationScaffold,
} from "../pipeline/replay-intelligence-orchestration";
import {
  buildReplayIntelligencePersistentSnapshot,
  buildReplayIntelligenceRecoveryMetadata,
} from "../pipeline/replay-intelligence-persistence";
import {
  buildReplayIntelligenceRecoveryResult,
  buildReplayIntelligenceRecoverySnapshot,
  buildReplayIntelligenceRollbackCandidate,
} from "../pipeline/replay-intelligence-recovery";

const PERSISTED_AT = "2026-01-03T00:00:00.000Z";
const RECOVERED_AT = "2026-01-04T00:00:00.000Z";

const snapshot =
  buildDeterministicReplayIntelligenceOrchestrationScaffold();
const persistentSnapshot =
  buildReplayIntelligencePersistentSnapshot(snapshot, PERSISTED_AT);
const recoveryMetadata =
  buildReplayIntelligenceRecoveryMetadata(snapshot, PERSISTED_AT);
const recoverySnapshot =
  buildReplayIntelligenceRecoverySnapshot(
    snapshot,
    persistentSnapshot,
    recoveryMetadata,
    RECOVERED_AT,
  );
const recoverySnapshotAgain =
  buildReplayIntelligenceRecoverySnapshot(
    snapshot,
    persistentSnapshot,
    recoveryMetadata,
    RECOVERED_AT,
  );
const recoveryResult =
  buildReplayIntelligenceRecoveryResult(recoverySnapshot);
const rollbackCandidate =
  buildReplayIntelligenceRollbackCandidate(recoverySnapshot);
const rollbackCandidateAgain =
  buildReplayIntelligenceRollbackCandidate(recoverySnapshotAgain);

assertEqual(
  recoverySnapshot.recovery_hash,
  recoverySnapshotAgain.recovery_hash,
  "recovery hash is not stable",
);
assertEqual(
  rollbackCandidate.rollback_candidate_hash,
  rollbackCandidateAgain.rollback_candidate_hash,
  "rollback hash is not stable",
);
assertEqual(
  recoverySnapshot.snapshot_id,
  persistentSnapshot.snapshot_id,
  "recovery snapshot_id mismatch",
);
assertEqual(
  rollbackCandidate.snapshot_id,
  recoverySnapshot.snapshot_id,
  "rollback snapshot_id mismatch",
);
assertEqual(
  recoverySnapshot.orchestration_hash,
  snapshot.orchestration_hash,
  "recovery orchestration_hash mismatch",
);
assertEqual(
  recoverySnapshot.convergence_score,
  snapshot.convergence_score,
  "recovery convergence_score mismatch",
);
assertEqual(
  recoverySnapshot.lineage_node_count,
  snapshot.lineage_nodes.length,
  "recovery lineage_node_count mismatch",
);
assertEqual(
  recoverySnapshot.anomaly_cluster_count,
  snapshot.anomaly_clusters.length,
  "recovery anomaly_cluster_count mismatch",
);
assertEqual(
  recoverySnapshot.forecast_count,
  snapshot.forecasts.length,
  "recovery forecast_count mismatch",
);
assertEqual(
  recoverySnapshot.heatmap_cell_count,
  snapshot.heatmap.length,
  "recovery heatmap_cell_count mismatch",
);
assertEqual(
  recoveryResult.restored,
  true,
  "recovery result should be restored",
);
assertEqual(
  recoveryResult.validation_errors.length,
  0,
  "recovery result should not have validation errors",
);
assertEqual(
  rollbackCandidate.recovery_hash,
  recoverySnapshot.recovery_hash,
  "rollback recovery_hash mismatch",
);
assertEqual(
  rollbackCandidate.eligible,
  true,
  "rollback candidate should be eligible",
);

console.log("Replay intelligence recovery validation passed.");
console.log(JSON.stringify({
  snapshot_id: recoverySnapshot.snapshot_id,
  orchestration_hash: recoverySnapshot.orchestration_hash,
  generated_at: recoverySnapshot.generated_at,
  persisted_at: recoverySnapshot.persisted_at,
  recovered_at: recoverySnapshot.recovered_at,
  recovery_hash: recoverySnapshot.recovery_hash,
  rollback_candidate_hash: rollbackCandidate.rollback_candidate_hash,
  convergence_score: recoverySnapshot.convergence_score,
  lineage_node_count: recoverySnapshot.lineage_node_count,
  anomaly_cluster_count: recoverySnapshot.anomaly_cluster_count,
  forecast_count: recoverySnapshot.forecast_count,
  heatmap_cell_count: recoverySnapshot.heatmap_cell_count,
  restored: recoveryResult.restored,
  rollback_eligible: rollbackCandidate.eligible,
}, null, 2));

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}
