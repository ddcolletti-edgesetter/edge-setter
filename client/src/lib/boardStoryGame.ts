/**
 * Which game a board story is about, and the three board passes that need to
 * know: drop a story whose game is over, drop a note with no subject, and keep
 * one card per game-and-market.
 *
 * A story reaches its game two ways, in order of strength:
 *
 * 1. By id. A signal carries `live_signals.game_id`, written by the pipeline
 *    against the games row it came from. That is provenance, not inference.
 *    A canonical situation that absorbed a signal twin carries that signal's
 *    row too (see collapseMarketTwins), and it counts the same way.
 * 2. By team pair. A canonical situation carries `teams` and nothing else, and
 *    a signal written before a games row existed has no id. Both are matched on
 *    the unordered token pair against the WHOLE games table — not the board's
 *    three-day slate, which cannot see yesterday's finals. A pair can recur (NFL
 *    division games, every NBA season series), so the story takes the first of
 *    its pair's games that kicks off at or after the story last CHANGED — a
 *    story is about the next game, not the last one — or, when every one of
 *    them kicked off before that, the most recent. Last-changed and not
 *    first-seen: a situation founded on the September SEA–SF game is still
 *    open, and still moving, for the November one. A story we cannot date is
 *    only matched when its pair names exactly one game.
 * 3. By its one team. Most injury reports name a team and no opponent, and the
 *    signal is written with no game_id, so neither rule above can place it. On
 *    prod (2026-11-20) that left 18 NFL, 18 NBA and 23 MLB stories unplaced,
 *    among them the NFL lead, an HOU injury report from four hours before the
 *    final HOU–IND game. Such a story takes its team's first game, in its own
 *    league, that kicks off at or after the story last changed. Unlike the pair
 *    rule there is no fall-back to the latest game: a report filed after the
 *    team's last stored game is about one we don't have, and stays. A team's
 *    games are indexed by league as well as code, so an NFL IND story can never
 *    land on a Pacers game. CFB is left out: its feed reuses one code for
 *    several schools, so a lone code can name the wrong school's game.
 */
import { lastUpdatedIso, rankBoardSituations, situationMatchupPair, type BoardGameInput, type BoardSituation } from "./boardSituations";

export type StoryGameRow = BoardGameInput & { id?: string | number; league?: string | null };

export type StoryGame = { game: StoryGameRow; how: "id" | "pair" | "team" };

/** Leagues where one team code can belong to more than one team. */
const SINGLE_TEAM_EXCLUDED_LEAGUES = new Set(["CFB"]);

function leagueKey(value?: string | null) {
  return String(value ?? "").trim().toUpperCase();
}

function teamKey(league: string, team: string) {
  return `${league}|${team}`;
}

function token(value?: string | null) {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, "").trim() ?? "";
}

function gamePair(game: StoryGameRow): string | null {
  const away = token(game.awayTeam ?? game.away_team ?? game.away);
  const home = token(game.homeTeam ?? game.home_team ?? game.home);
  if (!away || !home || away === home) return null;
  return [away, home].sort().join("|");
}

function gameTimeMs(game: StoryGameRow): number | null {
  const raw = game.gameDate ?? game.game_time;
  if (!raw) return null;
  const ms = (raw instanceof Date ? raw : new Date(raw)).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function storySignalGameId(situation: BoardSituation): string | undefined {
  if (situation.kind !== "signal") return undefined;
  const id = (situation.signal as { gameId?: string | null; game_id?: string | null } | undefined);
  return id?.gameId ?? id?.game_id ?? undefined;
}

export type StoryGameIndex = {
  byId: Map<string, StoryGameRow>;
  byPair: Map<string, StoryGameRow[]>;
  /** `${LEAGUE}|${team token}` → that team's games, by kickoff. A game with no league is not indexed here. */
  byTeam: Map<string, StoryGameRow[]>;
};

function pushTo(map: Map<string, StoryGameRow[]>, key: string, game: StoryGameRow) {
  const list = map.get(key) ?? [];
  list.push(game);
  map.set(key, list);
}

export function indexStoryGames(games: readonly StoryGameRow[]): StoryGameIndex {
  const byId = new Map<string, StoryGameRow>();
  const byPair = new Map<string, StoryGameRow[]>();
  const byTeam = new Map<string, StoryGameRow[]>();
  for (const game of games) {
    if (game.id != null) byId.set(String(game.id), game);
    const pair = gamePair(game);
    if (!pair) continue;
    pushTo(byPair, pair, game);
    const league = leagueKey(game.league);
    if (league) for (const team of pair.split("|")) pushTo(byTeam, teamKey(league, team), game);
  }
  const byKickoff = (a: StoryGameRow, b: StoryGameRow) => (gameTimeMs(a) ?? 0) - (gameTimeMs(b) ?? 0);
  byPair.forEach((list) => list.sort(byKickoff));
  byTeam.forEach((list) => list.sort(byKickoff));
  return { byId, byPair, byTeam };
}

/** The one team a story names, when it names exactly one. */
function storyLoneTeam(situation: BoardSituation): string | null {
  const teams = [situation.awayTeam ?? situation.team, situation.homeTeam ?? situation.opponent]
    .map((value) => token(value))
    .filter((value) => value && value !== "tbd");
  return teams.length === 1 ? teams[0] : null;
}

export function resolveStoryGame(situation: BoardSituation, index: StoryGameIndex): StoryGame | undefined {
  if (situation.kind === "game") return undefined;
  const attachedId = situation.game ? (situation.game as StoryGameRow).id : undefined;
  const id = attachedId != null ? String(attachedId) : storySignalGameId(situation);
  const exact = id ? index.byId.get(id) ?? (situation.game as StoryGameRow | undefined) : undefined;
  if (exact) return { game: exact, how: "id" };

  const changedIso = lastUpdatedIso(situation);
  const changedMs = changedIso ? new Date(changedIso).getTime() : NaN;
  const pair = situationMatchupPair(situation);
  if (!pair) return resolveByLoneTeam(situation, index, changedMs);
  const candidates = index.byPair.get(pair);
  if (!candidates?.length) return undefined;
  if (!Number.isFinite(changedMs)) {
    return candidates.length === 1 ? { game: candidates[0], how: "pair" } : undefined;
  }
  const next = candidates.find((game) => (gameTimeMs(game) ?? -Infinity) >= changedMs);
  return { game: next ?? candidates[candidates.length - 1], how: "pair" };
}

function resolveByLoneTeam(situation: BoardSituation, index: StoryGameIndex, changedMs: number): StoryGame | undefined {
  const league = leagueKey(situation.league);
  if (!league || SINGLE_TEAM_EXCLUDED_LEAGUES.has(league) || !Number.isFinite(changedMs)) return undefined;
  const team = storyLoneTeam(situation);
  if (!team) return undefined;
  const next = index.byTeam.get(teamKey(league, team))
    ?.find((game) => (gameTimeMs(game) ?? -Infinity) >= changedMs);
  return next ? { game: next, how: "team" } : undefined;
}

function gameStatusText(game: StoryGameRow) {
  return String(game.status ?? game.statusDescription ?? "").toLowerCase();
}

/**
 * Over for board purposes: final everywhere; started only where we trust the
 * stored kickoff (see kickoffIsTrustedForLeague). In CFB and MLB a stored start
 * time can be hours off, and a status of "live" is written by the same feed,
 * so a row there leaves the board only once the final score is in.
 */
export function storyGameIsOver(game: StoryGameRow, kickoffTrusted: boolean, now: number): boolean {
  const status = gameStatusText(game);
  if (status.includes("final")) return true;
  if (!kickoffTrusted) return false;
  if (status.includes("live") || status.includes("progress")) return true;
  const kickoff = gameTimeMs(game);
  return kickoff !== null && kickoff <= now;
}

/** A canonical note the engine titled with its type and nothing else. */
export function isUntitledOperatorNote(situation: BoardSituation): boolean {
  return /^\s*operator note\s*$/i.test(situation.title ?? "");
}

/**
 * The stories a board should still show: not about a game that is over, and
 * not a note with no subject. Game rows are left alone — they are the slate,
 * already windowed by publicGamesForLeague, and a final score is what a
 * finished fixture's card is for.
 */
export function dropStoriesNoLongerLive(
  situations: readonly BoardSituation[],
  games: readonly StoryGameRow[],
  options: { kickoffTrusted: boolean; now?: number },
): BoardSituation[] {
  const now = options.now ?? Date.now();
  const index = indexStoryGames(games);
  return situations.filter((situation) => {
    if (situation.kind === "game") return true;
    if (situation.kind === "canonical" && isUntitledOperatorNote(situation)) return false;
    const match = resolveStoryGame(situation, index);
    return !match || !storyGameIsOver(match.game, options.kickoffTrusted, now);
  });
}

/**
 * One card per game and market.
 *
 * A line move reaches the board twice — once as the signal the odds adapter
 * wrote, once as the canonical situation the engine founded on it — and every
 * further move on the same game's same market adds another signal. On prod
 * (2026-11-20) that was 24 CFB game-markets carrying 31 extra cards, the lead
 * among them, which is how the lead could say "1 report" while its own twin
 * further down said "2 report checks".
 *
 * Keyed on league + unordered team pair + market (spread or total). A move we
 * could not assign to a market is left alone: collapsing a spread into a total
 * would be a worse lie than a duplicate.
 *
 * The survivor is the member that changed most recently, because the card
 * prints that market's numbers and only the newest member has the current
 * ones. Among members that changed within a minute of the newest, the
 * canonical row wins — it is the one that aggregates the evidence, and a
 * canonical situation updated by a signal carries that signal's timestamp to
 * the millisecond. Freshest-first is also what keeps a live story on the
 * board: the age cut runs after this pass, and on prod a signal from today had
 * a canonical twin last touched four days ago, which a canonical-always rule
 * picked and the age cut then removed, taking the story with it.
 *
 * The survivor takes the games row a dropped signal was written against, when
 * it has none of its own, so the card can still name the teams.
 */
export function collapseMarketTwins(situations: readonly BoardSituation[]): BoardSituation[] {
  const groups = new Map<string, BoardSituation[]>();
  for (const situation of situations) {
    const key = marketTwinKey(situation);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), situation]);
  }
  const replace = new Map<string, BoardSituation>();
  const drop = new Set<string>();
  groups.forEach((members) => {
    if (members.length < 2) return;
    const ranked = rankBoardSituations(members);
    const newest = Math.max(...ranked.map(changedMs));
    const freshest = ranked.filter((member) => changedMs(member) >= newest - TWIN_TIE_MS);
    const survivor = freshest.find((member) => member.kind === "canonical") ?? freshest[0] ?? ranked[0];
    const donor = ranked.find((member) => member.kind === "signal" && member.game);
    for (const member of members) if (member !== survivor) drop.add(member.id);
    const merged: BoardSituation = {
      ...survivor,
      relatedSignalIds: Array.from(new Set(members.flatMap((member) => member.relatedSignalIds))),
    };
    if (!survivor.game && donor) {
      merged.game = donor.game;
      merged.gameId = donor.gameId;
      merged.awayTeam = donor.awayTeam;
      merged.homeTeam = donor.homeTeam;
    }
    replace.set(survivor.id, merged);
  });
  if (!drop.size) return [...situations];
  return situations
    .filter((situation) => !drop.has(situation.id))
    .map((situation) => replace.get(situation.id) ?? situation);
}

const TWIN_TIE_MS = 60_000;

function changedMs(situation: BoardSituation): number {
  const iso = lastUpdatedIso(situation);
  const ms = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(ms) ? ms : -Infinity;
}

function marketTwinKey(situation: BoardSituation): string | null {
  if (situation.kind === "game") return null;
  const kind = situation.marketMove?.kind;
  if (kind !== "spread" && kind !== "total") return null;
  const pair = situationMatchupPair(situation);
  return pair ? `${situation.league}|${pair}|${kind}` : null;
}
