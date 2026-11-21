import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import Database from "better-sqlite3";
import {
  cfbNameForEspnAbbreviation,
  cfbNameForStoredToken,
  espnDatesFor,
  matchEspnEvent,
  nbaTeamNameForCode,
  oddsTokenForEspnTeam,
  planTeamNames,
  provenanceOf,
  type EspnEventLite,
  type GameNameRow,
} from "../team-name-backfill";
import { NBA_DISPLAY_TO_ABBR, NBA_TEAM_NAME_BY_ABBR } from "../adapters/espn-nba-teams";

/**
 * Backfilling games.home_team_name / away_team_name on CFB and NBA rows.
 *
 * The planner must: name every NBA code exactly; name a CFB odds token only
 * when ESPN's own event for that date says which school it is, or when exactly
 * one school produces the token; refuse to choose between schools; never
 * propose a side that already has a name. The script must write only missing
 * sides and leave updated_at alone.
 */

const SERVER_ROOT = path.resolve(__dirname, "..", "..");
const REPO_ROOT = path.resolve(SERVER_ROOT, "..");

const row = (o: Partial<GameNameRow> & Pick<GameNameRow, "id" | "league" | "home_team" | "away_team">): GameNameRow => ({
  home_team_name: null,
  away_team_name: null,
  game_time: "2026-11-15T17:00:00.000Z",
  source_game_id: null,
  ...o,
});

// ESPN ids from cfb-espn-teams.generated.ts: Rice 242 (OWL), Temple 218 (OWL),
// UAB 5 (BLA), Memphis 235 (TIG), Fresno State 278 (BUL), Buffalo 2084 (BUL).
const RICE = { id: "242", abbreviation: "RICE", displayName: "Rice Owls" };
const TEMPLE = { id: "218", abbreviation: "TEM", displayName: "Temple Owls" };
const UAB = { id: "5", abbreviation: "UAB", displayName: "UAB Blazers" };
const FRESNO = { id: "278", abbreviation: "FRES", displayName: "Fresno State Bulldogs" };
const event = (id: string, home: object, away: object, date = "2026-11-15T17:00Z"): EspnEventLite =>
  ({ id, date, home, away }) as EspnEventLite;

describe("NBA codes", () => {
  it("names all 30 codes, and agrees with the injury map and the odds adapter's NAME_TO_CODE", () => {
    expect(Object.keys(NBA_TEAM_NAME_BY_ABBR)).toHaveLength(30);
    for (const [abbr, name] of Object.entries(NBA_TEAM_NAME_BY_ABBR)) {
      expect(NBA_DISPLAY_TO_ABBR[name.toLowerCase()]).toBe(abbr);
      expect(nbaTeamNameForCode(abbr)).toBe(name);
    }
    // The odds adapter writes the name it was sent; this must be that spelling.
    const src = fs.readFileSync(path.join(SERVER_ROOT, "pipeline", "adapters", "the-odds-api.ts"), "utf-8");
    const block = src.slice(src.indexOf("// NBA", src.indexOf("const NAME_TO_CODE")), src.indexOf("// MLB"));
    const oddsNba = new Map([...block.matchAll(/"([^"]+)":\s*"([A-Z]+)"/g)].map((m) => [m[2], m[1]]));
    expect(oddsNba.size).toBe(30);
    expect(Object.fromEntries(oddsNba)).toEqual({ ...NBA_TEAM_NAME_BY_ABBR });
  });

  it("matches codes exactly: no case folding, trimming or near-matching", () => {
    for (const code of ["bos", " BOS", "BOS ", "GS", "UTAH", "WSH", "NO", "NY", "SA", "PHO", "BRK"]) {
      expect(nbaTeamNameForCode(code)).toBeNull();
    }
  });

  it("plans both sides of an NBA row from its codes, any writer", () => {
    const plan = planTeamNames([
      row({ id: "NBA_2026_11_10_MIA_BOS", league: "NBA", home_team: "BOS", away_team: "MIA" }),
      row({ id: "nba_12345", league: "NBA", home_team: "GSW", away_team: "XXX" }),
    ], null);
    expect(plan.updates[0]).toMatchObject({ home_team_name: "Boston Celtics", away_team_name: "Miami Heat", methods: ["nba_code"] });
    expect(plan.updates[1]).toMatchObject({ home_team_name: "Golden State Warriors", away_team_name: null });
    expect(plan.unresolved).toEqual([expect.objectContaining({ id: "nba_12345", side: "away", token: "XXX", reason: "unknown_nba_code" })]);
  });
});

describe("CFB token lookups", () => {
  it("names a token exactly one school produces, and refuses a shared one", () => {
    expect(cfbNameForStoredToken("BLA")).toEqual({ name: "UAB Blazers" });
    expect(cfbNameForStoredToken("OWL")).toEqual({ reason: "ambiguous_token" });
    expect(cfbNameForStoredToken("BUL")).toEqual({ reason: "ambiguous_token" });
    // FLA: a mascot slice (Kent State, Liberty) AND ESPN's abbreviation for Florida.
    expect(cfbNameForStoredToken("FLA")).toEqual({ reason: "ambiguous_token" });
    expect(cfbNameForStoredToken("ZZZ")).toEqual({ reason: "unknown_token" });
  });

  it("reads cfb_hist tokens as ESPN abbreviations, where FLA IS Florida", () => {
    expect(cfbNameForEspnAbbreviation("RICE")).toEqual({ name: "Rice Owls" });
    expect(cfbNameForEspnAbbreviation("FLA")).toEqual({ name: "Florida Gators" });
    expect(provenanceOf({ id: "cfb_hist_401", league: "CFB" })).toBe("espn_hist");
    expect(provenanceOf({ id: "CFB_2026_11_15_OWL_BLA", league: "CFB" })).toBe("odds");
  });

  it("derives an ESPN team's odds token from the generated map, else shortCode's mascot fallback", () => {
    expect(oddsTokenForEspnTeam(RICE)).toBe("OWL");
    expect(oddsTokenForEspnTeam({ displayName: "Towson Tigers" })).toBe("TIG"); // FCS, not in the map
  });

  it("asks ESPN for the game's UTC date and the day before", () => {
    expect(espnDatesFor("2026-11-15T01:30:00Z")).toEqual(["20261115", "20261114"]);
  });
});

describe("CFB odds rows", () => {
  const owlVsBla = row({ id: "CFB_2026_11_15_BLA_OWL", league: "CFB", home_team: "OWL", away_team: "BLA" });

  it("fallback OFF (default): no ESPN match leaves both sides unresolved, and reports what the fallback would fill", () => {
    const plan = planTeamNames([owlVsBla], () => []);
    expect(plan.updates).toEqual([]);
    expect(plan.unresolved).toEqual([
      expect.objectContaining({ side: "home", token: "OWL", reason: "ambiguous_token" }),
      expect.objectContaining({ side: "away", token: "BLA", reason: "no_espn_match" }),
    ]);
    expect(plan.fallbackCandidates).toEqual([
      expect.objectContaining({ id: owlVsBla.id, side: "away", token: "BLA", name: "UAB Blazers" }),
    ]);
  });

  it("fallback ON: names the side exactly one school produces, still refuses the shared token", () => {
    const plan = planTeamNames([owlVsBla], null, { allowFallback: true });
    expect(plan.updates).toEqual([expect.objectContaining({ home_team_name: null, away_team_name: "UAB Blazers", methods: ["cfb_unique_token"] })]);
    expect(plan.unresolved).toEqual([expect.objectContaining({ side: "home", token: "OWL", reason: "ambiguous_token" })]);
    expect(plan.fallbackCandidates).toEqual([]);
  });

  it("ESPN's event for the date splits a shared token", () => {
    const plan = planTeamNames([owlVsBla], () => [event("1", TEMPLE, FRESNO), event("2", RICE, UAB)]);
    expect(plan.updates).toEqual([expect.objectContaining({ home_team_name: "Rice Owls", away_team_name: "UAB Blazers", methods: ["espn_event"] })]);
    expect(plan.unresolved).toEqual([]);
  });

  it("accepts ESPN's listing in the other orientation, and orients names to the row", () => {
    const plan = planTeamNames([owlVsBla], () => [event("2", UAB, RICE)]);
    expect(plan.updates[0]).toMatchObject({ home_team_name: "Rice Owls", away_team_name: "UAB Blazers" });
  });

  it("refuses two matching events and does not fall back to a guess", () => {
    const owlVsOwl = row({ id: "CFB_2026_11_15_OWL_BUL", league: "CFB", home_team: "BUL", away_team: "OWL" });
    const m = matchEspnEvent(owlVsOwl, [event("1", FRESNO, RICE), event("2", FRESNO, TEMPLE)]);
    expect(m).toEqual({ reason: "espn_multiple_events" });
    const plan = planTeamNames([owlVsOwl], () => [event("1", FRESNO, RICE), event("2", FRESNO, TEMPLE)]);
    expect(plan.updates).toEqual([]);
    expect(plan.unresolved.map((u) => u.reason)).toEqual(["espn_multiple_events", "espn_multiple_events"]);
  });

  it("ignores an event more than 12h from kickoff", () => {
    const plan = planTeamNames([owlVsBla], () => [event("2", RICE, UAB, "2026-11-16T17:00Z")]);
    expect(plan.updates).toEqual([]);
    expect(plan.unresolved.map((u) => u.reason)).toEqual(["ambiguous_token", "no_espn_match"]);
  });

  it("never proposes a side that already has a name", () => {
    const named = { ...owlVsBla, home_team_name: "Rice Owls" };
    const plan = planTeamNames([named, { ...owlVsBla, id: "x", home_team_name: "A", away_team_name: "B" }], null, { allowFallback: true });
    expect(plan.updates).toEqual([expect.objectContaining({ id: owlVsBla.id, home_team_name: null, away_team_name: "UAB Blazers" })]);
    expect(plan.unresolved).toEqual([]);
  });
});

describe("CFB historical rows", () => {
  it("names cfb_hist rows from ESPN abbreviations offline, and from the event id online", () => {
    const hist = row({ id: "cfb_hist_401", league: "CFB", home_team: "RICE", away_team: "WCU", source_game_id: "401" });
    const offline = planTeamNames([hist], null);
    expect(offline.updates[0]).toMatchObject({ home_team_name: "Rice Owls", away_team_name: "Western Carolina Catamounts" });

    const fcs = row({ id: "cfb_hist_402", league: "CFB", home_team: "RICE", away_team: "XYZ", source_game_id: "402" });
    const online = planTeamNames([fcs], () => [event("402", RICE, { abbreviation: "XYZ", displayName: "Some FCS Team" }, "2026-11-20T00:00Z")]);
    expect(online.updates[0]).toMatchObject({ home_team_name: "Rice Owls", away_team_name: "Some FCS Team" });
    expect(online.unresolved).toEqual([]);
  });
});

describe("backfill-game-team-names script", () => {
  it("dry run writes nothing; --apply fills only missing sides and leaves updated_at alone", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "es-team-names-"));
    const dbFile = path.join(dir, "pipeline.db");
    const seed = new Database(dbFile);
    seed.exec(`CREATE TABLE games (id TEXT PRIMARY KEY, league TEXT NOT NULL, home_team TEXT NOT NULL, away_team TEXT NOT NULL,
      home_team_name TEXT, away_team_name TEXT, game_time TEXT NOT NULL, source_game_id TEXT, updated_at TEXT)`);
    const ins = seed.prepare(`INSERT INTO games VALUES (?,?,?,?,?,?,?,?,?)`);
    ins.run("NBA_2026_11_10_MIA_BOS", "NBA", "BOS", "MIA", null, null, "2026-11-10T00:00:00Z", null, "u1");
    ins.run("NBA_2026_11_11_LAL_LAC", "NBA", "LAC", "LAL", "LA Clippers (feed)", null, "2026-11-11T00:00:00Z", null, "u2");
    ins.run("CFB_2026_11_15_BLA_OWL", "CFB", "OWL", "BLA", null, null, "2026-11-15T17:00:00Z", null, "u3");
    ins.run("MLB_2026_09_01_BOS_NYY", "MLB", "NYY", "BOS", null, null, "2026-09-01T17:00:00Z", null, "u4");
    seed.close();
    const before = fs.readFileSync(dbFile);

    const run = (...extra: string[]) => execFileSync(process.execPath,
      [path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs"), path.join(SERVER_ROOT, "scripts", "backfill-game-team-names.ts"),
        "--db", dbFile, "--offline", "--json", ...extra],
      { cwd: REPO_ROOT, encoding: "utf-8" });

    const dry = JSON.parse(run());
    expect(dry.mode).toBe("dry-run");
    expect(fs.readFileSync(dbFile).equals(before)).toBe(true);
    const counts = (league: string) => dry.report.find((r: { counts: { league: string } }) => r.counts.league === league).counts;
    expect(counts("NBA")).toMatchObject({ rows_missing_a_name: 2, rows_filled: 2, rows_unresolved: 0 });
    // Fallback off: the BLA side is NOT filled, but the dry run says it would be.
    expect(counts("CFB")).toMatchObject({
      rows_missing_a_name: 1, rows_filled: 0, rows_partly_filled: 0, rows_unresolved: 1, sides_unresolved: 2,
      fallback_would_fill_sides: 1, fallback_would_fill_rows: 1,
    });
    expect(dry.fallback_candidates).toEqual([expect.objectContaining({ id: "CFB_2026_11_15_BLA_OWL", side: "away", token: "BLA", name: "UAB Blazers" })]);
    expect(dry.nba_unknown_codes).toEqual({});
    expect(dry.rollback_file).toBeNull();

    const applied = JSON.parse(run("--apply"));
    expect(path.dirname(applied.rollback_file)).toBe(dir);
    expect(JSON.parse(fs.readFileSync(applied.rollback_file, "utf-8")).entries).toEqual([
      { id: "NBA_2026_11_10_MIA_BOS", side: "home", old_value: null, new_value: "Boston Celtics" },
      { id: "NBA_2026_11_10_MIA_BOS", side: "away", old_value: null, new_value: "Miami Heat" },
      { id: "NBA_2026_11_11_LAL_LAC", side: "away", old_value: null, new_value: "Los Angeles Lakers" },
    ]);
    const db = new Database(dbFile, { readonly: true });
    const get = (id: string) => db.prepare(`SELECT home_team_name h, away_team_name a, updated_at u FROM games WHERE id = ?`).get(id);
    expect(get("NBA_2026_11_10_MIA_BOS")).toEqual({ h: "Boston Celtics", a: "Miami Heat", u: "u1" });
    expect(get("NBA_2026_11_11_LAL_LAC")).toEqual({ h: "LA Clippers (feed)", a: "Los Angeles Lakers", u: "u2" }); // existing name kept
    expect(get("CFB_2026_11_15_BLA_OWL")).toEqual({ h: null, a: null, u: "u3" }); // fallback off: untouched
    expect(get("MLB_2026_09_01_BOS_NYY")).toEqual({ h: null, a: null, u: "u4" }); // out of scope
    db.close();

    // Opting in fills the BLA side, and its rollback file holds only that write.
    const withFallback = JSON.parse(run("--apply", "--allow-fallback"));
    expect(JSON.parse(fs.readFileSync(withFallback.rollback_file, "utf-8")).entries)
      .toEqual([{ id: "CFB_2026_11_15_BLA_OWL", side: "away", old_value: null, new_value: "UAB Blazers" }]);
    const db2 = new Database(dbFile, { readonly: true });
    expect(db2.prepare(`SELECT home_team_name h, away_team_name a FROM games WHERE id = ?`).get("CFB_2026_11_15_BLA_OWL"))
      .toEqual({ h: null, a: "UAB Blazers" });
    db2.close();
  }, 60_000);

  it("lists an NBA code the map does not hold, and maps no near-match", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "es-team-names-"));
    const dbFile = path.join(dir, "pipeline.db");
    const seed = new Database(dbFile);
    seed.exec(`CREATE TABLE games (id TEXT PRIMARY KEY, league TEXT NOT NULL, home_team TEXT NOT NULL, away_team TEXT NOT NULL,
      home_team_name TEXT, away_team_name TEXT, game_time TEXT NOT NULL, source_game_id TEXT, updated_at TEXT)`);
    seed.prepare(`INSERT INTO games VALUES (?,?,?,?,NULL,NULL,?,NULL,'u')`).run("nba_1", "NBA", "GS", "BOS", "2026-01-01T00:00:00Z");
    seed.close();
    const out = JSON.parse(execFileSync(process.execPath,
      [path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs"), path.join(SERVER_ROOT, "scripts", "backfill-game-team-names.ts"),
        "--db", dbFile, "--league", "NBA", "--json"],
      { cwd: REPO_ROOT, encoding: "utf-8" }));
    expect(out.nba_unknown_codes).toEqual({ GS: 1 });
    expect(out.updates).toEqual([expect.objectContaining({ id: "nba_1", home_team_name: null, away_team_name: "Boston Celtics" })]);
  }, 60_000);
});
