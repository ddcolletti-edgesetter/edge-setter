import { computeCanonicalHash } from "./canonical-hash";
import type { SituationConfidenceExplanation, SituationConfidenceFactorBreakdown } from "./situations-contract";

export interface SituationConfidenceInput {
  readonly source_reliability: number;
  readonly independent_confirmations: number;
  readonly market_alignment: number;
  readonly validator_agreement: number;
  readonly official_confirmation: number;
  readonly freshness: number;
  readonly contradiction_penalty: number;
  readonly computed_at: string;
}

export function computeSituationConfidence(input: SituationConfidenceInput): SituationConfidenceExplanation {
  const factors: SituationConfidenceFactorBreakdown = {
    source_reliability: clamp(input.source_reliability, 0, 22),
    independent_confirmations: clamp(input.independent_confirmations, 0, 18),
    market_alignment: clamp(input.market_alignment, 0, 16),
    validator_agreement: clamp(input.validator_agreement, 0, 14),
    official_confirmation: clamp(input.official_confirmation, 0, 20),
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
