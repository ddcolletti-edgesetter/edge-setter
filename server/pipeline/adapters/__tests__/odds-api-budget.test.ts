/**
 * Odds API budget guard — skip-logic unit tests.
 *
 * Covers shouldSkipOddsFetch, the pure decision behind the persistent throttle +
 * quota guard added to protect The Odds API credit budget:
 *   a) throttle: last success within ODDS_MIN_INTERVAL_MIN minutes
 *   b) low credits: last_remaining < 3, same UTC month as the last attempt
 *   c) out of credits: last status 401, same UTC month as the last attempt
 * and the release of all three once the UTC month rolls over (credits reset on
 * the 1st at 00:00 UTC).
 */

import { describe, it, expect } from "vitest";
import { shouldSkipOddsFetch, type OddsFetchState } from "../the-odds-api";

const MIN_INTERVAL = 60;

// A quiet baseline: no prior state ever forces a call to be skipped.
const clean: OddsFetchState = {
  league: "NBA",
  last_success_at: null,
  last_attempt_at: null,
  last_remaining: null,
  last_status: null,
};

describe("shouldSkipOddsFetch", () => {
  it("does not skip with no prior state", () => {
    expect(shouldSkipOddsFetch(null, new Date("2026-09-27T12:00:00Z"), MIN_INTERVAL).skip).toBe(false);
    expect(shouldSkipOddsFetch(clean, new Date("2026-09-27T12:00:00Z"), MIN_INTERVAL).skip).toBe(false);
  });

  it("(a) skips within the throttle interval since last success", () => {
    const now = new Date("2026-09-27T12:00:00Z");
    const state: OddsFetchState = { ...clean, last_success_at: "2026-09-27T11:30:00Z" }; // 30m ago
    const d = shouldSkipOddsFetch(state, now, MIN_INTERVAL);
    expect(d.skip).toBe(true);
    expect(d.reason).toMatch(/throttled/);
  });

  it("(a) does NOT skip once the throttle interval has elapsed", () => {
    const now = new Date("2026-09-27T12:00:00Z");
    const state: OddsFetchState = { ...clean, last_success_at: "2026-09-27T10:30:00Z" }; // 90m ago
    expect(shouldSkipOddsFetch(state, now, MIN_INTERVAL).skip).toBe(false);
  });

  it("(b) skips when low credits remain in the same UTC month", () => {
    const now = new Date("2026-09-27T12:00:00Z");
    const state: OddsFetchState = { ...clean, last_remaining: 2, last_attempt_at: "2026-09-27T11:00:00Z" };
    const d = shouldSkipOddsFetch(state, now, MIN_INTERVAL);
    expect(d.skip).toBe(true);
    expect(d.reason).toMatch(/low credits/);
  });

  it("(c) skips after a 401 in the same UTC month", () => {
    const now = new Date("2026-09-27T12:00:00Z");
    const state: OddsFetchState = { ...clean, last_status: 401, last_attempt_at: "2026-09-27T11:00:00Z" };
    const d = shouldSkipOddsFetch(state, now, MIN_INTERVAL);
    expect(d.skip).toBe(true);
    expect(d.reason).toMatch(/out of credits/);
  });

  it("releases all three skips once the UTC month rolls over", () => {
    // now is October; every prior signal is from late September (previous month),
    // and the last success is days old so the throttle no longer applies.
    const now = new Date("2026-10-01T00:05:00Z");
    const rolled: OddsFetchState = {
      league: "NBA",
      last_success_at: "2026-09-27T11:30:00Z",
      last_attempt_at: "2026-09-27T11:30:00Z",
      last_remaining: 2,     // (b) would fire in-month
      last_status: 401,      // (c) would fire in-month
    };
    expect(shouldSkipOddsFetch(rolled, now, MIN_INTERVAL).skip).toBe(false);

    // And confirm each condition in isolation also releases across the boundary.
    expect(shouldSkipOddsFetch({ ...clean, last_success_at: "2026-09-27T11:30:00Z" }, now, MIN_INTERVAL).skip).toBe(false);
    expect(shouldSkipOddsFetch({ ...clean, last_remaining: 2, last_attempt_at: "2026-09-27T11:00:00Z" }, now, MIN_INTERVAL).skip).toBe(false);
    expect(shouldSkipOddsFetch({ ...clean, last_status: 401, last_attempt_at: "2026-09-27T11:00:00Z" }, now, MIN_INTERVAL).skip).toBe(false);
  });
});
