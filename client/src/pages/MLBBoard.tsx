import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLocation, useSearch } from "wouter";

import AppShell from "@/components/V2Shell";
import { LiveTicker, buildBoardTickerItems } from "@/components/LiveTicker";
import { BoardSignalRail } from "@/components/BoardSignalRail";
import { SignalDetailDrawer, type SignalDetailLike } from "@/components/SignalDetailDrawer";
import { BoardCommandBar } from "@/components/board/BoardCommandBar";
import { BoardPriorityControls } from "@/components/board/BoardPriorityControls";
import { FeaturedSituation } from "@/components/board/FeaturedSituation";
import { LiveGameStrip } from "@/components/board/LiveGameStrip";
import { SituationLane } from "@/components/board/SituationLane";
import { SituationStoryCard } from "@/components/board/SituationStoryCard";
import {
  featuredCopy,
  situationMatchesPriority,
  sortModeFromPriority,
  toLiveGamePillData,
  toSituationStoryCardData,
  toSituationRowData,
  type AnyBoardGame,
} from "@/components/board/boardAdapters";
import { useMLBSignals } from "@/hooks/useSignals";
import { buildBoardSituations, rankBoardSituations, type BoardSituation } from "@/lib/boardSituations";
import { selectFeaturedSituation } from "@/lib/leadRanker";
import { getLeagueBoardProfile } from "@/lib/leagueBoardProfiles";
import { canonicalSituationsToBoardSituations, mergeCanonicalWithBoardSituations } from "@/lib/situationAdapters";
import { filterCanonicalSituations, useCanonicalSituations } from "@/lib/situationsApi";
import { boardFilterFeedback, boardSortFeedback, compareSignals, signalIsActionable, signalLifecycle, type BoardSortMode } from "@/lib/signalBoardUx";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { containsPublicInvalidToken, hasCleanPublicTeamIdentity, hasCleanPublicText, publicGamesForLeague } from "@/lib/publicDisplayHygiene";
import type { SituationLaneType } from "@/components/board/SituationRow";

type Signal = {
  id: number | string;
  headline: string;
  detail: string | null;
  player: string | null;
  team: string | null;
  opponent?: string | null;
  type: string;
  confidence: number | null;
  verdict: string | null;
  action_takeaway: string | null;
  timestamp: string;
};

type LiveGame = {
  id: number | string;
  sport: "mlb";
  espnEventId: string;
  homeTeam: string | null;
  awayTeam: string | null;
  gameDate: Date | null;
  statusDescription: string | null;
  homeScore: number | null;
  awayScore: number | null;
  cachedAt: Date;
};

const FEED_TABS = [
  { key: "today", label: "Today" },
  { key: "pitchers", label: "Pitchers" },
  { key: "lineup", label: "Lineup" },
  { key: "props", label: "Props" },
  { key: "trends", label: "Trends" },
  { key: "line_moves", label: "Movement" },
];

const TAB_SIGNAL_TYPE: Record<string, string | null> = {
  today: null,
  pitchers: "injury",
  lineup: "lineup",
  props: "prop",
  trends: "trend",
  line_moves: "line_move",
};

const PRO_THRESHOLD = 10;

export default function MLBBoard() {
  const [, navigate] = useLocation();
  const [activeGameId, setActiveGameId] = useState<string | undefined>();
  const [sortMode, setSortMode] = useState<BoardSortMode>("priority");
  const [activeLane, setActiveLane] = useState<SituationLaneType | "all">("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [compact, setCompact] = useState(true);
  const [showConfirmed, setShowConfirmed] = useState(true);
  const [liveOnly, setLiveOnly] = useState(false);
  const [actionableOnly, setActionableOnly] = useState(false);
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [selectedSig, setSelectedSig] = useState<SignalDetailLike | null>(null);

  const search = useSearch();
  const activeTab = useMemo(() => new URLSearchParams(search).get("tab") ?? "today", [search]);
  const setActiveTab = (tab: string) => {
    window.history.pushState({}, "", tab === "today" ? "/mlb" : `/mlb?tab=${tab}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const { signals: data, loading: isLoading, refresh } = useMLBSignals([]);
  const { situations: canonicalSituations, loading: canonicalLoading, error: canonicalError, refresh: refreshCanonical } = useCanonicalSituations({
    league: "MLB",
    activeOnly: false,
    limit: 100,
    orderBy: "operational_visibility_score",
    poll: false,
  });
  const profile = getLeagueBoardProfile("MLB");
  const allSignals = (data ?? []) as Signal[];

  useEffect(() => {
    fetchWithTimeout("/api/v2/games?league=MLB", {}, 4500)
      .then((response) => response.json())
      .then((payload) => {
        const statusLabel: Record<string, string> = {
          live: "In Progress",
          final: "Final",
          scheduled: "Scheduled",
          postponed: "Postponed",
        };
        const adapted: LiveGame[] = publicGamesForLeague(payload.games ?? [], "MLB")
          .map((game: any) => ({
            id: game.id,
            sport: "mlb" as const,
            espnEventId: game.source_game_id ?? game.id,
            homeTeam: game.home_team ?? null,
            awayTeam: game.away_team ?? null,
            gameDate: game.game_time ? new Date(game.game_time) : null,
            statusDescription: statusLabel[game.status] ?? game.status ?? null,
            homeScore: game.home_score ?? null,
            awayScore: game.away_score ?? null,
            cachedAt: new Date(game.updated_at ?? game.created_at),
          }));
        setLiveGames(adapted);
      })
      .catch(() => setLiveGames([]))
      .finally(() => setGamesLoading(false));
  }, []);

  const filteredSignals = useMemo(() => {
    const typeFilter = TAB_SIGNAL_TYPE[activeTab];
    return allSignals
      .filter((signal) => !typeFilter || signal.type === typeFilter)
      .filter((signal) => !liveOnly || signalLifecycle(signal) === "Early" || signalLifecycle(signal) === "Developing")
      .filter((signal) => !actionableOnly || signalIsActionable(signal))
      .sort((a, b) => compareSignals(a, b, sortMode));
  }, [activeTab, actionableOnly, allSignals, liveOnly, sortMode]);

  const situations = useMemo(() => {
    const fallback = buildBoardSituations({
      league: "MLB",
      games: liveGames as AnyBoardGame[],
      signals: filteredSignals as any[],
    });
    const canonicalBoard = canonicalSituationsToBoardSituations(
      filterCanonicalSituations(canonicalSituations, {
        league: "MLB",
        situationType: canonicalTypeForTab(activeTab),
      }),
      "MLB",
    );
    return rankBoardSituations(mergeCanonicalWithBoardSituations(canonicalBoard, fallback))
      .filter((situation) => showConfirmed || situation.lane !== "confirmed")
      .filter((situation) => situationMatchesPriority(situation, urgencyFilter));
  }, [activeTab, canonicalSituations, filteredSignals, liveGames, showConfirmed, urgencyFilter]);

  const cleanSituations = useMemo(() => situations.filter(isCleanMlbSituation), [situations]);
  const featured = selectFeaturedSituation(cleanSituations.filter(isHighQualityMlbLeadSituation));
  const hasElevatedLeadStory = Boolean(featured && featured.escalation !== "Quiet" && featured.lane !== "background");
  const leadSituation = hasElevatedLeadStory ? featured : null;
  const featuredRow = useMemo(() => leadSituation ? toSituationRowData(leadSituation) : undefined, [leadSituation]);
  const featuredDetails = useMemo(() => featuredCopy(leadSituation, "MLB"), [leadSituation]);
  const storyItems = useMemo(() => cleanSituations.map((situation) => {
    const row = toSituationRowData(situation);
    return {
      situation,
      row,
      story: toSituationStoryCardData(row),
    };
  }).filter(isRenderableMlbStoryItem), [cleanSituations]);
  const livePills = useMemo(() => liveGames.map((game) => toLiveGamePillData(game, relatedSignalCount(game, allSignals), "mlb")), [allSignals, liveGames]);
  const visibleLanes = profile.laneOrder.filter((lane) => activeLane === "all" || activeLane === lane);
  const hasSituations = cleanSituations.length > 0;
  const isInitialBoardLoading = !hasSituations && (isLoading || canonicalLoading || gamesLoading);
  const topUrgentItems = storyItems.filter((item) => item.situation.lane === "escalating" && (item.situation.kind === "signal" || item.situation.kind === "canonical")).slice(0, 2);
  const monitoredLabel = cleanSituations.length ? `${cleanSituations.length} stories monitored` : "Desk active";

  const openSituation = (situation: BoardSituation) => {
    if (situation.kind !== "signal" && situation.kind !== "canonical") return;
    const signal = situation.signal as Signal | SignalDetailLike | undefined;
    if (!signal) return;
    if (situation.kind === "canonical") {
      navigate("/story/" + encodeURIComponent(String(signal.id)));
      return;
    }
    const index = filteredSignals.findIndex((item) => String(item.id) === String(signal.id));
    if (index >= PRO_THRESHOLD) return;
    setSelectedSig(signal as SignalDetailLike);
  };

  return (
    <AppShell>
      <div className="league-board-shell es-league-mlb">
        <LiveTicker items={buildBoardTickerItems(canonicalSituations)} />
        <main className="board-main-col mx-auto flex w-[calc(100vw-24px)] max-w-[calc(100vw-24px)] flex-col gap-3 overflow-x-hidden py-3 sm:w-full sm:max-w-7xl sm:px-6 sm:py-5">
          <BoardCommandBar
          kicker="MLB Watch Desk"
          title="MLB Today"
          statusLabel={`${monitoredLabel} / Lineups, pitchers, weather, and market movement`}
          liveCount={liveGames.filter((game) => game.statusDescription?.toLowerCase().includes("in progress")).length}
          actions={[{ label: "Refresh", icon: <RefreshCw className="h-4 w-4" />, onClick: () => { refresh(); refreshCanonical(); }, variant: "outline" }]}
        />

        <div className="board-content-grid">
          <FeaturedSituation
            situation={featuredRow}
            eyebrow={hasElevatedLeadStory ? profile.featuredLabel : "MLB Watch"}
            title={featuredDetails.title}
            summary={featuredDetails.summary}
            primaryRead={featuredDetails.primaryRead}
            secondaryRead={featuredDetails.secondaryRead}
            metrics={featuredDetails.metrics}
            mobileDensity="compact"
            className="sm:mb-1"
            actions={hasElevatedLeadStory && featured ? [{ label: "Open Story", onClick: () => openSituation(featured) }] : undefined}
          />
          <div className="board-right-rail">
            <BoardSignalRail situations={cleanSituations} />
            <LiveGameStrip
              title={profile.liveStripLabel}
              summary={gamesLoading ? "Slate context loading." : "Probable pitchers, lineup cards, weather, bullpen load, source agreement, and inning states stay on watch."}
              games={livePills}
              activeGameId={activeGameId}
              copyVariant="editorial"
              emptyLabel="Lineup cards, probable pitchers, weather, and bullpen context remain on watch before first pitch."
              onGameSelect={(game) => setActiveGameId(activeGameId === game.id ? undefined : game.id)}
            />
          </div>
        </div>

        {topUrgentItems.length > 0 && (
          <div className="sm:hidden">
            <SituationLane
              lane="escalating"
              title="Stories to Watch"
              summary="Highest-priority changes before the broader board."
              situations={topUrgentItems.map((item) => item.row)}
              compact
              copyVariant="editorial"
              onSituationSelect={(row) => {
                const item = topUrgentItems.find((candidate) => candidate.row.id === row.id);
                if (item) openSituation(item.situation);
              }}
            />
          </div>
        )}

        {hasSituations ? (
          <>
            <section className="advanced-story-controls rounded-md border border-border/70 bg-card/55 p-2.5">
              <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
                <span className="data-label text-primary">Advanced Story Board</span>
                <span className="text-[0.72rem] font-semibold text-muted-foreground">Filter the board detail below the editorial lead.</span>
              </div>
              <BoardPriorityControls
                activeLane={activeLane}
                activeSortId={sortIdForMode(sortMode)}
                activeUrgencyId={urgencyFilter}
                compact={compact}
                showConfirmed={showConfirmed}
                copyVariant="editorial"
                className="border-border/50 bg-background/20 shadow-none"
                onLaneChange={setActiveLane}
                onSortChange={(value) => setSortMode(sortModeFromPriority(value))}
                onUrgencyChange={setUrgencyFilter}
                onCompactChange={setCompact}
                onShowConfirmedChange={setShowConfirmed}
              />

              <div className="board-control-feedback mt-2 rounded border border-border/60 bg-muted/5">
                {boardSortFeedback(sortMode)} {boardFilterFeedback({ filter: FEED_TABS.find((tab) => tab.key === activeTab)?.label, liveOnly, actionableOnly })}
                {canonicalError ? ` ${canonicalError}` : ""}
              </div>
            </section>

            <div className="grid gap-3">
              {visibleLanes.map((lane, index) => {
                const laneItems = storyItems.filter((item) => item.situation.lane === lane);
                if (!laneItems.length) return null;
                return (
                  <section
                    key={lane}
                    className={`situation-lane situation-lane-${lane} max-w-full overflow-hidden rounded-md border border-border bg-card/80 ${index === 0 ? "bg-card/85" : lane === "background" ? "bg-card/70" : ""}`}
                  >
                    <header className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-muted/10 px-3 py-2.5">
                      <span className="data-label text-primary">{profile.laneLabels[lane]}</span>
                      <strong className="min-w-0 flex-1 truncate text-sm text-foreground">{laneSummary(lane)}</strong>
                      <span className="rounded border border-border bg-muted/20 px-2 py-1 text-[0.66rem] font-bold uppercase tracking-widest text-muted-foreground tabular-nums">
                        {laneItems.length} stories
                      </span>
                    </header>
                    <div className="grid gap-3 p-3">
                      {laneItems.length ? (
                        laneItems.map(({ situation, story }) => {
                          return (
                            <SituationStoryCard
                              key={situation.id}
                              story={story}
                              compact={compact && lane === "background"}
                              onOpen={(situation.kind === "signal" || situation.kind === "canonical") ? () => openSituation(situation) : undefined}
                            />
                          );
                        })
                      ) : (
                        <div className="rounded border border-border bg-muted/10 px-3 py-4 text-sm font-medium text-muted-foreground">
                          {emptyLaneCopy(lane)}
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
            {storyItems.length > 0 && (
              <div className="mt-1 flex items-center justify-between rounded border border-border/50 bg-muted/5 px-3 py-2 text-[0.7rem] font-semibold text-muted-foreground/70">
                <span>{storyItems.length} MLB stories shown</span>
                <span>Board updated {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            )}
          </>
        ) : isInitialBoardLoading ? (
          <BoardLoadingState
            title="Loading MLB story board"
            detail="Checking lineup cards, probable pitchers, weather cells, bullpen usage, source agreement, and market reaction before ranking the slate."
            checks={["Signals", "Canonical stories", "Game context", "Images"]}
          />
        ) : (
          <SparseOperationalState
            title="Watch next"
            detail="Lineup cards, probable and confirmed pitchers, weather cells, bullpen availability, late scratches, and source-backed market movement stay on the board."
            checks={["Lineup cards", "Pitcher status", "Weather cells", "Bullpen load"]}
          />
        )}

        {allSignals.length > PRO_THRESHOLD && (
          <div className="rounded border border-primary/25 bg-primary/5 px-4 py-3 text-sm font-medium text-muted-foreground">
            <strong className="text-primary">{Math.max(0, filteredSignals.length - PRO_THRESHOLD)} stories locked</strong> - Pro members see the full confidence, source, timing, and verification detail set.
          </div>
        )}

        {(isLoading || canonicalLoading) && hasSituations && <div className="es-skeleton h-16 rounded border border-border" />}
      </main>
      </div>

      <SignalDetailDrawer open={Boolean(selectedSig)} signal={selectedSig} sport="MLB" onClose={() => setSelectedSig(null)} />
    </AppShell>
  );
}

function relatedSignalCount(game: LiveGame, signals: Signal[]) {
  const away = game.awayTeam?.toLowerCase() ?? "";
  const home = game.homeTeam?.toLowerCase() ?? "";
  return signals.filter((signal) => {
    const team = signal.team?.toLowerCase() ?? "";
    const opponent = signal.opponent?.toLowerCase() ?? "";
    return team === away || team === home || opponent === away || opponent === home;
  }).length;
}

function isCleanMlbSituation(situation: BoardSituation) {
  return hasCleanPublicTeamIdentity(situation.team, situation.opponent, situation.awayTeam, situation.homeTeam)
    && hasCleanPublicText(
      situation.title,
      situation.detail,
      situation.player,
      situation.statusLabel,
      situation.movementLabel,
      situation.sourceSummary,
      situation.marketReaction,
      situation.replayChain?.join(" "),
    );
}

function isCleanMlbStory(story: ReturnType<typeof toSituationStoryCardData>) {
  return hasCleanPublicTeamIdentity(story.primaryTeam, story.secondaryTeam)
    && hasCleanPublicText(
      story.headline,
      story.dek,
      story.matchup,
      story.player,
      story.storyType,
      story.whatHappened,
      story.whyItMatters,
      story.watchNext,
      story.relatedItems?.join(" "),
    );
}

function isRenderableMlbStoryItem(item: {
  situation: BoardSituation;
  story: ReturnType<typeof toSituationStoryCardData>;
}) {
  return isCleanMlbStory(item.story) && !isLowQualityMlbMarketItem(item);
}

function isHighQualityMlbLeadSituation(situation: BoardSituation) {
  if (!isCleanMlbSituation(situation)) return false;
  if (situation.kind === "game" && situation.escalation === "Quiet") return false;
  const text = `${situation.title} ${situation.detail ?? ""} ${situation.signalType ?? ""} ${situation.movementLabel ?? ""} ${situation.marketReaction ?? ""}`.toLowerCase();
  const hasTeamSpecificContext = Boolean(situation.player || situation.team || situation.awayTeam || situation.homeTeam);
  const hasSportsDriver = /\b(lineup|scratch|pitcher|starter|bullpen|weather|injury|availability|roster|source|confirmed|late)\b/i.test(text);
  const isMarketOnly = /\b(market|line move|movement|spread|total|odds)\b/i.test(text) && !hasSportsDriver;
  return hasTeamSpecificContext && !isMarketOnly && (hasSportsDriver || situation.sourceCount >= 2 || situation.score >= 72);
}

function isLowQualityMlbMarketItem(item: {
  situation: BoardSituation;
  story: ReturnType<typeof toSituationStoryCardData>;
}) {
  const text = [
    item.situation.title,
    item.situation.detail,
    item.situation.signalType,
    item.situation.movementLabel,
    item.situation.marketReaction,
    item.story.headline,
    item.story.whatHappened,
    item.story.whyItMatters,
  ].filter(Boolean).join(" ");
  const hasMarketOnlyText = /\b(opening line|market|line move|movement|spread|total|odds)\b/i.test(text);
  const hasSportsDriver = /\b(lineup|scratch|pitcher|starter|bullpen|weather|injury|availability|roster|confirmed|late|source-backed|source backed)\b/i.test(text);
  return hasMarketOnlyText && !hasSportsDriver;
}

function dedupeStoryItems<T extends { story: { headline: string } }>(items: T[]) {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    const key = item.story.headline.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || containsPublicInvalidToken(key) || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function sortIdForMode(mode: BoardSortMode) {
  if (mode === "newest") return "freshness";
  return mode;
}

function canonicalTypeForTab(tab: string) {
  const map: Record<string, string | null> = {
    today: null,
    pitchers: "injury",
    lineup: "lineup",
    props: null,
    trends: null,
    line_moves: "market",
  };
  return map[tab] ?? null;
}

function laneSummary(lane: SituationLaneType) {
  const copy: Record<SituationLaneType, string> = {
    escalating: "Lineup, pitcher, weather, scratch, and source-backed stories where the verification chain is moving now.",
    live: "Inning, bullpen, fantasy impact, and live-game stories with source checks or context changes still active.",
    decision: "Pregame windows where lineup-card, pitcher, weather, or market reaction controls timing.",
    confirmed: "Verified lineup, pitcher, and conditions stories with source agreement kept visible.",
    background: "Lower-urgency monitoring across parks, trends, source checks, and cooling/resolved stories.",
  };
  return copy[lane];
}

function emptyLaneCopy(lane: SituationLaneType) {
  const copy: Record<SituationLaneType, string> = {
    escalating: "No urgent MLB developing story is above threshold.",
    live: "No inning-state watch item is driving priority.",
    decision: "No lineup, pitcher, or weather decision window is open.",
    confirmed: "No confirmed lineup or pitcher context is queued.",
    background: "Background park, weather, bullpen, source, and market reaction monitoring remain active.",
  };
  return copy[lane];
}

function SparseOperationalState({ title, detail, checks }: { title: string; detail: string; checks: string[] }) {
  return (
    <section className="max-w-full overflow-hidden rounded-md border border-border bg-card/75 px-3 py-2.5 sm:px-4 sm:py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <span className="data-label text-primary">Slate Watch</span>
          <h3 className="mt-0.5 font-sans text-sm font-bold text-foreground sm:text-base">{title}</h3>
          <p className="mt-0.5 break-words text-[0.8rem] font-medium leading-snug text-muted-foreground sm:text-sm">{detail}</p>
        </div>
        <span className="max-w-full basis-full whitespace-normal break-words rounded border border-border/80 bg-muted/10 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-widest text-muted-foreground/85 sm:basis-auto sm:shrink-0">
          Nothing verified yet
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {checks.map((check) => (
          <span key={check} className="rounded border border-border/80 bg-muted/10 px-2 py-1 text-[0.68rem] font-bold text-muted-foreground">
            {check}
          </span>
        ))}
      </div>
    </section>
  );
}

function BoardLoadingState({ title, detail, checks }: { title: string; detail: string; checks: string[] }) {
  return (
    <section className="max-w-full overflow-hidden rounded-md border border-border bg-card/75 px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <span className="data-label text-primary">Slate Loading</span>
          <h3 className="mt-0.5 font-sans text-sm font-bold text-foreground sm:text-base">{title}</h3>
          <p className="mt-0.5 break-words text-[0.8rem] font-medium leading-snug text-muted-foreground sm:text-sm">{detail}</p>
        </div>
        <span className="max-w-full basis-full whitespace-normal break-words rounded border border-border/80 bg-muted/10 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-widest text-muted-foreground/85 sm:basis-auto sm:shrink-0">
          Building board
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        {checks.map((check) => (
          <div key={check} className="min-w-0 rounded border border-border/80 bg-muted/10 px-2 py-2">
            <span className="data-label text-[0.58rem]">{check}</span>
            <div className="es-skeleton mt-2 h-2 rounded" />
          </div>
        ))}
      </div>
    </section>
  );
}
