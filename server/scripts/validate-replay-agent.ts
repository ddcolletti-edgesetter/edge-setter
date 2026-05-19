import Database from "better-sqlite3";

import {
  buildReplayAgentSnapshot,
  computeReplayAgentDeterministicHash,
  getActiveReplayAgents,
  getReplayAgentCapabilityGraph,
  getReplayAgentLineage,
  getReplayAgentTrustProfile,
  getReplayCoordinationHistory,
  getReplayInterAgentActivity,
  initializeReplayAgentSchema,
} from "../pipeline/replay-agent";
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

const GENERATED_AT = "2026-05-19T19:00:00.000Z";
const PERSISTED_AT = "2026-05-19T19:05:00.000Z";
const GOVERNED_AT = "2026-05-19T19:10:00.000Z";
const AGENT_AT = "2026-05-19T19:15:00.000Z";

const run = buildReplayAutonomousOrchestrationRun({
  clock: {
    generated_at: GENERATED_AT,
  },
  consensus_threshold: 0.8,
  max_recovery_attempts: 2,
  targets: [
    target("agent-approve", 40),
    target("agent-reject", 35),
    target("agent-quarantine", 30),
    target("agent-recovery", 25),
    target("agent-arbitration", 20),
  ],
});

const approveConsensus = buildReplayConsensusResult(consensusFixture("agent-approve", "agent-root", [
  validator("agent-approve-a", "snapshot_validator", 1, 96, "approve", [], "agent-approve", "agent-root"),
  validator("agent-approve-b", "integrity_validator", 1, 94, "approve", [], "agent-approve", "agent-root"),
]));
const rejectConsensus = buildReplayConsensusResult(consensusFixture("agent-reject", "agent-approve", [
  validator("agent-reject-a", "integrity_validator", 2, 96, "diverge", ["integrity"], "agent-reject", "agent-approve"),
  validator("agent-reject-b", "timeline_validator", 1, 88, "approve", [], "agent-reject", "agent-approve"),
]));
const quarantineConsensus = buildReplayConsensusResult(consensusFixture("agent-quarantine", "agent-approve", [
  validator("agent-quarantine-a", "snapshot_validator", 2, 91, "diverge", ["snapshot"], "agent-quarantine", "agent-approve"),
  validator("agent-quarantine-b", "provenance_validator", 1, 86, "approve", [], "agent-quarantine", "agent-approve"),
]));
const recoveryConsensus = buildReplayConsensusResult(consensusFixture("agent-recovery", "agent-approve", [
  validator("agent-recovery-a", "snapshot_validator", 2, 91, "diverge", ["snapshot"], "agent-recovery", "agent-approve"),
  validator("agent-recovery-b", "provenance_validator", 1, 86, "approve", [], "agent-recovery", "agent-approve"),
]));
const arbitrationConsensus = buildReplayConsensusResult(consensusFixture("agent-arbitration", "agent-approve", [
  validator("agent-arbitration-a", "integrity_validator", 1, 92, "approve", [], "agent-arbitration", "agent-approve"),
  validator("agent-arbitration-b", "timeline_validator", 1, 92, "diverge", ["timeline"], "agent-arbitration", "agent-approve"),
]));

const approveArbitration = buildReplayArbitrationResult({ generated_at: GENERATED_AT, consensus: approveConsensus });
const rejectArbitration = buildReplayArbitrationResult({ generated_at: GENERATED_AT, consensus: rejectConsensus });
const quarantineArbitration = buildReplayArbitrationResult({ generated_at: GENERATED_AT, consensus: quarantineConsensus });
const recoveryArbitration = buildReplayArbitrationResult({ generated_at: GENERATED_AT, consensus: recoveryConsensus });
const arbitrationArbitration = buildReplayArbitrationResult({ generated_at: GENERATED_AT, consensus: arbitrationConsensus });

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
const recoveryRecovery = buildReplayRecoveryCoordinationResult({
  generated_at: GENERATED_AT,
  arbitration: recoveryArbitration,
  max_retry_attempts: 2,
});
const arbitrationRecovery = buildReplayRecoveryCoordinationResult({
  generated_at: GENERATED_AT,
  arbitration: arbitrationArbitration,
  max_retry_attempts: 2,
});

const db = new Database(":memory:");
initializeReplayAgentSchema(db);

try {
  persistReplayOrchestrationLifecycle(db, {
    persisted_at: PERSISTED_AT,
    orchestration_run: run,
    consensus_results: [
      approveConsensus,
      rejectConsensus,
      quarantineConsensus,
      recoveryConsensus,
      arbitrationConsensus,
    ],
    arbitration_results: [
      approveArbitration,
      rejectArbitration,
      quarantineArbitration,
      recoveryArbitration,
      arbitrationArbitration,
    ],
    recovery_results: [
      approveRecovery,
      rejectRecovery,
      recoveryRecovery,
      arbitrationRecovery,
    ],
  });

  const governance = buildReplayGovernanceSnapshot(db, {
    run_id: run.run_id,
    generated_at: GOVERNED_AT,
    persisted_at: PERSISTED_AT,
    policy: {
      promotion_confidence_threshold: 70,
      quarantine_severity_threshold: 80,
      validator_reduce_weight_threshold: 80,
    },
  });

  const snapshot = buildReplayAgentSnapshot(db, {
    run_id: run.run_id,
    generated_at: AGENT_AT,
    persisted_at: PERSISTED_AT,
    node_id: "validation-node-a",
  });
  const snapshotAgain = buildReplayAgentSnapshot(db, {
    run_id: run.run_id,
    generated_at: AGENT_AT,
    persisted_at: PERSISTED_AT,
    node_id: "validation-node-a",
  });

  assertEqual(snapshot.deterministic_hash, snapshotAgain.deterministic_hash, "agent snapshot hash must be stable");
  assertEqual(snapshot.governance_snapshot_hash, governance.deterministic_hash, "agent snapshot must link governance");
  assertEqual(snapshot.identities.some((identity) => identity.specialization === "validator"), true, "validator agents missing");
  assertEqual(snapshot.identities.some((identity) => identity.specialization === "recovery"), true, "recovery agent missing");
  assertEqual(snapshot.identities.some((identity) => identity.specialization === "arbitration"), true, "arbitration agent missing");
  assertEqual(snapshot.identities.some((identity) => identity.specialization === "orchestration"), true, "orchestration agent missing");
  assertEqual(snapshot.identities.some((identity) => identity.specialization === "governance"), true, "governance agent missing");
  assertEqual(snapshot.capabilities.every((capability) => capability.distributed_node_compatible), true, "distributed node compatibility missing");

  assertLifecycle(snapshot, "initializing", "active");
  assertLifecycleTo(snapshot, "quarantined");
  assertLifecycle(snapshot, "recovering", "recovering");
  assertLifecycle(snapshot, "degraded", "degraded");
  assertEqual(snapshot.trust_profiles.some((profile) => profile.recommended_governance_action === "reduce_validator_weight"), true, "governance-linked trust scoring missing");

  const degradedValidator = assertExists(
    snapshot.trust_profiles.find((profile) => profile.recommended_governance_action === "reduce_validator_weight"),
    "degraded validator profile missing",
  );
  const restoredTrustProfile = assertExists(
    getReplayAgentTrustProfile(db, degradedValidator.agent_id),
    "persisted agent trust profile missing",
  );
  assertEqual(restoredTrustProfile.profile_hash, degradedValidator.profile_hash, "persisted trust profile mismatch");

  const activeAgents = getActiveReplayAgents(db, run.run_id);
  assertEqual(activeAgents.length > 0, true, "active agents should be queryable");
  assertEqual(activeAgents.every((agent) => agent.agent_id.startsWith("replay-agent:")), true, "agent identity format mismatch");

  const recoveryAgent = assertExists(
    snapshot.identities.find((identity) => identity.specialization === "recovery"),
    "recovery agent missing",
  );
  const recoveryLineage = getReplayAgentLineage(db, recoveryAgent.agent_id);
  assertEqual(recoveryLineage.length > 0, true, "recovery agent lineage missing");
  assertEqual(recoveryLineage.some((reference) => reference.reference_kind === "governance"), true, "governance lineage continuity missing");

  const capabilityGraph = assertExists(
    getReplayAgentCapabilityGraph(db, run.run_id),
    "capability graph missing",
  );
  assertEqual(capabilityGraph.graph_hash, snapshot.capability_graph.graph_hash, "capability graph hash mismatch");
  assertEqual(capabilityGraph.nodes.length, snapshot.identities.length, "capability graph node count mismatch");
  assertEqual(capabilityGraph.edges.length, snapshot.messages.length, "capability graph edge count mismatch");

  const quarantineFlow = getReplayCoordinationHistory(db, run.run_id, "agent-quarantine");
  assertEqual(quarantineFlow.length, 1, "quarantine coordination flow missing");
  assertEqual(quarantineFlow[0]?.agent_action, "quarantine_branch", "quarantine coordination action mismatch");
  assertEqual(quarantineFlow[0]?.state, "quarantined", "quarantine coordination state mismatch");

  const recoveryFlow = getReplayCoordinationHistory(db, run.run_id, "agent-recovery");
  assertEqual(recoveryFlow[0]?.agent_action, "coordinate_recovery", "recovery coordination action mismatch");
  assertEqual(recoveryFlow[0]?.state, "recovering", "recovery coordination state mismatch");

  const messages = getReplayInterAgentActivity(db, run.run_id);
  assertEqual(messages.length, snapshot.messages.length, "inter-agent activity reload mismatch");
  assertEqual(messages.every((message) => message.message_hash.length === 64), true, "message hashes missing");

  const recomputed = computeReplayAgentDeterministicHash({
    run_id: snapshot.run_id,
    generated_at: snapshot.generated_at,
    persisted_at: snapshot.persisted_at,
    governance_snapshot_hash: snapshot.governance_snapshot_hash,
    lineage_graph_hash: snapshot.lineage_graph_hash,
    identity_hashes: snapshot.identities.map((identity) => identity.deterministic_hash),
    capability_hashes: snapshot.capabilities.map((capability) => capability.capability_hash),
    trust_profile_hashes: snapshot.trust_profiles.map((profile) => profile.profile_hash),
    lifecycle_hashes: snapshot.lifecycle.map((transition) => transition.transition_hash),
    message_hashes: snapshot.messages.map((message) => message.message_hash),
    lineage_reference_hashes: snapshot.lineage_references.map((reference) => reference.reference_hash),
    capability_graph_hash: snapshot.capability_graph.graph_hash,
    coordination_hashes: snapshot.coordination_history.map((record) => record.coordination_hash),
  });
  assertEqual(recomputed, snapshot.deterministic_hash, "deterministic agent hashing mismatch");

  assertEqual(Object.isFrozen(snapshot), true, "agent snapshot must be immutable");
  assertEqual(Object.isFrozen(snapshot.identities), true, "agent identities must be immutable");
  assertEqual(Object.isFrozen(snapshot.lifecycle), true, "agent lifecycle must be immutable");
  assertEqual(Object.isFrozen(snapshot.messages), true, "inter-agent messages must be immutable");
  assertEqual(Object.isFrozen(snapshot.capability_graph), true, "capability graph must be immutable");

  console.log("Replay agent validation passed.");
  console.log(JSON.stringify({
    snapshot_id: snapshot.snapshot_id,
    deterministic_hash: snapshot.deterministic_hash,
    governance_snapshot_hash: snapshot.governance_snapshot_hash,
    lineage_graph_hash: snapshot.lineage_graph_hash,
    identities: snapshot.identities.map((identity) => ({
      agent_id: identity.agent_id,
      specialization: identity.specialization,
      validator_id: identity.validator_id,
      node_id: identity.node_id,
    })),
    trust_profiles: snapshot.trust_profiles.map((profile) => ({
      agent_id: profile.agent_id,
      state: profile.state,
      trust: profile.agent_trust_score,
      recommended: profile.recommended_governance_action,
    })),
    coordination: snapshot.coordination_history.map((record) => ({
      replay_hash: record.replay_hash,
      governance_action: record.governance_action,
      agent_action: record.agent_action,
      state: record.state,
    })),
    messages: messages.length,
    capability_graph_hash: capabilityGraph.graph_hash,
    immutable_outputs: {
      snapshot: Object.isFrozen(snapshot),
      identities: Object.isFrozen(snapshot.identities),
      lifecycle: Object.isFrozen(snapshot.lifecycle),
      messages: Object.isFrozen(snapshot.messages),
      capability_graph: Object.isFrozen(snapshot.capability_graph),
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

function assertLifecycle(
  snapshot: { readonly lifecycle: readonly { readonly from_state: string; readonly to_state: string }[] },
  fromState: string,
  toState: string,
): void {
  if (!snapshot.lifecycle.some((transition) => transition.from_state === fromState && transition.to_state === toState)) {
    throw new Error(`Missing lifecycle transition ${fromState} -> ${toState}.`);
  }
}

function assertLifecycleTo(
  snapshot: { readonly lifecycle: readonly { readonly to_state: string }[] },
  toState: string,
): void {
  if (!snapshot.lifecycle.some((transition) => transition.to_state === toState)) {
    throw new Error(`Missing lifecycle transition to ${toState}.`);
  }
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
