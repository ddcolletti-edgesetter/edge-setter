import { Radio } from "lucide-react";

import { cn } from "@/lib/utils";
import { LiveGamePill, type LiveGamePillData } from "./LiveGamePill";

interface LiveGameStripProps {
  games: LiveGamePillData[];
  activeGameId?: string;
  title?: string;
  summary?: string;
  emptyLabel?: string;
  density?: "default" | "compact";
  watchStoryCount?: number;
  copyVariant?: "legacy" | "editorial";
  className?: string;
  onGameSelect?: (game: LiveGamePillData) => void;
}

export function LiveGameStrip({
  games,
  activeGameId,
  title = "Live Board",
  summary,
  emptyLabel = "No key games queued",
  density = "default",
  watchStoryCount,
  copyVariant = "legacy",
  className,
  onGameSelect,
}: LiveGameStripProps) {
  const liveCount = games.filter((game) => game.status === "live" || game.status === "halftime").length;
  const compactMonitoring = liveCount === 0 || density === "compact";
  const sortedGames = [...games].sort((a, b) => urgencyRank(b) - urgencyRank(a));
  const featuredGame = sortedGames[0];
  const keyGameCount = sortedGames.filter((game) => urgencyRank(game) >= 2).length;
  const activityLabel = formatActivityLabel(liveCount, keyGameCount, copyVariant === "editorial" ? watchStoryCount : undefined);

  return (
    <section className={cn("board-live-strip max-w-full overflow-hidden rounded-md border border-border bg-card/80 shadow-[0_18px_48px_rgba(0,0,0,0.18)]", className)}>
      <div className={cn("board-live-strip-header flex flex-wrap items-center gap-2 border-b border-border/70 px-3 sm:px-4", compactMonitoring ? "py-1.5" : "py-2")}>
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
          <Radio className="h-4 w-4 text-primary" />
          <span className="data-label truncate text-primary">{title}</span>
        </div>
        {featuredGame && (
          <span className="board-live-featured-game min-w-0 truncate">
            {featuredGame.away.abbreviation} @ {featuredGame.home.abbreviation} / {featuredGame.clock ?? featuredGame.period ?? statusLabel(featuredGame.status)}
          </span>
        )}
        <span className="ml-auto shrink-0 rounded border border-border bg-muted/30 px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-widest text-muted-foreground tabular-nums">
          {activityLabel}
        </span>
        {summary && (
          <p className={cn("min-w-0 basis-full break-words font-medium leading-snug text-muted-foreground sm:basis-auto", compactMonitoring ? "text-[0.68rem] opacity-75" : "text-[0.72rem]")}>
            {summary}
          </p>
        )}
      </div>

      {games.length > 0 ? (
        <div className={cn(
          "max-w-full px-3 sm:px-4",
          compactMonitoring ? "py-1.5" : "py-2",
          sortedGames.length <= 3
            ? "grid gap-2"
            : "flex gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
          style={sortedGames.length <= 3 ? { gridTemplateColumns: `repeat(${sortedGames.length}, minmax(0, 1fr))` } : undefined}
        >
          {sortedGames.map((game, index) => (
            <LiveGamePill
              key={game.id}
              game={game}
              compact={compactMonitoring && index > 0}
              copyVariant={copyVariant}
              selected={game.id === activeGameId}
              className={cn(index === 0 ? "board-live-pill-featured" : undefined, sortedGames.length <= 3 && "w-full")}
              onSelect={onGameSelect}
            />
          ))}
        </div>
      ) : (
        <div className={cn("px-4 font-medium text-muted-foreground", compactMonitoring ? "py-2 text-[0.78rem]" : "py-3 text-sm")}>{emptyLabel}</div>
      )}
    </section>
  );
}

function formatActivityLabel(liveCount: number, keyGameCount: number, watchStoryCount?: number) {
  const gameLabel = liveCount > 0
    ? `${liveCount} live game${liveCount === 1 ? "" : "s"}`
    : "No live games";
  if (typeof watchStoryCount === "number") {
    if (watchStoryCount > 0) {
      return `${gameLabel} / ${watchStoryCount} watch stor${watchStoryCount === 1 ? "y" : "ies"}`;
    }
    return `${gameLabel} / slate watch`;
  }
  return `${gameLabel} / ${keyGameCount} key game${keyGameCount === 1 ? "" : "s"}`;
}

function urgencyRank(game: LiveGamePillData) {
  const urgency = game.urgency ?? "low";
  const base = urgency === "critical" ? 4 : urgency === "high" ? 3 : urgency === "medium" ? 2 : 1;
  return base + (game.escalationCount ?? 0) * 0.4 + (game.status === "live" || game.status === "halftime" ? 0.5 : 0);
}

function statusLabel(status: LiveGamePillData["status"]) {
  if (status === "halftime") return "Halftime";
  return status[0].toUpperCase() + status.slice(1);
}
