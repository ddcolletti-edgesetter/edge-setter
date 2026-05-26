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
import { fetchSignals } from "@/lib/signalsApi";
import { AlertTriangle, Crosshair, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { Link } from "wouter";

const REFRESH_MS = 60_000;
const LEAGUES = ["NBA", "MLB", "NFL", "CFB"] as const;
const HERO_FALLBACK_TILES = [
  { league: "MLB", title: "Awaiting lineup confirmations", note: "No major lineup shift yet" },
  { league: "NBA", title: "Availability board quiet", note: "Warmup reports pending" },
  { league: "NFL", title: "Depth charts quiet", note: "No major injury shift yet" },
  { league: "CFB", title: "Roster board quiet", note: "No major transfer shift yet" },
] as const;

const escalationOrder: EscalationState[] = ["Official", "Confirming", "Significant", "Escalating", "Emerging", "Monitoring"];

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
    logo: "",
  },
} as const;

export default function LiveIntelligenceHome() {
  const [situations, setSituations] = useState<IntelligenceSituation[]>([]);
  const [games, setGames] = useState<LiveGameSituation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLeague, setActiveLeague] = useState<"ALL" | typeof LEAGUES[number]>("ALL");
  const previousConfidenceRef = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const liveSignals = await fetchSignals();
      const nextSituations = adaptSignalsToSituations(liveSignals, previousConfidenceRef.current);
      previousConfidenceRef.current = Object.fromEntries(nextSituations.map((situation) => [situation.id, situation.confidence.current]));
      setSituations(nextSituations);
      setError(null);

      const gameResponses = await Promise.allSettled(
        LEAGUES.map((league) => fetchLiveGamesForSituations(league, nextSituations.filter((situation) => situation.league === league))),
      );
      setGames(gameResponses.flatMap((result) => result.status === "fulfilled" ? result.value : []));
    } catch {
      setError("Live feed unavailable. Showing the last loaded state.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const visibleSituations = useMemo(() => {
    return situations
      .filter((situation) => activeLeague === "ALL" || situation.league === activeLeague)
      .sort((a, b) => b.priority - a.priority);
  }, [situations, activeLeague]);

  const featured = selectHomepageLead(visibleSituations) ?? selectHomepageLead(situations);
  const heroSituation = featured;
  const editorialSituation = selectEditorialDevelopment(visibleSituations, heroSituation) ?? selectEditorialDevelopment(situations, heroSituation);
  const leadGames = useMemo(() => {
    const leagueRank = (game: LiveGameSituation) => game.league === "MLB" ? 0 : game.league === "NBA" ? 1 : 2;
    return [...games].sort((a, b) => leagueRank(a) - leagueRank(b) || b.activeSituations - a.activeSituations);
  }, [games]);
  const livePressure = useMemo(() => buildLivePressureContext(games, situations, loading), [games, situations, loading]);
  const tickerItems = useMemo(() => buildTickerItems({ situations, games, pressure: livePressure }), [games, livePressure, situations]);
  const counts = useMemo(() => {
    return escalationOrder.map((state) => ({
      state,
      count: visibleSituations.filter((situation) => situation.escalationState === state).length,
    }));
  }, [visibleSituations]);
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

  return (
    <AppShell brandContext="LIVE SPORTS DESK">
      <div className="live-intel-home">
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
        <LiveTicker items={tickerItems} />
        <section className="media-homepage" aria-label="EdgeSetter sports media network">
          <header className="media-homepage-header">
            <div className="live-intel-brand-anchor">
              <div className="live-intel-brand-logo-crop">
                <img
                  src="/brand/edgesetter-logo.png"
                  alt="EdgeSetter live sports intelligence"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                    const fallback = event.currentTarget.parentElement?.nextElementSibling as HTMLElement | null;
                    if (fallback) fallback.style.display = "block";
                  }}
                />
              </div>
              <strong>EdgeSetter</strong>
              <span>Sports media network with agent-calibrated intelligence</span>
            </div>
            <div className="media-homepage-leagues" aria-label="League story filters">
              {LEAGUES.map((league) => {
                const meta = leagueWorld[league];
                const count = situations.filter((situation) => situation.league === league).length;
                return (
                  <button
                    key={league}
                    type="button"
                    className={activeLeague === league || activeLeague === "ALL" ? "is-active" : ""}
                    onClick={() => setActiveLeague(league)}
                    style={{ "--league-color": meta.color } as CSSProperties}
                  >
                    <span>{league}</span>
                    <strong>{leagueWatchLabel(count)}</strong>
                  </button>
                );
              })}
              <button type="button" onClick={load} className="live-intel-hero-refresh" aria-label="Refresh live stories">
                <RefreshCw size={13} />
              </button>
            </div>
          </header>

          <div className="media-homepage-grid">
            <div className="media-homepage-main">
              <div className="media-section-label">
                <span className="es-live-dot es-live-pulse" />
                Top story
              </div>
              <StoryCard story={homepageStories.lead} variant="lead" />
            </div>

            <aside className="media-homepage-rail" aria-label="Headline stack">
              <div className="media-section-label">Headline stack</div>
              {homepageStories.rail.map((story) => (
                <StoryCard key={story.id} story={story} variant="rail" />
              ))}
              {!homepageStories.rail.length && <QuietCoverageCard pressure={livePressure} loading={loading} />}
            </aside>
          </div>

          <section className="media-game-context" aria-label="Active matchup and game context">
            <div className="live-intel-section-header">
              <div>
                <Zap size={15} />
                <span>Active Matchups</span>
              </div>
              <small>{livePressure.timing} / {livePressure.market}</small>
            </div>
            <div className="media-game-grid">
              {homepageStories.games.length
                ? homepageStories.games.map((story) => <StoryCard key={story.id} story={story} variant="compact" />)
                : HERO_FALLBACK_TILES.map((tile) => <StoryCard key={tile.league} story={quietLeagueStory(tile.league as typeof LEAGUES[number], tile.title, tile.note, loading)} variant="compact" />)}
            </div>
          </section>
        </section>

        {error && (
          <div className="live-intel-warning">
            <AlertTriangle size={15} />
            {error}
          </div>
        )}

        <section className="media-league-sections" aria-label="League story sections">
          {homepageStories.leagues.map((section) => (
            <section key={section.league} className="media-league-section">
              <div className="live-intel-section-header">
                <div>
                  <Crosshair size={15} />
                  <span>{section.league} Developing Stories</span>
                </div>
                <small>{section.summary}</small>
              </div>
              <div className="media-league-story-grid">
                {section.stories.map((story) => (
                  <StoryCard key={story.id} story={story} variant="feature" />
                ))}
              </div>
            </section>
          ))}
        </section>

        <PressureSection situation={heroSituation} pressure={livePressure} />
        <SourceArc situation={heroSituation} counts={counts} pressure={livePressure} />
        <LiveOperationsBand games={leadGames} situations={visibleSituations} loading={loading} pressure={livePressure} />
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

function buildHomepageStoryModel({
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
  const lead = featured
    ? situationToStoryCard(featured, { slot: "lead" })
    : quietNetworkStory(activeLeague, pressure, loading);

  const railSource = uniqueSituations([
    editorialSituation,
    ...situations.filter((situation) => situation.id !== featured?.id),
  ]);
  const rail = railSource.slice(0, 5).map((situation) => situationToStoryCard(situation, { slot: "rail" }));

  const gameStories = games
    .slice(0, 4)
    .map((game) => gameToStoryCard(game, situations.find((situation) => gameMatchesSituation(game, situation))));

  const leagues = LEAGUES.map((league) => {
    const leagueSituations = situations.filter((situation) => situation.league === league);
    const stories = leagueSituations.length
      ? leagueSituations.slice(0, 3).map((situation) => situationToStoryCard(situation, { slot: "league" }))
      : [quietLeagueStory(league, `${league} board quiet`, leagueQuietNote(league), loading)];
    return {
      league,
      summary: leagueSituations.length ? `${leagueSituations.length} evidence-backed update${leagueSituations.length === 1 ? "" : "s"}` : "No major verified shift",
      stories,
    } satisfies HomepageLeagueSection;
  });

  return { lead, rail, games: gameStories, leagues };
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

function situationToStoryCard(situation: IntelligenceSituation, { slot }: { slot: "lead" | "rail" | "league" }): StoryCardData {
  const matchupTeams = splitMatchup(situation.subject.matchup);
  return {
    id: situation.id,
    league: situation.league,
    headline: slot === "lead" ? sportsFirstHeadline(situation) : editorialHeadline(situation),
    dek: slot === "rail" ? compactIntelPhrase(situation.currentRead) : overlayRead(situation),
    label: slot === "lead" ? "Top developing story" : storyFrameLabel(situation),
    href: `/${situation.league.toLowerCase()}`,
    primaryTeam: situation.subject.team ?? matchupTeams[0] ?? undefined,
    secondaryTeam: matchupTeams[1] ?? undefined,
    player: situation.subject.player ?? undefined,
    storyType: storyFrameLabel(situation),
    detail: latestChangeLabel(situation),
    whatChanged: storyChangeLabel(situation),
    whyItMatters: compactIntelPhrase(situation.whyItMatters),
    watchNext: situation.actionWindow,
    overlay: {
      escalationState: situation.escalationState,
      confidence: situation.confidence,
      sourceSummary: situation.sourceSummary,
      timing: situation.timing,
      replay: replayLabelsForSituation(situation),
      status: "Agent-calibrated confidence",
    },
    situation,
  };
}

function gameToStoryCard(game: LiveGameSituation, situation?: IntelligenceSituation): StoryCardData {
  const score = game.awayScore !== null || game.homeScore !== null ? `${game.awayScore ?? "-"}-${game.homeScore ?? "-"}` : gameTimeLabel(game);
  const headline = situation
    ? `${shortTeam(game.awayTeam)} @ ${shortTeam(game.homeTeam)}: ${storyChangeLabel(situation)}`
    : `${shortTeam(game.awayTeam)} @ ${shortTeam(game.homeTeam)} sits in ${game.status.toLowerCase()} watch`;
  return {
    id: `game-${game.league}-${game.id}`,
    league: game.league,
    headline,
    dek: situation ? compactIntelPhrase(situation.currentRead) : `${game.status} / ${score}. EdgeSetter is monitoring lineup, injury, source, and game-state changes.`,
    label: game.status === "In Progress" ? "Live matchup" : "Game context",
    href: `/${game.league.toLowerCase()}`,
    primaryTeam: game.awayTeam,
    secondaryTeam: game.homeTeam,
    storyType: game.status === "In Progress" ? "Live game" : "Matchup watch",
    detail: `${game.activeSituations} linked update${game.activeSituations === 1 ? "" : "s"}`,
    whatChanged: situation ? storyChangeLabel(situation) : "No major evidence-backed change yet",
    whyItMatters: situation ? compactIntelPhrase(situation.whyItMatters) : "Game context can change when lineup, availability, or source confirmation lands.",
    watchNext: situation ? situation.actionWindow : "Watch for official team news and source convergence.",
    overlay: situation ? {
      escalationState: situation.escalationState,
      confidence: situation.confidence,
      sourceSummary: situation.sourceSummary,
      timing: situation.timing,
      replay: replayLabelsForSituation(situation),
      status: "Evidence-backed story",
    } : {
      escalationState: game.topEscalation,
      confidence: { current: null, delta: null, explanation: "No agent confidence score until a verified story attaches." },
      sourceSummary: { count: 0, convergence: "Awaiting source chain" },
      timing: { window: game.status, freshnessLabel: score },
      replay: ["Game window", "Source watch", "No major shift"],
      status: game.topEscalation ? "Developing story attached" : "Coverage watch",
    },
    situation,
  };
}

function quietNetworkStory(activeLeague: "ALL" | typeof LEAGUES[number], pressure: LivePressureContext, loading: boolean): StoryCardData {
  const league = activeLeague === "ALL" ? "MLB" : activeLeague;
  return quietLeagueStory(
    league,
    loading ? "Checking the live sports wire for verified movement." : pressure.heroHeadline,
    loading ? "EdgeSetter agents are scanning team news, game state, and source agreement." : pressure.heroBody,
    loading,
  );
}

function quietLeagueStory(league: typeof LEAGUES[number], title: string, note: string, loading: boolean): StoryCardData {
  return {
    id: `quiet-${league}-${title}`,
    league,
    headline: loading ? `${league} coverage check in progress` : title,
    dek: note,
    label: "Quiet slate watch",
    href: `/${league.toLowerCase()}`,
    primaryTeam: league,
    storyType: "Coverage watch",
    detail: "No evidence-backed escalation yet",
    whatChanged: "No major verified change",
    whyItMatters: "Quiet coverage is still useful because it confirms what has not changed across public reports and official channels.",
    watchNext: leagueQuietNote(league),
    overlay: {
      escalationState: "Monitoring",
      confidence: { current: null, delta: null, explanation: "Confidence pending until a verified story attaches." },
      sourceSummary: { count: 0, convergence: "Awaiting source chain" },
      timing: { window: loading ? "Checking" : "Monitoring", freshnessLabel: "Live scan" },
      replay: ["Coverage scan", "No major shift", "Continue watch"],
      status: "Quiet coverage",
    },
  };
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

function splitMatchup(matchup?: string | null) {
  if (!matchup) return [];
  return matchup.split(/\s+(?:@|vs\.?|at)\s+/i).map((part) => part.trim()).filter(Boolean).slice(0, 2);
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
              <strong>{loading ? "Loading live slate" : "No major lineup or injury shift yet"}</strong>
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

function LiveTicker({ items }: { items: string[] }) {
  const visibleItems = items.length ? items : ["Quiet board", "No major lineup or injury shift", "Books holding", "Awaiting reports"];
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

function selectHomepageLead(situations: IntelligenceSituation[]) {
  const ranked = situations
    .map((situation) => ({ situation, score: homepageStoryScore(situation) }))
    .sort((a, b) => b.score - a.score);
  const lead = ranked[0];
  return lead && lead.score >= 125 ? lead.situation : null;
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

function homepageStoryScore(situation: IntelligenceSituation) {
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
  if ((situation.timing.window === "Widely Known" || situation.timing.window === "Closing") && !hasHomepagePressure(text, situation)) return -1000;

  let score = situation.priority;
  if (situation.marketReaction) score += 28;
  if (situation.raw.betting_relevance) score += 14;
  if (situation.raw.fantasy_relevance) score += 10;
  if (situation.raw.signal_type === "line_move") score += 18;
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
  if (/(questionable|doubtful|game[- ]time|warmup|late scratch|scratch|limited|practice|shootaround|availability|injury|designation)/i.test(text)) score += 28;
  if (/(lineup|rotation|starter|starting|pitcher|ace|bullpen|minutes|usage|depth chart|qb|quarterback)/i.test(text)) score += 22;
  if (/(mvp|all-star|\bstar\b|captain|ace|qb1|closer|franchise)/i.test(text)) score += 18;
  if (/(source disagreement|split sources|not yet confirmed|awaiting confirmation|holding|monitoring)/i.test(text)) score += 12;
  if (/(transaction|designated .* assignment|designated for assignment|optioned|recalled|assigned|waived|claimed)/i.test(text)) score -= 50;
  if (/(placed .* injured list|injured list|10-day il|10-day injured list|retroactive)/i.test(text) && !situation.marketReaction) score -= 34;
  if (/(low back strain|hamstring strain|illness|rest day)/i.test(text) && !/(mvp|all-star|star|ace|qb|starter)/i.test(text)) score -= 18;
  if (!situation.subject.player && !situation.subject.team && !situation.subject.matchup) score -= 12;
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
  const league = mlbCount ? "MLB-led slate" : nbaCount ? "NBA watch" : "Cross-sport";

  if (loading && !games.length) {
    return {
      heroLeague: "Cross-sport",
      heroHeadline: "Sports desk is coming online",
      heroBody: "EdgeSetter is checking lineups, injuries, weather, game status, and public reports. No major development is promoted until the sports evidence is clear.",
      timing: "Pre-slate",
      market: "no major shift",
      source: "Awaiting reports",
      changed: "No major lineup or injury shift detected",
      whoReacts: "Lineup desks, fantasy players, and books are waiting for verified team news.",
      next: "A lineup confirmation, warmup note, weather update, or late movement may become relevant if verified.",
      sourceArcTitle: "Awaiting report support",
      sourceArcBody: "No lead story is promoted until reports, timing, or late movement reaches homepage weight.",
      escalationWatch: "No verified escalation",
      escalationStage: "Monitoring",
      pressureWindows: ["Pre-slate desk", "No major shift", "Awaiting reports"],
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

  return {
    heroLeague: league,
    heroHeadline: marketCount ? "Team and player updates are shaping the slate" : "No major lineup or injury shifts detected yet",
    heroBody: `${slateLine} ${weatherCount ? "Weather is part of the game read." : "EdgeSetter is waiting for a real team-news break before elevating a single story."}`,
    timing: timingLine,
    market: marketCount ? `${marketCount} sports shift${marketCount === 1 ? "" : "s"}` : "no major shift",
    source: sourceCount ? `${sourceCount} report${sourceCount === 1 ? "" : "s"} attached` : "Awaiting reports",
    changed: marketCount ? "Team or player news moving before public consensus" : upcoming.length ? "Games entering confirmation window" : "No major shift detected",
    whoReacts: mlbCount ? "Clubhouses, lineup desks, fantasy players, and books are waiting on the same confirmations." : "Teams, report desks, and books are holding for firmer confirmation.",
    next: weatherCount ? "Weather, lineup, and external context may converge before first pitch." : "A late scratch, lineup confirmation, warmup note, or external movement could become the lead.",
    sourceArcTitle: sourceCount ? "Reports active across the slate" : "Awaiting lineup or injury confirmation",
    sourceArcBody: sourceCount
      ? `${sourceCount} report${sourceCount === 1 ? "" : "s"} attached across the slate, but none have reached homepage escalation weight.`
      : "No report chain has reached homepage weight yet. The page is holding for a meaningful break, not filler.",
    escalationWatch: earlyCount ? `${earlyCount} early read${earlyCount === 1 ? "" : "s"}` : "No verified escalation",
    escalationStage: marketCount ? "Escalating" : sourceCount ? "Emerging" : "Monitoring",
    pressureWindows: buildFallbackPressureWindows({ upcoming: upcoming.length, live: live.length, marketCount, earlyCount, weatherCount, mlbCount, nbaCount }),
    convergenceSteps: [
      { label: "Slate context", state: "complete" },
      { label: sourceCount ? "Reports attached" : "Reports scanning", state: sourceCount ? "complete" : "active" },
      { label: marketCount ? "Sports movement" : "No major shift", state: marketCount ? "complete" : "active" },
      { label: "Official confirmation", state: "waiting" },
    ],
  };
}

function buildTickerItems({ situations, games, pressure }: { situations: IntelligenceSituation[]; games: LiveGameSituation[]; pressure: LivePressureContext }) {
  const market = situations
    .filter((situation) => situation.marketReaction)
    .slice(0, 2)
    .map((situation) => `${situation.league}: ${situation.subject.matchup ?? situation.subject.team ?? "team news"} confirmation window tightening`);
  const lineup = situations
    .filter((situation) => situation.raw.lineup_status || situation.raw.injury_designation)
    .slice(0, 2)
    .map((situation) => `${situation.league}: ${situation.subject.player ?? situation.subject.team ?? "availability"} confirmation window active`);
  const source = situations
    .filter((situation) => situation.sourceSummary.count > 1)
    .slice(0, 2)
    .map((situation) => `${situation.league}: ${situation.sourceSummary.count} reports lining up`);
  const game = games
    .filter((item) => item.activeSituations > 0)
    .slice(0, 2)
    .map((item) => `${item.league}: ${shortTeam(item.awayTeam)} @ ${shortTeam(item.homeTeam)} carrying ${item.activeSituations} active update${item.activeSituations === 1 ? "" : "s"}`);

  return [...market, ...lineup, ...source, ...game, pressure.changed, pressure.next]
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index)
    .slice(0, 8);
}

function buildFallbackPressureWindows(counts: { upcoming: number; live: number; marketCount: number; earlyCount: number; weatherCount: number; mlbCount: number; nbaCount: number }) {
  const windows = [
    counts.upcoming ? `${counts.upcoming} games entering confirmation window` : null,
    counts.live ? `${counts.live} live game${counts.live === 1 ? "" : "s"} with active desk read` : null,
    counts.marketCount ? `${counts.marketCount} sports shift${counts.marketCount === 1 ? "" : "s"} detected` : "no major shift",
    counts.weatherCount ? "Weather pressure in the slate model" : null,
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
  if (posture === "Awaiting source chain") return "Reports pending";
  return posture;
}

function marketReactionLabel(situation: IntelligenceSituation | null) {
  if (!situation?.marketReaction) return "No verified movement yet";
  if (situation.marketReaction.delta) return "Sports movement";
  if (situation.marketReaction.note) return situation.marketReaction.note;
  if (situation.marketReaction.current) return "External movement detected";
  return "Sports movement active";
}

function confidenceMovementLabel(situation: IntelligenceSituation | null) {
  if (!situation) return "Awaiting confirmation";
  if (situation.confidence.delta === null) return `${situation.confidence.current}% initial read`;
  return `${situation.confidence.current}% ${situation.confidence.delta > 0 ? "+" : ""}${situation.confidence.delta}`;
}

function latestChangeLabel(situation: IntelligenceSituation | null) {
  if (!situation) return "Reports pending";
  return situation.timeline.at(-1)?.detail ?? situation.currentRead;
}

function storyChangeLabel(situation: IntelligenceSituation) {
  if (situation.raw.injury_designation) return `${situation.raw.injury_designation} availability signal`;
  if (situation.raw.lineup_status) return `${situation.raw.lineup_status} lineup context`;
  if (situation.marketReaction) return `${situation.subject.matchup ?? situation.subject.team ?? "Team news"} shifted`;
  return situation.timeline.at(-1)?.label ?? "Live read updated";
}

function storyTimingLabel(situation: IntelligenceSituation) {
  if (situation.timing.window === "Early") return "early signal";
  if (situation.timing.window === "Developing") return "developing window";
  if (situation.timing.window === "Widely Known") return "widely known";
  if (situation.timing.window === "Closing") return "fully priced";
  if (situation.timing.window === "Stale") return "stale signal";
  return "no major shift";
}

function editorialHeadline(situation: IntelligenceSituation) {
  const subject = situation.subject.player ?? situation.subject.team ?? situation.subject.matchup;
  if (situation.marketReaction && subject) return `${subject} confirmation window tightening`;
  if (situation.raw.injury_designation && subject) return `${subject} availability is moving the slate`;
  if (situation.raw.lineup_status && subject) return `${subject} lineup status is active`;
  return situation.headline;
}

function overlayRead(situation: IntelligenceSituation) {
  const parts = [
    storyChangeLabel(situation),
    storyTimingLabel(situation),
    situation.marketReaction ? marketReactionLabel(situation) : "no major shift",
    sourcePostureShortLabel(situation),
  ].filter(Boolean);
  return parts.join(" / ");
}

function sportsFirstHeadline(situation: IntelligenceSituation) {
  const subject = situation.subject.matchup ?? situation.subject.team ?? situation.subject.player;
  if (subject && situation.marketReaction) return `${subject} confirmation window tightening`;
  if (subject && situation.raw.injury_designation) return `${subject} availability status is moving`;
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
  const phrase = firstSentence || value.trim();
  if (phrase.length <= 72) return phrase;
  return `${phrase.slice(0, 69).trim()}...`;
}

function PressureSection({ situation, pressure }: { situation: IntelligenceSituation | null; pressure: LivePressureContext }) {
  const windows = situation ? pressureWindowsForSituation(situation) : pressure.pressureWindows;

  return (
    <section className="live-intel-pressure" aria-label="Next update window">
      <div className="live-intel-pressure-lead">
        <span>Next update window</span>
        <h2>{situation ? situation.actionWindow : pressure.heroHeadline}</h2>
        <div className="live-intel-pressure-window-list">
          {windows.map((window) => <small key={window}>{window}</small>)}
        </div>
      </div>
      <div className="live-intel-pressure-lanes">
        <div>
          <strong>What changed</strong>
          <p>{situation ? latestChangeLabel(situation) : pressure.changed}</p>
        </div>
        <div>
          <strong>Who reacts</strong>
          <p>{situation ? storyReactionLabel(situation) : pressure.whoReacts}</p>
        </div>
        <div>
          <strong>What could happen next</strong>
          <p>{situation ? implicationLabel(situation) : pressure.next}</p>
        </div>
      </div>
    </section>
  );
}

function pressureWindowsForSituation(situation: IntelligenceSituation) {
  const windows = [
    situation.timing.window === "Early" ? "early signal" : null,
    situation.raw.lineup_status ? "Lineup window active" : null,
    situation.raw.injury_designation ? "Availability pressure" : null,
    situation.marketReaction ? `Sports movement ${situation.marketReaction.delta ?? ""}`.trim() : "No major shift",
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
        <h2>{situation ? sourcePostureLabel(situation) : pressure.sourceArcTitle}</h2>
        <p>
          {situation
            ? `${situation.sourceSummary.count} reports tracked with ${situation.validators.agreement.toLowerCase()} and ${confidenceMovementLabel(situation)} confidence movement.`
            : pressure.sourceArcBody}
        </p>
      </div>
      <div className="live-intel-source-arc-meter">
        <div>
          <span>Confidence movement</span>
          <strong>{situation ? confidenceMovementLabel(situation) : "Holding for signal quality"}</strong>
        </div>
        <div>
          <span>Sports movement</span>
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
    { label: situation.validators.agreement.includes("strong") ? "Strong report quality" : situation.validators.label, state: situation.sourceSummary.count > 1 ? "complete" : "active" },
    { label: situation.marketReaction ? "Sports movement confirmed" : "No major shift", state: situation.marketReaction ? "complete" : "waiting" },
    { label: situation.escalationState === "Official" ? "Official confirmation" : "Official not final", state: situation.escalationState === "Official" ? "complete" : "waiting" },
  ];
}

function storyFrameLabel(situation: IntelligenceSituation) {
  if (situation.marketReaction) return "Sports movement";
  if (situation.raw.injury_designation) return "Availability pressure";
  if (situation.raw.lineup_status) return "Lineup volatility";
  if (situation.raw.weather_note) return "Weather pressure";
  return situation.subject.player ?? situation.subject.team ?? situation.subject.matchup ?? "Team news";
}

function shortTeam(team: string) {
  const parts = team.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1].slice(0, 3).toUpperCase() : team.slice(0, 3).toUpperCase();
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
  padding: 18px 20px 48px;
  position: relative;
  overflow: hidden;
}
.live-intel-home::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.32;
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
.live-intel-home > div:not(.live-intel-atmosphere) {
  position: relative;
  z-index: 1;
}
.media-homepage {
  display: grid;
  gap: 14px;
  width: 100%;
  max-width: 1320px;
  margin: 0 auto 18px;
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
  gap: 14px;
  padding: 10px 0 2px;
}
.media-homepage-leagues {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 7px;
}
.media-homepage-leagues button {
  min-height: 38px;
  padding: 7px 10px;
  border: 1px solid rgba(82,101,122,0.36);
  border-radius: 6px;
  background: rgba(10,18,28,0.64);
  color: #94a3b8;
  font-family: var(--font-cond);
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}
.media-homepage-leagues button.is-active {
  border-color: var(--league-color);
  color: #f8fafc;
  box-shadow: inset 0 -2px 0 var(--league-color);
}
.media-homepage-leagues button strong,
.media-homepage-leagues button span {
  display: block;
  line-height: 1.05;
}
.media-homepage-leagues button strong {
  margin-top: 4px;
  color: #cbd5e1;
  font-size: 0.57rem;
}
.media-homepage-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 390px;
  gap: 14px;
  align-items: start;
  max-width: 100%;
  overflow: hidden;
}
.media-homepage-main,
.media-homepage-rail,
.media-game-context,
.media-league-section {
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid rgba(82,101,122,0.24);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(9,16,25,0.72), rgba(5,8,12,0.58));
  box-shadow: 0 18px 48px rgba(0,0,0,0.22);
}
.media-homepage-main {
  padding: 12px;
}
.media-homepage-rail {
  display: grid;
  gap: 10px;
  padding: 12px;
}
.media-section-label {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
  color: #f5b841;
  font-family: var(--font-cond);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.14em;
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
.media-league-sections {
  display: grid;
  max-width: 1320px;
  margin: 18px auto 0;
  gap: 14px;
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
  border: 1px solid rgba(82,101,122,0.26);
  border-radius: 7px;
  background: linear-gradient(180deg, rgba(12,20,31,0.86), rgba(6,10,15,0.78));
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
  grid-template-columns: minmax(260px, 0.82fr) minmax(0, 1fr);
  align-items: stretch;
  padding: 14px;
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
.story-card-lead .edge-overlay {
  grid-column: 1 / -1;
}
.story-card-rail,
.story-card-compact {
  gap: 9px;
  padding: 10px;
}
.story-card-rail .story-card-visual,
.story-card-compact .story-card-visual {
  display: none;
}
.story-card-copy {
  display: grid;
  align-content: start;
  gap: 8px;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
}
.story-card-kicker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: #94a3b8;
  font-family: var(--font-cond);
  font-size: 0.66rem;
  font-weight: 900;
  letter-spacing: 0.12em;
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
  font-family: var(--font-cond);
  font-size: 1.12rem;
  font-weight: 950;
  letter-spacing: 0;
  line-height: 1.08;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: normal;
}
.story-card-lead h2 {
  font-size: clamp(1.65rem, 3.2vw, 3.25rem);
  line-height: 0.98;
}
.story-card-rail h2,
.story-card-compact h2 {
  font-size: 0.96rem;
  line-height: 1.12;
}
.story-card-compact p,
.story-card-rail p {
  font-size: 0.78rem;
  line-height: 1.36;
}
.story-card p {
  margin: 0;
  color: #cbd5e1;
  font-size: 0.86rem;
  line-height: 1.45;
}
.story-card-reads {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}
.story-card-rail .story-card-reads,
.story-card-compact .story-card-reads {
  grid-template-columns: 1fr;
}
.story-card-rail .story-card-reads div:nth-child(n+2),
.story-card-compact .story-card-reads div:nth-child(n+2) {
  display: none;
}
.story-card-reads div {
  min-height: 64px;
  padding: 8px 9px;
  border-left: 1px solid rgba(82,101,122,0.32);
  background: rgba(255,255,255,0.028);
}
.story-card-reads span {
  display: block;
  margin-bottom: 4px;
  color: #64748b;
  font-family: var(--font-cond);
  font-size: 0.58rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.story-card-reads strong {
  display: -webkit-box;
  overflow: hidden;
  color: #dbe7f4;
  font-size: 0.76rem;
  line-height: 1.35;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}
.edge-overlay {
  display: grid;
  gap: 9px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 10px;
  border: 1px solid rgba(111,164,191,0.22);
  border-radius: 6px;
  background: rgba(5,8,12,0.48);
}
.edge-overlay-top,
.edge-overlay-replay {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #94a3b8;
  font-size: 0.72rem;
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
  gap: 7px;
}
.edge-overlay-primitives {
  grid-template-columns: 1fr 1fr;
}
.edge-overlay-grid div {
  display: grid;
  gap: 3px;
  padding: 8px;
  border: 1px solid rgba(82,101,122,0.20);
  border-radius: 5px;
  background: rgba(255,255,255,0.026);
}
.edge-overlay-grid svg,
.edge-overlay-replay svg {
  color: #6fa4bf;
}
.edge-overlay-grid span {
  color: #64748b;
  font-family: var(--font-cond);
  font-size: 0.58rem;
  font-weight: 900;
  letter-spacing: 0.10em;
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
.edge-overlay.is-compact .edge-overlay-grid {
  grid-template-columns: 1fr;
}
.edge-overlay.is-compact .edge-overlay-grid div:nth-child(n+3) {
  display: none;
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
@media (max-width: 1100px) {
  .media-homepage-grid,
  .story-card-lead {
    grid-template-columns: minmax(0, 1fr);
  }
  .media-game-grid,
  .media-league-story-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .live-intel-home {
    width: 100vw;
    max-width: 100vw;
    box-sizing: border-box;
    overflow-x: hidden;
    padding-right: 12px;
    padding-left: 12px;
  }
  .media-homepage {
    gap: 10px;
    width: calc(100vw - 48px);
    margin-bottom: 12px;
    max-width: calc(100vw - 48px);
    overflow: hidden;
  }
  .media-homepage-header {
    display: grid;
    gap: 10px;
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
    width: calc(100vw - 72px);
    max-width: calc(100vw - 72px);
  }
  .media-homepage-leagues button {
    min-height: 36px;
    padding: 6px;
  }
  .media-homepage-main,
  .media-homepage-rail {
    width: 100%;
    max-width: calc(100vw - 48px);
    padding: 9px;
  }
  .media-homepage-grid,
  .media-league-sections,
  .media-game-context,
  .media-league-section {
    width: 100%;
    max-width: calc(100vw - 48px);
  }
  .media-game-grid,
  .media-league-story-grid {
    grid-template-columns: 1fr;
    padding: 8px;
  }
  .story-card {
    padding: 10px;
  }
  .story-card-lead {
    padding: 10px;
  }
  .story-card-visual .sports-story-visual {
    min-height: 172px;
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
    display: block;
    overflow: visible;
    width: min(260px, calc(100vw - 128px));
    max-width: min(260px, calc(100vw - 128px));
    font-size: 1.32rem;
    line-height: 1.02;
    white-space: normal !important;
    overflow-wrap: normal;
    word-break: normal;
  }
  .story-card p {
    width: calc(100vw - 128px);
    max-width: calc(100vw - 128px);
    font-size: 0.8rem;
    overflow-wrap: anywhere;
  }
  .story-card-reads strong {
    max-width: calc(100vw - 128px);
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
  opacity: 0.13;
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
  opacity: 0.11;
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
  opacity: 0.26;
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
  opacity: 0.16;
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
  opacity: 0.16;
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
  opacity: 0.14;
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
  opacity: 0.15;
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
  padding: 11px 16px 10px 18px;
  border-left: 3px solid rgba(245,184,65,0.88);
  background:
    linear-gradient(90deg, rgba(245,184,65,0.16), rgba(24,212,123,0.045) 58%, transparent);
  box-shadow: 18px 0 42px rgba(245,184,65,0.045);
}
.live-intel-brand-anchor::after {
  content: "";
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: 5px;
  height: 1px;
  background: linear-gradient(90deg, rgba(245,184,65,0.74), rgba(24,212,123,0.28), transparent);
}
.live-intel-brand-logo-crop {
  display: block;
  width: min(250px, 54vw);
  height: 42px;
  overflow: hidden;
}
.live-intel-brand-anchor img {
  display: block;
  width: 430px;
  max-width: none;
  height: 81px;
  object-fit: contain;
  object-position: left center;
  transform: translate(-44px, -20px);
}
.live-intel-brand-anchor strong {
  display: none;
  color: #f8fafc;
  font-family: var(--font-cond);
  font-size: 1.34rem;
  font-weight: 950;
  letter-spacing: 0.14em;
  line-height: 1;
  text-transform: uppercase;
}
.live-intel-brand-anchor span {
  color: #f5b841;
  font-family: var(--font-cond);
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.14em;
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
  padding: 8px 13px 8px 14px;
}
.live-intel-brand-logo-crop {
  width: min(190px, 42vw);
  height: 32px;
}
.live-intel-brand-anchor img {
  width: 326px;
  height: 62px;
  transform: translate(-34px, -15px);
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
  margin: 0;
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
  mask-image: linear-gradient(90deg, transparent, black 5%, black 95%, transparent);
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
  text-transform: uppercase;
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
    padding: 7px 10px 7px 12px;
  }
  .live-intel-brand-logo-crop {
    width: min(150px, 52vw);
    height: 28px;
  }
  .live-intel-brand-anchor img {
    width: 258px;
    height: 49px;
    transform: translate(-27px, -12px);
  }
  .live-intel-brand-anchor strong {
    font-size: 1.08rem;
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
`;
