import { computeCanonicalHash } from "./canonical-hash";
import type { NormalizedEvent, SituationType } from "./situations-contract";
import type { League } from "./types";

export function normalizeSituationToken(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeSituationTokens(values: readonly string[]): string[] {
  return Array.from(new Set(values.map(normalizeSituationToken).filter(Boolean))).sort();
}

export function canonicalSituationFingerprint(input: {
  readonly sport: string;
  readonly league: League;
  readonly teams: readonly string[];
  readonly players: readonly string[];
  readonly situation_type: SituationType;
  readonly semantic_fingerprint: string;
}): string {
  return computeCanonicalHash({
    sport: normalizeSituationToken(input.sport),
    league: input.league,
    teams: normalizeSituationTokens(input.teams),
    players: normalizeSituationTokens(input.players),
    situation_type: input.situation_type,
    semantic_fingerprint: normalizeSemanticFingerprint(input.semantic_fingerprint),
  });
}

export function generateCanonicalSituationId(input: {
  readonly sport: string;
  readonly league: League;
  readonly teams: readonly string[];
  readonly players: readonly string[];
  readonly situation_type: SituationType;
  readonly semantic_fingerprint: string;
}): string {
  return `sit_${canonicalSituationFingerprint(input).slice(0, 24)}`;
}

export function normalizedEventReplayHash(event: NormalizedEvent): string {
  return computeCanonicalHash({
    normalized_event_id: event.normalized_event_id,
    raw_event_id: event.raw_event_id,
    source_id: event.source_id,
    source_type: event.source_type,
    sport: event.sport,
    league: event.league,
    game_id: event.game_id,
    teams: normalizeSituationTokens(event.teams),
    players: normalizeSituationTokens(event.players),
    event_type: event.event_type,
    situation_type: event.situation_type,
    semantic_fingerprint: normalizeSemanticFingerprint(event.semantic_fingerprint),
    occurred_at: event.occurred_at,
    received_at: event.received_at,
    market_context: event.market_context ?? null,
    roster_context: event.roster_context ?? null,
    payload: event.payload,
  });
}

export function normalizeSemanticFingerprint(value: string): string {
  const normalized = normalizeSituationToken(value);
  return normalized
    .replace(/\bquestionable\b/g, "injury status uncertain")
    .replace(/\bdoubtful\b/g, "injury status unlikely")
    .replace(/\bout\b/g, "injury unavailable")
    .replace(/\bil\b/g, "injured list")
    .replace(/\bday to day\b/g, "injury status uncertain")
    .replace(/\blineup confirmed\b/g, "lineup confirmation")
    .replace(/\bstarting lineup\b/g, "lineup confirmation");
}
