import type Database from "better-sqlite3";
import { randomUUID } from "crypto";

import { computeCanonicalHash } from "./replay-archive";
import { getPipelineDb } from "./store";
import type {
  Situation,
  SituationConfidenceExplanation,
  SituationConfidenceHistory,
  SituationEvent,
  SituationPublicConfirmation,
  SituationRelationship,
  SituationSnapshot,
  SituationStateHistory,
} from "./situations-contract";

const APPEND_ONLY_TABLES = [
  "situations",
  "situation_events",
  "situation_snapshots",
  "situation_confidence_history",
  "situation_state_history",
  "situation_relationships",
  "situation_public_confirmations",
] as const;

export function ensureSituationSchema(db: Database.Database = getPipelineDb()): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS situations (
      situation_id            TEXT PRIMARY KEY,
      canonical_hash          TEXT NOT NULL,
      sport                   TEXT NOT NULL,
      league                  TEXT NOT NULL,
      game_id                 TEXT,
      teams_json              TEXT NOT NULL DEFAULT '[]',
      players_json            TEXT NOT NULL DEFAULT '[]',
      situation_type          TEXT NOT NULL,
      semantic_fingerprint    TEXT NOT NULL,
      created_from_event_id   TEXT,
      created_at              TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_situations_league_type
      ON situations(league, situation_type, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_situations_game
      ON situations(game_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS situation_events (
      event_id                TEXT PRIMARY KEY,
      situation_id            TEXT NOT NULL,
      kind                    TEXT NOT NULL,
      raw_event_id            TEXT,
      normalized_event_id     TEXT,
      source_id               TEXT,
      observed_at             TEXT NOT NULL,
      recorded_at             TEXT NOT NULL,
      replay_hash             TEXT NOT NULL,
      lineage_hash            TEXT NOT NULL,
      payload_json            TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_situation_events_situation
      ON situation_events(situation_id, recorded_at ASC, event_id ASC);

    CREATE INDEX IF NOT EXISTS idx_situation_events_lineage
      ON situation_events(lineage_hash);

    CREATE TABLE IF NOT EXISTS situation_snapshots (
      snapshot_id             TEXT PRIMARY KEY,
      situation_id            TEXT NOT NULL,
      lifecycle_state         TEXT NOT NULL,
      confidence_score        REAL NOT NULL,
      confidence_json         TEXT NOT NULL,
      summary                 TEXT NOT NULL,
      escalation_score        REAL NOT NULL,
      timing_pressure         TEXT NOT NULL,
      evidence_event_ids_json TEXT NOT NULL DEFAULT '[]',
      replay_hash             TEXT NOT NULL,
      previous_snapshot_hash  TEXT,
      created_at              TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_situation_snapshots_situation
      ON situation_snapshots(situation_id, created_at DESC, snapshot_id ASC);

    CREATE INDEX IF NOT EXISTS idx_situation_snapshots_replay
      ON situation_snapshots(replay_hash);

    CREATE TABLE IF NOT EXISTS situation_confidence_history (
      history_id              TEXT PRIMARY KEY,
      situation_id            TEXT NOT NULL,
      previous_confidence     REAL,
      new_confidence          REAL NOT NULL,
      factor_breakdown_json   TEXT NOT NULL,
      reasoning_json          TEXT NOT NULL DEFAULT '[]',
      event_id                TEXT,
      replay_hash             TEXT NOT NULL,
      created_at              TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_situation_confidence_history_situation
      ON situation_confidence_history(situation_id, created_at ASC, history_id ASC);

    CREATE TABLE IF NOT EXISTS situation_state_history (
      history_id              TEXT PRIMARY KEY,
      situation_id            TEXT NOT NULL,
      previous_state          TEXT,
      new_state               TEXT NOT NULL,
      transition_reason       TEXT NOT NULL,
      trigger_event_id        TEXT,
      metadata_json           TEXT NOT NULL DEFAULT '{}',
      replay_hash             TEXT NOT NULL,
      created_at              TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_situation_state_history_situation
      ON situation_state_history(situation_id, created_at ASC, history_id ASC);

    CREATE TABLE IF NOT EXISTS situation_relationships (
      relationship_id         TEXT PRIMARY KEY,
      source_situation_id     TEXT NOT NULL,
      target_situation_id     TEXT NOT NULL,
      relationship_type       TEXT NOT NULL,
      confidence              REAL NOT NULL,
      reasoning_json          TEXT NOT NULL DEFAULT '[]',
      created_at              TEXT NOT NULL,
      replay_hash             TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_situation_relationships_source
      ON situation_relationships(source_situation_id, relationship_type, created_at ASC);

    CREATE INDEX IF NOT EXISTS idx_situation_relationships_target
      ON situation_relationships(target_situation_id, relationship_type, created_at ASC);

    CREATE TABLE IF NOT EXISTS situation_public_confirmations (
      situation_id            TEXT PRIMARY KEY,
      confirmed_at            TEXT NOT NULL,
      detection_lead_minutes  INTEGER NOT NULL,
      source_name             TEXT NOT NULL,
      confirmation_reason     TEXT NOT NULL,
      raw_event_id            TEXT,
      created_at              TEXT NOT NULL
    );
  `);

  installAppendOnlyGuards(db);
}

export function insertSituation(situation: Situation, db: Database.Database = getPipelineDb()): Situation {
  ensureSituationSchema(db);
  const result = db.prepare(`
    INSERT OR IGNORE INTO situations (
      situation_id, canonical_hash, sport, league, game_id, teams_json, players_json,
      situation_type, semantic_fingerprint, created_from_event_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    situation.situation_id,
    situation.canonical_hash,
    situation.sport,
    situation.league,
    situation.game_id,
    stableJson(situation.teams),
    stableJson(situation.players),
    situation.situation_type,
    situation.semantic_fingerprint,
    situation.created_from_event_id,
    situation.created_at,
  );
  assertIdempotentInsert(db, "situations", "situation_id", situation.situation_id, "canonical_hash", situation.canonical_hash, result.changes);
  return situation;
}

export function appendSituationEvent(event: SituationEvent, db: Database.Database = getPipelineDb()): SituationEvent {
  ensureSituationSchema(db);
  const result = db.prepare(`
    INSERT OR IGNORE INTO situation_events (
      event_id, situation_id, kind, raw_event_id, normalized_event_id, source_id,
      observed_at, recorded_at, replay_hash, lineage_hash, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.event_id,
    event.situation_id,
    event.kind,
    event.raw_event_id,
    event.normalized_event_id,
    event.source_id,
    event.observed_at,
    event.recorded_at,
    event.replay_hash,
    event.lineage_hash,
    stableJson(event.payload),
  );
  assertIdempotentInsert(db, "situation_events", "event_id", event.event_id, "replay_hash", event.replay_hash, result.changes);
  return event;
}

export function appendSituationSnapshot(snapshot: SituationSnapshot, db: Database.Database = getPipelineDb()): SituationSnapshot {
  ensureSituationSchema(db);
  const result = db.prepare(`
    INSERT OR IGNORE INTO situation_snapshots (
      snapshot_id, situation_id, lifecycle_state, confidence_score, confidence_json,
      summary, escalation_score, timing_pressure, evidence_event_ids_json,
      replay_hash, previous_snapshot_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    snapshot.snapshot_id,
    snapshot.situation_id,
    snapshot.lifecycle_state,
    snapshot.confidence.score,
    stableJson(snapshot.confidence),
    snapshot.summary,
    snapshot.escalation_score,
    snapshot.timing_pressure,
    stableJson(snapshot.evidence_event_ids),
    snapshot.replay_hash,
    snapshot.previous_snapshot_hash,
    snapshot.created_at,
  );
  assertIdempotentInsert(db, "situation_snapshots", "snapshot_id", snapshot.snapshot_id, "replay_hash", snapshot.replay_hash, result.changes);
  return snapshot;
}

export function appendSituationConfidenceHistory(
  history: SituationConfidenceHistory,
  db: Database.Database = getPipelineDb(),
): SituationConfidenceHistory {
  ensureSituationSchema(db);
  const result = db.prepare(`
    INSERT OR IGNORE INTO situation_confidence_history (
      history_id, situation_id, previous_confidence, new_confidence,
      factor_breakdown_json, reasoning_json, event_id, replay_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    history.history_id,
    history.situation_id,
    history.previous_confidence,
    history.new_confidence,
    stableJson(history.factor_breakdown),
    stableJson(history.reasoning),
    history.event_id,
    history.replay_hash,
    history.created_at,
  );
  assertIdempotentInsert(db, "situation_confidence_history", "history_id", history.history_id, "replay_hash", history.replay_hash, result.changes);
  return history;
}

export function appendSituationStateHistory(
  history: SituationStateHistory,
  db: Database.Database = getPipelineDb(),
): SituationStateHistory {
  ensureSituationSchema(db);
  const result = db.prepare(`
    INSERT OR IGNORE INTO situation_state_history (
      history_id, situation_id, previous_state, new_state, transition_reason,
      trigger_event_id, metadata_json, replay_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    history.history_id,
    history.situation_id,
    history.previous_state,
    history.new_state,
    history.transition_reason,
    history.trigger_event_id,
    stableJson(history.metadata),
    history.replay_hash,
    history.created_at,
  );
  assertIdempotentInsert(db, "situation_state_history", "history_id", history.history_id, "replay_hash", history.replay_hash, result.changes);
  return history;
}

export function appendSituationRelationship(
  relationship: SituationRelationship,
  db: Database.Database = getPipelineDb(),
): SituationRelationship {
  ensureSituationSchema(db);
  const result = db.prepare(`
    INSERT OR IGNORE INTO situation_relationships (
      relationship_id, source_situation_id, target_situation_id, relationship_type,
      confidence, reasoning_json, created_at, replay_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    relationship.relationship_id,
    relationship.source_situation_id,
    relationship.target_situation_id,
    relationship.relationship_type,
    relationship.confidence,
    stableJson(relationship.reasoning),
    relationship.created_at,
    relationship.replay_hash,
  );
  assertIdempotentInsert(db, "situation_relationships", "relationship_id", relationship.relationship_id, "replay_hash", relationship.replay_hash, result.changes);
  return relationship;
}

/**
 * Insert-once record of the first mainstream pickup of a situation.
 * PRIMARY KEY on situation_id + INSERT OR IGNORE means the first
 * confirmation is canonical — later pickups never overwrite it.
 * Returns true only when this call recorded the confirmation.
 */
export function insertSituationPublicConfirmation(
  confirmation: SituationPublicConfirmation,
  db: Database.Database = getPipelineDb(),
): boolean {
  ensureSituationSchema(db);
  const result = db.prepare(`
    INSERT OR IGNORE INTO situation_public_confirmations (
      situation_id, confirmed_at, detection_lead_minutes, source_name,
      confirmation_reason, raw_event_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    confirmation.situation_id,
    confirmation.confirmed_at,
    confirmation.detection_lead_minutes,
    confirmation.source_name,
    confirmation.confirmation_reason,
    confirmation.raw_event_id,
    confirmation.created_at,
  );
  return result.changes > 0;
}

export function getSituationPublicConfirmation(
  situationId: string,
  db: Database.Database = getPipelineDb(),
): SituationPublicConfirmation | null {
  ensureSituationSchema(db);
  const row = db.prepare(`
    SELECT * FROM situation_public_confirmations WHERE situation_id = ?
  `).get(situationId) as any;
  if (!row) return null;
  return {
    situation_id: row.situation_id,
    confirmed_at: row.confirmed_at,
    detection_lead_minutes: row.detection_lead_minutes,
    source_name: row.source_name,
    confirmation_reason: row.confirmation_reason,
    raw_event_id: row.raw_event_id,
    created_at: row.created_at,
  };
}

export function listSituationsForMatching(opts: {
  readonly league: string;
  readonly situation_type?: string;
  readonly limit?: number;
}, db: Database.Database = getPipelineDb()): (Situation & { latest_snapshot_at: string | null })[] {
  ensureSituationSchema(db);
  const params: unknown[] = [opts.league];
  let where = "WHERE s.league = ?";
  if (opts.situation_type) {
    where += " AND s.situation_type = ?";
    params.push(opts.situation_type);
  }
  params.push(opts.limit ?? 100);

  const rows = db.prepare(`
    SELECT s.*, MAX(ss.created_at) AS latest_snapshot_at
    FROM situations s
    LEFT JOIN situation_snapshots ss ON ss.situation_id = s.situation_id
    ${where}
    GROUP BY s.situation_id
    ORDER BY COALESCE(MAX(ss.created_at), s.created_at) DESC, s.situation_id ASC
    LIMIT ?
  `).all(...params);

  return rows.map(deserializeCanonicalSituationRecord).filter(isUsableSituation);
}

export function getLatestSituationSnapshot(
  situationId: string,
  db: Database.Database = getPipelineDb(),
): SituationSnapshot | null {
  ensureSituationSchema(db);
  const row = db.prepare(`
    SELECT *
    FROM situation_snapshots
    WHERE situation_id = ?
    ORDER BY created_at DESC, snapshot_id ASC
    LIMIT 1
  `).get(situationId);
  return row ? deserializeSnapshot(row) : null;
}

export interface CanonicalSituationRecord extends Situation {
  readonly latest_snapshot: SituationSnapshot | null;
  readonly latest_snapshot_at: string | null;
}
const SITUATION_NOISE_PATTERNS = [
  /transfer your tickets/i,
  /download tickets/i,
  /how to transfer/i,
  /&amp;/,
  /roster move changes roster availability and may affect downstream/i,
  /may affect downstream sports context/i,
  /account transfer/i,
  /operator.?note/i,
];

function isUsableSituation(record: CanonicalSituationRecord): boolean {
  const summary = record.latest_snapshot?.summary ?? "";
  const title = record.situation_type ?? "";
  // Suppress situations with no snapshot at all
  if (!record.latest_snapshot) return false;
  // Suppress situations with noise content in summary
  if (SITUATION_NOISE_PATTERNS.some((p) => p.test(summary))) return false;
  // Suppress situations with confidence below 15 and only one evidence event
  const confidence = record.latest_snapshot.confidence.score;
  const evidenceCount = record.latest_snapshot.evidence_event_ids.length;
  if (confidence < 15 && evidenceCount <= 1) return false;
  return true;
}

export function listCanonicalSituations(opts: {
  readonly league?: string;
  readonly sport?: string;
  readonly situation_type?: string;
  readonly state?: string;
  readonly active_only?: boolean;
  readonly order_by?: "escalation_score" | "confidence" | "updated_at";
  readonly limit?: number;
} = {}, db: Database.Database = getPipelineDb()): CanonicalSituationRecord[] {
  ensureSituationSchema(db);
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.league) {
    where.push("s.league = ?");
    params.push(opts.league);
  }
  if (opts.sport) {
    where.push("s.sport = ?");
    params.push(opts.sport);
  }
  if (opts.situation_type) {
    where.push("s.situation_type = ?");
    params.push(opts.situation_type);
  }
  if (opts.state) {
    where.push("latest.lifecycle_state = ?");
    params.push(opts.state);
  }
  if (opts.active_only) {
    where.push("(latest.lifecycle_state IS NULL OR latest.lifecycle_state IN ('watching', 'emerging', 'developing', 'escalating', 'confirmed', 'official', 'cooling'))");
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  params.push(opts.limit ?? 100);
  const orderSql =
    opts.order_by === "escalation_score"
      ? "COALESCE(latest.escalation_score, 0) DESC, COALESCE(latest.created_at, s.created_at) DESC, s.situation_id ASC"
      : opts.order_by === "confidence"
        ? "COALESCE(latest.confidence_score, 0) DESC, COALESCE(latest.created_at, s.created_at) DESC, s.situation_id ASC"
        : "COALESCE(latest.created_at, s.created_at) DESC, s.situation_id ASC";

  const rows = db.prepare(`
    SELECT
      s.*,
      latest.snapshot_id,
      latest.lifecycle_state,
      latest.confidence_score,
      latest.confidence_json,
      latest.summary,
      latest.escalation_score,
      latest.timing_pressure,
      latest.evidence_event_ids_json,
      latest.replay_hash AS snapshot_replay_hash,
      latest.previous_snapshot_hash,
      latest.created_at AS snapshot_created_at
    FROM situations s
    LEFT JOIN situation_snapshots latest
      ON latest.snapshot_id = (
        SELECT ss.snapshot_id
        FROM situation_snapshots ss
        WHERE ss.situation_id = s.situation_id
        ORDER BY ss.created_at DESC, ss.snapshot_id ASC
        LIMIT 1
      )
    ${whereSql}
    ORDER BY ${orderSql}
    LIMIT ?
  `).all(...params);

  return rows.map(deserializeCanonicalSituationRecord);
}

export function listSituationEvents(
  situationId: string,
  db: Database.Database = getPipelineDb(),
): SituationEvent[] {
  ensureSituationSchema(db);
  const rows = db.prepare(`
    SELECT *
    FROM situation_events
    WHERE situation_id = ?
    ORDER BY recorded_at ASC, event_id ASC
  `).all(situationId);
  return rows.map(deserializeSituationEvent);
}

export function listSituationConfidenceHistory(
  situationId: string,
  db: Database.Database = getPipelineDb(),
): SituationConfidenceHistory[] {
  ensureSituationSchema(db);
  const rows = db.prepare(`
    SELECT *
    FROM situation_confidence_history
    WHERE situation_id = ?
    ORDER BY created_at ASC, history_id ASC
  `).all(situationId);
  return rows.map(deserializeConfidenceHistory);
}

export function listSituationStateHistory(
  situationId: string,
  db: Database.Database = getPipelineDb(),
): SituationStateHistory[] {
  ensureSituationSchema(db);
  const rows = db.prepare(`
    SELECT *
    FROM situation_state_history
    WHERE situation_id = ?
    ORDER BY created_at ASC, history_id ASC
  `).all(situationId);
  return rows.map(deserializeStateHistory);
}

export function listSituationSnapshots(
  situationId: string,
  db: Database.Database = getPipelineDb(),
): SituationSnapshot[] {
  ensureSituationSchema(db);
  const rows = db.prepare(`
    SELECT *
    FROM situation_snapshots
    WHERE situation_id = ?
    ORDER BY created_at ASC, snapshot_id ASC
  `).all(situationId);
  return rows.map(deserializeSnapshot);
}

export function buildSituationEvent(input: Omit<SituationEvent, "event_id" | "replay_hash" | "lineage_hash">): SituationEvent {
  const replayPayload = {
    situation_id: input.situation_id,
    kind: input.kind,
    raw_event_id: input.raw_event_id,
    normalized_event_id: input.normalized_event_id,
    source_id: input.source_id,
    observed_at: input.observed_at,
    recorded_at: input.recorded_at,
    payload: input.payload,
  };
  const replayHash = computeCanonicalHash(replayPayload);
  const lineageHash = computeCanonicalHash({
    situation_id: input.situation_id,
    kind: input.kind,
    raw_event_id: input.raw_event_id,
    normalized_event_id: input.normalized_event_id,
    source_id: input.source_id,
    replay_hash: replayHash,
  });

  return {
    ...input,
    event_id: `se_${replayHash.slice(0, 24)}`,
    replay_hash: replayHash,
    lineage_hash: lineageHash,
  };
}

export function createHistoryId(prefix: string, payload: unknown): string {
  return `${prefix}_${computeCanonicalHash(payload).slice(0, 24)}`;
}

export function verifySituationAppendOnlyGuards(db: Database.Database = getPipelineDb()): { ok: boolean; missing: string[] } {
  ensureSituationSchema(db);
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as { name: string }[];
  const triggerNames = new Set(rows.map((row) => row.name));
  const missing: string[] = [];
  for (const table of APPEND_ONLY_TABLES) {
    for (const operation of ["update", "delete"]) {
      const trigger = `${table}_no_${operation}`;
      if (!triggerNames.has(trigger)) missing.push(trigger);
    }
  }
  return { ok: missing.length === 0, missing };
}

function installAppendOnlyGuards(db: Database.Database): void {
  for (const table of APPEND_ONLY_TABLES) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS ${table}_no_update
      BEFORE UPDATE ON ${table}
      BEGIN
        SELECT RAISE(ABORT, '${table} is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS ${table}_no_delete
      BEFORE DELETE ON ${table}
      BEGIN
        SELECT RAISE(ABORT, '${table} is append-only');
      END;
    `);
  }
}

function deserializeSituationWithLatestSnapshot(row: any): Situation & { latest_snapshot_at: string | null } {
  return {
    situation_id: row.situation_id,
    canonical_hash: row.canonical_hash,
    sport: row.sport,
    league: row.league,
    game_id: row.game_id,
    teams: parseJson(row.teams_json, []),
    players: parseJson(row.players_json, []),
    situation_type: row.situation_type,
    semantic_fingerprint: row.semantic_fingerprint,
    created_from_event_id: row.created_from_event_id,
    created_at: row.created_at,
    latest_snapshot_at: row.latest_snapshot_at ?? null,
  };
}

function deserializeSnapshot(row: any): SituationSnapshot {
  return {
    snapshot_id: row.snapshot_id,
    situation_id: row.situation_id,
    lifecycle_state: row.lifecycle_state,
    confidence: parseJson<SituationConfidenceExplanation>(row.confidence_json, {
      score: row.confidence_score,
      factors: {
        source_reliability: 0,
        independent_confirmations: 0,
        market_alignment: 0,
        validator_agreement: 0,
        official_confirmation: 0,
        freshness: 0,
        contradiction_penalty: 0,
      },
      reasoning: [],
      computed_at: row.created_at,
      replay_hash: row.replay_hash,
    }),
    summary: row.summary,
    escalation_score: row.escalation_score,
    timing_pressure: row.timing_pressure,
    evidence_event_ids: parseJson(row.evidence_event_ids_json, []),
    replay_hash: row.replay_hash,
    previous_snapshot_hash: row.previous_snapshot_hash,
    created_at: row.created_at,
  };
}

function deserializeCanonicalSituationRecord(row: any): CanonicalSituationRecord {
  const situation = deserializeSituationWithLatestSnapshot(row);
  const latest_snapshot = row.snapshot_id
    ? deserializeSnapshot({
        snapshot_id: row.snapshot_id,
        situation_id: row.situation_id,
        lifecycle_state: row.lifecycle_state,
        confidence_score: row.confidence_score,
        confidence_json: row.confidence_json,
        summary: row.summary,
        escalation_score: row.escalation_score,
        timing_pressure: row.timing_pressure,
        evidence_event_ids_json: row.evidence_event_ids_json,
        replay_hash: row.snapshot_replay_hash,
        previous_snapshot_hash: row.previous_snapshot_hash,
        created_at: row.snapshot_created_at,
      })
    : null;

  return {
    ...situation,
    latest_snapshot,
  };
}

function deserializeSituationEvent(row: any): SituationEvent {
  return {
    event_id: row.event_id,
    situation_id: row.situation_id,
    kind: row.kind,
    raw_event_id: row.raw_event_id,
    normalized_event_id: row.normalized_event_id,
    source_id: row.source_id,
    observed_at: row.observed_at,
    recorded_at: row.recorded_at,
    replay_hash: row.replay_hash,
    lineage_hash: row.lineage_hash,
    payload: parseJson(row.payload_json, {}),
  };
}

function deserializeConfidenceHistory(row: any): SituationConfidenceHistory {
  return {
    history_id: row.history_id,
    situation_id: row.situation_id,
    previous_confidence: row.previous_confidence,
    new_confidence: row.new_confidence,
    factor_breakdown: parseJson(row.factor_breakdown_json, {
      source_reliability: 0,
      independent_confirmations: 0,
      market_alignment: 0,
      validator_agreement: 0,
      official_confirmation: 0,
      freshness: 0,
      contradiction_penalty: 0,
    }),
    reasoning: parseJson(row.reasoning_json, []),
    event_id: row.event_id,
    replay_hash: row.replay_hash,
    created_at: row.created_at,
  };
}

function deserializeStateHistory(row: any): SituationStateHistory {
  return {
    history_id: row.history_id,
    situation_id: row.situation_id,
    previous_state: row.previous_state,
    new_state: row.new_state,
    transition_reason: row.transition_reason,
    trigger_event_id: row.trigger_event_id,
    metadata: parseJson(row.metadata_json, {}),
    replay_hash: row.replay_hash,
    created_at: row.created_at,
  };
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortJson((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function assertIdempotentInsert(
  db: Database.Database,
  table: string,
  idColumn: string,
  id: string,
  hashColumn: string,
  expectedHash: string,
  changes: number,
): void {
  if (changes > 0) return;
  const row = db.prepare(`SELECT ${hashColumn} AS stored_hash FROM ${table} WHERE ${idColumn} = ?`).get(id) as { stored_hash?: string } | undefined;
  if (row?.stored_hash !== expectedHash) {
    throw new Error(`Replay conflict for ${table}.${idColumn}=${id}: stored ${hashColumn} does not match incoming ${hashColumn}`);
  }
}

export function ephemeralSituationUuid(): string {
  return randomUUID();
}
