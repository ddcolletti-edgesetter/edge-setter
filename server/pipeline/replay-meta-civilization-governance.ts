/**
 * @deprecated Experimental product-drift compatibility layer.
 * Prefer consensus coordination and manipulation resistance modules for new work.
 */
import crypto from "node:crypto";

import type Database from "better-sqlite3";

import type {
  ReplayCivilizationMetaSelectionSnapshot,
} from "./replay-civilization-meta-selection-contract";
import type {
  ReplayAdversarialDeceptionDetectionRecord,
  ReplayAllianceFracturePrediction,
  ReplayCivilizationAllianceRecord,
  ReplayCivilizationColdWarSimulation,
  ReplayCivilizationDiplomacyStateMachineRecord,
  ReplayCivilizationSanctionIsolationRecord,
  ReplayCivilizationTradeResourceEconomy,
  ReplayCoalitionConsensusGovernanceRecord,
  ReplayConstitutionalEvolutionRecord,
  ReplayCrossCivilizationIntelligencePropagation,
  ReplayGeopoliticalStabilityForecast,
  ReplayGovernanceMutationResistanceScore,
  ReplayIdeologicalDriftAnalytic,
  ReplayLiveCivilizationFederationEligibility,
  ReplayMetaCivilizationGovernanceAction,
  ReplayMetaCivilizationGovernanceInput,
  ReplayMetaCivilizationGovernanceQuery,
  ReplayMetaCivilizationGovernanceSnapshot,
  ReplayMetaCivilizationGovernanceState,
  ReplayMetaGovernanceLineageRecord,
  ReplayRecursiveConstitutionalSurvivability,
  ReplayStrategicDeterrenceRecord,
  ReplayTreatyNegotiationRecord,
} from "./replay-meta-civilization-governance-contract";

type SqliteDatabase = Database.Database;

interface PayloadRow {
  readonly payload: string;
}

const ACTIONS: readonly ReplayMetaCivilizationGovernanceAction[] = [
  "form_civilization_alliance",
  "negotiate_treaty",
  "coordinate_coalition_consensus",
  "allocate_trade_resources",
  "detect_adversarial_deception",
  "analyze_ideological_drift",
  "evolve_constitution",
  "score_governance_mutation_resistance",
  "forecast_geopolitical_stability",
  "simulate_civilization_cold_war",
  "deploy_strategic_deterrence",
  "apply_civilization_sanctions",
  "predict_alliance_fracture",
  "propagate_cross_civilization_intelligence",
  "analyze_recursive_constitutional_survivability",
  "advance_diplomacy_state",
  "persist_meta_governance_lineage",
  "gate_live_civilization_federation",
];

const QUERIES: readonly ReplayMetaCivilizationGovernanceQuery[] = [
  "get_civilization_alliances",
  "get_treaty_negotiations",
  "get_coalition_consensus_governance",
  "get_trade_resource_economies",
  "get_adversarial_deception_detection",
  "get_ideological_drift_analytics",
  "get_constitutional_evolution",
  "get_governance_mutation_resistance",
  "get_geopolitical_stability_forecast",
  "get_civilization_cold_war",
  "get_strategic_deterrence",
  "get_civilization_sanctions",
  "get_alliance_fracture_prediction",
  "get_cross_civilization_intelligence_propagation",
  "get_recursive_constitutional_survivability",
  "get_civilization_diplomacy_state",
  "get_meta_governance_lineage",
  "get_live_civilization_federation_eligibility",
];

export function initializeReplayMetaCivilizationGovernanceSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS replay_meta_civilization_governance_snapshots (
      meta_governance_id TEXT PRIMARY KEY,
      meta_selection_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      state TEXT NOT NULL,
      deterministic_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replay_meta_civilization_governance_views (
      view_id TEXT PRIMARY KEY,
      meta_governance_id TEXT NOT NULL,
      view_kind TEXT NOT NULL,
      view_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);
}

export function buildReplayMetaCivilizationGovernanceSnapshot(
  db: SqliteDatabase,
  input: ReplayMetaCivilizationGovernanceInput,
): ReplayMetaCivilizationGovernanceSnapshot {
  initializeReplayMetaCivilizationGovernanceSchema(db);
  const meta = input.meta_selection_snapshot;
  const pressure = clamp01(input.deception_pressure ?? 0.27);
  const threshold = clamp01(input.federation_threshold ?? 0.64);
  const alliances = buildAlliances(meta);
  const treaties = buildTreaties(alliances);
  const coalition = buildCoalitionGovernance(meta, alliances);
  const economies = buildEconomies(meta);
  const deception = buildDeception(meta, pressure);
  const drift = buildIdeologicalDrift(meta);
  const constitutions = buildConstitutions(meta, drift);
  const resistance = buildResistance(meta, constitutions, deception);
  const forecasts = buildForecasts(meta, resistance, drift);
  const coldWar = buildColdWar(alliances, deception);
  const deterrence = buildDeterrence(meta, coldWar);
  const sanctions = buildSanctions(meta, deception, forecasts);
  const fractures = buildFractures(alliances, drift, sanctions);
  const propagation = buildPropagation(meta, alliances, sanctions);
  const survivability = buildConstitutionalSurvivability(constitutions, resistance, forecasts);
  const diplomacy = buildDiplomacy(meta, alliances, sanctions, forecasts);
  const eligibility = buildFederationEligibility(meta, forecasts, survivability, diplomacy, threshold);
  const lineage = buildLineage(meta, {
    alliances,
    treaties,
    coalition,
    economies,
    deception,
    drift,
    constitutions,
    resistance,
    forecasts,
    coldWar,
    deterrence,
    sanctions,
    fractures,
    propagation,
    survivability,
    diplomacy,
    eligibility,
  });
  const state = classifyState(eligibility, sanctions, fractures, propagation, deterrence);
  const seed = {
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    meta_selection_hash: meta.deterministic_hash,
    alliance_hashes: alliances.map((record) => record.alliance_hash),
    treaty_hashes: treaties.map((record) => record.treaty_hash),
    coalition_hashes: coalition.map((record) => record.coalition_hash),
    economy_hashes: economies.map((record) => record.economy_hash),
    deception_hashes: deception.map((record) => record.deception_hash),
    drift_hashes: drift.map((record) => record.drift_hash),
    constitution_hashes: constitutions.map((record) => record.constitution_hash),
    resistance_hashes: resistance.map((record) => record.resistance_hash),
    forecast_hashes: forecasts.map((record) => record.forecast_hash),
    cold_war_hashes: coldWar.map((record) => record.cold_war_hash),
    deterrence_hashes: deterrence.map((record) => record.deterrence_hash),
    sanction_hashes: sanctions.map((record) => record.sanction_hash),
    fracture_hashes: fractures.map((record) => record.fracture_hash),
    propagation_hashes: propagation.map((record) => record.propagation_hash),
    survivability_hashes: survivability.map((record) => record.survivability_hash),
    diplomacy_hashes: diplomacy.map((record) => record.diplomacy_hash),
    lineage_hashes: lineage.map((record) => record.lineage_hash),
    eligibility_hashes: eligibility.map((record) => record.eligibility_hash),
  };
  const deterministicHash = computeReplayMetaCivilizationGovernanceHash(seed);
  const snapshot = deepFreeze({
    meta_governance_id: `replay-meta-civilization-governance:${deterministicHash}`,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    meta_selection_id: meta.meta_selection_id,
    alliances,
    treaty_negotiations: treaties,
    coalition_governance: coalition,
    trade_economies: economies,
    deception_detection: deception,
    ideological_drift: drift,
    constitutional_evolution: constitutions,
    mutation_resistance: resistance,
    geopolitical_forecasts: forecasts,
    cold_war_simulation: coldWar,
    strategic_deterrence: deterrence,
    sanctions,
    alliance_fracture: fractures,
    intelligence_propagation: propagation,
    constitutional_survivability: survivability,
    diplomacy_states: diplomacy,
    meta_governance_lineage: lineage,
    federation_eligibility: eligibility,
    supported_actions: ACTIONS,
    supported_queries: QUERIES,
    deterministic_hash: deterministicHash,
  });
  persistSnapshot(db, snapshot);
  return snapshot;
}

export function getCivilizationAlliances(db: SqliteDatabase, id: string): readonly ReplayCivilizationAllianceRecord[] { return getView(db, id, "alliances"); }
export function getTreatyNegotiations(db: SqliteDatabase, id: string): readonly ReplayTreatyNegotiationRecord[] { return getView(db, id, "treaty_negotiations"); }
export function getCoalitionConsensusGovernance(db: SqliteDatabase, id: string): readonly ReplayCoalitionConsensusGovernanceRecord[] { return getView(db, id, "coalition_governance"); }
export function getTradeResourceEconomies(db: SqliteDatabase, id: string): readonly ReplayCivilizationTradeResourceEconomy[] { return getView(db, id, "trade_economies"); }
export function getAdversarialDeceptionDetection(db: SqliteDatabase, id: string): readonly ReplayAdversarialDeceptionDetectionRecord[] { return getView(db, id, "deception_detection"); }
export function getIdeologicalDriftAnalytics(db: SqliteDatabase, id: string): readonly ReplayIdeologicalDriftAnalytic[] { return getView(db, id, "ideological_drift"); }
export function getConstitutionalEvolution(db: SqliteDatabase, id: string): readonly ReplayConstitutionalEvolutionRecord[] { return getView(db, id, "constitutional_evolution"); }
export function getGovernanceMutationResistance(db: SqliteDatabase, id: string): readonly ReplayGovernanceMutationResistanceScore[] { return getView(db, id, "mutation_resistance"); }
export function getGeopoliticalStabilityForecast(db: SqliteDatabase, id: string): readonly ReplayGeopoliticalStabilityForecast[] { return getView(db, id, "geopolitical_forecasts"); }
export function getCivilizationColdWar(db: SqliteDatabase, id: string): readonly ReplayCivilizationColdWarSimulation[] { return getView(db, id, "cold_war_simulation"); }
export function getStrategicDeterrence(db: SqliteDatabase, id: string): readonly ReplayStrategicDeterrenceRecord[] { return getView(db, id, "strategic_deterrence"); }
export function getCivilizationSanctions(db: SqliteDatabase, id: string): readonly ReplayCivilizationSanctionIsolationRecord[] { return getView(db, id, "sanctions"); }
export function getAllianceFracturePrediction(db: SqliteDatabase, id: string): readonly ReplayAllianceFracturePrediction[] { return getView(db, id, "alliance_fracture"); }
export function getCrossCivilizationIntelligencePropagation(db: SqliteDatabase, id: string): readonly ReplayCrossCivilizationIntelligencePropagation[] { return getView(db, id, "intelligence_propagation"); }
export function getRecursiveConstitutionalSurvivability(db: SqliteDatabase, id: string): readonly ReplayRecursiveConstitutionalSurvivability[] { return getView(db, id, "constitutional_survivability"); }
export function getCivilizationDiplomacyState(db: SqliteDatabase, id: string): readonly ReplayCivilizationDiplomacyStateMachineRecord[] { return getView(db, id, "diplomacy_states"); }
export function getMetaGovernanceLineage(db: SqliteDatabase, id: string): readonly ReplayMetaGovernanceLineageRecord[] { return getView(db, id, "meta_governance_lineage"); }
export function getLiveCivilizationFederationEligibility(db: SqliteDatabase, id: string): readonly ReplayLiveCivilizationFederationEligibility[] { return getView(db, id, "federation_eligibility"); }

export function serializeReplayMetaCivilizationGovernanceSnapshot(snapshot: ReplayMetaCivilizationGovernanceSnapshot): string {
  return stableStringify(snapshot);
}

export function computeReplayMetaCivilizationGovernanceHash(value: unknown): string {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function buildAlliances(meta: ReplayCivilizationMetaSelectionSnapshot): readonly ReplayCivilizationAllianceRecord[] {
  const leagues = unique(meta.fitness_scores.map((record) => record.league));
  return deepFreeze(leagues.flatMap((left, index) => leagues.slice(index + 1).map((right) => {
    const leftScore = scoreFor(meta, left);
    const rightScore = scoreFor(meta, right);
    const cooperation = (comparisonFor(meta, left) + comparisonFor(meta, right)) / 2;
    const allianceScore = clamp01((leftScore + rightScore) / 2 * 0.65 + cooperation * 0.35);
    const alliance_type: ReplayCivilizationAllianceRecord["alliance_type"] = allianceScore > 0.78 ? "federation" : allianceScore > 0.68 ? "intelligence" : cooperation > 0.58 ? "economic" : Math.abs(leftScore - rightScore) < 0.08 ? "ideological" : "defensive";
    const seed = { league_a: left, league_b: right, alliance_type, alliance_score: round(allianceScore) };
    const hash = computeReplayMetaCivilizationGovernanceHash(seed);
    return { alliance_id: `meta-civilization-alliance:${hash}`, ...seed, alliance_hash: hash };
  })));
}

function buildTreaties(alliances: readonly ReplayCivilizationAllianceRecord[]): readonly ReplayTreatyNegotiationRecord[] {
  return deepFreeze(alliances.flatMap((alliance) => [1, 2, 3].map((roundNo) => {
    const termsHash = computeReplayMetaCivilizationGovernanceHash({ alliance_hash: alliance.alliance_hash, round: roundNo, type: alliance.alliance_type });
    const seed = {
      alliance_id: alliance.alliance_id,
      negotiation_round: roundNo,
      treaty_terms_hash: termsHash,
      acceptance_probability: round(clamp01(alliance.alliance_score + roundNo * 0.025 - 0.04)),
    };
    const hash = computeReplayMetaCivilizationGovernanceHash(seed);
    return { treaty_id: `meta-civilization-treaty:${hash}`, ...seed, treaty_hash: hash };
  })));
}

function buildCoalitionGovernance(meta: ReplayCivilizationMetaSelectionSnapshot, alliances: readonly ReplayCivilizationAllianceRecord[]): readonly ReplayCoalitionConsensusGovernanceRecord[] {
  return deepFreeze(unique(meta.fitness_scores.map((record) => record.league)).map((league) => {
    const members = alliances.filter((record) => record.league_a === league || record.league_b === league);
    const eligible = meta.eligibility_gates.filter((record) => record.league === league && record.eligible).length;
    const seed = {
      league,
      member_count: members.length + eligible,
      consensus_weight: round(scoreFor(meta, league)),
      governance_quorum_score: round(clamp01(average(members.map((record) => record.alliance_score)) * 0.55 + scoreFor(meta, league) * 0.45)),
    };
    const hash = computeReplayMetaCivilizationGovernanceHash(seed);
    return { coalition_id: `meta-coalition-governance:${hash}`, ...seed, coalition_hash: hash };
  }));
}

function buildEconomies(meta: ReplayCivilizationMetaSelectionSnapshot): readonly ReplayCivilizationTradeResourceEconomy[] {
  return deepFreeze(unique(meta.fitness_scores.map((record) => record.league)).map((league) => {
    const reputation = average(meta.civilization_reputation.filter((record) => record.league === league).map((record) => record.reputation_score));
    const survivability = average(meta.dynasty_survivability.filter((record) => record.league === league).map((record) => record.survivability_index));
    const seed = {
      league,
      resource_capital: round(clamp01(reputation * 0.55 + survivability * 0.45)),
      trade_surplus: round(clamp01(scoreFor(meta, league) - average(meta.extinction_predictions.filter((record) => record.league === league).map((record) => record.extinction_probability)) * 0.35)),
      allocation_efficiency: round(clamp01(reputation * 0.4 + scoreFor(meta, league) * 0.6)),
    };
    const hash = computeReplayMetaCivilizationGovernanceHash(seed);
    return { economy_id: `meta-civilization-economy:${hash}`, ...seed, economy_hash: hash };
  }));
}

function buildDeception(meta: ReplayCivilizationMetaSelectionSnapshot, pressure: number): readonly ReplayAdversarialDeceptionDetectionRecord[] {
  return deepFreeze(unique(meta.fitness_scores.map((record) => record.league)).map((league) => {
    const resistance = average(meta.corruption_resistance.filter((record) => record.league === league).map((record) => record.resistance_score));
    const durability = average(meta.adversarial_durability.filter((record) => record.league === league).map((record) => record.adversarial_durability_score));
    const seed = {
      league,
      deception_pressure: round(pressure),
      detection_confidence: round(clamp01(resistance * 0.62 + durability * 0.38)),
      deception_resistance: round(clamp01(resistance * (1 - pressure * 0.35) + durability * 0.2)),
    };
    const hash = computeReplayMetaCivilizationGovernanceHash(seed);
    return { deception_id: `meta-deception-detection:${hash}`, ...seed, deception_hash: hash };
  }));
}

function buildIdeologicalDrift(meta: ReplayCivilizationMetaSelectionSnapshot): readonly ReplayIdeologicalDriftAnalytic[] {
  return deepFreeze(meta.lifecycle_states.map((state) => {
    const reputation = meta.civilization_reputation.find((record) => record.civilization_id === state.civilization_id && record.league === state.league);
    const extinction = meta.extinction_predictions.find((record) => record.civilization_id === state.civilization_id && record.league === state.league)?.extinction_probability ?? 0;
    const seed = {
      league: state.league,
      reputation_tier: reputation?.reputation_tier ?? "watchlist",
      lifecycle_state: state.lifecycle_state,
      ideological_drift_score: round(clamp01(extinction * 0.45 + (1 - state.state_score) * 0.4 + (reputation?.reputation_tier === "elite" || reputation?.reputation_tier === "legendary" ? 0.02 : 0.12))),
    };
    const hash = computeReplayMetaCivilizationGovernanceHash(seed);
    return { drift_id: `meta-ideological-drift:${hash}`, ...seed, drift_hash: hash };
  }));
}

function buildConstitutions(meta: ReplayCivilizationMetaSelectionSnapshot, drift: readonly ReplayIdeologicalDriftAnalytic[]): readonly ReplayConstitutionalEvolutionRecord[] {
  return deepFreeze(unique(meta.fitness_scores.map((record) => record.league)).flatMap((league) => [1, 2, 3].map((version) => {
    const driftScore = average(drift.filter((record) => record.league === league).map((record) => record.ideological_drift_score));
    const vector = version === 1 ? "foundational_quorum" : version === 2 ? "anti_corruption_amendment" : "federation_eligibility_clause";
    const seed = {
      league,
      version,
      amendment_vector: vector,
      constitutional_fitness: round(clamp01(scoreFor(meta, league) * 0.58 + (1 - driftScore) * 0.42 + version * 0.015)),
    };
    const hash = computeReplayMetaCivilizationGovernanceHash(seed);
    return { constitution_id: `meta-constitution:${hash}`, ...seed, constitution_hash: hash };
  })));
}

function buildResistance(meta: ReplayCivilizationMetaSelectionSnapshot, constitutions: readonly ReplayConstitutionalEvolutionRecord[], deception: readonly ReplayAdversarialDeceptionDetectionRecord[]): readonly ReplayGovernanceMutationResistanceScore[] {
  return deepFreeze(unique(meta.fitness_scores.map((record) => record.league)).map((league) => {
    const mutationPressure = average(meta.trait_mutations.filter((record) => record.league === league).map((record) => record.mutation_pressure));
    const constitution = average(constitutions.filter((record) => record.league === league).map((record) => record.constitutional_fitness));
    const deceptionResistance = deception.find((record) => record.league === league)?.deception_resistance ?? 0;
    const seed = {
      league,
      mutation_pressure: round(mutationPressure),
      constitutional_fitness: round(constitution),
      mutation_resistance_score: round(clamp01(constitution * 0.5 + deceptionResistance * 0.32 + (1 - mutationPressure) * 0.18)),
    };
    const hash = computeReplayMetaCivilizationGovernanceHash(seed);
    return { resistance_id: `meta-mutation-resistance:${hash}`, ...seed, resistance_hash: hash };
  }));
}

function buildForecasts(meta: ReplayCivilizationMetaSelectionSnapshot, resistance: readonly ReplayGovernanceMutationResistanceScore[], drift: readonly ReplayIdeologicalDriftAnalytic[]): readonly ReplayGeopoliticalStabilityForecast[] {
  return deepFreeze(unique(meta.fitness_scores.map((record) => record.league)).map((league) => {
    const stability = average(meta.governance_forecasts.filter((record) => record.league === league).map((record) => record.forecast_stability));
    const driftScore = average(drift.filter((record) => record.league === league).map((record) => record.ideological_drift_score));
    const mutation = resistance.find((record) => record.league === league)?.mutation_resistance_score ?? 0;
    const seed = {
      league,
      stability_score: round(clamp01(stability * 0.45 + mutation * 0.35 + (1 - driftScore) * 0.2)),
      fracture_risk: round(clamp01(driftScore * 0.55 + (1 - mutation) * 0.45)),
      federation_readiness: round(clamp01(scoreFor(meta, league) * 0.5 + stability * 0.25 + mutation * 0.25)),
    };
    const hash = computeReplayMetaCivilizationGovernanceHash(seed);
    return { forecast_id: `meta-geopolitical-forecast:${hash}`, ...seed, forecast_hash: hash };
  }));
}

function buildColdWar(alliances: readonly ReplayCivilizationAllianceRecord[], deception: readonly ReplayAdversarialDeceptionDetectionRecord[]): readonly ReplayCivilizationColdWarSimulation[] {
  return deepFreeze(alliances.map((alliance) => {
    const left = deception.find((record) => record.league === alliance.league_a)?.deception_pressure ?? 0;
    const right = deception.find((record) => record.league === alliance.league_b)?.deception_pressure ?? 0;
    const escalation = clamp01((1 - alliance.alliance_score) * 0.55 + (left + right) / 2 * 0.45);
    const seed = {
      league_a: alliance.league_a,
      league_b: alliance.league_b,
      escalation_score: round(escalation),
      containment_score: round(clamp01(alliance.alliance_score * 0.68 + (1 - escalation) * 0.32)),
    };
    const hash = computeReplayMetaCivilizationGovernanceHash(seed);
    return { cold_war_id: `meta-cold-war:${hash}`, ...seed, cold_war_hash: hash };
  }));
}

function buildDeterrence(meta: ReplayCivilizationMetaSelectionSnapshot, coldWar: readonly ReplayCivilizationColdWarSimulation[]): readonly ReplayStrategicDeterrenceRecord[] {
  return deepFreeze(unique(meta.fitness_scores.map((record) => record.league)).map((league) => {
    const containment = average(coldWar.filter((record) => record.league_a === league || record.league_b === league).map((record) => record.containment_score));
    const durability = average(meta.adversarial_durability.filter((record) => record.league === league).map((record) => record.adversarial_durability_score));
    const seed = {
      league,
      deterrence_capacity: round(clamp01(durability * 0.55 + containment * 0.45)),
      retaliation_cost: round(clamp01((1 - scoreFor(meta, league)) * 0.35 + durability * 0.25)),
      deterrence_stability: round(clamp01(containment * 0.5 + durability * 0.5)),
    };
    const hash = computeReplayMetaCivilizationGovernanceHash(seed);
    return { deterrence_id: `meta-deterrence:${hash}`, ...seed, deterrence_hash: hash };
  }));
}

function buildSanctions(meta: ReplayCivilizationMetaSelectionSnapshot, deception: readonly ReplayAdversarialDeceptionDetectionRecord[], forecasts: readonly ReplayGeopoliticalStabilityForecast[]): readonly ReplayCivilizationSanctionIsolationRecord[] {
  return deepFreeze(unique(meta.fitness_scores.map((record) => record.league)).map((league) => {
    const deceptionRisk = 1 - (deception.find((record) => record.league === league)?.deception_resistance ?? 0);
    const fracture = forecasts.find((record) => record.league === league)?.fracture_risk ?? 0;
    const isolation = clamp01(deceptionRisk * 0.55 + fracture * 0.45);
    const seed = {
      league,
      sanction_reason: isolation > 0.52 ? "deception_or_fracture_pressure" : "monitor_only",
      isolation_score: round(isolation),
      reintegration_probability: round(clamp01(1 - isolation + scoreFor(meta, league) * 0.22)),
    };
    const hash = computeReplayMetaCivilizationGovernanceHash(seed);
    return { sanction_id: `meta-sanction:${hash}`, ...seed, sanction_hash: hash };
  }));
}

function buildFractures(alliances: readonly ReplayCivilizationAllianceRecord[], drift: readonly ReplayIdeologicalDriftAnalytic[], sanctions: readonly ReplayCivilizationSanctionIsolationRecord[]): readonly ReplayAllianceFracturePrediction[] {
  return deepFreeze(alliances.map((alliance) => {
    const driftScore = (average(drift.filter((record) => record.league === alliance.league_a).map((record) => record.ideological_drift_score)) + average(drift.filter((record) => record.league === alliance.league_b).map((record) => record.ideological_drift_score))) / 2;
    const isolation = Math.max(sanctions.find((record) => record.league === alliance.league_a)?.isolation_score ?? 0, sanctions.find((record) => record.league === alliance.league_b)?.isolation_score ?? 0);
    const probability = clamp01((1 - alliance.alliance_score) * 0.4 + driftScore * 0.35 + isolation * 0.25);
    const seed = {
      alliance_id: alliance.alliance_id,
      fracture_probability: round(probability),
      fracture_trigger: probability > 0.5 ? "ideological_or_sanction_pressure" : "contained_by_treaty_alignment",
    };
    const hash = computeReplayMetaCivilizationGovernanceHash(seed);
    return { fracture_id: `meta-alliance-fracture:${hash}`, ...seed, fracture_hash: hash };
  }));
}

function buildPropagation(meta: ReplayCivilizationMetaSelectionSnapshot, alliances: readonly ReplayCivilizationAllianceRecord[], sanctions: readonly ReplayCivilizationSanctionIsolationRecord[]): readonly ReplayCrossCivilizationIntelligencePropagation[] {
  return deepFreeze(alliances.flatMap((alliance) => [
    propagationRecord(meta, alliance.league_a, alliance.league_b, alliance, sanctions),
    propagationRecord(meta, alliance.league_b, alliance.league_a, alliance, sanctions),
  ]));
}

function propagationRecord(meta: ReplayCivilizationMetaSelectionSnapshot, from: string, to: string, alliance: ReplayCivilizationAllianceRecord, sanctions: readonly ReplayCivilizationSanctionIsolationRecord[]): ReplayCrossCivilizationIntelligencePropagation {
  const risk = sanctions.find((record) => record.league === to)?.isolation_score ?? 0;
  const seed = {
    from_league: from,
    to_league: to,
    propagation_strength: round(clamp01(alliance.alliance_score * 0.55 + scoreFor(meta, from) * 0.45)),
    propagation_risk: round(clamp01(risk * 0.65 + (1 - alliance.alliance_score) * 0.35)),
  };
  const hash = computeReplayMetaCivilizationGovernanceHash(seed);
  return { propagation_id: `meta-intelligence-propagation:${hash}`, ...seed, propagation_hash: hash };
}

function buildConstitutionalSurvivability(constitutions: readonly ReplayConstitutionalEvolutionRecord[], resistance: readonly ReplayGovernanceMutationResistanceScore[], forecasts: readonly ReplayGeopoliticalStabilityForecast[]): readonly ReplayRecursiveConstitutionalSurvivability[] {
  return deepFreeze(constitutions.map((constitution) => {
    const mutation = resistance.find((record) => record.league === constitution.league)?.mutation_resistance_score ?? 0;
    const stability = forecasts.find((record) => record.league === constitution.league)?.stability_score ?? 0;
    const seed = {
      league: constitution.league,
      recursion_depth: constitution.version,
      constitutional_survivability_score: round(clamp01(constitution.constitutional_fitness * 0.45 + mutation * 0.3 + stability * 0.25)),
    };
    const hash = computeReplayMetaCivilizationGovernanceHash(seed);
    return { survivability_id: `meta-constitutional-survivability:${hash}`, ...seed, survivability_hash: hash };
  }));
}

function buildDiplomacy(meta: ReplayCivilizationMetaSelectionSnapshot, alliances: readonly ReplayCivilizationAllianceRecord[], sanctions: readonly ReplayCivilizationSanctionIsolationRecord[], forecasts: readonly ReplayGeopoliticalStabilityForecast[]): readonly ReplayCivilizationDiplomacyStateMachineRecord[] {
  return deepFreeze(unique(meta.fitness_scores.map((record) => record.league)).map((league) => {
    const alliance = average(alliances.filter((record) => record.league_a === league || record.league_b === league).map((record) => record.alliance_score));
    const sanction = sanctions.find((record) => record.league === league)?.isolation_score ?? 0;
    const readiness = forecasts.find((record) => record.league === league)?.federation_readiness ?? 0;
    const confidence = clamp01(alliance * 0.42 + readiness * 0.4 + (1 - sanction) * 0.18);
    const diplomacy_state: ReplayCivilizationDiplomacyStateMachineRecord["diplomacy_state"] = readiness > 0.72 ? "federated" : alliance > 0.62 ? "allied" : sanction > 0.58 ? "isolated" : sanction > 0.45 ? "sanctioned" : "neutral";
    const seed = { league, diplomacy_state, state_confidence: round(confidence) };
    const hash = computeReplayMetaCivilizationGovernanceHash(seed);
    return { diplomacy_id: `meta-diplomacy-state:${hash}`, ...seed, diplomacy_hash: hash };
  }));
}

function buildFederationEligibility(meta: ReplayCivilizationMetaSelectionSnapshot, forecasts: readonly ReplayGeopoliticalStabilityForecast[], survivability: readonly ReplayRecursiveConstitutionalSurvivability[], diplomacy: readonly ReplayCivilizationDiplomacyStateMachineRecord[], threshold: number): readonly ReplayLiveCivilizationFederationEligibility[] {
  return deepFreeze(unique(meta.fitness_scores.map((record) => record.league)).map((league) => {
    const readiness = forecasts.find((record) => record.league === league)?.federation_readiness ?? 0;
    const constitutional = average(survivability.filter((record) => record.league === league).map((record) => record.constitutional_survivability_score));
    const diplomacyScore = diplomacy.find((record) => record.league === league)?.state_confidence ?? 0;
    const score = clamp01(readiness * 0.45 + constitutional * 0.35 + diplomacyScore * 0.2);
    const eligible = score >= threshold;
    const seed = {
      league,
      eligible,
      federation_score: round(score),
      eligibility_reason: eligible ? "civilization_federation_eligible_for_live_runtime" : "federation_threshold_not_met",
    };
    const hash = computeReplayMetaCivilizationGovernanceHash(seed);
    return { eligibility_id: `meta-federation-eligibility:${hash}`, ...seed, eligibility_hash: hash };
  }));
}

function buildLineage(meta: ReplayCivilizationMetaSelectionSnapshot, records: {
  readonly alliances: readonly ReplayCivilizationAllianceRecord[];
  readonly treaties: readonly ReplayTreatyNegotiationRecord[];
  readonly coalition: readonly ReplayCoalitionConsensusGovernanceRecord[];
  readonly economies: readonly ReplayCivilizationTradeResourceEconomy[];
  readonly deception: readonly ReplayAdversarialDeceptionDetectionRecord[];
  readonly drift: readonly ReplayIdeologicalDriftAnalytic[];
  readonly constitutions: readonly ReplayConstitutionalEvolutionRecord[];
  readonly resistance: readonly ReplayGovernanceMutationResistanceScore[];
  readonly forecasts: readonly ReplayGeopoliticalStabilityForecast[];
  readonly coldWar: readonly ReplayCivilizationColdWarSimulation[];
  readonly deterrence: readonly ReplayStrategicDeterrenceRecord[];
  readonly sanctions: readonly ReplayCivilizationSanctionIsolationRecord[];
  readonly fractures: readonly ReplayAllianceFracturePrediction[];
  readonly propagation: readonly ReplayCrossCivilizationIntelligencePropagation[];
  readonly survivability: readonly ReplayRecursiveConstitutionalSurvivability[];
  readonly diplomacy: readonly ReplayCivilizationDiplomacyStateMachineRecord[];
  readonly eligibility: readonly ReplayLiveCivilizationFederationEligibility[];
}): readonly ReplayMetaGovernanceLineageRecord[] {
  const refs: readonly { readonly kind: ReplayMetaGovernanceLineageRecord["transition_kind"]; readonly league: string | null; readonly hash: string }[] = [
    { kind: "meta_selection", league: null, hash: meta.deterministic_hash },
    ...records.alliances.map((record) => ({ kind: "alliance" as const, league: record.league_a, hash: record.alliance_hash })),
    ...records.treaties.map((record) => ({ kind: "treaty" as const, league: null, hash: record.treaty_hash })),
    ...records.coalition.map((record) => ({ kind: "coalition" as const, league: record.league, hash: record.coalition_hash })),
    ...records.economies.map((record) => ({ kind: "economy" as const, league: record.league, hash: record.economy_hash })),
    ...records.deception.map((record) => ({ kind: "deception" as const, league: record.league, hash: record.deception_hash })),
    ...records.drift.map((record) => ({ kind: "ideology" as const, league: record.league, hash: record.drift_hash })),
    ...records.constitutions.map((record) => ({ kind: "constitution" as const, league: record.league, hash: record.constitution_hash })),
    ...records.resistance.map((record) => ({ kind: "resistance" as const, league: record.league, hash: record.resistance_hash })),
    ...records.forecasts.map((record) => ({ kind: "forecast" as const, league: record.league, hash: record.forecast_hash })),
    ...records.coldWar.map((record) => ({ kind: "cold_war" as const, league: record.league_a, hash: record.cold_war_hash })),
    ...records.deterrence.map((record) => ({ kind: "deterrence" as const, league: record.league, hash: record.deterrence_hash })),
    ...records.sanctions.map((record) => ({ kind: "sanction" as const, league: record.league, hash: record.sanction_hash })),
    ...records.fractures.map((record) => ({ kind: "fracture" as const, league: null, hash: record.fracture_hash })),
    ...records.propagation.map((record) => ({ kind: "propagation" as const, league: record.to_league, hash: record.propagation_hash })),
    ...records.survivability.map((record) => ({ kind: "survivability" as const, league: record.league, hash: record.survivability_hash })),
    ...records.diplomacy.map((record) => ({ kind: "diplomacy" as const, league: record.league, hash: record.diplomacy_hash })),
    ...records.eligibility.map((record) => ({ kind: "federation_gate" as const, league: record.league, hash: record.eligibility_hash })),
  ];
  return deepFreeze(refs.map((record, index) => {
    const seed = {
      transition_kind: record.kind,
      league: record.league,
      source_hash: index === 0 ? meta.deterministic_hash : refs[index - 1]?.hash ?? meta.deterministic_hash,
      target_hash: record.hash,
    };
    const hash = computeReplayMetaCivilizationGovernanceHash(seed);
    return { lineage_id: `meta-governance-lineage:${hash}`, ...seed, lineage_hash: hash };
  }));
}

function classifyState(eligibility: readonly ReplayLiveCivilizationFederationEligibility[], sanctions: readonly ReplayCivilizationSanctionIsolationRecord[], fractures: readonly ReplayAllianceFracturePrediction[], propagation: readonly ReplayCrossCivilizationIntelligencePropagation[], deterrence: readonly ReplayStrategicDeterrenceRecord[]): ReplayMetaCivilizationGovernanceState {
  if (eligibility.some((record) => record.eligible)) return "eligible";
  if (sanctions.some((record) => record.isolation_score > 0.58)) return "sanctioning";
  if (fractures.some((record) => record.fracture_probability > 0.55)) return "fracturing";
  if (propagation.some((record) => record.propagation_strength > 0.65)) return "propagating";
  if (deterrence.some((record) => record.deterrence_stability > 0.62)) return "deterring";
  return "negotiating";
}

function persistSnapshot(db: SqliteDatabase, snapshot: ReplayMetaCivilizationGovernanceSnapshot): void {
  const write = db.transaction(() => {
    db.prepare(`
      INSERT OR REPLACE INTO replay_meta_civilization_governance_snapshots
      (meta_governance_id, meta_selection_id, generated_at, persisted_at, state, deterministic_hash, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(snapshot.meta_governance_id, snapshot.meta_selection_id, snapshot.generated_at, snapshot.persisted_at, snapshot.state, snapshot.deterministic_hash, stableStringify(snapshot));
    for (const record of snapshot.alliances) persistView(db, snapshot, "alliances", record.alliance_id, record.alliance_hash, record);
    for (const record of snapshot.treaty_negotiations) persistView(db, snapshot, "treaty_negotiations", record.treaty_id, record.treaty_hash, record);
    for (const record of snapshot.coalition_governance) persistView(db, snapshot, "coalition_governance", record.coalition_id, record.coalition_hash, record);
    for (const record of snapshot.trade_economies) persistView(db, snapshot, "trade_economies", record.economy_id, record.economy_hash, record);
    for (const record of snapshot.deception_detection) persistView(db, snapshot, "deception_detection", record.deception_id, record.deception_hash, record);
    for (const record of snapshot.ideological_drift) persistView(db, snapshot, "ideological_drift", record.drift_id, record.drift_hash, record);
    for (const record of snapshot.constitutional_evolution) persistView(db, snapshot, "constitutional_evolution", record.constitution_id, record.constitution_hash, record);
    for (const record of snapshot.mutation_resistance) persistView(db, snapshot, "mutation_resistance", record.resistance_id, record.resistance_hash, record);
    for (const record of snapshot.geopolitical_forecasts) persistView(db, snapshot, "geopolitical_forecasts", record.forecast_id, record.forecast_hash, record);
    for (const record of snapshot.cold_war_simulation) persistView(db, snapshot, "cold_war_simulation", record.cold_war_id, record.cold_war_hash, record);
    for (const record of snapshot.strategic_deterrence) persistView(db, snapshot, "strategic_deterrence", record.deterrence_id, record.deterrence_hash, record);
    for (const record of snapshot.sanctions) persistView(db, snapshot, "sanctions", record.sanction_id, record.sanction_hash, record);
    for (const record of snapshot.alliance_fracture) persistView(db, snapshot, "alliance_fracture", record.fracture_id, record.fracture_hash, record);
    for (const record of snapshot.intelligence_propagation) persistView(db, snapshot, "intelligence_propagation", record.propagation_id, record.propagation_hash, record);
    for (const record of snapshot.constitutional_survivability) persistView(db, snapshot, "constitutional_survivability", record.survivability_id, record.survivability_hash, record);
    for (const record of snapshot.diplomacy_states) persistView(db, snapshot, "diplomacy_states", record.diplomacy_id, record.diplomacy_hash, record);
    for (const record of snapshot.meta_governance_lineage) persistView(db, snapshot, "meta_governance_lineage", record.lineage_id, record.lineage_hash, record);
    for (const record of snapshot.federation_eligibility) persistView(db, snapshot, "federation_eligibility", record.eligibility_id, record.eligibility_hash, record);
  });
  write();
}

function persistView(db: SqliteDatabase, snapshot: ReplayMetaCivilizationGovernanceSnapshot, kind: string, id: string, hash: string, payload: unknown): void {
  db.prepare(`
    INSERT OR REPLACE INTO replay_meta_civilization_governance_views
    (view_id, meta_governance_id, view_kind, view_hash, payload)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, snapshot.meta_governance_id, kind, hash, stableStringify(payload));
}

function getView<T>(db: SqliteDatabase, id: string, kind: string): readonly T[] {
  initializeReplayMetaCivilizationGovernanceSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_meta_civilization_governance_views
    WHERE meta_governance_id = ? AND view_kind = ?
    ORDER BY view_hash ASC
  `).all(id, kind) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as T));
}

function scoreFor(meta: ReplayCivilizationMetaSelectionSnapshot, league: string): number {
  return average(meta.fitness_scores.filter((record) => record.league === league).map((record) => record.fitness_score));
}

function comparisonFor(meta: ReplayCivilizationMetaSelectionSnapshot, league: string): number {
  return meta.multi_era_comparison.find((record) => record.league === league)?.era_strength_score ?? scoreFor(meta, league);
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(clamp01(value) * 1_000_000) / 1_000_000;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).sort((left, right) => left.localeCompare(right)).reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortKeys((value as Record<string, unknown>)[key]);
      return acc;
    }, {});
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (typeof value === "undefined") return null;
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value;
}
