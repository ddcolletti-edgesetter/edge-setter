import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Regression for the per-SignalType dedup lookback (item 4 investigation,
 * Aug 25 2026).
 *
 * The processor reuses an existing signal's id when the same
 * league/team/player/signal_type was seen inside a lookback window, so the
 * upsert MERGES a revision onto the prior row instead of forking a new one.
 * That window used to be a flat 4h for every type. Real injury reports arrive
 * Friday and get revised on Sunday gameday — a gap well past 4h — so
 * legitimate revisions were forking into duplicate rows. injury_update's
 * window is now widened to 24h; every other type keeps the 4h default.
 *
 * These tests exercise the real merge path (processOne → findExistingSignal →
 * upsertLiveSignal) against an isolated pipeline.db, seeding the prior signal
 * with a controlled created_at so the age gap is exact.
 *
 * Setup notes:
 *  - PIPELINE_DATA_DIR is pointed at a throwaway dir BEFORE store.ts is
 *    imported, so getPipelineDb() builds a fresh, isolated pipeline.db.
 *  - ../../storage is mocked (store pulls backfill helpers; processor calls
 *    storage.recordSignalStateTransition) so the real app DB is never opened.
 *  - ../../agents is mocked so importing the processor doesn't pull in the
 *    agent/retrieval graph; sourceScorerOnOutcome is never called here anyway
 *    (CANONICAL_SITUATIONS_ENABLED is unset).
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-injury-dedup-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;

vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
  storage: { recordSignalStateTransition: vi.fn() },
}));

vi.mock("../../agents", () => ({
  sourceScorerOnOutcome: vi.fn(() => Promise.resolve()),
}));

type StoreMod = typeof import("../store");
type ProcessorMod = typeof import("../processor");
type TypesMod = typeof import("../types");

let store: StoreMod;
let processor: ProcessorMod;

const HOUR_MS = 60 * 60 * 1000;
const LEAGUE = "NBA";
const TEAM = "LAL";
const PLAYER = "Test Player";

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * HOUR_MS).toISOString();
}

/** Seed a prior live signal of the given type at a controlled created_at. */
function seedSignal(signalType: string, createdAt: string): string {
  const id = `seed_${signalType}_${createdAt}`;
  store.upsertLiveSignal({
    id,
    league: LEAGUE,
    game_id: null,
    signal_type: signalType,
    headline: "seeded",
    body: "",
    action_note: "",
    why_it_matters: "",
    team: TEAM,
    player: PLAYER,
    matchup: null,
    sources: [{ name: "seed wire", type: "wire_service" }],
    source_count: 1,
    verdict: "likely",
    confidence: 65,
    confirmation_strength: "Developing",
    line_movement: null,
    injury_designation: signalType === "injury_update" ? "Questionable" : null,
    lineup_status: signalType === "lineup_confirm" ? "confirmed" : null,
    weather_note: null,
    betting_relevance: true,
    fantasy_relevance: true,
    score: 60,
    score_band: "moderate",
    urgency_label: "",
    urgency_reason: "",
    trust_label: "",
    score_explanation: "",
    breakdown: {},
    raw_event_ids: [],
    signal_time: createdAt,
    first_seen_at: createdAt,
    created_at: createdAt,
    updated_at: createdAt,
    outcome_id: null,
  } as any);
  return id;
}

function makeRaw(eventType: string): TypesMod["RawEvent"] {
  return {
    id: `raw_${eventType}_${Math.floor(Math.random() * 1e9)}`,
    source_id: "espn",
    source_type: "wire_service",
    league: LEAGUE,
    game_id: null,
    team: TEAM,
    player: PLAYER,
    event_type: eventType as any,
    payload: {},
    processed: false,
    processed_at: null,
    created_at: new Date().toISOString(),
    received_at: new Date().toISOString(),
  } as any;
}

beforeAll(async () => {
  store = await import("../store");
  processor = await import("../processor");
});

beforeEach(() => {
  const db = store.getPipelineDb();
  for (const t of ["live_signals", "signal_detections", "signal_state_history"]) {
    try { db.prepare(`DELETE FROM ${t}`).run(); } catch { /* table may not exist yet */ }
  }
  vi.clearAllMocks();
});

describe("injury_update dedup window (24h)", () => {
  it("merges a revision 6h after the prior injury_update (shares signal_id)", async () => {
    const seededId = seedSignal("injury_update", isoHoursAgo(6));

    const signal = await processor.processOne(makeRaw("injury_update"));

    expect(signal).not.toBeNull();
    // 6h < 24h window → reuse the existing id (merge, not fork).
    expect(signal!.id).toBe(seededId);

    const rows = store.getLiveSignals({ league: LEAGUE, includeArchived: true });
    expect(rows).toHaveLength(1);
  });

  it("does NOT merge a revision 30h after the prior injury_update (new signal_id)", async () => {
    const seededId = seedSignal("injury_update", isoHoursAgo(30));

    const signal = await processor.processOne(makeRaw("injury_update"));

    expect(signal).not.toBeNull();
    // 30h > 24h window → the prior row is out of range, so a fresh signal forks.
    expect(signal!.id).not.toBe(seededId);

    const rows = store.getLiveSignals({ league: LEAGUE, includeArchived: true });
    expect(rows).toHaveLength(2);
  });

  it("is type-specific: a non-injury type 6h apart still forks (4h default window)", async () => {
    // Proves the 6h merge above is due to injury_update's widened window, not a
    // universal change — lineup_confirm keeps the 4h default.
    const seededId = seedSignal("lineup_confirm", isoHoursAgo(6));

    const signal = await processor.processOne(makeRaw("lineup_confirm"));

    expect(signal).not.toBeNull();
    // 6h > 4h default window → fork.
    expect(signal!.id).not.toBe(seededId);

    const rows = store.getLiveSignals({ league: LEAGUE, includeArchived: true });
    expect(rows).toHaveLength(2);
  });
});
