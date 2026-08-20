import { describe, it, expect } from "vitest";
import {
  isEdgeShowcaseEligible,
  EDGE_SHOWCASE_THRESHOLD_MINUTES,
} from "../situationsApi";

// The public "EdgeSetter Edge" badge is a customer-facing claim, so eligibility
// must be strict: a real lead >= the threshold, backed by an actual public
// confirmation timestamp. These tests pin that contract.

const CONFIRMED_AT = "2026-08-19T13:00:00.000Z";

describe("isEdgeShowcaseEligible", () => {
  it("is eligible at exactly the threshold with a real confirmation", () => {
    expect(
      isEdgeShowcaseEligible({
        detectionLeadMinutes: EDGE_SHOWCASE_THRESHOLD_MINUTES,
        publicConfirmation: CONFIRMED_AT,
      }),
    ).toBe(true);
  });

  it("is eligible for a large lead", () => {
    expect(
      isEdgeShowcaseEligible({ detectionLeadMinutes: 47, publicConfirmation: CONFIRMED_AT }),
    ).toBe(true);
  });

  it("is NOT eligible below the threshold (poll-noise floor)", () => {
    expect(
      isEdgeShowcaseEligible({
        detectionLeadMinutes: EDGE_SHOWCASE_THRESHOLD_MINUTES - 1,
        publicConfirmation: CONFIRMED_AT,
      }),
    ).toBe(false);
  });

  it("is NOT eligible when the story never came from early detection (no lead)", () => {
    expect(isEdgeShowcaseEligible({ detectionLeadMinutes: undefined, publicConfirmation: undefined })).toBe(false);
  });

  it("is NOT eligible without a real public-confirmation timestamp", () => {
    expect(
      isEdgeShowcaseEligible({ detectionLeadMinutes: 30, publicConfirmation: undefined }),
    ).toBe(false);
  });

  it("keeps the public showcase threshold aligned with the internal SLO floor (10)", () => {
    // If this changes, update the SLO floor in scripts/check-delta-minutes.mjs and
    // .github/workflows/delta-minutes-slo.yml so public claims and internal
    // benchmarks stay consistent.
    expect(EDGE_SHOWCASE_THRESHOLD_MINUTES).toBe(10);
  });
});
