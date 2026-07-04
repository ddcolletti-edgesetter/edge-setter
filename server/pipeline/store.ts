/**
 * Edge Setter — Pipeline In-Memory Store  (Sprint 7)
 *
 * Simple in-process store for Games, RawEvents, LiveSignals, and Outcomes.
 * Backed by SQLite via the existing storage layer for persistence on the
 * existing tables; the new pipeline tables are appended via raw SQL here.
 *
 * Architecture decision: we use SQLite with raw statements for the new
 * pipeline tables (games, raw_events, live_signals, outcomes) to keep
 * the pipeline self-contained and avoid a full Drizzle migration cycle.
 * A future migration can move these to Supabase when the schema stabilises.
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import type { Game, RawEvent, LiveSignal, Outcome } from "./types";
import type {
  ReplayAuditAnalyticsContract,
  ReplayAuditAnalyticsRow,
  ReplayEvolutionMetricContract,
  ReplayEvolutionMetricRow,
  ReplayForensicIntelligenceRecordContract,
  ReplayForensicIntelligenceRecordRow,
  ReplayIntelligenceSnapshotContract,
  ReplayIntelligenceSnapshotRow,
  ReplayLineageIntelligenceMetricContract,
  ReplayLineageIntelligenceMetricRow,
} from "./replay-intelligence-contract";
import {
  markBackfillPhase as _markBackfillPhase,
  getBackfillPhase as _getBackfillPhase,
  getAllBackfillProgress as _getAllBackfillProgress,
  resetBackfillPhases as _resetBackfillPhases,
  type BackfillPhase,
} from "../storage";

/* ─── DB setup ─────────────────────────────────────────── */

function resolvePipelineDataDir(): string {
  // Set PIPELINE_DATA_DIR to a persistent mount path (e.g. /var/data on Render)
  // to survive dyno restarts. Falls back to DATA_DIR (the persistent disk used
  // by storage.ts), then /tmp (ephemeral) as a last resort.
  for (const dir of [process.env.PIPELINE_DATA_DIR, process.env.DATA_DIR, "/tmp", "."]) {
    if (!dir) continue;
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, ".wp");
      fs.writeFileSync(probe, "1");
      fs.unlinkSync(probe);
      return dir;
    } catch { /* try next */ }
  }
  return ".";
}

const DB_PATH = path.join(resolvePipelineDataDir(), "pipeline.db");
let _db: Database.Database | null = null;

export function getPipelineDb(): Database.Database {
  if (_db && fs.existsSync(DB_PATH)) return _db;
  if (_db) {
    try { _db.close(); } catch { /* already closed */ }
    _db = null;
  }
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  initSchema(_db);
  return _db;
}

function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some(c => c.name === column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS backfill_progress (
      id            TEXT PRIMARY KEY,   -- "{league}|{season}|{phase}"
      league        TEXT NOT NULL,
      season        TEXT NOT NULL,
      phase         TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending',
      records_inserted INTEGER NOT NULL DEFAULT 0,
      error         TEXT,
      started_at    TEXT,
      completed_at  TEXT,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS calibration_weights (
      id            TEXT PRIMARY KEY,   -- "{weight_type}|{league}"
      league        TEXT NOT NULL,
      seasons       TEXT NOT NULL DEFAULT '[]',
      weight_type   TEXT NOT NULL,
      weights       TEXT NOT NULL DEFAULT '{}',
      sample_size   INTEGER NOT NULL DEFAULT 0,
      computed_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS games (
      id              TEXT PRIMARY KEY,
      league          TEXT NOT NULL,
      home_team       TEXT NOT NULL,
      away_team       TEXT NOT NULL,
      game_time       TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'scheduled',
      spread_line     REAL,
      spread_team     TEXT,
      total_line      REAL,
      moneyline_home  REAL,
      moneyline_away  REAL,
      open_spread     REAL,
      open_total      REAL,
      home_score      REAL,
      away_score      REAL,
      source_game_id  TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );

CREATE TABLE IF NOT EXISTS odds_snapshots (
  id                TEXT PRIMARY KEY,
  game_id           TEXT NOT NULL,
  league            TEXT NOT NULL,
  sportsbook        TEXT NOT NULL,
  market_source     TEXT NOT NULL DEFAULT 'the_odds_api',
  spread_line       REAL,
  spread_team       TEXT,
  total_line        REAL,
  moneyline_home    REAL,
  moneyline_away    REAL,
  source_game_id    TEXT,
  snapshot_at       TEXT NOT NULL,
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_odds_snapshots_game_time
  ON odds_snapshots(game_id, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_odds_snapshots_league_time
  ON odds_snapshots(league, snapshot_at DESC);
    CREATE TABLE IF NOT EXISTS raw_events (
      id            TEXT PRIMARY KEY,
      source_id     TEXT NOT NULL,
      source_type   TEXT NOT NULL,
      league        TEXT NOT NULL,
      game_id       TEXT,
      team          TEXT,
      player        TEXT,
      event_type    TEXT NOT NULL,
      payload       TEXT NOT NULL,          -- JSON
      processed     INTEGER NOT NULL DEFAULT 0,
      processed_at  TEXT,
      created_at    TEXT NOT NULL,
      received_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS live_signals (
      id                      TEXT PRIMARY KEY,
      league                  TEXT NOT NULL,
      game_id                 TEXT,
      signal_type             TEXT NOT NULL,
      headline                TEXT NOT NULL,
      body                    TEXT NOT NULL DEFAULT '',
      action_note             TEXT NOT NULL DEFAULT '',
      why_it_matters          TEXT NOT NULL DEFAULT '',
      team                    TEXT,
      player                  TEXT,
      matchup                 TEXT,
      sources                 TEXT NOT NULL DEFAULT '[]',  -- JSON
      source_count            INTEGER NOT NULL DEFAULT 0,
      verdict                 TEXT NOT NULL DEFAULT 'review',
      confidence              REAL NOT NULL DEFAULT 50,
      confirmation_strength   TEXT NOT NULL DEFAULT 'Developing',
      line_movement           TEXT,       -- JSON or NULL
      injury_designation      TEXT,
      lineup_status           TEXT,
      weather_note            TEXT,
      betting_relevance       INTEGER NOT NULL DEFAULT 0,
      fantasy_relevance       INTEGER NOT NULL DEFAULT 0,
      score                   REAL NOT NULL DEFAULT 0,
      score_band              TEXT NOT NULL DEFAULT 'Informational',
      urgency_label           TEXT NOT NULL DEFAULT 'NOTE',
      urgency_reason          TEXT NOT NULL DEFAULT '',
      trust_label             TEXT NOT NULL DEFAULT 'Developing',
      score_explanation       TEXT NOT NULL DEFAULT '',
      breakdown               TEXT NOT NULL DEFAULT '{}',  -- JSON
      raw_event_ids           TEXT NOT NULL DEFAULT '[]',  -- JSON
      signal_time             TEXT NOT NULL,
      first_seen_at           TEXT,
      created_at              TEXT NOT NULL,
      updated_at              TEXT NOT NULL,
      outcome_id              TEXT
    );
CREATE TABLE IF NOT EXISTS signal_state_history (
  id                TEXT PRIMARY KEY,
  signal_id         TEXT NOT NULL,
  previous_state    TEXT,
  new_state         TEXT NOT NULL,
  reason            TEXT,
  metadata          TEXT DEFAULT '{}',
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_signal_state_history_signal
  ON signal_state_history(signal_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_live_signals_league      ON live_signals(league);
    CREATE INDEX IF NOT EXISTS idx_live_signals_created_at  ON live_signals(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_raw_events_processed     ON raw_events(processed);
    CREATE INDEX IF NOT EXISTS idx_raw_events_league        ON raw_events(league);

    CREATE TABLE IF NOT EXISTS outcomes (
      id              TEXT PRIMARY KEY,
      signal_id       TEXT NOT NULL,
      game_id         TEXT NOT NULL,
      home_score      REAL,
      away_score      REAL,
      market          TEXT NOT NULL DEFAULT 'spread',
      line_at_signal  REAL,
      closing_line    REAL,
      actual_result   REAL,
      hit             INTEGER,            -- NULL until settled; 1=hit 0=miss
      clv             REAL,               -- NULL until settled
      recorded_at     TEXT,
      created_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replay_audits (
      id                          TEXT PRIMARY KEY,
      game_id                     TEXT NOT NULL,
      as_of                       TEXT NOT NULL,
      replay_hash                 TEXT NOT NULL,
      timeline_hash               TEXT,
      signal_hash                 TEXT,
      snapshot_hash               TEXT,
      verification_status         TEXT NOT NULL DEFAULT 'unknown',
      divergence_count            INTEGER NOT NULL DEFAULT 0,
      divergence_summary_json     TEXT,
      provenance_json             TEXT,
      lineage_json                TEXT,
      reconstruction_version      TEXT,
      replay_version              INTEGER NOT NULL DEFAULT 1,
      created_at                  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_audits_game
      ON replay_audits(game_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_replay_audits_hash
      ON replay_audits(replay_hash);

    CREATE INDEX IF NOT EXISTS idx_replay_audits_status
      ON replay_audits(verification_status);

    CREATE TABLE IF NOT EXISTS replay_divergence_history (
      id                          TEXT PRIMARY KEY,
      replay_hash                 TEXT NOT NULL,
      compared_against            TEXT,
      divergence_detected         INTEGER NOT NULL DEFAULT 0,
      mismatch_count              INTEGER NOT NULL DEFAULT 0,
      mismatch_categories_json    TEXT NOT NULL DEFAULT '[]',
      mismatch_details_json       TEXT NOT NULL DEFAULT '[]',
      integrity_status            TEXT NOT NULL,
      confidence_delta            REAL,
      analyzed_at                 TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_divergence_history_hash
      ON replay_divergence_history(replay_hash, analyzed_at DESC);

    CREATE INDEX IF NOT EXISTS idx_replay_divergence_history_integrity
      ON replay_divergence_history(integrity_status);

    CREATE TABLE IF NOT EXISTS replay_archive_manifests (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      archive_id                  TEXT NOT NULL UNIQUE,
      game_id                     TEXT NOT NULL,
      created_at                  TEXT NOT NULL,
      forensic_version            INTEGER NOT NULL,
      snapshot_hash               TEXT NOT NULL,
      bundle_hash                 TEXT NOT NULL,
      export_hash                 TEXT NOT NULL,
      timeline_hash               TEXT NOT NULL,
      signal_hash                 TEXT NOT NULL,
      settlement_hash             TEXT NOT NULL,
      provenance_hash             TEXT NOT NULL,
      compression                 TEXT NOT NULL,
      bundle_size_bytes           INTEGER NOT NULL,
      replay_count                INTEGER NOT NULL,
      verification_status         TEXT NOT NULL,
      retention_class             TEXT NOT NULL,
      parent_archive_id           TEXT,
      root_archive_id             TEXT,
      revision_number             INTEGER NOT NULL,
      tags_json                   TEXT NOT NULL DEFAULT '[]'
    );

    CREATE INDEX IF NOT EXISTS idx_replay_archive_manifests_game
      ON replay_archive_manifests(game_id, created_at DESC, archive_id ASC);

    CREATE INDEX IF NOT EXISTS idx_replay_archive_manifests_lineage
      ON replay_archive_manifests(root_archive_id, parent_archive_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS replay_archive_snapshots (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      archive_id                  TEXT NOT NULL,
      forensic_metadata_json      TEXT NOT NULL,
      forensic_payload_json       TEXT NOT NULL,
      generated_report_json       TEXT NOT NULL,
      canonical_hash              TEXT NOT NULL,
      created_at                  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_archive_snapshots_archive
      ON replay_archive_snapshots(archive_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS replay_archive_verifications (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      archive_id                  TEXT NOT NULL,
      verified_at                 TEXT NOT NULL,
      verification_hash           TEXT NOT NULL,
      verification_status         TEXT NOT NULL,
      mismatch_count              INTEGER NOT NULL,
      details_json                TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_replay_archive_verifications_archive
      ON replay_archive_verifications(archive_id, verified_at DESC);

    CREATE TABLE IF NOT EXISTS replay_intelligence_snapshots (
      snapshot_id                 TEXT PRIMARY KEY,
      snapshot_kind               TEXT NOT NULL,
      scope                       TEXT NOT NULL,
      scope_id                    TEXT NOT NULL,
      generated_at                TEXT NOT NULL,
      deterministic_hash          TEXT NOT NULL,
      report_version              INTEGER NOT NULL,
      payload_json                TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_intelligence_snapshots_scope
      ON replay_intelligence_snapshots(scope, scope_id, generated_at DESC, snapshot_id ASC);

    CREATE INDEX IF NOT EXISTS idx_replay_intelligence_snapshots_hash
      ON replay_intelligence_snapshots(deterministic_hash);

    CREATE TABLE IF NOT EXISTS replay_forensic_intelligence_records (
      record_id                   TEXT PRIMARY KEY,
      snapshot_id                 TEXT NOT NULL,
      archive_id                  TEXT,
      replay_hash                 TEXT,
      game_id                     TEXT,
      metric_name                 TEXT NOT NULL,
      metric_value                REAL NOT NULL,
      severity                    TEXT NOT NULL,
      category                    TEXT NOT NULL,
      observed_at                 TEXT NOT NULL,
      deterministic_hash          TEXT NOT NULL,
      details_json                TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_forensic_intelligence_snapshot
      ON replay_forensic_intelligence_records(snapshot_id, observed_at DESC, record_id ASC);

    CREATE INDEX IF NOT EXISTS idx_replay_forensic_intelligence_archive
      ON replay_forensic_intelligence_records(archive_id, observed_at DESC, record_id ASC);

    CREATE INDEX IF NOT EXISTS idx_replay_forensic_intelligence_replay
      ON replay_forensic_intelligence_records(replay_hash, observed_at DESC, record_id ASC);

    CREATE TABLE IF NOT EXISTS replay_evolution_metrics (
      metric_id                   TEXT PRIMARY KEY,
      snapshot_id                 TEXT NOT NULL,
      archive_id                  TEXT NOT NULL,
      game_id                     TEXT NOT NULL,
      replay_hash                 TEXT,
      score                       REAL NOT NULL,
      band                        TEXT NOT NULL,
      drift_count                 INTEGER NOT NULL,
      mutation_count              INTEGER NOT NULL,
      lineage_depth               INTEGER NOT NULL,
      critical_mismatch_count     INTEGER NOT NULL,
      computed_at                 TEXT NOT NULL,
      deterministic_hash          TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_evolution_metrics_archive
      ON replay_evolution_metrics(archive_id, computed_at DESC, metric_id ASC);

    CREATE INDEX IF NOT EXISTS idx_replay_evolution_metrics_game
      ON replay_evolution_metrics(game_id, score DESC, archive_id ASC);

    CREATE TABLE IF NOT EXISTS replay_lineage_intelligence_metrics (
      metric_id                   TEXT PRIMARY KEY,
      snapshot_id                 TEXT NOT NULL,
      root_archive_id             TEXT,
      archive_id                  TEXT,
      max_depth                   INTEGER NOT NULL,
      average_depth               REAL NOT NULL,
      root_archive_count          INTEGER NOT NULL,
      leaf_archive_count          INTEGER NOT NULL,
      cycle_detected              INTEGER NOT NULL,
      complete                    INTEGER NOT NULL,
      computed_at                 TEXT NOT NULL,
      deterministic_hash          TEXT NOT NULL,
      details_json                TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_lineage_intelligence_root
      ON replay_lineage_intelligence_metrics(root_archive_id, computed_at DESC, metric_id ASC);

    CREATE INDEX IF NOT EXISTS idx_replay_lineage_intelligence_archive
      ON replay_lineage_intelligence_metrics(archive_id, computed_at DESC, metric_id ASC);

    CREATE TABLE IF NOT EXISTS replay_audit_analytics (
      analytics_id                TEXT PRIMARY KEY,
      snapshot_id                 TEXT NOT NULL,
      scope                       TEXT NOT NULL,
      scope_id                    TEXT NOT NULL,
      window                      TEXT NOT NULL,
      window_start                TEXT,
      window_end                  TEXT,
      archive_count               INTEGER NOT NULL,
      replay_count                INTEGER NOT NULL,
      verified_count              INTEGER NOT NULL,
      failed_count                INTEGER NOT NULL,
      diverged_count              INTEGER NOT NULL,
      mutation_count              INTEGER NOT NULL,
      drift_count                 INTEGER NOT NULL,
      critical_mismatch_count     INTEGER NOT NULL,
      computed_at                 TEXT NOT NULL,
      deterministic_hash          TEXT NOT NULL,
      details_json                TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_audit_analytics_scope
      ON replay_audit_analytics(scope, scope_id, computed_at DESC, analytics_id ASC);

    CREATE INDEX IF NOT EXISTS idx_replay_audit_analytics_snapshot
      ON replay_audit_analytics(snapshot_id, computed_at DESC, analytics_id ASC);

    CREATE TABLE IF NOT EXISTS rss_seen_hashes (
      hash    TEXT    PRIMARY KEY,
      seen_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rss_seen_hashes_seen_at
      ON rss_seen_hashes(seen_at DESC);

    CREATE TABLE IF NOT EXISTS signal_detections (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_id        TEXT NOT NULL,
      player_name      TEXT,
      team             TEXT,
      league           TEXT NOT NULL,
      signal_type      TEXT NOT NULL,
      source_url       TEXT,
      source_tier      INTEGER,
      detected_at      INTEGER NOT NULL,
      confidence_score REAL,
      raw_headline     TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_signal_detections_signal_id
      ON signal_detections(signal_id);
    CREATE INDEX IF NOT EXISTS idx_signal_detections_detected_at
      ON signal_detections(detected_at DESC);
    CREATE INDEX IF NOT EXISTS idx_signal_detections_player
      ON signal_detections(player_name, league);

  `);

  // Migrate existing DBs that predate home_score/away_score columns on games
  addColumnIfMissing(db, "games", "home_score", "REAL");
  addColumnIfMissing(db, "games", "away_score", "REAL");
  // Migrate live_signals to support archival
  addColumnIfMissing(db, "live_signals", "is_archived", "INTEGER NOT NULL DEFAULT 0");
  // Migrate live_signals to track when the signal was first observed
  addColumnIfMissing(db, "live_signals", "first_seen_at", "TEXT");
}

/* ─── Live signal archival ───────────────────────────────────────────────────
 * Prevents stale signals (old draft picks, resolved injuries) from re-entering
 * the distribution queue indefinitely.
 */

export function archiveOldLiveSignals(
  olderThanDays = 7,
  db: Database.Database = getPipelineDb(),
): number {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  const result = db
    .prepare(`UPDATE live_signals SET is_archived = 1 WHERE created_at < ? AND is_archived = 0`)
    .run(cutoff);
  return result.changes;
}

/* ─── T1 signal detection logging ─────────────────────────────────────────── * Records the moment EdgeSetter first detects a named-player signal. * This is T1 — the backtesting clock starts here. * Only fires for new signals (not updates) with a non-null player and a * recognized signal_type. Additive only — does not touch live_signals. */

const TRACKED_SIGNAL_TYPES = new Set([
  "injury_update", "transaction", "lineup_change", "lineup_confirm",
  "eligibility_ruling", "coaching_change", "transfer_portal",
]);

export function insertSignalDetection(
  signal: { id: string; player: string | null; team: string | null; league: string; signal_type: string; confidence: number; headline: string },
  raw: { payload: unknown },
  db: Database.Database = getPipelineDb(),
): void {
  if (!signal.player || !TRACKED_SIGNAL_TYPES.has(signal.signal_type)) return;

  const p = raw.payload as any;
  const sourceUrl: string | null = p.source_url ?? p.link ?? null;
  const sourceTier: number | null = p.source_tier
    ?? (p.tier === "tier1" ? 1 : p.tier === "tier2" ? 2 : p.tier === "tier3" ? 3 : null);
  try {
    db.prepare(`
      INSERT INTO signal_detections
        (signal_id, player_name, team, league, signal_type, source_url, source_tier, detected_at, confidence_score, raw_headline)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      signal.id,
      signal.player,
      signal.team ?? null,
      signal.league,
      signal.signal_type,
      sourceUrl,
      sourceTier,
      Date.now(),
      signal.confidence,
      signal.headline?.substring(0, 500) ?? null,
    );
    console.log(`[t1:logged] ${signal.player} | ${signal.signal_type} | detected_at=${Date.now()} | signal=${signal.id.slice(0, 8)}`);
  } catch (err: any) {
    if (!err.message?.includes("UNIQUE")) {
      console.warn(`[t1:log_error] ${signal.player}: ${err.message}`);
    }
  }
}

/* ─── RSS seen-hash dedup ────────────────────────────────────────────────────
 * Persists dedup hashes across dyno restarts. In-memory Set is the fast path;
 * SQLite is the source of truth loaded on first call and written on every insert.
 */

const RSS_HASH_TTL_HOURS = 72;

export function loadRssSeenHashes(
  limit = 50_000,
  db: Database.Database = getPipelineDb(),
): Set<string> {
  const cutoff = Math.floor(Date.now() / 1000) - RSS_HASH_TTL_HOURS * 3600;
  const rows = db
    .prepare(`SELECT hash FROM rss_seen_hashes WHERE seen_at >= ? ORDER BY seen_at DESC LIMIT ?`)
    .all(cutoff, limit) as { hash: string }[];
  return new Set(rows.map((r) => r.hash));
}

export function insertRssSeenHash(
  hash: string,
  db: Database.Database = getPipelineDb(),
): void {
  db.prepare(`INSERT OR REPLACE INTO rss_seen_hashes (hash, seen_at) VALUES (?, ?)`)
    .run(hash, Math.floor(Date.now() / 1000));
}

export function purgeOldRssSeenHashes(db: Database.Database = getPipelineDb()): void {
  const cutoff = Math.floor(Date.now() / 1000) - RSS_HASH_TTL_HOURS * 3600;
  db.prepare(`DELETE FROM rss_seen_hashes WHERE seen_at < ?`).run(cutoff);
}

/* ─── Game CRUD ─────────────────────────────────────────── */
export interface ReplayAuditRecord {
  game_id: string;
  as_of: string;

  replay_hash: string;

  timeline_hash?: string | null;
  signal_hash?: string | null;
  snapshot_hash?: string | null;

  verification_status?: string;

  divergence_count?: number;
  divergence_summary_json?: string | null;

  provenance_json?: string | null;
  lineage_json?: string | null;

  reconstruction_version?: string | null;
  replay_version?: number;
}

export interface ReplayAuditRow extends ReplayAuditRecord {
  id: string;
  verification_status: string;
  divergence_count: number;
  replay_version: number;
  created_at: string;
}

export interface ReplayVerificationRecord {
  id: string;
  game_id: string;
  as_of: string;
  replay_hash: string;
  verification_status: string;
  divergence_count: number;
  divergence_summary_json: string | null;
  timeline_hash: string | null;
  signal_hash: string | null;
  snapshot_hash: string | null;
  reconstruction_version: string | null;
  replay_version: number;
  created_at: string;
}

export interface ReplayProvenanceRecord {
  id: string;
  game_id: string;
  as_of: string;
  replay_hash: string;
  provenance_json: string | null;
  provenance: Record<string, unknown> | null;
  created_at: string;
}

export interface ReplayLineageRecord {
  id: string;
  game_id: string;
  as_of: string;
  replay_hash: string;
  parent_replay_hash: string | null;
  lineage_json: string | null;
  lineage: Record<string, unknown> | null;
  created_at: string;
}

export interface ReplayDivergenceHistoryRecord {
  id: string;
  replay_hash: string;
  compared_against: string | null;
  divergence_detected: boolean;
  mismatch_count: number;
  mismatch_categories_json: string;
  mismatch_details_json: string;
  integrity_status: string;
  confidence_delta: number | null;
  analyzed_at: string;
}

export interface ReplayDivergenceHistoryInput {
  replay_hash: string;
  compared_against: string | null;
  divergence_detected: boolean;
  mismatch_count: number;
  mismatch_categories_json: string;
  mismatch_details_json: string;
  integrity_status: string;
  confidence_delta: number | null;
  analyzed_at: string;
}

export function insertReplayAudit(
  audit: ReplayAuditRecord,
): void {
  const db = getPipelineDb();
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO replay_audits (
      id,
      game_id,
      as_of,
      replay_hash,
      timeline_hash,
      signal_hash,
      snapshot_hash,
      verification_status,
      divergence_count,
      divergence_summary_json,
      provenance_json,
      lineage_json,
      reconstruction_version,
      replay_version,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    audit.game_id,
    audit.as_of,
    audit.replay_hash,
    audit.timeline_hash ?? null,
    audit.signal_hash ?? null,
    audit.snapshot_hash ?? null,
    audit.verification_status ?? "unknown",
    audit.divergence_count ?? 0,
    audit.divergence_summary_json ?? null,
    audit.provenance_json ?? null,
    audit.lineage_json ?? null,
    audit.reconstruction_version ?? null,
    audit.replay_version ?? 1,
    createdAt,
  );
}

export function listReplayAuditsByGameId(gameId: string): ReplayAuditRow[] {
  const db = getPipelineDb();

  return db.prepare(`
    SELECT
      id,
      game_id,
      as_of,
      replay_hash,
      timeline_hash,
      signal_hash,
      snapshot_hash,
      verification_status,
      divergence_count,
      divergence_summary_json,
      provenance_json,
      lineage_json,
      reconstruction_version,
      replay_version,
      created_at
    FROM replay_audits
    WHERE game_id = ?
    ORDER BY created_at DESC, replay_hash ASC
  `).all(gameId) as ReplayAuditRow[];
}

export function getReplayAuditByReplayHash(replayHash: string): ReplayAuditRow | null {
  const db = getPipelineDb();

  return (db.prepare(`
    SELECT
      id,
      game_id,
      as_of,
      replay_hash,
      timeline_hash,
      signal_hash,
      snapshot_hash,
      verification_status,
      divergence_count,
      divergence_summary_json,
      provenance_json,
      lineage_json,
      reconstruction_version,
      replay_version,
      created_at
    FROM replay_audits
    WHERE replay_hash = ?
    ORDER BY created_at DESC, id ASC
    LIMIT 1
  `).get(replayHash) as ReplayAuditRow | undefined) ?? null;
}

export function getLatestReplayVerification(
  replayHash: string,
): ReplayVerificationRecord | null {
  const db = getPipelineDb();

  return (db.prepare(`
    SELECT
      id,
      game_id,
      as_of,
      replay_hash,
      verification_status,
      divergence_count,
      divergence_summary_json,
      timeline_hash,
      signal_hash,
      snapshot_hash,
      reconstruction_version,
      replay_version,
      created_at
    FROM replay_audits
    WHERE replay_hash = ?
    ORDER BY created_at DESC, id ASC
    LIMIT 1
  `).get(replayHash) as ReplayVerificationRecord | undefined) ?? null;
}

export function listReplayVerificationHistory(
  replayHash: string,
): ReplayVerificationRecord[] {
  const db = getPipelineDb();

  return db.prepare(`
    SELECT
      id,
      game_id,
      as_of,
      replay_hash,
      verification_status,
      divergence_count,
      divergence_summary_json,
      timeline_hash,
      signal_hash,
      snapshot_hash,
      reconstruction_version,
      replay_version,
      created_at
    FROM replay_audits
    WHERE replay_hash = ?
    ORDER BY created_at DESC, id ASC
  `).all(replayHash) as ReplayVerificationRecord[];
}

export function getReplayProvenance(replayHash: string): ReplayProvenanceRecord | null {
  const db = getPipelineDb();
  const row = db.prepare(`
    SELECT
      id,
      game_id,
      as_of,
      replay_hash,
      provenance_json,
      created_at
    FROM replay_audits
    WHERE replay_hash = ?
    ORDER BY created_at DESC, id ASC
    LIMIT 1
  `).get(replayHash) as Omit<ReplayProvenanceRecord, "provenance"> | undefined;

  if (!row) return null;

  return {
    ...row,
    provenance: parseReplayAuditJson(row.provenance_json),
  };
}

export function listReplayLineageChildren(parentReplayHash: string): ReplayLineageRecord[] {
  const db = getPipelineDb();
  const rows = db.prepare(`
    SELECT
      id,
      game_id,
      as_of,
      replay_hash,
      json_extract(lineage_json, '$.parent_replay_hash') AS parent_replay_hash,
      lineage_json,
      created_at
    FROM replay_audits
    WHERE lineage_json IS NOT NULL
      AND json_valid(lineage_json)
      AND json_extract(lineage_json, '$.parent_replay_hash') = ?
    ORDER BY created_at DESC, replay_hash ASC
  `).all(parentReplayHash) as Omit<ReplayLineageRecord, "lineage">[];

  return rows.map(row => ({
    ...row,
    lineage: parseReplayAuditJson(row.lineage_json),
  }));
}

export function listReplayLineageParents(childReplayHash: string): ReplayLineageRecord[] {
  const parents: ReplayLineageRecord[] = [];
  const seen = new Set<string>([childReplayHash]);
  let current = getReplayLineageByReplayHash(childReplayHash);

  while (current?.parent_replay_hash && !seen.has(current.parent_replay_hash)) {
    seen.add(current.parent_replay_hash);
    const parent = getReplayLineageByReplayHash(current.parent_replay_hash);
    if (!parent) break;

    parents.push(parent);
    current = parent;
  }

  return parents;
}

function getReplayLineageByReplayHash(replayHash: string): ReplayLineageRecord | null {
  const db = getPipelineDb();
  const row = db.prepare(`
    SELECT
      id,
      game_id,
      as_of,
      replay_hash,
      CASE
        WHEN lineage_json IS NOT NULL AND json_valid(lineage_json)
          THEN json_extract(lineage_json, '$.parent_replay_hash')
        ELSE NULL
      END AS parent_replay_hash,
      lineage_json,
      created_at
    FROM replay_audits
    WHERE replay_hash = ?
    ORDER BY created_at DESC, id ASC
    LIMIT 1
  `).get(replayHash) as Omit<ReplayLineageRecord, "lineage"> | undefined;

  if (!row) return null;

  return {
    ...row,
    lineage: parseReplayAuditJson(row.lineage_json),
  };
}
export interface ReplayDashboardAggregateRow {
  replay_id: string;
  parent_replay_id: string | null;
  intelligence_hash: string;
  category: string;
  timestamp: string;
  anomaly_score: number;
  drift_score: number;
  confidence_score: number;
}

export function listReplayDashboardAggregateRows(): ReplayDashboardAggregateRow[] {
  const db = getPipelineDb();

  const rows = db.prepare(`
    SELECT
      replay_hash AS replay_id,
      CASE
        WHEN lineage_json IS NOT NULL AND json_valid(lineage_json)
        THEN json_extract(lineage_json, '$.parent_replay_hash')
        ELSE NULL
      END AS parent_replay_id,
      replay_hash AS intelligence_hash,
      verification_status AS category,
      created_at AS timestamp,
      CAST(divergence_count AS REAL) AS anomaly_score,
      CAST(divergence_count AS REAL) / 10.0 AS drift_score,
      CASE
        WHEN verification_status = 'verified' THEN 1.0
        WHEN verification_status = 'warning' THEN 0.75
        ELSE 0.5
      END AS confidence_score
    FROM replay_audits
    ORDER BY created_at DESC, replay_hash ASC
  `).all() as ReplayDashboardAggregateRow[];

  return rows.map((row) => ({
    ...row,
    anomaly_score: Number(row.anomaly_score ?? 0),
    drift_score: Number(row.drift_score ?? 0),
    confidence_score: Number(row.confidence_score ?? 0),
  }));
}
function parseReplayAuditJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function upsertReplayDivergenceHistory(
  divergence: ReplayDivergenceHistoryInput,
): ReplayDivergenceHistoryRecord {
  const db = getPipelineDb();
  const id = buildReplayDivergenceHistoryId(
    divergence.replay_hash,
    divergence.compared_against,
    divergence.analyzed_at,
  );

  db.prepare(`
    INSERT INTO replay_divergence_history (
      id,
      replay_hash,
      compared_against,
      divergence_detected,
      mismatch_count,
      mismatch_categories_json,
      mismatch_details_json,
      integrity_status,
      confidence_delta,
      analyzed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      replay_hash=excluded.replay_hash,
      compared_against=excluded.compared_against,
      divergence_detected=excluded.divergence_detected,
      mismatch_count=excluded.mismatch_count,
      mismatch_categories_json=excluded.mismatch_categories_json,
      mismatch_details_json=excluded.mismatch_details_json,
      integrity_status=excluded.integrity_status,
      confidence_delta=excluded.confidence_delta,
      analyzed_at=excluded.analyzed_at
  `).run(
    id,
    divergence.replay_hash,
    divergence.compared_against,
    divergence.divergence_detected ? 1 : 0,
    divergence.mismatch_count,
    divergence.mismatch_categories_json,
    divergence.mismatch_details_json,
    divergence.integrity_status,
    divergence.confidence_delta,
    divergence.analyzed_at,
  );

  return getReplayDivergenceHistoryById(id) as ReplayDivergenceHistoryRecord;
}

export function getLatestReplayDivergenceHistory(
  replayHash: string,
): ReplayDivergenceHistoryRecord | null {
  const row = getPipelineDb().prepare(`
    SELECT
      id,
      replay_hash,
      compared_against,
      divergence_detected,
      mismatch_count,
      mismatch_categories_json,
      mismatch_details_json,
      integrity_status,
      confidence_delta,
      analyzed_at
    FROM replay_divergence_history
    WHERE replay_hash = ?
    ORDER BY analyzed_at DESC, id ASC
    LIMIT 1
  `).get(replayHash);

  return row ? deserializeReplayDivergenceHistory(row) : null;
}

export function listReplayDivergenceHistory(
  replayHash: string,
): ReplayDivergenceHistoryRecord[] {
  const rows = getPipelineDb().prepare(`
    SELECT
      id,
      replay_hash,
      compared_against,
      divergence_detected,
      mismatch_count,
      mismatch_categories_json,
      mismatch_details_json,
      integrity_status,
      confidence_delta,
      analyzed_at
    FROM replay_divergence_history
    WHERE replay_hash = ?
    ORDER BY analyzed_at DESC, id ASC
  `).all(replayHash);

  return rows.map(deserializeReplayDivergenceHistory);
}

function getReplayDivergenceHistoryById(id: string): ReplayDivergenceHistoryRecord | null {
  const row = getPipelineDb().prepare(`
    SELECT
      id,
      replay_hash,
      compared_against,
      divergence_detected,
      mismatch_count,
      mismatch_categories_json,
      mismatch_details_json,
      integrity_status,
      confidence_delta,
      analyzed_at
    FROM replay_divergence_history
    WHERE id = ?
    LIMIT 1
  `).get(id);

  return row ? deserializeReplayDivergenceHistory(row) : null;
}

function deserializeReplayDivergenceHistory(row: any): ReplayDivergenceHistoryRecord {
  return {
    ...row,
    divergence_detected: row.divergence_detected === 1,
  };
}
export interface ReplayArchiveManifestRow {
  id: number;
  archive_id: string;
  game_id: string;

  created_at: string;

  forensic_version: number;

  snapshot_hash: string;
  bundle_hash: string;

  export_hash: string;
  timeline_hash: string;
  signal_hash: string;
  settlement_hash: string;
  provenance_hash: string;

  compression: string;
  bundle_size_bytes: number;

  replay_count: number;

  verification_status: string;
  retention_class: string;

  parent_archive_id: string | null;
  root_archive_id: string | null;

  revision_number: number;

  tags_json: string;
}

export interface ReplayArchiveSnapshotRow {
  id: number;
  archive_id: string;

  forensic_metadata_json: string;
  forensic_payload_json: string;
  generated_report_json: string;

  canonical_hash: string;

  created_at: string;
}

export interface ReplayArchiveVerificationRow {
  id: number;

  archive_id: string;

  verified_at: string;

  verification_hash: string;

  verification_status: string;

  mismatch_count: number;

  details_json: string;
}
function buildReplayDivergenceHistoryId(
  replayHash: string,
  comparedAgainst: string | null,
  analyzedAt: string,
): string {
  return `${replayHash}|${comparedAgainst ?? "none"}|${analyzedAt}`;
}

export function upsertReplayIntelligenceSnapshot(
  snapshot: ReplayIntelligenceSnapshotContract,
): ReplayIntelligenceSnapshotRow {
  const db = getPipelineDb();
  const payloadJson = stableStoreJsonStringify(snapshot);

  db.prepare(`
    INSERT INTO replay_intelligence_snapshots (
      snapshot_id,
      snapshot_kind,
      scope,
      scope_id,
      generated_at,
      deterministic_hash,
      report_version,
      payload_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(snapshot_id) DO UPDATE SET
      snapshot_kind=excluded.snapshot_kind,
      scope=excluded.scope,
      scope_id=excluded.scope_id,
      generated_at=excluded.generated_at,
      deterministic_hash=excluded.deterministic_hash,
      report_version=excluded.report_version,
      payload_json=excluded.payload_json
  `).run(
    snapshot.snapshot_id,
    snapshot.snapshot_kind,
    snapshot.scope,
    snapshot.scope_id,
    snapshot.generated_at,
    snapshot.deterministic_hash,
    snapshot.report_version,
    payloadJson,
  );

  return getReplayIntelligenceSnapshot(snapshot.snapshot_id) as ReplayIntelligenceSnapshotRow;
}

export function getReplayIntelligenceSnapshot(
  snapshotId: string,
): ReplayIntelligenceSnapshotRow | null {
  const row = getPipelineDb().prepare(`
    SELECT
      snapshot_id,
      snapshot_kind,
      scope,
      scope_id,
      generated_at,
      deterministic_hash,
      report_version,
      payload_json
    FROM replay_intelligence_snapshots
    WHERE snapshot_id = ?
    LIMIT 1
  `).get(snapshotId);

  return row ? deserializeReplayIntelligenceSnapshot(row) : null;
}

export function listReplayIntelligenceSnapshots(
  scope: string,
  scopeId: string,
): ReplayIntelligenceSnapshotRow[] {
  const rows = getPipelineDb().prepare(`
    SELECT
      snapshot_id,
      snapshot_kind,
      scope,
      scope_id,
      generated_at,
      deterministic_hash,
      report_version,
      payload_json
    FROM replay_intelligence_snapshots
    WHERE scope = ? AND scope_id = ?
    ORDER BY generated_at DESC, snapshot_id ASC
  `).all(scope, scopeId);

  return rows.map(deserializeReplayIntelligenceSnapshot);
}

export function upsertReplayForensicIntelligenceRecord(
  record: ReplayForensicIntelligenceRecordContract,
): ReplayForensicIntelligenceRecordRow {
  const db = getPipelineDb();
  const detailsJson = stableStoreJsonStringify(record.details);

  db.prepare(`
    INSERT INTO replay_forensic_intelligence_records (
      record_id,
      snapshot_id,
      archive_id,
      replay_hash,
      game_id,
      metric_name,
      metric_value,
      severity,
      category,
      observed_at,
      deterministic_hash,
      details_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(record_id) DO UPDATE SET
      snapshot_id=excluded.snapshot_id,
      archive_id=excluded.archive_id,
      replay_hash=excluded.replay_hash,
      game_id=excluded.game_id,
      metric_name=excluded.metric_name,
      metric_value=excluded.metric_value,
      severity=excluded.severity,
      category=excluded.category,
      observed_at=excluded.observed_at,
      deterministic_hash=excluded.deterministic_hash,
      details_json=excluded.details_json
  `).run(
    record.record_id,
    record.snapshot_id,
    record.archive_id,
    record.replay_hash,
    record.game_id,
    record.metric_name,
    record.metric_value,
    record.severity,
    record.category,
    record.observed_at,
    record.deterministic_hash,
    detailsJson,
  );

  return getReplayForensicIntelligenceRecord(record.record_id) as ReplayForensicIntelligenceRecordRow;
}

export function getReplayForensicIntelligenceRecord(
  recordId: string,
): ReplayForensicIntelligenceRecordRow | null {
  const row = getPipelineDb().prepare(`
    SELECT
      record_id,
      snapshot_id,
      archive_id,
      replay_hash,
      game_id,
      metric_name,
      metric_value,
      severity,
      category,
      observed_at,
      deterministic_hash,
      details_json
    FROM replay_forensic_intelligence_records
    WHERE record_id = ?
    LIMIT 1
  `).get(recordId);

  return row ? deserializeReplayForensicIntelligenceRecord(row) : null;
}

export function listReplayForensicIntelligenceBySnapshot(
  snapshotId: string,
): ReplayForensicIntelligenceRecordRow[] {
  const rows = getPipelineDb().prepare(`
    SELECT
      record_id,
      snapshot_id,
      archive_id,
      replay_hash,
      game_id,
      metric_name,
      metric_value,
      severity,
      category,
      observed_at,
      deterministic_hash,
      details_json
    FROM replay_forensic_intelligence_records
    WHERE snapshot_id = ?
    ORDER BY observed_at DESC, record_id ASC
  `).all(snapshotId);

  return rows.map(deserializeReplayForensicIntelligenceRecord);
}

export function listReplayForensicIntelligenceByArchive(
  archiveId: string,
): ReplayForensicIntelligenceRecordRow[] {
  const rows = getPipelineDb().prepare(`
    SELECT
      record_id,
      snapshot_id,
      archive_id,
      replay_hash,
      game_id,
      metric_name,
      metric_value,
      severity,
      category,
      observed_at,
      deterministic_hash,
      details_json
    FROM replay_forensic_intelligence_records
    WHERE archive_id = ?
    ORDER BY observed_at DESC, record_id ASC
  `).all(archiveId);

  return rows.map(deserializeReplayForensicIntelligenceRecord);
}

export function listReplayForensicIntelligenceByReplayHash(
  replayHash: string,
): ReplayForensicIntelligenceRecordRow[] {
  const rows = getPipelineDb().prepare(`
    SELECT
      record_id,
      snapshot_id,
      archive_id,
      replay_hash,
      game_id,
      metric_name,
      metric_value,
      severity,
      category,
      observed_at,
      deterministic_hash,
      details_json
    FROM replay_forensic_intelligence_records
    WHERE replay_hash = ?
    ORDER BY observed_at DESC, record_id ASC
  `).all(replayHash);

  return rows.map(deserializeReplayForensicIntelligenceRecord);
}

export function upsertReplayEvolutionMetric(
  metric: ReplayEvolutionMetricContract,
): ReplayEvolutionMetricRow {
  const db = getPipelineDb();

  db.prepare(`
    INSERT INTO replay_evolution_metrics (
      metric_id,
      snapshot_id,
      archive_id,
      game_id,
      replay_hash,
      score,
      band,
      drift_count,
      mutation_count,
      lineage_depth,
      critical_mismatch_count,
      computed_at,
      deterministic_hash
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(metric_id) DO UPDATE SET
      snapshot_id=excluded.snapshot_id,
      archive_id=excluded.archive_id,
      game_id=excluded.game_id,
      replay_hash=excluded.replay_hash,
      score=excluded.score,
      band=excluded.band,
      drift_count=excluded.drift_count,
      mutation_count=excluded.mutation_count,
      lineage_depth=excluded.lineage_depth,
      critical_mismatch_count=excluded.critical_mismatch_count,
      computed_at=excluded.computed_at,
      deterministic_hash=excluded.deterministic_hash
  `).run(
    metric.metric_id,
    metric.snapshot_id,
    metric.archive_id,
    metric.game_id,
    metric.replay_hash,
    metric.score,
    metric.band,
    metric.drift_count,
    metric.mutation_count,
    metric.lineage_depth,
    metric.critical_mismatch_count,
    metric.computed_at,
    metric.deterministic_hash,
  );

  return getReplayEvolutionMetric(metric.metric_id) as ReplayEvolutionMetricRow;
}

export function getReplayEvolutionMetric(
  metricId: string,
): ReplayEvolutionMetricRow | null {
  return (getPipelineDb().prepare(`
    SELECT
      metric_id,
      snapshot_id,
      archive_id,
      game_id,
      replay_hash,
      score,
      band,
      drift_count,
      mutation_count,
      lineage_depth,
      critical_mismatch_count,
      computed_at,
      deterministic_hash
    FROM replay_evolution_metrics
    WHERE metric_id = ?
    LIMIT 1
  `).get(metricId) as ReplayEvolutionMetricRow | undefined) ?? null;
}

export function getLatestReplayEvolutionMetricByArchive(
  archiveId: string,
): ReplayEvolutionMetricRow | null {
  return (getPipelineDb().prepare(`
    SELECT
      metric_id,
      snapshot_id,
      archive_id,
      game_id,
      replay_hash,
      score,
      band,
      drift_count,
      mutation_count,
      lineage_depth,
      critical_mismatch_count,
      computed_at,
      deterministic_hash
    FROM replay_evolution_metrics
    WHERE archive_id = ?
    ORDER BY computed_at DESC, metric_id ASC
    LIMIT 1
  `).get(archiveId) as ReplayEvolutionMetricRow | undefined) ?? null;
}

export function listReplayEvolutionMetricsByGame(
  gameId: string,
): ReplayEvolutionMetricRow[] {
  return getPipelineDb().prepare(`
    SELECT
      metric_id,
      snapshot_id,
      archive_id,
      game_id,
      replay_hash,
      score,
      band,
      drift_count,
      mutation_count,
      lineage_depth,
      critical_mismatch_count,
      computed_at,
      deterministic_hash
    FROM replay_evolution_metrics
    WHERE game_id = ?
    ORDER BY score DESC, archive_id ASC, metric_id ASC
  `).all(gameId) as ReplayEvolutionMetricRow[];
}

export function upsertReplayLineageIntelligenceMetric(
  metric: ReplayLineageIntelligenceMetricContract,
): ReplayLineageIntelligenceMetricRow {
  const db = getPipelineDb();
  const detailsJson = stableStoreJsonStringify(metric.details);

  db.prepare(`
    INSERT INTO replay_lineage_intelligence_metrics (
      metric_id,
      snapshot_id,
      root_archive_id,
      archive_id,
      max_depth,
      average_depth,
      root_archive_count,
      leaf_archive_count,
      cycle_detected,
      complete,
      computed_at,
      deterministic_hash,
      details_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(metric_id) DO UPDATE SET
      snapshot_id=excluded.snapshot_id,
      root_archive_id=excluded.root_archive_id,
      archive_id=excluded.archive_id,
      max_depth=excluded.max_depth,
      average_depth=excluded.average_depth,
      root_archive_count=excluded.root_archive_count,
      leaf_archive_count=excluded.leaf_archive_count,
      cycle_detected=excluded.cycle_detected,
      complete=excluded.complete,
      computed_at=excluded.computed_at,
      deterministic_hash=excluded.deterministic_hash,
      details_json=excluded.details_json
  `).run(
    metric.metric_id,
    metric.snapshot_id,
    metric.root_archive_id,
    metric.archive_id,
    metric.max_depth,
    metric.average_depth,
    metric.root_archive_count,
    metric.leaf_archive_count,
    metric.cycle_detected ? 1 : 0,
    metric.complete ? 1 : 0,
    metric.computed_at,
    metric.deterministic_hash,
    detailsJson,
  );

  return getReplayLineageIntelligenceMetric(metric.metric_id) as ReplayLineageIntelligenceMetricRow;
}

export function getReplayLineageIntelligenceMetric(
  metricId: string,
): ReplayLineageIntelligenceMetricRow | null {
  const row = getPipelineDb().prepare(`
    SELECT
      metric_id,
      snapshot_id,
      root_archive_id,
      archive_id,
      max_depth,
      average_depth,
      root_archive_count,
      leaf_archive_count,
      cycle_detected,
      complete,
      computed_at,
      deterministic_hash,
      details_json
    FROM replay_lineage_intelligence_metrics
    WHERE metric_id = ?
    LIMIT 1
  `).get(metricId);

  return row ? deserializeReplayLineageIntelligenceMetric(row) : null;
}

export function listReplayLineageIntelligenceByRootArchive(
  rootArchiveId: string,
): ReplayLineageIntelligenceMetricRow[] {
  const rows = getPipelineDb().prepare(`
    SELECT
      metric_id,
      snapshot_id,
      root_archive_id,
      archive_id,
      max_depth,
      average_depth,
      root_archive_count,
      leaf_archive_count,
      cycle_detected,
      complete,
      computed_at,
      deterministic_hash,
      details_json
    FROM replay_lineage_intelligence_metrics
    WHERE root_archive_id = ?
    ORDER BY computed_at DESC, metric_id ASC
  `).all(rootArchiveId);

  return rows.map(deserializeReplayLineageIntelligenceMetric);
}

export function getLatestReplayLineageIntelligenceByArchive(
  archiveId: string,
): ReplayLineageIntelligenceMetricRow | null {
  const row = getPipelineDb().prepare(`
    SELECT
      metric_id,
      snapshot_id,
      root_archive_id,
      archive_id,
      max_depth,
      average_depth,
      root_archive_count,
      leaf_archive_count,
      cycle_detected,
      complete,
      computed_at,
      deterministic_hash,
      details_json
    FROM replay_lineage_intelligence_metrics
    WHERE archive_id = ?
    ORDER BY computed_at DESC, metric_id ASC
    LIMIT 1
  `).get(archiveId);

  return row ? deserializeReplayLineageIntelligenceMetric(row) : null;
}

export function upsertReplayAuditAnalytics(
  analytics: ReplayAuditAnalyticsContract,
): ReplayAuditAnalyticsRow {
  const db = getPipelineDb();
  const detailsJson = stableStoreJsonStringify(analytics.details);

  db.prepare(`
    INSERT INTO replay_audit_analytics (
      analytics_id,
      snapshot_id,
      scope,
      scope_id,
      window,
      window_start,
      window_end,
      archive_count,
      replay_count,
      verified_count,
      failed_count,
      diverged_count,
      mutation_count,
      drift_count,
      critical_mismatch_count,
      computed_at,
      deterministic_hash,
      details_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(analytics_id) DO UPDATE SET
      snapshot_id=excluded.snapshot_id,
      scope=excluded.scope,
      scope_id=excluded.scope_id,
      window=excluded.window,
      window_start=excluded.window_start,
      window_end=excluded.window_end,
      archive_count=excluded.archive_count,
      replay_count=excluded.replay_count,
      verified_count=excluded.verified_count,
      failed_count=excluded.failed_count,
      diverged_count=excluded.diverged_count,
      mutation_count=excluded.mutation_count,
      drift_count=excluded.drift_count,
      critical_mismatch_count=excluded.critical_mismatch_count,
      computed_at=excluded.computed_at,
      deterministic_hash=excluded.deterministic_hash,
      details_json=excluded.details_json
  `).run(
    analytics.analytics_id,
    analytics.snapshot_id,
    analytics.scope,
    analytics.scope_id,
    analytics.window,
    analytics.window_start,
    analytics.window_end,
    analytics.archive_count,
    analytics.replay_count,
    analytics.verified_count,
    analytics.failed_count,
    analytics.diverged_count,
    analytics.mutation_count,
    analytics.drift_count,
    analytics.critical_mismatch_count,
    analytics.computed_at,
    analytics.deterministic_hash,
    detailsJson,
  );

  return getReplayAuditAnalytics(analytics.analytics_id) as ReplayAuditAnalyticsRow;
}

export function getReplayAuditAnalytics(
  analyticsId: string,
): ReplayAuditAnalyticsRow | null {
  const row = getPipelineDb().prepare(`
    SELECT
      analytics_id,
      snapshot_id,
      scope,
      scope_id,
      window,
      window_start,
      window_end,
      archive_count,
      replay_count,
      verified_count,
      failed_count,
      diverged_count,
      mutation_count,
      drift_count,
      critical_mismatch_count,
      computed_at,
      deterministic_hash,
      details_json
    FROM replay_audit_analytics
    WHERE analytics_id = ?
    LIMIT 1
  `).get(analyticsId);

  return row ? deserializeReplayAuditAnalytics(row) : null;
}

export function listReplayAuditAnalytics(
  scope: string,
  scopeId: string,
): ReplayAuditAnalyticsRow[] {
  const rows = getPipelineDb().prepare(`
    SELECT
      analytics_id,
      snapshot_id,
      scope,
      scope_id,
      window,
      window_start,
      window_end,
      archive_count,
      replay_count,
      verified_count,
      failed_count,
      diverged_count,
      mutation_count,
      drift_count,
      critical_mismatch_count,
      computed_at,
      deterministic_hash,
      details_json
    FROM replay_audit_analytics
    WHERE scope = ? AND scope_id = ?
    ORDER BY computed_at DESC, analytics_id ASC
  `).all(scope, scopeId);

  return rows.map(deserializeReplayAuditAnalytics);
}

export function listReplayAuditAnalyticsBySnapshot(
  snapshotId: string,
): ReplayAuditAnalyticsRow[] {
  const rows = getPipelineDb().prepare(`
    SELECT
      analytics_id,
      snapshot_id,
      scope,
      scope_id,
      window,
      window_start,
      window_end,
      archive_count,
      replay_count,
      verified_count,
      failed_count,
      diverged_count,
      mutation_count,
      drift_count,
      critical_mismatch_count,
      computed_at,
      deterministic_hash,
      details_json
    FROM replay_audit_analytics
    WHERE snapshot_id = ?
    ORDER BY computed_at DESC, analytics_id ASC
  `).all(snapshotId);

  return rows.map(deserializeReplayAuditAnalytics);
}

function deserializeReplayIntelligenceSnapshot(row: any): ReplayIntelligenceSnapshotRow {
  const payload = parseReplayStoreJson(row.payload_json) as ReplayIntelligenceSnapshotContract;

  return {
    ...payload,
    snapshot_id: row.snapshot_id,
    snapshot_kind: row.snapshot_kind,
    scope: row.scope,
    scope_id: row.scope_id,
    generated_at: row.generated_at,
    deterministic_hash: row.deterministic_hash,
    report_version: row.report_version,
    payload_json: row.payload_json,
  };
}

function deserializeReplayForensicIntelligenceRecord(row: any): ReplayForensicIntelligenceRecordRow {
  return {
    ...row,
    details: parseReplayStoreJson(row.details_json),
  };
}

function deserializeReplayLineageIntelligenceMetric(row: any): ReplayLineageIntelligenceMetricRow {
  return {
    ...row,
    cycle_detected: row.cycle_detected === 1,
    complete: row.complete === 1,
    details: parseReplayStoreJson(row.details_json),
  };
}

function deserializeReplayAuditAnalytics(row: any): ReplayAuditAnalyticsRow {
  return {
    ...row,
    details: parseReplayStoreJson(row.details_json),
  };
}

function stableStoreJsonStringify(value: unknown): string {
  return JSON.stringify(sortReplayStoreJson(value));
}

function sortReplayStoreJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortReplayStoreJson);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortReplayStoreJson((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return value;
}

function parseReplayStoreJson(value: string): any {
  return JSON.parse(value);
}
export function insertOddsSnapshot(data: {
  game_id: string;
  league: string;
  sportsbook: string;
  spread_line: number | null;
  spread_team: string | null;
  total_line: number | null;
  moneyline_home: number | null;
  moneyline_away: number | null;
  source_game_id: string | null;
  snapshot_at?: string;
}): void {
  const db = getPipelineDb();
  const ts = data.snapshot_at ?? new Date().toISOString();

  db.prepare(`
    INSERT INTO odds_snapshots (
      id,
      game_id,
      league,
      sportsbook,
      market_source,
      spread_line,
      spread_team,
      total_line,
      moneyline_home,
      moneyline_away,
      source_game_id,
      snapshot_at,
      created_at
    )
    VALUES (?, ?, ?, ?, 'the_odds_api', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    data.game_id,
    data.league,
    data.sportsbook,
    data.spread_line,
    data.spread_team,
    data.total_line,
    data.moneyline_home,
    data.moneyline_away,
    data.source_game_id,
    ts,
    ts,
  );
}
export function upsertGame(g: Omit<Game, "created_at" | "updated_at"> & Partial<Pick<Game, "created_at" | "updated_at">>): Game {
  const db = getPipelineDb();
  const now = new Date().toISOString();
  const game: Game = { ...g, created_at: g.created_at ?? now, updated_at: now } as Game;
  db.prepare(`
    INSERT INTO games (id,league,home_team,away_team,game_time,status,
      spread_line,spread_team,total_line,moneyline_home,moneyline_away,
      open_spread,open_total,source_game_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      status=CASE WHEN status='final' THEN 'final' ELSE excluded.status END,
      spread_line=excluded.spread_line,
      spread_team=excluded.spread_team,
      total_line=excluded.total_line,
      moneyline_home=excluded.moneyline_home,
      moneyline_away=excluded.moneyline_away,
      updated_at=excluded.updated_at
  `).run(
    game.id, game.league, game.home_team, game.away_team, game.game_time,
    game.status, game.spread_line, game.spread_team, game.total_line,
    game.moneyline_home, game.moneyline_away, game.open_spread, game.open_total,
    game.source_game_id, game.created_at, game.updated_at,
  );
  return game;
}

/**
 * Insert or update a historical game that already has a final score.
 * Unlike upsertGame, this also persists home_score/away_score and status on conflict.
 */
export function upsertHistoricalGame(g: Omit<Game, "created_at" | "updated_at">): Game {
  const db = getPipelineDb();
  const now = new Date().toISOString();
  const game: Game = { ...g, created_at: now, updated_at: now };
  db.prepare(`
    INSERT INTO games (id,league,home_team,away_team,game_time,status,
      spread_line,spread_team,total_line,moneyline_home,moneyline_away,
      open_spread,open_total,home_score,away_score,source_game_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      status=excluded.status,
      home_score=excluded.home_score,
      away_score=excluded.away_score,
      spread_line=COALESCE(excluded.spread_line, spread_line),
      updated_at=excluded.updated_at
  `).run(
    game.id, game.league, game.home_team, game.away_team, game.game_time,
    game.status, game.spread_line, game.spread_team, game.total_line,
    game.moneyline_home, game.moneyline_away, game.open_spread, game.open_total,
    game.home_score, game.away_score, game.source_game_id,
    game.created_at, game.updated_at,
  );
  return game;
}

export function getGames(league?: string): Game[] {
  const db = getPipelineDb();
  const rows = league
    ? db.prepare("SELECT * FROM games WHERE league=? ORDER BY game_time ASC").all(league)
    : db.prepare("SELECT * FROM games ORDER BY game_time ASC").all();
  return rows as Game[];
}

export function getGame(id: string): Game | null {
  const db = getPipelineDb();
  return (db.prepare("SELECT * FROM games WHERE id=?").get(id) as Game) ?? null;
}

/** Mark a game as final and store the actual scores. */
export function updateGameFinal(id: string, homeScore: number, awayScore: number): void {
  getPipelineDb()
    .prepare("UPDATE games SET status='final', home_score=?, away_score=?, updated_at=? WHERE id=?")
    .run(homeScore, awayScore, new Date().toISOString(), id);
}

/** All betting_relevance signals for a game that have not yet been settled. */
export function getUnsettledSignalsForGame(gameId: string): any[] {
  return getPipelineDb()
    .prepare("SELECT * FROM live_signals WHERE game_id=? AND betting_relevance=1 AND outcome_id IS NULL")
    .all(gameId) as any[];
}

/** Write the outcome FK back onto the signal row. */
export function linkOutcomeToSignal(signalId: string, outcomeId: string): void {
  getPipelineDb()
    .prepare("UPDATE live_signals SET outcome_id=? WHERE id=?")
    .run(outcomeId, signalId);
}

/** All games that have final scores but still have unsettled signals (game_id-linked). */
export function getSettleable(): any[] {
  return getPipelineDb().prepare(`
    SELECT DISTINCT g.id, g.league, g.home_team, g.away_team,
           g.spread_line, g.spread_team, g.total_line,
           g.home_score, g.away_score, g.game_time
    FROM games g
    JOIN live_signals s ON s.game_id = g.id
    WHERE g.home_score IS NOT NULL
      AND g.away_score IS NOT NULL
      AND s.betting_relevance = 1
      AND s.outcome_id IS NULL
  `).all();
}

/**
 * Signals with no game_id that are still betting-relevant and unsettled.
 * These are settled by matching team + next final game after signal creation.
 */
export function getUnsettledSignalsWithoutGameId(): any[] {
  return getPipelineDb().prepare(`
    SELECT * FROM live_signals
    WHERE game_id IS NULL
      AND betting_relevance = 1
      AND outcome_id IS NULL
      AND team IS NOT NULL
    ORDER BY created_at ASC
    LIMIT 500
  `).all();
}

/**
 * Find the first final game for a team (home or away) after a given timestamp.
 * Uses broad LIKE matching to handle abbreviation format differences.
 */
export function findNextFinalGameForTeam(
  league: string,
  team: string,
  afterTimestamp: string,
): any | null {
  const db = getPipelineDb();
  const t = team.toUpperCase();
  return db.prepare(`
    SELECT * FROM games
    WHERE league = ?
      AND status = 'final'
      AND home_score IS NOT NULL
      AND away_score IS NOT NULL
      AND game_time > ?
      AND (
        UPPER(home_team) = ? OR UPPER(away_team) = ?
        OR UPPER(home_team) LIKE ? OR UPPER(away_team) LIKE ?
      )
    ORDER BY game_time ASC
    LIMIT 1
  `).get(league, afterTimestamp, t, t, `%${t}%`, `%${t}%`) ?? null;
}

/**
 * Look up a game by team abbreviations + date.
 * Used by ESPN adapters to resolve scores to our canonical game_id,
 * since ESPN and The Odds API use different internal IDs.
 */
export function findGameByTeams(
  league: string,
  homeTeam: string,
  awayTeam: string,
  gameDate: string, // YYYY-MM-DD
): Game | null {
  const db = getPipelineDb();
  return (db.prepare(`
    SELECT * FROM games
    WHERE league = ?
      AND home_team = ? AND away_team = ?
      AND date(game_time) = date(?)
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(league, homeTeam, awayTeam, gameDate) as Game) ?? null;
}

/** Games past their game_time that are not yet marked final (candidates for score lookup). */
export function getCompletedUnfinalGames(hoursAfterGameTime = 4): any[] {
  const cutoff = new Date(Date.now() - hoursAfterGameTime * 60 * 60 * 1000).toISOString();
  return getPipelineDb().prepare(`
    SELECT * FROM games
    WHERE game_time < ?
      AND status != 'final'
      AND status != 'postponed'
    ORDER BY game_time DESC
    LIMIT 100
  `).all(cutoff);
}

/* ─── RawEvent CRUD ─────────────────────────────────────── */

export function insertRawEvent(
  e: Omit<RawEvent, "id" | "created_at" | "received_at" | "processed" | "processed_at">,
  opts?: { eventTime?: string },  // override timestamps for historical backfill
): RawEvent {
  const db = getPipelineDb();
  const now = opts?.eventTime ?? new Date().toISOString();
  const raw: RawEvent = {
    id: randomUUID(),
    ...e,
    payload: e.payload,
    processed: false,
    processed_at: null,
    created_at: now,
    received_at: now,
  };
  db.prepare(`
    INSERT INTO raw_events (id,source_id,source_type,league,game_id,team,player,
      event_type,payload,processed,processed_at,created_at,received_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    raw.id, raw.source_id, raw.source_type, raw.league, raw.game_id,
    raw.team, raw.player, raw.event_type,
    JSON.stringify(raw.payload),
    raw.processed ? 1 : 0, raw.processed_at, raw.created_at, raw.received_at,
  );
  return raw;
}

export function getUnprocessedRawEvents(limit = 500): RawEvent[] {
  const db = getPipelineDb();
  // League-balanced fetch: cap each league at floor(limit/4) rows so a single
  // league with a large backlog (e.g. NFL) cannot starve all others each cycle.
  const perLeague = Math.max(1, Math.floor(limit / 4));
  const rows = db.prepare(`
    WITH ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY league ORDER BY received_at ASC) AS rn
      FROM raw_events
      WHERE processed = 0
    )
    SELECT * FROM ranked WHERE rn <= ? ORDER BY received_at ASC LIMIT ?
  `).all(perLeague, limit);
  return rows.map(deserializeRawEvent);
}

export function markRawEventProcessed(id: string) {
  const db = getPipelineDb();
  db.prepare("UPDATE raw_events SET processed=1, processed_at=? WHERE id=?")
    .run(new Date().toISOString(), id);
}

export function getRawEvents(opts: { league?: string; processed?: boolean; limit?: number } = {}): RawEvent[] {
  const db = getPipelineDb();
  const conds: string[] = [];
  const params: unknown[] = [];
  if (opts.league) { conds.push("league=?"); params.push(opts.league); }
  if (opts.processed !== undefined) { conds.push("processed=?"); params.push(opts.processed ? 1 : 0); }
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
  const limit = opts.limit ?? 200;
  const rows = db.prepare(`SELECT * FROM raw_events ${where} ORDER BY received_at DESC LIMIT ?`).all(...params, limit);
  return rows.map(deserializeRawEvent);
}

function deserializeRawEvent(row: any): RawEvent {
  return {
    ...row,
    payload: JSON.parse(row.payload ?? "{}"),
    processed: row.processed === 1,
  };
}

/* ─── LiveSignal CRUD ───────────────────────────────────── */
export type SignalLifecycleState =
  | "CREATED"
  | "PUBLISHED"
  | "UPDATED"
  | "MOVED"
  | "SETTLED_WIN"
  | "SETTLED_LOSS"
  | "VOID"
  | "EXPIRED";

export interface SignalHistoryRow {
  id: string;
  signal_id: string;
  previous_state: SignalLifecycleState | null;
  new_state: SignalLifecycleState;
  reason: string | null;
  metadata: string | null;
  created_at: string;
}

export function recordSignalStateChange(data: {
  signal_id: string;
  previous_state?: SignalLifecycleState | null;
  new_state: SignalLifecycleState;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}): void {
  const db = getPipelineDb();
  const ts = new Date().toISOString();

  db.prepare(`
    INSERT INTO signal_state_history (
      id, signal_id, previous_state, new_state, reason, metadata, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    data.signal_id,
    data.previous_state ?? null,
    data.new_state,
    data.reason ?? null,
    JSON.stringify(data.metadata ?? {}),
    ts,
  );
}

export function getSignalHistory(
  signalId: string,
  beforeTime?: string,
): SignalHistoryRow[] {
  const db = getPipelineDb();

  if (beforeTime) {
    return db.prepare(`
      SELECT *
      FROM signal_state_history
      WHERE signal_id = ?
        AND created_at <= ?
      ORDER BY created_at ASC
    `).all(signalId, beforeTime) as SignalHistoryRow[];
  }

  return db.prepare(`
    SELECT *
    FROM signal_state_history
    WHERE signal_id = ?
    ORDER BY created_at ASC
  `).all(signalId) as SignalHistoryRow[];
}
export function upsertLiveSignal(s: LiveSignal): LiveSignal {
  const db = getPipelineDb();
  db.prepare(`
    INSERT INTO live_signals (
      id,league,game_id,signal_type,headline,body,action_note,why_it_matters,
      team,player,matchup,sources,source_count,verdict,confidence,
      confirmation_strength,line_movement,injury_designation,lineup_status,
      weather_note,betting_relevance,fantasy_relevance,score,score_band,
      urgency_label,urgency_reason,trust_label,score_explanation,breakdown,
      raw_event_ids,signal_time,first_seen_at,created_at,updated_at,outcome_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      score=excluded.score,
      score_band=excluded.score_band,
      urgency_label=excluded.urgency_label,
      urgency_reason=excluded.urgency_reason,
      trust_label=excluded.trust_label,
      score_explanation=excluded.score_explanation,
      breakdown=excluded.breakdown,
      headline=excluded.headline,
      body=excluded.body,
      action_note=excluded.action_note,
      why_it_matters=excluded.why_it_matters,
      line_movement=excluded.line_movement,
      injury_designation=excluded.injury_designation,
      lineup_status=excluded.lineup_status,
      weather_note=excluded.weather_note,
      verdict=excluded.verdict,
      confirmation_strength=excluded.confirmation_strength,
      source_count=live_signals.source_count + excluded.source_count,
      sources=(
        SELECT json_group_array(value)
        FROM (
          SELECT value FROM json_each(live_signals.sources)
          UNION ALL
          SELECT value FROM json_each(excluded.sources)
        )
      ),
      confidence=MIN(92.0, excluded.confidence + (3.0 * live_signals.source_count)),
      raw_event_ids=excluded.raw_event_ids,
      signal_time=excluded.signal_time,
      updated_at=excluded.updated_at
      -- first_seen_at intentionally omitted: keeps the original insertion time
  `).run(
    s.id, s.league, s.game_id, s.signal_type, s.headline, s.body,
    s.action_note, s.why_it_matters, s.team, s.player, s.matchup,
    JSON.stringify(s.sources), s.source_count, s.verdict, s.confidence,
    s.confirmation_strength,
    s.line_movement ? JSON.stringify(s.line_movement) : null,
    s.injury_designation, s.lineup_status, s.weather_note,
    s.betting_relevance ? 1 : 0, s.fantasy_relevance ? 1 : 0,
    s.score, s.score_band, s.urgency_label, s.urgency_reason,
    s.trust_label, s.score_explanation, JSON.stringify(s.breakdown),
    JSON.stringify(s.raw_event_ids), s.signal_time, s.first_seen_at ?? null, s.created_at, s.updated_at,
    s.outcome_id,
  );
  const existing = getLiveSignal(s.id);

if (!existing) {
  recordSignalStateChange({
    signal_id: s.id,
    previous_state: null,
    new_state: "CREATED",
    reason: "Initial signal creation",
    metadata: {
      signal_type: s.signal_type,
      league: s.league,
    },
  });
} else {
  recordSignalStateChange({
    signal_id: s.id,
    previous_state: "CREATED",
    new_state: "UPDATED",
    reason: "Signal updated via ingestion pipeline",
    metadata: {
      signal_type: s.signal_type,
      league: s.league,
    },
  });
}

return s;
}

export function getLiveSignals(opts: {
  league?: string;
  since?: string;       // ISO timestamp
  limit?: number;
  includeArchived?: boolean;
} = {}): LiveSignal[] {
  const db = getPipelineDb();
  const conds: string[] = [];
  const params: unknown[] = [];
  if (!opts.includeArchived) { conds.push("is_archived = 0"); }
  if (opts.league) { conds.push("league=?"); params.push(opts.league); }
  if (opts.since) { conds.push("created_at>=?"); params.push(opts.since); }
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
  const limit = opts.limit ?? 100;
  const rows = db.prepare(
    `SELECT * FROM live_signals ${where} ORDER BY score DESC, created_at DESC LIMIT ?`
  ).all(...params, limit);
  return rows.map(deserializeLiveSignal);
}

export function getLiveSignal(id: string): LiveSignal | null {
  const db = getPipelineDb();
  const row = db.prepare("SELECT * FROM live_signals WHERE id=?").get(id);
  return row ? deserializeLiveSignal(row) : null;
}

export function findExistingSignal(opts: {
  league: string;
  game_id?: string | null;
  team?: string | null;
  player?: string | null;
  signal_type?: string | null;
  since?: string;  // ISO timestamp — only match signals created at or after this time
}): LiveSignal | null {
  if (!opts.player && !opts.signal_type && !opts.team) return null;
  const db = getPipelineDb();
  const conds = ["league=?", "is_archived=0"];
  const params: unknown[] = [opts.league];
  // When game_id is present, scope the match to that game so signals from
  // different games (or different days) never collapse onto the same record.
  if (opts.game_id) { conds.push("game_id=?"); params.push(opts.game_id); }
  if (opts.team) { conds.push("team=?"); params.push(opts.team); }
  if (opts.player) { conds.push("player=?"); params.push(opts.player); }
  if (opts.signal_type) { conds.push("signal_type=?"); params.push(opts.signal_type); }
  if (opts.since) { conds.push("created_at>=?"); params.push(opts.since); }
  const row = db.prepare(
    `SELECT * FROM live_signals WHERE ${conds.join(" AND ")} ORDER BY created_at DESC LIMIT 1`
  ).get(...params);
  return row ? deserializeLiveSignal(row as any) : null;
}

function deserializeLiveSignal(row: any): LiveSignal {
  return {
    ...row,
    sources: JSON.parse(row.sources ?? "[]"),
    line_movement: row.line_movement ? JSON.parse(row.line_movement) : null,
    breakdown: JSON.parse(row.breakdown ?? "{}"),
    raw_event_ids: JSON.parse(row.raw_event_ids ?? "[]"),
    betting_relevance: row.betting_relevance === 1,
    fantasy_relevance: row.fantasy_relevance === 1,
  };
}

/* ─── Outcome CRUD ──────────────────────────────────────── */
export interface OddsSnapshotRow {
  id: string;
  game_id: string;
  league: string;
  sportsbook: string;
  market_source: string;
  spread_line: number | null;
  spread_team: string | null;
  total_line: number | null;
  moneyline_home: number | null;
  moneyline_away: number | null;
  source_game_id: string | null;
  snapshot_at: string;
  created_at: string;
}

export function getOpeningSnapshot(gameId: string): OddsSnapshotRow | null {
  const db = getPipelineDb();

  return (db.prepare(`
    SELECT *
    FROM odds_snapshots
    WHERE game_id = ?
    ORDER BY snapshot_at ASC
    LIMIT 1
  `).get(gameId) as OddsSnapshotRow) ?? null;
}

export function getClosingSnapshot(gameId: string): OddsSnapshotRow | null {
  const db = getPipelineDb();

  return (db.prepare(`
    SELECT *
    FROM odds_snapshots
    WHERE game_id = ?
    ORDER BY snapshot_at DESC
    LIMIT 1
  `).get(gameId) as OddsSnapshotRow) ?? null;
}

export function getLatestSnapshotBefore(
  gameId: string,
  beforeTime: string,
): OddsSnapshotRow | null {
  const db = getPipelineDb();

  return (db.prepare(`
    SELECT *
    FROM odds_snapshots
    WHERE game_id = ?
      AND snapshot_at <= ?
    ORDER BY snapshot_at DESC
    LIMIT 1
  `).get(gameId, beforeTime) as OddsSnapshotRow) ?? null;
}

export function getSnapshotHistory(
  gameId: string,
  limit = 200,
  beforeTime?: string,
): OddsSnapshotRow[] {
  const db = getPipelineDb();

  if (beforeTime) {
    return db.prepare(`
      SELECT *
      FROM odds_snapshots
      WHERE game_id = ?
        AND snapshot_at <= ?
      ORDER BY snapshot_at ASC
      LIMIT ?
    `).all(gameId, beforeTime, limit) as OddsSnapshotRow[];
  }

  return db.prepare(`
    SELECT *
    FROM odds_snapshots
    WHERE game_id = ?
    ORDER BY snapshot_at ASC
    LIMIT ?
  `).all(gameId, limit) as OddsSnapshotRow[];
}
export function createOutcome(o: Omit<Outcome, "id" | "created_at">): Outcome {
  const db = getPipelineDb();
  const now = new Date().toISOString();
  const outcome: Outcome = { id: randomUUID(), ...o, created_at: now };
  db.prepare(`
    INSERT INTO outcomes (id,signal_id,game_id,home_score,away_score,market,
      line_at_signal,closing_line,actual_result,hit,clv,recorded_at,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    outcome.id, outcome.signal_id, outcome.game_id,
    outcome.home_score, outcome.away_score, outcome.market,
    outcome.line_at_signal, outcome.closing_line, outcome.actual_result,
    outcome.hit === null ? null : (outcome.hit ? 1 : 0),
    outcome.clv, outcome.recorded_at, outcome.created_at,
  );
  return outcome;
}

export function getOutcome(id: string): Outcome | null {
  const db = getPipelineDb();
  const row = db.prepare("SELECT * FROM outcomes WHERE id=?").get(id) as any;
  if (!row) return null;
  return { ...row, hit: row.hit === null ? null : row.hit === 1 };
}

export function getOutcomes(signal_id?: string): Outcome[] {
  const db = getPipelineDb();
  const rows = signal_id
    ? db.prepare("SELECT * FROM outcomes WHERE signal_id=? ORDER BY created_at DESC").all(signal_id)
    : db.prepare("SELECT * FROM outcomes ORDER BY created_at DESC LIMIT 200").all();
  return (rows as any[]).map(r => ({ ...r, hit: r.hit === null ? null : r.hit === 1 }));
}

/* ─── Backfill progress CRUD ─────────────────────────────── */

export type { BackfillPhase } from "../storage";

export function markBackfillPhase(
  league: string,
  season: string,
  phase: string,
  status: "running" | "done" | "error",
  meta?: { records?: number; error?: string },
): void {
  _markBackfillPhase(league, season, phase, status, meta);
}

export function getBackfillPhase(league: string, season: string, phase: string): BackfillPhase | null {
  return _getBackfillPhase(league, season, phase);
}

export function getAllBackfillProgress(): BackfillPhase[] {
  return _getAllBackfillProgress();
}

export function resetBackfillPhases(league: string): void {
  _resetBackfillPhases(league);
}

/* ─── Calibration weight CRUD ────────────────────────────── */

export interface CalibrationWeight {
  id: string;
  league: string;
  seasons: string[];
  weight_type: string;
  weights: Record<string, number>;
  sample_size: number;
  computed_at: string;
}

export function upsertCalibrationWeights(
  league: string,
  weightType: string,
  weights: Record<string, number>,
  seasons: string[],
  sampleSize: number,
): void {
  const db = getPipelineDb();
  const id = `${weightType}|${league}`;
  db.prepare(`
    INSERT INTO calibration_weights (id,league,seasons,weight_type,weights,sample_size,computed_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      seasons=excluded.seasons,
      weights=excluded.weights,
      sample_size=excluded.sample_size,
      computed_at=excluded.computed_at
  `).run(
    id, league, JSON.stringify(seasons), weightType,
    JSON.stringify(weights), sampleSize, new Date().toISOString(),
  );
}

export function getCalibrationWeights(league: string, weightType: string): CalibrationWeight | null {
  const db = getPipelineDb();
  const id = `${weightType}|${league}`;
  const row = db.prepare("SELECT * FROM calibration_weights WHERE id=?").get(id) as any;
  if (!row) return null;
  return { ...row, seasons: JSON.parse(row.seasons ?? "[]"), weights: JSON.parse(row.weights ?? "{}") };
}

export function getAllCalibrationWeights(): CalibrationWeight[] {
  const db = getPipelineDb();
  const rows = db.prepare("SELECT * FROM calibration_weights ORDER BY computed_at DESC").all() as any[];
  return rows.map(r => ({ ...r, seasons: JSON.parse(r.seasons ?? "[]"), weights: JSON.parse(r.weights ?? "{}") }));
}

/* ─── Track Record aggregates ────────────────────────────── */

export interface TrackRecordSlice {
  signal_type: string | null;   // null → overall
  total_signals: number;
  wins: number;
  losses: number;
  hit_rate: number | null;      // null if no settled outcomes
  avg_clv_points: number | null;
}

export interface TrackRecord {
  league: string;
  window: "all_time";           // may extend to 90d/30d later
  overall: TrackRecordSlice;
  by_signal_type: TrackRecordSlice[];
}

/**
 * Compute aggregate track-record stats for a given league.
 *
 * Join outcomes → live_signals to get league + signal_type per outcome.
 * Ignores outcomes where hit IS NULL (unsettled).
 * Ignores clv_points where clv IS NULL for avg computation.
 * Window: all-time (no date filter).
 */
export function getTrackRecord(league: string): TrackRecord {
  const db = getPipelineDb();

  // Overall aggregate for the league
  const overallRow = db.prepare(`
    SELECT
      COUNT(*)                             AS total_signals,
      SUM(CASE WHEN o.hit = 1 THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN o.hit = 0 THEN 1 ELSE 0 END) AS losses,
      AVG(CASE WHEN o.clv IS NOT NULL THEN o.clv ELSE NULL END) AS avg_clv
    FROM outcomes o
    JOIN live_signals s ON s.id = o.signal_id
    WHERE s.league = ?
      AND o.hit IS NOT NULL
  `).get(league) as any;

  // Per-signal_type breakdown
  const typeRows = db.prepare(`
    SELECT
      s.signal_type,
      COUNT(*)                             AS total_signals,
      SUM(CASE WHEN o.hit = 1 THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN o.hit = 0 THEN 1 ELSE 0 END) AS losses,
      AVG(CASE WHEN o.clv IS NOT NULL THEN o.clv ELSE NULL END) AS avg_clv
    FROM outcomes o
    JOIN live_signals s ON s.id = o.signal_id
    WHERE s.league = ?
      AND o.hit IS NOT NULL
    GROUP BY s.signal_type
    ORDER BY total_signals DESC
  `).all(league) as any[];

  function toSlice(row: any, signal_type: string | null): TrackRecordSlice {
    const total = row.total_signals ?? 0;
    const wins = row.wins ?? 0;
    const losses = row.losses ?? 0;
    return {
      signal_type,
      total_signals: total,
      wins,
      losses,
      hit_rate: total > 0 ? Math.round((wins / total) * 1000) / 1000 : null,
      avg_clv_points: row.avg_clv != null ? Math.round(row.avg_clv * 100) / 100 : null,
    };
  }

  return {
    league,
    window: "all_time",
    overall: toSlice(overallRow, null),
    by_signal_type: typeRows.map(r => toSlice(r, r.signal_type)),
  };
}
