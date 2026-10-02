/**
 * Edge Setter - ESPN NFL Adapter
 *
 * Source: https://site.api.espn.com (free, no key required)
 * Provides: NFL injury reports, final game scores
 */

import { insertRawEvent, findGameByTeams, getPipelineDb } from "../store";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
// Offseason: 75 days covers OTAs + mini-camp + draft weekend. Tighten to 21 for regular season via env var.
const CURRENT_INJURY_MAX_AGE_DAYS = Number(process.env.NFL_INJURY_MAX_AGE_DAYS || "75");
let lastInjuryFetchReachable = false;

const NFL_DISPLAY_TO_ABBR: Record<string, string> = {
  "arizona cardinals": "ARI", "atlanta falcons": "ATL", "baltimore ravens": "BAL",
  "buffalo bills": "BUF", "carolina panthers": "CAR", "chicago bears": "CHI",
  "cincinnati bengals": "CIN", "cleveland browns": "CLE", "dallas cowboys": "DAL",
  "denver broncos": "DEN", "detroit lions": "DET", "green bay packers": "GB",
  "houston texans": "HOU", "indianapolis colts": "IND", "jacksonville jaguars": "JAX",
  "kansas city chiefs": "KC", "las vegas raiders": "LV", "los angeles chargers": "LAC",
  "los angeles rams": "LAR", "miami dolphins": "MIA", "minnesota vikings": "MIN",
  "new england patriots": "NE", "new orleans saints": "NO", "new york giants": "NYG",
  "new york jets": "NYJ", "philadelphia eagles": "PHI", "pittsburgh steelers": "PIT",
  "san francisco 49ers": "SF", "seattle seahawks": "SEA", "tampa bay buccaneers": "TB",
  "tennessee titans": "TEN", "washington commanders": "WAS",
};

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
  /** Player already stored with this exact designation + team — ESPN's daily re-report. */
  rows_skipped_unchanged: number;
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
      const resolvedAbbr = groupTeam.abbreviation
        ?? NFL_DISPLAY_TO_ABBR[groupTeam.displayName?.toLowerCase().trim() ?? ""];
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

/**
 * Most recent ESPN NFL injury_update already stored for a player ON A TEAM.
 *
 * The team belongs in the WHERE, not in the comparison. Two players can share
 * a name on different teams — Josh Allen plays for BUF and for JAX — and a
 * name-only lookup hands each of them the other's row. The teams differ, that
 * reads as a change, and both write: not once a day but once per poll, each
 * forever re-triggering the other. Scoping the lookup to (player, team) makes
 * each listing dedup against its own history, and the same scoping absorbs a
 * team value that flaps (say UNK → BUF → UNK) instead of ping-ponging on it.
 *
 * A genuine team change still writes, because the player has no prior row
 * under the new team — which is why designation alone is compared here.
 *
 * ESPN re-publishes every listed player's UNCHANGED injury with a fresh
 * `date` every day, so any dedup key containing that date (the old key was
 * player + designation + first 10 chars of the date) can never match the
 * prior row: it mints one raw_event per listed player per day — ~150/day,
 * and before #64's per-poll fix, one per poll. sit_a412cf2fd624c10bb9d80810
 * (Chris Collier, IR, static all season) collected 1,803 raw events that way,
 * each fanning out into situation_event + snapshot rows. situation_events
 * reached ~1.1GB and took /api/v2/situations down.
 *
 * So the key is the player's CURRENT state rather than a date: compare
 * against their latest stored row and skip when the designation and team are
 * both unchanged, no matter what the date says. A designation change
 * (Questionable → OUT) or a team change is real news and still writes.
 *
 * Served by idx_raw_events_source_player(source_id, player), and ordered by
 * rowid DESC so it is a seek rather than a sort. Every SQLite index carries
 * the rowid as its trailing column, so this index is really
 * (source_id, player, rowid): the planner walks that player's slice backwards
 * and stops at the first match. ORDER BY received_at DESC instead forced
 * "USE TEMP B-TREE FOR ORDER BY" — loading and sorting ALL of the player's
 * rows and running json_extract over each payload, 1,803 of them for Chris
 * Collier, every poll for every listed player. Measured at Collier's row count
 * that is ~0.65ms vs ~0.026ms per lookup, and the gap widens with real payload
 * sizes.
 *
 * rowid is also the honest "most recent": it is true insertion order, whereas
 * received_at on rows written before this fix is ESPN's backdated report date.
 * Nothing in the app deletes from raw_events, and SQLite hands new rows
 * max(rowid)+1, so the ordering cannot regress.
 *
 * INDEXED BY is deliberate: the free planner choice here is between this index
 * and idx_raw_events_source_received(source_id, received_at), and reaching one
 * player's row through that one means walking every 'espn' row. That is the
 * same shape of full scan that blocked the event loop for ~21s before #64, and
 * it would only show up once prod stats shifted. Pinning the index makes the
 * plan a property of the code, and a loud error rather than a silent scan if
 * the index is dropped. espn-injury-daily-churn.test.ts asserts the plan uses
 * the index with no temp b-tree.
 */
export const LATEST_NFL_INJURY_SQL = `SELECT json_extract(payload, '$.designation') AS designation
    FROM raw_events INDEXED BY idx_raw_events_source_player
    WHERE source_id = 'espn' AND player = ? AND team = ? AND league = 'NFL' AND event_type = 'injury_update'
    ORDER BY rowid DESC
    LIMIT 1`;

interface LatestNFLInjuryRow {
  designation: string | null;
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
    rows_skipped_unchanged: 0,
    raw_events_created: 0,
  };

  // Dedup via an exact indexed lookup per row rather than pulling a rolling
  // window of NFL rows into memory. The old getRawEvents({ league: "NFL",
  // limit: 1000 }) had no usable index (league-only), so on a cold boot it read
  // every NFL row out of a multi-GB DB just to sort them — ~21s of synchronous
  // work that blocked the event loop — and its 1000-row window let older
  // injuries fall out and get re-created every cycle (17-18 dupes/cycle).
  // Prepared once and reused for every row in the fetch.
  // See LATEST_NFL_INJURY_SQL for why the key is state, not date.
  const db = getPipelineDb();
  const latestStmt = db.prepare(LATEST_NFL_INJURY_SQL);
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
    const key = `${playerName}_${team}_${designation}`;

    // Unchanged state → ESPN is just re-listing a standing injury. Drop it.
    // The lookup is already scoped to this player on this team, so a missing
    // row means news (first sighting, or they changed teams).
    const latest = latestStmt.get(playerName, team) as LatestNFLInjuryRow | undefined;
    const unchanged = latest !== undefined && latest.designation === designation;

    if (insertedThisRun.has(key) || unchanged) {
      diagnostics.rows_skipped_unchanged++;
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
      // No { eventTime } override: received_at/created_at are wall-clock
      // ARRIVAL time. Passing ESPN's date here backdated received_at to the
      // report date, which is what the pipeline orders and ages rows by
      // (getUnprocessedRawEvents, freshness, "most recent" above). ESPN's own
      // timestamp is not lost — it stays in payload.occurred_at/event_time,
      // which is where situations-adapter reads occurred_at from.
    });

    created++;
    diagnostics.raw_events_created++;
    insertedThisRun.add(key);
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
