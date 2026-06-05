import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CFBBoard from "@/pages/CFBBoard";
import { SignalGateProvider } from "@/context/SignalGate";
import { useAuth } from "@/context/AuthContext";
import { useCFBSignals } from "@/hooks/useSignals";
import { useCanonicalSituations } from "@/lib/situationsApi";

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/useSignals", () => ({
  useCFBSignals: vi.fn(),
}));

vi.mock("@/lib/situationsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/situationsApi")>();
  return {
    ...actual,
    useCanonicalSituations: vi.fn(),
  };
});

const mockUseAuth = vi.mocked(useAuth);
const mockUseCFBSignals = vi.mocked(useCFBSignals);
const mockUseCanonicalSituations = vi.mocked(useCanonicalSituations);

function cfbSignal(overrides: Record<string, unknown> = {}) {
  return {
    id: "cfb-story-1",
    type: "injury",
    player: "Starting QB",
    team: "Texas",
    opponent: "Oklahoma",
    headline: "Texas quarterback availability update stays on CFB watch",
    detail: "A practice participation change is being reviewed before any game-window impact is attached.",
    why_it_matters: "Depth chart, travel, matchup prep, and team context can shift when source support changes.",
    action_takeaway: "Watch official participation updates and local reports.",
    verdict: "review",
    confidence: 84,
    sources: 3,
    source_count: 3,
    timestamp: "18m ago",
    conference: "SEC",
    tags: ["injury", "Texas", "Oklahoma"],
    _stub: true,
    ...overrides,
  };
}

describe("CFB board editorial language", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("uses sports-editorial labels instead of dashboard-first story copy", async () => {
    mockUseAuth.mockReturnValue({
      email: "subscriber@example.com",
      user: null,
      isPro: true,
      authLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    mockUseCFBSignals.mockReturnValue({
      signals: [cfbSignal()],
      loading: false,
      isLive: false,
      error: null,
      refresh: vi.fn(),
    } as any);
    mockUseCanonicalSituations.mockReturnValue({
      situations: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
    } as any);

    render(
      <SignalGateProvider>
        <CFBBoard />
      </SignalGateProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("CFB Story Board")).toBeInTheDocument();
    });

    const text = document.body.textContent ?? "";
    expect(text).toContain("Stories to Watch");
    expect(text).toContain("Source support");
    expect(text).toContain("Evidence strength");
    expect(text).toContain("What changed");
    expect(text).toContain("Why it matters");
    expect(text).toContain("Watch next");
    expect(text).not.toContain("Urgent Developing Stories");
    expect(text).not.toContain("Confidence:");
    expect(text).not.toContain("Market Reaction Det");
    expect(text).not.toContain("Report Posture");
    expect(text).not.toContain("Confidence Read");
    expect(text).not.toContain("Timing Window");
  });
});
