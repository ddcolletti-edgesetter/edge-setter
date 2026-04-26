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

/* ─── DB setup ─────────────────────────────────────────── */

function resolveDataDir(): string {
  for (const dir of [process.env.DATA_DIR, "/tmp", "."]) {
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

const DB_PATH = path.join(resolveDataDir(), "pipeline.db");
let _db: Database.Database | null = null;

export function getPipelineDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
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
      source_game_id  TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );

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
  `);
}

/* ─── Game CRUD ─────────────────────────────────────────── */

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
      status=excluded.status,
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

/* ─── RawEvent CRUD ─────────────────────────────────────── */

export function insertRawEvent(e: Omit<RawEvent, "id" | "created_at" | "received_at" | "processed" | "processed_at">): RawEvent {
  const db = getPipelineDb();
  const now = new Date().toISOString();
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
