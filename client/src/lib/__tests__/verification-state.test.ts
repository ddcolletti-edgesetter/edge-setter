import { describe, it, expect } from "vitest";

import {
  deriveVerificationState,
  evidenceFromLiveSignal,
  evidenceFromCanonical,
  type VerificationEvidence,
} from "@shared/verification-state";
import type { LiveSignal } from "../signalsApi";
import type { CanonicalSituation } from "../situationsApi";

// ─── helpers ─────────────────────────────────────────────────────────────────

function evidence(overrides: Partial<VerificationEvidence> = {}): VerificationEvidence {
  return {
    contradicted: false,
    officialConfirmation: false,
    verdict: "likely",
    independentCorroboration: false,
    confirmationTier: "Unverified",
    marketReaction: false,
    ...overrides,
  };
}

// A full LiveSignal, so the adapter is exercised against the REAL shape (schema-replica).
function makeLiveSignal(overrides: Partial<LiveSignal> = {}): LiveSignal {
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
    signal_time: "2026-08-13T00:00:00.000Z",
    created_at: "2026-08-13T00:00:00.000Z",
    updated_at: "2026-08-13T00:00:00.000Z",
    outcome_id: null,
    ...overrides,
  };
}

function makeCanonical(overrides: Partial<CanonicalSituation> = {}): CanonicalSituation {
  return {
    id: "cs-1",
    title: "Test situation",
    summary: "",
    sport: "football",
    league: "NFL",
    teams: ["KC"],
    players: [],
    situationType: "injury",
    lifecycleState: "developing",
    lifecycleExplanation: "",
    confidence: 55,
    confidenceLabel: "Developing",
    confidenceFactors: {
      scores: {
        source_reliability: 0,
        independent_confirmations: 0,
        market_alignment: 0,
        validator_agreement: 0,
        official_confirmation: 0,
        freshness: 0,
        contradiction_penalty: 0,
      },
      whyConfidenceIncreased: [],
      whyConfidenceDecreased: [],
      evidenceThatMattersMost: [],
      whatRemainsUncertain: [],
    },
    severity: "medium",
    escalationScore: 40,
    timingPressure: "low",
    operationalVisibilityScore: 40,
    lastUpdatedAt: "2026-08-13T00:00:00.000Z",
    firstSeenAt: "2026-08-13T00:00:00.000Z",
    evidenceCount: 1,
    sourceCount: 1,
    latestEvidence: [],
    stateHistoryPreview: [],
    confidenceHistoryPreview: [],
    replayHash: "hash",
    ...overrides,
  };
}

// ─── core decision ───────────────────────────────────────────────────────────

describe("deriveVerificationState", () => {
  it("returns Developing when contradicted, even with official confirmation", () => {
    const result = deriveVerificationState(
      evidence({ contradicted: true, officialConfirmation: true, verdict: "confirmed" }),
    );
    expect(result.state).toBe("Developing");
  });

  it("returns Verified on official confirmation alone", () => {
    expect(deriveVerificationState(evidence({ officialConfirmation: true })).state).toBe("Verified");
  });

  it("returns Verified for confirmed verdict with independent corroboration", () => {
    const result = deriveVerificationState(
      evidence({ verdict: "confirmed", independentCorroboration: true }),
    );
    expect(result.state).toBe("Verified");
  });

  it("returns Escalating for a confirmed verdict with no corroboration", () => {
    expect(deriveVerificationState(evidence({ verdict: "confirmed" })).state).toBe("Escalating");
  });

  it("returns Escalating on a Corroborated tier", () => {
    expect(deriveVerificationState(evidence({ confirmationTier: "Corroborated" })).state).toBe("Escalating");
  });

  it("returns Escalating on independent corroboration alone", () => {
    expect(deriveVerificationState(evidence({ independentCorroboration: true })).state).toBe("Escalating");
  });

  it("returns Escalating when only a market reaction is present", () => {
    expect(deriveVerificationState(evidence({ marketReaction: true })).state).toBe("Escalating");
  });

  it("returns Developing with no supporting evidence", () => {
    expect(deriveVerificationState(evidence()).state).toBe("Developing");
  });

  it("always returns one of the three public words with a non-empty basis", () => {
    const words = new Set<string>();
    for (const c of [true, false]) {
      for (const o of [true, false]) {
        for (const v of ["confirmed", "likely", "contradicted"]) {
          for (const ic of [true, false]) {
            for (const t of ["Corroborated", "Consensus", "Unverified"]) {
              for (const m of [true, false]) {
                const r = deriveVerificationState(
                  evidence({ contradicted: c, officialConfirmation: o, verdict: v, independentCorroboration: ic, confirmationTier: t, marketReaction: m }),
                );
                words.add(r.state);
                expect(r.basis.length).toBeGreaterThan(0);
              }
            }
          }
        }
      }
    }
    expect([...words].sort()).toEqual(["Developing", "Escalating", "Verified"]);
  });
});

// ─── live signal adapter ─────────────────────────────────────────────────────

describe("evidenceFromLiveSignal", () => {
  it("promotes a confirmed verdict with >= 2 sources to Verified", () => {
    const signal = makeLiveSignal({ verdict: "confirmed", source_count: 2 });
    expect(deriveVerificationState(evidenceFromLiveSignal(signal)).state).toBe("Verified");
  });

  it("promotes a confirmed verdict with a Consensus tier to Verified", () => {
    const signal = makeLiveSignal({ verdict: "confirmed", confirmation_strength: "Consensus", source_count: 1 });
    expect(deriveVerificationState(evidenceFromLiveSignal(signal)).state).toBe("Verified");
  });

  it("keeps a lone confirmed verdict (single source) at Escalating", () => {
    const signal = makeLiveSignal({ verdict: "confirmed", confirmation_strength: "Developing", source_count: 1 });
    const ev = evidenceFromLiveSignal(signal);
    expect(ev.independentCorroboration).toBe(false);
    expect(deriveVerificationState(ev).state).toBe("Escalating");
  });

  it("routes an official verdict to Verified", () => {
    const signal = makeLiveSignal({ verdict: "official", source_count: 1 });
    const ev = evidenceFromLiveSignal(signal);
    expect(ev.officialConfirmation).toBe(true);
    expect(deriveVerificationState(ev).state).toBe("Verified");
  });

  it("routes a contradicted verdict to Developing", () => {
    const signal = makeLiveSignal({ verdict: "contradicted", source_count: 3, confirmation_strength: "Consensus" });
    const ev = evidenceFromLiveSignal(signal);
    expect(ev.contradicted).toBe(true);
    expect(deriveVerificationState(ev).state).toBe("Developing");
  });

  it("escalates on line movement alone", () => {
    const signal = makeLiveSignal({ verdict: "rumor", source_count: 1, line_movement: { open: 3, current: 4, delta: 1, direction: "up" } });
    const ev = evidenceFromLiveSignal(signal);
    expect(ev.marketReaction).toBe(true);
    expect(deriveVerificationState(ev).state).toBe("Escalating");
  });

  it("maps a Corroborated strength onto the Corroborated tier", () => {
    const signal = makeLiveSignal({ verdict: "likely", confirmation_strength: "Corroborated", source_count: 1 });
    expect(evidenceFromLiveSignal(signal).confirmationTier).toBe("Corroborated");
  });
});

// ─── canonical situation adapter ─────────────────────────────────────────────

describe("evidenceFromCanonical", () => {
  it("routes an official lifecycle to Verified", () => {
    const situation = makeCanonical({ lifecycleState: "official" });
    const ev = evidenceFromCanonical(situation);
    expect(ev.officialConfirmation).toBe(true);
    expect(deriveVerificationState(ev).state).toBe("Verified");
  });

  it("promotes a confirmed lifecycle with corroboration to Verified", () => {
    const situation = makeCanonical({ lifecycleState: "confirmed", sourceCount: 2 });
    expect(deriveVerificationState(evidenceFromCanonical(situation)).state).toBe("Verified");
  });

  it("treats an invalidated lifecycle as contradicted -> Developing", () => {
    const situation = makeCanonical({ lifecycleState: "invalidated", sourceCount: 5 });
    const ev = evidenceFromCanonical(situation);
    expect(ev.contradicted).toBe(true);
    expect(deriveVerificationState(ev).state).toBe("Developing");
  });

  it("treats a contradiction penalty as contradicted", () => {
    const situation = makeCanonical({
      lifecycleState: "developing",
      confidenceFactors: {
        ...makeCanonical().confidenceFactors,
        scores: { ...makeCanonical().confidenceFactors.scores, contradiction_penalty: 12 },
      },
    });
    expect(evidenceFromCanonical(situation).contradicted).toBe(true);
  });

  it("escalates on an escalating lifecycle", () => {
    const situation = makeCanonical({ lifecycleState: "escalating" });
    const ev = evidenceFromCanonical(situation);
    expect(ev.confirmationTier).toBe("Corroborated");
    expect(deriveVerificationState(ev).state).toBe("Escalating");
  });

  it("counts a recorded public confirmation as independent corroboration", () => {
    const situation = makeCanonical({ lifecycleState: "developing", sourceCount: 1, publicConfirmation: "2026-08-13T01:00:00.000Z" });
    expect(evidenceFromCanonical(situation).independentCorroboration).toBe(true);
  });

  it("detects an attached market reaction from latest evidence", () => {
    const situation = makeCanonical({
      lifecycleState: "developing",
      latestEvidence: [
        { eventType: "market_reaction", sourceType: "market", timestamp: "2026-08-13T00:30:00.000Z", confidenceDelta: null, marketImpact: "Line moved -1.5", validatorAgreement: null, summary: "", replayHash: "h" },
      ],
    });
    expect(evidenceFromCanonical(situation).marketReaction).toBe(true);
  });

  it("leaves a bare developing situation at Developing", () => {
    expect(deriveVerificationState(evidenceFromCanonical(makeCanonical())).state).toBe("Developing");
  });
});
