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

/** Resolve an abbreviation (or alias) to ESPN's school name, for debugging and tests. */
export function cfbTeamName(abbr: string): string | null {
  const upper = abbr.trim().toUpperCase();
  const canonical = CFB_ABBR_ALIASES[upper] ?? upper;
  return CFB_TEAM_NAMES[canonical] ?? null;
}
