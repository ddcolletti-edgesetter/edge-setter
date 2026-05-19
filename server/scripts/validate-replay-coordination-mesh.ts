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
  computeReplayCoordinationMeshDeterministicHash,
  getActiveCoordinationSessions,
  getCoordinationRecoveryHistory,
  getMeshLineage,
  getPartitionHistory,
  getReplayCoordinationTopology,
  getWorkloadDistribution,
} from "../pipeline/replay-coordination-mesh";
import type {
  ReplayCoordinationMeshAction,
  ReplayCoordinationMeshState,
} from "../pipeline/replay-coordination-mesh-contract";
import type {
  ReplayConsensusDivergenceCategory,
  ReplayConsensusInput,
  ReplayConsensusVote,
} from "../pipeline/replay-consensus-contract";
import {
  buildReplayGovernanceSnapshot,
} from "../pipeline/replay-governance";
import {
  persistReplayOrchestrationLifecycle,
} from "../pipeline/replay-orchestration-persistence";
import {
  buildReplayRecoveryCoordinationResult,
} from "../pipeline/replay-recovery-coordination";

const GENERATED_AT = "2026-05-19T20:00:00.000Z";
const PERSISTED_AT = "2026-05-19T20:05:00.000Z";
const GOVERNED_AT = "2026-05-19T20:10:00.000Z";
const AGENT_AT = "2026-05-19T20:15:00.000Z";
const MESH_AT = "2026-05-19T20:20:00.000Z";

const run = buildReplayAutonomousOrchestrationRun({
  clock: { generated_at: GENERATED_AT },
  consensus_threshold: 0.78,
  max_recovery_attempts: 2,
  targets: [
    target("mesh-approve", 50, 0.12, 0.1, 0.95, 1),
    target("mesh-quarantine", 45, 0.82, 0.58, 0.75, 2),
    target("mesh-recovery", 40, 0.72, 0.74, 0.82, 4),
    target("mesh-arbitration", 35, 0.66, 0.52, 0.7, 3),
  ],
});

const approveConsensus = buildReplayConsensusResult(consensusFixture("mesh-approve", "mesh-root", [
  validator("mesh-approve-a", "snapshot_validator", 1, 96, "approve", [], "mesh-approve", "mesh-root"),
  validator("mesh-approve-b", "integrity_validator", 1, 94, "approve", [], "mesh-approve", "mesh-root"),
  validator("mesh-approve-c", "timeline_validator", 1, 92, "approve", [], "mesh-approve", "mesh-root"),
]));
const quarantineConsensus = buildReplayConsensusResult(consensusFixture("mesh-quarantine", "mesh-approve", [
  validator("mesh-quarantine-a", "snapshot_validator", 2, 91, "diverge", ["snapshot"], "mesh-quarantine", "mesh-approve"),
  validator("mesh-quarantine-b", "provenance_validator", 1, 86, "approve", [], "mesh-quarantine", "mesh-approve"),
]));
const recoveryConsensus = buildReplayConsensusResult(consensusFixture("mesh-recovery", "mesh-approve", [
  validator("mesh-recovery-a", "timeline_validator", 1.5, 89, "diverge", ["timeline"], "mesh-recovery", "mesh-approve"),
  validator("mesh-recovery-b", "settlement_validator", 1, 83, "approve", [], "mesh-recovery", "mesh-approve"),
]));
const arbitrationConsensus = buildReplayConsensusResult(consensusFixture("mesh-arbitration", "mesh-approve", [
  validator("mesh-arbitration-a", "integrity_validator", 1, 92, "approve", [], "mesh-arbitration", "mesh-approve"),
  validator("mesh-arbitration-b", "timeline_validator", 1, 92, "diverge", ["timeline"], "mesh-arbitration", "mesh-approve"),
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
      agent("mesh-validator-a", "validator", "mesh-node-a"),
      agent("mesh-validator-b", "validator", "mesh-node-b"),
      agent("mesh-recovery-a", "recovery", "mesh-node-c"),
      agent("mesh-arbitration-a", "arbitration", "mesh-node-b"),
      agent("mesh-governance-a", "governance", "mesh-node-d"),
      agent("mesh-orchestration-a", "orchestration", "mesh-node-a"),
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

  const mesh = buildReplayCoordinationMesh({
    run_id: run.run_id,
    generated_at: MESH_AT,
    agent_snapshot: agentSnapshot,
    governance_snapshot: governance,
    orchestration_persistence: persistence,
    lineage_snapshot: lineage,
    failed_agent_ids: [failedAgentId],
    partitioned_agent_ids: [partitionedAgentId],
    quorum_threshold: 0.45,
    balancing_tolerance: 10,
    federated_nodes: [
      federatedNode("mesh-node-a", "local", 1.4, "az-a", true),
      federatedNode("mesh-node-b", "local", 1.2, "az-b", true),
      federatedNode("mesh-node-c", "remote-a", 1.5, "az-c", true),
      federatedNode("mesh-node-d", "remote-b", 1.1, "az-d", true),
    ],
  });
  const meshAgain = buildReplayCoordinationMesh({
    run_id: run.run_id,
    generated_at: MESH_AT,
    agent_snapshot: agentSnapshot,
    governance_snapshot: governance,
    orchestration_persistence: persistence,
    lineage_snapshot: lineage,
    failed_agent_ids: [failedAgentId],
    partitioned_agent_ids: [partitionedAgentId],
    quorum_threshold: 0.45,
    balancing_tolerance: 10,
    federated_nodes: [
      federatedNode("mesh-node-d", "remote-b", 1.1, "az-d", true),
      federatedNode("mesh-node-b", "local", 1.2, "az-b", true),
      federatedNode("mesh-node-c", "remote-a", 1.5, "az-c", true),
      federatedNode("mesh-node-a", "local", 1.4, "az-a", true),
    ],
  });

  assertEqual(mesh.deterministic_hash, meshAgain.deterministic_hash, "mesh hash must be stable across federated node ordering");
  assertEqual(mesh.state, "partitioned", "partition fixture should drive partitioned mesh state");
  assertEqual(mesh.topology.node_count, agentSnapshot.identities.length, "topology node count mismatch");
  assertEqual(mesh.topology.federation_ready, true, "future node federation compatibility missing");
  assertEqual(mesh.sessions.length, governance.decisions.length, "active coordination sessions mismatch");
  assertEqual(mesh.relay_contracts.every((relay) => relay.replay_safe_payload_hash.length === 64), true, "replay-safe relay payload hashes missing");
  assertEqual(mesh.topology.edges.some((edge) => edge.action === "relay_consensus"), true, "relay consensus topology support missing");
  assertAction(mesh, "allocate_arbitration");
  assertAction(mesh, "allocate_recovery");
  assertEqual(mesh.sessions.every((session) => session.route.route_hash.length === 64), true, "deterministic route hashes missing");
  assertEqual(mesh.sessions.every((session) => session.quorum.quorum_hash.length === 64), true, "mesh quorum hashes missing");
  assertEqual(mesh.workload_allocations.length > 0, true, "distributed replay workload allocation missing");
  assertEqual(mesh.balancing.balanced, true, "coordination workload balancing should be within fixture tolerance");
  assertEqual(mesh.partitions.length > 0, true, "partition history missing");
  assertEqual(mesh.recovery_routes.some((route) => route.action === "reconcile_partition"), true, "partition recovery routing missing");
  assertEqual(mesh.recovery_routes.some((route) => route.action === "reroute_coordination"), true, "failover recovery routing missing");
  assertEqual(mesh.failover.length > 0, true, "failover coordination missing");
  assertEqual(mesh.lineage.length > 0, true, "mesh lineage references missing");
  assertEqual(mesh.lineage.some((reference) => reference.reference_kind === "governance"), true, "governance lineage bridge missing");
  assertEqual(mesh.lineage.some((reference) => reference.reference_kind === "orchestration_persistence"), true, "persistence lineage bridge missing");
  assertEqual(mesh.snapshots.agent_snapshot_hash, agentSnapshot.deterministic_hash, "agent snapshot reference mismatch");
  assertEqual(mesh.snapshots.governance_snapshot_hash, governance.deterministic_hash, "governance snapshot reference mismatch");
  assertEqual(mesh.snapshots.orchestration_persistence_hash, persistence.deterministic_hash, "persistence snapshot reference mismatch");
  assertEqual(mesh.snapshots.lineage_graph_hash, lineage.graph_hash, "lineage graph reference mismatch");
  assertEqual(Object.isFrozen(mesh), true, "mesh output must be immutable");
  assertEqual(Object.isFrozen(mesh.topology.nodes), true, "topology nodes must be immutable");
  assertEqual(Object.isFrozen(mesh.sessions), true, "sessions must be immutable");
  assertEqual(Object.isFrozen(mesh.lineage), true, "lineage must be immutable");
  assertEqual(computeReplayCoordinationMeshDeterministicHash({ mesh: mesh.mesh_id }).length, 64, "deterministic hash helper mismatch");

  assertEqual(getReplayCoordinationTopology(mesh).topology_hash, mesh.topology.topology_hash, "topology query mismatch");
  assertEqual(getActiveCoordinationSessions(mesh).length, mesh.sessions.length, "session query mismatch");
  assertEqual(getMeshLineage(mesh).length, mesh.lineage.length, "lineage query mismatch");
  assertEqual(getWorkloadDistribution(mesh).length, mesh.workload_allocations.length, "workload query mismatch");
  assertEqual(getCoordinationRecoveryHistory(mesh).length, mesh.recovery_routes.length, "recovery query mismatch");
  assertEqual(getPartitionHistory(mesh).length, mesh.partitions.length, "partition query mismatch");

  assertStateSupported("synchronizing");
  assertStateSupported("coordinated");
  assertStateSupported("degraded");
  assertStateSupported("partitioned");
  assertStateSupported("recovering");
  assertStateSupported("stabilized");

  console.log("Replay coordination mesh validation passed.");
  console.log(JSON.stringify({
    mesh_id: mesh.mesh_id,
    deterministic_hash: mesh.deterministic_hash,
    state: mesh.state,
    topology: {
      nodes: mesh.topology.node_count,
      edges: mesh.topology.edge_count,
      federation_ready: mesh.topology.federation_ready,
      topology_hash: mesh.topology.topology_hash,
    },
    sessions: mesh.sessions.map((session) => ({
      replay_hash: session.replay_hash,
      action: session.action,
      state: session.state,
      quorum_met: session.quorum.quorum_met,
      primary_mesh_node_id: session.route.primary_mesh_node_id,
    })),
    balancing: mesh.balancing,
    recovery_routes: mesh.recovery_routes.length,
    failover: mesh.failover.length,
    partitions: mesh.partitions.length,
    lineage_references: mesh.lineage.length,
    immutable_outputs: {
      result: Object.isFrozen(mesh),
      topology_nodes: Object.isFrozen(mesh.topology.nodes),
      sessions: Object.isFrozen(mesh.sessions),
      lineage: Object.isFrozen(mesh.lineage),
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
  specialization: ReplayConsensusMeshAgentSpecialization,
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
    replay_scopes: ["mesh-approve", "mesh-quarantine", "mesh-recovery", "mesh-arbitration"],
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

function assertAction(
  mesh: { readonly sessions: readonly { readonly action: ReplayCoordinationMeshAction }[] },
  expected: ReplayCoordinationMeshAction,
): void {
  if (!mesh.sessions.some((session) => session.action === expected)) {
    throw new Error(`Expected coordination action ${expected}.`);
  }
}

function assertStateSupported(_state: ReplayCoordinationMeshState): void {
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

type ReplayConsensusMeshAgentSpecialization =
  | "validator"
  | "recovery"
  | "arbitration"
  | "orchestration"
  | "governance";
