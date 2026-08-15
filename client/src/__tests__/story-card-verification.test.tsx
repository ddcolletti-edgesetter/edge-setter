import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StoryCard, confidenceDisplay, type StoryCardData } from "@/components/StoryCard";
import type { EdgeSetterOverlayData } from "@/components/EdgeSetterOverlay";
import type { VerificationStateResult } from "@shared/verification-state";

// PR-B: with the VITE_VERIFICATION_STATE_HOMEPAGE flag on, StoryCard surfaces the
// shared verification word ("Verified" / "Escalating" / "Developing") in place of
// the raw confidence percentage. Flag off keeps the legacy percentage lineage.
// The flag reaches StoryCard as a prop (LiveIntelligenceHome reads the env once in
// its render body and threads it down), so these tests drive the prop directly.

const verification: VerificationStateResult = {
  state: "Escalating",
  basis: "Lone confirmed report; corroboration still pending.",
};

function story(overrideOverlay: Partial<EdgeSetterOverlayData> = {}): StoryCardData {
  return {
    id: "story-1",
    league: "NFL",
    headline: "Star WR ruled out",
    storyType: "Availability watch",
    whatChanged: "Player moved to OUT.",
    whyItMatters: "Passing game plan shifts.",
    watchNext: "Watch for confirmation.",
    overlay: {
      // escalationState deliberately differs from the verification word so any
      // "Escalating" text we assert on can only have come from the shared word.
      escalationState: "Monitoring",
      verification,
      confidence: { current: 60, delta: null, explanation: "testing" },
      sourceSummary: { count: 1, convergence: "Single source" },
      timing: { window: "Developing", freshnessLabel: "now" },
      replay: ["Testing"],
      status: "Story support",
      ...overrideOverlay,
    },
  };
}

describe("StoryCard — verification-state display", () => {
  it("shows the raw confidence percentage when the flag is off", () => {
    const { container } = render(<StoryCard story={story()} variant="rail" />);
    const text = container.textContent ?? "";

    expect(text).toContain("60%");
    expect(container.querySelector('[data-verification-word="true"]')).toBeNull();

    const pill = container.querySelector(".story-card-conf");
    expect(pill?.textContent).toContain("60%");
    expect(pill?.textContent).not.toBe("Escalating");
  });

  it("shows the verification word and no percentage when the flag is on", () => {
    const { container } = render(<StoryCard story={story()} variant="rail" verificationStateEnabled />);
    const text = container.textContent ?? "";

    expect(text).not.toContain("60%");

    const word = container.querySelector('[data-verification-word="true"]');
    expect(word?.textContent).toBe("Escalating");

    const pill = container.querySelector(".story-card-conf");
    expect(pill?.textContent).toBe("Escalating");
  });

  it("falls back to the percentage when the flag is on but no verification word is attached", () => {
    const { container } = render(
      <StoryCard story={story({ verification: null })} variant="rail" verificationStateEnabled />,
    );
    const text = container.textContent ?? "";

    expect(text).toContain("60%");
    expect(container.querySelector('[data-verification-word="true"]')).toBeNull();
  });
});

describe("confidenceDisplay — flag-gated word mapping", () => {
  it("maps each verification word to a tone when the flag is on", () => {
    expect(confidenceDisplay({ verification: { state: "Verified", basis: "" } }, true)).toEqual({
      text: "Verified",
      tone: "verified",
    });
    expect(confidenceDisplay({ verification: { state: "Escalating", basis: "" } }, true)).toEqual({
      text: "Escalating",
      tone: "strong",
    });
    expect(confidenceDisplay({ verification: { state: "Developing", basis: "" } }, true)).toEqual({
      text: "Developing",
      tone: "forming",
    });
  });

  it("ignores the verification word and keeps the percentage when the flag is off", () => {
    const read = confidenceDisplay(
      { verification: { state: "Verified", basis: "" }, confidence: { current: 60 } },
      false,
    );
    expect(read.text).toContain("60%");
  });
});
