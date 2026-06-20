import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import MobileTabBar from "@/components/MobileTabBar";
import { LiveGamePill } from "@/components/board/LiveGamePill";
import { StoryCard, type StoryCardData } from "@/components/StoryCard";

function publicStory(overrides: Partial<StoryCardData> = {}): StoryCardData {
  return {
    id: "story-1",
    league: "MLB",
    headline: "UNK market move leads MLB watch",
    dek: "UNK context should not render.",
    primaryTeam: "UNK",
    player: "Nick Sogard",
    storyType: "Availability watch",
    whatChanged: "UNK changed.",
    whyItMatters: "UNK matters.",
    watchNext: "Watch UNK.",
    overlay: {
      escalationState: "Emerging",
      confidence: { current: 70, delta: null, explanation: "testing" },
      sourceSummary: { count: 1, convergence: "Single source" },
      timing: { window: "Developing", freshnessLabel: "now" },
      replay: ["Testing"],
      status: "Story support",
    },
    ...overrides,
  };
}

describe("subscriber readiness render regressions", () => {
  it("sanitizes public story card copy and metadata before rendering", () => {
    render(<StoryCard story={publicStory()} copyVariant="public" />);

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\bUNK\b/);
    expect(screen.getByRole("heading", { name: "Availability watch" })).toBeInTheDocument();
    expect(text).toContain("Watch for source convergence and official movement.");
  });

  it("renders NFL game strip badges without Alert or Confirmed labels", () => {
    render(
      <LiveGamePill
        game={{
          id: "nfl-1",
          away: { abbreviation: "SF" },
          home: { abbreviation: "DAL" },
          status: "scheduled",
          escalationCount: 4,
          confirmedCount: 4,
        }}
      />,
    );

    const text = document.body.textContent ?? "";
    expect(text).toContain("Story watch 4");
    expect(text).toContain("Verified notes 4");
    expect(text).not.toContain("Alert 4");
    expect(text).not.toContain("Confirmed 4");
  });

  it("uses safe-area-aware fixed mobile nav sizing", () => {
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });

    render(<MobileTabBar />);

    const nav = screen.getByLabelText("Bottom navigation");
    expect(nav).toHaveStyle({ width: "100vw", maxWidth: "100vw" });
    expect(nav.getAttribute("style")).toContain("76px");
    expect(nav.getAttribute("style")).toContain("safe-area-inset-bottom");
  });
});
