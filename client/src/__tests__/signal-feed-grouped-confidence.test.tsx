import { render, waitFor } from "@testing-library/react";
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

function nflInjurySignal(overrides: Partial<LiveSignal>): LiveSignal {
  return {
    id: "nfl-injury-base",
    league: "NFL",
    game_id: "nfl-game-1",
    signal_type: "injury_update",
    headline: "Brandon Aiyuk was moved to OUT for Sunday",
    body: "Brandon Aiyuk was moved to OUT and San Francisco's passing game is the plan to monitor.",
    action_note: "Watch for confirmed beat reports and roster adjustments.",
    why_it_matters: "Target distribution and opponent prep can shift if his status holds.",
    team: "SF",
    player: "Brandon Aiyuk",
    matchup: "San Francisco 49ers @ Seattle Seahawks",
    sources: [
      { name: "Team report", type: "official" },
      { name: "Beat report", type: "beat" },
    ],
    source_count: 2,
    verdict: "likely",
    confidence: 92,
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
    urgency_reason: "Availability pressure with source check complete.",
    trust_label: "Corroborated",
    score_explanation: "Evidence review shows source check complete.",
    breakdown: {
      confidenceScore: 92,
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
    ...overrides,
  };
}

// Four same-type NFL signals so the Signal Feed collapses them into a grouped
// rollup row even after one is promoted to the featured lead story.
function groupedInjurySignals(): LiveSignal[] {
  return [
    nflInjurySignal({ id: "nfl-injury-1" }),
    nflInjurySignal({
      id: "nfl-injury-2",
      player: "Deebo Samuel",
      headline: "Deebo Samuel was moved to OUT for Sunday",
      body: "Deebo Samuel was moved to OUT and the receiver rotation is the plan to monitor.",
      confidence: 91,
    }),
    nflInjurySignal({
      id: "nfl-injury-3",
      player: "George Kittle",
      headline: "George Kittle was moved to OUT for Sunday",
      body: "George Kittle was moved to OUT and the tight end plan is the read to monitor.",
      confidence: 90,
    }),
    nflInjurySignal({
      id: "nfl-injury-4",
      player: "Christian McCaffrey",
      headline: "Christian McCaffrey was moved to OUT for Sunday",
      body: "Christian McCaffrey was moved to OUT and the backfield plan is the read to monitor.",
      confidence: 89,
    }),
  ];
}

// A lone MLB lineup signal. With no games on the mocked slate, lineup signals
// take a smaller offseason penalty (0.7x) than injury_update (0.4x) in
// selectHomepageLead, so this becomes the featured lead and leaves the feed.
function singleMlbSignal(): LiveSignal {
  return nflInjurySignal({
    id: "mlb-skenes-scratch",
    league: "MLB",
    game_id: "mlb-pit-game",
    signal_type: "lineup",
    headline: "Skenes rotation update for tonight in Pittsburgh",
    body: "Paul Skenes is not in the starting rotation and Pittsburgh is adjusting pitcher order.",
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
  });
}

// A lone NBA injury signal — stays a single (non-grouped) feed row and keeps
// its confidence percentage.
function singleNbaSignal(): LiveSignal {
  return nflInjurySignal({
    id: "nba-tatum-watch",
    league: "NBA",
    game_id: null,
    headline: "Tatum left ankle recovery timeline under evaluation",
    body: "Jayson Tatum remains on injury watch and Boston is monitoring ankle recovery.",
    action_note: "Watch for any official timeline update from the team.",
    why_it_matters: "Tatum availability affects Boston offseason roster planning.",
    team: "BOS",
    player: "Jayson Tatum",
    matchup: null,
    score: 85,
    confidence: 88,
  });
}

describe("signal feed grouped confidence", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders grouped rollup rows with no confidence percentage", async () => {
    mockUseAuth.mockReturnValue(signedOutAuth());
    mockFetchSignals.mockResolvedValue([...groupedInjurySignals(), singleMlbSignal(), singleNbaSignal()]);
    mockFetchLiveGamesForSituations.mockResolvedValue([]);

    const { container } = render(<LiveIntelligenceHome />);
    await waitFor(() => {
      expect(container.querySelectorAll(".bloomberg-row").length).toBeGreaterThan(0);
    });

    const rows = [...container.querySelectorAll(".bloomberg-row")];
    const groupedRow = rows.find((row) =>
      /^\d+ injury updates$/i.test(row.querySelector(".bloomberg-topic")?.textContent?.trim() ?? ""),
    );
    expect(groupedRow).toBeDefined();

    const groupedConf = groupedRow!.querySelector(".bloomberg-conf");
    expect(groupedConf?.textContent).toBe("");
    expect(groupedConf?.classList.contains("is-summary")).toBe(true);
    expect(groupedRow!.textContent).not.toContain("%");

    // A lone signal keeps its confidence readout — the blank is summary-only.
    const singleRow = rows.find(
      (row) => row.querySelector(".bloomberg-league")?.textContent?.trim() === "NBA",
    );
    expect(singleRow).toBeDefined();
    expect(singleRow!.querySelector(".bloomberg-conf")?.textContent).toBe("88%");
  });
});
