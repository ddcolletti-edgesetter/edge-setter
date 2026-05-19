import Database from "better-sqlite3";

import {
  buildReplayAgentSnapshot,
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
  buildReplayConsensusLineageSnapshot,
} from "../pipeline/replay-consensus-lineage";
import {
  buildReplayCoordinationMesh,
} from "../pipeline/replay-coordination-mesh";
import type {
  ReplayConsensusDivergenceCategory,
  ReplayConsensusInput,
  ReplayConsensusVote,
} from "../pipeline/replay-consensus-contract";
import {
  buildReplayGovernanceSnapshot,
} from "../pipeline/replay-governance";
import {
  buildReplayMemorySnapshot,
  computeReplayMemoryDeterministicHash,
  getBranchTemporalAncestry,
  getDivergenceEvolutionTimeline,
  getGovernanceDecisionHistory,
  getRecoveryEffectivenessHistory,
  getReplayEpochHistory,
  getReplayEvolutionHistory,
  getValidatorBehavioralHistory,
  serializeReplayMemorySnapshot,
} from "../pipeline/replay-memory";
import type {
  ReplayMemoryAction,
  ReplayMemoryState,
} from "../pipeline/replay-memory-contract";
import {
  persistReplayOrchestrationLifecycle,
} from "../pipeline/replay-orchestration-persistence";
import {
  buildReplayRecoveryCoordinationResult,
} from "../pipeline/replay-recovery-coordination";

const GENERATED_AT = "2026-05-19T21:00:00.000Z";
const PERSISTED_AT = "2026-05-19T21:05:00.000Z";
const GOVERNED_AT = "2026-05-19T21:10:00.000Z";
const AGENT_AT = "2026-05-19T21:15:00.000Z";
const MESH_EPOCH_ONE_AT = "2026-05-19T21:20:00.000Z";
const MESH_EPOCH_TWO_AT = "2026-05-19T21:30:00.000Z";
const MEMORY_AT = "2026-05-19T21:40:00.000Z";

const run = buildReplayAutonomousOrchestrationRun({
  clock: { generated_at: GENERATED_AT },
  consensus_threshold: 0.78,
  max_recovery_attempts: 2,
  targets: [
    target("memory-approve", 50, 0.12, 0.1, 0.95, 1),
    target("memory-quarantine", 45, 0.82, 0.58, 0.75, 2),
    target("memory-recovery", 40, 0.72, 0.74, 0.82, 4),
    target("memory-arbitration", 35, 0.66, 0.52, 0.7, 3),
  ],
});

const approveConsensus = buildReplayConsensusResult(consensusFixture("memory-approve", "memory-root", [
  validator("memory-approve-a", "snapshot_validator", 1, 96, "approve", [], "memory-approve", "memory-root"),
  validator("memory-approve-b", "integrity_validator", 1, 94, "approve", [], "memory-approve", "memory-root"),
  validator("memory-approve-c", "timeline_validator", 1, 92, "approve", [], "memory-approve", "memory-root"),
]));
const quarantineConsensus = buildReplayConsensusResult(consensusFixture("memory-quarantine", "memory-approve", [
  validator("memory-quarantine-a", "snapshot_validator", 2, 91, "diverge", ["snapshot"], "memory-quarantine", "memory-approve"),
  validator("memory-quarantine-b", "provenance_validator", 1, 86, "approve", [], "memory-quarantine", "memory-approve"),
]));
const recoveryConsensus = buildReplayConsensusResult(consensusFixture("memory-recovery", "memory-approve", [
  validator("memory-recovery-a", "timeline_validator", 1.5, 89, "diverge", ["timeline"], "memory-recovery", "memory-approve"),
  validator("memory-recovery-b", "settlement_validator", 1, 83, "approve", [], "memory-recovery", "memory-approve"),
]));
const arbitrationConsensus = buildReplayConsensusResult(consensusFixture("memory-arbitration", "memory-approve", [
  validator("memory-arbitration-a", "integrity_validator", 1, 92, "approve", [], "memory-arbitration", "memory-approve"),
  validator("memory-arbitration-b", "timeline_validator", 1, 92, "diverge", ["timeline"], "memory-arbitration", "memory-approve"),
]));

const approveArbitration = buildReplayArbitrationResult({ generated_at: GENERATED_AT, consensus: approveConsensus });
const quarantineArbitration = buildReplayArbitrationResult({ generated_at: GENERATED_AT, consensus: quarantineConsensus });
const recoveryArbitration = buildReplayArbitrationResult({ generated_at: GENERATED_AT, consensus: recoveryConsensus });
const arbitrationArbitration = buildReplayArbitrationResult({ generated_at: GENERATED_AT, consensus: arbitrationConsensus });

const approveRecovery = buildReplayRecoveryCoordinationResult({
  generated_at: GENERATED_AT,
  arbitration: approveArbitration,
  max_retry_attempts: 2,
});
const quarantineRecovery = buildReplayRecoveryCoordinationResult({
  generated_at: GENERATED_AT,
  arbitration: quarantineArbitration,
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
  const persistence = persistReplayOrchestrationLifecycle(db, {
    persisted_at: PERSISTED_AT,
    orchestration_run: run,
    consensus_results: [
      approveConsensus,
      quarantineConsensus,
      recoveryConsensus,
      arbitrationConsensus,
    ],
    arbitration_results: [
      approveArbitration,
      quarantineArbitration,
      recoveryArbitration,
      arbitrationArbitration,
    ],
    recovery_results: [
      approveRecovery,
      quarantineRecovery,
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
      quarantine_severity_threshold: 78,
      validator_reduce_weight_threshold: 80,
    },
  });
  const agentSnapshot = buildReplayAgentSnapshot(db, {
    run_id: run.run_id,
    generated_at: AGENT_AT,
    persisted_at: PERSISTED_AT,
    agents: [
      agent("memory-validator-a", "validator", "memory-node-a"),
      agent("memory-validator-b", "validator", "memory-node-b"),
      agent("memory-recovery-a", "recovery", "memory-node-c"),
      agent("memory-arbitration-a", "arbitration", "memory-node-b"),
      agent("memory-governance-a", "governance", "memory-node-d"),
      agent("memory-orchestration-a", "orchestration", "memory-node-a"),
    ],
  });
  const lineage = buildReplayConsensusLineageSnapshot(db, run.run_id);
  const failedAgentId = assertExists(
    agentSnapshot.identities.find((identity) => identity.specialization === "validator")?.agent_id,
    "failed validator fixture missing",
  );
  const partitionedAgentId = assertExists(
    agentSnapshot.identities.find((identity) => identity.specialization === "recovery")?.agent_id,
    "partitioned recovery fixture missing",
  );
  const federatedNodes = [
    federatedNode("memory-node-a", "local", 1.4, "az-a", true),
    federatedNode("memory-node-b", "local", 1.2, "az-b", true),
    federatedNode("memory-node-c", "remote-a", 1.5, "az-c", true),
    federatedNode("memory-node-d", "remote-b", 1.1, "az-d", true),
  ];
  const meshOne = buildReplayCoordinationMesh({
    run_id: run.run_id,
    generated_at: MESH_EPOCH_ONE_AT,
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
    generated_at: MESH_EPOCH_TWO_AT,
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
    mesh_snapshots: [meshTwo, meshOne],
    governance_snapshot: governance,
    orchestration_persistence: persistence,
    lineage_snapshot: lineage,
    epoch_size: 4,
  });
  const memoryAgain = buildReplayMemorySnapshot({
    run_id: run.run_id,
    generated_at: MEMORY_AT,
    mesh_snapshots: [meshOne, meshTwo],
    governance_snapshot: governance,
    orchestration_persistence: persistence,
    lineage_snapshot: lineage,
    epoch_size: 4,
  });

  assertEqual(memory.deterministic_hash, memoryAgain.deterministic_hash, "memory hash must be stable across mesh ordering");
  assertEqual(memory.temporal_indexes.length, meshOne.sessions.length + meshTwo.sessions.length, "temporal replay state accumulation mismatch");
  assertEqual(memory.temporal_indexes.every((index, idx) => index.temporal_ordinal === idx + 1), true, "temporal indexing must be contiguous");
  assertEqual(memory.temporal_indexes.every((index) => index.temporal_hash.length === 64), true, "temporal hashes missing");
  assertEqual(memory.replay_evolution.length, memory.temporal_indexes.length, "replay evolution tracking mismatch");
  assertEqual(memory.replay_evolution.some((entry) => entry.from_state !== null), true, "long-horizon replay evolution transitions missing");
  assertEqual(memory.divergence_evolution.some((entry) => entry.divergence_score > 0), true, "divergence history accumulation missing");
  assertEqual(memory.validator_behavior.length > 0, true, "validator behavioral memory missing");
  assertEqual(memory.validator_behavior.some((entry) => entry.divergence_count > 0), true, "validator divergence behavior missing");
  assertEqual(memory.recovery_effectiveness.some((entry) => entry.recovery_route_count > 0), true, "recovery effectiveness history missing");
  assertEqual(memory.governance_decisions.length > 0, true, "governance decision memory missing");
  assertEqual(memory.branch_ancestry.some((entry) => entry.temporal_ordinals.length > 1), true, "branch historical evolution tracking missing");
  assertEqual(memory.epochs.length, Math.ceil(memory.temporal_indexes.length / 4), "epoch count mismatch");
  assertEqual(memory.epochs.every((epoch) => epoch.frozen), true, "replay epochs must be frozen");
  assertEqual(memory.epochs.every((epoch) => epoch.frozen_at === MEMORY_AT), true, "epoch frozen timestamp mismatch");
  assertEqual(memory.snapshots.coordination_mesh_hashes.length, 2, "coordination mesh snapshot references missing");
  assertEqual(memory.snapshots.governance_snapshot_hash, governance.deterministic_hash, "governance snapshot reference mismatch");
  assertEqual(memory.snapshots.orchestration_persistence_hash, persistence.deterministic_hash, "persistence snapshot reference mismatch");
  assertEqual(memory.snapshots.lineage_graph_hash, lineage.graph_hash, "lineage graph reference mismatch");
  assertEqual(memory.branch_ancestry.some((entry) => entry.lineage_hashes.length > 0), true, "lineage continuity missing");
  assertEqual(serializeReplayMemorySnapshot(memory), serializeReplayMemorySnapshot(memoryAgain), "replay-safe temporal serialization mismatch");
  assertEqual(computeReplayMemoryDeterministicHash({ memory: memory.memory_id }).length, 64, "deterministic memory hash helper mismatch");
  assertEqual(Object.isFrozen(memory), true, "memory snapshot must be immutable");
  assertEqual(Object.isFrozen(memory.temporal_indexes), true, "temporal indexes must be immutable");
  assertEqual(Object.isFrozen(memory.replay_evolution), true, "replay evolution must be immutable");
  assertEqual(Object.isFrozen(memory.epochs), true, "epochs must be immutable");

  assertEqual(getReplayEvolutionHistory(memory).length, memory.replay_evolution.length, "evolution query mismatch");
  assertEqual(getValidatorBehavioralHistory(memory).length, memory.validator_behavior.length, "validator query mismatch");
  assertEqual(getDivergenceEvolutionTimeline(memory).length, memory.divergence_evolution.length, "divergence query mismatch");
  assertEqual(getRecoveryEffectivenessHistory(memory).length, memory.recovery_effectiveness.length, "recovery query mismatch");
  assertEqual(getGovernanceDecisionHistory(memory).length, memory.governance_decisions.length, "governance query mismatch");
  assertEqual(getReplayEpochHistory(memory).length, memory.epochs.length, "epoch query mismatch");
  assertEqual(getBranchTemporalAncestry(memory).length, memory.branch_ancestry.length, "ancestry query mismatch");

  assertActionSupported("persist_temporal_state");
  assertActionSupported("archive_branch_history");
  assertActionSupported("record_divergence_evolution");
  assertActionSupported("record_validator_behavior");
  assertActionSupported("record_recovery_effectiveness");
  assertActionSupported("promote_historical_branch");
  assertActionSupported("reconcile_memory_segment");
  assertActionSupported("freeze_replay_epoch");
  assertStateSupported("active");
  assertStateSupported("archived");
  assertStateSupported("stabilized");
  assertStateSupported("quarantined");
  assertStateSupported("deprecated");
  assertStateSupported("reconciled");

  console.log("Replay memory validation passed.");
  console.log(JSON.stringify({
    memory_id: memory.memory_id,
    deterministic_hash: memory.deterministic_hash,
    state: memory.state,
    temporal_indexes: memory.temporal_indexes.length,
    replay_evolution: memory.replay_evolution.length,
    divergence_evolution: memory.divergence_evolution.length,
    validator_behavior: memory.validator_behavior.length,
    recovery_effectiveness: memory.recovery_effectiveness.length,
    governance_decisions: memory.governance_decisions.length,
    branch_ancestry: memory.branch_ancestry.length,
    epochs: memory.epochs.map((epoch) => ({
      epoch_id: epoch.epoch_id,
      replay_hashes: epoch.replay_hashes.length,
      frozen: epoch.frozen,
      epoch_hash: epoch.epoch_hash,
    })),
    immutable_outputs: {
      result: Object.isFrozen(memory),
      temporal_indexes: Object.isFrozen(memory.temporal_indexes),
      replay_evolution: Object.isFrozen(memory.replay_evolution),
      epochs: Object.isFrozen(memory.epochs),
    },
  }, null, 2));
} finally {
  db.close();
}

function target(
  replayHash: string,
  priority: number,
  anomalyScore: number,
  driftScore: number,
  confidenceScore: number,
  lineageDepth: number,
) {
  return {
    replay_hash: replayHash,
    priority,
    anomaly_score: anomalyScore,
    drift_score: driftScore,
    confidence_score: confidenceScore,
    lineage_depth: lineageDepth,
  };
}

function consensusFixture(
  replayHash: string,
  parentReplayHash: string,
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

function agent(
  seed: string,
  specialization: ReplayMemoryAgentSpecialization,
  nodeId: string,
) {
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
    replay_scopes: ["memory-approve", "memory-quarantine", "memory-recovery", "memory-arbitration"],
    node_id: nodeId,
  };
}

function federatedNode(
  nodeId: string,
  federationGroup: string,
  capacityWeight: number,
  failureDomain: string,
  acceptsRemoteRelay: boolean,
) {
  return {
    node_id: nodeId,
    federation_group: federationGroup,
    capacity_weight: capacityWeight,
    failure_domain: failureDomain,
    accepts_remote_relay: acceptsRemoteRelay,
  };
}

function assertActionSupported(_action: ReplayMemoryAction): void {
  return;
}

function assertStateSupported(_state: ReplayMemoryState): void {
  return;
}

function assertExists<T>(value: T | null | undefined, message: string): T {
  if (value === null || typeof value === "undefined") {
    throw new Error(message);
  }

  return value;
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}

type ReplayMemoryAgentSpecialization =
  | "validator"
  | "recovery"
  | "arbitration"
  | "orchestration"
  | "governance";
