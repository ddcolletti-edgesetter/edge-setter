import type {
  ReplayHistoricalCalibrationSnapshot,
} from "./replay-historical-calibration-contract";

export type ReplayHistoricalSimulationRuntimeState =
  | "pretraining"
  | "simulating"
  | "adversarial"
  | "reinforcing"
  | "initializing"
  | "survivable"
  | "unstable";

export type ReplayHistoricalSimulationRuntimeAction =
  | "pretrain_validators"
  | "simulate_consensus_tournament"
  | "simulate_adversarial_sources"
  | "score_misinformation_resistance"
  | "evolve_probabilistic_trust"
  | "run_reinforcement_calibration"
  | "evolve_validator_specialization"
  | "transfer_cross_sport_intelligence"
  | "adapt_recursive_governance"
  | "score_market_reaction"
  | "test_validator_mutation"
  | "freeze_pre_live_initialization"
  | "simulate_intelligence_survivability";

export type ReplayHistoricalSimulationRuntimeQuery =
  | "get_validator_pretraining_runtime"
  | "get_consensus_tournament_history"
  | "get_adversarial_source_simulation"
  | "get_misinformation_resistance_scores"
  | "get_probabilistic_trust_evolution"
  | "get_reinforcement_calibration_loops"
  | "get_validator_specialization_evolution"
  | "get_cross_sport_transfer_learning"
  | "get_recursive_governance_adaptation"
  | "get_historical_market_reaction_scores"
  | "get_validator_mutation_tests"
  | "get_pre_live_initialization_snapshots"
  | "get_intelligence_survivability_simulation"
  | "get_simulation_lineage";

export interface ReplayHistoricalSimulationRuntimeInput {
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly calibration_snapshot: ReplayHistoricalCalibrationSnapshot;
  readonly simulation_epochs?: number;
  readonly adversarial_pressure?: number;
  readonly reinforcement_learning_rate?: number;
}

export interface ReplayValidatorPretrainingRuntimeRecord {
  readonly pretraining_id: string;
  readonly validator_type: string;
  readonly league: string;
  readonly starting_trust: number;
  readonly pretrained_trust: number;
  readonly pretrained_weight: number;
  readonly sample_count: number;
  readonly pretraining_hash: string;
}

export interface ReplayHistoricalConsensusTournamentRecord {
  readonly tournament_id: string;
  readonly league: string;
  readonly tournament_round: number;
  readonly validator_count: number;
  readonly consensus_success_rate: number;
  readonly convergence_advantage: number;
  readonly tournament_hash: string;
}

export interface ReplayAdversarialSourceSimulationRecord {
  readonly adversarial_id: string;
  readonly source_id: string;
  readonly league: string;
  readonly reliability_prior: number;
  readonly adversarial_pressure: number;
  readonly simulated_false_signal_rate: number;
  readonly resistance_score: number;
  readonly adversarial_hash: string;
}

export interface ReplayMisinformationResistanceScore {
  readonly resistance_id: string;
  readonly league: string;
  readonly source_count: number;
  readonly average_resistance_score: number;
  readonly misinformation_containment_score: number;
  readonly resistance_hash: string;
}

export interface ReplayProbabilisticTrustEvolutionRecord {
  readonly evolution_id: string;
  readonly validator_type: string;
  readonly league: string;
  readonly epoch: number;
  readonly trust_probability: number;
  readonly evolved_trust: number;
  readonly evolved_weight: number;
  readonly evolution_hash: string;
}

export interface ReplayReinforcementCalibrationLoopRecord {
  readonly loop_id: string;
  readonly league: string;
  readonly epoch: number;
  readonly reward_score: number;
  readonly penalty_score: number;
  readonly learning_rate: number;
  readonly calibrated_gain: number;
  readonly loop_hash: string;
}

export interface ReplayValidatorSpecializationEvolutionRecord {
  readonly specialization_id: string;
  readonly validator_type: string;
  readonly league: string;
  readonly specialization: string;
  readonly specialization_score: number;
  readonly mutation_readiness_score: number;
  readonly specialization_hash: string;
}

export interface ReplayCrossSportTransferLearningRecord {
  readonly transfer_id: string;
  readonly from_league: string;
  readonly to_league: string;
  readonly transferable_validator_count: number;
  readonly transfer_gain: number;
  readonly transfer_risk: number;
  readonly transfer_hash: string;
}

export interface ReplayRecursiveGovernanceAdaptationRecord {
  readonly adaptation_id: string;
  readonly league: string;
  readonly recursion_depth: number;
  readonly governance_prior: number;
  readonly adapted_threshold: number;
  readonly stability_after_recursion: number;
  readonly adaptation_hash: string;
}

export interface ReplayHistoricalMarketReactionScore {
  readonly reaction_id: string;
  readonly league: string;
  readonly season_id: string;
  readonly movement_intensity: number;
  readonly positive_clv_rate: number;
  readonly reaction_score: number;
  readonly reaction_hash: string;
}

export interface ReplayAutonomousValidatorMutationTest {
  readonly mutation_id: string;
  readonly validator_type: string;
  readonly league: string;
  readonly mutation_vector: string;
  readonly baseline_trust: number;
  readonly mutated_trust: number;
  readonly mutation_survived: boolean;
  readonly mutation_hash: string;
}

export interface ReplayPreLiveRuntimeInitializationSnapshot {
  readonly initialization_id: string;
  readonly validator_type: string;
  readonly league: string;
  readonly initialized_trust: number;
  readonly initialized_weight: number;
  readonly specialization: string;
  readonly source_resistance_prior: number;
  readonly initialization_hash: string;
}

export interface ReplayIntelligenceSurvivabilitySimulationRecord {
  readonly survivability_id: string;
  readonly league: string;
  readonly lineage_depth: number;
  readonly drift_pressure: number;
  readonly failover_readiness_score: number;
  readonly survivability_score: number;
  readonly survivability_hash: string;
}

export interface ReplayHistoricalSimulationLineageRecord {
  readonly lineage_id: string;
  readonly calibration_hash: string;
  readonly source_hash: string;
  readonly target_hash: string;
  readonly lineage_kind:
    | "calibration"
    | "pretraining"
    | "tournament"
    | "adversarial"
    | "reinforcement"
    | "mutation"
    | "initialization"
    | "survivability";
  readonly lineage_hash: string;
}

export interface ReplayHistoricalSimulationRuntimeSnapshot {
  readonly simulation_id: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly state: ReplayHistoricalSimulationRuntimeState;
  readonly calibration_id: string;
  readonly validator_pretraining: readonly ReplayValidatorPretrainingRuntimeRecord[];
  readonly consensus_tournaments: readonly ReplayHistoricalConsensusTournamentRecord[];
  readonly adversarial_sources: readonly ReplayAdversarialSourceSimulationRecord[];
  readonly misinformation_resistance: readonly ReplayMisinformationResistanceScore[];
  readonly probabilistic_trust_evolution: readonly ReplayProbabilisticTrustEvolutionRecord[];
  readonly reinforcement_calibration_loops: readonly ReplayReinforcementCalibrationLoopRecord[];
  readonly validator_specialization: readonly ReplayValidatorSpecializationEvolutionRecord[];
  readonly cross_sport_transfer_learning: readonly ReplayCrossSportTransferLearningRecord[];
  readonly recursive_governance_adaptation: readonly ReplayRecursiveGovernanceAdaptationRecord[];
  readonly market_reaction_scores: readonly ReplayHistoricalMarketReactionScore[];
  readonly validator_mutation_tests: readonly ReplayAutonomousValidatorMutationTest[];
  readonly pre_live_initialization: readonly ReplayPreLiveRuntimeInitializationSnapshot[];
  readonly survivability_simulation: readonly ReplayIntelligenceSurvivabilitySimulationRecord[];
  readonly simulation_lineage: readonly ReplayHistoricalSimulationLineageRecord[];
  readonly supported_actions: readonly ReplayHistoricalSimulationRuntimeAction[];
  readonly supported_queries: readonly ReplayHistoricalSimulationRuntimeQuery[];
  readonly deterministic_hash: string;
}
