import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useSearch } from "wouter";

import AppShell from "@/components/V2Shell";
import { NewSignalsToast } from "@/components/NewSignalsToast";
import { SignalDetailDrawer, type SignalDetailLike } from "@/components/SignalDetailDrawer";
import { BoardCommandBar } from "@/components/board/BoardCommandBar";
import { BoardPriorityControls } from "@/components/board/BoardPriorityControls";
import { EditorialLeadStory, LeagueEditorialPageFrame, type EditorialHeadlineItem, type EditorialQuickLink } from "@/components/board/LeagueEditorialPageFrame";
import { LiveGameStrip } from "@/components/board/LiveGameStrip";
import { SituationLane } from "@/components/board/SituationLane";
import { SituationStoryCard } from "@/components/board/SituationStoryCard";
import { TopDevelopments } from "@/components/board/TopDevelopments";
import {
  situationMatchesPriority,
  sortModeFromPriority,
  toQuietLeagueLeadStory,
  toLiveGamePillData,
  toSituationStoryCardData,
  toSituationRowData,
  type AnyBoardGame,
} from "@/components/board/boardAdapters";
import { useNBASignals } from "@/hooks/useSignals";
import { buildBoardSituations, rankBoardSituations, selectFeaturedSituation, type BoardSituation } from "@/lib/boardSituations";
import { getLeagueBoardProfile } from "@/lib/leagueBoardProfiles";
import { canonicalSituationsToBoardSituations, mergeCanonicalWithBoardSituations } from "@/lib/situationAdapters";
import { filterCanonicalSituations, useCanonicalSituations } from "@/lib/situationsApi";
import { boardFilterFeedback, boardSortFeedback, compareSignals, signalIsActionable, signalLifecycle, type BoardSortMode } from "@/lib/signalBoardUx";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { publicGamesForLeague } from "@/lib/publicDisplayHygiene";
import { useAuth } from "@/context/AuthContext";
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
  sport: "nba";
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
  { key: "injuries", label: "Injuries" },
  { key: "lineup", label: "Lineup" },
  { key: "props", label: "Props" },
  { key: "trends", label: "Trends" },
  { key: "line_moves", label: "Movement" },
];

const TAB_SIGNAL_TYPE: Record<string, string | null> = {
  today: null,
  injuries: "injury",
  lineup: "lineup",
  props: "prop",
  trends: "trend",
  line_moves: "line_move",
};

const PRO_THRESHOLD = 10;

export default function NBABoard() {
  const { isPro } = useAuth();
  const [activeGameId, setActiveGameId] = useState<string | undefined>();
  const [drawerSignal, setDrawerSignal] = useState<Signal | SignalDetailLike | null>(null);
  const [sortMode, setSortMode] = useState<BoardSortMode>("priority");
  const [activeLane, setActiveLane] = useState<SituationLaneType | "all">("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [compact, setCompact] = useState(true);
  const [showConfirmed, setShowConfirmed] = useState(true);
  const [liveOnly, setLiveOnly] = useState(false);
  const [actionableOnly, setActionableOnly] = useState(false);
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const scrollContainerRef = useRef<HTMLElement>(null);

  const search = useSearch();
  const activeTab = useMemo(() => new URLSearchParams(search).get("tab") ?? "today", [search]);
  const setActiveTab = (tab: string) => {
    window.history.pushState({}, "", tab === "today" ? "/nba" : `/nba?tab=${tab}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const { signals: data, loading: isLoading, pendingCount, flushPending, refresh } = useNBASignals([]);
  const { situations: canonicalSituations, loading: canonicalLoading, error: canonicalError, refresh: refreshCanonical } = useCanonicalSituations({
    league: "NBA",
    activeOnly: false,
    limit: 100,
    orderBy: "operational_visibility_score",
    poll: false,
  });
  const profile = getLeagueBoardProfile("NBA");
  const allSignals = (data ?? []) as Signal[];

  useEffect(() => {
    fetchWithTimeout("/api/v2/games?league=NBA", {}, 4500)
      .then((response) => response.json())
      .then((payload) => {
        const statusLabel: Record<string, string> = {
          live: "In Progress",
          final: "Final",
          scheduled: "Scheduled",
          postponed: "Postponed",
        };
        const adapted: LiveGame[] = publicGamesForLeague(payload.games ?? [], "NBA")
          .map((game: any) => ({
            id: game.id,
            sport: "nba" as const,
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
      league: "NBA",
      games: liveGames as AnyBoardGame[],
      signals: filteredSignals as any[],
    });
    const canonicalType = canonicalTypeForTab(activeTab);
    const canonicalBoard = canonicalSituationsToBoardSituations(
      filterCanonicalSituations(canonicalSituations, {
        league: "NBA",
        situationType: canonicalType,
      }),
      "NBA",
    );
    return rankBoardSituations(mergeCanonicalWithBoardSituations(canonicalBoard, fallback))
      .filter((situation) => showConfirmed || situation.lane !== "confirmed")
      .filter((situation) => situationMatchesPriority(situation, urgencyFilter));
  }, [activeTab, canonicalSituations, filteredSignals, liveGames, showConfirmed, urgencyFilter]);

  const featured = selectFeaturedSituation(situations);
  const hasElevatedLeadStory = Boolean(featured && featured.escalation !== "Quiet" && featured.lane !== "background");
  const leadSituation = hasElevatedLeadStory ? featured : null;
  const featuredRow = useMemo(() => leadSituation ? toSituationRowData(leadSituation) : undefined, [leadSituation]);
  const leadStory = useMemo(() => featuredRow ? toSituationStoryCardData(featuredRow) : toQuietLeagueLeadStory("NBA"), [featuredRow]);
  const storyItems = useMemo(() => situations.map((situation) => {
    const row = toSituationRowData(situation);
    return {
      situation,
      row,
      story: toSituationStoryCardData(row),
    };
  }), [situations]);
  const livePills = useMemo(() => liveGames.map((game) => toLiveGamePillData(game, relatedSignalCount(game, allSignals))), [allSignals, liveGames]);
  const visibleLanes = profile.laneOrder.filter((lane) => activeLane === "all" || activeLane === lane);
  const hasSituations = situations.length > 0;
  const isInitialBoardLoading = !hasSituations && (isLoading || canonicalLoading || gamesLoading);
  const topUrgentItems = storyItems.filter((item) => item.situation.lane === "escalating" && (item.situation.kind === "signal" || item.situation.kind === "canonical")).slice(0, 2);
  const quickLinks: EditorialQuickLink[] = [
    { id: "today", label: "Today", detail: "Full slate", active: activeTab === "today", onClick: () => setActiveTab("today") },
    { id: "lineup", label: "Starters", detail: "Lineups", active: activeTab === "lineup", onClick: () => setActiveTab("lineup") },
    { id: "injuries", label: "Injuries", detail: "Availability", active: activeTab === "injuries", onClick: () => setActiveTab("injuries") },
    { id: "rotations", label: "Rotations", detail: "Minutes and roles" },
    { id: "scratches", label: "Late Scratches", detail: "Warmup changes" },
    { id: "line_moves", label: "Market", detail: "Pre-tip movement", active: activeTab === "line_moves", onClick: () => setActiveTab("line_moves") },
  ];
  const headlineItems: EditorialHeadlineItem[] = storyItems.length
    ? storyItems.slice(0, 6).map((item) => ({
        id: item.row.id,
        headline: item.story.headline,
        meta: [item.story.storyType, item.story.timing ?? item.row.timestamp].filter(Boolean).join(" / "),
        onClick: (item.situation.kind === "signal" || item.situation.kind === "canonical") ? () => openSituation(item.situation) : undefined,
      }))
    : (leadStory.relatedItems ?? []).map((headline, index) => ({
        id: `quiet-nba-${index}`,
        headline,
        meta: index === 0 ? "Before tip" : "Watch item",
      }));
  const fallbackWatchCount = leadStory.relatedItems?.length || headlineItems.length || quickLinks.length;
  const monitoredCount = situations.length || fallbackWatchCount;
  const monitoredLabel = situations.length ? `${situations.length} stories monitored` : `${monitoredCount} watch items monitored`;

  const openSituation = (situation: BoardSituation) => {
    if (situation.kind !== "signal" && situation.kind !== "canonical") return;
    const signal = situation.signal as Signal | SignalDetailLike | undefined;
    if (!signal) return;
    if (situation.kind === "signal") {
      const index = filteredSignals.findIndex((item) => String(item.id) === String(signal.id));
      if (index >= PRO_THRESHOLD) return;
    }
    setDrawerSignal(signal);
  };
  const openWatchBoard = () => {
    document.querySelector(".board-priority-controls, .situation-lane")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const openProPage = () => {
    window.history.pushState({}, "", "/pro");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  const openAlertSettings = () => {
    window.history.pushState({}, "", "/alerts");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const handleToastView = useCallback(() => {
    flushPending();
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [flushPending]);

  return (
    <AppShell>
        <main ref={scrollContainerRef} className="league-board-shell es-league-nba board-main-col mx-auto flex w-[calc(100vw-24px)] max-w-[calc(100vw-24px)] flex-col gap-3 overflow-x-hidden py-3 sm:w-full sm:max-w-7xl sm:px-6 sm:py-5">
          <BoardCommandBar
            kicker="NBA Watch Desk"
            title="NBA Tonight"
            statusLabel={`${monitoredLabel} / Starters, injuries, rotations, and pre-tip movement`}
            liveCount={liveGames.filter((game) => game.statusDescription?.toLowerCase().includes("in progress")).length}
            tabs={FEED_TABS.map((tab) => ({ id: tab.key, label: tab.label }))}
            activeTabId={activeTab}
            onTabChange={setActiveTab}
            actions={[{ label: "Refresh", icon: <RefreshCw className="h-4 w-4" />, onClick: () => { refresh(); refreshCanonical(); }, variant: "outline" }]}
          />

          <LeagueEditorialPageFrame
            league="NBA"
            quickLinks={quickLinks}
            headlines={headlineItems}
            brandLine="Sports intelligence before the market catches up"
            conversion={{
              title: isPro ? "Manage NBA availability alerts" : "Follow NBA availability alerts",
              body: isPro
                ? "Starter, injury, rotation, late scratch, warmup, and pre-tip movement alerts are available in your plan."
                : "Follow starters, injuries, rotations, late scratches, warmups, and pre-tip movement in one source-backed story view.",
              bullets: isPro
                ? ["Alert settings included in Pro", "Injury and rotation context", "Confidence and timing on developing stories"]
                : ["Starter and late-scratch updates", "Injury and rotation context", "Confidence and timing on developing stories"],
              ctaLabel: isPro ? "Manage NBA alerts" : "Follow NBA board",
              onClick: isPro ? openAlertSettings : openProPage,
            }}
            lead={
              <EditorialLeadStory
                story={leadStory}
                quiet={!hasElevatedLeadStory}
                onOpen={hasElevatedLeadStory && featured ? () => openSituation(featured) : openWatchBoard}
                onEvidence={hasElevatedLeadStory && featured ? () => openSituation(featured) : undefined}
              />
            }
          >
            <div className="mt-3">
              <LiveGameStrip
                title={profile.liveStripLabel}
                summary={gamesLoading ? "Slate context loading." : "Rotation, injury, warmup, source agreement, and market reaction remain active until tip."}
                games={livePills}
                activeGameId={activeGameId}
                watchStoryCount={monitoredCount}
                copyVariant="editorial"
                emptyLabel="Starter confirmations, injury context, warmups, and pre-tip movement remain on watch."
                onGameSelect={(game) => setActiveGameId(activeGameId === game.id ? undefined : game.id)}
              />
            </div>
          </LeagueEditorialPageFrame>

          {hasSituations && (
            <section className="detailed-signal-view mt-1 rounded-md border border-border/70 bg-card/45 p-2.5">
              <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
                <span className="data-label text-primary">Detailed Signal View</span>
                <span className="text-[0.72rem] font-semibold text-muted-foreground">Source, timing, and lane detail below the editorial lead.</span>
              </div>
              <TopDevelopments league="NBA" situations={situations.filter((s) => s.kind === "signal" || s.kind === "canonical")} copyVariant="editorial" onSelect={openSituation} />
            </section>
          )}

          {topUrgentItems.length > 0 && (
            <div className="sm:hidden">
              <SituationLane
                lane="escalating"
                title="Urgent Developing Stories"
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
                  return (
                    <section
                      key={lane}
                      className={`situation-lane situation-lane-${lane} max-w-full overflow-hidden rounded-md border border-border bg-card/80 ${index === 0 ? "bg-card/85" : lane === "background" ? "bg-card/70" : ""}`}
                    >
                      <header className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-muted/10 px-3 py-2.5">
                        <span className="data-label text-primary">{profile.laneLabels[lane]}</span>
                        <strong className="min-w-0 flex-1 truncate text-sm text-foreground">{laneSummary("NBA", lane)}</strong>
                        <span className="rounded border border-border bg-muted/20 px-2 py-1 text-[0.66rem] font-bold uppercase tracking-widest text-muted-foreground tabular-nums">
                          {laneItems.length} stories
                        </span>
                      </header>
                      <div className="grid gap-3 p-3">
                        {laneItems.length ? (
                          laneItems.map(({ situation, story }) => (
                            <SituationStoryCard
                              key={situation.id}
                              story={story}
                              compact={compact && lane === "background"}
                              onOpen={(situation.kind === "signal" || situation.kind === "canonical") ? () => openSituation(situation) : undefined}
                            />
                          ))
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
            </>
          ) : isInitialBoardLoading ? (
            <BoardLoadingState
              title="Loading NBA story board"
              detail="Checking injuries, warmup reports, starter confirmations, rotation changes, source agreement, and market reaction before ranking the slate."
              checks={["Signals", "Canonical stories", "Game context", "Images"]}
            />
          ) : (
            <SparseOperationalState
              title="Tonight's NBA watch checklist"
              detail="Lineup confirmations, warmups, load management, source agreement, injury context, and market reaction stay on watch."
              checks={["Late scratches", "Starter confirmations", "Warmup reports", "Pre-tip movement"]}
            />
          )}

          {allSignals.length > PRO_THRESHOLD && (
            <div className="rounded border border-primary/25 bg-primary/5 px-4 py-3 text-sm font-medium text-muted-foreground">
              <strong className="text-primary">{Math.max(0, filteredSignals.length - PRO_THRESHOLD)} stories locked</strong> - Pro members see the full confidence, source, timing, and verification detail set.
            </div>
          )}

          {(isLoading || canonicalLoading) && hasSituations && <div className="es-skeleton h-16 rounded border border-border" />}
        </main>

      <NewSignalsToast count={pendingCount} onView={handleToastView} board="NBA" scrollContainerRef={scrollContainerRef} />
      <SignalDetailDrawer open={!!drawerSignal} signal={drawerSignal} sport="NBA" onClose={() => setDrawerSignal(null)} />
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

function sortIdForMode(mode: BoardSortMode) {
  if (mode === "newest") return "freshness";
  return mode;
}

function canonicalTypeForTab(tab: string) {
  const map: Record<string, string | null> = {
    today: null,
    injuries: "injury",
    lineup: "lineup",
    props: null,
    trends: null,
    line_moves: "market",
  };
  return map[tab] ?? null;
}

function laneSummary(league: "NBA", lane: SituationLaneType) {
  const copy: Record<SituationLaneType, string> = {
    escalating: "Fresh changes where source agreement, agent-calibrated confidence, or public context are moving faster than the broad board.",
    live: "In-game stories tied to active source checks, market reaction, fantasy impact, or role changes still in progress.",
    decision: "Pre-tip windows where timing depends on the next warmup, lineup, or market reaction.",
    confirmed: "Verified rotation and injury stories with the confirmation chain preserved for downstream reads.",
    background: "Lower-urgency monitoring across rotations, trends, source checks, and cooling/resolved stories.",
  };
  return copy[lane];
}

function emptyLaneCopy(lane: SituationLaneType) {
  const copy: Record<SituationLaneType, string> = {
    escalating: "No urgent NBA developing story is above threshold.",
    live: "No live watch item is driving priority.",
    decision: "No pre-tip decision window is open.",
    confirmed: "No verified update is queued.",
    background: "Background rotation, source, and market reaction monitoring remain active.",
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
          No elevated story yet
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
