import { describe, expect, it } from "vitest";

import { scoreSignal, getScoreBand, type ScoreInputs } from "../scorer";
import { crossesKeyNumber } from "../adapters/the-odds-api";

// Regression coverage for the "score >= 82 (Elite) unreachable" fix.
//
// Two structural gaps kept the distribution filter (server/distribution-draft.ts,
// score >= 82) permanently out of reach:
//   1. `league_api` was missing from SOURCE_TYPE_WEIGHT, so official league feeds
//      (MLB StatsAPI, ESPN NBA, BallDontLie) fell through to the 1.0 default and
//      lost sourceQualityScore.
//   2. `crossed_key_number` was never populated by any adapter, so the +3 market
//      bonus for a line crossing a betting key number was permanently discarded.
//
// These tests lock in both fixes. They do NOT lower the 82 threshold.

const NOW = new Date().toISOString();

function strongTransaction(overrides: Partial<ScoreInputs> = {}): ScoreInputs {
  // A realistic high-conviction MLB roster/injury move: star ruled OUT, confirmed,
  // consensus across an official league feed + named insider, fresh, betting+fantasy.
  return {
    sport: "MLB" as ScoreInputs["sport"],
    signalType: "transaction",
    verdict: "confirmed",
    confidence: 92,
    sourceTypes: ["league_api", "transaction"],
    sourceLabels: ["MLB StatsAPI", "MLB.com"],
    sourceCount: 3,
    confirmationStrength: "Consensus",
    isoTimestamp: NOW,
    isHighImpactType: true,
    injuryDesignation: "OUT",
    bettingRelevance: true,
    fantasyRelevance: true,
    hasPitcherMatchup: true,
    hasLineupStatus: true,
    ...overrides,
  };
}

function lineMove(overrides: Partial<ScoreInputs> = {}): ScoreInputs {
  return {
    sport: "MLB" as ScoreInputs["sport"],
    signalType: "line_move",
    verdict: "review",
    confidence: 92,
    sourceTypes: ["sportsbook"],
    sourceLabels: ["Pinnacle"],
    sourceCount: 1,
    confirmationStrength: "Developing",
    isoTimestamp: NOW,
    lineMovementDelta: 3,
    bettingRelevance: true,
    ...overrides,
  };
}

describe("Elite score reachability — league_api source weight", () => {
  it("scores a strong league_api transaction as Elite (>= 82)", () => {
    const result = scoreSignal(strongTransaction());
    expect(result.totalScore).toBeGreaterThanOrEqual(82);
    expect(result.band).toBe("Elite");
  });

  it("the league_api weight is the specific unlock: the same signal on the default weight stays below Elite", () => {
    const withFix = scoreSignal(strongTransaction()).totalScore;
    // Simulate the pre-fix behaviour: an unrecognised source type falls to the
    // 1.0 default, exactly as `league_api` used to.
    const onDefault = scoreSignal(strongTransaction({ sourceTypes: ["unknown_type", "transaction"] })).totalScore;

    expect(withFix).toBeGreaterThanOrEqual(82);
    expect(onDefault).toBeLessThan(82);
    expect(withFix).toBeGreaterThan(onDefault);
  });

  it("treats league_api as official-tier: same sourceQualityScore as `official`, higher than an unknown type", () => {
    const leagueApi = scoreSignal(strongTransaction({ sourceTypes: ["league_api"] })).breakdown.sourceQualityScore;
    const official = scoreSignal(strongTransaction({ sourceTypes: ["official"] })).breakdown.sourceQualityScore;
    const unknown = scoreSignal(strongTransaction({ sourceTypes: ["unknown_type"] })).breakdown.sourceQualityScore;

    expect(leagueApi).toBe(official);      // both weighted 3.0
    expect(leagueApi).toBeGreaterThan(unknown);
  });
});

describe("Elite score reachability — crossed_key_number market bonus", () => {
  it("crossing a key number raises marketImpactScore and total vs an otherwise identical move", () => {
    const crossed = scoreSignal(lineMove({ crossedKeyNumber: true }));
    const notCrossed = scoreSignal(lineMove({ crossedKeyNumber: false }));

    expect(crossed.breakdown.marketImpactScore).toBeGreaterThan(notCrossed.breakdown.marketImpactScore);
    expect(crossed.totalScore).toBeGreaterThan(notCrossed.totalScore);
  });
});

describe("the-odds-api crossesKeyNumber", () => {
  it("detects a line moving across a key number (either direction, sign-agnostic)", () => {
    expect(crossesKeyNumber(2.5, 3.5)).toBe(true);   // crosses 3
    expect(crossesKeyNumber(2.5, 3)).toBe(true);     // lands on 3
    expect(crossesKeyNumber(7.5, 6.5)).toBe(true);   // crosses 7 downward
    expect(crossesKeyNumber(-2.5, -3.5)).toBe(true); // sign-agnostic (uses abs)
  });

  it("returns false when the move stays on one side of every key number", () => {
    expect(crossesKeyNumber(1, 2.5)).toBe(false);
    expect(crossesKeyNumber(3.5, 3.5)).toBe(false);
    expect(crossesKeyNumber(7.5, 8)).toBe(false);
  });
});

describe("threshold guard", () => {
  it("getScoreBand keeps the 82 Elite cutoff (the fix does not move the threshold)", () => {
    expect(getScoreBand(82)).toBe("Elite");
    expect(getScoreBand(81.9)).toBe("Strong");
  });
});
