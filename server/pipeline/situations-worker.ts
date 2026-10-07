/**
 * Edge Setter — GET /api/v2/situations build, in a worker thread.
 *
 * WHY THIS EXISTS
 * better-sqlite3 is synchronous. A statement that takes 22 seconds blocks the
 * event loop for 22 seconds, and nothing — not /healthz, not a yield between
 * statements, not a smaller LIMIT — runs during it. Render kills the instance
 * after two consecutive 5s health-check timeouts, which is what happened on
 * Oct 7 02:19:31 UTC: a cold GET /api/v2/situations ran ~44s and took the
 * instance with it (server_failed).
 *
 * Every previous fix for this endpoint reduced the work: #51 bounded the pool,
 * #78 indexed outcomes, #80 cut 30,644 statements per request to 130. All of them
 * helped and none of them changed the shape of the failure, because the shape of
 * the failure is "one synchronous span, unbounded". The only way to bound a
 * synchronous span is to run it on a thread that is not the one answering health
 * checks. That is all this file does.
 *
 * WHAT IT IS NOT
 * It is not a fix for the 22.6s itself. The build takes exactly as long in here
 * as it did on the main thread; the instrumentation in the previous commit is
 * what will say why. This makes the slowness survivable instead of fatal.
 *
 * THE CONNECTION IS READ-WRITE, AND IT HAS TO BE
 * The brief asked for a read-only connection, which would be the right thing: a
 * build path that cannot write cannot corrupt anything, whatever it is asked to
 * do. It is not available today. `ensureSituationSchema` runs its whole CREATE
 * TABLE / CREATE INDEX script through `exec` on EVERY situations-store call, not
 * once per handle, so `PRAGMA query_only = ON` would fail every read on this path
 * rather than guard it. Making that script run once per handle is a change to the
 * hot path with its own measurements to take (it is also a candidate for the
 * 22.6s — ~15 of those execs happen per request), so it is a follow-up, not a
 * passenger on this one. Until then: the handle is read-write, nothing on the
 * path it runs writes, and `getPipelineDb` is the same opener the main thread
 * uses, so WAL is set the same way.
 *
 * WAL IS WHAT MAKES A SECOND CONNECTION SAFE
 * pipeline.db is in WAL mode (store.ts sets it at open; db-diagnostics.ts reports
 * it at boot and the test asserts it reads back `wal`). A long reader in WAL does
 * not block a writer, so a 22s build in here cannot stall the ingestion cycle on
 * the main thread. In the default rollback journal it would, and this design
 * would trade a dead instance for a stalled pipeline.
 *
 * IT PUBLISHES THE STATEMENT IT IS INSIDE
 * The accounting hook logs a statement when it finishes, and the statements that
 * matter most here are the ones that do not: on the Oct 7 03:20 deploy two
 * warm-up builds hit the 30s timeout and were terminated mid-statement, and
 * nothing named them. This thread cannot postMessage while it is wedged inside
 * SQLite — not running its event loop is the point of it — so each statement is
 * written into a SharedArrayBuffer before it runs and the parent reads it out
 * when it kills the thread. See sql-accounting.ts, "The statement in flight".
 *
 * THIS FILE IS A BUILT ARTIFACT
 * It ships as dist/situations-worker.cjs (script/build.mjs). `tsx` does not carry
 * its TypeScript loader into worker threads and Node ignores a Worker `execArgv`
 * that would add one — both measured — so under `npm run dev` and under vitest
 * there is no worker and the caller falls back to building in-thread, exactly as
 * before this change. See situations-cache.ts.
 */
import { parentPort, workerData } from "worker_threads";
import {
  listCanonicalSituationApiResponses,
  type CanonicalSituationApiQuery,
  type CanonicalSituationApiResponse,
} from "./situations-api";
import { ensureSituationSchema } from "./situations-store";
import { getPipelineDb } from "./store";
import {
  beginSqlAccounting, installSqlAccounting, publishInFlightStatements, type SqlUsage,
} from "../sql-accounting";

/** The response body of GET /api/v2/situations, unchanged. */
export interface SituationsPayload {
  readonly count: number;
  readonly situations: readonly CanonicalSituationApiResponse[];
}

export interface SituationsBuildRequest {
  readonly id: number;
  readonly query: CanonicalSituationApiQuery;
}

export type SituationsWorkerMessage =
  /** Posted once, after the DB handle is open and the schema check has run. */
  | { readonly kind: "ready"; readonly bootMs: number }
  | {
      readonly kind: "result";
      readonly id: number;
      readonly ok: true;
      readonly payload: SituationsPayload;
      /** The build's own SQL accounting, for the [express] log line. */
      readonly usage: SqlUsage;
      readonly buildMs: number;
    }
  | { readonly kind: "result"; readonly id: number; readonly ok: false; readonly error: string };

/**
 * Build one payload, with SQL accounting open around it.
 *
 * Exported so the parity test can call the same function the worker calls,
 * in-thread, and compare — the equality that matters is between this and the
 * route's fallback, not between this and a reimplementation of it.
 */
export function buildSituationsPayload(query: CanonicalSituationApiQuery): {
  payload: SituationsPayload;
  usage: SqlUsage;
  buildMs: number;
} {
  const finish = beginSqlAccounting("worker GET /api/v2/situations");
  const started = Date.now();
  try {
    const situations = listCanonicalSituationApiResponses(query);
    return {
      payload: { count: situations.length, situations },
      usage: finish(),
      buildMs: Date.now() - started,
    };
  } finally {
    finish(); // idempotent; the window must not survive a throw
  }
}

/* ─── Worker body ──────────────────────────────────────────────────────────── */

// Guarded so an accidental direct import (a test, a bundler walking the graph)
// does not try to install a message handler on a null parentPort.
if (parentPort) {
  const port = parentPort;
  // Publish the statement this thread is inside, to shared memory the parent can
  // read while this thread is wedged. Installed BEFORE the accounting hook and
  // before the first statement, so the boot schema check below is covered too: a
  // worker killed by the boot timeout is one of the two cases this reports.
  // Absent (an older parent, or the test stubs) it is simply off.
  publishInFlightStatements(
    (workerData as { inFlightBuffer?: SharedArrayBuffer } | null)?.inFlightBuffer ?? null,
  );
  installSqlAccounting();

  const bootStarted = Date.now();
  try {
    // Open the handle and run the schema check once up front, so the first
    // request does not also pay for opening a cold 1.4GB file. On Render that is
    // seconds of work — in here, seconds that block nothing.
    ensureSituationSchema(getPipelineDb());
  } catch (e: any) {
    // Report and keep going: a schema check that failed on an empty DB is
    // recoverable (the build will raise a real error the caller can see), and
    // dying here would look to the parent like a worker that cannot be spawned.
    console.warn(`[situations-worker] schema warm-up failed: ${e?.message ?? e}`);
  }
  port.postMessage({ kind: "ready", bootMs: Date.now() - bootStarted } satisfies SituationsWorkerMessage);

  port.on("message", (message: SituationsBuildRequest) => {
    const id = message?.id ?? -1;
    try {
      const built = buildSituationsPayload(message.query ?? {});
      port.postMessage({
        kind: "result", id, ok: true,
        payload: built.payload, usage: built.usage, buildMs: built.buildMs,
      } satisfies SituationsWorkerMessage);
    } catch (e: any) {
      port.postMessage({
        kind: "result", id, ok: false, error: String(e?.message ?? e),
      } satisfies SituationsWorkerMessage);
    }
  });
}
