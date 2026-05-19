/**
 * @deprecated Experimental product-drift compatibility layer.
 * Prefer validator cluster selection, validator cohort reliability, and live runtime eligibility names for new work.
 */
import type {
  ReplayHistoricalAutonomousCivilizationSnapshot,
} from "./replay-historical-autonomous-civilization-contract";

export type ReplayCivilizationMetaSelectionState =
  | "scoring"
  | "ranking"
  | "forecasting"
  | "gating"
  | "promoting"
  | "watchlisted"
  | "rejected";

export type ReplayCivilizationMetaSelectionAction =
  | "score_civilization_fitness"
  | "analyze_dynasty_survivability"
  | "benchmark_corruption_resistance"
  | "predict_extinction"
  | "forecast_governance_stability"
  | "weight_trait_inheritance"
  | "analyze_trait_mutation"
  | "advance_lifecycle_state"
  | "score_recursive_promotion"
  | "gate_live_runtime_eligibility"
  | "analyze_adversarial_consensus_durability"
  | "compare_multi_era_civilizations"
  | "persist_civilization_reputation"
  | "track_species_evolution"
  | "rank_civilization_intelligence";

export type ReplayCivilizationMetaSelectionQuery =
  | "get_civilization_fitness_scores"
  | "get_dynasty_survivability_analytics"
  | "get_corruption_resistance_benchmarks"
  | "get_extinction_predictions"
  | "get_governance_stability_forecasts"
  | "get_trait_inheritance_weights"
  | "get_trait_mutation_analytics"
  | "get_lifecycle_state_machine"
  | "get_recursive_promotion_scores"
  | "get_live_runtime_eligibility_gates"
  | "get_adversarial_consensus_durability"
  | "get_multi_era_civilization_comparison"
  | "get_civilization_reputation"
  | "get_species_evolution_tracking"
  | "get_civilization_intelligence_rankings";

export interface ReplayCivilizationMetaSelectionInput {
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly civilization_snapshots: readonly ReplayHistoricalAutonomousCivilizationSnapshot[];
  readonly promotion_threshold?: number;
  readonly extinction_threshold?: number;
  readonly era_label?: string;
}

export interface ReplayCivilizationFitnessScore {
  readonly fitness_id: string;
  readonly civilization_id: string;
  readonly league: string;
  readonly era_label: string;
  readonly base_fitness: number;
  readonly dynasty_component: number;
  readonly cooperation_component: number;
  readonly durability_component: number;
  readonly fitness_score: number;
  readonly fitness_hash: string;
}

export interface ReplayDynastySurvivabilityAnalytic {
  readonly analytic_id: string;
  readonly civilization_id: string;
  readonly league: string;
  readonly dynasty_score: number;
  readonly recovery_score: number;
  readonly swarm_score: number;
  readonly survivability_index: number;
  readonly analytic_hash: string;
}

export interface ReplayCorruptionResistanceBenchmark {
  readonly benchmark_id: string;
  readonly civilization_id: string;
  readonly league: string;
  readonly average_corruption_risk: number;
  readonly containment_score: number;
  readonly resistance_score: number;
  readonly benchmark_hash: string;
}

export interface ReplayExtinctionPrediction {
  readonly prediction_id: string;
  readonly civilization_id: string;
  readonly league: string;
  readonly collapse_risk: number;
  readonly corruption_pressure: number;
  readonly extinction_probability: number;
  readonly prediction_hash: string;
}

export interface ReplayGovernanceStabilityForecast {
  readonly forecast_id: string;
  readonly civilization_id: string;
  readonly league: string;
  readonly ideology_stability: number;
  readonly fracture_risk: number;
  readonly forecast_stability: number;
  readonly forecast_hash: string;
}

export interface ReplayValidatorTraitInheritanceWeight {
  readonly weight_id: string;
  readonly civilization_id: string;
  readonly league: string;
  readonly trait: string;
  readonly inheritance_weight: number;
  readonly lineage_support: number;
  readonly weight_hash: string;
}

export interface ReplayEvolutionaryTraitMutationAnalytic {
  readonly mutation_id: string;
  readonly civilization_id: string;
  readonly league: string;
  readonly species_name: string;
  readonly divergence_score: number;
  readonly mutation_pressure: number;
  readonly mutation_hash: string;
}

export interface ReplayCivilizationLifecycleStateRecord {
  readonly lifecycle_id: string;
  readonly civilization_id: string;
  readonly league: string;
  readonly lifecycle_state: "emerging" | "expanding" | "stable" | "stressed" | "collapsing" | "promotable";
  readonly state_score: number;
  readonly transition_hash: string;
}

export interface ReplayRecursiveCivilizationPromotionScore {
  readonly promotion_id: string;
  readonly civilization_id: string;
  readonly league: string;
  readonly prior_gate_score: number;
  readonly recursive_depth: number;
  readonly recursive_promotion_score: number;
  readonly promotion_hash: string;
}

export interface ReplayLiveRuntimeCivilizationEligibilityGate {
  readonly eligibility_id: string;
  readonly civilization_id: string;
  readonly league: string;
  readonly eligible: boolean;
  readonly eligibility_score: number;
  readonly gate_reason: string;
  readonly eligibility_hash: string;
}

export interface ReplayAdversarialConsensusDurabilityAnalytic {
  readonly durability_id: string;
  readonly civilization_id: string;
  readonly league: string;
  readonly warfare_resilience: number;
  readonly diplomacy_resilience: number;
  readonly adversarial_durability_score: number;
  readonly durability_hash: string;
}

export interface ReplayMultiEraCivilizationComparison {
  readonly comparison_id: string;
  readonly league: string;
  readonly era_label: string;
  readonly civilization_count: number;
  readonly leading_civilization_id: string;
  readonly era_strength_score: number;
  readonly comparison_hash: string;
}

export interface ReplayCivilizationReputationRecord {
  readonly reputation_id: string;
  readonly civilization_id: string;
  readonly league: string;
  readonly reputation_score: number;
  readonly reputation_tier: "legendary" | "elite" | "viable" | "watchlist" | "rejected";
  readonly reputation_hash: string;
}

export interface ReplayLongHorizonSpeciesEvolutionTrack {
  readonly species_track_id: string;
  readonly civilization_id: string;
  readonly league: string;
  readonly species_name: string;
  readonly ancestor_hash: string;
  readonly evolution_score: number;
  readonly species_track_hash: string;
}

export interface ReplayCivilizationIntelligenceRanking {
  readonly ranking_id: string;
  readonly civilization_id: string;
  readonly league: string;
  readonly rank: number;
  readonly ranking_score: number;
  readonly promoted: boolean;
  readonly ranking_hash: string;
}

export interface ReplayCivilizationMetaSelectionLineage {
  readonly lineage_id: string;
  readonly civilization_id: string;
  readonly league: string | null;
  readonly lineage_kind:
    | "civilization"
    | "fitness"
    | "dynasty"
    | "corruption"
    | "extinction"
    | "governance"
    | "trait"
    | "mutation"
    | "lifecycle"
    | "promotion"
    | "eligibility"
    | "durability"
    | "comparison"
    | "reputation"
    | "species"
    | "ranking";
  readonly source_hash: string;
  readonly target_hash: string;
  readonly lineage_hash: string;
}

export interface ReplayCivilizationMetaSelectionSnapshot {
  readonly meta_selection_id: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly state: ReplayCivilizationMetaSelectionState;
  readonly civilization_ids: readonly string[];
  readonly fitness_scores: readonly ReplayCivilizationFitnessScore[];
  readonly dynasty_survivability: readonly ReplayDynastySurvivabilityAnalytic[];
  readonly corruption_resistance: readonly ReplayCorruptionResistanceBenchmark[];
  readonly extinction_predictions: readonly ReplayExtinctionPrediction[];
  readonly governance_forecasts: readonly ReplayGovernanceStabilityForecast[];
  readonly trait_inheritance: readonly ReplayValidatorTraitInheritanceWeight[];
  readonly trait_mutations: readonly ReplayEvolutionaryTraitMutationAnalytic[];
  readonly lifecycle_states: readonly ReplayCivilizationLifecycleStateRecord[];
  readonly recursive_promotion: readonly ReplayRecursiveCivilizationPromotionScore[];
  readonly eligibility_gates: readonly ReplayLiveRuntimeCivilizationEligibilityGate[];
  readonly adversarial_durability: readonly ReplayAdversarialConsensusDurabilityAnalytic[];
  readonly multi_era_comparison: readonly ReplayMultiEraCivilizationComparison[];
  readonly civilization_reputation: readonly ReplayCivilizationReputationRecord[];
  readonly species_evolution: readonly ReplayLongHorizonSpeciesEvolutionTrack[];
  readonly intelligence_rankings: readonly ReplayCivilizationIntelligenceRanking[];
  readonly meta_selection_lineage: readonly ReplayCivilizationMetaSelectionLineage[];
  readonly supported_actions: readonly ReplayCivilizationMetaSelectionAction[];
  readonly supported_queries: readonly ReplayCivilizationMetaSelectionQuery[];
  readonly deterministic_hash: string;
}
