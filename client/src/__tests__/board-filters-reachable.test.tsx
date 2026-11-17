/**
 * Board filter chips must be able to select something
 *
 * Every board signal's `type` is produced by one of the `to*Type` mappers in
 * lib/signalsApi.ts, and those mappers have a fixed, small range:
 *
 *   toNFLType -> injury | depth | line_move | weather | scheme | transaction | camp
 *   toCFBType -> injury | depth | line_move | weather | scheme | transaction | trend
 *
 * Several chips asked for types outside that range ("matchup", "prop",
 * "sharp", "trend" on NFL; "matchup", "coaching", "transfer", "portal" on
 * CFB), so they could never match a signal. Their canonical situation types
 * were no better: prod has zero situations of type "scheme".
 *
 * The failure was worse than an empty list. `filterCanonicalSituations`
 * treats a null situationType as "no filter", so NFL's Props and Trends
 * showed zero signals above the FULL unfiltered situation list.
 *
 * The CFB conference tabs were dead for a different reason: `conference` is
 * set only in cfbMockData. `adaptToCFBSignal` never sets it and prod payloads
 * carry no such key, so `!signal.conference` passed every signal through every
 * conference and all five tabs showed identical content.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import NFLBoard from "@/pages/NFLBoard";
import CFBBoard from "@/pages/CFBBoard";
import { SignalGateProvider } from "@/context/SignalGate";
import { useAuth } from "@/context/AuthContext";
import { useNFLSignals, useCFBSignals } from "@/hooks/useSignals";
import { useCanonicalSituations } from "@/lib/situationsApi";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

vi.mock("@/context/AuthContext", () => ({ useAuth: vi.fn() }));

vi.mock("@/hooks/useSignals", () => ({
  useNFLSignals: vi.fn(),
  useCFBSignals: vi.fn(),
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

function signal(id: string, overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

function primeCommon() {
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
  mockFetchWithTimeout.mockResolvedValue({
    json: async () => ({ games: [] }),
  } as Response);
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("NFL board filter chips", () => {
  async function renderNFL() {
    primeCommon();
    mockUseNFLSignals.mockReturnValue({
      signals: [signal("nfl-1"), signal("nfl-2")],
      loading: false,
      isLive: false,
      error: null,
      refresh: vi.fn(),
    } as any);

    render(
      <SignalGateProvider>
        <NFLBoard />
      </SignalGateProvider>,
    );
    await waitFor(() => expect(screen.getByText("NFL Story Board")).toBeInTheDocument());
  }

  it("keeps the chips that can match a producible signal type", async () => {
    await renderNFL();
    for (const label of ["Today", "Injuries", "Movement", "Camp/Depth"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it.each(["Matchups", "Props", "Trends"])("no longer offers the dead %s chip", async (label) => {
    await renderNFL();
    expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
  });
});

describe("CFB board filters", () => {
  async function renderCFB() {
    primeCommon();
    mockUseCFBSignals.mockReturnValue({
      signals: [signal("cfb-1"), signal("cfb-2")],
      loading: false,
      isLive: false,
      error: null,
      refresh: vi.fn(),
    } as any);

    render(
      <SignalGateProvider>
        <CFBBoard />
      </SignalGateProvider>,
    );
    await waitFor(() => expect(screen.getByText("CFB Story Board")).toBeInTheDocument());
  }

  it("keeps the filters that can select something", async () => {
    await renderCFB();
    for (const label of ["Signal Stream", "Injury Watch", "Movement", "Roster Moves"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it.each(["Matchup Edges", "Coaching Intel", "Source Pressure", "Transfer Portal"])(
    "no longer offers the dead %s filter",
    async (label) => {
      await renderCFB();
      expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    },
  );

  it.each(["SEC", "Big Ten", "ACC", "Big 12", "Ind."])(
    "no longer offers the %s conference tab, which filtered on a field live data never carries",
    async (tab) => {
      await renderCFB();
      expect(screen.queryByRole("button", { name: tab })).not.toBeInTheDocument();
    },
  );

  it("drops the Conference heading along with its tabs", async () => {
    await renderCFB();
    expect(screen.queryByText("Conference")).not.toBeInTheDocument();
  });
});
