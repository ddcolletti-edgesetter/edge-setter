/**
 * @deprecated Experimental product-drift compatibility layer.
 * Prefer consensus coordination, source quarantine, and manipulation resistance names for new work.
 */
import type {
  ReplayCivilizationMetaSelectionSnapshot,
} from "./replay-civilization-meta-selection-contract";

export type ReplayMetaCivilizationGovernanceState =
  | "negotiating"
  | "federating"
  | "deterring"
  | "sanctioning"
  | "fracturing"
  | "propagating"
  | "eligible"
  | "unstable";

export type ReplayMetaCivilizationGovernanceAction =
  | "form_civilization_alliance"
  | "negotiate_treaty"
  | "coordinate_coalition_consensus"
  | "allocate_trade_resources"
  | "detect_adversarial_deception"
  | "analyze_ideological_drift"
  | "evolve_constitution"
  | "score_governance_mutation_resistance"
  | "forecast_geopolitical_stability"
  | "simulate_civilization_cold_war"
  | "deploy_strategic_deterrence"
  | "apply_civilization_sanctions"
  | "predict_alliance_fracture"
  | "propagate_cross_civilization_intelligence"
  | "analyze_recursive_constitutional_survivability"
  | "advance_diplomacy_state"
  | "persist_meta_governance_lineage"
  | "gate_live_civilization_federation";

export type ReplayMetaCivilizationGovernanceQuery =
  | "get_civilization_alliances"
  | "get_treaty_negotiations"
  | "get_coalition_consensus_governance"
  | "get_trade_resource_economies"
  | "get_adversarial_deception_detection"
  | "get_ideological_drift_analytics"
  | "get_constitutional_evolution"
  | "get_governance_mutation_resistance"
  | "get_geopolitical_stability_forecast"
  | "get_civilization_cold_war"
  | "get_strategic_deterrence"
  | "get_civilization_sanctions"
  | "get_alliance_fracture_prediction"
  | "get_cross_civilization_intelligence_propagation"
  | "get_recursive_constitutional_survivability"
  | "get_civilization_diplomacy_state"
  | "get_meta_governance_lineage"
  | "get_live_civilization_federation_eligibility";

export interface ReplayMetaCivilizationGovernanceInput {
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly meta_selection_snapshot: ReplayCivilizationMetaSelectionSnapshot;
  readonly era_label?: string;
  readonly federation_threshold?: number;
  readonly deception_pressure?: number;
}

export interface ReplayCivilizationAllianceRecord {
  readonly alliance_id: string;
  readonly league_a: string;
  readonly league_b: string;
  readonly alliance_type: "defensive" | "economic" | "ideological" | "intelligence" | "federation";
  readonly alliance_score: number;
  readonly alliance_hash: string;
}

export interface ReplayTreatyNegotiationRecord {
  readonly treaty_id: string;
  readonly alliance_id: string;
  readonly negotiation_round: number;
  readonly treaty_terms_hash: string;
  readonly acceptance_probability: number;
  readonly treaty_hash: string;
}

export interface ReplayCoalitionConsensusGovernanceRecord {
  readonly coalition_id: string;
  readonly league: string;
  readonly member_count: number;
  readonly consensus_weight: number;
  readonly governance_quorum_score: number;
  readonly coalition_hash: string;
}

export interface ReplayCivilizationTradeResourceEconomy {
  readonly economy_id: string;
  readonly league: string;
  readonly resource_capital: number;
  readonly trade_surplus: number;
  readonly allocation_efficiency: number;
  readonly economy_hash: string;
}

export interface ReplayAdversarialDeceptionDetectionRecord {
  readonly deception_id: string;
  readonly league: string;
  readonly deception_pressure: number;
  readonly detection_confidence: number;
  readonly deception_resistance: number;
  readonly deception_hash: string;
}

export interface ReplayIdeologicalDriftAnalytic {
  readonly drift_id: string;
  readonly league: string;
  readonly reputation_tier: string;
  readonly lifecycle_state: string;
  readonly ideological_drift_score: number;
  readonly drift_hash: string;
}

export interface ReplayConstitutionalEvolutionRecord {
  readonly constitution_id: string;
  readonly league: string;
  readonly version: number;
  readonly amendment_vector: string;
  readonly constitutional_fitness: number;
  readonly constitution_hash: string;
}

export interface ReplayGovernanceMutationResistanceScore {
  readonly resistance_id: string;
  readonly league: string;
  readonly mutation_pressure: number;
  readonly constitutional_fitness: number;
  readonly mutation_resistance_score: number;
  readonly resistance_hash: string;
}

export interface ReplayGeopoliticalStabilityForecast {
  readonly forecast_id: string;
  readonly league: string;
  readonly stability_score: number;
  readonly fracture_risk: number;
  readonly federation_readiness: number;
  readonly forecast_hash: string;
}

export interface ReplayCivilizationColdWarSimulation {
  readonly cold_war_id: string;
  readonly league_a: string;
  readonly league_b: string;
  readonly escalation_score: number;
  readonly containment_score: number;
  readonly cold_war_hash: string;
}

export interface ReplayStrategicDeterrenceRecord {
  readonly deterrence_id: string;
  readonly league: string;
  readonly deterrence_capacity: number;
  readonly retaliation_cost: number;
  readonly deterrence_stability: number;
  readonly deterrence_hash: string;
}

export interface ReplayCivilizationSanctionIsolationRecord {
  readonly sanction_id: string;
  readonly league: string;
  readonly sanction_reason: string;
  readonly isolation_score: number;
  readonly reintegration_probability: number;
  readonly sanction_hash: string;
}

export interface ReplayAllianceFracturePrediction {
  readonly fracture_id: string;
  readonly alliance_id: string;
  readonly fracture_probability: number;
  readonly fracture_trigger: string;
  readonly fracture_hash: string;
}

export interface ReplayCrossCivilizationIntelligencePropagation {
  readonly propagation_id: string;
  readonly from_league: string;
  readonly to_league: string;
  readonly propagation_strength: number;
  readonly propagation_risk: number;
  readonly propagation_hash: string;
}

export interface ReplayRecursiveConstitutionalSurvivability {
  readonly survivability_id: string;
  readonly league: string;
  readonly recursion_depth: number;
  readonly constitutional_survivability_score: number;
  readonly survivability_hash: string;
}

export interface ReplayCivilizationDiplomacyStateMachineRecord {
  readonly diplomacy_id: string;
  readonly league: string;
  readonly diplomacy_state: "federated" | "allied" | "neutral" | "sanctioned" | "isolated";
  readonly state_confidence: number;
  readonly diplomacy_hash: string;
}

export interface ReplayMetaGovernanceLineageRecord {
  readonly lineage_id: string;
  readonly transition_kind:
    | "meta_selection"
    | "alliance"
    | "treaty"
    | "coalition"
    | "economy"
    | "deception"
    | "ideology"
    | "constitution"
    | "resistance"
    | "forecast"
    | "cold_war"
    | "deterrence"
    | "sanction"
    | "fracture"
    | "propagation"
    | "survivability"
    | "diplomacy"
    | "federation_gate";
  readonly league: string | null;
  readonly source_hash: string;
  readonly target_hash: string;
  readonly lineage_hash: string;
}

export interface ReplayLiveCivilizationFederationEligibility {
  readonly eligibility_id: string;
  readonly league: string;
  readonly eligible: boolean;
  readonly federation_score: number;
  readonly eligibility_reason: string;
  readonly eligibility_hash: string;
}

export interface ReplayMetaCivilizationGovernanceSnapshot {
  readonly meta_governance_id: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly state: ReplayMetaCivilizationGovernanceState;
  readonly meta_selection_id: string;
  readonly alliances: readonly ReplayCivilizationAllianceRecord[];
  readonly treaty_negotiations: readonly ReplayTreatyNegotiationRecord[];
  readonly coalition_governance: readonly ReplayCoalitionConsensusGovernanceRecord[];
  readonly trade_economies: readonly ReplayCivilizationTradeResourceEconomy[];
  readonly deception_detection: readonly ReplayAdversarialDeceptionDetectionRecord[];
  readonly ideological_drift: readonly ReplayIdeologicalDriftAnalytic[];
  readonly constitutional_evolution: readonly ReplayConstitutionalEvolutionRecord[];
  readonly mutation_resistance: readonly ReplayGovernanceMutationResistanceScore[];
  readonly geopolitical_forecasts: readonly ReplayGeopoliticalStabilityForecast[];
  readonly cold_war_simulation: readonly ReplayCivilizationColdWarSimulation[];
  readonly strategic_deterrence: readonly ReplayStrategicDeterrenceRecord[];
  readonly sanctions: readonly ReplayCivilizationSanctionIsolationRecord[];
  readonly alliance_fracture: readonly ReplayAllianceFracturePrediction[];
  readonly intelligence_propagation: readonly ReplayCrossCivilizationIntelligencePropagation[];
  readonly constitutional_survivability: readonly ReplayRecursiveConstitutionalSurvivability[];
  readonly diplomacy_states: readonly ReplayCivilizationDiplomacyStateMachineRecord[];
  readonly meta_governance_lineage: readonly ReplayMetaGovernanceLineageRecord[];
  readonly federation_eligibility: readonly ReplayLiveCivilizationFederationEligibility[];
  readonly supported_actions: readonly ReplayMetaCivilizationGovernanceAction[];
  readonly supported_queries: readonly ReplayMetaCivilizationGovernanceQuery[];
  readonly deterministic_hash: string;
}
