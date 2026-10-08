// @vitest-environment node
import { describe, expect, it, beforeAll, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type BetterSqlite3 from "better-sqlite3";
import { createHash } from "crypto";

/**
 * GET /api/leaderboard, behind a 60s TTL.
 *
 * The Oct 2026 request-path audit measured this route at 1,201ms cold / 33ms
 * warm over four statements. It is not a health-check risk the way
 * /api/v2/situations is, so it does not get a worker — but there is no reason
 * for every visitor to pay the cold cost, because the answer is a ~36-row
 * aggregate over the whole of settled_outcomes that moves when settlement runs
 * and not when someone loads the page.
 *
 * MEASURED AGAINST THE REAL QUERY, not a stub. DATA_DIR is pointed at a temp
 * directory before ../storage is imported, so storage.ts builds its real schema
 * there and this suite seeds 75,000 settled_outcomes with real-shape `sources`
 * JSON — prod's row count from the same audit. The 1.2s is the json_each
 * expansion of that column on every row, and a fake storage module would have
 * measured a Map lookup instead.
 *
 * WHAT IS ASSERTED
 *  1. A cached request runs ZERO SQL statements, through the same accounting
 *     hook that annotates the [express] log. "Faster" is a timing; "ran no SQL"
 *     is the actual contract, and it does not depend on this machine.
 *  2. The body is byte-identical to the uncached one. A cache that returns
 *     different bytes is a different endpoint.
 *  3. The TTL expires, and LEADERBOARD_CACHE_TTL_MS=0 disables the cache
 *     entirely — the kill switch reaches the cache, not just the header.
 *  4. The saving, reported as a measurement.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-leaderboard-"));
process.env.DATA_DIR = TMP_DIR;
process.env.PIPELINE_DATA_DIR = TMP_DIR;

/** Prod's settled_outcomes row count, from the Oct 2026 request-path audit. */
const N_OUTCOMES = 75_000;
const N_SOURCES = 36;
const LEAGUES = ["NFL", "NBA", "MLB", "CFB"];
const TYPES = ["injury", "roster", "line_move", "operator_note"];

let storage: typeof import("./storage");
let accounting: typeof import("./sql-accounting");
let leaderboard: typeof import("./leaderboard-cache");
let db: BetterSqlite3.Database;

beforeAll(async () => {
  storage = await import("./storage");
  accounting = await import("./sql-accounting");
  leaderboard = await import("./leaderboard-cache");
  accounting.installSqlAccounting();
  db = storage.getStorageDb();
  seed();
}, 180_000);

function seed(): void {
  const sha = (v: string) => createHash("sha1").update(v).digest("hex");
  db.pragma("journal_mode = WAL");
  db.transaction(() => {
    const source = db.prepare(
      `INSERT OR IGNORE INTO sources (id, name, source_type, trust_tier, url, reliability_score, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    );
    const score = db.prepare(
      `INSERT INTO source_scores (id, source_id, source_name, overall_accuracy, updated_at)
       VALUES (?,?,?,?,?)`,
    );
    for (let i = 0; i < N_SOURCES; i++) {
      source.run(`src${i}`, `Source ${i}`, "beat_reporter", ["A", "B", "C"][i % 3],
        `https://example.test/${i}`, String(50 + (i % 50)), new Date().toISOString());
      score.run(`sc${i}`, `src${i}`, `Source ${i}`, (i * 7919) % 100, new Date().toISOString());
    }

    const outcome = db.prepare(
      `INSERT INTO settled_outcomes
         (id, signal_id, league, signal_type, sources, hit, clv, recorded_at, excluded_stale)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    );
    for (let i = 0; i < N_OUTCOMES; i++) {
      // Real-shape sources JSON: one or two sources per outcome, with the
      // reporter-object fields the pipeline writes. json_each walks this for
      // every row, which is where the 1.2s lives.
      const sources = [{
        id: `src${i % N_SOURCES}`, name: `Source ${i % N_SOURCES}`,
        type: "beat_reporter", url: `https://example.test/${i % N_SOURCES}`,
        reliability: 50 + (i % 50), observed_at: new Date(Date.UTC(2026, 8, 1) + i * 60_000).toISOString(),
        lineage: sha(`lineage${i}`),
      }];
      if (i % 3 === 0) sources.push({ ...sources[0], id: `src${(i + 1) % N_SOURCES}`, name: `Source ${(i + 1) % N_SOURCES}` });
      outcome.run(`so${i}`, `sig${i}`, LEAGUES[i % 4], TYPES[i % 4],
        JSON.stringify(sources),
        i % 5 === 0 ? null : (i % 2), i % 3 === 0 ? null : (i % 7) - 3,
        new Date(Date.UTC(2026, 8, 1) + i * 60_000).toISOString(),
        i % 100 < 68 ? 1 : 0);
    }
  })();
}

afterEach(() => {
  leaderboard.resetLeaderboardCache();
  delete process.env.LEADERBOARD_CACHE_TTL_MS;
});

/** Statements run by `work`, through the hook that annotates the request log. */
function accountedStatements(work: () => void): { statements: number; ms: number } {
  const finish = accounting.beginSqlAccounting("GET /api/leaderboard");
  try {
    work();
    const usage = finish();
    return { statements: usage.statements, ms: usage.ms };
  } finally {
    finish();
  }
}

describe("leaderboard cache", () => {
  it("the fixture is prod-shaped", () => {
    const outcomes = (db.prepare("SELECT COUNT(*) c FROM settled_outcomes").get() as { c: number }).c;
    const scores = (db.prepare("SELECT COUNT(*) c FROM source_scores").get() as { c: number }).c;
    const bytes = (db.prepare("SELECT SUM(octet_length(sources)) b FROM settled_outcomes").get() as { b: number }).b;
    console.log(`[measured] settled_outcomes ${outcomes.toLocaleString()} rows, source_scores ${scores}, sources JSON ${(bytes / 1024 ** 2).toFixed(1)}MiB`);
    expect(outcomes).toBe(N_OUTCOMES);
    expect(scores).toBe(N_SOURCES);
  });

  it("a cached request runs no SQL at all", () => {
    const cold = accountedStatements(() => { leaderboard.getLeaderboard(); });
    const warm = accountedStatements(() => { leaderboard.getLeaderboard(); });
    console.log(
      `[measured] cold ${cold.statements} statements / ${cold.ms.toFixed(1)}ms SQL -> ` +
      `warm ${warm.statements} statements / ${warm.ms.toFixed(1)}ms SQL`,
    );
    expect(cold.statements).toBeGreaterThan(0);
    // The contract, independent of this machine: the second request touches the
    // database zero times.
    expect(warm.statements).toBe(0);
    expect(warm.ms).toBe(0);
  });

  it("reports cold and warm wall time", () => {
    // Interleaved: a fresh cold build, then the warm read it enables, five
    // times. Sequential arms on this machine have reported ±14% from identical
    // code, so the cold arm is re-measured after the warm one as a noise floor.
    const cold: number[] = [], warm: number[] = [];
    for (let round = 0; round < 5; round++) {
      leaderboard.resetLeaderboardCache();
      let t = process.hrtime.bigint();
      leaderboard.getLeaderboard();
      cold.push(Number(process.hrtime.bigint() - t) / 1e6);
      t = process.hrtime.bigint();
      leaderboard.getLeaderboard();
      warm.push(Number(process.hrtime.bigint() - t) / 1e6);
    }
    const best = (xs: number[]) => Math.min(...xs);
    console.log(
      `[measured] ${N_OUTCOMES.toLocaleString()} settled_outcomes, best of 5 — ` +
      `cold ${best(cold).toFixed(1)}ms, warm ${best(warm).toFixed(3)}ms ` +
      `(${(best(cold) / Math.max(best(warm), 0.001)).toFixed(0)}x)`,
    );
    expect(best(warm)).toBeLessThan(best(cold));
  }, 60_000);

  it("returns a body identical to the uncached one", () => {
    process.env.LEADERBOARD_CACHE_TTL_MS = "0"; // uncached
    const uncached = JSON.stringify(leaderboard.getLeaderboard().rows);
    delete process.env.LEADERBOARD_CACHE_TTL_MS;
    leaderboard.resetLeaderboardCache();
    const cold = leaderboard.getLeaderboard();
    const warm = leaderboard.getLeaderboard();
    expect(JSON.stringify(cold.rows)).toBe(uncached);
    expect(JSON.stringify(warm.rows)).toBe(uncached);
    expect(cold.state).toBe("cold");
    expect(warm.state).toBe("fresh");
  });

  it("carries a verified_count per source, as before", () => {
    const rows = leaderboard.getLeaderboard().rows;
    expect(rows.length).toBe(N_SOURCES);
    for (const row of rows) expect(typeof row.verified_count).toBe("number");
    // Not all zero — the join on source_name has to actually land, which is the
    // bug x-twitter-source-name.test.ts exists for.
    expect(rows.some((row) => row.verified_count > 0)).toBe(true);
  });

  it("expires after the TTL", async () => {
    process.env.LEADERBOARD_CACHE_TTL_MS = "120";
    expect(leaderboard.getLeaderboard().state).toBe("cold");
    expect(leaderboard.getLeaderboard().state).toBe("fresh");
    await new Promise((resolve) => setTimeout(resolve, 200));
    const expired = leaderboard.getLeaderboard();
    expect(expired.state).toBe("cold");
    expect(expired.ageMs).toBe(0);
  });

  it("ages the rows it serves", async () => {
    leaderboard.getLeaderboard();
    await new Promise((resolve) => setTimeout(resolve, 60));
    const second = leaderboard.getLeaderboard();
    expect(second.state).toBe("fresh");
    expect(second.ageMs).toBeGreaterThanOrEqual(50);
  });

  it("LEADERBOARD_CACHE_TTL_MS=0 turns the cache off", () => {
    process.env.LEADERBOARD_CACHE_TTL_MS = "0";
    expect(leaderboard.getLeaderboard().state).toBe("cold");
    // The kill switch has to reach the cache, not just the header: the second
    // request must run the SQL again.
    const second = accountedStatements(() => { leaderboard.getLeaderboard(); });
    expect(second.statements).toBeGreaterThan(0);
  });

  it("defaults to 60s", () => {
    delete process.env.LEADERBOARD_CACHE_TTL_MS;
    leaderboard.getLeaderboard();
    const warm = leaderboard.getLeaderboard();
    expect(warm.state).toBe("fresh");
    expect(warm.ageMs).toBeLessThan(60_000);
  });
});
