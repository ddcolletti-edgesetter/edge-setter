import { ArrowDownUp, Layers3, ListFilter, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { SituationLaneType } from "./SituationRow";

export interface BoardPriorityOption {
  id: string;
  label: string;
}

interface BoardPriorityControlsProps {
  lanes?: SituationLaneType[];
  activeLane?: SituationLaneType | "all";
  sortOptions?: BoardPriorityOption[];
  activeSortId?: string;
  urgencyOptions?: BoardPriorityOption[];
  activeUrgencyId?: string;
  compact?: boolean;
  showConfirmed?: boolean;
  className?: string;
  onLaneChange?: (lane: SituationLaneType | "all") => void;
  onSortChange?: (sortId: string) => void;
  onUrgencyChange?: (urgencyId: string) => void;
  onCompactChange?: (compact: boolean) => void;
  onShowConfirmedChange?: (showConfirmed: boolean) => void;
}

const laneLabels: Record<SituationLaneType | "all", string> = {
  all: "All",
  escalating: "Escalating stories",
  live: "Live watch",
  decision: "Decision windows",
  confirmed: "Verified",
  background: "Background watch",
};

export function BoardPriorityControls({
  lanes = ["escalating", "live", "decision", "confirmed", "background"],
  activeLane = "all",
  sortOptions = [
    { id: "urgency", label: "Story priority" },
    { id: "freshness", label: "Freshness" },
    { id: "confidence", label: "Confidence" },
  ],
  activeSortId = "urgency",
  urgencyOptions = [
    { id: "all", label: "All priorities" },
    { id: "high", label: "High+" },
    { id: "critical", label: "Critical" },
  ],
  activeUrgencyId = "all",
  compact,
  showConfirmed = true,
  className,
  onLaneChange,
  onSortChange,
  onUrgencyChange,
  onCompactChange,
  onShowConfirmedChange,
}: BoardPriorityControlsProps) {
  return (
    <section className={cn("board-priority-controls flex max-w-full flex-col gap-2 overflow-hidden rounded-md border border-border/90 bg-card/75 p-2.5 sm:flex-row sm:items-center sm:gap-3 sm:p-3", className)}>
      <div className="flex min-w-0 items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-primary" />
        <span className="data-label text-[0.68rem] text-primary">Story view</span>
      </div>

      <div className="flex max-w-full gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] sm:flex-1 [&::-webkit-scrollbar]:hidden">
        <LaneButton lane="all" active={activeLane === "all"} onClick={() => onLaneChange?.("all")} />
        {lanes.map((lane) => (
          <LaneButton key={lane} lane={lane} active={activeLane === lane} onClick={() => onLaneChange?.(lane)} />
        ))}
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:items-center">
        <Select value={activeUrgencyId} onValueChange={onUrgencyChange}>
          <SelectTrigger className="h-8 min-w-0 border-border bg-muted/20 text-xs sm:min-w-[132px]">
            <ListFilter className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {urgencyOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={activeSortId} onValueChange={onSortChange}>
          <SelectTrigger className="h-8 min-w-0 border-border bg-muted/20 text-xs sm:min-w-[126px]">
            <ArrowDownUp className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-0 items-center justify-between gap-3 sm:justify-start">
        {onCompactChange && (
          <label className="flex items-center gap-2 text-[0.72rem] font-bold uppercase tracking-widest text-muted-foreground">
            <Layers3 className="h-3.5 w-3.5" />
            Compact
            <Switch checked={!!compact} onCheckedChange={onCompactChange} className="scale-75" />
          </label>
        )}
        {onShowConfirmedChange && (
          <label className="flex items-center gap-2 text-[0.72rem] font-bold uppercase tracking-widest text-muted-foreground">
            Confirmed
            <Switch checked={showConfirmed} onCheckedChange={onShowConfirmedChange} className="scale-75" />
          </label>
        )}
      </div>
    </section>
  );
}

function LaneButton({ lane, active, onClick }: { lane: SituationLaneType | "all"; active: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      className={cn("h-8 shrink-0 px-2.5 text-[0.68rem] uppercase tracking-widest", !active && "border-border bg-muted/20 text-muted-foreground")}
    >
      {laneLabels[lane]}
    </Button>
  );
}
