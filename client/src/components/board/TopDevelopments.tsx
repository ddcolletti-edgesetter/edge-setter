import { Clock3 } from "lucide-react";

import { TeamLogoLockup } from "@/components/SportsMedia";
import { isUnknownTeamAbbr, toTeamAbbr } from "@/components/v2/SportVisuals";
import type { BoardSituation } from "@/lib/boardSituations";
import { toSituationRowData } from "./boardAdapters";

interface TopDevelopmentsProps {
  league: "NBA" | "MLB" | "NFL" | "CFB";
  situations: BoardSituation[];
  copyVariant?: "legacy" | "editorial";
  onSelect?: (situation: BoardSituation) => void;
}

const sportForLeague = {
  NBA: "nba",
  MLB: "mlb",
  NFL: "nfl",
  CFB: "cfb",
} as const;

export function TopDevelopments({ league, situations, copyVariant = "legacy", onSelect }: TopDevelopmentsProps) {
  const rows = situations.slice(0, 5);

  return (
    <section className="top-developments-module rounded-md border border-border bg-card/85">
      <header className="flex min-w-0 items-center justify-between gap-3 border-b border-border/70 px-3 py-2.5">
        <div className="min-w-0">
          <span className="data-label block text-[0.62rem] text-primary">{league} Watch Stories</span>
          <strong className="block truncate text-sm text-foreground">What changed across lineup, injury, roster, and market context</strong>
        </div>
        <span className="rounded border border-border bg-muted/20 px-2 py-1 text-[0.66rem] font-bold uppercase tracking-widest text-muted-foreground">
          {rows.length} stories
        </span>
      </header>

      <div className="grid min-w-0 gap-0 lg:grid-cols-2">
        {rows.map((situation) => {
          const row = toSituationRowData(situation);
          const identity = row.sportsIdentity;
          const team = cleanTeamAbbr(identity?.team ?? identity?.awayTeam);
          const opponent = cleanTeamAbbr(identity?.opponent ?? identity?.homeTeam);
          const logo = team || opponent || league;
          const subject = identity?.player && !isUnknownTeamAbbr(identity.player) ? identity.player : team || row.matchup || league;
          const isClickable = situation.kind === "signal" || situation.kind === "canonical";
          return (
            <button
              key={situation.id}
              type="button"
              onClick={isClickable ? () => onSelect?.(situation) : undefined}
              className={`top-developments-row flex min-w-0 items-center gap-2 border-b border-border/60 px-3 py-2.5 text-left last:border-b-0 lg:[&:nth-last-child(2)]:border-b-0${isClickable ? "" : " cursor-default"}`}
            >
              <TeamLogoLockup
                league={league}
                sport={sportForLeague[league]}
                team={logo}
                player={subject}
                storyType={developmentType(row.title)}
                size="mini"
                className="top-development-lockup"
              />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <strong className="truncate text-[0.78rem] text-foreground">{subject}</strong>
                  {copyVariant === "editorial" ? (
                    <span className="shrink-0 rounded border border-border bg-muted/20 px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-widest text-muted-foreground tabular-nums">
                      Priority {row.urgencyScore}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[0.68rem] font-bold text-primary">{row.urgencyScore}</span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-[0.76rem] font-semibold text-muted-foreground">{row.title}</span>
                <span className="mt-1 flex min-w-0 items-center gap-2 text-[0.66rem] font-bold text-muted-foreground">
                  <span className="truncate">{row.sourceProgressLabel ?? row.sourceSummary ?? "source agreement pending"}</span>
                  {row.timestamp && (
                    <span className="ml-auto inline-flex shrink-0 items-center gap-1 tabular-nums">
                      <Clock3 className="h-3 w-3" />
                      {row.timestamp}
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function cleanTeamAbbr(value?: string) {
  const abbr = toTeamAbbr(value ?? "");
  return isUnknownTeamAbbr(abbr) ? "" : abbr;
}

function developmentType(title: string) {
  const text = title.toLowerCase();
  if (text.includes("injury") || text.includes("dnp") || text.includes("questionable")) return "injury";
  if (text.includes("lineup") || text.includes("scratch")) return "lineup";
  if (text.includes("pitcher") || text.includes("starter")) return "pitcher";
  if (text.includes("depth") || text.includes("camp")) return "depth";
  if (text.includes("roster") || text.includes("portal")) return "roster";
  return "watch";
}
