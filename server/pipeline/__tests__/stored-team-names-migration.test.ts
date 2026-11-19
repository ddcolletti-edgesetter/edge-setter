import { describe, expect, it, beforeAll, vi } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * The migration half of games.home_team_name / away_team_name: a pipeline.db
 * that predates the two columns.
 *
 * WHY A SEPARATE FILE. The store resolves its path and caches its handle at
 * import time, so the old schema has to be on disk BEFORE the module is
 * imported. That cannot be arranged inside the suite that also tests a fresh
 * DB, so this file builds the legacy file at module scope and imports the store
 * afterwards — which is exactly the sequence a Render deploy performs against
 * the persistent disk.
 *
 * What it holds down:
 *   • addColumnIfMissing adds both columns to an existing table. No try/catch
 *     anywhere in the path: a failed ALTER must crash the boot loudly, because
 *     silently serving a schema the writers assume exists is the worse outcome.
 *   • The row that was already there reads back NULL/NULL — the value the
 *     client treats as "fall back to the token". No backfill, no placeholder.
 *   • That row can then be named by an ordinary upsert, which is how the odds
 *     adapter fills the table in on its next cycle.
 *   • Running the migration again is a no-op (the column already exists), so a
 *     redeploy does not fail or duplicate.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-stored-names-mig-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;
const DB_PATH = path.join(TMP_DIR, "pipeline.db");

const LEGACY_ROW_ID = "CFB_2026_10_08_COU_TIG";

/**
 * `games` exactly as it stood before this change — the point of the test is
 * that the two name columns are NOT here.
 */
const LEGACY_GAMES_DDL = `
  CREATE TABLE games (
    id              TEXT PRIMARY KEY,
    league          TEXT NOT NULL,
    home_team       TEXT NOT NULL,
    away_team       TEXT NOT NULL,
    game_time       TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'scheduled',
    spread_line     REAL,
    spread_team     TEXT,
    total_line      REAL,
    moneyline_home  REAL,
    moneyline_away  REAL,
    open_spread     REAL,
    open_total      REAL,
    home_score      REAL,
    away_score      REAL,
    source_game_id  TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );
`;

/** Columns on the legacy table, read before the store ever opens the file. */
let columnsBeforeMigration: string[] = [];

{
  const legacy = new Database(DB_PATH);
  legacy.exec(LEGACY_GAMES_DDL);
  legacy.prepare(`
    INSERT INTO games (id, league, home_team, away_team, game_time, status, created_at, updated_at)
    VALUES (?, 'CFB', 'TIG', 'COU', '2026-10-08T19:00:00.000Z', 'scheduled', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')
  `).run(LEGACY_ROW_ID);
  columnsBeforeMigration = (legacy.prepare("PRAGMA table_info(games)").all() as { name: string }[]).map((c) => c.name);
  legacy.close();
}

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

const gamesColumns = (): string[] =>
  (store.getPipelineDb().prepare("PRAGMA table_info(games)").all() as { name: string }[]).map((c) => c.name);

describe("a pipeline.db that predates the name columns", () => {
  it("really was missing them before the store opened it", () => {
    // Non-vacuity: without this the assertions below would also pass against a
    // fixture that had the columns all along.
    expect(columnsBeforeMigration).toContain("home_team");
    expect(columnsBeforeMigration).not.toContain("home_team_name");
    expect(columnsBeforeMigration).not.toContain("away_team_name");
  });

  it("gains both columns when the store opens it", () => {
    expect(gamesColumns()).toContain("home_team_name");
    expect(gamesColumns()).toContain("away_team_name");
  });

  it("reads the pre-existing row back with NULL names, unchanged otherwise", () => {
    const row = store.getPipelineDb()
      .prepare("SELECT home_team, away_team, home_team_name, away_team_name, updated_at FROM games WHERE id=?")
      .get(LEGACY_ROW_ID) as Record<string, string | null>;
    expect(row.home_team_name).toBeNull();
    expect(row.away_team_name).toBeNull();
    // The migration touches the schema, not the data.
    expect(row.home_team).toBe("TIG");
    expect(row.away_team).toBe("COU");
    expect(row.updated_at).toBe("2026-10-01T00:00:00.000Z");
  });

  it("lets the next odds cycle name that row", () => {
    const existing = store.getGame(LEGACY_ROW_ID)!;
    store.upsertGame({
      ...existing,
      home_team_name: "Memphis Tigers",
      away_team_name: "Houston Cougars",
    });
    const row = store.getPipelineDb()
      .prepare("SELECT home_team_name, away_team_name FROM games WHERE id=?")
      .get(LEGACY_ROW_ID) as Record<string, string | null>;
    expect(row).toMatchObject({ home_team_name: "Memphis Tigers", away_team_name: "Houston Cougars" });
  });

  it("is idempotent — a second pass adds nothing and throws nothing", () => {
    const before = gamesColumns();
    // The exact PRAGMA-then-ALTER guard initSchema uses, run again by hand: a
    // redeploy executes it on every boot.
    const db = store.getPipelineDb();
    for (const column of ["home_team_name", "away_team_name"]) {
      const cols = db.prepare("PRAGMA table_info(games)").all() as { name: string }[];
      if (!cols.some((c) => c.name === column)) {
        db.prepare(`ALTER TABLE games ADD COLUMN ${column} TEXT`).run();
      }
    }
    expect(gamesColumns()).toEqual(before);
  });
});
