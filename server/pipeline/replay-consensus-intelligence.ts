import crypto from "node:crypto";

import type Database from "better-sqlite3";

import type {
  ReplayGovernanceValidatorProfile,
} from "./replay-governance-contract";
import {
  initializeReplayOrchestrationPersistenceSchema,
} from "./replay-orchestration-persistence";
import type {
  ReplayConsensusIntelligenceAction,
  ReplayConsensusIntelligenceInput,
  ReplayConsensusIntelligenceQuery,
  ReplayConsensusIntelligenceSnapshot,
  ReplayConsensusIntelligenceSnapshotReference,
  ReplayConsensusIntelligenceState,
  ReplayConsensusIntelligenceSynthesis,
  ReplayIntelligenceConvergenceRecord,
  ReplayIntelligenceEpoch,
  ReplayIntelligenceLineageReference,
  ReplayIntelligencePropagationRecord,
  ReplayIntelligenceQuorumRecord,
  ReplayIntelligenceSurvivabilityForecast,
  ReplayValidatorIntelligenceProfile,
} from "./replay-consensus-intelligence-contract";

type SqliteDatabase = Database.Database;

interface PayloadRow {
  readonly payload: string;
}

const DEFAULT_QUORUM_THRESHOLD = 0.66;
const DEFAULT_PROMOTION_THRESHOLD = 0.74;
const DEFAULT_SURVIVABILITY_FLOOR = 0.62;

const SUPPORTED_ACTIONS: readonly ReplayConsensusIntelligenceAction[] = [
  "synthesize_consensus",
  "rebalance_validator_weight",
  "propagate_intelligence",
  "reconcile_divergence",
  "promote_intelligence_epoch",
  "quarantine_intelligence_branch",
  "forecast_survivability",
  "freeze_intelligence_epoch",
];

const SUPPORTED_QUERIES: readonly ReplayConsensusIntelligenceQuery[] = [
  "get_intelligence_convergence_history",
  "get_validator_intelligence_profile",
  "get_survivability_forecasts",
  "get_intelligence_lineage",
  "get_convergence_evolution_history",
  "get_intelligence_quorum_history",
  "get_distributed_intelligence_epochs",
];

export function initializeReplayConsensusIntelligenceSchema(db: SqliteDatabase): void {
  initializeReplayOrchestrationPersistenceSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS replay_consensus_intelligence_snapshots (
      intelligence_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      state TEXT NOT NULL,
      deterministic_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_consensus_intelligence_snapshots_run
      ON replay_consensus_intelligence_snapshots(run_id, generated_at DESC, intelligence_id DESC);

    CREATE TABLE IF NOT EXISTS replay_consensus_intelligence_profiles (
      profile_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      validator_id TEXT NOT NULL,
      adaptive_weight REAL NOT NULL,
      evolution_score REAL NOT NULL,
      profile_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_consensus_intelligence_profiles_validator
      ON replay_consensus_intelligence_profiles(validator_id, run_id);

    CREATE TABLE IF NOT EXISTS replay_consensus_intelligence_synthesis (
      synthesis_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      state TEXT NOT NULL,
      action TEXT NOT NULL,
      convergence_score REAL NOT NULL,
      synthesis_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_consensus_intelligence_synthesis_replay
      ON replay_consensus_intelligence_synthesis(run_id, replay_hash, synthesis_id);

    CREATE TABLE IF NOT EXISTS replay_consensus_intelligence_convergence (
      convergence_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      to_state TEXT NOT NULL,
      convergence_score REAL NOT NULL,
      convergence_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_consensus_intelligence_convergence_replay
      ON replay_consensus_intelligence_convergence(run_id, replay_hash, convergence_id);

    CREATE TABLE IF NOT EXISTS replay_consensus_intelligence_quorum (
      quorum_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      quorum_met INTEGER NOT NULL,
      quorum_ratio REAL NOT NULL,
      quorum_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_consensus_intelligence_quorum_replay
      ON replay_consensus_intelligence_quorum(run_id, replay_hash, quorum_id);

    CREATE TABLE IF NOT EXISTS replay_consensus_intelligence_forecasts (
      forecast_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      survivability_score REAL NOT NULL,
      forecast_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_consensus_intelligence_forecasts_replay
      ON replay_consensus_intelligence_forecasts(run_id, replay_hash, forecast_id);

    CREATE TABLE IF NOT EXISTS replay_consensus_intelligence_lineage (
      reference_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      reference_kind TEXT NOT NULL,
      reference_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_consensus_intelligence_lineage_replay
      ON replay_consensus_intelligence_lineage(run_id, replay_hash, reference_kind);

    CREATE TABLE IF NOT EXISTS replay_consensus_intelligence_epochs (
      epoch_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      promoted INTEGER NOT NULL,
      frozen INTEGER NOT NULL,
      epoch_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);
}

export function buildReplayConsensusIntelligenceSnapshot(
  db: SqliteDatabase,
  input: ReplayConsensusIntelligenceInput,
): ReplayConsensusIntelligenceSnapshot {
  initializeReplayConsensusIntelligenceSchema(db);

  const validatorProfiles = buildValidatorProfiles(input);
  const quorumHistory = buildQuorumHistory(input, validatorProfiles);
  const synthesis = buildSynthesis(input, validatorProfiles, quorumHistory);
  const convergenceHistory = buildConvergenceHistory(input, synthesis);
  const survivabilityForecasts = buildSurvivabilityForecasts(input, synthesis);
  const propagation = buildPropagation(input, synthesis);
  const lineage = buildLineage(input);
  const epochs = buildEpochs(input, synthesis);
  const snapshots = buildSnapshotReference(input);
  const state = classifySnapshotState(synthesis, survivabilityForecasts);
  const seed = {
    run_id: input.run_id,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    validator_profile_hashes: validatorProfiles.map((profile) => profile.profile_hash),
    synthesis_hashes: synthesis.map((item) => item.synthesis_hash),
    convergence_hashes: convergenceHistory.map((record) => record.convergence_hash),
    quorum_hashes: quorumHistory.map((record) => record.quorum_hash),
    forecast_hashes: survivabilityForecasts.map((forecast) => forecast.forecast_hash),
    propagation_hashes: propagation.map((record) => record.propagation_hash),
    lineage_hashes: lineage.map((reference) => reference.reference_hash),
    epoch_hashes: epochs.map((epoch) => epoch.epoch_hash),
    snapshot_reference_hash: snapshots.reference_hash,
  };
  const deterministicHash = computeReplayConsensusIntelligenceDeterministicHash(seed);
  const snapshot = deepFreeze({
    intelligence_id: `replay-consensus-intelligence:${deterministicHash}`,
    run_id: input.run_id,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    validator_profiles: validatorProfiles,
    synthesis,
    convergence_history: convergenceHistory,
    convergence_evolution: convergenceHistory,
    quorum_history: quorumHistory,
    survivability_forecasts: survivabilityForecasts,
    propagation,
    lineage,
    epochs,
    snapshots,
    supported_actions: SUPPORTED_ACTIONS,
    supported_queries: SUPPORTED_QUERIES,
    deterministic_hash: deterministicHash,
  });

  persistReplayConsensusIntelligenceSnapshot(db, snapshot);
  return snapshot;
}

export function getIntelligenceConvergenceHistory(
  db: SqliteDatabase,
  runId: string,
  replayHash?: string,
): readonly ReplayIntelligenceConvergenceRecord[] {
  initializeReplayConsensusIntelligenceSchema(db);
  const rows = replayHash
    ? db.prepare(`
      SELECT payload FROM replay_consensus_intelligence_convergence
      WHERE run_id = ? AND replay_hash = ?
      ORDER BY replay_hash ASC, convergence_id ASC
    `).all(runId, replayHash) as PayloadRow[]
    : db.prepare(`
      SELECT payload FROM replay_consensus_intelligence_convergence
      WHERE run_id = ?
      ORDER BY replay_hash ASC, convergence_id ASC
    `).all(runId) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayIntelligenceConvergenceRecord));
}

export function getValidatorIntelligenceProfile(
  db: SqliteDatabase,
  validatorId: string,
): ReplayValidatorIntelligenceProfile | null {
  initializeReplayConsensusIntelligenceSchema(db);
  const row = db.prepare(`
    SELECT payload FROM replay_consensus_intelligence_profiles
    WHERE validator_id = ?
    ORDER BY run_id DESC, profile_id DESC
    LIMIT 1
  `).get(validatorId) as PayloadRow | undefined;
  return row ? deepFreeze(JSON.parse(row.payload) as ReplayValidatorIntelligenceProfile) : null;
}

export function getSurvivabilityForecasts(
  db: SqliteDatabase,
  runId: string,
): readonly ReplayIntelligenceSurvivabilityForecast[] {
  initializeReplayConsensusIntelligenceSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_consensus_intelligence_forecasts
    WHERE run_id = ?
    ORDER BY replay_hash ASC, forecast_id ASC
  `).all(runId) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayIntelligenceSurvivabilityForecast));
}

export function getIntelligenceLineage(
  db: SqliteDatabase,
  runId: string,
  replayHash?: string,
): readonly ReplayIntelligenceLineageReference[] {
  initializeReplayConsensusIntelligenceSchema(db);
  const rows = replayHash
    ? db.prepare(`
      SELECT payload FROM replay_consensus_intelligence_lineage
      WHERE run_id = ? AND replay_hash = ?
      ORDER BY reference_kind ASC, reference_hash ASC
    `).all(runId, replayHash) as PayloadRow[]
    : db.prepare(`
      SELECT payload FROM replay_consensus_intelligence_lineage
      WHERE run_id = ?
      ORDER BY replay_hash ASC, reference_kind ASC, reference_hash ASC
    `).all(runId) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayIntelligenceLineageReference));
}

export function getConvergenceEvolutionHistory(
  db: SqliteDatabase,
  runId: string,
): readonly ReplayIntelligenceConvergenceRecord[] {
  return getIntelligenceConvergenceHistory(db, runId);
}

export function getIntelligenceQuorumHistory(
  db: SqliteDatabase,
  runId: string,
): readonly ReplayIntelligenceQuorumRecord[] {
  initializeReplayConsensusIntelligenceSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_consensus_intelligence_quorum
    WHERE run_id = ?
    ORDER BY replay_hash ASC, quorum_id ASC
  `).all(runId) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayIntelligenceQuorumRecord));
}

export function getDistributedIntelligenceEpochs(
  db: SqliteDatabase,
  runId: string,
): readonly ReplayIntelligenceEpoch[] {
  initializeReplayConsensusIntelligenceSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_consensus_intelligence_epochs
    WHERE run_id = ?
    ORDER BY epoch_id ASC
  `).all(runId) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayIntelligenceEpoch));
}

export function serializeReplayConsensusIntelligenceSnapshot(
  snapshot: ReplayConsensusIntelligenceSnapshot,
): string {
  return stableConsensusIntelligenceStringify(snapshot);
}

export function computeReplayConsensusIntelligenceDeterministicHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableConsensusIntelligenceStringify(value))
    .digest("hex");
}

function buildValidatorProfiles(
  input: ReplayConsensusIntelligenceInput,
): readonly ReplayValidatorIntelligenceProfile[] {
  return deepFreeze(input.governance_snapshot.validator_profiles.map((profile) => {
    const divergence = divergencePenalty(input, profile);
    const survivabilityAlignment = averageSurvivability(input, profile.replay_hashes);
    const baseTrustScore = normalizedTrust(profile);
    const evolutionScore = roundConsensusIntelligenceNumber(Math.max(0, Math.min(1,
      (baseTrustScore * 0.48) + (survivabilityAlignment * 0.38) - (divergence * 0.24) + participationBonus(profile),
    )));
    const adaptiveWeight = roundConsensusIntelligenceNumber(Math.max(0.05, Math.min(2,
      profile.average_weight * (0.65 + evolutionScore) * (1 - Math.min(0.55, divergence)),
    )));
    const recommendedAction: ReplayConsensusIntelligenceAction = profile.recommended_action === "reduce_validator_weight" || divergence >= 0.45
      ? "rebalance_validator_weight"
      : survivabilityAlignment < (input.survivability_floor ?? DEFAULT_SURVIVABILITY_FLOOR)
        ? "forecast_survivability"
        : "synthesize_consensus";
    const seed = {
      run_id: input.run_id,
      validator_id: profile.validator_id,
      replay_hashes: [...profile.replay_hashes].sort((left, right) => left.localeCompare(right)),
      base_trust_score: baseTrustScore,
      adaptive_weight: adaptiveWeight,
      evolution_score: evolutionScore,
      divergence_penalty: divergence,
      survivability_alignment: survivabilityAlignment,
      recommended_action: recommendedAction,
      governance_action: profile.recommended_action,
    };
    const profileHash = computeReplayConsensusIntelligenceDeterministicHash(seed);
    return {
      profile_id: `replay-validator-intelligence:${profileHash}`,
      ...seed,
      profile_hash: profileHash,
    };
  }).sort((left, right) =>
    left.validator_id.localeCompare(right.validator_id) ||
    left.profile_hash.localeCompare(right.profile_hash),
  ));
}

function buildQuorumHistory(
  input: ReplayConsensusIntelligenceInput,
  profiles: readonly ReplayValidatorIntelligenceProfile[],
): readonly ReplayIntelligenceQuorumRecord[] {
  const threshold = input.quorum_threshold ?? DEFAULT_QUORUM_THRESHOLD;
  return deepFreeze(collectReplayHashes(input).map((replayHash) => {
    const participating = profiles.filter((profile) => profile.replay_hashes.includes(replayHash));
    const totalWeight = roundConsensusIntelligenceNumber(profiles.reduce((sum, profile) => sum + profile.adaptive_weight, 0));
    const participatingWeight = roundConsensusIntelligenceNumber(participating.reduce((sum, profile) => sum + profile.adaptive_weight, 0));
    const quorumRatio = roundConsensusIntelligenceNumber(totalWeight === 0 ? 0 : participatingWeight / totalWeight);
    const session = input.coordination_mesh.sessions.find((item) => item.replay_hash === replayHash);
    const seed = {
      replay_hash: replayHash,
      required_ratio: threshold,
      participating_weight: participatingWeight,
      total_weight: totalWeight,
      quorum_ratio: quorumRatio,
      quorum_met: quorumRatio >= threshold || Boolean(session?.quorum.quorum_met),
      mesh_session_hash: session?.session_hash ?? null,
    };
    const quorumHash = computeReplayConsensusIntelligenceDeterministicHash(seed);
    return {
      quorum_id: `replay-intelligence-quorum:${quorumHash}`,
      ...seed,
      quorum_hash: quorumHash,
    };
  }));
}

function buildSynthesis(
  input: ReplayConsensusIntelligenceInput,
  profiles: readonly ReplayValidatorIntelligenceProfile[],
  quorumHistory: readonly ReplayIntelligenceQuorumRecord[],
): readonly ReplayConsensusIntelligenceSynthesis[] {
  return deepFreeze(collectReplayHashes(input).map((replayHash) => {
    const replayProfiles = profiles.filter((profile) => profile.replay_hashes.includes(replayHash));
    const quorum = required(quorumHistory.find((record) => record.replay_hash === replayHash), "intelligence quorum missing");
    const latestDivergence = latestForReplay(input.memory_snapshot.divergence_evolution, replayHash);
    const healingDecision = input.self_healing_snapshot.decisions.find((decision) => decision.replay_hash === replayHash);
    const survivability = input.self_healing_snapshot.survivability_trends.find((trend) => trend.replay_hash === replayHash);
    const weightedEvolution = weightedAverage(replayProfiles, (profile) => profile.evolution_score);
    const degradation = latestDivergence?.divergence_score ?? 0;
    const convergenceScore = roundConsensusIntelligenceNumber(Math.max(0, Math.min(1,
      (weightedEvolution * 0.52) + ((survivability?.survivability_score ?? 0.5) * 0.36) + (quorum.quorum_met ? 0.12 : 0) - (degradation * 0.32),
    )));
    const state = stateForSynthesis(convergenceScore, quorum.quorum_met, healingDecision?.state ?? null);
    const action = actionForSynthesis(state, convergenceScore, input.promotion_threshold ?? DEFAULT_PROMOTION_THRESHOLD);
    const seed = {
      replay_hash: replayHash,
      state,
      action,
      validator_profile_hashes: replayProfiles.map((profile) => profile.profile_hash),
      synthesized_confidence: roundConsensusIntelligenceNumber(weightedEvolution),
      convergence_score: convergenceScore,
      quorum_met: quorum.quorum_met,
    };
    const synthesisHash = computeReplayConsensusIntelligenceDeterministicHash(seed);
    return {
      synthesis_id: `replay-intelligence-synthesis:${synthesisHash}`,
      ...seed,
      synthesis_hash: synthesisHash,
    };
  }));
}

function buildConvergenceHistory(
  input: ReplayConsensusIntelligenceInput,
  synthesis: readonly ReplayConsensusIntelligenceSynthesis[],
): readonly ReplayIntelligenceConvergenceRecord[] {
  return deepFreeze(synthesis.map((item) => {
    const previous = latestForReplay(input.memory_snapshot.replay_evolution, item.replay_hash);
    const sourceDecision = input.self_healing_snapshot.decisions.find((decision) => decision.replay_hash === item.replay_hash);
    const fromState = previous ? memoryStateToIntelligenceState(previous.to_state) : null;
    const previousScore = input.memory_snapshot.divergence_evolution
      .filter((entry) => entry.replay_hash === item.replay_hash)
      .sort((left, right) => left.temporal_ordinal - right.temporal_ordinal)[0]?.divergence_score ?? 0;
    const seed = {
      replay_hash: item.replay_hash,
      from_state: fromState,
      to_state: item.state,
      convergence_score: item.convergence_score,
      evolution_delta: roundConsensusIntelligenceNumber(item.convergence_score - (1 - previousScore)),
      source_healing_action: sourceDecision?.action ?? null,
    };
    const convergenceHash = computeReplayConsensusIntelligenceDeterministicHash(seed);
    return {
      convergence_id: `replay-intelligence-convergence:${convergenceHash}`,
      ...seed,
      convergence_hash: convergenceHash,
    };
  }));
}

function buildSurvivabilityForecasts(
  input: ReplayConsensusIntelligenceInput,
  synthesis: readonly ReplayConsensusIntelligenceSynthesis[],
): readonly ReplayIntelligenceSurvivabilityForecast[] {
  return deepFreeze(synthesis.map((item) => {
    const trend = input.self_healing_snapshot.survivability_trends.find((entry) => entry.replay_hash === item.replay_hash);
    const degradation = input.self_healing_snapshot.degradation_history.find((entry) => entry.replay_hash === item.replay_hash);
    const degradationRisk = roundConsensusIntelligenceNumber(Math.max(degradation?.degradation_score ?? 0, 1 - item.convergence_score));
    const survivabilityScore = roundConsensusIntelligenceNumber(Math.max(0, Math.min(1,
      ((trend?.survivability_score ?? 0.5) * 0.64) + (item.convergence_score * 0.36) - (degradationRisk * 0.18),
    )));
    const recommendedAction: ReplayConsensusIntelligenceAction = survivabilityScore < (input.survivability_floor ?? DEFAULT_SURVIVABILITY_FLOOR)
      ? "quarantine_intelligence_branch"
      : item.convergence_score >= (input.promotion_threshold ?? DEFAULT_PROMOTION_THRESHOLD)
        ? "promote_intelligence_epoch"
        : "forecast_survivability";
    const seed = {
      replay_hash: item.replay_hash,
      survivability_score: survivabilityScore,
      convergence_score: item.convergence_score,
      degradation_risk: degradationRisk,
      forecast_horizon: item.state === "stabilized" ? "multi_epoch" as const : "next_epoch" as const,
      recommended_action: recommendedAction,
    };
    const forecastHash = computeReplayConsensusIntelligenceDeterministicHash(seed);
    return {
      forecast_id: `replay-intelligence-forecast:${forecastHash}`,
      ...seed,
      forecast_hash: forecastHash,
    };
  }));
}

function buildPropagation(
  input: ReplayConsensusIntelligenceInput,
  synthesis: readonly ReplayConsensusIntelligenceSynthesis[],
): readonly ReplayIntelligencePropagationRecord[] {
  return deepFreeze(synthesis.map((item) => {
    const session = input.coordination_mesh.sessions.find((candidate) => candidate.replay_hash === item.replay_hash);
    const deterministicOrder = (session?.route.route_path ?? input.coordination_mesh.topology.nodes.map((node) => node.mesh_node_id))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
    const seed = {
      replay_hash: item.replay_hash,
      from_mesh_node_id: session?.route.primary_mesh_node_id ?? null,
      to_mesh_node_ids: [...(session?.route.relay_mesh_node_ids ?? [])].sort((left, right) => left.localeCompare(right)),
      propagated_hash: item.synthesis_hash,
      deterministic_order: deterministicOrder,
    };
    const propagationHash = computeReplayConsensusIntelligenceDeterministicHash(seed);
    return {
      propagation_id: `replay-intelligence-propagation:${propagationHash}`,
      ...seed,
      propagation_hash: propagationHash,
    };
  }));
}

function buildLineage(input: ReplayConsensusIntelligenceInput): readonly ReplayIntelligenceLineageReference[] {
  const references: ReplayIntelligenceLineageReference[] = [];
  const push = (
    replayHash: string,
    sourceHash: string,
    referenceKind: ReplayIntelligenceLineageReference["reference_kind"],
  ) => {
    const seed = { replay_hash: replayHash, source_hash: sourceHash, reference_kind: referenceKind };
    const referenceHash = computeReplayConsensusIntelligenceDeterministicHash(seed);
    references.push({
      reference_id: `replay-intelligence-lineage:${referenceHash}`,
      ...seed,
      reference_hash: referenceHash,
    });
  };

  for (const decision of input.self_healing_snapshot.decisions) push(decision.replay_hash, decision.deterministic_hash, "self_healing");
  for (const session of input.coordination_mesh.sessions) push(session.replay_hash, session.session_hash, "coordination_mesh");
  for (const decision of input.governance_snapshot.decisions) push(decision.replay_hash, decision.deterministic_hash, "governance");
  for (const record of input.orchestration_persistence.records) push(record.replay_hash, record.persistence_hash, "orchestration_persistence");
  for (const node of input.lineage_snapshot.nodes) push(node.replay_hash, node.node_hash, "lineage_graph");
  for (const index of input.memory_snapshot.temporal_indexes) push(index.replay_hash, index.temporal_hash, "memory");

  return deepFreeze([...dedupeBy(references, (reference) => reference.reference_id)]
    .sort((left, right) =>
      left.replay_hash.localeCompare(right.replay_hash) ||
      left.reference_kind.localeCompare(right.reference_kind) ||
      left.reference_hash.localeCompare(right.reference_hash),
    ));
}

function buildEpochs(
  input: ReplayConsensusIntelligenceInput,
  synthesis: readonly ReplayConsensusIntelligenceSynthesis[],
): readonly ReplayIntelligenceEpoch[] {
  const promoted = synthesis.length > 0 &&
    synthesis.every((item) => item.quorum_met && item.convergence_score >= (input.promotion_threshold ?? DEFAULT_PROMOTION_THRESHOLD));
  const seed = {
    run_id: input.run_id,
    replay_hashes: synthesis.map((item) => item.replay_hash).sort((left, right) => left.localeCompare(right)),
    synthesis_hashes: synthesis.map((item) => item.synthesis_hash),
    promoted,
    frozen: true,
    promoted_at: promoted ? input.generated_at : null,
    frozen_at: input.generated_at,
  };
  const epochHash = computeReplayConsensusIntelligenceDeterministicHash(seed);
  return deepFreeze([{
    epoch_id: `replay-intelligence-epoch:${epochHash}`,
    ...seed,
    epoch_hash: epochHash,
  }]);
}

function buildSnapshotReference(input: ReplayConsensusIntelligenceInput): ReplayConsensusIntelligenceSnapshotReference {
  const seed = {
    self_healing_hash: input.self_healing_snapshot.deterministic_hash,
    coordination_mesh_hash: input.coordination_mesh.deterministic_hash,
    governance_snapshot_hash: input.governance_snapshot.deterministic_hash,
    orchestration_persistence_hash: input.orchestration_persistence.deterministic_hash,
    lineage_graph_hash: input.lineage_snapshot.graph_hash,
    memory_snapshot_hash: input.memory_snapshot.deterministic_hash,
  };
  return deepFreeze({
    ...seed,
    reference_hash: computeReplayConsensusIntelligenceDeterministicHash(seed),
  });
}

function persistReplayConsensusIntelligenceSnapshot(
  db: SqliteDatabase,
  snapshot: ReplayConsensusIntelligenceSnapshot,
): void {
  const write = db.transaction(() => {
    db.prepare(`
      INSERT OR REPLACE INTO replay_consensus_intelligence_snapshots
      (intelligence_id, run_id, generated_at, persisted_at, state, deterministic_hash, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(snapshot.intelligence_id, snapshot.run_id, snapshot.generated_at, snapshot.persisted_at, snapshot.state, snapshot.deterministic_hash, stableConsensusIntelligenceStringify(snapshot));

    for (const profile of snapshot.validator_profiles) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_consensus_intelligence_profiles
        (profile_id, run_id, validator_id, adaptive_weight, evolution_score, profile_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(profile.profile_id, snapshot.run_id, profile.validator_id, profile.adaptive_weight, profile.evolution_score, profile.profile_hash, stableConsensusIntelligenceStringify(profile));
    }

    for (const item of snapshot.synthesis) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_consensus_intelligence_synthesis
        (synthesis_id, run_id, replay_hash, state, action, convergence_score, synthesis_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(item.synthesis_id, snapshot.run_id, item.replay_hash, item.state, item.action, item.convergence_score, item.synthesis_hash, stableConsensusIntelligenceStringify(item));
    }

    for (const record of snapshot.convergence_history) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_consensus_intelligence_convergence
        (convergence_id, run_id, replay_hash, to_state, convergence_score, convergence_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(record.convergence_id, snapshot.run_id, record.replay_hash, record.to_state, record.convergence_score, record.convergence_hash, stableConsensusIntelligenceStringify(record));
    }

    for (const record of snapshot.quorum_history) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_consensus_intelligence_quorum
        (quorum_id, run_id, replay_hash, quorum_met, quorum_ratio, quorum_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(record.quorum_id, snapshot.run_id, record.replay_hash, record.quorum_met ? 1 : 0, record.quorum_ratio, record.quorum_hash, stableConsensusIntelligenceStringify(record));
    }

    for (const forecast of snapshot.survivability_forecasts) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_consensus_intelligence_forecasts
        (forecast_id, run_id, replay_hash, survivability_score, forecast_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(forecast.forecast_id, snapshot.run_id, forecast.replay_hash, forecast.survivability_score, forecast.forecast_hash, stableConsensusIntelligenceStringify(forecast));
    }

    for (const reference of snapshot.lineage) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_consensus_intelligence_lineage
        (reference_id, run_id, replay_hash, reference_kind, reference_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(reference.reference_id, snapshot.run_id, reference.replay_hash, reference.reference_kind, reference.reference_hash, stableConsensusIntelligenceStringify(reference));
    }

    for (const epoch of snapshot.epochs) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_consensus_intelligence_epochs
        (epoch_id, run_id, promoted, frozen, epoch_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(epoch.epoch_id, snapshot.run_id, epoch.promoted ? 1 : 0, epoch.frozen ? 1 : 0, epoch.epoch_hash, stableConsensusIntelligenceStringify(epoch));
    }
  });

  write();
}

function collectReplayHashes(input: ReplayConsensusIntelligenceInput): readonly string[] {
  return Array.from(new Set([
    ...input.self_healing_snapshot.decisions.map((decision) => decision.replay_hash),
    ...input.coordination_mesh.sessions.map((session) => session.replay_hash),
    ...input.governance_snapshot.decisions.map((decision) => decision.replay_hash),
    ...input.memory_snapshot.temporal_indexes.map((index) => index.replay_hash),
  ])).sort((left, right) => left.localeCompare(right));
}

function stateForSynthesis(
  convergenceScore: number,
  quorumMet: boolean,
  healingState: string | null,
): ReplayConsensusIntelligenceState {
  if (!quorumMet) return "divergent";
  if (healingState === "degraded" || healingState === "partitioned") return "degraded";
  if (healingState === "reconciled") return "reconciled";
  if (convergenceScore >= 0.82) return "stabilized";
  if (convergenceScore >= 0.62) return "converging";
  return "synthesizing";
}

function actionForSynthesis(
  state: ReplayConsensusIntelligenceState,
  convergenceScore: number,
  promotionThreshold: number,
): ReplayConsensusIntelligenceAction {
  if (state === "divergent") return "reconcile_divergence";
  if (state === "degraded") return "quarantine_intelligence_branch";
  if (convergenceScore >= promotionThreshold) return "promote_intelligence_epoch";
  if (state === "stabilized") return "freeze_intelligence_epoch";
  if (state === "reconciled") return "propagate_intelligence";
  return "synthesize_consensus";
}

function classifySnapshotState(
  synthesis: readonly ReplayConsensusIntelligenceSynthesis[],
  forecasts: readonly ReplayIntelligenceSurvivabilityForecast[],
): ReplayConsensusIntelligenceState {
  if (synthesis.some((item) => item.state === "degraded")) return "degraded";
  if (synthesis.some((item) => item.state === "divergent")) return "divergent";
  if (synthesis.some((item) => item.state === "reconciled")) return "reconciled";
  if (forecasts.some((forecast) => forecast.survivability_score < DEFAULT_SURVIVABILITY_FLOOR)) return "synthesizing";
  if (synthesis.length > 0 && synthesis.every((item) => item.state === "stabilized")) return "stabilized";
  return "converging";
}

function memoryStateToIntelligenceState(state: string): ReplayConsensusIntelligenceState {
  switch (state) {
    case "stabilized":
      return "stabilized";
    case "quarantined":
    case "deprecated":
      return "degraded";
    case "reconciled":
      return "reconciled";
    case "archived":
    case "active":
    default:
      return "synthesizing";
  }
}

function divergencePenalty(
  input: ReplayConsensusIntelligenceInput,
  profile: ReplayGovernanceValidatorProfile,
): number {
  const explicitPenalty = profile.vote_count === 0 ? 0 : profile.divergence_count / profile.vote_count;
  const memoryPenalty = average(profile.replay_hashes.map((replayHash) =>
    latestForReplay(input.memory_snapshot.divergence_evolution, replayHash)?.divergence_score ?? 0,
  ));
  return roundConsensusIntelligenceNumber(Math.max(explicitPenalty, memoryPenalty));
}

function averageSurvivability(
  input: ReplayConsensusIntelligenceInput,
  replayHashes: readonly string[],
): number {
  return roundConsensusIntelligenceNumber(average(replayHashes.map((replayHash) =>
    input.self_healing_snapshot.survivability_trends.find((trend) => trend.replay_hash === replayHash)?.survivability_score ?? 0.5,
  )));
}

function normalizedTrust(profile: ReplayGovernanceValidatorProfile): number {
  return roundConsensusIntelligenceNumber(Math.max(0, Math.min(1, profile.trust_score / 100)));
}

function participationBonus(profile: ReplayGovernanceValidatorProfile): number {
  return Math.min(0.12, profile.vote_count * 0.015);
}

function weightedAverage(
  profiles: readonly ReplayValidatorIntelligenceProfile[],
  select: (profile: ReplayValidatorIntelligenceProfile) => number,
): number {
  const totalWeight = profiles.reduce((sum, profile) => sum + profile.adaptive_weight, 0);
  if (totalWeight === 0) return 0;
  return roundConsensusIntelligenceNumber(profiles.reduce((sum, profile) =>
    sum + (select(profile) * profile.adaptive_weight), 0) / totalWeight);
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

function dedupeBy<T>(
  values: readonly T[],
  getKey: (value: T) => string,
): readonly T[] {
  return Array.from(new Map(values.map((value) => [getKey(value), value])).values());
}

function roundConsensusIntelligenceNumber(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function stableConsensusIntelligenceStringify(value: unknown): string {
  return JSON.stringify(sortConsensusIntelligenceKeys(value));
}

function sortConsensusIntelligenceKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortConsensusIntelligenceKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortConsensusIntelligenceKeys((value as Record<string, unknown>)[key]);
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
