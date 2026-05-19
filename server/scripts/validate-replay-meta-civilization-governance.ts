import Database from "better-sqlite3";

import { buildReplayHistoricalAutonomousCivilizationSnapshot } from "../pipeline/replay-historical-autonomous-civilization";
import { buildReplayHistoricalAutonomousLeagueSnapshot } from "../pipeline/replay-historical-autonomous-league";
import { buildReplayHistoricalCalibrationSnapshot } from "../pipeline/replay-historical-calibration";
import type { ReplayHistoricalLeague, ReplayHistoricalSeasonInput, ReplayHistoricalSportsFeedSnapshot } from "../pipeline/replay-historical-calibration-contract";
import { buildReplayHistoricalSimulationRuntimeSnapshot } from "../pipeline/replay-historical-simulation-runtime";
import { buildReplayCivilizationMetaSelectionSnapshot } from "../pipeline/replay-civilization-meta-selection";
import {
  buildReplayMetaCivilizationGovernanceSnapshot,
  computeReplayMetaCivilizationGovernanceHash,
  getAdversarialDeceptionDetection,
  getAllianceFracturePrediction,
  getCivilizationAlliances,
  getCivilizationColdWar,
  getCivilizationDiplomacyState,
  getCivilizationSanctions,
  getCoalitionConsensusGovernance,
  getConstitutionalEvolution,
  getCrossCivilizationIntelligencePropagation,
  getGeopoliticalStabilityForecast,
  getGovernanceMutationResistance,
  getIdeologicalDriftAnalytics,
  getLiveCivilizationFederationEligibility,
  getMetaGovernanceLineage,
  getRecursiveConstitutionalSurvivability,
  getStrategicDeterrence,
  getTradeResourceEconomies,
  getTreatyNegotiations,
  serializeReplayMetaCivilizationGovernanceSnapshot,
} from "../pipeline/replay-meta-civilization-governance";
import type {
  ReplayMetaCivilizationGovernanceAction,
  ReplayMetaCivilizationGovernanceQuery,
  ReplayMetaCivilizationGovernanceState,
} from "../pipeline/replay-meta-civilization-governance-contract";
import type { LiveSignal, Outcome, RawEvent, ScoreBreakdown, SignalType } from "../pipeline/types";

const GENERATED_AT = "2026-05-26T19:00:00.000Z";
const PERSISTED_AT = "2026-05-26T19:05:00.000Z";

const db = new Database(":memory:");

try {
  const metaSelection = buildReplayCivilizationMetaSelectionSnapshot(db, {
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    civilization_snapshots: [
      buildCivilization("gov-a", 0.35, 0.64),
      buildCivilization("gov-b", 0.42, 0.66),
    ],
    era_label: "meta-governance-validation-era",
    promotion_threshold: 0.62,
    extinction_threshold: 0.68,
  });
  const governance = buildReplayMetaCivilizationGovernanceSnapshot(db, {
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    meta_selection_snapshot: metaSelection,
    era_label: "meta-governance-validation-era",
    federation_threshold: 0.62,
    deception_pressure: 0.29,
  });
  const governanceAgain = buildReplayMetaCivilizationGovernanceSnapshot(db, {
    generated_at: GENERATED_AT,
    persisted_at: PERSISTED_AT,
    meta_selection_snapshot: metaSelection,
    era_label: "meta-governance-validation-era",
    federation_threshold: 0.62,
    deception_pressure: 0.29,
  });

  assertEqual(governance.deterministic_hash, governanceAgain.deterministic_hash, "meta-governance hash must be deterministic");
  assertEqual(serializeReplayMetaCivilizationGovernanceSnapshot(governance), serializeReplayMetaCivilizationGovernanceSnapshot(governanceAgain), "meta-governance serialization mismatch");
  assertEqual(computeReplayMetaCivilizationGovernanceHash({ governance: governance.meta_governance_id }).length, 64, "meta-governance hash helper mismatch");
  assertEqual(Object.isFrozen(governance), true, "meta-governance snapshot must be immutable");
  assertEqual(Object.isFrozen(governance.alliances), true, "alliances must be immutable");

  const leagueCount = new Set(metaSelection.fitness_scores.map((record) => record.league)).size;
  const pairCount = leagueCount * (leagueCount - 1) / 2;
  assertEqual(governance.alliances.length, pairCount, "civilization alliances missing");
  assertEqual(governance.treaty_negotiations.length, pairCount * 3, "treaty negotiation infrastructure missing");
  assertEqual(governance.coalition_governance.length, leagueCount, "coalition consensus governance missing");
  assertEqual(governance.trade_economies.length, leagueCount, "civilization trade economies missing");
  assertEqual(governance.deception_detection.length, leagueCount, "adversarial deception detection missing");
  assertEqual(governance.ideological_drift.length, metaSelection.lifecycle_states.length, "ideological drift analytics missing");
  assertEqual(governance.constitutional_evolution.length, leagueCount * 3, "constitutional evolution missing");
  assertEqual(governance.mutation_resistance.length, leagueCount, "mutation resistance scoring missing");
  assertEqual(governance.geopolitical_forecasts.length, leagueCount, "geopolitical stability forecasting missing");
  assertEqual(governance.cold_war_simulation.length, pairCount, "cold-war simulation missing");
  assertEqual(governance.strategic_deterrence.length, leagueCount, "strategic deterrence missing");
  assertEqual(governance.sanctions.length, leagueCount, "sanction/isolation system missing");
  assertEqual(governance.alliance_fracture.length, pairCount, "alliance fracture prediction missing");
  assertEqual(governance.intelligence_propagation.length, pairCount * 2, "cross-civilization propagation missing");
  assertEqual(governance.constitutional_survivability.length, leagueCount * 3, "recursive constitutional survivability missing");
  assertEqual(governance.diplomacy_states.length, leagueCount, "diplomacy state machine missing");
  assertEqual(governance.meta_governance_lineage.length > governance.federation_eligibility.length, true, "meta-governance lineage missing");
  assertEqual(governance.federation_eligibility.length, leagueCount, "federation eligibility gates missing");

  assertEqual(governance.alliances.every((record) => record.alliance_hash.length === 64), true, "alliance hashes invalid");
  assertEqual(governance.treaty_negotiations.every((record) => record.treaty_terms_hash.length === 64), true, "treaty terms hashes invalid");
  assertEqual(governance.coalition_governance.every((record) => record.governance_quorum_score >= 0), true, "quorum scores invalid");
  assertEqual(governance.trade_economies.every((record) => record.resource_capital >= 0 && record.allocation_efficiency <= 1), true, "economy scores invalid");
  assertEqual(governance.deception_detection.every((record) => record.deception_pressure === 0.29), true, "deception pressure not preserved");
  assertEqual(governance.ideological_drift.some((record) => record.ideological_drift_score > 0), true, "ideological drift not scored");
  assertEqual(governance.constitutional_evolution.some((record) => record.amendment_vector === "federation_eligibility_clause"), true, "federation constitution clause missing");
  assertEqual(governance.mutation_resistance.every((record) => record.mutation_resistance_score >= 0 && record.mutation_resistance_score <= 1), true, "mutation resistance out of range");
  assertEqual(governance.geopolitical_forecasts.some((record) => record.federation_readiness > 0), true, "federation readiness missing");
  assertEqual(governance.cold_war_simulation.every((record) => record.containment_score >= 0), true, "cold-war containment invalid");
  assertEqual(governance.strategic_deterrence.every((record) => record.deterrence_hash.length === 64), true, "deterrence hashes invalid");
  assertEqual(governance.sanctions.every((record) => record.reintegration_probability >= 0), true, "sanction reintegration invalid");
  assertEqual(governance.alliance_fracture.every((record) => record.fracture_probability >= 0), true, "fracture probabilities invalid");
  assertEqual(governance.intelligence_propagation.every((record) => record.from_league !== record.to_league), true, "propagation direction invalid");
  assertEqual(governance.constitutional_survivability.every((record) => record.recursion_depth >= 1), true, "constitutional recursion missing");
  assertEqual(governance.diplomacy_states.some((record) => record.diplomacy_state === "federated" || record.diplomacy_state === "allied"), true, "federated/allied diplomacy missing");
  assertEqual(governance.meta_governance_lineage.every((record) => record.lineage_hash.length === 64 && record.source_hash.length === 64 && record.target_hash.length === 64), true, "lineage hashes invalid");
  assertEqual(governance.federation_eligibility.some((record) => record.eligible), true, "no civilization federation eligible for live runtime");

  assertEqual(getCivilizationAlliances(db, governance.meta_governance_id).length, governance.alliances.length, "alliance query mismatch");
  assertEqual(getTreatyNegotiations(db, governance.meta_governance_id).length, governance.treaty_negotiations.length, "treaty query mismatch");
  assertEqual(getCoalitionConsensusGovernance(db, governance.meta_governance_id).length, governance.coalition_governance.length, "coalition query mismatch");
  assertEqual(getTradeResourceEconomies(db, governance.meta_governance_id).length, governance.trade_economies.length, "economy query mismatch");
  assertEqual(getAdversarialDeceptionDetection(db, governance.meta_governance_id).length, governance.deception_detection.length, "deception query mismatch");
  assertEqual(getIdeologicalDriftAnalytics(db, governance.meta_governance_id).length, governance.ideological_drift.length, "drift query mismatch");
  assertEqual(getConstitutionalEvolution(db, governance.meta_governance_id).length, governance.constitutional_evolution.length, "constitution query mismatch");
  assertEqual(getGovernanceMutationResistance(db, governance.meta_governance_id).length, governance.mutation_resistance.length, "resistance query mismatch");
  assertEqual(getGeopoliticalStabilityForecast(db, governance.meta_governance_id).length, governance.geopolitical_forecasts.length, "forecast query mismatch");
  assertEqual(getCivilizationColdWar(db, governance.meta_governance_id).length, governance.cold_war_simulation.length, "cold war query mismatch");
  assertEqual(getStrategicDeterrence(db, governance.meta_governance_id).length, governance.strategic_deterrence.length, "deterrence query mismatch");
  assertEqual(getCivilizationSanctions(db, governance.meta_governance_id).length, governance.sanctions.length, "sanctions query mismatch");
  assertEqual(getAllianceFracturePrediction(db, governance.meta_governance_id).length, governance.alliance_fracture.length, "fracture query mismatch");
  assertEqual(getCrossCivilizationIntelligencePropagation(db, governance.meta_governance_id).length, governance.intelligence_propagation.length, "propagation query mismatch");
  assertEqual(getRecursiveConstitutionalSurvivability(db, governance.meta_governance_id).length, governance.constitutional_survivability.length, "survivability query mismatch");
  assertEqual(getCivilizationDiplomacyState(db, governance.meta_governance_id).length, governance.diplomacy_states.length, "diplomacy query mismatch");
  assertEqual(getMetaGovernanceLineage(db, governance.meta_governance_id).length, governance.meta_governance_lineage.length, "lineage query mismatch");
  assertEqual(getLiveCivilizationFederationEligibility(db, governance.meta_governance_id).length, governance.federation_eligibility.length, "eligibility query mismatch");

  assertActionSupported("form_civilization_alliance");
  assertActionSupported("negotiate_treaty");
  assertActionSupported("coordinate_coalition_consensus");
  assertActionSupported("allocate_trade_resources");
  assertActionSupported("detect_adversarial_deception");
  assertActionSupported("analyze_ideological_drift");
  assertActionSupported("evolve_constitution");
  assertActionSupported("score_governance_mutation_resistance");
  assertActionSupported("forecast_geopolitical_stability");
  assertActionSupported("simulate_civilization_cold_war");
  assertActionSupported("deploy_strategic_deterrence");
  assertActionSupported("apply_civilization_sanctions");
  assertActionSupported("predict_alliance_fracture");
  assertActionSupported("propagate_cross_civilization_intelligence");
  assertActionSupported("analyze_recursive_constitutional_survivability");
  assertActionSupported("advance_diplomacy_state");
  assertActionSupported("persist_meta_governance_lineage");
  assertActionSupported("gate_live_civilization_federation");
  assertQuerySupported("get_civilization_alliances");
  assertQuerySupported("get_treaty_negotiations");
  assertQuerySupported("get_coalition_consensus_governance");
  assertQuerySupported("get_trade_resource_economies");
  assertQuerySupported("get_adversarial_deception_detection");
  assertQuerySupported("get_ideological_drift_analytics");
  assertQuerySupported("get_constitutional_evolution");
  assertQuerySupported("get_governance_mutation_resistance");
  assertQuerySupported("get_geopolitical_stability_forecast");
  assertQuerySupported("get_civilization_cold_war");
  assertQuerySupported("get_strategic_deterrence");
  assertQuerySupported("get_civilization_sanctions");
  assertQuerySupported("get_alliance_fracture_prediction");
  assertQuerySupported("get_cross_civilization_intelligence_propagation");
  assertQuerySupported("get_recursive_constitutional_survivability");
  assertQuerySupported("get_civilization_diplomacy_state");
  assertQuerySupported("get_meta_governance_lineage");
  assertQuerySupported("get_live_civilization_federation_eligibility");
  assertStateSupported("negotiating");
  assertStateSupported("federating");
  assertStateSupported("deterring");
  assertStateSupported("sanctioning");
  assertStateSupported("fracturing");
  assertStateSupported("propagating");
  assertStateSupported("eligible");
  assertStateSupported("unstable");

  console.log("Replay meta-civilization governance validation passed.");
  console.log(JSON.stringify({
    meta_governance_id: governance.meta_governance_id,
    deterministic_hash: governance.deterministic_hash,
    state: governance.state,
    alliances: governance.alliances.length,
    treaties: governance.treaty_negotiations.length,
    eligible_federations: governance.federation_eligibility.filter((record) => record.eligible).length,
    lineage: governance.meta_governance_lineage.length,
    immutable_outputs: {
      snapshot: Object.isFrozen(governance),
      alliances: Object.isFrozen(governance.alliances),
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
  return { season_id: `meta-governance-season:${league}:${year}:${prefix}`, league, season_year: year, generated_at: `${year}-06-01T12:00:00.000Z`, feeds: [feed(league, year, positive, prefix, sourceName, team, player)] };
}

function feed(league: ReplayHistoricalLeague, year: number, positive: boolean, prefix: string, sourceName: string, team: string, player: string): ReplayHistoricalSportsFeedSnapshot {
  const generatedAt = `${year}-06-01T12:00:00.000Z`;
  const signals = [
    liveSignal(league, `${prefix}-injury`, "injury_update", team, player, sourceName, positive, positive ? 92 : 57),
    liveSignal(league, `${prefix}-line`, "line_move", team, null, `${league} Market Feed`, positive, positive ? 87 : 61),
  ];
  return {
    league,
    generated_at: generatedAt,
    raw_events: signals.map((signal) => rawEvent(league, prefix, signal, positive)),
    live_signals: signals,
    odds_snapshots: [{ id: `${prefix}-odds`, game_id: `${prefix}-game`, league, sportsbook: "SeedBook", market_source: "meta_governance_fixture", spread_line: positive ? -3.5 : 5.5, spread_team: team, total_line: league === "NBA" ? 224.5 : league === "MLB" ? 8.5 : 50.5, moneyline_home: positive ? -165 : 145, moneyline_away: positive ? 145 : -170, source_game_id: `source-${prefix}-game`, snapshot_at: generatedAt }],
    injury_reports: [{ report_id: `${prefix}-injury-report`, league, team, player, designation: positive ? "OUT" : "Questionable", body_part: "ankle", source_id: sourceName.toLowerCase().replace(/\s+/g, "-"), confidence: positive ? 92 : 57, reported_at: generatedAt }],
    source_intelligence_events: signals.map((signal) => ({ event_id: `${prefix}-source-${signal.id}`, source_id: signal.sources[0]?.name.toLowerCase().replace(/\s+/g, "-") ?? "unknown", source_name: signal.sources[0]?.name ?? "Unknown", source_type: signal.sources[0]?.type ?? "api", reliability_score: positive ? 90 : 55, topic: signal.signal_type, league, signal_id: signal.id, observed_at: generatedAt })),
    settled_outcomes: signals.map((signal) => outcome(prefix, signal, positive)),
  };
}

function rawEvent(league: ReplayHistoricalLeague, prefix: string, signal: LiveSignal, positive: boolean): RawEvent {
  return { id: `${prefix}-raw-${signal.id}`, source_id: signal.sources[0]?.name.toLowerCase().replace(/\s+/g, "-") ?? "unknown", source_type: signal.sources[0]?.type === "scrape" ? "scrape" : "api", league, game_id: signal.game_id, team: signal.team, player: signal.player, event_type: signal.signal_type === "line_move" ? "line_move" : "injury_update", payload: { fixture: "meta_governance", positive }, processed: true, processed_at: signal.updated_at, created_at: signal.created_at, received_at: signal.signal_time };
}

function liveSignal(league: ReplayHistoricalLeague, id: string, signalType: SignalType, team: string, player: string | null, sourceName: string, positive: boolean, confidence: number): LiveSignal {
  return {
    id,
    league,
    game_id: `${id}-game`,
    signal_type: signalType,
    headline: `${league} meta governance ${signalType}`,
    body: "Meta-civilization governance validation fixture.",
    action_note: "Negotiate federation governance before live deployment.",
    why_it_matters: "Civilization federations require deterministic governance gates.",
    team,
    player,
    matchup: "Meta-governance matchup",
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
    urgency_reason: "Meta-governance fixture",
    trust_label: positive ? "Corroborated" : "Developing",
    score_explanation: "Seeded meta-governance score",
    breakdown: breakdown(),
    raw_event_ids: [`raw-${id}`],
    signal_time: "2025-06-01T12:00:00.000Z",
    created_at: "2025-06-01T12:00:30.000Z",
    updated_at: "2025-06-01T12:00:30.000Z",
    outcome_id: `${id}-outcome`,
  };
}

function outcome(prefix: string, signal: LiveSignal, positive: boolean): Outcome {
  return { id: `${prefix}-outcome-${signal.id}`, signal_id: signal.id, game_id: signal.game_id ?? `${prefix}-game`, home_score: positive ? 36 : 15, away_score: positive ? 21 : 32, market: "spread", line_at_signal: positive ? -2.5 : 2.5, closing_line: positive ? -4.5 : 4.5, actual_result: positive ? 15 : -17, hit: positive, clv: positive ? 2 : -2, recorded_at: "2025-06-01T22:30:00.000Z", created_at: "2025-06-01T22:30:00.000Z" };
}

function breakdown(): ScoreBreakdown {
  return { confidenceScore: 18, sourceQualityScore: 23, marketImpactScore: 19, recencyBonus: 10, relevanceScore: 7, contextScore: 5, leagueModifierApplied: "Meta-governance fixture", rawBeforeMods: 82 };
}

function assertActionSupported(_action: ReplayMetaCivilizationGovernanceAction): void { return; }
function assertQuerySupported(_query: ReplayMetaCivilizationGovernanceQuery): void { return; }
function assertStateSupported(_state: ReplayMetaCivilizationGovernanceState): void { return; }

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
}
