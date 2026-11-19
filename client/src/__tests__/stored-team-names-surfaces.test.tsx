/**
 * The stored team name, on the three surfaces that print a team.
 *
 *   watch slate      toLiveGamePillData -> LiveGameStrip's featured line
 *   matchup line     toSituationRowData's matchupLabel
 *   card identity    opponentLabelFor
 *
 * ONE RULE, EVERYWHERE: the name the games row stored, then the CFB
 * mascot-token lookup, then the token itself. The stored branch is
 * league-agnostic; the lookup stays CFB-only, because the same three letters
 * from a non-CFB source are a real abbreviation.
 *
 * The case that matters most is OWL. Four schools share it, so
 * cfbSchoolForGamesToken refuses it and #99 could only print "OWL" — but a row
 * that stored "Rice Owls" knows which one it is. Every surface below is tested
 * on a shared token for that reason.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  opponentLabelFor,
  storedGameNames,
  toLiveGamePillData,
  toSituationRowData,
  toSituationStoryCardData,
  type AnyBoardGame,
} from "@/components/board/boardAdapters";
import { LiveGameStrip } from "@/components/board/LiveGameStrip";
import { SituationStoryCard } from "@/components/board/SituationStoryCard";
import type { BoardSituation } from "@/lib/boardSituations";
import type { SituationRowData } from "@/components/board/SituationRow";

/** OWL is shared by four schools; the lookup must refuse it. */
const SHARED = { token: "OWL", stored: "Rice Owls" };
/** BRO is Western Michigan's alone, so the lookup can name it. */
const OWNED = { token: "BRO", lookup: "Western Michigan Broncos", stored: "Western Michigan Broncos" };

function gameSituation(over: Partial<BoardSituation> = {}): BoardSituation {
  return {
    id: "game-cfb-1",
    kind: "game",
    league: "CFB",
    lane: "watch",
    escalation: "Watch",
    title: "BRO @ OWL",
    awayTeam: "BRO",
    homeTeam: "OWL",
    score: 20,
    confidence: 0,
    sourceCount: 0,
    trustLabel: "Monitoring",
    lifecycle: "Developing",
    lifecycleStage: "Detected",
    isLive: false,
    isActionable: false,
    relatedSignalIds: [],
    ...over,
  } as BoardSituation;
}

describe("storedGameNames", () => {
  it("reads either key spelling", () => {
    expect(storedGameNames({ away_team_name: "Rice Owls", home_team_name: "Temple Owls" }))
      .toEqual({ away: "Rice Owls", home: "Temple Owls" });
    expect(storedGameNames({ awayTeamName: "Rice Owls", homeTeamName: "Temple Owls" }))
      .toEqual({ away: "Rice Owls", home: "Temple Owls" });
  });

  it("treats null, undefined, '' and whitespace as no name at all", () => {
    expect(storedGameNames(undefined)).toEqual({ away: undefined, home: undefined });
    expect(storedGameNames({})).toEqual({ away: undefined, home: undefined });
    expect(storedGameNames({ away_team_name: null, home_team_name: "" }))
      .toEqual({ away: undefined, home: undefined });
    expect(storedGameNames({ away_team_name: "   " })).toMatchObject({ away: undefined });
  });
});

describe("surface 1 - the watch slate", () => {
  const pill = (game: AnyBoardGame, sport: "cfb" | "nfl") => toLiveGamePillData(game, 0, sport);

  it("names a token no lookup can resolve", () => {
    const data = pill(
      { id: "g1", awayTeam: OWNED.token, homeTeam: SHARED.token, home_team_name: SHARED.stored, status: "scheduled" },
      "cfb",
    );
    expect(data.home.name).toBe(SHARED.stored);
    // The pill still shows the token; `name` is the tooltip and the strip line.
    expect(data.home.abbreviation).toBe(SHARED.token);
  });

  it("prefers the stored name over the lookup on a token the lookup CAN resolve", () => {
    const data = pill(
      { id: "g1", awayTeam: OWNED.token, away_team_name: "Western Michigan Broncos (stored)", homeTeam: SHARED.token },
      "cfb",
    );
    expect(data.away.name).toBe("Western Michigan Broncos (stored)");
  });

  it("falls back to the lookup when the row has no name", () => {
    const data = pill({ id: "g1", awayTeam: OWNED.token, homeTeam: SHARED.token }, "cfb");
    expect(data.away.name).toBe(OWNED.lookup);
    expect(data.home.name).toBeUndefined();
  });

  it("names an NFL game from the stored name, which the lookup never does", () => {
    const named = pill(
      { id: "g2", awayTeam: "BUF", awayTeamName: "Buffalo Bills", homeTeam: "KC", homeTeamName: "Kansas City Chiefs" },
      "nfl",
    );
    expect(named.away.name).toBe("Buffalo Bills");
    expect(named.home.name).toBe("Kansas City Chiefs");

    const unnamed = pill({ id: "g3", awayTeam: "BUF", homeTeam: "KC" }, "nfl");
    expect(unnamed.away.name).toBeUndefined();
    expect(unnamed.home.name).toBeUndefined();
  });

  it("prints the stored names on the strip's featured line", () => {
    render(<LiveGameStrip games={[pill(
      { id: "g1", awayTeam: OWNED.token, away_team_name: "Western Michigan Broncos", homeTeam: SHARED.token, home_team_name: SHARED.stored },
      "cfb",
    )]} />);
    expect(screen.getByText(/Western Michigan Broncos @ Rice Owls/)).toBeTruthy();
  });

  it("prints one stored name beside one bare token", () => {
    render(<LiveGameStrip games={[pill(
      { id: "g1", awayTeam: "CAT", homeTeam: SHARED.token, home_team_name: SHARED.stored },
      "cfb",
    )]} />);
    // CAT is Western Carolina, the one stored token no table resolves, and the
    // row carries no name for it. Per side: the half we know is named.
    expect(screen.getByText(/CAT @ Rice Owls/)).toBeTruthy();
  });
});

describe("surface 2 - the matchup line", () => {
  const rowFor = (game: AnyBoardGame | undefined, over: Partial<BoardSituation> = {}) =>
    toSituationRowData(gameSituation({ game, ...over }));

  it("names both sides from the row the situation came from", () => {
    const row = rowFor({ id: "g", away_team_name: "Western Michigan Broncos", home_team_name: SHARED.stored });
    expect(row.matchupLabel).toBe(`Western Michigan Broncos @ ${SHARED.stored}`);
  });

  it("still leaves `matchup` in tokens, because headline copy parses it", () => {
    const row = rowFor({ id: "g", away_team_name: "Western Michigan Broncos", home_team_name: SHARED.stored });
    expect(row.matchup).toBe("BRO @ OWL");
  });

  it("mixes a stored name with the lookup, per side", () => {
    const row = rowFor({ id: "g", home_team_name: SHARED.stored });
    expect(row.matchupLabel).toBe(`${OWNED.lookup} @ ${SHARED.stored}`);
  });

  it("labels an NFL matchup, which with no stored name has none", () => {
    const named = rowFor(
      { id: "g", away_team_name: "Buffalo Bills", home_team_name: "Kansas City Chiefs" },
      { league: "NFL", awayTeam: "BUF", homeTeam: "KC" },
    );
    expect(named.matchupLabel).toBe("Buffalo Bills @ Kansas City Chiefs");
    expect(named.matchup).toBe("BUF @ KC");

    const unnamed = rowFor(undefined, { league: "NFL", awayTeam: "BUF", homeTeam: "KC" });
    expect(unnamed.matchupLabel).toBeUndefined();
  });

  it("does not resolve the signal-sourced team/opponent branch", () => {
    // Still true with stored names in play: that branch has no games row, so
    // there is nothing to read and nothing to resolve.
    const row = rowFor(undefined, { awayTeam: undefined, homeTeam: undefined, team: "FLA", opponent: "BRO" });
    expect(row.matchup).toBe("FLA vs BRO");
    expect(row.matchupLabel).toBeUndefined();
  });

  it("shows the stored names on the story card", () => {
    const story = toSituationStoryCardData(
      rowFor({ id: "g", away_team_name: "Western Michigan Broncos", home_team_name: SHARED.stored }),
    );
    render(<SituationStoryCard story={story} />);
    expect(screen.getByText(`Western Michigan Broncos @ ${SHARED.stored}`)).toBeTruthy();
    // And never one of the other three schools that share the token.
    for (const other of ["Temple", "Florida Atlantic", "Kennesaw"]) {
      expect(screen.queryByText(new RegExp(other))).toBeNull();
    }
  });
});

describe("surface 3 - the card identity line", () => {
  const cfbIdentity = {
    awayTeam: OWNED.token,
    homeTeam: SHARED.token,
    team: OWNED.token,
    opponent: SHARED.token,
    sideKnown: true,
    sport: "cfb",
  } as SituationRowData["sportsIdentity"];

  it("names a shared token the lookup has to refuse", () => {
    const game: AnyBoardGame = { id: "g", awayTeam: OWNED.token, homeTeam: SHARED.token, home_team_name: SHARED.stored };
    expect(opponentLabelFor(cfbIdentity, { game, storyIsHome: false })).toBe(`at ${SHARED.stored}`);
  });

  it("names the away side for a home story", () => {
    // The away side is the SHARED token here, so a pass cannot come from the
    // lookup: only the stored name can produce this string.
    const identity = { ...cfbIdentity, team: SHARED.token, awayTeam: SHARED.token, homeTeam: OWNED.token };
    const game: AnyBoardGame = { id: "g", awayTeam: SHARED.token, awayTeamName: SHARED.stored, homeTeam: OWNED.token };
    expect(opponentLabelFor(identity, { game, storyIsHome: true })).toBe(`vs ${SHARED.stored}`);
  });

  it("keeps the token when the row stored no name and no lookup resolves it", () => {
    const game: AnyBoardGame = { id: "g", awayTeam: OWNED.token, homeTeam: SHARED.token };
    expect(opponentLabelFor(cfbIdentity, { game, storyIsHome: false })).toBe(`at ${SHARED.token}`);
  });

  it("names an NFL opponent from the stored name", () => {
    const identity = { team: "BUF", sport: "nfl" } as SituationRowData["sportsIdentity"];
    const game: AnyBoardGame = { id: "g", awayTeam: "KC", awayTeamName: "Kansas City Chiefs", homeTeam: "BUF" };
    expect(opponentLabelFor(identity, { game, storyIsHome: true })).toBe("vs Kansas City Chiefs");
    expect(opponentLabelFor(identity, { game: { id: "g", awayTeam: "KC", homeTeam: "BUF" }, storyIsHome: true }))
      .toBe("vs KC");
  });

  it("does not name the identity-only branch, which has no games row", () => {
    // sideKnown says the pair came from a games row, but the row itself is not
    // in hand here, so there is no stored name to read and the CFB lookup is
    // all that applies.
    expect(opponentLabelFor(cfbIdentity)).toBe(`at ${SHARED.token}`);
  });
});
