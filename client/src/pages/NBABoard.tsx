/**
 * NBABoard.tsx — LFL Master Design
 * Basketball court chalk bg. Team-color Featured Edge banner.
 * Signal hierarchy — high confidence pops, rumors recede.
 * Sport temperature: warm orange/gold.
 */

import { useState, useEffect, useCallback } from "react";
import V2Shell, { SportBadge, SPORT_THEME } from "../components/V2Shell";
import {
  PlayerHeadshot, TeamLogoImg,
  FeaturedEdgeCard,
  VerdictBadge, TypeChip, ConfidenceBar,
  T as _T, getTeamColors, toTeamAbbr,
} from "../components/v2/SportVisuals";
import {
  ChevronRight, X, Filter, Zap, TrendingUp,
  AlertCircle, Lock, Star, Activity, Users, BarChart2, ArrowUpDown,
} from "lucide-react";

// LFL warm tokens
const T = {
  bg:          "#0C0B09",
  surface1:    "#131110",
  surface2:    "#1A1714",
  surface3:    "#201D19",
  gold:        "#C4A24A",
  goldBright:  "#E0BB6A",
  goldDim:     "rgba(196,162,74,0.15)",
  goldGlow:    "rgba(196,162,74,0.07)",
  goldStrong:  "rgba(196,162,74,0.38)",
  text:        "#EDE5D4",
  textMuted:   "#8A7A62",
  textFaint:   "#4A4235",
  green:       "#3EBA6A",
  cyan:        "#4AA8C8",
  orange:      "#D98A42",
  danger:      "#D94B4B",
  border:      "rgba(196,162,74,0.12)",
  borderMid:   "rgba(196,162,74,0.22)",
  borderStrong:"rgba(196,162,74,0.40)",
  // NBA-specific warm accent
  nbaAccent:   "#E87C2A",
  nbaGlow:     "rgba(232,124,42,0.15)",
};

interface LiveSignal {
  id: string; league: string; signal_type: string; headline: string;
  title?: string; summary?: string; body?: string;
  action_takeaway?: string; action_note?: string;
  player_name?: string; team?: string; matchup?: string; verdict?: string;
  confidence_score?: number; injury_designation?: string; lineup_status?: string;
  line_movement?: any; sources?: any[]; source_count?: number;
  why_it_matters?: string; created_at: string;
}

const TABS = [
  { key: "TODAY",      label: "Today",      icon: <Zap size={11} /> },
  { key: "INJURIES",   label: "Injuries",   icon: <AlertCircle size={11} /> },
  { key: "LINEUP",     label: "Lineup",     icon: <Users size={11} /> },
  { key: "PROPS",      label: "Props",      icon: <Star size={11} /> },
  { key: "TRENDS",     label: "Trends",     icon: <TrendingUp size={11} /> },
  { key: "LINE_MOVES", label: "Line Moves", icon: <ArrowUpDown size={11} /> },
] as const;
type TabKey = typeof TABS[number]["key"];

function filterByTab(signals: LiveSignal[], tab: TabKey) {
  switch (tab) {
    case "INJURIES":   return signals.filter(s => s.signal_type === "injury" || s.injury_designation);
    case "LINEUP":     return signals.filter(s => ["rotation","lineup"].includes(s.signal_type) || s.lineup_status);
    case "PROPS":      return signals.filter(s => s.signal_type === "prop");
    case "TRENDS":     return signals.filter(s => ["trend","matchup_edge"].includes(s.signal_type));
    case "LINE_MOVES": return signals.filter(s => s.signal_type === "line_move" || s.line_movement);
    default:           return signals;
  }
}

const NBA_TEAMS = ["LAL","BOS","GSW","MIA","DEN","OKC","MIN","NYK","MIL","PHX","DAL","CLE","SAC","PHI","ATL","CHI"];

// ─── Tonight's Games ──────────────────────────────────────────────────────────

interface GameData {
  id: string; away: string; home: string;
  time: string; status: "LIVE" | "FINAL" | "PRE";
  awayScore: number | null; homeScore: number | null;
  period: string | null; spread: string; total: string; series: string | null;
}

function TonightGamesBar({ teamFilter, onSelectTeam }: { teamFilter: string; onSelectTeam: (t: string) => void }) {
  const [games, setGames]   = useState<GameData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/nba/scoreboard");
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setGames(data.games ?? []);
      } catch { if (!cancelled) setGames([]); }
      finally   { if (!cancelled) setLoading(false); }
    };
    load();
    const iv = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  return (
    <div style={{ padding: "10px 20px 12px", borderBottom: `1px solid ${T.border}`, flexShrink: 0, background: "rgba(12,11,9,0.55)" }}>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: T.textFaint, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        {games.some(g => g.status === "LIVE") && <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, display: "inline-block", animation: "esPulse 2s ease-in-out infinite", boxShadow: `0 0 5px ${T.green}` }} />}
        Tonight's NBA Slate
        {games.some(g => g.series) && <span style={{ color: T.gold, marginLeft: 2 }}>· Playoffs</span>}
      </div>

      {loading  && <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: T.textFaint }}>Loading games…</div>}
      {!loading && games.length === 0 && <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: T.textFaint, padding: "4px 0" }}>No NBA games scheduled today</div>}

      {!loading && games.length > 0 && (
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2 }}>
          {games.map(game => {
            const isLive  = game.status === "LIVE";
            const isFinal = game.status === "FINAL";
            const isHit   = teamFilter === game.away || teamFilter === game.home;
            const awayC   = getTeamColors(game.away);
            const homeC   = getTeamColors(game.home);
            return (
              <div key={game.id} onClick={() => onSelectTeam(isHit ? "" : game.away)} style={{
                flexShrink: 0, width: 208, borderRadius: 3, padding: "9px 12px", cursor: "pointer",
                background: isHit ? `linear-gradient(140deg, ${awayC.primary}28, ${T.surface2})` : T.surface2,
                border: `1px solid ${isHit ? T.borderStrong : isLive ? "rgba(62,186,106,0.32)" : T.border}`,
                transition: "all 0.12s", position: "relative", overflow: "hidden",
              }}>
                {isLive && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${T.green}, ${T.green}44)` }} />}
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `linear-gradient(135deg, ${awayC.primary}12 0%, transparent 45%, ${homeC.primary}0C 100%)` }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7, position: "relative" }}>
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: isLive ? T.green : isFinal ? T.textFaint : T.textMuted, display: "flex", alignItems: "center", gap: 4 }}>
                    {isLive && <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.green, display: "inline-block", animation: "esPulse 1.5s ease-in-out infinite" }} />}
                    {isLive ? (game.period ?? "Live") : isFinal ? "Final" : game.time}
                  </span>
                  {game.series && <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, color: T.textFaint, maxWidth: 76, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{game.series}</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, position: "relative" }}>
                  {[{ abbr: game.away, score: game.awayScore }, { abbr: game.home, score: game.homeScore }].map(tm => (
                    <div key={tm.abbr} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <TeamLogoImg abbr={tm.abbr} size={18} />
                      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 800, letterSpacing: "0.1em", color: T.text, flex: 1 }}>{tm.abbr}</span>
                      {(isLive || isFinal) && tm.score !== null && <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, color: T.text, minWidth: 24, textAlign: "right" }}>{tm.score}</span>}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 6, paddingTop: 5, borderTop: `1px solid ${T.border}`, display: "flex", gap: 10, position: "relative" }}>
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint }}>{game.spread}</span>
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint }}>{game.total}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Right Sidebar ────────────────────────────────────────────────────────────

function InjuryPanel({ signals }: { signals: LiveSignal[] }) {
  const inj = signals.filter(s => s.signal_type === "injury" || s.injury_designation).slice(0, 9);
  const statusColor = (d?: string) => {
    if (!d) return T.textFaint;
    const dl = d.toLowerCase();
    if (dl.includes("out")) return T.danger;
    if (dl.includes("doubtful")) return T.orange;
    if (dl.includes("questionable")) return T.gold;
    if (dl.includes("probable") || dl.includes("available")) return T.green;
    return T.textFaint;
  };
  if (inj.length === 0) return <div style={{ padding: "10px 14px", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: T.textFaint }}>No injury signals this cycle</div>;
  return (
    <div>
      {inj.map(sig => (
        <div key={sig.id} style={{ padding: "8px 13px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
          <TeamLogoImg abbr={sig.team ?? "NBA"} size={18} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sig.player_name ?? sig.headline.slice(0, 26)}</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: statusColor(sig.injury_designation), letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 1 }}>{sig.injury_designation ?? "Questionable"}</div>
          </div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint }}>{sig.team}</div>
        </div>
      ))}
    </div>
  );
}

function LineupPanel({ signals }: { signals: LiveSignal[] }) {
  const lu = signals.filter(s => ["rotation","lineup"].includes(s.signal_type) || s.lineup_status).slice(0, 7);
  if (lu.length === 0) return <div style={{ padding: "10px 14px", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: T.textFaint }}>No lineup signals today</div>;
  return (
    <div>
      {lu.map(sig => (
        <div key={sig.id} style={{ padding: "8px 13px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: T.cyan, marginTop: 5, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: T.text, lineHeight: 1.35, fontWeight: 500 }}>{sig.headline.slice(0, 50)}{sig.headline.length > 50 ? "…" : ""}</div>
            {sig.team && <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint, marginTop: 2 }}>{sig.team}{sig.lineup_status ? ` · ${sig.lineup_status}` : ""}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function TrendsPanel({ signals }: { signals: LiveSignal[] }) {
  const tr = signals.filter(s => ["trend","matchup_edge"].includes(s.signal_type)).slice(0, 6);
  if (tr.length === 0) return <div style={{ padding: "10px 14px", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: T.textFaint }}>No trend signals this cycle</div>;
  return (
    <div>
      {tr.map(sig => {
        const conf = sig.confidence_score ?? 70;
        return (
          <div key={sig.id} style={{ padding: "8px 13px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 12, color: T.text, lineHeight: 1.35, fontWeight: 500, marginBottom: 5 }}>{sig.headline.slice(0, 55)}{sig.headline.length > 55 ? "…" : ""}</div>
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
  const [open, setOpen] = useState<"injuries"|"lineup"|"trends">("injuries");
  const panels = [
    { key: "injuries" as const, label: "Injury Report",   icon: <AlertCircle size={11} />, color: T.danger, count: signals.filter(s => s.signal_type === "injury" || s.injury_designation).length },
    { key: "lineup"   as const, label: "Lineup Movement", icon: <Users size={11} />,        color: T.cyan,   count: signals.filter(s => ["rotation","lineup"].includes(s.signal_type) || !!s.lineup_status).length },
    { key: "trends"   as const, label: "Team Trends",     icon: <BarChart2 size={11} />,    color: T.green,  count: signals.filter(s => ["trend","matchup_edge"].includes(s.signal_type)).length },
  ];
  return (
    <div className="board-right-rail" style={{ width: 234, flexShrink: 0, background: T.surface1, borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column", overflowY: "auto" }}>
      {panels.map(p => (
        <div key={p.key} style={{ borderBottom: `1px solid ${T.border}` }}>
          <div onClick={() => setOpen(x => x === p.key ? "injuries" : p.key)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "11px 13px", cursor: "pointer", background: open === p.key ? `linear-gradient(90deg, ${p.color}12, transparent)` : "transparent", borderLeft: `3px solid ${open === p.key ? p.color : "transparent"}`, transition: "background 0.1s" }}>
            <span style={{ color: p.color, display: "flex" }}>{p.icon}</span>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: open === p.key ? T.text : T.textMuted, flex: 1 }}>{p.label}</span>
            {p.count > 0 && <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, color: p.color, background: `${p.color}18`, padding: "1px 5px", borderRadius: 2 }}>{p.count}</span>}
            <ChevronRight size={10} style={{ color: T.textFaint, transform: open === p.key ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
          </div>
          {open === p.key && (
            <div style={{ borderTop: `1px solid ${T.border}` }}>
              {p.key === "injuries" && <InjuryPanel signals={signals} />}
              {p.key === "lineup"   && <LineupPanel signals={signals} />}
              {p.key === "trends"   && <TrendsPanel signals={signals} />}
            </div>
          )}
        </div>
      ))}
      <div style={{ marginTop: "auto", padding: "12px 10px" }}>
        <div style={{ background: T.goldGlow, border: `1px solid ${T.borderStrong}`, borderRadius: 3, padding: "12px 10px" }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: T.gold, marginBottom: 5 }}>⚡ Pro Only</div>
          <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: 11, color: T.textFaint, lineHeight: 1.5, marginBottom: 8 }}>Real-time alerts, full signal archive & source confidence scores.</div>
          <a href="/#/pro" style={{ display: "block", textAlign: "center", background: `linear-gradient(135deg, ${T.gold}, #8A6A28)`, color: T.bg, fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: "2px", padding: "7px 0", borderRadius: 2, textDecoration: "none" }}>
            Unlock Pro — $19/mo
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Pro Gate ─────────────────────────────────────────────────────────────────

function ProGate() {
  return (
    <div style={{ position: "relative", flexShrink: 0, background: `linear-gradient(to bottom, transparent, rgba(12,11,9,0.97) 38%)`, padding: "40px 20px 20px", marginTop: -40, zIndex: 10 }}>
      <div style={{ border: `1px solid ${T.borderStrong}`, borderRadius: 3, background: "rgba(12,11,9,0.95)", padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: T.goldGlow, border: `1px solid ${T.borderStrong}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Lock size={15} style={{ color: T.gold }} />
          </div>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 2 }}>90 signals locked</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textFaint, letterSpacing: "0.06em" }}>Pro members see the full feed — injury confirmations, lineup leaks, line movement alerts</div>
          </div>
        </div>
        <a href="/#/pro" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `linear-gradient(135deg, ${T.gold} 0%, #8A6A28 50%, ${T.gold} 100%)`, backgroundSize: "200%", animation: "esShimmer 3s ease infinite", color: T.bg, fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: "2px", padding: "9px 18px", borderRadius: 2, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
          <Zap size={12} /> Unlock Pro
        </a>
      </div>
    </div>
  );
}

// ─── Signal Row — with confidence-based visual hierarchy ─────────────────────

function SignalRow({ sig, idx, isSelected, onClick }: { sig: LiveSignal; idx: number; isSelected: boolean; onClick: () => void }) {
  const conf    = sig.confidence_score ?? 70;
  const verdict = sig.verdict ?? "unverified";
  const isHigh  = conf >= 85 && (verdict === "official" || verdict === "confirmed" || verdict === "verified");
  const isRumor = verdict === "rumor" || conf < 60;

  const typeColors: Record<string, string> = {
    injury: T.danger, line_move: T.green, matchup_edge: T.gold,
    prop: T.orange, rotation: T.cyan, trend: T.cyan, lineup: T.cyan, news: T.textMuted,
  };
  const tc = typeColors[sig.signal_type] ?? T.textFaint;

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div
      className="sig-row"
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "28px 100px 1fr 110px 80px 72px 62px",
        padding: isHigh ? "14px 20px" : "9px 20px",
        borderBottom: `1px solid ${T.border}`,
        background: isSelected
          ? `rgba(196,162,74,0.09)`
          : isHigh
          ? `linear-gradient(90deg, rgba(232,124,42,0.11) 0%, rgba(232,124,42,0.04) 35%, transparent 60%)`
          : "transparent",
        cursor: "pointer", alignItems: "center",
        borderLeft: `${isHigh ? 4 : 2}px solid ${isSelected ? T.gold : isRumor ? tc + "28" : tc + (isHigh ? "EE" : "66")}`,
        transition: "background 0.1s",
        opacity: isRumor ? 0.62 : 1,
        minHeight: isHigh ? 64 : 48,
      }}
    >
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textFaint }}>{idx + 1}</div>
      <div><TypeChip type={sig.signal_type as any} /></div>
      <div style={{ paddingRight: 12 }}>
        <div className="sig-headline" style={{ fontSize: isHigh ? 15 : 13, color: isHigh ? T.text : T.text, fontWeight: isHigh ? 700 : 500, lineHeight: 1.35, marginBottom: 2 }}>
          {sig.headline ?? sig.title}
        </div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textFaint, lineHeight: 1.4 }}>
          {(sig.action_takeaway ?? sig.summary ?? "").slice(0, 66)}{(sig.action_takeaway ?? sig.summary ?? "").length > 66 ? "…" : ""}
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
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: isHigh ? 16 : 14, color: conf >= 80 ? T.gold : T.textMuted, marginBottom: 2 }}>{conf}%</div>
        <ConfidenceBar value={conf} width={44} height={3} />
      </div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint }}>{timeAgo(sig.created_at)}</div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({ sig, onClose }: { sig: LiveSignal; onClose: () => void }) {
  const team       = sig.team ?? "NBA";
  const teamColors = getTeamColors(team);
  const conf       = sig.confidence_score ?? 70;
  const verdict    = sig.verdict ?? "unverified";

  return (
    <div style={{ width: 316, background: T.surface1, borderLeft: `1px solid ${T.borderStrong}`, flexShrink: 0, display: "flex", flexDirection: "column", overflowY: "auto", position: "relative" }}>
      <button onClick={onClose} style={{ position: "absolute", top: 10, right: 10, zIndex: 10, background: "rgba(0,0,0,0.55)", border: "none", borderRadius: "50%", color: T.textMuted, cursor: "pointer", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <X size={11} />
      </button>

      {/* Full-bleed team-color banner */}
      <div style={{ position: "relative", overflow: "hidden", minHeight: 90, background: `linear-gradient(140deg, ${teamColors.primary}F0 0%, ${teamColors.primary}60 55%, ${T.surface2} 100%)`, padding: "16px 14px 12px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${T.gold}, ${T.gold}44)` }} />
        {/* Chalk bg texture in banner */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.06 }} className="es-chalk-nba" />
        <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 9 }}>
          <TeamLogoImg abbr={team} size={40} />
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: "2px", color: T.text, lineHeight: 1.2 }}>{sig.player_name ? sig.player_name : team}</div>
            <VerdictBadge verdict={verdict as any} />
          </div>
        </div>
      </div>

      {/* Stats strip */}
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

      <div style={{ padding: "12px 14px", flex: 1 }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 700, color: T.text, lineHeight: 1.4, marginBottom: 10 }}>{sig.headline ?? sig.title}</div>
        {(sig.body ?? sig.summary) && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.textFaint, marginBottom: 4 }}>Detail</div>
            <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: 12, color: T.textMuted, lineHeight: 1.65 }}>{sig.body ?? sig.summary}</div>
          </div>
        )}
        {(sig.action_takeaway ?? sig.action_note) && (
          <div style={{ background: T.goldGlow, border: `1px solid rgba(196,162,74,0.22)`, borderRadius: 2, padding: "10px 12px" }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: T.gold, marginBottom: 4 }}>⚡ Action</div>
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

// ─── Main ─────────────────────────────────────────────────────────────────────

const FREE_LIMIT = 8;

export default function NBABoard() {
  const [signals, setSignals]     = useState<LiveSignal[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("TODAY");
  const [teamFilter, setTeamFilter] = useState("");
  const [selected, setSelected]   = useState<LiveSignal | null>(null);
  const [isProUser]               = useState(false);

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch("/api/signals?league=NBA");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSignals(await res.json());
      setError(null);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSignals(); const iv = setInterval(fetchSignals, 60_000); return () => clearInterval(iv); }, [fetchSignals]);

  let filtered = filterByTab(signals, activeTab);
  if (teamFilter) filtered = filtered.filter(s => s.team === teamFilter || s.matchup?.includes(teamFilter));

  const visible     = isProUser ? filtered : filtered.slice(0, FREE_LIMIT);
  const lockedCount = filtered.length - visible.length;
  const featured    = signals.find(s => (s.confidence_score ?? 0) >= 85) ?? signals[0];
  const featColors  = getTeamColors(featured?.team ?? "NBA");
  const featOppColors = getTeamColors(featured?.matchup?.split("@")[1]?.trim() ?? featured?.team ?? "NBA");

  const confirmedCount = signals.filter(s => s.verdict === "confirmed").length;
  const highConfCount  = signals.filter(s => (s.confidence_score ?? 0) >= 80).length;

  return (
    <V2Shell sport="NBA">
      <style>{`
        @keyframes esPulse   { 0%,100%{opacity:1} 50%{opacity:0.22} }
        @keyframes esShimmer { 0%{background-position:0%} 50%{background-position:100%} 100%{background-position:0%} }
        .tab-btn:hover { background: rgba(196,162,74,0.05) !important; }
        .team-pill:hover { background: rgba(196,162,74,0.07) !important; border-color: rgba(196,162,74,0.3) !important; }
      `}</style>

      <div style={{ display: "flex", height: "100%", minHeight: "calc(100vh - 48px)" }}>

        {/* ── Left sidebar ── */}
        <aside style={{ width: 168, background: T.surface1, borderRight: `1px solid ${T.border}`, flexShrink: 0, padding: "12px 6px", overflowY: "auto" }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.24em", textTransform: "uppercase", color: T.textFaint, padding: "0 7px", marginBottom: 7 }}>NBA Board</div>

          {[
            { label: "Signal Stream",     icon: <Zap size={11} />,         active: true  },
            { label: "Tonight's Slate",   icon: <Activity size={11} />,    active: false },
            { label: "Injury Volatility", icon: <AlertCircle size={11} />, active: false },
            { label: "Line Movement",     icon: <ArrowUpDown size={11} />, active: false },
            { label: "Matchup Edges",     icon: <BarChart2 size={11} />,   active: false },
          ].map(({ label, icon, active }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 7px", marginBottom: 1, borderRadius: 2, borderLeft: `2px solid ${active ? T.nbaAccent : "transparent"}`, background: active ? "rgba(232,124,42,0.07)" : "transparent", color: active ? T.nbaAccent : T.textMuted, cursor: "pointer" }}>
              <span style={{ opacity: active ? 1 : 0.4, display: "flex" }}>{icon}</span>
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>
            </div>
          ))}

          <div style={{ margin: "12px 0 8px", borderTop: `1px solid ${T.border}` }} />
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.24em", textTransform: "uppercase", color: T.textFaint, padding: "0 7px", marginBottom: 6 }}>Teams</div>

          {teamFilter && (
            <div onClick={() => setTeamFilter("")} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 7px", marginBottom: 5, borderRadius: 2, background: T.goldGlow, border: `1px solid ${T.borderStrong}`, cursor: "pointer" }}>
              <X size={9} style={{ color: T.textFaint }} />
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, color: T.textFaint, letterSpacing: "0.1em", textTransform: "uppercase" }}>Clear</span>
            </div>
          )}

          {NBA_TEAMS.map(tm => {
            const isActive   = teamFilter === tm;
            const hasSignals = signals.some(s => s.team === tm);
            return (
              <div key={tm} className="team-pill" onClick={() => setTeamFilter(isActive ? "" : tm)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 7px", borderRadius: 2, marginBottom: 1, cursor: "pointer", background: isActive ? T.goldGlow : "transparent", border: `1px solid ${isActive ? T.borderStrong : "transparent"}`, transition: "all 0.1s" }}>
                <TeamLogoImg abbr={tm} size={18} />
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: isActive ? T.gold : T.textMuted, flex: 1 }}>{tm}</span>
                {hasSignals && <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.green, display: "inline-block" }} />}
              </div>
            );
          })}
        </aside>

        {/* ── Main canvas ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden", position: "relative" }}>

          {/* Chalk basketball court bg */}
          <div className="es-chalk-nba" aria-hidden="true" style={{ position: "absolute", inset: 0, opacity: 0.07, pointerEvents: "none", zIndex: 0 }} />
          {/* NBA warm radial glow — stronger orange atmosphere */}
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1, background: `radial-gradient(ellipse 80% 65% at 50% 40%, rgba(232,124,42,0.10) 0%, rgba(232,124,42,0.03) 50%, transparent 72%), radial-gradient(ellipse 85% 80% at 50% 50%, transparent 30%, ${T.bg} 100%)` }} />

          <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", height: "100%" }}>

            {/* Board header */}
            <div style={{ padding: "10px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0, background: "rgba(19,17,16,0.9)" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: "3px", color: T.text }}>NBA Intelligence Board</span>
                  <SportBadge status="LIVE" />
                </div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textFaint, letterSpacing: "0.08em" }}>
                  {loading ? "Loading signals…" : error ? `Signal feed unavailable — ${error}` : `${signals.length} signals · Updated continuously`}
                </div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                {[
                  { label: "Total",     value: signals.length, color: T.text    },
                  { label: "Confirmed", value: confirmedCount, color: T.green   },
                  { label: "High Conf", value: highConfCount,  color: T.nbaAccent },
                ].map(stat => (
                  <div key={stat.label} style={{ textAlign: "center", padding: "5px 10px", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 2 }}>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, color: stat.color }}>{loading ? "—" : stat.value}</div>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, color: T.textFaint, letterSpacing: "0.14em", textTransform: "uppercase" }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Games bar */}
            <TonightGamesBar teamFilter={teamFilter} onSelectTeam={setTeamFilter} />

            {/* Featured Edge — COMMANDING team color bleed */}
            {featured && !loading && (
              <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>
                <div style={{ borderRadius: 3, overflow: "hidden", border: `1px solid ${featColors.primary}55`, position: "relative",
                  boxShadow: `0 0 32px ${featColors.primary}22, 0 4px 24px rgba(0,0,0,0.5)` }}>
                  {/* Gold top stripe */}
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.gold}, ${T.gold}33)`, zIndex: 3 }} />
                  {/* PRIMARY team color — BOLD left bleed, unmissable */}
                  <div style={{ position: "absolute", inset: 0, background: `linear-gradient(125deg, ${featColors.primary}90 0%, ${featColors.primary}44 30%, ${featColors.primary}18 55%, transparent 72%)`, pointerEvents: "none", zIndex: 1 }} />
                  {/* Secondary team color accent */}
                  <div style={{ position: "absolute", inset: 0, background: `linear-gradient(125deg, ${featColors.secondary}30 0%, transparent 40%)`, pointerEvents: "none", zIndex: 1 }} />
                  {/* Opposing team bleed from right */}
                  <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 98% 50%, ${featOppColors.primary}44, transparent 48%)`, pointerEvents: "none", zIndex: 1 }} />
                  {/* Chalk texture */}
                  <div className="es-chalk-nba" style={{ position: "absolute", inset: 0, opacity: 0.04, pointerEvents: "none", zIndex: 0 }} />
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
                        team:            toTeamAbbr(featured.team) || "NBA",
                        opponent:        undefined,
                        timestamp:       new Date(featured.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                        tags:            [toTeamAbbr(featured.team) || "NBA", featured.signal_type ?? "intel"].filter(Boolean),
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Sub-nav tabs */}
            <div style={{ display: "flex", gap: 2, padding: "10px 20px 0", borderBottom: `1px solid ${T.border}`, background: "rgba(19,17,16,0.75)", flexShrink: 0 }}>
              {TABS.map(tab => {
                const isActive = activeTab === tab.key;
                const count    = filterByTab(signals, tab.key).length;
                return (
                  <button key={tab.key} className="tab-btn" onClick={() => setActiveTab(tab.key)} style={{
                    display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px",
                    borderRadius: "2px 2px 0 0", border: "none", background: "transparent",
                    borderBottom: `2px solid ${isActive ? T.nbaAccent : "transparent"}`,
                    color: isActive ? T.nbaAccent : T.textMuted,
                    fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                    cursor: "pointer", transition: "all 0.1s", marginBottom: -1,
                  }}>
                    <span style={{ opacity: isActive ? 1 : 0.4 }}>{tab.icon}</span>
                    {tab.label}
                    {count > 0 && <span style={{ fontSize: 10, color: isActive ? T.nbaAccent : T.textFaint, background: isActive ? "rgba(232,124,42,0.12)" : "rgba(255,255,255,0.05)", padding: "1px 4px", borderRadius: 2 }}>{count}</span>}
                  </button>
                );
              })}
              {teamFilter && (
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, paddingBottom: 5, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, color: T.gold }}>
                  <Filter size={10} />{teamFilter}
                  <button onClick={() => setTeamFilter("")} style={{ background: "none", border: "none", color: T.textFaint, cursor: "pointer", padding: 0, display: "flex" }}><X size={10} /></button>
                </div>
              )}
            </div>

            {/* Signal feed */}
            <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
              {/* Column header */}
              <div style={{ display: "grid", gridTemplateColumns: "28px 100px 1fr 110px 80px 72px 62px", padding: "5px 20px", background: "rgba(19,17,16,0.94)", borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, zIndex: 5 }}>
                {["#","Type","Signal","Player","Verdict","Conf","Time"].map(h => (
                  <div key={h} style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.textFaint }}>{h}</div>
                ))}
              </div>

              {loading && <div style={{ padding: "40px 20px", textAlign: "center", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: T.textFaint, letterSpacing: "0.12em" }}>Loading live signals…</div>}

              {!loading && error && (
                <div style={{ padding: "20px", margin: "16px 20px", background: "rgba(217,75,75,0.05)", border: "1px solid rgba(217,75,75,0.2)", borderRadius: 3 }}>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: T.danger }}><strong>Signal feed unavailable</strong> — {error}</div>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textFaint, marginTop: 4 }}>pipeline.db may be empty — check ingestion cycle logs.</div>
                </div>
              )}

              {!loading && !error && filtered.length === 0 && (
                <div style={{ padding: "40px 20px", textAlign: "center", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: T.textFaint }}>
                  {teamFilter ? `No signals for ${teamFilter}` : `No ${activeTab.toLowerCase()} signals in current cycle`}
                </div>
              )}

              {visible.map((sig, idx) => (
                <SignalRow key={sig.id} sig={sig} idx={idx} isSelected={selected?.id === sig.id} onClick={() => setSelected(selected?.id === sig.id ? null : sig)} />
              ))}

              {!isProUser && lockedCount > 0 && (
                <div style={{ position: "relative" }}>
                  <div style={{ filter: "blur(3px)", pointerEvents: "none", userSelect: "none" }}>
                    {filtered.slice(FREE_LIMIT, FREE_LIMIT + 3).map((sig, idx) => (
                      <SignalRow key={sig.id + "_blur"} sig={sig} idx={FREE_LIMIT + idx} isSelected={false} onClick={() => {}} />
                    ))}
                  </div>
                  <ProGate />
                </div>
              )}

              {(isProUser || lockedCount === 0) && filtered.length > 0 && (
                <div style={{ margin: "10px 20px", padding: "7px 12px", background: T.goldGlow, border: `1px solid ${T.border}`, borderRadius: 2 }}>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textFaint }}>{filtered.length} signals · Refreshes every 60s · Click any row to expand</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <RightSidebar signals={signals} />

        {/* Detail panel */}
        {selected && (
          <div style={{ position: "relative", zIndex: 20 }}>
            <DetailPanel sig={selected} onClose={() => setSelected(null)} />
          </div>
        )}
      </div>
    </V2Shell>
  );
}
