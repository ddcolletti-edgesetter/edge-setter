import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { TeamLogoImg, getPlayerHeadshotUrlById, isUnknownTeamAbbr, toTeamAbbr } from "@/components/v2/SportVisuals";
import { JerseyNumberVisual, MatchupSplitVisual, WatermarkLogoVisual } from "@/components/StoryVisualTreatments";
import type { SportsImageAsset } from "@/lib/sportsImageAssets";

type Sport = "nba" | "mlb" | "nfl" | "cfb";

export interface SportsStoryVisualProps {
  league?: string;
  sport?: Sport;
  primaryTeam?: string;
  secondaryTeam?: string;
  player?: string;
  /** ESPN athlete id for {@link player}. When present (with a resolved sport), the
   *  visual renders the player's headshot over a team-badge/jersey backdrop,
   *  falling back to a photo-free treatment if the headshot 404s. */
  playerEspnId?: string;
  /** Jersey number for {@link player}, carried parallel to {@link playerEspnId}.
   *  When present alongside a resolved headshot, selects the jersey-number
   *  treatment; never invented. */
  playerJersey?: string;
  /** Optional position abbreviation for {@link player} (e.g. "WR"), shown on the
   *  jersey-number chip when available. */
  position?: string;
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
  rawSignal?: unknown;
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
  playerEspnId,
  playerJersey,
  position,
  title,
  storyType,
  detail,
  size = "feature",
  className,
}: SportsStoryVisualProps) {
  const resolvedSport = sport ?? leagueToSport(league);
  const primary = cleanTeamAbbr(primaryTeam) || cleanTeamAbbr(secondaryTeam) || league?.toUpperCase() || "ES";
  const secondary = cleanTeamAbbr(secondaryTeam);
  const showMatchup = Boolean(secondary && secondary !== primary);
  const leagueLabel = league?.toUpperCase() ?? (resolvedSport ? SPORT_FALLBACKS[resolvedSport].label : "SPORT");
  const subject = player || title || (showMatchup ? `${primary} @ ${secondary}` : primary);
  const texture = resolvedSport ? SPORT_FALLBACKS[resolvedSport].texture : "is-generic";

  // Player headshot resolves from the roster-backed ESPN id. If it 404s, onError
  // flips headshotFailed and the visual drops from a headshot treatment back to the
  // matchup split (two teams) or the plain team-badge rendering.
  const headshotUrl = player && resolvedSport ? getPlayerHeadshotUrlById(playerEspnId, resolvedSport) : "";
  const [headshotFailed, setHeadshotFailed] = useState(false);
  useEffect(() => {
    setHeadshotFailed(false);
  }, [headshotUrl]);
  const showHeadshot = Boolean(headshotUrl) && !headshotFailed;

  // Treatment selection (see StoryVisualTreatments):
  //  1. player + resolved headshot + jersey → JerseyNumberVisual
  //  2. player + resolved headshot, no jersey → WatermarkLogoVisual
  //  3. two teams, no confirmed-player headshot → MatchupSplitVisual
  //  4. none of the above → plain TeamLogoImg-only stage (no backdrop layer)
  const showJerseyTreatment = Boolean(player) && showHeadshot && Boolean(playerJersey);
  const showWatermarkTreatment = Boolean(player) && showHeadshot && !playerJersey;
  const showMatchupTreatment = !showHeadshot && showMatchup;
  const hasBackdrop = showJerseyTreatment || showWatermarkTreatment || showMatchupTreatment;

  const onHeadshotError = () => setHeadshotFailed(true);
  const treatmentProps = {
    primary,
    secondary,
    teamAbbr: primary,
    opponentAbbr: secondary || undefined,
    headshotUrl: showHeadshot ? headshotUrl : undefined,
    onHeadshotError,
    jersey: playerJersey,
    position,
    sport: resolvedSport,
  };

  return (
    <div className={cn("sports-story-visual", `is-${size}`, texture, hasBackdrop && "has-image", className)} aria-label={`${leagueLabel} sports story visual`}>
      <div className="sports-story-visual-bg" />
      {showJerseyTreatment ? (
        <JerseyNumberVisual {...treatmentProps} />
      ) : showWatermarkTreatment ? (
        <WatermarkLogoVisual {...treatmentProps} />
      ) : showMatchupTreatment ? (
        <MatchupSplitVisual {...treatmentProps} />
      ) : null}
      <div className="sports-story-visual-top">
        <span>{leagueLabel}</span>
        <strong>{storyType || "Story watch"}</strong>
      </div>
      <div className="sports-story-visual-stage">
        <TeamLogoImg abbr={primary} sport={resolvedSport} size={logoSize(size)} />
        {showMatchup ? (
          <>
            <span className="sports-story-visual-vs">VS</span>
            <TeamLogoImg abbr={secondary} sport={resolvedSport} size={logoSize(size)} />
          </>
        ) : null}
      </div>
      <div className="sports-story-visual-copy">
        <span>{player ? "Player focus" : showMatchup ? "Matchup focus" : "Team focus"}</span>
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
  onSelect,
}: {
  title: string;
  items: HeadlineStoryItem[];
  className?: string;
  onSelect?: (signal: unknown) => void;
}) {
  return (
    <section className={cn("headline-story-rail", className)}>
      <header>
        <span>{title}</span>
        <strong>{items.length} story checks</strong>
      </header>
      <div className="headline-story-rail-list">
        {items.map((item) => (
          <article
            key={item.id}
            className="headline-story-rail-item"
            onClick={onSelect && item.rawSignal ? () => onSelect(item.rawSignal) : undefined}
            style={onSelect && item.rawSignal ? { cursor: "pointer" } : undefined}
          >
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


