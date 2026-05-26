import type { NormalizedEvent, Situation } from "./situations-contract";
import { normalizeSemanticFingerprint, normalizeSituationTokens } from "./situations-hash";

export interface SituationMatchFactor {
  readonly factor: "player_overlap" | "team_overlap" | "game_overlap" | "injury_semantics" | "timing_proximity" | "market_correlation" | "roster_context";
  readonly score: number;
  readonly weight: number;
  readonly contribution: number;
  readonly reason: string;
}

export interface SituationMatchResult {
  readonly matched_situation: Situation | null;
  readonly match_confidence: number;
  readonly reasoning_breakdown: readonly SituationMatchFactor[];
}

const MATCH_WEIGHTS = {
  player_overlap: 0.22,
  team_overlap: 0.18,
  game_overlap: 0.18,
  injury_semantics: 0.18,
  timing_proximity: 0.1,
  market_correlation: 0.08,
  roster_context: 0.06,
} as const;

export function matchSituation(
  incoming: NormalizedEvent,
  candidates: readonly (Situation & { latest_snapshot_at?: string | null })[],
  opts: { threshold?: number } = {},
): SituationMatchResult {
  const threshold = opts.threshold ?? 0.62;
  const ranked = candidates
    .filter((candidate) => candidate.league === incoming.league && candidate.situation_type === incoming.situation_type)
    .map((candidate) => scoreCandidate(incoming, candidate))
    .sort((left, right) => right.match_confidence - left.match_confidence);

  const best = ranked[0];
  if (!best || best.match_confidence < threshold) {
    return {
      matched_situation: null,
      match_confidence: best?.match_confidence ?? 0,
      reasoning_breakdown: best?.reasoning_breakdown ?? [],
    };
  }

  return best;
}

export function scoreCandidate(
  incoming: NormalizedEvent,
  candidate: Situation & { latest_snapshot_at?: string | null },
): SituationMatchResult {
  const factors: SituationMatchFactor[] = [
    buildFactor("player_overlap", setOverlap(incoming.players, candidate.players), `Players overlap: ${describeOverlap(incoming.players, candidate.players)}`),
    buildFactor("team_overlap", setOverlap(incoming.teams, candidate.teams), `Teams overlap: ${describeOverlap(incoming.teams, candidate.teams)}`),
    buildFactor("game_overlap", gameOverlap(incoming.game_id, candidate.game_id), incoming.game_id && candidate.game_id ? "Same game context" : "No shared game context"),
    buildFactor("injury_semantics", semanticSimilarity(incoming.semantic_fingerprint, candidate.semantic_fingerprint), "Semantic fingerprint similarity"),
    buildFactor("timing_proximity", timingProximity(incoming.occurred_at, candidate.latest_snapshot_at ?? candidate.created_at), "Event timing proximity"),
    buildFactor("market_correlation", marketCorrelation(incoming), incoming.market_context ? "Market movement present and directionally usable" : "No market movement attached"),
    buildFactor("roster_context", rosterContextScore(incoming), incoming.roster_context ? "Roster context attached" : "No roster context attached"),
  ];

  const weighted = factors.reduce((sum, factor) => sum + factor.contribution, 0);
  return {
    matched_situation: candidate,
    match_confidence: roundScore(weighted),
    reasoning_breakdown: factors,
  };
}

function buildFactor(factor: SituationMatchFactor["factor"], score: number, reason: string): SituationMatchFactor {
  const weight = MATCH_WEIGHTS[factor];
  return {
    factor,
    score: roundScore(score),
    weight,
    contribution: roundScore(score * weight),
    reason,
  };
}

function setOverlap(left: readonly string[], right: readonly string[]): number {
  const a = normalizeSituationTokens(left);
  const b = normalizeSituationTokens(right);
  if (a.length === 0 || b.length === 0) return 0;
  const bSet = new Set(b);
  const shared = a.filter((item) => bSet.has(item)).length;
  return shared / Math.max(a.length, b.length);
}

function describeOverlap(left: readonly string[], right: readonly string[]): string {
  const a = normalizeSituationTokens(left);
  const b = new Set(normalizeSituationTokens(right));
  const shared = a.filter((item) => b.has(item));
  return shared.length ? shared.join(", ") : "none";
}

function gameOverlap(left: string | null, right: string | null): number {
  if (!left || !right) return 0;
  return left === right ? 1 : 0;
}

function semanticSimilarity(left: string, right: string): number {
  const a = new Set(normalizeSemanticFingerprint(left).split(" ").filter(Boolean));
  const b = new Set(normalizeSemanticFingerprint(right).split(" ").filter(Boolean));
  if (a.size === 0 || b.size === 0) return 0;
  const shared = Array.from(a).filter((token) => b.has(token)).length;
  const union = new Set([...Array.from(a), ...Array.from(b)]).size;
  return shared / union;
}

function timingProximity(leftIso: string, rightIso: string): number {
  const left = Date.parse(leftIso);
  const right = Date.parse(rightIso);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
  const hours = Math.abs(left - right) / 36e5;
  if (hours <= 1) return 1;
  if (hours <= 6) return 0.82;
  if (hours <= 24) return 0.55;
  if (hours <= 72) return 0.28;
  return 0.08;
}

function marketCorrelation(incoming: NormalizedEvent): number {
  const movement = incoming.market_context;
  if (!movement) return 0;
  if (movement.delta == null || movement.delta === 0 || movement.direction === "flat") return 0.35;
  return Math.min(1, 0.45 + Math.min(Math.abs(movement.delta), 4) / 8);
}

function rosterContextScore(incoming: NormalizedEvent): number {
  const roster = incoming.roster_context;
  if (!roster) return 0;
  let score = 0.25;
  if (roster.starter) score += 0.35;
  if (roster.position) score += 0.15;
  if (roster.depth_chart_role) score += 0.15;
  if (roster.replacement_player) score += 0.1;
  return Math.min(1, score);
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
