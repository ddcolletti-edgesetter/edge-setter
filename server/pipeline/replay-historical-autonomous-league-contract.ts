import type {
  ReplayHistoricalSimulationRuntimeSnapshot,
} from "./replay-historical-simulation-runtime-contract";

export type ReplayHistoricalAutonomousLeagueState =
  | "forming"
  | "competing"
  | "evolving"
  | "forking"
  | "surviving"
  | "promoting"
  | "unstable";

export type ReplayHistoricalAutonomousLeagueAction =
  | "form_validator_ecosystem"
  | "model_validator_population_lineage"
  | "run_evolutionary_tournament"
  | "model_survival_extinction_cycle"
  | "simulate_specialization_market"
  | "detect_coalition_collusion"
  | "allocate_intelligence_capital"
  | "simulate_governance_fork"
  | "form_intelligence_hierarchy"
  | "persist_evolutionary_memory"
  | "evaluate_live_promotion"
  | "emit_evolutionary_audit";

export type ReplayHistoricalAutonomousLeagueQuery =
  | "get_validator_league_ecosystem"
  | "get_validator_population_lineage"
  | "get_evolutionary_tournament_generations"
  | "get_survival_extinction_cycles"
  | "get_specialization_market"
  | "get_coalition_collusion_detection"
  | "get_validator_economy_capital"
  | "get_governance_fork_simulation"
  | "get_intelligence_hierarchy"
  | "get_evolutionary_memory"
  | "get_simulation_to_live_promotion"
  | "get_evolutionary_audit";

export interface ReplayHistoricalAutonomousLeagueInput {
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly simulation_snapshot: ReplayHistoricalSimulationRuntimeSnapshot;
  readonly generation_count?: number;
  readonly extinction_threshold?: number;
  readonly promotion_threshold?: number;
}

export interface ReplayValidatorLeagueEcosystemRecord {
  readonly ecosystem_id: string;
  readonly league: string;
  readonly population_count: number;
  readonly specialization_count: number;
  readonly average_initialized_trust: number;
  readonly ecosystem_fitness: number;
  readonly ecosystem_hash: string;
}

export interface ReplayValidatorPopulationLineageRecord {
  readonly lineage_id: string;
  readonly validator_id: string;
  readonly validator_type: string;
  readonly league: string;
  readonly parent_lineage_hash: string | null;
  readonly generation: number;
  readonly lineage_fitness: number;
  readonly lineage_status: "founder" | "mutated" | "elite" | "weak" | "extinct";
  readonly lineage_hash: string;
}

export interface ReplayEvolutionaryTournamentGeneration {
  readonly generation_id: string;
  readonly league: string;
  readonly generation: number;
  readonly competitor_count: number;
  readonly champion_validator_id: string;
  readonly champion_fitness: number;
  readonly average_generation_fitness: number;
  readonly generation_hash: string;
}

export interface ReplayValidatorSurvivalExtinctionCycle {
  readonly cycle_id: string;
  readonly validator_id: string;
  readonly league: string;
  readonly generation: number;
  readonly survival_score: number;
  readonly extinct: boolean;
  readonly survival_reason: string;
  readonly cycle_hash: string;
}

export interface ReplaySpecializationMarketSimulation {
  readonly market_id: string;
  readonly league: string;
  readonly specialization: string;
  readonly demand_score: number;
  readonly supply_count: number;
  readonly clearing_capital: number;
  readonly market_hash: string;
}

export interface ReplayCoalitionCollusionDetectionRecord {
  readonly detection_id: string;
  readonly league: string;
  readonly coalition_key: string;
  readonly member_count: number;
  readonly correlation_score: number;
  readonly collusion_risk: number;
  readonly action: "observe" | "quarantine" | "fork_governance";
  readonly detection_hash: string;
}

export interface ReplayValidatorEconomyCapitalAllocation {
  readonly allocation_id: string;
  readonly validator_id: string;
  readonly league: string;
  readonly specialization: string;
  readonly fitness_score: number;
  readonly intelligence_capital: number;
  readonly capital_action: "seed" | "increase" | "decrease" | "retire";
  readonly allocation_hash: string;
}

export interface ReplayGovernanceForkSimulationRecord {
  readonly fork_id: string;
  readonly league: string;
  readonly fork_reason: string;
  readonly fork_pressure: number;
  readonly parent_governance_hash: string;
  readonly fork_survival_score: number;
  readonly fork_hash: string;
}

export interface ReplayAutonomousIntelligenceHierarchyRecord {
  readonly hierarchy_id: string;
  readonly validator_id: string;
  readonly league: string;
  readonly tier: "apex" | "specialist" | "support" | "probation" | "extinct";
  readonly authority_score: number;
  readonly delegated_capital: number;
  readonly hierarchy_hash: string;
}

export interface ReplayLongHorizonEvolutionaryMemoryRecord {
  readonly memory_id: string;
  readonly league: string;
  readonly generation_span: number;
  readonly elite_lineage_count: number;
  readonly extinct_lineage_count: number;
  readonly memory_fitness: number;
  readonly memory_hash: string;
}

export interface ReplaySimulationToLivePromotionCriteria {
  readonly promotion_id: string;
  readonly validator_id: string;
  readonly league: string;
  readonly promotion_score: number;
  readonly promoted: boolean;
  readonly criteria_reason: string;
  readonly promotion_hash: string;
}

export interface ReplayDeterministicEvolutionaryAuditRecord {
  readonly audit_id: string;
  readonly audit_kind:
    | "ecosystem"
    | "lineage"
    | "tournament"
    | "survival"
    | "market"
    | "collusion"
    | "economy"
    | "governance"
    | "hierarchy"
    | "memory"
    | "promotion";
  readonly source_hash: string;
  readonly replay_safe: boolean;
  readonly deterministic_hash_verified: boolean;
  readonly audit_hash: string;
}

export interface ReplayHistoricalAutonomousLeagueSnapshot {
  readonly autonomous_league_id: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly state: ReplayHistoricalAutonomousLeagueState;
  readonly simulation_id: string;
  readonly ecosystem: readonly ReplayValidatorLeagueEcosystemRecord[];
  readonly population_lineage: readonly ReplayValidatorPopulationLineageRecord[];
  readonly evolutionary_tournaments: readonly ReplayEvolutionaryTournamentGeneration[];
  readonly survival_extinction_cycles: readonly ReplayValidatorSurvivalExtinctionCycle[];
  readonly specialization_markets: readonly ReplaySpecializationMarketSimulation[];
  readonly coalition_collusion_detection: readonly ReplayCoalitionCollusionDetectionRecord[];
  readonly economy_capital_allocation: readonly ReplayValidatorEconomyCapitalAllocation[];
  readonly governance_forks: readonly ReplayGovernanceForkSimulationRecord[];
  readonly intelligence_hierarchy: readonly ReplayAutonomousIntelligenceHierarchyRecord[];
  readonly evolutionary_memory: readonly ReplayLongHorizonEvolutionaryMemoryRecord[];
  readonly live_promotion_criteria: readonly ReplaySimulationToLivePromotionCriteria[];
  readonly evolutionary_audit: readonly ReplayDeterministicEvolutionaryAuditRecord[];
  readonly supported_actions: readonly ReplayHistoricalAutonomousLeagueAction[];
  readonly supported_queries: readonly ReplayHistoricalAutonomousLeagueQuery[];
  readonly deterministic_hash: string;
}
