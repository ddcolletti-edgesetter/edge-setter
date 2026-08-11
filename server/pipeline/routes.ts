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
  listReplayAuditsByGameId,
  getReplayAuditByReplayHash,
  type ReplayAuditRow,
} from "./store";
import { processRawEvents, processOne } from "./processor";
import { runIngestionCycle } from "./ingestion";
import { listCanonicalSituationApiResponses, type CanonicalSituationOrderBy } from "./situations-api";
import { ingestNFLInjuries } from "./adapters/espn-nfl";
import { ingestCFBInjuries } from "./adapters/espn-cfb";
import { ingestOdds } from "./adapters/the-odds-api";
import { settleGame, autoSettleFinishedGames, computeSourceAccuracy } from "./settlement";
import { runFullBackfill, getBackfillStatus } from "./backfill";
import { runCalibration, getStoredCalibration } from "./calibration";
import { computeSpreadOrTotalClv } from "./clv";
import type { League, RawEventType } from "./types";
import { getReplayState } from "./replay";
const REPLAY_INTELLIGENCE_RESTORATION_PERSISTED_AT = "2026-01-03T00:00:00.000Z";
const REPLAY_INTELLIGENCE_RESTORATION_RECOVERED_AT = "2026-01-04T00:00:00.000Z";
const REPLAY_INTELLIGENCE_RESTORATION_RESTORED_AT = "2026-01-05T00:00:00.000Z";
const REPLAY_INTELLIGENCE_REPLAYBACK_REPLAYED_AT = "2026-01-06T00:00:00.000Z";
const REPLAY_INTELLIGENCE_AUDIT_GENERATED_AT = "2026-01-01T00:00:00.000Z";

function requireAdmin(req: Request, res: Response): boolean {
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim() || null;
  if (!ADMIN_PASSWORD) {
    res.status(503).json({ error: "Admin auth not configured" });
    return false;
  }
  const authHeader = req.headers.authorization ?? "";
  const pw = authHeader.startsWith("Bearer ") ? authHeader.slice(7)
    : (req.body?.password ?? (req.query as any).password);
  if (pw !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function latestReplayHashForGame(gameId: string): string | null {
  return listReplayAuditsByGameId(gameId)[0]?.replay_hash ?? null;
}

function queryString(req: Request, key: string): string | null {
  const value = req.query[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

export function registerPipelineRoutes(app: Express) {

  // SECURITY: the /api/replay and /api/replay-intelligence surface (~90 routes)
  // exposes internal forensic/diagnostic tooling for the replay subsystem.
  // These were left unguarded during initial development and one sibling family
  // (/api/replay-intelligence/exports*) was found leaking data unauthenticated
  // in production (fixed commit f0c4452, July 2026). Rather than leave the rest
  // open pending a per-route consumer audit, guard the whole prefix now.
  // If any legitimate external caller needs one of these routes, add an
  // explicit allowlist here rather than removing this guard.
  app.use(["/api/replay"], (req: Request, res: Response, next) => {
    if (!requireAdmin(req, res)) return;
    next();
  });

  /* ══════════════════════════════════════════════════════
     DELIVERY API — public
     ══════════════════════════════════════════════════════ */
  /**
   * GET /api/replay/audits/:gameId
   *
   * Lists persisted replay audits for a game, newest first.
   */














  /**
   * GET /api/replay/audit/:replayHash
   *
   * Returns the latest persisted audit row for a replay hash.
   */

  /**
   * GET /api/replay/verification/:replayHash/latest
   *
   * Returns the latest verification record for a replay hash.
   */

  /**
   * GET /api/replay/verification/:replayHash/history
   *
   * Lists verification records for a replay hash, newest first.
   */

  /**
   * GET /api/replay/provenance/:replayHash
   *
   * Returns provenance metadata for a replay hash.
   */

  /**
   * GET /api/replay/lineage/:replayHash/children
   *
   * Lists child replay audits that reference the provided replay hash as parent.
   */

  /**
   * GET /api/replay/lineage/:replayHash/parents
   *
   * Traverses parent replay audits from the provided child replay hash.
   */

  /**
   * GET /api/replay/divergence/:replayHash/history
   *
   * Lists persisted replay divergence analyses, newest first.
   */

  /**
   * GET /api/replay/divergence/:replayHash/latest
   *
   * Returns the latest persisted replay divergence analysis.
   */

  /**
   * GET /api/replay/divergence/:replayHash
   *
   * Deterministic replay divergence analytics.
   */

  /**
   * GET /api/replay/confidence/:replayHash
   *
   * Returns deterministic replay confidence propagation.
   */

  /**
   * GET /api/replay/forensics/:replayHash
   *
   * Returns deterministic replay audit inspection data.
   */

  /**
   * GET /api/replay/:gameId/forensic/export
   *
   * Returns the latest replay forensic export bundle for a game.
   */

  /**
   * GET /api/replay/:gameId/forensic/report
   *
   * Returns the latest replay forensic overview report for a game.
   */

  /**
   * GET /api/replay/:gameId/forensic/lineage
   *
   * Returns the latest lineage-aware forensic package for a game.
   */

  /**
   * GET /api/replay/:gameId/forensic/confidence
   *
   * Returns the latest replay forensic confidence summary for a game.
   */

  /**
   * GET /api/replay/:gameId
   *
   * Deterministic replay reconstruction endpoint.
   *
   * Query params:
   *   asOf — optional ISO timestamp replay cutoff
   */
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
    const { league, since, band, type } = req.query as {
      league?: string;
      since?: string;
      band?: string;
      type?: string;
    };
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 0), 200);
    // band/type aren't SQL-filterable in getLiveSignals, so when either is
    // requested, over-fetch before filtering — otherwise filtering after an
    // already-limited query can silently drop matches that exist just
    // outside the fetched window.
    const needsPostFilter = Boolean(band || type);
    let signals = getLiveSignals({ league, since, limit: needsPostFilter ? 500 : limit });
    if (band) signals = signals.filter((s) => s.score_band === band);
    if (type) signals = signals.filter((s) => s.signal_type === type);
    if (needsPostFilter) signals = signals.slice(0, limit);
    return res.json({ signals });
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
   * GET /api/v2/situations
   *
   * Canonical situation feed for future board/homepage use.
   * Signals remain the public delivery surface during the transition.
   */
  app.get("/api/v2/situations", (req: Request, res: Response) => {
    const {
      league,
      sport,
      situation_type,
      situationType,
      state,
      lifecycle_state,
      active_only,
      activeOnly,
      order_by,
      orderBy,
    } = req.query as {
      league?: string;
      sport?: string;
      situation_type?: string;
      situationType?: string;
      state?: string;
      lifecycle_state?: string;
      active_only?: string;
      activeOnly?: string;
      order_by?: CanonicalSituationOrderBy;
      orderBy?: CanonicalSituationOrderBy;
    };
    const limit = Math.min(Math.max(Number(req.query.limit ?? 100), 0), 250);
    const validOrder = new Set(["operational_visibility_score", "escalation_score", "confidence", "updated_at"]);
    const requestedOrder = order_by ?? orderBy;
    const requestedActiveOnly = active_only ?? activeOnly;
    const situations = listCanonicalSituationApiResponses({
      league,
      sport,
      situationType: situation_type ?? situationType,
      lifecycleState: state ?? lifecycle_state,
      activeOnly: requestedActiveOnly === "true" || requestedActiveOnly === "1",
      orderBy: validOrder.has(requestedOrder ?? "") ? requestedOrder : "updated_at",
      limit,
    });
    return res.json({ count: situations.length, situations });
  });

  /**
   * GET /api/v2/situations/:id
   *
   * Returns a single canonical situation by id.
   * Note: pipeline.db location is controlled by PIPELINE_DATA_DIR env var.
   * On Render with a persistent disk mounted, situation data survives dyno restarts.
   */
  app.get("/api/v2/situations/:id", (req: Request, res: Response) => {
    const rawId = routeParam(req.params.id);
    const id = rawId.replace(/^canonical-/, "");
    const all = listCanonicalSituationApiResponses({ limit: 500 });
    const situation = all.find((s) => s.id === id);
    if (!situation) {
      return res.status(404).json({
        error: "Situation not found.",
      });
    }
    return res.json(situation);
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
   *   "password": "<ADMIN_PASSWORD env value>",
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
   *   weather_update | scheme_note | transaction | eligibility_ruling | manual
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
      "weather_update", "scheme_note", "transaction", "eligibility_ruling", "manual", "odds_open",
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
   * Body: { "password": "<ADMIN_PASSWORD env value>" }
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
   * POST /api/internal/nfl-keepalive-a7x9k
   *
   * Unauthenticated ingest trigger for UptimeRobot keepalive.
   * Obscured path is the only protection — do not publicize this URL.
   * Triggers the same NFL ingest cycle as the admin route.
   */
  app.post("/api/internal/nfl-keepalive-a7x9k", async (req: Request, res: Response) => {
    try {
      const [odds, injuries] = await Promise.all([
        ingestOdds("NFL").catch((e: any) => ({ games: 0, events: 0, error: e.message })),
        ingestNFLInjuries().catch((e: any) => ({ created: 0, skipped: 0, error: e.message })),
      ]);
      const processed = await processRawEvents().catch((e: any) => ({ processed: 0, errors: 0 }));
      return res.json({ success: true, source: "keepalive", odds, injuries, processed });
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
   *   "password": "<ADMIN_PASSWORD env value>",
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
   * GET /api/replay/audits/:gameId
   *
   * Lists persisted replay audits for a game, newest first.
   */
  app.get("/api/replay/audits/:gameId", (req: Request, res: Response) => {
    const gameId = routeParam(req.params.gameId);
    if (!gameId) return res.status(400).json({ error: "gameId is required" });

    const audits = listReplayAuditsByGameId(gameId);
    const response: { game_id: string; count: number; audits: ReplayAuditRow[] } = {
      game_id: gameId,
      count: audits.length,
      audits,
    };

    return res.json(response);
  });

  /**
   * GET /api/replay/audit/:replayHash
   *
   * Returns the latest persisted audit row for a replay hash.
   */
  app.get("/api/replay/audit/:replayHash", (req: Request, res: Response) => {
    const replayHash = routeParam(req.params.replayHash);
    if (!replayHash) return res.status(400).json({ error: "replayHash is required" });

    const audit = getReplayAuditByReplayHash(replayHash);
    if (!audit) return res.status(404).json({ error: "Replay audit not found" });

    const response: { audit: ReplayAuditRow } = { audit };
    return res.json(response);
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

  /* ══════════════════════════════════════════════════════
     VISION WEBHOOK — Manako Vision Agent ingest
     ══════════════════════════════════════════════════════ */

  /**
   * POST /api/signals/vision
   *
   * Receives Manako Vision Agent structured event payloads.
   * Verified via HMAC-SHA256 signature in x-manako-signature header.
   * Acknowledges in <500ms; ingest runs async.
   *
   * Body: ManakoEvent JSON
   */
  app.post("/api/signals/vision", async (req: Request, res: Response) => {
    const { verifyManakoSignature } = await import("../auth/manakoWebhook");
    const { mapManakoEvent } = await import("./manakoMapper");
    const { ingestVisualSignal } = await import("./visualIngest");

    const signature = (req.headers["x-manako-signature"] as string | undefined) ?? null;
    const rawBody = ((req as any).rawBody as Buffer | undefined)?.toString("utf8") ?? JSON.stringify(req.body);

    if (!verifyManakoSignature(signature, process.env.MANAKO_WEBHOOK_SECRET, rawBody)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const signal = mapManakoEvent(req.body);
    if (!signal) {
      console.log("[Manako] Unmapped output_label:", req.body?.output_label);
      return res.json({ status: "discarded" });
    }

    // Acknowledge immediately — ingest async to stay under 500ms
    ingestVisualSignal(signal).catch((err: any) => console.error("[Manako ingest error]", err));
    return res.json({ status: "accepted" });
  });

  console.log("[pipeline] Routes registered");
}
