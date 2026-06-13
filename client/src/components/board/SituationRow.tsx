import type { HTMLAttributes, ReactNode } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, Link2, Radio, ShieldAlert, TrendingUp } from "lucide-react";

import { AgentCalibrationBadge } from "@/components/AgentCalibration";
import { Badge } from "@/components/ui/badge";
import { PlayerAvatar, TeamLogoImg, isUnknownTeamAbbr, toTeamAbbr } from "@/components/v2/SportVisuals";
import { publicLifecycleLabel, publicStoryText, sourceCountText } from "@/lib/storyLanguage";
import { cn } from "@/lib/utils";
import type { BoardUrgency } from "./LiveGamePill";

export type SituationLaneType = "escalating" | "live" | "decision" | "confirmed" | "background";
export type SituationEscalationState = "monitoring" | "developing" | "escalated" | "verified" | "official";
export type SituationLifecycleState = "detected" | "developing" | "escalating" | "verified" | "market" | "consensus" | "stale";
export type SituationLifecycleVisualState =
  | "emerging"
  | "developing"
  | "confirming"
  | "market-reacting"
  | "consensus-forming"
  | "cooling"
  | "resolved"
  | "archived";

export interface SituationMetric {
  label: string;
  value: string | number;
  tone?: "default" | "positive" | "warning" | "danger";
}

export interface SituationEvidenceStep {
  label: string;
  value: string;
  state?: "complete" | "active" | "caution" | "quiet";
}

export interface SituationSportsIdentity {
  awayTeam?: string;
  homeTeam?: string;
  team?: string;
  opponent?: string;
  player?: string;
  sport?: "nba" | "mlb" | "nfl" | "cfb";
}

export interface SituationRowData {
  id: string;
  title: string;
  subtitle?: string;
  league?: string;
  matchup?: string;
  market?: string;
  timestamp?: string;
  sourceCount?: number;
  urgency?: BoardUrgency;
  urgencyScore?: number;
  lane?: SituationLaneType;
  escalationState?: SituationEscalationState;
  statusLabel?: string;
  metrics?: SituationMetric[];
  tags?: string[];
  actionLabel?: string;
  lifecycleLabel?: string;
  lifecycleState?: SituationLifecycleState;
  lifecycleVisualState?: SituationLifecycleVisualState;
  confidenceDelta?: number | null;
  confidenceMovementLabel?: string;
  evidenceCount?: number;
  evidenceGrowthLabel?: string;
  sourceProgressLabel?: string;
  sourceConvergenceStage?: string;
  sourceReliabilityLabel?: string;
  uncertaintyLabel?: string;
  timingStageLabel?: string;
  evidenceChain?: SituationEvidenceStep[];
  sportsIdentity?: SituationSportsIdentity;
  confidenceNote?: string;
  confidenceJourney?: string;
  sourceSummary?: string;
  timingAdvantage?: string;
  detectionLeadTime?: string;
  detectionLeadKind?: "confirmation" | "pickup";
  marketReaction?: string;
  replayChain?: string[];
}

interface SituationRowProps extends Omit<HTMLAttributes<HTMLButtonElement>, "onSelect"> {
  situation: SituationRowData;
  selected?: boolean;
  compact?: boolean;
  copyVariant?: "legacy" | "editorial";
  rightSlot?: ReactNode;
  onSelect?: (situation: SituationRowData) => void;
}

const escalationStyle: Record<SituationEscalationState, string> = {
  monitoring: "es-state-monitoring border-border bg-muted/20 text-muted-foreground",
  developing: "es-state-developing border-[rgba(230,180,80,0.36)] bg-[rgba(230,180,80,0.09)] text-[var(--es-amber)]",
  escalated: "es-state-escalated border-destructive/45 bg-destructive/10 text-destructive",
  verified: "es-state-verified border-[rgba(24,212,123,0.34)] bg-[rgba(24,212,123,0.1)] text-[var(--es-green)]",
  official: "es-state-official border-primary/40 bg-primary/10 text-primary",
};

const laneIcon: Record<SituationLaneType, ReactNode> = {
  escalating: <ShieldAlert className="h-4 w-4 text-destructive" />,
  live: <Radio className="h-4 w-4 text-[var(--es-green)]" />,
  decision: <AlertTriangle className="h-4 w-4 text-[var(--es-amber)]" />,
  confirmed: <CheckCircle2 className="h-4 w-4 text-[var(--es-green)]" />,
  background: <Clock3 className="h-4 w-4 text-muted-foreground" />,
};

const lifecycleStyle: Record<SituationLifecycleState, string> = {
  detected: "border-[rgba(111,164,191,0.34)] bg-[rgba(111,164,191,0.09)] text-[var(--es-blue)]",
  developing: "border-[rgba(230,180,80,0.36)] bg-[rgba(230,180,80,0.09)] text-[var(--es-amber)]",
  escalating: "border-destructive/45 bg-destructive/10 text-destructive",
  verified: "border-[rgba(24,212,123,0.34)] bg-[rgba(24,212,123,0.1)] text-[var(--es-green)]",
  market: "border-primary/40 bg-primary/10 text-primary",
  consensus: "border-[rgba(24,212,123,0.34)] bg-[rgba(24,212,123,0.1)] text-[var(--es-green)]",
  stale: "border-border bg-muted/20 text-muted-foreground",
};

export function SituationRow({ situation, selected, compact, copyVariant = "legacy", rightSlot, onSelect, className, ...props }: SituationRowProps) {
  const escalation = situation.escalationState ?? "monitoring";
  const lane = situation.lane ?? "background";
  const metrics = situation.metrics?.slice(0, compact ? 1 : 2) ?? [];
  const lifecycle = situation.lifecycleState ?? "developing";
  const visualState = situation.lifecycleVisualState ?? "developing";
  const replayChain = situation.replayChain?.slice(0, compact ? 3 : 4) ?? [];
  const confidenceDelta = situation.confidenceDelta;
  const timingStateClass = timingMotionClass(situation.timingStageLabel);
  const hasSportsAnchor = hasIdentityAnchor(situation.sportsIdentity);
  const confidenceMetric = metrics.find((metric) => metric.label.toLowerCase().includes("confidence"));
  const confidence = parseMetricPercent(confidenceMetric?.value);

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect?.(situation)}
      className={cn(
        "ux-row-interactive grid w-full max-w-full grid-cols-[auto_minmax(0,1fr)] gap-2 overflow-hidden border-b border-border/60 px-3 text-left last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-3",
        "situation-row",
        `situation-row-${lane}`,
        `situation-row-lifecycle-${lifecycle}`,
        `situation-row-visual-${visualState}`,
        timingStateClass,
        typeof confidenceDelta === "number" && confidenceDelta > 0 && "situation-confidence-rising",
        typeof confidenceDelta === "number" && confidenceDelta < 0 && "situation-confidence-cooling",
        compact ? "py-2" : "py-3",
        selected && "bg-muted/40 shadow-[inset_2px_0_0_hsl(var(--primary))]",
        className,
      )}
      {...props}
    >
      <span className={cn("mt-0.5 flex h-7 w-7 items-center justify-center rounded border border-border bg-muted/20", hasSportsAnchor && "situation-row-sport-icon")}>
        {hasSportsAnchor ? <SportsIdentityMark identity={situation.sportsIdentity} compact /> : laneIcon[lane]}
      </span>

      <span className="min-w-0 overflow-hidden">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          {situation.league && <span className="data-label text-[0.64rem] text-primary">{situation.league}</span>}
          {situation.matchup && <span className="min-w-0 max-w-full truncate text-[0.72rem] font-semibold text-muted-foreground">{situation.matchup}</span>}
          {situation.timestamp && (
            <span className="ml-auto hidden items-center gap-1 text-[0.68rem] font-medium text-muted-foreground tabular-nums sm:inline-flex">
              <Clock3 className="h-3 w-3" />
              {situation.timestamp}
            </span>
          )}
        </span>

        <span className="mt-0.5 flex min-w-0 items-center gap-2">
          <strong className="min-w-0 truncate text-sm font-bold leading-tight text-foreground [overflow-wrap:anywhere]">{situation.title}</strong>
          {situation.urgencyScore != null && (
            copyVariant === "editorial" ? (
              <span className="shrink-0 rounded border border-border bg-muted/20 px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-widest text-muted-foreground tabular-nums">
                Priority {situation.urgencyScore}
              </span>
            ) : (
              <span className="shrink-0 font-mono text-[0.72rem] font-bold tabular-nums text-primary">{situation.urgencyScore}</span>
            )
          )}
        </span>

        {!compact && hasSportsAnchor && <SportsIdentityLine identity={situation.sportsIdentity} />}

        {!compact && situation.subtitle && <span className="mt-1 block truncate text-[0.76rem] font-medium text-muted-foreground">{situation.subtitle}</span>}

        <span className="mt-2 flex min-w-0 max-w-full flex-wrap items-center gap-1.5 overflow-hidden">
          <Badge variant="outline" className={cn("h-5 max-w-full truncate px-1.5 text-[0.62rem] uppercase tracking-widest", escalationStyle[escalation])}>
            {copyVariant === "editorial" ? publicLifecycleLabel(situation.statusLabel ?? escalation) : situation.statusLabel ?? escalation}
          </Badge>
          {situation.lifecycleLabel && (
            <Badge variant="outline" className={cn("hidden h-5 max-w-full truncate px-1.5 text-[0.62rem] uppercase tracking-widest sm:inline-flex", lifecycleStyle[lifecycle])}>
              {copyVariant === "editorial" ? publicLifecycleLabel(situation.lifecycleLabel) : situation.lifecycleLabel}
            </Badge>
          )}
          {situation.market && (
            <Badge variant="outline" className="hidden h-5 max-w-[9rem] truncate border-border bg-muted/20 px-1.5 text-[0.62rem] uppercase tracking-widest text-muted-foreground sm:inline-flex">
              {copyVariant === "editorial" ? publicStoryText(situation.market) : situation.market}
            </Badge>
          )}
          {situation.sourceCount != null && (
            <span className="text-[0.7rem] font-semibold text-muted-foreground tabular-nums">{copyVariant === "editorial" ? sourceCountText(situation.sourceCount) : `${situation.sourceCount} reports`}</span>
          )}
          {typeof confidenceDelta === "number" && confidenceDelta !== 0 && (
            <span className={cn("max-w-full truncate text-[0.7rem] font-bold tabular-nums", confidenceDelta > 0 ? "text-[var(--es-green)]" : "text-[var(--es-amber)]")}>
              Confidence {confidenceDelta > 0 ? "+" : ""}{Math.round(confidenceDelta)}
            </span>
          )}
          {situation.evidenceCount != null && (
            <span className="max-w-full truncate text-[0.7rem] font-semibold text-muted-foreground tabular-nums">
              Evidence: {situation.evidenceCount}
            </span>
          )}
          {metrics.map((metric) => (
            <span key={`${metric.label}-${metric.value}`} className={cn("max-w-full truncate text-[0.7rem] font-bold tabular-nums", metricTone(metric.tone))}>
              {copyVariant === "editorial"
                ? `${metric.label.toLowerCase().includes("confidence") ? "Evidence strength" : metric.label} ${publicStoryText(metric.value)}`
                : `${metric.label}: ${metric.value}`}
            </span>
          ))}
          {situation.tags?.slice(0, 2).map((tag) => (
            <span key={tag} className="hidden text-[0.68rem] font-medium text-muted-foreground sm:inline">
              {copyVariant === "editorial" ? publicStoryText(tag) : tag}
            </span>
          ))}
          {!compact && (
            <AgentCalibrationBadge
              input={{
                confidence,
                sourceCount: situation.sourceCount,
                timingLabel: situation.timingStageLabel ?? situation.timingAdvantage,
                storyType: situation.market ?? situation.lifecycleLabel,
                marketReaction: situation.marketReaction,
                sourceSummary: situation.sourceSummary,
              }}
              compact
              className="hidden sm:inline-flex"
            />
          )}
        </span>

        {(situation.confidenceNote || situation.sourceSummary || situation.timingAdvantage || situation.marketReaction) && (
          <span className="mt-1.5 grid min-w-0 gap-1 text-[0.68rem] font-semibold leading-snug text-muted-foreground sm:grid-cols-2">
            {situation.confidenceNote && <IntelLine label="Evidence strength" value={storyText(situation.confidenceNote, copyVariant)} />}
            {(situation.sourceProgressLabel || situation.sourceSummary) && <IntelLine icon={<Link2 className="h-3 w-3" />} label="Source support" value={storyText(situation.sourceProgressLabel ?? situation.sourceSummary ?? "", copyVariant)} />}
            {situation.timingAdvantage && <IntelLine label="Watch next" value={storyText(situation.timingAdvantage, copyVariant)} />}
            {!compact && situation.marketReaction && <IntelLine icon={<TrendingUp className="h-3 w-3" />} label="Market note" value={storyText(situation.marketReaction, copyVariant)} />}
            {!compact && situation.uncertaintyLabel && <IntelLine label="Watch next" value={storyText(situation.uncertaintyLabel, copyVariant)} />}
          </span>
        )}

        {!compact && situation.evidenceChain?.length ? (
          <EvidenceChain
            steps={situation.evidenceChain}
            confidenceDelta={confidenceDelta}
            evidenceGrowthLabel={situation.evidenceGrowthLabel}
            copyVariant={copyVariant}
          />
        ) : null}

        {!compact && <LifecycleMeter state={visualState} />}

        {!compact && replayChain.length > 1 && (
          <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[0.62rem] font-bold uppercase tracking-widest text-muted-foreground">
            {replayChain.map((step, index) => (
              <span key={`${situation.id}-${step}`} className="inline-flex min-w-0 items-center gap-1">
                {index > 0 && <span className="h-px w-3 bg-border" />}
                <span className="max-w-[8rem] truncate">{step}</span>
              </span>
            ))}
          </span>
        )}
      </span>

      <span className="col-span-2 flex min-w-0 items-center justify-end gap-2 sm:col-span-1 sm:justify-start">
        {rightSlot}
        {situation.actionLabel && (
          <span className="inline-flex items-center gap-1 text-[0.68rem] font-bold uppercase tracking-widest text-primary">
            {situation.actionLabel}
            <ArrowUpRight className="h-3 w-3" />
          </span>
        )}
      </span>
    </button>
  );
}

export function SportsIdentityLine({ identity }: { identity?: SituationSportsIdentity }) {
  if (!hasIdentityAnchor(identity)) return null;
  const away = cleanTeamAbbr(identity?.awayTeam ?? identity?.team);
  const home = cleanTeamAbbr(identity?.homeTeam ?? identity?.opponent);
  const team = cleanTeamAbbr(identity?.team ?? identity?.awayTeam);
  const player = identity?.player && !isUnknownTeamAbbr(identity.player) ? identity.player : undefined;
  return (
    <span className="situation-sports-anchor">
      <SportsIdentityMark identity={identity} />
      <span className="min-w-0">
        <span className="data-label block text-[0.55rem] leading-none">Sports context</span>
        <span className="block truncate text-[0.72rem] font-bold text-foreground">
          {player ? `${player}${team ? ` / ${team}` : ""}` : away && home ? `${away} @ ${home}` : team}
        </span>
      </span>
    </span>
  );
}

export function SportsIdentityMark({ identity, compact }: { identity?: SituationSportsIdentity; compact?: boolean }) {
  const away = cleanTeamAbbr(identity?.awayTeam ?? identity?.team);
  const home = cleanTeamAbbr(identity?.homeTeam ?? identity?.opponent);
  const team = cleanTeamAbbr(identity?.team ?? identity?.awayTeam);
  const player = identity?.player && !isUnknownTeamAbbr(identity.player) ? identity.player : undefined;
  const sport = identity?.sport;
  const size = compact ? 18 : 24;
  if (player && team && !compact) {
    return <PlayerAvatar name={player} team={team} size={26} position={sport === "mlb" ? "hitter" : "generic"} />;
  }
  if (away && home && away !== home) {
    return (
      <span className="situation-team-pair" aria-hidden="true">
        <TeamLogoImg abbr={away} size={size} sport={sport} />
        <TeamLogoImg abbr={home} size={size} sport={sport} />
      </span>
    );
  }
  if (team) return <TeamLogoImg abbr={team} size={size} sport={sport} />;
  return null;
}

export function EvidenceChain({
  steps,
  confidenceDelta,
  evidenceGrowthLabel,
  compact,
  copyVariant = "legacy",
}: {
  steps: SituationEvidenceStep[];
  confidenceDelta?: number | null;
  evidenceGrowthLabel?: string;
  compact?: boolean;
  copyVariant?: "legacy" | "editorial";
}) {
  return (
    <span
      className={cn(
        "situation-evidence-chain",
        compact && "situation-evidence-chain-compact",
        typeof confidenceDelta === "number" && confidenceDelta > 0 && "is-confidence-rising",
        typeof confidenceDelta === "number" && confidenceDelta < 0 && "is-confidence-cooling",
      )}
    >
      {steps.slice(0, compact ? 4 : 5).map((step, index) => (
        <span key={`${step.label}-${step.value}`} className={cn("situation-evidence-step", `is-${step.state ?? "quiet"}`)}>
          <span className="situation-evidence-dot" />
          <span className="min-w-0">
            <span className="data-label block text-[0.55rem] leading-none">{step.label}</span>
            <span className="block truncate text-[0.66rem] font-bold leading-tight text-foreground">{storyText(step.value, copyVariant)}</span>
          </span>
          {index < Math.min(steps.length, compact ? 4 : 5) - 1 && <span className="situation-evidence-link" />}
        </span>
      ))}
      {((typeof confidenceDelta === "number" && confidenceDelta !== 0) || evidenceGrowthLabel) && !(compact && evidenceGrowthLabel && !(typeof confidenceDelta === "number" && confidenceDelta !== 0)) ? (
        <span className={cn("situation-confidence-move", typeof confidenceDelta === "number" && confidenceDelta < 0 && "is-down")}>
          {typeof confidenceDelta === "number" && confidenceDelta !== 0
            ? `${confidenceDelta > 0 ? "+" : ""}${Math.round(confidenceDelta)} agent confidence`
            : storyText(evidenceGrowthLabel, copyVariant)}
        </span>
      ) : null}
    </span>
  );
}

function LifecycleMeter({ state }: { state: SituationLifecycleVisualState }) {
  const steps: SituationLifecycleVisualState[] = ["emerging", "developing", "confirming", "market-reacting", "consensus-forming", "cooling", "resolved", "archived"];
  const activeIndex = Math.max(0, steps.indexOf(state));
  return (
    <span className="situation-lifecycle-meter" aria-label={`Lifecycle: ${state.replace(/-/g, " ")}`}>
      {steps.slice(0, 6).map((step, index) => (
        <span
          key={step}
          className={cn(
            "situation-lifecycle-meter-step",
            index <= Math.min(activeIndex, 5) && "is-active",
            step === "cooling" && activeIndex >= index && "is-cooling",
          )}
        />
      ))}
    </span>
  );
}

function IntelLine({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1 overflow-hidden">
      {icon}
      <span className="data-label shrink-0 text-[0.58rem]">{label}</span>
      <span className="min-w-0 truncate">{value}</span>
    </span>
  );
}

function metricTone(tone: SituationMetric["tone"]) {
  if (tone === "positive") return "text-[var(--es-green)]";
  if (tone === "warning") return "text-[var(--es-amber)]";
  if (tone === "danger") return "text-destructive";
  return "text-muted-foreground";
}

function parseMetricPercent(value?: string | number) {
  if (typeof value === "number") return value;
  if (!value) return null;
  const parsed = Number.parseFloat(String(value).replace("%", ""));
  return Number.isNaN(parsed) ? null : parsed;
}

function cleanTeamAbbr(value?: string) {
  const abbr = toTeamAbbr(value ?? "");
  return isUnknownTeamAbbr(abbr) ? "" : abbr;
}

function storyText(value: string | number | null | undefined, copyVariant: "legacy" | "editorial") {
  return copyVariant === "editorial" ? publicStoryText(value) : String(value ?? "");
}

function timingMotionClass(label?: string) {
  if (label === "early signal" || label === "early development" || label === "developing edge" || label === "developing window") return "situation-timing-early";
  if (label === "context moving" || label === "partially priced") return "situation-timing-market";
  if (label === "public confirmation" || label === "official confirmation" || label === "widely known" || label === "consensus forming") return "situation-timing-public";
  if (label === "fully priced" || label === "stale signal" || label === "cooling story" || label === "no remaining edge" || label === "monitoring only") return "situation-timing-receding";
  return undefined;
}

function hasIdentityAnchor(identity?: SituationSportsIdentity) {
  return Boolean(
    (identity?.player && !isUnknownTeamAbbr(identity.player))
      || cleanTeamAbbr(identity?.team)
      || cleanTeamAbbr(identity?.awayTeam)
      || cleanTeamAbbr(identity?.homeTeam),
  );
}
