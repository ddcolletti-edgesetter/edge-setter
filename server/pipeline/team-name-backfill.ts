/**
 * Edge Setter — stored team names for CFB and NBA games rows that have none.
 *
 * games.home_team_name / away_team_name (#101) are written by the odds adapter
 * on every row it creates or touches, so a game it still sees is named on the
 * next cycle. Two populations never will be:
 *
 *   - rows the odds adapter last touched before #101 went live (2026-11-19),
 *     i.e. every game that had already dropped out of the feed; and
 *   - rows created by the historical adapters (cfb_hist_*, nba_*), which did
 *     not pass names until this change.
 *
 * A board that needs a stored name to let a story lead cannot lead with those
 * games, and NBA cards print BOS / MIA where a name belongs. This module plans
 * the fill; server/scripts/backfill-game-team-names.ts runs it.
 *
 * HOW A NAME IS FOUND, by where the row's tokens came from:
 *
 *   NBA, any writer   The code is the odds adapter's shortCode of the odds
 *                     name, or balldontlie's abbreviation; both are the same 30
 *                     codes and each is one club. NBA_TEAM_NAME_BY_ABBR names
 *                     it exactly. No network.
 *
 *   CFB, odds rows    The token is shortCode(<odds name>): a mapped code for 48
 *                     schools, else the first three letters of the MASCOT. 16
 *                     of those slices are shared ("OWL" is Rice, Temple, FAU
 *                     and Kennesaw State), and an FCS opponent can share a
 *                     slice with an FBS school the generated map knows. So the
 *                     primary source is ESPN's scoreboard for the game's date:
 *                     the one event whose two teams produce the row's two
 *                     tokens, kicking off within 12h, names both sides. With
 *                     no such event the side stays unresolved, unless the
 *                     caller opts into the token-only fallback (a token
 *                     exactly one school in the generated map produces) —
 *                     off by default, see PlanOptions.allowFallback.
 *
 *   CFB, cfb_hist_*   The tokens are ESPN's own abbreviations and
 *                     source_game_id is ESPN's event id, so the event itself
 *                     (or, offline, ESPN's abbreviation → team record) names
 *                     them.
 *
 * WHAT IT NEVER DOES: overwrite a name that is already there (the apply step
 * uses COALESCE, and the planner only proposes a missing side), guess between
 * schools, or accept an ESPN lookup that finds more than one event.
 *
 * A leaf module: no store import (store imports storage, which opens
 * edge_setter.db read-write on import), so a dry run stays read-only.
 */

import { NBA_TEAM_NAME_BY_ABBR } from "./adapters/espn-nba-teams";
import { CFB_AMBIGUOUS_STORED_TOKENS, CFB_ESPN_TEAM_BY_ID } from "./cfb-espn-teams.generated";

export type NameLeague = "CFB" | "NBA";
export type Provenance = "odds" | "espn_hist" | "bdl_hist";

export interface GameNameRow {
  readonly id: string;
  readonly league: NameLeague;
  readonly home_team: string;
  readonly away_team: string;
  readonly home_team_name: string | null;
  readonly away_team_name: string | null;
  readonly game_time: string;
  readonly source_game_id: string | null;
}

export interface EspnTeamLite {
  readonly id?: string;
  readonly abbreviation?: string;
  readonly displayName?: string;
}

export interface EspnEventLite {
  readonly id: string;
  readonly date: string;
  readonly home: EspnTeamLite;
  readonly away: EspnTeamLite;
}

export type FillMethod = "nba_code" | "espn_event" | "cfb_unique_token" | "espn_abbreviation";

export type UnresolvedReason =
  | "unknown_nba_code"       // not a key of NBA_TEAM_NAME_BY_ABBR (exact match only)
  | "no_espn_match"          // CFB odds row: no ESPN event; one school produces the token, but the fallback is off
  | "ambiguous_token"        // token produced by 2+ schools, and ESPN did not settle it
  | "unknown_token"          // no school in the generated map produces it (often FCS)
  | "espn_multiple_events";  // ESPN had 2+ events matching both tokens

/** A side the token-only fallback WOULD fill, reported when the fallback is off. */
export interface FallbackCandidate {
  readonly id: string;
  readonly side: "home" | "away";
  readonly token: string;
  readonly name: string;
  readonly game_time: string;
}

export interface NameUpdate {
  readonly id: string;
  readonly league: NameLeague;
  readonly home_team_name: string | null; // null = leave this side alone
  readonly away_team_name: string | null;
  readonly methods: readonly FillMethod[];
}

export interface UnresolvedSide {
  readonly id: string;
  readonly league: NameLeague;
  readonly side: "home" | "away";
  readonly token: string;
  readonly reason: UnresolvedReason;
  readonly game_time: string;
}

export interface NamePlan {
  readonly updates: NameUpdate[];
  readonly unresolved: UnresolvedSide[];
  /** Sides left unresolved only because the fallback is off (empty when it is on). */
  readonly fallbackCandidates: FallbackCandidate[];
}

export interface PlanOptions {
  /**
   * Let a CFB odds row with no matching ESPN event take the name of the one
   * school in the generated map that produces its token. OFF by default: an FCS
   * opponent the map does not hold can share a mascot slice with an FBS school
   * it does (Towson Tigers and Memphis Tigers are both "TIG"), and the fallback
   * would name the wrong school.
   */
  readonly allowFallback?: boolean;
}

export const ESPN_MATCH_WINDOW_MS = 12 * 60 * 60 * 1000;

export function provenanceOf(row: Pick<GameNameRow, "id" | "league">): Provenance {
  if (row.league === "CFB" && row.id.startsWith("cfb_hist_")) return "espn_hist";
  if (row.league === "NBA" && row.id.startsWith("nba_")) return "bdl_hist";
  return "odds";
}

const norm = (token: string | null | undefined) => String(token ?? "").trim().toUpperCase();

/* ─── NBA ─────────────────────────────────────────────────────────────── */

/**
 * Exact key match only — no trimming, case folding or near-matching. A code the
 * map does not hold (an ESPN spelling like "GS" or "UTAH", a typo) stays
 * unresolved and is listed, rather than mapped to the closest club.
 */
export function nbaTeamNameForCode(code: string): string | null {
  return Object.prototype.hasOwnProperty.call(NBA_TEAM_NAME_BY_ABBR, code) ? NBA_TEAM_NAME_BY_ABBR[code] : null;
}

/* ─── CFB lookups from the generated ESPN map ─────────────────────────── */

const AMBIGUOUS = new Set(CFB_AMBIGUOUS_STORED_TOKENS.map((entry) => norm(entry.token)));

function uniqueIndex(key: (team: { name: string; abbr: string; stored: string }) => string) {
  const names = new Map<string, Set<string>>();
  for (const team of Object.values(CFB_ESPN_TEAM_BY_ID)) {
    const k = norm(key(team));
    if (!k) continue;
    if (!names.has(k)) names.set(k, new Set());
    names.get(k)!.add(team.name);
  }
  return names;
}
const BY_STORED = uniqueIndex((team) => team.stored);
const BY_ABBR = uniqueIndex((team) => team.abbr);

type Lookup = { name: string } | { reason: "ambiguous_token" | "unknown_token" };

/** A CFB odds-row token → the one school that produces it, or why not. */
export function cfbNameForStoredToken(token: string): Lookup {
  const t = norm(token);
  const names = BY_STORED.get(t);
  if (AMBIGUOUS.has(t) || (names && names.size > 1)) return { reason: "ambiguous_token" };
  if (!names || names.size === 0) return { reason: "unknown_token" };
  return { name: [...names][0] };
}

/** A cfb_hist_* token (ESPN's abbreviation) → its school, or why not. */
export function cfbNameForEspnAbbreviation(abbr: string): Lookup {
  const names = BY_ABBR.get(norm(abbr));
  if (!names || names.size === 0) return { reason: "unknown_token" };
  if (names.size > 1) return { reason: "ambiguous_token" };
  return { name: [...names][0] };
}

/**
 * The token the odds adapter would have stored for an ESPN team: the generated
 * map's `stored` for a team it knows, else shortCode's own fallback — the
 * first three letters of the last word — which is how an FCS opponent's row
 * was written (none of the 48 NAME_TO_CODE schools is FCS).
 */
export function oddsTokenForEspnTeam(team: EspnTeamLite): string {
  const known = team.id ? CFB_ESPN_TEAM_BY_ID[team.id] : undefined;
  if (known) return norm(known.stored);
  const last = String(team.displayName ?? "").trim().split(/\s+/).pop() ?? "";
  return norm(last.slice(0, 3));
}

/* ─── ESPN event match ────────────────────────────────────────────────── */

type EventMatch = { home: string; away: string } | { reason: "espn_multiple_events" } | null;

/**
 * The one ESPN event this row is, with its names oriented to the ROW's sides.
 * Either orientation is accepted (a neutral-site game can be listed home/away
 * the other way round), but both tokens must match and kickoff must be within
 * 12h. Zero events → null; two or more → refused.
 */
export function matchEspnEvent(row: GameNameRow, events: readonly EspnEventLite[]): EventMatch {
  const prov = provenanceOf(row);
  if (prov === "espn_hist" && row.source_game_id) {
    const byId = events.find((event) => event.id === row.source_game_id);
    if (byId) return orient(row, byId, prov) ?? null;
  }
  const rowMs = Date.parse(row.game_time);
  const hits: { home: string; away: string }[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    const eventMs = Date.parse(event.date);
    if (!Number.isFinite(rowMs) || !Number.isFinite(eventMs) || Math.abs(eventMs - rowMs) > ESPN_MATCH_WINDOW_MS) continue;
    const named = orient(row, event, prov);
    if (named) hits.push(named);
  }
  if (hits.length === 0) return null;
  if (hits.length > 1) return { reason: "espn_multiple_events" };
  return hits[0];
}

function orient(row: GameNameRow, event: EspnEventLite, prov: Provenance): { home: string; away: string } | undefined {
  const tokenOf = (team: EspnTeamLite) => (prov === "espn_hist" ? norm(team.abbreviation) : oddsTokenForEspnTeam(team));
  const h = tokenOf(event.home), a = tokenOf(event.away);
  const rh = norm(row.home_team), ra = norm(row.away_team);
  const hn = event.home.displayName?.trim(), an = event.away.displayName?.trim();
  if (!hn || !an) return undefined;
  if (h === rh && a === ra) return { home: hn, away: an };
  if (h === ra && a === rh) return { home: an, away: hn };
  return undefined;
}

/* ─── Plan ────────────────────────────────────────────────────────────── */

/**
 * Plan the fill for rows missing at least one name. `eventsFor` returns the
 * ESPN events to try for a CFB row (the script fetches its date's
 * scoreboards); pass null to plan offline.
 */
export function planTeamNames(
  rows: readonly GameNameRow[],
  eventsFor: ((row: GameNameRow) => readonly EspnEventLite[]) | null,
  options: PlanOptions = {},
): NamePlan {
  const allowFallback = options.allowFallback === true;
  const updates: NameUpdate[] = [];
  const unresolved: UnresolvedSide[] = [];
  const fallbackCandidates: FallbackCandidate[] = [];

  for (const row of rows) {
    const need = { home: !row.home_team_name?.trim(), away: !row.away_team_name?.trim() };
    if (!need.home && !need.away) continue;
    const got: { home: string | null; away: string | null } = { home: null, away: null };
    const why: { home: UnresolvedReason | null; away: UnresolvedReason | null } = { home: null, away: null };
    const methods = new Set<FillMethod>();

    if (row.league === "NBA") {
      for (const side of ["home", "away"] as const) {
        if (!need[side]) continue;
        const name = nbaTeamNameForCode(side === "home" ? row.home_team : row.away_team);
        if (name) { got[side] = name; methods.add("nba_code"); } else why[side] = "unknown_nba_code";
      }
    } else {
      const prov = provenanceOf(row);
      // cfb_hist rows: ESPN's own abbreviation is exact, so try it before the network.
      if (prov === "espn_hist") {
        for (const side of ["home", "away"] as const) {
          if (!need[side]) continue;
          const hit = cfbNameForEspnAbbreviation(side === "home" ? row.home_team : row.away_team);
          if ("name" in hit) { got[side] = hit.name; methods.add("espn_abbreviation"); } else why[side] = hit.reason;
        }
      }
      // ESPN's event for this date: the only source that can split a shared token.
      const stillNeeded = (side: "home" | "away") => need[side] && !got[side];
      if (eventsFor && (stillNeeded("home") || stillNeeded("away"))) {
        const match = matchEspnEvent(row, eventsFor(row));
        if (match && "home" in match) {
          for (const side of ["home", "away"] as const) {
            if (stillNeeded(side)) { got[side] = match[side]; why[side] = null; methods.add("espn_event"); }
          }
        } else if (match && "reason" in match) {
          for (const side of ["home", "away"] as const) if (stillNeeded(side)) why[side] = match.reason;
        }
      }
      // Token-only fallback for odds rows (opt-in): a token exactly one school
      // produces. With it off, the side stays unresolved and is reported as a
      // candidate so the dry run shows what turning it on would write.
      if (prov === "odds") {
        for (const side of ["home", "away"] as const) {
          if (!stillNeeded(side) || why[side] === "espn_multiple_events") continue;
          const token = side === "home" ? row.home_team : row.away_team;
          const hit = cfbNameForStoredToken(token);
          if (!("name" in hit)) { why[side] = hit.reason; continue; }
          if (allowFallback) { got[side] = hit.name; why[side] = null; methods.add("cfb_unique_token"); }
          else {
            why[side] = "no_espn_match";
            fallbackCandidates.push({ id: row.id, side, token, name: hit.name, game_time: row.game_time });
          }
        }
      }
    }

    if (got.home || got.away) {
      updates.push({ id: row.id, league: row.league, home_team_name: got.home, away_team_name: got.away, methods: [...methods] });
    }
    for (const side of ["home", "away"] as const) {
      if (need[side] && !got[side]) {
        unresolved.push({
          id: row.id, league: row.league, side,
          token: side === "home" ? row.home_team : row.away_team,
          reason: why[side] ?? "unknown_token",
          game_time: row.game_time,
        });
      }
    }
  }
  return { updates, unresolved, fallbackCandidates };
}

/** ESPN scoreboard dates (YYYYMMDD) worth fetching for a row: its UTC date and the day before (ESPN dates by US local day). */
export function espnDatesFor(gameTimeIso: string): string[] {
  const ms = Date.parse(gameTimeIso);
  if (!Number.isFinite(ms)) return [];
  return [ms, ms - 86_400_000].map((t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, ""));
}
