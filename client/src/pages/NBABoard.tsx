import { useState, useEffect, useCallback } from "react";
import V2Shell, { SportBadge } from "../components/V2Shell";
import {
  PlayerHeadshot, TeamLogoImg,
  MatchupCard, FeaturedEdgeCard, IntelCard,
  VerdictBadge, TypeChip, ConfidenceBar,
  SignalRowVisual,
  T, VERDICT_COLORS, getTeamColors,
} from "../components/v2/SportVisuals";
import { ChevronRight, X, Filter, Zap, TrendingUp, AlertCircle, Lock, Star, Activity, Users, BarChart2, ArrowUpDown } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface LiveSignal {
  id: string;
  league: string;
  signal_type: string;
  headline: string;
  title?: string;
  summary?: string;
  body?: string;
  action_takeaway?: string;
  action_note?: string;
  player_name?: string;
  team?: string;
  matchup?: string;
  verdict?: string;
  confidence_score?: number;
  injury_designation?: string;
  lineup_status?: string;
  line_movement?: any;
  sources?: any[];
  source_count?: number;
  why_it_matters?: string;
  created_at: string;
}

// ─── Sub-nav tabs ────────────────────────────────────────────────────────────

const TABS = [
  { key: "TODAY",      label: "Today",      icon: <Zap size={11} /> },
  { key: "INJURIES",   label: "Injuries",   icon: <AlertCircle size={11} /> },
  { key: "LINEUP",     label: "Lineup",     icon: <Users size={11} /> },
  { key: "PROPS",      label: "Props",      icon: <Star size={11} /> },
  { key: "TRENDS",     label: "Trends",     icon: <TrendingUp size={11} /> },
  { key: "LINE_MOVES", label: "Line Moves", icon: <ArrowUpDown size={11} /> },
] as const;
type TabKey = typeof TABS[number]["key"];

function filterByTab(signals: LiveSignal[], tab: TabKey): LiveSignal[] {
  switch (tab) {
    case "TODAY":      return signals;
    case "INJURIES":   return signals.filter(s => s.signal_type === "injury" || s.injury_designation);
    case "LINEUP":     return signals.filter(s => s.signal_type === "rotation" || s.signal_type === "lineup" || s.lineup_status);
    case "PROPS":      return signals.filter(s => s.signal_type === "prop");
    case "TRENDS":     return signals.filter(s => s.signal_type === "trend" || s.signal_type === "matchup_edge");
    case "LINE_MOVES": return signals.filter(s => s.signal_type === "line_move" || s.line_movement);
    default:           return signals;
  }
}

// ─── NBA teams for filter pills ───────────────────────────────────────────────

const NBA_TEAMS = [
  "LAL", "BOS", "GSW", "MIA", "DEN", "OKC", "MIN", "NYK",
  "MIL", "PHX", "DAL", "CLE", "SAC", "PHI", "ATL", "CHI",
];

// ─── Mock Tonight's Games (falls back to this if no game data from API) ────────

const MOCK_GAMES = [
  { id: "g1", away: "LAL", home: "GSW", time: "7:30 PM ET", status: "LIVE", awayScore: 87, homeScore: 91, period: "Q3 8:22", spread: "GSW -3.5", total: "O/U 228.5", series: "LAL leads 3-2 · G6" },
  { id: "g2", away: "MIA", home: "BOS", time: "8:00 PM ET", status: "LIVE", awayScore: 74, homeScore: 81, period: "Q3 2:14", spread: "BOS -5.5", total: "O/U 212.5", series: "BOS leads 3-1 · G5" },
  { id: "g3", away: "MIN", home: "DEN", time: "9:30 PM ET", status: "PRE",  awayScore: null, homeScore: null, period: null, spread: "DEN -2", total: "O/U 222", series: "Tied 2-2 · G5" },
  { id: "g4", away: "OKC", home: "DAL", time: "9:30 PM ET", status: "PRE",  awayScore: null, homeScore: null, period: null, spread: "OKC -4", total: "O/U 219", series: "OKC leads 2-1 · G4" },
];

// ─── Tonight's Games Bar ──────────────────────────────────────────────────────

function TonightGamesBar({ teamFilter, onSelectTeam }: { teamFilter: string | null; onSelectTeam: (t: string) => void }) {
  return (
    <div style={{
      padding: "10px 20px 12px",
      borderBottom: `1px solid rgba(255,255,255,0.06)`,
      flexShrink: 0,
      background: "rgba(0,0,0,0.18)",
    }}>
      {/* Section label */}
      <div style={{
        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
        fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
        color: T.textFaint, marginBottom: 8, display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, display: "inline-block", animation: "gsPulse 2s ease-in-out infinite" }} />
        Tonight's NBA Slate
        <span style={{ color: T.gold, marginLeft: 2 }}>· Playoffs</span>
      </div>

      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2 }}>
        {MOCK_GAMES.map(game => {
          const isLive = game.status === "LIVE";
          const isHighlighted = teamFilter === game.away || teamFilter === game.home;

          return (
            <div
              key={game.id}
              onClick={() => onSelectTeam(isHighlighted ? "" : game.away)}
              style={{
                flexShrink: 0, width: 220,
                background: isHighlighted ? "rgba(202,168,90,0.1)" : T.surface2,
                border: `1px solid ${isHighlighted ? T.gold : isLive ? "rgba(76,175,130,0.35)" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 5, padding: "10px 12px", cursor: "pointer",
                transition: "all 0.12s",
                position: "relative", overflow: "hidden",
              }}
            >
              {/* Live indicator stripe */}
              {isLive && (
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${T.green}, ${T.green}44)` }} />
              )}

              {/* Status badge */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                  color: isLive ? T.green : T.textFaint,
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  {isLive && <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, display: "inline-block", animation: "gsPulse 1.5s ease-in-out infinite" }} />}
                  {isLive ? game.period : game.time}
                </span>
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 9, color: T.textFaint, letterSpacing: "0.08em",
                }}>{game.series}</span>
              </div>

              {/* Teams + scores */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {[
                  { abbr: game.away, score: game.awayScore, label: "Away" },
                  { abbr: game.home, score: game.homeScore, label: "Home" },
                ].map(team => (
                  <div key={team.abbr} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <TeamLogoImg abbr={team.abbr} size={20} />
                    <span style={{
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
                      color: T.text, flex: 1,
                    }}>{team.abbr}</span>
                    {isLive && team.score !== null && (
                      <span style={{
                        fontSize: 16, fontWeight: 700, color: T.text,
                        fontVariantNumeric: "tabular-nums", minWidth: 28, textAlign: "right",
                      }}>{team.score}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Spread / total */}
              <div style={{
                marginTop: 8, paddingTop: 7, borderTop: "1px solid rgba(255,255,255,0.06)",
                display: "flex", gap: 10,
              }}>
                <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint }}>{game.spread}</span>
                <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint }}>{game.total}</span>
              </div>
            </div>
          );
        })}
      </div>
      <style>{`@keyframes gsPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}

// ─── Right Sidebar Panels ─────────────────────────────────────────────────────

function InjuryPanel({ signals }: { signals: LiveSignal[] }) {
  const injuries = signals.filter(s => s.signal_type === "injury" || s.injury_designation).slice(0, 8);

  const statusColor = (d?: string) => {
    if (!d) return T.textFaint;
    const dl = d.toLowerCase();
    if (dl.includes("out")) return T.danger;
    if (dl.includes("doubtful")) return "#D98A42";
    if (dl.includes("questionable")) return "#D8B86A";
    if (dl.includes("probable") || dl.includes("available")) return T.green;
    return T.textFaint;
  };

  return (
    <div>
      {injuries.length === 0 ? (
        <div style={{ padding: "10px 14px", fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: T.textFaint }}>
          No injury signals in current cycle
        </div>
      ) : (
        injuries.map(sig => {
          const designation = sig.injury_designation ?? "Questionable";
          return (
            <div key={sig.id} style={{
              padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <TeamLogoImg abbr={sig.team ?? "NBA"} size={18} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {sig.player_name ?? sig.headline.slice(0, 30)}
                </div>
                <div style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 10, color: statusColor(designation), letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 1,
                }}>{designation}</div>
              </div>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 10, color: T.textFaint,
              }}>{sig.team}</div>
            </div>
          );
        })
      )}
    </div>
  );
}

function LineupPanel({ signals }: { signals: LiveSignal[] }) {
  const lineup = signals.filter(s => s.signal_type === "rotation" || s.lineup_status || s.signal_type === "lineup").slice(0, 7);

  return (
    <div>
      {lineup.length === 0 ? (
        <div style={{ padding: "10px 14px", fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: T.textFaint }}>
          No lineup signals yet today
        </div>
      ) : (
        lineup.map(sig => (
          <div key={sig.id} style={{
            padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)",
            display: "flex", alignItems: "flex-start", gap: 8,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%", background: T.cyan, marginTop: 4, flexShrink: 0,
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: T.text, lineHeight: 1.35, fontWeight: 500 }}>
                {sig.headline.slice(0, 55)}{sig.headline.length > 55 ? "…" : ""}
              </div>
              {sig.team && (
                <div style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 10, color: T.textFaint, marginTop: 2,
                }}>{sig.team}{sig.lineup_status ? ` · ${sig.lineup_status}` : ""}</div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function TrendsPanel({ signals }: { signals: LiveSignal[] }) {
  const trends = signals.filter(s => s.signal_type === "trend" || s.signal_type === "matchup_edge").slice(0, 6);

  return (
    <div>
      {trends.length === 0 ? (
        <div style={{ padding: "10px 14px", fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: T.textFaint }}>
          No trend signals in current cycle
        </div>
      ) : (
        trends.map(sig => {
          const conf = sig.confidence_score ?? 70;
          return (
            <div key={sig.id} style={{
              padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}>
              <div style={{ fontSize: 12, color: T.text, lineHeight: 1.35, fontWeight: 500, marginBottom: 4 }}>
                {sig.headline.slice(0, 60)}{sig.headline.length > 60 ? "…" : ""}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {sig.team && <TeamLogoImg abbr={sig.team} size={14} />}
                <ConfidenceBar value={conf} width={60} height={3} />
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 10, color: conf >= 80 ? T.gold : T.textFaint,
                  fontVariantNumeric: "tabular-nums",
                }}>{conf}%</span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function RightSidebar({ signals }: { signals: LiveSignal[] }) {
  const [openPanel, setOpenPanel] = useState<"injuries" | "lineup" | "trends">("injuries");

  const panels = [
    { key: "injuries" as const, label: "Injury Report", icon: <AlertCircle size={11} />, color: T.danger, count: signals.filter(s => s.signal_type === "injury" || s.injury_designation).length },
    { key: "lineup"   as const, label: "Lineup Movement", icon: <Users size={11} />, color: T.cyan, count: signals.filter(s => s.signal_type === "rotation" || s.lineup_status).length },
    { key: "trends"   as const, label: "Team Trends", icon: <BarChart2 size={11} />, color: T.green, count: signals.filter(s => s.signal_type === "trend" || s.signal_type === "matchup_edge").length },
  ];

  return (
    <div style={{
      width: 240, flexShrink: 0,
      background: T.surface1,
      borderLeft: `1px solid rgba(255,255,255,0.06)`,
      display: "flex", flexDirection: "column",
      overflowY: "auto",
    }}>
      {panels.map(panel => (
        <div key={panel.key} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          {/* Panel header — clickable to toggle */}
          <div
            onClick={() => setOpenPanel(p => p === panel.key ? "injuries" : panel.key)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 14px", cursor: "pointer",
              background: openPanel === panel.key ? "rgba(255,255,255,0.03)" : "transparent",
              transition: "background 0.1s",
            }}
          >
            <span style={{ color: panel.color, display: "flex" }}>{panel.icon}</span>
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
              color: openPanel === panel.key ? T.text : T.textMuted, flex: 1,
            }}>{panel.label}</span>
            {panel.count > 0 && (
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 10, fontWeight: 700, color: panel.color,
                background: `${panel.color}18`, padding: "1px 6px", borderRadius: 2,
              }}>{panel.count}</span>
            )}
            <ChevronRight size={10} style={{
              color: T.textFaint,
              transform: openPanel === panel.key ? "rotate(90deg)" : "none",
              transition: "transform 0.15s",
            }} />
          </div>

          {/* Panel content */}
          {openPanel === panel.key && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              {panel.key === "injuries" && <InjuryPanel signals={signals} />}
              {panel.key === "lineup"   && <LineupPanel signals={signals} />}
              {panel.key === "trends"   && <TrendsPanel signals={signals} />}
            </div>
          )}
        </div>
      ))}

      {/* Pro upgrade nudge at bottom */}
      <div style={{ marginTop: "auto", padding: "14px 12px" }}>
        <div style={{
          background: "rgba(202,168,90,0.05)", border: "1px solid rgba(202,168,90,0.2)",
          borderRadius: 4, padding: "12px 10px",
        }}>
          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.gold, marginBottom: 5 }}>
            ⚡ Pro Only
          </div>
          <div style={{ fontSize: 11, color: T.textFaint, lineHeight: 1.5, marginBottom: 8 }}>
            Real-time alerts, full signal archive & source confidence scores.
          </div>
          <a href="/#/pro" style={{
            display: "block", textAlign: "center",
            background: T.gold, color: T.bg,
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
            padding: "7px 0", borderRadius: 3, textDecoration: "none",
          }}>Unlock Pro — $19/mo</a>
        </div>
      </div>
    </div>
  );
}

// ─── Pro Gate Blur Band ───────────────────────────────────────────────────────

function ProGateBand() {
  return (
    <div style={{
      position: "relative", flexShrink: 0,
      background: "linear-gradient(to bottom, transparent, rgba(10,11,13,0.97) 40%)",
      padding: "40px 20px 20px",
      marginTop: -40,
      zIndex: 10,
    }}>
      <div style={{
        border: `1px solid rgba(202,168,90,0.28)`, borderRadius: 6,
        background: "rgba(10,11,13,0.92)", padding: "18px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        backdropFilter: "blur(4px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: "50%",
            background: "rgba(202,168,90,0.12)", border: "1px solid rgba(202,168,90,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Lock size={16} style={{ color: T.gold }} />
          </div>
          <div>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 2 }}>
              90 signals locked
            </div>
            <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: T.textFaint, letterSpacing: "0.06em" }}>
              Pro members see the full intelligence feed — injury confirmations, lineup leaks, line movement alerts
            </div>
          </div>
        </div>
        <a href="/#/pro" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: T.gold, color: T.bg,
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
          padding: "10px 18px", borderRadius: 4, textDecoration: "none",
          whiteSpace: "nowrap", flexShrink: 0,
        }}>
          <Zap size={12} />
          Unlock Pro
        </a>
      </div>
    </div>
  );
}

// ─── Signal Row (free tier visible) ──────────────────────────────────────────

function SignalRow({ sig, idx, isSelected, onClick }: {
  sig: LiveSignal; idx: number; isSelected: boolean; onClick: () => void;
}) {
  const typeColor: Record<string, string> = {
    injury: T.danger, line_move: T.green, matchup_edge: T.gold,
    prop: "#D98A42", rotation: T.cyan, news: T.textMuted, trend: T.cyan, lineup: T.cyan,
  };
  const tc = typeColor[sig.signal_type] ?? T.textFaint;
  const conf = sig.confidence_score ?? 70;
  const verdict = sig.verdict ?? "unverified";

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div
      className="sig-row"
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "28px 100px 1fr 110px 76px 72px 64px",
        padding: "10px 20px",
        borderBottom: `1px solid rgba(255,255,255,0.04)`,
        background: isSelected ? "rgba(202,168,90,0.055)" : "transparent",
        cursor: "pointer", alignItems: "center",
        borderLeft: `3px solid ${isSelected ? T.gold : tc + "55"}`,
        transition: "background 0.1s, border-left-color 0.1s",
        minHeight: 52,
      }}
    >
      {/* Index */}
      <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textFaint, fontVariantNumeric: "tabular-nums" }}>
        {idx + 1}
      </div>

      {/* Type chip */}
      <div>
        <TypeChip type={sig.signal_type as any} />
      </div>

      {/* Headline + sub */}
      <div style={{ paddingRight: 14 }}>
        <div className="sig-headline" style={{ fontSize: 13, color: T.text, fontWeight: 500, lineHeight: 1.35, marginBottom: 3 }}>
          {sig.headline ?? sig.title}
        </div>
        <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textFaint, lineHeight: 1.4 }}>
          {(sig.action_takeaway ?? sig.action_note ?? sig.summary ?? "").slice(0, 70)}{(sig.action_takeaway ?? sig.action_note ?? sig.summary ?? "").length > 70 ? "…" : ""}
        </div>
      </div>

      {/* Player / team */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {sig.team && <TeamLogoImg abbr={sig.team} size={24} />}
        <div>
          {sig.player_name && (
            <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, lineHeight: 1.3 }}>
              {sig.player_name.split(" ").pop()}
            </div>
          )}
          {sig.team && (
            <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.06em" }}>
              {sig.team}
            </div>
          )}
        </div>
      </div>

      {/* Verdict */}
      <VerdictBadge verdict={verdict as any} />

      {/* Confidence */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: conf >= 80 ? T.gold : T.textMuted, fontVariantNumeric: "tabular-nums", marginBottom: 2 }}>
          {conf}%
        </div>
        <ConfidenceBar value={conf} width={44} height={3} />
      </div>

      {/* Time */}
      <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint }}>
        {timeAgo(sig.created_at)}
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({ sig, onClose }: { sig: LiveSignal; onClose: () => void }) {
  const team = sig.team ?? "NBA";
  const teamColors = getTeamColors(team);
  const conf = sig.confidence_score ?? 70;
  const verdict = sig.verdict ?? "unverified";

  return (
    <div style={{
      width: 340, background: T.surface1, borderLeft: `1px solid ${T.goldDim}`,
      flexShrink: 0, display: "flex", flexDirection: "column", overflowY: "auto",
      position: "relative",
    }}>
      {/* Close */}
      <button onClick={onClose} style={{
        position: "absolute", top: 12, right: 12, zIndex: 10,
        background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%",
        color: T.textMuted, cursor: "pointer", width: 26, height: 26,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <X size={12} />
      </button>

      {/* Hero band */}
      <div style={{
        position: "relative", overflow: "hidden", minHeight: 90,
        background: `linear-gradient(140deg, ${teamColors.primary}DD 0%, ${teamColors.primary}55 60%, transparent 100%)`,
        padding: "18px 16px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${T.gold}, ${T.gold}33)` }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative", zIndex: 2 }}>
          <TeamLogoImg abbr={team} size={42} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, lineHeight: 1.3, marginBottom: 5 }}>
              {sig.player_name ? sig.player_name : team}
            </div>
            <VerdictBadge verdict={verdict as any} />
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", background: T.surface2, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        {[
          { label: "Verdict",    value: verdict.toUpperCase().slice(0, 9) },
          { label: "Confidence", value: `${conf}%`, color: conf >= 80 ? T.gold : T.text },
          { label: "Sources",    value: String(sig.source_count ?? sig.sources?.length ?? "—") },
        ].map((s, i) => (
          <div key={s.label} style={{ padding: "9px 0", textAlign: "center", borderRight: i < 2 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: s.color ?? T.text, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
            <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: "8px 16px 0" }}><ConfidenceBar value={conf} width="100%" height={4} /></div>

      {/* Body */}
      <div style={{ padding: "14px 16px", flex: 1 }}>
        <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 14, fontWeight: 700, color: T.text, lineHeight: 1.4, marginBottom: 10 }}>
          {sig.headline ?? sig.title}
        </div>

        {(sig.body ?? sig.summary) && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.textFaint, marginBottom: 5 }}>Detail</div>
            <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.65 }}>{sig.body ?? sig.summary}</div>
          </div>
        )}

        {sig.why_it_matters && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.textFaint, marginBottom: 5 }}>Why It Matters</div>
            <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.65 }}>{sig.why_it_matters}</div>
          </div>
        )}

        {(sig.action_takeaway ?? sig.action_note) && (
          <div style={{ background: "rgba(202,168,90,0.07)", border: "1px solid rgba(202,168,90,0.22)", borderRadius: 4, padding: "11px 13px" }}>
            <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.gold, marginBottom: 5 }}>
              ⚡ Action Takeaway
            </div>
            <div style={{ fontSize: 13, color: T.text, lineHeight: 1.65, fontWeight: 500 }}>{sig.action_takeaway ?? sig.action_note}</div>
          </div>
        )}

        {sig.injury_designation && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(217,75,75,0.08)", border: "1px solid rgba(217,75,75,0.25)", borderRadius: 3 }}>
            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.danger }}>
              Status: {sig.injury_designation}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const FREE_SIGNAL_LIMIT = 8;

export default function NBABoard() {
  const [signals, setSignals]         = useState<LiveSignal[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [activeTab, setActiveTab]     = useState<TabKey>("TODAY");
  const [teamFilter, setTeamFilter]   = useState<string>("");
  const [selected, setSelected]       = useState<LiveSignal | null>(null);
  const [isProUser]                   = useState(false); // TODO: wire to auth

  // ── Fetch live signals ─────────────────────────────────────────────────────
  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch("/api/signals?league=NBA");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: LiveSignal[] = await res.json();
      setSignals(data);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 60_000); // refresh every minute
    return () => clearInterval(interval);
  }, [fetchSignals]);

  // ── Filter pipeline ────────────────────────────────────────────────────────
  let filtered = filterByTab(signals, activeTab);
  if (teamFilter) {
    filtered = filtered.filter(s => s.team === teamFilter || s.matchup?.includes(teamFilter));
  }

  const visibleSignals = isProUser ? filtered : filtered.slice(0, FREE_SIGNAL_LIMIT);
  const lockedCount    = filtered.length - visibleSignals.length;
  const featured       = signals.find(s => (s.confidence_score ?? 0) >= 80) ?? signals[0];

  // ── Stats ──────────────────────────────────────────────────────────────────
  const confirmedCount  = signals.filter(s => s.verdict === "confirmed").length;
  const highConfCount   = signals.filter(s => (s.confidence_score ?? 0) >= 80).length;

  return (
    <V2Shell boardsMode>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .sig-row:hover { background: rgba(202,168,90,0.04) !important; }
        .sig-row:hover .sig-headline { color: #F3EFE6 !important; }
        .tab-btn:hover { background: rgba(202,168,90,0.05) !important; }
        .team-pill:hover { background: rgba(202,168,90,0.08) !important; border-color: rgba(202,168,90,0.35) !important; }
      `}</style>

      <div style={{ display: "flex", height: "100%", minHeight: "calc(100vh - 52px)" }}>

        {/* ─── Left sidebar ─────────────────────────────────────────────────── */}
        <aside style={{
          width: 180, background: T.surface1, borderRight: `1px solid ${T.goldDim}`,
          flexShrink: 0, padding: "14px 8px", overflowY: "auto",
        }}>
          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.textFaint, padding: "0 8px", marginBottom: 10 }}>
            NBA Board
          </div>

          {/* Sub-nav items */}
          {[
            { label: "Signal Stream", icon: <Zap size={11} />, active: true },
            { label: "Tonight's Slate", icon: <Activity size={11} />, active: false },
            { label: "Injury Volatility", icon: <AlertCircle size={11} />, active: false },
            { label: "Line Movement", icon: <ArrowUpDown size={11} />, active: false },
            { label: "Matchup Edges", icon: <BarChart2 size={11} />, active: false },
          ].map(({ label, icon, active }) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 7, padding: "7px 9px", marginBottom: 1,
              borderRadius: 3, borderLeft: `2px solid ${active ? T.gold : "transparent"}`,
              background: active ? "rgba(202,168,90,0.07)" : "transparent",
              color: active ? T.gold : T.textMuted, cursor: "pointer",
            }}>
              <span style={{ opacity: active ? 1 : 0.4, display: "flex" }}>{icon}</span>
              <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>
            </div>
          ))}

          <div style={{ margin: "14px 0 10px", borderTop: `1px solid ${T.goldDim}` }} />

          {/* Team filter pills */}
          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.textFaint, padding: "0 8px", marginBottom: 8 }}>
            Teams
          </div>
          {teamFilter && (
            <div
              onClick={() => setTeamFilter("")}
              style={{
                display: "flex", alignItems: "center", gap: 5, padding: "5px 9px", marginBottom: 6,
                borderRadius: 3, background: "rgba(202,168,90,0.08)", border: "1px solid rgba(202,168,90,0.3)",
                cursor: "pointer",
              }}
            >
              <X size={9} style={{ color: T.textFaint }} />
              <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, color: T.textFaint, letterSpacing: "0.08em", textTransform: "uppercase" }}>Clear filter</span>
            </div>
          )}
          {NBA_TEAMS.map(tm => {
            const isActive = teamFilter === tm;
            const hasSignals = signals.some(s => s.team === tm);
            return (
              <div
                key={tm}
                className="team-pill"
                onClick={() => setTeamFilter(isActive ? "" : tm)}
                style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "5px 9px", borderRadius: 3,
                  marginBottom: 1, cursor: "pointer",
                  background: isActive ? "rgba(202,168,90,0.1)" : "transparent",
                  border: `1px solid ${isActive ? "rgba(202,168,90,0.45)" : "transparent"}`,
                  transition: "all 0.1s",
                }}
              >
                <TeamLogoImg abbr={tm} size={20} />
                <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: isActive ? T.gold : T.textMuted, flex: 1 }}>{tm}</span>
                {hasSignals && <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, display: "inline-block" }} />}
              </div>
            );
          })}
        </aside>

        {/* ─── Main canvas ──────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

          {/* Board header */}
          <div style={{
            padding: "10px 20px", borderBottom: `1px solid rgba(255,255,255,0.06)`,
            display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
            background: T.surface1,
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 17, fontWeight: 700, color: T.text }}>
                  NBA Intelligence Board
                </span>
                <SportBadge status="LIVE" />
              </div>
              <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textFaint, letterSpacing: "0.06em" }}>
                {loading ? "Loading signals…" : error ? `Live signals unavailable — ${error}` : `${signals.length} signals · Updated continuously`}
              </div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 7 }}>
              {[
                { label: "Total",     value: signals.length,  color: T.text },
                { label: "Confirmed", value: confirmedCount,  color: T.green },
                { label: "High Conf", value: highConfCount,   color: T.gold },
              ].map(stat => (
                <div key={stat.label} style={{
                  textAlign: "center", padding: "5px 12px",
                  background: T.surface2, border: "1px solid rgba(255,255,255,0.06)", borderRadius: 3,
                }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: stat.color, fontVariantNumeric: "tabular-nums" }}>
                    {loading ? "—" : stat.value}
                  </div>
                  <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, color: T.textFaint, letterSpacing: "0.12em", textTransform: "uppercase" }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tonight's Games bar */}
          <TonightGamesBar teamFilter={teamFilter} onSelectTeam={setTeamFilter} />

          {/* Featured signal */}
          {featured && !loading && (
            <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>
              <FeaturedEdgeCard signal={featured as any} sport="NBA" />
            </div>
          )}

          {/* ── Sub-nav tabs ── */}
          <div style={{
            display: "flex", gap: 2, padding: "10px 20px 0",
            borderBottom: `1px solid rgba(255,255,255,0.06)`,
            background: T.surface1, flexShrink: 0,
          }}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.key;
              const count = filterByTab(signals, tab.key).length;
              return (
                <button
                  key={tab.key}
                  className="tab-btn"
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "8px 14px", borderRadius: "3px 3px 0 0",
                    border: "none", background: "transparent",
                    borderBottom: `2px solid ${isActive ? T.gold : "transparent"}`,
                    color: isActive ? T.gold : T.textMuted,
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                    cursor: "pointer", transition: "all 0.1s",
                    marginBottom: -1,
                  }}
                >
                  <span style={{ opacity: isActive ? 1 : 0.5 }}>{tab.icon}</span>
                  {tab.label}
                  {count > 0 && (
                    <span style={{
                      fontSize: 10, color: isActive ? T.gold : T.textFaint,
                      background: isActive ? "rgba(202,168,90,0.15)" : "rgba(255,255,255,0.06)",
                      padding: "1px 5px", borderRadius: 2,
                      fontVariantNumeric: "tabular-nums",
                    }}>{count}</span>
                  )}
                </button>
              );
            })}

            {teamFilter && (
              <div style={{
                marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, paddingBottom: 6,
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 11, fontWeight: 700, color: T.gold, letterSpacing: "0.1em",
              }}>
                <Filter size={10} />
                {teamFilter}
                <button onClick={() => setTeamFilter("")} style={{ background: "none", border: "none", color: T.textFaint, cursor: "pointer", padding: 0, display: "flex" }}>
                  <X size={10} />
                </button>
              </div>
            )}
          </div>

          {/* ── Signal table ── */}
          <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
            {/* Column header */}
            <div style={{
              display: "grid", gridTemplateColumns: "28px 100px 1fr 110px 76px 72px 64px",
              padding: "5px 20px",
              background: T.surface2, borderBottom: "1px solid rgba(255,255,255,0.06)",
              position: "sticky", top: 0, zIndex: 5,
            }}>
              {["#", "Type", "Signal", "Player", "Verdict", "Conf", "Time"].map(h => (
                <div key={h} style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.textFaint,
                }}>{h}</div>
              ))}
            </div>

            {/* Loading state */}
            {loading && (
              <div style={{ padding: "40px 20px", textAlign: "center" }}>
                <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 13, color: T.textFaint, letterSpacing: "0.12em" }}>
                  Loading live signals…
                </div>
              </div>
            )}

            {/* Error state */}
            {!loading && error && (
              <div style={{ padding: "20px", margin: "16px 20px", background: "rgba(217,75,75,0.06)", border: "1px solid rgba(217,75,75,0.2)", borderRadius: 4 }}>
                <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: T.danger }}>
                  <strong>Signal feed unavailable</strong> — {error}
                </div>
                <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textFaint, marginTop: 4 }}>
                  pipeline.db may be empty. Check that the ingestion cycle has run at least once.
                </div>
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && filtered.length === 0 && (
              <div style={{ padding: "40px 20px", textAlign: "center" }}>
                <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 13, color: T.textFaint, letterSpacing: "0.1em" }}>
                  {teamFilter ? `No signals for ${teamFilter}` : `No ${activeTab.toLowerCase()} signals in current cycle`}
                </div>
              </div>
            )}

            {/* Signal rows */}
            {visibleSignals.map((sig, idx) => (
              <SignalRow
                key={sig.id}
                sig={sig}
                idx={idx}
                isSelected={selected?.id === sig.id}
                onClick={() => setSelected(selected?.id === sig.id ? null : sig)}
              />
            ))}

            {/* Pro gate — blur band + CTA */}
            {!isProUser && lockedCount > 0 && (
              <div style={{ position: "relative" }}>
                {/* Blurred preview rows */}
                <div style={{ filter: "blur(3px)", pointerEvents: "none", userSelect: "none" }}>
                  {filtered.slice(FREE_SIGNAL_LIMIT, FREE_SIGNAL_LIMIT + 3).map((sig, idx) => (
                    <SignalRow
                      key={sig.id + "_blur"}
                      sig={sig}
                      idx={FREE_SIGNAL_LIMIT + idx}
                      isSelected={false}
                      onClick={() => {}}
                    />
                  ))}
                </div>
                <ProGateBand />
              </div>
            )}

            {/* Footer note when all signals visible */}
            {(isProUser || lockedCount === 0) && filtered.length > 0 && (
              <div style={{ margin: "12px 20px", padding: "8px 12px", background: "rgba(202,168,90,0.03)", border: "1px solid rgba(202,168,90,0.08)", borderRadius: 3 }}>
                <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textFaint }}>
                  {filtered.length} signals displayed · Refreshes every 60s · Click any row to expand
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Right sidebar ─────────────────────────────────────────────────── */}
        <RightSidebar signals={signals} />

        {/* ─── Detail rail ───────────────────────────────────────────────────── */}
        {selected && (
          <div style={{ position: "relative", zIndex: 20 }}>
            <DetailPanel sig={selected} onClose={() => setSelected(null)} />
          </div>
        )}
      </div>
    </V2Shell>
  );
}
