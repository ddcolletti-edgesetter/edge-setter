import type {
  ReplayLiveSportsRuntimeLeague,
} from "./replay-live-sports-runtime-integration-contract";
import type {
  ReplayLiveInjuryReport,
  ReplayLiveOddsSnapshot,
  ReplayLiveSourceIntelligenceEvent,
} from "./replay-live-intelligence-bridge-contract";
import type {
  ReplayProductionRuntimeNode,
} from "./replay-production-orchestration-contract";
import type {
  LiveSignal,
  Outcome,
  RawEvent,
} from "./types";

export type ReplayHistoricalLeague = ReplayLiveSportsRuntimeLeague | "NFL" | "CFB";

export type ReplayHistoricalCalibrationState =
  | "ingesting"
  | "calibrating"
  | "converging"
  | "stable"
  | "drifting"
  | "insufficient_history";

export type ReplayHistoricalCalibrationAction =
  | "ingest_multi_season_replay"
  | "replay_historical_odds_movement"
  | "replay_historical_injury_intelligence"
  | "replay_historical_source_intelligence"
  | "calibrate_validator_trust"
  | "analyze_consensus_convergence"
  | "analyze_propagation_velocity"
  | "replay_governance_evolution"
  | "compare_historical_drift"
  | "reconstruct_intelligence_lineage"
  | "persist_calibration_snapshot";

export type ReplayHistoricalCalibrationQuery =
  | "get_historical_calibration_summary"
  | "get_historical_source_reliability_priors"
  | "get_historical_validator_trust_priors"
  | "get_historical_consensus_convergence_baselines"
  | "get_historical_propagation_velocity"
  | "get_historical_governance_evolution"
  | "get_historical_drift_comparison"
  | "get_historical_intelligence_lineage"
  | "get_historical_calibration_observability";

export interface ReplayHistoricalSeasonInput {
  readonly season_id: string;
  readonly league: ReplayHistoricalLeague;
  readonly season_year: number;
  readonly generated_at: string;
  readonly feeds: readonly ReplayHistoricalSportsFeedSnapshot[];
}

export interface ReplayHistoricalSportsFeedSnapshot {
  readonly league: ReplayHistoricalLeague;
  readonly generated_at: string;
  readonly raw_events: readonly RawEvent[];
  readonly live_signals: readonly LiveSignal[];
  readonly odds_snapshots: readonly ReplayLiveOddsSnapshot[];
  readonly injury_reports: readonly ReplayLiveInjuryReport[];
  readonly source_intelligence_events: readonly ReplayLiveSourceIntelligenceEvent[];
  readonly settled_outcomes: readonly Outcome[];
}

export interface ReplayHistoricalCalibrationInput {
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly seasons: readonly ReplayHistoricalSeasonInput[];
  readonly runtime_nodes: readonly ReplayProductionRuntimeNode[];
}

export interface ReplayHistoricalOddsMovementReplay {
  readonly odds_replay_id: string;
  readonly season_id: string;
  readonly league: string;
  readonly movement_count: number;
  readonly average_abs_movement: number;
  readonly positive_clv_rate: number;
  readonly odds_replay_hash: string;
}

export interface ReplayHistoricalInjuryIntelligenceReplay {
  readonly injury_replay_id: string;
  readonly season_id: string;
  readonly league: string;
  readonly injury_signal_count: number;
  readonly confirmed_injury_rate: number;
  readonly injury_outcome_hit_rate: number;
  readonly injury_replay_hash: string;
}

export interface ReplayHistoricalSourceReplay {
  readonly source_replay_id: string;
  readonly source_id: string;
  readonly league: string;
  readonly season_ids: readonly string[];
  readonly observation_count: number;
  readonly reliability_prior: number;
  readonly source_replay_hash: string;
}

export interface ReplayHistoricalValidatorTrustPrior {
  readonly prior_id: string;
  readonly validator_type: string;
  readonly league: string;
  readonly season_ids: readonly string[];
  readonly calibrated_trust_prior: number;
  readonly calibrated_weight_prior: number;
  readonly sample_count: number;
  readonly prior_hash: string;
}

export interface ReplayHistoricalConsensusConvergenceBaseline {
  readonly baseline_id: string;
  readonly league: string;
  readonly season_id: string;
  readonly average_approval_ratio: number;
  readonly average_divergence_ratio: number;
  readonly convergence_score: number;
  readonly baseline_hash: string;
}

export interface ReplayHistoricalPropagationVelocity {
  readonly velocity_id: string;
  readonly league: string;
  readonly season_id: string;
  readonly signal_count: number;
  readonly average_stream_events_per_cycle: number;
  readonly propagation_velocity_score: number;
  readonly velocity_hash: string;
}

export interface ReplayHistoricalGovernanceEvolution {
  readonly evolution_id: string;
  readonly league: string;
  readonly season_id: string;
  readonly decision_count: number;
  readonly promotion_count: number;
  readonly review_count: number;
  readonly governance_stability_score: number;
  readonly evolution_hash: string;
}

export interface ReplayHistoricalDriftComparison {
  readonly drift_id: string;
  readonly league: string;
  readonly season_id: string;
  readonly historical_drift_score: number;
  readonly baseline_drift_score: number;
  readonly drift_delta: number;
  readonly drift_hash: string;
}

export interface ReplayHistoricalIntelligenceLineage {
  readonly lineage_id: string;
  readonly league: string;
  readonly season_id: string;
  readonly runtime_hash: string;
  readonly observability_hash: string;
  readonly production_hash: string;
  readonly lineage_depth: number;
  readonly lineage_hash: string;
}

export interface ReplayHistoricalCalibrationObservability {
  readonly observability_id: string;
  readonly season_count: number;
  readonly league_count: number;
  readonly source_prior_count: number;
  readonly validator_prior_count: number;
  readonly average_convergence_score: number;
  readonly average_drift_delta: number;
  readonly observability_hash: string;
}

export interface ReplayHistoricalCalibrationSnapshot {
  readonly calibration_id: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly state: ReplayHistoricalCalibrationState;
  readonly odds_movement_replays: readonly ReplayHistoricalOddsMovementReplay[];
  readonly injury_intelligence_replays: readonly ReplayHistoricalInjuryIntelligenceReplay[];
  readonly source_replay_priors: readonly ReplayHistoricalSourceReplay[];
  readonly validator_trust_priors: readonly ReplayHistoricalValidatorTrustPrior[];
  readonly consensus_convergence_baselines: readonly ReplayHistoricalConsensusConvergenceBaseline[];
  readonly propagation_velocity: readonly ReplayHistoricalPropagationVelocity[];
  readonly governance_evolution: readonly ReplayHistoricalGovernanceEvolution[];
  readonly drift_comparison: readonly ReplayHistoricalDriftComparison[];
  readonly intelligence_lineage: readonly ReplayHistoricalIntelligenceLineage[];
  readonly observability: ReplayHistoricalCalibrationObservability;
  readonly supported_actions: readonly ReplayHistoricalCalibrationAction[];
  readonly supported_queries: readonly ReplayHistoricalCalibrationQuery[];
  readonly deterministic_hash: string;
}
