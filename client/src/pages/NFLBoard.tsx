import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import V2Shell, { useShellTheme } from "../components/V2Shell";
import { SignalDetailDrawer } from "../components/SignalDetailDrawer";
import { ProBoardBanner } from "../components/ProGate";
import TrackRecordStrip from "../components/TrackRecordStrip";
import { useSignalGate, FREE_LIMIT } from "../context/SignalGate";
import { NFL_SIGNALS, NFL_SLATE, type NFLSignal, type NFLSignalType } from "../data/nflMockData";
import { useNFLSignals } from "../hooks/useSignals";
import { scoreAndRankSignals } from "../lib/signalScorer";
import { boardFilterFeedback, boardSortFeedback, compareSignals, signalIsActionable, signalLifecycle, type BoardSortMode } from "../lib/signalBoardUx";
import { buildBoardSituations, rankBoardSituations, selectFeaturedSituation, type BoardSituation } from "../lib/boardSituations";
import { getLeagueBoardProfile } from "../lib/leagueBoardProfiles";
import { canonicalSituationsToBoardSituations, mergeCanonicalWithBoardSituations } from "../lib/situationAdapters";
import { filterCanonicalSituations, useCanonicalSituations } from "../lib/situationsApi";
import { BoardCommandBar } from "../components/board/BoardCommandBar";
import { BoardPriorityControls } from "../components/board/BoardPriorityControls";
import { FeaturedSituation } from "../components/board/FeaturedSituation";
import { LiveGameStrip } from "../components/board/LiveGameStrip";
import { SituationLane } from "../components/board/SituationLane";
import { TopDevelopments } from "../components/board/TopDevelopments";
import {
  featuredCopy,
  situationMatchesPriority,
  sortModeFromPriority,
  toLiveGamePillData,
  toSituationRowData,
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
  const [activeFilter, setActiveFilter] = useState("today");
  const [selectedSig, setSelectedSig] = useState<NFLSignal | null>(null);
  const [sortMode, setSortMode] = useState<BoardSortMode>("priority");
  const [activeLane, setActiveLane] = useState<SituationLaneType | "all">("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [compact, setCompact] = useState(true);
  const [showConfirmed, setShowConfirmed] = useState(true);
  const [liveOnly, setLiveOnly] = useState(false);
  const [actionableOnly, setActionableOnly] = useState(false);
  const [activeGameId, setActiveGameId] = useState<string | undefined>();

  const { signals: liveNFLSignals, loading, isLive, error, refresh } = useNFLSignals(NFL_SIGNALS);
  const { situations: canonicalSituations, loading: canonicalLoading, error: canonicalError, refresh: refreshCanonical } = useCanonicalSituations({
    league: "NFL",
    activeOnly: false,
    limit: 100,
    orderBy: "operational_visibility_score",
  });
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
  const livePills = NFL_SLATE.map((game) => toLiveGamePillData(game, game.signals));
  const visibleLanes = profile.laneOrder.filter((lane) => activeLane === "all" || activeLane === lane);
  const confirmed = rankedNFL.filter((signal) => signal.verdict === "confirmed").length;
  const topUrgentSituations = situations.filter((situation) => situation.lane === "escalating").slice(0, 2);

  const openSituation = (situation: BoardSituation) => {
    if (situation.kind !== "signal") return;
    const signal = situation.signal as NFLSignal | undefined;
    if (!signal) return;
    const index = visibleSignals.findIndex((item) => String(item.id) === String(signal.id));
    if (!rowIsFree(index)) {
      openModal("NFL");
      return;
    }
    setSelectedSig(signal);
  };

  return (
    <div className="league-board-shell es-league-nfl">
      <main className="board-main-col mx-auto flex w-[calc(100vw-24px)] max-w-[calc(100vw-24px)] flex-col gap-2 overflow-x-hidden py-3 sm:w-full sm:max-w-7xl sm:px-6 sm:py-4">
        <BoardCommandBar
          kicker="NFL Story Board"
          title={profile.boardLabel}
          statusLabel={`${canonicalSituations.length ? "Verified sources" : isLive ? "Live coverage" : "Offseason coverage"} / ${rankedNFL.length} updates`}
          liveCount={situations.filter((situation) => situation.lane === "escalating" || situation.lane === "live").length}
          tabs={NFL_FILTERS.map((filter) => ({ id: filter.id, label: filter.label }))}
          activeTabId={activeFilter}
          onTabChange={setActiveFilter}
          actions={[{ label: "Refresh", icon: <RefreshCw className="h-4 w-4" />, onClick: () => { refresh(); refreshCanonical(); }, variant: "outline" }]}
        />

        <TrackRecordStrip league="NFL" darkMode={darkMode} />

        <LiveGameStrip
          title={profile.liveStripLabel}
          summary="Offseason schedule context. Games stay quiet unless verified source-backed story pressure attaches."
          games={livePills}
          density="compact"
          activeGameId={activeGameId}
          onGameSelect={(game) => setActiveGameId(activeGameId === game.id ? undefined : game.id)}
        />

        <FeaturedSituation
          situation={featured ? toSituationRowData(featured) : undefined}
          eyebrow={profile.featuredLabel}
          title={featuredDetails.title}
          summary={featuredDetails.summary}
          primaryRead={featuredDetails.primaryRead}
          secondaryRead={featuredDetails.secondaryRead}
          metrics={featuredDetails.metrics}
          mobileDensity="compact"
          className="sm:mb-0.5"
          actions={featured?.kind === "signal" ? [{ label: "Open Story", onClick: () => openSituation(featured) }] : undefined}
        />

        <TopDevelopments league="NFL" situations={situations} onSelect={openSituation} />

        <BoardPriorityControls
          className="-mt-0.5"
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

        {topUrgentSituations.length > 0 && (
          <div className="-mt-1 sm:-mt-0.5">
            <SituationLane
              lane="escalating"
              title="Urgent Developing Stories"
              summary="Immediate game-week changes before the broader lane board."
              situations={topUrgentSituations.map(toSituationRowData)}
              compact
              cadence="entry"
              onSituationSelect={(row) => {
                const situation = topUrgentSituations.find((item) => item.id === row.id);
                if (situation) openSituation(situation);
              }}
            />
          </div>
        )}

        <div className="board-control-feedback rounded border border-border bg-muted/10">
          {boardSortFeedback(sortMode)} {boardFilterFeedback({ filter: NFL_FILTERS.find((filter) => filter.id === activeFilter)?.label, liveOnly, actionableOnly })}
          {error ? ` ${error}` : ""}
          {canonicalError ? ` ${canonicalError}` : ""}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Stories", rankedNFL.length],
            ["Confirmed", confirmed],
            ["Urgent stories", situations.filter((situation) => situation.lane === "escalating").length],
            ["Free stories", FREE_LIMIT],
          ].map(([label, value]) => (
            <div key={label} className="rounded border border-border bg-card/80 px-3 py-2">
              <strong className="stat-num-display block text-lg text-primary tabular-nums">{value}</strong>
              <span className="data-label text-[0.65rem]">{label}</span>
            </div>
          ))}
        </div>

        <ProBoardBanner freeCount={FREE_LIMIT} totalCount={visibleSignals.length} sport="NFL" darkMode={darkMode} />

        <div className="grid gap-3 xl:grid-cols-2">
          {visibleLanes.map((lane, index) => {
            const laneSituations = situations.filter((situation) => situation.lane === lane);
            return (
              <SituationLane
                key={lane}
                lane={lane}
                title={profile.laneLabels[lane]}
                summary={laneSummary(lane)}
                situations={laneSituations.map(toSituationRowData)}
                compact={compact}
                cadence={index === 0 ? "entry" : lane === "background" ? "quiet" : "default"}
                emptyLabel={profile.emptyState}
                onSituationSelect={(row) => {
                  const situation = laneSituations.find((item) => item.id === row.id);
                  if (situation) openSituation(situation);
                }}
              />
            );
          })}
        </div>

        {(loading || canonicalLoading) && <div className="es-skeleton h-20 rounded border border-border" />}
      </main>

      <SignalDetailDrawer open={!!selectedSig} signal={selectedSig} sport="NFL" onClose={() => setSelectedSig(null)} />
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
    live: "Game-week watch states that stay elevated while verification, timing, or market reaction is unresolved.",
    decision: "Participation, depth chart, role, weather, and line windows that still need a timing call.",
    confirmed: "Verified context from official reports, local beats, markets, and source agreement.",
    background: "Lower-priority monitoring across matchups, fantasy impact, team/fan impact, camp notes, and cooling/resolved stories.",
  };
  return copy[lane];
}
