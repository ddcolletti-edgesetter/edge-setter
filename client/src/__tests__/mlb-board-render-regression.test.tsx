import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MLBBoard from "@/pages/MLBBoard";
import { useAuth } from "@/context/AuthContext";
import { useMLBSignals } from "@/hooks/useSignals";
import { useCanonicalSituations } from "@/lib/situationsApi";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/useSignals", () => ({
  useMLBSignals: vi.fn(),
}));

vi.mock("@/lib/situationsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/situationsApi")>();
  return {
    ...actual,
    useCanonicalSituations: vi.fn(),
  };
});

vi.mock("@/lib/fetchWithTimeout", () => ({
  fetchWithTimeout: vi.fn(),
}));

const mockUseAuth = vi.mocked(useAuth);
const mockUseMLBSignals = vi.mocked(useMLBSignals);
const mockUseCanonicalSituations = vi.mocked(useCanonicalSituations);
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

function signal(overrides: Record<string, unknown>) {
  return {
    id: overrides.id ?? "sig-1",
    headline: "Late LAD lineup update could change first-pitch plans",
    detail: "Lineup card and scratch context changed before first pitch.",
    player: "Freddie Freeman",
    team: "LAD",
    opponent: "NYY",
    type: "lineup",
    confidence: 82,
    verdict: "likely",
    action_takeaway: "Watch for the official lineup card.",
    timestamp: new Date().toISOString(),
    source_count: 2,
    ...overrides,
  };
}

describe("MLB board render regressions", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("suppresses UNK and dedupes repeated headlines in the Top Watch rail", async () => {
    mockUseAuth.mockReturnValue({
      email: "subscriber@example.com",
      user: null,
      isPro: true,
      authLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    mockUseMLBSignals.mockReturnValue({
      signals: [
        signal({ id: "good-1" }),
        signal({ id: "good-2" }),
        signal({ id: "bad-unk", headline: "UNK market move leads MLB watch", team: "UNK", player: "Nick Sogard" }),
        signal({ id: "bad-matchup", headline: "ARI-LAD-ARI market move leads MLB watch", detail: "Opening line only.", team: "ARI", opponent: "LAD" }),
      ],
      loading: false,
      isLive: true,
      error: null,
      refresh: vi.fn(),
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

    render(<MLBBoard />);

    await waitFor(() => {
      expect(screen.getByText("Top Watch Items")).toBeInTheDocument();
    });

    const rail = screen.getByText("Top Watch Items").closest("aside");
    expect(rail).not.toBeNull();
    const railText = rail?.textContent ?? "";
    expect(railText).not.toMatch(/\bUNK\b/);
    expect(document.body.textContent ?? "").not.toContain("ARI-LAD-ARI");
    expect(document.body.textContent ?? "").not.toContain("market move leads MLB watch");

    const headlineMatches = within(rail as HTMLElement).getAllByText(/Late LAD lineup update could change first-pitch plans/i);
    expect(headlineMatches).toHaveLength(1);
  });

  it("renders the no-story MLB state as a compact editorial watch board", async () => {
    mockUseAuth.mockReturnValue({
      email: null,
      user: null,
      isPro: false,
      authLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    mockUseMLBSignals.mockReturnValue({
      signals: [],
      loading: false,
      isLive: true,
      error: null,
      refresh: vi.fn(),
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

    render(<MLBBoard />);

    expect(await screen.findByRole("heading", { name: "No clean high-impact MLB stories right now." })).toBeInTheDocument();
    expect(screen.getByText("The slate is in watch-board mode while lineup cards, starters, weather, bullpen use, and late scratches settle.")).toBeInTheDocument();
    expect(screen.getAllByText("Lineup cards posting before first pitch").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Probable and confirmed pitcher changes").length).toBeGreaterThan(0);
    expect(screen.getByText("Watch confirmed lineups, pitcher changes, weather cells, late scratches, and source-backed market movement.")).toBeInTheDocument();
    expect(screen.getByRole("article")).toHaveClass("editorial-lead-story-quiet");
    expect(document.body.textContent ?? "").not.toContain("Today's MLB watch checklist");
    expect(document.body.textContent ?? "").not.toContain("Urgent Developing Stories");
  });
});
