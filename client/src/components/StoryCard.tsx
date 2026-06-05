import { Link } from "wouter";

import { EdgeSetterOverlay, type EdgeSetterOverlayData } from "@/components/EdgeSetterOverlay";
import { SportsStoryVisual, leagueToSport } from "@/components/SportsMedia";
import type { IntelligenceSituation } from "@/lib/intelligenceSituationsApi";
import type { SportsImageAsset } from "@/lib/sportsImageAssets";
import { hasCleanPublicTeamIdentity, hasCleanPublicText, publicFallbackLabel } from "@/lib/publicDisplayHygiene";
import { cn } from "@/lib/utils";

export interface StoryCardData {
  id: string;
  league: string;
  headline: string;
  dek?: string;
  label?: string;
  href?: string;
  primaryTeam?: string;
  secondaryTeam?: string;
  player?: string;
  storyType?: string;
  detail?: string;
  whatChanged?: string;
  whyItMatters?: string;
  watchNext?: string;
  overlay: EdgeSetterOverlayData;
  situation?: IntelligenceSituation | null;
  imageAsset?: SportsImageAsset | null;
}

interface StoryCardProps {
  story: StoryCardData;
  variant?: "lead" | "feature" | "rail" | "compact";
  className?: string;
  copyVariant?: "legacy" | "public";
}

export function StoryCard({ story, variant = "feature", className, copyVariant = "legacy" }: StoryCardProps) {
  const publicCopy = copyVariant === "public";
  const displayStory = publicCopy ? sanitizePublicStory(story) : story;
  const card = (
    <article className={cn("story-card", `story-card-${variant}`, className)}>
      <div className="story-card-visual">
        <SportsStoryVisual
          league={displayStory.league}
          sport={leagueToSport(displayStory.league)}
          primaryTeam={displayStory.primaryTeam}
          secondaryTeam={displayStory.secondaryTeam}
          player={displayStory.player}
          title={displayStory.headline}
          storyType={displayStory.storyType ?? displayStory.label ?? "Developing story"}
          detail={displayStory.detail ?? displayStory.watchNext}
          size={variant === "lead" ? "hero" : variant === "compact" || variant === "rail" ? "compact" : "feature"}
          imageAsset={displayStory.imageAsset}
        />
      </div>

      <div className="story-card-copy">
        <div className="story-card-kicker">
          <span>{displayStory.league}</span>
          <strong>{displayStory.label ?? displayStory.storyType ?? "Developing story"}</strong>
        </div>
        <h2>{displayStory.headline}</h2>
        <div className="story-card-context">
          {[displayStory.league, displayStory.primaryTeam && displayStory.secondaryTeam ? `${displayStory.primaryTeam} @ ${displayStory.secondaryTeam}` : displayStory.primaryTeam, displayStory.player, displayStory.storyType].filter(Boolean).join(" / ") || "Sports context"}
        </div>
        {displayStory.dek && <p>{displayStory.dek}</p>}

        <div className="story-card-reads">
          {displayStory.whatChanged && (
            <div>
              <span>{publicCopy ? "What happened" : "What changed"}</span>
              <strong>{displayStory.whatChanged}</strong>
            </div>
          )}
          {displayStory.whyItMatters && (
            <div>
              <span>Why it matters</span>
              <strong>{displayStory.whyItMatters}</strong>
            </div>
          )}
          {displayStory.watchNext && (
            <div>
              <span>Watch next</span>
              <strong>{displayStory.watchNext}</strong>
            </div>
          )}
        </div>
      </div>

      <EdgeSetterOverlay data={displayStory.overlay} situation={displayStory.situation} compact={variant === "rail" || variant === "compact"} copyVariant={publicCopy ? "editorial" : "legacy"} />
    </article>
  );

  if (!displayStory.href) return card;
  return <Link href={displayStory.href}>{card}</Link>;
}

function sanitizePublicStory(story: StoryCardData): StoryCardData {
  const headlineFallback = publicFallbackLabel(`${story.headline} ${story.storyType}`, story.league);
  return {
    ...story,
    headline: hasCleanPublicText(story.headline) ? story.headline : headlineFallback,
    dek: hasCleanPublicText(story.dek) ? story.dek : "EdgeSetter is monitoring source support, timing, and sports context before elevating this item.",
    label: hasCleanPublicText(story.label) ? story.label : headlineFallback,
    primaryTeam: hasCleanPublicTeamIdentity(story.primaryTeam) ? story.primaryTeam : undefined,
    secondaryTeam: hasCleanPublicTeamIdentity(story.secondaryTeam) ? story.secondaryTeam : undefined,
    player: hasCleanPublicText(story.player) ? story.player : undefined,
    storyType: hasCleanPublicText(story.storyType) ? story.storyType : headlineFallback,
    detail: hasCleanPublicText(story.detail) ? story.detail : headlineFallback,
    whatChanged: hasCleanPublicText(story.whatChanged) ? story.whatChanged : "A watch item changed enough to stay on the board.",
    whyItMatters: hasCleanPublicText(story.whyItMatters) ? story.whyItMatters : "The sports impact is still developing.",
    watchNext: hasCleanPublicText(story.watchNext) ? story.watchNext : "Watch for source support, official confirmation, and context movement.",
  };
}
