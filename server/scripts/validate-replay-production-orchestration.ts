import Database from "better-sqlite3";

import { buildReplayLiveRuntimeSnapshot } from "../pipeline/replay-live-runtime";
import type { ReplayLiveRuntimeInput } from "../pipeline/replay-live-runtime-contract";
import { buildReplayObservabilitySnapshot } from "../pipeline/replay-observability";
import {
  buildReplayProductionOrchestrationSnapshot,
  computeReplayProductionOrchestrationHash,
  getDistributedCoordinationPersistence,
  getDistributedLeases,
  getExecutionCheckpoints,
  getExecutionWatchdogs,
  getOrchestrationFailoverHistory,
  getOrchestrationHealth,
  getProductionSchedulerHistory,
  getRecoveryContinuations,
  getSurvivabilityTelemetry,
  serializeReplayProductionOrchestrationSnapshot,
} from "../pipeline/replay-production-orchestration";
import type {
  ReplayProductionOrchestrationAction,
  ReplayProductionOrchestrationState,
} from "../pipeline/replay-production-orchestration-contract";
import type { ReplayLiveBridgeInput } from "../pipeline/replay-live-intelligence-bridge-contract";
import type { LiveSignal, Outcome, RawEvent, ScoreBreakdown } from "../pipeline/types";

const GENERATED_AT = "2026-05-20T13:00:00.000Z";
const PERSISTED_AT = "2026-05-20T13:05:00.000Z";

const runtimeInput: ReplayLiveRuntimeInput = {
  generated_at: GENERATED_AT,
  persisted_at: PERSISTED_AT,
  scheduler_interval_ms: 60_000,
  drift_threshold: 0.12,
  cycles: [
    { cycle_id: "production-cycle-a", bridge_input: bridgeInput("prod-a", "2026-05-20T13:00:00.000Z", true) },
    { cycle_id: "production-cycle-b", bridge_input: bridgeInput("prod-b", "2026-05-20T13:01:35.000Z", false) },
  ],
};

const db = new Database(":memory:");

try {
  const runtime = buildReplayLiveRuntimeSnapshot(db, runtimeInput);
  const observability = buildReplayObservabilitySnapshot(db, {
    generated_at: "2026-05-20T13:06:00.000Z",
    runtime_snapshot: runtime,
  });
  const production = buildReplayProductionOrchestrationSnapshot(db, {
    generated_at: "2026-05-20T13:06:30.000Z",
    persisted_at: "2026-05-20T13:07:00.000Z",
    runtime_snapshot: runtime,
    observability_snapshot: observability,
    lease_ttl_ms: 180_000,
    watchdog_timeout_ms: 30_000,
    failed_node_ids: ["prod-node-a"],
    runtime_nodes: [
      { node_id: "prod-node-a", region: "us-west", priority: 100, healthy: true, last_seen_at: "2026-05-20T13:00:00.000Z" },
      { node_id: "prod-node-b", region: "us-east", priority: 90, healthy: true, last_seen_at: "2026-05-20T13:06:00.000Z" },
      { node_id: "prod-node-c", region: "us-central", priority: 80, healthy: false, last_seen_at: "2026-05-20T12:55:00.000Z" },
    ],
  });
  const productionAgain = buildReplayProductionOrchestrationSnapshot(db, {
    generated_at: "2026-05-20T13:06:30.000Z",
    persisted_at: "2026-05-20T13:07:00.000Z",
    runtime_snapshot: runtime,
    observability_snapshot: observability,
    lease_ttl_ms: 180_000,
    watchdog_timeout_ms: 30_000,
    failed_node_ids: ["prod-node-a"],
    runtime_nodes: [
      { node_id: "prod-node-a", region: "us-west", priority: 100, healthy: true, last_seen_at: "2026-05-20T13:00:00.000Z" },
      { node_id: "prod-node-b", region: "us-east", priority: 90, healthy: true, last_seen_at: "2026-05-20T13:06:00.000Z" },
      { node_id: "prod-node-c", region: "us-central", priority: 80, healthy: false, last_seen_at: "2026-05-20T12:55:00.000Z" },
    ],
  });

  assertEqual(production.deterministic_hash, productionAgain.deterministic_hash, "production hash must be deterministic");
  assertEqual(serializeReplayProductionOrchestrationSnapshot(production), serializeReplayProductionOrchestrationSnapshot(productionAgain), "production serialization mismatch");
  assertEqual(computeReplayProductionOrchestrationHash({ production: production.production_id }).length, 64, "production hash helper mismatch");
  assertEqual(Object.isFrozen(production), true, "production snapshot must be immutable");
  assertEqual(Object.isFrozen(production.execution_checkpoints), true, "checkpoints must be immutable");

  assertEqual(production.scheduler_history.length, runtime.cycles.length, "production scheduler count mismatch");
  assertEqual(production.coordination_persistence.length, runtime.cycles.length, "distributed coordination persistence missing");
  assertEqual(production.failover_history.some((record) => record.failover_required), true, "orchestration failover missing");
  assertEqual(production.execution_checkpoints.length, runtime.cycles.length, "execution checkpoints missing");
  assertEqual(production.execution_checkpoints.every((record) => record.restorable), true, "checkpoint restorable behavior missing");
  assertEqual(production.recovery_continuations.some((record) => record.recovery_required), true, "runtime recovery continuation missing");
  assertEqual(production.distributed_leases.every((lease) => lease.fenced_token.length === 64), true, "distributed lease fencing missing");
  assertEqual(production.survivability_telemetry.length, runtime.cycles.length, "survivability telemetry missing");
  assertEqual(production.survivability_telemetry.every((record) => record.survivability_score >= 0 && record.survivability_score <= 1), true, "survivability score out of range");
  assertEqual(production.orchestration_health.some((record) => !record.healthy || record.health_score < 0.45), true, "health monitoring missing degraded node");
  assertEqual(production.execution_watchdogs.some((record) => record.timed_out), true, "execution watchdog timeout missing");

  assertEqual(getProductionSchedulerHistory(db, runtime.runtime_id).length, production.scheduler_history.length, "scheduler query mismatch");
  assertEqual(getDistributedCoordinationPersistence(db, runtime.runtime_id).length, production.coordination_persistence.length, "coordination query mismatch");
  assertEqual(getOrchestrationFailoverHistory(db, runtime.runtime_id).length, production.failover_history.length, "failover query mismatch");
  assertEqual(getExecutionCheckpoints(db, runtime.runtime_id).length, production.execution_checkpoints.length, "checkpoint query mismatch");
  assertEqual(getRecoveryContinuations(db, runtime.runtime_id).length, production.recovery_continuations.length, "continuation query mismatch");
  assertEqual(getDistributedLeases(db, runtime.runtime_id).length, production.distributed_leases.length, "lease query mismatch");
  assertEqual(getSurvivabilityTelemetry(db, runtime.runtime_id).length, production.survivability_telemetry.length, "survivability query mismatch");
  assertEqual(getOrchestrationHealth(db, runtime.runtime_id).length, production.orchestration_health.length, "health query mismatch");
  assertEqual(getExecutionWatchdogs(db, runtime.runtime_id).length, production.execution_watchdogs.length, "watchdog query mismatch");

  assertActionSupported("schedule_production_replay");
  assertActionSupported("persist_runtime_coordination");
  assertActionSupported("handle_orchestration_failover");
  assertActionSupported("checkpoint_replay_execution");
  assertActionSupported("continue_recovery_replay");
  assertActionSupported("coordinate_distributed_lease");
  assertActionSupported("emit_survivability_telemetry");
  assertActionSupported("monitor_orchestration_health");
  assertActionSupported("execute_watchdog");
  assertActionSupported("freeze_production_snapshot");
  assertStateSupported("scheduling");
  assertStateSupported("leased");
  assertStateSupported("executing");
  assertStateSupported("checkpointed");
  assertStateSupported("failing_over");
  assertStateSupported("recovering");
  assertStateSupported("survivable");
  assertStateSupported("degraded");

  console.log("Replay production orchestration validation passed.");
  console.log(JSON.stringify({
    production_id: production.production_id,
    runtime_id: production.runtime_id,
    deterministic_hash: production.deterministic_hash,
    state: production.state,
    scheduler_records: production.scheduler_history.length,
    coordination_records: production.coordination_persistence.length,
    failovers: production.failover_history.length,
    checkpoints: production.execution_checkpoints.length,
    continuations: production.recovery_continuations.length,
    leases: production.distributed_leases.length,
    survivability_records: production.survivability_telemetry.length,
    health_records: production.orchestration_health.length,
    watchdogs: production.execution_watchdogs.length,
    immutable_outputs: {
      snapshot: Object.isFrozen(production),
      checkpoints: Object.isFrozen(production.execution_checkpoints),
    },
  }, null, 2));
} finally {
  db.close();
}

function bridgeInput(prefix: string, generatedAt: string, positive: boolean): ReplayLiveBridgeInput {
  const specs = [
    { id: `${prefix}-injury`, signalType: "injury_update" as const, team: positive ? "BOS" : "MIA", player: positive ? "Jayson Tatum" : "Jimmy Butler", source: positive ? "ESPN NBA Injuries" : "Unverified Beat", confidence: positive ? 88 : 62, score: positive ? 90 : 58 },
    { id: `${prefix}-line`, signalType: "line_move" as const, team: positive ? "NYK" : "LAL", player: null, source: "Movement Context", confidence: positive ? 82 : 72, score: positive ? 84 : 70 },
  ];
  const signals = specs.map((spec) => liveSignal(prefix, spec, positive));
  return {
    generated_at: generatedAt,
    persisted_at: new Date(Date.parse(generatedAt) + 5_000).toISOString(),
    raw_events: specs.map((spec) => rawEvent(prefix, spec, positive)),
    live_signals: signals,
    odds_snapshots: [{
      id: `${prefix}-odds`,
      game_id: `${prefix}-game`,
      league: "NBA",
      sportsbook: "DraftKings",
      market_source: "the_odds_api",
      spread_line: positive ? -5.5 : 2.5,
      spread_team: positive ? "BOS" : "LAL",
      total_line: 218.5,
      moneyline_home: -180,
      moneyline_away: 155,
      source_game_id: `${prefix}-source-game`,
      snapshot_at: generatedAt,
    }],
    injury_reports: signals.filter((signal) => signal.signal_type === "injury_update").map((signal) => ({
      report_id: `${prefix}-injury-${signal.id}`,
      league: "NBA",
      team: signal.team,
      player: signal.player ?? "Unknown",
      designation: positive ? "OUT" : "Questionable",
      body_part: "ankle",
      source_id: signal.sources[0]?.name.toLowerCase().replace(/\s+/g, "-") ?? "unknown",
      confidence: signal.confidence,
      reported_at: generatedAt,
    })),
    source_intelligence_events: signals.map((signal) => ({
      event_id: `${prefix}-source-${signal.id}`,
      source_id: signal.sources[0]?.name.toLowerCase().replace(/\s+/g, "-") ?? "unknown",
      source_name: signal.sources[0]?.name ?? "Unknown",
      source_type: signal.sources[0]?.type ?? "api",
      reliability_score: signal.sources[0]?.name === "Unverified Beat" ? 48 : positive ? 88 : 72,
      topic: signal.signal_type === "injury_update" ? "injury" : "odds",
      league: "NBA",
      signal_id: signal.id,
      observed_at: generatedAt,
    })),
    settled_outcomes: signals.map((signal) => outcome(prefix, signal, positive)),
    consensus_threshold: 0.6,
    approval_threshold: 0.52,
  };
}

function rawEvent(prefix: string, spec: { id: string; signalType: LiveSignal["signal_type"]; team: string; player: string | null; source: string; confidence: number }, positive: boolean): RawEvent {
  return {
    id: `${prefix}-raw-${spec.id}`,
    source_id: spec.source.toLowerCase().replace(/\s+/g, "-"),
    source_type: spec.source === "Unverified Beat" ? "scrape" : "api",
    league: "NBA",
    game_id: `${prefix}-game-${spec.id}`,
    team: spec.team,
    player: spec.player,
    event_type: spec.signalType === "line_move" ? "line_move" : "injury_update",
    payload: spec.signalType === "line_move" ? { open_line: 4.5, current_line: positive ? 6 : 2.5, confidence: spec.confidence } : { designation: positive ? "OUT" : "Questionable", confidence: spec.confidence },
    processed: true,
    processed_at: "2026-05-20T13:00:30.000Z",
    created_at: "2026-05-20T13:00:00.000Z",
    received_at: "2026-05-20T13:00:00.000Z",
  };
}

function liveSignal(prefix: string, spec: { id: string; signalType: LiveSignal["signal_type"]; team: string; player: string | null; source: string; confidence: number; score: number }, positive: boolean): LiveSignal {
  return {
    id: spec.id,
    league: "NBA",
    game_id: `${prefix}-game-${spec.id}`,
    signal_type: spec.signalType,
    headline: `${spec.source} ${spec.signalType}`,
    body: "Production orchestration validation fixture.",
    action_note: "Supervise replay runtime production execution.",
    why_it_matters: "Production orchestration must survive failures.",
    team: spec.team,
    player: spec.player,
    matchup: "Fixture matchup",
    sources: [{ name: spec.source, type: spec.source === "Unverified Beat" ? "scrape" : "api" }],
    source_count: 1,
    verdict: spec.source === "Unverified Beat" ? "rumor" : "likely",
    confidence: spec.confidence,
    confirmation_strength: spec.source === "Unverified Beat" ? "Developing" : "Corroborated",
    line_movement: spec.signalType === "line_move" ? { open: 4.5, current: positive ? 6 : 2.5, delta: positive ? 1.5 : 2, direction: positive ? "up" : "down" } : null,
    injury_designation: spec.signalType === "injury_update" ? (positive ? "OUT" : "Questionable") : null,
    lineup_status: null,
    weather_note: null,
    betting_relevance: true,
    fantasy_relevance: spec.signalType === "injury_update",
    score: spec.score,
    score_band: spec.score >= 85 ? "Elite" : "Strong",
    urgency_label: "URGENT",
    urgency_reason: "Production fixture",
    trust_label: "Corroborated",
    score_explanation: "Deterministic production score",
    breakdown: breakdown(),
    raw_event_ids: [`${prefix}-raw-${spec.id}`],
    signal_time: "2026-05-20T13:00:00.000Z",
    created_at: "2026-05-20T13:00:30.000Z",
    updated_at: "2026-05-20T13:00:30.000Z",
    outcome_id: `${prefix}-outcome-${spec.id}`,
  };
}

function outcome(prefix: string, signal: LiveSignal, positive: boolean): Outcome {
  return {
    id: `${prefix}-outcome-${signal.id}`,
    signal_id: signal.id,
    game_id: signal.game_id ?? `${prefix}-game`,
    home_score: positive ? 114 : 101,
    away_score: positive ? 103 : 109,
    market: "spread",
    line_at_signal: positive ? -4.5 : 2.5,
    closing_line: positive ? -6 : 4.2,
    actual_result: positive ? 11 : -8,
    hit: positive,
    clv: positive ? 1.5 : -2.1,
    recorded_at: "2026-05-20T15:30:00.000Z",
    created_at: "2026-05-20T15:30:00.000Z",
  };
}

function breakdown(): ScoreBreakdown {
  return {
    confidenceScore: 18,
    sourceQualityScore: 23,
    marketImpactScore: 19,
    recencyBonus: 10,
    relevanceScore: 7,
    contextScore: 5,
    leagueModifierApplied: "NBA production fixture",
    rawBeforeMods: 82,
  };
}

function assertActionSupported(_action: ReplayProductionOrchestrationAction): void { return; }
function assertStateSupported(_state: ReplayProductionOrchestrationState): void { return; }

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
}

