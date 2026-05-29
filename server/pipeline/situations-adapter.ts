import { computeCanonicalHash } from "./replay-archive";
import type { SituationConfidenceInput } from "./situations-confidence";
import type { NormalizedEvent, SituationSport, SituationType } from "./situations-contract";
import type { League, LiveSignal, RawEvent } from "./types";

export function rawEventToNormalizedEvent(raw: RawEvent, signal: LiveSignal): NormalizedEvent {
  const payload = raw.payload as Record<string, any>;
  const teams = normalizeTeams([
    raw.team,
    payload.team,
    payload.home_team,
    payload.away_team,
    ...teamsFromMatchup(payload.matchup ?? signal.matchup),
  ]);
  const players = normalizePlayers([raw.player, payload.player, payload.player_name]);
  const situationType = situationTypeFromRaw(raw);
  const semanticFingerprint = semanticFingerprintFor(raw, signal, situationType);
  const seed = {
    raw_event_id: raw.id,
    source_id: raw.source_id,
    league: raw.league,
    game_id: raw.game_id,
    team: raw.team,
    player: raw.player,
    event_type: raw.event_type,
    semantic_fingerprint: semanticFingerprint,
    received_at: raw.received_at,
  };

  return {
    normalized_event_id: `ne_${computeCanonicalHash(seed).slice(0, 24)}`,
    raw_event_id: raw.id,
    source_id: raw.source_id,
    source_type: raw.source_type,
    sport: sportForLeague(raw.league),
    league: raw.league,
    game_id: raw.game_id,
    teams,
    players,
    event_type: raw.event_type,
    situation_type: situationType,
    semantic_fingerprint: semanticFingerprint,
    occurred_at: payload.occurred_at ?? payload.event_time ?? raw.created_at,
    received_at: raw.received_at,
    summary: signal.headline || signal.body || `${raw.event_type} event`,
    market_context: signal.line_movement
      ? {
          market: payload.market ?? "spread",
          open: signal.line_movement.open,
          current: signal.line_movement.current,
          delta: signal.line_movement.delta,
          direction: signal.line_movement.direction,
          sportsbook: payload.sportsbook ?? null,
        }
      : undefined,
    roster_context: {
      position: payload.position ?? null,
      starter: payload.starter ?? payload.is_starter ?? null,
      depth_chart_role: payload.depth_chart_role ?? payload.role ?? null,
      replacement_player: payload.replacement_player ?? null,
    },
    payload: {
      raw_payload: payload,
      signal_id: signal.id,
      signalId: signal.id,
      signal_lineage: {
        signalId: signal.id,
        rawEventId: raw.id,
        sourceEventId: raw.source_id,
        lineageStatus: "signal_linked",
      },
      signal_type: signal.signal_type,
      signal_verdict: signal.verdict,
      trust_label: signal.trust_label,
      score_band: signal.score_band,
      confidence: signal.confidence,
    },
  };
}

export function confidenceInputFromRawEvent(raw: RawEvent, signal: LiveSignal): SituationConfidenceInput {
  const payload = raw.payload as Record<string, any>;
  const sourceCount = Math.max(signal.source_count, Number(payload.source_count ?? 1));
  const confirmation = String(signal.confirmation_strength ?? payload.confirmation ?? "").toLowerCase();
  const sourceTypes = Array.isArray(payload.source_types) ? payload.source_types.map(String) : signal.sources.map((source) => source.type);
  const official = sourceTypes.some((source) => /official|league|team|statsapi|espn/i.test(source)) ||
    confirmation.includes("consensus") ||
    signal.verdict === "confirmed";
  const lineDelta = signal.line_movement?.delta ?? Number(payload.line_delta ?? 0);
  const freshness = freshnessScore(raw.received_at, new Date(raw.received_at).toISOString());
  const confidenceBase = Math.max(0, Math.min(100, signal.confidence));

  return {
    source_reliability: Math.min(22, Math.max(8, confidenceBase * 0.22)),
    independent_confirmations: Math.min(18, Math.max(0, (sourceCount - 1) * 6 + (confirmation.includes("corroborated") ? 4 : 0))),
    market_alignment: Math.min(16, Math.abs(lineDelta) * 4 + (signal.betting_relevance ? 2 : 0)),
    validator_agreement: Math.min(14, Number(payload.validator_agreement ?? 0)),
    official_confirmation: official ? Math.min(20, confirmation.includes("consensus") ? 18 : 12) : 0,
    freshness,
    contradiction_penalty: signal.verdict === "contradicted" ? 30 : Number(payload.contradiction_penalty ?? 0),
    computed_at: raw.received_at,
  };
}

function sportForLeague(league: League): SituationSport {
  if (league === "MLB") return "baseball";
  if (league === "NBA") return "basketball";
  return "football";
}

function situationTypeFromRaw(raw: RawEvent): SituationType {
  switch (raw.event_type) {
    case "injury_update": return "injury";
    case "lineup_confirm":
    case "lineup_change": return "lineup";
    case "line_move":
    case "odds_open": return "market";
    case "weather_update": return "weather";
    case "transaction": return "roster";
    case "scheme_note": return "scheme";
    default: return "operator_note";
  }
}

function semanticFingerprintFor(raw: RawEvent, signal: LiveSignal, situationType: SituationType): string {
  const payload = raw.payload as Record<string, any>;
  const pieces = [
    situationType,
    raw.event_type,
    raw.player,
    raw.team,
    payload.designation,
    payload.status,
    payload.body_part,
    payload.injury,
    payload.transaction_type,
    payload.market,
    payload.conditions,
    signal.injury_designation,
    signal.lineup_status,
  ];
  return pieces.filter(Boolean).join(" ");
}

function normalizeTeams(values: readonly unknown[]): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim().toUpperCase()).filter(Boolean))).sort();
}

function normalizePlayers(values: readonly unknown[]): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))).sort();
}

function teamsFromMatchup(matchup: unknown): string[] {
  if (!matchup || typeof matchup !== "string") return [];
  return matchup.split(/\s+@\s+|\s+vs\.?\s+/i).map((team) => team.trim()).filter(Boolean);
}

function freshnessScore(occurredAt: string, receivedAt: string): number {
  const occurred = Date.parse(occurredAt);
  const received = Date.parse(receivedAt);
  if (!Number.isFinite(occurred) || !Number.isFinite(received)) return 6;
  const hours = Math.max(0, Math.abs(received - occurred) / 36e5);
  if (hours <= 1) return 10;
  if (hours <= 6) return 8;
  if (hours <= 24) return 5;
  return 2;
}
