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
  buildReplayGovernanceSnapshot,
  computeReplayGovernanceDeterministicHash,
  getBranchGovernanceStatus,
  getGovernanceEscalationHistory,
  getGovernanceLineage,
  getGovernanceQuorumHistory,
  getReplayGovernanceHistory,
  getValidatorGovernanceProfile,
  initializeReplayGovernanceSchema,
} from "../pipeline/replay-governance";
import {
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

const GENERATED_AT = "2026-05-19T18:00:00.000Z";
const PERSISTED_AT = "2026-05-19T18:05:00.000Z";
const GOVERNED_AT = "2026-05-19T18:10:00.000Z";

const run = buildReplayAutonomousOrchestrationRun({
  clock: {
    generated_at: GENERATED_AT,
  },
  consensus_threshold: 0.8,
  max_recovery_attempts: 2,
  targets: [
    target("governance-approve", 40),
    target("governance-reject", 35),
    target("governance-quarantine", 30),
    target("governance-recovery-override", 25),
    target("governance-arbitration-override", 20),
  ],
});

const approveConsensus = buildReplayConsensusResult(consensusFixture("governance-approve", "governance-root", [
  validator("approve-a", "snapshot_validator", 1, 96, "approve", [], "governance-approve", "governance-root"),
  validator("approve-b", "integrity_validator", 1, 94, "approve", [], "governance-approve", "governance-root"),
  validator("approve-c", "timeline_validator", 1, 92, "approve", [], "governance-approve", "governance-root"),
]));
const rejectConsensus = buildReplayConsensusResult(consensusFixture("governance-reject", "governance-approve", [
  validator("reject-a", "integrity_validator", 2, 96, "diverge", ["integrity"], "governance-reject", "governance-approve"),
  validator("reject-b", "timeline_validator", 1, 88, "approve", [], "governance-reject", "governance-approve"),
]));
const quarantineConsensus = buildReplayConsensusResult(consensusFixture("governance-quarantine", "governance-approve", [
  validator("quarantine-a", "snapshot_validator", 2, 91, "diverge", ["snapshot"], "governance-quarantine", "governance-approve"),
  validator("quarantine-b", "provenance_validator", 1, 86, "approve", [], "governance-quarantine", "governance-approve"),
]));
const recoveryOverrideConsensus = buildReplayConsensusResult(consensusFixture("governance-recovery-override", "governance-approve", [
  validator("recovery-override-a", "snapshot_validator", 2, 91, "diverge", ["snapshot"], "governance-recovery-override", "governance-approve"),
  validator("recovery-override-b", "provenance_validator", 1, 86, "approve", [], "governance-recovery-override", "governance-approve"),
]));
const arbitrationOverrideConsensus = buildReplayConsensusResult(consensusFixture("governance-arbitration-override", "governance-approve", [
  validator("arbitration-override-a", "integrity_validator", 1, 92, "approve", [], "governance-arbitration-override", "governance-approve"),
  validator("arbitration-override-b", "timeline_validator", 1, 92, "diverge", ["timeline"], "governance-arbitration-override", "governance-approve"),
]));

const approveArbitration = buildReplayArbitrationResult({
  generated_at: GENERATED_AT,
  consensus: approveConsensus,
});
const rejectArbitration = buildReplayArbitrationResult({
  generated_at: GENERATED_AT,
  consensus: rejectConsensus,
});
const quarantineArbitration = buildReplayArbitrationResult({
  generated_at: GENERATED_AT,
  consensus: quarantineConsensus,
});
const recoveryOverrideArbitration = buildReplayArbitrationResult({
  generated_at: GENERATED_AT,
  consensus: recoveryOverrideConsensus,
});
const arbitrationOverrideArbitration = buildReplayArbitrationResult({
  generated_at: GENERATED_AT,
  consensus: arbitrationOverrideConsensus,
});

const approveRecovery = buildReplayRecoveryCoordinationResult({
  generated_at: GENERATED_AT,
  arbitration: approveArbitration,
  max_retry_attempts: 2,
});
const rejectRecovery = buildReplayRecoveryCoordinationResult({
  generated_at: GENERATED_AT,
  arbitration: rejectArbitration,
  max_retry_attempts: 2,
});
const recoveryOverrideRecovery = buildReplayRecoveryCoordinationResult({
  generated_at: GENERATED_AT,
  arbitration: recoveryOverrideArbitration,
  max_retry_attempts: 2,
});
const arbitrationOverrideRecovery = buildReplayRecoveryCoordinationResult({
  generated_at: GENERATED_AT,
  arbitration: arbitrationOverrideArbitration,
  max_retry_attempts: 2,
});

const db = new Database(":memory:");
initializeReplayGovernanceSchema(db);

try {
  persistReplayOrchestrationLifecycle(db, {
    persisted_at: PERSISTED_AT,
    orchestration_run: run,
    consensus_results: [
      quarantineConsensus,
      approveConsensus,
      recoveryOverrideConsensus,
      rejectConsensus,
      arbitrationOverrideConsensus,
    ],
    arbitration_results: [
      quarantineArbitration,
      approveArbitration,
      recoveryOverrideArbitration,
      rejectArbitration,
      arbitrationOverrideArbitration,
    ],
    recovery_results: [
      approveRecovery,
      recoveryOverrideRecovery,
      rejectRecovery,
      arbitrationOverrideRecovery,
    ],
  });

  const snapshot = buildReplayGovernanceSnapshot(db, {
    run_id: run.run_id,
    generated_at: GOVERNED_AT,
    persisted_at: PERSISTED_AT,
    policy: {
      promotion_confidence_threshold: 70,
      quarantine_severity_threshold: 80,
      validator_reduce_weight_threshold: 80,
    },
  });
  const snapshotAgain = buildReplayGovernanceSnapshot(db, {
    run_id: run.run_id,
    generated_at: GOVERNED_AT,
    persisted_at: PERSISTED_AT,
    policy: {
      quarantine_severity_threshold: 80,
      promotion_confidence_threshold: 70,
      validator_reduce_weight_threshold: 80,
    },
  });

  assertEqual(snapshot.deterministic_hash, snapshotAgain.deterministic_hash, "governance hash must be stable");
  assertEqual(snapshot.policy_hash, snapshotAgain.policy_hash, "policy hash must be stable");
  assertEqual(snapshot.decisions.length >= 5, true, "governance decisions should be generated");

  assertDecision(snapshot, "governance-approve", "promote_branch", "stabilized");
  assertDecision(snapshot, "governance-reject", "reject_branch", "rejected");
  assertDecision(snapshot, "governance-quarantine", "quarantine_branch", "quarantined");
  assertDecision(snapshot, "governance-recovery-override", "elevate_recovery", "stabilized");
  assertDecision(snapshot, "governance-arbitration-override", "override_arbitration", "escalated");

  const rejectProfile = assertExists(
    getValidatorGovernanceProfile(db, "reject-a"),
    "validator governance profile missing",
  );
  assertEqual(rejectProfile.recommended_action, "reduce_validator_weight", "validator trust action mismatch");
  assertEqual(rejectProfile.trust_score < 80, true, "validator trust score should be reduced");

  const quarantineEscalations = getGovernanceEscalationHistory(db, "governance-quarantine");
  assertEqual(quarantineEscalations.length > 0, true, "quarantine escalation should be recorded");
  assertEqual(quarantineEscalations[0]?.state, "quarantined", "quarantine escalation state mismatch");

  const recoveryOverrideStatus = assertExists(
    getBranchGovernanceStatus(db, "governance-recovery-override"),
    "recovery override branch status missing",
  );
  assertEqual(recoveryOverrideStatus.current_state, "stabilized", "recovery override branch state mismatch");

  const approveStatus = assertExists(
    getBranchGovernanceStatus(db, "governance-approve"),
    "approved branch status missing",
  );
  assertEqual(approveStatus.latest_action, "promote_branch", "branch promotion action mismatch");
  assertEqual(approveStatus.promotion_eligible, true, "promoted branch should be eligible");

  const history = getReplayGovernanceHistory(db, run.run_id);
  assertEqual(history.length, snapshot.decisions.length, "governance history reload mismatch");

  const lineage = getGovernanceLineage(db, run.run_id);
  assertEqual(lineage.length, snapshot.lineage_references.length, "governance lineage reload mismatch");
  assertEqual(lineage.some((reference) => reference.reference_kind === "graph"), true, "graph lineage reference missing");
  assertEqual(lineage.some((reference) => reference.reference_kind === "recovery"), true, "recovery lineage reference missing");

  const quorumHistory = getGovernanceQuorumHistory(db, run.run_id);
  assertEqual(quorumHistory.length, snapshot.quorum_history.length, "governance quorum reload mismatch");
  assertEqual(quorumHistory.every((quorum) => quorum.quorum_hash.length === 64), true, "quorum hashes missing");

  const recomputed = computeReplayGovernanceDeterministicHash({
    run_id: snapshot.run_id,
    generated_at: snapshot.generated_at,
    persisted_at: snapshot.persisted_at,
    policy_hash: snapshot.policy_hash,
    lineage_graph_hash: snapshot.lineage_graph_hash,
    decision_hashes: snapshot.decisions.map((decision) => decision.deterministic_hash),
    validator_profile_hashes: snapshot.validator_profiles.map((profile) => profile.profile_hash),
    escalation_hashes: snapshot.escalations.map((escalation) => escalation.escalation_hash),
    lineage_reference_hashes: snapshot.lineage_references.map((reference) => reference.reference_hash),
    quorum_hashes: snapshot.quorum_history.map((quorum) => quorum.quorum_hash),
    branch_status_hashes: snapshot.branch_statuses.map((status) => status.status_hash),
  });
  assertEqual(recomputed, snapshot.deterministic_hash, "deterministic governance hashing mismatch");

  assertEqual(Object.isFrozen(snapshot), true, "governance snapshot must be immutable");
  assertEqual(Object.isFrozen(snapshot.decisions), true, "governance decisions must be immutable");
  assertEqual(Object.isFrozen(snapshot.validator_profiles), true, "validator profiles must be immutable");
  assertEqual(Object.isFrozen(snapshot.lineage_references), true, "lineage references must be immutable");
  assertEqual(Object.isFrozen(snapshot.quorum_history), true, "quorum history must be immutable");

  console.log("Replay governance validation passed.");
  console.log(JSON.stringify({
    snapshot_id: snapshot.snapshot_id,
    deterministic_hash: snapshot.deterministic_hash,
    lineage_graph_hash: snapshot.lineage_graph_hash,
    decisions: snapshot.decisions.map((decision) => ({
      replay_hash: decision.replay_hash,
      action: decision.action,
      state: decision.state,
      decision_hash: decision.deterministic_hash,
    })),
    validator_trust: snapshot.validator_profiles.map((profile) => ({
      validator_id: profile.validator_id,
      trust_score: profile.trust_score,
      recommended_action: profile.recommended_action,
    })),
    escalations: snapshot.escalations.map((escalation) => ({
      replay_hash: escalation.replay_hash,
      action: escalation.action,
      state: escalation.state,
      severity_score: escalation.severity_score,
    })),
    lineage_reference_count: lineage.length,
    quorum_history: quorumHistory.map((quorum) => ({
      replay_hash: quorum.replay_hash,
      quorum_met: quorum.quorum_met,
      quorum_hash: quorum.quorum_hash,
    })),
    immutable_outputs: {
      snapshot: Object.isFrozen(snapshot),
      decisions: Object.isFrozen(snapshot.decisions),
      validator_profiles: Object.isFrozen(snapshot.validator_profiles),
      lineage_references: Object.isFrozen(snapshot.lineage_references),
      quorum_history: Object.isFrozen(snapshot.quorum_history),
    },
  }, null, 2));
} finally {
  db.close();
}

function target(replayHash: string, priority: number) {
  return {
    replay_hash: replayHash,
    priority,
    anomaly_score: 0.64,
    drift_score: 0.58,
    confidence_score: 0.91,
    lineage_depth: 2,
  };
}

function consensusFixture(
  replayHash: string,
  parentReplayHash: string | null,
  validators: ReplayConsensusInput["validators"],
): ReplayConsensusInput {
  return {
    generated_at: GENERATED_AT,
    replay_hash: replayHash,
    compared_replay_hash: parentReplayHash,
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
  replayHash: string,
  parentReplayHash: string | null,
): ReplayConsensusInput["validators"][number] {
  return {
    validator_id: validatorId,
    validator_type: validatorType,
    weight,
    base_confidence: baseConfidence,
    vote,
    divergence_categories: categories,
    lineage_reference: {
      replay_hash: replayHash,
      parent_replay_hash: parentReplayHash,
      lineage_hash: `lineage-${validatorId}`,
      generated_at: GENERATED_AT,
    },
  };
}

function assertDecision(
  snapshot: { readonly decisions: readonly { readonly replay_hash: string; readonly action: string; readonly state: string }[] },
  replayHash: string,
  action: string,
  state: string,
): void {
  const decision = snapshot.decisions.find((candidate) => candidate.replay_hash === replayHash);
  if (!decision) {
    throw new Error(`Missing governance decision for ${replayHash}.`);
  }
  assertEqual(decision.action, action, `${replayHash} action mismatch`);
  assertEqual(decision.state, state, `${replayHash} state mismatch`);
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
