import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SignalDetailDrawer, type SignalDetailLike } from "@/components/SignalDetailDrawer";
import {
  deriveSignalVerificationState,
  honestConfirmationStrength,
} from "@/lib/signalVerification";

/**
 * Regression guard for the evidence-strength overclaim: the NFL drawer for
 * "SF: +1.5 -> -1.5 — market movement" showed badge "Strong support" and text
 * "Multiple sources corroborate" while its own Source Trail showed
 * "1 source check". The pipeline sets confirmation_strength from line-movement
 * delta (server/pipeline/processor.ts), not the source count, so a single-source
 * signal arrives labeled "Corroborated" and every consumer that trusted the
 * label over the count overclaimed.
 *
 * Rule: single-source evidence must never render "strong" or "multiple sources"
 * / "corroborated" / "consensus" language, and source-count-derived copy must be
 * consistent with the numeric count shown in the same view.
 */

// Phrases that assert more corroboration than a single source can support.
const OVERCLAIM_PATTERNS: RegExp[] = [
  /multiple sources corroborate/i,
  /multiple reports/i,
  /\bcorroborated\b/i, // past-tense claim; "corroboration still building" is allowed
  /\bconsensus\b/i,
  /\bstrong\b/i,
];

function marketSignal(overrides: Partial<SignalDetailLike> = {}): SignalDetailLike {
  return {
    id: "nfl-sf-market",
    headline: "SF: +1.5 -> -1.5 — market movement",
    detail: "Spread flipped from +1.5 to -1.5.",
    team: "SF",
    type: "line_move",
    verdict: "likely",
    confidence: 74, // high enough to trip "Strong support" pre-fix
    confirmationStrength: "corroborated", // delta-derived label, NOT a count
    sources: 1,
    lineMovement: { open: "+1.5", current: "-1.5", note: "Moved -3 pts", direction: "down" },
    timestamp: "10m ago",
    ...overrides,
  };
}

describe("honestConfirmationStrength", () => {
  it("downgrades multi-source labels for a single source", () => {
    for (const label of ["Corroborated", "Consensus", "corroborated", "Multiple reports"]) {
      const out = honestConfirmationStrength(label, 1);
      expect(out).not.toMatch(/\bcorroborated\b/i);
      expect(out).not.toMatch(/consensus/i);
      expect(out).not.toMatch(/multiple/i);
    }
  });

  it("passes multi-source labels through when >= 2 sources back them", () => {
    expect(honestConfirmationStrength("Corroborated", 2)).toBe("Corroborated");
    expect(honestConfirmationStrength("Consensus", 3)).toBe("Consensus");
  });

  it("leaves non-multiplicity labels alone even for a single source", () => {
    expect(honestConfirmationStrength("Developing", 1)).toBe("Developing");
    expect(honestConfirmationStrength("Official", 1)).toBe("Official");
  });
});

describe("deriveSignalVerificationState — single source never claims corroboration", () => {
  it("does not produce corroboration/consensus basis for a single-source corroborated label", () => {
    const result = deriveSignalVerificationState({
      verdict: "likely",
      confirmationStrength: "corroborated",
      sources: 1,
      lineMovement: { note: "moved" },
    });
    const basis = result.basis.toLowerCase();
    expect(basis).not.toContain("corroborate");
    expect(basis).not.toContain("multiple");
    expect(basis).not.toContain("consensus");
  });

  it("still reports genuine corroboration when >= 2 sources back it", () => {
    const result = deriveSignalVerificationState({
      verdict: "likely",
      confirmationStrength: "Corroborated",
      sources: 2,
    });
    expect(result.state).toBe("Escalating");
    expect(result.basis.toLowerCase()).toContain("corroborate");
  });
});

describe("SignalDetailDrawer — single-source evidence copy stays honest across leagues", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
  });

  it.each(["NFL", "CFB", "NBA", "MLB"])(
    "%s drawer never renders strong/multiple-source language for a single-source market signal",
    (sport) => {
      render(
        <SignalDetailDrawer open signal={marketSignal()} sport={sport} onClose={() => undefined} />,
      );

      const text = document.body.textContent ?? "";

      for (const pattern of OVERCLAIM_PATTERNS) {
        expect(text).not.toMatch(pattern);
      }

      // Internally consistent with the single source it is citing: the source
      // count copy is present and singular, and never claims a second source.
      expect(text).toMatch(/1 (report check|source check)/i);
      expect(text).not.toMatch(/2 (report checks|source checks)/i);
    },
  );
});
