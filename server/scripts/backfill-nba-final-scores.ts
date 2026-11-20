/**
 * Edge Setter — NBA final-score backfill, DRY RUN ONLY.
 *
 * fetchNBAFinalScores passed ESPN's scoreboard abbreviations straight to
 * findGameByTeams, and six of them are not ours (GS/GSW, NO/NOP, NY/NYK,
 * SA/SAS, UTAH/UTA, WSH/WAS). Every game those teams played stayed
 * "scheduled" with no score: 87 past games on prod, 2026-11-20. The adapter
 * fix (resolveNBAScoreboardTeam) only reaches today's and yesterday's
 * scoreboards, so the games already missed need a backfill.
 *
 * This script only REPORTS what a backfill would do. It has no write path: the
 * database is opened read-only (better-sqlite3 { readonly: true }), and
 * getPipelineDb() is deliberately not used because it opens read-write and runs
 * schema migrations. An apply mode is a separate, later change.
 *
 * For every NBA game that tipped off more than 6h ago and is not final:
 *   1. Find ESPN's completed game for it: the scoreboards for its UTC date and
 *      the day before (ESPN dates games by US local day), teams resolved with
 *      resolveNBAScoreboardTeam, tip-off within 12h. Exactly one, or it is
 *      reported as unmatched / ambiguous and would not be written.
 *   2. Count the signals settlement would pick up once the game is final — the
 *      same rows getUnsettledSignalsForGame selects (game_id, betting_relevance
 *      = 1, outcome_id IS NULL). getSettleable does not filter is_archived, so
 *      archived rows settle too; they are counted separately.
 *   3. Count the line moves among them that are TOTALS. settleSignal's
 *      line_move branch (settlement.ts:117) grades every line move against
 *      spread snapshots and records market "spread", so a totals move would be
 *      graded as a spread. The market comes from the raw event the signal was
 *      built from (the odds adapter writes payload.market "spread" | "total");
 *      only when no raw event says is it inferred with the board's
 *      resolveMarketMove (opener match, then magnitude), and the two are
 *      reported apart.
 *
 * Usage (on the box that holds pipeline.db):
 *   npx tsx server/scripts/backfill-nba-final-scores.ts
 *   npx tsx server/scripts/backfill-nba-final-scores.ts --db /var/data/pipeline.db
 *   npx tsx server/scripts/backfill-nba-final-scores.ts --json > plan.json
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
// The leaf module, not ../pipeline/adapters/espn-nba: that imports ../store,
// which imports ../storage, which opens edge_setter.db read-write on import.
import { resolveNBAScoreboardTeam } from "../pipeline/adapters/espn-nba-teams";
import { resolveMarketMove } from "../../client/src/lib/marketMove";

const ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const MIN_AGE_MS = 6 * 60 * 60 * 1000;
const MATCH_WINDOW_MS = 12 * 60 * 60 * 1000;
const FETCH_THROTTLE_MS = 300;

/* ─── Arguments ──────────────────────────────────────────── */

const args = process.argv.slice(2);
if (args.some((a) => a === "--apply" || a === "--write")) {
  console.error("This script is dry-run only. There is no apply mode yet.");
  process.exit(2);
}
const asJson = args.includes("--json");
const dbArgIndex = args.indexOf("--db");
const dbPath = dbArgIndex >= 0
  ? args[dbArgIndex + 1]
  : [process.env.PIPELINE_DATA_DIR, process.env.DATA_DIR]
      .filter((dir): dir is string => Boolean(dir))
      .map((dir) => path.join(dir, "pipeline.db"))
      .find((file) => fs.existsSync(file));
if (!dbPath || !fs.existsSync(dbPath)) {
  console.error("pipeline.db not found. Pass --db <path>, or set PIPELINE_DATA_DIR.");
  process.exit(2);
}
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

/* ─── Types ──────────────────────────────────────────────── */

interface GameRow {
  id: string;
  home_team: string;
  away_team: string;
  game_time: string;
  status: string;
  open_spread: number | null;
  open_total: number | null;
}

interface SignalRow {
  id: string;
  signal_type: string;
  team: string | null;
  is_archived: number;
  line_movement: string | null;
  raw_event_ids: string | null;
}

interface EspnCompetitor {
  homeAway: "home" | "away";
  score?: string;
  team: { abbreviation: string; displayName?: string };
}

interface EspnEvent {
  id: string;
  date: string;
  competitions?: Array<{ status?: { type?: { completed?: boolean } }; competitors?: EspnCompetitor[] }>;
}

interface EspnFinal {
  espnId: string;
  date: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
}

type Match =
  | { kind: "matched"; espn: EspnFinal }
  | { kind: "unmatched" }
  | { kind: "ambiguous"; candidates: EspnFinal[] };

interface GamePlan {
  game_id: string;
  matchup: string;
  game_time: string;
  match: "matched" | "unmatched" | "ambiguous";
  espn_id: string | null;
  would_write: { home_score: number; away_score: number } | null;
  unsettled_signals: number;
  unsettled_archived: number;
  unsettled_by_type: Record<string, number>;
  line_moves: number;
  /**
   * Each line move's market, and where that came from: "recorded" is the raw
   * event's payload.market, "guessed" is resolveMarketMove (opener match, then
   * magnitude). Kept apart so the guess never passes for the record. Every
   * total is a move settlement.ts:117 would grade as a spread.
   */
  line_move_markets: MarketCounts;
}

interface MarketCounts {
  spread: { recorded: number; guessed: number };
  total: { recorded: number; guessed: number };
  unknown: number;
}

function emptyMarketCounts(): MarketCounts {
  return { spread: { recorded: 0, guessed: 0 }, total: { recorded: 0, guessed: 0 }, unknown: 0 };
}

/* ─── ESPN ───────────────────────────────────────────────── */

const scoreboardCache = new Map<string, EspnFinal[]>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function espnDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
}

async function completedOn(date: string): Promise<EspnFinal[]> {
  const cached = scoreboardCache.get(date);
  if (cached) return cached;
  await sleep(FETCH_THROTTLE_MS);
  const resp = await fetch(`${ESPN_SCOREBOARD}?dates=${date}`);
  if (!resp.ok) throw new Error(`ESPN scoreboard ${date}: HTTP ${resp.status}`);
  const body = await resp.json() as { events?: EspnEvent[] };
  const finals: EspnFinal[] = [];
  for (const event of body.events ?? []) {
    const comp = event.competitions?.[0];
    if (!comp?.status?.type?.completed) continue;
    const home = comp.competitors?.find((c) => c.homeAway === "home");
    const away = comp.competitors?.find((c) => c.homeAway === "away");
    if (!home || !away) continue;
    const homeScore = Number(home.score);
    const awayScore = Number(away.score);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;
    finals.push({
      espnId: event.id,
      date: event.date,
      home: resolveNBAScoreboardTeam(home.team),
      away: resolveNBAScoreboardTeam(away.team),
      homeScore,
      awayScore,
    });
  }
  scoreboardCache.set(date, finals);
  return finals;
}

async function findEspnFinal(game: GameRow): Promise<Match> {
  const tip = Date.parse(game.game_time);
  const dates = Array.from(new Set([espnDate(tip - 24 * 60 * 60 * 1000), espnDate(tip)]));
  const seen = new Map<string, EspnFinal>();
  for (const date of dates) {
    for (const final of await completedOn(date)) seen.set(final.espnId, final);
  }
  const candidates = Array.from(seen.values()).filter((final) =>
    final.home === game.home_team
    && final.away === game.away_team
    && Math.abs(Date.parse(final.date) - tip) <= MATCH_WINDOW_MS);
  if (candidates.length === 1) return { kind: "matched", espn: candidates[0] };
  return candidates.length === 0 ? { kind: "unmatched" } : { kind: "ambiguous", candidates };
}

/* ─── Signals ────────────────────────────────────────────── */

const unsettledStmt = db.prepare(`
  SELECT id, signal_type, team, is_archived, line_movement, raw_event_ids
  FROM live_signals
  WHERE game_id = ? AND betting_relevance = 1 AND outcome_id IS NULL
`);

const rawPayloadStmt = db.prepare(`SELECT payload FROM raw_events WHERE id = ?`);

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

/** "spread" | "total" from the raw event the signal was built from, or null. */
function recordedMarket(signal: SignalRow): "spread" | "total" | null {
  const ids = parseJson<string[]>(signal.raw_event_ids) ?? [];
  for (const id of ids) {
    const row = rawPayloadStmt.get(id) as { payload: string } | undefined;
    const market = parseJson<{ market?: string }>(row?.payload ?? null)?.market;
    if (market === "spread" || market === "total") return market;
  }
  return null;
}

function lineMoveMarket(signal: SignalRow, game: GameRow): { kind: "spread" | "total" | "unknown"; recorded: boolean } {
  const recorded = recordedMarket(signal);
  if (recorded) return { kind: recorded, recorded: true };
  const lm = parseJson<{ open?: number | string; current?: number | string }>(signal.line_movement);
  const move = resolveMarketMove({
    open: lm?.open, current: lm?.current, league: "NBA",
    openSpread: game.open_spread, openTotal: game.open_total,
  });
  return { kind: move?.kind ?? "unknown", recorded: false };
}

/* ─── Main ───────────────────────────────────────────────── */

async function main() {
  const cutoff = new Date(Date.now() - MIN_AGE_MS).toISOString();
  const games = db.prepare(`
    SELECT id, home_team, away_team, game_time, status, open_spread, open_total
    FROM games
    WHERE league = 'NBA' AND status != 'final' AND game_time < ?
    ORDER BY game_time ASC
  `).all(cutoff) as GameRow[];

  const plans: GamePlan[] = [];
  for (const game of games) {
    const match = await findEspnFinal(game);
    const signals = unsettledStmt.all(game.id) as SignalRow[];
    const byType: Record<string, number> = {};
    let lineMoves = 0;
    const markets = emptyMarketCounts();
    for (const signal of signals) {
      byType[signal.signal_type] = (byType[signal.signal_type] ?? 0) + 1;
      if (signal.signal_type !== "line_move") continue;
      lineMoves++;
      const market = lineMoveMarket(signal, game);
      if (market.kind === "unknown") markets.unknown++;
      else markets[market.kind][market.recorded ? "recorded" : "guessed"]++;
    }
    plans.push({
      game_id: game.id,
      matchup: `${game.away_team}@${game.home_team}`,
      game_time: game.game_time,
      match: match.kind,
      espn_id: match.kind === "matched" ? match.espn.espnId : null,
      would_write: match.kind === "matched"
        ? { home_score: match.espn.homeScore, away_score: match.espn.awayScore }
        : null,
      unsettled_signals: signals.length,
      unsettled_archived: signals.filter((s) => s.is_archived === 1).length,
      unsettled_by_type: byType,
      line_moves: lineMoves,
      line_move_markets: markets,
    });
  }

  const matched = plans.filter((p) => p.match === "matched");
  const totals = {
    games_not_final: plans.length,
    matched: matched.length,
    unmatched: plans.filter((p) => p.match === "unmatched").length,
    ambiguous: plans.filter((p) => p.match === "ambiguous").length,
    // Only a matched game would be written, so only its signals would settle.
    signals_that_would_settle: matched.reduce((n, p) => n + p.unsettled_signals, 0),
    of_which_archived: matched.reduce((n, p) => n + p.unsettled_archived, 0),
    line_moves: matched.reduce((n, p) => n + p.line_moves, 0),
    // Every total here would be graded as a spread by settlement.ts:117.
    line_move_markets: matched.reduce((sum, p) => {
      for (const kind of ["spread", "total"] as const) {
        sum[kind].recorded += p.line_move_markets[kind].recorded;
        sum[kind].guessed += p.line_move_markets[kind].guessed;
      }
      sum.unknown += p.line_move_markets.unknown;
      return sum;
    }, emptyMarketCounts()),
  };

  if (asJson) {
    console.log(JSON.stringify({ dry_run: true, db: dbPath, generated_at: new Date().toISOString(), totals, games: plans }, null, 2));
    return;
  }

  console.log(`[nba-final-backfill] DRY RUN — nothing is written. db=${dbPath}`);
  for (const p of plans) {
    const score = p.would_write ? `${p.would_write.away_score}-${p.would_write.home_score}` : "—";
    const types = Object.entries(p.unsettled_by_type).map(([t, n]) => `${t}:${n}`).join(" ") || "none";
    const m = p.line_move_markets;
    console.log(
      `${p.game_time.slice(0, 16)}  ${p.game_id.padEnd(26)} ${p.match.padEnd(9)} espn=${p.espn_id ?? "—"} ` +
      `score(away-home)=${score}  unsettled=${p.unsettled_signals} archived=${p.unsettled_archived} ` +
      `line-moves: total recorded=${m.total.recorded} guessed=${m.total.guessed} | ` +
      `spread recorded=${m.spread.recorded} guessed=${m.spread.guessed} | unknown=${m.unknown}  [${types}]`,
    );
  }
  console.log(`[nba-final-backfill] ${JSON.stringify(totals)}`);
}

main()
  .catch((err) => {
    console.error("[nba-final-backfill] failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.close());
