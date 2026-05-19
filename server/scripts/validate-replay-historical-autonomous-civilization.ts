import Database from "better-sqlite3";

import { buildReplayHistoricalAutonomousCivilizationSnapshot, computeReplayHistoricalAutonomousCivilizationHash, getBlackSwanCollapseEvents, getCivilWarFractures, getCivilizationPromotionGates, getCivilizationRecovery, getCivilizationReplayAnalytics, getCivilizationStateLineage, getCivilizationWarfare, getCorruptionPropagation, getDynastySurvivalScores, getEvolutionaryCatastrophes, getGovernanceIdeologies, getIntelligenceMigrations, getRecursiveValidatorSpawns, getRuntimeDiplomacy, getSelfPreservingSwarms, getSpeciesDivergence, getTreatyAlliances, getValidatorEmpires, serializeReplayHistoricalAutonomousCivilizationSnapshot } from "../pipeline/replay-historical-autonomous-civilization";
import type { ReplayHistoricalAutonomousCivilizationAction, ReplayHistoricalAutonomousCivilizationQuery, ReplayHistoricalAutonomousCivilizationState } from "../pipeline/replay-historical-autonomous-civilization-contract";
import { buildReplayHistoricalAutonomousLeagueSnapshot } from "../pipeline/replay-historical-autonomous-league";
import { buildReplayHistoricalCalibrationSnapshot } from "../pipeline/replay-historical-calibration";
import type { ReplayHistoricalLeague, ReplayHistoricalSeasonInput, ReplayHistoricalSportsFeedSnapshot } from "../pipeline/replay-historical-calibration-contract";
import { buildReplayHistoricalSimulationRuntimeSnapshot } from "../pipeline/replay-historical-simulation-runtime";
import type { LiveSignal, Outcome, RawEvent, ScoreBreakdown, SignalType } from "../pipeline/types";

const GENERATED_AT = "2026-05-24T17:00:00.000Z";
const PERSISTED_AT = "2026-05-24T17:05:00.000Z";

const db = new Database(":memory:");

try {
  const calibration = buildReplayHistoricalCalibrationSnapshot(db, {
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    seasons: [
      season("NBA", 2022, true, "nba-civ-2022", "NBA Injury Desk", "BOS", "Jayson Tatum"),
      season("NBA", 2024, true, "nba-civ-2024", "NBA Market Feed", "DEN", "Nikola Jokic"),
      season("MLB", 2024, true, "mlb-civ-2024", "MLB Beat Desk", "LAD", "Mookie Betts"),
      season("NFL", 2024, false, "nfl-civ-2024", "NFL Beat Desk", "KC", "Patrick Mahomes"),
      season("CFB", 2025, true, "cfb-civ-2025", "CFB Sideline Source", "UGA", "Starting QB"),
    ],
    runtime_nodes: [
      { node_id: "civilization-runtime-primary", region: "us-west", priority: 100, healthy: true, last_seen_at: GENERATED_AT },
      { node_id: "civilization-runtime-secondary", region: "us-east", priority: 90, healthy: true, last_seen_at: GENERATED_AT },
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
  const league = buildReplayHistoricalAutonomousLeagueSnapshot(db, {
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    simulation_snapshot: simulation,
    generation_count: 5,
    extinction_threshold: 0.44,
    promotion_threshold: 0.64,
  });
  const civilization = buildReplayHistoricalAutonomousCivilizationSnapshot(db, {
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    autonomous_league_snapshot: league,
    civilization_epochs: 4,
    adversarial_pressure: 0.36,
    collapse_threshold: 0.58,
    promotion_threshold: 0.64,
  });
  const civilizationAgain = buildReplayHistoricalAutonomousCivilizationSnapshot(db, {
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    autonomous_league_snapshot: league,
    civilization_epochs: 4,
    adversarial_pressure: 0.36,
    collapse_threshold: 0.58,
    promotion_threshold: 0.64,
  });

  assertEqual(civilization.deterministic_hash, civilizationAgain.deterministic_hash, "civilization hash must be deterministic");
  assertEqual(serializeReplayHistoricalAutonomousCivilizationSnapshot(civilization), serializeReplayHistoricalAutonomousCivilizationSnapshot(civilizationAgain), "civilization serialization mismatch");
  assertEqual(computeReplayHistoricalAutonomousCivilizationHash({ civilization: civilization.civilization_id }).length, 64, "civilization hash helper mismatch");
  assertEqual(Object.isFrozen(civilization), true, "civilization snapshot must be immutable");
  assertEqual(Object.isFrozen(civilization.civilization_analytics), true, "civilization analytics must be immutable");

  assertEqual(civilization.governance_ideologies.length, league.ecosystem.length, "governance ideology simulation missing");
  assertEqual(civilization.validator_empires.length, league.ecosystem.length, "validator empire modeling missing");
  assertEqual(civilization.warfare.length, league.ecosystem.length * (league.ecosystem.length - 1) * 4, "adversarial civilization warfare missing");
  assertEqual(civilization.recursive_spawns.length > 0, true, "recursive validator spawning missing");
  assertEqual(civilization.catastrophes.length, civilization.validator_empires.length * 4, "evolutionary catastrophe simulation missing");
  assertEqual(civilization.intelligence_migrations.length, league.ecosystem.length * (league.ecosystem.length - 1), "distributed intelligence migration missing");
  assertEqual(civilization.treaty_alliances.length, league.ecosystem.length * (league.ecosystem.length - 1) / 2, "treaty/alliance infrastructure missing");
  assertEqual(civilization.civil_war_fractures.length, league.ecosystem.length, "civil war fracture simulation missing");
  assertEqual(civilization.black_swan_events.length, league.ecosystem.length, "black-swan collapse events missing");
  assertEqual(civilization.civilization_recovery.length, civilization.black_swan_events.length, "civilization recovery modeling missing");
  assertEqual(civilization.dynasty_survival.length, league.ecosystem.length, "dynasty survival scoring missing");
  assertEqual(civilization.species_divergence.length, league.specialization_markets.length, "validator species divergence tracking missing");
  assertEqual(civilization.runtime_diplomacy.length, league.ecosystem.length * (league.ecosystem.length - 1), "autonomous runtime diplomacy missing");
  assertEqual(civilization.self_preserving_swarms.length, league.ecosystem.length, "self-preserving validator swarms missing");
  assertEqual(civilization.corruption_propagation.length, league.coalition_collusion_detection.length, "corruption propagation modeling missing");
  assertEqual(civilization.civilization_analytics.length, league.ecosystem.length, "civilization-scale analytics missing");
  assertEqual(civilization.promotion_gates.length, league.ecosystem.length, "simulation-to-live civilization gates missing");
  assertEqual(civilization.civilization_state_lineage.length > civilization.promotion_gates.length, true, "civilization state lineage missing");

  assertEqual(civilization.warfare.some((record) => record.warfare_outcome === "attacker_advantage" || record.warfare_outcome === "defender_holds"), true, "warfare outcomes not exercised");
  assertEqual(civilization.governance_ideologies.every((record) => record.ideology_hash.length === 64), true, "ideology lineage hashes invalid");
  assertEqual(civilization.validator_empires.every((record) => record.territory_score >= 0 && record.expansion_pressure >= 0), true, "empire scores out of range");
  assertEqual(civilization.recursive_spawns.every((record) => record.spawn_hash.length === 64), true, "spawn lineage hashes invalid");
  assertEqual(civilization.catastrophes.some((record) => record.severity > 0), true, "catastrophe severity missing");
  assertEqual(civilization.intelligence_migrations.every((record) => record.from_league !== record.to_league), true, "migration league pairing invalid");
  assertEqual(civilization.treaty_alliances.some((record) => record.cooperation_score > 0), true, "treaty cooperation missing");
  assertEqual(civilization.civil_war_fractures.every((record) => record.civil_war_risk >= 0 && record.civil_war_risk <= 1), true, "civil war risk out of range");
  assertEqual(civilization.black_swan_events.every((record) => record.containment_score >= 0 && record.containment_score <= 1), true, "black-swan containment out of range");
  assertEqual(civilization.civilization_recovery.some((record) => record.recovered), true, "civilization recovery not exercised");
  assertEqual(civilization.dynasty_survival.some((record) => record.dynasty_score > 0), true, "dynasty scoring missing");
  assertEqual(civilization.species_divergence.some((record) => record.species_name.includes("market_reaction")), true, "market species divergence missing");
  assertEqual(civilization.runtime_diplomacy.some((record) => record.diplomatic_posture === "ally" || record.diplomatic_posture === "rival" || record.diplomatic_posture === "neutral"), true, "diplomacy posture missing");
  assertEqual(civilization.self_preserving_swarms.every((record) => record.self_preservation_score >= 0), true, "swarm score invalid");
  assertEqual(civilization.corruption_propagation.every((record) => record.corruption_hash.length === 64), true, "corruption hashes invalid");
  assertEqual(civilization.civilization_analytics.every((record) => record.promotion_readiness >= 0 && record.collapse_risk <= 1), true, "civilization analytics out of range");
  assertEqual(civilization.promotion_gates.some((record) => record.promoted), true, "no civilization passed live promotion gates");
  assertEqual(civilization.civilization_state_lineage.every((record) => record.transition_hash.length === 64 && record.source_hash.length === 64 && record.target_hash.length === 64), true, "state lineage hashes invalid");
  assertEqual(civilization.civilization_state_lineage.some((record) => record.transition_kind === "recovery"), true, "recovery lineage missing");

  assertEqual(getCivilizationWarfare(db, civilization.civilization_id).length, civilization.warfare.length, "warfare query mismatch");
  assertEqual(getGovernanceIdeologies(db, civilization.civilization_id).length, civilization.governance_ideologies.length, "ideology query mismatch");
  assertEqual(getValidatorEmpires(db, civilization.civilization_id).length, civilization.validator_empires.length, "empire query mismatch");
  assertEqual(getRecursiveValidatorSpawns(db, civilization.civilization_id).length, civilization.recursive_spawns.length, "spawn query mismatch");
  assertEqual(getEvolutionaryCatastrophes(db, civilization.civilization_id).length, civilization.catastrophes.length, "catastrophe query mismatch");
  assertEqual(getIntelligenceMigrations(db, civilization.civilization_id).length, civilization.intelligence_migrations.length, "migration query mismatch");
  assertEqual(getTreatyAlliances(db, civilization.civilization_id).length, civilization.treaty_alliances.length, "treaty query mismatch");
  assertEqual(getCivilWarFractures(db, civilization.civilization_id).length, civilization.civil_war_fractures.length, "fracture query mismatch");
  assertEqual(getBlackSwanCollapseEvents(db, civilization.civilization_id).length, civilization.black_swan_events.length, "black-swan query mismatch");
  assertEqual(getCivilizationRecovery(db, civilization.civilization_id).length, civilization.civilization_recovery.length, "recovery query mismatch");
  assertEqual(getDynastySurvivalScores(db, civilization.civilization_id).length, civilization.dynasty_survival.length, "dynasty query mismatch");
  assertEqual(getSpeciesDivergence(db, civilization.civilization_id).length, civilization.species_divergence.length, "species query mismatch");
  assertEqual(getRuntimeDiplomacy(db, civilization.civilization_id).length, civilization.runtime_diplomacy.length, "diplomacy query mismatch");
  assertEqual(getSelfPreservingSwarms(db, civilization.civilization_id).length, civilization.self_preserving_swarms.length, "swarm query mismatch");
  assertEqual(getCorruptionPropagation(db, civilization.civilization_id).length, civilization.corruption_propagation.length, "corruption query mismatch");
  assertEqual(getCivilizationReplayAnalytics(db, civilization.civilization_id).length, civilization.civilization_analytics.length, "analytics query mismatch");
  assertEqual(getCivilizationPromotionGates(db, civilization.civilization_id).length, civilization.promotion_gates.length, "promotion gate query mismatch");
  assertEqual(getCivilizationStateLineage(db, civilization.civilization_id).length, civilization.civilization_state_lineage.length, "state lineage query mismatch");

  assertActionSupported("simulate_adversarial_civilization_warfare");
  assertActionSupported("simulate_governance_ideology");
  assertActionSupported("model_validator_empire_expansion");
  assertActionSupported("spawn_recursive_validators");
  assertActionSupported("simulate_evolutionary_catastrophe");
  assertActionSupported("migrate_distributed_intelligence");
  assertActionSupported("form_treaty_alliance");
  assertActionSupported("simulate_civil_war_fracture");
  assertActionSupported("inject_black_swan_collapse");
  assertActionSupported("recover_from_civilization_collapse");
  assertActionSupported("score_dynasty_survival");
  assertActionSupported("track_validator_species_divergence");
  assertActionSupported("run_autonomous_diplomacy");
  assertActionSupported("model_self_preserving_swarms");
  assertActionSupported("model_corruption_propagation");
  assertActionSupported("emit_civilization_replay_analytics");
  assertActionSupported("record_civilization_state_lineage");
  assertQuerySupported("get_civilization_warfare");
  assertQuerySupported("get_governance_ideologies");
  assertQuerySupported("get_validator_empires");
  assertQuerySupported("get_recursive_validator_spawns");
  assertQuerySupported("get_evolutionary_catastrophes");
  assertQuerySupported("get_intelligence_migrations");
  assertQuerySupported("get_treaty_alliances");
  assertQuerySupported("get_civil_war_fractures");
  assertQuerySupported("get_black_swan_collapse_events");
  assertQuerySupported("get_civilization_recovery");
  assertQuerySupported("get_dynasty_survival_scores");
  assertQuerySupported("get_species_divergence");
  assertQuerySupported("get_runtime_diplomacy");
  assertQuerySupported("get_self_preserving_swarms");
  assertQuerySupported("get_corruption_propagation");
  assertQuerySupported("get_civilization_replay_analytics");
  assertQuerySupported("get_civilization_promotion_gates");
  assertQuerySupported("get_civilization_state_lineage");
  assertStateSupported("warring");
  assertStateSupported("fracturing");
  assertStateSupported("migrating");
  assertStateSupported("collapsing");
  assertStateSupported("surviving");
  assertStateSupported("promoting");
  assertStateSupported("unstable");

  console.log("Replay historical autonomous civilization validation passed.");
  console.log(JSON.stringify({
    civilization_id: civilization.civilization_id,
    deterministic_hash: civilization.deterministic_hash,
    state: civilization.state,
    warfare: civilization.warfare.length,
    empires: civilization.validator_empires.length,
    treaties: civilization.treaty_alliances.length,
    recovery: civilization.civilization_recovery.length,
    promoted_civilizations: civilization.promotion_gates.filter((record) => record.promoted).length,
    state_lineage: civilization.civilization_state_lineage.length,
    immutable_outputs: {
      snapshot: Object.isFrozen(civilization),
      analytics: Object.isFrozen(civilization.civilization_analytics),
    },
  }, null, 2));
} finally {
  db.close();
}

function season(league: ReplayHistoricalLeague, year: number, positive: boolean, prefix: string, sourceName: string, team: string, player: string): ReplayHistoricalSeasonInput {
  return { season_id: `civilization-season:${league}:${year}`, league, season_year: year, generated_at: `${year}-08-01T12:00:00.000Z`, feeds: [feed(league, year, positive, prefix, sourceName, team, player)] };
}

function feed(league: ReplayHistoricalLeague, year: number, positive: boolean, prefix: string, sourceName: string, team: string, player: string): ReplayHistoricalSportsFeedSnapshot {
  const generatedAt = `${year}-08-01T12:00:00.000Z`;
  const signals = [
    liveSignal(league, `${prefix}-injury`, "injury_update", team, player, sourceName, positive, positive ? 92 : 57),
    liveSignal(league, `${prefix}-line`, "line_move", team, null, `${league} Market Feed`, positive, positive ? 87 : 61),
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
      market_source: "historical_autonomous_civilization_fixture",
      spread_line: positive ? -3.5 : 5.5,
      spread_team: team,
      total_line: league === "NBA" ? 224.5 : league === "MLB" ? 8.5 : 50.5,
      moneyline_home: positive ? -165 : 145,
      moneyline_away: positive ? 145 : -170,
      source_game_id: `source-${prefix}-game`,
      snapshot_at: generatedAt,
    }],
    injury_reports: [{ report_id: `${prefix}-injury-report`, league, team, player, designation: positive ? "OUT" : "Questionable", body_part: "ankle", source_id: sourceName.toLowerCase().replace(/\s+/g, "-"), confidence: positive ? 92 : 57, reported_at: generatedAt }],
    source_intelligence_events: signals.map((signal) => ({ event_id: `${prefix}-source-${signal.id}`, source_id: signal.sources[0]?.name.toLowerCase().replace(/\s+/g, "-") ?? "unknown", source_name: signal.sources[0]?.name ?? "Unknown", source_type: signal.sources[0]?.type ?? "api", reliability_score: positive ? 90 : 55, topic: signal.signal_type, league, signal_id: signal.id, observed_at: generatedAt })),
    settled_outcomes: signals.map((signal) => outcome(prefix, signal, positive)),
  };
}

function rawEvent(league: ReplayHistoricalLeague, prefix: string, signal: LiveSignal, positive: boolean): RawEvent {
  return { id: `${prefix}-raw-${signal.id}`, source_id: signal.sources[0]?.name.toLowerCase().replace(/\s+/g, "-") ?? "unknown", source_type: signal.sources[0]?.type === "scrape" ? "scrape" : "api", league, game_id: signal.game_id, team: signal.team, player: signal.player, event_type: signal.signal_type === "line_move" ? "line_move" : "injury_update", payload: { fixture: "historical_autonomous_civilization", positive }, processed: true, processed_at: signal.updated_at, created_at: signal.created_at, received_at: signal.signal_time };
}

function liveSignal(league: ReplayHistoricalLeague, id: string, signalType: SignalType, team: string, player: string | null, sourceName: string, positive: boolean, confidence: number): LiveSignal {
  return {
    id,
    league,
    game_id: `${id}-game`,
    signal_type: signalType,
    headline: `${league} autonomous civilization ${signalType}`,
    body: "Historical autonomous civilization validation fixture.",
    action_note: "Simulate validator society before live deployment.",
    why_it_matters: "Only durable validator civilizations should enter live runtime.",
    team,
    player,
    matchup: "Historical civilization matchup",
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
    score: positive ? 91 : 60,
    score_band: positive ? "Elite" : "Watchlist",
    urgency_label: positive ? "URGENT" : "WATCH",
    urgency_reason: "Historical civilization fixture",
    trust_label: positive ? "Corroborated" : "Developing",
    score_explanation: "Seeded civilization score",
    breakdown: breakdown(),
    raw_event_ids: [`raw-${id}`],
    signal_time: "2025-08-01T12:00:00.000Z",
    created_at: "2025-08-01T12:00:30.000Z",
    updated_at: "2025-08-01T12:00:30.000Z",
    outcome_id: `${id}-outcome`,
  };
}

function outcome(prefix: string, signal: LiveSignal, positive: boolean): Outcome {
  return { id: `${prefix}-outcome-${signal.id}`, signal_id: signal.id, game_id: signal.game_id ?? `${prefix}-game`, home_score: positive ? 36 : 15, away_score: positive ? 21 : 32, market: "spread", line_at_signal: positive ? -2.5 : 2.5, closing_line: positive ? -4.5 : 4.5, actual_result: positive ? 15 : -17, hit: positive, clv: positive ? 2 : -2, recorded_at: "2025-08-01T22:30:00.000Z", created_at: "2025-08-01T22:30:00.000Z" };
}

function breakdown(): ScoreBreakdown {
  return { confidenceScore: 18, sourceQualityScore: 23, marketImpactScore: 19, recencyBonus: 10, relevanceScore: 7, contextScore: 5, leagueModifierApplied: "Historical civilization fixture", rawBeforeMods: 82 };
}

function assertActionSupported(_action: ReplayHistoricalAutonomousCivilizationAction): void { return; }
function assertQuerySupported(_query: ReplayHistoricalAutonomousCivilizationQuery): void { return; }
function assertStateSupported(_state: ReplayHistoricalAutonomousCivilizationState): void { return; }

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
}
