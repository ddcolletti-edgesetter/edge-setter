import { computeCanonicalHash } from "./replay-archive";
import {
  computeSituationConfidence,
  type SituationConfidenceInput,
} from "./situations-confidence";
import type {
  NormalizedEvent,
  Situation,
  SituationConfidenceHistory,
  SituationEvent,
  SituationSnapshot,
  SituationStateHistory,
} from "./situations-contract";
import { canonicalSituationFingerprint, generateCanonicalSituationId } from "./situations-hash";
import { matchSituation, type SituationMatchResult } from "./situations-matching";
import { createSituationSnapshot } from "./situations-snapshot";
import { buildSituationEvidenceLineage } from "./situations-lineage";
import {
  appendSituationConfidenceHistory,
  appendSituationEvent,
  appendSituationSnapshot,
  appendSituationStateHistory,
  buildSituationEvent,
  createHistoryId,
  getLatestSituationSnapshot,
  insertSituation,
  listSituationsForMatching,
} from "./situations-store";
import { transitionSituationLifecycle, type SituationLifecycleTrigger } from "./situations-lifecycle";

export interface CanonicalSituationEvolutionInput {
  readonly event: NormalizedEvent;
  readonly confidence_input: SituationConfidenceInput;
  readonly lifecycle_trigger?: SituationLifecycleTrigger;
}

export interface CanonicalSituationEvolutionResult {
  readonly situation: Situation;
  readonly matched: boolean;
  readonly match: SituationMatchResult;
  readonly event: SituationEvent;
  readonly confidence_history: SituationConfidenceHistory;
  readonly state_history: SituationStateHistory;
  readonly snapshot: SituationSnapshot;
}

export function evolveCanonicalSituation(input: CanonicalSituationEvolutionInput): CanonicalSituationEvolutionResult {
  const candidates = listSituationsForMatching({
    league: input.event.league,
    situation_type: input.event.situation_type,
    limit: 150,
  });
  const match = matchSituation(input.event, candidates);
  const situation = match.matched_situation ?? buildSituationFromNormalizedEvent(input.event);
  const matched = Boolean(match.matched_situation);

  if (!matched) insertSituation(situation);

  const previousSnapshot = getLatestSituationSnapshot(situation.situation_id);
  const evidenceLineage = buildSituationEvidenceLineage(input.event);
  const evidenceEvent = appendSituationEvent(buildSituationEvent({
    situation_id: situation.situation_id,
    kind: matched ? "situation_matched" : "situation_created",
    raw_event_id: input.event.raw_event_id,
    normalized_event_id: input.event.normalized_event_id,
    source_id: input.event.source_id,
    observed_at: input.event.occurred_at,
    recorded_at: input.event.received_at,
    payload: {
      normalized_event: input.event,
      evidence_lineage: evidenceLineage,
      match_confidence: match.match_confidence,
      match_reasoning: match.reasoning_breakdown,
    },
  }));

  const confidence = computeSituationConfidence(input.confidence_input);
  const confidenceHistory = appendSituationConfidenceHistory(buildConfidenceHistory({
    situation_id: situation.situation_id,
    previous_confidence: previousSnapshot?.confidence.score ?? null,
    confidence,
    event_id: evidenceEvent.event_id,
  }));

  const lifecycle = transitionSituationLifecycle({
    current_state: previousSnapshot?.lifecycle_state ?? null,
    trigger: (input.lifecycle_trigger === "official_confirmation" && !matched)
      ? defaultLifecycleTrigger(input.event)
      : (input.lifecycle_trigger ?? defaultLifecycleTrigger(input.event)),
    confidence: confidence.score,
    evidence_count: countEvidence(previousSnapshot) + 1,
    hours_since_latest_evidence: hoursBetween(input.event.occurred_at, input.event.received_at),
    official: input.event.event_type === "official_resolution",
    contradiction_count: confidence.factors.contradiction_penalty > 0 ? 1 : 0,
  });

  const stateHistory = appendSituationStateHistory(buildStateHistory({
    situation_id: situation.situation_id,
    previous_state: previousSnapshot?.lifecycle_state ?? null,
    new_state: lifecycle.new_state,
    transition_reason: lifecycle.transition_reason,
    trigger_event_id: evidenceEvent.event_id,
    metadata: lifecycle.metadata,
    created_at: input.event.received_at,
  }));

  const snapshot = appendSituationSnapshot(createSituationSnapshot({
    situation_id: situation.situation_id,
    lifecycle_state: lifecycle.new_state,
    confidence,
    summary: input.event.summary,
    escalation_score: deriveEscalationScore(confidence.score, lifecycle.new_state),
    timing_pressure: deriveTimingPressure(input.event, confidence.score),
    evidence_event_ids: [...(previousSnapshot?.evidence_event_ids ?? []), evidenceEvent.event_id],
    previous_snapshot_hash: previousSnapshot?.replay_hash ?? null,
    created_at: input.event.received_at,
  }));

  appendSituationEvent(buildSituationEvent({
    situation_id: situation.situation_id,
    kind: "snapshot_created",
    raw_event_id: input.event.raw_event_id,
    normalized_event_id: input.event.normalized_event_id,
    source_id: "canonical_situation_engine",
    observed_at: input.event.received_at,
    recorded_at: input.event.received_at,
    payload: {
      snapshot_id: snapshot.snapshot_id,
      snapshot_replay_hash: snapshot.replay_hash,
      evidence_lineage: evidenceLineage,
      confidence_history_id: confidenceHistory.history_id,
      state_history_id: stateHistory.history_id,
    },
  }));

  return {
    situation,
    matched,
    match,
    event: evidenceEvent,
    confidence_history: confidenceHistory,
    state_history: stateHistory,
    snapshot,
  };
}

export function buildSituationFromNormalizedEvent(event: NormalizedEvent): Situation {
  const identity = {
    sport: event.sport,
    league: event.league,
    teams: event.teams,
    players: event.players,
    situation_type: event.situation_type,
    semantic_fingerprint: event.semantic_fingerprint,
  };

  return {
    situation_id: generateCanonicalSituationId(identity),
    canonical_hash: canonicalSituationFingerprint(identity),
    sport: event.sport,
    league: event.league,
    game_id: event.game_id,
    teams: [...event.teams].sort(),
    players: [...event.players].sort(),
    situation_type: event.situation_type,
    semantic_fingerprint: event.semantic_fingerprint,
    created_from_event_id: event.normalized_event_id,
    created_at: event.received_at,
  };
}

function buildConfidenceHistory(input: {
  readonly situation_id: string;
  readonly previous_confidence: number | null;
  readonly confidence: ReturnType<typeof computeSituationConfidence>;
  readonly event_id: string;
}): SituationConfidenceHistory {
  const payload = {
    situation_id: input.situation_id,
    previous_confidence: input.previous_confidence,
    new_confidence: input.confidence.score,
    factor_breakdown: input.confidence.factors,
    reasoning: input.confidence.reasoning,
    event_id: input.event_id,
    created_at: input.confidence.computed_at,
  };

  return {
    ...payload,
    history_id: createHistoryId("sch", payload),
    replay_hash: computeCanonicalHash(payload),
  };
}

function buildStateHistory(input: Omit<SituationStateHistory, "history_id" | "replay_hash">): SituationStateHistory {
  return {
    ...input,
    history_id: createHistoryId("ssh", input),
    replay_hash: computeCanonicalHash(input),
  };
}

function defaultLifecycleTrigger(event: NormalizedEvent): SituationLifecycleTrigger {
  if (event.event_type === "official_resolution") return "official_confirmation";
  if (event.event_type === "market_reaction" || event.situation_type === "market") return "market_reaction";
  if (event.event_type === "validator_update") return "validator_confirmation";
  return "evidence_added";
}

function countEvidence(snapshot: SituationSnapshot | null): number {
  return snapshot?.evidence_event_ids.length ?? 0;
}

function hoursBetween(leftIso: string, rightIso: string): number {
  const left = Date.parse(leftIso);
  const right = Date.parse(rightIso);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
  return Math.max(0, Math.round(Math.abs(right - left) / 36e5));
}

function deriveEscalationScore(confidence: number, state: string): number {
  const stateBonus: Record<string, number> = {
    watching: 0,
    emerging: 8,
    developing: 16,
    escalating: 28,
    confirmed: 22,
    official: 12,
    cooling: -12,
    resolved: -20,
    archived: -35,
    invalidated: -45,
  };
  return Math.max(0, Math.min(100, confidence + (stateBonus[state] ?? 0)));
}

function deriveTimingPressure(event: NormalizedEvent, confidence: number): SituationSnapshot["timing_pressure"] {
  if (event.market_context?.delta && Math.abs(event.market_context.delta) >= 2 && confidence >= 75) return "critical";
  if (event.market_context?.delta && Math.abs(event.market_context.delta) >= 1) return "high";
  if (event.game_id && confidence >= 65) return "medium";
  if (confidence >= 40) return "low";
  return "inactive";
}
