import { describe, expect, it } from "vitest";

import {
  filterPublicSignals,
  publicGamesForLeague,
  publicStatusLabel,
  sanitizeSignalForPublic,
} from "@/lib/publicDisplayHygiene";
import type { LiveSignal } from "@/lib/signalsApi";

const now = new Date("2026-06-04T12:00:00Z");

function signal(overrides: Partial<LiveSignal> = {}): LiveSignal {
  return {
    id: "signal-1",
    league: "MLB",
    game_id: "game-1",
    signal_type: "lineup_change",
    headline: "Dodgers lineup change draws market attention",
    body: "Lineup reporting changed the pregame read.",
    action_note: "Watch for official lineup and market response.",
    why_it_matters: "Lineup changes can alter run environment and late pricing.",
    team: "LAD",
    player: null,
    matchup: "LAD @ NYY",
    sources: [{ name: "Team report", type: "official" }],
    source_count: 1,
    verdict: "likely",
    confidence: 80,
    confirmation_strength: "Developing",
    line_movement: null,
    injury_designation: null,
    lineup_status: null,
    weather_note: null,
    betting_relevance: true,
    fantasy_relevance: true,
    score: 70,
    score_band: "Strong",
    urgency_label: "WATCH",
    urgency_reason: "Source context attached.",
    trust_label: "Developing",
    score_explanation: "Source context attached.",
    breakdown: {
      confidenceScore: 80,
      sourceQualityScore: 70,
      marketImpactScore: 30,
      recencyBonus: 10,
      relevanceScore: 40,
      contextScore: 40,
    },
    raw_event_ids: ["raw-1"],
    signal_time: now.toISOString(),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    outcome_id: null,
    ...overrides,
  };
}

describe("public display hygiene", () => {
  it("suppresses public signals with UNK or missing public identity", () => {
    expect(filterPublicSignals([
      signal({ id: "good", team: "LAD" }),
      signal({ id: "bad", team: "UNK", matchup: null }),
      signal({ id: "missing", team: null, matchup: null }),
    ], now).map((item) => item.id)).toEqual(["good"]);
  });

  it("suppresses opening-line-only signals from public story eligibility", () => {
    const result = filterPublicSignals([
      signal({
        id: "open",
        signal_type: "line_move",
        headline: "SD @ PHI: Opening line -1.5 | O/U 8.5",
        body: "Opening spread: -1.5. Market baseline established.",
        action_note: "Opening line only.",
        line_movement: { open: -1.5, current: -1.5, delta: 0, direction: "flat" },
      }),
    ], now);

    expect(result).toEqual([]);
  });

  it("dedupes MLB games and suppresses stale games from public slates", () => {
    const games = publicGamesForLeague([
      { id: "stale", league: "MLB", away_team: "NYY", home_team: "ATH", game_time: "2026-05-30T01:00:00Z" },
      { id: "stats", league: "MLB", away_team: "SD", home_team: "PHI", game_time: "2026-06-04T17:05:00Z" },
      { id: "odds", league: "MLB", away_team: "SD", home_team: "PHI", game_time: "2026-06-04T17:06:00Z", spread_line: -1.5 },
    ], "MLB", now);

    expect(games).toHaveLength(1);
    expect(games[0].id).toBe("odds");
  });

  it("downgrades routine MLB transactions instead of showing fake urgency", () => {
    const cleaned = sanitizeSignalForPublic(signal({
      signal_type: "transaction",
      headline: "Cole Sulser - IL activation",
      body: "Tampa Bay Rays activated RHP Cole Sulser from the 15-day injured list.",
      action_note: "Roster context only.",
      why_it_matters: "Routine roster move.",
      urgency_label: "URGENT",
      score: 72,
    }), now);

    expect(cleaned?.urgency_label).toBe("NOTE");
    expect(cleaned?.score).toBeLessThanOrEqual(48);
    expect(cleaned?.action_note).toMatch(/Roster context only/i);
  });

  it("labels NFL offseason status as watch context without betting or fantasy claims", () => {
    const cleaned = sanitizeSignalForPublic(signal({
      league: "NFL",
      game_id: null,
      signal_type: "injury_update",
      headline: "Austin Jackson (Foot) - Questionable",
      body: "Jackson expects to return for training camp in July.",
      team: "MIA",
      matchup: null,
      urgency_label: "URGENT",
      betting_relevance: true,
      fantasy_relevance: true,
    }), now);

    expect(cleaned?.headline).toMatch(/^Offseason watch:/);
    expect(cleaned?.betting_relevance).toBe(false);
    expect(cleaned?.fantasy_relevance).toBe(false);
    expect(cleaned?.action_note).toMatch(/Offseason watch only/i);
  });

  it("maps public labels to reliability and urgency language", () => {
    expect(publicStatusLabel("confirmed")).toBe("Confirmed");
    expect(publicStatusLabel("urgent")).toBe("Urgent");
    expect(publicStatusLabel("likely")).toBe("Watch");
    expect(publicStatusLabel("emerging")).toBe("Developing");
  });
});
