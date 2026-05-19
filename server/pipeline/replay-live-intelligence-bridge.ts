import crypto from "node:crypto";

import type Database from "better-sqlite3";

import { buildReplayAgentSnapshot } from "./replay-agent";
import { buildReplayArbitrationResult } from "./replay-arbitration";
import { buildReplayAutonomousOrchestrationRun } from "./replay-autonomous-orchestration";
import { buildReplayConsensusResult } from "./replay-consensus";
import { buildReplayConsensusIntelligenceSnapshot } from "./replay-consensus-intelligence";
import { buildReplayConsensusLineageSnapshot } from "./replay-consensus-lineage";
import { buildReplayCoordinationMesh } from "./replay-coordination-mesh";
import { buildReplayEvolutionSnapshot } from "./replay-evolution";
import { buildReplayGovernanceSnapshot } from "./replay-governance";
import { buildReplayMemorySnapshot } from "./replay-memory";
import { persistReplayOrchestrationLifecycle } from "./replay-orchestration-persistence";
import { buildReplayRecoveryCoordinationResult } from "./replay-recovery-coordination";
import { buildReplaySelfHealingSnapshot } from "./replay-self-healing";
import type {
  ReplayAgentAction,
  ReplayAgentSpecialization,
} from "./replay-agent-contract";
import type {
  ReplayConsensusDivergenceCategory,
  ReplayConsensusInput,
  ReplayConsensusValidatorDefinition,
  ReplayConsensusVote,
} from "./replay-consensus-contract";
import type {
  ReplayLiveBridgeAdapterOutput,
  ReplayLiveBridgeInput,
  ReplayLiveBridgeRecordKind,
  ReplayLiveCanonicalRecord,
  ReplayLiveIntelligenceBridgeSnapshot,
} from "./replay-live-intelligence-bridge-contract";

type SqliteDatabase = Database.Database;

interface PayloadRow {
  readonly payload: string;
}

const DEFAULT_CONSENSUS_THRESHOLD = 0.66;
const DEFAULT_APPROVAL_THRESHOLD = 0.56;

export function initializeReplayLiveIntelligenceBridgeSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS replay_live_intelligence_bridge_snapshots (
      bridge_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      deterministic_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_live_intelligence_bridge_run
      ON replay_live_intelligence_bridge_snapshots(run_id, generated_at DESC, bridge_id DESC);

    CREATE TABLE IF NOT EXISTS replay_live_intelligence_bridge_records (
      record_id TEXT PRIMARY KEY,
      bridge_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      deterministic_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_live_intelligence_bridge_records_replay
      ON replay_live_intelligence_bridge_records(bridge_id, replay_hash, kind);
  `);
}

export function buildReplayLiveIntelligenceBridgeSnapshot(
  db: SqliteDatabase,
  input: ReplayLiveBridgeInput,
): ReplayLiveIntelligenceBridgeSnapshot {
  initializeReplayLiveIntelligenceBridgeSchema(db);

  const adapter = adaptLiveSportsReplayInputs(input);
  const orchestrationRun = buildReplayAutonomousOrchestrationRun({
    clock: { generated_at: input.generated_at },
    targets: adapter.replay_targets,
    consensus_threshold: input.consensus_threshold ?? DEFAULT_CONSENSUS_THRESHOLD,
    max_recovery_attempts: 2,
  });
  const consensusResults = adapter.consensus_inputs.map((consensusInput) =>
    buildReplayConsensusResult(consensusInput),
  );
  const arbitrationResults = consensusResults.map((consensus) =>
    buildReplayArbitrationResult({ generated_at: input.generated_at, consensus }),
  );
  const recoveryResults = arbitrationResults.map((arbitration) =>
    buildReplayRecoveryCoordinationResult({
      generated_at: input.generated_at,
      arbitration,
      max_retry_attempts: 2,
    }),
  );
  const orchestrationPersistence = persistReplayOrchestrationLifecycle(db, {
    persisted_at: input.persisted_at,
    orchestration_run: orchestrationRun,
    consensus_results: consensusResults,
    arbitration_results: arbitrationResults,
    recovery_results: recoveryResults,
  });
  const governanceSnapshot = buildReplayGovernanceSnapshot(db, {
    run_id: orchestrationRun.run_id,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    policy: {
      quorum_threshold: input.consensus_threshold ?? DEFAULT_CONSENSUS_THRESHOLD,
      promotion_confidence_threshold: 68,
      quarantine_severity_threshold: 72,
      validator_reduce_weight_threshold: 72,
    },
  });
  const lineageSnapshot = buildReplayConsensusLineageSnapshot(db, orchestrationRun.run_id);
  const replayScopes = adapter.canonical_records.map((record) => record.replay_hash);
  const agentSnapshot = buildReplayAgentSnapshot(db, {
    run_id: orchestrationRun.run_id,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    agents: buildBridgeAgents(replayScopes),
  });
  const coordinationMesh = buildReplayCoordinationMesh({
    run_id: orchestrationRun.run_id,
    generated_at: input.generated_at,
    agent_snapshot: agentSnapshot,
    governance_snapshot: governanceSnapshot,
    orchestration_persistence: orchestrationPersistence,
    lineage_snapshot: lineageSnapshot,
    quorum_threshold: 0.18,
    balancing_tolerance: 12,
    federated_nodes: [
      federatedNode("live-bridge-local", "local", 1.4, "live-primary", true),
      federatedNode("live-bridge-validator", "validator", 1.2, "live-validator", true),
      federatedNode("live-bridge-recovery", "recovery", 1.1, "live-recovery", true),
      federatedNode("live-bridge-governance", "governance", 1.0, "live-governance", true),
    ],
  });
  const memorySnapshot = buildReplayMemorySnapshot({
    run_id: orchestrationRun.run_id,
    generated_at: input.generated_at,
    mesh_snapshots: [coordinationMesh],
    governance_snapshot: governanceSnapshot,
    orchestration_persistence: orchestrationPersistence,
    lineage_snapshot: lineageSnapshot,
    epoch_size: 3,
  });
  const selfHealingSnapshot = buildReplaySelfHealingSnapshot({
    run_id: orchestrationRun.run_id,
    generated_at: input.generated_at,
    memory_snapshot: memorySnapshot,
    coordination_mesh: coordinationMesh,
    governance_snapshot: governanceSnapshot,
    orchestration_persistence: orchestrationPersistence,
    lineage_snapshot: lineageSnapshot,
    survivability_threshold: 0.68,
  });
  const consensusIntelligence = buildReplayConsensusIntelligenceSnapshot(db, {
    run_id: orchestrationRun.run_id,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    self_healing_snapshot: selfHealingSnapshot,
    coordination_mesh: coordinationMesh,
    governance_snapshot: governanceSnapshot,
    orchestration_persistence: orchestrationPersistence,
    lineage_snapshot: lineageSnapshot,
    memory_snapshot: memorySnapshot,
    quorum_threshold: 0.18,
    promotion_threshold: 0.64,
    survivability_floor: 0.54,
  });
  const evolutionSnapshot = buildReplayEvolutionSnapshot(db, {
    run_id: orchestrationRun.run_id,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    consensus_intelligence: consensusIntelligence,
    memory_snapshot: memorySnapshot,
    governance_snapshot: governanceSnapshot,
    orchestration_persistence: orchestrationPersistence,
    lineage_snapshot: lineageSnapshot,
    self_healing_snapshot: selfHealingSnapshot,
    generation_size: 3,
    promotion_threshold: 0.62,
    survivability_floor: 0.54,
  });
  const seed = {
    bridge_id: adapter.bridge_id,
    run_id: orchestrationRun.run_id,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    adapter_hash: adapter.adapter_hash,
    orchestration_hash: orchestrationRun.deterministic_hash,
    consensus_hashes: consensusResults.map((result) => result.consensus_hash),
    governance_hash: governanceSnapshot.deterministic_hash,
    agent_hash: agentSnapshot.deterministic_hash,
    memory_hash: memorySnapshot.deterministic_hash,
    intelligence_hash: consensusIntelligence.deterministic_hash,
    evolution_hash: evolutionSnapshot.deterministic_hash,
  };
  const deterministicHash = computeReplayLiveIntelligenceBridgeHash(seed);
  const snapshot = deepFreeze({
    bridge_id: adapter.bridge_id,
    run_id: orchestrationRun.run_id,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    adapter,
    orchestration_run: orchestrationRun,
    consensus_results: consensusResults,
    arbitration_results: arbitrationResults,
    recovery_results: recoveryResults,
    orchestration_persistence: orchestrationPersistence,
    governance_snapshot: governanceSnapshot,
    lineage_snapshot: lineageSnapshot,
    agent_snapshot: agentSnapshot,
    coordination_mesh: coordinationMesh,
    memory_snapshot: memorySnapshot,
    self_healing_snapshot: selfHealingSnapshot,
    consensus_intelligence: consensusIntelligence,
    evolution_snapshot: evolutionSnapshot,
    deterministic_hash: deterministicHash,
  });

  persistReplayLiveIntelligenceBridgeSnapshot(db, snapshot);
  return snapshot;
}

export function adaptLiveSportsReplayInputs(
  input: ReplayLiveBridgeInput,
): ReplayLiveBridgeAdapterOutput {
  const canonicalRecords = normalizeCanonicalRecords(input);
  const replayTargets = canonicalRecords.map((record, index) => ({
    replay_hash: record.replay_hash,
    priority: Math.max(1, Math.round((record.confidence * 0.55) + ((1 - record.anomaly_score) * 35))),
    anomaly_score: record.anomaly_score,
    drift_score: record.drift_score,
    confidence_score: record.confidence,
    lineage_depth: index + 1,
    target_metadata: {
      kind: record.kind,
      source_id: record.source_id,
      league: record.league,
      game_id: record.game_id,
      signal_id: record.signal_id,
    },
  }));
  const consensusInputs = canonicalRecords.map((record) =>
    buildConsensusInput(input, record),
  );
  const bridgeId = input.bridge_id ?? `replay-live-bridge:${computeReplayLiveIntelligenceBridgeHash({
    generated_at: input.generated_at,
    record_hashes: canonicalRecords.map((record) => record.deterministic_hash),
  })}`;
  const seed = {
    bridge_id: bridgeId,
    generated_at: input.generated_at,
    canonical_hashes: canonicalRecords.map((record) => record.deterministic_hash),
    target_hashes: replayTargets.map((target) => computeReplayLiveIntelligenceBridgeHash(target)),
    consensus_hashes: consensusInputs.map((consensusInput) => computeReplayLiveIntelligenceBridgeHash(consensusInput)),
  };

  return deepFreeze({
    bridge_id: bridgeId,
    generated_at: input.generated_at,
    canonical_records: canonicalRecords,
    replay_targets: replayTargets,
    consensus_inputs: consensusInputs,
    adapter_hash: computeReplayLiveIntelligenceBridgeHash(seed),
  });
}

export function getReplayLiveIntelligenceBridgeSnapshot(
  db: SqliteDatabase,
  bridgeId: string,
): ReplayLiveIntelligenceBridgeSnapshot | null {
  initializeReplayLiveIntelligenceBridgeSchema(db);
  const row = db.prepare(`
    SELECT payload FROM replay_live_intelligence_bridge_snapshots
    WHERE bridge_id = ?
  `).get(bridgeId) as PayloadRow | undefined;
  return row ? deepFreeze(JSON.parse(row.payload) as ReplayLiveIntelligenceBridgeSnapshot) : null;
}

export function serializeReplayLiveIntelligenceBridgeSnapshot(
  snapshot: ReplayLiveIntelligenceBridgeSnapshot,
): string {
  return stableLiveBridgeStringify(snapshot);
}

export function computeReplayLiveIntelligenceBridgeHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableLiveBridgeStringify(value))
    .digest("hex");
}

function normalizeCanonicalRecords(input: ReplayLiveBridgeInput): readonly ReplayLiveCanonicalRecord[] {
  const records: ReplayLiveCanonicalRecord[] = [
    ...input.raw_events.map((event) => canonicalRecord({
      kind: "raw_event",
      id: event.id,
      sourceId: event.source_id,
      league: event.league,
      gameId: event.game_id,
      signalId: null,
      occurredAt: event.received_at,
      confidence: numberFrom(event.payload.confidence, event.processed ? 66 : 54),
      anomalyScore: event.processed ? 0.08 : 0.22,
      driftScore: event.event_type === "line_move" ? lineMoveDrift(event.payload) : 0.06,
      payload: event,
    })),
    ...input.live_signals.map((signal) => canonicalRecord({
      kind: "live_signal",
      id: signal.id,
      sourceId: signal.sources.map((source) => source.name).sort((left, right) => left.localeCompare(right)).join("|") || "live_signal",
      league: signal.league,
      gameId: signal.game_id,
      signalId: signal.id,
      occurredAt: signal.signal_time,
      confidence: signal.confidence,
      anomalyScore: signal.verdict === "contradicted" || signal.verdict === "review" ? 0.52 : Math.max(0.04, (100 - signal.score) / 220),
      driftScore: signal.line_movement ? Math.min(1, Math.abs(signal.line_movement.delta) / 8) : 0.05,
      payload: signal,
    })),
    ...input.odds_snapshots.map((snapshot) => canonicalRecord({
      kind: "odds_snapshot",
      id: snapshot.id,
      sourceId: snapshot.market_source,
      league: snapshot.league,
      gameId: snapshot.game_id,
      signalId: null,
      occurredAt: snapshot.snapshot_at,
      confidence: 72,
      anomalyScore: snapshot.spread_line === null && snapshot.total_line === null ? 0.34 : 0.08,
      driftScore: Math.min(1, (Math.abs(snapshot.spread_line ?? 0) + Math.abs((snapshot.total_line ?? 0) % 10)) / 100),
      payload: snapshot,
    })),
    ...input.injury_reports.map((report) => canonicalRecord({
      kind: "injury_report",
      id: report.report_id,
      sourceId: report.source_id,
      league: report.league,
      gameId: null,
      signalId: null,
      occurredAt: report.reported_at,
      confidence: report.confidence,
      anomalyScore: report.designation === "OUT" || report.designation === "IL-60" ? 0.1 : 0.18,
      driftScore: report.designation === "Questionable" ? 0.24 : 0.08,
      payload: report,
    })),
    ...input.source_intelligence_events.map((event) => canonicalRecord({
      kind: "source_intelligence_event",
      id: event.event_id,
      sourceId: event.source_id,
      league: event.league,
      gameId: null,
      signalId: event.signal_id,
      occurredAt: event.observed_at,
      confidence: event.reliability_score,
      anomalyScore: Math.max(0, Math.min(1, (100 - event.reliability_score) / 160)),
      driftScore: event.topic === "injury" ? 0.12 : 0.08,
      payload: event,
    })),
    ...input.settled_outcomes.map((outcome) => canonicalRecord({
      kind: "settled_outcome",
      id: outcome.id,
      sourceId: "settlement",
      league: liveSignalLeague(input, outcome.signal_id),
      gameId: outcome.game_id,
      signalId: outcome.signal_id,
      occurredAt: outcome.recorded_at ?? outcome.created_at,
      confidence: outcome.hit === null ? 48 : 88,
      anomalyScore: outcome.hit === false ? 0.36 : 0.08,
      driftScore: outcome.clv === null ? 0.16 : Math.min(1, Math.abs(outcome.clv) / 8),
      payload: outcome,
    })),
  ];

  return deepFreeze(records.sort((left, right) =>
    left.occurred_at.localeCompare(right.occurred_at) ||
    left.kind.localeCompare(right.kind) ||
    left.deterministic_hash.localeCompare(right.deterministic_hash),
  ));
}

function canonicalRecord(input: {
  readonly kind: ReplayLiveBridgeRecordKind;
  readonly id: string;
  readonly sourceId: string;
  readonly league: string | null;
  readonly gameId: string | null;
  readonly signalId: string | null;
  readonly occurredAt: string;
  readonly confidence: number;
  readonly anomalyScore: number;
  readonly driftScore: number;
  readonly payload: unknown;
}): ReplayLiveCanonicalRecord {
  const payloadHash = computeReplayLiveIntelligenceBridgeHash(input.payload);
  const replayHash = computeReplayLiveIntelligenceBridgeHash({
    kind: input.kind,
    id: input.id,
    source_id: input.sourceId,
    payload_hash: payloadHash,
  });
  const seed = {
    record_id: `${input.kind}:${input.id}`,
    kind: input.kind,
    source_id: input.sourceId,
    league: input.league,
    game_id: input.gameId,
    signal_id: input.signalId,
    replay_hash: replayHash,
    occurred_at: input.occurredAt,
    confidence: roundBridgeNumber(Math.max(0, Math.min(100, input.confidence))),
    anomaly_score: roundBridgeNumber(Math.max(0, Math.min(1, input.anomalyScore))),
    drift_score: roundBridgeNumber(Math.max(0, Math.min(1, input.driftScore))),
    payload_hash: payloadHash,
  };
  return {
    ...seed,
    deterministic_hash: computeReplayLiveIntelligenceBridgeHash(seed),
  };
}

function buildConsensusInput(
  input: ReplayLiveBridgeInput,
  record: ReplayLiveCanonicalRecord,
): ReplayConsensusInput {
  return {
    generated_at: input.generated_at,
    replay_hash: record.replay_hash,
    compared_replay_hash: record.game_id ? `live-game:${record.game_id}` : record.signal_id ? `live-signal:${record.signal_id}` : null,
    quorum_threshold: input.consensus_threshold ?? DEFAULT_CONSENSUS_THRESHOLD,
    approval_threshold: input.approval_threshold ?? DEFAULT_APPROVAL_THRESHOLD,
    validators: buildBridgeValidators(input, record),
  };
}

function buildBridgeValidators(
  input: ReplayLiveBridgeInput,
  record: ReplayLiveCanonicalRecord,
): readonly ReplayConsensusValidatorDefinition[] {
  const validatorInputs: readonly {
    readonly id: string;
    readonly type: string;
    readonly weight: number;
    readonly vote: ReplayConsensusVote;
    readonly categories: readonly ReplayConsensusDivergenceCategory[];
    readonly confidenceOffset: number;
  }[] = [
    {
      id: "raw-event",
      type: "live_raw_event_validator",
      weight: 1.15,
      vote: hasKind(input, "raw_event", record) || record.kind === "raw_event" ? "approve" : "abstain",
      categories: record.kind === "raw_event" && record.anomaly_score > 0.3 ? ["provenance"] : [],
      confidenceOffset: 2,
    },
    {
      id: "live-signal",
      type: "live_signal_validator",
      weight: 1.25,
      vote: record.kind === "live_signal" || Boolean(record.signal_id) ? record.anomaly_score > 0.5 ? "diverge" : "approve" : "abstain",
      categories: record.anomaly_score > 0.5 ? ["signal"] : [],
      confidenceOffset: 4,
    },
    {
      id: "odds",
      type: "odds_snapshot_validator",
      weight: 1,
      vote: record.kind === "odds_snapshot" || record.drift_score > 0.18 ? "approve" : "abstain",
      categories: record.kind === "odds_snapshot" && record.anomaly_score > 0.25 ? ["snapshot"] : [],
      confidenceOffset: 0,
    },
    {
      id: "injury",
      type: "injury_report_validator",
      weight: 1.05,
      vote: record.kind === "injury_report" || record.kind === "raw_event" || record.kind === "live_signal" ? "approve" : "abstain",
      categories: record.kind === "injury_report" && record.drift_score > 0.2 ? ["timeline"] : [],
      confidenceOffset: -2,
    },
    {
      id: "source-intelligence",
      type: "source_intelligence_validator",
      weight: 1.2,
      vote: record.confidence >= 55 ? "approve" : "diverge",
      categories: record.confidence < 55 ? ["provenance"] : [],
      confidenceOffset: 6,
    },
    {
      id: "settlement",
      type: "settled_outcome_validator",
      weight: 1.1,
      vote: record.kind === "settled_outcome" ? record.anomaly_score > 0.3 ? "diverge" : "approve" : "abstain",
      categories: record.kind === "settled_outcome" && record.anomaly_score > 0.3 ? ["settlement"] : [],
      confidenceOffset: 1,
    },
  ];

  return validatorInputs.map((validator) => ({
    validator_id: `live-bridge:${validator.id}:${record.replay_hash.slice(0, 16)}`,
    validator_type: validator.type,
    weight: validator.weight,
    base_confidence: roundBridgeNumber(Math.max(1, Math.min(99, record.confidence + validator.confidenceOffset - (record.anomaly_score * 18)))),
    vote: validator.vote,
    divergence_categories: validator.categories,
    lineage_reference: {
      replay_hash: record.replay_hash,
      parent_replay_hash: record.game_id ? `live-game:${record.game_id}` : record.signal_id ? `live-signal:${record.signal_id}` : null,
      lineage_hash: computeReplayLiveIntelligenceBridgeHash({
        validator: validator.id,
        replay_hash: record.replay_hash,
        record_hash: record.deterministic_hash,
      }),
      generated_at: input.generated_at,
    },
    notes: [`live_bridge_kind:${record.kind}`, `source:${record.source_id}`],
  })).sort((left, right) => left.validator_id.localeCompare(right.validator_id));
}

function persistReplayLiveIntelligenceBridgeSnapshot(
  db: SqliteDatabase,
  snapshot: ReplayLiveIntelligenceBridgeSnapshot,
): void {
  const write = db.transaction(() => {
    db.prepare(`
      INSERT OR REPLACE INTO replay_live_intelligence_bridge_snapshots
      (bridge_id, run_id, generated_at, persisted_at, deterministic_hash, payload)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      snapshot.bridge_id,
      snapshot.run_id,
      snapshot.generated_at,
      snapshot.persisted_at,
      snapshot.deterministic_hash,
      stableLiveBridgeStringify(snapshot),
    );

    for (const record of snapshot.adapter.canonical_records) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_live_intelligence_bridge_records
        (record_id, bridge_id, kind, replay_hash, deterministic_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        record.record_id,
        snapshot.bridge_id,
        record.kind,
        record.replay_hash,
        record.deterministic_hash,
        stableLiveBridgeStringify(record),
      );
    }
  });
  write();
}

function buildBridgeAgents(replayScopes: readonly string[]) {
  return [
    agent("live-raw-event-validator", "validator", "live-bridge-validator", replayScopes),
    agent("live-signal-validator", "validator", "live-bridge-validator", replayScopes),
    agent("live-odds-validator", "validator", "live-bridge-validator", replayScopes),
    agent("live-source-intelligence-validator", "validator", "live-bridge-validator", replayScopes),
    agent("live-recovery", "recovery", "live-bridge-recovery", replayScopes),
    agent("live-governance", "governance", "live-bridge-governance", replayScopes),
    agent("live-orchestration", "orchestration", "live-bridge-local", replayScopes),
  ];
}

function agent(
  agentSeed: string,
  specialization: ReplayAgentSpecialization,
  nodeId: string,
  replayScopes: readonly string[],
) {
  const declaredActions: readonly ReplayAgentAction[] = specialization === "validator"
    ? ["validate_replay", "reconcile_divergence"]
    : specialization === "recovery"
      ? ["coordinate_recovery", "reconstruct_branch", "promote_branch", "quarantine_branch"]
      : specialization === "governance"
        ? ["evaluate_governance", "promote_branch", "quarantine_branch"]
        : ["validate_replay", "evaluate_governance", "promote_branch", "quarantine_branch"];
  return {
    agent_seed: agentSeed,
    specialization,
    declared_actions: declaredActions,
    replay_scopes: replayScopes,
    node_id: nodeId,
  };
}

function federatedNode(
  nodeId: string,
  federationGroup: string,
  capacityWeight: number,
  failureDomain: string,
  acceptsRemoteRelay: boolean,
) {
  return {
    node_id: nodeId,
    federation_group: federationGroup,
    capacity_weight: capacityWeight,
    failure_domain: failureDomain,
    accepts_remote_relay: acceptsRemoteRelay,
  };
}

function hasKind(
  input: ReplayLiveBridgeInput,
  kind: ReplayLiveBridgeRecordKind,
  record: ReplayLiveCanonicalRecord,
): boolean {
  if (kind === "raw_event") return input.raw_events.some((item) => item.game_id === record.game_id || item.id === record.record_id.replace("raw_event:", ""));
  return false;
}

function liveSignalLeague(input: ReplayLiveBridgeInput, signalId: string): string | null {
  return input.live_signals.find((signal) => signal.id === signalId)?.league ?? null;
}

function lineMoveDrift(payload: Record<string, unknown>): number {
  const open = numberFrom(payload.open_line ?? payload.open, 0);
  const current = numberFrom(payload.current_line ?? payload.current, open);
  return Math.min(1, Math.abs(current - open) / 8);
}

function numberFrom(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function roundBridgeNumber(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function stableLiveBridgeStringify(value: unknown): string {
  return JSON.stringify(sortLiveBridgeKeys(value));
}

function sortLiveBridgeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortLiveBridgeKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortLiveBridgeKeys((value as Record<string, unknown>)[key]);
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
