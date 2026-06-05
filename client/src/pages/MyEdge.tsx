import { useState } from "react";
import V2Shell from "../components/V2Shell";
import { Link } from "wouter";
import {
  ArrowRight, Star, Bell, TrendingUp, Users, Bookmark, Lock,
  Zap, ShieldCheck, Clock3, GitBranch, CheckCircle,
} from "lucide-react";
import { StoryCard, type StoryCardData } from "@/components/StoryCard";
import { WhatToWatchNext } from "@/components/AgentCalibration";
import { TeamLogo, T as _T } from "../components/v2/SportVisuals";
import { useAuth } from "@/context/AuthContext";

// Override legacy accent with site-wide clean gold
const T = { ..._T, gold: "#F5B841", goldBright: "#F5B841", goldDim: "rgba(245,184,65,0.15)" };

/* ── Feature card data ── */
interface FeatureCard {
  icon: React.ReactNode;
  title: string;
  description: string;
  statusLabel: string;
  status: "planned" | "coming" | "soon";
  accentColor: string;
  detail: string;
}

const FEATURES: FeatureCard[] = [
  {
    icon: <Star size={18} />,
    title: "Followed Teams",
    description: "Follow teams you care about so their developing stories surface first.",
    detail: "NBA and MLB followed teams define the first personalization pass. NFL and CFB follows stay limited until season coverage expands.",
    statusLabel: "Coming Soon",
    status: "coming",
    accentColor: T.gold,
  },
  {
    icon: <Bell size={18} />,
    title: "Story Alerts",
    description: "Get notified when confidence, source agreement, or timing changes for your watchlist.",
    detail: "Availability, lineup, pitcher, market, fantasy, and team/fan impact alerts start with NBA and MLB coverage.",
    statusLabel: "Included in Pro",
    status: "coming",
    accentColor: T.gold,
  },
  {
    icon: <TrendingUp size={18} />,
    title: "Watched Stories",
    description: "Track injury, lineup, pitcher, roster, market, or role-change stories.",
    detail: "Watched stories preserve what changed, why it matters, source agreement, and what to watch next.",
    statusLabel: "Preview",
    status: "coming",
    accentColor: "#00B7FF",
  },
  {
    icon: <Users size={18} />,
    title: "Followed Players",
    description: "Track player availability, role movement, fantasy impact, and recurring story context.",
    detail: "Player follows will power alert routing and daily intelligence priority once enabled.",
    statusLabel: "Coming Soon",
    status: "coming",
    accentColor: "#00B7FF",
  },
  {
    icon: <Bookmark size={18} />,
    title: "Story History",
    description: "Keep settled stories, source trail, confidence movement, and result context together.",
    detail: "Story history is planned as a clean research archive tied to your followed teams, players, and leagues.",
    statusLabel: "Planned",
    status: "planned",
    accentColor: T.orange,
  },
  {
    icon: <Lock size={18} />,
    title: "Personal Brief",
    description: "A daily brief built from followed leagues, teams, players, and watched stories.",
    detail: "The brief is planned after watchlist alerts so it can summarize your actual saved context.",
    statusLabel: "Planned",
    status: "planned",
    accentColor: T.gold,
  },
];

const TIMELINE_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  coming:  { color: T.gold,      bg: "rgba(245,184,65,0.1)",   border: "rgba(245,184,65,0.25)" },
  soon:    { color: T.green,     bg: "rgba(0,230,118,0.1)",   border: "rgba(0,230,118,0.25)" },
  planned: { color: T.textFaint, bg: "rgba(100,116,139,0.08)", border: "rgba(100,116,139,0.18)" },
};

const PREVIEW_STORIES: StoryCardData[] = [
  {
    id: "my-edge-preview-1",
    league: "NBA",
    label: "Preview story",
    storyType: "Availability watch",
    headline: "Followed-player availability would move fantasy and matchup context",
    dek: "Preview only: this shows how a watched player story will appear once personalization is connected.",
    primaryTeam: "LAL",
    secondaryTeam: "BOS",
    player: "Followed player",
    whatChanged: "Limited participation would move the story into watchlist review.",
    whyItMatters: "Fantasy projections, team rotation, and market reaction can all shift together.",
    watchNext: "Official status, beat confirmation, and whether the market reacts.",
    overlay: {
      escalationState: "Emerging",
      confidence: { current: 68, delta: 6, explanation: "Preview confidence movement" },
      sourceSummary: { count: 2, convergence: "Source agreement preview" },
      timing: { window: "Developing", freshnessLabel: "Setup preview" },
      replay: ["Preview created", "Awaiting followed-player data"],
      status: "Personalization preview",
    },
  },
  {
    id: "my-edge-preview-2",
    league: "MLB",
    label: "Preview story",
    storyType: "Lineup and market watch",
    headline: "Followed-team lineup change would trigger a watched-story alert",
    dek: "Preview only: personalized alerts will prioritize teams, players, leagues, and story types you choose.",
    primaryTeam: "LAD",
    secondaryTeam: "NYY",
    whatChanged: "A lineup or pitcher-context change would enter your watchlist.",
    whyItMatters: "Market, fantasy, and fan/team impact can update before public consensus settles.",
    watchNext: "Confirmed lineup, odds movement, and role impact after lock.",
    overlay: {
      escalationState: "Confirming",
      confidence: { current: 74, delta: 4, explanation: "Preview source agreement" },
      sourceSummary: { count: 3, convergence: "Reports corroborating" },
      timing: { window: "Early", freshnessLabel: "Not live personalization" },
      replay: ["Preview setup", "Source agreement example", "Timing edge example"],
      status: "Preview state",
    },
  },
];

/* ── Personal intelligence stat card ── */
function PersonalStat({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
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

function SetupPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "6px 9px", borderRadius: 3,
      background: "rgba(255,255,255,0.035)",
      border: "1px solid rgba(255,255,255,0.08)",
      color: T.textMuted,
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: 12, fontWeight: 750, letterSpacing: "0.08em", textTransform: "uppercase",
      minWidth: 0,
    }}>
      <span style={{ color: T.gold, display: "inline-flex" }}>{icon}</span>
      {label}
    </span>
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
        }}>{feature.statusLabel}</span>
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

function activeProStory(story: StoryCardData): StoryCardData {
  return {
    ...story,
    label: "Watchlist slot",
    dek: story.dek?.replace(/^Preview only:\s*/i, "Saved story area: "),
    overlay: {
      ...story.overlay,
      confidence: story.overlay?.confidence ? { ...story.overlay.confidence, explanation: "Watchlist confidence movement" } : undefined,
      sourceSummary: story.overlay?.sourceSummary ? { ...story.overlay.sourceSummary, convergence: "Source agreement ready" } : undefined,
      timing: story.overlay?.timing ? { ...story.overlay.timing, freshnessLabel: "Watchlist setup" } : undefined,
      status: "Watchlist ready",
      replay: ["Watchlist slot ready", "Awaiting saved story"],
    },
  };
}

export default function MyEdge() {
  const { email, isPro } = useAuth();

  return (
    <V2Shell>
      <style>{`
        @keyframes intelligence-pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
      `}</style>

      <div style={{ maxWidth: "min(980px, calc(100vw - 120px))", width: "100%", minWidth: 0, margin: "0 auto", padding: "32px 0 60px", boxSizing: "border-box", overflowX: "hidden" }}>

        {/* ── Hero header ── */}
        <div style={{
          position: "relative", overflow: "hidden",
          borderRadius: 6, padding: "28px 28px 24px",
          background: "linear-gradient(135deg, rgba(245,184,65,0.08) 0%, rgba(245,184,65,0.02) 50%, transparent 100%)",
          border: `1px solid rgba(245,184,65,0.22)`,
          marginBottom: 28,
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, #F5B841, #FFD16644)" }} />

          <div style={{ position: "relative", zIndex: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Star size={13} style={{ color: T.gold }} />
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: T.textFaint,
              }}>{isPro ? "My Edge" : "My Edge - Personal Intelligence"}</span>
            </div>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, fontWeight: 700, color: T.text, margin: "0 0 10px" }}>
              {isPro ? "My Edge" : "Personal watchlist coming soon"}
            </h1>
            <p style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 12, color: T.textMuted, margin: 0, lineHeight: 1.7,
              maxWidth: "min(540px, 100%)", letterSpacing: "0.04em", overflowWrap: "anywhere",
            }}>
              {isPro
                ? `Pro access active${email ? ` for ${email}` : ""}. Choose leagues, teams, and players to prioritize your EdgeSetter feed.`
                : "My Edge will shape EdgeSetter around teams, players, leagues, and developing stories you follow. This page is a preview of the planned personal watchlist and alert workflow."}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 14 }}>
              <SetupPill icon={<Star size={13} />} label="Follow teams" />
              <SetupPill icon={<Users size={13} />} label="Follow players" />
              <SetupPill icon={<TrendingUp size={13} />} label="Watch stories" />
              <SetupPill icon={<Bell size={13} />} label="Alert thresholds" />
            </div>
            {!isPro && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
                <Link href="/login?next=%2Fmy-edge">
                  <button style={{
                    background: "rgba(248,250,252,0.08)", color: T.text,
                    border: "1px solid rgba(248,250,252,0.18)", borderRadius: 3,
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 12, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase",
                    padding: "9px 18px", cursor: "pointer",
                  }}>
                    Sign In
                  </button>
                </Link>
                <Link href="/pro">
                  <button style={{
                    background: T.gold, color: T.bg, border: "none", borderRadius: 3,
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 12, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase",
                    padding: "9px 18px", cursor: "pointer",
                  }}>
                    Get Pro
                  </button>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ── Personal feed stat row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: 8, marginBottom: 24 }}>
          <PersonalStat label="Feed Layers" value="7" color={T.gold} />
          <PersonalStat label={isPro ? "Pro Access" : "Setup Preview"} value={isPro ? "Active" : "On"} color={T.green} />
          <PersonalStat label="Saved Sports" value="NBA / MLB" color="#00B7FF" />
          <PersonalStat label="Alert Profile" value="Saved" color={T.gold} />
        </div>

        {isPro && (
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 10, marginBottom: 24 }}>
            {[
              { label: "Followed leagues", value: "NBA and MLB prioritized", icon: <Star size={14} /> },
              { label: "Followed teams", value: "Team priorities ready to manage", icon: <Users size={14} /> },
              { label: "Watchlist", value: "Watchlist area ready for story saves", icon: <Bookmark size={14} /> },
              { label: "Alert preferences", value: "Confidence threshold profile saved in Alerts", icon: <Bell size={14} /> },
            ].map((item) => (
              <div key={item.label} style={{ padding: "14px 16px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, background: T.surface1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, color: T.gold }}>
                  {item.icon}
                  <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" }}>{item.label}</span>
                </div>
                <p style={{ margin: 0, color: T.textMuted, fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, lineHeight: 1.5, letterSpacing: "0.04em" }}>{item.value}</p>
              </div>
            ))}
            <Link href="/alerts">
              <button style={{ padding: "11px 14px", minHeight: 48, border: "1px solid rgba(245,184,65,0.28)", background: "rgba(245,184,65,0.10)", color: T.gold, borderRadius: 4, fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>Manage Alerts</button>
            </Link>
            <Link href="/billing">
              <button style={{ padding: "11px 14px", minHeight: 48, border: "1px solid rgba(24,212,123,0.28)", background: "rgba(24,212,123,0.10)", color: T.green, borderRadius: 4, fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>Manage Billing</button>
            </Link>
          </section>
        )}

        {/* ── Status development banner ── */}
        <div style={{
          padding: "14px 18px",
          background: "rgba(245,184,65,0.04)", border: `1px solid rgba(245,184,65,0.18)`,
          borderRadius: 5, marginBottom: 32, display: "flex", alignItems: "flex-start", gap: 12,
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%", background: T.gold, flexShrink: 0, marginTop: 5,
            animation: "intelligence-pulse 2s ease-in-out infinite",
          }} />
          <div>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
              color: T.gold, marginBottom: 5,
            }}>{isPro ? "Pro access active" : "Coming Soon - Preview"}</div>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 12, color: T.textMuted, lineHeight: 1.6, letterSpacing: "0.04em",
            }}>
              {isPro
                ? "Your followed leagues, team priorities, watchlist area, alert preferences, and account actions are ready to manage."
                : "Followed teams, followed players, watched stories, and alert routing are not active yet. The examples below show the planned shape without implying saved personalization is available today."}
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
          }}>{isPro ? "Followed Leagues and Teams" : "Followed Intelligence Setup Preview"}</div>
          <TeamSilhouettes />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
            <SetupPill icon={<ShieldCheck size={13} />} label="Injuries" />
            <SetupPill icon={<TrendingUp size={13} />} label="Lineups" />
            <SetupPill icon={<GitBranch size={13} />} label="Roster moves" />
            <SetupPill icon={<Clock3 size={13} />} label="Market moves" />
            <SetupPill icon={<Users size={13} />} label="Fantasy roles" />
          </div>
        </div>

        <section style={{ marginBottom: 34 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 3, height: 16, borderRadius: 2, background: T.gold }} />
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 13, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.gold,
            }}>{isPro ? "Watchlist Area" : "Personalized Story Preview"}</span>
          </div>
          <p style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, color: T.textMuted, lineHeight: 1.6, letterSpacing: "0.04em",
            margin: "0 0 12px", maxWidth: 700,
          }}>
            {isPro
              ? "Saved story slots will collect watched developments from your prioritized leagues and teams."
              : "These are preview cards only. They show the intended My Edge shape for watched stories: what changed, why it matters, source agreement, confidence movement, timing, replay state, and what to watch next."}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 12 }}>
            {PREVIEW_STORIES.map((story) => (
              <StoryCard
                key={story.id}
                story={isPro ? activeProStory(story) : story}
                variant="compact"
              />
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 34 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 3, height: 16, borderRadius: 2, background: T.green }} />
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 13, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.green,
            }}>{isPro ? "Alert Preference Summary" : "Alert Preferences Preview"}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 10, marginBottom: 12 }}>
            {[
              "Confidence rises",
              "Official confirmation appears",
              "Market reaction moves",
              "Fantasy or team impact changes",
              "Watched story weakens or resolves",
            ].map((label) => (
              <div key={label} style={{ padding: "12px 14px", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, background: T.surface1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <CheckCircle size={13} style={{ color: T.green, flexShrink: 0 }} />
                  <strong style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: T.text, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</strong>
                </div>
              </div>
            ))}
          </div>
          <WhatToWatchNext
            confirm="A watched story strengthens when reliable sources agree, official status appears, or market/fantasy/team context follows."
            weaken="It weakens when reports conflict, the source trail goes stale, market reaction reverses, or official clarification changes the read."
            next="Personal alert routing will prioritize the teams, players, leagues, and story types you follow."
          />
        </section>

        {/* ── Feature grid ── */}
        {!isPro && <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 3, height: 16, borderRadius: 2, background: T.gold }} />
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 13, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.gold,
            }}>Followed Intelligence Layers</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 12, marginBottom: 40 }}>
            {FEATURES.map(feature => (
              <FeatureCardItem key={feature.title} feature={feature} />
            ))}
          </div>
        </div>}

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
              { label: "NBA Board",          desc: "Developing stories and followed-team context.", href: "/nba",      color: T.gold,      dotColor: T.gold },
              { label: "MLB Board",          desc: "Active pitcher, lineup, and weather context.", href: "/mlb",   color: "#00B7FF",   dotColor: "#00B7FF" },
              { label: "Alerts",             desc: "Saved preference profile and thresholds.", href: "/alerts", color: T.gold, dotColor: T.green },
              { label: "Pro / Billing",      desc: "Manage subscription and access.",           href: "/billing",    color: T.textMuted, dotColor: T.textFaint },
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
          background: isPro ? "linear-gradient(135deg, rgba(24,212,123,0.07) 0%, transparent 70%)" : "linear-gradient(135deg, rgba(245,184,65,0.07) 0%, transparent 70%)",
          border: `1px solid ${isPro ? "rgba(24,212,123,0.28)" : "rgba(245,184,65,0.3)"}`,
          borderRadius: 5, position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: isPro ? T.green : T.gold }} />
          <div style={{ position: "absolute", bottom: -30, right: -30, width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle, rgba(245,184,65,0.05), transparent 70%)", pointerEvents: "none" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Zap size={13} style={{ color: isPro ? T.green : T.gold }} />
            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: isPro ? T.green : T.gold }}>
              {isPro ? "Pro access active" : "Pro - Early Access to My Edge"}
            </span>
          </div>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 8 }}>
            {isPro ? "Subscriber Account Active" : "Get Early Access to Personalization"}
          </div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, color: T.textMuted, lineHeight: 1.7, letterSpacing: "0.04em",
            marginBottom: 18, maxWidth: 500,
          }}>
            {isPro
              ? "You have Pro access. Alerts, billing, and saved sports focus are available now; deeper watched-story history and followed-player routing remain roadmap items below."
              : "Pro subscribers get saved preferences, watched-story setup, daily brief routing, and story history as each layer ships."}
          </div>
          <Link href={isPro ? "/billing" : "/pro"}>
            <button style={{
              background: isPro ? "rgba(24,212,123,0.12)" : T.gold, color: isPro ? T.green : T.bg, border: isPro ? "1px solid rgba(24,212,123,0.32)" : "none", borderRadius: 3,
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
              padding: "10px 24px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              {isPro ? "Manage Billing" : "Go Pro - $19/mo"} <ArrowRight size={12} />
            </button>
          </Link>
        </div>
      </div>
    </V2Shell>
  );
}

