import { describe, expect, it, beforeAll, beforeEach, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Regression for the ESPN CFB daily injury churn (fix/espn-cfb-injury-churn).
 *
 * The CFB twin of espn-injury-daily-churn.test.ts. espn-cfb.ts carried both
 * faults the NFL adapter had:
 *   - a dedup key containing ESPN's report date, which never matches once ESPN
 *     re-dates an unchanged injury — one new raw_event per listed player per
 *     day, the churn that grew situation_events to ~1.1GB on NFL, and
 *   - the pre-#64 getRawEvents({ league: "CFB", limit: 1000 }) window, which
 *     read a thousand full rows and JSON.parsed every payload each cycle, and
 *     whose ceiling let older injuries fall out and be re-created.
 * CFB injuries run on every ingestion cycle (ingestion.ts), same as NFL.
 *
 * Setup mirrors the NFL file: PIPELINE_DATA_DIR is redirected to a throwaway
 * dir BEFORE store.ts is imported, ../../storage is mocked so the real app DB
 * is never opened, and global.fetch is stubbed with a controlled ESPN payload.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-espn-cfb-churn-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;

vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
  storage: { recordSignalStateTransition: vi.fn() },
}));

type StoreMod = typeof import("../store");
type AdapterMod = typeof import("../adapters/espn-cfb");

let store: StoreMod;
let adapter: AdapterMod;

const DAY_MS = 24 * 60 * 60 * 1000;
const PLAYER = "Example Tailback";
const TEAM = "ALA";

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

interface FeedRow {
  player?: string;
  team?: string;
  status: string;
  date: string;
}

/** One ESPN /injuries response in its real grouped-by-team shape. */
function injuryFeed(rows: FeedRow[]) {
  return {
    injuries: rows.map((row) => ({
      abbreviation: row.team ?? TEAM,
      displayName: "Alabama Crimson Tide",
      injuries: [{
        date: row.date,
        status: row.status,
        athlete: {
          displayName: row.player ?? PLAYER,
          position: { abbreviation: "RB" },
        },
      }],
    })),
  };
}

function stubFetch(payload: unknown) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    headers: { get: () => null },
  })) as any;
}

/**
 * Every CFB injury raw event on record, oldest first.
 *
 * Ordered by rowid, not received_at: now that received_at is arrival time,
 * rows written in the same test land in the same millisecond and a
 * received_at sort is a tie whose order the DB decides. rowid is the true
 * insertion order — the same property the dedup lookup relies on.
 */
function injuryRawEvents(): Array<{ team: string; player: string; payload: any; received_at: string; created_at: string }> {
  const rows = store.getPipelineDb().prepare(`
    SELECT team, player, payload, received_at, created_at
    FROM raw_events
    WHERE league = 'CFB' AND event_type = 'injury_update'
    ORDER BY rowid ASC
  `).all() as Array<{ team: string; player: string; payload: string; received_at: string; created_at: string }>;
  return rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
}

beforeAll(async () => {
  store = await import("../store");
  adapter = await import("../adapters/espn-cfb");
});

beforeEach(() => {
  const db = store.getPipelineDb();
  try { db.prepare("DELETE FROM raw_events").run(); } catch { /* table may not exist yet */ }
  vi.clearAllMocks();
});

afterAll(() => {
  try { store.getPipelineDb().close(); } catch { /* already closed */ }
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("ESPN CFB injury ingestion dedup", () => {
  it("skips a daily date bump that carries the same designation", async () => {
    stubFetch(injuryFeed([{ status: "Questionable", date: daysAgo(2) }]));
    const first = await adapter.ingestCFBInjuries();
    expect(first.created).toBe(1);

    stubFetch(injuryFeed([{ status: "Questionable", date: daysAgo(1) }]));
    const second = await adapter.ingestCFBInjuries();

    expect(second.created).toBe(0);
    expect(second.skipped).toBe(1);
    expect(second.diagnostics.rows_skipped_unchanged).toBe(1);
    expect(injuryRawEvents()).toHaveLength(1);
  });

  it("stays deduped across many consecutive days of re-reports", async () => {
    stubFetch(injuryFeed([{ status: "Out", date: daysAgo(10) }]));
    await adapter.ingestCFBInjuries();

    for (let day = 9; day >= 1; day--) {
      stubFetch(injuryFeed([{ status: "Out", date: daysAgo(day) }]));
      const run = await adapter.ingestCFBInjuries();
      expect(run.created).toBe(0);
    }

    expect(injuryRawEvents()).toHaveLength(1);
  });

  it("creates a new raw event when the designation changes", async () => {
    stubFetch(injuryFeed([{ status: "Questionable", date: daysAgo(2) }]));
    await adapter.ingestCFBInjuries();

    stubFetch(injuryFeed([{ status: "Out", date: daysAgo(1) }]));
    const second = await adapter.ingestCFBInjuries();

    expect(second.created).toBe(1);
    const events = injuryRawEvents();
    expect(events).toHaveLength(2);
    expect(events.map((event) => (event.payload as any).designation)).toEqual(["Questionable", "OUT"]);
  });

  it("creates a new raw event when the player changes team", async () => {
    stubFetch(injuryFeed([{ status: "Questionable", date: daysAgo(2) }]));
    await adapter.ingestCFBInjuries();

    stubFetch(injuryFeed([{ status: "Questionable", team: "UGA", date: daysAgo(1) }]));
    const second = await adapter.ingestCFBInjuries();

    expect(second.created).toBe(1);
    expect(injuryRawEvents().map((event) => event.team)).toEqual([TEAM, "UGA"]);
  });

  it("de-dupes a player listed twice inside one payload", async () => {
    stubFetch(injuryFeed([
      { status: "Questionable", date: daysAgo(2) },
      { status: "Questionable", date: daysAgo(2) },
    ]));
    const run = await adapter.ingestCFBInjuries();

    expect(run.created).toBe(1);
    expect(injuryRawEvents()).toHaveLength(1);
  });

  it("dedupes against rows older than the retired 1,000-row window", async () => {
    // The old key set was built from the 1,000 most recent CFB rows, so an
    // injury that aged past that ceiling fell out and was re-created every
    // cycle. The indexed per-player lookup has no window at all.
    for (let i = 0; i < 1200; i++) {
      store.insertRawEvent({
        source_id: "espn",
        source_type: "api",
        league: "CFB",
        game_id: null,
        team: "FILLER",
        player: `Filler Player ${i}`,
        event_type: "injury_update",
        payload: { designation: "Questionable", occurred_at: daysAgo(3) },
      } as any);
    }

    stubFetch(injuryFeed([{ status: "Questionable", date: daysAgo(5) }]));
    expect((await adapter.ingestCFBInjuries()).created).toBe(1);

    // 1,200 newer rows now sit on top of it; re-report the original.
    stubFetch(injuryFeed([{ status: "Questionable", date: daysAgo(1) }]));
    const second = await adapter.ingestCFBInjuries();

    expect(second.created).toBe(0);
    expect(second.diagnostics.rows_skipped_unchanged).toBe(1);
  });

  it("stamps received_at with arrival time and keeps ESPN's date in the payload", async () => {
    const espnDate = daysAgo(2);
    const before = Date.now();
    stubFetch(injuryFeed([{ status: "Questionable", date: espnDate }]));
    await adapter.ingestCFBInjuries();
    const after = Date.now();

    const [event] = injuryRawEvents();
    const receivedMs = Date.parse(event.received_at);

    expect(receivedMs).toBeGreaterThanOrEqual(before);
    expect(receivedMs).toBeLessThanOrEqual(after);
    expect(Date.parse(event.created_at)).toBeGreaterThanOrEqual(before);
    expect(receivedMs).toBeGreaterThan(Date.parse(espnDate));

    expect((event.payload as any).occurred_at).toBe(espnDate);
    expect((event.payload as any).event_time).toBe(espnDate);
  });

  it("does not churn between two players who share a name on different programs", async () => {
    // Shared names are everywhere in college football. A name-only lookup
    // hands each listing the other's row, the teams differ, that reads as a
    // change, and both write every poll forever.
    const feed = (date: string) => injuryFeed([
      { player: "John Smith", team: "ALA", status: "Questionable", date },
      { player: "John Smith", team: "UGA", status: "Questionable", date },
    ]);

    stubFetch(feed(daysAgo(3)));
    const first = await adapter.ingestCFBInjuries();
    expect(first.created).toBe(2);

    for (const day of [2, 1, 1]) {
      stubFetch(feed(daysAgo(day)));
      const run = await adapter.ingestCFBInjuries();
      expect(run.created).toBe(0);
      expect(run.diagnostics.rows_skipped_unchanged).toBe(2);
    }

    const events = injuryRawEvents();
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.team).sort()).toEqual(["ALA", "UGA"]);

    // Each namesake still tracks his OWN status: only the UGA listing moves.
    stubFetch(injuryFeed([
      { player: "John Smith", team: "ALA", status: "Questionable", date: daysAgo(1) },
      { player: "John Smith", team: "UGA", status: "Out", date: daysAgo(1) },
    ]));
    const moved = await adapter.ingestCFBInjuries();
    expect(moved.created).toBe(1);
    expect(injuryRawEvents().filter((event) => event.team === "UGA")).toHaveLength(2);
    expect(injuryRawEvents().filter((event) => event.team === "ALA")).toHaveLength(1);
  });

  it("seeks the dedup lookup through idx_raw_events_source_player without sorting", () => {
    const plan = store.getPipelineDb()
      .prepare(`EXPLAIN QUERY PLAN ${adapter.LATEST_CFB_INJURY_SQL}`)
      .all(PLAYER, TEAM) as Array<{ detail: string }>;
    const detail = plan.map((row) => row.detail).join(" | ");

    expect(detail).toContain("idx_raw_events_source_player");
    expect(detail).not.toContain("SCAN raw_events");
    // A temp b-tree means sorting every row for the player, with a
    // json_extract per payload, on every poll for every listed player.
    expect(detail).not.toContain("TEMP B-TREE");
  });

  it("returns the newest row by insertion order, not by backdated received_at", async () => {
    store.insertRawEvent({
      source_id: "espn",
      source_type: "api",
      league: "CFB",
      game_id: null,
      team: TEAM,
      player: PLAYER,
      event_type: "injury_update",
      payload: { designation: "Questionable", occurred_at: daysAgo(30) },
    } as any, { eventTime: daysAgo(30) });
    store.insertRawEvent({
      source_id: "espn",
      source_type: "api",
      league: "CFB",
      game_id: null,
      team: TEAM,
      player: PLAYER,
      event_type: "injury_update",
      payload: { designation: "OUT", occurred_at: daysAgo(1) },
    } as any, { eventTime: daysAgo(40) });

    const latest = store.getPipelineDb()
      .prepare(adapter.LATEST_CFB_INJURY_SQL)
      .get(PLAYER, TEAM) as { designation: string };

    expect(latest.designation).toBe("OUT");

    stubFetch(injuryFeed([{ status: "Out", date: daysAgo(1) }]));
    const run = await adapter.ingestCFBInjuries();
    expect(run.created).toBe(0);
    expect(run.diagnostics.rows_skipped_unchanged).toBe(1);
  });

  it("does not dedupe a CFB player against an NFL row of the same name", async () => {
    // Same athlete name in both leagues (a draft-year namesake). The lookup is
    // league-scoped, so the NFL row must not suppress the CFB one.
    store.insertRawEvent({
      source_id: "espn",
      source_type: "api",
      league: "NFL",
      game_id: null,
      team: TEAM,
      player: PLAYER,
      event_type: "injury_update",
      payload: { designation: "Questionable", occurred_at: daysAgo(2) },
    } as any);

    stubFetch(injuryFeed([{ status: "Questionable", date: daysAgo(1) }]));
    const run = await adapter.ingestCFBInjuries();

    expect(run.created).toBe(1);
    expect(injuryRawEvents()).toHaveLength(1);
  });
});
