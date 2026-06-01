import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runSiteWatch } from "./site-watch";
import { runDailyOps } from "./daily-ops";
import { runDistributionDraft } from "./distribution-draft";
import { registerPipelineRoutes } from "./pipeline/routes";
import { startIngestionScheduler } from "./pipeline/ingestion";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

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

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        const loggedResponse = path === "/api/billing/portal" && "url" in capturedJsonResponse
          ? { ...capturedJsonResponse, url: "[redacted]" }
          : capturedJsonResponse;
        logLine += ` :: ${JSON.stringify(loggedResponse)}`;
      }

      log(logLine);
    }
  });

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
      const result = await runSiteWatch();
      console.log(`[site-watch] Initial run complete: status=${result.status} checks=${result.checks.length} anomalies=${result.anomalies.length}`);
    } catch (e: any) {
      console.error("[site-watch] Initial run failed:", e.message);
    }
    // Then repeat every 5 minutes
    setInterval(async () => {
      try {
        const result = await runSiteWatch();
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
      const result = await runDistributionDraft();
      console.log(`[distribution-draft] Initial run: checked=${result.signals_checked} created=${result.drafts_created} skipped=${result.drafts_skipped}`);
    } catch (e: any) {
      console.error("[distribution-draft] Initial run failed:", e.message);
    }
    setInterval(async () => {
      try {
        const result = await runDistributionDraft();
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
      try {
        const result = await runDailyOps({ sendEmailReport: true });
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
