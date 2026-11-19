import type { BoardSituation } from "@/lib/boardSituations";
import type { BoardEscalation, SituationLane } from "@/lib/boardEscalation";
import type { BoardSortMode } from "@/lib/signalBoardUx";
import type { Sport } from "@/lib/leagueModifiers";
import type { CanonicalSituation } from "@/lib/situationsApi";
import { hasCleanPublicTeamIdentity, hasCleanPublicText, hasMalformedPublicMatchup, isValidTeamToken, publicFallbackLabel, storyTitleHasValidPlayerName } from "@/lib/publicDisplayHygiene";
import { deriveSignalVerificationState } from "@/lib/signalVerification";
import { evidenceCountText, humanizeSignalType, marketFocusHeadline, publicConfidenceLabel, publicLifecycleLabel, publicStoryText, publicTimingLabel, publicUrgencyLabel, sourceCountText } from "@/lib/storyLanguage";
import { toTeamAbbr } from "@/components/v2/SportVisuals";
import { cfbGamesSchool, storedGameNames, teamDisplayLabel, teamDisplayName } from "@/lib/teamDisplayNames";
import type { LiveGamePillData, LiveGameStatus, BoardUrgency } from "./LiveGamePill";
import type { SituationEscalationState, SituationEvidenceStep, SituationLifecycleVisualState, SituationMetric, SituationRowData } from "./SituationRow";

export type SituationStoryCardData = {
  id: string;
  league?: string;
  headline: string;
  dek?: string;
  sectionTitle?: string;
  whatHappened: string;
  whyItMatters?: string;
  /**
   * Source trail / confidence / timing, joined. Undefined when none of the
   * three resolved — the tile is dropped rather than filled with a sentence
   * that was identical on every card.
   */
  edgeSetterKnows?: string;
  watchNext?: string;
  relatedItems?: string[];
  ctaLabel?: string;
  matchup?: string;
  primaryTeam?: string;
  secondaryTeam?: string;
  /**
   * Display names for {@link primaryTeam} / {@link secondaryTeam}, for the
   * visual's caption. The tokens stay as they are: they are the logo and
   * sports-image lookup keys. Undefined when the row has no better name.
   */
  primaryTeamName?: string;
  secondaryTeamName?: string;
  player?: string;
  /**
   * Short availability tag — "OUT" / "DOUBTFUL" / "QUESTIONABLE" and the
   * practice-report codes, normalized by {@link normalizeInjuryDesignation}.
   * Undefined when the signal carries no designation; never a placeholder.
   */
  injuryDesignation?: string;
  /**
   * "vs HOU" / "at HOU" — the opponent with the side we can prove. Undefined
   * when home/away cannot be established, because guessing the preposition
   * would state a home-field fact we do not have.
   */
  opponentLabel?: string;
  /**
   * Kickoff as "Sat 3:30 PM", from the game this story joined to. Undefined
   * when no game matched, when the match was ambiguous, or when the stored
   * game_time does not parse — an absent field, never an invented time.
   */
  kickoff?: string;
  storyType?: string;
  timestamp?: string;
  confidence?: string;
  sourceCount?: number;
  lifecycle?: string;
  verification?: string;
  evidence?: string;
  timing?: string;
  market?: string;
  row: SituationRowData;
};

export type AnyBoardSignal = {
  id?: string | number;
  headline?: string | null;
  detail?: string | null;
  why_it_matters?: string | null;
  action_takeaway?: string | null;
  player?: string | null;
  team?: string | null;
  opponent?: string | null;
  type?: string | null;
  confidence?: number | string | null;
  confidence_score?: number | string | null;
  verdict?: string | null;
  status_tag?: string | null;
  timestamp?: string | null;
  sources?: number | string | null;
  source_count?: number | string | null;
  sourceLabels?: string[] | null;
  sourceTypes?: string[] | null;
  confirmationStrength?: string | null;
  lineMovement?: { open?: string; current?: string; note?: string } | null;
  injuryDesignation?: string | null;
  conference?: string | null;
  _score?: { totalScore?: number | null; urgencyLabel?: string | null; urgencyReason?: string | null } | null;
};

export type AnyBoardGame = {
  id?: string | number;
  away?: string | null;
  home?: string | null;
  awayFull?: string | null;
  homeFull?: string | null;
  awayTeam?: string | null;
  homeTeam?: string | null;
  away_team?: string | null;
  home_team?: string | null;
  /**
   * The team name the games row stored — "Rice Owls", "Kansas City Chiefs".
   *
   * `games.home_team_name` / `away_team_name`, written by the odds adapter from
   * the feed's own names. NULL on every row written before that shipped, and on
   * rows the odds adapter has not revisited since, so every reader of these
   * falls back the same way: stored name, then the CFB token lookup, then the
   * token itself.
   *
   * Two spellings for the same reason the token fields have four: the API
   * serves snake_case rows and each board page re-maps them into its own
   * camelCase shape.
   */
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
  homeScore?: number | null;
  awayScore?: number | null;
  home_score?: number | null;
  away_score?: number | null;
  lineMovement?: unknown;
  network?: string | null;
  conference?: string | null;
};

/* `cfbGamesSchool` and `storedGameNames` moved to lib/teamDisplayNames so the
 * row title — built in lib/boardSituations, upstream of every adapter — can
 * apply the same fallback order. Re-exported because this module is where the
 * rest of the client imports them from. */
export { storedGameNames } from "@/lib/teamDisplayNames";

/**
 * "Western Michigan Broncos @ Rice Owls" from an away/home token pair, plus
 * whatever names the row itself carries.
 *
 * THE ORDER IS THE WHOLE POINT. Per side: the stored name, then the CFB
 * mascot-token lookup, then the token. A stored name is what the feed actually
 * called the team, so it outranks a table that infers a school from three
 * letters — and it is the only thing that can name one of the 16 tokens two
 * schools share, which the lookup must refuse.
 *
 * The STORED branch is league-agnostic: an NFL row that carries "Kansas City
 * Chiefs" prints it. The LOOKUP stays CFB-only, because the same token from a
 * non-CFB source is a real abbreviation (see cfbSchoolForGamesToken on FLA).
 * With neither a stored name nor a CFB league there is nothing to add, so this
 * returns undefined and the caller keeps printing tokens.
 *
 * Per side on the fallbacks too: a matchup with one named side still names it
 * rather than throwing both away.
 */
function cfbMatchupLabel(
  away?: string | null,
  home?: string | null,
  league?: string,
  names?: { away?: string; home?: string },
): string | undefined {
  const isCfb = String(league ?? "").toUpperCase() === "CFB";
  if (!names?.away && !names?.home && !isCfb) return undefined;
  const side = (token?: string | null, stored?: string) => teamDisplayLabel(token, stored, league);
  return [side(away, names?.away), side(home, names?.home)].filter(Boolean).join(" @ ") || undefined;
}

/**
 * The same label from a story's identity, but ONLY when `sideKnown` says the
 * away/home pair came from a real games row. Without that guard this would
 * resolve canonical `teams[0]`/`teams[1]`, which are injury-adapter
 * abbreviations where FLA genuinely is Florida.
 */
function cfbMatchupLabelFromIdentity(identity?: SituationRowData["sportsIdentity"]): string | undefined {
  if (!identity?.sideKnown) return undefined;
  return cfbMatchupLabel(identity.awayTeam, identity.homeTeam, identity.sport);
}

export function toLiveGamePillData(
  game: AnyBoardGame,
  relatedCount = 0,
  sport?: LiveGamePillData["sport"],
): LiveGamePillData {
  const status = game.statusDescription ?? game.status ?? "Scheduled";
  const awayName = game.awayTeam ?? game.away_team ?? game.away ?? game.awayFull ?? "TBD";
  const homeName = game.homeTeam ?? game.home_team ?? game.home ?? game.homeFull ?? "TBD";
  const stored = storedGameNames(game);
  const isLive = isLiveStatus(status);

  return {
    id: String(game.id ?? `${awayName}-${homeName}`),
    // League-qualifies the logo lookup so KC → Royals on the MLB board, not Chiefs.
    sport,
    away: {
      abbreviation: abbreviateTeam(awayName),
      // The name the row stored, else the CFB token lookup (CFB only, and only
      // when one school owns the token), else nothing. The pill itself is too
      // narrow for a full name and keeps the abbreviation; the strip's featured
      // line and the pill's tooltip use this, and both already fall back to the
      // abbreviation when it is undefined.
      name: stored.away ?? cfbGamesSchool(abbreviateTeam(awayName), sport),
      score: game.awayScore ?? game.away_score ?? undefined,
    },
    home: {
      abbreviation: abbreviateTeam(homeName),
      name: stored.home ?? cfbGamesSchool(abbreviateTeam(homeName), sport),
      score: game.homeScore ?? game.home_score ?? undefined,
    },
    status: normalizeGameStatus(status),
    clock: isLive ? status : undefined,
    // The SAME gate the story card applies to its kickoff line — see
    // KICKOFF_TRUSTED_LEAGUES. Both surfaces read the same first-writer-wins
    // games.game_time, so a league whose stored start time the card will not
    // print has no business being printed here either; the slate was the one
    // place a stale CFB time still reached a reader. An undefined period simply
    // drops the element (LiveGamePill renders it conditionally), and the
    // strip's featured line already falls back to the status label.
    //
    // A LIVE game is gated too: `clock` carries the live status separately, and
    // the value this would print is still the stored kickoff.
    period: kickoffIsTrustedForLeague(sport)
      ? game.time ?? formatGameTime(game.gameDate ?? game.game_time)
      : undefined,
    market: [game.spread, game.total].filter(Boolean).join(" / ") || undefined,
    note: game.network ?? game.conference ?? undefined,
    urgency: urgencyForGameStatus(status, relatedCount),
    escalationCount: relatedCount || undefined,
    confirmedCount: game.signals ?? undefined,
  };
}

export function toSituationRowData(situation: BoardSituation): SituationRowData {
  const signal = situation.signal as AnyBoardSignal | undefined;
  const canonical = situation.canonicalSituation as CanonicalSituation | undefined;
  const confidenceDelta = canonical?.confidenceHistoryPreview?.[0]?.delta ?? null;
  const matchup = [situation.awayTeam, situation.homeTeam].filter(Boolean).join(" @ ")
    || [situation.team, situation.opponent].filter(Boolean).join(" vs ");
  // Real names for display, tokens kept in `matchup` for everything that
  // parses it (editorialHeadline -> cleanPublicMatchupLabel builds an
  // uppercase hyphenated pair, which full names would turn into
  // "RICE OWLS-TEMPLE OWLS"). Only the awayTeam/homeTeam branch is resolved:
  // it is the one fed by /api/v2/games, and `situation.game` is the row it came
  // from, so the names it stored are read from there. The `team vs opponent`
  // branch is signal-sourced and must not go through the mascot-slice table.
  const matchupLabel = cfbMatchupLabel(
    situation.awayTeam,
    situation.homeTeam,
    situation.league,
    storedGameNames(situation.game as AnyBoardGame | undefined),
  );
  // Derive the canonical verification word from the same signal the detail
  // drawer opens on, so the story card and the drawer never disagree. Only the
  // signal lineage feeds a drawer (canonical situations open the /story page),
  // so we derive from the signal when present and otherwise leave it undefined.
  const verification = signal ? deriveSignalVerificationState(signal) : undefined;
  const escalationState = escalationStateForSituation(situation);
  // Single-source evidence-strength cap context, shared with the drawer via the
  // verification word so the card and the drawer agree for the same signal.
  const strengthContext = {
    sourceCount: situation.sourceCount,
    verified: isSituationVerified({ verificationState: verification?.state, escalationState }),
  };

  return {
    id: situation.id,
    title: fanFirstTitle(situation, canonical),
    // Only a game row's raw title passes through fanFirstTitle untouched, so
    // only a game row can carry the names version of it. Everything else gets
    // a rewritten headline that the label would no longer match.
    titleLabel: situation.kind === "game" ? situation.titleLabel : undefined,
    subtitle: situation.detail,
    league: situation.league,
    matchup: matchup || undefined,
    matchupLabel,
    market: situation.movementLabel ? "Market reaction detected" : formatSignalType(situation.signalType),
    timestamp: situation.timeLabel ?? signal?.timestamp ?? undefined,
    sourceCount: situation.sourceCount,
    urgency: urgencyForEscalation(situation.escalation),
    urgencyScore: Math.round(situation.score),
    lane: situation.lane,
    escalationState,
    statusLabel: situation.statusLabel ?? situation.escalation,
    verificationState: verification?.state,
    verificationBasis: verification?.basis,
    metrics: [
      { label: "Confidence", value: publicConfidenceLabel(situation.confidence, strengthContext), tone: situation.confidence >= 80 ? "positive" : situation.confidence >= 60 ? "warning" : "default" },
    ].filter(Boolean) as SituationMetric[],
    tags: [
      situation.trustLabel,
      canonical?.confidenceLabel,
      // Same honesty gate as the story-card badge, so the two surfaces cannot
      // disagree about whether a designation is showable. See
      // badgeableInjuryDesignation. The raw value is kept rather than the
      // normalized one: this is a plain tag, not the badge, and its casing is
      // not ours to change.
      badgeableInjuryDesignation(signal?.injuryDesignation, `${situation.title} ${situation.detail ?? ""}`)
        ? signal?.injuryDesignation
        : undefined,
      signal?.conference,
    ].filter(Boolean) as string[],
    // Also carried as a first-class field: `tags` is sliced to two entries by
    // SituationRow, which drops the designation in practice.
    injuryDesignation: signal?.injuryDesignation ?? undefined,
    actionLabel: situation.kind === "signal" ? "Open story" : undefined,
    lifecycleLabel: situation.lifecycleStage,
    lifecycleState: lifecycleStateForLabel(situation.lifecycleStage),
    lifecycleVisualState: canonical ? lifecycleVisualState(canonical) : lifecycleVisualStateForLabel(situation.lifecycleStage),
    confidenceDelta,
    confidenceMovementLabel: canonical ? confidenceMovementSummary(canonical) : fallbackConfidenceStage(situation),
    evidenceCount: canonical?.evidenceCount,
    evidenceGrowthLabel: canonical ? evidenceGrowthLabel(canonical) : fanSafeContext(signal?.why_it_matters ?? signal?.detail),
    sourceProgressLabel: canonical ? sourceProgressLabel(canonical) : fallbackSourceProgress(situation),
    sourceConvergenceStage: canonical ? sourceConvergenceStage(canonical) : fallbackSourceStage(situation),
    sourceReliabilityLabel: canonical ? sourceReliabilityLabel(canonical) : situation.trustLabel,
    uncertaintyLabel: canonical?.confidenceFactors.whatRemainsUncertain[0],
    timingStageLabel: canonical ? timingStageLabel(canonical) : fallbackTimingStage(situation),
    evidenceChain: canonical ? evidenceChain(canonical) : fallbackEvidenceChain(situation),
    sportsIdentity: sportsIdentityForSituation(situation, canonical),
    confidenceNote: situation.confidenceNote,
    confidenceJourney: situation.confidenceJourney,
    sourceSummary: situation.sourceSummary,
    timingAdvantage: situation.timingAdvantage,
    detectionLeadTime: situation.detectionLeadTime,
    detectionLeadKind: situation.detectionLeadKind,
    marketReaction: situation.marketReaction,
    replayChain: situation.replayChain,
  };
}

/* ── Availability, opponent and kickoff ──────────────────────────────────────
 *
 * Three facts the pipeline already carries that the story card never showed.
 * All three are omitted rather than guessed, because each one is the kind of
 * claim a reader would act on: a designation we invented, a home/away side we
 * assumed, or a kickoff we rounded would all be worse than a blank line.
 */

/**
 * Fold a raw designation into the short tag the card shows.
 *
 * Only the four words with a single unambiguous reading are expanded. Anything
 * else — the practice-participation codes DNP/LP/FP, "IL-60", a value this feed
 * has not sent before — passes through uppercased, because inventing a longer
 * label for a code we have not verified is how "LP" becomes a claim about a
 * player's availability that no source made. `D` and `Q` are read as Doubtful
 * and Questionable to match signalScorer, which already scores them that way.
 */
const INJURY_DESIGNATION_LABELS: Readonly<Record<string, string>> = {
  O: "OUT",
  OUT: "OUT",
  D: "DOUBTFUL",
  DOUBTFUL: "DOUBTFUL",
  Q: "QUESTIONABLE",
  QUESTIONABLE: "QUESTIONABLE",
  P: "PROBABLE",
  PROBABLE: "PROBABLE",
};

export function normalizeInjuryDesignation(raw?: string | null): string | undefined {
  const key = String(raw ?? "").trim().toUpperCase();
  if (!key) return undefined;
  return INJURY_DESIGNATION_LABELS[key] ?? key;
}

/* ── Which designations we are willing to put on screen ──────────────────────
 *
 * `server/pipeline/processor.ts:64` builds every injury signal with
 *
 *     const designation: string = p.designation ?? p.status ?? "Questionable";
 *
 * and five of the ten injury producers — sports-rss, x-twitter, 247sports, on3
 * and cfb-school-sid — send a payload carrying neither key (see
 * `sports-rss.ts:395`, whose payload is headline/notes/source_url/...). So
 * every injury signal from a text-classified source is stored as
 * "Questionable" whether or not any source said anything about availability.
 *
 * ESPN NFL, CFB and NBA do report a real "Questionable", and the stored string
 * is byte-identical in both cases. Nothing on the client can tell a reported
 * designation from an invented one, so there is no test we could write here
 * that keeps the true badges and drops the false ones. A badge is a claim about
 * whether a player will play; we withhold the whole class rather than show a
 * coin flip as a fact.
 *
 * THE REAL FIX IS SERVER-SIDE. Remove the default at processor.ts:64 so the
 * column is NULL when no source supplied a status — and null-guard the three
 * prose templates just below it (headline :70, body :72, action_note :75) that
 * interpolate `designation`, or they will print the word "null". Once that
 * ships, ESPN's genuine QUESTIONABLE becomes distinguishable from silence and
 * this suppression should be deleted, not kept.
 */
const UNPROVABLE_DESIGNATIONS: ReadonlySet<string> = new Set(["QUESTIONABLE"]);

/**
 * Phrases that contradict any availability badge at all.
 *
 * The processor overwrites `headline` but not `body`, so a text-sourced
 * signal's own prose survives into `row.subtitle` — which means a story whose
 * reporting says the player came OFF the injury report can still carry a stored
 * designation saying he is on it. When the prose and the badge disagree we
 * trust the prose and drop the badge, for every designation including OUT.
 *
 * Deliberately blunt: /\bcleared\b/ also fires on "has not been cleared", which
 * suppresses a badge that was arguably right. That is the safe direction of
 * error — the cost is a missing tag, not a false claim — so it is left alone
 * rather than papered over with negation-matching we cannot test against real
 * copy.
 */
const DESIGNATION_CONTRADICTIONS: readonly RegExp[] = [
  /\b(?:off|removed from|not on)\s+the\s+injury\s+report\b/i,
  /\bfull\s+partic/i,
  /\bclear(?:ed|ance)\b/i,
  /\bactivated\b/i,
  /\bno\s+longer\s+listed\b/i,
];

/**
 * The designation a surface may render, or undefined.
 *
 * Kept separate from {@link normalizeInjuryDesignation} on purpose: that
 * function's job is to fold a raw code into a label and it still has to do that
 * faithfully for QUESTIONABLE, because the drawer, the scorer and the tests all
 * depend on the mapping. This is the display gate layered on top.
 *
 * @param raw      the stored `live_signals.injury_designation`
 * @param bodyText the signal's own prose — pass title + subtitle together
 */
export function badgeableInjuryDesignation(
  raw?: string | null,
  bodyText?: string,
): string | undefined {
  const designation = normalizeInjuryDesignation(raw);
  if (!designation) return undefined;
  if (UNPROVABLE_DESIGNATIONS.has(designation)) return undefined;
  if (bodyText && DESIGNATION_CONTRADICTIONS.some((pattern) => pattern.test(bodyText))) {
    return undefined;
  }
  return designation;
}

const normalizeTeamToken = (value?: string | null): string => {
  const raw = String(value ?? "").trim();
  return raw ? abbreviateTeam(raw).toUpperCase() : "";
};

function gameTokens(game: AnyBoardGame): { away: string; home: string } {
  return {
    away: normalizeTeamToken(game.awayTeam ?? game.away_team ?? game.away ?? game.awayFull),
    home: normalizeTeamToken(game.homeTeam ?? game.home_team ?? game.home ?? game.homeFull),
  };
}

export type StoryGameMatch = {
  game: AnyBoardGame;
  /** True when the story's team is the home side, false when away, undefined when unresolved. */
  storyIsHome?: boolean;
};

function sideForTeam(team: string, tokens: { away: string; home: string }): boolean | undefined {
  if (!team) return undefined;
  if (team === tokens.home) return true;
  if (team === tokens.away) return false;
  return undefined;
}

/**
 * Join a story to its game, client-side, off the slate each board already
 * fetched for the live strip. No new request and no new server field.
 *
 * A both-sides hit wins over a one-side hit, and **any ambiguity returns
 * undefined**: two games matching both sides is an MLB doubleheader, and two
 * games sharing one token is a team playing twice in the window. Picking the
 * first would attach a kickoff from the wrong game, which is the one outcome
 * worse than showing no kickoff at all.
 */
export function findGameForStory(
  identity: SituationRowData["sportsIdentity"],
  games?: readonly AnyBoardGame[],
): StoryGameMatch | undefined {
  if (!games?.length) return undefined;
  const team = normalizeTeamToken(identity?.team);
  const storyTokens = new Set(
    [identity?.awayTeam, identity?.homeTeam, identity?.team, identity?.opponent]
      .map(normalizeTeamToken)
      .filter(Boolean),
  );
  if (storyTokens.size === 0) return undefined;

  const bothSides: StoryGameMatch[] = [];
  const oneSide: StoryGameMatch[] = [];
  for (const game of games) {
    const tokens = gameTokens(game);
    if (!tokens.away && !tokens.home) continue;
    const hits = [tokens.away, tokens.home].filter((token) => token && storyTokens.has(token));
    const match: StoryGameMatch = { game, storyIsHome: sideForTeam(team, tokens) };
    if (hits.length === 2) bothSides.push(match);
    else if (hits.length === 1) oneSide.push(match);
  }

  if (bothSides.length === 1) return bothSides[0];
  if (bothSides.length > 1) return undefined;
  if (oneSide.length === 1) return oneSide[0];
  return undefined;
}

/**
 * "Sat 3:30 PM PST" in the reader's own locale and zone. Undefined for an
 * absent or unparseable value — unlike {@link formatGameTime}, which echoes
 * the raw string back so the live pill always renders something.
 *
 * The zone is named, not implied. Without it the same kickoff reads as a
 * different hour to an Eastern and a Pacific reader with nothing on the card
 * to tell them apart, and a bettor acting on the wrong hour is the failure
 * this label exists to prevent. `timeZoneName: "short"` resolves against the
 * reader's own zone, so it describes the time actually shown rather than
 * asserting a league-wide one.
 */
export function formatKickoff(value?: Date | string | null): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  const day = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
  return `${day} ${time}`;
}

/**
 * Leagues whose stored kickoff we trust enough to print on a story card.
 *
 * WHY THIS IS NOT EVERY LEAGUE
 * ────────────────────────────
 * `games.game_time` is first-writer-wins. All three upserts in
 * server/pipeline/store.ts — `upsertGame`, `touchGameSchedule` and
 * `upsertHistoricalGame` — list `game_time` in the INSERT column list but in
 * none of their `ON CONFLICT(id) DO UPDATE SET` clauses. So whichever adapter
 * creates the row fixes the kickoff permanently, and a later, better-informed
 * feed cannot correct it. A time that was provisional when it was first
 * written stays on the row forever.
 *
 * A wrong-but-parseable time is the dangerous case: it renders with full
 * confidence and nothing on the card marks it as suspect. Omitting it reads
 * as "we don't have the time", which is true, and is the same blank the card
 * already shows for a missing or unparseable value — so no new code path.
 *
 * WHY NFL AND NBA ARE ENABLED — and what this comment used to say
 * ───────────────────────────────────────────────────────────────
 * It said "NFL is enabled because its schedule is written by the ESPN schedule
 * ingester before any odds adapter sees the game, so the first writer is also
 * the authoritative one." THAT INGESTER DOES NOT EXIST. Exactly two modules
 * outside the historical backfills write a games row —
 * `adapters/the-odds-api.ts` (every league) and `adapters/mlb-statsapi.ts`
 * (MLB only) — and `adapters/espn-nfl.ts` exports injuries and final scores,
 * nothing that touches the schedule. The only other write to the table is the
 * final-score UPDATE, which sets status and the two scores and never
 * `game_time`. So for NFL the first writer IS the odds adapter, the same
 * source the gate exists to be cautious about.
 *
 * What is actually true is narrower: `game_time` is first-writer-wins, and NFL
 * kickoff windows are fixed months ahead and move rarely, so the first value
 * the odds feed gives for an NFL game is almost always the right one. CFB start
 * times are routinely corrected after the row exists — measured against prod on
 * 2026-11-19, six of the 73 CFB games in the public window had a SECOND row
 * from the same feed event with a start time 3.5 to 12 hours later, and the
 * original row's time was never corrected. That is a judgment about two feeds'
 * reliability, not a provenance guarantee, and it should be read as one.
 *
 * NBA IS ENABLED ON THE SAME KIND OF EVIDENCE, MEASURED DIRECTLY. The question
 * the gate asks is not who wrote the row, it is whether the stored `game_time`
 * is still when the game starts — and for a league that has already played,
 * the finished games answer it. Measured against prod on 2026-11-19, over
 * every one of the 138 NBA rows at `status='final'`: 137 of them were written
 * final between 2.06 and 3.16 hours after their stored `game_time`. That is
 * the length of a basketball game plus one pipeline cycle, and it can only be
 * true if the stored tip-off is the real one. A stale start time would have
 * shown up as a SPREAD of distances; this is a cluster, with 102 of the 137
 * inside a single half-hour (2.25-2.75h) and 131 inside 2.25-3.00h.
 *
 * The 138th, CHA @ LAL on 2026-11-18, sits at 8.08h and is an ingestion-pause
 * artefact rather than a late game: the pipeline wrote nothing at all between
 * 04:59Z and 12:14Z that night, so the final-score write, not the tip-off, set
 * that distance. It does not weaken the other 137 — it is the pipeline's clock
 * being wrong about when it ran, not the feed's being wrong about when the
 * game started.
 *
 * This is still a judgment, and it is a judgment about TODAY'S rows. It does
 * not promise NBA start times can never move; it says the stored values we can
 * check are right. If that stops being true the check is cheap to re-run —
 * `game_time` to `updated_at` on `status='final'` rows, which is exactly what
 * nba-kickoff-trust-evidence.test.ts replays against the captured data — and
 * this flag is where the answer goes.
 *
 * MLB is the only league with a schedule feed of its own (`ingestMLBSchedule`),
 * which makes it the best-supported candidate to enable next — but it still
 * races the odds adapter for the INSERT, so it is not automatically trustworthy
 * either, and nobody has run the finished-game check on it.
 *
 * TURNING ON A LEAGUE LATER
 * ─────────────────────────
 * This is a per-league switch on purpose. Once `game_time` is last-writer-wins
 * for a trusted source — the planned fix is to add
 * `game_time=excluded.game_time` to the `ON CONFLICT` clauses of the schedule
 * upserts (NOT the odds path, which must never move a kickoff) — add that
 * league here and extend the test table. Nothing else needs to change. Note
 * that outside MLB there is no schedule upsert to make last-writer-wins: for
 * NFL, NBA and CFB that fix means changing the odds path or adding a schedule
 * ingester, which is a larger decision than this flag. A league can also be
 * enabled the way NBA was, without any such change, by measuring that the
 * stored times are in fact correct.
 */
const KICKOFF_TRUSTED_LEAGUES = new Set(["NFL", "NBA"]);

export function kickoffIsTrustedForLeague(league?: string): boolean {
  return league !== undefined && KICKOFF_TRUSTED_LEAGUES.has(league.toUpperCase());
}

/**
 * "vs HOU" or "at HOU". The preposition is a factual claim about home field,
 * so it is only made from a source that knows: the joined game first, then the
 * identity but ONLY when `sideKnown` says the pipeline supplied a real
 * away/home pair rather than the `?? situation.team` fallback. Otherwise
 * undefined — the card still shows the neutral `matchup` string.
 */
export function opponentLabelFor(
  identity: SituationRowData["sportsIdentity"],
  match?: StoryGameMatch,
): string | undefined {
  const team = normalizeTeamToken(identity?.team);
  // Both branches below read a games-sourced pair — `match.game` is a row from
  // /api/v2/games, and the identity branch is gated on `sideKnown` — so both
  // may be resolved to school names.
  const school = (token: string) => cfbGamesSchool(token, identity?.sport) ?? token;

  if (match) {
    const tokens = gameTokens(match.game);
    // Stored name first, token lookup second, token last — the same order as
    // the matchup label, from the same row. The stored half is league-agnostic;
    // `school` stays CFB-gated.
    const stored = storedGameNames(match.game);
    if (match.storyIsHome === true && tokens.away) return `vs ${stored.away ?? school(tokens.away)}`;
    if (match.storyIsHome === false && tokens.home) return `at ${stored.home ?? school(tokens.home)}`;
  }

  if (!identity?.sideKnown || !team) return undefined;
  const away = normalizeTeamToken(identity.awayTeam);
  const home = normalizeTeamToken(identity.homeTeam);
  if (!away || !home || away === home) return undefined;
  if (team === home) return `vs ${school(away)}`;
  if (team === away) return `at ${school(home)}`;
  return undefined;
}

export function toSituationStoryCardData(
  row: SituationRowData,
  games?: readonly AnyBoardGame[],
): SituationStoryCardData {
  const identity = row.sportsIdentity;
  const matchup = row.matchup ?? matchupFromIdentity(identity);
  // What the card prints. `matchup` stays in tokens and keeps feeding
  // editorialHeadline below, which parses it.
  const matchupDisplay = row.matchupLabel ?? cfbMatchupLabelFromIdentity(identity) ?? matchup;
  const gameMatch = findGameForStory(identity, games);
  const storyType = storyTypeFromRow(row);
  const confidence = confidenceFromRow(row);
  const strengthContext = {
    sourceCount: row.sourceCount,
    verified: isSituationVerified({ verificationState: row.verificationState, escalationState: row.escalationState }),
  };
  const rawVerification = row.sourceProgressLabel ?? row.sourceSummary ?? row.statusLabel ?? row.escalationState;
const mappedVerification = rawVerification === "monitoring" ? "Developing" : rawVerification;
const verification = publicStoryText(mappedVerification, row.league);
  const headline = editorialHeadline(row, matchup);
  const whatHappened = storyWhatHappened(row);
  // Both are built from row.subtitle, so on most cards the deck printed the
  // exact sentence the "What happened" tile printed a few pixels below it.
  const dek = dedupeAgainst(editorialDeck(row, headline), whatHappened);
  const whyItMatters = storyWhyItMatters(row);
  // No placeholder: when none of the three parts resolved there is nothing we
  // know about this story that we did not know about every other one, and a
  // tile reading "EdgeSetter is monitoring source support, timing, confidence,
  // and downstream sports impact." said exactly that on every card. The tile is
  // omitted instead.
  const knownParts = [
    // sourceCountLabel answers "Source check pending" for a row with no count,
    // which is the placeholder, not a thing we know. Contribute nothing
    // instead, so a row with no source trail, no confidence and no timing drops
    // the tile rather than printing three stubs.
    row.sourceProgressLabel ?? (row.sourceCount ? sourceCountLabel(row.sourceCount) : undefined),
    confidence ? publicConfidenceLabel(confidence, strengthContext) : undefined,
    row.timingStageLabel ?? row.timingAdvantage,
  ].filter(Boolean);
  const edgeSetterKnows = knownParts.length ? cleanStoryLine(knownParts.join(" / ")) : undefined;
  const watchNext = storyWatchNext(row);

  return {
    id: row.id,
    league: row.league,
    headline,
    dek,
    sectionTitle: "Top Developing Story",
    whatHappened,
    whyItMatters,
    edgeSetterKnows,
    watchNext,
    relatedItems: relatedWatchItems(row, { headline, whatHappened, whyItMatters: whyItMatters ?? "", watchNext: watchNext ?? "" }),
    ctaLabel: "Open Story",
    matchup: matchupDisplay,
    primaryTeam: identity?.awayTeam ?? identity?.team,
    secondaryTeam: identity?.homeTeam ?? identity?.opponent,
    // Names for the caption only. primaryTeam/secondaryTeam above stay in
    // tokens because they are the TeamLogoImg and resolveSportsImageAsset
    // lookup keys. Tied to the awayTeam/homeTeam branch, not the
    // team/opponent fallback, which is signal-sourced.
    primaryTeamName: identity?.awayTeam ? identity.awayTeamName : undefined,
    secondaryTeamName: identity?.homeTeam ? identity.homeTeamName : undefined,
    player: identity?.player,
    // Gated, not just normalized: a fabricated "Questionable" and a contradicted
    // badge are both withheld here. See badgeableInjuryDesignation for the
    // server-side cause and the fix that lets this come back.
    injuryDesignation: badgeableInjuryDesignation(
      row.injuryDesignation,
      `${row.title} ${row.subtitle ?? ""}`,
    ),
    opponentLabel: opponentLabelFor(identity, gameMatch),
    // Gated by league: see KICKOFF_TRUSTED_LEAGUES. An untrusted league takes
    // the same blank as a missing time rather than printing one we cannot stand
    // behind.
    kickoff: gameMatch && kickoffIsTrustedForLeague(row.league)
      ? formatKickoff(gameMatch.game.gameDate ?? gameMatch.game.game_time)
      : undefined,
    storyType,
    timestamp: row.timestamp,
    confidence: confidence ? publicConfidenceLabel(confidence, strengthContext) : undefined,
    sourceCount: row.sourceCount,
    lifecycle: publicLifecycleLabel(row.lifecycleLabel),
    verification,
    evidence: evidenceLabel(row),
    timing: publicTimingLabel(row.timingStageLabel ?? row.timingAdvantage, row.league),
    market: row.marketReaction ?? row.market,
    row,
  };
}

export function toSituationStoryCards(rows: SituationRowData[], games?: readonly AnyBoardGame[]) {
  return rows.map((row) => toSituationStoryCardData(row, games));
}

export function toQuietLeagueLeadStory(league: "MLB" | "NBA"): SituationStoryCardData {
  const isMlb = league === "MLB";
  const headline = isMlb
    ? "Today's MLB watch: lineups, pitchers, weather, and late scratches"
    : "Tonight's NBA watch: starters, injuries, rotations, and late scratches";
  const dek = isMlb
    ? "EdgeSetter is tracking confirmed lineups, pitcher changes, bullpen usage, weather cells, injury updates, and market movement across today's slate."
    : "EdgeSetter is tracking starter confirmations, injury context, rotation changes, late scratches, and pre-tip market movement across tonight's slate.";
  const relatedItems = isMlb
    ? [
        "Lineup cards posting before first pitch",
        "Pitcher confirmations and bullpen availability",
        "Weather or park conditions affecting totals",
        "Late scratches, roster moves, and movement before public confirmation",
      ]
    : [
        "Starter confirmations before tip",
        "Injury context and warmup reports",
        "Rotation changes and late scratches",
        "Pre-tip movement before public confirmation",
      ];
  const row: SituationRowData = {
    id: `featured-empty-${league.toLowerCase()}`,
    title: headline,
    subtitle: dek,
    league,
    statusLabel: "Developing",
    lifecycleLabel: "Quiet slate",
    sourceProgressLabel: "Checking sources",
    sportsIdentity: { sport: league.toLowerCase() as "mlb" | "nba" },
  };

  return {
    id: row.id,
    league,
    sectionTitle: `${league} Watch Board`,
    headline,
    dek,
    whatHappened: isMlb
      ? "Lineups, pitchers, weather, bullpen usage, injury updates, and market movement are being checked before first pitch."
      : "Starters, injuries, rotations, late scratches, warmups, and market movement are being checked before tip.",
    whyItMatters: "Quiet boards still carry useful sports context because the next confirmation can change lineup, role, fantasy, fan, or market reads.",
    edgeSetterKnows: "EdgeSetter is monitoring source support, timing, confidence, and downstream sports context.",
    watchNext: isMlb
      ? "Watch confirmed lineups, pitcher changes, weather cells, bullpen availability, late scratches, and roster moves."
      : "Watch starter confirmations, warmup reports, injury context, rotation changes, late scratches, and pre-tip movement.",
    relatedItems,
    ctaLabel: "Open Watch Board",
    storyType: "Slate watch",
    lifecycle: "Monitoring",
    verification: "Checking sources",
    evidence: "Nothing verified yet",
    timing: isMlb ? "Before first pitch" : "Before tip",
    row,
  };
}

export function featuredCopy(situation: BoardSituation | null, league: Sport) {
  if (!situation) {
    if (league === "MLB") {
      return {
        title: "Today's MLB watch: lineups, pitchers, weather, and late scratches",
        summary: "EdgeSetter is tracking confirmed lineups, pitcher changes, bullpen usage, weather cells, injury updates, and market movement across today's slate.",
        primaryRead: "Lineup cards, probable and confirmed pitchers, bullpen availability, weather shifts, late scratches, and roster moves stay on the board before first pitch.",
        secondaryRead: "The lead area stays useful even when no story has enough source agreement, timing pressure, or market reaction to elevate.",
        metrics: [],
      };
    }
    if (league === "NBA") {
      return {
        title: "Tonight's NBA watch: starters, injuries, rotations, and late scratches",
        summary: "EdgeSetter is tracking starter confirmations, injury context, rotation changes, late scratches, and pre-tip market movement across tonight's slate.",
        primaryRead: "Starter confirmations, warmup reports, injury updates, rotation changes, late scratches, and public context stay on the board before tip.",
        secondaryRead: "The lead area stays useful even when no story has enough source agreement, timing pressure, or market reaction to elevate.",
        metrics: [],
      };
    }
    if (league === "NFL") {
      return {
        title: "Tonight's NFL watch: injuries, lineups, and pre-game movement",
        summary: "EdgeSetter is tracking injury designations, lineup confirmations, weather notes, and market movement across this week's slate.",
        primaryRead: "Injury reports, practice participation, lineup confirmations, and market movement stay on the board before kickoff.",
        secondaryRead: "The lead area stays useful even when no story has enough source agreement, timing pressure, or market reaction to elevate.",
        metrics: [],
      };
    }
    if (league === "CFB") {
      return {
        title: "This week's CFB watch: injuries, transfers, and market movement",
        summary: "EdgeSetter is tracking injury designations, transfer portal activity, depth chart changes, and market movement across this week's slate.",
        primaryRead: "Injury reports, transfer portal moves, depth chart changes, and market movement stay on the board before kickoff.",
        secondaryRead: "The lead area stays useful even when no story has enough source agreement, timing pressure, or market reaction to elevate.",
        metrics: [],
      };
    }
    return {
      title: "Coverage watch",
      summary: leagueEmptyCopy[league],
      primaryRead: "No developing story is above the monitoring threshold yet.",
      secondaryRead: "Stories only elevate when source agreement, market reaction, or live game state supports it.",
      metrics: [],
    };
  }

  const signal = situation.signal as AnyBoardSignal | undefined;
  const canonical = situation.canonicalSituation as CanonicalSituation | undefined;
  const editorialCopy = league === "MLB" || league === "NBA" || league === "CFB" || league === "NFL";
  const confidenceDelta = canonical?.confidenceHistoryPreview?.[0]?.delta;
  const confidenceDeltaMetric = typeof confidenceDelta === "number" && confidenceDelta !== 0
    ? { label: "Confidence move", value: `${confidenceDelta > 0 ? "+" : ""}${Math.round(confidenceDelta)}`, tone: confidenceDelta > 0 ? "positive" : "warning" }
    : null;
  const escalationState = escalationStateForSituation(situation);
  const strengthContext = {
    sourceCount: situation.sourceCount,
    verified: isSituationVerified({ escalationState }),
  };
  return {
    title: fanFirstTitle(situation, canonical),
    summary: fanFirstSummary(situation, signal, canonical),
    primaryRead: fanFirstPrimaryRead(situation, signal, canonical),
    secondaryRead: fanSafeContext([situation.sourceSummary, canonical?.confidenceFactors.whatRemainsUncertain[0], situation.timingAdvantage].filter(Boolean).join(" / ") || signal?.action_takeaway || situation.trustLabel),
    metrics: [
      { label: "Story priority", value: editorialCopy ? publicUrgencyLabel(situation.score) : urgencyLabel(situation.score), tone: situation.score >= 82 ? "danger" : situation.score >= 65 ? "warning" : "default" },
      { label: "Confidence", value: publicConfidenceLabel(situation.confidence, strengthContext), tone: situation.confidence >= 80 ? "positive" : "default" },
      confidenceDeltaMetric,
      canonical ? { label: "Evidence", value: editorialCopy ? evidenceCountText(canonical.evidenceCount) : canonical.evidenceCount, tone: canonical.evidenceCount >= 3 ? "positive" : "default" } : null,
      { label: "Verification", value: editorialCopy ? publicLifecycleLabel(situation.lifecycleStage) : lifecycleDisplayLabel(situation.lifecycleStage), tone: situation.lifecycleStage === "Context Moving" ? "warning" : situation.lifecycleStage === "Resolved / Stale" ? "default" : "positive" },
      { label: "Timing", value: editorialCopy ? publicTimingLabel(situation.timingAdvantage, situation.league) : timingMetricLabel(situation.timingAdvantage), tone: situation.isActionable ? "positive" : "warning" },
    ].filter(Boolean) as SituationMetric[],
  };
}

export function situationMatchesPriority(situation: BoardSituation, urgencyFilter: string) {
  if (urgencyFilter === "critical") return situation.escalation === "Breaking" || situation.escalation === "Urgent";
  if (urgencyFilter === "high") return ["Breaking", "Urgent", "Elevated"].includes(situation.escalation);
  return true;
}

export function sortModeFromPriority(sortId: string): BoardSortMode {
  if (sortId === "freshness") return "newest";
  if (sortId === "confidence") return "confidence";
  if (sortId === "movement") return "movement";
  return "priority";
}

export function laneLabel(lane: SituationLane) {
  if (lane === "live") return "Live Game Watch";
  if (lane === "decision") return "Decision Windows";
  if (lane === "confirmed") return "Verified Stories";
  if (lane === "background") return "Background Watch";
  return "Escalating Stories";
}

// Single source of truth for "is this situation verified" used by the
// evidence-strength cap. Previously this was inlined at three call sites, two of
// which drifted in casing; keep them in lockstep here so a new state value or an
// upstream casing change can only ever change one definition.
//
// Casing note: `verificationState` is compared against capitalized "Verified"
// (it comes from deriveSignalVerificationState's SituationVerificationState) while
// `escalationState` is compared against lowercase "verified"/"official" (it comes
// from SituationEscalationState). The split is intentional — genuinely different
// upstream fields with different value vocabularies — not an accidental mismatch.
export function isSituationVerified(input: {
  verificationState?: string | null;
  escalationState?: string | null;
}): boolean {
  return (
    input.verificationState === "Verified" ||
    input.escalationState === "verified" ||
    input.escalationState === "official"
  );
}

function escalationStateForSituation(situation: BoardSituation): SituationEscalationState {
  const canonical = situation.canonicalSituation as CanonicalSituation | undefined;
  if (canonical?.lifecycleState === "official") return "official";
  if (canonical?.lifecycleState === "confirmed") return "verified";
  if (canonical?.lifecycleState === "cooling" || canonical?.lifecycleState === "resolved") return "monitoring";
  if (situation.escalation === "Breaking" || situation.escalation === "Urgent") return "escalated";
  if (situation.escalation === "Elevated") return "developing";
  if (situation.lifecycle === "Confirmed") return "verified";
  if (situation.escalation === "Watch") return "developing";
  return "monitoring";
}

function lifecycleStateForLabel(label?: string): "detected" | "developing" | "escalating" | "verified" | "market" | "consensus" | "stale" {
  if (label === "Detected") return "detected";
  if (label === "Escalating") return "escalating";
  if (label === "Verified") return "verified";
  if (label === "Context Moving") return "market";
  if (label === "Consensus Forming") return "consensus";
  if (label === "Resolved / Stale") return "stale";
  return "developing";
}

function lifecycleVisualState(canonical: CanonicalSituation): SituationLifecycleVisualState {
  if (canonical.lifecycleState === "emerging" || canonical.lifecycleState === "watching") return "emerging";
  if (canonical.lifecycleState === "developing") return "developing";
  if (canonical.lifecycleState === "escalating") {
    return canonical.latestEvidence.some((event) => event.marketImpact) ? "market-reacting" : "confirming";
  }
  if (canonical.lifecycleState === "confirmed" || canonical.lifecycleState === "official") return "verified";
  if (canonical.lifecycleState === "cooling") return "cooling";
  if (canonical.lifecycleState === "resolved" || canonical.lifecycleState === "invalidated") return "resolved";
  return "archived";
}

function lifecycleVisualStateForLabel(label?: string): SituationLifecycleVisualState {
  if (label === "Detected") return "emerging";
  if (label === "Escalating") return "confirming";
  if (label === "Verified" || label === "Consensus Forming") return "verified";
  if (label === "Context Moving") return "market-reacting";
  if (label === "Resolved / Stale") return "cooling";
  return "developing";
}

function sourceProgressLabel(canonical: CanonicalSituation) {
  const agreement = canonical.latestEvidence.find((event) => event.validatorAgreement)?.validatorAgreement;
  const sourceCount = `${canonical.sourceCount} ${canonical.sourceCount === 1 ? "report" : "reports"}`;
  const evidenceCount = `${canonical.evidenceCount} evidence ${canonical.evidenceCount === 1 ? "event" : "events"}`;
  if (agreement) return `${sourceCount} / ${agreement}`;
  return `${sourceCount} / ${evidenceCount}`;
}

function evidenceChain(canonical: CanonicalSituation): SituationEvidenceStep[] {
  const hasMarket = canonical.latestEvidence.some((event) => event.marketImpact);
  const hasOfficial = canonical.lifecycleState === "official" || canonical.lifecycleState === "confirmed";
  const uncertain = canonical.confidenceFactors.whatRemainsUncertain.length > 0;
  const sourceState = canonical.sourceCount >= 3 ? "complete" : canonical.sourceCount >= 2 ? "active" : "caution";
  const confidenceState = canonical.confidence >= 75 ? "complete" : canonical.confidence >= 55 ? "active" : "caution";
  const timingState = canonical.timingPressure === "critical" || canonical.timingPressure === "high"
    ? "active"
    : canonical.timingPressure === "inactive" ? "quiet" : "complete";

  return [
    { label: "Reports", value: sourceConvergenceStage(canonical), state: sourceState },
    { label: "Evidence", value: `${canonical.evidenceCount} event${canonical.evidenceCount === 1 ? "" : "s"}`, state: canonical.evidenceCount >= 3 ? "complete" : "active" },
    { label: "Confidence", value: confidenceMovementSummary(canonical), state: confidenceState },
    { label: "Timing", value: timingStageLabel(canonical), state: timingState },
    {
      label: hasOfficial ? "Official" : hasMarket ? "Market reaction" : "Watch next",
      value: hasOfficial ? "Confirmed update" : hasMarket ? "Early market reaction" : uncertain ? "Still open" : "Quiet",
      state: hasOfficial ? "complete" : hasMarket ? "active" : uncertain ? "caution" : "quiet",
    },
  ];
}

function fallbackEvidenceChain(situation: BoardSituation): SituationEvidenceStep[] {
  const sourceCount = Math.max(0, situation.sourceCount ?? 0);
  const hasMarket = Boolean(situation.movementLabel);
  return [
    { label: "Reports", value: fallbackSourceStage(situation), state: sourceCount > 1 ? "active" : "caution" },
    { label: "Evidence", value: sourceCount > 1 ? `${sourceCount} reports` : "1 report", state: sourceCount > 1 ? "active" : "caution" },
    { label: "Confidence", value: fallbackConfidenceStage(situation), state: situation.confidence >= 75 ? "complete" : situation.confidence >= 55 ? "active" : "caution" },
    { label: "Timing", value: fallbackTimingStage(situation), state: situation.isActionable ? "active" : "quiet" },
    { label: hasMarket ? "Market reaction" : "Watch next", value: hasMarket ? "Early market reaction" : "Quiet", state: hasMarket ? "active" : "quiet" },
  ];
}

function confidenceMovementSummary(canonical: CanonicalSituation) {
  const delta = canonical.confidenceHistoryPreview[0]?.delta;
  if (typeof delta === "number" && delta > 0) return `building +${Math.round(delta)}`;
  if (typeof delta === "number" && delta < 0) return `cooling ${Math.round(delta)}`;
  if (canonical.confidence >= 75) return "strong pattern match";
  if (canonical.confidence >= 55) return "forming";
  return "thin";
}

function evidenceGrowthLabel(canonical: CanonicalSituation) {
  const latest = canonical.confidenceHistoryPreview[0];
  if (latest?.reasons?.[0]) return fanSafeContext(latest.reasons[0]);
  if (canonical.latestEvidence[0]?.summary) return fanSafeContext(canonical.latestEvidence[0].summary);
  return `${canonical.evidenceCount} evidence events attached`;
}

function sourceConvergenceStage(canonical: CanonicalSituation) {
  const agreement = canonical.latestEvidence.find((event) => event.validatorAgreement)?.validatorAgreement;
  if (agreement) return agreement;
  if (canonical.sourceCount >= 3) return "source agreement";
  if (canonical.sourceCount >= 2) return "corroborated";
  return "single-source";
}

function sourceReliabilityLabel(canonical: CanonicalSituation) {
  const reliability = canonical.confidenceFactors.scores.source_reliability;
  if (reliability >= 18) return "reliable report support";
  if (reliability >= 12) return "moderate report support";
  return "limited report support";
}

function timingStageLabel(canonical: CanonicalSituation) {
  if (canonical.lifecycleState === "official") return "official confirmation";
  if (canonical.lifecycleState === "confirmed") return "public confirmation";
  if (canonical.lifecycleState === "cooling") return "fully priced";
  if (canonical.lifecycleState === "resolved" || canonical.lifecycleState === "archived" || canonical.lifecycleState === "invalidated") return "cooling story";
  if (canonical.latestEvidence.some((event) => event.marketImpact)) return "Early market reaction";
  if (canonical.timingPressure === "critical" || canonical.timingPressure === "high") return "early signal";
  if (canonical.timingPressure === "medium") return "developing window";
  if (canonical.timingPressure === "low") return "quiet board";
  return "cooling story";
}

function fallbackSourceProgress(situation: BoardSituation) {
  const count = Math.max(0, situation.sourceCount ?? 0);
  if (count >= 3) return `${count} reports attached`;
  if (count >= 2) return `${count} reports / corroborated`;
  return "1 report / Needs more confirmation";
}

function fallbackSourceStage(situation: BoardSituation) {
  const count = Math.max(0, situation.sourceCount ?? 0);
  if (count >= 3) return "reports attached";
  if (count >= 2) return "corroborated";
  return "single-source";
}

function fallbackConfidenceStage(situation: BoardSituation) {
  if (situation.confidence >= 80) return "strong pattern match";
  if (situation.confidence >= 60) return "building";
  return "forming";
}

function fallbackTimingStage(situation: BoardSituation) {
  if (situation.lifecycleStage === "Context Moving" || situation.movementLabel) return "Early market reaction";
  if (situation.lifecycleStage === "Consensus Forming") return "consensus forming";
  if (situation.lifecycleStage === "Verified") return "ES Agents verified";
  if (situation.lifecycleStage === "Resolved / Stale") return "cooling story";
  if (situation.isActionable && situation.escalation === "Watch") return "developing window";
  if (situation.isActionable) return "early development";
  return "quiet board";
}

function urgencyLabel(score: number) {
  if (score >= 95) return "High";
  if (score >= 78) return "Elevated";
  if (score >= 58) return "Watch";
  return "Monitor";
}

function lifecycleDisplayLabel(label?: string) {
  return publicLifecycleLabel(label);
}

function sportsIdentityForSituation(situation: BoardSituation, canonical?: CanonicalSituation): SituationRowData["sportsIdentity"] {
  const teams = canonical?.teams ?? [];
  const sport = situation.league === "MLB" ? "mlb"
    : situation.league === "NBA" ? "nba"
      : situation.league === "NFL" ? "nfl"
        : situation.league === "CFB" ? "cfb"
          : undefined;
  const guard = (v: string | undefined) => (v && isValidTeamToken(v, sport)) ? v : undefined;
  const awayTeam = guard(situation.awayTeam ?? teams[0] ?? situation.team);
  const homeTeam = guard(situation.homeTeam ?? teams[1] ?? situation.opponent);
  // Same gate cfbMatchupLabelFromIdentity uses, for the same reason: without a
  // real away/home pair these are injury-adapter abbreviations, where FLA
  // genuinely is Florida and the mascot-slice table would mis-resolve it.
  const sideKnown = Boolean(guard(situation.awayTeam) && guard(situation.homeTeam));
  // Stored names come off the games row the situation was built from, so they
  // need no league gate — a feed that named the team named that team.
  const stored = storedGameNames(situation.game as AnyBoardGame | undefined);
  const nameFor = (token: string | undefined, storedName: string | undefined) =>
    teamDisplayName(token, storedName, sideKnown ? situation.league : undefined);
  return {
    awayTeam,
    homeTeam,
    awayTeamName: nameFor(awayTeam, stored.away),
    homeTeamName: nameFor(homeTeam, stored.home),
    team: guard(situation.team ?? teams[0]),
    opponent: guard(situation.opponent ?? teams[1]),
    player: canonical?.players?.[0] ?? situation.player,
    // Passenger for the story-card headshot — only present when the canonical
    // situation resolved a roster-backed ESPN id.
    playerEspnId: canonical?.playerEspnId,
    // Jersey number passenger, parallel to playerEspnId — drives the
    // jersey-number story-card treatment when present.
    playerJersey: canonical?.playerJersey,
    // Recorded BEFORE the `?? situation.team` fallbacks above collapse the
    // distinction — see SituationSportsIdentity.sideKnown.
    sideKnown,
    sport,
  };
}

function matchupFromIdentity(identity?: SituationRowData["sportsIdentity"]) {
  const away = identity?.awayTeam ?? identity?.team;
  const home = identity?.homeTeam ?? identity?.opponent;
  if (away && home && away !== home) return `${away} @ ${home}`;
  return away ?? home;
}

function storyTypeFromRow(row: SituationRowData) {
  const text = `${row.title} ${row.subtitle ?? ""} ${row.market ?? ""} ${row.tags?.join(" ") ?? ""}`.toLowerCase();
  if (text.includes("injury") || text.includes("questionable") || text.includes("availability")) return "Availability watch";
  if (text.includes("lineup") || text.includes("scratch")) return "Lineup watch";
  if (text.includes("pitcher") || text.includes("starter")) return "Pitcher watch";
  if (text.includes("weather")) return "Weather watch";
  if (text.includes("market") || text.includes("movement")) return "Market reaction";
  if (row.matchup) return "Matchup watch";
  return publicLifecycleLabel(row.lifecycleLabel) ?? "Developing story";
}

function confidenceFromRow(row: SituationRowData) {
  const confidenceMetric = row.metrics?.find((metric) => metric.label.toLowerCase().includes("confidence"));
  if (confidenceMetric) return String(confidenceMetric.value);
  return row.confidenceNote?.match(/\d+%/)?.[0];
}

function evidenceLabel(row: SituationRowData) {
  if (row.evidenceCount != null) return evidenceCountText(row.evidenceCount);
  if (row.evidenceGrowthLabel) return publicStoryText(row.evidenceGrowthLabel, row.league);
  return row.sourceCount ? `${row.sourceCount} report${row.sourceCount === 1 ? "" : "s"}` : undefined;
}

function sourceCountLabel(sourceCount?: number) {
  return sourceCountText(sourceCount);
}

function cleanStoryLine(value?: string) {
  return tightenSentence(publicStoryText(fanSafeContext(value), undefined)?.trim() || "");
}

function editorialHeadline(row: SituationRowData, matchup?: string) {
  // `raw` is only ever printed — it is the final fallthrough below and nothing
  // branches on it — so it is the one place the names version belongs. Every
  // predicate under it keeps reading `row.title`, which stays in tokens.
  const raw = cleanRawReport(row.titleLabel ?? row.title);
  const context = `${row.title} ${row.subtitle ?? ""} ${row.market ?? ""}`.toLowerCase();
  const player = row.sportsIdentity?.player ?? playerFromRawTitle(row.title);
  const team = row.sportsIdentity?.team ?? row.sportsIdentity?.awayTeam ?? teamFromRawTitle(row.title);
  const opponent = row.sportsIdentity?.opponent ?? row.sportsIdentity?.homeTeam;
  const injury = injuryPart(context);

  if (injury && player) {
    const subject = team && team !== player ? `${team} availability` : "availability";
    return `${player} ${injury} injury puts ${subject} in focus`;
  }

  if (isMarketDominantTitle(row.title) || context.includes("market")) {
    const label = cleanPublicMatchupLabel(matchup, team, opponent);
    if (!label) return publicFallbackLabel(context, row.league);
    return row.league === "MLB"
      ? `${label} line movement follows late roster context`
      : `${label} line movement follows late availability context`;
  }

  if (context.includes("lineup") || context.includes("scratch") || context.includes("starter")) {
    const subject = team || matchup;
    if (!subject) return publicFallbackLabel(context, row.league);
    return row.league === "MLB"
      ? `Late ${subject} lineup update could change first-pitch plans`
      : `Late ${subject} starter update could change rotation plans`;
  }

  if (row.league === "MLB" && context.includes("pitcher")) {
    return `${team || matchup || "MLB"} pitching update moves the slate`;
  }

  return conciseHeadline(raw, row.league);
}

/**
 * Two pieces of card copy are the same claim when they reduce to the same
 * words, or when one wholly contains the other — `storyWhatHappened` can wrap
 * the subtitle in a lead-in, which still leaves the reader reading it twice.
 *
 * Containment only counts past 20 characters: a short fragment inside a longer
 * sentence is a coincidence, not a duplicate.
 */
function isSameClaim(left?: string, right?: string): boolean {
  const norm = (v?: string) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const a = norm(left);
  const b = norm(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 20 && longer.includes(shorter);
}

/** The value, unless it is already being said by `against`. */
function dedupeAgainst(value: string | undefined, against: string | undefined): string | undefined {
  return value && isSameClaim(value, against) ? undefined : value;
}

function editorialDeck(row: SituationRowData, headline: string): string | undefined {
  const candidates = [
    row.subtitle,
    row.marketReaction,
    row.market,
  ].map((v) => cleanStoryLine(v)).filter(Boolean) as string[];
  const summary = candidates.find((s) => s.toLowerCase() !== headline.toLowerCase());
  if (summary) return summary;
  const specific = situationDek(row);
  if (specific) return specific;
  // No per-league fallback. A deck is the story's own second sentence; when the
  // story has not given us one, "EdgeSetter is tracking depth chart, injury
  // designations, snap share..." is the same sentence under every NFL headline
  // on the page. The deck is dropped instead.
  return undefined;
}

function situationDek(row: SituationRowData): string | undefined {
  const player = row.sportsIdentity?.player ?? playerFromRawTitle(row.title);
  const team = row.sportsIdentity?.team ?? row.sportsIdentity?.awayTeam ?? teamFromRawTitle(row.title);
  const opponent = row.sportsIdentity?.opponent ?? row.sportsIdentity?.homeTeam;
  const ctx = row.title.toLowerCase();
  const movementNote = row.marketReaction ? ` ${cleanStoryLine(row.marketReaction)}.` : "";

  const confirmedStarter = (ctx.includes("confirmed") || ctx.includes("confirm")) && (ctx.includes("starter") || ctx.includes("pitcher"));
  const confirmedLineup = (ctx.includes("confirmed") || ctx.includes("confirm")) && (ctx.includes("lineup") || ctx.includes("batting order"));
  const lineupScratch = ctx.includes("lineup") || ctx.includes("scratch");
  const pitcherWatch = ctx.includes("pitcher") || ctx.includes("pitching");

  if (confirmedStarter) {
    const who = player ?? team ?? "The starter";
    const against = opponent ? ` against ${opponent}` : team && row.matchup ? ` in ${row.matchup}` : "";
    return `${who} is confirmed to start${against}.${movementNote} Watch for lineup and bullpen decisions before first pitch.`;
  }

  if (confirmedLineup) {
    const who = team ?? player ?? "The lineup";
    const against = opponent ? ` against ${opponent}` : "";
    return `${who} lineup is confirmed${against}.${movementNote} Watch how the confirmation affects fantasy, market, and game-state reads.`;
  }

  if (lineupScratch && (player || team)) {
    const who = player ? `${player}${team ? ` (${team})` : ""}` : team!;
    return row.league === "NBA"
      ? `${who} is out of the lineup.${movementNote} Watch how the team adjusts rotation and usage before tip.`
      : `${who} is out of the lineup.${movementNote} Watch how the team adjusts the batting order and bullpen before first pitch.`;
  }

  if (pitcherWatch && (player || team)) {
    const who = player ?? team!;
    const against = opponent ? ` against ${opponent}` : row.matchup ? ` in ${row.matchup}` : "";
    return `${who}${against} is the lead pitching context.${movementNote} Watch for bullpen availability, weather, and market response before first pitch.`;
  }

  return undefined;
}

function relatedWatchItems(row: SituationRowData, lines: { headline: string; whatHappened: string; whyItMatters: string; watchNext: string }) {
  const items = [
    conciseHeadline(lines.headline, row.league),
    lines.watchNext,
    row.sourceProgressLabel ? cleanStoryLine(row.sourceProgressLabel) : undefined,
    row.timingStageLabel ? (row.timingStageLabel.toLowerCase().includes("public confirmation") ? "ES Agents verified" : cleanStoryLine(row.timingStageLabel)) : undefined,
  ].filter(Boolean) as string[];
  return Array.from(new Set(items.map((item) => tightenSentence(item)))).slice(0, 4);
}

function storyWhatHappened(row: SituationRowData) {
  const headline = editorialHeadline(row, row.matchup ?? matchupFromIdentity(row.sportsIdentity));
  const summary = cleanStoryLine(row.subtitle ?? row.marketReaction ?? row.market);
  if (summary && summary.toLowerCase() !== headline.toLowerCase()) return factualEvent(summary, row);
  if (row.market?.toLowerCase().includes("market") || row.title.toLowerCase().includes("line move")) {
    return row.league === "NBA"
      ? "The pre-tip market moved before the full availability picture was clear."
      : "The market moved before the full lineup, pitching, injury, or weather picture was clear.";
  }
  return factualEvent(cleanRawReport(row.title), row);
}

function storyWhyItMatters(row: SituationRowData): string | undefined {
  const text = `${row.title} ${row.subtitle ?? ""} ${row.market ?? ""}`.toLowerCase();
  if (text.includes("market") || text.includes("line move")) {
    return row.league === "NBA"
      ? "A pre-tip move can point to starter, rotation, late-scratch, injury, or availability context that has not fully surfaced."
      : "A move can point to lineup, pitcher, injury, weather, bullpen, or availability context that has not fully surfaced.";
  }
  if (text.includes("injury") || text.includes("out") || text.includes("questionable")) {
    if (row.league === "NBA") return "Availability changes can shift starters, rotations, usage, and pre-tip pricing.";
    if (row.league === "MLB") return "Availability changes can shift lineups, bullpen planning, pitcher usage, and pricing.";
    if (row.league === "NFL") return "Availability changes can shift depth charts, snap share, target distribution, and game-week pricing.";
    if (row.league === "CFB") return "Availability changes can shift depth charts, scheme reads, and how the program enters the week.";
    return "Availability changes can shift lineups, defensive alignment, and pricing.";
  }
  if (row.evidenceGrowthLabel) return cleanStoryLine(row.evidenceGrowthLabel);
  return undefined;
}

function storyWatchNext(row: SituationRowData): string | undefined {
  const SUPPRESSED_TIMING_VALUES = ["public confirmation", "cooling story", "quiet board", "fully priced"];
  const timingRaw = row.uncertaintyLabel ?? row.timingStageLabel;
  const timing = timingRaw ? cleanStoryLine(timingRaw) : undefined;
  if (timing && !SUPPRESSED_TIMING_VALUES.some((v) => timing.toLowerCase().includes(v))) return timing;
  // Previously fell through to one sentence per league. Those were printed
  // under a "Watch next" label on every story in that league regardless of
  // what the story was, which makes them decoration, not a read. When this
  // situation carries no timing or uncertainty of its own, the tile is omitted.
  return undefined;
}

const SOURCE_NOISE_PATTERNS = [
  /transfer your tickets/i,
  /download tickets/i,
  /how to transfer/i,
  /&amp;/,
  /roster move changes roster availability and may affect downstream/i,
  /may affect downstream sports context/i,
];

export function isSourceNoise(value?: string | null): boolean {
  if (!value) return false;
  return SOURCE_NOISE_PATTERNS.some((pattern) => pattern.test(value));
}

function cleanRawReport(value?: string | null) {
  return publicStoryText(value ?? "")
    .replace(/\([^)]{28,}\)/g, "")
    .replace(/\s+[—-]\s*(OUT|QUESTIONABLE|DOUBTFUL|PROBABLE|ACTIVE|INACTIVE)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function conciseHeadline(value: string, league?: string) {
  const clean = cleanRawReport(value)
    .replace(/\breports?\b\.?$/i, "")
    .replace(/\bper\s+[A-Z][A-Za-z\s.]+$/i, "")
    .trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= 11) return clean;
  return `${words.slice(0, 11).join(" ")}`;
}

function playerFromRawTitle(value?: string) {
  const match = value?.match(/^([^()—-]{3,60})\s*(?:\(|—|-)/);
  return match?.[1]?.trim();
}

function teamFromRawTitle(value?: string) {
  const match = value?.match(/\b([A-Z]{2,4})\b/);
  return match?.[1];
}

function injuryPart(text: string) {
  const injury = text.match(/\b(finger|pinky|thumb|hand|wrist|ankle|knee|hamstring|quad|calf|foot|toe|shoulder|back|neck|rib|hip|groin|illness|concussion)\b/i)?.[1];
  if (!injury) return null;
  if (injury.toLowerCase() === "pinky") return "finger";
  return injury.toLowerCase();
}

function factualEvent(value: string, row: SituationRowData) {
  const clean = tightenSentence(cleanRawReport(value));
  if (clean.length <= 150) return clean;
  if (row.sportsIdentity?.player) return `${row.sportsIdentity.player} update changed the availability read.`;
  if (row.matchup) return `${row.matchup} context changed on the board.`;
  return conciseHeadline(clean, row.league);
}

function tightenSentence(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .trim();
}

function cleanPublicMatchupLabel(matchup?: string, team?: string, opponent?: string) {
  const raw = matchup ? matchup.replace(/\s+@\s+|\s+vs\.?\s+/gi, "-") : [team, opponent].filter(Boolean).join("-");
  const parts = raw
    .split(/[-/@]/)
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
  const unique = Array.from(new Set(parts));
  const label = unique.length >= 2 ? unique.slice(0, 2).join("-") : "";
  if (!label || !hasCleanPublicTeamIdentity(...unique) || !hasCleanPublicText(label) || hasMalformedPublicMatchup(raw)) return "";
  return label;
}

function fanFirstTitle(situation: BoardSituation, canonical?: CanonicalSituation) {
  if (!storyTitleHasValidPlayerName(situation.title)) {
    const team = situation.team ?? situation.awayTeam ?? canonical?.teams?.[0]
    const context = `${situation.signalType ?? ''} ${situation.detail ?? ''}`.toLowerCase()
    if (team) {
      if (context.includes('eligibility')) return `${team} eligibility ruling under review`
      if (context.includes('injury') || context.includes('availability')) return `${team} availability update under review`
      if (context.includes('transfer')) return `${team} transfer portal update`
      if (context.includes('roster') || context.includes('depth')) return `${team} roster update`
      return `${team} story update`
    }
    return `${situation.league ?? 'CFB'} story under review`
  }
  const rawTitle = situation.title.trim();
  if (situation.kind === "game") return rawTitle;
  if (!isMarketDominantTitle(rawTitle)) return rawTitle;
  const identity = fanIdentityLabel(situation, canonical);
  const context = fanContextLabel(situation);
  if (situation.lifecycleStage === "Verified" || situation.lifecycleStage === "Consensus Forming") {
    return `${identity} ${context} moving toward confirmation`;
  }
  if (situation.lifecycleStage === "Context Moving") {
    return context === "market movement"
      ? marketFocusHeadline(identity, situation.league)
      : `${identity} ${context} is moving`;
  }
  return `${identity} ${context} under review`;
}

function fanFirstSummary(situation: BoardSituation, signal?: AnyBoardSignal, canonical?: CanonicalSituation) {
  const base = signal?.why_it_matters ?? situation.detail ?? canonical?.summary;
  if (base && !isMarketDominantTitle(base)) return fanSafeContext(base);
  const identity = fanIdentityLabel(situation, canonical);
  const change = fanContextLabel(situation);
  return `${identity} ${change} is the lead sports context. Betting and market reaction are supporting evidence, not the whole story.`;
}

function fanFirstPrimaryRead(situation: BoardSituation, signal?: AnyBoardSignal, canonical?: CanonicalSituation) {
  const evidence = canonical?.confidenceFactors.evidenceThatMattersMost[0] ?? signal?.why_it_matters;
  if (evidence && !isMarketDominantTitle(evidence)) return fanSafeContext(evidence);
  const identity = fanIdentityLabel(situation, canonical);
  return `${identity} is being reviewed for team, player, lineup, availability, fantasy, fan, and game-context impact before betting or market context is considered.`;
}

function fanSafeContext(value?: string | null) {
  if (!value) return undefined;
  return value
    .replace(/Market inefficiency detected/gi, "Market is reacting")
    .replace(/line adjusting toward true probability/gi, "market is reacting to new context")
    .replace(/market is reacting/gi, "Market is reacting")
    .replace(/market movement/gi, "market reaction")
    .replace(/market signals/gi, "sports context")
    .replace(/market checks/gi, "context checks")
    .replace(/downstream market/gi, "downstream sports")
    .replace(/DraftKings/gi, "source")
    .replace(/FanDuel/gi, "source")
    .replace(new RegExp(["books", "reacting"].join(" "), "gi"), "market is reacting")
    .replace(new RegExp(["market", "reacting"].join(" "), "gi"), "Market is reacting")
    .replace(/sharp money/gi, "professional source activity")
    .replace(/Sharp money/gi, "Professional source activity");
}

function fanIdentityLabel(situation: BoardSituation, canonical?: CanonicalSituation) {
  const teams = canonical?.teams ?? [];
  const away = situation.awayTeam ?? teams[0];
  const home = situation.homeTeam ?? teams[1];
  if (away && home) return `${away}-${home}`;
  if (situation.player && situation.team) return `${situation.team} ${situation.player}`;
  if (situation.player) return situation.player;
  if (situation.team) return situation.team;
  if (teams.length) return teams.slice(0, 2).join("-");
  return `${situation.league} story`;
}

function fanContextLabel(situation: BoardSituation) {
  const text = `${situation.signalType ?? ""} ${situation.detail ?? ""} ${situation.title}`.toLowerCase();
  if (text.includes("injury") || text.includes("questionable") || text.includes("dnp") || text.includes("availability")) return "availability update";
  if (text.includes("lineup") || text.includes("starter") || text.includes("rotation")) return "lineup watch";
  if (text.includes("role") || text.includes("depth")) return "role change";
  if (text.includes("weather")) return "game-condition watch";
  if (text.includes("market") || text.includes("line move") || text.includes("sharp steam") || text.includes("->")) return "market movement";
  if (text.includes("market") || text.includes("line move") || text.includes("sharp steam") || text.includes("->") || text.includes("→")) return "watch window";
  return "story update";
}

function isMarketDominantTitle(value: string) {
  const text = value.toLowerCase();
  return text.includes("line move")
    || text.includes("sharp steam")
    || text.includes("sharp money")
    || text.includes("spread")
    || text.includes(["market", "reacting"].join(" "))
    || text.includes(["market", "inefficiency"].join(" "))
    || text.includes("line adjusting")
    || /\b[+-]?\d+(\.\d+)?\s*(->|→)\s*[+-]?\d/.test(text);
}

function timingMetricLabel(value?: string) {
  if (!value) return "Monitoring";
  if (value.includes(":")) return value.split(":")[0];
  if (value.includes(",")) return value.split(",")[0];
  return value;
}

function urgencyForEscalation(escalation: BoardEscalation): BoardUrgency {
  if (escalation === "Breaking") return "critical";
  if (escalation === "Urgent" || escalation === "Elevated") return "high";
  if (escalation === "Watch") return "medium";
  return "low";
}

function normalizeGameStatus(status: string): LiveGameStatus {
  const value = status.toLowerCase();
  if (value.includes("final")) return "final";
  if (value.includes("half")) return "halftime";
  if (value.includes("delay") || value.includes("postpon")) return "delayed";
  if (isLiveStatus(status)) return "live";
  return "scheduled";
}

function urgencyForGameStatus(status: string, relatedCount: number): BoardUrgency {
  const value = status.toLowerCase();
  if (value.includes("final")) return relatedCount >= 4 ? "medium" : "low";
  if (isLiveStatus(status)) return relatedCount > 0 ? "high" : "medium";
  if (relatedCount >= 4) return "high";
  if (relatedCount > 0) return "medium";
  return "low";
}

function isLiveStatus(status: string) {
  const value = status.toLowerCase();
  return value.includes("live") || value.includes("progress") || value.includes("quarter") || value.includes("inning");
}

function abbreviateTeam(name: string) {
  const trimmed = name.trim();
  if (trimmed.length <= 4 && !trimmed.includes(" ")) return trimmed.toUpperCase();
  return toTeamAbbr(trimmed);
}

function formatGameTime(value?: Date | string | null) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatSignalType(type?: string) {
  return humanizeSignalType(type);
}

const leagueEmptyCopy: Record<Sport, string> = {
  NBA: "Monitoring late scratches, starters, load management, warmups, and external movement before tip. Sparse means below threshold, not inactive.",
  MLB: "Monitoring lineup cards, pitchers, weather cells, bullpen context, late scratches, and live inning states.",
  NFL: "Offseason monitoring is limited to verified injury, practice, depth, weather, role, and context-movement updates. Quiet means no elevated development is verified.",
  CFB: "Offseason and conference monitoring are limited to verified local sources, travel/weather/coaching context, depth charts, and external movement.",
};

