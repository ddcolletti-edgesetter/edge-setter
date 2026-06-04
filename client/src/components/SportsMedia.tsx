import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { TeamLogoImg, isUnknownTeamAbbr, toTeamAbbr } from "@/components/v2/SportVisuals";
import type { SportsImageAsset } from "@/lib/sportsImageAssets";

type Sport = "nba" | "mlb" | "nfl" | "cfb";

export interface SportsStoryVisualProps {
  league?: string;
  sport?: Sport;
  primaryTeam?: string;
  secondaryTeam?: string;
  player?: string;
  title?: string;
  storyType?: string;
  detail?: string;
  size?: "hero" | "feature" | "compact" | "mini";
  className?: string;
  imageAsset?: SportsImageAsset | null;
}

export interface HeadlineStoryItem {
  id: string | number;
  league?: string;
  sport?: Sport;
  team?: string;
  opponent?: string;
  player?: string;
  headline: string;
  storyType?: string;
  status?: string;
  time?: string;
}

const SPORT_FALLBACKS: Record<Sport, { label: string; texture: string }> = {
  nba: { label: "NBA", texture: "is-nba" },
  mlb: { label: "MLB", texture: "is-mlb" },
  nfl: { label: "NFL", texture: "is-nfl" },
  cfb: { label: "CFB", texture: "is-cfb" },
};

export function SportsStoryVisual({
  league,
  sport,
  primaryTeam,
  secondaryTeam,
  player,
  title,
  storyType,
  detail,
  size = "feature",
  className,
  imageAsset,
}: SportsStoryVisualProps) {
  const resolvedSport = sport ?? leagueToSport(league);
  const primary = cleanTeamAbbr(primaryTeam) || cleanTeamAbbr(secondaryTeam) || league?.toUpperCase() || "ES";
  const secondary = cleanTeamAbbr(secondaryTeam);
  const showMatchup = Boolean(secondary && secondary !== primary);
  const leagueLabel = league?.toUpperCase() ?? (resolvedSport ? SPORT_FALLBACKS[resolvedSport].label : "SPORT");
  const subject = player || title || (showMatchup ? `${primary} @ ${secondary}` : primary);
  const initials = playerInitials(player || title || primary);
  const texture = resolvedSport ? SPORT_FALLBACKS[resolvedSport].texture : "is-generic";
  const imageCandidates = useMemo(() => imageAsset?.candidateSrcs ?? [], [imageAsset]);
  const [imageIndex, setImageIndex] = useState(0);
  const activeImageSrc = imageCandidates[imageIndex];
  const isLeagueOnlyImage = Boolean(activeImageSrc && !player && !showMatchup && primary === leagueLabel);

  useEffect(() => {
    setImageIndex(0);
  }, [imageCandidates]);

  return (
    <div className={cn("sports-story-visual", `is-${size}`, texture, activeImageSrc && "has-image", className)} aria-label={`${leagueLabel} sports story visual`}>
      <div className="sports-story-visual-bg" />
      {activeImageSrc && (
        <div className="sports-story-image-slot" data-slot={imageAsset?.slot}>
          <img
            src={activeImageSrc}
            alt={imageAsset?.alt ?? `${leagueLabel} sports story image`}
            data-testid="homepage-story-image"
            loading={size === "hero" || size === "feature" ? "eager" : "lazy"}
            decoding="async"
            onError={() => setImageIndex((current) => current + 1)}
          />
        </div>
      )}
      <div className="sports-story-visual-top">
        <span>{leagueLabel}</span>
        <strong>{storyType || "Story watch"}</strong>
      </div>
      <div className="sports-story-visual-stage">
        <TeamLogoImg abbr={primary} sport={resolvedSport} size={isLeagueOnlyImage ? logoSize(size) + 24 : logoSize(size)} />
        {showMatchup ? (
          <>
            <span className="sports-story-visual-vs">VS</span>
            <TeamLogoImg abbr={secondary} sport={resolvedSport} size={logoSize(size)} />
          </>
        ) : isLeagueOnlyImage ? null : (
          <div className="sports-story-player-fallback" aria-hidden="true">
            <span>{initials}</span>
          </div>
        )}
      </div>
      <div className="sports-story-visual-copy">
        <span>{player ? "Player focus" : showMatchup ? "Matchup focus" : isLeagueOnlyImage ? "League watch" : "Team focus"}</span>
        <strong>{subject}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </div>
  );
}

export function SportsImageFallback({
  league,
  sport,
  team,
  opponent,
  player,
  storyType,
  className,
}: Pick<SportsStoryVisualProps, "league" | "sport" | "player" | "storyType" | "className"> & {
  team?: string;
  opponent?: string;
}) {
  const resolvedSport = sport ?? leagueToSport(league);
  const primary = cleanTeamAbbr(team) || league?.toUpperCase() || "ES";
  const secondary = cleanTeamAbbr(opponent);
  return (
    <div className={cn("sports-image-fallback", resolvedSport && `is-${resolvedSport}`, className)}>
      <div className="sports-image-fallback-texture" />
      <div className="sports-image-fallback-lockup">
        <TeamLogoImg abbr={primary} sport={resolvedSport} size={58} />
        {secondary && secondary !== primary && <TeamLogoImg abbr={secondary} sport={resolvedSport} size={46} />}
      </div>
      <div className="sports-image-fallback-copy">
        <span>{league?.toUpperCase() ?? "SPORT"} / {storyType || "Story watch"}</span>
        <strong>{player || (secondary && secondary !== primary ? `${primary} @ ${secondary}` : primary)}</strong>
      </div>
    </div>
  );
}

export function MatchupVisualCard({
  league,
  sport,
  primaryTeam,
  secondaryTeam,
  title,
  storyType,
  detail,
  className,
}: SportsStoryVisualProps) {
  return (
    <article className={cn("matchup-visual-card", className)}>
      <SportsStoryVisual
        league={league}
        sport={sport}
        primaryTeam={primaryTeam}
        secondaryTeam={secondaryTeam}
        title={title}
        storyType={storyType}
        detail={detail}
        size="compact"
      />
    </article>
  );
}

export function HeadlineStoryRail({
  title,
  items,
  className,
}: {
  title: string;
  items: HeadlineStoryItem[];
  className?: string;
}) {
  return (
    <section className={cn("headline-story-rail", className)}>
      <header>
        <span>{title}</span>
        <strong>{items.length} story checks</strong>
      </header>
      <div className="headline-story-rail-list">
        {items.map((item) => (
          <article key={item.id} className="headline-story-rail-item">
            <TeamLogoLockup
              league={item.league}
              sport={item.sport ?? leagueToSport(item.league)}
              team={item.team ?? item.opponent}
              player={item.player ?? item.team}
              storyType={item.storyType}
              size="mini"
            />
            <div className="headline-story-rail-copy">
              <strong>{item.headline}</strong>
              <span>{item.status ?? "source checks attached"}{item.time ? ` / ${item.time}` : ""}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function TeamLogoLockup({
  league,
  sport,
  team,
  player,
  storyType,
  size = "compact",
  className,
}: Pick<SportsStoryVisualProps, "league" | "sport" | "player" | "storyType" | "className"> & {
  team?: string;
  size?: "compact" | "mini";
}) {
  const resolvedSport = sport ?? leagueToSport(league);
  const abbr = cleanTeamAbbr(team) || league?.toUpperCase() || "ES";
  return (
    <div className={cn("team-logo-lockup", size === "mini" && "is-mini", className)}>
      <TeamLogoImg abbr={abbr} sport={resolvedSport} size={size === "mini" ? 36 : 48} />
      <span>
        <small>{league?.toUpperCase() ?? "SPORT"}{storyType ? ` / ${storyType}` : ""}</small>
        <strong>{player || abbr}</strong>
      </span>
    </div>
  );
}

export function leagueToSport(league?: string): Sport | undefined {
  const value = league?.toLowerCase();
  if (value === "nba" || value === "mlb" || value === "nfl" || value === "cfb") return value;
  return undefined;
}

function cleanTeamAbbr(value?: string) {
  const abbr = toTeamAbbr(value ?? "");
  return isUnknownTeamAbbr(abbr) ? "" : abbr;
}

function logoSize(size: SportsStoryVisualProps["size"]) {
  if (size === "hero") return 118;
  if (size === "feature") return 104;
  if (size === "compact") return 76;
  return 42;
}

function playerInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "ES";
}
