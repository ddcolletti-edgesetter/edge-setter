import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import OutcomePanel from "@/components/OutcomePanel";
import TrackRecordStrip from "@/components/TrackRecordStrip";
import { fetchOutcomesForSignal } from "@/lib/signalsApi";
import { useTrackRecord } from "@/hooks/useTrackRecord";

// ─────────────────────────────────────────────────────────────────────────────
// Pregame-line copy honesty guard.
//
// `outcomes.closing_line` is not a closing line. It is the last line the odds
// adapter stored before kickoff, and shouldSkipOddsFetch throttles that adapter
// to one successful fetch per ODDS_MIN_INTERVAL_MIN (default 60) per league — so
// the number can be up to about an hour old at kickoff, and because a single
// fetch covers a whole slate, the staleness is correlated across every game on
// it rather than averaging out.
//
// Calling that "the closing line" overstates it twice: it claims a precision the
// cadence cannot deliver, and "CLV" imports a term of art that bettors read as
// beating the market's final price. So the customer-facing surfaces say "last
// pregame line" and "line value". This test locks that wording, and locks the
// removal of two specific claims:
//
//   - "signal added positive EV" — a one-line delta is not an EV measurement;
//   - "coming next sprint" — an undated promise that was never kept.
//
// DISPLAY LANGUAGE ONLY. The API field names (`closing_line`, `clv`,
// `clv_points`, `avg_clv_points`) and the internal identifiers are deliberately
// unchanged; they are a published contract and renaming them is a migration for
// cosmetic gain. This guard is about what a customer reads, which is why it
// asserts on rendered text and never on a field name.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/signalsApi", () => ({ fetchOutcomesForSignal: vi.fn() }));
vi.mock("@/hooks/useTrackRecord", () => ({ useTrackRecord: vi.fn() }));

const mockFetchOutcomes = vi.mocked(fetchOutcomesForSignal);
const mockUseTrackRecord = vi.mocked(useTrackRecord);

/** Wording that must never reach a customer-facing surface again. */
const BANNED = [
  /closing\s+line/i,
  /\bCLV\b/,
  /added\s+positive\s+EV/i,
  /coming\s+next\s+sprint/i,
];

function expectNoBannedWording(text: string): void {
  for (const pattern of BANNED) {
    expect(text, `rendered copy must not match ${pattern}`).not.toMatch(pattern);
  }
}

function outcome(overrides: Record<string, unknown> = {}) {
  return {
    id: "out-1",
    signal_id: "sig-1",
    game_id: "game-1",
    market: "spread",
    line_at_signal: -3.5,
    closing_line: -7.5,
    actual_result: 7,
    hit: true,
    clv: 4,
    recorded_at: "2026-10-01T00:00:00.000Z",
    ...overrides,
  } as any;
}

async function renderOutcomePanel(o: Record<string, unknown> = {}): Promise<string> {
  mockFetchOutcomes.mockResolvedValue([outcome(o)]);
  const { container } = render(<OutcomePanel signalId="sig-1" darkMode />);
  await waitFor(() => expect(screen.getByTestId("outcome-panel")).toBeTruthy());
  return container.textContent ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OutcomePanel — last pregame line, never a closing line", () => {
  it("labels the metric 'Line value' and names both ends of the line move", async () => {
    const text = await renderOutcomePanel();

    expect(text).toContain("Line value");
    expect(text).toContain("Signal → pregame");
    // The numbers themselves are untouched — this is a relabelling, not a
    // recalculation. +4.0 pts is still +4.0 pts.
    expect(text).toContain("+4.0 pts");
    expectNoBannedWording(text);
  });

  it("states a positive line delta without claiming it added EV", async () => {
    const text = await renderOutcomePanel({ clv: 4, hit: true });

    expect(text).toContain("Beat the last pregame line by 4.0 pts.");
    expect(text).not.toMatch(/\bEV\b/);
    expectNoBannedWording(text);
  });

  it("states a negative line delta as a pre-kickoff move, not 'negative CLV'", async () => {
    const text = await renderOutcomePanel({ clv: -2.5, hit: false });

    expect(text).toContain("Market moved 2.5 pts against the signal before kickoff.");
    expectNoBannedWording(text);
  });

  it("explains an absent line value without the CLV term", async () => {
    const text = await renderOutcomePanel({ clv: null, market: "spread" });

    expect(text).toContain("No numeric line recorded — no line value for this signal type.");
    expectNoBannedWording(text);
  });

  it("tells the truth about moneyline instead of promising a sprint", async () => {
    const text = await renderOutcomePanel({ clv: null, market: "moneyline" });

    expect(text).toContain("Line value is not computed for moneyline signals.");
    expect(text).not.toMatch(/sprint|soon|coming/i);
    expectNoBannedWording(text);
  });
});

describe("TrackRecordStrip — 'avg line value'", () => {
  function trackRecord(totalSignals: number) {
    mockUseTrackRecord.mockReturnValue({
      data: {
        overall: { hit_rate: 0.56, avg_clv_points: 1.2, total_signals: totalSignals },
        by_signal_type: [],
      },
      loading: false,
      error: null,
    } as any);
  }

  it("relabels the average on the small-sample path", () => {
    trackRecord(5); // below MIN_SAMPLE — the warming-up branch
    const { container } = render(<TrackRecordStrip league="NFL" darkMode />);
    const text = container.textContent ?? "";

    expect(text).toContain("avg line value");
    expect(text).toContain("+1.2 pts");
    expect(text).toContain("warming up");
    expectNoBannedWording(text);
  });

  it("relabels the average on the full-sample path", () => {
    trackRecord(120); // above MIN_SAMPLE — the settled-signals branch
    const { container } = render(<TrackRecordStrip league="NFL" darkMode />);
    const text = container.textContent ?? "";

    expect(text).toContain("avg line value");
    expect(text).toContain("120 settled signals");
    expectNoBannedWording(text);
  });

  it("renders nothing rather than a label when the average is absent", () => {
    mockUseTrackRecord.mockReturnValue({
      data: {
        overall: { hit_rate: 0.5, avg_clv_points: null, total_signals: 40 },
        by_signal_type: [],
      },
      loading: false,
      error: null,
    } as any);
    const { container } = render(<TrackRecordStrip league="NFL" darkMode />);
    const text = container.textContent ?? "";

    expect(text).not.toContain("line value");
    expectNoBannedWording(text);
  });
});
