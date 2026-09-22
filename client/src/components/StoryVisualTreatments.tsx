import type { CSSProperties } from "react";

import { getTeamColors, TeamLogoImg, type TeamLogoSport } from "@/components/v2/SportVisuals";

/**
 * Edge Setter — Story visual treatments
 *
 * Three explicit backdrop treatments for {@link SportsStoryVisual}, replacing the
 * old headshot-over-stock-photo layering. Each fills the `.sports-story-image-slot`
 * area (absolute, behind the copy overlay) and derives all color from the shared
 * {@link getTeamColors} manifest — no hardcoded hex. The oversized team badge is
 * always rendered via {@link TeamLogoImg} (its abbreviation-badge fallback), never
 * a duplicated badge implementation.
 */
export interface StoryVisualTreatmentProps {
  primary: string;
  secondary: string;
  teamAbbr: string;
  opponentAbbr?: string;
  headshotUrl?: string;
  onHeadshotError: () => void;
  jersey?: string;
  position?: string;
  sport?: TeamLogoSport;
}

const rootStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 0,
  overflow: "hidden",
};

/** Oversized team badge bleeding off the bottom-right corner at low opacity. Reuses
 *  TeamLogoImg (logo image or its abbreviation-badge fallback), never duplicated. */
function WatermarkBadge({ abbr, sport }: { abbr: string; sport?: TeamLogoSport }) {
  return (
    <div
      aria-hidden="true"
      style={{ position: "absolute", right: "-14%", bottom: "-22%", opacity: 0.16, filter: "saturate(1.1)", pointerEvents: "none" }}
    >
      <TeamLogoImg abbr={abbr} sport={sport} size={260} />
    </div>
  );
}

/** Player headshot layered in front of the backdrop. Shared by the two player
 *  treatments; keeps the same testid + onError fallback the old slot carried. */
function HeadshotLayer({ headshotUrl, onHeadshotError, teamAbbr }: Pick<StoryVisualTreatmentProps, "headshotUrl" | "onHeadshotError" | "teamAbbr">) {
  if (!headshotUrl) return null;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
      <img
        src={headshotUrl}
        alt={`${teamAbbr} player headshot`}
        data-testid="homepage-story-image"
        loading="eager"
        decoding="async"
        onError={onHeadshotError}
        style={{ height: "108%", width: "auto", maxWidth: "68%", objectFit: "contain", objectPosition: "bottom right", filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.55))" }}
      />
    </div>
  );
}

/** Player headshot over the oversized team watermark badge. Used when a headshot
 *  resolved but no jersey number is available. */
export function WatermarkLogoVisual({ teamAbbr, headshotUrl, onHeadshotError, sport }: StoryVisualTreatmentProps) {
  return (
    <div className="sports-story-image-slot" data-slot="watermark" style={rootStyle}>
      <WatermarkBadge abbr={teamAbbr} sport={sport} />
      <HeadshotLayer headshotUrl={headshotUrl} onHeadshotError={onHeadshotError} teamAbbr={teamAbbr} />
    </div>
  );
}

/** WatermarkLogoVisual plus the jersey-number treatment: a huge/faint number
 *  backdrop and a small position/number chip. Only used when a jersey is present. */
export function JerseyNumberVisual({ teamAbbr, headshotUrl, onHeadshotError, jersey, position, sport }: StoryVisualTreatmentProps) {
  const colors = getTeamColors(teamAbbr, sport);
  const chipLabel = position ? `#${jersey} · ${position}` : `#${jersey}`;
  return (
    <div className="sports-story-image-slot" data-slot="jersey" style={rootStyle}>
      <WatermarkBadge abbr={teamAbbr} sport={sport} />
      {/* Huge faint jersey number, matching the Barlow Condensed sizing family used
          by .sports-story-visual-copy strong. */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-2%",
          bottom: "-16%",
          fontFamily: "'Barlow Condensed', var(--font-cond, sans-serif)",
          fontSize: "13rem",
          fontWeight: 850,
          lineHeight: 1,
          letterSpacing: "-0.04em",
          color: colors.secondary,
          opacity: 0.14,
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {jersey}
      </span>
      <HeadshotLayer headshotUrl={headshotUrl} onHeadshotError={onHeadshotError} teamAbbr={teamAbbr} />
      <span
        style={{
          position: "absolute",
          left: 12,
          bottom: 12,
          zIndex: 1,
          display: "inline-flex",
          alignItems: "center",
          padding: "2px 8px",
          borderRadius: 3,
          background: `${colors.primary}CC`,
          border: `1px solid ${colors.secondary}66`,
          fontFamily: "'Barlow Condensed', var(--font-cond, sans-serif)",
          fontSize: "0.78rem",
          fontWeight: 800,
          letterSpacing: "0.06em",
          color: "#FFFFFF",
          textShadow: "0 1px 2px rgba(0,0,0,0.55)",
        }}
      >
        {chipLabel}
      </span>
    </div>
  );
}

/** Diagonal two-team split field, each half in its own team's colors, with both
 *  abbreviation badges and a "VS" divider. No photo dependency. */
export function MatchupSplitVisual({ teamAbbr, opponentAbbr, sport }: StoryVisualTreatmentProps) {
  const home = getTeamColors(teamAbbr, sport);
  const away = getTeamColors(opponentAbbr ?? teamAbbr, sport);
  return (
    <div className="sports-story-image-slot" data-slot="matchup" style={rootStyle}>
      {/* Left half — primary team */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          clipPath: "polygon(0 0, 58% 0, 42% 100%, 0 100%)",
          background: `linear-gradient(135deg, ${home.primary}F2, ${home.primary}99)`,
        }}
      />
      {/* Right half — opponent */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          clipPath: "polygon(58% 0, 100% 0, 100% 100%, 42% 100%)",
          background: `linear-gradient(135deg, ${away.primary}99, ${away.primary}F2)`,
        }}
      />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12%" }}>
        <div style={{ opacity: 0.9 }}>
          <TeamLogoImg abbr={teamAbbr} sport={sport} size={72} />
        </div>
        <span
          aria-hidden="true"
          style={{
            fontFamily: "'Barlow Condensed', var(--font-cond, sans-serif)",
            fontSize: "1.5rem",
            fontWeight: 850,
            letterSpacing: "0.04em",
            color: "#FFFFFF",
            textShadow: "0 1px 4px rgba(0,0,0,0.6)",
          }}
        >
          VS
        </span>
        {opponentAbbr ? (
          <div style={{ opacity: 0.9 }}>
            <TeamLogoImg abbr={opponentAbbr} sport={sport} size={72} />
          </div>
        ) : <span />}
      </div>
    </div>
  );
}
