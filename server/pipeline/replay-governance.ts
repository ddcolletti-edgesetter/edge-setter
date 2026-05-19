import crypto from "node:crypto";

import type Database from "better-sqlite3";

import {
  buildReplayConsensusLineageSnapshot,
} from "./replay-consensus-lineage";
import {
  getLatestArbitrationResult,
  getLatestConsensusResult,
  getRecoveryLineage,
  getReplayOrchestrationRun,
  initializeReplayOrchestrationPersistenceSchema,
} from "./replay-orchestration-persistence";
import type {
  ReplayArbitrationResult,
} from "./replay-arbitration-contract";
import type {
  ReplayConsensusResult,
  ReplayConsensusValidatorResult,
} from "./replay-consensus-contract";
import type {
  ReplayRecoveryCoordinationResult,
} from "./replay-recovery-coordination-contract";
import type {
  ReplayGovernanceAction,
  ReplayGovernanceBranchStatus,
  ReplayGovernanceDecision,
  ReplayGovernanceEscalationRecord,
  ReplayGovernanceInput,
  ReplayGovernanceLineageReference,
  ReplayGovernanceOverrideKind,
  ReplayGovernancePolicy,
  ReplayGovernancePolicyEvaluation,
  ReplayGovernanceQuorumRecord,
  ReplayGovernanceSnapshot,
  ReplayGovernanceState,
  ReplayGovernanceValidatorProfile,
} from "./replay-governance-contract";

type SqliteDatabase = Database.Database;

const DEFAULT_POLICY: ReplayGovernancePolicy = {
  quorum_threshold: 0.66,
  promotion_confidence_threshold: 72,
  review_confidence_threshold: 50,
  quarantine_severity_threshold: 70,
  validator_revoke_threshold: 35,
  validator_reduce_weight_threshold: 60,
};

interface PayloadRow {
  readonly payload: string;
}

interface DecisionRow {
  readonly payload: string;
}

interface ProfileRow {
  readonly payload: string;
}

interface EscalationRow {
  readonly payload: string;
}

interface LineageRow {
  readonly payload: string;
}

interface QuorumRow {
  readonly payload: string;
}

interface RecoveryPayloadRow {
  readonly payload: string;
}

export function initializeReplayGovernanceSchema(db: SqliteDatabase): void {
  initializeReplayOrchestrationPersistenceSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS replay_governance_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      policy_hash TEXT NOT NULL,
      lineage_graph_hash TEXT NOT NULL,
      deterministic_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_governance_snapshots_run
      ON replay_governance_snapshots(run_id, generated_at DESC, snapshot_id DESC);

    CREATE TABLE IF NOT EXISTS replay_governance_decisions (
      decision_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      action TEXT NOT NULL,
      state TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      policy_hash TEXT NOT NULL,
      deterministic_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_governance_decisions_branch
      ON replay_governance_decisions(replay_hash, generated_at DESC, decision_id DESC);

    CREATE TABLE IF NOT EXISTS replay_governance_validator_profiles (
      profile_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      validator_id TEXT NOT NULL,
      trust_score REAL NOT NULL,
      recommended_action TEXT,
      profile_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_governance_profiles_validator
      ON replay_governance_validator_profiles(validator_id, run_id);

    CREATE TABLE IF NOT EXISTS replay_governance_escalations (
      escalation_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      action TEXT NOT NULL,
      state TEXT NOT NULL,
      severity_score REAL NOT NULL,
      generated_at TEXT NOT NULL,
      escalation_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_governance_escalations_branch
      ON replay_governance_escalations(replay_hash, generated_at DESC, escalation_id DESC);

    CREATE TABLE IF NOT EXISTS replay_governance_lineage_references (
      reference_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      lineage_hash TEXT NOT NULL,
      graph_hash TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      reference_kind TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      reference_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_governance_lineage_run
      ON replay_governance_lineage_references(run_id, replay_hash, reference_kind);

    CREATE TABLE IF NOT EXISTS replay_governance_quorum_history (
      quorum_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      quorum_met INTEGER NOT NULL,
      quorum_ratio REAL NOT NULL,
      generated_at TEXT NOT NULL,
      quorum_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_governance_quorum_run
      ON replay_governance_quorum_history(run_id, replay_hash);
  `);
}

export function buildReplayGovernanceSnapshot(
  db: SqliteDatabase,
  input: ReplayGovernanceInput,
): ReplayGovernanceSnapshot {
  initializeReplayGovernanceSchema(db);

  const run = getReplayOrchestrationRun(db, input.run_id);
  if (!run) {
    throw new Error(`Replay orchestration run ${input.run_id} is not persisted.`);
  }

  const policy = normalizePolicy(input.policy);
  const policyHash = deterministicHash(policy);
  const graph = buildReplayConsensusLineageSnapshot(db, input.run_id);
  const replayHashes = collectGovernedReplayHashes(run.targets.map((target) => target.replay_hash), graph.replay_hashes);
  const recoveries = loadRecoveryResults(db, input.run_id);
  const recoveryByReplay = new Map(recoveries.map((recovery) => [recovery.arbitration_reference.replay_hash, recovery]));
  const consensusByReplay = new Map<string, ReplayConsensusResult>();
  const arbitrationByReplay = new Map<string, ReplayArbitrationResult>();

  for (const replayHash of replayHashes) {
    const consensus = getLatestConsensusResult(db, replayHash);
    if (consensus) consensusByReplay.set(replayHash, consensus);
    const arbitration = getLatestArbitrationResult(db, replayHash);
    if (arbitration) arbitrationByReplay.set(replayHash, arbitration);
  }

  const quorumHistory = replayHashes
    .map((replayHash) => buildQuorumRecord(input.run_id, input.generated_at, replayHash, consensusByReplay.get(replayHash)))
    .filter((record): record is ReplayGovernanceQuorumRecord => Boolean(record));
  const lineageReferences = buildLineageReferences(db, {
    runId: input.run_id,
    generatedAt: input.generated_at,
    replayHashes,
    graphHash: graph.graph_hash,
    consensusByReplay,
    arbitrationByReplay,
    recoveryByReplay,
  });
  const decisions = replayHashes.map((replayHash) => {
    const quorum = quorumHistory.find((record) => record.replay_hash === replayHash);
    return buildDecision({
      runId: input.run_id,
      replayHash,
      generatedAt: input.generated_at,
      policy,
      policyHash,
      consensus: consensusByReplay.get(replayHash) ?? null,
      arbitration: arbitrationByReplay.get(replayHash) ?? null,
      recovery: recoveryByReplay.get(replayHash) ?? null,
      quorum,
      lineageReferences: lineageReferences.filter((reference) => reference.replay_hash === replayHash),
    });
  });
  const validatorProfiles = buildValidatorProfiles(input.run_id, policy, Array.from(consensusByReplay.values()));
  const escalations = buildEscalations({
    runId: input.run_id,
    generatedAt: input.generated_at,
    decisions,
    arbitrationByReplay,
  });
  const branchStatuses = buildBranchStatuses(decisions);
  const snapshotSeed = {
    run_id: input.run_id,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    policy_hash: policyHash,
    lineage_graph_hash: graph.graph_hash,
    decision_hashes: decisions.map((decision) => decision.deterministic_hash),
    validator_profile_hashes: validatorProfiles.map((profile) => profile.profile_hash),
    escalation_hashes: escalations.map((escalation) => escalation.escalation_hash),
    lineage_reference_hashes: lineageReferences.map((reference) => reference.reference_hash),
    quorum_hashes: quorumHistory.map((quorum) => quorum.quorum_hash),
    branch_status_hashes: branchStatuses.map((status) => status.status_hash),
  };
  const deterministicSnapshotHash = deterministicHash(snapshotSeed);
  const snapshot = deepFreeze({
    snapshot_id: `replay-governance-snapshot:${deterministicSnapshotHash}`,
    run_id: input.run_id,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    policy,
    policy_hash: policyHash,
    lineage_graph_hash: graph.graph_hash,
    decisions,
    validator_profiles: validatorProfiles,
    escalations,
    lineage_references: lineageReferences,
    quorum_history: quorumHistory,
    branch_statuses: branchStatuses,
    deterministic_hash: deterministicSnapshotHash,
  });

  persistReplayGovernanceSnapshot(db, snapshot);
  return snapshot;
}

export function getReplayGovernanceHistory(
  db: SqliteDatabase,
  runId: string,
): readonly ReplayGovernanceDecision[] {
  initializeReplayGovernanceSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_governance_decisions
    WHERE run_id = ?
    ORDER BY generated_at ASC, replay_hash ASC, decision_id ASC
  `).all(runId) as DecisionRow[];

  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayGovernanceDecision));
}

export function getValidatorGovernanceProfile(
  db: SqliteDatabase,
  validatorId: string,
): ReplayGovernanceValidatorProfile | null {
  initializeReplayGovernanceSchema(db);
  const row = db.prepare(`
    SELECT payload FROM replay_governance_validator_profiles
    WHERE validator_id = ?
    ORDER BY run_id DESC, profile_id DESC
    LIMIT 1
  `).get(validatorId) as ProfileRow | undefined;

  return row ? deepFreeze(JSON.parse(row.payload) as ReplayGovernanceValidatorProfile) : null;
}

export function getBranchGovernanceStatus(
  db: SqliteDatabase,
  replayHash: string,
): ReplayGovernanceBranchStatus | null {
  initializeReplayGovernanceSchema(db);
  const row = db.prepare(`
    SELECT payload FROM replay_governance_decisions
    WHERE replay_hash = ?
    ORDER BY generated_at DESC, decision_id DESC
    LIMIT 1
  `).get(replayHash) as PayloadRow | undefined;
  if (!row) return null;

  const decision = JSON.parse(row.payload) as ReplayGovernanceDecision;
  return deepFreeze(buildBranchStatuses([decision])[0] ?? null);
}

export function getGovernanceEscalationHistory(
  db: SqliteDatabase,
  replayHash: string,
): readonly ReplayGovernanceEscalationRecord[] {
  initializeReplayGovernanceSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_governance_escalations
    WHERE replay_hash = ?
    ORDER BY generated_at ASC, escalation_id ASC
  `).all(replayHash) as EscalationRow[];

  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayGovernanceEscalationRecord));
}

export function getGovernanceLineage(
  db: SqliteDatabase,
  runId: string,
): readonly ReplayGovernanceLineageReference[] {
  initializeReplayGovernanceSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_governance_lineage_references
    WHERE run_id = ?
    ORDER BY replay_hash ASC, reference_kind ASC, reference_id ASC
  `).all(runId) as LineageRow[];

  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayGovernanceLineageReference));
}

export function getGovernanceQuorumHistory(
  db: SqliteDatabase,
  runId: string,
): readonly ReplayGovernanceQuorumRecord[] {
  initializeReplayGovernanceSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_governance_quorum_history
    WHERE run_id = ?
    ORDER BY replay_hash ASC, quorum_id ASC
  `).all(runId) as QuorumRow[];

  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayGovernanceQuorumRecord));
}

function persistReplayGovernanceSnapshot(
  db: SqliteDatabase,
  snapshot: ReplayGovernanceSnapshot,
): void {
  const write = db.transaction(() => {
    db.prepare(`
      INSERT OR REPLACE INTO replay_governance_snapshots
      (snapshot_id, run_id, generated_at, persisted_at, policy_hash, lineage_graph_hash, deterministic_hash, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      snapshot.snapshot_id,
      snapshot.run_id,
      snapshot.generated_at,
      snapshot.persisted_at,
      snapshot.policy_hash,
      snapshot.lineage_graph_hash,
      snapshot.deterministic_hash,
      stableStringify(snapshot),
    );

    for (const decision of snapshot.decisions) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_governance_decisions
        (decision_id, run_id, replay_hash, action, state, generated_at, policy_hash, deterministic_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        decision.decision_id,
        decision.run_id,
        decision.replay_hash,
        decision.action,
        decision.state,
        decision.generated_at,
        decision.policy_hash,
        decision.deterministic_hash,
        stableStringify(decision),
      );
    }

    for (const profile of snapshot.validator_profiles) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_governance_validator_profiles
        (profile_id, run_id, validator_id, trust_score, recommended_action, profile_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        profile.profile_id,
        profile.run_id,
        profile.validator_id,
        profile.trust_score,
        profile.recommended_action,
        profile.profile_hash,
        stableStringify(profile),
      );
    }

    for (const escalation of snapshot.escalations) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_governance_escalations
        (escalation_id, run_id, replay_hash, action, state, severity_score, generated_at, escalation_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        escalation.escalation_id,
        escalation.run_id,
        escalation.replay_hash,
        escalation.action,
        escalation.state,
        escalation.severity_score,
        escalation.generated_at,
        escalation.escalation_hash,
        stableStringify(escalation),
      );
    }

    for (const reference of snapshot.lineage_references) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_governance_lineage_references
        (reference_id, run_id, replay_hash, lineage_hash, graph_hash, source_hash, reference_kind, generated_at, reference_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reference.reference_id,
        reference.run_id,
        reference.replay_hash,
        reference.lineage_hash,
        reference.graph_hash,
        reference.source_hash,
        reference.reference_kind,
        reference.generated_at,
        reference.reference_hash,
        stableStringify(reference),
      );
    }

    for (const quorum of snapshot.quorum_history) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_governance_quorum_history
        (quorum_id, run_id, replay_hash, quorum_met, quorum_ratio, generated_at, quorum_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        quorum.quorum_id,
        quorum.run_id,
        quorum.replay_hash,
        quorum.quorum_met ? 1 : 0,
        quorum.quorum_ratio,
        quorum.generated_at,
        quorum.quorum_hash,
        stableStringify(quorum),
      );
    }
  });

  write();
}

function normalizePolicy(policy: Partial<ReplayGovernancePolicy> | undefined): ReplayGovernancePolicy {
  return deepFreeze({
    ...DEFAULT_POLICY,
    ...policy,
  });
}

function collectGovernedReplayHashes(
  targetHashes: readonly string[],
  lineageHashes: readonly string[],
): readonly string[] {
  return deepFreeze(Array.from(new Set([...targetHashes, ...lineageHashes]))
    .sort((left, right) => left.localeCompare(right)));
}

function buildDecision(input: {
  readonly runId: string;
  readonly replayHash: string;
  readonly generatedAt: string;
  readonly policy: ReplayGovernancePolicy;
  readonly policyHash: string;
  readonly consensus: ReplayConsensusResult | null;
  readonly arbitration: ReplayArbitrationResult | null;
  readonly recovery: ReplayRecoveryCoordinationResult | null;
  readonly quorum: ReplayGovernanceQuorumRecord | undefined;
  readonly lineageReferences: readonly ReplayGovernanceLineageReference[];
}): ReplayGovernanceDecision {
  const evaluation = evaluatePolicy(input);
  const action = actionForEvaluation(evaluation, input.policy);
  const state = stateForAction(action, evaluation);
  const payload = {
    run_id: input.runId,
    replay_hash: input.replayHash,
    action,
    state,
    generated_at: input.generatedAt,
    policy_hash: input.policyHash,
    evaluation_hash: evaluation.evaluation_hash,
    lineage_reference_hashes: input.lineageReferences.map((reference) => reference.reference_hash),
    quorum_hash: input.quorum?.quorum_hash ?? deterministicHash({ replay_hash: input.replayHash, quorum: "missing" }),
  };
  const deterministicDecisionHash = deterministicHash(payload);

  return deepFreeze({
    decision_id: `replay-governance-decision:${deterministicDecisionHash}`,
    ...payload,
    deterministic_hash: deterministicDecisionHash,
  });
}

function evaluatePolicy(input: {
  readonly replayHash: string;
  readonly policy: ReplayGovernancePolicy;
  readonly consensus: ReplayConsensusResult | null;
  readonly arbitration: ReplayArbitrationResult | null;
  readonly recovery: ReplayRecoveryCoordinationResult | null;
  readonly quorum: ReplayGovernanceQuorumRecord | undefined;
}): ReplayGovernancePolicyEvaluation {
  const reasons: string[] = [];
  const quorumMet = input.quorum?.quorum_met ?? false;
  const quorumRatio = input.quorum?.quorum_ratio ?? 0;
  const severityScore = input.arbitration?.severity.score ?? 0;
  const recoveryConfidence = input.recovery?.confidence.score;
  const arbitrationConfidence = input.arbitration?.adjudication.confidence;
  const consensusConfidence = input.consensus?.summary.consensus_confidence;
  const confidence = roundGovernanceNumber(recoveryConfidence ?? arbitrationConfidence ?? consensusConfidence ?? 0);
  const promotionReady = input.recovery?.branch_restoration.promotion_ready ??
    input.arbitration?.adjudication.outcome === "accept_replay";
  const recoveryState = input.recovery?.summary.state ?? null;
  const overrideKind: ReplayGovernanceOverrideKind = input.recovery?.summary.state === "stabilized" &&
    input.arbitration?.adjudication.outcome !== "accept_replay"
      ? "recovery"
      : input.arbitration?.adjudication.outcome === "require_manual_review" &&
        input.consensus?.vote_aggregation.quorum_met === true
        ? "arbitration"
        : "none";

  if (!quorumMet || quorumRatio < input.policy.quorum_threshold) reasons.push("governance_quorum_not_met");
  if (severityScore >= input.policy.quarantine_severity_threshold) reasons.push("severity_exceeds_quarantine_threshold");
  if (input.arbitration?.adjudication.outcome === "reject_replay") reasons.push("arbitration_rejects_branch");
  if (input.arbitration?.adjudication.outcome === "quarantine_replay") reasons.push("arbitration_requires_quarantine");
  if (input.arbitration?.adjudication.outcome === "require_manual_review") reasons.push("arbitration_requires_review");
  if (input.recovery?.quarantine.quarantine_required) reasons.push("recovery_requires_quarantine");
  if (input.recovery?.summary.state === "stabilized") reasons.push("recovery_stabilized_branch");
  if (promotionReady) reasons.push("branch_promotion_ready");
  if (overrideKind === "recovery") reasons.push("recovery_override_available");
  if (overrideKind === "arbitration") reasons.push("arbitration_override_available");

  const payload = {
    replay_hash: input.replayHash,
    consensus_vote: input.consensus?.summary.consensus_vote ?? null,
    arbitration_outcome: input.arbitration?.adjudication.outcome ?? null,
    quorum_met: quorumMet,
    quorum_ratio: quorumRatio,
    recovery_state: recoveryState,
    promotion_ready: promotionReady,
    severity_score: severityScore,
    confidence,
    override_kind: overrideKind,
    evaluation_reasons: reasons.sort((left, right) => left.localeCompare(right)),
  };

  return deepFreeze({
    ...payload,
    evaluation_hash: deterministicHash(payload),
  });
}

function actionForEvaluation(
  evaluation: ReplayGovernancePolicyEvaluation,
  policy: ReplayGovernancePolicy,
): ReplayGovernanceAction {
  if (evaluation.override_kind === "arbitration") return "override_arbitration";
  if (evaluation.override_kind === "recovery") return "elevate_recovery";
  if (!evaluation.quorum_met || evaluation.quorum_ratio < policy.quorum_threshold) return "require_review";
  if (evaluation.arbitration_outcome === "reject_replay") return "reject_branch";
  if (evaluation.severity_score >= policy.quarantine_severity_threshold || evaluation.arbitration_outcome === "quarantine_replay") {
    return "quarantine_branch";
  }
  if (evaluation.promotion_ready && evaluation.confidence >= policy.promotion_confidence_threshold) return "promote_branch";
  if (evaluation.consensus_vote === "approve" && evaluation.confidence >= policy.review_confidence_threshold) return "approve_branch";
  return "require_review";
}

function stateForAction(
  action: ReplayGovernanceAction,
  evaluation: ReplayGovernancePolicyEvaluation,
): ReplayGovernanceState {
  switch (action) {
    case "approve_branch":
      return "approved";
    case "reject_branch":
      return "rejected";
    case "quarantine_branch":
      return "quarantined";
    case "promote_branch":
      return "stabilized";
    case "elevate_recovery":
    case "override_arbitration":
      return evaluation.recovery_state === "stabilized" ? "stabilized" : "escalated";
    case "require_review":
    case "revoke_validator":
    case "reduce_validator_weight":
      return "pending_review";
  }
}

function buildQuorumRecord(
  runId: string,
  generatedAt: string,
  replayHash: string,
  consensus: ReplayConsensusResult | undefined,
): ReplayGovernanceQuorumRecord | null {
  if (!consensus) return null;
  const aggregation = consensus.vote_aggregation;
  const payload = {
    run_id: runId,
    replay_hash: replayHash,
    total_weight: aggregation.total_weight,
    participating_weight: aggregation.participating_weight,
    approve_weight: aggregation.approve_weight,
    diverge_weight: aggregation.diverge_weight,
    abstain_weight: aggregation.abstain_weight,
    quorum_ratio: aggregation.quorum_ratio,
    approval_ratio: aggregation.approval_ratio,
    quorum_met: aggregation.quorum_met,
    generated_at: generatedAt,
  };
  const quorumHash = deterministicHash(payload);

  return deepFreeze({
    quorum_id: `replay-governance-quorum:${quorumHash}`,
    ...payload,
    quorum_hash: quorumHash,
  });
}

function buildValidatorProfiles(
  runId: string,
  policy: ReplayGovernancePolicy,
  consensusResults: readonly ReplayConsensusResult[],
): readonly ReplayGovernanceValidatorProfile[] {
  const validatorsById = new Map<string, ReplayConsensusValidatorResult[]>();

  for (const consensus of consensusResults) {
    for (const validator of consensus.validators) {
      validatorsById.set(validator.validator_id, [
        ...(validatorsById.get(validator.validator_id) ?? []),
        validator,
      ]);
    }
  }

  return deepFreeze(Array.from(validatorsById.entries()).map(([validatorId, validators]) => {
    const replayHashes = Array.from(new Set(validators.map((validator) => validator.lineage_reference.replay_hash)))
      .sort((left, right) => left.localeCompare(right));
    const divergenceCount = validators.filter((validator) =>
      validator.divergence_categories.some((category) => category !== "none"),
    ).length;
    const averageConfidence = roundGovernanceNumber(
      validators.reduce((sum, validator) => sum + validator.propagated_confidence, 0) / Math.max(1, validators.length),
    );
    const averageWeight = roundGovernanceNumber(
      validators.reduce((sum, validator) => sum + validator.weight, 0) / Math.max(1, validators.length),
    );
    const divergencePenalty = divergenceCount * 18;
    const abstainPenalty = validators.filter((validator) => validator.vote === "abstain").length * 10;
    const trustScore = roundGovernanceNumber(Math.max(0, Math.min(100, averageConfidence - divergencePenalty - abstainPenalty)));
    const recommendedAction: ReplayGovernanceAction | null = trustScore < policy.validator_revoke_threshold
      ? "revoke_validator"
      : trustScore < policy.validator_reduce_weight_threshold
        ? "reduce_validator_weight"
        : null;
    const payload = {
      run_id: runId,
      validator_id: validatorId,
      validator_type: validators[0]?.validator_type ?? "unknown",
      replay_hashes: replayHashes,
      vote_count: validators.length,
      divergence_count: divergenceCount,
      average_confidence: averageConfidence,
      average_weight: averageWeight,
      trust_score: trustScore,
      recommended_action: recommendedAction,
      lineage_hashes: validators.map((validator) => validator.lineage_reference.lineage_hash)
        .sort((left, right) => left.localeCompare(right)),
    };
    const profileHash = deterministicHash(payload);

    return {
      profile_id: `replay-governance-validator:${profileHash}`,
      ...payload,
      profile_hash: profileHash,
    };
  }).sort((left, right) =>
    left.validator_id.localeCompare(right.validator_id) ||
    left.profile_hash.localeCompare(right.profile_hash),
  ));
}

function buildEscalations(input: {
  readonly runId: string;
  readonly generatedAt: string;
  readonly decisions: readonly ReplayGovernanceDecision[];
  readonly arbitrationByReplay: ReadonlyMap<string, ReplayArbitrationResult>;
}): readonly ReplayGovernanceEscalationRecord[] {
  return deepFreeze(input.decisions
    .filter((decision) => decision.state === "escalated" || decision.state === "quarantined" || decision.action === "require_review")
    .map((decision) => {
      const arbitration = input.arbitrationByReplay.get(decision.replay_hash);
      const payload = {
        run_id: input.runId,
        replay_hash: decision.replay_hash,
        categories: arbitration?.adjudication.escalation_categories ?? [],
        action: decision.action,
        state: decision.state,
        severity_score: arbitration?.severity.score ?? 0,
        generated_at: input.generatedAt,
      };
      const escalationHash = deterministicHash(payload);

      return {
        escalation_id: `replay-governance-escalation:${escalationHash}`,
        ...payload,
        escalation_hash: escalationHash,
      };
    }).sort((left, right) =>
      left.replay_hash.localeCompare(right.replay_hash) ||
      left.escalation_hash.localeCompare(right.escalation_hash),
    ));
}

function buildLineageReferences(
  db: SqliteDatabase,
  input: {
    readonly runId: string;
    readonly generatedAt: string;
    readonly replayHashes: readonly string[];
    readonly graphHash: string;
    readonly consensusByReplay: ReadonlyMap<string, ReplayConsensusResult>;
    readonly arbitrationByReplay: ReadonlyMap<string, ReplayArbitrationResult>;
    readonly recoveryByReplay: ReadonlyMap<string, ReplayRecoveryCoordinationResult>;
  },
): readonly ReplayGovernanceLineageReference[] {
  const references: ReplayGovernanceLineageReference[] = [];

  for (const replayHash of input.replayHashes) {
    const graphReference = buildLineageReference({
      runId: input.runId,
      replayHash,
      lineageHash: input.graphHash,
      graphHash: input.graphHash,
      sourceHash: replayHash,
      referenceKind: "graph",
      generatedAt: input.generatedAt,
    });
    references.push(graphReference);

    const consensus = input.consensusByReplay.get(replayHash);
    if (consensus) {
      references.push(buildLineageReference({
        runId: input.runId,
        replayHash,
        lineageHash: consensus.consensus_hash,
        graphHash: input.graphHash,
        sourceHash: consensus.consensus_hash,
        referenceKind: "consensus",
        generatedAt: input.generatedAt,
      }));
    }

    const arbitration = input.arbitrationByReplay.get(replayHash);
    if (arbitration) {
      references.push(...arbitration.lineage_references.map((reference) =>
        buildLineageReference({
          runId: input.runId,
          replayHash,
          lineageHash: reference.lineage_hash,
          graphHash: input.graphHash,
          sourceHash: reference.lineage_reference_hash,
          referenceKind: "arbitration",
          generatedAt: input.generatedAt,
        }),
      ));
    }

    const persistedRecoveryLineage = getRecoveryLineage(db, replayHash);
    for (const reference of persistedRecoveryLineage) {
      references.push(buildLineageReference({
        runId: input.runId,
        replayHash,
        lineageHash: reference.recovery_lineage_hash,
        graphHash: input.graphHash,
        sourceHash: reference.persistence_hash,
        referenceKind: "recovery",
        generatedAt: input.generatedAt,
      }));
    }
  }

  return deepFreeze([...dedupeBy(references, (reference) => reference.reference_id)]
    .sort((left, right) =>
      left.replay_hash.localeCompare(right.replay_hash) ||
      left.reference_kind.localeCompare(right.reference_kind) ||
      left.reference_hash.localeCompare(right.reference_hash),
    ));
}

function buildLineageReference(input: {
  readonly runId: string;
  readonly replayHash: string;
  readonly lineageHash: string;
  readonly graphHash: string;
  readonly sourceHash: string;
  readonly referenceKind: ReplayGovernanceLineageReference["reference_kind"];
  readonly generatedAt: string;
}): ReplayGovernanceLineageReference {
  const payload = {
    run_id: input.runId,
    replay_hash: input.replayHash,
    lineage_hash: input.lineageHash,
    graph_hash: input.graphHash,
    source_hash: input.sourceHash,
    reference_kind: input.referenceKind,
    generated_at: input.generatedAt,
  };
  const referenceHash = deterministicHash(payload);

  return deepFreeze({
    reference_id: `replay-governance-lineage:${referenceHash}`,
    ...payload,
    reference_hash: referenceHash,
  });
}

function buildBranchStatuses(
  decisions: readonly ReplayGovernanceDecision[],
): readonly ReplayGovernanceBranchStatus[] {
  return deepFreeze(decisions.map((decision) => {
    const payload = {
      replay_hash: decision.replay_hash,
      current_state: decision.state,
      latest_action: decision.action,
      decision_hash: decision.deterministic_hash,
      promotion_eligible: decision.action === "promote_branch" || decision.action === "approve_branch",
    };

    return {
      ...payload,
      status_hash: deterministicHash(payload),
    };
  }).sort((left, right) =>
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.status_hash.localeCompare(right.status_hash),
  ));
}

function loadRecoveryResults(
  db: SqliteDatabase,
  runId: string,
): readonly ReplayRecoveryCoordinationResult[] {
  const rows = db.prepare(`
    SELECT payload FROM replay_orchestration_recovery_results
    WHERE run_id = ?
    ORDER BY replay_hash ASC, recovery_hash ASC
  `).all(runId) as RecoveryPayloadRow[];

  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayRecoveryCoordinationResult));
}

function dedupeBy<T>(
  values: readonly T[],
  getKey: (value: T) => string,
): readonly T[] {
  return Array.from(new Map(values.map((value) => [getKey(value), value])).values());
}

function roundGovernanceNumber(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function computeReplayGovernanceDeterministicHash(value: unknown): string {
  return deterministicHash(value);
}

function deterministicHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(value))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortGovernanceKeys(value));
}

function sortGovernanceKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortGovernanceKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortGovernanceKeys((value as Record<string, unknown>)[key]);
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
    for (const item of Object.values(value as Record<string, unknown>)) {
      deepFreeze(item);
    }
  }

  return value;
}
