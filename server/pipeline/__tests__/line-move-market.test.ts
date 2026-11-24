import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * live_signals.market for line_move signals.
 *
 * The odds adapter emits a spread move and a total move with the same team
 * (always the home team), the same signal_type and no player. The dedup
 * fingerprint was league + team + player + signal_type, so inside the 4h
 * window the two folded into one row, the later move overwrote
 * line_movement, and handleLineMove dropped payload.market, so nothing on the
 * signal recorded which market it was. Settlement then graded every line move
 * as a spread.
 *
 * Now the handler stores the market, and a line_move only merges onto a row of
 * the same market. These tests run the real path (processOne ->
 * findExistingSignal -> upsertLiveSignal) against an isolated pipeline.db.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-line-move-market-"));
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

const LEAGUE = "NFL";
const HOME = "KC";
const GAME = "NFL_2026-11-29_BUF_KC";

let seq = 0;
function oddsRaw(eventType: "line_move" | "odds_open", payload: Record<string, unknown>): TypesMod["RawEvent"] {
  seq++;
  return {
    id: `raw_${eventType}_${seq}`,
    source_id: "the_odds_api",
    source_type: "api",
    league: LEAGUE,
    game_id: GAME,
    team: HOME,
    player: null,
    event_type: eventType,
    payload: { matchup: "BUF @ KC", bookmaker: "draftkings", ...payload },
    processed: false,
    processed_at: null,
    created_at: new Date().toISOString(),
    received_at: new Date().toISOString(),
  } as any;
}

const spreadMove = (open: number, current: number) =>
  oddsRaw("line_move", { open_line: open, current_line: current, line_delta: Math.abs(current - open), market: "spread" });
const totalMove = (open: number, current: number) =>
  oddsRaw("line_move", { open_line: open, current_line: current, line_delta: Math.abs(current - open), market: "total" });

function lineMoveRows() {
  return store.getLiveSignals({ league: LEAGUE, includeArchived: true })
    .filter((s) => s.signal_type === "line_move");
}

function marketColumn(id: string): unknown {
  const row = store.getPipelineDb().prepare("SELECT market FROM live_signals WHERE id = ?").get(id) as { market: unknown };
  return row.market;
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

describe("line_move market is stored", () => {
  it("stores payload.market on the signal row", async () => {
    const spread = await processor.processOne(spreadMove(-3, -4.5));
    const total = await processor.processOne(totalMove(47.5, 46));

    expect(marketColumn(spread!.id)).toBe("spread");
    expect(marketColumn(total!.id)).toBe("total");
    // Read back through the store's own deserializer too.
    expect(store.getLiveSignal(spread!.id)!.market).toBe("spread");
  });

  it("stores NULL, not a guess, when the payload names no market or an unknown one", async () => {
    const none = await processor.processOne(oddsRaw("line_move", { open_line: -3, current_line: -4 }));
    expect(marketColumn(none!.id)).toBeNull();

    store.getPipelineDb().prepare("DELETE FROM live_signals").run();
    const h2h = await processor.processOne(oddsRaw("line_move", { open_line: -3, current_line: -4, market: "h2h" }));
    expect(marketColumn(h2h!.id)).toBeNull();
  });

  it("gives an opener the spread market, and no market when it has no spread", async () => {
    const opener = await processor.processOne(oddsRaw("odds_open", { open_spread: -3, open_total: 47.5 }));
    expect(opener!.signal_type).toBe("line_move");
    expect(marketColumn(opener!.id)).toBe("spread");

    store.getPipelineDb().prepare("DELETE FROM live_signals").run();
    const totalOnly = await processor.processOne(oddsRaw("odds_open", { open_spread: null, open_total: 47.5 }));
    expect(marketColumn(totalOnly!.id)).toBeNull();
  });

  it("leaves market NULL on every non-line_move signal", async () => {
    const injury = await processor.processOne({
      ...oddsRaw("line_move", {}),
      source_id: "espn", event_type: "injury_update", player: "Test Player",
      payload: { designation: "OUT", market: "spread" },
    } as any);
    expect(injury!.signal_type).toBe("injury_update");
    expect(marketColumn(injury!.id)).toBeNull();
  });
});

describe("line_move dedup is per market", () => {
  it("a spread move and a total move for the same home team are two signals", async () => {
    const spread = await processor.processOne(spreadMove(-3, -4.5));
    const total = await processor.processOne(totalMove(47.5, 46));

    expect(total!.id).not.toBe(spread!.id);
    const rows = lineMoveRows();
    expect(rows).toHaveLength(2);
    // Neither move overwrote the other's line_movement.
    expect(store.getLiveSignal(spread!.id)!.line_movement).toMatchObject({ open: -3, current: -4.5 });
    expect(store.getLiveSignal(total!.id)!.line_movement).toMatchObject({ open: 47.5, current: 46 });
  });

  it("a second spread move still merges onto the first", async () => {
    const first = await processor.processOne(spreadMove(-3, -4));
    const second = await processor.processOne(spreadMove(-3, -4.5));

    expect(second!.id).toBe(first!.id);
    expect(lineMoveRows()).toHaveLength(1);
    expect(store.getLiveSignal(first!.id)!.line_movement).toMatchObject({ current: -4.5 });
    expect(marketColumn(first!.id)).toBe("spread");
  });

  it("a spread opener merges with a later spread move, not with a total move", async () => {
    const opener = await processor.processOne(oddsRaw("odds_open", { open_spread: -3, open_total: 47.5 }));
    const total = await processor.processOne(totalMove(47.5, 46));
    const spread = await processor.processOne(spreadMove(-3, -4.5));

    expect(total!.id).not.toBe(opener!.id);
    expect(spread!.id).toBe(opener!.id);
    expect(lineMoveRows()).toHaveLength(2);
  });

  it("never merges a new move onto a pre-column row whose market is NULL", async () => {
    // A line_move row written before this column existed: market NULL.
    const legacy = await processor.processOne(oddsRaw("line_move", { open_line: -3, current_line: -4 }));
    expect(marketColumn(legacy!.id)).toBeNull();

    const spread = await processor.processOne(spreadMove(-3, -4.5));
    expect(spread!.id).not.toBe(legacy!.id);
    // The legacy row is untouched: still NULL, still its own line_movement.
    expect(marketColumn(legacy!.id)).toBeNull();
    expect(store.getLiveSignal(legacy!.id)!.line_movement).toMatchObject({ current: -4 });
  });
});

describe("findExistingSignal market term", () => {
  it("adds no market condition unless one is asked for", () => {
    const db = store.getPipelineDb();
    const proto = Object.getPrototypeOf(db) as Record<string, any>;
    const original = proto.prepare;
    const seen: string[] = [];
    proto.prepare = function (this: unknown, sql: string, ...rest: unknown[]) {
      seen.push(sql);
      return original.call(this, sql, ...rest);
    };
    try {
      store.findExistingSignal({ league: LEAGUE, team: HOME, player: null, signal_type: "injury_update" });
      store.findExistingSignal({ league: LEAGUE, team: HOME, player: null, signal_type: "line_move", market: "total" });
      store.findExistingSignal({ league: LEAGUE, team: HOME, player: null, signal_type: "line_move", market: null });
    } finally {
      proto.prepare = original;
    }
    const lookups = seen.filter((sql) => sql.includes("FROM live_signals"));
    expect(lookups[0]).not.toContain("market");
    expect(lookups[1]).toContain("market=?");
    expect(lookups[2]).toContain("market IS NULL");
  });
});
