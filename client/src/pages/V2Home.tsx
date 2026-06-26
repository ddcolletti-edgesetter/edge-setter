import V2Shell, { SportBadge, useShellTheme } from "../components/V2Shell";
import { Link } from "wouter";
import { NBA_SIGNALS, MLB_SIGNALS, NBA_TONIGHT, TOOLS } from "../data/v2MockData";
import { useAllSignals } from "../hooks/useSignals";
import { scoreAndRankSignals, type SignalScore, type UrgencyLabel } from "../lib/signalScorer";
import {
  PlayerAvatar, TeamLogo, GameCard, FeaturedEdgeCard,
  VerdictBadge, TypeChip, ConfidenceBar, T, VERDICT_COLORS, getTeamColors,
} from "../components/v2/SportVisuals";
import { ArrowRight, Zap } from "lucide-react";

/* ── League logo URLs with fallback abbreviation ── */
const LEAGUE_LOGOS: Record<string, { src: string; abbr: string; color: string }> = {
  NBA: { src: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png", abbr: "NBA", color: T.gold },
  MLB: { src: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png", abbr: "MLB", color: T.cyan },
  NFL: { src: "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png", abbr: "NFL", color: T.orange },
  CFB: { src: "https://a.espncdn.com/i/teamlogos/leagues/500/ncaa.png", abbr: "CFB", color: T.green },
};

/* League logo badge — standalone, sized for context */
function LeagueLogo({ league, size = 28 }: { league: string; size?: number }) {
  const meta = LEAGUE_LOGOS[league];
  if (!meta) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: size, height: size, borderRadius: 4, flexShrink: 0,
      background: `${meta.color}18`, border: `1px solid ${meta.color}44`,
      overflow: "hidden",
    }}>
      <img
        src={meta.src}
        alt={meta.abbr}
        width={size - 6}
        height={size - 6}
        style={{ objectFit: "contain" }}
        onError={e => {
          const el = e.currentTarget as HTMLImageElement;
          el.style.display = "none";
          const parent = el.parentElement;
          if (parent) {
            parent.textContent = meta.abbr.slice(0, 1);
            Object.assign(parent.style, {
              fontSize: `${Math.round(size * 0.46)}px`,
              fontWeight: "700",
              color: meta.color,
              fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
              letterSpacing: "0",
            });
          }
        }}
      />
    </span>
  );
}

/* ── Board card with visual treatment ── */
function BoardCard({
  sport, label, description, href, status, primary, signalCount, color, accentBg, league, surfaceBg, borderMuted, textColor, textMutedColor,
}: {
  sport: string; label: string; description: string; href: string;
  status: "LIVE" | "ACTIVE" | "BUILDING" | "OFFSEASON" | "COMING SOON";
  primary?: boolean; signalCount?: number; color: string; accentBg?: string; league?: string;
  surfaceBg?: string; borderMuted?: string; textColor?: string; textMutedColor?: string;
}) {
  const disabled = status === "COMING SOON" || status === "OFFSEASON";
  const cardBg = surfaceBg ?? T.surface1;
  const borderInactive = borderMuted ?? "rgba(255,255,255,0.08)";
  const labelColor = textColor ?? T.text;
  const bodyColor = textMutedColor ?? T.textMuted;

  return (
    <Link href={disabled ? "#" : href}>
      <div
        data-testid={`board-card-${sport.toLowerCase()}`}
        style={{
          border: primary ? `1px solid rgba(245,184,65,0.45)` : `1px solid ${borderInactive}`,
          borderRadius: 5, overflow: "hidden",
          background: primary
            ? `linear-gradient(135deg, rgba(245,184,65,0.08) 0%, ${cardBg} 60%)`
            : cardBg,
          cursor: disabled ? "default" : "pointer",
          transition: "border-color 0.15s, transform 0.12s",
          position: "relative",
          opacity: disabled ? 0.55 : 1,
        }}
        onMouseEnter={e => { if (!disabled) { const el = e.currentTarget as HTMLDivElement; el.style.transform = "translateY(-2px)"; el.style.borderColor = primary ? "rgba(245,184,65,0.65)" : "rgba(245,184,65,0.28)"; } }}
        onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.transform = "translateY(0)"; el.style.borderColor = primary ? "rgba(245,184,65,0.45)" : borderInactive; }}
      >
        {primary && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: T.gold }} />}

        {/* Visual band — taller, logo in own lane */}
        <div style={{
          height: 68, background: accentBg ?? `rgba(245,184,65,0.03)`,
          borderBottom: `1px solid rgba(255,255,255,0.05)`,
          display: "flex", alignItems: "center", padding: "0 18px", gap: 12,
          position: "relative", overflow: "hidden",
        }}>
          {/* Background glow */}
          {!disabled && (
            <div style={{
              position: "absolute", right: 0, top: 0, bottom: 0, width: "50%",
              background: `linear-gradient(90deg, transparent, ${color}11)`,
            }} />
          )}
          {/* Sport abbr giant watermark */}
          <div style={{
            position: "absolute", right: 14, bottom: -6,
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 56, fontWeight: 900, color: `${color}15`, letterSpacing: "-0.04em", lineHeight: 1,
            userSelect: "none",
          }}>{sport}</div>

          {/* League logo — own visual lane */}
          {league && (
            <div style={{
              width: 40, height: 40, borderRadius: 5, flexShrink: 0,
              background: `${color}18`, border: `1px solid ${color}44`,
              display: "flex", alignItems: "center", justifyContent: "center",
              position: "relative", zIndex: 1,
            }}>
              <img
                src={LEAGUE_LOGOS[league]?.src}
                alt={league}
                width={28}
                height={28}
                style={{ objectFit: "contain" }}
                onError={e => {
                  const el = e.currentTarget as HTMLImageElement;
                  el.style.display = "none";
                  const parent = el.parentElement;
                  if (parent) {
                    parent.textContent = league.slice(0, 1);
                    Object.assign(parent.style, {
                      fontSize: "16px", fontWeight: "800", color,
                      fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                    });
                  }
                }}
              />
            </div>
          )}

          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 30, fontWeight: 900, color, letterSpacing: "-0.02em", lineHeight: 1,
            }}>{sport}</div>
            <SportBadge status={status} />
          </div>
        </div>

        <div style={{ padding: "18px 18px 20px" }}>
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 20, fontWeight: 700, color: labelColor, marginBottom: 8,
          }}>{label}</div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 17, color: bodyColor, letterSpacing: "0.02em", lineHeight: 1.55, marginBottom: 16,
          }}>{description}</div>
          {!disabled && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {signalCount != null && (
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 15, color: T.textFaint, letterSpacing: "0.06em",
                }}>{signalCount} signals</span>
              )}
              <span style={{
                display: "flex", alignItems: "center", gap: 4, marginLeft: "auto",
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 15, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                color: primary ? T.gold : T.textMuted,
              }}>
                Open Board <ArrowRight size={12} />
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

/* ── Urgency label colors ── */
const URGENCY_COLORS_FEED: Record<UrgencyLabel, string> = { LIVE: T.danger, URGENT: T.orange, WATCH: T.gold, NOTE: T.textFaint };

/* ── Signal feed row ── */
function FeedRow({ sig, feedBorder, darkMode }: { sig: typeof NBA_SIGNALS[0] & { _score?: SignalScore }; feedBorder: string; darkMode: boolean }) {
  const sportColor = sig.sport === "NBA" ? T.gold : T.cyan;
  const textColor = darkMode ? T.text : "#1A1712";
  const textFaintColor = darkMode ? T.textFaint : "#64748B";
  return (
    <div
      style={{
        display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 18px",
        borderBottom: `1px solid ${feedBorder}`,
        transition: "background 0.12s", cursor: "pointer",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(245,184,65,0.03)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
    >
      {/* Sport accent bar */}
      <div style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: sportColor, flexShrink: 0, marginTop: 2 }} />

      {/* League logo — own column */}
      <LeagueLogo league={sig.sport} size={24} />

      {/* Avatar or logo */}
      {sig.player
        ? <PlayerAvatar name={sig.player} team={sig.team} size={36} />
        : <TeamLogo abbr={sig.team} size={36} />
      }

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: sportColor, textTransform: "uppercase",
          }}>{sig.sport}</span>
          <TypeChip type={sig.type} />
          <span style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 13, color: textFaintColor,
          }}>{sig.timestamp}</span>
        </div>
        <div style={{ fontSize: 16, color: textColor, fontWeight: 500, lineHeight: 1.45, marginBottom: 5 }}>
          {sig.headline}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <VerdictBadge verdict={sig.verdict} />
          <span style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 14, color: textFaintColor,
          }}>{sig.confidence}% conf · {sig.sources} src{sig.confirmationStrength === "consensus" ? " ✓" : sig.confirmationStrength === "corroborated" ? " ◎" : ""}</span>
          {sig.bettingRelevance && <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: darkMode ? T.gold : "#F5B841", background: darkMode ? "rgba(245,184,65,0.10)" : "rgba(245,184,65,0.15)", borderRadius: 3, padding: "1px 6px" }}>Bet</span>}
          {sig.fantasyRelevance && <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: darkMode ? T.cyan : "#2A6980", background: darkMode ? "rgba(0,183,255,0.10)" : "rgba(0,183,255,0.15)", borderRadius: 3, padding: "1px 6px" }}>DFS</span>}
          {sig._score && sig._score.urgencyLabel !== "NOTE" && (
            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: "0.10em", textTransform: "uppercase", color: URGENCY_COLORS_FEED[sig._score.urgencyLabel], background: `${URGENCY_COLORS_FEED[sig._score.urgencyLabel]}18`, borderRadius: 3, padding: "1px 6px", border: `1px solid ${URGENCY_COLORS_FEED[sig._score.urgencyLabel]}40` }}>{sig._score.urgencyLabel}</span>
          )}
          {sig._score && (
            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: darkMode ? T.textFaint : "#64748B", fontVariantNumeric: "tabular-nums" }}>{sig._score.totalScore}/100</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Inner component — can call useShellTheme inside ThemeCtx.Provider ── */
function V2HomeInner() {
  const darkMode = useShellTheme();

  // Light-mode aware tokens
  const cardSurface      = darkMode ? T.surface1  : "#FFFFFF";
  const cardBorderMuted  = darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.10)";
  const heroBg           = darkMode
    ? `linear-gradient(135deg, rgba(245,184,65,0.04) 0%, transparent 50%)`
    : `linear-gradient(135deg, rgba(245,184,65,0.06) 0%, transparent 50%)`;
  const goldDimTH        = darkMode ? T.goldDim : "rgba(245,184,65,0.25)";
  const textTH           = darkMode ? T.text    : "#1A1712";
  const textMutedTH      = darkMode ? T.textMuted : "#94A3B8";
  const textFaintTH      = darkMode ? T.textFaint : "#64748B";
  const feedBorder       = darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)";
  const surfaceMini      = darkMode ? T.surface1 : "#FFFFFF";

  // Live combined feed — falls back to mocks if API unavailable
  const { signals: allLiveSignals, isLive: feedIsLive } = useAllSignals(NBA_SIGNALS, MLB_SIGNALS);
  const topSignals = allLiveSignals
    .filter(s => s.confidence >= 60 || (s as any)._live)
    .sort((a, b) => ((b as any)._score?.totalScore ?? b.confidence) - ((a as any)._score?.totalScore ?? a.confidence))
    .slice(0, 9);
  const featuredNBA = (allLiveSignals.find(s => s.sport === "NBA" && (s as any)._live && s.confidence >= 70)
    ?? allLiveSignals.find(s => s.sport === "NBA")
    ?? null) as typeof NBA_SIGNALS[0] | null;

  return (
    <>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      <div style={{ maxWidth: 1440, margin: "0 auto", paddingBottom: 48 }}>

        {/* ─── Above-the-fold hero strip ─── */}
        <section style={{
          borderBottom: `1px solid ${goldDimTH}`,
          background: heroBg,
          padding: "28px 32px",
        }}>
          <div style={{ display: "flex", gap: 28, alignItems: "flex-start", flexWrap: "wrap" }}>

            {/* Left — command center text */}
            <div style={{ flex: "1 0 340px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.green, display: "inline-block", animation: "pulse 1.8s infinite" }} />
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 13, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.green,
                }}>Intelligence Terminal · Live</span>
              </div>
              <h1 style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 38, fontWeight: 700, color: textTH,
                margin: "0 0 16px", lineHeight: 1.16, letterSpacing: "-0.02em",
              }}>
                Sports Intelligence<br />
                <span style={{ color: T.gold }}>Research Workspace</span>
              </h1>

              {/* What Edge Setter is — positioning block */}
              <div style={{ marginBottom: 22, maxWidth: 480 }}>
                <div style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
                  color: T.gold, marginBottom: 7,
                }}>What Edge Setter is</div>
                <p style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 17, color: textMutedTH, margin: 0,
                  lineHeight: 1.55, letterSpacing: "0.02em",
                }}>
                  A multi‑sport intelligence terminal that surfaces high‑conviction signals — with confidence scores, context, and market‑aware edges — so serious bettors and fantasy players can act before the rest of the market catches up.
                </p>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link href="/nba">
                  <button data-testid="cta-open-nba" style={{
                    background: T.gold, color: T.bg, border: "none", borderRadius: 3,
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 14, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
                    padding: "12px 26px", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                    boxShadow: `0 4px 20px rgba(245,184,65,0.3)`,
                  }}>
                    Open NBA Board <ArrowRight size={13} />
                  </button>
                </Link>
                <Link href="/tools">
                  <button style={{
                    background: "transparent", color: darkMode ? T.text : "#1A1712",
                    border: `1px solid rgba(245,184,65,0.28)`, borderRadius: 3,
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 14, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
                    padding: "12px 24px", cursor: "pointer",
                  }}>Explore Tools</button>
                </Link>
              </div>

              {/* Sport status strip — larger logos, clearer lane */}
              <div style={{ display: "flex", gap: 16, marginTop: 24, flexWrap: "wrap" }}>
                {[
                  { sport: "NBA", status: "LIVE" as const, color: T.green },
                  { sport: "MLB", status: "ACTIVE" as const, color: T.cyan },
                  { sport: "NFL", status: "ACTIVE" as const, color: T.cyan },
                  { sport: "CFB", status: "ACTIVE" as const, color: T.cyan },
                ].map(({ sport, status, color }) => (
                  <div key={sport} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 10px 6px 6px",
                    background: darkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
                    border: `1px solid ${darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
                    borderRadius: 4,
                  }}>
                    <LeagueLogo league={sport} size={32} />
                    <span style={{
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 15, fontWeight: 700, color: textFaintTH, letterSpacing: "0.08em", textTransform: "uppercase",
                    }}>{sport}</span>
                    <SportBadge status={status} />
                  </div>
                ))}
              </div>
            </div>

            {/* Right — tonight's marquee game + featured edge */}
            <div style={{ flex: "0 0 460px", display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Marquee game */}
              <div>
                <div style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 13, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
                  color: textFaintTH, marginBottom: 8, display: "flex", alignItems: "center", gap: 6,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, display: "inline-block", animation: "pulse 1.8s infinite" }} />
                  Marquee Tonight · NBA Playoffs
                </div>
                <GameCard
                  away={NBA_TONIGHT[0].away}
                  home={NBA_TONIGHT[0].home}
                  time={NBA_TONIGHT[0].time}
                  series={NBA_TONIGHT[0].seriesRecord}
                  spread={NBA_TONIGHT[0].spread}
                  total={NBA_TONIGHT[0].total}
                />
              </div>
              {/* Top featured edge mini — only shown when live data exists */}
              {featuredNBA && (
                <div style={{
                  background: surfaceMini, border: `1px solid rgba(245,184,65,0.2)`,
                  borderRadius: 4, padding: "14px 16px",
                  borderLeft: `3px solid ${T.gold}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <Zap size={12} style={{ color: T.gold }} />
                    <span style={{
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.gold,
                    }}>Top Edge Right Now</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <PlayerAvatar name={featuredNBA.player ?? ""} team={featuredNBA.team} size={40} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, color: darkMode ? T.text : "#1A1712", fontWeight: 600, lineHeight: 1.4, marginBottom: 6 }}>
                        {featuredNBA.headline}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <VerdictBadge verdict={featuredNBA.verdict} />
                        <span style={{
                          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                          fontSize: 14, color: T.gold, fontWeight: 700,
                        }}>{featuredNBA.confidence}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ─── Main grid ─── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 0 }} className="v2-main-grid">

          {/* Left column */}
          <div style={{ borderRight: `1px solid ${goldDimTH}` }}>

            {/* Board cards */}
            <section style={{ padding: "28px 32px 0" }}>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 13, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
                color: textFaintTH, marginBottom: 16,
              }}>Boards</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
                <BoardCard
                  sport="NBA" label="NBA Board"
                  description="Playoffs live. Injury flags, context movement, matchup context, rotation intel."
                  href="/nba" status="LIVE" primary signalCount={allLiveSignals.filter(s => s.sport === "NBA").length || undefined}
                  color={T.gold} league="NBA"
                  accentBg="linear-gradient(135deg, rgba(245,184,65,0.08) 0%, rgba(85,37,131,0.1) 100%)"
                  surfaceBg={cardSurface} borderMuted={cardBorderMuted}
                  textColor={textTH} textMutedColor={textMutedTH}
                />
                <BoardCard
                  sport="MLB" label="MLB Board"
                  description="Regular season active. Pitcher news, lineup movement, team trends."
                  href="/mlb" status="ACTIVE" signalCount={allLiveSignals.filter(s => s.sport === "MLB").length || undefined}
                  color={T.cyan} league="MLB"
                  accentBg="linear-gradient(135deg, rgba(0,183,255,0.08) 0%, rgba(0,42,98,0.1) 100%)"
                  surfaceBg={cardSurface} borderMuted={cardBorderMuted}
                  textColor={textTH} textMutedColor={textMutedTH}
                />
                <BoardCard
                  sport="NFL" label="NFL Board"
                  description="Active board. Injuries, depth chart movement, line shifts, and matchup intel — every week."
                  href="/nfl" status="ACTIVE" league="NFL"
                  color={T.orange}
                  accentBg="linear-gradient(135deg, rgba(255,138,0,0.07) 0%, rgba(30,20,10,0.1) 100%)"
                  surfaceBg={cardSurface} borderMuted={cardBorderMuted}
                  textColor={textTH} textMutedColor={textMutedTH}
                />
                <BoardCard
                  sport="CFB" label="CFB Board"
                  description="Active board. Transfer intel, QB battles, source pressure, and coaching/scheme context."
                  href="/cfb" status="ACTIVE" league="CFB"
                  color={T.green}
                  accentBg="linear-gradient(135deg, rgba(0,230,118,0.07) 0%, rgba(0,30,15,0.1) 100%)"
                  surfaceBg={cardSurface} borderMuted={cardBorderMuted}
                  textColor={textTH} textMutedColor={textMutedTH}
                />
              </div>
            </section>

            {/* Live signal feed */}
            <section style={{ marginTop: 32 }}>
              <div style={{
                padding: "0 32px 14px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, display: "inline-block", animation: "pulse 1.8s infinite" }} />
                  <span style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 13, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: textFaintTH,
                  }}>Live Signal Feed</span>
                </div>
                <Link href="/nba">
                  <span style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 14, fontWeight: 700, letterSpacing: "0.1em", color: T.gold,
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                  }}>All NBA <ArrowRight size={11} /></span>
                </Link>
              </div>
              <div style={{ borderTop: `1px solid ${feedBorder}`, borderBottom: `1px solid ${feedBorder}` }}>
                {topSignals.length > 0
                  ? topSignals.map(sig => <FeedRow key={sig.id} sig={sig} feedBorder={feedBorder} darkMode={darkMode} />)
                  : (
                    <div style={{
                      padding: "32px 18px", textAlign: "center",
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 15, color: textFaintTH, letterSpacing: "0.06em",
                    }}>
                      No signals published yet — pipeline is building coverage.
                    </div>
                  )
                }
              </div>
            </section>
          </div>

          {/* Right column */}
          <div>
            {/* Tonight's slate */}
            <div style={{ padding: "28px 20px 0" }}>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
                color: textFaintTH, marginBottom: 12,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, display: "inline-block" }} />
                Tonight's Slate
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {NBA_TONIGHT.map(g => (
                  <GameCard
                    key={g.id}
                    away={g.away} home={g.home}
                    time={g.time} series={g.seriesRecord}
                    spread={g.spread} total={g.total}
                    compact
                  />
                ))}
              </div>
            </div>

            {/* Tools preview */}
            <div style={{ padding: "24px 20px 0" }}>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
                color: textFaintTH, marginBottom: 12,
              }}>Tools</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {TOOLS.slice(0, 5).map(tool => {
                  const statusColor = tool.status === "Live" ? T.green : tool.status === "Beta" ? T.gold : T.textFaint;
                  return (
                    <Link key={tool.id} href={tool.href}>
                      <div
                        data-testid={`tool-preview-${tool.id}`}
                        style={{
                          padding: "10px 12px", borderRadius: 4,
                          background: surfaceMini, border: `1px solid ${darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)"}`,
                          cursor: "pointer", display: "flex", alignItems: "center", gap: 9,
                          transition: "border-color 0.12s, transform 0.1s",
                        }}
                        onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = "rgba(245,184,65,0.25)"; el.style.transform = "translateX(2px)"; }}
                        onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)"; el.style.transform = "translateX(0)"; }}
                      >
                        <span style={{ fontSize: 16 }}>{tool.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: darkMode ? T.text : "#1A1712", marginBottom: 1 }}>{tool.name}</div>
                          <div style={{
                            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                            fontSize: 13, color: textFaintTH, letterSpacing: "0.04em",
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>{tool.sport.join(" · ")}</div>
                        </div>
                        <span style={{
                          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                          fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                          color: statusColor, flexShrink: 0,
                        }}>{tool.status}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
              <Link href="/tools">
                <div style={{
                  marginTop: 8, padding: "9px 12px",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 14, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                  color: textFaintTH, cursor: "pointer",
                  border: `1px solid ${darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)"}`, borderRadius: 4,
                }}>All Tools <ArrowRight size={11} /></div>
              </Link>
            </div>

            {/* MLB mini */}
            <div style={{ padding: "24px 20px 0" }}>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
                color: textFaintTH, marginBottom: 12,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.cyan, display: "inline-block" }} />
                MLB Signals
              </div>
              <div style={{
                background: surfaceMini, border: `1px solid ${darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)"}`,
                borderRadius: 4, overflow: "hidden",
              }}>
                {(allLiveSignals.filter(s => s.sport === "MLB").length > 0 ? allLiveSignals.filter(s => s.sport === "MLB") : MLB_SIGNALS).slice(0, 3).map(sig => (
                  <div key={sig.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px",
                    borderBottom: `1px solid ${feedBorder}`,
                  }}>
                    <div style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: T.cyan, flexShrink: 0 }} />
                    <TeamLogo abbr={sig.team} size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, color: darkMode ? T.text : "#1A1712", fontWeight: 500, lineHeight: 1.4, marginBottom: 4 }}>
                        {sig.headline}
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <TypeChip type={sig.type} />
                        <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 14, color: textFaintTH }}>
                          {sig.confidence}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                <div style={{ padding: "9px 14px", borderTop: `1px solid ${feedBorder}` }}>
                  <Link href="/mlb">
                    <span style={{
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 14, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                      color: T.cyan, cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                    }}>Open MLB Board <ArrowRight size={11} /></span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Coverage notice */}
            <div style={{ margin: "20px 20px 0", padding: "10px 14px", background: "rgba(245,184,65,0.03)", border: `1px solid rgba(245,184,65,0.1)`, borderRadius: 4 }}>
              <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 13, color: textFaintTH, lineHeight: 1.5 }}>
                <strong style={{ color: T.gold }}>LIMITED COVERAGE</strong> — Some markets use monitored context until live feed coverage is available.
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .v2-main-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
}

export default function V2Home() {
  return (
    <V2Shell>
      <V2HomeInner />
    </V2Shell>
  );
}

