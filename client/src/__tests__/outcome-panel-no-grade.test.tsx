import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import OutcomePanel from "@/components/OutcomePanel";
import { fetchOutcomesForSignal } from "@/lib/signalsApi";
import { NO_GRADE_REASONS } from "@shared/settlement-grading";

// Settlement v2: an outcome settled without a grade is final. It must read
// "Not graded" with the reason, never "Pending" (which promises a result that
// is not coming) and never "Lost".

vi.mock("@/lib/signalsApi", () => ({ fetchOutcomesForSignal: vi.fn() }));
const mockFetchOutcomes = vi.mocked(fetchOutcomesForSignal);

function outcome(overrides: Record<string, unknown> = {}) {
  return {
    id: "out-1", signal_id: "sig-1", game_id: "game-1",
    market: "none", line_at_signal: null, closing_line: null, actual_result: null,
    hit: null, clv: null, clv_points: null,
    settlement_state: "no_grade", no_grade_reason: "no_side_claimed", grading_version: "v2",
    recorded_at: "2026-11-22T22:00:00.000Z", created_at: "2026-11-22T22:00:00.000Z",
    ...overrides,
  } as any;
}

async function renderPanel(o: Record<string, unknown> = {}): Promise<string> {
  mockFetchOutcomes.mockResolvedValue([outcome(o)]);
  const { container } = render(<OutcomePanel signalId="sig-1" darkMode />);
  await waitFor(() => expect(screen.getByTestId("outcome-panel")).toBeTruthy());
  return container.textContent ?? "";
}

beforeEach(() => vi.clearAllMocks());

describe("OutcomePanel — settled without a grade", () => {
  it("says Not graded and gives the documented reason", async () => {
    const text = await renderPanel();
    expect(text).toContain("Not graded");
    expect(text).not.toContain("Pending");
    expect(text).not.toContain("Lost");
    expect(screen.getByTestId("outcome-no-grade-reason").textContent).toBe(NO_GRADE_REASONS.no_side_claimed);
    expect(text).not.toContain("No numeric line recorded");
  });

  it("shows a line move's pregame lines as description, with no grade", async () => {
    const text = await renderPanel({ market: "total", line_at_signal: 47.5, closing_line: 46 });
    expect(text).toContain("Not graded");
    expect(text).toContain("47.5 → 46");
    expect(text).not.toContain("+47.5");
  });

  it("a spread still carries its sign", async () => {
    const text = await renderPanel({ market: "spread", line_at_signal: 3, closing_line: -1.5 });
    expect(text).toContain("+3 → -1.5");
  });

  it("falls back to a neutral sentence for a reason code it does not know", async () => {
    await renderPanel({ no_grade_reason: "something_new" });
    expect(screen.getByTestId("outcome-no-grade-reason").textContent).toBe("This signal was settled without a grade.");
  });

  it("still says Pending for a pre-v2 row with no result and no state", async () => {
    const text = await renderPanel({ settlement_state: undefined, no_grade_reason: undefined, grading_version: undefined, market: "spread" });
    expect(text).toContain("Pending");
  });

  it("a graded CLV of exactly 0 says it matched, not 'moved 0.0 pts against'", async () => {
    const text = await renderPanel({ settlement_state: "graded", no_grade_reason: null, hit: true, clv: 0, market: "total" });
    expect(text).toContain("Matched the last pregame line.");
    expect(text).not.toMatch(/0\.0 pts against/);
  });
});
