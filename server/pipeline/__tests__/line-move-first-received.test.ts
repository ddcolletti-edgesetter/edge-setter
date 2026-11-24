import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * line_move_first_received_at — how old the line a line-move story prints
 * really is. See attachLineMoveFirstReceivedAt in store.ts.
 *
 * What this suite holds down:
 *   1. It is the first receipt of the CURRENT line for the signal's game and
 *      market, not the signal's founding time and not the first move ever.
 *   2. A re-poll that re-inserts the same line does not make it newer.
 *   3. A line that returns to an earlier value is dated from its return.
 *   4. The market comes from the signal's own newest raw row, so a signal whose
 *      last move was a total is not dated off the spread.
 *   5. Non-line-move signals, and signals with no surviving market row, get
 *      null — never a fallback.
 *   6. The lookup is served by the partial index, not a scan.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-line-move-age-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;

vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
}));

type StoreMod = typeof import("../store");
let store: StoreMod;

beforeAll(async () => {
  store = await import("../store");
});

beforeEach(() => {
  const db = store.getPipelineDb();
  db.prepare("DELETE FROM raw_events").run();
});

let seq = 0;
function rawMove(gameId: string, market: string | null, currentLine: number, receivedAt: string, id = `rm-${++seq}`) {
  const payload: Record<string, unknown> = { open_line: 3, current_line: currentLine };
  if (market) payload.market = market;
  store.getPipelineDb().prepare(`
    INSERT INTO raw_events (id, source_id, source_type, league, game_id, team, player, event_type, payload, processed, created_at, received_at)
    VALUES (?, 'the_odds_api', 'api', 'NFL', ?, 'KC', NULL, 'line_move', ?, 1, ?, ?)
  `).run(id, gameId, JSON.stringify(payload), receivedAt, receivedAt);
  return id;
}

function signal(over: Record<string, unknown>) {
  return {
    id: "sig-1",
    league: "NFL",
    game_id: "g1",
    signal_type: "line_move",
    raw_event_ids: [],
    signal_time: "2026-11-01T00:00:00.000Z",
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-22T00:00:00.000Z",
    ...over,
  } as any;
}

describe("line_move_first_received_at", () => {
  it("is the first receipt of the current line, not the founding time or the first move", () => {
    const a = rawMove("g1", "spread", 3.5, "2026-11-18T10:00:00.000Z");
    rawMove("g1", "spread", 4, "2026-11-20T10:00:00.000Z");
    const [out] = store.attachLineMoveFirstReceivedAt([signal({ raw_event_ids: [a] })]);
    expect(out.line_move_first_received_at).toBe("2026-11-20T10:00:00.000Z");
  });

  it("does not move forward on a re-insert of the same line", () => {
    const a = rawMove("g1", "spread", 4, "2026-11-20T10:00:00.000Z");
    rawMove("g1", "spread", 4, "2026-11-21T10:00:00.000Z");
    rawMove("g1", "spread", 4, "2026-11-22T10:00:00.000Z");
    const [out] = store.attachLineMoveFirstReceivedAt([signal({ raw_event_ids: [a] })]);
    expect(out.line_move_first_received_at).toBe("2026-11-20T10:00:00.000Z");
  });

  it("dates a line that came back to an earlier value from its return", () => {
    const a = rawMove("g1", "spread", 4, "2026-11-18T10:00:00.000Z");
    rawMove("g1", "spread", 4.5, "2026-11-19T10:00:00.000Z");
    rawMove("g1", "spread", 4, "2026-11-21T10:00:00.000Z");
    const [out] = store.attachLineMoveFirstReceivedAt([signal({ raw_event_ids: [a] })]);
    expect(out.line_move_first_received_at).toBe("2026-11-21T10:00:00.000Z");
  });

  it("takes the market from the signal's own newest raw row", () => {
    const s1 = rawMove("g1", "spread", 4, "2026-11-18T10:00:00.000Z");
    rawMove("g1", "spread", 4.5, "2026-11-22T10:00:00.000Z");
    const t1 = rawMove("g1", "total", 47.5, "2026-11-20T10:00:00.000Z");
    const [out] = store.attachLineMoveFirstReceivedAt([signal({ raw_event_ids: [s1, t1] })]);
    expect(out.line_move_first_received_at).toBe("2026-11-20T10:00:00.000Z");
  });

  it("does not mix games", () => {
    const a = rawMove("g1", "spread", 4, "2026-11-18T10:00:00.000Z");
    rawMove("g2", "spread", 4.5, "2026-11-22T10:00:00.000Z");
    const [out] = store.attachLineMoveFirstReceivedAt([signal({ raw_event_ids: [a] })]);
    expect(out.line_move_first_received_at).toBe("2026-11-18T10:00:00.000Z");
  });

  it("is null for other signal types and when no own row carries a market", () => {
    const noMarket = rawMove("g1", null, 4, "2026-11-20T10:00:00.000Z");
    rawMove("g1", "spread", 4, "2026-11-21T10:00:00.000Z");
    const out = store.attachLineMoveFirstReceivedAt([
      signal({ id: "a", raw_event_ids: [noMarket] }),
      signal({ id: "b", raw_event_ids: ["gone"] }),
      signal({ id: "c", signal_type: "injury_update", raw_event_ids: [] }),
      signal({ id: "d", game_id: null }),
    ]);
    expect(out.map((s) => s.line_move_first_received_at)).toEqual([null, null, null, null]);
  });

  it("reads through the partial index", () => {
    const plan = store.getPipelineDb().prepare(`
      EXPLAIN QUERY PLAN
      SELECT id FROM raw_events INDEXED BY idx_raw_events_line_move_game
      WHERE event_type = 'line_move' AND game_id IN (?, ?)
      ORDER BY game_id, received_at DESC, id DESC
    `).all("g1", "g2") as Array<{ detail: string }>;
    expect(plan.map((row) => row.detail).join(" | ")).toMatch(/idx_raw_events_line_move_game/);
  });
});
