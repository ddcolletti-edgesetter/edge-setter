/**
 * Edge Setter — Pipeline API Routes  (Sprint 7–9)
 *
 * Registers all pipeline endpoints on the Express app:
 *
 *   Delivery (public)
 *   ─────────────────
 *   GET  /api/v2/signals              — filtered signal feed
 *   GET  /api/v2/signals/:id          — signal detail
 *   GET  /api/v2/games                — today's games
 *   GET  /api/stats/track-record      — aggregate hit-rate + CLV stats per league
 *
 *   Ingestion (admin-gated)
 *   ──────────────────────
 *   POST /api/pipeline/ingest/manual  — operator creates a RawEvent by hand
 *   POST /api/pipeline/ingest/run     — trigger a full ingest + process cycle
 *   GET  /api/pipeline/raw-events     — view raw events (admin)
 *   GET  /api/pipeline/status         — pipeline health summary
 *
 *   Outcomes
 *   ────────
 *   POST /api/outcomes                — record an outcome + auto-compute CLV
 *   GET  /api/outcomes/:signal_id     — get outcomes for a signal
 */

import type { Express, Request, Response } from "express";
import {
  getLiveSignals, getLiveSignal,
  getGames, getRawEvents, insertRawEvent,
  createOutcome, getOutcomes,
  getTrackRecord, getPipelineDb,
} from "./store";
import { processRawEvents, processOne } from "./processor";
import { runIngestionCycle } from "./ingestion";
import { ingestNFLInjuries } from "./adapters/espn-nfl";
import { ingestCFBInjuries } from "./adapters/espn-cfb";
import { ingestOdds } from "./adapters/the-odds-api";
import { settleGame, autoSettleFinishedGames, computeSourceAccuracy } from "./settlement";
import { runFullBackfill, getBackfillStatus } from "./backfill";
import { runCalibration, getStoredCalibration } from "./calibration";
import type { League, RawEventType } from "./types";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "edgesetter-admin-2026";

function requireAdmin(req: Request, res: Response): boolean {
  const authHeader = req.headers.authorization ?? "";
  const pw = authHeader.startsWith("Bearer ") ? authHeader.slice(7)
    : (req.body?.password ?? (req.query as any).password);
  if (pw !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export function registerPipelineRoutes(app: Express) {

  /* ══════════════════════════════════════════════════════
     DELIVERY API — public
     ══════════════════════════════════════════════════════ */

  /**
   * GET /api/v2/signals
   *
   * Query params:
   *   league  — NBA | MLB | NFL | CFB
   *   since   — ISO timestamp (e.g. 2026-04-26T00:00:00Z)
   *   limit   — default 50, max 200
   *   band    — Elite | Strong | Watchlist | Informational
   *   type    — signal_type filter
   *
   * Returns: LiveSignal[] sorted by score DESC
   *
   * Example:
   *   GET /api/v2/signals?league=NBA&limit=20
   *   GET /api/v2/signals?since=2026-04-26T12:00:00Z&band=Elite
   */
  app.get("/api/v2/signals", (req: Request, res: Response) => {
    const { league, since, band, type } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Number(req.query.limit ?? 50), 200);

    const pdb = getPipelineDb();
    const conds: string[] = [];
    const params: unknown[] = [];
    if (league) { conds.push("league=?"); params.push(league); }
    if (since)  { conds.push("created_at>=?"); params.push(since); }
    if (band)   { conds.push("score_band=?"); params.push(band); }
    if (type)   { conds.push("signal_type=?"); params.push(type); }
    const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
    const rows = pdb.prepare(
      `SELECT * FROM live_signals ${where} ORDER BY created_at DESC LIMIT ?`
    ).all(...params, limit) as any[];

    const signals = rows.map(row => ({
      ...row,
      sources: JSON.parse(row.sources ?? "[]"),
      line_movement: row.line_movement ? JSON.parse(row.line_movement) : null,
      breakdown: JSON.parse(row.breakdown ?? "{}"),
      raw_event_ids: JSON.parse(row.raw_event_ids ?? "[]"),
      betting_relevance: row.betting_relevance === 1,
      fantasy_relevance: row.fantasy_relevance === 1,
    }));

    res.json({ count: signals.length, signals });
  });

  /**
   * GET /api/v2/signals/:id
   *
   * Returns: LiveSignal with full breakdown
   *
   * Example:
   *   GET /api/v2/signals/550e8400-e29b-41d4-a716-446655440000
   */
  app.get("/api/v2/signals/:id", (req: Request, res: Response) => {
    const signal = getLiveSignal(req.params.id as string);
    if (!signal) return res.status(404).json({ error: "Signal not found" });
    return res.json(signal);
  });

  /**
   * GET /api/v2/games
   *
   * Query params:
   *   league  — NBA | MLB | NFL | CFB
   *
   * Example:
   *   GET /api/v2/games?league=MLB
   */
  app.get("/api/v2/games", (req: Request, res: Response) => {
    const { league } = req.query as { league?: string };
    const games = getGames(league);
    res.json({ count: games.length, games });
  });

  /* ══════════════════════════════════════════════════════
     INGESTION API — admin-gated
     ══════════════════════════════════════════════════════ */

  /**
   * POST /api/pipeline/ingest/manual
   *
   * Creates a RawEvent by hand (operator use).
   * The event is immediately processed into a LiveSignal.
   *
   * Body:
   * {
   *   "password": "edgesetter-admin-2026",
   *   "league": "NBA",
   *   "team": "BOS",
   *   "player": "Jayson Tatum",
   *   "event_type": "injury_update",
   *   "payload": {
   *     "designation": "Questionable",
   *     "body_part": "ankle",
   *     "notes": "Tatum tweaked ankle in practice — status TBD.",
   *     "confidence": 72,
   *     "confirmation": "Developing",
   *     "source_types": ["beat_reporter"],
   *     "source_labels": ["ESPN Adrian Wojnarowski"],
   *     "source_count": 1,
   *     "sources": [{ "name": "ESPN Woj", "type": "beat_reporter" }]
   *   }
   * }
   *
   * Returns: { raw_event, signal }
   *
   * Supported event_types:
   *   injury_update | lineup_confirm | lineup_change | line_move |
   *   weather_update | scheme_note | transaction | manual
   */
  app.post("/api/pipeline/ingest/manual", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;

    const { league, team, player, event_type, game_id, payload } = req.body;
    if (!league || !event_type || !payload) {
      return res.status(400).json({ error: "league, event_type, and payload are required" });
    }

    const VALID_LEAGUES = ["NBA", "MLB", "NFL", "CFB"];
    const VALID_TYPES: RawEventType[] = [
      "injury_update", "lineup_confirm", "lineup_change", "line_move",
      "weather_update", "scheme_note", "transaction", "manual", "odds_open",
    ];

    if (!VALID_LEAGUES.includes(league)) {
      return res.status(400).json({ error: `Invalid league. Must be one of: ${VALID_LEAGUES.join(", ")}` });
    }
    if (!VALID_TYPES.includes(event_type)) {
      return res.status(400).json({ error: `Invalid event_type. Must be one of: ${VALID_TYPES.join(", ")}` });
    }

    try {
      const raw = insertRawEvent({
        source_id: "operator",
        source_type: "manual",
        league: league as League,
        game_id: game_id ?? null,
        team: team ?? null,
        player: player ?? null,
        event_type: event_type as RawEventType,
        payload,
      });

      // Process immediately
      const signal = await processOne(raw);

      return res.json({
        success: true,
        raw_event: raw,
        signal,
      });
    } catch (err: any) {
      console.error("[pipeline/manual]", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/pipeline/ingest/run
   *
   * Triggers a full ingest + process cycle (all adapters).
   * Admin-gated. Useful for on-demand refresh without waiting for scheduler.
   *
   * Body: { "password": "edgesetter-admin-2026" }
   */
  app.post("/api/pipeline/ingest/run", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const result = await runIngestionCycle();
      return res.json({ success: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/pipeline/ingest/nfl
   *
   * Manually trigger NFL odds + injury ingestion (bypasses season guard).
   * Useful for preseason testing or on-demand refresh.
   *
   * Body: { "password": "..." }
   */
  app.post("/api/pipeline/ingest/nfl", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const [odds, injuries] = await Promise.all([
        ingestOdds("NFL").catch(e => ({ games: 0, events: 0, error: e.message })),
        ingestNFLInjuries().catch(e => ({ created: 0, skipped: 0, error: e.message })),
      ]);
      const processed = await processRawEvents().catch(e => ({ processed: 0, errors: 0 }));
      return res.json({ success: true, odds, injuries, processed });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/pipeline/ingest/cfb
   *
   * Manually trigger CFB odds + injury ingestion (bypasses season guard).
   *
   * Body: { "password": "..." }
   */
  app.post("/api/pipeline/ingest/cfb", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const [odds, injuries] = await Promise.all([
        ingestOdds("CFB").catch(e => ({ games: 0, events: 0, error: e.message })),
        ingestCFBInjuries().catch(e => ({ created: 0, skipped: 0, error: e.message })),
      ]);
      const processed = await processRawEvents().catch(e => ({ processed: 0, errors: 0 }));
      return res.json({ success: true, odds, injuries, processed });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/pipeline/process
   *
   * Runs the processor against all pending unprocessed RawEvents.
   * Admin-gated. Useful if ingestion ran but processor was skipped.
   */
  app.post("/api/pipeline/process", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const result = await processRawEvents();
      return res.json({ success: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/pipeline/raw-events
   *
   * View raw events (admin). Useful for debugging the pipeline.
   *
   * Query params:
   *   league    — filter by league
   *   processed — "true" | "false" | unset (all)
   *   limit     — default 50
   */
  app.get("/api/pipeline/raw-events", (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const { league } = req.query as { league?: string };
    const processed = req.query.processed === "true" ? true
      : req.query.processed === "false" ? false
      : undefined;
    const limit = Math.min(Number(req.query.limit ?? 50), 500);

    const events = getRawEvents({ league: league as League | undefined, processed, limit });
    return res.json({ count: events.length, events });
  });

  /**
   * GET /api/pipeline/status
   *
   * Pipeline health summary — useful for the ops dashboard.
   */
  app.get("/api/pipeline/status", (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const pending = getRawEvents({ processed: false, limit: 500 });
    const recent = getLiveSignals({ limit: 20 });
    const byLeague = { NBA: 0, MLB: 0, NFL: 0, CFB: 0 } as Record<string, number>;
    recent.forEach(s => { byLeague[s.league] = (byLeague[s.league] ?? 0) + 1; });

    return res.json({
      pending_raw_events: pending.length,
      recent_signals_count: recent.length,
      signals_by_league: byLeague,
      top_signal: recent[0] ?? null,
    });
  });

  /* ══════════════════════════════════════════════════════
     OUTCOMES — CLV computation implemented
     ══════════════════════════════════════════════════════ */

  /**
   * POST /api/outcomes
   *
   * Record the final result for a game market and auto-compute CLV.
   *
   * CLV model:
   *   For spreads and totals:
   *     clv_points = line_at_signal − closing_line
   *     Positive  = we got the better number (beat the close)
   *     Negative  = market moved against us
   *
   *   For moneylines:
   *     clv_points = null (not yet computed — moneyline CLV deferred)
   *
   *   Pure scheme/context signals with no numeric market:
   *     clv_points = null
   *
   * Body:
   * {
   *   "password": "edgesetter-admin-2026",
   *   "signal_id": "<uuid>",
   *   "game_id": "<game_id>",
   *   "market": "spread",         // spread | total | moneyline
   *   "home_score": 112,
   *   "away_score": 108,
   *   "line_at_signal": -6.5,     // line when signal was generated
   *   "closing_line": -7.5,       // line at game start
   *   "actual_result": 4,
   *   "hit": true
   * }
   *
   * Response includes computed clv_points.
   */
  app.post("/api/outcomes", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const { signal_id, game_id, market, home_score, away_score,
            line_at_signal, closing_line, actual_result, hit } = req.body;

    if (!signal_id || !game_id) {
      return res.status(400).json({ error: "signal_id and game_id are required" });
    }

    // ── CLV computation ────────────────────────────────────────
    //
    // CLV is only meaningful for numeric markets (spread / total).
    // Moneyline CLV requires implied-probability conversion — deferred.
    // Pure context signals with no numeric line → null.
    //
    let computedClv: number | null = null;
    const mkt: string = market ?? "spread";

    if ((mkt === "spread" || mkt === "total")
        && line_at_signal != null && closing_line != null) {
      // line_at_signal: the number we recommended acting on.
      // closing_line:   the market's final number at game time.
      //
      // For spreads — positive means we got the better number:
      //   e.g. signal said -3, closed -5 → we beat the close by 2 pts → +2.0
      //   e.g. signal said -6.5, closed -5 → market moved in our favour? No —
      //        the team is now a smaller fav, so we would have gotten more points
      //        at the close. This convention tracks: did the market validate us?
      //
      // Convention: clv_points = line_at_signal − closing_line
      //   Works for spreads (neg fav): signal=-3, close=-5 → -3−(−5) = +2 (we beat close)
      //   Works for totals: signal=220, close=224 → -4 (over bettor took worse number)
      //
      const rawClv = (line_at_signal as number) - (closing_line as number);
      // Round to 1 decimal; cap at ±20 to guard against data entry errors
      computedClv = Math.min(20, Math.max(-20, Math.round(rawClv * 10) / 10));
    }
    // Moneyline CLV: deferred (not yet computed)
    // if (mkt === "moneyline") { ... }

    try {
      const outcome = createOutcome({
        signal_id,
        game_id,
        market: mkt as "spread" | "total" | "moneyline",
        home_score: home_score ?? null,
        away_score: away_score ?? null,
        line_at_signal: line_at_signal ?? null,
        closing_line: closing_line ?? null,
        actual_result: actual_result ?? null,
        hit: hit ?? null,
        clv: computedClv,
        recorded_at: new Date().toISOString(),
      });

      return res.json({
        success: true,
        outcome,
        clv_computed: computedClv !== null,
        clv_points: computedClv,
        clv_note: computedClv !== null
          ? `${computedClv > 0 ? "+" : ""}${computedClv} pts vs closing line (${computedClv > 0 ? "beat the close" : "market moved against signal"})`
          : mkt === "moneyline"
            ? "Moneyline CLV deferred — use clv_cents when implemented"
            : "No numeric line available — CLV not applicable for this signal type",
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/outcomes/:signal_id
   *
   * Get all outcomes recorded for a given signal.
   */
  app.get("/api/outcomes/:signal_id", (req: Request, res: Response) => {
    const signalId: string = req.params.signal_id as string;
    const outcomes = getOutcomes(signalId);
    return res.json({ count: outcomes.length, outcomes });
  });

  /**
   * GET /api/stats/track-record?league=NBA
   *
   * Returns aggregate hit-rate + avg CLV for a league (overall + per signal_type).
   * Window: all-time (no date filter). Only settled outcomes (hit IS NOT NULL) count.
   * Moneyline CLV is deferred so avg_clv_points excludes null clv rows.
   *
   * No auth required — display-only, no sensitive data.
   */
  app.get("/api/stats/track-record", (req: Request, res: Response) => {
    const league = (req.query.league as string ?? "").toUpperCase();
    const VALID = ["NBA", "MLB", "NFL", "CFB"];
    if (!VALID.includes(league)) {
      return res.status(400).json({
        error: `league must be one of: ${VALID.join(", ")}.`,
      });
    }
    try {
      const record = getTrackRecord(league);
      return res.json(record);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /* ══════════════════════════════════════════════════════
     SETTLEMENT — admin-gated
     ══════════════════════════════════════════════════════ */

  /**
   * POST /api/pipeline/settle
   *
   * Fetch final scores from NBA + MLB APIs and auto-settle all
   * signals for completed games. Recomputes source accuracy table.
   *
   * Body: { "password": "..." }
   *
   * This is also called automatically at the end of each ingestion cycle.
   */
  app.post("/api/pipeline/settle", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const result = await autoSettleFinishedGames();
      computeSourceAccuracy();
      return res.json({ success: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/pipeline/settle/:game_id
   *
   * Manually settle a specific game by providing the final scores.
   * Use this when auto-settlement misses a game (e.g. NFL/CFB with no adapter).
   *
   * Body:
   * {
   *   "password": "...",
   *   "home_score": 28,
   *   "away_score": 21
   * }
   */
  app.post("/api/pipeline/settle/:game_id", (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const { home_score, away_score } = req.body;
    if (home_score == null || away_score == null) {
      return res.status(400).json({ error: "home_score and away_score are required" });
    }
    try {
      const gameId = Array.isArray(req.params.game_id) ? req.params.game_id[0] : req.params.game_id;
      const result = settleGame(gameId, Number(home_score), Number(away_score));
      computeSourceAccuracy();
      return res.json({ success: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/pipeline/recompute-accuracy
   *
   * Force-recompute source accuracy stats from existing settled outcomes.
   * Useful after manual outcome edits via POST /api/outcomes.
   */
  app.post("/api/pipeline/recompute-accuracy", (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      computeSourceAccuracy();
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /* ══════════════════════════════════════════════════════
     BACKFILL — admin-gated
     ══════════════════════════════════════════════════════ */

  /**
   * POST /api/pipeline/backfill
   *
   * Trigger the full historical backfill.
   * Re-entrant: completed phases are skipped automatically.
   * This is a long-running operation (~5–20 min for full backfill).
   *
   * Body (all optional — defaults run all seasons):
   * {
   *   "password": "...",
   *   "nfl":  { "seasons": [2024, 2025] },
   *   "cfb":  { "seasons": [2024, 2025] },
   *   "nba":  { "seasons": ["2024-25", "2025-26"] },
   *   "mlb":  { "seasons": [2025, 2026] },
   *   "skipProcessing": false,
   *   "skipSettlement": false,
   *   "resetPhases": ["MLB"]   // clear phase records before running (forces re-run)
   * }
   */
  app.post("/api/pipeline/backfill", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const { nfl, cfb, nba, mlb, skipProcessing, skipSettlement, resetPhases } = req.body ?? {};
      const result = await runFullBackfill({ nfl, cfb, nba, mlb, skipProcessing, skipSettlement, resetPhases });
      return res.json({ success: result.errors.length === 0, ...result });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/pipeline/backfill-status
   *
   * Returns the current state of each backfill phase.
   * No auth required — read-only progress display.
   */
  app.get("/api/pipeline/backfill-status", (_req: Request, res: Response) => {
    try {
      const phases = getBackfillStatus();
      const summary = {
        total: phases.length,
        done: phases.filter(p => p.status === "done").length,
        running: phases.filter(p => p.status === "running").length,
        error: phases.filter(p => p.status === "error").length,
        pending: phases.filter(p => p.status === "pending").length,
      };
      return res.json({ summary, phases });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /* ══════════════════════════════════════════════════════
     CALIBRATION — admin-gated
     ══════════════════════════════════════════════════════ */

  /**
   * POST /api/pipeline/calibrate
   *
   * Run the calibration engine against all settled outcomes.
   * Returns a CalibrationReport with component correlations and suggested weights.
   * Suggested weights are NOT auto-applied — review before changing scorer.ts.
   *
   * Body: { "password": "..." }
   */
  app.post("/api/pipeline/calibrate", (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const report = runCalibration();
      return res.json({ success: true, report });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/stats/accuracy-ledger
   *
   * Full accuracy ledger: hit rates and CLV by league, signal_type, and (optionally) season.
   * Sourced from the pipeline_source_accuracy table, populated by computeSourceAccuracy().
   *
   * Query params:
   *   league — filter to a specific league (NBA | MLB | NFL | CFB)
   *
   * No auth required — display-only.
   */
  app.get("/api/stats/accuracy-ledger", (req: Request, res: Response) => {
    try {
      const { league } = req.query as { league?: string };
      const db = getPipelineDb();

      const conds: string[] = [];
      const params: unknown[] = [];
      if (league) {
        const valid = ["NBA", "MLB", "NFL", "CFB"];
        if (!valid.includes(league.toUpperCase())) {
          return res.status(400).json({ error: `league must be one of: ${valid.join(", ")}` });
        }
        conds.push("league = ?");
        params.push(league.toUpperCase());
      }
      const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

      const rows = db.prepare(
        `SELECT * FROM pipeline_source_accuracy ${where} ORDER BY league, signal_type NULLS FIRST`
      ).all(...params) as any[];

      const calibration = getStoredCalibration();

      return res.json({
        count: rows.length,
        ledger: rows,
        calibration_available: calibration.length > 0,
        calibration_computed_at: calibration[0]?.computed_at ?? null,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  console.log("[pipeline] Routes registered");
}
