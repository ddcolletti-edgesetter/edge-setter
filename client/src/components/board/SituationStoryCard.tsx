import { ArrowUpRight, Clock3 } from "lucide-react";

import { AgentCalibrationBadge } from "@/components/AgentCalibration";
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
  // "KC @ BUF" up here and "at BUF" on the identity line below name the same
  // opponent twice. The identity line wins: it carries the home/away side from
  // a source that knows it, plus the kickoff, so it is strictly the more
  // informative of the two. The header matchup is kept whenever there is no
  // identity line to carry it, which is every card without a resolved game.
  const showMatchup =
    Boolean(story.matchup) && !matchupNamesOpponent(story.matchup, story.opponentLabel);
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
            {showMatchup && <span className="truncate text-[0.74rem] font-bold text-muted-foreground">{story.matchup}</span>}
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
        <StoryIdentityLine story={story} />
        {story.row.detectionLeadTime && (
          <div className="mt-1.5 inline-flex max-w-full flex-wrap items-center gap-1 rounded border border-[rgba(45,212,191,0.35)] bg-[rgba(45,212,191,0.08)] px-2 py-0.5 text-[0.68rem] font-extrabold leading-snug text-[#2DD4BF]">
            {story.row.detectionLeadKind === "pickup"
              ? <>⚡ Detected {story.row.detectionLeadTime} before national pickup</>
              : <>⚡ EdgeSetter flagged {story.row.detectionLeadTime} before public confirmation</>}
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
          {featured && story.edgeSetterKnows && (
            <StoryRead label="What EdgeSetter knows" value={story.edgeSetterKnows} />
          )}
        </div>

        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5 border-t border-border/65 pt-2">
          <ProofPill label="Source trail" value={sourceCountText(story.sourceCount)} />
          <ProofPill label="Timing" value={story.timing ?? story.lifecycle ?? story.row.statusLabel ?? "Developing"} />
          <ProofPill label="Evidence" value={story.evidence ?? evidenceCountText(story.row.evidenceCount)} />
          {(story.row.escalationState === "verified" || story.row.escalationState === "official")
            ? <ProofPill label="Verified" value="VERIFIED" />
            : story.row.confidenceJourney
            ? <ProofPill label="Confidence" value={story.row.confidenceJourney} />
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
          playerEspnId={identity?.playerEspnId}
          playerJersey={identity?.playerJersey}
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

/**
 * Availability, player, and the game the story belongs to — the three facts a
 * reader checks first, in that order.
 *
 * Every part is independently optional and the whole line disappears when all
 * three are absent. No placeholder, no em dash standing in for a missing
 * kickoff: a story with no matched game simply shows the opponent, and one with
 * no resolved player shows neither name nor an empty slot.
 */
function StoryIdentityLine({ story }: { story: SituationStoryCardData }) {
  // The player chip is dropped when the headline already names him. It is
  // suppressed here and not in the adapter on purpose: `story.player` also
  // selects the artwork treatment in SportsStoryVisual (jersey vs watermark vs
  // matchup split), so clearing the field would silently change the picture.
  const showPlayer = Boolean(story.player) && !textNames(story.headline, story.player);

  const whereAndWhen = [story.opponentLabel, story.kickoff].filter(Boolean).join(", ");
  if (!story.injuryDesignation && !showPlayer && !whereAndWhen) return null;

  return (
    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {story.injuryDesignation && (
        <span
          data-testid="story-injury-designation"
          className="inline-flex shrink-0 items-center rounded border border-[rgba(255,82,82,0.4)] bg-[rgba(255,82,82,0.12)] px-1.5 py-0.5 text-[0.62rem] font-extrabold uppercase tracking-widest text-[#FF5252]"
        >
          {story.injuryDesignation}
        </span>
      )}
      {showPlayer && (
        <span data-testid="story-player" className="min-w-0 truncate text-[0.82rem] font-bold text-foreground">
          {story.player}
        </span>
      )}
      {whereAndWhen && (
        <span data-testid="story-where-when" className="min-w-0 truncate text-[0.74rem] font-semibold text-muted-foreground tabular-nums">
          {whereAndWhen}
        </span>
      )}
    </div>
  );
}

/** Does `text` already contain `name`, ignoring case and punctuation? */
function textNames(text?: string, name?: string): boolean {
  const norm = (v?: string) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const haystack = norm(text);
  const needle = norm(name);
  // Full name only. A headline carrying just the surname is not saying the same
  // thing as a chip carrying both names, so that chip still earns its place.
  return Boolean(needle) && haystack.includes(needle);
}

/**
 * Is the opponent in `label` ("at BUF" / "vs Rice Owls") already named by the
 * header's matchup ("KC @ BUF" / "Temple Owls @ Rice Owls")?
 *
 * Split on the separator, not on every non-alphanumeric: a side is compared
 * whole, so "SF" still cannot match inside "SFO" AND a multi-word school name
 * matches the side that holds it. Splitting on word characters would read
 * "Temple Owls @ Rice Owls" as four tokens, none of them "RICE OWLS", and the
 * card would print the opponent twice.
 */
function matchupNamesOpponent(matchup?: string, label?: string): boolean {
  const opponent = String(label ?? "").replace(/^\s*(?:at|vs\.?)\s+/i, "").trim().toUpperCase();
  if (!opponent || !matchup) return false;
  return matchup
    .toUpperCase()
    .split(/\s+@\s+|\s+VS\.?\s+/)
    .map((side) => side.trim())
    .includes(opponent);
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
  if (state === "resolved" || state === "archived" || state === "verified" || state === "cooling") return 3;
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
