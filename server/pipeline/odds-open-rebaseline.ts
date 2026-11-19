/**
 * Edge Setter — opening-line re-baselining.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE PROBLEM
 *
 * games.open_spread / games.open_total are insert-only. The odds adapter
 * writes them once, on the cycle that first sees a game
 * (open_spread: existing?.open_spread ?? spreadLine), and upsertGame's
 * ON CONFLICT clause does not name either column, so nothing ever moves them
 * again. That is the right rule when the game has been watched continuously
 * since that first cycle. It is the wrong rule when it has not.
 *
 * The Odds API hands back a whole season at once when futures are posted. On
 * prod today every future NFL game — all 124 of them — has
 * created_at = 2026-08-01, which is between 111 and 121 days before kickoff.
 * The number stored as the "open" for NFL_2026_11_22_PIT_PHI is -5.5: a line
 * from the first of August. The current line is +4.5. That is not a market
 * move anyone could have bet; it is two different markets, four months apart,
 * being subtracted from each other.
 *
 * Everything downstream reads that subtraction as news:
 *
 *   - the adapter emits a line_move raw event with line_delta: 10, which
 *     processor.ts turns into a live_signal and the scorer treats as a large
 *     market move;
 *   - crossesKeyNumber(-5.5, 4.5) is true for 3, 3.5, 6.5, 7 and 10 at once,
 *     so the signal also collects the key-number bonus;
 *   - retrieval.ts's checkLineReaction() reports "NFL line moved +10.0 pts
 *     from open (-5.5 to 4.5)" as market evidence for an unrelated injury
 *     claim on either team.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE SIGN CONVENTION — CHECKED FIRST, BECAUSE EVERYTHING ABOVE DEPENDS ON IT
 *
 * A ten-point flip invites the reading that the two columns are kept in
 * different perspectives and the "move" is an artefact. They are not, and it
 * is not. Both numbers come out of the same local variable in the same
 * upsertGame call:
 *
 *     spreadLine = spreadsMarket.outcomes.find(o => o.name === ag.home_team).point
 *     spread_team: shortCode(ag.home_team)
 *     spread_line: spreadLine
 *     open_spread: existing?.open_spread ?? spreadLine
 *
 * So spread_line is the HOME team's number, always, and open_spread is a
 * frozen copy of an earlier spread_line. Confirmed against prod: of 2,056
 * games rows carrying a spread across NFL, CFB, NBA and MLB, spread_team
 * equals home_team in 2,056 of them — there is no second perspective in the
 * data. The flips are real moves measured across an unobserved interval.
 *
 * (types.ts called this column "favourite perspective". It never was. The
 * comment is corrected there; the one piece of live code that believed it —
 * teamIsFav in retrieval.ts — is left alone and flagged, because changing it
 * moves evidence stances and that is a different decision.)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MODULE DOES
 *
 * One predicate, resolveObservedOpener, answers a single question at three
 * call sites: is the stored opener on the same unbroken run of observations
 * as the line we are about to compare it against?
 *
 * It looks for the most recent gap longer than ODDS_OPEN_REBASELINE_DAYS
 * (default 3) in the game's own snapshot history, with the caller's asOf
 * appended as a virtual final observation so the tail gap counts too. Then it
 * asks whether the LEAGUE was being ingested during that gap:
 *
 *   league active  → the hole is this game's alone (it left the feed's window
 *                    and came back). The stored opener belongs to a previous
 *                    epoch, so re-baseline to the first line observed after
 *                    the gap and emit no move for that cycle.
 *   league silent  → our ingester was down for everything. We cannot tell a
 *                    market that moved from a market we stopped watching, so
 *                    keep the opener and suppress the move as unobserved.
 *
 * Three callers, one rule, two scopes (see OpenerScope for the measurement
 * that forced the split):
 *
 *   the odds adapter   scope "tail", asOf = the cycle clock. Did the price in
 *                      hand arrive on the far side of a hole we are crossing
 *                      right now? Every hole is a tail gap exactly once — on
 *                      the cycle that closes it — so the live path never needs
 *                      to look further back, and looking further back would
 *                      cost 802ms a slate to re-derive an unchanged answer.
 *   retrieval.ts       scope "history", asOf = now. A hole ANYWHERE between
 *                      the opener and the current line means the delta spans
 *                      it, so checkLineReaction reports checked:false instead
 *                      of a number. It keeps saying so for as long as the
 *                      hole is between them; declining is cheap.
 *   the repair script  scope "history", asOf = now, on games the adapter has
 *                      been ingesting hourly for weeks. Their tail is fresh,
 *                      so the live path cannot see their old interior hole —
 *                      which is the entire reason the script exists, and why
 *                      deploying this without running it changes nothing for
 *                      the games already carrying an August opener.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 *   - It does not touch stored live_signals. line_movement.open is an input to
 *     the replay hashes (replay.ts: deriveReplayClvStates, buildReplayHashes),
 *     so rewriting history there would move every hash. games is not a replay
 *     input at all — see the hash-immovability tests.
 *   - It does not NULL an opener. A game first seen after kickoff already gets
 *     NULL market columns from touchGameSchedule (#87); a game with a real but
 *     stale opener gets a better opener, not no opener.
 *   - It adds no table. The decision is visible in one structured log line per
 *     event, and in the repair script's dry run.
 */

import { getPipelineDb } from "./store";

/* ─── Tunables ───────────────────────────────────────────────────────── */

/** Default gap, in days, beyond which an opener stops counting as observed. */
export const DEFAULT_REBASELINE_DAYS = 3;

/**
 * How long a hole in a game's snapshot history has to be before the opener on
 * the far side of it stops counting as the same market.
 *
 * Three days is chosen against the ingest cadence, not against the market. The
 * adapter attempts every 15 minutes but shouldSkipOddsFetch throttles each
 * league to one SUCCESSFUL fetch per ODDS_MIN_INTERVAL_MIN (default 60), and
 * isActiveHours suppresses the attempt outside active hours. So a healthy game
 * is snapshotted several times a day, and the longest legitimate quiet stretch
 * is a long weekend of failed fetches. Three days clears that with room and is
 * still far shorter than the months-long holes this exists for.
 *
 * Read per call rather than cached at import: the repair script sets it from a
 * flag, and the tests set it per case.
 */
export function oddsOpenRebaselineDays(): number {
  const v = Number(process.env.ODDS_OPEN_REBASELINE_DAYS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_REBASELINE_DAYS;
}

/**
 * Kill switch for the LIVE path. `ODDS_OPEN_REBASELINE=0` turns it off;
 * anything else (including unset) leaves it on.
 *
 * Same shape and same default as ODDS_KICKOFF_GUARD, deliberately: one
 * variable, "0" means off, read per call so Render's env editor takes effect
 * on the next cycle without a redeploy.
 *
 * WHAT IT DISABLES, exactly: the adapter stops ASKING the question. With no
 * verdict there is no re-baseline write and no move suppression, so the
 * ingestion path behaves exactly as it did before this change — one switch,
 * one well-understood state, rather than a half-on mode where openers are
 * frozen but moves are still being dropped.
 *
 * WHAT IT DOES NOT DISABLE: the repair script. That one is operator-driven,
 * prints before it writes and needs --apply, so the reason for a kill switch
 * — an unattended loop doing something unexpected — does not apply to it.
 * Killing the live path while still repairing by hand is a legitimate state
 * and this keeps it reachable.
 */
export const oddsOpenRebaselineEnabled = (): boolean =>
  process.env.ODDS_OPEN_REBASELINE !== "0";

/* ─── The predicate ──────────────────────────────────────────────────── */

export type OpenerStatus =
  /** No qualifying gap — the opener and the current line are one observation run. */
  | "observed"
  /** Nothing stored to judge; the caller has no opener yet. */
  | "no_open"
  /** The game has no snapshot history at all, so there is no gap to find. */
  | "no_history"
  /** A gap, and the league kept ingesting through it — re-baseline. */
  | "gap_league_active"
  /** A gap, and so was the league — keep the opener, suppress the move. */
  | "gap_league_silent";

export interface OpenerObservation {
  status: OpenerStatus;
  /**
   * True when no hole lies between the stored opener and the line the caller
   * is comparing it against. This is the question retrieval.ts asks, and it
   * stays false for as long as the hole is between them — declining to
   * comment is cheap and permanent honesty is the point.
   */
  observed: boolean;
  /** The one flag that authorises a write. See the note on one-shot below. */
  shouldRebaseline: boolean;
  /**
   * True when THIS cycle's delta would be measured across a hole we have only
   * just crossed. The adapter's suppression flag, and deliberately NOT the
   * same as `!observed`.
   *
   * The difference is the whole reason both exist. A hole stays in a game's
   * snapshot history forever, so a suppression keyed on `!observed` would fire
   * on every cycle until kickoff — one outage would silence a game for the
   * rest of its life. What is true only once is the CROSSING:
   *
   *   league active — we replace the opener on the crossing cycle. From the
   *                   next cycle the opener IS the post-gap line, the hole is
   *                   behind both endpoints, and the game is observed again.
   *   league silent — we keep the opener, so the hole stays between the two
   *                   endpoints and `observed` stays false. But our ingester
   *                   being down is not evidence that the game left its
   *                   market: both endpoints are still real prices in the same
   *                   epoch. So we drop exactly the one delta that was
   *                   computed at the edge of the hole, and let the rest
   *                   publish.
   */
  suppressMove: boolean;
  /**
   * The stored opener already equals the first line observed after the gap —
   * so the gap is behind the opener, not between it and the current line.
   * This is what makes a re-baseline one-shot rather than per-cycle.
   */
  openerIsPostGap: boolean;
  /** The gap runs from the newest observation to asOf: we are still inside it. */
  gapIsTail: boolean;
  /** Last observation before the gap, ISO. Null when there is no gap. */
  gapFrom: string | null;
  /** First observation at or after the gap, ISO; null when the gap runs to asOf. */
  gapTo: string | null;
  /** Length of the gap in days, rounded to 2dp. Null when there is no gap. */
  gapDays: number | null;
  /**
   * The line observed immediately after the gap, when the gap is INTERIOR to
   * the history. Null when the gap is the tail one, in which case the caller's
   * own current price is the post-gap line.
   */
  postGapSpread: number | null;
  postGapTotal: number | null;
  /** The threshold this verdict was reached under, for the log line. */
  thresholdDays: number;
}

const CLEAN = (status: OpenerStatus, thresholdDays: number): OpenerObservation => ({
  status,
  observed: true,
  shouldRebaseline: false,
  suppressMove: false,
  openerIsPostGap: false,
  gapIsTail: false,
  gapFrom: null,
  gapTo: null,
  gapDays: null,
  postGapSpread: null,
  postGapTotal: null,
  thresholdDays,
});

/**
 * Find the most recent gap longer than the threshold in this game's snapshot
 * history, treating asOf as a virtual final observation.
 *
 * ONE STATEMENT, not a history fetch. A CFB cycle resolves ~130 games and a
 * game watched since August carries a few thousand snapshots; pulling those
 * rows into JS to difference them would be ~300k row fetches an hour. The
 * window function does the differencing inside SQLite, walking
 * idx_odds_snapshots_game_time(game_id, snapshot_at DESC) in order, and
 * returns at most one row.
 *
 * unixepoch() parses the trailing Z these timestamps carry (verified on the
 * SQLite better-sqlite3 11 bundles, 3.49.2) and returns NULL on anything it
 * cannot read, which makes the comparison NULL, which drops the row. So a
 * malformed snapshot_at FAILS OPEN — it reports no gap and behaves exactly as
 * this code did before. That matches the kickoff guard's choice for the same
 * trade-off: a feed that changes shape must not silently stop all ingestion.
 */
const LAST_GAP_SQL = `
  SELECT prev_at AS gap_from, snapshot_at AS gap_to, spread_line, total_line,
         (unixepoch(snapshot_at) - unixepoch(prev_at)) AS gap_seconds
  FROM (
    SELECT snapshot_at, spread_line, total_line,
           LAG(snapshot_at) OVER (ORDER BY snapshot_at ASC) AS prev_at
    FROM odds_snapshots
    WHERE game_id = ? AND snapshot_at < ?
  )
  WHERE prev_at IS NOT NULL
    AND (unixepoch(snapshot_at) - unixepoch(prev_at)) > ?
  ORDER BY snapshot_at DESC
  LIMIT 1
`;

/**
 * Newest observation STRICTLY BEFORE asOf. Index-only on (game_id, snapshot_at).
 *
 * Strict, here and in the subquery above, because asOf is the instant of the
 * caller's own current line and is supplied as the virtual final observation —
 * it must not also appear as a history row. For the adapter that is not a nicety:
 * GATE 1 writes this cycle's snapshot stamped with the cycle clock BEFORE this
 * runs, so a <= would find it, measure a tail gap of zero, and never see the
 * hole it was called to find. Making the SQL strict means the predicate is
 * correct wherever it is called from rather than only where it is called now.
 */
const NEWEST_SNAPSHOT_SQL = `
  SELECT MAX(snapshot_at) AS at FROM odds_snapshots
  WHERE game_id = ? AND snapshot_at < ?
`;

/**
 * Did this league produce a snapshot for some OTHER game strictly inside the
 * gap?
 *
 * Both bounds are STRICT, and the upper one has to be. The adapter runs the
 * whole slate off one cycle clock, so by the time game 40 is assessed, games
 * 1-39 already hold rows stamped with exactly asOf. A <= here would see those,
 * call the league active during its own cycle, and re-baseline every game in
 * the slate on the first cycle back from an outage — the one case where the
 * opener should be kept.
 */
const LEAGUE_ACTIVE_SQL = `
  SELECT 1 FROM odds_snapshots
  WHERE league = ? AND game_id <> ? AND snapshot_at > ? AND snapshot_at < ?
  LIMIT 1
`;

/**
 * How much of the game's history to look at. Same rule, different question,
 * and the split is about cost as much as meaning.
 *
 *   "tail"     — only the stretch between the newest stored observation and
 *                asOf. Two index-only statements. This is the adapter's
 *                question: did the price in hand arrive on the far side of a
 *                hole we are crossing right now? Every hole is a tail gap on
 *                the cycle it closes, so the live path never needs more.
 *
 *   "history"  — also the most recent interior hole, via a window function
 *                over the whole of the game's snapshots. This is what
 *                retrieval.ts and the one-time repair need, because they ask
 *                about a hole that was crossed before they were called.
 *
 * MEASURED, and the reason the adapter does not get "history": on a
 * prod-shaped fixture (160 games, 2,600 hourly snapshots each, 416k rows) the
 * two tail statements cost 4ms for a whole CFB slate and the history
 * statement costs 802ms. 800ms of synchronous SQLite per cycle, for an answer
 * that cannot change between cycles, is not a trade worth making on the
 * ingestion loop — the repair script exists to ask it once instead.
 */
export type OpenerScope = "tail" | "history";

export interface ResolveOpenerArgs {
  gameId: string;
  league: string;
  /** The stored opener. Both null short-circuits to "no_open". */
  openSpread: number | null;
  openTotal?: number | null;
  /** The instant the caller's current line was observed. Cycle clock, or now. */
  asOfIso: string;
  /** Default "history". The adapter passes "tail" — see OpenerScope. */
  scope?: OpenerScope;
  /** Override for tests and the repair script's --days flag. */
  thresholdDays?: number;
  db?: ReturnType<typeof getPipelineDb>;
}

export function resolveObservedOpener(args: ResolveOpenerArgs): OpenerObservation {
  const thresholdDays = args.thresholdDays ?? oddsOpenRebaselineDays();

  if (args.openSpread == null && (args.openTotal ?? null) == null) {
    // Not "observed", but nothing to suppress or rewrite either.
    return { ...CLEAN("no_open", thresholdDays), observed: false };
  }

  let db: ReturnType<typeof getPipelineDb>;
  try {
    db = args.db ?? getPipelineDb();
  } catch {
    // No database is not evidence of a gap. Behave as before.
    return CLEAN("observed", thresholdDays);
  }

  const thresholdSeconds = Math.round(thresholdDays * 86_400);

  const newest = (db.prepare(NEWEST_SNAPSHOT_SQL).get(args.gameId, args.asOfIso) as
    { at: string | null } | undefined)?.at ?? null;

  // A game with no snapshot at or before asOf has no history to find a hole
  // in. That is the pre-snapshot-table population and the first cycle of a
  // brand-new game; neither is a re-baseline candidate.
  if (!newest) return CLEAN("no_history", thresholdDays);

  const interior = (args.scope ?? "history") === "history"
    ? db.prepare(LAST_GAP_SQL).get(args.gameId, args.asOfIso, thresholdSeconds) as
      | { gap_from: string; gap_to: string; spread_line: number | null; total_line: number | null; gap_seconds: number }
      | undefined
    : undefined;

  // The tail: newest observation to asOf. Computed in JS because asOf is not a
  // row. Date.parse of these ISO strings is exact; an unparseable one yields
  // NaN, the comparison is false, and we fail open as above.
  const tailSeconds = (Date.parse(args.asOfIso) - Date.parse(newest)) / 1000;
  const tailIsGap = Number.isFinite(tailSeconds) && tailSeconds > thresholdSeconds;

  // "Most recent" wins: a fresh tail means any interior gap was already lived
  // through, and a tail gap is by definition later than every interior one.
  let gapFrom: string;
  let gapTo: string | null;
  let gapSeconds: number;
  let postGapSpread: number | null;
  let postGapTotal: number | null;

  if (tailIsGap) {
    gapFrom = newest;
    gapTo = null;
    gapSeconds = tailSeconds;
    postGapSpread = null;   // the caller's current price is the post-gap line
    postGapTotal = null;
  } else if (interior) {
    gapFrom = interior.gap_from;
    gapTo = interior.gap_to;
    gapSeconds = interior.gap_seconds;
    postGapSpread = interior.spread_line;
    postGapTotal = interior.total_line;
  } else {
    return CLEAN("observed", thresholdDays);
  }

  const gapDays = Math.round((gapSeconds / 86_400) * 100) / 100;

  // Has this gap already been dealt with? If the stored opener is exactly the
  // first line observed after the hole, then the hole is BEHIND the opener
  // rather than between it and the current line — which is what a previous
  // cycle's re-baseline, or the one-time repair, leaves behind. Without this
  // the interior gap would be re-found on every subsequent cycle and the game
  // would never publish a move again.
  //
  // Equality on both markets, with null matching null. A coincidental match
  // (the line wandered back to the same number) costs nothing: re-baselining
  // to a value already stored is a no-op either way.
  const openerIsPostGap =
    !tailIsGap &&
    postGapSpread === (args.openSpread ?? null) &&
    postGapTotal === (args.openTotal ?? null);

  if (openerIsPostGap) {
    return {
      ...CLEAN("observed", thresholdDays),
      openerIsPostGap: true,
      gapFrom, gapTo, gapDays, postGapSpread, postGapTotal,
    };
  }

  const leagueActive = db.prepare(LEAGUE_ACTIVE_SQL)
    .get(args.league, args.gameId, gapFrom, gapTo ?? args.asOfIso) !== undefined;

  return {
    status: leagueActive ? "gap_league_active" : "gap_league_silent",
    observed: false,
    shouldRebaseline: leagueActive,
    // Active: the opener is about to be replaced, so this cycle's delta is
    // zero by construction and publishing it would be noise.
    // Silent: only the crossing cycle is dropped — see suppressMove's note.
    suppressMove: leagueActive || tailIsGap,
    openerIsPostGap: false,
    gapIsTail: tailIsGap,
    gapFrom,
    gapTo,
    gapDays,
    postGapSpread,
    postGapTotal,
    thresholdDays,
  };
}

/* ─── The writer ─────────────────────────────────────────────────────── */

export type RebaselineResult =
  | {
      written: true;
      from: { spread: number | null; total: number | null };
      to: { spread: number | null; total: number | null };
    }
  | { written: false; reason: "missing" | "started" | "final" | "unchanged" | "nothing_to_write" };

/**
 * The ONLY writer of games.open_spread / games.open_total besides the insert
 * in upsertGame.
 *
 * That is the whole point of putting it here rather than widening upsertGame's
 * ON CONFLICT clause. The insert-only invariant is what makes "the opener is
 * the first line we saw" true at all, and every reader depends on it; what we
 * want is not to relax it but to add exactly one audited exception beside it,
 * where the exception can carry its own guards and its own log line. Three
 * callers exist (adapter, repair script, tests) and grep finds all of them.
 *
 * GUARDS. It refuses after kickoff, so #87 wins wherever the two meet. The
 * clock it uses is the STORED game_time, not a feed commence_time, because the
 * repair script has no feed. The two differ: game_time is not updated on
 * conflict, so a game rescheduled LATER still carries its old time and reads
 * as started — a refusal, which is the safe direction. A game moved EARLIER
 * reads as unstarted, which the adapter covers with the feed clock on its own
 * path and the script covers by selecting only future games.
 *
 * It writes nothing when the values already match, so re-running the repair is
 * a no-op rather than an updated_at churn.
 */
export function rebaselineGameOpen(
  gameId: string,
  openSpread: number | null,
  openTotal: number | null,
  reason: string,
  opts?: {
    nowIso?: string;
    db?: ReturnType<typeof getPipelineDb>;
    quiet?: boolean;
    /** Carried into the log line only. Both callers have them; neither is
     *  needed to decide anything, and a log you cannot filter by league or
     *  sort by hole size is a log you have to read line by line. */
    league?: string;
    gapDays?: number | null;
  },
): RebaselineResult {
  const db = opts?.db ?? getPipelineDb();
  const nowIso = opts?.nowIso ?? new Date().toISOString();

  const row = db.prepare(
    "SELECT game_time, status, open_spread, open_total FROM games WHERE id = ?",
  ).get(gameId) as
    | { game_time: string; status: string; open_spread: number | null; open_total: number | null }
    | undefined;

  if (!row) return { written: false, reason: "missing" };
  if (row.status === "final") return { written: false, reason: "final" };

  const kickoffMs = Date.parse(row.game_time);
  // An unparseable game_time cannot be shown to be in the future, so it is
  // refused. This is the opposite of the kickoff guard's fail-open, and
  // deliberately so: there the cost of failing closed is losing all ingestion,
  // here it is declining to rewrite one opener.
  if (!Number.isFinite(kickoffMs) || kickoffMs <= Date.parse(nowIso)) {
    return { written: false, reason: "started" };
  }

  if (openSpread == null && openTotal == null) {
    return { written: false, reason: "nothing_to_write" };
  }

  // Null never overwrites a stored number: a cycle that lost the totals market
  // must not erase the total we already have.
  const nextSpread = openSpread ?? row.open_spread;
  const nextTotal = openTotal ?? row.open_total;

  if (nextSpread === row.open_spread && nextTotal === row.open_total) {
    return { written: false, reason: "unchanged" };
  }

  db.prepare(
    "UPDATE games SET open_spread = ?, open_total = ?, updated_at = ? WHERE id = ?",
  ).run(nextSpread, nextTotal, nowIso, gameId);

  if (!opts?.quiet) {
    logRebaseline({
      event: "open_rebaselined",
      game_id: gameId,
      league: opts?.league ?? null,
      reason,
      gap_days: opts?.gapDays ?? null,
      from_spread: row.open_spread,
      to_spread: nextSpread,
      from_total: row.open_total,
      to_total: nextTotal,
      at: nowIso,
    });
  }

  return {
    written: true,
    from: { spread: row.open_spread, total: row.open_total },
    to: { spread: nextSpread, total: nextTotal },
  };
}

/* ─── The one-time repair ────────────────────────────────────────────── */

/**
 * The live path above can only catch a gap while the game is still inside it:
 * it compares the newest prior snapshot against the cycle clock. A game that
 * fell out of the feed in August, came back in November and has been
 * ingested hourly ever since has a perfectly fresh tail. The adapter will
 * never look at it again, and its opener is still the August number.
 *
 * That population is what this repairs, and it is finite and shrinking: once
 * these games kick off they are gone, and the live path stops new ones
 * joining. There is no migration and no schedule — it is one operator run,
 * and running it twice does nothing the second time.
 *
 * Same function, same guards, same predicate. The only difference is which
 * gap the predicate finds, which follows from asOf rather than from a
 * different rule.
 */
export const REPAIR_LEAGUES = ["NFL", "CFB", "NBA", "MLB"] as const;
export type RepairLeague = (typeof REPAIR_LEAGUES)[number];

/** Leagues the repair touches when --league is not given. */
export const REPAIR_DEFAULT_LEAGUES: readonly RepairLeague[] = ["NFL", "CFB"];

export type RepairVerdict =
  /** A gap, the league kept ingesting, and there is a post-gap line to use. */
  | "rebaseline"
  /** A gap, but the league was silent through it — opener kept. */
  | "skip_league_silent"
  /** A gap that runs to now: the game has not come back, so there is no post-gap line. */
  | "skip_no_post_gap_line"
  /** The post-gap line equals the stored opener — nothing to do. */
  | "skip_already_correct"
  /** No qualifying gap. */
  | "skip_observed";

export interface RepairCandidate {
  game_id: string;
  league: string;
  game_time: string;
  verdict: RepairVerdict;
  open_spread: number | null;
  open_total: number | null;
  new_open_spread: number | null;
  new_open_total: number | null;
  spread_line: number | null;
  gap_days: number | null;
  gap_from: string | null;
  gap_to: string | null;
  status: OpenerStatus;
  /** Reporting only — see openerProvenance. */
  created_at: string | null;
  first_snapshot_at: string | null;
  snapshot_count: number;
  opener_lead_days: number | null;
}

/**
 * Every future, unfinished game in scope that has an opener to judge.
 *
 * `game_time > now` is both the selection rule and the kickoff guard: the
 * whole point is games whose lines still matter, and rebaselineGameOpen
 * refuses the rest anyway. `status != 'final'` is belt and braces for a row
 * whose score landed before its clock did.
 */
const REPAIR_CANDIDATES_SQL = `
  SELECT id, league, game_time, open_spread, open_total, spread_line, total_line,
         created_at
  FROM games
  WHERE league = ?
    AND status != 'final'
    AND game_time > ?
    AND (open_spread IS NOT NULL OR open_total IS NOT NULL)
  ORDER BY game_time ASC
`;

/**
 * When the opener was written, and when the snapshot record for that game
 * actually starts.
 *
 * `games.open_spread` is insert-only, so `games.created_at` IS the instant the
 * stored opener was written — not an approximation of it. Comparing that
 * against the game's earliest snapshot answers a question the gap predicate
 * structurally cannot: the predicate finds holes BETWEEN snapshot rows, so a
 * hole that opens before the first row has no `prev_at` to be measured from
 * and is invisible to it.
 *
 * Reported, never acted on. A long lead here means "this opener predates the
 * evidence we hold", which is a reason to look, not a licence to overwrite —
 * there is no post-gap line to re-baseline TO that the gap rule has not
 * already found. It exists so the dry run can show whether the population an
 * operator is worried about is the population this script actually repairs.
 */
const OPENER_PROVENANCE_SQL = `
  SELECT MIN(snapshot_at) AS first_at, COUNT(*) AS n
  FROM odds_snapshots WHERE game_id = ?
`;

export interface OpenerProvenance {
  /** games.created_at — the instant open_spread was written. */
  createdAt: string | null;
  /** Earliest snapshot we hold for the game, if any. */
  firstSnapshotAt: string | null;
  /** Snapshot rows held for the game. */
  snapshotCount: number;
  /**
   * Days from the opener's write to the first snapshot. Null when either end
   * is missing or unparseable. Negative is possible and harmless (a snapshot
   * written in the same cycle, microseconds either side).
   */
  leadDays: number | null;
}

export function openerProvenance(
  gameId: string,
  createdAt: string | null,
  db?: ReturnType<typeof getPipelineDb>,
): OpenerProvenance {
  const handle = db ?? getPipelineDb();
  const row = handle.prepare(OPENER_PROVENANCE_SQL).get(gameId) as
    | { first_at: string | null; n: number }
    | undefined;
  const firstSnapshotAt = row?.first_at ?? null;
  let leadDays: number | null = null;
  if (createdAt && firstSnapshotAt) {
    const d = (Date.parse(firstSnapshotAt) - Date.parse(createdAt)) / 86_400_000;
    if (Number.isFinite(d)) leadDays = Math.round(d * 100) / 100;
  }
  return { createdAt, firstSnapshotAt, snapshotCount: row?.n ?? 0, leadDays };
}

/**
 * The line_move signals standing on a game right now.
 *
 * Part of the dry run's record rather than its decision: re-baselining an
 * opener does not touch a stored signal (that is what keeps replay hashes
 * still), so these rows are what was already published off the old opener.
 * An operator reading the plan wants to see them next to the number being
 * changed.
 */
const LINE_MOVE_SIGNALS_SQL = `
  SELECT id, signal_type, headline, line_movement, score, created_at
  FROM live_signals
  WHERE game_id = ? AND signal_type = 'line_move'
  ORDER BY created_at ASC
`;

export interface LineMoveSignalRow {
  id: string;
  signal_type: string;
  headline: string;
  line_movement: string | null;
  score: number;
  created_at: string;
}

export function lineMoveSignalsForGame(
  gameId: string,
  db?: ReturnType<typeof getPipelineDb>,
): LineMoveSignalRow[] {
  const handle = db ?? getPipelineDb();
  try {
    return handle.prepare(LINE_MOVE_SIGNALS_SQL).all(gameId) as LineMoveSignalRow[];
  } catch {
    // A reporting extra must never take the plan down with it.
    return [];
  }
}

export function planOpenerRepair(opts: {
  leagues: readonly string[];
  nowIso?: string;
  thresholdDays?: number;
  db?: ReturnType<typeof getPipelineDb>;
}): RepairCandidate[] {
  const db = opts.db ?? getPipelineDb();
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const thresholdDays = opts.thresholdDays ?? oddsOpenRebaselineDays();
  const out: RepairCandidate[] = [];

  for (const league of opts.leagues) {
    const rows = db.prepare(REPAIR_CANDIDATES_SQL).all(league, nowIso) as Array<{
      id: string; league: string; game_time: string;
      open_spread: number | null; open_total: number | null;
      spread_line: number | null; total_line: number | null;
      created_at: string | null;
    }>;

    for (const row of rows) {
      const obs = resolveObservedOpener({
        gameId: row.id,
        league: row.league,
        openSpread: row.open_spread,
        openTotal: row.open_total,
        asOfIso: nowIso,
        thresholdDays,
        db,
      });

      const prov = openerProvenance(row.id, row.created_at ?? null, db);

      const base = {
        game_id: row.id,
        league: row.league,
        game_time: row.game_time,
        created_at: prov.createdAt,
        first_snapshot_at: prov.firstSnapshotAt,
        snapshot_count: prov.snapshotCount,
        opener_lead_days: prov.leadDays,
        open_spread: row.open_spread,
        open_total: row.open_total,
        spread_line: row.spread_line,
        gap_days: obs.gapDays,
        gap_from: obs.gapFrom,
        gap_to: obs.gapTo,
        status: obs.status,
      };

      if (obs.observed) {
        // A gap that is already behind the opener (a previous run of this
        // repair, or a live re-baseline) reports as observed, with the gap
        // fields still populated. Worth its own bucket so a second run reads
        // as "already done" rather than "never had a problem".
        out.push({
          ...base,
          verdict: obs.openerIsPostGap ? "skip_already_correct" : "skip_observed",
          new_open_spread: null,
          new_open_total: null,
        });
        continue;
      }
      if (!obs.shouldRebaseline) {
        out.push({ ...base, verdict: "skip_league_silent", new_open_spread: null, new_open_total: null });
        continue;
      }
      // A tail gap here means the game left the feed and has not come back, so
      // there is no post-gap observation to re-baseline TO. The live path would
      // handle it on the cycle it returns; until then the opener stands.
      if (obs.postGapSpread == null && obs.postGapTotal == null) {
        out.push({ ...base, verdict: "skip_no_post_gap_line", new_open_spread: null, new_open_total: null });
        continue;
      }

      out.push({
        ...base,
        verdict: "rebaseline",
        new_open_spread: obs.postGapSpread ?? row.open_spread,
        new_open_total: obs.postGapTotal ?? row.open_total,
      });
    }
  }

  return out;
}

/* ─── The log line ───────────────────────────────────────────────────── */

/**
 * One line, one JSON object, one prefix. No new table: the decisions are rare
 * (a game re-baselines at most once per gap) and the two questions anyone will
 * ask of them — "did this fire?" and "on what?" — are both answerable from
 * Render's log search on the prefix. A table would need a migration, a
 * retention rule and a reader, which is three more things than the question is
 * worth.
 */
export function logRebaseline(fields: Record<string, unknown>): void {
  console.log(`[odds-open] ${JSON.stringify(fields)}`);
}
