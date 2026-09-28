/**
 * Edge Setter — Outcome Settlement Engine
 *
 * FIXES (Session 18):
 *   1. computeSourceAccuracy() now aggregates per individual source (beat writer)
 *      by exploding the sources JSON array from each settled signal in Node.js.
 *   2. After recomputing accuracy, scores are synced to storage.db (persistent)
 *      via syncAccuracyToStorageDb() so leaderboard survives restarts.
 *   3. Active-hours check bug fixed in ingestion.ts (separate file).
 */

import { randomUUID } from "crypto";
import {
  getPipelineDb,
  getGame,
  updateGameFinal,
  getUnsettledSignalsForGame,
  getSettleable,
  getUnsettledSignalsWithoutGameId,
  findNextFinalGameForTeam,
  getCompletedUnfinalGames,
  createOutcome,
  linkOutcomeToSignal,
  expireNullGameSignal,
  settlementWindowDays,
 getLatestSnapshotBefore,
getClosingSnapshot,
recordSignalStateChange,
} from "./store";
import { trackJob } from "../event-loop-monitor";
import { fetchMLBFinalScores } from "./adapters/mlb-statsapi";
import { fetchNBAFinalScores } from "./adapters/espn-nba";
import { fetchNFLFinalScores } from "./adapters/espn-nfl";
import { fetchCFBFinalScores } from "./adapters/espn-cfb";
import { storage, insertSettledOutcome, getSettledOutcomesForAccuracy, markSettledOutcomesStale } from "../storage";
import type { LiveSignal, Game } from "./types";
import { computeSpreadOrTotalClv } from "./clv";

/* ─── Schema for source accuracy table ─────────────────── */

function ensureAccuracyTable(db: ReturnType<typeof getPipelineDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_source_accuracy (
      id            TEXT PRIMARY KEY,
      league        TEXT NOT NULL,
      signal_type   TEXT,
      source_type   TEXT,
      source_id     TEXT,
      source_name   TEXT,
      total_signals INTEGER NOT NULL DEFAULT 0,
      wins          INTEGER NOT NULL DEFAULT 0,
      losses        INTEGER NOT NULL DEFAULT 0,
      hit_rate      REAL,
      avg_clv       REAL,
      computed_at   TEXT NOT NULL
    );
  `);
  // Migrate: add source_id / source_name columns if this is an older DB
  const cols = (db.prepare("PRAGMA table_info(pipeline_source_accuracy)").all() as any[]).map((c: any) => c.name);
  if (!cols.includes("source_id"))   db.exec("ALTER TABLE pipeline_source_accuracy ADD COLUMN source_id TEXT");
  if (!cols.includes("source_name")) db.exec("ALTER TABLE pipeline_source_accuracy ADD COLUMN source_name TEXT");
}

/* ─── Deserialize a raw DB row into a LiveSignal ─────────── */

function deserializeSignal(row: any): LiveSignal {
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

/* ─── Hit computation helpers ────────────────────────────── */

function favoriteCovers(game: Game, homeScore: number, awayScore: number): boolean | null {
  if (game.spread_line == null || !game.spread_team) return null;

  const spreadAbbr = game.spread_team.toUpperCase();
  const homeAbbr   = game.home_team.toUpperCase();
  const isHomeFav  = homeAbbr === spreadAbbr
    || homeAbbr.includes(spreadAbbr)
    || spreadAbbr.includes(homeAbbr);

  const favScore = isHomeFav ? homeScore : awayScore;
  const dogScore = isHomeFav ? awayScore : homeScore;
  const actualMargin = favScore - dogScore;

  return actualMargin + game.spread_line > 0;
}

interface SettleResult {
  hit: boolean | null;
  actualResult: number | null;
  market: "spread" | "total" | "moneyline";
  lineAtSignal: number | null;
  closingLine: number | null;
  clv: number | null;
}

function settleSignal(signal: LiveSignal, game: Game, homeScore: number, awayScore: number): SettleResult {
  const base: SettleResult = {
    hit: null, actualResult: null,
    market: "spread", lineAtSignal: null, closingLine: null, clv: null,
  };

  switch (signal.signal_type) {

    case "line_move": {
      const lm = signal.line_movement;
      if (!lm) return base;

      const signalSnapshot = getLatestSnapshotBefore(
        game.id,
        signal.created_at,
      );
      const closingSnapshot = getClosingSnapshot(game.id);

      const lineAtSignal = signalSnapshot?.spread_line ?? lm.open;
      const closingLine = closingSnapshot?.spread_line ?? null;

      if (lineAtSignal == null || closingLine == null) {
        return base;
      }

      const clv = computeSpreadOrTotalClv(lineAtSignal, closingLine)!;

      return {
        market: "spread",
        lineAtSignal,
        closingLine,
        clv,
        actualResult: homeScore - awayScore,
        hit: clv > 0,
      };
    }

    case "injury_update":
    case "lineup_change": {
      if (!signal.team || game.spread_line == null) return base;
      const favCovered = favoriteCovers(game, homeScore, awayScore);
      if (favCovered === null) return base;

      const spreadAbbr = (game.spread_team ?? "").toUpperCase();
      const signalAbbr = signal.team.toUpperCase();
      const affectedTeamIsFav = spreadAbbr === signalAbbr
        || spreadAbbr.includes(signalAbbr)
        || signalAbbr.includes(spreadAbbr);

      const hit = affectedTeamIsFav ? !favCovered : favCovered;

      return {
        market: "spread",
        lineAtSignal: signal.line_movement?.open ?? game.spread_line,
        closingLine: game.spread_line,
        clv: null,
        actualResult: homeScore - awayScore,
        hit,
      };
    }

    case "lineup_confirm": {
      if (!signal.team || game.spread_line == null) return base;
      const favCovered = favoriteCovers(game, homeScore, awayScore);
      if (favCovered === null) return base;

      const spreadAbbr = (game.spread_team ?? "").toUpperCase();
      const signalAbbr = signal.team.toUpperCase();
      const confirmedTeamIsFav = spreadAbbr === signalAbbr
        || spreadAbbr.includes(signalAbbr)
        || signalAbbr.includes(spreadAbbr);

      const hit = confirmedTeamIsFav ? favCovered : !favCovered;

      return {
        market: "spread",
        lineAtSignal: signal.line_movement?.open ?? game.spread_line,
        closingLine: game.spread_line,
        clv: null,
        actualResult: homeScore - awayScore,
        hit,
      };
    }

    case "weather_update": {
      if (game.total_line == null) return base;
      const actualTotal = homeScore + awayScore;
      return {
        market: "total",
        lineAtSignal: signal.line_movement?.open ?? game.total_line,
        closingLine: game.total_line,
        clv: null,
        actualResult: actualTotal,
        hit: actualTotal < game.total_line,
      };
    }

    default:
      return base;
  }
}

/* ─── Main settlement function ───────────────────────────── */

export interface GameSettlementResult {
  game_id: string;
  settled: number;
  skipped: number;
  errors: number;
}

export function settleGame(
  gameId: string,
  homeScore: number,
  awayScore: number,
): GameSettlementResult {
  const db = getPipelineDb();
  ensureAccuracyTable(db);

  const game = getGame(gameId);
  if (!game) {
    console.warn(`[settlement] Game ${gameId} not found`);
    return { game_id: gameId, settled: 0, skipped: 0, errors: 1 };
  }

  updateGameFinal(gameId, homeScore, awayScore);

  const rawSignals = getUnsettledSignalsForGame(gameId);
  let settled = 0, skipped = 0, errors = 0;

  for (const raw of rawSignals) {
    try {
      const signal = deserializeSignal(raw);
      const result = settleSignal(signal, { ...game, home_score: homeScore, away_score: awayScore } as Game, homeScore, awayScore);

      const outcome = createOutcome({
        signal_id: signal.id,
        game_id: gameId,
        market: result.market,
        home_score: homeScore,
        away_score: awayScore,
        line_at_signal: result.lineAtSignal,
        closing_line: result.closingLine,
        actual_result: result.actualResult,
        hit: result.hit,
        clv: result.clv,
        recorded_at: new Date().toISOString(),
      });

      linkOutcomeToSignal(signal.id, outcome.id);
      recordSignalStateChange({
        signal_id: signal.id,
        previous_state: "UPDATED",
        new_state: result.hit ? "SETTLED_WIN" : "SETTLED_LOSS",
        reason: "Outcome settlement completed",
        metadata: {
          game_id: gameId,
          market: result.market,
          clv: result.clv,
        },
      });
      insertSettledOutcome({
        signal_id:      signal.id,
        game_id:        gameId,
        league:         signal.league,
        signal_type:    signal.signal_type,
        sources:        JSON.stringify(signal.sources),
        team:           signal.team ?? null,
        market:         result.market,
        home_score:     homeScore,
        away_score:     awayScore,
        line_at_signal: result.lineAtSignal,
        closing_line:   result.closingLine,
        actual_result:  result.actualResult,
        hit:            result.hit,
        clv:            result.clv,
        recorded_at:    new Date().toISOString(),
      });

      if (result.hit !== null) {
        settled++;
      } else {
        skipped++;
      }
    } catch (err: any) {
      console.error(`[settlement] Error settling signal ${raw.id}:`, err.message);
      errors++;
    }
  }

  console.log(`[settlement] ${gameId}: settled=${settled} skipped=${skipped} errors=${errors}`);
  return { game_id: gameId, settled, skipped, errors };
}

/* ─── Batch auto-settlement ──────────────────────────────── */

export interface AutoSettleResult {
  scores_fetched: { NBA: number; MLB: number; NFL: number; CFB: number };
  games_updated: number;
  games_settled: number;
  signals_settled: number;
  signals_expired: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/* ─── Accuracy recompute debounce ─────────────────────────────
 * computeSourceAccuracy() + syncAccuracyToStorageDb() together scan every
 * settled outcome and block the event loop for seconds. The ingestion cycle
 * runs frequently, so from that path we recompute at most once per hour.
 * Manual admin routes call computeSourceAccuracy() directly and are NOT gated
 * by this. forceAccuracyRecompute() runs it now and resets the clock. */
const ACCURACY_DEBOUNCE_MS = 60 * 60 * 1000;
let lastAccuracyComputeAt = 0;

export function forceAccuracyRecompute(): void {
  computeSourceAccuracy();
  syncAccuracyToStorageDb();
  lastAccuracyComputeAt = Date.now();
}

export async function autoSettleFinishedGames(): Promise<AutoSettleResult> {
  const db = getPipelineDb();
  ensureAccuracyTable(db);

  const [mlbScores, nbaScores, nflScores, cfbScores] = await trackJob(
    "settlement:fetch-scores",
    () => Promise.all([
      fetchMLBFinalScores().catch(() => []),
      fetchNBAFinalScores().catch(() => []),
      fetchNFLFinalScores().catch(() => []),
      fetchCFBFinalScores().catch(() => []),
    ]),
  );

  const allScores = [...mlbScores, ...nbaScores, ...nflScores, ...cfbScores];

  const gamesUpdated = await trackJob("settlement:update-finals", () => {
    let updated = 0;
    for (const { game_id, home_score, away_score } of allScores) {
      const game = getGame(game_id);
      if (!game) continue;
      if (game.status === "final" && game.home_score != null) continue;
      updateGameFinal(game_id, home_score, away_score);
      updated++;
    }
    return updated;
  });

  let gamesSettled = 0, signalsSettled = 0;

  await trackJob("settlement:settle-linked", () => {
    const settleable = getSettleable();
    for (const game of settleable) {
      if (game.home_score == null || game.away_score == null) continue;
      const result = settleGame(game.id, game.home_score, game.away_score);
      if (result.settled > 0 || result.skipped > 0) gamesSettled++;
      signalsSettled += result.settled;
    }
  });

  let signalsExpired = 0;
  await trackJob("settlement:settle-nullgame", () => {
    const nullGameSignals = getUnsettledSignalsWithoutGameId();
    const now = Date.now();

    for (const raw of nullGameSignals) {
      const signal = deserializeSignal(raw);
      if (!signal.team) continue;

      const game = findNextFinalGameForTeam(signal.league, signal.team, signal.created_at);

      if (!game || game.home_score == null || game.away_score == null) {
        // No final game inside the league window. Once the signal is older than
        // window + 1 day, no future game can ever fall inside the window, so park
        // it terminally to stop it being re-scanned every cycle forever.
        const windowMs = (settlementWindowDays(signal.league) + 1) * DAY_MS;
        const createdMs = Date.parse(signal.created_at);
        if (Number.isFinite(createdMs) && now - createdMs > windowMs) {
          expireNullGameSignal(signal.id);
          recordSignalStateChange({
            signal_id: signal.id,
            previous_state: "UPDATED",
            new_state: "SETTLEMENT_EXPIRED",
            reason: `No final ${signal.league} game for ${signal.team} within ${settlementWindowDays(signal.league)}d window`,
            metadata: { league: signal.league, team: signal.team, window_days: settlementWindowDays(signal.league) },
          });
          signalsExpired++;
        }
        continue;
      }

      try {
        const result = settleSignal(
          signal,
          { ...game, home_score: game.home_score, away_score: game.away_score },
          game.home_score,
          game.away_score,
        );

        const outcome = createOutcome({
          signal_id: signal.id,
          game_id: game.id,
          market: result.market,
          home_score: game.home_score,
          away_score: game.away_score,
          line_at_signal: result.lineAtSignal,
          closing_line: result.closingLine,
          actual_result: result.actualResult,
          hit: result.hit,
          clv: result.clv,
          recorded_at: new Date().toISOString(),
        });

        linkOutcomeToSignal(signal.id, outcome.id);
        recordSignalStateChange({
          signal_id: signal.id,
          previous_state: "UPDATED",
          new_state: result.hit ? "SETTLED_WIN" : "SETTLED_LOSS",
          reason: "Outcome settlement completed",
          metadata: {
            game_id: game.id,
            market: result.market,
            clv: result.clv,
          },
        });
        insertSettledOutcome({
          signal_id:      signal.id,
          game_id:        game.id,
          league:         signal.league,
          signal_type:    signal.signal_type,
          sources:        JSON.stringify(signal.sources),
          team:           signal.team ?? null,
          market:         result.market,
          home_score:     game.home_score,
          away_score:     game.away_score,
          line_at_signal: result.lineAtSignal,
          closing_line:   result.closingLine,
          actual_result:  result.actualResult,
          hit:            result.hit,
          clv:            result.clv,
          recorded_at:    new Date().toISOString(),
        });

        if (result.hit !== null) {
          signalsSettled++;
          gamesSettled++;
        }
      } catch (err: any) {
        console.error(`[settlement] Error settling null-game signal ${signal.id}:`, err.message);
      }
    }
  });

  if (signalsSettled > 0 && Date.now() - lastAccuracyComputeAt >= ACCURACY_DEBOUNCE_MS) {
    await trackJob("settlement:compute-accuracy", () => {
      computeSourceAccuracy();
      syncAccuracyToStorageDb();
    });
    lastAccuracyComputeAt = Date.now();
  }

  return {
    scores_fetched: { NBA: nbaScores.length, MLB: mlbScores.length, NFL: nflScores.length, CFB: cfbScores.length },
    games_updated: gamesUpdated,
    games_settled: gamesSettled,
    signals_settled: signalsSettled,
    signals_expired: signalsExpired,
  };
}

/* ─── Source accuracy recomputation ──────────────────────── */

/**
 * FIX: Three aggregation passes:
 *   1. Overall per league (unchanged)
 *   2. Per signal_type per league (unchanged)
 *   3. NEW — Per individual source/beat writer, by exploding the sources JSON
 *      array in Node.js (SQLite can't unnest JSON arrays natively).
 *
 * All results written to pipeline.db → pipeline_source_accuracy.
 * Then syncAccuracyToStorageDb() copies them to storage.db for persistence.
 */
export function computeSourceAccuracy(): void {
  const db = getPipelineDb();
  ensureAccuracyTable(db);

  const leagues = ["NBA", "MLB", "NFL", "CFB"];

  for (const league of leagues) {
    // ── Pass 1: Overall per league ──────────────────────────
    const overall = db.prepare(`
      SELECT
        COUNT(*)                                                   AS total,
        SUM(CASE WHEN o.hit = 1 THEN 1 ELSE 0 END)                AS wins,
        SUM(CASE WHEN o.hit = 0 THEN 1 ELSE 0 END)                AS losses,
        AVG(CASE WHEN o.clv IS NOT NULL THEN o.clv ELSE NULL END)  AS avg_clv
      FROM outcomes o
      JOIN live_signals s ON s.id = o.signal_id
      WHERE s.league = ? AND o.hit IS NOT NULL AND o.excluded_stale = 0
    `).get(league) as any;

    upsertAccuracy(db, league, null, null, null, null, overall);

    // ── Pass 2: Per signal_type ──────────────────────────────
    const byType = db.prepare(`
      SELECT
        s.signal_type,
        COUNT(*)                                                   AS total,
        SUM(CASE WHEN o.hit = 1 THEN 1 ELSE 0 END)                AS wins,
        SUM(CASE WHEN o.hit = 0 THEN 1 ELSE 0 END)                AS losses,
        AVG(CASE WHEN o.clv IS NOT NULL THEN o.clv ELSE NULL END)  AS avg_clv
      FROM outcomes o
      JOIN live_signals s ON s.id = o.signal_id
      WHERE s.league = ? AND o.hit IS NOT NULL AND o.excluded_stale = 0
      GROUP BY s.signal_type
    `).all(league) as any[];

    for (const row of byType) {
      upsertAccuracy(db, league, row.signal_type, null, null, null, row);
    }

    // ── Pass 3: Per individual source (beat writer) ──────────
    // Pull all settled signals for this league with their sources JSON
    const settledRows = db.prepare(`
      SELECT s.id, s.signal_type, s.sources,
             o.hit, o.clv
      FROM outcomes o
      JOIN live_signals s ON s.id = o.signal_id
      WHERE s.league = ? AND o.hit IS NOT NULL AND o.excluded_stale = 0
    `).all(league) as any[];

    // Tally hits/misses per source_id
    const sourceTally = new Map<string, {
      source_id: string;
      source_name: string;
      source_type: string;
      wins: number;
      losses: number;
      clv_sum: number;
      clv_count: number;
    }>();

    for (const row of settledRows) {
      let srcs: any[] = [];
      try { srcs = JSON.parse(row.sources ?? "[]"); } catch { continue; }

      for (const src of srcs) {
        // Sources can be strings (legacy) or objects with id/name
        const sourceId   = typeof src === "string" ? src : (src.id ?? src.source_id ?? src.name ?? src);
        const sourceName = typeof src === "string" ? src : (src.name ?? src.source_name ?? sourceId);
        const sourceType = typeof src === "string" ? "unknown" : (src.source_type ?? src.type ?? "unknown");

        if (!sourceId) continue;

        if (!sourceTally.has(sourceId)) {
          sourceTally.set(sourceId, { source_id: sourceId, source_name: sourceName, source_type: sourceType, wins: 0, losses: 0, clv_sum: 0, clv_count: 0 });
        }
        const t = sourceTally.get(sourceId)!;
        if (row.hit === 1) t.wins++;
        else if (row.hit === 0) t.losses++;
        if (row.clv != null) { t.clv_sum += row.clv; t.clv_count++; }
      }
    }

    for (const t of Array.from(sourceTally.values())) {
      const total = t.wins + t.losses;
      upsertAccuracy(db, league, null, t.source_type, t.source_id, t.source_name, {
        total,
        wins: t.wins,
        losses: t.losses,
        avg_clv: t.clv_count > 0 ? t.clv_sum / t.clv_count : null,
      });
    }
  }

  console.log("[settlement] Source accuracy recomputed (league + signal_type + per-source)");
}

function upsertAccuracy(
  db: ReturnType<typeof getPipelineDb>,
  league: string,
  signalType: string | null,
  sourceType: string | null,
  sourceId: string | null,
  sourceName: string | null,
  row: { total: number; wins: number; losses: number; avg_clv: number | null },
) {
  // Deterministic PK: league | signal_type | source_id (all nullable → "ALL")
  const id = `${league}|${signalType ?? "ALL"}|${sourceId ?? sourceType ?? "ALL"}`;
  const total   = row.total   ?? 0;
  const wins    = row.wins    ?? 0;
  const losses  = row.losses  ?? 0;
  const hitRate = total > 0 ? Math.round((wins / total) * 1000) / 1000 : null;
  const avgClv  = row.avg_clv != null ? Math.round(row.avg_clv * 100) / 100 : null;

  db.prepare(`
    INSERT INTO pipeline_source_accuracy
      (id, league, signal_type, source_type, source_id, source_name,
       total_signals, wins, losses, hit_rate, avg_clv, computed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      total_signals = excluded.total_signals,
      wins          = excluded.wins,
      losses        = excluded.losses,
      hit_rate      = excluded.hit_rate,
      avg_clv       = excluded.avg_clv,
      source_name   = excluded.source_name,
      computed_at   = excluded.computed_at
  `).run(
    id, league, signalType, sourceType, sourceId, sourceName,
    total, wins, losses, hitRate, avgClv,
    new Date().toISOString(),
  );
}

/* ─── Sync accuracy scores to persistent storage.db ─────── */

/**
 * FIX: After computing accuracy in pipeline.db (ephemeral),
 * copy per-source scores into storage.db (persistent) via
 * storage.upsertSourceScore() so the leaderboard survives restarts.
 *
 * Only syncs rows where source_id IS NOT NULL (per-writer rows),
 * since the leaderboard is keyed on source records in storage.db.
 */
export function syncAccuracyToStorageDb(): void {
  try {
    // Read from persistent settled_outcomes (not ephemeral pipeline.db)
    const rows = getSettledOutcomesForAccuracy();

    // Tally per source_id across all leagues — same logic as computeSourceAccuracy Pass 3
    const sourceTally = new Map<string, {
      source_id:   string;
      source_name: string;
      wins:        number;
      losses:      number;
      clv_sum:     number;
      clv_count:   number;
    }>();

    for (const row of rows) {
      let srcs: any[] = [];
      try { srcs = JSON.parse(row.sources ?? "[]"); } catch { continue; }

      for (const src of srcs) {
        const sourceId   = typeof src === "string" ? src : (src.id ?? src.source_id ?? src.name ?? src);
        const sourceName = typeof src === "string" ? src : (src.name ?? src.source_name ?? sourceId);
        if (!sourceId) continue;

        if (!sourceTally.has(sourceId)) {
          sourceTally.set(sourceId, { source_id: sourceId, source_name: sourceName, wins: 0, losses: 0, clv_sum: 0, clv_count: 0 });
        }
        const t = sourceTally.get(sourceId)!;
        if (row.hit === 1) t.wins++;
        else if (row.hit === 0) t.losses++;
        if (row.clv != null) { t.clv_sum += row.clv; t.clv_count++; }
      }
    }

    let synced = 0;
    for (const t of Array.from(sourceTally.values())) {
      try {
        const total   = t.wins + t.losses;
        const hitRate = total > 0 ? t.wins / total : null;

        storage.upsertSourceScore({
          source_id:                 t.source_id,
          source_name:               t.source_name,
          overall_accuracy:          String(hitRate != null ? Math.round(hitRate * 100) : 0),
          draft_accuracy:            String(hitRate != null ? Math.round(hitRate * 100) : 0),
          average_lead_time_minutes: "0",
          injury_accuracy:           "0",
          portal_accuracy:           "0",
          false_positive_rate:       "0",
        });
        synced++;
      } catch (err: any) {
        console.warn(`[settlement] syncAccuracyToStorageDb: failed for source ${t.source_id}:`, err.message);
      }
    }

    if (synced > 0) {
      console.log(`[settlement] Synced ${synced} source accuracy scores → storage.db (from settled_outcomes)`);
    }
  } catch (err: any) {
    console.error("[settlement] syncAccuracyToStorageDb failed:", err.message);
  }
}

/* ─── One-time backlog migration ──────────────────────────────
 * Prod (Sept 28 2026) carried ~39k null-game signals that will never match a
 * final game and ~51k outcomes whose null-game signal matched a game far beyond
 * its league window (a June transaction "settled" against a September game).
 *
 * This idempotent, chunked, event-loop-yielding migration:
 *   1. Parks each never-matchable null-game signal (SETTLEMENT_EXPIRED) so the
 *      settlement queue stops re-scanning it every cycle.
 *   2. Flags stale outcomes (excluded_stale=1) in pipeline.db AND mirrors the
 *      flag into storage.db settled_outcomes — rows are kept, never deleted.
 *   3. Forces one accuracy recompute so the leaderboard/calibration reflect the
 *      now-excluded rows immediately.
 *
 * Re-running is a no-op: every step only touches rows still at their default
 * flag value that still meet the age/window criteria. */
export interface SettlementBacklogMigrationResult {
  scanned: number;
  expired: number;
  stale_outcomes_flagged: number;
  stale_outcomes_mirrored: number;
}

const BACKLOG_CHUNK = 1000;
const yieldToLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

export async function runSettlementBacklogMigration(): Promise<SettlementBacklogMigrationResult> {
  const db = getPipelineDb();
  ensureAccuracyTable(db);

  // ── Step 1: expire never-matchable null-game backlog, chunked ────────────
  // Candidates: the same rows the settlement queue scans, minus already-parked
  // ones. Snapshot ids up front (small: id/league/team/created_at only) so that
  // flipping settlement_expired mid-loop can't disturb pagination.
  const candidates = db.prepare(`
    SELECT id, league, team, created_at
    FROM live_signals
    WHERE game_id IS NULL
      AND betting_relevance = 1
      AND outcome_id IS NULL
      AND team IS NOT NULL
      AND settlement_expired = 0
    ORDER BY created_at ASC
  `).all() as Array<{ id: string; league: string; team: string; created_at: string }>;

  const now = Date.now();
  let scanned = 0;
  let expired = 0;

  for (const c of candidates) {
    scanned++;
    const windowDays = settlementWindowDays(c.league);
    const createdMs = Date.parse(c.created_at);
    // Only park rows old enough that no future game can still land in-window.
    if (Number.isFinite(createdMs) && now - createdMs > (windowDays + 1) * DAY_MS) {
      // Confirm there is genuinely no final game inside the window before parking
      // it (guards the rare case a matchable in-window game is simply queue-starved).
      const game = findNextFinalGameForTeam(c.league, c.team, c.created_at);
      if (!game) {
        expireNullGameSignal(c.id);
        recordSignalStateChange({
          signal_id: c.id,
          previous_state: "UPDATED",
          new_state: "SETTLEMENT_EXPIRED",
          reason: `Backlog migration: no final ${c.league} game for ${c.team} within ${windowDays}d window`,
          metadata: { league: c.league, team: c.team, window_days: windowDays, migration: true },
        });
        expired++;
      }
    }
    if (scanned % BACKLOG_CHUNK === 0) await yieldToLoop();
  }

  // ── Step 2: flag stale outcomes in pipeline.db (kept, not deleted) ───────
  // A null-game signal whose matched game is more than its league window past
  // the signal's creation is a bad match. UPDATE…FROM joins the signal in.
  const staleUpdate = db.prepare(`
    UPDATE outcomes
    SET excluded_stale = 1
    FROM live_signals AS s
    WHERE s.id = outcomes.signal_id
      AND outcomes.excluded_stale = 0
      AND s.game_id IS NULL
      AND EXISTS (
        SELECT 1 FROM games g
        WHERE g.id = outcomes.game_id
          AND julianday(g.game_time) - julianday(s.created_at) >
              (CASE s.league
                 WHEN 'MLB' THEN 2 WHEN 'NBA' THEN 3
                 WHEN 'NFL' THEN 8 WHEN 'CFB' THEN 8 ELSE 8 END)
      )
  `).run();
  const staleFlagged = staleUpdate.changes;
  await yieldToLoop();

  // ── Step 2b: mirror the flag into storage.db settled_outcomes ────────────
  const staleSignalIds = (db.prepare(
    "SELECT signal_id FROM outcomes WHERE excluded_stale = 1",
  ).all() as Array<{ signal_id: string }>).map((r) => r.signal_id);
  const staleMirrored = markSettledOutcomesStale(staleSignalIds);
  await yieldToLoop();

  // ── Step 3: force one recompute so exclusions take effect immediately ────
  forceAccuracyRecompute();

  console.log(
    `[settlement] Backlog migration: scanned=${scanned} expired=${expired} ` +
    `stale_flagged=${staleFlagged} stale_mirrored=${staleMirrored}`,
  );

  return {
    scanned,
    expired,
    stale_outcomes_flagged: staleFlagged,
    stale_outcomes_mirrored: staleMirrored,
  };
}
