import type {
  ReplayAgentAction,
  ReplayAgentSnapshot,
  ReplayAgentSpecialization,
  ReplayAgentState,
} from "./replay-agent-contract";
import type {
  ReplayConsensusLineageSnapshot,
} from "./replay-consensus-lineage-contract";
import type {
  ReplayGovernanceAction,
  ReplayGovernanceSnapshot,
  ReplayGovernanceState,
} from "./replay-governance-contract";
import type {
  ReplayOrchestrationPersistenceSnapshot,
} from "./replay-orchestration-persistence-contract";

export type ReplayCoordinationMeshState =
  | "synchronizing"
  | "coordinated"
  | "degraded"
  | "partitioned"
  | "recovering"
  | "stabilized";

export type ReplayCoordinationMeshAction =
  | "allocate_validation"
  | "allocate_arbitration"
  | "allocate_recovery"
  | "relay_consensus"
  | "reconcile_partition"
  | "reroute_coordination"
  | "promote_mesh_branch"
  | "quarantine_mesh_segment";

export type ReplayCoordinationMeshQuery =
  | "get_coordination_topology"
  | "get_active_coordination_sessions"
  | "get_mesh_lineage"
  | "get_workload_distribution"
  | "get_coordination_recovery_history"
  | "get_partition_history";

export interface ReplayCoordinationFederatedNode {
  readonly node_id: string;
  readonly federation_group: string;
  readonly capacity_weight: number;
  readonly failure_domain: string;
  readonly accepts_remote_relay: boolean;
}

export interface ReplayCoordinationMeshInput {
  readonly run_id: string;
  readonly generated_at: string;
  readonly agent_snapshot: ReplayAgentSnapshot;
  readonly governance_snapshot: ReplayGovernanceSnapshot;
  readonly orchestration_persistence: ReplayOrchestrationPersistenceSnapshot;
  readonly lineage_snapshot: ReplayConsensusLineageSnapshot;
  readonly federated_nodes?: readonly ReplayCoordinationFederatedNode[];
  readonly failed_agent_ids?: readonly string[];
  readonly partitioned_agent_ids?: readonly string[];
  readonly quorum_threshold?: number;
  readonly balancing_tolerance?: number;
}

export interface ReplayCoordinationMeshNode {
  readonly mesh_node_id: string;
  readonly agent_id: string;
  readonly run_id: string;
  readonly node_id: string;
  readonly federation_group: string;
  readonly failure_domain: string;
  readonly specialization: ReplayAgentSpecialization;
  readonly state: ReplayAgentState;
  readonly trust_score: number;
  readonly capacity_weight: number;
  readonly distributed_node_compatible: boolean;
  readonly governance_action: ReplayGovernanceAction | null;
  readonly governance_state: ReplayGovernanceState | null;
  readonly capability_hash: string;
  readonly node_hash: string;
}

export interface ReplayCoordinationMeshEdge {
  readonly edge_id: string;
  readonly from_mesh_node_id: string;
  readonly to_mesh_node_id: string;
  readonly action: ReplayCoordinationMeshAction;
  readonly route_weight: number;
  readonly relay_contract_hash: string;
  readonly edge_hash: string;
}

export interface ReplayCoordinationTopology {
  readonly topology_id: string;
  readonly run_id: string;
  readonly node_count: number;
  readonly edge_count: number;
  readonly federation_ready: boolean;
  readonly nodes: readonly ReplayCoordinationMeshNode[];
  readonly edges: readonly ReplayCoordinationMeshEdge[];
  readonly topology_hash: string;
}

export interface ReplayCoordinationRoute {
  readonly route_id: string;
  readonly replay_hash: string;
  readonly action: ReplayCoordinationMeshAction;
  readonly primary_mesh_node_id: string;
  readonly relay_mesh_node_ids: readonly string[];
  readonly route_path: readonly string[];
  readonly recovery_route_path: readonly string[];
  readonly routing_reason: string;
  readonly route_hash: string;
}

export interface ReplayCoordinationRelayContract {
  readonly relay_id: string;
  readonly session_id: string;
  readonly replay_hash: string;
  readonly from_agent_id: string;
  readonly to_agent_id: string;
  readonly action: ReplayCoordinationMeshAction;
  readonly replay_safe_payload_hash: string;
  readonly governance_decision_hash: string | null;
  readonly lineage_reference_hashes: readonly string[];
  readonly relay_hash: string;
}

export interface ReplayCoordinationWorkloadAllocation {
  readonly allocation_id: string;
  readonly replay_hash: string;
  readonly action: ReplayCoordinationMeshAction;
  readonly mesh_node_id: string;
  readonly assigned_weight: number;
  readonly load_units: number;
  readonly allocation_hash: string;
}

export interface ReplayCoordinationBalancingSummary {
  readonly balance_id: string;
  readonly total_load_units: number;
  readonly min_node_load: number;
  readonly max_node_load: number;
  readonly average_node_load: number;
  readonly imbalance_ratio: number;
  readonly tolerance: number;
  readonly balanced: boolean;
  readonly balance_hash: string;
}

export interface ReplayCoordinationQuorum {
  readonly quorum_id: string;
  readonly replay_hash: string;
  readonly session_id: string;
  readonly required_ratio: number;
  readonly participating_weight: number;
  readonly total_weight: number;
  readonly quorum_ratio: number;
  readonly quorum_met: boolean;
  readonly quorum_hash: string;
}

export interface ReplayCoordinationSession {
  readonly session_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly action: ReplayCoordinationMeshAction;
  readonly state: ReplayCoordinationMeshState;
  readonly governance_action: ReplayGovernanceAction | null;
  readonly governance_state: ReplayGovernanceState | null;
  readonly route: ReplayCoordinationRoute;
  readonly quorum: ReplayCoordinationQuorum;
  readonly relay_contract_hashes: readonly string[];
  readonly workload_allocation_hashes: readonly string[];
  readonly lineage_reference_hashes: readonly string[];
  readonly persistence_record_hashes: readonly string[];
  readonly session_hash: string;
}

export interface ReplayCoordinationRecoveryRoute {
  readonly recovery_id: string;
  readonly replay_hash: string;
  readonly from_mesh_node_id: string;
  readonly to_mesh_node_id: string;
  readonly action: ReplayCoordinationMeshAction;
  readonly reason: string;
  readonly recovery_path: readonly string[];
  readonly recovery_hash: string;
}

export interface ReplayCoordinationPartitionRecord {
  readonly partition_id: string;
  readonly replay_hash: string;
  readonly affected_mesh_node_ids: readonly string[];
  readonly reconciliation_action: ReplayCoordinationMeshAction;
  readonly recovered_by_session_id: string | null;
  readonly partition_hash: string;
}

export interface ReplayCoordinationFailoverRecord {
  readonly failover_id: string;
  readonly replay_hash: string;
  readonly failed_mesh_node_id: string;
  readonly promoted_mesh_node_id: string;
  readonly session_id: string;
  readonly failover_hash: string;
}

export interface ReplayCoordinationLineageReference {
  readonly reference_id: string;
  readonly replay_hash: string;
  readonly lineage_hash: string;
  readonly source_hash: string;
  readonly reference_kind: "lineage_graph" | "governance" | "agent" | "orchestration_persistence";
  readonly reference_hash: string;
}

export interface ReplayCoordinationSnapshotReference {
  readonly agent_snapshot_hash: string;
  readonly governance_snapshot_hash: string;
  readonly orchestration_persistence_hash: string;
  readonly lineage_graph_hash: string;
  readonly reference_hash: string;
}

export interface ReplayCoordinationMeshQueryViews {
  readonly coordination_topology: ReplayCoordinationTopology;
  readonly active_coordination_sessions: readonly ReplayCoordinationSession[];
  readonly mesh_lineage: readonly ReplayCoordinationLineageReference[];
  readonly workload_distribution: readonly ReplayCoordinationWorkloadAllocation[];
  readonly coordination_recovery_history: readonly ReplayCoordinationRecoveryRoute[];
  readonly partition_history: readonly ReplayCoordinationPartitionRecord[];
}

export interface ReplayCoordinationMeshResult {
  readonly mesh_id: string;
  readonly run_id: string;
  readonly generated_at: string;
  readonly state: ReplayCoordinationMeshState;
  readonly topology: ReplayCoordinationTopology;
  readonly sessions: readonly ReplayCoordinationSession[];
  readonly relay_contracts: readonly ReplayCoordinationRelayContract[];
  readonly workload_allocations: readonly ReplayCoordinationWorkloadAllocation[];
  readonly balancing: ReplayCoordinationBalancingSummary;
  readonly recovery_routes: readonly ReplayCoordinationRecoveryRoute[];
  readonly failover: readonly ReplayCoordinationFailoverRecord[];
  readonly partitions: readonly ReplayCoordinationPartitionRecord[];
  readonly lineage: readonly ReplayCoordinationLineageReference[];
  readonly snapshots: ReplayCoordinationSnapshotReference;
  readonly supported_queries: readonly ReplayCoordinationMeshQuery[];
  readonly deterministic_hash: string;
}

export type ReplayCoordinationAgentActionBridge = Readonly<Record<
  ReplayCoordinationMeshAction,
  readonly ReplayAgentAction[]
>>;
