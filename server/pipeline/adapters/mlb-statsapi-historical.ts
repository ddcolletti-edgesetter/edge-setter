/**
 * Edge Setter — MLB StatsAPI Historical Adapter
 *
 * Fetches completed MLB game results and IL transactions for 2025 and 2026 seasons.
 * Used exclusively by the backfill engine — not part of the live ingestion cycle.
 *
 * Source: https://statsapi.mlb.com/api/v1 (free, no key required)
 *
 * What's fetched:
 *   - Game scores (regular season + postseason) → pipeline games table
 *   - IL placements + activations → transaction/injury_update RawEvents
 *   - Probable pitchers per game → lineup_confirm RawEvents linked to game_id
 *
 * Date iteration: 30-day chunks to keep API response sizes manageable.
 *
 * Game IDs: canonical `MLB_{YYYY_MM_DD}_{AWAY}_{HOME}` (via canonical-game-id) —
 * consistent with the live mlb-statsapi and the-odds-api adapters, so backfilled
 * games land on the same unified row and match an odds row when one exists.
 * gamePk is retained in source_game_id for provenance.
 *
 * Settlement note:
 *   Historical games have no spread_line (MLB StatsAPI doesn't provide odds).
 *   Injury/lineup signals will produce hit=null outcomes unless historical spreads
 *   are added later via The Odds API historical endpoint.
 */

import {
  upsertHistoricalGame,
  updateGameFinal,
  findGameByTeams,
  insertRawEvent,
  getGame,
  markBackfillPhase,
  getBackfillPhase,
} from "../store";
import { canonicalGameId, mlbCanonicalTeamCode } from "../canonical-game-id";

const BASE_URL = "https://statsapi.mlb.com/api/v1";
const THROTTLE_MS = 300;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const MLB_SEASONS = {
  2025: { startDate: "2025-03-20", endDate: "2025-11-05" },
  2026: { startDate: "2026-03-26", endDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10) },
} as const;

export type MLBHistoricalSeason = keyof typeof MLB_SEASONS;

/* ─── MLB StatsAPI response types ───────────────────────── */

interface MLBGame {
  gamePk: number;
  gameDate: string;
  status: { abstractGameState: string };
  teams: {
    home: { team: { abbreviation: string }; score?: number };
    away: { team: { abbreviation: string }; score?: number };
  };
  linescore?: {
    teams?: {
      home?: { runs?: number };
      away?: { runs?: number };
    };
  };
}

interface MLBScheduleResponse {
  dates: Array<{ date: string; games: MLBGame[] }>;
}

interface MLBTransaction {
  id: number;
  person: { fullName: string };
  fromTeam?: { abbreviation: string };
  toTeam?: { abbreviation: string };
  team: { abbreviation: string };
  date: string;
  typeCode: string;
  typeDesc: string;
  description: string;
  effectiveDate: string;
}

/* ─── Build 30-day date chunks ───────────────────────────── */

function dateChunks(startDate: string, endDate: string, chunkDays = 30): Array<[string, string]> {
  const chunks: Array<[string, string]> = [];
  let cursor = new Date(startDate);
  const end = new Date(endDate);
  while (cursor <= end) {
    const chunkEnd = new Date(Math.min(cursor.getTime() + chunkDays * 86400000, end.getTime()));
    chunks.push([cursor.toISOString().slice(0, 10), chunkEnd.toISOString().slice(0, 10)]);
    cursor = new Date(chunkEnd.getTime() + 86400000);
  }
  return chunks;
}

/* ─── Fetch + process schedule chunk ────────────────────── */

async function fetchScheduleChunk(startDate: string, endDate: string): Promise<MLBGame[]> {
  try {
    const url = `${BASE_URL}/schedule?sportId=1&startDate=${startDate}&endDate=${endDate}`
      + `&hydrate=team,linescore,probablePitcher&gameType=R,F,D,L,W`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`[mlb-hist] HTTP ${resp.status} schedule ${startDate}–${endDate}`);
      return [];
    }
    const data = await resp.json() as MLBScheduleResponse;
    return data.dates.flatMap(d => d.games ?? []);
  } catch (err: any) {
    console.warn(`[mlb-hist] Schedule fetch error ${startDate}–${endDate}: ${err.message}`);
    return [];
  }
}

/* ─── Fetch + process transactions chunk ────────────────── */

async function fetchTransactionsChunk(startDate: string, endDate: string): Promise<MLBTransaction[]> {
  try {
    const url = `${BASE_URL}/transactions?sportId=1&startDate=${startDate}&endDate=${endDate}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`[mlb-hist] HTTP ${resp.status} transactions ${startDate}–${endDate}`);
      return [];
    }
    const data = await resp.json() as { transactions: MLBTransaction[] };
    return data.transactions ?? [];
  } catch (err: any) {
    console.warn(`[mlb-hist] Transactions fetch error ${startDate}–${endDate}: ${err.message}`);
    return [];
  }
}

/* ─── Process one game into the pipeline DB ──────────────── */

function processGame(game: MLBGame): { game_id: string | null; isNew: boolean } {
  const raw = game as any;
  // Canonical codes/id — consistent with the live adapter so historical backfill
  // lands on the same unified row (and matches an odds row when one exists).
  const homeCode = mlbCanonicalTeamCode(game.teams.home.team);
  const awayCode = mlbCanonicalTeamCode(game.teams.away.team);
  if (!homeCode || !awayCode) return { game_id: null, isNew: false };
  const gameDate = game.gameDate.slice(0, 10);
  const gameId = canonicalGameId("MLB", game.gameDate, awayCode, homeCode);

  const isFinal = game.status.abstractGameState === "Final";
  const homeRuns = raw.linescore?.teams?.home?.runs;
  const awayRuns = raw.linescore?.teams?.away?.runs;

  // If live pipeline already has this game, update score if final
  const existing = findGameByTeams("MLB", homeCode, awayCode, gameDate)
    ?? (getGame(gameId) ? { id: gameId } as any : null);

  if (existing) {
    if (isFinal && homeRuns != null && awayRuns != null) {
      updateGameFinal(existing.id, Number(homeRuns), Number(awayRuns));
    }
    return { game_id: existing.id, isNew: false };
  }

  upsertHistoricalGame({
    id: gameId,
    league: "MLB",
    home_team: homeCode,
    away_team: awayCode,
    game_time: game.gameDate,
    status: isFinal ? "final" : "scheduled",
    spread_line: null,
    spread_team: null,
    total_line: null,
    moneyline_home: null,
    moneyline_away: null,
    open_spread: null,
    open_total: null,
    home_score: isFinal && homeRuns != null ? Number(homeRuns) : null,
    away_score: isFinal && awayRuns != null ? Number(awayRuns) : null,
    source_game_id: String(game.gamePk),
  });

  // Probable pitcher lineup_confirm events
  const rawGame = game as any;
  for (const [side, teamAbbr] of [
    ["home", homeCode],
    ["away", awayCode],
  ] as [string, string][]) {
    const pitcher = rawGame.teams?.[side]?.probablePitcher?.fullName;
    if (!pitcher) continue;
    insertRawEvent(
      {
        source_id: "mlb_statsapi",
        source_type: "api",
        league: "MLB",
        game_id: gameId,
        team: teamAbbr,
        player: pitcher,
        event_type: "lineup_confirm",
        payload: {
          status: "confirmed starter",
          notes: `${pitcher} confirmed as starting pitcher for ${teamAbbr}.`,
          confidence: 90,
          confirmation: "Consensus",
          source_types: ["league_api"],
          source_labels: ["MLB StatsAPI"],
          source_count: 1,
          sources: [{ name: "MLB StatsAPI", type: "league_api" }],
          pitcher_matchup: true,
          game_time: game.gameDate,
          matchup: `${awayCode} @ ${homeCode}`,
        },
      },
      { eventTime: game.gameDate },
    );
  }

  return { game_id: gameId, isNew: true };
}

/* ─── Process IL transactions into RawEvents ─────────────── */

function processTransaction(tx: MLBTransaction): boolean {
  const relevant = tx.typeCode === "IL" || tx.typeCode === "ACT" || tx.typeCode === "DFA";
  if (!relevant) return false;

  const isActivation = tx.typeCode === "ACT";
  const team = (tx.toTeam ?? tx.team)?.abbreviation ?? "UNK";
  const designation = isActivation ? undefined
    : tx.description.toLowerCase().includes("60-day") ? "IL-60"
    : "IL-10";

  insertRawEvent(
    {
      source_id: "mlb_statsapi",
      source_type: "api",
      league: "MLB",
      game_id: null,
      team,
      player: tx.person.fullName,
      event_type: isActivation ? "transaction" : "injury_update",
      payload: {
        transaction_type: isActivation ? "IL activation" : `${designation} placement`,
        designation,
        notes: tx.description,
        confidence: 92,
        confirmation: "Consensus",
        source_types: ["league_api", "transaction"],
        source_labels: ["MLB StatsAPI"],
        source_count: 1,
        sources: [{ name: "MLB StatsAPI", type: "league_api" }],
        mlb_transaction_id: tx.id,
        effective_date: tx.effectiveDate,
      },
    },
    { eventTime: tx.effectiveDate || tx.date },
  );
  return true;
}

/* ─── Backfill one season ────────────────────────────────── */

export async function backfillMLBSeason(
  season: MLBHistoricalSeason,
): Promise<{ games: number; transactions: number; phasesSkipped: number }> {
  const cfg = MLB_SEASONS[season];
  let phasesSkipped = 0;
  let totalGames = 0;
  let totalTransactions = 0;

  // ── Games + probable pitchers ───────────────────────────
  const gamesPhase = "games";
  if (getBackfillPhase("MLB", String(season), gamesPhase)?.status === "done") {
    console.log(`[mlb-hist] MLB ${season} games already done — skipping`);
    phasesSkipped++;
  } else {
    markBackfillPhase("MLB", String(season), gamesPhase, "running");
    let count = 0;
    try {
      const chunks = dateChunks(cfg.startDate, cfg.endDate, 30);
      for (const [start, end] of chunks) {
        const games = await fetchScheduleChunk(start, end);
        for (const game of games) {
          const r = processGame(game);
          if (r.game_id) count++;
        }
        await sleep(THROTTLE_MS);
      }
      markBackfillPhase("MLB", String(season), gamesPhase, "done", { records: count });
      console.log(`[mlb-hist] MLB ${season} games: ${count}`);
    } catch (err: any) {
      markBackfillPhase("MLB", String(season), gamesPhase, "error", { error: err.message });
      console.error(`[mlb-hist] MLB ${season} games error:`, err.message);
    }
    totalGames += count;
  }

  // ── IL transactions ─────────────────────────────────────
  const txPhase = "transactions";
  if (getBackfillPhase("MLB", String(season), txPhase)?.status === "done") {
    console.log(`[mlb-hist] MLB ${season} transactions already done — skipping`);
    phasesSkipped++;
  } else {
    markBackfillPhase("MLB", String(season), txPhase, "running");
    let count = 0;
    try {
      const chunks = dateChunks(cfg.startDate, cfg.endDate, 30);
      for (const [start, end] of chunks) {
        const txns = await fetchTransactionsChunk(start, end);
        for (const tx of txns) {
          if (processTransaction(tx)) count++;
        }
        await sleep(THROTTLE_MS);
      }
      markBackfillPhase("MLB", String(season), txPhase, "done", { records: count });
      console.log(`[mlb-hist] MLB ${season} transactions: ${count}`);
    } catch (err: any) {
      markBackfillPhase("MLB", String(season), txPhase, "error", { error: err.message });
      console.error(`[mlb-hist] MLB ${season} transactions error:`, err.message);
    }
    totalTransactions += count;
  }

  return { games: totalGames, transactions: totalTransactions, phasesSkipped };
}
