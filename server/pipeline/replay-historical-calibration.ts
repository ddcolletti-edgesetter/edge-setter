import crypto from "node:crypto";

import type Database from "better-sqlite3";

import { buildReplayLiveSportsRuntimeIntegrationSnapshot } from "./replay-live-sports-runtime-integration";
import type {
  ReplayLiveSportsFeedSnapshot,
  ReplayLiveSportsRuntimeIntegrationSnapshot,
} from "./replay-live-sports-runtime-integration-contract";
import type {
  ReplayHistoricalCalibrationAction,
  ReplayHistoricalCalibrationInput,
  ReplayHistoricalCalibrationObservability,
  ReplayHistoricalCalibrationQuery,
  ReplayHistoricalCalibrationSnapshot,
  ReplayHistoricalCalibrationState,
  ReplayHistoricalConsensusConvergenceBaseline,
  ReplayHistoricalDriftComparison,
  ReplayHistoricalGovernanceEvolution,
  ReplayHistoricalInjuryIntelligenceReplay,
  ReplayHistoricalIntelligenceLineage,
  ReplayHistoricalOddsMovementReplay,
  ReplayHistoricalPropagationVelocity,
  ReplayHistoricalSeasonInput,
  ReplayHistoricalSourceReplay,
  ReplayHistoricalSportsFeedSnapshot,
  ReplayHistoricalValidatorTrustPrior,
} from "./replay-historical-calibration-contract";

type SqliteDatabase = Database.Database;

interface PayloadRow {
  readonly payload: string;
}

interface SeasonRuntimeReplay {
  readonly season: ReplayHistoricalSeasonInput;
  readonly integration: ReplayLiveSportsRuntimeIntegrationSnapshot | null;
  readonly historical_hash: string;
}

const SUPPORTED_ACTIONS: readonly ReplayHistoricalCalibrationAction[] = [
  "ingest_multi_season_replay",
  "replay_historical_odds_movement",
  "replay_historical_injury_intelligence",
  "replay_historical_source_intelligence",
  "calibrate_validator_trust",
  "analyze_consensus_convergence",
  "analyze_propagation_velocity",
  "replay_governance_evolution",
  "compare_historical_drift",
  "reconstruct_intelligence_lineage",
  "persist_calibration_snapshot",
];

const SUPPORTED_QUERIES: readonly ReplayHistoricalCalibrationQuery[] = [
  "get_historical_calibration_summary",
  "get_historical_source_reliability_priors",
  "get_historical_validator_trust_priors",
  "get_historical_consensus_convergence_baselines",
  "get_historical_propagation_velocity",
  "get_historical_governance_evolution",
  "get_historical_drift_comparison",
  "get_historical_intelligence_lineage",
  "get_historical_calibration_observability",
];

export function initializeReplayHistoricalCalibrationSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS replay_historical_calibration_snapshots (
      calibration_id TEXT PRIMARY KEY,
      generated_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      state TEXT NOT NULL,
      deterministic_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replay_historical_calibration_views (
      view_id TEXT PRIMARY KEY,
      calibration_id TEXT NOT NULL,
      view_kind TEXT NOT NULL,
      view_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);
}

export function buildReplayHistoricalCalibrationSnapshot(
  db: SqliteDatabase,
  input: ReplayHistoricalCalibrationInput,
): ReplayHistoricalCalibrationSnapshot {
  initializeReplayHistoricalCalibrationSchema(db);

  const seasonReplays = input.seasons
    .slice()
    .sort((left, right) => `${left.league}:${left.season_year}:${left.season_id}`.localeCompare(`${right.league}:${right.season_year}:${right.season_id}`))
    .map((season) => replaySeasonRuntime(db, input, season));
  const odds = buildOddsMovementReplays(seasonReplays);
  const injuries = buildInjuryIntelligenceReplays(seasonReplays);
  const sourcePriors = buildSourceReplayPriors(seasonReplays);
  const validatorPriors = buildValidatorTrustPriors(seasonReplays, sourcePriors);
  const consensus = buildConsensusConvergenceBaselines(seasonReplays);
  const propagation = buildPropagationVelocity(seasonReplays);
  const governance = buildGovernanceEvolution(seasonReplays);
  const drift = buildDriftComparison(consensus, seasonReplays);
  const lineage = buildIntelligenceLineage(seasonReplays);
  const observability = buildObservability(input, sourcePriors, validatorPriors, consensus, drift);
  const state = classifyCalibrationState(input.seasons, consensus, drift);
  const seed = {
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    odds_hashes: odds.map((record) => record.odds_replay_hash),
    injury_hashes: injuries.map((record) => record.injury_replay_hash),
    source_hashes: sourcePriors.map((record) => record.source_replay_hash),
    validator_hashes: validatorPriors.map((record) => record.prior_hash),
    consensus_hashes: consensus.map((record) => record.baseline_hash),
    propagation_hashes: propagation.map((record) => record.velocity_hash),
    governance_hashes: governance.map((record) => record.evolution_hash),
    drift_hashes: drift.map((record) => record.drift_hash),
    lineage_hashes: lineage.map((record) => record.lineage_hash),
    observability_hash: observability.observability_hash,
  };
  const deterministicHash = computeReplayHistoricalCalibrationHash(seed);
  const snapshot = deepFreeze({
    calibration_id: `replay-historical-calibration:${deterministicHash}`,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    odds_movement_replays: odds,
    injury_intelligence_replays: injuries,
    source_replay_priors: sourcePriors,
    validator_trust_priors: validatorPriors,
    consensus_convergence_baselines: consensus,
    propagation_velocity: propagation,
    governance_evolution: governance,
    drift_comparison: drift,
    intelligence_lineage: lineage,
    observability,
    supported_actions: SUPPORTED_ACTIONS,
    supported_queries: SUPPORTED_QUERIES,
    deterministic_hash: deterministicHash,
  });

  persistReplayHistoricalCalibrationSnapshot(db, snapshot);
  return snapshot;
}

export function getHistoricalCalibrationSummary(
  db: SqliteDatabase,
  calibrationId: string,
): ReplayHistoricalCalibrationObservability | null {
  initializeReplayHistoricalCalibrationSchema(db);
  const row = db.prepare(`
    SELECT payload FROM replay_historical_calibration_views
    WHERE calibration_id = ? AND view_kind = 'observability'
    LIMIT 1
  `).get(calibrationId) as PayloadRow | undefined;
  return row ? deepFreeze(JSON.parse(row.payload) as ReplayHistoricalCalibrationObservability) : null;
}

export function getHistoricalSourceReliabilityPriors(db: SqliteDatabase, calibrationId: string): readonly ReplayHistoricalSourceReplay[] {
  return getCalibrationViewList(db, calibrationId, "source_replay_priors");
}

export function getHistoricalValidatorTrustPriors(db: SqliteDatabase, calibrationId: string): readonly ReplayHistoricalValidatorTrustPrior[] {
  return getCalibrationViewList(db, calibrationId, "validator_trust_priors");
}

export function getHistoricalConsensusConvergenceBaselines(db: SqliteDatabase, calibrationId: string): readonly ReplayHistoricalConsensusConvergenceBaseline[] {
  return getCalibrationViewList(db, calibrationId, "consensus_convergence_baselines");
}

export function getHistoricalPropagationVelocity(db: SqliteDatabase, calibrationId: string): readonly ReplayHistoricalPropagationVelocity[] {
  return getCalibrationViewList(db, calibrationId, "propagation_velocity");
}

export function getHistoricalGovernanceEvolution(db: SqliteDatabase, calibrationId: string): readonly ReplayHistoricalGovernanceEvolution[] {
  return getCalibrationViewList(db, calibrationId, "governance_evolution");
}

export function getHistoricalDriftComparison(db: SqliteDatabase, calibrationId: string): readonly ReplayHistoricalDriftComparison[] {
  return getCalibrationViewList(db, calibrationId, "drift_comparison");
}

export function getHistoricalIntelligenceLineage(db: SqliteDatabase, calibrationId: string): readonly ReplayHistoricalIntelligenceLineage[] {
  return getCalibrationViewList(db, calibrationId, "intelligence_lineage");
}

export function getHistoricalCalibrationObservability(
  db: SqliteDatabase,
  calibrationId: string,
): ReplayHistoricalCalibrationObservability | null {
  return getHistoricalCalibrationSummary(db, calibrationId);
}

export function serializeReplayHistoricalCalibrationSnapshot(snapshot: ReplayHistoricalCalibrationSnapshot): string {
  return stableHistoricalStringify(snapshot);
}

export function computeReplayHistoricalCalibrationHash(value: unknown): string {
  return crypto.createHash("sha256").update(stableHistoricalStringify(value)).digest("hex");
}

function replaySeasonRuntime(
  db: SqliteDatabase,
  input: ReplayHistoricalCalibrationInput,
  season: ReplayHistoricalSeasonInput,
): SeasonRuntimeReplay {
  const compatibleFeeds = season.feeds.filter(isLiveRuntimeFeed);
  const integration = compatibleFeeds.length > 0
    ? buildReplayLiveSportsRuntimeIntegrationSnapshot(db, {
      generated_at: season.generated_at,
      persisted_at: input.persisted_at,
      feeds: compatibleFeeds,
      runtime_nodes: input.runtime_nodes,
      scheduler_interval_ms: 60_000,
    })
    : null;
  return {
    season,
    integration,
    historical_hash: computeReplayHistoricalCalibrationHash({
      season_id: season.season_id,
      league: season.league,
      season_year: season.season_year,
      feed_hashes: season.feeds.map((feed) => computeReplayHistoricalCalibrationHash(feed)),
      integration_hash: integration?.deterministic_hash ?? null,
    }),
  };
}

function isLiveRuntimeFeed(feed: ReplayHistoricalSportsFeedSnapshot): feed is ReplayLiveSportsFeedSnapshot {
  return feed.league === "NBA" || feed.league === "MLB";
}

function buildOddsMovementReplays(replays: readonly SeasonRuntimeReplay[]): readonly ReplayHistoricalOddsMovementReplay[] {
  return deepFreeze(replays.map(({ season }) => {
    const odds = season.feeds.flatMap((feed) => feed.odds_snapshots);
    const outcomes = season.feeds.flatMap((feed) => feed.settled_outcomes);
    const movement = odds.map((snapshot) => Math.max(
      Math.abs(snapshot.spread_line ?? 0),
      Math.abs((snapshot.total_line ?? 0) / 10),
      Math.abs((snapshot.moneyline_home ?? 0) - (snapshot.moneyline_away ?? 0)) / 100,
    ));
    const seed = {
      season_id: season.season_id,
      league: season.league,
      movement_count: odds.length,
      average_abs_movement: round(average(movement)),
      positive_clv_rate: round(rate(outcomes, (outcome) => (outcome.clv ?? 0) > 0)),
    };
    const hash = computeReplayHistoricalCalibrationHash(seed);
    return {
      odds_replay_id: `historical-odds-replay:${hash}`,
      ...seed,
      odds_replay_hash: hash,
    };
  }));
}

function buildInjuryIntelligenceReplays(replays: readonly SeasonRuntimeReplay[]): readonly ReplayHistoricalInjuryIntelligenceReplay[] {
  return deepFreeze(replays.map(({ season }) => {
    const reports = season.feeds.flatMap((feed) => feed.injury_reports);
    const injurySignals = season.feeds.flatMap((feed) => feed.live_signals.filter((signal) => signal.signal_type === "injury_update"));
    const injuryOutcomeIds = new Set(injurySignals.map((signal) => signal.id));
    const injuryOutcomes = season.feeds.flatMap((feed) => feed.settled_outcomes.filter((outcome) => injuryOutcomeIds.has(outcome.signal_id)));
    const confirmedDesignations = new Set(["OUT", "Doubtful", "IL-60", "Inactive"]);
    const seed = {
      season_id: season.season_id,
      league: season.league,
      injury_signal_count: injurySignals.length,
      confirmed_injury_rate: round(rate(reports, (report) => confirmedDesignations.has(report.designation))),
      injury_outcome_hit_rate: round(rate(injuryOutcomes, (outcome) => outcome.hit === true)),
    };
    const hash = computeReplayHistoricalCalibrationHash(seed);
    return {
      injury_replay_id: `historical-injury-replay:${hash}`,
      ...seed,
      injury_replay_hash: hash,
    };
  }));
}

function buildSourceReplayPriors(replays: readonly SeasonRuntimeReplay[]): readonly ReplayHistoricalSourceReplay[] {
  const groups = new Map<string, {
    readonly source_id: string;
    readonly league: string;
    readonly season_ids: Set<string>;
    readonly reliability_scores: number[];
    readonly outcome_hits: number[];
  }>();
  for (const { season } of replays) {
    for (const feed of season.feeds) {
      const outcomeBySignal = new Map(feed.settled_outcomes.map((outcome) => [outcome.signal_id, outcome]));
      for (const event of feed.source_intelligence_events) {
        const key = `${event.league ?? season.league}:${event.source_id}`;
        const group = groups.get(key) ?? {
          source_id: event.source_id,
          league: event.league ?? season.league,
          season_ids: new Set<string>(),
          reliability_scores: [],
          outcome_hits: [],
        };
        group.season_ids.add(season.season_id);
        group.reliability_scores.push(clamp01(event.reliability_score / 100));
        const outcome = event.signal_id ? outcomeBySignal.get(event.signal_id) : undefined;
        if (outcome?.hit !== null && typeof outcome?.hit !== "undefined") group.outcome_hits.push(outcome.hit ? 1 : 0);
        groups.set(key, group);
      }
    }
  }
  return deepFreeze(Array.from(groups.values()).map((group) => {
    const reliability = average(group.reliability_scores);
    const accuracy = group.outcome_hits.length > 0 ? average(group.outcome_hits) : reliability;
    const seed = {
      source_id: group.source_id,
      league: group.league,
      season_ids: Array.from(group.season_ids).sort((left, right) => left.localeCompare(right)),
      observation_count: group.reliability_scores.length,
      reliability_prior: round(clamp01((reliability * 0.6) + (accuracy * 0.4))),
    };
    const hash = computeReplayHistoricalCalibrationHash(seed);
    return {
      source_replay_id: `historical-source-replay:${hash}`,
      ...seed,
      source_replay_hash: hash,
    };
  }).sort((left, right) => left.source_replay_id.localeCompare(right.source_replay_id)));
}

function buildValidatorTrustPriors(
  replays: readonly SeasonRuntimeReplay[],
  sourcePriors: readonly ReplayHistoricalSourceReplay[],
): readonly ReplayHistoricalValidatorTrustPrior[] {
  const groups = new Map<string, { readonly league: string; readonly validator_type: string; readonly scores: number[]; readonly weights: number[]; readonly season_ids: Set<string> }>();
  const add = (league: string, validatorType: string, seasonId: string, score: number, weight = score): void => {
    const key = `${league}:${validatorType}`;
    const group = groups.get(key) ?? { league, validator_type: validatorType, scores: [], weights: [], season_ids: new Set<string>() };
    group.scores.push(clamp01(score));
    group.weights.push(clamp01(weight));
    group.season_ids.add(seasonId);
    groups.set(key, group);
  };
  for (const { season, integration } of replays) {
    const feeds = season.feeds;
    const outcomes = feeds.flatMap((feed) => feed.settled_outcomes);
    const signals = feeds.flatMap((feed) => feed.live_signals);
    const odds = feeds.flatMap((feed) => feed.odds_snapshots);
    const injuries = feeds.flatMap((feed) => feed.injury_reports);
    const hitRate = rate(outcomes, (outcome) => outcome.hit === true);
    const clvRate = rate(outcomes, (outcome) => (outcome.clv ?? 0) > 0);
    const signalConfidence = average(signals.map((signal) => signal.confidence / 100));
    const sourceReliability = average(sourcePriors.filter((prior) => prior.league === season.league).map((prior) => prior.reliability_prior));
    add(season.league, "settled_outcome_validator", season.season_id, hitRate, clvRate);
    add(season.league, "odds_snapshot_validator", season.season_id, odds.length > 0 ? clvRate : 0, odds.length > 0 ? 0.7 + (clvRate * 0.3) : 0);
    add(season.league, "injury_report_validator", season.season_id, injuries.length > 0 ? rate(outcomes, (outcome) => outcome.hit === true) : 0, injuries.length > 0 ? signalConfidence : 0);
    add(season.league, "source_intelligence_validator", season.season_id, sourceReliability, sourceReliability);
    add(season.league, "consensus_convergence_validator", season.season_id, integration ? average(integration.governance_adaptation.map((record) => record.promoted_count / Math.max(1, record.governance_decision_count))) : hitRate, signalConfidence);
    for (const cycle of integration?.runtime_snapshot.executed_cycles ?? []) {
      const weightByValidator = new Map(cycle.trust_snapshot.consensus_weight_adaptation.map((record) => [record.validator_id, record.adapted_weight]));
      for (const profile of cycle.trust_snapshot.validator_profiles) {
        add(season.league, profile.validator_id, season.season_id, profile.trust_score, weightByValidator.get(profile.validator_id) ?? profile.trust_score);
      }
    }
  }
  return deepFreeze(Array.from(groups.values()).map((group) => {
    const seed = {
      validator_type: group.validator_type,
      league: group.league,
      season_ids: Array.from(group.season_ids).sort((left, right) => left.localeCompare(right)),
      calibrated_trust_prior: round(average(group.scores)),
      calibrated_weight_prior: round(average(group.weights)),
      sample_count: group.scores.length,
    };
    const hash = computeReplayHistoricalCalibrationHash(seed);
    return {
      prior_id: `historical-validator-prior:${hash}`,
      ...seed,
      prior_hash: hash,
    };
  }).sort((left, right) => left.prior_id.localeCompare(right.prior_id)));
}

function buildConsensusConvergenceBaselines(replays: readonly SeasonRuntimeReplay[]): readonly ReplayHistoricalConsensusConvergenceBaseline[] {
  return deepFreeze(replays.map(({ season, integration }) => {
    const outcomes = season.feeds.flatMap((feed) => feed.settled_outcomes);
    const approval = integration
      ? rate(integration.governance_adaptation, (record) => record.promoted_count >= record.review_count)
      : rate(outcomes, (outcome) => outcome.hit === true);
    const divergence = integration
      ? average(integration.runtime_snapshot.consensus_drift.map((record) => record.drift_score))
      : 1 - approval;
    const seed = {
      league: season.league,
      season_id: season.season_id,
      average_approval_ratio: round(approval),
      average_divergence_ratio: round(clamp01(divergence)),
      convergence_score: round(clamp01((approval * 0.65) + ((1 - divergence) * 0.35))),
    };
    const hash = computeReplayHistoricalCalibrationHash(seed);
    return {
      baseline_id: `historical-consensus-baseline:${hash}`,
      ...seed,
      baseline_hash: hash,
    };
  }));
}

function buildPropagationVelocity(replays: readonly SeasonRuntimeReplay[]): readonly ReplayHistoricalPropagationVelocity[] {
  return deepFreeze(replays.map(({ season, integration }) => {
    const signalCount = season.feeds.reduce((sum, feed) => sum + feed.live_signals.length, 0);
    const cycleCount = Math.max(1, integration?.runtime_snapshot.cycles.length ?? season.feeds.length);
    const streamEvents = integration ? integration.runtime_snapshot.state_stream.length : signalCount + season.feeds.length;
    const seed = {
      league: season.league,
      season_id: season.season_id,
      signal_count: signalCount,
      average_stream_events_per_cycle: round(streamEvents / cycleCount),
      propagation_velocity_score: round(clamp01((signalCount / Math.max(1, cycleCount)) / 10)),
    };
    const hash = computeReplayHistoricalCalibrationHash(seed);
    return {
      velocity_id: `historical-propagation-velocity:${hash}`,
      ...seed,
      velocity_hash: hash,
    };
  }));
}

function buildGovernanceEvolution(replays: readonly SeasonRuntimeReplay[]): readonly ReplayHistoricalGovernanceEvolution[] {
  return deepFreeze(replays.map(({ season, integration }) => {
    const outcomes = season.feeds.flatMap((feed) => feed.settled_outcomes);
    const promoted = integration
      ? integration.governance_adaptation.reduce((sum, record) => sum + record.promoted_count, 0)
      : outcomes.filter((outcome) => outcome.hit === true).length;
    const review = integration
      ? integration.governance_adaptation.reduce((sum, record) => sum + record.review_count, 0)
      : outcomes.filter((outcome) => outcome.hit !== true).length;
    const decisionCount = integration
      ? integration.governance_adaptation.reduce((sum, record) => sum + record.governance_decision_count, 0)
      : outcomes.length;
    const seed = {
      league: season.league,
      season_id: season.season_id,
      decision_count: decisionCount,
      promotion_count: promoted,
      review_count: review,
      governance_stability_score: round(clamp01((promoted + 1) / Math.max(1, decisionCount + 1))),
    };
    const hash = computeReplayHistoricalCalibrationHash(seed);
    return {
      evolution_id: `historical-governance-evolution:${hash}`,
      ...seed,
      evolution_hash: hash,
    };
  }));
}

function buildDriftComparison(
  consensus: readonly ReplayHistoricalConsensusConvergenceBaseline[],
  replays: readonly SeasonRuntimeReplay[],
): readonly ReplayHistoricalDriftComparison[] {
  const baseline = average(consensus.map((record) => record.average_divergence_ratio));
  return deepFreeze(replays.map(({ season }) => {
    const convergence = consensus.find((record) => record.season_id === season.season_id);
    const driftScore = convergence?.average_divergence_ratio ?? baseline;
    const seed = {
      league: season.league,
      season_id: season.season_id,
      historical_drift_score: round(driftScore),
      baseline_drift_score: round(baseline),
      drift_delta: round(Math.abs(driftScore - baseline)),
    };
    const hash = computeReplayHistoricalCalibrationHash(seed);
    return {
      drift_id: `historical-drift-comparison:${hash}`,
      ...seed,
      drift_hash: hash,
    };
  }));
}

function buildIntelligenceLineage(replays: readonly SeasonRuntimeReplay[]): readonly ReplayHistoricalIntelligenceLineage[] {
  return deepFreeze(replays.map(({ season, integration, historical_hash }) => {
    const seed = {
      league: season.league,
      season_id: season.season_id,
      runtime_hash: integration?.runtime_snapshot.deterministic_hash ?? historical_hash,
      observability_hash: integration?.observability_snapshot.deterministic_hash ?? computeReplayHistoricalCalibrationHash({ historical_hash, kind: "observability" }),
      production_hash: integration?.production_snapshot.deterministic_hash ?? computeReplayHistoricalCalibrationHash({ historical_hash, kind: "production" }),
      lineage_depth: season.feeds.reduce((sum, feed) => sum + feed.raw_events.length + feed.live_signals.length + feed.settled_outcomes.length, 0) + (integration ? 3 : 1),
    };
    const hash = computeReplayHistoricalCalibrationHash(seed);
    return {
      lineage_id: `historical-intelligence-lineage:${hash}`,
      ...seed,
      lineage_hash: hash,
    };
  }));
}

function buildObservability(
  input: ReplayHistoricalCalibrationInput,
  sourcePriors: readonly ReplayHistoricalSourceReplay[],
  validatorPriors: readonly ReplayHistoricalValidatorTrustPrior[],
  consensus: readonly ReplayHistoricalConsensusConvergenceBaseline[],
  drift: readonly ReplayHistoricalDriftComparison[],
): ReplayHistoricalCalibrationObservability {
  const seed = {
    season_count: input.seasons.length,
    league_count: new Set(input.seasons.map((season) => season.league)).size,
    source_prior_count: sourcePriors.length,
    validator_prior_count: validatorPriors.length,
    average_convergence_score: round(average(consensus.map((record) => record.convergence_score))),
    average_drift_delta: round(average(drift.map((record) => record.drift_delta))),
  };
  const hash = computeReplayHistoricalCalibrationHash(seed);
  return deepFreeze({
    observability_id: `historical-calibration-observability:${hash}`,
    ...seed,
    observability_hash: hash,
  });
}

function classifyCalibrationState(
  seasons: readonly ReplayHistoricalSeasonInput[],
  consensus: readonly ReplayHistoricalConsensusConvergenceBaseline[],
  drift: readonly ReplayHistoricalDriftComparison[],
): ReplayHistoricalCalibrationState {
  if (seasons.length < 2 || seasons.every((season) => season.feeds.length === 0)) return "insufficient_history";
  if (drift.some((record) => record.drift_delta > 0.22)) return "drifting";
  const convergence = average(consensus.map((record) => record.convergence_score));
  if (convergence >= 0.68) return "stable";
  if (convergence >= 0.48) return "converging";
  return "calibrating";
}

function persistReplayHistoricalCalibrationSnapshot(
  db: SqliteDatabase,
  snapshot: ReplayHistoricalCalibrationSnapshot,
): void {
  const write = db.transaction(() => {
    db.prepare(`
      INSERT OR REPLACE INTO replay_historical_calibration_snapshots
      (calibration_id, generated_at, persisted_at, state, deterministic_hash, payload)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(snapshot.calibration_id, snapshot.generated_at, snapshot.persisted_at, snapshot.state, snapshot.deterministic_hash, stableHistoricalStringify(snapshot));
    for (const record of snapshot.odds_movement_replays) persistView(db, snapshot, "odds_movement_replays", record.odds_replay_id, record.odds_replay_hash, record);
    for (const record of snapshot.injury_intelligence_replays) persistView(db, snapshot, "injury_intelligence_replays", record.injury_replay_id, record.injury_replay_hash, record);
    for (const record of snapshot.source_replay_priors) persistView(db, snapshot, "source_replay_priors", record.source_replay_id, record.source_replay_hash, record);
    for (const record of snapshot.validator_trust_priors) persistView(db, snapshot, "validator_trust_priors", record.prior_id, record.prior_hash, record);
    for (const record of snapshot.consensus_convergence_baselines) persistView(db, snapshot, "consensus_convergence_baselines", record.baseline_id, record.baseline_hash, record);
    for (const record of snapshot.propagation_velocity) persistView(db, snapshot, "propagation_velocity", record.velocity_id, record.velocity_hash, record);
    for (const record of snapshot.governance_evolution) persistView(db, snapshot, "governance_evolution", record.evolution_id, record.evolution_hash, record);
    for (const record of snapshot.drift_comparison) persistView(db, snapshot, "drift_comparison", record.drift_id, record.drift_hash, record);
    for (const record of snapshot.intelligence_lineage) persistView(db, snapshot, "intelligence_lineage", record.lineage_id, record.lineage_hash, record);
    persistView(db, snapshot, "observability", snapshot.observability.observability_id, snapshot.observability.observability_hash, snapshot.observability);
  });
  write();
}

function persistView(
  db: SqliteDatabase,
  snapshot: ReplayHistoricalCalibrationSnapshot,
  viewKind: string,
  viewId: string,
  viewHash: string,
  payload: unknown,
): void {
  db.prepare(`
    INSERT OR REPLACE INTO replay_historical_calibration_views
    (view_id, calibration_id, view_kind, view_hash, payload)
    VALUES (?, ?, ?, ?, ?)
  `).run(viewId, snapshot.calibration_id, viewKind, viewHash, stableHistoricalStringify(payload));
}

function getCalibrationViewList<T>(
  db: SqliteDatabase,
  calibrationId: string,
  viewKind: string,
): readonly T[] {
  initializeReplayHistoricalCalibrationSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_historical_calibration_views
    WHERE calibration_id = ? AND view_kind = ?
    ORDER BY view_hash ASC
  `).all(calibrationId, viewKind) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as T));
}

function rate<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  if (items.length === 0) return 0;
  return items.filter(predicate).length / items.length;
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

function stableHistoricalStringify(value: unknown): string {
  return JSON.stringify(sortHistoricalKeys(value));
}

function sortHistoricalKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortHistoricalKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortHistoricalKeys((value as Record<string, unknown>)[key]);
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
