import { describe, expect, it } from "vitest";
import { matchSituation, scoreCandidate } from "../situations-matching";
import type { NormalizedEvent, Situation, SituationType } from "../situations-contract";
import type { League } from "../types";

/**
 * Regression coverage against relaxing the situation match threshold.
 *
 * Current behaviour: a flat 0.62 cutoff for all situation types. A proposed
 * change (threshold -> 0.45 for non-"game" types, plus a flattened timing decay
 * curve) was measured against these cases and REJECTED: it merged two different
 * players on the same team at composite 0.500, and the same player across two
 * different teams at 0.480. Both pass at 0.62 with composites of 0.473 / 0.453.
 *
 * These fixtures sit deliberately close to that boundary — same league, same
 * team, near-identical injury wording, 20-30 day age — so they trip if the
 * cutoff is lowered again or the decay curve is flattened. A trivially
 * dissimilar pair would pass under any threshold and prove nothing.
 *
 * Historical context: cross-player merges within a single team were the bug
 * fixed in 14003d3 / 8b044ec.
 */

const DAY = 24 * 60 * 60 * 1000;
const BASE = Date.parse("2026-07-20T12:00:00.000Z");

function isoDaysAgo(days: number): string {
  return new Date(BASE - days * DAY).toISOString();
}

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    normalized_event_id: "nev_test",
    raw_event_id: null,
    source_id: "src_test",
    source_type: "rss",
    sport: "basketball",
    league: "NBA" as League,
    game_id: null,
    teams: ["Boston Celtics"],
    players: ["Jayson Tatum"],
    event_type: "injury_report" as NormalizedEvent["event_type"],
    situation_type: "injury" as SituationType,
    semantic_fingerprint: "ankle sprain questionable practice limited",
    occurred_at: isoDaysAgo(0),
    received_at: isoDaysAgo(0),
    summary: "Injury update",
    payload: {},
    ...overrides,
  };
}

function makeSituation(overrides: Partial<Situation & { latest_snapshot_at?: string | null }> = {}) {
  return {
    situation_id: "sit_test",
    canonical_hash: "hash_test",
    sport: "basketball" as const,
    league: "NBA" as League,
    game_id: null,
    teams: ["Boston Celtics"],
    players: ["Jaylen Brown"],
    situation_type: "injury" as SituationType,
    semantic_fingerprint: "ankle sprain questionable practice limited",
    created_from_event_id: null,
    created_at: isoDaysAgo(26),
    ...overrides,
  };
}

/** Prints the full factor breakdown so failures show WHY, not just that. */
function report(label: string, incoming: NormalizedEvent, candidate: ReturnType<typeof makeSituation>): number {
  const scored = scoreCandidate(incoming, candidate);
  const lines = scored.reasoning_breakdown
    .map((f) => `    ${f.factor.padEnd(20)} score=${f.score.toFixed(3)} w=${f.weight} contrib=${f.contribution.toFixed(3)}`)
    .join("\n");
  // eslint-disable-next-line no-console
  console.log(`\n  [${label}] composite=${scored.match_confidence.toFixed(3)}\n${lines}`);
  return scored.match_confidence;
}

describe("situations-matching: match threshold does not create false merges", () => {
  it("does NOT merge two different players on the same team (cross-player regression)", () => {
    // Two Celtics teammates, both ankle injuries, near-identical wording, 26 days apart.
    // Realistic: both carry market + roster context, as live injury signals do.
    const incoming = makeEvent({
      players: ["Jayson Tatum"],
      market_context: { market: "player_prop", delta: 1.5, direction: "down", sportsbook: "dk" },
      roster_context: { position: "SF", starter: true, depth_chart_role: "primary" },
    });
    const candidate = makeSituation({ players: ["Jaylen Brown"], created_at: isoDaysAgo(26) });

    const score = report("cross-player, same team", incoming, candidate);
    const result = matchSituation(incoming, [candidate]);

    expect(result.matched_situation, `false merge at composite ${score}`).toBeNull();
  });

  it("does NOT merge the same player across two different teams (trade scenario)", () => {
    // Player traded; old situation is on the prior team. Same person, same injury
    // language, 22 days old — player_overlap is a full 1.0 here, so this leans hard
    // on team_overlap being the discriminator.
    const incoming = makeEvent({
      teams: ["Phoenix Suns"],
      players: ["Marcus Reed"],
      roster_context: { position: "PG", starter: true },
    });
    const candidate = makeSituation({
      teams: ["Boston Celtics"],
      players: ["Marcus Reed"],
      created_at: isoDaysAgo(22),
    });

    const score = report("same player, different team", incoming, candidate);
    const result = matchSituation(incoming, [candidate]);

    expect(result.matched_situation, `false merge at composite ${score}`).toBeNull();
  });

  it("does NOT bleed across situation types on the same team (injury vs roster)", () => {
    // NOTE: the contract has no "transaction" type; "roster" is the nearest
    // equivalent (SituationType = injury|lineup|market|weather|roster|scheme|
    // game_state|operator_note).
    const incoming = makeEvent({
      situation_type: "injury" as SituationType,
      players: ["Jayson Tatum"],
    });
    const candidate = makeSituation({
      situation_type: "roster" as SituationType,
      players: ["Jayson Tatum"],
      created_at: isoDaysAgo(24),
    });

    const rawScore = report("injury vs roster, same team+player", incoming, candidate);
    const result = matchSituation(incoming, [candidate]);

    expect(result.matched_situation, `false merge at composite ${rawScore}`).toBeNull();
    // Guard the mechanism, not just the outcome: exclusion must come from the
    // type filter in matchSituation, which no threshold change can weaken.
    expect(result.match_confidence).toBe(0);
  });

  it("still merges a genuine same-player follow-up (guards against over-tightening)", () => {
    // Control case: if a fix makes the first three pass by rejecting everything,
    // this catches it.
    const incoming = makeEvent({ players: ["Jayson Tatum"], occurred_at: isoDaysAgo(0) });
    const candidate = makeSituation({ players: ["Jayson Tatum"], created_at: isoDaysAgo(1) });

    const score = report("same player, same team, 1 day", incoming, candidate);
    const result = matchSituation(incoming, [candidate]);

    expect(result.matched_situation, `genuine match rejected at composite ${score}`).not.toBeNull();
  });
});
