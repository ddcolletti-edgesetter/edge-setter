import crypto from "node:crypto";

import type {
  ReplayConsensusDivergenceCategory,
  ReplayConsensusValidatorResult,
  ReplayConsensusVote,
} from "./replay-consensus-contract";
import type {
  ReplayArbitrationAdjudication,
  ReplayArbitrationConsensusReference,
  ReplayArbitrationDisputeResolution,
  ReplayArbitrationEscalationCategory,
  ReplayArbitrationGovernanceMode,
  ReplayArbitrationInput,
  ReplayArbitrationLineageReference,
  ReplayArbitrationOutcome,
  ReplayArbitrationRecoveryDirective,
  ReplayArbitrationRecoveryRecommendation,
  ReplayArbitrationResult,
  ReplayArbitrationSeverity,
  ReplayArbitrationSummary,
  ReplayArbitrationValidatorDispute,
} from "./replay-arbitration-contract";

const ESCALATION_CATEGORIES: readonly ReplayArbitrationEscalationCategory[] = [
  "integrity_failure",
  "provenance_divergence",
  "settlement_mutation",
  "snapshot_corruption",
  "timeline_divergence",
  "validator_deadlock",
];

const CATEGORY_SEVERITY_BASE: Readonly<Record<ReplayArbitrationEscalationCategory, number>> = {
  integrity_failure: 95,
  provenance_divergence: 72,
  settlement_mutation: 88,
  snapshot_corruption: 84,
  timeline_divergence: 78,
  validator_deadlock: 68,
};

export function buildReplayArbitrationResult(
  input: ReplayArbitrationInput,
): ReplayArbitrationResult {
  const governanceMode = input.governance_mode ?? "scaffold";
  const consensusReference = buildConsensusReference(input);
  const disputes = buildValidatorDisputes(input.consensus.validators);
  const disputeResolution = buildDisputeResolution(input.consensus.summary.consensus_vote, input.consensus.vote_aggregation);
  const escalationCategories = resolveEscalationCategories(
    input.consensus.divergence.categories,
    disputeResolution.deadlocked,
  );
  const severity = buildSeverity(
    escalationCategories,
    input.consensus.divergence.category_weights,
    input.consensus.vote_aggregation.total_weight,
    input.consensus.vote_aggregation.divergence_ratio,
  );
  const adjudication = buildAdjudication(
    input.consensus.summary.consensus_vote,
    input.consensus.vote_aggregation.quorum_met,
    escalationCategories,
    severity,
    disputeResolution,
    input.consensus.summary.consensus_confidence,
  );
  const recovery = buildRecoveryDirective(
    adjudication.outcome,
    severity,
    escalationCategories,
    governanceMode,
  );
  const lineageReferences = buildLineageReferences(input.consensus.validators);
  const summary = buildSummary({
    generated_at: input.generated_at,
    consensus_reference: consensusReference,
    adjudication,
    severity,
    dispute_resolution: disputeResolution,
    recovery,
    lineage_references: lineageReferences,
  });
  const payload = {
    generated_at: input.generated_at,
    governance_mode: governanceMode,
    consensus_reference: consensusReference,
    disputes,
    dispute_resolution: disputeResolution,
    severity,
    recovery,
    adjudication,
    lineage_references: lineageReferences,
    summary,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: computeReplayArbitrationHash(payload),
  });
}

export function computeReplayArbitrationDeterministicHash(value: unknown): string {
  return computeReplayArbitrationHash(value);
}

function buildConsensusReference(input: ReplayArbitrationInput): ReplayArbitrationConsensusReference {
  const payload = {
    replay_hash: input.consensus.replay_hash,
    compared_replay_hash: input.consensus.compared_replay_hash,
    consensus_hash: input.consensus.consensus_hash,
    consensus_vote: input.consensus.summary.consensus_vote,
    consensus_confidence: input.consensus.summary.consensus_confidence,
    arbitration_recommendation: input.consensus.arbitration.recommendation,
  };

  return deepFreeze({
    ...payload,
    reference_hash: computeReplayArbitrationHash(payload),
  });
}

function buildValidatorDisputes(
  validators: readonly ReplayConsensusValidatorResult[],
): readonly ReplayArbitrationValidatorDispute[] {
  const votes: readonly ReplayConsensusVote[] = ["approve", "abstain", "diverge"];

  return deepFreeze(votes
    .map((vote) => {
      const matching = validators
        .filter((validator) => validator.vote === vote)
        .sort((left, right) => left.validator_id.localeCompare(right.validator_id));
      const validatorIds = matching.map((validator) => validator.validator_id);
      const weight = roundArbitrationNumber(
        matching.reduce((sum, validator) => sum + validator.weight, 0),
      );
      const confidence = matching.length === 0
        ? 0
        : roundArbitrationNumber(
          matching.reduce((sum, validator) => sum + validator.weighted_confidence, 0) /
            Math.max(1, weight),
        );
      const categories = normalizeConsensusCategories(
        matching.flatMap((validator) => validator.divergence_categories),
      );
      const payload = {
        dispute_id: `validator-dispute:${vote}`,
        validator_ids: validatorIds,
        vote,
        weight,
        confidence,
        categories,
      };

      return {
        ...payload,
        dispute_hash: computeReplayArbitrationHash(payload),
      };
    }),
  );
}

function buildDisputeResolution(
  consensusVote: ReplayConsensusVote,
  aggregation: {
    readonly approve_weight: number;
    readonly diverge_weight: number;
    readonly abstain_weight: number;
    readonly quorum_met: boolean;
  },
): ReplayArbitrationDisputeResolution {
  const deadlocked = aggregation.quorum_met &&
    aggregation.approve_weight === aggregation.diverge_weight &&
    aggregation.approve_weight > 0;
  const decisiveVote = deadlocked ? "abstain" : consensusVote;
  const payload = {
    deadlocked,
    resolution_model: deadlocked
      ? "equal_weight_validator_deadlock"
      : aggregation.quorum_met
        ? "weighted_consensus_adjudication"
        : "insufficient_quorum_adjudication",
    approve_weight: aggregation.approve_weight,
    diverge_weight: aggregation.diverge_weight,
    abstain_weight: aggregation.abstain_weight,
    decisive_vote: decisiveVote,
  };

  return deepFreeze({
    ...payload,
    resolution_hash: computeReplayArbitrationHash(payload),
  });
}

function resolveEscalationCategories(
  divergenceCategories: readonly ReplayConsensusDivergenceCategory[],
  deadlocked: boolean,
): readonly ReplayArbitrationEscalationCategory[] {
  const categories = new Set<ReplayArbitrationEscalationCategory>();

  for (const category of divergenceCategories) {
    const escalation = mapConsensusCategoryToEscalation(category);
    if (escalation) categories.add(escalation);
  }
  if (deadlocked) categories.add("validator_deadlock");

  return deepFreeze(Array.from(categories).sort((left, right) => left.localeCompare(right)));
}

function buildSeverity(
  categories: readonly ReplayArbitrationEscalationCategory[],
  categoryWeights: Readonly<Record<ReplayConsensusDivergenceCategory, number>>,
  totalWeight: number,
  divergenceRatio: number,
): ReplayArbitrationSeverity {
  const scores = ESCALATION_CATEGORIES.reduce<Record<ReplayArbitrationEscalationCategory, number>>((acc, category) => {
    const weightRatio = totalWeight === 0 ? 0 : escalationWeight(category, categoryWeights) / totalWeight;
    const present = categories.includes(category);
    acc[category] = present
      ? roundArbitrationNumber(
        Math.min(100, CATEGORY_SEVERITY_BASE[category] * 0.65 + weightRatio * 25 + divergenceRatio * 10),
      )
      : 0;
    return acc;
  }, {} as Record<ReplayArbitrationEscalationCategory, number>);
  const dominantEscalation = [...categories].sort((left, right) =>
    scores[right] - scores[left] || left.localeCompare(right),
  )[0] ?? null;
  const score = dominantEscalation ? scores[dominantEscalation] : 0;
  const payload = {
    score,
    band: severityBand(score),
    dominant_escalation: dominantEscalation,
    category_scores: scores,
  };

  return deepFreeze({
    ...payload,
    severity_hash: computeReplayArbitrationHash(payload),
  });
}

function buildAdjudication(
  consensusVote: ReplayConsensusVote,
  quorumMet: boolean,
  categories: readonly ReplayArbitrationEscalationCategory[],
  severity: ReplayArbitrationSeverity,
  disputeResolution: ReplayArbitrationDisputeResolution,
  consensusConfidence: number,
): ReplayArbitrationAdjudication {
  const outcome = resolveOutcome(consensusVote, quorumMet, categories, severity, disputeResolution.deadlocked);
  const confidence = roundArbitrationNumber(
    Math.max(0, Math.min(100, consensusConfidence - severity.score * 0.18 - (disputeResolution.deadlocked ? 18 : 0))),
  );
  const payload = {
    outcome,
    confidence,
    reason: adjudicationReason(outcome, severity, disputeResolution),
    escalation_categories: categories,
  };

  return deepFreeze({
    ...payload,
    adjudication_hash: computeReplayArbitrationHash(payload),
  });
}

function buildRecoveryDirective(
  outcome: ReplayArbitrationOutcome,
  severity: ReplayArbitrationSeverity,
  categories: readonly ReplayArbitrationEscalationCategory[],
  governanceMode: ReplayArbitrationGovernanceMode,
): ReplayArbitrationRecoveryDirective {
  const recommendation = resolveRecoveryRecommendation(outcome, categories);
  const payload = {
    recommendation,
    reason: recoveryReason(recommendation, severity),
    requires_lineage_replay: recommendation === "replay_from_parent_lineage",
    autonomous_governance_ready: governanceMode === "autonomous_ready" && outcome !== "require_manual_review",
  };

  return deepFreeze({
    ...payload,
    recovery_hash: computeReplayArbitrationHash(payload),
  });
}

function buildLineageReferences(
  validators: readonly ReplayConsensusValidatorResult[],
): readonly ReplayArbitrationLineageReference[] {
  return deepFreeze(validators
    .map((validator) => {
      const payload = {
        replay_hash: validator.lineage_reference.replay_hash,
        parent_replay_hash: validator.lineage_reference.parent_replay_hash,
        lineage_hash: validator.lineage_reference.lineage_hash,
        validator_id: validator.validator_id,
        validator_hash: validator.validator_hash,
        generated_at: validator.lineage_reference.generated_at,
      };

      return {
        ...payload,
        lineage_reference_hash: computeReplayArbitrationHash(payload),
      };
    })
    .sort((left, right) =>
      left.validator_id.localeCompare(right.validator_id) ||
      left.lineage_hash.localeCompare(right.lineage_hash),
    ));
}

function buildSummary(input: {
  readonly generated_at: string;
  readonly consensus_reference: ReplayArbitrationConsensusReference;
  readonly adjudication: ReplayArbitrationAdjudication;
  readonly severity: ReplayArbitrationSeverity;
  readonly dispute_resolution: ReplayArbitrationDisputeResolution;
  readonly recovery: ReplayArbitrationRecoveryDirective;
  readonly lineage_references: readonly ReplayArbitrationLineageReference[];
}): ReplayArbitrationSummary {
  const payload = {
    replay_hash: input.consensus_reference.replay_hash,
    compared_replay_hash: input.consensus_reference.compared_replay_hash,
    generated_at: input.generated_at,
    outcome: input.adjudication.outcome,
    severity_score: input.severity.score,
    confidence: input.adjudication.confidence,
    deadlocked: input.dispute_resolution.deadlocked,
    escalation_categories: input.adjudication.escalation_categories,
    recovery_recommendation: input.recovery.recommendation,
    lineage_reference_hashes: input.lineage_references.map((reference) => reference.lineage_reference_hash),
  };

  return deepFreeze({
    ...payload,
    summary_hash: computeReplayArbitrationHash(payload),
  });
}

function mapConsensusCategoryToEscalation(
  category: ReplayConsensusDivergenceCategory,
): ReplayArbitrationEscalationCategory | null {
  switch (category) {
    case "integrity":
      return "integrity_failure";
    case "timeline":
      return "timeline_divergence";
    case "provenance":
    case "signal":
      return "provenance_divergence";
    case "settlement":
      return "settlement_mutation";
    case "snapshot":
      return "snapshot_corruption";
    case "none":
      return null;
  }
}

function escalationWeight(
  category: ReplayArbitrationEscalationCategory,
  weights: Readonly<Record<ReplayConsensusDivergenceCategory, number>>,
): number {
  switch (category) {
    case "integrity_failure":
      return weights.integrity;
    case "timeline_divergence":
      return weights.timeline;
    case "provenance_divergence":
      return roundArbitrationNumber(weights.provenance + weights.signal);
    case "settlement_mutation":
      return weights.settlement;
    case "snapshot_corruption":
      return weights.snapshot;
    case "validator_deadlock":
      return 0;
  }
}

function resolveOutcome(
  consensusVote: ReplayConsensusVote,
  quorumMet: boolean,
  categories: readonly ReplayArbitrationEscalationCategory[],
  severity: ReplayArbitrationSeverity,
  deadlocked: boolean,
): ReplayArbitrationOutcome {
  if (deadlocked || !quorumMet) return "require_manual_review";
  if (consensusVote === "approve" && categories.length === 0) return "accept_replay";
  if (categories.includes("integrity_failure")) return "reject_replay";
  if (categories.includes("snapshot_corruption") || categories.includes("settlement_mutation")) {
    return "quarantine_replay";
  }
  if (severity.score >= 50 || consensusVote === "diverge") return "recovery_recommended";
  return "require_manual_review";
}

function resolveRecoveryRecommendation(
  outcome: ReplayArbitrationOutcome,
  categories: readonly ReplayArbitrationEscalationCategory[],
): ReplayArbitrationRecoveryRecommendation {
  if (outcome === "accept_replay" || outcome === "reject_replay") return "none";
  if (categories.includes("validator_deadlock")) return "manual_validator_review";
  if (categories.includes("snapshot_corruption")) return "rebuild_snapshot";
  if (categories.includes("settlement_mutation")) return "reconcile_settlement";
  if (categories.includes("timeline_divergence")) return "replay_from_parent_lineage";
  if (categories.includes("provenance_divergence")) return "quarantine_and_revalidate";
  return "manual_validator_review";
}

function adjudicationReason(
  outcome: ReplayArbitrationOutcome,
  severity: ReplayArbitrationSeverity,
  disputeResolution: ReplayArbitrationDisputeResolution,
): string {
  if (disputeResolution.deadlocked) return "validator_deadlock_requires_manual_adjudication";
  switch (outcome) {
    case "accept_replay":
      return "consensus_accepts_replay_without_escalation";
    case "reject_replay":
      return `critical_escalation:${severity.dominant_escalation}`;
    case "quarantine_replay":
      return `mutable_replay_surface:${severity.dominant_escalation}`;
    case "require_manual_review":
      return disputeResolution.resolution_model;
    case "recovery_recommended":
      return `recoverable_divergence:${severity.dominant_escalation}`;
  }
}

function recoveryReason(
  recommendation: ReplayArbitrationRecoveryRecommendation,
  severity: ReplayArbitrationSeverity,
): string {
  switch (recommendation) {
    case "none":
      return "no_recovery_required";
    case "replay_from_parent_lineage":
      return `timeline_replay_recovery:${severity.band}`;
    case "rebuild_snapshot":
      return `snapshot_rebuild_recovery:${severity.band}`;
    case "reconcile_settlement":
      return `settlement_reconciliation_recovery:${severity.band}`;
    case "quarantine_and_revalidate":
      return `provenance_revalidation_recovery:${severity.band}`;
    case "manual_validator_review":
      return `validator_review_recovery:${severity.band}`;
  }
}

function normalizeConsensusCategories(
  categories: readonly ReplayConsensusDivergenceCategory[],
): readonly ReplayConsensusDivergenceCategory[] {
  const normalized = Array.from(new Set(categories.length === 0 ? ["none" as const] : categories))
    .sort((left, right) => left.localeCompare(right));
  return deepFreeze(normalized);
}

function severityBand(score: number): ReplayArbitrationSeverity["band"] {
  if (score <= 0) return "none";
  if (score < 35) return "low";
  if (score < 60) return "medium";
  if (score < 80) return "high";
  return "critical";
}

function roundArbitrationNumber(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function computeReplayArbitrationHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableReplayArbitrationStringify(value))
    .digest("hex");
}

function stableReplayArbitrationStringify(value: unknown): string {
  return JSON.stringify(sortReplayArbitrationKeys(value));
}

function sortReplayArbitrationKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortReplayArbitrationKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortReplayArbitrationKeys((value as Record<string, unknown>)[key]);
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
