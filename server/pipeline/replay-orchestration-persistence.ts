import crypto from "node:crypto";

import type Database from "better-sqlite3";

import type {
  ReplayArbitrationResult,
} from "./replay-arbitration-contract";
import type {
  ReplayAutonomousOrchestrationRun,
} from "./replay-autonomous-orchestration-contract";
import type {
  ReplayConsensusResult,
} from "./replay-consensus-contract";
import type {
  ReplayOrchestrationBranchStateRecord,
  ReplayOrchestrationExecutionHistoryRecord,
  ReplayOrchestrationLineagePersistenceRecord,
  ReplayOrchestrationPersistedKind,
  ReplayOrchestrationPersistenceInput,
  ReplayOrchestrationPersistenceRecord,
  ReplayOrchestrationPersistenceSnapshot,
  ReplayOrchestrationRecoveryCheckpointRecord,
} from "./replay-orchestration-persistence-contract";
import type {
  ReplayRecoveryCoordinationResult,
} from "./replay-recovery-coordination-contract";

type SqliteDatabase = Database.Database;

interface PayloadRow {
  readonly payload: string;
}

interface RecordRow {
  readonly record_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly persisted_kind: ReplayOrchestrationPersistedKind;
  readonly source_hash: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly payload_hash: string;
  readonly persistence_hash: string;
}

interface LineageRow {
  readonly lineage_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly parent_replay_hash: string | null;
  readonly lineage_hash: string;
  readonly recovery_lineage_hash: string;
  readonly persisted_at: string;
  readonly persistence_hash: string;
}

interface BranchRow {
  readonly branch_state_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly source_branch_hash: string;
  readonly recovered_branch_hash: string;
  readonly state: string;
  readonly promotion_ready: number;
  readonly persisted_at: string;
  readonly persistence_hash: string;
}

interface CheckpointRow {
  readonly checkpoint_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly parent_replay_hash: string | null;
  readonly rollback_required: number;
  readonly checkpoint_hash: string;
  readonly persisted_at: string;
  readonly persistence_hash: string;
}

interface HistoryRow {
  readonly history_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly event_type: ReplayOrchestrationPersistedKind;
  readonly source_hash: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly sequence: number;
  readonly history_hash: string;
}

export function initializeReplayOrchestrationPersistenceSchema(
  db: SqliteDatabase,
): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS replay_orchestration_runs (
      run_id TEXT PRIMARY KEY,
      run_hash TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      persistence_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replay_orchestration_consensus_results (
      consensus_hash TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      persistence_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_orchestration_consensus_latest
      ON replay_orchestration_consensus_results(replay_hash, generated_at DESC, consensus_hash DESC);

    CREATE TABLE IF NOT EXISTS replay_orchestration_arbitration_results (
      arbitration_hash TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      persistence_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_orchestration_arbitration_latest
      ON replay_orchestration_arbitration_results(replay_hash, generated_at DESC, arbitration_hash DESC);

    CREATE TABLE IF NOT EXISTS replay_orchestration_recovery_results (
      recovery_hash TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      persistence_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_orchestration_recovery_replay
      ON replay_orchestration_recovery_results(replay_hash, generated_at DESC, recovery_hash DESC);

    CREATE TABLE IF NOT EXISTS replay_orchestration_lineage_references (
      lineage_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      parent_replay_hash TEXT,
      lineage_hash TEXT NOT NULL,
      recovery_lineage_hash TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      persistence_hash TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_orchestration_lineage_replay
      ON replay_orchestration_lineage_references(replay_hash, lineage_hash);

    CREATE TABLE IF NOT EXISTS replay_orchestration_branch_state (
      branch_state_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      source_branch_hash TEXT NOT NULL,
      recovered_branch_hash TEXT NOT NULL,
      state TEXT NOT NULL,
      promotion_ready INTEGER NOT NULL,
      persisted_at TEXT NOT NULL,
      persistence_hash TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_orchestration_branch_history
      ON replay_orchestration_branch_state(replay_hash, persisted_at DESC, branch_state_id DESC);

    CREATE TABLE IF NOT EXISTS replay_orchestration_recovery_checkpoints (
      checkpoint_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      parent_replay_hash TEXT,
      rollback_required INTEGER NOT NULL,
      checkpoint_hash TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      persistence_hash TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_orchestration_checkpoints_replay
      ON replay_orchestration_recovery_checkpoints(replay_hash, persisted_at DESC, checkpoint_id DESC);

    CREATE TABLE IF NOT EXISTS replay_orchestration_execution_history (
      history_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      event_type TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      history_hash TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_orchestration_history_run
      ON replay_orchestration_execution_history(run_id, sequence);
  `);
}

export function persistReplayOrchestrationLifecycle(
  db: SqliteDatabase,
  input: ReplayOrchestrationPersistenceInput,
): ReplayOrchestrationPersistenceSnapshot {
  initializeReplayOrchestrationPersistenceSchema(db);

  const records = buildPersistenceRecords(input);
  const lineage = buildLineageRecords(input);
  const branches = buildBranchRecords(input);
  const checkpoints = buildCheckpointRecords(input);
  const history = buildHistoryRecords(input, records);
  const snapshotSeed = {
    run_id: input.orchestration_run.run_id,
    run_hash: input.orchestration_run.run_hash,
    persisted_at: input.persisted_at,
    record_hashes: records.map((record) => record.persistence_hash),
    lineage_hashes: lineage.map((record) => record.persistence_hash),
    branch_hashes: branches.map((record) => record.persistence_hash),
    checkpoint_hashes: checkpoints.map((record) => record.persistence_hash),
    history_hashes: history.map((record) => record.history_hash),
  };
  const snapshotId = `replay-orchestration-persistence:${deterministicHash(snapshotSeed)}`;

  const write = db.transaction(() => {
    persistRun(db, input.orchestration_run, input.persisted_at);
    for (const consensus of input.consensus_results) {
      persistConsensus(db, input.orchestration_run.run_id, consensus, input.persisted_at);
    }
    for (const arbitration of input.arbitration_results) {
      persistArbitration(db, input.orchestration_run.run_id, arbitration, input.persisted_at);
    }
    for (const recovery of input.recovery_results) {
      persistRecovery(db, input.orchestration_run.run_id, recovery, input.persisted_at);
    }
    for (const record of lineage) persistLineage(db, record);
    for (const record of branches) persistBranch(db, record);
    for (const record of checkpoints) persistCheckpoint(db, record);
    for (const record of history) persistHistory(db, record);
  });

  write();

  return deepFreeze({
    snapshot_id: snapshotId,
    run_id: input.orchestration_run.run_id,
    run_hash: input.orchestration_run.run_hash,
    persisted_at: input.persisted_at,
    records,
    lineage,
    branches,
    checkpoints,
    history,
    deterministic_hash: deterministicHash(snapshotSeed),
  });
}

export function getReplayOrchestrationRun(
  db: SqliteDatabase,
  runId: string,
): ReplayAutonomousOrchestrationRun | null {
  initializeReplayOrchestrationPersistenceSchema(db);
  const row = db.prepare("SELECT payload FROM replay_orchestration_runs WHERE run_id = ?")
    .get(runId) as PayloadRow | undefined;
  return row ? deepFreeze(parseReplaySafeJson<ReplayAutonomousOrchestrationRun>(row.payload)) : null;
}

export function getReplayOrchestrationHistory(
  db: SqliteDatabase,
  runId: string,
): readonly ReplayOrchestrationExecutionHistoryRecord[] {
  initializeReplayOrchestrationPersistenceSchema(db);
  const rows = db.prepare(`
    SELECT * FROM replay_orchestration_execution_history
    WHERE run_id = ?
    ORDER BY sequence ASC, history_id ASC
  `).all(runId) as HistoryRow[];

  return deepFreeze(rows.map(historyFromRow));
}

export function getRecoveryLineage(
  db: SqliteDatabase,
  replayHash: string,
): readonly ReplayOrchestrationLineagePersistenceRecord[] {
  initializeReplayOrchestrationPersistenceSchema(db);
  const rows = db.prepare(`
    SELECT * FROM replay_orchestration_lineage_references
    WHERE replay_hash = ?
    ORDER BY lineage_hash ASC, recovery_lineage_hash ASC
  `).all(replayHash) as LineageRow[];

  return deepFreeze(rows.map(lineageFromRow));
}

export function getReplayBranchHistory(
  db: SqliteDatabase,
  replayHash: string,
): readonly ReplayOrchestrationBranchStateRecord[] {
  initializeReplayOrchestrationPersistenceSchema(db);
  const rows = db.prepare(`
    SELECT * FROM replay_orchestration_branch_state
    WHERE replay_hash = ?
    ORDER BY persisted_at ASC, branch_state_id ASC
  `).all(replayHash) as BranchRow[];

  return deepFreeze(rows.map(branchFromRow));
}

export function getLatestArbitrationResult(
  db: SqliteDatabase,
  replayHash: string,
): ReplayArbitrationResult | null {
  initializeReplayOrchestrationPersistenceSchema(db);
  const row = db.prepare(`
    SELECT payload FROM replay_orchestration_arbitration_results
    WHERE replay_hash = ?
    ORDER BY generated_at DESC, arbitration_hash DESC
    LIMIT 1
  `).get(replayHash) as PayloadRow | undefined;

  return row ? deepFreeze(parseReplaySafeJson<ReplayArbitrationResult>(row.payload)) : null;
}

export function getLatestConsensusResult(
  db: SqliteDatabase,
  replayHash: string,
): ReplayConsensusResult | null {
  initializeReplayOrchestrationPersistenceSchema(db);
  const row = db.prepare(`
    SELECT payload FROM replay_orchestration_consensus_results
    WHERE replay_hash = ?
    ORDER BY generated_at DESC, consensus_hash DESC
    LIMIT 1
  `).get(replayHash) as PayloadRow | undefined;

  return row ? deepFreeze(parseReplaySafeJson<ReplayConsensusResult>(row.payload)) : null;
}

export function getRecoveryCheckpoints(
  db: SqliteDatabase,
  replayHash: string,
): readonly ReplayOrchestrationRecoveryCheckpointRecord[] {
  initializeReplayOrchestrationPersistenceSchema(db);
  const rows = db.prepare(`
    SELECT * FROM replay_orchestration_recovery_checkpoints
    WHERE replay_hash = ?
    ORDER BY persisted_at ASC, checkpoint_id ASC
  `).all(replayHash) as CheckpointRow[];

  return deepFreeze(rows.map(checkpointFromRow));
}

function persistRun(
  db: SqliteDatabase,
  run: ReplayAutonomousOrchestrationRun,
  persistedAt: string,
): void {
  const payload = stableStringify(run);
  const payloadHash = deterministicHash(run);
  const persistenceHash = deterministicHash({
    kind: "orchestration_run",
    run_id: run.run_id,
    run_hash: run.run_hash,
    generated_at: run.generated_at,
    persisted_at: persistedAt,
    payload_hash: payloadHash,
  });

  db.prepare(`
    INSERT OR REPLACE INTO replay_orchestration_runs
    (run_id, run_hash, generated_at, persisted_at, payload_hash, persistence_hash, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(run.run_id, run.run_hash, run.generated_at, persistedAt, payloadHash, persistenceHash, payload);
}

function persistConsensus(
  db: SqliteDatabase,
  runId: string,
  consensus: ReplayConsensusResult,
  persistedAt: string,
): void {
  const payload = stableStringify(consensus);
  const payloadHash = deterministicHash(consensus);
  const persistenceHash = deterministicHash({
    kind: "consensus_result",
    run_id: runId,
    replay_hash: consensus.replay_hash,
    source_hash: consensus.consensus_hash,
    generated_at: consensus.generated_at,
    persisted_at: persistedAt,
    payload_hash: payloadHash,
  });

  db.prepare(`
    INSERT OR REPLACE INTO replay_orchestration_consensus_results
    (consensus_hash, run_id, replay_hash, generated_at, persisted_at, payload_hash, persistence_hash, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(consensus.consensus_hash, runId, consensus.replay_hash, consensus.generated_at, persistedAt, payloadHash, persistenceHash, payload);
}

function persistArbitration(
  db: SqliteDatabase,
  runId: string,
  arbitration: ReplayArbitrationResult,
  persistedAt: string,
): void {
  const payload = stableStringify(arbitration);
  const payloadHash = deterministicHash(arbitration);
  const persistenceHash = deterministicHash({
    kind: "arbitration_result",
    run_id: runId,
    replay_hash: arbitration.consensus_reference.replay_hash,
    source_hash: arbitration.deterministic_hash,
    generated_at: arbitration.generated_at,
    persisted_at: persistedAt,
    payload_hash: payloadHash,
  });

  db.prepare(`
    INSERT OR REPLACE INTO replay_orchestration_arbitration_results
    (arbitration_hash, run_id, replay_hash, generated_at, persisted_at, payload_hash, persistence_hash, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(arbitration.deterministic_hash, runId, arbitration.consensus_reference.replay_hash, arbitration.generated_at, persistedAt, payloadHash, persistenceHash, payload);
}

function persistRecovery(
  db: SqliteDatabase,
  runId: string,
  recovery: ReplayRecoveryCoordinationResult,
  persistedAt: string,
): void {
  const payload = stableStringify(recovery);
  const payloadHash = deterministicHash(recovery);
  const persistenceHash = deterministicHash({
    kind: "recovery_coordination",
    run_id: runId,
    replay_hash: recovery.arbitration_reference.replay_hash,
    source_hash: recovery.deterministic_hash,
    generated_at: recovery.generated_at,
    persisted_at: persistedAt,
    payload_hash: payloadHash,
  });

  db.prepare(`
    INSERT OR REPLACE INTO replay_orchestration_recovery_results
    (recovery_hash, run_id, replay_hash, generated_at, persisted_at, payload_hash, persistence_hash, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(recovery.deterministic_hash, runId, recovery.arbitration_reference.replay_hash, recovery.generated_at, persistedAt, payloadHash, persistenceHash, payload);
}

function persistLineage(
  db: SqliteDatabase,
  record: ReplayOrchestrationLineagePersistenceRecord,
): void {
  db.prepare(`
    INSERT OR REPLACE INTO replay_orchestration_lineage_references
    (lineage_id, run_id, replay_hash, parent_replay_hash, lineage_hash, recovery_lineage_hash, persisted_at, persistence_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.lineage_id,
    record.run_id,
    record.replay_hash,
    record.parent_replay_hash,
    record.lineage_hash,
    record.recovery_lineage_hash,
    record.persisted_at,
    record.persistence_hash,
  );
}

function persistBranch(
  db: SqliteDatabase,
  record: ReplayOrchestrationBranchStateRecord,
): void {
  db.prepare(`
    INSERT OR REPLACE INTO replay_orchestration_branch_state
    (branch_state_id, run_id, replay_hash, source_branch_hash, recovered_branch_hash, state, promotion_ready, persisted_at, persistence_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.branch_state_id,
    record.run_id,
    record.replay_hash,
    record.source_branch_hash,
    record.recovered_branch_hash,
    record.state,
    record.promotion_ready ? 1 : 0,
    record.persisted_at,
    record.persistence_hash,
  );
}

function persistCheckpoint(
  db: SqliteDatabase,
  record: ReplayOrchestrationRecoveryCheckpointRecord,
): void {
  db.prepare(`
    INSERT OR REPLACE INTO replay_orchestration_recovery_checkpoints
    (checkpoint_id, run_id, replay_hash, parent_replay_hash, rollback_required, checkpoint_hash, persisted_at, persistence_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.checkpoint_id,
    record.run_id,
    record.replay_hash,
    record.parent_replay_hash,
    record.rollback_required ? 1 : 0,
    record.checkpoint_hash,
    record.persisted_at,
    record.persistence_hash,
  );
}

function persistHistory(
  db: SqliteDatabase,
  record: ReplayOrchestrationExecutionHistoryRecord,
): void {
  db.prepare(`
    INSERT OR REPLACE INTO replay_orchestration_execution_history
    (history_id, run_id, replay_hash, event_type, source_hash, generated_at, persisted_at, sequence, history_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.history_id,
    record.run_id,
    record.replay_hash,
    record.event_type,
    record.source_hash,
    record.generated_at,
    record.persisted_at,
    record.sequence,
    record.history_hash,
  );
}

function buildPersistenceRecords(
  input: ReplayOrchestrationPersistenceInput,
): readonly ReplayOrchestrationPersistenceRecord[] {
  const records: ReplayOrchestrationPersistenceRecord[] = [
    buildRecord(
      input.orchestration_run.run_id,
      input.orchestration_run.targets[0]?.replay_hash ?? input.orchestration_run.run_id,
      "orchestration_run",
      input.orchestration_run.run_hash,
      input.orchestration_run.generated_at,
      input.persisted_at,
      input.orchestration_run,
    ),
    ...input.consensus_results.map((consensus) =>
      buildRecord(input.orchestration_run.run_id, consensus.replay_hash, "consensus_result", consensus.consensus_hash, consensus.generated_at, input.persisted_at, consensus),
    ),
    ...input.arbitration_results.map((arbitration) =>
      buildRecord(input.orchestration_run.run_id, arbitration.consensus_reference.replay_hash, "arbitration_result", arbitration.deterministic_hash, arbitration.generated_at, input.persisted_at, arbitration),
    ),
    ...input.recovery_results.map((recovery) =>
      buildRecord(input.orchestration_run.run_id, recovery.arbitration_reference.replay_hash, "recovery_coordination", recovery.deterministic_hash, recovery.generated_at, input.persisted_at, recovery),
    ),
  ];

  return deepFreeze(records.sort((left, right) =>
    left.persisted_kind.localeCompare(right.persisted_kind) ||
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.source_hash.localeCompare(right.source_hash),
  ));
}

function buildRecord(
  runId: string,
  replayHash: string,
  kind: ReplayOrchestrationPersistedKind,
  sourceHash: string,
  generatedAt: string,
  persistedAt: string,
  payload: unknown,
): ReplayOrchestrationPersistenceRecord {
  const payloadHash = deterministicHash(payload);
  const seed = {
    run_id: runId,
    replay_hash: replayHash,
    persisted_kind: kind,
    source_hash: sourceHash,
    generated_at: generatedAt,
    persisted_at: persistedAt,
    payload_hash: payloadHash,
  };
  const persistenceHash = deterministicHash(seed);

  return deepFreeze({
    record_id: `replay-orchestration-record:${persistenceHash}`,
    ...seed,
    payload_hash: payloadHash,
    persistence_hash: persistenceHash,
  });
}

function buildLineageRecords(
  input: ReplayOrchestrationPersistenceInput,
): readonly ReplayOrchestrationLineagePersistenceRecord[] {
  return deepFreeze(input.recovery_results.flatMap((recovery) =>
    recovery.lineage.map((lineage) => {
      const seed = {
        run_id: input.orchestration_run.run_id,
        replay_hash: recovery.arbitration_reference.replay_hash,
        parent_replay_hash: lineage.parent_replay_hash,
        lineage_hash: lineage.lineage_hash,
        recovery_lineage_hash: lineage.recovery_lineage_hash,
        persisted_at: input.persisted_at,
      };
      const persistenceHash = deterministicHash(seed);

      return {
        lineage_id: `replay-orchestration-lineage:${persistenceHash}`,
        ...seed,
        persistence_hash: persistenceHash,
      };
    }),
  ).sort((left, right) =>
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.lineage_hash.localeCompare(right.lineage_hash) ||
    left.recovery_lineage_hash.localeCompare(right.recovery_lineage_hash),
  ));
}

function buildBranchRecords(
  input: ReplayOrchestrationPersistenceInput,
): readonly ReplayOrchestrationBranchStateRecord[] {
  return deepFreeze(input.recovery_results.map((recovery) => {
    const seed = {
      run_id: input.orchestration_run.run_id,
      replay_hash: recovery.arbitration_reference.replay_hash,
      source_branch_hash: recovery.branch_restoration.source_branch_hash,
      recovered_branch_hash: recovery.branch_restoration.recovered_branch_hash,
      state: recovery.summary.state,
      promotion_ready: recovery.branch_restoration.promotion_ready,
      persisted_at: input.persisted_at,
    };
    const persistenceHash = deterministicHash(seed);

    return {
      branch_state_id: `replay-orchestration-branch:${persistenceHash}`,
      ...seed,
      persistence_hash: persistenceHash,
    };
  }).sort((left, right) =>
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.branch_state_id.localeCompare(right.branch_state_id),
  ));
}

function buildCheckpointRecords(
  input: ReplayOrchestrationPersistenceInput,
): readonly ReplayOrchestrationRecoveryCheckpointRecord[] {
  return deepFreeze(input.recovery_results.map((recovery) => {
    const seed = {
      checkpoint_id: recovery.checkpoint.checkpoint_id,
      run_id: input.orchestration_run.run_id,
      replay_hash: recovery.arbitration_reference.replay_hash,
      parent_replay_hash: recovery.checkpoint.parent_replay_hash,
      rollback_required: recovery.checkpoint.rollback_required,
      checkpoint_hash: recovery.checkpoint.checkpoint_hash,
      persisted_at: input.persisted_at,
    };
    const persistenceHash = deterministicHash(seed);

    return {
      ...seed,
      persistence_hash: persistenceHash,
    };
  }).sort((left, right) =>
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.checkpoint_id.localeCompare(right.checkpoint_id),
  ));
}

function buildHistoryRecords(
  input: ReplayOrchestrationPersistenceInput,
  records: readonly ReplayOrchestrationPersistenceRecord[],
): readonly ReplayOrchestrationExecutionHistoryRecord[] {
  return deepFreeze(records.map((record, index) => {
    const seed = {
      run_id: input.orchestration_run.run_id,
      replay_hash: record.replay_hash,
      event_type: record.persisted_kind,
      source_hash: record.source_hash,
      generated_at: record.generated_at,
      persisted_at: input.persisted_at,
      sequence: index + 1,
    };
    const historyHash = deterministicHash(seed);

    return {
      history_id: `replay-orchestration-history:${historyHash}`,
      ...seed,
      history_hash: historyHash,
    };
  }));
}

function recordFromRow(row: RecordRow): ReplayOrchestrationPersistenceRecord {
  return deepFreeze({ ...row });
}

function lineageFromRow(row: LineageRow): ReplayOrchestrationLineagePersistenceRecord {
  return deepFreeze({ ...row });
}

function branchFromRow(row: BranchRow): ReplayOrchestrationBranchStateRecord {
  return deepFreeze({
    ...row,
    promotion_ready: row.promotion_ready === 1,
  });
}

function checkpointFromRow(row: CheckpointRow): ReplayOrchestrationRecoveryCheckpointRecord {
  return deepFreeze({
    ...row,
    rollback_required: row.rollback_required === 1,
  });
}

function historyFromRow(row: HistoryRow): ReplayOrchestrationExecutionHistoryRecord {
  return deepFreeze({ ...row });
}

function parseReplaySafeJson<T>(payload: string): T {
  return JSON.parse(payload) as T;
}

function deterministicHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(value))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortPersistenceKeys(value));
}

function sortPersistenceKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortPersistenceKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortPersistenceKeys((value as Record<string, unknown>)[key]);
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
