import { describe, expect, it, beforeAll } from "vitest";
import type BetterSqlite3 from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * The situation_events founding partial index, pinned.
 *
 * WHAT IT FIXES. `getCleanFoundingSituationConfidences` is the statement prod
 * reported in flight at >25s and >29s when two warm-up builds were killed on the
 * Oct 8 05:20 boot. 97% of it is one correlated subquery:
 *
 *     SELECT COUNT(*) FROM situation_events se
 *     WHERE se.situation_id = s.situation_id AND se.kind = 'situation_created'
 *
 * `idx_situation_events_situation` is `(situation_id, recorded_at, event_id)`
 * and carries no `kind`, so that COUNT seeks to the situation and then fetches
 * every one of its ~97 event rows to test `kind` — 688,700 fat-row fetches to
 * produce 7,100 integers, over the `payload_json` column that is 56% of this
 * database. A partial index on the predicate holds only the 7,100 founding
 * rows: 124 KiB, and 15,076ms -> 164ms (92x) on a prod-row-count fixture.
 *
 * WHAT THIS SUITE ASSERTS, and why each part is here:
 *
 *   - THE PLAN, for the statement as the worker actually prepares it. Not for a
 *     hand-written approximation: the test reads the subquery's plan out of the
 *     real exported function's SQL, so a rewrite that loses the index fails here.
 *
 *   - THAT THE PREDICATE IS A LITERAL, and what that does and does not buy.
 *     Measured: SQLite plans partial-index eligibility from the bound VALUE and
 *     re-plans when it changes, so `kind = ?` bound to 'situation_created' does
 *     get this index while 'situation_matched' falls back — both correct. A
 *     bound parameter is therefore conditional, not wrong. The literal makes
 *     the plan independent of the caller's argument, which is the property
 *     worth pinning on a statement whose fallback is 15 seconds.
 *
 *   - THAT ensureSituationSchema DOES NOT CREATE IT. This is the whole placement
 *     argument. If someone moves the DDL into that function, the build lands on
 *     the main thread ~45s after listen inside the boot ingestion cycle, which
 *     is a health-check kill. This test fails if that happens.
 *
 *   - EQUALITY. The index changes the plan, never the rows: the full statement's
 *     output is compared as a multiset with the index present and absent.
 *
 *   - INSERT OVERHEAD on the ingestion hot path. Only `situation_created` rows
 *     enter the index; `situation_matched` is 99% of writes and must not pay for
 *     it. Asserted as a ratio with a wide margin, so it catches the index being
 *     redefined without the WHERE clause, not a slow CI box.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-founding-idx-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;
process.env.DATA_DIR = TMP_DIR;

let store: typeof import("../store");
let sit: typeof import("../situations-store");
let db: BetterSqlite3.Database;

const IDX = "idx_situation_events_founding";

/**
 * Prod's shape at a twentieth of its size. The ratio is what matters, not the
 * absolute count: 1 founding row per situation against ~97 matched rows is the
 * ESPN-churn shape that made the COUNT expensive, and the fat `payload_json` is
 * what the non-indexed plan has to read to find the `kind` column.
 */
const N_SITUATIONS = 350;
const MATCHED_PER_SITUATION = 97;
const PAYLOAD = JSON.stringify({ pad: "x".repeat(400) });
const LEAGUES = ["NFL", "NBA", "MLB", "CFB"];
const TYPES = ["injury", "roster", "line_move"];
const iso = (m: number) => new Date(Date.UTC(2026, 0, 1) + m * 60_000).toISOString();

beforeAll(async () => {
  store = await import("../store");
  sit = await import("../situations-store");
  db = store.getPipelineDb();
  sit.ensureSituationSchema(db);
  seed(db);
});

function seed(target: BetterSqlite3.Database): void {
  const situation = target.prepare(`
    INSERT INTO situations
      (situation_id, canonical_hash, sport, league, game_id, teams_json,
       players_json, situation_type, semantic_fingerprint, created_from_event_id, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
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
  target.transaction(() => {
    for (let i = 0; i < N_SITUATIONS; i++) {
      const id = `sit_${i}`;
      situation.run(id, `ch_${i}`, "football", LEAGUES[i % LEAGUES.length], `g${i % 50}`,
        JSON.stringify([`T${i % 30}`]), JSON.stringify([`P${i}`]),
        TYPES[i % TYPES.length], `fp_${i}`, `ev_${i}_0`, iso(i));
      // Exactly one founding row per situation: this is the "clean" cohort.
      event.run(`ev_${i}_0`, id, "situation_created", null, null, "src",
        iso(i), iso(i), `rh_${i}_0`, `lh_${i}_0`, PAYLOAD);
      for (let j = 1; j <= MATCHED_PER_SITUATION; j++) {
        event.run(`ev_${i}_${j}`, id, "situation_matched", null, null, "src",
          iso(i + j), iso(i + j), `rh_${i}_${j}`, `lh_${i}_${j}`, PAYLOAD);
      }
      // Two snapshots, so the latest-snapshot subquery has an order to resolve.
      for (let k = 0; k < 2; k++) {
        snapshot.run(`sn_${i}_${k}`, id, "active", 40 + (i % 50) + k,
          JSON.stringify({ score: 40 + (i % 50) + k }), `summary ${i}`,
          10 + (i % 20), "normal", "[]", `srh_${i}_${k}`, null, iso(i * 10 + k));
      }
    }
  })();
}

/** The `kind`-filtered COUNT subquery, lifted verbatim out of the shipped SQL. */
function foundingCountSubquery(): string {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "situations-store.ts"), "utf-8");
  const m = src.match(
    /SELECT\s+COUNT\(\*\)\s+FROM situation_events se\s+WHERE se\.situation_id = s\.situation_id\s+AND se\.kind = '[a-z_]+'/);
  if (!m) throw new Error("founding COUNT subquery not found in situations-store.ts");
  // Re-root it at a literal id so it can be prepared standalone.
  return m[0].replace("s.situation_id", "?");
}

const planOf = (sql: string, params: unknown[] = []): string =>
  (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...(params as any[])) as any[])
    .map((r) => r.detail).join(" | ");

const ms = (f: () => unknown): number => {
  const t = process.hrtime.bigint();
  f();
  return Number(process.hrtime.bigint() - t) / 1e6;
};
const best = (n: number, f: () => unknown): number => {
  let b = Infinity;
  for (let i = 0; i < n; i++) b = Math.min(b, ms(f));
  return b;
};

const indexExists = (): boolean =>
  db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name=?").get(IDX) != null;

describe("situation_events founding index", () => {
  it("seeds a prod-shaped fixture: one founding row per situation, many matched", () => {
    const kinds = db.prepare(
      "SELECT kind, COUNT(*) c FROM situation_events GROUP BY kind").all() as any[];
    const byKind = new Map(kinds.map((k: any) => [k.kind, k.c]));
    expect(byKind.get("situation_created")).toBe(N_SITUATIONS);
    expect(byKind.get("situation_matched")).toBe(N_SITUATIONS * MATCHED_PER_SITUATION);
    // The ratio is the defect: 1 useful row per ~98 read without the index.
    expect(byKind.get("situation_matched")! / byKind.get("situation_created")!)
      .toBeGreaterThan(50);
  });

  it("does NOT create the index from ensureSituationSchema", () => {
    // The placement argument, as a test. ensureSituationSchema is lazy and its
    // first call on a fresh prod database would be on the main thread ~45s
    // after listen, inside the boot ingestion cycle. If the DDL migrates into
    // that function, this fails.
    db.exec(`DROP INDEX IF EXISTS ${IDX}`);
    sit.ensureSituationSchema(db);
    expect(indexExists()).toBe(false);
  });

  it("creates the index from ensureSituationFoundingIndex, idempotently", () => {
    db.exec(`DROP INDEX IF EXISTS ${IDX}`);
    sit.ensureSituationFoundingIndex(db);
    expect(indexExists()).toBe(true);
    // IF NOT EXISTS: the pre-listen boot path calls this on every boot, and
    // every boot after the first must be a catalog no-op, not a rebuild.
    expect(() => sit.ensureSituationFoundingIndex(db)).not.toThrow();
    expect(indexExists()).toBe(true);
  });

  it("is a partial index on the founding predicate, not a full one", () => {
    sit.ensureSituationFoundingIndex(db);
    const sql = (db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='index' AND name=?").get(IDX) as any).sql as string;
    expect(sql).toMatch(/WHERE\s+kind\s*=\s*'situation_created'/);
    // Only the founding rows are in it. Without the WHERE this would be 350x
    // larger and would charge every ingestion write.
    const entries = db.prepare(
      `SELECT COUNT(*) c FROM situation_events INDEXED BY ${IDX} WHERE kind = 'situation_created'`)
      .get() as any;
    expect(entries.c).toBe(N_SITUATIONS);
  });

  it("serves the shipped COUNT subquery from the index, as a covering search", () => {
    sit.ensureSituationFoundingIndex(db);
    const plan = planOf(foundingCountSubquery(), ["sit_1"]);
    expect(plan).toContain(IDX);
    expect(plan).toContain("COVERING INDEX");
  });

  it("falls off that plan without the index, which is why it is a hard dependency", () => {
    db.exec(`DROP INDEX IF EXISTS ${IDX}`);
    const plan = planOf(foundingCountSubquery(), ["sit_1"]);
    expect(plan).not.toContain(IDX);
    expect(plan).toContain("idx_situation_events_situation");
    sit.ensureSituationFoundingIndex(db);
  });

  it("plans the partial index per bound value, which is why the predicate is a literal", () => {
    sit.ensureSituationFoundingIndex(db);
    const literal = "SELECT COUNT(*) c FROM situation_events se WHERE se.situation_id = ? AND se.kind = 'situation_created'";
    const bound = "SELECT COUNT(*) c FROM situation_events se WHERE se.situation_id = ? AND se.kind = ?";

    // The literal form is planned once, onto the partial index, for every call.
    expect(planOf(literal, ["sit_1"])).toContain(IDX);

    // The bound form is planned from the VALUE. Both forms return the right
    // answer -- SQLite does not use the partial index where it would be wrong --
    // but the cost swings with the argument, which is the thing a literal
    // removes. This asserts correctness and records the asymmetry.
    const created = db.prepare(bound).get("sit_1", "situation_created") as any;
    const matched = db.prepare(bound).get("sit_1", "situation_matched") as any;
    expect(created.c).toBe(1);
    expect(matched.c).toBe(MATCHED_PER_SITUATION);
    const litAnswer = db.prepare(literal).get("sit_1") as any;
    expect(litAnswer.c).toBe(created.c);
  });

  it("returns an identical multiset with and without the index", () => {
    const key = (r: { league: string; situation_type: string; confidence_score: number }) =>
      `${r.league}|${r.situation_type}|${r.confidence_score}`;
    sit.ensureSituationFoundingIndex(db);
    const withIdx = sit.getCleanFoundingSituationConfidences(db).map(key).sort();
    db.exec(`DROP INDEX IF EXISTS ${IDX}`);
    const without = sit.getCleanFoundingSituationConfidences(db).map(key).sort();
    sit.ensureSituationFoundingIndex(db);

    expect(withIdx.length).toBeGreaterThan(0);
    expect(withIdx).toEqual(without);
    // Every situation here has exactly one founding row and no audit row, so
    // the whole cohort should come back -- if it does not, the fixture is wrong
    // and the equality above is comparing two empty lists.
    expect(withIdx.length).toBe(N_SITUATIONS);
  });

  it("reads the founding cohort faster with the index than without", () => {
    sit.ensureSituationFoundingIndex(db);
    const withIdx = best(3, () => sit.getCleanFoundingSituationConfidences(db));
    db.exec(`DROP INDEX IF EXISTS ${IDX}`);
    const without = best(3, () => sit.getCleanFoundingSituationConfidences(db));
    sit.ensureSituationFoundingIndex(db);
    // 92x on the prod-row-count fixture; this fixture is a twentieth of it, so
    // the margin is asserted loosely. It catches the plan collapsing, which is
    // what it is for, not a slow CI box.
    expect(withIdx).toBeLessThan(without);
  });

  it("does not charge the ingestion hot path for founding-row maintenance", () => {
    const insSql = `
      INSERT INTO situation_events
        (event_id, situation_id, kind, raw_event_id, normalized_event_id, source_id,
         observed_at, recorded_at, replay_hash, lineage_hash, payload_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`;
    const N = 400;
    // Rolled back, because situation_events carries append-only guards: a
    // DELETE of the probe rows throws, so the transaction is the only cleanup.
    const insert = (kind: string, tag: string): number => {
      const stmt = db.prepare(insSql);
      let el = 0;
      try {
        db.transaction(() => {
          el = ms(() => {
            for (let i = 0; i < N; i++) {
              stmt.run(`p_${tag}_${i}`, `sit_${i % N_SITUATIONS}`, kind, null, null, "src",
                iso(i), iso(i), `prh_${tag}_${i}`, `plh_${tag}_${i}`, PAYLOAD);
            }
          });
          throw new Error("rollback");
        })();
      } catch (e: any) { if (e.message !== "rollback") throw e; }
      return el;
    };
    sit.ensureSituationFoundingIndex(db);
    const matched = Math.min(insert("situation_matched", "m1"), insert("situation_matched", "m2"));
    db.exec(`DROP INDEX IF EXISTS ${IDX}`);
    const baseline = Math.min(insert("situation_matched", "b1"), insert("situation_matched", "b2"));
    sit.ensureSituationFoundingIndex(db);

    expect(matched).toBeGreaterThan(0);
    expect(baseline).toBeGreaterThan(0);
    // situation_matched rows do not satisfy the index predicate, so they never
    // enter the index. A generous ceiling: this is here to catch the WHERE
    // clause being dropped from the DDL, which would make every one of these
    // writes an index insert.
    expect(matched).toBeLessThan(baseline * 4);
  });
});
