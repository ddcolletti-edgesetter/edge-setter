import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import type { Situation, SituationEvent, SituationSnapshot } from "../situations-contract";
import {
  buildConfidenceBaselines,
  capCorruptedConfidence,
  confidenceBaselineKey,
  countFoundingRows,
  CORRUPTED_FOUNDING_ROW_THRESHOLD,
  resolveHeadlineConfidence,
} from "../situations-confidence-guard";
import {
  appendSituationEvent,
  appendSituationSnapshot,
  buildSituationEvent,
  ensureSituationSchema,
  insertSituation,
} from "../situations-store";

const CREATED_AT = "2026-08-26T12:00:00.000Z";

function makeSituation(overrides: Partial<Situation> = {}): Situation {
  return {
    situation_id: "sit-guard-1",
    canonical_hash: "hash-guard-1",
    sport: "football",
    league: "NFL",
    game_id: null,
    teams: ["KC"],
    players: ["Patrick Mahomes"],
    situation_type: "roster",
    semantic_fingerprint: "roster injury Patrick Mahomes KC",
    created_from_event_id: "ne_origin",
    created_at: CREATED_AT,
    ...overrides,
  };
}

function makeSnapshot(situationId: string, score: number): SituationSnapshot {
  return {
    snapshot_id: `snap-${situationId}`,
    situation_id: situationId,
    lifecycle_state: "watching",
    confidence: {
      score,
      factors: {
        source_reliability: 0.6,
        independent_confirmations: 0.5,
        market_alignment: 0,
        validator_agreement: 0,
        official_confirmation: 0,
        freshness: 0.9,
        contradiction_penalty: 0,
      },
      reasoning: ["seed"],
      computed_at: CREATED_AT,
      replay_hash: `conf-${situationId}`,
    },
    summary: "summary",
    escalation_score: 40,
    timing_pressure: "medium",
    evidence_event_ids: ["se_evidence_1"],
    replay_hash: `snap-replay-${situationId}`,
    previous_snapshot_hash: null,
    created_at: CREATED_AT,
  };
}

/** Insert `count` distinct situation_created (founding) events for a situation. */
function insertFoundingRows(db: Database.Database, situationId: string, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const event: SituationEvent = buildSituationEvent({
      situation_id: situationId,
      kind: "situation_created",
      raw_event_id: `raw-${situationId}-${i}`,
      normalized_event_id: `ne-${situationId}-${i}`,
      source_id: `src-${i}`,
      observed_at: CREATED_AT,
      recorded_at: CREATED_AT,
      payload: {},
    });
    appendSituationEvent(event, db);
  }
}

describe("CORRUPTED_FOUNDING_ROW_THRESHOLD", () => {
  it("is 1 — any second founding row is definitionally corruption", () => {
    expect(CORRUPTED_FOUNDING_ROW_THRESHOLD).toBe(1);
  });
});

describe("capCorruptedConfidence", () => {
  it("leaves a clean single-founding situation untouched (not corrupted)", () => {
    const result = capCorruptedConfidence({
      rawConfidence: 92,
      foundingRowCount: 1,
      baseline: 60,
    });
    expect(result).toEqual({ confidence: 92, capped: false, corrupted: false });
  });

  it("treats a second founding row as corrupted and caps to the baseline", () => {
    const result = capCorruptedConfidence({
      rawConfidence: 92,
      foundingRowCount: 2,
      baseline: 60,
    });
    expect(result).toEqual({ confidence: 60, capped: true, corrupted: true });
  });

  it("caps a heavily corrupted situation down to the baseline", () => {
    const result = capCorruptedConfidence({
      rawConfidence: 92,
      foundingRowCount: 46,
      baseline: 60,
    });
    expect(result).toEqual({ confidence: 60, capped: true, corrupted: true });
  });

  it("never raises confidence — a corrupted situation below baseline is left as-is but still flagged corrupted", () => {
    const result = capCorruptedConfidence({
      rawConfidence: 40,
      foundingRowCount: 46,
      baseline: 60,
    });
    expect(result).toEqual({ confidence: 40, capped: false, corrupted: true });
  });

  it("flags corruption even when no baseline exists for the cohort (no cap applied)", () => {
    const result = capCorruptedConfidence({
      rawConfidence: 92,
      foundingRowCount: 454,
      baseline: null,
    });
    expect(result).toEqual({ confidence: 92, capped: false, corrupted: true });
  });

  it("respects an explicit threshold override", () => {
    expect(capCorruptedConfidence({ rawConfidence: 92, foundingRowCount: 3, baseline: 60, threshold: 2 }))
      .toEqual({ confidence: 60, capped: true, corrupted: true });
    expect(capCorruptedConfidence({ rawConfidence: 92, foundingRowCount: 2, baseline: 60, threshold: 2 }))
      .toEqual({ confidence: 92, capped: false, corrupted: false });
  });
});

describe("resolveHeadlineConfidence (official-confirmation override gated by corruption)", () => {
  it("lifts a clean official situation to 100", () => {
    const confidence = resolveHeadlineConfidence({
      rawConfidence: 80,
      corrupted: false,
      lifecycleState: "official",
      hasOfficialConfirmation: true,
      hasContradiction: false,
    });
    expect(confidence).toBe(100);
  });

  it("lifts a clean confirmed+officially-confirmed situation to 100", () => {
    const confidence = resolveHeadlineConfidence({
      rawConfidence: 80,
      corrupted: false,
      lifecycleState: "confirmed",
      hasOfficialConfirmation: true,
      hasContradiction: false,
    });
    expect(confidence).toBe(100);
  });

  it("does NOT lift a corrupted official situation to 100 — it stays at the capped value", () => {
    const confidence = resolveHeadlineConfidence({
      rawConfidence: 60, // already capped to baseline
      corrupted: true,
      lifecycleState: "official",
      hasOfficialConfirmation: true,
      hasContradiction: false,
    });
    expect(confidence).not.toBe(100);
    expect(confidence).toBe(60);
  });

  it("does not apply the override when contradicted", () => {
    const confidence = resolveHeadlineConfidence({
      rawConfidence: 70,
      corrupted: false,
      lifecycleState: "confirmed",
      hasOfficialConfirmation: true,
      hasContradiction: true,
    });
    expect(confidence).toBe(70);
  });
});

// End-to-end of the two mapper steps: a corrupted situation that receives an
// official confirmation (official_confirmation factor > 0) must never reach 100.
describe("corrupted + official confirmation composed (mapper flow)", () => {
  it("caps to baseline and the official override does not push to 100", () => {
    const cap = capCorruptedConfidence({
      rawConfidence: 92, // inflated headline on the corrupted situation
      foundingRowCount: 46, // > 1 -> corrupted
      baseline: 60, // clean single-founding baseline
    });
    expect(cap.corrupted).toBe(true);

    // official_confirmation factor > 0 -> hasOfficialConfirmation true
    const confidence = resolveHeadlineConfidence({
      rawConfidence: cap.confidence,
      corrupted: cap.corrupted,
      lifecycleState: "official",
      hasOfficialConfirmation: true,
      hasContradiction: false,
    });

    expect(confidence).not.toBe(100);
    expect(confidence).toBe(60);
  });
});

describe("countFoundingRows", () => {
  it("counts only situation_created events", () => {
    const events = [
      { kind: "situation_created" as const },
      { kind: "situation_matched" as const },
      { kind: "situation_created" as const },
      { kind: "state_changed" as const },
    ];
    expect(countFoundingRows(events)).toBe(2);
  });
});

describe("buildConfidenceBaselines", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    ensureSituationSchema(db);
  });

  it("takes the median confidence of the single-founding cohort per league+type", () => {
    // Three clean (single-founding) NFL/roster situations at 50, 60, 70 -> median 60.
    const scores = [50, 60, 70];
    scores.forEach((score, idx) => {
      const id = `sit-clean-${idx}`;
      insertSituation(makeSituation({ situation_id: id, canonical_hash: `h-${id}` }), db);
      insertFoundingRows(db, id, 1);
      appendSituationSnapshot(makeSnapshot(id, score), db);
    });

    // A corrupted situation (many founding rows) must NOT pollute the baseline.
    insertSituation(makeSituation({ situation_id: "sit-corrupt", canonical_hash: "h-corrupt" }), db);
    insertFoundingRows(db, "sit-corrupt", 46);
    appendSituationSnapshot(makeSnapshot("sit-corrupt", 99), db);

    const baselines = buildConfidenceBaselines(db);
    expect(baselines.get(confidenceBaselineKey("NFL", "roster"))).toBe(60);
  });

  it("excludes situations with no snapshot from the cohort", () => {
    insertSituation(makeSituation({ situation_id: "sit-no-snap", canonical_hash: "h-no-snap" }), db);
    insertFoundingRows(db, "sit-no-snap", 1);
    // no snapshot appended

    const baselines = buildConfidenceBaselines(db);
    expect(baselines.has(confidenceBaselineKey("NFL", "roster"))).toBe(false);
  });

  it("produces the baseline that caps a corrupted situation of the same cohort", () => {
    ["sit-a", "sit-b"].forEach((id, idx) => {
      insertSituation(makeSituation({ situation_id: id, canonical_hash: `h-${id}` }), db);
      insertFoundingRows(db, id, 1);
      appendSituationSnapshot(makeSnapshot(id, idx === 0 ? 55 : 65), db);
    });

    const baselines = buildConfidenceBaselines(db);
    const baseline = baselines.get(confidenceBaselineKey("NFL", "roster"));
    const result = capCorruptedConfidence({ rawConfidence: 98, foundingRowCount: 454, baseline });
    expect(result.capped).toBe(true);
    expect(result.confidence).toBe(65); // median of [55, 65] with floor(n/2) tiebreak
  });
});
