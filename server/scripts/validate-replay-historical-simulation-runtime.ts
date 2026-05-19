import Database from "better-sqlite3";

import { buildReplayHistoricalCalibrationSnapshot } from "../pipeline/replay-historical-calibration";
import type {
  ReplayHistoricalLeague,
  ReplayHistoricalSeasonInput,
  ReplayHistoricalSportsFeedSnapshot,
} from "../pipeline/replay-historical-calibration-contract";
import {
  buildReplayHistoricalSimulationRuntimeSnapshot,
  computeReplayHistoricalSimulationRuntimeHash,
  getAdversarialSourceSimulation,
  getConsensusTournamentHistory,
  getCrossSportTransferLearning,
  getHistoricalMarketReactionScores,
  getIntelligenceSurvivabilitySimulation,
  getMisinformationResistanceScores,
  getPreLiveInitializationSnapshots,
  getProbabilisticTrustEvolution,
  getRecursiveGovernanceAdaptation,
  getReinforcementCalibrationLoops,
  getSimulationLineage,
  getValidatorMutationTests,
  getValidatorPretrainingRuntime,
  getValidatorSpecializationEvolution,
  serializeReplayHistoricalSimulationRuntimeSnapshot,
} from "../pipeline/replay-historical-simulation-runtime";
import type {
  ReplayHistoricalSimulationRuntimeAction,
  ReplayHistoricalSimulationRuntimeQuery,
  ReplayHistoricalSimulationRuntimeState,
} from "../pipeline/replay-historical-simulation-runtime-contract";
import type { LiveSignal, Outcome, RawEvent, ScoreBreakdown, SignalType } from "../pipeline/types";

const GENERATED_AT = "2026-05-22T15:00:00.000Z";
const PERSISTED_AT = "2026-05-22T15:05:00.000Z";

const db = new Database(":memory:");

try {
  const calibration = buildReplayHistoricalCalibrationSnapshot(db, {
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    seasons: [
      season("NBA", 2023, true, "nba-sim-2023", "NBA Injury Desk", "BOS", "Jayson Tatum"),
      season("MLB", 2024, true, "mlb-sim-2024", "MLB Market Feed", "LAD", "Mookie Betts"),
      season("NFL", 2024, false, "nfl-sim-2024", "NFL Beat Desk", "KC", "Patrick Mahomes"),
      season("CFB", 2025, true, "cfb-sim-2025", "CFB Sideline Source", "UGA", "Starting QB"),
    ],
    runtime_nodes: [
      { node_id: "simulation-runtime-primary", region: "us-west", priority: 100, healthy: true, last_seen_at: GENERATED_AT },
      { node_id: "simulation-runtime-secondary", region: "us-east", priority: 90, healthy: true, last_seen_at: GENERATED_AT },
    ],
  });
  const simulation = buildReplayHistoricalSimulationRuntimeSnapshot(db, {
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    calibration_snapshot: calibration,
    simulation_epochs: 4,
    adversarial_pressure: 0.31,
    reinforcement_learning_rate: 0.22,
  });
  const simulationAgain = buildReplayHistoricalSimulationRuntimeSnapshot(db, {
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    calibration_snapshot: calibration,
    simulation_epochs: 4,
    adversarial_pressure: 0.31,
    reinforcement_learning_rate: 0.22,
  });

  assertEqual(simulation.deterministic_hash, simulationAgain.deterministic_hash, "historical simulation hash must be deterministic");
  assertEqual(serializeReplayHistoricalSimulationRuntimeSnapshot(simulation), serializeReplayHistoricalSimulationRuntimeSnapshot(simulationAgain), "historical simulation serialization mismatch");
  assertEqual(computeReplayHistoricalSimulationRuntimeHash({ simulation: simulation.simulation_id }).length, 64, "historical simulation hash helper mismatch");
  assertEqual(Object.isFrozen(simulation), true, "historical simulation snapshot must be immutable");
  assertEqual(Object.isFrozen(simulation.pre_live_initialization), true, "pre-live initialization outputs must be immutable");

  assertEqual(simulation.validator_pretraining.length, calibration.validator_trust_priors.length, "validator pretraining runtime missing");
  assertEqual(simulation.consensus_tournaments.length, calibration.consensus_convergence_baselines.length * 4, "historical consensus tournament simulation missing");
  assertEqual(simulation.adversarial_sources.length, calibration.source_replay_priors.length, "adversarial source simulation missing");
  assertEqual(simulation.misinformation_resistance.length >= 4, true, "misinformation resistance scoring missing");
  assertEqual(simulation.probabilistic_trust_evolution.length, simulation.validator_pretraining.length * 4, "probabilistic validator trust evolution missing");
  assertEqual(simulation.reinforcement_calibration_loops.length >= 16, true, "reinforcement calibration loops missing");
  assertEqual(simulation.validator_specialization.length, simulation.validator_pretraining.length, "validator specialization evolution missing");
  assertEqual(simulation.cross_sport_transfer_learning.length >= 12, true, "cross-sport intelligence transfer learning missing");
  assertEqual(simulation.recursive_governance_adaptation.length, calibration.governance_evolution.length * 4, "recursive governance adaptation simulation missing");
  assertEqual(simulation.market_reaction_scores.length, calibration.odds_movement_replays.length, "historical market reaction scoring missing");
  assertEqual(simulation.validator_mutation_tests.length, simulation.validator_pretraining.length, "autonomous validator mutation testing missing");
  assertEqual(simulation.pre_live_initialization.length, simulation.validator_pretraining.length, "pre-live runtime initialization snapshots missing");
  assertEqual(simulation.survivability_simulation.length, calibration.intelligence_lineage.length, "intelligence survivability simulation missing");
  assertEqual(simulation.simulation_lineage.length > simulation.pre_live_initialization.length, true, "simulation lineage missing");

  assertEqual(simulation.validator_pretraining.every((record) => record.pretrained_trust >= 0 && record.pretrained_weight >= 0), true, "pretrained validator scores out of range");
  assertEqual(simulation.consensus_tournaments.every((record) => record.consensus_success_rate >= 0 && record.consensus_success_rate <= 1), true, "consensus tournament scores out of range");
  assertEqual(simulation.adversarial_sources.every((record) => record.simulated_false_signal_rate >= 0 && record.resistance_score >= 0), true, "adversarial source scores out of range");
  assertEqual(simulation.misinformation_resistance.every((record) => record.misinformation_containment_score >= 0 && record.misinformation_containment_score <= 1), true, "misinformation resistance scores out of range");
  assertEqual(simulation.probabilistic_trust_evolution.every((record) => record.trust_probability >= 0 && record.trust_probability <= 1), true, "probabilistic trust scores out of range");
  assertEqual(simulation.reinforcement_calibration_loops.every((record) => record.learning_rate === 0.22), true, "reinforcement learning rate not preserved");
  assertEqual(simulation.validator_specialization.some((record) => record.specialization === "market_reaction"), true, "market specialization missing");
  assertEqual(simulation.validator_specialization.some((record) => record.specialization === "injury_reliability"), true, "injury specialization missing");
  assertEqual(simulation.cross_sport_transfer_learning.some((record) => record.from_league !== record.to_league), true, "cross-sport transfer pairs missing");
  assertEqual(simulation.recursive_governance_adaptation.every((record) => record.recursion_depth >= 1), true, "recursive governance depth missing");
  assertEqual(simulation.market_reaction_scores.every((record) => record.reaction_hash.length === 64), true, "market reaction hashes invalid");
  assertEqual(simulation.validator_mutation_tests.some((record) => record.mutation_survived), true, "mutation survivability not exercised");
  assertEqual(simulation.pre_live_initialization.every((record) => record.initialization_hash.length === 64), true, "pre-live initialization hashes invalid");
  assertEqual(simulation.survivability_simulation.every((record) => record.survivability_score >= 0 && record.survivability_score <= 1), true, "survivability scores out of range");
  assertEqual(simulation.simulation_lineage.some((record) => record.lineage_kind === "calibration"), true, "calibration lineage root missing");
  assertEqual(simulation.simulation_lineage.some((record) => record.lineage_kind === "initialization"), true, "initialization lineage missing");

  assertEqual(getValidatorPretrainingRuntime(db, simulation.simulation_id).length, simulation.validator_pretraining.length, "validator pretraining query mismatch");
  assertEqual(getConsensusTournamentHistory(db, simulation.simulation_id).length, simulation.consensus_tournaments.length, "consensus tournament query mismatch");
  assertEqual(getAdversarialSourceSimulation(db, simulation.simulation_id).length, simulation.adversarial_sources.length, "adversarial source query mismatch");
  assertEqual(getMisinformationResistanceScores(db, simulation.simulation_id).length, simulation.misinformation_resistance.length, "misinformation resistance query mismatch");
  assertEqual(getProbabilisticTrustEvolution(db, simulation.simulation_id).length, simulation.probabilistic_trust_evolution.length, "probabilistic trust query mismatch");
  assertEqual(getReinforcementCalibrationLoops(db, simulation.simulation_id).length, simulation.reinforcement_calibration_loops.length, "reinforcement query mismatch");
  assertEqual(getValidatorSpecializationEvolution(db, simulation.simulation_id).length, simulation.validator_specialization.length, "specialization query mismatch");
  assertEqual(getCrossSportTransferLearning(db, simulation.simulation_id).length, simulation.cross_sport_transfer_learning.length, "cross-sport transfer query mismatch");
  assertEqual(getRecursiveGovernanceAdaptation(db, simulation.simulation_id).length, simulation.recursive_governance_adaptation.length, "governance adaptation query mismatch");
  assertEqual(getHistoricalMarketReactionScores(db, simulation.simulation_id).length, simulation.market_reaction_scores.length, "market reaction query mismatch");
  assertEqual(getValidatorMutationTests(db, simulation.simulation_id).length, simulation.validator_mutation_tests.length, "mutation query mismatch");
  assertEqual(getPreLiveInitializationSnapshots(db, simulation.simulation_id).length, simulation.pre_live_initialization.length, "pre-live initialization query mismatch");
  assertEqual(getIntelligenceSurvivabilitySimulation(db, simulation.simulation_id).length, simulation.survivability_simulation.length, "survivability query mismatch");
  assertEqual(getSimulationLineage(db, simulation.simulation_id).length, simulation.simulation_lineage.length, "simulation lineage query mismatch");

  assertActionSupported("pretrain_validators");
  assertActionSupported("simulate_consensus_tournament");
  assertActionSupported("simulate_adversarial_sources");
  assertActionSupported("score_misinformation_resistance");
  assertActionSupported("evolve_probabilistic_trust");
  assertActionSupported("run_reinforcement_calibration");
  assertActionSupported("evolve_validator_specialization");
  assertActionSupported("transfer_cross_sport_intelligence");
  assertActionSupported("adapt_recursive_governance");
  assertActionSupported("score_market_reaction");
  assertActionSupported("test_validator_mutation");
  assertActionSupported("freeze_pre_live_initialization");
  assertActionSupported("simulate_intelligence_survivability");
  assertQuerySupported("get_validator_pretraining_runtime");
  assertQuerySupported("get_consensus_tournament_history");
  assertQuerySupported("get_adversarial_source_simulation");
  assertQuerySupported("get_misinformation_resistance_scores");
  assertQuerySupported("get_probabilistic_trust_evolution");
  assertQuerySupported("get_reinforcement_calibration_loops");
  assertQuerySupported("get_validator_specialization_evolution");
  assertQuerySupported("get_cross_sport_transfer_learning");
  assertQuerySupported("get_recursive_governance_adaptation");
  assertQuerySupported("get_historical_market_reaction_scores");
  assertQuerySupported("get_validator_mutation_tests");
  assertQuerySupported("get_pre_live_initialization_snapshots");
  assertQuerySupported("get_intelligence_survivability_simulation");
  assertQuerySupported("get_simulation_lineage");
  assertStateSupported("pretraining");
  assertStateSupported("simulating");
  assertStateSupported("adversarial");
  assertStateSupported("reinforcing");
  assertStateSupported("initializing");
  assertStateSupported("survivable");
  assertStateSupported("unstable");

  console.log("Replay historical simulation runtime validation passed.");
  console.log(JSON.stringify({
    simulation_id: simulation.simulation_id,
    deterministic_hash: simulation.deterministic_hash,
    state: simulation.state,
    calibration_id: simulation.calibration_id,
    pretraining: simulation.validator_pretraining.length,
    tournaments: simulation.consensus_tournaments.length,
    adversarial_sources: simulation.adversarial_sources.length,
    pre_live_initialization: simulation.pre_live_initialization.length,
    survivability: simulation.survivability_simulation.length,
    immutable_outputs: {
      snapshot: Object.isFrozen(simulation),
      initialization: Object.isFrozen(simulation.pre_live_initialization),
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
    season_id: `simulation-season:${league}:${year}`,
    league,
    season_year: year,
    generated_at: `${year}-10-10T12:00:00.000Z`,
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
  const generatedAt = `${year}-10-10T12:00:00.000Z`;
  const signals = [
    liveSignal(league, `${prefix}-injury`, "injury_update", team, player, sourceName, positive, positive ? 89 : 63),
    liveSignal(league, `${prefix}-line`, "line_move", team, null, `${league} Market Feed`, positive, positive ? 84 : 66),
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
      sportsbook: "SeedBook",
      market_source: "historical_simulation_fixture",
      spread_line: positive ? -3.5 : 4.5,
      spread_team: team,
      total_line: league === "NBA" ? 221.5 : league === "MLB" ? 8.5 : 48.5,
      moneyline_home: positive ? -150 : 135,
      moneyline_away: positive ? 130 : -155,
      source_game_id: `source-${prefix}-game`,
      snapshot_at: generatedAt,
    }],
    injury_reports: [{
      report_id: `${prefix}-injury-report`,
      league,
      team,
      player,
      designation: positive ? "OUT" : "Questionable",
      body_part: "ankle",
      source_id: sourceName.toLowerCase().replace(/\s+/g, "-"),
      confidence: positive ? 89 : 63,
      reported_at: generatedAt,
    }],
    source_intelligence_events: signals.map((signal) => ({
      event_id: `${prefix}-source-${signal.id}`,
      source_id: signal.sources[0]?.name.toLowerCase().replace(/\s+/g, "-") ?? "unknown",
      source_name: signal.sources[0]?.name ?? "Unknown",
      source_type: signal.sources[0]?.type ?? "api",
      reliability_score: positive ? 87 : 59,
      topic: signal.signal_type,
      league,
      signal_id: signal.id,
      observed_at: generatedAt,
    })),
    settled_outcomes: signals.map((signal) => outcome(prefix, signal, positive)),
  };
}

function rawEvent(league: ReplayHistoricalLeague, prefix: string, signal: LiveSignal, positive: boolean): RawEvent {
  return {
    id: `${prefix}-raw-${signal.id}`,
    source_id: signal.sources[0]?.name.toLowerCase().replace(/\s+/g, "-") ?? "unknown",
    source_type: signal.sources[0]?.type === "scrape" ? "scrape" : "api",
    league,
    game_id: signal.game_id,
    team: signal.team,
    player: signal.player,
    event_type: signal.signal_type === "line_move" ? "line_move" : "injury_update",
    payload: { fixture: "historical_simulation", positive },
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
): LiveSignal {
  return {
    id,
    league,
    game_id: `${id}-game`,
    signal_type: signalType,
    headline: `${league} historical simulation ${signalType}`,
    body: "Historical intelligence simulation runtime validation fixture.",
    action_note: "Simulate validator behavior before live deployment.",
    why_it_matters: "Validators should pretrain against historical intelligence environments.",
    team,
    player,
    matchup: "Historical simulation matchup",
    sources: [{ name: sourceName, type: sourceName.includes("Desk") || sourceName.includes("Source") ? "scrape" : "api" }],
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
    score: positive ? 88 : 64,
    score_band: positive ? "Elite" : "Watchlist",
    urgency_label: positive ? "URGENT" : "WATCH",
    urgency_reason: "Historical simulation fixture",
    trust_label: positive ? "Corroborated" : "Developing",
    score_explanation: "Seeded historical simulation score",
    breakdown: breakdown(),
    raw_event_ids: [`raw-${id}`],
    signal_time: "2025-10-10T12:00:00.000Z",
    created_at: "2025-10-10T12:00:30.000Z",
    updated_at: "2025-10-10T12:00:30.000Z",
    outcome_id: `${id}-outcome`,
  };
}

function outcome(prefix: string, signal: LiveSignal, positive: boolean): Outcome {
  return {
    id: `${prefix}-outcome-${signal.id}`,
    signal_id: signal.id,
    game_id: signal.game_id ?? `${prefix}-game`,
    home_score: positive ? 34 : 17,
    away_score: positive ? 23 : 27,
    market: "spread",
    line_at_signal: positive ? -2.5 : 2.5,
    closing_line: positive ? -4.5 : 4.5,
    actual_result: positive ? 11 : -10,
    hit: positive,
    clv: positive ? 2 : -2,
    recorded_at: "2025-10-10T22:30:00.000Z",
    created_at: "2025-10-10T22:30:00.000Z",
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
    leagueModifierApplied: "Historical simulation fixture",
    rawBeforeMods: 82,
  };
}

function assertActionSupported(_action: ReplayHistoricalSimulationRuntimeAction): void { return; }
function assertQuerySupported(_query: ReplayHistoricalSimulationRuntimeQuery): void { return; }
function assertStateSupported(_state: ReplayHistoricalSimulationRuntimeState): void { return; }

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
}
