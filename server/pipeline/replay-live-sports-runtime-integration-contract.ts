import type {
  ReplayLiveBridgeInput,
  ReplayLiveInjuryReport,
  ReplayLiveOddsSnapshot,
  ReplayLiveSourceIntelligenceEvent,
} from "./replay-live-intelligence-bridge-contract";
import type {
  ReplayLiveRuntimeSnapshot,
} from "./replay-live-runtime-contract";
import type {
  ReplayObservabilitySnapshot,
} from "./replay-observability-contract";
import type {
  ReplayProductionOrchestrationSnapshot,
  ReplayProductionRuntimeNode,
} from "./replay-production-orchestration-contract";
import type {
  LiveSignal,
  Outcome,
  RawEvent,
} from "./types";

export type ReplayLiveSportsRuntimeLeague = "NBA" | "MLB";

export type ReplayLiveSportsRuntimeState =
  | "collecting"
  | "ingesting"
  | "propagating"
  | "scoring"
  | "governing"
  | "converging"
  | "degraded";

export type ReplayLiveSportsRuntimeAction =
  | "ingest_live_mlb_runtime"
  | "ingest_live_nba_runtime"
  | "ingest_odds_movement_runtime"
  | "ingest_injury_intelligence_runtime"
  | "ingest_beat_writer_intelligence"
  | "propagate_live_signal_runtime"
  | "score_real_settlement_runtime"
  | "adapt_runtime_governance"
  | "persist_live_telemetry"
  | "freeze_live_sports_runtime_snapshot";

export type ReplayLiveSportsRuntimeQuery =
  | "get_live_feed_ingestion"
  | "get_live_signal_propagation"
  | "get_real_settlement_scoring"
  | "get_runtime_governance_adaptation"
  | "get_live_telemetry_persistence";

export interface ReplayLiveSportsFeedSnapshot {
  readonly league: ReplayLiveSportsRuntimeLeague;
  readonly generated_at: string;
  readonly raw_events: readonly RawEvent[];
  readonly live_signals: readonly LiveSignal[];
  readonly odds_snapshots: readonly ReplayLiveOddsSnapshot[];
  readonly injury_reports: readonly ReplayLiveInjuryReport[];
  readonly source_intelligence_events: readonly ReplayLiveSourceIntelligenceEvent[];
  readonly settled_outcomes: readonly Outcome[];
}

export interface ReplayLiveSportsRuntimeIntegrationInput {
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly feeds: readonly ReplayLiveSportsFeedSnapshot[];
  readonly runtime_nodes: readonly ReplayProductionRuntimeNode[];
  readonly scheduler_interval_ms?: number;
}

export interface ReplayLiveFeedIngestionRecord {
  readonly ingestion_id: string;
  readonly league: ReplayLiveSportsRuntimeLeague;
  readonly raw_event_count: number;
  readonly live_signal_count: number;
  readonly odds_snapshot_count: number;
  readonly injury_report_count: number;
  readonly source_intelligence_count: number;
  readonly settled_outcome_count: number;
  readonly bridge_hash: string;
  readonly ingestion_hash: string;
}

export interface ReplayLiveSignalPropagationRecord {
  readonly propagation_id: string;
  readonly league: ReplayLiveSportsRuntimeLeague;
  readonly signal_id: string;
  readonly runtime_cycle_id: string;
  readonly bridge_replay_hash: string | null;
  readonly propagated: boolean;
  readonly propagation_hash: string;
}

export interface ReplayRealSettlementScoringRecord {
  readonly scoring_id: string;
  readonly league: ReplayLiveSportsRuntimeLeague;
  readonly outcome_id: string;
  readonly signal_id: string;
  readonly hit: boolean | null;
  readonly clv: number | null;
  readonly trust_score_count: number;
  readonly scoring_hash: string;
}

export interface ReplayRuntimeGovernanceAdaptationRecord {
  readonly adaptation_id: string;
  readonly league: ReplayLiveSportsRuntimeLeague;
  readonly runtime_cycle_id: string;
  readonly governance_decision_count: number;
  readonly promoted_count: number;
  readonly review_count: number;
  readonly adaptation_hash: string;
}

export interface ReplayLiveTelemetryPersistenceRecord {
  readonly persistence_id: string;
  readonly league: ReplayLiveSportsRuntimeLeague;
  readonly runtime_cycle_id: string;
  readonly telemetry_hash: string;
  readonly production_survivability_hash: string | null;
  readonly persisted: boolean;
  readonly persistence_hash: string;
}

export interface ReplayLiveSportsRuntimeIntegrationSnapshot {
  readonly integration_id: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly state: ReplayLiveSportsRuntimeState;
  readonly bridge_inputs: readonly ReplayLiveBridgeInput[];
  readonly runtime_snapshot: ReplayLiveRuntimeSnapshot;
  readonly observability_snapshot: ReplayObservabilitySnapshot;
  readonly production_snapshot: ReplayProductionOrchestrationSnapshot;
  readonly feed_ingestion: readonly ReplayLiveFeedIngestionRecord[];
  readonly signal_propagation: readonly ReplayLiveSignalPropagationRecord[];
  readonly settlement_scoring: readonly ReplayRealSettlementScoringRecord[];
  readonly governance_adaptation: readonly ReplayRuntimeGovernanceAdaptationRecord[];
  readonly telemetry_persistence: readonly ReplayLiveTelemetryPersistenceRecord[];
  readonly supported_actions: readonly ReplayLiveSportsRuntimeAction[];
  readonly supported_queries: readonly ReplayLiveSportsRuntimeQuery[];
  readonly deterministic_hash: string;
}
