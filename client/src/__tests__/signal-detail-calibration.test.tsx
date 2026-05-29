import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SignalDetailDrawer, type SignalDetailLike } from "@/components/SignalDetailDrawer";

const baseSignal: SignalDetailLike = {
  id: "calibration-test",
  headline: "Starter status moving toward confirmation",
  detail: "Team source and market context are being monitored.",
  team: "DAL",
  player: "Sample Player",
  type: "availability",
  confidence: 74,
  source_count: 2,
  timestamp: "12m ago",
};

function renderDrawer(signal: SignalDetailLike) {
  return render(<SignalDetailDrawer open signal={signal} sport="NBA" onClose={() => undefined} />);
}

describe("SignalDetailDrawer calibration visibility", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
  });

  it("renders backend calibration fields when they are present", () => {
    renderDrawer({
      ...baseSignal,
      historicalPatternLabel: "Comparable replay pattern; outcome pending",
      historicalPatternConfidence: "limited_sample",
      historicalPatternBasis: ["Matched on league, story type, lifecycle, and source depth."],
      comparableStoryType: "availability story",
      sourceTimingProfile: "source timing compared where available",
      sourceReliabilityBasis: "two attached source checks",
      marketReactionWindow: "comparable movement pattern",
      confirmationSignals: ["second independent source"],
      weakeningSignals: ["contradicting team report"],
      calibrationSummary: "Replay-verified comparable pattern; insufficient settled sample.",
      calibrationLimitations: ["Outcome linkage unavailable for this story view."],
    });

    expect(screen.getAllByText("Historical calibration").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Comparable replay pattern; outcome pending").length).toBeGreaterThan(0);
    expect(screen.getByText("Replay-verified comparable pattern; insufficient settled sample.")).toBeInTheDocument();
    expect(screen.getByText("source timing compared where available")).toBeInTheDocument();
    expect(screen.getByText("two attached source checks")).toBeInTheDocument();
    expect(screen.getByText("second independent source")).toBeInTheDocument();
    expect(screen.getByText("contradicting team report")).toBeInTheDocument();
  });

  it("renders honest fallback language when calibration fields are missing", () => {
    renderDrawer(baseSignal);

    expect(screen.getAllByText("Calibration pending").length).toBeGreaterThan(0);
    expect(screen.getByText("Replay-only comparison until comparable outcome linkage is available.")).toBeInTheDocument();
    expect(screen.getAllByText(/Outcome linkage unavailable/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("Recent hit rate")).not.toBeInTheDocument();
  });

  it("does not display unsupported exact accuracy or CLV claims from calibration text", () => {
    renderDrawer({
      ...baseSignal,
      historicalPatternLabel: "This pattern wins 74%",
      calibrationSummary: "Agents predict this is 88% accurate",
      calibrationLimitations: ["positive CLV support"],
      accuracyContext: {
        comparableOutcomes: "prediction accuracy 61%",
      },
    });

    expect(screen.queryByText(/wins 74%/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/88% accurate/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/positive CLV/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/prediction accuracy 61%/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Calibration pending|Historical calibration is pending|Outcome linkage unavailable/i).length).toBeGreaterThan(0);
  });
});
