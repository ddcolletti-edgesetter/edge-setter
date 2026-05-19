import crypto from "node:crypto";

import type Database from "better-sqlite3";

import {
  initializeReplayLiveIntelligenceBridgeSchema,
} from "./replay-live-intelligence-bridge";
import type {
  ReplayConsensusValidatorResult,
} from "./replay-consensus-contract";
import type {
  ReplayLiveCanonicalRecord,
} from "./replay-live-intelligence-bridge-contract";
import type {
  LiveSignal,
  Outcome,
  SignalSource,
} from "./types";
import type {
  ReplayConfidenceRecalibrationRecord,
  ReplayConsensusWeightAdaptation,
  ReplaySourceReliabilityEvolution,
  ReplayTrustDecayRecoveryRecord,
  ReplayTrustLineageReference,
  ReplayValidatorOutcomeScore,
  ReplayValidatorPerformanceRecord,
  ReplayValidatorTrustAction,
  ReplayValidatorTrustInput,
  ReplayValidatorTrustProfile,
  ReplayValidatorTrustQuery,
  ReplayValidatorTrustSnapshot,
  ReplayValidatorTrustState,
} from "./replay-validator-trust-contract";

type SqliteDatabase = Database.Database;

interface PayloadRow {
  readonly payload: string;
}

const DEFAULT_DECAY_FLOOR = 55;
const DEFAULT_RECOVERY_THRESHOLD = 72;

const SUPPORTED_ACTIONS: readonly ReplayValidatorTrustAction[] = [
  "score_outcome_accuracy",
  "track_historical_performance",
  "evolve_source_reliability",
  "apply_trust_decay",
  "recover_trust",
  "recalibrate_confidence",
  "adapt_consensus_weight",
  "persist_validator_intelligence",
  "record_trust_lineage",
  "freeze_trust_snapshot",
];

const SUPPORTED_QUERIES: readonly ReplayValidatorTrustQuery[] = [
  "get_validator_outcome_scores",
  "get_validator_performance_history",
  "get_source_reliability_evolution",
  "get_trust_decay_recovery_history",
  "get_confidence_recalibration_history",
  "get_consensus_weight_adaptation",
  "get_trust_lineage_history",
];

export function initializeReplayValidatorTrustSchema(db: SqliteDatabase): void {
  initializeReplayLiveIntelligenceBridgeSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS replay_validator_trust_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      state TEXT NOT NULL,
      deterministic_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_validator_trust_snapshots_run
      ON replay_validator_trust_snapshots(run_id, generated_at DESC, snapshot_id DESC);

    CREATE TABLE IF NOT EXISTS replay_validator_outcome_scores (
      score_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      validator_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      outcome_score REAL NOT NULL,
      score_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_validator_outcome_scores_validator
      ON replay_validator_outcome_scores(run_id, validator_id, replay_hash);

    CREATE TABLE IF NOT EXISTS replay_validator_performance_history (
      performance_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      validator_id TEXT NOT NULL,
      average_outcome_score REAL NOT NULL,
      performance_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replay_source_reliability_evolution (
      reliability_hash TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      evolved_reliability_score REAL NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replay_validator_trust_profiles (
      profile_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      validator_id TEXT NOT NULL,
      trust_score REAL NOT NULL,
      state TEXT NOT NULL,
      profile_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replay_validator_trust_lineage (
      reference_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      validator_id TEXT NOT NULL,
      reference_kind TEXT NOT NULL,
      reference_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);
}

export function buildReplayValidatorTrustSnapshot(
  db: SqliteDatabase,
  input: ReplayValidatorTrustInput,
): ReplayValidatorTrustSnapshot {
  initializeReplayValidatorTrustSchema(db);

  const outcomeScores = buildOutcomeScores(input);
  const performanceHistory = buildPerformanceHistory(input, outcomeScores);
  const sourceReliability = buildSourceReliability(input);
  const confidenceRecalibration = buildConfidenceRecalibration(performanceHistory);
  const consensusWeightAdaptation = buildConsensusWeightAdaptation(input, performanceHistory);
  const decayRecoveryHistory = buildDecayRecoveryHistory(input, performanceHistory, confidenceRecalibration);
  const validatorProfiles = buildValidatorProfiles(
    input,
    outcomeScores,
    performanceHistory,
    confidenceRecalibration,
    consensusWeightAdaptation,
    decayRecoveryHistory,
  );
  const trustLineage = buildTrustLineage(input, outcomeScores, sourceReliability, validatorProfiles);
  const state = classifySnapshotState(validatorProfiles);
  const seed = {
    run_id: input.run_id,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    outcome_hashes: outcomeScores.map((score) => score.score_hash),
    performance_hashes: performanceHistory.map((record) => record.performance_hash),
    source_reliability_hashes: sourceReliability.map((record) => record.reliability_hash),
    decay_hashes: decayRecoveryHistory.map((record) => record.transition_hash),
    recalibration_hashes: confidenceRecalibration.map((record) => record.recalibration_hash),
    weight_hashes: consensusWeightAdaptation.map((record) => record.adaptation_hash),
    profile_hashes: validatorProfiles.map((profile) => profile.profile_hash),
    lineage_hashes: trustLineage.map((reference) => reference.reference_hash),
    bridge_hash: input.bridge_snapshot.deterministic_hash,
  };
  const deterministicHash = computeReplayValidatorTrustHash(seed);
  const snapshot = deepFreeze({
    snapshot_id: `replay-validator-trust:${deterministicHash}`,
    run_id: input.run_id,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    outcome_scores: outcomeScores,
    performance_history: performanceHistory,
    source_reliability: sourceReliability,
    decay_recovery_history: decayRecoveryHistory,
    confidence_recalibration: confidenceRecalibration,
    consensus_weight_adaptation: consensusWeightAdaptation,
    validator_profiles: validatorProfiles,
    trust_lineage: trustLineage,
    supported_actions: SUPPORTED_ACTIONS,
    supported_queries: SUPPORTED_QUERIES,
    deterministic_hash: deterministicHash,
  });

  persistReplayValidatorTrustSnapshot(db, snapshot);
  return snapshot;
}

export function getValidatorOutcomeScores(
  db: SqliteDatabase,
  runId: string,
  validatorId?: string,
): readonly ReplayValidatorOutcomeScore[] {
  initializeReplayValidatorTrustSchema(db);
  const rows = validatorId
    ? db.prepare(`
      SELECT payload FROM replay_validator_outcome_scores
      WHERE run_id = ? AND validator_id = ?
      ORDER BY replay_hash ASC, score_hash ASC
    `).all(runId, validatorId) as PayloadRow[]
    : db.prepare(`
      SELECT payload FROM replay_validator_outcome_scores
      WHERE run_id = ?
      ORDER BY validator_id ASC, replay_hash ASC, score_hash ASC
    `).all(runId) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayValidatorOutcomeScore));
}

export function getValidatorPerformanceHistory(
  db: SqliteDatabase,
  runId: string,
): readonly ReplayValidatorPerformanceRecord[] {
  initializeReplayValidatorTrustSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_validator_performance_history
    WHERE run_id = ?
    ORDER BY validator_id ASC, performance_hash ASC
  `).all(runId) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayValidatorPerformanceRecord));
}

export function getSourceReliabilityEvolution(
  db: SqliteDatabase,
  runId: string,
): readonly ReplaySourceReliabilityEvolution[] {
  initializeReplayValidatorTrustSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_source_reliability_evolution
    WHERE run_id = ?
    ORDER BY source_id ASC, reliability_hash ASC
  `).all(runId) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplaySourceReliabilityEvolution));
}

export function getTrustLineageHistory(
  db: SqliteDatabase,
  runId: string,
): readonly ReplayTrustLineageReference[] {
  initializeReplayValidatorTrustSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_validator_trust_lineage
    WHERE run_id = ?
    ORDER BY replay_hash ASC, validator_id ASC, reference_kind ASC
  `).all(runId) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayTrustLineageReference));
}

export function serializeReplayValidatorTrustSnapshot(snapshot: ReplayValidatorTrustSnapshot): string {
  return stableValidatorTrustStringify(snapshot);
}

export function computeReplayValidatorTrustHash(value: unknown): string {
  return crypto.createHash("sha256").update(stableValidatorTrustStringify(value)).digest("hex");
}

function buildOutcomeScores(input: ReplayValidatorTrustInput): readonly ReplayValidatorOutcomeScore[] {
  const signalById = new Map(input.live_signals.map((signal) => [signal.id, signal]));
  const outcomeBySignal = new Map(input.settled_outcomes.map((outcome) => [outcome.signal_id, outcome]));
  const canonicalByReplay = new Map(input.bridge_snapshot.adapter.canonical_records.map((record) => [record.replay_hash, record]));
  const records: ReplayValidatorOutcomeScore[] = [];

  for (const consensus of input.bridge_snapshot.consensus_results) {
    const canonical = canonicalByReplay.get(consensus.replay_hash);
    const signal = canonical?.signal_id ? signalById.get(canonical.signal_id) : findSignalForCanonical(input.live_signals, canonical);
    const outcome = signal ? outcomeBySignal.get(signal.id) : null;
    if (!signal || !outcome) continue;

    for (const validator of consensus.validators) {
      const score = scoreValidatorOutcome(validator, consensus.vote_aggregation.approval_ratio, canonical, signal, outcome, input);
      records.push(score);
    }
  }

  return deepFreeze(records.sort((left, right) =>
    left.validator_id.localeCompare(right.validator_id) ||
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.score_hash.localeCompare(right.score_hash),
  ));
}

function scoreValidatorOutcome(
  validator: ReplayConsensusValidatorResult,
  approvalRatio: number,
  canonical: ReplayLiveCanonicalRecord | undefined,
  signal: LiveSignal,
  outcome: Outcome,
  input: ReplayValidatorTrustInput,
): ReplayValidatorOutcomeScore {
  const outcomePositive = outcome.hit === true || (outcome.clv ?? 0) > 0;
  const voteAligned = (validator.vote === "approve" && outcomePositive) || (validator.vote === "diverge" && !outcomePositive);
  const sportsAccuracyScore = voteAligned ? 100 : validator.vote === "abstain" ? 58 : 28;
  const clvScore = outcome.clv === null ? 50 : Math.max(0, Math.min(100, 50 + (outcome.clv * 12)));
  const injuryReliabilityScore = signal.signal_type === "injury_update"
    ? injuryReliability(signal, input)
    : 72;
  const sourceConfirmationScore = sourceConfirmation(signal, input);
  const consensusConvergenceScore = Math.max(0, Math.min(100, approvalRatio * 100));
  const outcomeScore = roundTrustNumber(
    (sportsAccuracyScore * 0.36) +
    (clvScore * 0.2) +
    (injuryReliabilityScore * 0.16) +
    (sourceConfirmationScore * 0.14) +
    (consensusConvergenceScore * 0.14),
  );
  const seed = {
    run_id: input.run_id,
    validator_id: validator.validator_id,
    validator_type: validator.validator_type,
    replay_hash: validator.lineage_reference.replay_hash,
    signal_id: signal.id,
    outcome_id: outcome.id,
    vote: validator.vote,
    hit: outcome.hit,
    clv: outcome.clv,
    sports_accuracy_score: sportsAccuracyScore,
    clv_score: roundTrustNumber(clvScore),
    injury_reliability_score: roundTrustNumber(injuryReliabilityScore),
    source_confirmation_score: roundTrustNumber(sourceConfirmationScore),
    consensus_convergence_score: roundTrustNumber(consensusConvergenceScore),
    outcome_score: outcomeScore,
    canonical_hash: canonical?.deterministic_hash ?? null,
  };
  const scoreHash = computeReplayValidatorTrustHash(seed);

  return {
    score_id: `replay-validator-outcome-score:${scoreHash}`,
    ...seed,
    score_hash: scoreHash,
  };
}

function buildPerformanceHistory(
  input: ReplayValidatorTrustInput,
  scores: readonly ReplayValidatorOutcomeScore[],
): readonly ReplayValidatorPerformanceRecord[] {
  const validatorIds = Array.from(new Set(scores.map((score) => score.validator_id))).sort((left, right) => left.localeCompare(right));
  return deepFreeze(validatorIds.map((validatorId) => {
    const validatorScores = scores.filter((score) => score.validator_id === validatorId);
    const scoredOutcomes = validatorScores.length;
    const hits = validatorScores.filter((score) => score.hit === true).length;
    const losses = validatorScores.filter((score) => score.hit === false).length;
    const clvs = validatorScores.map((score) => score.clv).filter((value): value is number => value !== null);
    const averageOutcomeScore = roundTrustNumber(average(validatorScores.map((score) => score.outcome_score)));
    const consensusAlignment = roundTrustNumber(average(validatorScores.map((score) => score.consensus_convergence_score)) / 100);
    const confidenceError = roundTrustNumber(average(validatorScores.map((score) => {
      const predicted = input.bridge_snapshot.consensus_results
        .find((result) => result.replay_hash === score.replay_hash)
        ?.validators.find((validator) => validator.validator_id === score.validator_id)
        ?.propagated_confidence ?? 50;
      return Math.abs(predicted - score.sports_accuracy_score);
    })));
    const seed = {
      run_id: input.run_id,
      validator_id: validatorId,
      validator_type: validatorScores[0]?.validator_type ?? "unknown",
      scored_outcomes: scoredOutcomes,
      hit_rate: hits + losses === 0 ? null : roundTrustNumber(hits / (hits + losses)),
      average_clv: clvs.length === 0 ? null : roundTrustNumber(average(clvs)),
      average_outcome_score: averageOutcomeScore,
      consensus_alignment: consensusAlignment,
      confidence_error: confidenceError,
    };
    const performanceHash = computeReplayValidatorTrustHash(seed);
    return {
      performance_id: `replay-validator-performance:${performanceHash}`,
      ...seed,
      performance_hash: performanceHash,
    };
  }));
}

function buildSourceReliability(input: ReplayValidatorTrustInput): readonly ReplaySourceReliabilityEvolution[] {
  const outcomesBySignal = new Map(input.settled_outcomes.map((outcome) => [outcome.signal_id, outcome]));
  const sourceRecords = new Map<string, {
    readonly source: SignalSource;
    readonly league: string | null;
    outcomes: Outcome[];
    signals: LiveSignal[];
    previous: number;
  }>();

  for (const signal of input.live_signals) {
    const outcome = outcomesBySignal.get(signal.id);
    if (!outcome) continue;
    for (const source of signal.sources) {
      const key = source.name;
      const previous = input.source_intelligence_events.find((event) =>
        event.source_name === source.name || event.source_id === source.name,
      )?.reliability_score ?? 70;
      const current = sourceRecords.get(key) ?? { source, league: signal.league, outcomes: [], signals: [], previous };
      current.outcomes.push(outcome);
      current.signals.push(signal);
      sourceRecords.set(key, current);
    }
  }

  return deepFreeze(Array.from(sourceRecords.entries()).map(([sourceId, record]) => {
    const wins = record.outcomes.filter((outcome) => outcome.hit === true).length;
    const losses = record.outcomes.filter((outcome) => outcome.hit === false).length;
    const clvs = record.outcomes.map((outcome) => outcome.clv).filter((value): value is number => value !== null);
    const injurySignals = record.signals.filter((signal) => signal.signal_type === "injury_update");
    const hitRate = wins + losses === 0 ? null : wins / (wins + losses);
    const averageClv = clvs.length === 0 ? null : average(clvs);
    const confirmationAccuracy = roundTrustNumber(average(record.signals.map((signal) =>
      signal.verdict === "confirmed" || signal.verdict === "likely" ? 1 : 0.45,
    )));
    const injuryAccuracy = injurySignals.length === 0
      ? null
      : roundTrustNumber(average(injurySignals.map((signal) =>
        outcomesBySignal.get(signal.id)?.hit === true ? 1 : 0.42,
      )));
    const evolved = roundTrustNumber(Math.max(0, Math.min(100,
      (record.previous * 0.44) +
      ((hitRate ?? 0.5) * 100 * 0.26) +
      ((averageClv === null ? 50 : Math.max(0, Math.min(100, 50 + averageClv * 10))) * 0.16) +
      (confirmationAccuracy * 100 * 0.14),
    )));
    const seed = {
      source_id: sourceId,
      source_name: record.source.name,
      source_type: record.source.type,
      league: record.league,
      settled_signal_count: record.outcomes.length,
      hit_rate: hitRate === null ? null : roundTrustNumber(hitRate),
      average_clv: averageClv === null ? null : roundTrustNumber(averageClv),
      confirmation_accuracy: confirmationAccuracy,
      injury_accuracy: injuryAccuracy,
      previous_reliability_score: record.previous,
      evolved_reliability_score: evolved,
      reliability_delta: roundTrustNumber(evolved - record.previous),
    };
    return {
      ...seed,
      reliability_hash: computeReplayValidatorTrustHash(seed),
    };
  }).sort((left, right) => left.source_id.localeCompare(right.source_id)));
}

function buildConfidenceRecalibration(
  performance: readonly ReplayValidatorPerformanceRecord[],
): readonly ReplayConfidenceRecalibrationRecord[] {
  return deepFreeze(performance.map((record) => {
    const previousConfidence = Math.max(0, Math.min(100, 100 - record.confidence_error));
    const observedAccuracy = record.average_outcome_score;
    const recalibratedConfidence = roundTrustNumber((previousConfidence * 0.52) + (observedAccuracy * 0.48));
    const seed = {
      validator_id: record.validator_id,
      validator_type: record.validator_type,
      previous_confidence: roundTrustNumber(previousConfidence),
      observed_accuracy: observedAccuracy,
      confidence_error: record.confidence_error,
      recalibrated_confidence: recalibratedConfidence,
    };
    const recalibrationHash = computeReplayValidatorTrustHash(seed);
    return {
      recalibration_id: `replay-confidence-recalibration:${recalibrationHash}`,
      ...seed,
      recalibration_hash: recalibrationHash,
    };
  }));
}

function buildConsensusWeightAdaptation(
  input: ReplayValidatorTrustInput,
  performance: readonly ReplayValidatorPerformanceRecord[],
): readonly ReplayConsensusWeightAdaptation[] {
  return deepFreeze(performance.map((record) => {
    const weights = input.bridge_snapshot.consensus_results.flatMap((result) =>
      result.validators.filter((validator) => validator.validator_id === record.validator_id).map((validator) => validator.weight),
    );
    const previousWeight = roundTrustNumber(average(weights));
    const performanceScore = record.average_outcome_score / 100;
    const trustScore = roundTrustNumber((record.average_outcome_score * 0.7) + (record.consensus_alignment * 100 * 0.3));
    const adaptedWeight = roundTrustNumber(Math.max(0.1, Math.min(2.5, previousWeight * (0.55 + performanceScore))));
    const seed = {
      validator_id: record.validator_id,
      validator_type: record.validator_type,
      previous_weight: previousWeight,
      adapted_weight: adaptedWeight,
      trust_score: trustScore,
      performance_score: roundTrustNumber(performanceScore),
    };
    const adaptationHash = computeReplayValidatorTrustHash(seed);
    return {
      adaptation_id: `replay-consensus-weight-adaptation:${adaptationHash}`,
      ...seed,
      adaptation_hash: adaptationHash,
    };
  }));
}

function buildDecayRecoveryHistory(
  input: ReplayValidatorTrustInput,
  performance: readonly ReplayValidatorPerformanceRecord[],
  recalibrations: readonly ReplayConfidenceRecalibrationRecord[],
): readonly ReplayTrustDecayRecoveryRecord[] {
  return deepFreeze(performance.map((record) => {
    const recalibration = required(recalibrations.find((item) => item.validator_id === record.validator_id), "recalibration missing");
    const fromTrustScore = Math.max(0, Math.min(100, 100 - record.confidence_error * 0.5));
    const toTrustScore = roundTrustNumber((record.average_outcome_score * 0.62) + (recalibration.recalibrated_confidence * 0.38));
    const state = stateForTrust(toTrustScore, input.decay_floor ?? DEFAULT_DECAY_FLOOR, input.recovery_threshold ?? DEFAULT_RECOVERY_THRESHOLD);
    const action: ReplayValidatorTrustAction = toTrustScore < fromTrustScore
      ? "apply_trust_decay"
      : "recover_trust";
    const seed = {
      validator_id: record.validator_id,
      from_trust_score: roundTrustNumber(fromTrustScore),
      to_trust_score: toTrustScore,
      delta: roundTrustNumber(toTrustScore - fromTrustScore),
      state,
      action,
      reason: trustReason(state, action),
    };
    const transitionHash = computeReplayValidatorTrustHash(seed);
    return {
      transition_id: `replay-trust-transition:${transitionHash}`,
      ...seed,
      transition_hash: transitionHash,
    };
  }));
}

function buildValidatorProfiles(
  input: ReplayValidatorTrustInput,
  outcomeScores: readonly ReplayValidatorOutcomeScore[],
  performance: readonly ReplayValidatorPerformanceRecord[],
  recalibrations: readonly ReplayConfidenceRecalibrationRecord[],
  adaptations: readonly ReplayConsensusWeightAdaptation[],
  transitions: readonly ReplayTrustDecayRecoveryRecord[],
): readonly ReplayValidatorTrustProfile[] {
  return deepFreeze(performance.map((record) => {
    const scores = outcomeScores.filter((score) => score.validator_id === record.validator_id);
    const recalibration = required(recalibrations.find((item) => item.validator_id === record.validator_id), "recalibration missing");
    const adaptation = required(adaptations.find((item) => item.validator_id === record.validator_id), "adaptation missing");
    const transition = required(transitions.find((item) => item.validator_id === record.validator_id), "transition missing");
    const seed = {
      run_id: input.run_id,
      validator_id: record.validator_id,
      validator_type: record.validator_type,
      trust_score: transition.to_trust_score,
      state: transition.state,
      outcome_score_hashes: scores.map((score) => score.score_hash).sort((left, right) => left.localeCompare(right)),
      performance_hash: record.performance_hash,
      recalibration_hash: recalibration.recalibration_hash,
      weight_adaptation_hash: adaptation.adaptation_hash,
    };
    const profileHash = computeReplayValidatorTrustHash(seed);
    return {
      profile_id: `replay-validator-trust-profile:${profileHash}`,
      ...seed,
      profile_hash: profileHash,
    };
  }).sort((left, right) =>
    left.validator_id.localeCompare(right.validator_id) ||
    left.profile_hash.localeCompare(right.profile_hash),
  ));
}

function buildTrustLineage(
  input: ReplayValidatorTrustInput,
  scores: readonly ReplayValidatorOutcomeScore[],
  sourceReliability: readonly ReplaySourceReliabilityEvolution[],
  profiles: readonly ReplayValidatorTrustProfile[],
): readonly ReplayTrustLineageReference[] {
  const references: ReplayTrustLineageReference[] = [];
  for (const score of scores) {
    const profile = profiles.find((item) => item.validator_id === score.validator_id);
    const source = sourceReliability[0];
    const sourceItems = [
      { reference_kind: "live_bridge" as const, source_hash: input.bridge_snapshot.deterministic_hash },
      { reference_kind: "consensus_result" as const, source_hash: input.bridge_snapshot.consensus_results.find((result) => result.replay_hash === score.replay_hash)?.consensus_hash ?? score.score_hash },
      { reference_kind: "governance" as const, source_hash: input.bridge_snapshot.governance_snapshot.deterministic_hash },
      { reference_kind: "outcome" as const, source_hash: score.outcome_id ?? score.score_hash },
      { reference_kind: "source_reliability" as const, source_hash: source?.reliability_hash ?? score.score_hash },
      { reference_kind: "validator_profile" as const, source_hash: profile?.profile_hash ?? score.score_hash },
    ];
    for (const item of sourceItems) {
      const seed = {
        run_id: input.run_id,
        replay_hash: score.replay_hash,
        validator_id: score.validator_id,
        source_hash: item.source_hash,
        reference_kind: item.reference_kind,
      };
      const referenceHash = computeReplayValidatorTrustHash(seed);
      references.push({
        reference_id: `replay-validator-trust-lineage:${referenceHash}`,
        ...seed,
        reference_hash: referenceHash,
      });
    }
  }
  return deepFreeze(references.sort((left, right) =>
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.validator_id.localeCompare(right.validator_id) ||
    left.reference_kind.localeCompare(right.reference_kind),
  ));
}

function persistReplayValidatorTrustSnapshot(db: SqliteDatabase, snapshot: ReplayValidatorTrustSnapshot): void {
  const write = db.transaction(() => {
    db.prepare(`
      INSERT OR REPLACE INTO replay_validator_trust_snapshots
      (snapshot_id, run_id, generated_at, persisted_at, state, deterministic_hash, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(snapshot.snapshot_id, snapshot.run_id, snapshot.generated_at, snapshot.persisted_at, snapshot.state, snapshot.deterministic_hash, stableValidatorTrustStringify(snapshot));

    for (const score of snapshot.outcome_scores) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_validator_outcome_scores
        (score_id, run_id, validator_id, replay_hash, outcome_score, score_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(score.score_id, snapshot.run_id, score.validator_id, score.replay_hash, score.outcome_score, score.score_hash, stableValidatorTrustStringify(score));
    }

    for (const record of snapshot.performance_history) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_validator_performance_history
        (performance_id, run_id, validator_id, average_outcome_score, performance_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(record.performance_id, snapshot.run_id, record.validator_id, record.average_outcome_score, record.performance_hash, stableValidatorTrustStringify(record));
    }

    for (const record of snapshot.source_reliability) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_source_reliability_evolution
        (reliability_hash, run_id, source_id, evolved_reliability_score, payload)
        VALUES (?, ?, ?, ?, ?)
      `).run(record.reliability_hash, snapshot.run_id, record.source_id, record.evolved_reliability_score, stableValidatorTrustStringify(record));
    }

    for (const profile of snapshot.validator_profiles) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_validator_trust_profiles
        (profile_id, run_id, validator_id, trust_score, state, profile_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(profile.profile_id, snapshot.run_id, profile.validator_id, profile.trust_score, profile.state, profile.profile_hash, stableValidatorTrustStringify(profile));
    }

    for (const reference of snapshot.trust_lineage) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_validator_trust_lineage
        (reference_id, run_id, replay_hash, validator_id, reference_kind, reference_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(reference.reference_id, snapshot.run_id, reference.replay_hash, reference.validator_id, reference.reference_kind, reference.reference_hash, stableValidatorTrustStringify(reference));
    }
  });
  write();
}

function findSignalForCanonical(
  signals: readonly LiveSignal[],
  canonical: ReplayLiveCanonicalRecord | undefined,
): LiveSignal | undefined {
  if (!canonical) return undefined;
  if (canonical.signal_id) return signals.find((signal) => signal.id === canonical.signal_id);
  return signals.find((signal) => signal.game_id === canonical.game_id);
}

function injuryReliability(signal: LiveSignal, input: ReplayValidatorTrustInput): number {
  const report = input.injury_reports.find((item) =>
    item.player === signal.player && item.league === signal.league,
  );
  if (!report) return signal.injury_designation ? 68 : 55;
  const designationMatch = report.designation === signal.injury_designation;
  return designationMatch ? report.confidence : Math.max(25, report.confidence - 32);
}

function sourceConfirmation(signal: LiveSignal, input: ReplayValidatorTrustInput): number {
  const sourceNames = new Set(signal.sources.map((source) => source.name));
  const events = input.source_intelligence_events.filter((event) =>
    sourceNames.has(event.source_name) || sourceNames.has(event.source_id),
  );
  if (events.length === 0) return signal.source_count > 1 ? 74 : 62;
  return average(events.map((event) => event.reliability_score));
}

function stateForTrust(score: number, decayFloor: number, recoveryThreshold: number): ReplayValidatorTrustState {
  if (score >= 86) return "promoted";
  if (score >= recoveryThreshold) return "trusted";
  if (score >= decayFloor) return "recovering";
  if (score >= 42) return "decaying";
  if (score >= 28) return "degraded";
  return "probation";
}

function classifySnapshotState(profiles: readonly ReplayValidatorTrustProfile[]): ReplayValidatorTrustState {
  if (profiles.some((profile) => profile.state === "probation" || profile.state === "degraded")) return "degraded";
  if (profiles.some((profile) => profile.state === "decaying")) return "decaying";
  if (profiles.some((profile) => profile.state === "recovering")) return "recovering";
  if (profiles.length > 0 && profiles.every((profile) => profile.state === "promoted")) return "promoted";
  return "trusted";
}

function trustReason(state: ReplayValidatorTrustState, action: ReplayValidatorTrustAction): string {
  if (action === "recover_trust") return `validator ${state} after outcome-backed recovery`;
  return `validator ${state} after settled outcome decay`;
}

function required<T>(value: T | undefined, message: string): T {
  if (typeof value === "undefined") throw new Error(message);
  return value;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundTrustNumber(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function stableValidatorTrustStringify(value: unknown): string {
  return JSON.stringify(sortValidatorTrustKeys(value));
}

function sortValidatorTrustKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValidatorTrustKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValidatorTrustKeys((value as Record<string, unknown>)[key]);
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
