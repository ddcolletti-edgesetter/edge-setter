// ─── Dempster-Shafer Confidence Engine ───────────────────────────────────────
// Combines independent evidence sources into a single belief score using
// Dempster's Rule of Combination:
//   combined = 1 - (1 - m1)(1 - m2)...(1 - mN)
//
// Belief masses represent how much each source reduces remaining doubt.
// They combine multiplicatively — two independent 0.85 sources combine to
// 1 - (0.15 × 0.15) = 0.9775, not 1.70.
//
// Tier belief masses are calibrated starting priors. Once the historical
// bootstrap runs, these should be replaced with real per-source accuracy
// scores from the source scorer.

export type SourceTier = "tier1" | "tier2" | "tier3" | "tier4" | "tier5";

export interface EvidenceSource {
  tier: SourceTier;
  stance: "support" | "contradict" | "neutral";
  sourceAccuracyOverride?: number; // 0-1, from source scorer if available
  insiderMassBoost?: number;       // additive boost from insider signal detection
}

// Base belief masses by tier — starting priors.
// Tune against historical outcomes after bootstrap runs.
const TIER_BELIEF_MASS: Record<SourceTier, number> = {
  tier1: 0.85,
  tier2: 0.65,
  tier3: 0.40,
  tier4: 0.22,
  tier5: 0.12,
};

// Confidence thresholds that map to verdict states.
export const CONFIDENCE_THRESHOLDS = {
  VERIFIED:   0.95, // agent consensus is definitive — show VERIFIED / 100%
  CONFIRMED:  0.85, // strong consensus, still escalating
  LIKELY:     0.65, // meaningful signal, multiple sources
  DEVELOPING: 0.45, // early detection, single or weak sources
};

export interface DSTResult {
  belief: number;
  confidence: number;    // 0-100 integer for display + storage
  conflictMass: number;
  supportCount: number;
  contradictCount: number;
}

function effectiveMass(source: EvidenceSource): number {
  const base = source.sourceAccuracyOverride ?? TIER_BELIEF_MASS[source.tier];
  const boost = source.insiderMassBoost ?? 0;
  // Cap at 0.88 — a lone insider should never hit VERIFIED on their own.
  // VERIFIED requires two strong sources or one source + corroboration.
  return Math.min(base + boost, 0.88);
}

export function computeDSTConfidence(sources: EvidenceSource[]): DSTResult {
  const supporting    = sources.filter(s => s.stance === "support");
  const contradicting = sources.filter(s => s.stance === "contradict");

  const supportCount    = supporting.length;
  const contradictCount = contradicting.length;

  if (supportCount === 0 && contradictCount === 0) {
    return { belief: 0, confidence: 0, conflictMass: 0, supportCount: 0, contradictCount: 0 };
  }

  let supportBelief = 0;
  if (supporting.length > 0) {
    supportBelief = effectiveMass(supporting[0]);
    for (let i = 1; i < supporting.length; i++) {
      const mass = effectiveMass(supporting[i]);
      supportBelief = 1 - (1 - supportBelief) * (1 - mass);
    }
  }

  let contradictBelief = 0;
  if (contradicting.length > 0) {
    contradictBelief = effectiveMass(contradicting[0]);
    for (let i = 1; i < contradicting.length; i++) {
      const mass = effectiveMass(contradicting[i]);
      contradictBelief = 1 - (1 - contradictBelief) * (1 - mass);
    }
  }

  const conflictMass = supportBelief * contradictBelief;

  // Classic DST normalization: K = 1 - conflictMass
  const K = 1 - conflictMass;
  const netBelief = K > 0 ? (supportBelief * (1 - contradictBelief)) / K : 0;
  const confidence = Math.round(Math.min(netBelief, 1) * 100);

  return { belief: netBelief, confidence, conflictMass, supportCount, contradictCount };
}

export function verdictFromDST(result: DSTResult): {
  verdict: "confirmed" | "likely" | "rumor" | "contradicted" | "review";
  needsReview: boolean;
  displayConfidence: number;
} {
  const { belief, conflictMass, confidence, contradictCount } = result;

  if (conflictMass > 0.30) {
    return { verdict: "review", needsReview: true, displayConfidence: confidence };
  }

  if (contradictCount > 0 && belief < 0.35) {
    return { verdict: "contradicted", needsReview: false, displayConfidence: confidence };
  }

  if (belief >= CONFIDENCE_THRESHOLDS.VERIFIED) {
    // Agent consensus is definitive. North Star: this IS verification.
    return { verdict: "confirmed", needsReview: false, displayConfidence: 100 };
  }

  if (belief >= CONFIDENCE_THRESHOLDS.CONFIRMED) {
    return { verdict: "confirmed", needsReview: false, displayConfidence: confidence };
  }

  if (belief >= CONFIDENCE_THRESHOLDS.LIKELY) {
    return { verdict: "likely", needsReview: false, displayConfidence: confidence };
  }

  if (belief >= CONFIDENCE_THRESHOLDS.DEVELOPING) {
    return { verdict: "likely", needsReview: false, displayConfidence: confidence };
  }

  return { verdict: "rumor", needsReview: false, displayConfidence: confidence };
}
