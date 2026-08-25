import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FeaturedSituation } from "@/components/board/FeaturedSituation";
import { toSituationRowData } from "@/components/board/boardAdapters";
import { SignalDetailDrawer, type SignalDetailLike } from "@/components/SignalDetailDrawer";
import { toBoardSignalSituation, type BoardSignalInput } from "@/lib/boardSituations";

/**
 * Regression guard for the verification-state disagreement: the /mlb story CARD
 * (FeaturedSituation) showed "Escalating" while the DRAWER (SignalDetailDrawer)
 * showed "Verified" for the SAME underlying signal.
 *
 * The raw evidence-grounded word ("Verified" / "Escalating" / "Developing") is
 * now gated behind VITE_VERIFICATION_STATE_HOMEPAGE on BOTH surfaces, so this
 * guard renders both from the SAME fixture in BOTH flag states:
 *   - flag ON  => both surfaces show the SAME engine word (exact parity).
 *   - flag OFF => neither surface renders the bare engine word (both gated), so
 *     the old "card says X, drawer says Y" disagreement cannot recur.
 */

const ENGINE_WORDS = ["Verified", "Escalating", "Developing"];

// The exact story from the live-site audit.
const MATT_BRASH: SignalDetailLike = {
  id: "mlb-matt-brash-il60",
  headline: "Matt Brash (undisclosed) — IL-60",
  detail: "Placed on the 60-day injured list; availability update confirmed by the club.",
  team: "Seattle Mariners",
  player: "Matt Brash",
  type: "injury",
  verdict: "confirmed",
  confirmationStrength: "corroborated",
  sources: 2,
  confidence: 92,
  timestamp: "18m ago",
};

const ESCALATING: SignalDetailLike = {
  ...MATT_BRASH,
  id: "mlb-escalating",
  verdict: "review",
  confirmationStrength: "corroborated",
  sources: 2,
};

const DEVELOPING: SignalDetailLike = {
  ...MATT_BRASH,
  id: "mlb-developing",
  verdict: "monitoring",
  confirmationStrength: "developing",
  sources: 1,
};

function cardVerificationState(signal: SignalDetailLike): string {
  // Build the situation the exact way MLBBoard does, then derive the card row.
  const situation = toBoardSignalSituation(signal as unknown as BoardSignalInput, "MLB");
  const row = toSituationRowData(situation);
  const { container, unmount } = render(<FeaturedSituation situation={row} />);
  const label = within(container).getByText("Verification state");
  const value = label.parentElement?.querySelector("strong")?.textContent ?? "";
  unmount();
  return value;
}

function drawerVerificationState(signal: SignalDetailLike): string {
  const { unmount } = render(
    <SignalDetailDrawer open signal={signal} sport="MLB" onClose={() => undefined} />,
  );
  const value = screen.getByTestId("verification-state-word").textContent ?? "";
  unmount();
  return value;
}

describe("verification state parity between story card and drawer", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
    vi.unstubAllEnvs();
  });

  describe("flag ON — both surfaces render the same engine word", () => {
    it("card and drawer agree for the Matt Brash IL-60 story (Verified, not Escalating)", () => {
      vi.stubEnv("VITE_VERIFICATION_STATE_HOMEPAGE", "true");
      const card = cardVerificationState(MATT_BRASH);
      const drawer = drawerVerificationState(MATT_BRASH);

      expect(card).toBe("Verified");
      expect(drawer).toBe("Verified");
      expect(card).toBe(drawer);
    });

    it.each([
      ["Verified", MATT_BRASH],
      ["Escalating", ESCALATING],
      ["Developing", DEVELOPING],
    ] as const)("card and drawer render the same %s state", (expected, signal) => {
      vi.stubEnv("VITE_VERIFICATION_STATE_HOMEPAGE", "true");
      const card = cardVerificationState(signal);
      const drawer = drawerVerificationState(signal);

      expect(card).toBe(expected);
      expect(drawer).toBe(expected);
      expect(card).toBe(drawer);
    });
  });

  describe("flag OFF — neither surface leaks the bare engine word", () => {
    it.each([
      ["Verified", MATT_BRASH],
      ["Escalating", ESCALATING],
      ["Developing", DEVELOPING],
    ] as const)("%s story: card and drawer both suppress the bare word", (_expected, signal) => {
      vi.stubEnv("VITE_VERIFICATION_STATE_HOMEPAGE", "");
      const card = cardVerificationState(signal);
      const drawer = drawerVerificationState(signal);

      // Both surfaces fall back to public status copy — never the bare engine word.
      expect(ENGINE_WORDS).not.toContain(card);
      expect(ENGINE_WORDS).not.toContain(drawer);
    });
  });
});
