/**
 * Edge Setter — MLB Stats API Adapter  (Sprint 7)
 *
 * Source: https://statsapi.mlb.com  (free, no key required)
 * Official MLB data: schedules, lineups, injuries, transactions
 *
 * Fetches:
 *   - Today's schedule (for game_id population)
 *   - Starting pitcher confirmations → lineup_confirm RawEvents
 *   - IL transactions → transaction RawEvents
 */

import { insertRawEvent, upsertGame, getGame } from "../store";

const BASE_URL = "https://statsapi.mlb.com/api/v1";

/* ─── Types ─────────────────────────────────────────────── */

interface MLBGame {
  gamePk: number;
  gameDate: string;         // ISO datetime
  status: { abstractGameState: string };
  teams: {
    home: { team: { id: number; name: string; abbreviation: string } };
    away: { team: { id: number; name: string; abbreviation: string } };
  };
  linescore?: unknown;
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
  typeCode: string;   // "IL" | "DFA" | "ASG" | "SGN" | etc.
  typeDesc: string;
  description: string;
  effectiveDate: string;
}

interface MLBRosterPlayer {
  person: { id: number; fullName: string };
  status: { description: string };
  parentTeamId?: number;
}

/* ─── Fetch today's schedule ─────────────────────────────── */

export async function fetchMLBSchedule(): Promise<MLBGame[]> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const url = `${BASE_URL}/schedule?sportId=1&date=${today}&hydrate=linescore,team`;
    const resp = await fetch(url);
    if (!resp.ok) { console.error(`[mlb-statsapi] HTTP ${resp.status} schedule`); return []; }
    const data = await resp.json() as MLBScheduleResponse;
    return data.dates.flatMap(d => d.games ?? []);
  } catch (err: any) {
    console.error("[mlb-statsapi] Schedule fetch error:", err.message);
    return [];
  }
}

/* ─── Ingest MLB games → Game table ─────────────────────── */

export async function ingestMLBSchedule(): Promise<{ games: number }> {
  const games = await fetchMLBSchedule();
  let count = 0;
  for (const g of games) {
    const gameId = `mlb_${g.gamePk}`;
    upsertGame({
      id: gameId,
      league: "MLB",
      home_team: g.teams.home.team.abbreviation,
      away_team: g.teams.away.team.abbreviation,
      game_time: g.gameDate,
      status: mapGameState(g.status.abstractGameState),
      spread_line: null,       // MLB StatsAPI doesn't provide odds — The Odds API does
      spread_team: null,
      total_line: null,
      moneyline_home: null,
      moneyline_away: null,
      open_spread: null,
      open_total: null,
      source_game_id: String(g.gamePk),
    });
    count++;
  }
  console.log(`[mlb-statsapi] Upserted ${count} games`);
  return { games: count };
}

function mapGameState(state: string): "scheduled" | "live" | "final" | "postponed" {
  const s = state.toLowerCase();
  if (s === "live")      return "live";
  if (s === "final")     return "final";
  if (s.includes("postponed")) return "postponed";
  return "scheduled";
}

/* ─── Fetch IL / transactions ────────────────────────────── */

export async function fetchMLBTransactions(days = 1): Promise<MLBTransaction[]> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const from  = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const url = `${BASE_URL}/transactions?sportId=1&startDate=${from}&endDate=${today}`;
    const resp = await fetch(url);
    if (!resp.ok) { console.error(`[mlb-statsapi] HTTP ${resp.status} transactions`); return []; }
    const data = await resp.json() as { transactions: MLBTransaction[] };
    return data.transactions ?? [];
  } catch (err: any) {
    console.error("[mlb-statsapi] Transactions fetch error:", err.message);
    return [];
  }
}

/* ─── Ingest MLB transactions → RawEvents ────────────────── */

export async function ingestMLBTransactions(): Promise<{ created: number }> {
  const txns = await fetchMLBTransactions(1);
  let created = 0;

  // Only care about IL placements and activations
  const relevant = txns.filter(t =>
    t.typeCode === "IL" || t.typeCode === "ACT" || t.typeCode === "DFA"
  );

  for (const tx of relevant) {
    const isActivation = tx.typeCode === "ACT";
    const team = (tx.toTeam ?? tx.team)?.abbreviation ?? "UNK";
    const designation = isActivation ? undefined
      : tx.description.toLowerCase().includes("60-day") ? "IL-60"
      : "IL-10";

    insertRawEvent({
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
        source_types: ["official report", "transaction"],
        source_labels: ["MLB StatsAPI (official)"],
        source_count: 1,
        sources: [{ name: "MLB StatsAPI", type: "official report" }],
        mlb_transaction_id: tx.id,
        effective_date: tx.effectiveDate,
      },
    });
    created++;
  }

  console.log(`[mlb-statsapi] MLB transactions: ${created} RawEvents created`);
  return { created };
}

/* ─── Fetch probable pitchers for today ─────────────────── */

export async function fetchProbablePitchers(): Promise<Array<{
  game_id: string;
  home_pitcher: string | null;
  away_pitcher: string | null;
}>> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const url = `${BASE_URL}/schedule?sportId=1&date=${today}&hydrate=probablePitcher`;
    const resp = await fetch(url);
    if (!resp.ok) { console.error(`[mlb-statsapi] HTTP ${resp.status} probable pitchers`); return []; }
    const data = await resp.json() as MLBScheduleResponse;
    const result: Array<{ game_id: string; home_pitcher: string | null; away_pitcher: string | null }> = [];
    for (const date of data.dates) {
      for (const game of date.games) {
        const g = game as any;
        result.push({
          game_id: `mlb_${g.gamePk}`,
          home_pitcher: g.teams?.home?.probablePitcher?.fullName ?? null,
          away_pitcher: g.teams?.away?.probablePitcher?.fullName ?? null,
        });
      }
    }
    return result;
  } catch (err: any) {
    console.error("[mlb-statsapi] Probable pitchers error:", err.message);
    return [];
  }
}

/* ─── Ingest probable pitcher confirmations ──────────────── */

export async function ingestProbablePitchers(): Promise<{ created: number }> {
  const pitchers = await fetchProbablePitchers();
  let created = 0;

  for (const p of pitchers) {
    const game = getGame(p.game_id);
    if (!game) continue;

    for (const [side, pitcher] of [[game.home_team, p.home_pitcher], [game.away_team, p.away_pitcher]] as [string, string | null][]) {
      if (!pitcher) continue;
      insertRawEvent({
        source_id: "mlb_statsapi",
        source_type: "api",
        league: "MLB",
        game_id: p.game_id,
        team: side,
        player: pitcher,
        event_type: "lineup_confirm",
        payload: {
          status: "confirmed starter",
          notes: `${pitcher} confirmed as starting pitcher for ${side}.`,
          confidence: 90,
          confirmation: "Consensus",
          source_types: ["official report"],
          source_labels: ["MLB StatsAPI (official)"],
          source_count: 1,
          sources: [{ name: "MLB StatsAPI", type: "official report" }],
          pitcher_matchup: true,
          game_time: game.game_time,
          matchup: `${game.away_team} @ ${game.home_team}`,
        },
      });
      created++;
    }
  }

  console.log(`[mlb-statsapi] Probable pitchers: ${created} RawEvents created`);
  return { created };
}

/* ─── Fetch final scores for recently completed games ────── */

export async function fetchMLBFinalScores(): Promise<Array<{
  game_id: string;
  home_score: number;
  away_score: number;
}>> {
  try {
    // Include yesterday + today to catch late-finishing games
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const url = `${BASE_URL}/schedule?sportId=1&startDate=${yesterday}&endDate=${today}&hydrate=linescore`;
    const resp = await fetch(url);
    if (!resp.ok) { console.error(`[mlb-statsapi] HTTP ${resp.status} final scores`); return []; }
    const data = await resp.json() as MLBScheduleResponse;
    const results: Array<{ game_id: string; home_score: number; away_score: number }> = [];
    for (const date of data.dates) {
      for (const g of date.games) {
        const raw = g as any;
        if (raw.status?.abstractGameState !== "Final") continue;
        const homeRuns = raw.linescore?.teams?.home?.runs;
        const awayRuns = raw.linescore?.teams?.away?.runs;
        if (homeRuns == null || awayRuns == null) continue;
        results.push({
          game_id: `mlb_${raw.gamePk}`,
          home_score: Number(homeRuns),
          away_score: Number(awayRuns),
        });
      }
    }
    return results;
  } catch (err: any) {
    console.error("[mlb-statsapi] Final scores error:", err.message);
    return [];
  }
}
