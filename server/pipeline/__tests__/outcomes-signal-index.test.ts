import { describe, expect, it, beforeAll, vi } from "vitest";
import type BetterSqlite3 from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * `outcomes` had no index on signal_id or game_id at all.
 *
 * PROD PROFILE, 2026-10-04 (hooked better-sqlite3): 93-95% of a cold
 * GET /api/v2/situations — 16-20s of ~22s — was
 * `SELECT hit, clv FROM outcomes WHERE signal_id = ? ORDER BY created_at DESC`,
 * issued ~1,200-1,500 times per request by the situation comparable corpus at
 * ~13.5ms each. Each call was a full scan of the 75k-row outcomes table. Adding
 * idx_outcomes_signal_created by hand on prod took the lookups to 20ms total,
 * the corpus build from 16.9s to 0.73s, and the cold list from 21.8s to 1.55s.
 *
 * Auditing every other outcomes-by-signal_id/game_id query against a 75k-row
 * fixture turned up a second missing index with a worse shape: outcomes.game_id
 * also had none, and exportReplayParityReport fans out one `WHERE game_id = ?`
 * per distinct game_id, so the whole table was scanned once per game. On the
 * fixture (75k outcomes, 8k games) that report took 132s; with
 * idx_outcomes_game it takes 126ms.
 *
 * This suite is the regression guard for both. It asserts plans, not timings —
 * timings are machine-dependent, a plan is not — and it explains the exact SQL
 * strings production prepares, imported from their own modules, because a copy
 * of the SQL in a test can drift green while the real query goes back to a scan.
 *
 * NOTE ON PLAN STABILITY: nothing in this codebase runs ANALYZE, so neither
 * prod nor this fixture has a sqlite_stat1 table and the planner works off its
 * built-in estimates. The plans asserted here are therefore the plans prod gets,
 * and they do not depend on the fixture's row count. The 75k rows are seeded so
 * the before/after numbers quoted above are measured rather than assumed.
 *
 * Store-backed: isolated pipeline.db (PIPELINE_DATA_DIR set before the store is
 * imported) with ../../storage mocked, mirroring situation-bloat-cleanup.test.ts.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-outcomes-index-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;

vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
  storage: { upsertSourceScore: vi.fn() },
  insertSettledOutcome: vi.fn(),
  getSettledOutcomesForAccuracy: vi.fn(() => []),
}));

let store: typeof import("../store");
let corpus: typeof import("../situations-comparable-corpus");
let replay: typeof import("../replay-validation");
let db: BetterSqlite3.Database;

/**
 * Fixture size. Prod carries ~75k outcomes; 68% of them are flagged
 * excluded_stale (the #67 settlement fix kept bad matches instead of deleting
 * them). Signals outnumber games the way prod's do, and 15k signals carry two
 * outcome rows so the ORDER BY has real ties to resolve.
 */
const N_GAMES = 2_000;
const N_SIGNALS = 15_000;
const N_OUTCOMES = 18_000;
const STALE_PERCENT = 68;

const iso = (minutes: number) => new Date(Date.UTC(2025, 0, 1) + minutes * 60_000).toISOString();

beforeAll(async () => {
  store = await import("../store");
  corpus = await import("../situations-comparable-corpus");
  replay = await import("../replay-validation");
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
      game.run(`g${i}`, LEAGUES[i % LEAGUES.length], `H${i % 60}`, `A${i % 61}`,
        iso(i * 20), i % 5 === 0 ? "scheduled" : "final", iso(i), iso(i));
    }

    const signal = target.prepare(`
      INSERT INTO live_signals
        (id, league, game_id, signal_type, headline, signal_time, created_at, updated_at, betting_relevance)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);
    for (let i = 0; i < N_SIGNALS; i++) {
      signal.run(`sig${i}`, LEAGUES[i % LEAGUES.length], i % 7 === 0 ? null : `g${i % N_GAMES}`,
        TYPES[i % TYPES.length], `headline ${i}`, iso(i), iso(i), iso(i), i % 2);
    }

    const outcome = target.prepare(`
      INSERT INTO outcomes
        (id, signal_id, game_id, market, hit, clv, recorded_at, created_at, excluded_stale)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);
    for (let i = 0; i < N_OUTCOMES; i++) {
      const sig = i % N_SIGNALS;
      outcome.run(
        `out${i}`, `sig${sig}`, `g${sig % N_GAMES}`, "spread",
        i % 4 === 0 ? null : (i % 2),          // 25% unsettled (hit IS NULL)
        i % 3 === 0 ? null : (i % 7) - 3,      // 33% carry no clv
        iso(i),
        // Ties on created_at inside a signal: both of a signal's two rows share
        // a timestamp, so the ORDER BY is not trivially satisfied.
        iso(sig),
        i % 100 < STALE_PERCENT ? 1 : 0,
      );
    }
  })();
}

const LEAGUES = ["NFL", "NBA", "MLB", "CFB"];
const TYPES = ["injury", "roster", "line_move", "operator_note"];

/** The plan for `sql`, flattened to one line for readable failure messages. */
function planFor(sql: string, ...args: unknown[]): string {
  return (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args) as { detail: string }[])
    .map((row) => row.detail.trim())
    .join(" | ");
}

describe("outcomes index coverage", () => {
  it("seeds a prod-shaped fixture with no ANALYZE stats", () => {
    expect((db.prepare("SELECT COUNT(*) AS n FROM outcomes").get() as any).n).toBe(N_OUTCOMES);
    expect((db.prepare("SELECT COUNT(*) AS n FROM outcomes WHERE excluded_stale = 1").get() as any).n)
      .toBe(Math.round(N_OUTCOMES * STALE_PERCENT / 100));
    // If this ever becomes true the asserted plans stop being the plans prod gets.
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'sqlite_stat1'").get()).toBeUndefined();
  });

  /**
   * Both statements live inside initSchema's main exec, which getPipelineDb runs
   * on every open — so an existing prod DB picks them up on the next boot the
   * same way it picked up idx_live_signals_league and the rest of that block.
   * This asserts the fresh-DB path, which is the one a test can reach: initSchema
   * is module-private and the handle is a singleton, so there is no way from here
   * to re-run it against a DB that already exists.
   */
  it("creates both outcome indexes from the schema", () => {
    const names = (db.prepare("PRAGMA index_list(outcomes)").all() as { name: string }[])
      .map((row) => row.name);
    expect(names).toContain("idx_outcomes_signal_created");
    expect(names).toContain("idx_outcomes_game");

    // Same name and columns as the indexes created by hand on prod on 2026-10-04,
    // so re-running the schema there is a no-op rather than a second index.
    const sql = (db.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'outcomes' AND sql IS NOT NULL",
    ).all() as { name: string; sql: string }[]);
    expect(sql.find((row) => row.name === "idx_outcomes_signal_created")?.sql)
      .toMatch(/ON outcomes\(signal_id, created_at DESC\)/);
    expect(sql.find((row) => row.name === "idx_outcomes_game")?.sql)
      .toMatch(/ON outcomes\(game_id, signal_id\)/);

    // Re-opening must not fail or duplicate.
    expect(() => store.getPipelineDb()).not.toThrow();
    // The two above, the PRIMARY KEY autoindex, and idx_outcomes_settled_signal
    // — the partial covering index PR #80 added for the track-record aggregate.
    // Named as well as counted, so an unplanned fifth index still fails here
    // and a renamed fourth one does not pass by keeping the count right.
    expect(names).toContain("idx_outcomes_settled_signal");
    expect((db.prepare(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index' AND tbl_name = 'outcomes'",
    ).get() as any).n).toBe(4);
  });

  /**
   * THE GUARD THAT MATTERS MOST.
   *
   * This is the query that took the endpoint down. It must be an index seek,
   * and the ORDER BY must be satisfied by the index rather than by a sort — the
   * corpus runs it ~1,500 times per request, so a temp B-tree per call is a
   * per-request cost, not a one-off.
   */
  it("serves the comparable-corpus outcome lookup by index seek, with no sort", () => {
    const plan = planFor(corpus.OUTCOMES_FOR_SIGNAL_SQL, "sig42");
    expect(plan, plan).toMatch(/SEARCH outcomes USING (COVERING )?INDEX idx_outcomes_signal_created/);
    expect(plan, plan).not.toMatch(/\bSCAN\b/);
    expect(plan, plan).not.toMatch(/TEMP B-TREE/i);
  });

  it("serves getOutcomes(signal_id) by the same index, with no sort", () => {
    const plan = planFor(store.OUTCOMES_BY_SIGNAL_SQL, "sig42");
    expect(plan, plan).toMatch(/SEARCH outcomes USING (COVERING )?INDEX idx_outcomes_signal_created/);
    expect(plan, plan).not.toMatch(/\bSCAN\b/);
    expect(plan, plan).not.toMatch(/TEMP B-TREE/i);
  });

  /**
   * The replay-parity report's fan-out. SIGNAL_IDS_FOR_GAME_SQL runs once per
   * row DISTINCT_GAME_IDS_SQL returns, so a scan here is quadratic in the
   * outcome count — 132s on the 75k-row fixture before idx_outcomes_game.
   */
  it("serves both replay-parity game_id reads from the covering game index", () => {
    const fanOut = planFor(replay.SIGNAL_IDS_FOR_GAME_SQL, "g42");
    expect(fanOut, fanOut).toMatch(/SEARCH outcomes USING COVERING INDEX idx_outcomes_game/);
    expect(fanOut, fanOut).not.toMatch(/\bSCAN\b/);
    expect(fanOut, fanOut).not.toMatch(/TEMP B-TREE/i);

    // The list that drives the fan-out reads every game_id, so a scan is correct
    // here — but it must be a covering index scan, and DISTINCT + ORDER BY must
    // both fall out of the index order rather than a temp B-tree.
    const list = planFor(replay.DISTINCT_GAME_IDS_SQL);
    expect(list, list).toMatch(/SCAN outcomes USING COVERING INDEX idx_outcomes_game/);
    expect(list, list).not.toMatch(/TEMP B-TREE/i);
  });

  /**
   * The four accuracy/replay joins that used to be asserted here have moved to
   * settlement-plan-pins.test.ts, against the exported SQL production now
   * prepares rather than copies of it.
   *
   * They were on a "SEARCH o, never SCAN o" guard, which the follow-up PR
   * deliberately inverts: pinning the loop order with CROSS JOIN makes the
   * outcomes side a COVERING SCAN of the partial index and the live_signals side
   * the seek. SEARCH o was the symptom of driving the join from the wrong table,
   * not the goal — the same correction getTrackRecord got below when #80 pinned
   * it. Asserting the old shape against the new SQL would fail; asserting it
   * against these copies would have passed while production ran something else.
   */

  /**
   * getTrackRecord is no longer this shape, so it gets its own assertion
   * against the statement production actually prepares.
   *
   * It sat on the list above until PR #80 pinned it with CROSS JOIN, and the
   * pin exists because of THIS PR: idx_outcomes_signal_created made the planner
   * drive the join from idx_live_signals_league, which doubled the query
   * (139 -> 275ms in #80's audit). Pinned, and served by the two covering
   * indexes, it is 116 -> 11.4ms on the 150k/75k fixture. Leaving the old copy
   * on that row would have asserted a plan for SQL production no longer runs.
   */
  it("keeps getTrackRecord on its pinned covering-index plan", () => {
    for (const [name, sql] of [
      ["overall", store.TRACK_RECORD_OVERALL_SQL],
      ["by type", store.TRACK_RECORD_BY_TYPE_SQL],
    ] as const) {
      const plan = planFor(sql, "NFL");
      expect(plan, `${name}: ${plan}`).toMatch(
        /SCAN o USING COVERING INDEX idx_outcomes_settled_signal/,
      );
      expect(plan, `${name}: ${plan}`).toMatch(
        /SEARCH s USING COVERING INDEX idx_live_signals_id_league_type/,
      );
      // The loop order is what CROSS JOIN pins: outcomes outer, each signal
      // probed by id. If the planner ever reorders it back to driving from
      // league, neither covering index applies and the cost returns.
      expect(plan, `${name}: ${plan}`).not.toMatch(/idx_live_signals_league\b/);
    }
  });

  /**
   * The scans the audit found and deliberately left alone, pinned so the
   * decision is visible rather than forgotten. Each is a read of every
   * qualifying outcome row with no signal_id or game_id predicate, so scanning
   * is the correct plan — an index would only save the sort, on paths that run
   * once per batch job rather than once per request.
   */
  it("documents the full scans that were reported and not indexed", () => {
    // calibration.ts runCalibration: wants every settled outcome. A covering
    // partial index took the pull from 333ms to 256ms on the 75k fixture — not
    // worth the write cost on a path that runs once per calibration cycle.
    const calibration = planFor(CALIBRATION_SETTLED);
    expect(calibration, calibration).toMatch(/\bSCAN o\b/);

    // settlement.ts stale bookkeeping: counts/lists every flagged row.
    expect(planFor("SELECT COUNT(*) AS n FROM outcomes WHERE excluded_stale = 1")).toMatch(/\bSCAN\b/);
    expect(planFor("SELECT signal_id FROM outcomes WHERE excluded_stale = 1")).toMatch(/\bSCAN\b/);

    // store.ts getOutcomes() with no signal_id. Every caller passes one, so this
    // branch is unreachable in production; left as-is rather than indexed.
    expect(planFor("SELECT * FROM outcomes ORDER BY created_at DESC LIMIT 200")).toMatch(/\bSCAN\b/);
  });

  /**
   * An index is only a performance change if the rows come back the same. The
   * fixture gives every signal's outcome rows an identical created_at, so the
   * ORDER BY cannot distinguish them and the index's tie order (rowid) differs
   * from the sorter's — this pins that the corpus's derived linkage does not
   * care, which is what makes the index safe to add under the replay hashes.
   */
  it("derives identical outcome linkage with the index and without it", () => {
    const read = (signalId: string) =>
      db.prepare(corpus.OUTCOMES_FOR_SIGNAL_SQL).all(signalId) as Array<{ hit: number | null; clv: number | null }>;
    const linkage = (rows: Array<{ hit: number | null; clv: number | null }>) => ({
      rows: rows.length,
      settled: rows.filter((row) => row.hit !== null).length,
      clv: rows.filter((row) => row.clv !== null).length,
    });

    const ids = Array.from({ length: 400 }, (_, i) => `sig${(i * 37) % N_SIGNALS}`);
    const withIndex = ids.map((id) => linkage(read(id)));

    db.exec("DROP INDEX idx_outcomes_signal_created");
    try {
      expect(planFor(corpus.OUTCOMES_FOR_SIGNAL_SQL, "sig42")).toMatch(/\bSCAN\b/); // the bug, reproduced
      expect(ids.map((id) => linkage(read(id)))).toEqual(withIndex);
    } finally {
      db.exec("CREATE INDEX IF NOT EXISTS idx_outcomes_signal_created ON outcomes(signal_id, created_at DESC)");
    }
    expect(planFor(corpus.OUTCOMES_FOR_SIGNAL_SQL, "sig42")).not.toMatch(/\bSCAN\b/);
  });

  /**
   * REPORT ONLY — pins today's behaviour so the open decision stays visible.
   *
   * outcomesForSignalIds has no `excluded_stale = 0` filter, unlike the accuracy
   * and calibration paths fixed in #67. 68% of outcomes are flagged, so the
   * corpus's settlement/CLV linkage counts rows settlement itself judged to be
   * bad game matches. This asserts the unfiltered behaviour, and measures what
   * filtering would move, on the same fixture. If someone adds the filter this
   * test fails — which is the point: the decision gets made, not drifted into.
   */
  it("still counts excluded_stale outcomes, and measures what filtering would change", () => {
    const unfiltered = db.prepare(corpus.OUTCOMES_FOR_SIGNAL_SQL);
    const filtered = db.prepare(
      "SELECT hit, clv FROM outcomes WHERE signal_id = ? AND excluded_stale = 0 ORDER BY created_at DESC",
    );
    const derive = (rows: Array<{ hit: number | null; clv: number | null }>) => {
      const settled = rows.filter((row) => row.hit !== null).length;
      const clv = rows.filter((row) => row.clv !== null).length;
      const sample = Math.max(settled, clv);
      return [
        clv ? "clv_linked" : (settled || rows.length) ? "outcome_linked" : "no_link",
        settled ? "settled" : rows.length ? "unknown" : "unsettled",
        clv ? "available" : rows.length ? "absent" : "unavailable",
        sample <= 0 ? "no_sample" : sample < 3 ? "limited_sample" : sample < 10 ? "directional_sample" : "stronger_sample",
      ].join("/");
    };

    const ids = Array.from({ length: 2_000 }, (_, i) => `sig${(i * 17) % N_SIGNALS}`);
    let rowsUnfiltered = 0;
    let rowsFiltered = 0;
    let changed = 0;
    for (const id of ids) {
      const before = unfiltered.all(id) as any[];
      const after = filtered.all(id) as any[];
      rowsUnfiltered += before.length;
      rowsFiltered += after.length;
      if (derive(before) !== derive(after)) changed++;
    }

    // The production SQL reads stale rows today. This is the behaviour under review.
    expect(corpus.OUTCOMES_FOR_SIGNAL_SQL).not.toMatch(/excluded_stale/);
    expect(rowsUnfiltered).toBeGreaterThan(rowsFiltered);
    // ~68% fewer rows, and roughly two thirds of signals land in a different
    // linkage/settlement/CLV/sample band once the stale rows are dropped.
    expect(rowsFiltered / rowsUnfiltered).toBeLessThan(0.4);
    expect(changed / ids.length).toBeGreaterThan(0.5);
  });
});

/* ─── Audited SQL copied from the join call sites ──────────────────────────
 * These are plan-audit references for queries that reach outcomes by signal_id
 * through a live_signals filter. They are copies, not imports: extracting them
 * into exported constants would churn three modules for queries whose plans the
 * new index already serves. The assertion that matters — the outcomes side is a
 * seek — holds for the shape, and the shape is what the join fixes. */

const CALIBRATION_SETTLED = `
  SELECT o.hit, o.clv, s.league, s.signal_type, s.breakdown
  FROM outcomes o
  JOIN live_signals s ON s.id = o.signal_id
  WHERE o.hit IS NOT NULL AND o.excluded_stale = 0
  ORDER BY o.created_at ASC
`;
