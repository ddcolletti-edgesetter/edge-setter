import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FeaturedSituation } from "@/components/board/FeaturedSituation";
import type { SituationRowData } from "@/components/board/SituationRow";

// The featured board card must only surface the raw evidence-grounded
// verification word ("Verified" / "Escalating" / "Developing") when the
// VITE_VERIFICATION_STATE_HOMEPAGE flag is on — the same gate the homepage
// honors via EdgeSetterOverlay. With the flag off it falls back to plain public
// status copy, and that copy must never leak a raw lowercase state token.

function makeRow(overrides: Partial<SituationRowData> = {}): SituationRowData {
  return {
    id: "sit-1",
    title: "Star QB listed questionable",
    league: "CFB",
    ...overrides,
  };
}

// Reads the value rendered inside the "Verification state" tile only, so an
// assertion can't be fooled by copy rendered elsewhere on the card.
function verificationStateValue(container: HTMLElement): string {
  const label = Array.from(container.querySelectorAll("span")).find(
    (el) => el.textContent === "Verification state",
  );
  return label?.parentElement?.querySelector("strong")?.textContent ?? "";
}

describe("FeaturedSituation — verification-state flag gating", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("hides the raw verification word when the flag is off (explicit prop)", () => {
    const { container } = render(
      <FeaturedSituation
        situation={makeRow({ verificationState: "Verified", statusLabel: "monitoring" })}
        metrics={[]}
        verificationStateEnabled={false}
      />,
    );
    expect(verificationStateValue(container)).toBe("Monitoring");
    // The internal engine word must not appear anywhere on the card.
    expect(container.textContent).not.toContain("Verified");
  });

  it("shows the raw verification word when the flag is on (explicit prop)", () => {
    const { container } = render(
      <FeaturedSituation
        situation={makeRow({ verificationState: "Verified", statusLabel: "monitoring" })}
        metrics={[]}
        verificationStateEnabled
      />,
    );
    expect(verificationStateValue(container)).toBe("Verified");
  });

  it("defaults to the build-time flag being off: no word", () => {
    vi.stubEnv("VITE_VERIFICATION_STATE_HOMEPAGE", "");
    const { container } = render(
      <FeaturedSituation
        situation={makeRow({ verificationState: "Escalating", statusLabel: "developing" })}
        metrics={[]}
      />,
    );
    expect(verificationStateValue(container)).toBe("Developing before confirmation");
    expect(container.textContent).not.toContain("Escalating");
  });

  it("defaults to the build-time flag when on: shows the word", () => {
    vi.stubEnv("VITE_VERIFICATION_STATE_HOMEPAGE", "true");
    const { container } = render(
      <FeaturedSituation
        situation={makeRow({ verificationState: "Escalating", statusLabel: "developing" })}
        metrics={[]}
      />,
    );
    expect(verificationStateValue(container)).toBe("Escalating");
  });

  it("falls back to plain status copy when the flag is on but no word is derived", () => {
    vi.stubEnv("VITE_VERIFICATION_STATE_HOMEPAGE", "true");
    const { container } = render(
      <FeaturedSituation
        situation={makeRow({ verificationState: undefined, statusLabel: "monitoring" })}
        metrics={[]}
      />,
    );
    expect(verificationStateValue(container)).toBe("Monitoring");
  });
});

describe("FeaturedSituation — plainStatusLabel never leaks a raw lowercase state", () => {
  // Flag off + no verification word => the tile falls back to plainStatusLabel.
  // Every state must render as clean, cased copy — never the raw lowercase token.
  const cases: Array<[string, string]> = [
    ["escalated", "Escalated"],
    ["monitoring", "Monitoring"],
    ["Watch", "Watch"],
    ["Elevated", "Elevated"],
    ["Breaking", "Breaking"],
  ];

  it.each(cases)("statusLabel '%s' renders as '%s'", (statusLabel, expected) => {
    const { container } = render(
      <FeaturedSituation
        situation={makeRow({ verificationState: undefined, statusLabel })}
        metrics={[]}
        verificationStateEnabled={false}
      />,
    );
    const value = verificationStateValue(container);
    expect(value).toBe(expected);
    // Guard against the original bug: the raw lowercased token must not survive.
    expect(value).not.toBe(statusLabel.toLowerCase());
  });

  it("keeps the mapped copy for verified / official states", () => {
    const { container } = render(
      <FeaturedSituation
        situation={makeRow({ verificationState: undefined, statusLabel: "official" })}
        metrics={[]}
        verificationStateEnabled={false}
      />,
    );
    expect(verificationStateValue(container)).toBe("ES Agents verified");
  });

  it("uses escalationState when no statusLabel is present, still cased", () => {
    const { container } = render(
      <FeaturedSituation
        situation={makeRow({ verificationState: undefined, statusLabel: undefined, escalationState: "escalated" })}
        metrics={[]}
        verificationStateEnabled={false}
      />,
    );
    expect(verificationStateValue(container)).toBe("Escalated");
  });
});

describe("FeaturedSituation — story presentation (EditorialLeadBlock) respects the same gate", () => {
  const ENGINE_WORDS = ["Verified", "Escalating", "Developing"];

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // The editorial layout surfaces its verification value through the "Reports"
  // proof pill (shown as the fallback when there is no source count).
  function reportsPillValue(container: HTMLElement): string {
    const label = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "Reports",
    );
    return label?.parentElement?.querySelector("strong")?.textContent ?? "";
  }

  const storyRow = () =>
    makeRow({
      verificationState: "Verified",
      sourceProgressLabel: "Checking sources",
      sourceCount: undefined,
    });

  it("keeps public status copy (no engine word) in the editorial layout when off", () => {
    const { container } = render(
      <FeaturedSituation situation={storyRow()} presentation="story" verificationStateEnabled={false} />,
    );
    const pill = reportsPillValue(container);
    expect(pill).toBe("Checking sources");
    expect(ENGINE_WORDS).not.toContain(pill);
  });

  it("surfaces the engine word in the editorial layout when on", () => {
    const { container } = render(
      <FeaturedSituation situation={storyRow()} presentation="story" verificationStateEnabled />,
    );
    expect(reportsPillValue(container)).toBe("Verified");
  });

  it("defaults to the build-time flag being off for the story path", () => {
    vi.stubEnv("VITE_VERIFICATION_STATE_HOMEPAGE", "");
    const { container } = render(
      <FeaturedSituation situation={storyRow()} presentation="story" />,
    );
    expect(ENGINE_WORDS).not.toContain(reportsPillValue(container));
  });
});
