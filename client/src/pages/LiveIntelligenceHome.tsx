import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import AppShell from "@/components/V2Shell";
import { EscalationBadge } from "@/components/intelligence/SituationCard";
import { StoryCard, type StoryCardData } from "@/components/StoryCard";
import {
  adaptSignalsToSituations,
  fetchLiveGamesForSituations,
  type EscalationState,
  type IntelligenceSituation,
  type LiveGameSituation,
} from "@/lib/intelligenceSituationsApi";
import { resolveSportsImageAsset } from "@/lib/sportsImageAssets";
import { fetchSignals } from "@/lib/signalsApi";
import { containsPublicInvalidToken, hasCleanPublicTeamIdentity, hasCleanPublicText, publicFallbackLabel } from "@/lib/publicDisplayHygiene";
import { compareLeadRank } from "@/lib/boardSituations";
import { LEAD_MAX_AGE_HOURS, ageHoursFrom } from "@/lib/leadRanker";
import { AlertTriangle, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { Link, useLocation } from "wouter";

const REFRESH_MS = 60_000;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 60_000;
const LEAGUES = ["NBA", "MLB", "NFL", "CFB"] as const;
const HERO_FALLBACK_TILES = [
  { league: "MLB", title: "Awaiting lineup confirmations", note: "Lineup impact still developing" },
  { league: "NBA", title: "Availability board quiet", note: "Warmup reports pending" },
  { league: "NFL", title: "Depth charts quiet", note: "Injury impact still developing" },
  { league: "CFB", title: "Roster board quiet", note: "Transfer impact still developing" },
] as const;


type LivePressureContext = {
  heroLeague: string;
  heroHeadline: string;
  heroBody: string;
  timing: string;
  market: string;
  source: string;
  changed: string;
  whoReacts: string;
  next: string;
  sourceArcTitle: string;
  sourceArcBody: string;
  escalationWatch: string;
  escalationStage: string;
  pressureWindows: string[];
  convergenceSteps: Array<{ label: string; state: "complete" | "active" | "waiting" }>;
};

const leagueWorld = {
  MLB: {
    label: "MLB",
    status: "Hottest watch",
    movement: "Lineups / pitchers / reports",
    color: "#18D47B",
    href: "/mlb",
    logo: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png",
  },
  NBA: {
    label: "NBA",
    status: "Watch active",
    movement: "Availability / rotation / reports",
    color: "#F5B841",
    href: "/nba",
    logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png",
  },
  NFL: {
    label: "NFL",
    status: "Watch active",
    movement: "Depth / injury / reports",
    color: "#6FA4BF",
    href: "/nfl",
    logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png",
  },
  CFB: {
    label: "CFB",
    status: "Watch active",
    movement: "Transfer / QB / reports",
    color: "#B06EFF",
    href: "/cfb",
    logo: "https://a.espncdn.com/i/teamlogos/leagues/500/ncaa.png",
  },
} as const;

export default function LiveIntelligenceHome() {
  const [situations, setSituations] = useState<IntelligenceSituation[]>([]);
  const [games, setGames] = useState<LiveGameSituation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // League pill tabs navigate between / and the league board routes; the
  // active tab is derived from the current route, not local state.
  const [location] = useLocation();
  const activeLeague = useMemo<"ALL" | typeof LEAGUES[number]>(() => {
    const segment = (location.split("/")[1] ?? "").toUpperCase();
    return (LEAGUES as readonly string[]).includes(segment) ? (segment as typeof LEAGUES[number]) : "ALL";
  }, [location]);
  const previousConfidenceRef = useRef<Record<string, number>>({});
  const retryCountRef = useRef(0);

  const load = useCallback(async (): Promise<boolean> => {
    try {
      const liveSignals = await fetchSignals();
      const nextSituations = adaptSignalsToSituations(liveSignals, previousConfidenceRef.current);
      previousConfidenceRef.current = Object.fromEntries(nextSituations.map((situation) => [situation.id, situation.confidence.current]));
      setSituations(nextSituations);
      setError(null);

      const gameResponses = await Promise.allSettled(
        LEAGUES.map(async (league) => ({
          league,
          games: await fetchLiveGamesForSituations(league, nextSituations.filter((situation) => situation.league === league)),
        })),
      );
      setGames(gameResponses.flatMap((result) => {
        if (result.status !== "fulfilled") return [];
        return result.value.games.filter((game) => game.league === result.value.league);
      }));
      return true;
    } catch {
      setError("Live feed unavailable. Showing the last loaded state.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let timer: number | undefined;

    async function tick() {
      const ok = await load();
      if (ok) retryCountRef.current = 0;
      else retryCountRef.current += 1;
      const delay = retryCountRef.current > 0
        ? Math.min(BACKOFF_BASE_MS * Math.pow(2, retryCountRef.current - 1), BACKOFF_MAX_MS)
        : REFRESH_MS;
      timer = window.setTimeout(tick, delay);
    }

    tick();
    return () => { if (timer !== undefined) window.clearTimeout(timer); };
  }, [load]);

  const publicSituations = useMemo(() => situations.filter(isCleanHomepageSituation), [situations]);

  const visibleSituations = useMemo(() => {
    return publicSituations
      .filter((situation) => activeLeague === "ALL" || situation.league === activeLeague)
      .sort((a, b) => b.priority - a.priority);
  }, [publicSituations, activeLeague]);

  const featured = selectHomepageLead(visibleSituations, games) ?? selectHomepageLead(publicSituations, games);
  const heroSituation = featured;
  const backdropLeague: typeof LEAGUES[number] = activeLeague === "ALL"
    ? (featured && (LEAGUES as readonly string[]).includes(featured.league) ? featured.league as typeof LEAGUES[number] : "NFL")
    : activeLeague;
  // North Star: sport-specific shell background fades (200ms) between leagues
  // instead of snapping when the class changes.
  const [backdropFading, setBackdropFading] = useState(false);
  const previousBackdropRef = useRef(backdropLeague);
  useEffect(() => {
    if (previousBackdropRef.current === backdropLeague) return;
    previousBackdropRef.current = backdropLeague;
    setBackdropFading(true);
    const timer = window.setTimeout(() => setBackdropFading(false), 200);
    return () => window.clearTimeout(timer);
  }, [backdropLeague]);
  const editorialSituation = selectEditorialDevelopment(visibleSituations, heroSituation) ?? selectEditorialDevelopment(publicSituations, heroSituation);
  const leadGames = useMemo(() => {
    const leagueRank = (game: LiveGameSituation) => game.league === "MLB" ? 0 : game.league === "NBA" ? 1 : 2;
    return [...games].sort((a, b) => leagueRank(a) - leagueRank(b) || b.activeSituations - a.activeSituations);
  }, [games]);
  const livePressure = useMemo(() => buildLivePressureContext(games, publicSituations, loading), [games, publicSituations, loading]);
  const tickerItems = useMemo(() => buildTickerItems({ situations: publicSituations, games }), [games, publicSituations]);
  const homepageStories = useMemo(
    () => buildHomepageStoryModel({
      activeLeague,
      featured,
      editorialSituation,
      games: leadGames,
      loading,
      pressure: livePressure,
      situations: visibleSituations,
    }),
    [activeLeague, editorialSituation, featured, leadGames, livePressure, loading, visibleSituations],
  );
  const hasAssignmentRail = homepageStories.rail.length > 0;

  return (
    <AppShell brandContext="LIVE SPORTS DESK">
      <div className={`live-intel-home league-board-shell es-league-${backdropLeague.toLowerCase()}${backdropFading ? " is-backdrop-fading" : ""}`}>
        <div className="live-intel-atmosphere es-atmosphere es-atmosphere-mlb" aria-hidden="true">
          <div className="live-intel-atmosphere-stadium" />
          <div className="live-intel-atmosphere-crowd" />
          <div className="live-intel-atmosphere-field" />
          <div className="live-intel-atmosphere-diamond" />
          <div className="live-intel-atmosphere-routes" />
          <div className="live-intel-atmosphere-athlete" />
          <div className="live-intel-atmosphere-sideline" />
          <div className="live-intel-atmosphere-scoreline" />
          <div className="live-intel-atmosphere-lights" />
        </div>
        <SportBackdrop league={backdropLeague} />
        <LiveTicker items={tickerItems} />
        <section className="media-homepage" aria-label="EdgeSetter sports media network">
          <header className="media-homepage-header">
            <div style={{ display: "flex", alignItems: "center", padding: "8px 0" }}>
              <img
                src="/brand/edgesetter-logo.png"
                alt="EdgeSetter Intelligence Verified"
                style={{ height: "72px", width: "auto", objectFit: "contain" }}
              />
            </div>
            <div className="media-homepage-leagues" aria-label="League story filters">
              {LEAGUES.map((league) => {
                const meta = leagueWorld[league];
                const count = situations.filter((situation) => situation.league === league).length;
                return (
                  <Link
                    key={league}
                    href={activeLeague === league ? "/" : meta.href}
                    className={`media-league-tab${activeLeague === league ? " is-active" : ""}`}
                    aria-current={activeLeague === league ? "page" : undefined}
                    style={{ "--league-color": meta.color } as CSSProperties}
                  >
                    <img
                      className="media-league-tab-logo"
                      src={meta.logo}
                      alt=""
                      width={20}
                      height={20}
                      loading="lazy"
                      onError={(event) => { event.currentTarget.style.display = "none"; }}
                    />
                    <span>{league}</span>
                    <strong>{leagueWatchLabel(count)}</strong>
                  </Link>
                );
              })}
              <button type="button" onClick={load} className="live-intel-hero-refresh" aria-label="Refresh live stories">
                <RefreshCw size={13} />
              </button>
            </div>
          </header>

          <div className={`media-homepage-grid has-intel-sidebar${hasAssignmentRail ? " has-assignment-rail" : ""}`}>
            <div className="media-homepage-main">
              <div className="media-section-label">
                <span className="es-live-dot es-live-pulse" />
                {featured ? "Lead story" : "Coverage status"}
              </div>
              {featured
                ? <StoryCard story={homepageStories.lead} variant="lead" copyVariant="public" />
                : <HomepageQuietLead loading={loading} situations={publicSituations} />
              }
              <HomepageSupportStack stories={homepageStories} pressure={livePressure} loading={loading} />
              {hasAssignmentRail && (
                <>
                  <div className="media-section-label">Developing now</div>
                  <div className="media-developing-grid" aria-label="Developing stories">
                    {homepageStories.rail.map((story) => (
                      <StoryCard key={story.id} story={story} variant="rail" copyVariant="public" />
                    ))}
                  </div>
                </>
              )}
            </div>

            <HomepageSidebar games={leadGames} loading={loading} signalFeed={dedupeSignalFeed(visibleSituations.filter((s) => s.id !== featured?.id)).slice(0, 6)} />
          </div>

          <div className="media-dive-deeper" aria-label="Dive deeper into league boards">
            <div className="section-kicker">Dive Deeper</div>
            <div className="media-dive-deeper-links">
              <Link href="/nba" className="btn-secondary">Full NBA Board →</Link>
              <Link href="/nfl" className="btn-secondary"><Zap size={13} /> Full NFL Board →</Link>
              <Link href="/mlb" className="btn-secondary">Full MLB Board →</Link>
              <Link href="/cfb" className="btn-secondary">Full CFB Board →</Link>
            </div>
          </div>
        </section>

        {error && (
          <div className="live-intel-warning">
            <AlertTriangle size={15} />
            {error}
          </div>
        )}
      </div>
      <style>{liveIntelCss}</style>
    </AppShell>
  );
}

type HomepageLeagueSection = {
  league: typeof LEAGUES[number];
  summary: string;
  stories: StoryCardData[];
};

export function buildHomepageStoryModel({
  activeLeague,
  editorialSituation,
  featured,
  games,
  loading,
  pressure,
  situations,
}: {
  activeLeague: "ALL" | typeof LEAGUES[number];
  editorialSituation: IntelligenceSituation | null | undefined;
  featured: IntelligenceSituation | null | undefined;
  games: LiveGameSituation[];
  loading: boolean;
  pressure: LivePressureContext;
  situations: IntelligenceSituation[];
}) {
  const cleanSituations = situations.filter(isCleanHomepageSituation);
  const cleanFeatured = featured && isCleanHomepageSituation(featured) ? featured : null;
  const cleanEditorial = editorialSituation && isCleanHomepageSituation(editorialSituation) ? editorialSituation : null;
  const lead = cleanFeatured
    ? situationToStoryCard(cleanFeatured, { slot: "lead" })
    : quietNetworkStory(activeLeague, loading, cleanSituations);

  const usedSituationIds = new Set<string>();
  if (cleanFeatured) usedSituationIds.add(cleanFeatured.id);

  const railSource = uniqueSituations([
  cleanEditorial && ageHoursFrom(cleanEditorial.timing.firstSeen) <= LEAD_MAX_AGE_HOURS ? cleanEditorial : null,
  ...cleanSituations.filter((situation) =>
    situation.id !== cleanFeatured?.id &&
    ageHoursFrom(situation.timing.firstSeen) <= LEAD_MAX_AGE_HOURS &&
    !(situation.raw.signal_type === "line_move" && !situation.subject.player && !situation.raw.injury_designation)
  ),
]);
  const rail = railSource.slice(0, 3).map((situation) => situationToStoryCard(situation, { slot: "rail" }));
  railSource.slice(0, 3).forEach((situation) => usedSituationIds.add(situation.id));

  const gameStories = games.slice(0, 3).map((game) => {
    const matchedSituation = cleanSituations.find((situation) => gameMatchesSituation(game, situation));
    if (matchedSituation) usedSituationIds.add(matchedSituation.id);
    return gameToStoryCard(game, matchedSituation);
  });

  const leagues = LEAGUES.map((league) => {
    const leagueSituations = cleanSituations.filter((situation) => situation.league === league && !usedSituationIds.has(situation.id));
    const stories = leagueSituations.slice(0, 3).map((situation) => situationToStoryCard(situation, { slot: "league" }));
    return {
      league,
      summary: leagueSituations.length ? `${leagueSituations.length} evidence-backed update${leagueSituations.length === 1 ? "" : "s"}` : "No major verified shift",
      stories,
    } satisfies HomepageLeagueSection;
  }).filter((section) => section.stories.length > 0);

  return { lead, rail, games: gameStories, leagues };
}

function isCleanHomepageSituation(situation: IntelligenceSituation) {
  const matchupTeams = splitMatchup(situation.subject.matchup);
  const primaryTeam = matchupTeams.length === 2 ? matchupTeams[0] : situation.subject.team ?? matchupTeams[0] ?? undefined;
  const secondaryTeam = matchupTeams.length === 2 ? matchupTeams[1] : undefined;
  return hasCleanPublicTeamIdentity(situation.subject.team, primaryTeam, secondaryTeam)
    && hasCleanPublicText(
      situation.headline,
      situation.currentRead,
      situation.whyItMatters,
      situation.actionWindow,
      situation.subject.matchup,
      situation.subject.player,
      situation.raw.headline,
      situation.raw.body,
      situation.raw.action_note,
      situation.raw.why_it_matters,
    );
}

function uniqueSituations(items: Array<IntelligenceSituation | null | undefined>) {
  const seen = new Set<string>();
  const out: IntelligenceSituation[] = [];
  for (const item of items) {
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

// North Star timing advantage for homepage stories: detection (timing.firstSeen)
// vs the timeline entry where the story reached Official. Verified stories only.
function detectionLeadForIntelligence(situation: IntelligenceSituation): { lead: string; kind: "confirmation" } | null {
  if (situation.escalationState !== "Official" && situation.confidence.current < 100) return null;
  const firstSeenMs = new Date(situation.timing.firstSeen).getTime();
  if (!Number.isFinite(firstSeenMs)) return null;
  const confirmEntry = situation.timeline.find((event) => event.state === "Official");
  if (!confirmEntry) return null;
  const confirmMs = new Date(confirmEntry.at).getTime();
  if (!Number.isFinite(confirmMs)) return null;
  const gapMinutes = Math.round((confirmMs - firstSeenMs) / 60_000);
  if (gapMinutes < 15) return null;
  if (gapMinutes < 60) return { lead: `${gapMinutes}m`, kind: "confirmation" };
  const h = Math.floor(gapMinutes / 60);
  const m = gapMinutes % 60;
  return { lead: m > 0 ? `${h}h ${m}m` : `${h}h`, kind: "confirmation" };
}

function situationToStoryCard(situation: IntelligenceSituation, { slot }: { slot: "lead" | "rail" | "league" }): StoryCardData {
  const matchupTeams = splitMatchup(situation.subject.matchup);
  const rawPrimaryTeam = matchupTeams.length === 2 ? matchupTeams[0] : situation.subject.team ?? matchupTeams[0] ?? undefined;
  const rawSecondaryTeam = matchupTeams.length === 2 ? matchupTeams[1] : undefined;
  const primaryTeam = hasCleanPublicTeamIdentity(rawPrimaryTeam) ? rawPrimaryTeam : undefined;
  const secondaryTeam = hasCleanPublicTeamIdentity(rawSecondaryTeam) ? rawSecondaryTeam : undefined;
  const storyType = publicSituationType(situation);
  const storyCopy = buildPublicSituationStory(situation);
  const fallbackHeadline = publicFallbackLabel(`${storyCopy.headline} ${situation.raw.signal_type}`, situation.league);
  const headline = hasCleanPublicText(storyCopy.headline) ? storyCopy.headline : fallbackHeadline;
  const shortHeadline = hasCleanPublicText(storyCopy.shortHeadline) ? storyCopy.shortHeadline : fallbackHeadline;
  const deck = hasCleanPublicText(storyCopy.deck) ? storyCopy.deck : "EdgeSetter is monitoring source support, timing, and sports context before elevating this item.";
  const shortDeck = hasCleanPublicText(storyCopy.shortDeck) ? storyCopy.shortDeck : "Source support and timing remain under watch.";
  const player = hasCleanPublicText(situation.subject.player) && isValidPlayerName(situation.subject.player) ? situation.subject.player ?? undefined : undefined;
  const detectionLead = detectionLeadForIntelligence(situation);
  return {
    id: situation.id,
    league: situation.league,
    timingAdvantageLead: detectionLead?.lead ?? null,
    timingAdvantageKind: detectionLead?.kind ?? null,
    headline: slot === "lead" ? headline : shortHeadline,
    dek: slot === "rail" ? shortDeck : deck,
    label: slot === "lead" ? "Top story" : storyType,
    href: `/${situation.league.toLowerCase()}`,
    primaryTeam,
    secondaryTeam,
    player,
    storyType,
    detail: hasCleanPublicText(storyCopy.detail) ? storyCopy.detail : fallbackHeadline,
    whatChanged: hasCleanPublicText(storyCopy.whatHappened) ? storyCopy.whatHappened : "A watch item changed enough to stay on the board.",
    whyItMatters: hasCleanPublicText(storyCopy.whyItMatters) ? storyCopy.whyItMatters : "The sports impact is still developing.",
    watchNext: hasCleanPublicText(storyCopy.watchNext) ? storyCopy.watchNext : "Watch for source support, official confirmation, and context movement.",
    fantasyRelevance: situation.raw.fantasy_relevance ?? null,
    bettingRelevance: situation.raw.betting_relevance ?? null,
    overlay: {
      escalationState: situation.escalationState,
      confidence: situation.confidence,
      sourceSummary: {
        ...situation.sourceSummary,
        convergence: publicSourceSummary(situation.sourceSummary.convergence),
      },
      timing: situation.timing,
      replay: ["Sources checked", "Timing tracked", "Still developing"],
      status: "Story support",
    },
    situation,
    imageAsset: resolveSportsImageAsset({
      league: situation.league,
      team: primaryTeam,
      opponent: secondaryTeam,
      player: situation.subject.player,
      storyType,
      slot: slot === "lead" ? "hero" : slot === "rail" ? "matchup" : "featured",
      preferLeagueAsset: true,
    }),
  };
}

function gameToStoryCard(game: LiveGameSituation, situation?: IntelligenceSituation): StoryCardData {
  const score = game.awayScore !== null || game.homeScore !== null ? `${game.awayScore ?? "-"}-${game.homeScore ?? "-"}` : gameTimeLabel(game);
  const sameLeagueSituation = situation?.league === game.league ? situation : undefined;
  const storyCopy = sameLeagueSituation ? buildPublicSituationStory(sameLeagueSituation) : null;
  const away = cleanShortTeam(game.awayTeam);
  const home = cleanShortTeam(game.homeTeam);
  const hasUnmatchedUpdates = game.activeSituations > 0 && !sameLeagueSituation;
  const shortHeadline = hasCleanPublicText(storyCopy?.shortHeadline) ? storyCopy?.shortHeadline : "Developing watch item";
  const headline = sameLeagueSituation
    ? `${away} @ ${home}: ${shortHeadline}`
    : `${away} @ ${home} sits in ${game.status.toLowerCase()} watch`;
  return {
    id: `game-${game.league}-${game.id}`,
    league: game.league,
    headline,
    dek: sameLeagueSituation && hasCleanPublicText(storyCopy?.shortDeck) ? storyCopy?.shortDeck : `${game.status} / ${score}. EdgeSetter is monitoring lineup, injury, source, and game-state changes.`,
    label: hasUnmatchedUpdates ? "Developing watch item" : game.status === "In Progress" ? "Live game window" : "Matchup watch",
    href: `/${game.league.toLowerCase()}`,
    primaryTeam: hasCleanPublicTeamIdentity(game.awayTeam) ? game.awayTeam : undefined,
    secondaryTeam: hasCleanPublicTeamIdentity(game.homeTeam) ? game.homeTeam : undefined,
    storyType: hasUnmatchedUpdates ? "Developing watch item" : sameLeagueSituation ? publicSituationType(sameLeagueSituation) : game.status === "In Progress" ? "Live game" : "Matchup watch",
    detail: `${game.activeSituations} linked update${game.activeSituations === 1 ? "" : "s"}`,
    whatChanged: sameLeagueSituation && hasCleanPublicText(storyCopy?.whatHappened) ? storyCopy?.whatHappened : undefined,
    whyItMatters: sameLeagueSituation && hasCleanPublicText(storyCopy?.whyItMatters) ? storyCopy?.whyItMatters : "Game context can change when lineup, availability, or source confirmation lands.",
    watchNext: sameLeagueSituation && hasCleanPublicText(storyCopy?.watchNext) ? storyCopy?.watchNext : "Watch for official team news and source convergence.",
    overlay: sameLeagueSituation ? {
      escalationState: sameLeagueSituation.escalationState,
      confidence: sameLeagueSituation.confidence,
      sourceSummary: {
        ...sameLeagueSituation.sourceSummary,
        convergence: publicSourceSummary(sameLeagueSituation.sourceSummary.convergence),
      },
      timing: sameLeagueSituation.timing,
      replay: ["Sources checked", "Timing tracked", "Still developing"],
      status: "Story support",
    } : {
      escalationState: game.topEscalation,
      confidence: { current: null, delta: null, explanation: "No agent confidence score until a verified story attaches." },
      sourceSummary: { count: 0, convergence: "Awaiting confirmed source" },
      timing: { window: game.status, freshnessLabel: score },
      replay: ["Game window", "Source watch", "Still developing"],
      status: game.topEscalation ? "Story attached" : "Coverage watch",
    },
    situation: sameLeagueSituation,
    imageAsset: resolveSportsImageAsset({
      league: game.league,
      team: hasCleanPublicTeamIdentity(game.awayTeam) ? game.awayTeam : undefined,
      opponent: hasCleanPublicTeamIdentity(game.homeTeam) ? game.homeTeam : undefined,
      storyType: sameLeagueSituation ? publicSituationType(sameLeagueSituation) : game.status === "In Progress" ? "Live game" : "Matchup watch",
      slot: "matchup",
      preferLeagueAsset: true,
    }),
  };
}

// North Star quiet slate: report the active watch, never apologize for the
// absence of a story. Surfaces the most-developed situation's confidence and
// source trail so the journey is visible even before anything verifies.
function quietNetworkStory(activeLeague: "ALL" | typeof LEAGUES[number], loading: boolean, situations: IntelligenceSituation[]): StoryCardData {
  const league = activeLeague === "ALL" ? "NFL" : activeLeague;
  const leagueLabel = activeLeague === "ALL" ? "all leagues" : activeLeague;
  const count = situations.length;
  const headline = loading
    ? `${league} coverage check in progress`
    : count
      ? `Monitoring ${count} active situation${count === 1 ? "" : "s"}`
      : "Agents active across all leagues";
  const dek = loading
    ? "EdgeSetter agents are scanning team news, game state, and source agreement."
    : `EdgeSetter agents are watching ${leagueLabel}. Nothing has crossed the verification threshold yet — when it does, you'll see it here first.`;
  const watched = count
    ? [...situations].sort((a, b) => b.confidence.current - a.confidence.current)[0]
    : null;
  return {
    id: `quiet-${league}-${count}`,
    league,
    headline,
    dek,
    label: "Quiet board watch",
    href: `/${league.toLowerCase()}`,
    primaryTeam: league,
    storyType: "Coverage watch",
    detail: count ? `${count} active situation${count === 1 ? "" : "s"} under watch` : "Agents on watch",
    whatChanged: count
      ? `EdgeSetter agents are tracking ${count} live situation${count === 1 ? "" : "s"} across ${leagueLabel}.`
      : "EdgeSetter agents are scanning team news, lineups, and source agreement across today's games.",
    whyItMatters: "The first verified break lands here before public confirmation — and a quiet watch confirms what has not changed.",
    watchNext: leagueQuietNote(league),
    overlay: watched ? {
      escalationState: watched.escalationState,
      confidence: watched.confidence,
      sourceSummary: {
        ...watched.sourceSummary,
        convergence: publicSourceSummary(watched.sourceSummary.convergence),
      },
      timing: watched.timing,
      replay: ["Coverage scan", "Sources checked", "Continue watch"],
      status: "Most developed watch",
    } : {
      escalationState: "Monitoring",
      confidence: { current: null, delta: null, explanation: "Confidence pending until a verified story attaches." },
      sourceSummary: { count: 0, convergence: "Awaiting confirmed source" },
      timing: { window: loading ? "Checking" : "Monitoring", freshnessLabel: "Live scan" },
      replay: ["Coverage scan", "Agents watching", "Continue watch"],
      status: "Quiet coverage",
    },
    imageAsset: resolveSportsImageAsset({
      league,
      team: league,
      storyType: "Coverage watch",
      slot: "quiet",
      preferLeagueAsset: true,
    }),
  };
}

function HomepageSupportStack({
  stories,
  pressure,
  loading,
}: {
  stories: ReturnType<typeof buildHomepageStoryModel>;
  pressure: LivePressureContext;
  loading: boolean;
}) {
  const gameWindow = stories.games[0]?.headline ?? (loading ? "Checking live game windows" : pressure.timing);
  const storyWatch = stories.rail[0]?.headline ?? stories.leagues[0]?.stories[0]?.headline ?? "No verified lead change behind the top story";
  const sourceTrail = stories.rail[0]?.overlay.sourceSummary?.convergence ?? pressure.source;
  const latestNote = stories.leagues[0]?.summary ?? "Quiet board context remains useful while source support develops.";
  const modules = [
    { label: "Game Windows", value: gameWindow },
    { label: "Stories to Watch", value: storyWatch },
    { label: "Source Trail", value: sourceTrail },
    { label: "Quiet Board Context", value: pressure.changed },
    { label: "Latest Verified Notes", value: latestNote },
  ];

  return (
    <div className="media-homepage-support" data-testid="homepage-lead-support-stack">
      {modules.map((module) => (
        <div key={module.label}>
          <span>{module.label}</span>
          <strong>{module.value}</strong>
        </div>
      ))}
    </div>
  );
}

function bloombergConfText(situation: IntelligenceSituation): string {
  const conf = situation.confidence?.current;
  const state = situation.escalationState;
  if (state === "Official" || (typeof conf === "number" && conf >= 100)) return "Verified";
  if (typeof conf !== "number") return "Developing";
  const r = Math.round(conf);
  if (r >= 85) return `${r}%`;
  if (r >= 70) return `${r}%`;
  return `${r}%`;
}

function bloombergConfTone(situation: IntelligenceSituation): string {
  const conf = situation.confidence?.current;
  const state = situation.escalationState;
  if (state === "Official" || (typeof conf === "number" && conf >= 100)) return "is-verified";
  if (typeof conf !== "number") return "is-forming";
  const r = Math.round(conf);
  if (r >= 85) return "is-strong";
  if (r >= 70) return "is-developing";
  return "is-forming";
}

function bloombergStatusBadge(situation: IntelligenceSituation): string {
  const state = situation.escalationState ?? "Monitoring";
  if (state === "Official") return "Verified";
  if (state === "Confirming" || state === "Significant" || state === "Escalating") return "Escalating";
  if (state === "Emerging") return "Developing";
  return "Watch";
}

function bloombergStatusTone(situation: IntelligenceSituation): string {
  const state = situation.escalationState ?? "Monitoring";
  if (state === "Official") return "is-verified";
  if (state === "Confirming" || state === "Significant" || state === "Escalating") return "is-escalating";
  if (state === "Emerging") return "is-developing";
  return "is-watch";
}

function bloombergTimeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(diff) || diff < 0) return "";
  if (diff < 60) return `${diff}m`;
  return `${Math.floor(diff / 60)}h`;
}

function BloombergSignalRow({ situation }: { situation: IntelligenceSituation }) {
  const sourceCount = situation.sources?.length ?? 0;
  const timeAgo = situation.timing?.firstSeen ? bloombergTimeAgo(situation.timing.firstSeen) : "";
  const topicRaw = situation.raw?.signal_type ?? situation.signalType ?? "";
  const topic = /^\d/.test(topicRaw)
    ? topicRaw.replace(/_/g, " ")
    : topicRaw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <div className="bloomberg-row">
      <span className="bloomberg-league">{situation.league}</span>
      <span className="bloomberg-topic">{topic}</span>
      <span className={`bloomberg-status ${bloombergStatusTone(situation)}`}>{bloombergStatusBadge(situation)}</span>
      <span className={`bloomberg-conf ${bloombergConfTone(situation)}`}>{bloombergConfText(situation)}</span>
      <span className="bloomberg-sources">{sourceCount > 0 ? `${sourceCount}src` : ""}</span>
      <span className="bloomberg-time">{timeAgo}</span>
    </div>
  );
}

function HomepageSidebar({ games, loading, signalFeed }: { games: LiveGameSituation[]; loading: boolean; signalFeed: IntelligenceSituation[] }) {
  const upcomingGames = games.filter((game) => !game.status.toLowerCase().includes("final")).slice(0, 4);

  return (
    <aside className="media-homepage-sidebar" aria-label="Live signal feed">
      {signalFeed.length > 0 && (
        <section className="sidebar-block sidebar-block-bloomberg" aria-label="Signal feed">
          <header className="bloomberg-header">
            <span className="es-live-dot es-live-pulse" aria-hidden="true" />
            Signal Feed
          </header>
          <div className="bloomberg-feed">
            {signalFeed.map((situation) => (
              <BloombergSignalRow key={situation.id} situation={situation} />
            ))}
          </div>
        </section>
      )}

      {upcomingGames.length > 0 && (
        <section className="sidebar-block" aria-label="Today's games">
          <header>Today's games</header>
          <div className="sidebar-games">
            {upcomingGames.map((game) => (
              <Link key={`sidebar-${game.league}-${game.id}`} href={`/${game.league.toLowerCase()}`}>
                <div className="sidebar-game-row">
                  <strong>{cleanShortTeam(game.awayTeam)} @ {cleanShortTeam(game.homeTeam)}</strong>
                  <span>{gameTimeLabel(game)} / {game.league}</span>
                  {game.activeSituations > 0 && <em>⚠ Watch</em>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!signalFeed.length && !upcomingGames.length && !loading && (
        <section className="sidebar-block" aria-label="Signal feed status">
          <header className="bloomberg-header">
            <span className="es-live-dot" aria-hidden="true" />
            Signal Feed
          </header>
          <p className="bloomberg-empty">ES Agents monitoring — no active signals</p>
        </section>
      )}
    </aside>
  );
}

function HomepageQuietLead({ loading, situations }: { loading: boolean; situations: IntelligenceSituation[] }) {
  const leagueCounts = Object.fromEntries(
    LEAGUES.map((league) => [league, situations.filter((s) => s.league === league).length]),
  ) as Record<typeof LEAGUES[number], number>;

  return (
    <div className="homepage-quiet-lead">
      <div className="homepage-quiet-lead-hd">
        <ShieldCheck size={15} aria-hidden="true" />
        <span>{loading ? "Checking coverage" : "ES Agents on watch — nothing verified yet"}</span>
      </div>
      <div className="homepage-quiet-lead-grid">
        {HERO_FALLBACK_TILES.map((tile) => {
          const meta = leagueWorld[tile.league];
          const count = leagueCounts[tile.league] ?? 0;
          return (
            <Link key={tile.league} href={meta.href} className="homepage-quiet-league-tile">
              <img src={meta.logo} alt="" aria-hidden="true" width={28} height={28} />
              <div>
                <strong>{tile.league}</strong>
                <span>{count > 0 ? `${count} situation${count === 1 ? "" : "s"} tracked` : tile.title}</span>
                <small>{tile.note}</small>
              </div>
            </Link>
          );
        })}
      </div>
      <p className="homepage-quiet-lead-note">
        {loading
          ? "Scanning team news, lineups, injury reports, and source agreement."
          : "The first verified break lands here before wire pickup — a quiet board confirms what has not changed."}
      </p>
    </div>
  );
}

function QuietCoverageCard({ pressure, loading }: { pressure: LivePressureContext; loading: boolean }) {
  return (
    <div className="media-quiet-card">
      <ShieldCheck size={20} />
      <strong>{loading ? "Checking live coverage" : pressure.heroHeadline}</strong>
      <span>{loading ? "Stories appear here when evidence clears the visibility threshold." : pressure.heroBody}</span>
    </div>
  );
}

function CoverageStatusCard({
  tile,
  loading,
}: {
  tile: typeof HERO_FALLBACK_TILES[number];
  loading: boolean;
}) {
  const meta = leagueWorld[tile.league];
  return (
    <Link href={meta.href}>
      <article className="media-coverage-status" style={{ "--league-color": meta.color } as CSSProperties}>
        <img src={meta.logo || "/brand/edgesetter-emblem.png"} alt="" aria-hidden="true" />
        <div>
          <span>{tile.league}</span>
          <strong>{loading ? `${tile.league} scan in progress` : tile.title}</strong>
          <small>{tile.note}</small>
        </div>
      </article>
    </Link>
  );
}

function splitMatchup(matchup?: string | null) {
  if (!matchup || containsPublicInvalidToken(matchup)) return [];
  return matchup.split(/\s+(?:@|vs\.?|at)\s+/i).map((part) => part.trim()).filter((part) => hasCleanPublicTeamIdentity(part)).slice(0, 2);
}

function replayLabelsForSituation(situation: IntelligenceSituation) {
  const labels = situation.timeline.map((event) => event.label);
  if (labels.length >= 2) return labels.slice(-3);
  return ["Detected", sourcePostureShortLabel(situation), situation.escalationState];
}

function gameTimeLabel(game: LiveGameSituation) {
  const time = game.gameTime ? new Date(game.gameTime) : null;
  if (time && !Number.isNaN(time.getTime())) return time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return game.status;
}

function leagueQuietNote(league: typeof LEAGUES[number]) {
  const copy: Record<typeof LEAGUES[number], string> = {
    MLB: "Lineup cards, probable pitchers, weather, bullpen load, and late scratches remain under coverage.",
    NBA: "Warmups, injury designations, starter confirmations, and rotation notes remain under coverage.",
    NFL: "Practice, depth chart, role, injury, and matchup context remain under limited watch.",
    CFB: "Roster movement, QB rooms, travel, weather, and conference context remain under limited watch.",
  };
  return copy[league];
}

function LiveOperationsBand({
  games,
  situations,
  loading,
  pressure,
}: {
  games: LiveGameSituation[];
  situations: IntelligenceSituation[];
  loading: boolean;
  pressure: LivePressureContext;
}) {
  const liveGames = games.filter((game) => game.status === "In Progress");
  const finalGames = games.filter((game) => game.status.toLowerCase().includes("final"));
  const scheduledGames = games.filter((game) => !liveGames.includes(game) && !finalGames.includes(game));
  const pressureGames = games
    .filter((game) => (game.activeSituations > 0 || game.topEscalation) && !game.status.toLowerCase().includes("final"))
    .sort((a, b) => gameImportanceScore(b) - gameImportanceScore(a))
    .slice(0, 4);
  const topSituations = situations.slice(0, 4);

  return (
    <section className="live-intel-ops-desk" aria-label="Live sports operations desk">
      <div className="live-intel-section-header">
        <div>
          <Zap size={15} />
          <span>Live Sports Ecosystem</span>
        </div>
        <small>{pressure.timing} / {pressure.market}</small>
      </div>

      <div className="live-intel-ops-grid">
        <WatchWindowLane
          title="Live windows"
          summary={liveGames.length ? "Game states updating now" : "No game has crossed live threshold"}
          games={liveGames}
          fallback={["MLB lineup confirmations", "NBA availability checks", "late scratches"]}
          loading={loading}
        />
        <WatchWindowLane
          title="Confirmation windows"
          summary={scheduledGames.length ? "Pregame clocks and team confirmations" : "Waiting for the next scheduled window"}
          games={scheduledGames.slice(0, 5)}
          fallback={["lineup cards pending", "probable pitchers pending", "warmup checks pending"]}
          loading={loading}
        />
        <div className="live-intel-pressure-stack">
          <div>
            <span>Key games</span>
            <strong>{pressureGames.length ? `${pressureGames.length} active` : "No urgent game yet"}</strong>
          </div>
          {(pressureGames.length ? pressureGames : quietGameFallback(games)).map((game) => (
            <GameWindowRow key={`pressure-${game.league}-${game.id}`} game={game} compact />
          ))}
          {!games.length && (
            <div className="live-intel-ops-fallback">
              <strong>{loading ? "Loading live board" : "No major lineup or injury shift yet"}</strong>
              <span>Games appear here when lineups, injuries, weather, or late movement matter.</span>
            </div>
          )}
        </div>
      </div>

      <div className="live-intel-situation-strip" aria-label="Escalating situations">
        {topSituations.length ? topSituations.map((situation) => (
          <Link key={situation.id} href={`/${situation.league.toLowerCase()}`}>
            <article>
              <span>{situation.league} / {situation.timing.window}</span>
              <strong>{situation.headline}</strong>
              <small>{storyChangeLabel(situation)} / {sourcePostureShortLabel(situation)}</small>
            </article>
          </Link>
        )) : HERO_FALLBACK_TILES.map((tile) => (
          <Link key={tile.league} href={`/${tile.league.toLowerCase()}`}>
            <article>
              <span>{tile.league} / quiet board</span>
              <strong>{tile.title}</strong>
              <small>{tile.note}</small>
            </article>
          </Link>
        ))}
      </div>
    </section>
  );
}

function WatchWindowLane({
  title,
  summary,
  games,
  fallback,
  loading,
}: {
  title: string;
  summary: string;
  games: LiveGameSituation[];
  fallback: string[];
  loading: boolean;
}) {
  return (
    <div className="live-intel-window-lane">
      <header>
        <span>{title}</span>
        <strong>{summary}</strong>
      </header>
      <div>
        {games.length ? [...games].sort((a, b) => gameImportanceScore(b) - gameImportanceScore(a)).slice(0, 5).map((game) => (
          <GameWindowRow key={`${title}-${game.league}-${game.id}`} game={game} />
        )) : fallback.map((item) => (
          <div key={item} className="live-intel-window-placeholder">
            <span>{loading ? "Checking" : "Watching"}</span>
            <strong>{item}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function gameImportanceScore(game: LiveGameSituation) {
  const status = game.status.toLowerCase();
  const live = status.includes("progress") ? 20 : 0;
  const finalPenalty = status.includes("final") ? -30 : 0;
  return live + game.activeSituations * 8 + (game.topEscalation ? 8 : 0) + finalPenalty;
}

function quietGameFallback(games: LiveGameSituation[]) {
  return [...games].sort((a, b) => gameImportanceScore(b) - gameImportanceScore(a)).slice(0, 3);
}

function GameWindowRow({ game, compact = false }: { game: LiveGameSituation; compact?: boolean }) {
  const time = game.gameTime ? new Date(game.gameTime) : null;
  const label = time && !Number.isNaN(time.getTime())
    ? time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : game.status;
  const score = game.awayScore !== null || game.homeScore !== null ? `${game.awayScore ?? "-"}-${game.homeScore ?? "-"}` : label;

  return (
    <Link href={`/${game.league.toLowerCase()}`}>
      <div className={compact ? "live-intel-window-row is-compact" : "live-intel-window-row"}>
        <span>{game.league}</span>
        <strong>{shortTeam(game.awayTeam)} @ {shortTeam(game.homeTeam)}</strong>
        <small>{game.status} / {score} / {game.activeSituations} update{game.activeSituations === 1 ? "" : "s"}</small>
      </div>
    </Link>
  );
}

// Sport-specific atmosphere pattern: faint court/diamond/field/chalkboard lines
// behind all content (z-index 0). Keyed by league so switching tabs re-mounts
// the SVG and replays the 200ms opacity fade.
function SportBackdrop({ league }: { league: typeof LEAGUES[number] }) {
  return (
    <div className="live-intel-sport-backdrop" aria-hidden="true">
      <svg
        key={league}
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
        focusable="false"
      >
        {league === "NBA" && <NbaCourtPattern />}
        {league === "MLB" && <MlbDiamondPattern />}
        {league === "NFL" && <NflFieldPattern />}
        {league === "CFB" && <CfbChalkboardPattern />}
      </svg>
    </div>
  );
}

function NbaCourtPattern() {
  const stroke = "rgba(200,140,60,0.05)";
  return (
    <g fill="none" stroke={stroke} strokeWidth="2.5">
      {/* half-court line + center circles */}
      <line x1="600" y1="0" x2="600" y2="800" />
      <circle cx="600" cy="400" r="70" />
      <circle cx="600" cy="400" r="24" />
      {/* left key/paint + free-throw circle */}
      <rect x="0" y="310" width="190" height="180" />
      <circle cx="190" cy="400" r="58" />
      {/* right key/paint + free-throw circle */}
      <rect x="1010" y="310" width="190" height="180" />
      <circle cx="1010" cy="400" r="58" />
      {/* three-point arcs */}
      <path d="M 0 120 Q 330 400 0 680" />
      <path d="M 1200 120 Q 870 400 1200 680" />
      {/* baselines */}
      <line x1="0" y1="40" x2="0" y2="760" />
      <line x1="1200" y1="40" x2="1200" y2="760" />
    </g>
  );
}

function MlbDiamondPattern() {
  const stroke = "rgba(100,140,200,0.06)";
  return (
    <g fill="none" stroke={stroke} strokeWidth="2.5">
      {/* infield diamond: home (600,690) → 1B → 2B → 3B */}
      <path d="M 600 690 L 790 500 L 600 310 L 410 500 Z" />
      {/* base paths extended as foul lines from home plate */}
      <line x1="600" y1="690" x2="1080" y2="210" />
      <line x1="600" y1="690" x2="120" y2="210" />
      {/* pitching mound */}
      <circle cx="600" cy="500" r="34" />
      {/* base markers */}
      <rect x="781" y="491" width="18" height="18" transform="rotate(45 790 500)" />
      <rect x="591" y="301" width="18" height="18" transform="rotate(45 600 310)" />
      <rect x="401" y="491" width="18" height="18" transform="rotate(45 410 500)" />
      {/* outfield arcs radiating from home plate */}
      <path d="M 180 270 A 540 540 0 0 1 1020 270" />
      <path d="M 300 390 A 420 420 0 0 1 900 390" />
      {/* home plate circle */}
      <circle cx="600" cy="690" r="42" />
    </g>
  );
}

function NflFieldPattern() {
  const stroke = "rgba(160,160,220,0.05)";
  const yardLines = Array.from({ length: 14 }, (_, i) => 80 + i * 80);
  const hashMarks = Array.from({ length: 56 }, (_, i) => 30 + i * 21);
  return (
    <g fill="none" stroke={stroke} strokeWidth="2.5">
      {/* vertical yard lines every ~80px */}
      {yardLines.map((x) => <line key={`yard-${x}`} x1={x} y1="0" x2={x} y2="800" />)}
      {/* 3 horizontal field lines */}
      <line x1="0" y1="180" x2="1200" y2="180" />
      <line x1="0" y1="400" x2="1200" y2="400" />
      <line x1="0" y1="620" x2="1200" y2="620" />
      {/* hash marks along the middle line */}
      {hashMarks.map((x) => <line key={`hash-${x}`} x1={x} y1="392" x2={x} y2="408" />)}
      {/* goalposts at both edges */}
      <path d="M 14 480 L 14 360 M 14 400 L 14 388 M 6 360 L 6 300 M 22 360 L 22 300 M 6 360 L 22 360" />
      <path d="M 1186 480 L 1186 360 M 1178 360 L 1178 300 M 1194 360 L 1194 300 M 1178 360 L 1194 360" />
    </g>
  );
}

function CfbChalkboardPattern() {
  const stroke = "rgba(29,158,117,0.05)";
  return (
    <g fill="none" stroke={stroke} strokeWidth="2.5">
      {/* yard lines as the chalkboard base */}
      {Array.from({ length: 11 }, (_, i) => 60 + i * 108).map((x) => (
        <line key={`cfb-yard-${x}`} x1={x} y1="0" x2={x} y2="800" />
      ))}
      {/* three receiver routes: curved dashed paths with arrowheads */}
      <g strokeDasharray="10 8">
        <path d="M 320 640 C 360 480 420 420 560 380" />
        <path d="M 600 660 C 620 520 700 470 820 460" />
        <path d="M 880 640 C 900 500 860 380 740 330" />
      </g>
      <path d="M 560 380 L 540 366 M 560 380 L 548 398" />
      <path d="M 820 460 L 800 448 M 820 460 L 802 474" />
      <path d="M 740 330 L 760 332 M 740 330 L 754 346" />
      {/* blockers as X marks */}
      <path d="M 420 600 L 444 624 M 444 600 L 420 624" />
      <path d="M 500 620 L 524 644 M 524 620 L 500 644" />
      <path d="M 700 610 L 724 634 M 724 610 L 700 634" />
      {/* ball carrier arrow: solid path */}
      <path d="M 460 700 C 520 660 600 640 680 560" />
      <path d="M 680 560 L 654 562 M 680 560 L 670 584" />
    </g>
  );
}

function LiveTicker({ items }: { items: string[] }) {
  const visibleItems = items.length ? items : ["ES Agents monitoring — no verified breaks yet"];
  const doubled = [...visibleItems, ...visibleItems];
  return (
    <div className="live-intel-ticker" aria-label="Live intelligence ticker">
      <div className="live-intel-ticker-brand">
        <span className="es-live-dot es-live-pulse" />
        EdgeSetter Live
      </div>
      <div className="live-intel-ticker-window">
        <div className="live-intel-ticker-track">
          {doubled.map((item, index) => (
            <span key={`${item}-${index}`}>{item}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// North Star lead selection: a fresh story outranks a stale one. LEAD_MAX_AGE_HOURS
// and ageHoursFrom are imported from leadRanker (the canonical ranking authority).
// The canonical selectHomepageLead in leadRanker works with CanonicalSituationRecord[].
// This intelligence-pipeline version operates on IntelligenceSituation[] until
// the homepage migrates fully to the canonical pipeline.
function selectHomepageLead(situations: IntelligenceSituation[], games: LiveGameSituation[] = []) {
  const eligible = situations
    .map((situation) => {
      const rawScore = homepageStoryScore(situation, games);
      const hasLeagueGames = games.some((g) => g.league === situation.league);
      // Offseason penalty: no active games for this league today.
      // injury_update signals (confidence-heavy, no urgency window) use a
      // steeper multiplier than other offseason signal types so that active-
      // league stories with a game on the slate can take the lead.
      const base = hasLeagueGames
        ? rawScore
        : isAvailabilitySituation(situation) && situation.raw.signal_type === "injury_update"
          ? rawScore * 0.4
          : rawScore * 0.7;
      const ageHours = ageHoursFrom(situation.timing.firstSeen);
      return { situation, base, ageHours };
    })
    .filter((entry) => entry.base > -999 && entry.ageHours <= LEAD_MAX_AGE_HOURS);

  if (eligible.length === 0) return null;

  const freshPool = eligible.filter((entry) => entry.ageHours <= 24);
  const pool = freshPool.length > 0 ? freshPool : eligible;

  return [...pool].sort((a, b) => b.base - a.base)[0]?.situation ?? null;
}

function selectEditorialDevelopment(situations: IntelligenceSituation[], exclude?: IntelligenceSituation | null) {
  return situations
    .filter((situation) => situation.id !== exclude?.id)
    .map((situation) => ({ situation, score: homepageStoryScore(situation) + editorialDepthBoost(situation) }))
    .sort((a, b) => b.score - a.score)[0]?.situation ?? null;
}

function editorialDepthBoost(situation: IntelligenceSituation) {
  let score = 0;
  if (situation.whyItMatters && situation.whyItMatters.length > 80) score += 20;
  if (situation.implications.length > 1) score += 14;
  if (situation.timeline.length > 2) score += 12;
  if (situation.sourceSummary.count > 1) score += 10;
  if (situation.marketReaction) score += 8;
  if (situation.actionWindow) score += 8;
  return score;
}

function gameMatchesSituation(game: LiveGameSituation, situation: IntelligenceSituation) {
  if (game.league !== situation.league) return false;
  const situationText = normalizeMatchupText([
    situation.subject.team,
    situation.subject.matchup,
    situation.subject.player,
    situation.headline,
    situation.currentRead,
  ].filter(Boolean).join(" "));
  const away = normalizeMatchupText(game.awayTeam);
  const home = normalizeMatchupText(game.homeTeam);

  return Boolean(
    (away.length > 2 && situationText.includes(away)) ||
    (home.length > 2 && situationText.includes(home)) ||
    (situationText.includes(shortTeam(game.awayTeam).toLowerCase()) && situationText.includes(shortTeam(game.homeTeam).toLowerCase())),
  );
}

function normalizeMatchupText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const homepageStoryScore = (situation: IntelligenceSituation, games: LiveGameSituation[] = []) => {
  const text = [
    situation.headline,
    situation.currentRead,
    situation.whyItMatters,
    situation.actionWindow,
    situation.raw.urgency_reason,
    situation.raw.score_explanation,
    situation.implications.join(" "),
  ].join(" ").toLowerCase();

  if (situation.raw.injury_designation?.toLowerCase().includes("il-") && !situation.marketReaction) return -1000;
  if (isRoutineRosterMove(text, situation)) return -1000;
  if (situation.raw.signal_type === "line_move" && !situation.subject.player && !situation.raw.injury_designation) return -1000;
  if ((situation.timing.window === "Widely Known" || situation.timing.window === "Closing") && !hasHomepagePressure(text, situation)) return -1000;

  let score = situation.priority;
  if (situation.marketReaction) score += 28;
  if (situation.raw.betting_relevance) score += 14;
  if (situation.raw.fantasy_relevance) score += 10;
  if (situation.raw.signal_type === "lineup_change" || situation.raw.signal_type === "lineup_confirm") score += 12;
  if (situation.timing.window === "Early") score += 18;
  if (situation.timing.window === "Developing") score += 10;
  if (situation.escalationState === "Confirming" || situation.escalationState === "Significant") score += 16;
  if (situation.escalationState === "Official") score -= 8;
  if (situation.sourceSummary.count >= 2) score += 10;
  if (situation.confidence.delta && situation.confidence.delta > 0) score += Math.min(situation.confidence.delta * 2, 22);
  if (situation.validators.agreement.toLowerCase().includes("strong")) score += 10;
  if (hasNationalRelevance(text, situation)) score += 14;

  if (/(playoff|postseason|clinch|elimination|division|wild card|must-win|finals|championship)/i.test(text)) score += 36;
  if (/(questionable|doubtful|game[- ]time|warmup|late scratch|scratch|limited|practice|shootaround|availability|injury|designation)/i.test(text)) {
  const hasActiveGames = games.some((g) => g.league === situation.league);
  score += hasActiveGames ? 28 : 8;
}
  if (/(lineup|rotation|starter|starting|pitcher|ace|bullpen|minutes|usage|depth chart|qb|quarterback)/i.test(text)) score += 22;
  if (/(mvp|all-star|\bstar\b|captain|ace|qb1|closer|franchise)/i.test(text)) score += 18;
  if (/(source disagreement|split sources|not yet confirmed|awaiting confirmation|holding|monitoring)/i.test(text)) score += 12;
  if (/(transaction|designated .* assignment|designated for assignment|optioned|recalled|assigned|waived|claimed)/i.test(text)) score -= 50;
  if (/(placed .* injured list|injured list|10-day il|10-day injured list|retroactive)/i.test(text) && !situation.marketReaction) score -= 34;
  if (/(low back strain|hamstring strain|illness|rest day)/i.test(text) && !/(mvp|all-star|star|ace|qb|starter)/i.test(text)) score -= 18;
  if (!situation.subject.player && !situation.subject.team && !situation.subject.matchup) score -= 12;
  if (situation.timing.window === "Widely Known") score -= 60;
  if (situation.timing.window === "Closing") score -= 80;
  if (situation.timing.window === "Stale") score -= 35;

  return score;
}

function hasNationalRelevance(text: string, situation: IntelligenceSituation) {
  const subject = `${situation.subject.team ?? ""} ${situation.subject.player ?? ""} ${situation.subject.matchup ?? ""}`.toLowerCase();
  return /(yankees|dodgers|lakers|celtics|warriors|cowboys|chiefs|eagles|alabama|georgia|ohio state|michigan|mets|red sox|braves|cubs|phillies|rangers)/i.test(`${text} ${subject}`);
}

function hasHomepagePressure(text: string, situation: IntelligenceSituation) {
  return Boolean(situation.marketReaction)
    || /(playoff|postseason|clinch|elimination|division|wild card|must-win|mvp|all-star|\bstar\b|ace|qb|source disagreement|split sources)/i.test(text);
}

function isRoutineRosterMove(text: string, situation: IntelligenceSituation) {
  // Eligibility rulings are categorically not routine — immediate DFS/betting impact
  if (/(eligib|waiver|cleared to play|granted|reinstat|ncaa approved)/i.test(text)) return false;
  const routineMove = /(designated .* assignment|designated .* injured list|designated for assignment|optioned|recalled|assigned|waived|claimed|placed .* injured list|10-day injured list|10-day il|retroactive)/i.test(text);
  return routineMove && !hasHomepagePressure(text, situation);
}

function buildLivePressureContext(games: LiveGameSituation[], situations: IntelligenceSituation[], loading: boolean): LivePressureContext {
  const now = Date.now();
  const upcoming = games.filter((game) => {
    const time = game.gameTime ? new Date(game.gameTime).getTime() : NaN;
    return Number.isFinite(time) && time >= now && time - now <= 4 * 60 * 60 * 1000;
  });
  const live = games.filter((game) => game.status === "In Progress");
  const mlbCount = games.filter((game) => game.league === "MLB").length;
  const nbaCount = games.filter((game) => game.league === "NBA").length;
  const marketCount = situations.filter((situation) => situation.marketReaction).length;
  const earlyCount = situations.filter((situation) => situation.timing.window === "Early").length;
  const sourceCount = situations.reduce((total, situation) => total + situation.sourceSummary.count, 0);
  const weatherCount = situations.filter((situation) => situation.raw.weather_note).length;
  const league = mlbCount ? "MLB coverage active" : nbaCount ? "NBA watch" : "Cross-sport";

  if (loading && !games.length) {
    return {
      heroLeague: "Cross-sport",
      heroHeadline: "Sports desk is coming online",
      heroBody: "EdgeSetter is checking lineups, injuries, weather, game status, and public reports. No major development is promoted until the sports evidence is clear.",
      timing: "Pre-game",
      market: "impact still developing",
      source: "Awaiting reports",
      changed: "ES Agents monitoring — no verified breaks yet",
      whoReacts: "Lineup desks, fantasy players, and books are waiting for verified team news.",
      next: "A lineup confirmation, warmup note, weather update, or late movement may become relevant if verified.",
      sourceArcTitle: "Awaiting report support",
      sourceArcBody: "No lead story is promoted until reports, timing, or late movement reaches homepage weight.",
      escalationWatch: "No verified escalation",
      escalationStage: "Monitoring",
      pressureWindows: ["Pre-game desk", "Impact still developing", "Awaiting reports"],
      convergenceSteps: [
        { label: "Coverage online", state: "complete" },
        { label: "Reports scanning", state: "active" },
        { label: "Lineup/injury movement", state: "waiting" },
        { label: "Confirmation", state: "waiting" },
      ],
    };
  }

  const slateLine = mlbCount
    ? `Monitoring late lineup and pitcher context across ${mlbCount} MLB game${mlbCount === 1 ? "" : "s"}.`
    : games.length
      ? `Monitoring confirmation windows across ${games.length} live sports event${games.length === 1 ? "" : "s"}.`
    : "Quiet board: no major lineup or injury shift detected yet.";

  const timingLine = upcoming.length
    ? `${upcoming.length} game${upcoming.length === 1 ? "" : "s"} entering the next four-hour confirmation window`
    : live.length
      ? `${live.length} game${live.length === 1 ? "" : "s"} live`
      : earlyCount
        ? `${earlyCount} early read${earlyCount === 1 ? "" : "s"}`
        : "Quiet board";

  const buildingCount = situations.filter((situation) => situation.confidence.current >= 70 && situation.confidence.current < 90).length;

  return {
    heroLeague: league,
    heroHeadline: marketCount
      ? "Team and player updates are shaping tonight's board"
      : situations.length
        ? `Monitoring ${situations.length} active situation${situations.length === 1 ? "" : "s"}`
        : "Agents active across all leagues",
    heroBody: `${slateLine} ${weatherCount ? "Weather is part of the game read." : "EdgeSetter is waiting for a real team-news break before elevating a single story."}`,
    timing: timingLine,
    market: marketCount ? `${marketCount} sports shift${marketCount === 1 ? "" : "s"}` : "impact still developing",
    source: sourceCount ? `${sourceCount} report${sourceCount === 1 ? "" : "s"} attached` : "Awaiting reports",
    changed: marketCount ? "Team or player news moving before public consensus" : upcoming.length ? "Games entering confirmation window" : buildingCount ? "Confidence building" : "ES Agents monitoring — no verified breaks yet",
    whoReacts: mlbCount ? "Clubhouses, lineup desks, fantasy players, and books are waiting on the same confirmations." : "Teams, report desks, and books are holding for firmer confirmation.",
    next: weatherCount ? "Weather, lineup, and external context may converge before first pitch." : "A late scratch, lineup confirmation, warmup note, or external movement could become the lead.",
    sourceArcTitle: sourceCount ? "Reports active across today's games" : "Awaiting lineup or injury confirmation",
    sourceArcBody: sourceCount
      ? `${sourceCount} report${sourceCount === 1 ? "" : "s"} attached across today's games, but none have reached homepage escalation weight.`
      : "No report chain has reached homepage weight yet. The page is holding for a meaningful break, not filler.",
    escalationWatch: earlyCount ? `${earlyCount} early read${earlyCount === 1 ? "" : "s"}` : "No verified escalation",
    escalationStage: marketCount ? "Escalating" : sourceCount ? "Emerging" : "Monitoring",
    pressureWindows: buildFallbackPressureWindows({ upcoming: upcoming.length, live: live.length, marketCount, earlyCount, weatherCount, mlbCount, nbaCount }),
    convergenceSteps: [
      { label: "Board context", state: "complete" },
      { label: sourceCount ? "Reports attached" : "Reports scanning", state: sourceCount ? "complete" : "active" },
      { label: marketCount ? "Market reacting" : "Impact still developing", state: marketCount ? "complete" : "active" },
      { label: "Official confirmation", state: "waiting" },
    ],
  };
}

function dedupeSignalFeed(situations: IntelligenceSituation[]): IntelligenceSituation[] {
  const STALE_MS = 48 * 60 * 60 * 1000;
  const fresh = situations.filter((s) => {
    const ms = new Date(s.timing.firstSeen).getTime();
    if (!Number.isFinite(ms)) return true;
    return Date.now() - ms <= STALE_MS;
  });
  const groups = new Map<string, IntelligenceSituation[]>();
  for (const s of fresh) {
    const key = `${s.league}:${s.signalType}`;
    const group = groups.get(key) ?? [];
    group.push(s);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const best = group.sort((a, b) => b.confidence.current - a.confidence.current)[0];
    if (group.length <= 1) return best;
    const typeLabel = best.signalType.replace(/_/g, " ");
    const summaryType = `${group.length} ${typeLabel}s`;
    return {
      ...best,
      id: `summary-${best.league}-${best.signalType}`,
      signalType: summaryType,
      subject: { team: null, player: null, matchup: null },
      raw: best.raw ? { ...best.raw, signal_type: summaryType } : best.raw,
    };
  });
}

// North Star ticker: real situations with real copy only — no generic filler.
function buildTickerItems({ situations, games }: { situations: IntelligenceSituation[]; games: LiveGameSituation[] }) {
  const verified = situations
    .map((situation) => ({ situation, detection: detectionLeadForIntelligence(situation) }))
    .filter((entry) => entry.detection !== null)
    .slice(0, 2)
    .map(({ situation, detection }) => {
      const storyCopy = buildPublicSituationStory(situation);
      const headline = hasCleanPublicText(storyCopy.shortHeadline)
        ? storyCopy.shortHeadline
        : publicFallbackLabel(`${storyCopy.headline} ${situation.raw.signal_type}`, situation.league);
      return `⚡ ES Agents verified ${headline} — ${detection!.lead} before public confirmation`;
    });
  const market = situations
    .filter((situation) => situation.marketReaction)
    .slice(0, 2)
    .map((situation) => `${situation.league}: ${cleanTickerSubject(situation.subject.matchup ?? situation.subject.team)} watch tightening`);
  const lineup = situations
    .filter((situation) => situation.raw.lineup_status || situation.raw.injury_designation)
    .slice(0, 2)
    .map((situation) => `${situation.league}: ${cleanTickerSubject(situation.subject.player ?? situation.subject.team ?? "availability")} update active`);
  const source = situations
    .filter((situation) => situation.sourceSummary.count > 1)
    .slice(0, 2)
    .map((situation) => `${situation.league}: ${situation.sourceSummary.count} reports lining up`);
  const game = games
    .filter((item) => item.activeSituations > 0)
    .slice(0, 2)
    .map((item) => `${item.league}: ${cleanShortTeam(item.awayTeam)} @ ${cleanShortTeam(item.homeTeam)} — ${item.activeSituations} situation${item.activeSituations === 1 ? "" : "s"} in progress`);
  const building = situations.some((situation) => situation.confidence.current >= 70 && situation.confidence.current < 90)
    ? ["Confidence building"]
    : [];

  return [...verified, ...market, ...lineup, ...source, ...game, ...building]
    .filter(Boolean)
    .filter((item) => !containsPublicInvalidToken(item))
    .filter((item, index, array) => array.indexOf(item) === index)
    .slice(0, 8);
}

function cleanTickerSubject(value?: string | null) {
  if (!value || containsPublicInvalidToken(value)) return "watch item";
  return value;
}

function buildFallbackPressureWindows(counts: { upcoming: number; live: number; marketCount: number; earlyCount: number; weatherCount: number; mlbCount: number; nbaCount: number }) {
  const windows = [
    counts.upcoming ? `${counts.upcoming} games entering confirmation window` : null,
    counts.live ? `${counts.live} live game${counts.live === 1 ? "" : "s"} with active desk read` : null,
    counts.marketCount ? `${counts.marketCount} sports shift${counts.marketCount === 1 ? "" : "s"} detected` : "impact still developing",
    counts.weatherCount ? "Weather pressure in the game model" : null,
    counts.mlbCount ? "MLB lineup and pitcher checks active" : null,
    counts.nbaCount ? "NBA availability window staged" : null,
    counts.earlyCount ? `${counts.earlyCount} early team-news read${counts.earlyCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean) as string[];
  return windows.slice(0, 3);
}

function sourcePostureLabel(situation: IntelligenceSituation | null) {
  if (!situation) return "Awaiting reports";
  return situation.sourceSummary.convergence || "Awaiting confirmation";
}

function sourcePostureShortLabel(situation: IntelligenceSituation | null) {
  if (!situation) return "Reports pending";
  const posture = situation.sourceSummary.convergence;
  if (posture === "Source convergence" || posture === "Confirmed source chain") return "Reports aligned";
  if (posture === "Official source") return "Official";
  if (posture === "Awaiting source chain" || posture === "Awaiting confirmed source") return "Reports pending";
  return posture;
}

function marketReactionLabel(situation: IntelligenceSituation | null) {
  if (!situation?.marketReaction) return "No verified movement yet";
  if (situation.marketReaction.delta) return "Market reacting";
  if (situation.marketReaction.note) return situation.marketReaction.note;
  if (situation.marketReaction.current) return "External movement detected";
  return "Market reacting";
}

function confidenceMovementLabel(situation: IntelligenceSituation | null) {
  if (!situation) return "Awaiting confirmation";
  if (situation.confidence.delta === null) return `${situation.confidence.current}% early read`;
  return `${situation.confidence.current}% ${situation.confidence.delta > 0 ? "+" : ""}${situation.confidence.delta}`;
}

function publicConfidenceMovementLabel(situation: IntelligenceSituation | null) {
  if (!situation) return "Awaiting confirmation";
  if (situation.confidence.delta === null) return `${situation.confidence.current}% early read`;
  if (situation.confidence.delta > 0) return `${situation.confidence.current}% rising support`;
  if (situation.confidence.delta < 0) return `${situation.confidence.current}% support cooling`;
  return `${situation.confidence.current}% holding steady`;
}

function latestChangeLabel(situation: IntelligenceSituation | null) {
  if (!situation) return "Reports pending";
  return compactIntelPhrase(situation.timeline.at(-1)?.detail ?? situation.currentRead) ?? "Reports pending";
}

function storyChangeLabel(situation: IntelligenceSituation) {
  if (situation.raw.injury_designation) return `${situation.raw.injury_designation} availability signal`;
  if (situation.raw.lineup_status) return `${situation.raw.lineup_status} lineup context`;
  if (situation.marketReaction) return `${situation.subject.matchup ?? situation.subject.team ?? "Team news"} shifted`;
  return situation.timeline.at(-1)?.label ?? "Live read updated";
}

const INJURY_TYPE_PATTERN = /(hamstring|ankle|knee|quad(?:ricep)?|calf|groin|shoulder|lower back|back|hip|foot|wrist|hand|elbow|concussion|achilles|oblique|illness|toe|rib|neck|forearm|finger|thumb|acl|mcl|ucl|pectoral|lat|hernia|abdominal)/i;

function headlineSourceTier(situation: IntelligenceSituation) {
  const convergence = (situation.sourceSummary.convergence ?? "").toLowerCase();
  if (convergence.includes("official")) return "official sources";
  if (situation.sourceSummary.count >= 2) return "multiple reports";
  return "source reports";
}

// FIX 2 — specific headline templates. Names the player/team plus the concrete
// development whenever the pipeline carried one; returns null when the data
// can't support a specific claim so editorial branch copy takes over.
function generateHeadline(situation: IntelligenceSituation): string | null {
  const player = isValidPlayerName(situation.subject.player) ? (situation.subject.player?.trim() || null) : null;
  const matchupTeams = splitMatchup(situation.subject.matchup);
  const rawTeam = situation.subject.team ?? matchupTeams[0] ?? null;
  const team = rawTeam ? displayTeamName(rawTeam, situation.league) : null;
  if (!player && !team) return null;

  const type = situation.raw.signal_type.toLowerCase();
  const text = `${situation.raw.signal_type} ${situation.headline} ${situation.currentRead}`.toLowerCase();
  const opponent = rawTeam && team
    ? matchupTeams.map((side) => displayTeamName(side, situation.league)).find((side) => side.toLowerCase() !== team.toLowerCase()) ?? null
    : null;

  // Eligibility ruling — official determination, names the school
  if (type.includes("eligibility") || /\b(eligibility|eligible|waiver|reinstate|cleared to play)\b/.test(text)) {
    if (player && team) return `${player} cleared — ${team} confirms eligibility`;
    if (player) return `${player} cleared — eligibility confirmed`;
    return `${team} eligibility ruling confirmed`;
  }

  // Coaching change — coach name rides in the player slot for coaching signals
  if (type.includes("coaching") || /\bcoach(?:ing|es)?\b/.test(text)) {
    const action = /\b(hired|named|joins)\b/.test(text) ? "hired" : /\b(fired|dismissed|parts ways|resigns?|resigned)\b/.test(text) ? "fired" : null;
    if (action && player && team) return `${player} ${action} at ${team}`;
    if (action && (player || team)) return `${player ?? team} — coaching ${action === "hired" ? "hire" : "change"} confirmed`;
  }

  // Trade — destination team plus the trail strength
  if (/\btraded?\b/.test(text) && player && team) {
    return `${player} traded to ${team}, per ${headlineSourceTier(situation)}`;
  }

  // Injury — the designation is the concrete development
  const status = publicAvailabilityStatus(situation.raw.injury_designation);
  if (status) {
    const injury = text.match(INJURY_TYPE_PATTERN)?.[1] ?? null;
    const subject = player ?? `${team}`;
    return injury ? `${subject} (${injury}) — ${status}` : `${subject} — ${status}`;
  }

  // Lineup — confirmed role or scratch
  if (situation.raw.lineup_status && player && team) {
    const lineupStatus = situation.raw.lineup_status.toLowerCase();
    const role = text.match(/\b(starter|starting pitcher|qb1|leadoff|cleanup|closer)\b/)?.[1] ?? "starter";
    const action = /scratch/.test(lineupStatus) ? "scratched" : `confirmed ${role}`;
    return opponent ? `${player} ${action} for ${team} vs ${opponent}` : `${player} ${action} for ${team}`;
  }

  // Market — real numbers only
  const reaction = situation.marketReaction;
  if (reaction?.open && reaction?.current && reaction.open !== reaction.current && (team || situation.subject.matchup)) {
    return `${team ?? situation.subject.matchup} line moves ${reaction.open} → ${reaction.current}`;
  }

  return null;
}

function buildPublicSituationStory(situation: IntelligenceSituation) {
  const player = isValidPlayerName(situation.subject.player) ? situation.subject.player?.trim() : undefined;
  const team = displayTeamName(situation.subject.team ?? splitMatchup(situation.subject.matchup)[0] ?? situation.league, situation.league);
  const specificHeadline = generateHeadline(situation);
  const teamContext = team ? `${team} ${teamContextNoun(situation)}` : `${situation.league} context`;
  const type = publicSituationType(situation);
  const status = publicAvailabilityStatus(situation.raw.injury_designation);
  const hasPlayer = Boolean(player);
  const sourcePhrase = publicSourceSummary(situation.sourceSummary.convergence).toLowerCase();
  const marketPhrase = situation.marketReaction ? " Books, fantasy markets, and team context are already reacting." : "";

  if (isAvailabilitySituation(situation)) {
    const rawText = `${situation.raw.signal_type} ${situation.headline} ${situation.currentRead} ${situation.raw.body ?? ""} ${situation.raw.action_note ?? ""}`.toLowerCase();
    const injuryPart = rawText.match(INJURY_TYPE_PATTERN)?.[1] ?? null;
    const lastName = player ? player.split(" ").slice(-1)[0] : null;

    const injuryIsLoadBearing = injuryPart ? /hamstring|achilles|knee|acl|mcl|ucl/i.test(injuryPart) : false;
    const injuryIsConcussion = injuryPart ? /concussion/i.test(injuryPart) : false;
    const injuryIsIllness = injuryPart ? /illness/i.test(injuryPart) : false;
    const injuryIsArm = injuryPart ? /shoulder|elbow|wrist|forearm/i.test(injuryPart) : false;
    const injuryIsBack = injuryPart ? /back/i.test(injuryPart) : false;
    const injuryIsMobility = injuryPart ? /ankle|foot|toe|calf/i.test(injuryPart) : false;
    const injuryIsCore = injuryPart ? /oblique|rib|abdominal/i.test(injuryPart) : false;
    const isStar = Boolean(situation.marketReaction || situation.raw.betting_relevance || situation.raw.fantasy_relevance);
    const lg = situation.league;

    let deck: string;
    let shortDeck: string;
    let whatHappened: string;
    let whyItMatters: string;

    if (hasPlayer) {
      if (status === "OUT") {
        if (injuryIsConcussion) {
          deck = `${player} is in concussion protocol and out. There's no reliable return window until he clears every evaluation step — treat this as open-ended.`;
        } else if (injuryIsIllness) {
          if (lg === "NBA") {
            deck = `${player} is out sick. Rotation coverage activates now — illness designations can clear fast, but there's no reliable timeline until the next practice report.`;
          } else if (lg === "MLB") {
            deck = `${player} is out with an illness. Watch for a roster move if this extends into tomorrow — teams rarely carry inactive players without adjusting the roster.`;
          } else {
            deck = `${player} is out sick. These can flip quickly, but until there's a confirmed return the depth chart reads as active.`;
          }
        } else if (injuryIsLoadBearing) {
          if (lg === "NBA") {
            deck = `${player} is out — ${injuryPart} injuries in the NBA rarely resolve in days. Minute redistribution across the rotation starts now, and the back-to-back schedule is the next variable.`;
          } else if (lg === "MLB") {
            deck = `${player} is out with a ${injuryPart} issue. This type of injury almost always means an IL move — watch for the roster transaction within 24 to 48 hours.`;
          } else if (lg === "NFL") {
            deck = `${player} is out — a ${injuryPart} designation means at least a week in the NFL. Target share and snap redistribution start with the next practice report.`;
          } else {
            deck = `${player} is out with a ${injuryPart} issue. Depth at the position in ${team}'s program is the immediate read.`;
          }
        } else if (injuryIsArm) {
          if (lg === "MLB") {
            deck = `${player} is out — a ${injuryPart} injury for a pitcher draws immediate long-term scrutiny. Watch for an IL designation and a timeline from the club within the day.`;
          } else if (lg === "NFL") {
            deck = `${player} is out with a ${injuryPart} issue. This directly affects the passing game — the depth chart reshuffles and scheme adjustments follow.`;
          } else {
            deck = `${player} is out — ${injuryPart} issues affect shooting and ball-handling directly. Usage redistribution is the immediate read.`;
          }
        } else if (injuryIsBack) {
          deck = `${player} is out. Back injuries are rest-dependent and can recur unpredictably — the day-to-day label doesn't mean a quick resolution.`;
        } else if (injuryIsMobility) {
          if (lg === "NBA") {
            deck = `${player} is out. Mobility-based injuries in the NBA often come with workload limits on return — check the back-to-back schedule before projecting full minutes.`;
          } else if (lg === "NFL") {
            deck = `${player} is out with a ${injuryPart} injury. These can linger through a full week even on the active roster — practice participation is the real indicator.`;
          } else {
            deck = `${player} is out — ${injuryPart} injuries affect movement and rarely clear faster than they appear. Watch the daily status.`;
          }
        } else if (injuryIsCore) {
          deck = `${player} is out — ${injuryPart} injuries end swings and throws quickly and resist being played through. An IL move is worth monitoring within the next 24 hours.`;
        } else {
          deck = injuryPart
            ? `${player} is out with a ${injuryPart} issue. The ${team} ${teamContextNoun(situation)} resets until a return window is confirmed.`
            : `${player} is out. No timeline has surfaced — the ${team} ${teamContextNoun(situation)} stays under active watch until that changes.`;
        }
        shortDeck = `${player} is out — ${team} coverage activates.`;
        whatHappened = `${player} won't play. ${team} has to account for the absence${injuryPart ? ` — ${injuryPart} flag` : ""} and the plan adjusts from here.`;
      } else if (status === "DOUBTFUL") {
        if (injuryIsConcussion) {
          deck = `${player} is doubtful in concussion protocol. Until cleared at every stage, the doubtful tag is effectively an out — plan the ${team} ${teamContextNoun(situation)} without him.`;
        } else if (injuryIsIllness) {
          deck = `${player} is listed doubtful with an illness. These break in either direction — final reports and pregame warmups are the real signal, not the listing.`;
        } else if (injuryIsLoadBearing) {
          deck = `${player} is doubtful — ${injuryPart} injuries rarely clear from a doubtful tag by game time. The working assumption for ${team} is absence until the final report says otherwise.`;
        } else if (injuryIsArm) {
          const posLabel = lg === "MLB" ? "a pitcher" : lg === "NFL" ? "a quarterback" : "a player";
          deck = `${player} is listed doubtful with a ${injuryPart} issue. For ${posLabel}, that's an arm flag — watch whether he goes through a full warmup before trusting the designation.`;
        } else {
          deck = `${player} is listed doubtful. From this designation, absence is the working plan until the final ${team} practice report changes the read.`;
        }
        shortDeck = `${player} is doubtful — plan around the absence.`;
        whatHappened = `${player} is listed doubtful, putting the ${team} ${teamContextNoun(situation)} in a holding pattern until the final injury report drops.`;
      } else if (status === "QUESTIONABLE") {
        if (injuryIsConcussion) {
          deck = `${player} is questionable in concussion protocol. There's no reliable timeline from this designation — status can flip in either direction before game time.`;
        } else if (injuryIsIllness) {
          deck = `${player} is questionable, listed with an illness. Day-to-day — the pregame window is typically when this resolves, not before.`;
        } else if (injuryIsLoadBearing) {
          deck = `${player} is questionable with a ${injuryPart} issue. Players rarely sit out on questionable from this injury type — but watch for workload limits and a minutes ceiling on return.`;
        } else if (injuryIsArm) {
          const posLabel = lg === "MLB" ? "pitcher" : lg === "NFL" ? "quarterback" : "player";
          deck = `${player} is questionable with a ${injuryPart} problem. For a ${posLabel}, arm health is the primary watch — pregame warmup and any workload restriction are the read.`;
        } else if (injuryIsMobility) {
          deck = `${player} is questionable — ${injuryPart} injuries often get played through at this level, but workload limits are common. Watch the pregame availability report.`;
        } else {
          deck = `${player} is questionable. The ${team} ${teamContextNoun(situation)} stays in two-scenario mode until a confirmed pregame read comes in.`;
        }
        shortDeck = `${player} is questionable — pregame reports are the signal.`;
        whatHappened = `${player} got a questionable tag — not out yet, but the ${team} ${teamContextNoun(situation)} adjusts to cover both scenarios.`;
      } else {
        deck = isStar
          ? `${player}'s status is being tracked without a formal designation. ${team} context is shifting — the next confirmed report is the one that matters.`
          : `${player}'s availability is under the watch — no designation yet, but the situation is active. Monitor the ${team} practice report.`;
        shortDeck = `${player}'s status is being monitored — no designation confirmed yet.`;
        whatHappened = `${player}'s status surfaced without a formal designation. ${team} planning is active until the situation resolves.`;
      }

      if (lg === "NBA") {
        if (injuryIsLoadBearing || injuryIsBack) {
          whyItMatters = `Missing minutes cascade in the NBA — another guard or forward picks up usage, fantasy lines shift, and the back-to-back schedule adds complexity to every projection.${marketPhrase}`;
        } else if (injuryIsArm) {
          whyItMatters = `Arm injuries affect shooting assignments and ball-handling responsibilities fast in the NBA — the rotation adjusts within a game or two as the team redistributes minutes.${marketPhrase}`;
        } else {
          whyItMatters = `The ${team} rotation plan adjusts, usage numbers shift, and anyone absorbing the vacated minutes gets a short-term fantasy and DFS boost.${marketPhrase}`;
        }
      } else if (lg === "MLB") {
        if (injuryIsCore) {
          whyItMatters = `Oblique and abdominal injuries end swings and throws suddenly in baseball — IL time is common even when teams manage them in-game. Lineup order and roster depth both change.${marketPhrase}`;
        } else if (injuryIsArm) {
          whyItMatters = `Arm injuries for pitchers trigger bullpen restructuring and almost always lead to a roster move within 24 hours. Watch the IL deadline and bullpen usage across the series.${marketPhrase}`;
        } else {
          whyItMatters = `Lineup disruption in baseball compounds across a series — batting order, defensive alignment, and platoon usage can all shift from a single absence.${marketPhrase}`;
        }
      } else if (lg === "NFL") {
        if (injuryIsLoadBearing) {
          whyItMatters = `A load-bearing injury in the NFL changes snap share, target distribution, and the opponent's game plan. The downstream effect runs through at least the current week.${marketPhrase}`;
        } else if (injuryIsArm) {
          whyItMatters = `An arm injury on the offensive side changes throw volume, target share, and pass-protection assignments. Role redistribution in the NFL moves fast.${marketPhrase}`;
        } else {
          whyItMatters = `Role and snap redistribution in the NFL moves quickly. Adjacent positions see real changes in usage before the week is out.${marketPhrase}`;
        }
      } else if (lg === "CFB") {
        whyItMatters = `Depth at this position in CFB is thinner than the pros. A key absence can change schematic identity — not just a single matchup read, but how the unit operates.${marketPhrase}`;
      } else {
        whyItMatters = `The ${teamContext}, distribution of responsibilities, and opponent prep shift if the status holds or changes.${marketPhrase}`;
      }
    } else {
      deck = `${team} has a developing availability situation. Role distribution and ${teamContextNoun(situation)} could shift until the picture clarifies.`;
      shortDeck = `${team}'s availability picture is under active watch.`;
      whatHappened = `${team}'s availability context changed — the specifics are still coming into focus.`;
      whyItMatters = `Availability changes at the team level can alter role distribution and matchup prep before the picture settles.${marketPhrase}`;
    }

    let detail: string;
    if (status && lastName) {
      detail = injuryPart
        ? `${lastName} listed ${status} — ${injuryPart.charAt(0).toUpperCase() + injuryPart.slice(1)}`
        : `${lastName} listed ${status}`;
    } else if (status && team) {
      detail = `${team} — ${status}`;
    } else {
      detail = `${team} availability update`;
    }

    const headline =
      specificHeadline ??
      (hasPlayer
        ? `${player} availability puts ${team} ${teamContextNoun(situation)} in focus`
        : `${team} availability puts ${teamContextNoun(situation)} in focus`);

    return {
      headline,
      shortHeadline: headline,
      deck,
      shortDeck,
      detail,
      whatHappened,
      whyItMatters,
      watchNext: `Watch for confirmed beat reports, practice participation, and any official roster adjustments before game time.`,
    };
  }

  if (isRosterMoveSituation(situation)) {
    const subject = player ?? team;
    const headline = specificHeadline ?? `${subject} roster move could change ${team} depth-chart plan`;
    return {
      headline,
      shortHeadline: headline,
      deck: `${team}'s roster picture changed, which can alter depth, roles, and next-man usage. Watch for this to develop into a larger team-context shift.`,
      shortDeck: `${team}'s roster picture changed and the role impact is still developing.`,
      detail: "Roster context changed",
      whatHappened: `${subject} is tied to a roster update that changes the ${team} context.`,
      whyItMatters: `Roster movement can change depth charts, usage, and how opponents prepare for ${team}.`,
      watchNext: "Watch for official roster confirmation, practice roles, and depth-chart updates.",
    };
  }

  if (isLineupSituation(situation)) {
    const subject = player ?? team;
    const headline = specificHeadline ?? `${subject} lineup update could shape ${team} pregame plan`;
    return {
      headline,
      shortHeadline: headline,
      deck: `${team}'s lineup context is active heading into first pitch. Watch for confirmed starters and any late scratches before game time.`,
      shortDeck: `${team}'s lineup context remains active before the next confirmation.`,
      detail: "Lineup context updated",
      whatHappened: `${team}'s lineup or pitcher context changed heading into tonight's game.`,
      whyItMatters: "Starting pitcher and lineup confirmation locks in the key matchup variables for tonight's game.",
      watchNext: "First pitch tonight. Watch for any late scratches from either lineup before game time.",
    };
  }

  if (isDepthChartSituation(situation)) {
    const subject = player ?? team;
    const headline = specificHeadline ?? `${subject} depth-chart update puts ${team} roles in focus`;
    return {
      headline,
      shortHeadline: headline,
      deck: `${team}'s depth chart is still developing. Watch for reports, practice usage, or roster signals to confirm a real role change.`,
      shortDeck: `${team}'s depth chart is still developing.`,
      detail: "Depth chart context updated",
      whatHappened: `${team}'s depth or role context changed enough to keep monitoring.`,
      whyItMatters: "Role changes affect who plays and how the team sets up — the depth picture matters more when it shifts close to game time.",
      watchNext: "Watch for practice reports, snap counts, rotation notes, and any official roster or depth-chart confirmation.",
    };
  }

  if (situation.marketReaction) {
    const subject = player ?? situation.subject.matchup ?? team;
    const headline = specificHeadline ?? `${subject} line movement follows late ${team} context`;
    return {
      headline,
      shortHeadline: headline,
      deck: `Market context is reacting around ${subject}. Watch for team news or source support to back the move.`,
      shortDeck: `Market reaction is moving around ${subject}.`,
      detail: "Books/fantasy/team context reacting",
      whatHappened: `${subject} is tied to movement that changed the ${team} read.`,
      whyItMatters: "Market movement can signal that team news, matchup context, or availability assumptions are changing before the public story is settled.",
      watchNext: "Watch for the team news or injury update behind the move, and whether it holds as more sources weigh in.",
    };
  }

  if (situation.raw.weather_note) {
    const headline = `${team} game environment could shift weather and matchup plans`;
    return {
      headline,
      shortHeadline: headline,
      deck: `Game environment is part of the current ${team} read. Watch for weather, field conditions, or timing changes to alter projections.`,
      shortDeck: `${team} game environment remains part of the live read.`,
      detail: "Game environment updated",
      whatHappened: `${team}'s game environment has a weather or conditions note attached.`,
      whyItMatters: "Weather and field conditions can alter pace, scoring environment, and substitution patterns.",
      watchNext: "Watch for updated forecasts, official game notes, lineup changes, and total or prop movement.",
    };
  }

  // Generic "remains on the watch" copy is allowed ONLY when neither a player
  // nor a team can be named (North Star: every headline names the sports story).
  const subject = player ?? situation.subject.matchup ?? team;
  const development = compactIntelPhrase(situation.timeline.at(-1)?.detail ?? situation.currentRead);
  const serverHeadline = situation.headline?.trim();
  const serverHeadlineUsable = Boolean(
    serverHeadline &&
    hasCleanPublicText(serverHeadline) &&
    ((player && serverHeadline.includes(player)) || (situation.subject.team && serverHeadline.includes(situation.subject.team))),
  );
  const hasNamedSubject = Boolean(player || situation.subject.team || situation.subject.matchup);
  const headline =
    specificHeadline
    ?? (serverHeadlineUsable ? serverHeadline! : null)
    ?? (hasNamedSubject && development ? `${subject} — ${development}` : `${subject} update remains on the ${situation.league} watch`);
  return {
    headline,
    shortHeadline: headline,
    deck: `${situation.league} context is still developing around ${subject}. Watch for the source trail, timing, and impact to develop before the read elevates further.`,
    shortDeck: `${situation.league} context is still developing around ${subject}.`,
    detail: "Story context updated",
    whatHappened: `${subject} is attached to a developing ${situation.league} story read.`,
    whyItMatters: (situation.whyItMatters ? sanitizeOutletReferences(compactIntelPhrase(situation.whyItMatters) ?? "") : null) || "The update can change team context and matchup prep if more source support arrives."
  };
}

function publicSituationType(situation: IntelligenceSituation) {
  const type = situation.raw.signal_type.toLowerCase();
  if (isAvailabilitySituation(situation)) return "Availability watch";
  if (isRosterMoveSituation(situation)) return "Roster move";
  if (isLineupSituation(situation)) return situation.league === "MLB" ? "Lineup/pitcher watch" : "Lineup watch";
  if (isDepthChartSituation(situation)) return "Depth chart watch";
  if (situation.marketReaction || type.includes("line") || type.includes("odds")) return "Market movement";
  if (situation.raw.weather_note || type.includes("weather")) return "Weather/game environment";
  if (type.includes("transaction")) return "Transaction watch";
  return "Team news";
}

function isAvailabilitySituation(situation: IntelligenceSituation) {
  const text = `${situation.raw.signal_type} ${situation.raw.injury_designation ?? ""} ${situation.headline} ${situation.currentRead}`.toLowerCase();
  return Boolean(situation.raw.injury_designation) || /(injury|availability|questionable|doubtful|out|practice|limited|dnp|status)/i.test(text);
}

function isRosterMoveSituation(situation: IntelligenceSituation) {
  const text = `${situation.raw.signal_type} ${situation.headline} ${situation.currentRead}`.toLowerCase();
  return /(roster|waived|claimed|optioned|recalled|assigned|activated|injured list|practice squad)/i.test(text);
}

function isLineupSituation(situation: IntelligenceSituation) {
  const text = `${situation.raw.signal_type} ${situation.raw.lineup_status ?? ""} ${situation.headline} ${situation.currentRead}`.toLowerCase();
  return Boolean(situation.raw.lineup_status) || /(lineup|starter|starting|pitcher|bullpen|scratch|rotation)/i.test(text);
}

function isDepthChartSituation(situation: IntelligenceSituation) {
  const text = `${situation.raw.signal_type} ${situation.headline} ${situation.currentRead}`.toLowerCase();
  return /(depth|qb1|role|snap|practice rep|rotation)/i.test(text);
}

function publicAvailabilityStatus(value?: string | null) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "OUT") return "OUT";
  if (normalized === "QUESTIONABLE") return "QUESTIONABLE";
  if (normalized === "DOUBTFUL") return "DOUBTFUL";
  return value.trim();
}

function publicSourceSummary(value?: string | null) {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("official")) return "Official trail checked";
  if (normalized.includes("corroborated") || normalized.includes("confirmed") || normalized.includes("consensus")) return "Multiple sources tracking";
  if (normalized.includes("single")) return "One source flagged so far";
  if (normalized.includes("awaiting")) return "Source trail still developing";
  return "Source trail checked";
}

function publicWatchNext(situation: IntelligenceSituation) {
  if (isAvailabilitySituation(situation)) return "Watch for confirmed reports, practice participation, roster adjustments, and market or fantasy movement.";
  if (isLineupSituation(situation)) return "Watch for official lineup cards, late scratches, pitcher confirmation, and market movement.";
  if (isRosterMoveSituation(situation)) return "Watch for official transactions, depth-chart changes, practice roles, and follow-on reports.";
  if (situation.marketReaction) return "Watch whether the move is confirmed by trusted reports and whether prices or projections keep adjusting.";
  return situation.actionWindow || "Watch for confirmation, source support, and downstream impact.";
}

const GENERIC_PLAYER_TOKENS = new Set(["player", "unknown player", "unknown", "athlete"]);
function isValidPlayerName(name?: string | null): boolean {
  return Boolean(name) && !GENERIC_PLAYER_TOKENS.has(name!.trim().toLowerCase());
}

const NAMED_OUTLET_RE = /\b(Rotowire(?:\s+(?:CFB|NFL|MLB|NBA))?|ESPN(?:\s+(?:CFB|NFL|MLB|NBA))?|The\s+Athletic|AP\b|PFF\b|FantasyPros|CBS\s+Sports|Yahoo\s+Sports|NFL\s+Network)\b/gi;
function sanitizeOutletReferences(text: string): string {
  return text
    .replace(NAMED_OUTLET_RE, "wire service")
    .replace(/\bSingle\s+source:\s+wire\s+service\b/gi, "Single wire source")
    .replace(/\bpublic\s+confirmation\b/gi, "ES Agents verified");
}

// Team nicknames are resolved with (league, abbreviation) as a compound key
// because abbreviations collide across leagues: KC is the Royals in MLB but
// the Chiefs in NFL; SF is the Giants in MLB but the 49ers in NFL; MIA is the
// Marlins, Heat, or Dolphins depending on the league. A miss inside a known
// league falls back to the raw value rather than another league's name.
const LEAGUE_TEAM_NAMES: Record<string, Record<string, string>> = {
  NFL: {
    ari: "Cardinals",
    atl: "Falcons",
    bal: "Ravens",
    buf: "Bills",
    car: "Panthers",
    chi: "Bears",
    cin: "Bengals",
    cle: "Browns",
    dal: "Cowboys",
    den: "Broncos",
    det: "Lions",
    gb: "Packers",
    hou: "Texans",
    ind: "Colts",
    jax: "Jaguars",
    jac: "Jaguars",
    kc: "Chiefs",
    lac: "Chargers",
    lar: "Rams",
    lv: "Raiders",
    mia: "Dolphins",
    min: "Vikings",
    ne: "Patriots",
    no: "Saints",
    nyg: "Giants",
    nyj: "Jets",
    phi: "Eagles",
    pit: "Steelers",
    sea: "Seahawks",
    sf: "49ers",
    "san francisco 49ers": "49ers",
    tb: "Buccaneers",
    ten: "Titans",
    was: "Commanders",
    wsh: "Commanders",
  },
  MLB: {
    ari: "Diamondbacks",
    atl: "Braves",
    bal: "Orioles",
    bos: "Red Sox",
    chc: "Cubs",
    cws: "White Sox",
    chw: "White Sox",
    cin: "Reds",
    cle: "Guardians",
    col: "Rockies",
    det: "Tigers",
    hou: "Astros",
    kc: "Royals",
    kcr: "Royals",
    laa: "Angels",
    lad: "Dodgers",
    mia: "Marlins",
    "miami marlins": "Marlins",
    mil: "Brewers",
    min: "Twins",
    nym: "Mets",
    nyy: "Yankees",
    oak: "Athletics",
    phi: "Phillies",
    pit: "Pirates",
    sd: "Padres",
    sdp: "Padres",
    sea: "Mariners",
    sf: "Giants",
    sfg: "Giants",
    stl: "Cardinals",
    tb: "Rays",
    tbr: "Rays",
    tex: "Rangers",
    tor: "Blue Jays",
    "toronto blue jays": "Blue Jays",
    wsn: "Nationals",
    wsh: "Nationals",
  },
  NBA: {
    atl: "Hawks",
    bkn: "Nets",
    bos: "Celtics",
    cha: "Hornets",
    chi: "Bulls",
    cle: "Cavaliers",
    dal: "Mavericks",
    den: "Nuggets",
    det: "Pistons",
    gsw: "Warriors",
    hou: "Rockets",
    ind: "Pacers",
    lac: "Clippers",
    lal: "Lakers",
    mem: "Grizzlies",
    mia: "Heat",
    mil: "Bucks",
    min: "Timberwolves",
    nop: "Pelicans",
    nyk: "Knicks",
    okc: "Thunder",
    orl: "Magic",
    phi: "76ers",
    phx: "Suns",
    por: "Trail Blazers",
    sac: "Kings",
    sas: "Spurs",
    tor: "Raptors",
    uta: "Jazz",
    was: "Wizards",
  },
  // CFB schools are referred to by their abbreviation/school name as-is.
  CFB: {},
};

function displayTeamName(value?: string | null, league?: string) {
  const raw = String(value ?? "").trim();
  const normalized = raw.toLowerCase();
  const leagueMap = LEAGUE_TEAM_NAMES[String(league ?? "").trim().toUpperCase()];
  if (leagueMap) return leagueMap[normalized] ?? raw;
  // Without a league, only resolve names that are unambiguous across leagues.
  const matches = new Set(
    Object.values(LEAGUE_TEAM_NAMES)
      .map((map) => map[normalized])
      .filter((name): name is string => Boolean(name)),
  );
  return matches.size === 1 ? matches.values().next().value! : raw;
}

function teamContextNoun(situation: IntelligenceSituation) {
  if (situation.league === "NFL" || situation.league === "CFB") return "passing-game plan";
  if (situation.league === "NBA") return "rotation plan";
  if (situation.league === "MLB") return "lineup plan";
  return "team plan";
}

function teamPossessive(team: string) {
  return /s$/i.test(team) ? `${team}'` : `${team}'s`;
}

function storyTimingLabel(situation: IntelligenceSituation) {
  if (situation.timing.window === "Early") return "early signal";
  if (situation.timing.window === "Developing") return "developing window";
  if (situation.timing.window === "Widely Known") return "public context";
  if (situation.timing.window === "Closing") return "fully priced";
  if (situation.timing.window === "Stale") return "stale signal";
  return "impact still developing";
}

function editorialHeadline(situation: IntelligenceSituation) {
  const subject = situation.subject.player ?? displayTeamName(situation.subject.team, situation.league) ?? situation.subject.matchup;
  if (situation.marketReaction && subject) return `${subject} confirmation window tightening`;
  if (situation.raw.injury_designation && subject) return `${subject} availability remains on watch`;
  if (situation.raw.lineup_status && subject) return `${subject} lineup status is active`;
  return situation.headline;
}

function overlayRead(situation: IntelligenceSituation) {
  const parts = [
    storyChangeLabel(situation),
    storyTimingLabel(situation),
    situation.marketReaction ? marketReactionLabel(situation) : "impact still developing",
    sourcePostureShortLabel(situation),
  ].filter(Boolean);
  return parts.join(" / ");
}

function sportsFirstHeadline(situation: IntelligenceSituation) {
  const subject = situation.subject.player ?? displayTeamName(situation.subject.team, situation.league) ?? situation.subject.matchup;
  if (subject && situation.marketReaction) return `${subject} confirmation window tightening`;
  if (subject && situation.raw.injury_designation) return `${subject} availability remains on watch`;
  if (subject && situation.raw.lineup_status) return `${subject} lineup status is active`;
  if (subject) return `${subject} is the active sports read`;
  return situation.league === "MLB" ? "Lineups and game status updating" : `${situation.league} board is active`;
}

function implicationLabel(situation: IntelligenceSituation | null) {
  if (!situation?.implications.length) return "No verified escalation yet. EdgeSetter is watching for report agreement, lineup movement, and official confirmation.";
  return situation.implications[0];
}

function leagueWatchLabel(count: number) {
  if (count > 1) return `${count} active updates`;
  if (count === 1) return "One active update";
  return "Quiet board";
}

function compactIntelPhrase(value?: string) {
  if (!value) return undefined;
  const firstSentence = value.split(/[.!?]/)[0]?.trim();
  const phrase = (firstSentence || value.trim()).replace(/\((\d+(\.\d+)?)\/100\)/g, "").replace(/\s{2,}/g, " ").trim();
  if (phrase.length <= 72) return phrase;
  return `${phrase.slice(0, 69).trim()}...`;
}

function PressureSection({ situation, pressure }: { situation: IntelligenceSituation | null; pressure: LivePressureContext }) {
  const windows = situation ? pressureWindowsForSituation(situation) : pressure.pressureWindows;
  const story = situation ? buildPublicSituationStory(situation) : null;

  return (
    <section className="live-intel-pressure" aria-label="Next update window">
      <div className="live-intel-pressure-lead">
        <span>Next update window</span>
        <h2>{story ? story.watchNext : pressure.heroHeadline}</h2>
        <div className="live-intel-pressure-window-list">
          {windows.map((window) => <small key={window}>{window}</small>)}
        </div>
      </div>
      <div className="live-intel-pressure-lanes">
        <div>
          <strong>What changed</strong>
          <p>{story ? story.whatHappened : pressure.changed}</p>
        </div>
        <div>
          <strong>Who reacts</strong>
          <p>{situation ? storyReactionLabel(situation) : pressure.whoReacts}</p>
        </div>
        <div>
          <strong>What could happen next</strong>
          <p>{story ? story.watchNext : pressure.next}</p>
        </div>
      </div>
    </section>
  );
}

function pressureWindowsForSituation(situation: IntelligenceSituation) {
  const windows = [
    situation.timing.window === "Early" ? "early signal" : null,
    situation.raw.lineup_status ? "Lineup window active" : null,
    situation.raw.injury_designation ? "Availability impact watch" : null,
    situation.marketReaction ? `Market reacting ${situation.marketReaction.delta ?? ""}`.trim() : "Impact still developing",
    situation.sourceSummary.count > 1 ? `${situation.sourceSummary.count} reports attached` : null,
  ].filter(Boolean) as string[];
  return windows.slice(0, 3);
}

function storyReactionLabel(situation: IntelligenceSituation) {
  const groups = [
    situation.raw.betting_relevance ? "books" : null,
    situation.raw.fantasy_relevance ? "fantasy managers" : null,
    situation.raw.lineup_status ? "lineup desks" : null,
    situation.raw.injury_designation ? "availability desks" : null,
    "report desks",
  ].filter(Boolean);
  return `${situation.league} ${groups.join(", ")} are watching whether this resolves before public consensus; no read is promoted without confirmation.`;
}

function SourceArc({ situation, counts, pressure }: { situation: IntelligenceSituation | null; counts: Array<{ state: EscalationState; count: number }>; pressure: LivePressureContext }) {
  const activeEscalations = counts.filter(({ count }) => count > 0).slice(0, 3);
  const steps = situation ? sourceStorySteps(situation) : pressure.convergenceSteps;

  return (
    <section className="live-intel-source-arc" aria-label="Report convergence and trust">
      <div className="live-intel-source-arc-copy">
        <span>Report convergence</span>
        <h2>{situation ? publicSourceSummary(situation.sourceSummary.convergence) : pressure.sourceArcTitle}</h2>
        <p>
          {situation
            ? `${situation.sourceSummary.count} reports tracked with ${publicSourceSummary(situation.sourceSummary.convergence).toLowerCase()} and ${publicConfidenceMovementLabel(situation)} confidence movement.`
            : pressure.sourceArcBody}
        </p>
      </div>
      <div className="live-intel-source-arc-meter">
        <div>
          <span>Confidence movement</span>
          <strong>{situation ? publicConfidenceMovementLabel(situation) : "Holding for signal quality"}</strong>
        </div>
        <div>
          <span>Market reacting</span>
          <strong>{situation ? marketReactionLabel(situation) : pressure.market}</strong>
        </div>
        <div>
          <span>Escalation level</span>
          <strong>{activeEscalations.length ? activeEscalations.map(({ state }) => state).join(" / ") : pressure.escalationWatch}</strong>
        </div>
      </div>
      <div className="live-intel-source-steps" aria-label="Source convergence progression">
        {steps.map((step) => (
          <div key={step.label} className={`is-${step.state}`}>
            <i />
            <span>{step.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function sourceStorySteps(situation: IntelligenceSituation): Array<{ label: string; state: "complete" | "active" | "waiting" }> {
  return [
    { label: `${situation.sourceSummary.count || 1} report${situation.sourceSummary.count === 1 ? "" : "s"}`, state: situation.sourceSummary.count > 1 ? "complete" : "active" },
    { label: situation.validators.agreement.includes("strong") ? "Strong report quality" : publicSourceSummary(situation.sourceSummary.convergence), state: situation.sourceSummary.count > 1 ? "complete" : "active" },
    { label: situation.marketReaction ? "Market reacting" : "Impact still developing", state: situation.marketReaction ? "complete" : "waiting" },
    { label: situation.escalationState === "Official" ? "Official confirmation" : "Official not final", state: situation.escalationState === "Official" ? "complete" : "waiting" },
  ];
}

function storyFrameLabel(situation: IntelligenceSituation) {
  if (situation.marketReaction) return "Market reacting";
  if (situation.raw.injury_designation) return "Availability impact watch";
  if (situation.raw.lineup_status) return "Lineup volatility";
  if (situation.raw.weather_note) return "Weather pressure";
  return situation.subject.player ?? situation.subject.team ?? situation.subject.matchup ?? "Team news";
}

function shortTeam(team: string) {
  const parts = team.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1].slice(0, 3).toUpperCase() : team.slice(0, 3).toUpperCase();
}

function cleanShortTeam(team: string) {
  return hasCleanPublicTeamIdentity(team) ? shortTeam(team) : "Team";
}

const liveIntelCss = `
.live-intel-home {
  min-height: 100%;
  background:
    radial-gradient(ellipse 78% 34% at 50% 0%, rgba(203,213,225,0.13), transparent 62%),
    radial-gradient(ellipse 70% 44% at 58% 0%, rgba(111,164,191,0.16), transparent 64%),
    radial-gradient(ellipse 56% 42% at 15% 42%, rgba(24,212,123,0.045), transparent 70%),
    linear-gradient(180deg, var(--es-navy-950), var(--es-ink) 36%, #050505 100%);
  color: var(--es-text-primary);
  padding: 22px 24px 40px;
  position: relative;
  /* overflow:clip contains decorative absolutes without creating a scroll-container
     compositing context — avoids the left-edge artifact on the ticker mask-image. */
  overflow: clip;
}
.live-intel-home::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.18;
  background:
    radial-gradient(ellipse 36% 10% at 24% 0%, rgba(248,250,252,0.16), transparent 70%),
    radial-gradient(ellipse 30% 9% at 72% 0%, rgba(248,250,252,0.12), transparent 74%),
    radial-gradient(ellipse 44% 30% at 86% 26%, rgba(245,184,65,0.08), transparent 66%),
    linear-gradient(180deg, transparent 0 38%, rgba(5,5,5,0.12) 54%, rgba(5,5,5,0.62) 100%);
}
.live-intel-home * {
  min-width: 0;
}
.live-intel-home > section,
.live-intel-home > div:not(.live-intel-atmosphere):not(.live-intel-sport-backdrop) {
  position: relative;
  z-index: 5;
}
.live-intel-sport-backdrop {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}
.live-intel-sport-backdrop svg {
  display: block;
  width: 100%;
  height: 100%;
  opacity: 0;
  animation: es-sport-backdrop-fade 200ms ease forwards;
}
@keyframes es-sport-backdrop-fade {
  to { opacity: 1; }
}
.live-intel-home.league-board-shell::before,
.live-intel-home.league-board-shell::after {
  transition: opacity 200ms ease;
}
.live-intel-home.is-backdrop-fading::before,
.live-intel-home.is-backdrop-fading::after {
  opacity: 0;
}
.media-homepage {
  display: grid;
  gap: 14px;
  width: 100%;
  max-width: 1360px;
  margin: 0 auto 10px;
  box-sizing: border-box;
}
.media-homepage a {
  min-width: 0;
  max-width: 100%;
  color: inherit;
  text-decoration: none;
}
.media-homepage-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 14px 0 6px;
  border-bottom: 1px solid rgba(217,164,65,0.12);
}
.media-homepage-leagues {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  padding: 4px;
  border: 1px solid rgba(82,101,122,0.22);
  border-radius: 999px;
  background: rgba(8,14,22,0.66);
}
.media-homepage-leagues button,
.media-homepage-leagues .media-league-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  padding: 7px 14px;
  border: 1px solid rgba(82, 101, 122, 0.22);
  border-radius: 999px;
  background: rgba(10, 20, 32, 0.52);
  color: var(--es-text-secondary, #94a3b8);
  text-decoration: none;
  cursor: pointer;
  font-family: var(--font-cond);
  font-size: 0.78rem;
  font-weight: 850;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 140ms ease;
}
.media-league-tab-logo {
  width: 20px;
  height: 20px;
  object-fit: contain;
  opacity: 0.5;
  transition: opacity 0.15s ease;
}
.media-homepage-leagues button:hover,
.media-homepage-leagues .media-league-tab:hover {
  color: #cbd5e1;
}
.media-homepage-leagues button:hover .media-league-tab-logo,
.media-homepage-leagues .media-league-tab:hover .media-league-tab-logo {
  opacity: 0.75;
}
.media-homepage-leagues button.is-active,
.media-homepage-leagues .media-league-tab.is-active {
  border-color: rgba(245, 184, 65, 0.42);
  color: var(--es-text-primary, #f8fafc);
  background: rgba(245, 184, 65, 0.10);
  box-shadow: inset 0 -2px 0 rgba(245, 184, 65, 0.55);
}
.media-homepage-leagues button.is-active .media-league-tab-logo,
.media-homepage-leagues .media-league-tab.is-active .media-league-tab-logo {
  opacity: 1;
}
.media-homepage-leagues button strong,
.media-homepage-leagues button span,
.media-homepage-leagues .media-league-tab strong,
.media-homepage-leagues .media-league-tab span {
  display: block;
  line-height: 1.05;
}
.media-homepage-leagues button strong,
.media-homepage-leagues .media-league-tab strong {
  display: none;
}
.media-homepage-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  align-items: start;
  max-width: 100%;
  overflow: hidden;
}
.media-homepage-grid.has-assignment-rail {
  grid-template-columns: minmax(0, 1fr);
}
.media-homepage-grid.has-intel-sidebar,
.media-homepage-grid.has-intel-sidebar.has-assignment-rail {
  grid-template-columns: minmax(0, 1fr) 296px;
}
.media-developing-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}
.media-homepage-sidebar {
  display: grid;
  align-content: start;
  gap: 12px;
  min-width: 0;
}
.sidebar-block {
  display: grid;
  gap: 9px;
  padding: 12px;
  border: 1px solid rgba(82,101,122,0.18);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(9,16,25,0.82), rgba(5,8,12,0.68));
  box-shadow: 0 18px 44px rgba(0,0,0,0.18);
}
.sidebar-block > header {
  color: var(--es-gold, #d9a441);
  font-family: var(--font-cond);
  font-size: 0.66rem;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  border-bottom: 1px solid rgba(245, 184, 65, 0.16);
  padding-bottom: 8px;
}
.sidebar-block > small {
  color: var(--es-text-muted, #64748b);
  font-size: 0.68rem;
  line-height: 1.3;
}
.sidebar-link {
  color: var(--es-brand-green, #18D47B);
  font-size: 0.70rem;
  font-weight: 760;
  text-decoration: none;
}
.sidebar-link:hover {
  color: #5fe8a6;
}
.sidebar-stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}
.sidebar-stat-grid > div {
  min-width: 0;
  padding: 8px;
  border: 1px solid rgba(82, 101, 122, 0.18);
  border-radius: 6px;
  background: rgba(10, 20, 32, 0.52);
}
.sidebar-stat-grid span {
  display: block;
  margin-bottom: 3px;
  color: var(--es-text-muted, #64748b);
  font-family: var(--font-cond);
  font-size: 0.60rem;
  font-weight: 850;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.sidebar-stat-grid strong {
  display: block;
  color: var(--es-brand-green, #18D47B);
  font-family: var(--font-serif);
  font-size: 1.1rem;
  font-weight: 700;
}
.sidebar-stat-grid > div.is-amber strong {
  color: var(--es-amber);
}
.sidebar-games {
  display: grid;
  gap: 6px;
}
.sidebar-game-row {
  display: grid;
  gap: 2px;
  padding: 7px 9px;
  border: 1px solid rgba(82,101,122,0.18);
  border-radius: 6px;
  background: rgba(8,14,22,0.55);
  cursor: pointer;
}
.sidebar-game-row:hover {
  border-color: rgba(245,184,65,0.3);
}
.sidebar-game-row strong {
  color: #f8fafc;
  font-size: 0.78rem;
}
.sidebar-game-row span {
  color: #94a3b8;
  font-size: 0.66rem;
}
.sidebar-game-row em {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  padding: 2px 6px;
  border: 1px solid rgba(230, 180, 80, 0.36);
  border-radius: 4px;
  background: rgba(230, 180, 80, 0.10);
  color: var(--es-amber);
  font-family: var(--font-cond);
  font-size: 0.60rem;
  font-style: normal;
  font-weight: 900;
  letter-spacing: 0.10em;
  text-transform: uppercase;
}
.sidebar-sources {
  display: grid;
  gap: 5px;
}
.sidebar-source-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  border-left: 1px solid rgba(82,101,122,0.26);
  background: rgba(255,255,255,0.015);
}
.sidebar-source-rank {
  color: #64748b;
  font-family: var(--font-cond);
  font-size: 0.72rem;
  font-weight: 900;
}
.sidebar-source-row strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #dbe7f4;
  font-size: 0.74rem;
}
.sidebar-tier-badge {
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid rgba(148,163,184,0.3);
  color: #94a3b8;
  font-family: var(--font-cond);
  font-size: 0.60rem;
  font-style: normal;
  font-weight: 900;
  letter-spacing: 0.08em;
}
.sidebar-tier-badge.is-t1 {
  background: rgba(24, 212, 123, 0.10);
  border-color: rgba(24, 212, 123, 0.24);
  color: #18D47B;
}
.sidebar-tier-badge.is-t2 {
  background: rgba(111, 164, 191, 0.10);
  border-color: rgba(111, 164, 191, 0.24);
  color: #6FA4BF;
}
.sidebar-source-row em {
  color: var(--es-brand-green, #18D47B);
  font-size: 0.72rem;
  font-style: normal;
  font-weight: 800;
}
.sidebar-empty {
  margin: 0;
  color: #94a3b8;
  font-size: 0.72rem;
  line-height: 1.4;
}
/* Bloomberg signal feed rail */
.sidebar-block-bloomberg {
  padding: 10px;
}
.bloomberg-header {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--es-gold, #d9a441);
  font-family: var(--font-mono);
  font-size: 0.60rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  border-bottom: 1px solid rgba(245,184,65,0.14);
  padding-bottom: 7px;
  margin-bottom: 2px;
}
.bloomberg-feed {
  display: grid;
  gap: 0;
}
.bloomberg-row {
  display: grid;
  grid-template-columns: 28px minmax(0,1fr) 48px 38px 22px;
  align-items: center;
  gap: 4px;
  padding: 5px 4px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.bloomberg-row:last-child {
  border-bottom: none;
}
.bloomberg-league {
  color: var(--es-gold, #d9a441);
  font-family: var(--font-mono);
  font-size: 0.60rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.bloomberg-topic {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #cdd7e3;
  font-size: 0.68rem;
  font-weight: 500;
}
.bloomberg-status {
  padding: 2px 4px;
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
  text-transform: uppercase;
}
.bloomberg-status.is-verified {
  background: rgba(24,212,123,0.12);
  color: #18D47B;
  border: 1px solid rgba(24,212,123,0.28);
}
.bloomberg-status.is-escalating {
  background: rgba(230,180,80,0.12);
  color: var(--es-amber);
  border: 1px solid rgba(230,180,80,0.28);
}
.bloomberg-status.is-developing {
  background: rgba(59,130,246,0.10);
  color: #60a5fa;
  border: 1px solid rgba(59,130,246,0.24);
}
.bloomberg-status.is-watch {
  background: rgba(100,116,139,0.10);
  color: #94a3b8;
  border: 1px solid rgba(100,116,139,0.22);
}
.bloomberg-conf {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 700;
  text-align: right;
}
.bloomberg-conf.is-verified { color: #18D47B; }
.bloomberg-conf.is-strong { color: var(--es-amber); }
.bloomberg-conf.is-developing { color: var(--es-forming); }
.bloomberg-conf.is-forming { color: #64748b; }
.bloomberg-sources {
  display: none;
}
.bloomberg-time {
  color: #475569;
  font-family: var(--font-mono);
  font-size: 0.60rem;
  text-align: right;
}
.bloomberg-empty {
  margin: 0;
  padding: 6px 4px;
  color: #475569;
  font-family: var(--font-mono);
  font-size: 0.66rem;
}
/* Confidence journey mini-timeline (lead card) */
.conf-journey {
  display: flex;
  align-items: flex-start;
  gap: 0;
  padding: 8px 0 6px;
}
.conf-journey-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 56px;
}
.conf-journey-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px solid #334155;
  background: #1e293b;
  transition: border-color 0.2s, background 0.2s;
}
.conf-journey-node.is-complete .conf-journey-dot {
  background: #18D47B;
  border-color: #18D47B;
}
.conf-journey-node.is-active .conf-journey-dot {
  background: var(--es-amber);
  border-color: var(--es-amber);
  box-shadow: 0 0 6px rgba(230,180,80,0.5);
}
.conf-journey-time {
  font-family: var(--font-mono);
  font-size: 0.56rem;
  color: #64748b;
  white-space: nowrap;
}
.conf-journey-node.is-complete .conf-journey-time { color: #18D47B; }
.conf-journey-node.is-active .conf-journey-time { color: var(--es-amber); }
.conf-journey-time-blank { opacity: 0.3; }
.conf-journey-label {
  font-family: var(--font-mono);
  font-size: 0.56rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #475569;
}
.conf-journey-node.is-complete .conf-journey-label { color: #94a3b8; }
.conf-journey-node.is-active .conf-journey-label { color: var(--es-amber); }
.conf-journey-line {
  flex: 1;
  height: 2px;
  margin-top: 3px;
  background: #1e293b;
  border-radius: 1px;
  align-self: flex-start;
  min-width: 12px;
}
.conf-journey-line.is-filled { background: #18D47B; }
/* Story intel strip (lead card, always visible) */
.story-intel-strip {
  display: grid;
  gap: 0;
  padding: 0 0 4px;
  border-top: 1px solid rgba(82,101,122,0.18);
  margin-top: 4px;
}
.story-intel-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding-top: 6px;
}
.story-intel-sources-count,
.story-intel-agents-count,
.story-intel-agreement,
.story-intel-timing-edge {
  font-family: var(--font-mono);
  font-size: 0.64rem;
  white-space: nowrap;
}
.story-intel-sources-count { color: #94a3b8; }
.story-intel-agents-count { color: #94a3b8; }
.story-intel-agreement { color: #18D47B; }
.story-intel-timing-edge { color: var(--es-amber); font-weight: 700; }
.story-intel-sep {
  color: #334155;
  font-style: normal;
  font-size: 0.64rem;
  user-select: none;
}
/* Status color overrides: confidence tone classes */
.story-card-conf.is-forming { color: var(--es-forming); }
.story-card-conf.is-strong { color: var(--es-amber); }
.media-homepage-main,
.media-homepage-rail,
.media-game-context,
.media-league-section {
  position: relative;
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid rgba(82,101,122,0.18);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(9,16,25,0.82), rgba(5,8,12,0.68));
  box-shadow: 0 18px 44px rgba(0,0,0,0.18);
}
.media-homepage-main {
  display: grid;
  align-content: start;
  gap: 10px;
  padding: 12px;
}
.media-homepage-rail {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
  padding: 12px;
}
.media-homepage-rail .media-section-label {
  grid-column: 1 / -1;
}
.media-section-label {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
  color: #f5b841;
  font-family: var(--font-sans);
  font-size: 0.72rem;
  font-weight: 780;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.media-game-context,
.media-league-section {
  overflow: hidden;
}
.media-game-grid,
.media-league-story-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  padding: 10px;
}
.media-coverage-status {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-height: 104px;
  padding: 12px;
  border: 1px solid rgba(82,101,122,0.24);
  border-left: 2px solid var(--league-color);
  border-radius: 7px;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--league-color) 9%, transparent), transparent 54%),
    rgba(8,14,22,0.72);
  color: #f8fafc;
}
.media-coverage-status img {
  width: 42px;
  height: 42px;
  object-fit: contain;
  opacity: 0.86;
}
.media-coverage-status span,
.media-coverage-status small {
  display: block;
  color: #94a3b8;
}
.media-coverage-status span {
  color: var(--league-color);
  font-family: var(--font-cond);
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}
.media-coverage-status strong {
  display: block;
  margin-top: 3px;
  color: #f8fafc;
  font-family: var(--font-cond);
  font-size: 1rem;
  line-height: 1.08;
  text-transform: uppercase;
}
.media-coverage-status small {
  margin-top: 5px;
  font-size: 0.75rem;
  line-height: 1.35;
}
.media-league-sections {
  display: grid;
  max-width: 1360px;
  margin: 14px auto 0;
  gap: 12px;
}
.media-league-story-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.story-card {
  display: grid;
  gap: 12px;
  height: 100%;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 12px;
  border: 1px solid rgba(82,101,122,0.20);
  border-radius: 7px;
  background:
    linear-gradient(90deg, rgba(245,184,65,0.04), transparent 32%),
    linear-gradient(180deg, rgba(12,20,31,0.9), rgba(6,10,15,0.82));
  color: #f8fafc;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s ease, transform 0.15s ease, background 0.15s ease;
}
.story-card:hover {
  border-color: rgba(245,184,65,0.34);
  transform: translateY(-1px);
  background: linear-gradient(180deg, rgba(14,24,36,0.94), rgba(7,12,18,0.84));
}
.story-card-lead {
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  min-height: 0;
  padding: 0;
  gap: 0;
}
.story-card-lead .story-card-visual {
  position: relative;
  height: auto;
}
.story-card-lead .story-card-visual .sports-story-visual {
  min-height: 220px;
  border-radius: 7px 7px 0 0;
}
.story-hero-timing-banner {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3;
  padding: 6px 14px;
  background: rgba(29,158,117,0.12);
  border-top: 0.5px solid rgba(29,158,117,0.2);
  color: #1D9E75;
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
}
.story-card-lead .story-card-copy {
  padding: 14px 16px 12px;
}
.story-card-kicker-time {
  color: #64748b;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.06em;
}
.story-intel-zone {
  display: grid;
  gap: 9px;
  padding: 12px 16px 14px;
  background: rgba(24,212,123,0.04);
  border-top: 1px solid rgba(24,212,123,0.14);
}
.story-intel-zone-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: var(--font-cond);
  font-size: 0.66rem;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--es-brand-green, #18D47B);
}
.story-intel-zone-label span {
  color: var(--es-text-muted, #64748b);
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: none;
  font-family: var(--font-sans);
  font-size: 0.72rem;
}
.story-intel-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.story-intel-stats > div {
  min-width: 0;
  padding: 7px 9px;
  border-left: 1px solid rgba(29,158,117,0.18);
  background: rgba(255,255,255,0.015);
}
.story-intel-stats span {
  display: block;
  margin-bottom: 3px;
  color: #64748b;
  font-family: var(--font-sans);
  font-size: 0.58rem;
  font-weight: 760;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.story-intel-stats strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #dbe7f4;
  font-size: 0.8rem;
  line-height: 1.2;
}
.story-card-conf.is-verified,
.story-card-conf.is-strong {
  color: #1D9E75;
}
.story-card-conf.is-developing {
  color: #f5b841;
}
.story-card-conf.is-forming,
.story-card-conf.is-pending {
  color: #94a3b8;
}
.story-intel-agents {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #94a3b8;
  font-size: 0.7rem;
  font-weight: 700;
}
.story-intel-agents i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1px solid rgba(29,158,117,0.45);
  background: transparent;
}
.story-intel-agents i.is-filled {
  background: #1D9E75;
  border-color: #1D9E75;
}
.story-intel-agents span {
  margin-left: 5px;
}
.story-intel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.story-intel-actions button {
  padding: 5px 11px;
  border: 1px solid rgba(29,158,117,0.28);
  border-radius: 999px;
  background: rgba(29,158,117,0.06);
  color: #9fd6c2;
  font-family: var(--font-sans);
  font-size: 0.68rem;
  font-weight: 760;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.story-intel-actions button:hover {
  background: rgba(29,158,117,0.14);
  color: #d4f2e6;
}
.story-intel-actions button.is-open {
  background: rgba(29,158,117,0.2);
  border-color: rgba(29,158,117,0.5);
  color: #eafff5;
}
.story-intel-panel {
  margin: 0;
  padding: 8px 10px;
  border-left: 2px solid rgba(29,158,117,0.4);
  background: rgba(29,158,117,0.05);
  color: #cbd5e1;
  font-size: 0.78rem;
  line-height: 1.45;
}
.story-card-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
  font-family: var(--font-sans);
  font-size: 0.7rem;
  font-weight: 800;
}
.story-card-agents {
  color: #94a3b8;
}
.story-card-footer .story-card-conf {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.story-card-footer .story-card-conf.is-verified,
.story-card-footer .story-card-conf.is-strong {
  background: rgba(24, 212, 123, 0.12);
  color: #18D47B;
  border: 1px solid rgba(24, 212, 123, 0.28);
}
.story-card-footer .story-card-conf.is-developing {
  background: rgba(230, 180, 80, 0.12);
  color: var(--es-amber);
  border: 1px solid rgba(230, 180, 80, 0.28);
}
.story-card-footer .story-card-conf.is-forming,
.story-card-footer .story-card-conf.is-pending {
  background: rgba(100, 116, 139, 0.12);
  color: #94A3B8;
  border: 1px solid rgba(100, 116, 139, 0.22);
}
.story-card-timing-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border: 1px solid rgba(45, 212, 191, 0.28);
  border-radius: 4px;
  background: rgba(45, 212, 191, 0.08);
  color: #2DD4BF;
  font-size: 0.66rem;
  font-weight: 800;
}
.story-card-visual,
.story-card-visual .sports-story-visual {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
.story-card-visual .sports-story-visual-copy,
.story-card-visual .sports-story-visual-top {
  max-width: 100%;
}
.story-card-rail .edge-overlay,
.story-card-compact .edge-overlay {
  padding-top: 6px;
}
.story-card-rail,
.story-card-compact {
  gap: 7px;
  padding: 9px;
}
.story-card-compact {
  grid-template-columns: 118px minmax(0, 1fr);
}
.story-card-rail .story-card-visual .sports-story-visual {
  min-height: 76px;
  padding: 7px;
}
.story-card-rail .sports-story-visual-top,
.story-card-rail .sports-story-visual-copy {
  display: none;
}
.story-card-rail .sports-story-visual-stage {
  padding: 5px 0 4px;
}
.story-card-compact .story-card-visual .sports-story-visual {
  min-height: 126px;
  padding: 9px;
}
.story-card-compact .story-card-visual .sports-story-visual-top strong,
.story-card-compact .story-card-visual .sports-story-visual-copy small {
  display: none;
}
.story-card-compact .story-card-visual .sports-story-visual-stage {
  padding: 7px 0 5px;
}
.story-card-compact .story-card-visual .sports-story-visual-copy strong {
  font-size: 0.82rem;
  line-height: 1.05;
}
.story-card-copy {
  display: grid;
  align-content: start;
  gap: 6px;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
}
.story-card-context {
  display: -webkit-box;
  overflow: hidden;
  color: #94a3b8;
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 1.25;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: normal;
}
.story-card-lead .story-card-context {
  color: #f5b841;
  font-family: var(--font-cond);
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.story-card-context + p {
  margin-top: -2px;
}
.story-card-kicker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: #94a3b8;
  font-family: var(--font-sans);
  font-size: 0.7rem;
  font-weight: 760;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.story-card-kicker span {
  color: #f5b841;
}
.story-card h2 {
  margin: 0;
  width: 100%;
  max-width: 100%;
  color: #f8fafc;
  font-family: var(--font-sans);
  font-size: 1.12rem;
  font-weight: 780;
  letter-spacing: 0;
  line-height: 1.03;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: normal;
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.story-card-lead h2 {
  font-family: var(--font-serif);
  font-size: clamp(1.375rem, 2.2vw, 1.875rem);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
  margin: 8px 0 6px;
  -webkit-line-clamp: 3;
}
.story-headline-accent {
  color: var(--es-gold, #d9a441);
}
.story-card-lead .story-card-kicker {
  font-family: var(--font-cond);
  font-size: 0.72rem;
  font-weight: 850;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--es-gold, #d9a441);
  gap: 8px;
  margin-bottom: 6px;
}
.story-card-lead .story-card-kicker span,
.story-card-lead .story-card-kicker strong {
  color: var(--es-gold, #d9a441);
}
.story-card-kicker-sep {
  color: var(--es-text-muted, #64748b);
  font-style: normal;
}
.story-card-lead .story-card-copy > p {
  font-size: 0.9375rem;
  color: var(--es-text-secondary, #94a3b8);
}
.story-card-lead .story-card-reads {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(82,101,122,0.22);
}
.story-card-lead .story-card-reads div {
  min-height: 0;
  padding: 0;
  border-left: 0;
  background: transparent;
}
.story-card-lead .story-card-reads span {
  font-family: var(--font-cond);
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  margin-bottom: 3px;
}
.story-card-lead .story-card-reads strong {
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--es-text-secondary, #94a3b8);
  line-height: 1.35;
  -webkit-line-clamp: 3;
}
.story-card-rail h2 {
  font-size: 0.75rem;
  line-height: 1.18;
  -webkit-line-clamp: 2;
}
.story-card-compact h2 {
  font-size: 0.98rem;
  line-height: 1.08;
}
.story-card-compact p,
.story-card-rail p {
  font-size: 0.78rem;
  line-height: 1.36;
}
.story-card p {
  margin: 0;
  color: #cbd5e1;
  font-size: 0.94rem;
  line-height: 1.55;
}
.story-card-reads {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.story-card-rail .story-card-reads,
.story-card-compact .story-card-reads {
  grid-template-columns: 1fr;
}
.story-card-rail .story-card-reads,
.story-card-rail .story-card-copy > p {
  display: none;
}
.story-card-compact .story-card-reads div:nth-child(n+2) {
  display: none;
}
.story-card-reads div {
  min-height: 48px;
  padding: 7px 9px;
  border-left: 1px solid rgba(82,101,122,0.22);
  background: rgba(255,255,255,0.018);
}
.story-card-reads span {
  display: block;
  margin-bottom: 4px;
  color: #64748b;
  font-family: var(--font-sans);
  font-size: 0.58rem;
  font-weight: 760;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.story-card-reads strong {
  display: -webkit-box;
  overflow: hidden;
  color: #dbe7f4;
  font-size: 0.76rem;
  line-height: 1.28;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.story-impact-details {
  align-self: start;
}
.story-card-rail .story-impact-details,
.story-card-compact .story-impact-details {
  margin-top: 2px;
}
.media-homepage-support {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.media-homepage-support div {
  min-width: 0;
  border: 1px solid rgba(82,101,122,0.18);
  border-left: 2px solid rgba(245,184,65,0.5);
  border-radius: 6px;
  background: rgba(8,14,22,0.55);
  padding: 8px 9px;
}
.media-homepage-support span {
  display: block;
  color: #f5b841;
  font-family: var(--font-cond);
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.media-homepage-support strong {
  display: -webkit-box;
  margin-top: 4px;
  overflow: hidden;
  color: #dbe7f4;
  font-size: 0.76rem;
  line-height: 1.24;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.media-dive-deeper {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid rgba(82,101,122,0.18);
}
.media-dive-deeper-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}
.media-dive-deeper-links .btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.edge-overlay {
  display: grid;
  gap: 6px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 8px 0 0;
  border: 0;
  border-top: 1px solid rgba(111,164,191,0.22);
  border-radius: 0;
  background:
    linear-gradient(90deg, rgba(24,212,123,0.018), transparent 42%);
}
.edge-overlay-top,
.edge-overlay-replay {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #94a3b8;
  font-size: 0.68rem;
  font-weight: 800;
}
.edge-overlay-status {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 4px 8px;
  border: 1px solid rgba(148,163,184,0.28);
  border-radius: 999px;
  color: #94a3b8;
  font-family: var(--font-cond);
  font-size: 0.64rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.edge-overlay-grid,
.edge-overlay-primitives {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.edge-overlay-primitives {
  grid-template-columns: 1fr 1fr;
}
.edge-overlay-grid div {
  display: grid;
  gap: 3px;
  padding: 0 8px 0 0;
  border: 0;
  border-right: 1px solid rgba(82,101,122,0.22);
  border-radius: 0;
  background: transparent;
}
.edge-overlay-grid div:last-child {
  border-right: 0;
}
.edge-overlay-grid svg,
.edge-overlay-replay svg {
  color: #6fa4bf;
}
.edge-overlay-grid span {
  color: #64748b;
  font-family: var(--font-sans);
  font-size: 0.6rem;
  font-weight: 740;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.edge-overlay-grid strong,
.edge-overlay-replay span {
  overflow: hidden;
  color: #dbe7f4;
  font-size: 0.72rem;
  line-height: 1.28;
  text-overflow: ellipsis;
}
/* The lead intel zone's stat row already shows confidence/sources/timing, so
   the generic overlay grid is hidden there to avoid duplicate readouts. */
.story-card-lead .edge-overlay-primitives,
.story-card-lead .edge-overlay-grid,
.story-card-lead .edge-overlay-replay,
.story-card-lead .edge-overlay .agent-calibration-badge + * {
  display: none;
}
.story-card-lead .edge-overlay {
  padding-top: 6px;
}
.edge-overlay.is-compact .edge-overlay-grid {
  grid-template-columns: 1fr;
}
.edge-overlay.is-compact .edge-overlay-grid div:nth-child(n+3) {
  display: none;
}
.story-card-rail .edge-overlay-grid {
  display: none;
}
.story-card-rail .edge-overlay-replay {
  display: none;
}
.story-card-rail .agent-calibration-badge {
  max-width: 100%;
}
.media-quiet-card {
  display: grid;
  gap: 7px;
  min-height: 148px;
  place-items: center;
  padding: 18px;
  border: 1px solid rgba(82,101,122,0.24);
  border-radius: 7px;
  background: rgba(10,18,28,0.62);
  color: #94a3b8;
  text-align: center;
}
.media-quiet-card svg {
  color: #18d47b;
}
.media-quiet-card strong {
  color: #f8fafc;
}
.homepage-quiet-lead {
  display: grid;
  gap: 14px;
  padding: 20px;
  border: 1px solid rgba(82,101,122,0.24);
  border-radius: 8px;
  background: rgba(9,16,25,0.58);
}
.homepage-quiet-lead-hd {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #18d47b;
  font-family: var(--font-cond);
  font-size: 0.70rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.homepage-quiet-lead-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.homepage-quiet-league-tile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(82,101,122,0.18);
  border-radius: 6px;
  background: rgba(8,14,22,0.48);
  color: #94a3b8;
  text-decoration: none;
  transition: border-color 140ms ease, background 140ms ease;
}
.homepage-quiet-league-tile:hover {
  border-color: rgba(245,184,65,0.28);
  background: rgba(8,14,22,0.72);
}
.homepage-quiet-league-tile img {
  flex: 0 0 auto;
  opacity: 0.55;
}
.homepage-quiet-league-tile > div {
  min-width: 0;
}
.homepage-quiet-league-tile strong {
  display: block;
  color: #e2e8f0;
  font-family: var(--font-cond);
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  line-height: 1.1;
}
.homepage-quiet-league-tile span {
  display: block;
  font-size: 0.72rem;
  line-height: 1.3;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.homepage-quiet-league-tile small {
  display: block;
  color: #475569;
  font-size: 0.63rem;
  margin-top: 3px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.homepage-quiet-lead-note {
  margin: 0;
  padding-top: 10px;
  border-top: 1px solid rgba(82,101,122,0.14);
  color: #475569;
  font-size: 0.70rem;
  line-height: 1.5;
}
@media (max-width: 1100px) {
  .media-homepage-grid,
  .media-homepage-grid.has-assignment-rail,
  .media-homepage-grid.has-intel-sidebar,
  .media-homepage-grid.has-intel-sidebar.has-assignment-rail,
  .story-card-lead {
    grid-template-columns: minmax(0, 1fr);
  }
  .media-game-grid,
  .media-league-story-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .media-homepage-support {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .media-homepage-rail {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 760px) {
  .live-intel-home {
    width: 100vw;
    max-width: 100vw;
    box-sizing: border-box;
    overflow-x: hidden;
    padding: 8px 12px calc(116px + env(safe-area-inset-bottom, 0px));
  }
  .media-homepage {
    gap: 9px;
    width: calc(100vw - 24px);
    margin-bottom: 10px;
    max-width: calc(100vw - 24px);
    overflow: hidden;
  }
  .media-homepage-header {
    display: grid;
    gap: 8px;
    padding-top: 8px;
  }
  .media-homepage-header .live-intel-brand-anchor {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }
  .media-homepage-header .live-intel-brand-anchor span {
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .media-homepage-leagues {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    justify-content: stretch;
    width: 100%;
    max-width: 100%;
  }
  .media-homepage-leagues button,
  .media-homepage-leagues .media-league-tab {
    min-height: 34px;
    padding: 6px 9px;
    text-align: left;
  }
  .media-homepage-main,
  .media-homepage-rail {
    width: 100%;
    max-width: 100%;
    padding: 8px;
  }
  .media-homepage-grid,
  .media-league-sections,
  .media-game-context,
  .media-league-section {
    width: 100%;
    max-width: 100%;
  }
  .media-game-grid,
  .media-league-story-grid {
    grid-template-columns: 1fr;
    padding: 8px;
  }
  .story-card {
    padding: 9px;
  }
  .story-card-copy {
    width: 100%;
    max-width: 100%;
    overflow: hidden;
  }
  .story-card-lead {
    padding: 0;
    gap: 0;
  }
  /* Mobile drops the hero art but keeps the North Star timing banner visible. */
  .story-card-lead .story-card-visual .sports-story-visual {
    display: none;
  }
  .story-card-lead .story-hero-timing-banner {
    position: static;
    border-radius: 7px 7px 0 0;
  }
  .story-card-lead .story-card-copy {
    padding: 10px 12px 9px;
  }
  .story-intel-zone {
    padding: 10px 12px 12px;
  }
  .story-intel-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .story-card-compact {
    grid-template-columns: 94px minmax(0, 1fr);
  }
  .story-card-compact .story-card-visual .sports-story-visual {
    min-height: 112px;
    padding: 8px;
  }
  .story-card-compact .story-card-visual .sports-story-visual-top span {
    font-size: 0.58rem;
  }
  .story-card-compact .story-card-visual .sports-story-visual-copy strong {
    font-size: 0.72rem;
  }
  .story-card-visual .sports-story-visual {
    min-height: 118px;
    max-width: 100%;
  }
  .story-card-visual .sports-story-visual-copy strong,
  .story-card-visual .sports-story-visual-copy small,
  .story-card-visual .sports-story-visual-top strong {
    display: block;
    width: min(260px, calc(100vw - 128px));
    max-width: min(260px, calc(100vw - 128px));
    white-space: normal !important;
    overflow-wrap: normal;
    word-break: normal;
    text-overflow: clip;
  }
  article.story-card.story-card-lead .story-card-copy > h2 {
    display: -webkit-box;
    overflow: hidden;
    width: min(100%, calc(100vw - 72px));
    max-width: calc(100vw - 72px);
    font-size: 1.12rem;
    line-height: 1.08;
    margin-top: 0;
    white-space: normal !important;
    overflow-wrap: anywhere;
    word-break: break-word;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .story-card-lead .story-card-context {
    font-size: 0.68rem;
    line-height: 1.16;
  }
  .story-card-lead p {
    font-size: 0.76rem;
    line-height: 1.28;
    display: -webkit-box;
    overflow: hidden;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
  }
  .story-card-lead .story-card-reads,
  .story-card-lead .edge-overlay {
    display: none;
  }
  .story-card-lead .story-impact-details summary {
    font-size: 0.58rem;
  }
  .media-homepage-support {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .media-homepage-support div:nth-child(n+3) {
    display: none;
  }
  .media-developing-grid {
    grid-template-columns: 1fr;
  }
  .story-card p {
    width: 100%;
    max-width: 100%;
    font-size: 0.88rem;
    line-height: 1.52;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: normal;
  }
  .story-card-context {
    width: 100%;
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .story-card-reads strong {
    max-width: 100%;
  }
  .story-card-reads,
  .edge-overlay-grid,
  .edge-overlay-primitives {
    grid-template-columns: 1fr;
  }
  .story-card-reads div:nth-child(n+3) {
    display: none;
  }
  .edge-overlay-primitives .live-intel-source-chain {
    display: none;
  }
}
.live-intel-atmosphere {
  position: fixed;
  inset: 48px 0 0 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  background:
    radial-gradient(ellipse 64% 38% at 58% 0%, rgba(111, 164, 191, 0.10), transparent 60%),
    radial-gradient(ellipse 44% 42% at 12% 18%, rgba(24, 212, 123, 0.045), transparent 64%),
    linear-gradient(180deg, rgba(7, 16, 25, 0.88), rgba(5,5,5,0.96) 58%, #050505 100%);
}
.live-intel-atmosphere::before {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0.07;
  background-image:
    radial-gradient(ellipse 46% 16% at 50% 18%, rgba(248,250,252,0.075), transparent 70%),
    linear-gradient(rgba(148, 163, 184, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.035) 1px, transparent 1px);
  background-size: 100% 100%, 72px 72px, 72px 72px;
  mask-image: linear-gradient(180deg, black, rgba(0,0,0,0.65) 34%, transparent 82%);
}
.live-intel-atmosphere::after {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0.06;
  background-image:
    linear-gradient(18deg, transparent 0 42%, rgba(203,213,225,0.16) 42.2%, transparent 42.55%),
    linear-gradient(-24deg, transparent 0 56%, rgba(245,184,65,0.13) 56.2%, transparent 56.55%),
    repeating-linear-gradient(90deg, transparent 0 76px, rgba(245, 184, 65, 0.22) 77px, transparent 78px),
    repeating-linear-gradient(0deg, transparent 0 32px, rgba(0, 230, 118, 0.11) 33px, transparent 34px);
  transform: perspective(900px) rotateX(54deg) translateY(-18%);
  transform-origin: 50% 0%;
}
.live-intel-atmosphere-stadium {
  position: absolute;
  inset: -8% -8% auto -8%;
  height: 42%;
  opacity: 0.14;
  background:
    radial-gradient(ellipse 12% 42% at 14% 0%, rgba(248,250,252,0.24), transparent 70%),
    radial-gradient(ellipse 14% 42% at 36% 0%, rgba(248,250,252,0.18), transparent 72%),
    radial-gradient(ellipse 16% 44% at 66% 0%, rgba(248,250,252,0.20), transparent 72%),
    radial-gradient(ellipse 12% 42% at 86% 0%, rgba(248,250,252,0.16), transparent 72%),
    linear-gradient(180deg, rgba(203,213,225,0.10), transparent 54%);
  filter: none;
}
.live-intel-atmosphere-crowd {
  position: absolute;
  left: -6%;
  right: -6%;
  top: 8%;
  height: 28%;
  opacity: 0.09;
  background:
    radial-gradient(circle at 8% 70%, rgba(248,250,252,0.18) 0 1px, transparent 2px),
    radial-gradient(circle at 18% 58%, rgba(245,184,65,0.14) 0 1px, transparent 2px),
    radial-gradient(circle at 31% 66%, rgba(111,164,191,0.16) 0 1px, transparent 2px),
    radial-gradient(circle at 47% 60%, rgba(248,250,252,0.14) 0 1px, transparent 2px),
    radial-gradient(circle at 63% 70%, rgba(24,212,123,0.12) 0 1px, transparent 2px),
    radial-gradient(circle at 79% 58%, rgba(248,250,252,0.14) 0 1px, transparent 2px),
    radial-gradient(circle at 92% 68%, rgba(245,184,65,0.12) 0 1px, transparent 2px);
  background-size: 76px 34px;
  filter: blur(0.4px);
  mask-image: linear-gradient(180deg, transparent, black 30%, transparent 92%);
}
.live-intel-atmosphere-field {
  position: absolute;
  left: -10%;
  right: -10%;
  top: 8%;
  height: 58%;
  opacity: 0.08;
  background:
    radial-gradient(ellipse 70% 24% at 50% 72%, rgba(24,212,123,0.12), transparent 68%),
    repeating-linear-gradient(90deg, rgba(24,90,54,0.06) 0 7%, rgba(8,45,30,0.10) 7% 14%),
    linear-gradient(90deg, transparent 0 12%, rgba(203, 213, 225, 0.3) 12.2%, transparent 12.4% 87.6%, rgba(203, 213, 225, 0.3) 87.8%, transparent 88%),
    repeating-linear-gradient(90deg, transparent 0 9.8%, rgba(203, 213, 225, 0.22) 10%, transparent 10.2%),
    linear-gradient(180deg, transparent 48%, rgba(203, 213, 225, 0.22) 49%, transparent 50%);
  transform: perspective(1100px) rotateX(58deg) translateY(-10%);
  border: 1px solid rgba(203, 213, 225, 0.14);
}
.live-intel-atmosphere-diamond {
  position: absolute;
  right: 6%;
  top: 13%;
  width: min(42vw, 520px);
  aspect-ratio: 1;
  opacity: 0.08;
  transform: rotate(45deg);
  border: 1px solid rgba(245, 184, 65, 0.36);
  background:
    radial-gradient(circle at 50% 50%, rgba(245, 184, 65, 0.18) 0 2px, transparent 3px),
    linear-gradient(45deg, transparent 49.6%, rgba(245, 184, 65, 0.28) 50%, transparent 50.4%),
    linear-gradient(-45deg, transparent 49.6%, rgba(245, 184, 65, 0.18) 50%, transparent 50.4%);
}
.live-intel-atmosphere-diamond::before,
.live-intel-atmosphere-diamond::after {
  content: "";
  position: absolute;
  border: 1px solid rgba(245, 184, 65, 0.22);
}
.live-intel-atmosphere-diamond::before {
  inset: 18%;
}
.live-intel-atmosphere-diamond::after {
  inset: 36%;
  border-radius: 999px;
}
.live-intel-atmosphere-routes {
  position: absolute;
  left: 4%;
  bottom: 14%;
  width: min(58vw, 760px);
  height: 38%;
  opacity: 0.08;
  background:
    radial-gradient(ellipse 72% 92% at 8% 92%, transparent 48%, rgba(111, 164, 191, 0.24) 49%, transparent 50%),
    radial-gradient(ellipse 50% 70% at 38% 94%, transparent 48%, rgba(111, 164, 191, 0.18) 49%, transparent 50%),
    linear-gradient(32deg, transparent 0 44%, rgba(203, 213, 225, 0.2) 44.4%, transparent 45%),
    linear-gradient(12deg, transparent 0 52%, rgba(245, 184, 65, 0.22) 52.4%, transparent 53%);
}
.live-intel-atmosphere-routes::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 14% 82%, rgba(24, 212, 123, 0.46) 0 3px, transparent 4px),
    radial-gradient(circle at 34% 62%, rgba(111, 164, 191, 0.36) 0 3px, transparent 4px),
    radial-gradient(circle at 61% 38%, rgba(217, 164, 65, 0.32) 0 3px, transparent 4px);
}
.live-intel-atmosphere-athlete {
  position: absolute;
  right: 9%;
  top: 18%;
  width: min(24vw, 280px);
  height: min(42vw, 520px);
  opacity: 0.07;
  filter: none;
  background:
    radial-gradient(ellipse 28% 13% at 50% 8%, rgba(248,250,252,0.75), transparent 72%),
    radial-gradient(ellipse 18% 24% at 50% 30%, rgba(248,250,252,0.58), transparent 74%),
    linear-gradient(102deg, transparent 0 41%, rgba(248,250,252,0.42) 42% 47%, transparent 49%),
    linear-gradient(72deg, transparent 0 50%, rgba(248,250,252,0.35) 51% 55%, transparent 57%),
    linear-gradient(16deg, transparent 0 48%, rgba(248,250,252,0.42) 49% 53%, transparent 55%),
    linear-gradient(-16deg, transparent 0 48%, rgba(248,250,252,0.34) 49% 53%, transparent 55%);
  mask-image: linear-gradient(180deg, transparent 0%, black 12%, black 72%, transparent 100%);
}
.live-intel-atmosphere-sideline {
  position: absolute;
  left: 5%;
  right: 4%;
  bottom: 10%;
  height: 28%;
  opacity: 0.08;
  background:
    radial-gradient(ellipse 8% 38% at 16% 48%, rgba(248,250,252,0.34), transparent 72%),
    radial-gradient(ellipse 6% 34% at 24% 52%, rgba(248,250,252,0.24), transparent 74%),
    radial-gradient(ellipse 7% 36% at 78% 50%, rgba(248,250,252,0.28), transparent 74%),
    linear-gradient(90deg, transparent 0 9%, rgba(203,213,225,0.18) 9.2%, transparent 9.5% 22%, rgba(245,184,65,0.14) 22.3%, transparent 22.6% 76%, rgba(203,213,225,0.16) 76.3%, transparent 76.6%);
  filter: none;
  mask-image: linear-gradient(180deg, transparent, black 18%, rgba(0,0,0,0.64) 70%, transparent);
}
.live-intel-atmosphere-scoreline {
  position: absolute;
  left: 7%;
  right: 7%;
  top: 47%;
  height: 1px;
  opacity: 0.14;
  background: linear-gradient(90deg, transparent, rgba(24,212,123,0.58) 18%, rgba(245,184,65,0.36) 54%, rgba(111,164,191,0.42) 78%, transparent);
  box-shadow:
    0 42px 0 rgba(148,163,184,0.07),
    0 110px 0 rgba(148,163,184,0.045),
    0 180px 0 rgba(148,163,184,0.035);
}
.live-intel-atmosphere-lights {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 26% 10% at 28% 0%, rgba(248, 250, 252, 0.08), transparent 72%),
    radial-gradient(ellipse 22% 9% at 76% 0%, rgba(248, 250, 252, 0.07), transparent 74%),
    radial-gradient(ellipse 84% 58% at 50% 52%, transparent 18%, rgba(5, 5, 5, 0.44) 70%, rgba(5, 5, 5, 0.86) 100%);
  animation: ambientSportDrift 18s ease-in-out infinite alternate;
}
.live-intel-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 0.52fr);
  gap: clamp(18px, 3vw, 40px);
  align-items: stretch;
  min-height: clamp(430px, 54vh, 560px);
  padding: clamp(20px, 3vw, 38px);
  border: 0;
  border-radius: 0;
  background:
    linear-gradient(90deg, rgba(5,5,5,0.78), rgba(5,7,10,0.58) 48%, rgba(5,5,5,0.72)),
    radial-gradient(ellipse 42% 38% at 68% 22%, rgba(24,212,123,0.10), transparent 68%),
    radial-gradient(ellipse 58% 56% at 28% 4%, rgba(111,164,191,0.10), transparent 70%);
  box-shadow: inset 0 -1px 0 rgba(148,163,184,0.12);
  overflow: hidden;
}
.live-intel-hero::before {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0.16;
  background:
    linear-gradient(115deg, transparent 0 34%, rgba(245,184,65,0.18) 34.2%, transparent 34.6% 54%, rgba(24,212,123,0.16) 54.2%, transparent 54.6%),
    repeating-linear-gradient(90deg, transparent 0 70px, rgba(203,213,225,0.10) 71px, transparent 72px),
    repeating-linear-gradient(0deg, transparent 0 30px, rgba(24,212,123,0.06) 31px, transparent 32px);
  transform: perspective(980px) rotateX(54deg) translateY(-18%);
  transform-origin: 50% 0%;
  pointer-events: none;
}
.live-intel-hero::after {
  content: "";
  position: absolute;
  inset: 9% 0 0 34%;
  pointer-events: none;
  opacity: 0.08;
  background:
    radial-gradient(ellipse 20% 38% at 56% 24%, rgba(248,250,252,0.26), transparent 70%),
    radial-gradient(ellipse 34% 16% at 58% 68%, rgba(248,250,252,0.12), transparent 70%),
    linear-gradient(102deg, transparent 0 40%, rgba(248,250,252,0.18) 41% 45%, transparent 47%),
    linear-gradient(76deg, transparent 0 48%, rgba(248,250,252,0.14) 49% 53%, transparent 56%),
    linear-gradient(180deg, transparent, rgba(245,184,65,0.12) 58%, transparent 82%);
  filter: blur(0.3px);
  mask-image: linear-gradient(90deg, transparent, black 30%, rgba(0,0,0,0.72) 66%, transparent);
}
.live-intel-hero-copy,
.live-intel-hero-sports,
.live-intel-hero-story {
  position: relative;
  z-index: 1;
}
.live-intel-hero-sports {
  display: grid;
  align-content: center;
  gap: 12px;
  min-width: 0;
}
.live-intel-brand-anchor {
  display: inline-grid;
  position: relative;
  width: fit-content;
  gap: 3px;
  padding: 7px 18px 6px 18px;
  border: 1px solid rgba(217,164,65,0.24);
  border-left: 4px solid rgba(245,184,65,0.92);
  border-radius: 7px;
  background:
    linear-gradient(90deg, rgba(245,184,65,0.18), rgba(24,212,123,0.055) 58%, rgba(5,8,12,0.42)),
    rgba(5,8,12,0.38);
  box-shadow: 18px 0 42px rgba(245,184,65,0.06);
}
.live-intel-brand-anchor::after {
  content: "";
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: 4px;
  height: 1px;
  background: linear-gradient(90deg, rgba(245,184,65,0.74), rgba(24,212,123,0.28), transparent);
}
.live-intel-brand-logo-crop {
  display: block;
  width: min(260px, 48vw);
  height: 30px;
  overflow: hidden;
}
.live-intel-brand-anchor img {
  display: block;
  width: 420px;
  max-width: none;
  height: 54px;
  object-fit: contain;
  object-position: left center;
  transform: translate(-38px, -14px);
}
.live-intel-brand-anchor strong {
  display: block;
  color: #f8fafc;
  font-family: var(--font-cond);
  font-size: 1.2rem;
  font-weight: 950;
  letter-spacing: 0.14em;
  line-height: 1;
  text-transform: uppercase;
}
.live-intel-brand-anchor span {
  color: #f5b841;
  font-family: var(--font-cond);
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.live-intel-hero-scoreboard {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: end;
}
.live-intel-hero-scoreboard small {
  display: block;
  color: var(--es-brand-green);
  font-family: var(--font-cond);
  font-size: 0.76rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.live-intel-hero-scoreboard h1 {
  margin: 6px 0 0;
  max-width: 690px;
  color: #f8fafc;
  font-family: var(--font-cond);
  font-size: clamp(1.38rem, 2.42vw, 2.28rem);
  line-height: 1.02;
  letter-spacing: 0;
  text-transform: uppercase;
  overflow-wrap: break-word;
}
.live-intel-hero-clock {
  min-width: 190px;
  padding: 10px 12px;
  border-left: 2px solid rgba(24,212,123,0.46);
  background: linear-gradient(90deg, rgba(24,212,123,0.08), transparent);
  text-align: right;
}
.live-intel-hero-clock span,
.live-intel-hero-clock strong {
  display: block;
  font-family: var(--font-cond);
  text-transform: uppercase;
}
.live-intel-hero-clock span {
  color: #94a3b8;
  font-size: 0.68rem;
  font-weight: 850;
  letter-spacing: 0.08em;
}
.live-intel-hero-clock strong {
  margin-top: 3px;
  color: #f5b841;
  font-size: 1rem;
  letter-spacing: 0.04em;
}
.live-intel-hero-leagues {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
  gap: 7px;
}
.live-intel-hero-leagues button {
  min-width: 0;
  min-height: 46px;
  padding: 7px 8px;
  border: 1px solid rgba(82,101,122,0.28);
  border-left: 2px solid color-mix(in srgb, var(--league-color) 60%, rgba(82,101,122,0.28));
  border-radius: 4px;
  background:
    radial-gradient(ellipse 90% 80% at 100% 0%, color-mix(in srgb, var(--league-color) 12%, transparent), transparent 70%),
    rgba(10,20,32,0.48);
  cursor: pointer;
  text-align: left;
}
.live-intel-hero-leagues button.is-active {
  border-color: color-mix(in srgb, var(--league-color) 46%, rgba(82,101,122,0.28));
  background:
    radial-gradient(ellipse 90% 80% at 100% 0%, color-mix(in srgb, var(--league-color) 20%, transparent), transparent 70%),
    rgba(16,24,39,0.74);
}
.live-intel-hero-leagues button span,
.live-intel-hero-leagues button strong {
  display: block;
  font-family: var(--font-cond);
  text-transform: uppercase;
}
.live-intel-hero-leagues button span {
  color: color-mix(in srgb, var(--league-color) 86%, #f8fafc);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.12em;
}
.live-intel-hero-leagues button strong {
  margin-top: 3px;
  color: #cbd5e1;
  font-size: 0.66rem;
  font-weight: 850;
  letter-spacing: 0.04em;
  line-height: 1.12;
}
.live-intel-sports-visual {
  position: relative;
  display: grid;
  grid-template-columns: minmax(260px, 0.92fr) minmax(220px, 1fr);
  gap: 12px;
  min-height: 248px;
  overflow: hidden;
  border: 1px solid rgba(24, 212, 123, 0.26);
  border-radius: 8px;
  padding: 14px;
  background:
    radial-gradient(circle at 82% 24%, rgba(245, 184, 65, 0.16), transparent 30%),
    linear-gradient(135deg, rgba(24, 212, 123, 0.14), rgba(10, 20, 32, 0.72) 48%, rgba(5, 5, 5, 0.8));
  box-shadow: inset 0 1px 0 rgba(248, 250, 252, 0.06);
}
.live-intel-sports-visual::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(248,250,252,0.06) 1px, transparent 1px),
    linear-gradient(0deg, rgba(248,250,252,0.04) 1px, transparent 1px);
  background-size: 32px 32px;
  opacity: 0.18;
}
.live-intel-sports-visual-main,
.live-intel-sports-visual-logos,
.live-intel-sports-visual-card,
.live-intel-sports-headline-rail,
.live-intel-sports-visual-leagues {
  position: relative;
  z-index: 1;
}
.live-intel-sports-visual-card {
  min-height: 220px;
}
.live-intel-sports-headline-rail {
  display: grid;
  gap: 8px;
  align-content: stretch;
}
.live-intel-sports-headline-rail a {
  text-decoration: none;
}
.live-intel-sports-headline-rail a > div {
  min-width: 0;
  height: 100%;
  border: 1px solid rgba(82, 101, 122, 0.28);
  border-radius: 6px;
  background:
    linear-gradient(90deg, rgba(248, 250, 252, 0.045), transparent 64%),
    rgba(5, 5, 5, 0.2);
  padding: 8px;
}
.live-intel-sports-headline-rail span {
  display: block;
  margin-top: 7px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #f8fafc;
  font-size: 0.78rem;
  font-weight: 850;
}
.live-intel-sports-headline-rail small {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #94a3b8;
  font-size: 0.68rem;
  font-weight: 750;
}
.live-intel-sports-visual-main {
  min-width: 0;
  align-self: center;
}
.live-intel-sports-visual-main span,
.live-intel-sports-visual-logos span,
.live-intel-sports-visual-leagues span {
  font-family: var(--font-cond);
  font-weight: 850;
  text-transform: uppercase;
  letter-spacing: 0.14em;
}
.live-intel-sports-visual-main span {
  color: var(--es-green);
  font-size: 0.68rem;
}
.live-intel-sports-visual-main strong {
  display: block;
  margin-top: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #f8fafc;
  font-size: 1.4rem;
  line-height: 1.05;
}
.live-intel-sports-visual-main small {
  display: block;
  margin-top: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #94a3b8;
  font-weight: 700;
}
.live-intel-sports-visual-logos {
  display: flex;
  min-width: 176px;
  align-items: center;
  gap: 12px;
  padding-left: 12px;
  border-left: 1px solid rgba(82, 101, 122, 0.34);
}
.live-intel-sports-visual-logos img {
  width: 74px;
  height: 74px;
  object-fit: contain;
  filter: drop-shadow(0 8px 18px rgba(0,0,0,0.42));
}
.live-intel-sports-visual-logos span {
  display: block;
  color: #94a3b8;
  font-size: 0.62rem;
}
.live-intel-sports-visual-logos strong {
  display: block;
  margin-top: 4px;
  color: #f8fafc;
  font-size: 0.9rem;
}
.live-intel-sports-visual-leagues {
  grid-column: 1 / -1;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.live-intel-sports-visual-leagues span {
  border: 1px solid color-mix(in srgb, var(--league-color) 38%, rgba(82,101,122,0.28));
  background: color-mix(in srgb, var(--league-color) 12%, rgba(5,5,5,0.42));
  color: color-mix(in srgb, var(--league-color) 86%, #f8fafc);
  border-radius: 3px;
  padding: 3px 7px;
  font-size: 0.62rem;
}
.live-intel-hero-refresh {
  display: grid;
  place-items: center;
  border-left-width: 1px !important;
  color: #94a3b8;
}
.live-intel-hero-games {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.live-intel-hero-games a {
  min-width: 0;
}
.live-intel-hero-games a:nth-child(2),
.live-intel-hero-games a:nth-child(4) {
  margin-top: 12px;
}
.live-intel-hero-game {
  min-height: 126px;
  display: grid;
  grid-template-rows: auto minmax(46px, 1fr) auto;
  gap: 7px;
  padding: 9px;
  border: 1px solid rgba(82,101,122,0.20);
  border-top-color: rgba(24,212,123,0.34);
  border-radius: 7px 7px 3px 3px;
  background:
    radial-gradient(ellipse 84% 70% at 50% -10%, rgba(111,164,191,0.12), transparent 70%),
    linear-gradient(145deg, rgba(16,24,39,0.58), rgba(5,5,5,0.30));
  box-shadow: inset 0 1px 0 rgba(248,250,252,0.032), 0 14px 34px rgba(0,0,0,0.14);
}
.live-intel-hero-game header,
.live-intel-hero-game footer,
.live-intel-hero-matchup {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
}
.live-intel-hero-game header span,
.live-intel-hero-game header strong,
.live-intel-hero-game footer span,
.live-intel-hero-game footer b {
  font-family: var(--font-cond);
  text-transform: uppercase;
}
.live-intel-hero-game header span {
  color: #18d47b;
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.1em;
}
.live-intel-hero-game header strong {
  color: #94a3b8;
  font-size: 0.62rem;
  font-weight: 850;
  letter-spacing: 0.08em;
}
.live-intel-hero-matchup {
  justify-content: center;
}
.live-intel-hero-matchup > div {
  min-width: 0;
  text-align: center;
}
.live-intel-hero-matchup strong,
.live-intel-hero-matchup span {
  display: block;
}
.live-intel-hero-matchup strong {
  color: #f8fafc;
  font-family: var(--font-cond);
  font-size: 0.92rem;
  line-height: 1;
}
.live-intel-hero-matchup span {
  margin-top: 4px;
  color: #94a3b8;
  font-size: 0.68rem;
}
.live-intel-hero-game .live-intel-team-logo {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
}
.live-intel-hero-game .live-intel-team-logo img {
  width: 27px;
  height: 27px;
}
.live-intel-hero-game footer {
  padding-top: 7px;
  border-top: 1px solid rgba(82,101,122,0.22);
}
.live-intel-hero-game footer span {
  color: #94a3b8;
  font-size: 0.62rem;
  font-weight: 850;
}
.live-intel-hero-game footer b {
  color: #f5b841;
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.live-intel-hero {
  min-height: 0;
  padding: clamp(14px, 2vw, 24px);
  gap: clamp(14px, 2vw, 24px);
  grid-template-columns: minmax(0, 1fr) minmax(300px, 0.42fr);
}
.live-intel-hero-sports {
  gap: 9px;
}
.live-intel-brand-anchor {
  padding: 10px 16px 10px 16px;
}
.live-intel-brand-logo-crop {
  width: min(250px, 48vw);
  height: 46px;
}
.live-intel-brand-anchor img {
  width: 420px;
  height: 79px;
  transform: translate(-43px, -19px);
}
.live-intel-brand-anchor span,
.live-intel-status {
  font-size: 0.64rem;
}
.live-intel-hero-scoreboard {
  gap: 10px;
}
.live-intel-hero-scoreboard h1 {
  max-width: 560px;
  font-size: clamp(1.28rem, 2.1vw, 1.96rem);
}
.live-intel-hero-clock {
  min-width: 158px;
  padding: 8px 10px;
}
.live-intel-hero-leagues button {
  min-height: 38px;
  padding: 6px 7px;
}
.live-intel-sports-visual {
  min-height: 176px;
  padding: 10px;
  grid-template-columns: minmax(210px, 0.82fr) minmax(190px, 1fr);
  gap: 9px;
}
.live-intel-sports-visual-card {
  min-height: 148px;
}
.live-intel-sports-headline-rail {
  gap: 6px;
}
.live-intel-sports-headline-rail a > div {
  padding: 6px;
}
.live-intel-sports-headline-rail a:nth-child(n+3),
.live-intel-sports-visual-leagues {
  display: none;
}
.live-intel-hero-games {
  gap: 7px;
}
.live-intel-hero-games a:nth-child(2),
.live-intel-hero-games a:nth-child(4) {
  margin-top: 0;
}
.live-intel-hero-game {
  min-height: 96px;
  grid-template-rows: auto minmax(34px, 1fr) auto;
  gap: 5px;
  padding: 7px;
}
.live-intel-hero-game .live-intel-team-logo {
  width: 28px;
  height: 28px;
  flex-basis: 28px;
}
.live-intel-hero-game .live-intel-team-logo img {
  width: 22px;
  height: 22px;
}
.live-intel-hero-stats {
  margin-top: 0;
  gap: 8px;
}
.live-intel-hero-stats div {
  padding-top: 6px;
}
.live-intel-hero-story {
  align-self: stretch;
  padding: 14px;
}
.live-intel-watch-stack {
  padding: 8px;
  gap: 8px;
}
.live-intel-watch-brand strong {
  width: 42px;
  height: 42px;
  font-size: 1rem;
}
.live-intel-hero-story h2 {
  margin-top: 10px;
  font-size: 1.18rem;
  line-height: 1.06;
}
.live-intel-hero-story p {
  display: -webkit-box;
  margin-top: 6px;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 0.78rem;
  line-height: 1.35;
}
.live-intel-hero-story-grid {
  gap: 8px;
  margin-top: 10px;
}
.live-intel-escalation-flow {
  margin-top: 10px;
}
.live-intel-ops-desk,
.live-intel-featured-story {
  margin-top: 14px;
}
.live-intel-hero-fallback {
  border-top-color: color-mix(in srgb, var(--league-color) 42%, rgba(82,101,122,0.26));
  background:
    radial-gradient(ellipse 84% 70% at 50% -10%, color-mix(in srgb, var(--league-color) 14%, transparent), transparent 70%),
    linear-gradient(180deg, rgba(16,24,39,0.62), rgba(5,5,5,0.34));
}
.live-intel-hero-fallback-body {
  display: grid;
  align-content: center;
  gap: 5px;
  min-width: 0;
}
.live-intel-hero-fallback-body strong {
  color: #f8fafc;
  font-family: var(--font-cond);
  font-size: 1rem;
  line-height: 1.02;
  text-transform: uppercase;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.live-intel-hero-fallback-body span {
  color: #94a3b8;
  font-size: 0.72rem;
  line-height: 1.24;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.live-intel-hero-fallback.is-loading {
  opacity: 0.82;
}
.live-intel-hero-copy {
  display: grid;
  align-content: center;
  max-width: 720px;
  padding: 20px 0;
  min-width: 0;
}
.live-intel-status,
.live-intel-kicker,
.live-intel-label,
.live-intel-section-header,
.live-intel-card-footer,
.live-intel-hero-stats span,
.live-intel-league-filter button {
  font-family: var(--font-cond);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.live-intel-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--es-brand-green);
  font-size: 0.74rem;
  font-weight: 850;
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
}
.live-intel-status span {
  width: 7px;
  height: 7px;
}
.live-intel-hero-copy h1 {
  margin: 18px 0 20px;
  color: #f8fafc;
  font-family: var(--font-cond);
  font-size: clamp(2rem, 3.72vw, 3.72rem);
  line-height: 1.02;
  letter-spacing: 0;
  max-width: 680px;
  text-transform: uppercase;
  overflow-wrap: break-word;
}
.live-intel-hero-copy p {
  margin: 0;
  max-width: 590px;
  color: #cbd5e1;
  font-size: 0.96rem;
  line-height: 1.62;
}
.live-intel-hero-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  width: 100%;
  max-width: 660px;
  margin-top: 16px;
}
.live-intel-hero-stats div {
  min-width: 146px;
  padding: 0 20px 0 0;
  border: 0;
  border-right: 1px solid rgba(24,212,123,0.20);
  border-radius: 6px;
  background: transparent;
  box-shadow: none;
}
.live-intel-hero-stats strong {
  display: block;
  color: var(--es-brand-green);
  font-family: var(--font-mono);
  font-size: 0.98rem;
  line-height: 1;
}
.live-intel-hero-stats span {
  display: block;
  margin-top: 5px;
  color: #94a3b8;
  font-size: 0.62rem;
  font-weight: 850;
}
.live-intel-hero-story {
  display: grid;
  align-content: start;
  gap: 10px;
  padding: 18px 18px 15px;
  align-self: center;
  border: 0;
  border-left: 3px solid rgba(24,212,123,0.82);
  border-radius: 0;
  background:
    linear-gradient(90deg, rgba(24,212,123,0.08), transparent 42%),
    radial-gradient(ellipse 90% 74% at 50% 0%, rgba(245,184,65,0.045), transparent 66%),
    linear-gradient(180deg, rgba(16,24,39,0.34), rgba(5,5,5,0.18));
  box-shadow: 0 26px 64px rgba(0,0,0,0.22);
  backdrop-filter: blur(1.5px);
}
.live-intel-watch-stack {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 10px;
  align-items: stretch;
  padding: 9px;
  border: 1px solid rgba(82,101,122,0.22);
  background:
    radial-gradient(ellipse 70% 90% at 0% 0%, rgba(24,212,123,0.11), transparent 64%),
    rgba(5,5,5,0.2);
}
.live-intel-watch-brand {
  display: grid;
  place-items: center;
  gap: 6px;
  min-height: 96px;
  border-right: 1px solid rgba(82,101,122,0.24);
}
.live-intel-watch-brand strong {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(245,184,65,0.34);
  border-radius: 999px;
  color: #f5b841;
  font-family: var(--font-cond);
  font-size: 1.45rem;
  box-shadow: 0 0 28px rgba(245,184,65,0.08);
}
.live-intel-watch-brand span,
.live-intel-watch-stack span {
  color: #94a3b8;
  font-family: var(--font-cond);
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
.live-intel-watch-stack > div:last-child {
  display: grid;
  gap: 7px;
}
.live-intel-watch-stack > div:last-child > div {
  min-width: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 7px;
  border-bottom: 1px solid rgba(82,101,122,0.18);
}
.live-intel-watch-stack > div:last-child > div:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}
.live-intel-watch-stack strong {
  min-width: 0;
  color: #f8fafc;
  font-family: var(--font-cond);
  font-size: 0.86rem;
  font-weight: 900;
  line-height: 1.08;
  text-align: right;
  text-transform: uppercase;
}
.live-intel-watch-stack .is-hot strong {
  color: #f5b841;
}
.live-intel-watch-stack .is-live strong {
  color: #18d47b;
}
.live-intel-hero-story-top,
.live-intel-story-kicker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.live-intel-hero-story-top div,
.live-intel-story-kicker {
  font-family: var(--font-cond);
  text-transform: uppercase;
  letter-spacing: 0.09em;
}
.live-intel-hero-story-top span,
.live-intel-story-kicker span {
  color: #94a3b8;
  font-size: 0.72rem;
  font-weight: 850;
}
.live-intel-hero-story-top strong {
  display: block;
  margin-top: 2px;
  color: #f8fafc;
  font-size: 1.1rem;
  letter-spacing: 0;
}
.live-intel-hero-identity {
  position: relative;
  min-height: 158px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background:
    radial-gradient(circle at 50% 50%, rgba(24,212,123,0.10), transparent 42%),
    linear-gradient(180deg, rgba(5,5,5,0.06), rgba(5,5,5,0.34));
}
.live-intel-hero-radar {
  position: absolute;
  inset: 18px;
  display: grid;
  place-items: center;
  pointer-events: none;
}
.live-intel-hero-radar i {
  position: absolute;
  width: 44%;
  aspect-ratio: 1;
  border: 1px solid rgba(24,212,123,0.24);
  border-radius: 999px;
  animation: sourceConfirm 2.8s ease-out infinite;
}
.live-intel-hero-radar i:nth-child(2) {
  width: 66%;
  animation-delay: 0.25s;
}
.live-intel-hero-radar i:nth-child(3) {
  width: 88%;
  animation-delay: 0.5s;
}
.live-intel-hero-story h2 {
  margin: 0;
  color: #f8fafc;
  font-family: var(--font-cond);
  font-size: clamp(1.14rem, 1.64vw, 1.58rem);
  line-height: 1.05;
  letter-spacing: 0;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}
.live-intel-hero-story p {
  margin: 0;
  color: #cbd5e1;
  font-size: 0.82rem;
  line-height: 1.46;
}
.live-intel-hero-story-grid,
.live-intel-story-ops {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.live-intel-hero-story-grid div,
.live-intel-story-ops > div {
  min-width: 0;
  padding: 9px 0;
  border: 0;
  border-top: 1px solid rgba(82,101,122,0.26);
  border-radius: 0;
  background: transparent;
}
.live-intel-hero-story-grid span,
.live-intel-story-ops span,
.live-intel-story-read span {
  display: block;
  color: #64748b;
  font-family: var(--font-cond);
  font-size: 0.64rem;
  font-weight: 850;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.live-intel-hero-story-grid strong,
.live-intel-story-ops strong {
  display: block;
  margin-top: 4px;
  color: #f8fafc;
  font-size: 0.78rem;
  line-height: 1.2;
}
.live-intel-escalation-flow {
  display: grid;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(82,101,122,0.24);
}
.live-intel-escalation-flow > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.live-intel-escalation-flow > div span,
.live-intel-pressure-window-list small,
.live-intel-source-steps span {
  color: #94a3b8;
  font-family: var(--font-cond);
  font-size: 0.64rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.live-intel-escalation-flow > div strong {
  color: var(--es-brand-green);
  font-family: var(--font-mono);
  font-size: 0.84rem;
}
.live-intel-escalation-flow ol {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.live-intel-escalation-flow li {
  min-width: 0;
  display: grid;
  gap: 5px;
  position: relative;
}
.live-intel-escalation-flow li::before {
  content: "";
  position: absolute;
  top: 4px;
  left: 10px;
  right: -10px;
  height: 1px;
  background: rgba(82,101,122,0.34);
}
.live-intel-escalation-flow li:nth-child(2n)::before {
  display: none;
}
.live-intel-escalation-flow i,
.live-intel-source-steps i {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #334155;
  box-shadow: 0 0 0 1px rgba(148,163,184,0.18);
  position: relative;
  z-index: 1;
}
.live-intel-escalation-flow li.is-complete i,
.live-intel-source-steps .is-complete i {
  background: var(--es-brand-green);
  box-shadow: 0 0 12px rgba(24,212,123,0.46);
}
.live-intel-escalation-flow li.is-active i,
.live-intel-source-steps .is-active i {
  background: #f5b841;
  box-shadow: 0 0 12px rgba(245,184,65,0.45);
  animation: escalationGlow 1.6s ease-out 1;
}
.live-intel-escalation-flow li span {
  color: #cbd5e1;
  font-family: var(--font-cond);
  font-size: 0.6rem;
  font-weight: 850;
  letter-spacing: 0.025em;
  line-height: 1.1;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}
.live-intel-escalation.is-waiting {
  border-color: rgba(24,212,123,0.48);
  background: rgba(24,212,123,0.12);
  color: #18D47B;
}
.live-intel-escalation.is-waiting span {
  background: #18D47B;
}
@keyframes liveIntelRadar {
  0%, 100% { opacity: 0.3; transform: scale(0.96); }
  50% { opacity: 0.8; transform: scale(1.04); }
}
@keyframes liveIntelLightSweep {
  0%, 100% { opacity: 1; transform: translateX(0); }
  50% { opacity: 0.78; transform: translateX(1.8%); }
}
.live-intel-ticker {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  margin: 0 -24px;
  border-bottom: 1px solid rgba(82,101,122,0.24);
  border-top: 1px solid rgba(82,101,122,0.12);
  background:
    linear-gradient(90deg, rgba(245,184,65,0.08), transparent 28%),
    rgba(5,5,5,0.84);
  overflow: hidden;
}
.live-intel-ticker-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 16px 0 18px;
  border-right: 1px solid rgba(245,184,65,0.16);
  color: #f5b841;
  font-family: var(--font-cond);
  font-size: 0.72rem;
  font-weight: 950;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  white-space: nowrap;
}
.live-intel-ticker-window {
  min-width: 0;
  overflow: hidden;
  mask-image: linear-gradient(90deg, black 95%, transparent);
}
.live-intel-ticker-track {
  display: flex;
  width: max-content;
  animation: liveIntelTicker 68s linear infinite;
}
.live-intel-ticker-track span {
  position: relative;
  flex: 0 0 auto;
  padding: 0 34px;
  color: #cbd5e1;
  font-family: var(--font-cond);
  font-size: 0.69rem;
  font-weight: 850;
  letter-spacing: 0.06em;
  line-height: 34px;
  white-space: nowrap;
}
.live-intel-ticker-track span::before {
  content: "";
  position: absolute;
  left: 10px;
  top: 50%;
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: rgba(24,212,123,0.82);
  transform: translateY(-50%);
}
@keyframes liveIntelTicker {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  .live-intel-ticker-track {
    animation: none;
  }
}
.live-intel-league-filter {
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 12px 12px 0;
  overflow-x: auto;
}
.live-intel-now {
  position: relative;
  display: grid;
  grid-template-columns: 310px minmax(0, 1fr);
  gap: 18px;
  align-items: stretch;
  margin: 12px 0;
  min-height: 236px;
  overflow: hidden;
  border: 1px solid rgba(217,164,65,0.26);
  border-radius: 9px;
  background:
    radial-gradient(ellipse 44% 70% at 16% 14%, rgba(217,164,65,0.14), transparent 66%),
    radial-gradient(ellipse 66% 90% at 86% 30%, rgba(111,164,191,0.10), transparent 66%),
    linear-gradient(135deg, rgba(16,20,26,0.96), rgba(5,7,10,0.94));
  box-shadow: inset 4px 0 0 rgba(217,164,65,0.82), 0 22px 62px rgba(0,0,0,0.34);
}
.live-intel-now::before {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0.2;
  background:
    repeating-linear-gradient(90deg, transparent 0 34px, rgba(203,213,225,0.16) 35px, transparent 36px),
    linear-gradient(0deg, transparent 0 49%, rgba(245,184,65,0.22) 49.4%, transparent 50%);
  transform: perspective(800px) rotateX(54deg) translateY(-20%);
  transform-origin: 50% 0%;
}
.live-intel-now-visual,
.live-intel-now-copy {
  position: relative;
  z-index: 1;
}
.live-intel-now-visual {
  display: grid;
  place-items: center;
  min-height: 236px;
  border-right: 1px solid rgba(245,184,65,0.16);
  background:
    radial-gradient(circle at 50% 50%, rgba(245,184,65,0.13), transparent 50%),
    linear-gradient(180deg, rgba(10,15,26,0.5), rgba(5,5,5,0.22));
}
.live-intel-team-identity {
  display: grid;
  place-items: center;
  gap: 12px;
  text-align: center;
}
.live-intel-team-identity img,
.live-intel-team-identity strong {
  width: 116px;
  height: 116px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: rgba(248,250,252,0.04);
  border: 1px solid rgba(248,250,252,0.1);
  object-fit: contain;
  padding: 10px;
  box-shadow: 0 0 34px rgba(245,184,65,0.08);
}
.live-intel-team-identity strong {
  color: var(--es-amber);
  font-family: var(--font-cond);
  font-size: 2.1rem;
}
.live-intel-team-identity span {
  max-width: 230px;
  color: #f8fafc;
  font-family: var(--font-cond);
  font-size: 1.2rem;
  font-weight: 900;
  line-height: 1.1;
}
.live-intel-now-diamond {
  position: absolute;
  width: 168px;
  aspect-ratio: 1;
  border: 1px solid rgba(245,184,65,0.28);
  transform: rotate(45deg);
  opacity: 0.42;
}
.live-intel-now-diamond::before {
  content: "";
  position: absolute;
  inset: 28%;
  border: 1px solid rgba(245,184,65,0.22);
}
.live-intel-now-copy {
  display: grid;
  align-content: center;
  padding: 26px 30px 26px 10px;
}
.live-intel-now-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  color: #f5b841;
  font-family: var(--font-cond);
  font-size: 0.75rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.live-intel-now-copy h2 {
  margin: 10px 0 8px;
  color: #f8fafc;
  font-family: var(--font-cond);
  font-size: clamp(1.7rem, 3vw, 2.8rem);
  line-height: 0.98;
  letter-spacing: 0;
}
.live-intel-now-copy p {
  max-width: 780px;
  margin: 0;
  color: #cbd5e1;
  font-size: 0.98rem;
  line-height: 1.48;
}
.live-intel-now-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 16px;
}
.live-intel-now-meta span {
  padding: 5px 8px;
  border: 1px solid rgba(148,163,184,0.18);
  border-radius: 999px;
  background: rgba(5,5,5,0.28);
  color: #94a3b8;
  font-size: 0.74rem;
}
.live-intel-league-filter button {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--es-border);
  border-radius: 6px;
  background: rgba(10,20,32,0.74);
  color: var(--es-text-secondary);
  font-size: 0.74rem;
  font-weight: 850;
  cursor: pointer;
  white-space: nowrap;
}
.live-intel-league-filter button.is-active {
  border-color: rgba(24,212,123,0.42);
  color: var(--es-brand-green);
  background: rgba(24,212,123,0.08);
}
.live-intel-refresh {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.live-intel-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 9px 11px;
  border: 1px solid rgba(255,138,0,0.3);
  border-radius: 6px;
  background: rgba(255,138,0,0.08);
  color: #ffd166;
  font-size: 0.82rem;
}
.live-intel-ops-desk {
  margin-top: 10px;
  position: relative;
  overflow: hidden;
  border-top: 1px solid rgba(82,101,122,0.22);
  background:
    linear-gradient(180deg, rgba(10,20,32,0.22), rgba(5,5,5,0.12)),
    radial-gradient(ellipse 68% 120% at 20% 0%, rgba(24,212,123,0.07), transparent 70%);
}
.live-intel-ops-desk::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.10;
  background:
    linear-gradient(90deg, transparent 0 12%, rgba(24,212,123,0.28) 12.15%, transparent 12.3%),
    repeating-linear-gradient(90deg, transparent 0 78px, rgba(203,213,225,0.07) 79px, transparent 80px);
}
.live-intel-ops-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(260px, 0.78fr);
  gap: 12px;
  padding: 8px 12px 12px;
}
.live-intel-window-lane,
.live-intel-pressure-stack {
  min-width: 0;
  border-top: 1px solid rgba(82,101,122,0.22);
  background: rgba(5,5,5,0.12);
}
.live-intel-window-lane header,
.live-intel-pressure-stack > div:first-child {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 10px 7px;
}
.live-intel-window-lane header span,
.live-intel-pressure-stack span,
.live-intel-window-row span,
.live-intel-window-placeholder span,
.live-intel-situation-strip article span {
  color: #94a3b8;
  font-family: var(--font-cond);
  font-size: 0.64rem;
  font-weight: 900;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
.live-intel-window-lane header strong,
.live-intel-pressure-stack > div:first-child strong {
  color: #cbd5e1;
  font-size: 0.78rem;
  line-height: 1.2;
  text-align: right;
}
.live-intel-window-lane > div,
.live-intel-pressure-stack {
  display: grid;
  gap: 1px;
}
.live-intel-window-row,
.live-intel-window-placeholder {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr) minmax(118px, auto);
  gap: 9px;
  align-items: baseline;
  min-height: 42px;
  padding: 8px 10px;
  border-top: 1px solid rgba(82,101,122,0.13);
  background: linear-gradient(90deg, rgba(16,24,39,0.30), rgba(5,5,5,0.08));
}
.live-intel-window-row:hover,
.live-intel-situation-strip article:hover {
  background: rgba(16,24,39,0.44);
}
.live-intel-window-row strong,
.live-intel-window-placeholder strong {
  min-width: 0;
  overflow: hidden;
  color: #f8fafc;
  font-family: var(--font-cond);
  font-size: 0.9rem;
  line-height: 1.05;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}
.live-intel-window-row small {
  color: #94a3b8;
  font-size: 0.72rem;
  text-align: right;
}
.live-intel-window-row.is-compact {
  grid-template-columns: 68px minmax(0, 1fr);
}
.live-intel-window-row.is-compact small {
  grid-column: 2;
  text-align: left;
}
.live-intel-ops-fallback {
  display: grid;
  gap: 4px;
  padding: 10px;
  border-top: 1px solid rgba(82,101,122,0.13);
}
.live-intel-ops-fallback strong {
  color: #f8fafc;
  font-family: var(--font-cond);
  text-transform: uppercase;
}
.live-intel-ops-fallback span {
  color: #94a3b8;
  font-size: 0.78rem;
  line-height: 1.36;
}
.live-intel-situation-strip {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  border-top: 1px solid rgba(82,101,122,0.18);
}
.live-intel-situation-strip article {
  display: grid;
  gap: 5px;
  min-height: 104px;
  padding: 12px;
  background: rgba(5,5,5,0.10);
}
.live-intel-situation-strip article strong {
  color: #f8fafc;
  font-family: var(--font-cond);
  font-size: 0.98rem;
  line-height: 1.08;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.live-intel-situation-strip article small {
  color: #94a3b8;
  font-size: 0.74rem;
  line-height: 1.32;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.live-intel-world,
.live-intel-featured-story,
.live-intel-rail section {
  border: 0;
  border-radius: 0;
  background:
    radial-gradient(ellipse 58% 120% at 12% 0%, rgba(111,164,191,0.10), transparent 70%),
    linear-gradient(180deg, rgba(10,20,32,0.26), rgba(5,5,5,0.10));
}
.live-intel-world,
.live-intel-featured-story {
  margin-top: 18px;
  overflow: hidden;
  position: relative;
}
.live-intel-world::before,
.live-intel-featured-story::before,
.live-intel-layout::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.12;
  background:
    linear-gradient(90deg, transparent 0 8%, rgba(24,212,123,0.20) 8.1%, transparent 8.25% 91.7%, rgba(245,184,65,0.12) 91.85%, transparent 92%),
    repeating-linear-gradient(90deg, transparent 0 86px, rgba(203,213,225,0.07) 87px, transparent 88px);
  mask-image: linear-gradient(180deg, black, rgba(0,0,0,0.44) 56%, transparent);
}
.live-intel-league-world {
  display: flex;
  align-items: stretch;
  gap: 18px;
  padding: 14px 22px 8px;
  overflow-x: auto;
  position: relative;
  z-index: 1;
  scroll-snap-type: x proximity;
  mask-image: linear-gradient(90deg, black 0 92%, transparent);
}
.live-intel-league-node {
  width: clamp(222px, 22vw, 286px);
  min-width: clamp(222px, 22vw, 286px);
  min-height: 88px;
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 12px 16px;
  border: 0;
  border-left: 2px solid color-mix(in srgb, var(--league-color) 70%, transparent);
  border-radius: 0;
  background:
    radial-gradient(ellipse 90% 70% at 100% 0%, color-mix(in srgb, var(--league-color) 14%, transparent), transparent 70%),
    linear-gradient(90deg, rgba(16,24,39,0.50), rgba(5,5,5,0.10));
  cursor: pointer;
  scroll-snap-align: start;
}
.live-intel-league-node + a .live-intel-league-node,
a + a .live-intel-league-node {
  margin-left: 0;
}
.live-intel-league-node.is-active {
  background:
    radial-gradient(ellipse 90% 70% at 100% 0%, color-mix(in srgb, var(--league-color) 22%, transparent), transparent 70%),
    linear-gradient(90deg, rgba(16,24,39,0.84), rgba(5,5,5,0.26));
}
.live-intel-league-logo {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: rgba(248,250,252,0.04);
  border: 1px solid rgba(148,163,184,0.14);
}
.live-intel-league-logo img {
  width: 34px;
  height: 34px;
  object-fit: contain;
  filter: drop-shadow(0 8px 16px rgba(0,0,0,0.36));
}
.live-intel-league-logo b {
  color: var(--league-color);
  font-family: var(--font-cond);
  font-size: 0.92rem;
  font-weight: 900;
}
.live-intel-league-node strong,
.live-intel-league-node span,
.live-intel-league-node small {
  display: block;
}
.live-intel-league-node strong {
  color: #f8fafc;
  font-family: var(--font-cond);
  font-size: 1.28rem;
  line-height: 1;
}
.live-intel-league-node span {
  margin-top: 4px;
  color: var(--league-color);
  font-size: 0.72rem;
  font-weight: 850;
}
.live-intel-league-node small {
  grid-column: 1 / -1;
  color: #94a3b8;
  font-size: 0.74rem;
  line-height: 1.32;
}
.live-intel-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 12px 8px;
  border-bottom: 0;
  color: var(--es-text-secondary);
  font-size: 0.72rem;
  font-weight: 850;
}
.live-intel-section-header div {
  display: flex;
  align-items: center;
  gap: 7px;
}
.live-intel-section-header svg {
  color: var(--es-blue);
}
.live-intel-section-header small {
  color: #64748b;
  font-size: 0.7rem;
  text-transform: none;
  letter-spacing: 0;
}
.live-intel-game-strip {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  padding: 12px 18px 20px;
  position: relative;
  z-index: 1;
  scroll-snap-type: x proximity;
  mask-image: linear-gradient(90deg, black 0 94%, transparent);
}
.live-intel-game-pill {
  width: clamp(238px, 22vw, 276px);
  min-height: 154px;
  flex: 0 0 auto;
  display: grid;
  grid-template-rows: auto minmax(58px, auto) auto;
  gap: 10px;
  padding: 12px;
  border: 0;
  border-top: 1px solid rgba(82,101,122,0.22);
  border-radius: 0;
  background:
    radial-gradient(ellipse 70% 80% at 50% -12%, rgba(111,164,191,0.08), transparent 62%),
    linear-gradient(180deg, rgba(16,24,39,0.48), rgba(5,5,5,0.24));
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(248,250,252,0.035);
  scroll-snap-align: start;
}
.live-intel-game-pill:hover {
  border-color: rgba(0,183,255,0.34);
}
.live-intel-game-league,
.live-intel-game-state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.live-intel-game-league i {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #64748b;
}
.live-intel-game-league i.is-live {
  background: #00e676;
}
.live-intel-game-pill span,
.live-intel-game-pill footer span {
  color: #94a3b8;
  font-size: 0.72rem;
}
.live-intel-game-pill strong {
  color: #f8fafc;
  font-family: var(--font-cond);
  font-size: 1rem;
  line-height: 1.1;
}
.live-intel-matchup {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 42px;
  gap: 9px;
  align-items: center;
  text-align: center;
  overflow: hidden;
}
.live-intel-matchup strong {
  font-size: 1.08rem;
  line-height: 1.05;
  letter-spacing: 0;
  overflow-wrap: anywhere;
}
.live-intel-team-logo {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(148,163,184,0.18);
  border-radius: 999px;
  background: rgba(248,250,252,0.04);
}
.live-intel-team-logo img {
  width: 34px;
  height: 34px;
  object-fit: contain;
}
.live-intel-team-logo b {
  color: #f5b841;
  font-family: var(--font-cond);
}
.live-intel-game-pill footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid rgba(148,163,184,0.12);
}
.live-intel-game-pill footer .live-intel-escalation {
  max-width: 100%;
  white-space: normal;
}
.live-intel-story-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 330px;
  gap: 0;
  min-height: 310px;
  background:
    radial-gradient(ellipse 60% 90% at 18% 0%, rgba(245,184,65,0.09), transparent 66%),
    radial-gradient(ellipse 60% 80% at 84% 0%, rgba(24,212,123,0.055), transparent 68%),
    linear-gradient(135deg, rgba(16,20,26,0.72), rgba(5,5,5,0.38));
  position: relative;
  z-index: 1;
}
.live-intel-story-main {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 24px;
  align-items: center;
  padding: 28px;
  border-right: 1px solid rgba(245,184,65,0.08);
  position: relative;
  overflow: hidden;
}
.live-intel-story-main::before {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0.16;
  background:
    repeating-linear-gradient(45deg, transparent 0 32px, rgba(24,212,123,0.22) 33px, transparent 34px),
    repeating-linear-gradient(-45deg, transparent 0 32px, rgba(245,184,65,0.18) 33px, transparent 34px);
  pointer-events: none;
}
.live-intel-story-main > * {
  position: relative;
  z-index: 1;
}
.live-intel-editorial-mark {
  display: grid;
  align-content: center;
  gap: 8px;
  min-height: 210px;
  padding: 18px 18px 18px 0;
  border-right: 1px solid rgba(245,184,65,0.18);
}
.live-intel-editorial-mark strong {
  width: 92px;
  height: 92px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(245,184,65,0.42);
  border-radius: 999px;
  color: #f5b841;
  font-family: var(--font-cond);
  font-size: 2rem;
  font-weight: 950;
  letter-spacing: 0.08em;
  background:
    radial-gradient(circle at 50% 42%, rgba(245,184,65,0.16), transparent 64%),
    rgba(5,5,5,0.22);
  box-shadow: 0 0 46px rgba(245,184,65,0.11), inset 0 0 0 7px rgba(245,184,65,0.025);
}
.live-intel-editorial-mark span,
.live-intel-editorial-mark small {
  display: block;
  font-family: var(--font-cond);
  text-transform: uppercase;
}
.live-intel-editorial-mark span {
  color: #18d47b;
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.12em;
}
.live-intel-editorial-mark small {
  max-width: 170px;
  color: #cbd5e1;
  font-size: 1rem;
  font-weight: 900;
  letter-spacing: 0.02em;
  line-height: 1.06;
  overflow-wrap: anywhere;
}
.live-intel-story-kicker {
  justify-content: flex-start;
  margin-bottom: 13px;
}
.live-intel-story-panel h2 {
  margin: 0 0 16px;
  color: #f8fafc;
  font-family: var(--font-cond);
  font-size: clamp(1.58rem, 2.72vw, 2.46rem);
  line-height: 1.04;
  letter-spacing: 0;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}
.live-intel-story-read {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.live-intel-story-read div {
  padding: 12px;
  border: 0;
  border-left: 1px solid rgba(82,101,122,0.24);
  border-radius: 0;
  background: rgba(5,5,5,0.08);
}
.live-intel-story-read p {
  margin: 6px 0 0;
  color: #cbd5e1;
  font-size: 0.88rem;
  line-height: 1.48;
}
.live-intel-story-ops {
  grid-template-columns: 1fr;
  align-content: center;
  padding: 20px;
  background: rgba(5,5,5,0.14);
}
.live-intel-story-action {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  border-color: rgba(24,212,123,0.24) !important;
  background: rgba(24,212,123,0.07) !important;
}
.live-intel-story-action svg {
  color: #18D47B;
  flex: 0 0 auto;
  margin-top: 1px;
}
.live-intel-story-action span {
  color: #cbd5e1;
  font-family: var(--font-sans);
  font-size: 0.82rem;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  line-height: 1.42;
}
.live-intel-featured-story {
  margin-top: 8px;
  background:
    radial-gradient(ellipse 74% 120% at 12% 0%, rgba(245,184,65,0.055), transparent 72%),
    radial-gradient(ellipse 64% 100% at 86% 12%, rgba(24,212,123,0.045), transparent 70%),
    linear-gradient(180deg, rgba(5,5,5,0.01), rgba(5,5,5,0.22));
}
.live-intel-featured-story::after {
  content: "";
  position: absolute;
  inset: auto 0 0 0;
  height: 46%;
  pointer-events: none;
  opacity: 0.12;
  background:
    linear-gradient(90deg, transparent, rgba(203,213,225,0.16) 18%, transparent 19% 48%, rgba(245,184,65,0.16) 49%, transparent 50% 80%, rgba(24,212,123,0.18) 81%, transparent),
    repeating-linear-gradient(0deg, transparent 0 34px, rgba(148,163,184,0.08) 35px, transparent 36px);
  mask-image: linear-gradient(180deg, transparent, black);
}
.live-intel-story-panel {
  grid-template-columns: minmax(0, 1fr) 286px;
  min-height: 380px;
  isolation: isolate;
  background:
    linear-gradient(90deg, rgba(5,5,5,0.52), rgba(5,5,5,0.16) 54%, rgba(5,5,5,0.44)),
    radial-gradient(ellipse 50% 88% at 14% 12%, rgba(245,184,65,0.08), transparent 70%),
    radial-gradient(ellipse 54% 86% at 82% 4%, rgba(24,212,123,0.05), transparent 72%),
    linear-gradient(135deg, rgba(16,20,26,0.36), rgba(5,5,5,0.10));
}
.live-intel-story-panel::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0.10;
  background:
    radial-gradient(ellipse 46% 74% at 12% 32%, rgba(248,250,252,0.22), transparent 62%),
    linear-gradient(118deg, transparent 0 24%, rgba(111,164,191,0.22) 24.4%, transparent 24.8% 62%, rgba(24,212,123,0.16) 62.2%, transparent 62.6%),
    repeating-linear-gradient(90deg, transparent 0 74px, rgba(203,213,225,0.08) 75px, transparent 76px);
  mask-image: linear-gradient(90deg, black, rgba(0,0,0,0.58) 56%, transparent 92%);
}
.live-intel-story-main {
  grid-template-columns: 210px minmax(0, 1fr);
  gap: clamp(20px, 4vw, 42px);
  padding: clamp(24px, 4vw, 46px);
  border-right: 0;
}
.live-intel-story-main::before {
  opacity: 0.10;
  background:
    radial-gradient(ellipse 70% 62% at 14% 50%, rgba(248,250,252,0.16), transparent 64%),
    repeating-linear-gradient(105deg, transparent 0 44px, rgba(24,212,123,0.20) 45px, transparent 46px);
}
.live-intel-story-read div {
  padding: 0 0 0 12px;
  background: transparent;
  border-left-color: rgba(245,184,65,0.24);
}
.live-intel-story-timeline {
  display: grid;
  gap: 8px;
  margin-top: 18px;
  max-width: 620px;
}
.live-intel-story-timeline div {
  display: grid;
  grid-template-columns: 62px 10px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
}
.live-intel-story-timeline time {
  color: #94a3b8;
  font-family: var(--font-mono);
  font-size: 0.72rem;
}
.live-intel-story-timeline span {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--es-brand-green);
  box-shadow: 0 0 10px rgba(24,212,123,0.52);
}
.live-intel-story-timeline p {
  margin: 0;
  color: #cbd5e1;
  font-size: 0.82rem;
  line-height: 1.35;
}
.live-intel-story-ops {
  align-content: end;
  padding: 24px 22px;
  background:
    linear-gradient(180deg, rgba(5,5,5,0.02), rgba(5,5,5,0.34)),
    linear-gradient(90deg, rgba(24,212,123,0.08), transparent 46%);
}
.live-intel-pressure {
  display: grid;
  grid-template-columns: minmax(260px, 0.58fr) minmax(0, 1fr);
  gap: clamp(18px, 3vw, 36px);
  align-items: end;
  margin-top: 16px;
  padding: clamp(18px, 3vw, 30px) clamp(12px, 3vw, 24px);
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(ellipse 60% 90% at 0% 50%, rgba(217,164,65,0.10), transparent 66%),
    linear-gradient(90deg, rgba(16,24,39,0.24), rgba(5,5,5,0.04));
}
.live-intel-pressure::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  opacity: 0.28;
  background: linear-gradient(90deg, rgba(245,184,65,0.80), rgba(24,212,123,0.42), transparent);
}
.live-intel-pressure-lead,
.live-intel-pressure-lanes {
  position: relative;
  z-index: 1;
}
.live-intel-pressure-lead span,
.live-intel-source-arc-copy span,
.live-intel-source-arc-meter span {
  display: block;
  color: #94a3b8;
  font-family: var(--font-cond);
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
.live-intel-pressure-lead h2,
.live-intel-source-arc-copy h2 {
  margin: 8px 0 0;
  color: #f8fafc;
  font-family: var(--font-cond);
  font-size: clamp(1.32rem, 2.32vw, 2.18rem);
  line-height: 1.06;
  letter-spacing: 0;
  text-transform: uppercase;
}
.live-intel-pressure-window-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}
.live-intel-pressure-window-list small {
  width: fit-content;
  padding: 5px 8px;
  border-left: 1px solid rgba(245,184,65,0.34);
  background: rgba(245,184,65,0.055);
  color: #cbd5e1;
}
.live-intel-pressure-lanes {
  display: grid;
  grid-template-columns: 1.08fr 0.92fr 1fr;
  gap: 18px;
}
.live-intel-pressure-lanes div {
  padding-left: 14px;
  border-left: 1px solid rgba(82,101,122,0.34);
}
.live-intel-pressure-lanes strong {
  color: #f5b841;
  font-family: var(--font-cond);
  font-size: 0.82rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.live-intel-pressure-lanes p,
.live-intel-source-arc-copy p {
  margin: 7px 0 0;
  color: #cbd5e1;
  font-size: 0.88rem;
  line-height: 1.48;
}
.live-intel-source-arc {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.8fr);
  gap: clamp(18px, 3vw, 34px);
  align-items: center;
  margin-top: 12px;
  padding: clamp(16px, 2.6vw, 26px) clamp(12px, 3vw, 24px);
  position: relative;
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(24,212,123,0.07), transparent 36%),
    radial-gradient(ellipse 44% 120% at 86% 50%, rgba(111,164,191,0.10), transparent 68%);
}
.live-intel-source-arc::before {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0.14;
  background:
    linear-gradient(90deg, transparent 0 16%, rgba(24,212,123,0.42) 16.15%, transparent 16.3%),
    repeating-linear-gradient(90deg, transparent 0 96px, rgba(203,213,225,0.08) 97px, transparent 98px);
  pointer-events: none;
}
.live-intel-source-arc-copy,
.live-intel-source-arc-meter {
  position: relative;
  z-index: 1;
}
.live-intel-source-arc-copy h2 {
  color: var(--es-brand-green);
  font-size: clamp(1.36rem, 2.4vw, 2.25rem);
}
.live-intel-source-arc-meter {
  display: grid;
  gap: 10px;
}
.live-intel-source-arc-meter div {
  display: grid;
  grid-template-columns: 128px minmax(0, 1fr);
  gap: 12px;
  align-items: baseline;
  padding: 9px 0;
  border-top: 1px solid rgba(82,101,122,0.24);
}
.live-intel-source-arc-meter strong {
  color: #f8fafc;
  font-size: 0.9rem;
  line-height: 1.25;
}
.live-intel-source-steps {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  position: relative;
  z-index: 1;
  padding-top: 4px;
}
.live-intel-source-steps div {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid rgba(82,101,122,0.24);
}
.live-intel-source-steps .is-waiting span {
  color: #64748b;
}
.live-intel-world {
  margin-top: 28px;
  background:
    radial-gradient(ellipse 52% 120% at 8% 0%, rgba(111,164,191,0.10), transparent 70%),
    linear-gradient(180deg, rgba(10,20,32,0.22), rgba(5,5,5,0.08));
}
.live-intel-world .live-intel-section-header {
  padding-top: 16px;
}
.live-intel-league-world {
  padding-top: 10px;
}
.live-intel-league-node {
  min-height: 84px;
  background:
    radial-gradient(ellipse 90% 70% at 100% 0%, color-mix(in srgb, var(--league-color) 10%, transparent), transparent 70%),
    linear-gradient(90deg, rgba(16,24,39,0.34), rgba(5,5,5,0.06));
}
@keyframes liveIntelPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.82); }
}
.live-intel-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 330px;
  gap: 18px;
  margin-top: 26px;
  position: relative;
  padding-top: 18px;
  background:
    radial-gradient(ellipse 68% 80% at 34% 0%, rgba(111,164,191,0.075), transparent 70%),
    linear-gradient(180deg, rgba(5,5,5,0.02), rgba(5,5,5,0.32));
}
.live-intel-main {
  display: grid;
  gap: 14px;
  position: relative;
  z-index: 1;
}
.live-intel-feed {
  display: grid;
  gap: 10px;
}
.live-intel-object {
  min-width: 0;
  border-top: 1px solid rgba(82,101,122,0.22);
  background:
    linear-gradient(180deg, rgba(16,24,39,0.40), rgba(5,5,5,0.16));
}
.live-intel-object h3 {
  margin: 0;
  color: #f8fafc;
  font-family: var(--font-cond);
  line-height: 1.08;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}
.live-intel-object p {
  margin: 0;
  color: #cbd5e1;
  font-size: 0.82rem;
  line-height: 1.42;
}
.live-intel-object span,
.live-intel-object small,
.live-intel-object-cluster header span,
.live-intel-monitoring-cluster header span {
  color: #94a3b8;
  font-family: var(--font-cond);
  font-size: 0.64rem;
  font-weight: 900;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
.live-intel-object-fast {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) minmax(170px, 0.7fr) auto;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border-left: 2px solid rgba(255,138,0,0.74);
}
.live-intel-object-fast > div {
  display: grid;
  gap: 3px;
}
.live-intel-object-fast > div strong,
.live-intel-market-line span {
  color: #f5b841;
  font-family: var(--font-cond);
  font-size: 0.9rem;
  text-transform: uppercase;
}
.live-intel-object-fast h3 {
  font-size: 1rem;
}
.live-intel-object-escalating {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-left: 2px solid rgba(245,184,65,0.62);
  background:
    linear-gradient(90deg, rgba(245,184,65,0.055), transparent 46%),
    linear-gradient(180deg, rgba(16,24,39,0.46), rgba(5,5,5,0.16));
}
.live-intel-object-escalating.is-lead {
  padding: 16px;
  border-top-color: rgba(245,184,65,0.30);
}
.live-intel-object-escalating header,
.live-intel-object-market > div:first-child,
.live-intel-object-watch > div:first-child,
.live-intel-object-watch footer,
.live-intel-object-escalating footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.live-intel-object-escalating h3 {
  margin-top: 5px;
  font-size: clamp(1.12rem, 1.72vw, 1.58rem);
}
.live-intel-object-escalation-grid {
  display: grid;
  grid-template-columns: 1.1fr 0.78fr 0.92fr;
  gap: 10px;
}
.live-intel-object-escalation-grid > div {
  min-width: 0;
  padding-top: 8px;
  border-top: 1px solid rgba(82,101,122,0.24);
}
.live-intel-object-escalation-grid span,
.live-intel-object-escalation-grid strong {
  display: block;
}
.live-intel-object-escalation-grid strong {
  margin-top: 4px;
  color: #f8fafc;
  font-size: 0.84rem;
  line-height: 1.35;
}
.live-intel-object-escalating footer {
  align-items: flex-start;
  padding-top: 2px;
}
.live-intel-object-escalating footer span {
  max-width: 52%;
  color: #cbd5e1;
  font-family: var(--font-sans);
  font-size: 0.82rem;
  font-weight: 500;
  letter-spacing: 0;
  line-height: 1.35;
  text-transform: none;
}
.live-intel-object-escalating footer strong {
  max-width: 42%;
  color: #18d47b;
  font-size: 0.82rem;
  line-height: 1.35;
  text-align: right;
}
.live-intel-object-market {
  display: grid;
  gap: 9px;
  padding: 13px;
  border-left: 2px solid rgba(0,183,255,0.54);
}
.live-intel-object-market h3 {
  font-size: 1.05rem;
}
.live-intel-market-line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: baseline;
  padding: 8px 0;
  border-top: 1px solid rgba(82,101,122,0.22);
  border-bottom: 1px solid rgba(82,101,122,0.22);
}
.live-intel-market-line strong {
  color: #f8fafc;
  font-family: var(--font-mono);
  font-size: 0.9rem;
}
.live-intel-object-watch {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-left: 2px solid rgba(24,212,123,0.48);
}
.live-intel-object-watch > div:first-child {
  justify-content: flex-start;
  color: #18d47b;
}
.live-intel-object-watch h3 {
  font-size: 1rem;
}
.live-intel-object-watch footer {
  padding-top: 2px;
}
.live-intel-object-watch footer strong {
  color: #f5b841;
  font-family: var(--font-mono);
  font-size: 0.74rem;
}
.live-intel-object-monitoring {
  display: grid;
  grid-template-columns: 104px minmax(0, 1fr) minmax(170px, 0.72fr);
  gap: 10px;
  align-items: baseline;
  min-height: 42px;
  padding: 8px 10px;
  background: rgba(5,5,5,0.10);
}
.live-intel-object-monitoring strong {
  min-width: 0;
  overflow: hidden;
  color: #f8fafc;
  font-family: var(--font-cond);
  font-size: 0.9rem;
  line-height: 1.08;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}
.live-intel-object-monitoring small {
  min-width: 0;
  overflow: hidden;
  color: #94a3b8;
  font-family: var(--font-sans);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0;
  text-overflow: ellipsis;
  text-transform: none;
  white-space: nowrap;
}
.live-intel-object-official {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  padding: 12px;
  border-left: 2px solid rgba(0,230,118,0.58);
}
.live-intel-object-official svg {
  color: #00e676;
}
.live-intel-object-official h3 {
  margin-top: 4px;
  font-size: 1rem;
}
.live-intel-object-official > strong {
  color: #00e676;
  font-family: var(--font-cond);
  font-size: 0.76rem;
  text-align: right;
  text-transform: uppercase;
}
.live-intel-object-cluster,
.live-intel-monitoring-cluster {
  display: grid;
  border-top: 1px solid rgba(82,101,122,0.22);
  background: rgba(5,5,5,0.10);
}
.live-intel-object-cluster header,
.live-intel-monitoring-cluster header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
}
.live-intel-object-cluster header strong,
.live-intel-monitoring-cluster header strong {
  color: #cbd5e1;
  font-size: 0.76rem;
}
.live-intel-object-cluster > div {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
}
.live-intel-object-cluster.is-hot {
  border-top-color: rgba(255,138,0,0.30);
}
.live-intel-object-cluster.is-market {
  border-top-color: rgba(0,183,255,0.28);
}
.live-intel-object-cluster.is-watch {
  border-top-color: rgba(24,212,123,0.26);
}
.live-intel-object-cluster.is-official {
  border-top-color: rgba(0,230,118,0.30);
}
.live-intel-monitoring-cluster > div {
  display: grid;
  gap: 1px;
}
.live-intel-change-brief {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.72fr);
  gap: 16px;
  padding: 16px;
  border-top: 1px solid rgba(245,184,65,0.24);
  background:
    linear-gradient(90deg, rgba(245,184,65,0.05), transparent 48%),
    rgba(5,5,5,0.14);
}
.live-intel-change-brief > div:first-child span,
.live-intel-change-list span {
  color: #18d47b;
  font-family: var(--font-cond);
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
.live-intel-change-brief h3 {
  margin: 6px 0 0;
  color: #f8fafc;
  font-family: var(--font-cond);
  font-size: clamp(1.14rem, 1.8vw, 1.62rem);
  line-height: 1.08;
  text-transform: uppercase;
}
.live-intel-change-brief p {
  margin: 8px 0 0;
  color: #cbd5e1;
  font-size: 0.86rem;
  line-height: 1.46;
}
.live-intel-change-brief > div:last-child {
  display: grid;
  grid-template-columns: 1fr;
  gap: 7px;
}
.live-intel-change-brief > div:last-child > div {
  padding: 8px 0 0;
  border-top: 1px solid rgba(82,101,122,0.22);
}
.live-intel-change-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  background: rgba(82,101,122,0.16);
}
.live-intel-change-list article {
  display: grid;
  gap: 4px;
  min-height: 88px;
  padding: 11px 12px;
  background:
    linear-gradient(90deg, rgba(16,24,39,0.52), rgba(5,5,5,0.20));
}
.live-intel-change-list article:hover {
  background: rgba(16,24,39,0.66);
}
.live-intel-change-list strong {
  color: #f8fafc;
  font-family: var(--font-cond);
  font-size: 0.96rem;
  line-height: 1.1;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.live-intel-change-list small {
  color: #94a3b8;
  font-size: 0.72rem;
  line-height: 1.32;
}
.live-intel-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 0;
  border-top: 1px solid rgba(82,101,122,0.20);
  border-radius: 0;
  background:
    linear-gradient(180deg, rgba(16,20,26,0.58), rgba(10,20,32,0.38)),
    linear-gradient(90deg, rgba(111,164,191,0.026), transparent 34%, rgba(217,164,65,0.018));
  backdrop-filter: blur(1px);
}
.live-intel-card.is-featured {
  border-color: rgba(217,164,65,0.30);
  box-shadow: inset 3px 0 0 rgba(217,164,65,0.82), 0 18px 44px rgba(0,0,0,0.24);
}
.live-intel-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.live-intel-kicker {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  color: #94a3b8;
  font-size: 0.68rem;
  font-weight: 850;
}
.live-intel-kicker span:first-child {
  color: var(--es-blue);
}
.live-intel-card h2 {
  margin: 6px 0 0;
  color: #f8fafc;
  font-family: var(--font-cond);
  font-size: 1.12rem;
  line-height: 1.18;
  letter-spacing: 0;
}
.live-intel-subject {
  margin: 5px 0 0;
  color: #94a3b8;
  font-size: 0.82rem;
  line-height: 1.35;
}
.live-intel-escalation {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  flex: 0 0 auto;
  padding: 4px 8px;
  border: 1px solid;
  border-radius: 999px;
  font-family: var(--font-cond);
  font-size: 0.66rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}
.live-intel-escalation span {
  width: 6px;
  height: 6px;
  border-radius: 999px;
}
.live-intel-read-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.live-intel-read-grid > div,
.live-intel-confidence,
.live-intel-source-chain,
.live-intel-timing {
  padding: 11px 10px;
  border: 0;
  border-left: 1px solid rgba(82,101,122,0.20);
  border-radius: 0;
  background: rgba(5,7,10,0.08);
}
.live-intel-label {
  display: block;
  margin-bottom: 5px;
  color: #64748b;
  font-size: 0.61rem;
  font-weight: 850;
  letter-spacing: 0.07em;
}
.live-intel-read-grid p,
.live-intel-confidence p,
.live-intel-timing span,
.live-intel-validator-row span,
.live-intel-timeline p,
.live-intel-card-footer span {
  margin: 0;
  color: #cbd5e1;
  font-size: 0.80rem;
  line-height: 1.5;
}
.live-intel-evidence-row {
  display: grid;
  grid-template-columns: 1fr 0.78fr 0.92fr;
  gap: 10px;
}
.live-intel-confidence div,
.live-intel-source-chain > div:first-child,
.live-intel-timing,
.live-intel-validator-row div {
  display: flex;
  align-items: center;
  gap: 7px;
}
.live-intel-confidence strong,
.live-intel-confidence span,
.live-intel-source-chain strong,
.live-intel-timing strong {
  font-size: 0.82rem;
  line-height: 1;
}
.live-intel-confidence p {
  margin-top: 6px;
  color: #94a3b8;
}
.live-intel-source-chain svg,
.live-intel-timing svg,
.live-intel-validator-row svg {
  color: #00b7ff;
  flex: 0 0 auto;
}
.live-intel-source-chain span,
.live-intel-timing span {
  color: #94a3b8;
}
.live-intel-source-dots {
  display: flex;
  margin-top: 10px;
}
.live-intel-source-dots span {
  width: 18px;
  height: 18px;
  margin-right: -4px;
  border: 1px solid rgba(0,183,255,0.36);
  border-radius: 999px;
  background: #101827;
}
.live-intel-validator-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.live-intel-validator-row div {
  padding: 7px 9px;
  border: 1px solid rgba(0,183,255,0.16);
  border-radius: 999px;
  background: rgba(0,183,255,0.055);
}
.live-intel-timeline {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(245,184,65,0.14);
  border-radius: 6px;
  background: rgba(245,184,65,0.032);
}
.live-intel-timeline div {
  display: grid;
  grid-template-columns: 72px 10px minmax(0, 1fr);
  gap: 8px;
}
.live-intel-timeline time {
  color: #f5b841;
  font-family: var(--font-mono);
  font-size: 0.7rem;
}
.live-intel-timeline div > span {
  width: 7px;
  height: 7px;
  margin-top: 6px;
  border-radius: 999px;
  background: #f5b841;
}
.live-intel-timeline strong {
  display: block;
  color: #f8fafc;
  font-size: 0.8rem;
}
.live-intel-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 2px;
}
.live-intel-card-footer div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.live-intel-card-footer span {
  padding: 4px 7px;
  border: 1px solid #1f2937;
  border-radius: 999px;
  color: #94a3b8;
  font-size: 0.72rem;
}
.live-intel-card-footer button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: #f5b841;
  font-family: var(--font-cond);
  font-size: 0.72rem;
  font-weight: 850;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;
}
.live-intel-rail {
  display: grid;
  align-content: start;
  gap: 12px;
}
.live-intel-escalation-list,
.live-intel-focus-list {
  display: grid;
  gap: 7px;
  padding: 10px;
}
.live-intel-escalation-list div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.live-intel-escalation-list strong {
  color: #f8fafc;
  font-family: var(--font-mono);
}
.live-intel-focus-list div {
  padding: 9px;
  border: 1px solid #1f2937;
  border-radius: 6px;
  background: rgba(5,5,5,0.22);
  cursor: pointer;
}
.live-intel-focus-list div:hover {
  border-color: rgba(0,183,255,0.32);
}
.live-intel-focus-list span,
.live-intel-focus-list small {
  display: block;
  color: #94a3b8;
  font-size: 0.7rem;
}
.live-intel-focus-list strong {
  display: block;
  margin: 4px 0;
  color: #f8fafc;
  font-size: 0.82rem;
  line-height: 1.25;
}
.live-intel-empty {
  display: grid;
  place-items: center;
  gap: 6px;
  min-height: 220px;
  padding: 24px;
  border: 1px solid #1f2937;
  border-radius: 8px;
  background: #0a0f1a;
  text-align: center;
}
.live-intel-empty svg {
  color: #00e676;
}
.live-intel-empty strong {
  color: #f8fafc;
}
.live-intel-empty span {
  color: #94a3b8;
  font-size: 0.86rem;
}
.is-loading {
  opacity: 0.72;
}
.live-intel-card.is-loading div {
  height: 18px;
  border-radius: 5px;
  background: #1f2937;
}
.live-intel-card.is-loading div:nth-child(1) {
  width: 60%;
}
.live-intel-card.is-loading div:nth-child(2) {
  width: 92%;
}
.live-intel-card.is-loading div:nth-child(3) {
  width: 78%;
}
@media (max-width: 1080px) {
  .live-intel-hero,
  .live-intel-layout,
  .live-intel-ops-grid,
  .live-intel-change-brief,
  .live-intel-story-panel,
  .live-intel-story-main,
  .live-intel-pressure,
  .live-intel-source-arc {
    grid-template-columns: 1fr;
  }
  .live-intel-story-main {
    border-right: 0;
    border-bottom: 1px solid rgba(245,184,65,0.14);
  }
  .live-intel-league-world {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .live-intel-rail {
    grid-row: auto;
  }
  .live-intel-situation-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .live-intel-home {
    padding: 8px 12px 96px;
  }
  .live-intel-ticker {
    grid-template-columns: 1fr;
    margin: -8px -12px 0;
  }
  .live-intel-ticker-brand {
    min-height: 28px;
    padding-inline: 12px;
    border-right: 0;
    border-bottom: 1px solid rgba(245,184,65,0.12);
    font-size: 0.64rem;
  }
  .live-intel-ticker-track span {
    padding: 0 18px;
    font-size: 0.62rem;
    line-height: 28px;
  }
  .live-intel-hero {
    width: 100%;
    max-width: 100%;
    grid-template-columns: minmax(0, 1fr) !important;
    min-height: 0;
    padding: 10px 10px 4px;
    gap: 8px;
    overflow: visible;
  }
  .live-intel-hero-copy,
  .live-intel-hero-sports {
    width: 100%;
    max-width: calc(100vw - 48px) !important;
    overflow: visible;
  }
  .live-intel-status {
    display: flex;
    align-items: flex-start;
    font-size: 0.68rem;
    line-height: 1.2;
    letter-spacing: 0.05em;
  }
  .live-intel-brand-anchor {
    padding: 8px 12px 8px 12px;
  }
  .live-intel-brand-logo-crop {
    width: min(210px, 58vw);
    height: 38px;
  }
  .live-intel-brand-anchor img {
    width: 350px;
    height: 66px;
    transform: translate(-36px, -16px);
  }
  .live-intel-brand-anchor strong {
    font-size: 1.22rem;
  }
  .live-intel-brand-anchor span {
    font-size: 0.56rem;
  }
  .live-intel-hero-scoreboard {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .live-intel-hero-scoreboard h1 {
    margin: 6px 0 0;
    width: min(330px, calc(100vw - 48px));
    font-size: 1.2rem;
    line-height: 1.02;
    max-width: min(330px, calc(100vw - 48px));
    text-wrap: balance;
    overflow-wrap: break-word;
  }
  .live-intel-hero-clock {
    min-width: 0;
    padding: 8px 9px;
    text-align: left;
  }
  .live-intel-hero-leagues {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
  .live-intel-hero-refresh {
    display: none;
  }
  .live-intel-hero-leagues button {
    min-height: 40px;
    padding: 6px;
  }
  .live-intel-hero-leagues button span {
    font-size: 0.66rem;
  }
  .live-intel-hero-leagues button strong {
    font-size: 0.58rem;
  }
  .live-intel-hero-games {
    display: flex;
    max-width: calc(100vw - 44px);
    gap: 9px;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    padding-bottom: 3px;
    mask-image: linear-gradient(90deg, black 0 92%, transparent);
  }
  .live-intel-sports-visual {
    grid-template-columns: 1fr;
    min-height: 0;
    padding: 9px;
  }
  .live-intel-sports-visual-card {
    min-height: 118px;
  }
  .live-intel-sports-headline-rail {
    grid-template-columns: 1fr;
  }
  .live-intel-sports-headline-rail a:nth-child(n+3) {
    display: none;
  }
  .live-intel-sports-visual-logos {
    min-width: 0;
    padding-left: 0;
    border-left: 0;
    border-top: 1px solid rgba(82, 101, 122, 0.34);
    padding-top: 10px;
  }
  .live-intel-sports-visual-logos img {
    width: 56px;
    height: 56px;
  }
  .live-intel-sports-visual-main strong {
    font-size: 1.05rem;
  }
  .live-intel-hero-games a {
    width: min(228px, calc(100vw - 72px));
    flex: 0 0 min(228px, calc(100vw - 72px));
    margin-top: 0 !important;
  }
  .live-intel-hero-games a:nth-child(n+4) {
    display: none;
  }
  .live-intel-hero-game {
    width: 100%;
    min-height: 94px;
    scroll-snap-align: start;
  }
  .live-intel-hero-copy p {
    font-size: 0.8rem;
    line-height: 1.52;
    width: min(320px, calc(100vw - 44px)) !important;
    max-width: min(320px, calc(100vw - 44px)) !important;
    overflow-wrap: break-word;
    word-break: normal;
  }
  .live-intel-hero-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    margin-top: 10px;
    width: 100%;
    max-width: calc(100vw - 44px) !important;
    gap: 8px;
    overflow: hidden;
  }
  .live-intel-hero-stats div:nth-child(3) {
    display: none;
  }
  .live-intel-hero-stats div {
    min-width: 0;
    padding: 6px 5px 0 0;
  }
  .live-intel-hero-stats strong {
    font-size: 0.74rem;
    line-height: 1.05;
    overflow-wrap: anywhere;
  }
  .live-intel-hero-stats span {
    margin-top: 3px;
    font-size: 0.52rem;
    line-height: 1.15;
  }
  .live-intel-hero-story {
    display: none;
  }
  .live-intel-hero-story-top {
    display: grid;
    align-items: flex-start;
    gap: 8px;
  }
  .live-intel-hero-story-top .live-intel-escalation {
    max-width: 100%;
    white-space: normal;
    justify-self: start;
  }
  .live-intel-hero-identity {
    min-height: 108px;
  }
  .live-intel-watch-stack {
    grid-template-columns: 1fr;
    gap: 8px;
    padding: 10px;
  }
  .live-intel-watch-brand {
    min-height: 0;
    display: flex;
    justify-content: flex-start;
    border-right: 0;
    border-bottom: 1px solid rgba(82,101,122,0.22);
    padding-bottom: 8px;
  }
  .live-intel-watch-brand strong {
    width: 40px;
    height: 40px;
    font-size: 1rem;
  }
  .live-intel-watch-stack strong {
    font-size: 0.74rem;
  }
  .live-intel-hero-story h2 {
    font-size: 1rem;
    line-height: 1.12;
    width: 100%;
    max-width: 100%;
    overflow-wrap: anywhere;
    word-break: normal;
  }
  .live-intel-hero-story p {
    font-size: 0.8rem;
    line-height: 1.48;
    max-width: 100%;
    overflow-wrap: anywhere;
    word-break: break-word;
    white-space: normal;
    overflow: visible;
  }
  .live-intel-hero-story-grid {
    display: none;
  }
  .live-intel-hero-story-grid div {
    padding: 7px 0 0;
  }
  .live-intel-hero-story-grid span {
    font-size: 0.52rem;
  }
  .live-intel-hero-story-grid strong {
    font-size: 0.7rem;
    line-height: 1.12;
    overflow-wrap: anywhere;
  }
  .live-intel-escalation-flow {
    gap: 7px;
    padding-top: 8px;
  }
  .live-intel-escalation-flow ol {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 10px;
  }
  .live-intel-escalation-flow li::before {
    display: none;
  }
  .live-intel-escalation-flow li span,
  .live-intel-escalation-flow > div span,
  .live-intel-pressure-window-list small,
  .live-intel-source-steps span {
    font-size: 0.56rem;
  }
  .live-intel-story-read {
    grid-template-columns: 1fr;
  }
  .live-intel-world,
  .live-intel-featured-story {
    margin-top: 24px;
  }
  .live-intel-featured-story {
    margin-top: 14px;
  }
  .live-intel-ops-desk {
    margin-top: 12px;
  }
  .live-intel-ops-grid {
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 8px 8px 10px;
  }
  .live-intel-window-lane header,
  .live-intel-pressure-stack > div:first-child {
    display: grid;
    gap: 3px;
  }
  .live-intel-window-lane header strong,
  .live-intel-pressure-stack > div:first-child strong {
    text-align: left;
  }
  .live-intel-window-row,
  .live-intel-window-placeholder {
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 7px;
  }
  .live-intel-window-row small {
    grid-column: 2;
    text-align: left;
  }
  .live-intel-situation-strip {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x proximity;
  }
  .live-intel-situation-strip a {
    flex: 0 0 min(236px, calc(100vw - 70px));
    scroll-snap-align: start;
  }
  .live-intel-situation-strip article {
    min-height: 112px;
  }
  .live-intel-change-brief {
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 12px;
  }
  .live-intel-change-list {
    grid-template-columns: 1fr;
  }
  .live-intel-object-cluster > div,
  .live-intel-object-escalation-grid {
    grid-template-columns: 1fr;
  }
  .live-intel-object-cluster header,
  .live-intel-monitoring-cluster header {
    padding: 8px 10px 6px;
  }
  .live-intel-object-fast {
    grid-template-columns: 1fr auto;
    gap: 7px 10px;
    padding: 10px;
  }
  .live-intel-object-fast h3 {
    grid-column: 1 / -1;
    font-size: 0.94rem;
  }
  .live-intel-object-fast p {
    grid-column: 1 / -1;
    font-size: 0.76rem;
  }
  .live-intel-object-escalating,
  .live-intel-object-escalating.is-lead {
    gap: 9px;
    padding: 12px 10px;
  }
  .live-intel-object-escalating header {
    display: grid;
    gap: 7px;
  }
  .live-intel-object-escalating h3 {
    font-size: 1.08rem;
  }
  .live-intel-object-escalating footer {
    display: grid;
    gap: 5px;
  }
  .live-intel-object-escalating footer span,
  .live-intel-object-escalating footer strong {
    max-width: 100%;
    text-align: left;
  }
  .live-intel-object-market,
  .live-intel-object-watch {
    padding: 10px;
  }
  .live-intel-market-line {
    grid-template-columns: 1fr;
    gap: 4px;
  }
  .live-intel-object-monitoring {
    grid-template-columns: 1fr;
    gap: 4px;
    padding: 9px 10px;
  }
  .live-intel-object-monitoring strong,
  .live-intel-object-monitoring small {
    white-space: normal;
  }
  .live-intel-object-official {
    grid-template-columns: auto minmax(0, 1fr);
  }
  .live-intel-object-official > strong {
    grid-column: 2;
    text-align: left;
  }
  .live-intel-pressure,
  .live-intel-source-arc {
    margin-top: 18px;
    padding: 16px 10px;
    gap: 14px;
  }
  .live-intel-pressure-lead h2,
  .live-intel-source-arc-copy h2 {
    font-size: 1.28rem;
    line-height: 1.05;
  }
  .live-intel-pressure-lanes {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .live-intel-pressure-lanes div {
    padding-left: 10px;
  }
  .live-intel-pressure-lanes p,
  .live-intel-source-arc-copy p {
    font-size: 0.8rem;
  }
  .live-intel-pressure-window-list {
    gap: 6px;
    margin-top: 10px;
  }
  .live-intel-pressure-window-list small {
    padding: 4px 6px;
  }
  .live-intel-source-arc-meter div {
    grid-template-columns: 1fr;
    gap: 4px;
    padding: 8px 0;
  }
  .live-intel-source-arc-meter strong {
    font-size: 0.8rem;
  }
  .live-intel-source-steps {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .live-intel-source-steps div {
    padding-top: 7px;
  }
  .live-intel-layout {
    margin-top: 30px;
    padding-top: 16px;
  }
  .live-intel-league-world {
    display: grid;
    grid-template-columns: 1fr;
    padding: 12px 10px 10px;
    gap: 10px;
    overflow-x: visible;
    mask-image: none;
  }
  .live-intel-league-node {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
  .live-intel-story-main {
    grid-template-columns: 1fr;
    gap: 14px;
    padding: 16px 14px;
  }
  .live-intel-editorial-mark {
    min-height: 0;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    padding: 0 0 14px;
    border-right: 0;
    border-bottom: 1px solid rgba(245,184,65,0.16);
  }
  .live-intel-editorial-mark strong {
    width: 54px;
    height: 54px;
    font-size: 1.22rem;
    grid-row: span 2;
  }
  .live-intel-editorial-mark small {
    max-width: 100%;
    font-size: 0.86rem;
  }
  .live-intel-story-panel h2 {
    font-size: 1.45rem;
    line-height: 1.03;
  }
  .live-intel-story-ops {
    padding: 12px;
  }
  .live-intel-story-timeline {
    margin-top: 14px;
  }
  .live-intel-story-timeline div {
    grid-template-columns: 50px 8px minmax(0, 1fr);
    gap: 8px;
  }
  .live-intel-story-timeline time,
  .live-intel-story-timeline p {
    font-size: 0.72rem;
  }
  .live-intel-refresh {
    margin-left: 0;
  }
  .live-intel-section-header {
    align-items: flex-start;
    padding: 12px 10px 8px;
  }
  .live-intel-section-header small {
    display: none;
  }
  .live-intel-game-strip {
    padding: 12px 8px 18px;
    gap: 12px;
    scroll-padding-inline: 8px;
  }
  .live-intel-game-pill {
    width: min(224px, calc(100vw - 64px));
    min-height: 146px;
  }
  .live-intel-now {
    min-height: 0;
  }
  .live-intel-now-visual {
    min-height: 156px;
    border-right: 0;
    border-bottom: 1px solid rgba(245,184,65,0.16);
  }
  .live-intel-team-identity img,
  .live-intel-team-identity strong {
    width: 88px;
    height: 88px;
  }
  .live-intel-now-copy {
    padding: 16px 14px;
  }
  .live-intel-now-copy h2 {
    font-size: 1.4rem;
    line-height: 1.05;
  }
  .live-intel-now-copy p {
    font-size: 0.82rem;
  }
  .live-intel-matchup {
    grid-template-columns: 40px minmax(0, 1fr) 40px;
    gap: 8px;
  }
  .live-intel-matchup strong {
    font-size: 1.02rem;
  }
  .live-intel-team-logo {
    width: 40px;
    height: 40px;
  }
  .live-intel-team-logo img {
    width: 32px;
    height: 32px;
  }
  .live-intel-card {
    padding: 11px;
    border-radius: 7px;
  }
  .live-intel-card-header {
    display: grid;
  }
  .live-intel-read-grid,
  .live-intel-evidence-row {
    grid-template-columns: 1fr;
  }
  .live-intel-card h2 {
    font-size: 1.04rem;
  }
  .live-intel-read-grid p,
  .live-intel-confidence p,
  .live-intel-timing span,
  .live-intel-validator-row span,
  .live-intel-timeline p,
  .live-intel-card-footer span {
    font-size: 0.76rem;
  }
  .live-intel-card-footer {
    align-items: flex-start;
    flex-direction: column;
  }
  .live-intel-timeline div {
    grid-template-columns: 58px 10px minmax(0, 1fr);
  }
  .live-intel-rail {
    display: none;
  }
}
@media (max-width: 520px) {
  .live-intel-hero-copy,
  .live-intel-hero-sports,
  .live-intel-hero-story {
    max-width: 100% !important;
  }
  .live-intel-hero-stats {
    max-width: 100% !important;
  }
}
.story-intel-teaser {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 16px;
  background: rgba(10, 18, 28, 0.88);
  border-top: 1px solid rgba(29, 158, 117, 0.22);
}

.story-intel-teaser-stats {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
}

/* Confidence pill — inherits tone class from confidenceDisplay() */
.story-intel-teaser-conf {
  font-family: var(--font-cond);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}
.story-intel-teaser-conf.is-verified,
.story-intel-teaser-conf.is-strong {
  color: #1D9E75;
}
.story-intel-teaser-conf.is-developing {
  color: #f5b841;
}
.story-intel-teaser-conf.is-forming,
.story-intel-teaser-conf.is-pending {
  color: #64748b;
}

/* Divider dots between stats */
.story-intel-teaser-stats > span + span::before {
  content: "·";
  margin-right: 10px;
  color: rgba(148, 163, 184, 0.35);
}

.story-intel-teaser-sources {
  color: #94a3b8;
  font-size: 0.72rem;
  font-weight: 760;
  white-space: nowrap;
}

.story-intel-teaser-agents {
  color: #64748b;
  font-size: 0.70rem;
  font-weight: 760;
  white-space: nowrap;
}

.story-intel-teaser-timing {
  color: #2DD4BF;
  font-family: var(--font-cond);
  font-size: 0.70rem;
  font-weight: 900;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

/* Toggle button — rightmost element */
.story-intel-teaser-toggle {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border: 1px solid rgba(29, 158, 117, 0.32);
  border-radius: 999px;
  background: rgba(29, 158, 117, 0.07);
  color: #7ecfb8;
  font-family: var(--font-cond);
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.story-intel-teaser-toggle:hover {
  background: rgba(29, 158, 117, 0.14);
  border-color: rgba(29, 158, 117, 0.5);
  color: #d4f2e6;
}
.story-intel-teaser-toggle.is-open {
  background: rgba(29, 158, 117, 0.18);
  border-color: rgba(29, 158, 117, 0.6);
  color: #eafff5;
}

/* Lead dek — slightly larger, slightly more spacing than generic <p> */
.story-lead-dek {
  font-size: 0.96rem !important;
  line-height: 1.55 !important;
  color: #cbd5e1 !important;
  margin-top: 2px;
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

/* Mobile adjustments for teaser strip */
@media (max-width: 760px) {
  .story-intel-teaser {
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 12px;
  }
  .story-intel-teaser-stats {
    gap: 7px;
  }
  .story-intel-teaser-toggle {
    width: 100%;
    justify-content: center;
  }
  .story-lead-dek {
    -webkit-line-clamp: 2;
  }
}


/* ─────────────────────────────────────────────────────────────────────────────
   TEAM LOGO TREATMENT — FLAT, NO CIRCLE
   Remove the circular container. Logo sits directly on card background.
   A subtle team-color glow replaces the border/background ring.
   Matches ESPN / The Athletic mark treatment.
────────────────────────────────────────────────────────────────────────────── */

/* Game pill / hero game logos */
.live-intel-team-logo {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  /* REMOVED: border-radius: 999px; border: 1px solid; background */
  border: none;
  border-radius: 0;
  background: transparent;
}

.live-intel-team-logo img {
  width: 36px;
  height: 36px;
  object-fit: contain;
  /* Soft drop shadow replaces the circle — color does the work */
  filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.12))
          drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5));
  transition: filter 0.15s ease;
}

.live-intel-team-logo img:hover {
  filter: drop-shadow(0 0 12px rgba(255, 255, 255, 0.22))
          drop-shadow(0 2px 8px rgba(0, 0, 0, 0.6));
}

/* Hero game card logo size */
.live-intel-hero-game .live-intel-team-logo {
  width: 34px;
  height: 34px;
}
.live-intel-hero-game .live-intel-team-logo img {
  width: 30px;
  height: 30px;
}

/* Team identity block (larger logo in game detail) */
.live-intel-team-identity img {
  width: 116px;
  height: 116px;
  display: block;
  /* REMOVED: border-radius, border, background, padding, box-shadow circle */
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 0;
  object-fit: contain;
  /* Glow replaces the ring */
  filter: drop-shadow(0 0 18px rgba(255, 255, 255, 0.10))
          drop-shadow(0 4px 14px rgba(0, 0, 0, 0.55));
}

/* league logo tabs — keep as-is (those are brand marks, not team logos) */
/* .media-league-tab-logo intentionally NOT changed */


/* ─────────────────────────────────────────────────────────────────────────────
   STORY CARD LEAD — sports image first, intel teaser after copy
   Ensure the visual zone fills the top of the card cleanly (no double borders)
   and the teaser strip sits flush at the bottom of the copy zone.
────────────────────────────────────────────────────────────────────────────── */

/* The lead card is a single-column grid: visual → copy → teaser → (intel zone) */
.story-card-lead {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto auto auto;
  align-content: start;
  padding: 0;
  gap: 0;
}

/* Copy section gets comfortable padding */
.story-card-lead .story-card-copy {
  padding: 14px 16px 12px;
  border-top: none;
}

/* Lead h2 — editorial size */
.story-card-lead h2 {
  font-family: var(--font-serif);
  font-size: clamp(1.375rem, 2.2vw, 1.875rem);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
  margin: 8px 0 6px;
  -webkit-line-clamp: 3;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
}

/* Lead card reads — 3-col below the dek */
.story-card-lead .story-card-reads {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(82, 101, 122, 0.22);
}
.story-card-lead .story-card-reads div {
  min-height: 0;
  padding: 0;
  border-left: 0;
  background: transparent;
}
.story-card-lead .story-card-reads span {
  font-family: var(--font-cond);
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  margin-bottom: 3px;
}
.story-card-lead .story-card-reads strong {
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--es-text-secondary, #94a3b8);
  line-height: 1.35;
  -webkit-line-clamp: 3;
}

/* Kicker treatment for lead */
.story-card-lead .story-card-kicker {
  font-family: var(--font-cond);
  font-size: 0.72rem;
  font-weight: 850;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--es-gold, #d9a441);
  gap: 8px;
  margin-bottom: 6px;
}
.story-card-lead .story-card-kicker span,
.story-card-lead .story-card-kicker strong {
  color: var(--es-gold, #d9a441);
}

/* Context line becomes gold on lead */
.story-card-lead .story-card-context {
  color: #f5b841;
  font-family: var(--font-cond);
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

/* Hide the old inline edge-overlay within lead (teaser replaces it) */
.story-card-lead > .edge-overlay {
  display: none;
}

/* Mobile: hide hero image, teaser strip goes flush to top */
@media (max-width: 760px) {
  .story-card-lead .story-card-visual .sports-story-visual {
    display: none;
  }
  .story-card-lead .story-hero-timing-banner {
    position: static;
    border-radius: 7px 7px 0 0;
  }
  .story-card-lead .story-card-copy {
    padding: 10px 12px 9px;
  }
  .story-card-lead h2 {
    font-size: 1.12rem;
    line-height: 1.08;
    margin-top: 0;
    -webkit-line-clamp: 2;
  }
  .story-card-lead p {
    font-size: 0.76rem;
    line-height: 1.28;
    -webkit-line-clamp: 1;
  }
  .story-card-lead .story-card-reads,
  .story-card-lead .edge-overlay {
    display: none;
  }
}

`;
