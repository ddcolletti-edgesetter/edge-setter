/**
 * CFB team logo URLs and the set of CFB abbreviations we recognise.
 *
 * The ids come from cfbTeamLogos.generated.ts, which is written by
 * `npm run generate:cfb-logos` out of ESPN's own team data. Nothing in this
 * file hard-codes an id; it only joins the generated ids to ESPN's URL pattern
 * and declares the handful of aliases that the generator cannot know about.
 */

import {
  CFB_LOGO_URL_PATTERN,
  CFB_MASCOT_SLICE_TOKENS,
  CFB_TEAM_LOGO_IDS,
  CFB_TEAM_NAMES,
} from "./cfbTeamLogos.generated";

/**
 * Alias -> canonical CFB abbreviation. The only hand-written mapping here, and
 * it carries no ids.
 *
 * Two team vocabularies are live at once. The 247Sports and On3 adapters write
 * full school names ("Alabama", "Texas"), which the client's TEAM_NAME_TO_ABBR
 * folds to "BAMA" and "TX". ESPN, the odds adapter and the school manifest all
 * say "ALA" and "TEX". Both reach the badge, so both have to resolve.
 */
export const CFB_ABBR_ALIASES: Readonly<Record<string, string>> = {
  BAMA: "ALA",
  TX: "TEX",
  // The seven schools the color manifest (client/src/lib/teamColors.ts) keys
  // under a different token than ESPN does. Both spellings reach a crest, so
  // without these the manifest's spelling resolved no logo at all and the
  // school rendered a lettered crest while its ESPN twin rendered the mark.
  // Measured by differencing CFB_TEAM_COLORS against CFB_TEAM_LOGO_IDS.
  ARKST: "ARST",   // Arkansas State
  BGS: "BGSU",     // Bowling Green
  CHAR: "CLT",     // Charlotte
  MARS: "MRSH",    // Marshall
  TEMP: "TEM",     // Temple
  TULSA: "TLSA",   // Tulsa
  UCONN: "CONN",   // UConn
};

const logoUrlForId = (id: number) => CFB_LOGO_URL_PATTERN.replace("{id}", String(id));

/** CFB abbreviation (canonical or alias) -> ESPN logo URL. */
export const CFB_LOGO_URLS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries([
    ...Object.entries(CFB_TEAM_LOGO_IDS).map(([abbr, id]) => [abbr, logoUrlForId(id)]),
    ...Object.entries(CFB_ABBR_ALIASES)
      .map(([alias, canonical]) => [alias, CFB_TEAM_LOGO_IDS[canonical]] as const)
      .filter((entry): entry is readonly [string, number] => entry[1] !== undefined)
      .map(([alias, id]) => [alias, logoUrlForId(id)]),
  ]),
);

/**
 * Every CFB abbreviation we can name a school for — the generated keys plus the
 * aliases above. `isValidTeamToken` uses this so short real abbreviations
 * (SC, UK, MD, NW, VT, BC, GT, OU, KU, ND) are not mistaken for pipeline
 * artifacts; it previously whitelisted only ND and TX.
 */
export const CFB_TEAM_ABBRS: ReadonlySet<string> = new Set([
  ...Object.keys(CFB_TEAM_LOGO_IDS),
  ...Object.keys(CFB_ABBR_ALIASES),
]);

/**
 * Tokens a CFB `games` row can hold that are a mascot slice rather than an
 * abbreviation, so no logo may be resolved from one.
 *
 * `games.home_team` for CFB is `shortCode(<The Odds API team name>)`, whose
 * fallback branch takes the first three letters of the mascot word. That names
 * a mascot, not a school: `BUL` is Buffalo, Fresno State, Louisiana Tech and
 * South Florida, and `FLA` — Kent State's Golden Flashes and Liberty's Flames —
 * is also ESPN's own abbreviation for Florida, so a Kent State game resolved
 * the Florida Gators' logo.
 *
 * Only `games`-sourced tokens are affected. The same string reaching a badge
 * from the injury and transaction adapters is a real abbreviation out of
 * CFB_DISPLAY_TO_ABBR, where `FLA` does mean Florida (Kent State is `KENT`,
 * Liberty is `LIB`) — which is why {@link CFB_LOGO_URLS} still carries the key
 * and callers opt in instead, via `fromGamesTable`.
 */
export const CFB_MASCOT_SLICE_TOKEN_SET: ReadonlySet<string> = new Set(
  CFB_MASCOT_SLICE_TOKENS.map((entry) => entry.token),
);

/** The schools a mascot-slice token could refer to, for tests and debugging. */
export function cfbSchoolsForMascotSlice(token: string): readonly string[] {
  const upper = token?.trim().toUpperCase() ?? "";
  return CFB_MASCOT_SLICE_TOKENS.find((entry) => entry.token === upper)?.teams ?? [];
}

/** Resolve an abbreviation (or alias) to ESPN's school name, for debugging and tests. */
export function cfbTeamName(abbr: string): string | null {
  const upper = abbr.trim().toUpperCase();
  const canonical = CFB_ABBR_ALIASES[upper] ?? upper;
  return CFB_TEAM_NAMES[canonical] ?? null;
}

/**
 * The school a `games`-table CFB token names, or null when we cannot say.
 *
 * `games.home_team` / `games.away_team` for CFB is `shortCode(<The Odds API
 * team name>)`, which is a real abbreviation for the 48 schools NAME_TO_CODE
 * covers and the first three letters of the MASCOT word for the rest. So the
 * board prints "OWL vs PAN" where it means Rice and Georgia State.
 *
 * ORDER IS LOAD-BEARING. The mascot-slice table is consulted FIRST, and `FLA`
 * is the proof: it is a mascot slice (Kent State Golden Flashes, Liberty
 * Flames) AND it is ESPN's own abbreviation for Florida in CFB_TEAM_NAMES.
 * Reading the name table first would relabel every Kent State and Liberty
 * game "Florida Gators" — the exact mistake {@link CFB_MASCOT_SLICE_TOKEN_SET}
 * already exists to stop on the logo side.
 *
 * Never guesses. A token two or more schools would both be stored as returns
 * null and the caller keeps the token. 16 tokens are in that bucket; BEA, BUL,
 * EAG and OWL each cover four schools.
 *
 * CFB and games-sourced tokens only. The same string arriving from the injury
 * or transaction adapters is a real abbreviation out of CFB_DISPLAY_TO_ABBR,
 * where `FLA` does mean Florida — callers gate on provenance exactly as
 * `getTeamLogoUrl` does with `fromGamesTable`.
 */
export function cfbSchoolForGamesToken(token: string | null | undefined): string | null {
  const upper = String(token ?? "").trim().toUpperCase();
  if (!upper) return null;
  const slice = CFB_MASCOT_SLICE_TOKENS.find((entry) => entry.token === upper);
  if (slice) return slice.teams.length === 1 ? slice.teams[0] : null;
  return CFB_TEAM_NAMES[CFB_ABBR_ALIASES[upper] ?? upper] ?? null;
}
