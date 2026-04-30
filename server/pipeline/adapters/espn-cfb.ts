/**
 * Edge Setter — ESPN CFB Adapter
 *
 * Source: https://site.api.espn.com  (free, no key required)
 * Provides: College Football injury reports, final game scores
 *
 * Fetches:
 *   - Active CFB injuries  → injury_update RawEvents
 *   - Completed game scores → used by the settlement engine
 *     (matched to our DB by team abbreviation + game date)
 *
 * Note: CFB season is Sep–Jan. Off-season calls return empty data
 * harmlessly. The ingestion scheduler season-guards these calls.
 */

import { insertRawEvent, getRawEvents, findGameByTeams } from "../store";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football";

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
    status?: {
      type?: { completed?: boolean };
    };
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
  if (s.includes("doubtful"))     return "Doubtful";
  if (s.includes("questionable")) return "Questionable";
  if (s.includes("probable"))     return "Probable";
  return status;
}

/* ─── Fetch injuries ──────────────────────────────────────── */

export async function fetchCFBInjuries(): Promise<ESPNInjuryEntry[]> {
  try {
    const resp = await fetch(`${ESPN_BASE}/injuries`);
    if (!resp.ok) {
      console.error(`[espn-cfb] HTTP ${resp.status} fetching injuries`);
      return [];
    }
    const data = await resp.json() as ESPNInjuryResponse;
    return data.injuries ?? [];
  } catch (err: any) {
    console.error("[espn-cfb] Injury fetch error:", err.message);
    return [];
  }
}

/* ─── Ingest CFB injuries ─────────────────────────────────── */

export async function ingestCFBInjuries(): Promise<{ created: number; skipped: number }> {
  const injuries = await fetchCFBInjuries();
  let created = 0;
  let skipped = 0;

  const recentEvents = getRawEvents({ league: "CFB", processed: false, limit: 500 });
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

    const isHighImpact = designation === "OUT" || designation === "Doubtful";
    const confidence   = isHighImpact ? 85 : 65;

    insertRawEvent({
      source_id:   "espn",
      source_type: "api",
      league:      "CFB",
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
        source_labels: ["ESPN / NCAA Official"],
        source_count:  1,
        sources:       [{ name: "ESPN", type: "official report" }],
      },
    });

    created++;
    existingKeys.add(key);
  }

  console.log(`[espn-cfb] CFB injuries: ${created} created, ${skipped} skipped`);
  return { created, skipped };
}

/* ─── Fetch final scores ──────────────────────────────────── */

/**
 * Fetches the current-week CFB scoreboard from ESPN and resolves
 * completed games to their canonical game_id in our DB.
 */
export async function fetchCFBFinalScores(): Promise<Array<{
  game_id: string;
  home_score: number;
  away_score: number;
}>> {
  try {
    // groups=80 filters to FBS (top division) only
    const resp = await fetch(`${ESPN_BASE}/scoreboard?groups=80`);
    if (!resp.ok) { console.error(`[espn-cfb] HTTP ${resp.status} scoreboard`); return []; }
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
      const game = findGameByTeams("CFB", home.team.abbreviation, away.team.abbreviation, gameDate);
      if (!game) continue;

      results.push({ game_id: game.id, home_score: homeScore, away_score: awayScore });
    }

    return results;
  } catch (err: any) {
    console.error("[espn-cfb] Final scores error:", err.message);
    return [];
  }
}
