/**
 * @deprecated Experimental validator civilization terminology. Prefer product-aligned
 * validator cluster stress / long-horizon signal reliability contracts for new work.
 */
import type {
  ReplayHistoricalAutonomousLeagueSnapshot,
} from "./replay-historical-autonomous-league-contract";

export type ReplayHistoricalAutonomousCivilizationState =
  | "warring"
  | "fracturing"
  | "migrating"
  | "collapsing"
  | "surviving"
  | "promoting"
  | "unstable";

export type ReplayHistoricalAutonomousCivilizationAction =
  | "simulate_adversarial_civilization_warfare"
  | "simulate_governance_ideology"
  | "model_validator_empire_expansion"
  | "spawn_recursive_validators"
  | "simulate_evolutionary_catastrophe"
  | "migrate_distributed_intelligence"
  | "form_treaty_alliance"
  | "simulate_civil_war_fracture"
  | "inject_black_swan_collapse"
  | "recover_from_civilization_collapse"
  | "score_dynasty_survival"
  | "track_validator_species_divergence"
  | "run_autonomous_diplomacy"
  | "model_self_preserving_swarms"
  | "model_corruption_propagation"
  | "emit_civilization_replay_analytics"
  | "record_civilization_state_lineage";

export type ReplayHistoricalAutonomousCivilizationQuery =
  | "get_civilization_warfare"
  | "get_governance_ideologies"
  | "get_validator_empires"
  | "get_recursive_validator_spawns"
  | "get_evolutionary_catastrophes"
  | "get_intelligence_migrations"
  | "get_treaty_alliances"
  | "get_civil_war_fractures"
  | "get_black_swan_collapse_events"
  | "get_civilization_recovery"
  | "get_dynasty_survival_scores"
  | "get_species_divergence"
  | "get_runtime_diplomacy"
  | "get_self_preserving_swarms"
  | "get_corruption_propagation"
  | "get_civilization_replay_analytics"
  | "get_civilization_promotion_gates"
  | "get_civilization_state_lineage";

export interface ReplayHistoricalAutonomousCivilizationInput {
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly autonomous_league_snapshot: ReplayHistoricalAutonomousLeagueSnapshot;
  readonly civilization_epochs?: number;
  readonly adversarial_pressure?: number;
  readonly collapse_threshold?: number;
  readonly promotion_threshold?: number;
}

export interface ReplayCivilizationWarfareRecord {
  readonly warfare_id: string;
  readonly attacker_league: string;
  readonly defender_league: string;
  readonly epoch: number;
  readonly attack_power: number;
  readonly defense_power: number;
  readonly warfare_outcome: "attacker_advantage" | "defender_holds" | "stalemate";
  readonly warfare_hash: string;
}

export interface ReplayGovernanceIdeologyRecord {
  readonly ideology_id: string;
  readonly league: string;
  readonly ideology: "meritocratic" | "federalist" | "isolationist" | "expansionist" | "survivalist";
  readonly ideology_stability: number;
  readonly fork_tolerance: number;
  readonly ideology_hash: string;
}

export interface ReplayValidatorEmpireRecord {
  readonly empire_id: string;
  readonly league: string;
  readonly apex_count: number;
  readonly territory_score: number;
  readonly expansion_pressure: number;
  readonly contraction_risk: number;
  readonly empire_hash: string;
}

export interface ReplayRecursiveValidatorSpawnRecord {
  readonly spawn_id: string;
  readonly parent_validator_id: string;
  readonly league: string;
  readonly epoch: number;
  readonly spawn_generation: number;
  readonly spawn_fitness: number;
  readonly spawn_hash: string;
}

export interface ReplayEvolutionaryCatastropheRecord {
  readonly catastrophe_id: string;
  readonly league: string;
  readonly epoch: number;
  readonly catastrophe_kind: "market_shock" | "source_poisoning" | "consensus_deadlock" | "governance_coup";
  readonly severity: number;
  readonly recovery_probability: number;
  readonly catastrophe_hash: string;
}

export interface ReplayDistributedIntelligenceMigrationRecord {
  readonly migration_id: string;
  readonly from_league: string;
  readonly to_league: string;
  readonly migrant_count: number;
  readonly migration_gain: number;
  readonly migration_risk: number;
  readonly migration_hash: string;
}

export interface ReplayTreatyAllianceRecord {
  readonly treaty_id: string;
  readonly league_a: string;
  readonly league_b: string;
  readonly treaty_type: "defense" | "knowledge_transfer" | "anti_corruption" | "promotion_bloc";
  readonly cooperation_score: number;
  readonly treaty_durability: number;
  readonly treaty_hash: string;
}

export interface ReplayCivilWarGovernanceFractureRecord {
  readonly fracture_id: string;
  readonly league: string;
  readonly faction_a: string;
  readonly faction_b: string;
  readonly fracture_pressure: number;
  readonly civil_war_risk: number;
  readonly fracture_hash: string;
}

export interface ReplayBlackSwanCollapseEvent {
  readonly event_id: string;
  readonly league: string;
  readonly event_kind: "total_source_failure" | "validator_bank_run" | "lineage_cascade" | "adversarial_takeover";
  readonly collapse_pressure: number;
  readonly containment_score: number;
  readonly event_hash: string;
}

export interface ReplayCivilizationRecoveryRecord {
  readonly recovery_id: string;
  readonly league: string;
  readonly collapse_event_hash: string;
  readonly recovery_strategy: "swarm_redundancy" | "treaty_support" | "migration_restore" | "governance_repair";
  readonly recovery_score: number;
  readonly recovered: boolean;
  readonly recovery_hash: string;
}

export interface ReplayDynastySurvivalScore {
  readonly dynasty_id: string;
  readonly league: string;
  readonly elite_lineage_count: number;
  readonly promoted_network_count: number;
  readonly dynasty_score: number;
  readonly dynasty_hash: string;
}

export interface ReplayValidatorSpeciesDivergenceRecord {
  readonly species_id: string;
  readonly league: string;
  readonly species_name: string;
  readonly divergence_score: number;
  readonly ancestor_hash: string;
  readonly species_hash: string;
}

export interface ReplayAutonomousRuntimeDiplomacyRecord {
  readonly diplomacy_id: string;
  readonly league: string;
  readonly counterpart_league: string;
  readonly diplomatic_posture: "ally" | "neutral" | "rival" | "quarantined";
  readonly diplomacy_score: number;
  readonly diplomacy_hash: string;
}

export interface ReplaySelfPreservingValidatorSwarmRecord {
  readonly swarm_id: string;
  readonly league: string;
  readonly swarm_size: number;
  readonly self_preservation_score: number;
  readonly swarm_redundancy: number;
  readonly swarm_hash: string;
}

export interface ReplayCorruptionPropagationRecord {
  readonly corruption_id: string;
  readonly league: string;
  readonly origin: string;
  readonly propagation_depth: number;
  readonly corruption_risk: number;
  readonly containment_score: number;
  readonly corruption_hash: string;
}

export interface ReplayCivilizationScaleAnalyticsRecord {
  readonly analytics_id: string;
  readonly league: string;
  readonly civilization_fitness: number;
  readonly collapse_risk: number;
  readonly cooperation_index: number;
  readonly promotion_readiness: number;
  readonly analytics_hash: string;
}

export interface ReplayCivilizationPromotionGate {
  readonly gate_id: string;
  readonly league: string;
  readonly promoted: boolean;
  readonly gate_score: number;
  readonly gate_reason: string;
  readonly gate_hash: string;
}

export interface ReplayCivilizationStateTransitionLineage {
  readonly transition_id: string;
  readonly league: string | null;
  readonly transition_kind:
    | "league_seed"
    | "warfare"
    | "ideology"
    | "empire"
    | "spawn"
    | "catastrophe"
    | "migration"
    | "treaty"
    | "fracture"
    | "black_swan"
    | "recovery"
    | "dynasty"
    | "species"
    | "diplomacy"
    | "swarm"
    | "corruption"
    | "analytics"
    | "promotion_gate";
  readonly source_hash: string;
  readonly target_hash: string;
  readonly lineage_depth: number;
  readonly transition_hash: string;
}

export interface ReplayHistoricalAutonomousCivilizationSnapshot {
  readonly civilization_id: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly state: ReplayHistoricalAutonomousCivilizationState;
  readonly autonomous_league_id: string;
  readonly warfare: readonly ReplayCivilizationWarfareRecord[];
  readonly governance_ideologies: readonly ReplayGovernanceIdeologyRecord[];
  readonly validator_empires: readonly ReplayValidatorEmpireRecord[];
  readonly recursive_spawns: readonly ReplayRecursiveValidatorSpawnRecord[];
  readonly catastrophes: readonly ReplayEvolutionaryCatastropheRecord[];
  readonly intelligence_migrations: readonly ReplayDistributedIntelligenceMigrationRecord[];
  readonly treaty_alliances: readonly ReplayTreatyAllianceRecord[];
  readonly civil_war_fractures: readonly ReplayCivilWarGovernanceFractureRecord[];
  readonly black_swan_events: readonly ReplayBlackSwanCollapseEvent[];
  readonly civilization_recovery: readonly ReplayCivilizationRecoveryRecord[];
  readonly dynasty_survival: readonly ReplayDynastySurvivalScore[];
  readonly species_divergence: readonly ReplayValidatorSpeciesDivergenceRecord[];
  readonly runtime_diplomacy: readonly ReplayAutonomousRuntimeDiplomacyRecord[];
  readonly self_preserving_swarms: readonly ReplaySelfPreservingValidatorSwarmRecord[];
  readonly corruption_propagation: readonly ReplayCorruptionPropagationRecord[];
  readonly civilization_analytics: readonly ReplayCivilizationScaleAnalyticsRecord[];
  readonly promotion_gates: readonly ReplayCivilizationPromotionGate[];
  readonly civilization_state_lineage: readonly ReplayCivilizationStateTransitionLineage[];
  readonly supported_actions: readonly ReplayHistoricalAutonomousCivilizationAction[];
  readonly supported_queries: readonly ReplayHistoricalAutonomousCivilizationQuery[];
  readonly deterministic_hash: string;
}

export type ReplayValidatorClusterStressState = ReplayHistoricalAutonomousCivilizationState;
export type ReplayValidatorClusterStressAction = ReplayHistoricalAutonomousCivilizationAction;
export type ReplayValidatorClusterStressQuery = ReplayHistoricalAutonomousCivilizationQuery;
export type ReplayValidatorClusterStressInput = ReplayHistoricalAutonomousCivilizationInput;
export type ReplayValidatorClusterWarfareRecord = ReplayCivilizationWarfareRecord;
export type ReplayConsensusCoordinationIdeologyRecord = ReplayGovernanceIdeologyRecord;
export type ReplayValidatorClusterFootprintRecord = ReplayValidatorEmpireRecord;
export type ReplaySpecializationAdjustmentSpawnRecord = ReplayRecursiveValidatorSpawnRecord;
export type ReplayValidatorRetirementCatastropheRecord = ReplayEvolutionaryCatastropheRecord;
export type ReplayLongHorizonValidatorCohortScore = ReplayDynastySurvivalScore;
export type ReplaySpecializationProfileDivergenceRecord = ReplayValidatorSpeciesDivergenceRecord;
export type ReplayLongHorizonSignalReliabilitySwarmRecord = ReplaySelfPreservingValidatorSwarmRecord;
export type ReplayValidatorClusterStressSnapshot = ReplayHistoricalAutonomousCivilizationSnapshot;
