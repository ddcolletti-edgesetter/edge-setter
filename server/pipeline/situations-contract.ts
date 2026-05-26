import type { League, RawEventType, SignalType } from "./types";

export type SituationSport = "basketball" | "baseball" | "football";

export type SituationLifecycleState =
  | "watching"
  | "emerging"
  | "developing"
  | "escalating"
  | "confirmed"
  | "official"
  | "cooling"
  | "resolved"
  | "archived"
  | "invalidated";

export type SituationType =
  | "injury"
  | "lineup"
  | "market"
  | "weather"
  | "roster"
  | "scheme"
  | "game_state"
  | "operator_note";

export type SituationEventKind =
  | "event_ingested"
  | "evidence_attached"
  | "situation_created"
  | "situation_matched"
  | "state_changed"
  | "confidence_changed"
  | "validator_changed"
  | "market_reacted"
  | "snapshot_created"
  | "relationship_added";

export type SituationRelationshipType =
  | "parent"
  | "child"
  | "related"
  | "supersedes"
  | "contradicts"
  | "duplicates";

export interface SituationMarketContext {
  readonly market?: "spread" | "total" | "moneyline" | "player_prop";
  readonly open?: number | null;
  readonly current?: number | null;
  readonly delta?: number | null;
  readonly direction?: "up" | "down" | "flat" | null;
  readonly sportsbook?: string | null;
}

export interface SituationRosterContext {
  readonly position?: string | null;
  readonly starter?: boolean | null;
  readonly depth_chart_role?: string | null;
  readonly replacement_player?: string | null;
}

export interface NormalizedEvent {
  readonly normalized_event_id: string;
  readonly raw_event_id: string | null;
  readonly source_id: string;
  readonly source_type: "api" | "manual" | "scrape" | "validator" | "market";
  readonly sport: SituationSport;
  readonly league: League;
  readonly game_id: string | null;
  readonly teams: readonly string[];
  readonly players: readonly string[];
  readonly event_type: RawEventType | SignalType | "validator_update" | "market_reaction" | "official_resolution";
  readonly situation_type: SituationType;
  readonly semantic_fingerprint: string;
  readonly occurred_at: string;
  readonly received_at: string;
  readonly summary: string;
  readonly market_context?: SituationMarketContext;
  readonly roster_context?: SituationRosterContext;
  readonly payload: Record<string, unknown>;
}

export interface Situation {
  readonly situation_id: string;
  readonly canonical_hash: string;
  readonly sport: SituationSport;
  readonly league: League;
  readonly game_id: string | null;
  readonly teams: readonly string[];
  readonly players: readonly string[];
  readonly situation_type: SituationType;
  readonly semantic_fingerprint: string;
  readonly created_from_event_id: string | null;
  readonly created_at: string;
}

export interface SituationEvent {
  readonly event_id: string;
  readonly situation_id: string;
  readonly kind: SituationEventKind;
  readonly raw_event_id: string | null;
  readonly normalized_event_id: string | null;
  readonly source_id: string | null;
  readonly observed_at: string;
  readonly recorded_at: string;
  readonly replay_hash: string;
  readonly lineage_hash: string;
  readonly payload: Record<string, unknown>;
}

export interface SituationConfidenceFactorBreakdown {
  readonly source_reliability: number;
  readonly independent_confirmations: number;
  readonly market_alignment: number;
  readonly validator_agreement: number;
  readonly official_confirmation: number;
  readonly freshness: number;
  readonly contradiction_penalty: number;
}

export interface SituationConfidenceExplanation {
  readonly score: number;
  readonly factors: SituationConfidenceFactorBreakdown;
  readonly reasoning: readonly string[];
  readonly computed_at: string;
  readonly replay_hash: string;
}

export interface SituationSnapshot {
  readonly snapshot_id: string;
  readonly situation_id: string;
  readonly lifecycle_state: SituationLifecycleState;
  readonly confidence: SituationConfidenceExplanation;
  readonly summary: string;
  readonly escalation_score: number;
  readonly timing_pressure: "inactive" | "low" | "medium" | "high" | "critical";
  readonly evidence_event_ids: readonly string[];
  readonly replay_hash: string;
  readonly previous_snapshot_hash: string | null;
  readonly created_at: string;
}

export interface SituationConfidenceHistory {
  readonly history_id: string;
  readonly situation_id: string;
  readonly previous_confidence: number | null;
  readonly new_confidence: number;
  readonly factor_breakdown: SituationConfidenceFactorBreakdown;
  readonly reasoning: readonly string[];
  readonly event_id: string | null;
  readonly replay_hash: string;
  readonly created_at: string;
}

export interface SituationStateHistory {
  readonly history_id: string;
  readonly situation_id: string;
  readonly previous_state: SituationLifecycleState | null;
  readonly new_state: SituationLifecycleState;
  readonly transition_reason: string;
  readonly trigger_event_id: string | null;
  readonly metadata: Record<string, unknown>;
  readonly replay_hash: string;
  readonly created_at: string;
}

export interface SituationRelationship {
  readonly relationship_id: string;
  readonly source_situation_id: string;
  readonly target_situation_id: string;
  readonly relationship_type: SituationRelationshipType;
  readonly confidence: number;
  readonly reasoning: readonly string[];
  readonly created_at: string;
  readonly replay_hash: string;
}
