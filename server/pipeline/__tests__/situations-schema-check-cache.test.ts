import { describe, expect, it, beforeAll, vi } from "vitest";
import type BetterSqlite3 from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * ensureSituationSchema runs on every situations-store call, and the
 * /api/v2/situations path makes roughly 1,500 of them per request. Profiling it
 * on 2026-10-04 put 86ms of a cold response in PRAGMA table_info(situations)
 * alone — the same answer, 1,500 times, for a migration (player_espn_id /
 * player_jersey) that can only ever apply once per database.
 *
 * The check is now cached per db handle. These tests pin the two properties
 * that make that safe: the migration still runs on a DB that predates the
 * columns, and the cache is keyed on the handle, so a different database never
 * inherits another's answer.
 *
 * Only the PRAGMA is cached. The surrounding CREATE TABLE / CREATE INDEX /
 * CREATE TRIGGER exec still runs every call (~462ms per 1,500 on a prod-shaped
 * DB); skipping that would change when the append-only guards are reinstalled,
 * which is a separate decision.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-situations-schema-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;

vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
  storage: { upsertSourceScore: vi.fn() },
  insertSettledOutcome: vi.fn(),
  getSettledOutcomesForAccuracy: vi.fn(() => []),
}));

let store: typeof import("../situations-store");
let sqlite: typeof import("better-sqlite3").default;

beforeAll(async () => {
  store = await import("../situations-store");
  sqlite = (await import("better-sqlite3")).default;
});

/** Counts PRAGMA table_info(situations) statements prepared on one handle. */
function countingHandle(db: BetterSqlite3.Database): { count: () => number } {
  const original = db.prepare.bind(db);
  let count = 0;
  (db as any).prepare = (sql: string) => {
    if (/PRAGMA table_info\(situations\)/.test(sql)) count++;
    return original(sql);
  };
  return { count: () => count };
}

describe("situations schema column check", () => {
  it("reads the column list once per handle, not once per call", () => {
    const db = new sqlite(":memory:");
    store.ensureSituationSchema(db); // first call creates the table
    store.resetSituationPlayerColumnCache(db);

    const counter = countingHandle(db);
    for (let i = 0; i < 50; i++) store.ensureSituationSchema(db);
    expect(counter.count()).toBe(1);
  });

  it("still applies the player-headshot migration to a DB that predates it", () => {
    const db = new sqlite(":memory:");
    // The pre-migration shape: situations without player_espn_id / player_jersey.
    db.exec(`
      CREATE TABLE situations (
        situation_id            TEXT PRIMARY KEY,
        canonical_hash          TEXT NOT NULL,
        sport                   TEXT NOT NULL,
        league                  TEXT NOT NULL,
        game_id                 TEXT,
        teams_json              TEXT NOT NULL DEFAULT '[]',
        players_json            TEXT NOT NULL DEFAULT '[]',
        situation_type          TEXT NOT NULL,
        semantic_fingerprint    TEXT NOT NULL,
        created_from_event_id   TEXT,
        created_at              TEXT NOT NULL
      );
    `);
    const columns = () => (db.prepare("PRAGMA table_info(situations)").all() as { name: string }[])
      .map((row) => row.name);
    expect(columns()).not.toContain("player_espn_id");

    store.ensureSituationSchema(db);
    expect(columns()).toContain("player_espn_id");
    expect(columns()).toContain("player_jersey");

    // And the cached handle does not re-ALTER on the next call.
    expect(() => store.ensureSituationSchema(db)).not.toThrow();
  });

  it("does not let one handle's cached answer serve another database", () => {
    const migrated = new sqlite(":memory:");
    store.ensureSituationSchema(migrated);

    // A second, independent DB still in the pre-migration shape. If the cache
    // were keyed on anything but the handle, this would be skipped and every
    // later read of player_espn_id would throw.
    const stale = new sqlite(":memory:");
    stale.exec(`
      CREATE TABLE situations (
        situation_id            TEXT PRIMARY KEY,
        canonical_hash          TEXT NOT NULL,
        sport                   TEXT NOT NULL,
        league                  TEXT NOT NULL,
        game_id                 TEXT,
        teams_json              TEXT NOT NULL DEFAULT '[]',
        players_json            TEXT NOT NULL DEFAULT '[]',
        situation_type          TEXT NOT NULL,
        semantic_fingerprint    TEXT NOT NULL,
        created_from_event_id   TEXT,
        created_at              TEXT NOT NULL
      );
    `);
    store.ensureSituationSchema(stale);

    expect((stale.prepare("PRAGMA table_info(situations)").all() as { name: string }[])
      .map((row) => row.name)).toContain("player_espn_id");
  });

  it("writes and reads the headshot columns after a cached call", () => {
    const db = new sqlite(":memory:");
    store.ensureSituationSchema(db);
    store.ensureSituationSchema(db); // second call takes the cached path

    store.insertSituation({
      situation_id: "sit_cache",
      canonical_hash: "hash_cache",
      sport: "football",
      league: "NFL",
      game_id: null,
      teams: ["DAL"],
      players: ["Player One"],
      player_espn_id: "12345",
      player_jersey: "88",
      situation_type: "injury",
      semantic_fingerprint: "fingerprint",
      created_from_event_id: "ne_cache",
      created_at: new Date().toISOString(),
    }, db);

    const row = db.prepare(
      "SELECT player_espn_id, player_jersey FROM situations WHERE situation_id = ?",
    ).get("sit_cache") as { player_espn_id: string; player_jersey: string };
    expect(row.player_espn_id).toBe("12345");
    expect(row.player_jersey).toBe("88");
  });
});
