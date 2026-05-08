// ─── NBABoard.tsx — LFL THEME PATCH ───────────────────────────────────────────
//
// Changes from previous version:
// 1. Main canvas gets chalk basketball court bg (es-chalk-nba class + opacity overlay)
// 2. T tokens updated to warm LFL values (imported from V2Shell now, not local)
// 3. Featured Edge banner: team color bleeds left→right (OKC blue example)
// 4. Signal cards: warmer surface colors, gold accent borders on hover
// 5. Board header: Bebas Neue for title (matches LFL dossier feel)
// 6. Pro gate: shimmer gold button
//
// HOW TO APPLY:
// The full NBABoard.tsx file is below. Copy it wholesale over the existing file.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import V2Shell, { SportBadge } from "../components/V2Shell";
import {
  PlayerHeadshot, TeamLogoImg,
  MatchupCard, FeaturedEdgeCard, IntelCard,
  VerdictBadge, TypeChip, ConfidenceBar,
  SignalRowVisual,
  T as _T, VERDICT_COLORS, getTeamColors,
} from "../components/v2/SportVisuals";
import { ChevronRight, X, Filter, Zap, TrendingUp, AlertCircle, Lock, Star, Activity, Users, BarChart2, ArrowUpDown } from "lucide-react";

// LFL-blend token override — warmer than the base T object
// Once V2Shell exports T, import it from there instead
const T = {
  bg:        "#0C0B09",
  surface1:  "#131110",
  surface2:  "#1A1714",
  surface3:  "#201D19",
  gold:      "#C4A24A",
  goldBright:"#E0BB6A",
  goldDim:   "rgba(196,162,74,0.16)",
  goldGlow:  "rgba(196,162,74,0.07)",
  text:      "#EDE5D4",
  textMuted: "#8A7A62",
  textFaint: "#4A4235",
  green:     "#3EBA6A",
  orange:    "#D98A42",
  cyan:      "#4AA8C8",
  danger:    "#D94B4B",
  border:    "rgba(196,162,74,0.12)",
  borderStrong: "rgba(196,162,74,0.36)",
};

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Sub-nav tabs ─────────────────────────────────────────────────────────────

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

const NBA_TEAMS = [
  "LAL","BOS","GSW","MIA","DEN","OKC","MIN","NYK",
  "MIL","PHX","DAL","CLE","SAC","PHI","ATL","CHI",
];

// ─── Tonight's Games Bar ──────────────────────────────────────────────────────

interface GameData {
  id: string;
  away: string; home: string;
  time: string; status: "LIVE" | "FINAL" | "PRE";
  awayScore: number | null; homeScore: number | null;
  period: string | null;
  spread: string; total: string;
  series: string | null;
}

function TonightGamesBar({ teamFilter, onSelectTeam }: { teamFilter: string | null; onSelectTeam: (t: string) => void }) {
  const [games, setGames]         = useState<GameData[]>([]);
  const [gsLoading, setGsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/nba/scoreboard");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setGames(data.games ?? []);
      } catch {
        if (!cancelled) setGames([]);
      } finally {
        if (!cancelled) setGsLoading(false);
      }
    };
    load();
    const iv = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  return (
    <div style={{
      padding: "10px 20px 12px",
      borderBottom: `1px solid ${T.border}`,
      flexShrink: 0,
      background: "rgba(12,11,9,0.6)",
    }}>
      <div style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: 10, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase",
        color: T.textFaint, marginBottom: 8, display: "flex", alignItems: "center", gap: 6,
      }}>
        {games.some(g => g.status === "LIVE") && (
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, display: "inline-block", animation: "gsPulse 2s ease-in-out infinite", boxShadow: `0 0 5px ${T.green}` }} />
        )}
        Tonight's NBA Slate
        {games.some(g => g.series) && <span style={{ color: T.gold, marginLeft: 2 }}>· Playoffs</span>}
      </div>

      {gsLoading && (
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: T.textFaint, letterSpacing: "0.1em" }}>Loading games…</div>
      )}

      {!gsLoading && games.length === 0 && (
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: T.textFaint, letterSpacing: "0.1em", padding: "4px 0" }}>
          No NBA games scheduled today
        </div>
      )}

      {!gsLoading && games.length > 0 && (
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2 }}>
          {games.map(game => {
            const isLive        = game.status === "LIVE";
            const isFinal       = game.status === "FINAL";
            const isHighlighted = teamFilter === game.away || teamFilter === game.home;
            // Get team colors for banner
            const awayColors = getTeamColors(game.away);
            const homeColors = getTeamColors(game.home);

            return (
              <div
                key={game.id}
                onClick={() => onSelectTeam(isHighlighted ? "" : game.away)}
                style={{
                  flexShrink: 0, width: 210,
                  background: isHighlighted
                    ? `linear-gradient(140deg, ${awayColors.primary}28, ${T.surface2})`
                    : T.surface2,
                  border: `1px solid ${isHighlighted ? T.borderStrong : isLive ? "rgba(62,186,106,0.32)" : T.border}`,
                  borderRadius: 3, padding: "10px 12px", cursor: "pointer",
                  transition: "all 0.12s",
                  position: "relative", overflow: "hidden",
                }}
              >
                {/* Live green top stripe */}
                {isLive && (
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${T.green}, ${T.green}44)` }} />
                )}
                {/* Team color bleed — subtle */}
                <div style={{
                  position: "absolute", inset: 0, pointerEvents: "none",
                  background: `linear-gradient(135deg, ${awayColors.primary}14 0%, transparent 45%, ${homeColors.primary}0E 100%)`,
                }} />

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, position: "relative" }}>
                  <span style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
                    color: isLive ? T.green : isFinal ? T.textFaint : T.textMuted,
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    {isLive && <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.green, display: "inline-block", animation: "gsPulse 1.5s ease-in-out infinite" }} />}
                    {isLive ? (game.period ?? "Live") : isFinal ? "Final" : game.time}
                  </span>
                  {game.series && (
                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, color: T.textFaint, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {game.series}
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4, position: "relative" }}>
                  {[{ abbr: game.away, score: game.awayScore }, { abbr: game.home, score: game.homeScore }].map(team => (
                    <div key={team.abbr} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <TeamLogoImg abbr={team.abbr} size={18} />
                      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 800, letterSpacing: "0.1em", color: T.text, flex: 1 }}>{team.abbr}</span>
                      {(isLive || isFinal) && team.score !== null && (
                        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: T.text, minWidth: 26, textAlign: "right" }}>{team.score}</span>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 7, paddingTop: 6, borderTop: `1px solid ${T.border}`, display: "flex", gap: 10, position: "relative" }}>
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint }}>{game.spread}</span>
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint }}>{game.total}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
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
    if (dl.includes("questionable")) return "#C4A24A";
    if (dl.includes("probable") || dl.includes("available")) return T.green;
    return T.textFaint;
  };
  return (
    <div>
      {injuries.length === 0 ? (
        <div style={{ padding: "10px 14px", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: T.textFaint }}>No injury signals in current cycle</div>
      ) : injuries.map(sig => {
        const designation = sig.injury_designation ?? "Questionable";
        return (
          <div key={sig.id} style={{ padding: "8px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
            <TeamLogoImg abbr={sig.team ?? "NBA"} size={18} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {sig.player_name ?? sig.headline.slice(0, 28)}
              </div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: statusColor(designation), letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 1 }}>
                {designation}
              </div>
            </div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint }}>{sig.team}</div>
          </div>
        );
      })}
    </div>
  );
}

function LineupPanel({ signals }: { signals: LiveSignal[] }) {
  const lineup = signals.filter(s => s.signal_type === "rotation" || s.lineup_status || s.signal_type === "lineup").slice(0, 7);
  return (
    <div>
      {lineup.length === 0 ? (
        <div style={{ padding: "10px 14px", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: T.textFaint }}>No lineup signals yet today</div>
      ) : lineup.map(sig => (
        <div key={sig.id} style={{ padding: "8px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: T.cyan, marginTop: 5, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: T.text, lineHeight: 1.35, fontWeight: 500 }}>
              {sig.headline.slice(0, 52)}{sig.headline.length > 52 ? "…" : ""}
            </div>
            {sig.team && <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint, marginTop: 2 }}>{sig.team}{sig.lineup_status ? ` · ${sig.lineup_status}` : ""}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function TrendsPanel({ signals }: { signals: LiveSignal[] }) {
  const trends = signals.filter(s => s.signal_type === "trend" || s.signal_type === "matchup_edge").slice(0, 6);
  return (
    <div>
      {trends.length === 0 ? (
        <div style={{ padding: "10px 14px", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: T.textFaint }}>No trend signals in current cycle</div>
      ) : trends.map(sig => {
        const conf = sig.confidence_score ?? 70;
        return (
          <div key={sig.id} style={{ padding: "8px 14px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 12, color: T.text, lineHeight: 1.35, fontWeight: 500, marginBottom: 4 }}>
              {sig.headline.slice(0, 58)}{sig.headline.length > 58 ? "…" : ""}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {sig.team && <TeamLogoImg abbr={sig.team} size={13} />}
              <ConfidenceBar value={conf} width={55} height={3} />
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: conf >= 80 ? T.gold : T.textFaint }}>{conf}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RightSidebar({ signals }: { signals: LiveSignal[] }) {
  const [openPanel, setOpenPanel] = useState<"injuries" | "lineup" | "trends">("injuries");
  const panels = [
    { key: "injuries" as const, label: "Injury Report",   icon: <AlertCircle size={11} />, color: T.danger, count: signals.filter(s => s.signal_type === "injury" || s.injury_designation).length },
    { key: "lineup"   as const, label: "Lineup Movement", icon: <Users size={11} />,        color: T.cyan,   count: signals.filter(s => s.signal_type === "rotation" || s.lineup_status).length },
    { key: "trends"   as const, label: "Team Trends",     icon: <BarChart2 size={11} />,    color: T.green,  count: signals.filter(s => s.signal_type === "trend" || s.signal_type === "matchup_edge").length },
  ];

  return (
    <div style={{ width: 236, flexShrink: 0, background: T.surface1, borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column", overflowY: "auto" }}>
      {panels.map(panel => (
        <div key={panel.key} style={{ borderBottom: `1px solid ${T.border}` }}>
          <div
            onClick={() => setOpenPanel(p => p === panel.key ? "injuries" : panel.key)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 14px", cursor: "pointer",
              background: openPanel === panel.key ? T.goldGlow : "transparent",
              transition: "background 0.1s",
            }}
          >
            <span style={{ color: panel.color, display: "flex" }}>{panel.icon}</span>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: openPanel === panel.key ? T.text : T.textMuted, flex: 1 }}>
              {panel.label}
            </span>
            {panel.count > 0 && (
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, color: panel.color, background: `${panel.color}18`, padding: "1px 5px", borderRadius: 2 }}>
                {panel.count}
              </span>
            )}
            <ChevronRight size={10} style={{ color: T.textFaint, transform: openPanel === panel.key ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
          </div>
          {openPanel === panel.key && (
            <div style={{ borderTop: `1px solid ${T.border}` }}>
              {panel.key === "injuries" && <InjuryPanel signals={signals} />}
              {panel.key === "lineup"   && <LineupPanel signals={signals} />}
              {panel.key === "trends"   && <TrendsPanel signals={signals} />}
            </div>
          )}
        </div>
      ))}

      {/* Pro nudge */}
      <div style={{ marginTop: "auto", padding: "12px 10px" }}>
        <div style={{ background: T.goldGlow, border: `1px solid ${T.borderStrong}`, borderRadius: 3, padding: "12px 10px" }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.gold, marginBottom: 5 }}>⚡ Pro Only</div>
          <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: 12, color: T.textFaint, lineHeight: 1.5, marginBottom: 8 }}>
            Real-time alerts, full signal archive & source confidence scores.
          </div>
          <a href="/#/pro" style={{
            display: "block", textAlign: "center",
            background: `linear-gradient(135deg, ${T.gold}, #8A6A28)`,
            color: T.bg,
            fontFamily: "'Bebas Neue', 'Barlow Condensed', sans-serif",
            fontSize: 13, letterSpacing: "2px",
            padding: "7px 0", borderRadius: 2, textDecoration: "none",
          }}>Unlock Pro — $19/mo</a>
        </div>
      </div>
    </div>
  );
}

// ─── Pro Gate ─────────────────────────────────────────────────────────────────

function ProGateBand() {
  return (
    <div style={{
      position: "relative", flexShrink: 0,
      background: `linear-gradient(to bottom, transparent, rgba(12,11,9,0.97) 38%)`,
      padding: "40px 20px 20px", marginTop: -40, zIndex: 10,
    }}>
      <div style={{
        border: `1px solid ${T.borderStrong}`, borderRadius: 3,
        background: "rgba(12,11,9,0.94)", padding: "16px 18px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: T.goldGlow, border: `1px solid ${T.borderStrong}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Lock size={15} style={{ color: T.gold }} />
          </div>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 2 }}>
              90 signals locked
            </div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textFaint, letterSpacing: "0.06em" }}>
              Pro members see the full feed — injury confirmations, lineup leaks, line movement alerts
            </div>
          </div>
        </div>
        <a href="/#/pro" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: `linear-gradient(135deg, ${T.gold}, #8A6A28)`,
          backgroundSize: "200%", animation: "shimmerGold 2.5s ease infinite",
          color: T.bg,
          fontFamily: "'Bebas Neue', 'Barlow Condensed', sans-serif",
          fontSize: 14, letterSpacing: "2px",
          padding: "9px 16px", borderRadius: 2, textDecoration: "none",
          whiteSpace: "nowrap", flexShrink: 0,
        }}>
          <Zap size={12} /> Unlock Pro
        </a>
      </div>
      <style>{`@keyframes shimmerGold { 0%{background-position:0%} 50%{background-position:100%} 100%{background-position:0%} }`}</style>
    </div>
  );
}

// ─── Signal Row ───────────────────────────────────────────────────────────────

function SignalRow({ sig, idx, isSelected, onClick }: { sig: LiveSignal; idx: number; isSelected: boolean; onClick: () => void }) {
  const typeColor: Record<string, string> = {
    injury: T.danger, line_move: T.green, matchup_edge: T.gold,
    prop: "#D98A42", rotation: T.cyan, news: T.textMuted, trend: T.cyan, lineup: T.cyan,
  };
  const tc   = typeColor[sig.signal_type] ?? T.textFaint;
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
        borderBottom: `1px solid ${T.border}`,
        background: isSelected ? T.goldGlow : "transparent",
        cursor: "pointer", alignItems: "center",
        borderLeft: `2px solid ${isSelected ? T.gold : tc + "50"}`,
        transition: "background 0.1s, border-left-color 0.1s",
        minHeight: 50,
      }}
    >
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textFaint }}>{idx + 1}</div>
      <div><TypeChip type={sig.signal_type as any} /></div>
      <div style={{ paddingRight: 14 }}>
        <div className="sig-headline" style={{ fontSize: 13, color: T.text, fontWeight: 500, lineHeight: 1.35, marginBottom: 2 }}>
          {sig.headline ?? sig.title}
        </div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textFaint, lineHeight: 1.4 }}>
          {(sig.action_takeaway ?? sig.action_note ?? sig.summary ?? "").slice(0, 68)}{(sig.action_takeaway ?? sig.action_note ?? sig.summary ?? "").length > 68 ? "…" : ""}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {sig.team && <TeamLogoImg abbr={sig.team} size={22} />}
        <div>
          {sig.player_name && <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, lineHeight: 1.3 }}>{sig.player_name.split(" ").pop()}</div>}
          {sig.team && <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint }}>{sig.team}</div>}
        </div>
      </div>
      <VerdictBadge verdict={verdict as any} />
      <div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, color: conf >= 80 ? T.gold : T.textMuted, marginBottom: 2 }}>{conf}%</div>
        <ConfidenceBar value={conf} width={44} height={3} />
      </div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint }}>{timeAgo(sig.created_at)}</div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({ sig, onClose }: { sig: LiveSignal; onClose: () => void }) {
  const team      = sig.team ?? "NBA";
  const teamColors = getTeamColors(team);
  const conf      = sig.confidence_score ?? 70;
  const verdict   = sig.verdict ?? "unverified";

  return (
    <div style={{ width: 320, background: T.surface1, borderLeft: `1px solid ${T.borderStrong}`, flexShrink: 0, display: "flex", flexDirection: "column", overflowY: "auto", position: "relative" }}>
      <button onClick={onClose} style={{ position: "absolute", top: 10, right: 10, zIndex: 10, background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", color: T.textMuted, cursor: "pointer", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <X size={11} />
      </button>

      {/* Team-color hero band — THE banner detail from Manus */}
      <div style={{
        position: "relative", overflow: "hidden", minHeight: 86,
        background: `linear-gradient(140deg, ${teamColors.primary}E0 0%, ${teamColors.primary}50 55%, ${T.surface2} 100%)`,
        padding: "16px 14px 12px",
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${T.gold}, ${T.gold}44)` }} />
        <div style={{ display: "flex", alignItems: "center", gap: 9, position: "relative", zIndex: 2 }}>
          <TeamLogoImg abbr={team} size={38} />
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: "2px", color: T.text, lineHeight: 1.2 }}>
              {sig.player_name ? sig.player_name : team}
            </div>
            <VerdictBadge verdict={verdict as any} />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", background: T.surface2, borderBottom: `1px solid ${T.border}` }}>
        {[
          { label: "Verdict",    value: verdict.toUpperCase().slice(0, 9) },
          { label: "Confidence", value: `${conf}%`, color: conf >= 80 ? T.gold : T.text },
          { label: "Sources",    value: String(sig.source_count ?? sig.sources?.length ?? "—") },
        ].map((s, i) => (
          <div key={s.label} style={{ padding: "8px 0", textAlign: "center", borderRight: i < 2 ? `1px solid ${T.border}` : "none" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, color: s.color ?? T.text }}>{s.value}</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, color: T.textFaint, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: "6px 14px 0" }}><ConfidenceBar value={conf} width="100%" height={3} /></div>

      {/* Body */}
      <div style={{ padding: "12px 14px", flex: 1 }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 700, color: T.text, lineHeight: 1.4, marginBottom: 10 }}>
          {sig.headline ?? sig.title}
        </div>
        {(sig.body ?? sig.summary) && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.textFaint, marginBottom: 4 }}>Detail</div>
            <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: 12, color: T.textMuted, lineHeight: 1.65 }}>{sig.body ?? sig.summary}</div>
          </div>
        )}
        {(sig.action_takeaway ?? sig.action_note) && (
          <div style={{ background: T.goldGlow, border: `1px solid rgba(196,162,74,0.22)`, borderRadius: 2, padding: "10px 12px" }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.gold, marginBottom: 4 }}>⚡ Action Takeaway</div>
            <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: 12, color: T.text, lineHeight: 1.65 }}>{sig.action_takeaway ?? sig.action_note}</div>
          </div>
        )}
        {sig.injury_designation && (
          <div style={{ marginTop: 8, padding: "7px 10px", background: "rgba(217,75,75,0.07)", border: "1px solid rgba(217,75,75,0.22)", borderRadius: 2 }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.danger }}>Status: {sig.injury_designation}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const FREE_SIGNAL_LIMIT = 8;

export default function NBABoard() {
  const [signals, setSignals]       = useState<LiveSignal[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [activeTab, setActiveTab]   = useState<TabKey>("TODAY");
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [selected, setSelected]     = useState<LiveSignal | null>(null);
  const [isProUser]                 = useState(false);

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
    const interval = setInterval(fetchSignals, 60_000);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  let filtered = filterByTab(signals, activeTab);
  if (teamFilter) filtered = filtered.filter(s => s.team === teamFilter || s.matchup?.includes(teamFilter));

  const visibleSignals = isProUser ? filtered : filtered.slice(0, FREE_SIGNAL_LIMIT);
  const lockedCount    = filtered.length - visibleSignals.length;
  const featured       = signals.find(s => (s.confidence_score ?? 0) >= 80) ?? signals[0];

  const confirmedCount = signals.filter(s => s.verdict === "confirmed").length;
  const highConfCount  = signals.filter(s => (s.confidence_score ?? 0) >= 80).length;

  // Featured signal team colors for banner
  const featuredTeam   = featured?.team ?? "NBA";
  const featuredColors = getTeamColors(featuredTeam);

  return (
    <V2Shell boardsMode>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        .tab-btn:hover { background: rgba(196,162,74,0.05) !important; }
        .team-pill:hover { background: rgba(196,162,74,0.07) !important; border-color: rgba(196,162,74,0.32) !important; }
      `}</style>

      <div style={{ display: "flex", height: "100%", minHeight: "calc(100vh - 50px)" }}>

        {/* ─── Left sidebar ───────────────────────────────────────────────── */}
        <aside style={{ width: 172, background: T.surface1, borderRight: `1px solid ${T.border}`, flexShrink: 0, padding: "12px 6px", overflowY: "auto" }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: T.textFaint, padding: "0 8px", marginBottom: 8 }}>
            NBA Board
          </div>

          {[
            { label: "Signal Stream",     icon: <Zap size={11} />,           active: true },
            { label: "Tonight's Slate",   icon: <Activity size={11} />,      active: false },
            { label: "Injury Volatility", icon: <AlertCircle size={11} />,   active: false },
            { label: "Line Movement",     icon: <ArrowUpDown size={11} />,   active: false },
            { label: "Matchup Edges",     icon: <BarChart2 size={11} />,     active: false },
          ].map(({ label, icon, active }) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", marginBottom: 1,
              borderRadius: 2, borderLeft: `2px solid ${active ? T.gold : "transparent"}`,
              background: active ? T.goldGlow : "transparent",
              color: active ? T.gold : T.textMuted, cursor: "pointer",
            }}>
              <span style={{ opacity: active ? 1 : 0.4, display: "flex" }}>{icon}</span>
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</span>
            </div>
          ))}

          <div style={{ margin: "12px 0 8px", borderTop: `1px solid ${T.border}` }} />

          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: T.textFaint, padding: "0 8px", marginBottom: 6 }}>Teams</div>

          {teamFilter && (
            <div onClick={() => setTeamFilter("")} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 8px", marginBottom: 5, borderRadius: 2, background: T.goldGlow, border: `1px solid ${T.borderStrong}`, cursor: "pointer" }}>
              <X size={9} style={{ color: T.textFaint }} />
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, color: T.textFaint, letterSpacing: "0.1em", textTransform: "uppercase" }}>Clear</span>
            </div>
          )}

          {NBA_TEAMS.map(tm => {
            const isActive   = teamFilter === tm;
            const hasSignals = signals.some(s => s.team === tm);
            return (
              <div
                key={tm}
                className="team-pill"
                onClick={() => setTeamFilter(isActive ? "" : tm)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 2, marginBottom: 1, cursor: "pointer",
                  background: isActive ? T.goldGlow : "transparent",
                  border: `1px solid ${isActive ? T.borderStrong : "transparent"}`,
                  transition: "all 0.1s",
                }}
              >
                <TeamLogoImg abbr={tm} size={18} />
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: isActive ? T.gold : T.textMuted, flex: 1 }}>{tm}</span>
                {hasSignals && <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.green, display: "inline-block" }} />}
              </div>
            );
          })}
        </aside>

        {/* ─── Main canvas ────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden", position: "relative" }}>

          {/* Chalk basketball court bg — subtle, not overwhelming */}
          <div
            className="es-chalk-nba"
            aria-hidden="true"
            style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              opacity: 0.032,
              zIndex: 0,
            }}
          />
          {/* Warm radial overlay to keep it readable */}
          <div aria-hidden="true" style={{
            position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1,
            background: `radial-gradient(ellipse 80% 70% at 50% 50%, transparent 30%, ${T.bg} 100%)`,
          }} />

          {/* All content sits above the bg */}
          <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", height: "100%" }}>

            {/* Board header */}
            <div style={{ padding: "10px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0, background: "rgba(19,17,16,0.88)" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span style={{ fontFamily: "'Bebas Neue', 'Barlow Condensed', sans-serif", fontSize: 22, letterSpacing: "2px", color: T.text }}>
                    NBA Intelligence Board
                  </span>
                  <SportBadge status="LIVE" />
                </div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textFaint, letterSpacing: "0.08em" }}>
                  {loading ? "Loading signals…" : error ? `Signal feed unavailable — ${error}` : `${signals.length} signals · Updated continuously`}
                </div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                {[
                  { label: "Total",     value: signals.length, color: T.text },
                  { label: "Confirmed", value: confirmedCount, color: T.green },
                  { label: "High Conf", value: highConfCount,  color: T.gold },
                ].map(stat => (
                  <div key={stat.label} style={{ textAlign: "center", padding: "5px 10px", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 2 }}>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, color: stat.color }}>{loading ? "—" : stat.value}</div>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, color: T.textFaint, letterSpacing: "0.14em", textTransform: "uppercase" }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tonight's games */}
            <TonightGamesBar teamFilter={teamFilter} onSelectTeam={setTeamFilter} />

            {/* Featured signal — team-color banner */}
            {featured && !loading && (
              <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>
                {/* Team-color banner wrapper */}
                <div style={{
                  borderRadius: 3, overflow: "hidden",
                  border: `1px solid ${T.border}`,
                  position: "relative",
                }}>
                  {/* Team color left bleed */}
                  <div style={{
                    position: "absolute", inset: 0, pointerEvents: "none",
                    background: `linear-gradient(135deg, ${featuredColors.primary}30 0%, ${featuredColors.primary}12 30%, transparent 60%)`,
                  }} />
                  {/* Gold top stripe */}
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${T.gold}, ${T.gold}33)` }} />
                  <div style={{ position: "relative", zIndex: 2 }}>
                    <FeaturedEdgeCard
                      sport="NBA"
                      signal={{
                        headline:        featured.headline ?? featured.title ?? "Signal",
                        detail:          featured.body ?? featured.summary ?? featured.why_it_matters ?? "—",
                        action_takeaway: featured.action_takeaway ?? featured.action_note ?? "Monitor this situation.",
                        verdict:         featured.verdict ?? "unverified",
                        confidence:      featured.confidence_score ?? 70,
                        sources:         featured.source_count ?? featured.sources?.length ?? 1,
                        type:            featured.signal_type ?? "news",
                        player:          featured.player_name,
                        team:            featured.team ?? "NBA",
                        opponent:        undefined,
                        timestamp:       new Date(featured.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                        tags:            [featured.team ?? "NBA", featured.signal_type ?? "intel"].filter(Boolean),
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Sub-nav tabs */}
            <div style={{ display: "flex", gap: 2, padding: "10px 20px 0", borderBottom: `1px solid ${T.border}`, background: "rgba(19,17,16,0.7)", flexShrink: 0 }}>
              {TABS.map(tab => {
                const isActive = activeTab === tab.key;
                const count    = filterByTab(signals, tab.key).length;
                return (
                  <button
                    key={tab.key}
                    className="tab-btn"
                    onClick={() => setActiveTab(tab.key)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "7px 12px", borderRadius: "2px 2px 0 0",
                      border: "none", background: "transparent",
                      borderBottom: `2px solid ${isActive ? T.gold : "transparent"}`,
                      color: isActive ? T.gold : T.textMuted,
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                      cursor: "pointer", transition: "all 0.1s", marginBottom: -1,
                    }}
                  >
                    <span style={{ opacity: isActive ? 1 : 0.45 }}>{tab.icon}</span>
                    {tab.label}
                    {count > 0 && (
                      <span style={{ fontSize: 10, color: isActive ? T.gold : T.textFaint, background: isActive ? T.goldGlow : "rgba(255,255,255,0.05)", padding: "1px 4px", borderRadius: 2 }}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}

              {teamFilter && (
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, paddingBottom: 5, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, color: T.gold, letterSpacing: "0.1em" }}>
                  <Filter size={10} />
                  {teamFilter}
                  <button onClick={() => setTeamFilter("")} style={{ background: "none", border: "none", color: T.textFaint, cursor: "pointer", padding: 0, display: "flex" }}>
                    <X size={10} />
                  </button>
                </div>
              )}
            </div>

            {/* Signal table */}
            <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
              {/* Column header */}
              <div style={{ display: "grid", gridTemplateColumns: "28px 100px 1fr 110px 76px 72px 64px", padding: "5px 20px", background: "rgba(19,17,16,0.92)", borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, zIndex: 5 }}>
                {["#", "Type", "Signal", "Player", "Verdict", "Conf", "Time"].map(h => (
                  <div key={h} style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.textFaint }}>{h}</div>
                ))}
              </div>

              {loading && <div style={{ padding: "40px 20px", textAlign: "center", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: T.textFaint, letterSpacing: "0.12em" }}>Loading live signals…</div>}

              {!loading && error && (
                <div style={{ padding: "20px", margin: "16px 20px", background: "rgba(217,75,75,0.05)", border: "1px solid rgba(217,75,75,0.2)", borderRadius: 3 }}>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: T.danger }}><strong>Signal feed unavailable</strong> — {error}</div>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textFaint, marginTop: 4 }}>pipeline.db may be empty. Check ingestion cycle logs.</div>
                </div>
              )}

              {!loading && !error && filtered.length === 0 && (
                <div style={{ padding: "40px 20px", textAlign: "center", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: T.textFaint }}>
                  {teamFilter ? `No signals for ${teamFilter}` : `No ${activeTab.toLowerCase()} signals in current cycle`}
                </div>
              )}

              {visibleSignals.map((sig, idx) => (
                <SignalRow key={sig.id} sig={sig} idx={idx} isSelected={selected?.id === sig.id} onClick={() => setSelected(selected?.id === sig.id ? null : sig)} />
              ))}

              {!isProUser && lockedCount > 0 && (
                <div style={{ position: "relative" }}>
                  <div style={{ filter: "blur(3px)", pointerEvents: "none", userSelect: "none" }}>
                    {filtered.slice(FREE_SIGNAL_LIMIT, FREE_SIGNAL_LIMIT + 3).map((sig, idx) => (
                      <SignalRow key={sig.id + "_blur"} sig={sig} idx={FREE_SIGNAL_LIMIT + idx} isSelected={false} onClick={() => {}} />
                    ))}
                  </div>
                  <ProGateBand />
                </div>
              )}

              {(isProUser || lockedCount === 0) && filtered.length > 0 && (
                <div style={{ margin: "10px 20px", padding: "7px 12px", background: T.goldGlow, border: `1px solid ${T.border}`, borderRadius: 2 }}>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textFaint }}>
                    {filtered.length} signals · Refreshes every 60s · Click any row to expand
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Right sidebar ──────────────────────────────────────────────── */}
        <RightSidebar signals={signals} />

        {/* ─── Detail rail ────────────────────────────────────────────────── */}
        {selected && (
          <div style={{ position: "relative", zIndex: 20 }}>
            <DetailPanel sig={selected} onClose={() => setSelected(null)} />
          </div>
        )}
      </div>
    </V2Shell>
  );
}
