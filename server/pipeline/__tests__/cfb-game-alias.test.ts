import { describe, expect, it, beforeAll, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Phase 1 of the CFB settlement fix: canonicalise inside findGameByTeams.
 *
 * games rows for CFB are written by the odds adapter as
 * shortCode(<The Odds API team name>); the ESPN score adapter reads them back
 * by ESPN's own spelling. The two vocabularies agree for 44 of 136 FBS teams,
 * and a lookup needs BOTH sides to agree, so most CFB games never resolve,
 * never go final and never settle.
 *
 * What this suite holds down:
 *   1. All 136 FBS teams forward-translate onto a stored shortCode row, from
 *      ESPN's displayName and from ESPN's abbreviation.
 *   2. The 16 stored tokens two or more schools share are enumerated, and a
 *      widened lookup that two same-date matchups both satisfy is REFUSED
 *      rather than resolved to the newest row.
 *   3. The exact-token path is untouched, for CFB and for every other league.
 *   4. A new games-by-teams lookup, or a CFB call site that stops passing the
 *      full team name, fails CI instead of silently going back to 15%.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-cfb-alias-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;

vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
}));

type StoreMod = typeof import("../store");
type GeneratedMod = typeof import("../cfb-espn-teams.generated");
type TokensMod = typeof import("../cfb-game-tokens");

let store: StoreMod;
let generated: GeneratedMod;
let tokens: TokensMod;

const SERVER_ROOT = path.join(__dirname, "..", "..");

beforeAll(async () => {
  store = await import("../store");
  generated = await import("../cfb-espn-teams.generated");
  tokens = await import("../cfb-game-tokens");
});

afterEach(() => {
  store.takeCfbMatchStats();
  vi.restoreAllMocks();
});

/* ─── Fixture helpers ───────────────────────────────────────────────── */

/** Insert a games row the way the odds adapter would: stored tokens only. */
function seedOddsGame(opts: {
  id: string;
  league?: string;
  homeStored: string;
  awayStored: string;
  date: string; // YYYY-MM-DD
  updatedAt?: string;
}): string {
  const now = opts.updatedAt ?? `${opts.date}T23:00:00.000Z`;
  store.getPipelineDb().prepare(`
    INSERT OR REPLACE INTO games
      (id, league, home_team, away_team, game_time, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?)
  `).run(
    opts.id, opts.league ?? "CFB", opts.homeStored, opts.awayStored,
    `${opts.date}T19:00:00.000Z`, now, now,
  );
  return opts.id;
}

const fbsTeams = () =>
  Object.entries(generated.CFB_ESPN_TEAM_BY_ID)
    .filter(([, team]) => team.fbs)
    .map(([id, team]) => ({ id, ...team }));

/** 2026-01-02 + n days, so each fixture game gets a date of its own. */
const dayN = (n: number) =>
  new Date(Date.UTC(2026, 0, 2 + n)).toISOString().slice(0, 10);

/* ─── 1. Every FBS team forward-translates ──────────────────────────── */

describe("every FBS team resolves against a stored shortCode row", () => {
  it("has exactly the 136 FBS teams ESPN's group 80 lists", () => {
    expect(fbsTeams()).toHaveLength(136);
  });

  it("resolves all 136 from ESPN's displayName", () => {
    const teams = fbsTeams();
    const failures: string[] = [];

    teams.forEach((home, i) => {
      // Pair each team with another so all 136 appear, on a date of its own
      // (so this test measures translation, never ambiguity).
      const away = teams[(i + 68) % teams.length];
      const date = dayN(i);
      const id = seedOddsGame({
        id: `fx-name-${i}`, homeStored: home.stored, awayStored: away.stored, date,
      });

      const found = store.findGameByTeams("CFB", home.name, away.name, date);
      if (found?.id !== id) {
        failures.push(
          `${away.name} @ ${home.name}: stored ${away.stored}@${home.stored} -> ${found?.id ?? "no match"}`,
        );
      }
    });

    expect(failures).toEqual([]);
  });

  it("resolves all 136 from ESPN's own abbreviation too", () => {
    const teams = fbsTeams();
    const failures: string[] = [];

    teams.forEach((home, i) => {
      const away = teams[(i + 68) % teams.length];
      const date = dayN(200 + i);
      const id = seedOddsGame({
        id: `fx-abbr-${i}`, homeStored: home.stored, awayStored: away.stored, date,
      });

      const found = store.findGameByTeams("CFB", home.abbr, away.abbr, date);
      if (found?.id !== id) {
        failures.push(
          `${away.abbr} @ ${home.abbr}: stored ${away.stored}@${home.stored} -> ${found?.id ?? "no match"}`,
        );
      }
    });

    expect(failures).toEqual([]);
  });

  it("names the NAME_TO_CODE teams whose stored code is not ESPN's abbreviation", () => {
    // These are mapped in NAME_TO_CODE and STILL never matched, because the
    // mapped code is not the spelling ESPN sends.
    const mascotDerived = new Set(
      fbsTeams().filter((t) => t.stored === t.name.split(" ").pop()!.slice(0, 3).toUpperCase())
        .map((t) => t.id),
    );
    const mismatched = fbsTeams()
      .filter((t) => !mascotDerived.has(t.id) && t.stored !== t.abbr)
      .map((t) => `${t.name}: stored ${t.stored} vs ESPN ${t.abbr}`)
      .sort();

    expect(mismatched).toEqual([
      "Air Force Falcons: stored AFA vs ESPN AF",
      "Boise State Broncos: stored BSU vs ESPN BOIS",
      "NC State Wolfpack: stored NCST vs ESPN NCSU",
      "Texas A&M Aggies: stored TAMU vs ESPN TA&M",
    ]);
  });

  it("derives the stored token exactly as shortCode() would", () => {
    // Independent re-derivation from the odds adapter's own source, so a
    // NAME_TO_CODE edit without a regenerate fails here rather than in prod.
    const src = fs.readFileSync(
      path.join(SERVER_ROOT, "pipeline", "adapters", "the-odds-api.ts"), "utf-8");
    const start = src.indexOf("const NAME_TO_CODE");
    const cfbBlock = src.slice(src.indexOf("CFB — mapped", start), src.indexOf("function shortCode"));
    const nameToCode = new Map(
      [...cfbBlock.matchAll(/"([^"]+)":\s*"([A-Z0-9]+)"/g)].map((m) => [m[1], m[2]]),
    );
    expect(nameToCode.size).toBe(48);

    const shortCodeOf = (name: string) =>
      nameToCode.get(name) ?? name.split(" ").pop()!.slice(0, 3).toUpperCase();

    const wrong = Object.values(generated.CFB_ESPN_TEAM_BY_ID)
      .filter((team) => team.stored !== shortCodeOf(team.name))
      .map((team) => `${team.name}: generated ${team.stored}, shortCode ${shortCodeOf(team.name)}`);

    expect(wrong).toEqual([]);
  });
});

/* ─── 2. Colliding tokens ───────────────────────────────────────────── */

describe("colliding stored tokens", () => {
  it("enumerates every token two or more schools would be stored as", () => {
    const inventory = generated.CFB_AMBIGUOUS_STORED_TOKENS
      .map((entry) => `${entry.token}: ${entry.teams.join(" / ")}`);

    expect(inventory).toEqual([
      "BEA: Cincinnati Bearcats / Missouri State Bears / Oregon State Beavers / Sam Houston Bearkats",
      "BOB: Ohio Bobcats / Texas State Bobcats",
      "BUL: Buffalo Bulls / Fresno State Bulldogs / Louisiana Tech Bulldogs / South Florida Bulls",
      "COU: BYU Cougars / Houston Cougars / Washington State Cougars",
      "EAG: Boston College Eagles / Eastern Michigan Eagles / Georgia Southern Eagles / Southern Miss Golden Eagles",
      "FLA: Kent State Golden Flashes / Liberty Flames",
      "GAM: Jacksonville State Gamecocks / South Carolina Gamecocks",
      "HUR: Miami Hurricanes / Tulsa Golden Hurricane",
      "HUS: Northern Illinois Huskies / UConn Huskies",
      "KNI: Rutgers Scarlet Knights / UCF Knights",
      "MIN: Massachusetts Minutemen / UTEP Miners",
      "OWL: Florida Atlantic Owls / Kennesaw State Owls / Rice Owls / Temple Owls",
      "PAN: Florida International Panthers / Georgia State Panthers",
      "RAI: Middle Tennessee Blue Raiders / Texas Tech Red Raiders",
      "WAR: Hawai'i Rainbow Warriors / UL Monroe Warhawks",
      "WIL: Kentucky Wildcats / Northwestern Wildcats",
    ]);
  });

  it("a colliding token pair IS reachable by more than one real matchup", () => {
    // The premise the uniqueness guard exists for: the date alone is not a
    // proof. Fresno State and Louisiana Tech are both BUL; BYU and Houston are
    // both COU; so (BUL, COU) describes at least four different matchups.
    const bul = tokens.cfbSchoolsForStoredToken("BUL");
    const cou = tokens.cfbSchoolsForStoredToken("COU");
    expect(bul.length * cou.length).toBeGreaterThan(1);
    expect(tokens.cfbStoredTokenIsAmbiguous("BUL")).toBe(true);
    expect(tokens.cfbStoredTokenIsAmbiguous("TIG")).toBe(false);
  });

  it("refuses a widened lookup two same-date matchups both satisfy", () => {
    const date = dayN(400);
    const fresnoByu = seedOddsGame({
      id: "fx-ambig-a", homeStored: "BUL", awayStored: "COU", date,
      updatedAt: `${date}T01:00:00.000Z`,
    });
    const laTechHouston = seedOddsGame({
      id: "fx-ambig-b", homeStored: "BUL", awayStored: "COU", date,
      updatedAt: `${date}T23:00:00.000Z`, // the newest row — what LIMIT 1 would have taken
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const found = store.findGameByTeams("CFB", "Fresno State Bulldogs", "BYU Cougars", date);

    expect(found).toBeNull();
    expect(store.takeCfbMatchStats()).toMatchObject({ alias: 0, ambiguous: 1 });
    expect(warn.mock.calls[0]?.[0]).toContain("refused as ambiguous");
    expect(warn.mock.calls[0]?.[0]).toContain(fresnoByu);
    expect(warn.mock.calls[0]?.[0]).toContain(laTechHouston);
  });

  it("still resolves an ambiguous token once the date separates the matchups", () => {
    const dateA = dayN(410);
    const dateB = dayN(411);
    const a = seedOddsGame({ id: "fx-sep-a", homeStored: "BUL", awayStored: "COU", date: dateA });
    const b = seedOddsGame({ id: "fx-sep-b", homeStored: "BUL", awayStored: "COU", date: dateB });

    expect(store.findGameByTeams("CFB", "Fresno State Bulldogs", "BYU Cougars", dateA)?.id).toBe(a);
    expect(store.findGameByTeams("CFB", "Louisiana Tech Bulldogs", "Houston Cougars", dateB)?.id).toBe(b);
    expect(store.takeCfbMatchStats()).toMatchObject({ alias: 2, ambiguous: 0 });
  });
});

/* ─── 3. The untouched paths ────────────────────────────────────────── */

describe("the exact-token path is unchanged", () => {
  it("returns the newest row for a CFB game that already matched exactly", () => {
    const date = dayN(500);
    seedOddsGame({
      id: "fx-direct-old", homeStored: "ALA", awayStored: "UGA", date,
      updatedAt: `${date}T01:00:00.000Z`,
    });
    seedOddsGame({
      id: "fx-direct-new", homeStored: "ALA", awayStored: "UGA", date,
      updatedAt: `${date}T22:00:00.000Z`,
    });

    expect(store.findGameByTeams("CFB", "ALA", "UGA", date)?.id).toBe("fx-direct-new");
    expect(store.takeCfbMatchStats()).toMatchObject({ direct: 1, alias: 0, ambiguous: 0 });
  });

  it("never widens a non-CFB league", () => {
    const date = dayN(510);
    seedOddsGame({ id: "fx-nfl", league: "NFL", homeStored: "DAL", awayStored: "NYG", date });

    // "Dallas Cowboys" is not what the NFL row stores, and NFL gets no alias.
    expect(store.findGameByTeams("NFL", "Dallas Cowboys", "New York Giants", date)).toBeNull();
    expect(store.findGameByTeams("NFL", "DAL", "NYG", date)?.id).toBe("fx-nfl");
    expect(store.takeCfbMatchStats()).toMatchObject({ direct: 0, alias: 0, unmatched: 0 });
  });

  it("counts a CFB team ESPN cannot name as unmatched, not as an error", () => {
    const date = dayN(520);
    expect(store.findGameByTeams("CFB", "Not A Real School", "Also Not Real", date)).toBeNull();
    expect(store.takeCfbMatchStats()).toMatchObject({ unmatched: 1, alias: 0, ambiguous: 0 });
  });
});

/* ─── 4. Call-site guard ────────────────────────────────────────────── */

describe("call-site guard", () => {
  const serverSources = (): string[] => {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "__tests__" && entry.name !== "node_modules") walk(full);
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
          out.push(full);
        }
      }
    };
    walk(SERVER_ROOT);
    return out;
  };

  /** Every statement in server/ that reads games filtered on a team column. */
  const gamesByTeamStatements = () => {
    const found: Array<{ file: string; sql: string }> = [];
    for (const file of serverSources()) {
      const src = fs.readFileSync(file, "utf-8");
      const pattern = /FROM games[\s\S]{0,500}?(?:home_team|away_team)\s*\)?\s*(?:=|IN|LIKE)/gi;
      for (const match of src.matchAll(pattern)) {
        found.push({
          file: path.relative(SERVER_ROOT, file).replace(/\\/g, "/"),
          sql: match[0].replace(/\s+/g, " "),
        });
      }
    }
    return found;
  };

  it("findGameByTeams is the only place a games row is resolved by both teams", () => {
    // A both-team lookup IS game resolution, so it has to be the canonicalised
    // one. A new one elsewhere is a new CFB blind spot: route it through
    // findGameByTeams instead of adding it here.
    const bothTeams = gamesByTeamStatements()
      .filter(({ sql }) => /home_team\s*(?:=|IN)[\s\S]*?AND[\s\S]*?away_team\s*(?:=|IN)/i.test(sql))
      .filter(({ file }) => file !== "pipeline/store.ts")
      .map(({ file, sql }) => `${file}: ${sql.slice(0, 70)}`);

    expect(bothTeams).toEqual([]);
  });

  it("holds the inventory of single-team games reads, which Phase 1 leaves alone", () => {
    // These match ONE team column, so they are not game resolution and the
    // canonicalisation does not reach them. They are listed rather than fixed
    // so that a new one is a decision somebody makes on purpose.
    const singleTeam = [...new Set(gamesByTeamStatements()
      .filter(({ sql }) => !/home_team\s*(?:=|IN)[\s\S]*?AND[\s\S]*?away_team\s*(?:=|IN)/i.test(sql))
      .map(({ file }) => file))].sort();

    expect(singleTeam).toEqual([
      // checkLineReaction: newest non-final game for one team, for display
      // context. A CFB signal's team token is odds-vocabulary already, so this
      // reads correctly today; it would break if a caller ever passed ESPN's
      // spelling.
      "retrieval.ts",
      // findNextFinalGameForTeam: settlement's null-game fallback, exact + LIKE
      // on one team. Widening it is Phase 2, not this PR.
      "pipeline/store.ts",
    ].sort());
  });

  it("holds the full inventory of findGameByTeams call sites", () => {
    const sites: string[] = [];
    for (const file of serverSources()) {
      const src = fs.readFileSync(file, "utf-8");
      const rel = path.relative(SERVER_ROOT, file).replace(/\\/g, "/");
      if (rel === "pipeline/store.ts") continue;
      // Drop prose first: these files document the matcher in their headers.
      const code = src.split("\n").filter((line) => !/^\s*(?:\*|\/\/)/.test(line)).join("\n");
      for (const match of code.matchAll(/findGameByTeams\(\s*([^,]+),/g)) {
        sites.push(`${rel} ${match[1].trim()}`);
      }
    }
    // Adding a call site is fine; it has to be added here too, which is the
    // point — the reviewer gets asked whether it needs the full team name.
    expect(sites.sort()).toEqual([
      'pipeline/adapters/balldontlie-historical.ts "NBA"',
      'pipeline/adapters/espn-cfb-historical.ts "CFB"',
      'pipeline/adapters/espn-cfb.ts "CFB"',
      'pipeline/adapters/espn-nba.ts "NBA"',
      'pipeline/adapters/espn-nfl-historical.ts "NFL"',
      'pipeline/adapters/espn-nfl.ts "NFL"',
      'pipeline/adapters/mlb-statsapi-historical.ts "MLB"',
      'pipeline/adapters/mlb-statsapi.ts "MLB"',
      "scripts/backfill-situation-game-resolution.ts situation.league",
    ]);
  });

  it("the live CFB score adapter passes the full team name", () => {
    const src = fs.readFileSync(
      path.join(SERVER_ROOT, "pipeline", "adapters", "espn-cfb.ts"), "utf-8");
    const call = src.slice(src.indexOf("findGameByTeams("));
    const args = call.slice(0, call.indexOf(");"));
    expect(args).toContain("home.team.displayName");
    expect(args).toContain("away.team.displayName");
  });

  it("the generated server map is internally consistent", () => {
    const src = fs.readFileSync(
      path.join(SERVER_ROOT, "pipeline", "cfb-espn-teams.generated.ts"), "utf-8");
    expect(src).toContain("GENERATED FILE — do not edit by hand.");
    expect(generated.CFB_DROPPED_KEYS.every((d) => d.teams.length > 1)).toBe(true);
    // Every lookup key points at a team the map can actually describe.
    const unknown = Object.entries(generated.CFB_TEAM_KEY_TO_ESPN_ID)
      .filter(([, id]) => !generated.CFB_ESPN_TEAM_BY_ID[id]);
    expect(unknown).toEqual([]);
  });
});
