import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * handleInjuryUpdate no longer invents "Questionable".
 *
 * Until this change the processor stored
 *     p.designation ?? p.status ?? "Questionable"
 * so every text-classified injury story (sports-rss, x-twitter, 247sports,
 * on3, cfb-school-sid, the vision agent) was stored with a designation no
 * source gave, byte-identical to ESPN's real one. Now:
 *   - no designation / status in the payload → injury_designation is NULL, and
 *     no prose field prints "Questionable" or "null";
 *   - a real designation is stored as sent;
 *   - "is a confirmed scratch" is written only when the OUT comes as a
 *     structured status from a league data feed (source_type "api"), never
 *     from a manual payload or text.
 *
 * Runs the real processOne → upsertLiveSignal path against an isolated
 * pipeline.db (same harness as injury-dedup-window.test.ts).
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-injury-default-"));
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
let seq = 0;

function raw(
  sourceType: TypesMod["RawEvent"]["source_type"],
  sourceId: string,
  payload: Record<string, unknown>,
  player = `Player ${++seq}`,
): TypesMod["RawEvent"] {
  return {
    id: `raw_${seq}_${Math.floor(Math.random() * 1e9)}`,
    source_id: sourceId,
    source_type: sourceType,
    league: "NFL",
    game_id: null,
    team: "KC",
    player,
    event_type: "injury_update",
    payload,
    processed: false,
    processed_at: null,
    created_at: new Date().toISOString(),
    received_at: new Date().toISOString(),
  } as TypesMod["RawEvent"];
}

const prose = (s: { headline: string; body: string; action_note: string; why_it_matters: string }) =>
  [s.headline, s.body, s.action_note, s.why_it_matters].join(" | ");

beforeAll(async () => {
  store = await import("../store");
  processor = await import("../processor");
});

beforeEach(() => {
  const db = store.getPipelineDb();
  for (const t of ["live_signals", "signal_detections", "signal_state_history"]) {
    try { db.prepare(`DELETE FROM ${t}`).run(); } catch { /* table may not exist yet */ }
  }
});

describe("payloadInjuryDesignation", () => {
  it("takes designation, then status, and treats blank or non-string as absent", () => {
    expect(processor.payloadInjuryDesignation({ designation: "OUT", status: "Out" })).toBe("OUT");
    expect(processor.payloadInjuryDesignation({ status: "Doubtful" })).toBe("Doubtful");
    expect(processor.payloadInjuryDesignation({ designation: "   ", status: "" })).toBeNull();
    expect(processor.payloadInjuryDesignation({ designation: 3 })).toBeNull();
    expect(processor.payloadInjuryDesignation({ headline: "x" })).toBeNull();
    expect(processor.payloadInjuryDesignation(null)).toBeNull();
  });
});

describe("handleInjuryUpdate stores no default designation", () => {
  it("a text-classified story with no designation stores NULL, and no prose says Questionable or null", async () => {
    const signal = await processor.processOne(
      raw("rss", "rss_espn_nfl", { headline: "Chiefs WR hurt in practice", source_types: ["rss"] }, "Test Receiver"),
    );
    expect(signal?.injury_designation).toBeNull();
    const stored = store.getLiveSignal(signal!.id)!;
    expect(stored.injury_designation).toBeNull();
    expect(prose(stored)).not.toMatch(/questionable|\bnull\b|undefined/i);
    expect(stored.headline).toBe("Test Receiver — injury report");
    expect(stored.why_it_matters).not.toMatch(/confirmed scratch/i);
  });

  it("keeps the body part when the payload has one", async () => {
    const signal = await processor.processOne(raw("rss", "rss_x", { body_part: "ankle" }, "Ankle Guy"));
    expect(signal?.headline).toBe("Ankle Guy (ankle) — injury report");
    expect(signal?.body).toBe("Ankle Guy injury report — ankle; no designation given.");
  });

  it("stores a real designation as sent", async () => {
    const signal = await processor.processOne(
      raw("api", "espn", { designation: "Questionable", status: "Questionable", body_part: "knee" }),
    );
    expect(signal?.injury_designation).toBe("Questionable");
    expect(signal?.headline).toMatch(/— Questionable$/);
  });

  it("writes 'confirmed scratch' only for a structured OUT from a league data feed", async () => {
    const espn = await processor.processOne(raw("api", "espn", { designation: "OUT", status: "Out" }, "Feed Out"));
    expect(espn?.why_it_matters).toBe("Feed Out is a confirmed scratch — direct market impact expected.");

    const manual = await processor.processOne(raw("manual", "operator", { status: "OUT" }, "Manual Out"));
    expect(manual?.injury_designation).toBe("OUT");
    expect(manual?.why_it_matters).not.toMatch(/confirmed scratch/i);
    expect(manual?.why_it_matters).toMatch(/official injury report has not confirmed/i);
  });
});

describe("the NBA ingestion dedup key", () => {
  it("a text story no longer occupies the key ESPN's real Questionable uses", async () => {
    // Before: text rows were stored "Questionable", so loadInjuryDedupKeys held
    // "<player>_Questionable" and espn-nba skipped ESPN's genuine report.
    const nba = { ...raw("rss", "rss_x", { headline: "x" }, "Hoops Player"), league: "NBA" as const, team: "LAL" };
    await processor.processOne(nba);
    const keys = await store.loadInjuryDedupKeys("NBA");
    expect(keys.has("Hoops Player_Questionable")).toBe(false);
    expect(keys.has("Hoops Player_")).toBe(true);
  });
});
