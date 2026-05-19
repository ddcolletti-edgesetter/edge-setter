import crypto from "node:crypto";

import type {
  ReplayConsensusArbitration,
  ReplayConsensusArbitrationRecommendation,
  ReplayConsensusDivergenceCategory,
  ReplayConsensusDivergenceSummary,
  ReplayConsensusInput,
  ReplayConsensusResult,
  ReplayConsensusSummary,
  ReplayConsensusValidatorDefinition,
  ReplayConsensusValidatorResult,
  ReplayConsensusVote,
  ReplayConsensusVoteAggregation,
} from "./replay-consensus-contract";

const DIVERGENCE_CATEGORIES: readonly ReplayConsensusDivergenceCategory[] = [
  "none",
  "timeline",
  "snapshot",
  "settlement",
  "signal",
  "provenance",
  "integrity",
];

export function buildReplayConsensusResult(
  input: ReplayConsensusInput,
): ReplayConsensusResult {
  const validators = normalizeValidators(input.validators).map((validator) =>
    executeReplayConsensusValidator(
      validator,
      input.generated_at,
    ),
  );
  const voteAggregation = aggregateReplayConsensusVotes(
    validators,
    input.quorum_threshold,
    input.approval_threshold,
  );
  const divergence = buildReplayConsensusDivergenceSummary(validators);
  const consensusVote = resolveConsensusVote(voteAggregation);
  const arbitration = buildReplayConsensusArbitration(
    consensusVote,
    voteAggregation,
    divergence,
  );
  const summary = buildReplayConsensusSummary({
    replay_hash: input.replay_hash,
    compared_replay_hash: input.compared_replay_hash,
    generated_at: input.generated_at,
    validators,
    vote_aggregation: voteAggregation,
    divergence,
    arbitration,
    consensus_vote: consensusVote,
  });
  const payload = {
    replay_hash: input.replay_hash,
    compared_replay_hash: input.compared_replay_hash,
    generated_at: input.generated_at,
    validators,
    vote_aggregation: voteAggregation,
    divergence,
    arbitration,
    summary,
  };

  return deepFreeze({
    ...payload,
    consensus_hash: computeReplayConsensusHash(payload),
  });
}

export function executeReplayConsensusValidator(
  validator: ReplayConsensusValidatorDefinition,
  generatedAt: string,
): ReplayConsensusValidatorResult {
  const divergenceCategories = normalizeDivergenceCategories(
    validator.divergence_categories,
    validator.vote,
  );
  const propagatedConfidence = propagateValidatorConfidence(
    validator.base_confidence,
    validator.vote,
    divergenceCategories,
  );
  const payload = {
    validator_id: validator.validator_id,
    validator_type: validator.validator_type,
    vote: validator.vote,
    weight: validator.weight,
    base_confidence: validator.base_confidence,
    propagated_confidence: propagatedConfidence,
    weighted_confidence: roundConsensusNumber(propagatedConfidence * validator.weight),
    divergence_categories: divergenceCategories,
    lineage_reference: validator.lineage_reference,
    generated_at: generatedAt,
  };

  return deepFreeze({
    ...payload,
    validator_hash: computeReplayConsensusHash(payload),
  });
}

export function aggregateReplayConsensusVotes(
  validators: readonly ReplayConsensusValidatorResult[],
  quorumThreshold: number,
  approvalThreshold: number,
): ReplayConsensusVoteAggregation {
  const totalWeight = roundConsensusNumber(
    validators.reduce((sum, validator) => sum + validator.weight, 0),
  );
  const approveWeight = sumVoteWeight(validators, "approve");
  const divergeWeight = sumVoteWeight(validators, "diverge");
  const abstainWeight = sumVoteWeight(validators, "abstain");
  const participatingWeight = roundConsensusNumber(approveWeight + divergeWeight);
  const quorumRatio = totalWeight === 0 ? 0 : roundConsensusNumber(participatingWeight / totalWeight);
  const approvalRatio = participatingWeight === 0 ? 0 : roundConsensusNumber(approveWeight / participatingWeight);
  const divergenceRatio = participatingWeight === 0 ? 0 : roundConsensusNumber(divergeWeight / participatingWeight);
  const payload = {
    total_weight: totalWeight,
    participating_weight: participatingWeight,
    approve_weight: approveWeight,
    diverge_weight: divergeWeight,
    abstain_weight: abstainWeight,
    quorum_ratio: quorumRatio,
    approval_ratio: approvalRatio,
    divergence_ratio: divergenceRatio,
    quorum_met: quorumRatio >= quorumThreshold && approvalRatio >= 0,
  };

  return deepFreeze({
    ...payload,
    aggregation_hash: computeReplayConsensusHash({
      ...payload,
      quorum_threshold: quorumThreshold,
      approval_threshold: approvalThreshold,
    }),
  });
}

export function buildReplayConsensusDivergenceSummary(
  validators: readonly ReplayConsensusValidatorResult[],
): ReplayConsensusDivergenceSummary {
  const categoryWeights = DIVERGENCE_CATEGORIES.reduce<Record<ReplayConsensusDivergenceCategory, number>>((acc, category) => {
    acc[category] = 0;
    return acc;
  }, {} as Record<ReplayConsensusDivergenceCategory, number>);

  for (const validator of validators) {
    for (const category of validator.divergence_categories) {
      categoryWeights[category] = roundConsensusNumber(
        (categoryWeights[category] ?? 0) + validator.weight,
      );
    }
  }

  const categories = DIVERGENCE_CATEGORIES
    .filter((category) => category !== "none" && (categoryWeights[category] ?? 0) > 0)
    .sort((left, right) => left.localeCompare(right));
  const dominantCategory = [...categories].sort((left, right) =>
    (categoryWeights[right] ?? 0) - (categoryWeights[left] ?? 0) ||
    left.localeCompare(right),
  )[0] ?? "none";
  const payload = {
    divergence_detected: categories.length > 0,
    categories,
    category_weights: categoryWeights,
    dominant_category: dominantCategory,
  };

  return deepFreeze({
    ...payload,
    divergence_hash: computeReplayConsensusHash(payload),
  });
}

export function buildReplayConsensusArbitration(
  consensusVote: ReplayConsensusVote,
  aggregation: ReplayConsensusVoteAggregation,
  divergence: ReplayConsensusDivergenceSummary,
): ReplayConsensusArbitration {
  const recommendation = resolveArbitrationRecommendation(
    consensusVote,
    aggregation,
    divergence,
  );
  const confidence = roundConsensusNumber(
    Math.max(0, Math.min(100, (aggregation.approval_ratio - aggregation.divergence_ratio + 1) * 50)),
  );
  const payload = {
    recommendation,
    reason: arbitrationReason(recommendation, divergence),
    confidence,
  };

  return deepFreeze({
    ...payload,
    arbitration_hash: computeReplayConsensusHash(payload),
  });
}

function buildReplayConsensusSummary(input: {
  readonly replay_hash: string;
  readonly compared_replay_hash: string | null;
  readonly generated_at: string;
  readonly validators: readonly ReplayConsensusValidatorResult[];
  readonly vote_aggregation: ReplayConsensusVoteAggregation;
  readonly divergence: ReplayConsensusDivergenceSummary;
  readonly arbitration: ReplayConsensusArbitration;
  readonly consensus_vote: ReplayConsensusVote;
}): ReplayConsensusSummary {
  const consensusConfidence = input.validators.length === 0
    ? 0
    : roundConsensusNumber(
      input.validators.reduce((sum, validator) => sum + validator.weighted_confidence, 0) /
        Math.max(1, input.vote_aggregation.total_weight),
    );
  const payload = {
    replay_hash: input.replay_hash,
    compared_replay_hash: input.compared_replay_hash,
    generated_at: input.generated_at,
    validator_count: input.validators.length,
    quorum_met: input.vote_aggregation.quorum_met,
    consensus_vote: input.consensus_vote,
    consensus_confidence: consensusConfidence,
    divergence_detected: input.divergence.divergence_detected,
    arbitration_recommendation: input.arbitration.recommendation,
    validator_hashes: input.validators.map((validator) => validator.validator_hash),
  };

  return deepFreeze({
    ...payload,
    summary_hash: computeReplayConsensusHash(payload),
  });
}

function normalizeValidators(
  validators: readonly ReplayConsensusValidatorDefinition[],
): readonly ReplayConsensusValidatorDefinition[] {
  return deepFreeze(validators.map((validator) => ({
    validator_id: validator.validator_id,
    validator_type: validator.validator_type,
    weight: validator.weight,
    base_confidence: validator.base_confidence,
    lineage_reference: validator.lineage_reference,
    vote: validator.vote,
    divergence_categories: normalizeDivergenceCategories(
      validator.divergence_categories,
      validator.vote,
    ),
    notes: validator.notes ? [...validator.notes].sort((left, right) => left.localeCompare(right)) : undefined,
  })).sort((left, right) =>
    left.validator_id.localeCompare(right.validator_id) ||
    left.validator_type.localeCompare(right.validator_type),
  ));
}

function normalizeDivergenceCategories(
  categories: readonly ReplayConsensusDivergenceCategory[],
  vote: ReplayConsensusVote,
): readonly ReplayConsensusDivergenceCategory[] {
  const normalized = Array.from(new Set(categories.length === 0 ? ["none" as const] : categories))
    .filter((category) => DIVERGENCE_CATEGORIES.includes(category))
    .sort((left, right) => left.localeCompare(right));

  if (vote !== "diverge") return ["none"];
  const withoutNone = normalized.filter((category) => category !== "none");
  return withoutNone.length > 0 ? withoutNone : ["none"];
}

function propagateValidatorConfidence(
  baseConfidence: number,
  vote: ReplayConsensusVote,
  categories: readonly ReplayConsensusDivergenceCategory[],
): number {
  const divergencePenalty = categories.filter((category) => category !== "none").length * 3;
  const voteAdjustment = vote === "approve" ? 2 : vote === "diverge" ? -divergencePenalty : -8;
  return roundConsensusNumber(Math.max(0, Math.min(100, baseConfidence + voteAdjustment)));
}

function sumVoteWeight(
  validators: readonly ReplayConsensusValidatorResult[],
  vote: ReplayConsensusVote,
): number {
  return roundConsensusNumber(
    validators
      .filter((validator) => validator.vote === vote)
      .reduce((sum, validator) => sum + validator.weight, 0),
  );
}

function resolveConsensusVote(
  aggregation: ReplayConsensusVoteAggregation,
): ReplayConsensusVote {
  if (!aggregation.quorum_met) return "abstain";
  if (aggregation.diverge_weight > aggregation.approve_weight) return "diverge";
  if (aggregation.approve_weight > aggregation.diverge_weight) return "approve";
  return "abstain";
}

function resolveArbitrationRecommendation(
  consensusVote: ReplayConsensusVote,
  aggregation: ReplayConsensusVoteAggregation,
  divergence: ReplayConsensusDivergenceSummary,
): ReplayConsensusArbitrationRecommendation {
  if (!aggregation.quorum_met) return "insufficient_quorum";
  if (consensusVote === "approve" && !divergence.divergence_detected) return "accept_replay";
  if (divergence.dominant_category === "integrity" || divergence.dominant_category === "timeline") {
    return "reject_replay";
  }
  if (consensusVote === "diverge") return "reconstruct_replay";
  return "manual_review";
}

function arbitrationReason(
  recommendation: ReplayConsensusArbitrationRecommendation,
  divergence: ReplayConsensusDivergenceSummary,
): string {
  switch (recommendation) {
    case "accept_replay":
      return "quorum_approved_without_divergence";
    case "reject_replay":
      return `critical_divergence:${divergence.dominant_category}`;
    case "reconstruct_replay":
      return `divergence_requires_reconstruction:${divergence.dominant_category}`;
    case "manual_review":
      return "mixed_consensus_requires_review";
    case "insufficient_quorum":
      return "validator_quorum_not_met";
  }
}

function roundConsensusNumber(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function computeReplayConsensusHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableReplayConsensusStringify(value))
    .digest("hex");
}

function stableReplayConsensusStringify(value: unknown): string {
  return JSON.stringify(sortReplayConsensusKeys(value));
}

function sortReplayConsensusKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortReplayConsensusKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortReplayConsensusKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (typeof value === "undefined") return null;
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) {
      deepFreeze(item);
    }
  }

  return value;
}
