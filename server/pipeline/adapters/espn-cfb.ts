/**
 * Edge Setter - ESPN CFB Adapter
 *
 * Source: https://site.api.espn.com (free, no key required)
 * Provides: College Football injury reports, final game scores
 */

import { insertRawEvent, findGameByTeams, getPipelineDb } from "../store";
import { CFB_DISPLAY_TO_ABBR } from "../cfb-team-lookup";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football";
// Offseason: 75 days covers spring practice + transfer portal activity. Tighten for regular season via env var.
const CURRENT_INJURY_MAX_AGE_DAYS = Number(process.env.CFB_INJURY_MAX_AGE_DAYS || "75");
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
      type?: { completed?: boolean };
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
  /** Player already stored with this exact designation + team — ESPN's daily re-report. */
  rows_skipped_unchanged: number;
  raw_events_created: number;
}

function normalizeDesignation(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("out")) return "OUT";
  if (s.includes("doubtful")) return "Doubtful";
  if (s.includes("questionable")) return "Questionable";
  if (s.includes("probable")) return "Probable";
  return status || "Active";
}

export function normalizeESPNCFBInjuryRows(rows: ESPNInjuryResponse["injuries"] = []): ESPNInjuryEntry[] {
  const normalized: ESPNInjuryEntry[] = [];
  for (const row of rows) {
    if (Array.isArray((row as ESPNInjuryGroup).injuries)) {
      const group = row as ESPNInjuryGroup;
      const groupTeam = group.team ?? {
        abbreviation: group.abbreviation,
        displayName: group.displayName,
      };
      const resolvedAbbr = groupTeam.abbreviation
        ?? CFB_DISPLAY_TO_ABBR[groupTeam.displayName?.toLowerCase().trim() ?? ""];
      const teamWithAbbr = resolvedAbbr ? { ...groupTeam, abbreviation: resolvedAbbr } : groupTeam;
      for (const injury of group.injuries ?? []) {
        normalized.push({
          ...injury,
          team: injury.team ?? injury.athlete?.team ?? teamWithAbbr,
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

export function isCurrentESPNCFBRow(date: string | undefined, maxAgeDays = CURRENT_INJURY_MAX_AGE_DAYS, now = new Date()): boolean {
  if (!date) return false;
  const time = Date.parse(date);
  if (!Number.isFinite(time)) return false;
  const ageMs = now.getTime() - time;
  return ageMs >= 0 && ageMs <= maxAgeDays * 24 * 60 * 60 * 1000;
}

export function isSignalWorthyCFBInjuryStatus(status: string | undefined): boolean {
  const designation = normalizeDesignation(status ?? "");
  return ["OUT", "Doubtful", "Questionable"].includes(designation);
}

/**
 * Most recent ESPN CFB injury_update already stored for a player ON A TEAM.
 *
 * The team belongs in the WHERE, not in the comparison. Players share names
 * across programs constantly — far more often in college than in the pros —
 * and a name-only lookup hands each of them the other's row. The teams
 * differ, that reads as a change, and both write: not once a day but once per
 * poll, each forever re-triggering the other. Scoping the lookup to
 * (player, team) makes each listing dedup against its own history, and the
 * same scoping absorbs a team value that flaps (UNK → ALA → UNK).
 *
 * A genuine team change (a transfer) still writes, because the player has no
 * prior row under the new program — which is why designation alone is
 * compared here.
 *
 * The CFB twin of LATEST_NFL_INJURY_SQL, fixing the same two faults the NFL
 * adapter carried. ESPN re-publishes an UNCHANGED injury with a fresh `date`
 * each day, so a dedup key containing that date never matches the prior row
 * and mints a raw_event per listed player per day; on NFL that reached ~150/
 * day and 1,803 events on a single static IR listing, and it is what grew
 * situation_events to ~1.1GB. The key is now the player's CURRENT state:
 * skip when designation and team are both unchanged, whatever the date says.
 *
 * This also replaces the pre-#64 getRawEvents({ league: "CFB", limit: 1000 })
 * window, which read a thousand full rows and JSON.parsed every payload on
 * every cycle just to rebuild a key set — and whose 1,000-row ceiling let
 * older injuries fall out of the window and be re-created, the same 17-18
 * dupes/cycle NFL had.
 *
 * ORDER BY rowid DESC is a seek, not a sort: every SQLite index trails the
 * rowid, so idx_raw_events_source_player is really (source_id, player, rowid)
 * and the planner walks that player's slice backwards to the first match.
 * ORDER BY received_at DESC instead forces "USE TEMP B-TREE FOR ORDER BY",
 * sorting all of a player's rows with a json_extract over each payload. rowid
 * is also the honest "most recent": received_at on rows written before this
 * fix is ESPN's backdated report date. Nothing deletes from raw_events and
 * SQLite hands new rows max(rowid)+1, so insertion order cannot regress.
 *
 * INDEXED BY is deliberate — the planner's other candidate,
 * idx_raw_events_source_received(source_id, received_at), reaches one player's
 * row by walking every 'espn' row. Pinning it makes the plan a property of the
 * code and a loud error, not a silent scan, if the index is dropped.
 */
export const LATEST_CFB_INJURY_SQL = `SELECT json_extract(payload, '$.designation') AS designation
    FROM raw_events INDEXED BY idx_raw_events_source_player
    WHERE source_id = 'espn' AND player = ? AND team = ? AND league = 'CFB' AND event_type = 'injury_update'
    ORDER BY rowid DESC
    LIMIT 1`;

interface LatestCFBInjuryRow {
  designation: string | null;
}

export async function fetchCFBInjuries(): Promise<ESPNInjuryEntry[]> {
  try {
    const resp = await fetch(`${ESPN_BASE}/injuries`);
    if (!resp.ok) {
      lastInjuryFetchReachable = false;
      console.error(`[espn-cfb] HTTP ${resp.status} fetching injuries`);
      return [];
    }
    lastInjuryFetchReachable = true;
    const data = await resp.json() as ESPNInjuryResponse;
    return normalizeESPNCFBInjuryRows(data.injuries);
  } catch (err: any) {
    lastInjuryFetchReachable = false;
    console.error("[espn-cfb] Injury fetch error:", err.message);
    return [];
  }
}

export async function ingestCFBInjuries(): Promise<{ created: number; skipped: number; diagnostics: ESPNInjuryDiagnostics }> {
  const injuries = await fetchCFBInjuries();
  let created = 0;
  let skipped = 0;
  const diagnostics: ESPNInjuryDiagnostics = {
    source_reachable: lastInjuryFetchReachable,
    payload_rows_seen: injuries.length,
    rows_normalized: injuries.length,
    rows_skipped_stale: 0,
    rows_skipped_missing_required: 0,
    rows_skipped_non_impactful_status: 0,
    rows_skipped_unchanged: 0,
    raw_events_created: 0,
  };

  // One indexed lookup per row, prepared once and reused for the whole fetch.
  // See LATEST_CFB_INJURY_SQL for why this replaces the 1,000-row in-memory
  // window and why the key is state, not date.
  const db = getPipelineDb();
  const latestStmt = db.prepare(LATEST_CFB_INJURY_SQL);
  // Guard against duplicate rows within a single payload (same player twice in
  // one fetch), which the per-row DB lookup can't catch since neither is
  // inserted yet.
  const insertedThisRun = new Set<string>();

  for (const inj of injuries) {
    const playerName = inj.athlete?.displayName;
    const eventDate = inj.date;
    if (!playerName) {
      diagnostics.rows_skipped_missing_required++;
      skipped++;
      continue;
    }
    if (!isCurrentESPNCFBRow(eventDate)) {
      diagnostics.rows_skipped_stale++;
      skipped++;
      continue;
    }

    const team = inj.team?.abbreviation ?? inj.athlete?.team?.abbreviation ?? "UNK";
    const rawStatus = inj.status ?? inj.type?.description ?? "";
    const designation = normalizeDesignation(rawStatus);
    if (!isSignalWorthyCFBInjuryStatus(rawStatus)) {
      diagnostics.rows_skipped_non_impactful_status++;
      skipped++;
      continue;
    }
    const position = inj.athlete?.position?.abbreviation ?? "";
    const bodyPart = inj.details?.type ?? inj.details?.location ?? "undisclosed";
    const key = `${playerName}_${team}_${designation}`;

    // Unchanged state → ESPN is just re-listing a standing injury. Drop it.
    // The lookup is already scoped to this player on this team, so a missing
    // row means news (first sighting, or they transferred).
    const latest = latestStmt.get(playerName, team) as LatestCFBInjuryRow | undefined;
    const unchanged = latest !== undefined && latest.designation === designation;

    if (insertedThisRun.has(key) || unchanged) {
      diagnostics.rows_skipped_unchanged++;
      skipped++;
      continue;
    }

    const isHighImpact = designation === "OUT" || designation === "Doubtful";
    const confidence = isHighImpact ? 82 : 60;
    const notes = inj.longComment ?? inj.shortComment ?? `${playerName} (${team}) listed ${designation}.`;

    insertRawEvent({
      source_id: "espn",
      source_type: "api",
      league: "CFB",
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
        source_labels: ["ESPN CFB"],
        source_count: 1,
        sources: [{ name: "ESPN CFB", type: "sports_api" }],
      },
      // No { eventTime } override: received_at/created_at are wall-clock
      // ARRIVAL time. Passing ESPN's date here backdated received_at to the
      // report date, which is what the pipeline orders and ages rows by
      // (getUnprocessedRawEvents, freshness). ESPN's own timestamp is not
      // lost — it stays in payload.occurred_at/event_time, which is where
      // situations-adapter reads occurred_at from.
    });

    created++;
    diagnostics.raw_events_created++;
    insertedThisRun.add(key);
  }

  console.log(`[espn-cfb] CFB injuries diagnostics: ${JSON.stringify(diagnostics)}`);
  return { created, skipped, diagnostics };
}

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
