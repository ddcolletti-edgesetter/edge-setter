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

export type BoardSituationKind = "signal" | "game" | "canonical";

export type BoardSituation = {
  id: string;
  kind: BoardSituationKind;
  league: Sport;
  lane: SituationLane;
  escalation: BoardEscalation;
  title: string;
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
  status?: string | null;
  statusDescription?: string | null;
  gameDate?: Date | string | null;
  game_time?: Date | string | null;
  time?: string | null;
  spread?: string | null;
  total?: string | null;
  signals?: number | null;
  lineMovement?: unknown;
  homeScore?: number | null;
  awayScore?: number | null;
  home_score?: number | null;
  away_score?: number | null;
};

export function toBoardSignalSituation(signal: BoardSignalInput, league: Sport): BoardSituation {
  const escalation = deriveBoardEscalation(signal);
  const isActionable = signalIsActionable(signal);
  const lifecycle = signalLifecycle(signal);
  const isConfirmed = lifecycle === "Confirmed";
  const lane = laneForEscalation(escalation, { isActionable, isConfirmed });
  const id = signal.id ?? `${league}-${signal.team ?? "signal"}-${signal.headline ?? "unknown"}`;

  return {
    id: `signal-${String(id)}`,
    kind: "signal",
    league,
    lane,
    escalation,
    title: signal.headline ?? "Untitled signal",
    detail: signal.detail ?? undefined,
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
    marketReaction: signalMarketReaction(signal),
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

  return {
    id: `game-${String(id)}`,
    kind: "game",
    league,
    lane,
    escalation,
    title: scores ? `${awayTeam} @ ${homeTeam} ${scores}` : `${awayTeam} @ ${homeTeam}`,
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
    marketReaction: topSignal ? signalMarketReaction(topSignal) : game.lineMovement ? "Market reaction logged on game" : "Market reaction quiet",
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
}: {
  league: Sport;
  games?: BoardGameInput[];
  signals?: BoardSignalInput[];
}): BoardSituation[] {
  const publicSignals = signals.filter((signal) => hasValidPublicSignalIdentity(signal) && !isOpeningLineOnlyBoardSignal(signal));
  const signalSituations = publicSignals.map(signal => toBoardSignalSituation(signal, league));
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
function firstDetectedIso(situation: BoardSituation): string | null {
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
    s => s.lane !== "background" && !FEATURED_BLOCKED_SIGNAL_TYPES.has(s.signalType ?? "")
  );
  const nonBackground = candidates.length > 0
    ? candidates
    : withinAge.filter(s => s.lane !== "background");
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
