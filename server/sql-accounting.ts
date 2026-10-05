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
 * request's statement. The accounting is opened and closed inside one express
 * handler, and every route it is enabled for (see ACCOUNTED_PATHS) is a
 * synchronous handler, so the delta it reports is that request's own work and
 * nothing else's. An async handler could attribute another request's statements
 * to itself, which is why the set is an explicit allowlist rather than every
 * /api route.
 *
 * COST WHEN OFF
 * One boolean test and an `apply` per statement. Nothing is timed and nothing is
 * allocated unless a request is being accounted, so the ingestion path pays only
 * the indirection. Set SQL_ACCOUNTING=0 to skip installation entirely.
 */
import Database from "better-sqlite3";

export interface SqlUsage {
  /** Statements executed, counting prepare/exec/pragma separately from run. */
  statements: number;
  /** Wall time inside better-sqlite3, in ms. */
  ms: number;
}

let current: SqlUsage | null = null;
let installed = false;

function note(elapsedNs: bigint): void {
  if (!current) return;
  current.statements += 1;
  current.ms += Number(elapsedNs) / 1e6;
}

/**
 * Patch the better-sqlite3 prototypes. Idempotent, and a no-op under
 * SQL_ACCOUNTING=0 so the hook can be taken out of the path without a redeploy
 * of anything that imports it.
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
          note(process.hrtime.bigint() - started);
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
          note(process.hrtime.bigint() - started);
        }
      };
    }
  } finally {
    probe.close();
  }
}

/**
 * Open accounting for one request. Returns a finish function that closes it and
 * hands back the usage; calling it twice yields the same numbers once.
 *
 * Re-entrancy: if accounting is somehow already open (an async handler that
 * yielded mid-request), the inner call is a no-op that reports zeroes rather
 * than stealing the outer request's counter.
 */
export function beginSqlAccounting(): () => SqlUsage {
  if (current) return () => ({ statements: 0, ms: 0 });
  const usage: SqlUsage = { statements: 0, ms: 0 };
  current = usage;
  let finished = false;
  return () => {
    if (!finished) {
      finished = true;
      if (current === usage) current = null;
    }
    return usage;
  };
}

/**
 * Routes whose request log carries SQL accounting: the request-side handlers
 * audited for the Oct 5 cold-boot freeze, all of which are synchronous.
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
  return ` sql=${usage.statements}/${usage.ms.toFixed(1)}ms`;
}
