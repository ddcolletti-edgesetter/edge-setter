import Database from "better-sqlite3";

import {
  buildReplayLiveSportsRuntimeIntegrationSnapshot,
  computeReplayLiveSportsRuntimeIntegrationHash,
  getLiveFeedIngestion,
  getLiveSignalPropagation,
  getLiveTelemetryPersistence,
  getRealSettlementRuntimeScoring,
  getRuntimeGovernanceAdaptation,
  serializeReplayLiveSportsRuntimeIntegrationSnapshot,
} from "../pipeline/replay-live-sports-runtime-integration";
import type {
  ReplayLiveSportsFeedSnapshot,
  ReplayLiveSportsRuntimeAction,
  ReplayLiveSportsRuntimeLeague,
  ReplayLiveSportsRuntimeQuery,
  ReplayLiveSportsRuntimeState,
} from "../pipeline/replay-live-sports-runtime-integration-contract";
import type { LiveSignal, Outcome, RawEvent, ScoreBreakdown } from "../pipeline/types";

const GENERATED_AT = "2026-05-20T16:00:00.000Z";
const PERSISTED_AT = "2026-05-20T16:05:00.000Z";

const feeds = [
  feed("NBA", "nba-live", true, "ESPN NBA Injuries", "Jayson Tatum", "BOS"),
  feed("MLB", "mlb-live", false, "MLB Beat Writer", "Aaron Judge", "NYY"),
] as const;

const db = new Database(":memory:");

try {
  const integration = buildReplayLiveSportsRuntimeIntegrationSnapshot(db, {
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    feeds,
    scheduler_interval_ms: 60_000,
    runtime_nodes: [
      { node_id: "live-runtime-primary", region: "us-west", priority: 100, healthy: true, last_seen_at: GENERATED_AT },
      { node_id: "live-runtime-secondary", region: "us-east", priority: 90, healthy: true, last_seen_at: GENERATED_AT },
    ],
  });
  const integrationAgain = buildReplayLiveSportsRuntimeIntegrationSnapshot(db, {
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    feeds,
    scheduler_interval_ms: 60_000,
    runtime_nodes: [
      { node_id: "live-runtime-primary", region: "us-west", priority: 100, healthy: true, last_seen_at: GENERATED_AT },
      { node_id: "live-runtime-secondary", region: "us-east", priority: 90, healthy: true, last_seen_at: GENERATED_AT },
    ],
  });

  assertEqual(integration.deterministic_hash, integrationAgain.deterministic_hash, "live sports integration hash must be deterministic");
  assertEqual(serializeReplayLiveSportsRuntimeIntegrationSnapshot(integration), serializeReplayLiveSportsRuntimeIntegrationSnapshot(integrationAgain), "live sports integration serialization mismatch");
  assertEqual(computeReplayLiveSportsRuntimeIntegrationHash({ integration: integration.integration_id }).length, 64, "live sports integration hash helper mismatch");
  assertEqual(Object.isFrozen(integration), true, "integration snapshot must be immutable");
  assertEqual(Object.isFrozen(integration.feed_ingestion), true, "feed ingestion must be immutable");

  assertEqual(integration.feed_ingestion.length, 2, "NBA/MLB ingestion records missing");
  assertEqual(integration.feed_ingestion.some((record) => record.league === "NBA"), true, "live NBA runtime integration missing");
  assertEqual(integration.feed_ingestion.some((record) => record.league === "MLB"), true, "live MLB runtime integration missing");
  assertEqual(integration.feed_ingestion.every((record) => record.odds_snapshot_count > 0), true, "odds movement runtime ingestion missing");
  assertEqual(integration.feed_ingestion.every((record) => record.injury_report_count > 0), true, "injury intelligence runtime ingestion missing");
  assertEqual(integration.feed_ingestion.every((record) => record.source_intelligence_count > 0), true, "beat writer intelligence ingestion missing");
  assertEqual(integration.signal_propagation.every((record) => record.propagated), true, "live signal runtime propagation missing");
  assertEqual(integration.settlement_scoring.some((record) => record.trust_score_count > 0), true, "real settlement runtime scoring missing");
  assertEqual(integration.governance_adaptation.every((record) => record.governance_decision_count > 0), true, "runtime governance adaptation missing");
  assertEqual(integration.telemetry_persistence.every((record) => record.persisted), true, "live telemetry persistence missing");
  assertEqual(integration.runtime_snapshot.executed_cycles.length, 2, "runtime cycles missing");
  assertEqual(integration.observability_snapshot.telemetry_aggregation.cycle_count, 2, "observability telemetry aggregation missing");
  assertEqual(integration.production_snapshot.distributed_leases.length, 2, "production lease coordination missing");
  assertEqual(integration.runtime_snapshot.executed_cycles.every((cycle) => cycle.trust_snapshot.validator_profiles.length > 0), true, "validator trust did not evolve");
  assertEqual(integration.runtime_snapshot.executed_cycles.every((cycle) => cycle.bridge_snapshot.consensus_intelligence.synthesis.length > 0), true, "intelligence convergence missing");

  assertEqual(getLiveFeedIngestion(db, integration.integration_id).length, integration.feed_ingestion.length, "feed ingestion query mismatch");
  assertEqual(getLiveSignalPropagation(db, integration.integration_id).length, integration.signal_propagation.length, "signal propagation query mismatch");
  assertEqual(getRealSettlementRuntimeScoring(db, integration.integration_id).length, integration.settlement_scoring.length, "settlement scoring query mismatch");
  assertEqual(getRuntimeGovernanceAdaptation(db, integration.integration_id).length, integration.governance_adaptation.length, "governance adaptation query mismatch");
  assertEqual(getLiveTelemetryPersistence(db, integration.integration_id).length, integration.telemetry_persistence.length, "telemetry persistence query mismatch");

  assertActionSupported("ingest_live_mlb_runtime");
  assertActionSupported("ingest_live_nba_runtime");
  assertActionSupported("ingest_odds_movement_runtime");
  assertActionSupported("ingest_injury_intelligence_runtime");
  assertActionSupported("ingest_beat_writer_intelligence");
  assertActionSupported("propagate_live_signal_runtime");
  assertActionSupported("score_real_settlement_runtime");
  assertActionSupported("adapt_runtime_governance");
  assertActionSupported("persist_live_telemetry");
  assertActionSupported("freeze_live_sports_runtime_snapshot");
  assertQuerySupported("get_live_feed_ingestion");
  assertQuerySupported("get_live_signal_propagation");
  assertQuerySupported("get_real_settlement_scoring");
  assertQuerySupported("get_runtime_governance_adaptation");
  assertQuerySupported("get_live_telemetry_persistence");
  assertStateSupported("collecting");
  assertStateSupported("ingesting");
  assertStateSupported("propagating");
  assertStateSupported("scoring");
  assertStateSupported("governing");
  assertStateSupported("converging");
  assertStateSupported("degraded");

  console.log("Replay live sports runtime integration validation passed.");
  console.log(JSON.stringify({
    integration_id: integration.integration_id,
    deterministic_hash: integration.deterministic_hash,
    state: integration.state,
    feeds: integration.feed_ingestion.map((record) => ({
      league: record.league,
      raw_events: record.raw_event_count,
      live_signals: record.live_signal_count,
      odds: record.odds_snapshot_count,
      injuries: record.injury_report_count,
      sources: record.source_intelligence_count,
      outcomes: record.settled_outcome_count,
    })),
    propagated_signals: integration.signal_propagation.length,
    settlement_scores: integration.settlement_scoring.length,
    governance_adaptations: integration.governance_adaptation.length,
    telemetry_persistence: integration.telemetry_persistence.length,
    runtime_cycles: integration.runtime_snapshot.cycles.length,
    production_leases: integration.production_snapshot.distributed_leases.length,
    immutable_outputs: {
      snapshot: Object.isFrozen(integration),
      feed_ingestion: Object.isFrozen(integration.feed_ingestion),
    },
  }, null, 2));
} finally {
  db.close();
}

function feed(
  league: ReplayLiveSportsRuntimeLeague,
  prefix: string,
  positive: boolean,
  sourceName: string,
  player: string,
  team: string,
): ReplayLiveSportsFeedSnapshot {
  const generatedAt = league === "NBA" ? "2026-05-20T16:00:00.000Z" : "2026-05-20T16:01:00.000Z";
  const signals = [
    liveSignal(league, `${prefix}-injury`, "injury_update", team, player, sourceName, positive, positive ? 88 : 66, positive ? 90 : 62),
    liveSignal(league, `${prefix}-line`, "line_move", team, null, `${league} Market Feed`, positive, positive ? 80 : 72, positive ? 84 : 70),
  ];
  return {
    league,
    generated_at: generatedAt,
    raw_events: signals.map((signal) => rawEvent(league, prefix, signal, positive)),
    live_signals: signals,
    odds_snapshots: [{
      id: `${prefix}-odds`,
      game_id: `${prefix}-game`,
      league,
      sportsbook: "DraftKings",
      market_source: "the_odds_api",
      spread_line: positive ? -4.5 : 2.5,
      spread_team: team,
      total_line: league === "MLB" ? 8.5 : 218.5,
      moneyline_home: -155,
      moneyline_away: 135,
      source_game_id: `${prefix}-source-game`,
      snapshot_at: generatedAt,
    }],
    injury_reports: [{
      report_id: `${prefix}-injury-report`,
      league,
      team,
      player,
      designation: positive ? "OUT" : "Questionable",
      body_part: league === "MLB" ? "hamstring" : "ankle",
      source_id: sourceName.toLowerCase().replace(/\s+/g, "-"),
      confidence: positive ? 88 : 66,
      reported_at: generatedAt,
    }],
    source_intelligence_events: signals.map((signal) => ({
      event_id: `${prefix}-source-${signal.id}`,
      source_id: signal.sources[0]?.name.toLowerCase().replace(/\s+/g, "-") ?? "unknown",
      source_name: signal.sources[0]?.name ?? "Unknown",
      source_type: signal.sources[0]?.type ?? "api",
      reliability_score: positive ? 86 : 64,
      topic: signal.signal_type,
      league,
      signal_id: signal.id,
      observed_at: generatedAt,
    })),
    settled_outcomes: signals.map((signal) => outcome(prefix, signal, positive)),
  };
}

function rawEvent(
  league: ReplayLiveSportsRuntimeLeague,
  prefix: string,
  signal: LiveSignal,
  positive: boolean,
): RawEvent {
  return {
    id: `${prefix}-raw-${signal.id}`,
    source_id: signal.sources[0]?.name.toLowerCase().replace(/\s+/g, "-") ?? "unknown",
    source_type: signal.sources[0]?.type === "scrape" ? "scrape" : "api",
    league,
    game_id: signal.game_id,
    team: signal.team,
    player: signal.player,
    event_type: signal.signal_type === "line_move" ? "line_move" : "injury_update",
    payload: signal.signal_type === "line_move"
      ? { open_line: positive ? -3.5 : 3.5, current_line: positive ? -5 : 2, confidence: signal.confidence }
      : { designation: positive ? "OUT" : "Questionable", confidence: signal.confidence },
    processed: true,
    processed_at: signal.updated_at,
    created_at: signal.created_at,
    received_at: signal.signal_time,
  };
}

function liveSignal(
  league: ReplayLiveSportsRuntimeLeague,
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
    league,
    game_id: `${id}-game`,
    signal_type: signalType,
    headline: `${league} ${sourceName} ${signalType}`,
    body: "Live sports runtime integration validation fixture.",
    action_note: "Integrate real sports feed into replay runtime.",
    why_it_matters: "Autonomous replay intelligence must process live sports facts.",
    team,
    player,
    matchup: "Fixture matchup",
    sources: [{ name: sourceName, type: sourceName.includes("Beat") ? "scrape" : "api" }],
    source_count: 1,
    verdict: positive ? "likely" : "review",
    confidence,
    confirmation_strength: positive ? "Corroborated" : "Developing",
    line_movement: signalType === "line_move" ? { open: positive ? -3.5 : 3.5, current: positive ? -5 : 2, delta: 1.5, direction: positive ? "down" : "up" } : null,
    injury_designation: signalType === "injury_update" ? (positive ? "OUT" : "Questionable") : null,
    lineup_status: null,
    weather_note: null,
    betting_relevance: true,
    fantasy_relevance: signalType === "injury_update",
    score,
    score_band: score >= 85 ? "Elite" : "Strong",
    urgency_label: "URGENT",
    urgency_reason: "Live integration fixture",
    trust_label: "Corroborated",
    score_explanation: "Deterministic live integration score",
    breakdown: breakdown(),
    raw_event_ids: [`raw-${id}`],
    signal_time: "2026-05-20T16:00:00.000Z",
    created_at: "2026-05-20T16:00:30.000Z",
    updated_at: "2026-05-20T16:00:30.000Z",
    outcome_id: `${id}-outcome`,
  };
}

function outcome(prefix: string, signal: LiveSignal, positive: boolean): Outcome {
  return {
    id: `${prefix}-outcome-${signal.id}`,
    signal_id: signal.id,
    game_id: signal.game_id ?? `${prefix}-game`,
    home_score: positive ? 6 : 2,
    away_score: positive ? 3 : 5,
    market: "spread",
    line_at_signal: positive ? -3.5 : 2.5,
    closing_line: positive ? -5 : 4.5,
    actual_result: positive ? 3 : -3,
    hit: positive,
    clv: positive ? 1.5 : -2,
    recorded_at: "2026-05-20T19:30:00.000Z",
    created_at: "2026-05-20T19:30:00.000Z",
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
    leagueModifierApplied: "Live sports integration fixture",
    rawBeforeMods: 82,
  };
}

function assertActionSupported(_action: ReplayLiveSportsRuntimeAction): void { return; }
function assertQuerySupported(_query: ReplayLiveSportsRuntimeQuery): void { return; }
function assertStateSupported(_state: ReplayLiveSportsRuntimeState): void { return; }

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
}
