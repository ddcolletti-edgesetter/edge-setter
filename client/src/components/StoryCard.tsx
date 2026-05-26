import { Link } from "wouter";

import { EdgeSetterOverlay, type EdgeSetterOverlayData } from "@/components/EdgeSetterOverlay";
import { SportsStoryVisual, leagueToSport } from "@/components/SportsMedia";
import type { IntelligenceSituation } from "@/lib/intelligenceSituationsApi";
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
}

interface StoryCardProps {
  story: StoryCardData;
  variant?: "lead" | "feature" | "rail" | "compact";
  className?: string;
}

export function StoryCard({ story, variant = "feature", className }: StoryCardProps) {
  const card = (
    <article className={cn("story-card", `story-card-${variant}`, className)}>
      <div className="story-card-visual">
        <SportsStoryVisual
          league={story.league}
          sport={leagueToSport(story.league)}
          primaryTeam={story.primaryTeam}
          secondaryTeam={story.secondaryTeam}
          player={story.player}
          title={story.headline}
          storyType={story.storyType ?? story.label ?? "Developing story"}
          detail={story.detail ?? story.watchNext}
          size={variant === "lead" ? "hero" : variant === "compact" || variant === "rail" ? "compact" : "feature"}
        />
      </div>

      <div className="story-card-copy">
        <div className="story-card-kicker">
          <span>{story.league}</span>
          <strong>{story.label ?? story.storyType ?? "Developing story"}</strong>
        </div>
        <h2>{story.headline}</h2>
        {story.dek && <p>{story.dek}</p>}

        <div className="story-card-reads">
          {story.whatChanged && (
            <div>
              <span>What changed</span>
              <strong>{story.whatChanged}</strong>
            </div>
          )}
          {story.whyItMatters && (
            <div>
              <span>Why it matters</span>
              <strong>{story.whyItMatters}</strong>
            </div>
          )}
          {story.watchNext && (
            <div>
              <span>Watch next</span>
              <strong>{story.watchNext}</strong>
            </div>
          )}
        </div>
      </div>

      <EdgeSetterOverlay data={story.overlay} situation={story.situation} compact={variant === "rail" || variant === "compact"} />
    </article>
  );

  if (!story.href) return card;
  return <Link href={story.href}>{card}</Link>;
}
