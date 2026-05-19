import crypto from "node:crypto";

import type {
  ReplayArbitrationEscalationCategory,
  ReplayArbitrationResult,
} from "./replay-arbitration-contract";
import type {
  ReplayRecoveryAction,
  ReplayRecoveryActionPlan,
  ReplayRecoveryArbitrationReference,
  ReplayRecoveryBranchRestorationPlan,
  ReplayRecoveryCheckpointPlan,
  ReplayRecoveryConfidenceScore,
  ReplayRecoveryCoordinationInput,
  ReplayRecoveryCoordinationMode,
  ReplayRecoveryCoordinationResult,
  ReplayRecoveryLineageReference,
  ReplayRecoveryPhase,
  ReplayRecoveryPhasePlan,
  ReplayRecoveryQuarantineEvaluation,
  ReplayRecoveryRetryPlan,
  ReplayRecoveryState,
  ReplayRecoverySummary,
} from "./replay-recovery-coordination-contract";

export const REPLAY_RECOVERY_PHASES: readonly ReplayRecoveryPhase[] = [
  "arbitration_intake",
  "checkpoint_coordination",
  "branch_restoration",
  "retry_orchestration",
  "quarantine_evaluation",
  "recovery_adjudication",
];

export function buildReplayRecoveryCoordinationResult(
  input: ReplayRecoveryCoordinationInput,
): ReplayRecoveryCoordinationResult {
  const coordinationMode = input.coordination_mode ?? "scaffold";
  const maxRetryAttempts = input.max_retry_attempts ?? 2;
  const arbitrationReference = buildArbitrationReference(input.arbitration);
  const actions = buildActionPlans(input.arbitration);
  const checkpoint = buildCheckpointPlan(input.arbitration, actions);
  const lineage = buildLineageReferences(input.arbitration);
  const branchRestoration = buildBranchRestorationPlan(input.arbitration, actions, lineage);
  const retry = buildRetryPlan(actions, maxRetryAttempts);
  const quarantine = buildQuarantineEvaluation(input.arbitration, actions, branchRestoration);
  const confidence = buildConfidenceScore(input.arbitration, actions, quarantine, retry);
  const phases = buildPhasePlans(actions, confidence);
  const summary = buildSummary({
    generated_at: input.generated_at,
    arbitration_reference: arbitrationReference,
    actions,
    checkpoint,
    branch_restoration: branchRestoration,
    retry,
    quarantine,
    lineage,
    confidence,
  });
  const payload = {
    generated_at: input.generated_at,
    coordination_mode: coordinationMode,
    arbitration_reference: arbitrationReference,
    phases,
    actions,
    checkpoint,
    branch_restoration: branchRestoration,
    retry,
    quarantine,
    lineage,
    confidence,
    summary,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: computeReplayRecoveryCoordinationHash(payload),
  });
}

export function computeReplayRecoveryCoordinationDeterministicHash(value: unknown): string {
  return computeReplayRecoveryCoordinationHash(value);
}

function buildArbitrationReference(
  arbitration: ReplayArbitrationResult,
): ReplayRecoveryArbitrationReference {
  const payload = {
    replay_hash: arbitration.consensus_reference.replay_hash,
    compared_replay_hash: arbitration.consensus_reference.compared_replay_hash,
    arbitration_hash: arbitration.deterministic_hash,
    arbitration_outcome: arbitration.adjudication.outcome,
    arbitration_confidence: arbitration.adjudication.confidence,
    recovery_recommendation: arbitration.recovery.recommendation,
  };

  return deepFreeze({
    ...payload,
    reference_hash: computeReplayRecoveryCoordinationHash(payload),
  });
}

function buildActionPlans(
  arbitration: ReplayArbitrationResult,
): readonly ReplayRecoveryActionPlan[] {
  const actionReasons = resolveActions(arbitration);

  return deepFreeze(actionReasons.map((actionReason, index) => {
    const payload = {
      action: actionReason.action,
      phase: phaseForAction(actionReason.action),
      state: stateForAction(actionReason.action),
      reason: actionReason.reason,
      deterministic_order: index + 1,
    };
    const actionHash = computeReplayRecoveryCoordinationHash(payload);

    return {
      action_id: `replay-recovery-action:${actionHash}`,
      ...payload,
      action_hash: actionHash,
    };
  }));
}

function resolveActions(
  arbitration: ReplayArbitrationResult,
): readonly { readonly action: ReplayRecoveryAction; readonly reason: string }[] {
  const outcome = arbitration.adjudication.outcome;
  const categories = arbitration.adjudication.escalation_categories;
  const recommendation = arbitration.recovery.recommendation;
  const actions: { action: ReplayRecoveryAction; reason: string }[] = [];

  if (outcome === "accept_replay") {
    actions.push({
      action: "promote_recovered_branch",
      reason: "accepted_replay_can_be_promoted",
    });
    return actions;
  }

  if (categories.includes("integrity_failure")) {
    actions.push({
      action: "rollback_checkpoint",
      reason: "integrity_failure_requires_checkpoint_rollback",
    });
    actions.push({
      action: "quarantine_branch",
      reason: "integrity_failure_requires_branch_quarantine",
    });
    return actions;
  }

  if (categories.includes("snapshot_corruption") || recommendation === "rebuild_snapshot") {
    actions.push({
      action: "rebuild_snapshot",
      reason: "snapshot_corruption_requires_rebuild",
    });
    actions.push({
      action: "quarantine_branch",
      reason: "rebuilt_snapshot_requires_quarantine_evaluation",
    });
  }

  if (categories.includes("timeline_divergence") || recommendation === "replay_from_parent_lineage") {
    actions.push({
      action: "rollback_checkpoint",
      reason: "timeline_divergence_requires_parent_checkpoint",
    });
    actions.push({
      action: "reconstruct_timeline",
      reason: "timeline_divergence_requires_reconstruction",
    });
  }

  if (categories.includes("provenance_divergence") || recommendation === "quarantine_and_revalidate") {
    actions.push({
      action: "quarantine_branch",
      reason: "provenance_divergence_requires_revalidation_quarantine",
    });
  }

  if (outcome === "recovery_recommended" || recommendation === "quarantine_and_revalidate") {
    actions.push({
      action: "retry_replay",
      reason: "recoverable_replay_requires_retry_orchestration",
    });
  }

  if (outcome === "require_manual_review" || categories.includes("validator_deadlock")) {
    actions.push({
      action: "manual_reconciliation",
      reason: "arbitration_requires_manual_reconciliation",
    });
  }

  if (actions.length === 0 || shouldPromoteRecoveredBranch(arbitration, actions.map((action) => action.action))) {
    actions.push({
      action: "promote_recovered_branch",
      reason: "recovery_plan_can_promote_recovered_branch",
    });
  }

  return dedupeActions(actions);
}

function buildCheckpointPlan(
  arbitration: ReplayArbitrationResult,
  actions: readonly ReplayRecoveryActionPlan[],
): ReplayRecoveryCheckpointPlan {
  const rollbackAction = actions.find((action) => action.action === "rollback_checkpoint");
  const payload = {
    checkpoint_id: `replay-checkpoint:${arbitration.consensus_reference.compared_replay_hash ?? arbitration.consensus_reference.replay_hash}`,
    source_replay_hash: arbitration.consensus_reference.replay_hash,
    parent_replay_hash: arbitration.consensus_reference.compared_replay_hash,
    rollback_required: Boolean(rollbackAction),
    rollback_action_id: rollbackAction?.action_id ?? null,
  };

  return deepFreeze({
    ...payload,
    checkpoint_hash: computeReplayRecoveryCoordinationHash(payload),
  });
}

function buildBranchRestorationPlan(
  arbitration: ReplayArbitrationResult,
  actions: readonly ReplayRecoveryActionPlan[],
  lineage: readonly ReplayRecoveryLineageReference[],
): ReplayRecoveryBranchRestorationPlan {
  const restorationAction = chooseRestorationAction(actions);
  const lineageContinuityHashes = lineage.map((reference) => reference.recovery_lineage_hash);
  const payload = {
    source_branch_hash: arbitration.consensus_reference.replay_hash,
    recovered_branch_hash: computeReplayRecoveryCoordinationHash({
      replay_hash: arbitration.consensus_reference.replay_hash,
      arbitration_hash: arbitration.deterministic_hash,
      restoration_action: restorationAction,
      lineage_continuity_hashes: lineageContinuityHashes,
    }),
    restoration_action: restorationAction,
    promotion_ready: actions.some((action) => action.action === "promote_recovered_branch"),
    lineage_continuity_hashes: lineageContinuityHashes,
  };

  return deepFreeze({
    ...payload,
    branch_plan_hash: computeReplayRecoveryCoordinationHash(payload),
  });
}

function buildRetryPlan(
  actions: readonly ReplayRecoveryActionPlan[],
  maxRetryAttempts: number,
): ReplayRecoveryRetryPlan {
  const retryAction = actions.find((action) => action.action === "retry_replay");
  const payload = {
    retry_required: Boolean(retryAction),
    max_attempts: maxRetryAttempts,
    scheduled_attempts: retryAction ? Math.max(1, maxRetryAttempts) : 0,
    retry_action_id: retryAction?.action_id ?? null,
  };

  return deepFreeze({
    ...payload,
    retry_hash: computeReplayRecoveryCoordinationHash(payload),
  });
}

function buildQuarantineEvaluation(
  arbitration: ReplayArbitrationResult,
  actions: readonly ReplayRecoveryActionPlan[],
  branchRestoration: ReplayRecoveryBranchRestorationPlan,
): ReplayRecoveryQuarantineEvaluation {
  const quarantineAction = actions.find((action) => action.action === "quarantine_branch");
  const releaseEligible = Boolean(quarantineAction) &&
    branchRestoration.promotion_ready &&
    arbitration.severity.score < 85 &&
    !arbitration.adjudication.escalation_categories.includes("integrity_failure") &&
    !arbitration.adjudication.escalation_categories.includes("validator_deadlock");
  const payload = {
    quarantine_required: Boolean(quarantineAction),
    release_eligible: releaseEligible,
    release_reason: releaseEligible
      ? "recovered_branch_passed_deterministic_release_gates"
      : quarantineAction
        ? "quarantine_hold_until_recovery_adjudication"
        : "quarantine_not_required",
    quarantine_action_id: quarantineAction?.action_id ?? null,
  };

  return deepFreeze({
    ...payload,
    evaluation_hash: computeReplayRecoveryCoordinationHash(payload),
  });
}

function buildLineageReferences(
  arbitration: ReplayArbitrationResult,
): readonly ReplayRecoveryLineageReference[] {
  return deepFreeze(arbitration.lineage_references
    .map((reference) => {
      const payload = {
        replay_hash: reference.replay_hash,
        parent_replay_hash: reference.parent_replay_hash,
        lineage_hash: reference.lineage_hash,
        source_lineage_reference_hash: reference.lineage_reference_hash,
      };

      return {
        ...payload,
        recovery_lineage_hash: computeReplayRecoveryCoordinationHash(payload),
      };
    })
    .sort((left, right) =>
      left.source_lineage_reference_hash.localeCompare(right.source_lineage_reference_hash),
    ));
}

function buildConfidenceScore(
  arbitration: ReplayArbitrationResult,
  actions: readonly ReplayRecoveryActionPlan[],
  quarantine: ReplayRecoveryQuarantineEvaluation,
  retry: ReplayRecoveryRetryPlan,
): ReplayRecoveryConfidenceScore {
  const manualPenalty = actions.some((action) => action.action === "manual_reconciliation") ? 22 : 0;
  const quarantinePenalty = quarantine.quarantine_required && !quarantine.release_eligible ? 12 : 0;
  const retryPenalty = retry.retry_required ? 4 : 0;
  const recoveryBonus = actions.some((action) => action.action === "promote_recovered_branch") ? 10 : 0;
  const score = roundRecoveryNumber(
    Math.max(0, Math.min(100, arbitration.adjudication.confidence - manualPenalty - quarantinePenalty - retryPenalty + recoveryBonus)),
  );
  const payload = {
    score,
    band: confidenceBand(score),
  };

  return deepFreeze({
    ...payload,
    confidence_hash: computeReplayRecoveryCoordinationHash(payload),
  });
}

function buildPhasePlans(
  actions: readonly ReplayRecoveryActionPlan[],
  confidence: ReplayRecoveryConfidenceScore,
): readonly ReplayRecoveryPhasePlan[] {
  return deepFreeze(REPLAY_RECOVERY_PHASES.map((phase) => {
    const phaseActions = actions.filter((action) => action.phase === phase);
    const payload = {
      phase,
      state: stateForPhase(phase, phaseActions),
      action_count: phaseActions.length,
      confidence: confidence.score,
    };

    return {
      ...payload,
      phase_hash: computeReplayRecoveryCoordinationHash(payload),
    };
  }));
}

function buildSummary(input: {
  readonly generated_at: string;
  readonly arbitration_reference: ReplayRecoveryArbitrationReference;
  readonly actions: readonly ReplayRecoveryActionPlan[];
  readonly checkpoint: ReplayRecoveryCheckpointPlan;
  readonly branch_restoration: ReplayRecoveryBranchRestorationPlan;
  readonly retry: ReplayRecoveryRetryPlan;
  readonly quarantine: ReplayRecoveryQuarantineEvaluation;
  readonly lineage: readonly ReplayRecoveryLineageReference[];
  readonly confidence: ReplayRecoveryConfidenceScore;
}): ReplayRecoverySummary {
  const payload = {
    replay_hash: input.arbitration_reference.replay_hash,
    generated_at: input.generated_at,
    state: finalState(input.actions, input.quarantine, input.branch_restoration),
    confidence: input.confidence.score,
    action_count: input.actions.length,
    rollback_required: input.checkpoint.rollback_required,
    retry_required: input.retry.retry_required,
    quarantine_required: input.quarantine.quarantine_required,
    promotion_ready: input.branch_restoration.promotion_ready,
    lineage_continuity_count: input.lineage.length,
  };

  return deepFreeze({
    ...payload,
    summary_hash: computeReplayRecoveryCoordinationHash(payload),
  });
}

function shouldPromoteRecoveredBranch(
  arbitration: ReplayArbitrationResult,
  actions: readonly ReplayRecoveryAction[],
): boolean {
  return !actions.includes("manual_reconciliation") &&
    !actions.includes("rollback_checkpoint") &&
    !arbitration.adjudication.escalation_categories.includes("integrity_failure");
}

function dedupeActions(
  actions: readonly { readonly action: ReplayRecoveryAction; readonly reason: string }[],
): readonly { readonly action: ReplayRecoveryAction; readonly reason: string }[] {
  const seen = new Set<ReplayRecoveryAction>();
  const deduped: { action: ReplayRecoveryAction; reason: string }[] = [];

  for (const action of actions) {
    if (seen.has(action.action)) continue;
    seen.add(action.action);
    deduped.push(action);
  }

  return deduped;
}

function phaseForAction(action: ReplayRecoveryAction): ReplayRecoveryPhase {
  switch (action) {
    case "rollback_checkpoint":
      return "checkpoint_coordination";
    case "rebuild_snapshot":
    case "reconstruct_timeline":
    case "promote_recovered_branch":
      return "branch_restoration";
    case "quarantine_branch":
      return "quarantine_evaluation";
    case "retry_replay":
      return "retry_orchestration";
    case "manual_reconciliation":
      return "recovery_adjudication";
  }
}

function stateForAction(action: ReplayRecoveryAction): ReplayRecoveryState {
  switch (action) {
    case "rollback_checkpoint":
    case "rebuild_snapshot":
    case "reconstruct_timeline":
    case "retry_replay":
      return "recovering";
    case "quarantine_branch":
      return "quarantined";
    case "manual_reconciliation":
      return "reconciled";
    case "promote_recovered_branch":
      return "stabilized";
  }
}

function stateForPhase(
  phase: ReplayRecoveryPhase,
  actions: readonly ReplayRecoveryActionPlan[],
): ReplayRecoveryState {
  if (phase === "arbitration_intake") return "pending";
  if (actions.some((action) => action.state === "quarantined")) return "quarantined";
  if (actions.some((action) => action.state === "reconciled")) return "reconciled";
  if (actions.some((action) => action.state === "recovering")) return "recovering";
  if (actions.some((action) => action.state === "stabilized")) return "stabilized";
  return "pending";
}

function chooseRestorationAction(
  actions: readonly ReplayRecoveryActionPlan[],
): ReplayRecoveryAction {
  for (const action of ["reconstruct_timeline", "rebuild_snapshot", "promote_recovered_branch", "manual_reconciliation"] as const) {
    if (actions.some((plan) => plan.action === action)) return action;
  }
  return "quarantine_branch";
}

function finalState(
  actions: readonly ReplayRecoveryActionPlan[],
  quarantine: ReplayRecoveryQuarantineEvaluation,
  branchRestoration: ReplayRecoveryBranchRestorationPlan,
): ReplayRecoveryState {
  if (actions.some((action) => action.action === "manual_reconciliation")) return "reconciled";
  if (actions.some((action) => action.action === "rollback_checkpoint" && action.reason.includes("integrity"))) return "failed";
  if (quarantine.quarantine_required && !quarantine.release_eligible) return "quarantined";
  if (branchRestoration.promotion_ready) return "stabilized";
  if (actions.some((action) => action.state === "recovering")) return "recovering";
  return "pending";
}

function confidenceBand(score: number): ReplayRecoveryConfidenceScore["band"] {
  if (score >= 85) return "stabilized";
  if (score >= 65) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function roundRecoveryNumber(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function computeReplayRecoveryCoordinationHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableReplayRecoveryCoordinationStringify(value))
    .digest("hex");
}

function stableReplayRecoveryCoordinationStringify(value: unknown): string {
  return JSON.stringify(sortReplayRecoveryCoordinationKeys(value));
}

function sortReplayRecoveryCoordinationKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortReplayRecoveryCoordinationKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortReplayRecoveryCoordinationKeys((value as Record<string, unknown>)[key]);
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
