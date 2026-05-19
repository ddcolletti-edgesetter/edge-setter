import crypto from "node:crypto";

import type {
  ReplayCoordinationMeshResult,
  ReplayCoordinationSession,
} from "./replay-coordination-mesh-contract";
import type {
  ReplayGovernanceDecision,
  ReplayGovernanceValidatorProfile,
} from "./replay-governance-contract";
import type {
  ReplayMemoryInput,
  ReplayMemoryQuery,
  ReplayMemorySnapshot,
  ReplayMemorySnapshotReference,
  ReplayMemoryState,
  ReplayMemoryAction,
  ReplayTemporalIndex,
  ReplayEvolutionMemory,
  ReplayDivergenceEvolutionMemory,
  ReplayValidatorBehaviorMemory,
  ReplayRecoveryEffectivenessMemory,
  ReplayGovernanceDecisionMemory,
  ReplayBranchTemporalAncestry,
  ReplayEpochMemory,
} from "./replay-memory-contract";

const DEFAULT_EPOCH_SIZE = 3;

const SUPPORTED_ACTIONS: readonly ReplayMemoryAction[] = [
  "persist_temporal_state",
  "archive_branch_history",
  "record_divergence_evolution",
  "record_validator_behavior",
  "record_recovery_effectiveness",
  "promote_historical_branch",
  "reconcile_memory_segment",
  "freeze_replay_epoch",
];

const SUPPORTED_QUERIES: readonly ReplayMemoryQuery[] = [
  "get_replay_evolution_history",
  "get_validator_behavioral_history",
  "get_divergence_evolution_timeline",
  "get_recovery_effectiveness_history",
  "get_governance_decision_history",
  "get_replay_epoch_history",
  "get_branch_temporal_ancestry",
];

export function buildReplayMemorySnapshot(
  input: ReplayMemoryInput,
): ReplayMemorySnapshot {
  const meshes = normalizeMeshes(input.mesh_snapshots, input.retention_horizon);
  const temporalIndexes = buildTemporalIndexes(input, meshes);
  const governanceDecisions = buildGovernanceDecisionMemory(input, temporalIndexes);
  const replayEvolution = buildReplayEvolution(input, temporalIndexes, meshes);
  const divergenceEvolution = buildDivergenceEvolution(temporalIndexes, meshes);
  const validatorBehavior = buildValidatorBehavior(input, temporalIndexes);
  const recoveryEffectiveness = buildRecoveryEffectiveness(temporalIndexes, meshes);
  const branchAncestry = buildBranchAncestry(input, temporalIndexes);
  const epochs = buildEpochs(input, temporalIndexes);
  const snapshots = buildSnapshotReference(input, meshes);
  const state = classifyMemoryState(replayEvolution, governanceDecisions);
  const seed = {
    run_id: input.run_id,
    generated_at: input.generated_at,
    state,
    temporal_hashes: temporalIndexes.map((index) => index.temporal_hash),
    evolution_hashes: replayEvolution.map((memory) => memory.evolution_hash),
    divergence_hashes: divergenceEvolution.map((memory) => memory.divergence_hash),
    validator_hashes: validatorBehavior.map((memory) => memory.behavior_hash),
    recovery_hashes: recoveryEffectiveness.map((memory) => memory.recovery_hash),
    governance_hashes: governanceDecisions.map((memory) => memory.memory_hash),
    ancestry_hashes: branchAncestry.map((memory) => memory.ancestry_hash),
    epoch_hashes: epochs.map((epoch) => epoch.epoch_hash),
    snapshot_reference_hash: snapshots.reference_hash,
  };
  const deterministicHash = computeReplayMemoryDeterministicHash(seed);

  return deepFreeze({
    memory_id: `replay-memory:${deterministicHash}`,
    run_id: input.run_id,
    generated_at: input.generated_at,
    state,
    temporal_indexes: temporalIndexes,
    replay_evolution: replayEvolution,
    divergence_evolution: divergenceEvolution,
    validator_behavior: validatorBehavior,
    recovery_effectiveness: recoveryEffectiveness,
    governance_decisions: governanceDecisions,
    branch_ancestry: branchAncestry,
    epochs,
    snapshots,
    supported_actions: SUPPORTED_ACTIONS,
    supported_queries: SUPPORTED_QUERIES,
    deterministic_hash: deterministicHash,
  });
}

export function getReplayEvolutionHistory(
  snapshot: ReplayMemorySnapshot,
  replayHash?: string,
): readonly ReplayEvolutionMemory[] {
  return replayHash
    ? snapshot.replay_evolution.filter((memory) => memory.replay_hash === replayHash)
    : snapshot.replay_evolution;
}

export function getValidatorBehavioralHistory(
  snapshot: ReplayMemorySnapshot,
  validatorId?: string,
): readonly ReplayValidatorBehaviorMemory[] {
  return validatorId
    ? snapshot.validator_behavior.filter((memory) => memory.validator_id === validatorId)
    : snapshot.validator_behavior;
}

export function getDivergenceEvolutionTimeline(
  snapshot: ReplayMemorySnapshot,
  replayHash?: string,
): readonly ReplayDivergenceEvolutionMemory[] {
  return replayHash
    ? snapshot.divergence_evolution.filter((memory) => memory.replay_hash === replayHash)
    : snapshot.divergence_evolution;
}

export function getRecoveryEffectivenessHistory(
  snapshot: ReplayMemorySnapshot,
  replayHash?: string,
): readonly ReplayRecoveryEffectivenessMemory[] {
  return replayHash
    ? snapshot.recovery_effectiveness.filter((memory) => memory.replay_hash === replayHash)
    : snapshot.recovery_effectiveness;
}

export function getGovernanceDecisionHistory(
  snapshot: ReplayMemorySnapshot,
  replayHash?: string,
): readonly ReplayGovernanceDecisionMemory[] {
  return replayHash
    ? snapshot.governance_decisions.filter((memory) => memory.replay_hash === replayHash)
    : snapshot.governance_decisions;
}

export function getReplayEpochHistory(
  snapshot: ReplayMemorySnapshot,
): readonly ReplayEpochMemory[] {
  return snapshot.epochs;
}

export function getBranchTemporalAncestry(
  snapshot: ReplayMemorySnapshot,
  replayHash?: string,
): readonly ReplayBranchTemporalAncestry[] {
  return replayHash
    ? snapshot.branch_ancestry.filter((memory) => memory.replay_hash === replayHash)
    : snapshot.branch_ancestry;
}

export function serializeReplayMemorySnapshot(
  snapshot: ReplayMemorySnapshot,
): string {
  return stableReplayMemoryStringify(snapshot);
}

export function computeReplayMemoryDeterministicHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableReplayMemoryStringify(value))
    .digest("hex");
}

function normalizeMeshes(
  meshes: readonly ReplayCoordinationMeshResult[],
  retentionHorizon: number | undefined,
): readonly ReplayCoordinationMeshResult[] {
  const sorted = [...meshes].sort((left, right) =>
    left.generated_at.localeCompare(right.generated_at) ||
    left.deterministic_hash.localeCompare(right.deterministic_hash),
  );
  return retentionHorizon ? sorted.slice(Math.max(0, sorted.length - retentionHorizon)) : sorted;
}

function buildTemporalIndexes(
  input: ReplayMemoryInput,
  meshes: readonly ReplayCoordinationMeshResult[],
): readonly ReplayTemporalIndex[] {
  const epochSize = input.epoch_size ?? DEFAULT_EPOCH_SIZE;
  const records: ReplayTemporalIndex[] = [];

  meshes.forEach((mesh, meshIndex) => {
    mesh.sessions.forEach((session) => {
      const ordinal = records.length + 1;
      const epochOrdinal = Math.ceil(ordinal / epochSize);
      const decision = findGovernanceDecision(input, session.replay_hash);
      const seed = {
        run_id: input.run_id,
        replay_hash: session.replay_hash,
        temporal_ordinal: ordinal,
        epoch_id: epochId(input.run_id, epochOrdinal),
        mesh_hash: mesh.deterministic_hash,
        governance_decision_hash: decision?.deterministic_hash ?? null,
        lineage_reference_hashes: session.lineage_reference_hashes,
        persistence_record_hashes: session.persistence_record_hashes,
      };
      const temporalHash = computeReplayMemoryDeterministicHash(seed);

      records.push({
        index_id: `replay-temporal-index:${temporalHash}`,
        ...seed,
        temporal_hash: temporalHash,
      });
    });
  });

  return deepFreeze(records.sort((left, right) =>
    left.temporal_ordinal - right.temporal_ordinal ||
    left.replay_hash.localeCompare(right.replay_hash),
  ));
}

function buildReplayEvolution(
  input: ReplayMemoryInput,
  indexes: readonly ReplayTemporalIndex[],
  meshes: readonly ReplayCoordinationMeshResult[],
): readonly ReplayEvolutionMemory[] {
  const previousStateByReplay = new Map<string, ReplayMemoryState>();

  return deepFreeze(indexes.map((index) => {
    const mesh = findMesh(meshes, index.mesh_hash);
    const session = findSession(mesh, index.replay_hash);
    const nextState = memoryStateForSession(input, session, mesh);
    const fromState = previousStateByReplay.get(index.replay_hash) ?? null;
    previousStateByReplay.set(index.replay_hash, nextState);
    const seed = {
      replay_hash: index.replay_hash,
      from_state: fromState,
      to_state: nextState,
      mesh_state: mesh.state,
      coordination_action: session?.action ?? null,
      temporal_ordinal: index.temporal_ordinal,
      lineage_reference_count: index.lineage_reference_hashes.length,
    };
    const evolutionHash = computeReplayMemoryDeterministicHash(seed);

    return {
      evolution_id: `replay-evolution-memory:${evolutionHash}`,
      ...seed,
      evolution_hash: evolutionHash,
    };
  }));
}

function buildDivergenceEvolution(
  indexes: readonly ReplayTemporalIndex[],
  meshes: readonly ReplayCoordinationMeshResult[],
): readonly ReplayDivergenceEvolutionMemory[] {
  return deepFreeze(indexes.map((index) => {
    const mesh = findMesh(meshes, index.mesh_hash);
    const session = findSession(mesh, index.replay_hash);
    const partitionCount = mesh.partitions.filter((partition) => partition.replay_hash === index.replay_hash).length;
    const failoverCount = mesh.failover.filter((failover) => failover.replay_hash === index.replay_hash).length;
    const quorumMet = session?.quorum.quorum_met ?? false;
    const divergenceScore = roundMemoryNumber((partitionCount * 0.4) + (failoverCount * 0.3) + (quorumMet ? 0 : 0.3));
    const seed = {
      replay_hash: index.replay_hash,
      temporal_ordinal: index.temporal_ordinal,
      divergence_score: divergenceScore,
      partition_count: partitionCount,
      failover_count: failoverCount,
      quorum_met: quorumMet,
      divergence_reason: divergenceScore === 0
        ? "stable_temporal_replay"
        : partitionCount > 0
          ? "partition_accumulated"
          : failoverCount > 0
            ? "failover_accumulated"
            : "quorum_degradation_accumulated",
    };
    const divergenceHash = computeReplayMemoryDeterministicHash(seed);

    return {
      divergence_id: `replay-divergence-memory:${divergenceHash}`,
      ...seed,
      divergence_hash: divergenceHash,
    };
  }));
}

function buildValidatorBehavior(
  input: ReplayMemoryInput,
  indexes: readonly ReplayTemporalIndex[],
): readonly ReplayValidatorBehaviorMemory[] {
  return deepFreeze(input.governance_snapshot.validator_profiles.flatMap((profile) =>
    indexes
      .filter((index) => profile.replay_hashes.includes(index.replay_hash))
      .map((index) => buildValidatorBehaviorRecord(profile, index)),
  ).sort((left, right) =>
    left.validator_id.localeCompare(right.validator_id) ||
    left.temporal_ordinal - right.temporal_ordinal ||
    left.replay_hash.localeCompare(right.replay_hash),
  ));
}

function buildValidatorBehaviorRecord(
  profile: ReplayGovernanceValidatorProfile,
  index: ReplayTemporalIndex,
): ReplayValidatorBehaviorMemory {
  const seed = {
    validator_id: profile.validator_id,
    replay_hash: index.replay_hash,
    temporal_ordinal: index.temporal_ordinal,
    participation_count: profile.vote_count,
    divergence_count: profile.divergence_count,
    average_confidence: profile.average_confidence,
    trust_score: profile.trust_score,
    recommended_governance_action: profile.recommended_action,
  };
  const behaviorHash = computeReplayMemoryDeterministicHash(seed);

  return {
    behavior_id: `replay-validator-memory:${behaviorHash}`,
    ...seed,
    behavior_hash: behaviorHash,
  };
}

function buildRecoveryEffectiveness(
  indexes: readonly ReplayTemporalIndex[],
  meshes: readonly ReplayCoordinationMeshResult[],
): readonly ReplayRecoveryEffectivenessMemory[] {
  return deepFreeze(indexes.map((index) => {
    const mesh = findMesh(meshes, index.mesh_hash);
    const recoveryRouteCount = mesh.recovery_routes.filter((route) => route.replay_hash === index.replay_hash).length;
    const failoverCount = mesh.failover.filter((record) => record.replay_hash === index.replay_hash).length;
    const partitionReconciled = mesh.partitions.some((partition) =>
      partition.replay_hash === index.replay_hash && partition.recovered_by_session_id !== null,
    );
    const effectivenessScore = roundMemoryNumber(Math.max(0, Math.min(1,
      0.55 +
      (partitionReconciled ? 0.2 : 0) +
      Math.min(0.2, recoveryRouteCount * 0.05) -
      Math.min(0.25, failoverCount * 0.05),
    )));
    const seed = {
      replay_hash: index.replay_hash,
      temporal_ordinal: index.temporal_ordinal,
      recovery_route_count: recoveryRouteCount,
      failover_count: failoverCount,
      partition_reconciled: partitionReconciled,
      effectiveness_score: effectivenessScore,
    };
    const recoveryHash = computeReplayMemoryDeterministicHash(seed);

    return {
      effectiveness_id: `replay-recovery-effectiveness:${recoveryHash}`,
      ...seed,
      recovery_hash: recoveryHash,
    };
  }));
}

function buildGovernanceDecisionMemory(
  input: ReplayMemoryInput,
  indexes: readonly ReplayTemporalIndex[],
): readonly ReplayGovernanceDecisionMemory[] {
  return deepFreeze(indexes.flatMap((index) => {
    const decision = findGovernanceDecision(input, index.replay_hash);
    if (!decision) return [];
    const seed = {
      replay_hash: index.replay_hash,
      temporal_ordinal: index.temporal_ordinal,
      action: decision.action,
      state: decision.state,
      decision_hash: decision.deterministic_hash,
      lineage_reference_hashes: decision.lineage_reference_hashes,
    };
    const memoryHash = computeReplayMemoryDeterministicHash(seed);

    return [{
      memory_id: `replay-governance-memory:${memoryHash}`,
      ...seed,
      memory_hash: memoryHash,
    }];
  }));
}

function buildBranchAncestry(
  input: ReplayMemoryInput,
  indexes: readonly ReplayTemporalIndex[],
): readonly ReplayBranchTemporalAncestry[] {
  const replayHashes = Array.from(new Set(indexes.map((index) => index.replay_hash)))
    .sort((left, right) => left.localeCompare(right));

  return deepFreeze(replayHashes.map((replayHash) => {
    const replayIndexes = indexes.filter((index) => index.replay_hash === replayHash);
    const lineageRows = input.orchestration_persistence.lineage.filter((lineage) => lineage.replay_hash === replayHash);
    const branchRows = input.orchestration_persistence.branches.filter((branch) => branch.replay_hash === replayHash);
    const parentReplayHash = lineageRows
      .map((lineage) => lineage.parent_replay_hash)
      .find((parent): parent is string => parent !== null) ?? null;
    const seed = {
      replay_hash: replayHash,
      parent_replay_hash: parentReplayHash,
      temporal_ordinals: replayIndexes.map((index) => index.temporal_ordinal),
      lineage_hashes: lineageRows.map((lineage) => lineage.lineage_hash).sort((left, right) => left.localeCompare(right)),
      branch_state_hashes: branchRows.map((branch) => branch.persistence_hash).sort((left, right) => left.localeCompare(right)),
    };
    const ancestryHash = computeReplayMemoryDeterministicHash(seed);

    return {
      ancestry_id: `replay-branch-memory:${ancestryHash}`,
      ...seed,
      ancestry_hash: ancestryHash,
    };
  }));
}

function buildEpochs(
  input: ReplayMemoryInput,
  indexes: readonly ReplayTemporalIndex[],
): readonly ReplayEpochMemory[] {
  const epochIds = Array.from(new Set(indexes.map((index) => index.epoch_id)))
    .sort((left, right) => left.localeCompare(right));

  return deepFreeze(epochIds.map((id, index) => {
    const epochIndexes = indexes.filter((temporalIndex) => temporalIndex.epoch_id === id);
    const seed = {
      run_id: input.run_id,
      epoch_ordinal: index + 1,
      replay_hashes: Array.from(new Set(epochIndexes.map((temporalIndex) => temporalIndex.replay_hash)))
        .sort((left, right) => left.localeCompare(right)),
      temporal_index_hashes: epochIndexes.map((temporalIndex) => temporalIndex.temporal_hash),
      frozen: true,
      frozen_at: input.generated_at,
    };
    const epochHash = computeReplayMemoryDeterministicHash(seed);

    return {
      epoch_id: id,
      ...seed,
      epoch_hash: epochHash,
    };
  }));
}

function buildSnapshotReference(
  input: ReplayMemoryInput,
  meshes: readonly ReplayCoordinationMeshResult[],
): ReplayMemorySnapshotReference {
  const seed = {
    coordination_mesh_hashes: meshes.map((mesh) => mesh.deterministic_hash),
    governance_snapshot_hash: input.governance_snapshot.deterministic_hash,
    orchestration_persistence_hash: input.orchestration_persistence.deterministic_hash,
    lineage_graph_hash: input.lineage_snapshot.graph_hash,
  };

  return deepFreeze({
    ...seed,
    reference_hash: computeReplayMemoryDeterministicHash(seed),
  });
}

function classifyMemoryState(
  evolution: readonly ReplayEvolutionMemory[],
  governance: readonly ReplayGovernanceDecisionMemory[],
): ReplayMemoryState {
  if (governance.some((memory) => memory.state === "quarantined")) return "quarantined";
  if (evolution.some((memory) => memory.to_state === "reconciled")) return "reconciled";
  if (evolution.length > 0 && evolution.every((memory) => memory.to_state === "stabilized")) return "stabilized";
  if (evolution.length > 8) return "archived";
  return "active";
}

function memoryStateForSession(
  input: ReplayMemoryInput,
  session: ReplayCoordinationSession | undefined,
  mesh: ReplayCoordinationMeshResult,
): ReplayMemoryState {
  const decision = session ? findGovernanceDecision(input, session.replay_hash) : null;
  if (decision?.state === "quarantined") return "quarantined";
  if (decision?.state === "rejected") return "deprecated";
  if (decision?.state === "stabilized" || decision?.state === "approved") return "stabilized";
  if (mesh.partitions.some((partition) => partition.replay_hash === session?.replay_hash)) return "reconciled";
  return "active";
}

function findGovernanceDecision(
  input: ReplayMemoryInput,
  replayHash: string,
): ReplayGovernanceDecision | undefined {
  return input.governance_snapshot.decisions.find((decision) =>
    decision.replay_hash === replayHash,
  );
}

function findMesh(
  meshes: readonly ReplayCoordinationMeshResult[],
  meshHash: string,
): ReplayCoordinationMeshResult {
  const mesh = meshes.find((candidate) => candidate.deterministic_hash === meshHash);
  if (!mesh) throw new Error(`Replay coordination mesh ${meshHash} is missing.`);
  return mesh;
}

function findSession(
  mesh: ReplayCoordinationMeshResult,
  replayHash: string,
): ReplayCoordinationSession | undefined {
  return mesh.sessions.find((session) => session.replay_hash === replayHash);
}

function epochId(runId: string, epochOrdinal: number): string {
  return `replay-epoch:${computeReplayMemoryDeterministicHash({ run_id: runId, epoch_ordinal: epochOrdinal })}`;
}

function roundMemoryNumber(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function stableReplayMemoryStringify(value: unknown): string {
  return JSON.stringify(sortReplayMemoryKeys(value));
}

function sortReplayMemoryKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortReplayMemoryKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortReplayMemoryKeys((value as Record<string, unknown>)[key]);
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
