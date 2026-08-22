import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FeaturedSituation } from "@/components/board/FeaturedSituation";
import { toSituationRowData } from "@/components/board/boardAdapters";
import { SignalDetailDrawer, type SignalDetailLike } from "@/components/SignalDetailDrawer";
import { toBoardSignalSituation, type BoardSignalInput } from "@/lib/boardSituations";

/**
 * Regression guard for the verification-state disagreement: the /mlb story CARD
 * (FeaturedSituation) showed "Escalating" while the DRAWER (SignalDetailDrawer)
 * showed "Verified" for the SAME underlying signal, because the card used
 * legacy string logic (plainStatusLabel) and only the drawer called the
 * canonical shared engine.
 *
 * This bug shipped once before (July) and was believed fixed by the August
 * rewrite — but only the card view was checked then, not the drawer. This test
 * therefore renders BOTH surfaces from the SAME fixture signal and asserts the
 * verification-state string matches exactly.
 */

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
  });

  it("card and drawer agree for the Matt Brash IL-60 story (Verified, not Escalating)", () => {
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
    const card = cardVerificationState(signal);
    const drawer = drawerVerificationState(signal);

    expect(card).toBe(expected);
    expect(drawer).toBe(expected);
    expect(card).toBe(drawer);
  });
});
