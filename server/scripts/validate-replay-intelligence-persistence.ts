import {
  buildDeterministicReplayIntelligenceOrchestrationScaffold,
  buildReplayIntelligenceOrchestrationSnapshot,
} from "../pipeline/replay-intelligence-orchestration";
import {
  buildReplayIntelligenceConvergenceHistoryRecord,
  buildReplayIntelligencePersistentSnapshot,
  buildReplayIntelligenceRecoveryMetadata,
} from "../pipeline/replay-intelligence-persistence";

const GENERATED_AT = "2026-01-01T00:00:00.000Z";
const PERSISTED_AT = "2026-01-03T00:00:00.000Z";

const scaffold =
  buildDeterministicReplayIntelligenceOrchestrationScaffold(GENERATED_AT);
const snapshot =
  buildReplayIntelligenceOrchestrationSnapshot({
    generated_at: scaffold.generated_at,
    lineage_nodes: scaffold.lineage_nodes,
    anomaly_clusters: scaffold.anomaly_clusters,
    forecasts: scaffold.forecasts,
    heatmap: scaffold.heatmap,
    orchestration_hash: scaffold.orchestration_hash,
  });

const persistentSnapshot =
  buildReplayIntelligencePersistentSnapshot(snapshot, PERSISTED_AT);
const persistentSnapshotAgain =
  buildReplayIntelligencePersistentSnapshot(snapshot, PERSISTED_AT);
const convergenceHistory =
  buildReplayIntelligenceConvergenceHistoryRecord(snapshot, PERSISTED_AT);
const recoveryMetadata =
  buildReplayIntelligenceRecoveryMetadata(snapshot, PERSISTED_AT);

assertTruthy(persistentSnapshot.snapshot_id, "snapshot_id is required");
assertEqual(
  persistentSnapshot.snapshot_id,
  persistentSnapshotAgain.snapshot_id,
  "snapshot_id is not stable",
);
assertEqual(
  persistentSnapshot.orchestration_hash,
  snapshot.orchestration_hash,
  "persistent orchestration_hash mismatch",
);
assertEqual(
  persistentSnapshot.convergence_score,
  snapshot.convergence_score,
  "persistent convergence_score mismatch",
);
assertEqual(
  persistentSnapshot.lineage_node_count,
  snapshot.lineage_nodes.length,
  "lineage_node_count mismatch",
);
assertEqual(
  persistentSnapshot.anomaly_cluster_count,
  snapshot.anomaly_clusters.length,
  "anomaly_cluster_count mismatch",
);
assertEqual(
  persistentSnapshot.forecast_count,
  snapshot.forecasts.length,
  "forecast_count mismatch",
);
assertEqual(
  persistentSnapshot.heatmap_cell_count,
  snapshot.heatmap.length,
  "heatmap_cell_count mismatch",
);
assertEqual(
  recoveryMetadata.snapshot_id,
  persistentSnapshot.snapshot_id,
  "recovery snapshot_id mismatch",
);
assertEqual(
  recoveryMetadata.orchestration_hash,
  snapshot.orchestration_hash,
  "recovery orchestration_hash mismatch",
);
assertEqual(
  convergenceHistory.convergence_score,
  snapshot.convergence_score,
  "convergence history score mismatch",
);

console.log("Replay intelligence persistence validation passed.");
console.log(JSON.stringify({
  snapshot_id: persistentSnapshot.snapshot_id,
  orchestration_hash: persistentSnapshot.orchestration_hash,
  generated_at: persistentSnapshot.generated_at,
  persisted_at: persistentSnapshot.persisted_at,
  convergence_score: persistentSnapshot.convergence_score,
  lineage_node_count: persistentSnapshot.lineage_node_count,
  anomaly_cluster_count: persistentSnapshot.anomaly_cluster_count,
  forecast_count: persistentSnapshot.forecast_count,
  heatmap_cell_count: persistentSnapshot.heatmap_cell_count,
  recovery_hash: recoveryMetadata.recovery_hash,
}, null, 2));

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function assertTruthy(value: string, message: string): void {
  if (!value) {
    throw new Error(message);
  }
}
