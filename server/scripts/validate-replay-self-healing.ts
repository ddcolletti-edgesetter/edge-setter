import Database from "better-sqlite3";

import { buildReplayAgentSnapshot, initializeReplayAgentSchema } from "../pipeline/replay-agent";
import { buildReplayArbitrationResult } from "../pipeline/replay-arbitration";
import { buildReplayAutonomousOrchestrationRun } from "../pipeline/replay-autonomous-orchestration";
import { buildReplayConsensusResult } from "../pipeline/replay-consensus";
import { buildReplayConsensusLineageSnapshot } from "../pipeline/replay-consensus-lineage";
import { buildReplayCoordinationMesh } from "../pipeline/replay-coordination-mesh";
import type {
  ReplayConsensusDivergenceCategory,
  ReplayConsensusInput,
  ReplayConsensusVote,
} from "../pipeline/replay-consensus-contract";
import { buildReplayGovernanceSnapshot } from "../pipeline/replay-governance";
import { buildReplayMemorySnapshot } from "../pipeline/replay-memory";
import { persistReplayOrchestrationLifecycle } from "../pipeline/replay-orchestration-persistence";
import { buildReplayRecoveryCoordinationResult } from "../pipeline/replay-recovery-coordination";
import {
  buildReplaySelfHealingSnapshot,
  computeReplaySelfHealingDeterministicHash,
  getAdaptiveRecoveryHistory,
  getHealingHistory,
  getHealingLineage,
  getPartitionStabilizationHistory,
  getReplayDegradationHistory,
  getStabilizationHistory,
  getSurvivabilityTrends,
  serializeReplaySelfHealingSnapshot,
} from "../pipeline/replay-self-healing";
import type {
  ReplaySelfHealingAction,
  ReplaySelfHealingState,
} from "../pipeline/replay-self-healing-contract";

const GENERATED_AT = "2026-05-19T22:00:00.000Z";
const PERSISTED_AT = "2026-05-19T22:05:00.000Z";
const GOVERNED_AT = "2026-05-19T22:10:00.000Z";
const AGENT_AT = "2026-05-19T22:15:00.000Z";
const MESH_ONE_AT = "2026-05-19T22:20:00.000Z";
const MESH_TWO_AT = "2026-05-19T22:30:00.000Z";
const MEMORY_AT = "2026-05-19T22:40:00.000Z";
const HEALING_AT = "2026-05-19T22:50:00.000Z";

const run = buildReplayAutonomousOrchestrationRun({
  clock: { generated_at: GENERATED_AT },
  consensus_threshold: 0.78,
  max_recovery_attempts: 2,
  targets: [
    target("healing-approve", 50, 0.12, 0.1, 0.95, 1),
    target("healing-quarantine", 45, 0.82, 0.58, 0.75, 2),
    target("healing-recovery", 40, 0.72, 0.74, 0.82, 4),
    target("healing-arbitration", 35, 0.66, 0.52, 0.7, 3),
  ],
});

const approveConsensus = buildReplayConsensusResult(consensusFixture("healing-approve", "healing-root", [
  validator("healing-approve-a", "snapshot_validator", 1, 96, "approve", [], "healing-approve", "healing-root"),
  validator("healing-approve-b", "integrity_validator", 1, 94, "approve", [], "healing-approve", "healing-root"),
  validator("healing-approve-c", "timeline_validator", 1, 92, "approve", [], "healing-approve", "healing-root"),
]));
const quarantineConsensus = buildReplayConsensusResult(consensusFixture("healing-quarantine", "healing-approve", [
  validator("healing-quarantine-a", "snapshot_validator", 2, 91, "diverge", ["snapshot"], "healing-quarantine", "healing-approve"),
  validator("healing-quarantine-b", "provenance_validator", 1, 86, "approve", [], "healing-quarantine", "healing-approve"),
]));
const recoveryConsensus = buildReplayConsensusResult(consensusFixture("healing-recovery", "healing-approve", [
  validator("healing-recovery-a", "timeline_validator", 1.5, 89, "diverge", ["timeline"], "healing-recovery", "healing-approve"),
  validator("healing-recovery-b", "settlement_validator", 1, 83, "approve", [], "healing-recovery", "healing-approve"),
]));
const arbitrationConsensus = buildReplayConsensusResult(consensusFixture("healing-arbitration", "healing-approve", [
  validator("healing-arbitration-a", "integrity_validator", 1, 92, "approve", [], "healing-arbitration", "healing-approve"),
  validator("healing-arbitration-b", "timeline_validator", 1, 92, "diverge", ["timeline"], "healing-arbitration", "healing-approve"),
]));

const approveArbitration = buildReplayArbitrationResult({ generated_at: GENERATED_AT, consensus: approveConsensus });
const quarantineArbitration = buildReplayArbitrationResult({ generated_at: GENERATED_AT, consensus: quarantineConsensus });
const recoveryArbitration = buildReplayArbitrationResult({ generated_at: GENERATED_AT, consensus: recoveryConsensus });
const arbitrationArbitration = buildReplayArbitrationResult({ generated_at: GENERATED_AT, consensus: arbitrationConsensus });

const db = new Database(":memory:");
initializeReplayAgentSchema(db);

try {
  const persistence = persistReplayOrchestrationLifecycle(db, {
    persisted_at: PERSISTED_AT,
    orchestration_run: run,
    consensus_results: [approveConsensus, quarantineConsensus, recoveryConsensus, arbitrationConsensus],
    arbitration_results: [approveArbitration, quarantineArbitration, recoveryArbitration, arbitrationArbitration],
    recovery_results: [
      buildReplayRecoveryCoordinationResult({ generated_at: GENERATED_AT, arbitration: approveArbitration, max_retry_attempts: 2 }),
      buildReplayRecoveryCoordinationResult({ generated_at: GENERATED_AT, arbitration: quarantineArbitration, max_retry_attempts: 2 }),
      buildReplayRecoveryCoordinationResult({ generated_at: GENERATED_AT, arbitration: recoveryArbitration, max_retry_attempts: 2 }),
      buildReplayRecoveryCoordinationResult({ generated_at: GENERATED_AT, arbitration: arbitrationArbitration, max_retry_attempts: 2 }),
    ],
  });
  const governance = buildReplayGovernanceSnapshot(db, {
    run_id: run.run_id,
    generated_at: GOVERNED_AT,
    persisted_at: PERSISTED_AT,
    policy: {
      promotion_confidence_threshold: 70,
      quarantine_severity_threshold: 78,
      validator_reduce_weight_threshold: 80,
    },
  });
  const agentSnapshot = buildReplayAgentSnapshot(db, {
    run_id: run.run_id,
    generated_at: AGENT_AT,
    persisted_at: PERSISTED_AT,
    agents: [
      agent("healing-validator-a", "validator", "healing-node-a"),
      agent("healing-validator-b", "validator", "healing-node-b"),
      agent("healing-recovery-a", "recovery", "healing-node-c"),
      agent("healing-arbitration-a", "arbitration", "healing-node-b"),
      agent("healing-governance-a", "governance", "healing-node-d"),
      agent("healing-orchestration-a", "orchestration", "healing-node-a"),
    ],
  });
  const lineage = buildReplayConsensusLineageSnapshot(db, run.run_id);
  const failedAgentId = assertExists(agentSnapshot.identities.find((identity) => identity.specialization === "validator")?.agent_id, "failed validator missing");
  const partitionedAgentId = assertExists(agentSnapshot.identities.find((identity) => identity.specialization === "recovery")?.agent_id, "partitioned recovery missing");
  const federatedNodes = [
    federatedNode("healing-node-a", "local", 1.4, "az-a", true),
    federatedNode("healing-node-b", "local", 1.2, "az-b", true),
    federatedNode("healing-node-c", "remote-a", 1.5, "az-c", true),
    federatedNode("healing-node-d", "remote-b", 1.1, "az-d", true),
  ];
  const meshOne = buildReplayCoordinationMesh({
    run_id: run.run_id,
    generated_at: MESH_ONE_AT,
    agent_snapshot: agentSnapshot,
    governance_snapshot: governance,
    orchestration_persistence: persistence,
    lineage_snapshot: lineage,
    failed_agent_ids: [failedAgentId],
    partitioned_agent_ids: [partitionedAgentId],
    quorum_threshold: 0.45,
    balancing_tolerance: 10,
    federated_nodes: federatedNodes,
  });
  const meshTwo = buildReplayCoordinationMesh({
    run_id: run.run_id,
    generated_at: MESH_TWO_AT,
    agent_snapshot: agentSnapshot,
    governance_snapshot: governance,
    orchestration_persistence: persistence,
    lineage_snapshot: lineage,
    quorum_threshold: 0.15,
    balancing_tolerance: 10,
    federated_nodes: federatedNodes,
  });
  const memory = buildReplayMemorySnapshot({
    run_id: run.run_id,
    generated_at: MEMORY_AT,
    mesh_snapshots: [meshOne, meshTwo],
    governance_snapshot: governance,
    orchestration_persistence: persistence,
    lineage_snapshot: lineage,
    epoch_size: 4,
  });
  const healing = buildReplaySelfHealingSnapshot({
    run_id: run.run_id,
    generated_at: HEALING_AT,
    memory_snapshot: memory,
    coordination_mesh: meshOne,
    governance_snapshot: governance,
    orchestration_persistence: persistence,
    lineage_snapshot: lineage,
    survivability_threshold: 0.72,
  });
  const healingAgain = buildReplaySelfHealingSnapshot({
    run_id: run.run_id,
    generated_at: HEALING_AT,
    memory_snapshot: memory,
    coordination_mesh: meshOne,
    governance_snapshot: governance,
    orchestration_persistence: persistence,
    lineage_snapshot: lineage,
    survivability_threshold: 0.72,
  });

  assertEqual(healing.deterministic_hash, healingAgain.deterministic_hash, "healing hash must be stable");
  assertEqual(healing.repair_plans.length > 0, true, "predictive repair plans missing");
  assertEqual(healing.repair_plans.some((plan) => plan.recommended_action === "rebuild_partition"), true, "partition repair planning missing");
  assertEqual(healing.decisions.every((decision) => decision.deterministic_hash.length === 64), true, "deterministic healing decisions missing");
  assertEqual(healing.stabilization_history.length, healing.decisions.length, "stabilization history mismatch");
  assertEqual(healing.adaptive_recovery.every((route) => route.adaptive_path.length > 0), true, "adaptive routing paths missing");
  assertEqual(healing.partition_stabilization.some((record) => record.partition_count > 0), true, "partition recovery missing");
  assertEqual(healing.survivability_trends.every((trend) => trend.survivability_score >= 0 && trend.survivability_score <= 1), true, "survivability score out of range");
  assertEqual(healing.degradation_history.some((record) => record.detected), true, "degradation detection missing");
  assertEqual(healing.checkpoint_promotions.some((promotion) => promotion.promoted), true, "checkpoint promotion behavior missing");
  assertEqual(healing.lineage.some((reference) => reference.reference_kind === "memory"), true, "memory lineage continuity missing");
  assertEqual(healing.lineage.some((reference) => reference.reference_kind === "coordination_mesh"), true, "mesh lineage continuity missing");
  assertEqual(healing.snapshots.memory_snapshot_hash, memory.deterministic_hash, "memory snapshot reference mismatch");
  assertEqual(serializeReplaySelfHealingSnapshot(healing), serializeReplaySelfHealingSnapshot(healingAgain), "replay-safe healing serialization mismatch");
  assertEqual(computeReplaySelfHealingDeterministicHash({ healing: healing.healing_id }).length, 64, "healing hash helper mismatch");
  assertEqual(Object.isFrozen(healing), true, "healing snapshot must be immutable");
  assertEqual(Object.isFrozen(healing.decisions), true, "healing decisions must be immutable");
  assertEqual(Object.isFrozen(healing.epochs), true, "healing epochs must be immutable");

  assertEqual(getHealingHistory(healing).length, healing.decisions.length, "healing query mismatch");
  assertEqual(getStabilizationHistory(healing).length, healing.stabilization_history.length, "stabilization query mismatch");
  assertEqual(getSurvivabilityTrends(healing).length, healing.survivability_trends.length, "survivability query mismatch");
  assertEqual(getReplayDegradationHistory(healing).length, healing.degradation_history.length, "degradation query mismatch");
  assertEqual(getAdaptiveRecoveryHistory(healing).length, healing.adaptive_recovery.length, "adaptive query mismatch");
  assertEqual(getHealingLineage(healing).length, healing.lineage.length, "lineage query mismatch");
  assertEqual(getPartitionStabilizationHistory(healing).length, healing.partition_stabilization.length, "partition query mismatch");

  assertActionSupported("stabilize_branch");
  assertActionSupported("reroute_recovery");
  assertActionSupported("reconcile_divergence");
  assertActionSupported("promote_checkpoint");
  assertActionSupported("rebuild_partition");
  assertActionSupported("quarantine_instability");
  assertActionSupported("rebalance_mesh");
  assertActionSupported("freeze_healing_epoch");
  assertStateSupported("monitoring");
  assertStateSupported("stabilizing");
  assertStateSupported("healing");
  assertStateSupported("degraded");
  assertStateSupported("partitioned");
  assertStateSupported("recovered");
  assertStateSupported("reconciled");

  console.log("Replay self-healing validation passed.");
  console.log(JSON.stringify({
    healing_id: healing.healing_id,
    deterministic_hash: healing.deterministic_hash,
    state: healing.state,
    repair_plans: healing.repair_plans.length,
    decisions: healing.decisions.length,
    survivability_trends: healing.survivability_trends.length,
    adaptive_recovery: healing.adaptive_recovery.length,
    partition_stabilization: healing.partition_stabilization.length,
    checkpoint_promotions: healing.checkpoint_promotions.length,
    lineage_references: healing.lineage.length,
    immutable_outputs: {
      result: Object.isFrozen(healing),
      decisions: Object.isFrozen(healing.decisions),
      epochs: Object.isFrozen(healing.epochs),
    },
  }, null, 2));
} finally {
  db.close();
}

function target(replayHash: string, priority: number, anomalyScore: number, driftScore: number, confidenceScore: number, lineageDepth: number) {
  return { replay_hash: replayHash, priority, anomaly_score: anomalyScore, drift_score: driftScore, confidence_score: confidenceScore, lineage_depth: lineageDepth };
}

function consensusFixture(replayHash: string, parentReplayHash: string, validators: ReplayConsensusInput["validators"]): ReplayConsensusInput {
  return { generated_at: GENERATED_AT, replay_hash: replayHash, compared_replay_hash: parentReplayHash, quorum_threshold: 0.5, approval_threshold: 0.5, validators };
}

function validator(
  validatorId: string,
  validatorType: string,
  weight: number,
  baseConfidence: number,
  vote: ReplayConsensusVote,
  categories: readonly ReplayConsensusDivergenceCategory[],
  replayHash: string,
  parentReplayHash: string,
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
      lineage_hash: `lineage:${replayHash}:${validatorId}`,
      generated_at: GENERATED_AT,
    },
  };
}

function agent(seed: string, specialization: ReplayHealingAgentSpecialization, nodeId: string) {
  return {
    agent_seed: seed,
    specialization,
    declared_actions: specialization === "validator"
      ? ["validate_replay", "reconcile_divergence"] as const
      : specialization === "recovery"
        ? ["coordinate_recovery", "reconstruct_branch", "promote_branch", "quarantine_branch"] as const
        : specialization === "arbitration"
          ? ["arbitrate_replay", "reconcile_divergence"] as const
          : specialization === "governance"
            ? ["evaluate_governance", "promote_branch", "quarantine_branch"] as const
            : ["validate_replay", "evaluate_governance", "promote_branch", "quarantine_branch"] as const,
    replay_scopes: ["healing-approve", "healing-quarantine", "healing-recovery", "healing-arbitration"],
    node_id: nodeId,
  };
}

function federatedNode(nodeId: string, federationGroup: string, capacityWeight: number, failureDomain: string, acceptsRemoteRelay: boolean) {
  return { node_id: nodeId, federation_group: federationGroup, capacity_weight: capacityWeight, failure_domain: failureDomain, accepts_remote_relay: acceptsRemoteRelay };
}

function assertActionSupported(_action: ReplaySelfHealingAction): void { return; }
function assertStateSupported(_state: ReplaySelfHealingState): void { return; }

function assertExists<T>(value: T | null | undefined, message: string): T {
  if (value === null || typeof value === "undefined") throw new Error(message);
  return value;
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
}

type ReplayHealingAgentSpecialization =
  | "validator"
  | "recovery"
  | "arbitration"
  | "orchestration"
  | "governance";
