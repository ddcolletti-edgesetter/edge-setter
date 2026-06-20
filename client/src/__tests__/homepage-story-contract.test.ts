import { describe, expect, it } from "vitest";

import { buildHomepageStoryModel } from "@/pages/LiveIntelligenceHome";
import { adaptSignalToSituation, type LiveGameSituation } from "@/lib/intelligenceSituationsApi";
import type { StoryCardData } from "@/components/StoryCard";
import type { LiveSignal } from "@/lib/signalsApi";

const now = new Date().toISOString();

const pressure = {
  heroLeague: "MLB coverage active",
  heroHeadline: "No verified lineup or injury break has reached lead-story weight",
  heroBody: "EdgeSetter is waiting for a real team-news break before elevating a single story.",
  timing: "Quiet board",
  market: "impact still developing",
  source: "Awaiting reports",
  changed: "Impact still developing",
  whoReacts: "Teams, report desks, and books are holding for firmer confirmation.",
  next: "A late scratch, lineup confirmation, warmup note, or external movement could become the lead.",
  sourceArcTitle: "Awaiting lineup or injury confirmation",
  sourceArcBody: "No report chain has reached homepage weight yet.",
  escalationWatch: "No verified escalation",
  escalationStage: "Monitoring",
  pressureWindows: ["Pre-game desk", "Impact still developing", "Awaiting reports"],
  convergenceSteps: [
    { label: "Board context", state: "complete" },
    { label: "Reports scanning", state: "active" },
    { label: "Impact still developing", state: "active" },
    { label: "Official confirmation", state: "waiting" },
  ],
} as const;

function liveSignal(overrides: Partial<LiveSignal>): LiveSignal {
  return {
    id: "signal-1",
    league: "MLB",
    game_id: "game-1",
    signal_type: "lineup_change",
    headline: "Blue Jays lineup confirmation window tightening",
    body: "Lineup reporting changed the pregame read before first pitch.",
    action_note: "Watch for the official lineup card and market response.",
    why_it_matters: "Lineup changes can alter run environment and player availability.",
    team: "Toronto Blue Jays",
    player: null,
    matchup: "Toronto Blue Jays @ Miami Marlins",
    sources: [
      { name: "Team report", type: "official" },
      { name: "Beat report", type: "beat" },
    ],
    source_count: 2,
    verdict: "likely",
    confidence: 88,
    confirmation_strength: "Supported",
    line_movement: { open: -110, current: -124, delta: -14, direction: "down" },
    injury_designation: null,
    lineup_status: "Projected change",
    weather_note: null,
    betting_relevance: true,
    fantasy_relevance: true,
    score: 82,
    score_band: "Strong",
    urgency_label: "WATCH",
    urgency_reason: "Lineup and market movement are aligned.",
    trust_label: "Supported",
    score_explanation: "Multiple reports and market movement are attached.",
    breakdown: {
      confidenceScore: 88,
      sourceQualityScore: 76,
      marketImpactScore: 65,
      recencyBonus: 20,
      relevanceScore: 72,
      contextScore: 70,
    },
    raw_event_ids: ["event-1"],
    signal_time: now,
    created_at: now,
    updated_at: now,
    outcome_id: null,
    ...overrides,
  };
}

function expectStoryContract(story: StoryCardData) {
  expect(story.id).toBeTruthy();
  expect(story.league).toMatch(/^(NBA|MLB|NFL|CFB)$/);
  expect(story.headline).toBeTruthy();
  expect(story.overlay).toBeTruthy();
  expect(story.overlay.timing).toBeTruthy();
  expect(story.overlay.sourceSummary).toBeTruthy();
  expect(story.overlay.confidence).toBeTruthy();
  expect(story.whatChanged).toBeTruthy();
  expect(story.whyItMatters).toBeTruthy();
  expect(story.watchNext).toBeTruthy();
  expect(story.imageAsset?.candidateSrcs.length).toBeGreaterThan(0);
}

describe("homepage story contract", () => {
  it("returns complete StoryCardData for active homepage slots", () => {
    const lead = adaptSignalToSituation(liveSignal({ id: "lead" }));
    const rail = adaptSignalToSituation(liveSignal({
      id: "rail",
      team: "Los Angeles Dodgers",
      matchup: "Los Angeles Dodgers @ Chicago Cubs",
      headline: "Dodgers availability report adds source support",
      line_movement: null,
      confidence: 76,
      score: 68,
    }));
    const games: LiveGameSituation[] = [{
      id: "game-1",
      league: "MLB",
      awayTeam: "Toronto Blue Jays",
      homeTeam: "Miami Marlins",
      gameTime: now,
      status: "Scheduled",
      awayScore: null,
      homeScore: null,
      activeSituations: 1,
      topEscalation: "Escalating",
    }];

    const model = buildHomepageStoryModel({
      activeLeague: "ALL",
      featured: lead,
      editorialSituation: rail,
      games,
      loading: false,
      pressure,
      situations: [lead, rail],
    });

    [
      model.lead,
      ...model.rail,
      ...model.games,
      ...model.leagues.flatMap((section) => section.stories),
    ].forEach(expectStoryContract);
  });

  it("returns a complete quiet story when no lead clears homepage weight", () => {
    const model = buildHomepageStoryModel({
      activeLeague: "NBA",
      featured: null,
      editorialSituation: null,
      games: [],
      loading: false,
      pressure,
      situations: [],
    });

    expectStoryContract(model.lead);
    expect(model.lead.label).toBe("Quiet board watch");
    expect(model.rail).toEqual([]);
    expect(model.games).toEqual([]);
    expect(model.leagues).toEqual([]);
  });
});
