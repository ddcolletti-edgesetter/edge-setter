import type {
  ReplayCoordinationMeshAction,
  ReplayCoordinationMeshResult,
  ReplayCoordinationMeshState,
} from "./replay-coordination-mesh-contract";
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

export type ReplayMemoryState =
  | "active"
  | "archived"
  | "stabilized"
  | "quarantined"
  | "deprecated"
  | "reconciled";

export type ReplayMemoryAction =
  | "persist_temporal_state"
  | "archive_branch_history"
  | "record_divergence_evolution"
  | "record_validator_behavior"
  | "record_recovery_effectiveness"
  | "promote_historical_branch"
  | "reconcile_memory_segment"
  | "freeze_replay_epoch";

export type ReplayMemoryQuery =
  | "get_replay_evolution_history"
  | "get_validator_behavioral_history"
  | "get_divergence_evolution_timeline"
  | "get_recovery_effectiveness_history"
  | "get_governance_decision_history"
  | "get_replay_epoch_history"
  | "get_branch_temporal_ancestry";

export interface ReplayMemoryInput {
  readonly run_id: string;
  readonly generated_at: string;
  readonly mesh_snapshots: readonly ReplayCoordinationMeshResult[];
  readonly governance_snapshot: ReplayGovernanceSnapshot;
  readonly orchestration_persistence: ReplayOrchestrationPersistenceSnapshot;
  readonly lineage_snapshot: ReplayConsensusLineageSnapshot;
  readonly epoch_size?: number;
  readonly retention_horizon?: number;
}

export interface ReplayTemporalIndex {
  readonly index_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly temporal_ordinal: number;
  readonly epoch_id: string;
  readonly mesh_hash: string;
  readonly governance_decision_hash: string | null;
  readonly lineage_reference_hashes: readonly string[];
  readonly persistence_record_hashes: readonly string[];
  readonly temporal_hash: string;
}

export interface ReplayEvolutionMemory {
  readonly evolution_id: string;
  readonly replay_hash: string;
  readonly from_state: ReplayMemoryState | null;
  readonly to_state: ReplayMemoryState;
  readonly mesh_state: ReplayCoordinationMeshState;
  readonly coordination_action: ReplayCoordinationMeshAction | null;
  readonly temporal_ordinal: number;
  readonly lineage_reference_count: number;
  readonly evolution_hash: string;
}

export interface ReplayDivergenceEvolutionMemory {
  readonly divergence_id: string;
  readonly replay_hash: string;
  readonly temporal_ordinal: number;
  readonly divergence_score: number;
  readonly partition_count: number;
  readonly failover_count: number;
  readonly quorum_met: boolean;
  readonly divergence_reason: string;
  readonly divergence_hash: string;
}

export interface ReplayValidatorBehaviorMemory {
  readonly behavior_id: string;
  readonly validator_id: string;
  readonly replay_hash: string;
  readonly temporal_ordinal: number;
  readonly participation_count: number;
  readonly divergence_count: number;
  readonly average_confidence: number;
  readonly trust_score: number;
  readonly recommended_governance_action: ReplayGovernanceAction | null;
  readonly behavior_hash: string;
}

export interface ReplayRecoveryEffectivenessMemory {
  readonly effectiveness_id: string;
  readonly replay_hash: string;
  readonly temporal_ordinal: number;
  readonly recovery_route_count: number;
  readonly failover_count: number;
  readonly partition_reconciled: boolean;
  readonly effectiveness_score: number;
  readonly recovery_hash: string;
}

export interface ReplayGovernanceDecisionMemory {
  readonly memory_id: string;
  readonly replay_hash: string;
  readonly temporal_ordinal: number;
  readonly action: ReplayGovernanceAction;
  readonly state: ReplayGovernanceState;
  readonly decision_hash: string;
  readonly lineage_reference_hashes: readonly string[];
  readonly memory_hash: string;
}

export interface ReplayBranchTemporalAncestry {
  readonly ancestry_id: string;
  readonly replay_hash: string;
  readonly parent_replay_hash: string | null;
  readonly temporal_ordinals: readonly number[];
  readonly lineage_hashes: readonly string[];
  readonly branch_state_hashes: readonly string[];
  readonly ancestry_hash: string;
}

export interface ReplayEpochMemory {
  readonly epoch_id: string;
  readonly run_id: string;
  readonly epoch_ordinal: number;
  readonly replay_hashes: readonly string[];
  readonly temporal_index_hashes: readonly string[];
  readonly frozen: boolean;
  readonly frozen_at: string;
  readonly epoch_hash: string;
}

export interface ReplayMemorySnapshotReference {
  readonly coordination_mesh_hashes: readonly string[];
  readonly governance_snapshot_hash: string;
  readonly orchestration_persistence_hash: string;
  readonly lineage_graph_hash: string;
  readonly reference_hash: string;
}

export interface ReplayMemoryQueryViews {
  readonly replay_evolution_history: readonly ReplayEvolutionMemory[];
  readonly validator_behavioral_history: readonly ReplayValidatorBehaviorMemory[];
  readonly divergence_evolution_timeline: readonly ReplayDivergenceEvolutionMemory[];
  readonly recovery_effectiveness_history: readonly ReplayRecoveryEffectivenessMemory[];
  readonly governance_decision_history: readonly ReplayGovernanceDecisionMemory[];
  readonly replay_epoch_history: readonly ReplayEpochMemory[];
  readonly branch_temporal_ancestry: readonly ReplayBranchTemporalAncestry[];
}

export interface ReplayMemorySnapshot {
  readonly memory_id: string;
  readonly run_id: string;
  readonly generated_at: string;
  readonly state: ReplayMemoryState;
  readonly temporal_indexes: readonly ReplayTemporalIndex[];
  readonly replay_evolution: readonly ReplayEvolutionMemory[];
  readonly divergence_evolution: readonly ReplayDivergenceEvolutionMemory[];
  readonly validator_behavior: readonly ReplayValidatorBehaviorMemory[];
  readonly recovery_effectiveness: readonly ReplayRecoveryEffectivenessMemory[];
  readonly governance_decisions: readonly ReplayGovernanceDecisionMemory[];
  readonly branch_ancestry: readonly ReplayBranchTemporalAncestry[];
  readonly epochs: readonly ReplayEpochMemory[];
  readonly snapshots: ReplayMemorySnapshotReference;
  readonly supported_actions: readonly ReplayMemoryAction[];
  readonly supported_queries: readonly ReplayMemoryQuery[];
  readonly deterministic_hash: string;
}
