import { useState } from "react";
import V2Shell from "../components/V2Shell";
import { Link } from "wouter";
import {
  ArrowRight, Star, Bell, TrendingUp, Users, Bookmark, Lock,
  ChevronRight, Zap, Activity, BarChart2,
} from "lucide-react";
import { TeamLogo, PlayerAvatar, T as _T, getTeamColors } from "../components/v2/SportVisuals";

// Override legacy accent with site-wide clean gold
const T = { ..._T, gold: "#F5B841", goldBright: "#F5B841", goldDim: "rgba(245,184,65,0.15)" };

/* ── Feature card data ── */
interface FeatureCard {
  icon: React.ReactNode;
  title: string;
  description: string;
  timeline: string;
  status: "planned" | "coming" | "soon";
  accentColor: string;
  detail: string;
}

const FEATURES: FeatureCard[] = [
  {
    icon: <Star size={18} />,
    title: "Saved Teams",
    description: "Follow teams you care about so their board situations surface first.",
    detail: "NBA and MLB saved teams define the first personalization pass. NFL and CFB follows stay limited until season coverage expands.",
    timeline: "Q3 2026",
    status: "coming",
    accentColor: T.gold,
  },
  {
    icon: <Bell size={18} />,
    title: "Watchlist Alerts",
    description: "Get notified when saved teams, players, or situations cross your alert threshold.",
    detail: "Availability, lineup, pitcher, and context-movement alerts start with NBA and MLB coverage.",
    timeline: "Q3 2026",
    status: "coming",
    accentColor: T.gold,
  },
  {
    icon: <TrendingUp size={18} />,
    title: "Saved Situations",
    description: "Keep injury, lineup, pitcher, weather, or role-change situations on your desk.",
    detail: "Saved situations preserve the context trail so you can revisit what changed and why it mattered.",
    timeline: "Q3 2026",
    status: "coming",
    accentColor: "#00B7FF",
  },
  {
    icon: <Users size={18} />,
    title: "Saved Players",
    description: "Track player availability, role movement, and recurring signal context.",
    detail: "Player follows power alert routing and daily digest priority once enabled.",
    timeline: "Q3 2026",
    status: "coming",
    accentColor: "#00B7FF",
  },
  {
    icon: <Bookmark size={18} />,
    title: "Saved Signal History",
    description: "Bookmark signals and keep the full read, source picture, and result context together.",
    detail: "Signal history is planned as a clean research archive tied to your saved teams and players.",
    timeline: "Q4 2026",
    status: "planned",
    accentColor: T.orange,
  },
  {
    icon: <Lock size={18} />,
    title: "Daily Digest",
    description: "A daily brief built from followed leagues, saved teams, saved players, and watchlist alerts.",
    detail: "The digest is planned after watchlist alerts so it can summarize your actual saved context.",
    timeline: "Q4 2026",
    status: "planned",
    accentColor: T.gold,
  },
];

const TIMELINE_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  coming:  { color: T.gold,      bg: "rgba(245,184,65,0.1)",   border: "rgba(245,184,65,0.25)" },
  soon:    { color: T.green,     bg: "rgba(0,230,118,0.1)",   border: "rgba(0,230,118,0.25)" },
  planned: { color: T.textFaint, bg: "rgba(100,116,139,0.08)", border: "rgba(100,116,139,0.18)" },
};

/* ── Stat cockpit card ── */
function CockpitStat({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 100,
      padding: "14px 16px",
      background: T.surface2,
      border: `1px solid rgba(255,255,255,0.06)`,
      borderRadius: 4, textAlign: "center",
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 13, color: T.textFaint, letterSpacing: "0.1em", marginTop: 2 }}>{sub}</div>}
      <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.textFaint, marginTop: 4 }}>{label}</div>
    </div>
  );
}

/* ── Feature card component ── */
function FeatureCardItem({ feature }: { feature: FeatureCard }) {
  const [hovered, setHovered] = useState(false);
  const ts = TIMELINE_STYLE[feature.status];

  return (
    <div
      data-testid={`my-edge-feature-${feature.title.toLowerCase().replace(/\s+/g, "-")}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "18px 18px 16px",
        background: hovered ? `${feature.accentColor}08` : T.surface1,
        border: `1px solid ${hovered ? feature.accentColor + "33" : "rgba(255,255,255,0.07)"}`,
        borderRadius: 5, display: "flex", flexDirection: "column", gap: 10,
        opacity: 0.88, transition: "border-color 0.14s, background 0.14s",
        position: "relative", overflow: "hidden",
      }}
    >
      {/* Left accent */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
        background: feature.status === "coming" ? feature.accentColor : "transparent",
        borderRadius: "3px 0 0 3px",
        opacity: feature.status === "coming" ? 1 : 0,
        transition: "opacity 0.15s",
      }} />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, paddingLeft: feature.status === "coming" ? 6 : 0 }}>
        {/* Icon badge */}
        <div style={{
          width: 34, height: 34, borderRadius: 5, flexShrink: 0,
          background: `${feature.accentColor}14`,
          border: `1px solid ${feature.accentColor}2A`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: feature.accentColor, opacity: 0.85,
        }}>
          {feature.icon}
        </div>
        {/* Timeline badge */}
        <span style={{
          padding: "2px 7px", borderRadius: 2,
          background: ts.bg, color: ts.color,
          border: `1px solid ${ts.border}`,
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
          flexShrink: 0,
        }}>{feature.timeline}</span>
      </div>

      <div style={{ paddingLeft: feature.status === "coming" ? 6 : 0 }}>
        <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 5 }}>
          {feature.title}
        </div>
        <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: T.textMuted, lineHeight: 1.6, letterSpacing: "0.03em" }}>
          {feature.description}
        </div>
        {hovered && (
          <div style={{
            marginTop: 8,
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 13, color: feature.accentColor, lineHeight: 1.5, letterSpacing: "0.04em",
            borderTop: `1px solid ${feature.accentColor}22`, paddingTop: 8,
          }}>
            {feature.detail}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Followed team preview ── */
function TeamSilhouettes() {
  const teams = ["LAL", "BOS", "GSW", "DEN", "NYY", "LAD"];
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {teams.map(t => (
        <div key={t} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 8px", background: "rgba(255,255,255,0.03)", borderRadius: 3 }}>
          <TeamLogo abbr={t} size={18} />
          <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textFaint }}>{t}</span>
        </div>
      ))}
      <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: T.textFaint }}>followed league and team examples</span>
    </div>
  );
}

export default function MyEdge() {
  return (
    <V2Shell>
      <style>{`
        @keyframes cockpit-pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
      `}</style>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 28px 60px" }}>

        {/* ── Hero header ── */}
        <div style={{
          position: "relative", overflow: "hidden",
          borderRadius: 6, padding: "28px 28px 24px",
          background: "linear-gradient(135deg, rgba(245,184,65,0.08) 0%, rgba(245,184,65,0.02) 50%, transparent 100%)",
          border: `1px solid rgba(245,184,65,0.22)`,
          marginBottom: 28,
        }}>
          {/* Top gold bar */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, #F5B841, #FFD16644)" }} />
          {/* Background orb */}
          <div style={{
            position: "absolute", right: -60, top: -60, width: 280, height: 280, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(245,184,65,0.05), transparent 70%)",
            pointerEvents: "none",
          }} />

          <div style={{ position: "relative", zIndex: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Star size={13} style={{ color: T.gold }} />
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: T.textFaint,
              }}>My Edge — Personalization Cockpit</span>
            </div>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, fontWeight: 700, color: T.text, margin: "0 0 10px" }}>
              Your Personalized Research Hub
            </h1>
            <p style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 12, color: T.textMuted, margin: 0, lineHeight: 1.7,
              maxWidth: 540, letterSpacing: "0.04em",
            }}>
              My Edge is the personalization layer of Edge Setter: saved teams, saved players, saved situations, watchlist alerts, followed leagues, a daily digest, and saved signal history.
              Disabled items below are labeled by rollout state, but this is the system that will shape your desk around the sports context you follow.
            </p>
          </div>
        </div>

        {/* ── Cockpit stat row ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          <CockpitStat label="Personal Layers" value="7" color={T.gold} />
          <CockpitStat label="Launching" value="Q3" sub="2026" color={T.green} />
          <CockpitStat label="Followed Leagues" value="4" color="#00B7FF" />
          <CockpitStat label="Pro Early Access" value="On" color={T.gold} />
        </div>

        {/* ── Status development banner ── */}
        <div style={{
          padding: "14px 18px",
          background: "rgba(245,184,65,0.04)", border: `1px solid rgba(245,184,65,0.18)`,
          borderRadius: 5, marginBottom: 32, display: "flex", alignItems: "flex-start", gap: 12,
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%", background: T.gold, flexShrink: 0, marginTop: 5,
            animation: "cockpit-pulse 2s ease-in-out infinite",
          }} />
          <div>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
              color: T.gold, marginBottom: 5,
            }}>In Development — Launching Q3 2026</div>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 12, color: T.textMuted, lineHeight: 1.6, letterSpacing: "0.04em",
            }}>
              Pro subscribers will get early access to My Edge features as they roll out. 
              Saved teams, saved players, saved situations, and watchlist alerts launch first; saved signal history and the daily digest follow after that foundation is active.
            </div>
          </div>
        </div>

        {/* ── Coming teams preview ── */}
        <div style={{
          padding: "16px 18px", background: T.surface1,
          border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 5, marginBottom: 32,
        }}>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.textFaint,
            marginBottom: 12,
          }}>Followed League Preview</div>
          <TeamSilhouettes />
        </div>

        {/* ── Feature grid ── */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 3, height: 16, borderRadius: 2, background: T.gold }} />
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 13, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.gold,
            }}>Personalization Layers</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 12, marginBottom: 40 }}>
            {FEATURES.map(feature => (
              <FeatureCardItem key={feature.title} feature={feature} />
            ))}
          </div>
        </div>

        {/* ── Available now section ── */}
        <section style={{ marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 3, height: 16, borderRadius: 2, background: T.green }} />
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 13, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.green,
            }}>Available Now</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {[
              { label: "NBA Board",          desc: "Live signal stream and saved-team source.", href: "/nba",      color: T.gold,      dotColor: T.gold },
              { label: "MLB Board",          desc: "Active pitcher, lineup, and weather context.", href: "/mlb",   color: "#00B7FF",   dotColor: "#00B7FF" },
              { label: "Tool Desk",          desc: "Live, active, and limited workflows clearly labeled.", href: "/tools", color: T.gold, dotColor: T.green },
              { label: "Source Leaderboard", desc: "Track source reliability.",           href: "/sources",    color: T.textMuted, dotColor: T.textFaint },
            ].map(item => (
              <Link key={item.label} href={item.href}>
                <div
                  style={{ padding: "13px 16px", background: T.surface1, border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 4, cursor: "pointer", transition: "border-color 0.12s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(245,184,65,0.22)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.07)"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: item.dotColor }} />
                      <div style={{
                        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                        fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: item.color,
                      }}>{item.label}</div>
                    </div>
                    <ArrowRight size={11} style={{ color: T.textFaint }} />
                  </div>
                  <div style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 12, color: T.textFaint, letterSpacing: "0.04em",
                    paddingLeft: 12,
                  }}>{item.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Pro CTA ── */}
        <div style={{
          padding: "24px 24px",
          background: "linear-gradient(135deg, rgba(245,184,65,0.07) 0%, transparent 70%)",
          border: `1px solid rgba(245,184,65,0.3)`,
          borderRadius: 5, position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: T.gold }} />
          <div style={{ position: "absolute", bottom: -30, right: -30, width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle, rgba(245,184,65,0.05), transparent 70%)", pointerEvents: "none" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Zap size={13} style={{ color: T.gold }} />
            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.gold }}>
              Pro — Early Access to My Edge
            </span>
          </div>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 8 }}>
            Get Early Access to Personalization
          </div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, color: T.textMuted, lineHeight: 1.7, letterSpacing: "0.04em",
            marginBottom: 18, maxWidth: 500,
          }}>
            Pro subscribers get first access to every My Edge feature as it ships, plus real-time alerts, 
            saved situations, daily digest routing, and saved signal history as each layer ships.
          </div>
          <Link href="/pro">
            <button style={{
              background: T.gold, color: T.bg, border: "none", borderRadius: 3,
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
              padding: "10px 24px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              Go Pro · $19/mo <ArrowRight size={12} />
            </button>
          </Link>
        </div>
      </div>
    </V2Shell>
  );
}

