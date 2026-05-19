import {
  buildReplayConsensusResult,
} from "../pipeline/replay-consensus";
import type {
  ReplayConsensusInput,
} from "../pipeline/replay-consensus-contract";

const GENERATED_AT = "2026-05-19T13:00:00.000Z";

const input: ReplayConsensusInput = {
  generated_at: GENERATED_AT,
  replay_hash: "consensus-replay-current",
  compared_replay_hash: "consensus-replay-parent",
  quorum_threshold: 0.75,
  approval_threshold: 0.6,
  validators: [
    {
      validator_id: "validator-snapshot",
      validator_type: "snapshot_validator",
      weight: 1,
      base_confidence: 91,
      vote: "diverge",
      divergence_categories: ["snapshot"],
      lineage_reference: {
        replay_hash: "consensus-replay-current",
        parent_replay_hash: "consensus-replay-parent",
        lineage_hash: "lineage-snapshot",
        generated_at: GENERATED_AT,
      },
    },
    {
      validator_id: "validator-integrity",
      validator_type: "integrity_validator",
      weight: 2,
      base_confidence: 94,
      vote: "diverge",
      divergence_categories: ["integrity", "timeline"],
      lineage_reference: {
        replay_hash: "consensus-replay-current",
        parent_replay_hash: "consensus-replay-parent",
        lineage_hash: "lineage-integrity",
        generated_at: GENERATED_AT,
      },
    },
    {
      validator_id: "validator-settlement",
      validator_type: "settlement_validator",
      weight: 1.5,
      base_confidence: 88,
      vote: "approve",
      divergence_categories: [],
      lineage_reference: {
        replay_hash: "consensus-replay-current",
        parent_replay_hash: "consensus-replay-parent",
        lineage_hash: "lineage-settlement",
        generated_at: GENERATED_AT,
      },
    },
    {
      validator_id: "validator-provenance",
      validator_type: "provenance_validator",
      weight: 0.5,
      base_confidence: 76,
      vote: "abstain",
      divergence_categories: ["provenance"],
      lineage_reference: {
        replay_hash: "consensus-replay-current",
        parent_replay_hash: "consensus-replay-parent",
        lineage_hash: "lineage-provenance",
        generated_at: GENERATED_AT,
      },
    },
  ],
};

const result = buildReplayConsensusResult(input);
const resultAgain = buildReplayConsensusResult({
  ...input,
  validators: [...input.validators].reverse(),
});

assertEqual(result.generated_at, GENERATED_AT, "generated_at mismatch");
assertEqual(result.consensus_hash, resultAgain.consensus_hash, "consensus hash must be stable across validator ordering");
assertEqual(result.summary.summary_hash, resultAgain.summary.summary_hash, "summary hash must be stable");
assertEqual(result.validators.map((validator) => validator.validator_id).join(","), "validator-integrity,validator-provenance,validator-settlement,validator-snapshot", "validators must be sorted deterministically");

assertEqual(result.vote_aggregation.total_weight, 5, "total validator weight mismatch");
assertEqual(result.vote_aggregation.participating_weight, 4.5, "participating weight mismatch");
assertEqual(result.vote_aggregation.approve_weight, 1.5, "approve weight mismatch");
assertEqual(result.vote_aggregation.diverge_weight, 3, "diverge weight mismatch");
assertEqual(result.vote_aggregation.abstain_weight, 0.5, "abstain weight mismatch");
assertEqual(result.vote_aggregation.quorum_ratio, 0.9, "quorum ratio mismatch");
assertEqual(result.vote_aggregation.quorum_met, true, "quorum should be met");
assertEqual(result.summary.consensus_vote, "diverge", "consensus vote mismatch");

assertEqual(result.divergence.divergence_detected, true, "divergence should be detected");
assertEqual(result.divergence.categories.join(","), "integrity,snapshot,timeline", "divergence category ordering mismatch");
assertEqual(result.divergence.category_weights.integrity, 2, "integrity category weight mismatch");
assertEqual(result.divergence.category_weights.timeline, 2, "timeline category weight mismatch");
assertEqual(result.divergence.category_weights.snapshot, 1, "snapshot category weight mismatch");
assertEqual(result.divergence.dominant_category, "integrity", "dominant divergence category mismatch");

const integrityValidator = assertExists(
  result.validators.find((validator) => validator.validator_id === "validator-integrity"),
  "integrity validator missing",
);
assertEqual(integrityValidator.propagated_confidence, 88, "validator confidence propagation mismatch");
assertEqual(integrityValidator.weighted_confidence, 176, "weighted confidence mismatch");
assertEqual(integrityValidator.lineage_reference.lineage_hash, "lineage-integrity", "validator lineage reference mismatch");

const provenanceValidator = assertExists(
  result.validators.find((validator) => validator.validator_id === "validator-provenance"),
  "provenance validator missing",
);
assertEqual(provenanceValidator.divergence_categories.join(","), "none", "abstain divergence categories should normalize to none");

assertEqual(result.arbitration.recommendation, "reject_replay", "arbitration recommendation mismatch");
assertEqual(result.arbitration.reason, "critical_divergence:integrity", "arbitration reason mismatch");
assertEqual(result.summary.arbitration_recommendation, "reject_replay", "summary arbitration recommendation mismatch");

const lowQuorum = buildReplayConsensusResult({
  ...input,
  quorum_threshold: 0.95,
});
assertEqual(lowQuorum.vote_aggregation.quorum_met, false, "high quorum threshold should fail");
assertEqual(lowQuorum.summary.consensus_vote, "abstain", "failed quorum should abstain consensus");
assertEqual(lowQuorum.arbitration.recommendation, "insufficient_quorum", "failed quorum arbitration mismatch");

assertEqual(Object.isFrozen(result), true, "consensus result must be immutable");
assertEqual(Object.isFrozen(result.validators), true, "validator results must be immutable");
assertEqual(Object.isFrozen(result.divergence.category_weights), true, "category weights must be immutable");
assertEqual(Object.isFrozen(result.summary), true, "summary must be immutable");

console.log("Replay consensus validation passed.");
console.log(JSON.stringify({
  consensus_hash: result.consensus_hash,
  summary_hash: result.summary.summary_hash,
  aggregation_hash: result.vote_aggregation.aggregation_hash,
  divergence_hash: result.divergence.divergence_hash,
  arbitration_hash: result.arbitration.arbitration_hash,
  quorum: {
    quorum_met: result.vote_aggregation.quorum_met,
    quorum_ratio: result.vote_aggregation.quorum_ratio,
    low_quorum_met: lowQuorum.vote_aggregation.quorum_met,
  },
  divergence: {
    categories: result.divergence.categories,
    dominant_category: result.divergence.dominant_category,
    category_weights: result.divergence.category_weights,
  },
  arbitration: result.arbitration,
  immutable_outputs: {
    result: Object.isFrozen(result),
    validators: Object.isFrozen(result.validators),
    category_weights: Object.isFrozen(result.divergence.category_weights),
    summary: Object.isFrozen(result.summary),
  },
}, null, 2));

function assertExists<T>(value: T | null | undefined, message: string): T {
  if (value == null) {
    throw new Error(message);
  }
  return value;
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}
