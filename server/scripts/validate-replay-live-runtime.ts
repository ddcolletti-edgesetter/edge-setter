import Database from "better-sqlite3";

import {
  buildReplayLiveRuntimeSnapshot,
  computeReplayLiveRuntimeHash,
  getExecutionStateStream,
  getRuntimeCycles,
  getRuntimeTelemetry,
  serializeReplayLiveRuntimeSnapshot,
} from "../pipeline/replay-live-runtime";
import type {
  ReplayLiveRuntimeAction,
  ReplayLiveRuntimeState,
} from "../pipeline/replay-live-runtime-contract";
import type {
  ReplayLiveBridgeInput,
} from "../pipeline/replay-live-intelligence-bridge-contract";
import type {
  LiveSignal,
  Outcome,
  RawEvent,
  ScoreBreakdown,
} from "../pipeline/types";

const GENERATED_AT = "2026-05-20T07:00:00.000Z";
const PERSISTED_AT = "2026-05-20T07:05:00.000Z";
const INTERVAL_MS = 60_000;

const cycleOne = bridgeInput("runtime-a", "2026-05-20T07:00:00.000Z", [
  signalSpec("runtime-a-injury-win", "injury_update", "BOS", "Jayson Tatum", "ESPN NBA Injuries", true, 2.4, 88, 90),
  signalSpec("runtime-a-line-win", "line_move", "NYK", null, "Market Watch", true, 1.2, 82, 84),
]);
const cycleTwo = bridgeInput("runtime-b", "2026-05-20T07:01:15.000Z", [
  signalSpec("runtime-b-injury-loss", "injury_update", "MIA", "Jimmy Butler", "Unverified Beat", false, -2.3, 62, 58),
  signalSpec("runtime-b-line-loss", "line_move", "LAL", null, "Market Watch", false, -1.7, 73, 70),
]);

const db = new Database(":memory:");

try {
  const runtime = buildReplayLiveRuntimeSnapshot(db, {
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    scheduler_interval_ms: INTERVAL_MS,
    cycles: [
      { cycle_id: "runtime-cycle-a", bridge_input: cycleOne },
      { cycle_id: "runtime-cycle-b", bridge_input: cycleTwo },
    ],
    drift_threshold: 0.12,
  });
  const runtimeAgain = buildReplayLiveRuntimeSnapshot(db, {
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    scheduler_interval_ms: INTERVAL_MS,
    cycles: [
      { cycle_id: "runtime-cycle-a", bridge_input: cycleOne },
      { cycle_id: "runtime-cycle-b", bridge_input: cycleTwo },
    ],
    drift_threshold: 0.12,
  });

  assertEqual(runtime.deterministic_hash, runtimeAgain.deterministic_hash, "runtime hash must be deterministic");
  assertEqual(serializeReplayLiveRuntimeSnapshot(runtime), serializeReplayLiveRuntimeSnapshot(runtimeAgain), "runtime serialization mismatch");
  assertEqual(computeReplayLiveRuntimeHash({ runtime: runtime.runtime_id }).length, 64, "runtime hash helper mismatch");
  assertEqual(Object.isFrozen(runtime), true, "runtime snapshot must be immutable");
  assertEqual(Object.isFrozen(runtime.state_stream), true, "runtime stream must be immutable");

  assertEqual(runtime.cycles.length, 2, "runtime cycle count mismatch");
  assertEqual(runtime.executed_cycles.length, 2, "executed cycle count mismatch");
  assertEqual(runtime.scheduler_history.length, 2, "scheduler history missing");
  assertEqual(runtime.scheduler_history.some((tick) => tick.drift_ms !== 0), true, "scheduler drift monitoring missing");
  assertEqual(runtime.validator_execution_loops.length > 0, true, "validator execution loops missing");
  assertEqual(runtime.consensus_coordination.length > 0, true, "runtime consensus coordination missing");
  assertEqual(runtime.telemetry.length, 2, "runtime telemetry missing");
  assertEqual(runtime.recovery_monitoring.length > 0, true, "live recovery monitoring missing");
  assertEqual(runtime.state_stream.length, runtime.cycles.length * 5, "execution state stream mismatch");
  assertEqual(runtime.intelligence_propagation.length, 2, "runtime intelligence propagation missing");
  assertEqual(runtime.consensus_drift.some((record) => record.drift_detected), true, "consensus drift monitoring missing");
  assertEqual(runtime.validator_execution_loops.some((loop) => loop.adapted_weight !== 1), true, "adaptive validator weighting did not reach runtime loops");
  assertEqual(runtime.executed_cycles.every((cycle) => cycle.trust_snapshot.validator_profiles.length > 0), true, "validator trust evolution missing from runtime cycles");
  assertEqual(runtime.executed_cycles.every((cycle) => cycle.bridge_snapshot.governance_snapshot.decisions.length > 0), true, "governance decisions missing from runtime cycles");
  assertEqual(runtime.executed_cycles.every((cycle) => cycle.bridge_snapshot.consensus_intelligence.synthesis.length > 0), true, "runtime intelligence propagation source missing");

  assertEqual(getRuntimeCycles(db, runtime.runtime_id).length, runtime.cycles.length, "runtime cycle query mismatch");
  assertEqual(getExecutionStateStream(db, runtime.runtime_id).length, runtime.state_stream.length, "state stream query mismatch");
  assertEqual(getRuntimeTelemetry(db, runtime.runtime_id).length, runtime.telemetry.length, "telemetry query mismatch");

  assertActionSupported("schedule_live_cycle");
  assertActionSupported("execute_live_replay");
  assertActionSupported("run_validator_loop");
  assertActionSupported("coordinate_runtime_consensus");
  assertActionSupported("emit_runtime_telemetry");
  assertActionSupported("monitor_live_recovery");
  assertActionSupported("stream_execution_state");
  assertActionSupported("propagate_runtime_intelligence");
  assertActionSupported("monitor_consensus_drift");
  assertActionSupported("freeze_runtime_snapshot");
  assertStateSupported("scheduled");
  assertStateSupported("executing");
  assertStateSupported("coordinating");
  assertStateSupported("propagating");
  assertStateSupported("recovering");
  assertStateSupported("stabilized");
  assertStateSupported("drifting");

  console.log("Replay live runtime validation passed.");
  console.log(JSON.stringify({
    runtime_id: runtime.runtime_id,
    deterministic_hash: runtime.deterministic_hash,
    state: runtime.state,
    cycles: runtime.cycles.length,
    scheduler_ticks: runtime.scheduler_history.length,
    validator_loops: runtime.validator_execution_loops.length,
    consensus_coordination: runtime.consensus_coordination.length,
    telemetry: runtime.telemetry.length,
    recovery_monitoring: runtime.recovery_monitoring.length,
    stream_events: runtime.state_stream.length,
    intelligence_propagation: runtime.intelligence_propagation.length,
    drift_records: runtime.consensus_drift.length,
    drift_detected: runtime.consensus_drift.filter((record) => record.drift_detected).length,
    immutable_outputs: {
      snapshot: Object.isFrozen(runtime),
      state_stream: Object.isFrozen(runtime.state_stream),
    },
  }, null, 2));
} finally {
  db.close();
}

interface SignalSpec {
  readonly id: string;
  readonly signalType: LiveSignal["signal_type"];
  readonly team: string;
  readonly player: string | null;
  readonly sourceName: string;
  readonly hit: boolean;
  readonly clv: number;
  readonly confidence: number;
  readonly score: number;
}

function signalSpec(
  id: string,
  signalType: LiveSignal["signal_type"],
  team: string,
  player: string | null,
  sourceName: string,
  hit: boolean,
  clv: number,
  confidence: number,
  score: number,
): SignalSpec {
  return { id, signalType, team, player, sourceName, hit, clv, confidence, score };
}

function bridgeInput(prefix: string, generatedAt: string, specs: readonly SignalSpec[]): ReplayLiveBridgeInput {
  const persistedAt = new Date(Date.parse(generatedAt) + 5_000).toISOString();
  const liveSignals = specs.map((spec) => liveSignal(prefix, spec));
  const settledOutcomes = specs.map((spec) => outcome(prefix, spec));
  return {
    generated_at: generatedAt,
    persisted_at: persistedAt,
    raw_events: specs.map((spec) => rawEvent(prefix, spec)),
    live_signals: liveSignals,
    odds_snapshots: [{
      id: `${prefix}-odds`,
      game_id: `${prefix}-game-1`,
      league: "NBA",
      sportsbook: "DraftKings",
      market_source: "the_odds_api",
      spread_line: specs.some((spec) => !spec.hit) ? 2.5 : -5.5,
      spread_team: specs[0]?.team ?? "BOS",
      total_line: 218.5,
      moneyline_home: -180,
      moneyline_away: 155,
      source_game_id: `${prefix}-source-game`,
      snapshot_at: generatedAt,
    }],
    injury_reports: specs
      .filter((spec) => spec.signalType === "injury_update")
      .map((spec) => ({
        report_id: `${prefix}-injury-${spec.id}`,
        league: "NBA",
        team: spec.team,
        player: spec.player ?? "Unknown",
        designation: spec.hit ? "OUT" : "Questionable",
        body_part: "ankle",
        source_id: spec.sourceName.toLowerCase().replace(/\s+/g, "-"),
        confidence: spec.confidence,
        reported_at: generatedAt,
      })),
    source_intelligence_events: specs.map((spec) => ({
      event_id: `${prefix}-source-${spec.id}`,
      source_id: spec.sourceName.toLowerCase().replace(/\s+/g, "-"),
      source_name: spec.sourceName,
      source_type: spec.sourceName === "Unverified Beat" ? "scrape" : "api",
      reliability_score: spec.sourceName === "Unverified Beat" ? 48 : spec.hit ? 88 : 72,
      topic: spec.signalType === "injury_update" ? "injury" : "odds",
      league: "NBA",
      signal_id: spec.id,
      observed_at: generatedAt,
    })),
    settled_outcomes: settledOutcomes,
    consensus_threshold: 0.6,
    approval_threshold: 0.52,
  };
}

function rawEvent(prefix: string, spec: SignalSpec): RawEvent {
  return {
    id: `${prefix}-raw-${spec.id}`,
    source_id: spec.sourceName.toLowerCase().replace(/\s+/g, "-"),
    source_type: spec.sourceName === "Unverified Beat" ? "scrape" : "api",
    league: "NBA",
    game_id: `${prefix}-game-${spec.id}`,
    team: spec.team,
    player: spec.player,
    event_type: spec.signalType === "line_move" ? "line_move" : "injury_update",
    payload: spec.signalType === "line_move"
      ? { open_line: 4.5, current_line: spec.hit ? 6 : 2.5, confidence: spec.confidence }
      : { designation: spec.hit ? "OUT" : "Questionable", confidence: spec.confidence },
    processed: true,
    processed_at: "2026-05-20T07:00:30.000Z",
    created_at: "2026-05-20T07:00:00.000Z",
    received_at: "2026-05-20T07:00:00.000Z",
  };
}

function liveSignal(prefix: string, spec: SignalSpec): LiveSignal {
  return {
    id: spec.id,
    league: "NBA",
    game_id: `${prefix}-game-${spec.id}`,
    signal_type: spec.signalType,
    headline: `${spec.sourceName} ${spec.signalType}`,
    body: "Live runtime validation fixture.",
    action_note: "Execute runtime replay intelligence.",
    why_it_matters: "Runtime cycle validates continuous replay execution.",
    team: spec.team,
    player: spec.player,
    matchup: "Fixture matchup",
    sources: [{ name: spec.sourceName, type: spec.sourceName === "Unverified Beat" ? "scrape" : "api" }],
    source_count: 1,
    verdict: spec.sourceName === "Unverified Beat" ? "rumor" : "likely",
    confidence: spec.confidence,
    confirmation_strength: spec.sourceName === "Unverified Beat" ? "Developing" : "Corroborated",
    line_movement: spec.signalType === "line_move" ? { open: 4.5, current: spec.hit ? 6 : 2.5, delta: spec.hit ? 1.5 : 2, direction: spec.hit ? "up" : "down" } : null,
    injury_designation: spec.signalType === "injury_update" ? (spec.hit ? "OUT" : "Questionable") : null,
    lineup_status: null,
    weather_note: null,
    betting_relevance: true,
    fantasy_relevance: spec.signalType === "injury_update",
    score: spec.score,
    score_band: spec.score >= 85 ? "Elite" : "Strong",
    urgency_label: "URGENT",
    urgency_reason: "Runtime fixture",
    trust_label: "Corroborated",
    score_explanation: "Deterministic runtime score",
    breakdown: breakdown(),
    raw_event_ids: [`${prefix}-raw-${spec.id}`],
    signal_time: "2026-05-20T07:00:00.000Z",
    created_at: "2026-05-20T07:00:30.000Z",
    updated_at: "2026-05-20T07:00:30.000Z",
    outcome_id: `${prefix}-outcome-${spec.id}`,
  };
}

function outcome(prefix: string, spec: SignalSpec): Outcome {
  return {
    id: `${prefix}-outcome-${spec.id}`,
    signal_id: spec.id,
    game_id: `${prefix}-game-${spec.id}`,
    home_score: spec.hit ? 114 : 101,
    away_score: spec.hit ? 103 : 109,
    market: "spread",
    line_at_signal: spec.hit ? -4.5 : 2.5,
    closing_line: spec.hit ? -6 : 4.2,
    actual_result: spec.hit ? 11 : -8,
    hit: spec.hit,
    clv: spec.clv,
    recorded_at: "2026-05-20T09:30:00.000Z",
    created_at: "2026-05-20T09:30:00.000Z",
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
    leagueModifierApplied: "NBA runtime fixture",
    rawBeforeMods: 82,
  };
}

function assertActionSupported(_action: ReplayLiveRuntimeAction): void { return; }
function assertStateSupported(_state: ReplayLiveRuntimeState): void { return; }

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
}
