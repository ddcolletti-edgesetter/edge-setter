import { render, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { buildLeadCardSlots, ruleOneHeadline } from "@/lib/leadCardSlots";
import { adaptSignalToSituation, type GamesTableRow } from "@/lib/intelligenceSituationsApi";
import type { LiveSignal } from "@/lib/signalsApi";
import { StoryCard, type StoryCardData } from "@/components/StoryCard";

/**
 * The lead card's slots, per the build spec (Slots + Facts): Kicker (league,
 * ONE state chip, age), Matchup, Headline, Facts (Status, Line or Total,
 * Reports — fixed order, dropped never padded), Button. And the rail cards
 * carry none of the cut elements.
 */

const NOW = Date.now();
const iso = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

function signal(over: Partial<LiveSignal> = {}): LiveSignal {
  return {
    id: "s1", league: "NFL", game_id: null, signal_type: "injury_update",
    headline: "Colton McKivitz (Lower Leg) — OUT", body: "", action_note: "", why_it_matters: "",
    team: "SF", player: "Colton McKivitz", matchup: null,
    sources: [{ name: "ESPN injury report", type: "official" }], source_count: 1,
    verdict: "confirmed", confidence: 84, confirmation_strength: "Consensus", line_movement: null,
    injury_designation: "OUT", lineup_status: null, weather_note: null,
    betting_relevance: true, fantasy_relevance: true, score: 80, score_band: "Strong",
    urgency_label: "WATCH", urgency_reason: "", trust_label: "", score_explanation: "",
    breakdown: { confidenceScore: 84, sourceQualityScore: 0, marketImpactScore: 0, recencyBonus: 0, relevanceScore: 0, contextScore: 0 },
    raw_event_ids: [], signal_time: iso(-2), created_at: iso(-2), updated_at: iso(-2), outcome_id: null,
    ...over,
  } as LiveSignal;
}

const sfGame: GamesTableRow & Record<string, unknown> = {
  id: "NFL_SEA_SF", league: "NFL", away_team: "SEA", home_team: "SF",
  away_team_name: "Seattle Seahawks", home_team_name: "San Francisco 49ers",
  game_time: iso(100), status: "scheduled", spread_line: -3, spread_team: "SF", total_line: 46.5,
  home_score: null, away_score: null,
};

const slots = (s: LiveSignal, table: GamesTableRow[] = [sfGame]) =>
  buildLeadCardSlots(adaptSignalToSituation(s), s.headline, table, NOW);

afterEach(cleanup);

describe("Kicker", () => {
  it("fresh: league, one tier chip, and the age", () => {
    const k = slots(signal()).kicker;
    expect(k.league).toBe("NFL");
    expect(["Breaking", "Urgent", "Elevated", "Watch", "Quiet"]).toContain(k.chip);
    expect(k.stale).toBe(false);
    expect(k.age).toBe("2h ago");
  });

  it("6 hours or more: the chip becomes 'N hours old' and replaces the age", () => {
    const k = slots(signal({ signal_time: iso(-13), created_at: iso(-13) })).kicker;
    expect(k).toMatchObject({ chip: "13 hours old", stale: true, age: null });
    expect(slots(signal({ signal_time: iso(-6), created_at: iso(-6) })).kicker.stale).toBe(true);
  });
});

describe("Matchup", () => {
  it("both teams by stored name from the story's game, then the kickoff time", () => {
    const m = slots(signal()).matchup!;
    expect(m.teams).toEqual([{ abbr: "SEA", name: "Seattle Seahawks" }, { abbr: "SF", name: "San Francisco 49ers" }]);
    expect(m.time).toBeTruthy();
  });

  it("CFB one-team story is not placed on a game: one team, no time", () => {
    const cfbGame = { ...sfGame, id: "cfb", league: "CFB", away_team: "MIA", home_team: "FSU", away_team_name: null, home_team_name: null };
    const m = slots(signal({ league: "CFB", team: "MIA" }), [cfbGame])!.matchup!;
    expect(m.teams).toEqual([{ abbr: "MIA", name: "MIA" }]);
    expect(m.time).toBeNull();
  });
});

describe("Headline rule 1, unofficial stories (no official source on the row)", () => {
  it("bans certainty words and prefixes 'Report:' on every report headline", () => {
    const s = slots(signal({ headline: "Colton McKivitz — OUT" }));
    expect(s.headline).toBe("Report: Colton McKivitz's availability is in question");
    expect(s.headline).not.toMatch(/(confirmed|out|will miss|ruled out)/i);
  });

  it("team story with a certainty word and no player", () => {
    const h = ruleOneHeadline(adaptSignalToSituation(signal({ player: null })), "49ers starter ruled out");
    expect(h).toBe("Report: SF availability is in question");
  });

  it("team story without certainty words keeps its words behind the prefix", () => {
    const h = ruleOneHeadline(adaptSignalToSituation(signal({ player: null })), "49ers practice report");
    expect(h).toBe("Report: 49ers practice report");
  });

  it("a line we observed ourselves takes no prefix", () => {
    const h = ruleOneHeadline(adaptSignalToSituation(signal({ signal_type: "line_move", player: null })), "SF: -3 → -4.5");
    expect(h).toBe("SF: -3 → -4.5");
  });

  it("possessive of a name ending in s", () => {
    expect(slots(signal({ player: "Marcus Williams" })).headline).toBe("Report: Marcus Williams' availability is in question");
  });
});

describe("Facts", () => {
  it("unofficial report (every story today): Line, Reports — no Status", () => {
    expect(slots(signal()).facts).toEqual([
      { label: "Line", value: "SF −3" },
      { label: "Reports", value: "1 report", sub: "ESPN injury report" },
    ]);
  });

  it("drops a fact with no data instead of padding it", () => {
    const f = slots(signal(), []).facts;
    expect(f.map((x) => x.label)).toEqual(["Reports"]);
  });

  it("a line move drops Line (its headline prints the numbers) and counts Books", () => {
    const f = slots(signal({
      signal_type: "line_move", player: null, injury_designation: null, game_id: "NFL_SEA_SF",
      headline: "SF: -3 → -4.5 — market movement", sources: [{ name: "DraftKings", type: "sportsbook" }],
      line_movement: { open: -3, current: -4.5, delta: 1.5, direction: "down" },
    })).facts;
    expect(f).toEqual([{ label: "Books", value: "1 book", sub: "DraftKings" }]);
  });
});

describe("rail cards", () => {
  it("carry no agent count, calibration badge, pattern match, replay line or impact context", () => {
    const situation = adaptSignalToSituation(signal());
    const story: StoryCardData = {
      id: "r1", league: "NFL", headline: "Colton McKivitz — OUT", storyType: "Availability watch",
      overlay: {
        escalationState: situation.escalationState, verification: situation.verification,
        confidence: situation.confidence, sourceSummary: situation.sourceSummary, timing: situation.timing,
        replay: ["Sources checked", "Timing tracked"],
      },
      fantasyRelevance: true, bettingRelevance: true, situation, player: "Colton McKivitz",
      whatChanged: "Colton McKivitz won't play.", whyItMatters: "A load-bearing injury.", watchNext: "Watch for beat reports.",
    };
    const { container } = render(<StoryCard story={story} variant="rail" copyVariant="public" />);
    const text = container.textContent ?? "";
    for (const gone of ["ES Agent", "View evidence", "EdgeSetter evidence", "EdgeSetter review", "Historical pattern match", "More impact context", "pattern match", "⚡"]) {
      expect(text).not.toContain(gone);
    }
    expect(container.querySelector(".edge-overlay-replay")).toBeNull();
    expect(container.querySelector(".agent-calibration-badge")).toBeNull();
    expect(container.querySelector(".story-impact-details")).toBeNull();
    expect(container.querySelector(".edge-overlay-top")).toBeNull();
    expect(container.querySelector(".story-card-conf")).toBeNull();
    // Same cuts as the lead card: no image header, no templated reads.
    expect(container.querySelector(".story-card-visual")).toBeNull();
    expect(container.querySelector(".sports-story-visual")).toBeNull();
    expect(container.querySelector(".story-card-reads")).toBeNull();
    for (const gone of ["What happened", "Why it matters", "Watch next", "Player focus"]) {
      expect(text).not.toContain(gone);
    }
  });
});

describe("Headline rule 1, official-source flag from injury_designation_source", () => {
  const ESPN_NFL = "api:espn:NFL:payload.designation";

  it("an ESPN-sourced story drops the 'Report:' prefix and prints its headline as stored", () => {
    const s = slots(signal({ headline: "Colton McKivitz (Lower Leg) — OUT", injury_designation_source: ESPN_NFL } as any));
    expect(s.headline).toBe("Colton McKivitz (Lower Leg) — OUT");
    expect(s.headline).not.toMatch(/^Report:/);
  });

  it("an official story shows its Status fact", () => {
    const s = slots(signal({ injury_designation_source: ESPN_NFL } as any));
    expect(s.facts.find((f) => f.label === "Status")).toMatchObject({ value: "OUT" });
  });

  it("the same story with no source keeps 'Report:' and no Status", () => {
    const s = slots(signal({ headline: "Colton McKivitz (Lower Leg) — OUT", injury_designation_source: null } as any));
    expect(s.headline).toBe("Report: Colton McKivitz's availability is in question");
    expect(s.facts.map((f) => f.label)).not.toContain("Status");
  });

  for (const source of [
    "api:espn:CFB:payload.designation",      // ESPN CFB is not on the allowlist
    "rss:espn:NFL:payload.designation",      // not source_type api
    "api:rotowire:NFL:payload.designation",  // not an official feed
    "manual:espn:NFL:payload.designation",   // a manual /ingest naming espn
  ]) {
    it(`a non-official source (${source}) keeps 'Report:'`, () => {
      const s = slots(signal({ headline: "Colton McKivitz — OUT", injury_designation_source: source } as any));
      expect(s.headline).toMatch(/^Report:/);
      expect(s.headline).not.toMatch(/out/i);
    });
  }
});
