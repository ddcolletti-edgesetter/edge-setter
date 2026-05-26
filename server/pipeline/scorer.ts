/**
 * Edge Setter — Server-side Scorer  (Sprint 7)
 *
 * This is a direct port of the frontend signalScorer.ts logic to Node.js.
 * The scoring algorithm is identical — all changes to the scoring model
 * happen in signalScorer.ts; this file stays in sync but lives on the server
 * so the processing layer can score signals without a browser.
 *
 * DO NOT change scoring logic here without also updating client/src/lib/signalScorer.ts.
 */

import type { LiveSignal, ScoreBand, UrgencyLabel, TrustLabel, ScoreBreakdown } from "./types";

/* ─── Band definitions ─────────────────────────────────── */

export const SCORE_BANDS: Record<ScoreBand, { min: number; label: string; color: string; description: string }> = {
  Elite:         { min: 82, label: "Elite Edge",    color: "#CAA85A", description: "Highest-conviction signal: multi-source consensus, strong market movement, actionable edge" },
  Strong:        { min: 65, label: "Strong",         color: "#4CAF82", description: "Clearly actionable: solid source depth, corroborated, meaningful market support" },
  Watchlist:     { min: 48, label: "Watchlist",      color: "#D98A42", description: "Worth tracking: developing situation, partially confirmed, limited market signal" },
  Informational: { min: 0,  label: "Informational",  color: "#7E776A", description: "Context only: unverified, low market impact, or outdated — do not bet directly" },
};

export function getScoreBand(score: number): ScoreBand {
  if (score >= 82) return "Elite";
  if (score >= 65) return "Strong";
  if (score >= 48) return "Watchlist";
  return "Informational";
}

/* ─── Source quality lookup ─────────────────────────────── */

const SOURCE_TYPE_WEIGHT: Record<string, number> = {
  official:           3.0,
  team_official:      3.0,
  transaction:        3.5,
  "official report":  3.0,
  beat_reporter:      2.5,
  insider:            3.0,
  wire_service:       2.5,
  sportsbook:         2.5,
  sharp_money:        2.0,
  analytics:          2.0,
  line_tracking:      2.0,
  weather_service:    2.5,
  broadcast:          1.5,
  fantasy_platform:   1.5,
  practice_observation: 1.5,
  rotational:         1.0,
  social:             0.5,
};

function getSourceTypeWeight(type: string): number {
  return SOURCE_TYPE_WEIGHT[type.toLowerCase()] ?? 1.0;
}

function computeSourceQualityScore(
  sourceTypes: string[],
  sourceLabels: string[],
  sourceCount: number,
  confirmationStrength: string,
): number {
  if (sourceCount === 0) return 0;

  // Base quality from source types (max 3.5)
  const avgTypeWeight = sourceTypes.length > 0
    ? sourceTypes.reduce((s, t) => s + getSourceTypeWeight(t), 0) / sourceTypes.length
    : 1.0;

  // Named insider premium
  const INSIDER_NAMES = ["woj", "shams", "schefter", "pinnacle", "circa", "ramona", "espn adam", "mlb.com"];
  const hasNamedInsider = sourceLabels.some(l =>
    INSIDER_NAMES.some(n => l.toLowerCase().includes(n))
  );
  const insiderBonus = hasNamedInsider ? 1.2 : 0;

  // Confirmation strength
  const confirmBonus: Record<string, number> = {
    Consensus: 1.5, Corroborated: 0.8, Developing: 0.2, Unverified: -0.5,
  };
  const confirm = confirmBonus[confirmationStrength] ?? 0;

  // Source count depth bonus
  const countBonus = Math.min(sourceCount / 10, 1.0);

  const raw = (avgTypeWeight + insiderBonus + confirm + countBonus) * 4.2;
  return Math.min(28, Math.max(0, raw));
}

/* ─── League modifiers ──────────────────────────────────── */

type Sport = "NBA" | "MLB" | "NFL" | "CFB";

interface LeagueModifier {
  marketMultiplier: number;
  contextMultiplier: number;
  label: string;
}

function getLeagueModifier(sport: Sport, signalType: string): LeagueModifier {
  const type = signalType.toLowerCase();
  // MLB
  if (sport === "MLB") {
    if (type.includes("transaction") || type.includes("lineup_change")) return { marketMultiplier: 1.5, contextMultiplier: 1.2, label: "MLB transaction ×1.5 on market+context" };
    if (type.includes("line_move") || type.includes("sharp"))           return { marketMultiplier: 1.2, contextMultiplier: 1.0, label: "MLB line_move ×1.2 on market+context" };
    if (type.includes("weather"))                                        return { marketMultiplier: 1.4, contextMultiplier: 1.0, label: "MLB weather ×1.4 on market+context" };
    if (type.includes("injury"))                                         return { marketMultiplier: 1.1, contextMultiplier: 1.0, label: "MLB injury ×1.1 on market+context" };
  }
  // NBA
  if (sport === "NBA") {
    if (type.includes("injury"))                                         return { marketMultiplier: 1.3, contextMultiplier: 1.1, label: "NBA injury ×1.3 on market+context" };
    if (type.includes("line_move") || type.includes("sharp"))           return { marketMultiplier: 1.1, contextMultiplier: 1.0, label: "NBA line_move ×1.1 on market+context" };
    if (type.includes("lineup"))                                         return { marketMultiplier: 1.2, contextMultiplier: 1.0, label: "NBA lineup ×1.2 on market+context" };
  }
  // NFL
  if (sport === "NFL") {
    if (type.includes("injury"))                                         return { marketMultiplier: 1.15, contextMultiplier: 1.1, label: "NFL injury ×1.15 on market+context" };
    if (type.includes("line_move") || type.includes("sharp"))           return { marketMultiplier: 1.1, contextMultiplier: 1.0, label: "NFL line_move ×1.1 on market+context" };
    if (type.includes("weather"))                                        return { marketMultiplier: 1.1, contextMultiplier: 1.0, label: "NFL weather ×1.1 on market+context" };
    if (type.includes("role_change") || type.includes("scheme"))        return { marketMultiplier: 1.2, contextMultiplier: 1.1, label: "NFL role/scheme ×1.2 on market+context" };
  }
  // CFB
  if (sport === "CFB") {
    if (type.includes("line_move") || type.includes("sharp"))           return { marketMultiplier: 1.3, contextMultiplier: 1.0, label: "CFB line_move ×1.3 on market+context" };
    if (type.includes("injury"))                                         return { marketMultiplier: 1.1, contextMultiplier: 1.0, label: "CFB injury ×1.1 on market+context" };
    if (type.includes("scheme") || type.includes("transfer"))           return { marketMultiplier: 1.2, contextMultiplier: 1.0, label: "CFB scheme/transfer ×1.2 on market+context" };
  }
  return { marketMultiplier: 1.0, contextMultiplier: 1.0, label: "no league modifier" };
}

/* ─── Main scoring function ─────────────────────────────── */

export interface ScoreInputs {
  sport: Sport;
  signalType: string;
  verdict: string;
  confidence: number;           // 0–100
  sourceTypes: string[];
  sourceLabels: string[];
  sourceCount: number;
  confirmationStrength: string; // "Consensus" | "Corroborated" | "Developing" | "Unverified"
  isoTimestamp: string;
  // Market
  lineMovementDelta?: number;   // e.g. 2.0 for 2-pt move
  isSharpMoney?: boolean;
  crossedKeyNumber?: boolean;
  // Context
  bettingRelevance?: boolean;
  fantasyRelevance?: boolean;
  hasMatchupEdge?: boolean;
  hasRotationNote?: boolean;
  hasSchemeNote?: boolean;
  hasPitcherMatchup?: boolean;
  hasLineupStatus?: boolean;
  hasWeatherNote?: boolean;
  // Injury
  injuryDesignation?: string;   // "OUT" | "Doubtful" | "Questionable" | "IL-60"
  isHighImpactType?: boolean;   // injury/transaction type bonus
}

export interface ScoreResult {
  totalScore: number;
  band: ScoreBand;
  urgencyLabel: UrgencyLabel;
  urgencyReason: string;
  trustLabel: TrustLabel;
  scoreExplanation: string;
  breakdown: ScoreBreakdown;
}

export function scoreSignal(inputs: ScoreInputs, gameTimeIso?: string): ScoreResult {
  const now = Date.now();
  const signalMs = new Date(inputs.isoTimestamp).getTime();
  const ageMinutes = isNaN(signalMs) ? 999 : (now - signalMs) / 60000;

  // Game time proximity (for urgency)
  const gameMs = gameTimeIso ? new Date(gameTimeIso).getTime() : null;
  const minutesToGame = gameMs ? (gameMs - now) / 60000 : null;
  const decisionWindowOpen = minutesToGame === null || minutesToGame > 60; // game >1h away

  /* 1. Confidence score  (max 22, nonlinear) */
  const confidenceScore = Math.min(22, 22 * Math.pow(inputs.confidence / 100, 0.7));

  /* 2. Source quality score  (max 28) */
  const sourceQualityScore = computeSourceQualityScore(
    inputs.sourceTypes,
    inputs.sourceLabels,
    inputs.sourceCount,
    inputs.confirmationStrength,
  );

  /* 3. Market impact score  (max 24) */
  let mkt = 0;
  const delta = inputs.lineMovementDelta ?? 0;
  if (delta >= 3)   mkt += 12;
  else if (delta >= 2) mkt += 9;
  else if (delta >= 1) mkt += 6;
  else if (delta >= 0.5) mkt += 3;
  if (inputs.isSharpMoney) mkt += 6;
  if (inputs.crossedKeyNumber) mkt += 3;
  if (inputs.isHighImpactType) mkt += 4; // injury/transaction bonus
  if (inputs.injuryDesignation === "OUT" || inputs.injuryDesignation === "IL-60") mkt += 4;
  else if (inputs.injuryDesignation === "Doubtful") mkt += 2;
  if (inputs.bettingRelevance) mkt += 2;
  const marketImpactScore = Math.min(24, mkt);

  /* 4. Recency bonus  (max 12 — bonus only, no penalty) */
  let recencyBonus = 0;
  if      (ageMinutes < 15)  recencyBonus = 12;
  else if (ageMinutes < 60)  recencyBonus = 10;
  else if (ageMinutes < 180) recencyBonus = 7;
  else if (ageMinutes < 360) recencyBonus = 4;
  else if (ageMinutes < 720) recencyBonus = 2;

  /* 5. Relevance score  (max 8) */
  const verdictMult: Record<string, number> = {
    confirmed: 1.0, likely: 0.85, rumor: 0.6, contradicted: 0.3, review: 0.7,
  };
  const vm = verdictMult[inputs.verdict] ?? 0.7;
  const bettingPts = inputs.bettingRelevance ? 5 : 0;
  const fantasyPts = inputs.fantasyRelevance  ? 3 : 0;
  const relevanceScore = Math.min(8, (bettingPts + fantasyPts) * vm);

  /* 6. Context score  (max 6) */
  let ctx = 0;
  if (inputs.hasMatchupEdge)    ctx += 2;
  if (inputs.hasRotationNote)   ctx += 1.5;
  if (inputs.hasSchemeNote)     ctx += 2;
  if (inputs.hasPitcherMatchup) ctx += 2;
  if (inputs.hasLineupStatus)   ctx += 1;
  if (inputs.hasWeatherNote)    ctx += 1;
  const contextScore = Math.min(6, ctx);

  /* Raw total */
  const rawBeforeMods = confidenceScore + sourceQualityScore + marketImpactScore
                      + recencyBonus + relevanceScore + contextScore;

  /* League modifier — amplifies market+context components */
  const mod = getLeagueModifier(inputs.sport as Sport, inputs.signalType);
  const modifiedMarket  = marketImpactScore * mod.marketMultiplier;
  const modifiedContext = contextScore * mod.contextMultiplier;
  const totalScore = Math.min(100, Math.round(
    (confidenceScore + sourceQualityScore + modifiedMarket
     + recencyBonus + relevanceScore + modifiedContext) * 10
  ) / 10);

  /* Band */
  const band = getScoreBand(totalScore);

  /* Urgency */
  let urgencyLabel: UrgencyLabel;
  let urgencyReason: string;

  const isBreakingInjury = (inputs.injuryDesignation === "OUT" || inputs.injuryDesignation === "IL-60")
                           && ageMinutes < 60;
  if ((totalScore >= 80 && ageMinutes < 30) || isBreakingInjury) {
    urgencyLabel = "LIVE";
    urgencyReason = isBreakingInjury
      ? `Breaking: ${inputs.injuryDesignation} confirmed within 60 minutes — adjust bets immediately`
      : "Real-time edge — line may still be moving, act within the next 15 minutes";
  } else if (totalScore >= 65 && ageMinutes < 120 && (inputs.bettingRelevance || (delta > 0)) && decisionWindowOpen) {
    urgencyLabel = "URGENT";
    urgencyReason = delta > 0
      ? `Line moved ${delta} pts — sharp money still flowing, window closing`
      : "High-confidence signal — decision window open now";
  } else if (totalScore >= 48 && decisionWindowOpen) {
    urgencyLabel = "WATCH";
    urgencyReason = "Actionable signal — monitor for confirmation or market movement";
  } else {
    urgencyLabel = "NOTE";
    urgencyReason = "Context signal — low urgency or closed decision window";
  }

  /* Trust label */
  const trustMap: Record<string, TrustLabel> = {
    Consensus: "Consensus", Corroborated: "Corroborated",
    Developing: "Developing", Unverified: "Unverified",
  };
  const trustLabel = trustMap[inputs.confirmationStrength] ?? "Developing";

  /* Explanation */
  const factorsByContrib: Array<[string, number]> = [
    ["confidence", confidenceScore],
    ["source quality", sourceQualityScore],
    ["market impact", modifiedMarket],
    ["recency", recencyBonus],
    ["relevance", relevanceScore],
    ["context", modifiedContext],
  ].sort((a, b) => (b[1] as number) - (a[1] as number)) as Array<[string, number]>;
  const topFactors = factorsByContrib.slice(0, 3).map(f => f[0]);

  const parts: string[] = [];
  if (delta >= 2) parts.push(`${delta}-pt line move (high impact)`);
  else if (delta >= 0.5) parts.push(`${delta}-pt line move`);
  if (inputs.isSharpMoney) parts.push("sharp money confirmed");
  if (inputs.isHighImpactType) parts.push(`${inputs.signalType.replace("_", " ")} signal type (high-impact category)`);
  if (inputs.injuryDesignation) parts.push(`${inputs.injuryDesignation} designation`);
  if (inputs.bettingRelevance) parts.push("betting relevance confirmed");
  const BANDS = SCORE_BANDS;
  const scoreExplanation =
    `Ranked ${BANDS[band].label} (${totalScore}/100): ${parts.join(" + ") || "context signal"}. ` +
    `Top factors: ${topFactors.join(", ")}.`;

  return {
    totalScore,
    band,
    urgencyLabel,
    urgencyReason,
    trustLabel,
    scoreExplanation,
    breakdown: {
      confidenceScore: Math.round(confidenceScore * 10) / 10,
      sourceQualityScore: Math.round(sourceQualityScore * 10) / 10,
      marketImpactScore: Math.round(modifiedMarket * 10) / 10,
      recencyBonus: Math.round(recencyBonus * 10) / 10,
      relevanceScore: Math.round(relevanceScore * 10) / 10,
      contextScore: Math.round(modifiedContext * 10) / 10,
      leagueModifierApplied: mod.label,
      rawBeforeMods: Math.round(rawBeforeMods * 10) / 10,
    },
  };
}

