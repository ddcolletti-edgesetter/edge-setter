import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { RefreshCw } from "lucide-react";

import V2Shell, { useShellTheme } from "../components/V2Shell";
import { LiveTicker, buildBoardTickerItems } from "../components/LiveTicker";
import { BoardSignalRail } from "../components/BoardSignalRail";
import { SignalDetailDrawer, type SignalDetailLike } from "../components/SignalDetailDrawer";
import { ProBoardBanner } from "../components/ProGate";
import TrackRecordStrip from "../components/TrackRecordStrip";
import { useSignalGate, FREE_LIMIT } from "../context/SignalGate";
import { type CFBSignal, type CFBSignalType } from "../data/cfbMockData";
import { useCFBSignals } from "../hooks/useSignals";
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
import { SituationLane } from "../components/board/SituationLane";
import {
  featuredCopy,
  isSourceNoise,
  situationMatchesPriority,
  sortModeFromPriority,
  toLiveGamePillData,
  toSituationRowData,
  toSituationStoryCardData,
} from "../components/board/boardAdapters";
import type { LiveGamePillData } from "../components/board/LiveGamePill";
import { SituationStoryCard } from "../components/board/SituationStoryCard";
import type { SituationLaneType } from "../components/board/SituationRow";
import { fetchWithTimeout } from "../lib/fetchWithTimeout";
import { publicGamesForLeague } from "../lib/publicDisplayHygiene";

type CFBLiveGame = {
  id: number | string;
  sport: "cfb";
  espnEventId: string;
  homeTeam: string | null;
  awayTeam: string | null;
  gameDate: Date | null;
  statusDescription: string | null;
  homeScore: number | null;
  awayScore: number | null;
  cachedAt: Date;
  signals?: number;
};

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
  const [, navigate] = useLocation();
  const [sidebarFilter, setSidebarFilter] = useState<CFBFilterKey>("SIGNAL STREAM");
  const [tabFilter, setTabFilter] = useState<TabFilter>("Today");
  const [sortMode, setSortMode] = useState<BoardSortMode>("priority");
  const [activeLane, setActiveLane] = useState<SituationLaneType | "all">("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [compact, setCompact] = useState(false);
  const [showConfirmed, setShowConfirmed] = useState(true);
  const [liveOnly, setLiveOnly] = useState(false);
  const [actionableOnly, setActionableOnly] = useState(false);
  const [activeGameId, setActiveGameId] = useState<string | undefined>();
  const [selectedSig, setSelectedSig] = useState<SignalDetailLike | null>(null);
  const [liveGames, setLiveGames] = useState<CFBLiveGame[]>([]);

  useEffect(() => {
    fetchWithTimeout("/api/v2/games?league=CFB", {}, 4500)
      .then((response) => response.json())
      .then((payload) => {
        const statusLabel: Record<string, string> = {
          live: "In Progress",
          final: "Final",
          scheduled: "Scheduled",
          postponed: "Postponed",
        };
        const adapted: CFBLiveGame[] = publicGamesForLeague(payload.games ?? [], "CFB")
          .map((game: any) => ({
            id: game.id,
            sport: "cfb" as const,
            espnEventId: game.source_game_id ?? game.id,
            homeTeam: game.home_team ?? null,
            awayTeam: game.away_team ?? null,
            gameDate: game.game_time ? new Date(game.game_time) : null,
            statusDescription: statusLabel[game.status] ?? game.status ?? null,
            homeScore: game.home_score ?? null,
            awayScore: game.away_score ?? null,
            cachedAt: new Date(game.updated_at ?? game.created_at),
            signals: game.signals ?? undefined,
          }));
        setLiveGames(adapted);
      })
      .catch(() => setLiveGames([]));
  }, []);

  const { signals: liveCFBSignals, loading, isLive, error, refresh } = useCFBSignals([]);
  const cfbSituationsOptions = useMemo(() => ({
    league: "CFB" as const,
    activeOnly: false,
    limit: 100,
    orderBy: "operational_visibility_score" as const,
    poll: false,
  }), []);

  const { situations: canonicalSituations, loading: canonicalLoading, error: canonicalError, refresh: refreshCanonical } = useCanonicalSituations(cfbSituationsOptions);
  const profile = getLeagueBoardProfile("CFB");
  const hasLiveCFBData = canonicalSituations.length > 0 || isLive;

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
      games: [],
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

  const storyItems = situations
    .filter((situation) => {
      const signal = situation.signal as { headline?: string; detail?: string } | undefined;
      return !isSourceNoise(signal?.headline) && !isSourceNoise(signal?.detail);
    })
    .map((situation) => {
      const row = toSituationRowData(situation);
      return { situation, row, story: toSituationStoryCardData(row) };
    });

  const featured = selectFeaturedSituation(situations);
  const featuredDetails = featuredCopy(featured, "CFB");
  const livePills: LiveGamePillData[] = useMemo(
    () => liveGames.map((game) => toLiveGamePillData(game, relatedSignalCount(game, rankedCFB), "cfb")),
    [liveGames, rankedCFB],
  );
  const visibleLanes = profile.laneOrder.filter((lane) => activeLane === "all" || activeLane === lane);
  const confirmed = rankedCFB.filter((signal) => signal.verdict === "confirmed").length;
  const topUrgentSituations = situations.filter((situation) => situation.lane === "escalating").slice(0, 2);

  const openSituation = (situation: BoardSituation) => {
    if (situation.kind !== "signal" && situation.kind !== "canonical") return;
    const signal = situation.signal as CFBSignal | SignalDetailLike | undefined;
    if (!signal) return;
    if (situation.kind === "canonical") {
      navigate("/story/" + encodeURIComponent(String(signal.id)));
      return;
    }
    const index = visibleSignals.findIndex((item) => String(item.id) === String(signal.id));
    if (!rowIsFree(index)) {
      openModal("CFB");
      return;
    }
    setSelectedSig(signal as SignalDetailLike);
  };

  return (
    <div className="league-board-shell es-league-cfb">
      <LiveTicker items={buildBoardTickerItems(canonicalSituations)} />
      <div className="board-header-row">
        <span className="shrink-0 text-[0.6rem] font-bold uppercase tracking-widest text-muted-foreground/70">Conference</span>
        <div className="w-px self-stretch bg-border/60" />
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
      </div>
      <main className="board-main-col mx-auto flex w-[calc(100vw-24px)] max-w-[calc(100vw-24px)] flex-col gap-3 overflow-x-hidden py-3 sm:w-full sm:max-w-7xl sm:gap-4 sm:px-6 sm:py-5">
        <BoardCommandBar
          kicker="CFB Story Board"
          title={profile.boardLabel}
          statusLabel={hasLiveCFBData
            ? `${canonicalSituations.length ? "Verified sources" : "Live coverage"} / ${rankedCFB.length} updates`
            : `Offseason fallback context / ${rankedCFB.length} watch items`}
          liveCount={hasLiveCFBData ? situations.filter((situation) => situation.lane === "escalating" || situation.lane === "live").length : undefined}
          tabs={CFB_FILTERS.map((filter) => ({ id: filter.key, label: filter.label }))}
          activeTabId={sidebarFilter}
          onTabChange={(value) => setSidebarFilter(value as CFBFilterKey)}
          density="compact"
          actions={[{ label: "Refresh", icon: <RefreshCw className="h-4 w-4" />, onClick: () => { refresh(); refreshCanonical(); }, variant: "outline" }]}
        />

        <div className="sm:grid sm:grid-cols-[minmax(0,1fr)_220px] sm:items-start sm:gap-4">
          <FeaturedSituation
            situation={featured ? toSituationRowData(featured) : undefined}
            eyebrow={hasLiveCFBData ? profile.featuredLabel : "Offseason Watch Context"}
            title={featuredDetails.title}
            summary={featuredDetails.summary}
            primaryRead={featuredDetails.primaryRead}
            secondaryRead={featuredDetails.secondaryRead}
            metrics={featuredDetails.metrics}
            mobileDensity="compact"
            className="sm:mb-1"
            actions={featured ? [{ label: "Open Story", onClick: () => openSituation(featured) }] : undefined}
          />
          <BoardSignalRail situations={situations} />
        </div>

        <TrackRecordStrip league="CFB" darkMode={darkMode} />

        <LiveGameStrip
          title={profile.liveStripLabel}
          summary="Conference/offseason context. Scheduled games recede unless verified source-backed story pressure attaches."
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

        {topUrgentSituations.length > 0 && (
          <div className="-mt-1 sm:-mt-0.5">
            <SituationLane
              lane="escalating"
              title="Stories to Watch"
              summary="Conference and slate changes with enough source support to sit above the broader board."
              situations={topUrgentSituations.map(toSituationRowData)}
              compact
              cadence="entry"
              copyVariant="editorial"
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

        <div className="board-premium-stat-grid grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                  {laneItems.map(({ situation, story }) => (
                    <SituationStoryCard
                      key={situation.id}
                      story={story}
                      compact={compact && lane === "background"}
                      onOpen={(situation.kind === "signal" || situation.kind === "canonical") ? () => openSituation(situation) : undefined}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {storyItems.length > 0 && (
          <div className="flex items-center justify-between rounded border border-border/50 bg-muted/5 px-3 py-2 text-[0.7rem] font-semibold text-muted-foreground/70">
            <span>{storyItems.length} CFB stories shown</span>
            <span>Board updated {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        )}

        {(loading || canonicalLoading) && <div className="es-skeleton h-20 rounded border border-border" />}

        {!isLive && !hasLiveCFBData && (
          <section className="max-w-full overflow-hidden rounded-md border border-border bg-card/75 px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <span className="data-label text-primary">CFB Watch Board</span>
                <h3 className="mt-0.5 font-sans text-sm font-bold text-foreground sm:text-base">
                  {error ? "Feed unavailable — showing offseason context" : "ES Agents on watch — no verified CFB breaks yet"}
                </h3>
                <p className="mt-0.5 break-words text-[0.8rem] font-medium leading-snug text-muted-foreground sm:text-sm">
                  Roster movement, QB rooms, transfer portal, and conference context remain under limited watch.
                </p>
              </div>
              <span className="max-w-full basis-full whitespace-normal break-words rounded border border-border/80 bg-muted/10 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-widest text-muted-foreground/85 sm:basis-auto sm:shrink-0">
                Nothing verified yet
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["Transfer portal", "QB depth", "Eligibility rulings", "Offseason context"].map((check) => (
                <span key={check} className="rounded border border-border/80 bg-muted/10 px-2 py-1 text-[0.68rem] font-bold text-muted-foreground">
                  {check}
                </span>
              ))}
            </div>
          </section>
        )}
      </main>

      <SignalDetailDrawer open={Boolean(selectedSig)} signal={selectedSig} sport="CFB" onClose={() => setSelectedSig(null)} />
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

function relatedSignalCount(game: CFBLiveGame, signals: { team?: string | null; opponent?: string | null }[]) {
  const away = game.awayTeam?.toLowerCase() ?? "";
  const home = game.homeTeam?.toLowerCase() ?? "";
  return signals.filter((signal) => {
    const team = signal.team?.toLowerCase() ?? "";
    const opponent = signal.opponent?.toLowerCase() ?? "";
    return team === away || team === home || opponent === away || opponent === home;
  }).length;
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
