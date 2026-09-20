import { describe, expect, it } from "vitest";
import { matchWeightsForType, scoreCandidate } from "../situations-matching";
import type { NormalizedEvent, Situation, SituationType } from "../situations-contract";
import type { League } from "../types";

/**
 * Unit coverage for per-type match-weight reallocation.
 *
 * For injury / roster / operator_note (structurally 0% game_id AND 0% market
 * payload coverage — scope-weight-budget.debug.ts Part 2a/2b, full prod dataset),
 * game_overlap (0.18) and market_correlation (0.08) are dropped from the budget and
 * the surviving five factors are rescaled by 1/0.74 so the budget still sums to 1.0.
 * lineup / market / weather / scheme / game_state keep the base budget unchanged.
 *
 * These assert the weight MATH directly (matchWeightsForType) plus the observable
 * effect on a scored candidate, independent of the prod backtests.
 */

const BASE = {
  player_overlap: 0.22,
  team_overlap: 0.18,
  game_overlap: 0.18,
  injury_semantics: 0.18,
  timing_proximity: 0.1,
  market_correlation: 0.08,
  roster_context: 0.06,
} as const;

const KEPT_SUM = 0.74; // 0.22 + 0.18 + 0.18 + 0.10 + 0.06
const SCALE = 1 / KEPT_SUM;

const REALLOC_TYPES: SituationType[] = ["injury", "roster", "operator_note"];
const UNTOUCHED_TYPES: SituationType[] = ["lineup", "market", "weather", "scheme", "game_state"];

function sumWeights(w: Record<string, number>): number {
  return Object.values(w).reduce((s, n) => s + n, 0);
}

describe("matchWeightsForType: reallocated types", () => {
  for (const type of REALLOC_TYPES) {
    describe(`situation_type="${type}"`, () => {
      const w = matchWeightsForType(type);

      it("zeroes the two structurally-inapplicable factors", () => {
        expect(w.game_overlap).toBe(0);
        expect(w.market_correlation).toBe(0);
      });

      it("rescales the five surviving factors by 1/0.74", () => {
        expect(w.player_overlap).toBeCloseTo(BASE.player_overlap * SCALE, 10);
        expect(w.team_overlap).toBeCloseTo(BASE.team_overlap * SCALE, 10);
        expect(w.injury_semantics).toBeCloseTo(BASE.injury_semantics * SCALE, 10);
        expect(w.timing_proximity).toBeCloseTo(BASE.timing_proximity * SCALE, 10);
        expect(w.roster_context).toBeCloseTo(BASE.roster_context * SCALE, 10);
      });

      it("preserves a total weight budget of 1.0", () => {
        expect(sumWeights(w)).toBeCloseTo(1, 10);
      });

      it("keeps the relative ordering of the surviving factors", () => {
        // player_overlap remains the single heaviest factor; roster_context lightest.
        expect(w.player_overlap).toBeGreaterThan(w.team_overlap);
        expect(w.team_overlap).toBe(w.injury_semantics);
        expect(w.injury_semantics).toBeGreaterThan(w.timing_proximity);
        expect(w.timing_proximity).toBeGreaterThan(w.roster_context);
      });
    });
  }
});

describe("matchWeightsForType: untouched types keep the base budget", () => {
  for (const type of UNTOUCHED_TYPES) {
    it(`situation_type="${type}" is byte-identical to the base weights`, () => {
      const w = matchWeightsForType(type);
      expect(w).toEqual(BASE);
      // game_overlap and market_correlation are still real for these.
      expect(w.game_overlap).toBe(0.18);
      expect(w.market_correlation).toBe(0.08);
      expect(sumWeights(w)).toBeCloseTo(1, 10);
    });
  }
});

// ─── Observable effect on scoreCandidate ────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-09-01T12:00:00.000Z");
const iso = (msAgo: number) => new Date(T0 - msAgo).toISOString();

function makeEvent(type: SituationType, overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    normalized_event_id: "nev_test",
    raw_event_id: null,
    source_id: "rss_test_official",
    source_type: "rss",
    sport: "football",
    league: "NFL" as League,
    game_id: null,
    teams: ["DEN"],
    players: ["Pat Surtain"],
    event_type: "injury_update" as NormalizedEvent["event_type"],
    situation_type: type,
    semantic_fingerprint: "surtain den questionable knee",
    occurred_at: iso(0),
    received_at: iso(0),
    summary: "update",
    payload: {},
    ...overrides,
  };
}

function makeSituation(type: SituationType, overrides: Partial<Situation & { latest_snapshot_at?: string | null }> = {}) {
  return {
    situation_id: "sit_test",
    canonical_hash: "hash_test",
    sport: "football" as const,
    league: "NFL" as League,
    game_id: null,
    teams: ["DEN"],
    players: ["Patrick Surtain II"],
    situation_type: type,
    semantic_fingerprint: "surtain den questionable knee",
    created_from_event_id: null,
    created_at: iso(2 * 3600_000), // 2h old
    ...overrides,
  };
}

describe("scoreCandidate: reallocation reflected in the breakdown", () => {
  it("reports zero weight on game_overlap/market_correlation for injury and lifts the composite vs the base budget", () => {
    const scored = scoreCandidate(makeEvent("injury"), makeSituation("injury"));
    const by = new Map(scored.reasoning_breakdown.map((f) => [f.factor, f]));
    expect(by.get("game_overlap")!.weight).toBe(0);
    expect(by.get("market_correlation")!.weight).toBe(0);
    // player_overlap=1, team=1, injury_semantics=1, timing(2h)=0.82, no market/roster.
    // Base budget: 0.22+0.18+0.18+0.082 = 0.662. Reallocated: (0.22+0.18+0.18)/0.74 + 0.82*0.10/0.74.
    const baseComposite = 0.22 + 0.18 + 0.18 + 0.82 * 0.1;
    expect(scored.match_confidence).toBeGreaterThan(baseComposite);
    expect(scored.match_confidence).toBeCloseTo((0.22 + 0.18 + 0.18 + 0.82 * 0.1) / 0.74, 2);
  });

  it("leaves a market candidate on the base budget (game_overlap/market_correlation keep real weight)", () => {
    const scored = scoreCandidate(makeEvent("market"), makeSituation("market"));
    const by = new Map(scored.reasoning_breakdown.map((f) => [f.factor, f]));
    expect(by.get("game_overlap")!.weight).toBe(0.18);
    expect(by.get("market_correlation")!.weight).toBe(0.08);
  });

  it("applies reallocation by the candidate's type, consistently for all three reallocated types", () => {
    for (const type of REALLOC_TYPES) {
      const scored = scoreCandidate(makeEvent(type), makeSituation(type));
      const by = new Map(scored.reasoning_breakdown.map((f) => [f.factor, f]));
      expect(by.get("game_overlap")!.contribution).toBe(0);
      expect(by.get("market_correlation")!.contribution).toBe(0);
    }
  });
});
