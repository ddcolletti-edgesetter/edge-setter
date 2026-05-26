import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import V2Shell, { useShellTheme } from "../components/V2Shell";
import { SignalDetailDrawer } from "../components/SignalDetailDrawer";
import { ProBoardBanner } from "../components/ProGate";
import TrackRecordStrip from "../components/TrackRecordStrip";
import { useSignalGate, FREE_LIMIT } from "../context/SignalGate";
import { CFB_SIGNALS, CFB_SLATE, type CFBSignal, type CFBSignalType } from "../data/cfbMockData";
import { useCFBSignals } from "../hooks/useSignals";
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

const CFB_FILTERS = [
  { key: "SIGNAL STREAM", label: "Signal Stream" },
  { key: "TRANSFER PORTAL", label: "Transfer Portal" },
  { key: "INJURY WATCH", label: "Injury Watch" },
  { key: "LINE MOVEMENT", label: "Movement" },
  { key: "MATCHUP EDGES", label: "Matchup Edges" },
  { key: "SHARP MONEY", label: "Source Pressure" },
  { key: "COACHING", label: "Coaching Intel" },
] as const;

type CFBFilterKey = typeof CFB_FILTERS[number]["key"];

const FILTER_TYPES: Record<CFBFilterKey, CFBSignalType[]> = {
  "SIGNAL STREAM": [],
  "TRANSFER PORTAL": ["transfer", "portal"],
  "INJURY WATCH": ["injury"],
  "LINE MOVEMENT": ["line_move"],
  "MATCHUP EDGES": ["matchup"],
  "SHARP MONEY": ["sharp"],
  COACHING: ["coaching"],
};

const TAB_FILTERS = ["Today", "SEC", "Big Ten", "ACC", "Big 12", "Ind."] as const;
type TabFilter = typeof TAB_FILTERS[number];

function CFBBoardInner() {
  const darkMode = useShellTheme();
  const { rowIsFree, openModal } = useSignalGate();
  const [sidebarFilter, setSidebarFilter] = useState<CFBFilterKey>("SIGNAL STREAM");
  const [tabFilter, setTabFilter] = useState<TabFilter>("Today");
  const [selectedSig, setSelectedSig] = useState<CFBSignal | null>(null);
  const [sortMode, setSortMode] = useState<BoardSortMode>("priority");
  const [activeLane, setActiveLane] = useState<SituationLaneType | "all">("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [compact, setCompact] = useState(true);
  const [showConfirmed, setShowConfirmed] = useState(true);
  const [liveOnly, setLiveOnly] = useState(false);
  const [actionableOnly, setActionableOnly] = useState(false);
  const [activeGameId, setActiveGameId] = useState<string | undefined>();

  const { signals: liveCFBSignals, loading, isLive, error, refresh } = useCFBSignals(CFB_SIGNALS);
  const { situations: canonicalSituations, loading: canonicalLoading, error: canonicalError, refresh: refreshCanonical } = useCanonicalSituations({
    league: "CFB",
    activeOnly: false,
    limit: 100,
    orderBy: "operational_visibility_score",
  });
  const profile = getLeagueBoardProfile("CFB");

  const rankedCFB = useMemo(() => {
    const source = (liveCFBSignals as CFBSignal[]).map((signal) => ({ ...signal, sport: "CFB" as const }));
    return source.some((signal) => (signal as any)._score)
      ? [...source].sort((a, b) => ((b as any)._score?.totalScore ?? 0) - ((a as any)._score?.totalScore ?? 0))
      : scoreAndRankSignals(source);
  }, [liveCFBSignals]);

  const visibleSignals = useMemo(() => {
    const types = FILTER_TYPES[sidebarFilter];
    return rankedCFB
      .filter((signal) => types.length === 0 || types.includes(signal.type as CFBSignalType))
      .filter((signal) => tabFilter === "Today" || !signal.conference || signal.conference.includes(tabFilter))
      .filter((signal) => !liveOnly || signalLifecycle(signal) === "Early" || signalLifecycle(signal) === "Developing")
      .filter((signal) => !actionableOnly || signalIsActionable(signal))
      .sort((a, b) => compareSignals(a, b, sortMode));
  }, [actionableOnly, liveOnly, rankedCFB, sidebarFilter, sortMode, tabFilter]);

  const situations = useMemo(() => {
    const fallback = buildBoardSituations({
      league: "CFB",
      games: CFB_SLATE as AnyBoardGame[],
      signals: visibleSignals as any[],
    });
    const canonicalBoard = canonicalSituationsToBoardSituations(
      filterCanonicalSituations(canonicalSituations, {
        league: "CFB",
        situationType: canonicalTypeForFilter(sidebarFilter),
      }),
      "CFB",
    );
    return rankBoardSituations(mergeCanonicalWithBoardSituations(canonicalBoard, fallback))
      .filter((situation) => showConfirmed || situation.lane !== "confirmed")
      .filter((situation) => situationMatchesPriority(situation, urgencyFilter));
  }, [canonicalSituations, showConfirmed, sidebarFilter, urgencyFilter, visibleSignals]);

  const featured = selectFeaturedSituation(situations);
  const featuredDetails = featuredCopy(featured, "CFB");
  const livePills = CFB_SLATE.map((game) => toLiveGamePillData(game, game.signals));
  const visibleLanes = profile.laneOrder.filter((lane) => activeLane === "all" || activeLane === lane);
  const confirmed = rankedCFB.filter((signal) => signal.verdict === "confirmed").length;
  const topUrgentSituations = situations.filter((situation) => situation.lane === "escalating").slice(0, 2);

  const openSituation = (situation: BoardSituation) => {
    if (situation.kind !== "signal") return;
    const signal = situation.signal as CFBSignal | undefined;
    if (!signal) return;
    const index = visibleSignals.findIndex((item) => String(item.id) === String(signal.id));
    if (!rowIsFree(index)) {
      openModal("CFB");
      return;
    }
    setSelectedSig(signal);
  };

  return (
    <div className="league-board-shell es-league-cfb">
      <main className="board-main-col mx-auto flex w-[calc(100vw-24px)] max-w-[calc(100vw-24px)] flex-col gap-2 overflow-x-hidden py-3 sm:w-full sm:max-w-7xl sm:px-6 sm:py-4">
        <BoardCommandBar
          kicker="CFB Story Board"
          title={profile.boardLabel}
          statusLabel={`${canonicalSituations.length ? "Verified sources" : isLive ? "Live coverage" : "Offseason coverage"} / ${rankedCFB.length} updates`}
          liveCount={situations.filter((situation) => situation.lane === "escalating" || situation.lane === "live").length}
          tabs={CFB_FILTERS.map((filter) => ({ id: filter.key, label: filter.label }))}
          activeTabId={sidebarFilter}
          onTabChange={(value) => setSidebarFilter(value as CFBFilterKey)}
          density="compact"
          actions={[{ label: "Refresh", icon: <RefreshCw className="h-4 w-4" />, onClick: () => { refresh(); refreshCanonical(); }, variant: "outline" }]}
        >
          <div className="flex max-w-full gap-1.5 overflow-x-auto overscroll-x-contain border-border/70 pl-0 [scrollbar-width:none] sm:border-l sm:pl-3 [&::-webkit-scrollbar]:hidden">
            {TAB_FILTERS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setTabFilter(tab)}
                className={`ux-tab-interactive h-6 shrink-0 rounded border px-2 text-[0.62rem] font-bold uppercase tracking-widest sm:h-7 sm:px-2.5 sm:text-[0.66rem] ${
                  tabFilter === tab ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted/20 text-muted-foreground"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </BoardCommandBar>

        <TrackRecordStrip league="CFB" darkMode={darkMode} />

        <LiveGameStrip
          title={profile.liveStripLabel}
          summary="Conference/offseason context. Scheduled games recede unless verified source-backed story pressure attaches."
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

        <TopDevelopments league="CFB" situations={situations} onSelect={openSituation} />

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
              summary="Immediate conference and slate changes before the broader lane board."
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
          {boardSortFeedback(sortMode)} {boardFilterFeedback({ filter: tabFilter === "Today" ? sidebarFilter : `${sidebarFilter} / ${tabFilter}`, liveOnly, actionableOnly })}
          {error ? ` ${error}` : ""}
          {canonicalError ? ` ${canonicalError}` : ""}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Stories", rankedCFB.length],
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

        <ProBoardBanner freeCount={FREE_LIMIT} totalCount={visibleSignals.length} sport="CFB" darkMode={darkMode} />

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

        <div className="rounded border border-[rgba(255,138,0,0.28)] bg-[rgba(255,138,0,0.08)] px-4 py-3 text-sm font-medium text-muted-foreground">
          <strong className="text-[var(--es-amber)]">Limited coverage</strong> - {isLive ? "Live CFB story feed active." : error ?? "Showing CFB watch context from the current fallback set."}
        </div>
      </main>

      <SignalDetailDrawer open={!!selectedSig} signal={selectedSig} sport="CFB" onClose={() => setSelectedSig(null)} />
    </div>
  );
}

export default function CFBBoard() {
  return (
    <V2Shell>
      <CFBBoardInner />
    </V2Shell>
  );
}

function sortIdForMode(mode: BoardSortMode) {
  if (mode === "newest") return "freshness";
  return mode;
}

function canonicalTypeForFilter(filter: CFBFilterKey) {
  const map: Record<CFBFilterKey, string | null> = {
    "SIGNAL STREAM": null,
    "TRANSFER PORTAL": "roster",
    "INJURY WATCH": "injury",
    "LINE MOVEMENT": "market",
    "MATCHUP EDGES": "scheme",
    "SHARP MONEY": "market",
    COACHING: "scheme",
  };
  return map[filter] ?? null;
}

function laneSummary(lane: SituationLaneType) {
  const copy: Record<SituationLaneType, string> = {
    escalating: "Injury, local-source, coaching, weather, and spread stories where source agreement or market reaction is accelerating.",
    live: "Conference and slate watch states that stay elevated while verification or market reaction is unresolved.",
    decision: "Depth chart, travel, weather, coaching, and spread windows that still require a timing call.",
    confirmed: "Verified context from local reporting, markets, conference clusters, and team sources.",
    background: "Lower-priority monitoring across conferences, matchups, trends, roster context, team/fan impact, and cooling/resolved stories.",
  };
  return copy[lane];
}
