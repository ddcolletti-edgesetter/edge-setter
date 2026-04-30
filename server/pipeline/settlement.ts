/**
 * Edge Setter — Outcome Settlement Engine
 *
 * Automatically settles signal outcomes once a game goes final.
 *
 * Hit determination per signal type:
 *
 *   line_move:      hit = clv > 0  (we captured a better number than the close).
 *                   This is the professional CLV definition — market validated
 *                   the sharp side we identified before the move completed.
 *
 *   injury_update   hit = the affected team underperformed vs the spread.
 *   lineup_change:  If signal.team == spread_team → underdog covered → hit = !favoriteCovers
 *                   If signal.team != spread_team → favorite covered → hit = favoriteCovers
 *
 *   weather_update: hit = game went under the total line (weather depresses scoring).
 *
 *   lineup_confirm: hit = confirmed team covered the spread.
 *
 *   All others:     hit = null (informational — not auto-settled).
 *
 * CLV formula (spread/total markets):
 *   clv = line_at_signal − closing_line
 *   Positive = we captured the better number before the market moved.
 *
 * Source accuracy:
 *   After settlement, aggregates hit rate + avg CLV by signal_type and by source_type
 *   across all settled outcomes for a league. Stored in the pipeline_source_accuracy
 *   table in pipeline.db and included in the /api/stats/track-record response.
 */

import { randomUUID } from "crypto";
import {
  getPipelineDb,
  getGame,
  updateGameFinal,
  getUnsettledSignalsForGame,
  getSettleable,
  getCompletedUnfinalGames,
  createOutcome,
  linkOutcomeToSignal,
} from "./store";
import { fetchMLBFinalScores } from "./adapters/mlb-statsapi";
import { fetchNBAFinalScores } from "./adapters/balldontlie";
import { fetchNFLFinalScores } from "./adapters/espn-nfl";
import { fetchCFBFinalScores } from "./adapters/espn-cfb";
import type { LiveSignal, Game } from "./types";

/* ─── Schema for source accuracy table ─────────────────── */

function ensureAccuracyTable(db: ReturnType<typeof getPipelineDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_source_accuracy (
      id            TEXT PRIMARY KEY,   -- "{league}|{signal_type|ALL}|{source_type|ALL}"
      league        TEXT NOT NULL,
      signal_type   TEXT,               -- NULL = overall league aggregate
      source_type   TEXT,               -- NULL = all source types
      total_signals INTEGER NOT NULL DEFAULT 0,
      wins          INTEGER NOT NULL DEFAULT 0,
      losses        INTEGER NOT NULL DEFAULT 0,
      hit_rate      REAL,
      avg_clv       REAL,
      computed_at   TEXT NOT NULL
    );
  `);
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

/**
 * Returns true if the team identified by spread_team covered the spread.
 * Returns null if we can't determine (missing line data).
 */
function favoriteCovers(game: Game, homeScore: number, awayScore: number): boolean | null {
  if (game.spread_line == null || !game.spread_team) return null;

  // Determine whether the spread_team is the home or away side
  // Use fuzzy match: accept partial abbreviation overlap
  const spreadAbbr = game.spread_team.toUpperCase();
  const homeAbbr   = game.home_team.toUpperCase();
  const isHomeFav  = homeAbbr === spreadAbbr
    || homeAbbr.includes(spreadAbbr)
    || spreadAbbr.includes(homeAbbr);

  const favScore = isHomeFav ? homeScore : awayScore;
  const dogScore = isHomeFav ? awayScore : homeScore;
  const actualMargin = favScore - dogScore;

  // Cover: actual margin beats spread (spread_line is negative for favorites)
  // e.g. spread_line=-5.5, actualMargin=7 → 7+(-5.5)=1.5>0 → COVER
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

    /* ── line_move: CLV model ── */
    case "line_move": {
      const lm = signal.line_movement;
      if (!lm || game.spread_line == null) return base;

      const lineAtSignal = lm.open;      // line when we first detected the move
      const closingLine  = game.spread_line; // current (final) spread in our DB
      const rawClv = lineAtSignal - closingLine;
      const clv = Math.min(20, Math.max(-20, Math.round(rawClv * 10) / 10));

      // hit = we captured the better number (CLV > 0)
      return {
        market: "spread",
        lineAtSignal,
        closingLine,
        clv,
        actualResult: homeScore - awayScore,
        hit: clv > 0,
      };
    }

    /* ── injury_update / lineup_change: bet AGAINST the affected team ── */
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

      // Injury/change on the fav → bet the underdog → hit = fav did NOT cover
      // Injury/change on the dog → bet the fav → hit = fav DID cover
      const hit = affectedTeamIsFav ? !favCovered : favCovered;

      return {
        market: "spread",
        lineAtSignal: signal.line_movement?.open ?? game.spread_line,
        closingLine: game.spread_line,
        clv: null,  // no CLV for non-line-move signals
        actualResult: homeScore - awayScore,
        hit,
      };
    }

    /* ── lineup_confirm: bet ON the confirmed team ── */
    case "lineup_confirm": {
      if (!signal.team || game.spread_line == null) return base;
      const favCovered = favoriteCovers(game, homeScore, awayScore);
      if (favCovered === null) return base;

      const spreadAbbr = (game.spread_team ?? "").toUpperCase();
      const signalAbbr = signal.team.toUpperCase();
      const confirmedTeamIsFav = spreadAbbr === signalAbbr
        || spreadAbbr.includes(signalAbbr)
        || signalAbbr.includes(spreadAbbr);

      // Confirmation on the fav → bet the fav → hit = fav covered
      // Confirmation on the dog → bet the dog → hit = fav did NOT cover
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

    /* ── weather_update: implies UNDER ── */
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

/**
 * Settle all unsettled betting_relevance signals for a game.
 * Idempotent: signals with outcome_id already set are skipped.
 */
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

  // Persist final scores
  updateGameFinal(gameId, homeScore, awayScore);

  const rawSignals = getUnsettledSignalsForGame(gameId);
  let settled = 0, skipped = 0, errors = 0;

  for (const raw of rawSignals) {
    try {
      const signal = deserializeSignal(raw);
      const result = settleSignal(signal, { ...game, home_score: homeScore, away_score: awayScore } as Game, homeScore, awayScore);

      // Write outcome row
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

      // Link back to signal
      linkOutcomeToSignal(signal.id, outcome.id);

      if (result.hit !== null) {
        settled++;
      } else {
        skipped++; // outcome written but hit is null (informational signal)
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
}

/**
 * 1. Fetch final scores from NBA + MLB APIs.
 * 2. Update game records with scores.
 * 3. Settle any signals tied to those games.
 * 4. Also settle any games already in DB with scores (re-entrant).
 */
export async function autoSettleFinishedGames(): Promise<AutoSettleResult> {
  const db = getPipelineDb();
  ensureAccuracyTable(db);

  // ── Fetch fresh scores ──────────────────────────────────
  const [mlbScores, nbaScores, nflScores, cfbScores] = await Promise.all([
    fetchMLBFinalScores().catch(() => []),
    fetchNBAFinalScores().catch(() => []),
    fetchNFLFinalScores().catch(() => []),
    fetchCFBFinalScores().catch(() => []),
  ]);

  let gamesUpdated = 0;
  const allScores = [...mlbScores, ...nbaScores, ...nflScores, ...cfbScores];

  for (const { game_id, home_score, away_score } of allScores) {
    const game = getGame(game_id);
    if (!game) continue; // game not in our DB — no signals to settle
    if (game.status === "final" && game.home_score != null) continue; // already finalized
    updateGameFinal(game_id, home_score, away_score);
    gamesUpdated++;
  }

  // ── Settle all games that now have scores ───────────────
  // (covers freshly updated + any previously finalized with unsettled signals)
  const settleable = getSettleable();
  let gamesSettled = 0, signalsSettled = 0;

  for (const game of settleable) {
    if (game.home_score == null || game.away_score == null) continue;
    const result = settleGame(game.id, game.home_score, game.away_score);
    if (result.settled > 0 || result.skipped > 0) gamesSettled++;
    signalsSettled += result.settled;
  }

  // ── Recompute accuracy stats ────────────────────────────
  if (signalsSettled > 0) {
    computeSourceAccuracy();
  }

  return {
    scores_fetched: { NBA: nbaScores.length, MLB: mlbScores.length, NFL: nflScores.length, CFB: cfbScores.length },
    games_updated: gamesUpdated,
    games_settled: gamesSettled,
    signals_settled: signalsSettled,
  };
}

/* ─── Source accuracy recomputation ──────────────────────── */

/**
 * Aggregate hit rate + avg CLV from settled outcomes.
 * Groups by:
 *   - league
 *   - signal_type (NULL = overall)
 *   - source_type (from sources JSON in live_signals; NULL = all)
 *
 * Results are stored in pipeline_source_accuracy for fast reads.
 */
export function computeSourceAccuracy(): void {
  const db = getPipelineDb();
  ensureAccuracyTable(db);

  const leagues = ["NBA", "MLB", "NFL", "CFB"];

  for (const league of leagues) {
    // ── Overall per league ──────────────────────────────
    const overall = db.prepare(`
      SELECT
        COUNT(*)                                              AS total,
        SUM(CASE WHEN o.hit = 1 THEN 1 ELSE 0 END)           AS wins,
        SUM(CASE WHEN o.hit = 0 THEN 1 ELSE 0 END)           AS losses,
        AVG(CASE WHEN o.clv IS NOT NULL THEN o.clv ELSE NULL END) AS avg_clv
      FROM outcomes o
      JOIN live_signals s ON s.id = o.signal_id
      WHERE s.league = ? AND o.hit IS NOT NULL
    `).get(league) as any;

    upsertAccuracy(db, league, null, null, overall);

    // ── Per signal_type ──────────────────────────────────
    const byType = db.prepare(`
      SELECT
        s.signal_type,
        COUNT(*)                                              AS total,
        SUM(CASE WHEN o.hit = 1 THEN 1 ELSE 0 END)           AS wins,
        SUM(CASE WHEN o.hit = 0 THEN 1 ELSE 0 END)           AS losses,
        AVG(CASE WHEN o.clv IS NOT NULL THEN o.clv ELSE NULL END) AS avg_clv
      FROM outcomes o
      JOIN live_signals s ON s.id = o.signal_id
      WHERE s.league = ? AND o.hit IS NOT NULL
      GROUP BY s.signal_type
    `).all(league) as any[];

    for (const row of byType) {
      upsertAccuracy(db, league, row.signal_type, null, row);
    }
  }

  console.log("[settlement] Source accuracy recomputed");
}

function upsertAccuracy(
  db: ReturnType<typeof getPipelineDb>,
  league: string,
  signalType: string | null,
  sourceType: string | null,
  row: { total: number; wins: number; losses: number; avg_clv: number | null },
) {
  // Deterministic PK so ON CONFLICT works even when signalType/sourceType are NULL
  const id = `${league}|${signalType ?? "ALL"}|${sourceType ?? "ALL"}`;
  const total  = row.total ?? 0;
  const wins   = row.wins  ?? 0;
  const losses = row.losses ?? 0;
  const hitRate = total > 0 ? Math.round((wins / total) * 1000) / 1000 : null;
  const avgClv  = row.avg_clv != null ? Math.round(row.avg_clv * 100) / 100 : null;

  db.prepare(`
    INSERT INTO pipeline_source_accuracy
      (id, league, signal_type, source_type, total_signals, wins, losses, hit_rate, avg_clv, computed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      total_signals = excluded.total_signals,
      wins          = excluded.wins,
      losses        = excluded.losses,
      hit_rate      = excluded.hit_rate,
      avg_clv       = excluded.avg_clv,
      computed_at   = excluded.computed_at
  `).run(
    id, league, signalType, sourceType,
    total, wins, losses, hitRate, avgClv,
    new Date().toISOString(),
  );
}
