import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { publicConfidenceLabel } from "@/lib/storyLanguage";
import { boardSortFeedback } from "@/lib/signalBoardUx";
import { confidenceDisplay, StoryCard, type StoryCardData } from "@/components/StoryCard";
import { EdgeSetterOverlay, type EdgeSetterOverlayData } from "@/components/EdgeSetterOverlay";

// ─────────────────────────────────────────────────────────────────────────────
// Confidence-display honesty guard.
//
// `live_signals.confidence` is a blended prior of hardcoded source constants, not
// a calibrated probability, and no accuracy calibration has ever run in prod. So
// customer-facing surfaces must NEVER present it as a bare percentage or claim it
// is "calibrated". They render qualitative signal-strength tiers via
// `publicConfidenceLabel` instead. This test locks that contract so a future edit
// can't silently reintroduce a "92%"-style claim.
//
// NOTE: this is a display-language guard only. It does not touch how confidence is
// computed, sorted, or ranked — those stay numeric internally.
// ─────────────────────────────────────────────────────────────────────────────

const PERCENT = /\d+\s*%/;
const TIERS = ["Strong pattern match", "Strong support", "Still forming", "Needs more confirmation"];

describe("confidence display honesty — qualitative tiers, never a bare percentage", () => {
  it("maps every confidence number to a qualitative tier that carries no percentage", () => {
    for (const value of [0, 20, 40, 54, 55, 60, 69, 70, 84, 85, 92, 100]) {
      const label = publicConfidenceLabel(value);
      expect(TIERS).toContain(label);
      expect(label).not.toMatch(PERCENT);
    }
    // Exact band boundaries (locks the vocabulary the UI depends on).
    expect(publicConfidenceLabel(92)).toBe("Strong pattern match");
    expect(publicConfidenceLabel(72)).toBe("Strong support");
    expect(publicConfidenceLabel(60)).toBe("Still forming");
    expect(publicConfidenceLabel(40)).toBe("Needs more confirmation");
  });

  it("board confidence-sort feedback no longer claims the score is calibrated", () => {
    const feedback = boardSortFeedback("confidence");
    expect(feedback.toLowerCase()).not.toContain("calibrated");
    expect(feedback).toBe("Showing the strongest signals first.");
  });

  it("StoryCard.confidenceDisplay never emits a percentage on the legacy (flag-off) path", () => {
    for (const current of [45, 60, 74, 88, 96]) {
      const read = confidenceDisplay({ confidence: { current } }, false);
      expect(read.text).not.toMatch(PERCENT);
      expect(TIERS).toContain(read.text);
    }
    // Confirmed/official still reads as the verification word, not a number.
    expect(confidenceDisplay({ escalationState: "Official", confidence: { current: 100 } }, false).text).toBe("Verified");
  });

  function overlay(overrides: Partial<EdgeSetterOverlayData> = {}): EdgeSetterOverlayData {
    return {
      escalationState: "Monitoring",
      verification: null,
      confidence: { current: 88, delta: 2, explanation: "x" },
      sourceSummary: { count: 2, convergence: "Corroborated" },
      timing: { window: "Developing", freshnessLabel: "now" },
      ...overrides,
    };
  }

  it("EdgeSetterOverlay renders a tier, not a percentage, in its confidence-support cell (flag off)", () => {
    const { container } = render(<EdgeSetterOverlay data={overlay()} copyVariant="editorial" />);
    const text = container.textContent ?? "";
    expect(text).toContain("Strong pattern match");
    expect(text).not.toMatch(PERCENT);
  });

  function story(overlayData: Partial<EdgeSetterOverlayData> = {}): StoryCardData {
    return {
      id: "s-1",
      league: "NFL",
      headline: "Star WR ruled out",
      storyType: "Availability watch",
      whatChanged: "Player moved to OUT.",
      whyItMatters: "Passing game plan shifts.",
      watchNext: "Watch for confirmation.",
      overlay: {
        escalationState: "Monitoring",
        verification: null,
        confidence: { current: 88, delta: null, explanation: "testing" },
        sourceSummary: { count: 2, convergence: "Corroborated" },
        timing: { window: "Developing", freshnessLabel: "now" },
        replay: ["Testing"],
        status: "Story support",
        ...overlayData,
      },
    };
  }

  it("StoryCard rail footer shows a tier, not a percentage (flag off, the prod default)", () => {
    const { container } = render(<StoryCard story={story()} variant="rail" copyVariant="public" />);
    const pill = container.querySelector(".story-card-conf");
    expect(pill?.textContent).toBe("Strong pattern match");
    expect((container.textContent ?? "")).not.toMatch(PERCENT);
  });
});
