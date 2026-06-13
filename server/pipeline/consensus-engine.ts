/**
 * Edge Setter — Consensus Engine
 *
 * Takes N evaluator outputs and produces a ConsensusResult:
 *   - blendedConfidence    — weighted average of all evaluator scores
 *   - consensusVerdict     — majority vote with tie-breaking
 *   - confirmationStrength — derived from agreement ratio
 *   - validatorAgreement   — 0–14, replaces the bridge proxy in situations-adapter.ts
 *   - agreementRatio       — 0–1, what fraction of evaluators agree on verdict
 *   - conflictDetected     — true if any evaluator contradicts the majority
 *
 * This is the only file that knows about multiple evaluators. processor.ts
 * calls runConsensus() and passes the result downstream. Neither scorer.ts
 * nor situations-confidence.ts know this layer exists.
 */

import type { RawEvent, LiveSignal } from "./types";
import { runAllEvaluators, type EvaluatorOutput, type EvaluatorVerdict } from "./consensus-evaluator";

export interface ConsensusResult {
  readonly blendedConfidence: number;         // 0–100, weighted average
  readonly consensusVerdict: EvaluatorVerdict;
  readonly confirmationStrength: string;      // "Consensus" | "Corroborated" | "Developing" | "Unverified"
  readonly validatorAgreement: number;        // 0–14, for situations-confidence.ts
  readonly agreementRatio: number;            // 0–1
  readonly conflictDetected: boolean;
  readonly evaluatorOutputs: EvaluatorOutput[];
  readonly reasoning: string[];               // one line per evaluator, for agent transparency
}

/* ─── Verdict majority vote ──────────────────────────────────────────────── */

function tallyVerdicts(outputs: EvaluatorOutput[]): {
  winner: EvaluatorVerdict;
  counts: Map<EvaluatorVerdict, number>;
  weightedCounts: Map<EvaluatorVerdict, number>;
} {
  const counts = new Map<EvaluatorVerdict, number>();
  const weightedCounts = new Map<EvaluatorVerdict, number>();

  for (const o of outputs) {
    counts.set(o.verdict, (counts.get(o.verdict) ?? 0) + 1);
    weightedCounts.set(o.verdict, (weightedCounts.get(o.verdict) ?? 0) + o.weight);
  }

  // Winner = highest weighted vote
  let winner: EvaluatorVerdict = "review";
  let maxWeight = -1;
  for (const [verdict, w] of weightedCounts) {
    if (w > maxWeight) {
      maxWeight = w;
      winner = verdict;
    }
  }

  return { winner, counts, weightedCounts };
}

/* ─── Agreement ratio ────────────────────────────────────────────────────── */

function computeAgreementRatio(outputs: EvaluatorOutput[], winner: EvaluatorVerdict): number {
  const totalWeight = outputs.reduce((s, o) => s + o.weight, 0);
  const winnerWeight = outputs
    .filter(o => o.verdict === winner)
    .reduce((s, o) => s + o.weight, 0);
  return totalWeight > 0 ? winnerWeight / totalWeight : 0;
}

/* ─── validator_agreement (0–14) ─────────────────────────────────────────── */
//
// Derived from actual evaluator vote spread, not a proxy.
// Tight agreement across high-weight evaluators → 14.
// Wide disagreement or contradiction → 0.
//
// Scale:
//   14  — all 5 agree on same verdict
//   11  — 4/5 agree (one outlier)
//   8   — 3/5 agree (clear majority)
//   4   — 2/5 agree (weak majority)
//   0   — contradiction detected OR no clear majority

function computeValidatorAgreement(
  outputs: EvaluatorOutput[],
  winner: EvaluatorVerdict,
  agreementRatio: number,
  conflictDetected: boolean,
): number {
  if (conflictDetected) return 0;

  const agreeingCount = outputs.filter(o => o.verdict === winner).length;
  const total = outputs.length;

  // Base from agreement count
  let base: number;
  if (agreeingCount === total)          base = 14;
  else if (agreeingCount >= total - 1)  base = 11;
  else if (agreeingCount >= total - 2)  base = 8;
  else if (agreeingCount >= total - 3)  base = 4;
  else                                  base = 1;

  // Boost if verdict is confirmed or likely (stronger signal)
  const verdictBoost = winner === "confirmed" ? 0 : winner === "likely" ? 0 : -2;

  // Boost from agreement ratio being very tight
  const ratioBoost = agreementRatio >= 0.9 ? 1 : agreementRatio >= 0.7 ? 0 : -1;

  return Math.min(14, Math.max(0, base + verdictBoost + ratioBoost));
}

/* ─── Conflict detection ─────────────────────────────────────────────────── */

function detectConflict(outputs: EvaluatorOutput[], winner: EvaluatorVerdict): boolean {
  // Conflict = any evaluator says "contradicted" while others say "confirmed"/"likely"
  // OR: high-weight evaluators disagree with each other
  const hasContradicted = outputs.some(o => o.verdict === "contradicted");
  const hasConfirmed = outputs.some(o => o.verdict === "confirmed" || o.verdict === "likely");
  if (hasContradicted && hasConfirmed) return true;

  // High-weight evaluators (weight ≥ 0.20) disagreeing
  const highWeightOutputs = outputs.filter(o => o.weight >= 0.20);
  const highWeightVerdicts = new Set(highWeightOutputs.map(o => o.verdict));
  if (highWeightVerdicts.size >= 3) return true; // 3+ different verdicts among high-weight = conflict

  return false;
}

/* ─── Confirmation strength ──────────────────────────────────────────────── */

function deriveConfirmationStrength(
  agreementRatio: number,
  winner: EvaluatorVerdict,
  blendedConfidence: number,
): string {
  if (agreementRatio >= 0.85 && (winner === "confirmed" || winner === "likely") && blendedConfidence >= 80) {
    return "Consensus";
  }
  if (agreementRatio >= 0.65 && blendedConfidence >= 65) {
    return "Corroborated";
  }
  if (blendedConfidence >= 45) {
    return "Developing";
  }
  return "Unverified";
}

/* ─── Weighted confidence blend ──────────────────────────────────────────── */

function blendConfidence(outputs: EvaluatorOutput[]): number {
  const totalWeight = outputs.reduce((s, o) => s + o.weight, 0);
  if (totalWeight === 0) return 50;
  const weighted = outputs.reduce((s, o) => s + o.confidence * o.weight, 0);
  return Math.min(100, Math.max(0, Math.round(weighted / totalWeight)));
}

/* ─── Main export ────────────────────────────────────────────────────────── */

export function runConsensus(raw: RawEvent, fields: Partial<LiveSignal>): ConsensusResult {
  const outputs = runAllEvaluators(raw, fields);

  const blended = blendConfidence(outputs);
  const { winner, counts, weightedCounts } = tallyVerdicts(outputs);
  const agreementRatio = computeAgreementRatio(outputs, winner);
  const conflictDetected = detectConflict(outputs, winner);
  const validatorAgreement = computeValidatorAgreement(outputs, winner, agreementRatio, conflictDetected);
  const confirmationStrength = deriveConfirmationStrength(agreementRatio, winner, blended);

  // If conflict detected, force review verdict and cap confidence
  const finalVerdict: EvaluatorVerdict = conflictDetected ? "review" : winner;
  const finalConfidence = conflictDetected ? Math.min(blended, 65) : blended;

  const reasoning = outputs.map((o: EvaluatorOutput) =>
    `${o.evaluator}: ${o.verdict} (${o.confidence}%) — ${o.reasoning}`
  );

  return {
    blendedConfidence: finalConfidence,
    consensusVerdict: finalVerdict,
    confirmationStrength,
    validatorAgreement,
    agreementRatio,
    conflictDetected,
    evaluatorOutputs: outputs,
    reasoning,
  };
}
