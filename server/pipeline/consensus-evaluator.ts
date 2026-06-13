/**
 * Edge Setter — Consensus Evaluators
 *
 * Five independent evaluators, each examining the same raw event from a
 * different angle. They share no state and do not call each other.
 * The consensus engine collects their outputs and compares them.
 *
 * Each evaluator returns:
 *   verdict    — what this angle thinks the verdict should be
 *   confidence — 0–100, how confident this angle is
 *   weight     — how much this evaluator's vote counts in the blend
 *   reasoning  — one-line explanation (for agent transparency display)
 */

import type { RawEvent, LiveSignal } from "./types";

export type EvaluatorVerdict = "confirmed" | "likely" | "rumor" | "contradicted" | "review";

export interface EvaluatorOutput {
  readonly evaluator: string;
  readonly verdict: EvaluatorVerdict;
  readonly confidence: number;   // 0–100
  readonly weight: number;       // 0–1, sum of all weights = 1.0
  readonly reasoning: string;
}

/* ─── Source Evaluator ───────────────────────────────────────────────────────
 * Judges quality based on who reported it: source tier, type, named insiders.
 * Weight: 0.30 — source identity is the strongest single signal.
 */
export function runSourceEvaluator(raw: RawEvent, fields: Partial<LiveSignal>): EvaluatorOutput {
  const payload = raw.payload as Record<string, any>;
  const sourceType = raw.source_type;
  const sourceId = raw.source_id.toLowerCase();
  const payloadSourceTypes: string[] = Array.isArray(payload.source_types)
    ? payload.source_types.map(String)
    : [sourceType];

  // Named tier-1 insiders
  const TIER1_IDENTIFIERS = [
    "woj", "shams", "schefter", "rapoport", "pelton", "haynes",
    "official", "statsapi", "mlb.com", "nba.com", "nfl.com",
    "school_sid", "athletics",
  ];
  const isTier1 = TIER1_IDENTIFIERS.some(id =>
    sourceId.includes(id) ||
    payloadSourceTypes.some(t => t.toLowerCase().includes(id))
  );

  // Official source types
  const OFFICIAL_TYPES = ["official", "team_official", "transaction", "official report"];
  const isOfficial = OFFICIAL_TYPES.some(t =>
    payloadSourceTypes.some(pt => pt.toLowerCase().includes(t.toLowerCase()))
  );

  // school_sid is a scrape of an official source — treat as tier1
  const isSIDScrape = sourceId.startsWith("sid_") || sourceType === "scrape" &&
    payloadSourceTypes.some(t => t.toLowerCase().includes("school_sid"));

  let verdict: EvaluatorVerdict;
  let confidence: number;
  let reasoning: string;

  if (isTier1 || isOfficial || isSIDScrape) {
    verdict = fields.verdict === "contradicted" ? "review" : "confirmed";
    confidence = 92;
    reasoning = `Tier-1 or official source (${raw.source_id}) — high confidence`;
  } else if (sourceType === "api") {
    verdict = "likely";
    confidence = 72;
    reasoning = `API source (${raw.source_id}) — reliable but not tier-1`;
  } else if (sourceType === "scrape") {
    verdict = "likely";
    confidence = 60;
    reasoning = `Scraped source (${raw.source_id}) — moderate confidence`;
  } else {
    verdict = "rumor";
    confidence = 40;
    reasoning = `Manual/unverified source (${raw.source_id}) — low confidence`;
  }

  return { evaluator: "SourceEvaluator", verdict, confidence, weight: 0.30, reasoning };
}

/* ─── Corroboration Evaluator ────────────────────────────────────────────────
 * Judges based on how many independent sources confirm the same event.
 * Weight: 0.25 — multiple independent sources is a strong signal.
 */
export function runCorroborationEvaluator(raw: RawEvent, fields: Partial<LiveSignal>): EvaluatorOutput {
  const payload = raw.payload as Record<string, any>;
  const sourceCount = Math.max(
    fields.source_count ?? 1,
    Number(payload.source_count ?? 1)
  );
  const confirmation = (fields.confirmation_strength ?? "Developing").toLowerCase();

  let verdict: EvaluatorVerdict;
  let confidence: number;
  let reasoning: string;

  if (sourceCount >= 3 && confirmation === "consensus") {
    verdict = "confirmed";
    confidence = 95;
    reasoning = `${sourceCount} sources + Consensus strength — strong corroboration`;
  } else if (sourceCount >= 2 && (confirmation === "consensus" || confirmation === "corroborated")) {
    verdict = "confirmed";
    confidence = 82;
    reasoning = `${sourceCount} sources + ${fields.confirmation_strength} — corroborated`;
  } else if (sourceCount >= 2) {
    verdict = "likely";
    confidence = 68;
    reasoning = `${sourceCount} sources, developing confirmation`;
  } else if (confirmation === "corroborated" || confirmation === "consensus") {
    verdict = "likely";
    confidence = 65;
    reasoning = `Single source but ${fields.confirmation_strength} label — moderate`;
  } else {
    verdict = "rumor";
    confidence = 38;
    reasoning = `Single source, ${fields.confirmation_strength ?? "Developing"} — unconfirmed`;
  }

  return { evaluator: "CorroborationEvaluator", verdict, confidence, weight: 0.25, reasoning };
}

/* ─── Market Evaluator ───────────────────────────────────────────────────────
 * Judges based on line movement and sharp money — markets often know first.
 * Weight: 0.20 — market signals are strong but not always present.
 */
export function runMarketEvaluator(raw: RawEvent, fields: Partial<LiveSignal>): EvaluatorOutput {
  const payload = raw.payload as Record<string, any>;
  const lm = fields.line_movement;
  const delta = lm?.delta ?? Number(payload.line_delta ?? 0);
  const isSharp = payload.sharp_money === true || Number(payload.sharp_percentage ?? 0) > 60;
  const hasBettingRelevance = fields.betting_relevance ?? false;

  let verdict: EvaluatorVerdict;
  let confidence: number;
  let reasoning: string;

  if (delta >= 3 && isSharp) {
    verdict = "confirmed";
    confidence = 90;
    reasoning = `${delta}-pt line move with sharp money — strong market confirmation`;
  } else if (delta >= 2 || (delta >= 1 && isSharp)) {
    verdict = "likely";
    confidence = 74;
    reasoning = `${delta}-pt line move${isSharp ? " + sharp money" : ""} — meaningful market reaction`;
  } else if (delta >= 0.5 || hasBettingRelevance) {
    verdict = "likely";
    confidence = 55;
    reasoning = delta >= 0.5
      ? `Minor line movement (${delta} pts) — early market signal`
      : "Betting-relevant signal — watch for market reaction";
  } else {
    // No market signal — this evaluator abstains by returning low-weight neutral
    verdict = "review";
    confidence = 45;
    reasoning = "No market movement detected — cannot confirm from market angle";
  }

  return { evaluator: "MarketEvaluator", verdict, confidence, weight: 0.20, reasoning };
}

/* ─── Official Evaluator ─────────────────────────────────────────────────────
 * Detects official/league/team confirmation signals.
 * Weight: 0.15 — official confirmation is definitive but rare.
 */
export function runOfficialEvaluator(raw: RawEvent, fields: Partial<LiveSignal>): EvaluatorOutput {
  const payload = raw.payload as Record<string, any>;
  const payloadSourceTypes: string[] = Array.isArray(payload.source_types)
    ? payload.source_types.map(String)
    : [raw.source_type];
  const confirmation = (fields.confirmation_strength ?? "").toLowerCase();
  const verdict = fields.verdict ?? "review";

  const OFFICIAL_PATTERNS = /official|league|team|statsapi|espn|nba\.com|nfl\.com|mlb\.com|school_sid/i;
  const hasOfficialSource = payloadSourceTypes.some(t => OFFICIAL_PATTERNS.test(t));
  const isOfficialEventType = ["eligibility_ruling", "transaction"].includes(raw.event_type);
  const hasConsensusConfirmation = confirmation.includes("consensus") || verdict === "confirmed";

  let evalVerdict: EvaluatorVerdict;
  let confidence: number;
  let reasoning: string;

  if (hasOfficialSource && isOfficialEventType) {
    evalVerdict = "confirmed";
    confidence = 96;
    reasoning = `Official source + official event type (${raw.event_type}) — verified`;
  } else if (hasOfficialSource) {
    evalVerdict = "confirmed";
    confidence = 88;
    reasoning = `Official source detected in source types`;
  } else if (hasConsensusConfirmation) {
    evalVerdict = "confirmed";
    confidence = 80;
    reasoning = `Consensus/confirmed label without official source — likely official`;
  } else if (isOfficialEventType) {
    evalVerdict = "likely";
    confidence = 70;
    reasoning = `Official event type (${raw.event_type}) but source not flagged official`;
  } else {
    evalVerdict = "review";
    confidence = 40;
    reasoning = "No official source detected — cannot confirm from official angle";
  }

  return { evaluator: "OfficialEvaluator", verdict: evalVerdict, confidence, weight: 0.15, reasoning };
}

/* ─── Recency Evaluator ──────────────────────────────────────────────────────
 * Confidence modifier based on signal age and game proximity.
 * Weight: 0.10 — recency affects urgency more than verdict, so lowest weight.
 */
export function runRecencyEvaluator(raw: RawEvent, fields: Partial<LiveSignal>): EvaluatorOutput {
  const payload = raw.payload as Record<string, any>;
  const now = Date.now();
  const receivedMs = Date.parse(raw.received_at ?? raw.created_at);
  const ageMinutes = Number.isFinite(receivedMs) ? (now - receivedMs) / 60000 : 999;

  const gameTimeMs = payload.game_time ? Date.parse(String(payload.game_time)) : null;
  const minutesToGame = gameTimeMs ? (gameTimeMs - now) / 60000 : null;
  const nearGame = minutesToGame !== null && minutesToGame > 0 && minutesToGame < 120;

  let confidence: number;
  let reasoning: string;

  if (ageMinutes < 15) {
    confidence = nearGame ? 95 : 88;
    reasoning = `Signal is ${Math.round(ageMinutes)}min old${nearGame ? " and game is <2h away — peak urgency" : " — very fresh"}`;
  } else if (ageMinutes < 60) {
    confidence = nearGame ? 82 : 72;
    reasoning = `Signal is ${Math.round(ageMinutes)}min old${nearGame ? " — decision window open" : ""}`;
  } else if (ageMinutes < 180) {
    confidence = 58;
    reasoning = `Signal is ${Math.round(ageMinutes)}min old — still actionable`;
  } else if (ageMinutes < 720) {
    confidence = 42;
    reasoning = `Signal is ${Math.round(ageMinutes / 60)}h old — context value only`;
  } else {
    confidence = 25;
    reasoning = `Signal is ${Math.round(ageMinutes / 60)}h old — stale`;
  }

  // Recency doesn't change the verdict — it inherits from the routed fields
  const inheritedVerdict: EvaluatorVerdict =
    (fields.verdict as EvaluatorVerdict) ?? "review";

  return {
    evaluator: "RecencyEvaluator",
    verdict: inheritedVerdict,
    confidence,
    weight: 0.10,
    reasoning,
  };
}

/* ─── Run all evaluators ─────────────────────────────────────────────────────
 * Convenience function — runs all 5 and returns their outputs.
 */
export function runAllEvaluators(raw: RawEvent, fields: Partial<LiveSignal>): EvaluatorOutput[] {
  return [
    runSourceEvaluator(raw, fields),
    runCorroborationEvaluator(raw, fields),
    runMarketEvaluator(raw, fields),
    runOfficialEvaluator(raw, fields),
    runRecencyEvaluator(raw, fields),
  ];
}
