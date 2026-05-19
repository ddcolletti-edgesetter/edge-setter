/**
 * Product-aligned compatibility aliases for experimental replay systems.
 *
 * These aliases intentionally preserve legacy serialization and deterministic
 * hashes while giving new code sports-intelligence names.
 */
import type {
  ReplayCivilizationFitnessScore,
  ReplayCivilizationIntelligenceRanking,
  ReplayCivilizationLifecycleStateRecord,
  ReplayCivilizationMetaSelectionInput,
  ReplayCivilizationMetaSelectionLineage,
  ReplayCivilizationMetaSelectionQuery,
  ReplayCivilizationMetaSelectionSnapshot,
  ReplayCivilizationMetaSelectionState,
  ReplayCivilizationReputationRecord,
  ReplayDynastySurvivabilityAnalytic,
  ReplayEvolutionaryTraitMutationAnalytic,
  ReplayExtinctionPrediction,
  ReplayGovernanceStabilityForecast,
  ReplayLiveRuntimeCivilizationEligibilityGate,
  ReplayLongHorizonSpeciesEvolutionTrack,
  ReplayRecursiveCivilizationPromotionScore,
} from "./replay-civilization-meta-selection-contract";
import type {
  ReplayCivilizationPromotionGate,
  ReplayCivilizationScaleAnalyticsRecord,
  ReplayCivilizationStateTransitionLineage,
  ReplayCivilizationWarfareRecord,
  ReplayCorruptionPropagationRecord,
  ReplayDynastySurvivalScore,
  ReplayEvolutionaryCatastropheRecord,
  ReplayGovernanceIdeologyRecord,
  ReplayHistoricalAutonomousCivilizationAction,
  ReplayHistoricalAutonomousCivilizationInput,
  ReplayHistoricalAutonomousCivilizationQuery,
  ReplayHistoricalAutonomousCivilizationSnapshot,
  ReplayHistoricalAutonomousCivilizationState,
  ReplayRecursiveValidatorSpawnRecord,
  ReplayValidatorEmpireRecord,
  ReplayValidatorSpeciesDivergenceRecord,
} from "./replay-historical-autonomous-civilization-contract";
import type {
  ReplayGovernanceForkSimulationRecord,
  ReplayHistoricalAutonomousLeagueAction,
  ReplayHistoricalAutonomousLeagueInput,
  ReplayHistoricalAutonomousLeagueQuery,
  ReplayHistoricalAutonomousLeagueSnapshot,
  ReplayHistoricalAutonomousLeagueState,
  ReplaySimulationToLivePromotionCriteria,
  ReplaySpecializationMarketSimulation,
  ReplayValidatorSurvivalExtinctionCycle,
} from "./replay-historical-autonomous-league-contract";
import type {
  ReplayCoalitionConsensusGovernanceRecord,
  ReplayGeopoliticalStabilityForecast,
  ReplayGovernanceMutationResistanceScore,
  ReplayLiveCivilizationFederationEligibility,
  ReplayMetaCivilizationGovernanceInput,
  ReplayMetaCivilizationGovernanceQuery,
  ReplayMetaCivilizationGovernanceSnapshot,
  ReplayMetaCivilizationGovernanceState,
} from "./replay-meta-civilization-governance-contract";

export const PRODUCT_ALIGNMENT_TRANSLATION_MAP = Object.freeze({
  civilization: "validator_cluster",
  species: "specialization_profile",
  dynasty: "validator_cohort",
  governance: "consensus_coordination",
  extinction: "validator_retirement",
  promotion: "live_runtime_eligibility",
  mutation: "specialization_adjustment",
} as const);

export const PRODUCT_ALIGNED_EXPERIMENTAL_BOUNDARIES = Object.freeze([
  "validator_cluster_stress_runtime",
  "validator_cohort_tournament",
  "validator_cluster_selection",
  "validator_cluster_consensus_policy",
] as const);

export type ReplayValidatorClusterState = ReplayHistoricalAutonomousCivilizationState;
export type ReplayValidatorClusterAction = ReplayHistoricalAutonomousCivilizationAction;
export type ReplayValidatorClusterQuery = ReplayHistoricalAutonomousCivilizationQuery;
export type ReplayValidatorClusterInput = ReplayHistoricalAutonomousCivilizationInput;
export type ReplayValidatorClusterSnapshot = ReplayHistoricalAutonomousCivilizationSnapshot;
export type ReplayValidatorClusterStressRecord = ReplayCivilizationWarfareRecord;
export type ReplayValidatorClusterCoverageFootprint = ReplayValidatorEmpireRecord;
export type ReplayConsensusCoordinationIdeologyProfile = ReplayGovernanceIdeologyRecord;
export type ReplaySpecializationAdjustmentSpawnRecord = ReplayRecursiveValidatorSpawnRecord;
export type ReplayValidatorRetirementStressEvent = ReplayEvolutionaryCatastropheRecord;
export type ReplayValidatorCohortSurvivalScore = ReplayDynastySurvivalScore;
export type ReplaySpecializationProfileDivergenceRecord = ReplayValidatorSpeciesDivergenceRecord;
export type ReplayValidatorClusterAnalyticsRecord = ReplayCivilizationScaleAnalyticsRecord;
export type ReplayValidatorClusterLiveRuntimeEligibilityGate = ReplayCivilizationPromotionGate;
export type ReplayValidatorClusterLineageRecord = ReplayCivilizationStateTransitionLineage;
export type ReplayManipulationResistancePropagationRecord = ReplayCorruptionPropagationRecord;

export type ReplayValidatorCohortTournamentState = ReplayHistoricalAutonomousLeagueState;
export type ReplayValidatorCohortTournamentAction = ReplayHistoricalAutonomousLeagueAction;
export type ReplayValidatorCohortTournamentQuery = ReplayHistoricalAutonomousLeagueQuery;
export type ReplayValidatorCohortTournamentInput = ReplayHistoricalAutonomousLeagueInput;
export type ReplayValidatorCohortTournamentSnapshot = ReplayHistoricalAutonomousLeagueSnapshot;
export type ReplayValidatorRetirementCycle = ReplayValidatorSurvivalExtinctionCycle;
export type ReplaySpecializationProfileMarketSimulation = ReplaySpecializationMarketSimulation;
export type ReplayConsensusCoordinationForkSimulation = ReplayGovernanceForkSimulationRecord;
export type ReplayValidatorCohortLiveRuntimeEligibility = ReplaySimulationToLivePromotionCriteria;

export type ReplayValidatorClusterSelectionState = ReplayCivilizationMetaSelectionState;
export type ReplayValidatorClusterSelectionQuery = ReplayCivilizationMetaSelectionQuery;
export type ReplayValidatorClusterSelectionInput = ReplayCivilizationMetaSelectionInput;
export type ReplayValidatorClusterSelectionSnapshot = ReplayCivilizationMetaSelectionSnapshot;
export type ReplayValidatorClusterFitnessScore = ReplayCivilizationFitnessScore;
export type ReplayLongHorizonValidatorCohortAnalytic = ReplayDynastySurvivabilityAnalytic;
export type ReplayValidatorRetirementPrediction = ReplayExtinctionPrediction;
export type ReplayConsensusCoordinationStabilityForecast = ReplayGovernanceStabilityForecast;
export type ReplaySpecializationAdjustmentAnalytic = ReplayEvolutionaryTraitMutationAnalytic;
export type ReplayValidatorClusterLifecycleRecord = ReplayCivilizationLifecycleStateRecord;
export type ReplayRecursiveLiveRuntimeEligibilityScore = ReplayRecursiveCivilizationPromotionScore;
export type ReplayLiveRuntimeEligibilityGate = ReplayLiveRuntimeCivilizationEligibilityGate;
export type ReplayValidatorClusterTrustScoreRecord = ReplayCivilizationReputationRecord;
export type ReplayLongHorizonSpecializationProfileTrack = ReplayLongHorizonSpeciesEvolutionTrack;
export type ReplayValidatorClusterIntelligenceRanking = ReplayCivilizationIntelligenceRanking;
export type ReplayValidatorClusterSelectionLineage = ReplayCivilizationMetaSelectionLineage;

export type ReplayValidatorClusterConsensusPolicyState = ReplayMetaCivilizationGovernanceState;
export type ReplayValidatorClusterConsensusPolicyQuery = ReplayMetaCivilizationGovernanceQuery;
export type ReplayValidatorClusterConsensusPolicyInput = ReplayMetaCivilizationGovernanceInput;
export type ReplayValidatorClusterConsensusPolicySnapshot = ReplayMetaCivilizationGovernanceSnapshot;
export type ReplayCoalitionConsensusCoordinationRecord = ReplayCoalitionConsensusGovernanceRecord;
export type ReplayConsensusCoordinationAdjustmentResistanceScore = ReplayGovernanceMutationResistanceScore;
export type ReplayManipulationResistanceStabilityForecast = ReplayGeopoliticalStabilityForecast;
export type ReplayLiveRuntimeFederatedClusterEligibility = ReplayLiveCivilizationFederationEligibility;
