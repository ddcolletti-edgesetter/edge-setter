import { useState, useMemo, useEffect } from "react";
import { V2Shell } from "@/components/V2Shell";
import { getTeamLogo, getPlayerHeadshot, getInitialsAvatar } from "@/lib/espnAssets";
import {
  Activity, BarChart2, Bell, BellOff, ChevronRight,
  Lock, Shield, TrendingUp, TrendingDown, User, Zap,
} from "lucide-react";

function timeAgo(ts: Date | string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function confColor(score: number) {
  if (score >= 80) return "#39FF14";
  if (score >= 60) return "#F5A623";
  return "#FF5555";
}

const NBA_COLORS: Record<string, [string, string]> = {
  BOS: ["#007A33", "#FFFFFF"], BKN: ["#000000", "#FFFFFF"],
  NYK: ["#006BB6", "#F58426"], PHI: ["#006BB6", "#ED174C"],
  TOR: ["#CE1141", "#FFFFFF"], CHI: ["#CE1141", "#000000"],
  CLE: ["#860038", "#FDBB30"], DET: ["#C8102E", "#1D42BA"],
  IND: ["#002D62", "#FDBB30"], MIL: ["#00471B", "#EEE1C6"],
  ATL: ["#E03A3E", "#C1D32F"], CHA: ["#1D1160", "#00788C"],
  MIA: ["#98002E", "#F9A01B"], ORL: ["#0077C0", "#C4CED4"],
  WAS: ["#002B5C", "#E31837"], DEN: ["#0E2240", "#FEC524"],
  MIN: ["#0C2340", "#236192"], OKC: ["#007AC1", "#EF3B24"],
  POR: ["#E03A3E", "#000000"], UTA: ["#002B5C", "#00471B"],
  GSW: ["#1D428A", "#FFC72C"], LAC: ["#C8102E", "#1D428A"],
  LAL: ["#552583", "#FDB927"], PHX: ["#1D1160", "#E56020"],
  SAC: ["#5A2D81", "#63727A"], DAL: ["#00538C", "#002B5C"],
  HOU: ["#CE1141", "#000000"], MEM: ["#5D76A9", "#12173F"],
  NOP: ["#0C2340", "#C8102E"], SAS: ["#C4CED4", "#000000"],
};
function getTeamColors(abbr: string | null): [string, string] {
  if (!abbr) return ["#1A1E2A", "#8A9099"];
  return NBA_COLORS[abbr.toUpperCase()] ?? ["#1A1E2A", "#8A9099"];
}

const NBA_NAME_ABBR: Record<string, string> = {
  "atlanta hawks": "ATL", "boston celtics": "BOS", "brooklyn nets": "BKN",
  "charlotte hornets": "CHA", "chicago bulls": "CHI", "cleveland cavaliers": "CLE",
  "dallas mavericks": "DAL", "denver nuggets": "DEN", "detroit pistons": "DET",
  "golden state warriors": "GSW", "houston rockets": "HOU", "indiana pacers": "IND",
  "los angeles clippers": "LAC", "los angeles lakers": "LAL", "memphis grizzlies": "MEM",
  "miami heat": "MIA", "milwaukee bucks": "MIL", "minnesota timberwolves": "MIN",
  "new orleans pelicans": "NOP", "new york knicks": "NYK", "oklahoma city thunder": "OKC",
  "orlando magic": "ORL", "philadelphia 76ers": "PHI", "phoenix suns": "PHX",
  "portland trail blazers": "POR", "sacramento kings": "SAC", "san antonio spurs": "SAS",
  "toronto raptors": "TOR", "utah jazz": "UTA", "washington wizards": "WAS",
};
function getTeamAbbr(fullName: string): string {
  return NBA_NAME_ABBR[fullName.toLowerCase().trim()] ?? fullName.toUpperCase().slice(0, 3);
}

function PlayerAvatar({ name, size = 48 }: { name: string; size?: number }) {
  const headshotUrl = getPlayerHeadshot(name, "nba");
  const { initials, color } = getInitialsAvatar(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      overflow: "hidden", border: "2px solid #2A2F3E",
      background: headshotUrl ? "#111318" : color,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {headshotUrl ? (
        <img src={headshotUrl} alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={e => {
            const el = e.currentTarget; el.style.display = "none";
            const p = el.parentElement!;
            p.style.background = color;
            p.innerHTML = `<span style="font-family:'Bebas Neue',sans-serif;font-weight:800;font-size:${Math.round(size * 0.34)}px;color:#fff">${initials}</span>`;
          }}
        />
      ) : (
        <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontWeight: 800, fontSize: size * 0.34, color: "#fff" }}>{initials || "?"}</span>
      )}
    </div>
  );
}

function TeamBadge({ teamName, size = 44 }: { teamName: string; size?: number }) {
  const logoUrl = getTeamLogo(teamName, "nba");
  const abbr = getTeamAbbr(teamName);
  const colorAbbr = NBA_NAME_ABBR[teamName.toLowerCase().trim()] ?? teamName.toUpperCase().slice(0, 3);
  const [bg, text] = getTeamColors(colorAbbr);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `${bg}22`, border: `2px solid ${bg}55`,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, overflow: "hidden", padding: "4px",
    }}>
      {logoUrl ? (
        <img src={logoUrl} alt={abbr}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          onError={e => {
            const el = e.currentTarget; el.style.display = "none";
            const p = el.parentElement!;
            p.style.cssText += `background:${bg};display:flex;align-items:center;justify-content:center;`;
            p.innerHTML = `<span style="font-family:'Bebas Neue',sans-serif;font-weight:900;font-size:${Math.round(size * 0.3)}px;color:${text}">${abbr}</span>`;
          }}
        />
      ) : (
        <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontWeight: 900, fontSize: size * 0.3, color: text }}>{abbr}</span>
      )}
    </div>
  );
}

function ConfBar({ score }: { score: number | null }) {
  const pct = score ?? 50;
  const color = confColor(pct);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div style={{ width: "60px", height: "3px", background: "#1A1E2A", borderRadius: "2px", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "2px" }} />
      </div>
      <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: "0.7rem", color, minWidth: "28px" }}>{pct}%</span>
    </div>
  );
}

function VerdictBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const map: Record<string, [string, string]> = {
    verified:    ["#39FF14", "rgba(57,255,20,0.12)"],
    confirmed:   ["#39FF14", "rgba(57,255,20,0.12)"],
    official:    ["#F5A623", "rgba(245,166,35,0.12)"],
    developing:  ["#F5A623", "rgba(245,166,35,0.12)"],
    unconfirmed: ["#8A9099", "rgba(138,144,153,0.12)"],
  };
  const [color, bg] = map[status.toLowerCase()] ?? ["#8A9099", "rgba(138,144,153,0.12)"];
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: "4px",
      fontSize: "0.65rem", fontWeight: 800, textTransform: "uppercase",
      letterSpacing: "0.08em", color, background: bg, border: `1px solid ${color}44`,
    }}>{status}</span>
  );
}

type LiveGame = {
  id: string | number;
  homeTeam?: string | null; awayTeam?: string | null;
  home?: string | null; away?: string | null;
  homeName?: string | null; awayName?: string | null;
  gameDate?: string | null; statusDescription?: string | null; status: string | null;
  homeScore: number | null; awayScore: number | null; time: string | null;
  period?: string | null;
};

function formatGameTime(g: LiveGame): string {
  const s = (g.statusDescription ?? g.status ?? "").toUpperCase();
  if (s === "FINAL") return "FINAL";
  if (s === "LIVE") return g.period ? `LIVE · ${g.period}` : "LIVE";
  return g.time ?? "TBD";
}

function GameCard({ game, active, onClick, signalCount }: {
  game: any; active: boolean; onClick: () => void; signalCount?: number;
}) {
  const awayFull = game.awayTeam ?? game.away ?? game.awayName ?? "TBD";
  const homeFull = game.homeTeam ?? game.home ?? game.homeName ?? "TBD";
  const away = getTeamAbbr(awayFull);
  const home = getTeamAbbr(homeFull);
  const [awayBg] = getTeamColors(away);
  const [homeBg] = getTeamColors(home);
  const awayLogoUrl = `/api/img-proxy?url=${encodeURIComponent('https://a.espncdn.com/i/teamlogos/nba/500/' + away.toLowerCase() + '.png')}`;
  const homeLogoUrl = `/api/img-proxy?url=${encodeURIComponent('https://a.espncdn.com/i/teamlogos/nba/500/' + home.toLowerCase() + '.png')}`;
  const status = game.statusDescription ?? game.status ?? "";
  const isLive = status.toUpperCase() === "LIVE" || status.toLowerCase().includes("in progress");
  return (
    <div onClick={onClick} style={{
      minWidth: "200px", maxWidth: "220px",
      background: active ? "#1A1E2A" : "#111318",
      border: `1px solid ${active ? "#F5A623" : "#1A1E2A"}`,
      borderRadius: "10px", overflow: "hidden",
      cursor: "pointer", flexShrink: 0, transition: "all 0.15s ease",
    }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = "#2A2F3E"; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = "#1A1E2A"; }}
    >
      <div style={{ height: "3px", background: `linear-gradient(90deg, ${awayBg}, ${homeBg})` }} />
      <div style={{ padding: "14px 16px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
            <img src={awayLogoUrl} alt={away} style={{ width: 48, height: 48, objectFit: "contain" }} />
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.05rem", fontWeight: 900, color: "#E0E0E0" }}>{away}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
            <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: "0.8rem", color: "#3A3F4E", fontWeight: 700 }}>@</span>
            {isLive && <span style={{ fontSize: "0.55rem", fontWeight: 800, color: "#39FF14", textTransform: "uppercase" }}>LIVE</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
            <img src={homeLogoUrl} alt={home} style={{ width: 48, height: 48, objectFit: "contain" }} />
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.05rem", fontWeight: 900, color: "#E0E0E0" }}>{home}</span>
          </div>
        </div>
      </div>
      {(game.homeScore !== null || game.awayScore !== null) && (
        <div style={{ padding: "0 16px 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: "1.1rem", fontWeight: 700, color: "#F5A623" }}>{game.awayScore ?? "-"}</span>
          <span style={{ fontSize: "0.6rem", color: "#555A66" }}>SCORE</span>
          <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: "1.1rem", fontWeight: 700, color: "#F5A623" }}>{game.homeScore ?? "-"}</span>
        </div>
      )}
      <div style={{ padding: "0 16px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
        {[{ label: "STATUS", val: status || "Scheduled" }, { label: "TIME", val: formatGameTime(game) }].map(s => (
          <div key={s.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "0.58rem", color: "#3A3F4E", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "3px" }}>{s.label}</div>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: "0.7rem", color: "#8A9099", lineHeight: 1.2 }}>{s.val}</div>
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid #1A1E2A", padding: "8px 16px", display: "flex", alignItems: "center", gap: "6px" }}>
        <Zap size={12} style={{ color: "#F5A623" }} />
        <span style={{ fontSize: "0.78rem", color: "#F5A623", fontWeight: 700 }}>{signalCount ?? 0} signals</span>
      </div>
    </div>
  );
}

type Signal = {
  id: string | number;
  title?: string | null; headline?: string | null;
  summary?: string | null; body?: string | null;
  playerName?: string | null; player_name?: string | null; player?: string | null;
  teamName?: string | null; team_name?: string | null; team?: string | null;
  signalType?: string; signal_type?: string; type?: string;
  confidenceScore?: number | null; confidence?: number | null;
  statusTag?: string | null; status?: string | null; verdict?: string | null;
  actionTakeaway?: string | null; action_takeaway?: string | null; action_note?: string | null;
  publishedAt?: string | Date; created_at?: string | Date; published_at?: string | Date; signal_time?: string | Date;
};

function normalizeSignal(s: Signal) {
  return {
    id: s.id,
    title: s.title ?? s.headline ?? "",
    summary: s.summary ?? s.body ?? null,
    playerName: s.playerName ?? s.player_name ?? s.player ?? null,
    teamName: s.teamName ?? s.team_name ?? s.team ?? null,
    signalType: s.signalType ?? s.signal_type ?? s.type ?? "signal",
    confidenceScore: s.confidenceScore ?? s.confidence ?? null,
    statusTag: s.statusTag ?? s.verdict ?? s.status ?? null,
    actionTakeaway: s.actionTakeaway ?? s.action_takeaway ?? s.action_note ?? null,
    publishedAt: s.publishedAt ?? s.signal_time ?? s.created_at ?? s.published_at ?? new Date(),
  };
}

function SignalRow({ signal: raw, isPro = false }: { signal: Signal; isPro?: boolean }) {
  const signal = normalizeSignal(raw);
  const [expanded, setExpanded] = useState(false);
  const t = signal.signalType.toLowerCase();
  const typeColors: Record<string, { bg: string; color: string; border: string }> = {
    injury:        { bg: "rgba(255,85,85,0.1)",   color: "#FF5555", border: "rgba(255,85,85,0.25)" },
    injury_update: { bg: "rgba(255,85,85,0.1)",   color: "#FF5555", border: "rgba(255,85,85,0.25)" },
    lineup:        { bg: "rgba(74,158,255,0.1)",  color: "#4A9EFF", border: "rgba(74,158,255,0.25)" },
    lineup_change: { bg: "rgba(74,158,255,0.1)",  color: "#4A9EFF", border: "rgba(74,158,255,0.25)" },
    line_move:     { bg: "rgba(176,110,255,0.1)", color: "#B06EFF", border: "rgba(176,110,255,0.25)" },
    line_moves:    { bg: "rgba(176,110,255,0.1)", color: "#B06EFF", border: "rgba(176,110,255,0.25)" },
    trade:         { bg: "rgba(245,166,35,0.1)",  color: "#F5A623", border: "rgba(245,166,35,0.25)" },
    props:         { bg: "rgba(57,255,20,0.08)",  color: "#39FF14", border: "rgba(57,255,20,0.2)" },
  };
  const c = typeColors[t] ?? { bg: "rgba(245,166,35,0.08)", color: "#F5A623", border: "rgba(245,166,35,0.2)" };
  return (
    <div onClick={() => !isPro && setExpanded(e => !e)}
      style={{ borderBottom: "1px solid #1A1E2A", cursor: isPro ? "default" : "pointer", position: "relative" }}
      onMouseEnter={e => { if (!isPro) (e.currentTarget as HTMLElement).style.background = "#111318"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {isPro && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(10,12,16,0.7)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "16px", zIndex: 2 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "5px", background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.3)", fontSize: "0.7rem", fontWeight: 800, color: "#F5A623", textTransform: "uppercase" }}>
            <Lock size={10} /> PRO
          </span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px" }}>
        {signal.playerName
          ? <PlayerAvatar name={signal.playerName} size={48} />
          : <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#1A1E2A", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Activity size={18} style={{ color: "#3A3F4E" }} /></div>
        }
        <div style={{ minWidth: "90px" }}>
          <span style={{ fontSize: "0.65rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", padding: "3px 8px", borderRadius: "3px", background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>{signal.signalType.replace(/_/g, " ")}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.15rem", fontWeight: 700, color: isPro ? "#3A3F4E" : "#E8E8E8", lineHeight: 1.3, marginBottom: "5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: expanded ? "normal" : "nowrap" }}>{signal.title}</div>
          {signal.playerName && <div style={{ fontSize: "0.72rem", color: "#555A66" }}>{signal.playerName}{signal.teamName ? ` · ${signal.teamName}` : ""}</div>}
        </div>
        <div style={{ minWidth: "90px", textAlign: "right" }}><VerdictBadge status={signal.statusTag} /></div>
        <div style={{ minWidth: "100px" }}><ConfBar score={signal.confidenceScore} /></div>
        <div style={{ minWidth: "60px", textAlign: "right" }}>
          <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: "0.65rem", color: "#3A3F4E" }}>{timeAgo(signal.publishedAt)}</span>
        </div>
      </div>
      {expanded && !isPro && signal.summary && (
        <div style={{ padding: "0 16px 14px 80px", borderTop: "1px solid #1A1E2A" }}>
          <p style={{ color: "#8A9099", fontSize: "0.85rem", lineHeight: 1.6, margin: "10px 0 8px" }}>{signal.summary}</p>
          {signal.actionTakeaway && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "6px 12px", borderRadius: "6px", background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.15)" }}>
              <Zap size={11} style={{ color: "#F5A623" }} />
              <span style={{ fontSize: "0.8rem", color: "#F5A623" }}>{signal.actionTakeaway}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const INJURY_ALERTS = [
  { name: "LeBron James",   full: "LeBron James",         team: "LAL", detail: "Questionable — ankle", status: "Q"   },
  { name: "Joel Embiid",    full: "Joel Embiid",           team: "PHI", detail: "OUT — knee",           status: "OUT" },
  { name: "Steph Curry",    full: "Stephen Curry",         team: "GSW", detail: "Confirmed starter",    status: "OK"  },
  { name: "Giannis A.",     full: "Giannis Antetokounmpo", team: "MIL", detail: "Full practice",        status: "OK"  },
];
const LINEUP_MOVES = [
  { player: "Anthony Davis",     team: "LAL", detail: "Starting center confirmed", trend: "up"   },
  { player: "Jaylen Brown",      team: "BOS", detail: "Moved to 2nd unit",         trend: "down" },
  { player: "Nikola Jokic",      team: "DEN", detail: "Cleared to play",           trend: "up"   },
  { player: "Tyrese Haliburton", team: "IND", detail: "Upgraded to probable",      trend: "up"   },
];
const TEAM_TRENDS = [
  { team: "BOS", trend: "12-3 home this month", dir: "up"   },
  { team: "DEN", trend: "8-2 ATS last 10",      dir: "up"   },
  { team: "LAL", trend: "4-8 road games",       dir: "down" },
  { team: "MIL", trend: "6-1 last 7 at home",  dir: "up"   },
  { team: "GSW", trend: "3-7 last 10",          dir: "down" },
];

function RightPanel() {
  return (
    <aside style={{ width: "300px", minWidth: "300px", background: "#0A0C10", borderLeft: "1px solid #1A1E2A", overflowY: "auto", flexShrink: 0 }}>
      <div style={{ borderBottom: "1px solid #1A1E2A" }}>
        <div style={{ padding: "16px 18px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#F5A623", boxShadow: "0 0 8px #F5A623", flexShrink: 0 }} />
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "0.85rem", fontWeight: 800, color: "#F5A623", textTransform: "uppercase", letterSpacing: "0.08em" }}>Injury Report</span>
        </div>
        {INJURY_ALERTS.map(p => {
          const statusColor = p.status === "OUT" ? "#FF5555" : p.status === "Q" ? "#F5A623" : "#39FF14";
          return (
            <div key={p.name} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 18px", borderTop: "1px solid #1A1E2A" }}>
              <PlayerAvatar name={p.full} size={42} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                  <img src={getTeamLogo(p.team, "nba") ?? ""} alt={p.team} style={{ width: 16, height: 16, objectFit: "contain" }} onError={e => { (e.currentTarget as HTMLElement).style.display = "none"; }} />
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "0.95rem", fontWeight: 700, color: "#D8D8D8" }}>{p.name}</span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "#555A66" }}>{p.detail}</div>
              </div>
              <span style={{ fontSize: "0.65rem", fontWeight: 800, padding: "3px 7px", borderRadius: "3px", background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}44`, flexShrink: 0 }}>{p.status}</span>
            </div>
          );
        })}
      </div>

      <div style={{ borderBottom: "1px solid #1A1E2A" }}>
        <div style={{ padding: "16px 18px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#39FF14", boxShadow: "0 0 8px #39FF14", flexShrink: 0 }} />
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "0.85rem", fontWeight: 800, color: "#39FF14", textTransform: "uppercase", letterSpacing: "0.08em" }}>Lineup Movement</span>
        </div>
        {LINEUP_MOVES.map(m => (
          <div key={m.player} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 18px", borderTop: "1px solid #1A1E2A" }}>
            <PlayerAvatar name={m.player} size={38} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "2px" }}>
                <img src={getTeamLogo(m.team, "nba") ?? ""} alt={m.team} style={{ width: 14, height: 14, objectFit: "contain" }} onError={e => { (e.currentTarget as HTMLElement).style.display = "none"; }} />
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "0.9rem", fontWeight: 700, color: "#D0D0D0" }}>{m.player}</span>
              </div>
              <div style={{ fontSize: "0.72rem", color: "#555A66" }}>{m.detail}</div>
            </div>
            {m.trend === "up" ? <TrendingUp size={15} style={{ color: "#39FF14", flexShrink: 0 }} /> : <TrendingDown size={15} style={{ color: "#FF5555", flexShrink: 0 }} />}
          </div>
        ))}
      </div>

      <div>
        <div style={{ padding: "16px 18px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4A9EFF", boxShadow: "0 0 8px #4A9EFF", flexShrink: 0 }} />
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "0.85rem", fontWeight: 800, color: "#4A9EFF", textTransform: "uppercase", letterSpacing: "0.08em" }}>Team Trends</span>
        </div>
        {TEAM_TRENDS.map(t => (
          <div key={t.team + t.trend} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 18px", borderTop: "1px solid #1A1E2A" }}>
            <TeamBadge teamName={t.team} size={36} />
            <div style={{ flex: 1 }}><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "0.88rem", fontWeight: 600, color: "#D0D0D0" }}>{t.trend}</div></div>
            {t.dir === "up" ? <TrendingUp size={14} style={{ color: "#39FF14", flexShrink: 0 }} /> : <TrendingDown size={14} style={{ color: "#FF5555", flexShrink: 0 }} />}
          </div>
        ))}
      </div>
    </aside>
  );
}

const FEED_TABS = [
  { key: "today",      label: "Today",      icon: <Activity size={13} /> },
  { key: "injuries",   label: "Injuries",   icon: <User size={13} /> },
  { key: "lineup",     label: "Lineup",     icon: <TrendingUp size={13} /> },
  { key: "props",      label: "Props",      icon: <BarChart2 size={13} /> },
  { key: "trends",     label: "Trends",     icon: <TrendingUp size={13} /> },
  { key: "line_moves", label: "Line Moves", icon: <Zap size={13} /> },
];

const TAB_FILTER: Record<string, string | null> = {
  today: null, injuries: "injury_update", lineup: "lineup_change",
  props: "prop_alert", trends: "team_trend", line_moves: "line_move",
};

export default function NBABoard() {
  const [activeGame, setActiveGame] = useState<string | number | null>(null);
  const [activeTab, setActiveTab] = useState("today");
  const [allSignals, setAllSignals] = useState<Signal[]>([]);
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v2/signals?sport=nba&limit=100")
      .then(r => r.json())
      .then(d => setAllSignals(Array.isArray(d) ? d : d.signals ?? []))
      .catch(() => setAllSignals([]));
    fetch("/api/nba/scoreboard")
      .then(r => r.json())
      .then(d => setLiveGames(Array.isArray(d) ? d : d.games ?? []))
      .catch(() => setLiveGames([]))
      .finally(() => setLoading(false));
  }, []);

  const filteredSignals = useMemo(() => {
    const f = TAB_FILTER[activeTab];
    if (!f) return allSignals;
    return allSignals.filter(s => {
      const t = (s.signalType ?? s.signal_type ?? s.type ?? "").toLowerCase();
      return t.includes(f) || t === f;
    });
  }, [allSignals, activeTab]);

  const signalCountByTeam = useMemo(() => {
    const counts: Record<string, number> = {};
    allSignals.forEach(s => {
      const t = (s.teamName ?? s.team_name ?? s.team ?? "").toUpperCase();
      if (t) counts[t] = (counts[t] ?? 0) + 1;
    });
    return counts;
  }, [allSignals]);

  const PRO_THRESHOLD = 10;
  const confirmed = allSignals.filter(s => {
    const st = (s.statusTag ?? s.status ?? "").toLowerCase();
    return st === "verified" || st === "confirmed";
  }).length;

  return (
    <V2Shell sport="NBA">
      <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
        <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>

          <div style={{ padding: "20px 24px 0", borderBottom: "1px solid #1A1E2A", background: "linear-gradient(180deg, rgba(245,166,35,0.04) 0%, transparent 100%)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
              <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.8rem", color: "#F0F0F0", letterSpacing: "0.04em", margin: 0 }}>NBA INTELLIGENCE BOARD</h1>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 10px", borderRadius: "20px", background: "rgba(232,124,42,0.1)", border: "1px solid rgba(232,124,42,0.25)", fontSize: "0.65rem", fontWeight: 800, color: "#E87C2A", textTransform: "uppercase" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#E87C2A", display: "inline-block" }} /> LIVE
              </span>
              <div style={{ flex: 1 }} />
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: "1.4rem", fontWeight: 700, color: "#F5A623", lineHeight: 1 }}>{allSignals.length}</div>
                <div style={{ fontSize: "0.6rem", color: "#3A3F4E", textTransform: "uppercase" }}>SIGNALS</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: "1.4rem", fontWeight: 700, color: "#39FF14", lineHeight: 1 }}>{confirmed}</div>
                <div style={{ fontSize: "0.6rem", color: "#3A3F4E", textTransform: "uppercase" }}>CONFIRMED</div>
              </div>
            </div>
            <div style={{ fontSize: "0.78rem", color: "#555A66", marginBottom: "16px" }}>Live · {allSignals.length} signals · Updated continuously</div>

            <div id="games-section" style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#F5A623", flexShrink: 0 }} />
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "0.72rem", fontWeight: 800, color: "#F5A623", textTransform: "uppercase", letterSpacing: "0.1em" }}>Tonight's Games</span>
              </div>
              <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "4px" }}>
                {loading ? (
                  [...Array(4)].map((_, i) => <div key={i} style={{ minWidth: "200px", height: "160px", background: "#111318", borderRadius: "10px", opacity: 0.3 + i * 0.1 }} />)
                ) : liveGames.length === 0 ? (
                  <div style={{ padding: "20px", color: "#555A66", fontSize: "0.85rem" }}>No games scheduled today.</div>
                ) : (
                  liveGames.map((game, i) => {
                    const away = (game.awayTeam ?? "").toUpperCase();
                    const home = (game.homeTeam ?? "").toUpperCase();
                    const cnt = (signalCountByTeam[away] ?? 0) + (signalCountByTeam[home] ?? 0);
                    return (
                      <GameCard key={game.id ?? i} game={game}
                        active={activeGame === (game.id ?? i)}
                        onClick={() => setActiveGame(activeGame === (game.id ?? i) ? null : (game.id ?? i))}
                        signalCount={cnt}
                      />
                    );
                  })
                )}
              </div>
            </div>

            <div id="signal-feed" style={{ display: "flex", gap: "2px" }}>
              {FEED_TABS.map(tab => {
                const isActive = activeTab === tab.key;
                return (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                    display: "inline-flex", alignItems: "center", gap: "6px", padding: "9px 16px",
                    fontFamily: "'Bebas Neue',sans-serif", fontSize: "0.85rem", fontWeight: 700,
                    letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer",
                    background: "transparent", color: isActive ? "#F0F0F0" : "#555A66",
                    border: "none", borderBottom: `2px solid ${isActive ? "#E87C2A" : "transparent"}`,
                    transition: "all 0.15s ease",
                  }}>
                    {tab.icon} {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            {allSignals.length > PRO_THRESHOLD && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px", background: "rgba(245,166,35,0.04)", borderBottom: "1px solid #1A1E2A" }}>
                <Lock size={13} style={{ color: "#F5A623" }} />
                <span style={{ fontSize: "0.78rem", color: "#8A9099" }}>
                  <strong style={{ color: "#F5A623" }}>{Math.max(0, filteredSignals.length - PRO_THRESHOLD)} signals locked</strong> — Pro members see the full feed
                </span>
                <div style={{ flex: 1 }} />
                <button onClick={() => window.location.href = "/#/pro"} style={{ padding: "5px 14px", fontSize: "0.72rem", fontFamily: "'Bebas Neue',sans-serif", fontWeight: 800, background: "#C4A24A", color: "#0C0B09", border: "none", borderRadius: "4px", cursor: "pointer" }}>UNLOCK PRO</button>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 16px", borderBottom: "1px solid #1A1E2A", background: "#0A0C10" }}>
              <div style={{ width: "36px" }} />
              <div style={{ minWidth: "80px", fontSize: "0.62rem", fontWeight: 700, color: "#3A3F4E", textTransform: "uppercase", letterSpacing: "0.08em" }}>TYPE</div>
              <div style={{ flex: 1, fontSize: "0.62rem", fontWeight: 700, color: "#3A3F4E", textTransform: "uppercase", letterSpacing: "0.08em" }}>SIGNAL</div>
              <div style={{ minWidth: "90px", textAlign: "right", fontSize: "0.62rem", fontWeight: 700, color: "#3A3F4E", textTransform: "uppercase", letterSpacing: "0.08em" }}>VERDICT</div>
              <div style={{ minWidth: "100px", fontSize: "0.62rem", fontWeight: 700, color: "#3A3F4E", textTransform: "uppercase", letterSpacing: "0.08em" }}>CONF</div>
              <div style={{ minWidth: "60px", textAlign: "right", fontSize: "0.62rem", fontWeight: 700, color: "#3A3F4E", textTransform: "uppercase", letterSpacing: "0.08em" }}>TIME</div>
            </div>

            {loading ? (
              <div style={{ padding: "40px 24px" }}>
                {[...Array(8)].map((_, i) => <div key={i} style={{ height: "60px", background: "#111318", borderRadius: "4px", marginBottom: "4px", opacity: 0.3 + i * 0.05 }} />)}
              </div>
            ) : filteredSignals.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 24px" }}>
                <Activity size={40} style={{ color: "#1A1E2A", margin: "0 auto 12px" }} />
                <p style={{ color: "#555A66", fontSize: "0.9rem" }}>No {activeTab} signals yet.</p>
              </div>
            ) : (
              filteredSignals.map((signal, idx) => (
                <SignalRow key={signal.id} signal={signal} isPro={idx >= PRO_THRESHOLD} />
              ))
            )}
          </div>
        </div>
        <RightPanel />
      </div>
    </V2Shell>
  );
}
