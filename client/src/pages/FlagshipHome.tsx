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
import { HeadlineStoryRail, SportsStoryVisual, leagueToSport, type HeadlineStoryItem } from "../components/SportsMedia";
import { NBA_SIGNALS, NBA_TONIGHT, type V2Signal } from "../data/v2MockData";
import { Zap, ArrowRight, TrendingUp, Shield, BarChart3, ChevronRight, ChevronDown, Activity } from "lucide-react";
import { SignalDetailDrawer } from "../components/SignalDetailDrawer";
import { canonicalConfidenceSummary, canonicalEvidenceSummary, fetchCanonicalSituations, type CanonicalSituation } from "../lib/situationsApi";
import { canonicalSituationToDrawerSignal } from "../lib/situationAdapters";

// Local token override — warm LFL values
const T = {
  bg:        "#050505", surface1: "#0A0F1A", surface2: "#101827",
  gold:      "#F5B841", goldBright: "#FFD166",
  goldDim:   "rgba(245,184,65,0.14)", goldGlow: "rgba(245,184,65,0.07)",
  goldStrong:"rgba(245,184,65,0.38)",
  text:      "#F8FAFC", textMuted: "#94A3B8", textFaint: "#64748B",
  green:     "#00E676", cyan: "#00B7FF", danger: "#FF5252",
  border:    "rgba(245,184,65,0.12)", borderMid: "rgba(245,184,65,0.22)",
};

const SPORT_CONFIG = [
  { label: "NBA", status: "ACTIVE", color: "#00B7FF", dot: "#00B7FF", href: "/nba", desc: "Playoff stretch — injury flags, context movement, rotation intel",        logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png" },
  { label: "MLB", status: "ACTIVE", color: "#00B7FF", dot: "#00B7FF", href: "/mlb", desc: "Regular season — pitcher updates, lineup cards, sharp tracking",        logo: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png" },
  { label: "NFL", status: "MONITORING", color: "#FF5252", dot: "#FF8A00", href: "/nfl", desc: "Offseason watch — injuries, depth charts, line shifts, matchup intel", logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png" },
  { label: "CFB", status: "MONITORING", color: "#00B7FF", dot: "#FF8A00", href: "/cfb", desc: "Offseason watch — transfer intel, QB battles, coaching scheme edges",  logo: "https://a.espncdn.com/i/teamlogos/leagues/500/ncaa.png" },
] as const;

const HERO_SIGNAL  = NBA_SIGNALS.find(s => s.confidence >= 84) ?? NBA_SIGNALS[0];
const TOP_SIGNALS  = NBA_SIGNALS.slice(0, 5);

const HOW_TO_USE = [
  ["Detect", "Catch injuries, lineup changes, and context movement as they hit the board."],
  ["Verify", "Check confidence, source coverage, and context movement in one place."],
  ["Act", "Use the playable range, timing, and edge notes before the window closes."],
];

const TRUST_FACTORS = [
  "source reliability",
  "source coverage",
  "timing freshness",
  "context movement",
  "settled history when available",
];

const SIGNAL_WORKFLOW = [
  ["Timing Edge", "Shows whether a signal is early, developing, widely known, or losing edge."],
  ["Source Coverage", "Separates single-source notes from signals with broader source support."],
  ["Confidence Drivers", "Breaks confidence into source quality, context movement, timing, and settled context."],
  ["Action Window", "Clarifies playable range, edge decay, and when a signal should move to watch-only."],
];

const MLB_GAMES = [
  { id: "m1", away: "HOU", home: "NYY", time: "1:05 PM ET",  spread: "NYY -115", total: "8"   },
  { id: "m2", away: "LAD", home: "ATL", time: "4:10 PM ET",  spread: "ATL -108", total: "8.5" },
  { id: "m3", away: "CHC", home: "NYM", time: "7:10 PM ET",  spread: "NYM -112", total: "8"   },
];

const LIVE_PRESSURE_BOARD = [
  { league: "MLB", matchup: "SEA @ ATH", state: "Lineup pressure", movement: "+3 checks", time: "6m", color: "#00E676" },
  { league: "NBA", matchup: "LAL @ BOS", state: "Warmup window", movement: "Q tag active", time: "12m", color: "#00B7FF" },
  { league: "NFL", matchup: "SF @ DAL", state: "Practice delta", movement: "role watch", time: "22m", color: "#FF8A00" },
  { league: "CFB", matchup: "UGA @ BAMA", state: "Roster watch", movement: "source split", time: "31m", color: "#B06EFF" },
];

const LIVE_MOVEMENT_TAPE = [
  ["Escalating", "3", "#F5B841"],
  ["Source checks", "64", "#00E676"],
  ["Watch windows", "11", "#00B7FF"],
  ["Quiet boards", "2", "#94A3B8"],
] as const;

function firstSignalValue<T>(...values: Array<T | null | undefined>) {
  return values.find(value => value !== null && value !== undefined && value !== "") ?? null;
}

function displaySignalCount(value: unknown) {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function displayFreshness(value: unknown) {
  if (typeof value !== "string" || !value) return "Monitoring";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}

function displayConfidence(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : null;
  if (!parsed || Number.isNaN(parsed)) return null;
  if (parsed >= 96) return "95%+";
  return `${Math.round(parsed)}%`;
}

function confidenceValue(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : null;
  return parsed && !Number.isNaN(parsed) ? parsed : null;
}

function isCanonicalSituation(value: unknown): value is CanonicalSituation {
  return Boolean(value && typeof value === "object" && "lifecycleState" in value && "replayHash" in value);
}

function previewPlayer(value: any) {
  return value?.player ?? value?.players?.[0] ?? null;
}

function previewVerdict(value: any) {
  if (value?.verdict) return value.verdict;
  if (value?.lifecycleState === "confirmed" || value?.lifecycleState === "official") return "confirmed";
  if (value?.lifecycleState === "invalidated") return "contradicted";
  if (value?.lifecycleState === "watching" || value?.lifecycleState === "cooling" || value?.lifecycleState === "resolved") return "review";
  return "likely";
}

/* ── Four-quadrant chalk background — inline styles, no CSS class dependency ── */
const CHALK_NBA = "repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(0,183,255,0.16) 39px,rgba(0,183,255,0.16) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(0,183,255,0.10) 39px,rgba(0,183,255,0.10) 40px)";
const CHALK_MLB = "repeating-linear-gradient(45deg,transparent,transparent 28px,rgba(0,183,255,0.26) 28px,rgba(0,183,255,0.26) 29px),repeating-linear-gradient(-45deg,transparent,transparent 28px,rgba(0,183,255,0.18) 28px,rgba(0,183,255,0.18) 29px)";
const CHALK_NFL = "repeating-linear-gradient(0deg,transparent,transparent 19px,rgba(255,82,82,0.28) 19px,rgba(255,82,82,0.28) 20px)";
const CHALK_CFB = "repeating-linear-gradient(0deg,transparent,transparent 19px,rgba(0,183,255,0.24) 19px,rgba(0,183,255,0.24) 20px)";
const FIELD_MARKINGS = "repeating-linear-gradient(90deg, transparent 0, transparent 78px, rgba(203,213,225,0.045) 79px, transparent 80px),repeating-linear-gradient(0deg, transparent 0, transparent 23px, rgba(203,213,225,0.025) 24px, transparent 25px)";
const HASH_MARKS = "repeating-linear-gradient(90deg, transparent 0, transparent 34px, rgba(148,163,184,0.055) 35px, transparent 36px),linear-gradient(0deg, transparent 0 32%, rgba(148,163,184,0.05) 32% 33%, transparent 33% 67%, rgba(148,163,184,0.05) 67% 68%, transparent 68%)";
const FIELD_GRAIN = "radial-gradient(circle at 18% 22%, rgba(245,184,65,0.06), transparent 28%),radial-gradient(circle at 78% 14%, rgba(0,183,255,0.07), transparent 30%),radial-gradient(circle at 66% 78%, rgba(0,230,118,0.035), transparent 32%)";

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
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 65% 60% at 50% 50%, transparent 10%, rgba(5,5,5,0.45) 55%, rgba(5,5,5,0.65) 100%)" }} />
      {/* Hairline gold cross — subtle quadrant divider */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,transparent 49.2%,rgba(245,184,65,0.08) 49.8%,rgba(245,184,65,0.08) 50.2%,transparent 50.8%),linear-gradient(180deg,transparent 49.2%,rgba(245,184,65,0.08) 49.8%,rgba(245,184,65,0.08) 50.2%,transparent 50.8%)" }} />
    </div>
  );
}

function TacticalBg() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #050505 0%, #06100D 36%, #050505 100%)" }} />
      <div style={{ position: "absolute", inset: "-8% -4% 0", opacity: 0.72, backgroundImage: FIELD_MARKINGS, backgroundSize: "80px 100%, 100% 25px", transform: "perspective(900px) rotateX(54deg) translateY(-8%)", transformOrigin: "50% 0%" }} />
      <div style={{ position: "absolute", inset: "5% 0 0", opacity: 0.38, backgroundImage: HASH_MARKS, backgroundSize: "36px 100%, 100% 100%" }} />
      <svg viewBox="0 0 1200 760" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.18 }}>
        <defs>
          <filter id="chalk-soft">
            <feGaussianBlur stdDeviation="0.35" />
          </filter>
        </defs>
        <g fill="none" strokeLinecap="round" strokeLinejoin="round" filter="url(#chalk-soft)">
          <path d="M135 560 C 250 490, 300 410, 382 302 S 560 150, 676 124" stroke="rgba(203,213,225,0.34)" strokeWidth="1.3" strokeDasharray="10 16" />
          <path d="M220 622 L 358 500 L 500 500 L 662 356" stroke="rgba(0,183,255,0.22)" strokeWidth="1.4" strokeDasharray="16 20" />
          <path d="M760 620 C 790 510, 878 438, 1008 404 L 1080 372" stroke="rgba(245,184,65,0.22)" strokeWidth="1.2" strokeDasharray="8 14" />
          <path d="M780 182 L 900 246 L 1006 246 L 1110 306" stroke="rgba(203,213,225,0.22)" strokeWidth="1.1" strokeDasharray="12 18" />
          <circle cx="382" cy="302" r="5" stroke="rgba(203,213,225,0.28)" strokeWidth="1" />
          <circle cx="662" cy="356" r="5" stroke="rgba(0,183,255,0.20)" strokeWidth="1" />
          <circle cx="1008" cy="404" r="5" stroke="rgba(245,184,65,0.18)" strokeWidth="1" />
        </g>
      </svg>
      <div style={{ position: "absolute", inset: 0, backgroundImage: FIELD_GRAIN, mixBlendMode: "screen", opacity: 0.66 }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 52% at 50% 10%, rgba(148,163,184,0.075), transparent 58%),radial-gradient(ellipse 75% 80% at 50% 52%, transparent 8%, rgba(5,5,5,0.56) 62%, rgba(5,5,5,0.86) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(5,5,5,0.82), transparent 18%, transparent 82%, rgba(5,5,5,0.82)),linear-gradient(180deg, rgba(5,5,5,0.18), rgba(5,5,5,0.72))" }} />
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
  const mobileTextWidth = isMobile ? Math.max(280, Math.min(windowWidth - 28, 362)) : undefined;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [featuredOpen, setFeaturedOpen] = useState(false);
  const [liveSignals, setLiveSignals] = useState<any[]>([]);
  const [liveSituations, setLiveSituations] = useState<CanonicalSituation[]>([]);
  const [liveSignalState, setLiveSignalState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [selectedSignal, setSelectedSignal] = useState<any | null>(null);

  useEffect(() => {
    fetchCanonicalSituations({ activeOnly: false, limit: 15, orderBy: "operational_visibility_score" })
      .then(async (situations) => {
        setLiveSituations(situations);
        if (situations.length) {
          setLiveSignals([]);
          setLiveSignalState("ready");
          return;
        }
        const r = await fetch("/api/v2/signals?limit=15");
        const data = await r.json();
        const next = Array.isArray(data) ? data : data.signals ?? [];
        setLiveSignals(next);
        setLiveSignalState(next.length ? "ready" : "empty");
      })
      .catch(() => {
        fetch("/api/v2/signals?limit=15")
          .then(r => r.json())
          .then(data => {
            const next = Array.isArray(data) ? data : data.signals ?? [];
            setLiveSignals(next);
            setLiveSituations([]);
            setLiveSignalState(next.length ? "ready" : "empty");
          })
          .catch(() => {
            setLiveSituations([]);
            setLiveSignals([]);
            setLiveSignalState("error");
          });
      });
  }, []);

  const livePreview = liveSituations[0] ?? liveSignals[0] ?? HERO_SIGNAL;
  const livePreviewTeam = String(firstSignalValue((livePreview as any).team, (livePreview as any).teams?.[0], HERO_SIGNAL.team) ?? HERO_SIGNAL.team);
  const livePreviewOpponent = String(firstSignalValue((livePreview as any).opponent, (livePreview as any).teams?.[1], HERO_SIGNAL.opponent) ?? HERO_SIGNAL.opponent ?? livePreviewTeam);
  const heroColors = getTeamColors(livePreviewTeam);
  const oppColors  = getTeamColors(livePreviewOpponent);
  const livePreviewSport = String(firstSignalValue((livePreview as any).league, (livePreview as any).sport, "MULTI") ?? "MULTI").toUpperCase();
  const livePreviewTitle = String(firstSignalValue((livePreview as any).headline, (livePreview as any).title, "Monitoring verified situation flow") ?? "Monitoring verified situation flow");
  const livePreviewType = String(firstSignalValue((livePreview as any).type, (livePreview as any).signal_type, (livePreview as any).situationType, "Situation") ?? "Situation");
  const livePreviewConfidence = firstSignalValue((livePreview as any).confidence, (livePreview as any).confidence_score);
  const livePreviewConfidenceLabel = displayConfidence(livePreviewConfidence);
  const livePreviewConfidenceValue = confidenceValue(livePreviewConfidence) ?? HERO_SIGNAL.confidence;
  const livePreviewSources = displaySignalCount(firstSignalValue((livePreview as any).source_count, (livePreview as any).sourceCount, (livePreview as any).sources, (livePreview as any).sourceLabels?.length));
  const livePreviewFreshness = displayFreshness(firstSignalValue((livePreview as any).timestamp, (livePreview as any).signal_time, (livePreview as any).lastUpdatedAt, (livePreview as any).updated_at, (livePreview as any).created_at, "Monitoring"));
  const livePreviewMovementData = (livePreview as any).lineMovement ?? (livePreview as any).line_movement;
  const livePreviewMarketEvidence = (livePreview as CanonicalSituation).latestEvidence?.find?.((event) => event.marketImpact)?.marketImpact;
  const livePreviewMovement = livePreviewMarketEvidence ?? (livePreviewMovementData?.current || livePreviewMovementData?.note ? "Movement attached" : "No movement attached");
  const livePreviewEvidence = isCanonicalSituation(livePreview) ? canonicalEvidenceSummary(livePreview) : livePreviewMovement;
  const livePreviewAction = String(firstSignalValue(
    (livePreview as any).action_note,
    (livePreview as any).action_takeaway,
    (livePreview as any).body,
    isCanonicalSituation(livePreview) ? canonicalConfidenceSummary(livePreview) : null,
    HERO_SIGNAL.action_takeaway,
  ) ?? HERO_SIGNAL.action_takeaway);
  const livePreviewBoardHref = livePreviewSport === "MLB" ? "/mlb" : livePreviewSport === "NFL" ? "/nfl" : livePreviewSport === "CFB" ? "/cfb" : "/nba";
  const liveStatusLabel = liveSignalState === "loading" ? "Checking feed" : liveSignalState === "error" ? "Last known board" : liveSignalState === "empty" ? "No new situations" : liveSituations.length ? "Situations" : "Live";
  const featuredItems = liveSituations.length > 0 ? liveSituations : TOP_SIGNALS;
  const heroStoryRailItems: HeadlineStoryItem[] = featuredItems.slice(0, 4).map((sig: any) => {
    const league = String(sig.league ?? livePreviewSport ?? "NBA").toUpperCase();
    const team = String(firstSignalValue(sig.team, sig.teams?.[0], livePreviewTeam) ?? livePreviewTeam);
    const opponent = String(firstSignalValue(sig.opponent, sig.teams?.[1], livePreviewOpponent) ?? "");
    return {
      id: sig.id ?? `${league}-${team}-${sig.title ?? sig.headline}`,
      league,
      sport: leagueToSport(league),
      team,
      opponent,
      player: previewPlayer(sig) ?? undefined,
      headline: String(sig.headline ?? sig.title ?? "Verified sports development"),
      storyType: String(sig.type ?? sig.signal_type ?? sig.situationType ?? "source watch").replace(/_/g, " "),
      status: isCanonicalSituation(sig) ? canonicalEvidenceSummary(sig) : `${displaySignalCount(firstSignalValue(sig.source_count, sig.sources)) ?? "multi"} checks`,
      time: displayFreshness(firstSignalValue(sig.timestamp, sig.signal_time, sig.updated_at, sig.created_at)),
      rawSignal: sig,
    };
  });

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'Barlow', sans-serif", position: "relative", overflowX: "hidden" }}>
      <SignalDetailDrawer
        open={!!selectedSignal}
        signal={selectedSignal}
        sport={selectedSignal?.league ?? selectedSignal?.sport ?? "MULTI"}
        onClose={() => setSelectedSignal(null)}
      />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:ital,wght@0,300;0,400;0,600&family=Barlow+Condensed:wght@600;700;800&display=swap');
        @keyframes tickScroll{ from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes fadeUp    { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @media (prefers-reduced-motion: reduce) {
          .flagship-ticker-track { animation: none !important; transform: none !important; }
        }
        .board-card:hover  { border-color: rgba(245,184,65,0.35) !important; transform: translateY(-2px); transition: all 0.15s; }
        .sport-card:hover  { transform: translateY(-3px); filter: brightness(1.06); transition: all 0.15s; }
        .sig-tick:hover    { background: rgba(245,184,65,0.08) !important; border-color: rgba(245,184,65,0.3) !important; }
        .cta-primary:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .cta-btn:hover     { filter: brightness(1.1); transform: translateY(-1px); }
        .es-chalk-nba {
          background-image:
            repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(245,184,65,0.18) 39px, rgba(245,184,65,0.18) 40px),
            repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(245,184,65,0.10) 39px, rgba(245,184,65,0.10) 40px);
          background-size: 40px 40px;
        }
        .es-chalk-mlb {
          background-image:
            repeating-linear-gradient(45deg, transparent, transparent 28px, rgba(0,183,255,0.14) 28px, rgba(0,183,255,0.14) 29px),
            repeating-linear-gradient(-45deg, transparent, transparent 28px, rgba(0,183,255,0.10) 28px, rgba(0,183,255,0.10) 29px);
          background-size: 40px 40px;
        }
        .es-chalk-nfl {
          background-image:
            repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(255,82,82,0.14) 19px, rgba(255,82,82,0.14) 20px);
          background-size: 100% 20px;
        }
        .es-chalk-cfb {
          background-image:
            repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(0,183,255,0.12) 19px, rgba(0,183,255,0.12) 20px);
          background-size: 100% 20px;
        }
      `}</style>

      <TacticalBg />

      <header style={{ position: "relative", zIndex: 8, background: "rgba(5,5,5,0.97)", borderBottom: "1px solid #1F2937" }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: isMobile ? "8px 12px 7px" : "16px 40px 14px", display: "flex", alignItems: "center", gap: isMobile ? 10 : 18 }}>
          <button onClick={() => navigate("/")} aria-label="EdgeSetter home" style={{ display: "grid", gap: isMobile ? 2 : 5, background: "none", border: "none", padding: 0, cursor: "pointer", minWidth: 0, textAlign: "left" }}>
            <img
              src="/brand/edgesetter-logo.png"
              alt="EdgeSetter"
              style={{ height: isMobile ? 34 : 42, width: "auto", display: "block", maxWidth: isMobile ? 154 : 190, objectFit: "contain", objectPosition: "left center" }}
              onError={e => { (e.currentTarget as HTMLElement).style.display = "none"; }}
            />
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 8 : 9, fontWeight: 900, letterSpacing: isMobile ? "0.08em" : "0.12em", textTransform: "uppercase", color: T.green, paddingLeft: 1, lineHeight: 1 }}>
              Live Sports Intelligence
            </span>
          </button>
          {!isMobile && (
            <nav style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              {[
                { label: "NBA", href: "/nba" },
                { label: "MLB", href: "/mlb" },
                { label: "NFL", href: "/nfl" },
                { label: "CFB", href: "/cfb" },
                { label: "Sources", href: "/sources" },
                { label: "Accuracy", href: "/accuracy" },
                { label: "My Edge", href: "/my-edge" },
              ].map(item => (
                <button key={item.label} onClick={() => navigate(item.href)} style={{ minHeight: 36, padding: "0 10px", borderRadius: 4, border: "1px solid transparent", background: "transparent", color: "#CBD5E1", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 850, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {item.label}
                </button>
              ))}
            </nav>
          )}
          {isMobile && (
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", minHeight: 44 }}>
              <HamburgerButton open={drawerOpen} onToggle={() => setDrawerOpen(o => !o)} />
            </div>
          )}
        </div>
      </header>

      {/* ══════════════════════ LIVE TICKER STRIP ══════════════════════ */}
      <div style={{ position: "relative", zIndex: 5, background: "rgba(5,5,5,0.96)", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", height: isMobile ? 34 : 44 }}>
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: isMobile ? "0 9px" : "0 14px", borderRight: `1px solid ${T.border}`, height: "100%" }}>
          <span className={liveSignalState === "ready" ? "es-live-dot es-live-pulse" : "es-live-dot es-live-dot-subtle"} style={{ width: 5, height: 5, background: liveSignalState === "ready" ? T.green : T.gold }} />
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "2px", color: T.gold, textTransform: "uppercase" }}>{liveStatusLabel}</span>
        </div>
        <div style={{ overflow: "hidden", flex: 1 }}>
          {(() => {
            const tickItems = liveSituations.length > 0 ? liveSituations : liveSignals.length > 0 ? liveSignals : TOP_SIGNALS;
            return (
              <div className="flagship-ticker-track" style={{ display: "flex", gap: isMobile ? 28 : 48, animation: isMobile ? "none" : "tickScroll 32s linear infinite", whiteSpace: "nowrap", paddingLeft: isMobile ? 12 : 20, pointerEvents: "none" }}>
                {[...tickItems, ...tickItems].map((sig: any, i) => {
                  const name = sig.player_name ?? sig.player ?? sig.players?.[0] ?? sig.team ?? sig.teams?.[0] ?? "";
                  const headline = sig.headline ?? sig.title ?? "";
                  const sport = sig.league ?? "NBA";
                  const sportColor = sport === "MLB" ? "#00B7FF" : sport === "NFL" ? "#FF5252" : sport === "CFB" ? "#64748B" : "#00B7FF";
                  return (
                    <span key={i} style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 10 : 12, color: T.textMuted, display: "inline-flex", alignItems: "center", gap: isMobile ? 6 : 8 }}>
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
            <span className="es-live-dot es-live-dot-subtle" style={{ width: 4, height: 4 }} />
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", color: T.green, textTransform: "uppercase" }}>Live Coverage · NBA · MLB · NFL · CFB</span>
          </div>
        )}
        {isMobile && <div style={{ flexShrink: 0, width: 10 }} />}
      </div>

      {/* ══════════════════════ HERO ══════════════════════ */}
      <section style={{ position: "relative", zIndex: 2, borderBottom: `1px solid ${T.border}`, overflow: "hidden" }}>
        {/* Strong sport-color atmosphere */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(135deg, rgba(0,183,255,0.08), transparent 42%), radial-gradient(ellipse 55% 60% at 76% 35%, rgba(0,230,118,0.08), transparent 62%)" }} />
        {/* Gold hairline accent from left */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${T.gold}, ${T.gold}22 60%, transparent)` }} />

        <div style={{ maxWidth: 1300, width: "100%", minWidth: 0, boxSizing: "border-box", margin: "0 auto", padding: isMobile ? "14px 14px 16px" : "26px 40px 30px", display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) 420px", gap: isMobile ? 12 : 32, alignItems: "start", position: "relative", zIndex: 2 }}>

          {/* ── Left ── */}
          <div style={{ animation: "fadeUp 0.55s ease both", minWidth: 0, width: isMobile ? mobileTextWidth : "100%", maxWidth: isMobile ? mobileTextWidth : undefined, overflow: "hidden" }}>
            {/* Eyebrow */}
            <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 7 : 10, marginBottom: isMobile ? 8 : 14, flexWrap: "wrap" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: isMobile ? "3px 8px" : "4px 11px", borderRadius: 2, background: "rgba(0,230,118,0.1)", border: "1px solid rgba(0,230,118,0.28)" }}>
                <span className="es-live-dot es-live-pulse" style={{ width: 5, height: 5 }} />
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 10 : 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.green }}>Multi-sport intelligence live</span>
              </div>
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 10 : 12, color: "#94A3B8", fontWeight: 600 }}>
                NBA · MLB · NFL · CFB · Verified across trusted sources
              </span>
            </div>

            {/* Headline — Bebas, full impact */}
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: isMobile ? "clamp(27px, 7vw, 36px)" : "clamp(38px, 4.1vw, 54px)", fontWeight: 400, lineHeight: isMobile ? 1.03 : 0.98, letterSpacing: isMobile ? "0.6px" : "1px", color: T.text, margin: isMobile ? "0 0 8px" : "0 0 12px", width: isMobile ? mobileTextWidth : undefined, maxWidth: "100%", overflowWrap: "anywhere" }}>
              Sports Signal Desk For Market-Moving News
            </h1>

            <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: isMobile ? 14 : 16, fontWeight: 500, color: "#CBD5E1", lineHeight: isMobile ? 1.45 : 1.58, margin: isMobile ? "0 0 7px" : "0 0 10px", width: isMobile ? mobileTextWidth : "100%", maxWidth: isMobile ? mobileTextWidth : 660, overflowWrap: "anywhere", wordBreak: "normal" }}>
              Live games, injury tags, lineup cards, practice deltas, roster movement, and source pressure updating across NBA, MLB, NFL, and CFB.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))", gap: isMobile ? 6 : 8, marginBottom: isMobile ? 8 : 12, maxWidth: 760 }}>
              {LIVE_PRESSURE_BOARD.map((item) => (
                <div key={item.matchup} style={{ minWidth: 0, padding: isMobile ? "8px 9px" : "10px 11px", border: `1px solid ${item.color}34`, borderRadius: 5, background: `linear-gradient(180deg, ${item.color}12, rgba(16,24,39,0.72))` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <span className="es-live-dot es-live-dot-subtle" style={{ width: 5, height: 5, background: item.color }} />
                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 900, letterSpacing: "0.13em", color: item.color }}>{item.league}</span>
                    <span style={{ marginLeft: "auto", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: "#94A3B8", fontWeight: 800 }}>{item.time}</span>
                  </div>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 14 : 15, fontWeight: 900, color: "#F8FAFC", lineHeight: 1.05, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.matchup}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, minWidth: 0 }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: "#CBD5E1", fontWeight: 750 }}>{item.state}</span>
                    <strong style={{ color: item.color, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 900 }}>{item.movement}</strong>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))", gap: isMobile ? 6 : 8, marginBottom: isMobile ? 10 : 14, maxWidth: 760 }}>
              {LIVE_MOVEMENT_TAPE.map(([label, value, color]) => (
                <div key={label} style={{ padding: isMobile ? "8px 9px" : "10px 11px", border: `1px solid ${color}38`, borderRadius: 5, background: `linear-gradient(180deg, ${color}14, rgba(16,24,39,0.72))` }}>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 9 : 10, fontWeight: 900, letterSpacing: isMobile ? "0.1em" : "0.14em", color, textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: isMobile ? 21 : 25, fontWeight: 400, color: "#F8FAFC", lineHeight: 0.95 }}>{value}</div>
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "auto auto", alignItems: "center", gap: isMobile ? 8 : 10, marginBottom: isMobile ? 10 : 14, minWidth: 0 }}>
              <button className="cta-primary" onClick={() => navigate("/nba")} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: isMobile ? "9px 8px" : "11px 24px", borderRadius: 2, background: `linear-gradient(135deg, ${T.gold} 0%, #F5B841 50%, ${T.gold} 100%)`, border: "none", color: T.bg, fontFamily: "'Bebas Neue', sans-serif", fontSize: isMobile ? 13 : 17, letterSpacing: isMobile ? "1px" : "2.5px", cursor: "pointer", transition: "filter 0.15s, transform 0.15s", minHeight: isMobile ? 38 : undefined, minWidth: 0, whiteSpace: "normal" }}>
                <Zap size={14} /> View Live Signals
              </button>
              <button className="cta-btn" onClick={() => document.getElementById("confidence-explainer")?.scrollIntoView({ behavior: "smooth", block: "start" })} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: isMobile ? "9px 8px" : "11px 22px", borderRadius: 2, background: "rgba(0,183,255,0.1)", border: "1px solid rgba(0,183,255,0.3)", color: T.cyan, fontFamily: "'Bebas Neue', sans-serif", fontSize: isMobile ? 12 : 17, letterSpacing: isMobile ? "0.6px" : "2.5px", cursor: "pointer", transition: "filter 0.15s, transform 0.15s", minHeight: isMobile ? 38 : undefined, minWidth: 0, whiteSpace: "normal", lineHeight: 1.05 }}>
                {isMobile ? "Confidence Notes" : "See How Confidence Works"}
              </button>
            </div>

            <div style={{ display: "flex", gap: isMobile ? 6 : 8, flexWrap: "wrap", marginBottom: isMobile ? 8 : 12 }}>
              {SPORT_CONFIG.map((sport) => (
                <button key={sport.label} onClick={() => navigate(sport.href)} title={`Open ${sport.label} board`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: isMobile ? "5px 7px" : "6px 9px", background: "#101827", border: "1px solid #1F2937", borderRadius: 4, color: "#CBD5E1", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 11 : 12, fontWeight: 800, letterSpacing: "0.06em" }}>
                  <img src={sport.logo} alt={sport.label} style={{ width: isMobile ? 15 : 18, height: isMobile ? 15 : 18, objectFit: "contain" }} onError={e => { (e.currentTarget as HTMLElement).style.display = "none"; }} />
                  {sport.label}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: isMobile ? 6 : 8, flexWrap: "wrap", marginBottom: isMobile ? 10 : 14 }}>
              {[
                { label: "My Edge", href: "/my-edge" },
                { label: "Sources", href: "/sources" },
                { label: "Accuracy Ledger", href: "/accuracy" },
              ].map((item) => (
                <button key={item.label} onClick={() => navigate(item.href)} style={{ padding: isMobile ? "6px 8px" : "7px 10px", background: "transparent", border: "1px solid #1F2937", borderRadius: 4, color: "#94A3B8", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 11 : 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {item.label}
                </button>
              ))}
            </div>

            {/* Mobile-only: Featured Edge — above signal list */}
            {isMobile && (
              <div style={{ marginBottom: 10 }}>
                <button
                  onClick={() => setFeaturedOpen(o => !o)}
                  aria-expanded={featuredOpen}
                  aria-label={`${featuredOpen ? 'Collapse' : 'Expand'} Featured Edge`}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: 8,
                    padding: '9px 11px',
                    background: `linear-gradient(90deg, rgba(245,184,65,0.10) 0%, ${T.surface1} 100%)`,
                    border: `1px solid ${T.borderMid}`,
                    borderLeft: `3px solid ${T.gold}`,
                    borderRadius: 3, cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent', minHeight: 42,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <div style={{ flexShrink: 0, width: 22, height: 22, background: 'rgba(245,184,65,0.12)', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 1l1.545 3.09L12 4.635l-2.5 2.41.59 3.41L7 8.9l-3.09 1.555.59-3.41L2 4.635l3.455-.545L7 1z" fill="#F5B841" /></svg>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.gold, lineHeight: 1, marginBottom: 2 }}>Featured Edge</div>
                      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {livePreviewTeam}{livePreviewOpponent ? ` @ ${livePreviewOpponent}` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: T.gold, lineHeight: 1 }}>{livePreviewConfidenceLabel ?? "LIVE"}</span>
                    <ChevronDown size={14} style={{ color: T.textMuted, transform: featuredOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s' }} />
                  </div>
                </button>
                <div style={{ maxHeight: featuredOpen ? 800 : 0, overflow: 'hidden', transition: 'max-height 0.32s cubic-bezier(0.4,0,0.2,1)' }}>
                  <div style={{ background: T.surface1, border: `1px solid ${T.borderMid}`, borderTop: 'none', borderRadius: '0 0 3px 3px', overflow: 'hidden' }}>
                    <div style={{ padding: "10px 12px 9px", background: `linear-gradient(140deg, ${heroColors.primary}F0 0%, ${heroColors.primary}80 45%, ${T.surface2} 100%)`, borderBottom: `1px solid ${T.border}`, position: "relative", overflow: "hidden", minHeight: 64 }}>
                      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 95% 50%, ${oppColors.primary}48, transparent 55%)` }} />
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${T.gold}, ${T.gold}44)` }} />
                      <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 10 }}>
                        <TeamLogoPair away={livePreviewTeam} home={livePreviewOpponent} size={30} useImg />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: "2px", color: T.text }}>
                            {livePreviewSport} Situation Monitor
                          </div>
                          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: "#94A3B8", letterSpacing: "0.06em" }}>Source watch / live board context</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 2, background: "rgba(0,230,118,0.14)", border: "1px solid rgba(0,230,118,0.3)" }}>
                          <span className={liveSignalState === "ready" ? "es-live-dot es-live-pulse" : "es-live-dot es-live-dot-subtle"} style={{ width: 4, height: 4 }} />
                          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.green }}>{liveStatusLabel}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: "12px" }}>
                      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                        {previewPlayer(livePreview) && <PlayerHeadshot name={previewPlayer(livePreview) ?? ""} team={livePreviewTeam} size={46} shape="circle" />}
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                            <TypeChip type={livePreviewType as any} />
                            <VerdictBadge verdict={previewVerdict(livePreview) as any} />
                          </div>
                          {previewPlayer(livePreview) && <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: "1.5px", color: T.text, textTransform: "uppercase" }}>{previewPlayer(livePreview)}</div>}
                        </div>
                      </div>
                      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.35, marginBottom: 10 }}>
                        {livePreviewTitle}
                      </div>
                      <div style={{ background: T.goldGlow, border: `1px solid rgba(245,184,65,0.2)`, borderRadius: 2, padding: "8px 10px", marginBottom: 10 }}>
                        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: T.gold, marginBottom: 4 }}>⚡ Action</div>
                        <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: 12, color: T.text, lineHeight: 1.45 }}>{livePreviewAction}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <ConfidenceBar value={livePreviewConfidenceValue} width="100%" height={4} />
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: T.gold, flexShrink: 0 }}>{livePreviewConfidenceLabel ?? "Watch"}</span>
                      </div>
                      <button onClick={() => navigate(livePreviewBoardHref)} style={{ width: "100%", padding: "8px", minHeight: 36, background: `linear-gradient(135deg, ${T.gold}, #F5B841)`, border: "none", color: T.bg, borderRadius: 2, fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: "1.8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        OPEN LIVE BOARD <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Live signal list */}
            <div>
              <HeadlineStoryRail
                title="Headline Developments"
                items={heroStoryRailItems}
                onSelect={(sig: any) => setSelectedSignal(isCanonicalSituation(sig) ? canonicalSituationToDrawerSignal(sig) : sig)}
              />
            </div>
          </div>

          {/* ── Right: Featured Edge card — desktop only ── */}
          {!isMobile && (
          <div style={{ animation: "fadeUp 0.65s ease 0.1s both" }}>
            <div style={{ background: T.surface1, border: `1px solid ${T.borderMid}`, borderRadius: 3, overflow: "hidden", boxShadow: "0 8px 56px rgba(0,0,0,0.65)" }}>
              <SportsStoryVisual
                league={livePreviewSport}
                sport={leagueToSport(livePreviewSport)}
                primaryTeam={livePreviewTeam}
                secondaryTeam={livePreviewOpponent}
                player={previewPlayer(livePreview) ?? undefined}
                title={livePreviewTitle}
                storyType={livePreviewType.replace(/_/g, " ")}
                detail={`${liveStatusLabel} / ${livePreviewFreshness}`}
                size="hero"
              />
              {/* Team-color banner — full bleed, commanding */}
              <div style={{ display: "none", padding: "14px 16px 12px", background: `linear-gradient(140deg, ${heroColors.primary}F0 0%, ${heroColors.primary}80 45%, ${T.surface2} 100%)`, borderBottom: `1px solid ${T.border}`, position: "relative", overflow: "hidden", minHeight: 80 }}>
                <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 95% 50%, ${oppColors.primary}48, transparent 55%)` }} />
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${T.gold}, ${T.gold}44)` }} />
                <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 10 }}>
                  <TeamLogoPair away={livePreviewTeam} home={livePreviewOpponent} size={36} useImg />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: "2px", color: T.text }}>
                      {livePreviewSport} Situation Monitor
                    </div>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: "#94A3B8", letterSpacing: "0.06em" }}>Source watch / live board context</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 2, background: "rgba(0,230,118,0.14)", border: "1px solid rgba(0,230,118,0.3)" }}>
                    <span className="es-live-dot es-live-pulse" style={{ width: 4, height: 4 }} />
                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.green }}>{liveStatusLabel}</span>
                  </div>
                </div>
              </div>

              <div style={{ padding: "16px" }}>
                <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                  {previewPlayer(livePreview) && <PlayerHeadshot name={previewPlayer(livePreview) ?? ""} team={livePreviewTeam} size={58} shape="circle" />}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                      <TypeChip type={livePreviewType as any} />
                      <VerdictBadge verdict={previewVerdict(livePreview) as any} />
                    </div>
                    {previewPlayer(livePreview) && <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: "1.5px", color: T.text, textTransform: "uppercase" }}>{previewPlayer(livePreview)}</div>}
                  </div>
                </div>

                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 600, color: T.text, lineHeight: 1.4, marginBottom: 12 }}>
                  {livePreviewTitle}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  {[
                    ["Sport", livePreviewSport, T.cyan],
                    ["Type", livePreviewType, T.green],
                    ["Confidence", livePreviewConfidenceLabel ?? "Watching", T.gold],
                    ["Sources", livePreviewSources ? `${livePreviewSources} checks` : "No checks attached", "#94A3B8"],
                  ].map(([label, value, color]) => (
                    <div key={label} style={{ padding: "9px 10px", background: "#050505", border: `1px solid ${color}38`, borderRadius: 4 }}>
                      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 900, letterSpacing: "0.16em", color, textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
                      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 850, color: "#F8FAFC" }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: T.goldGlow, border: `1px solid rgba(245,184,65,0.2)`, borderRadius: 2, padding: "10px 12px", marginBottom: 12 }}>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: T.gold, marginBottom: 4 }}>⚡ Action</div>
                  <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: 13, color: T.text, lineHeight: 1.6 }}>{livePreviewAction}</div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <ConfidenceBar value={livePreviewConfidenceValue} width="100%" height={4} />
                  <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: T.gold, flexShrink: 0 }}>{livePreviewConfidenceLabel ?? "Watch"}</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  {[
                    ["Freshness", livePreviewFreshness, T.cyan],
                    ["Timing", livePreviewFreshness === "Monitoring" ? "Monitoring" : "Active window", T.green],
                    ["Movement", livePreviewMovement, T.gold],
                    ["Ledger", "Awaiting settlement", "#94A3B8"],
                  ].map(([label, value, color]) => (
                    <div key={label} style={{ padding: "9px 10px", background: "#050505", border: `1px solid ${color}30`, borderRadius: 4 }}>
                      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 900, letterSpacing: "0.16em", color, textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
                      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 850, color: "#F8FAFC", overflowWrap: "anywhere" }}>{value}</div>
                    </div>
                  ))}
                </div>

                <button onClick={() => navigate(livePreviewBoardHref)} style={{ width: "100%", padding: "10px", background: `linear-gradient(135deg, ${T.gold}, #F5B841)`, border: "none", color: T.bg, borderRadius: 2, fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: "2.5px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  OPEN LIVE BOARD <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </div>
          )}
        </div>
      </section>

      {/* ══════════════════════ TONIGHT'S SLATE ══════════════════════ */}
      <section style={{ position: "relative", zIndex: 2, borderBottom: `1px solid ${T.border}`, background: "#0A0F1A" }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: isMobile ? "16px 14px" : "28px 40px" }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: T.gold, marginBottom: isMobile ? 8 : 12 }}>Live monitoring rhythm</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, 1fr)", gap: isMobile ? 8 : 10 }}>
            {[
              ["Detected", "source pressure appears", T.cyan],
              ["Context shifted", "player/team status moves", T.green],
              ["Window tightens", "market reacts", T.gold],
              ["Resolved", "official context lands", "#94A3B8"],
            ].map(([title, copy, color], index) => (
              <div key={title} style={{ padding: isMobile ? "9px 10px" : "12px 13px", background: "#101827", border: `1px solid ${color}34`, borderRadius: 6, boxShadow: `inset 3px 0 0 ${color}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: isMobile ? 19 : 24, color, lineHeight: 1 }}>{index + 1}</span>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 12 : 14, fontWeight: 900, letterSpacing: "0.08em", color: T.text, textTransform: "uppercase", lineHeight: 1.05 }}>{title}</div>
                </div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 11 : 12, color: "#CBD5E1", fontWeight: 750, lineHeight: 1.2 }}>{copy}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="confidence-explainer" style={{ display: "none", position: "relative", zIndex: 2, borderBottom: `1px solid ${T.border}`, background: "#050505" }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: isMobile ? "16px 14px" : "28px 40px", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "0.9fr 1.1fr", gap: isMobile ? 10 : 18, alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: T.cyan, marginBottom: 8 }}>Why the confidence score matters</div>
            <p style={{ margin: 0, fontFamily: "'Barlow', sans-serif", fontSize: isMobile ? 13 : 15, color: "#CBD5E1", lineHeight: isMobile ? 1.45 : 1.6 }}>Confidence combines multi-source consensus, source reliability, timing advantage, and context movement so a signal is easier to trust and act on.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 8 }}>
            {TRUST_FACTORS.map((factor) => (
              <div key={factor} style={{ display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "7px 9px" : "9px 10px", background: "#101827", border: "1px solid #1F2937", borderRadius: 4 }}>
                <Shield size={13} style={{ color: T.green, flexShrink: 0 }} />
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 12 : 13, color: "#CBD5E1", fontWeight: 700, textTransform: "capitalize" }}>{factor}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ display: "none", position: "relative", zIndex: 2, borderBottom: `1px solid ${T.border}`, background: "#0A0F1A" }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: isMobile ? "16px 14px" : "28px 40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: isMobile ? 8 : 12 }}>
            <Activity size={14} style={{ color: T.green }} />
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: T.green }}>What makes a signal usable</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, 1fr)", gap: isMobile ? 8 : 10 }}>
            {SIGNAL_WORKFLOW.map(([title, copy]) => (
              <div key={title} style={{ padding: isMobile ? "10px" : "14px", background: "#101827", border: "1px solid #1F2937", borderRadius: 5 }}>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 11 : 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: T.text, marginBottom: isMobile ? 4 : 6, lineHeight: 1.15 }}>{title}</div>
                <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: isMobile ? 11 : 13, color: "#CBD5E1", lineHeight: isMobile ? 1.35 : 1.55 }}>{copy}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ borderBottom: `1px solid ${T.border}`, background: T.surface1, position: "relative", zIndex: 2 }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: isMobile ? "12px 14px" : "20px 40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: T.textFaint }}>Tonight's NBA Slate</span>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 2, background: "rgba(0,230,118,0.08)", border: "1px solid rgba(0,230,118,0.22)" }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.green, display: "inline-block" }} />
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.green }}>Playoffs</span>
            </div>
            <button onClick={() => navigate("/nba")} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: T.gold, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>
              All Signals <ChevronRight size={11} />
            </button>
          </div>
          <div style={{ display: "flex", gap: isMobile ? 10 : 14, overflowX: "auto", paddingBottom: 4 }}>
            {NBA_TONIGHT.map(game => (
              <div key={game.id} style={{ width: isMobile ? 205 : 240, flexShrink: 0 }}>
                <GameCard away={game.away} home={game.home} time={game.time} series={game.seriesRecord} spread={game.spread} total={game.total} compact onClick={() => navigate("/nba")} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ SPORT BOARDS GRID ══════════════════════ */}
      <section style={{ position: "relative", zIndex: 2, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: isMobile ? "16px 14px" : "40px 40px" }}>
          <div style={{ marginBottom: isMobile ? 12 : 24 }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.24em", textTransform: "uppercase", color: T.textFaint, marginBottom: 6 }}>Intelligence Boards</div>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: isMobile ? 24 : "clamp(24px, 3vw, 38px)", fontWeight: 400, letterSpacing: isMobile ? "1px" : "2px", color: T.text, margin: 0 }}>ALL BOARDS. ONE DESK.</h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "0.92fr 1.08fr", gap: isMobile ? 10 : 16, alignItems: "start" }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "1fr", gap: isMobile ? 8 : 10 }}>
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
                <div style={{ height: isMobile ? 62 : 90, position: "relative", overflow: "hidden", background: `linear-gradient(160deg, ${sport.color}CC 0%, ${sport.color}44 50%, ${T.surface2} 100%)` }}>
                  {/* Chalk bg overlay — inline to avoid CSS class dependency */}
                  <div style={{ position: "absolute", inset: 0, backgroundImage: sport.label === "NBA" ? CHALK_NBA : sport.label === "MLB" ? CHALK_MLB : sport.label === "NFL" ? CHALK_NFL : CHALK_CFB, backgroundSize: (sport.label === "NBA" || sport.label === "MLB") ? "40px 40px" : "100% 20px", opacity: 0.18 }} />
                  {/* Sport logo watermark — replaces bold text */}
                  <img
                    src={sport.logo}
                    alt={sport.label}
                    style={{ position: "absolute", right: -4, bottom: -4, width: isMobile ? 62 : 90, height: isMobile ? 62 : 90, objectFit: "contain", opacity: 0.18, pointerEvents: "none" }}
                    onError={e => { (e.currentTarget as HTMLElement).style.display = "none"; }}
                  />
                  {/* Status badge */}
                  <div style={{ position: "absolute", top: isMobile ? 7 : 10, left: isMobile ? 8 : 12, display: "inline-flex", alignItems: "center", gap: 5, padding: isMobile ? "2px 6px" : "3px 8px", borderRadius: 2, background: `${sport.dot}18`, border: `1px solid ${sport.dot}44` }}>
                    <span className={sport.status === "ACTIVE" ? "es-live-dot es-live-dot-subtle" : "es-live-dot es-live-dot-subtle"} style={{ width: 4, height: 4, background: sport.dot }} />
                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 8 : 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: sport.dot }}>{sport.status}</span>
                  </div>
                  {/* Sport name big */}
                  <div style={{ position: "absolute", bottom: isMobile ? 7 : 10, left: isMobile ? 9 : 12, fontFamily: "'Bebas Neue', sans-serif", fontSize: isMobile ? 20 : 26, letterSpacing: isMobile ? "1.5px" : "3px", color: T.text }}>{sport.label}</div>
                </div>

                <div style={{ padding: isMobile ? "9px" : "12px 14px 14px", background: `linear-gradient(180deg, ${sport.color}0D 0%, transparent 60%)` }}>
                  <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: isMobile ? 10 : 12, color: T.text, lineHeight: isMobile ? 1.35 : 1.55, marginBottom: isMobile ? 8 : 12, opacity: 0.78 }}>{sport.desc}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 10 : 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: sport.color }}>
                    Open Board <ArrowRight size={11} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gap: isMobile ? 8 : 12 }}>
            {[
              { label: "Live Intelligence", value: livePreviewTitle, meta: `${livePreviewSport} / ${livePreviewType} / ${livePreviewConfidenceLabel ?? "confidence pending"}`, color: T.green },
              { label: "Movement Context", value: livePreviewEvidence, meta: `${livePreviewFreshness} / sources ${livePreviewSources ?? "none attached"}`, color: T.cyan },
              { label: "Coverage State", value: "Multi-sport monitoring active", meta: "MLB live / NBA playoff stretch / NFL + CFB offseason watch", color: T.gold },
            ].map(item => (
              <div key={item.label} style={{ padding: isMobile ? "11px 12px" : "15px 16px", background: "#101827", border: `1px solid ${item.color}30`, borderRadius: 6, boxShadow: "inset 3px 0 0 " + item.color }}>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 9 : 11, fontWeight: 900, letterSpacing: "0.12em", color: item.color, textTransform: "uppercase", marginBottom: isMobile ? 3 : 5 }}>{item.label}</div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 14 : 17, fontWeight: 850, color: "#F8FAFC", lineHeight: 1.2, marginBottom: 3 }}>{item.value}</div>
                <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: isMobile ? 11 : 12, color: "#94A3B8", lineHeight: 1.35 }}>{item.meta}</div>
              </div>
            ))}
          </div>
        </div>
        </div>
      </section>

      {/* ══════════════════════ MLB STRIP ══════════════════════ */}
      <section style={{ borderBottom: `1px solid ${T.border}`, background: T.surface1, position: "relative", zIndex: 2 }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: isMobile ? "12px 14px" : "20px 40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: T.textFaint }}>MLB Today</span>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 2, background: "rgba(0,183,255,0.08)", border: "1px solid rgba(0,183,255,0.2)" }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.cyan, display: "inline-block" }} />
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.cyan }}>Active</span>
            </div>
            <button onClick={() => navigate("/mlb")} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: T.cyan, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>
              MLB Board <ChevronRight size={11} />
            </button>
          </div>
          <div style={{ display: "flex", gap: isMobile ? 10 : 14, overflowX: "auto", paddingBottom: 4 }}>
            {MLB_GAMES.map(game => (
              <div key={game.id} style={{ width: isMobile ? 198 : 220, flexShrink: 0 }}>
                <GameCard away={game.away} home={game.home} time={game.time} spread={game.spread} total={game.total} compact onClick={() => navigate("/mlb")} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ PRO BAND ══════════════════════ */}
      <section style={{ background: `linear-gradient(135deg, rgba(245,184,65,0.07), rgba(245,184,65,0.02))`, borderBottom: `1px solid rgba(245,184,65,0.2)`, position: "relative", zIndex: 2 }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: isMobile ? "20px 14px" : "48px 40px", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr auto", gap: isMobile ? 14 : 40, alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, letterSpacing: "3px", color: T.gold, marginBottom: isMobile ? 6 : 10 }}>PRO INTELLIGENCE</div>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: isMobile ? 24 : "clamp(24px, 3vw, 42px)", fontWeight: 400, letterSpacing: isMobile ? "1px" : "2px", color: T.text, margin: isMobile ? "0 0 8px" : "0 0 12px" }}>
              FULL DETAIL. SOURCE CONTEXT. SAVED SIGNALS.
            </h2>
            <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: isMobile ? 13 : 15, fontStyle: "italic", fontWeight: 300, color: T.text, lineHeight: isMobile ? 1.45 : 1.65, margin: isMobile ? "0 0 12px" : "0 0 20px", maxWidth: 560, opacity: 0.7 }}>
              Limited access shows signal direction. Pro adds full detail, source context, saved-signal workflows, and alert entry points across NBA, MLB, NFL, and CFB.
            </p>
            <div style={{ display: "flex", gap: isMobile ? 12 : 24, flexWrap: "wrap" }}>
              {[{ icon: <Shield size={12} />, label: "Live Detail" }, { icon: <Zap size={12} />, label: "Alert Workflows" }, { icon: <BarChart3 size={12} />, label: "All 4 Sports" }].map(f => (
                <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: T.gold }}>{f.icon}</span>
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.textMuted }}>{f.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: isMobile ? 42 : 58, color: T.gold, lineHeight: 1, marginBottom: 2 }}>$19</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.textFaint, marginBottom: 18 }}>per month</div>
            <button onClick={() => navigate("/pro")} style={{ display: "block", width: "100%", padding: isMobile ? "10px 22px" : "13px 36px", borderRadius: 2, background: `linear-gradient(135deg, ${T.gold} 0%, #F5B841 50%, ${T.gold} 100%)`, border: "none", color: T.bg, fontFamily: "'Bebas Neue', sans-serif", fontSize: isMobile ? 14 : 16, letterSpacing: isMobile ? "2px" : "3px", cursor: "pointer" }}>
              VIEW PRO ACCESS
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
      {false && isMobile && (
        <div
          style={{
            position: "fixed", top: 0, right: 0, zIndex: 110,
            width: 56, height: 44,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(5,5,5,0.96)",
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


