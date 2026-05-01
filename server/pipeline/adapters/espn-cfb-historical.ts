/**
 * Edge Setter — ESPN CFB Historical Adapter
 *
 * Fetches completed FBS (D-I) college football game results for 2024 and 2025 seasons.
 * Used exclusively by the backfill engine — not part of the live ingestion cycle.
 *
 * Source: https://site.api.espn.com (free, no key required)
 *
 * Season structure:
 *   Regular season  → seasontype=2, weeks 0–16 (week 0 = kickoff games)
 *   Postseason      → seasontype=3, queried by date window (bowls + CFP)
 *     2024 CFP expanded to 12 teams — first round Dec 20–21, Natl. Championship Jan 20, 2025
 *     2025 CFP: similar structure, championship ~Jan 19, 2026
 *
 * Volume note:
 *   Up to 70+ FBS games per week → limit=200 required on scoreboard calls.
 *   Postseason uses 3-day date windows to capture all bowl games reliably.
 *
 * Game IDs:
 *   Existing live-pipeline games (matched by team + date): uses existing ID
 *   Net-new historical games: cfb_hist_{espnEventId}
 */

import {
  upsertHistoricalGame,
  updateGameFinal,
  findGameByTeams,
  markBackfillPhase,
  getBackfillPhase,
} from "../store";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football";
const THROTTLE_MS = 350;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const CFB_SEASONS = {
  // regular: weeks 0–16; postseason: date window [start, end] inclusive
  // End dates are 2 days after the championship game to ensure the final is captured
  2024: { regularWeeks: 16, postseasonStart: "20241214", postseasonEnd: "20250122" },
  2025: { regularWeeks: 16, postseasonStart: "20251213", postseasonEnd: "20260121" },
} as const;

export type CFBHistoricalSeason = keyof typeof CFB_SEASONS;

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

/* ─── Fetch scoreboard (week-based) ─────────────────────── */

async function fetchWeekGames(year: number, seasonType: 2 | 3, week: number): Promise<ESPNEvent[]> {
  try {
    // groups=80 restricts to FBS only; limit=200 handles high-volume weeks
    const url = `${ESPN_BASE}/scoreboard?groups=80&seasontype=${seasonType}&week=${week}&dates=${year}&limit=200`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`[espn-cfb-hist] HTTP ${resp.status} | year=${year} st=${seasonType} wk=${week}`);
      return [];
    }
    const data = await resp.json() as ESPNScoreboardResponse;
    return data.events ?? [];
  } catch (err: any) {
    console.warn(`[espn-cfb-hist] Fetch error year=${year} st=${seasonType} wk=${week}: ${err.message}`);
    return [];
  }
}

/* ─── Fetch scoreboard (date-based) for postseason ──────── */

async function fetchDateGames(dateYYYYMMDD: string): Promise<ESPNEvent[]> {
  try {
    const url = `${ESPN_BASE}/scoreboard?groups=80&dates=${dateYYYYMMDD}&limit=200`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`[espn-cfb-hist] HTTP ${resp.status} | date=${dateYYYYMMDD}`);
      return [];
    }
    const data = await resp.json() as ESPNScoreboardResponse;
    return data.events ?? [];
  } catch (err: any) {
    console.warn(`[espn-cfb-hist] Fetch error date=${dateYYYYMMDD}: ${err.message}`);
    return [];
  }
}

/* ─── Build date sequence for postseason window ──────────── */

function dateRange(startYYYYMMDD: string, endYYYYMMDD: string, stepDays = 3): string[] {
  const dates: string[] = [];
  let current = new Date(
    `${startYYYYMMDD.slice(0, 4)}-${startYYYYMMDD.slice(4, 6)}-${startYYYYMMDD.slice(6, 8)}`,
  );
  const end = new Date(
    `${endYYYYMMDD.slice(0, 4)}-${endYYYYMMDD.slice(4, 6)}-${endYYYYMMDD.slice(6, 8)}`,
  );
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10).replace(/-/g, ""));
    current = new Date(current.getTime() + stepDays * 86400000);
  }
  return dates;
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

  const existing = findGameByTeams("CFB", home.team.abbreviation, away.team.abbreviation, gameDate);
  if (existing) {
    updateGameFinal(existing.id, homeScore, awayScore);
    return true;
  }

  upsertHistoricalGame({
    id: `cfb_hist_${event.id}`,
    league: "CFB",
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

export async function backfillCFBSeason(
  season: CFBHistoricalSeason,
): Promise<{ games: number; phasesSkipped: number }> {
  const cfg = CFB_SEASONS[season];
  let games = 0;
  let phasesSkipped = 0;

  // ── Regular season (weeks 0–16) ──────────────────────────
  const regPhase = "games_regular";
  if (getBackfillPhase("CFB", String(season), regPhase)?.status === "done") {
    console.log(`[espn-cfb-hist] CFB ${season} regular season already done — skipping`);
    phasesSkipped++;
  } else {
    markBackfillPhase("CFB", String(season), regPhase, "running");
    let count = 0;
    try {
      // Week 0 exists in some seasons (early kickoff games); harmless if empty
      for (let week = 0; week <= cfg.regularWeeks; week++) {
        const events = await fetchWeekGames(season, 2, week);
        const seen = new Set<string>(); // deduplicate within week (ESPN can return dupes)
        for (const ev of events) {
          if (seen.has(ev.id)) continue;
          seen.add(ev.id);
          if (processEvent(ev)) count++;
        }
        await sleep(THROTTLE_MS);
      }
      markBackfillPhase("CFB", String(season), regPhase, "done", { records: count });
      console.log(`[espn-cfb-hist] CFB ${season} regular season: ${count} games`);
    } catch (err: any) {
      markBackfillPhase("CFB", String(season), regPhase, "error", { error: err.message });
      console.error(`[espn-cfb-hist] CFB ${season} regular season error:`, err.message);
    }
    games += count;
  }

  // ── Postseason (bowls + CFP, queried by 3-day date windows) ──
  const postPhase = "games_postseason";
  if (getBackfillPhase("CFB", String(season), postPhase)?.status === "done") {
    console.log(`[espn-cfb-hist] CFB ${season} postseason already done — skipping`);
    phasesSkipped++;
  } else {
    markBackfillPhase("CFB", String(season), postPhase, "running");
    let count = 0;
    try {
      const dates = dateRange(cfg.postseasonStart, cfg.postseasonEnd, 2);
      const seen = new Set<string>();
      for (const dateStr of dates) {
        const events = await fetchDateGames(dateStr);
        for (const ev of events) {
          if (seen.has(ev.id)) continue;
          seen.add(ev.id);
          if (processEvent(ev)) count++;
        }
        await sleep(THROTTLE_MS);
      }
      markBackfillPhase("CFB", String(season), postPhase, "done", { records: count });
      console.log(`[espn-cfb-hist] CFB ${season} postseason: ${count} games`);
    } catch (err: any) {
      markBackfillPhase("CFB", String(season), postPhase, "error", { error: err.message });
      console.error(`[espn-cfb-hist] CFB ${season} postseason error:`, err.message);
    }
    games += count;
  }

  return { games, phasesSkipped };
}
