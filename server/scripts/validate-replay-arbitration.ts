import {
  buildReplayArbitrationResult,
} from "../pipeline/replay-arbitration";
import {
  buildReplayConsensusResult,
} from "../pipeline/replay-consensus";
import type {
  ReplayArbitrationEscalationCategory,
  ReplayArbitrationOutcome,
  ReplayArbitrationRecoveryRecommendation,
} from "../pipeline/replay-arbitration-contract";
import type {
  ReplayConsensusDivergenceCategory,
  ReplayConsensusInput,
  ReplayConsensusVote,
} from "../pipeline/replay-consensus-contract";

const GENERATED_AT = "2026-05-19T14:00:00.000Z";

const acceptConsensus = buildReplayConsensusResult(consensusFixture({
  replayHash: "arbitration-accept",
  validators: [
    validator("accept-a", "snapshot_validator", 1, 92, "approve", []),
    validator("accept-b", "integrity_validator", 1, 95, "approve", []),
    validator("accept-c", "settlement_validator", 1, 90, "approve", []),
  ],
}));

const integrityConsensus = buildReplayConsensusResult(consensusFixture({
  replayHash: "arbitration-integrity",
  validators: [
    validator("integrity-a", "integrity_validator", 2, 96, "diverge", ["integrity"]),
    validator("integrity-b", "timeline_validator", 1, 88, "approve", []),
  ],
}));

const snapshotConsensus = buildReplayConsensusResult(consensusFixture({
  replayHash: "arbitration-snapshot",
  validators: [
    validator("snapshot-a", "snapshot_validator", 2, 91, "diverge", ["snapshot"]),
    validator("snapshot-b", "provenance_validator", 1, 86, "approve", []),
  ],
}));

const timelineConsensus = buildReplayConsensusResult(consensusFixture({
  replayHash: "arbitration-timeline",
  validators: [
    validator("timeline-a", "timeline_validator", 1.5, 89, "diverge", ["timeline"]),
    validator("timeline-b", "settlement_validator", 1, 83, "approve", []),
  ],
}));

const provenanceConsensus = buildReplayConsensusResult(consensusFixture({
  replayHash: "arbitration-provenance",
  validators: [
    validator("provenance-a", "provenance_validator", 1.5, 87, "diverge", ["provenance", "signal"]),
    validator("provenance-b", "snapshot_validator", 1, 84, "approve", []),
  ],
}));

const deadlockConsensus = buildReplayConsensusResult(consensusFixture({
  replayHash: "arbitration-deadlock",
  validators: [
    validator("deadlock-a", "integrity_validator", 1, 92, "approve", []),
    validator("deadlock-b", "timeline_validator", 1, 92, "diverge", ["timeline"]),
  ],
}));

const lowQuorumConsensus = buildReplayConsensusResult({
  ...consensusFixture({
    replayHash: "arbitration-low-quorum",
    quorumThreshold: 0.9,
    validators: [
      validator("low-quorum-a", "snapshot_validator", 1, 81, "approve", []),
      validator("low-quorum-b", "integrity_validator", 3, 70, "abstain", []),
    ],
  }),
});

const accept = buildReplayArbitrationResult({
  generated_at: GENERATED_AT,
  consensus: acceptConsensus,
});
const integrity = buildReplayArbitrationResult({
  generated_at: GENERATED_AT,
  consensus: integrityConsensus,
  governance_mode: "autonomous_ready",
});
const snapshot = buildReplayArbitrationResult({
  generated_at: GENERATED_AT,
  consensus: snapshotConsensus,
});
const timeline = buildReplayArbitrationResult({
  generated_at: GENERATED_AT,
  consensus: timelineConsensus,
});
const provenance = buildReplayArbitrationResult({
  generated_at: GENERATED_AT,
  consensus: provenanceConsensus,
});
const deadlock = buildReplayArbitrationResult({
  generated_at: GENERATED_AT,
  consensus: deadlockConsensus,
});
const lowQuorum = buildReplayArbitrationResult({
  generated_at: GENERATED_AT,
  consensus: lowQuorumConsensus,
});
const integrityAgain = buildReplayArbitrationResult({
  generated_at: GENERATED_AT,
  governance_mode: "autonomous_ready",
  consensus: buildReplayConsensusResult({
    ...consensusFixture({
      replayHash: "arbitration-integrity",
      validators: [
        validator("integrity-b", "timeline_validator", 1, 88, "approve", []),
        validator("integrity-a", "integrity_validator", 2, 96, "diverge", ["integrity"]),
      ],
    }),
  }),
});

assertEqual(accept.adjudication.outcome, "accept_replay", "accept outcome mismatch");
assertEqual(accept.severity.score, 0, "accepted replay severity should be zero");
assertEqual(accept.recovery.recommendation, "none", "accepted replay should not recommend recovery");

assertOutcome(integrity, "reject_replay", "integrity rejection");
assertEscalation(integrity, "integrity_failure", "integrity escalation");
assertEqual(integrity.severity.band, "critical", "integrity severity should be critical");
assertEqual(integrity.recovery.recommendation, "none", "rejected replay should not recommend automated recovery");
assertEqual(integrity.recovery.autonomous_governance_ready, true, "autonomous governance readiness mismatch");

assertOutcome(snapshot, "quarantine_replay", "snapshot quarantine");
assertEscalation(snapshot, "snapshot_corruption", "snapshot escalation");
assertEqual(snapshot.recovery.recommendation, "rebuild_snapshot", "snapshot recovery mismatch");

assertOutcome(timeline, "recovery_recommended", "timeline recovery outcome");
assertEscalation(timeline, "timeline_divergence", "timeline escalation");
assertEqual(timeline.recovery.recommendation, "replay_from_parent_lineage", "timeline recovery mismatch");
assertEqual(timeline.recovery.requires_lineage_replay, true, "timeline recovery should require lineage replay");

assertOutcome(provenance, "recovery_recommended", "provenance recovery outcome");
assertEscalation(provenance, "provenance_divergence", "provenance escalation");
assertEqual(provenance.recovery.recommendation, "quarantine_and_revalidate", "provenance recovery mismatch");

assertOutcome(deadlock, "require_manual_review", "deadlock review outcome");
assertEscalation(deadlock, "validator_deadlock", "deadlock escalation");
assertEqual(deadlock.dispute_resolution.deadlocked, true, "deadlock must be detected");
assertEqual(deadlock.dispute_resolution.resolution_model, "equal_weight_validator_deadlock", "deadlock model mismatch");
assertEqual(deadlock.recovery.recommendation, "manual_validator_review", "deadlock recovery mismatch");

assertOutcome(lowQuorum, "require_manual_review", "low quorum review outcome");
assertEqual(lowQuorum.dispute_resolution.resolution_model, "insufficient_quorum_adjudication", "low quorum model mismatch");

assertEqual(integrity.deterministic_hash, integrityAgain.deterministic_hash, "arbitration hash must be stable across validator ordering");
assertEqual(integrity.summary.summary_hash, integrityAgain.summary.summary_hash, "summary hash must be stable");
assertEqual(integrity.consensus_reference.consensus_hash, integrityConsensus.consensus_hash, "consensus reference hash mismatch");
assertEqual(integrity.lineage_references.length, integrityConsensus.validators.length, "lineage reference count mismatch");
assertEqual(integrity.disputes.map((dispute) => dispute.vote).join(","), "approve,abstain,diverge", "dispute ordering mismatch");
assertEqual(integrity.summary.lineage_reference_hashes.length, integrity.lineage_references.length, "summary lineage hashes mismatch");
assertEqual(typeof integrity.adjudication.adjudication_hash, "string", "adjudication hash missing");
assertEqual(typeof integrity.severity.severity_hash, "string", "severity hash missing");
assertEqual(typeof integrity.recovery.recovery_hash, "string", "recovery hash missing");

assertEqual(Object.isFrozen(integrity), true, "arbitration result must be immutable");
assertEqual(Object.isFrozen(integrity.disputes), true, "dispute output must be immutable");
assertEqual(Object.isFrozen(integrity.severity.category_scores), true, "severity category scores must be immutable");
assertEqual(Object.isFrozen(integrity.lineage_references), true, "lineage references must be immutable");
assertEqual(Object.isFrozen(integrity.summary), true, "summary must be immutable");

console.log("Replay arbitration validation passed.");
console.log(JSON.stringify({
  deterministic_hashes: {
    accept: accept.deterministic_hash,
    integrity: integrity.deterministic_hash,
    snapshot: snapshot.deterministic_hash,
    timeline: timeline.deterministic_hash,
    provenance: provenance.deterministic_hash,
    deadlock: deadlock.deterministic_hash,
    low_quorum: lowQuorum.deterministic_hash,
  },
  outcomes: {
    accept: accept.adjudication.outcome,
    integrity: integrity.adjudication.outcome,
    snapshot: snapshot.adjudication.outcome,
    timeline: timeline.adjudication.outcome,
    provenance: provenance.adjudication.outcome,
    deadlock: deadlock.adjudication.outcome,
    low_quorum: lowQuorum.adjudication.outcome,
  },
  escalation_categories: {
    integrity: integrity.adjudication.escalation_categories,
    snapshot: snapshot.adjudication.escalation_categories,
    timeline: timeline.adjudication.escalation_categories,
    provenance: provenance.adjudication.escalation_categories,
    deadlock: deadlock.adjudication.escalation_categories,
  },
  severity: {
    integrity: integrity.severity,
    snapshot: snapshot.severity,
    timeline: timeline.severity,
  },
  recovery_recommendations: {
    snapshot: snapshot.recovery,
    timeline: timeline.recovery,
    provenance: provenance.recovery,
    deadlock: deadlock.recovery,
  },
  immutable_outputs: {
    result: Object.isFrozen(integrity),
    disputes: Object.isFrozen(integrity.disputes),
    category_scores: Object.isFrozen(integrity.severity.category_scores),
    lineage_references: Object.isFrozen(integrity.lineage_references),
    summary: Object.isFrozen(integrity.summary),
  },
}, null, 2));

function consensusFixture(input: {
  readonly replayHash: string;
  readonly quorumThreshold?: number;
  readonly validators: ReplayConsensusInput["validators"];
}): ReplayConsensusInput {
  return {
    generated_at: GENERATED_AT,
    replay_hash: input.replayHash,
    compared_replay_hash: `${input.replayHash}-parent`,
    quorum_threshold: input.quorumThreshold ?? 0.5,
    approval_threshold: 0.5,
    validators: input.validators,
  };
}

function validator(
  validatorId: string,
  validatorType: string,
  weight: number,
  baseConfidence: number,
  vote: ReplayConsensusVote,
  categories: readonly ReplayConsensusDivergenceCategory[],
): ReplayConsensusInput["validators"][number] {
  const replayHash = validatorId.split("-").slice(0, -1).join("-") || validatorId;

  return {
    validator_id: validatorId,
    validator_type: validatorType,
    weight,
    base_confidence: baseConfidence,
    vote,
    divergence_categories: categories,
    lineage_reference: {
      replay_hash: replayHash,
      parent_replay_hash: `${replayHash}-parent`,
      lineage_hash: `lineage-${validatorId}`,
      generated_at: GENERATED_AT,
    },
  };
}

function assertOutcome(
  result: { readonly adjudication: { readonly outcome: ReplayArbitrationOutcome } },
  expected: ReplayArbitrationOutcome,
  message: string,
): void {
  assertEqual(result.adjudication.outcome, expected, `${message} outcome mismatch`);
}

function assertEscalation(
  result: { readonly adjudication: { readonly escalation_categories: readonly ReplayArbitrationEscalationCategory[] } },
  expected: ReplayArbitrationEscalationCategory,
  message: string,
): void {
  if (!result.adjudication.escalation_categories.includes(expected)) {
    throw new Error(`${message}. Expected escalation ${expected}, got ${result.adjudication.escalation_categories.join(",")}.`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}
