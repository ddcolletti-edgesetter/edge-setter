/**
 * Edge Setter v2 — Sport Visual Component System
 *
 * Image strategy:
 *   - PlayerHeadshot: real ESPN CDN <img> with onError → PlayerAvatar SVG fallback
 *   - TeamLogoImg:    real ESPN CDN <img> with onError → TeamLogo SVG badge fallback
 *   - All image URLs are centralized in PLAYER_HEADSHOTS / TEAM_LOGO_URLS maps
 *   - Swap in live URLs simply by updating those maps — no component changes required
 */

/* ─────────────────────────────────────────────
   Design tokens
───────────────────────────────────────────── */
export const T = {
  bg:         "#0A0B0D",
  surface1:   "#111317",
  surface2:   "#16191E",
  surface3:   "#1B1F25",
  gold:       "#CAA85A",
  goldBright: "#D8B86A",
  goldDim:    "rgba(202,168,90,0.18)",
  text:       "#F3EFE6",
  textMuted:  "#B7AFA0",
  textFaint:  "#7E776A",
  green:      "#4CAF82",
  orange:     "#D98A42",
  cyan:       "#4AA8C8",
  danger:     "#D94B4B",
  border:     "rgba(255,255,255,0.07)",
};

/* ─────────────────────────────────────────────
   Team color map
───────────────────────────────────────────── */
export const TEAM_COLORS: Record<string, { primary: string; secondary: string }> = {
  // NBA
  LAL: { primary: "#552583", secondary: "#FDB927" },
  GSW: { primary: "#1D428A", secondary: "#FFC72C" },
  BOS: { primary: "#007A33", secondary: "#FFFFFF" },
  MIA: { primary: "#98002E", secondary: "#F9A01B" },
  DEN: { primary: "#0E2240", secondary: "#FEC524" },
  MIN: { primary: "#0C2340", secondary: "#236192" },
  OKC: { primary: "#007AC1", secondary: "#EF3B24" },
  DAL: { primary: "#00538C", secondary: "#B8C4CA" },
  NYK: { primary: "#006BB6", secondary: "#F58426" },
  PHI: { primary: "#006BB6", secondary: "#ED174C" },
  MIL: { primary: "#00471B", secondary: "#EEE1C6" },
  IND: { primary: "#002D62", secondary: "#FDBB30" },
  MEM: { primary: "#5D76A9", secondary: "#12173F" },
  SAS: { primary: "#C4CED4", secondary: "#000000" },
  // MLB
  NYY: { primary: "#132448", secondary: "#C4CED4" },
  LAD: { primary: "#005A9C", secondary: "#EF3E42" },
  ATL: { primary: "#CE1141", secondary: "#13274F" },
  BAL: { primary: "#DF4601", secondary: "#000000" },
  CHC: { primary: "#0E3386", secondary: "#CC3433" },
  HOU: { primary: "#002D62", secondary: "#EB6E1F" },
  NYM: { primary: "#002D72", secondary: "#FF5910" },
  // NFL
  KC:  { primary: "#E31837", secondary: "#FFB612" },
  SF:  { primary: "#AA0000", secondary: "#B3995D" },
  BUF: { primary: "#00338D", secondary: "#C60C30" },
  // PHI already exists (NBA 76ers) — NFL Eagles same abbr, use existing entry
  // DAL already exists (NBA Mavericks) — keep as-is, both are blue variants
  BAL_NFL: { primary: "#241773", secondary: "#9E7C0C" }, // key unused (BAL=MLB Orioles)
  MIA_NFL: { primary: "#008E97", secondary: "#FC4C02" }, // key unused (MIA=NBA Heat)
  DET: { primary: "#0076B6", secondary: "#B0B7BC" },
  GB:  { primary: "#203731", secondary: "#FFB612" },
  LAR: { primary: "#003594", secondary: "#FFA300" },
  CIN: { primary: "#FB4F14", secondary: "#000000" },
  NE:  { primary: "#002244", secondary: "#C60C30" },
  NYG: { primary: "#0B2265", secondary: "#A71930" },
  LV:  { primary: "#000000", secondary: "#A5ACAF" },
  // CFB
  BAMA: { primary: "#9E1B32", secondary: "#FFFFFF" },
  UGA:  { primary: "#BA0C2F", secondary: "#000000" },
  OHIO: { primary: "#BB0000", secondary: "#666666" },
  MICH: { primary: "#00274C", secondary: "#FFCB05" },
  TX:   { primary: "#BF5700", secondary: "#FFFFFF" },
  LSU:  { primary: "#461D7C", secondary: "#FDD023" },
  USC:  { primary: "#990000", secondary: "#FFC72C" },
  ND:   { primary: "#0C2340", secondary: "#C99700" },
  FSU:  { primary: "#782F40", secondary: "#CEB888" },
  CLEM: { primary: "#F66733", secondary: "#522D80" },
  UNC:  { primary: "#7BAFD4", secondary: "#13294B" },
  PENN: { primary: "#041E42", secondary: "#FFFFFF" },
  // Fallback
  DEFAULT: { primary: "#2A2D34", secondary: "#CAA85A" },
};

export function getTeamColors(abbr: string) {
  return TEAM_COLORS[abbr?.toUpperCase()] ?? TEAM_COLORS.DEFAULT;
}

/* ─────────────────────────────────────────────
   Image URL maps — swap in live URLs here
   ESPN CDN pattern (works cross-origin):
     Headshots: https://a.espncdn.com/i/headshots/{sport}/players/full/{espnId}.png
     Logos:     https://a.espncdn.com/i/teamlogos/{sport}/500/{abbr}.png
───────────────────────────────────────────── */

/** Player headshot URLs keyed by player name (exact match from v2MockData) */
export const PLAYER_HEADSHOTS: Record<string, string> = {
  // NBA
  "Anthony Davis":         "https://a.espncdn.com/i/headshots/nba/players/full/6583.png",
  "Jaylen Brown":          "https://a.espncdn.com/i/headshots/nba/players/full/6474.png",
  "Nikola Jokic":          "https://a.espncdn.com/i/headshots/nba/players/full/3112335.png",
  "Stephen Curry":         "https://a.espncdn.com/i/headshots/nba/players/full/3975.png",
  "Giannis Antetokounmpo": "https://a.espncdn.com/i/headshots/nba/players/full/3032977.png",
  "Ja Morant":             "https://a.espncdn.com/i/headshots/nba/players/full/4395628.png",
  "Draymond Green":        "https://a.espncdn.com/i/headshots/nba/players/full/2528210.png",
  "Luka Dončić":           "https://a.espncdn.com/i/headshots/nba/players/full/4066648.png",
  "Victor Wembanyama":     "https://a.espncdn.com/i/headshots/nba/players/full/4432816.png",
  // MLB
  "Gerrit Cole":           "https://a.espncdn.com/i/headshots/mlb/players/full/32859.png",
  "Shohei Ohtani":         "https://a.espncdn.com/i/headshots/mlb/players/full/39832.png",
  "Spencer Strider":       "", // On IL — no active ESPN photo; use SVG fallback
  "Cody Bellinger":        "https://a.espncdn.com/i/headshots/mlb/players/full/31867.png",
  "Marcus Stroman":        "https://a.espncdn.com/i/headshots/mlb/players/full/32105.png",
  // Abbreviated aliases used in MLBBoard PITCHER_STATUS
  "G. Cole":               "https://a.espncdn.com/i/headshots/mlb/players/full/32859.png",
  "S. Strider":            "", // On IL — no active ESPN photo
  "Y. Yamamoto":           "https://a.espncdn.com/i/headshots/mlb/players/full/4433254.png",
  "M. Fried":              "https://a.espncdn.com/i/headshots/mlb/players/full/32694.png",
  "M. Stroman":            "https://a.espncdn.com/i/headshots/mlb/players/full/32105.png",
};

export function getPlayerHeadshotUrl(name: string): string {
  return PLAYER_HEADSHOTS[name] ?? "";
}

/**
 * Team logo URLs by abbreviation.
 * ESPN CDN serves logos at /i/teamlogos/{sport}/500/{abbr}.png (lowercase abbr).
 * Passes CORS. Falls back to TeamLogo SVG if image fails.
 */
export const TEAM_LOGO_URLS: Record<string, string> = {
  // NBA
  LAL: "https://a.espncdn.com/i/teamlogos/nba/500/lal.png",
  GSW: "https://a.espncdn.com/i/teamlogos/nba/500/gs.png",
  BOS: "https://a.espncdn.com/i/teamlogos/nba/500/bos.png",
  MIA: "https://a.espncdn.com/i/teamlogos/nba/500/mia.png",
  DEN: "https://a.espncdn.com/i/teamlogos/nba/500/den.png",
  MIN: "https://a.espncdn.com/i/teamlogos/nba/500/min.png",
  OKC: "https://a.espncdn.com/i/teamlogos/nba/500/okc.png",
  DAL: "https://a.espncdn.com/i/teamlogos/nba/500/dal.png",
  NYK: "https://a.espncdn.com/i/teamlogos/nba/500/ny.png",
  PHI: "https://a.espncdn.com/i/teamlogos/nba/500/phi.png",
  MIL: "https://a.espncdn.com/i/teamlogos/nba/500/mil.png",
  IND: "https://a.espncdn.com/i/teamlogos/nba/500/ind.png",
  MEM: "https://a.espncdn.com/i/teamlogos/nba/500/mem.png",
  SAS: "https://a.espncdn.com/i/teamlogos/nba/500/sa.png",
  // MLB
  NYY: "https://a.espncdn.com/i/teamlogos/mlb/500/nyy.png",
  LAD: "https://a.espncdn.com/i/teamlogos/mlb/500/lad.png",
  ATL: "https://a.espncdn.com/i/teamlogos/mlb/500/atl.png",
  BAL: "https://a.espncdn.com/i/teamlogos/mlb/500/bal.png",
  CHC: "https://a.espncdn.com/i/teamlogos/mlb/500/chc.png",
  HOU: "https://a.espncdn.com/i/teamlogos/mlb/500/hou.png",
  NYM: "https://a.espncdn.com/i/teamlogos/mlb/500/nym.png",
};

export function getTeamLogoUrl(abbr: string): string {
  return TEAM_LOGO_URLS[abbr?.toUpperCase()] ?? "";
}

/* ─────────────────────────────────────────────
   TeamLogo — SVG badge fallback (used internally)
───────────────────────────────────────────── */
interface TeamLogoProps {
  abbr: string;
  size?: number;
  shape?: "circle" | "shield" | "square";
}

export function TeamLogo({ abbr, size = 32, shape = "circle" }: TeamLogoProps) {
  const colors = getTeamColors(abbr);
  const r = shape === "circle" ? "50%" : shape === "shield" ? "4px 4px 8px 8px" : "4px";
  const fontSize = size * 0.38;

  return (
    <div
      style={{
        width: size, height: size, borderRadius: r,
        background: `linear-gradient(145deg, ${colors.primary}, ${colors.primary}CC)`,
        border: `1.5px solid ${colors.secondary}55`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
        boxShadow: `0 2px 8px ${colors.primary}66`,
      }}
    >
      <span style={{
        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
        fontSize, fontWeight: 800, color: colors.secondary,
        letterSpacing: "-0.01em", lineHeight: 1,
        textShadow: "0 1px 2px rgba(0,0,0,0.6)",
      }}>
        {abbr?.slice(0, 3).toUpperCase()}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   TeamLogoImg — real logo with SVG fallback
   Renders the ESPN CDN image if available;
   falls back to TeamLogo SVG badge on error.
───────────────────────────────────────────── */
interface TeamLogoImgProps {
  abbr: string;
  size?: number;
  shape?: "circle" | "shield" | "square";
  /** Override the image URL (for when you have a live URL not in the static map) */
  src?: string;
}

export function TeamLogoImg({ abbr, size = 32, shape = "circle", src }: TeamLogoImgProps) {
  const logoUrl = src ?? getTeamLogoUrl(abbr);
  const colors = getTeamColors(abbr);

  if (!logoUrl) {
    return <TeamLogo abbr={abbr} size={size} shape={shape} />;
  }

  const borderRadius = shape === "circle" ? "50%" : shape === "shield" ? "4px 4px 8px 8px" : "4px";

  return (
    <div style={{
      width: size, height: size, borderRadius,
      overflow: "hidden", flexShrink: 0, position: "relative",
      background: `${colors.primary}22`,
      border: `1px solid ${colors.secondary}22`,
      boxShadow: `0 2px 8px ${colors.primary}44`,
    }}>
      <img
        src={logoUrl}
        alt={abbr}
        width={size}
        height={size}
        style={{
          width: "100%", height: "100%", objectFit: "contain",
          display: "block",
        }}
        onError={(e) => {
          // On load failure: hide img, show SVG fallback via parent swap
          const target = e.currentTarget as HTMLImageElement;
          const parent = target.parentElement;
          if (parent) {
            parent.innerHTML = "";
            const span = document.createElement("span");
            span.style.cssText = `
              display:flex;align-items:center;justify-content:center;
              width:100%;height:100%;
              font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;
              font-size:${size * 0.38}px;font-weight:800;
              color:${colors.secondary};letter-spacing:-0.01em;
              text-shadow:0 1px 2px rgba(0,0,0,0.6);
            `;
            span.textContent = abbr?.slice(0, 3).toUpperCase();
            parent.appendChild(span);
          }
        }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────
   TeamLogoPair — two overlapping logos (matchup)
───────────────────────────────────────────── */
export function TeamLogoPair({ away, home, size = 28, useImg = true }: { away: string; home: string; size?: number; useImg?: boolean }) {
  const Logo = useImg ? TeamLogoImg : TeamLogo;
  return (
    <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
      <div style={{ zIndex: 2 }}><Logo abbr={away} size={size} /></div>
      <div style={{ zIndex: 1, marginLeft: -size * 0.2 }}><Logo abbr={home} size={size} /></div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   PlayerAvatar — SVG silhouette fallback
───────────────────────────────────────────── */
type SportPosition = "guard" | "forward" | "center" | "pitcher" | "hitter" | "generic";

function getPositionFromType(type: string): SportPosition {
  if (type === "pitcher") return "pitcher";
  if (type === "hitter") return "hitter";
  if (type === "guard") return "guard";
  if (type === "forward" || type === "center") return type as SportPosition;
  return "guard";
}

const SILHOUETTES: Record<SportPosition, string> = {
  guard:   "M12,8 C13.7,8 15,6.7 15,5 C15,3.3 13.7,2 12,2 C10.3,2 9,3.3 9,5 C9,6.7 10.3,8 12,8 Z M8,10 C7.4,10 7,10.6 7,11.5 L7,18 L9,18 L9,22 L15,22 L15,18 L17,18 L17,11.5 C17,10.6 16.6,10 16,10 Z",
  forward: "M12,8 C13.7,8 15,6.7 15,5 C15,3.3 13.7,2 12,2 C10.3,2 9,3.3 9,5 C9,6.7 10.3,8 12,8 Z M7,11 L7,19 L9.5,19 L9.5,22 L14.5,22 L14.5,19 L17,19 L17,11 L14,10 L12,11 L10,10 Z",
  center:  "M12,7.5 C13.4,7.5 14.5,6.4 14.5,5 C14.5,3.6 13.4,2.5 12,2.5 C10.6,2.5 9.5,3.6 9.5,5 C9.5,6.4 10.6,7.5 12,7.5 Z M6,10.5 L6,20 L9,20 L9,22.5 L15,22.5 L15,20 L18,20 L18,10.5 Z",
  pitcher: "M12,7 C13.5,7 14.7,5.8 14.7,4.3 C14.7,2.8 13.5,1.7 12,1.7 C10.5,1.7 9.3,2.8 9.3,4.3 C9.3,5.8 10.5,7 12,7 Z M8,9.5 L8,16 L10,16 L10,22 L14,22 L14,16 L16,16 L16,9.5 L14,9 L17.5,6.5 L12,9 L6.5,6.5 L10,9 Z",
  hitter:  "M12,7 C13.5,7 14.7,5.8 14.7,4.3 C14.7,2.8 13.5,1.7 12,1.7 C10.5,1.7 9.3,2.8 9.3,4.3 C9.3,5.8 10.5,7 12,7 Z M9,9.5 L9,14 L6,14 L6,17 L9,17 L9,22 L15,22 L15,17 L18,17 L18,14 L15,14 L15,9.5 Z",
  generic: "M12,8 C13.7,8 15,6.7 15,5 C15,3.3 13.7,2 12,2 C10.3,2 9,3.3 9,5 C9,6.7 10.3,8 12,8 Z M8.5,10 L8.5,22 L11,22 L11,16 L13,16 L13,22 L15.5,22 L15.5,10 Z",
};

interface PlayerAvatarProps {
  name: string;
  team: string;
  position?: SportPosition | string;
  size?: number;
  showName?: boolean;
  showTeam?: boolean;
}

export function PlayerAvatar({ name, team, position = "generic", size = 40, showName = false, showTeam = false }: PlayerAvatarProps) {
  const colors = getTeamColors(team);
  const pos = getPositionFromType(position) as SportPosition;
  const silPath = SILHOUETTES[pos] ?? SILHOUETTES.generic;
  const initials = name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() ?? "??";
  const innerSize = size * 0.72;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: `radial-gradient(circle at 40% 35%, ${colors.primary}EE, ${colors.primary}88)`,
        border: `2px solid ${colors.secondary}44`,
        boxShadow: `0 0 0 1px ${colors.primary}66, 0 3px 10px rgba(0,0,0,0.5)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative", overflow: "hidden", flexShrink: 0,
      }}>
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: "40%",
          background: `linear-gradient(to top, ${colors.primary}99, transparent)`,
        }} />
        <svg width={innerSize} height={innerSize} viewBox="0 0 24 24"
          style={{ position: "absolute", bottom: -innerSize * 0.1 }}>
          <path d={silPath} fill={colors.secondary} opacity={0.75} />
        </svg>
        <span style={{
          position: "absolute", bottom: 2,
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: size * 0.22, fontWeight: 800, color: `${colors.secondary}CC`,
          letterSpacing: "0.04em", lineHeight: 1,
        }}>{initials}</span>
      </div>
      {showName && (
        <div style={{
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: size * 0.22, fontWeight: 700, color: T.text, letterSpacing: "0.02em",
          textAlign: "center", lineHeight: 1.2, maxWidth: size + 16, wordBreak: "break-word",
        }}>
          {name?.split(" ").slice(-1)[0]}
        </div>
      )}
      {showTeam && (
        <div style={{
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: size * 0.18, fontWeight: 700, color: T.textFaint, letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}>
          {team}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   PlayerHeadshot — real ESPN headshot with fallback
   Uses <img> from ESPN CDN; falls back to PlayerAvatar SVG on error.
   Set `size` for the container. Image is cropped to circle/square.
───────────────────────────────────────────── */
interface PlayerHeadshotProps {
  name: string;
  team: string;
  position?: SportPosition | string;
  size?: number;
  shape?: "circle" | "square";
  showName?: boolean;
  showTeam?: boolean;
  /** Override the headshot URL (for live wiring) */
  src?: string;
}

export function PlayerHeadshot({
  name, team, position = "generic", size = 48,
  shape = "circle", showName = false, showTeam = false, src,
}: PlayerHeadshotProps) {
  const headshotUrl = src ?? getPlayerHeadshotUrl(name);
  const colors = getTeamColors(team);
  const borderRadius = shape === "circle" ? "50%" : "6px";

  if (!headshotUrl) {
    return <PlayerAvatar name={name} team={team} position={position} size={size} showName={showName} showTeam={showTeam} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div
        data-testid={`headshot-${name.replace(/\s+/g, "-").toLowerCase()}`}
        style={{
          width: size, height: size,
          borderRadius,
          overflow: "hidden",
          border: `2px solid ${colors.secondary}44`,
          boxShadow: `0 0 0 1px ${colors.primary}55, 0 3px 12px rgba(0,0,0,0.55)`,
          background: `${colors.primary}33`,
          flexShrink: 0, position: "relative",
        }}
      >
        <img
          src={headshotUrl}
          alt={name}
          style={{
            width: "100%", height: "100%",
            objectFit: "cover",
            objectPosition: "top center",
            display: "block",
          }}
          onError={(e) => {
            // Swap to SVG fallback on load failure
            const img = e.currentTarget as HTMLImageElement;
            img.style.display = "none";
            const parent = img.parentElement;
            if (parent && !parent.querySelector(".headshot-fallback")) {
              const fallback = document.createElement("div");
              fallback.className = "headshot-fallback";
              fallback.style.cssText = `
                position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
                background:radial-gradient(circle at 40% 35%,${colors.primary}EE,${colors.primary}88);
                font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;
                font-size:${size * 0.32}px;font-weight:800;color:${colors.secondary}CC;
              `;
              const initials = name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
              fallback.textContent = initials;
              parent.appendChild(fallback);
            }
          }}
        />
      </div>
      {showName && (
        <div style={{
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: size * 0.22, fontWeight: 700, color: T.text, letterSpacing: "0.02em",
          textAlign: "center", lineHeight: 1.2, maxWidth: size + 20, wordBreak: "break-word",
        }}>
          {name?.split(" ").slice(-1)[0]}
        </div>
      )}
      {showTeam && (
        <div style={{
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: size * 0.18, fontWeight: 700, color: T.textFaint,
          letterSpacing: "0.1em", textTransform: "uppercase",
        }}>
          {team}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   ConfidenceBar — horizontal fill bar
───────────────────────────────────────────── */
export function ConfidenceBar({ value, width = 60, height = 4 }: { value: number; width?: number | string; height?: number }) {
  const color = value >= 85 ? T.gold : value >= 70 ? T.goldBright : value >= 55 ? T.orange : T.textFaint;
  return (
    <div style={{ width, height, background: "rgba(255,255,255,0.08)", borderRadius: height }}>
      <div style={{
        width: `${Math.min(value, 100)}%`, height: "100%",
        background: color, borderRadius: height,
        transition: "width 0.4s ease",
      }} />
    </div>
  );
}

/* ─────────────────────────────────────────────
   VerdictBadge — colored verdict chip
───────────────────────────────────────────── */
export const VERDICT_COLORS: Record<string, string> = {
  confirmed:    T.green,
  likely:       T.gold,
  rumor:        T.orange,
  contradicted: T.danger,
  review:       T.textFaint,
};

export function VerdictBadge({ verdict }: { verdict: string }) {
  const color = VERDICT_COLORS[verdict] ?? T.textFaint;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 7px", borderRadius: 2,
      background: `${color}18`, border: `1px solid ${color}44`,
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color,
    }}>
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: color, display: "inline-block" }} />
      {verdict}
    </span>
  );
}

/* ─────────────────────────────────────────────
   GameCard — rich matchup card with real logos
───────────────────────────────────────────── */
interface GameCardProps {
  away: string;
  home: string;
  time: string;
  series?: string;
  spread: string;
  total: string;
  status?: "upcoming" | "live" | "final";
  onClick?: () => void;
  compact?: boolean;
}

export function GameCard({ away, home, time, series, spread, total, status = "upcoming", onClick, compact = false }: GameCardProps) {
  const awayColors = getTeamColors(away);
  const homeColors = getTeamColors(home);
  const isLive = status === "live";

  return (
    <div
      onClick={onClick}
      data-testid={`game-card-${away}-${home}`}
      style={{
        background: T.surface2,
        border: `1px solid ${isLive ? "rgba(202,168,90,0.35)" : T.border}`,
        borderRadius: 5, overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 0.15s, transform 0.12s",
        position: "relative", flexShrink: 0,
      }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = "rgba(202,168,90,0.4)"; el.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = isLive ? "rgba(202,168,90,0.35)" : T.border; el.style.transform = "translateY(0)"; }}
    >
      {/* Top gradient bar — real team colors */}
      <div style={{
        height: 3,
        background: `linear-gradient(90deg, ${awayColors.secondary}BB, ${awayColors.primary}66 40%, ${homeColors.primary}66 60%, ${homeColors.secondary}BB)`,
      }} />

      <div style={{ padding: compact ? "10px 12px" : "14px 16px" }}>
        {/* Matchup row with real logos */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          {/* Away */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
            <TeamLogoImg abbr={away} size={compact ? 28 : 34} shape="circle" />
            <div>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: compact ? 15 : 18, fontWeight: 800, color: T.text, letterSpacing: "-0.01em",
              }}>{away}</div>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 11, color: T.textFaint, letterSpacing: "0.08em", textTransform: "uppercase",
              }}>Away</div>
            </div>
          </div>

          {/* VS divider */}
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 11, fontWeight: 700, color: T.textFaint, letterSpacing: "0.12em",
            }}>@</div>
            {isLive && (
              <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "center", marginTop: 3 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, display: "inline-block" }} />
                <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.green, fontWeight: 700, letterSpacing: "0.1em" }}>LIVE</span>
              </div>
            )}
          </div>

          {/* Home */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: compact ? 15 : 18, fontWeight: 800, color: T.text, letterSpacing: "-0.01em",
              }}>{home}</div>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 11, color: T.textFaint, letterSpacing: "0.08em", textTransform: "uppercase",
              }}>Home</div>
            </div>
            <TeamLogoImg abbr={home} size={compact ? 28 : 34} shape="circle" />
          </div>
        </div>

        {/* Series info */}
        {series && (
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, color: T.gold, fontWeight: 700, letterSpacing: "0.1em",
            textAlign: "center", marginBottom: 8,
            background: "rgba(202,168,90,0.06)", borderRadius: 2, padding: "2px 6px",
          }}>
            {series}
          </div>
        )}

        {/* Odds row */}
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { label: "Spread", val: spread, color: T.gold, bg: "rgba(202,168,90,0.06)", border: "rgba(202,168,90,0.14)" },
            { label: "Total",  val: `O/U ${total}`, color: T.text, bg: "rgba(255,255,255,0.04)", border: T.border },
            { label: "Time",   val: time, color: T.textMuted, bg: "rgba(255,255,255,0.03)", border: "transparent" },
          ].map(s => (
            <div key={s.label} style={{
              flex: 1, textAlign: "center", padding: "5px 8px",
              background: s.bg, borderRadius: 3,
              border: `1px solid ${s.border}`,
            }}>
              <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: compact ? 11 : 13, fontWeight: 700, color: s.color, letterSpacing: "0.04em" }}>{s.val}</div>
              <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textFaint, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   FeaturedEdgeCard — marquee signal module with real headshot
───────────────────────────────────────────── */
interface FeaturedEdgeProps {
  signal: {
    headline: string;
    detail: string;
    action_takeaway: string;
    verdict: string;
    confidence: number;
    sources: number;
    type: string;
    player?: string;
    team: string;
    opponent?: string;
    timestamp: string;
    tags: string[];
  };
  sport?: "NBA" | "MLB";
}

export function FeaturedEdgeCard({ signal, sport = "NBA" }: FeaturedEdgeProps) {
  const teamColors = getTeamColors(signal.team);
  const vColor = VERDICT_COLORS[signal.verdict] ?? T.textFaint;
  const accentColor = sport === "NBA" ? T.gold : T.cyan;

  return (
    <div
      data-testid="featured-edge-card"
      style={{
        position: "relative", overflow: "hidden", borderRadius: 5,
        background: T.surface2,
        border: `1px solid rgba(202,168,90,0.28)`,
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
      }}
    >
      {/* Background gradient */}
      <div style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(135deg, ${teamColors.primary}22 0%, transparent 60%, ${teamColors.secondary}11 100%)`,
        pointerEvents: "none",
      }} />

      {/* Top accent bar */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${accentColor}, ${accentColor}44)` }} />

      <div style={{ display: "flex", gap: 0 }}>
        {/* Left — visual panel with real headshot */}
        <div style={{
          width: 130, flexShrink: 0, padding: "20px 0 20px 20px",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
          background: `linear-gradient(180deg, ${teamColors.primary}44, ${teamColors.primary}22)`,
          borderRight: `1px solid rgba(255,255,255,0.06)`,
        }}>
          {signal.player ? (
            <PlayerHeadshot
              name={signal.player}
              team={signal.team}
              size={72}
              shape="circle"
            />
          ) : (
            <TeamLogoImg abbr={signal.team} size={72} shape="shield" />
          )}
          {/* Matchup logos */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <TeamLogoImg abbr={signal.team} size={18} />
            {signal.opponent && (
              <><span style={{ color: T.textFaint, fontSize: 11 }}>@</span>
              <TeamLogoImg abbr={signal.opponent} size={18} /></>
            )}
          </div>
        </div>

        {/* Right — content */}
        <div style={{ flex: 1, padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <div style={{
              padding: "2px 8px", background: `${accentColor}18`, border: `1px solid ${accentColor}44`,
              borderRadius: 2, fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: accentColor,
            }}>⚡ Featured Edge</div>
            <VerdictBadge verdict={signal.verdict} />
            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: T.textFaint }}>{signal.timestamp}</span>
          </div>

          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 18, fontWeight: 700, color: T.text, lineHeight: 1.35,
            marginBottom: 8, letterSpacing: "-0.01em",
          }}>{signal.headline}</div>

          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 14, color: T.textMuted, lineHeight: 1.55, letterSpacing: "0.03em", marginBottom: 12,
          }}>{signal.detail.slice(0, 140)}…</div>

          <div style={{
            background: "rgba(202,168,90,0.07)", border: `1px solid rgba(202,168,90,0.2)`,
            borderRadius: 3, padding: "9px 12px", marginBottom: 12,
          }}>
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.gold, marginRight: 8,
            }}>Action →</span>
            <span style={{ fontSize: 14, color: T.text, fontWeight: 500 }}>{signal.action_takeaway.slice(0, 100)}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 20, fontWeight: 800, color: vColor, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                {signal.confidence}%
              </span>
              <div>
                <ConfidenceBar value={signal.confidence} width={80} height={5} />
                <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textFaint, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 3 }}>Confidence</div>
              </div>
            </div>
            <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textFaint, letterSpacing: "0.06em" }}>
              {signal.sources} sources · {signal.tags.slice(0, 2).join(" · ")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SportTypeChip — signal type colored label
───────────────────────────────────────────── */
export const TYPE_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  injury:       { bg: "rgba(217,75,75,0.12)",   color: "#D94B4B", label: "INJURY"   },
  line_move:    { bg: "rgba(76,175,130,0.1)",    color: "#4CAF82", label: "LINE MOVE"},
  matchup_edge: { bg: "rgba(202,168,90,0.1)",    color: "#CAA85A", label: "MATCHUP"  },
  rotation:     { bg: "rgba(74,168,200,0.1)",    color: "#4AA8C8", label: "ROTATION" },
  prop:         { bg: "rgba(217,138,66,0.12)",   color: "#D98A42", label: "PROP"     },
  news:         { bg: "rgba(183,175,160,0.1)",   color: "#B7AFA0", label: "NEWS"     },
  trend:        { bg: "rgba(74,168,200,0.08)",   color: "#4AA8C8", label: "TREND"    },
  lineup:       { bg: "rgba(74,168,200,0.08)",   color: "#4AA8C8", label: "LINEUP"   },
};

export function TypeChip({ type }: { type: string }) {
  const s = TYPE_COLORS[type] ?? { bg: "rgba(255,255,255,0.06)", color: T.textFaint, label: type.toUpperCase() };
  return (
    <span style={{
      display: "inline-flex", padding: "2px 6px", borderRadius: 2,
      background: s.bg, color: s.color,
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>{s.label}</span>
  );
}

/* ─────────────────────────────────────────────
   MatchupCard — premium game card with big team logos,
   team-color gradient header, series state, and signal count
   Used on board slate strips as a step up from GameCard.
───────────────────────────────────────────── */
interface MatchupCardProps {
  away: string;
  home: string;
  time: string;
  spread: string;
  total: string;
  series?: string;        // "LAL leads 3-2"
  signalCount?: number;
  status?: "upcoming" | "live" | "final";
  accentColor?: string;   // sport accent — gold=NBA, cyan=MLB
  onClick?: () => void;
}

export function MatchupCard({
  away, home, time, spread, total,
  series, signalCount, status = "upcoming",
  accentColor = T.gold, onClick,
}: MatchupCardProps) {
  const awayC = getTeamColors(away);
  const homeC = getTeamColors(home);
  const isLive = status === "live";

  return (
    <div
      onClick={onClick}
      data-testid={`matchup-card-${away}-${home}`}
      style={{
        background: T.surface2, borderRadius: 6, overflow: "hidden",
        border: `1px solid ${isLive ? "rgba(202,168,90,0.45)" : T.border}`,
        boxShadow: isLive ? `0 0 0 1px rgba(202,168,90,0.15), 0 4px 20px rgba(0,0,0,0.45)` : "0 2px 12px rgba(0,0,0,0.35)",
        cursor: onClick ? "pointer" : "default",
        transition: "transform 0.12s, box-shadow 0.12s, border-color 0.15s",
        flexShrink: 0, position: "relative",
      }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.transform = "translateY(-2px)"; el.style.boxShadow = "0 8px 28px rgba(0,0,0,0.5)"; }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.transform = "translateY(0)"; el.style.boxShadow = isLive ? `0 0 0 1px rgba(202,168,90,0.15), 0 4px 20px rgba(0,0,0,0.45)` : "0 2px 12px rgba(0,0,0,0.35)"; }}
    >
      {/* Dual-team gradient header */}
      <div style={{
        height: 52, position: "relative", overflow: "hidden",
        background: `linear-gradient(90deg, ${awayC.primary}DD 0%, ${awayC.primary}55 45%, ${homeC.primary}55 55%, ${homeC.primary}DD 100%)`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 14px",
      }}>
        {/* Away logo + abbr */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <TeamLogoImg abbr={away} size={32} shape="circle" />
          <span style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 18, fontWeight: 900, color: T.text, letterSpacing: "-0.02em",
            textShadow: "0 1px 4px rgba(0,0,0,0.7)",
          }}>{away}</span>
        </div>

        {/* Center */}
        <div style={{ textAlign: "center" }}>
          {isLive ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.green, display: "inline-block", boxShadow: `0 0 6px ${T.green}` }} />
              <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.green, fontWeight: 800, letterSpacing: "0.14em" }}>LIVE</span>
            </div>
          ) : (
            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 14, fontWeight: 700, color: T.textFaint, letterSpacing: "0.06em" }}>@</span>
          )}
        </div>

        {/* Home logo + abbr */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexDirection: "row-reverse" }}>
          <TeamLogoImg abbr={home} size={32} shape="circle" />
          <span style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 18, fontWeight: 900, color: T.text, letterSpacing: "-0.02em",
            textShadow: "0 1px 4px rgba(0,0,0,0.7)",
          }}>{home}</span>
        </div>
      </div>

      {/* Bottom color bar */}
      <div style={{ height: 2, background: `linear-gradient(90deg, ${awayC.secondary}99, ${homeC.secondary}99)` }} />

      {/* Body */}
      <div style={{ padding: "10px 12px" }}>
        {/* Series banner */}
        {series && (
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
            color: accentColor, textAlign: "center", marginBottom: 8,
            background: `${accentColor}0F`, borderRadius: 2, padding: "2px 8px",
          }}>{series}</div>
        )}

        {/* Odds row */}
        <div style={{ display: "flex", gap: 5 }}>
          {[
            { label: "SPREAD", val: spread, color: T.gold, bg: "rgba(202,168,90,0.07)" },
            { label: "TOTAL",  val: `O/U ${total}`, color: T.text, bg: "rgba(255,255,255,0.04)" },
            { label: "TIME",   val: time, color: T.textMuted, bg: "rgba(255,255,255,0.03)" },
          ].map(s => (
            <div key={s.label} style={{
              flex: 1, textAlign: "center", padding: "5px 6px",
              background: s.bg, borderRadius: 3,
              border: `1px solid rgba(255,255,255,0.06)`,
            }}>
              <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, fontWeight: 700, color: s.color, letterSpacing: "0.02em", lineHeight: 1.1 }}>{s.val}</div>
              <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Signal count pill */}
        {signalCount !== undefined && signalCount > 0 && (
          <div style={{ marginTop: 7, textAlign: "center" }}>
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 11, fontWeight: 700, color: accentColor, letterSpacing: "0.1em",
              background: `${accentColor}10`, padding: "2px 8px", borderRadius: 2,
            }}>⚡ {signalCount} signal{signalCount !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   IntelCard — polished intelligence card panel
   Used in right rails, detail modal, sidebar modules.
   Supports player headshot OR team logo hero.
───────────────────────────────────────────── */
interface IntelCardProps {
  headline: string;
  detail: string;
  action?: string;
  verdict?: string;
  confidence?: number;
  sources?: number;
  player?: string;
  team: string;
  opponent?: string;
  timestamp?: string;
  tags?: string[];
  sport?: "NBA" | "MLB";
  accentColor?: string;
}

export function IntelCard({
  headline, detail, action, verdict, confidence, sources,
  player, team, opponent, timestamp, tags = [],
  sport = "NBA", accentColor,
}: IntelCardProps) {
  const teamColors = getTeamColors(team);
  const oppColors  = opponent ? getTeamColors(opponent) : null;
  const accent = accentColor ?? (sport === "NBA" ? T.gold : T.cyan);
  const vColor = verdict ? (VERDICT_COLORS[verdict] ?? T.textFaint) : null;

  return (
    <div style={{
      background: T.surface1, borderRadius: 6, overflow: "hidden",
      border: `1px solid rgba(255,255,255,0.07)`,
      boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
    }}>
      {/* Hero band */}
      <div style={{
        position: "relative", overflow: "hidden",
        background: `linear-gradient(135deg, ${teamColors.primary}CC 0%, ${teamColors.primary}44 50%, ${oppColors ? oppColors.primary + "33" : "transparent"} 100%)`,
        padding: "16px 16px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        {/* Ambient glow */}
        <div style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(ellipse at 85% 50%, ${teamColors.secondary}18, transparent 65%)`,
          pointerEvents: "none",
        }} />
        {/* Accent stripe */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${accent}, transparent)` }} />

        <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative", zIndex: 1 }}>
          {/* Hero visual */}
          {player ? (
            <PlayerHeadshot name={player} team={team} size={52} shape="circle" />
          ) : (
            <div style={{ display: "flex", gap: -4 }}>
              <TeamLogoImg abbr={team} size={48} />
              {opponent && <div style={{ marginLeft: -10 }}><TeamLogoImg abbr={opponent} size={36} /></div>}
            </div>
          )}

          {/* Identity */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {player ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.2, marginBottom: 3 }}>{player}</div>
                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                  <TeamLogoImg abbr={team} size={14} />
                  <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textFaint, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    {team}{opponent ? ` vs ${opponent}` : ""}
                  </span>
                </div>
              </>
            ) : (
              <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                {team}{opponent ? ` @ ${opponent}` : ""}
              </div>
            )}
          </div>

          {/* Verdict badge */}
          {verdict && <VerdictBadge verdict={verdict} />}
        </div>
      </div>

      {/* Stats row */}
      {(confidence !== undefined || sources !== undefined) && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${(confidence !== undefined ? 1 : 0) + (sources !== undefined ? 1 : 0) + (verdict ? 1 : 0)}, 1fr)`, background: T.surface2, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          {verdict && vColor && (
            <div style={{ padding: "8px 0", textAlign: "center", borderRight: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: vColor, letterSpacing: "0.02em" }}>{verdict.toUpperCase()}</div>
              <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 1 }}>Verdict</div>
            </div>
          )}
          {confidence !== undefined && (
            <div style={{ padding: "8px 0", textAlign: "center", borderRight: sources !== undefined ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: confidence >= 80 ? T.gold : T.text, fontVariantNumeric: "tabular-nums" }}>{confidence}%</div>
              <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 1 }}>Confidence</div>
            </div>
          )}
          {sources !== undefined && (
            <div style={{ padding: "8px 0", textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{sources}</div>
              <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 1 }}>Sources</div>
            </div>
          )}
        </div>
      )}

      {/* Confidence bar */}
      {confidence !== undefined && (
        <div style={{ padding: "8px 14px 0" }}>
          <ConfidenceBar value={confidence} width="100%" height={5} />
        </div>
      )}

      {/* Content */}
      <div style={{ padding: "12px 14px 14px" }}>
        <div style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 14, fontWeight: 700, color: T.text, lineHeight: 1.4, marginBottom: 10,
        }}>{headline}</div>

        <div style={{
          fontSize: 13, color: T.textMuted, lineHeight: 1.65, marginBottom: 10,
        }}>{detail}</div>

        {action && (
          <div style={{
            background: `${accent}09`, border: `1px solid ${accent}25`,
            borderRadius: 4, padding: "9px 12px",
          }}>
            <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: accent, marginBottom: 4 }}>
              ⚡ Action Takeaway
            </div>
            <div style={{ fontSize: 13, color: T.text, lineHeight: 1.55, fontWeight: 500 }}>{action}</div>
          </div>
        )}

        {tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 10 }}>
            {tags.map(tag => (
              <span key={tag} style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                color: T.textFaint, padding: "2px 6px",
                background: "rgba(255,255,255,0.05)", borderRadius: 2,
              }}>{tag}</span>
            ))}
          </div>
        )}

        {timestamp && (
          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textFaint, marginTop: 10, letterSpacing: "0.06em" }}>{timestamp}</div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SignalRowVisual — compact visual identity block for signal table rows
   Renders player headshot + last name, or dual team logos
   for team-centric signals. Designed for 110px column.
───────────────────────────────────────────── */
interface SignalRowVisualProps {
  player?: string;
  team: string;
  opponent?: string;
  size?: number;
}

export function SignalRowVisual({ player, team, opponent, size = 28 }: SignalRowVisualProps) {
  if (player) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <PlayerHeadshot name={player} team={team} size={size} shape="circle" />
        <div>
          <div style={{ fontSize: 12, color: T.text, fontWeight: 600, lineHeight: 1.2 }}>
            {player.split(" ").slice(-1)[0]}
          </div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10, color: T.textFaint, letterSpacing: "0.08em", textTransform: "uppercase",
          }}>{team}</div>
        </div>
      </div>
    );
  }
  // Team matchup
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <TeamLogoImg abbr={team} size={size} />
      {opponent && (
        <>
          <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint }}>@</span>
          <TeamLogoImg abbr={opponent} size={size - 4} />
        </>
      )}
      {!opponent && (
        <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textMuted, fontWeight: 700, letterSpacing: "0.06em" }}>{team}</div>
      )}
    </div>
  );
}
