/**
 * TrackRecordStrip — no unbacked CLV figure
 *
 * The strip renders on the NFL and CFB boards only. It used to print an
 * "avg CLV" number beside the hit rate. That number was not backed:
 *
 *  - `avg_clv_points` averages only the rows where outcomes.clv IS NOT NULL,
 *    and clv is populated only for `line_move`. The payloads below are the real
 *    prod shapes (NFL 987 of 5,295 settled signals carry clv; CFB 2,403 of
 *    2,613), yet the figure sat inline next to "N settled signals" and so read
 *    as the CLV of all N. The endpoint returns no count for the rows the
 *    average covers, so the client has no honest denominator to label it with.
 *
 *  - `line_move` is the population graded against a possibly in-play closing
 *    line (PR #87 / #88).
 *
 * The hit rate is a real count over settled, non-stale outcomes and its
 * denominator is printed beside it, so these cases also pin that it STAYS.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TrackRecordStrip from "@/components/TrackRecordStrip";

// Real prod payload shapes, captured from GET /api/stats/track-record.
const NFL_PAYLOAD = {
  league: "NFL",
  window: "all_time",
  overall: {
    signal_type: null,
    total_signals: 5295,
    wins: 2575,
    losses: 2720,
    hit_rate: 0.486,
    avg_clv_points: -1.34,
  },
  by_signal_type: [
    { signal_type: "injury_update", total_signals: 4104, wins: 2100, losses: 2004, hit_rate: 0.512, avg_clv_points: null },
    { signal_type: "line_move", total_signals: 987, wins: 380, losses: 607, hit_rate: 0.385, avg_clv_points: -1.34 },
    { signal_type: "lineup_change", total_signals: 204, wins: 95, losses: 109, hit_rate: 0.466, avg_clv_points: null },
  ],
};

const CFB_PAYLOAD = {
  league: "CFB",
  window: "all_time",
  overall: {
    signal_type: null,
    total_signals: 2613,
    wins: 1226,
    losses: 1387,
    hit_rate: 0.469,
    avg_clv_points: 0.19,
  },
  by_signal_type: [
    { signal_type: "line_move", total_signals: 2403, wins: 1125, losses: 1278, hit_rate: 0.468, avg_clv_points: 0.19 },
    { signal_type: "injury_update", total_signals: 156, wins: 69, losses: 87, hit_rate: 0.442, avg_clv_points: null },
    { signal_type: "lineup_change", total_signals: 54, wins: 32, losses: 22, hit_rate: 0.593, avg_clv_points: null },
  ],
};

function mockFetchOnce(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => payload })),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each([
  ["NFL", NFL_PAYLOAD, "5295"],
  ["CFB", CFB_PAYLOAD, "2613"],
] as const)("TrackRecordStrip on the %s board", (league, payload, settledCount) => {
  it("prints the hit rate and the sample it is drawn from", async () => {
    mockFetchOnce(payload);
    render(<TrackRecordStrip league={league} darkMode />);

    await waitFor(() => expect(screen.getByText("Track record")).toBeInTheDocument());

    // Scoped to the primary line: the overall rate and a per-type rate can round
    // to the same string (CFB overall 46.9% and line_move 46.8% are both "47%").
    const expectedPct = `${Math.round(payload.overall.hit_rate * 100)}%`;
    const primaryLine = screen.getByText("hit rate").parentElement;
    expect(primaryLine?.textContent ?? "").toContain(expectedPct);
    expect(screen.getByText(`${settledCount} settled signals`)).toBeInTheDocument();
  });

  it("shows no CLV figure, label, or points unit", async () => {
    mockFetchOnce(payload);
    const { container } = render(<TrackRecordStrip league={league} darkMode />);

    await waitFor(() => expect(screen.getByText("Track record")).toBeInTheDocument());

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/CLV/i);
    expect(text).not.toMatch(/\bpts\b/);
    // The signed/decimal rendering the old fmt_clv produced, e.g. "-1.3 pts" / "+0.2 pts".
    expect(text).not.toMatch(/[+-]\d+\.\d/);
  });

  it("still breaks the hit rate down per signal type", async () => {
    mockFetchOnce(payload);
    render(<TrackRecordStrip league={league} darkMode />);

    await waitFor(() => expect(screen.getByText("Track record")).toBeInTheDocument());

    // Underscores are rendered as spaces.
    expect(screen.getByText(/line move:/)).toBeInTheDocument();
  });
});

describe("TrackRecordStrip guards", () => {
  it("renders nothing when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const { container } = render(<TrackRecordStrip league="NFL" darkMode />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("says so plainly when nothing has settled yet", async () => {
    mockFetchOnce({
      league: "CFB",
      window: "all_time",
      overall: { signal_type: null, total_signals: 0, wins: 0, losses: 0, hit_rate: null, avg_clv_points: null },
      by_signal_type: [],
    });
    render(<TrackRecordStrip league="CFB" darkMode />);

    await waitFor(() => expect(screen.getByText("No settled outcomes yet.")).toBeInTheDocument());
  });

  it("keeps the small-sample disclaimer under the minimum", async () => {
    mockFetchOnce({
      league: "NFL",
      window: "all_time",
      overall: { signal_type: null, total_signals: 11, wins: 6, losses: 5, hit_rate: 0.545, avg_clv_points: -2.4 },
      by_signal_type: [],
    });
    const { container } = render(<TrackRecordStrip league="NFL" darkMode />);

    await waitFor(() => expect(screen.getByText("(sample size small — warming up)")).toBeInTheDocument());
    expect(container.textContent ?? "").not.toMatch(/CLV/i);
  });
});
