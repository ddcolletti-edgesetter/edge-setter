import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import LiveIntelligenceHome from "@/pages/LiveIntelligenceHome";
import { useAuth } from "@/context/AuthContext";
import { fetchSignals, type LiveSignal } from "@/lib/signalsApi";
import { fetchLiveGamesForSituations } from "@/lib/intelligenceSituationsApi";
import type { LiveGameSituation } from "@/lib/intelligenceSituationsApi";
import userEvent from "@testing-library/user-event";

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

// NBA offseason availability watch signal — high confidence, no active game
function nbaOffseasonInjurySignal(): LiveSignal {
  return {
    ...aiyukSignal(),
    id: "nba-tatum-offseason",
    league: "NBA",
    game_id: null,
    signal_type: "injury_update",
    headline: "Tatum left ankle — recovery timeline under evaluation",
    body: "Jayson Tatum remains on injury watch. Boston monitoring ankle recovery ahead of any summer activity.",
    action_note: "Watch for any official timeline update from the team.",
    why_it_matters: "Tatum availability affects Boston offseason roster planning.",
    team: "BOS",
    player: "Jayson Tatum",
    matchup: null,
    injury_designation: "OUT",
    lineup_status: null,
    score: 92,
    confidence: 88,
    // betting_relevance and fantasy_relevance inherited true from aiyukSignal
  };
}

// MLB lineup signal — lower confidence, active game tonight, signal 2 hours old
function mlbLineupScratchSignal(): LiveSignal {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  return {
    ...aiyukSignal(),
    id: "mlb-skenes-scratch",
    league: "MLB",
    game_id: "mlb-pit-game",
    signal_type: "lineup",
    headline: "Skenes rotation update — Pittsburgh pitching plan for tonight",
    body: "Paul Skenes is not in the starting rotation. Pittsburgh adjusting pitcher order for the evening game.",
    action_note: "Monitor for lineup confirmation and starting pitcher update.",
    why_it_matters: "Pittsburgh pitching rotation shift reshapes the game environment.",
    team: "PIT",
    player: "Paul Skenes",
    matchup: null,
    injury_designation: null,
    lineup_status: "scratched",
    score: 78,
    confidence: 75,
    betting_relevance: false,
    fantasy_relevance: false,
    signal_time: twoHoursAgo,
    created_at: twoHoursAgo,
    updated_at: twoHoursAgo,
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
  "availability could change",
  "status could change",
  "now the team context to monitor",
  "Assignment Desk",
  "Assignment desk",
  "story context active",
  "role picture",
  "lineup plan on watch",
  "sports update is confirmed",
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
        name: "Report: Brandon Aiyuk's availability is in question",
      })).toBeInTheDocument();
    });

    const domText = document.body.textContent ?? "";
    for (const phrase of bannedHomepagePhrases) {
      expect(domText).not.toContain(phrase);
    }

    expect(screen.getByTestId("homepage-lead-support-stack")).toBeInTheDocument();
    expect(screen.getByText("Game Windows")).toBeInTheDocument();
    expect(screen.getByText("Stories to Watch")).toBeInTheDocument();
    expect(screen.getByText("Source Trail")).toBeInTheDocument();
    expect(screen.getByText("Quiet Board Context")).toBeInTheDocument();
    expect(screen.getByText("Latest Verified Notes")).toBeInTheDocument();

    // The lead card is exactly the build spec's slots (Slots + Facts):
    // Kicker, Matchup, Headline, Facts, Button — the Sentence slot is never
    // shown — plus the interim line. Nothing else may render on it.
    const lead = screen.getByTestId("homepage-lead-card");
    const slots = Array.from(lead.querySelectorAll("[data-slot]"))
      .filter((el) => el.parentElement === lead)
      .map((el) => el.getAttribute("data-slot"));
    expect(slots).toEqual(["kicker", "matchup", "headline", "facts", "button"]);
    expect(Array.from(lead.children).map((el) => el.getAttribute("data-slot") ?? el.getAttribute("data-testid")))
      .toEqual(["kicker", "matchup", "headline", "facts", "button", "homepage-lead-interim-note"]);
    const leadText = lead.textContent ?? "";
    expect(lead.querySelector("[data-slot='state-chip']")).not.toBeNull();
    expect(lead.querySelector("[data-slot='button']")?.textContent).toBe("Open story");
    const facts = Array.from(lead.querySelectorAll("[data-slot='facts'] dt")).map((el) => el.textContent);
    // No official-source flag yet (#114): no Status fact, and rule 1 rewrites the headline.
    expect(facts).toEqual(["Reports"]);
    expect(lead.querySelector("[data-slot='headline']")?.textContent).toBe("Report: Brandon Aiyuk's availability is in question");
    expect(lead.querySelector("[data-slot='headline']")?.textContent).not.toMatch(/(confirmed|out|will miss|ruled out)/i);
    expect(leadText).toContain("2 reports");
    for (const gone of [
      "ES Agent",
      "Why it matters",
      "What happened",
      "Watch next",
      "Historical pattern match",
      "Similar situations have moved markets",
      "More impact context",
      "before public confirmation",
      "Sources checked",
      "sources tracked",
      "EdgeSetter review",
      "Detected",
      "Player focus",
      "⚡",
    ]) {
      expect(leadText).not.toContain(gone);
    }
    // Removed from the DOM, not hidden: no overlay, no image header, no journey.
    expect(lead.querySelector(".edge-overlay")).toBeNull();
    expect(lead.querySelector(".sports-story-visual")).toBeNull();
    expect(lead.querySelector(".conf-journey")).toBeNull();
    expect(screen.getByTestId("homepage-lead-interim-note").textContent).toBe("Interim display: status, line and report count only.");

    expect(screen.queryByRole("heading", { name: "SF availability status is moving" })).not.toBeInTheDocument();
    expect(domText).not.toMatch(/[A-Z]{2,4} availability status is moving/);

    expect(document.querySelector(".edgesetter-sidebar-wordmark img")?.getAttribute("width")).toBe("174");
    expect(document.querySelector(".edgesetter-sidebar-wordmark")).toBeInTheDocument();
    expect(document.querySelector(".media-homepage-header img")?.getAttribute("src")).toBe("/brand/edgesetter-logo.png");
  });

  it("does not render UNK in homepage lead or top watch", async () => {
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

  it("does not attach NFL story context to MLB game-window cards", async () => {
    mockUseAuth.mockReturnValue(signedOutAuth());
    mockFetchSignals.mockResolvedValue([aiyukSignal()]);
    const mlbGame: LiveGameSituation = {
      id: "mlb-game-1",
      league: "MLB",
      awayTeam: "SEA",
      homeTeam: "DET",
      gameTime: now,
      status: "Scheduled",
      awayScore: null,
      homeScore: null,
      activeSituations: 1,
      topEscalation: "Emerging",
    };
    mockFetchLiveGamesForSituations.mockImplementation(async (league) => league === "MLB" ? [mlbGame] : []);

    render(<LiveIntelligenceHome />);

    await waitFor(() => {
      expect(document.body.textContent).toContain("SEA @ DET sits in scheduled watch");
    });

    const domText = document.body.textContent ?? "";
    // Session 2: the Game windows card section was cut from the homepage —
    // game-window context now only surfaces through the quick-nav support stack.
    expect(screen.queryByText("Game windows")).not.toBeInTheDocument();
    expect(domText).not.toContain("No verified team-news change has attached to");
    expect(domText).not.toContain("SEA @ DET: Brandon Aiyuk");
    expect(domText).not.toContain("SEA @ DET: Brandon Aiyuk availability");
    expect(domText).not.toContain("SEA @ DET: Kendrick Law");
    expect(domText).not.toContain("SEA @ DET: 49ers");
    expect(domText).not.toContain("MLB / SEA @ DET / Brandon Aiyuk");
    expect(domText).not.toContain("MLB / SEA @ DET / passing-game");
  });

  it("offseason NBA injury does not lead over an active-league lineup signal when that league has games today", async () => {
    mockUseAuth.mockReturnValue(signedOutAuth());

    const mlbGame: LiveGameSituation = {
      id: "mlb-pit-game-tonight",
      league: "MLB",
      awayTeam: "PIT",
      homeTeam: "CHC",
      gameTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      status: "Scheduled",
      awayScore: null,
      homeScore: null,
      activeSituations: 1,
      topEscalation: "Escalating",
    };

    // NBA signal arrives first (higher confidence, fresher) but NBA has no games.
    // MLB signal is 2 hours old, lower confidence, but Pittsburgh has a game tonight.
    mockFetchSignals.mockResolvedValue([nbaOffseasonInjurySignal(), mlbLineupScratchSignal()]);
    mockFetchLiveGamesForSituations.mockImplementation(async (league: string) =>
      league === "MLB" ? [mlbGame] : [],
    );

    render(<LiveIntelligenceHome />);

    await waitFor(() => {
      // MLB lineup signal should be the homepage lead — the 0.4 offseason
      // injury penalty (vs 0.7 for other offseason types) ensures that NBA
      // injury_update at 88% STRONG does not outscore an active-league signal
      // with a game on tonight's slate.
      expect(screen.getByRole("heading", { name: "Report: Paul Skenes' availability is in question" })).toBeInTheDocument();
    });

    const leadHeading = screen.getByRole("heading", { name: "Report: Paul Skenes' availability is in question" });
    const leadArticle = leadHeading.closest("article");
    // Stock photos are retired — no /sports/*.jpg image renders; the lead falls
    // back to the photo-free team-badge treatment.
    // The lead card has no image header (not a spec'd slot).
    expect(leadArticle?.querySelector("[data-testid='homepage-story-image']")).toBeNull();
    expect(leadArticle?.querySelector(".sports-story-visual")).toBeNull();
  });
});
