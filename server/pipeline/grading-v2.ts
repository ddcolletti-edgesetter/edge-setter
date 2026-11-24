/**
 * Settlement grading v2: a PURE function from (signal, game, odds snapshots)
 * to a settlement result. No DB access, so live settlement, replay validation
 * and the regrade script all run the same rules on the same inputs.
 *
 * The rules, as decided 2026-11-24:
 *
 *  1. A signal is graded only on a side its card copy claimed: home, away,
 *     over or under. The side is stored on the signal (live_signals.graded_side)
 *     when the card is written, never inferred here. Today only a high-wind
 *     weather card claims one ("Favour unders"). Line moves, injury and lineup
 *     signals claim nothing and settle as no_grade / no_side_claimed, past and
 *     future alike.
 *
 *  2. Lines are bounded by kickoff. The line "at signal" is the newest snapshot
 *     at or before min(signal created_at, kickoff); the pregame line is the
 *     newest snapshot at or before kickoff, for the claimed market. An in-play
 *     snapshot is never read, in any league, whatever the ingest guard covers.
 *
 *  3. CLV is signed by the claimed side, not by the direction the line moved:
 *
 *        clv = (line_at_signal − pregame_line) × s
 *
 *        spread (stored from the home side): home s = +1, away s = −1
 *        total:                              under s = +1, over s = −1
 *
 *     Home −3 at signal, home −4.5 at close: (−3 − −4.5) × +1 = +1.5. The home
 *     bettor laid 3 when the close asked 4.5. Over 47.5 at signal, 46 at close:
 *     (47.5 − 46) × −1 = −1.5. The Over could have been bought cheaper at close.
 *
 *  4. hit is the game result against the line the claim was made at
 *     (line_at_signal). Landing exactly on it is a push: no_grade / push.
 *
 * Anything that is not graded has hit = NULL and a named reason from
 * shared/settlement-grading.ts.
 */
import type { GradedSide, NoGradeReason, SettlementState } from "@shared/settlement-grading";
import { isGradedSide } from "@shared/settlement-grading";
import { computeSpreadOrTotalClv } from "./clv";

export const GRADING_VERSION = "v2";

/**
 * When the odds kickoff guard (#87) went live: its merge time, 2026-11-14.
 * The deploy followed within minutes, so the few snapshots in between can only
 * make kickoff_time_unreliable fire too often (no grade), never too rarely.
 */
export const ODDS_KICKOFF_GUARD_LIVE_AT = "2026-11-14T06:11:18.000Z";

/** The exact opening of the high-wind weather card's action_note (processor.ts handleWeather). */
export const WEATHER_UNDER_CLAIM_PREFIX = "Favour unders";

export type OutcomeMarket = "spread" | "total" | "unknown" | "mixed" | "none";

export interface GradingSignal {
  signal_type: string;
  created_at: string;
  action_note?: string | null;
  graded_side?: string | null;
  market?: string | null;
}

export interface GradingGame {
  league: string;
  game_time: string;
  home_score: number;
  away_score: number;
}

export interface GradingSnapshot {
  snapshot_at: string;
  spread_line: number | null;
  total_line: number | null;
  source_game_id?: string | null;
}

export interface GradingInput {
  signal: GradingSignal;
  game: GradingGame;
  /** Every odds snapshot for the game, any order. */
  snapshots: GradingSnapshot[];
  /** payload.market of each of the signal's raw events, in raw_event_ids order (line_move only). */
  rawEventMarkets?: Array<string | null>;
  /** Whether the odds kickoff guard covers this league (ODDS_KICKOFF_GUARD_LEAGUES). */
  kickoffGuardCoversLeague: boolean;
}

export interface GradingResult {
  state: SettlementState;
  reason: NoGradeReason | null;
  side: GradedSide | null;
  market: OutcomeMarket;
  lineAtSignal: number | null;
  closingLine: number | null;
  actualResult: number | null;
  hit: boolean | null;
  clv: number | null;
}

/**
 * The side the card claimed. The stored column first. For rows written before
 * that column existed, the one claim any card has ever made: the high-wind
 * weather card's action_note, read from the stored copy, not recomputed from
 * the wind speed.
 */
export function claimedSide(signal: GradingSignal): GradedSide | null {
  if (isGradedSide(signal.graded_side)) return signal.graded_side;
  if (signal.graded_side == null
    && signal.signal_type === "weather_update"
    && typeof signal.action_note === "string"
    && signal.action_note.startsWith(WEATHER_UNDER_CLAIM_PREFIX)) {
    return "under";
  }
  return null;
}

export function marketOfSide(side: GradedSide): "spread" | "total" {
  return side === "home" || side === "away" ? "spread" : "total";
}

/** s in clv = (line_at_signal − pregame_line) × s. */
export function sideSign(side: GradedSide): 1 | -1 {
  return side === "home" || side === "under" ? 1 : -1;
}

/** CLV for a claimed side. Positive = the claim got a better number than the pregame close. */
export function signedClv(side: GradedSide, lineAtSignal: number, pregameLine: number): number {
  const raw = computeSpreadOrTotalClv(lineAtSignal, pregameLine)!;
  const signed = raw * sideSign(side);
  return signed === 0 ? 0 : signed; // no -0
}

/**
 * Did the claim win? spread_line is stored from the home side, so home covers
 * when margin + line > 0. Returns null on a push.
 */
export function claimWon(side: GradedSide, line: number, homeScore: number, awayScore: number): boolean | null {
  if (marketOfSide(side) === "spread") {
    const cover = (homeScore - awayScore) + line;
    if (cover === 0) return null;
    return side === "home" ? cover > 0 : cover < 0;
  }
  const total = homeScore + awayScore;
  if (total === line) return null;
  return side === "over" ? total > line : total < line;
}

function lineOf(s: GradingSnapshot, market: "spread" | "total"): number | null {
  return market === "spread" ? s.spread_line : s.total_line;
}

/** Newest snapshot at or before `at` carrying a line for `market`. */
function lineAtOrBefore(snaps: GradingSnapshot[], at: string, market: "spread" | "total"): number | null {
  let best: GradingSnapshot | null = null;
  for (const s of snaps) {
    if (s.snapshot_at > at || lineOf(s, market) == null) continue;
    if (!best || s.snapshot_at > best.snapshot_at) best = s;
  }
  return best ? lineOf(best, market) : null;
}

/** The market a signal describes, for the descriptive lines on an ungraded row. */
export function describedMarket(signal: GradingSignal, rawEventMarkets: Array<string | null> = []): OutcomeMarket {
  if (signal.signal_type === "weather_update") return "total";
  if (signal.signal_type !== "line_move") return "none";
  if (signal.market === "spread" || signal.market === "total") return signal.market;
  const known = new Set(rawEventMarkets.filter((m): m is string => m === "spread" || m === "total"));
  if (known.size === 1) return [...known][0] as "spread" | "total";
  return known.size > 1 ? "mixed" : "unknown";
}

function noGrade(reason: NoGradeReason, rest: Partial<GradingResult> & { market: OutcomeMarket }): GradingResult {
  return {
    state: "no_grade", reason, side: null,
    lineAtSignal: null, closingLine: null, actualResult: null, clv: null,
    ...rest,
    hit: null,
  };
}

export function gradeSignalV2(input: GradingInput): GradingResult {
  const { signal, game, snapshots } = input;
  const kickoff = game.game_time;
  const lineCutoff = signal.created_at < kickoff ? signal.created_at : kickoff;
  const side = claimedSide(signal);

  if (!side) {
    // Descriptive only: record which market and where the line went before
    // kickoff, so "line value" can be shown as a fact, never as a grade.
    const market = describedMarket(signal, input.rawEventMarkets);
    const lines = market === "spread" || market === "total"
      ? { lineAtSignal: lineAtOrBefore(snapshots, lineCutoff, market), closingLine: lineAtOrBefore(snapshots, kickoff, market) }
      : {};
    return noGrade("no_side_claimed", { market, ...lines });
  }

  const market = marketOfSide(side);
  const base = { market, side } as const;

  const gameIds = new Set(snapshots.map((s) => s.source_game_id).filter((id): id is string => !!id));
  if (gameIds.size > 1) return noGrade("ambiguous_game", base);

  if (input.kickoffGuardCoversLeague
    && snapshots.some((s) => s.snapshot_at > kickoff && s.snapshot_at >= ODDS_KICKOFF_GUARD_LIVE_AT)) {
    return noGrade("kickoff_time_unreliable", base);
  }

  if (signal.created_at > kickoff) return noGrade("signal_after_kickoff", base);

  const lineAtSignal = lineAtOrBefore(snapshots, lineCutoff, market);
  if (lineAtSignal == null) return noGrade("no_signal_line", base);
  const closingLine = lineAtOrBefore(snapshots, kickoff, market);
  if (closingLine == null) return noGrade("no_pregame_line", { ...base, lineAtSignal });

  const actualResult = market === "spread" ? game.home_score - game.away_score : game.home_score + game.away_score;
  const clv = signedClv(side, lineAtSignal, closingLine);
  const won = claimWon(side, lineAtSignal, game.home_score, game.away_score);
  if (won === null) return noGrade("push", { ...base, lineAtSignal, closingLine, actualResult, clv });

  return { state: "graded", reason: null, side, market, lineAtSignal, closingLine, actualResult, hit: won, clv };
}
