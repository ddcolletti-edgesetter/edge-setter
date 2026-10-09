import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runSiteWatch } from "./site-watch";
import { runDailyOps } from "./daily-ops";
import { archiveOldLiveSignals } from "./pipeline/store";
import { runDistributionDraft } from "./distribution-draft";
import { registerPipelineRoutes } from "./pipeline/routes";
import { startIngestionScheduler, bootDelayMs, whenInitialIngestionSettled } from "./pipeline/ingestion";
import { runSettlementBacklogMigration } from "./pipeline/settlement";
import { startEventLoopMonitor, trackJob, trackRequest } from "./event-loop-monitor";
import { startLoopWatchdog } from "./loop-watchdog";
import {
  installSqlAccounting, beginSqlAccounting, ACCOUNTED_PATHS, formatSqlUsage,
  formatSlowestStatements, type SqlUsage,
} from "./sql-accounting";
import { scheduleDbDiagnostics } from "./db-diagnostics";
import { scheduleSituationsWarmup } from "./pipeline/situations-cache";
import { getPipelineDb } from "./pipeline/store";
import { ensureSituationSchema, ensureSituationFoundingIndex } from "./pipeline/situations-store";

// Before any module opens a Database handle: the hook patches the shared
// better-sqlite3 prototypes, so it must be in place before the first statement
// is prepared, not just before the first request.
installSqlAccounting();

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// ─── Health check — registered first, no DB, no logging ─────────────────
// Render's health check must not depend on a data endpoint. Previously it hit
// /api/signals; any >5s event-loop stall got the instance killed (Sept 22 2026).
app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true });
});

startEventLoopMonitor();
startLoopWatchdog();

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Request logger: method/path/status/duration only. Response bodies are NOT
// logged — re-serializing every body blocked the event loop on large payloads
// (/api/v2/games returns ~1.7k rows) and wrote user email + Stripe IDs to logs.
// SQL accounting rides along for the request-side handlers audited after the
// Oct 5 cold-boot freeze (see sql-accounting.ts). It is opened and closed
// around next(): every accounted route is a synchronous handler, so the whole
// handler — and nothing from any other request — runs inside that window.
// A slow request then says WHY it was slow: `in 31649ms sql=30644/31649.3ms` is
// an N+1, `in 1800ms sql=92/1756.0ms` is one bad plan — and the `top sql` line
// that follows names the statement, so "one bad plan" does not need a second
// prod run to identify.
//
// `res.locals.sqlUsage`: a handler that does its SQL somewhere this window
// cannot see — /api/v2/situations builds in a worker thread — sets its own usage
// there and it wins. Without that the line would read `sql=0/0.0ms` for the
// slowest endpoint on the service, which is true of the main thread and useless
// to whoever is reading the log.
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  const isApi = path.startsWith("/api");
  const done = isApi ? trackRequest(`${req.method} ${path}`) : null;
  let usage: SqlUsage | null = null;

  const finish = () => {
    if (!done) return;
    done();
    const reported = (res.locals?.sqlUsage as SqlUsage | undefined) ?? usage;
    log(`${req.method} ${path} ${res.statusCode} in ${Date.now() - start}ms${formatSqlUsage(reported)}`);
    const top = formatSlowestStatements(reported);
    if (top) log(`${req.method} ${path} top sql: ${top}`);
  };
  res.once("finish", finish);
  res.once("close", () => done?.());

  if (!ACCOUNTED_PATHS.has(path)) return next();

  const finishAccounting = beginSqlAccounting(`${req.method} ${path}`);
  try {
    next();
  } finally {
    usage = finishAccounting();
  }
});

(async () => {
  // ─── Pre-listen schema migrations ────────────────────────────────────────
  //
  // THIS BLOCK RUNS BEFORE httpServer.listen, AND THAT IS THE ENTIRE POINT.
  //
  // ensureSituationSchema is otherwise lazy: it runs on the first
  // situations-store call of the process, which — with #82's warm-up gate — is
  // the boot ingestion cycle's situations engine, on the main thread, ~45s
  // after listen. That is a fine place to create a table and a terrible place
  // to build an index over 688,700 rows: Oct 8 showed that cycle already
  // blocking 16.8s, and a 30-90s build on top of it is a health-check kill.
  //
  // Here, nothing is serving and no ingestion is running, so the build's only
  // cost is a one-time delay to port bind. Render gives the start command 15
  // minutes; the build is estimated at 30-90s on prod's 0.5 CPU and is a
  // catalog no-op on every boot after the first (IF NOT EXISTS). Render's
  // zero-downtime deploy keeps the old instance serving throughout, so the
  // worst case is a failed deploy, not an outage.
  //
  // It is first in the IIFE on purpose: ahead of registerRoutes, of
  // startIngestionScheduler, and of the settlement backlog migration, so no
  // handler, timer or migration can touch the database before the schema it
  // expects is in place.
  {
    const started = Date.now();
    const db = getPipelineDb();
    ensureSituationSchema(db);
    const schemaMs = Date.now() - started;
    const idxAt = Date.now();
    // The index is an optimisation, not a correctness requirement: without it
    // the founding-cohort read is slow, not wrong. So a failure here must not
    // take the boot down — it is logged loudly and the process goes on to bind
    // the port. ensureSituationSchema above is deliberately NOT wrapped: the
    // situations tables are a hard requirement and a failure there should stop
    // the boot rather than serve a broken endpoint.
    let idxMs = -1;
    try {
      ensureSituationFoundingIndex(db);
      idxMs = Date.now() - idxAt;
    } catch (e: any) {
      console.error(
        `[startup] founding index build FAILED after ${Date.now() - idxAt}ms, ` +
        `continuing without it (the founding-cohort read will be slow): ${e?.message ?? e}`,
      );
    }
    // Logged unconditionally and separately: on the boot that actually builds
    // it this is the line that explains a slow port bind, and on every later
    // boot it is the line that proves the build is not being repeated.
    console.log(
      `[startup] Pre-listen schema ready in ${Date.now() - started}ms ` +
      `(situations schema ${schemaMs}ms, founding index ` +
      `${idxMs < 0 ? "FAILED" : `${idxMs}ms`})`,
    );
  }

  await registerRoutes(httpServer, app);

  // ─── Pipeline: register routes + start ingestion scheduler ───────────────
  registerPipelineRoutes(app);
  startIngestionScheduler();

  // One-time (idempotent) settlement backlog cleanup: park never-matchable
  // null-game signals and flag stale far-future matches. Chunked + yielding, so
  // it can't block the loop; fire-and-forget so startup is not delayed.
  void trackJob("settlement-backlog-migration", () => runSettlementBacklogMigration())
    .then((r) =>
      console.log(
        `[startup] Settlement backlog migration done: scanned=${r.scanned} ` +
        `expired=${r.expired} stale_flagged=${r.stale_outcomes_flagged} ` +
        `stale_mirrored=${r.stale_outcomes_mirrored}`,
      ),
    )
    .catch((e: any) => console.error("[startup] Settlement backlog migration failed:", e.message));

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ─── Site Watch scheduler — runs every 5 minutes ─────────────────────────
  const SITE_WATCH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  // Initial run well clear of the boot ingestion cycle. It was 30s, which put it
  // on top of the roster refresh (20s) and, 15s later, the first cycle: on Oct 5
  // the freeze that killed the instance named roster-refresh, site-watch and
  // GET /api/v2/situations together. site-watch makes five HTTP calls into this
  // same process, so it cannot run while something else holds the loop.
  const SITE_WATCH_INITIAL_DELAY_MS = bootDelayMs("SITE_WATCH_INITIAL_DELAY_MS", 150_000);
  setTimeout(async () => {
    try {
      const result = await trackJob("site-watch", runSiteWatch);
      console.log(`[site-watch] Initial run complete: status=${result.status} checks=${result.checks.length} anomalies=${result.anomalies.length}`);
    } catch (e: any) {
      console.error("[site-watch] Initial run failed:", e.message);
    }
    // Then repeat every 5 minutes
    setInterval(async () => {
      try {
        const result = await trackJob("site-watch", runSiteWatch);
        if (result.status !== "ok") {
          console.warn(`[site-watch] ${result.status.toUpperCase()} — ${result.recommended_action}`);
        } else {
          console.log(`[site-watch] ok — ${result.checks.length} checks passed`);
        }
      } catch (e: any) {
        console.error("[site-watch] Scheduled run failed:", e.message);
      }
    }, SITE_WATCH_INTERVAL_MS);
  }, SITE_WATCH_INITIAL_DELAY_MS);

  // ─── Distribution Draft scheduler — runs every 30 minutes ────────────────
  const DIST_DRAFT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
  // Last in the boot ladder (roster 20s, ingestion 45s, site-watch 150s): at the
  // old 60s it started while the first ingestion cycle was still running, which
  // on Oct 5 was a 40s cycle.
  const DIST_DRAFT_INITIAL_DELAY_MS = bootDelayMs("DISTRIBUTION_DRAFT_INITIAL_DELAY_MS", 210_000);
  setTimeout(async () => {
    try {
      const result = await trackJob("distribution-draft", runDistributionDraft);
      console.log(`[distribution-draft] Initial run: checked=${result.signals_checked} created=${result.drafts_created} skipped=${result.drafts_skipped}`);
    } catch (e: any) {
      console.error("[distribution-draft] Initial run failed:", e.message);
    }
    setInterval(async () => {
      try {
        const result = await trackJob("distribution-draft", runDistributionDraft);
        if (result.drafts_created > 0) {
          console.log(`[distribution-draft] ${result.drafts_created} new draft(s) created`);
        }
      } catch (e: any) {
        console.error("[distribution-draft] Scheduled run failed:", e.message);
      }
    }, DIST_DRAFT_INTERVAL_MS);
  }, DIST_DRAFT_INITIAL_DELAY_MS);

  // ─── Daily Ops scheduler — runs once per day at 06:00 UTC ───────────────
  function scheduleDailyOps() {
    const now   = new Date();
    const next  = new Date();
    next.setUTCHours(6, 0, 0, 0); // 06:00 UTC daily
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    const msUntilNext = next.getTime() - now.getTime();
    console.log(`[daily-ops] Next scheduled run: ${next.toISOString()} (in ${Math.round(msUntilNext / 60000)}m)`);
    setTimeout(async () => {
      // Archive stale live signals FIRST, so old draft picks / resolved
      // injuries stop surfacing as if current. Previously this only ran when
      // an admin manually hit the archival route, which meant an unattended
      // site accumulated weeks-old stories (e.g. the 19-day-old "out until
      // 2027" story that rendered as a top developing story). Now it runs
      // every day as part of ops.
      try {
        const archived = await trackJob("archive-stale-signals", () => archiveOldLiveSignals(7));
        console.log(`[daily-ops] Archived ${archived} stale live signal(s) (>7 days old)`);
      } catch (e: any) {
        console.error("[daily-ops] Stale-signal archival failed:", e.message);
      }
      try {
        const result = await trackJob("daily-ops", () => runDailyOps({ sendEmailReport: true }));
        console.log(`[daily-ops] Completed for ${result.date}: site=${result.site_health.last_status} email=${result.email_sent}`);
      } catch (e: any) {
        console.error("[daily-ops] Scheduled run failed:", e.message);
      }
      scheduleDailyOps(); // reschedule for next day
    }, msUntilNext);
  }
  scheduleDailyOps();

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      // One-shot DB shape report (file size, journal_mode, estimated row counts
      // for the tables /api/v2/situations reads). Deferred, bounded, and never
      // a COUNT(*) — see db-diagnostics.ts.
      scheduleDbDiagnostics();
      // Build the situations payloads the client actually asks for, in the worker,
      // so the first visitor after a deploy is a cache hit rather than the ~44s
      // cold build that killed the instance on Oct 7.
      //
      // NOT WHILE THE BOOT INGESTION CYCLE IS RUNNING. The worker keeps the build
      // off the event loop; it does not give the process a second disk. On the
      // Oct 7 03:20 boot the warm-up fired at 12s, landed on the first ingestion
      // cycle, and the main thread blocked 6.8s in ingest:settlement (6.66s of it
      // in settlement:read-nullgame) against a 5s health-check budget — a step
      // that did not block at all in the #80 boot, which had no warm-up. So it
      // waits for ingestion-initial to finish, and for a 120s floor after listen,
      // whichever is later. SITUATIONS_WARMUP_DELAY_MS / _MAX_WAIT_MS tune it.
      void scheduleSituationsWarmup(whenInitialIngestionSettled());
    },
  );
})();
