import {
  deriveBoardEscalation,
  laneForEscalation,
  SITUATION_LANE_RANK,
  BOARD_ESCALATION_RANK,
  type BoardEscalation,
  type BoardEscalationInput,
  type SituationLane,
} from "./boardEscalation";
import { getLeagueBoardProfile } from "./leagueBoardProfiles";
import { ageHoursFrom } from "./storyAge";
import type { Sport } from "./leagueModifiers";
import { hasValidPublicSignalIdentity } from "./publicDisplayHygiene";
import { storedGameNames, teamDisplayLabel } from "./teamDisplayNames";
import { gameOpeners, resolveSignalMarketMove, type MarketMove } from "./marketMove";
import {
  signalAgeMinutes,
  signalConfidence,
  signalHasMovement,
  signalConfidenceNarrative,
  signalIsActionable,
  signalLifecycle,
  signalMarketReaction,
  signalOperationalLifecycle,
  signalPriorityScore,
  signalReplayChain,
  signalSourceCount,
  signalSourceSummary,
  signalTimingAdvantage,
  signalTrustLabel,
  type OperationalLifecycle,
  type BoardSignalLike,
  type SignalLifecycle,
} from "./signalBoardUx";

/**
 * How stale a row may be and still appear on a board, and how many cards a
 * board shows before the reader asks for more.
 *
 * WHY AN AGE CUT. The boards had none. `/api/v2/signals` serves the newest 100
 * regardless of age and `/api/v2/situations` the top 100 by operational
 * visibility score, which is not a recency measure at all — so on prod today
 * the NBA board carries 15 canonical situations between 7 and 30 days old and
 * the MLB board carries 78, mixed in among rows from this morning with nothing
 * to tell them apart but a relative timestamp. A board is a claim that these
 * are the stories live right now.
 *
 * WHY lastUpdatedAt AND NOT firstSeenAt. A situation founded last week whose
 * evidence changed an hour ago is live; its first-seen date says the opposite.
 * The featured-story selector uses first-detected deliberately (a board LEAD
 * implies active development, see FEATURED_MAX_AGE_HOURS) — this is the
 * different question of whether the row belongs on the page at all.
 *
 * WHY UNKNOWN AGE IS KEPT. Same rule featuredAgeHours already follows: a games
 * row carries no update time we can read as an age, and `publicGamesForLeague`
 * has already windowed the slate. Dropping a row because we cannot date it
 * would take the whole slate off every board.
 *
 * MEASURED on prod, four boards, 2026-11-19. Rows removed by the 3-day cut:
 * NFL 46 (signals only), CFB 52 (signals only), NBA 67 (38 situations + 29
 * signals), MLB 78 (situations, all offseason). MLB's board goes nearly empty,
 * which is what an offseason board honestly looks like — MLBBoard already has
 * a quiet-board state for it.
 */
export const BOARD_MAX_AGE_DAYS = 3;

/**
 * Cards shown before "Show more". The boards rendered every row they had — 185
 * to 212 cards on NFL and CFB — so the twentieth card and the two-hundredth
 * were presented as equally worth reading.
 */
export const BOARD_INITIAL_CARD_CAP = 25;

export type BoardSituationKind = "signal" | "game" | "canonical";

export type BoardSituation = {
  id: string;
  kind: BoardSituationKind;
  league: Sport;
  lane: SituationLane;
  escalation: BoardEscalation;
  title: string;
  /**
   * {@link title} with each side under the name the feed gave it, for DISPLAY
   * only. Undefined when there is no better name than the tokens already in
   * `title`, which is every signal-sourced situation and every games row with
   * neither a stored name nor a CFB token one school owns.
   *
   * `title` itself stays in tokens because headline copy parses it —
   * `editorialHeadline` reads it for the player, the team and the
   * market-dominant test, and `storyTitleHasValidPlayerName` gates on it.
   * Same split, and the same reason, as `matchup` / `matchupLabel`.
   */
  titleLabel?: string;
  detail?: string;
  gameId?: string | number;
  awayTeam?: string;
  homeTeam?: string;
  team?: string;
  opponent?: string;
  player?: string;
  signalType?: string;
  statusLabel?: string;
  timeLabel?: string;
  movementLabel?: string;
  score: number;
  confidence: number;
  sourceCount: number;
  trustLabel: string;
  lifecycle: SignalLifecycle;
  lifecycleStage: OperationalLifecycle;
  confidenceNote?: string;
  confidenceJourney?: string;
  sourceSummary?: string;
  timingAdvantage?: string;
  detectionLeadTime?: string;
  detectionLeadKind?: "confirmation" | "pickup";
  marketReaction?: string;
  /**
   * Which market a line move happened in, and the sentence to print for it.
   * Resolved HERE, not in the adapters, because this is the only place that
   * holds both the signal (the move's own numbers) and the games row (the
   * market's current openers) at the same time. See resolveMarketMove.
   */
  marketMove?: MarketMove;
  replayChain?: string[];
  isLive: boolean;
  isActionable: boolean;
  relatedSignalIds: Array<string | number>;
  signal?: unknown;
  game?: unknown;
  canonicalSituation?: unknown;
};

export type BoardSignalInput = BoardEscalationInput & {
  id?: string | number;
  headline?: string | null;
  detail?: string | null;
  player?: string | null;
  team?: string | null;
  opponent?: string | null;
  matchup?: string | null;
  gameId?: string | number | null;
};

export type BoardGameInput = {
  id?: string | number;
  away?: string | null;
  home?: string | null;
  awayFull?: string | null;
  homeFull?: string | null;
  awayTeam?: string | null;
  homeTeam?: string | null;
  away_team?: string | null;
  home_team?: string | null;
  /** `games.away_team_name` / `home_team_name`. See AnyBoardGame in boardAdapters. */
  awayTeamName?: string | null;
  homeTeamName?: string | null;
  away_team_name?: string | null;
  home_team_name?: string | null;
  status?: string | null;
  statusDescription?: string | null;
  gameDate?: Date | string | null;
  game_time?: Date | string | null;
  time?: string | null;
  spread?: string | null;
  total?: string | null;
  signals?: number | null;
  lineMovement?: unknown;
  /** `games.open_spread` / `games.open_total`. See gameOpeners in lib/marketMove. */
  openSpread?: number | string | null;
  openTotal?: number | string | null;
  open_spread?: number | string | null;
  open_total?: number | string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  home_score?: number | null;
  away_score?: number | null;
};

/**
 * @param game The games row this signal sits on, when the caller found one.
 *   Its openers are what tells a total move from a spread move, and whether the
 *   move's own `open` is still the opener. Optional: a signal that matched no
 *   game still gets a row, with its market resolved from magnitude alone.
 * @param gameIsOwn True when `game` is the row named by the signal's own
 *   `game_id`, not a team-token guess. Only then is the row carried on the
 *   situation, with its away/home sides, so the card can name both teams.
 */
export function toBoardSignalSituation(signal: BoardSignalInput, league: Sport, game?: BoardGameInput, gameIsOwn = false): BoardSituation {
  const escalation = deriveBoardEscalation(signal);
  const marketMove = resolveSignalMarketMove(signal as { team?: string | null; lineMovement?: unknown }, {
    league,
    ...gameOpeners(game),
  });
  const isActionable = signalIsActionable(signal);
  const lifecycle = signalLifecycle(signal);
  const isConfirmed = lifecycle === "Confirmed";
  const lane = laneForEscalation(escalation, { isActionable, isConfirmed });
  const id = signal.id ?? `${league}-${signal.team ?? "signal"}-${signal.headline ?? "unknown"}`;
  const own = gameIsOwn && game ? game : undefined;

  return {
    id: `signal-${String(id)}`,
    kind: "signal",
    league,
    lane,
    escalation,
    title: signal.headline ?? "Untitled signal",
    detail: signal.detail ?? undefined,
    ...(own ? {
      game: own,
      gameId: own.id,
      awayTeam: own.awayTeam ?? own.away_team ?? undefined,
      homeTeam: own.homeTeam ?? own.home_team ?? undefined,
    } : {}),
    team: signal.team ?? undefined,
    opponent: signal.opponent ?? undefined,
    player: signal.player ?? undefined,
    signalType: signal.type ?? undefined,
    movementLabel: movementLabel(signal),
    score: signalPriorityScore(signal),
    confidence: signalConfidence(signal),
    sourceCount: signalSourceCount(signal),
    trustLabel: signalTrustLabel(signal),
    lifecycle,
    lifecycleStage: signalOperationalLifecycle(signal),
    confidenceNote: signalConfidenceNarrative(signal),
    sourceSummary: signalSourceSummary(signal),
    timingAdvantage: signalTimingAdvantage(signal),
    marketReaction: signalMarketReaction(signal, marketMove),
    marketMove,
    replayChain: signalReplayChain(signal),
    isLive: false,
    isActionable,
    relatedSignalIds: [id],
    signal,
  };
}

export function toBoardGameSituation(
  game: BoardGameInput,
  league: Sport,
  relatedSignals: BoardSignalInput[] = [],
): BoardSituation {
  const statusLabel = game.statusDescription ?? game.status ?? "Scheduled";
  const isLive = isLiveStatus(statusLabel);
  const topSignal = rankSignals(relatedSignals)[0];
  const marketMove = resolveSignalMarketMove(topSignal as { team?: string | null; lineMovement?: unknown } | undefined, {
    league,
    ...gameOpeners(game),
  });
  const escalation = topSignal
    ? deriveBoardEscalation(topSignal, { isLiveGame: isLive })
    : isLive
      ? "Watch"
      : "Quiet";
  const isActionable = topSignal ? signalIsActionable(topSignal) : false;
  const topLifecycle = topSignal ? signalLifecycle(topSignal) : "Developing";
  const lane = laneForEscalation(escalation, {
    isLiveGame: isLive,
    isActionable,
    isConfirmed: topSignal ? signalLifecycle(topSignal) === "Confirmed" : false,
  });
  const awayTeam = game.awayTeam ?? game.away_team ?? game.away ?? game.awayFull ?? "TBD";
  const homeTeam = game.homeTeam ?? game.home_team ?? game.home ?? game.homeFull ?? "TBD";
  const id = game.id ?? `${league}-${awayTeam}-${homeTeam}`;
  const scores = scoreLabel(game);
  // Display-only names for the title. The tokens above are untouched: they are
  // the `awayTeam`/`homeTeam` fields below, which every logo lookup and every
  // headline parser reads. See BoardSituation.titleLabel.
  const stored = storedGameNames(game);
  const awayLabel = teamDisplayLabel(awayTeam, stored.away, league) ?? awayTeam;
  const homeLabel = teamDisplayLabel(homeTeam, stored.home, league) ?? homeTeam;
  const title = scores ? `${awayTeam} @ ${homeTeam} ${scores}` : `${awayTeam} @ ${homeTeam}`;
  const titleLabel = scores ? `${awayLabel} @ ${homeLabel} ${scores}` : `${awayLabel} @ ${homeLabel}`;

  return {
    id: `game-${String(id)}`,
    kind: "game",
    league,
    lane,
    escalation,
    title,
    // Omitted, not echoed, when it adds nothing: an undefined titleLabel is how
    // every consumer's `titleLabel ?? title` fallback stays honest.
    titleLabel: titleLabel === title ? undefined : titleLabel,
    detail: topSignal?.headline ?? game.spread ?? game.total ?? undefined,
    gameId: id,
    awayTeam,
    homeTeam,
    signalType: topSignal?.type ?? undefined,
    statusLabel,
    timeLabel: game.time ?? formatGameTime(game.gameDate ?? game.game_time),
    movementLabel: game.lineMovement ? "Market reaction" : topSignal ? movementLabel(topSignal) : undefined,
    score: topSignal ? signalPriorityScore(topSignal) + (isLive ? 8 : 0) : isLive ? 38 : 12,
    confidence: topSignal ? signalConfidence(topSignal) : 0,
    sourceCount: relatedSignals.reduce((sum, signal) => sum + signalSourceCount(signal), 0),
    trustLabel: topSignal ? signalTrustLabel(topSignal) : "Monitoring",
    lifecycle: topLifecycle,
    lifecycleStage: topSignal ? signalOperationalLifecycle(topSignal) : isLive ? "Developing" : "Detected",
    confidenceNote: topSignal ? signalConfidenceNarrative(topSignal) : "Game context only; no verified story attached",
    sourceSummary: topSignal ? signalSourceSummary(topSignal) : "Source agreement pending",
    timingAdvantage: topSignal ? signalTimingAdvantage(topSignal) : isLive ? "Live game, no elevated story" : "Scheduled context only",
    marketReaction: topSignal ? signalMarketReaction(topSignal, marketMove) : game.lineMovement ? "Market reaction logged on game" : "Market reaction quiet",
    marketMove,
    replayChain: topSignal ? signalReplayChain(topSignal) : ["Story detected", isLive ? "Live watch" : "Scheduled watch"],
    isLive,
    isActionable,
    relatedSignalIds: relatedSignals.map(signal => signal.id ?? signal.headline ?? "").filter(Boolean),
    game,
  };
}

export function buildBoardSituations({
  league,
  games = [],
  signals = [],
  allGames = [],
}: {
  league: Sport;
  games?: BoardGameInput[];
  signals?: BoardSignalInput[];
  /**
   * The league's whole games table, unwindowed. Only read to look a signal's
   * own `game_id` up — `games` is the three-day slate and misses the row for
   * any signal written against a game outside it.
   */
  allGames?: BoardGameInput[];
}): BoardSituation[] {
  const publicSignals = signals.filter((signal) => hasValidPublicSignalIdentity(signal) && !isOpeningLineOnlyBoardSignal(signal));
  const byId = new Map<string, BoardGameInput>();
  for (const game of [...allGames, ...games]) if (game.id != null) byId.set(String(game.id), game);
  // The signal's own game, so its market move can be checked against that
  // game's openers: the row its `game_id` names first, then the same predicate
  // the game rows below use to collect their related signals, read the other
  // way round. Ambiguous is the same as absent, because an opener from the
  // wrong game is worse than no opener at all.
  const gameForSignal = (signal: BoardSignalInput): { game?: BoardGameInput; own: boolean } => {
    const own = signal.gameId ? byId.get(String(signal.gameId)) : undefined;
    if (own) return { game: own, own: true };
    const matches = games.filter(game => signalMatchesGame(signal, game));
    return { game: matches.length === 1 ? matches[0] : undefined, own: false };
  };
  const signalSituations = publicSignals.map(signal => {
    const { game, own } = gameForSignal(signal);
    return toBoardSignalSituation(signal, league, game, own);
  });
  const gameSituations = games.map(game => {
    const related = publicSignals.filter(signal => signalMatchesGame(signal, game));
    return toBoardGameSituation(game, league, related);
  });
  return rankBoardSituations([...gameSituations, ...signalSituations]);
}

function isOpeningLineOnlyBoardSignal(signal: BoardSignalInput) {
  const type = String(signal.type ?? "").toLowerCase();
  const text = `${signal.headline ?? ""} ${signal.detail ?? ""} ${(signal as { action_takeaway?: string | null }).action_takeaway ?? ""}`;
  if (type !== "line_move" || !/\bopening line|market baseline|opened at\b/i.test(text)) return false;
  const movement = (signal as { lineMovement?: { open?: string | number | null; current?: string | number | null; note?: string | null } | null }).lineMovement;
  if (!movement) return true;
  const open = Number(movement.open);
  const current = Number(movement.current);
  const sameNumber = Number.isFinite(open) && Number.isFinite(current) && Math.abs(open - current) < 0.05;
  return sameNumber || /moved\s+\+?0(?:\.0+)?\s+pts?/i.test(movement.note ?? "");
}

/**
 * The unordered pair of team tokens a situation names, or null when it does not
 * name two distinct ones.
 *
 * Tokens, never the display names #101/#104 added: a games row stores
 * `shortCode(odds name)` and a signal carries the same abbreviation, so the two
 * lineages only line up before either is resolved to a school. Unordered
 * because the two lineages disagree about direction on purpose — a games row is
 * away-then-home, while a signal is subject-then-opponent, so prod serves
 * `BEA @ GAM` for the game and `GAM-BEA` for the signal about it.
 *
 * "TBD" is not a team. Two unscheduled rows would otherwise share one pair and
 * suppress each other.
 */
export function situationMatchupPair(situation: BoardSituation): string | null {
  const away = normalizeTeamToken(situation.awayTeam ?? situation.team);
  const home = normalizeTeamToken(situation.homeTeam ?? situation.opponent);
  if (!away || !home || away === home) return null;
  if (away === "tbd" || home === "tbd") return null;
  return [away, home].sort().join("|");
}

/**
 * Drop a game-derived row when a signal- or canonical-derived row already
 * covers the same matchup.
 *
 * A game row is a scheduled-context placeholder: it carries no story of its own
 * ("Game context only; no verified story attached"), and its whole contribution
 * is the matchup, the kickoff and the score. When a real story already names
 * both of the same teams, the game row is a second card saying less about the
 * same fixture.
 *
 * Measured against the prod slates on 2026-11-19: 59 of 67 CFB game rows and
 * 11 of 11 NFL game rows sat on a matchup that already had a story card.
 *
 * Only a row that names BOTH teams suppresses, and only an exact unordered
 * match counts. A story about one team does not stand in for the fixture: a
 * Georgia injury says nothing about who Georgia plays, and a one-sided rule
 * would erase a game row for every team with any open story.
 *
 * Deliberately computed over the whole merged list rather than the filtered
 * one, so a game row does not blink back into view when a lane or urgency
 * filter hides the story that covers it.
 */
export function dropGameSituationsCoveredByStories(
  situations: readonly BoardSituation[],
): BoardSituation[] {
  const covered = new Set<string>();
  for (const situation of situations) {
    if (situation.kind === "game") continue;
    const pair = situationMatchupPair(situation);
    if (pair) covered.add(pair);
  }
  if (!covered.size) return [...situations];
  return situations.filter((situation) => {
    if (situation.kind !== "game") return true;
    const pair = situationMatchupPair(situation);
    return !pair || !covered.has(pair);
  });
}

/**
 * When this situation last CHANGED, as an ISO string, or null when the row
 * carries nothing we can read as one.
 *
 * Canonical rows carry `lastUpdatedAt`. Signal rows carry `updated_at` when the
 * caller passed the raw row through and `isoTimestamp` once the board adapters
 * have been over it (they set it from `signal_time ?? created_at`). Game rows
 * carry neither: `cachedAt` is when WE fetched the fixture, not when anything
 * about it changed, so reading it as an age would date every fixture to this
 * minute and the filter would be theatre.
 */
export function lastUpdatedIso(situation: BoardSituation): string | null {
  if (situation.kind === "canonical" && situation.canonicalSituation) {
    const raw = (situation.canonicalSituation as { lastUpdatedAt?: string | null }).lastUpdatedAt;
    if (raw) return raw;
  }
  if (situation.kind === "signal" && situation.signal) {
    const sig = situation.signal as {
      updated_at?: string | null;
      isoTimestamp?: string | null;
      signal_time?: string | null;
      created_at?: string | null;
    };
    return sig.updated_at ?? sig.isoTimestamp ?? sig.signal_time ?? sig.created_at ?? null;
  }
  return null;
}

/**
 * The situations that have changed within {@link BOARD_MAX_AGE_DAYS}.
 *
 * A row we cannot date is kept — see the constant for why. `maxAgeDays` is a
 * parameter only so tests can pin the boundary without reaching for fake
 * timers; every board passes the default.
 */
export function withinBoardAge(
  situations: readonly BoardSituation[],
  referenceTime: number = Date.now(),
  maxAgeDays: number = BOARD_MAX_AGE_DAYS,
): BoardSituation[] {
  const maxHours = maxAgeDays * 24;
  return situations.filter((situation) => {
    const iso = lastUpdatedIso(situation);
    if (!iso) return true;
    const hours = ageHoursFrom(iso, referenceTime);
    if (!Number.isFinite(hours)) return true;
    return hours <= maxHours;
  });
}

export function rankBoardSituations(situations: BoardSituation[]): BoardSituation[] {
  return [...situations].sort((a, b) => {
    const laneDiff = SITUATION_LANE_RANK[b.lane] - SITUATION_LANE_RANK[a.lane];
    if (laneDiff) return laneDiff;
    const escalationDiff = BOARD_ESCALATION_RANK[b.escalation] - BOARD_ESCALATION_RANK[a.escalation];
    if (escalationDiff) return escalationDiff;
    const scoreDiff = b.score - a.score;
    if (scoreDiff) return scoreDiff;
    const ageDiff = ageForSort(a) - ageForSort(b);
    if (ageDiff) return ageDiff;
    return a.id.localeCompare(b.id);
  });
}

export function rankSignals<T extends BoardSignalLike>(signals: T[]): T[] {
  return [...signals].sort((a, b) => {
    const scoreDiff = signalPriorityScore(b) - signalPriorityScore(a);
    if (scoreDiff) return scoreDiff;
    const ageDiff = (signalAgeMinutes(a) ?? 999999) - (signalAgeMinutes(b) ?? 999999);
    if (ageDiff) return ageDiff;
    return String((a as { id?: unknown }).id ?? "").localeCompare(String((b as { id?: unknown }).id ?? ""));
  });
}

const FEATURED_BLOCKED_SIGNAL_TYPES = new Set([
  "roster_move",
  "transaction",
  "depth_chart_update",
]);

/**
 * A situation that cannot lead a board, because leading it is a claim that this
 * is the live story.
 *
 * The background LANE was already excluded. A Stale or Expiring LIFECYCLE was
 * not, and the two do not imply each other: `laneForEscalation` puts a row in
 * `decision` on `isActionable` plus a Watch escalation, and `signalIsActionable`
 * only excludes Stale — so an Expiring row with an action note lands in
 * `decision` and was eligible to lead. On prod today that is exactly what the
 * CFB board does: its lead is a line move whose lifecycle is Expiring.
 *
 * Both exclusions are applied together, at both tiers, so the cascade is
 * unchanged: a board with nothing but cooling rows still shows a lead rather
 * than the quiet-board state, because the final fallback is the whole
 * within-age pool.
 */
function isCooling(situation: BoardSituation): boolean {
  return situation.lane === "background"
    || situation.lifecycle === "Stale"
    || situation.lifecycle === "Expiring";
}

/**
 * Shared lead-rank comparator: confidence descending, firstDetected descending.
 * Used by both selectFeaturedSituation (board lead) and selectHomepageLead
 * so both surfaces always agree on which situation leads.
 */
export function compareLeadRank(
  aConf: number, aFirstDetectedMs: number,
  bConf: number, bFirstDetectedMs: number,
): number {
  const confDiff = bConf - aConf;
  if (confDiff) return confDiff;
  return bFirstDetectedMs - aFirstDetectedMs;
}

/**
 * Board "top developing story" staleness cap. Tighter than the homepage's
 * LEAD_MAX_AGE_HOURS (7 days) because a board lead implies active development,
 * not a settled story. Situations older than this can't be featured.
 */
export const FEATURED_MAX_AGE_HOURS = 48;

/** Raw first-detected ISO timestamp for a situation, or null if none is carried. */
export function firstDetectedIso(situation: BoardSituation): string | null {
  if (situation.kind === "canonical" && situation.canonicalSituation) {
    const raw = (situation.canonicalSituation as { firstSeenAt?: string | null }).firstSeenAt;
    if (raw) return raw;
  }
  if (situation.kind === "signal" && situation.signal) {
    const sig = situation.signal as { signal_time?: string | null; created_at?: string | null; isoTimestamp?: string | null };
    return sig.signal_time ?? sig.created_at ?? sig.isoTimestamp ?? null;
  }
  return null;
}

function firstDetectedMs(situation: BoardSituation): number {
  const iso = firstDetectedIso(situation);
  if (iso) {
    const ms = new Date(iso).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

/**
 * Age in hours, or null when the situation carries no parseable timestamp.
 * Null means "unknown age": callers keep the situation rather than filtering it,
 * so board pages fed by signal feeds that only carry relative time labels
 * (e.g. "12m ago") are never wrongly demoted to the quiet state.
 * Reuses ageHoursFrom from the shared storyAge leaf so both surfaces agree.
 */
function featuredAgeHours(situation: BoardSituation, referenceTime: number): number | null {
  const iso = firstDetectedIso(situation);
  if (!iso) return null;
  const hours = ageHoursFrom(iso, referenceTime);
  return Number.isFinite(hours) ? hours : null;
}

export function selectFeaturedSituation(
  situations: BoardSituation[],
  referenceTime: number = Date.now(),
): BoardSituation | null {
  // Age gate: drop situations we can prove are older than the board cap. Unknown-age
  // situations are kept (see featuredAgeHours). If nothing survives, callers fall back
  // to the quiet-board empty state via featuredCopy(null, league).
  const withinAge = situations.filter((s) => {
    const age = featuredAgeHours(s, referenceTime);
    return age === null || age <= FEATURED_MAX_AGE_HOURS;
  });

  const candidates = withinAge.filter(
    s => !isCooling(s) && !FEATURED_BLOCKED_SIGNAL_TYPES.has(s.signalType ?? "")
  );
  const nonBackground = candidates.length > 0
    ? candidates
    : withinAge.filter(s => !isCooling(s));
  const base = nonBackground.length > 0 ? nonBackground : withinAge;
  if (base.length === 0) return null;

  // Fresh-pool preference (mirrors selectHomepageLead): once anything under 24h old is
  // available, older-but-within-cap situations can't lead the board.
  const freshPool = base.filter((s) => {
    const age = featuredAgeHours(s, referenceTime);
    return age !== null && age <= 24;
  });
  const pool = freshPool.length > 0 ? freshPool : base;

  const ranked = [...pool].sort((a, b) =>
    compareLeadRank(a.confidence, firstDetectedMs(a), b.confidence, firstDetectedMs(b))
  );
  return ranked[0] ?? null;
}

export function groupSituationsByLane(situations: BoardSituation[]) {
  const profile = getLeagueBoardProfile(situations[0]?.league ?? "NBA");
  return profile.laneOrder.map(lane => ({
    lane,
    label: profile.laneLabels[lane],
    situations: rankBoardSituations(situations.filter(situation => situation.lane === lane)),
  }));
}

function signalMatchesGame(signal: BoardSignalInput, game: BoardGameInput) {
  const tokens = [
    game.away,
    game.home,
    game.awayFull,
    game.homeFull,
    game.awayTeam,
    game.homeTeam,
    game.away_team,
    game.home_team,
  ].map(normalizeTeamToken).filter(Boolean);

  const signalTokens = [signal.team, signal.opponent].map(normalizeTeamToken).filter(Boolean);
  return signalTokens.some(token => tokens.includes(token));
}

function normalizeTeamToken(value?: string | null) {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, "").trim() ?? "";
}

function movementLabel(signal: BoardSignalLike) {
  if (!signalHasMovement(signal)) return undefined;
  const movement = (signal as { lineMovement?: { open?: string; current?: string } }).lineMovement;
  if (movement?.open && movement.current) return `${movement.open} -> ${movement.current}`;
  return "Market reaction";
}

function isLiveStatus(status?: string | null) {
  const value = status?.toLowerCase() ?? "";
  return value.includes("live") || value.includes("progress") || value.includes("quarter") || value.includes("inning");
}

function formatGameTime(value?: Date | string | null) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function scoreLabel(game: BoardGameInput) {
  const away = game.awayScore ?? game.away_score;
  const home = game.homeScore ?? game.home_score;
  if (away == null && home == null) return "";
  return `${away ?? "-"}-${home ?? "-"}`;
}

function ageForSort(situation: BoardSituation) {
  if (situation.kind === "canonical" && situation.canonicalSituation) {
    const updatedAt = (situation.canonicalSituation as { lastUpdatedAt?: string | null }).lastUpdatedAt;
    if (updatedAt) {
      const time = new Date(updatedAt).getTime();
      if (!Number.isNaN(time)) return Math.max(0, Math.round((Date.now() - time) / 60000));
    }
  }
  if (situation.kind === "signal" && situation.signal) {
    return signalAgeMinutes(situation.signal as BoardSignalLike) ?? 999999;
  }
  return situation.isLive ? 0 : 999999;
}
