/**
 * One place that decides what name a team prints under, for display only.
 *
 * THE ORDER IS THE WHOLE POINT, and it is the order #101 established for the
 * matchup line: the name the games row stored, then the CFB mascot-token
 * lookup, then the token itself.
 *
 * A stored name is what the feed actually called the team, so it outranks a
 * table that infers a school from three letters — and it is the only thing
 * that can name one of the 16 tokens two schools share, which the lookup must
 * refuse (see cfbSchoolForGamesToken).
 *
 * The STORED branch is league-agnostic: an NFL row carrying "Kansas City
 * Chiefs" prints it. The LOOKUP stays CFB-only, because the same token from a
 * non-CFB source is a real abbreviation — FLA is Florida to the CFB table and
 * the Marlins to everything else.
 *
 * This lives in lib/ rather than components/board/ because both sides of the
 * pipeline need it: `boardSituations` builds the row title before any adapter
 * runs, and `boardAdapters` builds every label after. A single leaf keeps the
 * two from drifting into two different fallback orders.
 */

import { cfbSchoolForGamesToken } from "./cfbTeamLogos";

/**
 * The shape {@link storedGameNames} reads. Two spellings for the same reason
 * the token fields have four: the API serves snake_case rows and each board
 * page re-maps them into its own camelCase shape.
 */
export type StoredNameFields = {
  awayTeamName?: string | null;
  homeTeamName?: string | null;
  away_team_name?: string | null;
  home_team_name?: string | null;
};

/**
 * CFB `games`-table token -> school name, for display only.
 *
 * Returns undefined for every other league and for any token two schools
 * share, and the caller then prints the token exactly as it does today. Gated
 * on league because the resolver is only correct for games-sourced tokens —
 * see cfbSchoolForGamesToken for the FLA trap.
 */
export function cfbGamesSchool(token: string | undefined | null, league?: string): string | undefined {
  if (String(league ?? "").toUpperCase() !== "CFB") return undefined;
  return cfbSchoolForGamesToken(token) ?? undefined;
}

/**
 * The names the games row stored for its two sides, blanks dropped.
 *
 * A row written before `games.home_team_name` / `away_team_name` existed, or
 * by a feed with no name to give, yields `{}` and every caller falls through
 * to what it did before.
 */
export function storedGameNames(game?: StoredNameFields | null): { away?: string; home?: string } {
  const clean = (value?: string | null) => {
    const text = String(value ?? "").trim();
    return text || undefined;
  };
  return {
    away: clean(game?.awayTeamName ?? game?.away_team_name),
    home: clean(game?.homeTeamName ?? game?.home_team_name),
  };
}

/**
 * The better name for one side, or undefined when there isn't one.
 *
 * Undefined rather than the token on purpose: every caller already has the
 * token in hand and its own `?? token` fallback, and an undefined return is
 * what lets a caller tell "we have nothing to add" from "the name happens to
 * equal the token". {@link teamDisplayLabel} is the variant that just prints.
 */
export function teamDisplayName(
  token?: string | null,
  stored?: string,
  league?: string,
): string | undefined {
  if (stored) return stored;
  if (!token) return undefined;
  return cfbGamesSchool(token, league);
}

/** {@link teamDisplayName} with the token as the last resort. */
export function teamDisplayLabel(
  token?: string | null,
  stored?: string,
  league?: string,
): string | undefined {
  return teamDisplayName(token, stored, league) ?? (token || undefined);
}
