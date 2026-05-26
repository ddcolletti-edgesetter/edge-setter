import type { HTMLAttributes } from "react";
import { AlertTriangle, Clock3, Radio, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TeamLogoImg } from "@/components/v2/SportVisuals";

export type LiveGameStatus = "scheduled" | "live" | "halftime" | "final" | "delayed";
export type BoardUrgency = "low" | "medium" | "high" | "critical";

export interface LiveGameTeam {
  abbreviation: string;
  score?: string | number;
  record?: string;
}

export interface LiveGamePillData {
  id: string;
  away: LiveGameTeam;
  home: LiveGameTeam;
  status: LiveGameStatus;
  clock?: string;
  period?: string;
  market?: string;
  note?: string;
  urgency?: BoardUrgency;
  escalationCount?: number;
  confirmedCount?: number;
}

interface LiveGamePillProps extends Omit<HTMLAttributes<HTMLButtonElement>, "onSelect"> {
  game: LiveGamePillData;
  selected?: boolean;
  compact?: boolean;
  onSelect?: (game: LiveGamePillData) => void;
}

const urgencyClass: Record<BoardUrgency, string> = {
  low: "border-border bg-card text-muted-foreground",
  medium: "border-[rgba(111,164,191,0.32)] bg-[rgba(111,164,191,0.08)] text-foreground",
  high: "border-[rgba(230,180,80,0.42)] bg-[rgba(230,180,80,0.1)] text-foreground es-state-developing",
  critical: "border-destructive/45 bg-destructive/10 text-foreground es-state-escalated",
};

const statusLabel: Record<LiveGameStatus, string> = {
  scheduled: "Scheduled",
  live: "Live",
  halftime: "Live",
  final: "Final",
  delayed: "Delayed",
};

export function LiveGamePill({ game, selected, compact, onSelect, className, ...props }: LiveGamePillProps) {
  const isLive = game.status === "live" || game.status === "halftime";
  const urgency = game.urgency ?? "low";

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect?.(game)}
      className={cn(
        "ux-row-interactive flex shrink-0 items-center gap-2 overflow-hidden rounded-md border text-left shadow-[inset_0_1px_0_rgba(248,250,252,0.035)] sm:gap-3",
        compact ? "w-[min(15.5rem,calc(100vw-4rem))] px-2.5 py-1.5 sm:w-[238px] sm:px-2.5 sm:py-1.5" : "w-[min(18rem,calc(100vw-3rem))] px-3 py-2 sm:w-[250px] sm:px-3 sm:py-2",
        urgencyClass[urgency],
        selected && "border-primary/60 bg-primary/10 shadow-[inset_2px_0_0_hsl(var(--primary))]",
        className,
      )}
      {...props}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("es-live-dot", isLive ? "es-live-pulse" : "es-live-dot-subtle")} />
          <span className="data-label truncate text-[0.68rem] text-muted-foreground">
            {statusLabel[game.status]}
          </span>
          {game.period && <span className="truncate text-[0.68rem] font-semibold text-muted-foreground">{game.period}</span>}
          {game.clock && (
            <span className="ml-auto flex min-w-0 items-center gap-1 text-[0.68rem] font-semibold tabular-nums text-muted-foreground">
              <Clock3 className="h-3 w-3" />
              <span className="truncate">{game.clock}</span>
            </span>
          )}
        </span>

        <span className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 font-bold text-foreground", compact ? "text-[0.82rem]" : "text-sm")}>
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            {!compact && <TeamLogoImg abbr={game.away.abbreviation} size={22} />}
            <span className="truncate">{game.away.abbreviation}</span>
          </span>
          <span className="font-mono text-[0.78rem] tabular-nums text-muted-foreground">
            {formatScore(game.away.score)}-{formatScore(game.home.score)}
          </span>
          <span className="flex min-w-0 items-center justify-end gap-1.5 truncate text-right">
            <span className="truncate">{game.home.abbreviation}</span>
            {!compact && <TeamLogoImg abbr={game.home.abbreviation} size={22} />}
          </span>
        </span>

        {(game.market || game.note) && (
          <span className={cn("truncate font-medium text-muted-foreground", compact ? "text-[0.66rem]" : "text-[0.72rem]")}>
            {game.market ?? game.note ?? pressureLabel(game)}
          </span>
        )}
      </span>

      {(game.escalationCount || game.confirmedCount) && (
        <span className="flex max-w-[5.8rem] shrink-0 flex-col items-end gap-1">
          {!!game.escalationCount && (
            <Badge variant="outline" className="h-5 gap-1 border-destructive/40 bg-destructive/10 px-1.5 text-[0.62rem] text-destructive">
              <AlertTriangle className="h-3 w-3" />
              Alert {game.escalationCount}
            </Badge>
          )}
          {!!game.confirmedCount && (
            <Badge variant="outline" className="h-5 gap-1 border-[rgba(24,212,123,0.34)] bg-[rgba(24,212,123,0.1)] px-1.5 text-[0.62rem] text-[var(--es-green)]">
              {game.status === "live" ? <Radio className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
              Confirmed {game.confirmedCount}
            </Badge>
          )}
        </span>
      )}
    </button>
  );
}

function formatScore(score: LiveGameTeam["score"]) {
  return score == null || score === "" ? "--" : String(score);
}

function pressureLabel(game: LiveGamePillData) {
  if (game.escalationCount) return `${game.escalationCount} lineup/injury alert${game.escalationCount === 1 ? "" : "s"}`;
  if (game.confirmedCount) return `${game.confirmedCount} confirmed update${game.confirmedCount === 1 ? "" : "s"}`;
  return "no major shift";
}
