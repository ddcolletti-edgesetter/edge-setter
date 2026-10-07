/**
 * Edge Setter — per-request SQL accounting
 *
 * Counts and times every better-sqlite3 statement a request runs, so the
 * existing `[express]` request log can carry `sql=<statements>/<ms>` next to the
 * wall time. Without it a slow request is indistinguishable from a request that
 * ran 30,000 statements — which is exactly what GET /api/v2/situations was
 * doing on 2026-10-05 (30,644 statements per request on a prod-shaped fixture;
 * see request-path-query-plans.test.ts).
 *
 * WHY IT ALSO NAMES STATEMENTS NOW
 * After #80 the same endpoint runs 130 statements on prod — and still took
 * 22,669ms there (Oct 7 02:19 UTC), against 390ms for the same 154-statement
 * shape on the audit fixture. A count cannot explain a 58x gap: 130 statements
 * averaging 174ms each means either one statement is eating the request or all
 * of them are paying cold-disk latency, and those two have opposite fixes. So
 * every statement is timed individually, any single statement over
 * SQL_SLOW_STATEMENT_MS logs itself, and each audited request reports its three
 * slowest. The next cold prod request then names the culprit instead of
 * restating that one exists.
 *
 * NO BOUND PARAMETERS ARE EVER LOGGED. Only the SQL text is — `Statement.source`
 * for the statement methods, the first argument for `exec`/`pragma`/`prepare`.
 * Those are static strings from this repo; the values bound to `?` placeholders
 * (player names, emails, Stripe ids) live in `args[1..]` and are never read.
 *
 * HOW IT HOOKS
 * better-sqlite3 shares one Statement class across every Database handle, so
 * patching that prototype once covers pipeline.db and edge_setter.db together —
 * no per-handle registration, and no module that opens its own handle can slip
 * past it. `exec`, `pragma` and `prepare` are patched on the Database prototype
 * for the same reason: schema DDL run through `exec` is invisible to a
 * prepare-only hook, and ensureSituationSchema's CREATE TABLE/TRIGGER script was
 * 1,503 of those per situations request.
 *
 * WHY A SINGLE GLOBAL COUNTER IS CORRECT HERE
 * better-sqlite3 is synchronous: a statement cannot interleave with another
 * request's statement. The accounting window is opened and closed around
 * `next()` in one express middleware, synchronously, so it can only ever contain
 * statements run by the handler's own synchronous execution. An async handler
 * narrows the window to its synchronous prefix — the window closes the moment
 * the handler first awaits — so it still cannot capture another request's work.
 * That is why `/api/v2/situations`, now an async handler that builds in a worker,
 * reports its numbers through `res.locals.sqlUsage` instead (see index.ts): the
 * window would otherwise honestly report the ~0 statements the main thread ran,
 * which is true but useless.
 *
 * COST WHEN OFF
 * One boolean test and an `apply` per statement. Nothing is timed and nothing is
 * allocated unless a request is being accounted, so the ingestion path pays only
 * the indirection. Set SQL_ACCOUNTING=0 to skip installation entirely.
 *
 * COST WHEN ON (measured — see request-path-query-plans.test.ts, "hook overhead")
 * Per statement, inside an open window: one hrtime pair, one float add, one
 * integer add, two numeric compares. The SQL text is resolved and formatted only
 * for a statement that is either over the slow threshold or faster than nothing
 * in the current top 3 — at most TOP_N + (number of slow statements) times per
 * request, not once per statement.
 */
import Database from "better-sqlite3";

/** One statement's SQL text (whitespace-collapsed, truncated) and its wall time. */
export interface SlowStatement {
  readonly sql: string;
  readonly ms: number;
}

export interface SqlUsage {
  /** Statements executed, counting prepare/exec/pragma separately from run. */
  statements: number;
  /** Wall time inside better-sqlite3, in ms. */
  ms: number;
  /** The slowest TOP_N statements of this window, slowest first. */
  slowest?: SlowStatement[];
  /** Route label for the slow-statement log line, e.g. "GET /api/v2/situations". */
  route?: string;
  /** Set when the numbers come from outside this window (e.g. "worker"). */
  origin?: string;
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

/** A single statement at or over this logs itself, immediately. */
const SLOW_STATEMENT_MS = envNumber("SQL_SLOW_STATEMENT_MS", 250, 1, 600_000);
/** How many of a request's slowest statements ride along on the request log. */
const TOP_N = 3;
/** SQL kept for the per-statement line, and for the per-request top list. */
const SLOW_SQL_CHARS = 200;
const TOP_SQL_CHARS = 60;
/**
 * SQL_TOP_STATEMENTS=0 turns the per-request top list off entirely — no
 * collection, not just no log line — leaving `sql=n/ms` and the per-statement
 * slow line. The kill switch has to reach the collection or it is not a kill
 * switch, and it is also how the overhead test isolates the top list's share.
 */
const COLLECT_TOP_STATEMENTS = process.env.SQL_TOP_STATEMENTS !== "0";

let current: SqlUsage | null = null;
/**
 * The current window's third-slowest ms, hoisted out of the usage object.
 * Only one window is open at a time (beginSqlAccounting refuses to nest), so a
 * module scalar is exact — and it keeps the per-statement fast path to a compare
 * against a local rather than a property chain.
 */
let currentTopMin = 0;
let installed = false;

/**
 * Whitespace-collapse and truncate SQL for a log line.
 *
 * The leading slice bounds the regex: ensureSituationSchema's DDL script is a
 * ~4KB string and this runs inside the statement hook, so collapsing the whole
 * thing in order to throw away all but 200 characters would be the most
 * expensive thing in the hook. `max * 6` leaves enough input that the collapsed
 * head still fills `max` even for heavily indented SQL.
 */
function collapse(sql: string, max: number): string {
  const head = sql.length > max * 6 ? sql.slice(0, max * 6) : sql;
  const flat = head.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) : flat;
}

/** Statement.source, defensively: a patched prototype must never throw. */
function statementSource(target: unknown): string {
  try {
    const source = (target as { source?: unknown }).source;
    return typeof source === "string" ? source : "";
  } catch {
    return "";
  }
}

function noteSlow(usage: SqlUsage, ms: number, sql: string): void {
  if (ms >= SLOW_STATEMENT_MS) {
    console.warn(
      `[sql-slow] ${ms.toFixed(1)}ms ${usage.route || "(unrouted)"} :: ${collapse(sql, SLOW_SQL_CHARS)}`,
    );
  }
  const top = usage.slowest;
  if (!top || !COLLECT_TOP_STATEMENTS) return;
  if (top.length >= TOP_N && ms <= top[TOP_N - 1].ms) return;
  top.push({ sql: collapse(sql, TOP_SQL_CHARS), ms });
  top.sort((a, b) => b.ms - a.ms);
  if (top.length > TOP_N) top.length = TOP_N;
  currentTopMin = top.length >= TOP_N ? top[TOP_N - 1].ms : 0;
}

/**
 * `sqlKind` 0 = a Statement method (SQL is `this.source`), 1 = a Database method
 * (SQL is the first argument). Passed as a number rather than a closure so the
 * hook allocates nothing per statement.
 */
function note(elapsedNs: bigint, sqlKind: 0 | 1, target: unknown, args: unknown[]): void {
  const usage = current;
  if (!usage) return;
  usage.statements += 1;
  const ms = Number(elapsedNs) / 1e6;
  usage.ms += ms;
  // The fast path for an ordinary statement ends here: two compares against
  // locals, no string work, no allocation.
  if (ms < currentTopMin && ms < SLOW_STATEMENT_MS) return;
  const sql = sqlKind === 0
    ? statementSource(target)
    : (typeof args[0] === "string" ? args[0] : "");
  noteSlow(usage, ms, sql);
}

/**
 * Patch the better-sqlite3 prototypes. Idempotent, and a no-op under
 * SQL_ACCOUNTING=0 so the hook can be taken out of the path without a redeploy
 * of anything that imports it.
 *
 * `iterate` is timed for the cost of creating the iterator only — the rows are
 * pulled by the caller's own loop, outside this frame. Nothing on the audited
 * read paths uses it; the patch is there so a future caller still shows up in
 * the statement count.
 */
export function installSqlAccounting(): void {
  if (installed) return;
  if (process.env.SQL_ACCOUNTING === "0") return;
  installed = true;

  const probe = new Database(":memory:");
  try {
    const statementProto = Object.getPrototypeOf(probe.prepare("SELECT 1")) as Record<string, any>;
    for (const method of ["run", "get", "all", "iterate"]) {
      const original = statementProto[method];
      if (typeof original !== "function") continue;
      statementProto[method] = function (this: unknown, ...args: unknown[]) {
        if (!current) return original.apply(this, args);
        const started = process.hrtime.bigint();
        try {
          return original.apply(this, args);
        } finally {
          note(process.hrtime.bigint() - started, 0, this, args);
        }
      };
    }

    const databaseProto = Object.getPrototypeOf(probe) as Record<string, any>;
    for (const method of ["prepare", "exec", "pragma"]) {
      const original = databaseProto[method];
      if (typeof original !== "function") continue;
      databaseProto[method] = function (this: unknown, ...args: unknown[]) {
        if (!current) return original.apply(this, args);
        const started = process.hrtime.bigint();
        try {
          return original.apply(this, args);
        } finally {
          note(process.hrtime.bigint() - started, 1, this, args);
        }
      };
    }
  } finally {
    probe.close();
  }
}

/**
 * Open accounting for one request (or one worker build). Returns a finish
 * function that closes it and hands back the usage; calling it twice yields the
 * same numbers once.
 *
 * `route` only ever reaches log lines, so callers pass `${method} ${req.path}`
 * and never `req.originalUrl` — a query string can carry user input.
 *
 * Re-entrancy: if accounting is somehow already open (an async handler that
 * yielded mid-request), the inner call is a no-op that reports zeroes rather
 * than stealing the outer request's counter.
 */
export function beginSqlAccounting(route = ""): () => SqlUsage {
  if (current) return () => ({ statements: 0, ms: 0, slowest: [], route });
  const usage: SqlUsage = { statements: 0, ms: 0, slowest: [], route };
  current = usage;
  currentTopMin = 0;
  let finished = false;
  return () => {
    if (!finished) {
      finished = true;
      if (current === usage) {
        current = null;
        currentTopMin = 0;
      }
    }
    return usage;
  };
}

/**
 * Routes whose request log carries SQL accounting: the request-side handlers
 * audited for the Oct 5 cold-boot freeze.
 *
 * Matched against `req.path`, so `/api/v2/signals/:id` and `/api/outcomes/:id`
 * are deliberately absent — a prefix match would pull in the admin and replay
 * families that share those roots.
 */
export const ACCOUNTED_PATHS: ReadonlySet<string> = new Set([
  "/api/v2/situations",
  "/api/v2/signals",
  "/api/v2/games",
  "/api/stats/track-record",
  "/api/signals",
  "/api/signal",
  "/api/sources",
  "/api/leaderboard",
]);

/** Render the accounting suffix for the request log, or "" when not accounted. */
export function formatSqlUsage(usage: SqlUsage | null): string {
  if (!usage) return "";
  const origin = usage.origin ? `,${usage.origin}` : "";
  return ` sql=${usage.statements}/${usage.ms.toFixed(1)}ms${origin}`;
}

/**
 * The request's slowest statements, as one line to follow the request log. "" if
 * there is nothing to say, or under SQL_TOP_STATEMENTS=0.
 *
 * One line rather than three: Render's log viewer searches per line, so a single
 * grep for `top sql` returns the whole picture for a request.
 */
export function formatSlowestStatements(usage: SqlUsage | null): string {
  if (!usage || !COLLECT_TOP_STATEMENTS) return "";
  const top = usage.slowest;
  if (!top || top.length === 0) return "";
  return top.map((s, i) => `#${i + 1} ${s.ms.toFixed(1)}ms ${s.sql}`).join(" | ");
}
