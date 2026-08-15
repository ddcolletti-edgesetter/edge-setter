import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EdgeSetterOverlay, type EdgeSetterOverlayData } from "@/components/EdgeSetterOverlay";
import type { VerificationStateResult } from "@shared/verification-state";

// PR-B: EdgeSetterOverlay renders the shared verification word in its
// confidence-support cell when the flag is on, and the legacy "N% support"
// number when off (or when no verification word is attached).

const verification: VerificationStateResult = {
  state: "Verified",
  basis: "Official confirmation corroborated by two independent sources.",
};

function overlayData(overrides: Partial<EdgeSetterOverlayData> = {}): EdgeSetterOverlayData {
  return {
    escalationState: "Monitoring",
    verification,
    confidence: { current: 82, delta: 3, explanation: "x" },
    sourceSummary: { count: 2, convergence: "Corroborated" },
    timing: { window: "Developing", freshnessLabel: "now" },
    ...overrides,
  };
}

describe("EdgeSetterOverlay — verification-state display", () => {
  it("shows the percentage support label when the flag is off", () => {
    const { container } = render(<EdgeSetterOverlay data={overlayData()} />);
    const text = container.textContent ?? "";

    expect(text).toContain("82% support signal");
    expect(text).toContain("Confidence support");
    expect(container.querySelector('[data-verification-word="true"]')).toBeNull();
  });

  it("shows the verification word and no percentage when the flag is on", () => {
    const { container } = render(<EdgeSetterOverlay data={overlayData()} verificationStateEnabled />);
    const text = container.textContent ?? "";

    const word = container.querySelector('[data-verification-word="true"]');
    expect(word?.textContent).toBe("Verified");
    expect(text).not.toContain("82% support");
    expect(text).toContain("Verification");
  });

  it("uses editorial percentage phrasing for public copy when the flag is off", () => {
    const { container } = render(<EdgeSetterOverlay data={overlayData()} copyVariant="editorial" />);
    expect(container.textContent).toContain("82% support from tracked signals");
  });

  it("falls back to the percentage when the flag is on but no verification word is attached", () => {
    const { container } = render(
      <EdgeSetterOverlay data={overlayData({ verification: null })} verificationStateEnabled />,
    );
    expect(container.textContent).toContain("82% support signal");
    expect(container.querySelector('[data-verification-word="true"]')).toBeNull();
  });

  it("falls back to 'Awaiting verification' when the flag is on with no word and no confidence", () => {
    const { container } = render(
      <EdgeSetterOverlay data={overlayData({ verification: null, confidence: null })} verificationStateEnabled />,
    );
    expect(container.textContent).toContain("Awaiting verification");
    expect(container.querySelector('[data-verification-word="true"]')).toBeNull();
  });
});
