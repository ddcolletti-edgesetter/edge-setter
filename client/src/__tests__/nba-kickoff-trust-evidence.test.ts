/**
 * The measurement NBA's place in KICKOFF_TRUSTED_LEAGUES rests on.
 *
 * The gate asks one question: is the stored `games.game_time` still when the
 * game starts? `game_time` is first-writer-wins — every upsert in
 * server/pipeline/store.ts lists it in the INSERT column list and none of them
 * in an ON CONFLICT clause — so whichever adapter creates the row fixes the
 * start time permanently, and a league is trusted only when we can show that
 * the value it fixed is right.
 *
 * For a league that has already played, the finished games answer it. The
 * distance from a row's stored `game_time` to the `updated_at` of its
 * final-score write is the game's length plus one pipeline cycle. If the
 * stored start times were stale, those distances would be a SPREAD; a tight
 * cluster at the length of a basketball game can only happen when the stored
 * tip-off is the real one.
 *
 * This file is NOT a re-measurement — it cannot reach prod. It replays the
 * captured rows so the claim in the comment above KICKOFF_TRUSTED_LEAGUES is
 * checkable rather than remembered, and so the arithmetic in that comment
 * cannot drift from the data it cites. To re-measure, re-fetch the endpoint in
 * the fixture's header and overwrite it.
 */

import { describe, expect, it } from "vitest";

import { kickoffIsTrustedForLeague } from "@/components/board/boardAdapters";
import fixture from "./fixtures/nba-final-game-times.json";

/** Hours from stored kickoff to the final-score write, per row. */
const durations = fixture.rows
  .map(([id, gameTime, updatedAt]) => ({
    id,
    hours: (new Date(updatedAt).getTime() - new Date(gameTime).getTime()) / 3_600_000,
  }))
  .sort((a, b) => a.hours - b.hours);

/** A basketball game plus one pipeline cycle. Deliberately generous on both
 *  sides: the point is that NOTHING lands outside it, not that the window is
 *  tight. A stale start time would miss it by hours, not minutes. */
const PLAUSIBLE_MIN_HOURS = 2.0;
const PLAUSIBLE_MAX_HOURS = 3.5;

const plausible = durations.filter(
  (d) => d.hours >= PLAUSIBLE_MIN_HOURS && d.hours <= PLAUSIBLE_MAX_HOURS,
);
const outliers = durations.filter(
  (d) => d.hours < PLAUSIBLE_MIN_HOURS || d.hours > PLAUSIBLE_MAX_HOURS,
);

describe("the NBA kickoff evidence", () => {
  it("covers every final NBA row prod had, not a sample", () => {
    expect(fixture.rows).toHaveLength(138);
    // No row may be missing a timestamp: a NaN duration would silently drop
    // out of both the plausible set and the outlier set and flatter the result.
    for (const d of durations) expect(Number.isFinite(d.hours), d.id).toBe(true);
  });

  it("puts 137 of the 138 at a real basketball-game distance", () => {
    expect(plausible).toHaveLength(137);
    expect(plausible[0].hours).toBeCloseTo(2.06, 2);
    expect(plausible[plausible.length - 1].hours).toBeCloseTo(3.16, 2);
  });

  it("clusters them, which a stale start time could not do", () => {
    // The distinguishing fact. A row whose stored kickoff is hours off the real
    // one still gets a final-score write, so it would still be SOMEWHERE in the
    // range — it just would not pile up at the length of a game.
    const tight = plausible.filter((d) => d.hours >= 2.25 && d.hours < 2.75);
    expect(tight.length).toBe(102);
    expect(plausible.filter((d) => d.hours >= 2.25 && d.hours < 3.0).length).toBe(131);
  });

  it("has exactly one outlier, and it is the pipeline's clock not the feed's", () => {
    expect(outliers).toHaveLength(1);
    const [only] = outliers;
    expect(only.id).toBe("NBA_2026_11_18_CHA_LAL");
    expect(only.hours).toBeCloseTo(8.08, 2);

    // The reason it is an artefact and not a late game: the pipeline wrote
    // NOTHING for seven hours around it. Its "final" write is when ingestion
    // came back, not when the game ended, so its distance measures the outage.
    const writes = fixture.rows
      .map(([, , updatedAt]) => new Date(updatedAt).getTime())
      .sort((a, b) => a - b);
    const outlierWrite = new Date(
      fixture.rows.find(([id]) => id === only.id)![2],
    ).getTime();
    const previousWrite = writes.filter((t) => t < outlierWrite).pop()!;
    const gapHours = (outlierWrite - previousWrite) / 3_600_000;
    expect(gapHours).toBeGreaterThan(7);
  });

  it("is what the flag actually says", () => {
    // The whole point of the file. If someone removes NBA from the set, this
    // red test is where the evidence for keeping it is.
    expect(kickoffIsTrustedForLeague("NBA")).toBe(true);
  });
});
