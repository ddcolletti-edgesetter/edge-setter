import { describe, expect, it } from "vitest";
import { rawEventToNormalizedEvent } from "../situations-adapter";
import type { RawEvent, LiveSignal } from "../types";

/**
 * Regression: the roster-gazetteer's player_candidate (written for RSS headlines
 * the regex `player` extractor misses) must feed the matcher's players array as a
 * PURE FALLBACK — filling in only when the regex/payload path yields no player,
 * and never overriding a successful regex extraction. See situations-adapter.ts.
 */

function rawEvent(overrides: Partial<RawEvent>): RawEvent {
  return {
    id: "raw_1",
    source_id: "rss_ravens_official",
    source_type: "rss",
    league: "NFL",
    game_id: null,
    team: "BAL",
    player: null,
    event_type: "injury_update",
    payload: { headline: "Injury report" },
    processed: false,
    processed_at: null,
    created_at: "2026-09-15T12:00:00.000Z",
    received_at: "2026-09-15T12:00:00.000Z",
    ...overrides,
  };
}

const signal = { id: "sig_1", headline: "Injury report", body: "" } as unknown as LiveSignal;

describe("situations-adapter player_candidate fallback", () => {
  it("uses player_candidate when the regex player is empty", () => {
    const raw = rawEvent({ player: null, player_candidate: "Roquan Smith" });
    const norm = rawEventToNormalizedEvent(raw, signal);
    expect(norm.players).toEqual(["Roquan Smith"]);
  });

  it("never overrides a successful regex extraction", () => {
    const raw = rawEvent({ player: "Lamar Jackson", player_candidate: "Roquan Smith" });
    const norm = rawEventToNormalizedEvent(raw, signal);
    expect(norm.players).toEqual(["Lamar Jackson"]);
  });

  it("prefers a payload player over the candidate", () => {
    const raw = rawEvent({
      player: null,
      player_candidate: "Roquan Smith",
      payload: { headline: "x", player: "Derrick Henry" },
    });
    const norm = rawEventToNormalizedEvent(raw, signal);
    expect(norm.players).toEqual(["Derrick Henry"]);
  });

  it("yields no players when both the regex path and candidate are empty", () => {
    const raw = rawEvent({ player: null, player_candidate: null });
    const norm = rawEventToNormalizedEvent(raw, signal);
    expect(norm.players).toEqual([]);
  });

  it("ignores an undefined player_candidate (non-RSS sources)", () => {
    const raw = rawEvent({ player: null });
    delete (raw as Partial<RawEvent>).player_candidate;
    const norm = rawEventToNormalizedEvent(raw, signal);
    expect(norm.players).toEqual([]);
  });
});
