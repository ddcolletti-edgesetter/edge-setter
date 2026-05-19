import type {
  ReplayGovernanceAction,
  ReplayGovernanceState,
} from "./replay-governance-contract";

export type ReplayAgentState =
  | "initializing"
  | "active"
  | "quarantined"
  | "degraded"
  | "recovering"
  | "revoked";

export type ReplayAgentAction =
  | "validate_replay"
  | "arbitrate_replay"
  | "coordinate_recovery"
  | "evaluate_governance"
  | "reconstruct_branch"
  | "reconcile_divergence"
  | "promote_branch"
  | "quarantine_branch";

export type ReplayAgentSpecialization =
  | "validator"
  | "recovery"
  | "arbitration"
  | "orchestration"
  | "governance";

export interface ReplayAgentCapabilityDeclaration {
  readonly capability_id: string;
  readonly specialization: ReplayAgentSpecialization;
  readonly actions: readonly ReplayAgentAction[];
  readonly replay_scopes: readonly string[];
  readonly distributed_node_compatible: boolean;
  readonly capability_hash: string;
}

export interface ReplayAgentDefinition {
  readonly agent_seed: string;
  readonly specialization: ReplayAgentSpecialization;
  readonly declared_actions: readonly ReplayAgentAction[];
  readonly replay_scopes?: readonly string[];
  readonly validator_id?: string | null;
  readonly node_id?: string | null;
}

export interface ReplayAgentInput {
  readonly run_id: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly node_id?: string;
  readonly agents?: readonly ReplayAgentDefinition[];
}

export interface ReplayAgentIdentity {
  readonly agent_id: string;
  readonly run_id: string;
  readonly node_id: string;
  readonly specialization: ReplayAgentSpecialization;
  readonly validator_id: string | null;
  readonly identity_seed_hash: string;
  readonly public_identity_hash: string;
  readonly deterministic_hash: string;
}

export interface ReplayAgentTrustProfile {
  readonly profile_id: string;
  readonly agent_id: string;
  readonly run_id: string;
  readonly validator_id: string | null;
  readonly governance_trust_score: number | null;
  readonly agent_trust_score: number;
  readonly state: ReplayAgentState;
  readonly recommended_governance_action: ReplayGovernanceAction | null;
  readonly profile_hash: string;
}

export interface ReplayAgentLifecycleTransition {
  readonly transition_id: string;
  readonly agent_id: string;
  readonly run_id: string;
  readonly replay_hash: string | null;
  readonly from_state: ReplayAgentState;
  readonly to_state: ReplayAgentState;
  readonly action: ReplayAgentAction | null;
  readonly governance_state: ReplayGovernanceState | null;
  readonly governance_decision_hash: string | null;
  readonly reason: string;
  readonly generated_at: string;
  readonly transition_hash: string;
}

export interface ReplayInterAgentMessage {
  readonly message_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly from_agent_id: string;
  readonly to_agent_id: string;
  readonly action: ReplayAgentAction;
  readonly payload_hash: string;
  readonly governance_decision_hash: string;
  readonly lineage_reference_hashes: readonly string[];
  readonly generated_at: string;
  readonly message_hash: string;
}

export interface ReplayAgentLineageReference {
  readonly reference_id: string;
  readonly agent_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly source_lineage_hash: string;
  readonly source_reference_hash: string;
  readonly reference_kind: "governance" | "consensus_graph" | "agent_coordination";
  readonly generated_at: string;
  readonly reference_hash: string;
}

export interface ReplayAgentCapabilityGraphNode {
  readonly node_id: string;
  readonly agent_id: string;
  readonly specialization: ReplayAgentSpecialization;
  readonly capability_hash: string;
  readonly state: ReplayAgentState;
  readonly node_hash: string;
}

export interface ReplayAgentCapabilityGraphEdge {
  readonly edge_id: string;
  readonly from_agent_id: string;
  readonly to_agent_id: string;
  readonly action: ReplayAgentAction;
  readonly replay_hash: string;
  readonly edge_hash: string;
}

export interface ReplayAgentCapabilityGraph {
  readonly run_id: string;
  readonly nodes: readonly ReplayAgentCapabilityGraphNode[];
  readonly edges: readonly ReplayAgentCapabilityGraphEdge[];
  readonly graph_hash: string;
}

export interface ReplayAgentCoordinationRecord {
  readonly coordination_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly governance_action: ReplayGovernanceAction;
  readonly agent_action: ReplayAgentAction;
  readonly state: ReplayAgentState;
  readonly assigned_agent_ids: readonly string[];
  readonly governance_decision_hash: string;
  readonly message_hashes: readonly string[];
  readonly lineage_reference_hashes: readonly string[];
  readonly generated_at: string;
  readonly coordination_hash: string;
}

export interface ReplayAgentSnapshot {
  readonly snapshot_id: string;
  readonly run_id: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly governance_snapshot_hash: string;
  readonly lineage_graph_hash: string;
  readonly identities: readonly ReplayAgentIdentity[];
  readonly capabilities: readonly ReplayAgentCapabilityDeclaration[];
  readonly trust_profiles: readonly ReplayAgentTrustProfile[];
  readonly lifecycle: readonly ReplayAgentLifecycleTransition[];
  readonly messages: readonly ReplayInterAgentMessage[];
  readonly lineage_references: readonly ReplayAgentLineageReference[];
  readonly capability_graph: ReplayAgentCapabilityGraph;
  readonly coordination_history: readonly ReplayAgentCoordinationRecord[];
  readonly deterministic_hash: string;
}
