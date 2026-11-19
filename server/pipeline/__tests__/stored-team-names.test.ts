import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * games.home_team_name / away_team_name — the feed's own team names, stored
 * beside the codes we derive from them.
 *
 * WHY THIS EXISTS. home_team/away_team hold shortCode() of the odds-API name.
 * For 88 of 136 FBS teams that code is a three-letter slice of the MASCOT:
 * "Rice Owls" -> "OWL", "Pittsburgh Panthers" -> "PAN". A CFB board printed
 * "OWL vs PAN" at readers. The client can map many of those tokens back to a
 * school, but 16 are shared by more than one school and are unrecoverable in
 * principle — and the adapter had the real name in hand the whole time.
 *
 * What this suite holds down:
 *   1. The columns exist on a fresh DB, nullable, with no default — so an
 *      unnamed row reads back NULL rather than "" or a placeholder.
 *      (The migration path for a DB that predates them has its own file,
 *      stored-team-names-migration.test.ts, because it has to build the old
 *      schema before the store opens the file.)
 *   2. The odds adapter stores both names on the pre-kickoff path, and the
 *      token columns are byte-identical to what they were before.
 *   3. It stores them on the POST-kickoff path too (touchGameSchedule), which
 *      is safe because a team's name is not market data — and the market
 *      columns are still NULL there.
 *   4. THE MLB CASE. ingestMLBSchedule upserts every MLB game on the slate and
 *      has no team name to pass. With a plain home_team_name=excluded.* clause
 *      it would blank the name the odds adapter wrote minutes earlier, once per
 *      cycle, forever. COALESCE makes naming one-way. This test fails on plain
 *      assignment.
 *   5. upsertHistoricalGame is deliberately untouched: it never writes a name,
 *      and — because the two columns appear in neither its INSERT list nor its
 *      ON CONFLICT clause — it can never erase one either.
 *   6. A name is filled in where it is missing, survives a nameless writer,
 *      and is replaced only by another writer that actually has one.
 *   7. Replay hashes do not move. The hash reads live_signals and
 *      odds_snapshots; this is a games column, and the test proves the hash is
 *      byte-identical across a write that sets both names — while still moving
 *      when the replay state really changes.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-stored-names-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;
process.env.THE_ODDS_API_KEY = "test-key";

vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
}));

type StoreMod = typeof import("../store");
type OddsMod = typeof import("../adapters/the-odds-api");
type MlbMod = typeof import("../adapters/mlb-statsapi");
type ReplayMod = typeof import("../replay");

let store: StoreMod;
let odds: OddsMod;
let mlb: MlbMod;
let replay: ReplayMod;

beforeAll(async () => {
  store = await import("../store");
  odds = await import("../adapters/the-odds-api");
  mlb = await import("../adapters/mlb-statsapi");
  replay = await import("../replay");
});

/* ─── Fixture ───────────────────────────────────────────────────────── */

/**
 * Both CFB names fall through NAME_TO_CODE to the mascot slice, which is the
 * population this column exists for: TIG is Memphis Tigers here and also LSU,
 * Auburn, Missouri and Towson, so no lookup table can ever name it.
 */
const CFB_HOME = "Memphis Tigers";
const CFB_AWAY = "Houston Cougars";
const CFB_HOME_CODE = "TIG";
const CFB_AWAY_CODE = "COU";

const MLB_HOME = "New York Yankees";
const MLB_AWAY = "Boston Red Sox";

/** Far enough ahead that no cycle clock can cross it mid-test. */
const FUTURE = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
const PAST = "2026-10-08T19:00:00.000Z";

function oddsPayload(o: { commenceTime: string; home: string; away: string; sportKey: string }) {
  return [{
    id: "src-1",
    sport_key: o.sportKey,
    sport_title: "T",
    commence_time: o.commenceTime,
    home_team: o.home,
    away_team: o.away,
    bookmakers: [{
      key: "pinnacle",
      title: "Pinnacle",
      markets: [
        { key: "spreads", outcomes: [{ name: o.home, point: -3.5 }, { name: o.away, point: 3.5 }] },
        { key: "totals", outcomes: [{ name: "Over", point: 57.5 }, { name: "Under", point: 57.5 }] },
        { key: "h2h", outcomes: [{ name: o.home, price: -160 }, { name: o.away, price: 140 }] },
      ],
    }],
  }];
}

function stubFetch(payload: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h === "x-requests-remaining" ? "500" : null) },
    json: async () => payload,
  }) as any));
}

/** One odds cycle. Clears the throttle first so cycles can be chained. */
async function runOddsCycle(league: "CFB" | "NFL" | "NBA" | "MLB", payload: unknown) {
  store.getPipelineDb().prepare("DELETE FROM odds_fetch_state").run();
  stubFetch(payload);
  return odds.ingestOdds(league as any);
}

const canonicalId = (league: string, iso: string, away: string, home: string) =>
  [league, iso.slice(0, 10).replace(/-/g, "_"), away, home].join("_");

type NameRow = { home_team: string; away_team: string; home_team_name: string | null; away_team_name: string | null };

const readNames = (id: string): NameRow =>
  store.getPipelineDb()
    .prepare("SELECT home_team, away_team, home_team_name, away_team_name FROM games WHERE id=?")
    .get(id) as NameRow;

beforeEach(() => {
  const db = store.getPipelineDb();
  for (const t of ["games", "odds_snapshots", "raw_events", "live_signals", "replay_audits", "odds_fetch_state"]) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/* ─── 1. The columns ────────────────────────────────────────────────── */

describe("the columns themselves", () => {
  it("exist on a fresh DB as nullable TEXT with no default", () => {
    const cols = store.getPipelineDb().prepare("PRAGMA table_info(games)").all() as Array<{
      name: string; type: string; notnull: number; dflt_value: unknown;
    }>;
    for (const name of ["home_team_name", "away_team_name"]) {
      const col = cols.find((c) => c.name === name);
      expect(col, `games.${name} missing`).toBeTruthy();
      expect(col!.type).toBe("TEXT");
      // NULL is the whole fallback contract on the client: no name stored means
      // print the token. A NOT NULL column with a '' default would make every
      // legacy row look named.
      expect(col!.notnull).toBe(0);
      expect(col!.dflt_value).toBeNull();
    }
  });
});

/* ─── 2 & 3. The odds adapter ───────────────────────────────────────── */

describe("the odds adapter stores the feed's names", () => {
  it("names the row on the pre-kickoff path, leaving the token columns alone", async () => {
    await runOddsCycle("CFB", oddsPayload({ commenceTime: FUTURE, home: CFB_HOME, away: CFB_AWAY, sportKey: "americanfootball_ncaaf" }));

    const id = canonicalId("CFB", FUTURE, CFB_AWAY_CODE, CFB_HOME_CODE);
    const row = readNames(id);
    expect(row.home_team_name).toBe(CFB_HOME);
    expect(row.away_team_name).toBe(CFB_AWAY);
    // The identity columns are what settlement, matching and every id are built
    // from. They must read exactly as they did before this column existed.
    expect(row.home_team).toBe(CFB_HOME_CODE);
    expect(row.away_team).toBe(CFB_AWAY_CODE);
  });

  it("names the row on the post-kickoff path, and still writes no market data", async () => {
    await runOddsCycle("CFB", oddsPayload({ commenceTime: PAST, home: CFB_HOME, away: CFB_AWAY, sportKey: "americanfootball_ncaaf" }));

    const id = canonicalId("CFB", PAST, CFB_AWAY_CODE, CFB_HOME_CODE);
    const row = readNames(id);
    expect(row.home_team_name).toBe(CFB_HOME);
    expect(row.away_team_name).toBe(CFB_AWAY);

    // The kickoff guard still holds: a name is a schedule fact, a price is not.
    const market = store.getPipelineDb()
      .prepare("SELECT spread_line, total_line, moneyline_home, moneyline_away, open_spread, open_total FROM games WHERE id=?")
      .get(id) as Record<string, number | null>;
    for (const [col, value] of Object.entries(market)) {
      expect(value, `games.${col} should still be NULL after kickoff`).toBeNull();
    }
    expect(store.getPipelineDb().prepare("SELECT COUNT(*) c FROM odds_snapshots").get()).toMatchObject({ c: 0 });
  });
});

/* ─── 4 & 5. Writers that have no name to give ──────────────────────── */

describe("a nameless writer cannot blank a stored name", () => {
  /**
   * The two adapters write the SAME row: canonicalGameId collapses them onto
   * LEAGUE_DATE_AWAY_HOME, and 147/111 are the StatsAPI ids for the Yankees and
   * the Red Sox, whose canonical codes (NYY/BOS) are what shortCode() produces
   * from the odds-API names too.
   */
  function mlbSchedulePayload(gameDate: string) {
    return {
      dates: [{
        date: gameDate.slice(0, 10),
        games: [{
          gamePk: 777001,
          gameDate,
          status: { abstractGameState: "Preview" },
          teams: {
            home: { team: { id: 147, name: MLB_HOME, abbreviation: "NYY" } },
            away: { team: { id: 111, name: MLB_AWAY, abbreviation: "BOS" } },
          },
        }],
      }],
    };
  }

  it("ingestMLBSchedule does not erase the name the odds adapter wrote", async () => {
    await runOddsCycle("MLB", oddsPayload({ commenceTime: FUTURE, home: MLB_HOME, away: MLB_AWAY, sportKey: "baseball_mlb" }));

    const id = canonicalId("MLB", FUTURE, "BOS", "NYY");
    expect(readNames(id)).toMatchObject({ home_team_name: MLB_HOME, away_team_name: MLB_AWAY });

    stubFetch(mlbSchedulePayload(FUTURE));
    const result = await mlb.ingestMLBSchedule();

    // The schedule pass really did reach this row — otherwise the assertion
    // below would pass for the wrong reason.
    expect(result).toMatchObject({ games: 1 });
    expect(store.getPipelineDb().prepare("SELECT COUNT(*) c FROM games").get()).toMatchObject({ c: 1 });

    // THIS is the assertion that fails with a plain =excluded assignment.
    expect(readNames(id)).toMatchObject({ home_team_name: MLB_HOME, away_team_name: MLB_AWAY });
  });

  it("upsertHistoricalGame neither writes a name nor erases one", () => {
    const id = "CFB_2026_10_08_COU_TIG";
    const historical = {
      id,
      league: "CFB" as const,
      home_team: CFB_HOME_CODE,
      away_team: CFB_AWAY_CODE,
      game_time: PAST,
      status: "final" as const,
      spread_line: -3.5,
      spread_team: CFB_HOME_CODE,
      total_line: 57.5,
      moneyline_home: -160,
      moneyline_away: 140,
      open_spread: -3.5,
      open_total: 57.5,
      home_score: 27,
      away_score: 24,
      source_game_id: "hist-1",
    };

    // Insert: the column is not in its INSERT list, so the row reads back NULL.
    store.upsertHistoricalGame(historical);
    expect(readNames(id)).toMatchObject({ home_team_name: null, away_team_name: null });

    // Conflict, on a row the odds adapter has since named: the column is not in
    // its ON CONFLICT clause either, so the name survives a backfill pass.
    store.upsertGame({ ...historical, home_team_name: CFB_HOME, away_team_name: CFB_AWAY });
    store.upsertHistoricalGame({ ...historical, home_score: 31 });
    expect(readNames(id)).toMatchObject({ home_team_name: CFB_HOME, away_team_name: CFB_AWAY });
    expect(store.getGame(id)?.home_score).toBe(31);
  });
});

/* ─── 6. Fill, never replace ────────────────────────────────────────── */

describe("a name can be set or corrected, never blanked", () => {
  const base = {
    id: "NFL_2026_11_22_NYG_DAL",
    league: "NFL" as const,
    home_team: "DAL",
    away_team: "NYG",
    game_time: FUTURE,
    status: "scheduled" as const,
    spread_line: null,
    spread_team: null,
    total_line: null,
    moneyline_home: null,
    moneyline_away: null,
    open_spread: null,
    open_total: null,
    home_score: null,
    away_score: null,
    source_game_id: "nfl-1",
  };

  it("upsertGame fills a NULL name, keeps it through a nameless cycle, and takes a correction", () => {
    store.upsertGame(base);
    expect(readNames(base.id)).toMatchObject({ home_team_name: null, away_team_name: null });

    store.upsertGame({ ...base, home_team_name: "Dallas Cowboys", away_team_name: "New York Giants" });
    expect(readNames(base.id)).toMatchObject({ home_team_name: "Dallas Cowboys", away_team_name: "New York Giants" });

    // A nameless cycle — the MLB case — changes nothing.
    store.upsertGame(base);
    expect(readNames(base.id)).toMatchObject({ home_team_name: "Dallas Cowboys", away_team_name: "New York Giants" });

    // A cycle that DOES carry a name wins, per side. That is the behaviour
    // COALESCE gives and the behaviour we want: the Athletics were renamed
    // twice in two seasons, and a frozen first name would still read
    // "Oakland Athletics" today. A NULL beside it still cannot blank.
    store.upsertGame({ ...base, home_team_name: "Dallas Cowboys (renamed)", away_team_name: null });
    expect(readNames(base.id)).toMatchObject({
      home_team_name: "Dallas Cowboys (renamed)",
      away_team_name: "New York Giants",
    });
  });

  it("touchGameSchedule fills a NULL name and a nameless call cannot blank it", () => {
    store.upsertGame(base);
    store.touchGameSchedule({
      id: base.id,
      league: "NFL",
      home_team: "DAL",
      away_team: "NYG",
      home_team_name: "Dallas Cowboys",
      away_team_name: "New York Giants",
      game_time: FUTURE,
      status: "scheduled",
      source_game_id: "nfl-1",
    });
    expect(readNames(base.id)).toMatchObject({ home_team_name: "Dallas Cowboys", away_team_name: "New York Giants" });

    store.touchGameSchedule({
      id: base.id,
      league: "NFL",
      home_team: "DAL",
      away_team: "NYG",
      game_time: FUTURE,
      status: "scheduled",
      source_game_id: "nfl-1",
    });
    expect(readNames(base.id)).toMatchObject({ home_team_name: "Dallas Cowboys", away_team_name: "New York Giants" });
  });
});

/* ─── 7. Replay hashes ──────────────────────────────────────────────── */

describe("replay hashes", () => {
  const GAME_ID = "CFB_2026_10_09_COU_TIG";
  const AS_OF = "2026-10-09T23:00:00.000Z";

  function seedReplayFixture(): void {
    store.upsertGame({
      id: GAME_ID,
      league: "CFB",
      home_team: CFB_HOME_CODE,
      away_team: CFB_AWAY_CODE,
      game_time: "2026-10-09T19:00:00.000Z",
      status: "scheduled",
      spread_line: -4,
      spread_team: CFB_HOME_CODE,
      total_line: 57.5,
      moneyline_home: -170,
      moneyline_away: 150,
      open_spread: -3.5,
      open_total: 56.5,
      home_score: null,
      away_score: null,
      source_game_id: "src-1",
    });
    store.insertOddsSnapshot({
      game_id: GAME_ID,
      league: "CFB",
      sportsbook: "pinnacle",
      spread_line: -3.5,
      spread_team: CFB_HOME_CODE,
      total_line: 56.5,
      moneyline_home: -165,
      moneyline_away: 145,
      source_game_id: "src-1",
      snapshot_at: "2026-10-09T17:00:00.000Z",
    });
    store.upsertLiveSignal({
      id: "sig-replay-1",
      league: "CFB",
      game_id: GAME_ID,
      signal_type: "line_move",
      headline: "Line move",
      body: "",
      action_note: "",
      why_it_matters: "",
      team: CFB_HOME_CODE,
      player: null,
      matchup: `${CFB_AWAY_CODE} @ ${CFB_HOME_CODE}`,
      sources: [{ name: "Pinnacle", type: "sportsbook" }],
      source_count: 1,
      verdict: "review",
      confidence: 70,
      confirmation_strength: "Developing",
      line_movement: { open: -3.5, current: -4, delta: 0.5, direction: "down" },
      injury_designation: null,
      lineup_status: null,
      weather_note: null,
      betting_relevance: true,
      fantasy_relevance: false,
      score: 70,
      score_band: "Strong",
      urgency_label: "WATCH",
      urgency_reason: "seed",
      trust_label: "Developing",
      score_explanation: "",
      breakdown: {},
      raw_event_ids: [],
      signal_time: "2026-10-09T18:00:00.000Z",
      first_seen_at: "2026-10-09T18:00:00.000Z",
      created_at: "2026-10-09T18:00:00.000Z",
      updated_at: "2026-10-09T18:00:00.000Z",
      outcome_id: null,
    } as any);
  }

  const hashes = () => {
    replay.getReplayState(GAME_ID, AS_OF);
    return store.getPipelineDb().prepare(`
      SELECT replay_hash, timeline_hash, signal_hash, snapshot_hash
      FROM replay_audits WHERE game_id=? ORDER BY created_at DESC, id DESC LIMIT 1
    `).get(GAME_ID) as Record<string, string>;
  };

  it("do not move when a games row is named", () => {
    seedReplayFixture();
    const before = hashes();

    store.upsertGame({
      id: GAME_ID,
      league: "CFB",
      home_team: CFB_HOME_CODE,
      away_team: CFB_AWAY_CODE,
      home_team_name: CFB_HOME,
      away_team_name: CFB_AWAY,
      game_time: "2026-10-09T19:00:00.000Z",
      status: "scheduled",
      spread_line: -4,
      spread_team: CFB_HOME_CODE,
      total_line: 57.5,
      moneyline_home: -170,
      moneyline_away: 150,
      open_spread: -3.5,
      open_total: 56.5,
      home_score: null,
      away_score: null,
      source_game_id: "src-1",
    });
    // The write landed — without this the comparison below is vacuous.
    expect(readNames(GAME_ID)).toMatchObject({ home_team_name: CFB_HOME, away_team_name: CFB_AWAY });

    expect(hashes()).toEqual(before);
  });

  it("DO move when the replay state itself changes", () => {
    seedReplayFixture();
    const before = hashes();

    store.insertOddsSnapshot({
      game_id: GAME_ID,
      league: "CFB",
      sportsbook: "pinnacle",
      spread_line: -4.5,
      spread_team: CFB_HOME_CODE,
      total_line: 57.5,
      moneyline_home: -175,
      moneyline_away: 155,
      source_game_id: "src-1",
      snapshot_at: "2026-10-09T20:00:00.000Z",
    });

    const after = hashes();
    expect(after.replay_hash).not.toBe(before.replay_hash);
    expect(after.snapshot_hash).not.toBe(before.snapshot_hash);
  });
});
