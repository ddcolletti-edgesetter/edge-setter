import { describe, expect, it } from "vitest";

import { toSituationStoryCardData } from "@/components/board/boardAdapters";
import type { SituationRowData } from "@/components/board/SituationRow";

/**
 * Regression guard for the cross-league content leak: an NFL / CFB story board
 * was rendering the headline "NBA line movement follows late availability
 * context" because editorialHeadline() hard-coded "NBA" as its fallback label
 * for every non-MLB league. The data was correctly league-filtered; the leak
 * was purely in the render-time headline generator.
 *
 * A story board must never render a story headline that names a league other
 * than the story's own league.
 */

const ALL_LEAGUES = ["NFL", "CFB", "NBA", "MLB"] as const;

function marketRowWithoutMatchup(league: string): SituationRowData {
  // Market-dominant context with NO clean team/matchup identity -> exercises the
  // fallback branch of editorialHeadline that used to emit a hard-coded "NBA".
  return {
    id: `market-${league}`,
    title: "Market reacting before public confirmation",
    subtitle: "Line movement detected ahead of the broader market",
    league,
    market: "Market reaction detected",
  };
}

function foreignLeagueTokens(league: string): string[] {
  return ALL_LEAGUES.filter((other) => other !== league);
}

describe("story board headlines never leak another league", () => {
  it.each(["NFL", "CFB"])(
    "%s market story does not render an NBA (or other foreign-league) headline",
    (league) => {
      const story = toSituationStoryCardData(marketRowWithoutMatchup(league));

      expect(story.league).toBe(league);
      // The exact string the live-site audit caught.
      expect(story.headline).not.toContain("NBA line movement follows late availability context");
      for (const token of foreignLeagueTokens(league)) {
        expect(story.headline).not.toContain(token);
      }
    },
  );

  it("keeps the guard across every league (no foreign league name in the headline)", () => {
    for (const league of ALL_LEAGUES) {
      const story = toSituationStoryCardData(marketRowWithoutMatchup(league));
      expect(story.league).toBe(league);
      for (const token of foreignLeagueTokens(league)) {
        expect(story.headline).not.toContain(token);
      }
    }
  });

  it("also guards the lineup/starter fallback branch", () => {
    for (const league of ["NFL", "CFB"] as const) {
      const story = toSituationStoryCardData({
        id: `lineup-${league}`,
        title: "Starter status under review",
        subtitle: "Lineup change being evaluated",
        league,
      });
      expect(story.league).toBe(league);
      for (const token of foreignLeagueTokens(league)) {
        expect(story.headline).not.toContain(token);
      }
    }
  });
});
