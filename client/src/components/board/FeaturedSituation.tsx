import type { ReactNode } from "react";
import { ArrowUpRight, Clock3 } from "lucide-react";

import { AgentCalibrationBadge, ChainReactionPreview, HistoricalPatternMatch } from "@/components/AgentCalibration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EvidenceChain, SportsIdentityLine, SportsIdentityMark, type SituationMetric, type SituationRowData } from "./SituationRow";
import { SportsStoryVisual } from "@/components/SportsMedia";

interface FeaturedSituationAction {
  label: string;
  onClick?: () => void;
  icon?: ReactNode;
  variant?: "default" | "outline" | "ghost";
}

interface FeaturedSituationProps {
  situation?: SituationRowData;
  eyebrow?: string;
  title?: string;
  summary?: string;
  primaryRead?: string;
  secondaryRead?: string;
  metrics?: SituationMetric[];
  actions?: FeaturedSituationAction[];
  children?: ReactNode;
  className?: string;
  density?: "default" | "compact";
  mobileDensity?: "default" | "compact";
}

export function FeaturedSituation({
  situation,
  eyebrow = "Top Developing Story",
  title,
  summary,
  primaryRead,
  secondaryRead,
  metrics,
  actions,
  children,
  className,
  density = "default",
  mobileDensity = "default",
}: FeaturedSituationProps) {
  const displayTitle = title ?? situation?.title ?? "No developing story";
  const displaySummary = summary ?? situation?.subtitle;
  const displayMetrics = metrics ?? situation?.metrics ?? [];
  const escalation = situation?.escalationState ?? "monitoring";
  const visualState = situation?.lifecycleVisualState ?? "developing";
  const isCooling = visualState === "cooling" || visualState === "resolved" || visualState === "archived";
  const isCompact = density === "compact";
  const isMobileCompact = isCompact || mobileDensity === "compact";
  const confidenceDelta = situation?.confidenceDelta;
  const confidenceMetric = displayMetrics.find((metric) => metric.label.toLowerCase().includes("confidence") || metric.label.toLowerCase() === "conf");
  const isLive = situation?.lane === "live";
  const isEscalated = escalation === "escalated";

  return (
    <section
      className={cn(
        "board-featured-situation max-w-full overflow-hidden rounded-md border bg-card/90 shadow-[inset_0_1px_0_rgba(248,250,252,0.035),0_18px_48px_rgba(0,0,0,0.2)]",
        `board-featured-situation-visual-${visualState}`,
        timingMotionClass(situation?.timingStageLabel),
        typeof confidenceDelta === "number" && confidenceDelta > 0 && "board-featured-confidence-rising",
        typeof confidenceDelta === "number" && confidenceDelta < 0 && "board-featured-confidence-cooling",
        isCompact ? "p-2 sm:p-3" : isMobileCompact ? "p-2.5 sm:p-4" : "p-2.5 sm:p-4",
        isEscalated ? "border-destructive/40" : "border-border",
        isCooling && "board-featured-situation-cooling",
        className,
      )}
    >
      <div className={cn("grid min-w-0 items-stretch", isMobileCompact ? "gap-2 lg:grid-cols-[minmax(0,1fr)_250px]" : "gap-2 sm:gap-2.5 lg:grid-cols-[minmax(0,1fr)_292px]")}>
        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
          <div className={cn("section-kicker", isMobileCompact ? "mb-1 sm:mb-2" : "mb-2")}>
            <span>{eyebrow}</span>
          </div>
          <div className={cn("flex min-w-0 flex-wrap items-center", isMobileCompact ? "gap-1.5 sm:gap-2" : "gap-2")}>
            {hasSportsIdentity(situation?.sportsIdentity) && (
              <span className="board-featured-sport-mark">
                <SportsIdentityMark identity={situation?.sportsIdentity} />
              </span>
            )}
            {situation?.league && <Badge variant="outline" className="border-primary/35 bg-primary/10 text-primary">{situation.league}</Badge>}
            {situation?.market && <Badge variant="outline" className="hidden max-w-full truncate border-border bg-muted/20 text-muted-foreground lg:inline-flex">{supportLabel(situation.market)}</Badge>}
            {isLive && (
              <Badge variant="outline" className="gap-1 border-[rgba(24,212,123,0.34)] bg-[rgba(24,212,123,0.1)] text-[var(--es-green)]">
                <span className="es-live-dot es-live-pulse h-1.5 w-1.5" />
                Live
              </Badge>
            )}
          </div>
          <h2 className={cn("max-w-full overflow-hidden whitespace-normal break-words font-sans font-bold leading-snug text-foreground [display:-webkit-box] [overflow-wrap:anywhere] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]", isCompact ? "mt-1 text-base sm:mt-1.5 sm:text-lg" : isMobileCompact ? "mt-1 text-base sm:mt-2 sm:text-lg" : "mt-1.5 text-base sm:mt-2 sm:text-lg")}>{displayTitle}</h2>
          {displaySummary && (
            <p className={cn("max-w-3xl overflow-hidden break-words text-sm font-medium text-muted-foreground [display:-webkit-box] [overflow-wrap:anywhere] [-webkit-box-orient:vertical]", isCompact ? "mt-1 leading-snug [-webkit-line-clamp:1] sm:[-webkit-line-clamp:2]" : isMobileCompact ? "mt-1 leading-snug [-webkit-line-clamp:1] sm:mt-1.5 sm:[-webkit-line-clamp:2]" : "mt-1.5 leading-snug [-webkit-line-clamp:2]")}>
              {displaySummary}
            </p>
          )}
          {!isMobileCompact && <SportsIdentityLine identity={situation?.sportsIdentity} />}
        </div>

        <SportsIdentityPanel situation={situation} title={displayTitle} compact={isMobileCompact} />
      </div>

      {!isCompact && (primaryRead || secondaryRead) && (
        <div className="mt-2 hidden min-w-0 gap-1.5 sm:grid md:grid-cols-2">
          {primaryRead && <ReadBlock label="What changed">{primaryRead}</ReadBlock>}
          {secondaryRead && <ReadBlock label="Why it matters">{secondaryRead}</ReadBlock>}
        </div>
      )}

      <div className="mt-2 grid min-w-0 gap-1.5 sm:grid-cols-3">
        <PlainRead label="Agent confidence" value={plainConfidenceLabel(confidenceMetric, situation)} />
        <PlainRead label="Verification state" value={plainStatusLabel(situation?.statusLabel ?? escalation)} />
        <PlainRead label="Source agreement" value={plainSupportLabel(situation)} />
      </div>

      {situation && (
        <div className="mt-2 grid min-w-0 gap-1.5 sm:grid-cols-3">
          <AgentCalibrationBadge input={calibrationInput(situation, confidenceMetric)} />
          <HistoricalPatternMatch input={calibrationInput(situation, confidenceMetric)} compact />
          <ChainReactionPreview input={calibrationInput(situation, confidenceMetric)} compact />
        </div>
      )}

      {!isCompact && situation?.evidenceChain?.length ? (
        <div className="mt-2 hidden sm:block">
          <EvidenceChain
            steps={situation.evidenceChain}
            confidenceDelta={situation.confidenceDelta}
            evidenceGrowthLabel={situation.evidenceGrowthLabel}
            compact
          />
        </div>
      ) : null}

      {children && <div className={cn("border-t border-border/70", isCompact ? "mt-2 pt-2" : "mt-2 pt-2")}>{children}</div>}

      {(actions?.length || situation?.timestamp) && (
        <footer className={cn("flex min-w-0 flex-wrap items-center gap-2 border-t border-border/60", isCompact ? "mt-2 pt-2" : "mt-2 pt-2")}>
          {situation?.timestamp && (
            <span className="mr-auto inline-flex min-w-0 max-w-full items-center gap-1.5 truncate text-[0.74rem] font-semibold text-muted-foreground tabular-nums">
              <Clock3 className="h-3.5 w-3.5" />
              <span className="truncate">{situation.timestamp}</span>
            </span>
          )}
          {actions?.map((action) => (
            <Button key={action.label} type="button" size="sm" variant={action.variant ?? "outline"} onClick={action.onClick} className="w-full shrink-0 sm:w-auto">
              {action.icon ?? <ArrowUpRight className="h-4 w-4" />}
              {action.label}
            </Button>
          ))}
        </footer>
      )}
    </section>
  );
}

function SportsIdentityPanel({ situation, title, compact }: { situation?: SituationRowData; title: string; compact?: boolean }) {
  const identity = situation?.sportsIdentity;
  return (
    <SportsStoryVisual
      className="board-featured-identity-panel"
      league={situation?.league}
      sport={identity?.sport}
      primaryTeam={identity?.team ?? identity?.awayTeam}
      secondaryTeam={identity?.opponent ?? identity?.homeTeam}
      player={identity?.player}
      title={situation?.matchup ?? title}
      storyType={storyTypeLabel(situation)}
      detail={situation?.sourceProgressLabel ?? situation?.statusLabel}
      size={compact ? "compact" : "feature"}
    />
  );
}

function PlainRead({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-border bg-muted/10 px-2 py-1.5">
      <span className="data-label block text-[0.58rem]">{label}</span>
      <strong className="mt-0.5 block truncate text-[0.76rem] font-bold text-foreground">{value}</strong>
    </div>
  );
}

function plainConfidenceLabel(metric?: SituationMetric, situation?: SituationRowData) {
  const value = metric?.value ?? situation?.confidenceNote?.match(/\d+%/)?.[0] ?? "source/context support";
  const checks = situation?.evidenceCount ?? situation?.sourceCount;
  if (checks) return `${checks} report${checks === 1 ? "" : "s"} supporting`;
  if (value === "source/context support") return value;
  return `${value} confidence support`;
}

function calibrationInput(situation: SituationRowData, metric?: SituationMetric) {
  return {
    confidence: parseMetricPercent(metric?.value),
    sourceCount: situation.sourceCount,
    timingLabel: situation.timingStageLabel ?? situation.timingAdvantage,
    storyType: situation.market ?? situation.lifecycleLabel ?? situation.title,
    marketReaction: situation.marketReaction,
    sourceSummary: situation.sourceSummary ?? situation.sourceProgressLabel,
  };
}

function parseMetricPercent(value?: string | number) {
  if (typeof value === "number") return value;
  if (!value) return null;
  const parsed = Number.parseFloat(String(value).replace("%", ""));
  return Number.isNaN(parsed) ? null : parsed;
}

function plainStatusLabel(status?: string) {
  const value = (status ?? "monitoring").toLowerCase();
  if (value.includes("verified") || value.includes("official")) return "Confirmed by public report";
  if (value.includes("urgent")) return "Needs source review";
  if (value.includes("develop")) return "Developing before confirmation";
  return value.replace(/\s+/g, " ");
}

function plainSupportLabel(situation?: SituationRowData) {
  if (situation?.sourceProgressLabel) return situation.sourceProgressLabel;
  if (situation?.sourceCount) return `${situation.sourceCount} report${situation.sourceCount === 1 ? "" : "s"} attached`;
  return "Awaiting stronger report support";
}

function ReadBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-l border-border/80 bg-muted/5 py-1.5 pl-3 pr-2">
      <span className="data-label text-[0.66rem]">{label}</span>
      <p className="mt-0.5 overflow-hidden break-words text-[0.78rem] font-medium leading-snug text-foreground [display:-webkit-box] [overflow-wrap:anywhere] [-webkit-box-orient:vertical] [-webkit-line-clamp:1]">{children}</p>
    </div>
  );
}

function hasSportsIdentity(identity?: SituationRowData["sportsIdentity"]) {
  return Boolean(identity?.player || identity?.team || identity?.awayTeam || identity?.homeTeam);
}

function supportLabel(value: string) {
  if (/^Movement support:/i.test(value)) return "External movement detected";
  return value;
}

function storyTypeLabel(situation?: SituationRowData) {
  const text = `${situation?.title ?? ""} ${situation?.subtitle ?? ""} ${situation?.market ?? ""} ${situation?.tags?.join(" ") ?? ""}`.toLowerCase();
  if (text.includes("injury") || text.includes("dnp") || text.includes("questionable") || text.includes("rib")) return "Injury watch";
  if (text.includes("lineup") || text.includes("scratch")) return "Lineup watch";
  if (text.includes("pitcher") || text.includes("starter")) return "Pitcher watch";
  if (text.includes("depth") || text.includes("camp")) return "Depth watch";
  if (text.includes("roster") || text.includes("portal")) return "Roster watch";
  if (text.includes("source")) return "Report check";
  if (situation?.matchup) return "Matchup movement";
  return "Sports update";
}

function timingMotionClass(label?: string) {
  if (label === "early signal" || label === "early development" || label === "developing edge" || label === "developing window") return "board-featured-timing-early";
  if (label === "context moving" || label === "partially priced") return "board-featured-timing-market";
  if (label === "public confirmation" || label === "official confirmation" || label === "widely known" || label === "consensus forming") return "board-featured-timing-public";
  if (label === "fully priced" || label === "stale signal" || label === "cooling story" || label === "no remaining edge" || label === "monitoring only") return "board-featured-timing-receding";
  return undefined;
}
