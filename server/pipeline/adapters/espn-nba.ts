/**
 * Edge Setter — ESPN NBA Adapter
 *
 * Source: https://site.api.espn.com  (free, no key required)
 * Provides: NBA injury reports, final game scores
 *
 * Mirrors espn-nfl.ts — same ESPN API shape, different sport path.
 */

import { insertRawEvent, getRawEvents, findGameByTeams } from "../store";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";

/* ─── Types ───────────────────────────────────────────────── */

interface ESPNInjuryEntry {
  athlete?: {
    displayName?: string;
    position?: { abbreviation?: string };
  };
  team?: { abbreviation?: string; displayName?: string };
  status?: string;
  shortComment?: string;
  longComment?: string;
}

interface ESPNInjuryResponse {
  injuries?: ESPNInjuryEntry[];
}

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

/* ─── Normalize designation ───────────────────────────────── */

function normalizeDesignation(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("out"))          return "OUT";
  if (s.includes("day-to-day"))   return "Questionable";
  if (s.includes("questionable")) return "Questionable";
  if (s.includes("doubtful"))     return "Doubtful";
  if (s.includes("probable"))     return "Probable";
  return status;
}

/* ─── Fetch injuries ──────────────────────────────────────── */

export async function fetchNBAInjuries(): Promise<ESPNInjuryEntry[]> {
  try {
    const resp = await fetch(`${ESPN_BASE}/injuries`);
    if (!resp.ok) {
      console.error(`[espn-nba] HTTP ${resp.status} fetching injuries`);
      return [];
    }
    const data = await resp.json() as ESPNInjuryResponse;
    return data.injuries ?? [];
  } catch (err: any) {
    console.error("[espn-nba] Injury fetch error:", err.message);
    return [];
  }
}

/* ─── Ingest NBA injuries ─────────────────────────────────── */

export async function ingestNBAInjuries(): Promise<{ created: number; skipped: number }> {
  const injuries = await fetchNBAInjuries();
  let created = 0;
  let skipped = 0;

  const recentEvents = getRawEvents({ league: "NBA", processed: false, limit: 500 });
  const existingKeys = new Set(
    recentEvents
      .filter(e => e.event_type === "injury_update")
      .map(e => `${e.player}_${(e.payload as any).designation}`)
  );

  for (const inj of injuries) {
    const playerName = inj.athlete?.displayName;
    if (!playerName) continue;

    const team        = inj.team?.abbreviation ?? "UNK";
    const rawStatus   = inj.status ?? "";
    const designation = normalizeDesignation(rawStatus);
    const position    = inj.athlete?.position?.abbreviation ?? "";
    const bodyPart    = inj.shortComment ?? inj.longComment ?? "undisclosed";
    const key         = `${playerName}_${designation}`;

    if (existingKeys.has(key)) { skipped++; continue; }

    const isHighImpact = ["OUT", "Doubtful"].includes(designation);
    const confidence   = isHighImpact ? 88 : 68;

    insertRawEvent({
      source_id:   "espn",
      source_type: "api",
      league:      "NBA",
      game_id:     null,
      team,
      player:      playerName,
      event_type:  "injury_update",
      payload: {
        designation,
        status:       rawStatus,
        position,
        body_part:    bodyPart,
        notes:        inj.longComment ?? `${playerName} (${team}) listed ${designation}${bodyPart !== "undisclosed" ? ` — ${bodyPart}` : ""}.`,
        confidence,
        confirmation: isHighImpact ? "Corroborated" : "Developing",
        source_types:  ["official report"],
        source_labels: ["ESPN / NBA Official"],
        source_count:  1,
        sources:       [{ name: "ESPN", type: "official report" }],
      },
    });

    created++;
    existingKeys.add(key);
  }

  console.log(`[espn-nba] NBA injuries: ${created} created, ${skipped} skipped`);
  return { created, skipped };
}

/* ─── Fetch final scores ──────────────────────────────────── */

export async function fetchNBAFinalScores(): Promise<Array<{
  game_id: string;
  home_score: number;
  away_score: number;
}>> {
  try {
    const resp = await fetch(`${ESPN_BASE}/scoreboard`);
    if (!resp.ok) { console.error(`[espn-nba] HTTP ${resp.status} scoreboard`); return []; }
    const data = await resp.json() as ESPNScoreboardResponse;

    const results: Array<{ game_id: string; home_score: number; away_score: number }> = [];

    for (const event of data.events ?? []) {
      const comp = event.competitions?.[0];
      if (!comp?.status?.type?.completed) continue;

      const home = comp.competitors?.find(c => c.homeAway === "home");
      const away = comp.competitors?.find(c => c.homeAway === "away");
      if (!home || !away) continue;

      const homeScore = Number(home.score ?? "0");
      const awayScore = Number(away.score ?? "0");
      if (isNaN(homeScore) || isNaN(awayScore)) continue;

      const gameDate = event.date.slice(0, 10);
      const game = findGameByTeams("NBA", home.team.abbreviation, away.team.abbreviation, gameDate);
      if (!game) continue;

      results.push({ game_id: game.id, home_score: homeScore, away_score: awayScore });
    }

    return results;
  } catch (err: any) {
    console.error("[espn-nba] Final scores error:", err.message);
    return [];
  }
}
