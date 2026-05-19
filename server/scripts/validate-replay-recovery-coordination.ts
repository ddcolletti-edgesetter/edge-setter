import {
  buildReplayArbitrationResult,
} from "../pipeline/replay-arbitration";
import {
  buildReplayConsensusResult,
} from "../pipeline/replay-consensus";
import {
  buildReplayRecoveryCoordinationResult,
} from "../pipeline/replay-recovery-coordination";
import type {
  ReplayConsensusDivergenceCategory,
  ReplayConsensusInput,
  ReplayConsensusVote,
} from "../pipeline/replay-consensus-contract";
import type {
  ReplayRecoveryAction,
  ReplayRecoveryState,
} from "../pipeline/replay-recovery-coordination-contract";

const GENERATED_AT = "2026-05-19T15:00:00.000Z";

const accept = buildRecovery("recovery-accept", [
  validator("accept-a", "snapshot_validator", 1, 94, "approve", []),
  validator("accept-b", "integrity_validator", 1, 95, "approve", []),
  validator("accept-c", "settlement_validator", 1, 91, "approve", []),
]);

const integrity = buildRecovery("recovery-integrity", [
  validator("integrity-a", "integrity_validator", 2, 96, "diverge", ["integrity"]),
  validator("integrity-b", "timeline_validator", 1, 88, "approve", []),
], "autonomous_self_healing_ready");

const snapshot = buildRecovery("recovery-snapshot", [
  validator("snapshot-a", "snapshot_validator", 2, 91, "diverge", ["snapshot"]),
  validator("snapshot-b", "provenance_validator", 1, 86, "approve", []),
]);

const timeline = buildRecovery("recovery-timeline", [
  validator("timeline-a", "timeline_validator", 1.5, 89, "diverge", ["timeline"]),
  validator("timeline-b", "settlement_validator", 1, 83, "approve", []),
]);

const provenance = buildRecovery("recovery-provenance", [
  validator("provenance-a", "provenance_validator", 1.5, 87, "diverge", ["provenance", "signal"]),
  validator("provenance-b", "snapshot_validator", 1, 84, "approve", []),
]);

const deadlock = buildRecovery("recovery-deadlock", [
  validator("deadlock-a", "integrity_validator", 1, 92, "approve", []),
  validator("deadlock-b", "timeline_validator", 1, 92, "diverge", ["timeline"]),
]);

const snapshotAgain = buildRecovery("recovery-snapshot", [
  validator("snapshot-b", "provenance_validator", 1, 86, "approve", []),
  validator("snapshot-a", "snapshot_validator", 2, 91, "diverge", ["snapshot"]),
]);

assertAction(accept, "promote_recovered_branch", "accepted replay promotion action");
assertEqual(accept.summary.state, "stabilized", "accepted replay state mismatch");
assertEqual(accept.branch_restoration.promotion_ready, true, "accepted replay should be promotion ready");

assertAction(integrity, "rollback_checkpoint", "integrity rollback action");
assertAction(integrity, "quarantine_branch", "integrity quarantine action");
assertEqual(integrity.checkpoint.rollback_required, true, "integrity rollback coordination mismatch");
assertEqual(integrity.summary.state, "failed", "integrity failure state mismatch");
assertEqual(integrity.quarantine.release_eligible, false, "integrity quarantine release should be blocked");
assertEqual(integrity.coordination_mode, "autonomous_self_healing_ready", "coordination mode mismatch");

assertAction(snapshot, "rebuild_snapshot", "snapshot rebuild action");
assertAction(snapshot, "quarantine_branch", "snapshot quarantine action");
assertAction(snapshot, "promote_recovered_branch", "snapshot promotion action");
assertEqual(snapshot.branch_restoration.restoration_action, "rebuild_snapshot", "snapshot branch restoration mismatch");
assertEqual(snapshot.quarantine.quarantine_required, true, "snapshot quarantine should be required");
assertEqual(snapshot.quarantine.release_eligible, true, "snapshot quarantine release should be eligible after rebuild");

assertAction(timeline, "rollback_checkpoint", "timeline rollback action");
assertAction(timeline, "reconstruct_timeline", "timeline reconstruction action");
assertAction(timeline, "retry_replay", "timeline retry action");
assertEqual(timeline.checkpoint.rollback_required, true, "timeline rollback coordination mismatch");
assertEqual(timeline.branch_restoration.restoration_action, "reconstruct_timeline", "timeline branch restoration mismatch");
assertEqual(timeline.retry.retry_required, true, "timeline retry should be required");
assertEqual(timeline.retry.scheduled_attempts, 2, "timeline retry attempts mismatch");

assertAction(provenance, "quarantine_branch", "provenance quarantine action");
assertAction(provenance, "retry_replay", "provenance retry action");
assertEqual(provenance.retry.retry_required, true, "provenance retry should be required");
assertEqual(provenance.quarantine.quarantine_required, true, "provenance quarantine should be required");

assertAction(deadlock, "manual_reconciliation", "deadlock manual reconciliation action");
assertEqual(deadlock.summary.state, "reconciled", "deadlock reconciled state mismatch");

assertEqual(snapshot.deterministic_hash, snapshotAgain.deterministic_hash, "recovery hash must be stable across validator ordering");
assertEqual(snapshot.summary.summary_hash, snapshotAgain.summary.summary_hash, "recovery summary hash must be stable");
assertEqual(snapshot.arbitration_reference.arbitration_hash.length, 64, "arbitration hash reference missing");
assertEqual(snapshot.lineage.length, snapshot.arbitration_reference.replay_hash ? 2 : 0, "lineage continuity count mismatch");
assertEqual(snapshot.summary.lineage_continuity_count, snapshot.lineage.length, "summary lineage continuity mismatch");
assertEqual(snapshot.lineage.every((reference) => reference.recovery_lineage_hash.length === 64), true, "lineage recovery hashes missing");

assertEqual(Object.isFrozen(snapshot), true, "recovery result must be immutable");
assertEqual(Object.isFrozen(snapshot.actions), true, "actions output must be immutable");
assertEqual(Object.isFrozen(snapshot.phases), true, "phases output must be immutable");
assertEqual(Object.isFrozen(snapshot.lineage), true, "lineage output must be immutable");
assertEqual(Object.isFrozen(snapshot.summary), true, "summary output must be immutable");

assertStatePresent(integrity, "failed");
assertStatePresent(snapshot, "quarantined");
assertStatePresent(timeline, "recovering");
assertStatePresent(deadlock, "reconciled");
assertStatePresent(accept, "stabilized");

console.log("Replay recovery coordination validation passed.");
console.log(JSON.stringify({
  deterministic_hashes: {
    accept: accept.deterministic_hash,
    integrity: integrity.deterministic_hash,
    snapshot: snapshot.deterministic_hash,
    timeline: timeline.deterministic_hash,
    provenance: provenance.deterministic_hash,
    deadlock: deadlock.deterministic_hash,
  },
  actions: {
    accept: accept.actions.map((action) => action.action),
    integrity: integrity.actions.map((action) => action.action),
    snapshot: snapshot.actions.map((action) => action.action),
    timeline: timeline.actions.map((action) => action.action),
    provenance: provenance.actions.map((action) => action.action),
    deadlock: deadlock.actions.map((action) => action.action),
  },
  rollback_coordination: {
    integrity: integrity.checkpoint,
    timeline: timeline.checkpoint,
  },
  branch_restoration: {
    snapshot: snapshot.branch_restoration,
    timeline: timeline.branch_restoration,
  },
  quarantine: {
    integrity: integrity.quarantine,
    snapshot: snapshot.quarantine,
    provenance: provenance.quarantine,
  },
  retry: {
    timeline: timeline.retry,
    provenance: provenance.retry,
  },
  lineage_continuity: snapshot.lineage,
  immutable_outputs: {
    result: Object.isFrozen(snapshot),
    actions: Object.isFrozen(snapshot.actions),
    phases: Object.isFrozen(snapshot.phases),
    lineage: Object.isFrozen(snapshot.lineage),
    summary: Object.isFrozen(snapshot.summary),
  },
}, null, 2));

function buildRecovery(
  replayHash: string,
  validators: ReplayConsensusInput["validators"],
  coordinationMode: "scaffold" | "autonomous_self_healing_ready" = "scaffold",
) {
  const arbitration = buildReplayArbitrationResult({
    generated_at: GENERATED_AT,
    governance_mode: coordinationMode === "autonomous_self_healing_ready" ? "autonomous_ready" : "scaffold",
    consensus: buildReplayConsensusResult({
      generated_at: GENERATED_AT,
      replay_hash: replayHash,
      compared_replay_hash: `${replayHash}-parent`,
      quorum_threshold: 0.5,
      approval_threshold: 0.5,
      validators,
    }),
  });

  return buildReplayRecoveryCoordinationResult({
    generated_at: GENERATED_AT,
    arbitration,
    max_retry_attempts: 2,
    coordination_mode: coordinationMode,
  });
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

function assertAction(
  result: { readonly actions: readonly { readonly action: ReplayRecoveryAction }[] },
  expected: ReplayRecoveryAction,
  message: string,
): void {
  if (!result.actions.some((action) => action.action === expected)) {
    throw new Error(`${message}. Expected action ${expected}, got ${result.actions.map((action) => action.action).join(",")}.`);
  }
}

function assertStatePresent(
  result: {
    readonly summary: { readonly state: ReplayRecoveryState };
    readonly actions: readonly { readonly state: ReplayRecoveryState }[];
  },
  expected: ReplayRecoveryState,
): void {
  if (result.summary.state === expected || result.actions.some((action) => action.state === expected)) return;
  throw new Error(`Expected recovery state ${expected} to be present.`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}
