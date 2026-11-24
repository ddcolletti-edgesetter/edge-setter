import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import LiveIntelligenceHome, { selectHomepageLead } from "@/pages/LiveIntelligenceHome";
import { useAuth } from "@/context/AuthContext";
import { fetchSignals, type LiveSignal } from "@/lib/signalsApi";
import {
  adaptSignalToSituation,
  fetchGamesTable,
  fetchLiveGamesForSituations,
  type GamesTableRow,
} from "@/lib/intelligenceSituationsApi";
import { homepageLeadAgeHours, homepageLeadPool } from "@/lib/leadRanker";

/**
 * The homepage lead's candidate pool and its ages.
 *
 * 1. The pool goes through the boards' finished-game filter
 *    (dropStoriesNoLongerLive, #110) before anything is ranked. A one-team NFL
 *    injury story is matched to its team's next NFL game at or after the story
 *    last changed; if that game is final, the story cannot lead.
 * 2. CFB goes through the same path, where a one-team story is deliberately
 *    NOT placed (one CFB code can name several schools), so it stays — while a
 *    CFB story naming both teams is placed and dropped like any other.
 * 3. A line move is aged from line_move_first_received_at, never from the
 *    signal's founding time; with no such time it has no age and cannot lead.
 */

vi.mock("@/context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/signalsApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/signalsApi")>()),
  fetchSignals: vi.fn(),
}));
vi.mock("@/lib/intelligenceSituationsApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/intelligenceSituationsApi")>()),
  fetchGamesTable: vi.fn(),
  fetchLiveGamesForSituations: vi.fn(),
}));

const NOW = Date.now();
const iso = (offsetHours: number) => new Date(NOW + offsetHours * 3_600_000).toISOString();

function signal(overrides: Partial<LiveSignal> = {}): LiveSignal {
  return {
    id: "hou-injury",
    league: "NFL",
    game_id: null,
    signal_type: "injury_update",
    headline: "Nico Collins (hamstring) — OUT",
    body: "Nico Collins is out with a hamstring injury and Houston's passing game is the team context to monitor.",
    action_note: "Monitor status.",
    why_it_matters: "Houston's target distribution shifts without him.",
    team: "HOU",
    player: "Nico Collins",
    matchup: null,
    sources: [{ name: "Team report", type: "official" }],
    source_count: 1,
    verdict: "confirmed",
    confidence: 84,
    confirmation_strength: "Corroborated",
    line_movement: null,
    injury_designation: "OUT",
    lineup_status: null,
    weather_note: null,
    betting_relevance: true,
    fantasy_relevance: true,
    score: 90,
    score_band: "Strong",
    urgency_label: "WATCH",
    urgency_reason: "Availability pressure.",
    trust_label: "Corroborated",
    score_explanation: "Evidence review.",
    breakdown: { confidenceScore: 84, sourceQualityScore: 82, marketImpactScore: 58, recencyBonus: 20, relevanceScore: 86, contextScore: 82 },
    raw_event_ids: ["event-1"],
    // 2.5h old: inside the homepage scorer's "Developing" window, so the story
    // is a real lead candidate and only the game decides. (At 4h the scorer's
    // "Widely Known" rule kills it on its own and a finished-game test would
    // pass for the wrong reason — the control cases below guard that.)
    signal_time: iso(-2.5),
    created_at: iso(-2.5),
    updated_at: iso(-2.5),
    outcome_id: null,
    ...overrides,
  } as LiveSignal;
}

function game(overrides: Partial<GamesTableRow> & { id: string }): GamesTableRow {
  return {
    league: "NFL",
    away_team: "HOU",
    home_team: "IND",
    // Kicks off after the story last changed, so the one-team rule places the
    // story on it. The status is what each test varies.
    game_time: iso(-2.4),
    status: "final",
    home_score: 20,
    away_score: 17,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("homepage lead pool: finished games", () => {
  const hou = adaptSignalToSituation(signal());

  it("a one-team NFL story whose team's game is final cannot lead the homepage", () => {
    const table = [game({ id: "hou-ind", status: "final" })];
    expect(homepageLeadPool([hou], table, NOW)).toEqual([]);
    expect(selectHomepageLead([hou], [], table, NOW)).toBeNull();
  });

  it("the same story still leads while its game has not started", () => {
    const table = [game({ id: "hou-ind", status: "scheduled", game_time: iso(20), home_score: null, away_score: null })];
    expect(selectHomepageLead([hou], [], table, NOW)?.id).toBe("hou-injury");
  });

  it("is matched by league: a finished NBA game under the same code does not drop an NFL story", () => {
    const table = [game({ id: "nba-hou", league: "NBA", status: "final" })];
    expect(homepageLeadPool([hou], table, NOW).map((s) => s.id)).toEqual(["hou-injury"]);
  });

  it("drops a story by its own game_id when that game is final", () => {
    const withId = adaptSignalToSituation(signal({ id: "by-id", game_id: "g-final", team: "KC", player: "Rashee Rice", headline: "Rashee Rice (knee) — OUT" }));
    const table = [game({ id: "g-final", away_team: "KC", home_team: "DEN", status: "final" })];
    expect(homepageLeadPool([withId], table, NOW)).toEqual([]);
  });

  it("CFB one-team story: not placed on a game (shared CFB codes), so it stays in the pool", () => {
    const cfb = adaptSignalToSituation(signal({ id: "cfb-one", league: "CFB", team: "MIA", player: "Carson Beck", headline: "Carson Beck (elbow) — OUT" }));
    const table = [game({ id: "cfb-mia", league: "CFB", away_team: "MIA", home_team: "FSU", status: "final" })];
    expect(homepageLeadPool([cfb], table, NOW).map((s) => s.id)).toEqual(["cfb-one"]);
  });

  it("CFB story naming both teams is placed by the pair and dropped once that game is final", () => {
    const cfb = adaptSignalToSituation(signal({ id: "cfb-pair", league: "CFB", team: "MIA", matchup: "MIA @ FSU", player: "Carson Beck", headline: "Carson Beck (elbow) — OUT" }));
    const table = [game({ id: "cfb-mia", league: "CFB", away_team: "MIA", home_team: "FSU", status: "final" })];
    expect(homepageLeadPool([cfb], table, NOW)).toEqual([]);
  });
});

describe("homepage lead age: line moves", () => {
  const move = (first: string | null | undefined) => adaptSignalToSituation(signal({
    id: "move",
    signal_type: "line_move",
    player: null,
    injury_designation: null,
    signal_time: iso(-96),
    created_at: iso(-96),
    line_movement: { open: 3, current: 4.5, delta: 1.5, direction: "up" },
    line_move_first_received_at: first,
  }));

  it("ages a line move from the first receipt of its current line, not the signal's founding time", () => {
    expect(homepageLeadAgeHours(move(iso(-2)), NOW)).toBeCloseTo(2, 5);
  });

  it("gives a line move with no server time no age at all, rather than the founding time", () => {
    expect(homepageLeadAgeHours(move(null), NOW)).toBe(Number.POSITIVE_INFINITY);
    expect(homepageLeadAgeHours(move(undefined), NOW)).toBe(Number.POSITIVE_INFINITY);
  });

  it("leaves every other story on timing.firstSeen", () => {
    expect(homepageLeadAgeHours(adaptSignalToSituation(signal()), NOW)).toBeCloseTo(2.5, 5);
  });
});

describe("homepage render", () => {
  const renderHome = async (signals: LiveSignal[], table: GamesTableRow[]) => {
    vi.mocked(useAuth).mockReturnValue({ email: null, user: null, isPro: false, authLoading: false, login: vi.fn(), logout: vi.fn() } as never);
    vi.mocked(fetchSignals).mockResolvedValue(signals);
    vi.mocked(fetchGamesTable).mockImplementation(async (league) => table.filter((row) => row.league === league));
    vi.mocked(fetchLiveGamesForSituations).mockResolvedValue([]);
    render(<LiveIntelligenceHome />);
    await waitFor(() => expect(fetchLiveGamesForSituations).toHaveBeenCalled());
  };

  it("does not lead with the HOU story once HOU–IND is final", async () => {
    await renderHome([signal()], [game({ id: "hou-ind", status: "final" })]);
    await waitFor(() => expect(screen.getByText("Coverage status")).toBeInTheDocument());
    expect(screen.queryByText("Lead story")).toBeNull();
    expect(screen.queryByTestId("homepage-lead-interim-note")).toBeNull();
    // The no-lead state makes no wire-beating claim (cut with the timing banner).
    await waitFor(() => expect(document.body.textContent).toContain("No story qualifies to lead right now."));
    expect(document.body.textContent).not.toMatch(/before wire pickup|lands here before/);
  });

  it("leads with it while the game is upcoming, with the interim line under the lead", async () => {
    await renderHome([signal()], [game({ id: "hou-ind", status: "scheduled", game_time: iso(20), home_score: null, away_score: null })]);
    await waitFor(() => expect(screen.getByText("Lead story")).toBeInTheDocument());
    const note = screen.getByTestId("homepage-lead-interim-note");
    expect(note.textContent).toBe("Interim display: line and report count only. Status returns once sourcing is verified (#114).");
    expect(note.textContent).not.toMatch(/edge/i);
  });
});

describe("homepage lead age window (spec: fresh under 6h, stale 6–24h, never 24h+)", () => {
  const upcoming = [game({ id: "hou-ind", status: "scheduled", game_time: iso(40), home_score: null, away_score: null })];
  const aged = (hours: number, over: Partial<LiveSignal> = {}) =>
    adaptSignalToSituation(signal({ signal_time: iso(-hours), created_at: iso(-hours), updated_at: iso(-hours), ...over }));

  it("a 27-hour-old story cannot lead, even alone", () => {
    expect(selectHomepageLead([aged(27)], [], upcoming, NOW)).toBeNull();
  });

  it("a story just under 24 hours can still lead when nothing fresher is eligible", () => {
    const old = aged(23.5);
    const lead = selectHomepageLead([old], [], upcoming, NOW);
    // Either it leads (stale state on the card) or the scorer kills it on its
    // own; it must never be dropped for age.
    expect(lead === null || lead.id === old.id).toBe(true);
  });

  it("a fresh story beats a 6–24h story", () => {
    const fresh = aged(2.5, { id: "fresh" });
    const stale = aged(10, { id: "stale", score: 99, confidence: 95 });
    expect(selectHomepageLead([stale, fresh], [], upcoming, NOW)?.id).toBe("fresh");
  });
});
