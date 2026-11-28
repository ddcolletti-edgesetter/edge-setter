import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { parseArgs, resolvePipelinePath, runCensus } from "../team-story-trigger-census";

/**
 * The census against a hand-built pipeline.db fixture: per trigger it counts
 * detection, the situation type each event became, and public confirmation.
 * It must leave the file byte-identical (opened read-only).
 */

const NOW = new Date("2026-11-28T12:00:00.000Z");
const IN = "2026-11-20T12:00:00.000Z";
const OLD = "2026-10-01T12:00:00.000Z"; // outside a 30-day window

function buildFixture(file: string) {
  const db = new Database(file);
  db.exec(`
    CREATE TABLE raw_events (id TEXT PRIMARY KEY, source_id TEXT, source_type TEXT, league TEXT, event_type TEXT,
      payload TEXT, processed INTEGER, received_at TEXT);
    CREATE TABLE situations (situation_id TEXT PRIMARY KEY, league TEXT, situation_type TEXT, created_at TEXT);
    CREATE TABLE situation_events (event_id TEXT PRIMARY KEY, situation_id TEXT, kind TEXT, raw_event_id TEXT, recorded_at TEXT);
    CREATE INDEX idx_situation_events_situation ON situation_events(situation_id, recorded_at, event_id);
    CREATE TABLE situation_public_confirmations (situation_id TEXT PRIMARY KEY, confirmed_at TEXT, source_name TEXT, raw_event_id TEXT);
  `);
  const raw = db.prepare(`INSERT INTO raw_events VALUES (?,?,?,?,?,?,?,?)`);
  const p = (o: object) => JSON.stringify(o);
  // Coach firing: RSS founds a roster? No — coaching_change maps to operator_note.
  raw.run("r_fire_rss", "rss_nfl_official_news", "rss", "NFL", "coaching_change", p({ headline: "Jets fire head coach Robert Saleh" }), 1, IN);
  // Same story from an X wire account, matched into that situation and confirming it.
  raw.run("r_fire_x", "x_adamschefter", "scrape", "NFL", "coaching_change", p({ headline: "Jets have fired head coach Robert Saleh, per source" }), 1, IN);
  // ESPN IR, founds an injury situation, never confirmed.
  raw.run("r_ir", "espn", "api", "NFL", "injury_update", p({ designation: "IR", notes: "Placed on IR." }), 1, IN);
  // Trade from RSS, unprocessed, no situation.
  raw.run("r_trade", "rss_nfl_official_news", "rss", "NFL", "transaction", p({ headline: "Browns traded Amari Cooper to the Bills" }), 0, IN);
  // False positive and non-trigger rows: never counted.
  raw.run("r_fp", "rss_nfl_official_news", "rss", "NFL", "injury_update", p({ headline: "Barkley sits out practice" }), 1, IN);
  // Out of window, and out of scope.
  raw.run("r_old", "rss_nfl_official_news", "rss", "NFL", "transaction", p({ headline: "Jason Kelce announces retirement" }), 1, OLD);
  raw.run("r_cfb", "rss_cfb", "rss", "CFB", "coaching_change", p({ headline: "Florida fires head coach Billy Napier" }), 1, IN);

  db.prepare(`INSERT INTO situations VALUES (?,?,?,?)`).run("s_fire", "NFL", "operator_note", IN);
  db.prepare(`INSERT INTO situations VALUES (?,?,?,?)`).run("s_ir", "NFL", "injury", IN);
  const ev = db.prepare(`INSERT INTO situation_events VALUES (?,?,?,?,?)`);
  ev.run("e1", "s_fire", "situation_created", "r_fire_rss", IN);
  ev.run("e1s", "s_fire", "snapshot_created", "r_fire_rss", IN);
  ev.run("e2", "s_fire", "situation_matched", "r_fire_x", IN);
  ev.run("e3", "s_ir", "situation_created", "r_ir", IN);
  db.prepare(`INSERT INTO situation_public_confirmations VALUES (?,?,?,?)`).run("s_fire", IN, "Adam Schefter", "r_fire_x");
  db.close();
}

describe("team-story-trigger-census", () => {
  it("counts detection, situation type and public confirmation per trigger, read-only", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "es-tst-census-"));
    const file = path.join(dir, "pipeline.db");
    buildFixture(file);
    const before = fs.readFileSync(file);

    const db = new Database(file, { readonly: true, fileMustExist: true });
    const r = runCensus(db, { days: 30, now: NOW });
    db.close();

    expect(r.nfl_raw_events_in_window).toBe(5);
    expect(r.nfl_raw_events_with_any_trigger).toBe(4);
    expect(r.situation_tables_present).toBe(true);

    const fire = r.triggers.coach_fire;
    expect(fire.detected).toBe(2);
    expect(fire.by_source_type).toEqual({ rss: 1, scrape: 1 });
    expect(fire.situation).toEqual({
      with_situation: 2, no_situation: 0, by_situation_type: { operator_note: 2 },
      founded: 1, matched_existing: 1, distinct_situations: 1,
    });
    expect(fire.public_confirmation).toEqual({
      events_in_confirmed_situation: 2, confirmed_by_this_event: 1,
      distinct_confirmed_situations: 1, by_confirmation_source: { "Adam Schefter": 1 },
    });

    const ir = r.triggers.season_ending_injury;
    expect(ir.detected).toBe(1);
    expect(ir.by_evidence).toEqual({ structured_field: 1 });
    expect(ir.situation.by_situation_type).toEqual({ injury: 1 });
    expect(ir.public_confirmation.events_in_confirmed_situation).toBe(0);

    const trade = r.triggers.trade;
    expect(trade.detected).toBe(1);
    expect(trade.unprocessed).toBe(1);
    expect(trade.situation.no_situation).toBe(1);
    expect(trade.samples.traded[0]).toMatchObject({ raw_event_id: "r_trade", matched: "traded" });

    expect(r.triggers.retirement.detected).toBe(0); // only an out-of-window row
    expect(r.triggers.suspension.detected).toBe(0); // "sits out" is not a suspension

    expect(fs.readFileSync(file).equals(before)).toBe(true);
  });

  it("works on a database without situation tables", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "es-tst-census-"));
    const file = path.join(dir, "pipeline.db");
    const w = new Database(file);
    w.exec(`CREATE TABLE raw_events (id TEXT, source_id TEXT, source_type TEXT, league TEXT, event_type TEXT, payload TEXT, processed INTEGER, received_at TEXT)`);
    w.prepare(`INSERT INTO raw_events VALUES (?,?,?,?,?,?,?,?)`).run("r", "rss_x", "rss", "NFL", "transaction", JSON.stringify({ headline: "Rice suspended six games" }), 1, IN);
    w.close();
    const db = new Database(file, { readonly: true, fileMustExist: true });
    const r = runCensus(db, { days: 30, now: NOW });
    db.close();
    expect(r.situation_tables_present).toBe(false);
    expect(r.triggers.suspension.detected).toBe(1);
    expect(r.triggers.suspension.situation.no_situation).toBe(1);
  });

  it("args and path", () => {
    expect(parseArgs([])).toEqual({ days: 30 });
    expect(parseArgs(["--days", "7"])).toEqual({ days: 7 });
    expect(() => parseArgs(["--days", "0"])).toThrow();
    expect(() => parseArgs(["--write"])).toThrow();
    expect(resolvePipelinePath({ PIPELINE_DATA_DIR: "/a" })).toBe(path.join("/a", "pipeline.db"));
    expect(resolvePipelinePath({})).toBe(path.join("/var/data", "pipeline.db"));
  });
});
