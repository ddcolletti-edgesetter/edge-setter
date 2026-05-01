/**
 * Edge Setter — ESPN NFL Historical Adapter
 *
 * Fetches completed NFL game results for 2024 and 2025 seasons (regular + postseason).
 * Used exclusively by the backfill engine — not part of the live ingestion cycle.
 *
 * Source: https://site.api.espn.com (free, no key required)
 *
 * Season structure:
 *   Regular season  → seasontype=2, weeks 1–18
 *   Postseason      → seasontype=3, weeks 1–4
 *     Week 1: Wild Card  Week 2: Divisional
 *     Week 3: Conf. Championship  Week 4: Super Bowl
 *
 * Game IDs:
 *   Existing live-pipeline games (matched by team + date): uses existing ID
 *   Net-new historical games: nfl_hist_{espnEventId}
 */

import {
  upsertHistoricalGame,
  updateGameFinal,
  findGameByTeams,
  markBackfillPhase,
  getBackfillPhase,
} from "../store";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const THROTTLE_MS = 350;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const NFL_SEASONS = {
  2024: { regularWeeks: 18, postseasonWeeks: 4 },
  2025: { regularWeeks: 18, postseasonWeeks: 4 },
} as const;

export type NFLHistoricalSeason = keyof typeof NFL_SEASONS;

/* ─── ESPN response types ────────────────────────────────── */

interface ESPNCompetitor {
  homeAway: "home" | "away";
  score?: string;
  team: { abbreviation: string };
}

interface ESPNEvent {
  id: string;
  date: string;
  competitions?: Array<{
    status?: { type?: { completed?: boolean } };
    competitors?: ESPNCompetitor[];
  }>;
}

interface ESPNScoreboardResponse {
  events?: ESPNEvent[];
}

/* ─── Fetch a single week's games ────────────────────────── */

async function fetchWeekGames(year: number, seasonType: 2 | 3, week: number): Promise<ESPNEvent[]> {
  try {
    const url = `${ESPN_BASE}/scoreboard?seasontype=${seasonType}&week=${week}&dates=${year}&limit=50`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`[espn-nfl-hist] HTTP ${resp.status} | year=${year} st=${seasonType} wk=${week}`);
      return [];
    }
    const data = await resp.json() as ESPNScoreboardResponse;
    return data.events ?? [];
  } catch (err: any) {
    console.warn(`[espn-nfl-hist] Fetch error year=${year} st=${seasonType} wk=${week}: ${err.message}`);
    return [];
  }
}

/* ─── Process one ESPN event into the pipeline DB ─────────── */

function processEvent(event: ESPNEvent): boolean {
  const comp = event.competitions?.[0];
  if (!comp?.status?.type?.completed) return false;

  const home = comp.competitors?.find(c => c.homeAway === "home");
  const away = comp.competitors?.find(c => c.homeAway === "away");
  if (!home || !away) return false;

  const homeScore = Number(home.score ?? "0");
  const awayScore = Number(away.score ?? "0");
  if (isNaN(homeScore) || isNaN(awayScore)) return false;

  const gameDate = event.date.slice(0, 10);

  // If the live pipeline already has this game (matched by teams + date), update its score
  const existing = findGameByTeams("NFL", home.team.abbreviation, away.team.abbreviation, gameDate);
  if (existing) {
    updateGameFinal(existing.id, homeScore, awayScore);
    return true;
  }

  // Net-new historical record
  upsertHistoricalGame({
    id: `nfl_hist_${event.id}`,
    league: "NFL",
    home_team: home.team.abbreviation,
    away_team: away.team.abbreviation,
    game_time: event.date,
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
    source_game_id: event.id,
  });
  return true;
}

/* ─── Backfill one season ────────────────────────────────── */

export async function backfillNFLSeason(
  season: NFLHistoricalSeason,
): Promise<{ games: number; phasesSkipped: number }> {
  const cfg = NFL_SEASONS[season];
  let games = 0;
  let phasesSkipped = 0;

  // ── Regular season ──────────────────────────────────────
  const regPhase = "games_regular";
  if (getBackfillPhase("NFL", String(season), regPhase)?.status === "done") {
    console.log(`[espn-nfl-hist] NFL ${season} regular season already done — skipping`);
    phasesSkipped++;
  } else {
    markBackfillPhase("NFL", String(season), regPhase, "running");
    let count = 0;
    try {
      for (let week = 1; week <= cfg.regularWeeks; week++) {
        const events = await fetchWeekGames(season, 2, week);
        for (const ev of events) {
          if (processEvent(ev)) count++;
        }
        await sleep(THROTTLE_MS);
      }
      markBackfillPhase("NFL", String(season), regPhase, "done", { records: count });
      console.log(`[espn-nfl-hist] NFL ${season} regular season: ${count} games`);
    } catch (err: any) {
      markBackfillPhase("NFL", String(season), regPhase, "error", { error: err.message });
      console.error(`[espn-nfl-hist] NFL ${season} regular season error:`, err.message);
    }
    games += count;
  }

  // ── Postseason ──────────────────────────────────────────
  const postPhase = "games_postseason";
  if (getBackfillPhase("NFL", String(season), postPhase)?.status === "done") {
    console.log(`[espn-nfl-hist] NFL ${season} postseason already done — skipping`);
    phasesSkipped++;
  } else {
    markBackfillPhase("NFL", String(season), postPhase, "running");
    let count = 0;
    try {
      for (let week = 1; week <= cfg.postseasonWeeks; week++) {
        const events = await fetchWeekGames(season, 3, week);
        for (const ev of events) {
          if (processEvent(ev)) count++;
        }
        await sleep(THROTTLE_MS);
      }
      markBackfillPhase("NFL", String(season), postPhase, "done", { records: count });
      console.log(`[espn-nfl-hist] NFL ${season} postseason: ${count} games`);
    } catch (err: any) {
      markBackfillPhase("NFL", String(season), postPhase, "error", { error: err.message });
      console.error(`[espn-nfl-hist] NFL ${season} postseason error:`, err.message);
    }
    games += count;
  }

  return { games, phasesSkipped };
}
