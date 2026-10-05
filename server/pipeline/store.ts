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
import { recomputeUrgency, GAME_COMPLETED_GRACE_MIN } from "./urgency";
import { yieldToLoop } from "../event-loop-monitor";
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
    CREATE INDEX IF NOT EXISTS idx_raw_events_source_received ON raw_events(source_id, received_at);
    CREATE INDEX IF NOT EXISTS idx_raw_events_league_received ON raw_events(league, received_at);
    CREATE INDEX IF NOT EXISTS idx_raw_events_source_player ON raw_events(source_id, player);
    -- getRawEvents/getUnprocessedRawEvents filter by (league, processed) and order
    -- by received_at. After PR #64 added (league, received_at) the planner used it
    -- for {league, processed:false} and walked every MLB row (32s cold-boot freeze);
    -- this covering (league, processed, received_at) index makes that lookup seek-only.
    CREATE INDEX IF NOT EXISTS idx_raw_events_league_processed_received ON raw_events(league, processed, received_at);
    -- espn-nfl.ts dedups an injury by (player, designation, day-of occurred_at). This
    -- partial expression index makes that lookup index-only (was a 23s cold scan).
    CREATE INDEX IF NOT EXISTS idx_raw_events_nfl_injury_key ON raw_events(player, json_extract(payload,'$.designation'), substr(json_extract(payload,'$.occurred_at'),1,10)) WHERE source_id='espn' AND league='NFL' AND event_type='injury_update';
    -- ingestProbablePitchers checks whether a lineup_confirm already exists for a
    -- game/team/pitcher before re-inserting (see lineupConfirmRawEventExists). Partial
    -- index keyed on the combo keeps that an indexed seek over the lineup_confirm rows.
    CREATE INDEX IF NOT EXISTS idx_raw_events_lineup_confirm_combo ON raw_events(game_id, team, player) WHERE event_type='lineup_confirm';

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

    -- Outcome lookup by signal. Without this the per-signal lookup is a full
    -- scan of outcomes, and the situation comparable corpus issues one per
    -- signal id (~1,200-1,500 per /api/v2/situations request): measured on prod
    -- at 13.5ms each, 16-20s of a ~22s cold response, 93-95% of the total.
    -- created_at DESC is in the index so the query's ORDER BY needs no sort.
    -- Name and columns match the index created by hand on prod on 2026-10-04,
    -- so IF NOT EXISTS is a no-op there.
    CREATE INDEX IF NOT EXISTS idx_outcomes_signal_created
      ON outcomes(signal_id, created_at DESC);

    -- Outcome lookup by game. outcomes.game_id had no index either, and
    -- exportReplayParityReport fans out one WHERE game_id = ? lookup per
    -- distinct game_id — so the whole table was scanned once per game, O(n^2).
    -- Covering (game_id, signal_id) serves both that lookup and the DISTINCT
    -- game_id pull that produces the fan-out list, with no temp B-tree for
    -- either. On a 75k-outcome / 8k-game fixture the full report went from
    -- 132s to 126ms; 5,000 outcome inserts cost 100ms with this index against
    -- 95ms without.
    CREATE INDEX IF NOT EXISTS idx_outcomes_game
      ON outcomes(game_id, signal_id);

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

    -- Active-roster gazetteer, refreshed daily from the ESPN roster API.
    -- One row per current athlete per team; a daily refresh replaces the whole
    -- team's rows (see replaceTeamRoster) so cuts/adds/IR moves stay current.
    -- Coaches/GMs are never inserted (fetcher reads only the athletes groups,
    -- not the separate ESPN "coach" key), and former players simply fall out on
    -- the next refresh — satisfying the "exclude ex-players and non-player staff"
    -- requirement at the source.
    CREATE TABLE IF NOT EXISTS roster_players (
      league      TEXT NOT NULL,
      team        TEXT NOT NULL,   -- internal abbr (KC, DAL, …), not ESPN's WSH
      espn_id     TEXT,
      jersey      TEXT,            -- jersey number as ESPN reports it (string, may be "0")
      full_name   TEXT NOT NULL,
      first_name  TEXT,
      last_name   TEXT NOT NULL,
      position    TEXT,
      status      TEXT,            -- roster group: active/injuredReserveOrOut/practiceSquad/…
      updated_at  TEXT NOT NULL,
      PRIMARY KEY (league, team, full_name)
    );
    CREATE INDEX IF NOT EXISTS idx_roster_players_team
      ON roster_players(league, team);

    -- Coaching/front-office staff per team, refreshed alongside the roster.
    -- Used ONLY to exclude staff surnames from the low-confidence last-name tier
    -- of the RSS matcher (e.g. "Campbell" → HC Dan Campbell, not LB Jack
    -- Campbell). Head coach comes from the ESPN roster payload coach key;
    -- coordinators/GMs are supplemented from a small static list.
    CREATE TABLE IF NOT EXISTS roster_staff (
      league      TEXT NOT NULL,
      team        TEXT NOT NULL,
      full_name   TEXT NOT NULL,
      first_name  TEXT,
      last_name   TEXT NOT NULL,
      role        TEXT,            -- HC / OC / DC / GM / …
      updated_at  TEXT NOT NULL,
      PRIMARY KEY (league, team, full_name)
    );
    CREATE INDEX IF NOT EXISTS idx_roster_staff_team
      ON roster_staff(league, team);

    -- Per-league throttle + quota guard for The Odds API (see the-odds-api.ts).
    -- Persisted in SQLite so a Render restart does NOT reset the throttle — the
    -- instance restarts often and an in-memory throttle would let every boot burn
    -- another 3 credits/league. One row per league; last_remaining/last_status
    -- come from the x-requests-remaining header and HTTP status of the last call.
    CREATE TABLE IF NOT EXISTS odds_fetch_state (
      league          TEXT PRIMARY KEY,
      last_success_at TEXT,
      last_attempt_at TEXT,
      last_remaining  INTEGER,
      last_status     INTEGER
    );

    -- Small generic key/value store for one-shot pipeline flags that must survive
    -- a Render restart (e.g. "this one-time migration already finished"), so a
    -- boot-time job can skip an expensive rescan instead of re-running it forever.
    CREATE TABLE IF NOT EXISTS pipeline_meta (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TEXT NOT NULL
    );

  `);

  // Migrate existing DBs that predate home_score/away_score columns on games
  addColumnIfMissing(db, "games", "home_score", "REAL");
  addColumnIfMissing(db, "games", "away_score", "REAL");
  // Migrate live_signals to support archival
  addColumnIfMissing(db, "live_signals", "is_archived", "INTEGER NOT NULL DEFAULT 0");
  // Migrate live_signals to track when the signal was first observed
  addColumnIfMissing(db, "live_signals", "first_seen_at", "TEXT");
  // Roster-gazetteer candidate (separate from the regex-driven `player` column —
  // never overwrites it). *_confidence is the match-strength flag: "full_name"
  // (high) or "last_name" (low, single-surname fallback).
  addColumnIfMissing(db, "raw_events", "player_candidate", "TEXT");
  addColumnIfMissing(db, "raw_events", "player_candidate_confidence", "TEXT");
  // ESPN athlete id for the gazetteer candidate, carried so story cards can render
  // the player headshot. Written alongside player_candidate; never touches `player`.
  addColumnIfMissing(db, "raw_events", "player_candidate_espn_id", "TEXT");
  // Jersey number for the gazetteer candidate, carried alongside the espn_id as a
  // second display passenger for the story-card visual. Never touches `player`.
  addColumnIfMissing(db, "raw_events", "player_candidate_jersey", "TEXT");
  // Jersey number on the roster gazetteer itself (new column on an existing table —
  // pre-jersey DBs read back NULL, which is the correct "no jersey").
  addColumnIfMissing(db, "roster_players", "jersey", "TEXT");

  // Settlement hardening (fix/settlement-stale-matches):
  //   • settlement_expired — a null-game signal that never found a final game
  //     inside its per-league window is parked terminally so it stops being
  //     re-scanned every cycle by getUnsettledSignalsWithoutGameId.
  //   • outcomes.excluded_stale — an outcome whose signal (null game_id) matched
  //     a game far beyond its league window is a bad match; kept for audit but
  //     excluded from every accuracy/calibration query.
  addColumnIfMissing(db, "live_signals", "settlement_expired", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "outcomes", "excluded_stale", "INTEGER NOT NULL DEFAULT 0");

  // alerted_at was created lazily by alerts.ts on every dispatch (PRAGMA +
  // conditional ALTER). It belongs here so the partial index below can be
  // declared in the same place as the column it depends on.
  addColumnIfMissing(db, "live_signals", "alerted_at", "TEXT");

  // Indexes created here (not in the CREATE-TABLE block) because settlement_expired
  // / is_archived are migration columns added just above — indexing them in the
  // schema exec would fail on a fresh DB.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_live_signals_unsettled_nullgame
      ON live_signals(created_at)
      WHERE game_id IS NULL AND outcome_id IS NULL AND betting_relevance=1;
    CREATE INDEX IF NOT EXISTS idx_live_signals_game_outcome
      ON live_signals(game_id, outcome_id);
    -- Drives archiveFinishedMarketSignals: leading (signal_type, is_archived)
    -- narrows to the tiny active-market lane, game_id feeds the finished-game EXISTS.
    CREATE INDEX IF NOT EXISTS idx_live_signals_type_archived_game
      ON live_signals(signal_type, is_archived, game_id);

    -- dispatchSignalAlerts' pending-alert query. It was
    --   SELECT * FROM live_signals
    --   WHERE updated_at >= ? AND score >= 60 AND betting_relevance = 1
    --     AND alerted_at IS NULL ORDER BY score DESC LIMIT 20
    -- with no index it could use: a full scan of every live_signals row, reading
    -- each row's prose and JSON columns off disk, plus a sort. On the Oct 5 boot
    -- that was the single worst span of the cycle — 15,339ms on boot 2 and
    -- 6,163ms on boot 3, both with ZERO signals to dispatch.
    --
    -- updated_at leads deliberately: the cutoff is 20 minutes, so the seek lands
    -- on the handful of rows one cycle touched (21 on the Oct 5 boot) instead of
    -- walking score DESC across the whole table. score is in the index so the
    -- >= 60 filter needs no row fetch, and sorting a handful of rows costs
    -- nothing. Partial on the two constant predicates keeps the index small.
    CREATE INDEX IF NOT EXISTS idx_live_signals_pending_alert
      ON live_signals(updated_at, score DESC)
      WHERE alerted_at IS NULL AND betting_relevance = 1;

    -- ingestNBAInjuries prefetches every NBA injury signal's (player,
    -- designation) pair to dedup the ESPN payload against. With only
    -- idx_live_signals_league(league) available that was an index scan plus one
    -- random main-table read per row — 7,956ms on the Oct 5 boot 3, for a call
    -- that created 0 events. All four columns in the index make it index-only.
    CREATE INDEX IF NOT EXISTS idx_live_signals_injury_dedup
      ON live_signals(league, signal_type, player, injury_designation);
  `);
}

/* ─── Settlement windows ──────────────────────────────────────────────────────
 * How long after a null-game signal is created we still allow it to be matched
 * to that team's next final game. A June transaction must not settle against a
 * September game. Values are generous per sport (off-days, byes) and easy to
 * tune. Unknown leagues fall back to the widest window. */
export const SETTLEMENT_WINDOW_DAYS: Record<string, number> = {
  MLB: 2,
  NBA: 3,
  NFL: 8,
  CFB: 8,
};

export function settlementWindowDays(league: string | null | undefined): number {
  const key = (league ?? "").toUpperCase();
  return SETTLEMENT_WINDOW_DAYS[key] ?? 8;
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

/**
 * Odds/market-derived signal types. These live on the "act before the game"
 * lane: once the game is over they carry no edge, so the settlement cycle
 * retires them. `line_move` is the only such type today; add here if more odds
 * types are introduced.
 */
export const MARKET_SIGNAL_TYPES = ["line_move"] as const;

/**
 * Retire finished market signals: archive (is_archived=1) any active market-type
 * signal whose game is final or is more than the completed-game grace window past
 * its start. A single indexed UPDATE (see idx_live_signals_type_archived_game).
 * Runs from the settlement cycle so stale line_moves stop surfacing on the board.
 */
export function archiveFinishedMarketSignals(
  db: Database.Database = getPipelineDb(),
): number {
  const staleGameCutoff = new Date(
    Date.now() - GAME_COMPLETED_GRACE_MIN * 60 * 1000,
  ).toISOString();
  const placeholders = MARKET_SIGNAL_TYPES.map(() => "?").join(",");
  const result = db
    .prepare(
      `UPDATE live_signals
       SET is_archived = 1
       WHERE is_archived = 0
         AND signal_type IN (${placeholders})
         AND game_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM games g
           WHERE g.id = live_signals.game_id
             AND (g.status = 'final' OR g.game_time < ?)
         )`,
    )
    .run(...MARKET_SIGNAL_TYPES, staleGameCutoff);
  return result.changes;
}

/**
 * Recompute urgency_label / urgency_reason on the way out to clients so an
 * aged signal or a finished game never keeps a stale URGENT/WATCH. Stored rows
 * are left untouched; this only rewrites the delivered copy. Game lookups are
 * cached per game_id so a feed of many signals costs at most one lookup/game.
 */
export function applyReadTimeUrgency<T extends LiveSignal>(signals: T[]): T[] {
  const now = Date.now();
  const gameCache = new Map<string, Game | null>();
  return signals.map((s) => {
    let game: Game | null = null;
    if (s.game_id) {
      if (!gameCache.has(s.game_id)) gameCache.set(s.game_id, getGame(s.game_id));
      game = gameCache.get(s.game_id) ?? null;
    }
    const u = recomputeUrgency(s, game, now);
    return { ...s, urgency_label: u.label, urgency_reason: u.reason };
  });
}

/* ─── Odds API fetch state (persistent throttle + quota guard) ────────────── */

export interface OddsFetchState {
  league: string;
  last_success_at: string | null;
  last_attempt_at: string | null;
  last_remaining: number | null;
  last_status: number | null;
}

export function getOddsFetchState(
  league: string,
  db: Database.Database = getPipelineDb(),
): OddsFetchState | null {
  const row = db
    .prepare(`SELECT league, last_success_at, last_attempt_at, last_remaining, last_status FROM odds_fetch_state WHERE league = ?`)
    .get(league) as OddsFetchState | undefined;
  return row ?? null;
}

export function recordOddsFetchState(
  state: OddsFetchState,
  db: Database.Database = getPipelineDb(),
): void {
  db.prepare(`
    INSERT INTO odds_fetch_state (league, last_success_at, last_attempt_at, last_remaining, last_status)
    VALUES (@league, @last_success_at, @last_attempt_at, @last_remaining, @last_status)
    ON CONFLICT(league) DO UPDATE SET
      last_success_at = excluded.last_success_at,
      last_attempt_at = excluded.last_attempt_at,
      last_remaining  = excluded.last_remaining,
      last_status     = excluded.last_status
  `).run(state);
}

/* ─── Generic pipeline key/value flags ─────────────────────────────────────────
 * Durable one-shot markers (survive a Render restart). Used e.g. to record that a
 * one-time migration has finished so its expensive boot-time rescan can be skipped
 * on every subsequent boot. Returns null when the key has never been set. */
export function getPipelineMeta(
  key: string,
  db: Database.Database = getPipelineDb(),
): string | null {
  const row = db
    .prepare(`SELECT value FROM pipeline_meta WHERE key = ?`)
    .get(key) as { value: string | null } | undefined;
  return row ? row.value : null;
}

export function setPipelineMeta(
  key: string,
  value: string,
  db: Database.Database = getPipelineDb(),
): void {
  db.prepare(`
    INSERT INTO pipeline_meta (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value      = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, value, new Date().toISOString());
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
  // EXISTS, not DISTINCT over a join. The join plan was `SCAN live_signals` +
  // one games seek per signal row + a temp B-tree to dedup — so the read set was
  // the whole of live_signals, the largest table in the file, on a step that runs
  // in every settlement pass including the one on the boot cycle. EXISTS reads
  // games (which grows with the schedule, not with signal churn) and probes
  // idx_live_signals_game_outcome once per final game, short-circuiting on the
  // first match. Identical rows: id is in the select list, so DISTINCT was only
  // ever collapsing the join's duplicates of one game.
  return getPipelineDb().prepare(`
    SELECT g.id, g.league, g.home_team, g.away_team,
           g.spread_line, g.spread_team, g.total_line,
           g.home_score, g.away_score, g.game_time
    FROM games g
    WHERE g.home_score IS NOT NULL
      AND g.away_score IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM live_signals s
        WHERE s.game_id = g.id
          AND s.outcome_id IS NULL
          AND s.betting_relevance = 1
      )
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
      AND settlement_expired = 0
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
  const windowDays = settlementWindowDays(league);
  // Upper bound: only match a final game within `windowDays` of signal creation.
  // julianday() compares instants numerically, so it is immune to the ISO-vs-
  // "YYYY-MM-DD HH:MM:SS" formatting mismatch a string comparison would hit.
  return db.prepare(`
    SELECT * FROM games
    WHERE league = ?
      AND status = 'final'
      AND home_score IS NOT NULL
      AND away_score IS NOT NULL
      AND game_time > ?
      AND julianday(game_time) <= julianday(?) + ?
      AND (
        UPPER(home_team) = ? OR UPPER(away_team) = ?
        OR UPPER(home_team) LIKE ? OR UPPER(away_team) LIKE ?
      )
    ORDER BY game_time ASC
    LIMIT 1
  `).get(league, afterTimestamp, afterTimestamp, windowDays, t, t, `%${t}%`, `%${t}%`) ?? null;
}

/**
 * Park a null-game signal terminally: it never found a final game for its team
 * inside the league window, so it is excluded from future settlement scans.
 * The row is preserved (not deleted); callers also record a SETTLEMENT_EXPIRED
 * state-history entry for the audit trail.
 */
export function expireNullGameSignal(signalId: string): void {
  getPipelineDb()
    .prepare("UPDATE live_signals SET settlement_expired = 1 WHERE id = ?")
    .run(signalId);
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

/** True if a lineup_confirm raw event already exists for this game/team/pitcher
 *  (processed OR not). Indexed seek via idx_raw_events_lineup_confirm_combo — used
 *  by ingestProbablePitchers to avoid re-inserting (and re-fanning-out) an already
 *  known probable starter. */
export function lineupConfirmRawEventExists(
  game_id: string,
  team: string,
  player: string,
  db: Database.Database = getPipelineDb(),
): boolean {
  const row = db.prepare(
    `SELECT 1 FROM raw_events
      WHERE event_type='lineup_confirm' AND game_id=? AND team=? AND player=?
      LIMIT 1`,
  ).get(game_id, team, player);
  return row !== undefined;
}

/** Bump a live signal's updated_at without touching its score or any other field.
 *  Returns true if a row was updated. */
export function touchLiveSignalUpdatedAt(
  id: string,
  db: Database.Database = getPipelineDb(),
): boolean {
  const r = db.prepare(`UPDATE live_signals SET updated_at=? WHERE id=?`)
    .run(new Date().toISOString(), id);
  return r.changes > 0;
}

/* ─── Roster gazetteer ───────────────────────────────────────────────────────
 * Team-scoped active-roster names, used by the RSS headline matcher to write a
 * player_candidate without touching the regex-driven `player` column.
 */

export interface RosterPlayer {
  league: string;
  team: string;
  espn_id: string | null;
  jersey: string | null;
  full_name: string;
  first_name: string | null;
  last_name: string;
  position: string | null;
  status: string | null;
}

/** Replace one team's roster atomically. Deleting first (rather than upserting)
 *  drops players who were cut/waived since the last refresh — the daily refresh
 *  is the mechanism that keeps former players out of the gazetteer. Returns the
 *  number of rows written. */
export function replaceTeamRoster(
  league: string,
  team: string,
  players: Array<Omit<RosterPlayer, "league" | "team">>,
  db: Database.Database = getPipelineDb(),
): number {
  const now = new Date().toISOString();
  const del = db.prepare(`DELETE FROM roster_players WHERE league=? AND team=?`);
  const ins = db.prepare(
    `INSERT OR REPLACE INTO roster_players
       (league,team,espn_id,jersey,full_name,first_name,last_name,position,status,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  const tx = db.transaction(() => {
    del.run(league, team);
    let n = 0;
    for (const p of players) {
      if (!p.full_name || !p.last_name) continue;
      ins.run(league, team, p.espn_id ?? null, p.jersey ?? null, p.full_name, p.first_name ?? null, p.last_name, p.position ?? null, p.status ?? null, now);
      n++;
    }
    return n;
  });
  return tx();
}

export function getTeamRoster(
  league: string,
  team: string,
  db: Database.Database = getPipelineDb(),
): RosterPlayer[] {
  return db.prepare(
    `SELECT league,team,espn_id,jersey,full_name,first_name,last_name,position,status
       FROM roster_players WHERE league=? AND team=?`,
  ).all(league, team) as RosterPlayer[];
}

/**
 * Every (player, designation) pair an injury adapter dedups its payload against,
 * read in bounded pages with the event loop handed back between them.
 *
 * Bounded because this runs on the cold boot path: one `.all()` over a league's
 * injury signals was a 7,956ms uninterruptible span on the Oct 5 boot. The
 * covering index (see idx_live_signals_injury_dedup) removes the random
 * main-table read per row; the paging removes the remaining "however many rows
 * there are, in one span" property.
 *
 * Pages break on PLAYER boundaries, never mid-player: a player's rows carry
 * different designations and each is a distinct dedup key, so a cursor that
 * stepped past a partially-read player would silently drop keys and re-create
 * signals that already exist. A player whose rows fill a whole page is read
 * whole in one extra query — one player's injury history is small, and this is
 * the only case where a page can exceed its budget.
 *
 * Rows with a NULL player are skipped: their key could never match an adapter
 * payload, which always carries a display name.
 */
export async function loadInjuryDedupKeys(
  league: string,
  db: Database.Database = getPipelineDb(),
  pageRows = 500,
): Promise<Set<string>> {
  const page = db.prepare(`
    SELECT player, injury_designation
    FROM live_signals
    WHERE league = ? AND signal_type = 'injury_update'
      AND player IS NOT NULL AND player > ?
    ORDER BY player, injury_designation
    LIMIT ?
  `);
  const wholePlayer = db.prepare(`
    SELECT player, injury_designation
    FROM live_signals
    WHERE league = ? AND signal_type = 'injury_update' AND player = ?
  `);

  type Row = { player: string; injury_designation: string | null };
  const keys = new Set<string>();
  const add = (r: Row) => keys.add(`${r.player}_${r.injury_designation ?? ""}`);
  let cursor = "";

  for (;;) {
    const rows = page.all(league, cursor, pageRows) as Row[];
    if (rows.length === 0) break;

    if (rows.length < pageRows) {
      rows.forEach(add);
      break;
    }

    const lastPlayer = rows[rows.length - 1].player;
    const firstOfLast = rows.findIndex((r) => r.player === lastPlayer);
    if (firstOfLast === 0) {
      (wholePlayer.all(league, lastPlayer) as Row[]).forEach(add);
    } else {
      rows.slice(0, firstOfLast).forEach(add);
    }
    cursor = firstOfLast === 0 ? lastPlayer : rows[firstOfLast - 1].player;
    await yieldToLoop();
  }
  return keys;
}

export function getRosterSummary(
  db: Database.Database = getPipelineDb(),
): { total: number; teams: number; byLeague: Record<string, number>; oldestUpdatedAt: string | null } {
  const total = (db.prepare(`SELECT COUNT(*) c FROM roster_players`).get() as any).c as number;
  const teams = (db.prepare(`SELECT COUNT(DISTINCT league || '/' || team) c FROM roster_players`).get() as any).c as number;
  const rows = db.prepare(`SELECT league, COUNT(*) c FROM roster_players GROUP BY league`).all() as Array<{ league: string; c: number }>;
  const byLeague: Record<string, number> = {};
  for (const r of rows) byLeague[r.league] = r.c;
  const oldest = db.prepare(`SELECT MIN(updated_at) m FROM roster_players`).get() as any;
  return { total, teams, byLeague, oldestUpdatedAt: oldest?.m ?? null };
}

export interface RosterStaff {
  league: string;
  team: string;
  full_name: string;
  first_name: string | null;
  last_name: string;
  role: string | null;
}

/** Replace one team's coaching/front-office staff atomically (same wholesale
 *  pattern as replaceTeamRoster). Returns the number of rows written. */
export function replaceTeamStaff(
  league: string,
  team: string,
  staff: Array<Omit<RosterStaff, "league" | "team">>,
  db: Database.Database = getPipelineDb(),
): number {
  const now = new Date().toISOString();
  const del = db.prepare(`DELETE FROM roster_staff WHERE league=? AND team=?`);
  const ins = db.prepare(
    `INSERT OR REPLACE INTO roster_staff
       (league,team,full_name,first_name,last_name,role,updated_at)
     VALUES (?,?,?,?,?,?,?)`,
  );
  const tx = db.transaction(() => {
    del.run(league, team);
    let n = 0;
    for (const s of staff) {
      if (!s.full_name || !s.last_name) continue;
      ins.run(league, team, s.full_name, s.first_name ?? null, s.last_name, s.role ?? null, now);
      n++;
    }
    return n;
  });
  return tx();
}

export function getTeamStaff(
  league: string,
  team: string,
  db: Database.Database = getPipelineDb(),
): RosterStaff[] {
  return db.prepare(
    `SELECT league,team,full_name,first_name,last_name,role FROM roster_staff WHERE league=? AND team=?`,
  ).all(league, team) as RosterStaff[];
}

/** Writes the gazetteer match onto an already-inserted raw_event. Kept separate
 *  from insertRawEvent so the shared insert path (used by every adapter) is
 *  untouched. */
export function setPlayerCandidate(
  rawEventId: string,
  candidate: string | null,
  confidence: string | null,
  espnId: string | null = null,
  jersey: string | null = null,
  db: Database.Database = getPipelineDb(),
): void {
  db.prepare(`UPDATE raw_events SET player_candidate=?, player_candidate_confidence=?, player_candidate_espn_id=?, player_candidate_jersey=? WHERE id=?`)
    .run(candidate, confidence, espnId, jersey, rawEventId);
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
  | "EXPIRED"
  | "SETTLEMENT_EXPIRED";

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
      -- Evidence merge (source dedup, corroboration bonus, raw-event
      -- provenance) happens in processor.mergeSignalEvidence, where source
      -- identity is resolved; the upsert just persists the computed values.
      source_count=excluded.source_count,
      sources=excluded.sources,
      confidence=excluded.confidence,
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
  if (opts.player !== undefined) {
    // Strict identity: a player-less event must not collapse onto a
    // player-specific row, and vice versa.
    if (opts.player === null) conds.push("player IS NULL");
    else { conds.push("player=?"); params.push(opts.player); }
  }
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

/**
 * Exported so outcomes-signal-index.test.ts can EXPLAIN the exact string this
 * runs. Must stay served by idx_outcomes_signal_created.
 */
export const OUTCOMES_BY_SIGNAL_SQL = "SELECT * FROM outcomes WHERE signal_id=? ORDER BY created_at DESC";

export function getOutcomes(signal_id?: string): Outcome[] {
  const db = getPipelineDb();
  const rows = signal_id
    ? db.prepare(OUTCOMES_BY_SIGNAL_SQL).all(signal_id)
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
      AND o.excluded_stale = 0
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
      AND o.excluded_stale = 0
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
