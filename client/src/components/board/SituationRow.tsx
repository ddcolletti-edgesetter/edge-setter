import type { HTMLAttributes, ReactNode } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, Link2, Radio, ShieldAlert, TrendingUp } from "lucide-react";

import { AgentCalibrationBadge } from "@/components/AgentCalibration";
import { Badge } from "@/components/ui/badge";
import { PlayerAvatar, TeamLogoImg, isUnknownTeamAbbr, toTeamAbbr } from "@/components/v2/SportVisuals";
import type { MarketMove } from "@/lib/marketMove";
import { isGenericUncertaintyLine, publicLifecycleLabel, publicStoryText, sourceCountText } from "@/lib/storyLanguage";
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
  | "verified"
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
  /**
   * Display names for {@link awayTeam} / {@link homeTeam} — the name the games
   * row stored, else the CFB token lookup. Undefined when neither has anything
   * to add, and every reader falls back to the token.
   *
   * Carried BESIDE the tokens, never instead of them: the tokens are the
   * TeamLogoImg and sports-image lookup keys, and "Memphis Tigers" resolves no
   * logo. See lib/teamDisplayNames.
   */
  awayTeamName?: string;
  homeTeamName?: string;
  player?: string;
  /** ESPN athlete id for {@link player}, when the situation resolved one via the
   *  roster gazetteer. Drives the story-card headshot; absent otherwise. */
  playerEspnId?: string;
  /** Jersey number for {@link player}, parallel to {@link playerEspnId}. Drives the
   *  jersey-number story-card treatment; absent otherwise. */
  playerJersey?: string;
  /**
   * True only when the pipeline supplied BOTH `awayTeam` and `homeTeam`, so
   * which side is at home is a fact rather than an artefact of the
   * `?? situation.team` fallbacks above. Guards the "vs"/"at" preposition on
   * the story card; without it a team-only situation reads as the away side
   * every time.
   */
  sideKnown?: boolean;
  sport?: "nba" | "mlb" | "nfl" | "cfb";
}

export interface SituationRowData {
  id: string;
  /**
   * Which lineage built this row: a live signal, a games-table row, or a
   * canonical situation. Carried so surfaces can tell a MATCHUP from a STORY
   * without re-deriving it from the shape of the other fields — the artwork
   * caption is dropped on a game row because it would only repeat the
   * headline, and `player` being absent is not the same fact.
   */
  kind?: "signal" | "game" | "canonical";
  title: string;
  /**
   * `title` with each side under the name the feed gave it, for display. Set
   * only on game-derived rows that have a better name than their tokens.
   * `title` stays in tokens because headline copy parses it — see
   * BoardSituation.titleLabel.
   */
  titleLabel?: string;
  subtitle?: string;
  league?: string;
  matchup?: string;
  /**
   * `matchup` with CFB mascot tokens resolved to school names, for display.
   * `matchup` itself stays in tokens because headline copy parses it.
   */
  matchupLabel?: string;
  market?: string;
  timestamp?: string;
  sourceCount?: number;
  urgency?: BoardUrgency;
  urgencyScore?: number;
  lane?: SituationLaneType;
  escalationState?: SituationEscalationState;
  statusLabel?: string;
  /**
   * Canonical, evidence-grounded verification word ("Verified" / "Escalating" /
   * "Developing") from the shared engine. Same source of truth the detail drawer
   * uses, so the card and drawer never disagree. Undefined when the situation
   * carries no signal to derive from (falls back to the legacy status label).
   */
  verificationState?: string;
  /** Plain-language basis for {@link verificationState}. */
  verificationBasis?: string;
  metrics?: SituationMetric[];
  tags?: string[];
  /**
   * Official availability status for {@link sportsIdentity}'s player, straight
   * from `live_signals.injury_designation` ("OUT" / "Doubtful" / "Questionable"
   * / "IL-60" / the practice-report codes DNP, LP, FP).
   *
   * It already travelled this far as `tags[2]`, where `tags.slice(0, 2)` below
   * dropped it whenever a trust or confidence label was present — which is
   * nearly always. A real field means the story card can render it without
   * depending on the tag array's length or order.
   */
  injuryDesignation?: string;
  /** live_signals.injury_designation_source, carried so the story-card gate can read it. */
  injuryDesignationSource?: string;
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
  /**
   * The resolved market move behind {@link marketReaction} — which market it
   * happened in, whether it is still a move from the opener, and the sentence
   * to print. Undefined on every row that is not a line move. See
   * lib/marketMove.
   */
  marketMove?: MarketMove;
  /**
   * Whether an official source — an injury report, a depth chart, a transaction
   * wire — is attached to this row's signal.
   *
   * Carried as a field because it is half of the test for whether a "Verified"
   * / "Confirmed" claim was earned (the other half is {@link sourceCount}), and
   * the surfaces that make that claim read the row, not the signal. See
   * verifiedClaimIsBacked.
   */
  officialSource?: boolean;
  replayChain?: string[];
  body?: string;
  detail?: string;
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
  // Whether this row's "Confirmed" was earned. The pipeline sets a confirmed
  // verdict off a single designation, so the two chips below ask before
  // printing the word. See verifiedClaimIsBacked.
  const verifiedClaimContext = { sourceCount: situation.sourceCount, officialSource: situation.officialSource };
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
  // Each chip says its text once. The status and lifecycle badges were both
  // "Developing" on most rows, and the two tags were "medium medium".
  const statusText = copyVariant === "editorial" ? publicLifecycleLabel(situation.statusLabel ?? escalation, verifiedClaimContext) : situation.statusLabel ?? escalation;
  const lifecycleText = situation.lifecycleLabel
    ? copyVariant === "editorial" ? publicLifecycleLabel(situation.lifecycleLabel, verifiedClaimContext) : situation.lifecycleLabel
    : undefined;
  const marketText = situation.market ? (copyVariant === "editorial" ? publicStoryText(situation.market) : situation.market) : undefined;
  const tagTexts = Array.from(new Set(
    (situation.tags ?? [])
      .slice(0, 2)
      .map((tag) => (copyVariant === "editorial" ? publicStoryText(tag) : tag))
      .filter((tag): tag is string => Boolean(tag) && ![statusText, lifecycleText, marketText].some((chip) => sameChip(tag, chip))),
  ));

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
          {situation.matchup && <span className="min-w-0 max-w-full truncate text-[0.72rem] font-semibold text-muted-foreground">{situation.matchupLabel ?? situation.matchup}</span>}
          {situation.timestamp && (
            <span className="ml-auto hidden items-center gap-1 text-[0.68rem] font-medium text-muted-foreground tabular-nums sm:inline-flex">
              <Clock3 className="h-3 w-3" />
              {situation.timestamp}
            </span>
          )}
        </span>

        <span className="mt-0.5 flex min-w-0 items-center gap-2">
          <strong className="min-w-0 truncate text-sm font-bold leading-tight text-foreground [overflow-wrap:anywhere]">{situation.titleLabel ?? situation.title}</strong>
          {/* No "Priority 100" on the editorial row: it is the ranker's internal
              score, it pins at 100 for most of what reaches the strip, and the
              row's position already says how it ranks. */}
          {situation.urgencyScore != null && copyVariant !== "editorial" && (
            <span className="shrink-0 font-mono text-[0.72rem] font-bold tabular-nums text-primary">{situation.urgencyScore}</span>
          )}
        </span>

        {!compact && hasSportsAnchor && <SportsIdentityLine identity={situation.sportsIdentity} />}

        {!compact && situation.subtitle && <span className="mt-1 block truncate text-[0.76rem] font-medium text-muted-foreground">{situation.subtitle}</span>}

        <span className="mt-2 flex min-w-0 max-w-full flex-wrap items-center gap-1.5 overflow-hidden">
          <Badge variant="outline" className={cn("h-5 max-w-full truncate px-1.5 text-[0.62rem] uppercase tracking-widest", escalationStyle[escalation])}>
            {statusText}
          </Badge>
          {lifecycleText && !sameChip(lifecycleText, statusText) && (
            <Badge variant="outline" className={cn("hidden h-5 max-w-full truncate px-1.5 text-[0.62rem] uppercase tracking-widest sm:inline-flex", lifecycleStyle[lifecycle])}>
              {lifecycleText}
            </Badge>
          )}
          {marketText && (
            <Badge variant="outline" className="hidden h-5 max-w-[9rem] truncate border-border bg-muted/20 px-1.5 text-[0.62rem] uppercase tracking-widest text-muted-foreground sm:inline-flex">
              {marketText}
            </Badge>
          )}
          {situation.sourceCount != null && (
            <span className="text-[0.7rem] font-semibold text-muted-foreground tabular-nums">{copyVariant === "editorial" ? sourceCountText(situation.sourceCount) : `${situation.sourceCount} reports`}</span>
          )}
          {typeof confidenceDelta === "number" && confidenceDelta !== 0 && (
            <span className={cn("max-w-full truncate text-[0.7rem] font-bold", confidenceDelta > 0 ? "text-[var(--es-green)]" : "text-[var(--es-amber)]")}>
              {confidenceDelta > 0 ? "Support building" : "Support easing"}
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
          {tagTexts.map((tag) => (
            <span key={tag} className="hidden text-[0.68rem] font-medium text-muted-foreground sm:inline">
              {tag}
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
            {/* Same suppression as the story card's "Watch next" tile: the three
                engine-state sentences are not something to watch. See
                isGenericUncertaintyLine. */}
            {!compact && situation.uncertaintyLabel && !isGenericUncertaintyLine(situation.uncertaintyLabel) && <IntelLine label="Watch next" value={storyText(situation.uncertaintyLabel, copyVariant)} />}
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
  // Separate from the tokens above, which stay exactly as they were: they are
  // what `hasIdentityAnchor` gated on and what SportsIdentityMark resolves its
  // logos from. A stored name only applies to the side it was stored for, so
  // it is not carried across the `?? identity.team` fallback.
  const awayLabel = (away && identity?.awayTeam ? identity.awayTeamName : undefined) ?? away;
  const homeLabel = (home && identity?.homeTeam ? identity.homeTeamName : undefined) ?? home;
  return (
    <span className="situation-sports-anchor">
      <SportsIdentityMark identity={identity} />
      <span className="min-w-0">
        <span className="data-label block text-[0.55rem] leading-none">Sports context</span>
        <span className="block truncate text-[0.72rem] font-bold text-foreground">
          {player ? `${player}${team ? ` / ${team}` : ""}` : away && home ? `${awayLabel} @ ${homeLabel}` : team}
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
            ? (confidenceDelta > 0 ? "Support building" : "Support easing")
            : storyText(evidenceGrowthLabel, copyVariant)}
        </span>
      ) : null}
    </span>
  );
}

function LifecycleMeter({ state }: { state: SituationLifecycleVisualState }) {
  const steps: SituationLifecycleVisualState[] = ["emerging", "developing", "confirming", "market-reacting", "verified", "cooling", "resolved", "archived"];
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

function sameChip(left?: string | null, right?: string | null) {
  const norm = (value?: string | null) => String(value ?? "").trim().toLowerCase();
  return Boolean(norm(left)) && norm(left) === norm(right);
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
