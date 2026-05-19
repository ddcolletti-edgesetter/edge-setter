/**
 * @deprecated Experimental product-drift compatibility layer.
 * Prefer validator cluster selection and live runtime eligibility modules for new work.
 */
import crypto from "node:crypto";

import type Database from "better-sqlite3";

import type {
  ReplayHistoricalAutonomousCivilizationSnapshot,
} from "./replay-historical-autonomous-civilization-contract";
import type {
  ReplayAdversarialConsensusDurabilityAnalytic,
  ReplayCivilizationFitnessScore,
  ReplayCivilizationIntelligenceRanking,
  ReplayCivilizationLifecycleStateRecord,
  ReplayCivilizationMetaSelectionAction,
  ReplayCivilizationMetaSelectionInput,
  ReplayCivilizationMetaSelectionLineage,
  ReplayCivilizationMetaSelectionQuery,
  ReplayCivilizationMetaSelectionSnapshot,
  ReplayCivilizationMetaSelectionState,
  ReplayCivilizationReputationRecord,
  ReplayCorruptionResistanceBenchmark,
  ReplayDynastySurvivabilityAnalytic,
  ReplayEvolutionaryTraitMutationAnalytic,
  ReplayExtinctionPrediction,
  ReplayGovernanceStabilityForecast,
  ReplayLiveRuntimeCivilizationEligibilityGate,
  ReplayLongHorizonSpeciesEvolutionTrack,
  ReplayMultiEraCivilizationComparison,
  ReplayRecursiveCivilizationPromotionScore,
  ReplayValidatorTraitInheritanceWeight,
} from "./replay-civilization-meta-selection-contract";

type SqliteDatabase = Database.Database;

interface PayloadRow {
  readonly payload: string;
}

const SUPPORTED_ACTIONS: readonly ReplayCivilizationMetaSelectionAction[] = [
  "score_civilization_fitness",
  "analyze_dynasty_survivability",
  "benchmark_corruption_resistance",
  "predict_extinction",
  "forecast_governance_stability",
  "weight_trait_inheritance",
  "analyze_trait_mutation",
  "advance_lifecycle_state",
  "score_recursive_promotion",
  "gate_live_runtime_eligibility",
  "analyze_adversarial_consensus_durability",
  "compare_multi_era_civilizations",
  "persist_civilization_reputation",
  "track_species_evolution",
  "rank_civilization_intelligence",
];

const SUPPORTED_QUERIES: readonly ReplayCivilizationMetaSelectionQuery[] = [
  "get_civilization_fitness_scores",
  "get_dynasty_survivability_analytics",
  "get_corruption_resistance_benchmarks",
  "get_extinction_predictions",
  "get_governance_stability_forecasts",
  "get_trait_inheritance_weights",
  "get_trait_mutation_analytics",
  "get_lifecycle_state_machine",
  "get_recursive_promotion_scores",
  "get_live_runtime_eligibility_gates",
  "get_adversarial_consensus_durability",
  "get_multi_era_civilization_comparison",
  "get_civilization_reputation",
  "get_species_evolution_tracking",
  "get_civilization_intelligence_rankings",
];

export function initializeReplayCivilizationMetaSelectionSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS replay_civilization_meta_selection_snapshots (
      meta_selection_id TEXT PRIMARY KEY,
      generated_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      state TEXT NOT NULL,
      deterministic_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replay_civilization_meta_selection_views (
      view_id TEXT PRIMARY KEY,
      meta_selection_id TEXT NOT NULL,
      view_kind TEXT NOT NULL,
      view_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);
}

export function buildReplayCivilizationMetaSelectionSnapshot(
  db: SqliteDatabase,
  input: ReplayCivilizationMetaSelectionInput,
): ReplayCivilizationMetaSelectionSnapshot {
  initializeReplayCivilizationMetaSelectionSchema(db);

  const era = input.era_label ?? "historical-autonomous-era";
  const promotionThreshold = clamp01(input.promotion_threshold ?? 0.68);
  const extinctionThreshold = clamp01(input.extinction_threshold ?? 0.62);
  const civilizations = input.civilization_snapshots.slice().sort((left, right) => left.civilization_id.localeCompare(right.civilization_id));
  const dynasty = buildDynastySurvivability(civilizations);
  const corruption = buildCorruptionResistance(civilizations);
  const extinction = buildExtinctionPredictions(civilizations, corruption);
  const governance = buildGovernanceForecasts(civilizations);
  const traits = buildTraitInheritance(civilizations);
  const mutations = buildTraitMutations(civilizations);
  const durability = buildAdversarialDurability(civilizations);
  const fitness = buildFitnessScores(civilizations, dynasty, corruption, durability, era);
  const lifecycle = buildLifecycleStates(civilizations, fitness, extinction, governance);
  const recursivePromotion = buildRecursivePromotion(civilizations, fitness, lifecycle);
  const eligibility = buildEligibilityGates(fitness, extinction, governance, recursivePromotion, promotionThreshold, extinctionThreshold);
  const comparison = buildMultiEraComparison(fitness, era);
  const reputation = buildReputation(fitness, eligibility);
  const species = buildSpeciesEvolution(civilizations);
  const rankings = buildRankings(fitness, eligibility, reputation);
  const lineage = buildMetaSelectionLineage(civilizations, {
    fitness,
    dynasty,
    corruption,
    extinction,
    governance,
    traits,
    mutations,
    lifecycle,
    recursivePromotion,
    eligibility,
    durability,
    comparison,
    reputation,
    species,
    rankings,
  });
  const state = classifyMetaSelectionState(rankings, eligibility, extinction);
  const seed = {
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    civilization_hashes: civilizations.map((civilization) => civilization.deterministic_hash),
    fitness_hashes: fitness.map((record) => record.fitness_hash),
    dynasty_hashes: dynasty.map((record) => record.analytic_hash),
    corruption_hashes: corruption.map((record) => record.benchmark_hash),
    extinction_hashes: extinction.map((record) => record.prediction_hash),
    governance_hashes: governance.map((record) => record.forecast_hash),
    trait_hashes: traits.map((record) => record.weight_hash),
    mutation_hashes: mutations.map((record) => record.mutation_hash),
    lifecycle_hashes: lifecycle.map((record) => record.transition_hash),
    promotion_hashes: recursivePromotion.map((record) => record.promotion_hash),
    eligibility_hashes: eligibility.map((record) => record.eligibility_hash),
    durability_hashes: durability.map((record) => record.durability_hash),
    comparison_hashes: comparison.map((record) => record.comparison_hash),
    reputation_hashes: reputation.map((record) => record.reputation_hash),
    species_hashes: species.map((record) => record.species_track_hash),
    ranking_hashes: rankings.map((record) => record.ranking_hash),
    lineage_hashes: lineage.map((record) => record.lineage_hash),
  };
  const deterministicHash = computeReplayCivilizationMetaSelectionHash(seed);
  const snapshot = deepFreeze({
    meta_selection_id: `replay-civilization-meta-selection:${deterministicHash}`,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    civilization_ids: civilizations.map((civilization) => civilization.civilization_id),
    fitness_scores: fitness,
    dynasty_survivability: dynasty,
    corruption_resistance: corruption,
    extinction_predictions: extinction,
    governance_forecasts: governance,
    trait_inheritance: traits,
    trait_mutations: mutations,
    lifecycle_states: lifecycle,
    recursive_promotion: recursivePromotion,
    eligibility_gates: eligibility,
    adversarial_durability: durability,
    multi_era_comparison: comparison,
    civilization_reputation: reputation,
    species_evolution: species,
    intelligence_rankings: rankings,
    meta_selection_lineage: lineage,
    supported_actions: SUPPORTED_ACTIONS,
    supported_queries: SUPPORTED_QUERIES,
    deterministic_hash: deterministicHash,
  });

  persistReplayCivilizationMetaSelectionSnapshot(db, snapshot);
  return snapshot;
}

export function getCivilizationFitnessScores(db: SqliteDatabase, metaSelectionId: string): readonly ReplayCivilizationFitnessScore[] { return getMetaSelectionViewList(db, metaSelectionId, "fitness_scores"); }
export function getDynastySurvivabilityAnalytics(db: SqliteDatabase, metaSelectionId: string): readonly ReplayDynastySurvivabilityAnalytic[] { return getMetaSelectionViewList(db, metaSelectionId, "dynasty_survivability"); }
export function getCorruptionResistanceBenchmarks(db: SqliteDatabase, metaSelectionId: string): readonly ReplayCorruptionResistanceBenchmark[] { return getMetaSelectionViewList(db, metaSelectionId, "corruption_resistance"); }
export function getExtinctionPredictions(db: SqliteDatabase, metaSelectionId: string): readonly ReplayExtinctionPrediction[] { return getMetaSelectionViewList(db, metaSelectionId, "extinction_predictions"); }
export function getGovernanceStabilityForecasts(db: SqliteDatabase, metaSelectionId: string): readonly ReplayGovernanceStabilityForecast[] { return getMetaSelectionViewList(db, metaSelectionId, "governance_forecasts"); }
export function getTraitInheritanceWeights(db: SqliteDatabase, metaSelectionId: string): readonly ReplayValidatorTraitInheritanceWeight[] { return getMetaSelectionViewList(db, metaSelectionId, "trait_inheritance"); }
export function getTraitMutationAnalytics(db: SqliteDatabase, metaSelectionId: string): readonly ReplayEvolutionaryTraitMutationAnalytic[] { return getMetaSelectionViewList(db, metaSelectionId, "trait_mutations"); }
export function getLifecycleStateMachine(db: SqliteDatabase, metaSelectionId: string): readonly ReplayCivilizationLifecycleStateRecord[] { return getMetaSelectionViewList(db, metaSelectionId, "lifecycle_states"); }
export function getRecursivePromotionScores(db: SqliteDatabase, metaSelectionId: string): readonly ReplayRecursiveCivilizationPromotionScore[] { return getMetaSelectionViewList(db, metaSelectionId, "recursive_promotion"); }
export function getLiveRuntimeEligibilityGates(db: SqliteDatabase, metaSelectionId: string): readonly ReplayLiveRuntimeCivilizationEligibilityGate[] { return getMetaSelectionViewList(db, metaSelectionId, "eligibility_gates"); }
export function getAdversarialConsensusDurability(db: SqliteDatabase, metaSelectionId: string): readonly ReplayAdversarialConsensusDurabilityAnalytic[] { return getMetaSelectionViewList(db, metaSelectionId, "adversarial_durability"); }
export function getMultiEraCivilizationComparison(db: SqliteDatabase, metaSelectionId: string): readonly ReplayMultiEraCivilizationComparison[] { return getMetaSelectionViewList(db, metaSelectionId, "multi_era_comparison"); }
export function getCivilizationReputation(db: SqliteDatabase, metaSelectionId: string): readonly ReplayCivilizationReputationRecord[] { return getMetaSelectionViewList(db, metaSelectionId, "civilization_reputation"); }
export function getSpeciesEvolutionTracking(db: SqliteDatabase, metaSelectionId: string): readonly ReplayLongHorizonSpeciesEvolutionTrack[] { return getMetaSelectionViewList(db, metaSelectionId, "species_evolution"); }
export function getCivilizationIntelligenceRankings(db: SqliteDatabase, metaSelectionId: string): readonly ReplayCivilizationIntelligenceRanking[] { return getMetaSelectionViewList(db, metaSelectionId, "intelligence_rankings"); }

export function serializeReplayCivilizationMetaSelectionSnapshot(snapshot: ReplayCivilizationMetaSelectionSnapshot): string {
  return stableMetaSelectionStringify(snapshot);
}

export function computeReplayCivilizationMetaSelectionHash(value: unknown): string {
  return crypto.createHash("sha256").update(stableMetaSelectionStringify(value)).digest("hex");
}

function buildDynastySurvivability(civilizations: readonly ReplayHistoricalAutonomousCivilizationSnapshot[]): readonly ReplayDynastySurvivabilityAnalytic[] {
  return deepFreeze(civilizations.flatMap((civilization) => civilization.dynasty_survival.map((dynasty) => {
    const recovery = civilization.civilization_recovery.find((record) => record.league === dynasty.league)?.recovery_score ?? 0;
    const swarm = civilization.self_preserving_swarms.find((record) => record.league === dynasty.league)?.self_preservation_score ?? 0;
    const seed = {
      civilization_id: civilization.civilization_id,
      league: dynasty.league,
      dynasty_score: dynasty.dynasty_score,
      recovery_score: round(recovery),
      swarm_score: round(swarm),
      survivability_index: round(clamp01(dynasty.dynasty_score * 0.5 + recovery * 0.25 + swarm * 0.25)),
    };
    const hash = computeReplayCivilizationMetaSelectionHash(seed);
    return { analytic_id: `civilization-dynasty-survivability:${hash}`, ...seed, analytic_hash: hash };
  })));
}

function buildCorruptionResistance(civilizations: readonly ReplayHistoricalAutonomousCivilizationSnapshot[]): readonly ReplayCorruptionResistanceBenchmark[] {
  return deepFreeze(civilizations.flatMap((civilization) => unique(civilization.corruption_propagation.map((record) => record.league)).map((league) => {
    const records = civilization.corruption_propagation.filter((record) => record.league === league);
    const risk = average(records.map((record) => record.corruption_risk));
    const containment = average(records.map((record) => record.containment_score));
    const seed = {
      civilization_id: civilization.civilization_id,
      league,
      average_corruption_risk: round(risk),
      containment_score: round(containment),
      resistance_score: round(clamp01((1 - risk) * 0.55 + containment * 0.45)),
    };
    const hash = computeReplayCivilizationMetaSelectionHash(seed);
    return { benchmark_id: `civilization-corruption-resistance:${hash}`, ...seed, benchmark_hash: hash };
  })));
}

function buildExtinctionPredictions(
  civilizations: readonly ReplayHistoricalAutonomousCivilizationSnapshot[],
  corruption: readonly ReplayCorruptionResistanceBenchmark[],
): readonly ReplayExtinctionPrediction[] {
  return deepFreeze(civilizations.flatMap((civilization) => civilization.civilization_analytics.map((analytics) => {
    const pressure = 1 - (corruption.find((record) => record.civilization_id === civilization.civilization_id && record.league === analytics.league)?.resistance_score ?? 0);
    const seed = {
      civilization_id: civilization.civilization_id,
      league: analytics.league,
      collapse_risk: analytics.collapse_risk,
      corruption_pressure: round(pressure),
      extinction_probability: round(clamp01(analytics.collapse_risk * 0.62 + pressure * 0.38)),
    };
    const hash = computeReplayCivilizationMetaSelectionHash(seed);
    return { prediction_id: `civilization-extinction-prediction:${hash}`, ...seed, prediction_hash: hash };
  })));
}

function buildGovernanceForecasts(civilizations: readonly ReplayHistoricalAutonomousCivilizationSnapshot[]): readonly ReplayGovernanceStabilityForecast[] {
  return deepFreeze(civilizations.flatMap((civilization) => civilization.governance_ideologies.map((ideology) => {
    const fracture = civilization.civil_war_fractures.find((record) => record.league === ideology.league)?.civil_war_risk ?? 0;
    const seed = {
      civilization_id: civilization.civilization_id,
      league: ideology.league,
      ideology_stability: ideology.ideology_stability,
      fracture_risk: round(fracture),
      forecast_stability: round(clamp01(ideology.ideology_stability * 0.7 + (1 - fracture) * 0.3)),
    };
    const hash = computeReplayCivilizationMetaSelectionHash(seed);
    return { forecast_id: `civilization-governance-forecast:${hash}`, ...seed, forecast_hash: hash };
  })));
}

function buildTraitInheritance(civilizations: readonly ReplayHistoricalAutonomousCivilizationSnapshot[]): readonly ReplayValidatorTraitInheritanceWeight[] {
  return deepFreeze(civilizations.flatMap((civilization) => civilization.species_divergence.map((species) => {
    const support = civilization.dynasty_survival.find((record) => record.league === species.league)?.dynasty_score ?? 0;
    const seed = {
      civilization_id: civilization.civilization_id,
      league: species.league,
      trait: species.species_name,
      inheritance_weight: round(clamp01(species.divergence_score * 0.55 + support * 0.45)),
      lineage_support: round(support),
    };
    const hash = computeReplayCivilizationMetaSelectionHash(seed);
    return { weight_id: `civilization-trait-inheritance:${hash}`, ...seed, weight_hash: hash };
  })));
}

function buildTraitMutations(civilizations: readonly ReplayHistoricalAutonomousCivilizationSnapshot[]): readonly ReplayEvolutionaryTraitMutationAnalytic[] {
  return deepFreeze(civilizations.flatMap((civilization) => civilization.species_divergence.map((species) => {
    const corruption = average(civilization.corruption_propagation.filter((record) => record.league === species.league).map((record) => record.corruption_risk));
    const seed = {
      civilization_id: civilization.civilization_id,
      league: species.league,
      species_name: species.species_name,
      divergence_score: species.divergence_score,
      mutation_pressure: round(clamp01(species.divergence_score * 0.6 + corruption * 0.4)),
    };
    const hash = computeReplayCivilizationMetaSelectionHash(seed);
    return { mutation_id: `civilization-trait-mutation:${hash}`, ...seed, mutation_hash: hash };
  })));
}

function buildAdversarialDurability(civilizations: readonly ReplayHistoricalAutonomousCivilizationSnapshot[]): readonly ReplayAdversarialConsensusDurabilityAnalytic[] {
  return deepFreeze(civilizations.flatMap((civilization) => unique(civilization.validator_empires.map((record) => record.league)).map((league) => {
    const defense = average(civilization.warfare.filter((record) => record.defender_league === league).map((record) => record.defense_power));
    const diplomacy = average(civilization.runtime_diplomacy.filter((record) => record.league === league).map((record) => record.diplomacy_score));
    const seed = {
      civilization_id: civilization.civilization_id,
      league,
      warfare_resilience: round(defense),
      diplomacy_resilience: round(diplomacy),
      adversarial_durability_score: round(clamp01(defense * 0.62 + diplomacy * 0.38)),
    };
    const hash = computeReplayCivilizationMetaSelectionHash(seed);
    return { durability_id: `civilization-adversarial-durability:${hash}`, ...seed, durability_hash: hash };
  })));
}

function buildFitnessScores(
  civilizations: readonly ReplayHistoricalAutonomousCivilizationSnapshot[],
  dynasty: readonly ReplayDynastySurvivabilityAnalytic[],
  corruption: readonly ReplayCorruptionResistanceBenchmark[],
  durability: readonly ReplayAdversarialConsensusDurabilityAnalytic[],
  era: string,
): readonly ReplayCivilizationFitnessScore[] {
  return deepFreeze(civilizations.flatMap((civilization) => civilization.civilization_analytics.map((analytics) => {
    const dynastyScore = dynasty.find((record) => record.civilization_id === civilization.civilization_id && record.league === analytics.league)?.survivability_index ?? 0;
    const resistance = corruption.find((record) => record.civilization_id === civilization.civilization_id && record.league === analytics.league)?.resistance_score ?? 0;
    const durabilityScore = durability.find((record) => record.civilization_id === civilization.civilization_id && record.league === analytics.league)?.adversarial_durability_score ?? 0;
    const seed = {
      civilization_id: civilization.civilization_id,
      league: analytics.league,
      era_label: era,
      base_fitness: analytics.civilization_fitness,
      dynasty_component: round(dynastyScore),
      cooperation_component: analytics.cooperation_index,
      durability_component: round(durabilityScore),
      fitness_score: round(clamp01(analytics.civilization_fitness * 0.34 + dynastyScore * 0.24 + resistance * 0.18 + analytics.cooperation_index * 0.1 + durabilityScore * 0.14)),
    };
    const hash = computeReplayCivilizationMetaSelectionHash(seed);
    return { fitness_id: `civilization-fitness-score:${hash}`, ...seed, fitness_hash: hash };
  })));
}

function buildLifecycleStates(
  civilizations: readonly ReplayHistoricalAutonomousCivilizationSnapshot[],
  fitness: readonly ReplayCivilizationFitnessScore[],
  extinction: readonly ReplayExtinctionPrediction[],
  governance: readonly ReplayGovernanceStabilityForecast[],
): readonly ReplayCivilizationLifecycleStateRecord[] {
  return deepFreeze(fitness.map((score) => {
    const extinctionProbability = extinction.find((record) => record.civilization_id === score.civilization_id && record.league === score.league)?.extinction_probability ?? 0;
    const stability = governance.find((record) => record.civilization_id === score.civilization_id && record.league === score.league)?.forecast_stability ?? 0;
    const civilization = civilizations.find((record) => record.civilization_id === score.civilization_id);
    const promoted = civilization?.promotion_gates.some((gate) => gate.league === score.league && gate.promoted) ?? false;
    const lifecycle_state: ReplayCivilizationLifecycleStateRecord["lifecycle_state"] = promoted && score.fitness_score >= 0.65 ? "promotable" : extinctionProbability > 0.72 ? "collapsing" : stability < 0.46 ? "stressed" : score.fitness_score > 0.68 ? "expanding" : score.fitness_score > 0.54 ? "stable" : "emerging";
    const seed = {
      civilization_id: score.civilization_id,
      league: score.league,
      lifecycle_state,
      state_score: round(clamp01(score.fitness_score * 0.5 + stability * 0.28 + (1 - extinctionProbability) * 0.22)),
    };
    const hash = computeReplayCivilizationMetaSelectionHash(seed);
    return { lifecycle_id: `civilization-lifecycle:${hash}`, ...seed, transition_hash: hash };
  }));
}

function buildRecursivePromotion(
  civilizations: readonly ReplayHistoricalAutonomousCivilizationSnapshot[],
  fitness: readonly ReplayCivilizationFitnessScore[],
  lifecycle: readonly ReplayCivilizationLifecycleStateRecord[],
): readonly ReplayRecursiveCivilizationPromotionScore[] {
  return deepFreeze(fitness.map((score) => {
    const civilization = civilizations.find((record) => record.civilization_id === score.civilization_id);
    const gate = civilization?.promotion_gates.find((record) => record.league === score.league);
    const state = lifecycle.find((record) => record.civilization_id === score.civilization_id && record.league === score.league);
    const depth = civilization?.civilization_state_lineage.filter((record) => record.league === score.league).length ?? 1;
    const seed = {
      civilization_id: score.civilization_id,
      league: score.league,
      prior_gate_score: round(gate?.gate_score ?? 0),
      recursive_depth: depth,
      recursive_promotion_score: round(clamp01((gate?.gate_score ?? 0) * 0.45 + score.fitness_score * 0.35 + (state?.state_score ?? 0) * 0.2)),
    };
    const hash = computeReplayCivilizationMetaSelectionHash(seed);
    return { promotion_id: `civilization-recursive-promotion:${hash}`, ...seed, promotion_hash: hash };
  }));
}

function buildEligibilityGates(
  fitness: readonly ReplayCivilizationFitnessScore[],
  extinction: readonly ReplayExtinctionPrediction[],
  governance: readonly ReplayGovernanceStabilityForecast[],
  recursivePromotion: readonly ReplayRecursiveCivilizationPromotionScore[],
  promotionThreshold: number,
  extinctionThreshold: number,
): readonly ReplayLiveRuntimeCivilizationEligibilityGate[] {
  return deepFreeze(fitness.map((score) => {
    const extinctionProbability = extinction.find((record) => record.civilization_id === score.civilization_id && record.league === score.league)?.extinction_probability ?? 1;
    const stability = governance.find((record) => record.civilization_id === score.civilization_id && record.league === score.league)?.forecast_stability ?? 0;
    const recursive = recursivePromotion.find((record) => record.civilization_id === score.civilization_id && record.league === score.league)?.recursive_promotion_score ?? 0;
    const eligibilityScore = clamp01(score.fitness_score * 0.42 + recursive * 0.34 + stability * 0.14 + (1 - extinctionProbability) * 0.1);
    const eligible = eligibilityScore >= promotionThreshold && extinctionProbability <= extinctionThreshold;
    const seed = {
      civilization_id: score.civilization_id,
      league: score.league,
      eligible,
      eligibility_score: round(eligibilityScore),
      gate_reason: eligible ? "civilization_eligible_for_live_runtime" : extinctionProbability > extinctionThreshold ? "extinction_prediction_blocks_live_runtime" : "meta_selection_score_below_threshold",
    };
    const hash = computeReplayCivilizationMetaSelectionHash(seed);
    return { eligibility_id: `civilization-live-eligibility:${hash}`, ...seed, eligibility_hash: hash };
  }));
}

function buildMultiEraComparison(fitness: readonly ReplayCivilizationFitnessScore[], era: string): readonly ReplayMultiEraCivilizationComparison[] {
  return deepFreeze(unique(fitness.map((record) => record.league)).map((league) => {
    const records = fitness.filter((record) => record.league === league);
    const leader = records.slice().sort((left, right) => right.fitness_score - left.fitness_score || left.civilization_id.localeCompare(right.civilization_id))[0];
    const seed = {
      league,
      era_label: era,
      civilization_count: records.length,
      leading_civilization_id: leader?.civilization_id ?? "none",
      era_strength_score: round(average(records.map((record) => record.fitness_score))),
    };
    const hash = computeReplayCivilizationMetaSelectionHash(seed);
    return { comparison_id: `civilization-era-comparison:${hash}`, ...seed, comparison_hash: hash };
  }));
}

function buildReputation(
  fitness: readonly ReplayCivilizationFitnessScore[],
  eligibility: readonly ReplayLiveRuntimeCivilizationEligibilityGate[],
): readonly ReplayCivilizationReputationRecord[] {
  return deepFreeze(fitness.map((score) => {
    const eligible = eligibility.find((record) => record.civilization_id === score.civilization_id && record.league === score.league)?.eligible ?? false;
    const reputationScore = clamp01(score.fitness_score * 0.7 + (eligible ? 0.18 : 0) + score.durability_component * 0.12);
    const tier: ReplayCivilizationReputationRecord["reputation_tier"] = reputationScore >= 0.82 ? "legendary" : reputationScore >= 0.68 ? "elite" : reputationScore >= 0.54 ? "viable" : reputationScore >= 0.42 ? "watchlist" : "rejected";
    const seed = {
      civilization_id: score.civilization_id,
      league: score.league,
      reputation_score: round(reputationScore),
      reputation_tier: tier,
    };
    const hash = computeReplayCivilizationMetaSelectionHash(seed);
    return { reputation_id: `civilization-reputation:${hash}`, ...seed, reputation_hash: hash };
  }));
}

function buildSpeciesEvolution(civilizations: readonly ReplayHistoricalAutonomousCivilizationSnapshot[]): readonly ReplayLongHorizonSpeciesEvolutionTrack[] {
  return deepFreeze(civilizations.flatMap((civilization) => civilization.species_divergence.map((species) => {
    const mutation = civilization.corruption_propagation.find((record) => record.league === species.league)?.corruption_risk ?? 0;
    const seed = {
      civilization_id: civilization.civilization_id,
      league: species.league,
      species_name: species.species_name,
      ancestor_hash: species.ancestor_hash,
      evolution_score: round(clamp01(species.divergence_score * 0.72 + (1 - mutation) * 0.28)),
    };
    const hash = computeReplayCivilizationMetaSelectionHash(seed);
    return { species_track_id: `civilization-species-evolution:${hash}`, ...seed, species_track_hash: hash };
  })));
}

function buildRankings(
  fitness: readonly ReplayCivilizationFitnessScore[],
  eligibility: readonly ReplayLiveRuntimeCivilizationEligibilityGate[],
  reputation: readonly ReplayCivilizationReputationRecord[],
): readonly ReplayCivilizationIntelligenceRanking[] {
  const scored = fitness.map((score) => {
    const gate = eligibility.find((record) => record.civilization_id === score.civilization_id && record.league === score.league);
    const rep = reputation.find((record) => record.civilization_id === score.civilization_id && record.league === score.league);
    return {
      score,
      rankingScore: clamp01(score.fitness_score * 0.52 + (gate?.eligibility_score ?? 0) * 0.3 + (rep?.reputation_score ?? 0) * 0.18),
      promoted: gate?.eligible ?? false,
    };
  }).sort((left, right) => right.rankingScore - left.rankingScore || left.score.league.localeCompare(right.score.league));
  return deepFreeze(scored.map((item, index) => {
    const seed = {
      civilization_id: item.score.civilization_id,
      league: item.score.league,
      rank: index + 1,
      ranking_score: round(item.rankingScore),
      promoted: item.promoted,
    };
    const hash = computeReplayCivilizationMetaSelectionHash(seed);
    return { ranking_id: `civilization-intelligence-ranking:${hash}`, ...seed, ranking_hash: hash };
  }));
}

function buildMetaSelectionLineage(
  civilizations: readonly ReplayHistoricalAutonomousCivilizationSnapshot[],
  records: {
    readonly fitness: readonly ReplayCivilizationFitnessScore[];
    readonly dynasty: readonly ReplayDynastySurvivabilityAnalytic[];
    readonly corruption: readonly ReplayCorruptionResistanceBenchmark[];
    readonly extinction: readonly ReplayExtinctionPrediction[];
    readonly governance: readonly ReplayGovernanceStabilityForecast[];
    readonly traits: readonly ReplayValidatorTraitInheritanceWeight[];
    readonly mutations: readonly ReplayEvolutionaryTraitMutationAnalytic[];
    readonly lifecycle: readonly ReplayCivilizationLifecycleStateRecord[];
    readonly recursivePromotion: readonly ReplayRecursiveCivilizationPromotionScore[];
    readonly eligibility: readonly ReplayLiveRuntimeCivilizationEligibilityGate[];
    readonly durability: readonly ReplayAdversarialConsensusDurabilityAnalytic[];
    readonly comparison: readonly ReplayMultiEraCivilizationComparison[];
    readonly reputation: readonly ReplayCivilizationReputationRecord[];
    readonly species: readonly ReplayLongHorizonSpeciesEvolutionTrack[];
    readonly rankings: readonly ReplayCivilizationIntelligenceRanking[];
  },
): readonly ReplayCivilizationMetaSelectionLineage[] {
  const refs: readonly { readonly civilization_id: string; readonly league: string | null; readonly kind: ReplayCivilizationMetaSelectionLineage["lineage_kind"]; readonly source_hash: string; readonly target_hash: string }[] = [
    ...civilizations.map((record) => ({ civilization_id: record.civilization_id, league: null, kind: "civilization" as const, source_hash: record.deterministic_hash, target_hash: record.deterministic_hash })),
    ...records.fitness.map((record) => ({ civilization_id: record.civilization_id, league: record.league, kind: "fitness" as const, source_hash: record.civilization_id, target_hash: record.fitness_hash })),
    ...records.dynasty.map((record) => ({ civilization_id: record.civilization_id, league: record.league, kind: "dynasty" as const, source_hash: record.civilization_id, target_hash: record.analytic_hash })),
    ...records.corruption.map((record) => ({ civilization_id: record.civilization_id, league: record.league, kind: "corruption" as const, source_hash: record.civilization_id, target_hash: record.benchmark_hash })),
    ...records.extinction.map((record) => ({ civilization_id: record.civilization_id, league: record.league, kind: "extinction" as const, source_hash: record.civilization_id, target_hash: record.prediction_hash })),
    ...records.governance.map((record) => ({ civilization_id: record.civilization_id, league: record.league, kind: "governance" as const, source_hash: record.civilization_id, target_hash: record.forecast_hash })),
    ...records.traits.map((record) => ({ civilization_id: record.civilization_id, league: record.league, kind: "trait" as const, source_hash: record.civilization_id, target_hash: record.weight_hash })),
    ...records.mutations.map((record) => ({ civilization_id: record.civilization_id, league: record.league, kind: "mutation" as const, source_hash: record.civilization_id, target_hash: record.mutation_hash })),
    ...records.lifecycle.map((record) => ({ civilization_id: record.civilization_id, league: record.league, kind: "lifecycle" as const, source_hash: record.civilization_id, target_hash: record.transition_hash })),
    ...records.recursivePromotion.map((record) => ({ civilization_id: record.civilization_id, league: record.league, kind: "promotion" as const, source_hash: record.civilization_id, target_hash: record.promotion_hash })),
    ...records.eligibility.map((record) => ({ civilization_id: record.civilization_id, league: record.league, kind: "eligibility" as const, source_hash: record.civilization_id, target_hash: record.eligibility_hash })),
    ...records.durability.map((record) => ({ civilization_id: record.civilization_id, league: record.league, kind: "durability" as const, source_hash: record.civilization_id, target_hash: record.durability_hash })),
    ...records.comparison.map((record) => ({ civilization_id: record.leading_civilization_id, league: record.league, kind: "comparison" as const, source_hash: record.leading_civilization_id, target_hash: record.comparison_hash })),
    ...records.reputation.map((record) => ({ civilization_id: record.civilization_id, league: record.league, kind: "reputation" as const, source_hash: record.civilization_id, target_hash: record.reputation_hash })),
    ...records.species.map((record) => ({ civilization_id: record.civilization_id, league: record.league, kind: "species" as const, source_hash: record.ancestor_hash, target_hash: record.species_track_hash })),
    ...records.rankings.map((record) => ({ civilization_id: record.civilization_id, league: record.league, kind: "ranking" as const, source_hash: record.civilization_id, target_hash: record.ranking_hash })),
  ];
  return deepFreeze(refs.map((ref) => {
    const seed = {
      civilization_id: ref.civilization_id,
      league: ref.league,
      lineage_kind: ref.kind,
      source_hash: normalizeHash(ref.source_hash),
      target_hash: ref.target_hash,
    };
    const hash = computeReplayCivilizationMetaSelectionHash(seed);
    return { lineage_id: `civilization-meta-selection-lineage:${hash}`, ...seed, lineage_hash: hash };
  }));
}

function classifyMetaSelectionState(
  rankings: readonly ReplayCivilizationIntelligenceRanking[],
  eligibility: readonly ReplayLiveRuntimeCivilizationEligibilityGate[],
  extinction: readonly ReplayExtinctionPrediction[],
): ReplayCivilizationMetaSelectionState {
  if (rankings.some((record) => record.promoted)) return "promoting";
  if (eligibility.some((record) => record.eligible)) return "gating";
  if (extinction.some((record) => record.extinction_probability > 0.7)) return "watchlisted";
  if (rankings.length === 0) return "rejected";
  return "ranking";
}

function persistReplayCivilizationMetaSelectionSnapshot(db: SqliteDatabase, snapshot: ReplayCivilizationMetaSelectionSnapshot): void {
  const write = db.transaction(() => {
    db.prepare(`
      INSERT OR REPLACE INTO replay_civilization_meta_selection_snapshots
      (meta_selection_id, generated_at, persisted_at, state, deterministic_hash, payload)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(snapshot.meta_selection_id, snapshot.generated_at, snapshot.persisted_at, snapshot.state, snapshot.deterministic_hash, stableMetaSelectionStringify(snapshot));
    for (const record of snapshot.fitness_scores) persistView(db, snapshot, "fitness_scores", record.fitness_id, record.fitness_hash, record);
    for (const record of snapshot.dynasty_survivability) persistView(db, snapshot, "dynasty_survivability", record.analytic_id, record.analytic_hash, record);
    for (const record of snapshot.corruption_resistance) persistView(db, snapshot, "corruption_resistance", record.benchmark_id, record.benchmark_hash, record);
    for (const record of snapshot.extinction_predictions) persistView(db, snapshot, "extinction_predictions", record.prediction_id, record.prediction_hash, record);
    for (const record of snapshot.governance_forecasts) persistView(db, snapshot, "governance_forecasts", record.forecast_id, record.forecast_hash, record);
    for (const record of snapshot.trait_inheritance) persistView(db, snapshot, "trait_inheritance", record.weight_id, record.weight_hash, record);
    for (const record of snapshot.trait_mutations) persistView(db, snapshot, "trait_mutations", record.mutation_id, record.mutation_hash, record);
    for (const record of snapshot.lifecycle_states) persistView(db, snapshot, "lifecycle_states", record.lifecycle_id, record.transition_hash, record);
    for (const record of snapshot.recursive_promotion) persistView(db, snapshot, "recursive_promotion", record.promotion_id, record.promotion_hash, record);
    for (const record of snapshot.eligibility_gates) persistView(db, snapshot, "eligibility_gates", record.eligibility_id, record.eligibility_hash, record);
    for (const record of snapshot.adversarial_durability) persistView(db, snapshot, "adversarial_durability", record.durability_id, record.durability_hash, record);
    for (const record of snapshot.multi_era_comparison) persistView(db, snapshot, "multi_era_comparison", record.comparison_id, record.comparison_hash, record);
    for (const record of snapshot.civilization_reputation) persistView(db, snapshot, "civilization_reputation", record.reputation_id, record.reputation_hash, record);
    for (const record of snapshot.species_evolution) persistView(db, snapshot, "species_evolution", record.species_track_id, record.species_track_hash, record);
    for (const record of snapshot.intelligence_rankings) persistView(db, snapshot, "intelligence_rankings", record.ranking_id, record.ranking_hash, record);
    for (const record of snapshot.meta_selection_lineage) persistView(db, snapshot, "meta_selection_lineage", record.lineage_id, record.lineage_hash, record);
  });
  write();
}

function persistView(db: SqliteDatabase, snapshot: ReplayCivilizationMetaSelectionSnapshot, viewKind: string, viewId: string, viewHash: string, payload: unknown): void {
  db.prepare(`
    INSERT OR REPLACE INTO replay_civilization_meta_selection_views
    (view_id, meta_selection_id, view_kind, view_hash, payload)
    VALUES (?, ?, ?, ?, ?)
  `).run(viewId, snapshot.meta_selection_id, viewKind, viewHash, stableMetaSelectionStringify(payload));
}

function getMetaSelectionViewList<T>(db: SqliteDatabase, metaSelectionId: string, viewKind: string): readonly T[] {
  initializeReplayCivilizationMetaSelectionSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_civilization_meta_selection_views
    WHERE meta_selection_id = ? AND view_kind = ?
    ORDER BY view_hash ASC
  `).all(metaSelectionId, viewKind) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as T));
}

function normalizeHash(value: string): string {
  return value.length === 64 ? value : computeReplayCivilizationMetaSelectionHash(value);
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

function stableMetaSelectionStringify(value: unknown): string {
  return JSON.stringify(sortMetaSelectionKeys(value));
}

function sortMetaSelectionKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortMetaSelectionKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortMetaSelectionKeys((value as Record<string, unknown>)[key]);
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
