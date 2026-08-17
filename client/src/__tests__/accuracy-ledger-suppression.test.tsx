import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Accuracy-ledger suppression guard.
//
// Prod /api/leaderboard returns SEEDED accuracy for sources that have zero settled
// outcomes (verified_count:0) and never ran the accuracy pass (last_computed_at:
// null) — e.g. named insiders shown as "96%" with an A+ grade they never earned.
// AccuracyPage and SourceLeaderboard must NOT render a specific accuracy % or
// letter grade for such rows; they show a "pending" placeholder instead. Sources
// that DO have settled outcomes still render their measured numbers. Reliability
// tiers and timing are not outcome-dependent and are unaffected.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "@/lib/queryClient";
import { AccuracyPageInner } from "@/pages/AccuracyPage";
import { SourceLeaderboardInner } from "@/pages/SourceLeaderboard";

const mockApi = vi.mocked(apiRequest);

const UNSETTLED = {
  id: "u1",
  source_id: "u1",
  source_name: "Shams Charania",
  overall_accuracy: 96,       // seeded — would grade A+ if shown
  injury_accuracy: 100,
  false_positive_rate: 11,
  average_lead_time_minutes: 40,
  reliability_score: 95,
  trust_tier: "tier1",
  source_type: "reporter",
  verified_count: 0,          // no settled outcomes
  last_computed_at: null,     // accuracy pass never ran
};

const SETTLED = {
  id: "s1",
  source_id: "s1",
  source_name: "Settled Source",
  overall_accuracy: 92,       // measured — grades A+
  injury_accuracy: 90,
  false_positive_rate: 5,
  average_lead_time_minutes: 20,
  reliability_score: 90,
  trust_tier: "tier1",
  source_type: "official",
  verified_count: 12,         // real settled outcomes
  last_computed_at: "2026-08-16T00:00:00.000Z",
};

function mockLeaderboard(rows: unknown[]) {
  mockApi.mockResolvedValue({ json: async () => rows } as any);
}

function renderWithClient(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("AccuracyPage — accuracy suppressed without settled outcomes", () => {
  it("renders no specific accuracy %, false-positive %, or letter grade for an unsettled source", async () => {
    mockLeaderboard([UNSETTLED]);
    const { container } = renderWithClient(<AccuracyPageInner />);

    await waitFor(() => expect(container.textContent).toContain("Shams Charania"));
    const text = container.textContent ?? "";

    // The seeded per-source numbers/grade must never surface.
    expect(text).not.toContain("96.0%"); // overall_accuracy
    expect(text).not.toContain("11.0%"); // false_positive_rate
    expect(text).not.toContain("A+");    // accuracyGrade(96)
    // Honest placeholders instead.
    expect(text).toContain("Awaiting settled outcomes"); // per-row cell
    expect(text).toContain("Pending");                    // "Tracked Accuracy" stat tile
    // The seeded source carries the non-outcome "UNVERIFIED" row badge, and the
    // Elite-Sources tile counts zero (badge legend text is separate).
    expect(text).toContain("0Elite Sources");
  });

  it("still renders the measured accuracy and grade once settled outcomes exist", async () => {
    mockLeaderboard([SETTLED]);
    const { container } = renderWithClient(<AccuracyPageInner />);

    await waitFor(() => expect(container.textContent).toContain("Settled Source"));
    const text = container.textContent ?? "";

    expect(text).toContain("92.0%"); // measured accuracy renders
    expect(text).toContain("A+");    // accuracyGrade(92)
    expect(text).not.toContain("Awaiting settled outcomes");
  });
});

describe("SourceLeaderboard — accuracy suppressed without settled outcomes", () => {
  it("renders 'Pending' (no per-source %) for an unsettled source, keeping its reliability tier", async () => {
    mockLeaderboard([UNSETTLED]);
    const { container } = renderWithClient(<SourceLeaderboardInner />);

    await waitFor(() => expect(container.textContent).toContain("Shams Charania"));
    const text = container.textContent ?? "";

    expect(text).not.toContain("96.0%");  // overall_accuracy
    expect(text).not.toContain("100.0%"); // injury_accuracy (Availability col)
    expect(text).not.toContain("11.0%");  // false_positive_rate (Weakened col)
    expect(text).toContain("Pending");
    // Reliability tier is not outcome-dependent — it stays.
    expect(text).toContain("TIER 1");
  });

  it("still renders the measured accuracy once settled outcomes exist", async () => {
    mockLeaderboard([SETTLED]);
    const { container } = renderWithClient(<SourceLeaderboardInner />);

    await waitFor(() => expect(container.textContent).toContain("Settled Source"));
    const text = container.textContent ?? "";

    expect(text).toContain("92.0%");
    expect(text).not.toContain("Pending");
  });
});
