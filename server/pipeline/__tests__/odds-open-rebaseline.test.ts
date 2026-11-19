import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Re-baselining an opener that was never observed.
 *
 * WHY THIS EXISTS. games.open_spread is insert-only, so on prod every future
 * NFL game carries an opener from 2026-08-01 — the cycle the season's futures
 * were posted, 111 to 121 days before kickoff. NFL_2026_11_22_PIT_PHI has
 * open_spread -5.5 against a current line of +4.5, and the adapter published
 * that ten-point difference as a line_move with the key-number bonus attached,
 * while retrieval.ts offered it as market evidence for unrelated injury claims.
 *
 * THE SIGN CONVENTION IS CHECKED FIRST (group 1), because a ten-point flip
 * reads like a perspective mismatch and the whole fix depends on it not being
 * one. It is not: both columns are the HOME team's number, written from one
 * variable in one upsertGame call, and prod agrees in all 2,056 rows that
 * carry a spread.
 *
 * What the rest holds down:
 *   2. the predicate — what counts as a gap, and who was ingesting during it;
 *   3. the writer — the single audited exception to the insert-only rule,
 *      and that #87's kickoff guard still wins where they meet;
 *   4. the adapter — re-baseline, suppress, and the CYCLE-2 REGRESSION: the
 *      next cycle's delta must be measured from the NEW opener (0.5), not
 *      the one we replaced (3.5);
 *   5. replay hashes do not move, because `games` is not a replay input.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-open-rebaseline-"));
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
type RebaseMod = typeof import("../odds-open-rebaseline");
type ReplayMod = typeof import("../replay");

let store: StoreMod;
let odds: OddsMod;
let rebase: RebaseMod;
let replay: ReplayMod;

beforeAll(async () => {
  store = await import("../store");
  odds = await import("../adapters/the-odds-api");
  rebase = await import("../odds-open-rebaseline");
  replay = await import("../replay");
});

/* ─── Fixture ───────────────────────────────────────────────────────── */

const HOME = "Philadelphia Eagles";
const AWAY = "Pittsburgh Steelers";
const HOME_CODE = "PHI";
const AWAY_CODE = "PIT";

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** Comfortably future, and stable across the whole run. */
const FUTURE = "2099-11-22T21:25:00.000Z";
const PAST = "2020-11-22T21:25:00.000Z";
const GAME_ID = `NFL_2099_11_22_${AWAY_CODE}_${HOME_CODE}`;

interface PayloadOpts {
  commenceTime?: string;
  spread?: number | null;
  total?: number | null;
  home?: string;
  away?: string;
}

function oddsPayload(o: PayloadOpts = {}) {
  const home = o.home ?? HOME;
  const away = o.away ?? AWAY;
  const spread = o.spread === undefined ? -5.5 : o.spread;
  const total = o.total === undefined ? 42.5 : o.total;
  return [{
    id: "src-1",
    sport_key: "americanfootball_nfl",
    sport_title: "NFL",
    commence_time: o.commenceTime ?? FUTURE,
    home_team: home,
    away_team: away,
    bookmakers: [{
      key: "pinnacle",
      title: "Pinnacle",
      markets: [
        ...(spread === null ? [] : [{ key: "spreads", outcomes: [{ name: home, point: spread }, { name: away, point: -spread }] }]),
        ...(total === null ? [] : [{ key: "totals", outcomes: [{ name: "Over", point: total }, { name: "Under", point: total }] }]),
        { key: "h2h", outcomes: [{ name: home, price: -160 }, { name: away, price: 140 }] },
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

/**
 * The real Date.now, captured before any test can spy on it.
 *
 * Each chained cycle has to land on its OWN instant. NEWEST_SNAPSHOT_SQL is
 * `snapshot_at < asOf` (STRICT, so a cycle cannot find the row it just wrote),
 * and the adapter stamps every snapshot with the cycle clock. Two cycles on
 * the same millisecond therefore make cycle 2 skip cycle 1's row as well as
 * its own, find the PRE-GAP seed as "newest", measure the old hole all over
 * again, and re-baseline a second time.
 *
 * That is not reachable in prod — shouldSkipOddsFetch throttles each league to
 * one successful fetch per ODDS_MIN_INTERVAL_MIN (default 60) — but it is very
 * reachable on a fast CI runner, where two awaits can resolve inside one
 * millisecond. It is what turned T17 red on GitHub while it passed locally.
 * Reproduced directly before this fix: same millisecond gives -2.0, a minute
 * apart gives -2.5.
 */
const REAL_NOW = Date.now.bind(Date);
let cycleClockOffsetMs = 0;

/** One ingest cycle. Clears the throttle first so cycles can be chained. */
async function runCycle(league: "CFB" | "NFL" | "NBA" | "MLB", payload: unknown) {
  store.getPipelineDb().prepare("DELETE FROM odds_fetch_state").run();
  stubFetch(payload);
  // A minute per cycle: enough that no two share an instant, far below any
  // threshold in play (the smallest is 3 DAYS), so no test's meaning changes.
  cycleClockOffsetMs += 60_000;
  vi.spyOn(Date, "now").mockImplementation(() => REAL_NOW() + cycleClockOffsetMs);
  return odds.ingestOdds(league as any);
}

const db = () => store.getPipelineDb();

const rawEvents = (gameId: string, type: string) =>
  db().prepare("SELECT * FROM raw_events WHERE game_id=? AND event_type=? ORDER BY received_at ASC")
    .all(gameId, type) as Array<{ payload: string }>;

const moveDeltas = (gameId: string, market: "spread" | "total") =>
  rawEvents(gameId, "line_move")
    .map(r => JSON.parse(r.payload as any))
    .filter(p => p.market === market)
    .map(p => p.line_delta);

/** A snapshot at an explicit instant, for building a history with a hole in it. */
function snapshotAt(gameId: string, league: string, atMs: number, spread: number, total: number) {
  store.insertOddsSnapshot({
    game_id: gameId, league, sportsbook: "pinnacle",
    spread_line: spread, spread_team: HOME_CODE, total_line: total,
    moneyline_home: -160, moneyline_away: 140,
    source_game_id: "src-1", snapshot_at: iso(atMs),
  });
}

/** The games row as the adapter would have left it before the gap. */
function seedGame(opts: {
  id?: string; league?: string; gameTime?: string; status?: string;
  openSpread?: number | null; openTotal?: number | null;
  spreadLine?: number | null; totalLine?: number | null;
} = {}) {
  store.upsertGame({
    id: opts.id ?? GAME_ID,
    league: opts.league ?? "NFL",
    home_team: HOME_CODE,
    away_team: AWAY_CODE,
    home_team_name: HOME,
    away_team_name: AWAY,
    game_time: opts.gameTime ?? FUTURE,
    status: (opts.status ?? "scheduled") as any,
    spread_line: opts.spreadLine === undefined ? -5.5 : opts.spreadLine,
    spread_team: HOME_CODE,
    total_line: opts.totalLine === undefined ? 42.5 : opts.totalLine,
    moneyline_home: -160,
    moneyline_away: 140,
    open_spread: opts.openSpread === undefined ? -5.5 : opts.openSpread,
    open_total: opts.openTotal === undefined ? 42.5 : opts.openTotal,
    home_score: null,
    away_score: null,
    source_game_id: "src-1",
  });
}

beforeEach(() => {
  for (const t of ["odds_snapshots", "raw_events", "games", "odds_fetch_state", "live_signals", "replay_audits"]) {
    try { db().prepare(`DELETE FROM ${t}`).run(); } catch { /* optional table */ }
  }
  delete process.env.ODDS_KICKOFF_GUARD;
  delete process.env.ODDS_KICKOFF_GUARD_LEAGUES;
  delete process.env.ODDS_OPEN_REBASELINE_DAYS;
  delete process.env.ODDS_OPEN_REBASELINE;
  process.env.ODDS_MIN_INTERVAL_MIN = "1";
  cycleClockOffsetMs = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.ODDS_OPEN_REBASELINE_DAYS;
  delete process.env.ODDS_OPEN_REBASELINE;
});

/* ═══ 1. The sign convention ═════════════════════════════════════════ */

describe("1. spread_line and open_spread are one perspective", () => {
  it("T1 — both are the HOME team's number on first ingest, and spread_team names the home side", async () => {
    await runCycle("NFL", oddsPayload({ spread: -5.5, total: 42.5 }));

    const g = store.getGame(GAME_ID)!;
    expect(g.home_team).toBe(HOME_CODE);
    expect(g.spread_team).toBe(HOME_CODE);        // the home code, not the favourite's
    expect(g.spread_line).toBe(-5.5);
    expect(g.open_spread).toBe(-5.5);             // same value, same sign, same call
    expect(g.open_total).toBe(42.5);
  });

  it("T2 — a HOME UNDERDOG stores a POSITIVE number in both columns, so there is no second convention", async () => {
    // The row that would disprove "spread_team is the favourite": the home
    // side is a 4.5-point dog, spread_team is still the home code, and the
    // sign is positive in open_spread too. 47 NFL rows on prod look like this.
    await runCycle("NFL", oddsPayload({ spread: 4.5, total: 37.5 }));

    const g = store.getGame(GAME_ID)!;
    expect(g.spread_line).toBe(4.5);
    expect(g.open_spread).toBe(4.5);
    expect(g.spread_team).toBe(HOME_CODE);
    expect(g.spread_team).not.toBe(AWAY_CODE);
  });

  it("T3 — only spread_line tracks; open_spread is insert-only across cycles", async () => {
    await runCycle("NFL", oddsPayload({ spread: -5.5 }));
    await runCycle("NFL", oddsPayload({ spread: 4.5 }));

    const g = store.getGame(GAME_ID)!;
    expect(g.spread_line).toBe(4.5);
    expect(g.open_spread).toBe(-5.5);   // untouched by ON CONFLICT — the bug's mechanism
  });
});

/* ═══ 2. The predicate ═══════════════════════════════════════════════ */

describe("2. resolveObservedOpener", () => {
  const now = Date.parse("2026-11-19T12:00:00.000Z");
  const asOfIso = iso(now);

  it("T4 — a recent prior snapshot is an observed opener", () => {
    snapshotAt(GAME_ID, "NFL", now - 2 * DAY, -5.5, 42.5);
    snapshotAt(GAME_ID, "NFL", now - 1 * DAY, -5.0, 42.0);

    const obs = rebase.resolveObservedOpener({
      gameId: GAME_ID, league: "NFL", openSpread: -5.5, openTotal: 42.5, asOfIso,
    });
    expect(obs.status).toBe("observed");
    expect(obs.observed).toBe(true);
    expect(obs.shouldRebaseline).toBe(false);
  });

  it("T5 — no snapshot history is not a gap", () => {
    const obs = rebase.resolveObservedOpener({
      gameId: GAME_ID, league: "NFL", openSpread: -5.5, openTotal: 42.5, asOfIso,
    });
    expect(obs.status).toBe("no_history");
    expect(obs.shouldRebaseline).toBe(false);
  });

  it("T6 — no opener is nothing to judge", () => {
    snapshotAt(GAME_ID, "NFL", now - 40 * DAY, -5.5, 42.5);
    const obs = rebase.resolveObservedOpener({
      gameId: GAME_ID, league: "NFL", openSpread: null, openTotal: null, asOfIso,
    });
    expect(obs.status).toBe("no_open");
    expect(obs.shouldRebaseline).toBe(false);
  });

  it("T7 — an interior gap with the league still ingesting re-baselines to the post-gap line", () => {
    snapshotAt(GAME_ID, "NFL", now - 110 * DAY, -5.5, 42.5);   // the August opener
    // The run back, dense enough that no step in it is itself a gap.
    for (const d of [8, 6, 4, 2, 1]) snapshotAt(GAME_ID, "NFL", now - d * DAY, d === 8 ? -2.5 : -2.0, d === 8 ? 38.5 : 38.0);
    // Another NFL game, ingested right through the hole.
    snapshotAt("NFL_OTHER", "NFL", now - 60 * DAY, -3, 44);

    const obs = rebase.resolveObservedOpener({
      gameId: GAME_ID, league: "NFL", openSpread: -5.5, openTotal: 42.5, asOfIso,
    });
    expect(obs.status).toBe("gap_league_active");
    expect(obs.shouldRebaseline).toBe(true);
    expect(obs.gapDays).toBe(102);
    expect(obs.gapFrom).toBe(iso(now - 110 * DAY));
    expect(obs.gapTo).toBe(iso(now - 8 * DAY));
    expect(obs.postGapSpread).toBe(-2.5);       // the line we actually saw first, after the hole
    expect(obs.postGapTotal).toBe(38.5);
  });

  it("T8 — the same gap with the league silent keeps the opener", () => {
    snapshotAt(GAME_ID, "NFL", now - 110 * DAY, -5.5, 42.5);
    for (const d of [8, 6, 4, 2, 1]) snapshotAt(GAME_ID, "NFL", now - d * DAY, -2.5, 38.5);
    // A CFB row inside the window is NOT NFL activity.
    snapshotAt("CFB_OTHER", "CFB", now - 60 * DAY, -3, 44);

    const obs = rebase.resolveObservedOpener({
      gameId: GAME_ID, league: "NFL", openSpread: -5.5, openTotal: 42.5, asOfIso,
    });
    expect(obs.status).toBe("gap_league_silent");
    expect(obs.observed).toBe(false);
    expect(obs.shouldRebaseline).toBe(false);
  });

  it("T9 — the caller's own asOf never counts as history, nor do its cycle-mates", () => {
    // The adapter writes this cycle's snapshot BEFORE asking. If the predicate
    // counted it, the tail gap would always be zero and the hole invisible;
    // if LEAGUE_ACTIVE counted the slate's other games at the same instant,
    // every game would look "league active" during its own cycle.
    snapshotAt(GAME_ID, "NFL", now - 30 * DAY, -5.5, 42.5);
    snapshotAt(GAME_ID, "NFL", now, -2.5, 38.5);              // this cycle, stamped asOf
    snapshotAt("NFL_OTHER", "NFL", now, -3, 44);              // a cycle-mate, same instant

    const obs = rebase.resolveObservedOpener({
      gameId: GAME_ID, league: "NFL", openSpread: -5.5, openTotal: 42.5, asOfIso,
    });
    expect(obs.gapDays).toBe(30);                 // the tail gap is seen
    expect(obs.gapTo).toBeNull();                 // it runs to asOf
    expect(obs.status).toBe("gap_league_silent"); // the cycle-mate did not vote
    expect(obs.shouldRebaseline).toBe(false);
  });

  it("T10 — the threshold is 3 days by default and ODDS_OPEN_REBASELINE_DAYS overrides it", () => {
    snapshotAt(GAME_ID, "NFL", now - 5 * DAY, -5.5, 42.5);
    snapshotAt("NFL_OTHER", "NFL", now - 2 * DAY, -3, 44);
    const ask = () => rebase.resolveObservedOpener({
      gameId: GAME_ID, league: "NFL", openSpread: -5.5, openTotal: 42.5, asOfIso,
    });

    expect(rebase.DEFAULT_REBASELINE_DAYS).toBe(3);
    expect(rebase.oddsOpenRebaselineDays()).toBe(3);
    expect(ask().status).toBe("gap_league_active");   // 5d > 3d

    process.env.ODDS_OPEN_REBASELINE_DAYS = "7";
    expect(rebase.oddsOpenRebaselineDays()).toBe(7);
    expect(ask().status).toBe("observed");            // 5d < 7d

    process.env.ODDS_OPEN_REBASELINE_DAYS = "nonsense";
    expect(rebase.oddsOpenRebaselineDays()).toBe(3);  // junk falls back, not to 0
  });
});

/* ═══ 3. The writer ══════════════════════════════════════════════════ */

describe("3. rebaselineGameOpen", () => {
  it("T11 — writes the two opener columns and leaves every other column alone", () => {
    seedGame();
    const before = store.getGame(GAME_ID)! as Record<string, unknown>;

    const result = rebase.rebaselineGameOpen(GAME_ID, -2.5, 38.5, "test", { quiet: true });
    expect(result).toMatchObject({ written: true, from: { spread: -5.5, total: 42.5 }, to: { spread: -2.5, total: 38.5 } });

    const after = store.getGame(GAME_ID)! as Record<string, unknown>;
    expect(after.open_spread).toBe(-2.5);
    expect(after.open_total).toBe(38.5);
    for (const col of Object.keys(before)) {
      if (col === "open_spread" || col === "open_total" || col === "updated_at") continue;
      expect([col, after[col]]).toEqual([col, before[col]]);
    }
  });

  it("T12 — refuses after kickoff, so the #87 guard wins where the two meet", () => {
    seedGame({ gameTime: PAST });
    expect(rebase.rebaselineGameOpen(GAME_ID, -2.5, 38.5, "test", { quiet: true }))
      .toEqual({ written: false, reason: "started" });
    expect(store.getGame(GAME_ID)!.open_spread).toBe(-5.5);
  });

  it("T13 — refuses a final game, a missing game, and an unchanged value", () => {
    seedGame({ status: "final" });
    expect(rebase.rebaselineGameOpen(GAME_ID, -2.5, 38.5, "t", { quiet: true }))
      .toEqual({ written: false, reason: "final" });

    expect(rebase.rebaselineGameOpen("NOPE", -2.5, 38.5, "t", { quiet: true }))
      .toEqual({ written: false, reason: "missing" });

    seedGame({ id: "NFL_2099_11_22_A_B", status: "scheduled" });
    expect(rebase.rebaselineGameOpen("NFL_2099_11_22_A_B", -5.5, 42.5, "t", { quiet: true }))
      .toEqual({ written: false, reason: "unchanged" });
  });

  it("T14 — a null never erases a stored opener", () => {
    seedGame();
    rebase.rebaselineGameOpen(GAME_ID, -2.5, null, "test", { quiet: true });
    const g = store.getGame(GAME_ID)!;
    expect(g.open_spread).toBe(-2.5);
    expect(g.open_total).toBe(42.5);   // kept, not nulled

    expect(rebase.rebaselineGameOpen(GAME_ID, null, null, "test", { quiet: true }))
      .toEqual({ written: false, reason: "nothing_to_write" });
  });

  it("T15 — upsertGame's ON CONFLICT still cannot move either column", () => {
    // The insert-only invariant is what makes rebaselineGameOpen the ONLY
    // other writer. If this ever goes green the exception stops being one.
    seedGame();
    seedGame({ openSpread: 99, openTotal: 99, spreadLine: -1, totalLine: 50 });

    const g = store.getGame(GAME_ID)!;
    expect(g.spread_line).toBe(-1);     // ON CONFLICT does update this
    expect(g.open_spread).toBe(-5.5);   // and deliberately not this
    expect(g.open_total).toBe(42.5);
  });
});

/* ═══ 4. The adapter ═════════════════════════════════════════════════ */

describe("4. the odds adapter", () => {
  /**
   * The prod shape: an opener from months ago, a hole, and the league ingested
   * all the way through it. Returns the instant the hole ends.
   */
  function seedGappedGame(openSpread = -5.5, openTotal = 42.5) {
    const now = Date.now();
    seedGame({ openSpread, openTotal, spreadLine: openSpread, totalLine: openTotal });
    snapshotAt(GAME_ID, "NFL", now - 110 * DAY, openSpread, openTotal);
    snapshotAt("NFL_OTHER", "NFL", now - 60 * DAY, -3, 44);   // league alive in the hole
  }

  it("T16 — a gap with the league ingesting re-baselines the opener and emits NO move that cycle", async () => {
    seedGappedGame();

    await runCycle("NFL", oddsPayload({ spread: -2.5, total: 38.5 }));

    const g = store.getGame(GAME_ID)!;
    expect(g.spread_line).toBe(-2.5);
    expect(g.open_spread).toBe(-2.5);    // re-baselined to the line in hand
    expect(g.open_total).toBe(38.5);
    // Unfixed, this cycle published |−2.5 − (−5.5)| = 3.0 as a market move.
    expect(rawEvents(GAME_ID, "line_move")).toHaveLength(0);
  });

  it("T17 — CYCLE-2 REGRESSION: the next cycle measures 0.5 from the NEW opener, not 3.5 from the old one", async () => {
    seedGappedGame();

    // Cycle 1: the hole closes. Opener becomes -2.5 / 38.5, nothing published.
    await runCycle("NFL", oddsPayload({ spread: -2.5, total: 38.5 }));
    expect(store.getGame(GAME_ID)!.open_spread).toBe(-2.5);
    expect(rawEvents(GAME_ID, "line_move")).toHaveLength(0);

    // Cycle 2: a real half-point move, moments later, so there is no new gap.
    await runCycle("NFL", oddsPayload({ spread: -2.0, total: 39.0 }));

    expect(store.getGame(GAME_ID)!.open_spread).toBe(-2.5);   // not moved again
    expect(moveDeltas(GAME_ID, "spread")).toEqual([0.5]);
    expect(moveDeltas(GAME_ID, "spread")).not.toContain(3.5); // the stale-opener answer
    expect(moveDeltas(GAME_ID, "total")).toEqual([0.5]);

    const payload = JSON.parse(rawEvents(GAME_ID, "line_move")[0].payload as any);
    expect(payload.open_line).toBe(-2.5);
    expect(payload.current_line).toBe(-2.0);
    // -5.5 → -2.0 crosses 3 and 3.5; -2.5 → -2.0 crosses nothing.
    expect(payload.crossed_key_number).toBe(false);
  });

  it("T18 — a league-wide silence keeps the opener and suppresses the move", async () => {
    const now = Date.now();
    seedGame({ openSpread: -5.5, openTotal: 42.5, spreadLine: -5.5, totalLine: 42.5 });
    snapshotAt(GAME_ID, "NFL", now - 10 * DAY, -5.5, 42.5);   // and nothing else, anywhere

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { logs.push(a.join(" ")); });

    await runCycle("NFL", oddsPayload({ spread: -2.5, total: 38.5 }));

    const g = store.getGame(GAME_ID)!;
    expect(g.open_spread).toBe(-5.5);     // kept: we cannot say the market moved
    expect(g.spread_line).toBe(-2.5);     // the current line still tracks
    expect(rawEvents(GAME_ID, "line_move")).toHaveLength(0);

    const line = logs.find(l => l.includes("move_suppressed_unobserved"));
    expect(line).toBeDefined();
    expect(line).toContain("[odds-open]");
    expect(JSON.parse(line!.replace("[odds-open] ", ""))).toMatchObject({
      event: "move_suppressed_unobserved",
      game_id: GAME_ID,
      status: "gap_league_silent",
      stored_open_spread: -5.5,
      current_spread: -2.5,
    });
  });

  it("T19 — an unbroken history is untouched: the opener holds and moves still publish", async () => {
    const now = Date.now();
    seedGame({ openSpread: -5.5, openTotal: 42.5, spreadLine: -5.5, totalLine: 42.5 });
    snapshotAt(GAME_ID, "NFL", now - 2 * DAY, -5.5, 42.5);
    snapshotAt(GAME_ID, "NFL", now - 1 * DAY, -5.5, 42.5);

    await runCycle("NFL", oddsPayload({ spread: -4.5, total: 43.5 }));

    expect(store.getGame(GAME_ID)!.open_spread).toBe(-5.5);
    expect(moveDeltas(GAME_ID, "spread")).toEqual([1]);
  });

  it("T20 — after kickoff nothing is re-baselined, because nothing is written at all", async () => {
    const now = Date.now();
    const startedId = `NFL_2020_11_22_${AWAY_CODE}_${HOME_CODE}`;
    seedGame({ id: startedId, gameTime: PAST, openSpread: -5.5, openTotal: 42.5, spreadLine: -5.5, totalLine: 42.5 });
    snapshotAt(startedId, "NFL", now - 110 * DAY, -5.5, 42.5);
    snapshotAt("NFL_OTHER", "NFL", now - 60 * DAY, -3, 44);

    await runCycle("NFL", oddsPayload({ commenceTime: PAST, spread: 3.5, total: 50.5 }));

    const g = store.getGame(startedId)!;
    expect(g.open_spread).toBe(-5.5);   // #87 froze the row before this change could ask
    expect(g.spread_line).toBe(-5.5);
    expect(rawEvents(startedId, "line_move")).toHaveLength(0);
  });
  it("T35 — SCOPE BOUNDARY: a hole already behind a fresh tail is the repair's job, not the cycle's", async () => {
    // The division of labour, pinned. This game crossed its hole days ago and
    // has been ingested hourly since, so its tail is clean. The adapter must
    // leave it completely alone — it looks only at the tail, which costs 4ms
    // a slate instead of 802ms — and the repair must still find it.
    const now = Date.now();
    seedGame({ openSpread: -5.5, openTotal: 42.5, spreadLine: -2.0, totalLine: 38.0 });
    snapshotAt(GAME_ID, "NFL", now - 110 * DAY, -5.5, 42.5);
    snapshotAt(GAME_ID, "NFL", now - 8 * DAY, -2.5, 38.5);        // first line back
    for (const d of [6, 4, 2, 1]) snapshotAt(GAME_ID, "NFL", now - d * DAY, -2.0, 38.0);
    snapshotAt("NFL_OTHER", "NFL", now - 60 * DAY, -3, 44);

    await runCycle("NFL", oddsPayload({ spread: -1.5, total: 38.0 }));

    // Untouched by the cycle, and the move it publishes is still the stale
    // one — that is the cost of the scope split, and why the repair is run.
    expect(store.getGame(GAME_ID)!.open_spread).toBe(-5.5);
    expect(moveDeltas(GAME_ID, "spread")).toEqual([4]);

    // The repair sees exactly this game.
    const plan = rebase.planOpenerRepair({ leagues: ["NFL"], nowIso: iso(now) });
    expect(plan.map(c => [c.game_id, c.verdict])).toEqual([[GAME_ID, "rebaseline"]]);
    expect(plan[0].new_open_spread).toBe(-2.5);
  });

  it("T36 — and after the repair has run, the next cycle measures from the repaired opener", async () => {
    const now = Date.now();
    seedGame({ openSpread: -5.5, openTotal: 42.5, spreadLine: -2.0, totalLine: 38.0 });
    snapshotAt(GAME_ID, "NFL", now - 110 * DAY, -5.5, 42.5);
    snapshotAt(GAME_ID, "NFL", now - 8 * DAY, -2.5, 38.5);
    for (const d of [6, 4, 2, 1]) snapshotAt(GAME_ID, "NFL", now - d * DAY, -2.0, 38.0);
    snapshotAt("NFL_OTHER", "NFL", now - 60 * DAY, -3, 44);

    for (const c of rebase.planOpenerRepair({ leagues: ["NFL"], nowIso: iso(now) })) {
      if (c.verdict === "rebaseline") {
        rebase.rebaselineGameOpen(c.game_id, c.new_open_spread, c.new_open_total, "repair", { quiet: true });
      }
    }

    await runCycle("NFL", oddsPayload({ spread: -1.5, total: 38.0 }));
    expect(store.getGame(GAME_ID)!.open_spread).toBe(-2.5);
    expect(moveDeltas(GAME_ID, "spread")).toEqual([1]);   // -2.5 -> -1.5, not -5.5 -> -1.5
  });
});

/* ═══ 5. The one-time repair ═════════════════════════════════════════ */

describe("5. planOpenerRepair", () => {
  it("T21 — finds the game whose tail is fresh but whose history has an old hole", () => {
    const now = Date.now();
    const nowIso = iso(now);
    seedGame({ openSpread: -5.5, openTotal: 42.5, spreadLine: 4.5, totalLine: 37.5 });
    snapshotAt(GAME_ID, "NFL", now - 110 * DAY, -5.5, 42.5);
    snapshotAt(GAME_ID, "NFL", now - 8 * DAY, 3.5, 38.5);     // first line back
    for (const d of [6, 4, 2, 1]) snapshotAt(GAME_ID, "NFL", now - d * DAY, 4.0, 38.0);
    snapshotAt(GAME_ID, "NFL", now - 3600_000, 4.5, 37.5);    // tail is fresh
    snapshotAt("NFL_OTHER", "NFL", now - 60 * DAY, -3, 44);

    const plan = rebase.planOpenerRepair({ leagues: ["NFL"], nowIso });
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      game_id: GAME_ID,
      verdict: "rebaseline",
      open_spread: -5.5,
      new_open_spread: 3.5,       // the first line observed after the hole
      new_open_total: 38.5,
      status: "gap_league_active",
    });
  });

  it("T22 — applying it is idempotent, and a second pass finds nothing to do", () => {
    const now = Date.now();
    const nowIso = iso(now);
    seedGame({ openSpread: -5.5, openTotal: 42.5, spreadLine: 4.5, totalLine: 37.5 });
    snapshotAt(GAME_ID, "NFL", now - 110 * DAY, -5.5, 42.5);
    snapshotAt(GAME_ID, "NFL", now - 8 * DAY, 3.5, 38.5);
    for (const d of [6, 4, 2, 1]) snapshotAt(GAME_ID, "NFL", now - d * DAY, 4.0, 38.0);
    snapshotAt(GAME_ID, "NFL", now - 3600_000, 4.5, 37.5);
    snapshotAt("NFL_OTHER", "NFL", now - 60 * DAY, -3, 44);

    const first = rebase.planOpenerRepair({ leagues: ["NFL"], nowIso });
    for (const c of first.filter(c => c.verdict === "rebaseline")) {
      rebase.rebaselineGameOpen(c.game_id, c.new_open_spread, c.new_open_total, "repair", { quiet: true });
    }
    expect(store.getGame(GAME_ID)!.open_spread).toBe(3.5);

    // Second pass: the hole is now BEHIND the opener, so the predicate reads
    // the game as observed and the plan has nothing to do. This is also what
    // stops the live adapter re-firing on the same hole every cycle.
    const second = rebase.planOpenerRepair({ leagues: ["NFL"], nowIso });
    expect(second.map(c => c.verdict)).toEqual(["skip_already_correct"]);
  });

  it("T23 — skips a past game, a silent league, and a hole that has not closed", () => {
    const now = Date.now();
    const nowIso = iso(now);

    // Past kickoff — not selected at all.
    seedGame({ id: `NFL_2020_01_01_${AWAY_CODE}_${HOME_CODE}`, gameTime: PAST });

    // Silent league: its hole is (now-40d, now-6d) and nothing else in NFL
    // has a row inside it.
    const silent = "NFL_2099_12_01_X_Y";
    seedGame({ id: silent, openSpread: -5.5, spreadLine: -1.5 });
    snapshotAt(silent, "NFL", now - 40 * DAY, -5.5, 42.5);
    for (const d of [6, 4, 2]) snapshotAt(silent, "NFL", now - d * DAY, -1.5, 42.5);
    snapshotAt(silent, "NFL", now - 3600_000, -1.5, 42.5);

    // Hole still open — no post-gap line to use. Its window is (now-40d, now),
    // which DOES contain the filler below, so the league reads as alive here
    // and the skip is about the missing post-gap line, not about silence.
    const open = "NFL_2099_12_02_X_Y";
    seedGame({ id: open, openSpread: -5.5, spreadLine: -5.5 });
    snapshotAt(open, "NFL", now - 40 * DAY, -5.5, 42.5);
    snapshotAt("NFL_OTHER", "NFL", now - 2 * DAY, -3, 44);   // league alive

    const byId = new Map(rebase.planOpenerRepair({ leagues: ["NFL"], nowIso }).map(c => [c.game_id, c]));
    expect(byId.has(`NFL_2020_01_01_${AWAY_CODE}_${HOME_CODE}`)).toBe(false);
    expect(byId.get(silent)!.verdict).toBe("skip_league_silent");
    expect(byId.get(open)!.verdict).toBe("skip_no_post_gap_line");
  });
});

/* ═══ 6. Replay hashes ═══════════════════════════════════════════════ */

describe("6. replay hashes do not move", () => {
  /**
   * STRUCTURAL, not incidental. buildReplayMarketState reads live_signals,
   * getSignalHistory and odds_snapshots; `games` is not among its inputs, so
   * no write to games.open_spread can reach a hash. These two tests say that
   * out loud so a future change that DOES make games a replay input fails here
   * instead of silently re-hashing the archive.
   */
  function seedSignal(id: string) {
    // Through the store's own writer, so the row has every column the schema
    // requires and the replay reader deserialises it exactly as it would a
    // real one.
    store.upsertLiveSignal({
      id, league: "NFL", signal_type: "line_move",
      headline: "h", body: "b", action_note: "", why_it_matters: "",
      confidence: 70, verdict: "review", confirmation_strength: "Developing",
      game_id: GAME_ID, team: HOME_CODE, player: null,
      sources: [], breakdown: {}, raw_event_ids: [],
      line_movement: { open: -5.5, current: -2.5, delta: 3, direction: "down" },
      betting_relevance: true, fantasy_relevance: false,
      source_count: 1, source_types: [], source_labels: [],
      score: 0, score_band: "Informational", score_explanation: "",
      urgency_label: "NOTE", urgency_reason: "", trust_label: "Developing",
      signal_time: iso(Date.now() - DAY),
      created_at: iso(Date.now() - DAY),
      updated_at: iso(Date.now() - DAY),
    } as any);
  }

  /** The four hashes as persistReplayAudit actually stored them. */
  const latestHashes = (gameId: string) =>
    store.getPipelineDb().prepare(`
      SELECT replay_hash, timeline_hash, signal_hash, snapshot_hash
      FROM replay_audits WHERE game_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1
    `).get(gameId) as Record<string, string>;

  it("T24 — rebaselineGameOpen leaves every replay hash byte-identical", async () => {
    const now = Date.now();
    seedGame({ openSpread: -5.5, openTotal: 42.5 });
    snapshotAt(GAME_ID, "NFL", now - 110 * DAY, -5.5, 42.5);
    snapshotAt(GAME_ID, "NFL", now - 2 * DAY, -2.5, 38.5);
    seedSignal("sig-hash-1");

    const asOf = iso(now);
    await replay.buildReplayMarketState({ game_id: GAME_ID, as_of: asOf });
    const before = latestHashes(GAME_ID);
    expect(before.replay_hash).toBeTruthy();

    expect(rebase.rebaselineGameOpen(GAME_ID, -2.5, 38.5, "test", { quiet: true }).written).toBe(true);

    await replay.buildReplayMarketState({ game_id: GAME_ID, as_of: asOf });
    expect(latestHashes(GAME_ID)).toEqual(before);
  });

  it("T25 — and the stored signal's own line_movement.open is untouched", async () => {
    seedGame({ openSpread: -5.5, openTotal: 42.5 });
    seedSignal("sig-hash-2");

    rebase.rebaselineGameOpen(GAME_ID, -2.5, 38.5, "test", { quiet: true });

    const row = store.getPipelineDb()
      .prepare("SELECT line_movement FROM live_signals WHERE id='sig-hash-2'")
      .get() as { line_movement: string };
    expect(JSON.parse(row.line_movement).open).toBe(-5.5);
  });
});

/* ═══ 7. The kill switch ═════════════════════════════════════════════ */

/**
 * ODDS_OPEN_REBASELINE=0 has to return the ingestion path to EXACTLY what it
 * did before this change — not "mostly", and not "frozen openers but still
 * dropping moves". The anchor for "exactly" is the number main published on
 * the same fixture: a 3.0 spread move and a 4.0 total move, measured from the
 * stale opener. If a later change makes the off state diverge from that, T43
 * fails rather than the divergence shipping quietly.
 */
describe("7. ODDS_OPEN_REBASELINE kill switch", () => {
  function seedGappedGame(openSpread = -5.5, openTotal = 42.5) {
    const now = Date.now();
    seedGame({ openSpread, openTotal, spreadLine: openSpread, totalLine: openTotal });
    snapshotAt(GAME_ID, "NFL", now - 110 * DAY, openSpread, openTotal);
    snapshotAt("NFL_OTHER", "NFL", now - 60 * DAY, -3, 44);
  }

  it("T37 — default (variable unset) is ON: the gapped opener is re-baselined", async () => {
    expect(process.env.ODDS_OPEN_REBASELINE).toBeUndefined();
    expect(rebase.oddsOpenRebaselineEnabled()).toBe(true);

    seedGappedGame();
    await runCycle("NFL", oddsPayload({ spread: -2.5, total: 38.5 }));

    expect(store.getGame(GAME_ID)!.open_spread).toBe(-2.5);
    expect(rawEvents(GAME_ID, "line_move")).toHaveLength(0);
  });

  it('T38 — "0" is the only off value; other values leave it on', () => {
    process.env.ODDS_OPEN_REBASELINE = "0";
    expect(rebase.oddsOpenRebaselineEnabled()).toBe(false);

    for (const v of ["1", "true", "on", "", "00", "false"]) {
      process.env.ODDS_OPEN_REBASELINE = v;
      expect(rebase.oddsOpenRebaselineEnabled()).toBe(true);
    }
  });

  it("T39 — OFF: the opener is left exactly as stored, and nothing is written to it", async () => {
    process.env.ODDS_OPEN_REBASELINE = "0";
    seedGappedGame();

    await runCycle("NFL", oddsPayload({ spread: -2.5, total: 38.5 }));

    const g = store.getGame(GAME_ID)!;
    expect(g.open_spread).toBe(-5.5);   // untouched
    expect(g.open_total).toBe(42.5);
    expect(g.spread_line).toBe(-2.5);   // the current line still tracks
  });

  it("T40 — OFF: the move is published again, with main's numbers", async () => {
    process.env.ODDS_OPEN_REBASELINE = "0";
    seedGappedGame();

    await runCycle("NFL", oddsPayload({ spread: -2.5, total: 38.5 }));

    // The pre-PR behaviour, stale opener and all: -5.5 -> -2.5 and 42.5 -> 38.5.
    expect(moveDeltas(GAME_ID, "spread")).toEqual([3]);
    expect(moveDeltas(GAME_ID, "total")).toEqual([4]);
  });

  it("T41 — OFF: nothing is suppressed, so no [odds-open] line is logged at all", async () => {
    process.env.ODDS_OPEN_REBASELINE = "0";
    seedGappedGame();

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { logs.push(a.join(" ")); });

    await runCycle("NFL", oddsPayload({ spread: -2.5, total: 38.5 }));

    expect(logs.find(l => l.includes("[odds-open]"))).toBeUndefined();
    // and the state is announced once, so an operator can see WHY from the log
    expect(logs.find(l => l.includes("ODDS_OPEN_REBASELINE=0"))).toBeTruthy();
  });

  it("T42 — OFF kills only the LIVE path: the repair script still plans and writes", () => {
    process.env.ODDS_OPEN_REBASELINE = "0";
    const now = Date.now();
    seedGame({ openSpread: -5.5, openTotal: 42.5, spreadLine: -2.5, totalLine: 38.5 });
    snapshotAt(GAME_ID, "NFL", now - 110 * DAY, -5.5, 42.5);
    snapshotAt("NFL_OTHER", "NFL", now - 60 * DAY, -3, 44);
    snapshotAt(GAME_ID, "NFL", now - 2 * DAY, -2.5, 38.5);

    const plan = rebase.planOpenerRepair({ leagues: ["NFL"], nowIso: iso(now) });
    const mine = plan.find(c => c.game_id === GAME_ID)!;
    expect(mine.verdict).toBe("rebaseline");

    const result = rebase.rebaselineGameOpen(GAME_ID, mine.new_open_spread, mine.new_open_total, "test");
    expect(result.written).toBe(true);
    expect(store.getGame(GAME_ID)!.open_spread).toBe(-2.5);
  });

  it("T43 — ON vs OFF differ on the SAME fixture, so T39/T40 are not vacuous", async () => {
    seedGappedGame();
    await runCycle("NFL", oddsPayload({ spread: -2.5, total: 38.5 }));
    const on = {
      open: store.getGame(GAME_ID)!.open_spread,
      moves: moveDeltas(GAME_ID, "spread"),
    };

    for (const t of ["odds_snapshots", "raw_events", "games", "odds_fetch_state"]) {
      db().prepare(`DELETE FROM ${t}`).run();
    }

    process.env.ODDS_OPEN_REBASELINE = "0";
    seedGappedGame();
    await runCycle("NFL", oddsPayload({ spread: -2.5, total: 38.5 }));
    const off = {
      open: store.getGame(GAME_ID)!.open_spread,
      moves: moveDeltas(GAME_ID, "spread"),
    };

    expect(on.open).toBe(-2.5);
    expect(off.open).toBe(-5.5);
    expect(on.moves).toEqual([]);
    expect(off.moves).toEqual([3]);
  });
});

/* ═══ 8. The audit trail ═════════════════════════════════════════════ */

describe("8. every re-baseline is logged with enough to undo it", () => {
  it("T44 — the write log carries game id, league, gap days, reason and BOTH old and new values", async () => {
    const now = Date.now();
    seedGame({ openSpread: -5.5, openTotal: 42.5, spreadLine: -5.5, totalLine: 42.5 });
    snapshotAt(GAME_ID, "NFL", now - 110 * DAY, -5.5, 42.5);
    snapshotAt("NFL_OTHER", "NFL", now - 60 * DAY, -3, 44);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { logs.push(a.join(" ")); });

    await runCycle("NFL", oddsPayload({ spread: -2.5, total: 38.5 }));

    const line = logs.find(l => l.includes("open_rebaselined"));
    expect(line).toBeTruthy();
    const payload = JSON.parse(line!.slice(line!.indexOf("{")));

    expect(payload.game_id).toBe(GAME_ID);
    expect(payload.league).toBe("NFL");
    expect(typeof payload.gap_days).toBe("number");
    expect(payload.gap_days).toBeGreaterThan(3);
    expect(payload.from_spread).toBe(-5.5);   // the value being replaced
    expect(payload.to_spread).toBe(-2.5);
    expect(payload.from_total).toBe(42.5);
    expect(payload.to_total).toBe(38.5);
    expect(typeof payload.reason).toBe("string");
    expect(payload.reason).toContain("gap");
    expect(typeof payload.at).toBe("string");
  });

  it("T45 — the repair script's writes carry the same fields", () => {
    const now = Date.now();
    seedGame({ openSpread: -5.5, openTotal: 42.5, spreadLine: -2.5, totalLine: 38.5 });
    snapshotAt(GAME_ID, "NFL", now - 110 * DAY, -5.5, 42.5);
    snapshotAt("NFL_OTHER", "NFL", now - 60 * DAY, -3, 44);
    snapshotAt(GAME_ID, "NFL", now - 2 * DAY, -2.5, 38.5);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { logs.push(a.join(" ")); });

    const mine = rebase.planOpenerRepair({ leagues: ["NFL"], nowIso: iso(now) })
      .find(c => c.game_id === GAME_ID)!;
    rebase.rebaselineGameOpen(
      mine.game_id, mine.new_open_spread, mine.new_open_total,
      `one-time repair: ${mine.gap_days}d observation gap`,
      { league: mine.league, gapDays: mine.gap_days },
    );

    const payload = JSON.parse(logs.find(l => l.includes("open_rebaselined"))!.slice(
      logs.find(l => l.includes("open_rebaselined"))!.indexOf("{"),
    ));
    expect(payload.league).toBe("NFL");
    expect(payload.gap_days).toBeGreaterThan(3);
    expect(payload.from_spread).toBe(-5.5);
    expect(payload.to_spread).toBe(-2.5);
  });
});

/* ═══ 9. Opener provenance (reporting only) ══════════════════════════ */

/**
 * The gap predicate finds holes BETWEEN snapshot rows. An opener written
 * before the game's first snapshot leaves no such hole, so the predicate
 * cannot see it. These pin that the dry run can still SAY so.
 */
describe("9. openerProvenance", () => {
  it("T46 — reports the lead between the opener's write and the first snapshot", () => {
    const now = Date.now();
    seedGame({});
    snapshotAt(GAME_ID, "NFL", now - 70 * DAY, -5.5, 42.5);
    snapshotAt(GAME_ID, "NFL", now - 2 * DAY, -2.5, 38.5);

    const prov = rebase.openerProvenance(GAME_ID, iso(now - 110 * DAY));
    expect(prov.snapshotCount).toBe(2);
    expect(prov.firstSnapshotAt).toBe(iso(now - 70 * DAY));
    expect(prov.leadDays).toBeCloseTo(40, 0);
  });

  it("T47 — a game with NO snapshots reports null, not a crash or a zero", () => {
    const prov = rebase.openerProvenance("NFL_NO_SNAPS", iso(Date.now()));
    expect(prov.snapshotCount).toBe(0);
    expect(prov.firstSnapshotAt).toBeNull();
    expect(prov.leadDays).toBeNull();
  });

  it("T48 — THE CASE THAT MATTERS: a long lead with an unbroken snapshot run is NOT repaired", () => {
    // An opener written 110 days before the first snapshot we hold, then a
    // dense run since. No hole BETWEEN rows, so the gap rule says "observed".
    const now = Date.now();
    seedGame({ openSpread: -5.5, openTotal: 42.5, spreadLine: -2.5, totalLine: 38.5 });
    for (let d = 20; d >= 1; d--) snapshotAt(GAME_ID, "NFL", now - d * DAY, -3, 40);

    const mine = rebase.planOpenerRepair({ leagues: ["NFL"], nowIso: iso(now) })
      .find(c => c.game_id === GAME_ID)!;

    expect(mine.verdict).toBe("skip_observed");       // the script leaves it alone
    expect(store.getGame(GAME_ID)!.open_spread).toBe(-5.5);
  });
});

/* ═══ 10. line_move signals on a game (reporting only) ═══════════════ */

describe("10. lineMoveSignalsForGame", () => {
  it("T49 — returns the line_move signals standing on the game, and ignores other types", () => {
    const nowIso = new Date().toISOString();
    const insert = (id: string, type: string) => db().prepare(
      `INSERT INTO live_signals (id, league, game_id, signal_type, headline, body, signal_time, created_at, updated_at, line_movement, score)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, "NFL", GAME_ID, type, `${type} headline`, "", nowIso, nowIso, nowIso,
          JSON.stringify({ open: -5.5, current: 4.5 }), 80);

    insert("sig-move-1", "line_move");
    insert("sig-move-2", "line_move");
    insert("sig-injury", "injury");

    const rows = rebase.lineMoveSignalsForGame(GAME_ID);
    expect(rows.map(r => r.id).sort()).toEqual(["sig-move-1", "sig-move-2"]);
    expect(rows[0].line_movement).toContain("-5.5");
  });

  it("T50 — a game with no signals returns an empty list", () => {
    expect(rebase.lineMoveSignalsForGame("NFL_NOTHING_HERE")).toEqual([]);
  });
});

/* === 11. The harness guarantee T17 depends on ====================== */

/**
 * T17 is a REGRESSION test that only regresses when its two cycles land on
 * different instants. It passed locally and failed on CI for exactly that
 * reason. This pins the harness property directly, so the next person sees a
 * named failure instead of a mystery flake in a test about something else.
 */
describe("11. chained cycles land on distinct instants", () => {
  it("T51 — each runCycle advances the clock, so no two snapshots share a snapshot_at", async () => {
    seedGame({});

    await runCycle("NFL", oddsPayload({ spread: -3.5, total: 44.5 }));
    await runCycle("NFL", oddsPayload({ spread: -3.0, total: 44.0 }));
    await runCycle("NFL", oddsPayload({ spread: -2.5, total: 43.5 }));

    const stamps = (db()
      .prepare("SELECT snapshot_at FROM odds_snapshots WHERE game_id = ? ORDER BY snapshot_at ASC")
      .all(GAME_ID) as Array<{ snapshot_at: string }>).map(r => r.snapshot_at);

    expect(stamps).toHaveLength(3);
    expect(new Set(stamps).size).toBe(3);
    for (let i = 1; i < stamps.length; i++) {
      expect(Date.parse(stamps[i])).toBeGreaterThan(Date.parse(stamps[i - 1]));
    }
  });
});
