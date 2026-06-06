import { ArrowUpRight, Clock3 } from "lucide-react";

import { AgentCalibrationBadge } from "@/components/AgentCalibration";
import { ConfidenceGauge } from "@/components/ConfidenceGauge";
import { SportsStoryVisual, leagueToSport } from "@/components/SportsMedia";
import { StoryImpactBlocks } from "@/components/StoryImpactBlocks";
import { Button } from "@/components/ui/button";
import { resolveSportsImageAsset } from "@/lib/sportsImageAssets";
import { evidenceCountText, publicStoryText, sourceCountText } from "@/lib/storyLanguage";
import { cn } from "@/lib/utils";
import type { SituationStoryCardData } from "./boardAdapters";

interface SituationStoryCardProps {
  story: SituationStoryCardData;
  compact?: boolean;
  featured?: boolean;
  className?: string;
  onOpen?: () => void;
}

export function SituationStoryCard({ story, compact, featured, className, onOpen }: SituationStoryCardProps) {
  const identity = story.row.sportsIdentity;
  const imageAsset = resolveSportsImageAsset({
    league: story.league,
    sport: identity?.sport,
    team: story.primaryTeam,
    opponent: story.secondaryTeam,
    player: story.player,
    storyType: story.storyType,
    slot: featured ? "featured" : "matchup",
  });

  return (
    <article
      className={cn(
        "situation-story-card grid min-w-0 max-w-full overflow-hidden rounded-md border border-border bg-card/90 shadow-[0_16px_38px_rgba(0,0,0,0.18)]",
        featured ? "lg:grid-cols-[minmax(0,1fr)_330px]" : "lg:grid-cols-[minmax(0,1fr)_250px]",
        compact && "situation-story-card-compact",
        onOpen && "cursor-pointer",
        className,
      )}
      onClick={onOpen}
    >
      <div className={cn("min-w-0 max-w-[calc(100vw-48px)] overflow-hidden sm:max-w-full", compact ? "p-3" : "p-4")}>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="data-label text-primary">{story.league ?? "SPORT"}</span>
          {story.matchup && <span className="truncate text-[0.74rem] font-bold text-muted-foreground">{story.matchup}</span>}
          {story.timestamp && (
            <span className="ml-auto inline-flex min-w-0 items-center gap-1 truncate text-[0.72rem] font-semibold text-muted-foreground tabular-nums">
              <Clock3 className="h-3.5 w-3.5" />
              {story.timestamp}
            </span>
          )}
        </div>

        <h3 className={cn("mt-2 max-w-3xl break-words font-sans font-bold leading-tight text-foreground", featured ? "text-xl sm:text-2xl" : "text-base sm:text-lg")}>
          {story.headline}
        </h3>
        {story.row.detectionLeadTime && (
          <div className="mt-1.5 inline-flex items-center gap-1 rounded border border-[rgba(24,212,123,0.3)] bg-[rgba(24,212,123,0.06)] px-2 py-0.5 text-[0.64rem] font-bold text-[var(--es-green)]">
            ⚡ Flagged {story.row.detectionLeadTime} before confirmation
          </div>
        )}
        <SituationProgressBar state={story.row.lifecycleVisualState} />
        {story.dek && !compact && (
          <p className="mt-2 max-w-3xl break-words text-sm font-medium leading-snug text-muted-foreground">
            {story.dek}
          </p>
        )}

        <div className={cn("mt-3 grid min-w-0 gap-2", featured ? "md:grid-cols-2" : "md:grid-cols-3")}>
          <StoryRead label="What happened" value={story.whatHappened} />
          {story.whyItMatters && <StoryRead label="Why it matters" value={story.whyItMatters} />}
          {story.watchNext && <StoryRead label="Watch next" value={story.watchNext} />}
          {featured && <StoryRead label="What EdgeSetter knows" value={story.edgeSetterKnows} />}
        </div>

        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5 border-t border-border/65 pt-2">
          {!compact && featured && parseConfidence(story.confidence) !== null && (
            <ConfidenceGauge
              value={parseConfidence(story.confidence)!}
              size="sm"
              showAgents={false}
              style={{ marginRight: 8 }}
            />
          )}
          <ProofPill label="Source trail" value={sourceCountText(story.sourceCount)} />
          <ProofPill label="Timing" value={story.timing ?? story.lifecycle ?? story.row.statusLabel ?? "Developing"} />
          <ProofPill label="Evidence" value={story.evidence ?? evidenceCountText(story.row.evidenceCount)} />
          {(story.row.escalationState === "verified" || story.row.escalationState === "official")
            ? <ProofPill label="Verified" value="VERIFIED" />
            : story.confidence && <ProofPill label="Confidence" value={story.confidence} />}
          {featured && (
            <AgentCalibrationBadge
              compact
              copyVariant="editorial"
              input={{
                confidence: parseConfidence(story.confidence),
                sourceCount: story.sourceCount,
                timingLabel: story.timing,
                storyType: story.storyType,
                marketReaction: story.market,
                sourceSummary: publicStoryText(story.verification),
              }}
              className="ml-0"
            />
          )}
          {onOpen && (
            <Button type="button" size="sm" variant="outline" onClick={onOpen} className="ml-auto shrink-0">
              <ArrowUpRight className="h-4 w-4" />
              Open Story
            </Button>
          )}
        </div>

        <StoryImpactBlocks
          compact={compact}
          input={{
            text: [story.headline, story.dek, story.whatHappened, story.whyItMatters, story.watchNext, story.storyType, story.row.title, story.row.subtitle].filter(Boolean).join(" "),
            market: story.market ?? story.row.marketReaction ?? story.row.market,
            bettingDetail: story.market ?? story.row.marketReaction,
            fantasyDetail: fantasyDetail(story),
          }}
          className="mt-3"
        />
      </div>

      <div className={cn("min-w-0 border-t border-border/70 lg:border-l lg:border-t-0", compact && "hidden sm:block")}>
        <SportsStoryVisual
          className="h-full min-h-[190px] rounded-none border-0"
          league={story.league}
          sport={leagueToSport(story.league)}
          primaryTeam={story.primaryTeam}
          secondaryTeam={story.secondaryTeam}
          player={story.player}
          title={story.headline}
          storyType={story.storyType}
          detail={story.edgeSetterKnows}
          size={featured ? "feature" : "compact"}
          imageAsset={imageAsset}
        />
      </div>
    </article>
  );
}

function fantasyDetail(story: SituationStoryCardData) {
  const text = `${story.storyType ?? ""} ${story.row.title} ${story.row.subtitle ?? ""}`.toLowerCase();
  if (text.includes("lineup") || text.includes("scratch")) return "Lineup changes can move role, plate-appearance, minutes, or usage expectations after confirmation.";
  if (text.includes("injury") || text.includes("availability") || text.includes("questionable")) return "Availability updates can change role, usage, and projection context after the team status is clearer.";
  if (text.includes("starter") || text.includes("rotation")) return "Starter and rotation updates can shift fantasy workload expectations.";
  return undefined;
}

function StoryRead({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-l border-border/80 bg-muted/5 py-1 pl-3 pr-2">
      <span className="data-label text-[0.62rem]">{label}</span>
      <p className="mt-1 overflow-hidden break-words text-[0.82rem] font-semibold leading-snug text-foreground [overflow-wrap:anywhere] sm:[display:-webkit-box] sm:[-webkit-box-orient:vertical] sm:[-webkit-line-clamp:2]">{value}</p>
    </div>
  );
}

function ProofPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded border border-border bg-muted/15 px-2 py-1 text-[0.68rem] font-bold text-muted-foreground">
      <span className="data-label text-[0.56rem]">{label}</span>
      <strong className="truncate text-foreground">{value}</strong>
    </span>
  );
}

function parseConfidence(value?: string) {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace("%", ""));
  return Number.isNaN(parsed) ? null : parsed;
}

const PROGRESS_STAGES = ["Detected", "Signals aligning", "Consensus forming", "Verified"] as const;

function stageIndex(state?: string): number {
  if (!state) return 0;
  if (state === "resolved" || state === "archived" || state === "consensus-forming" || state === "cooling") return 3;
  if (state === "confirming" || state === "market-reacting") return 2;
  if (state === "developing") return 1;
  return 0;
}

function SituationProgressBar({ state }: { state?: string }) {
  const active = stageIndex(state);
  return (
    <div className="mt-1.5 flex min-w-0 items-center gap-1">
      {PROGRESS_STAGES.map((label, i) => (
        <div key={label} className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className={cn(
            "h-0.5 w-full rounded-full transition-colors",
            i <= active ? "bg-primary" : "bg-border/60",
          )} />
          {i === active && (
            <span className="truncate text-[0.58rem] font-bold uppercase tracking-widest text-primary">{label}</span>
          )}
        </div>
      ))}
    </div>
  );
}
