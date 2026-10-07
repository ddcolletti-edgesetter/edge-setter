import { describe, expect, it, beforeAll, vi } from "vitest";
import type BetterSqlite3 from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { createHash } from "crypto";

/**
 * Request-path query audit — regression guard.
 *
 * PROD, 2026-10-05 (cold, just after the #77 deploy): GET /api/v2/situations
 * 30-46s, GET /api/v2/signals 14.1s (on a 304), GET /api/stats/track-record
 * 3.1s, GET /api/leaderboard 1.25s. This suite is the audit of what those
 * handlers actually run, turned into assertions.
 *
 * MEASURED ON A PROD-SHAPED FIXTURE (150k live_signals with real-size JSON
 * columns, 75k outcomes, 3,700 situations, 8k games), statements per request,
 * before -> after:
 *
 *   GET /api/v2/signals?limit=50                      92 ->   4   (1,756ms ->   3.3ms)
 *   GET /api/v2/signals?band=Elite&limit=50             2 ->   2   (  774ms ->  17.2ms)
 *   GET /api/v2/situations?league=NFL&limit=100   30,644 -> 154   (31,649ms -> 390ms)
 *   GET /api/v2/situations (same, caches warm)     8,616 ->  88   ( 5,429ms ->  59ms)
 *   GET /api/v2/situations?limit=250&order_by=…   43,544 -> 158   (39,897ms -> 478ms)
 *   GET /api/stats/track-record?league=NFL             4 ->   4   (  307ms ->  30.6ms)
 *   GET /api/signals?league=NFL                      180 ->   4   (  492ms -> 464ms, plan unchanged by choice)
 *   GET /api/v2/games?league=NFL                       2 ->   2   (   15ms ->  17ms, plan fixed)
 *   GET /api/leaderboard                               4 ->   4   (  166ms -> 168ms, reported only)
 *
 * WHAT THIS SUITE ASSERTS, AND WHY IN THIS ORDER
 *
 *  1. PLANS, not timings. Timings are machine-dependent; a plan is not. The SQL
 *     strings are imported from the modules that run them — a copy of the SQL in
 *     a test can drift green while production goes back to a scan.
 *
 *  2. STATEMENT COUNTS. The plans were nearly all fine before this PR; the cost
 *     was running good statements thousands of times. A plan assertion cannot
 *     see that, so the counts are asserted directly, through the same
 *     sql-accounting hook that now annotates the [express] request log.
 *
 *  3. EQUIVALENCE. Every batched read is asserted to produce output identical to
 *     the per-id path it replaced, deep-equal, on the same fixture. That is the
 *     response-shape guarantee and — because corpus records are canonically
 *     hashed — the replay-hash guarantee.
 *
 * PLAN STABILITY: nothing in this repo runs ANALYZE, so neither prod nor this
 * fixture has sqlite_stat1 and the planner works from its built-in estimates.
 * The plans asserted here are the plans prod gets, independent of row count,
 * which is why this fixture can be small enough to run in CI while the numbers
 * quoted above come from the full-size one.
 *
 * Store-backed, mirroring outcomes-signal-index.test.ts: an isolated
 * pipeline.db (PIPELINE_DATA_DIR set before the store is imported) with
 * ../../storage mocked.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-request-path-"));
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
let sitStore: typeof import("../situations-store");
let sitApi: typeof import("../situations-api");
let corpus: typeof import("../situations-comparable-corpus");
let accounting: typeof import("../../sql-accounting");
let db: BetterSqlite3.Database;

/**
 * Fixture shape, scaled down from the profiling fixture but with the same
 * proportions: signals dominate, most are archived, two thirds of outcomes are
 * excluded_stale (#67 kept bad matches instead of deleting them), a fifth of
 * situations resolve their game through the side table, and half the games are
 * in the future so listCanonicalSituations' game_time filter keeps a realistic
 * share.
 */
const N_GAMES = 400;
const N_SIGNALS = 6_000;
const N_OUTCOMES = 4_000;
const N_SITUATIONS = 300;
const EVENTS_PER_SITUATION = 8;
const SNAPSHOTS_PER_SITUATION = 4;
const HISTORY_PER_SITUATION = 4;
const N_SOURCES = 20;

const LEAGUES = ["NFL", "NBA", "MLB", "CFB"];
const TYPES = ["injury", "roster", "line_move", "operator_note"];
const SIT_TYPES = ["injury_status", "roster_move", "market_move", "lineup_watch"];
const STATES = ["watching", "emerging", "developing", "escalating", "confirmed", "official", "cooling", "resolved"];

const iso = (minutes: number) => new Date(Date.UTC(2026, 8, 1) + minutes * 60_000).toISOString();
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const signalIdFor = (situation: number, event: number) => `sig${(situation * EVENTS_PER_SITUATION + event) % N_SIGNALS}`;

beforeAll(async () => {
  store = await import("../store");
  sitStore = await import("../situations-store");
  sitApi = await import("../situations-api");
  corpus = await import("../situations-comparable-corpus");
  accounting = await import("../../sql-accounting");
  accounting.installSqlAccounting();
  db = store.getPipelineDb();
  sitStore.ensureSituationSchema(db);
  seed(db);
});

function seed(target: BetterSqlite3.Database): void {
  target.transaction(() => {
    const game = target.prepare(`
      INSERT INTO games (id, league, home_team, away_team, game_time, status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?)
    `);
    for (let i = 0; i < N_GAMES; i++) {
      const future = i % 2 === 0;
      game.run(`g${i}`, LEAGUES[i % 4], `H${i % 30}`, `A${i % 31}`,
        new Date(Date.now() + (future ? 1 : -1) * (1 + (i % 400)) * 3_600_000).toISOString(),
        future ? "scheduled" : "final", iso(i), iso(i));
    }

    const signal = target.prepare(`
      INSERT INTO live_signals
        (id, league, game_id, signal_type, headline, sources, breakdown, raw_event_ids,
         score, score_band, urgency_label, signal_time, created_at, updated_at,
         betting_relevance, is_archived)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    for (let i = 0; i < N_SIGNALS; i++) {
      signal.run(
        `sig${i}`, LEAGUES[i % 4], i % 9 === 0 ? null : `g${i % N_GAMES}`,
        TYPES[i % TYPES.length], `headline ${i}`,
        JSON.stringify([{ id: `src${i % N_SOURCES}`, name: `Source ${i % N_SOURCES}`, type: "beat_reporter" }]),
        JSON.stringify({ total: 60 + (i % 40), factors: { source_reliability: i % 10 } }),
        JSON.stringify([`raw${i}`]),
        (i * 7919) % 100, ["Elite", "Strong", "Watchlist", "Informational"][i % 4],
        ["URGENT", "WATCH", "NOTE"][i % 3], iso(i), iso(i), iso(i),
        i % 2, i % 10 === 0 ? 0 : 1,
      );
    }

    const outcome = target.prepare(`
      INSERT INTO outcomes
        (id, signal_id, game_id, market, hit, clv, recorded_at, created_at, excluded_stale)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);
    for (let i = 0; i < N_OUTCOMES; i++) {
      const sig = i % N_SIGNALS;
      // hit is keyed on %5 and the signal's league on %4, so every league has
      // settled outcomes — keying both on %4 would have left NFL with none and
      // made the track-record assertion compare two empty aggregates.
      outcome.run(`out${i}`, `sig${sig}`, `g${sig % N_GAMES}`, "spread",
        i % 5 === 0 ? null : (i % 2), i % 3 === 0 ? null : (i % 7) - 3,
        iso(i), iso(sig), i % 100 < 68 ? 1 : 0);
    }
  })();

  target.transaction(() => {
    const situation = target.prepare(`
      INSERT INTO situations
        (situation_id, canonical_hash, sport, league, game_id, teams_json, players_json,
         player_espn_id, player_jersey, situation_type, semantic_fingerprint,
         created_from_event_id, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const event = target.prepare(`
      INSERT INTO situation_events
        (event_id, situation_id, kind, raw_event_id, normalized_event_id, source_id,
         observed_at, recorded_at, replay_hash, lineage_hash, payload_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `);
    const snapshot = target.prepare(`
      INSERT INTO situation_snapshots
        (snapshot_id, situation_id, lifecycle_state, confidence_score, confidence_json,
         summary, escalation_score, timing_pressure, evidence_event_ids_json,
         replay_hash, previous_snapshot_hash, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const confidence = target.prepare(`
      INSERT INTO situation_confidence_history
        (history_id, situation_id, previous_confidence, new_confidence,
         factor_breakdown_json, reasoning_json, event_id, replay_hash, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);
    const state = target.prepare(`
      INSERT INTO situation_state_history
        (history_id, situation_id, previous_state, new_state, transition_reason,
         trigger_event_id, metadata_json, replay_hash, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);
    const confirmation = target.prepare(`
      INSERT INTO situation_public_confirmations
        (situation_id, confirmed_at, detection_lead_minutes, source_name,
         confirmation_reason, raw_event_id, created_at)
      VALUES (?,?,?,?,?,?,?)
    `);
    const audit = target.prepare(`
      INSERT INTO situation_founding_audit
        (situation_id, founding_row_count, kept_event_id, keep_key_source,
         deleted_row_count, audited_at)
      VALUES (?,?,?,?,?,?)
    `);
    const resolution = target.prepare(`
      INSERT INTO situation_game_resolution (situation_id, resolved_game_id, resolved_at)
      VALUES (?,?,?)
    `);

    for (let i = 0; i < N_SITUATIONS; i++) {
      const id = `sit_${i}`;
      const league = LEAGUES[i % 4];
      const hasDirectGame = i % 5 !== 0;
      situation.run(id, sha(id),
        league === "NBA" ? "basketball" : league === "MLB" ? "baseball" : "football",
        league, hasDirectGame ? `g${i % N_GAMES}` : null,
        JSON.stringify([`T${i % 30}`, `T${(i + 1) % 30}`]),
        JSON.stringify([`Player ${i % 90}`]),
        `espn${i % 90}`, String(i % 99), SIT_TYPES[i % SIT_TYPES.length],
        `fingerprint ${i}`, `ev_${i}_0`, iso(i));
      if (!hasDirectGame) resolution.run(id, `g${(i + 3) % N_GAMES}`, iso(i));

      for (let e = 0; e < EVENTS_PER_SITUATION; e++) {
        const eventId = `ev_${i}_${e}`;
        // The lineage payload shape situations-adapter writes. signalIdsFor
        // reads it, so this is what makes the corpus fan out one outcome
        // lookup per signal id — the thing the batching replaces.
        event.run(eventId, id, e === 0 ? "situation_created" : "situation_matched",
          `raw_${i}_${e}`, `norm_${i}_${e}`, `src${(i + e) % N_SOURCES}`,
          iso(i + e), iso(i + e), sha(eventId), sha(`lineage ${eventId}`),
          JSON.stringify({
            normalized_event: {
              league,
              situation_type: SIT_TYPES[i % SIT_TYPES.length],
              raw_event_id: `raw_${i}_${e}`,
              normalized_event_id: `norm_${i}_${e}`,
              source_id: `src${(i + e) % N_SOURCES}`,
              market_context: e % 2 === 0
                ? { delta: ((i + e) % 5) - 2, book: "pinnacle", observed_at: iso(i + e) }
                : undefined,
              payload: {
                raw_payload: { signal_id: signalIdFor(i, e), market: "spread" },
                signal_id: signalIdFor(i, e),
                signalId: signalIdFor(i, e),
                signal_lineage: {
                  signalId: signalIdFor(i, e),
                  rawEventId: `raw_${i}_${e}`,
                  sourceEventId: `src${(i + e) % N_SOURCES}`,
                  lineageStatus: "signal_linked",
                },
                signal_type: TYPES[i % TYPES.length],
              },
            },
          }));
      }

      for (let s = 0; s < SNAPSHOTS_PER_SITUATION; s++) {
        const snapshotId = `snap_${i}_${s}`;
        snapshot.run(snapshotId, id, STATES[(i + s) % STATES.length], 20 + ((i + s * 7) % 80),
          JSON.stringify({
            score: 20 + ((i + s * 7) % 80),
            factors: {
              source_reliability: i % 10,
              official_confirmation: i % 3 === 0 ? 12 : 0,
              market_alignment: i % 9,
              contradiction_penalty: i % 11 === 0 ? -5 : 0,
            },
            reasons: [`reason ${i}-${s}`],
          }),
          `Summary for situation ${i} snapshot ${s}`,
          (i + s) % 100, ["inactive", "approaching", "imminent"][(i + s) % 3],
          JSON.stringify([`ev_${i}_0`, `ev_${i}_1`]),
          sha(snapshotId), s === 0 ? null : sha(`snap_${i}_${s - 1}`), iso(i * 10 + s));
      }

      for (let h = 0; h < HISTORY_PER_SITUATION; h++) {
        confidence.run(`ch_${i}_${h}`, id, h === 0 ? null : 30 + h, 35 + h,
          JSON.stringify({ source_reliability: h }), JSON.stringify([`confidence reason ${i}-${h}`]),
          `ev_${i}_${h}`, sha(`ch_${i}_${h}`), iso(i * 10 + h));
        state.run(`sh_${i}_${h}`, id, h === 0 ? null : STATES[h - 1], STATES[h],
          `transition reason ${i}-${h}`, `ev_${i}_${h}`,
          JSON.stringify({ note: `metadata ${i}-${h}` }), sha(`sh_${i}_${h}`), iso(i * 10 + h));
      }

      if (i % 25 === 0) {
        confirmation.run(id, iso(i + 30), 42, `Source ${i % N_SOURCES}`, "team_official", `raw_${i}_0`, iso(i + 30));
      }
      if (i % 7 === 0) audit.run(id, 1 + (i % 4), `ev_${i}_0`, "earliest_recorded_at", i % 4, iso(i));
    }
  })();
}

/** The plan for `sql`, flattened to one line for readable failure messages. */
function planFor(sql: string, params: unknown[] = []): string {
  return (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as { detail: string }[])
    .map((row) => row.detail.trim())
    .join(" | ");
}

/** `?`-count placeholders, for EXPLAIN-ing a batched statement of width n. */
const args = (n: number) => Array.from({ length: n }, () => "1");

/**
 * Statements used by `work`, measured through the same accounting hook that
 * annotates the [express] request log. The window is closed in a finally so a
 * throwing assertion cannot leave it open and poison the next test.
 */
function accountedStatements(work: () => void): number {
  const finish = accounting.beginSqlAccounting();
  try {
    work();
    return finish().statements;
  } finally {
    finish(); // idempotent; closes the window even if work() threw
  }
}

/**
 * The SQL strings a block of code prepares, in order.
 *
 * For statements built by concatenation (findExistingSignal), where asserting
 * against a copy would let the real predicate drift. Patches the same
 * better-sqlite3 prototype that sql-accounting hooks, and restores it after.
 */
function capturedPrepare(run: () => void): string[] {
  const proto = Object.getPrototypeOf(db) as Record<string, any>;
  const original = proto.prepare;
  const seen: string[] = [];
  proto.prepare = function (this: unknown, sql: string, ...rest: unknown[]) {
    seen.push(sql);
    return original.call(this, sql, ...rest);
  };
  try {
    run();
  } finally {
    proto.prepare = original;
  }
  return seen;
}

describe("request-path query plans", () => {
  describe("GET /api/v2/signals — the delivery feed", () => {
    /**
     * Every filter combination getLiveSignals can build, on the unarchived
     * path. All four must be served by idx_live_signals_active_score with no
     * temp b-tree: before the index this was
     * "SCAN live_signals | USE TEMP B-TREE FOR ORDER BY", 742ms to return 50
     * rows out of 150k.
     */
    const SHAPES: Array<[string, { league?: string; since?: string }, unknown[]]> = [
      ["bare", {}, [50]],
      ["league", { league: "NFL" }, ["NFL", 50]],
      ["since", { since: iso(10) }, [iso(10), 50]],
      ["league+since", { league: "NFL", since: iso(10) }, ["NFL", iso(10), 50]],
    ];

    for (const [label, opts, params] of SHAPES) {
      it(`${label}: seeks idx_live_signals_active_score with no temp b-tree`, () => {
        const plan = planFor(store.liveSignalsFeedSql(opts), params);
        expect(plan).toContain("idx_live_signals_active_score");
        expect(plan).not.toContain("TEMP B-TREE");
        expect(plan).not.toContain("SCAN live_signals");
      });
    }

    /**
     * The hint is armor rather than a fix for today's planner, so what is
     * asserted is that it is present and that the index it names exists —
     * INDEXED BY makes the index load-bearing, and a missing one turns every
     * delivery read into "no such index".
     *
     * The regression it guards against was measured: adding
     * live_signals(league, created_at DESC) re-plans the league+since shape
     * onto it and costs a temp b-tree over the whole league slice,
     * 2.4ms -> 191ms, on the shape distribution-draft.ts runs every cycle.
     * That index is reported and not shipped for a worse reason still — see
     * the /api/signals describe below.
     */
    it("names an index that exists, since INDEXED BY makes it load-bearing", () => {
      const names = (db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='live_signals'",
      ).all() as { name: string }[]).map((row) => row.name);
      expect(names).toContain("idx_live_signals_active_score");
      for (const opts of [{}, { league: "NFL" }, { since: iso(10) }, { league: "NFL", since: iso(10) }]) {
        expect(store.liveSignalsFeedSql(opts)).toContain("INDEXED BY idx_live_signals_active_score");
      }
    });

    /** includeArchived has no is_archived term, so it cannot use that index. */
    it("omits the hint for includeArchived, which cannot seek on is_archived", () => {
      expect(store.liveSignalsFeedSql({ includeArchived: true })).not.toContain("INDEXED BY");
    });

    it("runs 4 statements for a 50-signal feed, not 92", () => {
      const statements = accountedStatements(() => {
        store.applyReadTimeUrgency(store.getLiveSignals({ limit: 50 }));
      });
      // 1 prepare + 1 run for the feed, 1 prepare + 1 run for the batched games.
      expect(statements).toBeLessThanOrEqual(4);
    });
  });

  describe("GET /api/signals and /api/signal — the legacy MVP feed", () => {
    it("unfiltered form walks idx_live_signals_created_at with no temp b-tree", () => {
      const plan = planFor(store.MVP_SIGNALS_ALL_SQL);
      expect(plan).toContain("idx_live_signals_created_at");
      expect(plan).not.toContain("TEMP B-TREE");
    });

    /**
     * Knowingly left sorting. live_signals(league, created_at DESC) takes this
     * from 454ms to 1.4ms, but a plan-regression sweep over every statement in
     * this codebase that touches live_signals / outcomes / games found it also
     * re-plans findExistingSignal — the matcher's dedup lookup, run once per
     * raw event in the ingestion cycle — off its three-column equality seek
     * (idx_live_signals_type_archived_game) and onto a league-slice walk:
     * 0.0ms to 251ms, on the hot path. No client passes ?league= to this
     * route. If one ever does, the fix is to pin findExistingSignal first.
     */
    it("league form is knowingly left on the league index plus a sort", () => {
      const plan = planFor(store.MVP_SIGNALS_BY_LEAGUE_SQL, ["NFL"]);
      expect(plan).toContain("idx_live_signals_league");
      expect(plan).toContain("TEMP B-TREE");
    });

    /** The index that would fix it must not have been added. */
    it("does not carry a live_signals(league, created_at) index", () => {
      const names = (db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='live_signals'",
      ).all() as { name: string }[]).map((row) => row.name);
      expect(names).not.toContain("idx_live_signals_league_created");
    });

    /**
     * The hot-path lookup that index would have broken. Asserted here so the
     * reason the index is absent is a test, not a comment.
     *
     * The SQL is CAPTURED from findExistingSignal rather than copied: it is
     * built by concatenating conditions, so a copy here could keep passing
     * while the real predicate list changed order or lost a term.
     *
     * WHICH index serves it is deliberately not pinned. PR #79's
     * idx_live_signals_injury_dedup (league, signal_type, player,
     * injury_designation) supersedes idx_live_signals_type_archived_game for
     * this predicate, and both are three-column equality seeks of the same
     * order of cost — measured on the 150k-signal fixture, 0.02ms before #79
     * and 0.07ms after. What must never happen is the league-slice walk a
     * live_signals(league, created_at) index would cause: 0.0ms -> 251ms. So
     * the assertions are the invariant (equality seek on >= 3 columns, no
     * table scan), not the index name.
     */
    it("findExistingSignal keeps its multi-column equality seek", () => {
      const sql = capturedPrepare(() =>
        store.findExistingSignal({
          league: "NFL",
          game_id: "g1",
          team: "T1",
          player: "Player 1",
          signal_type: "injury",
          since: iso(10),
        }),
      ).find((text) => text.includes("FROM live_signals"));
      expect(sql, "findExistingSignal prepared no live_signals statement").toBeDefined();
      // The captured statement is the real one, so confirm it still carries the
      // whole predicate list before trusting the plan below.
      for (const term of ["league=?", "is_archived=0", "game_id=?", "team=?", "player=?",
        "signal_type=?", "created_at>=?"]) {
        expect(sql!, sql!).toContain(term);
      }

      const plan = planFor(sql!, ["NFL", "g1", "T1", "Player 1", "injury", iso(10)]);
      const seek = /SEARCH live_signals USING (COVERING )?INDEX (\w+) \(([^)]*)\)/.exec(plan);
      expect(seek, `expected an index seek, got: ${plan}`).not.toBeNull();
      // Three or more leading equality terms resolved by the index.
      const equalities = seek![3].split(" AND ").filter((term) => term.endsWith("=?"));
      expect(equalities.length, `${plan}`).toBeGreaterThanOrEqual(3);
      expect(plan, plan).not.toMatch(/SCAN live_signals\b/);
    });
  });

  describe("GET /api/v2/games", () => {
    it("league form seeks idx_games_league_time with no temp b-tree", () => {
      const plan = planFor(store.GAMES_BY_LEAGUE_SQL, ["NFL"]);
      expect(plan).toContain("idx_games_league_time");
      expect(plan).not.toContain("TEMP B-TREE");
    });

    /**
     * Documented as-is, not fixed: a games(game_time) index removes this temp
     * b-tree but was measured at 65ms -> 54ms on an 8k-game fixture, and no
     * caller passes the unfiltered form. If that changes, this is the test to
     * flip.
     */
    it("unfiltered form is knowingly left sorting", () => {
      expect(planFor(store.GAMES_ALL_SQL)).toContain("TEMP B-TREE");
    });

    it("batched games-by-id lookup seeks the primary key", () => {
      const plan = planFor(store.gamesByIdsSql(3), args(3));
      expect(plan).toContain("SEARCH games");
      expect(plan).not.toContain("SCAN games");
    });
  });

  describe("GET /api/stats/track-record — join order pinned", () => {
    /**
     * The fast plan scans outcomes once and fetches each row's signal by
     * primary key. The planner only picks it while it has nothing that looks
     * better, and PR #78's idx_outcomes_signal_created is one: with it, the
     * planner drives from live_signals instead and seeks outcomes once per
     * league signal — 139ms -> 275ms measured on the prod-shaped fixture, and
     * it does that with main's own idx_live_signals_league, so #78 regresses
     * this query whether or not this PR lands. CROSS JOIN pins the loop order
     * without changing the result.
     *
     * #78 has since merged, so initSchema already creates that index and the
     * exec below is a no-op. It is kept because it is what makes this block's
     * assertion meaningful on its own terms: the pin is only load-bearing while
     * a competing outcomes index exists, and the test should not depend on
     * another module's schema to supply one.
     */
    beforeAll(() => {
      db.exec("CREATE INDEX IF NOT EXISTS idx_outcomes_signal_created ON outcomes(signal_id, created_at DESC)");
    });

    for (const [label, sql] of [
      ["overall", () => store.TRACK_RECORD_OVERALL_SQL],
      ["by signal_type", () => store.TRACK_RECORD_BY_TYPE_SQL],
    ] as const) {
      it(`${label}: both sides of the join are index-only`, () => {
        const plan = planFor(sql(), ["NFL"]);
        // Outcomes outer, from the partial index holding exactly the rows the
        // WHERE keeps, with hit and clv in it — no table page is read.
        expect(plan).toContain("SCAN o USING COVERING INDEX idx_outcomes_settled_signal");
        // The probe reads league (and signal_type) out of the index too, rather
        // than dragging the signal's headline/body/JSON off disk per row.
        expect(plan).toContain("SEARCH s USING COVERING INDEX idx_live_signals_id_league_type");
        // The pin held: #78's index did not pull the loops inside out.
        expect(plan).not.toContain("SEARCH o USING INDEX idx_outcomes_signal_created");
      });
    }

    /**
     * Without CROSS JOIN, and with #78's index present, the planner inverts the
     * loops and ignores both covering indexes — 139ms -> 275ms measured. This
     * asserts the pin is what is doing the work, so deleting the CROSS JOIN
     * fails here rather than quietly on prod.
     */
    it("the same query without the pin takes the bad plan", () => {
      const unpinned = store.TRACK_RECORD_OVERALL_SQL.replace("CROSS JOIN", "JOIN");
      expect(unpinned).not.toBe(store.TRACK_RECORD_OVERALL_SQL);
      const plan = planFor(unpinned, ["NFL"]);
      expect(plan).not.toContain("SCAN o USING COVERING INDEX idx_outcomes_settled_signal");
    });

    it("still returns the same numbers with the pin in place", () => {
      const record = store.getTrackRecord("NFL");
      const reference = db.prepare(`
        SELECT COUNT(*) AS total_signals,
               SUM(CASE WHEN o.hit = 1 THEN 1 ELSE 0 END) AS wins,
               SUM(CASE WHEN o.hit = 0 THEN 1 ELSE 0 END) AS losses
        FROM outcomes o JOIN live_signals s ON s.id = o.signal_id
        WHERE s.league = ? AND o.hit IS NOT NULL AND o.excluded_stale = 0
      `).get("NFL") as any;
      // Guard the guard: a fixture with no settled NFL outcomes would make
      // this assertion pass by comparing two zeroes.
      expect(reference.total_signals).toBeGreaterThan(0);
      expect(record.overall.total_signals).toBe(reference.total_signals);
      expect(record.overall.wins).toBe(reference.wins ?? 0);
      expect(record.overall.losses).toBe(reference.losses ?? 0);
      expect(record.overall.hit_rate).not.toBeNull();
    });
  });

  describe("GET /api/v2/situations — batched per-situation reads", () => {
    const BATCHED_PLANS: Array<[string, (n: number) => string, string]> = [
      ["situation_events", (n) => sitStore.situationEventsByIdsSql(n), "idx_situation_events_situation"],
      ["situation_state_history", (n) => sitStore.situationStateHistoryByIdsSql(n), "idx_situation_state_history_situation"],
      ["situation_confidence_history", (n) => sitStore.situationConfidenceHistoryByIdsSql(n), "idx_situation_confidence_history_situation"],
    ];

    for (const [label, sql, index] of BATCHED_PLANS) {
      it(`${label}: seeks ${index} with no temp b-tree`, () => {
        // The situation_id ASC prefix on the ORDER BY is what lets the
        // existing (situation_id, …) index satisfy the batched sort too.
        const plan = planFor(sql(4), args(4));
        expect(plan).toContain(index);
        expect(plan).not.toContain("TEMP B-TREE");
      });
    }

    it("founding audit and public confirmations seek their primary keys", () => {
      expect(planFor(sitStore.situationFoundingAuditByIdsSql(4), args(4)))
        .toContain("SEARCH situation_founding_audit");
      expect(planFor(sitStore.situationPublicConfirmationsByIdsSql(4), args(4)))
        .toContain("SEARCH situation_public_confirmations");
    });

    it("batched outcomes lookup carries no temp b-tree", () => {
      // The single-id form ordered by created_at DESC; nothing reads that
      // order, so the batched form drops it rather than sorting to discard.
      expect(planFor(corpus.outcomesBySignalIdsSql(4), args(4))).not.toContain("TEMP B-TREE");
    });

    /**
     * The headline number. Before: 30,644 statements for a 100-situation
     * response, 1,503 of them full repetitions of ensureSituationSchema's
     * CREATE TABLE / INDEX / TRIGGER script.
     *
     * The bound is generous against the measured 154/88 so it tracks the shape
     * of the fix rather than its exact arithmetic — but it is far below any
     * per-record fan-out, so reintroducing one fails here.
     */
    it("runs a bounded number of statements regardless of result size", () => {
      sitApi.resetSituationsApiBuildCaches();
      const cold = accountedStatements(() => {
        sitApi.listCanonicalSituationApiResponses({ league: "NFL", limit: 100 });
      });
      const warm = accountedStatements(() => {
        sitApi.listCanonicalSituationApiResponses({ league: "NFL", limit: 100 });
      });
      expect(cold).toBeLessThan(400);
      expect(warm).toBeLessThan(200);
    });

    it("does not run more statements for 250 situations than for 100", () => {
      sitApi.resetSituationsApiBuildCaches();
      const hundred = accountedStatements(() => {
        sitApi.listCanonicalSituationApiResponses({ league: "NFL", limit: 100 });
      });
      const twoFifty = accountedStatements(() => {
        sitApi.listCanonicalSituationApiResponses({ limit: 250, orderBy: "operational_visibility_score" });
      });
      // Statement count is now a function of the number of id CHUNKS, not the
      // number of situations, so widening the limit must not scale it.
      expect(twoFifty).toBeLessThanOrEqual(hundred + 20);
    });
  });

  describe("batched reads are equivalent to the per-id reads they replaced", () => {
    it("listSituationEventsForIds matches listSituationEvents per situation", () => {
      const ids = Array.from({ length: 40 }, (_, i) => `sit_${i}`);
      const batched = sitStore.listSituationEventsForIds(ids);
      for (const id of ids) {
        expect(batched.get(id) ?? []).toEqual(sitStore.listSituationEvents(id));
      }
    });

    it("listSituationStateHistoryForIds matches listSituationStateHistory", () => {
      const ids = Array.from({ length: 40 }, (_, i) => `sit_${i}`);
      const batched = sitStore.listSituationStateHistoryForIds(ids);
      for (const id of ids) {
        expect(batched.get(id) ?? []).toEqual(sitStore.listSituationStateHistory(id));
      }
    });

    it("listSituationConfidenceHistoryForIds matches listSituationConfidenceHistory", () => {
      const ids = Array.from({ length: 40 }, (_, i) => `sit_${i}`);
      const batched = sitStore.listSituationConfidenceHistoryForIds(ids);
      for (const id of ids) {
        expect(batched.get(id) ?? []).toEqual(sitStore.listSituationConfidenceHistory(id));
      }
    });

    it("founding-audit and public-confirmation maps match the per-id getters", () => {
      const ids = Array.from({ length: 40 }, (_, i) => `sit_${i}`);
      const audits = sitStore.getSituationFoundingAuditForIds(ids);
      const confirmations = sitStore.getSituationPublicConfirmationsForIds(ids);
      for (const id of ids) {
        expect(audits.get(id) ?? null).toEqual(sitStore.getSituationFoundingAudit(id));
        expect(confirmations.get(id) ?? null).toEqual(sitStore.getSituationPublicConfirmation(id));
      }
    });

    it("an id with no rows is absent from the map, matching the empty per-id read", () => {
      const missing = "sit_does_not_exist";
      expect(sitStore.listSituationEventsForIds([missing]).has(missing)).toBe(false);
      expect(sitStore.listSituationEvents(missing)).toEqual([]);
      expect(sitStore.getSituationFoundingAuditForIds([missing]).get(missing) ?? null).toBeNull();
      expect(sitStore.getSituationFoundingAudit(missing)).toBeNull();
    });

    it("getGamesByIds matches getGame per id, including a missing one", () => {
      const ids = [...Array.from({ length: 30 }, (_, i) => `g${i}`), "g_missing"];
      const batched = store.getGamesByIds(ids);
      for (const id of ids) {
        expect(batched.get(id) ?? null).toEqual(store.getGame(id));
      }
    });

    it("prefetched outcome rows match the per-signal lookup as a multiset", () => {
      const ids = Array.from({ length: 50 }, (_, i) => `sig${i * 3}`);
      const batched = corpus.outcomesForSignalIdsBatched(ids);
      for (const id of ids) {
        const perId = db.prepare(corpus.OUTCOMES_FOR_SIGNAL_SQL).all(id) as Array<{ hit: number | null; clv: number | null }>;
        const sort = (rows: Array<{ hit: number | null; clv: number | null }>) =>
          [...rows].map((row) => `${row.hit}:${row.clv}`).sort();
        expect(sort(batched.get(id) ?? [])).toEqual(sort(perId));
      }
    });

    /**
     * The response-shape guarantee. The batched path and the per-id path are
     * run over the same fixture and the whole response array is compared
     * deep-equal — every field, every nested evidence/history preview, and the
     * historical-calibration prose that the comparable corpus feeds.
     */
    it("GET /api/v2/situations returns identical responses either way", () => {
      sitApi.resetSituationsApiBuildCaches();
      const batched = sitApi.listCanonicalSituationApiResponses({ league: "NFL", limit: 100 });
      expect(batched.length).toBeGreaterThan(10);

      // The same mapper, record by record, with no prefetch — so it takes the
      // per-id store reads. The corpus is passed in explicitly so both sides
      // score comparables against the same corpus.
      const corpusRecords = corpus.buildComparableSituationCorpus();
      const perRecord = sitStore.listCanonicalSituations({
        league: "NFL", order_by: "updated_at", limit: 100,
      }).map((record) => sitApi.mapCanonicalSituationToApiResponse(record, corpusRecords));

      // Compared by id so the assertion is about content, not the ordering the
      // route applies on top (sortCanonicalSituationApiResponses).
      const byId = (rows: typeof batched) =>
        [...rows].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
      expect(byId(batched).map((row) => row.id)).toEqual(byId(perRecord).map((row) => row.id));
      expect(byId(batched)).toEqual(byId(perRecord));
    });

    it("the comparable corpus is identical batched or per-record", () => {
      const batched = corpus.buildComparableSituationCorpus(120);
      const perRecord = sitStore.listCanonicalSituations({ limit: 120 })
        .map((record) => corpus.buildComparableSituationCorpusRecord({
          record,
          events: sitStore.listSituationEvents(record.situation_id),
          stateHistory: sitStore.listSituationStateHistory(record.situation_id),
        }))
        .sort((left, right) => left.corpus_id < right.corpus_id ? -1 : left.corpus_id > right.corpus_id ? 1 : 0);
      // corpus_id is a canonical hash of the record's classification, so equal
      // ids here is the replay-hash stability guarantee.
      expect([...batched].map((row) => row.corpus_id).sort())
        .toEqual(perRecord.map((row) => row.corpus_id).sort());
    });

    it("applyReadTimeUrgency labels signals the same batched or per-id", () => {
      const signals = store.getLiveSignals({ limit: 60 });
      const batched = store.applyReadTimeUrgency(signals);
      // Per-id reference: one signal at a time, so each call batches exactly
      // one game — the shape the old per-game-id loop had.
      const perId = signals.map((signal) => store.applyReadTimeUrgency([signal])[0]);
      expect(batched).toEqual(perId);
    });
  });

  describe("chunking", () => {
    it("splits an id list wider than the parameter limit and dedupes it", () => {
      const ids = Array.from({ length: store.BATCH_PARAM_LIMIT * 2 + 7 }, (_, i) => `id${i}`);
      const chunks = store.chunkIds([...ids, ...ids.slice(0, 50)]);
      expect(chunks.length).toBe(3);
      expect(chunks.flat().length).toBe(ids.length);
      expect(new Set(chunks.flat()).size).toBe(ids.length);
      expect(chunks.every((chunk) => chunk.length <= store.BATCH_PARAM_LIMIT)).toBe(true);
    });

    it("reads every row when the id list spans more than one chunk", () => {
      // Pad a real id list past the chunk width with ids that match nothing, so
      // the reader must run several statements and merge them.
      const real = Array.from({ length: 30 }, (_, i) => `sit_${i}`);
      const padding = Array.from({ length: store.BATCH_PARAM_LIMIT }, (_, i) => `absent_${i}`);
      const batched = sitStore.listSituationEventsForIds([...padding, ...real]);
      for (const id of real) {
        expect(batched.get(id) ?? []).toEqual(sitStore.listSituationEvents(id));
      }
    });
  });

  describe("sql accounting", () => {
    it("counts statements and attributes nothing outside its window", () => {
      const before = accountedStatements(() => {
        db.prepare("SELECT 1").get();
      });
      expect(before).toBe(2); // one prepare, one get

      // Outside a window nothing is counted, and the next window starts clean.
      db.prepare("SELECT 2").get();
      const after = accountedStatements(() => {
        db.prepare("SELECT 3").get();
      });
      expect(after).toBe(2);
    });

    it("formats the request-log suffix and omits it when not accounted", () => {
      expect(accounting.formatSqlUsage({ statements: 154, ms: 338.42 })).toBe(" sql=154/338.4ms");
      expect(accounting.formatSqlUsage(null)).toBe("");
      // A usage that came from somewhere else than this process's own window
      // says so, so a `sql=` number can never be mistaken for main-thread time.
      expect(accounting.formatSqlUsage({ statements: 130, ms: 22669, origin: "worker" }))
        .toBe(" sql=130/22669.0ms,worker");
    });

    it("accounts exactly the audited request paths", () => {
      for (const route of [
        "/api/v2/situations", "/api/v2/signals", "/api/v2/games",
        "/api/stats/track-record", "/api/signals", "/api/signal",
        "/api/sources", "/api/leaderboard",
      ]) {
        expect(accounting.ACCOUNTED_PATHS.has(route)).toBe(true);
      }
      // Admin and replay families must not be in it: they are async handlers,
      // where a single global counter could attribute another request's work.
      expect(accounting.ACCOUNTED_PATHS.has("/api/pipeline/ingest/run")).toBe(false);
      expect(accounting.ACCOUNTED_PATHS.has("/api/v2/signals/abc")).toBe(false);
    });
  });

  /**
   * Per-statement instrumentation (the half of the Oct 7 question a count cannot
   * answer: prod runs 130 statements in 22,669ms, so WHICH of the 130).
   */
  describe("sql accounting — per-statement timing", () => {
    /** The slowest-statement list for `work`, closed in a finally like above. */
    function slowestFor(work: () => void, route = "GET /test") {
      const finish = accounting.beginSqlAccounting(route);
      try {
        work();
        return finish().slowest ?? [];
      } finally {
        finish();
      }
    }

    /** A statement that burns ~`ms` of real SQLite time, with no I/O. */
    const burnSql = (rows: number) =>
      `WITH RECURSIVE burn(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM burn WHERE i < ${rows}) ` +
      `SELECT count(*) AS c FROM burn`;

    it("ranks the slowest statements of a window, slowest first", () => {
      const slowest = slowestFor(() => {
        db.prepare("SELECT 1").get();
        db.prepare(burnSql(400_000)).get();
        db.prepare("SELECT 2").get();
        db.prepare(burnSql(1_200_000)).get();
        db.prepare("SELECT 3").get();
      });

      expect(slowest.length).toBe(3);
      // Monotonically non-increasing, and the two burners are the top two.
      expect(slowest[0].ms).toBeGreaterThanOrEqual(slowest[1].ms);
      expect(slowest[1].ms).toBeGreaterThanOrEqual(slowest[2].ms);
      expect(slowest[0].sql).toContain("RECURSIVE burn");
      expect(slowest[1].sql).toContain("RECURSIVE burn");
      // The bigger burn is slower than the smaller one. This is a 3x ratio on
      // pure CPU in-memory work, which is the one timing comparison in this
      // suite that is safe to assert on any machine.
      expect(slowest[0].ms).toBeGreaterThan(slowest[1].ms);

      console.log(
        `[measured] top sql line: ${accounting.formatSlowestStatements({ statements: 5, ms: 0, slowest })}`,
      );
    });

    it("records SQL text only — never a bound parameter value", () => {
      const secret = "pk_live_do_not_log_me";
      const slowest = slowestFor(() => {
        db.prepare("SELECT ? AS leaked").get(secret);
      });
      const text = JSON.stringify(slowest);
      expect(text).toContain("SELECT ? AS leaked");
      expect(text).not.toContain(secret);
    });

    it("collapses whitespace and truncates, including a 4KB DDL script", () => {
      // ensureSituationSchema runs its whole CREATE TABLE script through exec on
      // every situations-store call, so this is the statement most likely to turn
      // up in a prod top-3 line. It must still be readable there.
      const slowest = slowestFor(() => {
        sitStore.ensureSituationSchema(db);
      });
      const ddl = slowest.find((s) => s.sql.includes("CREATE TABLE"));
      expect(ddl).toBeDefined();
      expect(ddl!.sql.length).toBeLessThanOrEqual(60);
      expect(ddl!.sql).not.toMatch(/\s\s/);
      expect(ddl!.sql).not.toContain("\n");
    });

    it("truncation never walks the whole SQL string", () => {
      // A pathological 400KB statement: the hook must not spend milliseconds
      // collapsing it to produce 60 characters. Bounded by the leading slice in
      // collapse(), so the cost is flat in the length of the SQL.
      const padded = `SELECT 1 AS x${" ".repeat(400_000)}`;
      const started = process.hrtime.bigint();
      const slowest = slowestFor(() => {
        db.prepare(padded).get();
      });
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
      expect(slowest[0].sql.startsWith("SELECT 1 AS x")).toBe(true);
      console.log(`[measured] 400KB-statement window: ${elapsedMs.toFixed(2)}ms`);
      expect(elapsedMs).toBeLessThan(50);
    });

    /**
     * HOOK OVERHEAD, measured rather than asserted-about.
     *
     * The comparison is the same N trivial statements with the window closed
     * (the ingestion path's cost: one boolean test and an apply) and open (that
     * plus an hrtime pair, two adds and two compares). Both run against
     * `SELECT 1` so the measurement is almost entirely hook, not SQLite — which
     * is the worst case for the hook's relative cost, and the number worth
     * knowing.
     *
     * The assertion is a ceiling loose enough to pass on CI, because the point of
     * the test is the printed number; the ceiling only catches a regression that
     * puts string work back on the fast path (resolving Statement.source per
     * statement, which an earlier draft did, costs ~10x this).
     */
    it("costs single-digit microseconds per statement", () => {
      const N = 20_000;
      const statement = db.prepare("SELECT 1 AS x");

      const timed = (label: string, open: boolean) => {
        const finish = open ? accounting.beginSqlAccounting(`GET /overhead/${label}`) : null;
        const started = process.hrtime.bigint();
        for (let i = 0; i < N; i++) statement.get();
        const ns = Number(process.hrtime.bigint() - started);
        finish?.();
        return ns / N;
      };

      // Warm both paths so JIT compilation is not charged to whichever ran first.
      timed("warm-closed", false);
      timed("warm-open", true);

      const closedNs = timed("closed", false);
      const openNs = timed("open", true);
      const overheadNs = openNs - closedNs;

      console.log(
        `[measured] sql-accounting overhead per statement: ` +
        `window closed ${closedNs.toFixed(0)}ns, open ${openNs.toFixed(0)}ns, ` +
        `delta ${overheadNs.toFixed(0)}ns (${(overheadNs / 1000).toFixed(2)}µs) over ${N} statements`,
      );

      expect(overheadNs).toBeLessThan(10_000); // 10µs/statement ceiling
    });

    it("costs less than this measurement can resolve on a real situations build", () => {
      // The hook's share of a whole situations build, on the request path rather
      // than on SELECT 1 — and an honest statement of what the measurement can
      // and cannot see.
      //
      // Arms are INTERLEAVED (closed, open, closed, open, …). Running one arm's
      // runs and then the other's charges whatever the machine did in between to
      // whichever arm went second, and an earlier draft of this test measured
      // exactly that: it reported +14.1% on one run and -10.1% on the next, from
      // the same code. Interleaving plus min-of-N removes the ordering, and the
      // closed arm's own spread gives the noise floor the result is read against.
      const query = { league: "NFL", limit: 100 } as const;
      const PAIRS = 9;

      const once = (open: boolean) => {
        const finish = open ? accounting.beginSqlAccounting("GET /api/v2/situations") : null;
        const started = process.hrtime.bigint();
        sitApi.listCanonicalSituationApiResponses(query);
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        return { ms, usage: finish?.() };
      };

      // Warm the build caches and let both call sites JIT before measuring.
      for (let i = 0; i < 3; i++) { once(false); once(true); }

      const closedMs: number[] = [];
      const openMs: number[] = [];
      let statements = 0;
      let sqlMs = 0;
      for (let i = 0; i < PAIRS; i++) {
        closedMs.push(once(false).ms);
        const open = once(true);
        openMs.push(open.ms);
        statements = open.usage?.statements ?? statements;
        sqlMs = open.usage?.ms ?? sqlMs;
      }

      const min = (xs: number[]) => Math.min(...xs);
      const closed = min(closedMs);
      const opened = min(openMs);
      const delta = opened - closed;
      /** What a run-to-run difference costs with nothing changed at all. */
      const noiseFloorMs = Math.max(...closedMs) - closed;
      /** What the per-statement number predicts for this many statements. */
      const predictedMs = (statements * 511) / 1e6; // 511ns/statement, measured above

      console.log(
        `[measured] situations build, ${PAIRS} interleaved pairs, min of each arm: ` +
        `${closed.toFixed(1)}ms unaccounted vs ${opened.toFixed(1)}ms accounted over ` +
        `${statements} statements (sql ${sqlMs.toFixed(1)}ms) — delta ${delta.toFixed(2)}ms, ` +
        `noise floor ${noiseFloorMs.toFixed(2)}ms, predicted from per-statement cost ` +
        `${predictedMs.toFixed(3)}ms`,
      );

      expect(statements).toBeGreaterThan(0);
      // The claim this suite can actually keep: the hook is not resolvable above
      // the noise of running the same build twice. The per-statement test above
      // is what bounds the cost itself (511ns x 76 statements = 0.04ms here);
      // this one exists so a regression that made the hook cost MILLISECONDS per
      // build — re-reading Statement.source for every statement, re-collapsing a
      // 4KB DDL script 15 times — would fail instead of hiding in the noise.
      expect(Math.abs(delta)).toBeLessThan(noiseFloorMs + 2);
    });
  });
});
