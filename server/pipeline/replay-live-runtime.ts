import crypto from "node:crypto";

import type Database from "better-sqlite3";

import {
  buildReplayLiveIntelligenceBridgeSnapshot,
} from "./replay-live-intelligence-bridge";
import {
  buildReplayValidatorTrustSnapshot,
  initializeReplayValidatorTrustSchema,
} from "./replay-validator-trust";
import type {
  ReplayLiveRuntimeAction,
  ReplayLiveRuntimeCycle,
  ReplayLiveRuntimeExecutedCycle,
  ReplayLiveRuntimeInput,
  ReplayLiveRuntimeQuery,
  ReplayLiveRuntimeSnapshot,
  ReplayLiveRuntimeState,
  ReplayLiveRecoveryMonitoringRecord,
  ReplayLiveSchedulerTick,
  ReplayLiveValidatorExecutionLoop,
  ReplayConsensusDriftRecord,
  ReplayExecutionStateStreamEvent,
  ReplayRuntimeConsensusCoordination,
  ReplayRuntimeIntelligencePropagation,
  ReplayRuntimeTelemetryRecord,
} from "./replay-live-runtime-contract";

type SqliteDatabase = Database.Database;

interface PayloadRow {
  readonly payload: string;
}

const DEFAULT_DRIFT_THRESHOLD = 0.18;

const SUPPORTED_ACTIONS: readonly ReplayLiveRuntimeAction[] = [
  "schedule_live_cycle",
  "execute_live_replay",
  "run_validator_loop",
  "coordinate_runtime_consensus",
  "emit_runtime_telemetry",
  "monitor_live_recovery",
  "stream_execution_state",
  "propagate_runtime_intelligence",
  "monitor_consensus_drift",
  "freeze_runtime_snapshot",
];

const SUPPORTED_QUERIES: readonly ReplayLiveRuntimeQuery[] = [
  "get_runtime_cycles",
  "get_scheduler_history",
  "get_validator_execution_loops",
  "get_runtime_consensus_coordination",
  "get_runtime_telemetry",
  "get_live_recovery_monitoring",
  "get_execution_state_stream",
  "get_runtime_intelligence_propagation",
  "get_consensus_drift_history",
];

export function initializeReplayLiveRuntimeSchema(db: SqliteDatabase): void {
  initializeReplayValidatorTrustSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS replay_live_runtime_snapshots (
      runtime_id TEXT PRIMARY KEY,
      generated_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      state TEXT NOT NULL,
      deterministic_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replay_live_runtime_cycles (
      cycle_id TEXT PRIMARY KEY,
      runtime_id TEXT NOT NULL,
      cycle_ordinal INTEGER NOT NULL,
      state TEXT NOT NULL,
      cycle_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replay_live_runtime_stream (
      event_id TEXT PRIMARY KEY,
      runtime_id TEXT NOT NULL,
      cycle_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      event_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replay_live_runtime_telemetry (
      telemetry_id TEXT PRIMARY KEY,
      runtime_id TEXT NOT NULL,
      cycle_id TEXT NOT NULL,
      telemetry_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);
}

export function buildReplayLiveRuntimeSnapshot(
  db: SqliteDatabase,
  input: ReplayLiveRuntimeInput,
): ReplayLiveRuntimeSnapshot {
  initializeReplayLiveRuntimeSchema(db);

  const executedCycles = input.cycles.map((cycle) => {
    const bridge = buildReplayLiveIntelligenceBridgeSnapshot(db, cycle.bridge_input);
    const trust = buildReplayValidatorTrustSnapshot(db, {
      run_id: bridge.run_id,
      generated_at: cycle.bridge_input.generated_at,
      persisted_at: cycle.bridge_input.persisted_at,
      bridge_snapshot: bridge,
      live_signals: cycle.bridge_input.live_signals,
      settled_outcomes: cycle.bridge_input.settled_outcomes,
      injury_reports: cycle.bridge_input.injury_reports,
      source_intelligence_events: cycle.bridge_input.source_intelligence_events,
      decay_floor: 56,
      recovery_threshold: 73,
    });
    return { bridge_snapshot: bridge, trust_snapshot: trust };
  });
  const cycles = buildRuntimeCycles(executedCycles);
  const schedulerHistory = buildSchedulerHistory(input, cycles);
  const validatorLoops = buildValidatorLoops(executedCycles, cycles);
  const consensusCoordination = buildConsensusCoordination(executedCycles, cycles);
  const telemetry = buildTelemetry(executedCycles, cycles);
  const recoveryMonitoring = buildRecoveryMonitoring(executedCycles, cycles);
  const intelligencePropagation = buildIntelligencePropagation(executedCycles, cycles);
  const consensusDrift = buildConsensusDrift(cycles, telemetry, input.drift_threshold ?? DEFAULT_DRIFT_THRESHOLD);
  const stateStream = buildStateStream(cycles, schedulerHistory, telemetry, consensusDrift, intelligencePropagation);
  const state = classifyRuntimeState(cycles, consensusDrift, recoveryMonitoring);
  const seed = {
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    cycle_hashes: cycles.map((cycle) => cycle.cycle_hash),
    scheduler_hashes: schedulerHistory.map((tick) => tick.tick_hash),
    loop_hashes: validatorLoops.map((loop) => loop.loop_hash),
    coordination_hashes: consensusCoordination.map((record) => record.coordination_hash),
    telemetry_hashes: telemetry.map((record) => record.telemetry_hash),
    recovery_hashes: recoveryMonitoring.map((record) => record.recovery_hash),
    propagation_hashes: intelligencePropagation.map((record) => record.propagation_hash),
    drift_hashes: consensusDrift.map((record) => record.drift_hash),
    stream_hashes: stateStream.map((event) => event.event_hash),
  };
  const runtimeHash = computeReplayLiveRuntimeHash(seed);
  const snapshot = deepFreeze({
    runtime_id: input.runtime_id ?? `replay-live-runtime:${runtimeHash}`,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    executed_cycles: executedCycles,
    cycles,
    scheduler_history: schedulerHistory,
    validator_execution_loops: validatorLoops,
    consensus_coordination: consensusCoordination,
    telemetry,
    recovery_monitoring: recoveryMonitoring,
    state_stream: stateStream,
    intelligence_propagation: intelligencePropagation,
    consensus_drift: consensusDrift,
    supported_actions: SUPPORTED_ACTIONS,
    supported_queries: SUPPORTED_QUERIES,
    deterministic_hash: runtimeHash,
  });

  persistReplayLiveRuntimeSnapshot(db, snapshot);
  return snapshot;
}

export function getRuntimeCycles(db: SqliteDatabase, runtimeId: string): readonly ReplayLiveRuntimeCycle[] {
  initializeReplayLiveRuntimeSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_live_runtime_cycles
    WHERE runtime_id = ?
    ORDER BY cycle_ordinal ASC
  `).all(runtimeId) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayLiveRuntimeCycle));
}

export function getExecutionStateStream(db: SqliteDatabase, runtimeId: string): readonly ReplayExecutionStateStreamEvent[] {
  initializeReplayLiveRuntimeSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_live_runtime_stream
    WHERE runtime_id = ?
    ORDER BY sequence ASC
  `).all(runtimeId) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayExecutionStateStreamEvent));
}

export function getRuntimeTelemetry(db: SqliteDatabase, runtimeId: string): readonly ReplayRuntimeTelemetryRecord[] {
  initializeReplayLiveRuntimeSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_live_runtime_telemetry
    WHERE runtime_id = ?
    ORDER BY cycle_id ASC
  `).all(runtimeId) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayRuntimeTelemetryRecord));
}

export function serializeReplayLiveRuntimeSnapshot(snapshot: ReplayLiveRuntimeSnapshot): string {
  return stableRuntimeStringify(snapshot);
}

export function computeReplayLiveRuntimeHash(value: unknown): string {
  return crypto.createHash("sha256").update(stableRuntimeStringify(value)).digest("hex");
}

function buildRuntimeCycles(executed: readonly ReplayLiveRuntimeExecutedCycle[]): readonly ReplayLiveRuntimeCycle[] {
  return deepFreeze(executed.map((cycle, index) => {
    const avgTrust = average(cycle.trust_snapshot.validator_profiles.map((profile) => profile.trust_score));
    const state: ReplayLiveRuntimeState = avgTrust < 58
      ? "recovering"
      : cycle.bridge_snapshot.consensus_results.some((result) => result.vote_aggregation.divergence_ratio > 0.35)
        ? "coordinating"
        : "stabilized";
    const seed = {
      cycle_id: `runtime-cycle:${cycle.bridge_snapshot.bridge_id}`,
      cycle_ordinal: index + 1,
      bridge_hash: cycle.bridge_snapshot.deterministic_hash,
      trust_hash: cycle.trust_snapshot.deterministic_hash,
      canonical_record_count: cycle.bridge_snapshot.adapter.canonical_records.length,
      consensus_count: cycle.bridge_snapshot.consensus_results.length,
      governance_decision_count: cycle.bridge_snapshot.governance_snapshot.decisions.length,
      validator_profile_count: cycle.trust_snapshot.validator_profiles.length,
      state,
    };
    return {
      ...seed,
      cycle_hash: computeReplayLiveRuntimeHash(seed),
    };
  }));
}

function buildSchedulerHistory(
  input: ReplayLiveRuntimeInput,
  cycles: readonly ReplayLiveRuntimeCycle[],
): readonly ReplayLiveSchedulerTick[] {
  const start = Date.parse(input.generated_at);
  return deepFreeze(cycles.map((cycle, index) => {
    const scheduledFor = new Date(start + (index * input.scheduler_interval_ms)).toISOString();
    const executedAt = input.cycles[index]?.bridge_input.generated_at ?? scheduledFor;
    const driftMs = Date.parse(executedAt) - Date.parse(scheduledFor);
    const seed = {
      cycle_id: cycle.cycle_id,
      scheduled_for: scheduledFor,
      executed_at: executedAt,
      interval_ms: input.scheduler_interval_ms,
      drift_ms: driftMs,
      action: "schedule_live_cycle" as ReplayLiveRuntimeAction,
    };
    const tickHash = computeReplayLiveRuntimeHash(seed);
    return {
      tick_id: `replay-runtime-tick:${tickHash}`,
      ...seed,
      tick_hash: tickHash,
    };
  }));
}

function buildValidatorLoops(
  executed: readonly ReplayLiveRuntimeExecutedCycle[],
  cycles: readonly ReplayLiveRuntimeCycle[],
): readonly ReplayLiveValidatorExecutionLoop[] {
  return deepFreeze(executed.flatMap((executedCycle, index) => {
    const cycleId = cycles[index]?.cycle_id ?? `cycle:${index}`;
    return executedCycle.trust_snapshot.validator_profiles.map((profile) => {
      const adaptation = executedCycle.trust_snapshot.consensus_weight_adaptation.find((item) => item.validator_id === profile.validator_id);
      const seed = {
        cycle_id: cycleId,
        validator_id: profile.validator_id,
        validator_type: profile.validator_type,
        trust_state: profile.state,
        trust_score: profile.trust_score,
        adapted_weight: adaptation?.adapted_weight ?? 1,
        loop_action: "run_validator_loop" as ReplayLiveRuntimeAction,
      };
      const loopHash = computeReplayLiveRuntimeHash(seed);
      return {
        loop_id: `replay-runtime-validator-loop:${loopHash}`,
        ...seed,
        loop_hash: loopHash,
      };
    });
  }).sort((left, right) =>
    left.cycle_id.localeCompare(right.cycle_id) ||
    left.validator_id.localeCompare(right.validator_id),
  ));
}

function buildConsensusCoordination(
  executed: readonly ReplayLiveRuntimeExecutedCycle[],
  cycles: readonly ReplayLiveRuntimeCycle[],
): readonly ReplayRuntimeConsensusCoordination[] {
  return deepFreeze(executed.flatMap((executedCycle, index) => {
    const cycleId = cycles[index]?.cycle_id ?? `cycle:${index}`;
    return executedCycle.bridge_snapshot.consensus_results.map((result) => {
      const governance = executedCycle.bridge_snapshot.governance_snapshot.decisions.find((decision) => decision.replay_hash === result.replay_hash);
      const seed = {
        cycle_id: cycleId,
        replay_hash: result.replay_hash,
        quorum_met: result.vote_aggregation.quorum_met,
        approval_ratio: result.vote_aggregation.approval_ratio,
        divergence_ratio: result.vote_aggregation.divergence_ratio,
        governance_action: governance?.action ?? null,
      };
      const coordinationHash = computeReplayLiveRuntimeHash(seed);
      return {
        coordination_id: `replay-runtime-consensus:${coordinationHash}`,
        ...seed,
        coordination_hash: coordinationHash,
      };
    });
  }));
}

function buildTelemetry(
  executed: readonly ReplayLiveRuntimeExecutedCycle[],
  cycles: readonly ReplayLiveRuntimeCycle[],
): readonly ReplayRuntimeTelemetryRecord[] {
  return deepFreeze(executed.map((executedCycle, index) => {
    const cycleId = cycles[index]?.cycle_id ?? `cycle:${index}`;
    const averageTrustScore = roundRuntimeNumber(average(executedCycle.trust_snapshot.validator_profiles.map((profile) => profile.trust_score)));
    const divergence = average(executedCycle.bridge_snapshot.consensus_results.map((result) => result.vote_aggregation.divergence_ratio));
    const trustPenalty = Math.max(0, (72 - averageTrustScore) / 100);
    const driftScore = roundRuntimeNumber(Math.max(0, Math.min(1, divergence + trustPenalty)));
    const seed = {
      cycle_id: cycleId,
      canonical_records: executedCycle.bridge_snapshot.adapter.canonical_records.length,
      consensus_results: executedCycle.bridge_snapshot.consensus_results.length,
      recovery_results: executedCycle.bridge_snapshot.recovery_results.length,
      trust_profiles: executedCycle.trust_snapshot.validator_profiles.length,
      average_trust_score: averageTrustScore,
      drift_score: driftScore,
    };
    const telemetryHash = computeReplayLiveRuntimeHash(seed);
    return {
      telemetry_id: `replay-runtime-telemetry:${telemetryHash}`,
      ...seed,
      telemetry_hash: telemetryHash,
    };
  }));
}

function buildRecoveryMonitoring(
  executed: readonly ReplayLiveRuntimeExecutedCycle[],
  cycles: readonly ReplayLiveRuntimeCycle[],
): readonly ReplayLiveRecoveryMonitoringRecord[] {
  return deepFreeze(executed.flatMap((executedCycle, index) => {
    const cycleId = cycles[index]?.cycle_id ?? `cycle:${index}`;
    const trustState = executedCycle.trust_snapshot.state;
    return executedCycle.bridge_snapshot.recovery_results.map((result) => {
      const actionCount = result.actions.length;
      const seed = {
        cycle_id: cycleId,
        replay_hash: result.arbitration_reference.replay_hash,
        recovery_action_count: actionCount,
        recovery_required: actionCount > 0 || trustState === "degraded" || trustState === "decaying",
        trust_state: trustState,
      };
      const recoveryHash = computeReplayLiveRuntimeHash(seed);
      return {
        recovery_id: `replay-runtime-recovery:${recoveryHash}`,
        ...seed,
        recovery_hash: recoveryHash,
      };
    });
  }));
}

function buildIntelligencePropagation(
  executed: readonly ReplayLiveRuntimeExecutedCycle[],
  cycles: readonly ReplayLiveRuntimeCycle[],
): readonly ReplayRuntimeIntelligencePropagation[] {
  return deepFreeze(executed.map((executedCycle, index) => {
    const seed = {
      cycle_id: cycles[index]?.cycle_id ?? `cycle:${index}`,
      bridge_hash: executedCycle.bridge_snapshot.deterministic_hash,
      trust_hash: executedCycle.trust_snapshot.deterministic_hash,
      consensus_intelligence_hash: executedCycle.bridge_snapshot.consensus_intelligence.deterministic_hash,
      evolution_hash: executedCycle.bridge_snapshot.evolution_snapshot.deterministic_hash,
      propagated_validator_count: executedCycle.trust_snapshot.validator_profiles.length,
    };
    const propagationHash = computeReplayLiveRuntimeHash(seed);
    return {
      propagation_id: `replay-runtime-propagation:${propagationHash}`,
      ...seed,
      propagation_hash: propagationHash,
    };
  }));
}

function buildConsensusDrift(
  cycles: readonly ReplayLiveRuntimeCycle[],
  telemetry: readonly ReplayRuntimeTelemetryRecord[],
  threshold: number,
): readonly ReplayConsensusDriftRecord[] {
  return deepFreeze(cycles.map((cycle, index) => {
    const current = required(telemetry[index], "telemetry missing");
    const previous = index > 0 ? telemetry[index - 1] : undefined;
    const approvalRatioDelta = previous ? roundRuntimeNumber(current.drift_score - previous.drift_score) : 0;
    const trustScoreDelta = previous ? roundRuntimeNumber(current.average_trust_score - previous.average_trust_score) : 0;
    const driftScore = roundRuntimeNumber(Math.max(current.drift_score, Math.abs(approvalRatioDelta), Math.abs(trustScoreDelta) / 100));
    const seed = {
      cycle_id: cycle.cycle_id,
      previous_cycle_id: index > 0 ? cycles[index - 1]?.cycle_id ?? null : null,
      approval_ratio_delta: approvalRatioDelta,
      trust_score_delta: trustScoreDelta,
      drift_score: driftScore,
      drift_detected: driftScore >= threshold,
    };
    const driftHash = computeReplayLiveRuntimeHash(seed);
    return {
      drift_id: `replay-runtime-drift:${driftHash}`,
      ...seed,
      drift_hash: driftHash,
    };
  }));
}

function buildStateStream(
  cycles: readonly ReplayLiveRuntimeCycle[],
  scheduler: readonly ReplayLiveSchedulerTick[],
  telemetry: readonly ReplayRuntimeTelemetryRecord[],
  drift: readonly ReplayConsensusDriftRecord[],
  propagation: readonly ReplayRuntimeIntelligencePropagation[],
): readonly ReplayExecutionStateStreamEvent[] {
  const events: ReplayExecutionStateStreamEvent[] = [];
  let sequence = 1;
  for (const cycle of cycles) {
    const cycleScheduler = required(scheduler.find((tick) => tick.cycle_id === cycle.cycle_id), "scheduler tick missing");
    const cycleTelemetry = required(telemetry.find((record) => record.cycle_id === cycle.cycle_id), "telemetry missing");
    const cycleDrift = required(drift.find((record) => record.cycle_id === cycle.cycle_id), "drift missing");
    const cyclePropagation = required(propagation.find((record) => record.cycle_id === cycle.cycle_id), "propagation missing");
    events.push(streamEvent(cycle.cycle_id, sequence++, "scheduled", "schedule_live_cycle", cycleScheduler.tick_hash));
    events.push(streamEvent(cycle.cycle_id, sequence++, "executing", "execute_live_replay", cycle.cycle_hash));
    events.push(streamEvent(cycle.cycle_id, sequence++, "coordinating", "coordinate_runtime_consensus", cycleTelemetry.telemetry_hash));
    events.push(streamEvent(cycle.cycle_id, sequence++, cycleDrift.drift_detected ? "drifting" : "propagating", "monitor_consensus_drift", cycleDrift.drift_hash));
    events.push(streamEvent(cycle.cycle_id, sequence++, "propagating", "propagate_runtime_intelligence", cyclePropagation.propagation_hash));
  }
  return deepFreeze(events);
}

function streamEvent(
  cycleId: string,
  sequence: number,
  state: ReplayLiveRuntimeState,
  eventType: ReplayLiveRuntimeAction,
  payloadHash: string,
): ReplayExecutionStateStreamEvent {
  const seed = { cycle_id: cycleId, sequence, state, event_type: eventType, payload_hash: payloadHash };
  const eventHash = computeReplayLiveRuntimeHash(seed);
  return {
    event_id: `replay-runtime-stream:${eventHash}`,
    ...seed,
    event_hash: eventHash,
  };
}

function classifyRuntimeState(
  cycles: readonly ReplayLiveRuntimeCycle[],
  drift: readonly ReplayConsensusDriftRecord[],
  recovery: readonly ReplayLiveRecoveryMonitoringRecord[],
): ReplayLiveRuntimeState {
  if (drift.some((record) => record.drift_detected)) return "drifting";
  if (recovery.some((record) => record.recovery_required)) return "recovering";
  if (cycles.some((cycle) => cycle.state === "coordinating")) return "coordinating";
  return "stabilized";
}

function persistReplayLiveRuntimeSnapshot(db: SqliteDatabase, snapshot: ReplayLiveRuntimeSnapshot): void {
  const write = db.transaction(() => {
    db.prepare(`
      INSERT OR REPLACE INTO replay_live_runtime_snapshots
      (runtime_id, generated_at, persisted_at, state, deterministic_hash, payload)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(snapshot.runtime_id, snapshot.generated_at, snapshot.persisted_at, snapshot.state, snapshot.deterministic_hash, stableRuntimeStringify(snapshot));

    for (const cycle of snapshot.cycles) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_live_runtime_cycles
        (cycle_id, runtime_id, cycle_ordinal, state, cycle_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(cycle.cycle_id, snapshot.runtime_id, cycle.cycle_ordinal, cycle.state, cycle.cycle_hash, stableRuntimeStringify(cycle));
    }

    for (const event of snapshot.state_stream) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_live_runtime_stream
        (event_id, runtime_id, cycle_id, sequence, event_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(event.event_id, snapshot.runtime_id, event.cycle_id, event.sequence, event.event_hash, stableRuntimeStringify(event));
    }

    for (const record of snapshot.telemetry) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_live_runtime_telemetry
        (telemetry_id, runtime_id, cycle_id, telemetry_hash, payload)
        VALUES (?, ?, ?, ?, ?)
      `).run(record.telemetry_id, snapshot.runtime_id, record.cycle_id, record.telemetry_hash, stableRuntimeStringify(record));
    }
  });
  write();
}

function required<T>(value: T | undefined, message: string): T {
  if (typeof value === "undefined") throw new Error(message);
  return value;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundRuntimeNumber(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function stableRuntimeStringify(value: unknown): string {
  return JSON.stringify(sortRuntimeKeys(value));
}

function sortRuntimeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortRuntimeKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortRuntimeKeys((value as Record<string, unknown>)[key]);
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
