import crypto from "node:crypto";

import type Database from "better-sqlite3";

import { initializeReplayObservabilitySchema } from "./replay-observability";
import type {
  ReplayLiveRuntimeCycle,
} from "./replay-live-runtime-contract";
import type {
  ReplayProductionOrchestrationAction,
  ReplayProductionOrchestrationInput,
  ReplayProductionOrchestrationQuery,
  ReplayProductionOrchestrationSnapshot,
  ReplayProductionOrchestrationState,
  ReplayProductionRuntimeNode,
  ReplayDistributedLeaseRecord,
  ReplayDistributedRuntimeCoordinationRecord,
  ReplayExecutionCheckpointRecord,
  ReplayExecutionWatchdogRecord,
  ReplayOrchestrationFailoverRecord,
  ReplayOrchestrationHealthRecord,
  ReplayProductionSchedulerRecord,
  ReplayRecoveryContinuationRecord,
  ReplayRuntimeSurvivabilityTelemetry,
} from "./replay-production-orchestration-contract";

type SqliteDatabase = Database.Database;

interface PayloadRow {
  readonly payload: string;
}

const DEFAULT_LEASE_TTL_MS = 120_000;
const DEFAULT_WATCHDOG_TIMEOUT_MS = 90_000;

const SUPPORTED_ACTIONS: readonly ReplayProductionOrchestrationAction[] = [
  "schedule_production_replay",
  "persist_runtime_coordination",
  "handle_orchestration_failover",
  "checkpoint_replay_execution",
  "continue_recovery_replay",
  "coordinate_distributed_lease",
  "emit_survivability_telemetry",
  "monitor_orchestration_health",
  "execute_watchdog",
  "freeze_production_snapshot",
];

const SUPPORTED_QUERIES: readonly ReplayProductionOrchestrationQuery[] = [
  "get_production_scheduler_history",
  "get_distributed_coordination_persistence",
  "get_orchestration_failover_history",
  "get_execution_checkpoints",
  "get_recovery_continuations",
  "get_distributed_leases",
  "get_survivability_telemetry",
  "get_orchestration_health",
  "get_execution_watchdogs",
];

export function initializeReplayProductionOrchestrationSchema(db: SqliteDatabase): void {
  initializeReplayObservabilitySchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS replay_production_orchestration_snapshots (
      production_id TEXT PRIMARY KEY,
      runtime_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      state TEXT NOT NULL,
      deterministic_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replay_production_orchestration_views (
      view_id TEXT PRIMARY KEY,
      production_id TEXT NOT NULL,
      runtime_id TEXT NOT NULL,
      view_kind TEXT NOT NULL,
      view_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_production_views_runtime
      ON replay_production_orchestration_views(runtime_id, view_kind);
  `);
}

export function buildReplayProductionOrchestrationSnapshot(
  db: SqliteDatabase,
  input: ReplayProductionOrchestrationInput,
): ReplayProductionOrchestrationSnapshot {
  initializeReplayProductionOrchestrationSchema(db);

  const nodes = normalizeNodes(input.runtime_nodes);
  const failedNodeIds = new Set(input.failed_node_ids ?? []);
  const schedulerHistory = buildSchedulerHistory(input, nodes, failedNodeIds);
  const distributedLeases = buildDistributedLeases(input, schedulerHistory);
  const executionCheckpoints = buildExecutionCheckpoints(input);
  const failoverHistory = buildFailoverHistory(input, nodes, schedulerHistory, failedNodeIds);
  const recoveryContinuations = buildRecoveryContinuations(input, executionCheckpoints);
  const coordinationPersistence = buildCoordinationPersistence(input, schedulerHistory, distributedLeases, executionCheckpoints);
  const survivabilityTelemetry = buildSurvivabilityTelemetry(input, distributedLeases, executionCheckpoints, recoveryContinuations);
  const orchestrationHealth = buildOrchestrationHealth(input, nodes, distributedLeases, failoverHistory);
  const executionWatchdogs = buildExecutionWatchdogs(input);
  const state = classifyProductionState(failoverHistory, survivabilityTelemetry, orchestrationHealth, executionWatchdogs);
  const seed = {
    runtime_id: input.runtime_snapshot.runtime_id,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    scheduler_hashes: schedulerHistory.map((record) => record.schedule_hash),
    coordination_hashes: coordinationPersistence.map((record) => record.coordination_hash),
    failover_hashes: failoverHistory.map((record) => record.failover_hash),
    checkpoint_hashes: executionCheckpoints.map((record) => record.checkpoint_hash),
    continuation_hashes: recoveryContinuations.map((record) => record.continuation_hash),
    lease_hashes: distributedLeases.map((record) => record.lease_hash),
    survivability_hashes: survivabilityTelemetry.map((record) => record.telemetry_hash),
    health_hashes: orchestrationHealth.map((record) => record.health_hash),
    watchdog_hashes: executionWatchdogs.map((record) => record.watchdog_hash),
    runtime_hash: input.runtime_snapshot.deterministic_hash,
    observability_hash: input.observability_snapshot.deterministic_hash,
  };
  const deterministicHash = computeReplayProductionOrchestrationHash(seed);
  const snapshot = deepFreeze({
    production_id: `replay-production-orchestration:${deterministicHash}`,
    runtime_id: input.runtime_snapshot.runtime_id,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    scheduler_history: schedulerHistory,
    coordination_persistence: coordinationPersistence,
    failover_history: failoverHistory,
    execution_checkpoints: executionCheckpoints,
    recovery_continuations: recoveryContinuations,
    distributed_leases: distributedLeases,
    survivability_telemetry: survivabilityTelemetry,
    orchestration_health: orchestrationHealth,
    execution_watchdogs: executionWatchdogs,
    supported_actions: SUPPORTED_ACTIONS,
    supported_queries: SUPPORTED_QUERIES,
    deterministic_hash: deterministicHash,
  });

  persistReplayProductionOrchestrationSnapshot(db, snapshot);
  return snapshot;
}

export function getProductionSchedulerHistory(db: SqliteDatabase, runtimeId: string): readonly ReplayProductionSchedulerRecord[] {
  return getViewList<ReplayProductionSchedulerRecord>(db, runtimeId, "scheduler_history");
}

export function getDistributedCoordinationPersistence(db: SqliteDatabase, runtimeId: string): readonly ReplayDistributedRuntimeCoordinationRecord[] {
  return getViewList<ReplayDistributedRuntimeCoordinationRecord>(db, runtimeId, "coordination_persistence");
}

export function getOrchestrationFailoverHistory(db: SqliteDatabase, runtimeId: string): readonly ReplayOrchestrationFailoverRecord[] {
  return getViewList<ReplayOrchestrationFailoverRecord>(db, runtimeId, "failover_history");
}

export function getExecutionCheckpoints(db: SqliteDatabase, runtimeId: string): readonly ReplayExecutionCheckpointRecord[] {
  return getViewList<ReplayExecutionCheckpointRecord>(db, runtimeId, "execution_checkpoints");
}

export function getRecoveryContinuations(db: SqliteDatabase, runtimeId: string): readonly ReplayRecoveryContinuationRecord[] {
  return getViewList<ReplayRecoveryContinuationRecord>(db, runtimeId, "recovery_continuations");
}

export function getDistributedLeases(db: SqliteDatabase, runtimeId: string): readonly ReplayDistributedLeaseRecord[] {
  return getViewList<ReplayDistributedLeaseRecord>(db, runtimeId, "distributed_leases");
}

export function getSurvivabilityTelemetry(db: SqliteDatabase, runtimeId: string): readonly ReplayRuntimeSurvivabilityTelemetry[] {
  return getViewList<ReplayRuntimeSurvivabilityTelemetry>(db, runtimeId, "survivability_telemetry");
}

export function getOrchestrationHealth(db: SqliteDatabase, runtimeId: string): readonly ReplayOrchestrationHealthRecord[] {
  return getViewList<ReplayOrchestrationHealthRecord>(db, runtimeId, "orchestration_health");
}

export function getExecutionWatchdogs(db: SqliteDatabase, runtimeId: string): readonly ReplayExecutionWatchdogRecord[] {
  return getViewList<ReplayExecutionWatchdogRecord>(db, runtimeId, "execution_watchdogs");
}

export function serializeReplayProductionOrchestrationSnapshot(snapshot: ReplayProductionOrchestrationSnapshot): string {
  return stableProductionStringify(snapshot);
}

export function computeReplayProductionOrchestrationHash(value: unknown): string {
  return crypto.createHash("sha256").update(stableProductionStringify(value)).digest("hex");
}

function buildSchedulerHistory(
  input: ReplayProductionOrchestrationInput,
  nodes: readonly ReplayProductionRuntimeNode[],
  failedNodeIds: ReadonlySet<string>,
): readonly ReplayProductionSchedulerRecord[] {
  const healthyNodes = nodes.filter((node) => node.healthy);
  return deepFreeze(input.runtime_snapshot.cycles.map((cycle, index) => {
    const assignedNode = healthyNodes[index % Math.max(1, healthyNodes.length)] ?? nodes[0];
    const tick = input.runtime_snapshot.scheduler_history.find((item) => item.cycle_id === cycle.cycle_id);
    const state: ReplayProductionOrchestrationState = assignedNode ? "scheduling" : "degraded";
    const seed = {
      runtime_id: input.runtime_snapshot.runtime_id,
      cycle_id: cycle.cycle_id,
      scheduled_for: tick?.scheduled_for ?? input.generated_at,
      assigned_node_id: assignedNode?.node_id ?? "unassigned",
      state,
      action: "schedule_production_replay" as ReplayProductionOrchestrationAction,
    };
    const scheduleHash = computeReplayProductionOrchestrationHash(seed);
    return {
      schedule_id: `replay-production-schedule:${scheduleHash}`,
      ...seed,
      schedule_hash: scheduleHash,
    };
  }));
}

function buildDistributedLeases(
  input: ReplayProductionOrchestrationInput,
  scheduler: readonly ReplayProductionSchedulerRecord[],
): readonly ReplayDistributedLeaseRecord[] {
  const ttl = input.lease_ttl_ms ?? DEFAULT_LEASE_TTL_MS;
  return deepFreeze(scheduler.map((record) => {
    const acquiredAt = record.scheduled_for;
    const expiresAt = new Date(Date.parse(acquiredAt) + ttl).toISOString();
    const seed = {
      runtime_id: input.runtime_snapshot.runtime_id,
      cycle_id: record.cycle_id,
      node_id: record.assigned_node_id,
      acquired_at: acquiredAt,
      expires_at: expiresAt,
      active: Date.parse(input.generated_at) <= Date.parse(expiresAt),
      fenced_token: computeReplayProductionOrchestrationHash({
        cycle_id: record.cycle_id,
        node_id: record.assigned_node_id,
        acquired_at: acquiredAt,
      }),
    };
    const leaseHash = computeReplayProductionOrchestrationHash(seed);
    return {
      lease_id: `replay-production-lease:${leaseHash}`,
      ...seed,
      lease_hash: leaseHash,
    };
  }));
}

function buildExecutionCheckpoints(input: ReplayProductionOrchestrationInput): readonly ReplayExecutionCheckpointRecord[] {
  return deepFreeze(input.runtime_snapshot.cycles.map((cycle) => {
    const seed = {
      runtime_id: input.runtime_snapshot.runtime_id,
      cycle_id: cycle.cycle_id,
      checkpoint_ordinal: cycle.cycle_ordinal,
      runtime_state_hash: cycle.cycle_hash,
      observability_hash: input.observability_snapshot.deterministic_hash,
      restorable: cycle.state !== "recovering" || input.runtime_snapshot.recovery_monitoring.some((record) => record.cycle_id === cycle.cycle_id),
    };
    const checkpointHash = computeReplayProductionOrchestrationHash(seed);
    return {
      checkpoint_id: `replay-production-checkpoint:${checkpointHash}`,
      ...seed,
      checkpoint_hash: checkpointHash,
    };
  }));
}

function buildFailoverHistory(
  input: ReplayProductionOrchestrationInput,
  nodes: readonly ReplayProductionRuntimeNode[],
  scheduler: readonly ReplayProductionSchedulerRecord[],
  failedNodeIds: ReadonlySet<string>,
): readonly ReplayOrchestrationFailoverRecord[] {
  const healthyNodes = nodes.filter((node) => node.healthy && !failedNodeIds.has(node.node_id));
  return deepFreeze(scheduler
    .filter((record) => failedNodeIds.has(record.assigned_node_id) || !nodes.find((node) => node.node_id === record.assigned_node_id)?.healthy)
    .map((record, index) => {
      const promotedNode = healthyNodes[index % Math.max(1, healthyNodes.length)] ?? nodes.find((node) => node.node_id !== record.assigned_node_id);
      const seed = {
        cycle_id: record.cycle_id,
        failed_node_id: record.assigned_node_id,
        promoted_node_id: promotedNode?.node_id ?? "none",
        reason: "production_runtime_node_unavailable",
        failover_required: true,
      };
      const failoverHash = computeReplayProductionOrchestrationHash(seed);
      return {
        failover_id: `replay-production-failover:${failoverHash}`,
        ...seed,
        failover_hash: failoverHash,
      };
    }));
}

function buildRecoveryContinuations(
  input: ReplayProductionOrchestrationInput,
  checkpoints: readonly ReplayExecutionCheckpointRecord[],
): readonly ReplayRecoveryContinuationRecord[] {
  return deepFreeze(input.runtime_snapshot.cycles.map((cycle) => {
    const checkpoint = required(checkpoints.find((record) => record.cycle_id === cycle.cycle_id), "checkpoint missing");
    const recoveryRequired = input.runtime_snapshot.recovery_monitoring.some((record) => record.cycle_id === cycle.cycle_id && record.recovery_required) ||
      input.runtime_snapshot.consensus_drift.some((record) => record.cycle_id === cycle.cycle_id && record.drift_detected);
    const seed = {
      cycle_id: cycle.cycle_id,
      checkpoint_id: checkpoint.checkpoint_id,
      recovery_required: recoveryRequired,
      continuation_action: "continue_recovery_replay" as ReplayProductionOrchestrationAction,
    };
    const continuationHash = computeReplayProductionOrchestrationHash(seed);
    return {
      continuation_id: `replay-production-continuation:${continuationHash}`,
      ...seed,
      continuation_hash: continuationHash,
    };
  }));
}

function buildCoordinationPersistence(
  input: ReplayProductionOrchestrationInput,
  scheduler: readonly ReplayProductionSchedulerRecord[],
  leases: readonly ReplayDistributedLeaseRecord[],
  checkpoints: readonly ReplayExecutionCheckpointRecord[],
): readonly ReplayDistributedRuntimeCoordinationRecord[] {
  return deepFreeze(scheduler.map((schedule) => {
    const lease = required(leases.find((record) => record.cycle_id === schedule.cycle_id), "lease missing");
    const checkpoint = required(checkpoints.find((record) => record.cycle_id === schedule.cycle_id), "checkpoint missing");
    const seed = {
      runtime_id: input.runtime_snapshot.runtime_id,
      cycle_id: schedule.cycle_id,
      node_id: schedule.assigned_node_id,
      lease_id: lease.lease_id,
      checkpoint_id: checkpoint.checkpoint_id,
      runtime_hash: input.runtime_snapshot.deterministic_hash,
      persisted_at: input.persisted_at,
    };
    const coordinationHash = computeReplayProductionOrchestrationHash(seed);
    return {
      coordination_id: `replay-production-coordination:${coordinationHash}`,
      ...seed,
      coordination_hash: coordinationHash,
    };
  }));
}

function buildSurvivabilityTelemetry(
  input: ReplayProductionOrchestrationInput,
  leases: readonly ReplayDistributedLeaseRecord[],
  checkpoints: readonly ReplayExecutionCheckpointRecord[],
  continuations: readonly ReplayRecoveryContinuationRecord[],
): readonly ReplayRuntimeSurvivabilityTelemetry[] {
  return deepFreeze(input.runtime_snapshot.cycles.map((cycle) => {
    const lease = required(leases.find((record) => record.cycle_id === cycle.cycle_id), "lease missing");
    const checkpoint = required(checkpoints.find((record) => record.cycle_id === cycle.cycle_id), "checkpoint missing");
    const continuation = required(continuations.find((record) => record.cycle_id === cycle.cycle_id), "continuation missing");
    const driftDetected = input.runtime_snapshot.consensus_drift.some((record) => record.cycle_id === cycle.cycle_id && record.drift_detected);
    const survivabilityScore = roundProductionNumber(Math.max(0, Math.min(1,
      (lease.active ? 0.28 : 0) +
      (checkpoint.restorable ? 0.28 : 0) +
      (continuation.recovery_required ? 0.22 : 0.14) +
      (driftDetected ? 0.08 : 0.22),
    )));
    const seed = {
      runtime_id: input.runtime_snapshot.runtime_id,
      cycle_id: cycle.cycle_id,
      lease_active: lease.active,
      checkpoint_restorable: checkpoint.restorable,
      recovery_ready: continuation.recovery_required || checkpoint.restorable,
      drift_detected: driftDetected,
      survivability_score: survivabilityScore,
    };
    const telemetryHash = computeReplayProductionOrchestrationHash(seed);
    return {
      telemetry_id: `replay-production-survivability:${telemetryHash}`,
      ...seed,
      telemetry_hash: telemetryHash,
    };
  }));
}

function buildOrchestrationHealth(
  input: ReplayProductionOrchestrationInput,
  nodes: readonly ReplayProductionRuntimeNode[],
  leases: readonly ReplayDistributedLeaseRecord[],
  failovers: readonly ReplayOrchestrationFailoverRecord[],
): readonly ReplayOrchestrationHealthRecord[] {
  return deepFreeze(nodes.map((node) => {
    const activeLeaseCount = leases.filter((lease) => lease.node_id === node.node_id && lease.active).length;
    const failoverCount = failovers.filter((failover) => failover.failed_node_id === node.node_id).length;
    const healthScore = roundProductionNumber(Math.max(0, Math.min(1,
      (node.healthy ? 0.62 : 0.12) +
      Math.min(0.18, activeLeaseCount * 0.06) -
      Math.min(0.35, failoverCount * 0.2) +
      (Date.parse(input.generated_at) - Date.parse(node.last_seen_at) < (input.lease_ttl_ms ?? DEFAULT_LEASE_TTL_MS) ? 0.2 : 0),
    )));
    const seed = {
      runtime_id: input.runtime_snapshot.runtime_id,
      node_id: node.node_id,
      healthy: node.healthy,
      active_lease_count: activeLeaseCount,
      failover_count: failoverCount,
      health_score: healthScore,
    };
    const healthHash = computeReplayProductionOrchestrationHash(seed);
    return {
      health_id: `replay-production-health:${healthHash}`,
      ...seed,
      health_hash: healthHash,
    };
  }).sort((left, right) => left.node_id.localeCompare(right.node_id)));
}

function buildExecutionWatchdogs(input: ReplayProductionOrchestrationInput): readonly ReplayExecutionWatchdogRecord[] {
  const timeout = input.watchdog_timeout_ms ?? DEFAULT_WATCHDOG_TIMEOUT_MS;
  return deepFreeze(input.runtime_snapshot.scheduler_history.map((tick) => {
    const timedOut = Math.abs(tick.drift_ms) > timeout;
    const seed = {
      cycle_id: tick.cycle_id,
      scheduler_drift_ms: tick.drift_ms,
      timeout_ms: timeout,
      timed_out: timedOut,
      action: "execute_watchdog" as ReplayProductionOrchestrationAction,
    };
    const watchdogHash = computeReplayProductionOrchestrationHash(seed);
    return {
      watchdog_id: `replay-production-watchdog:${watchdogHash}`,
      ...seed,
      watchdog_hash: watchdogHash,
    };
  }));
}

function classifyProductionState(
  failovers: readonly ReplayOrchestrationFailoverRecord[],
  survivability: readonly ReplayRuntimeSurvivabilityTelemetry[],
  health: readonly ReplayOrchestrationHealthRecord[],
  watchdogs: readonly ReplayExecutionWatchdogRecord[],
): ReplayProductionOrchestrationState {
  if (watchdogs.some((record) => record.timed_out)) return "degraded";
  if (failovers.some((record) => record.failover_required)) return "failing_over";
  if (health.some((record) => !record.healthy || record.health_score < 0.45)) return "degraded";
  if (survivability.some((record) => record.recovery_ready && record.drift_detected)) return "recovering";
  if (survivability.every((record) => record.survivability_score >= 0.72)) return "survivable";
  return "checkpointed";
}

function normalizeNodes(nodes: readonly ReplayProductionRuntimeNode[]): readonly ReplayProductionRuntimeNode[] {
  return deepFreeze([...nodes].sort((left, right) =>
    right.priority - left.priority ||
    left.node_id.localeCompare(right.node_id),
  ));
}

function persistReplayProductionOrchestrationSnapshot(
  db: SqliteDatabase,
  snapshot: ReplayProductionOrchestrationSnapshot,
): void {
  const write = db.transaction(() => {
    db.prepare(`
      INSERT OR REPLACE INTO replay_production_orchestration_snapshots
      (production_id, runtime_id, generated_at, persisted_at, state, deterministic_hash, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(snapshot.production_id, snapshot.runtime_id, snapshot.generated_at, snapshot.persisted_at, snapshot.state, snapshot.deterministic_hash, stableProductionStringify(snapshot));

    for (const record of snapshot.scheduler_history) persistView(db, snapshot, "scheduler_history", record.schedule_id, record.schedule_hash, record);
    for (const record of snapshot.coordination_persistence) persistView(db, snapshot, "coordination_persistence", record.coordination_id, record.coordination_hash, record);
    for (const record of snapshot.failover_history) persistView(db, snapshot, "failover_history", record.failover_id, record.failover_hash, record);
    for (const record of snapshot.execution_checkpoints) persistView(db, snapshot, "execution_checkpoints", record.checkpoint_id, record.checkpoint_hash, record);
    for (const record of snapshot.recovery_continuations) persistView(db, snapshot, "recovery_continuations", record.continuation_id, record.continuation_hash, record);
    for (const record of snapshot.distributed_leases) persistView(db, snapshot, "distributed_leases", record.lease_id, record.lease_hash, record);
    for (const record of snapshot.survivability_telemetry) persistView(db, snapshot, "survivability_telemetry", record.telemetry_id, record.telemetry_hash, record);
    for (const record of snapshot.orchestration_health) persistView(db, snapshot, "orchestration_health", record.health_id, record.health_hash, record);
    for (const record of snapshot.execution_watchdogs) persistView(db, snapshot, "execution_watchdogs", record.watchdog_id, record.watchdog_hash, record);
  });
  write();
}

function persistView(
  db: SqliteDatabase,
  snapshot: ReplayProductionOrchestrationSnapshot,
  viewKind: string,
  viewId: string,
  viewHash: string,
  payload: unknown,
): void {
  db.prepare(`
    INSERT OR REPLACE INTO replay_production_orchestration_views
    (view_id, production_id, runtime_id, view_kind, view_hash, payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(viewId, snapshot.production_id, snapshot.runtime_id, viewKind, viewHash, stableProductionStringify(payload));
}

function getViewList<T>(db: SqliteDatabase, runtimeId: string, viewKind: string): readonly T[] {
  initializeReplayProductionOrchestrationSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_production_orchestration_views
    WHERE runtime_id = ? AND view_kind = ?
    ORDER BY view_hash ASC
  `).all(runtimeId, viewKind) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as T));
}

function required<T>(value: T | undefined, message: string): T {
  if (typeof value === "undefined") throw new Error(message);
  return value;
}

function roundProductionNumber(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function stableProductionStringify(value: unknown): string {
  return JSON.stringify(sortProductionKeys(value));
}

function sortProductionKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortProductionKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortProductionKeys((value as Record<string, unknown>)[key]);
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
