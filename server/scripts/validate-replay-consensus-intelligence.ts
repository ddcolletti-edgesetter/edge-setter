import Database from "better-sqlite3";

import { buildReplayAgentSnapshot, initializeReplayAgentSchema } from "../pipeline/replay-agent";
import { buildReplayArbitrationResult } from "../pipeline/replay-arbitration";
import { buildReplayAutonomousOrchestrationRun } from "../pipeline/replay-autonomous-orchestration";
import {
  buildReplayConsensusIntelligenceSnapshot,
  computeReplayConsensusIntelligenceDeterministicHash,
  getConvergenceEvolutionHistory,
  getDistributedIntelligenceEpochs,
  getIntelligenceConvergenceHistory,
  getIntelligenceLineage,
  getIntelligenceQuorumHistory,
  getSurvivabilityForecasts,
  getValidatorIntelligenceProfile,
  serializeReplayConsensusIntelligenceSnapshot,
} from "../pipeline/replay-consensus-intelligence";
import type {
  ReplayConsensusIntelligenceAction,
  ReplayConsensusIntelligenceState,
} from "../pipeline/replay-consensus-intelligence-contract";
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
import { buildReplaySelfHealingSnapshot } from "../pipeline/replay-self-healing";

const GENERATED_AT = "2026-05-19T23:00:00.000Z";
const PERSISTED_AT = "2026-05-19T23:05:00.000Z";
const GOVERNED_AT = "2026-05-19T23:10:00.000Z";
const AGENT_AT = "2026-05-19T23:15:00.000Z";
const MESH_ONE_AT = "2026-05-19T23:20:00.000Z";
const MESH_TWO_AT = "2026-05-19T23:30:00.000Z";
const MEMORY_AT = "2026-05-19T23:40:00.000Z";
const HEALING_AT = "2026-05-19T23:50:00.000Z";
const INTELLIGENCE_AT = "2026-05-20T00:00:00.000Z";

const run = buildReplayAutonomousOrchestrationRun({
  clock: { generated_at: GENERATED_AT },
  consensus_threshold: 0.78,
  max_recovery_attempts: 2,
  targets: [
    target("intelligence-stable", 60, 0.08, 0.05, 0.97, 1),
    target("intelligence-rebalance", 52, 0.38, 0.2, 0.84, 2),
    target("intelligence-divergent", 46, 0.86, 0.62, 0.73, 3),
    target("intelligence-reconcile", 42, 0.7, 0.48, 0.76, 4),
  ],
});

const stableConsensus = buildReplayConsensusResult(consensusFixture("intelligence-stable", "intelligence-root", [
  validator("intelligence-stable-a", "snapshot_validator", 1.4, 97, "approve", [], "intelligence-stable", "intelligence-root"),
  validator("intelligence-stable-b", "integrity_validator", 1.2, 95, "approve", [], "intelligence-stable", "intelligence-root"),
  validator("intelligence-stable-c", "timeline_validator", 1, 94, "approve", [], "intelligence-stable", "intelligence-root"),
]));
const rebalanceConsensus = buildReplayConsensusResult(consensusFixture("intelligence-rebalance", "intelligence-stable", [
  validator("intelligence-rebalance-a", "snapshot_validator", 1.5, 88, "approve", [], "intelligence-rebalance", "intelligence-stable"),
  validator("intelligence-rebalance-b", "integrity_validator", 1, 62, "diverge", ["integrity"], "intelligence-rebalance", "intelligence-stable"),
  validator("intelligence-rebalance-c", "provenance_validator", 0.8, 78, "approve", [], "intelligence-rebalance", "intelligence-stable"),
]));
const divergentConsensus = buildReplayConsensusResult(consensusFixture("intelligence-divergent", "intelligence-stable", [
  validator("intelligence-divergent-a", "timeline_validator", 1.6, 89, "diverge", ["timeline"], "intelligence-divergent", "intelligence-stable"),
  validator("intelligence-divergent-b", "settlement_validator", 1, 66, "diverge", ["settlement"], "intelligence-divergent", "intelligence-stable"),
]));
const reconcileConsensus = buildReplayConsensusResult(consensusFixture("intelligence-reconcile", "intelligence-stable", [
  validator("intelligence-reconcile-a", "integrity_validator", 1.1, 91, "approve", [], "intelligence-reconcile", "intelligence-stable"),
  validator("intelligence-reconcile-b", "timeline_validator", 1.1, 90, "diverge", ["timeline"], "intelligence-reconcile", "intelligence-stable"),
]));

const stableArbitration = buildReplayArbitrationResult({ generated_at: GENERATED_AT, consensus: stableConsensus });
const rebalanceArbitration = buildReplayArbitrationResult({ generated_at: GENERATED_AT, consensus: rebalanceConsensus });
const divergentArbitration = buildReplayArbitrationResult({ generated_at: GENERATED_AT, consensus: divergentConsensus });
const reconcileArbitration = buildReplayArbitrationResult({ generated_at: GENERATED_AT, consensus: reconcileConsensus });

const db = new Database(":memory:");
initializeReplayAgentSchema(db);

try {
  const persistence = persistReplayOrchestrationLifecycle(db, {
    persisted_at: PERSISTED_AT,
    orchestration_run: run,
    consensus_results: [stableConsensus, rebalanceConsensus, divergentConsensus, reconcileConsensus],
    arbitration_results: [stableArbitration, rebalanceArbitration, divergentArbitration, reconcileArbitration],
    recovery_results: [
      buildReplayRecoveryCoordinationResult({ generated_at: GENERATED_AT, arbitration: stableArbitration, max_retry_attempts: 2 }),
      buildReplayRecoveryCoordinationResult({ generated_at: GENERATED_AT, arbitration: rebalanceArbitration, max_retry_attempts: 2 }),
      buildReplayRecoveryCoordinationResult({ generated_at: GENERATED_AT, arbitration: divergentArbitration, max_retry_attempts: 2 }),
      buildReplayRecoveryCoordinationResult({ generated_at: GENERATED_AT, arbitration: reconcileArbitration, max_retry_attempts: 2 }),
    ],
  });
  const governance = buildReplayGovernanceSnapshot(db, {
    run_id: run.run_id,
    generated_at: GOVERNED_AT,
    persisted_at: PERSISTED_AT,
    policy: {
      promotion_confidence_threshold: 68,
      quarantine_severity_threshold: 74,
      validator_reduce_weight_threshold: 82,
    },
  });
  const agentSnapshot = buildReplayAgentSnapshot(db, {
    run_id: run.run_id,
    generated_at: AGENT_AT,
    persisted_at: PERSISTED_AT,
    agents: [
      agent("intelligence-validator-a", "validator", "intelligence-node-a"),
      agent("intelligence-validator-b", "validator", "intelligence-node-b"),
      agent("intelligence-validator-c", "validator", "intelligence-node-c"),
      agent("intelligence-recovery-a", "recovery", "intelligence-node-d"),
      agent("intelligence-governance-a", "governance", "intelligence-node-e"),
      agent("intelligence-orchestration-a", "orchestration", "intelligence-node-a"),
    ],
  });
  const lineage = buildReplayConsensusLineageSnapshot(db, run.run_id);
  const failedAgentId = assertExists(agentSnapshot.identities.find((identity) => identity.specialization === "validator")?.agent_id, "failed validator missing");
  const partitionedAgentId = assertExists(agentSnapshot.identities.find((identity) => identity.specialization === "recovery")?.agent_id, "partitioned recovery missing");
  const federatedNodes = [
    federatedNode("intelligence-node-a", "local", 1.4, "az-a", true),
    federatedNode("intelligence-node-b", "local", 1.1, "az-b", true),
    federatedNode("intelligence-node-c", "remote-a", 1.6, "az-c", true),
    federatedNode("intelligence-node-d", "remote-b", 1.3, "az-d", true),
    federatedNode("intelligence-node-e", "remote-c", 1.2, "az-e", true),
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
    quorum_threshold: 0.15,
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
    quorum_threshold: 0.2,
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
  const intelligence = buildReplayConsensusIntelligenceSnapshot(db, {
    run_id: run.run_id,
    generated_at: INTELLIGENCE_AT,
    persisted_at: PERSISTED_AT,
    self_healing_snapshot: healing,
    coordination_mesh: meshOne,
    governance_snapshot: governance,
    orchestration_persistence: persistence,
    lineage_snapshot: lineage,
    memory_snapshot: memory,
    quorum_threshold: 0.15,
    promotion_threshold: 0.7,
    survivability_floor: 0.58,
  });
  const intelligenceAgain = buildReplayConsensusIntelligenceSnapshot(db, {
    run_id: run.run_id,
    generated_at: INTELLIGENCE_AT,
    persisted_at: PERSISTED_AT,
    self_healing_snapshot: healing,
    coordination_mesh: meshOne,
    governance_snapshot: governance,
    orchestration_persistence: persistence,
    lineage_snapshot: lineage,
    memory_snapshot: memory,
    quorum_threshold: 0.15,
    promotion_threshold: 0.7,
    survivability_floor: 0.58,
  });

  assertEqual(intelligence.deterministic_hash, intelligenceAgain.deterministic_hash, "intelligence hash must be stable");
  assertEqual(intelligence.validator_profiles.length > 0, true, "validator intelligence profiles missing");
  assertEqual(intelligence.synthesis.length > 0, true, "multi-agent intelligence synthesis missing");
  assertEqual(intelligence.validator_profiles.some((profile) => profile.recommended_action === "rebalance_validator_weight"), true, "adaptive weighting rebalance missing");
  assertEqual(intelligence.validator_profiles.every((profile) => profile.evolution_score >= 0 && profile.evolution_score <= 1), true, "validator evolution score out of range");
  assertEqual(intelligence.synthesis.every((item) => item.convergence_score >= 0 && item.convergence_score <= 1), true, "convergence score out of range");
  assertEqual(intelligence.survivability_forecasts.every((forecast) => forecast.survivability_score >= 0 && forecast.survivability_score <= 1), true, "survivability forecast out of range");
  assertEqual(intelligence.propagation.every((record) => record.propagated_hash.length === 64), true, "deterministic propagation missing");
  assertEqual(intelligence.quorum_history.some((record) => record.quorum_met), true, "distributed intelligence quorum missing");
  assertEqual(intelligence.lineage.some((reference) => reference.reference_kind === "self_healing"), true, "self-healing lineage missing");
  assertEqual(intelligence.lineage.some((reference) => reference.reference_kind === "coordination_mesh"), true, "coordination mesh lineage missing");
  assertEqual(intelligence.lineage.some((reference) => reference.reference_kind === "governance"), true, "governance lineage missing");
  assertEqual(intelligence.lineage.some((reference) => reference.reference_kind === "orchestration_persistence"), true, "orchestration persistence lineage missing");
  assertEqual(intelligence.lineage.some((reference) => reference.reference_kind === "memory"), true, "replay memory lineage missing");
  assertEqual(intelligence.snapshots.self_healing_hash, healing.deterministic_hash, "self-healing snapshot reference mismatch");
  assertEqual(intelligence.snapshots.coordination_mesh_hash, meshOne.deterministic_hash, "coordination mesh snapshot reference mismatch");
  assertEqual(intelligence.snapshots.governance_snapshot_hash, governance.deterministic_hash, "governance snapshot reference mismatch");
  assertEqual(intelligence.snapshots.orchestration_persistence_hash, persistence.deterministic_hash, "orchestration persistence snapshot reference mismatch");
  assertEqual(intelligence.snapshots.memory_snapshot_hash, memory.deterministic_hash, "memory snapshot reference mismatch");
  assertEqual(serializeReplayConsensusIntelligenceSnapshot(intelligence), serializeReplayConsensusIntelligenceSnapshot(intelligenceAgain), "replay-safe intelligence serialization mismatch");
  assertEqual(computeReplayConsensusIntelligenceDeterministicHash({ intelligence: intelligence.intelligence_id }).length, 64, "intelligence hash helper mismatch");
  assertEqual(Object.isFrozen(intelligence), true, "intelligence snapshot must be immutable");
  assertEqual(Object.isFrozen(intelligence.synthesis), true, "intelligence synthesis must be immutable");
  assertEqual(Object.isFrozen(intelligence.epochs), true, "intelligence epochs must be immutable");
  assertEqual(intelligence.epochs.every((epoch) => epoch.frozen), true, "intelligence epoch freeze behavior missing");
  assertEqual(intelligence.epochs.some((epoch) => epoch.promoted || epoch.promoted_at === null), true, "intelligence epoch promotion behavior missing");

  assertEqual(getIntelligenceConvergenceHistory(db, run.run_id).length, intelligence.convergence_history.length, "convergence query mismatch");
  assertEqual(getConvergenceEvolutionHistory(db, run.run_id).length, intelligence.convergence_evolution.length, "convergence evolution query mismatch");
  assertEqual(getSurvivabilityForecasts(db, run.run_id).length, intelligence.survivability_forecasts.length, "forecast query mismatch");
  assertEqual(getIntelligenceLineage(db, run.run_id).length, intelligence.lineage.length, "lineage query mismatch");
  assertEqual(getIntelligenceQuorumHistory(db, run.run_id).length, intelligence.quorum_history.length, "quorum query mismatch");
  assertEqual(getDistributedIntelligenceEpochs(db, run.run_id).length, intelligence.epochs.length, "epoch query mismatch");
  const validatorProfile = getValidatorIntelligenceProfile(db, intelligence.validator_profiles[0]?.validator_id ?? "");
  assertEqual(Boolean(validatorProfile), true, "validator profile query mismatch");

  assertActionSupported("synthesize_consensus");
  assertActionSupported("rebalance_validator_weight");
  assertActionSupported("propagate_intelligence");
  assertActionSupported("reconcile_divergence");
  assertActionSupported("promote_intelligence_epoch");
  assertActionSupported("quarantine_intelligence_branch");
  assertActionSupported("forecast_survivability");
  assertActionSupported("freeze_intelligence_epoch");
  assertStateSupported("synthesizing");
  assertStateSupported("converging");
  assertStateSupported("stabilized");
  assertStateSupported("divergent");
  assertStateSupported("degraded");
  assertStateSupported("reconciled");

  console.log("Replay consensus intelligence validation passed.");
  console.log(JSON.stringify({
    intelligence_id: intelligence.intelligence_id,
    deterministic_hash: intelligence.deterministic_hash,
    state: intelligence.state,
    validator_profiles: intelligence.validator_profiles.length,
    synthesis: intelligence.synthesis.length,
    convergence_history: intelligence.convergence_history.length,
    quorum_history: intelligence.quorum_history.length,
    survivability_forecasts: intelligence.survivability_forecasts.length,
    propagation: intelligence.propagation.length,
    lineage_references: intelligence.lineage.length,
    epochs: intelligence.epochs.length,
    promoted_epochs: intelligence.epochs.filter((epoch) => epoch.promoted).length,
    immutable_outputs: {
      result: Object.isFrozen(intelligence),
      synthesis: Object.isFrozen(intelligence.synthesis),
      epochs: Object.isFrozen(intelligence.epochs),
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

function agent(seed: string, specialization: ReplayIntelligenceAgentSpecialization, nodeId: string) {
  return {
    agent_seed: seed,
    specialization,
    declared_actions: specialization === "validator"
      ? ["validate_replay", "reconcile_divergence"] as const
      : specialization === "recovery"
        ? ["coordinate_recovery", "reconstruct_branch", "promote_branch", "quarantine_branch"] as const
        : specialization === "governance"
          ? ["evaluate_governance", "promote_branch", "quarantine_branch"] as const
          : ["validate_replay", "evaluate_governance", "promote_branch", "quarantine_branch"] as const,
    replay_scopes: ["intelligence-stable", "intelligence-rebalance", "intelligence-divergent", "intelligence-reconcile"],
    node_id: nodeId,
  };
}

function federatedNode(nodeId: string, federationGroup: string, capacityWeight: number, failureDomain: string, acceptsRemoteRelay: boolean) {
  return { node_id: nodeId, federation_group: federationGroup, capacity_weight: capacityWeight, failure_domain: failureDomain, accepts_remote_relay: acceptsRemoteRelay };
}

function assertActionSupported(_action: ReplayConsensusIntelligenceAction): void { return; }
function assertStateSupported(_state: ReplayConsensusIntelligenceState): void { return; }

function assertExists<T>(value: T | null | undefined, message: string): T {
  if (value === null || typeof value === "undefined") throw new Error(message);
  return value;
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
}

type ReplayIntelligenceAgentSpecialization =
  | "validator"
  | "recovery"
  | "orchestration"
  | "governance";
