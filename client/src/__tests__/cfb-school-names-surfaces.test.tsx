/**
 * The three surfaces that printed a CFB mascot token at a reader.
 *
 *   matchup string   boardAdapters.toSituationRowData
 *   watch slate      LiveGameStrip's featured line, via toLiveGamePillData
 *   card             SituationStoryCard header + the "at X" identity line
 *
 * Two rules are under test everywhere: a token one school owns becomes that
 * school's name, and a token several schools share is left exactly as it is.
 * An NFL row is carried through each surface to prove the resolver is gated on
 * league and is not reaching tokens it has no business naming.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  opponentLabelFor,
  toLiveGamePillData,
  toSituationRowData,
  toSituationStoryCardData,
  type AnyBoardGame,
} from "@/components/board/boardAdapters";
import { LiveGameStrip } from "@/components/board/LiveGameStrip";
import { SituationStoryCard } from "@/components/board/SituationStoryCard";
import type { BoardSituation } from "@/lib/boardSituations";
import type { SituationRowData } from "@/components/board/SituationRow";

/** BRO is Western Michigan's alone. OWL is four schools. */
const UNAMBIGUOUS = { token: "BRO", school: "Western Michigan Broncos" };
const AMBIGUOUS = { token: "OWL" };

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

describe("surface 1 - the matchup string", () => {
  it("names the school on each side a single school owns", () => {
    const row = toSituationRowData(gameSituation({ awayTeam: "BRO", homeTeam: "TIG" }));
    expect(row.matchupLabel).toBe("Western Michigan Broncos @ Memphis Tigers");
  });

  it("falls back per side, keeping the token only where it is shared", () => {
    const row = toSituationRowData(gameSituation());
    expect(row.matchupLabel).toBe(`${UNAMBIGUOUS.school} @ ${AMBIGUOUS.token}`);
  });

  it("leaves the token matchup alone, because headline copy parses it", () => {
    const row = toSituationRowData(gameSituation());
    expect(row.matchup).toBe("BRO @ OWL");
  });

  it("does not resolve the signal-sourced team/opponent branch", () => {
    // FLA from an injury adapter genuinely IS Florida; from a games row it is
    // Kent State or Liberty. Only the games branch may be resolved.
    const row = toSituationRowData(
      gameSituation({ awayTeam: undefined, homeTeam: undefined, team: "FLA", opponent: "BRO" }),
    );
    expect(row.matchup).toBe("FLA vs BRO");
    expect(row.matchupLabel).toBeUndefined();
  });

  it("leaves an NFL row untouched", () => {
    const row = toSituationRowData(
      gameSituation({ league: "NFL", awayTeam: "KC", homeTeam: "BUF" }),
    );
    expect(row.matchup).toBe("KC @ BUF");
    expect(row.matchupLabel).toBeUndefined();
  });
});

describe("surface 2 - the watch slate", () => {
  const pill = (away: string, home: string, sport: "cfb" | "nfl") =>
    toLiveGamePillData({ id: "g1", awayTeam: away, homeTeam: home, status: "scheduled" }, 0, sport);

  it("carries the school name beside the abbreviation", () => {
    const data = pill("BRO", "TIG", "cfb");
    expect(data.away).toMatchObject({ abbreviation: "BRO", name: "Western Michigan Broncos" });
    expect(data.home).toMatchObject({ abbreviation: "TIG", name: "Memphis Tigers" });
  });

  it("carries no name for a shared token", () => {
    expect(pill("BRO", "OWL", "cfb").home.name).toBeUndefined();
  });

  it("carries no name for an NFL game", () => {
    const data = pill("KC", "BUF", "nfl");
    expect(data.away.name).toBeUndefined();
    expect(data.home.name).toBeUndefined();
  });

  it("prints the names on the strip's featured line, token where shared", () => {
    render(<LiveGameStrip games={[pill("BRO", "OWL", "cfb")]} />);
    expect(screen.getByText(/Western Michigan Broncos @ OWL/)).toBeTruthy();
  });

  it("prints NFL abbreviations on the featured line unchanged", () => {
    render(<LiveGameStrip games={[pill("KC", "BUF", "nfl")]} />);
    expect(screen.getByText(/KC @ BUF/)).toBeTruthy();
  });
});

describe("surface 3 - the card", () => {
  /**
   * Built through the real adapter chain from a game-derived situation, which
   * is the shape that actually carries games-table tokens. A pure game row has
   * no `team`, so `opponentLabelFor` returns undefined and the header matchup
   * is the thing on screen.
   */
  const card = (over: Partial<BoardSituation> = {}) =>
    toSituationStoryCardData(toSituationRowData(gameSituation(over)));

  it("shows school names in the header matchup", () => {
    const story = card({ awayTeam: "BRO", homeTeam: "TIG" });
    expect(story.matchup).toBe("Western Michigan Broncos @ Memphis Tigers");
    render(<SituationStoryCard story={story} />);
    expect(screen.getByText("Western Michigan Broncos @ Memphis Tigers")).toBeTruthy();
  });

  it("shows the token for a shared one, and never a guessed school", () => {
    const story = card();
    expect(story.matchup).toBe("Western Michigan Broncos @ OWL");
    render(<SituationStoryCard story={story} />);
    expect(screen.getByText("Western Michigan Broncos @ OWL")).toBeTruthy();
    for (const school of ["Rice", "Temple", "Florida Atlantic", "Kennesaw"]) {
      expect(screen.queryByText(new RegExp(school))).toBeNull();
    }
  });

  it("leaves an NFL card in abbreviations", () => {
    const story = card({ league: "NFL", awayTeam: "KC", homeTeam: "BUF" });
    expect(story.matchup).toBe("KC @ BUF");
    render(<SituationStoryCard story={story} />);
    expect(screen.getByText("KC @ BUF")).toBeTruthy();
  });

  const cfbIdentity = {
    awayTeam: "BRO",
    homeTeam: "TIG",
    team: "BRO",
    opponent: "TIG",
    sideKnown: true,
    sport: "cfb",
  } as SituationRowData["sportsIdentity"];

  it("names the school in the 'at X' identity line", () => {
    const game: AnyBoardGame = { id: "g", awayTeam: "BRO", homeTeam: "TIG" };
    expect(opponentLabelFor(cfbIdentity, { game, storyIsHome: false })).toBe("at Memphis Tigers");
  });

  it("keeps the token in the identity line when the token is shared", () => {
    const game: AnyBoardGame = { id: "g", awayTeam: "BRO", homeTeam: "OWL" };
    expect(opponentLabelFor(cfbIdentity, { game, storyIsHome: false })).toBe("at OWL");
  });

  it("does not print the opponent twice once both halves are school names", () => {
    // The header is dropped when the identity line already names the opponent.
    // That dedupe compared word-tokens, which no multi-word school name could
    // ever satisfy, so without the side-wise fix both would render.
    const story = toSituationStoryCardData(
      toSituationRowData(gameSituation({ homeTeam: "TIG", team: "BRO", opponent: "TIG" })),
    );
    expect(story.opponentLabel).toBe("at Memphis Tigers");
    render(<SituationStoryCard story={story} />);
    expect(screen.queryByText("Western Michigan Broncos @ Memphis Tigers")).toBeNull();
    expect(screen.getByTestId("story-where-when").textContent).toContain("at Memphis Tigers");
  });
});
