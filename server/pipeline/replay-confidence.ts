import { getLatestReplayVerification, getReplayProvenance, listReplayLineageParents } from "./store";
import { analyzeReplayDivergence } from "./replay-divergence";
import type {
  ReplayConfidenceFactor,
  ReplayConfidenceResponse,
  ReplayDivergenceResponse,
  ReplayLineageConfidenceAdjustment,
  ReplayMismatchCategory,
  ReplayProvenanceResponse,
} from "./replay-contract";

const PROVENANCE_REQUIRED_FIELDS = [
  "replay_engine_version",
  "reconstruction_timestamp",
  "snapshot_count",
  "signal_count",
  "replay_source_metadata",
];

const CATEGORY_PENALTIES: Record<ReplayMismatchCategory, number> = {
  integrity_hash_mismatch: -20,
  timeline_mismatch: -15,
  snapshot_mismatch: -12,
  settlement_mismatch: -10,
  signal_mismatch: -8,
  provenance_mismatch: -6,
};

export function propagateReplayConfidence(replayHash: string): ReplayConfidenceResponse | null {
  const verification = getLatestReplayVerification(replayHash);
  if (!verification) return null;

  const divergence = analyzeReplayDivergence(replayHash);
  if (!divergence) return null;

  const provenance = getReplayProvenance(replayHash);
  const parents = listReplayLineageParents(replayHash);
  const baseConfidence = baseConfidenceForStatus(verification.verification_status);
  const confidenceFactors = buildConfidenceFactors(divergence, provenance);
  const lineageAdjustments = buildLineageAdjustments(divergence, parents.length);
  const adjustment = [
    ...confidenceFactors.map(factor => factor.adjustment),
    ...lineageAdjustments.map(factor => factor.adjustment),
  ].reduce((sum, value) => sum + value, 0);
  const propagatedConfidence = clampConfidence(baseConfidence + adjustment);

  return {
    replay_hash: replayHash,
    base_confidence: baseConfidence,
    propagated_confidence: propagatedConfidence,
    confidence_delta: roundConfidence(propagatedConfidence - baseConfidence),
    confidence_factors: confidenceFactors,
    lineage_adjustments: lineageAdjustments,
    generated_at: divergence.analyzed_at ?? verification.created_at,
  };
}

function baseConfidenceForStatus(status: string): number {
  if (status === "verified") return 95;
  if (status === "diverged") return 70;
  if (status === "unknown") return 80;
  return 75;
}

function buildConfidenceFactors(
  divergence: ReplayDivergenceResponse,
  provenance: ReplayProvenanceResponse["provenance"] | null,
): ReplayConfidenceFactor[] {
  const factors: ReplayConfidenceFactor[] = [];

  factors.push({
    factor: "verification_status",
    adjustment: divergence.integrity_status === "verified" ? 5 : divergence.integrity_status === "diverged" ? -15 : -10,
    reason: `integrity_status=${divergence.integrity_status}`,
  });

  factors.push({
    factor: "mismatch_count",
    adjustment: -Math.min(40, divergence.mismatch_count * 5),
    reason: `mismatch_count=${divergence.mismatch_count}`,
  });

  const categoryAdjustment = divergence.mismatch_categories
    .map(category => CATEGORY_PENALTIES[category])
    .reduce((sum, value) => sum + value, 0);
  factors.push({
    factor: "mismatch_categories",
    adjustment: categoryAdjustment,
    reason: divergence.mismatch_categories.length > 0
      ? divergence.mismatch_categories.join(",")
      : "no_mismatch_categories",
  });

  factors.push({
    factor: "integrity_status",
    adjustment: divergence.integrity_status === "missing_comparison" ? -5 : 0,
    reason: `comparison=${divergence.compared_against ?? "missing"}`,
  });

  factors.push(buildProvenanceCompletenessFactor(provenance));

  return factors.map(factor => ({
    ...factor,
    adjustment: roundConfidence(factor.adjustment),
  }));
}

function buildLineageAdjustments(
  divergence: ReplayDivergenceResponse,
  parentCount: number,
): ReplayLineageConfidenceAdjustment[] {
  if (divergence.compared_against) {
    return [{
      factor: "parent_lineage",
      adjustment: 3,
      reason: `parent_count=${parentCount}`,
    }];
  }

  return [{
    factor: "missing_parent_comparison",
    adjustment: -5,
    reason: "no_parent_replay_hash_available",
  }];
}

function buildProvenanceCompletenessFactor(
  provenance: ReplayProvenanceResponse["provenance"] | null,
): ReplayConfidenceFactor {
  const body = provenance?.provenance ?? null;
  const present = PROVENANCE_REQUIRED_FIELDS.filter(field => body?.[field] != null).length;
  const missing = PROVENANCE_REQUIRED_FIELDS.length - present;

  return {
    factor: "provenance_completeness",
    adjustment: missing === 0 ? 3 : -missing * 2,
    reason: `present=${present};missing=${missing}`,
  };
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(100, roundConfidence(value)));
}

function roundConfidence(value: number): number {
  return Math.round(value * 1000) / 1000;
}
