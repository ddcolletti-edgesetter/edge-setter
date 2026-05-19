import Database from "better-sqlite3";

import { buildReplayAgentSnapshot, initializeReplayAgentSchema } from "../pipeline/replay-agent";
import { buildReplayArbitrationResult } from "../pipeline/replay-arbitration";
import { buildReplayAutonomousOrchestrationRun } from "../pipeline/replay-autonomous-orchestration";
import { buildReplayConsensusResult } from "../pipeline/replay-consensus";
import {
  buildReplayConsensusIntelligenceSnapshot,
} from "../pipeline/replay-consensus-intelligence";
import { buildReplayConsensusLineageSnapshot } from "../pipeline/replay-consensus-lineage";
import { buildReplayCoordinationMesh } from "../pipeline/replay-coordination-mesh";
import type {
  ReplayConsensusDivergenceCategory,
  ReplayConsensusInput,
  ReplayConsensusVote,
} from "../pipeline/replay-consensus-contract";
import {
  buildReplayEvolutionSnapshot,
  computeReplayEvolutionDeterministicHash,
  getAdaptiveConvergenceHistory,
  getAdaptiveGenerationHistory,
  getEvolutionEpochHistory,
  getMutationLineage,
  getReplayEvolutionHistory,
  getSurvivabilityOptimizationHistory,
  getValidatorEvolutionProfiles,
  initializeReplayEvolutionSchema,
  serializeReplayEvolutionSnapshot,
} from "../pipeline/replay-evolution";
import type {
  ReplayEvolutionAction,
  ReplayEvolutionState,
} from "../pipeline/replay-evolution-contract";
import { buildReplayGovernanceSnapshot } from "../pipeline/replay-governance";
import { buildReplayMemorySnapshot } from "../pipeline/replay-memory";
import { persistReplayOrchestrationLifecycle } from "../pipeline/replay-orchestration-persistence";
import { buildReplayRecoveryCoordinationResult } from "../pipeline/replay-recovery-coordination";
import { buildReplaySelfHealingSnapshot } from "../pipeline/replay-self-healing";

const GENERATED_AT = "2026-05-20T01:00:00.000Z";
const PERSISTED_AT = "2026-05-20T01:05:00.000Z";
const GOVERNED_AT = "2026-05-20T01:10:00.000Z";
const AGENT_AT = "2026-05-20T01:15:00.000Z";
const MESH_ONE_AT = "2026-05-20T01:20:00.000Z";
const MESH_TWO_AT = "2026-05-20T01:30:00.000Z";
const MEMORY_AT = "2026-05-20T01:40:00.000Z";
const HEALING_AT = "2026-05-20T01:50:00.000Z";
const INTELLIGENCE_AT = "2026-05-20T02:00:00.000Z";
const EVOLUTION_AT = "2026-05-20T02:10:00.000Z";

const run = buildReplayAutonomousOrchestrationRun({
  clock: { generated_at: GENERATED_AT },
  consensus_threshold: 0.76,
  max_recovery_attempts: 2,
  targets: [
    target("evolution-stable", 62, 0.06, 0.04, 0.97, 1),
    target("evolution-adaptive", 54, 0.34, 0.18, 0.86, 2),
    target("evolution-survivability", 48, 0.74, 0.5, 0.76, 3),
    target("evolution-gated", 44, 0.9, 0.66, 0.68, 4),
  ],
});

const stableConsensus = buildReplayConsensusResult(consensusFixture("evolution-stable", "evolution-root", [
  validator("evolution-stable-a", "snapshot_validator", 1.4, 97, "approve", [], "evolution-stable", "evolution-root"),
  validator("evolution-stable-b", "integrity_validator", 1.2, 95, "approve", [], "evolution-stable", "evolution-root"),
  validator("evolution-stable-c", "timeline_validator", 1, 94, "approve", [], "evolution-stable", "evolution-root"),
]));
const adaptiveConsensus = buildReplayConsensusResult(consensusFixture("evolution-adaptive", "evolution-stable", [
  validator("evolution-adaptive-a", "snapshot_validator", 1.5, 88, "approve", [], "evolution-adaptive", "evolution-stable"),
  validator("evolution-adaptive-b", "integrity_validator", 1, 62, "diverge", ["integrity"], "evolution-adaptive", "evolution-stable"),
  validator("evolution-adaptive-c", "provenance_validator", 0.8, 78, "approve", [], "evolution-adaptive", "evolution-stable"),
]));
const survivabilityConsensus = buildReplayConsensusResult(consensusFixture("evolution-survivability", "evolution-stable", [
  validator("evolution-survivability-a", "timeline_validator", 1.5, 86, "approve", [], "evolution-survivability", "evolution-stable"),
  validator("evolution-survivability-b", "settlement_validator", 1.1, 69, "diverge", ["settlement"], "evolution-survivability", "evolution-stable"),
]));
const gatedConsensus = buildReplayConsensusResult(consensusFixture("evolution-gated", "evolution-stable", [
  validator("evolution-gated-a", "timeline_validator", 1.4, 70, "diverge", ["timeline"], "evolution-gated", "evolution-stable"),
  validator("evolution-gated-b", "settlement_validator", 1, 61, "diverge", ["settlement"], "evolution-gated", "evolution-stable"),
]));

const stableArbitration = buildReplayArbitrationResult({ generated_at: GENERATED_AT, consensus: stableConsensus });
const adaptiveArbitration = buildReplayArbitrationResult({ generated_at: GENERATED_AT, consensus: adaptiveConsensus });
const survivabilityArbitration = buildReplayArbitrationResult({ generated_at: GENERATED_AT, consensus: survivabilityConsensus });
const gatedArbitration = buildReplayArbitrationResult({ generated_at: GENERATED_AT, consensus: gatedConsensus });

const db = new Database(":memory:");
initializeReplayAgentSchema(db);
initializeReplayEvolutionSchema(db);

try {
  const persistence = persistReplayOrchestrationLifecycle(db, {
    persisted_at: PERSISTED_AT,
    orchestration_run: run,
    consensus_results: [stableConsensus, adaptiveConsensus, survivabilityConsensus, gatedConsensus],
    arbitration_results: [stableArbitration, adaptiveArbitration, survivabilityArbitration, gatedArbitration],
    recovery_results: [
      buildReplayRecoveryCoordinationResult({ generated_at: GENERATED_AT, arbitration: stableArbitration, max_retry_attempts: 2 }),
      buildReplayRecoveryCoordinationResult({ generated_at: GENERATED_AT, arbitration: adaptiveArbitration, max_retry_attempts: 2 }),
      buildReplayRecoveryCoordinationResult({ generated_at: GENERATED_AT, arbitration: survivabilityArbitration, max_retry_attempts: 2 }),
      buildReplayRecoveryCoordinationResult({ generated_at: GENERATED_AT, arbitration: gatedArbitration, max_retry_attempts: 2 }),
    ],
  });
  const governance = buildReplayGovernanceSnapshot(db, {
    run_id: run.run_id,
    generated_at: GOVERNED_AT,
    persisted_at: PERSISTED_AT,
    policy: {
      promotion_confidence_threshold: 68,
      quarantine_severity_threshold: 72,
      validator_reduce_weight_threshold: 82,
    },
  });
  const agentSnapshot = buildReplayAgentSnapshot(db, {
    run_id: run.run_id,
    generated_at: AGENT_AT,
    persisted_at: PERSISTED_AT,
    agents: [
      agent("evolution-validator-a", "validator", "evolution-node-a"),
      agent("evolution-validator-b", "validator", "evolution-node-b"),
      agent("evolution-validator-c", "validator", "evolution-node-c"),
      agent("evolution-recovery-a", "recovery", "evolution-node-d"),
      agent("evolution-governance-a", "governance", "evolution-node-e"),
      agent("evolution-orchestration-a", "orchestration", "evolution-node-a"),
    ],
  });
  const lineage = buildReplayConsensusLineageSnapshot(db, run.run_id);
  const failedAgentId = assertExists(agentSnapshot.identities.find((identity) => identity.specialization === "validator")?.agent_id, "failed validator missing");
  const partitionedAgentId = assertExists(agentSnapshot.identities.find((identity) => identity.specialization === "recovery")?.agent_id, "partitioned recovery missing");
  const federatedNodes = [
    federatedNode("evolution-node-a", "local", 1.4, "az-a", true),
    federatedNode("evolution-node-b", "local", 1.1, "az-b", true),
    federatedNode("evolution-node-c", "remote-a", 1.6, "az-c", true),
    federatedNode("evolution-node-d", "remote-b", 1.3, "az-d", true),
    federatedNode("evolution-node-e", "remote-c", 1.2, "az-e", true),
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
    epoch_size: 2,
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
    promotion_threshold: 0.62,
    survivability_floor: 0.58,
  });
  const evolution = buildReplayEvolutionSnapshot(db, {
    run_id: run.run_id,
    generated_at: EVOLUTION_AT,
    persisted_at: PERSISTED_AT,
    consensus_intelligence: intelligence,
    memory_snapshot: memory,
    governance_snapshot: governance,
    orchestration_persistence: persistence,
    lineage_snapshot: lineage,
    self_healing_snapshot: healing,
    generation_size: 2,
    promotion_threshold: 0.62,
    survivability_floor: 0.58,
  });
  const evolutionAgain = buildReplayEvolutionSnapshot(db, {
    run_id: run.run_id,
    generated_at: EVOLUTION_AT,
    persisted_at: PERSISTED_AT,
    consensus_intelligence: intelligence,
    memory_snapshot: memory,
    governance_snapshot: governance,
    orchestration_persistence: persistence,
    lineage_snapshot: lineage,
    self_healing_snapshot: healing,
    generation_size: 2,
    promotion_threshold: 0.62,
    survivability_floor: 0.58,
  });

  assertEqual(evolution.deterministic_hash, evolutionAgain.deterministic_hash, "evolution hash must be stable");
  assertEqual(serializeReplayEvolutionSnapshot(evolution), serializeReplayEvolutionSnapshot(evolutionAgain), "replay-safe evolution serialization mismatch");
  assertEqual(computeReplayEvolutionDeterministicHash({ evolution: evolution.evolution_id }).length, 64, "evolution hash helper mismatch");
  assertEqual(Object.isFrozen(evolution), true, "evolution snapshot must be immutable");
  assertEqual(Object.isFrozen(evolution.adaptive_generations), true, "adaptive generations must be immutable");
  assertEqual(Object.isFrozen(evolution.mutation_lineage), true, "mutation lineage must be immutable");

  assertEqual(evolution.strategy_evolution.length > 0, true, "adaptive strategy evolution missing");
  assertEqual(evolution.adaptive_generations.length >= 2, true, "adaptive generation cycles missing");
  assertEqual(evolution.mutation_lineage.length > 0, true, "intelligence mutation tracking missing");
  assertEqual(evolution.mutation_lineage.some((mutation) => mutation.mutation_action === "mutate_weighting"), true, "weighting mutation tracking missing");
  assertEqual(evolution.survivability_optimization.length, evolution.strategy_evolution.length, "survivability optimization coverage mismatch");
  assertEqual(evolution.survivability_optimization.some((record) => record.optimization_action === "optimize_survivability"), true, "survivability optimization action missing");
  assertEqual(evolution.strategy_evolution.some((record) => record.governance_action !== null), true, "governance-aware evolution gating missing");
  assertEqual(evolution.adaptive_generations.some((generation) => generation.promoted), true, "adaptive generation promotion missing");
  assertEqual(evolution.validator_profiles.every((profile) => profile.base_evolution_score >= 0 && profile.base_evolution_score <= 1), true, "validator evolution scoring out of range");
  assertEqual(evolution.convergence_history.every((record) => record.adapted_convergence_score >= 0 && record.adapted_convergence_score <= 1), true, "adaptive convergence out of range");
  assertEqual(evolution.epochs.every((epoch) => epoch.frozen), true, "evolution epoch freeze behavior missing");
  assertEqual(evolution.epochs.every((epoch) => epoch.frozen_at === PERSISTED_AT), true, "evolution epoch frozen_at mismatch");
  assertEqual(evolution.lineage.some((reference) => reference.reference_kind === "consensus_intelligence"), true, "consensus intelligence lineage missing");
  assertEqual(evolution.lineage.some((reference) => reference.reference_kind === "memory"), true, "replay memory lineage missing");
  assertEqual(evolution.lineage.some((reference) => reference.reference_kind === "governance"), true, "governance lineage missing");
  assertEqual(evolution.lineage.some((reference) => reference.reference_kind === "orchestration_persistence"), true, "orchestration persistence lineage missing");
  assertEqual(evolution.lineage.some((reference) => reference.reference_kind === "lineage_graph"), true, "lineage graph continuity missing");
  assertEqual(evolution.lineage.some((reference) => reference.reference_kind === "self_healing"), true, "self-healing lineage missing");
  assertEqual(evolution.snapshots.consensus_intelligence_hash, intelligence.deterministic_hash, "consensus intelligence snapshot reference mismatch");
  assertEqual(evolution.snapshots.memory_snapshot_hash, memory.deterministic_hash, "memory snapshot reference mismatch");
  assertEqual(evolution.snapshots.governance_snapshot_hash, governance.deterministic_hash, "governance snapshot reference mismatch");
  assertEqual(evolution.snapshots.orchestration_persistence_hash, persistence.deterministic_hash, "orchestration persistence snapshot reference mismatch");
  assertEqual(evolution.snapshots.lineage_graph_hash, lineage.graph_hash, "lineage graph snapshot reference mismatch");
  assertEqual(evolution.snapshots.self_healing_hash, healing.deterministic_hash, "self-healing snapshot reference mismatch");

  assertEqual(getReplayEvolutionHistory(db, run.run_id).length, evolution.strategy_evolution.length, "evolution history query mismatch");
  assertEqual(getAdaptiveGenerationHistory(db, run.run_id).length, evolution.adaptive_generations.length, "generation history query mismatch");
  assertEqual(getMutationLineage(db, run.run_id).length, evolution.mutation_lineage.length, "mutation lineage query mismatch");
  assertEqual(getSurvivabilityOptimizationHistory(db, run.run_id).length, evolution.survivability_optimization.length, "survivability query mismatch");
  assertEqual(getValidatorEvolutionProfiles(db, run.run_id).length, evolution.validator_profiles.length, "validator profile query mismatch");
  assertEqual(getEvolutionEpochHistory(db, run.run_id).length, evolution.epochs.length, "epoch query mismatch");
  assertEqual(getAdaptiveConvergenceHistory(db, run.run_id).length, evolution.convergence_history.length, "adaptive convergence query mismatch");

  assertActionSupported("evolve_strategy");
  assertActionSupported("mutate_weighting");
  assertActionSupported("promote_generation");
  assertActionSupported("deprecate_branch");
  assertActionSupported("reconcile_mutation");
  assertActionSupported("optimize_survivability");
  assertActionSupported("freeze_evolution_epoch");
  assertActionSupported("promote_adaptive_cycle");
  assertStateSupported("adapting");
  assertStateSupported("evolving");
  assertStateSupported("stabilized");
  assertStateSupported("divergent");
  assertStateSupported("deprecated");
  assertStateSupported("promoted");

  console.log("Replay evolution validation passed.");
  console.log(JSON.stringify({
    evolution_id: evolution.evolution_id,
    deterministic_hash: evolution.deterministic_hash,
    state: evolution.state,
    strategy_evolution: evolution.strategy_evolution.length,
    adaptive_generations: evolution.adaptive_generations.length,
    mutations: evolution.mutation_lineage.length,
    survivability_optimizations: evolution.survivability_optimization.length,
    validator_profiles: evolution.validator_profiles.length,
    convergence_records: evolution.convergence_history.length,
    lineage_references: evolution.lineage.length,
    epochs: evolution.epochs.length,
    promoted_generations: evolution.adaptive_generations.filter((generation) => generation.promoted).length,
    immutable_outputs: {
      snapshot: Object.isFrozen(evolution),
      generations: Object.isFrozen(evolution.adaptive_generations),
      mutations: Object.isFrozen(evolution.mutation_lineage),
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
    replay_scopes: ["evolution-stable", "evolution-adaptive", "evolution-survivability", "evolution-gated"],
    node_id: nodeId,
  };
}

function federatedNode(nodeId: string, federationGroup: string, capacityWeight: number, failureDomain: string, acceptsRemoteRelay: boolean) {
  return { node_id: nodeId, federation_group: federationGroup, capacity_weight: capacityWeight, failure_domain: failureDomain, accepts_remote_relay: acceptsRemoteRelay };
}

function assertActionSupported(_action: ReplayEvolutionAction): void { return; }
function assertStateSupported(_state: ReplayEvolutionState): void { return; }

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
