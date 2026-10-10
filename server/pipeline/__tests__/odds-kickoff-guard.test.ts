import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * The kickoff guard: once a game has started, the odds adapter must not write
 * anything that settlement reads as pre-game market information.
 *
 * WHY THIS EXISTS. getClosingSnapshot() is "newest odds_snapshots row for this
 * game" with no game_time bound, and `hit = clv > 0` grades every line_move
 * signal on a game against that one number. So one in-play snapshot made every
 * signal on the game lose together. Measured on prod: of 258 CFB outcomes in
 * the published record, 172 had a closing snapshot after kickoff, 154 of those
 * carrying a non-null clv. games.spread_line / total_line feed favoriteCovers()
 * and the weather branch, so injury, lineup and weather grading read in-play
 * numbers too.
 *
 * What this suite holds down:
 *   1. Before kickoff nothing changes — the guard is inert.
 *   2. After kickoff: no snapshot, no market-column overwrite, no line_move,
 *      no odds_open; status and source_game_id still track.
 *   3. MLB scope is env-driven: unguarded by DEFAULT (the shared-row
 *      doubleheader id collision in canonicalGameId), but guarded when
 *      ODDS_KICKOFF_GUARD_LEAGUES names it, which is the postseason switch.
 *      (ingestMLBSchedule is NOT a competing writer — it writes
 *      `existing?.<col> ?? null`, an idempotent read-then-write-back.)
 *   4. A game first seen after kickoff gets NULL market columns and never
 *      backfills them, across repeated cycles.
 *   5. The env kill switch restores d48eef6 behaviour exactly — that is the
 *      rollback path, so it is tested.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-kickoff-guard-"));
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

let store: StoreMod;
let odds: OddsMod;

beforeAll(async () => {
  store = await import("../store");
  odds = await import("../adapters/the-odds-api");
});

/* ─── Fixture ───────────────────────────────────────────────────────── */

const HOME = "Memphis Tigers";
const AWAY = "Houston Cougars";
/** shortCode() of the names above: both fall to the mascot slice. */
const HOME_CODE = "TIG";
const AWAY_CODE = "COU";

interface PayloadOpts {
  commenceTime: string;
  spread?: number | null;
  total?: number | null;
  mlHome?: number | null;
  mlAway?: number | null;
  home?: string;
  away?: string;
  sourceId?: string;
}

function oddsPayload(o: PayloadOpts) {
  const home = o.home ?? HOME;
  const away = o.away ?? AWAY;
  const spread = o.spread === undefined ? -3.5 : o.spread;
  const total = o.total === undefined ? 57.5 : o.total;
  return [{
    id: o.sourceId ?? "src-1",
    sport_key: "americanfootball_ncaaf",
    sport_title: "NCAAF",
    commence_time: o.commenceTime,
    home_team: home,
    away_team: away,
    bookmakers: [{
      key: "pinnacle",
      title: "Pinnacle",
      markets: [
        ...(spread === null ? [] : [{ key: "spreads", outcomes: [{ name: home, point: spread }, { name: away, point: -spread }] }]),
        ...(total === null ? [] : [{ key: "totals", outcomes: [{ name: "Over", point: total }, { name: "Under", point: total }] }]),
        { key: "h2h", outcomes: [{ name: home, price: o.mlHome ?? -160 }, { name: away, price: o.mlAway ?? 140 }] },
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

/** One ingest cycle. Clears the throttle first so cycles can be chained. */
async function runCycle(league: "CFB" | "NFL" | "NBA" | "MLB", payload: unknown) {
  store.getPipelineDb().prepare("DELETE FROM odds_fetch_state").run();
  stubFetch(payload);
  return odds.ingestOdds(league as any);
}

const gameIdFor = (league: string, date: string) => `${league}_${date.replace(/-/g, "_")}_${AWAY_CODE}_${HOME_CODE}`;

const PAST = "2026-10-08T19:00:00.000Z";   // long past
const FUTURE = "2099-10-08T19:00:00.000Z"; // comfortably future

const snapshotCount = (gameId: string) =>
  (store.getPipelineDb().prepare("SELECT COUNT(*) n FROM odds_snapshots WHERE game_id=?").get(gameId) as { n: number }).n;

const rawEventCount = (gameId: string, type: string) =>
  (store.getPipelineDb().prepare("SELECT COUNT(*) n FROM raw_events WHERE game_id=? AND event_type=?")
    .get(gameId, type) as { n: number }).n;

beforeEach(() => {
  const db = store.getPipelineDb();
  for (const t of ["odds_snapshots", "raw_events", "games", "odds_fetch_state"]) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
  delete process.env.ODDS_KICKOFF_GUARD;
  delete process.env.ODDS_KICKOFF_GUARD_LEAGUES;
  process.env.ODDS_MIN_INTERVAL_MIN = "1";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.ODDS_KICKOFF_GUARD;
  delete process.env.ODDS_KICKOFF_GUARD_LEAGUES;
});

/* ─── 1. Inert before kickoff ───────────────────────────────────────── */

describe("before kickoff the guard is inert", () => {
  for (const league of ["CFB", "NFL", "NBA"] as const) {
    it(`${league}: snapshot, market columns and line_move all still happen`, async () => {
      const id = gameIdFor(league, "2099-10-08");

      await runCycle(league, oddsPayload({ commenceTime: FUTURE }));
      expect(snapshotCount(id)).toBe(1);
      const first = store.getGame(id)!;
      expect(first.spread_line).toBe(-3.5);
      expect(first.total_line).toBe(57.5);
      expect(first.open_spread).toBe(-3.5);
      expect(rawEventCount(id, "odds_open")).toBe(1);

      // A second cycle with a >= 0.5 move from open must emit line_move.
      await runCycle(league, oddsPayload({ commenceTime: FUTURE, spread: -5.0, total: 60.0 }));
      expect(snapshotCount(id)).toBe(2);
      expect(store.getGame(id)!.spread_line).toBe(-5.0);
      expect(rawEventCount(id, "line_move")).toBe(2); // one spread, one total
    });
  }
});

/* ─── 2. Frozen after kickoff ───────────────────────────────────────── */

describe("after kickoff the market side is frozen", () => {
  for (const league of ["CFB", "NFL", "NBA"] as const) {
    it(`${league}: no snapshot, no market overwrite, no line_move`, async () => {
      const id = gameIdFor(league, "2026-10-08");

      // Seed a pre-game state the honest way: one cycle while it is still future,
      // then move the SAME game id to a past kickoff.
      await runCycle(league, oddsPayload({ commenceTime: PAST }));
      // First ever sighting is already post-kickoff, so nothing was written.
      expect(snapshotCount(id)).toBe(0);

      // Now give it a pre-game history, then freeze it.
      store.getPipelineDb().prepare("DELETE FROM games").run();
      store.upsertGame({
        id, league, home_team: HOME_CODE, away_team: AWAY_CODE,
        game_time: PAST, status: "scheduled",
        spread_line: -3.5, spread_team: HOME_CODE, total_line: 57.5,
        moneyline_home: -160, moneyline_away: 140,
        open_spread: -3.5, open_total: 57.5,
        home_score: null, away_score: null, source_game_id: "src-1",
      } as any);

      await runCycle(league, oddsPayload({
        commenceTime: PAST, spread: -17.5, total: 114.5, mlHome: -900, mlAway: 600, sourceId: "src-2",
      }));

      expect(snapshotCount(id)).toBe(0);
      const g = store.getGame(id)!;
      expect(g.spread_line).toBe(-3.5);      // pre-game value preserved
      expect(g.spread_team).toBe(HOME_CODE);
      expect(g.total_line).toBe(57.5);
      expect(g.moneyline_home).toBe(-160);
      expect(g.moneyline_away).toBe(140);
      expect(rawEventCount(id, "line_move")).toBe(0);
      expect(rawEventCount(id, "odds_open")).toBe(0);
      // Schedule columns still track.
      expect(g.source_game_id).toBe("src-2");
      expect(g.status).toBe("scheduled");
    });
  }

  it("does not drag a final game back to scheduled", async () => {
    const id = gameIdFor("CFB", "2026-10-08");
    store.upsertGame({
      id, league: "CFB", home_team: HOME_CODE, away_team: AWAY_CODE,
      game_time: PAST, status: "scheduled",
      spread_line: -3.5, spread_team: HOME_CODE, total_line: 57.5,
      moneyline_home: -160, moneyline_away: 140,
      open_spread: -3.5, open_total: 57.5,
      home_score: null, away_score: null, source_game_id: "src-1",
    } as any);
    store.updateGameFinal(id, 31, 17);

    await runCycle("CFB", oddsPayload({ commenceTime: PAST, spread: -17.5 }));

    const g = store.getGame(id)!;
    expect(g.status).toBe("final");
    expect(g.home_score).toBe(31);
  });
});

/* ─── 3. MLB is deliberately not guarded ────────────────────────────── */

/**
 * MLB is excluded by DEFAULT, not by construction. Both halves matter:
 * the default must leave it unguarded (so this deploy cannot change MLB
 * behaviour), and naming it in ODDS_KICKOFF_GUARD_LEAGUES must actually guard
 * it (so the postseason can be switched on by env alone, with no code change —
 * the MLB postseason schedules no doubleheaders, so the shared-row id
 * collision that keeps MLB out of the default is dormant in that window).
 */
describe("MLB scope is env-driven, not hardcoded", () => {
  /** Seeds a pre-game MLB row so an overwrite is detectable either way. */
  function seedPregameMLB(id: string) {
    store.upsertGame({
      id, league: "MLB", home_team: HOME_CODE, away_team: AWAY_CODE,
      game_time: PAST, status: "scheduled",
      spread_line: -1.5, spread_team: HOME_CODE, total_line: 8.5,
      moneyline_home: -160, moneyline_away: 140,
      open_spread: -1.5, open_total: 8.5,
      home_score: null, away_score: null, source_game_id: "src-1",
    } as any);
  }

  it("by default is NOT guarded — in-play numbers still land", async () => {
    const id = gameIdFor("MLB", "2026-10-08");
    seedPregameMLB(id);

    await runCycle("MLB", oddsPayload({ commenceTime: PAST, spread: -4.5, total: 12.5 }));

    // Unguarded: the in-play numbers land, exactly as before this change.
    expect(snapshotCount(id)).toBe(1);
    expect(store.getGame(id)!.spread_line).toBe(-4.5);
  });

  it("IS guarded when ODDS_KICKOFF_GUARD_LEAGUES names it (postseason switch)", async () => {
    process.env.ODDS_KICKOFF_GUARD_LEAGUES = "CFB,NFL,NBA,MLB";
    const id = gameIdFor("MLB", "2026-10-08");
    seedPregameMLB(id);

    await runCycle("MLB", oddsPayload({ commenceTime: PAST, spread: -4.5, total: 12.5 }));

    // No in-play snapshot, and the pre-game market columns survive untouched.
    expect(snapshotCount(id)).toBe(0);
    const g = store.getGame(id)!;
    expect(g.spread_line).toBe(-1.5);
    expect(g.total_line).toBe(8.5);
    expect(g.open_spread).toBe(-1.5);
    expect(rawEventCount(id, "line_move")).toBe(0);
    // Schedule side still tracks.
    expect(g.source_game_id).toBe("src-1");
  });

  it("leaves MLB unguarded when the override omits it", async () => {
    process.env.ODDS_KICKOFF_GUARD_LEAGUES = "CFB,NFL,NBA";
    const id = gameIdFor("MLB", "2026-10-08");
    seedPregameMLB(id);

    await runCycle("MLB", oddsPayload({ commenceTime: PAST, spread: -4.5, total: 12.5 }));

    expect(snapshotCount(id)).toBe(1);
    expect(store.getGame(id)!.spread_line).toBe(-4.5);
  });
});

/* ─── 4. First ingested after kickoff ───────────────────────────────── */

describe("a game first seen after kickoff", () => {
  it("is created with NULL market columns and no snapshot or odds_open", async () => {
    const id = gameIdFor("CFB", "2026-10-08");

    await runCycle("CFB", oddsPayload({ commenceTime: PAST, spread: -17.5, total: 114.5 }));

    const g = store.getGame(id)!;
    expect(g).toBeTruthy();
    expect(g.spread_line).toBeNull();
    expect(g.spread_team).toBeNull();
    expect(g.total_line).toBeNull();
    expect(g.moneyline_home).toBeNull();
    expect(g.moneyline_away).toBeNull();
    expect(g.open_spread).toBeNull();
    expect(g.open_total).toBeNull();
    expect(snapshotCount(id)).toBe(0);
    expect(rawEventCount(id, "odds_open")).toBe(0);
  });

  it("never backfills them on later cycles", async () => {
    const id = gameIdFor("CFB", "2026-10-08");

    await runCycle("CFB", oddsPayload({ commenceTime: PAST, spread: -17.5, total: 114.5 }));
    await runCycle("CFB", oddsPayload({ commenceTime: PAST, spread: -21.0, total: 120.5, sourceId: "src-9" }));

    const g = store.getGame(id)!;
    expect(g.spread_line).toBeNull();
    expect(g.total_line).toBeNull();
    expect(g.open_spread).toBeNull();
    expect(g.open_total).toBeNull();
    expect(snapshotCount(id)).toBe(0);
    expect(g.source_game_id).toBe("src-9"); // schedule side still tracks
  });
});

/* ─── 5-6. Reschedules ──────────────────────────────────────────────── */

describe("reschedules", () => {
  it("resumes writing when commence_time moves later (guard is non-monotonic by design)", async () => {
    const pastId = gameIdFor("CFB", "2026-10-08");

    await runCycle("CFB", oddsPayload({ commenceTime: PAST }));
    expect(snapshotCount(pastId)).toBe(0);

    // Postponed: the feed now reports a future kickoff. The id is date-derived,
    // so the postponed game is a different row — what matters is that writes
    // resume rather than staying frozen.
    await runCycle("CFB", oddsPayload({ commenceTime: FUTURE }));
    const futureId = gameIdFor("CFB", "2099-10-08");
    expect(snapshotCount(futureId)).toBe(1);
    expect(store.getGame(futureId)!.spread_line).toBe(-3.5);
  });

  it("freezes from the cycle commence_time moves into the past", async () => {
    const futureId = gameIdFor("CFB", "2099-10-08");

    await runCycle("CFB", oddsPayload({ commenceTime: FUTURE }));
    expect(snapshotCount(futureId)).toBe(1);

    // Same row, now reported as started.
    store.getPipelineDb()
      .prepare("UPDATE games SET game_time=? WHERE id=?").run(PAST, futureId);
    await runCycle("CFB", oddsPayload({ commenceTime: PAST }));

    expect(snapshotCount(futureId)).toBe(1); // no new snapshot for the frozen row
  });
});

/* ─── 7-8. Env control ──────────────────────────────────────────────── */

describe("env control", () => {
  it("ODDS_KICKOFF_GUARD=0 restores the pre-guard behaviour exactly", async () => {
    process.env.ODDS_KICKOFF_GUARD = "0";
    const id = gameIdFor("CFB", "2026-10-08");

    await runCycle("CFB", oddsPayload({ commenceTime: PAST, spread: -17.5, total: 114.5 }));

    expect(snapshotCount(id)).toBe(1);
    const g = store.getGame(id)!;
    expect(g.spread_line).toBe(-17.5);
    expect(g.total_line).toBe(114.5);
    expect(g.open_spread).toBe(-17.5);
    expect(rawEventCount(id, "odds_open")).toBe(1);
  });

  it("ODDS_KICKOFF_GUARD_LEAGUES=CFB leaves NFL unguarded", async () => {
    process.env.ODDS_KICKOFF_GUARD_LEAGUES = "CFB";

    await runCycle("CFB", oddsPayload({ commenceTime: PAST }));
    expect(snapshotCount(gameIdFor("CFB", "2026-10-08"))).toBe(0);

    await runCycle("NFL", oddsPayload({ commenceTime: PAST }));
    expect(snapshotCount(gameIdFor("NFL", "2026-10-08"))).toBe(1);
  });
});

/* ─── 9. Bad commence_time fails open ──────────────────────────────── */

describe("unparseable commence_time", () => {
  it("fails open and warns rather than freezing the game", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch(oddsPayload({ commenceTime: "not-a-date" }));
    store.getPipelineDb().prepare("DELETE FROM odds_fetch_state").run();

    await odds.ingestOdds("CFB" as any);

    // date(?) of a junk string yields a junk id, so assert on the table totals.
    const total = (store.getPipelineDb()
      .prepare("SELECT COUNT(*) n FROM odds_snapshots").get() as { n: number }).n;
    expect(total).toBe(1);
    expect(warn.mock.calls.some((c) => String(c[0]).includes("unparseable commence_time"))).toBe(true);
  });
});

/* ─── 10. Delayed start ─────────────────────────────────────────────── */

describe("delayed start", () => {
  it("stays frozen at the scheduled time while the feed keeps the old commence_time", async () => {
    const id = gameIdFor("CFB", "2026-10-08");
    store.upsertGame({
      id, league: "CFB", home_team: HOME_CODE, away_team: AWAY_CODE,
      game_time: PAST, status: "scheduled",
      spread_line: -3.5, spread_team: HOME_CODE, total_line: 57.5,
      moneyline_home: -160, moneyline_away: 140,
      open_spread: -3.5, open_total: 57.5,
      home_score: null, away_score: null, source_game_id: "src-1",
    } as any);

    // Three cycles through the "delay": commence_time never moves, so the guard
    // holds at scheduled time and the pre-game line is what survives.
    for (const spread of [-4.0, -6.5, -9.0]) {
      await runCycle("CFB", oddsPayload({ commenceTime: PAST, spread }));
    }

    expect(snapshotCount(id)).toBe(0);
    expect(store.getGame(id)!.spread_line).toBe(-3.5);
  });
});

/* ─── 11. Logging ──────────────────────────────────────────────────── */

describe("observability", () => {
  it("logs how many games were frozen this cycle", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCycle("CFB", oddsPayload({ commenceTime: PAST }));

    const lines = log.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.includes("past kickoff") && l.includes("ODDS_KICKOFF_GUARD"))).toBe(true);
  });

  it("says nothing when no game is frozen", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCycle("CFB", oddsPayload({ commenceTime: FUTURE }));

    expect(log.mock.calls.map((c) => String(c[0])).some((l) => l.includes("past kickoff"))).toBe(false);
  });

  /**
   * Books commonly pull every market once a game goes in-play, so a
   * post-kickoff game often arrives with an empty `bookmakers` array. That is
   * the population the counter most needs to show; counting after the
   * bookmaker `continue` hid it entirely.
   */
  it("counts a post-kickoff game whose books pulled all markets", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCycle("CFB", [{
      id: "src-nobooks",
      sport_key: "americanfootball_ncaaf",
      sport_title: "NCAAF",
      commence_time: PAST,
      home_team: HOME,
      away_team: AWAY,
      bookmakers: [],
    }]);

    const lines = log.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.includes("1 of 1 game(s) past kickoff"))).toBe(true);
    // Nothing was written either way — there were no prices to write.
    expect(snapshotCount(gameIdFor("CFB", "2026-10-08"))).toBe(0);
  });

  it("does not count a bookmaker-less game that has NOT started", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCycle("CFB", [{
      id: "src-nobooks-future",
      sport_key: "americanfootball_ncaaf",
      sport_title: "NCAAF",
      commence_time: FUTURE,
      home_team: HOME,
      away_team: AWAY,
      bookmakers: [],
    }]);

    expect(log.mock.calls.map((c) => String(c[0])).some((l) => l.includes("past kickoff"))).toBe(false);
  });
});

/* ─── 12. The cycle clock is read after the fetch ───────────────────── */

describe("cycle clock", () => {
  /**
   * cycleNowMs is read AFTER fetchOdds resolves. On a pre-fetch clock, a game
   * kicking off during the HTTP round trip reads as not-started and gets one
   * in-play snapshot written. Here the fetch itself consumes the time between
   * "not yet started" and "started", which is exactly the leak window.
   */
  it("judges kickoff against a clock no earlier than the prices in hand", async () => {
    // Kickoff 50ms from now; the stubbed fetch takes 200ms to resolve, so the
    // game has started by the time the prices arrive.
    const kickoff = new Date(Date.now() + 50).toISOString();
    // The id is derived from the kickoff DATE, so it must be built from the
    // same timestamp — a hardcoded date here makes every assertion vacuous.
    const id = gameIdFor("CFB", kickoff.slice(0, 10));

    store.getPipelineDb().prepare("DELETE FROM odds_fetch_state").run();
    vi.stubGlobal("fetch", vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 200));
      return {
        ok: true,
        status: 200,
        headers: { get: (h: string) => (h === "x-requests-remaining" ? "500" : null) },
        json: async () => oddsPayload({ commenceTime: kickoff }),
      } as any;
    }));

    await odds.ingestOdds("CFB" as any);

    expect(snapshotCount(id)).toBe(0);
    expect(store.getGame(id)?.spread_line ?? null).toBeNull();
  });
});
