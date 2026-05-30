/**
 * Edge Setter - ESPN NFL Adapter
 *
 * Source: https://site.api.espn.com (free, no key required)
 * Provides: NFL injury reports, final game scores
 */

import { insertRawEvent, getRawEvents, findGameByTeams } from "../store";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const CURRENT_INJURY_MAX_AGE_DAYS = 21;
let lastInjuryFetchReachable = false;

interface ESPNTeamRef {
  abbreviation?: string;
  displayName?: string;
}

interface ESPNInjuryEntry {
  athlete?: {
    displayName?: string;
    position?: { abbreviation?: string };
    team?: ESPNTeamRef;
  };
  team?: ESPNTeamRef;
  status?: string;
  shortComment?: string;
  longComment?: string;
  date?: string;
  type?: { description?: string; abbreviation?: string };
  details?: { type?: string; location?: string; detail?: string };
}

interface ESPNInjuryGroup {
  team?: ESPNTeamRef;
  abbreviation?: string;
  displayName?: string;
  injuries?: ESPNInjuryEntry[];
}

interface ESPNInjuryResponse {
  injuries?: Array<ESPNInjuryEntry | ESPNInjuryGroup>;
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
      type?: { completed?: boolean; description?: string };
    };
    competitors?: ESPNCompetitor[];
  }>;
}

interface ESPNScoreboardResponse {
  events?: ESPNEvent[];
}

export interface ESPNInjuryDiagnostics {
  source_reachable: boolean;
  payload_rows_seen: number;
  rows_normalized: number;
  rows_skipped_stale: number;
  rows_skipped_missing_required: number;
  rows_skipped_non_impactful_status: number;
  raw_events_created: number;
}

function normalizeDesignation(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("physically unable")) return "PUP";
  if (s.includes("injured reserve")) return "IR";
  if (s.includes("out")) return "OUT";
  if (s.includes("doubtful")) return "Doubtful";
  if (s.includes("questionable")) return "Questionable";
  if (s.includes("probable")) return "Probable";
  return status || "Active";
}

export function normalizeESPNNFLInjuryRows(rows: ESPNInjuryResponse["injuries"] = []): ESPNInjuryEntry[] {
  const normalized: ESPNInjuryEntry[] = [];
  for (const row of rows) {
    if (Array.isArray((row as ESPNInjuryGroup).injuries)) {
      const group = row as ESPNInjuryGroup;
      const groupTeam = group.team ?? {
        abbreviation: group.abbreviation,
        displayName: group.displayName,
      };
      for (const injury of group.injuries ?? []) {
        normalized.push({
          ...injury,
          team: injury.team ?? injury.athlete?.team ?? groupTeam,
        });
      }
      continue;
    }

    const entry = row as ESPNInjuryEntry;
    normalized.push({
      ...entry,
      team: entry.team ?? entry.athlete?.team,
    });
  }
  return normalized;
}

export function isCurrentESPNRow(date: string | undefined, maxAgeDays = CURRENT_INJURY_MAX_AGE_DAYS, now = new Date()): boolean {
  if (!date) return false;
  const time = Date.parse(date);
  if (!Number.isFinite(time)) return false;
  const ageMs = now.getTime() - time;
  return ageMs >= 0 && ageMs <= maxAgeDays * 24 * 60 * 60 * 1000;
}

export function isSignalWorthyNFLInjuryStatus(status: string | undefined): boolean {
  const designation = normalizeDesignation(status ?? "");
  return ["OUT", "IR", "PUP", "Doubtful", "Questionable"].includes(designation);
}

export async function fetchNFLInjuries(): Promise<ESPNInjuryEntry[]> {
  try {
    const resp = await fetch(`${ESPN_BASE}/injuries`);
    if (!resp.ok) {
      lastInjuryFetchReachable = false;
      console.error(`[espn-nfl] HTTP ${resp.status} fetching injuries`);
      return [];
    }
    lastInjuryFetchReachable = true;
    const data = await resp.json() as ESPNInjuryResponse;
    return normalizeESPNNFLInjuryRows(data.injuries);
  } catch (err: any) {
    lastInjuryFetchReachable = false;
    console.error("[espn-nfl] Injury fetch error:", err.message);
    return [];
  }
}

export async function ingestNFLInjuries(): Promise<{ created: number; skipped: number; diagnostics: ESPNInjuryDiagnostics }> {
  const injuries = await fetchNFLInjuries();
  let created = 0;
  let skipped = 0;
  const diagnostics: ESPNInjuryDiagnostics = {
    source_reachable: lastInjuryFetchReachable,
    payload_rows_seen: injuries.length,
    rows_normalized: injuries.length,
    rows_skipped_stale: 0,
    rows_skipped_missing_required: 0,
    rows_skipped_non_impactful_status: 0,
    raw_events_created: 0,
  };

  const recentEvents = getRawEvents({ league: "NFL", limit: 1000 });
  const existingKeys = new Set(
    recentEvents
      .filter(e => e.event_type === "injury_update")
      .map(e => `${e.player}_${(e.payload as any).designation}_${String((e.payload as any).occurred_at ?? "").slice(0, 10)}`)
  );

  for (const inj of injuries) {
    const playerName = inj.athlete?.displayName;
    const eventDate = inj.date;
    if (!playerName) {
      diagnostics.rows_skipped_missing_required++;
      skipped++;
      continue;
    }
    if (!isCurrentESPNRow(eventDate)) {
      diagnostics.rows_skipped_stale++;
      skipped++;
      continue;
    }

    const team = inj.team?.abbreviation ?? inj.athlete?.team?.abbreviation ?? "UNK";
    const rawStatus = inj.status ?? inj.type?.description ?? "";
    const designation = normalizeDesignation(rawStatus);
    if (!isSignalWorthyNFLInjuryStatus(rawStatus)) {
      diagnostics.rows_skipped_non_impactful_status++;
      skipped++;
      continue;
    }
    const position = inj.athlete?.position?.abbreviation ?? "";
    const bodyPart = inj.details?.type ?? inj.details?.location ?? "undisclosed";
    const key = `${playerName}_${designation}_${eventDate?.slice(0, 10) ?? ""}`;

    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }

    const isHighImpact = ["OUT", "IR", "PUP", "Doubtful"].includes(designation);
    const confidence = isHighImpact ? 84 : 62;
    const notes = inj.longComment ?? inj.shortComment ?? `${playerName} (${team}) listed ${designation}.`;

    insertRawEvent({
      source_id: "espn",
      source_type: "api",
      league: "NFL",
      game_id: null,
      team,
      player: playerName,
      event_type: "injury_update",
      payload: {
        designation,
        status: rawStatus,
        position,
        body_part: bodyPart,
        occurred_at: eventDate,
        event_time: eventDate,
        notes,
        confidence,
        confirmation: isHighImpact ? "Corroborated" : "Developing",
        source_types: ["sports_api"],
        source_labels: ["ESPN NFL"],
        source_count: 1,
        sources: [{ name: "ESPN NFL", type: "sports_api" }],
      },
    }, { eventTime: eventDate });

    created++;
    diagnostics.raw_events_created++;
    existingKeys.add(key);
  }

  console.log(`[espn-nfl] NFL injuries diagnostics: ${JSON.stringify(diagnostics)}`);
  return { created, skipped, diagnostics };
}

/**
 * Fetches the current-week NFL scoreboard from ESPN and resolves
 * completed games to their canonical game_id in our DB.
 */
export async function fetchNFLFinalScores(): Promise<Array<{
  game_id: string;
  home_score: number;
  away_score: number;
}>> {
  try {
    const resp = await fetch(`${ESPN_BASE}/scoreboard`);
    if (!resp.ok) { console.error(`[espn-nfl] HTTP ${resp.status} scoreboard`); return []; }
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
      const game = findGameByTeams("NFL", home.team.abbreviation, away.team.abbreviation, gameDate);
      if (!game) continue;

      results.push({ game_id: game.id, home_score: homeScore, away_score: awayScore });
    }

    return results;
  } catch (err: any) {
    console.error("[espn-nfl] Final scores error:", err.message);
    return [];
  }
}
