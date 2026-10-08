import { describe, expect, it, beforeAll, vi } from "vitest";
import type BetterSqlite3 from "better-sqlite3";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * The settlement cycle's two loop-blocking reads, pinned.
 *
 * PROD, 2026-10-08 05:18 UTC (the first boot after #82): `ingest:settlement`
 * blocked the event loop for 16.8s during the boot ingestion cycle —
 * `settlement:accuracy-compute` 8.9s, `settlement:accuracy-sync` 1.3s,
 * `settlement:read-nullgame` 6.4s — against Render's 5s health check. It
 * survived; the #81 boot blocked 6.8s in the same step and the #80 boot not at
 * all, because `read-nullgame` runs every cycle while the accuracy family only
 * runs when the cycle settled at least one signal.
 *
 * Two separate defects, measured in docs/settlement-boot-block.md:
 *
 *   1. ALL THREE ACCURACY STATEMENTS FILTER `s.league = ?` AND NOTHING ELSE on
 *      the joined table, so the planner drives from live_signals and probes
 *      outcomes once per signal in the league — 150,000 fat rows per call on a
 *      prod-shaped fixture to aggregate the ~24,000 outcomes that qualify. #79's
 *      idx_live_signals_injury_dedup is picked for that bare filter (leading
 *      column `league`), which is the regression #80 filed and did not fix.
 *      CROSS JOIN pins the loop order: 3,890ms -> 353ms over the 12 statements.
 *
 *   2. READ-NULLGAME NEVER USED THE PARTIAL INDEX BUILT FOR IT. The planner
 *      takes idx_live_signals_game_outcome's two-column equality seek and sorts
 *      the result, so `LIMIT 500` buys nothing: every null-game row is
 *      materialised, including every SETTLEMENT_EXPIRED one the #77 migration
 *      parked to stop exactly that. 121ms -> 9.8ms pinned, and 9.0ms against
 *      prod's parked shape with the new settlement_expired-aware index.
 *
 * WHAT THIS SUITE ASSERTS, and why each part is here:
 *   - equality: the pin changes the loop order, never the rows. Each pinned
 *     statement is compared row-for-row against its unpinned twin.
 *   - plans: the pinned plan, AND the unpinned twin flipping off it. A pin that
 *     the planner would have chosen anyway is not a pin, and asserting only the
 *     good plan would stay green if someone deleted every CROSS JOIN.
 *   - the named index exists before the statement runs: the INDEXED BY pin makes
 *     idx_live_signals_settleable_nullgame a hard dependency, so this checks
 *     initSchema creates it on the handle getPipelineDb hands out, and that
 *     dropping it turns the statement into a loud error rather than a slow one.
 *   - span budget: each statement under LOOP_SPAN_BUDGET_MS on this fixture.
 *     Timings are machine-dependent and the margin here is ~40x, so this catches
 *     a plan collapse, not a slow CI box.
 *
 * Store-backed: isolated pipeline.db (PIPELINE_DATA_DIR set before the store is
 * imported) with ../../storage mocked, mirroring outcomes-signal-index.test.ts.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-settle-pins-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;

vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
  storage: { upsertSourceScore: vi.fn() },
  insertSettledOutcome: vi.fn(),
  getSettledOutcomesForAccuracy: vi.fn(() => []),
  markSettledOutcomesStale: vi.fn(),
  countStaleSettledOutcomes: vi.fn(() => 0),
}));

let store: typeof import("../store");
let settlement: typeof import("../settlement");
let replay: typeof import("../replay-validation");
let monitor: typeof import("../../event-loop-monitor");
let db: BetterSqlite3.Database;

/**
 * Prod's shape at a tenth of its size: most signals archived, a sixth carrying
 * no game_id, 68% of outcomes flagged excluded_stale (the #67 fix kept bad
 * matches rather than deleting them), and — the part that matters for
 * read-nullgame — most of the null-game backlog already parked, which is what
 * the #77 migration left behind. The newest 600 candidates are settleable, so
 * the statement's LIMIT 500 has a real prefix of parked rows in front of it.
 */
const N_GAMES = 1_000;
const N_SIGNALS = 12_000;
const N_OUTCOMES = 15_000;
const STALE_PERCENT = 68;
const SETTLEABLE_NULLGAME = 600;

const LEAGUES = ["NFL", "NBA", "MLB", "CFB"];
const TYPES = ["injury", "roster", "line_move", "operator_note"];
const iso = (minutes: number) => new Date(Date.UTC(2026, 0, 1) + minutes * 60_000).toISOString();

beforeAll(async () => {
  store = await import("../store");
  settlement = await import("../settlement");
  replay = await import("../replay-validation");
  monitor = await import("../../event-loop-monitor");
  db = store.getPipelineDb();
  seed(db);
});

function seed(target: BetterSqlite3.Database): void {
  target.transaction(() => {
    const game = target.prepare(`
      INSERT INTO games (id, league, home_team, away_team, game_time, status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?)
    `);
    for (let i = 0; i < N_GAMES; i++) {
      game.run(`g${i}`, LEAGUES[i % LEAGUES.length], `H${i % 30}`, `A${i % 31}`,
        iso(i * 20), i % 5 === 0 ? "scheduled" : "final", iso(i), iso(i));
    }

    const signal = target.prepare(`
      INSERT INTO live_signals
        (id, league, game_id, signal_type, headline, team, player, sources,
         breakdown, signal_time, created_at, updated_at, is_archived,
         betting_relevance, injury_designation)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    for (let i = 0; i < N_SIGNALS; i++) {
      signal.run(
        `sig${i}`, LEAGUES[i % LEAGUES.length], i % 6 === 0 ? null : `g${i % N_GAMES}`,
        TYPES[i % TYPES.length], `headline ${i}`, `T${i % 30}`,
        i % 3 === 0 ? null : `Player ${i % 400}`,
        JSON.stringify([{ id: `src${i % 20}`, name: `Source ${i % 20}`, source_type: "beat_reporter" }]),
        JSON.stringify({ total: 60 + (i % 40), factors: { timing: i % 5 } }),
        iso(i), iso(i), iso(i),
        i % 10 === 0 ? 0 : 1,
        // Every null-game signal is betting-relevant, so the parked prefix is
        // the only thing standing between the index walk and the live rows.
        i % 6 === 0 ? 1 : (i % 2),
        i % 4 === 0 ? "questionable" : null,
      );
    }

    const outcome = target.prepare(`
      INSERT INTO outcomes
        (id, signal_id, game_id, market, hit, clv, recorded_at, created_at, excluded_stale)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);
    for (let i = 0; i < N_OUTCOMES; i++) {
      const sig = i % N_SIGNALS;
      outcome.run(`out${i}`, `sig${sig}`, `g${sig % N_GAMES}`, "spread",
        i % 4 === 0 ? null : (i % 2),
        i % 3 === 0 ? null : (i % 7) - 3,
        iso(i), iso(sig), i % 100 < STALE_PERCENT ? 1 : 0);
    }
  })();

  // Park all but the newest SETTLEABLE_NULLGAME candidates, as the #77 backlog
  // migration did on prod. Without this the fixture has no parked prefix and
  // read-nullgame looks fine on either index.
  const candidates = (target.prepare(`
    SELECT id FROM live_signals
    WHERE game_id IS NULL AND outcome_id IS NULL AND betting_relevance = 1
    ORDER BY created_at ASC
  `).all() as { id: string }[]).map((row) => row.id);
  const park = target.prepare("UPDATE live_signals SET settlement_expired = 1 WHERE id = ?");
  target.transaction(() => {
    for (const id of candidates.slice(0, Math.max(0, candidates.length - SETTLEABLE_NULLGAME))) {
      park.run(id);
    }
  })();
}

/** The plan for `sql`, flattened to one line for readable failure messages. */
function planFor(sql: string, ...args: unknown[]): string {
  return (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args) as { detail: string }[])
    .map((row) => row.detail.trim())
    .join(" | ");
}

/** Best of three, so a scheduling hiccup on CI is not a failure. */
function bestMs(run: () => unknown): number {
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const started = process.hrtime.bigint();
    run();
    best = Math.min(best, Number(process.hrtime.bigint() - started) / 1e6);
  }
  return best;
}

/** The unpinned twin of each statement — what main ran before this change. */
const unpinned = (sql: string) => sql.replace(/CROSS JOIN/g, "JOIN")
  .replace(/\s*INDEXED BY idx_live_signals_settleable_nullgame/, "");

describe("settlement query pins", () => {
  it("seeds a prod-shaped fixture with a parked backlog and no ANALYZE stats", () => {
    expect((db.prepare("SELECT COUNT(*) AS n FROM live_signals").get() as any).n).toBe(N_SIGNALS);
    expect((db.prepare("SELECT COUNT(*) AS n FROM outcomes").get() as any).n).toBe(N_OUTCOMES);

    const parked = (db.prepare(`
      SELECT COUNT(*) AS n FROM live_signals
      WHERE game_id IS NULL AND outcome_id IS NULL AND betting_relevance = 1
        AND settlement_expired = 1
    `).get() as any).n;
    const settleable = (db.prepare(`
      SELECT COUNT(*) AS n FROM live_signals
      WHERE game_id IS NULL AND outcome_id IS NULL AND betting_relevance = 1
        AND settlement_expired = 0
    `).get() as any).n;
    expect(settleable).toBe(SETTLEABLE_NULLGAME);
    // The prefix is the whole point: parked rows must outnumber the LIMIT.
    expect(parked).toBeGreaterThan(500);

    // If this ever becomes true the asserted plans stop being the plans prod gets.
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'sqlite_stat1'").get())
      .toBeUndefined();
  });

  /* ─── The named index, and that it exists before the statement runs ─────── */

  it("creates idx_live_signals_settleable_nullgame in initSchema, before any read", () => {
    // getPipelineDb ran initSchema before handing back the handle in beforeAll,
    // so by the time any caller can reach the statement the index is there. The
    // statement itself is the proof: INDEXED BY against a missing index does not
    // return rows slowly, it fails to prepare.
    const names = (db.prepare("PRAGMA index_list(live_signals)").all() as { name: string }[])
      .map((row) => row.name);
    expect(names).toContain("idx_live_signals_settleable_nullgame");
    expect(() => db.prepare(store.UNSETTLED_NULLGAME_SQL)).not.toThrow();
    expect(() => store.getUnsettledSignalsWithoutGameId()).not.toThrow();

    // Partial on all four predicates, including the one the older index omits.
    const sql = (db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_live_signals_settleable_nullgame'",
    ).get() as { sql: string }).sql.replace(/\s+/g, " ");
    expect(sql).toMatch(/ON live_signals\(created_at\)/);
    expect(sql).toMatch(/game_id IS NULL/);
    expect(sql).toMatch(/outcome_id IS NULL/);
    expect(sql).toMatch(/betting_relevance=1/);
    expect(sql).toMatch(/settlement_expired=0/);

    // Re-opening must not fail or duplicate.
    expect(() => store.getPipelineDb()).not.toThrow();
  });

  /**
   * The pin is load-bearing, and this is what that costs: drop the index and the
   * statement raises instead of silently returning to 121ms. Asserted on a copy
   * of the file so the singleton handle keeps its index.
   */
  it("fails loudly, not slowly, if the pinned index is dropped", () => {
    const copyDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-settle-pins-drop-"));
    const copyPath = path.join(copyDir, "pipeline.db");
    db.prepare("VACUUM INTO ?").run(copyPath);
    const copy = new Database(copyPath);
    try {
      expect(() => copy.prepare(store.UNSETTLED_NULLGAME_SQL)).not.toThrow();
      copy.exec("DROP INDEX idx_live_signals_settleable_nullgame");
      expect(() => copy.prepare(store.UNSETTLED_NULLGAME_SQL)).toThrow(/no such index/i);
    } finally {
      copy.close();
      fs.rmSync(copyDir, { recursive: true, force: true });
    }
  });

  /* ─── Equality: the pins change the loop order, never the rows ──────────── */

  /**
   * The two statements that carry an ORDER BY must match sequence for sequence,
   * and the aggregate must match value for value.
   */
  it("returns the same rows in the same order wherever an order is specified", () => {
    const cases: Array<[string, string, unknown[]]> = [
      ["accuracy overall (single aggregate row)", settlement.ACCURACY_OVERALL_SQL, ["NFL"]],
      ["replay league signal ids (ORDER BY o.signal_id)", replay.LEAGUE_SIGNAL_IDS_SQL, ["NFL"]],
      ["read-nullgame (ORDER BY created_at)", store.UNSETTLED_NULLGAME_SQL, []],
    ];
    for (const [name, sql, args] of cases) {
      const twin = unpinned(sql);
      expect(twin, `${name}: the twin must differ from the pinned SQL`).not.toBe(sql);
      expect(db.prepare(sql).all(...(args as any[])), name)
        .toEqual(db.prepare(twin).all(...(args as any[])));
    }
  });

  /**
   * THE TWO THAT NEVER SPECIFIED AN ORDER RETURN THE SAME SET IN A DIFFERENT
   * SEQUENCE, and that is the one visible effect of the pin.
   *
   * Pass 2 (`GROUP BY s.signal_type`) and pass 3 (no ORDER BY at all) got their
   * old sequence from the plan: driving from live_signals handed rows out in
   * league-index order. Driving from outcomes hands them out in signal_id order
   * instead. SQL promises nothing here, so this is not a behaviour change in the
   * rows — but it is a real difference, so it is asserted as a multiset rather
   * than hidden behind a sort inside the statement.
   *
   * Both consumers are order-insensitive, which is why this is safe:
   *   - pass 2 feeds `upsertAccuracy`, keyed on `league|signal_type|ALL`, one
   *     row per group — so the write set and every written value is identical.
   *   - pass 3 tallies into a Map by source_id and only then upserts, so the
   *     arrival order of the rows cannot reach the output.
   * If either ever grows an order-dependent consumer (a "first row wins", a
   * running total that rounds), it needs its own ORDER BY and this test should
   * become a sequence assertion.
   */
  it("returns the same multiset for the two statements with no ORDER BY", () => {
    const key = (row: Record<string, unknown>) => JSON.stringify(row);
    for (const [name, sql] of [
      ["accuracy by type", settlement.ACCURACY_BY_TYPE_SQL],
      ["accuracy per source", settlement.ACCURACY_PER_SOURCE_SQL],
    ] as const) {
      for (const league of LEAGUES) {
        const pinned = (db.prepare(sql).all(league) as Record<string, unknown>[]).map(key).sort();
        const twin = (db.prepare(unpinned(sql)).all(league) as Record<string, unknown>[]).map(key).sort();
        expect(pinned, `${name} / ${league}`).toEqual(twin);
      }
    }
  });

  it("returns rows identical to the unpinned statements in every league", () => {
    for (const league of LEAGUES) {
      for (const sql of [settlement.ACCURACY_OVERALL_SQL, replay.LEAGUE_SIGNAL_IDS_SQL]) {
        expect(db.prepare(sql).all(league), league)
          .toEqual(db.prepare(unpinned(sql)).all(league));
      }
    }
  });

  /**
   * No "identical accuracy table either way" test here, deliberately. Every
   * value written by the three passes is a pure function of the row multisets
   * asserted above — a per-group aggregate, and a Map tally keyed on source_id —
   * and `upsertAccuracy` is module-private, so a test that reran the unpinned
   * statements and then called `computeSourceAccuracy()` again would be
   * comparing the pinned path against itself. It would read as an end-to-end
   * guarantee while asserting nothing. The multiset equality plus the two
   * order-insensitive consumers is the whole argument.
   *
   * That the recompute runs and produces a table at all is covered by the span
   * budget below, which calls it.
   */
  it("produces a populated accuracy table", () => {
    settlement.computeSourceAccuracy();
    const rows = db.prepare(`
      SELECT id, total_signals, wins, losses, hit_rate FROM pipeline_source_accuracy
      WHERE total_signals > 0 ORDER BY id ASC
    `).all() as Array<{ id: string; total_signals: number; wins: number; losses: number }>;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.wins + row.losses, row.id).toBe(row.total_signals);
    }
  });

  /* ─── Plans: the pinned order, and the twin flipping off it ─────────────── */

  it("drives the three accuracy statements from outcomes, covering", () => {
    for (const [name, sql] of [
      ["overall", settlement.ACCURACY_OVERALL_SQL],
      ["by type", settlement.ACCURACY_BY_TYPE_SQL],
      ["per source", settlement.ACCURACY_PER_SOURCE_SQL],
    ] as const) {
      const plan = planFor(sql, "NFL");
      // One pass over the qualifying outcomes, from the partial covering index.
      expect(plan, `${name}: ${plan}`)
        .toMatch(/SCAN o USING COVERING INDEX idx_outcomes_settled_signal/);
      // Each row's signal probed by id through (id, league, signal_type).
      expect(plan, `${name}: ${plan}`)
        .toMatch(/SEARCH s USING (COVERING )?INDEX idx_live_signals_id_league_type/);
      // The two indexes the planner reaches for when it drives from the league
      // side instead. Either one appearing means the pin stopped working.
      expect(plan, `${name}: ${plan}`).not.toMatch(/idx_live_signals_league\b/);
      expect(plan, `${name}: ${plan}`).not.toMatch(/idx_live_signals_injury_dedup/);
    }
  });

  it("flips off that plan without the CROSS JOIN, which is why the pin is there", () => {
    const flipped = [
      settlement.ACCURACY_OVERALL_SQL,
      settlement.ACCURACY_BY_TYPE_SQL,
      settlement.ACCURACY_PER_SOURCE_SQL,
    ].map((sql) => planFor(unpinned(sql), "NFL"));

    for (const plan of flipped) {
      // Driving from live_signals on the bare league filter: the regression.
      expect(plan, plan).toMatch(/SEARCH s USING INDEX (idx_live_signals_league|idx_live_signals_injury_dedup)/);
      expect(plan, plan).not.toMatch(/SCAN o USING COVERING INDEX/);
    }
    // #79's four-column index serving a one-column predicate, on at least one of
    // the three. This is the specific flip docs/request-path-query-audit.md
    // filed and this change recovers; if the planner stops making it, the note
    // in settlement.ts is stale and should be corrected rather than kept.
    expect(flipped.some((plan) => /idx_live_signals_injury_dedup/.test(plan)), flipped.join("\n"))
      .toBe(true);
  });

  it("drives the replay league fan-out from outcomes", () => {
    const plan = planFor(replay.LEAGUE_SIGNAL_IDS_SQL, "NFL");
    expect(plan, plan).toMatch(/\bSCAN o\b|SEARCH o USING/);
    expect(plan, plan).not.toMatch(/SEARCH s USING INDEX idx_live_signals_league\b/);
    expect(plan, plan).not.toMatch(/idx_live_signals_injury_dedup/);

    const twin = planFor(unpinned(replay.LEAGUE_SIGNAL_IDS_SQL), "NFL");
    expect(twin, twin).toMatch(/SEARCH s USING INDEX (idx_live_signals_league|idx_live_signals_injury_dedup)/);
  });

  it("serves read-nullgame from the settleable partial index with no sort", () => {
    const plan = planFor(store.UNSETTLED_NULLGAME_SQL);
    expect(plan, plan).toMatch(/idx_live_signals_settleable_nullgame/);
    // created_at order comes out of the index, so the LIMIT can stop early.
    // This is the assertion that fails if someone widens the statement's WHERE
    // past what the partial index implies and SQLite falls back to sorting.
    expect(plan, plan).not.toMatch(/TEMP B-TREE/i);

    const twin = planFor(unpinned(store.UNSETTLED_NULLGAME_SQL));
    // What main did: the two-column equality seek, then sort everything it found
    // — parked rows included — and take 500.
    expect(twin, twin).toMatch(/idx_live_signals_game_outcome/);
    expect(twin, twin).toMatch(/TEMP B-TREE/i);
  });

  /* ─── Span budget ───────────────────────────────────────────────────────── */

  it("keeps every pinned statement inside one span budget", () => {
    const budget = monitor.SPAN_BUDGET_MS;
    const spans: Array<[string, number]> = [
      ["accuracy overall", bestMs(() => db.prepare(settlement.ACCURACY_OVERALL_SQL).get("NFL"))],
      ["accuracy by type", bestMs(() => db.prepare(settlement.ACCURACY_BY_TYPE_SQL).all("NFL"))],
      ["accuracy per source", bestMs(() => db.prepare(settlement.ACCURACY_PER_SOURCE_SQL).all("NFL"))],
      ["replay league signal ids", bestMs(() => db.prepare(replay.LEAGUE_SIGNAL_IDS_SQL).all("NFL"))],
      ["read-nullgame", bestMs(() => store.getUnsettledSignalsWithoutGameId())],
    ];
    for (const [name, ms] of spans) {
      expect(ms, `${name} took ${ms.toFixed(1)}ms against a ${budget}ms budget`)
        .toBeLessThan(budget);
    }
  });

  /**
   * computeSourceAccuracy is the step that blocked 8.9s on prod. Twelve
   * statements (three passes x four leagues) plus the upserts, all synchronous,
   * in one span — so the whole call gets the budget, not each statement.
   */
  it("keeps the whole accuracy recompute inside one span budget", () => {
    const ms = bestMs(() => settlement.computeSourceAccuracy());
    expect(ms, `computeSourceAccuracy took ${ms.toFixed(1)}ms`)
      .toBeLessThan(monitor.SPAN_BUDGET_MS);
  });
});
