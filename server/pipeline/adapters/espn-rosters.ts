/**
 * Edge Setter — ESPN Roster Adapter
 *
 * Source: https://site.api.espn.com (free, no key required)
 * Populates the `roster_players` gazetteer used by the RSS headline matcher.
 *
 * Only current athletes are stored. Coaches/GMs are excluded structurally — the
 * ESPN roster payload keeps them under a separate `coach` key that we never read.
 * Former players fall out on the next daily refresh, which replaces each team's
 * rows wholesale (see replaceTeamRoster).
 *
 * NFL only for now: the roster matcher is team-scoped and, in the current feed
 * set, only NFL feeds carry a `team`. CFB is deferred until a team-scoped CFB
 * feed exists — matching headlines against ~130 unscoped FBS rosters would
 * reintroduce exactly the cross-team false positives the scoping prevents.
 */

import { replaceTeamRoster, replaceTeamStaff, getRosterSummary, type RosterPlayer, type RosterStaff } from "../store";

const NFL_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

// ESPN abbreviations match our internal codes for all 32 teams EXCEPT Washington
// (ESPN "WSH" → internal "WAS"). Anything not listed maps to itself.
const ESPN_ABBR_TO_INTERNAL: Record<string, string> = {
  WSH: "WAS",
};

type RosterRow = Omit<RosterPlayer, "league" | "team">;
type StaffRow = Omit<RosterStaff, "league" | "team">;

// Static staff supplement, keyed by INTERNAL team abbr. ESPN only exposes the
// head coach (pulled dynamically below), so coordinators/GMs are listed here.
// Manually maintained — coaching staff turns over rarely, but VERIFY PERIODICALLY.
// Scope: this only suppresses the LOW-confidence last-name matcher tier, so a
// stale entry is low-risk. Deliberately omit staff whose surname is shared by a
// current player you want the fallback to keep (that surname would be suppressed).
// Only the teams with a team-scoped RSS feed matter today (others are harmless).
const STATIC_NFL_STAFF: Record<string, StaffRow[]> = {
  KC:  [staff("Brett Veach", "GM"), staff("Steve Spagnuolo", "DC"), staff("Matt Nagy", "OC")],
  PHI: [staff("Howie Roseman", "GM"), staff("Vic Fangio", "DC")],
  BUF: [staff("Brandon Beane", "GM"), staff("Joe Brady", "OC"), staff("Bobby Babich", "DC")],
  BAL: [staff("Eric DeCosta", "GM"), staff("Todd Monken", "OC"), staff("Zach Orr", "DC")],
  DAL: [staff("Matt Eberflus", "DC")], // GM Jerry Jones omitted — surname collides with a rostered player
  SF:  [staff("John Lynch", "GM"), staff("Robert Saleh", "DC")],
  MIA: [staff("Chris Grier", "GM"), staff("Anthony Weaver", "DC")],
  DEN: [staff("George Paton", "GM"), staff("Vance Joseph", "DC")],
  SEA: [staff("John Schneider", "GM"), staff("Klint Kubiak", "OC"), staff("Aden Durde", "DC")],
  DET: [staff("Brad Holmes", "GM")], // HC Dan Campbell added dynamically from ESPN coach[]
  GB:  [staff("Brian Gutekunst", "GM"), staff("Jeff Hafley", "DC")],
};

function staff(fullName: string, role: string): StaffRow {
  const parts = fullName.trim().split(/\s+/);
  return { full_name: fullName, first_name: parts[0] ?? null, last_name: parts.slice(1).join(" ") || parts[0], role };
}

interface ESPNTeamListEntry {
  team?: { id?: string; abbreviation?: string; displayName?: string };
}
interface ESPNTeamsResponse {
  sports?: Array<{ leagues?: Array<{ teams?: ESPNTeamListEntry[] }> }>;
}
interface ESPNAthlete {
  id?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  displayName?: string;
  position?: { abbreviation?: string };
  status?: { name?: string; type?: string };
}
interface ESPNCoach {
  id?: string;
  firstName?: string;
  lastName?: string;
}
interface ESPNRosterResponse {
  athletes?: Array<{ position?: string; items?: ESPNAthlete[] }>;
  coach?: ESPNCoach[];
}

export interface RosterRefreshResult {
  league: string;
  teams_updated: number;
  players_written: number;
  staff_written: number;
  teams_failed: number;
  errors: string[];
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function internalAbbr(espnAbbr: string | undefined): string | null {
  if (!espnAbbr) return null;
  const up = espnAbbr.toUpperCase();
  return ESPN_ABBR_TO_INTERNAL[up] ?? up;
}

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "EdgeSetter-RosterSync/1.0" } });
    clearTimeout(timer);
    if (!res.ok) { console.warn(`[espn-rosters] HTTP ${res.status} for ${url}`); return null; }
    return await res.json() as T;
  } catch (err: any) {
    if (err.name !== "AbortError") console.warn(`[espn-rosters] Fetch error for ${url}: ${err.message}`);
    return null;
  }
}

/** All 32 NFL teams as {espnId, abbr(internal)}. */
export async function fetchNFLTeams(): Promise<Array<{ espnId: string; abbr: string }>> {
  const data = await fetchJson<ESPNTeamsResponse>(`${NFL_BASE}/teams`);
  const list = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  const out: Array<{ espnId: string; abbr: string }> = [];
  for (const entry of list) {
    const id = entry.team?.id;
    const abbr = internalAbbr(entry.team?.abbreviation);
    if (id && abbr) out.push({ espnId: id, abbr });
  }
  return out;
}

/** Flatten one team's ESPN roster payload into gazetteer rows. Reads every
 *  athletes group (offense/defense/specialTeam/IR/suspended/practiceSquad) —
 *  all are current roster members — and never the sibling `coach` key. */
export function extractRosterRows(payload: ESPNRosterResponse): RosterRow[] {
  const rows: RosterRow[] = [];
  const seen = new Set<string>();
  for (const group of payload.athletes ?? []) {
    for (const a of group.items ?? []) {
      const fullName = (a.fullName ?? a.displayName ?? `${a.firstName ?? ""} ${a.lastName ?? ""}`).trim();
      const lastName = (a.lastName ?? fullName.split(/\s+/).slice(-1)[0] ?? "").trim();
      if (!fullName || !lastName) continue;
      const key = a.id ?? fullName.toLowerCase();
      if (seen.has(key)) continue; // a player can appear in only one group, but guard anyway
      seen.add(key);
      rows.push({
        espn_id: a.id ?? null,
        full_name: fullName,
        first_name: a.firstName ?? null,
        last_name: lastName,
        position: a.position?.abbreviation ?? null,
        status: group.position ?? a.status?.type ?? null,
      });
    }
  }
  return rows;
}

/** Head coach(es) from the ESPN roster `coach` key. ESPN exposes only the HC —
 *  coordinators/GMs come from STATIC_NFL_STAFF. */
export function extractStaffRows(payload: ESPNRosterResponse): StaffRow[] {
  const rows: StaffRow[] = [];
  for (const c of payload.coach ?? []) {
    const first = (c.firstName ?? "").trim();
    const last = (c.lastName ?? "").trim();
    const full = `${first} ${last}`.trim();
    if (!full || !last) continue;
    rows.push({ full_name: full, first_name: first || null, last_name: last, role: "HC" });
  }
  return rows;
}

/** Merge dynamic HC with the static supplement, de-duped by full name. */
function buildStaffRows(payload: ESPNRosterResponse, abbr: string): StaffRow[] {
  const merged: StaffRow[] = [...extractStaffRows(payload), ...(STATIC_NFL_STAFF[abbr] ?? [])];
  const seen = new Set<string>();
  return merged.filter(s => {
    const key = s.full_name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchTeamRoster(espnId: string): Promise<ESPNRosterResponse | null> {
  return fetchJson<ESPNRosterResponse>(`${NFL_BASE}/teams/${espnId}/roster`);
}

/** Refresh every NFL team's roster. Sequential with a small delay to stay polite
 *  to the free ESPN endpoint (32 requests, once daily). */
export async function refreshNFLRosters(): Promise<RosterRefreshResult> {
  const result: RosterRefreshResult = { league: "NFL", teams_updated: 0, players_written: 0, staff_written: 0, teams_failed: 0, errors: [] };
  const teams = await fetchNFLTeams();
  if (teams.length === 0) {
    result.errors.push("could not fetch NFL team list");
    return result;
  }
  for (const { espnId, abbr } of teams) {
    const payload = await fetchTeamRoster(espnId);
    if (payload === null) {
      result.teams_failed++;
      result.errors.push(`${abbr}: roster fetch failed`);
      await sleep(150);
      continue;
    }
    result.players_written += replaceTeamRoster("NFL", abbr, extractRosterRows(payload));
    result.staff_written += replaceTeamStaff("NFL", abbr, buildStaffRows(payload, abbr));
    result.teams_updated++;
    await sleep(150);
  }
  return result;
}

/** Entry point for the daily scheduler. NFL only today (see file header). */
export async function refreshAllRosters(): Promise<RosterRefreshResult[]> {
  const results: RosterRefreshResult[] = [];
  results.push(await refreshNFLRosters());
  const summary = getRosterSummary();
  console.log(
    `[espn-rosters] refresh complete — ${results.map(r => `${r.league}: ${r.teams_updated}/${r.teams_updated + r.teams_failed} teams, ${r.players_written} players, ${r.staff_written} staff`).join(" · ")} ` +
    `| gazetteer now holds ${summary.total} players across ${summary.teams} teams`,
  );
  return results;
}
