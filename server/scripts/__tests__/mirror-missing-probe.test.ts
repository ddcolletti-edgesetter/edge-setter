import { describe, expect, it, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { parseArgs, probeMirrorMissing, formatReport, resolvePaths } from "../mirror-missing-probe";

/**
 * Fixture: one write run with 5 audit rows over 4 signals.
 *   s1, s2       mirrored in storage.db
 *   s3           missing; storage.db has a row for the SAME game + type under another id (s3x)
 *   s4 (2 rows)  missing; two pipeline outcomes, both audited; game unknown to storage.db
 * Plus an audit row from a different run that must be ignored.
 */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "es-mirror-probe-"));
const PIPE = path.join(TMP, "pipeline.db");
const STOR = path.join(TMP, "edge_setter.db");

beforeAll(() => {
  const p = new Database(PIPE);
  p.exec(`
    CREATE TABLE regrade_runs (run_id TEXT PRIMARY KEY, mode TEXT, league TEXT, started_at TEXT, finished_at TEXT,
      candidates INTEGER, changed INTEGER, conflicts INTEGER, mirror_updated INTEGER, mirror_missing INTEGER, mirror_repaired INTEGER);
    CREATE TABLE outcome_regrades (id TEXT PRIMARY KEY, run_id TEXT, outcome_id TEXT, signal_id TEXT, game_id TEXT, league TEXT,
      signal_type TEXT, excluded_stale INTEGER, after_settlement_state TEXT, after_hit INTEGER);
    CREATE TABLE outcomes (id TEXT PRIMARY KEY, signal_id TEXT, game_id TEXT, market TEXT, hit INTEGER, clv REAL,
      settlement_state TEXT, no_grade_reason TEXT, grading_version TEXT, recorded_at TEXT, created_at TEXT);
    CREATE TABLE live_signals (id TEXT PRIMARY KEY, league TEXT, signal_type TEXT, team TEXT, created_at TEXT);
  `);
  p.prepare(`INSERT INTO regrade_runs VALUES ('rg_A','write',NULL,'t','t',5,5,0,3,2,0)`).run();
  const o = p.prepare(`INSERT INTO outcomes VALUES (?,?,?,'spread',?,NULL,'graded',NULL,'v2',?,?)`);
  o.run("o1", "s1", "g1", 1, "2026-09-10T00:00:00Z", "2026-09-10T00:00:00Z");
  o.run("o2", "s2", "g1", 0, "2026-09-10T00:00:00Z", "2026-09-10T00:00:00Z");
  o.run("o3", "s3", "g2", 1, "2026-09-17T01:00:00Z", "2026-09-17T01:00:00Z");
  o.run("o4a", "s4", "g3", 0, "2026-09-17T02:00:00Z", "2026-09-17T02:00:00Z");
  o.run("o4b", "s4", "g3", 0, "2026-09-18T02:00:00Z", "2026-09-18T02:00:00Z");
  const a = p.prepare(`INSERT INTO outcome_regrades VALUES (?,?,?,?,?,?,?,0,'graded',?)`);
  a.run("a1", "rg_A", "o1", "s1", "g1", "NFL", "injury_update", 1);
  a.run("a2", "rg_A", "o2", "s2", "g1", "NFL", "line_move", 0);
  a.run("a3", "rg_A", "o3", "s3", "g2", "NBA", "injury_update", 1);
  a.run("a4", "rg_A", "o4a", "s4", "g3", "NBA", "line_move", 0);
  a.run("a5", "rg_A", "o4b", "s4", "g3", "NBA", "line_move", 0);
  a.run("b1", "rg_B", "o3", "s3", "g2", "NBA", "injury_update", 1);
  p.prepare(`INSERT INTO live_signals VALUES ('s3','NBA','injury_update','BOS','2026-09-16T23:00:00Z')`).run();
  p.close();

  const s = new Database(STOR);
  s.exec(`CREATE TABLE settled_outcomes (id TEXT PRIMARY KEY, signal_id TEXT NOT NULL UNIQUE, game_id TEXT, league TEXT,
    signal_type TEXT, hit INTEGER, settlement_state TEXT, recorded_at TEXT, created_at TEXT)`);
  const m = s.prepare(`INSERT INTO settled_outcomes VALUES (?,?,?,?,?,?,'graded',?,?)`);
  m.run("m1", "s1", "g1", "NFL", "injury_update", 1, "2026-09-10T00:00:00Z", "2026-09-10T00:00:00Z");
  m.run("m2", "s2", "g1", "NFL", "line_move", 0, "2026-09-10T00:00:00Z", "2026-09-10T00:00:00Z");
  m.run("m3", "s3x", "g2", "NBA", "injury_update", 1, "2026-10-01T00:00:00Z", "2026-10-01T00:00:00Z");
  s.close();
});

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

const open = () => ({
  pipe: new Database(PIPE, { readonly: true, fileMustExist: true }),
  stor: new Database(STOR, { readonly: true, fileMustExist: true }),
});

describe("probeMirrorMissing", () => {
  it("splits the run's audit rows into mirrored and missing, on readonly handles", () => {
    const { pipe, stor } = open();
    const r = probeMirrorMissing(pipe, stor, "rg_A");
    expect(r.audit_rows).toBe(5);
    expect(r.audit_signals).toBe(4);
    expect(r.missing_rows).toBe(3);
    expect(r.missing_signals).toBe(2);
    expect(r.run.mirror_missing).toBe(2);
    expect(r.mirror.total).toBe(3);
    expect(r.mirror.by_month).toEqual([{ month: "2026-09", n: 2 }, { month: "2026-10", n: 1 }]);
    expect(r.mirror.by_recorded_month).toEqual([{ month: "2026-09", n: 2 }, { month: "2026-10", n: 1 }]);
    pipe.close(); stor.close();
  });

  it("breaks missing down against audited by day, league and grade", () => {
    const { pipe, stor } = open();
    const r = probeMirrorMissing(pipe, stor, "rg_A");
    expect(r.by.created_day).toEqual([
      { key: "2026-09-10", missing: 0, audited: 2 },
      { key: "2026-09-17", missing: 2, audited: 2 },
      { key: "2026-09-18", missing: 1, audited: 1 },
    ]);
    expect(r.by.league).toEqual([{ key: "NBA", missing: 3, audited: 3 }, { key: "NFL", missing: 0, audited: 2 }]);
    expect(r.by.after_grade).toEqual([{ key: "graded/0", missing: 2, audited: 3 }, { key: "graded/1", missing: 1, audited: 2 }]);
    pipe.close(); stor.close();
  });

  it("finds multi-outcome signals and a same game+type mirror row under another signal_id", () => {
    const { pipe, stor } = open();
    const r = probeMirrorMissing(pipe, stor, "rg_A");
    expect(r.missing_signals_multi_outcome).toBe(1);
    expect(r.missing_rows_game_known).toBe(1);
    expect(r.missing_rows_same_game_type).toBe(1);
    const s3 = r.samples.find((x) => x.signal_id === "s3")!;
    expect(s3.mirror_by_signal_id).toBeNull();
    expect(s3.mirror_same_game_type.map((x) => x.signal_id)).toEqual(["s3x"]);
    expect(s3.live_signal).toMatchObject({ id: "s3", team: "BOS" });
    const s4 = r.samples.filter((x) => x.signal_id === "s4");
    expect(s4[0].pipeline_outcomes).toHaveLength(2);
    pipe.close(); stor.close();
  });

  it("samples each missing row once even when oldest/middle/newest overlap", () => {
    const { pipe, stor } = open();
    const r = probeMirrorMissing(pipe, stor, "rg_A", 4);
    expect(r.samples).toHaveLength(3);
    expect(formatReport(r)).toContain("with NO storage.db mirror row now: 3 rows, 2 distinct signals   (run recorded mirror_missing: 2)");
    pipe.close(); stor.close();
  });

  it("refuses an unknown run instead of reporting zero", () => {
    const { pipe, stor } = open();
    expect(() => probeMirrorMissing(pipe, stor, "rg_nope")).toThrow(/No regrade_runs row/);
    pipe.close(); stor.close();
  });
});

describe("parseArgs / resolvePaths", () => {
  it("takes one run id and --samples", () => {
    expect(parseArgs(["rg_20261128T101432_8a95781f"])).toEqual({ runId: "rg_20261128T101432_8a95781f", samples: 4 });
    expect(parseArgs(["rg_A", "--samples", "10"])).toEqual({ runId: "rg_A", samples: 10 });
  });
  it("refuses missing, extra, malformed and unknown arguments", () => {
    expect(() => parseArgs([])).toThrow(/usage/);
    expect(() => parseArgs(["rg_A", "rg_B"])).toThrow(/extra/);
    expect(() => parseArgs(["20261128"])).toThrow(/run id/);
    expect(() => parseArgs(["rg_A", "--write"])).toThrow(/Unknown flag/);
    expect(() => parseArgs(["rg_A", "--samples", "0"])).toThrow(/1-50/);
  });
  it("uses the app's env vars, /var/data by default", () => {
    expect(resolvePaths({})).toEqual({ pipeline: path.join("/var/data", "pipeline.db"), storage: path.join("/var/data", "edge_setter.db") });
    expect(resolvePaths({ DATA_DIR: "/d", PIPELINE_DATA_DIR: "/p" })).toEqual({ pipeline: path.join("/p", "pipeline.db"), storage: path.join("/d", "edge_setter.db") });
  });
});
