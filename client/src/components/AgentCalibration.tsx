import { BrainCircuit, GitBranch, History, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

export type CalibrationTone = "default" | "strong" | "watch";

export interface AgentCalibrationInput {
  confidence?: number | null;
  sourceCount?: number | null;
  timingLabel?: string | null;
  storyType?: string | null;
  marketReaction?: string | null;
  sourceSummary?: string | null;
}

export function AgentCalibrationBadge({
  input,
  compact,
  className,
}: {
  input: AgentCalibrationInput;
  compact?: boolean;
  className?: string;
}) {
  const tone = calibrationTone(input);
  const detail = calibrationDetail(input);

  return (
    <span
      className={cn(
        "agent-calibration-badge inline-flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden rounded border px-2 py-1 text-[0.64rem] font-bold uppercase tracking-widest",
        tone === "strong"
          ? "border-[rgba(24,212,123,0.34)] bg-[rgba(24,212,123,0.08)] text-[var(--es-green)]"
          : tone === "watch"
            ? "border-[rgba(245,184,65,0.34)] bg-[rgba(245,184,65,0.08)] text-[var(--es-amber)]"
            : "border-border bg-muted/15 text-muted-foreground",
        className,
      )}
      title={`${detail}. Confidence support, not certainty.`}
    >
      <BrainCircuit className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{compact ? "EdgeSetter evidence" : detail}</span>
    </span>
  );
}

export function HistoricalPatternMatch({
  input,
  compact,
  className,
}: {
  input: AgentCalibrationInput;
  compact?: boolean;
  className?: string;
}) {
  const pattern = patternLabel(input);
  const support = input.confidence ? `${Math.round(input.confidence)}% support signal` : "Awaiting verification";

  return (
    <div className={cn("min-w-0 rounded border border-border bg-muted/10 p-2", className)}>
      <div className="flex min-w-0 items-center gap-2">
        <History className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="data-label min-w-0 truncate text-[0.6rem]">Historical pattern match</span>
      </div>
      <strong className="mt-1 block truncate text-[0.76rem] text-foreground">{pattern}</strong>
      {!compact && <p className="mt-1 text-[0.72rem] font-medium leading-snug text-muted-foreground">{support}; comparable path, not guaranteed prediction.</p>}
    </div>
  );
}

export function ChainReactionPreview({
  input,
  compact,
  className,
}: {
  input: AgentCalibrationInput;
  compact?: boolean;
  className?: string;
}) {
  const reaction = chainReaction(input);

  return (
    <div className={cn("min-w-0 rounded border border-border bg-muted/10 p-2", className)}>
      <div className="flex min-w-0 items-center gap-2">
        <GitBranch className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="data-label min-w-0 truncate text-[0.6rem]">Likely chain reaction</span>
      </div>
      <strong className="mt-1 block text-[0.76rem] leading-snug text-foreground">{reaction}</strong>
      {!compact && <p className="mt-1 text-[0.72rem] font-medium leading-snug text-muted-foreground">Watch betting, fantasy, and team/fan context for confirmation or reversal.</p>}
    </div>
  );
}

export function WhatToWatchNext({
  confirm,
  weaken,
  next,
  compact,
  className,
}: {
  confirm: string;
  weaken: string;
  next: string;
  compact?: boolean;
  className?: string;
}) {
  const rows = compact
    ? [{ label: "Watch for confirmation", value: confirm }]
    : [
        { label: "Watch for confirmation", value: confirm },
        { label: "Weakens if...", value: weaken },
        { label: "Next ripple", value: next },
      ];

  return (
    <div className={cn("grid min-w-0 gap-1.5", className)}>
      {rows.map((row) => (
        <div key={row.label} className="min-w-0 rounded border border-border bg-muted/10 px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="data-label min-w-0 truncate text-[0.6rem]">{row.label}</span>
          </div>
          <strong className="mt-1 block text-[0.74rem] leading-snug text-foreground">{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

function calibrationTone(input: AgentCalibrationInput): CalibrationTone {
  if ((input.confidence ?? 0) >= 78 && (input.sourceCount ?? 0) >= 2) return "strong";
  if ((input.sourceCount ?? 0) <= 1 || !input.confidence) return "watch";
  return "default";
}

function calibrationDetail(input: AgentCalibrationInput) {
  const pieces = [
    "EdgeSetter evidence",
    input.sourceCount ? "source reliability tested" : "source reliability pending",
    input.timingLabel ? "timing pattern compared" : "timing watch",
  ];
  return pieces.join(" / ");
}

function patternLabel(input: AgentCalibrationInput) {
  const type = (input.storyType ?? "").toLowerCase();
  if (/injury|questionable|dnp|availability/.test(type)) return "Comparable injury/availability path";
  if (/lineup|rotation|starter|scratch/.test(type)) return "Comparable lineup/rotation path";
  if (/roster|portal|depth|role/.test(type)) return "Comparable roster/role path";
  if (/market|line|movement|sharp/.test(type) || input.marketReaction) return "Comparable market-reaction path";
  return "Comparable prior sports-movement path";
}

function chainReaction(input: AgentCalibrationInput) {
  if (input.marketReaction) return "Market reaction can pull fantasy projections and team/fan expectations with it.";
  const type = (input.storyType ?? "").toLowerCase();
  if (/injury|availability|lineup|rotation/.test(type)) return "Availability context can move betting, fantasy, and matchup expectations next.";
  if (/roster|portal|depth|role/.test(type)) return "Role context can move depth charts, projections, and fan/team expectations next.";
  return "Source updates can move market reaction, fantasy context, and public story pressure next.";
}
