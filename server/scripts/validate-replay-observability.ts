import Database from "better-sqlite3";

import {
  buildReplayLiveRuntimeSnapshot,
} from "../pipeline/replay-live-runtime";
import type {
  ReplayLiveRuntimeInput,
} from "../pipeline/replay-live-runtime-contract";
import type {
  ReplayLiveBridgeInput,
} from "../pipeline/replay-live-intelligence-bridge-contract";
import {
  buildReplayObservabilitySnapshot,
  computeReplayObservabilityHash,
  getConsensusDriftVisualization,
  getGovernanceStateVisualization,
  getRecoveryEventVisualization,
  getReplayExecutionTimeline,
  getReplayLineageGraph,
  getRuntimePropagationVisualization,
  getRuntimeTelemetryAggregation,
  getValidatorTrustEvolution,
  serializeReplayObservabilitySnapshot,
} from "../pipeline/replay-observability";
import type {
  ReplayObservabilityQuery,
  ReplayObservabilityView,
} from "../pipeline/replay-observability-contract";
import type {
  LiveSignal,
  Outcome,
  RawEvent,
  ScoreBreakdown,
} from "../pipeline/types";

const GENERATED_AT = "2026-05-20T10:00:00.000Z";
const PERSISTED_AT = "2026-05-20T10:05:00.000Z";

const runtimeInput: ReplayLiveRuntimeInput = {
  generated_at: GENERATED_AT,
  persisted_at: PERSISTED_AT,
  scheduler_interval_ms: 60_000,
  drift_threshold: 0.12,
  cycles: [
    { cycle_id: "observability-cycle-a", bridge_input: bridgeInput("obs-a", "2026-05-20T10:00:00.000Z", true) },
    { cycle_id: "observability-cycle-b", bridge_input: bridgeInput("obs-b", "2026-05-20T10:01:20.000Z", false) },
  ],
};

const db = new Database(":memory:");

try {
  const runtime = buildReplayLiveRuntimeSnapshot(db, runtimeInput);
  const observability = buildReplayObservabilitySnapshot(db, {
    generated_at: "2026-05-20T10:06:00.000Z",
    runtime_snapshot: runtime,
  });
  const observabilityAgain = buildReplayObservabilitySnapshot(db, {
    generated_at: "2026-05-20T10:06:00.000Z",
    runtime_snapshot: runtime,
  });

  assertEqual(observability.deterministic_hash, observabilityAgain.deterministic_hash, "observability hash must be deterministic");
  assertEqual(serializeReplayObservabilitySnapshot(observability), serializeReplayObservabilitySnapshot(observabilityAgain), "observability serialization mismatch");
  assertEqual(computeReplayObservabilityHash({ observability: observability.observability_id }).length, 64, "observability hash helper mismatch");
  assertEqual(Object.isFrozen(observability), true, "observability snapshot must be immutable");
  assertEqual(Object.isFrozen(observability.replay_execution_timeline), true, "execution timeline must be immutable");

  assertEqual(observability.telemetry_aggregation.cycle_count, runtime.cycles.length, "telemetry aggregation cycle mismatch");
  assertEqual(observability.telemetry_aggregation.total_consensus_results > 0, true, "telemetry consensus aggregation missing");
  assertEqual(observability.consensus_drift_visualization.length, runtime.consensus_drift.length, "drift visualization count mismatch");
  assertEqual(observability.consensus_drift_visualization.some((point) => point.drift_detected), true, "drift visualization missing detected drift");
  assertEqual(observability.validator_trust_evolution.length > 0, true, "validator trust evolution API missing");
  assertEqual(observability.validator_trust_evolution.some((series) => series.points.length >= 1), true, "validator trust series points missing");
  assertEqual(observability.replay_lineage_graph.nodes.length > runtime.cycles.length, true, "lineage graph nodes missing");
  assertEqual(observability.replay_lineage_graph.edges.length > runtime.cycles.length, true, "lineage graph edges missing");
  assertEqual(observability.runtime_propagation_visualization.length, runtime.intelligence_propagation.length, "propagation visualization mismatch");
  assertEqual(observability.governance_state_visualization.length > 0, true, "governance state visualization missing");
  assertEqual(observability.recovery_event_visualization.length, runtime.recovery_monitoring.length, "recovery visualization mismatch");
  assertEqual(observability.replay_execution_timeline.length, runtime.state_stream.length, "execution timeline mismatch");

  assertEqual(getRuntimeTelemetryAggregation(db, runtime.runtime_id)?.aggregation_hash, observability.telemetry_aggregation.aggregation_hash, "telemetry API query mismatch");
  assertEqual(getConsensusDriftVisualization(db, runtime.runtime_id).length, observability.consensus_drift_visualization.length, "drift API query mismatch");
  assertEqual(getValidatorTrustEvolution(db, runtime.runtime_id).length, observability.validator_trust_evolution.length, "validator trust API query mismatch");
  assertEqual(getReplayLineageGraph(db, runtime.runtime_id)?.graph_hash, observability.replay_lineage_graph.graph_hash, "lineage graph API query mismatch");
  assertEqual(getRuntimePropagationVisualization(db, runtime.runtime_id).length, observability.runtime_propagation_visualization.length, "propagation API query mismatch");
  assertEqual(getGovernanceStateVisualization(db, runtime.runtime_id).length, observability.governance_state_visualization.length, "governance API query mismatch");
  assertEqual(getRecoveryEventVisualization(db, runtime.runtime_id).length, observability.recovery_event_visualization.length, "recovery API query mismatch");
  assertEqual(getReplayExecutionTimeline(db, runtime.runtime_id).length, observability.replay_execution_timeline.length, "timeline API query mismatch");

  assertViewSupported("runtime_telemetry_aggregation");
  assertViewSupported("consensus_drift_visualization");
  assertViewSupported("validator_trust_evolution");
  assertViewSupported("replay_lineage_graph");
  assertViewSupported("runtime_propagation_visualization");
  assertViewSupported("governance_state_visualization");
  assertViewSupported("recovery_event_visualization");
  assertViewSupported("replay_execution_timeline");
  assertQuerySupported("get_runtime_telemetry_aggregation");
  assertQuerySupported("get_consensus_drift_visualization");
  assertQuerySupported("get_validator_trust_evolution");
  assertQuerySupported("get_replay_lineage_graph");
  assertQuerySupported("get_runtime_propagation_visualization");
  assertQuerySupported("get_governance_state_visualization");
  assertQuerySupported("get_recovery_event_visualization");
  assertQuerySupported("get_replay_execution_timeline");

  console.log("Replay observability validation passed.");
  console.log(JSON.stringify({
    observability_id: observability.observability_id,
    runtime_id: observability.runtime_id,
    deterministic_hash: observability.deterministic_hash,
    telemetry: observability.telemetry_aggregation,
    drift_points: observability.consensus_drift_visualization.length,
    validator_trust_series: observability.validator_trust_evolution.length,
    lineage_nodes: observability.replay_lineage_graph.nodes.length,
    lineage_edges: observability.replay_lineage_graph.edges.length,
    propagation_views: observability.runtime_propagation_visualization.length,
    governance_views: observability.governance_state_visualization.length,
    recovery_events: observability.recovery_event_visualization.length,
    timeline_events: observability.replay_execution_timeline.length,
    immutable_outputs: {
      snapshot: Object.isFrozen(observability),
      timeline: Object.isFrozen(observability.replay_execution_timeline),
    },
  }, null, 2));
} finally {
  db.close();
}

function bridgeInput(prefix: string, generatedAt: string, positive: boolean): ReplayLiveBridgeInput {
  const fixedSignals = [
    liveSignal(`${prefix}-signal-injury`, "injury_update", positive ? "BOS" : "MIA", positive ? "Jayson Tatum" : "Jimmy Butler", positive ? "ESPN NBA Injuries" : "Unverified Beat", positive, positive ? 88 : 62, positive ? 90 : 58),
    liveSignal(`${prefix}-signal-line`, "line_move", positive ? "NYK" : "LAL", null, "Market Watch", positive, positive ? 82 : 72, positive ? 84 : 70),
  ] as readonly LiveSignal[];
  return {
    generated_at: generatedAt,
    persisted_at: new Date(Date.parse(generatedAt) + 5_000).toISOString(),
    raw_events: fixedSignals.map((signal) => rawEvent(prefix, signal, positive)),
    live_signals: fixedSignals,
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
    injury_reports: fixedSignals.filter((signal) => signal.signal_type === "injury_update").map((signal) => ({
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
    source_intelligence_events: fixedSignals.map((signal) => ({
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
    settled_outcomes: fixedSignals.map((signal) => outcome(prefix, signal, positive)),
    consensus_threshold: 0.6,
    approval_threshold: 0.52,
  };
}

function rawEvent(prefix: string, signal: LiveSignal, positive: boolean): RawEvent {
  return {
    id: `${prefix}-raw-${signal.id}`,
    source_id: signal.sources[0]?.name.toLowerCase().replace(/\s+/g, "-") ?? "unknown",
    source_type: signal.sources[0]?.type === "scrape" ? "scrape" : "api",
    league: "NBA",
    game_id: signal.game_id,
    team: signal.team,
    player: signal.player,
    event_type: signal.signal_type === "line_move" ? "line_move" : "injury_update",
    payload: signal.signal_type === "line_move"
      ? { open_line: 4.5, current_line: positive ? 6 : 2.5, confidence: signal.confidence }
      : { designation: positive ? "OUT" : "Questionable", confidence: signal.confidence },
    processed: true,
    processed_at: signal.updated_at,
    created_at: signal.created_at,
    received_at: signal.signal_time,
  };
}

function liveSignal(
  id: string,
  signalType: LiveSignal["signal_type"],
  team: string,
  player: string | null,
  sourceName: string,
  positive: boolean,
  confidence: number,
  score: number,
): LiveSignal {
  return {
    id,
    league: "NBA",
    game_id: `${id}-game`,
    signal_type: signalType,
    headline: `${sourceName} ${signalType}`,
    body: "Replay observability validation fixture.",
    action_note: "Render deterministic observability views.",
    why_it_matters: "Dashboard APIs need stable runtime intelligence views.",
    team,
    player,
    matchup: "Fixture matchup",
    sources: [{ name: sourceName, type: sourceName === "Unverified Beat" ? "scrape" : "api" }],
    source_count: 1,
    verdict: sourceName === "Unverified Beat" ? "rumor" : "likely",
    confidence,
    confirmation_strength: sourceName === "Unverified Beat" ? "Developing" : "Corroborated",
    line_movement: signalType === "line_move" ? { open: 4.5, current: positive ? 6 : 2.5, delta: positive ? 1.5 : 2, direction: positive ? "up" : "down" } : null,
    injury_designation: signalType === "injury_update" ? (positive ? "OUT" : "Questionable") : null,
    lineup_status: null,
    weather_note: null,
    betting_relevance: true,
    fantasy_relevance: signalType === "injury_update",
    score,
    score_band: score >= 85 ? "Elite" : "Strong",
    urgency_label: "URGENT",
    urgency_reason: "Observability fixture",
    trust_label: "Corroborated",
    score_explanation: "Deterministic observability score",
    breakdown: breakdown(),
    raw_event_ids: [`raw-${id}`],
    signal_time: "2026-05-20T10:00:00.000Z",
    created_at: "2026-05-20T10:00:30.000Z",
    updated_at: "2026-05-20T10:00:30.000Z",
    outcome_id: `${id}-outcome`,
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
    recorded_at: "2026-05-20T12:30:00.000Z",
    created_at: "2026-05-20T12:30:00.000Z",
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
    leagueModifierApplied: "NBA observability fixture",
    rawBeforeMods: 82,
  };
}

function assertViewSupported(_view: ReplayObservabilityView): void { return; }
function assertQuerySupported(_query: ReplayObservabilityQuery): void { return; }

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
}
