import { afterEach, describe, expect, it, vi } from "vitest";

import { adaptSignalToSituation } from "../intelligenceSituationsApi";
import type { LiveSignal } from "../signalsApi";

// PR-B: the confidence explanation string must not leak the raw percentage when
// the VITE_VERIFICATION_STATE_HOMEPAGE flag is on — it leads with the shared
// verification word instead. Flag off keeps the legacy "at N%" phrasing.

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
    source_count: 2,
    verdict: "confirmed",
    confidence: 60,
    confirmation_strength: "Corroborated",
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

describe("confidenceExplanation — verification-state flag gating", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("includes the raw percentage when the flag is off", () => {
    vi.stubEnv("VITE_VERIFICATION_STATE_HOMEPAGE", "");
    const situation = adaptSignalToSituation(makeLiveSignal({ confidence: 60 }));
    expect(situation.confidence.explanation).toContain("60%");
  });

  it("leads with the verification word and hides the percentage when the flag is on", () => {
    vi.stubEnv("VITE_VERIFICATION_STATE_HOMEPAGE", "true");
    const signal = makeLiveSignal({ confidence: 60 });
    const situation = adaptSignalToSituation(signal);

    expect(situation.confidence.explanation).not.toContain("60%");
    expect(situation.confidence.explanation).toContain(situation.verification.state);
  });
});
