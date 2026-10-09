/**
 * Edge Setter — CFB game-lookup canonicalisation
 *
 * Two vocabularies describe the same college-football team, and they are
 * written and read by different code paths:
 *
 *   WRITE  the odds adapter inserts games rows as
 *            home_team = shortCode(<The Odds API team name>)
 *          which is the NAME_TO_CODE value for the 48 schools that map has an
 *          entry for, and otherwise the first three letters of the mascot word
 *          ("Memphis Tigers" -> "TIG", "Houston Cougars" -> "COU").
 *
 *   READ   the ESPN score adapters look that row up by ESPN's own spelling
 *          ("MEM", "HOU").
 *
 * The two agree for 44 of 136 FBS teams, and findGameByTeams needs BOTH sides
 * of a matchup to agree, so most CFB games are never resolved, never marked
 * final, and never settle. Measured on the 2025 FBS schedule (weeks 1-15, 902
 * games): 141 games resolvable, 15.6%.
 *
 * This module answers one question — "which tokens could a games row be
 * storing for the team I am holding?" — from ESPN's own team data, and it
 * answers it off the full team name rather than off an abbreviation. That
 * direction is the only deterministic one: shortCode's fallback reads the LAST
 * WORD of the team name, so a name forward-translates to exactly one stored
 * token, while an abbreviation ("MEM") carries nothing that could produce
 * "TIG". Callers should pass ESPN's displayName where they have it; an
 * abbreviation still resolves, via ESPN's own abbreviation -> team record.
 *
 * What this module deliberately does NOT do: pick between schools. 16 stored
 * tokens are shared by two or more schools (BUL is Buffalo, Fresno State,
 * Louisiana Tech and South Florida). Those tokens are still offered as
 * candidates, because dropping them would cost real matches, but the caller is
 * expected to refuse a lookup that lands on more than one games row rather
 * than take the newest. See findGameByTeams in store.ts.
 */

import {
  CFB_AMBIGUOUS_STORED_TOKENS,
  CFB_ESPN_TEAM_BY_ID,
  CFB_TEAM_KEY_TO_ESPN_ID,
  type CfbEspnTeam,
} from "./cfb-espn-teams.generated";

/** Same normalisation the generator used for its lowercase name keys. */
const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const AMBIGUOUS_TOKENS: ReadonlySet<string> = new Set(
  CFB_AMBIGUOUS_STORED_TOKENS.map((entry) => entry.token),
);

/**
 * The school a CFB team string refers to, or null if ESPN's data cannot name
 * one. Accepts an ESPN displayName, location, short name or slug (matched
 * case- and punctuation-insensitively) and any abbreviation spelling the
 * generated map carries.
 */
export function cfbTeamFor(input: string): CfbEspnTeam | null {
  const raw = input?.trim();
  if (!raw) return null;
  const id =
    CFB_TEAM_KEY_TO_ESPN_ID[raw.toUpperCase()] ??
    CFB_TEAM_KEY_TO_ESPN_ID[normalizeName(raw)];
  return id ? CFB_ESPN_TEAM_BY_ID[id] ?? null : null;
}

/**
 * Every token a games row could be storing for this team, most specific first:
 * the caller's own string, then ESPN's abbreviation, then the token the odds
 * adapter would have written. Always contains at least the caller's string
 * uppercased, so a team ESPN does not know about behaves exactly as before.
 */
export function cfbStoredTokenCandidates(input: string): string[] {
  const raw = input?.trim() ?? "";
  if (!raw) return [];
  const candidates = [raw.toUpperCase()];
  const team = cfbTeamFor(raw);
  if (team) {
    for (const token of [team.abbr, team.stored]) {
      const upper = token?.trim().toUpperCase();
      if (upper && !candidates.includes(upper)) candidates.push(upper);
    }
  }
  return candidates;
}

/** True when two or more FBS schools would both be stored as this token. */
export function cfbStoredTokenIsAmbiguous(token: string): boolean {
  return AMBIGUOUS_TOKENS.has(token?.trim().toUpperCase() ?? "");
}

/** The schools behind an ambiguous token, for logs and tests. */
export function cfbSchoolsForStoredToken(token: string): readonly string[] {
  const upper = token?.trim().toUpperCase() ?? "";
  return CFB_AMBIGUOUS_STORED_TOKENS.find((entry) => entry.token === upper)?.teams ?? [];
}
