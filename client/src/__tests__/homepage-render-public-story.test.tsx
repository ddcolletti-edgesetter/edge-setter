import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import LiveIntelligenceHome from "@/pages/LiveIntelligenceHome";
import { useAuth } from "@/context/AuthContext";
import { fetchSignals, type LiveSignal } from "@/lib/signalsApi";
import { fetchLiveGamesForSituations } from "@/lib/intelligenceSituationsApi";

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/signalsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/signalsApi")>();
  return {
    ...actual,
    fetchSignals: vi.fn(),
  };
});

vi.mock("@/lib/intelligenceSituationsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/intelligenceSituationsApi")>();
  return {
    ...actual,
    fetchLiveGamesForSituations: vi.fn(),
  };
});

const mockUseAuth = vi.mocked(useAuth);
const mockFetchSignals = vi.mocked(fetchSignals);
const mockFetchLiveGamesForSituations = vi.mocked(fetchLiveGamesForSituations);

const now = new Date().toISOString();

function signedOutAuth() {
  return {
    email: null,
    user: null,
    isPro: false,
    authLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  };
}

function aiyukSignal(): LiveSignal {
  return {
    id: "aiyuk-sf-out",
    league: "NFL",
    game_id: "nfl-game-1",
    signal_type: "injury_update",
    headline: "SF availability status is moving",
    body: "Brandon Aiyuk was moved to OUT and San Francisco's passing game is now the team context to monitor.",
    action_note: "Initial read; watch for confirmed beat reports, practice participation, roster adjustments, and market response.",
    why_it_matters: "The 49ers' passing-game plan, target distribution, and opponent prep can shift if his status holds or changes again.",
    team: "SF",
    player: "Brandon Aiyuk",
    matchup: "San Francisco 49ers @ Seattle Seahawks",
    sources: [
      { name: "Team report", type: "official" },
      { name: "Beat report", type: "beat" },
    ],
    source_count: 2,
    verdict: "likely",
    confidence: 88,
    confirmation_strength: "Corroborated",
    line_movement: null,
    injury_designation: "OUT",
    lineup_status: null,
    weather_note: null,
    betting_relevance: true,
    fantasy_relevance: true,
    score: 92,
    score_band: "Strong",
    urgency_label: "WATCH",
    urgency_reason: "Availability pressure with source check complete and timing check complete.",
    trust_label: "Corroborated",
    score_explanation: "Evidence review shows source check complete and timing check complete.",
    breakdown: {
      confidenceScore: 88,
      sourceQualityScore: 82,
      marketImpactScore: 58,
      recencyBonus: 20,
      relevanceScore: 86,
      contextScore: 82,
    },
    raw_event_ids: ["event-1"],
    signal_time: now,
    created_at: now,
    updated_at: now,
    outcome_id: null,
  };
}

function unkMlbSignal(): LiveSignal {
  return {
    ...aiyukSignal(),
    id: "unk-mlb",
    league: "MLB",
    game_id: null,
    signal_type: "injury_update",
    headline: "Nick Sogard availability keeps UNK lineup plan on watch",
    body: "UNK lineup plan changed.",
    action_note: "Watch UNK.",
    why_it_matters: "UNK context should not render.",
    team: "UNK",
    player: "Nick Sogard",
    matchup: null,
    score: 99,
    confidence: 95,
  };
}

const bannedHomepagePhrases = [
  "LEAD DESK READ",
  "Lead Desk Read",
  "Availability pressure",
  "availability pressure",
  "availability status is moving",
  "OUT availability signal",
  "widely known",
  "no major shift",
  "Corroborated",
  "Initial read",
  "Evidence review",
  "source check complete",
  "timing check complete",
  "availability is moving the slate",
];

describe("homepage public story render", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders the real homepage lead as public story copy without internal pipeline labels", async () => {
    mockUseAuth.mockReturnValue(signedOutAuth());
    mockFetchSignals.mockResolvedValue([aiyukSignal()]);
    mockFetchLiveGamesForSituations.mockResolvedValue([]);

    render(<LiveIntelligenceHome />);

    await waitFor(() => {
      expect(screen.getByRole("heading", {
        name: "Brandon Aiyuk availability keeps 49ers passing-game plan on watch",
      })).toBeInTheDocument();
    });

    const domText = document.body.textContent ?? "";
    for (const phrase of bannedHomepagePhrases) {
      expect(domText).not.toContain(phrase);
    }

    expect(screen.getByText("What happened")).toBeInTheDocument();
    expect(screen.getAllByText("Why it matters").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Watch next").length).toBeGreaterThan(0);
    expect(domText).toContain("Brandon Aiyuk's availability status changed and 49ers are now the team context to monitor.");
    expect(domText).toContain("Watch for confirmed beat reports, practice participation, roster adjustments, and any movement in fantasy or betting markets.");
    expect(domText).toContain("Source trail checked. Timing window reviewed. Impact still developing.");

    expect(screen.queryByRole("heading", { name: "SF availability status is moving" })).not.toBeInTheDocument();
    expect(domText).not.toMatch(/\b[A-Z]{2,4} availability status is moving\b/);

    const leadStory = screen.getByRole("heading", {
      name: "Brandon Aiyuk availability keeps 49ers passing-game plan on watch",
    }).closest("article");
    expect(leadStory).not.toBeNull();
    const leadImage = leadStory?.querySelector<HTMLImageElement>("[data-testid='homepage-story-image']");
    expect(leadImage?.getAttribute("src")).toBe("/sports/nfl/hero.jpg");

    expect(document.querySelector(".edgesetter-sidebar-wordmark img")?.getAttribute("width")).toBe("174");
    expect(document.querySelector(".edgesetter-sidebar-wordmark")).toBeInTheDocument();
    expect(document.querySelector(".live-intel-brand-logo-crop img")?.getAttribute("src")).toBe("/brand/edgesetter-logo.png");
  });

  it("does not render UNK in homepage lead or assignment desk", async () => {
    mockUseAuth.mockReturnValue(signedOutAuth());
    mockFetchSignals.mockResolvedValue([unkMlbSignal(), aiyukSignal()]);
    mockFetchLiveGamesForSituations.mockResolvedValue([]);

    render(<LiveIntelligenceHome />);

    await waitFor(() => {
      expect(mockFetchSignals).toHaveBeenCalled();
      expect(mockFetchLiveGamesForSituations).toHaveBeenCalled();
    });

    const domText = document.body.textContent ?? "";
    expect(domText).not.toMatch(/\bUNK\b/);
    expect(domText).not.toContain("Nick Sogard availability keeps UNK lineup plan");
    expect(domText).not.toContain("MLB / UNK / Nick Sogard");
  });
});
