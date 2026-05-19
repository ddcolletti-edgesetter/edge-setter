import crypto from "node:crypto";

import type Database from "better-sqlite3";

import type {
  ReplayHistoricalSimulationRuntimeSnapshot,
  ReplayPreLiveRuntimeInitializationSnapshot,
} from "./replay-historical-simulation-runtime-contract";
import type {
  ReplayAutonomousIntelligenceHierarchyRecord,
  ReplayCoalitionCollusionDetectionRecord,
  ReplayDeterministicEvolutionaryAuditRecord,
  ReplayEvolutionaryTournamentGeneration,
  ReplayGovernanceForkSimulationRecord,
  ReplayHistoricalAutonomousLeagueAction,
  ReplayHistoricalAutonomousLeagueInput,
  ReplayHistoricalAutonomousLeagueQuery,
  ReplayHistoricalAutonomousLeagueSnapshot,
  ReplayHistoricalAutonomousLeagueState,
  ReplayLongHorizonEvolutionaryMemoryRecord,
  ReplaySimulationToLivePromotionCriteria,
  ReplaySpecializationMarketSimulation,
  ReplayValidatorEconomyCapitalAllocation,
  ReplayValidatorLeagueEcosystemRecord,
  ReplayValidatorPopulationLineageRecord,
  ReplayValidatorSurvivalExtinctionCycle,
} from "./replay-historical-autonomous-league-contract";

type SqliteDatabase = Database.Database;

interface PayloadRow {
  readonly payload: string;
}

const SUPPORTED_ACTIONS: readonly ReplayHistoricalAutonomousLeagueAction[] = [
  "form_validator_ecosystem",
  "model_validator_population_lineage",
  "run_evolutionary_tournament",
  "model_survival_extinction_cycle",
  "simulate_specialization_market",
  "detect_coalition_collusion",
  "allocate_intelligence_capital",
  "simulate_governance_fork",
  "form_intelligence_hierarchy",
  "persist_evolutionary_memory",
  "evaluate_live_promotion",
  "emit_evolutionary_audit",
];

const SUPPORTED_QUERIES: readonly ReplayHistoricalAutonomousLeagueQuery[] = [
  "get_validator_league_ecosystem",
  "get_validator_population_lineage",
  "get_evolutionary_tournament_generations",
  "get_survival_extinction_cycles",
  "get_specialization_market",
  "get_coalition_collusion_detection",
  "get_validator_economy_capital",
  "get_governance_fork_simulation",
  "get_intelligence_hierarchy",
  "get_evolutionary_memory",
  "get_simulation_to_live_promotion",
  "get_evolutionary_audit",
];

export function initializeReplayHistoricalAutonomousLeagueSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS replay_historical_autonomous_league_snapshots (
      autonomous_league_id TEXT PRIMARY KEY,
      simulation_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      state TEXT NOT NULL,
      deterministic_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replay_historical_autonomous_league_views (
      view_id TEXT PRIMARY KEY,
      autonomous_league_id TEXT NOT NULL,
      view_kind TEXT NOT NULL,
      view_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);
}

export function buildReplayHistoricalAutonomousLeagueSnapshot(
  db: SqliteDatabase,
  input: ReplayHistoricalAutonomousLeagueInput,
): ReplayHistoricalAutonomousLeagueSnapshot {
  initializeReplayHistoricalAutonomousLeagueSchema(db);

  const simulation = input.simulation_snapshot;
  const generationCount = Math.max(1, input.generation_count ?? 5);
  const extinctionThreshold = clamp01(input.extinction_threshold ?? 0.42);
  const promotionThreshold = clamp01(input.promotion_threshold ?? 0.68);
  const ecosystem = buildEcosystem(simulation);
  const lineage = buildPopulationLineage(simulation, generationCount, extinctionThreshold);
  const tournaments = buildEvolutionaryTournaments(lineage, generationCount);
  const survival = buildSurvivalExtinction(lineage, tournaments, extinctionThreshold);
  const markets = buildSpecializationMarkets(simulation, ecosystem);
  const collusion = buildCoalitionCollusionDetection(lineage, markets);
  const economy = buildEconomyCapitalAllocation(lineage, markets, survival);
  const forks = buildGovernanceForks(simulation, collusion, tournaments);
  const hierarchy = buildHierarchy(economy, survival);
  const memory = buildEvolutionaryMemory(lineage, survival, tournaments, generationCount);
  const promotion = buildLivePromotionCriteria(hierarchy, survival, collusion, promotionThreshold);
  const audit = buildEvolutionaryAudit({
    ecosystem,
    lineage,
    tournaments,
    survival,
    markets,
    collusion,
    economy,
    forks,
    hierarchy,
    memory,
    promotion,
  });
  const state = classifyLeagueState(promotion, survival, collusion, forks);
  const seed = {
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    simulation_hash: simulation.deterministic_hash,
    ecosystem_hashes: ecosystem.map((record) => record.ecosystem_hash),
    lineage_hashes: lineage.map((record) => record.lineage_hash),
    tournament_hashes: tournaments.map((record) => record.generation_hash),
    survival_hashes: survival.map((record) => record.cycle_hash),
    market_hashes: markets.map((record) => record.market_hash),
    collusion_hashes: collusion.map((record) => record.detection_hash),
    economy_hashes: economy.map((record) => record.allocation_hash),
    fork_hashes: forks.map((record) => record.fork_hash),
    hierarchy_hashes: hierarchy.map((record) => record.hierarchy_hash),
    memory_hashes: memory.map((record) => record.memory_hash),
    promotion_hashes: promotion.map((record) => record.promotion_hash),
    audit_hashes: audit.map((record) => record.audit_hash),
  };
  const deterministicHash = computeReplayHistoricalAutonomousLeagueHash(seed);
  const snapshot = deepFreeze({
    autonomous_league_id: `replay-historical-autonomous-league:${deterministicHash}`,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    simulation_id: simulation.simulation_id,
    ecosystem,
    population_lineage: lineage,
    evolutionary_tournaments: tournaments,
    survival_extinction_cycles: survival,
    specialization_markets: markets,
    coalition_collusion_detection: collusion,
    economy_capital_allocation: economy,
    governance_forks: forks,
    intelligence_hierarchy: hierarchy,
    evolutionary_memory: memory,
    live_promotion_criteria: promotion,
    evolutionary_audit: audit,
    supported_actions: SUPPORTED_ACTIONS,
    supported_queries: SUPPORTED_QUERIES,
    deterministic_hash: deterministicHash,
  });

  persistReplayHistoricalAutonomousLeagueSnapshot(db, snapshot);
  return snapshot;
}

export function getValidatorLeagueEcosystem(db: SqliteDatabase, autonomousLeagueId: string): readonly ReplayValidatorLeagueEcosystemRecord[] {
  return getLeagueViewList(db, autonomousLeagueId, "ecosystem");
}

export function getValidatorPopulationLineage(db: SqliteDatabase, autonomousLeagueId: string): readonly ReplayValidatorPopulationLineageRecord[] {
  return getLeagueViewList(db, autonomousLeagueId, "population_lineage");
}

export function getEvolutionaryTournamentGenerations(db: SqliteDatabase, autonomousLeagueId: string): readonly ReplayEvolutionaryTournamentGeneration[] {
  return getLeagueViewList(db, autonomousLeagueId, "evolutionary_tournaments");
}

export function getSurvivalExtinctionCycles(db: SqliteDatabase, autonomousLeagueId: string): readonly ReplayValidatorSurvivalExtinctionCycle[] {
  return getLeagueViewList(db, autonomousLeagueId, "survival_extinction_cycles");
}

export function getSpecializationMarket(db: SqliteDatabase, autonomousLeagueId: string): readonly ReplaySpecializationMarketSimulation[] {
  return getLeagueViewList(db, autonomousLeagueId, "specialization_markets");
}

export function getCoalitionCollusionDetection(db: SqliteDatabase, autonomousLeagueId: string): readonly ReplayCoalitionCollusionDetectionRecord[] {
  return getLeagueViewList(db, autonomousLeagueId, "coalition_collusion_detection");
}

export function getValidatorEconomyCapital(db: SqliteDatabase, autonomousLeagueId: string): readonly ReplayValidatorEconomyCapitalAllocation[] {
  return getLeagueViewList(db, autonomousLeagueId, "economy_capital_allocation");
}

export function getGovernanceForkSimulation(db: SqliteDatabase, autonomousLeagueId: string): readonly ReplayGovernanceForkSimulationRecord[] {
  return getLeagueViewList(db, autonomousLeagueId, "governance_forks");
}

export function getIntelligenceHierarchy(db: SqliteDatabase, autonomousLeagueId: string): readonly ReplayAutonomousIntelligenceHierarchyRecord[] {
  return getLeagueViewList(db, autonomousLeagueId, "intelligence_hierarchy");
}

export function getEvolutionaryMemory(db: SqliteDatabase, autonomousLeagueId: string): readonly ReplayLongHorizonEvolutionaryMemoryRecord[] {
  return getLeagueViewList(db, autonomousLeagueId, "evolutionary_memory");
}

export function getSimulationToLivePromotion(db: SqliteDatabase, autonomousLeagueId: string): readonly ReplaySimulationToLivePromotionCriteria[] {
  return getLeagueViewList(db, autonomousLeagueId, "live_promotion_criteria");
}

export function getEvolutionaryAudit(db: SqliteDatabase, autonomousLeagueId: string): readonly ReplayDeterministicEvolutionaryAuditRecord[] {
  return getLeagueViewList(db, autonomousLeagueId, "evolutionary_audit");
}

export function serializeReplayHistoricalAutonomousLeagueSnapshot(snapshot: ReplayHistoricalAutonomousLeagueSnapshot): string {
  return stableLeagueStringify(snapshot);
}

export function computeReplayHistoricalAutonomousLeagueHash(value: unknown): string {
  return crypto.createHash("sha256").update(stableLeagueStringify(value)).digest("hex");
}

function buildEcosystem(simulation: ReplayHistoricalSimulationRuntimeSnapshot): readonly ReplayValidatorLeagueEcosystemRecord[] {
  const leagues = unique(simulation.pre_live_initialization.map((record) => record.league));
  return deepFreeze(leagues.map((league) => {
    const members = simulation.pre_live_initialization.filter((record) => record.league === league);
    const specializations = unique(members.map((record) => record.specialization));
    const survivability = average(simulation.survivability_simulation.filter((record) => record.league === league).map((record) => record.survivability_score));
    const seed = {
      league,
      population_count: members.length,
      specialization_count: specializations.length,
      average_initialized_trust: round(average(members.map((record) => record.initialized_trust))),
      ecosystem_fitness: round(clamp01((average(members.map((record) => record.initialized_trust)) * 0.55) + (survivability * 0.3) + (specializations.length / Math.max(1, members.length) * 0.15))),
    };
    const hash = computeReplayHistoricalAutonomousLeagueHash(seed);
    return {
      ecosystem_id: `historical-league-ecosystem:${hash}`,
      ...seed,
      ecosystem_hash: hash,
    };
  }));
}

function buildPopulationLineage(
  simulation: ReplayHistoricalSimulationRuntimeSnapshot,
  generationCount: number,
  extinctionThreshold: number,
): readonly ReplayValidatorPopulationLineageRecord[] {
  const founders = simulation.pre_live_initialization.slice().sort((left, right) => left.initialization_hash.localeCompare(right.initialization_hash));
  return deepFreeze(founders.flatMap((validator) => {
    const founderFitness = validatorFitness(validator, simulation, 0);
    const founderSeed = {
      validator_id: validator.initialization_id,
      validator_type: validator.validator_type,
      league: validator.league,
      parent_lineage_hash: null as string | null,
      generation: 0,
      lineage_fitness: round(founderFitness),
      lineage_status: "founder" as const,
    };
    const founderHash = computeReplayHistoricalAutonomousLeagueHash(founderSeed);
    const founder = {
      lineage_id: `historical-validator-lineage:${founderHash}`,
      ...founderSeed,
      lineage_hash: founderHash,
    };
    const descendants = Array.from({ length: generationCount }, (_, index) => {
      const generation = index + 1;
      const mutation = deterministicProbability(`${validator.initialization_hash}:${generation}:lineage`);
      const fitness = clamp01(founderFitness + ((mutation - 0.5) * 0.12) + (generation / (generationCount * 30)));
      const status: ReplayValidatorPopulationLineageRecord["lineage_status"] = fitness < extinctionThreshold ? "weak" : fitness >= 0.76 ? "elite" : "mutated";
      const seed = {
        validator_id: `${validator.initialization_id}:g${generation}`,
        validator_type: validator.validator_type,
        league: validator.league,
        parent_lineage_hash: generation === 1 ? founderHash : computeReplayHistoricalAutonomousLeagueHash({
          validator_id: `${validator.initialization_id}:g${generation - 1}`,
          validator_type: validator.validator_type,
          league: validator.league,
          generation: generation - 1,
        }),
        generation,
        lineage_fitness: round(fitness),
        lineage_status: status,
      };
      const hash = computeReplayHistoricalAutonomousLeagueHash(seed);
      return {
        lineage_id: `historical-validator-lineage:${hash}`,
        ...seed,
        lineage_hash: hash,
      };
    });
    return [founder, ...descendants];
  }));
}

function buildEvolutionaryTournaments(
  lineage: readonly ReplayValidatorPopulationLineageRecord[],
  generationCount: number,
): readonly ReplayEvolutionaryTournamentGeneration[] {
  const leagues = unique(lineage.map((record) => record.league));
  return deepFreeze(leagues.flatMap((league) =>
    Array.from({ length: generationCount + 1 }, (_, generation) => {
      const competitors = lineage.filter((record) => record.league === league && record.generation === generation);
      const champion = competitors.slice().sort((left, right) => right.lineage_fitness - left.lineage_fitness || left.validator_id.localeCompare(right.validator_id))[0];
      const seed = {
        league,
        generation,
        competitor_count: competitors.length,
        champion_validator_id: champion?.validator_id ?? "none",
        champion_fitness: round(champion?.lineage_fitness ?? 0),
        average_generation_fitness: round(average(competitors.map((record) => record.lineage_fitness))),
      };
      const hash = computeReplayHistoricalAutonomousLeagueHash(seed);
      return {
        generation_id: `historical-evolutionary-generation:${hash}`,
        ...seed,
        generation_hash: hash,
      };
    })
  ));
}

function buildSurvivalExtinction(
  lineage: readonly ReplayValidatorPopulationLineageRecord[],
  tournaments: readonly ReplayEvolutionaryTournamentGeneration[],
  extinctionThreshold: number,
): readonly ReplayValidatorSurvivalExtinctionCycle[] {
  return deepFreeze(lineage.map((record) => {
    const tournament = tournaments.find((item) => item.league === record.league && item.generation === record.generation);
    const championBoost = tournament?.champion_validator_id === record.validator_id ? 0.08 : 0;
    const survivalScore = clamp01((record.lineage_fitness * 0.84) + (tournament?.average_generation_fitness ?? 0) * 0.16 + championBoost);
    const extinct = survivalScore < extinctionThreshold;
    const seed = {
      validator_id: record.validator_id,
      league: record.league,
      generation: record.generation,
      survival_score: round(survivalScore),
      extinct,
      survival_reason: extinct ? "fitness_below_extinction_threshold" : championBoost > 0 ? "generation_champion" : "population_viable",
    };
    const hash = computeReplayHistoricalAutonomousLeagueHash(seed);
    return {
      cycle_id: `historical-survival-cycle:${hash}`,
      ...seed,
      cycle_hash: hash,
    };
  }));
}

function buildSpecializationMarkets(
  simulation: ReplayHistoricalSimulationRuntimeSnapshot,
  ecosystem: readonly ReplayValidatorLeagueEcosystemRecord[],
): readonly ReplaySpecializationMarketSimulation[] {
  const pairs = unique(simulation.pre_live_initialization.map((record) => `${record.league}|${record.specialization}`));
  return deepFreeze(pairs.map((pair) => {
    const [league, specialization] = pair.split("|");
    const supply = simulation.pre_live_initialization.filter((record) => record.league === league && record.specialization === specialization);
    const marketReaction = average(simulation.market_reaction_scores.filter((record) => record.league === league).map((record) => record.reaction_score));
    const ecosystemFitness = ecosystem.find((record) => record.league === league)?.ecosystem_fitness ?? 0;
    const demand = clamp01((marketReaction * 0.35) + (ecosystemFitness * 0.45) + (1 / Math.max(1, supply.length + 1) * 0.2));
    const seed = {
      league,
      specialization,
      demand_score: round(demand),
      supply_count: supply.length,
      clearing_capital: round(clamp01(demand * average(supply.map((record) => record.initialized_weight)))),
    };
    const hash = computeReplayHistoricalAutonomousLeagueHash(seed);
    return {
      market_id: `historical-specialization-market:${hash}`,
      ...seed,
      market_hash: hash,
    };
  }));
}

function buildCoalitionCollusionDetection(
  lineage: readonly ReplayValidatorPopulationLineageRecord[],
  markets: readonly ReplaySpecializationMarketSimulation[],
): readonly ReplayCoalitionCollusionDetectionRecord[] {
  const groups = unique(lineage.map((record) => `${record.league}|${inferCoalitionKey(record.validator_type)}`));
  return deepFreeze(groups.map((group) => {
    const [league, coalitionKey] = group.split("|");
    const members = lineage.filter((record) => record.league === league && inferCoalitionKey(record.validator_type) === coalitionKey && record.generation > 0);
    const market = markets.find((record) => record.league === league && record.specialization.includes(coalitionKey));
    const correlation = clamp01(average(members.map((record) => record.lineage_fitness)) + (members.length / 500));
    const risk = clamp01((correlation * 0.55) + ((market?.supply_count ?? 0) / Math.max(1, lineage.filter((record) => record.league === league).length) * 0.45));
    const seed = {
      league,
      coalition_key: coalitionKey,
      member_count: members.length,
      correlation_score: round(correlation),
      collusion_risk: round(risk),
      action: risk > 0.72 ? "fork_governance" as const : risk > 0.58 ? "quarantine" as const : "observe" as const,
    };
    const hash = computeReplayHistoricalAutonomousLeagueHash(seed);
    return {
      detection_id: `historical-collusion-detection:${hash}`,
      ...seed,
      detection_hash: hash,
    };
  }));
}

function buildEconomyCapitalAllocation(
  lineage: readonly ReplayValidatorPopulationLineageRecord[],
  markets: readonly ReplaySpecializationMarketSimulation[],
  survival: readonly ReplayValidatorSurvivalExtinctionCycle[],
): readonly ReplayValidatorEconomyCapitalAllocation[] {
  return deepFreeze(lineage.map((record) => {
    const specialization = inferSpecialization(record.validator_type);
    const market = markets.find((item) => item.league === record.league && item.specialization === specialization);
    const survived = survival.find((item) => item.validator_id === record.validator_id && item.generation === record.generation);
    const capital = clamp01(record.lineage_fitness * 0.55 + (market?.clearing_capital ?? 0) * 0.35 + (survived?.extinct ? 0 : 0.1));
    const seed = {
      validator_id: record.validator_id,
      league: record.league,
      specialization,
      fitness_score: record.lineage_fitness,
      intelligence_capital: round(capital),
      capital_action: survived?.extinct ? "retire" as const : capital > 0.68 ? "increase" as const : capital < 0.45 ? "decrease" as const : "seed" as const,
    };
    const hash = computeReplayHistoricalAutonomousLeagueHash(seed);
    return {
      allocation_id: `historical-validator-capital:${hash}`,
      ...seed,
      allocation_hash: hash,
    };
  }));
}

function buildGovernanceForks(
  simulation: ReplayHistoricalSimulationRuntimeSnapshot,
  collusion: readonly ReplayCoalitionCollusionDetectionRecord[],
  tournaments: readonly ReplayEvolutionaryTournamentGeneration[],
): readonly ReplayGovernanceForkSimulationRecord[] {
  const leagues = unique(tournaments.map((record) => record.league));
  return deepFreeze(leagues.map((league) => {
    const risk = average(collusion.filter((record) => record.league === league).map((record) => record.collusion_risk));
    const tournamentFitness = average(tournaments.filter((record) => record.league === league).map((record) => record.champion_fitness));
    const governance = simulation.recursive_governance_adaptation.filter((record) => record.league === league).sort((left, right) => right.recursion_depth - left.recursion_depth)[0];
    const seed = {
      league,
      fork_reason: risk > 0.62 ? "collusion_pressure" : "long_horizon_governance_exploration",
      fork_pressure: round(risk),
      parent_governance_hash: governance?.adaptation_hash ?? simulation.deterministic_hash,
      fork_survival_score: round(clamp01((tournamentFitness * 0.6) + ((1 - risk) * 0.4))),
    };
    const hash = computeReplayHistoricalAutonomousLeagueHash(seed);
    return {
      fork_id: `historical-governance-fork:${hash}`,
      ...seed,
      fork_hash: hash,
    };
  }));
}

function buildHierarchy(
  economy: readonly ReplayValidatorEconomyCapitalAllocation[],
  survival: readonly ReplayValidatorSurvivalExtinctionCycle[],
): readonly ReplayAutonomousIntelligenceHierarchyRecord[] {
  return deepFreeze(economy.map((record) => {
    const survived = survival.find((cycle) => cycle.validator_id === record.validator_id);
    const authority = clamp01((record.fitness_score * 0.55) + (record.intelligence_capital * 0.35) + (survived?.extinct ? 0 : 0.1));
    const tier: ReplayAutonomousIntelligenceHierarchyRecord["tier"] = survived?.extinct ? "extinct" : authority > 0.78 ? "apex" : authority > 0.62 ? "specialist" : authority > 0.45 ? "support" : "probation";
    const seed = {
      validator_id: record.validator_id,
      league: record.league,
      tier,
      authority_score: round(authority),
      delegated_capital: round(record.intelligence_capital * (tier === "apex" ? 1 : tier === "specialist" ? 0.74 : tier === "support" ? 0.48 : 0.12)),
    };
    const hash = computeReplayHistoricalAutonomousLeagueHash(seed);
    return {
      hierarchy_id: `historical-intelligence-hierarchy:${hash}`,
      ...seed,
      hierarchy_hash: hash,
    };
  }));
}

function buildEvolutionaryMemory(
  lineage: readonly ReplayValidatorPopulationLineageRecord[],
  survival: readonly ReplayValidatorSurvivalExtinctionCycle[],
  tournaments: readonly ReplayEvolutionaryTournamentGeneration[],
  generationCount: number,
): readonly ReplayLongHorizonEvolutionaryMemoryRecord[] {
  const leagues = unique(lineage.map((record) => record.league));
  return deepFreeze(leagues.map((league) => {
    const leagueLineage = lineage.filter((record) => record.league === league);
    const eliteCount = leagueLineage.filter((record) => record.lineage_status === "elite").length;
    const extinctCount = survival.filter((record) => record.league === league && record.extinct).length;
    const tournamentFitness = average(tournaments.filter((record) => record.league === league).map((record) => record.champion_fitness));
    const seed = {
      league,
      generation_span: generationCount,
      elite_lineage_count: eliteCount,
      extinct_lineage_count: extinctCount,
      memory_fitness: round(clamp01((eliteCount / Math.max(1, leagueLineage.length) * 0.35) + (tournamentFitness * 0.55) + ((1 - extinctCount / Math.max(1, leagueLineage.length)) * 0.1))),
    };
    const hash = computeReplayHistoricalAutonomousLeagueHash(seed);
    return {
      memory_id: `historical-evolutionary-memory:${hash}`,
      ...seed,
      memory_hash: hash,
    };
  }));
}

function buildLivePromotionCriteria(
  hierarchy: readonly ReplayAutonomousIntelligenceHierarchyRecord[],
  survival: readonly ReplayValidatorSurvivalExtinctionCycle[],
  collusion: readonly ReplayCoalitionCollusionDetectionRecord[],
  promotionThreshold: number,
): readonly ReplaySimulationToLivePromotionCriteria[] {
  return deepFreeze(hierarchy.map((record) => {
    const survived = survival.find((cycle) => cycle.validator_id === record.validator_id);
    const risk = average(collusion.filter((item) => item.league === record.league).map((item) => item.collusion_risk));
    const promotionScore = clamp01((record.authority_score * 0.58) + ((survived?.survival_score ?? 0) * 0.32) + ((1 - risk) * 0.1));
    const promoted = promotionScore >= promotionThreshold && record.tier !== "extinct" && risk < 0.75;
    const seed = {
      validator_id: record.validator_id,
      league: record.league,
      promotion_score: round(promotionScore),
      promoted,
      criteria_reason: promoted ? "elite_lineage_survived_historical_league" : risk >= 0.75 ? "collusion_risk_blocks_promotion" : "promotion_threshold_not_met",
    };
    const hash = computeReplayHistoricalAutonomousLeagueHash(seed);
    return {
      promotion_id: `historical-live-promotion:${hash}`,
      ...seed,
      promotion_hash: hash,
    };
  }));
}

function buildEvolutionaryAudit(records: {
  readonly ecosystem: readonly ReplayValidatorLeagueEcosystemRecord[];
  readonly lineage: readonly ReplayValidatorPopulationLineageRecord[];
  readonly tournaments: readonly ReplayEvolutionaryTournamentGeneration[];
  readonly survival: readonly ReplayValidatorSurvivalExtinctionCycle[];
  readonly markets: readonly ReplaySpecializationMarketSimulation[];
  readonly collusion: readonly ReplayCoalitionCollusionDetectionRecord[];
  readonly economy: readonly ReplayValidatorEconomyCapitalAllocation[];
  readonly forks: readonly ReplayGovernanceForkSimulationRecord[];
  readonly hierarchy: readonly ReplayAutonomousIntelligenceHierarchyRecord[];
  readonly memory: readonly ReplayLongHorizonEvolutionaryMemoryRecord[];
  readonly promotion: readonly ReplaySimulationToLivePromotionCriteria[];
}): readonly ReplayDeterministicEvolutionaryAuditRecord[] {
  const sources: readonly { readonly kind: ReplayDeterministicEvolutionaryAuditRecord["audit_kind"]; readonly hash: string }[] = [
    ...records.ecosystem.map((record) => ({ kind: "ecosystem" as const, hash: record.ecosystem_hash })),
    ...records.lineage.map((record) => ({ kind: "lineage" as const, hash: record.lineage_hash })),
    ...records.tournaments.map((record) => ({ kind: "tournament" as const, hash: record.generation_hash })),
    ...records.survival.map((record) => ({ kind: "survival" as const, hash: record.cycle_hash })),
    ...records.markets.map((record) => ({ kind: "market" as const, hash: record.market_hash })),
    ...records.collusion.map((record) => ({ kind: "collusion" as const, hash: record.detection_hash })),
    ...records.economy.map((record) => ({ kind: "economy" as const, hash: record.allocation_hash })),
    ...records.forks.map((record) => ({ kind: "governance" as const, hash: record.fork_hash })),
    ...records.hierarchy.map((record) => ({ kind: "hierarchy" as const, hash: record.hierarchy_hash })),
    ...records.memory.map((record) => ({ kind: "memory" as const, hash: record.memory_hash })),
    ...records.promotion.map((record) => ({ kind: "promotion" as const, hash: record.promotion_hash })),
  ];
  return deepFreeze(sources.map((source) => {
    const seed = {
      audit_kind: source.kind,
      source_hash: source.hash,
      replay_safe: source.hash.length === 64,
      deterministic_hash_verified: computeReplayHistoricalAutonomousLeagueHash({ source_hash: source.hash }).length === 64,
    };
    const hash = computeReplayHistoricalAutonomousLeagueHash(seed);
    return {
      audit_id: `historical-evolutionary-audit:${hash}`,
      ...seed,
      audit_hash: hash,
    };
  }));
}

function classifyLeagueState(
  promotion: readonly ReplaySimulationToLivePromotionCriteria[],
  survival: readonly ReplayValidatorSurvivalExtinctionCycle[],
  collusion: readonly ReplayCoalitionCollusionDetectionRecord[],
  forks: readonly ReplayGovernanceForkSimulationRecord[],
): ReplayHistoricalAutonomousLeagueState {
  if (promotion.some((record) => record.promoted)) return "promoting";
  if (forks.some((record) => record.fork_pressure > 0.65)) return "forking";
  if (collusion.some((record) => record.action !== "observe")) return "competing";
  if (survival.some((record) => record.extinct)) return "surviving";
  if (promotion.length === 0) return "unstable";
  return "evolving";
}

function persistReplayHistoricalAutonomousLeagueSnapshot(
  db: SqliteDatabase,
  snapshot: ReplayHistoricalAutonomousLeagueSnapshot,
): void {
  const write = db.transaction(() => {
    db.prepare(`
      INSERT OR REPLACE INTO replay_historical_autonomous_league_snapshots
      (autonomous_league_id, simulation_id, generated_at, persisted_at, state, deterministic_hash, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(snapshot.autonomous_league_id, snapshot.simulation_id, snapshot.generated_at, snapshot.persisted_at, snapshot.state, snapshot.deterministic_hash, stableLeagueStringify(snapshot));
    for (const record of snapshot.ecosystem) persistView(db, snapshot, "ecosystem", record.ecosystem_id, record.ecosystem_hash, record);
    for (const record of snapshot.population_lineage) persistView(db, snapshot, "population_lineage", record.lineage_id, record.lineage_hash, record);
    for (const record of snapshot.evolutionary_tournaments) persistView(db, snapshot, "evolutionary_tournaments", record.generation_id, record.generation_hash, record);
    for (const record of snapshot.survival_extinction_cycles) persistView(db, snapshot, "survival_extinction_cycles", record.cycle_id, record.cycle_hash, record);
    for (const record of snapshot.specialization_markets) persistView(db, snapshot, "specialization_markets", record.market_id, record.market_hash, record);
    for (const record of snapshot.coalition_collusion_detection) persistView(db, snapshot, "coalition_collusion_detection", record.detection_id, record.detection_hash, record);
    for (const record of snapshot.economy_capital_allocation) persistView(db, snapshot, "economy_capital_allocation", record.allocation_id, record.allocation_hash, record);
    for (const record of snapshot.governance_forks) persistView(db, snapshot, "governance_forks", record.fork_id, record.fork_hash, record);
    for (const record of snapshot.intelligence_hierarchy) persistView(db, snapshot, "intelligence_hierarchy", record.hierarchy_id, record.hierarchy_hash, record);
    for (const record of snapshot.evolutionary_memory) persistView(db, snapshot, "evolutionary_memory", record.memory_id, record.memory_hash, record);
    for (const record of snapshot.live_promotion_criteria) persistView(db, snapshot, "live_promotion_criteria", record.promotion_id, record.promotion_hash, record);
    for (const record of snapshot.evolutionary_audit) persistView(db, snapshot, "evolutionary_audit", record.audit_id, record.audit_hash, record);
  });
  write();
}

function persistView(
  db: SqliteDatabase,
  snapshot: ReplayHistoricalAutonomousLeagueSnapshot,
  viewKind: string,
  viewId: string,
  viewHash: string,
  payload: unknown,
): void {
  db.prepare(`
    INSERT OR REPLACE INTO replay_historical_autonomous_league_views
    (view_id, autonomous_league_id, view_kind, view_hash, payload)
    VALUES (?, ?, ?, ?, ?)
  `).run(viewId, snapshot.autonomous_league_id, viewKind, viewHash, stableLeagueStringify(payload));
}

function getLeagueViewList<T>(db: SqliteDatabase, autonomousLeagueId: string, viewKind: string): readonly T[] {
  initializeReplayHistoricalAutonomousLeagueSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_historical_autonomous_league_views
    WHERE autonomous_league_id = ? AND view_kind = ?
    ORDER BY view_hash ASC
  `).all(autonomousLeagueId, viewKind) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as T));
}

function validatorFitness(
  validator: ReplayPreLiveRuntimeInitializationSnapshot,
  simulation: ReplayHistoricalSimulationRuntimeSnapshot,
  generation: number,
): number {
  const survivability = average(simulation.survivability_simulation.filter((record) => record.league === validator.league).map((record) => record.survivability_score));
  const market = average(simulation.market_reaction_scores.filter((record) => record.league === validator.league).map((record) => record.reaction_score));
  const mutation = simulation.validator_mutation_tests.find((record) => record.league === validator.league && record.validator_type === validator.validator_type);
  const mutationScore = mutation?.mutation_survived ? mutation.mutated_trust : (mutation?.mutated_trust ?? 0) * 0.65;
  return clamp01((validator.initialized_trust * 0.42) + (validator.initialized_weight * 0.18) + (survivability * 0.18) + (market * 0.12) + (mutationScore * 0.1) + (generation * 0.01));
}

function inferSpecialization(validatorType: string): string {
  if (validatorType.includes("injury")) return "injury_reliability";
  if (validatorType.includes("odds") || validatorType.includes("market")) return "market_reaction";
  if (validatorType.includes("source")) return "source_authenticity";
  if (validatorType.includes("consensus")) return "consensus_convergence";
  if (validatorType.includes("outcome")) return "settlement_accuracy";
  return "general_replay_intelligence";
}

function inferCoalitionKey(validatorType: string): string {
  return inferSpecialization(validatorType).split("_")[0] ?? "general";
}

function deterministicProbability(seed: string): number {
  const hash = computeReplayHistoricalAutonomousLeagueHash(seed).slice(0, 12);
  return parseInt(hash, 16) / 0xffffffffffff;
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

function stableLeagueStringify(value: unknown): string {
  return JSON.stringify(sortLeagueKeys(value));
}

function sortLeagueKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortLeagueKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortLeagueKeys((value as Record<string, unknown>)[key]);
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
