import type { LiveSignal } from "./signalsApi";

export type PublicGameLike = {
  id?: string | number;
  league?: string | null;
  sport?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  home?: string | null;
  away?: string | null;
  game_time?: string | null;
  gameDate?: Date | string | null;
  status?: string | null;
  statusDescription?: string | null;
  source_game_id?: string | null;
  spread_line?: number | string | null;
  spread_team?: string | null;
  total_line?: number | string | null;
  open_spread?: number | string | null;
  open_total?: number | string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

const INVALID_TEAM_TOKENS = new Set(["", "-", "—", "unk", "unknown", "tbd", "null", "undefined"]);
const PUBLIC_INVALID_TOKEN_RE = /(^|[^a-z0-9])unk([^a-z0-9]|$)/i;
const MALFORMED_MATCHUP_RE = /\b([A-Z]{2,4})[-/@ ]+([A-Z]{2,4})[-/@ ]+\1\b|\b([A-Z]{2,4})[-/@ ]+([A-Z]{2,4})[-/@ ]+\4\b/;
const ROUTINE_MLB_TRANSACTION = /\b(activated|recalled|optioned|assigned|designated|transferred|selected|claimed)\b/i;
const HIGH_IMPACT_TERMS = /\b(star|starter|starting|lineup|scratch|pitcher|probable|closer|ace|qb|quarterback|injury|out|doubtful|weather|market|line moved|steam|sharp)\b/i;
const HIGH_IMPACT_TRANSACTION_TERMS = /\b(star|starter|starting|lineup|scratch|pitcher|probable|closer|ace|out|doubtful|weather|line moved|steam|sharp)\b/i;

export function isValidPublicTeam(value?: string | null) {
  const normalized = normalizeTeamToken(value);
  return !INVALID_TEAM_TOKENS.has(normalized);
}

export function containsPublicInvalidToken(value?: string | null) {
  return PUBLIC_INVALID_TOKEN_RE.test(String(value ?? ""));
}

export function hasMalformedPublicMatchup(value?: string | null) {
  return MALFORMED_MATCHUP_RE.test(String(value ?? "").toUpperCase());
}

export function hasCleanPublicText(...values: Array<string | null | undefined>) {
  return values.every((value) => !containsPublicInvalidToken(value) && !hasMalformedPublicMatchup(value));
}

export function hasCleanPublicTeamIdentity(...values: Array<string | null | undefined>) {
  return values.every((value) => value == null || value === "" || isValidPublicTeam(value));
}

export function publicFallbackLabel(value?: string | null, league = "Sports") {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("lineup") || text.includes("scratch") || text.includes("starter")) return "Lineup watch";
  if (text.includes("availability") || text.includes("injury") || text.includes("status")) return "Availability watch";
  if (text.includes("market") || text.includes("movement") || text.includes("line move")) return "Market movement watch";
  return `${league.toUpperCase()} watch item`;
}

export function hasValidPublicSignalIdentity(signal: Pick<LiveSignal, "team" | "matchup"> | { team?: string | null; matchup?: string | null; opponent?: string | null }) {
  const team = "team" in signal ? signal.team : null;
  if (team != null && !isValidPublicTeam(team)) return false;
  if (isValidPublicTeam(team)) return true;

  const matchup = "matchup" in signal ? signal.matchup : null;
  if (matchup && publicMatchupTeams(matchup).length >= 2) return true;

  const opponent = "opponent" in signal ? signal.opponent : null;
  return isValidPublicTeam(opponent);
}

export function isOpeningLineOnlySignal(signal: Pick<LiveSignal, "signal_type" | "headline" | "body" | "action_note" | "why_it_matters" | "line_movement" | "source_count">) {
  const type = signal.signal_type?.toLowerCase() ?? "";
  const text = `${signal.headline ?? ""} ${signal.body ?? ""} ${signal.action_note ?? ""} ${signal.why_it_matters ?? ""}`;
  const isMarketBaseline = type === "odds_open" || (type === "line_move" && /\bopening line|market baseline|opened at\b/i.test(text));
  if (!isMarketBaseline) return false;
  const delta = Math.abs(Number(signal.line_movement?.delta ?? 0));
  const hasMovement = Number.isFinite(delta) && delta > 0.05;
  const hasSourceBackedContext = signal.source_count > 1 && HIGH_IMPACT_TERMS.test(text.replace(/\bopening line\b/gi, ""));
  return !hasMovement && !hasSourceBackedContext;
}

export function isRoutineMlbTransaction(signal: Pick<LiveSignal, "league" | "signal_type" | "headline" | "body" | "action_note" | "why_it_matters" | "line_movement" | "player" | "team" | "score">) {
  if (signal.league !== "MLB" || signal.signal_type !== "transaction") return false;
  const text = `${signal.headline ?? ""} ${signal.body ?? ""} ${signal.action_note ?? ""} ${signal.why_it_matters ?? ""}`;
  if (!ROUTINE_MLB_TRANSACTION.test(text)) return false;
  if (signal.line_movement) return false;
  if (HIGH_IMPACT_TRANSACTION_TERMS.test(text)) return false;
  return true;
}

export function isPublicSignalEligible(signal: LiveSignal) {
  if (!hasValidPublicSignalIdentity(signal)) return false;
  if (isOpeningLineOnlySignal(signal)) return false;
  return true;
}

export function sanitizeSignalForPublic(signal: LiveSignal, now = new Date()): LiveSignal | null {
  if (!isPublicSignalEligible(signal)) return null;

  let sanitized = signal;
  if (isRoutineMlbTransaction(signal)) {
    sanitized = {
      ...sanitized,
      urgency_label: "NOTE",
      urgency_reason: "Routine roster update; no immediate game, fantasy, or market impact is attached.",
      score: Math.min(sanitized.score, 48),
      score_band: sanitized.score_band === "Strong" ? "Informational" : sanitized.score_band,
      action_note: "Roster context only. Watch for lineup, pitcher, role, or market follow-through before treating this as actionable.",
      why_it_matters: "Routine roster moves matter only when they connect to availability, role, game context, or market reaction.",
    };
  }

  if (sanitized.league === "NFL" && isNflOffseasonSignal(sanitized, now)) {
    sanitized = {
      ...sanitized,
      headline: prefixOnce(sanitized.headline, "Offseason watch: "),
      urgency_label: "NOTE",
      urgency_reason: "Offseason roster/status context; no game-week action window is attached.",
      score: Math.min(sanitized.score, 50),
      score_band: sanitized.score_band === "Strong" ? "Informational" : sanitized.score_band,
      betting_relevance: false,
      fantasy_relevance: false,
      action_note: "Offseason watch only. Reassess when this connects to depth chart, camp role, or a real game-week market.",
      why_it_matters: "This is roster and availability context, not a current betting or fantasy action signal.",
    };
  }

  return sanitized;
}

export function filterPublicSignals(signals: LiveSignal[], now = new Date()) {
  return signals
    .map((signal) => sanitizeSignalForPublic(signal, now))
    .filter((signal): signal is LiveSignal => Boolean(signal));
}

export function publicGamesForLeague<T extends PublicGameLike>(games: T[], league: string, now = new Date()): T[] {
  const current = startOfUtcDay(now);
  const maxFuture = current + 3 * 86_400_000;
  const leagueGames = games.filter((game) => String(game.league ?? game.sport ?? league).toUpperCase() === league.toUpperCase());
  const relevant = leagueGames.filter((game) => {
    const time = gameTimeMs(game);
    if (time === null) return false;
    const day = startOfUtcDay(new Date(time));
    return day >= current && day <= maxFuture;
  });
  return dedupePublicGames(relevant);
}

export function dedupePublicGames<T extends PublicGameLike>(games: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const game of games) {
    const key = gameDedupeKey(game);
    const current = byKey.get(key);
    if (!current || gameCompletenessScore(game) > gameCompletenessScore(current)) {
      byKey.set(key, game);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => (gameTimeMs(a) ?? 0) - (gameTimeMs(b) ?? 0));
}

export function publicStatusLabel(value?: string | null) {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("official")) return "Confirmed";
  if (normalized.includes("confirmed") || normalized.includes("verified") || normalized.includes("consensus")) return "Confirmed";
  if (normalized.includes("urgent") || normalized.includes("live")) return "Urgent";
  if (normalized.includes("watch") || normalized.includes("likely") || normalized.includes("review")) return "Watch";
  if (normalized.includes("develop") || normalized.includes("emerging") || normalized.includes("escalat")) return "Developing";
  return value ? "Watch" : "Developing";
}

export function publicUrgencyFromSignal(signal: Pick<LiveSignal, "urgency_label" | "score" | "score_band">) {
  const label = String(signal.urgency_label ?? "").toUpperCase();
  if (label === "URGENT" || label === "LIVE") return "Urgent";
  if (label === "WATCH") return "Watch";
  if (signal.score >= 78 && signal.score_band !== "Informational") return "Watch";
  return "Developing";
}

function isNflOffseasonSignal(signal: LiveSignal, now: Date) {
  const month = now.getUTCMonth() + 1;
  const isOffseasonMonth = month >= 2 && month <= 8;
  if (!isOffseasonMonth) return false;
  if (signal.game_id || signal.matchup) return false;
  const text = `${signal.headline} ${signal.body} ${signal.action_note}`.toLowerCase();
  return /training camp|minicamp|offseason|pup|ir|reserve|depth|practice|surgery|ready for camp|week 1/.test(text) || signal.signal_type === "injury_update";
}

function publicMatchupTeams(matchup: string) {
  return matchup
    .split(/\s+(?:@|vs\.?|at)\s+|[-/]/i)
    .map((part) => part.trim())
    .filter(isValidPublicTeam);
}

function normalizeTeamToken(value?: string | null) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function prefixOnce(value: string, prefix: string) {
  return value.toLowerCase().startsWith(prefix.toLowerCase()) ? value : `${prefix}${value}`;
}

function gameDedupeKey(game: PublicGameLike) {
  const league = String(game.league ?? game.sport ?? "").toUpperCase();
  const away = normalizeTeamToken(game.away_team ?? game.awayTeam ?? game.away);
  const home = normalizeTeamToken(game.home_team ?? game.homeTeam ?? game.home);
  const time = gameTimeMs(game);
  const day = time === null ? "unknown" : new Date(time).toISOString().slice(0, 10);
  return [league, day, away, home].join(":");
}

function gameCompletenessScore(game: PublicGameLike) {
  return [
    game.spread_line ?? game.open_spread,
    game.total_line ?? game.open_total,
    game.source_game_id,
    game.status ?? game.statusDescription,
    game.updated_at,
  ].filter((value) => value != null && value !== "").length;
}

function gameTimeMs(game: PublicGameLike) {
  const raw = game.game_time ?? game.gameDate;
  if (!raw) return null;
  const time = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isNaN(time) ? null : time;
}

function startOfUtcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
