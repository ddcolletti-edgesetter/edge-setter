import { AlertTriangle, CheckCircle2, Clock3, Radio, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SituationRow, type SituationLaneType, type SituationRowData } from "./SituationRow";

interface SituationLaneProps {
  lane: SituationLaneType;
  situations: SituationRowData[];
  title?: string;
  summary?: string;
  selectedSituationId?: string;
  compact?: boolean;
  cadence?: "default" | "entry" | "quiet";
  limit?: number;
  emptyLabel?: string;
  copyVariant?: "legacy" | "editorial";
  className?: string;
  onSituationSelect?: (situation: SituationRowData) => void;
}

const legacyLaneLabels: Record<SituationLaneType, string> = {
  escalating: "Escalating Stories",
  live: "Live Game Watch",
  decision: "Decision Windows",
  confirmed: "Verified Stories",
  background: "Background Watch",
};

const editorialLaneLabels: Record<SituationLaneType, string> = {
  escalating: "Lead Stories",
  live: "Game Windows",
  decision: "Watch Before Lock",
  confirmed: "Confirmed Updates",
  background: "Monitoring",
};

const laneMeta: Record<SituationLaneType, { icon: JSX.Element; className: string }> = {
  escalating: {
    icon: <ShieldAlert className="h-4 w-4" />,
    className: "border-destructive/35 text-destructive",
  },
  live: {
    icon: <Radio className="h-4 w-4" />,
    className: "border-[rgba(24,212,123,0.34)] text-[var(--es-green)]",
  },
  decision: {
    icon: <AlertTriangle className="h-4 w-4" />,
    className: "border-[rgba(230,180,80,0.36)] text-[var(--es-amber)]",
  },
  confirmed: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    className: "border-primary/35 text-primary",
  },
  background: {
    icon: <Clock3 className="h-4 w-4" />,
    className: "border-border text-muted-foreground",
  },
};

export function SituationLane({
  lane,
  situations,
  title,
  summary,
  selectedSituationId,
  compact,
  cadence = "default",
  limit,
  emptyLabel = "No developing stories in this lane",
  copyVariant = "legacy",
  className,
  onSituationSelect,
}: SituationLaneProps) {
  const meta = laneMeta[lane];
  const laneLabels = copyVariant === "editorial" ? editorialLaneLabels : legacyLaneLabels;
  const visibleSituations = typeof limit === "number" ? situations.slice(0, limit) : situations;
  const hiddenCount = Math.max(0, situations.length - visibleSituations.length);

  return (
    <section
      className={cn(
        "situation-lane max-w-full overflow-hidden rounded-md border border-border bg-card/80",
        `situation-lane-${lane}`,
        cadence === "entry" && "border-border/90 bg-card/85",
        cadence === "quiet" && "bg-card/70",
        className,
      )}
    >
      <header className={cn("flex flex-wrap items-center gap-2 border-b border-border/60 px-3", cadence === "entry" ? "bg-muted/10 py-3" : "bg-muted/5 py-2.5")}>
        <span className={cn("inline-flex min-w-0 max-w-[calc(100%-3rem)] items-center gap-2 text-sm font-semibold", meta.className)}>
          {meta.icon}
          <span className="truncate">{title ?? laneLabels[lane]}</span>
        </span>
        <Badge variant="outline" className="ml-auto h-5 border-border/60 bg-transparent px-1.5 text-[0.62rem] text-muted-foreground/80 tabular-nums">
          {situations.length}
        </Badge>
        {summary && <p className="basis-full text-[0.74rem] font-medium leading-snug text-muted-foreground">{summary}</p>}
      </header>

      <div>
        {visibleSituations.length > 0 ? (
          visibleSituations.map((situation) => (
            <SituationRow
              key={situation.id}
              situation={{ ...situation, lane: situation.lane ?? lane }}
              compact={compact}
              copyVariant={copyVariant}
              selected={situation.id === selectedSituationId}
              onSelect={onSituationSelect}
            />
          ))
        ) : (
          <div className="px-3 py-4 text-sm font-medium text-muted-foreground">{emptyLabel}</div>
        )}
      </div>

      {hiddenCount > 0 && (
        <footer className="border-t border-border/70 px-3 py-2 text-[0.72rem] font-bold uppercase tracking-widest text-muted-foreground">
          +{hiddenCount} more developing stories
        </footer>
      )}
    </section>
  );
}
