import crypto from "node:crypto";

import type {
  ReplayAgentCapabilityDeclaration,
  ReplayAgentIdentity,
  ReplayAgentTrustProfile,
} from "./replay-agent-contract";
import type {
  ReplayGovernanceBranchStatus,
  ReplayGovernanceDecision,
} from "./replay-governance-contract";
import type {
  ReplayCoordinationBalancingSummary,
  ReplayCoordinationFederatedNode,
  ReplayCoordinationFailoverRecord,
  ReplayCoordinationLineageReference,
  ReplayCoordinationMeshAction,
  ReplayCoordinationMeshEdge,
  ReplayCoordinationMeshInput,
  ReplayCoordinationMeshNode,
  ReplayCoordinationMeshQuery,
  ReplayCoordinationMeshResult,
  ReplayCoordinationMeshState,
  ReplayCoordinationPartitionRecord,
  ReplayCoordinationQuorum,
  ReplayCoordinationRecoveryRoute,
  ReplayCoordinationRelayContract,
  ReplayCoordinationRoute,
  ReplayCoordinationSession,
  ReplayCoordinationSnapshotReference,
  ReplayCoordinationTopology,
  ReplayCoordinationWorkloadAllocation,
} from "./replay-coordination-mesh-contract";

const DEFAULT_QUORUM_THRESHOLD = 0.66;
const DEFAULT_BALANCING_TOLERANCE = 0.34;

const SUPPORTED_QUERIES: readonly ReplayCoordinationMeshQuery[] = [
  "get_coordination_topology",
  "get_active_coordination_sessions",
  "get_mesh_lineage",
  "get_workload_distribution",
  "get_coordination_recovery_history",
  "get_partition_history",
];

export function buildReplayCoordinationMesh(
  input: ReplayCoordinationMeshInput,
): ReplayCoordinationMeshResult {
  const failedAgentIds = new Set(input.failed_agent_ids ?? []);
  const partitionedAgentIds = new Set(input.partitioned_agent_ids ?? []);
  const topology = buildTopology(input, failedAgentIds, partitionedAgentIds);
  const lineage = buildLineage(input);
  const sessions = buildSessions(input, topology, lineage);
  const workloadAllocations = buildWorkloadAllocations(sessions);
  const relayContracts = buildRelayContracts(sessions, topology, input);
  const recoveryRoutes = buildRecoveryRoutes(sessions, topology, input, failedAgentIds, partitionedAgentIds);
  const failover = buildFailoverRecords(sessions, topology, failedAgentIds);
  const partitions = buildPartitionRecords(sessions, topology, partitionedAgentIds);
  const balancing = buildBalancingSummary(
    topology.nodes,
    workloadAllocations,
    input.balancing_tolerance ?? DEFAULT_BALANCING_TOLERANCE,
  );
  const snapshots = buildSnapshotReference(input);
  const state = classifyMeshState({
    topology,
    sessions,
    balancing,
    recoveryRoutes,
    failover,
    partitions,
    failedAgentIds,
    partitionedAgentIds,
  });
  const seed = {
    run_id: input.run_id,
    generated_at: input.generated_at,
    state,
    topology_hash: topology.topology_hash,
    session_hashes: sessions.map((session) => session.session_hash),
    relay_hashes: relayContracts.map((relay) => relay.relay_hash),
    workload_hashes: workloadAllocations.map((allocation) => allocation.allocation_hash),
    balance_hash: balancing.balance_hash,
    recovery_hashes: recoveryRoutes.map((route) => route.recovery_hash),
    failover_hashes: failover.map((record) => record.failover_hash),
    partition_hashes: partitions.map((record) => record.partition_hash),
    lineage_hashes: lineage.map((reference) => reference.reference_hash),
    snapshot_reference_hash: snapshots.reference_hash,
  };
  const deterministicHash = computeReplayCoordinationMeshHash(seed);

  return deepFreeze({
    mesh_id: `replay-coordination-mesh:${deterministicHash}`,
    run_id: input.run_id,
    generated_at: input.generated_at,
    state,
    topology,
    sessions,
    relay_contracts: relayContracts,
    workload_allocations: workloadAllocations,
    balancing,
    recovery_routes: recoveryRoutes,
    failover,
    partitions,
    lineage,
    snapshots,
    supported_queries: SUPPORTED_QUERIES,
    deterministic_hash: deterministicHash,
  });
}

export function getReplayCoordinationTopology(
  mesh: ReplayCoordinationMeshResult,
): ReplayCoordinationTopology {
  return mesh.topology;
}

export function getActiveCoordinationSessions(
  mesh: ReplayCoordinationMeshResult,
): readonly ReplayCoordinationSession[] {
  return mesh.sessions;
}

export function getMeshLineage(
  mesh: ReplayCoordinationMeshResult,
): readonly ReplayCoordinationLineageReference[] {
  return mesh.lineage;
}

export function getWorkloadDistribution(
  mesh: ReplayCoordinationMeshResult,
): readonly ReplayCoordinationWorkloadAllocation[] {
  return mesh.workload_allocations;
}

export function getCoordinationRecoveryHistory(
  mesh: ReplayCoordinationMeshResult,
): readonly ReplayCoordinationRecoveryRoute[] {
  return mesh.recovery_routes;
}

export function getPartitionHistory(
  mesh: ReplayCoordinationMeshResult,
): readonly ReplayCoordinationPartitionRecord[] {
  return mesh.partitions;
}

export function computeReplayCoordinationMeshDeterministicHash(value: unknown): string {
  return computeReplayCoordinationMeshHash(value);
}

function buildTopology(
  input: ReplayCoordinationMeshInput,
  failedAgentIds: ReadonlySet<string>,
  partitionedAgentIds: ReadonlySet<string>,
): ReplayCoordinationTopology {
  const nodes = input.agent_snapshot.identities
    .map((identity) => buildNode(input, identity, failedAgentIds, partitionedAgentIds))
    .sort((left, right) =>
      left.node_id.localeCompare(right.node_id) ||
      left.specialization.localeCompare(right.specialization) ||
      left.agent_id.localeCompare(right.agent_id),
    );
  const edges = buildEdges(nodes);
  const seed = {
    run_id: input.run_id,
    node_hashes: nodes.map((node) => node.node_hash),
    edge_hashes: edges.map((edge) => edge.edge_hash),
    federation_ready: nodes.every((node) => node.distributed_node_compatible),
  };
  const topologyHash = computeReplayCoordinationMeshHash(seed);

  return deepFreeze({
    topology_id: `replay-coordination-topology:${topologyHash}`,
    run_id: input.run_id,
    node_count: nodes.length,
    edge_count: edges.length,
    federation_ready: nodes.every((node) => node.distributed_node_compatible),
    nodes,
    edges,
    topology_hash: topologyHash,
  });
}

function buildNode(
  input: ReplayCoordinationMeshInput,
  identity: ReplayAgentIdentity,
  failedAgentIds: ReadonlySet<string>,
  partitionedAgentIds: ReadonlySet<string>,
): ReplayCoordinationMeshNode {
  const trust = findTrustProfile(input, identity);
  const capability = findCapability(input, identity);
  const decision = findDecisionForValidator(input, identity);
  const federatedNode = findFederatedNode(input.federated_nodes, identity.node_id);
  const state = failedAgentIds.has(identity.agent_id)
    ? "revoked"
    : partitionedAgentIds.has(identity.agent_id)
      ? "degraded"
      : trust?.state ?? "active";
  const seed = {
    agent_id: identity.agent_id,
    run_id: identity.run_id,
    node_id: identity.node_id,
    federation_group: federatedNode?.federation_group ?? "local",
    failure_domain: federatedNode?.failure_domain ?? identity.node_id,
    specialization: identity.specialization,
    state,
    trust_score: trust?.agent_trust_score ?? 0,
    capacity_weight: federatedNode?.capacity_weight ?? capacityWeight(identity.specialization, trust?.agent_trust_score ?? 0),
    distributed_node_compatible: capability?.distributed_node_compatible ?? true,
    governance_action: decision?.action ?? null,
    governance_state: decision?.state ?? null,
    capability_hash: capability?.capability_hash ?? identity.deterministic_hash,
  };
  const nodeHash = computeReplayCoordinationMeshHash(seed);

  return deepFreeze({
    mesh_node_id: `replay-mesh-node:${nodeHash}`,
    ...seed,
    node_hash: nodeHash,
  });
}

function buildEdges(
  nodes: readonly ReplayCoordinationMeshNode[],
): readonly ReplayCoordinationMeshEdge[] {
  const activeNodes = nodes.filter((node) => node.state !== "revoked");
  const edges: ReplayCoordinationMeshEdge[] = [];

  for (const from of activeNodes) {
    for (const to of activeNodes) {
      if (from.mesh_node_id === to.mesh_node_id) continue;
      const action = edgeAction(from, to);
      const relayContractHash = computeReplayCoordinationMeshHash({
        from_agent_id: from.agent_id,
        to_agent_id: to.agent_id,
        action,
        replay_safe: true,
      });
      const seed = {
        from_mesh_node_id: from.mesh_node_id,
        to_mesh_node_id: to.mesh_node_id,
        action,
        route_weight: roundMeshNumber((from.trust_score + to.trust_score) / 200),
        relay_contract_hash: relayContractHash,
      };
      const edgeHash = computeReplayCoordinationMeshHash(seed);

      edges.push({
        edge_id: `replay-mesh-edge:${edgeHash}`,
        ...seed,
        edge_hash: edgeHash,
      });
    }
  }

  return deepFreeze(edges.sort((left, right) =>
    left.action.localeCompare(right.action) ||
    left.from_mesh_node_id.localeCompare(right.from_mesh_node_id) ||
    left.to_mesh_node_id.localeCompare(right.to_mesh_node_id),
  ));
}

function buildSessions(
  input: ReplayCoordinationMeshInput,
  topology: ReplayCoordinationTopology,
  lineage: readonly ReplayCoordinationLineageReference[],
): readonly ReplayCoordinationSession[] {
  const decisions = input.governance_snapshot.decisions.length > 0
    ? input.governance_snapshot.decisions
    : fallbackDecisions(input);

  return deepFreeze(decisions.map((decision) => {
    const action = actionForDecision(decision);
    const replayLineage = lineage
      .filter((reference) => reference.replay_hash === decision.replay_hash)
      .map((reference) => reference.reference_hash);
    const persistenceHashes = input.orchestration_persistence.records
      .filter((record) => record.replay_hash === decision.replay_hash)
      .map((record) => record.persistence_hash)
      .sort((left, right) => left.localeCompare(right));
    const route = buildRoute(decision.replay_hash, action, topology);
    const quorum = buildQuorum(input, decision.replay_hash, topology, route);
    const allocationHashes = route.route_path.map((meshNodeId) =>
      computeReplayCoordinationMeshHash({
        replay_hash: decision.replay_hash,
        action,
        mesh_node_id: meshNodeId,
        load_units: loadUnitsForAction(action),
      }),
    );
    const relayHashes = route.relay_mesh_node_ids.map((relayMeshNodeId) =>
      computeReplayCoordinationMeshHash({
        replay_hash: decision.replay_hash,
        action,
        from: route.primary_mesh_node_id,
        to: relayMeshNodeId,
        governance_decision_hash: decision.deterministic_hash,
      }),
    );
    const state = sessionState(decision, quorum, route);
    const seed = {
      run_id: input.run_id,
      replay_hash: decision.replay_hash,
      action,
      state,
      governance_action: decision.action,
      governance_state: decision.state,
      route_hash: route.route_hash,
      quorum_hash: quorum.quorum_hash,
      relay_contract_hashes: relayHashes,
      workload_allocation_hashes: allocationHashes,
      lineage_reference_hashes: replayLineage,
      persistence_record_hashes: persistenceHashes,
    };
    const sessionHash = computeReplayCoordinationMeshHash(seed);

    return {
      session_id: `replay-coordination-session:${sessionHash}`,
      ...seed,
      route,
      quorum,
      session_hash: sessionHash,
    };
  }).sort((left, right) =>
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.action.localeCompare(right.action),
  ));
}

function buildRoute(
  replayHash: string,
  action: ReplayCoordinationMeshAction,
  topology: ReplayCoordinationTopology,
): ReplayCoordinationRoute {
  const eligible = topology.nodes
    .filter((node) => node.state !== "revoked" && supportsMeshAction(node, action))
    .sort((left, right) => routeScore(right, replayHash, action) - routeScore(left, replayHash, action) ||
      left.mesh_node_id.localeCompare(right.mesh_node_id));
  const fallback = topology.nodes
    .filter((node) => node.state !== "revoked")
    .sort((left, right) => routeScore(right, replayHash, action) - routeScore(left, replayHash, action) ||
      left.mesh_node_id.localeCompare(right.mesh_node_id));
  const routeNodes = (eligible.length > 0 ? eligible : fallback).slice(0, 3);
  const primary = routeNodes[0] ?? topology.nodes[0];
  if (!primary) {
    throw new Error("Replay coordination mesh requires at least one mesh node.");
  }
  const routePath = routeNodes.length > 0
    ? routeNodes.map((node) => node.mesh_node_id)
    : [primary.mesh_node_id];
  const recoveryRoutePath = topology.nodes
    .filter((node) => node.state !== "revoked" && !routePath.includes(node.mesh_node_id))
    .sort((left, right) => routeScore(right, replayHash, "reroute_coordination") - routeScore(left, replayHash, "reroute_coordination") ||
      left.mesh_node_id.localeCompare(right.mesh_node_id))
    .slice(0, 2)
    .map((node) => node.mesh_node_id);
  const seed = {
    replay_hash: replayHash,
    action,
    primary_mesh_node_id: primary.mesh_node_id,
    relay_mesh_node_ids: routePath.slice(1),
    route_path: routePath,
    recovery_route_path: recoveryRoutePath,
    routing_reason: routeNodes.length >= 2 ? "deterministic_capability_route" : "deterministic_single_node_route",
  };
  const routeHash = computeReplayCoordinationMeshHash(seed);

  return deepFreeze({
    route_id: `replay-coordination-route:${routeHash}`,
    ...seed,
    route_hash: routeHash,
  });
}

function buildQuorum(
  input: ReplayCoordinationMeshInput,
  replayHash: string,
  topology: ReplayCoordinationTopology,
  route: ReplayCoordinationRoute,
): ReplayCoordinationQuorum {
  const requiredRatio = input.quorum_threshold ?? DEFAULT_QUORUM_THRESHOLD;
  const totalWeight = sum(topology.nodes
    .filter((node) => node.state !== "revoked")
    .map((node) => node.capacity_weight));
  const participatingWeight = sum(topology.nodes
    .filter((node) => route.route_path.includes(node.mesh_node_id) && node.state !== "revoked")
    .map((node) => node.capacity_weight));
  const quorumRatio = totalWeight === 0 ? 0 : roundMeshNumber(participatingWeight / totalWeight);
  const seed = {
    replay_hash: replayHash,
    session_route_hash: route.route_hash,
    required_ratio: requiredRatio,
    participating_weight: participatingWeight,
    total_weight: totalWeight,
    quorum_ratio: quorumRatio,
    quorum_met: quorumRatio >= requiredRatio,
  };
  const quorumHash = computeReplayCoordinationMeshHash(seed);

  return deepFreeze({
    quorum_id: `replay-coordination-quorum:${quorumHash}`,
    replay_hash: replayHash,
    session_id: `pending:${route.route_hash}`,
    required_ratio: requiredRatio,
    participating_weight: roundMeshNumber(participatingWeight),
    total_weight: roundMeshNumber(totalWeight),
    quorum_ratio: quorumRatio,
    quorum_met: quorumRatio >= requiredRatio,
    quorum_hash: quorumHash,
  });
}

function buildWorkloadAllocations(
  sessions: readonly ReplayCoordinationSession[],
): readonly ReplayCoordinationWorkloadAllocation[] {
  return deepFreeze(sessions.flatMap((session) =>
    session.route.route_path.map((meshNodeId, index) => {
      const seed = {
        replay_hash: session.replay_hash,
        action: session.action,
        mesh_node_id: meshNodeId,
        assigned_weight: index === 0 ? 1 : 0.5,
        load_units: loadUnitsForAction(session.action),
      };
      const allocationHash = computeReplayCoordinationMeshHash(seed);

      return {
        allocation_id: `replay-coordination-allocation:${allocationHash}`,
        ...seed,
        allocation_hash: allocationHash,
      };
    }),
  ).sort((left, right) =>
    left.mesh_node_id.localeCompare(right.mesh_node_id) ||
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.action.localeCompare(right.action),
  ));
}

function buildRelayContracts(
  sessions: readonly ReplayCoordinationSession[],
  topology: ReplayCoordinationTopology,
  input: ReplayCoordinationMeshInput,
): readonly ReplayCoordinationRelayContract[] {
  const nodesById = new Map(topology.nodes.map((node) => [node.mesh_node_id, node]));
  const decisionsByReplay = new Map(input.governance_snapshot.decisions.map((decision) => [decision.replay_hash, decision]));

  return deepFreeze(sessions.flatMap((session) => {
    const fromNode = nodesById.get(session.route.primary_mesh_node_id);
    const decision = decisionsByReplay.get(session.replay_hash);
    if (!fromNode) return [];

    return session.route.relay_mesh_node_ids.flatMap((relayMeshNodeId) => {
      const toNode = nodesById.get(relayMeshNodeId);
      if (!toNode) return [];
      const seed = {
        session_id: session.session_id,
        replay_hash: session.replay_hash,
        from_agent_id: fromNode.agent_id,
        to_agent_id: toNode.agent_id,
        action: session.action,
        replay_safe_payload_hash: computeReplayCoordinationMeshHash({
          replay_hash: session.replay_hash,
          action: session.action,
          lineage_reference_hashes: session.lineage_reference_hashes,
          persistence_record_hashes: session.persistence_record_hashes,
        }),
        governance_decision_hash: decision?.deterministic_hash ?? null,
        lineage_reference_hashes: session.lineage_reference_hashes,
      };
      const relayHash = computeReplayCoordinationMeshHash(seed);

      return [{
        relay_id: `replay-coordination-relay:${relayHash}`,
        ...seed,
        relay_hash: relayHash,
      }];
    });
  }).sort((left, right) =>
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.from_agent_id.localeCompare(right.from_agent_id) ||
    left.to_agent_id.localeCompare(right.to_agent_id),
  ));
}

function buildRecoveryRoutes(
  sessions: readonly ReplayCoordinationSession[],
  topology: ReplayCoordinationTopology,
  input: ReplayCoordinationMeshInput,
  failedAgentIds: ReadonlySet<string>,
  partitionedAgentIds: ReadonlySet<string>,
): readonly ReplayCoordinationRecoveryRoute[] {
  const nodesByAgent = new Map(topology.nodes.map((node) => [node.agent_id, node]));
  const records: ReplayCoordinationRecoveryRoute[] = [];
  const affectedNodes = [...input.failed_agent_ids ?? [], ...input.partitioned_agent_ids ?? []]
    .flatMap((agentId) => {
      const node = nodesByAgent.get(agentId);
      return node ? [node] : [];
    })
    .sort((left, right) => left.mesh_node_id.localeCompare(right.mesh_node_id));

  for (const session of sessions) {
    for (const affectedNode of affectedNodes) {
      const action: ReplayCoordinationMeshAction = failedAgentIds.has(affectedNode.agent_id)
        ? "reroute_coordination"
        : "reconcile_partition";
      const candidates = topology.nodes
        .filter((node) =>
          node.state !== "revoked" &&
          node.mesh_node_id !== affectedNode.mesh_node_id &&
          supportsMeshAction(node, action),
        )
        .sort((left, right) => routeScore(right, session.replay_hash, action) - routeScore(left, session.replay_hash, action) ||
          left.mesh_node_id.localeCompare(right.mesh_node_id));
      const promoted = candidates[0] ?? topology.nodes.find((node) => node.state !== "revoked");
      if (!promoted) continue;
      const seed = {
        replay_hash: session.replay_hash,
        from_mesh_node_id: affectedNode.mesh_node_id,
        to_mesh_node_id: promoted.mesh_node_id,
        action,
        reason: partitionedAgentIds.has(affectedNode.agent_id)
          ? "partition_reconciliation_route"
          : "failed_agent_failover_route",
        recovery_path: [affectedNode.mesh_node_id, promoted.mesh_node_id, ...session.route.recovery_route_path]
          .filter((value, index, values) => values.indexOf(value) === index),
      };
      const recoveryHash = computeReplayCoordinationMeshHash(seed);

      records.push({
        recovery_id: `replay-coordination-recovery:${recoveryHash}`,
        ...seed,
        recovery_hash: recoveryHash,
      });
    }
  }

  return deepFreeze(records.sort((left, right) =>
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.from_mesh_node_id.localeCompare(right.from_mesh_node_id) ||
    left.action.localeCompare(right.action),
  ));
}

function buildFailoverRecords(
  sessions: readonly ReplayCoordinationSession[],
  topology: ReplayCoordinationTopology,
  failedAgentIds: ReadonlySet<string>,
): readonly ReplayCoordinationFailoverRecord[] {
  const failedNodes = topology.nodes.filter((node) => failedAgentIds.has(node.agent_id));

  return deepFreeze(sessions.flatMap((session) =>
    failedNodes.flatMap((failedNode) => {
      const promoted = topology.nodes
        .filter((node) => node.state !== "revoked" && node.mesh_node_id !== failedNode.mesh_node_id)
        .sort((left, right) => routeScore(right, session.replay_hash, "reroute_coordination") - routeScore(left, session.replay_hash, "reroute_coordination") ||
          left.mesh_node_id.localeCompare(right.mesh_node_id))[0];
      if (!promoted) return [];
      const seed = {
        replay_hash: session.replay_hash,
        failed_mesh_node_id: failedNode.mesh_node_id,
        promoted_mesh_node_id: promoted.mesh_node_id,
        session_id: session.session_id,
      };
      const failoverHash = computeReplayCoordinationMeshHash(seed);

      return [{
        failover_id: `replay-coordination-failover:${failoverHash}`,
        ...seed,
        failover_hash: failoverHash,
      }];
    }),
  ));
}

function buildPartitionRecords(
  sessions: readonly ReplayCoordinationSession[],
  topology: ReplayCoordinationTopology,
  partitionedAgentIds: ReadonlySet<string>,
): readonly ReplayCoordinationPartitionRecord[] {
  const partitionedNodeIds = topology.nodes
    .filter((node) => partitionedAgentIds.has(node.agent_id))
    .map((node) => node.mesh_node_id)
    .sort((left, right) => left.localeCompare(right));
  if (partitionedNodeIds.length === 0) return deepFreeze([]);

  return deepFreeze(sessions.map((session) => {
    const seed = {
      replay_hash: session.replay_hash,
      affected_mesh_node_ids: partitionedNodeIds,
      reconciliation_action: "reconcile_partition" as const,
      recovered_by_session_id: session.session_id,
    };
    const partitionHash = computeReplayCoordinationMeshHash(seed);

    return {
      partition_id: `replay-coordination-partition:${partitionHash}`,
      ...seed,
      partition_hash: partitionHash,
    };
  }));
}

function buildLineage(
  input: ReplayCoordinationMeshInput,
): readonly ReplayCoordinationLineageReference[] {
  const graphReferences = input.lineage_snapshot.nodes.map((node) =>
    lineageReference(node.replay_hash, node.node_hash, node.source_hash, "lineage_graph"),
  );
  const governanceReferences = input.governance_snapshot.lineage_references.map((reference) =>
    lineageReference(reference.replay_hash, reference.lineage_hash, reference.reference_hash, "governance"),
  );
  const agentReferences = input.agent_snapshot.lineage_references.map((reference) =>
    lineageReference(reference.replay_hash, reference.source_lineage_hash, reference.reference_hash, "agent"),
  );
  const persistenceReferences = input.orchestration_persistence.lineage.map((record) =>
    lineageReference(record.replay_hash, record.lineage_hash, record.persistence_hash, "orchestration_persistence"),
  );

  return deepFreeze([...graphReferences, ...governanceReferences, ...agentReferences, ...persistenceReferences]
    .sort((left, right) =>
      left.replay_hash.localeCompare(right.replay_hash) ||
      left.reference_kind.localeCompare(right.reference_kind) ||
      left.reference_hash.localeCompare(right.reference_hash),
    ));
}

function lineageReference(
  replayHash: string,
  lineageHash: string,
  sourceHash: string,
  referenceKind: ReplayCoordinationLineageReference["reference_kind"],
): ReplayCoordinationLineageReference {
  const seed = {
    replay_hash: replayHash,
    lineage_hash: lineageHash,
    source_hash: sourceHash,
    reference_kind: referenceKind,
  };
  const referenceHash = computeReplayCoordinationMeshHash(seed);

  return {
    reference_id: `replay-coordination-lineage:${referenceHash}`,
    ...seed,
    reference_hash: referenceHash,
  };
}

function buildBalancingSummary(
  nodes: readonly ReplayCoordinationMeshNode[],
  allocations: readonly ReplayCoordinationWorkloadAllocation[],
  tolerance: number,
): ReplayCoordinationBalancingSummary {
  const activeNodeIds = nodes
    .filter((node) => node.state !== "revoked")
    .map((node) => node.mesh_node_id);
  const loads = activeNodeIds.map((nodeId) =>
    sum(allocations
      .filter((allocation) => allocation.mesh_node_id === nodeId)
      .map((allocation) => allocation.load_units * allocation.assigned_weight)),
  );
  const totalLoadUnits = sum(loads);
  const minNodeLoad = loads.length > 0 ? Math.min(...loads) : 0;
  const maxNodeLoad = loads.length > 0 ? Math.max(...loads) : 0;
  const averageNodeLoad = loads.length > 0 ? totalLoadUnits / loads.length : 0;
  const imbalanceRatio = averageNodeLoad === 0 ? 0 : (maxNodeLoad - minNodeLoad) / averageNodeLoad;
  const seed = {
    total_load_units: roundMeshNumber(totalLoadUnits),
    min_node_load: roundMeshNumber(minNodeLoad),
    max_node_load: roundMeshNumber(maxNodeLoad),
    average_node_load: roundMeshNumber(averageNodeLoad),
    imbalance_ratio: roundMeshNumber(imbalanceRatio),
    tolerance,
    balanced: imbalanceRatio <= tolerance,
  };
  const balanceHash = computeReplayCoordinationMeshHash(seed);

  return deepFreeze({
    balance_id: `replay-coordination-balance:${balanceHash}`,
    ...seed,
    balance_hash: balanceHash,
  });
}

function buildSnapshotReference(
  input: ReplayCoordinationMeshInput,
): ReplayCoordinationSnapshotReference {
  const seed = {
    agent_snapshot_hash: input.agent_snapshot.deterministic_hash,
    governance_snapshot_hash: input.governance_snapshot.deterministic_hash,
    orchestration_persistence_hash: input.orchestration_persistence.deterministic_hash,
    lineage_graph_hash: input.lineage_snapshot.graph_hash,
  };

  return deepFreeze({
    ...seed,
    reference_hash: computeReplayCoordinationMeshHash(seed),
  });
}

function classifyMeshState(input: {
  readonly topology: ReplayCoordinationTopology;
  readonly sessions: readonly ReplayCoordinationSession[];
  readonly balancing: ReplayCoordinationBalancingSummary;
  readonly recoveryRoutes: readonly ReplayCoordinationRecoveryRoute[];
  readonly failover: readonly ReplayCoordinationFailoverRecord[];
  readonly partitions: readonly ReplayCoordinationPartitionRecord[];
  readonly failedAgentIds: ReadonlySet<string>;
  readonly partitionedAgentIds: ReadonlySet<string>;
}): ReplayCoordinationMeshState {
  if (input.partitionedAgentIds.size > 0 || input.partitions.length > 0) return "partitioned";
  if (input.failedAgentIds.size > 0 || input.failover.length > 0) return "recovering";
  if (input.sessions.length === 0 || input.topology.node_count === 0) return "synchronizing";
  if (input.sessions.some((session) => !session.quorum.quorum_met) || !input.balancing.balanced) return "degraded";
  if (input.sessions.every((session) => session.state === "stabilized")) return "stabilized";
  return "coordinated";
}

function sessionState(
  decision: ReplayGovernanceDecision,
  quorum: ReplayCoordinationQuorum,
  route: ReplayCoordinationRoute,
): ReplayCoordinationMeshState {
  if (!quorum.quorum_met) return "degraded";
  if (route.recovery_route_path.length > 0 && decision.state === "quarantined") return "recovering";
  if (decision.state === "stabilized" || decision.state === "approved") return "stabilized";
  return "coordinated";
}

function actionForDecision(
  decision: ReplayGovernanceDecision,
): ReplayCoordinationMeshAction {
  switch (decision.action) {
    case "approve_branch":
      return "relay_consensus";
    case "promote_branch":
      return "promote_mesh_branch";
    case "quarantine_branch":
    case "revoke_validator":
    case "reduce_validator_weight":
      return "quarantine_mesh_segment";
    case "elevate_recovery":
      return "allocate_recovery";
    case "override_arbitration":
    case "reject_branch":
    case "require_review":
      return "allocate_arbitration";
  }
}

function edgeAction(
  from: ReplayCoordinationMeshNode,
  to: ReplayCoordinationMeshNode,
): ReplayCoordinationMeshAction {
  if (from.failure_domain !== to.failure_domain && from.federation_group !== to.federation_group) {
    return "reroute_coordination";
  }
  if (from.specialization === "recovery" || to.specialization === "recovery") return "allocate_recovery";
  if (from.specialization === "arbitration" || to.specialization === "arbitration") return "allocate_arbitration";
  if (from.specialization === "governance" || to.specialization === "governance") return "relay_consensus";
  return "allocate_validation";
}

function supportsMeshAction(
  node: ReplayCoordinationMeshNode,
  action: ReplayCoordinationMeshAction,
): boolean {
  switch (action) {
    case "allocate_validation":
      return node.specialization === "validator" || node.specialization === "orchestration";
    case "allocate_arbitration":
      return node.specialization === "arbitration" || node.specialization === "governance";
    case "allocate_recovery":
    case "reconcile_partition":
    case "reroute_coordination":
      return node.specialization === "recovery" || node.specialization === "orchestration";
    case "relay_consensus":
      return node.specialization === "validator" || node.specialization === "governance" || node.specialization === "orchestration";
    case "promote_mesh_branch":
      return node.specialization === "governance" || node.specialization === "orchestration";
    case "quarantine_mesh_segment":
      return node.specialization === "governance" || node.specialization === "recovery";
  }
}

function routeScore(
  node: ReplayCoordinationMeshNode,
  replayHash: string,
  action: ReplayCoordinationMeshAction,
): number {
  const hashPrefix = computeReplayCoordinationMeshHash({
    replay_hash: replayHash,
    action,
    mesh_node_id: node.mesh_node_id,
  }).slice(0, 8);
  const deterministicJitter = Number.parseInt(hashPrefix, 16) / 0xffffffff;
  const statePenalty = node.state === "degraded" || node.state === "recovering" ? 0.2 : 0;
  return node.trust_score + (node.capacity_weight * 10) + deterministicJitter - statePenalty;
}

function loadUnitsForAction(action: ReplayCoordinationMeshAction): number {
  switch (action) {
    case "allocate_arbitration":
    case "reconcile_partition":
    case "quarantine_mesh_segment":
      return 3;
    case "allocate_recovery":
    case "reroute_coordination":
    case "promote_mesh_branch":
      return 2;
    case "allocate_validation":
    case "relay_consensus":
      return 1;
  }
}

function findTrustProfile(
  input: ReplayCoordinationMeshInput,
  identity: ReplayAgentIdentity,
): ReplayAgentTrustProfile | undefined {
  return input.agent_snapshot.trust_profiles.find((profile) =>
    profile.agent_id === identity.agent_id,
  );
}

function findCapability(
  input: ReplayCoordinationMeshInput,
  identity: ReplayAgentIdentity,
): ReplayAgentCapabilityDeclaration | undefined {
  return input.agent_snapshot.capabilities.find((capability) =>
    capability.specialization === identity.specialization,
  );
}

function findDecisionForValidator(
  input: ReplayCoordinationMeshInput,
  identity: ReplayAgentIdentity,
): ReplayGovernanceDecision | undefined {
  const trust = findTrustProfile(input, identity);
  if (trust?.recommended_governance_action) {
    return input.governance_snapshot.decisions.find((decision) =>
      decision.action === trust.recommended_governance_action,
    );
  }

  return input.governance_snapshot.decisions[0];
}

function findFederatedNode(
  federatedNodes: readonly ReplayCoordinationFederatedNode[] | undefined,
  nodeId: string,
): ReplayCoordinationFederatedNode | undefined {
  return federatedNodes?.find((node) => node.node_id === nodeId);
}

function fallbackDecisions(
  input: ReplayCoordinationMeshInput,
): readonly ReplayGovernanceDecision[] {
  return input.governance_snapshot.branch_statuses.map((status: ReplayGovernanceBranchStatus) => ({
    decision_id: `replay-governance-fallback:${status.status_hash}`,
    run_id: input.run_id,
    replay_hash: status.replay_hash,
    action: status.latest_action,
    state: status.current_state,
    generated_at: input.generated_at,
    policy_hash: input.governance_snapshot.policy_hash,
    evaluation_hash: status.status_hash,
    lineage_reference_hashes: [],
    quorum_hash: status.status_hash,
    deterministic_hash: status.decision_hash,
  }));
}

function capacityWeight(
  specialization: ReplayCoordinationMeshNode["specialization"],
  trustScore: number,
): number {
  const base = specialization === "orchestration" ? 1.25 : specialization === "governance" ? 1.15 : 1;
  return roundMeshNumber(base + (trustScore / 100));
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function roundMeshNumber(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function computeReplayCoordinationMeshHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableReplayCoordinationMeshStringify(value))
    .digest("hex");
}

function stableReplayCoordinationMeshStringify(value: unknown): string {
  return JSON.stringify(sortReplayCoordinationMeshKeys(value));
}

function sortReplayCoordinationMeshKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortReplayCoordinationMeshKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortReplayCoordinationMeshKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (typeof value === "undefined") return null;
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) {
      deepFreeze(item);
    }
  }

  return value;
}
