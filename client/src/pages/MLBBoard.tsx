import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useSearch } from "wouter";

import AppShell from "@/components/V2Shell";
import { SignalDetailDrawer, type SignalDetailLike } from "@/components/SignalDetailDrawer";
import { BoardCommandBar } from "@/components/board/BoardCommandBar";
import { BoardPriorityControls } from "@/components/board/BoardPriorityControls";
import { FeaturedSituation } from "@/components/board/FeaturedSituation";
import { LiveGameStrip } from "@/components/board/LiveGameStrip";
import { SituationLane } from "@/components/board/SituationLane";
import { TopDevelopments } from "@/components/board/TopDevelopments";
import {
  featuredCopy,
  situationMatchesPriority,
  sortModeFromPriority,
  toLiveGamePillData,
  toSituationRowData,
  type AnyBoardGame,
} from "@/components/board/boardAdapters";
import { useMLBSignals } from "@/hooks/useSignals";
import { buildBoardSituations, rankBoardSituations, selectFeaturedSituation, type BoardSituation } from "@/lib/boardSituations";
import { getLeagueBoardProfile } from "@/lib/leagueBoardProfiles";
import { canonicalSituationsToBoardSituations, mergeCanonicalWithBoardSituations } from "@/lib/situationAdapters";
import { filterCanonicalSituations, useCanonicalSituations } from "@/lib/situationsApi";
import { boardFilterFeedback, boardSortFeedback, compareSignals, signalIsActionable, signalLifecycle, type BoardSortMode } from "@/lib/signalBoardUx";
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
  id: number;
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
  });
  const profile = getLeagueBoardProfile("MLB");
  const allSignals = (data ?? []) as Signal[];

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    fetch("/api/v2/games?league=MLB")
      .then((response) => response.json())
      .then((payload) => {
        const statusLabel: Record<string, string> = {
          live: "In Progress",
          final: "Final",
          scheduled: "Scheduled",
          postponed: "Postponed",
        };
        const adapted: LiveGame[] = (payload.games ?? [])
          .filter((game: any) => game.game_time?.slice(0, 10) === today)
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

  const featured = selectFeaturedSituation(situations);
  const featuredDetails = featuredCopy(featured, "MLB");
  const livePills = liveGames.map((game) => toLiveGamePillData(game, relatedSignalCount(game, allSignals)));
  const visibleLanes = profile.laneOrder.filter((lane) => activeLane === "all" || activeLane === lane);
  const hasSituations = situations.length > 0;
  const topUrgentSituations = situations.filter((situation) => situation.lane === "escalating").slice(0, 2);

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

  return (
    <AppShell>
      <main className="league-board-shell es-league-mlb board-main-col mx-auto flex w-[calc(100vw-24px)] max-w-[calc(100vw-24px)] flex-col gap-3 overflow-x-hidden py-3 sm:w-full sm:max-w-7xl sm:px-6 sm:py-5">
        <BoardCommandBar
          kicker="MLB Story Board"
          title={profile.boardLabel}
          statusLabel={`${canonicalSituations.length ? "Verified sources" : "Live coverage"} / ${allSignals.length} updates / ${situations.length} stories`}
          liveCount={liveGames.filter((game) => game.statusDescription?.toLowerCase().includes("in progress")).length}
          tabs={FEED_TABS.map((tab) => ({ id: tab.key, label: tab.label }))}
          activeTabId={activeTab}
          onTabChange={setActiveTab}
          actions={[{ label: "Refresh", icon: <RefreshCw className="h-4 w-4" />, onClick: () => { refresh(); refreshCanonical(); }, variant: "outline" }]}
        />

          <LiveGameStrip
            title={profile.liveStripLabel}
            summary={gamesLoading ? "Slate context loading." : "Probable pitchers, lineup cards, weather, bullpen load, source agreement, and inning states stay on watch."}
            games={livePills}
            activeGameId={activeGameId}
            emptyLabel="MLB slate watch is active; no game has crossed the live threshold."
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
          density={featured ? "default" : "compact"}
          actions={featured?.kind === "signal" ? [{ label: "Open Story", onClick: () => openSituation(featured) }] : undefined}
        />

        <TopDevelopments league="MLB" situations={situations} onSelect={openSituation} />

        {topUrgentSituations.length > 0 && (
          <div className="sm:hidden">
            <SituationLane
              lane="escalating"
              title="Urgent Developing Stories"
              summary="Highest-priority changes before the broader board."
              situations={topUrgentSituations.map(toSituationRowData)}
              compact
              onSituationSelect={(row) => {
                const situation = topUrgentSituations.find((item) => item.id === row.id);
                if (situation) openSituation(situation);
              }}
            />
          </div>
        )}

        {hasSituations ? (
          <>
            <BoardPriorityControls
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
              {boardSortFeedback(sortMode)} {boardFilterFeedback({ filter: FEED_TABS.find((tab) => tab.key === activeTab)?.label, liveOnly, actionableOnly })}
              {canonicalError ? ` ${canonicalError}` : ""}
            </div>

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
                    emptyLabel={emptyLaneCopy(lane)}
                    onSituationSelect={(row) => {
                      const situation = laneSituations.find((item) => item.id === row.id);
                      if (situation) openSituation(situation);
                    }}
                  />
                );
              })}
            </div>
          </>
        ) : (
          <SparseOperationalState
            title="No developing story above threshold"
            detail="Coverage is monitoring lineup cards, probable/confirmed pitchers, weather cells, bullpen availability, late scratches, source agreement, and market reaction."
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

      <SignalDetailDrawer open={!!drawerSignal} signal={drawerSignal} sport="MLB" onClose={() => setDrawerSignal(null)} />
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
          <span className="data-label text-primary">Coverage Watch</span>
          <h3 className="mt-0.5 font-sans text-sm font-bold text-foreground sm:text-base">{title}</h3>
          <p className="mt-0.5 break-words text-[0.8rem] font-medium leading-snug text-muted-foreground sm:text-sm">{detail}</p>
        </div>
        <span className="max-w-full basis-full whitespace-normal break-words rounded border border-border/80 bg-muted/10 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-widest text-muted-foreground/85 sm:basis-auto sm:shrink-0">
          Awaiting verified stories
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
