/**
 * Edge Setter — one-shot DB shape report, logged shortly after boot.
 *
 * WHY: GET /api/v2/situations runs 130 statements on prod and took 22,669ms
 * (Oct 7 02:19 UTC); the same 154-statement shape on the audit fixture takes
 * 390ms. Nothing in the request log distinguishes "the plans are wrong" from
 * "this file is 40x bigger than the fixture and every page is a cold disk read".
 * The per-statement timing in sql-accounting.ts says WHICH statement; this says
 * WHAT IT IS READING. Both are needed to read a prod request log, and this half
 * is the same every boot, so it is logged once.
 *
 * WHAT IS CHEAP AND WHAT IS NOT
 *   page_count, page_size, freelist_count, journal_mode: header pragmas. O(1),
 *     no table pages touched.
 *   COUNT(*): a full scan of the table (or of its smallest index). On
 *     situation_events — the table the Oct 2026 churn grew past 1GB — that is
 *     exactly the kind of unbounded read that has twice got this instance killed
 *     by a 5s health check. It is NOT run here, before listen or after.
 *   MAX(rowid): O(log n). SQLite answers it from the rightmost entry of the
 *     rowid B-tree, reading one page per level. This is the method used.
 *
 * MAX(rowid) IS AN UPPER BOUND, NOT A COUNT. It is the highest SURVIVING rowid.
 * Rowids are distinct positive integers, so it is always >= the row count and
 * never below it — that is the guarantee, and it is the only one. It is NOT the
 * number of rows ever inserted: these tables have a TEXT PRIMARY KEY and no
 * AUTOINCREMENT, so a rowid is max(rowid)+1 at insert and deleting the newest
 * rows takes MAX(rowid) down with them. It reads high when rows are deleted from
 * the middle, which is what the retroactive situation_events cleanup (#74-#77)
 * will do. For the situation tables it happens to be exact, because their
 * append-only triggers reject DELETE outright. Every line is labelled an estimate
 * because the reader cannot be expected to track which case a table is in.
 *
 * For the question this exists to answer — is this file 10x or 1000x the fixture
 * — an upper bound is enough, and a COUNT that blocks the loop for ten seconds is
 * not an acceptable price for the difference.
 *
 * sqlite_stat1 WOULD BE FREE AND EXACT-ISH, AND IT IS NOT THERE. Nothing in this
 * repo runs ANALYZE, so the table does not exist (that is also why the planner
 * works from built-in estimates, which is what makes the fixture's EXPLAIN plans
 * prod's plans). It is probed for anyway and reported either way, because its
 * absence is itself the thing to know when reading a plan regression.
 *
 * SCHEDULING: deferred by DB_DIAGNOSTICS_DELAY_MS after listen (default 8s, so
 * the first health check is already answered), and it yields the loop between
 * tables. Ten O(log n) probes is not a lot of work, but "not a lot of work"
 * read from a cold 1.4GB file on Render is how the Oct 5 spans happened, so it
 * is bounded like everything else on the boot ladder. DB_DIAGNOSTICS=0 skips it.
 */
import fs from "fs";
import type BetterSqlite3 from "better-sqlite3";
import { getPipelineDb } from "./pipeline/store";
import { getStorageDb } from "./storage";
import { yieldToLoop } from "./event-loop-monitor";

/**
 * Exactly the tables the GET /api/v2/situations build reads, which is the
 * endpoint this report exists for. Derived from the FROM/JOIN clauses in
 * situations-store.ts, situations-api.ts, situations-comparable-corpus.ts and
 * situations-confidence-guard.ts — not "every table in the DB".
 *
 * `live_signals` is deliberately absent: it is the biggest table in the file but
 * the situations path stopped reading it in #80, and listing it here would
 * invite the next reader to blame it again.
 */
export const SITUATIONS_READ_TABLES = [
  "situations",
  "situation_snapshots",
  "situation_events",
  "situation_state_history",
  "situation_confidence_history",
  "situation_founding_audit",
  "situation_public_confirmations",
  "situation_game_resolution",
  "outcomes",
  "games",
] as const;

export interface DbFileShape {
  readonly label: string;
  readonly path: string;
  readonly journalMode: string;
  readonly pageSize: number;
  readonly pageCount: number;
  /** page_count * page_size — the logical size SQLite sees. */
  readonly bytes: number;
  readonly freelistPages: number;
  /** -wal sidecar size on disk, or 0 when there is none. */
  readonly walBytes: number;
}

export interface RowEstimate {
  readonly table: string;
  /** MAX(rowid), or null when the table is absent. Never a COUNT. */
  readonly estimatedRows: number | null;
}

function pragmaNumber(db: BetterSqlite3.Database, name: string): number {
  try {
    const value = db.pragma(name, { simple: true });
    return typeof value === "number" ? value : Number(value) || 0;
  } catch {
    return 0;
  }
}

function fileBytes(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

export function readDbFileShape(db: BetterSqlite3.Database, label: string): DbFileShape {
  let journalMode = "unknown";
  try {
    journalMode = String(db.pragma("journal_mode", { simple: true }));
  } catch { /* leave unknown */ }
  const pageSize = pragmaNumber(db, "page_size");
  const pageCount = pragmaNumber(db, "page_count");
  return {
    label,
    path: db.name,
    journalMode,
    pageSize,
    pageCount,
    bytes: pageSize * pageCount,
    freelistPages: pragmaNumber(db, "freelist_count"),
    walBytes: fileBytes(`${db.name}-wal`),
  };
}

/** True when ANALYZE has ever run against this file. */
export function hasSqliteStat1(db: BetterSqlite3.Database): boolean {
  try {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_stat1'")
      .get() as { name?: string } | undefined;
    return Boolean(row?.name);
  } catch {
    return false;
  }
}

/**
 * MAX(rowid) per table, yielding the loop between tables.
 *
 * Returns null for a table that does not exist yet — a fresh DB whose situation
 * schema has not been created is a normal boot state, not an error.
 */
export async function estimateRowCounts(
  db: BetterSqlite3.Database,
  tables: readonly string[] = SITUATIONS_READ_TABLES,
): Promise<RowEstimate[]> {
  const out: RowEstimate[] = [];
  for (const table of tables) {
    let estimatedRows: number | null = null;
    try {
      // Table names come from the frozen list above, never from input.
      const row = db.prepare(`SELECT MAX(rowid) AS m FROM ${table}`).get() as { m: number | null } | undefined;
      estimatedRows = row?.m ?? 0;
    } catch {
      estimatedRows = null; // table absent
    }
    out.push({ table, estimatedRows });
    await yieldToLoop();
  }
  return out;
}

function mb(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)}GB`;
  return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
}

export function formatDbFileShape(shape: DbFileShape): string {
  return (
    `[db-shape] ${shape.label} ${mb(shape.bytes)} ` +
    `(page_size=${shape.pageSize} page_count=${shape.pageCount} freelist=${shape.freelistPages}) ` +
    `journal_mode=${shape.journalMode} wal=${mb(shape.walBytes)} path=${shape.path}`
  );
}

export function formatRowEstimates(estimates: readonly RowEstimate[]): string {
  const body = estimates
    .map((e) => `${e.table}~${e.estimatedRows === null ? "absent" : e.estimatedRows}`)
    .join(" ");
  return `[db-shape] situations-read tables, ESTIMATED rows via MAX(rowid) (upper bound, not COUNT(*)): ${body}`;
}

/**
 * The whole report. Safe to call more than once; it holds no state and writes
 * nothing. Never throws — a boot must not fail because a diagnostic did.
 */
export async function logDbDiagnostics(): Promise<void> {
  try {
    const pipeline = getPipelineDb();
    console.log(formatDbFileShape(readDbFileShape(pipeline, "pipeline.db")));
    await yieldToLoop();
    try {
      console.log(formatDbFileShape(readDbFileShape(getStorageDb(), "edge_setter.db")));
    } catch (e: any) {
      console.log(`[db-shape] edge_setter.db unavailable: ${e?.message ?? e}`);
    }
    await yieldToLoop();
    console.log(
      `[db-shape] sqlite_stat1: ${hasSqliteStat1(pipeline) ? "present" : "absent (no ANALYZE has run — planner uses built-in estimates)"}`,
    );
    await yieldToLoop();
    console.log(formatRowEstimates(await estimateRowCounts(pipeline)));
  } catch (e: any) {
    console.warn(`[db-shape] report failed: ${e?.message ?? e}`);
  }
}

/** Schedule the report for after listen. DB_DIAGNOSTICS=0 disables it. */
export function scheduleDbDiagnostics(): void {
  if (process.env.DB_DIAGNOSTICS === "0") return;
  const raw = Number(process.env.DB_DIAGNOSTICS_DELAY_MS);
  const delay = Number.isFinite(raw) && raw >= 0 ? Math.min(600_000, Math.round(raw)) : 8_000;
  const timer = setTimeout(() => void logDbDiagnostics(), delay);
  timer.unref();
}
