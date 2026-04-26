/**
 * Edge Setter — Ingestion Scheduler  (Sprint 7)
 *
 * Orchestrates all adapters and runs the processor on a schedule.
 *
 * Schedule:
 *   - Odds (NBA+MLB): every 15 minutes during active hours (10am–midnight ET)
 *   - NBA injuries: every 30 minutes
 *   - MLB transactions + pitchers: every 60 minutes
 *   - Processor: runs immediately after each ingest batch
 *
 * NFL/CFB: season is off — no automated adapters yet.
 *   Use POST /api/pipeline/ingest/manual instead.
 */

import { ingestOdds } from "./adapters/the-odds-api";
import { ingestNBAInjuries } from "./adapters/balldontlie";
import { ingestMLBSchedule, ingestMLBTransactions, ingestProbablePitchers } from "./adapters/mlb-statsapi";
import { processRawEvents } from "./processor";

let _running = false;

/* ─── Run one full ingest cycle ──────────────────────────── */

export async function runIngestionCycle(): Promise<{
  odds: { NBA: { games: number; events: number }; MLB: { games: number; events: number } };
  nba_injuries: { created: number; skipped: number };
  mlb_schedule: { games: number };
  mlb_transactions: { created: number };
  mlb_pitchers: { created: number };
  processed: { processed: number; errors: number };
}> {
  if (_running) {
    console.log("[ingestion] Cycle already running — skipping");
    return {
      odds: { NBA: { games: 0, events: 0 }, MLB: { games: 0, events: 0 } },
      nba_injuries: { created: 0, skipped: 0 },
      mlb_schedule: { games: 0 },
      mlb_transactions: { created: 0 },
      mlb_pitchers: { created: 0 },
      processed: { processed: 0, errors: 0 },
    };
  }

  _running = true;
  const start = Date.now();

  try {
    // ── 1. Odds (line data) ────────────────────────────────
    const [nbaOdds, mlbOdds] = await Promise.all([
      ingestOdds("NBA").catch(e => { console.error("[ingestion] NBA odds error:", e.message); return { games: 0, events: 0 }; }),
      ingestOdds("MLB").catch(e => { console.error("[ingestion] MLB odds error:", e.message); return { games: 0, events: 0 }; }),
    ]);

    // ── 2. NBA injuries ────────────────────────────────────
    const nba_injuries = await ingestNBAInjuries().catch(e => {
      console.error("[ingestion] NBA injuries error:", e.message);
      return { created: 0, skipped: 0 };
    });

    // ── 3. MLB schedule + transactions + pitchers ──────────
    const [mlb_schedule, mlb_transactions, mlb_pitchers] = await Promise.all([
      ingestMLBSchedule().catch(e => { console.error("[ingestion] MLB schedule error:", e.message); return { games: 0 }; }),
      ingestMLBTransactions().catch(e => { console.error("[ingestion] MLB txns error:", e.message); return { created: 0 }; }),
      ingestProbablePitchers().catch(e => { console.error("[ingestion] MLB pitchers error:", e.message); return { created: 0 }; }),
    ]);

    // ── 4. Process all new RawEvents ───────────────────────
    const processed = await processRawEvents().catch(e => {
      console.error("[ingestion] Processor error:", e.message);
      return { processed: 0, errors: 0 };
    });

    const elapsed = Date.now() - start;
    console.log(
      `[ingestion] Cycle complete in ${elapsed}ms — ` +
      `NBA odds: ${nbaOdds.games}g/${nbaOdds.events}e, MLB odds: ${mlbOdds.games}g/${mlbOdds.events}e, ` +
      `NBA inj: ${nba_injuries.created}, MLB txn: ${mlb_transactions.created}, ` +
      `MLB SP: ${mlb_pitchers.created}, processed: ${processed.processed}`
    );

    return {
      odds: { NBA: nbaOdds, MLB: mlbOdds },
      nba_injuries,
      mlb_schedule,
      mlb_transactions,
      mlb_pitchers,
      processed,
    };
  } finally {
    _running = false;
  }
}

/* ─── Start the scheduler ────────────────────────────────── */

export function startIngestionScheduler() {
  const ODDS_INTERVAL_MS   = 15 * 60 * 1000;  // 15 min
  const INJURY_INTERVAL_MS = 30 * 60 * 1000;  // 30 min

  // First run: 45 seconds after server start (let DB warm up)
  const INITIAL_DELAY_MS = 45_000;

  setTimeout(async () => {
    console.log("[ingestion] Starting initial cycle...");
    await runIngestionCycle();

    // Then schedule recurring runs
    setInterval(async () => {
      // Only run during active hours (7am–1am ET = 12:00–06:00 UTC)
      const hourUTC = new Date().getUTCHours();
      const isActiveHours = hourUTC >= 12 || hourUTC <= 6;
      if (isActiveHours) {
        await runIngestionCycle().catch(e => console.error("[ingestion] Scheduled cycle error:", e.message));
      } else {
        console.log("[ingestion] Off-hours — skipping cycle");
      }
    }, ODDS_INTERVAL_MS);

  }, INITIAL_DELAY_MS);

  console.log(`[ingestion] Scheduler started — first run in ${INITIAL_DELAY_MS / 1000}s, then every ${ODDS_INTERVAL_MS / 60000}m`);
}
