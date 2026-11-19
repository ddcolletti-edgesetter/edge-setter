/**
 * CFB school-name resolver.
 *
 * `games.home_team` / `games.away_team` for CFB is shortCode(<odds-feed name>),
 * which is the mascot word's first three letters for most of the FBS. The board
 * printed those raw: "OWL vs PAN", "CAR @ BOB", "EAG @ BRO".
 *
 * Everything here is driven off the two GENERATED files rather than a list
 * typed into the test, so a regenerate that adds, drops or re-mascots a school
 * fails here instead of in prod.
 */

import { describe, expect, it } from "vitest";

import {
  CFB_AMBIGUOUS_STORED_TOKENS,
  CFB_ESPN_TEAM_BY_ID,
} from "../../../server/pipeline/cfb-espn-teams.generated";
import { cfbSchoolForGamesToken } from "../lib/cfbTeamLogos";
import { CFB_MASCOT_SLICE_TOKENS } from "../lib/cfbTeamLogos.generated";

const TEAMS = Object.values(CFB_ESPN_TEAM_BY_ID);

/** stored token -> every school the odds adapter would write it for. */
const OWNERS = new Map<string, typeof TEAMS>();
for (const team of TEAMS) {
  OWNERS.set(team.stored, [...(OWNERS.get(team.stored) ?? []), team]);
}

const soleOwner = [...OWNERS.entries()].filter(([, owners]) => owners.length === 1);
const shared = [...OWNERS.entries()].filter(([, owners]) => owners.length > 1);

describe("cfbSchoolForGamesToken", () => {
  it("names the school for every token exactly one FBS program is stored as", () => {
    const named = soleOwner.filter(([, [team]]) => team.fbs);
    // Guards the guard: if a regenerate collapsed the map this would pass vacuously.
    expect(named.length).toBeGreaterThan(90);

    const wrong = named
      .map(([token, [team]]) => ({ token, got: cfbSchoolForGamesToken(token), want: team.name }))
      .filter((row) => row.got !== row.want);
    expect(wrong).toEqual([]);
  });

  it("refuses every token two or more schools share", () => {
    expect(shared.length).toBe(CFB_AMBIGUOUS_STORED_TOKENS.length);

    const guessed = shared
      .map(([token, owners]) => ({ token, got: cfbSchoolForGamesToken(token), owners: owners.map((o) => o.name) }))
      .filter((row) => row.got !== null);
    expect(guessed).toEqual([]);
  });

  it("refuses FLA, which is a mascot slice AND ESPN's abbreviation for Florida", () => {
    // The one token where consulting CFB_TEAM_NAMES first would silently
    // relabel every Kent State and Liberty game "Florida Gators".
    expect(CFB_MASCOT_SLICE_TOKENS.find((e) => e.token === "FLA")?.teams).toEqual([
      "Kent State Golden Flashes",
      "Liberty Flames",
    ]);
    expect(cfbSchoolForGamesToken("FLA")).toBeNull();
  });

  it("refuses a token whose only owner is outside FBS", () => {
    // CAT = Western Carolina Catamounts. The client map is FBS-only, so there
    // is no name to print and the board keeps the token.
    const nonFbs = soleOwner.filter(([, [team]]) => !team.fbs);
    expect(nonFbs.map(([token]) => token)).toEqual(["CAT"]);
    for (const [token] of nonFbs) expect(cfbSchoolForGamesToken(token)).toBeNull();
  });

  it("names schools the odds feed stores under a real abbreviation too", () => {
    expect(cfbSchoolForGamesToken("ALA")).toBe("Alabama Crimson Tide");
    expect(cfbSchoolForGamesToken("BRO")).toBe("Western Michigan Broncos");
    expect(cfbSchoolForGamesToken("TIG")).toBe("Memphis Tigers");
  });

  it("is blank- and case-safe and never throws", () => {
    for (const input of ["", "   ", null, undefined, "ZZZ", "not a token"]) {
      expect(cfbSchoolForGamesToken(input as string)).toBeNull();
    }
    expect(cfbSchoolForGamesToken("bro")).toBe("Western Michigan Broncos");
    expect(cfbSchoolForGamesToken(" BRO ")).toBe("Western Michigan Broncos");
  });
});

describe("server/client ambiguous-token parity", () => {
  /**
   * One generator writes both files. If they drift, the client starts naming a
   * school on a token the server refuses to resolve — which is precisely the
   * guess this change exists not to make.
   */
  it("agrees on which tokens are ambiguous, and on the schools behind each", () => {
    const serverSide = CFB_AMBIGUOUS_STORED_TOKENS
      .map((e) => ({ token: e.token, teams: [...e.teams].sort() }))
      .sort((a, b) => a.token.localeCompare(b.token));
    const clientSide = CFB_MASCOT_SLICE_TOKENS
      .filter((e) => e.teams.length > 1)
      .map((e) => ({ token: e.token, teams: [...e.teams].sort() }))
      .sort((a, b) => a.token.localeCompare(b.token));

    expect(clientSide).toEqual(serverSide);
    expect(serverSide.length).toBe(16);
  });
});
