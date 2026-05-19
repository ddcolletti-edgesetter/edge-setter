import type {
  ReplayConsensusIntelligenceAction,
  ReplayConsensusIntelligenceSnapshot,
} from "./replay-consensus-intelligence-contract";
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

export type ReplayEvolutionState =
  | "adapting"
  | "evolving"
  | "stabilized"
  | "divergent"
  | "deprecated"
  | "promoted";

export type ReplayEvolutionAction =
  | "evolve_strategy"
  | "mutate_weighting"
  | "promote_generation"
  | "deprecate_branch"
  | "reconcile_mutation"
  | "optimize_survivability"
  | "freeze_evolution_epoch"
  | "promote_adaptive_cycle";

export type ReplayEvolutionQuery =
  | "get_replay_evolution_history"
  | "get_adaptive_generation_history"
  | "get_mutation_lineage"
  | "get_survivability_optimization_history"
  | "get_validator_evolution_profiles"
  | "get_evolution_epoch_history"
  | "get_adaptive_convergence_history";

export interface ReplayEvolutionInput {
  readonly run_id: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly consensus_intelligence: ReplayConsensusIntelligenceSnapshot;
  readonly memory_snapshot: ReplayMemorySnapshot;
  readonly governance_snapshot: ReplayGovernanceSnapshot;
  readonly orchestration_persistence: ReplayOrchestrationPersistenceSnapshot;
  readonly lineage_snapshot: ReplayConsensusLineageSnapshot;
  readonly self_healing_snapshot: ReplaySelfHealingSnapshot;
  readonly generation_size?: number;
  readonly promotion_threshold?: number;
  readonly survivability_floor?: number;
}

export interface ReplayAdaptiveGeneration {
  readonly generation_id: string;
  readonly run_id: string;
  readonly generation_ordinal: number;
  readonly replay_hashes: readonly string[];
  readonly strategy_hashes: readonly string[];
  readonly mutation_hashes: readonly string[];
  readonly convergence_score: number;
  readonly promoted: boolean;
  readonly state: ReplayEvolutionState;
  readonly generation_hash: string;
}

export interface ReplayStrategyEvolutionRecord {
  readonly evolution_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly generation_ordinal: number;
  readonly from_state: ReplayEvolutionState | null;
  readonly to_state: ReplayEvolutionState;
  readonly action: ReplayEvolutionAction;
  readonly intelligence_action: ReplayConsensusIntelligenceAction | null;
  readonly governance_action: ReplayGovernanceAction | null;
  readonly strategy_weight: number;
  readonly convergence_score: number;
  readonly survivability_score: number;
  readonly strategy_hash: string;
}

export interface ReplayIntelligenceMutationRecord {
  readonly mutation_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly validator_id: string;
  readonly parent_profile_hash: string;
  readonly mutation_action: ReplayEvolutionAction;
  readonly previous_weight: number;
  readonly mutated_weight: number;
  readonly mutation_delta: number;
  readonly intelligence_generation_hash: string;
  readonly lineage_reference_hashes: readonly string[];
  readonly mutation_hash: string;
}

export interface ReplaySurvivabilityOptimizationRecord {
  readonly optimization_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly before_survivability_score: number;
  readonly optimized_survivability_score: number;
  readonly optimization_delta: number;
  readonly healing_action: ReplaySelfHealingAction | null;
  readonly governance_gate: ReplayGovernanceAction | null;
  readonly optimization_action: ReplayEvolutionAction;
  readonly optimization_hash: string;
}

export interface ReplayValidatorEvolutionProfile {
  readonly profile_id: string;
  readonly run_id: string;
  readonly validator_id: string;
  readonly replay_hashes: readonly string[];
  readonly base_evolution_score: number;
  readonly mutation_count: number;
  readonly average_mutation_delta: number;
  readonly survivability_alignment: number;
  readonly governance_action: ReplayGovernanceAction | null;
  readonly promoted_generation_count: number;
  readonly profile_hash: string;
}

export interface ReplayEvolutionConvergenceRecord {
  readonly convergence_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly generation_ordinal: number;
  readonly previous_convergence_score: number;
  readonly adapted_convergence_score: number;
  readonly convergence_delta: number;
  readonly state: ReplayEvolutionState;
  readonly convergence_hash: string;
}

export interface ReplayOptimizationLineageReference {
  readonly reference_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly source_hash: string;
  readonly reference_kind:
    | "consensus_intelligence"
    | "memory"
    | "governance"
    | "orchestration_persistence"
    | "lineage_graph"
    | "self_healing";
  readonly reference_hash: string;
}

export interface ReplayEvolutionEpoch {
  readonly epoch_id: string;
  readonly run_id: string;
  readonly generation_ordinals: readonly number[];
  readonly replay_hashes: readonly string[];
  readonly evolution_hashes: readonly string[];
  readonly promoted: boolean;
  readonly frozen: boolean;
  readonly frozen_at: string;
  readonly epoch_hash: string;
}

export interface ReplayEvolutionSnapshotReference {
  readonly consensus_intelligence_hash: string;
  readonly memory_snapshot_hash: string;
  readonly governance_snapshot_hash: string;
  readonly orchestration_persistence_hash: string;
  readonly lineage_graph_hash: string;
  readonly self_healing_hash: string;
  readonly reference_hash: string;
}

export interface ReplayEvolutionQueryViews {
  readonly replay_evolution_history: readonly ReplayStrategyEvolutionRecord[];
  readonly adaptive_generation_history: readonly ReplayAdaptiveGeneration[];
  readonly mutation_lineage: readonly ReplayIntelligenceMutationRecord[];
  readonly survivability_optimization_history: readonly ReplaySurvivabilityOptimizationRecord[];
  readonly validator_evolution_profiles: readonly ReplayValidatorEvolutionProfile[];
  readonly evolution_epoch_history: readonly ReplayEvolutionEpoch[];
  readonly adaptive_convergence_history: readonly ReplayEvolutionConvergenceRecord[];
}

export interface ReplayEvolutionSnapshot {
  readonly evolution_id: string;
  readonly run_id: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly state: ReplayEvolutionState;
  readonly adaptive_generations: readonly ReplayAdaptiveGeneration[];
  readonly strategy_evolution: readonly ReplayStrategyEvolutionRecord[];
  readonly mutation_lineage: readonly ReplayIntelligenceMutationRecord[];
  readonly survivability_optimization: readonly ReplaySurvivabilityOptimizationRecord[];
  readonly validator_profiles: readonly ReplayValidatorEvolutionProfile[];
  readonly convergence_history: readonly ReplayEvolutionConvergenceRecord[];
  readonly lineage: readonly ReplayOptimizationLineageReference[];
  readonly epochs: readonly ReplayEvolutionEpoch[];
  readonly snapshots: ReplayEvolutionSnapshotReference;
  readonly supported_actions: readonly ReplayEvolutionAction[];
  readonly supported_queries: readonly ReplayEvolutionQuery[];
  readonly query_views: ReplayEvolutionQueryViews;
  readonly deterministic_hash: string;
}
