import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import NFLBoard from "@/pages/NFLBoard";
import { SignalGateProvider } from "@/context/SignalGate";
import { useAuth } from "@/context/AuthContext";
import { useNFLSignals } from "@/hooks/useSignals";
import { useCanonicalSituations } from "@/lib/situationsApi";

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/useSignals", () => ({
  useNFLSignals: vi.fn(),
}));

vi.mock("@/lib/situationsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/situationsApi")>();
  return {
    ...actual,
    useCanonicalSituations: vi.fn(),
  };
});

const mockUseAuth = vi.mocked(useAuth);
const mockUseNFLSignals = vi.mocked(useNFLSignals);
const mockUseCanonicalSituations = vi.mocked(useCanonicalSituations);

function nflSignal(overrides: Record<string, unknown> = {}) {
  return {
    id: "nfl-story-1",
    type: "injury",
    player: "Christian McCaffrey",
    team: "SF",
    opponent: "DAL",
    headline: "McCaffrey availability update stays on NFL watch",
    detail: "A practice participation change is being reviewed as offseason context before any game-week impact is attached.",
    why_it_matters: "Role, depth chart, and practice availability can shift team preparation when source support changes.",
    action_takeaway: "Watch official participation updates and whether this connects to a real game-week window.",
    verdict: "review",
    confidence: 76,
    sources: 3,
    source_count: 3,
    timestamp: "12m ago",
    tags: ["injury", "SF", "DAL"],
    _stub: true,
    ...overrides,
  };
}

describe("NFL board render regressions", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders NFL as story cards without old game-strip or dashboard labels", async () => {
    mockUseAuth.mockReturnValue({
      email: "subscriber@example.com",
      user: null,
      isPro: true,
      authLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    mockUseNFLSignals.mockReturnValue({
      signals: [nflSignal()],
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
        <NFLBoard />
      </SignalGateProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("NFL Story Board")).toBeInTheDocument();
    });

    const text = document.body.textContent ?? "";
    expect(text).toContain("What happened");
    expect(text).toContain("Why it matters");
    expect(text).toContain("Watch next");
    expect(text).toContain("Offseason context");
    expect(text).toContain("Story watch 4");
    expect(text).toContain("Verified notes 4");
    expect(text).not.toContain("Evidence review");
    expect(text).not.toContain("source check complete");
    expect(text).not.toContain("timing check complete");
    expect(text).not.toContain("Alert 4");
    expect(text).not.toContain("Confirmed 4");
    expect(text).not.toContain("ConfidenceEvidenceTimingMarket ReactionOpen Story");
  });
});
