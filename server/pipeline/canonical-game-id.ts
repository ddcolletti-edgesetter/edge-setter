/**
 * Edge Setter — Canonical game identity
 *
 * ONE id scheme for every league:  `${LEAGUE}_${YYYY_MM_DD}_${AWAY}_${HOME}`
 * (e.g. `MLB_2026_08_17_NYY_BOS`). This is the format The Odds API adapter has
 * always produced, and NBA/NFL/CFB already settle correctly on it because their
 * ESPN score adapters resolve scores onto that same row via findGameByTeams.
 *
 * MLB was the lone exception: its StatsAPI schedule/score path minted a parallel
 * `mlb_${gamePk}` id. That split every MLB game across TWO rows — an odds-bearing
 * one (spread/total, but never scored) and a score-bearing one (`mlb_*`, but no
 * line) — so settlement always graded against a row with no spread and produced
 * `hit = null` every time. That is the reason `total_settled_outcomes` sat at 0.
 * Routing MLB through this helper collapses both back onto one row.
 *
 * The MLB team-code normalizer below is keyed on the numeric StatsAPI team id,
 * NOT the abbreviation string, because abbreviations drift between feeds:
 *   - Arizona  (id 109): StatsAPI abbreviation "AZ"  → canonical "ARI"
 *   - Athletics(id 133): StatsAPI abbreviation "ATH" → canonical "ATH"
 *   - White Sox(id 145): "CWS" on both sides (the "CHW" in the legacy display
 *                        table was stale and never what the live API returns)
 * Codes empirically pinned 2026-08-17 against the live StatsAPI /api/v1/teams
 * response and the prod odds `games` table (GLOB 'MLB_*' → one code per team).
 */

import type { League } from "./types";

/**
 * Build the canonical game id. `gameDateISO` may be a full ISO datetime or a
 * bare `YYYY-MM-DD`; only the date portion is used. `awayCode`/`homeCode` must
 * already be canonical team codes (Odds-API shortCodes).
 */
export function canonicalGameId(
  league: League,
  gameDateISO: string,
  awayCode: string,
  homeCode: string,
): string {
  const date = gameDateISO.slice(0, 10).replace(/-/g, "_");
  return [league, date, awayCode, homeCode].join("_");
}

/**
 * StatsAPI team id → canonical team code (the Odds-API shortCode). All 30 clubs.
 * Only three ids resolve to a code that differs from the StatsAPI abbreviation
 * (109/133/145, documented above); the rest are identity, but every club is
 * listed explicitly so a future relocation/rename is a one-line, reviewable edit
 * rather than silent fallback behaviour.
 */
const MLB_TEAM_ID_TO_CODE: Record<number, string> = {
  108: "LAA", 109: "ARI", 110: "BAL", 111: "BOS", 112: "CHC",
  113: "CIN", 114: "CLE", 115: "COL", 116: "DET", 117: "HOU",
  118: "KC",  119: "LAD", 120: "WSH", 121: "NYM", 133: "ATH",
  134: "PIT", 135: "SD",  136: "SEA", 137: "SF",  138: "STL",
  139: "TB",  140: "TEX", 141: "TOR", 142: "MIN", 143: "PHI",
  144: "ATL", 145: "CWS", 146: "MIA", 147: "NYY", 158: "MIL",
};

/** Set of valid canonical codes, for validating an abbreviation-only ref. */
const CANONICAL_CODES = new Set<string>(Object.values(MLB_TEAM_ID_TO_CODE));

/**
 * Known StatsAPI-abbreviation drifts, used only when a team id is unavailable
 * (rare — most StatsAPI payloads carry team.id). Keeps `AZ` from being treated
 * as unknown when we have to fall back to the abbreviation.
 */
const MLB_ABBR_DRIFT: Record<string, string> = {
  AZ: "ARI",
  // ATH and CWS are already canonical codes, so they pass the CANONICAL_CODES
  // check below without a drift entry.
};

export interface MLBTeamRef {
  id?: number | null;
  abbreviation?: string | null;
  name?: string | null;
}

/** Total number of MLB clubs — exported so tests can assert the map is complete. */
export const MLB_CLUB_COUNT = 30;

/**
 * Resolve an MLB team reference to its canonical code.
 *
 * NON-FATAL by design: an unrecognized reference (e.g. the "American League" /
 * "National League" All-Star rows that leak in around the break — they have no
 * club id and produce codes like "LEA") returns `null` and logs once, so callers
 * SKIP the row rather than crash or mis-key it. That log line is the detector for
 * the next real team rename/relocation; it should be rare enough to notice.
 */
export function mlbCanonicalTeamCode(ref: MLBTeamRef | null | undefined): string | null {
  if (ref) {
    if (ref.id != null && MLB_TEAM_ID_TO_CODE[ref.id]) {
      return MLB_TEAM_ID_TO_CODE[ref.id];
    }
    const abbr = ref.abbreviation?.toUpperCase();
    if (abbr) {
      if (MLB_ABBR_DRIFT[abbr]) return MLB_ABBR_DRIFT[abbr];
      if (CANONICAL_CODES.has(abbr)) return abbr;
    }
  }
  console.warn(
    `[canonical-game-id] Unrecognized MLB team ref ` +
    `(id=${ref?.id ?? "?"}, abbr=${ref?.abbreviation ?? "?"}, name=${ref?.name ?? "?"}) — ` +
    `skipping non-club/unknown row`,
  );
  return null;
}

/** All canonical MLB codes, exported for test coverage of the full club set. */
export function allMlbCanonicalCodes(): string[] {
  return Object.values(MLB_TEAM_ID_TO_CODE);
}

/** MLB team ids → codes, exported read-only for table-driven tests. */
export function mlbTeamIdCodeEntries(): Array<[number, string]> {
  return Object.entries(MLB_TEAM_ID_TO_CODE).map(([id, code]) => [Number(id), code]);
}
