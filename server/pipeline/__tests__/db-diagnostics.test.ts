import { describe, expect, it, beforeAll, vi } from "vitest";
import type BetterSqlite3 from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * The boot DB-shape report: what it says, and what it must never do to say it.
 *
 * Why the second half matters more than the first: the report exists to explain
 * a 22.6s prod request, and the obvious way to write it — COUNT(*) per table —
 * would scan a 1.4GB file synchronously at boot. That is the same unbounded read
 * that got this instance killed twice (Sept 22, Oct 5 2026), so "no COUNT(*)" is
 * asserted directly, by watching the SQL the report prepares, rather than trusted
 * to a code comment.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-db-shape-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;
process.env.DATA_DIR = TMP_DIR;

let diagnostics: typeof import("../../db-diagnostics");
let store: typeof import("../store");
let sitStore: typeof import("../situations-store");
let db: BetterSqlite3.Database;

beforeAll(async () => {
  store = await import("../store");
  sitStore = await import("../situations-store");
  diagnostics = await import("../../db-diagnostics");
  db = store.getPipelineDb();
  sitStore.ensureSituationSchema(db);

  // Five games inserted, two deleted from the MIDDLE: MAX(rowid) reads 5 while 3
  // rows are present, which is the gap that makes every line an upper bound.
  //
  // Deleting from the middle, not the end, on purpose. These tables have a TEXT
  // PRIMARY KEY and no AUTOINCREMENT, so a rowid is max(rowid)+1 at insert and
  // deleting the NEWEST rows takes MAX(rowid) back down with them — an earlier
  // version of this test deleted g3 and g4 and measured 3, not 5. What MAX(rowid)
  // actually is, is the highest surviving rowid; rowids are distinct positive
  // integers, so it is always >= the row count and never below it. That is the
  // whole guarantee the report claims, and it is enough to tell a 1.4GB prod file
  // from a 0.5MB fixture.
  //
  // `games` rather than `situations` because the situation tables carry
  // append-only triggers that reject DELETE outright — for those, MAX(rowid) and
  // COUNT(*) agree and the estimate is in fact exact. The gap is real only for
  // the tables that are deleted from: `games`, `outcomes`, and `situation_events`
  // once the retroactive churn cleanup (#74-#77) runs against prod.
  const insert = db.prepare(`
    INSERT INTO games (id, league, home_team, away_team, game_time, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?)
  `);
  const now = new Date().toISOString();
  for (let i = 0; i < 5; i++) {
    insert.run(`g${i}`, "NFL", `H${i}`, `A${i}`, now, "scheduled", now, now);
  }
  db.prepare("DELETE FROM games WHERE id IN ('g1','g2')").run();
});

/** The SQL strings `run` prepares, in order. Mirrors request-path-query-plans. */
function capturedPrepare(run: () => void | Promise<void>): { sql: string[]; done: Promise<void> } {
  const proto = Object.getPrototypeOf(db) as Record<string, any>;
  const originalPrepare = proto.prepare;
  const originalExec = proto.exec;
  const sql: string[] = [];
  proto.prepare = function (this: unknown, text: string, ...rest: unknown[]) {
    sql.push(text);
    return originalPrepare.call(this, text, ...rest);
  };
  proto.exec = function (this: unknown, text: string, ...rest: unknown[]) {
    sql.push(text);
    return originalExec.call(this, text, ...rest);
  };
  const restore = () => {
    proto.prepare = originalPrepare;
    proto.exec = originalExec;
  };
  let done: Promise<void>;
  try {
    done = Promise.resolve(run()).then(restore, (e) => { restore(); throw e; });
  } catch (e) {
    restore();
    throw e;
  }
  return { sql, done };
}

describe("boot DB-shape report", () => {
  it("reports page_count * page_size, journal mode and the WAL sidecar", () => {
    const shape = diagnostics.readDbFileShape(db, "pipeline.db");
    expect(shape.pageSize).toBeGreaterThan(0);
    expect(shape.pageCount).toBeGreaterThan(0);
    expect(shape.bytes).toBe(shape.pageSize * shape.pageCount);
    // store.ts sets journal_mode = WAL at open. This is the assertion behind the
    // "is prod in WAL mode" answer: a long reader does not block the ingestion
    // writer, so moving the situations build to a second connection is safe.
    expect(shape.journalMode.toLowerCase()).toBe("wal");
    expect(shape.path.endsWith("pipeline.db")).toBe(true);
    console.log(`[measured] ${diagnostics.formatDbFileShape(shape)}`);
  });

  it("estimates rows with MAX(rowid) — an upper bound, not a count", async () => {
    const estimates = await diagnostics.estimateRowCounts(db, ["games"]);
    expect(estimates).toEqual([{ table: "games", estimatedRows: 5 }]);
    // 3 rows are actually present. The report must not claim otherwise.
    expect((db.prepare("SELECT count(*) AS c FROM games").get() as { c: number }).c).toBe(3);
    const line = diagnostics.formatRowEstimates(estimates);
    expect(line).toContain("games~5");
    expect(line).toContain("upper bound, not COUNT(*)");
  });

  it("never runs a COUNT(*) or a bare scan to produce the estimates", async () => {
    const captured = capturedPrepare(() => diagnostics.estimateRowCounts(db));
    await captured.done;
    expect(captured.sql.length).toBe(diagnostics.SITUATIONS_READ_TABLES.length);
    for (const text of captured.sql) {
      expect(text).toMatch(/^SELECT MAX\(rowid\) AS m FROM [a-z_]+$/);
      expect(text.toLowerCase()).not.toContain("count(");
    }
  });

  it("reports an absent table as absent instead of throwing", async () => {
    const estimates = await diagnostics.estimateRowCounts(db, ["situations", "no_such_table"]);
    expect(estimates[1]).toEqual({ table: "no_such_table", estimatedRows: null });
    expect(diagnostics.formatRowEstimates(estimates)).toContain("no_such_table~absent");
  });

  it("covers exactly the tables the situations build reads", () => {
    // Derived from the FROM/JOIN clauses of the situations read path. live_signals
    // is the biggest table in the file and is deliberately NOT here: #80 took it
    // off this path, and listing it would invite the next reader to blame it.
    expect([...diagnostics.SITUATIONS_READ_TABLES].sort()).toEqual([
      "games",
      "outcomes",
      "situation_confidence_history",
      "situation_events",
      "situation_founding_audit",
      "situation_game_resolution",
      "situation_public_confirmations",
      "situation_snapshots",
      "situation_state_history",
      "situations",
    ]);
    expect(diagnostics.SITUATIONS_READ_TABLES).not.toContain("live_signals");
  });

  it("reports sqlite_stat1 as absent, because nothing here runs ANALYZE", () => {
    // Load-bearing for every plan assertion in this repo: with no sqlite_stat1
    // the planner uses built-in estimates, so a fixture's plans are prod's plans
    // independent of row count.
    expect(diagnostics.hasSqliteStat1(db)).toBe(false);
    db.exec("ANALYZE");
    expect(diagnostics.hasSqliteStat1(db)).toBe(true);
    db.exec("DROP TABLE IF EXISTS sqlite_stat1");
  });

  it("yields the loop between tables so the report cannot be one long span", async () => {
    // Ten O(log n) probes is little work, but on a cold Render disk "little work"
    // is how the Oct 5 spans happened. Measured the way the boot-lag test
    // measures: a timer that must get a turn while the report runs.
    let ticks = 0;
    const timer = setInterval(() => { ticks++; }, 1);
    try {
      await diagnostics.estimateRowCounts(db);
    } finally {
      clearInterval(timer);
    }
    expect(ticks).toBeGreaterThan(0);
  });

  it("logs the whole report without throwing", async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { lines.push(a.join(" ")); });
    try {
      await diagnostics.logDbDiagnostics();
    } finally {
      spy.mockRestore();
    }
    const report = lines.join("\n");
    expect(report).toContain("[db-shape] pipeline.db");
    expect(report).toContain("journal_mode=wal");
    expect(report).toContain("sqlite_stat1:");
    expect(report).toContain("ESTIMATED rows via MAX(rowid)");
    console.log(`[measured] boot report:\n${report}`);
  });
});
