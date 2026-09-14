import { describe, expect, it } from "vitest";

import { computeSituationConfidence, type SituationConfidenceInput } from "../situations-confidence";

/**
 * Regression coverage for the non-market escalation fix.
 *
 * Root cause (verified against 250 live prod situations): non-market situations
 * (injury/roster/lineup/operator_note) can never cross the escalating gate (65)
 * because market_alignment is a dead ~2/16 factor for them (their news doesn't
 * move betting lines) and independent_confirmations is near-dead (single
 * authoritative feed). computeSituationConfidence now reallocates the
 * inapplicable market_alignment cap (16) to official_confirmation for non-market
 * types: cap 20 -> 36 and value x2. Backtest: only consensus-confirmed
 * (official 18 -> 36) non-market situations clear 65; non-consensus (12) and
 * unconfirmed (0) do not. Market situations are untouched.
 *
 * These tests lock the profile split in. They do NOT move the 65 gate itself.
 */

// Realistic non-market factor profile drawn from the prod distribution:
// strong source, no independent second source, flat market_alignment, modest validator.
function nonMarketInput(officialConfirmation: number, situation_type: SituationConfidenceInput["situation_type"] = "injury"): SituationConfidenceInput {
  return {
    source_reliability: 19.4,
    independent_confirmations: 0,
    market_alignment: 2, // the dead flat value the adapter emits; should be zeroed for non-market
    validator_agreement: 5.65,
    official_confirmation: officialConfirmation,
    freshness: 10,
    contradiction_penalty: 0,
    computed_at: "2026-09-13T00:00:00.000Z",
    situation_type,
  };
}

describe("non-market confidence escalation profile", () => {
  it("lets a consensus-confirmed (official 18) non-market situation clear the 65 gate", () => {
    const result = computeSituationConfidence(nonMarketInput(18));
    // 19.4 + 0 + market(0) + 5.65 + official(min(36, 18*2)=36) + 10 = 71.05 -> 71
    expect(result.factors.market_alignment).toBe(0);
    expect(result.factors.official_confirmation).toBe(36);
    expect(result.score).toBeGreaterThanOrEqual(65);
  });

  it("keeps a non-consensus (official 12) non-market situation below 65", () => {
    const result = computeSituationConfidence(nonMarketInput(12));
    // official = min(36, 24) = 24 -> 19.4 + 5.65 + 24 + 10 = 59.05 -> 59
    expect(result.factors.official_confirmation).toBe(24);
    expect(result.score).toBeLessThan(65);
  });

  it("keeps an unconfirmed (official 0) non-market situation low — no false escalation", () => {
    const result = computeSituationConfidence(nonMarketInput(0));
    expect(result.factors.official_confirmation).toBe(0);
    expect(result.score).toBeLessThan(65);
  });

  it("does NOT apply the boost to the same factors under the market profile", () => {
    // Identical numbers, market type: market_alignment credited (cap 16), official capped at 20, no x2.
    const market = computeSituationConfidence(nonMarketInput(18, "market"));
    expect(market.factors.market_alignment).toBe(2);
    expect(market.factors.official_confirmation).toBe(18);
    expect(market.score).toBeLessThan(65); // 19.4 + 2 + 5.65 + 18 + 10 = 55.05 -> 55
  });

  it("treats an omitted situation_type as the market profile (backward compatible)", () => {
    const withType = computeSituationConfidence(nonMarketInput(18, "market"));
    const { situation_type: _omit, ...withoutType } = nonMarketInput(18, "market");
    const legacy = computeSituationConfidence(withoutType);
    expect(legacy.score).toBe(withType.score);
    expect(legacy.factors.official_confirmation).toBe(18);
    expect(legacy.factors.market_alignment).toBe(2);
  });

  it("leaves a genuine market situation's scoring unchanged", () => {
    const marketSituation: SituationConfidenceInput = {
      source_reliability: 15.81,
      independent_confirmations: 13.28,
      market_alignment: 8.33,
      validator_agreement: 7.65,
      official_confirmation: 0,
      freshness: 10,
      contradiction_penalty: 0,
      computed_at: "2026-09-13T00:00:00.000Z",
      situation_type: "market",
    };
    const result = computeSituationConfidence(marketSituation);
    // 15.81 + 13.28 + 8.33 + 7.65 + 0 + 10 = 55.07 -> 55
    expect(result.factors.market_alignment).toBeCloseTo(8.33, 5);
    expect(result.score).toBe(55);
  });
});
