import { describe, it, expect } from "vitest";

import { adaptSignalToSituation } from "../intelligenceSituationsApi";
import { deriveVerificationState, evidenceFromLiveSignal } from "@shared/verification-state";
import type { LiveSignal } from "../signalsApi";

// A full LiveSignal so the mapper runs against the REAL shape (schema-replica).
// Timestamps are stamped fresh so the age-based stale fallback in
// deriveEscalationState (> 1440m -> Monitoring) never fires for these fixtures;
// the verification word itself is time-independent.
function makeLiveSignal(overrides: Partial<LiveSignal> = {}): LiveSignal {
  const now = new Date().toISOString();
  return {
    id: "sig-1",
    league: "NFL",
    game_id: null,
    signal_type: "injury_update",
    headline: "Test headline",
    body: "",
    action_note: "",
    why_it_matters: "",
    team: "KC",
    player: null,
    matchup: null,
    sources: [],
    source_count: 1,
    verdict: "likely",
    confidence: 60,
    confirmation_strength: "Developing",
    line_movement: null,
    injury_designation: null,
    lineup_status: null,
    weather_note: null,
    betting_relevance: false,
    fantasy_relevance: false,
    score: 50,
    score_band: "Informational",
    urgency_label: "NOTE",
    urgency_reason: "",
    trust_label: "",
    score_explanation: "",
    breakdown: {
      confidenceScore: 0,
      sourceQualityScore: 0,
      marketImpactScore: 0,
      recencyBonus: 0,
      relevanceScore: 0,
      contextScore: 0,
    },
    raw_event_ids: [],
    signal_time: now,
    created_at: now,
    updated_at: now,
    outcome_id: null,
    ...overrides,
  };
}

// ─── mapper attaches verification matching the engine ────────────────────────

describe("adaptSignalToSituation — verification attachment", () => {
  it("attaches a verification word matching the shared engine for every case", () => {
    const cases = [
      makeLiveSignal({ verdict: "confirmed", source_count: 2 }),
      makeLiveSignal({ verdict: "confirmed", confirmation_strength: "Developing", source_count: 1 }),
      makeLiveSignal({ verdict: "contradicted", source_count: 3, confirmation_strength: "Consensus" }),
      makeLiveSignal({ verdict: "official", source_count: 1 }),
      makeLiveSignal({ verdict: "rumor", source_count: 1 }),
    ];
    for (const signal of cases) {
      const situation = adaptSignalToSituation(signal);
      const expected = deriveVerificationState(evidenceFromLiveSignal(signal));
      expect(situation.verification).toEqual(expected);
    }
  });

  it("maps confirmed + corroboration (>= 2 sources) to Verified", () => {
    const situation = adaptSignalToSituation(makeLiveSignal({ verdict: "confirmed", source_count: 2 }));
    expect(situation.verification.state).toBe("Verified");
  });

  it("maps a lone confirmed verdict (single source) to Escalating", () => {
    const situation = adaptSignalToSituation(
      makeLiveSignal({ verdict: "confirmed", confirmation_strength: "Developing", source_count: 1 }),
    );
    expect(situation.verification.state).toBe("Escalating");
  });

  it("maps a contradicted verdict to Developing", () => {
    const situation = adaptSignalToSituation(
      makeLiveSignal({ verdict: "contradicted", source_count: 3, confirmation_strength: "Consensus" }),
    );
    expect(situation.verification.state).toBe("Developing");
  });

  it("carries the engine's plain-language basis through to the situation", () => {
    const signal = makeLiveSignal({ verdict: "official", source_count: 1 });
    const situation = adaptSignalToSituation(signal);
    expect(situation.verification.basis).toBe(deriveVerificationState(evidenceFromLiveSignal(signal)).basis);
    expect(situation.verification.basis.length).toBeGreaterThan(0);
  });
});

// ─── escalationState regression ──────────────────────────────────────────────
// The six-value EscalationState enum must still map exactly as before the
// verification result was threaded in as a parameter (behaviour-preserving
// refactor — the engine call moved, the decision did not).

describe("adaptSignalToSituation — escalationState regression", () => {
  it("routes an official verdict to Official", () => {
    const situation = adaptSignalToSituation(makeLiveSignal({ verdict: "official", source_count: 1 }));
    expect(situation.escalationState).toBe("Official");
  });

  it("routes a Verified (non-official) confirmed+corroborated verdict to Confirming", () => {
    const situation = adaptSignalToSituation(makeLiveSignal({ verdict: "confirmed", source_count: 2 }));
    expect(situation.verification.state).toBe("Verified");
    expect(situation.escalationState).toBe("Confirming");
  });

  it("routes an Escalating verdict with market/multi-source support to Escalating", () => {
    const situation = adaptSignalToSituation(
      makeLiveSignal({ verdict: "likely", confirmation_strength: "Corroborated", source_count: 2 }),
    );
    expect(situation.verification.state).toBe("Escalating");
    expect(situation.escalationState).toBe("Escalating");
  });

  it("routes a bare developing single-source signal to Monitoring", () => {
    const situation = adaptSignalToSituation(makeLiveSignal({ verdict: "rumor", source_count: 1 }));
    expect(situation.verification.state).toBe("Developing");
    expect(situation.escalationState).toBe("Monitoring");
  });
});

// ─── Emerging maps to a single consistent verification word ───────────────────
// "Emerging" is an ambiguous middle bucket: it can be reached from either the
// Escalating word (lone confirmed, single source) or the Developing word (a
// contradicted signal that nonetheless carries >= 2 sources). The verification
// word disambiguates it, and it is always exactly the engine's word.

describe("adaptSignalToSituation — Emerging disambiguation", () => {
  it("resolves a lone-confirmed Emerging row to the Escalating word", () => {
    const signal = makeLiveSignal({ verdict: "confirmed", confirmation_strength: "Developing", source_count: 1 });
    const situation = adaptSignalToSituation(signal);
    expect(situation.escalationState).toBe("Emerging");
    expect(situation.verification.state).toBe("Escalating");
    expect(situation.verification).toEqual(deriveVerificationState(evidenceFromLiveSignal(signal)));
  });

  it("resolves a contradicted-but-corroborated Emerging row to the Developing word", () => {
    const signal = makeLiveSignal({ verdict: "contradicted", confirmation_strength: "Developing", source_count: 2 });
    const situation = adaptSignalToSituation(signal);
    expect(situation.escalationState).toBe("Emerging");
    expect(situation.verification.state).toBe("Developing");
    expect(situation.verification).toEqual(deriveVerificationState(evidenceFromLiveSignal(signal)));
  });
});
