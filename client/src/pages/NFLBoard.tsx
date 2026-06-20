import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { RefreshCw } from "lucide-react";

import V2Shell, { useShellTheme } from "../components/V2Shell";
import { LiveTicker, buildBoardTickerItems } from "../components/LiveTicker";
import { BoardSignalRail } from "../components/BoardSignalRail";
import type { SignalDetailLike } from "../components/SignalDetailDrawer";
import { ProBoardBanner } from "../components/ProGate";
import TrackRecordStrip from "../components/TrackRecordStrip";
import { useSignalGate, FREE_LIMIT } from "../context/SignalGate";
import { NFL_SIGNALS, NFL_SLATE, type NFLSignal, type NFLSignalType } from "../data/nflMockData";
import { useNFLSignals } from "../hooks/useSignals";
import { scoreAndRankSignals } from "../lib/signalScorer";
import { boardFilterFeedback, boardSortFeedback, compareSignals, signalIsActionable, signalLifecycle, type BoardSortMode } from "../lib/signalBoardUx";
import { buildBoardSituations, rankBoardSituations, type BoardSituation } from "../lib/boardSituations";
import { selectFeaturedSituation } from "../lib/leadRanker";
import { getLeagueBoardProfile } from "../lib/leagueBoardProfiles";
import { canonicalSituationsToBoardSituations, mergeCanonicalWithBoardSituations } from "../lib/situationAdapters";
import { filterCanonicalSituations, useCanonicalSituations } from "../lib/situationsApi";
import { BoardCommandBar } from "../components/board/BoardCommandBar";
import { BoardPriorityControls } from "../components/board/BoardPriorityControls";
import { FeaturedSituation } from "../components/board/FeaturedSituation";
import { LiveGameStrip } from "../components/board/LiveGameStrip";
import { SituationStoryCard } from "../components/board/SituationStoryCard";
import {
  featuredCopy,
  situationMatchesPriority,
  sortModeFromPriority,
  toLiveGamePillData,
  toSituationRowData,
  toSituationStoryCardData,
  type AnyBoardGame,
} from "../components/board/boardAdapters";
import type { SituationLaneType } from "../components/board/SituationRow";

const NFL_FILTERS = [
  { id: "today", label: "Today" },
  { id: "injuries", label: "Injuries" },
  { id: "line_moves", label: "Movement" },
  { id: "matchups", label: "Matchups" },
  { id: "props", label: "Props" },
  { id: "trends", label: "Trends" },
  { id: "depth", label: "Camp/Depth" },
];

function matchNFLFilter(signal: NFLSignal, filter: string): boolean {
  if (filter === "today") return true;
  if (filter === "injuries") return signal.type === "injury";
  if (filter === "line_moves") return signal.type === "line_move" || signal.tags.includes("sharp");
  if (filter === "matchups") return signal.type === "matchup";
  if (filter === "props") return signal.type === "prop" || signal.type === "sharp";
  if (filter === "trends") return signal.type === "trend";
  if (filter === "depth") return ["camp", "depth", "rookie", "role_change"].includes(signal.type);
  return true;
}

function NFLBoardInner() {
  const darkMode = useShellTheme();
  const { rowIsFree, openModal } = useSignalGate();
  const [, navigate] = useLocation();
  const [activeFilter, setActiveFilter] = useState("today");
  const [sortMode, setSortMode] = useState<BoardSortMode>("priority");
  const [activeLane, setActiveLane] = useState<SituationLaneType | "all">("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [compact, setCompact] = useState(false);
  const [showConfirmed, setShowConfirmed] = useState(true);
  const [liveOnly, setLiveOnly] = useState(false);
  const [actionableOnly, setActionableOnly] = useState(false);
  const [activeGameId, setActiveGameId] = useState<string | undefined>();

  const { signals: liveNFLSignals, loading, isLive, error, refresh } = useNFLSignals(NFL_SIGNALS);
  const nflSituationsOptions = useMemo(() => ({
  league: "NFL" as const,
  activeOnly: false,
  limit: 100,
  orderBy: "operational_visibility_score" as const,
  poll: false,
}), []);

  const { situations: canonicalSituations, loading: canonicalLoading, error: canonicalError, refresh: refreshCanonical } = useCanonicalSituations(nflSituationsOptions);
  const profile = getLeagueBoardProfile("NFL");

  const rankedNFL = useMemo(() => {
    const source = (liveNFLSignals as NFLSignal[]).map((signal) => ({ ...signal, sport: "NFL" as const }));
    return source.some((signal) => (signal as any)._score)
      ? [...source].sort((a, b) => ((b as any)._score?.totalScore ?? 0) - ((a as any)._score?.totalScore ?? 0))
      : scoreAndRankSignals(source);
  }, [liveNFLSignals]);

  const visibleSignals = useMemo(() => {
    return rankedNFL
      .filter((signal) => matchNFLFilter(signal, activeFilter))
      .filter((signal) => !liveOnly || signalLifecycle(signal) === "Early" || signalLifecycle(signal) === "Developing")
      .filter((signal) => !actionableOnly || signalIsActionable(signal))
      .sort((a, b) => compareSignals(a, b, sortMode));
  }, [activeFilter, actionableOnly, liveOnly, rankedNFL, sortMode]);

  const situations = useMemo(() => {
    const fallback = buildBoardSituations({
      league: "NFL",
      games: NFL_SLATE as AnyBoardGame[],
      signals: visibleSignals as any[],
    });
    const canonicalBoard = canonicalSituationsToBoardSituations(
      filterCanonicalSituations(canonicalSituations, {
        league: "NFL",
        situationType: canonicalTypeForFilter(activeFilter),
      }),
      "NFL",
    );
    return rankBoardSituations(mergeCanonicalWithBoardSituations(canonicalBoard, fallback))
      .filter((situation) => showConfirmed || situation.lane !== "confirmed")
      .filter((situation) => situationMatchesPriority(situation, urgencyFilter));
  }, [activeFilter, canonicalSituations, showConfirmed, urgencyFilter, visibleSignals]);

  const featured = selectFeaturedSituation(situations);
  const featuredDetails = featuredCopy(featured, "NFL");
  const livePills = NFL_SLATE.map((game) => toLiveGamePillData(game, game.signals, "nfl"));
  const visibleLanes = profile.laneOrder.filter((lane) => activeLane === "all" || activeLane === lane);
  const storyItems = situations.map((situation) => {
    const row = toSituationRowData(situation);
    return { situation, row, story: toSituationStoryCardData(row) };
  });

  const openSituation = (situation: BoardSituation) => {
    if (situation.kind !== "signal" && situation.kind !== "canonical") return;
    const signal = situation.signal as NFLSignal | SignalDetailLike | undefined;
    if (!signal) return;
    if (situation.kind === "signal") {
      const index = visibleSignals.findIndex((item) => String(item.id) === String(signal.id));
      if (!rowIsFree(index)) {
        openModal("NFL");
        return;
      }
    }
    navigate("/story/" + encodeURIComponent(String(signal.id)));
  };

  return (
    <div className="league-board-shell es-league-nfl">
      <LiveTicker items={buildBoardTickerItems(canonicalSituations)} />
      <main className="board-main-col mx-auto flex w-[calc(100vw-24px)] max-w-[calc(100vw-24px)] flex-col gap-3 overflow-x-hidden py-3 sm:w-full sm:max-w-7xl sm:gap-4 sm:px-6 sm:py-5">
        <BoardCommandBar
          kicker="NFL Story Board"
          title={profile.boardLabel}
          statusLabel={`${canonicalSituations.length ? "Verified source watch" : isLive ? "Live coverage" : "Offseason watch"} / ${rankedNFL.length} updates`}
          liveCount={situations.filter((situation) => situation.lane === "escalating" || situation.lane === "live").length}
          tabs={NFL_FILTERS.map((filter) => ({ id: filter.id, label: filter.label }))}
          activeTabId={activeFilter}
          onTabChange={setActiveFilter}
          actions={[{ label: "Refresh", icon: <RefreshCw className="h-4 w-4" />, onClick: () => { refresh(); refreshCanonical(); }, variant: "outline" }]}
        />

        <div className="sm:grid sm:grid-cols-[minmax(0,1fr)_220px] sm:items-start sm:gap-4">
          <FeaturedSituation
            situation={featured ? toSituationRowData(featured) : undefined}
            eyebrow={profile.featuredLabel}
            title={featuredDetails.title}
            summary={featuredDetails.summary}
            primaryRead={featuredDetails.primaryRead}
            secondaryRead={featuredDetails.secondaryRead}
            metrics={featuredDetails.metrics}
            presentation="story"
            league="NFL"
            mobileDensity="compact"
            className="sm:mb-1"
            actions={featured ? [{ label: "Open Story", onClick: () => openSituation(featured) }] : undefined}
          />
          <BoardSignalRail situations={situations} />
        </div>

        <TrackRecordStrip league="NFL" darkMode={darkMode} />

        <LiveGameStrip
          title={profile.liveStripLabel}
          summary="Offseason context only. Games stay quiet unless verified source-backed story pressure attaches to a real game window."
          games={livePills}
          density="compact"
          activeGameId={activeGameId}
          onGameSelect={(game) => setActiveGameId(activeGameId === game.id ? undefined : game.id)}
        />

        <BoardPriorityControls
          className="sm:-mt-1"
          activeLane={activeLane}
          activeSortId={sortIdForMode(sortMode)}
          activeUrgencyId={urgencyFilter}
          compact={compact}
          showConfirmed={showConfirmed}
          onLaneChange={setActiveLane}
          onSortChange={(value) => setSortMode(sortModeFromPriority(value))}
          onUrgencyChange={setUrgencyFilter}
          onCompactChange={setCompact}
          onShowConfirmedChange={setShowConfirmed}
        />

        <div className="board-control-feedback rounded border border-border bg-muted/10">
          {boardSortFeedback(sortMode)} {boardFilterFeedback({ filter: NFL_FILTERS.find((filter) => filter.id === activeFilter)?.label, liveOnly, actionableOnly })}
          {error ? ` ${error}` : ""}
          {canonicalError ? ` ${canonicalError}` : ""}
        </div>

        <ProBoardBanner freeCount={FREE_LIMIT} totalCount={visibleSignals.length} sport="NFL" darkMode={darkMode} />

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
                  {laneItems.length ? laneItems.map(({ situation, story }) => (
                    <SituationStoryCard
                      key={situation.id}
                      story={story}
                      compact={compact && lane === "background"}
                      onOpen={(situation.kind === "signal" || situation.kind === "canonical") ? () => openSituation(situation) : undefined}
                    />
                  )) : (
                    <div className="rounded border border-border bg-muted/10 px-3 py-4 text-sm font-medium text-muted-foreground">
                      {profile.emptyState}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        {storyItems.length > 0 && (
          <div className="flex items-center justify-between rounded border border-border/50 bg-muted/5 px-3 py-2 text-[0.7rem] font-semibold text-muted-foreground/70">
            <span>{storyItems.length} NFL stories shown</span>
            <span>Board updated {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        )}

        {(loading || canonicalLoading) && <div className="es-skeleton h-20 rounded border border-border" />}
      </main>

    </div>
  );
}

export default function NFLBoard() {
  return (
    <V2Shell>
      <NFLBoardInner />
    </V2Shell>
  );
}

function sortIdForMode(mode: BoardSortMode) {
  if (mode === "newest") return "freshness";
  return mode;
}

function canonicalTypeForFilter(filter: string) {
  const map: Record<string, string | null> = {
    today: null,
    injuries: "injury",
    line_moves: "market",
    matchups: "scheme",
    props: null,
    trends: null,
    depth: "roster",
  };
  return map[filter] ?? null;
}

function laneSummary(lane: SituationLaneType) {
  const copy: Record<SituationLaneType, string> = {
    escalating: "Injury, practice, weather, and line stories where source agreement or market reaction is accelerating.",
    live: "Game-window watch states that stay elevated only when verification, timing, or market reaction is attached.",
    decision: "Participation, depth chart, role, weather, and line windows that still need a timing call.",
    confirmed: "Verified context from official reports, local beats, markets, and source agreement.",
    background: "Lower-priority monitoring across matchups, fantasy impact, team/fan impact, camp notes, and cooling/resolved stories.",
  };
  return copy[lane];
}
