import type {
  ReplayConsensusVote,
} from "./replay-consensus-contract";
import type {
  ReplayLiveInjuryReport,
  ReplayLiveIntelligenceBridgeSnapshot,
  ReplayLiveSourceIntelligenceEvent,
} from "./replay-live-intelligence-bridge-contract";
import type {
  LiveSignal,
  Outcome,
} from "./types";

export type ReplayValidatorTrustState =
  | "trusted"
  | "recovering"
  | "decaying"
  | "degraded"
  | "probation"
  | "promoted";

export type ReplayValidatorTrustAction =
  | "score_outcome_accuracy"
  | "track_historical_performance"
  | "evolve_source_reliability"
  | "apply_trust_decay"
  | "recover_trust"
  | "recalibrate_confidence"
  | "adapt_consensus_weight"
  | "persist_validator_intelligence"
  | "record_trust_lineage"
  | "freeze_trust_snapshot";

export type ReplayValidatorTrustQuery =
  | "get_validator_outcome_scores"
  | "get_validator_performance_history"
  | "get_source_reliability_evolution"
  | "get_trust_decay_recovery_history"
  | "get_confidence_recalibration_history"
  | "get_consensus_weight_adaptation"
  | "get_trust_lineage_history";

export interface ReplayValidatorTrustInput {
  readonly run_id: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly bridge_snapshot: ReplayLiveIntelligenceBridgeSnapshot;
  readonly live_signals: readonly LiveSignal[];
  readonly settled_outcomes: readonly Outcome[];
  readonly injury_reports: readonly ReplayLiveInjuryReport[];
  readonly source_intelligence_events: readonly ReplayLiveSourceIntelligenceEvent[];
  readonly decay_floor?: number;
  readonly recovery_threshold?: number;
}

export interface ReplayValidatorOutcomeScore {
  readonly score_id: string;
  readonly run_id: string;
  readonly validator_id: string;
  readonly validator_type: string;
  readonly replay_hash: string;
  readonly signal_id: string | null;
  readonly outcome_id: string | null;
  readonly vote: ReplayConsensusVote;
  readonly hit: boolean | null;
  readonly clv: number | null;
  readonly sports_accuracy_score: number;
  readonly clv_score: number;
  readonly injury_reliability_score: number;
  readonly source_confirmation_score: number;
  readonly consensus_convergence_score: number;
  readonly outcome_score: number;
  readonly score_hash: string;
}

export interface ReplayValidatorPerformanceRecord {
  readonly performance_id: string;
  readonly run_id: string;
  readonly validator_id: string;
  readonly validator_type: string;
  readonly scored_outcomes: number;
  readonly hit_rate: number | null;
  readonly average_clv: number | null;
  readonly average_outcome_score: number;
  readonly consensus_alignment: number;
  readonly confidence_error: number;
  readonly performance_hash: string;
}

export interface ReplaySourceReliabilityEvolution {
  readonly source_id: string;
  readonly source_name: string;
  readonly source_type: string;
  readonly league: string | null;
  readonly settled_signal_count: number;
  readonly hit_rate: number | null;
  readonly average_clv: number | null;
  readonly confirmation_accuracy: number;
  readonly injury_accuracy: number | null;
  readonly previous_reliability_score: number;
  readonly evolved_reliability_score: number;
  readonly reliability_delta: number;
  readonly reliability_hash: string;
}

export interface ReplayTrustDecayRecoveryRecord {
  readonly transition_id: string;
  readonly validator_id: string;
  readonly from_trust_score: number;
  readonly to_trust_score: number;
  readonly delta: number;
  readonly state: ReplayValidatorTrustState;
  readonly action: ReplayValidatorTrustAction;
  readonly reason: string;
  readonly transition_hash: string;
}

export interface ReplayConfidenceRecalibrationRecord {
  readonly recalibration_id: string;
  readonly validator_id: string;
  readonly validator_type: string;
  readonly previous_confidence: number;
  readonly observed_accuracy: number;
  readonly confidence_error: number;
  readonly recalibrated_confidence: number;
  readonly recalibration_hash: string;
}

export interface ReplayConsensusWeightAdaptation {
  readonly adaptation_id: string;
  readonly validator_id: string;
  readonly validator_type: string;
  readonly previous_weight: number;
  readonly adapted_weight: number;
  readonly trust_score: number;
  readonly performance_score: number;
  readonly adaptation_hash: string;
}

export interface ReplayValidatorTrustProfile {
  readonly profile_id: string;
  readonly run_id: string;
  readonly validator_id: string;
  readonly validator_type: string;
  readonly trust_score: number;
  readonly state: ReplayValidatorTrustState;
  readonly outcome_score_hashes: readonly string[];
  readonly performance_hash: string;
  readonly recalibration_hash: string;
  readonly weight_adaptation_hash: string;
  readonly profile_hash: string;
}

export interface ReplayTrustLineageReference {
  readonly reference_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly validator_id: string;
  readonly source_hash: string;
  readonly reference_kind:
    | "live_bridge"
    | "consensus_result"
    | "governance"
    | "outcome"
    | "source_reliability"
    | "validator_profile";
  readonly reference_hash: string;
}

export interface ReplayValidatorTrustSnapshot {
  readonly snapshot_id: string;
  readonly run_id: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly state: ReplayValidatorTrustState;
  readonly outcome_scores: readonly ReplayValidatorOutcomeScore[];
  readonly performance_history: readonly ReplayValidatorPerformanceRecord[];
  readonly source_reliability: readonly ReplaySourceReliabilityEvolution[];
  readonly decay_recovery_history: readonly ReplayTrustDecayRecoveryRecord[];
  readonly confidence_recalibration: readonly ReplayConfidenceRecalibrationRecord[];
  readonly consensus_weight_adaptation: readonly ReplayConsensusWeightAdaptation[];
  readonly validator_profiles: readonly ReplayValidatorTrustProfile[];
  readonly trust_lineage: readonly ReplayTrustLineageReference[];
  readonly supported_actions: readonly ReplayValidatorTrustAction[];
  readonly supported_queries: readonly ReplayValidatorTrustQuery[];
  readonly deterministic_hash: string;
}
