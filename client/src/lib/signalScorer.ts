/* ────────────────────────────────────────────────────────────
   Edge Setter — Signal Scoring Engine  (Sprint 6b revision)
   ──────────────────────────────────────────────────────────

   Composite score 0–100 with full breakdown, score bands,
   refined urgency, and plain-English explanation.

   Philosophy
   ----------
   • Transparent: every point is traceable to a factor
   • Extensible: real backend data replaces mock fields later
   • No black box: weighting table is readable in code
   • No fake history: hit rate / CLV stubs are clearly labeled
   • Score means something: band thresholds are defined and
     enforced consistently across all sports

   Score components (maximum raw points):
   ┌─────────────────────────┬────────┬──────────────────────────────┐
   │ Factor                  │ Max pts│ Notes                        │
   ├─────────────────────────┼────────┼──────────────────────────────┤
   │ confidenceScore         │   22   │ Confidence % → pts (nonlinear)│
   │ sourceQualityScore      │   28   │ Tier × count × confirmation  │
   │ marketImpactScore       │   24   │ Line move + sharp + type     │
   │ recencyBonus            │   12   │ Freshness bonus (not penalty)│
   │ relevanceScore          │    8   │ Betting + fantasy flags      │
   │ contextScore            │    6   │ Scheme/matchup/rotation depth│
   ├─────────────────────────┼────────┼──────────────────────────────┤
   │ Base total (before mods)│  100   │                              │
   └─────────────────────────┴────────┴──────────────────────────────┘

   League modifiers amplify specific components (not renormalized)
   to preserve scale integrity. Applied as ±% on relevant factors,
   then capped at 100.

   Score Bands
   -----------
   82–100  Elite Edge      Strongest actionable signals; highest-conviction
   65–81   Strong          Clearly actionable; good source depth + market support
   48–64   Watchlist       Worth tracking; developing or partially corroborated
   Below 48 Informational  Context only; low market impact or unverified

   Urgency Labels
   --------------
   LIVE    ≥80 score AND signal <30m old — or any breaking status change
   URGENT  ≥65 score AND signal <2h old AND (betting=true OR line still moving)
   WATCH   ≥48 score AND decision window open (game >3h away or situation evolving)
   NOTE    Everything else — context/background signal
   ──────────────────────────────────────────────────────────── */

import { computeSourceQuality } from "./sourceWeighter";
import { getLeagueModifiers, normalizeSignalType, type Sport } from "./leagueModifiers";
import type { ConfirmationStrength, Verdict, LineMovement } from "../data/v2MockData";

/* ── Public types ────────────────────────────────────────── */

export type UrgencyLabel = "LIVE" | "URGENT" | "WATCH" | "NOTE";
export type TrustLabel   = "Consensus" | "Corroborated" | "Developing" | "Unverified";
export type ScoreBand    = "Elite" | "Strong" | "Watchlist" | "Informational";

/* Band definitions — single source of truth */
export const SCORE_BANDS: Record<ScoreBand, { min: number; label: string; color: string; description: string }> = {
  Elite:         { min: 82, label: "Elite Edge",    color: "#CAA85A", description: "Highest-conviction signal: multi-source consensus, strong market movement, actionable edge" },
  Strong:        { min: 65, label: "Strong",         color: "#4CAF82", description: "Clearly actionable: solid source depth, corroborated, meaningful market support" },
  Watchlist:     { min: 48, label: "Watchlist",      color: "#D98A42", description: "Worth tracking: developing situation, partially confirmed, limited market signal" },
  Informational: { min: 0,  label: "Informational",  color: "#7E776A", description: "Context only: unverified, low market impact, or outdated — do not bet directly" },
};

export function getScoreBand(score: number): ScoreBand {
  if (score >= SCORE_BANDS.Elite.min)         return "Elite";
  if (score >= SCORE_BANDS.Strong.min)        return "Strong";
  if (score >= SCORE_BANDS.Watchlist.min)     return "Watchlist";
  return "Informational";
}

export interface ScoreBreakdown {
  confidenceScore:    number;   // 0–22
  sourceQualityScore: number;   // 0–28
  marketImpactScore:  number;   // 0–24
  recencyBonus:       number;   // 0–12
  relevanceScore:     number;   // 0–8
  contextScore:       number;   // 0–6
  // Supplemental detail (not counted in total — for display only)
  leagueModifierApplied: string;   // e.g. "MLB lineup ×1.5 on marketImpact"
  rawBeforeMods:         number;   // total before league modifier
}

export interface SignalScore {
  totalScore:          number;        // 0–100
  band:                ScoreBand;     // Elite | Strong | Watchlist | Informational
  breakdown:           ScoreBreakdown;
  urgencyLabel:        UrgencyLabel;
  urgencyReason:       string;        // plain-English why this urgency
  trustLabel:          TrustLabel;
  scoreExplanation:    string;        // one sentence: "Ranked Strong (71/100): ..."
  topFactors:          string[];      // 3 highest-contributing factor names
  debugLog:            string[];      // verbose inspection lines
}

/* ── Scoring inputs ────────────────────────────────────────  */

export interface ScoringInput {
  sport:                 Sport;
  type:                  string;
  verdict:               Verdict;
  confidence:            number;      // 0–100
  sources:               number;
  sourceTypes?:          string[];
  sourceLabels?:         string[];
  confirmationStrength?: ConfirmationStrength;
  isoTimestamp?:         string;      // ISO 8601 — preferred
  timestamp?:            string;      // human-readable fallback "2h ago"
  lineMovement?:         LineMovement;
  bettingRelevance?:     boolean;
  fantasyRelevance?:     boolean;
  // Context depth
  rotationNote?:         string;
  matchupEdge?:          string;
  schemeNote?:           string;
  pitcherMatchup?:       string;
  lineupStatus?:         string;
  weatherNote?:          string;
  injuryDesignation?:    string;
  whyItMatters?:         string;
  // Optional: game-time context for urgency (hours until game)
  gameTimeHoursAway?:    number;
}

/* ═══════════════════════════════════════════════════════════
   FACTOR 1 — Confidence  (0–22)
   Nonlinear: rewards high-conviction signals more than linear
   ═══════════════════════════════════════════════════════════ */
function scoreConfidence(confidence: number): number {
  // Nonlinear curve: 50% → 8 pts, 75% → 14 pts, 90% → 18 pts, 100% → 22 pts
  // Formula: 22 × (conf/100)^0.7  — rewards high end more than linear
  const pts = 22 * Math.pow(confidence / 100, 0.7);
  return parseFloat(pts.toFixed(2));
}

/* ═══════════════════════════════════════════════════════════
   FACTOR 2 — Recency Bonus  (0–12)
   Freshness bonus only — never a penalty below baseline.
   Old signals still earn their other factors fully.
   ═══════════════════════════════════════════════════════════ */
function minutesSince(isoTimestamp?: string, relativeTs?: string): number {
  if (isoTimestamp) {
    const ms = Date.now() - new Date(isoTimestamp).getTime();
    return Math.max(0, ms / 60000);
  }
  if (relativeTs) {
    const mMatch = relativeTs.match(/(\d+)m/);
    const hMatch = relativeTs.match(/(\d+)h/);
    const dMatch = relativeTs.match(/(\d+)d/);
    if (mMatch) return parseInt(mMatch[1]);
    if (hMatch) return parseInt(hMatch[1]) * 60;
    if (dMatch) return parseInt(dMatch[1]) * 1440;
  }
  return 360; // default 6h if unknown
}

const RECENCY_BRACKETS: Array<{ maxMinutes: number; bonus: number }> = [
  { maxMinutes: 15,       bonus: 12 },  // Breaking / live
  { maxMinutes: 60,       bonus: 10 },  // Very fresh
  { maxMinutes: 180,      bonus:  7 },  // Same-day fresh
  { maxMinutes: 360,      bonus:  4 },  // Day-of, aging
  { maxMinutes: 720,      bonus:  2 },  // Half-day old
  { maxMinutes: Infinity, bonus:  0 },  // Old — no freshness bonus
];

function scoreRecency(isoTimestamp?: string, timestamp?: string): { bonus: number; ageMinutes: number } {
  const ageMinutes = minutesSince(isoTimestamp, timestamp);
  const bracket = RECENCY_BRACKETS.find(b => ageMinutes <= b.maxMinutes);
  return { bonus: bracket?.bonus ?? 0, ageMinutes };
}

/* ═══════════════════════════════════════════════════════════
   FACTOR 3 — Market Impact  (0–24)
   Line moves, sharp action, signal type, injury designation
   ═══════════════════════════════════════════════════════════ */
function scoreMarketImpact(opts: {
  lineMovement?:      LineMovement;
  bettingRelevance?:  boolean;
  type:               string;
  verdict:            Verdict;
  injuryDesignation?: string;
}): { score: number; factors: string[] } {
  let score = 0;
  const factors: string[] = [];
  const { lineMovement, bettingRelevance, type, verdict, injuryDesignation } = opts;
  const normType = normalizeSignalType(type);

  /* Line movement magnitude */
  if (lineMovement) {
    const openNum = parseFloat(lineMovement.open.replace(/[^0-9.\-]/g, "")) || 0;
    const currNum = parseFloat(lineMovement.current.replace(/[^0-9.\-]/g, "")) || 0;
    const magnitude = Math.abs(Math.abs(currNum) - Math.abs(openNum));

    if (magnitude >= 3.0)      { score += 16; factors.push(`${magnitude.toFixed(1)}-pt line move (major)`); }
    else if (magnitude >= 2.0) { score += 13; factors.push(`${magnitude.toFixed(1)}-pt line move (high impact)`); }
    else if (magnitude >= 1.0) { score +=  9; factors.push(`${magnitude.toFixed(1)}-pt line move`); }
    else if (magnitude >= 0.5) { score +=  5; factors.push(`${magnitude.toFixed(1)}-pt line move`); }
    else if (magnitude > 0)    { score +=  3; factors.push(`${magnitude.toFixed(1)}-pt line shift`); }

    if (lineMovement.note?.toLowerCase().includes("sharp")) {
      score += 5; factors.push("sharp money confirmed");
    }

    /* Key number crossing */
    const keyNumbers = [3, 3.5, 6.5, 7, 10, 10.5, 14];
    for (const kn of keyNumbers) {
      const open = Math.abs(openNum), curr = Math.abs(currNum);
      if ((open < kn && curr >= kn) || (open > kn && curr <= kn)) {
        score += 3; factors.push(`crossed key number ${kn}`); break;
      }
    }
  }

  /* Signal type inherent market weight */
  const TYPE_IMPACT: Record<string, number> = {
    injury:       6,   // Star out = immediate market repricing
    lineup:       6,   // Starter scratch
    transaction:  6,   // IL move / roster move
    sharp_money:  5,
    line_move:    4,
    rotation:     3,
    scheme:       3,
    matchup_edge: 2,
    weather:      4,   // Weather directly moves totals
    prop:         1,
    trend:        1,
    news:         2,
    depth:        2,
    coaching:     3,
    portal:       2,
    transfer:     2,
    role_change:  2,
  };
  const typeImpact = TYPE_IMPACT[normType] ?? 2;
  score += typeImpact;
  if (typeImpact >= 5) factors.push(`${normType} signal type (high-impact category)`);

  /* Injury designation severity */
  if (injuryDesignation === "OUT" || injuryDesignation === "D") {
    score += 4; factors.push("ruled out / doubtful designation");
  } else if (injuryDesignation === "Q" || injuryDesignation === "LP") {
    score += 2; factors.push("questionable / limited participation");
  }

  /* Betting relevance */
  if (bettingRelevance && verdict !== "rumor") {
    score += 2; factors.push("betting relevance confirmed");
  }

  return { score: Math.min(score, 24), factors };
}

/* ═══════════════════════════════════════════════════════════
   FACTOR 4 — Relevance  (0–8)
   Betting + fantasy utility, weighted by verdict reliability
   ═══════════════════════════════════════════════════════════ */
function scoreRelevance(opts: {
  bettingRelevance?: boolean;
  fantasyRelevance?: boolean;
  verdict: Verdict;
}): number {
  const { bettingRelevance, fantasyRelevance, verdict } = opts;
  const verdictMultiplier =
    verdict === "confirmed"    ? 1.0
    : verdict === "likely"     ? 0.85
    : verdict === "review"     ? 0.6
    : verdict === "rumor"      ? 0.4
    : 0.2; // contradicted

  let score = 0;
  if (bettingRelevance) score += 5;
  if (fantasyRelevance) score += 3;
  return parseFloat((Math.min(score * verdictMultiplier, 8)).toFixed(2));
}

/* ═══════════════════════════════════════════════════════════
   FACTOR 5 — Context  (0–6)
   Depth of actionable intel: scheme notes, matchup data, etc.
   ═══════════════════════════════════════════════════════════ */
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

  if (schemeNote)     { score += 2.0; factors.push("scheme intel present"); }
  if (matchupEdge)    { score += 2.0; factors.push("matchup edge intel"); }
  if (rotationNote)   { score += 1.5; factors.push("rotation/depth context"); }
  if (pitcherMatchup) { score += 2.0; factors.push("pitcher matchup data"); }
  if (lineupStatus)   { score += 1.5; factors.push("lineup status confirmed"); }
  if (weatherNote)    { score += 1.5; factors.push("weather note"); }
  if (whyItMatters && whyItMatters.length > 60) {
    score += 1.0; // Signal has meaningful "why" layer beyond a headline
  }

  return { score: Math.min(score, 6), factors };
}

/* ═══════════════════════════════════════════════════════════
   League modifier application
   Applied directly to specific components — does NOT renormalize
   the full 0–100 scale to avoid score compression.
   ═══════════════════════════════════════════════════════════ */
function applyLeagueModifiers(
  raw: {
    confidenceScore:    number;
    sourceQualityScore: number;
    marketImpactScore:  number;
    recencyBonus:       number;
    relevanceScore:     number;
    contextScore:       number;
  },
  sport: Sport,
  type:  string
): {
  modified: typeof raw;
  modLabel: string;
} {
  const mods    = getLeagueModifiers(sport);
  const norm    = normalizeSignalType(type);
  const typeMod = mods.signalType[norm] ?? 1.0;
  const comp    = mods.components;

  // Apply component weights + type multiplier on market and context only
  const modified = {
    confidenceScore:    parseFloat((raw.confidenceScore    * 1.0).toFixed(2)),
    sourceQualityScore: parseFloat((raw.sourceQualityScore * comp.sourceQualityWeight).toFixed(2)),
    marketImpactScore:  parseFloat((raw.marketImpactScore  * comp.marketImpactWeight * typeMod).toFixed(2)),
    recencyBonus:       parseFloat((raw.recencyBonus       * comp.recencyWeight).toFixed(2)),
    relevanceScore:     parseFloat((raw.relevanceScore     * 1.0).toFixed(2)),
    contextScore:       parseFloat((raw.contextScore       * comp.contextWeight * typeMod).toFixed(2)),
  };

  const modLabel = typeMod !== 1.0
    ? `${sport} ${norm} ×${typeMod} on market+context`
    : `${sport} component weights applied`;

  return { modified, modLabel };
}

/* ═══════════════════════════════════════════════════════════
   Urgency label — time-aware, game-state-aware
   ═══════════════════════════════════════════════════════════ */
function deriveUrgency(opts: {
  totalScore:          number;
  ageMinutes:          number;
  bettingRelevance?:   boolean;
  lineMovement?:       LineMovement;
  verdict:             Verdict;
  injuryDesignation?:  string;
  gameTimeHoursAway?:  number;
}): { label: UrgencyLabel; reason: string } {
  const { totalScore, ageMinutes, bettingRelevance, lineMovement, verdict, injuryDesignation, gameTimeHoursAway } = opts;

  const lineIsMoving = !!lineMovement && (
    lineMovement.note?.toLowerCase().includes("still") ||
    lineMovement.note?.toLowerCase().includes("moving") ||
    ageMinutes < 120  // line moves within 2h are likely still active
  );

  const isStatusChange = verdict === "confirmed" && (
    injuryDesignation === "OUT" || injuryDesignation === "D"
  );

  const decisionWindowOpen = gameTimeHoursAway == null
    ? true   // unknown game time — assume window is open
    : gameTimeHoursAway > 0.5; // game is more than 30 min away

  // LIVE: genuinely breaking — very fresh high-score OR confirmed status change
  if (totalScore >= 80 && ageMinutes <= 30) {
    return { label: "LIVE", reason: "High-score signal within 30 min — treat as breaking" };
  }
  if (isStatusChange && ageMinutes <= 60) {
    return { label: "LIVE", reason: "Confirmed status change (OUT/Doubtful) within 1 hour" };
  }

  // URGENT: actionable now — line still moving, window open, good score
  if (
    totalScore >= 65 &&
    ageMinutes <= 120 &&
    (bettingRelevance || lineIsMoving) &&
    decisionWindowOpen
  ) {
    const why = lineIsMoving
      ? "Line is moving — act before spread settles"
      : "Fresh high-conviction signal with open decision window";
    return { label: "URGENT", reason: why };
  }

  // WATCH: worth tracking — good signal, window not yet closed
  if (totalScore >= 48 && decisionWindowOpen) {
    return { label: "WATCH", reason: "Actionable signal — monitor for confirmation or line movement" };
  }

  // NOTE: background / informational
  return { label: "NOTE", reason: "Context signal — low urgency or closed decision window" };
}

/* ═══════════════════════════════════════════════════════════
   Trust label
   ═══════════════════════════════════════════════════════════ */
function deriveTrust(confirmationStrength?: ConfirmationStrength, verdict?: Verdict): TrustLabel {
  if (verdict === "contradicted") return "Unverified";
  if (confirmationStrength === "consensus") return "Consensus";
  if (confirmationStrength === "corroborated") return "Corroborated";
  if (verdict === "confirmed") return "Corroborated";
  if (verdict === "rumor") return "Unverified";
  return "Developing";
}

/* ═══════════════════════════════════════════════════════════
   Score explanation — plain English one sentence
   ═══════════════════════════════════════════════════════════ */
function buildExplanation(
  totalScore:     number,
  band:           ScoreBand,
  breakdown:      ScoreBreakdown,
  ageMinutes:     number,
  marketFactors:  string[],
  sourceExpl:     string,
  contextFactors: string[]
): { explanation: string; topFactors: string[] } {

  // Rank factors by contribution
  const allFactors: Array<{ label: string; value: number }> = [
    { label: "source quality",  value: breakdown.sourceQualityScore },
    { label: "market impact",   value: breakdown.marketImpactScore  },
    { label: "recency",         value: breakdown.recencyBonus       },
    { label: "confidence",      value: breakdown.confidenceScore    },
    { label: "context depth",   value: breakdown.contextScore       },
    { label: "relevance",       value: breakdown.relevanceScore     },
  ];
  allFactors.sort((a, b) => b.value - a.value);
  const topFactors = allFactors.slice(0, 3).map(f => f.label);

  // Band label for the sentence
  const bandLabel = SCORE_BANDS[band].label;

  // Build sentence: "Ranked [Band] (72/100): [top market driver]. [Source note]. [Age]."
  const parts: string[] = [];
  parts.push(`Ranked ${bandLabel} (${totalScore}/100):`);

  if (marketFactors.length > 0) {
    parts.push(marketFactors.slice(0, 2).join(" + ") + ".");
  }

  if (sourceExpl) {
    // Shorten source explanation for the sentence
    const shortSource = sourceExpl.split(";").slice(0, 2).join(", ");
    parts.push(`${shortSource}.`);
  }

  if (contextFactors.length > 0) {
    parts.push(`Context: ${contextFactors.slice(0, 2).join(", ")}.`);
  }

  const ageStr = ageMinutes < 60
    ? `${Math.round(ageMinutes)}m old`
    : `${(ageMinutes / 60).toFixed(1)}h old`;
  parts.push(`Signal is ${ageStr}.`);

  return { explanation: parts.join(" "), topFactors };
}

/* ═══════════════════════════════════════════════════════════
   MAIN ENTRY POINT
   ═══════════════════════════════════════════════════════════ */
export function computeSignalScore(input: ScoringInput): SignalScore {
  const debug: string[] = [];

  /* 1. Confidence */
  const confidenceScore = scoreConfidence(input.confidence);
  debug.push(`confidence(${input.confidence}%) → ${confidenceScore}`);

  /* 2. Source quality (0–28 via sourceWeighter, capped at 28) */
  const sqResult = computeSourceQuality({
    sourceTypes:          input.sourceTypes,
    sourceLabels:         input.sourceLabels,
    sources:              input.sources,
    confirmationStrength: input.confirmationStrength,
    verdict:              input.verdict,
  });
  // sourceWeighter max is 25; scale to 28 for updated weight
  const sourceQualityScore = parseFloat(Math.min(sqResult.score * (28 / 25), 28).toFixed(2));
  debug.push(`sourceQuality → ${sourceQualityScore} (${sqResult.explanation})`);

  /* 3. Market impact */
  const marketResult = scoreMarketImpact({
    lineMovement:      input.lineMovement,
    bettingRelevance:  input.bettingRelevance,
    type:              input.type,
    verdict:           input.verdict,
    injuryDesignation: input.injuryDesignation,
  });
  const marketImpactScore = marketResult.score;
  debug.push(`marketImpact → ${marketImpactScore} (${marketResult.factors.join(", ")})`);

  /* 4. Recency bonus */
  const recencyResult  = scoreRecency(input.isoTimestamp, input.timestamp);
  const recencyBonus   = recencyResult.bonus;
  debug.push(`recency(${Math.round(recencyResult.ageMinutes)}m) → +${recencyBonus} freshness bonus`);

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

  const rawBeforeMods = parseFloat(
    (confidenceScore + sourceQualityScore + marketImpactScore + recencyBonus + relevanceScore + contextScore).toFixed(1)
  );

  /* 7. League modifier */
  const { modified, modLabel } = applyLeagueModifiers(
    { confidenceScore, sourceQualityScore, marketImpactScore, recencyBonus, relevanceScore, contextScore },
    input.sport, input.type
  );
  debug.push(`leagueModifiers(${input.sport}, ${input.type}) → ${modLabel}`);

  /* 8. Total — sum modified components, cap at 100 */
  const rawTotal = Object.values(modified).reduce((a, b) => a + b, 0);
  const totalScore = parseFloat(Math.min(rawTotal, 100).toFixed(1));
  debug.push(`totalScore → ${totalScore}`);

  /* 9. Band */
  const band = getScoreBand(totalScore);

  /* 10. Urgency */
  const { label: urgencyLabel, reason: urgencyReason } = deriveUrgency({
    totalScore,
    ageMinutes:         recencyResult.ageMinutes,
    bettingRelevance:   input.bettingRelevance,
    lineMovement:       input.lineMovement,
    verdict:            input.verdict,
    injuryDesignation:  input.injuryDesignation,
    gameTimeHoursAway:  input.gameTimeHoursAway,
  });

  /* 11. Trust */
  const trustLabel = deriveTrust(input.confirmationStrength, input.verdict);

  /* 12. Breakdown object */
  const breakdown: ScoreBreakdown = {
    confidenceScore:       parseFloat(modified.confidenceScore.toFixed(1)),
    sourceQualityScore:    parseFloat(modified.sourceQualityScore.toFixed(1)),
    marketImpactScore:     parseFloat(modified.marketImpactScore.toFixed(1)),
    recencyBonus:          parseFloat(modified.recencyBonus.toFixed(1)),
    relevanceScore:        parseFloat(modified.relevanceScore.toFixed(1)),
    contextScore:          parseFloat(modified.contextScore.toFixed(1)),
    leagueModifierApplied: modLabel,
    rawBeforeMods,
  };

  /* 13. Explanation */
  const { explanation, topFactors } = buildExplanation(
    totalScore,
    band,
    breakdown,
    recencyResult.ageMinutes,
    marketResult.factors,
    sqResult.explanation,
    contextResult.factors
  );

  return {
    totalScore,
    band,
    breakdown,
    urgencyLabel,
    urgencyReason,
    trustLabel,
    scoreExplanation: explanation,
    topFactors,
    debugLog: debug,
  };
}

/* ═══════════════════════════════════════════════════════════
   Batch scorer — sort signals by score descending
   ═══════════════════════════════════════════════════════════ */
export function scoreAndRankSignals<T extends ScoringInput>(
  signals: T[]
): Array<T & { _score: SignalScore }> {
  return signals
    .map(sig => ({ ...sig, _score: computeSignalScore(sig) }))
    .sort((a, b) => b._score.totalScore - a._score.totalScore);
}

/* ═══════════════════════════════════════════════════════════
   Featured edge selector
   Prefers: betting-relevant signals in Strong+ band
   ═══════════════════════════════════════════════════════════ */
export function selectFeaturedEdge<T extends ScoringInput>(
  signals: T[]
): (T & { _score: SignalScore }) | null {
  if (signals.length === 0) return null;
  const ranked = scoreAndRankSignals(signals);
  const bettingElite  = ranked.filter(s => s.bettingRelevance && s._score.band === "Elite");
  const bettingStrong = ranked.filter(s => s.bettingRelevance && s._score.band === "Strong");
  const bettingAny    = ranked.filter(s => s.bettingRelevance);
  return bettingElite[0] ?? bettingStrong[0] ?? bettingAny[0] ?? ranked[0];
}

/* ═══════════════════════════════════════════════════════════
   explainScore — single call, returns plain-English string
   Use this in UI tooltips and detail panels
   ═══════════════════════════════════════════════════════════ */
export function explainScore(signal: { headline?: string; _score: SignalScore }): string {
  const s = signal._score;
  return [
    `${s.band.toUpperCase()} — ${s.totalScore}/100`,
    s.scoreExplanation,
    `Trust: ${s.trustLabel} | Urgency: ${s.urgencyLabel} (${s.urgencyReason})`,
    `Top drivers: ${s.topFactors.join(", ")}`,
  ].join("\n");
}

/* ═══════════════════════════════════════════════════════════
   Debug formatter — full verbose inspection
   ═══════════════════════════════════════════════════════════ */
export function formatScoreDebug(signal: { headline: string; _score: SignalScore }): string {
  const { headline, _score: s } = signal;
  const b = s.breakdown;
  const lines = [
    `═══ SCORE DEBUG ═══════════════════════════`,
    `Signal : ${headline.slice(0, 60)}`,
    `Score  : ${s.totalScore}/100  [${s.band}] [${s.urgencyLabel}] [${s.trustLabel}]`,
    `─────────────────────────────────────────`,
    `  Confidence  : ${b.confidenceScore.toFixed(1)}  (max 22)`,
    `  Src Quality : ${b.sourceQualityScore.toFixed(1)}  (max 28)`,
    `  Mkt Impact  : ${b.marketImpactScore.toFixed(1)}  (max 24)`,
    `  Recency     : ${b.recencyBonus.toFixed(1)}  (max 12)`,
    `  Relevance   : ${b.relevanceScore.toFixed(1)}  (max 8)`,
    `  Context     : ${b.contextScore.toFixed(1)}  (max 6)`,
    `  ──────────── `,
    `  Raw (pre-mod): ${b.rawBeforeMods}`,
    `  League mod  : ${b.leagueModifierApplied}`,
    `  TOTAL       : ${s.totalScore}/100`,
    `─────────────────────────────────────────`,
    `  Band        : ${s.band} (${SCORE_BANDS[s.band].description.slice(0, 55)})`,
    `  Urgency     : ${s.urgencyLabel} — ${s.urgencyReason}`,
    `  Trust       : ${s.trustLabel}`,
    `  Top factors : ${s.topFactors.join(", ")}`,
    `  Explanation : ${s.scoreExplanation}`,
    `─────────────────────────────────────────`,
    ...s.debugLog.map(l => `  ↳ ${l}`),
    `═══════════════════════════════════════════`,
  ];
  return lines.join("\n");
}
