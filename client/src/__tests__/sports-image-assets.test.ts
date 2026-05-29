import { describe, expect, it } from "vitest";

import { resolveSportsImageAsset } from "@/lib/sportsImageAssets";

describe("sports image asset resolver", () => {
  it("resolves deterministic league default candidates without remote URLs", () => {
    const asset = resolveSportsImageAsset({ league: "MLB" });

    expect(asset.slot).toBe("featured");
    expect(asset.candidateSrcs).toEqual([
      "/sports/mlb/featured.jpg",
      "/sports/mlb/default.jpg",
      "/sports/featured.jpg",
      "/sports/default.jpg",
    ]);
    expect(asset.candidateSrcs.every((src) => src.startsWith("/sports/"))).toBe(true);
  });

  it("prioritizes team, opponent, story context, slot, then fallbacks", () => {
    const asset = resolveSportsImageAsset({
      league: "NBA",
      team: "New York Knicks",
      opponent: "Boston Celtics",
      storyType: "Availability Pressure",
      slot: "hero",
    });

    expect(asset.candidateSrcs).toEqual([
      "/sports/teams/new-york-knicks.jpg",
      "/sports/teams/boston-celtics.jpg",
      "/sports/nba/availability-pressure.jpg",
      "/sports/nba/hero.jpg",
      "/sports/nba/default.jpg",
      "/sports/hero.jpg",
      "/sports/default.jpg",
    ]);
  });

  it("normalizes team names predictably", () => {
    const asset = resolveSportsImageAsset({
      sport: "NFL",
      team: "L.A. Rams & Staff",
      slot: "matchup",
    });

    expect(asset.candidateSrcs[0]).toBe("/sports/teams/l-a-rams-and-staff.jpg");
    expect(asset.candidateSrcs).toContain("/sports/nfl/matchup.jpg");
  });

  it("maps college football aliases to cfb paths", () => {
    const asset = resolveSportsImageAsset({
      sport: "College Football",
      storyType: "QB Depth",
      slot: "drawer",
    });

    expect(asset.candidateSrcs).toEqual([
      "/sports/cfb/qb-depth.jpg",
      "/sports/cfb/drawer.jpg",
      "/sports/cfb/default.jpg",
      "/sports/drawer.jpg",
      "/sports/default.jpg",
    ]);
  });
});
