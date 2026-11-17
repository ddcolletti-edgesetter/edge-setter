/**
 * The NFL and CFB boards must not render the TrackRecordStrip
 *
 * The strip's hit rate is counted over settled outcomes of every signal type,
 * and `line_move` — the population that may have been graded against an
 * in-play closing line — is 987 of NFL's 5,295 settled signals and 2,403 of
 * CFB's 2,613. #87 stopped new in-play odds being ingested; excluding the
 * outcomes already graded against one is #88, still open. Until that sweep has
 * run and the rates have been re-measured, the figures are not backed, so
 * SHOW_TRACK_RECORD_STRIP is false and the two call sites are gated.
 *
 * These cases would pass for the wrong reason if the strip were merely failing
 * to load: it hides itself on fetch error and while loading. So global fetch is
 * stubbed with a real prod track-record payload, and "renders with this very
 * payload when mounted directly" below proves the harness does surface the
 * strip — which makes its absence from the boards the gate's doing.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import NFLBoard from "@/pages/NFLBoard";
import CFBBoard from "@/pages/CFBBoard";
import TrackRecordStrip, { SHOW_TRACK_RECORD_STRIP } from "@/components/TrackRecordStrip";
import { SignalGateProvider } from "@/context/SignalGate";
import { useAuth } from "@/context/AuthContext";
import { useNFLSignals, useCFBSignals } from "@/hooks/useSignals";
import { useCanonicalSituations } from "@/lib/situationsApi";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

vi.mock("@/context/AuthContext", () => ({ useAuth: vi.fn() }));

vi.mock("@/hooks/useSignals", () => ({
  useNFLSignals: vi.fn(),
  useCFBSignals: vi.fn(),
  useNBASignals: vi.fn(),
}));

vi.mock("@/lib/situationsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/situationsApi")>();
  return { ...actual, useCanonicalSituations: vi.fn() };
});

vi.mock("@/lib/fetchWithTimeout", () => ({ fetchWithTimeout: vi.fn() }));

const mockUseAuth = vi.mocked(useAuth);
const mockUseNFLSignals = vi.mocked(useNFLSignals);
const mockUseCFBSignals = vi.mocked(useCFBSignals);
const mockUseCanonicalSituations = vi.mocked(useCanonicalSituations);
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

// Real prod payload shapes, captured from GET /api/stats/track-record. These are
// well over the strip's MIN_SAMPLE, so the strip renders its full two lines.
const TRACK_RECORD = {
  NFL: {
    league: "NFL",
    window: "all_time",
    overall: { signal_type: null, total_signals: 5295, wins: 2575, losses: 2720, hit_rate: 0.486, avg_clv_points: -1.34 },
    by_signal_type: [
      { signal_type: "injury_update", total_signals: 4104, wins: 2100, losses: 2004, hit_rate: 0.512, avg_clv_points: null },
      { signal_type: "line_move", total_signals: 987, wins: 380, losses: 607, hit_rate: 0.385, avg_clv_points: -1.34 },
    ],
  },
  CFB: {
    league: "CFB",
    window: "all_time",
    overall: { signal_type: null, total_signals: 2613, wins: 1226, losses: 1387, hit_rate: 0.469, avg_clv_points: 0.19 },
    by_signal_type: [
      { signal_type: "line_move", total_signals: 2403, wins: 1125, losses: 1278, hit_rate: 0.468, avg_clv_points: 0.19 },
      { signal_type: "injury_update", total_signals: 156, wins: 69, losses: 87, hit_rate: 0.442, avg_clv_points: null },
    ],
  },
} as const;

function signal(id: string) {
  return {
    id,
    type: "injury",
    player: "Test Player",
    team: "SF",
    opponent: "DAL",
    headline: "Availability update stays on watch",
    detail: "A practice participation change is being reviewed as context.",
    why_it_matters: "Role and depth chart can shift when source support changes.",
    action_takeaway: "Watch official participation updates.",
    verdict: "review",
    confidence: 76,
    sources: 3,
    source_count: 3,
    timestamp: "12m ago",
    tags: ["injury", "SF", "DAL"],
    _stub: true,
  };
}

/** Serves the track-record payload for the league under test on global fetch. */
function primeTrackRecord(league: "NFL" | "CFB") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => TRACK_RECORD[league] })),
  );
}

function primeBoard(league: "NFL" | "CFB") {
  primeTrackRecord(league);
  mockUseAuth.mockReturnValue({
    email: "subscriber@example.com",
    user: null,
    isPro: true,
    authLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  } as any);
  mockUseCanonicalSituations.mockReturnValue({
    situations: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
  } as any);
  mockFetchWithTimeout.mockResolvedValue({ json: async () => ({ games: [] }) } as Response);

  const feed = {
    signals: [signal(`${league}-1`), signal(`${league}-2`)],
    loading: false,
    isLive: false,
    error: null,
    refresh: vi.fn(),
  } as any;
  if (league === "NFL") mockUseNFLSignals.mockReturnValue(feed);
  else mockUseCFBSignals.mockReturnValue(feed);
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("TrackRecordStrip gate", () => {
  it("is off, so no board prints an unbacked hit rate", () => {
    expect(SHOW_TRACK_RECORD_STRIP).toBe(false);
  });

  it.each(["NFL", "CFB"] as const)(
    "renders with the %s payload when mounted directly, so these cases are not vacuous",
    async (league) => {
      primeTrackRecord(league);
      render(<TrackRecordStrip league={league} darkMode />);

      await waitFor(() => expect(screen.getByText("Track record")).toBeInTheDocument());
      expect(screen.getByText("hit rate")).toBeInTheDocument();
    },
  );
});

describe.each([
  ["NFL", NFLBoard, "NFL Story Board"],
  ["CFB", CFBBoard, "CFB Story Board"],
] as const)("%s board", (league, Board, kicker) => {
  async function renderBoard() {
    primeBoard(league);
    render(
      <SignalGateProvider>
        <Board />
      </SignalGateProvider>,
    );
    await waitFor(() => expect(screen.getByText(kicker)).toBeInTheDocument());
  }

  it("does not render the track record strip while the gate is off", async () => {
    await renderBoard();

    // Let any strip fetch settle, so this is not just a race the board wins.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("Track record")).not.toBeInTheDocument();
    expect(screen.queryByText("hit rate")).not.toBeInTheDocument();
    expect(screen.queryByText("settled signals")).not.toBeInTheDocument();
  });

  it("shows neither the overall hit rate nor a per-type rate anywhere on the board", async () => {
    await renderBoard();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const payload = TRACK_RECORD[league];
    const overallPct = `${Math.round((payload.overall.hit_rate ?? 0) * 100)}%`;
    expect(screen.queryByText(overallPct)).not.toBeInTheDocument();
    expect(screen.queryByText(/line move:/)).not.toBeInTheDocument();
    expect(screen.queryByText(String(payload.overall.total_signals), { exact: false })).not.toBeInTheDocument();
  });
});
