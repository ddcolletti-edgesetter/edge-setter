/**
 * Edge Setter — Outcome Settlement Engine
 *
 * FIXES (Session 18):
 *   1. computeSourceAccuracy() now aggregates per individual source (beat writer)
 *      by exploding the sources JSON array from each settled signal in Node.js.
 *   2. After recomputing accuracy, scores are synced to storage.db (persistent)
 *      via syncAccuracyToStorageDb() so leaderboard survives restarts.
 *   3. Active-hours check bug fixed in ingestion.ts (separate file).
 */

import { randomUUID } from "crypto";
import {
  getPipelineDb,
  getGame,
  updateGameFinal,
  getUnsettledSignalsForGame,
  getSettleable,
  getUnsettledSignalsWithoutGameId,
  findNextFinalGameForTeam,
  getCompletedUnfinalGames,
  createOutcome,
  linkOutcomeToSignal,
  expireNullGameSignal,
  takeCfbMatchStats,
  settlementWindowDays,
  archiveFinishedMarketSignals,
 getLatestSnapshotBefore,
getClosingSnapshot,
  getAllOddsSnapshotsForGame,
  getRawEventMarkets,
recordSignalStateChange,
getPipelineMeta,
setPipelineMeta,
} from "./store";
import { trackJob, forEachBounded } from "../event-loop-monitor";
import { fetchMLBFinalScores } from "./adapters/mlb-statsapi";
import { fetchNBAFinalScores } from "./adapters/espn-nba";
import { fetchNFLFinalScores } from "./adapters/espn-nfl";
import { fetchCFBFinalScores } from "./adapters/espn-cfb";
import { storage, insertSettledOutcome, getSettledOutcomesForAccuracy, markSettledOutcomesStale, countStaleSettledOutcomes, clearWithdrawnSettlementAccuracy } from "../storage";
import type { LiveSignal, Game, League } from "./types";
import { computeSpreadOrTotalClv } from "./clv";
import { gradeSignalV2, GRADING_VERSION, type GradingResult } from "./grading-v2";
import { kickoffGuardActiveFor } from "./adapters/the-odds-api";
import type { NoGradeReason, SettlementState } from "@shared/settlement-grading";

/* ─── Schema for source accuracy table ─────────────────── */

function ensureAccuracyTable(db: ReturnType<typeof getPipelineDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_source_accuracy (
      id            TEXT PRIMARY KEY,
      league        TEXT NOT NULL,
      signal_type   TEXT,
      source_type   TEXT,
      source_id     TEXT,
      source_name   TEXT,
      total_signals INTEGER NOT NULL DEFAULT 0,
      wins          INTEGER NOT NULL DEFAULT 0,
      losses        INTEGER NOT NULL DEFAULT 0,
      hit_rate      REAL,
      avg_clv       REAL,
      computed_at   TEXT NOT NULL
    );
  `);
  // Migrate: add source_id / source_name columns if this is an older DB
  const cols = (db.prepare("PRAGMA table_info(pipeline_source_accuracy)").all() as any[]).map((c: any) => c.name);
  if (!cols.includes("source_id"))   db.exec("ALTER TABLE pipeline_source_accuracy ADD COLUMN source_id TEXT");
  if (!cols.includes("source_name")) db.exec("ALTER TABLE pipeline_source_accuracy ADD COLUMN source_name TEXT");
}

/* ─── Deserialize a raw DB row into a LiveSignal ─────────── */

function deserializeSignal(row: any): LiveSignal {
  return {
    ...row,
    sources: JSON.parse(row.sources ?? "[]"),
    line_movement: row.line_movement ? JSON.parse(row.line_movement) : null,
    breakdown: JSON.parse(row.breakdown ?? "{}"),
    raw_event_ids: JSON.parse(row.raw_event_ids ?? "[]"),
    betting_relevance: row.betting_relevance === 1,
    fantasy_relevance: row.fantasy_relevance === 1,
  };
}

/* ─── Hit computation helpers ────────────────────────────── */

function favoriteCovers(game: Game, homeScore: number, awayScore: number): boolean | null {
  if (game.spread_line == null || !game.spread_team) return null;

  const spreadAbbr = game.spread_team.toUpperCase();
  const homeAbbr   = game.home_team.toUpperCase();
  const isHomeFav  = homeAbbr === spreadAbbr
    || homeAbbr.includes(spreadAbbr)
    || spreadAbbr.includes(homeAbbr);

  const favScore = isHomeFav ? homeScore : awayScore;
  const dogScore = isHomeFav ? awayScore : homeScore;
  const actualMargin = favScore - dogScore;

  return actualMargin + game.spread_line > 0;
}

interface SettleResult {
  hit: boolean | null;
  actualResult: number | null;
  market: "spread" | "total" | "moneyline";
  lineAtSignal: number | null;
  closingLine: number | null;
  clv: number | null;
}

function settleSignal(signal: LiveSignal, game: Game, homeScore: number, awayScore: number): SettleResult {
  const base: SettleResult = {
    hit: null, actualResult: null,
    market: "spread", lineAtSignal: null, closingLine: null, clv: null,
  };

  switch (signal.signal_type) {

    case "line_move": {
      const lm = signal.line_movement;
      if (!lm) return base;

      const signalSnapshot = getLatestSnapshotBefore(
        game.id,
        signal.created_at,
      );
      const closingSnapshot = getClosingSnapshot(game.id);

      const lineAtSignal = signalSnapshot?.spread_line ?? lm.open;
      const closingLine = closingSnapshot?.spread_line ?? null;

      if (lineAtSignal == null || closingLine == null) {
        return base;
      }

      const clv = computeSpreadOrTotalClv(lineAtSignal, closingLine)!;

      return {
        market: "spread",
        lineAtSignal,
        closingLine,
        clv,
        actualResult: homeScore - awayScore,
        hit: clv > 0,
      };
    }

    case "injury_update":
    case "lineup_change": {
      if (!signal.team || game.spread_line == null) return base;
      const favCovered = favoriteCovers(game, homeScore, awayScore);
      if (favCovered === null) return base;

      const spreadAbbr = (game.spread_team ?? "").toUpperCase();
      const signalAbbr = signal.team.toUpperCase();
      const affectedTeamIsFav = spreadAbbr === signalAbbr
        || spreadAbbr.includes(signalAbbr)
        || signalAbbr.includes(spreadAbbr);

      const hit = affectedTeamIsFav ? !favCovered : favCovered;

      return {
        market: "spread",
        lineAtSignal: signal.line_movement?.open ?? game.spread_line,
        closingLine: game.spread_line,
        clv: null,
        actualResult: homeScore - awayScore,
        hit,
      };
    }

    case "lineup_confirm": {
      if (!signal.team || game.spread_line == null) return base;
      const favCovered = favoriteCovers(game, homeScore, awayScore);
      if (favCovered === null) return base;

      const spreadAbbr = (game.spread_team ?? "").toUpperCase();
      const signalAbbr = signal.team.toUpperCase();
      const confirmedTeamIsFav = spreadAbbr === signalAbbr
        || spreadAbbr.includes(signalAbbr)
        || signalAbbr.includes(spreadAbbr);

      const hit = confirmedTeamIsFav ? favCovered : !favCovered;

      return {
        market: "spread",
        lineAtSignal: signal.line_movement?.open ?? game.spread_line,
        closingLine: game.spread_line,
        clv: null,
        actualResult: homeScore - awayScore,
        hit,
      };
    }

    case "weather_update": {
      if (game.total_line == null) return base;
      const actualTotal = homeScore + awayScore;
      return {
        market: "total",
        lineAtSignal: signal.line_movement?.open ?? game.total_line,
        closingLine: game.total_line,
        clv: null,
        actualResult: actualTotal,
        hit: actualTotal < game.total_line,
      };
    }

    default:
      return base;
  }
}

/* ─── Settlement v2 dispatch and the single write path ───── */

/** SETTLEMENT_V2=0 is the kill switch: back to the pre-v2 rules. */
export function settlementV2Enabled(): boolean {
  return process.env.SETTLEMENT_V2 !== "0";
}

export interface SettlementOutcomeResult extends SettleResult {
  state: SettlementState;
  reason: NoGradeReason | null;
  gradingVersion: string | null;
}

/** Load the inputs v2 grades on. Exported so replay validation and the regrade script use the same reads. */
export function loadGradingInputs(signal: LiveSignal, game: Game, homeScore: number, awayScore: number) {
  return {
    signal,
    game: { league: game.league, game_time: game.game_time, home_score: homeScore, away_score: awayScore },
    snapshots: getAllOddsSnapshotsForGame(game.id),
    rawEventMarkets: signal.signal_type === "line_move" && !signal.market
      ? getRawEventMarkets(signal.raw_event_ids ?? [])
      : [],
    kickoffGuardCoversLeague: kickoffGuardActiveFor(game.league as League),
  };
}

function fromV2(r: GradingResult): SettlementOutcomeResult {
  return {
    hit: r.hit,
    actualResult: r.actualResult,
    // OutcomeMarket is wider than the legacy union; the column is TEXT.
    market: r.market as SettleResult["market"],
    lineAtSignal: r.lineAtSignal,
    closingLine: r.closingLine,
    clv: r.clv,
    state: r.state,
    reason: r.reason,
    gradingVersion: GRADING_VERSION,
  };
}

export function settleOne(signal: LiveSignal, game: Game, homeScore: number, awayScore: number): SettlementOutcomeResult {
  if (settlementV2Enabled()) {
    return fromV2(gradeSignalV2(loadGradingInputs(signal, game, homeScore, awayScore)));
  }
  const legacy = settleSignal(signal, game, homeScore, awayScore);
  return legacy.hit === null
    ? { ...legacy, state: "no_grade", reason: "legacy_no_result", gradingVersion: null }
    : { ...legacy, state: "graded", reason: null, gradingVersion: null };
}

function settledStateName(result: SettlementOutcomeResult): "SETTLED_WIN" | "SETTLED_LOSS" | "SETTLED_NO_GRADE" {
  if (result.state === "no_grade" || result.hit === null) return "SETTLED_NO_GRADE";
  return result.hit ? "SETTLED_WIN" : "SETTLED_LOSS";
}

/**
 * The one place a settlement is written: pipeline outcome, signal link, state
 * history, storage mirror. Both the linked-game and null-game paths use it.
 * Previously each had its own copy, and both recorded SETTLED_LOSS for a
 * signal with no result.
 */
function recordSettlement(
  signal: LiveSignal,
  gameId: string,
  homeScore: number,
  awayScore: number,
  result: SettlementOutcomeResult,
): void {
  const recordedAt = new Date().toISOString();
  const outcome = createOutcome({
    signal_id: signal.id,
    game_id: gameId,
    market: result.market,
    home_score: homeScore,
    away_score: awayScore,
    line_at_signal: result.lineAtSignal,
    closing_line: result.closingLine,
    actual_result: result.actualResult,
    hit: result.hit,
    clv: result.clv,
    recorded_at: recordedAt,
    settlement_state: result.state,
    no_grade_reason: result.reason,
    grading_version: result.gradingVersion,
  });

  linkOutcomeToSignal(signal.id, outcome.id);
  recordSignalStateChange({
    signal_id: signal.id,
    previous_state: "UPDATED",
    new_state: settledStateName(result),
    reason: result.state === "no_grade" ? `Settled without a grade: ${result.reason}` : "Outcome settlement completed",
    metadata: {
      game_id: gameId,
      market: result.market,
      clv: result.clv,
      settlement_state: result.state,
      no_grade_reason: result.reason,
      grading_version: result.gradingVersion,
    },
  });
  insertSettledOutcome({
    signal_id:      signal.id,
    game_id:        gameId,
    league:         signal.league,
    signal_type:    signal.signal_type,
    sources:        JSON.stringify(signal.sources),
    team:           signal.team ?? null,
    market:         result.market,
    home_score:     homeScore,
    away_score:     awayScore,
    line_at_signal: result.lineAtSignal,
    closing_line:   result.closingLine,
    actual_result:  result.actualResult,
    hit:            result.hit,
    clv:            result.clv,
    recorded_at:    recordedAt,
    settlement_state: result.state,
    no_grade_reason:  result.reason,
    grading_version:  result.gradingVersion,
  });
}

/* ─── Main settlement function ───────────────────────────── */

export interface GameSettlementResult {
  game_id: string;
  settled: number;
  skipped: number;
  errors: number;
}

export function settleGame(
  gameId: string,
  homeScore: number,
  awayScore: number,
): GameSettlementResult {
  const db = getPipelineDb();
  ensureAccuracyTable(db);

  const game = getGame(gameId);
  if (!game) {
    console.warn(`[settlement] Game ${gameId} not found`);
    return { game_id: gameId, settled: 0, skipped: 0, errors: 1 };
  }

  updateGameFinal(gameId, homeScore, awayScore);

  const rawSignals = getUnsettledSignalsForGame(gameId);
  let settled = 0, skipped = 0, errors = 0;

  for (const raw of rawSignals) {
    try {
      const signal = deserializeSignal(raw);
      const result = settleOne(signal, { ...game, home_score: homeScore, away_score: awayScore } as Game, homeScore, awayScore);
      recordSettlement(signal, gameId, homeScore, awayScore, result);

      if (result.hit !== null) {
        settled++;
      } else {
        skipped++;
      }
    } catch (err: any) {
      console.error(`[settlement] Error settling signal ${raw.id}:`, err.message);
      errors++;
    }
  }

  console.log(`[settlement] ${gameId}: settled=${settled} skipped=${skipped} errors=${errors}`);
  return { game_id: gameId, settled, skipped, errors };
}

/* ─── Batch auto-settlement ──────────────────────────────── */

export interface AutoSettleResult {
  scores_fetched: { NBA: number; MLB: number; NFL: number; CFB: number };
  games_updated: number;
  games_settled: number;
  /** Signals settled WITH a grade (hit not null). */
  signals_settled: number;
  /** Signals settled without a grade (settlement_state no_grade). Outcome written, signal never retried. */
  signals_no_grade: number;
  signals_expired: number;
  market_signals_archived: number;
  /** Final scores held back by the per-cycle cap; picked up next cycle. */
  new_finals_deferred: number;
  /** How the CFB score adapter resolved its games this cycle. */
  cfb_game_resolution: { direct: number; alias: number; ambiguous: number; unmatched: number };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/* ─── Per-cycle cap on newly finalised games ──────────────────────────
 *
 * Until the CFB alias lookup landed, 84% of CFB games never resolved to a
 * games row, so they never went final and never settled. The first cycle after
 * that change promotes the whole current ESPN week at once — up to ~130 games
 * where a normal cycle sees a dozen — and every one of them puts its signals
 * into getSettleable() in the same pass.
 *
 * forEachBounded already keeps any single span under LOOP_SPAN_BUDGET_MS, so
 * this is not about the event loop; it is about the total wall clock of one
 * `ingest:settlement` span staying well inside the 15-minute cycle, and about
 * the accuracy recompute not being handed a season in one batch. Deferred
 * games are not lost: ESPN keeps returning them and the next cycle takes the
 * next slice, which is logged so the drain is visible.
 */
function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

/** Games promoted from non-final to final per settlement cycle. */
export const maxNewFinalsPerCycle = () =>
  envInt("SETTLEMENT_MAX_NEW_FINALS_PER_CYCLE", 25, 1, 10_000);

/* ─── Accuracy recompute debounce ─────────────────────────────
 * computeSourceAccuracy() + syncAccuracyToStorageDb() together scan every
 * settled outcome and block the event loop for seconds. The ingestion cycle
 * runs frequently, so from that path we recompute at most once per hour.
 * Manual admin routes call computeSourceAccuracy() directly and are NOT gated
 * by this. forceAccuracyRecompute() runs it now and resets the clock. */
const ACCURACY_DEBOUNCE_MS = 60 * 60 * 1000;
let lastAccuracyComputeAt = 0;

export function forceAccuracyRecompute(): AccuracyComputeResult {
  const res = computeSourceAccuracy();
  const sync = syncAccuracyToStorageDb();
  lastAccuracyComputeAt = Date.now();
  return {
    ...res,
    source_scores_cleared: sync.cleared.length,
    source_scores_sync: { ok: sync.ok, synced: sync.synced, failed: sync.failed, error: sync.error },
  };
}

/**
 * True when pipeline_source_accuracy no longer describes the current graded
 * population, by any path: a new graded outcome, a regrade turning grades into
 * no_grade, a stale flag, or leftover rows from an older recompute.
 *
 * WHY THIS EXISTS: the cycle used to recompute only when `signalsSettled > 0`,
 * and signalsSettled counts graded settlements only (hit !== null). Under v2
 * nearly everything settles no_grade, so that trigger stops firing and the
 * stored rows (and source_scores, which agents.ts cites) keep withdrawn
 * accuracy forever.
 *
 * Checks, cheapest first:
 *   1. Any row whose computed_at differs from the newest one: a leftover.
 *   2. Per league, the stored overall row's total/wins against
 *      ACCURACY_OVERALL_SQL, the exact statement computeSourceAccuracy() uses,
 *      so a fresh recompute always makes this false (no perpetual recompute).
 * Because a recompute rewrites every row in one transaction, an overall row
 * that matches implies the per-type and per-source rows match too.
 */
export function accuracyLedgerIsStale(): boolean {
  const db = getPipelineDb();
  ensureAccuracyTable(db);
  const leftover = db.prepare(`
    SELECT 1 FROM pipeline_source_accuracy
    WHERE computed_at <> (SELECT MAX(computed_at) FROM pipeline_source_accuracy)
    LIMIT 1
  `).get();
  if (leftover) return true;

  const storedOverall = db.prepare(
    "SELECT total_signals, wins FROM pipeline_source_accuracy WHERE id = ?",
  );
  const live = db.prepare(ACCURACY_OVERALL_SQL);
  for (const league of ["NBA", "MLB", "NFL", "CFB"]) {
    const cur = live.get(league) as { total: number | null; wins: number | null };
    const stored = storedOverall.get(`${league}|ALL|ALL`) as { total_signals: number; wins: number } | undefined;
    if (!stored) return true;
    if ((cur.total ?? 0) !== stored.total_signals || (cur.wins ?? 0) !== stored.wins) return true;
  }
  return false;
}

export async function autoSettleFinishedGames(): Promise<AutoSettleResult> {
  const db = getPipelineDb();
  ensureAccuracyTable(db);

  const [mlbScores, nbaScores, nflScores, cfbScores] = await trackJob(
    "settlement:fetch-scores",
    () => Promise.all([
      fetchMLBFinalScores().catch(() => []),
      fetchNBAFinalScores().catch(() => []),
      fetchNFLFinalScores().catch(() => []),
      fetchCFBFinalScores().catch(() => []),
    ]),
  );

  const allScores = [...mlbScores, ...nbaScores, ...nflScores, ...cfbScores];

  // One getGame + conditional UPDATE per fetched score. Four leagues of final
  // scores is a few hundred row lookups in a single span; bounded so a cold disk
  // cannot turn that into a health-check failure.
  const cap = maxNewFinalsPerCycle();
  const { gamesUpdated, newFinalsDeferred } = await trackJob("settlement:update-finals", async () => {
    let updated = 0;
    let deferred = 0;
    await forEachBounded(allScores, ({ game_id, home_score, away_score }) => {
      const game = getGame(game_id);
      if (!game) return;
      if (game.status === "final" && game.home_score != null) return;
      // Over the cap: leave the row non-final. ESPN returns the same completed
      // game every cycle, so the next cycle promotes it.
      if (updated >= cap) { deferred++; return; }
      updateGameFinal(game_id, home_score, away_score);
      updated++;
    });
    return { gamesUpdated: updated, newFinalsDeferred: deferred };
  });

  // Sizes the alias win from prod logs: `alias` is games the ESPN score
  // adapter could not resolve before this change at all.
  const cfbResolution = takeCfbMatchStats();
  if (cfbResolution.direct + cfbResolution.alias + cfbResolution.ambiguous + cfbResolution.unmatched > 0) {
    console.log(
      `[settlement] CFB game resolution: direct=${cfbResolution.direct} alias=${cfbResolution.alias} ` +
      `ambiguous=${cfbResolution.ambiguous} unmatched=${cfbResolution.unmatched}`,
    );
  }
  if (newFinalsDeferred > 0) {
    console.log(
      `[settlement] New finals capped at ${cap} this cycle; ${newFinalsDeferred} completed game(s) ` +
      `still waiting (SETTLEMENT_MAX_NEW_FINALS_PER_CYCLE)`,
    );
  }

  let gamesSettled = 0, signalsSettled = 0, signalsNoGrade = 0;

  const settleable = await trackJob("settlement:read-settleable", () => getSettleable());
  await trackJob("settlement:settle-linked", () => forEachBounded(settleable, (game) => {
    if (game.home_score == null || game.away_score == null) return;
    const result = settleGame(game.id, game.home_score, game.away_score);
    if (result.settled > 0 || result.skipped > 0) gamesSettled++;
    signalsSettled += result.settled;
    signalsNoGrade += result.skipped;
  }));

  let signalsExpired = 0;
  const nullGameSignals = await trackJob("settlement:read-nullgame", () => getUnsettledSignalsWithoutGameId());
  await trackJob("settlement:settle-nullgame", () => {
    const now = Date.now();

    return forEachBounded(nullGameSignals, (raw) => {
      const signal = deserializeSignal(raw);
      if (!signal.team) return;

      const game = findNextFinalGameForTeam(signal.league, signal.team, signal.created_at);

      if (!game || game.home_score == null || game.away_score == null) {
        // No final game inside the league window. Once the signal is older than
        // window + 1 day, no future game can ever fall inside the window, so park
        // it terminally to stop it being re-scanned every cycle forever.
        const windowMs = (settlementWindowDays(signal.league) + 1) * DAY_MS;
        const createdMs = Date.parse(signal.created_at);
        if (Number.isFinite(createdMs) && now - createdMs > windowMs) {
          expireNullGameSignal(signal.id);
          recordSignalStateChange({
            signal_id: signal.id,
            previous_state: "UPDATED",
            new_state: "SETTLEMENT_EXPIRED",
            reason: `No final ${signal.league} game for ${signal.team} within ${settlementWindowDays(signal.league)}d window`,
            metadata: { league: signal.league, team: signal.team, window_days: settlementWindowDays(signal.league) },
          });
          signalsExpired++;
        }
        return;
      }

      try {
        const result = settleOne(
          signal,
          { ...game, home_score: game.home_score, away_score: game.away_score },
          game.home_score,
          game.away_score,
        );

        recordSettlement(signal, game.id, game.home_score, game.away_score, result);

        if (result.hit !== null) {
          signalsSettled++;
          gamesSettled++;
        } else {
          signalsNoGrade++;
        }
      } catch (err: any) {
        console.error(`[settlement] Error settling null-game signal ${signal.id}:`, err.message);
      }
    });
  });

  // Recompute when the graded population changed by ANY path, not only when
  // this cycle graded something: no_grade settlements never bump
  // signalsSettled, so a regrade or stale flag would otherwise leave withdrawn
  // accuracy in storage for good. See accuracyLedgerIsStale().
  if (Date.now() - lastAccuracyComputeAt >= ACCURACY_DEBOUNCE_MS) {
    const stale = signalsSettled > 0
      || await trackJob("settlement:accuracy-stale-check", () => accuracyLedgerIsStale());
    if (stale) {
      await trackJob("settlement:compute-accuracy", async () => {
        await trackJob("settlement:accuracy-compute", () => computeSourceAccuracy());
        // The sync never throws; a failed one throws HERE, inside trackJob, so
        // the step is recorded as failed, and is caught right outside it so a
        // storage.db problem never takes the settlement cycle down with it.
        await trackJob("settlement:accuracy-sync", () => {
          const sync = syncAccuracyToStorageDb();
          if (!sync.ok) throw new AccuracySyncError(sync);
          return sync;
        }).catch((err) => {
          if (!(err instanceof AccuracySyncError)) throw err;
          // Already logged by syncAccuracyToStorageDb.
        });
      });
    }
    // Stamped either way: the check itself runs at most once per debounce window.
    lastAccuracyComputeAt = Date.now();
  }

  // Retire market signals (line_move) whose game is over so they stop reading as
  // URGENT/WATCH on the board. Read-time urgency already demotes them to NOTE;
  // this removes them from the active feed entirely. One indexed UPDATE.
  const marketSignalsArchived = await trackJob(
    "settlement:archive-finished-market",
    () => archiveFinishedMarketSignals(),
  );
  if (marketSignalsArchived > 0) {
    console.log(`[settlement] Archived ${marketSignalsArchived} finished market signal(s)`);
  }

  return {
    scores_fetched: { NBA: nbaScores.length, MLB: mlbScores.length, NFL: nflScores.length, CFB: cfbScores.length },
    games_updated: gamesUpdated,
    games_settled: gamesSettled,
    signals_settled: signalsSettled,
    signals_no_grade: signalsNoGrade,
    signals_expired: signalsExpired,
    market_signals_archived: marketSignalsArchived,
    new_finals_deferred: newFinalsDeferred,
    cfb_game_resolution: cfbResolution,
  };
}

/* ─── Source accuracy recomputation ──────────────────────── */

/**
 * FIX: Three aggregation passes:
 *   1. Overall per league (unchanged)
 *   2. Per signal_type per league (unchanged)
 *   3. NEW — Per individual source/beat writer, by exploding the sources JSON
 *      array in Node.js (SQLite can't unnest JSON arrays natively).
 *
 * All results written to pipeline.db → pipeline_source_accuracy.
 * Then syncAccuracyToStorageDb() copies them to storage.db for persistence.
 */
/**
 * The three accuracy statements, exported for the plan test.
 *
 * WHY `CROSS JOIN`: all three filter on `s.league = ?` — a predicate on the
 * JOINED table and nothing else — so the planner drives from `live_signals` and
 * probes `outcomes` once per signal in the league. That is 37,500 fat rows per
 * league on a prod-shaped fixture, 150,000 per call, the whole table, to
 * aggregate the ~6,000 outcomes that qualify. CROSS JOIN is an inner join that
 * additionally forbids loop reordering — identical row set, pinned order — and
 * the right order is `outcomes` outer: one pass over the rows the WHERE keeps,
 * each row's signal probed by id. `idx_outcomes_settled_signal` makes that pass
 * covering and `idx_live_signals_id_league_type` makes the probe covering for
 * passes 1 and 2 (pass 3 projects `s.sources`, so it still fetches its row).
 *
 * Measured on the 150k-signal / 75k-outcome fixture, warm, best of 3, all four
 * leagues (12 statements):
 *
 *   as shipped before this change   3,890ms
 *   CROSS JOIN pinned                 353ms
 *
 * Per statement, NFL/CFB: pass 1 286→14ms / 272→12ms, pass 2 419→10ms /
 * 400→16ms, pass 3 277→9ms / 294→89ms. Consistent in both measurement
 * orderings (shipped-first and pinned-first), so it is not a cache artifact.
 *
 * THIS IS THE #80 FOLLOW-UP, and the regression it recovers is #78+#79's, not
 * this file's: #78's `idx_outcomes_signal_created` moved the join off its
 * `SCAN o | SEARCH s (pk)` plan, and then #79's
 * `idx_live_signals_injury_dedup (league, signal_type, player, injury_designation)`
 * started being picked for the bare `s.league = ?` — a four-column index serving
 * a one-column predicate, because its leading column is `league`. Confirmed in
 * the plans: it is chosen for pass 2 (which also needs `s.signal_type`, which
 * that index covers), and pass 2 is the slowest of the three in every league.
 * See docs/settlement-boot-block.md and docs/request-path-query-audit.md.
 *
 * Pass 2 keeps a `TEMP B-TREE FOR GROUP BY` once pinned: it groups on a column
 * of the joined table, and no index removes that.
 */
export const ACCURACY_OVERALL_SQL = `
      SELECT
        COUNT(*)                                                   AS total,
        SUM(CASE WHEN o.hit = 1 THEN 1 ELSE 0 END)                AS wins,
        SUM(CASE WHEN o.hit = 0 THEN 1 ELSE 0 END)                AS losses,
        AVG(CASE WHEN o.clv IS NOT NULL THEN o.clv ELSE NULL END)  AS avg_clv
      FROM outcomes o
      CROSS JOIN live_signals s ON s.id = o.signal_id
      WHERE s.league = ? AND o.hit IS NOT NULL AND o.excluded_stale = 0
    `;

export const ACCURACY_BY_TYPE_SQL = `
      SELECT
        s.signal_type,
        COUNT(*)                                                   AS total,
        SUM(CASE WHEN o.hit = 1 THEN 1 ELSE 0 END)                AS wins,
        SUM(CASE WHEN o.hit = 0 THEN 1 ELSE 0 END)                AS losses,
        AVG(CASE WHEN o.clv IS NOT NULL THEN o.clv ELSE NULL END)  AS avg_clv
      FROM outcomes o
      CROSS JOIN live_signals s ON s.id = o.signal_id
      WHERE s.league = ? AND o.hit IS NOT NULL AND o.excluded_stale = 0
      GROUP BY s.signal_type
    `;

export const ACCURACY_PER_SOURCE_SQL = `
      SELECT s.id, s.signal_type, s.sources,
             o.hit, o.clv
      FROM outcomes o
      CROSS JOIN live_signals s ON s.id = o.signal_id
      WHERE s.league = ? AND o.hit IS NOT NULL AND o.excluded_stale = 0
    `;

export interface AccuracyComputeResult {
  /** Rows in pipeline_source_accuracy before the recompute, all deleted. */
  rows_deleted: number;
  /** Rows written by this recompute. */
  rows_written: number;
  /** source_scores rows whose settlement-derived accuracy was withdrawn (set NULL). */
  source_scores_cleared?: number;
  /** How the storage.db sync after the recompute went (forceAccuracyRecompute only). */
  source_scores_sync?: Pick<AccuracySyncResult, "ok" | "synced" | "failed" | "error">;
  /**
   * Wall time of the one pipeline.db write transaction (DELETE + rewrite), ms:
   * how long other writers wait. Same measure as the regrade's per-chunk hold.
   * The storage.db sync after it is per-statement autocommit, so not included.
   */
  lock_hold_ms: number;
}

/**
 * Rebuilds pipeline_source_accuracy from scratch: DELETE every row, then write
 * the rows the current population supports, in ONE transaction, all stamped
 * with the same computed_at.
 *
 * WHY DELETE, not upsert only: the upsert below only touches keys the current
 * population produces. A signal_type or source whose graded outcomes have all
 * gone (the v2 regrade turns injury/lineup/line-move grades into no_grade) used
 * to keep its old wins/losses/hit_rate forever, with nothing to overwrite it.
 * Withdrawn accuracy must not sit in storage waiting for a recompute that never
 * produces its key.
 *
 * The shared computed_at is what accuracyLedgerIsStale() checks: any row with a
 * different stamp is a leftover from an older recompute.
 */
export function computeSourceAccuracy(): AccuracyComputeResult {
  const db = getPipelineDb();
  ensureAccuracyTable(db);
  const t0 = Date.now();
  const res = db.transaction(() => computeSourceAccuracyInTx(db))();
  return { ...res, lock_hold_ms: Date.now() - t0 };
}

function computeSourceAccuracyInTx(db: ReturnType<typeof getPipelineDb>): Omit<AccuracyComputeResult, "lock_hold_ms"> {
  const leagues = ["NBA", "MLB", "NFL", "CFB"];
  const computedAt = new Date().toISOString();
  const rowsDeleted = db.prepare("DELETE FROM pipeline_source_accuracy").run().changes;
  let rowsWritten = 0;
  const upsertAccuracy = (...args: UpsertArgs) => { writeAccuracyRow(db, computedAt, ...args); rowsWritten++; };

  for (const league of leagues) {
    // ── Pass 1: Overall per league ──────────────────────────
    const overall = db.prepare(ACCURACY_OVERALL_SQL).get(league) as any;

    upsertAccuracy(league, null, null, null, null, overall);

    // ── Pass 2: Per signal_type ──────────────────────────────
    const byType = db.prepare(ACCURACY_BY_TYPE_SQL).all(league) as any[];

    for (const row of byType) {
      upsertAccuracy(league, row.signal_type, null, null, null, row);
    }

    // ── Pass 3: Per individual source (beat writer) ──────────
    // Pull all settled signals for this league with their sources JSON
    const settledRows = db.prepare(ACCURACY_PER_SOURCE_SQL).all(league) as any[];

    // Tally hits/misses per source_id
    const sourceTally = new Map<string, {
      source_id: string;
      source_name: string;
      source_type: string;
      wins: number;
      losses: number;
      clv_sum: number;
      clv_count: number;
    }>();

    for (const row of settledRows) {
      let srcs: any[] = [];
      try { srcs = JSON.parse(row.sources ?? "[]"); } catch { continue; }

      for (const src of srcs) {
        // Sources can be strings (legacy) or objects with id/name
        const sourceId   = typeof src === "string" ? src : (src.id ?? src.source_id ?? src.name ?? src);
        const sourceName = typeof src === "string" ? src : (src.name ?? src.source_name ?? sourceId);
        const sourceType = typeof src === "string" ? "unknown" : (src.source_type ?? src.type ?? "unknown");

        if (!sourceId) continue;

        if (!sourceTally.has(sourceId)) {
          sourceTally.set(sourceId, { source_id: sourceId, source_name: sourceName, source_type: sourceType, wins: 0, losses: 0, clv_sum: 0, clv_count: 0 });
        }
        const t = sourceTally.get(sourceId)!;
        if (row.hit === 1) t.wins++;
        else if (row.hit === 0) t.losses++;
        if (row.clv != null) { t.clv_sum += row.clv; t.clv_count++; }
      }
    }

    for (const t of Array.from(sourceTally.values())) {
      const total = t.wins + t.losses;
      upsertAccuracy(league, null, t.source_type, t.source_id, t.source_name, {
        total,
        wins: t.wins,
        losses: t.losses,
        avg_clv: t.clv_count > 0 ? t.clv_sum / t.clv_count : null,
      });
    }
  }

  console.log(
    `[settlement] Source accuracy recomputed (league + signal_type + per-source): ` +
    `deleted=${rowsDeleted} written=${rowsWritten}`,
  );
  return { rows_deleted: rowsDeleted, rows_written: rowsWritten };
}

type UpsertArgs = [
  league: string,
  signalType: string | null,
  sourceType: string | null,
  sourceId: string | null,
  sourceName: string | null,
  row: { total: number; wins: number; losses: number; avg_clv: number | null },
];

function writeAccuracyRow(
  db: ReturnType<typeof getPipelineDb>,
  computedAt: string,
  ...[league, signalType, sourceType, sourceId, sourceName, row]: UpsertArgs
) {
  // Deterministic PK: league | signal_type | source_id (all nullable → "ALL")
  const id = `${league}|${signalType ?? "ALL"}|${sourceId ?? sourceType ?? "ALL"}`;
  const total   = row.total   ?? 0;
  const wins    = row.wins    ?? 0;
  const losses  = row.losses  ?? 0;
  const hitRate = total > 0 ? Math.round((wins / total) * 1000) / 1000 : null;
  const avgClv  = row.avg_clv != null ? Math.round(row.avg_clv * 100) / 100 : null;

  db.prepare(`
    INSERT INTO pipeline_source_accuracy
      (id, league, signal_type, source_type, source_id, source_name,
       total_signals, wins, losses, hit_rate, avg_clv, computed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      total_signals = excluded.total_signals,
      wins          = excluded.wins,
      losses        = excluded.losses,
      hit_rate      = excluded.hit_rate,
      avg_clv       = excluded.avg_clv,
      source_name   = excluded.source_name,
      computed_at   = excluded.computed_at
  `).run(
    id, league, signalType, sourceType, sourceId, sourceName,
    total, wins, losses, hitRate, avgClv,
    computedAt,
  );
}

/* ─── Sync accuracy scores to persistent storage.db ─────── */

/**
 * FIX: After computing accuracy in pipeline.db (ephemeral),
 * copy per-source scores into storage.db (persistent) via
 * storage.upsertSourceScore() so the leaderboard survives restarts.
 *
 * Only syncs rows where source_id IS NOT NULL (per-writer rows),
 * since the leaderboard is keyed on source records in storage.db.
 */
export interface AccuracySyncResult {
  /** False when anything failed: one source's upsert, or the sync as a whole. */
  ok: boolean;
  /** source_scores rows upserted. */
  synced: number;
  /** Sources whose upsert threw. A whole-sync failure leaves this at however
   *  many had failed before it; `ok` and `error` are what say it failed. */
  failed: number;
  /** Sources whose settlement accuracy was withdrawn. */
  cleared: string[];
  /** First error message seen, null when ok. */
  error: string | null;
}

/** Thrown inside trackJob by the settlement cycle so a failed sync is recorded
 *  as a failed step; caught right outside it. */
export class AccuracySyncError extends Error {
  constructor(readonly result: AccuracySyncResult) {
    super(`accuracy sync failed: ${result.error}`);
    this.name = "AccuracySyncError";
  }
}

/**
 * Never throws: every failure is reported in the result instead, so a caller
 * can tell "failed" from "nothing to sync" without having to catch.
 */
export function syncAccuracyToStorageDb(): AccuracySyncResult {
  let synced = 0;
  let failed = 0;
  let error: string | null = null;
  let whole = false;
  let cleared: string[] = [];
  try {
    // Read from persistent settled_outcomes (not ephemeral pipeline.db)
    const rows = getSettledOutcomesForAccuracy();

    // Tally per source_id across all leagues — same logic as computeSourceAccuracy Pass 3
    const sourceTally = new Map<string, {
      source_id:   string;
      source_name: string;
      wins:        number;
      losses:      number;
      clv_sum:     number;
      clv_count:   number;
    }>();

    for (const row of rows) {
      let srcs: any[] = [];
      try { srcs = JSON.parse(row.sources ?? "[]"); } catch { continue; }

      for (const src of srcs) {
        const sourceId   = typeof src === "string" ? src : (src.id ?? src.source_id ?? src.name ?? src);
        const sourceName = typeof src === "string" ? src : (src.name ?? src.source_name ?? sourceId);
        if (!sourceId) continue;

        if (!sourceTally.has(sourceId)) {
          sourceTally.set(sourceId, { source_id: sourceId, source_name: sourceName, wins: 0, losses: 0, clv_sum: 0, clv_count: 0 });
        }
        const t = sourceTally.get(sourceId)!;
        if (row.hit === 1) t.wins++;
        else if (row.hit === 0) t.losses++;
        if (row.clv != null) { t.clv_sum += row.clv; t.clv_count++; }
      }
    }

    for (const t of Array.from(sourceTally.values())) {
      try {
        const total   = t.wins + t.losses;
        const hitRate = total > 0 ? t.wins / total : null;

        storage.upsertSourceScore({
          source_id:                 t.source_id,
          source_name:               t.source_name,
          overall_accuracy:          String(hitRate != null ? Math.round(hitRate * 100) : 0),
          draft_accuracy:            String(hitRate != null ? Math.round(hitRate * 100) : 0),
          average_lead_time_minutes: "0",
          injury_accuracy:           "0",
          portal_accuracy:           "0",
          false_positive_rate:       "0",
        });
        synced++;
      } catch (err: any) {
        failed++;
        error ??= `source ${t.source_id}: ${err?.message ?? String(err)}`;
        console.warn(`[settlement] syncAccuracyToStorageDb: failed for source ${t.source_id}:`, err.message);
      }
    }

    if (synced > 0) {
      console.log(`[settlement] Synced ${synced} source accuracy scores → storage.db (from settled_outcomes)`);
    }

    // Sources that had settlement accuracy and no longer have a graded row.
    cleared = clearWithdrawnSettlementAccuracy(new Set(sourceTally.keys()));
    if (cleared.length > 0) {
      console.log(`[settlement] Withdrew settlement accuracy for ${cleared.length} source(s) with no graded outcome left`);
    }
  } catch (err: any) {
    whole = true;
    error ??= err?.message ?? String(err);
    console.error("[settlement] syncAccuracyToStorageDb failed:", err.message);
  }
  if (failed > 0) {
    console.error(
      `[settlement] syncAccuracyToStorageDb: ${failed} source(s) failed, ${synced} synced; first error: ${error}`,
    );
  }
  return { ok: !whole && failed === 0, synced, failed, cleared, error };
}

/* ─── One-time backlog migration ──────────────────────────────
 * Prod (Sept 28 2026) carried ~39k null-game signals that will never match a
 * final game and ~51k outcomes whose null-game signal matched a game far beyond
 * its league window (a June transaction "settled" against a September game).
 *
 * This idempotent, chunked, event-loop-yielding migration:
 *   1. Parks each never-matchable null-game signal (SETTLEMENT_EXPIRED) so the
 *      settlement queue stops re-scanning it every cycle.
 *   2. Flags stale outcomes (excluded_stale=1) in pipeline.db AND mirrors the
 *      flag into storage.db settled_outcomes — rows are kept, never deleted.
 *   3. Forces one accuracy recompute so the leaderboard/calibration reflect the
 *      now-excluded rows immediately.
 *
 * Re-running is a no-op: every step only touches rows still at their default
 * flag value that still meet the age/window criteria. */
export interface SettlementBacklogMigrationResult {
  scanned: number;
  expired: number;
  stale_outcomes_flagged: number;
  stale_outcomes_mirrored: number;
}

const BACKLOG_CHUNK = 1000;
const yieldToLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

// Completion marker. This migration is a one-time cleanup: after its first full
// run it expires nothing new, yet steps 1–2b still re-scan every null-game signal
// on every boot (a ~17s event-loop block on prod). Once complete we persist this
// flag and skip the whole body on later boots. Ongoing expiry of newly-aged
// signals is handled per-cycle by autoSettleFinishedGames, so nothing is lost.
const BACKLOG_MIGRATION_DONE_KEY = "settlement_backlog_migration_complete";

export async function runSettlementBacklogMigration(): Promise<SettlementBacklogMigrationResult> {
  const db = getPipelineDb();
  ensureAccuracyTable(db);

  // Already finished on a prior boot → skip steps 1–2b entirely (zero candidate
  // reads, no event-loop block). Nothing is lost: autoSettleFinishedGames keeps
  // expiring newly-aged null-game signals every cycle.
  if (getPipelineMeta(BACKLOG_MIGRATION_DONE_KEY, db) !== null) {
    console.log("[settlement] Backlog migration already complete — skipped");
    return { scanned: 0, expired: 0, stale_outcomes_flagged: 0, stale_outcomes_mirrored: 0 };
  }

  // ── Step 1: expire never-matchable null-game backlog, chunked ────────────
  // Candidates: the same rows the settlement queue scans, minus already-parked
  // ones. Snapshot ids up front (small: id/league/team/created_at only) so that
  // flipping settlement_expired mid-loop can't disturb pagination.
  const candidates = db.prepare(`
    SELECT id, league, team, created_at
    FROM live_signals
    WHERE game_id IS NULL
      AND betting_relevance = 1
      AND outcome_id IS NULL
      AND team IS NOT NULL
      AND settlement_expired = 0
    ORDER BY created_at ASC
  `).all() as Array<{ id: string; league: string; team: string; created_at: string }>;

  const now = Date.now();
  let scanned = 0;
  let expired = 0;

  // Commit each chunk's writes as ONE transaction: under WAL + synchronous=FULL
  // an auto-committed statement fsyncs per row (~2 fsyncs/row), so writing 39k
  // rows one at a time blocks the loop for minutes. One commit per 1000-row
  // chunk collapses that to a handful of fsyncs, and we yield between chunks.
  const expireChunk = db.transaction(
    (items: Array<{ id: string; league: string; team: string; windowDays: number }>) => {
      for (const it of items) {
        expireNullGameSignal(it.id);
        recordSignalStateChange({
          signal_id: it.id,
          previous_state: "UPDATED",
          new_state: "SETTLEMENT_EXPIRED",
          reason: `Backlog migration: no final ${it.league} game for ${it.team} within ${it.windowDays}d window`,
          metadata: { league: it.league, team: it.team, window_days: it.windowDays, migration: true },
        });
      }
    },
  );

  let pending: Array<{ id: string; league: string; team: string; windowDays: number }> = [];
  const flushPending = () => {
    if (pending.length === 0) return;
    expireChunk(pending);
    expired += pending.length;
    pending = [];
  };

  for (const c of candidates) {
    scanned++;
    const windowDays = settlementWindowDays(c.league);
    const createdMs = Date.parse(c.created_at);
    // Only park rows old enough that no future game can still land in-window.
    if (Number.isFinite(createdMs) && now - createdMs > (windowDays + 1) * DAY_MS) {
      // Confirm there is genuinely no final game inside the window before parking
      // it (guards the rare case a matchable in-window game is simply queue-starved).
      const game = findNextFinalGameForTeam(c.league, c.team, c.created_at);
      if (!game) {
        pending.push({ id: c.id, league: c.league, team: c.team, windowDays });
      }
    }
    if (scanned % BACKLOG_CHUNK === 0) {
      flushPending();
      await yieldToLoop();
    }
  }
  flushPending();

  // ── Step 2: flag stale outcomes in pipeline.db (kept, not deleted) ───────
  // A null-game signal whose matched game is more than its league window past
  // the signal's creation is a bad match. UPDATE…FROM joins the signal in.
  const staleUpdate = db.prepare(`
    UPDATE outcomes
    SET excluded_stale = 1
    FROM live_signals AS s
    WHERE s.id = outcomes.signal_id
      AND outcomes.excluded_stale = 0
      AND s.game_id IS NULL
      AND EXISTS (
        SELECT 1 FROM games g
        WHERE g.id = outcomes.game_id
          AND julianday(g.game_time) - julianday(s.created_at) >
              (CASE s.league
                 WHEN 'MLB' THEN 2 WHEN 'NBA' THEN 3
                 WHEN 'NFL' THEN 8 WHEN 'CFB' THEN 8 ELSE 8 END)
      )
  `).run();
  const staleFlagged = staleUpdate.changes;
  await yieldToLoop();

  // ── Step 2b: mirror the flag into storage.db settled_outcomes ────────────
  // Skip entirely when nothing new was flagged AND storage.db already holds the
  // same number of stale rows as pipeline.db — i.e. a prior run already synced.
  const pipelineStaleCount = (db.prepare(
    "SELECT COUNT(*) AS n FROM outcomes WHERE excluded_stale = 1",
  ).get() as { n: number }).n;
  const storageStaleCount = countStaleSettledOutcomes();

  let staleMirrored = 0;
  if (staleFlagged === 0 && storageStaleCount === pipelineStaleCount) {
    // storage.db is already in sync — no mirror pass needed.
  } else {
    const staleSignalIds = (db.prepare(
      "SELECT signal_id FROM outcomes WHERE excluded_stale = 1",
    ).all() as Array<{ signal_id: string }>).map((r) => r.signal_id);
    staleMirrored = markSettledOutcomesStale(staleSignalIds);
  }
  await yieldToLoop();

  // ── Step 3: force one recompute so exclusions take effect immediately ────
  forceAccuracyRecompute();

  // Persist the completion marker so every later boot short-circuits the whole
  // scan above. Written last, only after the full run succeeded.
  setPipelineMeta(BACKLOG_MIGRATION_DONE_KEY, new Date().toISOString(), db);

  console.log(
    `[settlement] Backlog migration: scanned=${scanned} expired=${expired} ` +
    `stale_flagged=${staleFlagged} stale_mirrored=${staleMirrored}`,
  );

  return {
    scanned,
    expired,
    stale_outcomes_flagged: staleFlagged,
    stale_outcomes_mirrored: staleMirrored,
  };
}
