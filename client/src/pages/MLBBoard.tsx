import { useState, useMemo, useEffect } from "react";
import AppShell from "@/components/V2Shell";
import { BoardHeader } from "@/components/BoardHeader";
import { useMLBSignals } from "@/hooks/useSignals";
import { useSearch } from "wouter";
import { getTeamLogo, getPlayerHeadshot, getInitialsAvatar } from "@/lib/espnAssets";
import {
  Activity, BarChart2, Bell, BellOff, ChevronRight,
  Lock, Shield, TrendingUp, TrendingDown, User, Zap,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(ts: Date | string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function urgencyColor(score: number) {
  if (score >= 8) return "#FF5555";
  if (score >= 6) return "#F5A623";
  if (score >= 4) return "#39FF14";
  return "#3A3F4E";
}

function confColor(score: number) {
  if (score >= 80) return "#39FF14";
  if (score >= 60) return "#F5A623";
  return "#FF5555";
}

// ── Team abbreviation → color ─────────────────────────────────────────────
const MLB_COLORS: Record<string, [string, string]> = {
  NYY: ["#003087", "#E4E4E4"], NYM: ["#002D72", "#FF5910"],
  LAD: ["#005A9C", "#EF3E42"], LAA: ["#BA0021", "#003263"],
  BOS: ["#BD3039", "#0C2340"], CHC: ["#0E3386", "#CC3433"],
  CHW: ["#27251F", "#C4CED4"], CLE: ["#E31937", "#002B5C"],
  DET: ["#0C2340", "#FA4616"], HOU: ["#002D62", "#EB6E1F"],
  KC:  ["#004687", "#C09A5B"], MIN: ["#002B5C", "#D31145"],
  OAK: ["#003831", "#EFB21E"], SEA: ["#0C2C56", "#005C5C"],
  TEX: ["#003278", "#C0111F"], TOR: ["#134A8E", "#E8291C"],
  TB:  ["#092C5C", "#8FBCE6"], BAL: ["#DF4601", "#000000"],
  ATL: ["#CE1141", "#13274F"], MIA: ["#00A3E0", "#EF3340"],
  NYM2:["#002D72", "#FF5910"], PHI: ["#E81828", "#002D72"],
  WSH: ["#AB0003", "#14225A"], CHC2:["#0E3386", "#CC3433"],
  CIN: ["#C6011F", "#000000"], MIL: ["#FFC52F", "#12284B"],
  PIT: ["#FDB827", "#27251F"], STL: ["#C41E3A", "#0C2340"],
  ARI: ["#A71930", "#E3D4AD"], COL: ["#33006F", "#C4CED4"],
  LAD2:["#005A9C", "#EF3E42"], SD:  ["#2F241D", "#FFC425"],
  SF:  ["#FD5A1E", "#27251F"],
};
function getTeamColors(abbr: string | null): [string, string] {
  if (!abbr) return ["#1A1714", "#8A9099"];
  return MLB_COLORS[abbr.toUpperCase()] ?? ["#1A1714", "#8A9099"];
}

// ── Player Avatar with ESPN headshot ─────────────────────────────────────────
function PlayerAvatar({ name, size = 48 }: { name: string; size?: number }) {
  const headshotUrl = getPlayerHeadshot(name, "mlb");
  const { initials, color } = getInitialsAvatar(name);
  if (headshotUrl) {
    return (
      <div style={{
        width: size, height: size, borderRadius: "50%",
        overflow: "hidden", flexShrink: 0,
        border: "2px solid #2A2F3E", background: "#131110",
      }}>
        <img src={headshotUrl} alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={e => {
            const el = e.currentTarget; el.style.display = "none";
            const p = el.parentElement!;
            p.style.cssText += `background:${color};display:flex;align-items:center;justify-content:center;`;
            p.innerHTML = `<span style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:${Math.round(size*0.34)}px;color:#fff">${initials}</span>`;
          }}
        />
      </div>
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: color,
      border: "2px solid rgba(255,255,255,0.1)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, fontFamily: "'Barlow Condensed', sans-serif",
      fontWeight: 800, fontSize: size * 0.34, color: "#fff",
    }}>
      {initials || <User size={size * 0.45} />}
    </div>
  );
}

// ── Team Logo (ESPN CDN with color-circle fallback) ─────────────────────────────
// teamName = full team name from DB (e.g., "Los Angeles Dodgers") OR abbreviation
function TeamBadge({ teamName, size = 44 }: { teamName: string; size?: number }) {
  const logoUrl = getTeamLogo(teamName, "mlb");
  // Derive short display abbreviation
  const words = teamName.trim().split(" ");
  const displayAbbr = words.length === 1 && teamName.length <= 4
    ? teamName.toUpperCase()
    : words[words.length - 1].slice(0, 3).toUpperCase();
  // For colors, prefer the proper MLB abbreviation from the name map
  const MLB_NAME_ABBR: Record<string, string> = {
    "arizona diamondbacks": "ARI", "atlanta braves": "ATL", "baltimore orioles": "BAL",
    "boston red sox": "BOS", "chicago cubs": "CHC", "chicago white sox": "CHW",
    "cincinnati reds": "CIN", "cleveland guardians": "CLE", "colorado rockies": "COL",
    "detroit tigers": "DET", "houston astros": "HOU", "kansas city royals": "KC",
    "los angeles angels": "LAA", "los angeles dodgers": "LAD", "miami marlins": "MIA",
    "milwaukee brewers": "MIL", "minnesota twins": "MIN", "new york mets": "NYM",
    "new york yankees": "NYY", "athletics": "OAK", "oakland athletics": "OAK",
    "philadelphia phillies": "PHI", "pittsburgh pirates": "PIT", "san diego padres": "SD",
    "san francisco giants": "SF", "seattle mariners": "SEA", "st. louis cardinals": "STL",
    "st louis cardinals": "STL", "tampa bay rays": "TB", "texas rangers": "TEX",
    "toronto blue jays": "TOR", "washington nationals": "WSH",
  };
  const colorAbbr = MLB_NAME_ABBR[teamName.toLowerCase().trim()] ?? teamName.toUpperCase().slice(0, 3);
  const [bg, text] = getTeamColors(colorAbbr);
  if (logoUrl) {
    return (
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: `${bg}22`, border: `2px solid ${bg}55`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, overflow: "hidden", padding: "4px",
      }}>
        <img src={logoUrl} alt={displayAbbr}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          onError={e => {
            const el = e.currentTarget; el.style.display = "none";
            const p = el.parentElement!;
            p.style.cssText += `background:${bg};display:flex;align-items:center;justify-content:center;`;
            p.innerHTML = `<span style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:${Math.round(size*0.3)}px;color:${text}">${displayAbbr}</span>`;
          }}
        />
      </div>
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: bg, border: `2px solid ${text}33`,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, fontFamily: "'Barlow Condensed', sans-serif",
      fontWeight: 900, fontSize: size * 0.3, color: text,
    }}>
      {displayAbbr}
    </div>
  );
}

// ── Confidence bar ───────────────────────────────────────────────────────────
function ConfBar({ score }: { score: number | null }) {
  const pct = score ?? 50;
  const color = confColor(pct);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div style={{ width: "60px", height: "3px", background: "#1A1714", borderRadius: "2px", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "2px" }} />
      </div>
      <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: "0.7rem", color, minWidth: "28px" }}>{pct}%</span>
    </div>
  );
}

// ── Verdict badge ────────────────────────────────────────────────────────────
function VerdictBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const map: Record<string, [string, string]> = {
    verified: ["#39FF14", "rgba(57,255,20,0.12)"],
    confirmed: ["#39FF14", "rgba(57,255,20,0.12)"],
    official: ["#F5A623", "rgba(245,166,35,0.12)"],
    developing: ["#F5A623", "rgba(245,166,35,0.12)"],
    unconfirmed: ["#8A9099", "rgba(138,144,153,0.12)"],
  };
  const [color, bg] = map[status.toLowerCase()] ?? ["#8A9099", "rgba(138,144,153,0.12)"];
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: "4px",
      fontSize: "0.65rem", fontWeight: 800,
      textTransform: "uppercase", letterSpacing: "0.08em",
      color, background: bg, border: `1px solid ${color}44`,
    }}>{status}</span>
  );
}

// ── Live game type from tRPC ─────────────────────────────────────────────────
type LiveGame = {
  id: number;
  sport: "nba" | "mlb";
  espnEventId: string;
  homeTeam: string | null;
  awayTeam: string | null;
  gameDate: Date | null;
  statusDescription: string | null;
  homeScore: number | null;
  awayScore: number | null;
  cachedAt: Date;
};
function formatGameTime(date: Date | null, status: string | null): string {
  if (status && (status.toLowerCase().includes("final") || status.toLowerCase().includes("in progress"))) return status;
  if (!date) return "TBD";
  return new Date(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}
// Map full MLB team names to their standard abbreviations for card labels
const MLB_ABBR_MAP: Record<string, string> = {
  "arizona diamondbacks": "ARI", "atlanta braves": "ATL", "baltimore orioles": "BAL",
  "boston red sox": "BOS", "chicago cubs": "CHC", "chicago white sox": "CHW",
  "cincinnati reds": "CIN", "cleveland guardians": "CLE", "colorado rockies": "COL",
  "detroit tigers": "DET", "houston astros": "HOU", "kansas city royals": "KC",
  "los angeles angels": "LAA", "los angeles dodgers": "LAD", "miami marlins": "MIA",
  "milwaukee brewers": "MIL", "minnesota twins": "MIN", "new york mets": "NYM",
  "new york yankees": "NYY", "athletics": "ATH", "oakland athletics": "ATH",
  "philadelphia phillies": "PHI", "pittsburgh pirates": "PIT", "san diego padres": "SD",
  "san francisco giants": "SF", "seattle mariners": "SEA", "st. louis cardinals": "STL",
  "st louis cardinals": "STL", "tampa bay rays": "TB", "texas rangers": "TEX",
  "toronto blue jays": "TOR", "washington nationals": "WSH",
};
function getTeamAbbr(fullName: string): string {
  return MLB_ABBR_MAP[fullName.toLowerCase().trim()] ?? fullName.toUpperCase().slice(0, 3);
}
function GameCard({ game, active, onClick, signalCount }: {
  game: LiveGame; active: boolean; onClick: () => void; signalCount?: number;
}) {
  const awayFull = game.awayTeam ?? "TBD";
  const homeFull = game.homeTeam ?? "TBD";
  const away = getTeamAbbr(awayFull);
  const home = getTeamAbbr(homeFull);
  const [awayBg] = getTeamColors(away);
  const [homeBg] = getTeamColors(home);
  const isLive = game.statusDescription?.toLowerCase().includes("in progress");
  return (
    <div
      onClick={onClick}
      style={{
        minWidth: "200px", maxWidth: "220px",
        background: active ? "#1A1714" : "#131110",
        border: `1px solid ${active ? "#F5A623" : "#1A1714"}`,
        borderRadius: "10px", overflow: "hidden",
        cursor: "pointer", flexShrink: 0,
        transition: "all 0.15s ease",
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = "#2A2F3E"; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = "#1A1714"; }}
    >
      {/* Team color bar */}
      <div style={{ height: "3px", background: `linear-gradient(90deg, ${awayBg}, ${homeBg})` }} />

      {/* Teams */}
      <div style={{ padding: "14px 16px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
            <TeamBadge teamName={awayFull} size={48} />
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1.05rem", fontWeight: 900, color: "#E0E0E0", letterSpacing: "0.04em" }}>{away}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
            <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: "0.8rem", color: "#3A3F4E", fontWeight: 700 }}>@</span>
            {isLive && <span style={{ fontSize: "0.55rem", fontWeight: 800, color: "#39FF14", textTransform: "uppercase", letterSpacing: "0.06em" }}>LIVE</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
            <TeamBadge teamName={homeFull} size={48} />
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1.05rem", fontWeight: 900, color: "#E0E0E0", letterSpacing: "0.04em" }}>{home}</span>
          </div>
        </div>
      </div>

      {/* Score if live/final */}
      {(game.homeScore !== null || game.awayScore !== null) && (
        <div style={{ padding: "0 16px 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: "1.1rem", fontWeight: 700, color: "#F5A623" }}>{game.awayScore ?? "-"}</span>
          <span style={{ fontSize: "0.6rem", color: "#555A66" }}>SCORE</span>
          <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: "1.1rem", fontWeight: 700, color: "#F5A623" }}>{game.homeScore ?? "-"}</span>
        </div>
      )}
      {/* Stats */}
      <div style={{ padding: "0 16px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
        {[
          { label: "STATUS", val: game.statusDescription ?? "Scheduled" },
          { label: "TIME",   val: formatGameTime(game.gameDate, game.statusDescription) },
        ].map(s => (
          <div key={s.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "0.58rem", color: "#3A3F4E", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "3px" }}>{s.label}</div>
            <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: "0.7rem", color: "#8A9099", lineHeight: 1.2 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Signal count */}
      <div style={{ borderTop: "1px solid #1A1E2A", padding: "8px 16px", display: "flex", alignItems: "center", gap: "6px" }}>
        <Zap size={12} style={{ color: "#F5A623" }} />
        <span style={{ fontSize: "0.78rem", color: "#F5A623", fontWeight: 700 }}>{signalCount ?? 0} signals</span>
      </div>
    </div>
  );
}

// ── Signal table row ─────────────────────────────────────────────────────────
type Signal = {
  id: number | string; headline: string; detail: string | null;
  player: string | null; team: string | null;
  type: string; confidence: number | null;
  verdict: string | null; action_takeaway: string | null;
  timestamp: string;
};

// FIX: Added isMobile prop — card layout on mobile, table row on desktop.
function SignalRow({
  signal,
  isPro = false,
  userIsPro = false,
  isMobile = false,
}: {
  signal: Signal;
  isPro?: boolean;
  userIsPro?: boolean;
  isMobile?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [alerted, setAlerted] = useState(false);


  // Shared type badge
  const typeBadge = (() => {
    const t = (signal.type ?? "").toLowerCase();
    const colors: Record<string, { bg: string; color: string; border: string }> = {
      injury:     { bg: "rgba(255,85,85,0.1)",   color: "#FF5555", border: "rgba(255,85,85,0.25)" },
      lineup:     { bg: "rgba(74,158,255,0.1)",  color: "#4A9EFF", border: "rgba(74,158,255,0.25)" },
      line_move:  { bg: "rgba(176,110,255,0.1)", color: "#B06EFF", border: "rgba(176,110,255,0.25)" },
      line_moves: { bg: "rgba(176,110,255,0.1)", color: "#B06EFF", border: "rgba(176,110,255,0.25)" },
      scheme:     { bg: "rgba(0,210,190,0.1)",   color: "#00D2BE", border: "rgba(0,210,190,0.25)" },
      weather:    { bg: "rgba(0,220,255,0.1)",   color: "#00DCFF", border: "rgba(0,220,255,0.25)" },
      pitcher:    { bg: "rgba(245,166,35,0.1)",  color: "#F5A623", border: "rgba(245,166,35,0.25)" },
      props:      { bg: "rgba(57,255,20,0.08)",  color: "#39FF14", border: "rgba(57,255,20,0.2)" },
    };
    const c = colors[t] ?? { bg: "rgba(57,255,20,0.08)", color: "#39FF14", border: "rgba(57,255,20,0.2)" };
    return (
      <span style={{
        fontSize: "0.62rem", fontWeight: 800,
        textTransform: "uppercase", letterSpacing: "0.06em",
        padding: "2px 7px", borderRadius: "3px",
        background: c.bg, color: c.color, border: `1px solid ${c.border}`,
        whiteSpace: "nowrap",
      }}>{signal.type}</span>
    );
  })();

  // ── MOBILE CARD LAYOUT ────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ borderBottom: "1px solid #1A1E2A", position: "relative" }}>
        {isPro && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(10,12,16,0.7)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "14px", zIndex: 2 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "5px", background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.3)", fontSize: "0.7rem", fontWeight: 800, color: "#F5A623", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <Lock size={10} /> PRO
            </span>
          </div>
        )}
        <div style={{ padding: "12px 16px 10px" }}>
          {/* Row 1: type badge (left) + timestamp (right) */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            {typeBadge}
            <span style={{ fontSize: "0.75rem", color: "#3A3F4E" }}>{signal.timestamp}</span>
          </div>
          {/* Row 2: player name — 16px, 500 weight */}
          {(signal.player || signal.team) && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "1rem", fontWeight: 500, color: isPro ? "#3A3F4E" : "#E8E8E8", marginBottom: "4px" }}>
              {signal.team && (
                <img src={getTeamLogo(signal.team, "mlb") ?? ""} alt={signal.team}
                  style={{ width: 16, height: 16, objectFit: "contain" }}
                  onError={e => { (e.currentTarget as HTMLElement).style.display = "none"; }}
                />
              )}
              {signal.player ?? signal.team}
            </div>
          )}
          {/* Row 3: headline — 14px, 2-line clamp */}
          <div style={{
            fontSize: "0.875rem", fontWeight: 400,
            color: isPro ? "#3A3F4E" : "#9A9FAA",
            lineHeight: 1.45,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as any,
            marginBottom: "10px",
          }}>
            {signal.headline}
          </div>
          {/* Row 4: confidence bar full width */}
          <ConfBar score={signal.confidence} />
        </div>
        {/* Row 5: verdict badge (left) + View Detail → (right), min 44px tap target */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", minHeight: "44px", borderTop: "1px solid #1A1E2A" }}>
          <VerdictBadge status={signal.verdict} />
          {!isPro && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "transparent", border: "none", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, color: "#39FF14", minHeight: "44px", padding: "0", WebkitTapHighlightColor: "transparent" }}
            >
              {expanded ? "Close" : "View Detail"} <ChevronRight size={13} />
            </button>
          )}
        </div>
        {/* Expanded */}
        {expanded && !isPro && (
          <div style={{ padding: "10px 16px 14px", borderTop: "1px solid #1A1E2A" }}>
            {signal.detail && <p style={{ color: "#8A9099", fontSize: "0.85rem", lineHeight: 1.6, margin: "0 0 8px" }}>{signal.detail}</p>}
            {signal.action_takeaway && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "6px 12px", borderRadius: "6px", background: "rgba(57,255,20,0.06)", border: "1px solid rgba(57,255,20,0.15)" }}>
                <Zap size={11} style={{ color: "#39FF14" }} />
                <span style={{ fontSize: "0.8rem", color: "#39FF14" }}>{signal.action_takeaway}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── DESKTOP TABLE ROW LAYOUT ──────────────────────────────────────────────
  return (
    <div
      onClick={() => !isPro && setExpanded(e => !e)}
      style={{
        borderBottom: "1px solid #1A1E2A",
        cursor: isPro ? "default" : "pointer",
        transition: "background 0.1s",
        position: "relative",
      }}
      onMouseEnter={e => { if (!isPro) (e.currentTarget as HTMLElement).style.background = "#131110"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {isPro && (
        <div style={{
          position: "absolute", inset: 0,
          background: "rgba(10,12,16,0.7)",
          backdropFilter: "blur(2px)",
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          paddingRight: "16px", zIndex: 2,
        }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "4px 10px", borderRadius: "5px",
            background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.3)",
            fontSize: "0.7rem", fontWeight: 800, color: "#F5A623",
            textTransform: "uppercase", letterSpacing: "0.06em",
          }}>
            <Lock size={10} /> PRO
          </span>
        </div>
      )}

      {/* Main row */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px" }}>
        {signal.player
          ? <PlayerAvatar name={signal.player} size={48} />
          : <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#1A1714", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Activity size={18} style={{ color: "#3A3F4E" }} /></div>
        }

        <div style={{ minWidth: "80px" }}>{typeBadge}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: "1.15rem", fontWeight: 700,
            color: isPro ? "#3A3F4E" : "#E8E8E8",
            lineHeight: 1.3, marginBottom: "5px",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: expanded ? "normal" : "nowrap",
          }}>{signal.headline}</div>
          {signal.player && (
            <div style={{ fontSize: "0.82rem", color: "#6A7080", display: "flex", alignItems: "center", gap: "6px" }}>
              {signal.team && (
                <img src={getTeamLogo(signal.team, "mlb") ?? ""} alt={signal.team}
                  style={{ width: 16, height: 16, objectFit: "contain" }}
                  onError={e => { (e.currentTarget as HTMLElement).style.display = "none"; }}
                />
              )}
              <span style={{ fontWeight: 600, color: "#9A9FAA" }}>{signal.player}</span>
              {signal.team && <span style={{ color: "#3A3F4E" }}>· {signal.team}</span>}
            </div>
          )}
        </div>

        <div style={{ minWidth: "90px", textAlign: "right" }}>
          <VerdictBadge status={signal.verdict} />
        </div>

        <div style={{ minWidth: "100px" }}>
          <ConfBar score={signal.confidence} />
        </div>

        <div style={{ minWidth: "60px", textAlign: "right" }}>
          <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: "0.65rem", color: "#3A3F4E" }}>
            {signal.timestamp}
          </span>
        </div>
        {userIsPro && !isPro && (
          <button
            onClick={e => {
              e.stopPropagation();
              setAlerted(a => !a);
            }}
            title={alerted ? "Remove alert" : "Get alerted for similar signals"}
            style={{ display: "inline-flex", alignItems: "center", padding: "4px", borderRadius: "4px", background: "transparent", border: "none", cursor: "pointer", color: alerted ? "#F5A623" : "#3A3F4E", transition: "color 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#F5A623"; }}
            onMouseLeave={e => { if (!alerted) (e.currentTarget as HTMLElement).style.color = "#3A3F4E"; }}
          >
            {alerted ? <Bell size={14} /> : <BellOff size={14} />}
          </button>
        )}
      </div>

      {expanded && !isPro && (
        <div style={{ padding: "0 16px 14px 64px", borderTop: "1px solid #1A1E2A" }}>
          {signal.detail && (
            <p style={{ color: "#8A9099", fontSize: "0.85rem", lineHeight: 1.6, margin: "10px 0 8px" }}>{signal.detail}</p>
          )}
          {signal.action_takeaway && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "6px 12px", borderRadius: "6px", background: "rgba(57,255,20,0.06)", border: "1px solid rgba(57,255,20,0.15)" }}>
              <Zap size={11} style={{ color: "#39FF14" }} />
              <span style={{ fontSize: "0.8rem", color: "#39FF14" }}>{signal.action_takeaway}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Right panel ──────────────────────────────────────────────────────────────
const PITCHER_ALERTS = [
  { name: "G. Cole",     full: "Gerrit Cole",     team: "NYY", detail: "Scratched — elbow",     status: "OUT" },
  { name: "S. Strider",  full: "Spencer Strider",  team: "ATL", detail: "60-day IL, monitoring", status: "IL"  },
  { name: "Y. Yamamoto", full: "Yoshinobu Yamamoto",team: "LAD", detail: "On schedule",           status: "OK"  },
  { name: "M. Fried",    full: "Max Fried",         team: "NYY", detail: "Starts tonight",        status: "OK"  },
];

const LINEUP_MOVES = [
  { player: "Juan Soto",       team: "NYY", detail: "Dropped to 5th vs LHP", trend: "down" },
  { player: "Freddie Freeman", team: "LAD", detail: "Returning to cleanup",   trend: "up"  },
  { player: "Mookie Betts",    team: "LAD", detail: "Leadoff confirmed",       trend: "up"  },
  { player: "Yordan Alvarez",  team: "HOU", detail: "Cleanup spot locked in",  trend: "up"  },
];

const TEAM_TRENDS = [
  { team: "LAD", trend: "11-3 day games",   dir: "up"   },
  { team: "NYY", trend: "8-2 home vs RHP",  dir: "up"   },
  { team: "HOU", trend: "3-8 last 11",      dir: "down" },
  { team: "BOS", trend: "6-1 last 7",       dir: "up"   },
  { team: "ATL", trend: "4-6 last 10",      dir: "down" },
];

function RightPanel() {
  return (
    <aside style={{
      width: "300px", minWidth: "300px",
      background: "#0A0C10",
      borderLeft: "1px solid #1A1E2A",
      overflowY: "auto",
      flexShrink: 0,
    }}>
      {/* Pitcher Alerts */}
      <div style={{ borderBottom: "1px solid #1A1E2A" }}>
        <div style={{ padding: "16px 18px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#F5A623", boxShadow: "0 0 8px #F5A623", flexShrink: 0 }} />
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "0.85rem", fontWeight: 800, color: "#F5A623", textTransform: "uppercase", letterSpacing: "0.08em" }}>Pitcher Alerts</span>
        </div>
        {PITCHER_ALERTS.map(p => {
          const statusColor = p.status === "OUT" ? "#FF5555" : p.status === "IL" ? "#F5A623" : "#39FF14";
          const headshotUrl = getPlayerHeadshot(p.full, "mlb");
          const { initials, color } = getInitialsAvatar(p.full);
          return (
            <div key={p.name} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 18px", borderTop: "1px solid #1A1E2A" }}>
              {/* Player headshot */}
              <div style={{ width: 42, height: 42, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: "2px solid #2A2F3E", background: headshotUrl ? "#131110" : color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {headshotUrl
                  ? <img src={headshotUrl} alt={p.full} style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={e => { (e.currentTarget as HTMLElement).style.display = "none"; }}
                    />
                  : <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "14px", color: "#fff" }}>{initials}</span>
                }
              </div>
              {/* Team logo */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                  <img src={getTeamLogo(p.team, "mlb") ?? ""} alt={p.team} style={{ width: 16, height: 16, objectFit: "contain" }}
                    onError={e => { (e.currentTarget as HTMLElement).style.display = "none"; }}
                  />
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "0.95rem", fontWeight: 700, color: "#D8D8D8" }}>{p.name}</span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "#555A66", lineHeight: 1.3 }}>{p.detail}</div>
              </div>
              <span style={{
                fontSize: "0.65rem", fontWeight: 800, padding: "3px 7px", borderRadius: "3px",
                background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}44`,
                letterSpacing: "0.06em", flexShrink: 0,
              }}>{p.status}</span>
            </div>
          );
        })}
      </div>

      {/* Lineup Movement */}
      <div style={{ borderBottom: "1px solid #1A1E2A" }}>
        <div style={{ padding: "16px 18px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#39FF14", boxShadow: "0 0 8px #39FF14", flexShrink: 0 }} />
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "0.85rem", fontWeight: 800, color: "#39FF14", textTransform: "uppercase", letterSpacing: "0.08em" }}>Lineup Movement</span>
        </div>
        {LINEUP_MOVES.map(m => {
          const headshotUrl = getPlayerHeadshot(m.player, "mlb");
          const { initials, color } = getInitialsAvatar(m.player);
          return (
            <div key={m.player} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 18px", borderTop: "1px solid #1A1E2A" }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: "2px solid #2A2F3E", background: headshotUrl ? "#131110" : color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {headshotUrl
                  ? <img src={headshotUrl} alt={m.player} style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={e => { (e.currentTarget as HTMLElement).style.display = "none"; }}
                    />
                  : <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "12px", color: "#fff" }}>{initials}</span>
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "2px" }}>
                  <img src={getTeamLogo(m.team, "mlb") ?? ""} alt={m.team} style={{ width: 14, height: 14, objectFit: "contain" }}
                    onError={e => { (e.currentTarget as HTMLElement).style.display = "none"; }}
                  />
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "0.9rem", fontWeight: 700, color: "#D0D0D0" }}>{m.player}</span>
                </div>
                <div style={{ fontSize: "0.72rem", color: "#555A66" }}>{m.detail}</div>
              </div>
              {m.trend === "up"
                ? <TrendingUp size={15} style={{ color: "#39FF14", flexShrink: 0 }} />
                : <TrendingDown size={15} style={{ color: "#FF5555", flexShrink: 0 }} />
              }
            </div>
          );
        })}
      </div>

      {/* Team Trends */}
      <div>
        <div style={{ padding: "16px 18px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#4A9EFF", boxShadow: "0 0 8px #4A9EFF", flexShrink: 0 }} />
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "0.85rem", fontWeight: 800, color: "#4A9EFF", textTransform: "uppercase", letterSpacing: "0.08em" }}>Team Trends</span>
        </div>
        {TEAM_TRENDS.map(t => (
          <div key={t.team + t.trend} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 18px", borderTop: "1px solid #1A1E2A" }}>
            <TeamBadge teamName={t.team} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "0.88rem", fontWeight: 600, color: "#D0D0D0" }}>{t.trend}</div>
            </div>
            {t.dir === "up"
              ? <TrendingUp size={14} style={{ color: "#39FF14", flexShrink: 0 }} />
              : <TrendingDown size={14} style={{ color: "#FF5555", flexShrink: 0 }} />
            }
          </div>
        ))}
      </div>
    </aside>
  );
}

// ── Skeleton card for loading state ─────────────────────────────────────────
function SignalSkeleton({ isMobile }: { isMobile: boolean }) {
  const bg = "#1A1E2A";
  if (isMobile) {
    return (
      <div className="skeleton" style={{ borderBottom: "1px solid #1A1E2A" }}>
        <div style={{ padding: "12px 16px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <div style={{ width: 52, height: 18, background: bg, borderRadius: 3 }} />
            <div style={{ width: 40, height: 12, background: bg, borderRadius: 3 }} />
          </div>
          <div style={{ width: 130, height: 16, background: bg, borderRadius: 3, marginBottom: 6 }} />
          <div style={{ width: "100%", height: 14, background: bg, borderRadius: 3, marginBottom: 4 }} />
          <div style={{ width: "70%", height: 14, background: bg, borderRadius: 3, marginBottom: 10 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 60, height: 3, background: bg, borderRadius: 2 }} />
            <div style={{ width: 30, height: 12, background: bg, borderRadius: 2 }} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", minHeight: 44, borderTop: "1px solid #1A1E2A" }}>
          <div style={{ width: 60, height: 16, background: bg, borderRadius: 3 }} />
          <div style={{ width: 80, height: 16, background: bg, borderRadius: 3 }} />
        </div>
      </div>
    );
  }
  return (
    <div className="skeleton" style={{ borderBottom: "1px solid #1A1E2A", padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 48, height: 48, borderRadius: "50%", background: bg, flexShrink: 0 }} />
      <div style={{ width: 80, height: 18, background: bg, borderRadius: 3, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ width: "60%", height: 18, background: bg, borderRadius: 3, marginBottom: 6 }} />
        <div style={{ width: "30%", height: 12, background: bg, borderRadius: 3 }} />
      </div>
      <div style={{ width: 70, height: 18, background: bg, borderRadius: 3, flexShrink: 0 }} />
      <div style={{ width: 100, height: 12, background: bg, borderRadius: 3, flexShrink: 0 }} />
      <div style={{ width: 50, height: 12, background: bg, borderRadius: 3, flexShrink: 0 }} />
    </div>
  );
}

// ── Feed tabs ────────────────────────────────────────────────────────────────
const FEED_TABS = [
  { key: "today",     label: "Today",      icon: <Activity size={13} /> },
  { key: "pitchers",  label: "Pitchers",   icon: <User size={13} /> },
  { key: "lineup",    label: "Lineup",     icon: <TrendingUp size={13} /> },
  { key: "props",     label: "Props",      icon: <BarChart2 size={13} /> },
  { key: "trends",    label: "Trends",     icon: <TrendingUp size={13} /> },
  { key: "line_moves",label: "Line Moves", icon: <Zap size={13} /> },
];

const TAB_SIGNAL_TYPE: Record<string, string | null> = {
  today: null,
  pitchers: "injury",
  lineup: "lineup",
  props: "prop",
  trends: "trend",
  line_moves: "line_move",
};

// ── Main Board ───────────────────────────────────────────────────────────────
export default function MLBBoard() {
  const [activeGame, setActiveGame] = useState<number | null>(null);
  // FIX: mobile detection
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  // Use wouter's useSearch to reactively read ?tab= from URL
  const search = useSearch();
  const activeTab = useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get("tab") ?? "today";
  }, [search]);
  const setActiveTab = (tab: string) => {
    const url = tab === "today" ? "/mlb" : `/mlb?tab=${tab}`;
    window.history.pushState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  const { signals: data, loading: isLoading } = useMLBSignals([]);
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const checkout = { isPending: false };
  const handleUpgrade = () => {};

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    fetch("/api/v2/games?league=MLB")
      .then(r => r.json())
      .then(data => {
        const statusLabel: Record<string, string> = {
          live: "In Progress", final: "Final",
          scheduled: "Scheduled", postponed: "Postponed",
        };
        const adapted: LiveGame[] = (data.games ?? [])
          .filter((g: any) => g.game_time?.slice(0, 10) === today)
          .map((g: any) => ({
            id: g.id,
            sport: "mlb" as const,
            espnEventId: g.source_game_id ?? g.id,
            homeTeam: g.home_team ?? null,
            awayTeam: g.away_team ?? null,
            gameDate: g.game_time ? new Date(g.game_time) : null,
            statusDescription: statusLabel[g.status] ?? g.status ?? null,
            homeScore: g.home_score ?? null,
            awayScore: g.away_score ?? null,
            cachedAt: new Date(g.updated_at ?? g.created_at),
          }));
        setLiveGames(adapted);
      })
      .catch(() => setLiveGames([]))
      .finally(() => setGamesLoading(false));
  }, []);

  const allSignals: Signal[] = (data ?? []) as Signal[];

  // Count signals per team for game cards
  const signalCountByTeam = useMemo(() => {
    const counts: Record<string, number> = {};
    allSignals.forEach(s => {
      if (s.team) counts[s.team.toUpperCase()] = (counts[s.team.toUpperCase()] ?? 0) + 1;
    });
    return counts;
  }, [allSignals]);

  const filteredSignals = useMemo(() => {
    const typeFilter = TAB_SIGNAL_TYPE[activeTab];
    if (!typeFilter) return allSignals;
    return allSignals.filter(s => s.type === typeFilter);
  }, [allSignals, activeTab]);

  const PRO_THRESHOLD = 10;

  return (
    <AppShell>
      <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
        {/* ── Main content ── */}
        <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>

          {/* Board header */}
          <div style={{
            padding: "20px 24px 0",
            borderBottom: "1px solid #1A1E2A",
            background: "linear-gradient(180deg, rgba(57,255,20,0.04) 0%, transparent 100%)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
              <h1 style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: "1.6rem", fontWeight: 900,
                color: "#F0F0F0", letterSpacing: "0.02em", margin: 0,
              }}>MLB Intelligence Board</h1>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: "5px",
                padding: "3px 10px", borderRadius: "20px",
                background: "rgba(57,255,20,0.1)", border: "1px solid rgba(57,255,20,0.25)",
                fontSize: "0.65rem", fontWeight: 800, color: "#39FF14",
                textTransform: "uppercase", letterSpacing: "0.08em",
              }}>
                <span className="live-dot" style={{ width: "5px", height: "5px" }} />
                ACTIVE
              </span>
              <div style={{ flex: 1 }} />
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: "1.4rem", fontWeight: 700, color: "#F5A623", lineHeight: 1 }}>{allSignals.length}</div>
                <div style={{ fontSize: "0.6rem", color: "#3A3F4E", textTransform: "uppercase", letterSpacing: "0.06em" }}>SIGNALS</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: "1.4rem", fontWeight: 700, color: "#39FF14", lineHeight: 1 }}>{allSignals.filter(s => s.verdict === "confirmed").length}</div>
                <div style={{ fontSize: "0.6rem", color: "#3A3F4E", textTransform: "uppercase", letterSpacing: "0.06em" }}>CONFIRMED</div>
              </div>
            </div>
            <div style={{ fontSize: "0.78rem", color: "#555A66", marginBottom: "16px" }}>
              Live · {allSignals.length} signals · Updated continuously
            </div>

            {/* Track record */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <Shield size={13} style={{ color: "#3A3F4E" }} />
              <span style={{ fontSize: "0.72rem", color: "#3A3F4E" }}>TRACK RECORD</span>
              <ChevronRight size={12} style={{ color: "#3A3F4E" }} />
              <span style={{ fontSize: "0.72rem", color: "#555A66" }}>No settled outcomes yet.</span>
            </div>

            {/* Today's Games */}
            <div id="games-section" style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#F5A623", flexShrink: 0 }} />
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "0.72rem", fontWeight: 800, color: "#F5A623", textTransform: "uppercase", letterSpacing: "0.1em" }}>Today's Games</span>
              </div>
              <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "4px" }}>
                {gamesLoading ? (
                  [...Array(4)].map((_, i) => (
                    <div key={i} style={{ minWidth: "200px", height: "160px", background: "#131110", borderRadius: "10px", opacity: 0.3 + i * 0.1 }} />
                  ))
                ) : liveGames.length === 0 ? (
                  <div style={{ padding: "20px", color: "#555A66", fontSize: "0.85rem" }}>No games scheduled today.</div>
                ) : (
                  liveGames.map(game => {
                    const away = (game.awayTeam ?? "");
                    const home = (game.homeTeam ?? "");
                    const cnt = (signalCountByTeam[away] ?? 0) + (signalCountByTeam[home] ?? 0);
                    return (
                      <GameCard
                        key={game.id}
                        game={game}
                        active={activeGame === game.id}
                        onClick={() => setActiveGame(activeGame === game.id ? null : game.id)}
                        signalCount={cnt}
                      />
                    );
                  })
                )}
              </div>
            </div>

          </div>

          <BoardHeader
            league="MLB"
            totalSignals={allSignals.length}
            liveCount={liveGames.filter(g => g.statusDescription?.toLowerCase().includes("in progress")).length}
            filters={FEED_TABS.map(t => t.label)}
            activeFilter={FEED_TABS.find(t => t.key === activeTab)?.label ?? "Today"}
            onFilterChange={label => {
              const tab = FEED_TABS.find(t => t.label === label);
              if (tab) setActiveTab(tab.key);
            }}
          />

          {/* Signal feed */}
          <div id="signal-feed">
            {/* Pro lock banner */}
            {allSignals.length > PRO_THRESHOLD && (
              <div style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "10px 16px",
                background: "rgba(245,166,35,0.04)",
                borderBottom: "1px solid #1A1E2A",
              }}>
                <Lock size={13} style={{ color: "#F5A623" }} />
                <span style={{ fontSize: "0.78rem", color: "#8A9099" }}>
                  <strong style={{ color: "#F5A623" }}>{Math.max(0, filteredSignals.length - PRO_THRESHOLD)} signals locked</strong> — Pro members see the full feed
                </span>
                <div style={{ flex: 1 }} />
                <button className="btn-gold" onClick={handleUpgrade} disabled={checkout.isPending} style={{ padding: "5px 14px", fontSize: "0.72rem" }}>{checkout.isPending ? "Loading…" : "UNLOCK PRO"}</button>
              </div>
            )}

            {/* FIX: Table header hidden on mobile */}
            {!isMobile && (
              <div style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "8px 16px",
                borderBottom: "1px solid #1A1E2A",
                background: "#0A0C10",
              }}>
                <div style={{ width: "48px" }} />
                <div style={{ minWidth: "90px", fontSize: "0.65rem", fontWeight: 700, color: "#3A3F4E", textTransform: "uppercase", letterSpacing: "0.08em" }}>TYPE</div>
                <div style={{ flex: 1, fontSize: "0.65rem", fontWeight: 700, color: "#3A3F4E", textTransform: "uppercase", letterSpacing: "0.08em" }}>SIGNAL</div>
                <div style={{ minWidth: "100px", textAlign: "right", fontSize: "0.65rem", fontWeight: 700, color: "#3A3F4E", textTransform: "uppercase", letterSpacing: "0.08em" }}>VERDICT</div>
                <div style={{ minWidth: "110px", fontSize: "0.65rem", fontWeight: 700, color: "#3A3F4E", textTransform: "uppercase", letterSpacing: "0.08em" }}>CONF</div>
                <div style={{ minWidth: "70px", textAlign: "right", fontSize: "0.65rem", fontWeight: 700, color: "#3A3F4E", textTransform: "uppercase", letterSpacing: "0.08em" }}>TIME</div>
              </div>
            )}

            {isLoading ? (
              [...Array(5)].map((_, i) => <SignalSkeleton key={i} isMobile={isMobile} />)
            ) : filteredSignals.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 24px" }}>
                <Activity size={40} style={{ color: "#1A1714", margin: "0 auto 12px" }} />
                <p style={{ color: "#555A66", fontSize: "0.9rem" }}>No {activeTab} signals yet. Agents are collecting data.</p>
              </div>
            ) : (
              // FIX: pass isMobile to SignalRow
              filteredSignals.map((signal, idx) => (
                <SignalRow
                  key={signal.id}
                  signal={signal}
                  isPro={idx >= PRO_THRESHOLD}
                  userIsPro={false}
                  isMobile={isMobile}
                />
              ))
            )}
          </div>
        </div>
        {!isMobile && <RightPanel />}
      </div>
    </AppShell>
  );
}
