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
import { startIngestionScheduler } from "./pipeline/ingestion";
import { startEventLoopMonitor, trackJob, trackRequest } from "./event-loop-monitor";
import { startLoopWatchdog } from "./loop-watchdog";

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
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  const isApi = path.startsWith("/api");
  const done = isApi ? trackRequest(`${req.method} ${path}`) : null;

  const finish = () => {
    if (!done) return;
    done();
    log(`${req.method} ${path} ${res.statusCode} in ${Date.now() - start}ms`);
  };
  res.once("finish", finish);
  res.once("close", () => done?.());

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // ─── Pipeline: register routes + start ingestion scheduler ───────────────
  registerPipelineRoutes(app);
  startIngestionScheduler();

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
  // Initial run 30s after startup (let DB hydration finish)
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
  }, 30_000);

  // ─── Distribution Draft scheduler — runs every 30 minutes ────────────────
  const DIST_DRAFT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
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
  }, 60_000); // 60s after startup

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
    },
  );
})();
