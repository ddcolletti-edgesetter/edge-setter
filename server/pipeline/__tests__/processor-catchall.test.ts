import { describe, expect, it } from "vitest";
import { routeEventToFields } from "../processor";
import type { RawEvent } from "../types";

function makeRaw(overrides: Partial<RawEvent>): RawEvent {
  return {
    id: "test-id",
    source_id: "test",
    source_type: "api",
    league: "CFB",
    game_id: null,
    team: "TTU",
    player: null,
    event_type: "manual",
    payload: {},
    processed: false,
    processed_at: null,
    created_at: new Date().toISOString(),
    received_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("routeEventToFields — catch-all unknown signal type", () => {
  it("emits confidence 25 / verdict review / confirmation Unverified for unrecognized event_type", () => {
    const raw = makeRaw({ event_type: "mystery_event_type" as any });
    const fields = routeEventToFields(raw);

    expect(fields.confidence).toBe(25);
    expect(fields.verdict).toBe("review");
    expect(fields.confirmation_strength).toBe("Unverified");
    expect(fields.betting_relevance).toBe(false);
    expect(fields.fantasy_relevance).toBe(false);
  });

  it("catch-all headline contains the unknown event type string", () => {
    const raw = makeRaw({ event_type: "quantum_signal" as any, player: "Test Player" });
    const fields = routeEventToFields(raw);

    // headline should reference the player or team since payload has no headline
    expect(fields.headline).toBeTruthy();
    expect(typeof fields.headline).toBe("string");
  });

  it("does NOT produce confidence 25 for known event types", () => {
    const raw = makeRaw({ event_type: "injury_update", payload: {} });
    const fields = routeEventToFields(raw);

    // injury_update default confidence is 65 (non-OUT) — definitely not 25
    expect(fields.confidence).not.toBe(25);
    expect(fields.verdict).not.toBe("review");
  });
});

describe("routeEventToFields — eligibility_ruling handler", () => {
  it("routes eligibility_ruling to the correct handler", () => {
    const raw = makeRaw({
      event_type: "eligibility_ruling",
      player: "Brendan Sorsby",
      team: "TTU",
      payload: {},
    });
    const fields = routeEventToFields(raw);

    expect(fields.signal_type).toBe("eligibility_ruling");
    expect(fields.confidence).toBe(90);
    expect(fields.verdict).toBe("confirmed");
    expect(fields.confirmation_strength).toBe("Corroborated");
    expect(fields.betting_relevance).toBe(true);
    expect(fields.fantasy_relevance).toBe(true);
  });

  it("eligibility_ruling headline includes player and team", () => {
    const raw = makeRaw({
      event_type: "eligibility_ruling",
      player: "Brendan Sorsby",
      team: "TTU",
      payload: {},
    });
    const fields = routeEventToFields(raw);

    expect(fields.headline).toContain("Brendan Sorsby");
    expect(fields.headline).toContain("TTU");
  });

  it("eligibility_ruling payload overrides take precedence", () => {
    const raw = makeRaw({
      event_type: "eligibility_ruling",
      player: "Test Player",
      team: "UNK",
      payload: {
        notes: "Custom eligibility note",
        confidence: 95,
        confirmation: "Consensus",
      },
    });
    const fields = routeEventToFields(raw);

    expect(fields.body).toBe("Custom eligibility note");
    expect(fields.confidence).toBe(95);
    expect(fields.confirmation_strength).toBe("Consensus");
  });
});

describe("routeEventToFields — eligibility keyword detection in transactions", () => {
  it("transaction handler still handles generic roster moves", () => {
    const raw = makeRaw({
      event_type: "transaction",
      player: "Generic Player",
      team: "UNK",
      payload: { transaction_type: "RosterMove", notes: "Player added to practice squad" },
    });
    const fields = routeEventToFields(raw);

    expect(fields.signal_type).toBe("transaction");
    // Default transaction confidence is 85
    expect(fields.confidence).toBe(85);
  });
});
