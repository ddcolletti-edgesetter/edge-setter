/**
 * Edge Setter v2 — Sport Visual Component System
 * Self-contained SVG-based components. No external image deps.
 * Swap src props for live assets when available.
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
  BOS: { primary: "#007A33", secondary: "#BA9653" },
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
  // Fallback
  DEFAULT: { primary: "#2A2D34", secondary: "#CAA85A" },
};

export function getTeamColors(abbr: string) {
  return TEAM_COLORS[abbr?.toUpperCase()] ?? TEAM_COLORS.DEFAULT;
}

/* ─────────────────────────────────────────────
   TeamLogo — compact badge with team initial
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
   TeamLogoPair — two overlapping logos (matchup)
───────────────────────────────────────────── */
export function TeamLogoPair({ away, home, size = 28 }: { away: string; home: string; size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: -size * 0.25, position: "relative" }}>
      <div style={{ zIndex: 2 }}><TeamLogo abbr={away} size={size} /></div>
      <div style={{ zIndex: 1, marginLeft: -size * 0.2 }}><TeamLogo abbr={home} size={size} /></div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   PlayerAvatar — position-silhouette SVG with team ring
───────────────────────────────────────────── */
type SportPosition = "guard" | "forward" | "center" | "pitcher" | "hitter" | "generic";

function getPositionFromType(type: string): SportPosition {
  if (type === "pitcher") return "pitcher";
  if (type === "hitter") return "hitter";
  if (type === "guard") return "guard";
  if (type === "forward" || type === "center") return type as SportPosition;
  return "guard";
}

// SVG silhouette paths for each position type
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
        {/* Gradient overlay at bottom */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: "40%",
          background: `linear-gradient(to top, ${colors.primary}99, transparent)`,
        }} />
        {/* SVG silhouette */}
        <svg
          width={innerSize} height={innerSize}
          viewBox="0 0 24 24"
          style={{ position: "absolute", bottom: -innerSize * 0.1 }}
        >
          <path d={silPath} fill={colors.secondary} opacity={0.75} />
        </svg>
        {/* Initials fallback text */}
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
   ConfidenceBar — horizontal fill bar
───────────────────────────────────────────── */
export function ConfidenceBar({ value, width = 60, height = 4 }: { value: number; width?: number; height?: number }) {
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
   VerdictPip — colored verdict badge
───────────────────────────────────────────── */
export const VERDICT_COLORS: Record<string, string> = {
  confirmed: T.green,
  likely:    T.gold,
  rumor:     T.orange,
  contradicted: T.danger,
  review:    T.textFaint,
};

export function VerdictBadge({ verdict }: { verdict: string }) {
  const color = VERDICT_COLORS[verdict] ?? T.textFaint;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 7px", borderRadius: 2,
      background: `${color}18`,
      border: `1px solid ${color}44`,
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
      color,
    }}>
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: color, display: "inline-block" }} />
      {verdict}
    </span>
  );
}

/* ─────────────────────────────────────────────
   GameCard — rich matchup card
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
        borderRadius: 5,
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 0.15s, transform 0.12s",
        position: "relative",
        flexShrink: 0,
      }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = "rgba(202,168,90,0.4)"; el.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = isLive ? "rgba(202,168,90,0.35)" : T.border; el.style.transform = "translateY(0)"; }}
    >
      {/* Top accent bar — team gradient */}
      <div style={{
        height: 3,
        background: `linear-gradient(90deg, ${awayColors.secondary}99, ${awayColors.primary}66 40%, ${homeColors.primary}66 60%, ${homeColors.secondary}99)`,
      }} />

      <div style={{ padding: compact ? "10px 12px" : "14px 16px" }}>
        {/* Matchup row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          {/* Away */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
            <TeamLogo abbr={away} size={compact ? 26 : 32} />
            <div>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: compact ? 15 : 18, fontWeight: 800, color: T.text, letterSpacing: "-0.01em",
              }}>{away}</div>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 9, color: T.textFaint, letterSpacing: "0.08em", textTransform: "uppercase",
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
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, display: "inline-block", animation: "pulse 1.5s infinite" }} />
                <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, color: T.green, fontWeight: 700, letterSpacing: "0.1em" }}>LIVE</span>
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
                fontSize: 9, color: T.textFaint, letterSpacing: "0.08em", textTransform: "uppercase",
              }}>Home</div>
            </div>
            <TeamLogo abbr={home} size={compact ? 26 : 32} />
          </div>
        </div>

        {/* Series info */}
        {series && (
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10, color: T.gold, fontWeight: 700, letterSpacing: "0.1em",
            textAlign: "center", marginBottom: 8,
            background: "rgba(202,168,90,0.06)", borderRadius: 2, padding: "2px 6px",
          }}>
            {series}
          </div>
        )}

        {/* Odds row */}
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{
            flex: 1, textAlign: "center", padding: "5px 8px",
            background: "rgba(202,168,90,0.06)", borderRadius: 3,
            border: "1px solid rgba(202,168,90,0.14)",
          }}>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: compact ? 12 : 13, fontWeight: 700, color: T.gold, letterSpacing: "0.04em",
            }}>{spread}</div>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 9, color: T.textFaint, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 1,
            }}>Spread</div>
          </div>
          <div style={{
            flex: 1, textAlign: "center", padding: "5px 8px",
            background: "rgba(255,255,255,0.04)", borderRadius: 3,
            border: T.border,
          }}>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: compact ? 12 : 13, fontWeight: 700, color: T.text, letterSpacing: "0.04em",
            }}>O/U {total}</div>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 9, color: T.textFaint, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 1,
            }}>Total</div>
          </div>
          <div style={{
            flex: 1, textAlign: "center", padding: "5px 8px",
            background: "rgba(255,255,255,0.03)", borderRadius: 3,
          }}>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: compact ? 11 : 12, fontWeight: 600, color: T.textMuted,
            }}>{time}</div>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 9, color: T.textFaint, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 1,
            }}>Time</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   FeaturedEdgeCard — marquee signal module
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
      {/* Background gradient layer */}
      <div style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(135deg, ${teamColors.primary}22 0%, transparent 60%, ${teamColors.secondary}11 100%)`,
        pointerEvents: "none",
      }} />

      {/* Top gold accent bar */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${accentColor}, ${accentColor}44)` }} />

      <div style={{ display: "flex", gap: 0 }}>
        {/* Left — visual panel */}
        <div style={{
          width: 120, flexShrink: 0, padding: "20px 0 20px 20px",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
          background: `linear-gradient(180deg, ${teamColors.primary}33, transparent)`,
          borderRight: `1px solid rgba(255,255,255,0.05)`,
        }}>
          {signal.player ? (
            <PlayerAvatar name={signal.player} team={signal.team} size={64} />
          ) : (
            <TeamLogo abbr={signal.team} size={64} shape="shield" />
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
            <TeamLogo abbr={signal.team} size={16} />
            {signal.opponent && <><span style={{ color: T.textFaint, fontSize: 11 }}>@</span><TeamLogo abbr={signal.opponent} size={16} /></>}
          </div>
        </div>

        {/* Right — content */}
        <div style={{ flex: 1, padding: "18px 20px" }}>
          {/* Header chips */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <div style={{
              padding: "2px 8px", background: `${accentColor}18`, border: `1px solid ${accentColor}44`,
              borderRadius: 2, fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: accentColor,
            }}>
              ⚡ Featured Edge
            </div>
            <VerdictBadge verdict={signal.verdict} />
            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint }}>{signal.timestamp}</span>
          </div>

          {/* Headline */}
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 16, fontWeight: 700, color: T.text, lineHeight: 1.35,
            marginBottom: 8, letterSpacing: "-0.01em",
          }}>
            {signal.headline}
          </div>

          {/* Detail snippet */}
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, color: T.textMuted, lineHeight: 1.55, letterSpacing: "0.03em",
            marginBottom: 12,
          }}>
            {signal.detail.slice(0, 140)}…
          </div>

          {/* Action takeaway */}
          <div style={{
            background: "rgba(202,168,90,0.07)", border: `1px solid rgba(202,168,90,0.2)`,
            borderRadius: 3, padding: "9px 12px", marginBottom: 12,
          }}>
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.gold,
              marginRight: 8,
            }}>Action →</span>
            <span style={{ fontSize: 12, color: T.text, fontWeight: 500 }}>{signal.action_takeaway.slice(0, 100)}</span>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", align: "center", gap: 6, flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 20, fontWeight: 800, color: vColor, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                  {signal.confidence}%
                </span>
                <div>
                  <ConfidenceBar value={signal.confidence} width={80} height={5} />
                  <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, color: T.textFaint, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 3 }}>Confidence</div>
                </div>
              </div>
            </div>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 11, color: T.textFaint, letterSpacing: "0.06em",
            }}>
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
      fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}
