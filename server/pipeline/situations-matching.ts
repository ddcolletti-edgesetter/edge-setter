import type { NormalizedEvent, Situation, SituationType } from "./situations-contract";
import { normalizeSemanticFingerprint, normalizeSituationTokens } from "./situations-hash";

export interface SituationMatchFactor {
  readonly factor: "player_overlap" | "team_overlap" | "game_overlap" | "injury_semantics" | "timing_proximity" | "market_correlation" | "roster_context";
  readonly score: number;
  readonly weight: number;
  readonly contribution: number;
  readonly reason: string;
}

type MatchFactorName = SituationMatchFactor["factor"];

export interface SituationMatchResult {
  readonly matched_situation: Situation | null;
  readonly match_confidence: number;
  readonly reasoning_breakdown: readonly SituationMatchFactor[];
}

const MATCH_WEIGHTS: Record<MatchFactorName, number> = {
  player_overlap: 0.22,
  team_overlap: 0.18,
  game_overlap: 0.18,
  injury_semantics: 0.18,
  timing_proximity: 0.1,
  market_correlation: 0.08,
  roster_context: 0.06,
};

// ─── Per-type weight reallocation ───────────────────────────────────────────────
//
// Mirrors the market_alignment reallocation shipped for confidence scoring in
// situations-confidence.ts (PR #47): a factor that is structurally inapplicable to
// a situation type is dropped and its weight budget is handed to the factors that
// can actually earn it.
//
// For injury, game_overlap AND market_correlation are structurally 0 — verified 0%
// game_id coverage AND 0% market payload coverage in BOTH the situations table and
// the incoming raw_events, across the full prod dataset (scope-weight-budget.debug.ts,
// Part 2a/2b). Keeping them in the budget just depresses every genuine score by a
// constant 0.26, starving real confirmations below the 0.62 merge threshold. We drop
// the two dead factors and rescale the surviving five by 1/0.74 (budget still sums to 1.0).
//
// SAFETY: reallocation lifts false pairs (same team, different player) as well as real
// ones, so pairing safety is proven PER TYPE and NEVER assumed to transfer. This set is
// injury-ONLY. Do NOT re-add a type without re-running
// script/reallocation-pairing-safety.debug.ts against prod and confirming falseCross=0:
//   injury         — SAFE: falseCross 0/2621 at full prod scale (Part 3 + backtest).
//   roster         — UNSAFE, REJECTED: falseCross 11452/196716, ALL caused by the
//                    reallocation (newFalseCross == falseCross). Same 0% coverage profile
//                    as injury, but the pairing does NOT hold: rescaling lifts a large
//                    population of same-team, different-player transaction pairs over 0.62.
//                    (Its ~10:1 pair-to-real-match noise ratio, vs injury's ~59:1, is a
//                    separate too-loose-pairing follow-up — not the weight question.)
//   operator_note  — UNSAFE, REJECTED: falseCross 420/12443, also entirely reallocation-
//                    caused (newFalseCross == falseCross).
//
// lineup (88.4% game_id) and market (100%/94.7% market payload) are also excluded — those
// factors are real for them and reallocation was never tested.
const REALLOC_TYPES: ReadonlySet<SituationType> = new Set<SituationType>([
  "injury",
]);
const REALLOC_DROPPED_FACTORS: ReadonlySet<MatchFactorName> = new Set<MatchFactorName>([
  "game_overlap",
  "market_correlation",
]);

/**
 * Effective factor weights for a situation type. For a REALLOC_TYPE the dropped
 * factors are zeroed and the survivors are rescaled to keep a total weight of 1.0;
 * any other type keeps the base budget unchanged. Type-driven, not injury-hardcoded:
 * the identical rescale applies to every listed type. Exported for direct unit
 * testing of the weight math.
 */
export function matchWeightsForType(situationType: SituationType): Record<MatchFactorName, number> {
  if (!REALLOC_TYPES.has(situationType)) return MATCH_WEIGHTS;
  const factorNames = Object.keys(MATCH_WEIGHTS) as MatchFactorName[];
  const keptSum = factorNames
    .filter((factor) => !REALLOC_DROPPED_FACTORS.has(factor))
    .reduce((sum, factor) => sum + MATCH_WEIGHTS[factor], 0); // 0.74
  const scale = 1 / keptSum;
  const weights = {} as Record<MatchFactorName, number>;
  for (const factor of factorNames) {
    weights[factor] = REALLOC_DROPPED_FACTORS.has(factor) ? 0 : MATCH_WEIGHTS[factor] * scale;
  }
  return weights;
}

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
  const weights = matchWeightsForType(candidate.situation_type);
  const factors: SituationMatchFactor[] = [
    buildFactor(weights, "player_overlap", playerOverlap(incoming.players, candidate.players), `Players overlap: ${describePlayerOverlap(incoming.players, candidate.players)}`),
    buildFactor(weights, "team_overlap", setOverlap(incoming.teams, candidate.teams), `Teams overlap: ${describeOverlap(incoming.teams, candidate.teams)}`),
    buildFactor(weights, "game_overlap", gameOverlap(incoming.game_id, candidate.game_id), incoming.game_id && candidate.game_id ? "Same game context" : "No shared game context"),
    buildFactor(weights, "injury_semantics", semanticSimilarity(incoming.semantic_fingerprint, candidate.semantic_fingerprint), "Semantic fingerprint similarity"),
    buildFactor(weights, "timing_proximity", timingProximity(incoming.occurred_at, candidate.latest_snapshot_at ?? candidate.created_at), "Event timing proximity"),
    buildFactor(weights, "market_correlation", marketCorrelation(incoming), incoming.market_context ? "Market movement present and directionally usable" : "No market movement attached"),
    buildFactor(weights, "roster_context", rosterContextScore(incoming), incoming.roster_context ? "Roster context attached" : "No roster context attached"),
  ];

  const weighted = factors.reduce((sum, factor) => sum + factor.contribution, 0);
  return {
    matched_situation: candidate,
    match_confidence: roundScore(weighted),
    reasoning_breakdown: factors,
  };
}

function buildFactor(weights: Record<MatchFactorName, number>, factor: MatchFactorName, score: number, reason: string): SituationMatchFactor {
  const weight = weights[factor];
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

// ─── Player-name matching ──────────────────────────────────────────────────────
//
// Player names reach us in two vocabularies that plain token overlap (setOverlap)
// never reconciles: ESPN's athlete.displayName ("Patrick Surtain II") vs a name
// parsed from an RSS headline ("Pat Surtain", "P. Surtain", "Surtain"). Comparing
// those as raw token sets scores 0, which starves player_overlap and — because
// player_overlap carries the largest single weight — leaves genuine RSS-vs-detection
// confirmations unable to clear the merge threshold.
//
// This comparator is used ONLY here, inside scoreCandidate. It deliberately does NOT
// touch normalizeSituationToken / normalizeSituationTokens, which feed
// generateCanonicalSituationId and the replay hashes (situations-hash.ts) and must
// stay byte-stable.
//
// Matching rule (tolerant, but conservative — a false player-match risks a false
// MERGE, not just a missed confirmation, so anything ambiguous returns no match):
//   1. Exact match after suffix-stripping (Jr/Sr/II/III/IV/V).
//   2. Same last name AND compatible first names, where "compatible" means equal, an
//      initial that matches (one side is a single letter), or one being a strict
//      prefix of the other ("Pat"→"Patrick", "Rob"→"Robert"). Distinct first names
//      that merely share an initial ("James" vs "Jared") do NOT match, and a name
//      with no first token (last-name-only, e.g. "Surtain") only matches by rule 1.

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

interface ParsedPlayerName {
  readonly valid: boolean;
  readonly key: string;          // full normalized name after suffix strip
  readonly first: string | null; // null when only a single token is present
  readonly last: string | null;
}

function parsePlayerName(value: string): ParsedPlayerName {
  const cleaned = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ") // drop punctuation: "P." → "p", "De'Von" → "de von"
    .trim()
    .replace(/\s+/g, " ");
  if (!cleaned) return { valid: false, key: "", first: null, last: null };
  let tokens = cleaned.split(" ");
  while (tokens.length > 1 && NAME_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens = tokens.slice(0, -1);
  }
  if (tokens.length === 0) return { valid: false, key: "", first: null, last: null };
  return {
    valid: true,
    key: tokens.join(" "),
    first: tokens.length >= 2 ? tokens[0] : null,
    last: tokens[tokens.length - 1],
  };
}

function firstNameCompatible(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;              // need a first name on BOTH sides
  if (a === b) return true;
  if (a.length === 1 || b.length === 1) return a[0] === b[0]; // initial vs full
  return a.startsWith(b) || b.startsWith(a);                  // "pat" ⊂ "patrick"
}

function playerNamesMatch(a: ParsedPlayerName, b: ParsedPlayerName): boolean {
  if (!a.valid || !b.valid) return false;
  if (a.key === b.key) return true;
  if (a.last !== null && a.last === b.last && firstNameCompatible(a.first, b.first)) return true;
  return false;
}

/** Fraction of the larger list whose players find a tolerant match in the other. */
function playerOverlap(left: readonly string[], right: readonly string[]): number {
  const a = left.map(parsePlayerName).filter((n) => n.valid);
  const b = right.map(parsePlayerName).filter((n) => n.valid);
  if (a.length === 0 || b.length === 0) return 0;
  const used = new Array(b.length).fill(false);
  let shared = 0;
  for (const na of a) {
    const idx = b.findIndex((nb, i) => !used[i] && playerNamesMatch(na, nb));
    if (idx >= 0) { used[idx] = true; shared++; }
  }
  return shared / Math.max(a.length, b.length);
}

function describePlayerOverlap(left: readonly string[], right: readonly string[]): string {
  const a = left.map(parsePlayerName).filter((n) => n.valid);
  const b = right.map(parsePlayerName).filter((n) => n.valid);
  const used = new Array(b.length).fill(false);
  const matched: string[] = [];
  for (const na of a) {
    const idx = b.findIndex((nb, i) => !used[i] && playerNamesMatch(na, nb));
    if (idx >= 0) { used[idx] = true; matched.push(na.key); }
  }
  return matched.length ? matched.join(", ") : "none";
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
