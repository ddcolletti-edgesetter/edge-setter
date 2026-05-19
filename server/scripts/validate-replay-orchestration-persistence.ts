import Database from "better-sqlite3";

import {
  buildReplayArbitrationResult,
} from "../pipeline/replay-arbitration";
import {
  buildReplayAutonomousOrchestrationRun,
} from "../pipeline/replay-autonomous-orchestration";
import {
  buildReplayConsensusResult,
} from "../pipeline/replay-consensus";
import {
  getLatestArbitrationResult,
  getLatestConsensusResult,
  getRecoveryCheckpoints,
  getRecoveryLineage,
  getReplayBranchHistory,
  getReplayOrchestrationHistory,
  getReplayOrchestrationRun,
  initializeReplayOrchestrationPersistenceSchema,
  persistReplayOrchestrationLifecycle,
} from "../pipeline/replay-orchestration-persistence";
import {
  buildReplayRecoveryCoordinationResult,
} from "../pipeline/replay-recovery-coordination";
import type {
  ReplayConsensusDivergenceCategory,
  ReplayConsensusInput,
  ReplayConsensusVote,
} from "../pipeline/replay-consensus-contract";

const GENERATED_AT = "2026-05-19T16:00:00.000Z";
const PERSISTED_AT = "2026-05-19T16:05:00.000Z";

const run = buildReplayAutonomousOrchestrationRun({
  clock: {
    generated_at: GENERATED_AT,
  },
  consensus_threshold: 0.8,
  max_recovery_attempts: 2,
  targets: [
    {
      replay_hash: "persistence-snapshot",
      priority: 30,
      anomaly_score: 0.72,
      drift_score: 0.61,
      confidence_score: 0.89,
      lineage_depth: 2,
    },
    {
      replay_hash: "persistence-timeline",
      priority: 20,
      anomaly_score: 0.58,
      drift_score: 0.76,
      confidence_score: 0.86,
      lineage_depth: 4,
    },
  ],
});

const snapshotConsensus = buildReplayConsensusResult(consensusFixture("persistence-snapshot", [
  validator("snapshot-a", "snapshot_validator", 2, 91, "diverge", ["snapshot"]),
  validator("snapshot-b", "provenance_validator", 1, 86, "approve", []),
]));
const timelineConsensus = buildReplayConsensusResult(consensusFixture("persistence-timeline", [
  validator("timeline-a", "timeline_validator", 1.5, 89, "diverge", ["timeline"]),
  validator("timeline-b", "settlement_validator", 1, 83, "approve", []),
]));
const snapshotArbitration = buildReplayArbitrationResult({
  generated_at: GENERATED_AT,
  consensus: snapshotConsensus,
});
const timelineArbitration = buildReplayArbitrationResult({
  generated_at: GENERATED_AT,
  consensus: timelineConsensus,
});
const snapshotRecovery = buildReplayRecoveryCoordinationResult({
  generated_at: GENERATED_AT,
  arbitration: snapshotArbitration,
  max_retry_attempts: 2,
});
const timelineRecovery = buildReplayRecoveryCoordinationResult({
  generated_at: GENERATED_AT,
  arbitration: timelineArbitration,
  max_retry_attempts: 2,
});

const db = new Database(":memory:");
initializeReplayOrchestrationPersistenceSchema(db);

try {
  const snapshot = persistReplayOrchestrationLifecycle(db, {
    persisted_at: PERSISTED_AT,
    orchestration_run: run,
    consensus_results: [timelineConsensus, snapshotConsensus],
    arbitration_results: [timelineArbitration, snapshotArbitration],
    recovery_results: [timelineRecovery, snapshotRecovery],
  });
  const snapshotAgain = persistReplayOrchestrationLifecycle(db, {
    persisted_at: PERSISTED_AT,
    orchestration_run: run,
    consensus_results: [snapshotConsensus, timelineConsensus],
    arbitration_results: [snapshotArbitration, timelineArbitration],
    recovery_results: [snapshotRecovery, timelineRecovery],
  });

  assertEqual(snapshot.deterministic_hash, snapshotAgain.deterministic_hash, "persistence snapshot hash must be stable");
  assertEqual(snapshot.records.length, 7, "persistence record count mismatch");
  assertEqual(snapshot.branches.length, 2, "branch state count mismatch");
  assertEqual(snapshot.checkpoints.length, 2, "checkpoint count mismatch");
  assertEqual(snapshot.history.length, 7, "execution history count mismatch");

  const restoredRun = assertExists(
    getReplayOrchestrationRun(db, run.run_id),
    "persisted orchestration run missing",
  );
  assertEqual(restoredRun.deterministic_hash, run.deterministic_hash, "restored orchestration run hash mismatch");
  assertEqual(Object.isFrozen(restoredRun), true, "restored orchestration run must be immutable");

  const latestSnapshotConsensus = assertExists(
    getLatestConsensusResult(db, "persistence-snapshot"),
    "latest snapshot consensus missing",
  );
  assertEqual(latestSnapshotConsensus.consensus_hash, snapshotConsensus.consensus_hash, "latest consensus hash mismatch");
  assertEqual(Object.isFrozen(latestSnapshotConsensus), true, "latest consensus must be immutable");

  const latestTimelineArbitration = assertExists(
    getLatestArbitrationResult(db, "persistence-timeline"),
    "latest timeline arbitration missing",
  );
  assertEqual(latestTimelineArbitration.deterministic_hash, timelineArbitration.deterministic_hash, "latest arbitration hash mismatch");
  assertEqual(Object.isFrozen(latestTimelineArbitration), true, "latest arbitration must be immutable");

  const history = getReplayOrchestrationHistory(db, run.run_id);
  assertEqual(history.length, snapshot.history.length, "orchestration history reload mismatch");
  assertEqual(history[0]?.sequence, 1, "history sequence should begin at one");
  assertEqual(Object.isFrozen(history), true, "history output must be immutable");

  const snapshotLineage = getRecoveryLineage(db, "persistence-snapshot");
  assertEqual(snapshotLineage.length, snapshotRecovery.lineage.length, "snapshot recovery lineage count mismatch");
  assertEqual(
    snapshotLineage.map((lineage) => lineage.recovery_lineage_hash).join(","),
    snapshotRecovery.lineage.map((lineage) => lineage.recovery_lineage_hash).sort((a, b) => a.localeCompare(b)).join(","),
    "lineage continuity hash mismatch",
  );

  const snapshotBranches = getReplayBranchHistory(db, "persistence-snapshot");
  assertEqual(snapshotBranches.length, 1, "snapshot branch history count mismatch");
  assertEqual(snapshotBranches[0]?.recovered_branch_hash, snapshotRecovery.branch_restoration.recovered_branch_hash, "branch restoration hash mismatch");
  assertEqual(snapshotBranches[0]?.promotion_ready, true, "snapshot branch should be promotion ready");

  const timelineCheckpoints = getRecoveryCheckpoints(db, "persistence-timeline");
  assertEqual(timelineCheckpoints.length, 1, "timeline checkpoint count mismatch");
  assertEqual(timelineCheckpoints[0]?.rollback_required, true, "timeline checkpoint should require rollback");
  assertEqual(timelineCheckpoints[0]?.checkpoint_hash, timelineRecovery.checkpoint.checkpoint_hash, "checkpoint restoration hash mismatch");

  assertEqual(Object.isFrozen(snapshot), true, "persistence snapshot must be immutable");
  assertEqual(Object.isFrozen(snapshot.records), true, "persistence records must be immutable");
  assertEqual(Object.isFrozen(snapshot.lineage), true, "persistence lineage must be immutable");
  assertEqual(Object.isFrozen(snapshot.branches), true, "persistence branches must be immutable");
  assertEqual(Object.isFrozen(snapshot.checkpoints), true, "persistence checkpoints must be immutable");

  console.log("Replay orchestration persistence validation passed.");
  console.log(JSON.stringify({
    snapshot_id: snapshot.snapshot_id,
    deterministic_hash: snapshot.deterministic_hash,
    run_id: snapshot.run_id,
    record_count: snapshot.records.length,
    history_count: history.length,
    restored_hashes: {
      run: restoredRun.deterministic_hash,
      consensus: latestSnapshotConsensus.consensus_hash,
      arbitration: latestTimelineArbitration.deterministic_hash,
      snapshot_branch: snapshotBranches[0]?.recovered_branch_hash,
      timeline_checkpoint: timelineCheckpoints[0]?.checkpoint_hash,
    },
    lineage_continuity: snapshotLineage.map((lineage) => ({
      lineage_hash: lineage.lineage_hash,
      recovery_lineage_hash: lineage.recovery_lineage_hash,
      persistence_hash: lineage.persistence_hash,
    })),
    branch_restoration: snapshotBranches,
    checkpoint_restoration: timelineCheckpoints,
    immutable_outputs: {
      snapshot: Object.isFrozen(snapshot),
      records: Object.isFrozen(snapshot.records),
      lineage: Object.isFrozen(snapshot.lineage),
      branches: Object.isFrozen(snapshot.branches),
      checkpoints: Object.isFrozen(snapshot.checkpoints),
      restored_run: Object.isFrozen(restoredRun),
      latest_consensus: Object.isFrozen(latestSnapshotConsensus),
      latest_arbitration: Object.isFrozen(latestTimelineArbitration),
    },
  }, null, 2));
} finally {
  db.close();
}

function consensusFixture(
  replayHash: string,
  validators: ReplayConsensusInput["validators"],
): ReplayConsensusInput {
  return {
    generated_at: GENERATED_AT,
    replay_hash: replayHash,
    compared_replay_hash: `${replayHash}-parent`,
    quorum_threshold: 0.5,
    approval_threshold: 0.5,
    validators,
  };
}

function validator(
  validatorId: string,
  validatorType: string,
  weight: number,
  baseConfidence: number,
  vote: ReplayConsensusVote,
  categories: readonly ReplayConsensusDivergenceCategory[],
): ReplayConsensusInput["validators"][number] {
  const replayHash = validatorId.split("-").slice(0, -1).join("-") || validatorId;

  return {
    validator_id: validatorId,
    validator_type: validatorType,
    weight,
    base_confidence: baseConfidence,
    vote,
    divergence_categories: categories,
    lineage_reference: {
      replay_hash: replayHash,
      parent_replay_hash: `${replayHash}-parent`,
      lineage_hash: `lineage-${validatorId}`,
      generated_at: GENERATED_AT,
    },
  };
}

function assertExists<T>(value: T | null | undefined, message: string): T {
  if (value == null) {
    throw new Error(message);
  }
  return value;
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}
