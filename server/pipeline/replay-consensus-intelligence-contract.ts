import type {
  ReplayCoordinationMeshResult,
} from "./replay-coordination-mesh-contract";
import type {
  ReplayConsensusLineageSnapshot,
} from "./replay-consensus-lineage-contract";
import type {
  ReplayGovernanceAction,
  ReplayGovernanceSnapshot,
} from "./replay-governance-contract";
import type {
  ReplayMemorySnapshot,
} from "./replay-memory-contract";
import type {
  ReplayOrchestrationPersistenceSnapshot,
} from "./replay-orchestration-persistence-contract";
import type {
  ReplaySelfHealingAction,
  ReplaySelfHealingSnapshot,
} from "./replay-self-healing-contract";

export type ReplayConsensusIntelligenceState =
  | "synthesizing"
  | "converging"
  | "stabilized"
  | "divergent"
  | "degraded"
  | "reconciled";

export type ReplayConsensusIntelligenceAction =
  | "synthesize_consensus"
  | "rebalance_validator_weight"
  | "propagate_intelligence"
  | "reconcile_divergence"
  | "promote_intelligence_epoch"
  | "quarantine_intelligence_branch"
  | "forecast_survivability"
  | "freeze_intelligence_epoch";

export type ReplayConsensusIntelligenceQuery =
  | "get_intelligence_convergence_history"
  | "get_validator_intelligence_profile"
  | "get_survivability_forecasts"
  | "get_intelligence_lineage"
  | "get_convergence_evolution_history"
  | "get_intelligence_quorum_history"
  | "get_distributed_intelligence_epochs";

export interface ReplayConsensusIntelligenceInput {
  readonly run_id: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly self_healing_snapshot: ReplaySelfHealingSnapshot;
  readonly coordination_mesh: ReplayCoordinationMeshResult;
  readonly governance_snapshot: ReplayGovernanceSnapshot;
  readonly orchestration_persistence: ReplayOrchestrationPersistenceSnapshot;
  readonly lineage_snapshot: ReplayConsensusLineageSnapshot;
  readonly memory_snapshot: ReplayMemorySnapshot;
  readonly quorum_threshold?: number;
  readonly promotion_threshold?: number;
  readonly survivability_floor?: number;
}

export interface ReplayValidatorIntelligenceProfile {
  readonly profile_id: string;
  readonly run_id: string;
  readonly validator_id: string;
  readonly replay_hashes: readonly string[];
  readonly base_trust_score: number;
  readonly adaptive_weight: number;
  readonly evolution_score: number;
  readonly divergence_penalty: number;
  readonly survivability_alignment: number;
  readonly recommended_action: ReplayConsensusIntelligenceAction;
  readonly governance_action: ReplayGovernanceAction | null;
  readonly profile_hash: string;
}

export interface ReplayConsensusIntelligenceSynthesis {
  readonly synthesis_id: string;
  readonly replay_hash: string;
  readonly state: ReplayConsensusIntelligenceState;
  readonly action: ReplayConsensusIntelligenceAction;
  readonly validator_profile_hashes: readonly string[];
  readonly synthesized_confidence: number;
  readonly convergence_score: number;
  readonly quorum_met: boolean;
  readonly synthesis_hash: string;
}

export interface ReplayIntelligenceConvergenceRecord {
  readonly convergence_id: string;
  readonly replay_hash: string;
  readonly from_state: ReplayConsensusIntelligenceState | null;
  readonly to_state: ReplayConsensusIntelligenceState;
  readonly convergence_score: number;
  readonly evolution_delta: number;
  readonly source_healing_action: ReplaySelfHealingAction | null;
  readonly convergence_hash: string;
}

export interface ReplayIntelligenceQuorumRecord {
  readonly quorum_id: string;
  readonly replay_hash: string;
  readonly required_ratio: number;
  readonly participating_weight: number;
  readonly total_weight: number;
  readonly quorum_ratio: number;
  readonly quorum_met: boolean;
  readonly mesh_session_hash: string | null;
  readonly quorum_hash: string;
}

export interface ReplayIntelligenceSurvivabilityForecast {
  readonly forecast_id: string;
  readonly replay_hash: string;
  readonly survivability_score: number;
  readonly convergence_score: number;
  readonly degradation_risk: number;
  readonly forecast_horizon: "next_epoch" | "multi_epoch";
  readonly recommended_action: ReplayConsensusIntelligenceAction;
  readonly forecast_hash: string;
}

export interface ReplayIntelligencePropagationRecord {
  readonly propagation_id: string;
  readonly replay_hash: string;
  readonly from_mesh_node_id: string | null;
  readonly to_mesh_node_ids: readonly string[];
  readonly propagated_hash: string;
  readonly deterministic_order: readonly string[];
  readonly propagation_hash: string;
}

export interface ReplayIntelligenceLineageReference {
  readonly reference_id: string;
  readonly replay_hash: string;
  readonly source_hash: string;
  readonly reference_kind:
    | "self_healing"
    | "coordination_mesh"
    | "governance"
    | "orchestration_persistence"
    | "lineage_graph"
    | "memory";
  readonly reference_hash: string;
}

export interface ReplayIntelligenceEpoch {
  readonly epoch_id: string;
  readonly run_id: string;
  readonly replay_hashes: readonly string[];
  readonly synthesis_hashes: readonly string[];
  readonly promoted: boolean;
  readonly frozen: boolean;
  readonly promoted_at: string | null;
  readonly frozen_at: string;
  readonly epoch_hash: string;
}

export interface ReplayConsensusIntelligenceSnapshotReference {
  readonly self_healing_hash: string;
  readonly coordination_mesh_hash: string;
  readonly governance_snapshot_hash: string;
  readonly orchestration_persistence_hash: string;
  readonly lineage_graph_hash: string;
  readonly memory_snapshot_hash: string;
  readonly reference_hash: string;
}

export interface ReplayConsensusIntelligenceSnapshot {
  readonly intelligence_id: string;
  readonly run_id: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly state: ReplayConsensusIntelligenceState;
  readonly validator_profiles: readonly ReplayValidatorIntelligenceProfile[];
  readonly synthesis: readonly ReplayConsensusIntelligenceSynthesis[];
  readonly convergence_history: readonly ReplayIntelligenceConvergenceRecord[];
  readonly convergence_evolution: readonly ReplayIntelligenceConvergenceRecord[];
  readonly quorum_history: readonly ReplayIntelligenceQuorumRecord[];
  readonly survivability_forecasts: readonly ReplayIntelligenceSurvivabilityForecast[];
  readonly propagation: readonly ReplayIntelligencePropagationRecord[];
  readonly lineage: readonly ReplayIntelligenceLineageReference[];
  readonly epochs: readonly ReplayIntelligenceEpoch[];
  readonly snapshots: ReplayConsensusIntelligenceSnapshotReference;
  readonly supported_actions: readonly ReplayConsensusIntelligenceAction[];
  readonly supported_queries: readonly ReplayConsensusIntelligenceQuery[];
  readonly deterministic_hash: string;
}
