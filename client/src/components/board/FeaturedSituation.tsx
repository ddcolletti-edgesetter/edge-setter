import type { ReactNode } from "react";
import { ArrowUpRight, Clock3 } from "lucide-react";

import { AgentCalibrationBadge } from "@/components/AgentCalibration";
import { StoryImpactBlocks } from "@/components/StoryImpactBlocks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EvidenceChain, SportsIdentityLine, SportsIdentityMark, type SituationMetric, type SituationRowData, type SituationSportsIdentity } from "./SituationRow";
import { SportsStoryVisual } from "@/components/SportsMedia";
import { resolveSportsImageAsset } from "@/lib/sportsImageAssets";
import { toSituationStoryCardData, type SituationStoryCardData } from "./boardAdapters";

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
  presentation?: "default" | "story";
  league?: string;
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
  presentation = "default",
  league,
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

  if (presentation === "story") {
    const story = situation
      ? toSituationStoryCardData(situation)
      : quietStoryCardData({
          eyebrow,
          title: displayTitle,
          summary: displaySummary,
          primaryRead,
          secondaryRead,
          metrics: displayMetrics,
          league,
        });

    return (
      <section className={cn("board-featured-situation-story", className)}>
        <EditorialLeadBlock story={{ ...story, sectionTitle: story.sectionTitle ?? eyebrow }} onOpen={actions?.[0]?.onClick} />
        {!isCompact && situation?.evidenceChain?.length ? (
          <div className="mt-2 rounded-md border border-border bg-card/75 p-2">
            <EvidenceChain
              steps={situation.evidenceChain}
              confidenceDelta={situation.confidenceDelta}
              evidenceGrowthLabel={situation.evidenceGrowthLabel}
              compact
            />
          </div>
        ) : null}
        {children && <div className="mt-2 border-t border-border/70 pt-2">{children}</div>}
      </section>
    );
  }

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
      <div className={cn("grid min-w-0 items-start", situation && (isMobileCompact ? "gap-2 lg:grid-cols-[minmax(0,1fr)_230px]" : "gap-2 sm:gap-2.5 lg:grid-cols-[minmax(0,1fr)_260px]"))}>
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
            <p className={cn("max-w-3xl overflow-hidden break-words text-sm font-medium text-muted-foreground [display:-webkit-box] [overflow-wrap:anywhere] [-webkit-box-orient:vertical]", isCompact ? "mt-1 leading-snug [-webkit-line-clamp:2]" : isMobileCompact ? "mt-1 leading-snug [-webkit-line-clamp:2] sm:mt-1.5" : "mt-1.5 leading-snug [-webkit-line-clamp:2]")}>
              {displaySummary}
            </p>
          )}
          {!isMobileCompact && <SportsIdentityLine identity={situation?.sportsIdentity} />}
        </div>

        {situation && <SportsIdentityPanel situation={situation} title={displayTitle} compact={isMobileCompact} />}
      </div>

      {!isCompact && (primaryRead || secondaryRead) && (
        <div className="mt-2 hidden min-w-0 gap-1.5 sm:grid md:grid-cols-2">
          {primaryRead && <ReadBlock label="What changed">{primaryRead}</ReadBlock>}
          {secondaryRead && <ReadBlock label="Why it matters">{secondaryRead}</ReadBlock>}
        </div>
      )}

      <div className="mt-2 grid min-w-0 gap-1.5 sm:grid-cols-3">
        <PlainRead label="Evidence strength" value={plainConfidenceLabel(confidenceMetric, situation)} />
        <PlainRead label="Verification state" value={plainStatusLabel(situation?.statusLabel ?? escalation)} />
        <PlainRead label="Source support" value={plainSupportLabel(situation)} />
      </div>

      {situation && (
        <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
          <AgentCalibrationBadge input={calibrationInput(situation, confidenceMetric)} />
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

function EditorialLeadBlock({ story, onOpen }: { story: SituationStoryCardData; onOpen?: () => void }) {
  const identity = story.row.sportsIdentity;
  const imageAsset = resolveSportsImageAsset({
    league: story.league,
    sport: identity?.sport,
    team: story.primaryTeam,
    opponent: story.secondaryTeam,
    player: story.player,
    storyType: story.storyType,
    slot: "featured",
  });
  const relatedItems = story.relatedItems?.length
    ? story.relatedItems
    : [story.whatHappened, story.whyItMatters, story.watchNext].filter(Boolean);

  return (
    <article className="editorial-lead-block overflow-hidden rounded-md border border-border bg-card/90 shadow-[0_18px_46px_rgba(0,0,0,0.22)]">
      <div className="grid min-w-0 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
        <SportsStoryVisual
          className="h-full min-h-[260px] rounded-none border-0 lg:min-h-[360px]"
          league={story.league}
          sport={identity?.sport}
          primaryTeam={story.primaryTeam}
          secondaryTeam={story.secondaryTeam}
          player={story.player}
          title={story.headline}
          storyType={story.storyType}
          detail={story.dek}
          size="feature"
          imageAsset={imageAsset}
        />
        <div className="min-w-0 p-4 sm:p-5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="section-kicker text-primary">{story.sectionTitle ?? story.league ?? "Watch Board"}</span>
            {story.matchup && <span className="truncate text-[0.74rem] font-bold text-muted-foreground">{story.matchup}</span>}
            {story.timestamp && (
              <span className="ml-auto inline-flex min-w-0 items-center gap-1 truncate text-[0.72rem] font-semibold text-muted-foreground tabular-nums">
                <Clock3 className="h-3.5 w-3.5" />
                {story.timestamp}
              </span>
            )}
          </div>
          <h2 className="mt-2 max-w-4xl break-words font-sans text-2xl font-black leading-none text-foreground sm:text-3xl">
            {story.headline}
          </h2>
          {story.dek && (
            <p className="mt-3 max-w-3xl break-words text-sm font-medium leading-relaxed text-muted-foreground sm:text-base">
              {story.dek}
            </p>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {relatedItems.slice(0, 4).map((item) => (
              <div key={item} className="min-w-0 border-l border-border/80 bg-muted/5 py-1.5 pl-3 pr-2">
                <p className="overflow-hidden break-words text-[0.82rem] font-semibold leading-snug text-foreground [overflow-wrap:anywhere] sm:[display:-webkit-box] sm:[-webkit-box-orient:vertical] sm:[-webkit-line-clamp:2]">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-border/70 bg-muted/10 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="data-label mr-1 text-primary">EdgeSetter Intelligence</span>
          <ProofPill label="Evidence strength" value={story.confidence ?? "Monitoring"} />
          <ProofPill label="Reports" value={story.sourceCount ? `${story.sourceCount} report${story.sourceCount === 1 ? "" : "s"}` : story.verification ?? "Checking sources"} />
          <ProofPill label="Timing" value={story.timing ?? "Monitoring"} />
          <ProofPill label="Evidence" value={story.evidence ?? "Nothing verified yet"} />
          <AgentCalibrationBadge
            compact
            copyVariant="editorial"
            input={{
              confidence: parseProofConfidence(story.confidence),
              sourceCount: story.sourceCount,
              timingLabel: story.timing,
              storyType: story.storyType,
              marketReaction: story.market,
              sourceSummary: story.verification,
            }}
            className="ml-0"
          />
          {(story.ctaLabel || onOpen) && (
            <Button type="button" size="sm" variant="outline" onClick={onOpen} className="ml-auto shrink-0">
              <ArrowUpRight className="h-4 w-4" />
              {story.ctaLabel ?? "Open Story"}
            </Button>
          )}
        </div>
        <StoryImpactBlocks
          input={{
            text: [story.headline, story.dek, story.whatHappened, story.whyItMatters, story.watchNext, story.storyType].filter(Boolean).join(" "),
            market: story.market,
            bettingDetail: story.market,
            fantasyDetail: editorialFantasyDetail(story),
          }}
          className="mt-3"
        />
      </div>
    </article>
  );
}

function editorialFantasyDetail(story: SituationStoryCardData) {
  const text = `${story.headline} ${story.storyType ?? ""} ${story.whatHappened} ${story.whyItMatters}`.toLowerCase();
  if (text.includes("lineup") || text.includes("scratch")) return "Lineup context can shift role, usage, and fantasy projections once confirmed.";
  if (text.includes("injury") || text.includes("availability")) return "Availability context can change role and projection expectations after the team update is clearer.";
  if (text.includes("starter") || text.includes("rotation")) return "Starter and rotation context can shift usage expectations.";
  return undefined;
}

function ProofPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded border border-border bg-card/70 px-2 py-1 text-[0.68rem] font-bold text-muted-foreground">
      <span className="data-label text-[0.56rem]">{label}</span>
      <strong className="truncate text-foreground">{value}</strong>
    </span>
  );
}

function parseProofConfidence(value?: string) {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace("%", ""));
  return Number.isNaN(parsed) ? null : parsed;
}

function quietStoryCardData({
  eyebrow,
  title,
  summary,
  primaryRead,
  secondaryRead,
  metrics,
  league,
}: {
  eyebrow: string;
  title: string;
  summary?: string;
  primaryRead?: string;
  secondaryRead?: string;
  metrics: SituationMetric[];
  league?: string;
}): SituationStoryCardData {
  const confidence = metrics.find((metric) => metric.label.toLowerCase().includes("confidence"))?.value;
  const sportsIdentity: SituationSportsIdentity = { team: league, sport: leagueToSituationSport(league) };
  const leagueLabel = league?.toUpperCase();
  const isMlb = leagueLabel === "MLB";
  const isNba = leagueLabel === "NBA";
  const headline = title;
  const dek = summary ?? (isMlb
    ? "EdgeSetter is tracking confirmed lineups, pitcher changes, bullpen usage, weather cells, injury updates, and market movement across today's slate."
    : isNba
      ? "EdgeSetter is tracking starter confirmations, injury context, rotation changes, late scratches, and pre-tip market movement across tonight's slate."
      : undefined);
  const relatedItems = isMlb
    ? [
        "Lineup cards posting before first pitch",
        "Pitcher confirmations and bullpen availability",
        "Weather or park conditions affecting totals",
        "Late scratches, roster moves, and movement before public confirmation",
      ]
    : isNba
      ? [
          "Starter confirmations before tip",
          "Injury context and warmup reports",
          "Rotation changes and late scratches",
          "Pre-tip movement before public confirmation",
        ]
      : [
          primaryRead ?? "Official updates and source agreement",
          secondaryRead ?? "Market reaction and game-state changes",
        ];
  const sectionTitle = isMlb ? "MLB Watch Board" : isNba ? "NBA Watch Board" : eyebrow;
  const timing = isMlb ? "Before first pitch" : isNba ? "Before tip" : "Monitoring";
  const row: SituationRowData = {
    id: `featured-empty-${league ?? "sports"}`,
    title: headline,
    subtitle: dek,
    league,
    market: eyebrow,
    statusLabel: "Monitoring",
    lifecycleLabel: "Quiet slate",
    sourceProgressLabel: "Checking sources",
    sourceCount: undefined,
    sportsIdentity,
  };

  return {
    id: row.id,
    league,
    sectionTitle,
    headline,
    dek,
    whatHappened: primaryRead ?? relatedItems[0],
    whyItMatters: secondaryRead ?? "EdgeSetter keeps the slate organized around the next lineup, availability, weather, and movement checkpoints.",
    edgeSetterKnows: confidence ? `${confidence} confidence support remains on watch.` : "EdgeSetter is monitoring source support, timing, confidence, and downstream sports context.",
    watchNext: leagueLabel === "MLB"
      ? "Confirmed lineup cards, pitcher changes, late scratches, weather cells, bullpen load, and live inning states."
      : leagueLabel === "NBA"
        ? "Confirmed starters, warmup reports, late scratches, rotation changes, injury updates, and pre-tip market reaction."
        : "Official updates, source agreement, market reaction, and game-state changes.",
    relatedItems,
    ctaLabel: isMlb || isNba ? "Open Watch Board" : "View Monitoring Details",
    primaryTeam: undefined,
    storyType: "Slate watch",
    lifecycle: "Monitoring",
    verification: "Checking sources",
    evidence: "Nothing verified yet",
    timing,
    row,
  };
}

function leagueToSituationSport(league?: string): SituationSportsIdentity["sport"] {
  const normalized = league?.toLowerCase();
  if (normalized === "mlb" || normalized === "nba" || normalized === "nfl" || normalized === "cfb") return normalized;
  return undefined;
}

function SportsIdentityPanel({ situation, title, compact }: { situation?: SituationRowData; title: string; compact?: boolean }) {
  const identity = situation?.sportsIdentity;
  const storyType = storyTypeLabel(situation);
  return (
    <SportsStoryVisual
      className="board-featured-identity-panel"
      league={situation?.league}
      sport={identity?.sport}
      primaryTeam={identity?.team ?? identity?.awayTeam}
      secondaryTeam={identity?.opponent ?? identity?.homeTeam}
      player={identity?.player}
      title={situation?.matchup ?? title}
      storyType={storyType}
      detail={situation?.sourceProgressLabel ?? situation?.statusLabel}
      size={compact ? "compact" : "feature"}
      imageAsset={resolveSportsImageAsset({
        league: situation?.league,
        sport: identity?.sport,
        team: identity?.team ?? identity?.awayTeam,
        opponent: identity?.opponent ?? identity?.homeTeam,
        player: identity?.player,
        storyType,
        slot: "featured",
      })}
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
  if (situation?.evidenceCount) {
    return `${situation.evidenceCount} evidence event${situation.evidenceCount === 1 ? "" : "s"}`;
  }
  if (situation?.sourceCount) {
    return `${situation.sourceCount} report${situation.sourceCount === 1 ? "" : "s"} attached`;
  }
  if (value === "source/context support") return value;
  return `${value} support signal`;
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
  if (situation?.sourceCount) return situation.sourceCount === 1 ? "Single confirmed report" : `${situation.sourceCount} confirmed reports`;
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
