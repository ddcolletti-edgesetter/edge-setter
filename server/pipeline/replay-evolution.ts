import crypto from "node:crypto";

import type Database from "better-sqlite3";

import {
  initializeReplayConsensusIntelligenceSchema,
} from "./replay-consensus-intelligence";
import type {
  ReplayEvolutionAction,
  ReplayEvolutionConvergenceRecord,
  ReplayEvolutionInput,
  ReplayEvolutionQuery,
  ReplayEvolutionSnapshot,
  ReplayEvolutionSnapshotReference,
  ReplayEvolutionState,
  ReplayEvolutionEpoch,
  ReplayIntelligenceMutationRecord,
  ReplayOptimizationLineageReference,
  ReplayStrategyEvolutionRecord,
  ReplaySurvivabilityOptimizationRecord,
  ReplayAdaptiveGeneration,
  ReplayValidatorEvolutionProfile,
} from "./replay-evolution-contract";

type SqliteDatabase = Database.Database;

interface PayloadRow {
  readonly payload: string;
}

const DEFAULT_GENERATION_SIZE = 2;
const DEFAULT_PROMOTION_THRESHOLD = 0.74;
const DEFAULT_SURVIVABILITY_FLOOR = 0.66;

const SUPPORTED_ACTIONS: readonly ReplayEvolutionAction[] = [
  "evolve_strategy",
  "mutate_weighting",
  "promote_generation",
  "deprecate_branch",
  "reconcile_mutation",
  "optimize_survivability",
  "freeze_evolution_epoch",
  "promote_adaptive_cycle",
];

const SUPPORTED_QUERIES: readonly ReplayEvolutionQuery[] = [
  "get_replay_evolution_history",
  "get_adaptive_generation_history",
  "get_mutation_lineage",
  "get_survivability_optimization_history",
  "get_validator_evolution_profiles",
  "get_evolution_epoch_history",
  "get_adaptive_convergence_history",
];

export function initializeReplayEvolutionSchema(db: SqliteDatabase): void {
  initializeReplayConsensusIntelligenceSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS replay_evolution_snapshots (
      evolution_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      state TEXT NOT NULL,
      deterministic_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_evolution_snapshots_run
      ON replay_evolution_snapshots(run_id, generated_at DESC, evolution_id DESC);

    CREATE TABLE IF NOT EXISTS replay_evolution_strategy (
      evolution_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      generation_ordinal INTEGER NOT NULL,
      to_state TEXT NOT NULL,
      action TEXT NOT NULL,
      strategy_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_evolution_strategy_replay
      ON replay_evolution_strategy(run_id, replay_hash, generation_ordinal);

    CREATE TABLE IF NOT EXISTS replay_evolution_generations (
      generation_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      generation_ordinal INTEGER NOT NULL,
      promoted INTEGER NOT NULL,
      generation_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_evolution_generations_run
      ON replay_evolution_generations(run_id, generation_ordinal);

    CREATE TABLE IF NOT EXISTS replay_evolution_mutations (
      mutation_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      validator_id TEXT NOT NULL,
      mutation_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_evolution_mutations_validator
      ON replay_evolution_mutations(run_id, validator_id, replay_hash);

    CREATE TABLE IF NOT EXISTS replay_evolution_survivability (
      optimization_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      optimization_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_evolution_survivability_replay
      ON replay_evolution_survivability(run_id, replay_hash);

    CREATE TABLE IF NOT EXISTS replay_evolution_validator_profiles (
      profile_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      validator_id TEXT NOT NULL,
      profile_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_evolution_validator_profiles_validator
      ON replay_evolution_validator_profiles(validator_id, run_id);

    CREATE TABLE IF NOT EXISTS replay_evolution_convergence (
      convergence_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      generation_ordinal INTEGER NOT NULL,
      convergence_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_evolution_convergence_replay
      ON replay_evolution_convergence(run_id, replay_hash, generation_ordinal);

    CREATE TABLE IF NOT EXISTS replay_evolution_lineage (
      reference_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      reference_kind TEXT NOT NULL,
      reference_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_evolution_lineage_replay
      ON replay_evolution_lineage(run_id, replay_hash, reference_kind);

    CREATE TABLE IF NOT EXISTS replay_evolution_epochs (
      epoch_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      promoted INTEGER NOT NULL,
      frozen INTEGER NOT NULL,
      epoch_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);
}

export function buildReplayEvolutionSnapshot(
  db: SqliteDatabase,
  input: ReplayEvolutionInput,
): ReplayEvolutionSnapshot {
  initializeReplayEvolutionSchema(db);

  const strategyEvolution = buildStrategyEvolution(input);
  const mutationLineage = buildMutationLineage(input);
  const survivabilityOptimization = buildSurvivabilityOptimization(input);
  const convergenceHistory = buildConvergenceHistory(input, strategyEvolution, survivabilityOptimization);
  const adaptiveGenerations = buildAdaptiveGenerations(input, strategyEvolution, mutationLineage, convergenceHistory);
  const validatorProfiles = buildValidatorProfiles(input, mutationLineage, adaptiveGenerations);
  const lineage = buildLineage(input);
  const epochs = buildEpochs(input, adaptiveGenerations, strategyEvolution);
  const snapshots = buildSnapshotReference(input);
  const state = classifyEvolutionState(strategyEvolution, adaptiveGenerations);
  const seed = {
    run_id: input.run_id,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    generation_hashes: adaptiveGenerations.map((generation) => generation.generation_hash),
    strategy_hashes: strategyEvolution.map((record) => record.strategy_hash),
    mutation_hashes: mutationLineage.map((record) => record.mutation_hash),
    optimization_hashes: survivabilityOptimization.map((record) => record.optimization_hash),
    validator_profile_hashes: validatorProfiles.map((profile) => profile.profile_hash),
    convergence_hashes: convergenceHistory.map((record) => record.convergence_hash),
    lineage_hashes: lineage.map((reference) => reference.reference_hash),
    epoch_hashes: epochs.map((epoch) => epoch.epoch_hash),
    snapshot_reference_hash: snapshots.reference_hash,
  };
  const deterministicHash = computeReplayEvolutionDeterministicHash(seed);
  const snapshot = deepFreeze({
    evolution_id: `replay-evolution:${deterministicHash}`,
    run_id: input.run_id,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    adaptive_generations: adaptiveGenerations,
    strategy_evolution: strategyEvolution,
    mutation_lineage: mutationLineage,
    survivability_optimization: survivabilityOptimization,
    validator_profiles: validatorProfiles,
    convergence_history: convergenceHistory,
    lineage,
    epochs,
    snapshots,
    supported_actions: SUPPORTED_ACTIONS,
    supported_queries: SUPPORTED_QUERIES,
    query_views: {
      replay_evolution_history: strategyEvolution,
      adaptive_generation_history: adaptiveGenerations,
      mutation_lineage: mutationLineage,
      survivability_optimization_history: survivabilityOptimization,
      validator_evolution_profiles: validatorProfiles,
      evolution_epoch_history: epochs,
      adaptive_convergence_history: convergenceHistory,
    },
    deterministic_hash: deterministicHash,
  });

  persistReplayEvolutionSnapshot(db, snapshot);
  return snapshot;
}

export function getReplayEvolutionHistory(
  db: SqliteDatabase,
  runId: string,
  replayHash?: string,
): readonly ReplayStrategyEvolutionRecord[] {
  initializeReplayEvolutionSchema(db);
  const rows = replayHash
    ? db.prepare(`
      SELECT payload FROM replay_evolution_strategy
      WHERE run_id = ? AND replay_hash = ?
      ORDER BY generation_ordinal ASC, strategy_hash ASC
    `).all(runId, replayHash) as PayloadRow[]
    : db.prepare(`
      SELECT payload FROM replay_evolution_strategy
      WHERE run_id = ?
      ORDER BY generation_ordinal ASC, replay_hash ASC, strategy_hash ASC
    `).all(runId) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayStrategyEvolutionRecord));
}

export function getAdaptiveGenerationHistory(
  db: SqliteDatabase,
  runId: string,
): readonly ReplayAdaptiveGeneration[] {
  initializeReplayEvolutionSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_evolution_generations
    WHERE run_id = ?
    ORDER BY generation_ordinal ASC, generation_hash ASC
  `).all(runId) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayAdaptiveGeneration));
}

export function getMutationLineage(
  db: SqliteDatabase,
  runId: string,
  validatorId?: string,
): readonly ReplayIntelligenceMutationRecord[] {
  initializeReplayEvolutionSchema(db);
  const rows = validatorId
    ? db.prepare(`
      SELECT payload FROM replay_evolution_mutations
      WHERE run_id = ? AND validator_id = ?
      ORDER BY replay_hash ASC, mutation_hash ASC
    `).all(runId, validatorId) as PayloadRow[]
    : db.prepare(`
      SELECT payload FROM replay_evolution_mutations
      WHERE run_id = ?
      ORDER BY replay_hash ASC, validator_id ASC, mutation_hash ASC
    `).all(runId) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayIntelligenceMutationRecord));
}

export function getSurvivabilityOptimizationHistory(
  db: SqliteDatabase,
  runId: string,
  replayHash?: string,
): readonly ReplaySurvivabilityOptimizationRecord[] {
  initializeReplayEvolutionSchema(db);
  const rows = replayHash
    ? db.prepare(`
      SELECT payload FROM replay_evolution_survivability
      WHERE run_id = ? AND replay_hash = ?
      ORDER BY optimization_hash ASC
    `).all(runId, replayHash) as PayloadRow[]
    : db.prepare(`
      SELECT payload FROM replay_evolution_survivability
      WHERE run_id = ?
      ORDER BY replay_hash ASC, optimization_hash ASC
    `).all(runId) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplaySurvivabilityOptimizationRecord));
}

export function getValidatorEvolutionProfiles(
  db: SqliteDatabase,
  runId: string,
): readonly ReplayValidatorEvolutionProfile[] {
  initializeReplayEvolutionSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_evolution_validator_profiles
    WHERE run_id = ?
    ORDER BY validator_id ASC, profile_hash ASC
  `).all(runId) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayValidatorEvolutionProfile));
}

export function getEvolutionEpochHistory(
  db: SqliteDatabase,
  runId: string,
): readonly ReplayEvolutionEpoch[] {
  initializeReplayEvolutionSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_evolution_epochs
    WHERE run_id = ?
    ORDER BY epoch_id ASC
  `).all(runId) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayEvolutionEpoch));
}

export function getAdaptiveConvergenceHistory(
  db: SqliteDatabase,
  runId: string,
): readonly ReplayEvolutionConvergenceRecord[] {
  initializeReplayEvolutionSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_evolution_convergence
    WHERE run_id = ?
    ORDER BY generation_ordinal ASC, replay_hash ASC, convergence_hash ASC
  `).all(runId) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayEvolutionConvergenceRecord));
}

export function serializeReplayEvolutionSnapshot(snapshot: ReplayEvolutionSnapshot): string {
  return stableReplayEvolutionStringify(snapshot);
}

export function computeReplayEvolutionDeterministicHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableReplayEvolutionStringify(value))
    .digest("hex");
}

function buildStrategyEvolution(input: ReplayEvolutionInput): readonly ReplayStrategyEvolutionRecord[] {
  const promotionThreshold = input.promotion_threshold ?? DEFAULT_PROMOTION_THRESHOLD;
  const survivabilityFloor = input.survivability_floor ?? DEFAULT_SURVIVABILITY_FLOOR;
  return deepFreeze(collectReplayHashes(input).map((replayHash, index) => {
    const synthesis = input.consensus_intelligence.synthesis.find((item) => item.replay_hash === replayHash);
    const memory = latestForReplay(input.memory_snapshot.replay_evolution, replayHash);
    const governance = input.governance_snapshot.decisions.find((decision) => decision.replay_hash === replayHash);
    const trend = input.self_healing_snapshot.survivability_trends.find((item) => item.replay_hash === replayHash);
    const convergenceScore = synthesis?.convergence_score ?? 0;
    const survivabilityScore = trend?.survivability_score ?? 0.5;
    const state = stateForReplay(convergenceScore, survivabilityScore, governance?.action ?? null, promotionThreshold, survivabilityFloor);
    const action = actionForReplay(state, convergenceScore, survivabilityScore, promotionThreshold, survivabilityFloor);
    const seed = {
      run_id: input.run_id,
      replay_hash: replayHash,
      generation_ordinal: generationOrdinal(index, input.generation_size),
      from_state: memory ? memoryStateToEvolutionState(memory.to_state) : null,
      to_state: state,
      action,
      intelligence_action: synthesis?.action ?? null,
      governance_action: governance?.action ?? null,
      strategy_weight: roundEvolutionNumber((convergenceScore * 0.52) + (survivabilityScore * 0.38) + (governance?.state === "approved" ? 0.1 : 0)),
      convergence_score: convergenceScore,
      survivability_score: survivabilityScore,
    };
    const strategyHash = computeReplayEvolutionDeterministicHash(seed);
    return {
      evolution_id: `replay-strategy-evolution:${strategyHash}`,
      ...seed,
      strategy_hash: strategyHash,
    };
  }).sort((left, right) =>
    left.generation_ordinal - right.generation_ordinal ||
    left.replay_hash.localeCompare(right.replay_hash),
  ));
}

function buildMutationLineage(input: ReplayEvolutionInput): readonly ReplayIntelligenceMutationRecord[] {
  const lineageByReplay = new Map<string, readonly string[]>();
  for (const reference of input.consensus_intelligence.lineage) {
    lineageByReplay.set(reference.replay_hash, [
      ...(lineageByReplay.get(reference.replay_hash) ?? []),
      reference.reference_hash,
    ].sort((left, right) => left.localeCompare(right)));
  }

  const records = input.consensus_intelligence.validator_profiles.flatMap((profile) =>
    profile.replay_hashes.map((replayHash) => {
      const governance = input.governance_snapshot.validator_profiles.find((item) => item.validator_id === profile.validator_id);
      const previousWeight = governance?.average_weight ?? profile.adaptive_weight;
      const survivability = input.self_healing_snapshot.survivability_trends.find((trend) => trend.replay_hash === replayHash)?.survivability_score ?? 0.5;
      const mutationDelta = roundEvolutionNumber(profile.adaptive_weight - previousWeight);
      const mutationAction: ReplayEvolutionAction = Math.abs(mutationDelta) >= 0.08
        ? "mutate_weighting"
        : survivability < (input.survivability_floor ?? DEFAULT_SURVIVABILITY_FLOOR)
          ? "optimize_survivability"
          : "evolve_strategy";
      const intelligenceGenerationHash = input.consensus_intelligence.epochs.find((epoch) => epoch.replay_hashes.includes(replayHash))?.epoch_hash
        ?? input.consensus_intelligence.deterministic_hash;
      const seed = {
        run_id: input.run_id,
        replay_hash: replayHash,
        validator_id: profile.validator_id,
        parent_profile_hash: profile.profile_hash,
        mutation_action: mutationAction,
        previous_weight: roundEvolutionNumber(previousWeight),
        mutated_weight: profile.adaptive_weight,
        mutation_delta: mutationDelta,
        intelligence_generation_hash: intelligenceGenerationHash,
        lineage_reference_hashes: lineageByReplay.get(replayHash) ?? [],
      };
      const mutationHash = computeReplayEvolutionDeterministicHash(seed);
      return {
        mutation_id: `replay-intelligence-mutation:${mutationHash}`,
        ...seed,
        mutation_hash: mutationHash,
      };
    })
  );
  return deepFreeze(records.sort((left, right) =>
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.validator_id.localeCompare(right.validator_id) ||
    left.mutation_hash.localeCompare(right.mutation_hash),
  ));
}

function buildSurvivabilityOptimization(input: ReplayEvolutionInput): readonly ReplaySurvivabilityOptimizationRecord[] {
  return deepFreeze(collectReplayHashes(input).map((replayHash) => {
    const forecast = input.consensus_intelligence.survivability_forecasts.find((item) => item.replay_hash === replayHash);
    const trend = input.self_healing_snapshot.survivability_trends.find((item) => item.replay_hash === replayHash);
    const healing = input.self_healing_snapshot.decisions.find((item) => item.replay_hash === replayHash);
    const governance = input.governance_snapshot.decisions.find((item) => item.replay_hash === replayHash);
    const before = trend?.survivability_score ?? forecast?.survivability_score ?? 0.5;
    const boost = healing?.action === "stabilize_branch" || healing?.action === "promote_checkpoint"
      ? 0.08
      : governance?.action === "quarantine_branch" || governance?.action === "reject_branch"
        ? -0.08
        : 0.05;
    const optimized = roundEvolutionNumber(Math.max(0, Math.min(1, before + boost)));
    const action: ReplayEvolutionAction = optimized < (input.survivability_floor ?? DEFAULT_SURVIVABILITY_FLOOR)
      ? "deprecate_branch"
      : "optimize_survivability";
    const seed = {
      run_id: input.run_id,
      replay_hash: replayHash,
      before_survivability_score: before,
      optimized_survivability_score: optimized,
      optimization_delta: roundEvolutionNumber(optimized - before),
      healing_action: healing?.action ?? null,
      governance_gate: governance?.action ?? null,
      optimization_action: action,
    };
    const optimizationHash = computeReplayEvolutionDeterministicHash(seed);
    return {
      optimization_id: `replay-survivability-optimization:${optimizationHash}`,
      ...seed,
      optimization_hash: optimizationHash,
    };
  }));
}

function buildConvergenceHistory(
  input: ReplayEvolutionInput,
  strategyEvolution: readonly ReplayStrategyEvolutionRecord[],
  survivabilityOptimization: readonly ReplaySurvivabilityOptimizationRecord[],
): readonly ReplayEvolutionConvergenceRecord[] {
  return deepFreeze(strategyEvolution.map((record) => {
    const optimization = required(survivabilityOptimization.find((item) => item.replay_hash === record.replay_hash), "survivability optimization missing");
    const adapted = roundEvolutionNumber(Math.max(0, Math.min(1,
      record.convergence_score + (optimization.optimization_delta * 0.42) + (record.action === "promote_generation" ? 0.06 : 0),
    )));
    const seed = {
      run_id: input.run_id,
      replay_hash: record.replay_hash,
      generation_ordinal: record.generation_ordinal,
      previous_convergence_score: record.convergence_score,
      adapted_convergence_score: adapted,
      convergence_delta: roundEvolutionNumber(adapted - record.convergence_score),
      state: adapted >= (input.promotion_threshold ?? DEFAULT_PROMOTION_THRESHOLD) ? "promoted" as ReplayEvolutionState : record.to_state,
    };
    const convergenceHash = computeReplayEvolutionDeterministicHash(seed);
    return {
      convergence_id: `replay-evolution-convergence:${convergenceHash}`,
      ...seed,
      convergence_hash: convergenceHash,
    };
  }));
}

function buildAdaptiveGenerations(
  input: ReplayEvolutionInput,
  strategyEvolution: readonly ReplayStrategyEvolutionRecord[],
  mutationLineage: readonly ReplayIntelligenceMutationRecord[],
  convergenceHistory: readonly ReplayEvolutionConvergenceRecord[],
): readonly ReplayAdaptiveGeneration[] {
  const byGeneration = new Map<number, readonly ReplayStrategyEvolutionRecord[]>();
  for (const record of strategyEvolution) {
    byGeneration.set(record.generation_ordinal, [...(byGeneration.get(record.generation_ordinal) ?? []), record]);
  }

  return deepFreeze(Array.from(byGeneration.entries()).sort(([left], [right]) => left - right).map(([ordinal, records]) => {
    const replayHashes = records.map((record) => record.replay_hash).sort((left, right) => left.localeCompare(right));
    const convergenceScore = roundEvolutionNumber(average(replayHashes.map((replayHash) =>
      convergenceHistory.find((record) => record.replay_hash === replayHash)?.adapted_convergence_score ?? 0,
    )));
    const promoted = convergenceScore >= (input.promotion_threshold ?? DEFAULT_PROMOTION_THRESHOLD);
    const state: ReplayEvolutionState = promoted
      ? "promoted"
      : records.some((record) => record.to_state === "divergent" || record.to_state === "deprecated")
        ? "divergent"
        : "evolving";
    const seed = {
      run_id: input.run_id,
      generation_ordinal: ordinal,
      replay_hashes: replayHashes,
      strategy_hashes: records.map((record) => record.strategy_hash).sort((left, right) => left.localeCompare(right)),
      mutation_hashes: mutationLineage
        .filter((record) => replayHashes.includes(record.replay_hash))
        .map((record) => record.mutation_hash)
        .sort((left, right) => left.localeCompare(right)),
      convergence_score: convergenceScore,
      promoted,
      state,
    };
    const generationHash = computeReplayEvolutionDeterministicHash(seed);
    return {
      generation_id: `replay-adaptive-generation:${generationHash}`,
      ...seed,
      generation_hash: generationHash,
    };
  }));
}

function buildValidatorProfiles(
  input: ReplayEvolutionInput,
  mutationLineage: readonly ReplayIntelligenceMutationRecord[],
  adaptiveGenerations: readonly ReplayAdaptiveGeneration[],
): readonly ReplayValidatorEvolutionProfile[] {
  return deepFreeze(input.consensus_intelligence.validator_profiles.map((profile) => {
    const mutations = mutationLineage.filter((record) => record.validator_id === profile.validator_id);
    const replayHashes = [...profile.replay_hashes].sort((left, right) => left.localeCompare(right));
    const governance = input.governance_snapshot.validator_profiles.find((item) => item.validator_id === profile.validator_id);
    const promotedGenerationCount = adaptiveGenerations.filter((generation) =>
      generation.promoted && generation.replay_hashes.some((replayHash) => replayHashes.includes(replayHash)),
    ).length;
    const seed = {
      run_id: input.run_id,
      validator_id: profile.validator_id,
      replay_hashes: replayHashes,
      base_evolution_score: profile.evolution_score,
      mutation_count: mutations.length,
      average_mutation_delta: roundEvolutionNumber(average(mutations.map((mutation) => mutation.mutation_delta))),
      survivability_alignment: profile.survivability_alignment,
      governance_action: governance?.recommended_action ?? null,
      promoted_generation_count: promotedGenerationCount,
    };
    const profileHash = computeReplayEvolutionDeterministicHash(seed);
    return {
      profile_id: `replay-validator-evolution:${profileHash}`,
      ...seed,
      profile_hash: profileHash,
    };
  }).sort((left, right) =>
    left.validator_id.localeCompare(right.validator_id) ||
    left.profile_hash.localeCompare(right.profile_hash),
  ));
}

function buildLineage(input: ReplayEvolutionInput): readonly ReplayOptimizationLineageReference[] {
  const replayHashes = collectReplayHashes(input);
  const sourceReferences: readonly Omit<ReplayOptimizationLineageReference, "reference_id" | "reference_hash" | "replay_hash">[] = [
    { run_id: input.run_id, source_hash: input.consensus_intelligence.deterministic_hash, reference_kind: "consensus_intelligence" },
    { run_id: input.run_id, source_hash: input.memory_snapshot.deterministic_hash, reference_kind: "memory" },
    { run_id: input.run_id, source_hash: input.governance_snapshot.deterministic_hash, reference_kind: "governance" },
    { run_id: input.run_id, source_hash: input.orchestration_persistence.deterministic_hash, reference_kind: "orchestration_persistence" },
    { run_id: input.run_id, source_hash: input.lineage_snapshot.graph_hash, reference_kind: "lineage_graph" },
    { run_id: input.run_id, source_hash: input.self_healing_snapshot.deterministic_hash, reference_kind: "self_healing" },
  ];

  return deepFreeze(replayHashes.flatMap((replayHash) => sourceReferences.map((source) => {
    const seed = { ...source, replay_hash: replayHash };
    const referenceHash = computeReplayEvolutionDeterministicHash(seed);
    return {
      reference_id: `replay-evolution-lineage:${referenceHash}`,
      ...seed,
      reference_hash: referenceHash,
    };
  })).sort((left, right) =>
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.reference_kind.localeCompare(right.reference_kind),
  ));
}

function buildEpochs(
  input: ReplayEvolutionInput,
  adaptiveGenerations: readonly ReplayAdaptiveGeneration[],
  strategyEvolution: readonly ReplayStrategyEvolutionRecord[],
): readonly ReplayEvolutionEpoch[] {
  return deepFreeze(adaptiveGenerations.map((generation) => {
    const evolutionHashes = strategyEvolution
      .filter((record) => record.generation_ordinal === generation.generation_ordinal)
      .map((record) => record.strategy_hash)
      .sort((left, right) => left.localeCompare(right));
    const seed = {
      run_id: input.run_id,
      generation_ordinals: [generation.generation_ordinal],
      replay_hashes: generation.replay_hashes,
      evolution_hashes: evolutionHashes,
      promoted: generation.promoted,
      frozen: true,
      frozen_at: input.persisted_at,
    };
    const epochHash = computeReplayEvolutionDeterministicHash(seed);
    return {
      epoch_id: `replay-evolution-epoch:${epochHash}`,
      ...seed,
      epoch_hash: epochHash,
    };
  }));
}

function buildSnapshotReference(input: ReplayEvolutionInput): ReplayEvolutionSnapshotReference {
  const seed = {
    consensus_intelligence_hash: input.consensus_intelligence.deterministic_hash,
    memory_snapshot_hash: input.memory_snapshot.deterministic_hash,
    governance_snapshot_hash: input.governance_snapshot.deterministic_hash,
    orchestration_persistence_hash: input.orchestration_persistence.deterministic_hash,
    lineage_graph_hash: input.lineage_snapshot.graph_hash,
    self_healing_hash: input.self_healing_snapshot.deterministic_hash,
  };
  return deepFreeze({
    ...seed,
    reference_hash: computeReplayEvolutionDeterministicHash(seed),
  });
}

function persistReplayEvolutionSnapshot(db: SqliteDatabase, snapshot: ReplayEvolutionSnapshot): void {
  const write = db.transaction(() => {
    db.prepare(`
      INSERT OR REPLACE INTO replay_evolution_snapshots
      (evolution_id, run_id, generated_at, persisted_at, state, deterministic_hash, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      snapshot.evolution_id,
      snapshot.run_id,
      snapshot.generated_at,
      snapshot.persisted_at,
      snapshot.state,
      snapshot.deterministic_hash,
      stableReplayEvolutionStringify(snapshot),
    );

    for (const record of snapshot.strategy_evolution) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_evolution_strategy
        (evolution_id, run_id, replay_hash, generation_ordinal, to_state, action, strategy_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(record.evolution_id, snapshot.run_id, record.replay_hash, record.generation_ordinal, record.to_state, record.action, record.strategy_hash, stableReplayEvolutionStringify(record));
    }

    for (const generation of snapshot.adaptive_generations) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_evolution_generations
        (generation_id, run_id, generation_ordinal, promoted, generation_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(generation.generation_id, snapshot.run_id, generation.generation_ordinal, generation.promoted ? 1 : 0, generation.generation_hash, stableReplayEvolutionStringify(generation));
    }

    for (const mutation of snapshot.mutation_lineage) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_evolution_mutations
        (mutation_id, run_id, replay_hash, validator_id, mutation_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(mutation.mutation_id, snapshot.run_id, mutation.replay_hash, mutation.validator_id, mutation.mutation_hash, stableReplayEvolutionStringify(mutation));
    }

    for (const optimization of snapshot.survivability_optimization) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_evolution_survivability
        (optimization_id, run_id, replay_hash, optimization_hash, payload)
        VALUES (?, ?, ?, ?, ?)
      `).run(optimization.optimization_id, snapshot.run_id, optimization.replay_hash, optimization.optimization_hash, stableReplayEvolutionStringify(optimization));
    }

    for (const profile of snapshot.validator_profiles) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_evolution_validator_profiles
        (profile_id, run_id, validator_id, profile_hash, payload)
        VALUES (?, ?, ?, ?, ?)
      `).run(profile.profile_id, snapshot.run_id, profile.validator_id, profile.profile_hash, stableReplayEvolutionStringify(profile));
    }

    for (const convergence of snapshot.convergence_history) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_evolution_convergence
        (convergence_id, run_id, replay_hash, generation_ordinal, convergence_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(convergence.convergence_id, snapshot.run_id, convergence.replay_hash, convergence.generation_ordinal, convergence.convergence_hash, stableReplayEvolutionStringify(convergence));
    }

    for (const reference of snapshot.lineage) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_evolution_lineage
        (reference_id, run_id, replay_hash, reference_kind, reference_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(reference.reference_id, snapshot.run_id, reference.replay_hash, reference.reference_kind, reference.reference_hash, stableReplayEvolutionStringify(reference));
    }

    for (const epoch of snapshot.epochs) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_evolution_epochs
        (epoch_id, run_id, promoted, frozen, epoch_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(epoch.epoch_id, snapshot.run_id, epoch.promoted ? 1 : 0, epoch.frozen ? 1 : 0, epoch.epoch_hash, stableReplayEvolutionStringify(epoch));
    }
  });

  write();
}

function collectReplayHashes(input: ReplayEvolutionInput): readonly string[] {
  return Array.from(new Set([
    ...input.consensus_intelligence.synthesis.map((item) => item.replay_hash),
    ...input.memory_snapshot.temporal_indexes.map((item) => item.replay_hash),
    ...input.governance_snapshot.decisions.map((item) => item.replay_hash),
    ...input.self_healing_snapshot.decisions.map((item) => item.replay_hash),
  ])).sort((left, right) => left.localeCompare(right));
}

function generationOrdinal(index: number, generationSize: number | undefined): number {
  return Math.floor(index / (generationSize ?? DEFAULT_GENERATION_SIZE)) + 1;
}

function stateForReplay(
  convergenceScore: number,
  survivabilityScore: number,
  governanceAction: string | null,
  promotionThreshold: number,
  survivabilityFloor: number,
): ReplayEvolutionState {
  if (governanceAction === "reject_branch" || governanceAction === "quarantine_branch") return "deprecated";
  if (survivabilityScore < survivabilityFloor) return "divergent";
  if (convergenceScore >= promotionThreshold) return "promoted";
  if (convergenceScore >= 0.68) return "stabilized";
  if (convergenceScore >= 0.48) return "evolving";
  return "adapting";
}

function actionForReplay(
  state: ReplayEvolutionState,
  convergenceScore: number,
  survivabilityScore: number,
  promotionThreshold: number,
  survivabilityFloor: number,
): ReplayEvolutionAction {
  if (state === "deprecated") return "deprecate_branch";
  if (state === "divergent") return "reconcile_mutation";
  if (survivabilityScore < survivabilityFloor + 0.08) return "optimize_survivability";
  if (convergenceScore >= promotionThreshold) return "promote_generation";
  if (state === "stabilized") return "promote_adaptive_cycle";
  return "evolve_strategy";
}

function classifyEvolutionState(
  strategyEvolution: readonly ReplayStrategyEvolutionRecord[],
  adaptiveGenerations: readonly ReplayAdaptiveGeneration[],
): ReplayEvolutionState {
  if (strategyEvolution.some((record) => record.to_state === "deprecated")) return "deprecated";
  if (strategyEvolution.some((record) => record.to_state === "divergent")) return "divergent";
  if (adaptiveGenerations.length > 0 && adaptiveGenerations.every((generation) => generation.promoted)) return "promoted";
  if (strategyEvolution.some((record) => record.to_state === "stabilized")) return "stabilized";
  if (strategyEvolution.some((record) => record.to_state === "evolving")) return "evolving";
  return "adapting";
}

function memoryStateToEvolutionState(state: string): ReplayEvolutionState {
  switch (state) {
    case "stabilized":
    case "reconciled":
      return "stabilized";
    case "deprecated":
    case "quarantined":
      return "deprecated";
    case "archived":
      return "promoted";
    case "active":
    default:
      return "adapting";
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

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundEvolutionNumber(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function stableReplayEvolutionStringify(value: unknown): string {
  return JSON.stringify(sortReplayEvolutionKeys(value));
}

function sortReplayEvolutionKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortReplayEvolutionKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortReplayEvolutionKeys((value as Record<string, unknown>)[key]);
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
