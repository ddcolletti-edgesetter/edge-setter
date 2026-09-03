import { describe, expect, it } from "vitest";
import { matchSituation, scoreCandidate } from "../situations-matching";
import type { NormalizedEvent, Situation, SituationType } from "../situations-contract";
import type { League } from "../types";

/**
 * Player-name tolerance inside scoreCandidate (Option A).
 *
 * The real-world mismatch this guards: a situation carries ESPN's
 * athlete.displayName ("Patrick Surtain II") while an RSS-confirmation event
 * carries a name parsed from a headline ("Pat Surtain", "P. Surtain", "Surtain").
 * Plain token overlap scored these 0, starving player_overlap (the heaviest factor)
 * so genuine same-player confirmations could never clear the merge threshold.
 *
 * The comparator must be tolerant enough to reconcile those formats, but
 * conservative enough that a false player-match — which would cause a false MERGE,
 * not merely a missed confirmation — does not happen. These tests pin both edges.
 *
 * It must NOT alter behaviour for the full-name-vs-full-name cases the false-merge
 * guard (situations-matching-threshold.test.ts) relies on.
 */

const DAY = 24 * 60 * 60 * 1000;
const BASE = Date.parse("2026-09-01T12:00:00.000Z");
const isoHoursAgo = (h: number) => new Date(BASE - h * 3600_000).toISOString();

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    normalized_event_id: "nev_test",
    raw_event_id: null,
    source_id: "rss_broncos_official",
    source_type: "rss",
    sport: "football",
    league: "NFL" as League,
    game_id: null,
    teams: ["DEN"],
    players: ["Pat Surtain"],
    event_type: "injury_update" as NormalizedEvent["event_type"],
    situation_type: "injury" as SituationType,
    semantic_fingerprint: "injury injury_update surtain den questionable knee",
    occurred_at: isoHoursAgo(0),
    received_at: isoHoursAgo(0),
    summary: "Injury update",
    payload: {},
    ...overrides,
  };
}

function makeSituation(overrides: Partial<Situation & { latest_snapshot_at?: string | null }> = {}) {
  return {
    situation_id: "sit_test",
    canonical_hash: "hash_test",
    sport: "football" as const,
    league: "NFL" as League,
    game_id: null,
    teams: ["DEN"],
    players: ["Patrick Surtain II"], // ESPN displayName shape
    situation_type: "injury" as SituationType,
    semantic_fingerprint: "injury injury_update surtain den questionable knee",
    created_from_event_id: null,
    created_at: isoHoursAgo(2),
    ...overrides,
  };
}

/** Pull the player_overlap factor score for an (incoming players, candidate players) pair. */
function playerScore(incomingPlayers: string[], candidatePlayers: string[]): number {
  const scored = scoreCandidate(makeEvent({ players: incomingPlayers }), makeSituation({ players: candidatePlayers }));
  const f = scored.reasoning_breakdown.find((x) => x.factor === "player_overlap");
  if (!f) throw new Error("no player_overlap factor");
  return f.score;
}

describe("player_overlap: RSS headline name vs ESPN displayName", () => {
  it("matches shortened first name (Pat Surtain ↔ Patrick Surtain II)", () => {
    expect(playerScore(["Pat Surtain"], ["Patrick Surtain II"])).toBe(1);
  });

  it("matches a first initial (P. Surtain ↔ Patrick Surtain)", () => {
    expect(playerScore(["P. Surtain"], ["Patrick Surtain"])).toBe(1);
  });

  it("matches when the suffix differs (Odell Beckham ↔ Odell Beckham Jr)", () => {
    expect(playerScore(["Odell Beckham"], ["Odell Beckham Jr"])).toBe(1);
  });

  it("matches a common shortened form (Rob Griffin ↔ Robert Griffin III)", () => {
    expect(playerScore(["Rob Griffin"], ["Robert Griffin III"])).toBe(1);
  });

  it("still scores 1.0 on an exact full-name match", () => {
    expect(playerScore(["Marcus Reed"], ["Marcus Reed"])).toBe(1);
  });
});

describe("player_overlap: conservative — ambiguous cases must NOT match", () => {
  it("does NOT match distinct first names sharing an initial (James Cook ↔ Jared Cook)", () => {
    expect(playerScore(["Jared Cook"], ["James Cook"])).toBe(0);
  });

  it("does NOT match on last name alone when a side has no first token (Surtain ↔ Patrick Surtain II)", () => {
    expect(playerScore(["Surtain"], ["Patrick Surtain II"])).toBe(0);
  });

  it("does NOT match different last names (Jaylen Brown ↔ Jayson Tatum)", () => {
    expect(playerScore(["Jaylen Brown"], ["Jayson Tatum"])).toBe(0);
  });

  it("does NOT match a non-prefix nickname (Mike Evans ↔ Michael Evans) — conservative miss", () => {
    // Documented, intentional: prefix/initial only. Missing this is a lost
    // confirmation, never a false merge. Change requires a vetted nickname map.
    expect(playerScore(["Mike Evans"], ["Michael Evans"])).toBe(0);
  });
});

describe("player_overlap: end-to-end merge behaviour", () => {
  it("MERGES a same-team RSS confirmation whose player name is a shortened form", () => {
    const incoming = makeEvent({ players: ["Pat Surtain"] });
    const candidate = makeSituation({ players: ["Patrick Surtain II"] });
    const result = matchSituation(incoming, [candidate]);
    expect(result.matched_situation, `expected merge; composite ${result.match_confidence}`).not.toBeNull();
  });

  it("does NOT merge a same-team, different-player event even with identical injury wording", () => {
    const incoming = makeEvent({ players: ["Jared Cook"] });
    const candidate = makeSituation({ players: ["James Cook"] });
    const result = matchSituation(incoming, [candidate]);
    expect(result.matched_situation, `false merge at composite ${result.match_confidence}`).toBeNull();
  });
});
