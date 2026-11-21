import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import LiveIntelligenceHome from "@/pages/LiveIntelligenceHome";
import { useAuth } from "@/context/AuthContext";
import { fetchSignals, type LiveSignal } from "@/lib/signalsApi";
import { adaptSignalToSituation, fetchLiveGamesForSituations } from "@/lib/intelligenceSituationsApi";
import { computeImpact } from "@/lib/signalImpact";
import { badgeableInjuryDesignation as fromLib } from "@/lib/injuryDesignation";
import { badgeableInjuryDesignation as fromBoard } from "@/components/board/boardAdapters";

/**
 * Every surface that turns live_signals.injury_designation into words goes
 * through the story card's gate, badgeableInjuryDesignation:
 *   - the homepage (headline, change label, tags, implications),
 *   - signalImpact (no "Q" for a missing designation),
 *   - intelligenceSituationsApi buildImplications.
 * QUESTIONABLE stays withheld: rows written before the processor fix still
 * hold the invented default, byte-identical to a real one.
 */

vi.mock("@/context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/signalsApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/signalsApi")>()),
  fetchSignals: vi.fn(),
}));
vi.mock("@/lib/intelligenceSituationsApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/intelligenceSituationsApi")>()),
  fetchLiveGamesForSituations: vi.fn(),
}));

const now = new Date().toISOString();

function injury(overrides: Partial<LiveSignal> = {}): LiveSignal {
  return {
    id: "kc-wr",
    league: "NFL",
    game_id: "nfl-game-1",
    signal_type: "injury_update",
    headline: "Rashee Rice (knee) — Questionable",
    body: "Rashee Rice left practice early with a knee issue and Kansas City's passing game is the team context to monitor.",
    action_note: "Monitor status.",
    why_it_matters: "The Chiefs' target distribution can shift if his status changes.",
    team: "KC",
    player: "Rashee Rice",
    matchup: "Kansas City Chiefs @ Denver Broncos",
    sources: [{ name: "Beat report", type: "beat" }, { name: "Team report", type: "official" }],
    source_count: 2,
    verdict: "likely",
    confidence: 88,
    confirmation_strength: "Corroborated",
    line_movement: null,
    injury_designation: "Questionable",
    lineup_status: null,
    weather_note: null,
    betting_relevance: true,
    fantasy_relevance: true,
    score: 92,
    score_band: "Strong",
    urgency_label: "WATCH",
    urgency_reason: "Availability pressure.",
    trust_label: "Corroborated",
    score_explanation: "Evidence review.",
    breakdown: { confidenceScore: 88, sourceQualityScore: 82, marketImpactScore: 58, recencyBonus: 20, relevanceScore: 86, contextScore: 82 },
    raw_event_ids: ["event-1"],
    signal_time: now,
    created_at: now,
    updated_at: now,
    outcome_id: null,
    ...overrides,
  } as LiveSignal;
}

afterEach(() => vi.clearAllMocks());

describe("one gate", () => {
  it("the board re-exports the lib gate, so every caller reads the same function", () => {
    expect(fromBoard).toBe(fromLib);
    expect(fromLib("Questionable")).toBeUndefined();
    expect(fromLib("Out")).toBe("OUT");
    expect(fromLib("OUT", "He has been cleared to play")).toBeUndefined();
  });
});

describe("homepage", () => {
  const render_ = async (signal: LiveSignal) => {
    vi.mocked(useAuth).mockReturnValue({ email: null, user: null, isPro: false, authLoading: false, login: vi.fn(), logout: vi.fn() } as never);
    vi.mocked(fetchSignals).mockResolvedValue([signal]);
    vi.mocked(fetchLiveGamesForSituations).mockResolvedValue([]);
    render(<LiveIntelligenceHome />);
    await waitFor(() => expect(document.body.textContent ?? "").toContain("Rashee Rice"));
    return document.body.textContent ?? "";
  };

  it("prints no QUESTIONABLE anywhere a stored Questionable could reach (headline, labels, tags, implications)", async () => {
    // The signal's own headline carries the processor text; the homepage
    // writes its own headline, so check what the page generated, not the feed.
    const text = await render_(injury({ headline: "Rashee Rice knee update" }));
    expect(text).not.toMatch(/questionable/i);
    expect(text).not.toContain("availability signal");
    expect(text).not.toContain("Injury designation:");
  });

  it("still prints a designation the gate passes", async () => {
    await render_(injury({ headline: "Rashee Rice knee update", injury_designation: "OUT" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /Rashee Rice.*— OUT/ })).toBeInTheDocument());
  });

  it("drops a designation the story's own prose contradicts", async () => {
    const text = await render_(injury({
      headline: "Rashee Rice knee update",
      body: "Rashee Rice has been cleared and returned to practice in Kansas City.",
      injury_designation: "OUT",
    }));
    expect(text).not.toMatch(/— OUT\b/);
  });
});

describe("signalImpact", () => {
  const metric = (designation: string | undefined) =>
    computeImpact({ type: "injury", injuryDesignation: designation }).dfs?.metrics.find((m) => m.label === "Designation")?.value;

  it("does not read a missing designation as Q", () => {
    expect(metric(undefined)).toBe("Not confirmed");
    expect(metric(undefined)).not.toMatch(/^Q/);
  });

  it("withholds Questionable and keeps OUT / Doubtful", () => {
    expect(metric("Questionable")).toBe("Not confirmed");
    expect(metric("Q")).toBe("Not confirmed");
    expect(metric("OUT")).toBe("OUT");
    expect(metric("Doubtful")).toBe("DOUBTFUL");
    const doubtful = computeImpact({ type: "injury", injuryDesignation: "Doubtful" });
    expect(doubtful.dfs?.ownershipDirection).toBe("drop");
  });
});

describe("buildImplications", () => {
  const implications = (s: LiveSignal) => adaptSignalToSituation(s).implications;
  it("no 'Injury designation:' line for a withheld, missing or contradicted designation", () => {
    expect(implications(injury()).join(" ")).not.toContain("Injury designation");
    expect(implications(injury({ injury_designation: null })).join(" ")).not.toContain("Injury designation");
    expect(implications(injury({ injury_designation: "OUT", body: "He was activated off IR." })).join(" ")).not.toContain("Injury designation");
  });
  it("keeps one the gate passes", () => {
    expect(implications(injury({ injury_designation: "OUT" }))).toContain("Injury designation: OUT.");
  });
});
