import Database from "better-sqlite3";

import { buildReplayHistoricalAutonomousLeagueSnapshot, computeReplayHistoricalAutonomousLeagueHash, getCoalitionCollusionDetection, getEvolutionaryAudit, getEvolutionaryMemory, getEvolutionaryTournamentGenerations, getGovernanceForkSimulation, getIntelligenceHierarchy, getSimulationToLivePromotion, getSpecializationMarket, getSurvivalExtinctionCycles, getValidatorEconomyCapital, getValidatorLeagueEcosystem, getValidatorPopulationLineage, serializeReplayHistoricalAutonomousLeagueSnapshot } from "../pipeline/replay-historical-autonomous-league";
import type { ReplayHistoricalAutonomousLeagueAction, ReplayHistoricalAutonomousLeagueQuery, ReplayHistoricalAutonomousLeagueState } from "../pipeline/replay-historical-autonomous-league-contract";
import { buildReplayHistoricalCalibrationSnapshot } from "../pipeline/replay-historical-calibration";
import type { ReplayHistoricalLeague, ReplayHistoricalSeasonInput, ReplayHistoricalSportsFeedSnapshot } from "../pipeline/replay-historical-calibration-contract";
import { buildReplayHistoricalSimulationRuntimeSnapshot } from "../pipeline/replay-historical-simulation-runtime";
import type { LiveSignal, Outcome, RawEvent, ScoreBreakdown, SignalType } from "../pipeline/types";

const GENERATED_AT = "2026-05-23T16:00:00.000Z";
const PERSISTED_AT = "2026-05-23T16:05:00.000Z";

const db = new Database(":memory:");

try {
  const calibration = buildReplayHistoricalCalibrationSnapshot(db, {
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    seasons: [
      season("NBA", 2022, true, "nba-league-2022", "NBA Injury Desk", "BOS", "Jayson Tatum"),
      season("NBA", 2024, true, "nba-league-2024", "NBA Market Feed", "DEN", "Nikola Jokic"),
      season("MLB", 2024, true, "mlb-league-2024", "MLB Beat Desk", "LAD", "Mookie Betts"),
      season("NFL", 2024, false, "nfl-league-2024", "NFL Beat Desk", "KC", "Patrick Mahomes"),
      season("CFB", 2025, true, "cfb-league-2025", "CFB Sideline Source", "UGA", "Starting QB"),
    ],
    runtime_nodes: [
      { node_id: "league-runtime-primary", region: "us-west", priority: 100, healthy: true, last_seen_at: GENERATED_AT },
      { node_id: "league-runtime-secondary", region: "us-east", priority: 90, healthy: true, last_seen_at: GENERATED_AT },
    ],
  });
  const simulation = buildReplayHistoricalSimulationRuntimeSnapshot(db, {
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    calibration_snapshot: calibration,
    simulation_epochs: 4,
    adversarial_pressure: 0.3,
    reinforcement_learning_rate: 0.22,
  });
  const league = buildReplayHistoricalAutonomousLeagueSnapshot(db, {
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    simulation_snapshot: simulation,
    generation_count: 5,
    extinction_threshold: 0.44,
    promotion_threshold: 0.64,
  });
  const leagueAgain = buildReplayHistoricalAutonomousLeagueSnapshot(db, {
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    simulation_snapshot: simulation,
    generation_count: 5,
    extinction_threshold: 0.44,
    promotion_threshold: 0.64,
  });

  assertEqual(league.deterministic_hash, leagueAgain.deterministic_hash, "autonomous league hash must be deterministic");
  assertEqual(serializeReplayHistoricalAutonomousLeagueSnapshot(league), serializeReplayHistoricalAutonomousLeagueSnapshot(leagueAgain), "autonomous league serialization mismatch");
  assertEqual(computeReplayHistoricalAutonomousLeagueHash({ league: league.autonomous_league_id }).length, 64, "autonomous league hash helper mismatch");
  assertEqual(Object.isFrozen(league), true, "autonomous league snapshot must be immutable");
  assertEqual(Object.isFrozen(league.population_lineage), true, "population lineage must be immutable");

  assertEqual(league.ecosystem.length >= 4, true, "validator league ecosystem missing");
  assertEqual(league.population_lineage.length, simulation.pre_live_initialization.length * 6, "population lineage generations missing");
  assertEqual(league.evolutionary_tournaments.length, league.ecosystem.length * 6, "multi-generation tournament engine missing");
  assertEqual(league.survival_extinction_cycles.length, league.population_lineage.length, "survival/extinction cycles missing");
  assertEqual(league.specialization_markets.length > 0, true, "specialization market simulation missing");
  assertEqual(league.coalition_collusion_detection.length > 0, true, "coalition/collusion detection scaffolding missing");
  assertEqual(league.economy_capital_allocation.length, league.population_lineage.length, "validator economy allocation missing");
  assertEqual(league.governance_forks.length, league.ecosystem.length, "governance fork simulation missing");
  assertEqual(league.intelligence_hierarchy.length, league.economy_capital_allocation.length, "intelligence hierarchy formation missing");
  assertEqual(league.evolutionary_memory.length, league.ecosystem.length, "long-horizon memory persistence missing");
  assertEqual(league.live_promotion_criteria.length, league.intelligence_hierarchy.length, "simulation-to-live promotion criteria missing");
  assertEqual(league.evolutionary_audit.length > league.live_promotion_criteria.length, true, "deterministic evolutionary audit missing");

  assertEqual(league.ecosystem.every((record) => record.ecosystem_fitness >= 0 && record.ecosystem_fitness <= 1), true, "ecosystem fitness out of range");
  assertEqual(league.population_lineage.some((record) => record.lineage_status === "elite"), true, "elite validator lineage not identified");
  assertEqual(league.population_lineage.some((record) => record.lineage_status === "weak"), true, "weak validator lineage not identified");
  assertEqual(league.evolutionary_tournaments.every((record) => record.champion_fitness >= 0), true, "champion fitness invalid");
  assertEqual(league.survival_extinction_cycles.some((record) => record.extinct), true, "extinction cycle not exercised");
  assertEqual(league.specialization_markets.some((record) => record.specialization === "market_reaction"), true, "market specialization economy missing");
  assertEqual(league.coalition_collusion_detection.some((record) => record.action === "observe" || record.action === "quarantine" || record.action === "fork_governance"), true, "collusion action missing");
  assertEqual(league.economy_capital_allocation.every((record) => record.intelligence_capital >= 0 && record.intelligence_capital <= 1), true, "capital allocation out of range");
  assertEqual(league.governance_forks.every((record) => record.parent_governance_hash.length === 64), true, "governance fork lineage hash invalid");
  assertEqual(league.intelligence_hierarchy.some((record) => record.tier === "apex" || record.tier === "specialist"), true, "elite hierarchy tier missing");
  assertEqual(league.evolutionary_memory.every((record) => record.generation_span === 5), true, "generation span not preserved in memory");
  assertEqual(league.live_promotion_criteria.some((record) => record.promoted), true, "no proven validator networks promoted");
  assertEqual(league.evolutionary_audit.every((record) => record.replay_safe && record.deterministic_hash_verified), true, "evolutionary audit did not verify determinism");

  assertEqual(getValidatorLeagueEcosystem(db, league.autonomous_league_id).length, league.ecosystem.length, "ecosystem query mismatch");
  assertEqual(getValidatorPopulationLineage(db, league.autonomous_league_id).length, league.population_lineage.length, "lineage query mismatch");
  assertEqual(getEvolutionaryTournamentGenerations(db, league.autonomous_league_id).length, league.evolutionary_tournaments.length, "tournament query mismatch");
  assertEqual(getSurvivalExtinctionCycles(db, league.autonomous_league_id).length, league.survival_extinction_cycles.length, "survival query mismatch");
  assertEqual(getSpecializationMarket(db, league.autonomous_league_id).length, league.specialization_markets.length, "market query mismatch");
  assertEqual(getCoalitionCollusionDetection(db, league.autonomous_league_id).length, league.coalition_collusion_detection.length, "collusion query mismatch");
  assertEqual(getValidatorEconomyCapital(db, league.autonomous_league_id).length, league.economy_capital_allocation.length, "economy query mismatch");
  assertEqual(getGovernanceForkSimulation(db, league.autonomous_league_id).length, league.governance_forks.length, "fork query mismatch");
  assertEqual(getIntelligenceHierarchy(db, league.autonomous_league_id).length, league.intelligence_hierarchy.length, "hierarchy query mismatch");
  assertEqual(getEvolutionaryMemory(db, league.autonomous_league_id).length, league.evolutionary_memory.length, "memory query mismatch");
  assertEqual(getSimulationToLivePromotion(db, league.autonomous_league_id).length, league.live_promotion_criteria.length, "promotion query mismatch");
  assertEqual(getEvolutionaryAudit(db, league.autonomous_league_id).length, league.evolutionary_audit.length, "audit query mismatch");

  assertActionSupported("form_validator_ecosystem");
  assertActionSupported("model_validator_population_lineage");
  assertActionSupported("run_evolutionary_tournament");
  assertActionSupported("model_survival_extinction_cycle");
  assertActionSupported("simulate_specialization_market");
  assertActionSupported("detect_coalition_collusion");
  assertActionSupported("allocate_intelligence_capital");
  assertActionSupported("simulate_governance_fork");
  assertActionSupported("form_intelligence_hierarchy");
  assertActionSupported("persist_evolutionary_memory");
  assertActionSupported("evaluate_live_promotion");
  assertActionSupported("emit_evolutionary_audit");
  assertQuerySupported("get_validator_league_ecosystem");
  assertQuerySupported("get_validator_population_lineage");
  assertQuerySupported("get_evolutionary_tournament_generations");
  assertQuerySupported("get_survival_extinction_cycles");
  assertQuerySupported("get_specialization_market");
  assertQuerySupported("get_coalition_collusion_detection");
  assertQuerySupported("get_validator_economy_capital");
  assertQuerySupported("get_governance_fork_simulation");
  assertQuerySupported("get_intelligence_hierarchy");
  assertQuerySupported("get_evolutionary_memory");
  assertQuerySupported("get_simulation_to_live_promotion");
  assertQuerySupported("get_evolutionary_audit");
  assertStateSupported("forming");
  assertStateSupported("competing");
  assertStateSupported("evolving");
  assertStateSupported("forking");
  assertStateSupported("surviving");
  assertStateSupported("promoting");
  assertStateSupported("unstable");

  console.log("Replay historical autonomous intelligence league validation passed.");
  console.log(JSON.stringify({
    autonomous_league_id: league.autonomous_league_id,
    deterministic_hash: league.deterministic_hash,
    state: league.state,
    ecosystems: league.ecosystem.length,
    lineages: league.population_lineage.length,
    generations: league.evolutionary_tournaments.length,
    promoted_networks: league.live_promotion_criteria.filter((record) => record.promoted).length,
    audit_records: league.evolutionary_audit.length,
    immutable_outputs: {
      snapshot: Object.isFrozen(league),
      population_lineage: Object.isFrozen(league.population_lineage),
    },
  }, null, 2));
} finally {
  db.close();
}

function season(league: ReplayHistoricalLeague, year: number, positive: boolean, prefix: string, sourceName: string, team: string, player: string): ReplayHistoricalSeasonInput {
  return {
    season_id: `autonomous-league-season:${league}:${year}`,
    league,
    season_year: year,
    generated_at: `${year}-09-01T12:00:00.000Z`,
    feeds: [feed(league, year, positive, prefix, sourceName, team, player)],
  };
}

function feed(league: ReplayHistoricalLeague, year: number, positive: boolean, prefix: string, sourceName: string, team: string, player: string): ReplayHistoricalSportsFeedSnapshot {
  const generatedAt = `${year}-09-01T12:00:00.000Z`;
  const signals = [
    liveSignal(league, `${prefix}-injury`, "injury_update", team, player, sourceName, positive, positive ? 91 : 58),
    liveSignal(league, `${prefix}-line`, "line_move", team, null, `${league} Market Feed`, positive, positive ? 86 : 62),
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
      market_source: "historical_autonomous_league_fixture",
      spread_line: positive ? -3.5 : 5.5,
      spread_team: team,
      total_line: league === "NBA" ? 222.5 : league === "MLB" ? 8.5 : 49.5,
      moneyline_home: positive ? -160 : 145,
      moneyline_away: positive ? 140 : -165,
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
      confidence: positive ? 91 : 58,
      reported_at: generatedAt,
    }],
    source_intelligence_events: signals.map((signal) => ({
      event_id: `${prefix}-source-${signal.id}`,
      source_id: signal.sources[0]?.name.toLowerCase().replace(/\s+/g, "-") ?? "unknown",
      source_name: signal.sources[0]?.name ?? "Unknown",
      source_type: signal.sources[0]?.type ?? "api",
      reliability_score: positive ? 89 : 56,
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
    payload: { fixture: "historical_autonomous_league", positive },
    processed: true,
    processed_at: signal.updated_at,
    created_at: signal.created_at,
    received_at: signal.signal_time,
  };
}

function liveSignal(league: ReplayHistoricalLeague, id: string, signalType: SignalType, team: string, player: string | null, sourceName: string, positive: boolean, confidence: number): LiveSignal {
  return {
    id,
    league,
    game_id: `${id}-game`,
    signal_type: signalType,
    headline: `${league} autonomous league ${signalType}`,
    body: "Historical autonomous intelligence league validation fixture.",
    action_note: "Simulate validator civilization before live deployment.",
    why_it_matters: "Only proven validator networks should enter live runtime.",
    team,
    player,
    matchup: "Historical autonomous league matchup",
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
    score: positive ? 90 : 61,
    score_band: positive ? "Elite" : "Watchlist",
    urgency_label: positive ? "URGENT" : "WATCH",
    urgency_reason: "Historical autonomous league fixture",
    trust_label: positive ? "Corroborated" : "Developing",
    score_explanation: "Seeded autonomous league score",
    breakdown: breakdown(),
    raw_event_ids: [`raw-${id}`],
    signal_time: "2025-09-01T12:00:00.000Z",
    created_at: "2025-09-01T12:00:30.000Z",
    updated_at: "2025-09-01T12:00:30.000Z",
    outcome_id: `${id}-outcome`,
  };
}

function outcome(prefix: string, signal: LiveSignal, positive: boolean): Outcome {
  return {
    id: `${prefix}-outcome-${signal.id}`,
    signal_id: signal.id,
    game_id: signal.game_id ?? `${prefix}-game`,
    home_score: positive ? 35 : 16,
    away_score: positive ? 21 : 31,
    market: "spread",
    line_at_signal: positive ? -2.5 : 2.5,
    closing_line: positive ? -4.5 : 4.5,
    actual_result: positive ? 14 : -15,
    hit: positive,
    clv: positive ? 2 : -2,
    recorded_at: "2025-09-01T22:30:00.000Z",
    created_at: "2025-09-01T22:30:00.000Z",
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
    leagueModifierApplied: "Historical autonomous league fixture",
    rawBeforeMods: 82,
  };
}

function assertActionSupported(_action: ReplayHistoricalAutonomousLeagueAction): void { return; }
function assertQuerySupported(_query: ReplayHistoricalAutonomousLeagueQuery): void { return; }
function assertStateSupported(_state: ReplayHistoricalAutonomousLeagueState): void { return; }

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
}
