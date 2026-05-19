import crypto from "node:crypto";

import type Database from "better-sqlite3";

import type {
  ReplayHistoricalCalibrationSnapshot,
  ReplayHistoricalConsensusConvergenceBaseline,
  ReplayHistoricalDriftComparison,
  ReplayHistoricalGovernanceEvolution,
  ReplayHistoricalIntelligenceLineage,
  ReplayHistoricalOddsMovementReplay,
  ReplayHistoricalSourceReplay,
  ReplayHistoricalValidatorTrustPrior,
} from "./replay-historical-calibration-contract";
import type {
  ReplayAdversarialSourceSimulationRecord,
  ReplayAutonomousValidatorMutationTest,
  ReplayCrossSportTransferLearningRecord,
  ReplayHistoricalConsensusTournamentRecord,
  ReplayHistoricalMarketReactionScore,
  ReplayHistoricalSimulationLineageRecord,
  ReplayHistoricalSimulationRuntimeAction,
  ReplayHistoricalSimulationRuntimeInput,
  ReplayHistoricalSimulationRuntimeQuery,
  ReplayHistoricalSimulationRuntimeSnapshot,
  ReplayHistoricalSimulationRuntimeState,
  ReplayIntelligenceSurvivabilitySimulationRecord,
  ReplayMisinformationResistanceScore,
  ReplayPreLiveRuntimeInitializationSnapshot,
  ReplayProbabilisticTrustEvolutionRecord,
  ReplayRecursiveGovernanceAdaptationRecord,
  ReplayReinforcementCalibrationLoopRecord,
  ReplayValidatorPretrainingRuntimeRecord,
  ReplayValidatorSpecializationEvolutionRecord,
} from "./replay-historical-simulation-runtime-contract";

type SqliteDatabase = Database.Database;

interface PayloadRow {
  readonly payload: string;
}

const SUPPORTED_ACTIONS: readonly ReplayHistoricalSimulationRuntimeAction[] = [
  "pretrain_validators",
  "simulate_consensus_tournament",
  "simulate_adversarial_sources",
  "score_misinformation_resistance",
  "evolve_probabilistic_trust",
  "run_reinforcement_calibration",
  "evolve_validator_specialization",
  "transfer_cross_sport_intelligence",
  "adapt_recursive_governance",
  "score_market_reaction",
  "test_validator_mutation",
  "freeze_pre_live_initialization",
  "simulate_intelligence_survivability",
];

const SUPPORTED_QUERIES: readonly ReplayHistoricalSimulationRuntimeQuery[] = [
  "get_validator_pretraining_runtime",
  "get_consensus_tournament_history",
  "get_adversarial_source_simulation",
  "get_misinformation_resistance_scores",
  "get_probabilistic_trust_evolution",
  "get_reinforcement_calibration_loops",
  "get_validator_specialization_evolution",
  "get_cross_sport_transfer_learning",
  "get_recursive_governance_adaptation",
  "get_historical_market_reaction_scores",
  "get_validator_mutation_tests",
  "get_pre_live_initialization_snapshots",
  "get_intelligence_survivability_simulation",
  "get_simulation_lineage",
];

export function initializeReplayHistoricalSimulationRuntimeSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS replay_historical_simulation_runtime_snapshots (
      simulation_id TEXT PRIMARY KEY,
      calibration_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      state TEXT NOT NULL,
      deterministic_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replay_historical_simulation_runtime_views (
      view_id TEXT PRIMARY KEY,
      simulation_id TEXT NOT NULL,
      view_kind TEXT NOT NULL,
      view_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);
}

export function buildReplayHistoricalSimulationRuntimeSnapshot(
  db: SqliteDatabase,
  input: ReplayHistoricalSimulationRuntimeInput,
): ReplayHistoricalSimulationRuntimeSnapshot {
  initializeReplayHistoricalSimulationRuntimeSchema(db);

  const epochs = Math.max(1, input.simulation_epochs ?? 3);
  const pressure = clamp01(input.adversarial_pressure ?? 0.28);
  const learningRate = clamp01(input.reinforcement_learning_rate ?? 0.18);
  const calibration = input.calibration_snapshot;
  const pretraining = buildValidatorPretraining(calibration, learningRate);
  const tournaments = buildConsensusTournaments(calibration, pretraining, epochs);
  const adversarial = buildAdversarialSources(calibration.source_replay_priors, pressure);
  const resistance = buildMisinformationResistance(adversarial);
  const trustEvolution = buildProbabilisticTrustEvolution(pretraining, tournaments, epochs);
  const reinforcement = buildReinforcementLoops(calibration, epochs, learningRate);
  const specialization = buildValidatorSpecialization(pretraining, calibration);
  const transfer = buildCrossSportTransferLearning(pretraining, calibration);
  const governance = buildRecursiveGovernanceAdaptation(calibration, epochs);
  const market = buildMarketReactionScores(calibration.odds_movement_replays);
  const mutations = buildValidatorMutationTests(pretraining, resistance);
  const initialization = buildPreLiveInitialization(pretraining, specialization, resistance, trustEvolution);
  const survivability = buildSurvivabilitySimulation(calibration.intelligence_lineage, calibration.drift_comparison, tournaments);
  const lineage = buildSimulationLineage(calibration, {
    pretraining,
    tournaments,
    adversarial,
    reinforcement,
    mutations,
    initialization,
    survivability,
  });
  const state = classifySimulationState(resistance, mutations, survivability, initialization);
  const seed = {
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    calibration_hash: calibration.deterministic_hash,
    pretraining_hashes: pretraining.map((record) => record.pretraining_hash),
    tournament_hashes: tournaments.map((record) => record.tournament_hash),
    adversarial_hashes: adversarial.map((record) => record.adversarial_hash),
    resistance_hashes: resistance.map((record) => record.resistance_hash),
    trust_hashes: trustEvolution.map((record) => record.evolution_hash),
    reinforcement_hashes: reinforcement.map((record) => record.loop_hash),
    specialization_hashes: specialization.map((record) => record.specialization_hash),
    transfer_hashes: transfer.map((record) => record.transfer_hash),
    governance_hashes: governance.map((record) => record.adaptation_hash),
    market_hashes: market.map((record) => record.reaction_hash),
    mutation_hashes: mutations.map((record) => record.mutation_hash),
    initialization_hashes: initialization.map((record) => record.initialization_hash),
    survivability_hashes: survivability.map((record) => record.survivability_hash),
    lineage_hashes: lineage.map((record) => record.lineage_hash),
  };
  const deterministicHash = computeReplayHistoricalSimulationRuntimeHash(seed);
  const snapshot = deepFreeze({
    simulation_id: `replay-historical-simulation-runtime:${deterministicHash}`,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    calibration_id: calibration.calibration_id,
    validator_pretraining: pretraining,
    consensus_tournaments: tournaments,
    adversarial_sources: adversarial,
    misinformation_resistance: resistance,
    probabilistic_trust_evolution: trustEvolution,
    reinforcement_calibration_loops: reinforcement,
    validator_specialization: specialization,
    cross_sport_transfer_learning: transfer,
    recursive_governance_adaptation: governance,
    market_reaction_scores: market,
    validator_mutation_tests: mutations,
    pre_live_initialization: initialization,
    survivability_simulation: survivability,
    simulation_lineage: lineage,
    supported_actions: SUPPORTED_ACTIONS,
    supported_queries: SUPPORTED_QUERIES,
    deterministic_hash: deterministicHash,
  });

  persistReplayHistoricalSimulationRuntimeSnapshot(db, snapshot);
  return snapshot;
}

export function getValidatorPretrainingRuntime(db: SqliteDatabase, simulationId: string): readonly ReplayValidatorPretrainingRuntimeRecord[] {
  return getSimulationViewList(db, simulationId, "validator_pretraining");
}

export function getConsensusTournamentHistory(db: SqliteDatabase, simulationId: string): readonly ReplayHistoricalConsensusTournamentRecord[] {
  return getSimulationViewList(db, simulationId, "consensus_tournaments");
}

export function getAdversarialSourceSimulation(db: SqliteDatabase, simulationId: string): readonly ReplayAdversarialSourceSimulationRecord[] {
  return getSimulationViewList(db, simulationId, "adversarial_sources");
}

export function getMisinformationResistanceScores(db: SqliteDatabase, simulationId: string): readonly ReplayMisinformationResistanceScore[] {
  return getSimulationViewList(db, simulationId, "misinformation_resistance");
}

export function getProbabilisticTrustEvolution(db: SqliteDatabase, simulationId: string): readonly ReplayProbabilisticTrustEvolutionRecord[] {
  return getSimulationViewList(db, simulationId, "probabilistic_trust_evolution");
}

export function getReinforcementCalibrationLoops(db: SqliteDatabase, simulationId: string): readonly ReplayReinforcementCalibrationLoopRecord[] {
  return getSimulationViewList(db, simulationId, "reinforcement_calibration_loops");
}

export function getValidatorSpecializationEvolution(db: SqliteDatabase, simulationId: string): readonly ReplayValidatorSpecializationEvolutionRecord[] {
  return getSimulationViewList(db, simulationId, "validator_specialization");
}

export function getCrossSportTransferLearning(db: SqliteDatabase, simulationId: string): readonly ReplayCrossSportTransferLearningRecord[] {
  return getSimulationViewList(db, simulationId, "cross_sport_transfer_learning");
}

export function getRecursiveGovernanceAdaptation(db: SqliteDatabase, simulationId: string): readonly ReplayRecursiveGovernanceAdaptationRecord[] {
  return getSimulationViewList(db, simulationId, "recursive_governance_adaptation");
}

export function getHistoricalMarketReactionScores(db: SqliteDatabase, simulationId: string): readonly ReplayHistoricalMarketReactionScore[] {
  return getSimulationViewList(db, simulationId, "market_reaction_scores");
}

export function getValidatorMutationTests(db: SqliteDatabase, simulationId: string): readonly ReplayAutonomousValidatorMutationTest[] {
  return getSimulationViewList(db, simulationId, "validator_mutation_tests");
}

export function getPreLiveInitializationSnapshots(db: SqliteDatabase, simulationId: string): readonly ReplayPreLiveRuntimeInitializationSnapshot[] {
  return getSimulationViewList(db, simulationId, "pre_live_initialization");
}

export function getIntelligenceSurvivabilitySimulation(db: SqliteDatabase, simulationId: string): readonly ReplayIntelligenceSurvivabilitySimulationRecord[] {
  return getSimulationViewList(db, simulationId, "survivability_simulation");
}

export function getSimulationLineage(db: SqliteDatabase, simulationId: string): readonly ReplayHistoricalSimulationLineageRecord[] {
  return getSimulationViewList(db, simulationId, "simulation_lineage");
}

export function serializeReplayHistoricalSimulationRuntimeSnapshot(snapshot: ReplayHistoricalSimulationRuntimeSnapshot): string {
  return stableSimulationStringify(snapshot);
}

export function computeReplayHistoricalSimulationRuntimeHash(value: unknown): string {
  return crypto.createHash("sha256").update(stableSimulationStringify(value)).digest("hex");
}

function buildValidatorPretraining(
  calibration: ReplayHistoricalCalibrationSnapshot,
  learningRate: number,
): readonly ReplayValidatorPretrainingRuntimeRecord[] {
  return deepFreeze(calibration.validator_trust_priors.map((prior) => {
    const convergence = findLeagueConvergence(calibration.consensus_convergence_baselines, prior.league);
    const market = findLeagueMarket(calibration.odds_movement_replays, prior.league);
    const reinforcement = ((convergence?.convergence_score ?? 0) + (market?.positive_clv_rate ?? 0)) / 2;
    const pretrainedTrust = clamp01(prior.calibrated_trust_prior + ((reinforcement - 0.5) * learningRate));
    const seed = {
      validator_type: prior.validator_type,
      league: prior.league,
      starting_trust: round(prior.calibrated_trust_prior),
      pretrained_trust: round(pretrainedTrust),
      pretrained_weight: round(clamp01((prior.calibrated_weight_prior * 0.65) + (pretrainedTrust * 0.35))),
      sample_count: prior.sample_count,
    };
    const hash = computeReplayHistoricalSimulationRuntimeHash(seed);
    return {
      pretraining_id: `historical-validator-pretraining:${hash}`,
      ...seed,
      pretraining_hash: hash,
    };
  }).sort((left, right) => left.pretraining_id.localeCompare(right.pretraining_id)));
}

function buildConsensusTournaments(
  calibration: ReplayHistoricalCalibrationSnapshot,
  pretraining: readonly ReplayValidatorPretrainingRuntimeRecord[],
  epochs: number,
): readonly ReplayHistoricalConsensusTournamentRecord[] {
  return deepFreeze(calibration.consensus_convergence_baselines.flatMap((baseline) => {
    const validators = pretraining.filter((record) => record.league === baseline.league);
    const averageTrust = average(validators.map((record) => record.pretrained_trust));
    return Array.from({ length: epochs }, (_, index) => {
      const roundNumber = index + 1;
      const epochGain = roundNumber / (epochs * 20);
      const seed = {
        league: baseline.league,
        tournament_round: roundNumber,
        validator_count: validators.length,
        consensus_success_rate: round(clamp01((baseline.convergence_score * 0.6) + (averageTrust * 0.4) + epochGain)),
        convergence_advantage: round(clamp01((baseline.average_approval_ratio - baseline.average_divergence_ratio) + epochGain)),
      };
      const hash = computeReplayHistoricalSimulationRuntimeHash(seed);
      return {
        tournament_id: `historical-consensus-tournament:${hash}`,
        ...seed,
        tournament_hash: hash,
      };
    });
  }));
}

function buildAdversarialSources(
  sources: readonly ReplayHistoricalSourceReplay[],
  pressure: number,
): readonly ReplayAdversarialSourceSimulationRecord[] {
  return deepFreeze(sources.map((source) => {
    const falseSignalRate = clamp01((1 - source.reliability_prior) * pressure);
    const seed = {
      source_id: source.source_id,
      league: source.league,
      reliability_prior: source.reliability_prior,
      adversarial_pressure: round(pressure),
      simulated_false_signal_rate: round(falseSignalRate),
      resistance_score: round(clamp01(source.reliability_prior * (1 - falseSignalRate))),
    };
    const hash = computeReplayHistoricalSimulationRuntimeHash(seed);
    return {
      adversarial_id: `historical-adversarial-source:${hash}`,
      ...seed,
      adversarial_hash: hash,
    };
  }).sort((left, right) => left.adversarial_id.localeCompare(right.adversarial_id)));
}

function buildMisinformationResistance(
  adversarial: readonly ReplayAdversarialSourceSimulationRecord[],
): readonly ReplayMisinformationResistanceScore[] {
  const leagues = unique(adversarial.map((record) => record.league));
  return deepFreeze(leagues.map((league) => {
    const records = adversarial.filter((record) => record.league === league);
    const resistance = average(records.map((record) => record.resistance_score));
    const falseRate = average(records.map((record) => record.simulated_false_signal_rate));
    const seed = {
      league,
      source_count: records.length,
      average_resistance_score: round(resistance),
      misinformation_containment_score: round(clamp01(resistance * (1 - falseRate))),
    };
    const hash = computeReplayHistoricalSimulationRuntimeHash(seed);
    return {
      resistance_id: `historical-misinformation-resistance:${hash}`,
      ...seed,
      resistance_hash: hash,
    };
  }));
}

function buildProbabilisticTrustEvolution(
  pretraining: readonly ReplayValidatorPretrainingRuntimeRecord[],
  tournaments: readonly ReplayHistoricalConsensusTournamentRecord[],
  epochs: number,
): readonly ReplayProbabilisticTrustEvolutionRecord[] {
  return deepFreeze(pretraining.flatMap((record) =>
    Array.from({ length: epochs }, (_, index) => {
      const epoch = index + 1;
      const tournament = tournaments.find((item) => item.league === record.league && item.tournament_round === epoch);
      const probability = deterministicProbability(`${record.pretraining_hash}:${epoch}`);
      const tournamentGain = tournament?.consensus_success_rate ?? 0;
      const delta = ((probability * 0.04) + (tournamentGain * 0.03)) - 0.025;
      const seed = {
        validator_type: record.validator_type,
        league: record.league,
        epoch,
        trust_probability: round(probability),
        evolved_trust: round(clamp01(record.pretrained_trust + delta)),
        evolved_weight: round(clamp01(record.pretrained_weight + (delta / 2))),
      };
      const hash = computeReplayHistoricalSimulationRuntimeHash(seed);
      return {
        evolution_id: `historical-probabilistic-trust:${hash}`,
        ...seed,
        evolution_hash: hash,
      };
    })
  ));
}

function buildReinforcementLoops(
  calibration: ReplayHistoricalCalibrationSnapshot,
  epochs: number,
  learningRate: number,
): readonly ReplayReinforcementCalibrationLoopRecord[] {
  const leagues = unique(calibration.consensus_convergence_baselines.map((record) => record.league));
  return deepFreeze(leagues.flatMap((league) =>
    Array.from({ length: epochs }, (_, index) => {
      const epoch = index + 1;
      const convergence = average(calibration.consensus_convergence_baselines.filter((record) => record.league === league).map((record) => record.convergence_score));
      const market = average(calibration.odds_movement_replays.filter((record) => record.league === league).map((record) => record.positive_clv_rate));
      const drift = average(calibration.drift_comparison.filter((record) => record.league === league).map((record) => record.drift_delta));
      const reward = clamp01((convergence * 0.55) + (market * 0.45));
      const penalty = clamp01(drift + ((epoch - 1) / (epochs * 25)));
      const seed = {
        league,
        epoch,
        reward_score: round(reward),
        penalty_score: round(penalty),
        learning_rate: round(learningRate),
        calibrated_gain: round(clamp01((reward - penalty) * learningRate + 0.5)),
      };
      const hash = computeReplayHistoricalSimulationRuntimeHash(seed);
      return {
        loop_id: `historical-reinforcement-loop:${hash}`,
        ...seed,
        loop_hash: hash,
      };
    })
  ));
}

function buildValidatorSpecialization(
  pretraining: readonly ReplayValidatorPretrainingRuntimeRecord[],
  calibration: ReplayHistoricalCalibrationSnapshot,
): readonly ReplayValidatorSpecializationEvolutionRecord[] {
  return deepFreeze(pretraining.map((record) => {
    const market = findLeagueMarket(calibration.odds_movement_replays, record.league);
    const governance = findLeagueGovernance(calibration.governance_evolution, record.league);
    const specialization = inferSpecialization(record.validator_type);
    const specializationScore = clamp01((record.pretrained_trust * 0.55) + ((market?.positive_clv_rate ?? 0) * 0.2) + ((governance?.governance_stability_score ?? 0) * 0.25));
    const seed = {
      validator_type: record.validator_type,
      league: record.league,
      specialization,
      specialization_score: round(specializationScore),
      mutation_readiness_score: round(clamp01(specializationScore - 0.08 + deterministicProbability(record.pretraining_hash) * 0.12)),
    };
    const hash = computeReplayHistoricalSimulationRuntimeHash(seed);
    return {
      specialization_id: `historical-validator-specialization:${hash}`,
      ...seed,
      specialization_hash: hash,
    };
  }));
}

function buildCrossSportTransferLearning(
  pretraining: readonly ReplayValidatorPretrainingRuntimeRecord[],
  calibration: ReplayHistoricalCalibrationSnapshot,
): readonly ReplayCrossSportTransferLearningRecord[] {
  const leagues = unique(pretraining.map((record) => record.league));
  return deepFreeze(leagues.flatMap((fromLeague) =>
    leagues.filter((toLeague) => toLeague !== fromLeague).map((toLeague) => {
      const fromValidators = pretraining.filter((record) => record.league === fromLeague && record.pretrained_trust >= 0.55);
      const toDrift = average(calibration.drift_comparison.filter((record) => record.league === toLeague).map((record) => record.drift_delta));
      const fromTrust = average(fromValidators.map((record) => record.pretrained_trust));
      const seed = {
        from_league: fromLeague,
        to_league: toLeague,
        transferable_validator_count: fromValidators.length,
        transfer_gain: round(clamp01(fromTrust * (1 - toDrift) * 0.35)),
        transfer_risk: round(clamp01(toDrift + (1 - fromTrust) * 0.25)),
      };
      const hash = computeReplayHistoricalSimulationRuntimeHash(seed);
      return {
        transfer_id: `historical-cross-sport-transfer:${hash}`,
        ...seed,
        transfer_hash: hash,
      };
    })
  ));
}

function buildRecursiveGovernanceAdaptation(
  calibration: ReplayHistoricalCalibrationSnapshot,
  epochs: number,
): readonly ReplayRecursiveGovernanceAdaptationRecord[] {
  return deepFreeze(calibration.governance_evolution.flatMap((record) =>
    Array.from({ length: epochs }, (_, index) => {
      const depth = index + 1;
      const adapted = clamp01(record.governance_stability_score + (depth * 0.025) - (record.review_count / Math.max(1, record.decision_count) * 0.05));
      const seed = {
        league: record.league,
        recursion_depth: depth,
        governance_prior: record.governance_stability_score,
        adapted_threshold: round(clamp01(0.5 + (adapted * 0.25))),
        stability_after_recursion: round(adapted),
      };
      const hash = computeReplayHistoricalSimulationRuntimeHash(seed);
      return {
        adaptation_id: `historical-recursive-governance:${hash}`,
        ...seed,
        adaptation_hash: hash,
      };
    })
  ));
}

function buildMarketReactionScores(
  odds: readonly ReplayHistoricalOddsMovementReplay[],
): readonly ReplayHistoricalMarketReactionScore[] {
  return deepFreeze(odds.map((record) => {
    const movementIntensity = clamp01(record.average_abs_movement / 12);
    const seed = {
      league: record.league,
      season_id: record.season_id,
      movement_intensity: round(movementIntensity),
      positive_clv_rate: record.positive_clv_rate,
      reaction_score: round(clamp01((movementIntensity * 0.45) + (record.positive_clv_rate * 0.55))),
    };
    const hash = computeReplayHistoricalSimulationRuntimeHash(seed);
    return {
      reaction_id: `historical-market-reaction:${hash}`,
      ...seed,
      reaction_hash: hash,
    };
  }));
}

function buildValidatorMutationTests(
  pretraining: readonly ReplayValidatorPretrainingRuntimeRecord[],
  resistance: readonly ReplayMisinformationResistanceScore[],
): readonly ReplayAutonomousValidatorMutationTest[] {
  return deepFreeze(pretraining.map((record) => {
    const resistanceScore = resistance.find((item) => item.league === record.league)?.misinformation_containment_score ?? 0;
    const probability = deterministicProbability(`${record.pretraining_hash}:mutation`);
    const mutationVector = probability > 0.66 ? "aggressive_weight_shift" : probability > 0.33 ? "source_skepticism_boost" : "market_reaction_bias";
    const delta = mutationVector === "source_skepticism_boost" ? resistanceScore * 0.05 : mutationVector === "aggressive_weight_shift" ? -0.03 : 0.02;
    const mutatedTrust = clamp01(record.pretrained_trust + delta);
    const seed = {
      validator_type: record.validator_type,
      league: record.league,
      mutation_vector: mutationVector,
      baseline_trust: record.pretrained_trust,
      mutated_trust: round(mutatedTrust),
      mutation_survived: mutatedTrust >= 0.45 && resistanceScore >= 0.35,
    };
    const hash = computeReplayHistoricalSimulationRuntimeHash(seed);
    return {
      mutation_id: `historical-validator-mutation:${hash}`,
      ...seed,
      mutation_hash: hash,
    };
  }));
}

function buildPreLiveInitialization(
  pretraining: readonly ReplayValidatorPretrainingRuntimeRecord[],
  specialization: readonly ReplayValidatorSpecializationEvolutionRecord[],
  resistance: readonly ReplayMisinformationResistanceScore[],
  trustEvolution: readonly ReplayProbabilisticTrustEvolutionRecord[],
): readonly ReplayPreLiveRuntimeInitializationSnapshot[] {
  return deepFreeze(pretraining.map((record) => {
    const latestEvolution = trustEvolution
      .filter((item) => item.league === record.league && item.validator_type === record.validator_type)
      .sort((left, right) => right.epoch - left.epoch)[0];
    const specialized = specialization.find((item) => item.league === record.league && item.validator_type === record.validator_type);
    const sourceResistance = resistance.find((item) => item.league === record.league)?.misinformation_containment_score ?? 0;
    const seed = {
      validator_type: record.validator_type,
      league: record.league,
      initialized_trust: round(latestEvolution?.evolved_trust ?? record.pretrained_trust),
      initialized_weight: round(latestEvolution?.evolved_weight ?? record.pretrained_weight),
      specialization: specialized?.specialization ?? inferSpecialization(record.validator_type),
      source_resistance_prior: round(sourceResistance),
    };
    const hash = computeReplayHistoricalSimulationRuntimeHash(seed);
    return {
      initialization_id: `historical-pre-live-initialization:${hash}`,
      ...seed,
      initialization_hash: hash,
    };
  }));
}

function buildSurvivabilitySimulation(
  lineage: readonly ReplayHistoricalIntelligenceLineage[],
  drift: readonly ReplayHistoricalDriftComparison[],
  tournaments: readonly ReplayHistoricalConsensusTournamentRecord[],
): readonly ReplayIntelligenceSurvivabilitySimulationRecord[] {
  return deepFreeze(lineage.map((record) => {
    const driftPressure = average(drift.filter((item) => item.league === record.league).map((item) => item.historical_drift_score));
    const tournamentSuccess = average(tournaments.filter((item) => item.league === record.league).map((item) => item.consensus_success_rate));
    const failoverReadiness = clamp01(Math.log2(record.lineage_depth + 1) / 8);
    const seed = {
      league: record.league,
      lineage_depth: record.lineage_depth,
      drift_pressure: round(driftPressure),
      failover_readiness_score: round(failoverReadiness),
      survivability_score: round(clamp01((failoverReadiness * 0.35) + (tournamentSuccess * 0.45) + ((1 - driftPressure) * 0.2))),
    };
    const hash = computeReplayHistoricalSimulationRuntimeHash(seed);
    return {
      survivability_id: `historical-survivability-simulation:${hash}`,
      ...seed,
      survivability_hash: hash,
    };
  }));
}

function buildSimulationLineage(
  calibration: ReplayHistoricalCalibrationSnapshot,
  records: {
    readonly pretraining: readonly ReplayValidatorPretrainingRuntimeRecord[];
    readonly tournaments: readonly ReplayHistoricalConsensusTournamentRecord[];
    readonly adversarial: readonly ReplayAdversarialSourceSimulationRecord[];
    readonly reinforcement: readonly ReplayReinforcementCalibrationLoopRecord[];
    readonly mutations: readonly ReplayAutonomousValidatorMutationTest[];
    readonly initialization: readonly ReplayPreLiveRuntimeInitializationSnapshot[];
    readonly survivability: readonly ReplayIntelligenceSurvivabilitySimulationRecord[];
  },
): readonly ReplayHistoricalSimulationLineageRecord[] {
  const references: readonly { readonly kind: ReplayHistoricalSimulationLineageRecord["lineage_kind"]; readonly hash: string }[] = [
    { kind: "calibration", hash: calibration.deterministic_hash },
    ...records.pretraining.map((record) => ({ kind: "pretraining" as const, hash: record.pretraining_hash })),
    ...records.tournaments.map((record) => ({ kind: "tournament" as const, hash: record.tournament_hash })),
    ...records.adversarial.map((record) => ({ kind: "adversarial" as const, hash: record.adversarial_hash })),
    ...records.reinforcement.map((record) => ({ kind: "reinforcement" as const, hash: record.loop_hash })),
    ...records.mutations.map((record) => ({ kind: "mutation" as const, hash: record.mutation_hash })),
    ...records.initialization.map((record) => ({ kind: "initialization" as const, hash: record.initialization_hash })),
    ...records.survivability.map((record) => ({ kind: "survivability" as const, hash: record.survivability_hash })),
  ];
  return deepFreeze(references.map((reference, index) => {
    const seed = {
      calibration_hash: calibration.deterministic_hash,
      source_hash: index === 0 ? calibration.deterministic_hash : references[index - 1]?.hash ?? calibration.deterministic_hash,
      target_hash: reference.hash,
      lineage_kind: reference.kind,
    };
    const hash = computeReplayHistoricalSimulationRuntimeHash(seed);
    return {
      lineage_id: `historical-simulation-lineage:${hash}`,
      ...seed,
      lineage_hash: hash,
    };
  }));
}

function classifySimulationState(
  resistance: readonly ReplayMisinformationResistanceScore[],
  mutations: readonly ReplayAutonomousValidatorMutationTest[],
  survivability: readonly ReplayIntelligenceSurvivabilitySimulationRecord[],
  initialization: readonly ReplayPreLiveRuntimeInitializationSnapshot[],
): ReplayHistoricalSimulationRuntimeState {
  if (initialization.length === 0) return "unstable";
  if (average(survivability.map((record) => record.survivability_score)) >= 0.66) return "survivable";
  if (mutations.some((record) => !record.mutation_survived)) return "adversarial";
  if (average(resistance.map((record) => record.misinformation_containment_score)) >= 0.55) return "initializing";
  return "reinforcing";
}

function persistReplayHistoricalSimulationRuntimeSnapshot(
  db: SqliteDatabase,
  snapshot: ReplayHistoricalSimulationRuntimeSnapshot,
): void {
  const write = db.transaction(() => {
    db.prepare(`
      INSERT OR REPLACE INTO replay_historical_simulation_runtime_snapshots
      (simulation_id, calibration_id, generated_at, persisted_at, state, deterministic_hash, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(snapshot.simulation_id, snapshot.calibration_id, snapshot.generated_at, snapshot.persisted_at, snapshot.state, snapshot.deterministic_hash, stableSimulationStringify(snapshot));
    for (const record of snapshot.validator_pretraining) persistView(db, snapshot, "validator_pretraining", record.pretraining_id, record.pretraining_hash, record);
    for (const record of snapshot.consensus_tournaments) persistView(db, snapshot, "consensus_tournaments", record.tournament_id, record.tournament_hash, record);
    for (const record of snapshot.adversarial_sources) persistView(db, snapshot, "adversarial_sources", record.adversarial_id, record.adversarial_hash, record);
    for (const record of snapshot.misinformation_resistance) persistView(db, snapshot, "misinformation_resistance", record.resistance_id, record.resistance_hash, record);
    for (const record of snapshot.probabilistic_trust_evolution) persistView(db, snapshot, "probabilistic_trust_evolution", record.evolution_id, record.evolution_hash, record);
    for (const record of snapshot.reinforcement_calibration_loops) persistView(db, snapshot, "reinforcement_calibration_loops", record.loop_id, record.loop_hash, record);
    for (const record of snapshot.validator_specialization) persistView(db, snapshot, "validator_specialization", record.specialization_id, record.specialization_hash, record);
    for (const record of snapshot.cross_sport_transfer_learning) persistView(db, snapshot, "cross_sport_transfer_learning", record.transfer_id, record.transfer_hash, record);
    for (const record of snapshot.recursive_governance_adaptation) persistView(db, snapshot, "recursive_governance_adaptation", record.adaptation_id, record.adaptation_hash, record);
    for (const record of snapshot.market_reaction_scores) persistView(db, snapshot, "market_reaction_scores", record.reaction_id, record.reaction_hash, record);
    for (const record of snapshot.validator_mutation_tests) persistView(db, snapshot, "validator_mutation_tests", record.mutation_id, record.mutation_hash, record);
    for (const record of snapshot.pre_live_initialization) persistView(db, snapshot, "pre_live_initialization", record.initialization_id, record.initialization_hash, record);
    for (const record of snapshot.survivability_simulation) persistView(db, snapshot, "survivability_simulation", record.survivability_id, record.survivability_hash, record);
    for (const record of snapshot.simulation_lineage) persistView(db, snapshot, "simulation_lineage", record.lineage_id, record.lineage_hash, record);
  });
  write();
}

function persistView(
  db: SqliteDatabase,
  snapshot: ReplayHistoricalSimulationRuntimeSnapshot,
  viewKind: string,
  viewId: string,
  viewHash: string,
  payload: unknown,
): void {
  db.prepare(`
    INSERT OR REPLACE INTO replay_historical_simulation_runtime_views
    (view_id, simulation_id, view_kind, view_hash, payload)
    VALUES (?, ?, ?, ?, ?)
  `).run(viewId, snapshot.simulation_id, viewKind, viewHash, stableSimulationStringify(payload));
}

function getSimulationViewList<T>(db: SqliteDatabase, simulationId: string, viewKind: string): readonly T[] {
  initializeReplayHistoricalSimulationRuntimeSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_historical_simulation_runtime_views
    WHERE simulation_id = ? AND view_kind = ?
    ORDER BY view_hash ASC
  `).all(simulationId, viewKind) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as T));
}

function findLeagueConvergence(
  records: readonly ReplayHistoricalConsensusConvergenceBaseline[],
  league: string,
): ReplayHistoricalConsensusConvergenceBaseline | undefined {
  return records.filter((record) => record.league === league).sort((left, right) => right.convergence_score - left.convergence_score)[0];
}

function findLeagueMarket(
  records: readonly ReplayHistoricalOddsMovementReplay[],
  league: string,
): ReplayHistoricalOddsMovementReplay | undefined {
  return records.filter((record) => record.league === league).sort((left, right) => right.positive_clv_rate - left.positive_clv_rate)[0];
}

function findLeagueGovernance(
  records: readonly ReplayHistoricalGovernanceEvolution[],
  league: string,
): ReplayHistoricalGovernanceEvolution | undefined {
  return records.filter((record) => record.league === league).sort((left, right) => right.governance_stability_score - left.governance_stability_score)[0];
}

function inferSpecialization(validatorType: string): string {
  if (validatorType.includes("injury")) return "injury_reliability";
  if (validatorType.includes("odds") || validatorType.includes("market")) return "market_reaction";
  if (validatorType.includes("source")) return "source_authenticity";
  if (validatorType.includes("consensus")) return "consensus_convergence";
  if (validatorType.includes("outcome")) return "settlement_accuracy";
  return "general_replay_intelligence";
}

function deterministicProbability(seed: string): number {
  const hash = computeReplayHistoricalSimulationRuntimeHash(seed).slice(0, 12);
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

function stableSimulationStringify(value: unknown): string {
  return JSON.stringify(sortSimulationKeys(value));
}

function sortSimulationKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortSimulationKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortSimulationKeys((value as Record<string, unknown>)[key]);
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
