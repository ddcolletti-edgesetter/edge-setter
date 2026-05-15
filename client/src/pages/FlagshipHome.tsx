/**
 * Edge Setter — Flagship Homepage
 * Live command center. Four-sport chalk field background.
 * LFL luxury aesthetic. Manus energy. War room feel.
 */

import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { HamburgerButton, MobileNav } from "../components/MobileNav";
import MobileTabBar from "../components/MobileTabBar";
// FlagshipHome is always dark-themed — no shell theme dependency needed
import {
  PlayerHeadshot, TeamLogoImg, TeamLogoPair, GameCard, FeaturedEdgeCard,
  VerdictBadge, TypeChip, ConfidenceBar,
  T as _T, VERDICT_COLORS, getTeamColors,
} from "../components/v2/SportVisuals";
import { NBA_SIGNALS, NBA_TONIGHT, type V2Signal } from "../data/v2MockData";
import { Zap, ArrowRight, TrendingUp, Shield, BarChart3, ChevronRight, ChevronDown, Activity } from "lucide-react";

// Local token override — warm LFL values
const T = {
  bg:        "#0C0B09", surface1: "#131110", surface2: "#1A1714",
  gold:      "#C4A24A", goldBright: "#E0BB6A",
  goldDim:   "rgba(196,162,74,0.14)", goldGlow: "rgba(196,162,74,0.07)",
  goldStrong:"rgba(196,162,74,0.38)",
  text:      "#EDE5D4", textMuted: "#8A7A62", textFaint: "#4A4235",
  green:     "#3EBA6A", cyan: "#4AA8C8", danger: "#D94B4B",
  border:    "rgba(196,162,74,0.12)", borderMid: "rgba(196,162,74,0.22)",
};

const SPORT_CONFIG = [
  { label: "NBA", status: "LIVE",   color: "#E87C2A", dot: "#3EBA6A", href: "/nba", desc: "Playoffs live — injury flags, line movement, rotation intel",          logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png" },
  { label: "MLB", status: "ACTIVE", color: "#3A8FE0", dot: "#4AA8C8", href: "/mlb", desc: "Regular season — pitcher updates, lineup cards, sharp tracking",        logo: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png" },
  { label: "NFL", status: "ACTIVE", color: "#C4301A", dot: "#C4301A", href: "/nfl", desc: "Active — injuries, depth charts, line shifts, matchup intel",           logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png" },
  { label: "CFB", status: "ACTIVE", color: "#8844CC", dot: "#8844CC", href: "/cfb", desc: "Active — transfer intel, QB battles, coaching scheme edges",            logo: "https://a.espncdn.com/i/teamlogos/leagues/500/ncaa.png" },
] as const;

const HERO_SIGNAL  = NBA_SIGNALS.find(s => s.confidence >= 84) ?? NBA_SIGNALS[0];
const TOP_SIGNALS  = NBA_SIGNALS.slice(0, 5);

const MLB_GAMES = [
  { id: "m1", away: "HOU", home: "NYY", time: "1:05 PM ET",  spread: "NYY -115", total: "8"   },
  { id: "m2", away: "LAD", home: "ATL", time: "4:10 PM ET",  spread: "ATL -108", total: "8.5" },
  { id: "m3", away: "CHC", home: "NYM", time: "7:10 PM ET",  spread: "NYM -112", total: "8"   },
];

/* ── Four-quadrant chalk background — inline styles, no CSS class dependency ── */
const CHALK_NBA = "repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(232,124,42,0.28) 39px,rgba(232,124,42,0.28) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(232,124,42,0.18) 39px,rgba(232,124,42,0.18) 40px)";
const CHALK_MLB = "repeating-linear-gradient(45deg,transparent,transparent 28px,rgba(58,143,224,0.26) 28px,rgba(58,143,224,0.26) 29px),repeating-linear-gradient(-45deg,transparent,transparent 28px,rgba(58,143,224,0.18) 28px,rgba(58,143,224,0.18) 29px)";
const CHALK_NFL = "repeating-linear-gradient(0deg,transparent,transparent 19px,rgba(196,48,26,0.28) 19px,rgba(196,48,26,0.28) 20px)";
const CHALK_CFB = "repeating-linear-gradient(0deg,transparent,transparent 19px,rgba(136,68,204,0.24) 19px,rgba(136,68,204,0.24) 20px)";

function ChalkBg() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {/* NW — Basketball court grid */}
      <div style={{ position: "absolute", top: 0, left: 0, width: "56%", height: "56%", backgroundImage: CHALK_NBA, backgroundSize: "40px 40px" }} />
      {/* NE — Baseball diamond */}
      <div style={{ position: "absolute", top: 0, right: 0, width: "56%", height: "56%", backgroundImage: CHALK_MLB, backgroundSize: "40px 40px" }} />
      {/* SW — Football yard lines */}
      <div style={{ position: "absolute", bottom: 0, left: 0, width: "56%", height: "48%", backgroundImage: CHALK_NFL, backgroundSize: "100% 20px" }} />
      {/* SE — CFB hash marks */}
      <div style={{ position: "absolute", bottom: 0, right: 0, width: "56%", height: "48%", backgroundImage: CHALK_CFB, backgroundSize: "100% 20px" }} />
      {/* Radial vignette — pulls all four to dark center */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 65% 60% at 50% 50%, transparent 10%, rgba(12,11,9,0.45) 55%, rgba(12,11,9,0.65) 100%)" }} />
      {/* Hairline gold cross — subtle quadrant divider */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,transparent 49.2%,rgba(196,162,74,0.08) 49.8%,rgba(196,162,74,0.08) 50.2%,transparent 50.8%),linear-gradient(180deg,transparent 49.2%,rgba(196,162,74,0.08) 49.8%,rgba(196,162,74,0.08) 50.2%,transparent 50.8%)" }} />
    </div>
  );
}

function useWindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
}

export default function FlagshipHome() {
  const [, navigate] = useLocation();
  const darkMode     = true; // FlagshipHome is always dark-themed
  const windowWidth  = useWindowWidth();
  const isMobile     = windowWidth < 768;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [featuredOpen, setFeaturedOpen] = useState(false);
  const [liveSignals, setLiveSignals] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/v2/signals?limit=15")
      .then(r => r.json())
      .then(data => setLiveSignals(Array.isArray(data) ? data : data.signals ?? []))
      .catch(() => {});
  }, []);

  const heroColors = getTeamColors(HERO_SIGNAL.team);
  const oppColors  = HERO_SIGNAL.opponent ? getTeamColors(HERO_SIGNAL.opponent) : heroColors;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'Barlow', sans-serif", position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:ital,wght@0,300;0,400;0,600&family=Barlow+Condensed:wght@600;700;800&display=swap');
        @keyframes navPulse  { 0%,100%{opacity:1} 50%{opacity:0.28} }
        @keyframes tickScroll{ from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes fadeUp    { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes esShimmer { 0%{background-position:200% center} 100%{background-position:-200% center} }
        .board-card:hover  { border-color: rgba(196,162,74,0.35) !important; transform: translateY(-2px); transition: all 0.15s; }
        .sport-card:hover  { transform: translateY(-3px); filter: brightness(1.06); transition: all 0.15s; }
        .sig-tick:hover    { background: rgba(196,162,74,0.08) !important; border-color: rgba(196,162,74,0.3) !important; }
        .cta-primary:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .cta-btn:hover     { filter: brightness(1.1); transform: translateY(-1px); }
        .es-chalk-nba {
          background-image:
            repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(196,162,74,0.18) 39px, rgba(196,162,74,0.18) 40px),
            repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(196,162,74,0.10) 39px, rgba(196,162,74,0.10) 40px);
          background-size: 40px 40px;
        }
        .es-chalk-mlb {
          background-image:
            repeating-linear-gradient(45deg, transparent, transparent 28px, rgba(58,143,224,0.14) 28px, rgba(58,143,224,0.14) 29px),
            repeating-linear-gradient(-45deg, transparent, transparent 28px, rgba(58,143,224,0.10) 28px, rgba(58,143,224,0.10) 29px);
          background-size: 40px 40px;
        }
        .es-chalk-nfl {
          background-image:
            repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(196,48,26,0.14) 19px, rgba(196,48,26,0.14) 20px);
          background-size: 100% 20px;
        }
        .es-chalk-cfb {
          background-image:
            repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(136,68,204,0.12) 19px, rgba(136,68,204,0.12) 20px);
          background-size: 100% 20px;
        }
      `}</style>

      <ChalkBg />

      {/* ══════════════════════ LIVE TICKER STRIP ══════════════════════ */}
      <div style={{ position: "relative", zIndex: 5, background: "rgba(10,9,7,0.96)", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", height: 44 }}>
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "0 14px", borderRight: `1px solid ${T.border}`, height: "100%" }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.gold, display: "inline-block", animation: "navPulse 2s ease-in-out infinite" }} />
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "2px", color: T.gold, textTransform: "uppercase" }}>Live Signals</span>
        </div>
        <div style={{ overflow: "hidden", flex: 1 }}>
          {(() => {
            const tickItems = liveSignals.length > 0 ? liveSignals : TOP_SIGNALS;
            return (
              <div style={{ display: "flex", gap: 48, animation: "tickScroll 32s linear infinite", whiteSpace: "nowrap", paddingLeft: 20, pointerEvents: "none" }}>
                {[...tickItems, ...tickItems].map((sig: any, i) => {
                  const name = sig.player_name ?? sig.player ?? sig.team ?? "";
                  const headline = sig.headline ?? sig.title ?? "";
                  const sport = sig.league ?? "NBA";
                  const sportColor = sport === "MLB" ? "#3A8FE0" : sport === "NFL" ? "#C4301A" : sport === "CFB" ? "#8844CC" : "#E87C2A";
                  return (
                    <span key={i} style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: T.textMuted, display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{ padding: "1px 5px", borderRadius: 2, background: `${sportColor}22`, color: sportColor, fontWeight: 700, fontSize: 10, letterSpacing: "0.1em" }}>{sport}</span>
                      <span style={{ fontWeight: 700, color: T.text }}>{name}</span>
                      {" — "}{headline.slice(0, 55)}{headline.length > 55 ? "…" : ""}
                    </span>
                  );
                })}
              </div>
            );
          })()}
        </div>
        {!isMobile && (
          <div style={{ flexShrink: 0, padding: "0 14px", borderLeft: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 5, height: "100%" }}>
            <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.green, display: "inline-block", animation: "navPulse 1.8s ease-in-out infinite" }} />
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", color: T.green, textTransform: "uppercase" }}>Agents Running — NBA &amp; MLB</span>
          </div>
        )}
        {isMobile && <div style={{ flexShrink: 0, width: 56 }} />}
      </div>

      {/* ══════════════════════ HERO ══════════════════════ */}
      <section style={{ position: "relative", zIndex: 2, minHeight: 580, borderBottom: `1px solid ${T.border}`, overflow: "hidden" }}>
        {/* Strong sport-color atmosphere */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(ellipse 60% 80% at 72% 50%, ${heroColors.primary}38, transparent 62%), radial-gradient(ellipse 45% 55% at 18% 50%, ${heroColors.primary}18, transparent 58%)` }} />
        {/* Gold hairline accent from left */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${T.gold}, ${T.gold}22 60%, transparent)` }} />

        <div style={{ maxWidth: 1300, margin: "0 auto", padding: isMobile ? "32px 20px 28px" : "52px 40px 44px", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 360px", gap: isMobile ? 24 : 52, alignItems: "center", position: "relative", zIndex: 2 }}>

          {/* ── Left ── */}
          <div style={{ animation: "fadeUp 0.55s ease both", minWidth: 0 }}>
            {/* Logo — img with guaranteed text fallback so it always renders */}
            <div style={{ marginBottom: 24, display: "flex", alignItems: "center" }}>
              <img
                src="/edgesetter-logo-transparent_6b7a9796.png"
                alt="Edge Setter"
                style={{ height: isMobile ? "64px" : "90px", width: "auto", display: "block", maxWidth: "100%" }}
                onError={e => {
                  // Image failed — swap to styled text logo
                  const img = e.currentTarget as HTMLImageElement;
                  img.style.display = "none";
                  const fallback = document.createElement("div");
                  fallback.style.cssText = `
                    font-family:'Barlow Condensed',sans-serif;
                    font-weight:900;
                    font-size:${isMobile ? "1.8rem" : "2.4rem"};
                    letter-spacing:0.06em;
                    line-height:1;
                    color:#F5A623;
                    text-transform:uppercase;
                  `;
                  fallback.textContent = "EDGE SETTER";
                  img.parentElement?.appendChild(fallback);
                }}
              />
            </div>

            {/* Eyebrow */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 11px", borderRadius: 2, background: "rgba(62,186,106,0.1)", border: "1px solid rgba(62,186,106,0.28)" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, display: "inline-block", animation: "navPulse 1.8s ease-in-out infinite", boxShadow: `0 0 6px ${T.green}` }} />
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.green }}>NBA Playoffs Live</span>
              </div>
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: T.textFaint }}>
                {NBA_SIGNALS.length} signals · Updated every 15 min
              </span>
            </div>

            {/* Headline — Bebas, full impact */}
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: isMobile ? "clamp(36px, 9vw, 52px)" : "clamp(52px, 6.5vw, 84px)", fontWeight: 400, lineHeight: 0.90, letterSpacing: "2px", color: T.text, margin: "0 0 20px" }}>
              THE MULTI-SPORT<br />
              <span style={{ color: T.gold }}>INTELLIGENCE</span><br />
              TERMINAL
            </h1>

            <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: 16, fontStyle: "italic", fontWeight: 300, color: T.text, lineHeight: 1.65, margin: "0 0 30px", maxWidth: 500, opacity: 0.7 }}>
              Injury signals, lineup changes, line moves, and scheme intel — verified by a Yuma-style consensus engine before the market moves.
            </p>

            {/* CTAs */}
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", gap: 10, marginBottom: 32 }}>
              <button className="cta-primary" onClick={() => navigate("/nba")} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px 24px", borderRadius: 2, background: `linear-gradient(135deg, ${T.gold} 0%, #8A6A28 50%, ${T.gold} 100%)`, backgroundSize: "200%", animation: "esShimmer 3s ease infinite", border: "none", color: T.bg, fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: "2.5px", cursor: "pointer", transition: "filter 0.15s, transform 0.15s" }}>
                <Zap size={14} /> NBA BOARD
              </button>
              <button className="cta-btn" onClick={() => navigate("/mlb")} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px 22px", borderRadius: 2, background: "rgba(58,143,224,0.1)", border: "1px solid rgba(58,143,224,0.3)", color: T.cyan, fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: "2.5px", cursor: "pointer", transition: "filter 0.15s, transform 0.15s" }}>
                MLB BOARD
              </button>
              <button className="cta-btn" onClick={() => navigate("/accuracy")} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px 22px", borderRadius: 2, background: "transparent", border: `1px solid ${T.border}`, color: T.textMuted, fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: "2.5px", cursor: "pointer", transition: "filter 0.15s, transform 0.15s" }}>
                ACCURACY
              </button>
            </div>

            {/* Mobile-only: Featured Edge — above signal list */}
            {isMobile && (
              <div style={{ marginBottom: 16 }}>
                <button
                  onClick={() => setFeaturedOpen(o => !o)}
                  aria-expanded={featuredOpen}
                  aria-label={`${featuredOpen ? 'Collapse' : 'Expand'} Featured Edge`}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: 8,
                    padding: '11px 14px',
                    background: `linear-gradient(90deg, rgba(196,162,74,0.10) 0%, ${T.surface1} 100%)`,
                    border: `1px solid ${T.borderMid}`,
                    borderLeft: `3px solid ${T.gold}`,
                    borderRadius: 3, cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent', minHeight: 48,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <div style={{ flexShrink: 0, width: 24, height: 24, background: 'rgba(196,162,74,0.12)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 1l1.545 3.09L12 4.635l-2.5 2.41.59 3.41L7 8.9l-3.09 1.555.59-3.41L2 4.635l3.455-.545L7 1z" fill="#C4A24A" /></svg>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.gold, lineHeight: 1, marginBottom: 2 }}>Featured Edge</div>
                      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {HERO_SIGNAL.team}{HERO_SIGNAL.opponent ? ` @ ${HERO_SIGNAL.opponent}` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: T.gold, lineHeight: 1 }}>{HERO_SIGNAL.confidence}%</span>
                    <ChevronDown size={14} style={{ color: T.textMuted, transform: featuredOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s' }} />
                  </div>
                </button>
                <div style={{ maxHeight: featuredOpen ? 800 : 0, overflow: 'hidden', transition: 'max-height 0.32s cubic-bezier(0.4,0,0.2,1)' }}>
                  <div style={{ background: T.surface1, border: `1px solid ${T.borderMid}`, borderTop: 'none', borderRadius: '0 0 3px 3px', overflow: 'hidden' }}>
                    <div style={{ padding: "14px 16px 12px", background: `linear-gradient(140deg, ${heroColors.primary}F0 0%, ${heroColors.primary}80 45%, ${T.surface2} 100%)`, borderBottom: `1px solid ${T.border}`, position: "relative", overflow: "hidden", minHeight: 80 }}>
                      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 95% 50%, ${oppColors.primary}48, transparent 55%)` }} />
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${T.gold}, ${T.gold}44)` }} />
                      <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 10 }}>
                        <TeamLogoPair away={HERO_SIGNAL.team} home={HERO_SIGNAL.opponent ?? HERO_SIGNAL.team} size={36} useImg />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: "2px", color: T.text }}>
                            {HERO_SIGNAL.team}{HERO_SIGNAL.opponent ? ` @ ${HERO_SIGNAL.opponent}` : ""}
                          </div>
                          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.1em" }}>NBA Playoffs · Tonight</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 2, background: "rgba(62,186,106,0.14)", border: "1px solid rgba(62,186,106,0.3)" }}>
                          <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.green, display: "inline-block", animation: "navPulse 2s ease-in-out infinite" }} />
                          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.green }}>Live</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: "16px" }}>
                      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                        {HERO_SIGNAL.player && <PlayerHeadshot name={HERO_SIGNAL.player} team={HERO_SIGNAL.team} size={58} shape="circle" />}
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                            <TypeChip type={HERO_SIGNAL.type} />
                            <VerdictBadge verdict={HERO_SIGNAL.verdict} />
                          </div>
                          {HERO_SIGNAL.player && <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: "1.5px", color: T.text, textTransform: "uppercase" }}>{HERO_SIGNAL.player}</div>}
                        </div>
                      </div>
                      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 600, color: T.text, lineHeight: 1.4, marginBottom: 12 }}>
                        {HERO_SIGNAL.headline}
                      </div>
                      <div style={{ background: T.goldGlow, border: `1px solid rgba(196,162,74,0.2)`, borderRadius: 2, padding: "10px 12px", marginBottom: 12 }}>
                        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: T.gold, marginBottom: 4 }}>⚡ Action</div>
                        <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: 13, color: T.text, lineHeight: 1.6 }}>{HERO_SIGNAL.action_takeaway}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                        <ConfidenceBar value={HERO_SIGNAL.confidence} width="100%" height={4} />
                        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: T.gold, flexShrink: 0 }}>{HERO_SIGNAL.confidence}%</span>
                      </div>
                      <button onClick={() => navigate("/nba")} style={{ width: "100%", padding: "10px", background: `linear-gradient(135deg, ${T.gold}, #8A6A28)`, border: "none", color: T.bg, borderRadius: 2, fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: "2.5px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        FULL NBA BOARD <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Live signal list */}
            <div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: T.textFaint, marginBottom: 8 }}>Latest Signals</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {TOP_SIGNALS.slice(0, 4).map(sig => {
                  const vc = VERDICT_COLORS[sig.verdict] ?? T.textFaint;
                  return (
                    <div key={sig.id} className="sig-tick" onClick={() => navigate("/nba")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 2, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, cursor: "pointer", transition: "background 0.1s, border-color 0.1s" }}>
                      {sig.player && <PlayerHeadshot name={sig.player} team={sig.team} size={22} shape="circle" />}
                      {!sig.player && <TeamLogoImg abbr={sig.team} size={22} />}
                      <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.text, fontWeight: 500, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sig.headline.slice(0, 68)}{sig.headline.length > 68 ? "…" : ""}</div>
                      <TypeChip type={sig.type} />
                      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, fontWeight: 700, color: vc, flexShrink: 0 }}>{sig.confidence}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Right: Featured Edge card — desktop only ── */}
          {!isMobile && (
          <div style={{ animation: "fadeUp 0.65s ease 0.1s both" }}>
            <div style={{ background: T.surface1, border: `1px solid ${T.borderMid}`, borderRadius: 3, overflow: "hidden", boxShadow: "0 8px 56px rgba(0,0,0,0.65)" }}>
              {/* Team-color banner — full bleed, commanding */}
              <div style={{ padding: "14px 16px 12px", background: `linear-gradient(140deg, ${heroColors.primary}F0 0%, ${heroColors.primary}80 45%, ${T.surface2} 100%)`, borderBottom: `1px solid ${T.border}`, position: "relative", overflow: "hidden", minHeight: 80 }}>
                <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 95% 50%, ${oppColors.primary}48, transparent 55%)` }} />
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${T.gold}, ${T.gold}44)` }} />
                <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 10 }}>
                  <TeamLogoPair away={HERO_SIGNAL.team} home={HERO_SIGNAL.opponent ?? HERO_SIGNAL.team} size={36} useImg />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: "2px", color: T.text }}>
                      {HERO_SIGNAL.team}{HERO_SIGNAL.opponent ? ` @ ${HERO_SIGNAL.opponent}` : ""}
                    </div>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.1em" }}>NBA Playoffs · Tonight</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 2, background: "rgba(62,186,106,0.14)", border: "1px solid rgba(62,186,106,0.3)" }}>
                    <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.green, display: "inline-block", animation: "navPulse 2s ease-in-out infinite" }} />
                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.green }}>Live</span>
                  </div>
                </div>
              </div>

              <div style={{ padding: "16px" }}>
                <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                  {HERO_SIGNAL.player && <PlayerHeadshot name={HERO_SIGNAL.player} team={HERO_SIGNAL.team} size={58} shape="circle" />}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                      <TypeChip type={HERO_SIGNAL.type} />
                      <VerdictBadge verdict={HERO_SIGNAL.verdict} />
                    </div>
                    {HERO_SIGNAL.player && <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: "1.5px", color: T.text, textTransform: "uppercase" }}>{HERO_SIGNAL.player}</div>}
                  </div>
                </div>

                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 600, color: T.text, lineHeight: 1.4, marginBottom: 12 }}>
                  {HERO_SIGNAL.headline}
                </div>

                <div style={{ background: T.goldGlow, border: `1px solid rgba(196,162,74,0.2)`, borderRadius: 2, padding: "10px 12px", marginBottom: 12 }}>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: T.gold, marginBottom: 4 }}>⚡ Action</div>
                  <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: 13, color: T.text, lineHeight: 1.6 }}>{HERO_SIGNAL.action_takeaway}</div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <ConfidenceBar value={HERO_SIGNAL.confidence} width="100%" height={4} />
                  <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: T.gold, flexShrink: 0 }}>{HERO_SIGNAL.confidence}%</span>
                </div>

                <button onClick={() => navigate("/nba")} style={{ width: "100%", padding: "10px", background: `linear-gradient(135deg, ${T.gold}, #8A6A28)`, border: "none", color: T.bg, borderRadius: 2, fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: "2.5px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  FULL NBA BOARD <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </div>
          )}
        </div>
      </section>

      {/* ══════════════════════ TONIGHT'S SLATE ══════════════════════ */}
      <section style={{ borderBottom: `1px solid ${T.border}`, background: T.surface1, position: "relative", zIndex: 2 }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: isMobile ? "14px 20px" : "20px 40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: T.textFaint }}>Tonight's NBA Slate</span>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 2, background: "rgba(62,186,106,0.08)", border: "1px solid rgba(62,186,106,0.22)" }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.green, display: "inline-block" }} />
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.green }}>Playoffs</span>
            </div>
            <button onClick={() => navigate("/nba")} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: T.gold, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>
              All Signals <ChevronRight size={11} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 4 }}>
            {NBA_TONIGHT.map(game => (
              <div key={game.id} style={{ width: 240, flexShrink: 0 }}>
                <GameCard away={game.away} home={game.home} time={game.time} series={game.seriesRecord} spread={game.spread} total={game.total} compact onClick={() => navigate("/nba")} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ SPORT BOARDS GRID ══════════════════════ */}
      <section style={{ position: "relative", zIndex: 2, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: isMobile ? "24px 20px" : "40px 40px" }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.24em", textTransform: "uppercase", color: T.textFaint, marginBottom: 6 }}>Intelligence Boards</div>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(24px, 3vw, 38px)", fontWeight: 400, letterSpacing: "2px", color: T.text, margin: 0 }}>EVERY SPORT. EVERY EDGE.</h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 12 }}>
            {SPORT_CONFIG.map(sport => (
              <div
                key={sport.label}
                className="sport-card"
                onClick={() => navigate(sport.href)}
                style={{
                  background: T.surface1, borderRadius: 3, overflow: "hidden",
                  border: `1px solid ${T.border}`,
                  borderTop: `3px solid ${sport.color}`,
                  cursor: "pointer", transition: "transform 0.15s, filter 0.15s",
                }}
              >
                {/* Sport color header with chalk bg */}
                <div style={{ height: 90, position: "relative", overflow: "hidden", background: `linear-gradient(160deg, ${sport.color}CC 0%, ${sport.color}44 50%, ${T.surface2} 100%)` }}>
                  {/* Chalk bg overlay — inline to avoid CSS class dependency */}
                  <div style={{ position: "absolute", inset: 0, backgroundImage: sport.label === "NBA" ? CHALK_NBA : sport.label === "MLB" ? CHALK_MLB : sport.label === "NFL" ? CHALK_NFL : CHALK_CFB, backgroundSize: (sport.label === "NBA" || sport.label === "MLB") ? "40px 40px" : "100% 20px", opacity: 0.18 }} />
                  {/* Sport logo watermark — replaces bold text */}
                  <img
                    src={sport.logo}
                    alt={sport.label}
                    style={{ position: "absolute", right: -4, bottom: -4, width: 90, height: 90, objectFit: "contain", opacity: 0.18, pointerEvents: "none" }}
                    onError={e => { (e.currentTarget as HTMLElement).style.display = "none"; }}
                  />
                  {/* Status badge */}
                  <div style={{ position: "absolute", top: 10, left: 12, display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 2, background: `${sport.dot}18`, border: `1px solid ${sport.dot}44` }}>
                    <span style={{ width: 4, height: 4, borderRadius: "50%", background: sport.dot, display: "inline-block", boxShadow: `0 0 5px ${sport.dot}`, animation: "navPulse 2s ease-in-out infinite" }} />
                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: sport.dot }}>{sport.status}</span>
                  </div>
                  {/* Sport name big */}
                  <div style={{ position: "absolute", bottom: 10, left: 12, fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: "3px", color: T.text }}>{sport.label}</div>
                </div>

                <div style={{ padding: "12px 14px 14px", background: `linear-gradient(180deg, ${sport.color}0D 0%, transparent 60%)` }}>
                  <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: 12, color: T.text, lineHeight: 1.55, marginBottom: 12, opacity: 0.68 }}>{sport.desc}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: sport.color }}>
                    Open Board <ArrowRight size={11} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ MLB STRIP ══════════════════════ */}
      <section style={{ borderBottom: `1px solid ${T.border}`, background: T.surface1, position: "relative", zIndex: 2 }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: isMobile ? "14px 20px" : "20px 40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: T.textFaint }}>MLB Today</span>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 2, background: "rgba(74,168,200,0.08)", border: "1px solid rgba(74,168,200,0.2)" }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.cyan, display: "inline-block" }} />
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.cyan }}>Active</span>
            </div>
            <button onClick={() => navigate("/mlb")} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: T.cyan, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>
              MLB Board <ChevronRight size={11} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 4 }}>
            {MLB_GAMES.map(game => (
              <div key={game.id} style={{ width: 220, flexShrink: 0 }}>
                <GameCard away={game.away} home={game.home} time={game.time} spread={game.spread} total={game.total} compact onClick={() => navigate("/mlb")} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ PRO BAND ══════════════════════ */}
      <section style={{ background: `linear-gradient(135deg, rgba(196,162,74,0.07), rgba(196,162,74,0.02))`, borderBottom: `1px solid rgba(196,162,74,0.2)`, position: "relative", zIndex: 2 }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: isMobile ? "32px 20px" : "48px 40px", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr auto", gap: isMobile ? 24 : 40, alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, letterSpacing: "3px", color: T.gold, marginBottom: 10 }}>PRO INTELLIGENCE</div>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(24px, 3vw, 42px)", fontWeight: 400, letterSpacing: "2px", color: T.text, margin: "0 0 12px" }}>
              FULL ARCHIVE. ALL SPORTS. REAL-TIME ALERTS.
            </h2>
            <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: 15, fontStyle: "italic", fontWeight: 300, color: T.text, lineHeight: 1.65, margin: "0 0 20px", maxWidth: 560, opacity: 0.7 }}>
              Unlock the complete signal archive, pro-only alerts, early access to NFL and CFB boards, and multi-sport intelligence across every game.
            </p>
            <div style={{ display: "flex", gap: 24 }}>
              {[{ icon: <Shield size={12} />, label: "Full Archive" }, { icon: <Zap size={12} />, label: "Real-Time Alerts" }, { icon: <BarChart3 size={12} />, label: "All 4 Sports" }].map(f => (
                <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: T.gold }}>{f.icon}</span>
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.textMuted }}>{f.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 58, color: T.gold, lineHeight: 1, marginBottom: 2 }}>$19</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.textFaint, marginBottom: 18 }}>per month</div>
            <button onClick={() => navigate("/pro")} style={{ display: "block", width: "100%", padding: "13px 36px", borderRadius: 2, background: `linear-gradient(135deg, ${T.gold} 0%, #8A6A28 50%, ${T.gold} 100%)`, backgroundSize: "200%", animation: "esShimmer 3s ease infinite", border: "none", color: T.bg, fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: "3px", cursor: "pointer" }}>
              UNLOCK PRO
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: isMobile ? "14px 20px" : "18px 40px", maxWidth: 1300, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: isMobile ? 8 : 0, position: "relative", zIndex: 2 }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textFaint, letterSpacing: "0.12em" }}>© 2026 Edge Setter · Intelligence Verified</div>
        <div style={{ display: "flex", gap: 18 }}>
          {[{ label: "NBA", href: "/nba" }, { label: "MLB", href: "/mlb" }, { label: "Accuracy", href: "/accuracy" }, { label: "Pro", href: "/pro" }].map(link => (
            <button key={link.label} onClick={() => navigate(link.href)} style={{ background: "none", border: "none", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textFaint, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}>{link.label}</button>
          ))}
        </div>
      </footer>
      {/* Fixed hamburger — rendered outside ticker strip so no layout/z-index can block it */}
      {isMobile && (
        <div
          style={{
            position: "fixed", top: 0, right: 0, zIndex: 110,
            width: 56, height: 44,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(10,9,7,0.96)",
          }}
        >
          <HamburgerButton open={drawerOpen} onToggle={() => setDrawerOpen(o => !o)} />
        </div>
      )}
      <MobileNav open={drawerOpen} onToggle={() => setDrawerOpen(o => !o)} />
      <MobileTabBar />
      {isMobile && <div style={{ height: 72 }} />}
    </div>
  );
}
