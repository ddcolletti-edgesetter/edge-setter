import { useState } from "react";
import V2Shell, { SportBadge, useShellTheme } from "../components/V2Shell";
import { MLB_SIGNALS, type V2Signal } from "../data/v2MockData";
import {
  PlayerHeadshot, TeamLogoImg,
  MatchupCard, IntelCard,
  VerdictBadge, TypeChip, ConfidenceBar,
  T, VERDICT_COLORS, getTeamColors,
} from "../components/v2/SportVisuals";
import { ChevronRight, X, Filter } from "lucide-react";
import { useSignalGate, FREE_LIMIT } from "../context/SignalGate";
import { ProRowOverlay, ProBoardBanner, ProActionGate } from "../components/ProGate";

const MLB_FILTERS = ["Today", "Pitchers", "Lineup", "Props", "Trends", "Line Moves"] as const;
type MLBFilter = typeof MLB_FILTERS[number];

function matchFilter(sig: V2Signal, filter: MLBFilter): boolean {
  if (filter === "Today") return true;
  if (filter === "Pitchers") return sig.tags.includes("pitcher") || ["cole","strider","yamamoto","fried"].some(n => sig.headline.toLowerCase().includes(n));
  if (filter === "Props") return sig.type === "prop";
  if (filter === "Trends") return sig.type === "trend";
  if (filter === "Line Moves") return sig.type === "line_move";
  if (filter === "Lineup") return sig.type === "lineup" || sig.type === "rotation";
  return true;
}

// ESPN IDs for MLB pitchers (for large headshots in hero)
const PITCHER_ESPN_IDS: Record<string, number> = {
  "G. Cole":    32859,
  "S. Strider": 0,  // On IL — no photo
  "Y. Yamamoto": 4433254,
  "M. Fried":   32694,
  "M. Stroman": 32105,
};

const TONIGHT_GAMES = [
  { id: "m1", away: "HOU", home: "NYY", time: "1:05 PM ET", spread: "NYY -115", total: "8",   series: undefined, note: "Cole scratched" },
  { id: "m2", away: "LAD", home: "ATL", time: "4:10 PM ET", spread: "ATL -108", total: "8.5", series: undefined, note: "Yamamoto vs Fried" },
  { id: "m3", away: "CHC", home: "NYM", time: "7:10 PM ET", spread: "NYM -112", total: "8",   series: undefined, note: null },
];

const PITCHER_STATUS = [
  { name: "G. Cole",    team: "NYY", status: "OUT",   color: T.danger, note: "Scratched — elbow", espnId: 32859 },
  { name: "S. Strider", team: "ATL", status: "IL",    color: T.orange, note: "60-day IL, monitoring", espnId: 0 },
  { name: "Y. Yamamoto",team: "LAD", status: "OK",    color: T.green,  note: "On schedule", espnId: 4433254 },
  { name: "M. Fried",   team: "ATL", status: "OK",    color: T.green,  note: "Confirmed starter", espnId: 32694 },
  { name: "M. Stroman", team: "NYY", status: "START", color: T.gold,   note: "Replacing Cole", espnId: 32105 },
];

const LINEUP_NOTES = [
  { team: "NYY", player: "Juan Soto", note: "Dropped to 5th vs LHP" },
  { team: "LAD", player: "Freddie Freeman", note: "Returning to cleanup" },
  { team: "ATL", player: "Marcell Ozuna", note: "Benched vs elite RHP" },
];

const TEAM_TRENDS = [
  { team: "BAL", trend: "11-3 day games",        dir: "▲", positive: true,  color: T.green },
  { team: "LAD", trend: "8-2 home vs RHP",        dir: "▲", positive: true,  color: T.green },
  { team: "NYY", trend: "4-9 vs elite pitching",  dir: "▼", positive: false, color: T.danger },
  { team: "ATL", trend: "7-1 with Fried healthy", dir: "▲", positive: true,  color: T.green },
];

/* ── MLB detail panel ── */
function MLBDetailPanel({ sig, onClose }: { sig: V2Signal; onClose: () => void }) {
  const darkMode = useShellTheme();
  const TH = {
    surface1:  darkMode ? T.surface1  : "#FFFFFF",
    surface2:  darkMode ? T.surface2  : "#F5F1EB",
    goldDim:   darkMode ? T.goldDim   : "rgba(202,168,90,0.25)",
    border:    darkMode ? T.border    : "rgba(0,0,0,0.08)",
    text:      darkMode ? T.text      : "#1A1712",
    textMuted: darkMode ? T.textMuted : "#3D3830",
    textFaint: darkMode ? T.textFaint : "#7A7368",
  };
  const teamColors = getTeamColors(sig.team);
  const vColor = VERDICT_COLORS[sig.verdict] ?? TH.textFaint;

  return (
    <div style={{
      width: "100%", maxWidth: 340, background: TH.surface1, borderLeft: `1px solid rgba(74,168,200,0.22)`,
      flexShrink: 0, display: "flex", flexDirection: "column", overflowY: "auto",
      position: "relative",
    }}>
      {/* Close */}
      <button onClick={onClose} style={{
        position: "absolute", top: 12, right: 12, zIndex: 10,
        background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%",
        color: TH.textMuted, cursor: "pointer", width: 26, height: 26,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}><X size={12} /></button>

      {/* Hero band */}
      <div style={{
        position: "relative", overflow: "hidden",
        background: `linear-gradient(150deg, ${teamColors.primary}EE 0%, ${teamColors.primary}55 60%, transparent 100%)`,
        padding: "18px 16px 14px",
        borderBottom: `1px solid ${TH.border}`,
        minHeight: 90,
      }}>
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, ${T.cyan}, ${T.cyan}33)`,
        }} />
        <div style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(ellipse at 85% 50%, ${teamColors.secondary}18, transparent 65%)`,
          pointerEvents: "none",
        }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative", zIndex: 2 }}>
          {sig.player ? (
            <PlayerHeadshot name={sig.player} team={sig.team} size={48} shape="circle" />
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <TeamLogoImg abbr={sig.team} size={46} />
              {sig.opponent && <TeamLogoImg abbr={sig.opponent} size={36} />}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: TH.text, lineHeight: 1.2, marginBottom: 4 }}>
              {sig.player ?? `${sig.team}${sig.opponent ? ` @ ${sig.opponent}` : ""}`}
            </div>
            {sig.player && (
              <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 4 }}>
                <TeamLogoImg abbr={sig.team} size={14} />
                <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: TH.textFaint, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  {sig.team}{sig.opponent ? ` vs ${sig.opponent}` : ""}
                </span>
              </div>
            )}
            <VerdictBadge verdict={sig.verdict} />
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", background: TH.surface2, borderBottom: `1px solid ${TH.border}` }}>
        {[
          { label: "Verdict", value: sig.verdict.toUpperCase(), color: vColor },
          { label: "Confidence", value: `${sig.confidence}%`, color: sig.confidence >= 80 ? T.gold : TH.text },
        ].map((s, i) => (
          <div key={s.label} style={{ padding: "9px 0", textAlign: "center", borderRight: i === 0 ? `1px solid ${TH.border}` : "none" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
            <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: TH.textFaint, letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Conf bar */}
      <div style={{ padding: "8px 14px 0" }}>
        <ConfidenceBar value={sig.confidence} width="100%" height={4} />
      </div>

      {/* Body */}
      <div style={{ padding: "12px 14px", flex: 1 }}>
        <div style={{ display: "flex", gap: 5, marginBottom: 10, flexWrap: "wrap" }}>
          <TypeChip type={sig.type} />
        </div>
        <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 15, fontWeight: 700, color: TH.text, lineHeight: 1.4, marginBottom: 10 }}>
          {sig.headline}
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: TH.textFaint, marginBottom: 4 }}>Signal Detail</div>
          <div style={{ fontSize: 14, color: TH.textMuted, lineHeight: 1.65 }}>{sig.detail}</div>
        </div>
        <ProActionGate sport="MLB" actionText={sig.action_takeaway} darkMode={darkMode}>
          <div style={{ background: "rgba(74,168,200,0.07)", border: `1px solid rgba(74,168,200,0.22)`, borderRadius: 4, padding: "10px 12px" }}>
            <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.cyan, marginBottom: 5 }}>
              ⚡ Takeaway
            </div>
            <div style={{ fontSize: 14, color: TH.text, lineHeight: 1.55, fontWeight: 500 }}>{sig.action_takeaway}</div>
          </div>
        </ProActionGate>
      </div>
    </div>
  );
}

export default function MLBBoard() {
  return <V2Shell boardsMode><MLBBoardInner /></V2Shell>;
}

function MLBBoardInner() {
  const darkMode = useShellTheme();
  const { rowIsFree } = useSignalGate();
  // Theme-aware token overrides
  const TH = {
    bg:        darkMode ? T.bg        : "#F0ECE4",
    surface1:  darkMode ? T.surface1  : "#FFFFFF",
    surface2:  darkMode ? T.surface2  : "#F5F1EB",
    surface3:  darkMode ? T.surface3  : "#EDE9E2",
    goldDim:   darkMode ? T.goldDim   : "rgba(202,168,90,0.25)",
    border:    darkMode ? T.border    : "rgba(0,0,0,0.08)",
    text:      darkMode ? T.text      : "#1A1712",
    textMuted: darkMode ? T.textMuted : "#3D3830",   // MLB: stronger contrast in light mode
    textFaint: darkMode ? T.textFaint : "#7A7368",
  };

  const [activeFilter, setActiveFilter] = useState<MLBFilter>("Today");
  const [selected, setSelected] = useState<V2Signal | null>(null);
  const [gameFilter, setGameFilter] = useState<string | null>(null);

  const filtered = MLB_SIGNALS.filter(s =>
    matchFilter(s, activeFilter) &&
    (gameFilter === null || s.team === gameFilter || s.opponent === gameFilter || s.tags.includes(gameFilter))
  );

  return (
    <>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .mlb-sig-row:hover { background: rgba(74,168,200,0.04) !important; }
      `}</style>
      <div className="board-main-wrap" style={{ display: "flex", height: "100%", minHeight: "calc(100vh - 48px)" }}>

        {/* ─── Board subnav ─── */}
        <aside className="board-subnav" style={{
          width: 190, background: TH.surface1, borderRight: `1px solid rgba(74,168,200,0.15)`,
          flexShrink: 0, padding: "16px 10px", overflowY: "auto",
        }}>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
            color: TH.textFaint, padding: "0 8px", marginBottom: 10,
          }}>MLB Board</div>

          {([
            { label: "Signal Stream",   filter: "Today" as MLBFilter },
            { label: "Games Today",     filter: "Today" as MLBFilter },
            { label: "Pitcher News",    filter: "Pitchers" as MLBFilter },
            { label: "Lineup Movement", filter: "Lineup" as MLBFilter },
            { label: "Team Trends",     filter: "Trends" as MLBFilter },
            { label: "Line Movement",   filter: "Line Moves" as MLBFilter },
          ] as { label: string; filter: MLBFilter }[]).map(({ label, filter }) => {
            // "Signal Stream" is always active when filter is Today; "Games Today" also maps to Today
            const isStream = label === "Signal Stream";
            const isActive = isStream
              ? activeFilter === "Today"
              : activeFilter === filter && !(isStream);
            const reallyActive = activeFilter === filter && (label !== "Games Today" || activeFilter === "Today");
            // For "Signal Stream" and "Games Today" both mapping to Today, highlight Signal Stream for Today
            const highlighted = label === "Signal Stream"
              ? activeFilter === "Today"
              : label === "Games Today"
                ? false  // Games Today never shows as active — it’s an alias, de-emphasised
                : activeFilter === filter;
            return (
              <button
                key={label}
                onClick={() => { setActiveFilter(filter); setSelected(null); }}
                aria-pressed={highlighted}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", marginBottom: 1,
                  borderRadius: 3,
                  background: highlighted ? "rgba(74,168,200,0.06)" : "transparent",
                  color: highlighted ? T.cyan : TH.textMuted, cursor: "pointer",
                  transition: "background 0.12s, color 0.12s",
                  width: "100%", textAlign: "left", border: "none",
                  borderLeft: `2px solid ${highlighted ? T.cyan : "transparent"}`,
                }}
                onMouseEnter={e => { if (!highlighted) { const el = e.currentTarget as HTMLButtonElement; el.style.background = "rgba(74,168,200,0.04)"; el.style.color = TH.text; } }}
                onMouseLeave={e => { if (!highlighted) { const el = e.currentTarget as HTMLButtonElement; el.style.background = "transparent"; el.style.color = TH.textMuted; } }}
              >
                <ChevronRight size={10} style={{ opacity: highlighted ? 1 : 0.4, flexShrink: 0 }} />
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 14, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
                }}>{label}</span>
              </button>
            );
          })}

          <div style={{ margin: "16px 0 10px", borderTop: `1px solid rgba(74,168,200,0.15)` }} />
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
            color: TH.textFaint, padding: "0 8px", marginBottom: 8,
          }}>Teams</div>
          {["NYY", "LAD", "ATL", "BAL", "CHC", "HOU"].map(tm => {
            const isActive = gameFilter === tm;
            return (
              <button
                key={tm}
                className="team-btn-mob"
                onClick={() => setGameFilter(gf => gf === tm ? null : tm)}
                aria-label={`Filter signals for ${tm}`}
                aria-pressed={isActive}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 3,
                  width: "100%", cursor: "pointer",
                  background: isActive ? "rgba(74,168,200,0.08)" : "transparent",
                  border: `1px solid ${isActive ? "rgba(74,168,200,0.28)" : "transparent"}`,
                  transition: "background 0.1s, border-color 0.1s",
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(74,168,200,0.04)"; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                <TeamLogoImg abbr={tm} size={22} />
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 14, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                  color: isActive ? T.cyan : TH.textMuted,
                }}>{tm}</span>
              </button>
            );
          })}
        </aside>

        {/* ─── Main canvas ─── */}
        <div className="board-main-col" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

          {/* Header */}
          <div style={{
            padding: "12px 20px", borderBottom: `1px solid ${TH.border}`,
            display: "flex", alignItems: "center", gap: 12, flexShrink: 0, background: TH.surface1,
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 17, fontWeight: 700, color: TH.text }}>
                  MLB Intelligence Board
                </span>
                <SportBadge status="ACTIVE" />
              </div>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 13, color: TH.textFaint, letterSpacing: "0.04em",
              }}>Regular season · {MLB_SIGNALS.length} signals · Updated continuously</div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {[
                { label: "Signals", value: MLB_SIGNALS.length, color: TH.text },
                { label: "Confirmed", value: MLB_SIGNALS.filter(s => s.verdict === "confirmed").length, color: T.green },
              ].map(stat => (
                <div key={stat.label} style={{
                  textAlign: "center", padding: "6px 14px",
                  background: TH.surface2, border: `1px solid ${TH.border}`, borderRadius: 3,
                }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                  <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: TH.textFaint, letterSpacing: "0.1em", textTransform: "uppercase" }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Games strip — MatchupCards */}
          <div style={{ padding: "12px 20px 14px", borderBottom: `1px solid ${TH.border}`, flexShrink: 0, overflowX: "auto" }}>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
              color: TH.textFaint, marginBottom: 10,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.cyan, display: "inline-block" }} />
              Today's Games
            </div>
            <div className="board-slate-strip" style={{ display: "flex", gap: 12 }}>
              {TONIGHT_GAMES.map(game => (
                <div key={game.id} className="board-slate-card" style={{ width: 232, flexShrink: 0 }}>
                  <MatchupCard
                    away={game.away} home={game.home}
                    time={game.time} spread={game.spread} total={game.total}
                    accentColor={T.cyan}
                    signalCount={MLB_SIGNALS.filter(s =>
                      s.team === game.away || s.team === game.home ||
                      s.opponent === game.away || s.opponent === game.home
                    ).length}
                    onClick={() => setGameFilter(gf => gf === game.away || gf === game.home ? null : game.away)}
                  />
                  {(gameFilter === game.away || gameFilter === game.home) && (
                    <div style={{ marginTop: 5, padding: "3px 8px", background: "rgba(74,168,200,0.08)", borderRadius: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.cyan, fontWeight: 700 }}>Filtering: {game.away} @ {game.home}</span>
                      <button onClick={() => setGameFilter(null)} style={{ background: "none", border: "none", color: TH.textFaint, cursor: "pointer", fontSize: 13, lineHeight: 1 }}>×</button>
                    </div>
                  )}
                  {game.note && !(gameFilter === game.away || gameFilter === game.home) && (
                    <div style={{ marginTop: 5, padding: "3px 8px", background: "rgba(74,168,200,0.07)", borderRadius: 2, border: "1px solid rgba(74,168,200,0.12)" }}>
                      <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.cyan, fontWeight: 700, letterSpacing: "0.04em" }}>⚡ {game.note}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div style={{
            padding: "10px 20px", borderBottom: `1px solid ${TH.border}`,
            display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", alignItems: "center",
          }}>
            <Filter size={11} style={{ color: TH.textFaint, marginRight: 4 }} />
            {MLB_FILTERS.map(f => {
              const isActive = f === activeFilter;
              return (
                <button key={f} className="filter-chip" onClick={() => setActiveFilter(f)} style={{
                  padding: "6px 13px", borderRadius: 2,
                  border: `1px solid ${isActive ? T.cyan : "rgba(255,255,255,0.1)"}`,
                  background: isActive ? "rgba(74,168,200,0.08)" : "transparent",
                  color: isActive ? T.cyan : TH.textMuted,
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 14, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
                  cursor: "pointer", transition: "all 0.12s",
                }}>{f}</button>
              );
            })}
          </div>

          {/* Pro banner — locked signal count */}
          <ProBoardBanner
            freeCount={FREE_LIMIT}
            totalCount={filtered.length}
            sport="MLB"
            darkMode={darkMode}
          />

          {/* 2-col layout */}
          <div style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "1fr 280px" }} className="mlb-grid mlb-grid-wrap">

            {/* Signal list */}
            <div style={{ borderRight: `1px solid ${TH.border}`, overflowY: "auto" }}>
              {/* Table header */}
              <div style={{
                display: "grid", gridTemplateColumns: "48px 100px 1fr 68px 68px",
                padding: "6px 20px", background: TH.surface2,
                borderBottom: `1px solid ${TH.border}`,
              }}>
                {["", "Type", "Signal", "Verdict", "Conf"].map(h => (
                  <div key={h} style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: TH.textFaint,
                  }}>{h}</div>
                ))}
              </div>

              {filtered.map((sig, idx) => {
                const isSelected = selected?.id === sig.id;
                const isFree = rowIsFree(idx);
                const typeColor = {
                  injury: T.danger, line_move: T.green, matchup_edge: T.gold,
                  prop: T.orange, trend: T.cyan, lineup: T.cyan,
                }[sig.type] ?? TH.textFaint;

                return (
                  <div
                    key={sig.id}
                    className="mlb-sig-row sig-row-tap"
                    data-testid={`mlb-signal-${sig.id}`}
                    onClick={() => isFree ? setSelected(isSelected ? null : sig) : undefined}
                    style={{
                      position: "relative",
                      display: "grid", gridTemplateColumns: "48px 100px 1fr 68px 68px",
                      padding: "10px 20px",
                      borderBottom: `1px solid ${TH.border}`,
                      borderLeft: `3px solid ${isSelected ? T.cyan : typeColor + "44"}`,
                      background: isSelected ? "rgba(74,168,200,0.05)" : "transparent",
                      cursor: isFree ? "pointer" : "default", alignItems: "center",
                      transition: "background 0.1s",
                    }}
                  >
                    {!isFree && <ProRowOverlay sport="MLB" />}
                    {/* Logo / headshot */}
                    {sig.player ? (
                      <PlayerHeadshot name={sig.player} team={sig.team} size={28} shape="circle" />
                    ) : (
                      <TeamLogoImg abbr={sig.team} size={28} />
                    )}

                    {/* Type */}
                    <div><TypeChip type={sig.type} /></div>

                    {/* Signal */}
                    <div style={{ paddingRight: 12 }}>
                      <div style={{ fontSize: 15, color: TH.text, fontWeight: 500, lineHeight: 1.4, marginBottom: 3 }}>
                        {sig.headline}
                      </div>
                      <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: TH.textFaint, lineHeight: 1.45 }}>
                        {sig.action_takeaway.slice(0, 75)}…
                      </div>
                    </div>

                    {/* Verdict */}
                    <VerdictBadge verdict={sig.verdict} />

                    {/* Conf */}
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: sig.confidence >= 80 ? T.gold : TH.textMuted, marginBottom: 3, fontVariantNumeric: "tabular-nums" }}>
                        {sig.confidence}%
                      </div>
                      <ConfidenceBar value={sig.confidence} width={50} height={3} />
                    </div>
                  </div>
                );
              })}

              <div style={{ margin: "16px 20px", padding: "10px 14px", background: "rgba(74,168,200,0.04)", border: `1px solid rgba(74,168,200,0.1)`, borderRadius: 4 }}>
                <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: TH.textFaint }}>
                  <strong style={{ color: T.cyan }}>STUB DATA</strong> · {MLB_SIGNALS.length} realistic placeholder signals.
                </div>
              </div>
            </div>

            {/* Right modules — upgraded */}
            <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>

              {/* ─ Pitcher Alerts — upgraded with larger headshots + status color bands ─ */}
              <div style={{ background: TH.surface1, border: `1px solid ${TH.border}`, borderRadius: 5, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", background: "rgba(217,138,66,0.06)", borderBottom: `1px solid rgba(217,138,66,0.15)`, display: "flex", gap: 7, alignItems: "center" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.orange, display: "inline-block", boxShadow: `0 0 6px ${T.orange}` }} />
                  <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.orange }}>
                    Pitcher Alerts
                  </span>
                </div>
                <div style={{ padding: "8px" }}>
                  {PITCHER_STATUS.map(p => (
                    <div key={p.name} style={{
                      display: "flex", alignItems: "center", gap: 9,
                      padding: "7px 8px", borderRadius: 4, marginBottom: 4,
                      background: `${p.color}07`,
                      border: `1px solid ${p.color}18`,
                    }}>
                      {/* Headshot — larger */}
                      <div style={{ flexShrink: 0 }}>
                        {p.espnId > 0 ? (
                          <div style={{
                            width: 38, height: 38, borderRadius: "50%", overflow: "hidden",
                            border: `2px solid ${p.color}44`,
                            background: `${getTeamColors(p.team).primary}44`,
                            position: "relative", flexShrink: 0,
                          }}>
                            <img
                              src={`https://a.espncdn.com/i/headshots/mlb/players/full/${p.espnId}.png`}
                              alt={p.name}
                              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }}
                              onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                            />
                          </div>
                        ) : (
                          <PlayerHeadshot name={p.name} team={p.team} size={38} shape="circle" />
                        )}
                      </div>

                      {/* Team logo + name */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                          <TeamLogoImg abbr={p.team} size={14} />
                          <span style={{ fontSize: 14, fontWeight: 600, color: TH.text }}>{p.name}</span>
                        </div>
                        <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: TH.textFaint, letterSpacing: "0.02em" }}>{p.note}</div>
                      </div>

                      {/* Status badge */}
                      <span style={{
                        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                        fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                        color: p.color, padding: "3px 7px", background: `${p.color}18`, borderRadius: 2,
                        flexShrink: 0,
                      }}>{p.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ─ Lineup Movement — upgraded with player context ─ */}
              <div style={{ background: TH.surface1, border: `1px solid ${TH.border}`, borderRadius: 5, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: `1px solid ${TH.border}`, display: "flex", gap: 7, alignItems: "center" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.cyan, display: "inline-block" }} />
                  <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: TH.textFaint }}>
                    Lineup Movement
                  </span>
                </div>
                <div>
                  {LINEUP_NOTES.map(note => (
                    <div key={note.team} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderBottom: `1px solid ${TH.border}` }}>
                      <TeamLogoImg abbr={note.team} size={28} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, fontWeight: 700, color: TH.textMuted, letterSpacing: "0.02em" }}>{note.note}</div>
                        <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: TH.textFaint, marginTop: 1 }}>{note.player}</div>
                      </div>
                    </div>
                  ))}
                  <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: TH.textFaint, padding: "8px 12px", letterSpacing: "0.02em" }}>
                    Lineups confirm ~3h before first pitch
                  </div>
                </div>
              </div>

              {/* ─ Team Trends — upgraded with larger logos + directional styling ─ */}
              <div style={{ background: TH.surface1, border: `1px solid ${TH.border}`, borderRadius: 5, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: `1px solid ${TH.border}`, display: "flex", gap: 7, alignItems: "center" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.gold, display: "inline-block" }} />
                  <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: TH.textFaint }}>
                    Team Trends
                  </span>
                </div>
                <div>
                  {TEAM_TRENDS.map(trend => (
                    <div key={trend.team} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                      borderBottom: `1px solid ${TH.border}`,
                      background: `${trend.color}05`,
                    }}>
                      <TeamLogoImg abbr={trend.team} size={28} />
                      <div style={{ flex: 1, fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 13, color: TH.textMuted, letterSpacing: "0.02em" }}>{trend.trend}</div>
                      <span style={{
                        fontSize: 14, fontWeight: 700, color: trend.color,
                        background: `${trend.color}15`, padding: "2px 6px", borderRadius: 2,
                      }}>{trend.dir}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="board-detail-rail" style={{ position: "relative" }}>
            <MLBDetailPanel sig={selected} onClose={() => setSelected(null)} />
          </div>
        )}
      </div>
      <style>{`
        .mlb-grid { }
        @media (max-width: 900px) { .mlb-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </>
  );
}
