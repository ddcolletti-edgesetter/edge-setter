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
 * NFL/CFB odds (season-gated): run Sep–Feb (NFL) and Sep–Jan (CFB) only — no games off-season.
 * NFL/CFB injuries + transactions: year-round — covers OTAs, Draft, signings, transfers.
 */

import { ingestOdds } from "./adapters/the-odds-api";
import { ingestNBAInjuries } from "./adapters/espn-nba";
import { ingestMLBSchedule, ingestMLBTransactions, ingestProbablePitchers } from "./adapters/mlb-statsapi";
import { ingestNFLInjuries } from "./adapters/espn-nfl";
import { ingestCFBInjuries } from "./adapters/espn-cfb";
import { ingestNFLTransactions } from "./adapters/espn-nfl-transactions";
import { ingestCFBTransactions } from "./adapters/espn-cfb-transactions";
import { ingestCFBSchoolSIDFeeds } from "./adapters/cfb-school-sid";
import { ingestOn3Feeds } from "./adapters/on3";
import { ingest247SportsFeed } from "./adapters/247sports";
import { ingestXTier1, ingestXTier2 } from "./adapters/x-twitter";
import { ingestSportsRSSFeeds, ingestLockedOnFeeds } from "./adapters/sports-rss";
import { POWER4_SOURCES } from "./adapters/cfb-school-sources";
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

let _running = false;      // standard-tier mutex
let _fastRunning = false;  // fast-tier mutex — separate so a slow standard run never blocks tier1 polling

// Both tiers trigger the processor; serialize the calls so concurrent cycles
// can't pull the same pending raw events and emit duplicate signals.
let _processorChain: Promise<unknown> = Promise.resolve();
function runProcessorSerialized(): Promise<{ processed: number; errors: number }> {
  const next = _processorChain.then(() => processRawEvents());
  _processorChain = next.catch(() => {});
  return next;
}

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

export async function runIngestionCycle(opts: { includeFastTier?: boolean } = {}): Promise<{
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
  nfl_transactions: { created: number; skipped: number };
  cfb_transactions: { created: number; skipped: number };
  cfb_sid: { created: number; skipped: number };
  on3: { created: number; skipped: number };
  sports247: { created: number; skipped: number };
  x_tier1: { created: number; skipped: number; noise: number; rate_limited: boolean };
  x_tier2: { created: number; skipped: number; noise: number; rate_limited: boolean } | null;
  sports_rss: { created: number; skipped: number };
  lockedon: { created: number; skipped: number };
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
      nfl_transactions: { created: 0, skipped: 0 },
      cfb_transactions: { created: 0, skipped: 0 },
      cfb_sid: { created: 0, skipped: 0 },
      on3: { created: 0, skipped: 0 },
      sports247: { created: 0, skipped: 0 },
      x_tier1: { created: 0, skipped: 0, noise: 0, rate_limited: false },
      x_tier2: null,
      sports_rss: { created: 0, skipped: 0 },
      lockedon:   { created: 0, skipped: 0 },
      processed: { processed: 0, errors: 0 },
    };
  }

  // When the fast tier runs on its own 5-min schedule, the standard cycle
  // skips tier1 sources (SID feeds, X tier1) to avoid double-polling them.
  // Manual triggers (admin route) default to a full run.
  const includeFastTier = opts.includeFastTier ?? true;

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

    // ── 4. NFL + CFB injuries (year-round: covers OTAs, minicamp, spring ball) ──
    let nflInjError: string | undefined;
    const nfl_injuries = await ingestNFLInjuries().catch(e => { nflInjError = e.message; console.error("[ingestion] NFL injuries error:", e.message); return { created: 0, skipped: 0 }; });
    let cfbInjError: string | undefined;
    const cfb_injuries = await ingestCFBInjuries().catch(e => { cfbInjError = e.message; console.error("[ingestion] CFB injuries error:", e.message); return { created: 0, skipped: 0 }; });

    logIngestion(
      "NFLCFBInjuries",
      runId,
      "espn",
      `NFL: ${nfl_injuries.created} created / ${nfl_injuries.skipped} skipped · CFB: ${cfb_injuries.created} created / ${cfb_injuries.skipped} skipped`,
      [nflInjError, cfbInjError].filter(Boolean).join("; ") || undefined,
    );

    // ── 5. NFL + CFB transactions (year-round: Draft, signings, cuts, transfers) ─
    let nflTxError: string | undefined;
    const nfl_transactions = await ingestNFLTransactions().catch(e => { nflTxError = e.message; console.error("[ingestion] NFL transactions error:", e.message); return { created: 0, skipped: 0 }; });
    let cfbTxError: string | undefined;
    const cfb_transactions = await ingestCFBTransactions().catch(e => { cfbTxError = e.message; console.error("[ingestion] CFB transactions error:", e.message); return { created: 0, skipped: 0 }; });

    logIngestion(
      "NFLCFBTransactions",
      runId,
      "espn",
      `NFL tx: ${nfl_transactions.created} created / ${nfl_transactions.skipped} skipped · CFB tx: ${cfb_transactions.created} created / ${cfb_transactions.skipped} skipped`,
      [nflTxError, cfbTxError].filter(Boolean).join("; ") || undefined,
    );

    // ── 5b. CFB School SID feeds (eligibility rulings, roster decisions) ──────
    let on3Error: string | undefined;
    const on3 = await ingestOn3Feeds().catch(e => {
      on3Error = e.message;
      console.error("[ingestion] On3 feeds error:", e.message);
      return { created: 0, skipped: 0 };
    });
 
    logIngestion(
      "On3Feeds",
      runId,
      "on3.com",
      `On3: ${on3.created} created / ${on3.skipped} skipped`,
      on3Error,
    );
 
    // ── 5d. 247Sports feeds (recruiting, portal, CFB + NFL news) ──────────────
    let sports247Error: string | undefined;
    const sports247 = await ingest247SportsFeed().catch(e => {
      sports247Error = e.message;
      console.error("[ingestion] 247Sports feeds error:", e.message);
      return { created: 0, skipped: 0 };
    });
 
    logIngestion(
      "247SportsFeed",
      runId,
      "247sports.com",
      `247Sports: ${sports247.created} created / ${sports247.skipped} skipped`,
      sports247Error,
    );
    let cfbSIDError: string | undefined;
    const cfb_sid = includeFastTier
      ? await ingestCFBSchoolSIDFeeds().catch(e => {
          cfbSIDError = e.message;
          console.error("[ingestion] CFB SID feeds error:", e.message);
          return { created: 0, skipped: 0 };
        })
      : { created: 0, skipped: 0 };

    if (includeFastTier) {
      logIngestion(
        "CFBSchoolSID",
        runId,
        "cfb-school-sources",
        `SID feeds: ${cfb_sid.created} created / ${cfb_sid.skipped} skipped across ${POWER4_SOURCES.length} schools`,
        cfbSIDError,
      );
    }

    // ── 5e. X/Twitter — Tier 1 nationals (fast tier; skipped when the 5-min cycle owns it) ──
    let xTier1Error: string | undefined;
    const x_tier1 = includeFastTier
      ? await ingestXTier1().catch((e: Error) => {
          xTier1Error = e.message;
          console.error("[ingestion] X tier1 error:", e.message);
          return { created: 0, skipped: 0, noise: 0, rate_limited: false };
        })
      : { created: 0, skipped: 0, noise: 0, rate_limited: false };

    if (includeFastTier) {
      logIngestion(
        "XTier1",
        runId,
        "x.com",
        `X Tier1: ${x_tier1.created} created / ${x_tier1.skipped} skipped / ${x_tier1.noise} noise${x_tier1.rate_limited ? " [RATE LIMITED]" : ""}`,
        xTier1Error,
      );
    }

    // ── 5f. X/Twitter — Tier 2 beats (active hours only) ──────────────────────
    const hourET = (new Date().getUTCHours() - 5 + 24) % 24;
    const isTier2Window = hourET >= 8 && hourET < 24;

    let x_tier2: { created: number; skipped: number; noise: number; rate_limited: boolean } | null = null;
    if (isTier2Window && !x_tier1.rate_limited) {
      let xTier2Error: string | undefined;
      x_tier2 = await ingestXTier2().catch((e: Error) => {
        xTier2Error = e.message;
        console.error("[ingestion] X tier2 error:", e.message);
        return { created: 0, skipped: 0, noise: 0, rate_limited: false };
      });

      logIngestion(
        "XTier2",
        runId,
        "x.com",
        `X Tier2: ${x_tier2.created} created / ${x_tier2.skipped} skipped / ${x_tier2.noise} noise${x_tier2.rate_limited ? " [RATE LIMITED]" : ""}`,
        xTier2Error,
      );
    }

    // ── 5g. Sports RSS feeds (PFT, Rotowire, ESPN RSS, NFL.com) ──────────────
    let sportsRSSError: string | undefined;
    const sports_rss = await ingestSportsRSSFeeds().catch((e: Error) => {
      sportsRSSError = e.message;
      console.error("[ingestion] Sports RSS error:", e.message);
      return { created: 0, skipped: 0 };
    });
 
    logIngestion(
      "SportsRSS",
      runId,
      "rss-feeds",
      `Sports RSS: ${sports_rss.created} created / ${sports_rss.skipped} skipped`,
      sportsRSSError,
    );
 
    // ── 5h. LockedOn podcast feeds (all 32 NFL teams + top CFB programs) ─────
    let lockedonError: string | undefined;
    const lockedon = await ingestLockedOnFeeds().catch((e: Error) => {
      lockedonError = e.message;
      console.error("[ingestion] LockedOn feeds error:", e.message);
      return { created: 0, skipped: 0 };
    });
 
    logIngestion(
      "LockedOn",
      runId,
      "lockedon-podcasts",
      `LockedOn: ${lockedon.created} created / ${lockedon.skipped} skipped`,
      lockedonError,
    );

    // ── 6. Process all new RawEvents ───────────────────────
    let processorError: string | undefined;
    const processed = await runProcessorSerialized().catch(e => {
      processorError = e.message;
      console.error("[ingestion] Processor error:", e.message);
      return { processed: 0, errors: 0 };
    });

    // ── 7. Dispatch alerts for newly scored signals ──────────
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

    // ── 8. Settle any games that are now final ───────────────
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
      `NBA inj: ${nba_injuries.created} · MLB txn: ${mlb_transactions.created} · MLB SP: ${mlb_pitchers.created} · CFB SID: ${cfb_sid.created} · ` +
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
      cfb_sid_created:  cfb_sid.created,
      on3_created:      on3.created,
      sports247_created: sports247.created,
      x_tier1_created: x_tier1.created,
      x_tier2_created: x_tier2?.created ?? 0,
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
      nfl_transactions,
      cfb_transactions,
      cfb_sid,
      on3,
      sports247,
      x_tier1,
      x_tier2,
      sports_rss,
      lockedon,
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

/* ─── Fast-tier cycle (5 min): tier1 sources only ─────────── */
//
// The timing-advantage path. School SID feeds and tier1 national reporters
// are where EdgeSetter beats the 20–60 minute wire-service lag — polling them
// every 5 minutes instead of 15 turns a seconds-wide win into a minutes-wide one.
// Runs on its own mutex so a slow standard cycle never delays it.

export async function runFastIngestionCycle(): Promise<{
  cfb_sid: { created: number; skipped: number };
  x_tier1: { created: number; skipped: number; noise: number; rate_limited: boolean };
  processed: { processed: number; errors: number };
}> {
  if (_fastRunning) {
    console.log("[ingestion] Fast cycle already running — skipping");
    return {
      cfb_sid: { created: 0, skipped: 0 },
      x_tier1: { created: 0, skipped: 0, noise: 0, rate_limited: false },
      processed: { processed: 0, errors: 0 },
    };
  }

  _fastRunning = true;
  const start = Date.now();
  const runId = crypto.randomUUID();

  logIngestion("FastStart", runId, runId, "Fast-tier cycle started — X tier1 nationals + CFB school SID feeds");

  try {
    let xTier1Error: string | undefined;
    let cfbSIDError: string | undefined;
    const [x_tier1, cfb_sid] = await Promise.all([
      ingestXTier1().catch((e: Error) => {
        xTier1Error = e.message;
        console.error("[ingestion] X tier1 error:", e.message);
        return { created: 0, skipped: 0, noise: 0, rate_limited: false };
      }),
      ingestCFBSchoolSIDFeeds().catch((e: Error) => {
        cfbSIDError = e.message;
        console.error("[ingestion] CFB SID feeds error:", e.message);
        return { created: 0, skipped: 0 };
      }),
    ]);

    logIngestion(
      "FastTier",
      runId,
      "x.com+cfb-school-sources",
      `X Tier1: ${x_tier1.created} created / ${x_tier1.skipped} skipped${x_tier1.rate_limited ? " [RATE LIMITED]" : ""} · SID feeds: ${cfb_sid.created} created / ${cfb_sid.skipped} skipped across ${POWER4_SOURCES.length} schools`,
      [xTier1Error, cfbSIDError].filter(Boolean).join("; ") || undefined,
    );

    // Process + alert immediately — detection without dispatch wins nothing
    let processorError: string | undefined;
    const processed = await runProcessorSerialized().catch(e => {
      processorError = e.message;
      console.error("[ingestion] Fast processor error:", e.message);
      return { processed: 0, errors: 0 };
    });

    const alertResult = await dispatchSignalAlerts().catch(e => {
      console.error("[ingestion] Fast alert dispatch error:", e.message);
      return { dispatched: 0, users_notified: 0 };
    });
    if (alertResult.dispatched > 0) {
      console.log(`[ingestion] Fast alerts: ${alertResult.dispatched} signals → ${alertResult.users_notified} users`);
    }

    const elapsed = Date.now() - start;
    const summary =
      `${elapsed}ms — X1: ${x_tier1.created} · SID: ${cfb_sid.created} · ` +
      `processed: ${processed.processed} · alerts: ${alertResult.dispatched}`;

    console.log(`[ingestion] Fast cycle complete in ${summary}`);
    logIngestion("FastComplete", runId, runId, summary, processorError);

    recordPipelineHealth("ingestion_fast", processed.errors > 0 ? "warning" : "ok", {
      elapsed_ms:      elapsed,
      x_tier1_created: x_tier1.created,
      cfb_sid_created: cfb_sid.created,
      processed:       processed.processed,
      errors:          processed.errors,
    });

    return { cfb_sid, x_tier1, processed };
  } catch (e: any) {
    const elapsed = Date.now() - start;
    const msg = e?.message ?? String(e);
    console.error("[ingestion] Fast cycle failed:", msg);
    logIngestion("FastFailed", runId, runId, `Fast cycle failed after ${elapsed}ms`, msg);
    throw e;
  } finally {
    _fastRunning = false;
  }
}

/* ─── Start the scheduler ────────────────────────────────── */

export function startIngestionScheduler() {
  const FAST_INTERVAL_MS     = 5 * 60 * 1000;   // tier1 + SID — the timing-advantage tier
  const STANDARD_INTERVAL_MS = 15 * 60 * 1000;  // tier2–5, aggregators, odds, settlement

  // First run: 45 seconds after server start (let DB warm up)
  const INITIAL_DELAY_MS = 45_000;

  // Active hours: 7am–1am ET = 12:00–06:00 UTC
  const isActiveHours = () => {
    const hourUTC = new Date().getUTCHours();
    return hourUTC >= 12 || hourUTC < 7;
  };

  setTimeout(async () => {
    console.log("[ingestion] Starting initial cycle...");
    await runIngestionCycle(); // full first run, fast tier included

    // Standard tier: everything except tier1 sources (fast tier owns those)
    setInterval(async () => {
      if (!isActiveHours()) {
        console.log("[ingestion] Off-hours — skipping standard cycle");
        logIngestion("Skipped", "scheduler", "scheduler", `Off-hours at ${new Date().getUTCHours()}:00 UTC — standard cycle skipped`);
        return;
      }
      await runIngestionCycle({ includeFastTier: false }).catch(e => {
        console.error("[ingestion] Standard cycle error:", e.message);
      });
    }, STANDARD_INTERVAL_MS);

    // Fast tier: tier1 nationals + school SID feeds, every 5 minutes
    setInterval(async () => {
      if (!isActiveHours()) return; // quiet skip — 12 log lines/hour off-hours is noise
      await runFastIngestionCycle().catch(e => {
        console.error("[ingestion] Fast cycle error:", e.message);
      });
    }, FAST_INTERVAL_MS);

  }, INITIAL_DELAY_MS);

  console.log(`[ingestion] Scheduler started — first run in ${INITIAL_DELAY_MS / 1000}s, then fast tier every ${FAST_INTERVAL_MS / 60000}m, standard tier every ${STANDARD_INTERVAL_MS / 60000}m`);
}
