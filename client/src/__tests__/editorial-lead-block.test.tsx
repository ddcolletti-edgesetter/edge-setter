import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FeaturedSituation } from "@/components/board/FeaturedSituation";
import type { SituationRowData } from "@/components/board/SituationRow";

describe("Editorial league lead block", () => {
  it("renders MLB quiet state as watch-board sports content", () => {
    render(
      <FeaturedSituation
        eyebrow="MLB Watch Board"
        title="Today's MLB watch: lineups, pitchers, weather, and late scratches"
        summary="EdgeSetter is tracking confirmed lineups, pitcher changes, bullpen usage, weather cells, injury updates, and market movement across today's slate."
        presentation="story"
        league="MLB"
        actions={[{ label: "Open Watch Board" }]}
      />,
    );

    expect(screen.getByText("MLB Watch Board")).toBeInTheDocument();
    expect(screen.getAllByText("Today's MLB watch: lineups, pitchers, weather, and late scratches").length).toBeGreaterThan(0);
    expect(screen.getByText("Lineup cards posting before first pitch")).toBeInTheDocument();
    expect(screen.getByText("EdgeSetter Intelligence")).toBeInTheDocument();
    expect(screen.getByText("Nothing verified yet")).toBeInTheDocument();
    expect(screen.queryByText("Top Developing Story")).not.toBeInTheDocument();
    expect(screen.queryByText("No developing story is above the monitoring threshold yet.")).not.toBeInTheDocument();
  });

  it("uses Top Developing Story only for an actual elevated story", () => {
    const situation: SituationRowData = {
      id: "signal-1",
      title: "Knicks starter status shifts before tip",
      subtitle: "Warmup reporting changed the availability read.",
      league: "NBA",
      sourceCount: 3,
      statusLabel: "Developing",
      lifecycleLabel: "Escalating",
      timingStageLabel: "early signal",
      evidenceCount: 4,
      metrics: [{ label: "Confidence", value: "82%" }],
      sportsIdentity: { team: "New York Knicks", opponent: "Boston Celtics", sport: "nba" },
    };

    render(
      <FeaturedSituation
        situation={situation}
        eyebrow="Top Developing Story"
        presentation="story"
        league="NBA"
        actions={[{ label: "Open Story" }]}
      />,
    );

    expect(screen.getByText("Top Developing Story")).toBeInTheDocument();
    expect(screen.getAllByText("Late New York Knicks starter update could change rotation plans").length).toBeGreaterThan(0);
    expect(screen.getByText("EdgeSetter Intelligence")).toBeInTheDocument();
    expect(screen.getByText("Open Story")).toBeInTheDocument();
  });
});
