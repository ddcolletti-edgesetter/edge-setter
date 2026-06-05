/**
 * Edge Setter — Live Signals API Client  (Sprint 8)
 *
 * Fetches LiveSignal[] from /api/v2/signals (the pipeline delivery API)
 * and adapts them to the V2Signal / NFLSignal / CFBSignal shape the boards
 * already use, so all rendering, scorer, and detail-panel code is unchanged.
 *
 * Adapter contract
 * ─────────────────
 * LiveSignal already contains a server-computed score, band, urgency_label,
 * urgency_reason and breakdown.  We inject these as the _score object so
 * the client-side scoreAndRankSignals / selectFeaturedEdge helpers see a
 * pre-scored signal and do not re-compute (they sort by _score.totalScore
 * which we set from the API's numeric score).
 *
 * Feature flag
 * ─────────────
 * VITE_USE_MOCK_DATA=true → skip API, use mocks (dev only).
 * Prod always prefers live API; falls back to mocks on network error.
 */

import { apiRequest } from "./queryClient";
import type { V2Signal, SignalType, Verdict } from "../data/v2MockData";
import type { NFLSignal, NFLSignalType } from "../data/nflMockData";
import type { CFBSignal, CFBSignalType } from "../data/cfbMockData";
import type { SignalScore, ScoreBand, UrgencyLabel } from "./signalScorer";
import { SCORE_BANDS } from "./signalScorer";
import { filterPublicSignals, sanitizeSignalForPublic } from "./publicDisplayHygiene";

/* ── Raw LiveSignal shape from /api/v2/signals ───────────── */
export interface LiveSignal {
  id: string;
  league: "NBA" | "MLB" | "NFL" | "CFB";
  game_id: string | null;
  signal_type: string;
  headline: string;
  body: string;
  action_note: string;
  why_it_matters: string;
  team: string | null;
  player: string | null;
  matchup: string | null;
  sources: Array<{ name: string; type: string }>;
  source_count: number;
  verdict: string;
  confidence: number;
  confirmation_strength: string;
  line_movement: {
    open: number;
    current: number;
    delta: number;
    direction: string;
  } | null;
  injury_designation: string | null;
  lineup_status: string | null;
  weather_note: string | null;
  betting_relevance: boolean;
  fantasy_relevance: boolean;
  score: number;
  score_band: string;
  urgency_label: string;
  urgency_reason: string;
  trust_label: string;
  score_explanation: string;
  breakdown: {
    confidenceScore: number;
    sourceQualityScore: number;
    marketImpactScore: number;
    recencyBonus: number;
    relevanceScore: number;
    contextScore: number;
    leagueModifierApplied?: string;
    rawBeforeMods?: number;
  };
  raw_event_ids: string[];
  signal_time: string;
  created_at: string;
  updated_at: string;
  outcome_id: string | null;
}

/* ── API response envelope ───────────────────────────────── */
interface SignalsResponse {
  count: number;
  signals: LiveSignal[];
}

/* ── Outcome shape ───────────────────────────────────────── */
export interface Outcome {
  id: string;
  signal_id: string;
  game_id: string;
  market: "spread" | "total" | "moneyline";
  home_score: number | null;
  away_score: number | null;
  line_at_signal: number | null;
  closing_line: number | null;
  actual_result: string | null;
  hit: boolean | null;
  clv: number | null;
  clv_points: number | null;
  recorded_at: string | null;
  created_at: string;
}

/* ── Feature flag ────────────────────────────────────────── */
const USE_MOCK = import.meta.env.VITE_USE_MOCK_DATA === "true";

/* ── Fetch from API ─────────────────────────────────────── */
export async function fetchSignals(league?: string): Promise<LiveSignal[]> {
  if (USE_MOCK) return [];
  const url = league ? `/api/v2/signals?league=${league}&limit=100` : `/api/v2/signals?limit=200`;
  const res = await apiRequest("GET", url);
  const data: SignalsResponse = await res.json();
  return filterPublicSignals(data.signals ?? []);
}

export async function fetchSignalById(id: string): Promise<LiveSignal | null> {
  try {
    const res = await apiRequest("GET", `/api/v2/signals/${id}`);
    return sanitizeSignalForPublic(await res.json());
  } catch {
    return null;
  }
}

export async function fetchOutcomesForSignal(signalId: string): Promise<Outcome[]> {
  try {
    const res = await apiRequest("GET", `/api/outcomes/${signalId}`);
    const data = await res.json();
    return data.outcomes ?? [];
  } catch {
    return [];
  }
}

/* ── Helpers ─────────────────────────────────────────────── */

/** Map API confirmation_strength → internal TrustLabel */
function toTrustLabel(s: string): "Consensus" | "Corroborated" | "Developing" | "Unverified" {
  if (s === "Confirmed" || s === "Consensus") return "Consensus";
  if (s === "Corroborated") return "Corroborated";
  if (s === "Official" || s === "Developing") return "Developing";
  return "Unverified";
}

/** Map pipeline signal_type → V2Signal type */
function toV2Type(t: string): SignalType {
  const map: Record<string, SignalType> = {
    injury_update:  "injury",
    lineup_confirm: "lineup",
    lineup_change:  "lineup",
    line_move:      "line_move",
    weather_update: "weather",
    scheme_note:    "matchup_edge",
    transaction:    "transaction",
    odds_open:      "line_move",
    manual:         "news",
  };
  return map[t] ?? "news";
}

/** Map pipeline signal_type → NFLSignalType */
function toNFLType(t: string): NFLSignalType {
  const map: Record<string, NFLSignalType> = {
    injury_update:  "injury",
    lineup_confirm: "depth",
    lineup_change:  "depth",
    line_move:      "line_move",
    weather_update: "weather",
    scheme_note:    "scheme",
    transaction:    "transaction",
    odds_open:      "line_move",
    manual:         "camp",
  };
  return map[t] ?? "camp";
}

/** Map pipeline signal_type → CFBSignalType */
function toCFBType(t: string): CFBSignalType {
  const map: Record<string, CFBSignalType> = {
    injury_update:  "injury",
    lineup_confirm: "depth",
    lineup_change:  "depth",
    line_move:      "line_move",
    weather_update: "weather",
    scheme_note:    "scheme",
    transaction:    "transaction",
    odds_open:      "line_move",
    manual:         "trend",
  };
  return map[t] ?? "trend";
}

/** Build a pre-scored SignalScore from a LiveSignal (so client scorer is bypassed) */
function buildPreScore(ls: LiveSignal): SignalScore {
  const band = (ls.score_band in SCORE_BANDS ? ls.score_band : "Informational") as ScoreBand;
  const urgencyLabel = (["LIVE","URGENT","WATCH","NOTE"].includes(ls.urgency_label)
    ? ls.urgency_label : "NOTE") as UrgencyLabel;

  const bd = ls.breakdown;
  const topFactors = Object.entries({
    Confidence:   bd.confidenceScore,
    "Src Quality": bd.sourceQualityScore,
    "Mkt Impact": bd.marketImpactScore,
    Recency:      bd.recencyBonus,
    Relevance:    bd.relevanceScore,
    Context:      bd.contextScore,
  })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  return {
    totalScore:          Math.round(ls.score * 10) / 10,
    band,
    urgencyLabel,
    urgencyReason:       ls.urgency_reason,
    trustLabel:          toTrustLabel(ls.confirmation_strength),
    topFactors,
    scoreExplanation:    ls.score_explanation,
    debugLog:            [],   // pre-scored from server — no client debug log
    breakdown: {
      confidenceScore:      bd.confidenceScore,
      sourceQualityScore:   bd.sourceQualityScore,
      marketImpactScore:    bd.marketImpactScore,
      recencyBonus:         bd.recencyBonus,
      relevanceScore:       bd.relevanceScore,
      contextScore:         bd.contextScore,
      leagueModifierApplied: bd.leagueModifierApplied ?? "none",
      rawBeforeMods:         bd.rawBeforeMods ?? ls.score,
    },
  };
}

/** Relative timestamp string from ISO */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ── Adapters ────────────────────────────────────────────── */

/**
 * LiveSignal → V2Signal (NBA + MLB boards)
 * Attaches _score so detail panels and rows show server scores.
 */
export function adaptToV2Signal(ls: LiveSignal, sport: "NBA" | "MLB"): V2Signal & { _score: SignalScore; _live: true } {
  const preScore = buildPreScore(ls);

  const lineMovement = ls.line_movement ? {
    open:      String(ls.line_movement.open),
    current:   String(ls.line_movement.current),
    direction: (ls.line_movement.direction === "up" || ls.line_movement.direction === "down"
      ? ls.line_movement.direction : "flat") as "up" | "down" | "both" | "flat",
    note:      `Moved ${ls.line_movement.delta > 0 ? "+" : ""}${ls.line_movement.delta} pts`,
  } : undefined;

  const adapted: V2Signal & { _score: SignalScore; _live: true } = {
    id:           ls.id,
    sport,
    type:         toV2Type(ls.signal_type),
    player:       ls.player ?? undefined,
    team:         ls.team ?? "—",
    opponent:     ls.matchup ?? undefined,
    headline:     ls.headline,
    detail:       ls.body,
    why_it_matters:   ls.why_it_matters,
    action_takeaway:  ls.action_note,
    verdict:      (ls.verdict as Verdict) ?? "likely",
    confidence:   ls.confidence,
    sources:      ls.source_count,
    sourceTypes:  ls.sources.map(s => s.type),
    sourceLabels: ls.sources.map(s => s.name),
    confirmationStrength: ls.confirmation_strength === "Corroborated" ? "corroborated"
      : ls.confirmation_strength === "Confirmed" || ls.confirmation_strength === "Consensus" ? "consensus"
      : "single",
    timestamp:    relativeTime(ls.signal_time ?? ls.created_at),
    isoTimestamp: ls.signal_time ?? ls.created_at,
    tags:         [ls.league, ls.signal_type, ls.team ?? ""].filter(Boolean),
    lineMovement,
    bettingRelevance: ls.betting_relevance,
    fantasyRelevance: ls.fantasy_relevance,
    hitRateStub:          null,
    closingLineValueStub: null,
    _stub:  true as const,  // keep field present (V2Signal requires it)
    _score: preScore,
    _live:  true as const,
  };
  return adapted;
}

/**
 * LiveSignal → NFLSignal
 * Attaches _score so NFLBoard detail panel shows server scores.
 */
export function adaptToNFLSignal(ls: LiveSignal): NFLSignal & { _score: SignalScore; _live: true } {
  const preScore = buildPreScore(ls);

  const lineMovement = ls.line_movement ? {
    open:      String(ls.line_movement.open),
    current:   String(ls.line_movement.current),
    direction: (["up","down","both","flat"].includes(ls.line_movement.direction)
      ? ls.line_movement.direction : "flat") as "up" | "down" | "both" | "flat",
    note:      `Moved ${ls.line_movement.delta > 0 ? "+" : ""}${ls.line_movement.delta} pts`,
  } : undefined;

  return {
    id:           ls.id,
    type:         toNFLType(ls.signal_type),
    player:       ls.player ?? undefined,
    team:         ls.team ?? "—",
    opponent:     ls.matchup ?? undefined,
    headline:     ls.headline,
    detail:       ls.body,
    why_it_matters:   ls.why_it_matters,
    action_takeaway:  ls.action_note,
    verdict:      ls.verdict as Verdict,
    confidence:   ls.confidence,
    sources:      ls.source_count,
    sourceTypes:  ls.sources.map(s => s.type),
    sourceLabels: ls.sources.map(s => s.name),
    confirmationStrength: ls.confirmation_strength === "Corroborated" ? "corroborated"
      : ls.confirmation_strength === "Confirmed" || ls.confirmation_strength === "Consensus" ? "consensus"
      : "single",
    timestamp:    relativeTime(ls.signal_time ?? ls.created_at),
    isoTimestamp: ls.signal_time ?? ls.created_at,
    tags:         [ls.league, ls.signal_type, ls.team ?? ""].filter(Boolean),
    lineMovement,
    bettingRelevance: ls.betting_relevance,
    fantasyRelevance: ls.fantasy_relevance,
    hitRateStub:          null,
    closingLineValueStub: null,
    injuryDesignation: ls.injury_designation ?? undefined,
    _stub: true as const,
    _score: preScore,
    _live:  true as const,
  } as NFLSignal & { _score: SignalScore; _live: true };
}

/**
 * LiveSignal → CFBSignal
 */
export function adaptToCFBSignal(ls: LiveSignal): CFBSignal & { _score: SignalScore; _live: true } {
  const preScore = buildPreScore(ls);

  const lineMovement = ls.line_movement ? {
    open:      String(ls.line_movement.open),
    current:   String(ls.line_movement.current),
    direction: (["up","down","both","flat"].includes(ls.line_movement.direction)
      ? ls.line_movement.direction : "flat") as "up" | "down" | "both" | "flat",
    note:      `Moved ${ls.line_movement.delta > 0 ? "+" : ""}${ls.line_movement.delta} pts`,
  } : undefined;

  return {
    id:           ls.id,
    type:         toCFBType(ls.signal_type),
    player:       ls.player ?? undefined,
    team:         ls.team ?? "—",
    opponent:     ls.matchup ?? undefined,
    headline:     ls.headline,
    detail:       ls.body,
    why_it_matters:   ls.why_it_matters,
    action_takeaway:  ls.action_note,
    verdict:      ls.verdict as Verdict,
    confidence:   ls.confidence,
    sources:      ls.source_count,
    sourceTypes:  ls.sources.map(s => s.type),
    sourceLabels: ls.sources.map(s => s.name),
    confirmationStrength: ls.confirmation_strength === "Corroborated" ? "corroborated"
      : ls.confirmation_strength === "Confirmed" || ls.confirmation_strength === "Consensus" ? "consensus"
      : "single",
    timestamp:    relativeTime(ls.signal_time ?? ls.created_at),
    isoTimestamp: ls.signal_time ?? ls.created_at,
    tags:         [ls.league, ls.signal_type, ls.team ?? ""].filter(Boolean),
    lineMovement,
    bettingRelevance: ls.betting_relevance,
    fantasyRelevance: ls.fantasy_relevance,
    hitRateStub:          null,
    closingLineValueStub: null,
    injuryDesignation: ls.injury_designation ?? undefined,
    _stub: true as const,
    _score: preScore,
    _live:  true as const,
  } as CFBSignal & { _score: SignalScore; _live: true };
}
