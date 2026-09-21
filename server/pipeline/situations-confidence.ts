import { computeCanonicalHash } from "./canonical-hash";
import type { SituationConfidenceExplanation, SituationConfidenceFactorBreakdown, SituationType } from "./situations-contract";

export interface SituationConfidenceInput {
  readonly source_reliability: number;
  readonly independent_confirmations: number;
  readonly market_alignment: number;
  readonly validator_agreement: number;
  readonly official_confirmation: number;
  readonly freshness: number;
  readonly contradiction_penalty: number;
  readonly computed_at: string;
  /**
   * Situation type drives a factor-cap profile. When omitted the market profile
   * is used (backward compatible with callers that pre-date the split).
   */
  readonly situation_type?: SituationType;
}

export function computeSituationConfidence(input: SituationConfidenceInput): SituationConfidenceExplanation {
  // Non-market situations (injury/roster/lineup/operator_note) never move betting lines, so market_alignment
  // sits at a dead ~2/16 for them (verified against prod: 13% of cap, flat). Independent_confirmations is also
  // near-dead because this news comes from a single authoritative feed (single source, no second corroborator).
  // Reallocate the inapplicable market_alignment cap (16) to official_confirmation — the signal that actually
  // distinguishes strong official news — by raising its cap 20->36 and scaling its value x2. Backtested against
  // 250 live prod situations: only consensus-confirmed (official 18 -> 36) non-market situations clear the 65
  // escalation gate (34/146, 23%); non-consensus (12) top out at 64 and unconfirmed (0) stay low. Zero false
  // positives, and market situations are untouched (they keep the 16/20 profile).
  const nonMarket = input.situation_type != null && input.situation_type !== "market";
  const marketAlignmentCap = nonMarket ? 0 : 16;
  const officialConfirmationCap = nonMarket ? 36 : 20;
  const officialConfirmationValue = nonMarket ? input.official_confirmation * 2 : input.official_confirmation;

  const factors: SituationConfidenceFactorBreakdown = {
    source_reliability: clamp(input.source_reliability, 0, 22),
    independent_confirmations: clamp(input.independent_confirmations, 0, 18),
    market_alignment: clamp(input.market_alignment, 0, marketAlignmentCap),
    validator_agreement: clamp(input.validator_agreement, 0, 14),
    official_confirmation: clamp(officialConfirmationValue, 0, officialConfirmationCap),
    freshness: clamp(input.freshness, 0, 10),
    contradiction_penalty: clamp(input.contradiction_penalty, 0, 40),
  };

  const positive =
    factors.source_reliability +
    factors.independent_confirmations +
    factors.market_alignment +
    factors.validator_agreement +
    factors.official_confirmation +
    factors.freshness;
  const score = Math.round(clamp(positive - factors.contradiction_penalty, 0, 100));
  const explanationWithoutHash = {
    score,
    factors,
    reasoning: buildReasoning(factors, score),
    computed_at: input.computed_at,
  };

  return {
    ...explanationWithoutHash,
    replay_hash: computeCanonicalHash(explanationWithoutHash),
  };
}

function buildReasoning(factors: SituationConfidenceFactorBreakdown, score: number): string[] {
  const reasoning: string[] = [];
  if (factors.official_confirmation > 0) reasoning.push("Official confirmation materially supports the situation");
  if (factors.independent_confirmations >= 10) reasoning.push("Independent confirmations show convergence beyond a single source");
  if (factors.market_alignment >= 8) reasoning.push("Market movement aligns with the reported development");
  if (factors.validator_agreement >= 8) reasoning.push("Validator agreement supports the current read");
  if (factors.freshness < 4) reasoning.push("Freshness is weak; confidence is restrained");
  if (factors.contradiction_penalty > 0) reasoning.push("Contradictory evidence applied an explicit penalty");
  if (reasoning.length === 0) reasoning.push(score >= 50 ? "Confidence is supported by moderate evidence" : "Confidence remains low and watch-only");
  return reasoning;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
