/**
 * Edge Setter — Flagship Homepage
 * LFL-blend theme: four-sport chalk field background,
 * warm near-black, luxury gold, film grain (via V2Shell).
 * Structure preserved from Render v2 + energy from Manus lost version.
 */

import { useLocation } from "wouter";
import { useShellTheme } from "../components/V2Shell";
import {
  PlayerHeadshot, TeamLogoImg, TeamLogoPair, GameCard, FeaturedEdgeCard,
  VerdictBadge, TypeChip, ConfidenceBar,
  T, VERDICT_COLORS, getTeamColors,
} from "../components/v2/SportVisuals";
import { NBA_SIGNALS, NBA_TONIGHT, type V2Signal } from "../data/v2MockData";
import { Zap, ArrowRight, TrendingUp, Shield, BarChart3, ChevronRight } from "lucide-react";

/* ── Sport status config ── */
const SPORT_STATUS = [
  { label: "NBA", status: "LIVE",        color: "#C4A24A", dot: "#3EBA6A", href: "/v2/nba" },
  { label: "MLB", status: "ACTIVE",      color: "#4AA8C8", dot: "#4AA8C8", href: "/v2/mlb" },
  { label: "NFL", status: "ACTIVE",      color: "#3EBA6A", dot: "#3EBA6A", href: "/v2/nfl" },
  { label: "CFB", status: "ACTIVE",      color: "#9966CC", dot: "#9966CC", href: "/v2/cfb" },
] as const;

const HERO_SIGNAL = NBA_SIGNALS.find(s => s.confidence >= 84) ?? NBA_SIGNALS[0];
const TOP_SIGNALS = NBA_SIGNALS.slice(0, 4);

const MLB_GAMES = [
  { id: "m1", away: "HOU", home: "NYY", time: "1:05 PM ET",  spread: "NYY -115", total: "8" },
  { id: "m2", away: "LAD", home: "ATL", time: "4:10 PM ET",  spread: "ATL -108", total: "8.5" },
  { id: "m3", away: "CHC", home: "NYM", time: "7:10 PM ET",  spread: "NYM -112", total: "8" },
];

const FEATURE_PANELS = [
  {
    title: "NBA Intelligence Board",
    subtitle: "Playoffs live",
    sport: "NBA",
    body: "Real-time injury reports, line movement, rotation notes, and matchup edges — updated every 15 minutes.",
    cta: "Open NBA Board",
    href: "/v2/nba",
    accent: "#C4A24A",
    teams: ["LAL", "BOS", "DEN"],
    player: "Luka Dončić",
    playerTeam: "DAL",
    icon: <Zap size={13} />,
  },
  {
    title: "Tools Hub",
    subtitle: "Research suite",
    sport: "TOOLS",
    body: "Lineup optimizer, matchup breakdown, line-shopping alerts, and public vs. sharp money tracker.",
    cta: "Open Tools",
    href: "/v2/tools",
    accent: "#4AA8C8",
    teams: ["GSW", "MIA", "OKC"],
    player: "Nikola Jokic",
    playerTeam: "DEN",
    icon: <BarChart3 size={13} />,
  },
  {
    title: "MLB Board",
    subtitle: "Regular season",
    sport: "MLB",
    body: "Pitcher alerts, lineup movement, team trends, and sharp line tracking across all 30 teams.",
    cta: "Open MLB Board",
    href: "/v2/mlb",
    accent: "#4AA8C8",
    teams: ["NYY", "LAD", "ATL"],
    player: "Gerrit Cole",
    playerTeam: "NYY",
    icon: <TrendingUp size={13} />,
  },
] as const;

/* ─────────────────────────────────────────────
   FOUR-QUADRANT CHALK BACKGROUND
   Basketball court (NW), Baseball diamond (NE),
   Football field (SW), CFB field (SE).
   Each SVG is positioned as a background layer,
   unified by a radial vignette + film grain
   from V2Shell's global CSS.
─────────────────────────────────────────────── */
function HomepageChalkBg() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>

      {/* NW — Basketball court */}
      <div style={{
        position: "absolute", top: 0, left: 0, width: "58%", height: "58%",
        opacity: 0.048,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 500 380'%3E%3Crect fill='none' stroke='%23EDE5D4' stroke-width='2' stroke-dasharray='5,5' x='20' y='20' width='460' height='340' rx='4'/%3E%3Cellipse fill='none' stroke='%23EDE5D4' stroke-width='1.5' stroke-dasharray='4,6' cx='250' cy='190' rx='85' ry='85'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.5' stroke-dasharray='4,5' x1='250' y1='20' x2='250' y2='360'/%3E%3Crect fill='none' stroke='%23EDE5D4' stroke-width='1.5' stroke-dasharray='4,5' x='20' y='120' width='120' height='140'/%3E%3Crect fill='none' stroke='%23EDE5D4' stroke-width='1.5' stroke-dasharray='4,5' x='360' y='120' width='120' height='140'/%3E%3Cellipse fill='none' stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='3,6' cx='250' cy='190' rx='22' ry='22'/%3E%3Crect fill='none' stroke='%23EDE5D4' stroke-width='1' stroke-dasharray='3,5' x='20' y='155' width='44' height='70' rx='2'/%3E%3Crect fill='none' stroke='%23EDE5D4' stroke-width='1' stroke-dasharray='3,5' x='436' y='155' width='44' height='70' rx='2'/%3E%3C/svg%3E")`,
        backgroundSize: "cover",
      }} />

      {/* NE — Baseball diamond */}
      <div style={{
        position: "absolute", top: 0, right: 0, width: "58%", height: "58%",
        opacity: 0.04,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 500 440'%3E%3Cellipse fill='none' stroke='%23EDE5D4' stroke-width='1.8' stroke-dasharray='5,5' cx='250' cy='300' rx='210' ry='170'/%3E%3Cpolygon fill='none' stroke='%23EDE5D4' stroke-width='2' stroke-dasharray='5,4' points='250,80 420,250 250,420 80,250'/%3E%3Ccircle fill='%23EDE5D4' r='8' cx='250' cy='80' opacity='0.55'/%3E%3Ccircle fill='%23EDE5D4' r='8' cx='420' cy='250' opacity='0.55'/%3E%3Ccircle fill='%23EDE5D4' r='8' cx='250' cy='420' opacity='0.55'/%3E%3Ccircle fill='%23EDE5D4' r='8' cx='80' cy='250' opacity='0.55'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,4' x1='250' y1='420' x2='170' y2='500'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,4' x1='250' y1='420' x2='330' y2='500'/%3E%3Cellipse fill='none' stroke='%23EDE5D4' stroke-width='1' stroke-dasharray='3,6' cx='250' cy='420' rx='30' ry='15'/%3E%3C/svg%3E")`,
        backgroundSize: "cover",
      }} />

      {/* SW — Football field */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, width: "58%", height: "50%",
        opacity: 0.035,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 660 320'%3E%3Crect fill='none' stroke='%23EDE5D4' stroke-width='2' stroke-dasharray='5,5' x='20' y='20' width='620' height='280'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='81' y1='20' x2='81' y2='300'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='143' y1='20' x2='143' y2='300'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='205' y1='20' x2='205' y2='300'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='267' y1='20' x2='267' y2='300'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.8' stroke-dasharray='6,4' x1='330' y1='20' x2='330' y2='300'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='393' y1='20' x2='393' y2='300'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='455' y1='20' x2='455' y2='300'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='517' y1='20' x2='517' y2='300'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='579' y1='20' x2='579' y2='300'/%3E%3C/svg%3E")`,
        backgroundSize: "cover",
      }} />

      {/* SE — CFB field with C watermark */}
      <div style={{
        position: "absolute", bottom: 0, right: 0, width: "58%", height: "50%",
        opacity: 0.03,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 660 320'%3E%3Crect fill='none' stroke='%23EDE5D4' stroke-width='2' stroke-dasharray='5,5' x='20' y='20' width='620' height='280'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='81' y1='20' x2='81' y2='300'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='205' y1='20' x2='205' y2='300'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.8' stroke-dasharray='6,4' x1='330' y1='20' x2='330' y2='300'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='455' y1='20' x2='455' y2='300'/%3E%3Cline stroke='%23EDE5D4' stroke-width='1.2' stroke-dasharray='4,5' x1='579' y1='20' x2='579' y2='300'/%3E%3Ctext x='330' y='180' text-anchor='middle' font-family='serif' font-size='140' fill='%23EDE5D4' opacity='0.4' font-weight='bold'%3EC%3C/text%3E%3C/svg%3E")`,
        backgroundSize: "cover",
      }} />

      {/* Radial vignette — pulls all four into center darkness */}
      <div style={{
        position: "absolute", inset: 0,
        background: `
          radial-gradient(ellipse 65% 55% at 50% 50%, transparent 15%, rgba(12,11,9,0.72) 65%, rgba(12,11,9,0.97) 100%),
          radial-gradient(ellipse 35% 35% at 50% 50%, rgba(196,162,74,0.03) 0%, transparent 70%)
        `,
      }} />

      {/* Hairline gold cross — very subtle quadrant dividers */}
      <div style={{
        position: "absolute", inset: 0,
        background: `
          linear-gradient(90deg, transparent 49%, rgba(196,162,74,0.05) 49.5%, rgba(196,162,74,0.05) 50.5%, transparent 51%),
          linear-gradient(180deg, transparent 49%, rgba(196,162,74,0.05) 49.5%, rgba(196,162,74,0.05) 50.5%, transparent 51%)
        `,
      }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Main Component
═══════════════════════════════════════════════ */
export default function FlagshipHome() {
  const [, navigate] = useLocation();
  const darkMode = useShellTheme();

  const TH = {
    bg:        darkMode ? "#0C0B09"   : "#F2EDE4",
    surface1:  darkMode ? "#131110"   : "#FDFAF5",
    surface2:  darkMode ? "#1A1714"   : "#F5F0E8",
    goldDim:   darkMode ? "rgba(196,162,74,0.14)" : "rgba(196,162,74,0.22)",
    text:      darkMode ? "#EDE5D4"   : "#1A1610",
    textMuted: darkMode ? "#8A7A62"   : "#5A4E3C",
    textFaint: darkMode ? "#4A4235"   : "#8C7A62",
    border:    darkMode ? "rgba(196,162,74,0.12)" : "rgba(0,0,0,0.08)",
    gold:      "#C4A24A",
    goldBright:"#E0BB6A",
  };

  const heroColors = getTeamColors(HERO_SIGNAL.team);
  const oppColors  = HERO_SIGNAL.opponent ? getTeamColors(HERO_SIGNAL.opponent) : heroColors;
  const vColor     = VERDICT_COLORS[HERO_SIGNAL.verdict] ?? TH.textFaint;

  return (
    <div style={{
      minHeight: "100vh",
      background: TH.bg,
      color: TH.text,
      fontFamily: "'Barlow', 'Barlow Condensed', sans-serif",
      overflowX: "hidden",
      position: "relative",
    }}>

      <style>{`
        @keyframes navPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes heroFadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes tickerScroll { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        .flag-btn:hover { opacity: 0.88; transform: translateY(-1px); }
        .panel-card:hover { border-color: rgba(196,162,74,0.32) !important; transform: translateY(-2px); }
        .sig-ticker:hover { background: rgba(196,162,74,0.07) !important; border-color: rgba(196,162,74,0.28) !important; }
        @media (max-width: 768px) {
          .flag-hero-grid { grid-template-columns: 1fr !important; gap: 24px !important; padding: 32px 20px 28px !important; }
          .flag-hero-right { display: none !important; }
          .flag-hero-h1 { font-size: clamp(28px, 8vw, 44px) !important; }
          .flag-panel-grid { grid-template-columns: 1fr !important; }
          .flag-section-pad { padding: 20px !important; }
        }
      `}</style>

      {/* ── Four-quadrant chalk bg ── */}
      <HomepageChalkBg />

      {/* ══════════════════════════════════
          LIVE SIGNAL TICKER STRIP
          (Manus version had this — keeping it,
          moved to top for immediate energy)
      ══════════════════════════════════ */}
      <div style={{
        position: "relative", zIndex: 5,
        background: "rgba(10,9,7,0.94)",
        borderBottom: `1px solid ${TH.goldDim}`,
        overflow: "hidden",
        display: "flex", alignItems: "center",
        height: 36,
      }}>
        {/* Label */}
        <div style={{
          flexShrink: 0,
          display: "flex", alignItems: "center", gap: 6,
          padding: "0 14px",
          borderRight: `1px solid ${TH.goldDim}`,
          height: "100%",
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%", background: TH.gold,
            display: "inline-block", animation: "navPulse 2s ease-in-out infinite",
          }} />
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 9, fontWeight: 700, letterSpacing: "2px",
            color: TH.gold, textTransform: "uppercase",
          }}>Live Signals</span>
        </div>

        {/* Scrolling ticker */}
        <div style={{ overflow: "hidden", flex: 1 }}>
          <div style={{
            display: "flex", gap: 40,
            animation: "tickerScroll 30s linear infinite",
            whiteSpace: "nowrap", paddingLeft: 20,
          }}>
            {[...TOP_SIGNALS, ...TOP_SIGNALS].map((sig, i) => (
              <span
                key={i}
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 12, color: TH.textMuted,
                  display: "inline-flex", alignItems: "center", gap: 8,
                }}
              >
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: TH.gold, display: "inline-block" }} />
                <span style={{ fontWeight: 600, color: TH.text }}>{sig.player ?? sig.team}</span>
                {" — "}
                {sig.headline.slice(0, 60)}{sig.headline.length > 60 ? "…" : ""}
              </span>
            ))}
          </div>
        </div>

        {/* Agent status */}
        <div style={{
          flexShrink: 0, padding: "0 14px",
          borderLeft: `1px solid ${TH.goldDim}`,
          display: "flex", alignItems: "center", gap: 5, height: "100%",
        }}>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#3EBA6A", display: "inline-block", animation: "navPulse 1.8s ease-in-out infinite" }} />
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", color: "#3EBA6A", textTransform: "uppercase" }}>
            Agents Running — NBA &amp; MLB Live
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════
          HERO SECTION
      ══════════════════════════════════ */}
      <section style={{
        position: "relative", overflow: "hidden",
        minHeight: 520,
        borderBottom: `1px solid ${TH.border}`,
        zIndex: 2,
      }}>
        {/* Subtle team-color radial behind hero content */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `radial-gradient(ellipse 55% 70% at 72% 50%, ${heroColors.primary}1A, transparent 65%)`,
        }} />

        <div className="flag-hero-grid" style={{
          maxWidth: 1280, margin: "0 auto", padding: "56px 40px 48px",
          display: "grid", gridTemplateColumns: "1fr 360px",
          gap: 48, alignItems: "center", position: "relative", zIndex: 2,
        }}>

          {/* ── Left: hero copy + signal list ── */}
          <div style={{ animation: "heroFadeUp 0.55s ease both" }}>

            {/* Eyebrow */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "4px 10px", borderRadius: 2,
                background: "rgba(62,186,106,0.1)", border: "1px solid rgba(62,186,106,0.28)",
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#3EBA6A", display: "inline-block", animation: "navPulse 1.8s ease-in-out infinite", boxShadow: "0 0 6px #3EBA6A" }} />
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#3EBA6A" }}>
                  NBA Playoffs Live
                </span>
              </div>
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: TH.textFaint, letterSpacing: "0.08em" }}>
                {NBA_SIGNALS.length} signals · Updated every 15 min
              </span>
            </div>

            {/* Main headline — Bebas for impact */}
            <h1 className="flag-hero-h1" style={{
              fontFamily: "'Bebas Neue', 'Barlow Condensed', sans-serif",
              fontSize: "clamp(38px, 5vw, 62px)",
              fontWeight: 400, lineHeight: 0.95,
              color: TH.text, margin: "0 0 16px",
              letterSpacing: "2px",
            }}>
              THE MULTI-SPORT<br />
              <span style={{ color: TH.gold }}>INTELLIGENCE</span><br />
              TERMINAL
            </h1>

            <p style={{
              fontFamily: "'Barlow', sans-serif",
              fontSize: 16, color: TH.text, lineHeight: 1.65,
              margin: "0 0 28px", maxWidth: 500, opacity: 0.72,
              fontStyle: "italic", fontWeight: 300,
            }}>
              Injury signals, lineup changes, line moves, and scheme intel — verified by a Yuma-style consensus engine before the market moves.
            </p>

            {/* CTAs */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 32 }}>
              <button
                className="flag-btn"
                onClick={() => navigate("/v2/nba")}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "11px 22px", borderRadius: 2,
                  background: `linear-gradient(135deg, ${TH.gold}, #8A6A28)`,
                  border: "none", color: "#0C0B09",
                  fontFamily: "'Bebas Neue', 'Barlow Condensed', sans-serif",
                  fontSize: 16, letterSpacing: "2px",
                  cursor: "pointer", transition: "opacity 0.15s, transform 0.15s",
                }}
              >
                <Zap size={13} /> NBA BOARD
              </button>
              <button
                className="flag-btn"
                onClick={() => navigate("/v2/mlb")}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "11px 22px", borderRadius: 2,
                  background: "rgba(74,168,200,0.1)",
                  border: "1px solid rgba(74,168,200,0.32)",
                  color: "#4AA8C8",
                  fontFamily: "'Bebas Neue', 'Barlow Condensed', sans-serif",
                  fontSize: 16, letterSpacing: "2px",
                  cursor: "pointer", transition: "opacity 0.15s, transform 0.15s",
                }}
              >
                MLB BOARD
              </button>
              <button
                className="flag-btn"
                onClick={() => navigate("/accuracy")}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "11px 22px", borderRadius: 2,
                  background: "transparent",
                  border: `1px solid ${TH.goldDim}`,
                  color: TH.textMuted,
                  fontFamily: "'Bebas Neue', 'Barlow Condensed', sans-serif",
                  fontSize: 16, letterSpacing: "2px",
                  cursor: "pointer", transition: "opacity 0.15s, transform 0.15s",
                }}
              >
                ACCURACY LEDGER
              </button>
            </div>

            {/* Sport status pills */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {SPORT_STATUS.map(s => (
                <button
                  key={s.label}
                  onClick={() => navigate(s.href)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "5px 12px", borderRadius: 2,
                    background: TH.surface2,
                    border: `1px solid rgba(196,162,74,0.16)`,
                    borderLeft: `2px solid ${s.dot}`,
                    cursor: "pointer",
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 11, fontWeight: 700, letterSpacing: "1px",
                    color: TH.textMuted,
                    transition: "border-color 0.1s",
                  }}
                >
                  <span style={{ fontWeight: 800, color: s.color }}>{s.label}</span>
                  <span style={{
                    fontSize: 8, fontWeight: 700, letterSpacing: "1.5px",
                    background: s.status === "LIVE" ? "rgba(62,186,106,0.12)" : "rgba(74,66,53,0.2)",
                    color: s.status === "LIVE" ? "#3EBA6A" : TH.textFaint,
                    padding: "2px 5px", borderRadius: 1,
                    textTransform: "uppercase",
                  }}>{s.status}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Right: Featured Edge card ── */}
          <div className="flag-hero-right" style={{ animation: "heroFadeUp 0.65s ease 0.1s both" }}>
            <div style={{
              background: TH.surface1,
              border: `1px solid rgba(196,162,74,0.28)`,
              borderRadius: 3, overflow: "hidden",
              boxShadow: "0 8px 48px rgba(0,0,0,0.6)",
            }}>
              {/* Team-color banner header — THE key feature from Manus */}
              <div style={{
                padding: "14px 16px 12px",
                background: `linear-gradient(140deg, ${heroColors.primary}E0 0%, ${heroColors.primary}50 55%, transparent 100%)`,
                borderBottom: `1px solid ${TH.border}`,
                display: "flex", alignItems: "center", gap: 10,
                position: "relative", overflow: "hidden",
              }}>
                {/* Opposing team color bleed from right */}
                <div style={{
                  position: "absolute", inset: 0,
                  background: `radial-gradient(ellipse at 90% 50%, ${oppColors.primary}30, transparent 55%)`,
                }} />
                {/* Gold top stripe */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${TH.gold}, ${TH.gold}44)` }} />

                <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                  <TeamLogoPair away={HERO_SIGNAL.team} home={HERO_SIGNAL.opponent ?? HERO_SIGNAL.team} size={34} useImg />
                  <div>
                    <div style={{ fontFamily: "'Bebas Neue', 'Barlow Condensed', sans-serif", fontSize: 15, letterSpacing: "2px", color: TH.text }}>
                      {HERO_SIGNAL.team}{HERO_SIGNAL.opponent ? ` @ ${HERO_SIGNAL.opponent}` : ""}
                    </div>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: TH.textFaint, letterSpacing: "0.1em" }}>NBA Playoffs · Tonight</div>
                  </div>
                </div>
                <div style={{
                  zIndex: 2, display: "flex", alignItems: "center", gap: 4,
                  padding: "3px 8px", borderRadius: 2,
                  background: "rgba(62,186,106,0.14)", border: "1px solid rgba(62,186,106,0.3)",
                }}>
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#3EBA6A", display: "inline-block" }} />
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#3EBA6A" }}>Live</span>
                </div>
              </div>

              {/* Signal content */}
              <div style={{ padding: "16px" }}>
                <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                  {HERO_SIGNAL.player && <PlayerHeadshot name={HERO_SIGNAL.player} team={HERO_SIGNAL.team} size={60} shape="circle" />}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                      <TypeChip type={HERO_SIGNAL.type} />
                      <VerdictBadge verdict={HERO_SIGNAL.verdict} />
                    </div>
                    {HERO_SIGNAL.player && (
                      <div style={{ fontFamily: "'Bebas Neue', 'Barlow Condensed', sans-serif", fontSize: 14, letterSpacing: "1.5px", color: TH.text, textTransform: "uppercase" }}>
                        {HERO_SIGNAL.player}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15, fontWeight: 600, color: TH.text, lineHeight: 1.4, marginBottom: 12 }}>
                  {HERO_SIGNAL.headline}
                </div>

                <div style={{
                  background: "rgba(196,162,74,0.06)", border: "1px solid rgba(196,162,74,0.2)",
                  borderRadius: 2, padding: "10px 12px", marginBottom: 12,
                }}>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: TH.gold, marginBottom: 5 }}>
                    ⚡ Action
                  </div>
                  <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: 13, color: TH.text, lineHeight: 1.6, fontWeight: 400 }}>
                    {HERO_SIGNAL.action_takeaway}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <ConfidenceBar value={HERO_SIGNAL.confidence} width="100%" height={4} />
                  <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, color: TH.gold, flexShrink: 0 }}>
                    {HERO_SIGNAL.confidence}%
                  </span>
                </div>

                <button
                  onClick={() => navigate("/v2/nba")}
                  style={{
                    width: "100%", padding: "10px",
                    background: `linear-gradient(135deg, ${TH.gold}, #8A6A28)`,
                    border: "none", color: "#0C0B09", borderRadius: 2,
                    fontFamily: "'Bebas Neue', 'Barlow Condensed', sans-serif",
                    fontSize: 14, letterSpacing: "2px",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  FULL NBA INTELLIGENCE BOARD <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          TONIGHT'S NBA SLATE
      ══════════════════════════════════ */}
      <section style={{ borderBottom: `1px solid ${TH.border}`, background: TH.surface1, position: "relative", zIndex: 2 }}>
        <div className="flag-section-pad" style={{ maxWidth: 1280, margin: "0 auto", padding: "22px 40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: TH.textFaint }}>
              Tonight's NBA Slate
            </span>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 2, background: "rgba(62,186,106,0.08)", border: "1px solid rgba(62,186,106,0.22)" }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#3EBA6A", display: "inline-block" }} />
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#3EBA6A" }}>Playoffs</span>
            </div>
            <button onClick={() => navigate("/v2/nba")} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: TH.gold, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>
              All Signals <ChevronRight size={11} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 4 }}>
            {NBA_TONIGHT.map(game => (
              <div key={game.id} style={{ width: 240, flexShrink: 0 }}>
                <GameCard away={game.away} home={game.home} time={game.time} series={game.series} spread={game.spread} total={game.total} compact onClick={() => navigate("/v2/nba")} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          FEATURE PANELS — board cards
          Sport-specific backgrounds with
          team color bleeds (Manus banner style)
      ══════════════════════════════════ */}
      <section style={{ borderBottom: `1px solid ${TH.border}`, position: "relative", zIndex: 2 }}>
        <div className="flag-section-pad" style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 40px" }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: TH.textFaint, marginBottom: 6 }}>
              Intelligence Suite
            </div>
            <h2 style={{ fontFamily: "'Bebas Neue', 'Barlow Condensed', sans-serif", fontSize: "clamp(22px, 3vw, 34px)", fontWeight: 400, letterSpacing: "2px", color: TH.text, margin: 0 }}>
              EVERYTHING YOU NEED TO STAY AHEAD
            </h2>
          </div>

          <div className="flag-panel-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {FEATURE_PANELS.map(panel => {
              const teamColor = getTeamColors(panel.teams[0]);
              return (
                <div
                  key={panel.title}
                  className="panel-card"
                  onClick={() => navigate(panel.href)}
                  style={{
                    background: TH.surface1, borderRadius: 3, overflow: "hidden",
                    border: `1px solid ${TH.border}`,
                    cursor: "pointer", transition: "border-color 0.15s, transform 0.15s",
                  }}
                >
                  {/* Team-color banner header — same pattern as Featured Edge */}
                  <div style={{
                    height: 110, position: "relative", overflow: "hidden",
                    background: `linear-gradient(140deg, ${teamColor.primary}D0 0%, ${teamColor.primary}44 55%, ${TH.surface2} 100%)`,
                  }}>
                    {/* Secondary team bleed */}
                    {panel.teams[1] && (
                      <div style={{
                        position: "absolute", inset: 0,
                        background: `radial-gradient(ellipse at 85% 50%, ${getTeamColors(panel.teams[1]).primary}22, transparent 55%)`,
                      }} />
                    )}
                    {/* Gold top stripe */}
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${panel.accent}, ${panel.accent}33)` }} />

                    {/* Sport watermark letter */}
                    <div style={{
                      position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                      fontFamily: "'Bebas Neue', sans-serif", fontSize: 72, letterSpacing: "-2px",
                      color: TH.text, opacity: 0.06, lineHeight: 1,
                    }}>{panel.sport}</div>

                    {/* Team logos */}
                    <div style={{ position: "absolute", bottom: 10, left: 14, display: "flex", gap: 6, alignItems: "flex-end" }}>
                      {panel.teams.map(tm => <TeamLogoImg key={tm} abbr={tm} size={28} />)}
                    </div>

                    {/* Player headshot */}
                    <div style={{ position: "absolute", bottom: 0, right: 12 }}>
                      <PlayerHeadshot name={panel.player} team={panel.playerTeam} size={72} shape="circle" />
                    </div>

                    {/* Status badge */}
                    <div style={{
                      position: "absolute", top: 10, left: 14,
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "3px 8px", borderRadius: 2,
                      background: `${panel.accent}18`, border: `1px solid ${panel.accent}44`,
                    }}>
                      <span style={{ color: panel.accent }}>{panel.icon}</span>
                      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: panel.accent }}>
                        {panel.subtitle}
                      </span>
                    </div>
                  </div>

                  {/* Text */}
                  <div style={{ padding: "14px 16px 16px" }}>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, fontWeight: 700, letterSpacing: "0.5px", color: TH.text, marginBottom: 6, lineHeight: 1.3 }}>
                      {panel.title}
                    </div>
                    <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: 13, color: TH.text, lineHeight: 1.6, marginBottom: 14, opacity: 0.68 }}>
                      {panel.body}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: panel.accent }}>
                      {panel.cta} <ArrowRight size={11} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          MLB STRIP
      ══════════════════════════════════ */}
      <section style={{ borderBottom: `1px solid ${TH.border}`, background: TH.surface1, position: "relative", zIndex: 2 }}>
        <div className="flag-section-pad" style={{ maxWidth: 1280, margin: "0 auto", padding: "22px 40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: TH.textFaint }}>MLB Today</span>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 2, background: "rgba(74,168,200,0.08)", border: "1px solid rgba(74,168,200,0.2)" }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#4AA8C8", display: "inline-block" }} />
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#4AA8C8" }}>Active</span>
            </div>
            <button onClick={() => navigate("/v2/mlb")} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "#4AA8C8", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>
              MLB Board <ChevronRight size={11} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 4 }}>
            {MLB_GAMES.map(game => (
              <div key={game.id} style={{ width: 220, flexShrink: 0 }}>
                <GameCard away={game.away} home={game.home} time={game.time} spread={game.spread} total={game.total} compact onClick={() => navigate("/v2/mlb")} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          PRO CTA BAND
      ══════════════════════════════════ */}
      <section style={{ background: `linear-gradient(135deg, rgba(196,162,74,0.07), rgba(196,162,74,0.02))`, borderBottom: `1px solid rgba(196,162,74,0.2)`, position: "relative", zIndex: 2 }}>
        <div className="flag-section-pad" style={{
          maxWidth: 1280, margin: "0 auto", padding: "48px 40px",
          display: "grid", gridTemplateColumns: "1fr auto",
          gap: 40, alignItems: "center",
        }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', 'Barlow Condensed', sans-serif", fontSize: 13, letterSpacing: "3px", color: TH.gold, marginBottom: 10 }}>PRO INTELLIGENCE</div>
            <h2 style={{ fontFamily: "'Bebas Neue', 'Barlow Condensed', sans-serif", fontSize: "clamp(22px, 3vw, 38px)", fontWeight: 400, letterSpacing: "2px", color: TH.text, margin: "0 0 12px" }}>
              FULL ARCHIVE. ALL SPORTS. REAL-TIME ALERTS.
            </h2>
            <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: 15, color: TH.text, lineHeight: 1.65, margin: 0, maxWidth: 560, opacity: 0.7 }}>
              Unlock the complete signal archive, pro-only alerts, early access to NFL and CFB boards, and multi-sport intelligence across every game.
            </p>
            <div style={{ display: "flex", gap: 22, marginTop: 20 }}>
              {[{ icon: <Shield size={12} />, label: "Full Archive" }, { icon: <Zap size={12} />, label: "Real-Time Alerts" }, { icon: <BarChart3 size={12} />, label: "All 4 Sports" }].map(f => (
                <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: TH.gold }}>{f.icon}</span>
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: TH.textMuted }}>{f.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, color: TH.gold, lineHeight: 1, marginBottom: 2 }}>$19</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: TH.textFaint, marginBottom: 18 }}>per month</div>
            <button
              onClick={() => navigate("/pro")}
              style={{
                display: "block", width: "100%", padding: "13px 32px", borderRadius: 2,
                background: `linear-gradient(135deg, ${TH.gold}, #8A6A28)`,
                border: "none", color: "#0C0B09",
                fontFamily: "'Bebas Neue', 'Barlow Condensed', sans-serif",
                fontSize: 16, letterSpacing: "2.5px", cursor: "pointer",
              }}
            >UNLOCK PRO</button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: "20px 40px", maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", zIndex: 2 }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: TH.textFaint, letterSpacing: "0.12em" }}>
          © 2026 Edge Setter · Intelligence Verified
        </div>
        <div style={{ display: "flex", gap: 18 }}>
          {[{ label: "NBA Board", href: "/v2/nba" }, { label: "MLB Board", href: "/v2/mlb" }, { label: "Accuracy", href: "/accuracy" }, { label: "Pro", href: "/pro" }].map(link => (
            <button key={link.label} onClick={() => navigate(link.href)} style={{ background: "none", border: "none", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: TH.textFaint, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}>
              {link.label}
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}
