import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import {
  matchConfirmationSource,
  maybeRecordPublicConfirmation,
} from "../public-confirmation";
import type { Situation } from "../situations-contract";
import {
  appendSituationEvent,
  buildSituationEvent,
  ensureSituationSchema,
  getSituationPublicConfirmation,
  insertSituation,
} from "../situations-store";
import type { RawEvent } from "../types";

const FIRST_SEEN_AT = "2026-06-11T12:00:00.000Z";

function isoMinutesAfterFirstSeen(minutes: number): string {
  return new Date(Date.parse(FIRST_SEEN_AT) + minutes * 60_000).toISOString();
}

function makeRaw(payload: Record<string, unknown>, overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: "raw-incoming",
    source_id: "test_source",
    source_type: "scrape",
    league: "CFB",
    game_id: null,
    team: "TTU",
    player: "Brendan Sorsby",
    event_type: "eligibility_ruling",
    payload,
    processed: false,
    processed_at: null,
    created_at: isoMinutesAfterFirstSeen(47),
    received_at: isoMinutesAfterFirstSeen(47),
    ...overrides,
  };
}

function makeSituation(overrides: Partial<Situation> = {}): Situation {
  return {
    situation_id: "sit-test-1",
    canonical_hash: "hash-test-1",
    sport: "football",
    league: "CFB",
    game_id: null,
    teams: ["TTU"],
    players: ["Brendan Sorsby"],
    situation_type: "roster",
    semantic_fingerprint: "roster eligibility_ruling Brendan Sorsby TTU",
    created_from_event_id: "ne_origin",
    created_at: FIRST_SEEN_AT,
    ...overrides,
  };
}

/**
 * Seed a situation plus its situation_created event, mirroring what
 * evolveCanonicalSituation persists when EdgeSetter first detects a story.
 */
function seedSituation(
  db: Database.Database,
  originRawPayload: Record<string, unknown>,
  overrides: Partial<Situation> = {},
): Situation {
  const situation = makeSituation(overrides);
  insertSituation(situation, db);
  appendSituationEvent(buildSituationEvent({
    situation_id: situation.situation_id,
    kind: "situation_created",
    raw_event_id: "raw-origin",
    normalized_event_id: "ne_origin",
    source_id: "origin_source",
    observed_at: situation.created_at,
    recorded_at: situation.created_at,
    payload: {
      normalized_event: {
        source_id: "origin_source",
        payload: { raw_payload: originRawPayload },
      },
    },
  }), db);
  return situation;
}

const SID_ORIGIN_PAYLOAD = {
  author: "Texas Tech Football",
  source_tier: "tier2",
  source_types: ["x", "social"],
  sources: [{ id: "x_texastechfb", name: "Texas Tech Football (@TexasTechFB)", type: "social" }],
};

const SCHEFTER_PAYLOAD = {
  author: "Adam Schefter",
  source_tier: "tier1",
  source_types: ["x", "social"],
  sources: [{ id: "x_adamschefter", name: "Adam Schefter (@AdamSchefter)", type: "social" }],
  published_at: isoMinutesAfterFirstSeen(47),
};

describe("matchConfirmationSource", () => {
  it("matches official source types (exact-string match only — 'official report' renamed to league_api on June 22)", () => {
    const match = matchConfirmationSource({ payload: { source_types: ["official"], sources: [{ name: "League API", type: "official" }] } });
    expect(match?.reason).toBe("official");
  });

  it("matches official team feeds by name", () => {
    const match = matchConfirmationSource({ payload: { sources: [{ name: "Kansas City Chiefs Official", type: "rss" }] } });
    expect(match?.reason).toBe("official");
    expect(match?.name).toBe("Kansas City Chiefs Official");
  });

  it("matches tier1 wire reporters by name", () => {
    const match = matchConfirmationSource({ payload: SCHEFTER_PAYLOAD });
    expect(match?.reason).toBe("tier1_wire");
    expect(match?.name).toBe("Adam Schefter");
  });

  it("matches wire outlets without tier metadata (RSS)", () => {
    const match = matchConfirmationSource({ payload: { source_labels: ["ESPN NFL"], source_types: ["rss"] } });
    expect(match?.reason).toBe("tier1_wire");
  });

  it("does not match tier3 blogs or unknown reporters", () => {
    expect(matchConfirmationSource({ payload: { author: "Random CFB Blog", source_tier: "tier3" } })).toBeNull();
    expect(matchConfirmationSource({ payload: { author: "Some Beat Writer", source_tier: "tier2" } })).toBeNull();
    expect(matchConfirmationSource({ payload: { author: "Anonymous Aggregator" } })).toBeNull();
  });
});

describe("maybeRecordPublicConfirmation", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    ensureSituationSchema(db);
  });

  it("sets publicConfirmation when a tier1 wire reports a story EdgeSetter already has", () => {
    const situation = seedSituation(db, SID_ORIGIN_PAYLOAD);
    const raw = makeRaw(SCHEFTER_PAYLOAD);

    const result = maybeRecordPublicConfirmation(raw, { matched: true, situation }, db);

    expect(result).not.toBeNull();
    expect(result?.confirmed_at).toBe(isoMinutesAfterFirstSeen(47));
    expect(result?.source_name).toBe("Adam Schefter");

    const stored = getSituationPublicConfirmation(situation.situation_id, db);
    expect(stored?.confirmed_at).toBe(isoMinutesAfterFirstSeen(47));
  });

  it("computes detectionLeadMinutes as the exact minute gap from firstSeenAt", () => {
    const situation = seedSituation(db, SID_ORIGIN_PAYLOAD);
    const raw = makeRaw(SCHEFTER_PAYLOAD);

    const result = maybeRecordPublicConfirmation(raw, { matched: true, situation }, db);

    expect(result?.detection_lead_minutes).toBe(47);
  });

  it("does NOT set publicConfirmation on the first signal for a situation", () => {
    const situation = seedSituation(db, SID_ORIGIN_PAYLOAD);
    const raw = makeRaw(SCHEFTER_PAYLOAD);

    // matched=false means this signal CREATED the situation — that is firstSeenAt.
    const result = maybeRecordPublicConfirmation(raw, { matched: false, situation }, db);

    expect(result).toBeNull();
    expect(getSituationPublicConfirmation(situation.situation_id, db)).toBeNull();
  });

  it("does NOT set publicConfirmation when a tier1 wire was the original detector", () => {
    const situation = seedSituation(db, SCHEFTER_PAYLOAD);
    const followUp = makeRaw({
      source_types: ["official report"],
      sources: [{ name: "NFL Official", type: "official" }],
      published_at: isoMinutesAfterFirstSeen(60),
    });

    const result = maybeRecordPublicConfirmation(followUp, { matched: true, situation }, db);

    expect(result).toBeNull();
    expect(getSituationPublicConfirmation(situation.situation_id, db)).toBeNull();
  });

  it("does NOT overwrite an existing publicConfirmation — first pickup is canonical", () => {
    const situation = seedSituation(db, SID_ORIGIN_PAYLOAD);
    const first = maybeRecordPublicConfirmation(makeRaw(SCHEFTER_PAYLOAD), { matched: true, situation }, db);
    expect(first).not.toBeNull();

    const later = makeRaw({
      source_types: ["official report"],
      sources: [{ name: "NFL Official", type: "official" }],
      published_at: isoMinutesAfterFirstSeen(90),
    }, { id: "raw-later" });

    const result = maybeRecordPublicConfirmation(later, { matched: true, situation }, db);

    expect(result).toBeNull();
    const stored = getSituationPublicConfirmation(situation.situation_id, db);
    expect(stored?.confirmed_at).toBe(isoMinutesAfterFirstSeen(47));
    expect(stored?.source_name).toBe("Adam Schefter");
  });

  it("does NOT trigger on a non-confirmation source (tier3 blog)", () => {
    const situation = seedSituation(db, SID_ORIGIN_PAYLOAD);
    const blog = makeRaw({
      author: "Random CFB Blog",
      source_tier: "tier3",
      published_at: isoMinutesAfterFirstSeen(30),
    });

    const result = maybeRecordPublicConfirmation(blog, { matched: true, situation }, db);

    expect(result).toBeNull();
    expect(getSituationPublicConfirmation(situation.situation_id, db)).toBeNull();
  });

  it("does NOT set publicConfirmation when the wire report predates detection", () => {
    const situation = seedSituation(db, SID_ORIGIN_PAYLOAD);
    const raw = makeRaw({ ...SCHEFTER_PAYLOAD, published_at: isoMinutesAfterFirstSeen(-10) });

    const result = maybeRecordPublicConfirmation(raw, { matched: true, situation }, db);

    expect(result).toBeNull();
  });
});
