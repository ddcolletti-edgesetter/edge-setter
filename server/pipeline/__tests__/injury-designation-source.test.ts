import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

import {
  isOfficialInjuryDesignationSource,
  formatInjuryDesignationSource,
} from "../../../shared/injury-designation-source";

/**
 * Injury designation, part 2: provenance.
 *
 *   - live_signals.injury_designation_source records where the designation came
 *     from ("<source_type>:<source_id>:<league>:payload.<field>").
 *   - "confirmed" / "Consensus" / 88 and "confirmed scratch" need an OUT from
 *     an official structured feed: ESPN NFL, ESPN NBA, balldontlie, MLB
 *     StatsAPI. Not ESPN CFB, not manual, not text.
 *   - DNP is not OUT.
 *   - A merged event without a designation keeps the existing one and its source.
 *   - ESPN NBA and balldontlie store "Day-to-day", not "Questionable".
 *
 * Same isolated-pipeline.db harness as injury-designation-default.test.ts.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-injury-source-"));
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
type RawEvent = TypesMod["RawEvent"];

let store: StoreMod;
let processor: ProcessorMod;
let seq = 0;

function raw(
  sourceType: RawEvent["source_type"],
  sourceId: string,
  payload: Record<string, unknown>,
  opts: { player?: string; league?: string; team?: string; eventType?: string } = {},
): RawEvent {
  seq++;
  return {
    id: `raw_${seq}_${Math.floor(Math.random() * 1e9)}`,
    source_id: sourceId,
    source_type: sourceType,
    league: opts.league ?? "NFL",
    game_id: null,
    team: opts.team ?? "KC",
    player: opts.player ?? `Player ${seq}`,
    event_type: opts.eventType ?? "injury_update",
    payload,
    processed: false,
    processed_at: null,
    created_at: new Date().toISOString(),
    received_at: new Date().toISOString(),
  } as RawEvent;
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
});

describe("isOfficialInjuryDesignationSource", () => {
  const src = (sourceType: string, sourceId: string, league: string, field = "designation") =>
    formatInjuryDesignationSource({ sourceType, sourceId, league, field });

  it("accepts the four league feeds' structured fields", () => {
    expect(isOfficialInjuryDesignationSource(src("api", "espn", "NFL"))).toBe(true);
    expect(isOfficialInjuryDesignationSource(src("api", "espn", "NBA", "status"))).toBe(true);
    expect(isOfficialInjuryDesignationSource(src("api", "balldontlie", "NBA"))).toBe(true);
    expect(isOfficialInjuryDesignationSource(src("api", "mlb_statsapi", "MLB"))).toBe(true);
  });

  it("rejects ESPN CFB, manual, text, other fields and NULL", () => {
    expect(isOfficialInjuryDesignationSource(src("api", "espn", "CFB"))).toBe(false);
    expect(isOfficialInjuryDesignationSource(src("manual", "espn", "NFL"))).toBe(false);
    expect(isOfficialInjuryDesignationSource(src("rss", "rss_espn_nfl", "NFL", "status"))).toBe(false);
    expect(isOfficialInjuryDesignationSource(src("api", "espn", "NFL", "injury_designation"))).toBe(false);
    expect(isOfficialInjuryDesignationSource(src("api", "mlb_statsapi", "MLB", "il_type"))).toBe(false);
    expect(isOfficialInjuryDesignationSource(null)).toBe(false);
    expect(isOfficialInjuryDesignationSource(undefined)).toBe(false);
    expect(isOfficialInjuryDesignationSource("garbage")).toBe(false);
  });
});

describe("the processor writes injury_designation_source", () => {
  it("records source type, id, league and the payload field, and reads it back", async () => {
    const espn = await processor.processOne(raw("api", "espn", { designation: "Questionable", status: "Questionable" }));
    expect(espn?.injury_designation_source).toBe("api:espn:NFL:payload.designation");
    expect(store.getLiveSignal(espn!.id)?.injury_designation_source).toBe("api:espn:NFL:payload.designation");

    const statusOnly = await processor.processOne(raw("manual", "operator", { status: "OUT" }));
    expect(statusOnly?.injury_designation_source).toBe("manual:operator:NFL:payload.status");
  });

  it("stores NULL when there is no designation", async () => {
    const text = await processor.processOne(raw("rss", "rss_espn_nfl", { headline: "hurt" }));
    expect(text?.injury_designation).toBeNull();
    expect(store.getLiveSignal(text!.id)?.injury_designation_source).toBeNull();
  });
});

describe("handleInjuryUpdate: confirmed only for an official structured OUT", () => {
  const fields = (r: RawEvent) => processor.routeEventToFields(r);

  it("ESPN NFL / ESPN NBA / balldontlie / MLB StatsAPI OUT is confirmed, Consensus, 88", () => {
    for (const r of [
      raw("api", "espn", { designation: "OUT" }),
      raw("api", "espn", { designation: "OUT" }, { league: "NBA", team: "LAL" }),
      raw("api", "balldontlie", { designation: "OUT" }, { league: "NBA", team: "LAL" }),
      raw("api", "mlb_statsapi", { designation: "IL-60" }, { league: "MLB", team: "NYY" }),
    ]) {
      const f = fields(r);
      expect(f.verdict, r.source_id).toBe("confirmed");
      expect(f.confirmation_strength).toBe("Consensus");
      expect(f.confidence).toBe(88);
      expect(f.why_it_matters).toMatch(/confirmed scratch/);
    }
  });

  it("ESPN CFB, manual and status-less OUTs are likely / Developing / 65", () => {
    for (const r of [
      raw("api", "espn", { designation: "OUT" }, { league: "CFB", team: "UGA" }),
      raw("manual", "espn", { designation: "OUT" }),
      raw("rss", "rss_x", { status: "OUT" }),
    ]) {
      const f = fields(r);
      expect(f.verdict, `${r.source_type}/${r.league}`).toBe("likely");
      expect(f.confirmation_strength).toBe("Developing");
      expect(f.confidence).toBe(65);
      expect(f.why_it_matters).not.toMatch(/confirmed scratch/);
      expect(f.why_it_matters).toMatch(/official injury report has not confirmed/);
    }
  });

  it("a payload's own confidence / confirmation still wins over the defaults", () => {
    const f = fields(raw("api", "espn", { designation: "OUT", confidence: 84, confirmation: "Corroborated" }));
    expect(f.confidence).toBe(84);
    expect(f.confirmation_strength).toBe("Corroborated");
    expect(f.verdict).toBe("confirmed");
  });

  it("DNP is a practice code, not OUT", () => {
    const f = fields(raw("api", "espn", { designation: "DNP" }));
    expect(f.verdict).toBe("likely");
    expect(f.action_note).toMatch(/^Monitor status/);
    expect(f.why_it_matters).not.toMatch(/confirmed scratch|reported DNP/);
  });
});

describe("merging into an existing injury row", () => {
  it("a later event without a designation keeps the feed's designation and source", async () => {
    const first = await processor.processOne(raw("api", "espn", { designation: "OUT" }, { player: "Merge Guy" }));
    const second = await processor.processOne(
      raw("rss", "rss_x", { headline: "Merge Guy remains sidelined" }, { player: "Merge Guy" }),
    );
    expect(second?.id).toBe(first?.id);
    const stored = store.getLiveSignal(first!.id)!;
    expect(stored.injury_designation).toBe("OUT");
    expect(stored.injury_designation_source).toBe("api:espn:NFL:payload.designation");
  });

  it("a later contradicting text story keeps the designation; its prose lands in body for the client gate", async () => {
    const first = await processor.processOne(raw("api", "espn", { designation: "OUT" }, { player: "Cleared Guy" }));
    await processor.processOne(
      raw("rss", "rss_x", { notes: "Cleared Guy has been cleared to return." }, { player: "Cleared Guy" }),
    );
    const stored = store.getLiveSignal(first!.id)!;
    expect(stored.injury_designation).toBe("OUT");
    expect(stored.body).toBe("Cleared Guy has been cleared to return.");
  });

  it("a later designation replaces the stored one, with its own source", async () => {
    const first = await processor.processOne(raw("rss", "rss_x", { status: "OUT" }, { player: "Swap Guy" }));
    await processor.processOne(raw("api", "espn", { designation: "Doubtful" }, { player: "Swap Guy" }));
    const stored = store.getLiveSignal(first!.id)!;
    expect(stored.injury_designation).toBe("Doubtful");
    expect(stored.injury_designation_source).toBe("api:espn:NFL:payload.designation");
  });

  it("does not carry a designation forward on a transaction row", () => {
    const merged = processor.mergeInjuryDesignation(
      { injury_designation: "IL-60", injury_designation_source: "api:mlb_statsapi:MLB:payload.designation" },
      { signal_type: "transaction", injury_designation: undefined, injury_designation_source: null },
    );
    expect(merged).toEqual({ injury_designation: null, injury_designation_source: null });
  });
});

describe("NBA adapters keep Day-to-day", () => {
  it("ESPN NBA and balldontlie store Day-to-day, not Questionable", async () => {
    const espnNba = await import("../adapters/espn-nba");
    const bdl = await import("../adapters/balldontlie");
    for (const normalize of [espnNba.normalizeDesignation, bdl.normalizeDesignation]) {
      expect(normalize("Day-To-Day")).toBe("Day-to-day");
      expect(normalize("Questionable")).toBe("Questionable");
      expect(normalize("Out")).toBe("OUT");
    }
  });
});
