import crypto from "node:crypto";

import type {
  ReplaySelfHealingAction,
  ReplaySelfHealingInput,
  ReplaySelfHealingQuery,
  ReplaySelfHealingState,
  ReplaySelfHealingSnapshot,
  ReplayPredictiveRepairPlan,
  ReplayHealingDecision,
  ReplayAdaptiveRecoveryRoute,
  ReplayStabilizationRecord,
  ReplaySurvivabilityTrend,
  ReplayDegradationRecord,
  ReplayPartitionStabilizationRecord,
  ReplayHealingCheckpointPromotion,
  ReplayHealingLineageReference,
  ReplayHealingEpoch,
  ReplaySelfHealingSnapshotReference,
} from "./replay-self-healing-contract";

const DEFAULT_SURVIVABILITY_THRESHOLD = 0.72;

const SUPPORTED_ACTIONS: readonly ReplaySelfHealingAction[] = [
  "stabilize_branch",
  "reroute_recovery",
  "reconcile_divergence",
  "promote_checkpoint",
  "rebuild_partition",
  "quarantine_instability",
  "rebalance_mesh",
  "freeze_healing_epoch",
];

const SUPPORTED_QUERIES: readonly ReplaySelfHealingQuery[] = [
  "get_healing_history",
  "get_stabilization_history",
  "get_survivability_trends",
  "get_replay_degradation_history",
  "get_adaptive_recovery_history",
  "get_healing_lineage",
  "get_partition_stabilization_history",
];

export function buildReplaySelfHealingSnapshot(
  input: ReplaySelfHealingInput,
): ReplaySelfHealingSnapshot {
  const repairPlans = buildRepairPlans(input);
  const survivabilityTrends = buildSurvivabilityTrends(input);
  const decisions = buildDecisions(input, repairPlans, survivabilityTrends);
  const stabilizationHistory = buildStabilizationHistory(input, decisions);
  const degradationHistory = buildDegradationHistory(input, survivabilityTrends);
  const adaptiveRecovery = buildAdaptiveRecovery(input, decisions);
  const partitionStabilization = buildPartitionStabilization(input);
  const checkpointPromotions = buildCheckpointPromotions(input, decisions);
  const lineage = buildHealingLineage(input);
  const epochs = buildHealingEpochs(input, decisions);
  const snapshots = buildSnapshotReference(input);
  const state = classifyHealingState(decisions, partitionStabilization, degradationHistory);
  const seed = {
    run_id: input.run_id,
    generated_at: input.generated_at,
    state,
    repair_hashes: repairPlans.map((plan) => plan.plan_hash),
    decision_hashes: decisions.map((decision) => decision.deterministic_hash),
    stabilization_hashes: stabilizationHistory.map((record) => record.stabilization_hash),
    survivability_hashes: survivabilityTrends.map((trend) => trend.trend_hash),
    degradation_hashes: degradationHistory.map((record) => record.degradation_hash),
    adaptive_hashes: adaptiveRecovery.map((route) => route.route_hash),
    partition_hashes: partitionStabilization.map((record) => record.partition_hash),
    promotion_hashes: checkpointPromotions.map((promotion) => promotion.promotion_hash),
    lineage_hashes: lineage.map((reference) => reference.reference_hash),
    epoch_hashes: epochs.map((epoch) => epoch.epoch_hash),
    snapshot_reference_hash: snapshots.reference_hash,
  };
  const deterministicHash = computeReplaySelfHealingDeterministicHash(seed);

  return deepFreeze({
    healing_id: `replay-self-healing:${deterministicHash}`,
    run_id: input.run_id,
    generated_at: input.generated_at,
    state,
    repair_plans: repairPlans,
    decisions,
    stabilization_history: stabilizationHistory,
    survivability_trends: survivabilityTrends,
    degradation_history: degradationHistory,
    adaptive_recovery: adaptiveRecovery,
    partition_stabilization: partitionStabilization,
    checkpoint_promotions: checkpointPromotions,
    lineage,
    epochs,
    snapshots,
    supported_actions: SUPPORTED_ACTIONS,
    supported_queries: SUPPORTED_QUERIES,
    deterministic_hash: deterministicHash,
  });
}

export function getHealingHistory(snapshot: ReplaySelfHealingSnapshot): readonly ReplayHealingDecision[] {
  return snapshot.decisions;
}

export function getStabilizationHistory(snapshot: ReplaySelfHealingSnapshot): readonly ReplayStabilizationRecord[] {
  return snapshot.stabilization_history;
}

export function getSurvivabilityTrends(snapshot: ReplaySelfHealingSnapshot): readonly ReplaySurvivabilityTrend[] {
  return snapshot.survivability_trends;
}

export function getReplayDegradationHistory(snapshot: ReplaySelfHealingSnapshot): readonly ReplayDegradationRecord[] {
  return snapshot.degradation_history;
}

export function getAdaptiveRecoveryHistory(snapshot: ReplaySelfHealingSnapshot): readonly ReplayAdaptiveRecoveryRoute[] {
  return snapshot.adaptive_recovery;
}

export function getHealingLineage(snapshot: ReplaySelfHealingSnapshot): readonly ReplayHealingLineageReference[] {
  return snapshot.lineage;
}

export function getPartitionStabilizationHistory(snapshot: ReplaySelfHealingSnapshot): readonly ReplayPartitionStabilizationRecord[] {
  return snapshot.partition_stabilization;
}

export function serializeReplaySelfHealingSnapshot(snapshot: ReplaySelfHealingSnapshot): string {
  return stableSelfHealingStringify(snapshot);
}

export function computeReplaySelfHealingDeterministicHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableSelfHealingStringify(value))
    .digest("hex");
}

function buildRepairPlans(input: ReplaySelfHealingInput): readonly ReplayPredictiveRepairPlan[] {
  const replayHashes = collectReplayHashes(input);
  return deepFreeze(replayHashes.map((replayHash) => {
    const latestDivergence = latestForReplay(input.memory_snapshot.divergence_evolution, replayHash);
    const trend = latestForReplay(input.memory_snapshot.recovery_effectiveness, replayHash);
    const partitioned = input.coordination_mesh.partitions.some((partition) => partition.replay_hash === replayHash);
    const predictedDivergenceScore = roundHealingNumber((latestDivergence?.divergence_score ?? 0) * 0.72 + (partitioned ? 0.28 : 0));
    const action: ReplaySelfHealingAction = partitioned
      ? "rebuild_partition"
      : predictedDivergenceScore >= 0.8
        ? "quarantine_instability"
        : predictedDivergenceScore >= 0.45
          ? "reconcile_divergence"
          : (trend?.effectiveness_score ?? 0) < 0.7
            ? "reroute_recovery"
            : "stabilize_branch";
    const memoryReferenceHashes = [
      ...input.memory_snapshot.replay_evolution.filter((entry) => entry.replay_hash === replayHash).map((entry) => entry.evolution_hash),
      ...input.memory_snapshot.divergence_evolution.filter((entry) => entry.replay_hash === replayHash).map((entry) => entry.divergence_hash),
      ...input.memory_snapshot.recovery_effectiveness.filter((entry) => entry.replay_hash === replayHash).map((entry) => entry.recovery_hash),
    ].sort((left, right) => left.localeCompare(right));
    const seed = {
      replay_hash: replayHash,
      predicted_divergence_score: predictedDivergenceScore,
      recommended_action: action,
      repair_reason: repairReason(action),
      memory_reference_hashes: memoryReferenceHashes,
    };
    const planHash = computeReplaySelfHealingDeterministicHash(seed);

    return {
      plan_id: `replay-healing-plan:${planHash}`,
      ...seed,
      plan_hash: planHash,
    };
  }));
}

function buildSurvivabilityTrends(input: ReplaySelfHealingInput): readonly ReplaySurvivabilityTrend[] {
  return deepFreeze(collectReplayHashes(input).map((replayHash) => {
    const latestDivergence = latestForReplay(input.memory_snapshot.divergence_evolution, replayHash);
    const latestRecovery = latestForReplay(input.memory_snapshot.recovery_effectiveness, replayHash);
    const degradationScore = Math.min(1, latestDivergence?.divergence_score ?? 0);
    const recoveryEffectivenessScore = latestRecovery?.effectiveness_score ?? 0.5;
    const survivabilityScore = roundHealingNumber(Math.max(0, Math.min(1, 1 - (degradationScore * 0.55) + (recoveryEffectivenessScore * 0.35))));
    const trend: ReplaySurvivabilityTrend["trend"] = survivabilityScore >= 0.82
      ? "improving"
      : survivabilityScore >= 0.62
        ? "stable"
        : "declining";
    const seed = {
      replay_hash: replayHash,
      survivability_score: survivabilityScore,
      degradation_score: roundHealingNumber(degradationScore),
      recovery_effectiveness_score: recoveryEffectivenessScore,
      trend,
    };
    const trendHash = computeReplaySelfHealingDeterministicHash(seed);

    return {
      trend_id: `replay-survivability:${trendHash}`,
      ...seed,
      trend_hash: trendHash,
    };
  }));
}

function buildDecisions(
  input: ReplaySelfHealingInput,
  repairPlans: readonly ReplayPredictiveRepairPlan[],
  survivabilityTrends: readonly ReplaySurvivabilityTrend[],
): readonly ReplayHealingDecision[] {
  const threshold = input.survivability_threshold ?? DEFAULT_SURVIVABILITY_THRESHOLD;
  return deepFreeze(repairPlans.map((plan) => {
    const trend = required(survivabilityTrends.find((item) => item.replay_hash === plan.replay_hash), "survivability trend missing");
    const governance = input.governance_snapshot.decisions.find((decision) => decision.replay_hash === plan.replay_hash);
    const state = stateForPlan(plan, trend.survivability_score, threshold);
    const action = trend.survivability_score < threshold && plan.recommended_action === "stabilize_branch"
      ? "rebalance_mesh"
      : plan.recommended_action;
    const seed = {
      replay_hash: plan.replay_hash,
      state,
      action,
      governance_action: governance?.action ?? null,
      survivability_score: trend.survivability_score,
      repair_plan_hash: plan.plan_hash,
    };
    const deterministicHash = computeReplaySelfHealingDeterministicHash(seed);

    return {
      decision_id: `replay-healing-decision:${deterministicHash}`,
      ...seed,
      deterministic_hash: deterministicHash,
    };
  }));
}

function buildStabilizationHistory(
  input: ReplaySelfHealingInput,
  decisions: readonly ReplayHealingDecision[],
): readonly ReplayStabilizationRecord[] {
  return deepFreeze(decisions.map((decision) => {
    const latestEvolution = latestForReplay(input.memory_snapshot.replay_evolution, decision.replay_hash);
    const beforeState = memoryStateToHealingState(latestEvolution?.to_state);
    const afterState = decision.action === "promote_checkpoint" || decision.action === "stabilize_branch"
      ? "recovered"
      : decision.state;
    const seed = {
      replay_hash: decision.replay_hash,
      before_state: beforeState,
      after_state: afterState,
      action: decision.action,
      checkpoint_promoted: decision.action === "promote_checkpoint" || decision.action === "stabilize_branch",
    };
    const stabilizationHash = computeReplaySelfHealingDeterministicHash(seed);

    return {
      stabilization_id: `replay-stabilization:${stabilizationHash}`,
      ...seed,
      stabilization_hash: stabilizationHash,
    };
  }));
}

function buildDegradationHistory(
  input: ReplaySelfHealingInput,
  trends: readonly ReplaySurvivabilityTrend[],
): readonly ReplayDegradationRecord[] {
  return deepFreeze(trends.map((trend) => {
    const latestDivergence = latestForReplay(input.memory_snapshot.divergence_evolution, trend.replay_hash);
    const currentPartitioned = input.coordination_mesh.partitions.some((partition) =>
      partition.replay_hash === trend.replay_hash,
    );
    const seed = {
      replay_hash: trend.replay_hash,
      degradation_score: currentPartitioned ? Math.max(trend.degradation_score, 0.7) : trend.degradation_score,
      degradation_reason: currentPartitioned
        ? "current_mesh_partition_detected"
        : latestDivergence?.divergence_reason ?? "no_divergence_memory",
      detected: currentPartitioned || trend.degradation_score > 0 || trend.survivability_score < DEFAULT_SURVIVABILITY_THRESHOLD,
    };
    const degradationHash = computeReplaySelfHealingDeterministicHash(seed);

    return {
      degradation_id: `replay-degradation:${degradationHash}`,
      ...seed,
      degradation_hash: degradationHash,
    };
  }));
}

function buildAdaptiveRecovery(
  input: ReplaySelfHealingInput,
  decisions: readonly ReplayHealingDecision[],
): readonly ReplayAdaptiveRecoveryRoute[] {
  return deepFreeze(decisions.map((decision) => {
    const session = input.coordination_mesh.sessions.find((item) => item.replay_hash === decision.replay_hash);
    const recovery = input.coordination_mesh.recovery_routes.find((route) => route.replay_hash === decision.replay_hash);
    const adaptivePath = recovery?.recovery_path ?? session?.route.recovery_route_path ?? session?.route.route_path ?? [];
    const seed = {
      replay_hash: decision.replay_hash,
      from_route_hash: session?.route.route_hash ?? null,
      adaptive_path: adaptivePath,
      action: decision.action === "stabilize_branch" ? "reroute_recovery" as const : decision.action,
    };
    const routeHash = computeReplaySelfHealingDeterministicHash(seed);

    return {
      route_id: `replay-adaptive-recovery:${routeHash}`,
      ...seed,
      route_hash: routeHash,
    };
  }));
}

function buildPartitionStabilization(input: ReplaySelfHealingInput): readonly ReplayPartitionStabilizationRecord[] {
  return deepFreeze(collectReplayHashes(input).map((replayHash) => {
    const partitionCount = input.coordination_mesh.partitions.filter((partition) => partition.replay_hash === replayHash).length;
    const seed = {
      replay_hash: replayHash,
      partition_count: partitionCount,
      stabilization_action: partitionCount > 0 ? "rebuild_partition" as const : "stabilize_branch" as const,
      stabilized: partitionCount === 0 || input.coordination_mesh.recovery_routes.some((route) => route.replay_hash === replayHash),
    };
    const partitionHash = computeReplaySelfHealingDeterministicHash(seed);

    return {
      partition_stabilization_id: `replay-partition-stabilization:${partitionHash}`,
      ...seed,
      partition_hash: partitionHash,
    };
  }));
}

function buildCheckpointPromotions(
  input: ReplaySelfHealingInput,
  decisions: readonly ReplayHealingDecision[],
): readonly ReplayHealingCheckpointPromotion[] {
  return deepFreeze(decisions.map((decision) => {
    const checkpoint = input.orchestration_persistence.checkpoints.find((item) => item.replay_hash === decision.replay_hash);
    const promoted = decision.action === "promote_checkpoint" ||
      decision.action === "stabilize_branch" ||
      decision.state === "recovered" ||
      decision.survivability_score >= DEFAULT_SURVIVABILITY_THRESHOLD;
    const seed = {
      replay_hash: decision.replay_hash,
      checkpoint_id: checkpoint?.checkpoint_id ?? `replay-checkpoint:${decision.replay_hash}`,
      promoted,
      promotion_reason: promoted ? "autonomous_checkpoint_promotion_ready" : "checkpoint_held_for_healing",
    };
    const promotionHash = computeReplaySelfHealingDeterministicHash(seed);

    return {
      promotion_id: `replay-checkpoint-promotion:${promotionHash}`,
      ...seed,
      promotion_hash: promotionHash,
    };
  }));
}

function buildHealingLineage(input: ReplaySelfHealingInput): readonly ReplayHealingLineageReference[] {
  const references: ReplayHealingLineageReference[] = [];
  const push = (replayHash: string, sourceHash: string, referenceKind: ReplayHealingLineageReference["reference_kind"]) => {
    const seed = { replay_hash: replayHash, source_hash: sourceHash, reference_kind: referenceKind };
    const referenceHash = computeReplaySelfHealingDeterministicHash(seed);
    references.push({
      reference_id: `replay-healing-lineage:${referenceHash}`,
      ...seed,
      reference_hash: referenceHash,
    });
  };

  for (const entry of input.memory_snapshot.replay_evolution) push(entry.replay_hash, entry.evolution_hash, "memory");
  for (const session of input.coordination_mesh.sessions) push(session.replay_hash, session.session_hash, "coordination_mesh");
  for (const decision of input.governance_snapshot.decisions) push(decision.replay_hash, decision.deterministic_hash, "governance");
  for (const record of input.orchestration_persistence.records) push(record.replay_hash, record.persistence_hash, "orchestration_persistence");
  for (const node of input.lineage_snapshot.nodes) push(node.replay_hash, node.node_hash, "lineage_graph");

  return deepFreeze(references.sort((left, right) =>
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.reference_kind.localeCompare(right.reference_kind) ||
    left.reference_hash.localeCompare(right.reference_hash),
  ));
}

function buildHealingEpochs(
  input: ReplaySelfHealingInput,
  decisions: readonly ReplayHealingDecision[],
): readonly ReplayHealingEpoch[] {
  const seed = {
    replay_hashes: decisions.map((decision) => decision.replay_hash).sort((left, right) => left.localeCompare(right)),
    healing_decision_hashes: decisions.map((decision) => decision.deterministic_hash),
    frozen: true,
    frozen_at: input.generated_at,
  };
  const epochHash = computeReplaySelfHealingDeterministicHash(seed);
  return deepFreeze([{
    epoch_id: `replay-healing-epoch:${epochHash}`,
    ...seed,
    epoch_hash: epochHash,
  }]);
}

function buildSnapshotReference(input: ReplaySelfHealingInput): ReplaySelfHealingSnapshotReference {
  const seed = {
    memory_snapshot_hash: input.memory_snapshot.deterministic_hash,
    coordination_mesh_hash: input.coordination_mesh.deterministic_hash,
    governance_snapshot_hash: input.governance_snapshot.deterministic_hash,
    orchestration_persistence_hash: input.orchestration_persistence.deterministic_hash,
    lineage_graph_hash: input.lineage_snapshot.graph_hash,
  };
  return deepFreeze({
    ...seed,
    reference_hash: computeReplaySelfHealingDeterministicHash(seed),
  });
}

function collectReplayHashes(input: ReplaySelfHealingInput): readonly string[] {
  return Array.from(new Set([
    ...input.memory_snapshot.temporal_indexes.map((index) => index.replay_hash),
    ...input.coordination_mesh.sessions.map((session) => session.replay_hash),
    ...input.governance_snapshot.decisions.map((decision) => decision.replay_hash),
  ])).sort((left, right) => left.localeCompare(right));
}

function classifyHealingState(
  decisions: readonly ReplayHealingDecision[],
  partitions: readonly ReplayPartitionStabilizationRecord[],
  degradations: readonly ReplayDegradationRecord[],
): ReplaySelfHealingState {
  if (partitions.some((partition) => partition.partition_count > 0 && !partition.stabilized)) return "partitioned";
  if (decisions.some((decision) => decision.state === "partitioned")) return "partitioned";
  if (decisions.some((decision) => decision.state === "healing")) return "healing";
  if (degradations.some((record) => record.detected)) return "stabilizing";
  if (decisions.every((decision) => decision.state === "recovered")) return "recovered";
  return "monitoring";
}

function stateForPlan(
  plan: ReplayPredictiveRepairPlan,
  survivabilityScore: number,
  threshold: number,
): ReplaySelfHealingState {
  if (plan.recommended_action === "rebuild_partition") return "partitioned";
  if (plan.recommended_action === "quarantine_instability") return "degraded";
  if (plan.recommended_action === "reconcile_divergence") return "reconciled";
  if (survivabilityScore < threshold) return "healing";
  if (plan.recommended_action === "stabilize_branch") return "recovered";
  return "stabilizing";
}

function memoryStateToHealingState(state: string | null | undefined): ReplaySelfHealingState {
  switch (state) {
    case "stabilized":
      return "recovered";
    case "quarantined":
    case "deprecated":
      return "degraded";
    case "reconciled":
      return "reconciled";
    case "archived":
    case "active":
    default:
      return "monitoring";
  }
}

function repairReason(action: ReplaySelfHealingAction): string {
  switch (action) {
    case "rebuild_partition":
      return "partition_memory_requires_rebuild";
    case "quarantine_instability":
      return "predicted_divergence_exceeds_instability_threshold";
    case "reconcile_divergence":
      return "long_horizon_divergence_requires_reconciliation";
    case "reroute_recovery":
      return "recovery_effectiveness_requires_adaptive_routing";
    case "stabilize_branch":
      return "branch_survivability_supports_stabilization";
    case "promote_checkpoint":
      return "checkpoint_ready_for_promotion";
    case "rebalance_mesh":
      return "mesh_survivability_requires_rebalance";
    case "freeze_healing_epoch":
      return "healing_epoch_ready_to_freeze";
  }
}

function latestForReplay<T extends { readonly replay_hash: string; readonly temporal_ordinal?: number }>(
  values: readonly T[],
  replayHash: string,
): T | undefined {
  return values
    .filter((value) => value.replay_hash === replayHash)
    .sort((left, right) => (right.temporal_ordinal ?? 0) - (left.temporal_ordinal ?? 0))[0];
}

function required<T>(value: T | undefined, message: string): T {
  if (typeof value === "undefined") throw new Error(message);
  return value;
}

function roundHealingNumber(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function stableSelfHealingStringify(value: unknown): string {
  return JSON.stringify(sortSelfHealingKeys(value));
}

function sortSelfHealingKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortSelfHealingKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortSelfHealingKeys((value as Record<string, unknown>)[key]);
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
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value;
}
