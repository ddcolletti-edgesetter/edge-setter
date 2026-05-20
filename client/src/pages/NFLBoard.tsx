import React, { useState, useMemo, useEffect } from "react";
import V2Shell, { SportBadge, useShellTheme } from "../components/V2Shell";
import { scoreAndRankSignals, selectFeaturedEdge, SCORE_BANDS, type SignalScore, type UrgencyLabel } from "../lib/signalScorer";
import {
  NFL_SIGNALS, NFL_SLATE, NFL_FEATURED_EDGE,
  NFL_QUICK_TEAMS, NFL_TEAM_COLORS,
  type NFLSignal, type NFLSignalType, type Verdict,
} from "../data/nflMockData";
import { useNFLSignals } from "../hooks/useSignals";
import { Zap, X, Filter, TrendingUp, AlertCircle, ChevronRight, Lock } from "lucide-react";
import { useSignalGate, FREE_LIMIT } from "../context/SignalGate";
import { ProRowOverlay, ProBoardBanner, ProActionGate } from "../components/ProGate";
import OutcomePanel from "../components/OutcomePanel";
import TrackRecordStrip from "../components/TrackRecordStrip";
import { TeamLogoImg, PlayerHeadshot } from "../components/v2/SportVisuals";
import SignalImpactPanel from "../components/signals/SignalImpactPanel";
import { SignalDetailDrawer } from "../components/SignalDetailDrawer";
import { compareSignals, lifecycleTone, signalHasMovement, signalIsActionable, signalLifecycle, signalTrustLabel, type BoardSortMode } from "../lib/signalBoardUx";

/* ── NFL team logo URLs (ESPN CDN) ── */
const NFL_LOGO_URLS: Record<string, string> = {
  KC:  "https://a.espncdn.com/i/teamlogos/nfl/500/kc.png",
  BUF: "https://a.espncdn.com/i/teamlogos/nfl/500/buf.png",
  SF:  "https://a.espncdn.com/i/teamlogos/nfl/500/sf.png",
  DAL: "https://a.espncdn.com/i/teamlogos/nfl/500/dal.png",
  CIN: "https://a.espncdn.com/i/teamlogos/nfl/500/cin.png",
  BAL: "https://a.espncdn.com/i/teamlogos/nfl/500/bal.png",
  NYG: "https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png",
  PHI: "https://a.espncdn.com/i/teamlogos/nfl/500/phi.png",
  LV:  "https://a.espncdn.com/i/teamlogos/nfl/500/lv.png",
  DET: "https://a.espncdn.com/i/teamlogos/nfl/500/det.png",
  GB:  "https://a.espncdn.com/i/teamlogos/nfl/500/gb.png",
  NE:  "https://a.espncdn.com/i/teamlogos/nfl/500/ne.png",
  LAR: "https://a.espncdn.com/i/teamlogos/nfl/500/lar.png",
  MIA: "https://a.espncdn.com/i/teamlogos/nfl/500/mia.png",
};

/* ── NFL player headshot URLs (ESPN CDN) ── */
const NFL_PLAYER_HEADSHOTS: Record<string, string> = {
  "Christian McCaffrey": "https://a.espncdn.com/i/headshots/nfl/players/full/3054211.png",
  "Raheem Mostert":      "https://a.espncdn.com/i/headshots/nfl/players/full/16751.png",
  "Malik Nabers":        "https://a.espncdn.com/i/headshots/nfl/players/full/4431611.png",
  "Lamar Jackson":       "https://a.espncdn.com/i/headshots/nfl/players/full/3916387.png",
  "Brock Bowers":        "https://a.espncdn.com/i/headshots/nfl/players/full/4432788.png",
  "Patrick Mahomes":     "https://a.espncdn.com/i/headshots/nfl/players/full/3139477.png",
  "Sam LaPorta":         "https://a.espncdn.com/i/headshots/nfl/players/full/4430185.png",
};

/* ── Design tokens (dark) ── */
const T = {
  bg:       "#050505",
  surface1: "#0A0F1A",
  surface2: "#101827",
  surface3: "#101827",
  gold:     "#F5B841",
  goldBright:"#F5B841",
  goldDim:  "rgba(245,184,65,0.15)",
  border:   "rgba(245,184,65,0.12)",
  text:     "#F8FAFC",
  textMuted:"#94A3B8",
  textFaint:"#64748B",
  green:    "#00E676",
  orange:   "#FF8A00",
  cyan:     "#00B7FF",
  danger:   "#FF5252",
};

/* ── Verdict colors ── */
const VERDICT_COLORS: Record<Verdict, string> = {
  confirmed: T.green,
  likely:    T.gold,
  rumor:     T.cyan,
  contradicted: T.danger,
  review:    T.orange,
};

/* ── Signal type → color + label ── */
const TYPE_META: Record<NFLSignalType, { color: string; label: string }> = {
  injury:      { color: T.danger,  label: "INJURY"    },
  depth:       { color: T.orange,  label: "DEPTH"     },
  camp:        { color: T.cyan,    label: "CAMP"      },
  line_move:   { color: T.gold,    label: "LINE MOVE" },
  matchup:     { color: T.cyan,    label: "MATCHUP"   },
  weather:     { color: "#7BB3C8", label: "WEATHER"   },
  sharp:       { color: T.gold,    label: "SHARP"     },
  rookie:      { color: T.gold,    label: "ROOKIE"    },
  role_change: { color: T.orange,  label: "ROLE"      },
  trend:       { color: T.green,   label: "TREND"     },
  prop:        { color: T.orange,  label: "PROP"      },
  scheme:      { color: T.cyan,    label: "SCHEME"    },
  transaction: { color: T.green,   label: "TRANS"     },
};

/* ── Filter tabs ── */
const NFL_FILTERS = ["Today", "Injuries", "Line Moves", "Matchups", "Props", "Trends", "Camp/Depth"] as const;
type NFLFilter = typeof NFL_FILTERS[number];

const NFL_MODES = [
  { label: "Signal Stream", mode: "Today"       },
  { label: "Injury Watch",  mode: "Injuries"    },
  { label: "Line Movement", mode: "Line Moves"  },
  { label: "Matchup Edges", mode: "Matchups"    },
  { label: "Sharp Money",   mode: "Props"       },
  { label: "Camp & Depth",  mode: "Camp/Depth"  },
  { label: "Team Trends",   mode: "Trends"      },
] as const;

function matchNFLFilter(sig: NFLSignal, filter: NFLFilter): boolean {
  if (filter === "Today") return true;
  if (filter === "Injuries") return sig.type === "injury";
  if (filter === "Line Moves") return sig.type === "line_move" || sig.tags.includes("sharp");
  if (filter === "Matchups") return sig.type === "matchup";
  if (filter === "Props") return sig.type === "prop" || sig.type === "sharp";
  if (filter === "Trends") return sig.type === "trend";
  if (filter === "Camp/Depth") return sig.type === "camp" || sig.type === "depth" || sig.type === "rookie" || sig.type === "role_change";
  return true;
}

/* ── Team logo placeholder ── */
function TeamAbbr({ abbr, color, size = 32 }: { abbr: string; color: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 4,
      background: `${color}33`,
      border: `1px solid ${color}55`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: size * 0.38, fontWeight: 800, color,
      flexShrink: 0, letterSpacing: "0.04em",
    }}>
      {abbr}
    </div>
  );
}

/* ── Type chip ── */
function TypeChip({ type }: { type: NFLSignalType }) {
  const m = TYPE_META[type];
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 6px", borderRadius: 2,
      background: `${m.color}22`, color: m.color,
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      {m.label}
    </span>
  );
}

/* ── Verdict badge ── */
function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const c = VERDICT_COLORS[verdict];
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 7px", borderRadius: 2,
      background: `${c}18`, color: c,
      border: `1px solid ${c}44`,
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
    }}>
      + {verdict}
    </span>
  );
}

/* ── Confidence bar ── */
function ConfBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{
        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
        fontSize: 14, fontWeight: 800, color, minWidth: 36, textAlign: "right",
      }}>
        {value}%
      </span>
    </div>
  );
}

/* ── Detail Panel ── */
function NFLDetailPanel({ sig, onClose, TH, darkMode }: { sig: NFLSignal; onClose: () => void; TH: Record<string, string>; darkMode: boolean }) {
  const teamColors = NFL_TEAM_COLORS[sig.team] ?? { primary: T.gold, secondary: "#333" };
  const typeColor = TYPE_META[sig.type].color;

  return (
    <div style={{
      width: "100%", maxWidth: 360,
      background: TH.surface1,
      borderLeft: `1px solid ${TH.goldDim}`,
      flexShrink: 0, display: "flex", flexDirection: "column", overflowY: "auto",
    }}>
      {/* Close */}
      <button onClick={onClose} style={{
        position: "absolute", top: 14, right: 14, zIndex: 10,
        background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%",
        color: TH.textMuted, cursor: "pointer", width: 28, height: 28,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <X size={13} />
      </button>

      {/* Hero band */}
      <div style={{
        position: "relative", overflow: "hidden",
        background: `linear-gradient(150deg, ${teamColors.primary}CC 0%, ${teamColors.primary}55 55%, transparent 100%)`,
        padding: "20px 20px 16px",
        borderBottom: `1px solid ${TH.border}`,
        minHeight: 110,
      }}>
        {/* Accent stripe */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.gold}, ${T.gold}33)` }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: `radial-gradient(ellipse at 90% 50%, ${teamColors.secondary}22, transparent 60%)`, pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            {/* Player headshot if player-driven signal, else team logo */}
            {sig.player && NFL_PLAYER_HEADSHOTS[sig.player] ? (
              <PlayerHeadshot
                name={sig.player}
                team={sig.team}
                src={NFL_PLAYER_HEADSHOTS[sig.player]}
                size={38}
                shape="circle"
              />
            ) : (
              <TeamLogoImg abbr={sig.team} src={NFL_LOGO_URLS[sig.team]} size={38} shape="square" />
            )}
            <div>
              <TypeChip type={sig.type} />
              {sig.player && (
                <div style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 13, color: T.textFaint, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2,
                }}>
                  {sig.player}
                </div>
              )}
            </div>
          </div>
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.35,
          }}>
            {sig.headline}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "16px 16px 20px", flex: 1 }}>
        <div style={{ marginBottom: 12 }}>
          <ConfBar value={sig.confidence} color={typeColor} />
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <VerdictBadge verdict={sig.verdict} />
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 14, color: TH.textFaint, letterSpacing: "0.06em",
              display: "flex", alignItems: "center", gap: 4,
            }}>
              {sig.sources} sources · {sig.timestamp}
            </span>
          </div>
        </div>

        {/* Signal detail */}
        <div style={{
          background: TH.surface2, borderRadius: 4,
          border: `1px solid ${TH.border}`,
          padding: "12px 14px", marginBottom: 10,
        }}>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 14, fontWeight: 700, color: TH.textFaint,
            letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6,
          }}>Intel</div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 14, color: TH.text, lineHeight: 1.55,
          }}>
            {sig.detail}
          </div>
        </div>

        {/* Why it matters */}
        <div style={{
          background: `${TH.surface2}88`, borderRadius: 4,
          border: `1px solid ${TH.border}`,
          padding: "12px 14px", marginBottom: 10,
        }}>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 11, fontWeight: 700, color: TH.textFaint,
            letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6,
          }}>Why it matters</div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 14, color: TH.textMuted, lineHeight: 1.55,
          }}>
            {sig.why_it_matters}
          </div>
        </div>

        {/* Impact Overview */}
        <SignalImpactPanel signal={sig} darkMode={darkMode} />

        {/* Action */}
        <ProActionGate sport="NFL" actionText={sig.action_takeaway} darkMode={darkMode}>
          <div style={{
            background: `${T.gold}12`, borderRadius: 4,
            border: `1px solid ${T.gold}44`,
            padding: "12px 14px",
          }}>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 11, fontWeight: 700, color: T.gold,
              letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6,
            }}>
              <Zap size={11} style={{ display: "inline", marginRight: 4 }} />
              Action →
            </div>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 14, color: TH.text, lineHeight: 1.55,
            }}>
              {sig.action_takeaway}
            </div>
          </div>
        </ProActionGate>

        {/* Outcome + CLV */}
        {(sig as any)._live && <OutcomePanel signalId={sig.id} darkMode={darkMode} />}
      </div>
    </div>
  );
}

/* ── NFL Slate card ── */
function NFLSlateCard({ game, TH }: { game: typeof NFL_SLATE[number]; TH: Record<string, string> }) {
  return (
    <div className="board-slate-card" style={{
      minWidth: 210, maxWidth: 260, flex: "1 0 210px",
      background: TH.surface2,
      border: `1px solid ${TH.border}`,
      borderRadius: 5, overflow: "hidden",
    }}>
      {/* Teams row */}
      <div style={{ padding: "12px 14px 8px" }}>
        {/* Away */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <TeamLogoImg abbr={game.away} src={NFL_LOGO_URLS[game.away]} size={26} shape="square" />
            <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 16, fontWeight: 800, color: TH.text, letterSpacing: "0.04em" }}>
              {game.away}
            </span>
            <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 11, color: TH.textFaint, letterSpacing: "0.06em" }}>AWAY</span>
          </div>
        </div>
        {/* Home */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <TeamLogoImg abbr={game.home} src={NFL_LOGO_URLS[game.home]} size={26} shape="square" />
            <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 16, fontWeight: 800, color: TH.text, letterSpacing: "0.04em" }}>
              {game.home}
            </span>
            <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 11, color: TH.textFaint, letterSpacing: "0.06em" }}>HOME</span>
          </div>
        </div>
      </div>

      {/* Odds strip */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
        borderTop: `1px solid ${TH.border}`, background: TH.surface1,
      }}>
        {[
          { label: "SPREAD", val: game.spread },
          { label: "TOTAL",  val: game.total  },
          { label: "TIME",   val: game.time   },
        ].map(({ label, val }) => (
          <div key={label} style={{ padding: "7px 8px", borderRight: `1px solid ${TH.border}` }}>
            <div style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 10, color: TH.textFaint, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
            <div style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 13, fontWeight: 700, color: TH.text, whiteSpace: "nowrap" }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Signal count */}
      <div style={{ padding: "6px 14px", display: "flex", alignItems: "center", gap: 6 }}>
        <Zap size={11} color={T.gold} />
        <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 12, color: T.gold, fontWeight: 700 }}>
          {game.signals} signal{game.signals !== 1 ? "s" : ""}
        </span>
        {game.network && (
          <span style={{ marginLeft: "auto", fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 11, color: TH.textFaint }}>
            {game.network}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── NFLBoardInner ── */
function NFLBoardInner() {
  const darkMode = useShellTheme();
  const { rowIsFree, openModal } = useSignalGate();
  const TH: Record<string, string> = {
    bg:        darkMode ? T.bg        : "#F0ECE4",
    surface1:  darkMode ? T.surface1  : "#FFFFFF",
    surface2:  darkMode ? T.surface2  : "#F5F1EB",
    surface3:  darkMode ? T.surface3  : "#EDE9E2",
    goldDim:   darkMode ? T.goldDim   : "rgba(245,184,65,0.2)",
    border:    darkMode ? T.border    : "rgba(0,0,0,0.08)",
    text:      darkMode ? T.text      : "#1A1712",
    textMuted: darkMode ? T.textMuted : "#94A3B8",
    textFaint: darkMode ? T.textFaint : "#64748B",
  };

  const [activeFilter, setActiveFilter] = useState<NFLFilter>("Today");
  const [selectedSig, setSelectedSig] = useState<NFLSignal | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<BoardSortMode>("priority");
  const [liveOnly, setLiveOnly] = useState(false);
  const [actionableOnly, setActionableOnly] = useState(false);
  // FIX: mobile subnav drawer
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  /* Live signals — falls back to mocks if API unavailable */
  const { signals: liveNFLSignals, isLive, error: liveError } = useNFLSignals(NFL_SIGNALS);

  const rankedNFL = useMemo(() => {
    const src = (liveNFLSignals as NFLSignal[]).map(s => ({ ...s, sport: "NFL" as const }));
    return src.some(s => (s as any)._score)
      ? [...src].sort((a, b) => ((b as any)._score?.totalScore ?? 0) - ((a as any)._score?.totalScore ?? 0))
      : scoreAndRankSignals(src);
  }, [liveNFLSignals]);

  // Featured edge: use highest-score live signal, fallback to hardcoded
  const topNFL = rankedNFL[0];
  const feat = topNFL ? {
    ...NFL_FEATURED_EDGE,
    headline: topNFL.headline,
    body: topNFL.detail,
    action: topNFL.action_takeaway,
    verdict: topNFL.verdict,
    confidence: topNFL.confidence,
    sources: topNFL.sources,
    sourceLabels: topNFL.sourceLabels,
    whyItMatters: topNFL.why_it_matters,
    teamColor: NFL_TEAM_COLORS[topNFL.team]?.primary ?? NFL_FEATURED_EDGE.teamColor,
    _score: (topNFL as any)._score,
  } : NFL_FEATURED_EDGE;

  /* Filter pipeline */
  let visibleSigs = rankedNFL.filter(s => matchNFLFilter(s as NFLSignal, activeFilter));
  if (teamFilter) {
    visibleSigs = visibleSigs.filter(s => s.team === teamFilter || s.opponent === teamFilter);
  }
  if (liveOnly) {
    visibleSigs = visibleSigs.filter(s => signalLifecycle(s) === "Early" || signalLifecycle(s) === "Developing");
  }
  if (actionableOnly) {
    visibleSigs = visibleSigs.filter(s => signalIsActionable(s));
  }
  visibleSigs = [...visibleSigs].sort((a, b) => compareSignals(a, b, sortMode));

  const totalSignals   = rankedNFL.length;
  const confirmedCount = rankedNFL.filter(s => s.verdict === "confirmed").length;
  const highConfCount  = rankedNFL.filter(s => s.confidence >= 80).length;
  const injuryCount    = rankedNFL.filter(s => s.type === "injury").length;

  /* Tab button style */
  function tabStyle(active: boolean, accent = T.gold): React.CSSProperties {
    return {
      padding: "6px 13px", borderRadius: 2,
      border: `1px solid ${active ? accent : (darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)")}`,
      background: active ? `${accent}18` : "transparent",
      color: active ? accent : TH.textMuted,
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: 14, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" as const,
      cursor: "pointer", transition: "0.12s",
    };
  }

  /* Sidebar mode button style */
  function modeStyle(active: boolean): React.CSSProperties {
    return {
      display: "flex", alignItems: "center", gap: 6,
      padding: "8px 10px", marginBottom: 1, borderRadius: 3,
      background: "transparent",
      color: active ? T.gold : TH.textMuted,
      cursor: "pointer", transition: "background 0.12s, color 0.12s",
      width: "100%", textAlign: "left" as const, border: "none",
      borderLeft: `2px solid ${active ? T.gold : "transparent"}`,
    };
  }

  return (
    <div style={{ display: "flex", height: "100%", position: "relative" }}>
      {/* FIX: mobile backdrop */}
      {isMobile && navOpen && (
        <div onClick={() => setNavOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 49 }} />
      )}
      {/* ── Left board subnav ── */}
      <div
        className="board-subnav"
        style={{
          width: 200, flexShrink: 0,
          borderRight: `1px solid ${TH.goldDim}`,
          background: TH.surface1,
          display: "flex", flexDirection: "column",
          overflowY: "auto",
          // FIX: on mobile become a fixed overlay drawer
          ...(isMobile ? {
            position: "fixed" as const, top: 0, left: 0, height: "100dvh",
            zIndex: 50,
            transform: navOpen ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 0.25s ease",
          } : {}),
        }}
      >
        <div style={{ padding: "14px 10px 8px" }}>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
            textTransform: "uppercase", color: TH.textFaint, marginBottom: 8, paddingLeft: 10,
          }}>NFL Board</div>

          {NFL_MODES.map(({ label, mode }) => {
            const isActive = activeFilter === mode;
            return (
              <button
                key={label}
                style={modeStyle(isActive)}
                onClick={() => { setActiveFilter(mode as NFLFilter); if (isMobile) setNavOpen(false); }}
              >
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 14, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div style={{ margin: "8px 10px", borderTop: `1px solid ${TH.goldDim}` }} />

        {/* Quick Teams */}
        <div style={{ padding: "0 10px 14px" }}>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
            textTransform: "uppercase", color: TH.textFaint, marginBottom: 8, paddingLeft: 10,
          }}>Teams</div>
          {NFL_QUICK_TEAMS.map(t => {
            const teamColors = NFL_TEAM_COLORS[t.abbr] ?? { primary: T.gold };
            const isActive = teamFilter === t.abbr;
            return (
              <button
                key={t.abbr}
                onClick={() => { setTeamFilter(isActive ? null : t.abbr); if (isMobile) setNavOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 9,
                  padding: "9px 10px", borderRadius: 3, width: "100%",
                  background: isActive ? `${teamColors.primary}18` : "transparent",
                  border: "none",
                  cursor: "pointer", transition: "background 0.12s",
                  marginBottom: 1,
                }}
              >
                <TeamLogoImg abbr={t.abbr} src={NFL_LOGO_URLS[t.abbr]} size={36} shape="square" />
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 16, fontWeight: 700, letterSpacing: "0.05em",
                  color: isActive ? teamColors.primary : TH.textMuted,
                  textTransform: "uppercase",
                }}>{t.abbr}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main content column ── */}
      <div className="board-main-col" style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>

        {/* Page header */}
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          padding: isMobile ? "14px 16px 12px" : "20px 24px 16px",
          borderBottom: `1px solid ${TH.goldDim}`,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
            {/* FIX: hamburger on mobile to open subnav drawer */}
            {isMobile && (
              <button
                onClick={() => setNavOpen(o => !o)}
                style={{ background: "none", border: `1px solid ${TH.goldDim}`, borderRadius: 4, padding: "12px 14px", cursor: "pointer", color: T.gold, flexShrink: 0, marginTop: 2, minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect y="2" width="16" height="2" rx="1" fill="currentColor"/><rect y="7" width="16" height="2" rx="1" fill="currentColor"/><rect y="12" width="16" height="2" rx="1" fill="currentColor"/></svg>
              </button>
            )}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <h1 style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: isMobile ? 18 : 24, fontWeight: 700, color: TH.text, margin: 0, lineHeight: 1.2,
                }}>NFL Intelligence Board</h1>
                <SportBadge status="ACTIVE" />
              </div>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 14, color: TH.textFaint, letterSpacing: "0.06em",
              }}>
                Offseason monitoring · {totalSignals} signals · Depth charts, injuries, and market watch
              </div>
            </div>
          </div>

          {/* Stats strip — hidden on mobile to avoid overflow */}
          {!isMobile && (
          <div style={{ display: "flex", gap: 20, flexShrink: 0 }}>
            {[
              { label: "TOTAL",     val: totalSignals   },
              { label: "CONFIRMED", val: confirmedCount },
              { label: "HIGH CONF", val: highConfCount  },
              { label: "INJURIES",  val: injuryCount    },
            ].map(({ label, val }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 22, fontWeight: 800, color: TH.text, lineHeight: 1 }}>{val}</div>
                <div style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 11, color: TH.textFaint, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
          )}
        </div>

        <TrackRecordStrip league="NFL" darkMode={darkMode} />

        {/* Today's Slate */}
        <div style={{ padding: "14px 24px", borderBottom: `1px solid ${TH.goldDim}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{
              fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
              fontSize: 12, fontWeight: 700, color: TH.textFaint, letterSpacing: "0.12em", textTransform: "uppercase",
            }}>
              NFL Watch Slate
            </span>
          </div>
          <div
            className="board-slate-strip"
            style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}
          >
            {NFL_SLATE.map(game => (
              <NFLSlateCard key={game.id} game={game} TH={TH} />
            ))}
          </div>
        </div>

        {/* Featured Edge */}
        <div style={{ padding: "16px 24px", borderBottom: `1px solid ${TH.goldDim}` }}>
          <div
            role="button"
            tabIndex={topNFL ? 0 : -1}
            aria-label="Open featured NFL signal detail"
            onClick={() => topNFL && setSelectedSig(topNFL)}
            onKeyDown={(event) => {
              if (!topNFL) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedSig(topNFL);
              }
            }}
            style={{
            background: darkMode
              ? "linear-gradient(135deg, #0A0F1A 0%, #101827 100%)"
              : "linear-gradient(135deg, #FFFFFF 0%, #F5F1EB 100%)",
            border: `1px solid ${TH.goldDim}`,
            borderRadius: 5, overflow: "hidden", position: "relative",
            cursor: topNFL ? "pointer" : "default",
          }}>
            {/* Gold top accent */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: T.gold }} />
            {/* Team color glow */}
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 120, background: `linear-gradient(90deg, ${feat.teamColor}22, transparent)`, pointerEvents: "none" }} />

            <div style={{ padding: "16px 20px", position: "relative", zIndex: 2, display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div style={{ flexShrink: 0 }}>
                <TeamLogoImg abbr={feat.team} src={NFL_LOGO_URLS[feat.team]} size={52} shape="square" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{
                    fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                    fontSize: 11, fontWeight: 700, color: T.gold,
                    letterSpacing: "0.12em", textTransform: "uppercase",
                    background: `${T.gold}18`, padding: "2px 7px", borderRadius: 2,
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <Zap size={10} /> Featured Edge
                  </span>
                  <VerdictBadge verdict={feat.verdict} />
                  <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 12, color: TH.textFaint }}>
                    {feat.timestamp}
                  </span>
                </div>

                <div style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 17, fontWeight: 700, color: TH.text, lineHeight: 1.35, marginBottom: 8,
                }}>
                  {feat.headline}
                </div>

                <div style={{
                  fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                  fontSize: 14, color: TH.textMuted, lineHeight: 1.55, marginBottom: 12,
                }}>
                  {feat.body}
                </div>

                {feat.whyItMatters && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: TH.textFaint, marginBottom: 4 }}>Why It Matters</div>
                    <div style={{ fontSize: 13, color: TH.textMuted, lineHeight: 1.55 }}>{feat.whyItMatters}</div>
                  </div>
                )}

                <div style={{
                  background: `${T.gold}14`, border: `1px solid ${T.gold}44`,
                  borderRadius: 3, padding: "9px 14px", marginBottom: 10,
                }}>
                  <span style={{
                    fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                    fontSize: 14, color: TH.text,
                  }}>
                    <span style={{ color: T.gold, fontWeight: 700 }}>ACTION → </span>
                    {feat.action}
                  </span>
                </div>

                {feat.sourceLabels && feat.sourceLabels.length > 0 && (
                  <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 10, color: TH.textFaint, letterSpacing: "0.1em", textTransform: "uppercase" }}>Sources:</span>
                    {feat.sourceLabels.map(label => (
                      <span key={label} style={{ fontSize: 11, color: TH.textMuted, background: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", borderRadius: 3, padding: "1px 6px" }}>{label}</span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <ConfBar value={feat.confidence} color={T.gold} />
                <div style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 11, color: TH.textFaint, marginTop: 4 }}>
                  {feat.sources} sources
                </div>
                {(() => {
                  const sc: SignalScore | undefined = (feat as any)._score;
                  const URGENCY_COLORS: Record<UrgencyLabel, string> = { LIVE: T.danger, URGENT: T.orange, WATCH: T.gold, NOTE: TH.textFaint };
                  if (!sc) return null;
                  return (
                    <>
                      <div style={{ marginTop: 6, display: "flex", gap: 5, justifyContent: "flex-end", flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 16, fontWeight: 800, color: T.gold, fontVariantNumeric: "tabular-nums" }}>{sc.totalScore}/100</span>
                        <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: URGENCY_COLORS[sc.urgencyLabel], background: `${URGENCY_COLORS[sc.urgencyLabel]}18`, borderRadius: 3, padding: "2px 6px", alignSelf: "center" }}>{sc.urgencyLabel}</span>
                        {sc.band && SCORE_BANDS[sc.band] && (
                          <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: SCORE_BANDS[sc.band].color, background: `${SCORE_BANDS[sc.band].color}18`, border: `1px solid ${SCORE_BANDS[sc.band].color}40`, borderRadius: 3, padding: "2px 6px", alignSelf: "center" }}>{SCORE_BANDS[sc.band].label}</span>
                        )}
                      </div>
                      {sc.urgencyReason && (
                        <div style={{ fontSize: 11, color: "#64748B", marginTop: 4, fontStyle: "italic", textAlign: "right" }}>
                          {sc.urgencyReason}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "12px 24px 0",
          borderBottom: `1px solid ${TH.goldDim}`,
          flexWrap: "wrap",
        }}>
          <Filter size={14} color={TH.textFaint} style={{ marginRight: 4 }} />
          {NFL_FILTERS.map(f => (
            <button key={f} style={tabStyle(activeFilter === f)} onClick={() => setActiveFilter(f)}>
              {f}
            </button>
          ))}
          {teamFilter && (
            <button
              style={{ ...tabStyle(true, T.cyan), display: "flex", alignItems: "center", gap: 4 }}
              onClick={() => setTeamFilter(null)}
            >
              {teamFilter} <X size={11} />
            </button>
          )}
        </div>

        {/* Pro banner — locked signal count */}
        <div className="signal-ops-toolbar">
          <div className="signal-ops-toolbar-label">Board priority</div>
          {[
            ["priority", "Best Edge"],
            ["newest", "Newest"],
            ["confidence", "Confidence"],
            ["timing", "Timing"],
            ["movement", "Movement"],
          ].map(([value, label]) => (
            <button key={value} type="button" className={sortMode === value ? "is-active" : ""} onClick={() => setSortMode(value as BoardSortMode)}>
              {label}
            </button>
          ))}
          <label><input type="checkbox" checked={liveOnly} onChange={e => setLiveOnly(e.target.checked)} /> Early/developing</label>
          <label><input type="checkbox" checked={actionableOnly} onChange={e => setActionableOnly(e.target.checked)} /> Actionable</label>
        </div>

        <ProBoardBanner
          freeCount={FREE_LIMIT}
          totalCount={visibleSigs.length}
          sport="NFL"
          darkMode={darkMode}
        />

        {/* Signal table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: TH.surface2 }}>
                {["#", "TYPE", "SIGNAL", "PLAYER", "VERDICT", "CONF", "TIME"].map(h => (
                  <th key={h} style={{
                    padding: h === "#" ? "10px 8px 10px 24px" : "10px 12px",
                    textAlign: "left",
                    fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                    fontSize: 13, fontWeight: 700, letterSpacing: "0.12em",
                    textTransform: "uppercase", color: TH.textFaint,
                    borderBottom: `1px solid ${TH.goldDim}`,
                    whiteSpace: "nowrap",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleSigs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{
                    padding: "40px 24px", textAlign: "center",
                    fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                    fontSize: 15, color: TH.textFaint, letterSpacing: "0.08em",
                  }}>
                    No signals match this filter
                  </td>
                </tr>
              ) : (
                visibleSigs.map((sig, idx) => {
                  const typeColor = TYPE_META[sig.type].color;
                  const vColor = VERDICT_COLORS[sig.verdict];
                  const isSelected = selectedSig?.id === sig.id;
                  const isFree = rowIsFree(idx);
                  const lifecycle = signalLifecycle(sig);
                  const lifecycleColor = lifecycleTone(lifecycle);
                  const hasMovement = signalHasMovement(sig);
                  const trustLabel = signalTrustLabel(sig);
                  return (
                    <tr
                      key={sig.id}
                      className="sig-row-tap"
                      role="button"
                      tabIndex={0}
                      aria-label={`Open ${sig.headline} signal detail`}
                      onClick={() => {
                        if (!isFree) { openModal("NFL"); return; }
                        setSelectedSig(sig);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        if (!isFree) { openModal("NFL"); return; }
                        setSelectedSig(sig);
                      }}
                      style={{
                        cursor: "pointer",
                        borderBottom: `1px solid ${TH.goldDim}`,
                        background: isSelected
                          ? `${T.gold}0A`
                          : darkMode ? "transparent" : "transparent",
                        transition: "background 0.1s",
                        filter: isFree ? "none" : "blur(1.5px)",
                        opacity: isFree ? 1 : 0.55,
                        pointerEvents: isFree ? "auto" : "auto",
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = darkMode ? "rgba(245,184,65,0.04)" : "rgba(245,184,65,0.06)";
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = "transparent";
                      }}
                    >
                      <td style={{ padding: "12px 8px 12px 24px", color: TH.textFaint, fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 13 }}>
                        {isFree ? idx + 1 : (
                          <Lock size={12} color={T.gold} />
                        )}
                      </td>
                      <td style={{ padding: "12px 12px" }}>
                        <div style={{ display: "grid", gap: 5 }}>
                          <TypeChip type={sig.type} />
                          <span style={{ display: "inline-flex", width: "fit-content", padding: "2px 7px", borderRadius: 3, border: `1px solid ${lifecycleColor}44`, background: `${lifecycleColor}12`, color: lifecycleColor, fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>{lifecycle}</span>
                          {hasMovement && <span style={{ color: T.cyan, fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Moved</span>}
                        </div>
                      </td>
                      <td style={{ padding: "12px 12px", minWidth: 240, maxWidth: 400 }}>
                        <div style={{
                          fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                          fontSize: 15, fontWeight: 700, color: TH.text,
                          lineHeight: 1.35, marginBottom: 2,
                        }}>
                          {sig.headline}
                        </div>
                        <div style={{
                          fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                          fontSize: 12, color: TH.textFaint, lineHeight: 1.4,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 380,
                        }}>
                          {sig.detail}
                        </div>
                        <div className="signal-board-trust-badge">Trust: {trustLabel}</div>
                      </td>
                      <td style={{ padding: "12px 12px", whiteSpace: "nowrap" }}>
                        {sig.player ? (
                          <div>
                            <div style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 14, fontWeight: 700, color: TH.text }}>{sig.player}</div>
                            <div style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 12, color: TH.textFaint }}>{sig.team}</div>
                          </div>
                        ) : (
                          <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 14, fontWeight: 700, color: TH.textFaint }}>
                            {sig.team}{sig.opponent ? ` vs ${sig.opponent}` : ""}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "12px 12px" }}>
                        <VerdictBadge verdict={sig.verdict} />
                      </td>
                      <td style={{ padding: "12px 12px", minWidth: 90 }}>
                        <ConfBar value={sig.confidence} color={typeColor} />
                      </td>
                      <td style={{ padding: "12px 24px 12px 12px", whiteSpace: "nowrap" }}>
                        {isFree ? (
                          <span style={{
                            fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                            fontSize: 13, color: TH.textFaint,
                          }}>
                            {sig.timestamp}
                          </span>
                        ) : (
                          <span style={{
                            fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                            fontSize: 12, fontWeight: 800, color: T.gold,
                            letterSpacing: "0.1em", textTransform: "uppercase",
                            background: `${T.gold}18`, padding: "3px 8px", borderRadius: 2,
                            border: `1px solid ${T.gold}44`,
                          }}>PRO</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SignalDetailDrawer
        open={!!selectedSig}
        signal={selectedSig}
        sport="NFL"
        onClose={() => setSelectedSig(null)}
      />
    </div>
  );
}

/* ── Thin wrapper (keeps useShellTheme inside ThemeCtx.Provider) ── */
export default function NFLBoard() {
  return (
    <V2Shell boardsMode>
      <NFLBoardInner />
    </V2Shell>
  );
}
