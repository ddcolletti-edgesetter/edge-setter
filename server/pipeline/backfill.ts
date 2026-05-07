/**
 * Edge Setter — Historical Backfill Engine
 *
 * Orchestrates the full historical data backfill across all four sports.
 * Re-entrant: completed phases are skipped based on the backfill_progress table.
 * Safe to call multiple times — will pick up where it left off.
 *
 * Execution order:
 *   1. NFL 2024 + 2025  (ESPN scoreboard, regular + postseason)
 *   2. CFB 2024 + 2025  (ESPN scoreboard, regular + bowls/CFP)
 *   3. NBA 2024-25 + 2025-26  (BallDontLie paginated games)
 *   4. MLB 2025 + 2026  (MLB StatsAPI schedule + transactions)
 *   5. processRawEvents()  — convert all RawEvents → LiveSignals
 *   6. settleHistoricalGames()  — settle all final-score games against signals
 *   7. computeSourceAccuracy()  — populate accuracy ledger
 *
 * Settlement in step 6 is lightweight: it reads scores already in the DB
 * rather than calling live external APIs.
 */

import { backfillNFLSeason } from "./adapters/espn-nfl-historical";
import { backfillCFBSeason } from "./adapters/espn-cfb-historical";
import { backfillNBASeason } from "./adapters/balldontlie-historical";
import { backfillMLBSeason } from "./adapters/mlb-statsapi-historical";
import { processRawEvents } from "./processor";
import { settleGame, computeSourceAccuracy, syncAccuracyToStorageDb } from "./settlement";
import { getSettleable, getAllBackfillProgress, resetBackfillPhases } from "./store";
import type { BackfillPhase } from "./store";

export type { BackfillPhase };

/* ─── Options ────────────────────────────────────────────── */

export interface BackfillOptions {
  nfl?: { seasons?: (2024 | 2025)[] };
  cfb?: { seasons?: (2024 | 2025)[] };
  nba?: { seasons?: ("2024-25" | "2025-26")[] };
  mlb?: { seasons?: (2025 | 2026)[] };
  skipProcessing?: boolean;   // skip processRawEvents (useful for game-only runs)
  skipSettlement?: boolean;   // skip settlement (useful for ingestion-only runs)
  resetPhases?: string[];     // league names to clear before running, e.g. ["MLB"]
}

export interface BackfillSummary {
  started_at: string;
  completed_at: string;
  nfl: { games: number };
  cfb: { games: number };
  nba: { games: number };
  mlb: { games: number; transactions: number };
  processing: { processed: number; errors: number } | null;
  settlement: { games_settled: number; signals_settled: number } | null;
  accuracy_recomputed: boolean;
  errors: string[];
}

/* ─── Settlement helper (no external API calls) ─────────── */

function settleHistoricalGames(): { games_settled: number; signals_settled: number } {
  const settleable = getSettleable();
  let games_settled = 0;
  let signals_settled = 0;
  for (const game of settleable) {
    if (game.home_score == null || game.away_score == null) continue;
    const result = settleGame(game.id, game.home_score, game.away_score);
    if (result.settled > 0 || result.skipped > 0) games_settled++;
    signals_settled += result.settled;
  }
  return { games_settled, signals_settled };
}

/* ─── Main orchestrator ──────────────────────────────────── */

export async function runFullBackfill(options: BackfillOptions = {}): Promise<BackfillSummary> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];

  const nflSeasons = options.nfl?.seasons ?? [2024, 2025];
  const cfbSeasons = options.cfb?.seasons ?? [2024, 2025];
  const nbaSeasons = options.nba?.seasons ?? ["2024-25", "2025-26"];
  const mlbSeasons = options.mlb?.seasons ?? [2025, 2026];

  const nflResult = { games: 0 };
  const cfbResult = { games: 0 };
  const nbaResult = { games: 0 };
  const mlbResult = { games: 0, transactions: 0 };

  const reset = (options.resetPhases ?? []).map(l => l.toUpperCase());

  // ── NFL ────────────────────────────────────────────────
  if (reset.includes("NFL")) resetBackfillPhases("NFL");
  console.log("[backfill] Starting NFL backfill...");
  for (const season of nflSeasons) {
    try {
      const r = await backfillNFLSeason(season);
      nflResult.games += r.games;
      console.log(`[backfill] NFL ${season}: +${r.games} games`);
    } catch (err: any) {
      const msg = `NFL ${season}: ${err.message}`;
      console.error(`[backfill] Error — ${msg}`);
      errors.push(msg);
    }
  }

  // ── CFB ────────────────────────────────────────────────
  if (reset.includes("CFB")) resetBackfillPhases("CFB");
  console.log("[backfill] Starting CFB backfill...");
  for (const season of cfbSeasons) {
    try {
      const r = await backfillCFBSeason(season);
      cfbResult.games += r.games;
      console.log(`[backfill] CFB ${season}: +${r.games} games`);
    } catch (err: any) {
      const msg = `CFB ${season}: ${err.message}`;
      console.error(`[backfill] Error — ${msg}`);
      errors.push(msg);
    }
  }

  // ── NBA ────────────────────────────────────────────────
  if (reset.includes("NBA")) resetBackfillPhases("NBA");
  console.log("[backfill] Starting NBA backfill...");
  for (const season of nbaSeasons) {
    try {
      const r = await backfillNBASeason(season);
      nbaResult.games += r.games;
      console.log(`[backfill] NBA ${season}: +${r.games} games`);
    } catch (err: any) {
      const msg = `NBA ${season}: ${err.message}`;
      console.error(`[backfill] Error — ${msg}`);
      errors.push(msg);
    }
  }

  // ── MLB ────────────────────────────────────────────────
  if (reset.includes("MLB")) resetBackfillPhases("MLB");
  console.log("[backfill] Starting MLB backfill...");
  for (const season of mlbSeasons) {
    try {
      const r = await backfillMLBSeason(season);
      mlbResult.games += r.games;
      mlbResult.transactions += r.transactions;
      console.log(`[backfill] MLB ${season}: +${r.games} games, +${r.transactions} transactions`);
    } catch (err: any) {
      const msg = `MLB ${season}: ${err.message}`;
      console.error(`[backfill] Error — ${msg}`);
      errors.push(msg);
    }
  }

  // ── Process RawEvents → LiveSignals ────────────────────
  let processingResult: BackfillSummary["processing"] = null;
  if (!options.skipProcessing) {
    console.log("[backfill] Processing RawEvents → LiveSignals...");
    try {
      processingResult = await processRawEvents();
      console.log(`[backfill] Processed: ${processingResult.processed} signals, ${processingResult.errors} errors`);
    } catch (err: any) {
      const msg = `processRawEvents: ${err.message}`;
      console.error(`[backfill] Error — ${msg}`);
      errors.push(msg);
    }
  }

  // ── Settle historical games ─────────────────────────────
  let settlementResult: BackfillSummary["settlement"] = null;
  if (!options.skipSettlement) {
    console.log("[backfill] Settling historical games...");
    try {
      settlementResult = settleHistoricalGames();
      console.log(`[backfill] Settlement: ${settlementResult.games_settled} games, ${settlementResult.signals_settled} signals`);
    } catch (err: any) {
      const msg = `settlement: ${err.message}`;
      console.error(`[backfill] Error — ${msg}`);
      errors.push(msg);
    }
  }

  // ── Recompute accuracy ledger ───────────────────────────
  let accuracyRecomputed = false;
  if (!options.skipSettlement) {
    try {
      computeSourceAccuracy();
      syncAccuracyToStorageDb();
      accuracyRecomputed = true;
      console.log("[backfill] Accuracy ledger recomputed and synced to storage.db");
    } catch (err: any) {
      const msg = `computeSourceAccuracy: ${err.message}`;
      console.error(`[backfill] Error — ${msg}`);
      errors.push(msg);
    }
  }

  const completedAt = new Date().toISOString();
  console.log(`[backfill] Complete. Errors: ${errors.length}`);

  return {
    started_at: startedAt,
    completed_at: completedAt,
    nfl: nflResult,
    cfb: cfbResult,
    nba: nbaResult,
    mlb: mlbResult,
    processing: processingResult,
    settlement: settlementResult,
    accuracy_recomputed: accuracyRecomputed,
    errors,
  };
}

/* ─── Status query ───────────────────────────────────────── */

export function getBackfillStatus(): BackfillPhase[] {
  return getAllBackfillProgress();
}
