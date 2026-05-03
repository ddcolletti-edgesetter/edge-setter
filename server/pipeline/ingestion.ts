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
 * NFL/CFB (season-gated): odds + ESPN injuries run Sep–Feb (NFL) and Sep–Jan (CFB).
 *   Manual trigger: POST /api/pipeline/ingest/nfl or /cfb (bypasses season guard).
 */

import { ingestOdds } from "./adapters/the-odds-api";
import { ingestNBAInjuries } from "./adapters/espn-nba";
import { ingestMLBSchedule, ingestMLBTransactions, ingestProbablePitchers } from "./adapters/mlb-statsapi";
import { ingestNFLInjuries } from "./adapters/espn-nfl";
import { ingestCFBInjuries } from "./adapters/espn-cfb";
import { processRawEvents } from "./processor";
import { autoSettleFinishedGames } from "./settlement";
import { dispatchSignalAlerts } from "../alerts";
import { recordPipelineHealth, storage } from "../storage";

function logIngestion(stage: string, inputRef: string, outputRef: string, summary: string, error?: string) {
  try {
    storage.logAgentAction({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agent_name: `Ingestion/${stage}`,
      input_ref: inputRef,
      output_ref: outputRef,
      decision_summary: summary,
      error_state: error ?? null,
      warning_state: null,
    });
  } catch { /* never let logging break the pipeline */ }
}

let _running = false;

/* ─── Season helpers ─────────────────────────────────────── */

/** NFL regular season: Sep–Feb; includes August preseason. */
function isNFLSeason(): boolean {
  const m = new Date().getMonth() + 1; // 1-indexed
  return m >= 8 || m <= 2;
}

/** CFB season: Sep–Jan (bowl games extend into January). */
function isCFBSeason(): boolean {
  const m = new Date().getMonth() + 1;
  return m >= 8 || m === 1;
}

/* ─── Run one full ingest cycle ──────────────────────────── */

export async function runIngestionCycle(): Promise<{
  odds: {
    NBA: { games: number; events: number };
    MLB: { games: number; events: number };
    NFL: { games: number; events: number } | null;
    CFB: { games: number; events: number } | null;
  };
  nba_injuries: { created: number; skipped: number };
  mlb_schedule: { games: number };
  mlb_transactions: { created: number };
  mlb_pitchers: { created: number };
  nfl_injuries: { created: number; skipped: number } | null;
  cfb_injuries: { created: number; skipped: number } | null;
  processed: { processed: number; errors: number };
}> {
  if (_running) {
    console.log("[ingestion] Cycle already running — skipping");
    return {
      odds: { NBA: { games: 0, events: 0 }, MLB: { games: 0, events: 0 }, NFL: null, CFB: null },
      nba_injuries: { created: 0, skipped: 0 },
      mlb_schedule: { games: 0 },
      mlb_transactions: { created: 0 },
      mlb_pitchers: { created: 0 },
      nfl_injuries: null,
      cfb_injuries: null,
      processed: { processed: 0, errors: 0 },
    };
  }

  _running = true;
  const start = Date.now();
  const runId = crypto.randomUUID();

  logIngestion("Start", runId, runId, `Cycle started — NBA+MLB odds, NBA injuries, MLB schedule/txns/pitchers`);

  try {
    // ── 1. Odds (line data) ────────────────────────────────
    const nflSeason = isNFLSeason();
    const cfbSeason = isCFBSeason();

    const oddsErrors: string[] = [];
    const [nbaOdds, mlbOdds, nflOdds, cfbOdds] = await Promise.all([
      ingestOdds("NBA").catch(e => { const msg = e.message; console.error("[ingestion] NBA odds error:", msg); oddsErrors.push(`NBA odds: ${msg}`); return { games: 0, events: 0 }; }),
      ingestOdds("MLB").catch(e => { const msg = e.message; console.error("[ingestion] MLB odds error:", msg); oddsErrors.push(`MLB odds: ${msg}`); return { games: 0, events: 0 }; }),
      nflSeason
        ? ingestOdds("NFL").catch(e => { const msg = e.message; console.error("[ingestion] NFL odds error:", msg); oddsErrors.push(`NFL odds: ${msg}`); return { games: 0, events: 0 }; })
        : Promise.resolve(null),
      cfbSeason
        ? ingestOdds("CFB").catch(e => { const msg = e.message; console.error("[ingestion] CFB odds error:", msg); oddsErrors.push(`CFB odds: ${msg}`); return { games: 0, events: 0 }; })
        : Promise.resolve(null),
    ]);

    logIngestion(
      "Odds",
      runId,
      "the-odds-api",
      `NBA: ${nbaOdds.games}g/${nbaOdds.events}e · MLB: ${mlbOdds.games}g/${mlbOdds.events}e · NFL: ${nflOdds?.games ?? "off-season"}g · CFB: ${cfbOdds?.games ?? "off-season"}g`,
      oddsErrors.length ? oddsErrors.join("; ") : undefined,
    );

    // ── 2. NBA injuries ────────────────────────────────────
    let nbaInjError: string | undefined;
    const nba_injuries = await ingestNBAInjuries().catch(e => {
      nbaInjError = e.message;
      console.error("[ingestion] NBA injuries error:", e.message);
      return { created: 0, skipped: 0 };
    });

    logIngestion(
      "NBAInjuries",
      runId,
      "balldontlie",
      `created: ${nba_injuries.created} · skipped: ${nba_injuries.skipped}`,
      nbaInjError,
    );

    // ── 3. MLB schedule + transactions + pitchers ──────────
    const mlbErrors: string[] = [];
    const [mlb_schedule, mlb_transactions, mlb_pitchers] = await Promise.all([
      ingestMLBSchedule().catch(e => { const msg = e.message; console.error("[ingestion] MLB schedule error:", msg); mlbErrors.push(`schedule: ${msg}`); return { games: 0 }; }),
      ingestMLBTransactions().catch(e => { const msg = e.message; console.error("[ingestion] MLB txns error:", msg); mlbErrors.push(`txns: ${msg}`); return { created: 0 }; }),
      ingestProbablePitchers().catch(e => { const msg = e.message; console.error("[ingestion] MLB pitchers error:", msg); mlbErrors.push(`pitchers: ${msg}`); return { created: 0 }; }),
    ]);

    logIngestion(
      "MLB",
      runId,
      "mlb-statsapi",
      `games: ${mlb_schedule.games} · transactions: ${mlb_transactions.created} · probable pitchers: ${mlb_pitchers.created}`,
      mlbErrors.length ? mlbErrors.join("; ") : undefined,
    );

    // ── 4. NFL + CFB injuries (season-gated) ──────────────
    let nflInjError: string | undefined;
    const nfl_injuries = nflSeason
      ? await ingestNFLInjuries().catch(e => { nflInjError = e.message; console.error("[ingestion] NFL injuries error:", e.message); return { created: 0, skipped: 0 }; })
      : null;
    let cfbInjError: string | undefined;
    const cfb_injuries = cfbSeason
      ? await ingestCFBInjuries().catch(e => { cfbInjError = e.message; console.error("[ingestion] CFB injuries error:", e.message); return { created: 0, skipped: 0 }; })
      : null;

    if (nflSeason || cfbSeason) {
      logIngestion(
        "NFLCFBInjuries",
        runId,
        "espn",
        `NFL: ${nfl_injuries ? `${nfl_injuries.created} created / ${nfl_injuries.skipped} skipped` : "off-season"} · CFB: ${cfb_injuries ? `${cfb_injuries.created} created / ${cfb_injuries.skipped} skipped` : "off-season"}`,
        [nflInjError, cfbInjError].filter(Boolean).join("; ") || undefined,
      );
    }

    // ── 5. Process all new RawEvents ───────────────────────
    let processorError: string | undefined;
    const processed = await processRawEvents().catch(e => {
      processorError = e.message;
      console.error("[ingestion] Processor error:", e.message);
      return { processed: 0, errors: 0 };
    });

    // ── 6. Dispatch alerts for newly scored signals ──────────
    const alertResult = await dispatchSignalAlerts().catch(e => {
      console.error("[ingestion] Alert dispatch error:", e.message);
      return { dispatched: 0, users_notified: 0 };
    });
    if (alertResult.dispatched > 0) {
      console.log(`[ingestion] Alerts: ${alertResult.dispatched} signals → ${alertResult.users_notified} users`);
    }
    recordPipelineHealth("alerts", "ok", {
      dispatched:     alertResult.dispatched,
      users_notified: alertResult.users_notified,
    });

    // ── 7. Settle any games that are now final ───────────────
    const settlement = await autoSettleFinishedGames().catch(e => {
      console.error("[ingestion] Settlement error:", e.message);
      return { scores_fetched: { NBA: 0, MLB: 0, NFL: 0, CFB: 0 }, games_updated: 0, games_settled: 0, signals_settled: 0 };
    });
    if (settlement.signals_settled > 0) {
      console.log(`[ingestion] Settlement: ${settlement.signals_settled} signals settled across ${settlement.games_settled} games`);
    }
    recordPipelineHealth("settlement", "ok", {
      signals_settled: settlement.signals_settled,
      games_settled:   settlement.games_settled,
    });

    const elapsed = Date.now() - start;
    const summary =
      `${elapsed}ms — ` +
      `NBA odds: ${nbaOdds.games}g/${nbaOdds.events}e · MLB odds: ${mlbOdds.games}g/${mlbOdds.events}e · ` +
      `NBA inj: ${nba_injuries.created} · MLB txn: ${mlb_transactions.created} · MLB SP: ${mlb_pitchers.created} · ` +
      `processed: ${processed.processed} · alerts: ${alertResult.dispatched} · settled: ${settlement.signals_settled}`;

    console.log(`[ingestion] Cycle complete in ${summary}`);

    logIngestion(
      "Complete",
      runId,
      runId,
      summary,
      processed.errors > 0 ? `Processor reported ${processed.errors} error(s)` : undefined,
    );

    recordPipelineHealth("ingestion", processed.errors > 0 ? "warning" : "ok", {
      elapsed_ms:       elapsed,
      nba_odds_games:   nbaOdds.games,
      mlb_odds_games:   mlbOdds.games,
      nfl_odds_games:   nflOdds?.games ?? 0,
      cfb_odds_games:   cfbOdds?.games ?? 0,
      nba_injuries:     nba_injuries.created,
      mlb_transactions: mlb_transactions.created,
      processed:        processed.processed,
      errors:           processed.errors,
    });

    return {
      odds: { NBA: nbaOdds, MLB: mlbOdds, NFL: nflOdds, CFB: cfbOdds },
      nba_injuries,
      mlb_schedule,
      mlb_transactions,
      mlb_pitchers,
      nfl_injuries,
      cfb_injuries,
      processed,
    };
  } catch (e: any) {
    const elapsed = Date.now() - start;
    const msg = e?.message ?? String(e);
    console.error("[ingestion] Cycle failed:", msg);
    logIngestion("Failed", runId, runId, `Cycle failed after ${elapsed}ms`, msg);
    throw e;
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
        await runIngestionCycle().catch(e => {
          console.error("[ingestion] Scheduled cycle error:", e.message);
        });
      } else {
        console.log("[ingestion] Off-hours — skipping cycle");
        logIngestion("Skipped", "scheduler", "scheduler", `Off-hours at ${hourUTC}:00 UTC — cycle skipped`);
      }
    }, ODDS_INTERVAL_MS);

  }, INITIAL_DELAY_MS);

  console.log(`[ingestion] Scheduler started — first run in ${INITIAL_DELAY_MS / 1000}s, then every ${ODDS_INTERVAL_MS / 60000}m`);
}
