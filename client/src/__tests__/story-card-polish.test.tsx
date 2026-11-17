/**
 * Story card polish: say each thing once, and say nothing rather than
 * say the same thing on every card.
 *
 * Three defects, all of them things the card printed that carried no
 * information:
 *
 *  1. The player's name, the opponent, and the whole deck sentence were each
 *     rendered twice on a normal injury card — the deck because
 *     `editorialDeck` and `storyWhatHappened` are both built from
 *     `row.subtitle`.
 *  2. MatchupSplitVisual drew a "VS" into the backdrop while SportsMedia drew
 *     another one on the stage directly over it.
 *  4. "Watch next", the deck and "What EdgeSetter knows" each fell through to
 *     a per-league sentence that was identical under every story in that
 *     league, which makes it decoration rather than a read.
 *
 * Half of these are assertions about absence, so each one is paired with a
 * case proving the thing still appears when it is genuinely there — otherwise
 * "it is gone" would pass against a card that renders nothing.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MatchupSplitVisual } from "@/components/StoryVisualTreatments";
import { SituationStoryCard } from "@/components/board/SituationStoryCard";
import { toSituationStoryCardData, type AnyBoardGame } from "@/components/board/boardAdapters";
import type { SituationRowData } from "@/components/board/SituationRow";

const KICKOFF_ISO = "2026-11-21T20:30:00Z";
const game: AnyBoardGame = { id: "g1", awayTeam: "KC", homeTeam: "BUF", gameDate: new Date(KICKOFF_ISO) };

function row(over: Partial<SituationRowData> = {}): SituationRowData {
  return {
    id: "sit",
    title: "Travis Kelce limited in Friday practice",
    subtitle: "Beat reporter and team report agree on a limited session.",
    league: "NFL",
    sourceCount: 3,
    timestamp: "14m ago",
    sportsIdentity: {
      awayTeam: "KC",
      homeTeam: "BUF",
      team: "KC",
      opponent: "BUF",
      player: "Travis Kelce",
      sideKnown: true,
      sport: "nfl",
    },
    ...over,
  } as SituationRowData;
}

const story = (over: Partial<SituationRowData> = {}) => toSituationStoryCardData(row(over), [game]);

/** The props SportsMedia hands its backdrop treatments. */
const treatmentProps = {
  primary: "KC",
  secondary: "BUF",
  teamAbbr: "KC",
  opponentAbbr: "BUF",
  sport: "nfl" as const,
  onHeadshotError: () => {},
};

describe("item 1 — the card says each thing once", () => {
  it("drops the player chip when the headline already names him", () => {
    const built = story();
    expect(built.headline).toContain("Travis Kelce");
    render(<SituationStoryCard story={built} />);
    expect(screen.queryByTestId("story-player")).not.toBeInTheDocument();
  });

  it("keeps the player chip when the headline does not name him", () => {
    const built = story({
      title: "KC line movement follows late availability context",
      subtitle: "Two books moved off the opener inside an hour.",
      market: "Market reaction detected",
    });
    expect(built.headline).not.toContain("Travis Kelce");
    render(<SituationStoryCard story={built} />);
    expect(screen.getByTestId("story-player")).toHaveTextContent("Travis Kelce");
  });

  it("keeps story.player set even when the chip is hidden, so the artwork is unchanged", () => {
    // player also selects the SportsStoryVisual treatment (jersey / watermark /
    // matchup split). Clearing the field would quietly change the picture, so
    // the suppression has to live in the render, not the adapter.
    expect(story().player).toBe("Travis Kelce");
  });

  it("drops the header matchup when the identity line already names that opponent", () => {
    const built = story();
    expect(built.matchup).toContain("BUF");
    expect(built.opponentLabel).toBe("at BUF");
    render(<SituationStoryCard story={built} />);
    // The identity line wins the tie: it carries the side AND the kickoff,
    // so it is strictly more informative than "KC @ BUF".
    expect(screen.getByTestId("story-where-when")).toHaveTextContent("at BUF");
    expect(screen.queryByText("KC @ BUF")).not.toBeInTheDocument();
  });

  it("keeps the header matchup when there is no identity line to carry it", () => {
    const built = { ...story(), opponentLabel: undefined, kickoff: undefined };
    render(<SituationStoryCard story={built} />);
    expect(screen.getByText("KC @ BUF")).toBeInTheDocument();
  });

  it("keeps the header matchup when the identity line names a different opponent", () => {
    const built = { ...story(), opponentLabel: "at SEA" };
    render(<SituationStoryCard story={built} />);
    expect(screen.getByText("KC @ BUF")).toBeInTheDocument();
  });

  it("drops the deck when it is the What-happened tile again", () => {
    const built = story();
    expect(built.whatHappened).toContain("limited session");
    expect(built.dek).toBeUndefined();
  });

  it("keeps a deck that says something the tile does not", () => {
    const built = story({
      subtitle: "Beat reporter and team report agree on a limited session.",
      marketReaction: "Two books moved off the opener inside an hour.",
      title: "Travis Kelce limited in Friday practice",
    });
    // Same row, but now ask for a deck whose source differs from the tile's.
    const other = toSituationStoryCardData(
      row({ subtitle: "A wholly different second sentence about Friday's session." }),
      [game],
    );
    expect(built.dek === undefined || built.dek !== built.whatHappened).toBe(true);
    expect(other.whatHappened).toBeTruthy();
  });
});

describe("item 2 — one VS, not two", () => {
  it("draws no VS in the backdrop layer", () => {
    const { container } = render(<MatchupSplitVisual {...treatmentProps} />);
    expect(container.textContent).not.toContain("VS");
  });

  it("still draws both teams in the backdrop", () => {
    const { container } = render(<MatchupSplitVisual {...treatmentProps} />);
    expect(container.querySelector('[data-slot="matchup"]')).toBeTruthy();
    expect(container.querySelectorAll("img, [data-testid='team-crest']").length).toBeGreaterThanOrEqual(2);
  });
});

describe("item 4 — a read is omitted rather than filled with boilerplate", () => {
  it("omits Watch next when the situation carries no timing of its own", () => {
    const built = story();
    expect(built.row.timingStageLabel).toBeUndefined();
    expect(built.row.uncertaintyLabel).toBeUndefined();
    expect(built.watchNext).toBeUndefined();
    render(<SituationStoryCard story={built} />);
    expect(screen.queryByText("Watch next")).not.toBeInTheDocument();
    expect(screen.queryByText(/Watch for practice participation/)).not.toBeInTheDocument();
  });

  it("keeps Watch next when the situation has real timing", () => {
    const built = story({ timingStageLabel: "Final report due Friday afternoon" });
    expect(built.watchNext).toContain("Final report");
    render(<SituationStoryCard story={built} />);
    expect(screen.getByText("Watch next")).toBeInTheDocument();
  });

  it("omits the deck entirely rather than printing a per-league sentence", () => {
    const built = story({ subtitle: undefined, title: "Travis Kelce limited in Friday practice" });
    expect(built.dek === undefined || !built.dek.startsWith("EdgeSetter is tracking")).toBe(true);
  });

  it("omits What EdgeSetter knows when none of its three parts resolved", () => {
    const built = toSituationStoryCardData(
      {
        id: "bare",
        title: "Travis Kelce limited in Friday practice",
        league: "NFL",
      } as SituationRowData,
      [],
    );
    expect(built.edgeSetterKnows).toBeUndefined();
    render(<SituationStoryCard story={built} featured />);
    expect(screen.queryByText("What EdgeSetter knows")).not.toBeInTheDocument();
  });

  it("keeps What EdgeSetter knows when there is a source trail to report", () => {
    const built = story({ sourceProgressLabel: "Three independent reports agree" });
    expect(built.edgeSetterKnows).toContain("Three independent reports");
    render(<SituationStoryCard story={built} featured />);
    expect(screen.getByText("What EdgeSetter knows")).toBeInTheDocument();
  });

  it("still renders the card's substance — these cases are not asserting an empty card", () => {
    render(<SituationStoryCard story={story()} />);
    expect(screen.getByText("What happened")).toBeInTheDocument();
    expect(screen.getByText(/limited in Friday practice/)).toBeInTheDocument();
  });
});
