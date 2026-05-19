import Database from "better-sqlite3";

import {
  buildReplayHistoricalCalibrationSnapshot,
  computeReplayHistoricalCalibrationHash,
  getHistoricalCalibrationObservability,
  getHistoricalCalibrationSummary,
  getHistoricalConsensusConvergenceBaselines,
  getHistoricalDriftComparison,
  getHistoricalGovernanceEvolution,
  getHistoricalIntelligenceLineage,
  getHistoricalPropagationVelocity,
  getHistoricalSourceReliabilityPriors,
  getHistoricalValidatorTrustPriors,
  serializeReplayHistoricalCalibrationSnapshot,
} from "../pipeline/replay-historical-calibration";
import type {
  ReplayHistoricalCalibrationAction,
  ReplayHistoricalCalibrationQuery,
  ReplayHistoricalCalibrationState,
  ReplayHistoricalLeague,
  ReplayHistoricalSeasonInput,
  ReplayHistoricalSportsFeedSnapshot,
} from "../pipeline/replay-historical-calibration-contract";
import type { LiveSignal, Outcome, RawEvent, ScoreBreakdown, SignalType } from "../pipeline/types";

const GENERATED_AT = "2026-05-21T14:00:00.000Z";
const PERSISTED_AT = "2026-05-21T14:05:00.000Z";

const seasons: readonly ReplayHistoricalSeasonInput[] = [
  season("NBA", 2023, true, "nba-2023", "Shams NBA", "BOS", "Jayson Tatum"),
  season("NBA", 2024, true, "nba-2024", "ESPN NBA Injuries", "DEN", "Nikola Jokic"),
  season("MLB", 2024, false, "mlb-2024", "MLB Beat Writer", "NYY", "Aaron Judge"),
  season("MLB", 2025, true, "mlb-2025", "StatsAPI Feed", "LAD", "Mookie Betts"),
  season("NFL", 2024, true, "nfl-2024", "NFL Beat Desk", "KC", "Patrick Mahomes"),
  season("CFB", 2025, false, "cfb-2025", "CFB Sideline Source", "UGA", "Starting QB"),
] as const;

const db = new Database(":memory:");

try {
  const input = {
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    seasons,
    runtime_nodes: [
      { node_id: "historical-runtime-primary", region: "us-west", priority: 100, healthy: true, last_seen_at: GENERATED_AT },
      { node_id: "historical-runtime-secondary", region: "us-east", priority: 80, healthy: true, last_seen_at: GENERATED_AT },
    ],
  } as const;
  const calibration = buildReplayHistoricalCalibrationSnapshot(db, input);
  const calibrationAgain = buildReplayHistoricalCalibrationSnapshot(db, input);

  assertEqual(calibration.deterministic_hash, calibrationAgain.deterministic_hash, "historical calibration hash must be deterministic");
  assertEqual(serializeReplayHistoricalCalibrationSnapshot(calibration), serializeReplayHistoricalCalibrationSnapshot(calibrationAgain), "historical calibration serialization mismatch");
  assertEqual(computeReplayHistoricalCalibrationHash({ calibration: calibration.calibration_id }).length, 64, "historical calibration hash helper mismatch");
  assertEqual(Object.isFrozen(calibration), true, "historical calibration snapshot must be immutable");
  assertEqual(Object.isFrozen(calibration.validator_trust_priors), true, "validator priors must be immutable");

  assertEqual(calibration.odds_movement_replays.length, seasons.length, "multi-season odds replay missing");
  assertEqual(calibration.injury_intelligence_replays.length, seasons.length, "historical injury replay missing");
  assertEqual(calibration.source_replay_priors.length > 0, true, "source reliability priors missing");
  assertEqual(calibration.validator_trust_priors.length > 0, true, "validator trust priors missing");
  assertEqual(calibration.consensus_convergence_baselines.length, seasons.length, "consensus convergence baselines missing");
  assertEqual(calibration.propagation_velocity.length, seasons.length, "propagation velocity analysis missing");
  assertEqual(calibration.governance_evolution.length, seasons.length, "governance evolution replay missing");
  assertEqual(calibration.drift_comparison.length, seasons.length, "historical drift comparison missing");
  assertEqual(calibration.intelligence_lineage.length, seasons.length, "lineage reconstruction missing");
  assertEqual(calibration.observability.season_count, seasons.length, "calibration observability season count mismatch");
  assertEqual(calibration.observability.league_count, 4, "calibration observability league count mismatch");

  assertEqual(calibration.odds_movement_replays.every((record) => record.movement_count > 0), true, "historical odds movement replay did not ingest fixtures");
  assertEqual(calibration.injury_intelligence_replays.every((record) => record.injury_signal_count > 0), true, "historical injury intelligence replay did not ingest fixtures");
  assertEqual(calibration.source_replay_priors.every((record) => record.reliability_prior >= 0 && record.reliability_prior <= 1), true, "source reliability priors out of range");
  assertEqual(calibration.validator_trust_priors.every((record) => record.calibrated_trust_prior >= 0 && record.calibrated_weight_prior >= 0), true, "validator trust priors out of range");
  assertEqual(calibration.consensus_convergence_baselines.every((record) => record.convergence_score >= 0 && record.convergence_score <= 1), true, "consensus convergence scores out of range");
  assertEqual(calibration.propagation_velocity.every((record) => record.signal_count > 0), true, "propagation velocity signal counts missing");
  assertEqual(calibration.governance_evolution.some((record) => record.promotion_count > 0), true, "governance promotion ancestry missing");
  assertEqual(calibration.drift_comparison.every((record) => record.drift_hash.length === 64), true, "drift hashes invalid");
  assertEqual(calibration.intelligence_lineage.every((record) => record.runtime_hash.length === 64 && record.production_hash.length === 64), true, "lineage hashes invalid");
  assertEqual(calibration.intelligence_lineage.some((record) => record.league === "NFL"), true, "NFL historical lineage missing");
  assertEqual(calibration.intelligence_lineage.some((record) => record.league === "CFB"), true, "CFB historical lineage missing");
  assertEqual(calibration.intelligence_lineage.some((record) => record.lineage_depth > 3), true, "historical lineage depth missing");

  assertEqual(getHistoricalCalibrationSummary(db, calibration.calibration_id)?.observability_hash, calibration.observability.observability_hash, "historical calibration summary query mismatch");
  assertEqual(getHistoricalCalibrationObservability(db, calibration.calibration_id)?.observability_id, calibration.observability.observability_id, "historical observability query mismatch");
  assertEqual(getHistoricalSourceReliabilityPriors(db, calibration.calibration_id).length, calibration.source_replay_priors.length, "source prior query mismatch");
  assertEqual(getHistoricalValidatorTrustPriors(db, calibration.calibration_id).length, calibration.validator_trust_priors.length, "validator prior query mismatch");
  assertEqual(getHistoricalConsensusConvergenceBaselines(db, calibration.calibration_id).length, calibration.consensus_convergence_baselines.length, "consensus baseline query mismatch");
  assertEqual(getHistoricalPropagationVelocity(db, calibration.calibration_id).length, calibration.propagation_velocity.length, "propagation velocity query mismatch");
  assertEqual(getHistoricalGovernanceEvolution(db, calibration.calibration_id).length, calibration.governance_evolution.length, "governance evolution query mismatch");
  assertEqual(getHistoricalDriftComparison(db, calibration.calibration_id).length, calibration.drift_comparison.length, "drift comparison query mismatch");
  assertEqual(getHistoricalIntelligenceLineage(db, calibration.calibration_id).length, calibration.intelligence_lineage.length, "intelligence lineage query mismatch");

  assertActionSupported("ingest_multi_season_replay");
  assertActionSupported("replay_historical_odds_movement");
  assertActionSupported("replay_historical_injury_intelligence");
  assertActionSupported("replay_historical_source_intelligence");
  assertActionSupported("calibrate_validator_trust");
  assertActionSupported("analyze_consensus_convergence");
  assertActionSupported("analyze_propagation_velocity");
  assertActionSupported("replay_governance_evolution");
  assertActionSupported("compare_historical_drift");
  assertActionSupported("reconstruct_intelligence_lineage");
  assertActionSupported("persist_calibration_snapshot");
  assertQuerySupported("get_historical_calibration_summary");
  assertQuerySupported("get_historical_source_reliability_priors");
  assertQuerySupported("get_historical_validator_trust_priors");
  assertQuerySupported("get_historical_consensus_convergence_baselines");
  assertQuerySupported("get_historical_propagation_velocity");
  assertQuerySupported("get_historical_governance_evolution");
  assertQuerySupported("get_historical_drift_comparison");
  assertQuerySupported("get_historical_intelligence_lineage");
  assertQuerySupported("get_historical_calibration_observability");
  assertStateSupported("ingesting");
  assertStateSupported("calibrating");
  assertStateSupported("converging");
  assertStateSupported("stable");
  assertStateSupported("drifting");
  assertStateSupported("insufficient_history");

  console.log("Replay historical calibration validation passed.");
  console.log(JSON.stringify({
    calibration_id: calibration.calibration_id,
    deterministic_hash: calibration.deterministic_hash,
    state: calibration.state,
    seasons: calibration.observability.season_count,
    leagues: calibration.observability.league_count,
    odds_replays: calibration.odds_movement_replays.length,
    source_priors: calibration.source_replay_priors.length,
    validator_priors: calibration.validator_trust_priors.length,
    convergence_baselines: calibration.consensus_convergence_baselines.length,
    lineage_records: calibration.intelligence_lineage.length,
    immutable_outputs: {
      snapshot: Object.isFrozen(calibration),
      validator_priors: Object.isFrozen(calibration.validator_trust_priors),
    },
  }, null, 2));
} finally {
  db.close();
}

function season(
  league: ReplayHistoricalLeague,
  year: number,
  positive: boolean,
  prefix: string,
  sourceName: string,
  team: string,
  player: string,
): ReplayHistoricalSeasonInput {
  return {
    season_id: `historical-season:${league}:${year}`,
    league,
    season_year: year,
    generated_at: `${year}-11-15T12:00:00.000Z`,
    feeds: [feed(league, year, positive, prefix, sourceName, team, player)],
  };
}

function feed(
  league: ReplayHistoricalLeague,
  year: number,
  positive: boolean,
  prefix: string,
  sourceName: string,
  team: string,
  player: string,
): ReplayHistoricalSportsFeedSnapshot {
  const generatedAt = `${year}-11-15T12:00:00.000Z`;
  const signals = [
    liveSignal(league, `${prefix}-injury`, "injury_update", team, player, sourceName, positive, positive ? 88 : 62, positive ? 90 : 58),
    liveSignal(league, `${prefix}-line`, "line_move", team, null, `${league} Historical Odds`, positive, positive ? 82 : 67, positive ? 86 : 64),
  ];
  return {
    league,
    generated_at: generatedAt,
    raw_events: signals.map((signal) => rawEvent(league, prefix, signal, positive)),
    live_signals: signals,
    odds_snapshots: [
      odds(`${prefix}-open`, league, `${prefix}-game`, team, positive ? -2.5 : 2.5, generatedAt),
      odds(`${prefix}-close`, league, `${prefix}-game`, team, positive ? -4.5 : 4.5, `${year}-11-15T18:00:00.000Z`),
    ],
    injury_reports: [{
      report_id: `${prefix}-injury-report`,
      league,
      team,
      player,
      designation: positive ? "OUT" : "Questionable",
      body_part: league === "MLB" ? "hamstring" : "ankle",
      source_id: sourceName.toLowerCase().replace(/\s+/g, "-"),
      confidence: positive ? 88 : 62,
      reported_at: generatedAt,
    }],
    source_intelligence_events: signals.map((signal) => ({
      event_id: `${prefix}-source-${signal.id}`,
      source_id: signal.sources[0]?.name.toLowerCase().replace(/\s+/g, "-") ?? "unknown",
      source_name: signal.sources[0]?.name ?? "Unknown",
      source_type: signal.sources[0]?.type ?? "api",
      reliability_score: positive ? 88 : 61,
      topic: signal.signal_type,
      league,
      signal_id: signal.id,
      observed_at: generatedAt,
    })),
    settled_outcomes: signals.map((signal) => outcome(prefix, signal, positive)),
  };
}

function odds(
  id: string,
  league: ReplayHistoricalLeague,
  gameId: string,
  team: string,
  spread: number,
  snapshotAt: string,
) {
  return {
    id,
    game_id: gameId,
    league,
    sportsbook: "SeedBook",
    market_source: "historical_fixture",
    spread_line: spread,
    spread_team: team,
    total_line: league === "MLB" ? 8.5 : league === "NBA" ? 218.5 : 47.5,
    moneyline_home: spread < 0 ? -145 : 125,
    moneyline_away: spread < 0 ? 125 : -145,
    source_game_id: `source-${gameId}`,
    snapshot_at: snapshotAt,
  };
}

function rawEvent(
  league: ReplayHistoricalLeague,
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
      ? { open_line: positive ? -2.5 : 2.5, current_line: positive ? -4.5 : 4.5, confidence: signal.confidence }
      : { designation: positive ? "OUT" : "Questionable", confidence: signal.confidence },
    processed: true,
    processed_at: signal.updated_at,
    created_at: signal.created_at,
    received_at: signal.signal_time,
  };
}

function liveSignal(
  league: ReplayHistoricalLeague,
  id: string,
  signalType: SignalType,
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
    headline: `${league} historical ${signalType}`,
    body: "Historical replay calibration validation fixture.",
    action_note: "Replay prior sports intelligence behavior.",
    why_it_matters: "Calibration priors must initialize autonomous replay runtime deterministically.",
    team,
    player,
    matchup: "Historical fixture matchup",
    sources: [{ name: sourceName, type: sourceName.includes("Beat") || sourceName.includes("Source") ? "scrape" : "api" }],
    source_count: 1,
    verdict: positive ? "confirmed" : "review",
    confidence,
    confirmation_strength: positive ? "Corroborated" : "Developing",
    line_movement: signalType === "line_move" ? { open: positive ? -2.5 : 2.5, current: positive ? -4.5 : 4.5, delta: positive ? -2 : 2, direction: positive ? "down" : "up" } : null,
    injury_designation: signalType === "injury_update" ? (positive ? "OUT" : "Questionable") : null,
    lineup_status: null,
    weather_note: null,
    betting_relevance: true,
    fantasy_relevance: signalType === "injury_update",
    score,
    score_band: score >= 85 ? "Elite" : score >= 70 ? "Strong" : "Watchlist",
    urgency_label: positive ? "URGENT" : "WATCH",
    urgency_reason: "Historical calibration fixture",
    trust_label: positive ? "Corroborated" : "Developing",
    score_explanation: "Seeded historical calibration score",
    breakdown: breakdown(),
    raw_event_ids: [`raw-${id}`],
    signal_time: "2025-11-15T12:00:00.000Z",
    created_at: "2025-11-15T12:00:30.000Z",
    updated_at: "2025-11-15T12:00:30.000Z",
    outcome_id: `${id}-outcome`,
  };
}

function outcome(prefix: string, signal: LiveSignal, positive: boolean): Outcome {
  return {
    id: `${prefix}-outcome-${signal.id}`,
    signal_id: signal.id,
    game_id: signal.game_id ?? `${prefix}-game`,
    home_score: positive ? 31 : 17,
    away_score: positive ? 21 : 28,
    market: "spread",
    line_at_signal: positive ? -2.5 : 2.5,
    closing_line: positive ? -4.5 : 4.5,
    actual_result: positive ? 10 : -11,
    hit: positive,
    clv: positive ? 2 : -2,
    recorded_at: "2025-11-15T22:30:00.000Z",
    created_at: "2025-11-15T22:30:00.000Z",
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
    leagueModifierApplied: "Historical calibration fixture",
    rawBeforeMods: 82,
  };
}

function assertActionSupported(_action: ReplayHistoricalCalibrationAction): void { return; }
function assertQuerySupported(_query: ReplayHistoricalCalibrationQuery): void { return; }
function assertStateSupported(_state: ReplayHistoricalCalibrationState): void { return; }

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
}
