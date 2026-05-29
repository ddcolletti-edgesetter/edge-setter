import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SportsStoryVisual } from "@/components/SportsMedia";

describe("SportsStoryVisual image slots", () => {
  it("uses provided alt text for local image candidates", () => {
    render(
      <SportsStoryVisual
        league="MLB"
        primaryTeam="TOR"
        secondaryTeam="MIA"
        title="TOR vs MIA watch window"
        imageAsset={{
          alt: "MLB matchup image: TOR / MIA",
          candidateSrcs: ["/sports/mlb/matchup.jpg"],
          slot: "matchup",
        }}
      />,
    );

    expect(screen.getByAltText("MLB matchup image: TOR / MIA")).toHaveAttribute("src", "/sports/mlb/matchup.jpg");
  });

  it("falls back to the static sports visual after all image candidates fail", () => {
    render(
      <SportsStoryVisual
        league="NBA"
        primaryTeam="New York Knicks"
        secondaryTeam="Boston Celtics"
        title="Availability watch"
        imageAsset={{
          alt: "NBA matchup image",
          candidateSrcs: ["/sports/teams/new-york-knicks.jpg", "/sports/nba/default.jpg"],
          slot: "featured",
        }}
      />,
    );

    fireEvent.error(screen.getByAltText("NBA matchup image"));
    expect(screen.getByAltText("NBA matchup image")).toHaveAttribute("src", "/sports/nba/default.jpg");

    fireEvent.error(screen.getByAltText("NBA matchup image"));
    expect(screen.queryByAltText("NBA matchup image")).not.toBeInTheDocument();
    expect(screen.getByAltText("NYK")).toBeInTheDocument();
    expect(screen.getByAltText("BOS")).toBeInTheDocument();
  });
});
