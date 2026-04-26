import React, { useState, useMemo } from "react";
import V2Shell, { SportBadge, useShellTheme } from "../components/V2Shell";
import {
  CFB_SIGNALS, CFB_SLATE, CFB_FEATURED_EDGE,
  CFB_QUICK_TEAMS, CFB_TEAM_COLORS, CFB_TYPE_META,
  type CFBSignal, type CFBSignalType, type Verdict,
} from "../data/cfbMockData";
import { Zap, X, Filter, TrendingUp, AlertCircle, ChevronRight, Lock } from "lucide-react";
import { scoreAndRankSignals, type SignalScore, type UrgencyLabel } from "../lib/signalScorer";
import { useSignalGate, FREE_LIMIT } from "../context/SignalGate";
import { ProRowOverlay, ProBoardBanner, ProActionGate } from "../components/ProGate";
import { TeamLogoImg } from "../components/v2/SportVisuals";

/* ── CFB team logo URLs (ESPN NCAA CDN, numeric IDs) ── */
const CFB_LOGO_URLS: Record<string, string> = {
  BAMA: "https://a.espncdn.com/i/teamlogos/ncaa/500/333.png",
  UGA:  "https://a.espncdn.com/i/teamlogos/ncaa/500/61.png",
  OHIO: "https://a.espncdn.com/i/teamlogos/ncaa/500/194.png",
  MICH: "https://a.espncdn.com/i/teamlogos/ncaa/500/130.png",
  TX:   "https://a.espncdn.com/i/teamlogos/ncaa/500/251.png",
  LSU:  "https://a.espncdn.com/i/teamlogos/ncaa/500/99.png",
  USC:  "https://a.espncdn.com/i/teamlogos/ncaa/500/30.png",
  ND:   "https://a.espncdn.com/i/teamlogos/ncaa/500/87.png",
  FSU:  "https://a.espncdn.com/i/teamlogos/ncaa/500/52.png",
  CLEM: "https://a.espncdn.com/i/teamlogos/ncaa/500/228.png",
  UNC:  "https://a.espncdn.com/i/teamlogos/ncaa/500/153.png",
  PENN: "https://a.espncdn.com/i/teamlogos/ncaa/500/213.png",
};

/* ── Design tokens (dark) ── */
const T = {
  bg:       "#0A0B0D",
  surface1: "#111317",
  surface2: "#16191E",
  surface3: "#1B1F25",
  gold:     "#CAA85A",
  goldBright:"#D8B86A",
  goldDim:  "rgba(202,168,90,0.18)",
  text:     "#F3EFE6",
  textMuted:"#B7AFA0",
  textFaint:"#7E776A",
  green:    "#4CAF82",
  orange:   "#D98A42",
  cyan:     "#4AA8C8",
  danger:   "#D94B4B",
};

/* ── Verdict badge ── */
const VERDICT_COLORS: Record<Verdict, { bg: string; text: string; label: string }> = {
  confirmed:    { bg: "rgba(76,175,130,0.12)", text: "#4CAF82", label: "CONFIRMED" },
  likely:       { bg: "rgba(202,168,90,0.12)", text: "#CAA85A", label: "LIKELY" },
  rumor:        { bg: "rgba(217,138,66,0.12)", text: "#D98A42", label: "RUMOR" },
  contradicted: { bg: "rgba(217,75,75,0.12)",  text: "#D94B4B", label: "CONTRADICTED" },
  review:       { bg: "rgba(74,168,200,0.12)", text: "#4AA8C8", label: "REVIEW" },
};

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const vc = VERDICT_COLORS[verdict];
  return (
    <span style={{
      fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
      fontSize: 11, fontWeight: 800, letterSpacing: "0.1em",
      background: vc.bg, color: vc.text,
      padding: "3px 8px", borderRadius: 2,
      textTransform: "uppercase", whiteSpace: "nowrap",
    }}>
      + {vc.label}
    </span>
  );
}

function TypeChip({ type }: { type: CFBSignalType }) {
  const meta = CFB_TYPE_META[type];
  return (
    <span style={{
      fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
      fontSize: 11, fontWeight: 800, letterSpacing: "0.1em",
      color: meta.color,
      textTransform: "uppercase",
      border: `1px solid ${meta.color}44`,
      background: `${meta.color}12`,
      padding: "3px 8px", borderRadius: 2,
      whiteSpace: "nowrap",
    }}>
      {meta.label}
    </span>
  );
}

function ConfBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 60, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
        <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{
        fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
        fontSize: 14, fontWeight: 700, color,
      }}>{value}%</span>
    </div>
  );
}

/* ── CFB sidebar filters ── */
const CFB_FILTERS = [
  { key: "SIGNAL STREAM", label: "Signal Stream" },
  { key: "TRANSFER PORTAL", label: "Transfer Portal" },
  { key: "INJURY WATCH", label: "Injury Watch" },
  { key: "LINE MOVEMENT", label: "Line Movement" },
  { key: "MATCHUP EDGES", label: "Matchup Edges" },
  { key: "SHARP MONEY", label: "Sharp Money" },
  { key: "COACHING", label: "Coaching Intel" },
] as const;
type CFBFilterKey = typeof CFB_FILTERS[number]["key"];

const FILTER_TYPES: Record<CFBFilterKey, CFBSignalType[]> = {
  "SIGNAL STREAM":  [],
  "TRANSFER PORTAL":["transfer", "portal"],
  "INJURY WATCH":   ["injury"],
  "LINE MOVEMENT":  ["line_move"],
  "MATCHUP EDGES":  ["matchup"],
  "SHARP MONEY":    ["sharp"],
  "COACHING":       ["coaching"],
};

/* ── Tab filters across board top ── */
const TAB_FILTERS = ["Today", "SEC", "Big Ten", "ACC", "Big 12", "Ind."] as const;
type TabFilter = typeof TAB_FILTERS[number];

/* ── Detail Panel ── */
function CFBDetailPanel({ sig, onClose, TH, darkMode }: {
  sig: CFBSignal;
  onClose: () => void;
  TH: Record<string, string>;
  darkMode: boolean;
}) {
  const teamColors = CFB_TEAM_COLORS[sig.team] ?? { primary: T.gold, secondary: "#333" };
  const typeColor = CFB_TYPE_META[sig.type].color;

  return (
    <div style={{
      height: "100%", overflowY: "auto",
      background: TH.surface1,
      borderLeft: `1px solid ${TH.goldDim}`,
    }}>
      {/* Header strip */}
      <div style={{
        background: `linear-gradient(135deg, ${teamColors.primary}22 0%, transparent 70%)`,
        borderBottom: `1px solid ${TH.goldDim}`,
        padding: "16px 18px 14px",
        position: "relative",
      }}>
        <button onClick={onClose} style={{
          position: "absolute", top: 12, right: 12,
          background: "rgba(255,255,255,0.07)", border: "none", borderRadius: "50%",
          color: TH.textFaint, cursor: "pointer",
          width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <X size={13} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <TypeChip type={sig.type} />
          <span style={{
            fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
            fontSize: 12, color: TH.textFaint,
          }}>
            {sig.team}{sig.conference ? ` · ${sig.conference}` : ""}
          </span>
          {sig.player && (
            <span style={{
              fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
              fontSize: 12, color: T.gold, fontWeight: 700,
            }}>
              · {sig.player}
            </span>
          )}
        </div>

        <div style={{
          fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
          fontSize: 15, fontWeight: 700, color: TH.text, lineHeight: 1.35, marginBottom: 12,
        }}>
          {sig.headline}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <VerdictBadge verdict={sig.verdict} />
          <ConfBar value={sig.confidence} color={typeColor} />
          <span style={{
            fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
            fontSize: 12, color: TH.textFaint,
          }}>
            {sig.sources} sources · {sig.timestamp}
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Intel */}
        <div>
          <div style={{
            fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
            color: TH.textFaint, marginBottom: 6,
          }}>
            Intel
          </div>
          <div style={{ fontSize: 14, color: TH.textMuted, lineHeight: 1.65 }}>
            {sig.detail}
          </div>
        </div>

        {/* Why it matters */}
        <div>
          <div style={{
            fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
            color: TH.textFaint, marginBottom: 6,
          }}>
            Why It Matters
          </div>
          <div style={{ fontSize: 14, color: TH.textMuted, lineHeight: 1.65 }}>
            {sig.why_it_matters}
          </div>
        </div>

        {/* Action — Pro gated */}
        <ProActionGate sport="CFB" actionText={sig.action_takeaway} darkMode={darkMode}>
          <div style={{
            background: `${T.gold}12`, borderRadius: 4,
            border: `1px solid ${T.gold}44`,
            padding: "12px 14px",
          }}>
            <div style={{
              fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
              fontSize: 11, fontWeight: 700, color: T.gold,
              letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6,
            }}>
              <Zap size={11} style={{ display: "inline", marginRight: 4 }} />
              Action →
            </div>
            <div style={{
              fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
              fontSize: 14, color: TH.text, lineHeight: 1.55,
            }}>
              {sig.action_takeaway}
            </div>
          </div>
        </ProActionGate>

        {/* ── Source metadata ── */}
        {(sig.sourceLabels?.length || sig.confirmationStrength) && (
          <div style={{ background: darkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", borderRadius: 4, padding: "10px 12px" }}>
            <div style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: TH.textFaint, marginBottom: 6 }}>Source Coverage</div>
            {sig.sourceLabels && sig.sourceLabels.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: sig.confirmationStrength ? 6 : 0 }}>
                {sig.sourceLabels.map(label => (
                  <span key={label} style={{ fontSize: 11, color: TH.textMuted, background: darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", borderRadius: 3, padding: "2px 7px", fontWeight: 500 }}>{label}</span>
                ))}
              </div>
            )}
            {sig.confirmationStrength && (
              <div style={{ fontSize: 11, color: sig.confirmationStrength === "consensus" ? T.green : sig.confirmationStrength === "corroborated" ? T.gold : TH.textFaint, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", marginTop: 2 }}>
                {sig.confirmationStrength === "consensus" ? "✓ Consensus" : sig.confirmationStrength === "corroborated" ? "◎ Corroborated" : "△ Single source"}
              </div>
            )}
          </div>
        )}

        {/* ── Scheme + matchup intel ── */}
        {(sig.schemeNote || sig.matchupEdge || sig.injuryDesignation) && (
          <div>
            {sig.injuryDesignation && (
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.danger, background: "rgba(217,75,75,0.1)", borderRadius: 3, padding: "2px 8px" }}>Designation: {sig.injuryDesignation}</span>
              </div>
            )}
            {sig.schemeNote && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: TH.textFaint, marginBottom: 3 }}>Scheme Note</div>
                <div style={{ fontSize: 13, color: TH.textMuted, lineHeight: 1.5 }}>{sig.schemeNote}</div>
              </div>
            )}
            {sig.matchupEdge && (
              <div>
                <div style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: TH.textFaint, marginBottom: 3 }}>Matchup Edge</div>
                <div style={{ fontSize: 13, color: TH.textMuted, lineHeight: 1.5 }}>{sig.matchupEdge}</div>
              </div>
            )}
          </div>
        )}

        {/* ── Line movement ── */}
        {sig.lineMovement && (
          <div style={{ background: "rgba(76,175,130,0.07)", border: "1px solid rgba(76,175,130,0.18)", borderRadius: 4, padding: "10px 12px" }}>
            <div style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.green, marginBottom: 6 }}>Line Movement</div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: TH.textMuted }}><span style={{ color: TH.textFaint }}>Open:</span> {sig.lineMovement.open}</span>
              <span style={{ color: TH.textFaint }}>→</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.green }}>{sig.lineMovement.current}</span>
            </div>
            {sig.lineMovement.note && <div style={{ fontSize: 11, color: TH.textFaint, marginTop: 5 }}>{sig.lineMovement.note}</div>}
          </div>
        )}

        {/* ── Relevance flags ── */}
        {(sig.bettingRelevance || sig.fantasyRelevance) && (
          <div style={{ display: "flex", gap: 6 }}>
            {sig.bettingRelevance && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.gold, background: "rgba(202,168,90,0.12)", borderRadius: 3, padding: "2px 8px" }}>Betting Signal</span>}
            {sig.fantasyRelevance && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.cyan, background: "rgba(74,168,200,0.12)", borderRadius: 3, padding: "2px 8px" }}>Fantasy Impact</span>}
          </div>
        )}

        {/* Tags */}
        {sig.tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, paddingTop: 4 }}>
            {sig.tags.map(tag => (
              <span key={tag} style={{
                fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                fontSize: 11, color: TH.textFaint,
                background: "rgba(255,255,255,0.05)",
                border: `1px solid rgba(255,255,255,0.07)`,
                padding: "2px 8px", borderRadius: 2,
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── CFBBoardInner ── */
function CFBBoardInner() {
  const darkMode = useShellTheme();
  const { rowIsFree, openModal } = useSignalGate();
  const TH: Record<string, string> = {
    bg:        darkMode ? T.bg        : "#F0ECE4",
    surface1:  darkMode ? T.surface1  : "#FFFFFF",
    surface2:  darkMode ? T.surface2  : "#F5F1EB",
    surface3:  darkMode ? T.surface3  : "#EDE9E2",
    text:      darkMode ? T.text      : "#1A1712",
    textMuted: darkMode ? T.textMuted : "#3D3830",
    textFaint: darkMode ? T.textFaint : "#8C8277",
    border:    darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)",
    goldDim:   darkMode ? T.goldDim   : "rgba(202,168,90,0.25)",
    surface1TL: darkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
  };

  const [sidebarFilter, setSidebarFilter] = useState<CFBFilterKey>("SIGNAL STREAM");
  const [tabFilter, setTabFilter] = useState<TabFilter>("Today");
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [selectedSig, setSelectedSig] = useState<CFBSignal | null>(null);

  /* Score + rank all CFB signals */
  const rankedCFB = useMemo(() => scoreAndRankSignals(
    CFB_SIGNALS.map(s => ({ ...s, sport: "CFB" as const }))
  ), []);
  const topCFB = rankedCFB[0];
  // Build dynamic featured edge from top-scoring signal
  const feat = topCFB ? {
    ...CFB_FEATURED_EDGE,
    headline: topCFB.headline,
    subhead: topCFB.detail,
    action: topCFB.action_takeaway,
    verdict: topCFB.verdict,
    confidence: topCFB.confidence,
    sources: topCFB.sources,
    sourceLabels: topCFB.sourceLabels,
    whyItMatters: topCFB.why_it_matters,
    _score: topCFB._score,
  } : CFB_FEATURED_EDGE;

  /* Filter signals — use ranked order */
  const visibleSigs = rankedCFB.filter(s => {
    const types = FILTER_TYPES[sidebarFilter];
    if (types.length > 0 && !types.includes(s.type)) return false;
    if (tabFilter !== "Today" && s.conference && !s.conference.includes(tabFilter)) return false;
    if (teamFilter && s.team !== teamFilter) return false;
    return true;
  });

  const totalSignals = CFB_SIGNALS.length;
  const confirmed = CFB_SIGNALS.filter(s => s.verdict === "confirmed").length;
  const highConf = CFB_SIGNALS.filter(s => s.confidence >= 80).length;
  const injuries = CFB_SIGNALS.filter(s => s.type === "injury").length;
  const transfers = CFB_SIGNALS.filter(s => s.type === "transfer" || s.type === "portal").length;

  return (
    <div style={{ display: "flex", height: "100%", background: TH.bg }}>

      {/* ── Left sidebar ── */}
      <div style={{
        width: 200, flexShrink: 0,
        background: TH.surface1,
        borderRight: `1px solid ${TH.border}`,
        display: "flex", flexDirection: "column",
        overflowY: "auto",
      }}>
        {/* Filters */}
        <div style={{ padding: "14px 0 10px" }}>
          {CFB_FILTERS.map(f => {
            const isActive = sidebarFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setSidebarFilter(f.key)}
                style={{
                  width: "100%", padding: "9px 18px",
                  background: isActive ? `${T.gold}10` : "transparent",
                  border: "none",
                  borderLeft: `3px solid ${isActive ? T.gold : "transparent"}`,
                  color: isActive ? T.gold : TH.textMuted,
                  fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                  fontSize: 14, fontWeight: isActive ? 700 : 500,
                  letterSpacing: "0.04em", textAlign: "left",
                  cursor: "pointer",
                  transition: "all 0.1s",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Quick teams */}
        <div style={{
          borderTop: `1px solid ${TH.border}`,
          padding: "12px 18px 6px",
        }}>
          <div style={{
            fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
            textTransform: "uppercase", color: TH.textFaint, marginBottom: 8,
          }}>
            Teams
          </div>
          {CFB_QUICK_TEAMS.map(tm => {
            const colors = CFB_TEAM_COLORS[tm];
            const isActive = teamFilter === tm;
            return (
              <button
                key={tm}
                onClick={() => setTeamFilter(isActive ? null : tm)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "8px 0",
                  background: "transparent", border: "none",
                  cursor: "pointer",
                }}
              >
                <TeamLogoImg abbr={tm} src={CFB_LOGO_URLS[tm]} size={30} shape="circle" />
                <span style={{
                  fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                  fontSize: 15, color: isActive ? T.gold : TH.textMuted, fontWeight: isActive ? 700 : 500,
                }}>
                  {tm}
                </span>
              </button>
            );
          })}
        </div>

        {/* Pro sidebar card */}
        <div style={{
          margin: "auto 12px 14px",
          marginTop: 14,
          background: `${T.gold}08`,
          border: `1px solid ${T.gold}25`,
          borderRadius: 4, padding: "12px",
        }}>
          <div style={{
            fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
            color: T.gold, marginBottom: 5,
          }}>
            Pro Intelligence
          </div>
          <div style={{
            fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
            fontSize: 12, color: TH.textFaint, lineHeight: 1.5, marginBottom: 10,
          }}>
            Transfer portal · Depth charts · Coaching intel · Multi-sport
          </div>
          <button
            onClick={() => openModal("CFB")}
            style={{
              width: "100%", padding: "8px 0",
              background: T.gold, color: T.bg, border: "none", borderRadius: 3,
              fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
              fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            $19 / Month
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Board header */}
        <div style={{
          padding: "14px 24px 12px",
          borderBottom: `1px solid ${TH.border}`,
          background: TH.surface1,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{
              fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
              fontSize: 24, fontWeight: 800, letterSpacing: "0.02em", color: TH.text,
            }}>
              CFB Intelligence Board
            </span>
            <SportBadge status="ACTIVE" />
          </div>
          <div style={{
            fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
            fontSize: 13, color: TH.textFaint,
          }}>
            Fall season · {totalSignals} signals · Updated continuously
          </div>
        </div>

        {/* Stats strip */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
          borderBottom: `1px solid ${TH.border}`,
          flexShrink: 0,
        }}>
          {[
            { label: "Total", value: totalSignals },
            { label: "Confirmed", value: confirmed },
            { label: "High Conf", value: highConf },
            { label: "Injuries", value: injuries },
            { label: "Transfers", value: transfers },
          ].map((stat, i) => (
            <div key={i} style={{
              padding: "10px 20px",
              borderRight: i < 4 ? `1px solid ${TH.border}` : "none",
            }}>
              <div style={{
                fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                fontSize: 18, fontWeight: 800, color: TH.text,
              }}>
                {stat.value}
              </div>
              <div style={{
                fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                fontSize: 11, color: TH.textFaint, textTransform: "uppercase", letterSpacing: "0.1em",
              }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── Slate cards ── */}
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${TH.border}`, flexShrink: 0 }}>
          <div style={{
            fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
            color: TH.textFaint, marginBottom: 10,
          }}>
            · Today's CFB Slate
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {CFB_SLATE.map(game => {
              const awayC = CFB_TEAM_COLORS[game.away];
              const homeC = CFB_TEAM_COLORS[game.home];
              return (
                <div key={game.id} style={{
                  minWidth: 180, flexShrink: 0,
                  background: TH.surface2,
                  border: `1px solid ${TH.border}`,
                  borderRadius: 4, padding: "12px 14px",
                }}>
                  {/* Teams */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <TeamLogoImg abbr={game.away} src={CFB_LOGO_URLS[game.away]} size={22} shape="square" />
                    <span style={{
                      fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                      fontSize: 14, fontWeight: 800, color: TH.textMuted,
                    }}>{game.away}</span>
                    <span style={{
                      fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                      fontSize: 11, color: TH.textFaint,
                    }}>@</span>
                    <TeamLogoImg abbr={game.home} src={CFB_LOGO_URLS[game.home]} size={22} shape="square" />
                    <span style={{
                      fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                      fontSize: 14, fontWeight: 800, color: TH.text,
                    }}>{game.home}</span>
                  </div>
                  {/* Odds */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 13, fontWeight: 700, color: TH.text }}>{game.spread}</div>
                      <div style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 10, color: TH.textFaint, textTransform: "uppercase", letterSpacing: "0.08em" }}>Spread</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 13, fontWeight: 700, color: TH.text }}>{game.total}</div>
                      <div style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 10, color: TH.textFaint, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total</div>
                    </div>
                  </div>
                  {/* Time + signals */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 12, color: TH.textFaint }}>{game.time}</span>
                    <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 11, color: T.gold }}>
                      ⚡ {game.signals} signals
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Featured Edge */}
        <div style={{
          margin: "14px 20px 0",
          background: `linear-gradient(135deg, ${T.gold}0A 0%, ${TH.surface2} 60%)`,
          border: `1px solid ${T.gold}30`,
          borderRadius: 4, padding: "16px 20px",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{
              fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
              fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
              color: T.gold, background: `${T.gold}16`, border: `1px solid ${T.gold}33`,
              padding: "3px 8px", borderRadius: 2,
            }}>⚡ Featured Edge</span>
            <VerdictBadge verdict={feat.verdict} />
            <span style={{
              fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
              fontSize: 12, color: TH.textFaint,
            }}>{CFB_FEATURED_EDGE.timestamp}</span>
          </div>
          <div style={{
            fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
            fontSize: 17, fontWeight: 800, color: TH.text, lineHeight: 1.3, marginBottom: 8,
          }}>
            {feat.headline}
          </div>
          <div style={{ fontSize: 13, color: TH.textMuted, lineHeight: 1.6, marginBottom: 10 }}>
            {feat.subhead}
          </div>
          <div style={{
            background: `${T.gold}0F`, border: `1px solid ${T.gold}30`,
            borderRadius: 3, padding: "10px 14px",
            fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
            fontSize: 13, color: TH.text, lineHeight: 1.5,
          }}>
            <span style={{ color: T.orange, fontWeight: 700, letterSpacing: "0.04em" }}>Action → </span>
            {feat.action}
          </div>
          {feat.whyItMatters && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: TH.textFaint, marginBottom: 3 }}>Why It Matters</div>
              <div style={{ fontSize: 13, color: TH.textMuted, lineHeight: 1.5 }}>{feat.whyItMatters}</div>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <ConfBar value={feat.confidence} color={T.gold} />
            <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 12, color: TH.textFaint }}>
              {feat.sources} sources · {CFB_FEATURED_EDGE.conference}
            </span>
            {feat.sourceLabels && feat.sourceLabels.length > 0 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {feat.sourceLabels.map(label => (
                  <span key={label} style={{ fontSize: 11, color: TH.textMuted, background: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", borderRadius: 3, padding: "1px 6px" }}>{label}</span>
                ))}
              </div>
            )}
            {(() => {
              const sc: SignalScore | undefined = (feat as any)._score;
              const URGENCY_COLORS: Record<UrgencyLabel, string> = { LIVE: T.danger, URGENT: T.orange, WATCH: T.gold, NOTE: TH.textFaint };
              if (!sc) return null;
              return (
                <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 16, fontWeight: 800, color: T.gold, fontVariantNumeric: "tabular-nums" }}>{sc.totalScore}/100</span>
                  <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: URGENCY_COLORS[sc.urgencyLabel], background: `${URGENCY_COLORS[sc.urgencyLabel]}18`, borderRadius: 3, padding: "2px 6px" }}>{sc.urgencyLabel}</span>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Tab filters */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6, padding: "12px 20px",
          borderBottom: `1px solid ${TH.border}`,
          marginTop: 14,
          flexShrink: 0, flexWrap: "wrap",
        }}>
          <Filter size={11} style={{ color: TH.textFaint, marginRight: 4 }} />
          {TAB_FILTERS.map(f => {
            const isActive = f === tabFilter;
            return (
              <button
                key={f}
                onClick={() => setTabFilter(f)}
                style={{
                  padding: "6px 13px", borderRadius: 2,
                  border: `1px solid ${isActive ? T.gold : "rgba(255,255,255,0.1)"}`,
                  background: isActive ? "rgba(202,168,90,0.1)" : "transparent",
                  color: isActive ? T.gold : TH.textMuted,
                  fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                  fontSize: 14, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
                  cursor: "pointer", transition: "all 0.12s",
                }}
              >
                {f}
              </button>
            );
          })}
          {teamFilter && (
            <button
              onClick={() => setTeamFilter(null)}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "6px 10px", borderRadius: 2,
                border: `1px solid ${T.gold}55`, background: `${T.gold}12`,
                color: T.gold, cursor: "pointer",
                fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                fontSize: 12, fontWeight: 700,
              }}
            >
              {teamFilter} <X size={11} />
            </button>
          )}
        </div>

        {/* Pro banner */}
        <ProBoardBanner
          freeCount={FREE_LIMIT}
          totalCount={visibleSigs.length}
          sport="CFB"
          darkMode={darkMode}
        />

        {/* Signal table + detail rail */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>

          {/* Signal table */}
          <div style={{ flex: 1, overflowX: "auto", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{
                  background: TH.surface2,
                  borderBottom: `1px solid ${TH.border}`,
                  position: "sticky", top: 0, zIndex: 2,
                }}>
                  {["#", "Type", "Signal", "Team / Player", "Verdict", "Conf", "Time"].map((h, i) => (
                    <th key={h} style={{
                      padding: i === 0 ? "10px 8px 10px 24px" : "10px 12px",
                      fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                      fontSize: 13, fontWeight: 700, letterSpacing: "0.12em",
                      textTransform: "uppercase", color: TH.textFaint,
                      textAlign: "left", whiteSpace: "nowrap",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleSigs.map((sig, idx) => {
                  const typeColor = CFB_TYPE_META[sig.type].color;
                  const isSelected = selectedSig?.id === sig.id;
                  const isFree = rowIsFree(idx);
                  return (
                    <tr
                      key={sig.id}
                      className="sig-row-tap"
                      onClick={() => {
                        if (!isFree) { openModal("CFB"); return; }
                        setSelectedSig(isSelected ? null : sig);
                      }}
                      style={{
                        cursor: "pointer",
                        borderBottom: `1px solid ${TH.goldDim}`,
                        background: isSelected ? `${T.gold}0A` : "transparent",
                        transition: "background 0.1s",
                        filter: isFree ? "none" : "blur(1.5px)",
                        opacity: isFree ? 1 : 0.55,
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = darkMode ? "rgba(202,168,90,0.04)" : "rgba(202,168,90,0.06)";
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = "transparent";
                      }}
                    >
                      <td style={{ padding: "12px 8px 12px 24px", color: TH.textFaint, fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 13 }}>
                        {isFree ? idx + 1 : <Lock size={12} color={T.gold} />}
                      </td>
                      <td style={{ padding: "12px 12px" }}>
                        <TypeChip type={sig.type} />
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
                      </td>
                      <td style={{ padding: "12px 12px", whiteSpace: "nowrap" }}>
                        {sig.player ? (
                          <div>
                            <div style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 14, fontWeight: 700, color: TH.text }}>{sig.player}</div>
                            <div style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 12, color: TH.textFaint }}>{sig.team}{sig.conference ? ` · ${sig.conference}` : ""}</div>
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
                })}
                {visibleSigs.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: "40px 24px", textAlign: "center" }}>
                      <div style={{
                        fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                        fontSize: 15, color: TH.textFaint,
                      }}>
                        No signals match this filter.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Stub notice */}
            <div style={{
              padding: "10px 24px",
              fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
              fontSize: 12, color: TH.textFaint,
            }}>
              <span style={{ background: `${T.orange}18`, border: `1px solid ${T.orange}33`, padding: "2px 7px", borderRadius: 2, marginRight: 6 }}>
                STUB DATA
              </span>
              {totalSignals} realistic placeholder signals — live CFB ingestion coming next sprint
            </div>
          </div>

          {/* Detail rail */}
          {selectedSig && (
            <div style={{ width: 340, flexShrink: 0, overflowY: "auto", borderLeft: `1px solid ${TH.border}` }}>
              <CFBDetailPanel
                sig={selectedSig}
                onClose={() => setSelectedSig(null)}
                TH={TH}
                darkMode={darkMode}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Root export ── */
export default function CFBBoard() {
  return (
    <V2Shell boardsMode>
      <CFBBoardInner />
    </V2Shell>
  );
}
