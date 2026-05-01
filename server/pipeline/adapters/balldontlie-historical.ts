/**
 * Edge Setter — BallDontLie NBA Historical Adapter
 *
 * Fetches completed NBA game results for 2024-25 and 2025-26 seasons.
 * Used exclusively by the backfill engine — not part of the live ingestion cycle.
 *
 * Source: https://api.balldontlie.io/v1 (free tier, no key required for basic endpoints)
 * Env: BALLDONTLIE_API_KEY (optional — free tier works without)
 *
 * Pagination: cursor-based (meta.next_cursor — null when last page reached)
 *
 * Game IDs: nba_{bdlGameId} — matches the format used by fetchNBAFinalScores in the
 * live adapter, ensuring historical and live records share the same ID space.
 *
 * Limitation: BallDontLie free tier does not expose historical injury records by date.
 * Historical NBA backfill covers game scores only — no injury events are generated.
 */

import {
  upsertHistoricalGame,
  updateGameFinal,
  findGameByTeams,
  markBackfillPhase,
  getBackfillPhase,
} from "../store";

const BASE_URL = "https://api.balldontlie.io/v1";
const API_KEY  = process.env.BALLDONTLIE_API_KEY ?? "";
const THROTTLE_MS = 350;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const NBA_SEASONS = {
  "2024-25": { startDate: "2024-10-22", endDate: "2025-06-23" },
  "2025-26": { startDate: "2025-10-22", endDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10) },
} as const;

export type NBAHistoricalSeason = keyof typeof NBA_SEASONS;

/* ─── BallDontLie response types ─────────────────────────── */

interface BDLGame {
  id: number;
  date: string;         // YYYY-MM-DD
  status: string;       // "Final" | "1st Qtr" | etc.
  home_team: { abbreviation: string };
  visitor_team: { abbreviation: string };
  home_team_score: number;
  visitor_team_score: number;
}

interface BDLGamesResponse {
  data: BDLGame[];
  meta: {
    next_cursor: number | null;
    per_page: number;
  };
}

/* ─── Paginated fetch for a date range ───────────────────── */

async function fetchGamesPage(
  startDate: string,
  endDate: string,
  cursor?: number,
): Promise<BDLGamesResponse> {
  const headers: Record<string, string> = API_KEY ? { Authorization: API_KEY } : {};
  const cursorParam = cursor != null ? `&cursor=${cursor}` : "";
  const url = `${BASE_URL}/games?start_date=${startDate}&end_date=${endDate}&per_page=100${cursorParam}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    const msg = `[balldontlie-hist] HTTP ${resp.status} | ${startDate}–${endDate} cursor=${cursor ?? "start"}`;
    console.warn(msg);
    return { data: [], meta: { next_cursor: null, per_page: 100 } };
  }
  return await resp.json() as BDLGamesResponse;
}

/* ─── Process one BDL game into the pipeline DB ─────────── */

function processGame(game: BDLGame): boolean {
  if (game.status !== "Final") return false;

  const homeAbbr = game.home_team.abbreviation;
  const awayAbbr = game.visitor_team.abbreviation;
  const homeScore = game.home_team_score;
  const awayScore = game.visitor_team_score;

  // Check for existing record (live pipeline may have it for 2025-26 active season)
  const existing = findGameByTeams("NBA", homeAbbr, awayAbbr, game.date);
  if (existing) {
    updateGameFinal(existing.id, homeScore, awayScore);
    return true;
  }

  const gameId = `nba_${game.id}`;
  upsertHistoricalGame({
    id: gameId,
    league: "NBA",
    home_team: homeAbbr,
    away_team: awayAbbr,
    game_time: `${game.date}T00:00:00Z`,
    status: "final",
    spread_line: null,
    spread_team: null,
    total_line: null,
    moneyline_home: null,
    moneyline_away: null,
    open_spread: null,
    open_total: null,
    home_score: homeScore,
    away_score: awayScore,
    source_game_id: String(game.id),
  });
  return true;
}

/* ─── Backfill one season ────────────────────────────────── */

export async function backfillNBASeason(
  season: NBAHistoricalSeason,
): Promise<{ games: number; phasesSkipped: number }> {
  const cfg = NBA_SEASONS[season];
  let phasesSkipped = 0;

  const phase = "games";
  if (getBackfillPhase("NBA", season, phase)?.status === "done") {
    console.log(`[balldontlie-hist] NBA ${season} already done — skipping`);
    return { games: 0, phasesSkipped: 1 };
  }

  markBackfillPhase("NBA", season, phase, "running");
  let count = 0;

  try {
    let cursor: number | undefined = undefined;
    let page = 1;

    do {
      const resp = await fetchGamesPage(cfg.startDate, cfg.endDate, cursor);
      for (const game of resp.data) {
        if (processGame(game)) count++;
      }
      cursor = resp.meta.next_cursor ?? undefined;
      page++;
      await sleep(THROTTLE_MS);
    } while (cursor != null);

    markBackfillPhase("NBA", season, phase, "done", { records: count });
    console.log(`[balldontlie-hist] NBA ${season}: ${count} games across ${page - 1} pages`);
  } catch (err: any) {
    markBackfillPhase("NBA", season, phase, "error", { error: err.message });
    console.error(`[balldontlie-hist] NBA ${season} error:`, err.message);
  }

  return { games: count, phasesSkipped };
}
