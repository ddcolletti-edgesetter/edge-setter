import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SportsStoryVisual } from "@/components/SportsMedia";

describe("SportsStoryVisual treatments", () => {
  it("renders the jersey-number treatment (headshot + chip) for a player with a jersey", () => {
    render(
      <SportsStoryVisual
        league="NFL"
        primaryTeam="SF"
        player="Brandon Aiyuk"
        playerEspnId="4360438"
        playerJersey="11"
        position="WR"
        title="Availability watch"
      />,
    );

    const headshot = screen.getByTestId("homepage-story-image");
    expect(headshot).toHaveAttribute("src", "https://a.espncdn.com/i/headshots/nfl/players/full/4360438.png");
    expect(screen.getByText("#11 · WR")).toBeInTheDocument();
  });

  it("renders the watermark treatment (headshot, no jersey) when no jersey is present", () => {
    render(
      <SportsStoryVisual
        league="NFL"
        primaryTeam="SF"
        player="Brandon Aiyuk"
        playerEspnId="4360438"
        title="Availability watch"
      />,
    );

    expect(screen.getByTestId("homepage-story-image")).toHaveAttribute(
      "src",
      "https://a.espncdn.com/i/headshots/nfl/players/full/4360438.png",
    );
    // No jersey → no number chip.
    expect(screen.queryByText(/^#/)).not.toBeInTheDocument();
  });

  it("drops the headshot to a photo-free treatment when it 404s", () => {
    render(
      <SportsStoryVisual
        league="NFL"
        primaryTeam="SF"
        secondaryTeam="SEA"
        player="Brandon Aiyuk"
        playerEspnId="4360438"
        title="Availability watch"
      />,
    );

    // Headshot resolves first, then 404s → the visual drops back to the matchup
    // split (two teams), which carries no photo element.
    fireEvent.error(screen.getByTestId("homepage-story-image"));
    expect(screen.queryByTestId("homepage-story-image")).not.toBeInTheDocument();
  });

  it("renders the matchup split (no photo) for two teams with no confirmed player", () => {
    render(
      <SportsStoryVisual
        league="NFL"
        primaryTeam="SF"
        secondaryTeam="SEA"
        title="SF vs SEA watch window"
      />,
    );

    expect(screen.queryByTestId("homepage-story-image")).not.toBeInTheDocument();
    // Both team badges render (treatment backdrop + foreground stage).
    expect(screen.getAllByAltText("SF").length).toBeGreaterThan(0);
    expect(screen.getAllByAltText("SEA").length).toBeGreaterThan(0);
  });
});
