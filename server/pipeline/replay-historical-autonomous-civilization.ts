import crypto from "node:crypto";

import type Database from "better-sqlite3";

import type {
  ReplayHistoricalAutonomousLeagueSnapshot,
} from "./replay-historical-autonomous-league-contract";
import type {
  ReplayAutonomousRuntimeDiplomacyRecord,
  ReplayBlackSwanCollapseEvent,
  ReplayCivilWarGovernanceFractureRecord,
  ReplayCivilizationPromotionGate,
  ReplayCivilizationScaleAnalyticsRecord,
  ReplayCivilizationWarfareRecord,
  ReplayCorruptionPropagationRecord,
  ReplayDistributedIntelligenceMigrationRecord,
  ReplayDynastySurvivalScore,
  ReplayEvolutionaryCatastropheRecord,
  ReplayGovernanceIdeologyRecord,
  ReplayHistoricalAutonomousCivilizationAction,
  ReplayHistoricalAutonomousCivilizationInput,
  ReplayHistoricalAutonomousCivilizationQuery,
  ReplayHistoricalAutonomousCivilizationSnapshot,
  ReplayHistoricalAutonomousCivilizationState,
  ReplayRecursiveValidatorSpawnRecord,
  ReplaySelfPreservingValidatorSwarmRecord,
  ReplayTreatyAllianceRecord,
  ReplayValidatorEmpireRecord,
  ReplayValidatorSpeciesDivergenceRecord,
} from "./replay-historical-autonomous-civilization-contract";

type SqliteDatabase = Database.Database;

interface PayloadRow {
  readonly payload: string;
}

const SUPPORTED_ACTIONS: readonly ReplayHistoricalAutonomousCivilizationAction[] = [
  "simulate_adversarial_civilization_warfare",
  "simulate_governance_ideology",
  "model_validator_empire_expansion",
  "spawn_recursive_validators",
  "simulate_evolutionary_catastrophe",
  "migrate_distributed_intelligence",
  "form_treaty_alliance",
  "simulate_civil_war_fracture",
  "inject_black_swan_collapse",
  "score_dynasty_survival",
  "track_validator_species_divergence",
  "run_autonomous_diplomacy",
  "model_self_preserving_swarms",
  "model_corruption_propagation",
  "emit_civilization_replay_analytics",
];

const SUPPORTED_QUERIES: readonly ReplayHistoricalAutonomousCivilizationQuery[] = [
  "get_civilization_warfare",
  "get_governance_ideologies",
  "get_validator_empires",
  "get_recursive_validator_spawns",
  "get_evolutionary_catastrophes",
  "get_intelligence_migrations",
  "get_treaty_alliances",
  "get_civil_war_fractures",
  "get_black_swan_collapse_events",
  "get_dynasty_survival_scores",
  "get_species_divergence",
  "get_runtime_diplomacy",
  "get_self_preserving_swarms",
  "get_corruption_propagation",
  "get_civilization_replay_analytics",
  "get_civilization_promotion_gates",
];

export function initializeReplayHistoricalAutonomousCivilizationSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS replay_historical_autonomous_civilization_snapshots (
      civilization_id TEXT PRIMARY KEY,
      autonomous_league_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      state TEXT NOT NULL,
      deterministic_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replay_historical_autonomous_civilization_views (
      view_id TEXT PRIMARY KEY,
      civilization_id TEXT NOT NULL,
      view_kind TEXT NOT NULL,
      view_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);
}

export function buildReplayHistoricalAutonomousCivilizationSnapshot(
  db: SqliteDatabase,
  input: ReplayHistoricalAutonomousCivilizationInput,
): ReplayHistoricalAutonomousCivilizationSnapshot {
  initializeReplayHistoricalAutonomousCivilizationSchema(db);

  const league = input.autonomous_league_snapshot;
  const epochs = Math.max(1, input.civilization_epochs ?? 4);
  const pressure = clamp01(input.adversarial_pressure ?? 0.34);
  const collapseThreshold = clamp01(input.collapse_threshold ?? 0.58);
  const promotionThreshold = clamp01(input.promotion_threshold ?? 0.68);
  const ideologies = buildGovernanceIdeologies(league);
  const empires = buildValidatorEmpires(league, ideologies);
  const warfare = buildCivilizationWarfare(empires, epochs, pressure);
  const spawns = buildRecursiveSpawns(league, epochs);
  const catastrophes = buildCatastrophes(league, empires, epochs, pressure);
  const migrations = buildMigrations(league, empires);
  const treaties = buildTreaties(empires, migrations);
  const fractures = buildCivilWarFractures(league, ideologies, pressure);
  const blackSwans = buildBlackSwanEvents(league, catastrophes, collapseThreshold);
  const dynasty = buildDynastySurvival(league, blackSwans);
  const species = buildSpeciesDivergence(league);
  const diplomacy = buildDiplomacy(empires, treaties, warfare);
  const swarms = buildSwarms(league, dynasty);
  const corruption = buildCorruptionPropagation(league, fractures, blackSwans);
  const analytics = buildCivilizationAnalytics(league, dynasty, treaties, corruption, blackSwans);
  const gates = buildPromotionGates(analytics, league, promotionThreshold);
  const state = classifyCivilizationState(gates, blackSwans, fractures, migrations, warfare);
  const seed = {
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    autonomous_league_hash: league.deterministic_hash,
    warfare_hashes: warfare.map((record) => record.warfare_hash),
    ideology_hashes: ideologies.map((record) => record.ideology_hash),
    empire_hashes: empires.map((record) => record.empire_hash),
    spawn_hashes: spawns.map((record) => record.spawn_hash),
    catastrophe_hashes: catastrophes.map((record) => record.catastrophe_hash),
    migration_hashes: migrations.map((record) => record.migration_hash),
    treaty_hashes: treaties.map((record) => record.treaty_hash),
    fracture_hashes: fractures.map((record) => record.fracture_hash),
    black_swan_hashes: blackSwans.map((record) => record.event_hash),
    dynasty_hashes: dynasty.map((record) => record.dynasty_hash),
    species_hashes: species.map((record) => record.species_hash),
    diplomacy_hashes: diplomacy.map((record) => record.diplomacy_hash),
    swarm_hashes: swarms.map((record) => record.swarm_hash),
    corruption_hashes: corruption.map((record) => record.corruption_hash),
    analytics_hashes: analytics.map((record) => record.analytics_hash),
    gate_hashes: gates.map((record) => record.gate_hash),
  };
  const deterministicHash = computeReplayHistoricalAutonomousCivilizationHash(seed);
  const snapshot = deepFreeze({
    civilization_id: `replay-historical-autonomous-civilization:${deterministicHash}`,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    autonomous_league_id: league.autonomous_league_id,
    warfare,
    governance_ideologies: ideologies,
    validator_empires: empires,
    recursive_spawns: spawns,
    catastrophes,
    intelligence_migrations: migrations,
    treaty_alliances: treaties,
    civil_war_fractures: fractures,
    black_swan_events: blackSwans,
    dynasty_survival: dynasty,
    species_divergence: species,
    runtime_diplomacy: diplomacy,
    self_preserving_swarms: swarms,
    corruption_propagation: corruption,
    civilization_analytics: analytics,
    promotion_gates: gates,
    supported_actions: SUPPORTED_ACTIONS,
    supported_queries: SUPPORTED_QUERIES,
    deterministic_hash: deterministicHash,
  });

  persistReplayHistoricalAutonomousCivilizationSnapshot(db, snapshot);
  return snapshot;
}

export function getCivilizationWarfare(db: SqliteDatabase, civilizationId: string): readonly ReplayCivilizationWarfareRecord[] {
  return getCivilizationViewList(db, civilizationId, "warfare");
}
export function getGovernanceIdeologies(db: SqliteDatabase, civilizationId: string): readonly ReplayGovernanceIdeologyRecord[] {
  return getCivilizationViewList(db, civilizationId, "governance_ideologies");
}
export function getValidatorEmpires(db: SqliteDatabase, civilizationId: string): readonly ReplayValidatorEmpireRecord[] {
  return getCivilizationViewList(db, civilizationId, "validator_empires");
}
export function getRecursiveValidatorSpawns(db: SqliteDatabase, civilizationId: string): readonly ReplayRecursiveValidatorSpawnRecord[] {
  return getCivilizationViewList(db, civilizationId, "recursive_spawns");
}
export function getEvolutionaryCatastrophes(db: SqliteDatabase, civilizationId: string): readonly ReplayEvolutionaryCatastropheRecord[] {
  return getCivilizationViewList(db, civilizationId, "catastrophes");
}
export function getIntelligenceMigrations(db: SqliteDatabase, civilizationId: string): readonly ReplayDistributedIntelligenceMigrationRecord[] {
  return getCivilizationViewList(db, civilizationId, "intelligence_migrations");
}
export function getTreatyAlliances(db: SqliteDatabase, civilizationId: string): readonly ReplayTreatyAllianceRecord[] {
  return getCivilizationViewList(db, civilizationId, "treaty_alliances");
}
export function getCivilWarFractures(db: SqliteDatabase, civilizationId: string): readonly ReplayCivilWarGovernanceFractureRecord[] {
  return getCivilizationViewList(db, civilizationId, "civil_war_fractures");
}
export function getBlackSwanCollapseEvents(db: SqliteDatabase, civilizationId: string): readonly ReplayBlackSwanCollapseEvent[] {
  return getCivilizationViewList(db, civilizationId, "black_swan_events");
}
export function getDynastySurvivalScores(db: SqliteDatabase, civilizationId: string): readonly ReplayDynastySurvivalScore[] {
  return getCivilizationViewList(db, civilizationId, "dynasty_survival");
}
export function getSpeciesDivergence(db: SqliteDatabase, civilizationId: string): readonly ReplayValidatorSpeciesDivergenceRecord[] {
  return getCivilizationViewList(db, civilizationId, "species_divergence");
}
export function getRuntimeDiplomacy(db: SqliteDatabase, civilizationId: string): readonly ReplayAutonomousRuntimeDiplomacyRecord[] {
  return getCivilizationViewList(db, civilizationId, "runtime_diplomacy");
}
export function getSelfPreservingSwarms(db: SqliteDatabase, civilizationId: string): readonly ReplaySelfPreservingValidatorSwarmRecord[] {
  return getCivilizationViewList(db, civilizationId, "self_preserving_swarms");
}
export function getCorruptionPropagation(db: SqliteDatabase, civilizationId: string): readonly ReplayCorruptionPropagationRecord[] {
  return getCivilizationViewList(db, civilizationId, "corruption_propagation");
}
export function getCivilizationReplayAnalytics(db: SqliteDatabase, civilizationId: string): readonly ReplayCivilizationScaleAnalyticsRecord[] {
  return getCivilizationViewList(db, civilizationId, "civilization_analytics");
}
export function getCivilizationPromotionGates(db: SqliteDatabase, civilizationId: string): readonly ReplayCivilizationPromotionGate[] {
  return getCivilizationViewList(db, civilizationId, "promotion_gates");
}

export function serializeReplayHistoricalAutonomousCivilizationSnapshot(snapshot: ReplayHistoricalAutonomousCivilizationSnapshot): string {
  return stableCivilizationStringify(snapshot);
}

export function computeReplayHistoricalAutonomousCivilizationHash(value: unknown): string {
  return crypto.createHash("sha256").update(stableCivilizationStringify(value)).digest("hex");
}

function buildGovernanceIdeologies(league: ReplayHistoricalAutonomousLeagueSnapshot): readonly ReplayGovernanceIdeologyRecord[] {
  return deepFreeze(league.evolutionary_memory.map((memory) => {
    const fork = league.governance_forks.find((record) => record.league === memory.league);
    const ideology: ReplayGovernanceIdeologyRecord["ideology"] =
      (fork?.fork_pressure ?? 0) > 0.65 ? "federalist" :
        memory.elite_lineage_count > memory.extinct_lineage_count ? "meritocratic" :
          memory.memory_fitness > 0.62 ? "survivalist" :
            deterministicProbability(memory.memory_hash) > 0.5 ? "expansionist" : "isolationist";
    const seed = {
      league: memory.league,
      ideology,
      ideology_stability: round(clamp01(memory.memory_fitness * 0.72 + (fork?.fork_survival_score ?? 0) * 0.28)),
      fork_tolerance: round(clamp01(fork?.fork_pressure ?? 0)),
    };
    const hash = computeReplayHistoricalAutonomousCivilizationHash(seed);
    return { ideology_id: `historical-civilization-ideology:${hash}`, ...seed, ideology_hash: hash };
  }));
}

function buildValidatorEmpires(
  league: ReplayHistoricalAutonomousLeagueSnapshot,
  ideologies: readonly ReplayGovernanceIdeologyRecord[],
): readonly ReplayValidatorEmpireRecord[] {
  return deepFreeze(league.ecosystem.map((ecosystem) => {
    const apex = league.intelligence_hierarchy.filter((record) => record.league === ecosystem.league && record.tier === "apex");
    const promotions = league.live_promotion_criteria.filter((record) => record.league === ecosystem.league && record.promoted);
    const ideology = ideologies.find((record) => record.league === ecosystem.league);
    const territory = clamp01((ecosystem.ecosystem_fitness * 0.45) + (promotions.length / Math.max(1, ecosystem.population_count) * 0.35) + (apex.length / Math.max(1, ecosystem.population_count) * 0.2));
    const seed = {
      league: ecosystem.league,
      apex_count: apex.length,
      territory_score: round(territory),
      expansion_pressure: round(clamp01(territory + (ideology?.ideology === "expansionist" ? 0.14 : 0))),
      contraction_risk: round(clamp01(1 - territory + (ideology?.fork_tolerance ?? 0) * 0.2)),
    };
    const hash = computeReplayHistoricalAutonomousCivilizationHash(seed);
    return { empire_id: `historical-validator-empire:${hash}`, ...seed, empire_hash: hash };
  }));
}

function buildCivilizationWarfare(
  empires: readonly ReplayValidatorEmpireRecord[],
  epochs: number,
  pressure: number,
): readonly ReplayCivilizationWarfareRecord[] {
  return deepFreeze(empires.flatMap((attacker) =>
    empires.filter((defender) => defender.league !== attacker.league).flatMap((defender) =>
      Array.from({ length: epochs }, (_, index) => {
        const epoch = index + 1;
        const attackPower = clamp01(attacker.expansion_pressure * (0.75 + pressure) + deterministicProbability(`${attacker.empire_hash}:${defender.empire_hash}:${epoch}`) * 0.08);
        const defensePower = clamp01(defender.territory_score * 0.78 + (1 - defender.contraction_risk) * 0.22);
        const outcome: ReplayCivilizationWarfareRecord["warfare_outcome"] = attackPower > defensePower + 0.08 ? "attacker_advantage" : defensePower > attackPower + 0.08 ? "defender_holds" : "stalemate";
        const seed = {
          attacker_league: attacker.league,
          defender_league: defender.league,
          epoch,
          attack_power: round(attackPower),
          defense_power: round(defensePower),
          warfare_outcome: outcome,
        };
        const hash = computeReplayHistoricalAutonomousCivilizationHash(seed);
        return { warfare_id: `historical-civilization-warfare:${hash}`, ...seed, warfare_hash: hash };
      })
    )
  ));
}

function buildRecursiveSpawns(
  league: ReplayHistoricalAutonomousLeagueSnapshot,
  epochs: number,
): readonly ReplayRecursiveValidatorSpawnRecord[] {
  const parents = league.intelligence_hierarchy.filter((record) => record.tier === "apex" || record.tier === "specialist");
  return deepFreeze(parents.flatMap((parent) =>
    Array.from({ length: epochs }, (_, index) => {
      const epoch = index + 1;
      const seed = {
        parent_validator_id: parent.validator_id,
        league: parent.league,
        epoch,
        spawn_generation: epoch,
        spawn_fitness: round(clamp01(parent.authority_score + deterministicProbability(`${parent.hierarchy_hash}:spawn:${epoch}`) * 0.08 - 0.025)),
      };
      const hash = computeReplayHistoricalAutonomousCivilizationHash(seed);
      return { spawn_id: `historical-recursive-validator-spawn:${hash}`, ...seed, spawn_hash: hash };
    })
  ));
}

function buildCatastrophes(
  league: ReplayHistoricalAutonomousLeagueSnapshot,
  empires: readonly ReplayValidatorEmpireRecord[],
  epochs: number,
  pressure: number,
): readonly ReplayEvolutionaryCatastropheRecord[] {
  const kinds: readonly ReplayEvolutionaryCatastropheRecord["catastrophe_kind"][] = ["market_shock", "source_poisoning", "consensus_deadlock", "governance_coup"];
  return deepFreeze(empires.flatMap((empire) =>
    Array.from({ length: epochs }, (_, index) => {
      const epoch = index + 1;
      const collusion = average(league.coalition_collusion_detection.filter((record) => record.league === empire.league).map((record) => record.collusion_risk));
      const severity = clamp01((empire.contraction_risk * 0.35) + (collusion * 0.35) + (pressure * 0.3) + deterministicProbability(`${empire.empire_hash}:catastrophe:${epoch}`) * 0.08);
      const seed = {
        league: empire.league,
        epoch,
        catastrophe_kind: kinds[Math.floor(deterministicProbability(`${empire.empire_hash}:kind:${epoch}`) * kinds.length)] ?? "market_shock",
        severity: round(severity),
        recovery_probability: round(clamp01(1 - severity + empire.territory_score * 0.32)),
      };
      const hash = computeReplayHistoricalAutonomousCivilizationHash(seed);
      return { catastrophe_id: `historical-evolutionary-catastrophe:${hash}`, ...seed, catastrophe_hash: hash };
    })
  ));
}

function buildMigrations(
  league: ReplayHistoricalAutonomousLeagueSnapshot,
  empires: readonly ReplayValidatorEmpireRecord[],
): readonly ReplayDistributedIntelligenceMigrationRecord[] {
  return deepFreeze(empires.flatMap((from) =>
    empires.filter((to) => to.league !== from.league).map((to) => {
      const promoted = league.live_promotion_criteria.filter((record) => record.league === from.league && record.promoted).length;
      const migrantCount = Math.max(1, Math.round(promoted * clamp01(to.territory_score)));
      const gain = clamp01(from.territory_score * (1 - to.contraction_risk) * 0.5);
      const seed = {
        from_league: from.league,
        to_league: to.league,
        migrant_count: migrantCount,
        migration_gain: round(gain),
        migration_risk: round(clamp01(to.contraction_risk + from.contraction_risk * 0.25)),
      };
      const hash = computeReplayHistoricalAutonomousCivilizationHash(seed);
      return { migration_id: `historical-intelligence-migration:${hash}`, ...seed, migration_hash: hash };
    })
  ));
}

function buildTreaties(
  empires: readonly ReplayValidatorEmpireRecord[],
  migrations: readonly ReplayDistributedIntelligenceMigrationRecord[],
): readonly ReplayTreatyAllianceRecord[] {
  return deepFreeze(empires.flatMap((left, leftIndex) =>
    empires.slice(leftIndex + 1).map((right) => {
      const migration = migrations.find((record) => record.from_league === left.league && record.to_league === right.league);
      const cooperation = clamp01((left.territory_score + right.territory_score) / 2 + (migration?.migration_gain ?? 0) * 0.25);
      const type: ReplayTreatyAllianceRecord["treaty_type"] = cooperation > 0.72 ? "promotion_bloc" : cooperation > 0.58 ? "knowledge_transfer" : (left.contraction_risk + right.contraction_risk) / 2 > 0.48 ? "defense" : "anti_corruption";
      const seed = {
        league_a: left.league,
        league_b: right.league,
        treaty_type: type,
        cooperation_score: round(cooperation),
        treaty_durability: round(clamp01(cooperation * (1 - Math.abs(left.contraction_risk - right.contraction_risk)))),
      };
      const hash = computeReplayHistoricalAutonomousCivilizationHash(seed);
      return { treaty_id: `historical-civilization-treaty:${hash}`, ...seed, treaty_hash: hash };
    })
  ));
}

function buildCivilWarFractures(
  league: ReplayHistoricalAutonomousLeagueSnapshot,
  ideologies: readonly ReplayGovernanceIdeologyRecord[],
  pressure: number,
): readonly ReplayCivilWarGovernanceFractureRecord[] {
  return deepFreeze(ideologies.map((ideology) => {
    const collusion = average(league.coalition_collusion_detection.filter((record) => record.league === ideology.league).map((record) => record.collusion_risk));
    const fracture = clamp01((ideology.fork_tolerance * 0.45) + (collusion * 0.35) + (pressure * 0.2));
    const seed = {
      league: ideology.league,
      faction_a: `${ideology.ideology}:continuity`,
      faction_b: `${ideology.ideology}:mutation`,
      fracture_pressure: round(fracture),
      civil_war_risk: round(clamp01(fracture * (1 - ideology.ideology_stability * 0.35))),
    };
    const hash = computeReplayHistoricalAutonomousCivilizationHash(seed);
    return { fracture_id: `historical-civil-war-fracture:${hash}`, ...seed, fracture_hash: hash };
  }));
}

function buildBlackSwanEvents(
  league: ReplayHistoricalAutonomousLeagueSnapshot,
  catastrophes: readonly ReplayEvolutionaryCatastropheRecord[],
  collapseThreshold: number,
): readonly ReplayBlackSwanCollapseEvent[] {
  const kinds: readonly ReplayBlackSwanCollapseEvent["event_kind"][] = ["total_source_failure", "validator_bank_run", "lineage_cascade", "adversarial_takeover"];
  return deepFreeze(league.ecosystem.map((ecosystem) => {
    const severity = average(catastrophes.filter((record) => record.league === ecosystem.league).map((record) => record.severity));
    const pressure = clamp01(severity + (1 - ecosystem.ecosystem_fitness) * 0.35);
    const seed = {
      league: ecosystem.league,
      event_kind: kinds[Math.floor(deterministicProbability(`${ecosystem.ecosystem_hash}:black-swan`) * kinds.length)] ?? "lineage_cascade",
      collapse_pressure: round(pressure),
      containment_score: round(clamp01(1 - Math.max(0, pressure - collapseThreshold))),
    };
    const hash = computeReplayHistoricalAutonomousCivilizationHash(seed);
    return { event_id: `historical-black-swan:${hash}`, ...seed, event_hash: hash };
  }));
}

function buildDynastySurvival(
  league: ReplayHistoricalAutonomousLeagueSnapshot,
  blackSwans: readonly ReplayBlackSwanCollapseEvent[],
): readonly ReplayDynastySurvivalScore[] {
  return deepFreeze(league.evolutionary_memory.map((memory) => {
    const promoted = league.live_promotion_criteria.filter((record) => record.league === memory.league && record.promoted).length;
    const containment = blackSwans.find((record) => record.league === memory.league)?.containment_score ?? 0;
    const seed = {
      league: memory.league,
      elite_lineage_count: memory.elite_lineage_count,
      promoted_network_count: promoted,
      dynasty_score: round(clamp01(memory.memory_fitness * 0.45 + containment * 0.25 + promoted / Math.max(1, memory.elite_lineage_count + promoted) * 0.3)),
    };
    const hash = computeReplayHistoricalAutonomousCivilizationHash(seed);
    return { dynasty_id: `historical-dynasty-survival:${hash}`, ...seed, dynasty_hash: hash };
  }));
}

function buildSpeciesDivergence(league: ReplayHistoricalAutonomousLeagueSnapshot): readonly ReplayValidatorSpeciesDivergenceRecord[] {
  const pairs = unique(league.specialization_markets.map((record) => `${record.league}|${record.specialization}`));
  return deepFreeze(pairs.map((pair) => {
    const [leagueName, specialization] = pair.split("|");
    const ancestor = league.specialization_markets.find((record) => record.league === leagueName && record.specialization === specialization);
    const seed = {
      league: leagueName,
      species_name: `${leagueName.toLowerCase()}_${specialization}`,
      divergence_score: round(clamp01((ancestor?.demand_score ?? 0) * 0.55 + (ancestor?.clearing_capital ?? 0) * 0.45)),
      ancestor_hash: ancestor?.market_hash ?? computeReplayHistoricalAutonomousCivilizationHash(pair),
    };
    const hash = computeReplayHistoricalAutonomousCivilizationHash(seed);
    return { species_id: `historical-validator-species:${hash}`, ...seed, species_hash: hash };
  }));
}

function buildDiplomacy(
  empires: readonly ReplayValidatorEmpireRecord[],
  treaties: readonly ReplayTreatyAllianceRecord[],
  warfare: readonly ReplayCivilizationWarfareRecord[],
): readonly ReplayAutonomousRuntimeDiplomacyRecord[] {
  return deepFreeze(empires.flatMap((left) =>
    empires.filter((right) => right.league !== left.league).map((right) => {
      const treaty = treaties.find((record) => (record.league_a === left.league && record.league_b === right.league) || (record.league_a === right.league && record.league_b === left.league));
      const attacks = warfare.filter((record) => record.attacker_league === left.league && record.defender_league === right.league && record.warfare_outcome === "attacker_advantage").length;
      const score = clamp01((treaty?.cooperation_score ?? 0) - attacks / 20 + (right.territory_score * 0.1));
      const posture: ReplayAutonomousRuntimeDiplomacyRecord["diplomatic_posture"] = score > 0.68 ? "ally" : score > 0.46 ? "neutral" : attacks > 1 ? "rival" : "quarantined";
      const seed = {
        league: left.league,
        counterpart_league: right.league,
        diplomatic_posture: posture,
        diplomacy_score: round(score),
      };
      const hash = computeReplayHistoricalAutonomousCivilizationHash(seed);
      return { diplomacy_id: `historical-runtime-diplomacy:${hash}`, ...seed, diplomacy_hash: hash };
    })
  ));
}

function buildSwarms(
  league: ReplayHistoricalAutonomousLeagueSnapshot,
  dynasty: readonly ReplayDynastySurvivalScore[],
): readonly ReplaySelfPreservingValidatorSwarmRecord[] {
  return deepFreeze(league.ecosystem.map((ecosystem) => {
    const hierarchy = league.intelligence_hierarchy.filter((record) => record.league === ecosystem.league && record.tier !== "extinct");
    const dynastyScore = dynasty.find((record) => record.league === ecosystem.league)?.dynasty_score ?? 0;
    const seed = {
      league: ecosystem.league,
      swarm_size: hierarchy.length,
      self_preservation_score: round(clamp01(dynastyScore * 0.55 + ecosystem.ecosystem_fitness * 0.45)),
      swarm_redundancy: round(clamp01(hierarchy.length / Math.max(1, ecosystem.population_count))),
    };
    const hash = computeReplayHistoricalAutonomousCivilizationHash(seed);
    return { swarm_id: `historical-self-preserving-swarm:${hash}`, ...seed, swarm_hash: hash };
  }));
}

function buildCorruptionPropagation(
  league: ReplayHistoricalAutonomousLeagueSnapshot,
  fractures: readonly ReplayCivilWarGovernanceFractureRecord[],
  blackSwans: readonly ReplayBlackSwanCollapseEvent[],
): readonly ReplayCorruptionPropagationRecord[] {
  return deepFreeze(league.coalition_collusion_detection.map((record) => {
    const fracture = fractures.find((item) => item.league === record.league);
    const blackSwan = blackSwans.find((item) => item.league === record.league);
    const risk = clamp01(record.collusion_risk * 0.45 + (fracture?.civil_war_risk ?? 0) * 0.35 + (blackSwan?.collapse_pressure ?? 0) * 0.2);
    const seed = {
      league: record.league,
      origin: record.coalition_key,
      propagation_depth: Math.max(1, Math.round(record.member_count / 12)),
      corruption_risk: round(risk),
      containment_score: round(clamp01(1 - risk + (blackSwan?.containment_score ?? 0) * 0.25)),
    };
    const hash = computeReplayHistoricalAutonomousCivilizationHash(seed);
    return { corruption_id: `historical-corruption-propagation:${hash}`, ...seed, corruption_hash: hash };
  }));
}

function buildCivilizationAnalytics(
  league: ReplayHistoricalAutonomousLeagueSnapshot,
  dynasty: readonly ReplayDynastySurvivalScore[],
  treaties: readonly ReplayTreatyAllianceRecord[],
  corruption: readonly ReplayCorruptionPropagationRecord[],
  blackSwans: readonly ReplayBlackSwanCollapseEvent[],
): readonly ReplayCivilizationScaleAnalyticsRecord[] {
  return deepFreeze(league.ecosystem.map((ecosystem) => {
    const dynastyScore = dynasty.find((record) => record.league === ecosystem.league)?.dynasty_score ?? 0;
    const cooperation = average(treaties.filter((record) => record.league_a === ecosystem.league || record.league_b === ecosystem.league).map((record) => record.cooperation_score));
    const corruptionRisk = average(corruption.filter((record) => record.league === ecosystem.league).map((record) => record.corruption_risk));
    const collapse = blackSwans.find((record) => record.league === ecosystem.league)?.collapse_pressure ?? 0;
    const promotion = average(league.live_promotion_criteria.filter((record) => record.league === ecosystem.league).map((record) => record.promotion_score));
    const seed = {
      league: ecosystem.league,
      civilization_fitness: round(clamp01(ecosystem.ecosystem_fitness * 0.32 + dynastyScore * 0.34 + cooperation * 0.18 + (1 - corruptionRisk) * 0.16)),
      collapse_risk: round(clamp01(collapse * 0.62 + corruptionRisk * 0.38)),
      cooperation_index: round(cooperation),
      promotion_readiness: round(clamp01(promotion * 0.65 + dynastyScore * 0.35)),
    };
    const hash = computeReplayHistoricalAutonomousCivilizationHash(seed);
    return { analytics_id: `historical-civilization-analytics:${hash}`, ...seed, analytics_hash: hash };
  }));
}

function buildPromotionGates(
  analytics: readonly ReplayCivilizationScaleAnalyticsRecord[],
  league: ReplayHistoricalAutonomousLeagueSnapshot,
  promotionThreshold: number,
): readonly ReplayCivilizationPromotionGate[] {
  return deepFreeze(analytics.map((record) => {
    const promotedNetworks = league.live_promotion_criteria.filter((item) => item.league === record.league && item.promoted).length;
    const gateScore = clamp01(record.promotion_readiness * 0.5 + record.civilization_fitness * 0.32 + (1 - record.collapse_risk) * 0.18);
    const promoted = gateScore >= promotionThreshold && promotedNetworks > 0 && record.collapse_risk < 0.72;
    const seed = {
      league: record.league,
      promoted,
      gate_score: round(gateScore),
      gate_reason: promoted ? "civilization_promoted_to_live_consensus_gate" : record.collapse_risk >= 0.72 ? "collapse_risk_blocks_live_promotion" : "civilization_gate_threshold_not_met",
    };
    const hash = computeReplayHistoricalAutonomousCivilizationHash(seed);
    return { gate_id: `historical-civilization-promotion-gate:${hash}`, ...seed, gate_hash: hash };
  }));
}

function classifyCivilizationState(
  gates: readonly ReplayCivilizationPromotionGate[],
  blackSwans: readonly ReplayBlackSwanCollapseEvent[],
  fractures: readonly ReplayCivilWarGovernanceFractureRecord[],
  migrations: readonly ReplayDistributedIntelligenceMigrationRecord[],
  warfare: readonly ReplayCivilizationWarfareRecord[],
): ReplayHistoricalAutonomousCivilizationState {
  if (gates.some((record) => record.promoted)) return "promoting";
  if (blackSwans.some((record) => record.collapse_pressure > 0.72)) return "collapsing";
  if (fractures.some((record) => record.civil_war_risk > 0.58)) return "fracturing";
  if (migrations.some((record) => record.migration_gain > 0.5)) return "migrating";
  if (warfare.some((record) => record.warfare_outcome === "attacker_advantage")) return "warring";
  if (gates.length === 0) return "unstable";
  return "surviving";
}

function persistReplayHistoricalAutonomousCivilizationSnapshot(
  db: SqliteDatabase,
  snapshot: ReplayHistoricalAutonomousCivilizationSnapshot,
): void {
  const write = db.transaction(() => {
    db.prepare(`
      INSERT OR REPLACE INTO replay_historical_autonomous_civilization_snapshots
      (civilization_id, autonomous_league_id, generated_at, persisted_at, state, deterministic_hash, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(snapshot.civilization_id, snapshot.autonomous_league_id, snapshot.generated_at, snapshot.persisted_at, snapshot.state, snapshot.deterministic_hash, stableCivilizationStringify(snapshot));
    for (const record of snapshot.warfare) persistView(db, snapshot, "warfare", record.warfare_id, record.warfare_hash, record);
    for (const record of snapshot.governance_ideologies) persistView(db, snapshot, "governance_ideologies", record.ideology_id, record.ideology_hash, record);
    for (const record of snapshot.validator_empires) persistView(db, snapshot, "validator_empires", record.empire_id, record.empire_hash, record);
    for (const record of snapshot.recursive_spawns) persistView(db, snapshot, "recursive_spawns", record.spawn_id, record.spawn_hash, record);
    for (const record of snapshot.catastrophes) persistView(db, snapshot, "catastrophes", record.catastrophe_id, record.catastrophe_hash, record);
    for (const record of snapshot.intelligence_migrations) persistView(db, snapshot, "intelligence_migrations", record.migration_id, record.migration_hash, record);
    for (const record of snapshot.treaty_alliances) persistView(db, snapshot, "treaty_alliances", record.treaty_id, record.treaty_hash, record);
    for (const record of snapshot.civil_war_fractures) persistView(db, snapshot, "civil_war_fractures", record.fracture_id, record.fracture_hash, record);
    for (const record of snapshot.black_swan_events) persistView(db, snapshot, "black_swan_events", record.event_id, record.event_hash, record);
    for (const record of snapshot.dynasty_survival) persistView(db, snapshot, "dynasty_survival", record.dynasty_id, record.dynasty_hash, record);
    for (const record of snapshot.species_divergence) persistView(db, snapshot, "species_divergence", record.species_id, record.species_hash, record);
    for (const record of snapshot.runtime_diplomacy) persistView(db, snapshot, "runtime_diplomacy", record.diplomacy_id, record.diplomacy_hash, record);
    for (const record of snapshot.self_preserving_swarms) persistView(db, snapshot, "self_preserving_swarms", record.swarm_id, record.swarm_hash, record);
    for (const record of snapshot.corruption_propagation) persistView(db, snapshot, "corruption_propagation", record.corruption_id, record.corruption_hash, record);
    for (const record of snapshot.civilization_analytics) persistView(db, snapshot, "civilization_analytics", record.analytics_id, record.analytics_hash, record);
    for (const record of snapshot.promotion_gates) persistView(db, snapshot, "promotion_gates", record.gate_id, record.gate_hash, record);
  });
  write();
}

function persistView(db: SqliteDatabase, snapshot: ReplayHistoricalAutonomousCivilizationSnapshot, viewKind: string, viewId: string, viewHash: string, payload: unknown): void {
  db.prepare(`
    INSERT OR REPLACE INTO replay_historical_autonomous_civilization_views
    (view_id, civilization_id, view_kind, view_hash, payload)
    VALUES (?, ?, ?, ?, ?)
  `).run(viewId, snapshot.civilization_id, viewKind, viewHash, stableCivilizationStringify(payload));
}

function getCivilizationViewList<T>(db: SqliteDatabase, civilizationId: string, viewKind: string): readonly T[] {
  initializeReplayHistoricalAutonomousCivilizationSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_historical_autonomous_civilization_views
    WHERE civilization_id = ? AND view_kind = ?
    ORDER BY view_hash ASC
  `).all(civilizationId, viewKind) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as T));
}

function deterministicProbability(seed: string): number {
  const hash = computeReplayHistoricalAutonomousCivilizationHash(seed).slice(0, 12);
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

function stableCivilizationStringify(value: unknown): string {
  return JSON.stringify(sortCivilizationKeys(value));
}

function sortCivilizationKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCivilizationKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortCivilizationKeys((value as Record<string, unknown>)[key]);
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
