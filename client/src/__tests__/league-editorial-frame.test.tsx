import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EditorialLeadStory, LeagueEditorialPageFrame } from "@/components/board/LeagueEditorialPageFrame";
import { toQuietLeagueLeadStory, toSituationStoryCardData } from "@/components/board/boardAdapters";

describe("LeagueEditorialPageFrame", () => {
  it("renders a sports-media-first quiet MLB page structure", () => {
    const leadStory = {
      ...toQuietLeagueLeadStory("MLB"),
      headline: "No clean high-impact MLB stories right now.",
      dek: "The slate is in watch-board mode while lineup cards, starters, weather, bullpen use, and late scratches settle.",
      whatHappened: "No MLB item has enough team identity, source support, and sports impact to lead the board.",
      whyItMatters: "Keeping the lead compact avoids turning routine slate monitoring or opening-line-only context into false urgency.",
      watchNext: "Watch confirmed lineups, pitcher changes, weather cells, late scratches, and source-backed market movement.",
      relatedItems: [
        "Lineup cards posting before first pitch",
        "Probable and confirmed pitcher changes",
        "Weather cells affecting parks or totals",
        "Late scratches, bullpen load, and roster moves",
      ],
    };

    render(
      <LeagueEditorialPageFrame
        league="MLB"
        quickLinks={[
          { id: "lineups", label: "Lineups", detail: "Cards and scratches" },
          { id: "pitchers", label: "Pitchers", detail: "Starters and changes" },
        ]}
        headlines={[
          { id: "lineup-card", headline: "Lineup cards posting before first pitch", meta: "Before first pitch" },
          { id: "weather", headline: "Weather or park conditions affecting totals", meta: "Watch item" },
        ]}
        conversion={{
          title: "Get MLB alerts before first pitch",
          body: "Track lineup cards, pitching changes, bullpen availability, weather, roster moves, and market movement.",
          bullets: ["Early lineup and scratch alerts", "Pitching, bullpen, and weather context", "Confidence and timing"],
          ctaLabel: "Get MLB alerts",
        }}
        lead={<EditorialLeadStory story={leadStory} quiet />}
      />,
    );

    expect(screen.getByAltText("EdgeSetter")).toBeInTheDocument();
    expect(screen.getByText("Sports intelligence before the market catches up")).toBeInTheDocument();
    expect(screen.getByAltText("MLB Slate watch image")).toHaveAttribute("src", "/sports/mlb/featured-lead.jpg");
    fireEvent.error(screen.getByAltText("MLB Slate watch image"));
    expect(screen.getByAltText("MLB Slate watch image")).toHaveAttribute("src", "/sports/mlb/featured.jpg");
    expect(screen.getByText("MLB Watch")).toBeInTheDocument();
    expect(screen.getByText("Top Watch Items")).toBeInTheDocument();
    expect(screen.getByText("Get MLB alerts before first pitch")).toBeInTheDocument();
    expect(screen.getByText("Get MLB alerts")).toBeInTheDocument();
    expect(screen.getAllByText("No clean high-impact MLB stories right now.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Lineup cards posting before first pitch").length).toBeGreaterThan(0);
    expect(screen.getByText("What happened")).toBeInTheDocument();
    expect(screen.getByText("Why it matters")).toBeInTheDocument();
    expect(screen.getByText("Watch next")).toBeInTheDocument();
    expect(screen.getByText("EdgeSetter Intelligence")).toBeInTheDocument();
    expect(screen.getByText("Source trail")).toBeInTheDocument();
    expect(screen.getByText("No elevated story yet")).toBeInTheDocument();
    expect(screen.queryByText("Top Developing Story")).not.toBeInTheDocument();
    expect(screen.getByRole("article")).toHaveClass("editorial-lead-story-quiet");
  });

  it("tightens raw report headlines for editorial lead use", () => {
    const story = toSituationStoryCardData({
      id: "raw-injury",
      title: "Mitchell Robinson (Robinson (finger) was diagnosed with a broken right pinky, Fred Katz reports. He is without a return timetable.) — OUT",
      subtitle: "Robinson was diagnosed with a broken right pinky and is without a return timetable.",
      league: "NBA",
      statusLabel: "Developing",
      sportsIdentity: { player: "Mitchell Robinson", team: "Knicks", sport: "nba" },
    });

    expect(story.headline).toBe("Mitchell Robinson finger injury puts Knicks availability in focus");
    expect(story.whatHappened).toBe("Robinson was diagnosed with a broken right pinky and is without a return timetable.");
    expect(story.whyItMatters).toBe("Availability changes can shift starters, rotations, usage, and pre-tip pricing.");
    expect(story.watchNext).toBe("Watch for the next official status update, warmup/report confirmation, and role impact.");
  });
});
