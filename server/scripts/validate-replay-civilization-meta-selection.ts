import Database from "better-sqlite3";

import { buildReplayHistoricalAutonomousCivilizationSnapshot } from "../pipeline/replay-historical-autonomous-civilization";
import { buildReplayHistoricalAutonomousLeagueSnapshot } from "../pipeline/replay-historical-autonomous-league";
import { buildReplayHistoricalCalibrationSnapshot } from "../pipeline/replay-historical-calibration";
import type { ReplayHistoricalLeague, ReplayHistoricalSeasonInput, ReplayHistoricalSportsFeedSnapshot } from "../pipeline/replay-historical-calibration-contract";
import { buildReplayHistoricalSimulationRuntimeSnapshot } from "../pipeline/replay-historical-simulation-runtime";
import {
  buildReplayCivilizationMetaSelectionSnapshot,
  computeReplayCivilizationMetaSelectionHash,
  getAdversarialConsensusDurability,
  getCivilizationFitnessScores,
  getCivilizationIntelligenceRankings,
  getCivilizationReputation,
  getCorruptionResistanceBenchmarks,
  getDynastySurvivabilityAnalytics,
  getExtinctionPredictions,
  getGovernanceStabilityForecasts,
  getLifecycleStateMachine,
  getLiveRuntimeEligibilityGates,
  getMultiEraCivilizationComparison,
  getRecursivePromotionScores,
  getSpeciesEvolutionTracking,
  getTraitInheritanceWeights,
  getTraitMutationAnalytics,
  serializeReplayCivilizationMetaSelectionSnapshot,
} from "../pipeline/replay-civilization-meta-selection";
import type {
  ReplayCivilizationMetaSelectionAction,
  ReplayCivilizationMetaSelectionQuery,
  ReplayCivilizationMetaSelectionState,
} from "../pipeline/replay-civilization-meta-selection-contract";
import type { LiveSignal, Outcome, RawEvent, ScoreBreakdown, SignalType } from "../pipeline/types";

const GENERATED_AT = "2026-05-25T18:00:00.000Z";
const PERSISTED_AT = "2026-05-25T18:05:00.000Z";

const db = new Database(":memory:");

try {
  const civilizationA = buildCivilization("meta-a", 0.35, 0.64);
  const civilizationB = buildCivilization("meta-b", 0.42, 0.66);
  const metaSelection = buildReplayCivilizationMetaSelectionSnapshot(db, {
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    civilization_snapshots: [civilizationA, civilizationB],
    era_label: "meta-selection-validation-era",
    promotion_threshold: 0.62,
    extinction_threshold: 0.68,
  });
  const metaSelectionAgain = buildReplayCivilizationMetaSelectionSnapshot(db, {
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    civilization_snapshots: [civilizationA, civilizationB],
    era_label: "meta-selection-validation-era",
    promotion_threshold: 0.62,
    extinction_threshold: 0.68,
  });

  assertEqual(metaSelection.deterministic_hash, metaSelectionAgain.deterministic_hash, "meta-selection hash must be deterministic");
  assertEqual(serializeReplayCivilizationMetaSelectionSnapshot(metaSelection), serializeReplayCivilizationMetaSelectionSnapshot(metaSelectionAgain), "meta-selection serialization mismatch");
  assertEqual(computeReplayCivilizationMetaSelectionHash({ meta_selection: metaSelection.meta_selection_id }).length, 64, "meta-selection hash helper mismatch");
  assertEqual(Object.isFrozen(metaSelection), true, "meta-selection snapshot must be immutable");
  assertEqual(Object.isFrozen(metaSelection.intelligence_rankings), true, "rankings must be immutable");

  const expectedLeagueRows = civilizationA.civilization_analytics.length + civilizationB.civilization_analytics.length;
  assertEqual(metaSelection.civilization_ids.length, 2, "civilization ids missing");
  assertEqual(metaSelection.fitness_scores.length, expectedLeagueRows, "civilization fitness scoring missing");
  assertEqual(metaSelection.dynasty_survivability.length, expectedLeagueRows, "dynasty survivability analytics missing");
  assertEqual(metaSelection.corruption_resistance.length, expectedLeagueRows, "corruption resistance benchmarking missing");
  assertEqual(metaSelection.extinction_predictions.length, expectedLeagueRows, "extinction prediction missing");
  assertEqual(metaSelection.governance_forecasts.length, expectedLeagueRows, "governance stability forecasting missing");
  assertEqual(metaSelection.trait_inheritance.length > expectedLeagueRows, true, "trait inheritance weighting missing");
  assertEqual(metaSelection.trait_mutations.length, metaSelection.trait_inheritance.length, "trait mutation analytics missing");
  assertEqual(metaSelection.lifecycle_states.length, expectedLeagueRows, "civilization lifecycle state machine missing");
  assertEqual(metaSelection.recursive_promotion.length, expectedLeagueRows, "recursive promotion scoring missing");
  assertEqual(metaSelection.eligibility_gates.length, expectedLeagueRows, "live-runtime eligibility gates missing");
  assertEqual(metaSelection.adversarial_durability.length, expectedLeagueRows, "adversarial consensus durability analytics missing");
  assertEqual(metaSelection.multi_era_comparison.length >= 4, true, "multi-era civilization comparison missing");
  assertEqual(metaSelection.civilization_reputation.length, expectedLeagueRows, "civilization reputation persistence missing");
  assertEqual(metaSelection.species_evolution.length, metaSelection.trait_inheritance.length, "species evolution tracking missing");
  assertEqual(metaSelection.intelligence_rankings.length, expectedLeagueRows, "civilization intelligence rankings missing");
  assertEqual(metaSelection.meta_selection_lineage.length > metaSelection.intelligence_rankings.length, true, "meta-selection lineage missing");

  assertEqual(metaSelection.fitness_scores.every((record) => record.fitness_score >= 0 && record.fitness_score <= 1), true, "fitness scores out of range");
  assertEqual(metaSelection.dynasty_survivability.some((record) => record.survivability_index > 0), true, "dynasty survivability not scored");
  assertEqual(metaSelection.corruption_resistance.every((record) => record.resistance_score >= 0 && record.resistance_score <= 1), true, "corruption resistance out of range");
  assertEqual(metaSelection.extinction_predictions.every((record) => record.extinction_probability >= 0 && record.extinction_probability <= 1), true, "extinction probability out of range");
  assertEqual(metaSelection.governance_forecasts.every((record) => record.forecast_stability >= 0 && record.forecast_stability <= 1), true, "governance forecast out of range");
  assertEqual(metaSelection.trait_inheritance.some((record) => record.trait.includes("market_reaction")), true, "market trait inheritance missing");
  assertEqual(metaSelection.trait_mutations.some((record) => record.mutation_pressure > 0), true, "trait mutation pressure missing");
  assertEqual(metaSelection.lifecycle_states.some((record) => record.lifecycle_state === "promotable" || record.lifecycle_state === "expanding"), true, "promotable/expanding lifecycle missing");
  assertEqual(metaSelection.recursive_promotion.every((record) => record.recursive_depth > 0), true, "recursive promotion depth missing");
  assertEqual(metaSelection.eligibility_gates.some((record) => record.eligible), true, "no civilization eligible for live runtime");
  assertEqual(metaSelection.adversarial_durability.every((record) => record.adversarial_durability_score >= 0), true, "adversarial durability invalid");
  assertEqual(metaSelection.multi_era_comparison.every((record) => record.leading_civilization_id !== "none"), true, "era comparison leader missing");
  assertEqual(metaSelection.civilization_reputation.some((record) => record.reputation_tier === "elite" || record.reputation_tier === "legendary"), true, "elite reputation tier missing");
  assertEqual(metaSelection.species_evolution.every((record) => record.ancestor_hash.length === 64), true, "species ancestor hash invalid");
  assertEqual(metaSelection.intelligence_rankings[0]?.rank, 1, "top ranking missing");
  assertEqual(metaSelection.meta_selection_lineage.every((record) => record.lineage_hash.length === 64 && record.source_hash.length === 64 && record.target_hash.length === 64), true, "meta-selection lineage hashes invalid");

  assertEqual(getCivilizationFitnessScores(db, metaSelection.meta_selection_id).length, metaSelection.fitness_scores.length, "fitness query mismatch");
  assertEqual(getDynastySurvivabilityAnalytics(db, metaSelection.meta_selection_id).length, metaSelection.dynasty_survivability.length, "dynasty query mismatch");
  assertEqual(getCorruptionResistanceBenchmarks(db, metaSelection.meta_selection_id).length, metaSelection.corruption_resistance.length, "corruption query mismatch");
  assertEqual(getExtinctionPredictions(db, metaSelection.meta_selection_id).length, metaSelection.extinction_predictions.length, "extinction query mismatch");
  assertEqual(getGovernanceStabilityForecasts(db, metaSelection.meta_selection_id).length, metaSelection.governance_forecasts.length, "governance query mismatch");
  assertEqual(getTraitInheritanceWeights(db, metaSelection.meta_selection_id).length, metaSelection.trait_inheritance.length, "trait inheritance query mismatch");
  assertEqual(getTraitMutationAnalytics(db, metaSelection.meta_selection_id).length, metaSelection.trait_mutations.length, "trait mutation query mismatch");
  assertEqual(getLifecycleStateMachine(db, metaSelection.meta_selection_id).length, metaSelection.lifecycle_states.length, "lifecycle query mismatch");
  assertEqual(getRecursivePromotionScores(db, metaSelection.meta_selection_id).length, metaSelection.recursive_promotion.length, "recursive promotion query mismatch");
  assertEqual(getLiveRuntimeEligibilityGates(db, metaSelection.meta_selection_id).length, metaSelection.eligibility_gates.length, "eligibility query mismatch");
  assertEqual(getAdversarialConsensusDurability(db, metaSelection.meta_selection_id).length, metaSelection.adversarial_durability.length, "durability query mismatch");
  assertEqual(getMultiEraCivilizationComparison(db, metaSelection.meta_selection_id).length, metaSelection.multi_era_comparison.length, "comparison query mismatch");
  assertEqual(getCivilizationReputation(db, metaSelection.meta_selection_id).length, metaSelection.civilization_reputation.length, "reputation query mismatch");
  assertEqual(getSpeciesEvolutionTracking(db, metaSelection.meta_selection_id).length, metaSelection.species_evolution.length, "species query mismatch");
  assertEqual(getCivilizationIntelligenceRankings(db, metaSelection.meta_selection_id).length, metaSelection.intelligence_rankings.length, "ranking query mismatch");

  assertActionSupported("score_civilization_fitness");
  assertActionSupported("analyze_dynasty_survivability");
  assertActionSupported("benchmark_corruption_resistance");
  assertActionSupported("predict_extinction");
  assertActionSupported("forecast_governance_stability");
  assertActionSupported("weight_trait_inheritance");
  assertActionSupported("analyze_trait_mutation");
  assertActionSupported("advance_lifecycle_state");
  assertActionSupported("score_recursive_promotion");
  assertActionSupported("gate_live_runtime_eligibility");
  assertActionSupported("analyze_adversarial_consensus_durability");
  assertActionSupported("compare_multi_era_civilizations");
  assertActionSupported("persist_civilization_reputation");
  assertActionSupported("track_species_evolution");
  assertActionSupported("rank_civilization_intelligence");
  assertQuerySupported("get_civilization_fitness_scores");
  assertQuerySupported("get_dynasty_survivability_analytics");
  assertQuerySupported("get_corruption_resistance_benchmarks");
  assertQuerySupported("get_extinction_predictions");
  assertQuerySupported("get_governance_stability_forecasts");
  assertQuerySupported("get_trait_inheritance_weights");
  assertQuerySupported("get_trait_mutation_analytics");
  assertQuerySupported("get_lifecycle_state_machine");
  assertQuerySupported("get_recursive_promotion_scores");
  assertQuerySupported("get_live_runtime_eligibility_gates");
  assertQuerySupported("get_adversarial_consensus_durability");
  assertQuerySupported("get_multi_era_civilization_comparison");
  assertQuerySupported("get_civilization_reputation");
  assertQuerySupported("get_species_evolution_tracking");
  assertQuerySupported("get_civilization_intelligence_rankings");
  assertStateSupported("scoring");
  assertStateSupported("ranking");
  assertStateSupported("forecasting");
  assertStateSupported("gating");
  assertStateSupported("promoting");
  assertStateSupported("watchlisted");
  assertStateSupported("rejected");

  console.log("Replay civilization meta-selection validation passed.");
  console.log(JSON.stringify({
    meta_selection_id: metaSelection.meta_selection_id,
    deterministic_hash: metaSelection.deterministic_hash,
    state: metaSelection.state,
    civilizations: metaSelection.civilization_ids.length,
    fitness_scores: metaSelection.fitness_scores.length,
    eligible_civilizations: metaSelection.eligibility_gates.filter((record) => record.eligible).length,
    top_rank: metaSelection.intelligence_rankings[0],
    immutable_outputs: {
      snapshot: Object.isFrozen(metaSelection),
      rankings: Object.isFrozen(metaSelection.intelligence_rankings),
    },
  }, null, 2));
} finally {
  db.close();
}

function buildCivilization(prefix: string, adversarialPressure: number, promotionThreshold: number) {
  const calibration = buildReplayHistoricalCalibrationSnapshot(db, {
    generated_at: `${GENERATED_AT}:${prefix}`,
    persisted_at: PERSISTED_AT,
    seasons: [
      season("NBA", 2022, true, `${prefix}-nba-2022`, "NBA Injury Desk", "BOS", "Jayson Tatum"),
      season("NBA", 2024, true, `${prefix}-nba-2024`, "NBA Market Feed", "DEN", "Nikola Jokic"),
      season("MLB", 2024, true, `${prefix}-mlb-2024`, "MLB Beat Desk", "LAD", "Mookie Betts"),
      season("NFL", 2024, false, `${prefix}-nfl-2024`, "NFL Beat Desk", "KC", "Patrick Mahomes"),
      season("CFB", 2025, true, `${prefix}-cfb-2025`, "CFB Sideline Source", "UGA", "Starting QB"),
    ],
    runtime_nodes: [
      { node_id: `${prefix}-runtime-primary`, region: "us-west", priority: 100, healthy: true, last_seen_at: GENERATED_AT },
      { node_id: `${prefix}-runtime-secondary`, region: "us-east", priority: 90, healthy: true, last_seen_at: GENERATED_AT },
    ],
  });
  const simulation = buildReplayHistoricalSimulationRuntimeSnapshot(db, {
    generated_at: `${GENERATED_AT}:${prefix}`,
    persisted_at: PERSISTED_AT,
    calibration_snapshot: calibration,
    simulation_epochs: 4,
    adversarial_pressure: adversarialPressure,
    reinforcement_learning_rate: 0.22,
  });
  const league = buildReplayHistoricalAutonomousLeagueSnapshot(db, {
    generated_at: `${GENERATED_AT}:${prefix}`,
    persisted_at: PERSISTED_AT,
    simulation_snapshot: simulation,
    generation_count: 5,
    extinction_threshold: 0.44,
    promotion_threshold: promotionThreshold,
  });
  return buildReplayHistoricalAutonomousCivilizationSnapshot(db, {
    generated_at: `${GENERATED_AT}:${prefix}`,
    persisted_at: PERSISTED_AT,
    autonomous_league_snapshot: league,
    civilization_epochs: 4,
    adversarial_pressure: adversarialPressure,
    collapse_threshold: 0.58,
    promotion_threshold: promotionThreshold,
  });
}

function season(league: ReplayHistoricalLeague, year: number, positive: boolean, prefix: string, sourceName: string, team: string, player: string): ReplayHistoricalSeasonInput {
  return { season_id: `meta-selection-season:${league}:${year}:${prefix}`, league, season_year: year, generated_at: `${year}-07-01T12:00:00.000Z`, feeds: [feed(league, year, positive, prefix, sourceName, team, player)] };
}

function feed(league: ReplayHistoricalLeague, year: number, positive: boolean, prefix: string, sourceName: string, team: string, player: string): ReplayHistoricalSportsFeedSnapshot {
  const generatedAt = `${year}-07-01T12:00:00.000Z`;
  const signals = [
    liveSignal(league, `${prefix}-injury`, "injury_update", team, player, sourceName, positive, positive ? 92 : 57),
    liveSignal(league, `${prefix}-line`, "line_move", team, null, `${league} Market Feed`, positive, positive ? 87 : 61),
  ];
  return {
    league,
    generated_at: generatedAt,
    raw_events: signals.map((signal) => rawEvent(league, prefix, signal, positive)),
    live_signals: signals,
    odds_snapshots: [{ id: `${prefix}-odds`, game_id: `${prefix}-game`, league, sportsbook: "SeedBook", market_source: "civilization_meta_selection_fixture", spread_line: positive ? -3.5 : 5.5, spread_team: team, total_line: league === "NBA" ? 224.5 : league === "MLB" ? 8.5 : 50.5, moneyline_home: positive ? -165 : 145, moneyline_away: positive ? 145 : -170, source_game_id: `source-${prefix}-game`, snapshot_at: generatedAt }],
    injury_reports: [{ report_id: `${prefix}-injury-report`, league, team, player, designation: positive ? "OUT" : "Questionable", body_part: "ankle", source_id: sourceName.toLowerCase().replace(/\s+/g, "-"), confidence: positive ? 92 : 57, reported_at: generatedAt }],
    source_intelligence_events: signals.map((signal) => ({ event_id: `${prefix}-source-${signal.id}`, source_id: signal.sources[0]?.name.toLowerCase().replace(/\s+/g, "-") ?? "unknown", source_name: signal.sources[0]?.name ?? "Unknown", source_type: signal.sources[0]?.type ?? "api", reliability_score: positive ? 90 : 55, topic: signal.signal_type, league, signal_id: signal.id, observed_at: generatedAt })),
    settled_outcomes: signals.map((signal) => outcome(prefix, signal, positive)),
  };
}

function rawEvent(league: ReplayHistoricalLeague, prefix: string, signal: LiveSignal, positive: boolean): RawEvent {
  return { id: `${prefix}-raw-${signal.id}`, source_id: signal.sources[0]?.name.toLowerCase().replace(/\s+/g, "-") ?? "unknown", source_type: signal.sources[0]?.type === "scrape" ? "scrape" : "api", league, game_id: signal.game_id, team: signal.team, player: signal.player, event_type: signal.signal_type === "line_move" ? "line_move" : "injury_update", payload: { fixture: "civilization_meta_selection", positive }, processed: true, processed_at: signal.updated_at, created_at: signal.created_at, received_at: signal.signal_time };
}

function liveSignal(league: ReplayHistoricalLeague, id: string, signalType: SignalType, team: string, player: string | null, sourceName: string, positive: boolean, confidence: number): LiveSignal {
  return {
    id,
    league,
    game_id: `${id}-game`,
    signal_type: signalType,
    headline: `${league} meta-selection ${signalType}`,
    body: "Civilization meta-selection validation fixture.",
    action_note: "Rank validator civilizations before live deployment.",
    why_it_matters: "Elite validator civilizations should be selected deterministically.",
    team,
    player,
    matchup: "Meta-selection matchup",
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
    urgency_reason: "Meta-selection fixture",
    trust_label: positive ? "Corroborated" : "Developing",
    score_explanation: "Seeded meta-selection score",
    breakdown: breakdown(),
    raw_event_ids: [`raw-${id}`],
    signal_time: "2025-07-01T12:00:00.000Z",
    created_at: "2025-07-01T12:00:30.000Z",
    updated_at: "2025-07-01T12:00:30.000Z",
    outcome_id: `${id}-outcome`,
  };
}

function outcome(prefix: string, signal: LiveSignal, positive: boolean): Outcome {
  return { id: `${prefix}-outcome-${signal.id}`, signal_id: signal.id, game_id: signal.game_id ?? `${prefix}-game`, home_score: positive ? 36 : 15, away_score: positive ? 21 : 32, market: "spread", line_at_signal: positive ? -2.5 : 2.5, closing_line: positive ? -4.5 : 4.5, actual_result: positive ? 15 : -17, hit: positive, clv: positive ? 2 : -2, recorded_at: "2025-07-01T22:30:00.000Z", created_at: "2025-07-01T22:30:00.000Z" };
}

function breakdown(): ScoreBreakdown {
  return { confidenceScore: 18, sourceQualityScore: 23, marketImpactScore: 19, recencyBonus: 10, relevanceScore: 7, contextScore: 5, leagueModifierApplied: "Civilization meta-selection fixture", rawBeforeMods: 82 };
}

function assertActionSupported(_action: ReplayCivilizationMetaSelectionAction): void { return; }
function assertQuerySupported(_query: ReplayCivilizationMetaSelectionQuery): void { return; }
function assertStateSupported(_state: ReplayCivilizationMetaSelectionState): void { return; }

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
}
