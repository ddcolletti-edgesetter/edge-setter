/**
 * The homepage lead card's content, slot by slot, per the approved build spec
 * ("EdgeSetter lead story card: build spec", Slots and Facts sections).
 *
 * The card has exactly these parts and nothing else:
 *
 *   Kicker   league tag, ONE state chip, age
 *   Matchup  crest and name per team, then game time
 *   Headline from the headline template
 *   Sentence never shown (stored subtitles restate the line move)
 *   Facts    up to 3, fixed order: Status, Line or Total, Reports
 *   Button   "Open story"
 *
 * Everything here is built from stored fields. Nothing is filled with a
 * generic sentence: a fact with no data is dropped, never padded.
 */
import type { GamesTableRow, IntelligenceSituation } from "./intelligenceSituationsApi";
import { adaptToCFBSignal, adaptToNFLSignal, adaptToV2Signal, opponentFromMatchup } from "./signalsApi";
import { deriveBoardEscalation, type BoardEscalation } from "./boardEscalation";
import { indexStoryGames, resolveStoryGame, type StoryGameRow } from "./boardStoryGame";
import type { BoardSituation } from "./boardSituations";
import { HOMEPAGE_LEAD_FRESH_HOURS, homepageLeadAgeHours } from "./leadRanker";
import { badgeableInjuryDesignation } from "./injuryDesignation";
import { isOfficialInjuryDesignationSource } from "@shared/injury-designation-source";

/** At or over this, the chip becomes "N hours old" in gray (spec: States → Stale). */
export const LEAD_STALE_AFTER_HOURS = HOMEPAGE_LEAD_FRESH_HOURS;

/**
 * Rule 1's official-source flag: true only when the story's designation was
 * stored from an official league feed's structured field
 * (live_signals.injury_designation_source, #114, checked against the shared
 * allowlist: ESPN NFL, ESPN NBA, balldontlie NBA, MLB StatsAPI). Every other
 * story, including ESPN CFB, a text story and any row written before the
 * column existed (NULL), stays false: certainty words banned, "Report:" prefix.
 *
 * VISIBLE COPY CHANGE: with this true, an official story's lead headline is
 * printed as stored and may say "out", "confirmed" or "ruled out".
 */
export function officialSourceFlag(situation: IntelligenceSituation): boolean {
  return isOfficialInjuryDesignationSource(situation.raw.injury_designation_source);
}

const CERTAINTY_WORDS = /\b(confirmed|out|will miss|ruled out)\b/i;

/**
 * Headline rule 1: "confirmed", "out", "will miss" or "ruled out" (whole
 * words, any case) only when the official-source flag is true. Otherwise those
 * words are banned and the headline is prefixed "Report:". A line we observed
 * ourselves takes no prefix. Player stories use the spec's unofficial-report
 * template: "Report: {player}'s availability is in question".
 */
export function ruleOneHeadline(situation: IntelligenceSituation, headline: string): string {
  if (situation.raw.signal_type === "line_move") return headline;
  if (officialSourceFlag(situation)) return headline;
  const player = String(situation.raw.player ?? situation.subject?.player ?? "").trim();
  if (player) return `Report: ${possessive(player)} availability is in question`;
  const body = headline.replace(/^report:\s*/i, "");
  if (!CERTAINTY_WORDS.test(body)) return `Report: ${body}`;
  const team = String(situation.raw.team ?? "").trim();
  return team ? `Report: ${team} availability is in question` : "Report: availability is in question";
}

function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

const KICKOFF_TIME_LEAGUES = new Set(["NFL", "NBA"]);

export type LeadCardTeam = { abbr: string; name: string };

export type LeadCardFact = { label: "Status" | "Line" | "Total" | "Reports" | "Books"; value: string; sub?: string };

export type LeadCardSlots = {
  kicker: {
    league: string;
    /** The product's own label: the board escalation tier, or "N hours old" when stale. */
    chip: string;
    stale: boolean;
    /** Shown only when not stale; the stale chip replaces it. */
    age: string | null;
  };
  matchup: { teams: LeadCardTeam[]; time: string | null } | null;
  headline: string;
  facts: LeadCardFact[];
  button: { label: "Open story"; href: string };
};

export function buildLeadCardSlots(
  situation: IntelligenceSituation,
  headline: string,
  gamesTable: readonly GamesTableRow[],
  now: number = Date.now(),
): LeadCardSlots {
  const raw = situation.raw;
  const ageHours = homepageLeadAgeHours(situation, now);
  const stale = !Number.isFinite(ageHours) || ageHours >= LEAD_STALE_AFTER_HOURS;
  const game = resolveGame(situation, gamesTable);

  return {
    kicker: {
      league: situation.league,
      chip: stale ? staleChip(ageHours) : boardTier(situation),
      stale,
      age: stale ? null : ageLabel(ageHours),
    },
    matchup: matchupFor(situation, game),
    headline: ruleOneHeadline(situation, headline),
    facts: factsFor(situation, game),
    button: { label: "Open story", href: `/${situation.league.toLowerCase()}` },
  };
}

/** The tier the league board gives this signal: same adapter, same rule. */
function boardTier(situation: IntelligenceSituation): BoardEscalation {
  const raw = situation.raw;
  const adapted = situation.league === "NFL" ? adaptToNFLSignal(raw)
    : situation.league === "CFB" ? adaptToCFBSignal(raw)
    : adaptToV2Signal(raw, situation.league);
  return deriveBoardEscalation(adapted as never);
}

function staleChip(ageHours: number): string {
  if (!Number.isFinite(ageHours)) return "Age unknown";
  const h = Math.floor(ageHours);
  return `${h} ${h === 1 ? "hour" : "hours"} old`;
}

function ageLabel(ageHours: number): string {
  const minutes = Math.max(0, Math.round(ageHours * 60));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function resolveGame(situation: IntelligenceSituation, gamesTable: readonly GamesTableRow[]): StoryGameRow | null {
  const raw = situation.raw;
  const league = situation.league;
  const table = gamesTable.filter((row) => String(row.league ?? "").toUpperCase() === league) as StoryGameRow[];
  const probe = {
    id: situation.id,
    kind: "signal",
    league,
    title: situation.headline,
    team: raw.team ?? undefined,
    opponent: opponentFromMatchup(raw.matchup, raw.team),
    signal: { gameId: raw.game_id ?? undefined, isoTimestamp: raw.signal_time ?? raw.created_at },
  } as BoardSituation;
  return resolveStoryGame(probe, indexStoryGames(table))?.game ?? null;
}

type GameRow = StoryGameRow & {
  away_team_name?: string | null;
  home_team_name?: string | null;
  spread_line?: number | null;
  spread_team?: string | null;
  total_line?: number | null;
};

function matchupFor(situation: IntelligenceSituation, game: StoryGameRow | null): LeadCardSlots["matchup"] {
  if (game) {
    const g = game as GameRow;
    const teams = [
      team(g.away_team ?? g.awayTeam, g.away_team_name ?? g.awayTeamName),
      team(g.home_team ?? g.homeTeam, g.home_team_name ?? g.homeTeamName),
    ].filter((t): t is LeadCardTeam => Boolean(t));
    return teams.length ? { teams, time: gameTime(situation.league, g.game_time ?? g.gameDate) } : null;
  }
  // No game placed (e.g. a CFB story naming one team): show the one team, no "vs".
  const lone = team(situation.raw.team, null);
  return lone ? { teams: [lone], time: null } : null;
}

function team(abbr?: string | null, name?: string | null): LeadCardTeam | null {
  const code = String(abbr ?? "").trim();
  if (!code || code === "—" || code.toUpperCase() === "TBD") return null;
  return { abbr: code, name: String(name ?? "").trim() || code };
}

/** NFL/NBA: kickoff in the viewer's zone with its abbreviation. Others: date only. */
function gameTime(league: string, value?: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (KICKOFF_TIME_LEAGUES.has(league)) {
    return date.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function factsFor(situation: IntelligenceSituation, game: StoryGameRow | null): LeadCardFact[] {
  const raw = situation.raw;
  const facts: LeadCardFact[] = [];
  const isLineMove = raw.signal_type === "line_move";

  // Status: only a structured status from an official injury report (spec:
  // Status source), i.e. when the official-source flag is true. Otherwise
  // Status is dropped and the unofficial-report row of the spec's story-type
  // table shows Line and Reports only. The badge gate also applies the prose
  // contradiction check.
  const status = isLineMove || !officialSourceFlag(situation) ? undefined : badgeableInjuryDesignation(
    raw.injury_designation,
    `${situation.headline} ${situation.currentRead ?? ""} ${raw.body ?? ""}`,
    raw.injury_designation_source,
  );
  if (status) facts.push({ label: "Status", value: status, sub: "Injury report" });

  // Line: the game's current spread. Dropped on a line move, whose headline
  // already prints the numbers (spec: a fact appears once). No sub-line: the
  // verified-opener flag is not available to the homepage.
  if (!isLineMove && game) {
    const g = game as GameRow;
    if (typeof g.spread_line === "number" && g.spread_team) {
      facts.push({ label: "Line", value: `${g.spread_team} ${signedLine(g.spread_line)}` });
    }
  }

  // Reports: count and source names. Sportsbooks are "Books".
  const count = Number(raw.source_count ?? 0);
  if (count > 0) {
    const names = (raw.sources ?? []).map((s) => s.name).filter(Boolean);
    const sub = names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
    const books = isLineMove;
    const noun = books ? (count === 1 ? "book" : "books") : (count === 1 ? "report" : "reports");
    facts.push({ label: books ? "Books" : "Reports", value: `${count} ${noun}`, ...(sub ? { sub } : {}) });
  }

  return facts.slice(0, 3);
}

function signedLine(value: number): string {
  if (value === 0) return "PK";
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}
