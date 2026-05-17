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
import {
  markBackfillPhase as _markBackfillPhase,
  getBackfillPhase as _getBackfillPhase,
  getAllBackfillProgress as _getAllBackfillProgress,
  resetBackfillPhases as _resetBackfillPhases,
  type BackfillPhase,
} from "../storage";

/* ─── DB setup ─────────────────────────────────────────── */

function resolvePipelineDataDir(): string {
  // pipeline.db is intentionally ephemeral — it holds live_signals and raw_events
  // which are rebuilt each ingestion cycle.  Keeping it in /tmp avoids unbounded
  // growth on the persistent disk.  Use PIPELINE_DATA_DIR only for local dev.
  for (const dir of [process.env.PIPELINE_DATA_DIR, "/tmp", "."]) {
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
  `);

  // Migrate existing DBs that predate home_score/away_score columns on games
  addColumnIfMissing(db, "games", "home_score", "REAL");
  addColumnIfMissing(db, "games", "away_score", "REAL");
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

export function getUnprocessedRawEvents(limit = 100): RawEvent[] {
  const db = getPipelineDb();
  const rows = db.prepare(
    "SELECT * FROM raw_events WHERE processed=0 ORDER BY received_at ASC LIMIT ?"
  ).all(limit);
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
      raw_event_ids,signal_time,created_at,updated_at,outcome_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
      confidence=excluded.confidence,
      confirmation_strength=excluded.confirmation_strength,
      source_count=excluded.source_count,
      sources=excluded.sources,
      raw_event_ids=excluded.raw_event_ids,
      signal_time=excluded.signal_time,
      updated_at=excluded.updated_at
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
    JSON.stringify(s.raw_event_ids), s.signal_time, s.created_at, s.updated_at,
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
} = {}): LiveSignal[] {
  const db = getPipelineDb();
  const conds: string[] = [];
  const params: unknown[] = [];
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
  player?: string | null;
  signal_type?: string | null;
}): LiveSignal | null {
  if (!opts.player && !opts.signal_type) return null;
  const db = getPipelineDb();
  const conds = ["league=?"];
  const params: unknown[] = [opts.league];
  // When game_id is present, scope the match to that game so signals from
  // different games (or different days) never collapse onto the same record.
  if (opts.game_id) { conds.push("game_id=?"); params.push(opts.game_id); }
  if (opts.player) { conds.push("player=?"); params.push(opts.player); }
  if (opts.signal_type) { conds.push("signal_type=?"); params.push(opts.signal_type); }
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
