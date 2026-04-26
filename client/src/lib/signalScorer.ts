/* ────────────────────────────────────────────────────────────
   Edge Setter — Signal Scoring Engine
   Sprint 6: Signal Scoring, Ranking & Trust Weighting

   Produces a composite score (0–100) per signal with a full
   factor breakdown and plain-English explanation. Designed
   to be transparent, inspectable, and extensible.

   Score components (max points):
   ┌─────────────────────────┬────────┐
   │ confidenceScore         │   20   │ Raw signal confidence
   │ sourceQualityScore      │   25   │ Source tier × count × confirmation
   │ recencyScore            │   20   │ Minutes-old decay curve
   │ marketImpactScore       │   20   │ Line move + sharp + market timing
   │ relevanceScore          │    8   │ Betting + fantasy flags
   │ contextScore            │    7   │ Matchup/scheme/rotation depth
   ├─────────────────────────┼────────┤
   │ TOTAL (before league)   │  100   │
   └─────────────────────────┴────────┘
   League modifiers are applied AFTER the base score is computed
   to avoid inflating the 0–100 scale. They shift component
   weights proportionally, then renormalize.

   Urgency labels are derived post-score and use freshness + total.
   ──────────────────────────────────────────────────────────── */

import { computeSourceQuality } from "./sourceWeighter";
import { getLeagueModifiers, normalizeSignalType, type Sport } from "./leagueModifiers";
import type { ConfirmationStrength, Verdict, LineMovement } from "../data/v2MockData";

/* ── Public types ────────────────────────────────────────── */

export type UrgencyLabel = "LIVE" | "URGENT" | "WATCH" | "NOTE";
export type TrustLabel   = "Consensus" | "Corroborated" | "Developing" | "Unverified";

export interface ScoreBreakdown {
  confidenceScore:    number;   // 0–20
  sourceQualityScore: number;   // 0–25
  recencyScore:       number;   // 0–20
  marketImpactScore:  number;   // 0–20
  relevanceScore:     number;   // 0–8
  contextScore:       number;   // 0–7
}

export interface SignalScore {
  totalScore:         number;           // 0–100 (normalized)
  breakdown:          ScoreBreakdown;
  urgencyLabel:       UrgencyLabel;
  trustLabel:         TrustLabel;
  scoreExplanation:   string;           // plain-English "why this scored here"
  topFactors:         string[];         // 3 most important drivers
  debugLog:           string[];         // verbose inspection lines
}

/* ── Scoring inputs ────────────────────────────────────────  */

export interface ScoringInput {
  sport:                Sport;
  type:                 string;         // signal type key
  verdict:              Verdict;
  confidence:           number;         // 0–100
  sources:              number;
  sourceTypes?:         string[];
  sourceLabels?:        string[];
  confirmationStrength?:ConfirmationStrength;
  isoTimestamp?:        string;         // ISO 8601
  timestamp?:           string;         // human-readable fallback
  lineMovement?:        LineMovement;
  bettingRelevance?:    boolean;
  fantasyRelevance?:    boolean;
  // Context depth signals
  rotationNote?:        string;
  matchupEdge?:         string;
  schemeNote?:          string;
  pitcherMatchup?:      string;
  lineupStatus?:        string;
  weatherNote?:         string;
  injuryDesignation?:   string;
  whyItMatters?:        string;
}

/* ────────────────────────────────────────────────────────────
   1. Confidence score  (0–20)
   ──────────────────────────────────────────────────────────── */
function scoreConfidence(confidence: number): number {
  // Straight proportion: 100% conf → 20 pts, 50% conf → 10 pts
  return parseFloat(((confidence / 100) * 20).toFixed(2));
}

/* ────────────────────────────────────────────────────────────
   2. Recency score  (0–20)
   Decay curve based on minutes since isoTimestamp.
   Fallback: parse relative timestamp string.
   ──────────────────────────────────────────────────────────── */
const RECENCY_BRACKETS: Array<{ maxMinutes: number; points: number }> = [
  { maxMinutes: 15,    points: 20 },
  { maxMinutes: 60,    points: 16 },
  { maxMinutes: 180,   points: 12 },
  { maxMinutes: 360,   points:  8 },
  { maxMinutes: 720,   points:  4 },
  { maxMinutes: Infinity, points: 2 },
];

function minutesSince(isoTimestamp?: string, relativeTs?: string): number {
  if (isoTimestamp) {
    const ms = Date.now() - new Date(isoTimestamp).getTime();
    return ms / 60000;
  }
  // Parse relative string: "22m ago", "2h ago", "8h ago"
  if (relativeTs) {
    const mMatch = relativeTs.match(/(\d+)m/);
    const hMatch = relativeTs.match(/(\d+)h/);
    const dMatch = relativeTs.match(/(\d+)d/);
    if (mMatch) return parseInt(mMatch[1]);
    if (hMatch) return parseInt(hMatch[1]) * 60;
    if (dMatch) return parseInt(dMatch[1]) * 1440;
  }
  return 480; // default 8h if unknown
}

function scoreRecency(isoTimestamp?: string, timestamp?: string): { score: number; ageMinutes: number } {
  const ageMinutes = minutesSince(isoTimestamp, timestamp);
  const bracket = RECENCY_BRACKETS.find(b => ageMinutes <= b.maxMinutes);
  return { score: bracket?.points ?? 2, ageMinutes };
}

/* ────────────────────────────────────────────────────────────
   3. Market impact score  (0–20)
   Measures how much this signal moves or confirms the market.
   ──────────────────────────────────────────────────────────── */
function scoreMarketImpact(opts: {
  lineMovement?:     LineMovement;
  bettingRelevance?: boolean;
  type:              string;
  verdict:           Verdict;
  injuryDesignation?:string;
}): { score: number; factors: string[] } {
  let score = 0;
  const factors: string[] = [];
  const { lineMovement, bettingRelevance, type, verdict, injuryDesignation } = opts;
  const normType = normalizeSignalType(type);

  /* Line movement magnitude */
  if (lineMovement) {
    const openNum  = parseFloat(lineMovement.open.replace(/[^0-9.\-]/g, "")) || 0;
    const currNum  = parseFloat(lineMovement.current.replace(/[^0-9.\-]/g, "")) || 0;
    const magnitude = Math.abs(Math.abs(currNum) - Math.abs(openNum));

    if (magnitude >= 2.0) {
      score += 12; factors.push(`${magnitude.toFixed(1)}-pt line move (high impact)`);
    } else if (magnitude >= 1.0) {
      score += 8; factors.push(`${magnitude.toFixed(1)}-pt line move`);
    } else if (magnitude >= 0.5) {
      score += 5; factors.push(`${magnitude.toFixed(1)}-pt line move`);
    } else if (magnitude > 0) {
      score += 3; factors.push(`${magnitude.toFixed(1)}-pt line shift`);
    }

    /* Sharp money tag in the note */
    if (lineMovement.note?.toLowerCase().includes("sharp")) {
      score += 4; factors.push("sharp money confirmed");
    }
    /* Key number crossing — spread crossing -3, -6.5, -7, -10 or total crossing integer */
    const keyNumbers = [3, 3.5, 6.5, 7, 10, 10.5];
    for (const kn of keyNumbers) {
      const open = Math.abs(openNum);
      const curr = Math.abs(currNum);
      if ((open < kn && curr >= kn) || (open > kn && curr <= kn)) {
        score += 3; factors.push(`crossed key number ${kn}`);
        break;
      }
    }
  }

  /* Signal type inherent market impact */
  const TYPE_IMPACT: Record<string, number> = {
    injury:       5,  // Star out = major market impact
    lineup:       5,  // Starter scratch
    transaction:  5,
    sharp_money:  4,
    line_move:    3,
    rotation:     3,
    scheme:       2,
    matchup_edge: 2,
    weather:      3,
    prop:         1,
    trend:        1,
    news:         1,
    depth:        2,
    coaching:     2,
  };
  const typeImpact = TYPE_IMPACT[normType] ?? 1;
  score += typeImpact;
  if (typeImpact >= 4) factors.push(`${normType} signal type (high-impact category)`);

  /* Injury designation severity */
  if (injuryDesignation === "OUT" || injuryDesignation === "D") {
    score += 4; factors.push("ruled out / doubtful designation");
  } else if (injuryDesignation === "Q" || injuryDesignation === "LP") {
    score += 2; factors.push("questionable / limited practice designation");
  }

  /* Betting relevance flag */
  if (bettingRelevance && verdict !== "rumor") {
    score += 2; factors.push("betting relevance confirmed");
  }

  return { score: Math.min(score, 20), factors };
}

/* ────────────────────────────────────────────────────────────
   4. Relevance score  (0–8)
   Betting + fantasy utility flags.
   ──────────────────────────────────────────────────────────── */
function scoreRelevance(opts: {
  bettingRelevance?: boolean;
  fantasyRelevance?: boolean;
  verdict: Verdict;
}): number {
  let score = 0;
  const { bettingRelevance, fantasyRelevance, verdict } = opts;
  const verdictMultiplier = verdict === "confirmed" ? 1.0
    : verdict === "likely" ? 0.85
    : verdict === "review" ? 0.6
    : 0.4;

  if (bettingRelevance) score += 5;
  if (fantasyRelevance) score += 3;
  return parseFloat((Math.min(score * verdictMultiplier, 8)).toFixed(2));
}

/* ────────────────────────────────────────────────────────────
   5. Context score  (0–7)
   Depth of actionable intel — scheme, matchup, rotation notes.
   ──────────────────────────────────────────────────────────── */
function scoreContext(opts: {
  rotationNote?:   string;
  matchupEdge?:    string;
  schemeNote?:     string;
  pitcherMatchup?: string;
  lineupStatus?:   string;
  weatherNote?:    string;
  whyItMatters?:   string;
}): { score: number; factors: string[] } {
  let score = 0;
  const factors: string[] = [];
  const { rotationNote, matchupEdge, schemeNote, pitcherMatchup, lineupStatus, weatherNote, whyItMatters } = opts;

  if (schemeNote)     { score += 2.5; factors.push("scheme intel present"); }
  if (matchupEdge)    { score += 2.0; factors.push("matchup edge note with stats"); }
  if (rotationNote)   { score += 1.5; factors.push("rotation/depth context"); }
  if (pitcherMatchup) { score += 2.0; factors.push("pitcher matchup data"); }
  if (lineupStatus)   { score += 1.5; factors.push("lineup status confirmed"); }
  if (weatherNote)    { score += 1.5; factors.push("weather note"); }
  if (whyItMatters && whyItMatters.length > 60) {
    score += 1.0; // signal has meaningful "why" layer
  }

  return { score: Math.min(score, 7), factors };
}

/* ────────────────────────────────────────────────────────────
   League modifier application
   ──────────────────────────────────────────────────────────── */
function applyLeagueModifiers(
  breakdown: ScoreBreakdown,
  sport: Sport,
  type: string
): ScoreBreakdown {
  const mods = getLeagueModifiers(sport);
  const normType = normalizeSignalType(type);
  const typeMultiplier = mods.signalType[normType] ?? 1.0;
  const comp = mods.components;

  // Apply component-level weights, then type multiplier on market/context
  const modified: ScoreBreakdown = {
    confidenceScore:    parseFloat((breakdown.confidenceScore * 1.0).toFixed(2)),
    sourceQualityScore: parseFloat((breakdown.sourceQualityScore * comp.sourceQualityWeight).toFixed(2)),
    recencyScore:       parseFloat((breakdown.recencyScore * comp.recencyWeight).toFixed(2)),
    marketImpactScore:  parseFloat((breakdown.marketImpactScore * comp.marketImpactWeight * typeMultiplier).toFixed(2)),
    relevanceScore:     parseFloat((breakdown.relevanceScore * 1.0).toFixed(2)),
    contextScore:       parseFloat((breakdown.contextScore * comp.contextWeight * typeMultiplier).toFixed(2)),
  };

  // Renormalize to 100-pt scale
  const raw = Object.values(modified).reduce((a, b) => a + b, 0);
  const MAX_POSSIBLE = 20 + (25 * comp.sourceQualityWeight) + (20 * comp.recencyWeight) + (20 * comp.marketImpactWeight * typeMultiplier) + 8 + (7 * comp.contextWeight * typeMultiplier);
  const scale = 100 / Math.max(MAX_POSSIBLE, 60); // prevent division errors

  return {
    confidenceScore:    parseFloat((modified.confidenceScore    * scale).toFixed(1)),
    sourceQualityScore: parseFloat((modified.sourceQualityScore * scale).toFixed(1)),
    recencyScore:       parseFloat((modified.recencyScore       * scale).toFixed(1)),
    marketImpactScore:  parseFloat((modified.marketImpactScore  * scale).toFixed(1)),
    relevanceScore:     parseFloat((modified.relevanceScore     * scale).toFixed(1)),
    contextScore:       parseFloat((modified.contextScore       * scale).toFixed(1)),
  };
}

/* ────────────────────────────────────────────────────────────
   Urgency label
   ──────────────────────────────────────────────────────────── */
function deriveUrgency(totalScore: number, ageMinutes: number, bettingRelevance?: boolean): UrgencyLabel {
  if (totalScore >= 78 && ageMinutes <= 15) return "LIVE";
  if (totalScore >= 68 && ageMinutes <= 60 && bettingRelevance) return "URGENT";
  if (totalScore >= 52) return "WATCH";
  return "NOTE";
}

/* ────────────────────────────────────────────────────────────
   Trust label
   ──────────────────────────────────────────────────────────── */
function deriveTrust(confirmationStrength?: ConfirmationStrength, verdict?: Verdict): TrustLabel {
  if (verdict === "contradicted") return "Unverified";
  if (confirmationStrength === "consensus") return "Consensus";
  if (confirmationStrength === "corroborated") return "Corroborated";
  if (verdict === "confirmed") return "Corroborated";
  if (verdict === "rumor") return "Unverified";
  return "Developing";
}

/* ────────────────────────────────────────────────────────────
   Score explanation builder
   ──────────────────────────────────────────────────────────── */
function buildExplanation(
  totalScore: number,
  breakdown: ScoreBreakdown,
  ageMinutes: number,
  marketFactors: string[],
  sourceExplanation: string,
  contextFactors: string[]
): { explanation: string; topFactors: string[] } {
  const tier = totalScore >= 80 ? "Very high" : totalScore >= 65 ? "High" : totalScore >= 50 ? "Medium" : "Lower";

  const allFactors: Array<{ label: string; value: number }> = [
    { label: "source quality", value: breakdown.sourceQualityScore },
    { label: "market impact",  value: breakdown.marketImpactScore  },
    { label: "recency",        value: breakdown.recencyScore        },
    { label: "confidence",     value: breakdown.confidenceScore     },
    { label: "context depth",  value: breakdown.contextScore        },
    { label: "relevance",      value: breakdown.relevanceScore      },
  ];
  allFactors.sort((a, b) => b.value - a.value);
  const topFactors = allFactors.slice(0, 3).map(f => f.label);

  const parts: string[] = [];
  parts.push(`${tier} score (${totalScore}/100).`);

  if (marketFactors.length > 0) parts.push(`Market: ${marketFactors.slice(0, 2).join(", ")}.`);
  if (sourceExplanation) parts.push(`Sources: ${sourceExplanation}.`);
  if (contextFactors.length > 0) parts.push(`Context: ${contextFactors.slice(0, 2).join(", ")}.`);

  const ageStr = ageMinutes < 60 ? `${Math.round(ageMinutes)}m old` : `${(ageMinutes / 60).toFixed(1)}h old`;
  parts.push(`Signal is ${ageStr}.`);

  return { explanation: parts.join(" "), topFactors };
}

/* ────────────────────────────────────────────────────────────
   MAIN ENTRY POINT
   ──────────────────────────────────────────────────────────── */
export function computeSignalScore(input: ScoringInput): SignalScore {
  const debug: string[] = [];

  /* 1. Confidence */
  const confidenceScore = scoreConfidence(input.confidence);
  debug.push(`confidence(${input.confidence}%) → ${confidenceScore}`);

  /* 2. Source quality */
  const sqResult = computeSourceQuality({
    sourceTypes:          input.sourceTypes,
    sourceLabels:         input.sourceLabels,
    sources:              input.sources,
    confirmationStrength: input.confirmationStrength,
    verdict:              input.verdict,
  });
  const sourceQualityScore = sqResult.score;
  debug.push(`sourceQuality → ${sourceQualityScore} (${sqResult.explanation})`);

  /* 3. Recency */
  const recencyResult = scoreRecency(input.isoTimestamp, input.timestamp);
  const recencyScore = recencyResult.score;
  debug.push(`recency(${Math.round(recencyResult.ageMinutes)}m) → ${recencyScore}`);

  /* 4. Market impact */
  const marketResult = scoreMarketImpact({
    lineMovement:      input.lineMovement,
    bettingRelevance:  input.bettingRelevance,
    type:              input.type,
    verdict:           input.verdict,
    injuryDesignation: input.injuryDesignation,
  });
  const marketImpactScore = marketResult.score;
  debug.push(`marketImpact → ${marketImpactScore} (${marketResult.factors.join(", ")})`);

  /* 5. Relevance */
  const relevanceScore = scoreRelevance({
    bettingRelevance: input.bettingRelevance,
    fantasyRelevance: input.fantasyRelevance,
    verdict:          input.verdict,
  });
  debug.push(`relevance → ${relevanceScore}`);

  /* 6. Context */
  const contextResult = scoreContext({
    rotationNote:   input.rotationNote,
    matchupEdge:    input.matchupEdge,
    schemeNote:     input.schemeNote,
    pitcherMatchup: input.pitcherMatchup,
    lineupStatus:   input.lineupStatus,
    weatherNote:    input.weatherNote,
    whyItMatters:   input.whyItMatters,
  });
  const contextScore = contextResult.score;
  debug.push(`context → ${contextScore} (${contextResult.factors.join(", ")})`);

  /* Assemble pre-league breakdown */
  const rawBreakdown: ScoreBreakdown = {
    confidenceScore,
    sourceQualityScore,
    recencyScore,
    marketImpactScore,
    relevanceScore,
    contextScore,
  };

  /* 7. Apply league modifiers + renormalize */
  const modifiedBreakdown = applyLeagueModifiers(rawBreakdown, input.sport, input.type);
  debug.push(`leagueModifiers(${input.sport}, ${input.type}) applied → renormalized`);

  /* 8. Total score */
  const rawTotal = Object.values(modifiedBreakdown).reduce((a, b) => a + b, 0);
  const totalScore = parseFloat(Math.min(rawTotal, 100).toFixed(1));
  debug.push(`totalScore → ${totalScore}`);

  /* 9. Urgency + trust */
  const urgencyLabel = deriveUrgency(totalScore, recencyResult.ageMinutes, input.bettingRelevance);
  const trustLabel   = deriveTrust(input.confirmationStrength, input.verdict);

  /* 10. Explanation */
  const { explanation, topFactors } = buildExplanation(
    totalScore,
    modifiedBreakdown,
    recencyResult.ageMinutes,
    marketResult.factors,
    sqResult.explanation,
    contextResult.factors
  );

  return {
    totalScore,
    breakdown: modifiedBreakdown,
    urgencyLabel,
    trustLabel,
    scoreExplanation: explanation,
    topFactors,
    debugLog: debug,
  };
}

/* ────────────────────────────────────────────────────────────
   Batch scorer — sort signals by score descending
   ──────────────────────────────────────────────────────────── */
export function scoreAndRankSignals<T extends ScoringInput>(
  signals: T[]
): Array<T & { _score: SignalScore }> {
  return signals
    .map(sig => ({ ...sig, _score: computeSignalScore(sig) }))
    .sort((a, b) => b._score.totalScore - a._score.totalScore);
}

/* ────────────────────────────────────────────────────────────
   Featured edge selector — returns highest-scoring signal
   that has bettingRelevance=true (or just highest if none do)
   ──────────────────────────────────────────────────────────── */
export function selectFeaturedEdge<T extends ScoringInput>(
  signals: T[]
): (T & { _score: SignalScore }) | null {
  if (signals.length === 0) return null;
  const ranked = scoreAndRankSignals(signals);
  // Prefer signals with betting relevance
  const bettingSignals = ranked.filter(s => s.bettingRelevance);
  return bettingSignals[0] ?? ranked[0];
}

/* ────────────────────────────────────────────────────────────
   Debug formatter — human-readable score inspection
   ──────────────────────────────────────────────────────────── */
export function formatScoreDebug(signal: { headline: string; _score: SignalScore }): string {
  const { headline, _score: s } = signal;
  const lines = [
    `═══ SCORE DEBUG ═══════════════════════════`,
    `Signal : ${headline.slice(0, 60)}`,
    `Score  : ${s.totalScore}/100  [${s.urgencyLabel}] [${s.trustLabel}]`,
    `─────────────────────────────────────────`,
    `  Confidence  : ${s.breakdown.confidenceScore.toFixed(1)}`,
    `  Src Quality : ${s.breakdown.sourceQualityScore.toFixed(1)}`,
    `  Recency     : ${s.breakdown.recencyScore.toFixed(1)}`,
    `  Mkt Impact  : ${s.breakdown.marketImpactScore.toFixed(1)}`,
    `  Relevance   : ${s.breakdown.relevanceScore.toFixed(1)}`,
    `  Context     : ${s.breakdown.contextScore.toFixed(1)}`,
    `─────────────────────────────────────────`,
    `  Top factors : ${s.topFactors.join(", ")}`,
    `  Explanation : ${s.scoreExplanation}`,
    `─────────────────────────────────────────`,
    ...s.debugLog.map(l => `  ↳ ${l}`),
    `═══════════════════════════════════════════`,
  ];
  return lines.join("\n");
}
