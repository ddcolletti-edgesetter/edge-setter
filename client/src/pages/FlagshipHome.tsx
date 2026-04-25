/**
 * Edge Setter — Flagship Homepage
 * Root route (/#/) premium sports intelligence command center.
 * NBA-first, multi-sport, visually driven.
 */

import { useLocation } from "wouter";
import {
  PlayerHeadshot, TeamLogoImg, TeamLogoPair, GameCard, FeaturedEdgeCard,
  VerdictBadge, TypeChip, ConfidenceBar,
  T, VERDICT_COLORS, getTeamColors,
} from "../components/v2/SportVisuals";
import { NBA_SIGNALS, NBA_TONIGHT, type V2Signal } from "../data/v2MockData";
import { Zap, ArrowRight, TrendingUp, Shield, BarChart3, ChevronRight } from "lucide-react";

/* ── Sport status pills ── */
const SPORT_STATUS = [
  { label: "NBA", status: "LIVE",        color: "#CAA85A", dot: "#4CAF82" },
  { label: "MLB", status: "ACTIVE",      color: "#4AA8C8", dot: "#4AA8C8" },
  { label: "NFL", status: "OFFSEASON",   color: "#7E776A", dot: "#7E776A" },
  { label: "CFB", status: "COMING SOON", color: "#7E776A", dot: "#7E776A" },
] as const;

/* ── Featured NBA signal for hero ── */
const HERO_SIGNAL = NBA_SIGNALS.find(s => s.confidence >= 84) ?? NBA_SIGNALS[0];

/* ── Top 3 signals for the signal ticker ── */
const TOP_SIGNALS = NBA_SIGNALS.slice(0, 5);

/* ── MLB games for strip ── */
const MLB_GAMES = [
  { id: "m1", away: "HOU", home: "NYY", time: "1:05 PM ET",  spread: "NYY -115", total: "8" },
  { id: "m2", away: "LAD", home: "ATL", time: "4:10 PM ET",  spread: "ATL -108", total: "8.5" },
  { id: "m3", away: "CHC", home: "NYM", time: "7:10 PM ET",  spread: "NYM -112", total: "8" },
];

/* ── Feature panels ── */
const FEATURE_PANELS = [
  {
    title: "NBA Intelligence Board",
    subtitle: "Playoffs live",
    body: "Real-time injury reports, line movement, rotation notes, and matchup edges. 12 signals updated continuously.",
    cta: "Open NBA Board",
    href: "/v2/nba",
    accent: T.gold,
    teams: ["LAL", "BOS", "DEN"],
    player: "Luka Dončić",
    playerTeam: "DAL",
    icon: <Zap size={14} />,
  },
  {
    title: "Tools Hub",
    subtitle: "Research suite",
    body: "Lineup optimizer, matchup breakdown, line-shopping alerts, and public vs. sharp money tracker.",
    cta: "Open Tools",
    href: "/v2/tools",
    accent: T.cyan,
    teams: ["GSW", "MIA", "OKC"],
    player: "Nikola Jokic",
    playerTeam: "DEN",
    icon: <BarChart3 size={14} />,
  },
  {
    title: "MLB Board",
    subtitle: "Regular season",
    body: "Pitcher alerts, lineup movement, team trends, and sharp line tracking across all 30 teams.",
    cta: "Open MLB Board",
    href: "/v2/mlb",
    accent: T.cyan,
    teams: ["NYY", "LAD", "ATL"],
    player: "Gerrit Cole",
    playerTeam: "NYY",
    icon: <TrendingUp size={14} />,
  },
] as const;

/* ═══════════════════════════════════════════════════
   Main Component
═══════════════════════════════════════════════════ */
export default function FlagshipHome() {
  const [, navigate] = useLocation();

  const heroColors = getTeamColors(HERO_SIGNAL.team);
  const oppColors  = HERO_SIGNAL.opponent ? getTeamColors(HERO_SIGNAL.opponent) : heroColors;
  const vColor     = VERDICT_COLORS[HERO_SIGNAL.verdict] ?? T.textFaint;

  return (
    <div style={{
      minHeight: "100vh",
      background: T.bg,
      color: T.text,
      fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
      overflowX: "hidden",
    }}>

      {/* ══════════════════════════════════
          TOP NAV BAR
      ══════════════════════════════════ */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(10,11,13,0.96)",
        backdropFilter: "blur(12px)",
        borderBottom: `1px solid rgba(202,168,90,0.15)`,
        display: "flex", alignItems: "center",
        padding: "0 32px", height: 52,
        gap: 32,
      }}>
        {/* Brand */}
        <div
          onClick={() => navigate("/")}
          style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: `linear-gradient(145deg, ${T.gold}, #8B6B2A)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 2px 8px rgba(202,168,90,0.4)`,
          }}>
            <Zap size={14} style={{ color: "#000" }} />
          </div>
          <div>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 14, fontWeight: 800, letterSpacing: "0.08em",
              textTransform: "uppercase", color: T.text, lineHeight: 1,
            }}>Edge Setter</div>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 8, fontWeight: 700, letterSpacing: "0.18em",
              textTransform: "uppercase", color: T.textFaint, lineHeight: 1, marginTop: 1,
            }}>Multi-Sport Intel</div>
          </div>
        </div>

        {/* Nav links */}
        <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
          {[
            { label: "NBA Board", href: "/v2/nba", hot: true },
            { label: "MLB Board", href: "/v2/mlb" },
            { label: "Tools",     href: "/v2/tools" },
            { label: "My Edge",   href: "/v2/my-edge" },
          ].map(link => (
            <button
              key={link.label}
              onClick={() => navigate(link.href)}
              style={{
                padding: "6px 12px", borderRadius: 3, border: "none",
                background: link.hot ? "rgba(202,168,90,0.1)" : "transparent",
                color: link.hot ? T.gold : T.textMuted,
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
                textTransform: "uppercase", cursor: "pointer",
                transition: "color 0.12s, background 0.12s",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.color = T.gold;
                el.style.background = "rgba(202,168,90,0.08)";
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.color = link.hot ? T.gold : T.textMuted;
                el.style.background = link.hot ? "rgba(202,168,90,0.1)" : "transparent";
              }}
            >{link.label}</button>
          ))}
        </div>

        {/* Sport status pills */}
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          {SPORT_STATUS.map(s => (
            <div key={s.label} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "3px 9px", borderRadius: 20,
              background: `${s.dot}12`, border: `1px solid ${s.dot}28`,
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: "50%",
                background: s.dot,
                boxShadow: s.status === "LIVE" ? `0 0 6px ${s.dot}` : "none",
                display: "inline-block",
                animation: s.status === "LIVE" ? "navPulse 2s ease-in-out infinite" : "none",
              }} />
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
                textTransform: "uppercase", color: s.color,
              }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Pro CTA */}
        <button
          onClick={() => navigate("/pro")}
          style={{
            padding: "7px 16px", borderRadius: 3,
            background: `linear-gradient(135deg, ${T.gold}, #8B6B2A)`,
            border: "none", color: "#000",
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
            cursor: "pointer",
          }}
        >Pro — $19/mo</button>
      </nav>

      <style>{`
        @keyframes navPulse { 0%,100%{opacity:1;} 50%{opacity:0.35;} }
        @keyframes heroFadeUp { from{opacity:0;transform:translateY(16px);} to{opacity:1;transform:translateY(0);} }
        @keyframes tickerScroll { 0%{transform:translateX(0);} 100%{transform:translateX(-50%);} }
        .flag-btn:hover { opacity: 0.88; transform: translateY(-1px); }
        .panel-card:hover { border-color: rgba(202,168,90,0.3) !important; transform: translateY(-2px); }
        .sig-ticker:hover { background: rgba(202,168,90,0.04) !important; }
      `}</style>

      {/* ══════════════════════════════════
          HERO SECTION — full-width command center
      ══════════════════════════════════ */}
      <section style={{
        position: "relative", overflow: "hidden",
        minHeight: 520,
        background: `linear-gradient(160deg, ${heroColors.primary}28 0%, ${T.bg} 45%, ${oppColors.primary}18 100%)`,
        borderBottom: `1px solid rgba(255,255,255,0.06)`,
      }}>
        {/* Background grid texture */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.04,
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(202,168,90,0.6) 39px, rgba(202,168,90,0.6) 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(202,168,90,0.6) 39px, rgba(202,168,90,0.6) 40px)`,
        }} />

        {/* Radial glow — team color */}
        <div style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(ellipse 60% 80% at 75% 50%, ${heroColors.primary}22, transparent 65%)`,
        }} />

        <div style={{
          maxWidth: 1280, margin: "0 auto", padding: "60px 40px 48px",
          display: "grid", gridTemplateColumns: "1fr 380px",
          gap: 48, alignItems: "center", position: "relative", zIndex: 2,
        }}>

          {/* ── Left: headline + signal module ── */}
          <div style={{ animation: "heroFadeUp 0.6s ease both" }}>

            {/* Eyebrow */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 20,
                background: "rgba(76,175,130,0.12)", border: "1px solid rgba(76,175,130,0.3)",
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", background: T.green,
                  display: "inline-block", animation: "navPulse 1.8s ease-in-out infinite",
                  boxShadow: `0 0 8px ${T.green}`,
                }} />
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
                  textTransform: "uppercase", color: T.green,
                }}>NBA Playoffs Live</span>
              </div>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 10, color: T.textFaint, letterSpacing: "0.1em",
              }}>
                {NBA_SIGNALS.length} signals · Updated continuously
              </div>
            </div>

            {/* Main headline */}
            <h1 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "clamp(32px, 4vw, 52px)",
              fontWeight: 800, lineHeight: 1.1,
              color: T.text, margin: "0 0 12px",
              letterSpacing: "-0.02em",
            }}>
              Sports Intelligence<br />
              <span style={{ color: T.gold }}>Before the Market Moves</span>
            </h1>

            <p style={{
              fontSize: 16, color: T.textMuted, lineHeight: 1.6,
              margin: "0 0 28px", maxWidth: 520,
            }}>
              Real-time injury reports, sharp money tracking, rotation notes, and matchup edges — across NBA, MLB, NFL, and CFB. Built for bettors and fantasy players who want the edge first.
            </p>

            {/* CTAs */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                className="flag-btn"
                onClick={() => navigate("/v2/nba")}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "12px 24px", borderRadius: 4,
                  background: `linear-gradient(135deg, ${T.gold}, #8B6B2A)`,
                  border: "none", color: "#000",
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
                  cursor: "pointer", transition: "opacity 0.15s, transform 0.15s",
                  boxShadow: `0 4px 20px rgba(202,168,90,0.35)`,
                }}
              >
                <Zap size={14} /> NBA Board <ArrowRight size={13} />
              </button>
              <button
                className="flag-btn"
                onClick={() => navigate("/v2/mlb")}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "12px 24px", borderRadius: 4,
                  background: "rgba(74,168,200,0.1)",
                  border: `1px solid rgba(74,168,200,0.35)`,
                  color: T.cyan,
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
                  cursor: "pointer", transition: "opacity 0.15s, transform 0.15s",
                }}
              >
                MLB Board <ArrowRight size={13} />
              </button>
              <button
                className="flag-btn"
                onClick={() => navigate("/v2/tools")}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "12px 24px", borderRadius: 4,
                  background: "transparent",
                  border: `1px solid rgba(255,255,255,0.12)`,
                  color: T.textMuted,
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                  cursor: "pointer", transition: "opacity 0.15s, transform 0.15s",
                }}
              >
                Tools Hub
              </button>
            </div>

            {/* Live signal ticker */}
            <div style={{ marginTop: 32 }}>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.2em",
                textTransform: "uppercase", color: T.textFaint, marginBottom: 8,
              }}>Latest NBA Signals</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {TOP_SIGNALS.slice(0, 4).map(sig => {
                  const vc = VERDICT_COLORS[sig.verdict] ?? T.textFaint;
                  return (
                    <div
                      key={sig.id}
                      className="sig-ticker"
                      onClick={() => navigate("/v2/nba")}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "7px 12px", borderRadius: 3,
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.05)",
                        cursor: "pointer", transition: "background 0.1s",
                      }}
                    >
                      {sig.player && <PlayerHeadshot name={sig.player} team={sig.team} size={22} shape="circle" />}
                      {!sig.player && <TeamLogoImg abbr={sig.team} size={22} />}
                      <div style={{ flex: 1, fontSize: 11, color: T.textMuted, lineHeight: 1.3 }}>
                        {sig.headline.slice(0, 72)}{sig.headline.length > 72 ? "…" : ""}
                      </div>
                      <TypeChip type={sig.type} />
                      <span style={{
                        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                        fontSize: 9, fontWeight: 700, color: vc,
                        letterSpacing: "0.1em", textTransform: "uppercase", flexShrink: 0,
                      }}>{sig.confidence}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Right: Featured Edge card ── */}
          <div style={{ animation: "heroFadeUp 0.7s ease 0.12s both" }}>
            {/* Hero player visual — marquee matchup */}
            <div style={{
              background: T.surface1,
              border: `1px solid rgba(202,168,90,0.25)`,
              borderRadius: 6, overflow: "hidden",
              boxShadow: "0 8px 48px rgba(0,0,0,0.55)",
            }}>
              {/* Matchup header */}
              <div style={{
                padding: "14px 16px 12px",
                background: `linear-gradient(135deg, ${heroColors.primary}CC, ${heroColors.primary}44)`,
                borderBottom: `1px solid rgba(255,255,255,0.08)`,
                display: "flex", alignItems: "center", gap: 10, position: "relative",
              }}>
                {/* BG glow */}
                <div style={{
                  position: "absolute", inset: 0,
                  background: `radial-gradient(ellipse at 80% 50%, ${oppColors.primary}33, transparent 60%)`,
                }} />
                <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                  <TeamLogoPair
                    away={HERO_SIGNAL.team}
                    home={HERO_SIGNAL.opponent ?? HERO_SIGNAL.team}
                    size={36}
                    useImg
                  />
                  <div>
                    <div style={{
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 12, fontWeight: 700, color: T.text, letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}>
                      {HERO_SIGNAL.team} {HERO_SIGNAL.opponent ? `@ ${HERO_SIGNAL.opponent}` : ""}
                    </div>
                    <div style={{
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 9, color: T.textFaint, letterSpacing: "0.08em",
                    }}>NBA Playoffs · Tonight</div>
                  </div>
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "3px 8px", borderRadius: 20,
                  background: "rgba(76,175,130,0.15)", border: "1px solid rgba(76,175,130,0.3)",
                  zIndex: 2,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, display: "inline-block" }} />
                  <span style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 8, fontWeight: 700, letterSpacing: "0.14em",
                    textTransform: "uppercase", color: T.green,
                  }}>Live</span>
                </div>
              </div>

              {/* Player headshot + signal */}
              <div style={{ padding: "16px" }}>
                {/* Featured signal content */}
                <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                  {HERO_SIGNAL.player && (
                    <PlayerHeadshot
                      name={HERO_SIGNAL.player}
                      team={HERO_SIGNAL.team}
                      size={64}
                      shape="circle"
                    />
                  )}
                  {!HERO_SIGNAL.player && (
                    <TeamLogoPair away={HERO_SIGNAL.team} home={HERO_SIGNAL.opponent ?? HERO_SIGNAL.team} size={32} useImg />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                      <TypeChip type={HERO_SIGNAL.type} />
                      <VerdictBadge verdict={HERO_SIGNAL.verdict} />
                    </div>
                    {HERO_SIGNAL.player && (
                      <div style={{
                        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                        fontSize: 14, fontWeight: 800, color: T.text, letterSpacing: "0.04em",
                        textTransform: "uppercase", marginBottom: 2,
                      }}>{HERO_SIGNAL.player}</div>
                    )}
                  </div>
                </div>

                {/* Headline */}
                <div style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 14, fontWeight: 700, color: T.text, lineHeight: 1.4, marginBottom: 10,
                }}>
                  {HERO_SIGNAL.headline}
                </div>

                {/* Takeaway box */}
                <div style={{
                  background: "rgba(202,168,90,0.06)", border: "1px solid rgba(202,168,90,0.2)",
                  borderRadius: 4, padding: "10px 12px", marginBottom: 12,
                }}>
                  <div style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 8, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
                    color: T.gold, marginBottom: 5,
                  }}>⚡ Action</div>
                  <div style={{ fontSize: 11, color: T.text, lineHeight: 1.55, fontWeight: 500 }}>
                    {HERO_SIGNAL.action_takeaway}
                  </div>
                </div>

                {/* Confidence bar */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <ConfidenceBar value={HERO_SIGNAL.confidence} width="100%" height={5} />
                  <span style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 12, fontWeight: 800, color: T.gold, flexShrink: 0,
                    fontVariantNumeric: "tabular-nums",
                  }}>{HERO_SIGNAL.confidence}%</span>
                </div>

                {/* CTA */}
                <button
                  onClick={() => navigate("/v2/nba")}
                  style={{
                    width: "100%", padding: "10px", borderRadius: 3,
                    background: `linear-gradient(135deg, ${T.gold}CC, #8B6B2A)`,
                    border: "none", color: "#000",
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  Full NBA Intelligence Board <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          TONIGHT'S NBA SLATE
      ══════════════════════════════════ */}
      <section style={{
        borderBottom: `1px solid rgba(255,255,255,0.06)`,
        background: T.surface1,
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.2em",
              textTransform: "uppercase", color: T.textFaint,
            }}>Tonight's NBA Slate</div>
            <div style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "2px 8px", borderRadius: 20,
              background: "rgba(76,175,130,0.1)", border: "1px solid rgba(76,175,130,0.25)",
            }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.green, display: "inline-block" }} />
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 8, fontWeight: 700, letterSpacing: "0.14em",
                textTransform: "uppercase", color: T.green,
              }}>Playoffs</span>
            </div>
            <button
              onClick={() => navigate("/v2/nba")}
              style={{
                marginLeft: "auto", display: "flex", alignItems: "center", gap: 5,
                background: "none", border: "none", color: T.gold,
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                cursor: "pointer",
              }}
            >All Signals <ChevronRight size={12} /></button>
          </div>
          <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 4 }}>
            {NBA_TONIGHT.map(game => (
              <div key={game.id} style={{ width: 240, flexShrink: 0 }}>
                <GameCard
                  away={game.away} home={game.home}
                  time={game.time} series={game.series}
                  spread={game.spread} total={game.total}
                  compact
                  onClick={() => navigate("/v2/nba")}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          FEATURED NBA EDGE — full marquee
      ══════════════════════════════════ */}
      <section style={{
        borderBottom: `1px solid rgba(255,255,255,0.06)`,
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 40px" }}>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.2em",
            textTransform: "uppercase", color: T.textFaint, marginBottom: 14,
          }}>Featured NBA Edge</div>
          <FeaturedEdgeCard signal={HERO_SIGNAL} sport="NBA" />
        </div>
      </section>

      {/* ══════════════════════════════════
          MULTI-SPORT IDENTITY BAR
      ══════════════════════════════════ */}
      <section style={{
        background: T.surface2,
        borderBottom: `1px solid rgba(255,255,255,0.06)`,
      }}>
        <div style={{
          maxWidth: 1280, margin: "0 auto", padding: "20px 40px",
          display: "flex", alignItems: "center", gap: 0,
        }}>
          {SPORT_STATUS.map((s, i) => (
            <div key={s.label} style={{
              flex: 1, textAlign: "center", padding: "12px 8px",
              borderRight: i < SPORT_STATUS.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
            }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                marginBottom: 4,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", background: s.dot,
                  display: "inline-block",
                  boxShadow: s.status === "LIVE" || s.status === "ACTIVE" ? `0 0 6px ${s.dot}` : "none",
                }} />
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 16, fontWeight: 800, color: s.color, letterSpacing: "0.06em",
                }}>{s.label}</span>
              </div>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.16em",
                textTransform: "uppercase", color: T.textFaint,
              }}>{s.status}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════
          MLB STRIP
      ══════════════════════════════════ */}
      <section style={{ borderBottom: `1px solid rgba(255,255,255,0.06)`, background: T.surface1 }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.2em",
              textTransform: "uppercase", color: T.textFaint,
            }}>MLB Today</div>
            <div style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "2px 8px", borderRadius: 20,
              background: "rgba(74,168,200,0.08)", border: "1px solid rgba(74,168,200,0.22)",
            }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.cyan, display: "inline-block" }} />
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 8, fontWeight: 700, letterSpacing: "0.14em",
                textTransform: "uppercase", color: T.cyan,
              }}>Active</span>
            </div>
            <button
              onClick={() => navigate("/v2/mlb")}
              style={{
                marginLeft: "auto", display: "flex", alignItems: "center", gap: 5,
                background: "none", border: "none", color: T.cyan,
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                cursor: "pointer",
              }}
            >MLB Board <ChevronRight size={12} /></button>
          </div>
          <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 4 }}>
            {MLB_GAMES.map(game => (
              <div key={game.id} style={{ width: 220, flexShrink: 0 }}>
                <GameCard
                  away={game.away} home={game.home}
                  time={game.time} spread={game.spread} total={game.total}
                  compact
                  onClick={() => navigate("/v2/mlb")}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          FEATURE PANELS — 3-col
      ══════════════════════════════════ */}
      <section style={{ borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "48px 40px" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.22em",
              textTransform: "uppercase", color: T.textFaint, marginBottom: 10,
            }}>Intelligence Suite</div>
            <h2 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "clamp(22px, 3vw, 34px)", fontWeight: 700,
              color: T.text, margin: 0, letterSpacing: "-0.01em",
            }}>
              Everything You Need to Stay Ahead
            </h2>
          </div>

          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20,
          }}>
            {FEATURE_PANELS.map(panel => {
              const teamColor = getTeamColors(panel.teams[0]);
              return (
                <div
                  key={panel.title}
                  className="panel-card"
                  onClick={() => navigate(panel.href)}
                  style={{
                    background: T.surface1, borderRadius: 6, overflow: "hidden",
                    border: `1px solid rgba(255,255,255,0.07)`,
                    cursor: "pointer", transition: "border-color 0.15s, transform 0.15s",
                  }}
                >
                  {/* Visual header — team logos + player */}
                  <div style={{
                    height: 120, position: "relative", overflow: "hidden",
                    background: `linear-gradient(135deg, ${teamColor.primary}CC, ${teamColor.primary}44)`,
                  }}>
                    {/* Background glow */}
                    <div style={{
                      position: "absolute", inset: 0,
                      background: `radial-gradient(ellipse at 80% 50%, ${teamColor.secondary}22, transparent 60%)`,
                    }} />
                    {/* Team logos row */}
                    <div style={{
                      position: "absolute", bottom: 12, left: 14,
                      display: "flex", gap: 6, alignItems: "flex-end",
                    }}>
                      {panel.teams.map(tm => (
                        <TeamLogoImg key={tm} abbr={tm} size={32} />
                      ))}
                    </div>
                    {/* Player headshot — right side */}
                    <div style={{ position: "absolute", bottom: 0, right: 16 }}>
                      <PlayerHeadshot
                        name={panel.player}
                        team={panel.playerTeam}
                        size={80}
                        shape="circle"
                      />
                    </div>
                    {/* Status badge */}
                    <div style={{
                      position: "absolute", top: 12, left: 14,
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "3px 8px", borderRadius: 20,
                      background: `${panel.accent}18`,
                      border: `1px solid ${panel.accent}44`,
                    }}>
                      <span style={{ color: panel.accent }}>{panel.icon}</span>
                      <span style={{
                        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                        fontSize: 8, fontWeight: 700, letterSpacing: "0.16em",
                        textTransform: "uppercase", color: panel.accent,
                      }}>{panel.subtitle}</span>
                    </div>
                  </div>

                  {/* Text content */}
                  <div style={{ padding: "16px 18px 18px" }}>
                    <div style={{
                      fontFamily: "'Playfair Display', Georgia, serif",
                      fontSize: 16, fontWeight: 700, color: T.text,
                      marginBottom: 8, lineHeight: 1.3,
                    }}>{panel.title}</div>
                    <div style={{
                      fontSize: 12, color: T.textMuted, lineHeight: 1.6,
                      marginBottom: 16,
                    }}>{panel.body}</div>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 5,
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
                      textTransform: "uppercase", color: panel.accent,
                    }}>
                      {panel.cta} <ArrowRight size={12} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          PRO CTA BAND
      ══════════════════════════════════ */}
      <section style={{
        background: `linear-gradient(135deg, rgba(202,168,90,0.08), rgba(202,168,90,0.03))`,
        borderBottom: `1px solid rgba(202,168,90,0.2)`,
      }}>
        <div style={{
          maxWidth: 1280, margin: "0 auto", padding: "48px 40px",
          display: "grid", gridTemplateColumns: "1fr auto",
          gap: 40, alignItems: "center",
        }}>
          <div>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.22em",
              textTransform: "uppercase", color: T.gold, marginBottom: 10,
            }}>Pro Intelligence</div>
            <h2 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "clamp(22px, 3vw, 36px)", fontWeight: 700,
              color: T.text, margin: "0 0 12px", letterSpacing: "-0.01em",
            }}>
              Full Archive. All Sports. Real-Time Alerts.
            </h2>
            <p style={{ fontSize: 14, color: T.textMuted, lineHeight: 1.6, margin: 0, maxWidth: 560 }}>
              Unlock the complete signal archive, pro-only alerts, early access to NFL and CFB boards, and multi-sport intelligence across every game.
            </p>
            <div style={{ display: "flex", gap: 24, marginTop: 20 }}>
              {[
                { icon: <Shield size={13} />, label: "Full Archive" },
                { icon: <Zap size={13} />, label: "Real-Time Alerts" },
                { icon: <BarChart3 size={13} />, label: "All 4 Sports" },
              ].map(f => (
                <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: T.gold }}>{f.icon}</span>
                  <span style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
                    textTransform: "uppercase", color: T.textMuted,
                  }}>{f.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 48, fontWeight: 800, color: T.gold, lineHeight: 1,
              marginBottom: 4,
            }}>$19</div>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.16em",
              textTransform: "uppercase", color: T.textFaint, marginBottom: 20,
            }}>per month</div>
            <button
              onClick={() => navigate("/pro")}
              style={{
                display: "block", width: "100%",
                padding: "14px 32px", borderRadius: 4,
                background: `linear-gradient(135deg, ${T.gold}, #8B6B2A)`,
                border: "none", color: "#000",
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 13, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase",
                cursor: "pointer",
                boxShadow: `0 4px 24px rgba(202,168,90,0.4)`,
              }}
            >Unlock Pro</button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          FOOTER
      ══════════════════════════════════ */}
      <footer style={{
        padding: "24px 40px",
        maxWidth: 1280, margin: "0 auto",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 10, color: T.textFaint, letterSpacing: "0.1em",
        }}>
          © 2026 Edge Setter · Multi-Sport Intelligence
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          {[
            { label: "NBA Board", href: "/v2/nba" },
            { label: "MLB Board", href: "/v2/mlb" },
            { label: "Tools", href: "/v2/tools" },
            { label: "Pro", href: "/pro" },
          ].map(link => (
            <button
              key={link.label}
              onClick={() => navigate(link.href)}
              style={{
                background: "none", border: "none",
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 10, color: T.textFaint, letterSpacing: "0.1em",
                textTransform: "uppercase", cursor: "pointer",
              }}
            >{link.label}</button>
          ))}
        </div>
      </footer>
    </div>
  );
}
