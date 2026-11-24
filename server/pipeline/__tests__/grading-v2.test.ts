import { describe, expect, it } from "vitest";
import {
  claimedSide,
  claimWon,
  describedMarket,
  gradeSignalV2,
  ODDS_KICKOFF_GUARD_LIVE_AT,
  signedClv,
  type GradingInput,
  type GradingSignal,
  type GradingSnapshot,
} from "../grading-v2";
import { NO_GRADE_REASONS } from "@shared/settlement-grading";

/**
 * Settlement grading v2, pure. Decisions of 2026-11-24:
 *  - grade only a side the card copy claimed (stored graded_side); today that
 *    is only the high-wind weather card's Under;
 *  - lines bounded by kickoff in every league;
 *  - CLV = (line_at_signal − pregame_line) × s, s by the CLAIMED SIDE
 *    (home +1, away −1, under +1, over −1), never by move direction;
 *  - push and every other ungraded case: no_grade with a named reason, hit NULL.
 */

const KICKOFF = "2026-12-06T18:00:00.000Z";
const BEFORE = "2026-12-06T12:00:00.000Z";   // signal time
const EARLY = "2026-12-05T12:00:00.000Z";
const LATE_PRE = "2026-12-06T17:30:00.000Z";  // last pregame snapshot
const IN_PLAY = "2026-12-06T19:30:00.000Z";   // after kickoff

function snap(at: string, spread: number | null, total: number | null, sourceGameId = "src-1"): GradingSnapshot {
  return { snapshot_at: at, spread_line: spread, total_line: total, source_game_id: sourceGameId };
}

function input(signal: Partial<GradingSignal>, over: Partial<GradingInput> = {}): GradingInput {
  return {
    signal: { signal_type: "weather_update", created_at: BEFORE, ...signal },
    game: { league: "NFL", game_time: KICKOFF, home_score: 20, away_score: 17, ...(over.game ?? {}) },
    snapshots: over.snapshots ?? [snap(EARLY, -2.5, 48), snap(BEFORE, -3, 47.5), snap(LATE_PRE, -4.5, 46)],
    rawEventMarkets: over.rawEventMarkets,
    kickoffGuardCoversLeague: over.kickoffGuardCoversLeague ?? true,
  };
}

const HIGH_WIND = "Favour unders — wind above 15 MPH consistently suppresses scoring.";
const CALM = "Weather is a minor factor today; no large adjustment needed.";

describe("CLV is signed by the claimed side, not by the move direction", () => {
  // Example 1: claim home −3, pregame close home −4.5.
  it("home −3 → close −4.5 is +1.5 for home, −1.5 for away", () => {
    expect(signedClv("home", -3, -4.5)).toBe(1.5);
    expect(signedClv("away", -3, -4.5)).toBe(-1.5);
  });

  // Example 2: claim Over 47.5, line moves down to close at 46.
  it("Over 47.5 → close 46 is −1.5 for the Over, +1.5 for the Under", () => {
    expect(signedClv("over", 47.5, 46)).toBe(-1.5);
    expect(signedClv("under", 47.5, 46)).toBe(1.5);
  });

  // Both examples, each with the founding move in BOTH directions. The stored
  // side decides the sign; line_movement.direction must not move it.
  for (const direction of ["up", "down"] as const) {
    const lm = direction === "up"
      ? { open: -4, current: -3, delta: 1, direction }
      : { open: -2, current: -3, delta: 1, direction };

    it(`home −3 → −4.5 grades CLV +1.5 when the founding move was ${direction}`, () => {
      const r = gradeSignalV2(input(
        { signal_type: "line_move", graded_side: "home", market: "spread", line_movement: lm } as any,
      ));
      expect(r.side).toBe("home");
      expect(r.lineAtSignal).toBe(-3);
      expect(r.closingLine).toBe(-4.5);
      expect(r.clv).toBe(1.5);
    });

    it(`Over 47.5 → 46 grades CLV −1.5 when the founding move was ${direction}`, () => {
      const totalLm = direction === "up"
        ? { open: 47, current: 47.5, delta: 0.5, direction }
        : { open: 48, current: 47.5, delta: 0.5, direction };
      const r = gradeSignalV2(input(
        { signal_type: "line_move", graded_side: "over", market: "total", line_movement: totalLm } as any,
      ));
      expect(r.side).toBe("over");
      expect(r.lineAtSignal).toBe(47.5);
      expect(r.closingLine).toBe(46);
      expect(r.clv).toBe(-1.5);
    });
  }

  it("never writes −0", () => {
    expect(Object.is(signedClv("over", 46, 46), 0)).toBe(true);
    expect(Object.is(signedClv("away", -3, -3), 0)).toBe(true);
  });
});

describe("hit is the result against the line the claim was made at", () => {
  it("spread lines are from the home side: home covers when margin + line > 0", () => {
    expect(claimWon("home", -3, 20, 16)).toBe(true);   // won by 4, laid 3
    expect(claimWon("home", -3, 20, 18)).toBe(false);  // won by 2
    expect(claimWon("away", -3, 20, 18)).toBe(true);
    expect(claimWon("home", -3, 20, 17)).toBeNull();   // push
  });

  it("totals", () => {
    expect(claimWon("under", 47.5, 20, 17)).toBe(true);
    expect(claimWon("over", 47.5, 30, 20)).toBe(true);
    expect(claimWon("under", 47, 30, 17)).toBeNull();
  });
});

describe("only a claimed side is graded", () => {
  it("a high-wind weather card claims the Under, from the stored column", () => {
    expect(claimedSide({ signal_type: "weather_update", created_at: BEFORE, graded_side: "under" })).toBe("under");
  });

  it("a high-wind weather row older than the column claims the Under from its stored copy", () => {
    expect(claimedSide({ signal_type: "weather_update", created_at: BEFORE, action_note: HIGH_WIND })).toBe("under");
  });

  it("a calm weather card claims nothing", () => {
    expect(claimedSide({ signal_type: "weather_update", created_at: BEFORE, action_note: CALM })).toBeNull();
    const r = gradeSignalV2(input({ action_note: CALM }));
    expect(r).toMatchObject({ state: "no_grade", reason: "no_side_claimed", hit: null, clv: null, market: "total" });
  });

  it("the copy prefix only counts for weather, and only when no side is stored", () => {
    expect(claimedSide({ signal_type: "injury_update", created_at: BEFORE, action_note: HIGH_WIND })).toBeNull();
    expect(claimedSide({ signal_type: "weather_update", created_at: BEFORE, action_note: HIGH_WIND, graded_side: "bogus" })).toBeNull();
  });

  for (const type of ["line_move", "injury_update", "lineup_change", "lineup_confirm", "transaction", "manual"]) {
    it(`${type} settles as no_side_claimed`, () => {
      const r = gradeSignalV2(input({ signal_type: type, action_note: "Adjust roster exposure immediately." }));
      expect(r.state).toBe("no_grade");
      expect(r.reason).toBe("no_side_claimed");
      expect(r.hit).toBeNull();
      expect(r.clv).toBeNull();
    });
  }
});

describe("line moves are descriptive: right market, kickoff-bounded, never graded", () => {
  it("records the stored market's lines, bounded by kickoff", () => {
    const r = gradeSignalV2(input(
      { signal_type: "line_move", market: "total" },
      { snapshots: [snap(BEFORE, -3, 47.5), snap(LATE_PRE, -4.5, 46), snap(IN_PLAY, -10, 38)] },
    ));
    expect(r).toMatchObject({ state: "no_grade", reason: "no_side_claimed", market: "total", lineAtSignal: 47.5, closingLine: 46 });
  });

  it("recovers a pre-column row's market from its raw events", () => {
    expect(describedMarket({ signal_type: "line_move", created_at: BEFORE }, [null, "total", "total"])).toBe("total");
  });

  it("does not guess when the raw events disagree or say nothing", () => {
    expect(describedMarket({ signal_type: "line_move", created_at: BEFORE }, ["spread", "total"])).toBe("mixed");
    expect(describedMarket({ signal_type: "line_move", created_at: BEFORE }, [null])).toBe("unknown");
    const r = gradeSignalV2(input({ signal_type: "line_move" }, { rawEventMarkets: ["spread", "total"] }));
    expect(r).toMatchObject({ market: "mixed", lineAtSignal: null, closingLine: null });
  });

  it("non-market signals record no market", () => {
    expect(gradeSignalV2(input({ signal_type: "injury_update" })).market).toBe("none");
  });
});

describe("the high-wind Under is graded against kickoff-bounded lines", () => {
  it("grades a win, with CLV against the last pregame line", () => {
    // 20 + 17 = 37 under 47.5. Signal line 47.5, pregame 46: Under CLV +1.5.
    const r = gradeSignalV2(input({ graded_side: "under" }));
    expect(r).toEqual({
      state: "graded", reason: null, side: "under", market: "total",
      lineAtSignal: 47.5, closingLine: 46, actualResult: 37, hit: true, clv: 1.5,
    });
  });

  it("grades a loss", () => {
    const r = gradeSignalV2(input({ graded_side: "under" }, { game: { home_score: 31, away_score: 24 } as any }));
    expect(r).toMatchObject({ state: "graded", hit: false, actualResult: 55 });
  });

  it("a push is no_grade / push, not a loss", () => {
    const r = gradeSignalV2(input({ graded_side: "under" }, {
      game: { home_score: 24, away_score: 23.5 } as any,
    }));
    expect(r).toMatchObject({ state: "no_grade", reason: "push", hit: null });
  });

  it("never reads an in-play snapshot as the pregame line, in an unguarded league too", () => {
    const r = gradeSignalV2(input({ graded_side: "under" }, {
      game: { league: "MLB" } as any,
      kickoffGuardCoversLeague: false,
      snapshots: [snap(BEFORE, -1.5, 8.5), snap(LATE_PRE, -1.5, 9), snap(IN_PLAY, -1.5, 12.5)],
    }));
    expect(r.closingLine).toBe(9);
  });

  it("signal created after kickoff: signal_after_kickoff", () => {
    const r = gradeSignalV2(input({ graded_side: "under", created_at: IN_PLAY }, { kickoffGuardCoversLeague: false }));
    expect(r).toMatchObject({ state: "no_grade", reason: "signal_after_kickoff", hit: null });
  });

  it("no total recorded at or before the signal: no_signal_line", () => {
    const r = gradeSignalV2(input({ graded_side: "under" }, { snapshots: [snap(EARLY, -3, null), snap(LATE_PRE, -4.5, 46)] }));
    expect(r).toMatchObject({ state: "no_grade", reason: "no_signal_line" });
  });

  it("no total recorded before kickoff after the signal's: falls back to the signal's line as the pregame close", () => {
    // The newest pregame snapshot with a total IS the signal-time one.
    const r = gradeSignalV2(input({ graded_side: "under" }, { snapshots: [snap(BEFORE, -3, 47.5), snap(LATE_PRE, -4.5, null)] }));
    expect(r).toMatchObject({ state: "graded", lineAtSignal: 47.5, closingLine: 47.5, clv: 0 });
  });

  it("no snapshot at all: no_signal_line", () => {
    const r = gradeSignalV2(input({ graded_side: "under" }, { snapshots: [] }));
    expect(r.reason).toBe("no_signal_line");
  });

  it("odds from two real games on one row: ambiguous_game", () => {
    const r = gradeSignalV2(input({ graded_side: "under" }, {
      snapshots: [snap(BEFORE, -1.5, 8.5, "game-1"), snap(LATE_PRE, -1.5, 9, "game-2")],
    }));
    expect(r).toMatchObject({ state: "no_grade", reason: "ambiguous_game" });
  });
});

describe("kickoff_time_unreliable", () => {
  const POST_GUARD_KICKOFF = "2026-12-06T18:00:00.000Z";
  const postponed = [snap(BEFORE, -3, 47.5), snap(LATE_PRE, -3, 47), snap("2026-12-06T21:00:00.000Z", -3, 46.5)];

  it("fires when the guard covers the league and the feed kept writing pregame odds after the stored kickoff", () => {
    expect(POST_GUARD_KICKOFF > ODDS_KICKOFF_GUARD_LIVE_AT).toBe(true);
    const r = gradeSignalV2(input({ graded_side: "under" }, { snapshots: postponed, kickoffGuardCoversLeague: true }));
    expect(r).toMatchObject({ state: "no_grade", reason: "kickoff_time_unreliable", hit: null });
  });

  it("does not fire for a league the guard does not cover (the documented limitation)", () => {
    const r = gradeSignalV2(input({ graded_side: "under" }, { snapshots: postponed, kickoffGuardCoversLeague: false }));
    expect(r.state).toBe("graded");
  });

  it("does not fire on post-kickoff odds written before the guard went live", () => {
    const old = "2026-10-04T18:00:00.000Z";
    const r = gradeSignalV2(input(
      { graded_side: "under", created_at: "2026-10-04T12:00:00.000Z" },
      {
        game: { game_time: old } as any,
        snapshots: [snap("2026-10-04T12:00:00.000Z", -3, 47.5), snap("2026-10-04T20:00:00.000Z", -3, 40)],
      },
    ));
    expect(r.reason).not.toBe("kickoff_time_unreliable");
  });

  it("is a documented reason, and its documentation states the limitation", () => {
    expect(NO_GRADE_REASONS.kickoff_time_unreliable).toMatch(/KNOWN LIMITATION/);
  });
});

describe("invariants", () => {
  it("every no_grade result has hit null and a documented reason", () => {
    const cases: GradingInput[] = [
      input({ action_note: CALM }),
      input({ signal_type: "line_move", market: "spread" }),
      input({ graded_side: "under" }, { snapshots: [] }),
      input({ graded_side: "under", created_at: IN_PLAY }, { kickoffGuardCoversLeague: false }),
      input({ graded_side: "under" }, { game: { home_score: 24, away_score: 23.5 } as any }),
      input({ graded_side: "under" }, { snapshots: [snap(BEFORE, 1, 8, "a"), snap(LATE_PRE, 1, 8, "b")] }),
    ];
    for (const c of cases) {
      const r = gradeSignalV2(c);
      expect(r.state).toBe("no_grade");
      expect(r.hit).toBeNull();
      expect(Object.keys(NO_GRADE_REASONS)).toContain(r.reason);
    }
  });
});
