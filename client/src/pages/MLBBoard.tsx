import { useState } from "react";
import V2Shell, { SportBadge } from "../components/V2Shell";
import { MLB_SIGNALS, type V2Signal } from "../data/v2MockData";
import {
  PlayerAvatar, PlayerHeadshot, TeamLogo, TeamLogoImg, GameCard,
  VerdictBadge, TypeChip, ConfidenceBar,
  T, VERDICT_COLORS, getTeamColors,
} from "../components/v2/SportVisuals";
import { ChevronRight, X, Filter } from "lucide-react";

const MLB_FILTERS = ["Today", "Pitchers", "Lineup", "Props", "Trends", "Line Moves"] as const;
type MLBFilter = typeof MLB_FILTERS[number];

function matchFilter(sig: V2Signal, filter: MLBFilter): boolean {
  if (filter === "Today") return true;
  if (filter === "Pitchers") return sig.tags.includes("pitcher") || sig.headline.toLowerCase().includes("cole") || sig.headline.toLowerCase().includes("strider") || sig.headline.toLowerCase().includes("yamamoto") || sig.headline.toLowerCase().includes("fried");
  if (filter === "Props") return sig.type === "prop";
  if (filter === "Trends") return sig.type === "trend";
  if (filter === "Line Moves") return sig.type === "line_move";
  if (filter === "Lineup") return sig.type === "lineup" || sig.type === "rotation";
  return true;
}

const TONIGHT_GAMES = [
  { id: "m1", away: "HOU", home: "NYY", time: "1:05 PM ET", spread: "NYY -115", total: "8", series: undefined },
  { id: "m2", away: "LAD", home: "ATL", time: "4:10 PM ET", spread: "ATL -108", total: "8.5", series: undefined },
  { id: "m3", away: "CHC", home: "NYM", time: "7:10 PM ET", spread: "NYM -112", total: "8", series: undefined },
];

const PITCHER_STATUS = [
  { name: "G. Cole", team: "NYY", status: "OUT", color: T.danger, note: "Scratched — elbow" },
  { name: "S. Strider", team: "ATL", status: "IL", color: T.orange, note: "IL, monitoring" },
  { name: "Y. Yamamoto", team: "LAD", status: "OK", color: T.green, note: "On schedule" },
  { name: "M. Fried", team: "ATL", status: "OK", color: T.green, note: "Confirmed starter" },
  { name: "M. Stroman", team: "NYY", status: "START", color: T.gold, note: "Replacing Cole" },
];

const LINEUP_NOTES = [
  { team: "NYY", note: "Soto dropped to 5th vs LHP" },
  { team: "LAD", note: "Freeman returning to cleanup" },
  { team: "ATL", note: "Ozuna benched vs elite RHP" },
];

const TEAM_TRENDS = [
  { team: "BAL", trend: "11-3 day games", positive: true },
  { team: "LAD", trend: "8-2 home vs RHP", positive: true },
  { team: "NYY", trend: "4-9 vs elite pitching", positive: false },
  { team: "ATL", trend: "7-1 with Fried healthy", positive: true },
];

export default function MLBBoard() {
  const [activeFilter, setActiveFilter] = useState<MLBFilter>("Today");
  const [selected, setSelected] = useState<V2Signal | null>(null);

  const filtered = MLB_SIGNALS.filter(s => matchFilter(s, activeFilter));

  return (
    <V2Shell boardsMode>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      <div style={{ display: "flex", height: "100%", minHeight: "calc(100vh - 48px)" }}>

        {/* ─── Board subnav ─── */}
        <aside style={{
          width: 190, background: T.surface1, borderRight: `1px solid ${T.goldDim}`,
          flexShrink: 0, padding: "16px 10px", overflowY: "auto",
        }}>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
            color: T.textFaint, padding: "0 8px", marginBottom: 10,
          }}>MLB Board</div>

          {["Signal Stream", "Games Today", "Pitcher News", "Lineup Movement", "Team Trends", "Line Movement"].map((label, i) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", marginBottom: 1,
              borderRadius: 3,
              borderLeft: `2px solid ${i === 0 ? T.cyan : "transparent"}`,
              background: i === 0 ? "rgba(74,168,200,0.06)" : "transparent",
              color: i === 0 ? T.cyan : T.textMuted, cursor: "pointer",
              transition: "background 0.12s, color 0.12s",
            }}
              onMouseEnter={e => { if (i !== 0) { const el = e.currentTarget as HTMLDivElement; el.style.background = "rgba(74,168,200,0.03)"; el.style.color = T.text; } }}
              onMouseLeave={e => { if (i !== 0) { const el = e.currentTarget as HTMLDivElement; el.style.background = "transparent"; el.style.color = T.textMuted; } }}
            >
              <ChevronRight size={10} style={{ opacity: i === 0 ? 1 : 0.4 }} />
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
              }}>{label}</span>
            </div>
          ))}

          <div style={{ margin: "16px 0 10px", borderTop: `1px solid ${T.goldDim}` }} />
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
            color: T.textFaint, padding: "0 8px", marginBottom: 8,
          }}>Teams</div>
          {["NYY", "LAD", "ATL", "BAL", "CHC", "HOU"].map(tm => (
            <div key={tm} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 3,
              cursor: "pointer",
            }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.background = "rgba(74,168,200,0.03)"; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.background = "transparent"; }}
            >
              <TeamLogoImg abbr={tm} size={20} />
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textMuted,
              }}>{tm}</span>
            </div>
          ))}
        </aside>

        {/* ─── Main canvas ─── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Header */}
          <div style={{
            padding: "12px 20px", borderBottom: `1px solid rgba(255,255,255,0.06)`,
            display: "flex", alignItems: "center", gap: 12, flexShrink: 0, background: T.surface1,
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 16, fontWeight: 700, color: T.text }}>
                  MLB Intelligence Board
                </span>
                <SportBadge status="ACTIVE" />
              </div>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 11, color: T.textFaint, letterSpacing: "0.06em",
              }}>Regular season · {MLB_SIGNALS.length} signals · Updated continuously</div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {[
                { label: "Signals", value: MLB_SIGNALS.length, color: T.text },
                { label: "Confirmed", value: MLB_SIGNALS.filter(s => s.verdict === "confirmed").length, color: T.green },
              ].map(stat => (
                <div key={stat.label} style={{
                  textAlign: "center", padding: "6px 12px",
                  background: T.surface2, border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 3,
                }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                  <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, color: T.textFaint, letterSpacing: "0.1em", textTransform: "uppercase" }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Today's games strip */}
          <div style={{ padding: "12px 20px", borderBottom: `1px solid rgba(255,255,255,0.06)`, flexShrink: 0, overflowX: "auto" }}>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
              color: T.textFaint, marginBottom: 10,
            }}>Today's Games</div>
            <div style={{ display: "flex", gap: 12 }}>
              {TONIGHT_GAMES.map(game => (
                <div key={game.id} style={{ width: 200, flexShrink: 0 }}>
                  <GameCard away={game.away} home={game.home} time={game.time}
                    spread={game.spread} total={game.total} compact />
                </div>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div style={{
            padding: "10px 20px", borderBottom: `1px solid rgba(255,255,255,0.06)`,
            display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", alignItems: "center",
          }}>
            <Filter size={11} style={{ color: T.textFaint, marginRight: 4 }} />
            {MLB_FILTERS.map(f => {
              const isActive = f === activeFilter;
              return (
                <button key={f} onClick={() => setActiveFilter(f)} style={{
                  padding: "5px 12px", borderRadius: 2,
                  border: `1px solid ${isActive ? T.cyan : "rgba(255,255,255,0.1)"}`,
                  background: isActive ? "rgba(74,168,200,0.08)" : "transparent",
                  color: isActive ? T.cyan : T.textMuted,
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                  cursor: "pointer", transition: "all 0.12s",
                }}>{f}</button>
              );
            })}
          </div>

          {/* 2-col layout */}
          <div style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "1fr 268px" }} className="mlb-grid">

            {/* Signal list */}
            <div style={{ borderRight: `1px solid rgba(255,255,255,0.06)`, overflowY: "auto" }}>
              {/* Table header */}
              <div style={{
                display: "grid", gridTemplateColumns: "44px 100px 1fr 70px 70px",
                padding: "6px 20px", background: T.surface2,
                borderBottom: `1px solid rgba(255,255,255,0.06)`, position: "sticky", top: 0,
              }}>
                {["", "Type", "Signal", "Verdict", "Conf"].map(h => (
                  <div key={h} style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.textFaint,
                  }}>{h}</div>
                ))}
              </div>

              {filtered.map(sig => {
                const isSelected = selected?.id === sig.id;
                const typeColor = { injury: T.danger, line_move: T.green, matchup_edge: T.gold, prop: T.orange, trend: T.cyan, lineup: T.cyan }[sig.type] ?? T.textFaint;

                return (
                  <div
                    key={sig.id}
                    data-testid={`mlb-signal-${sig.id}`}
                    onClick={() => setSelected(isSelected ? null : sig)}
                    style={{
                      display: "grid", gridTemplateColumns: "44px 100px 1fr 70px 70px",
                      padding: "10px 20px",
                      borderBottom: `1px solid rgba(255,255,255,0.04)`,
                      borderLeft: `3px solid ${isSelected ? T.cyan : typeColor + "44"}`,
                      background: isSelected ? "rgba(74,168,200,0.05)" : "transparent",
                      cursor: "pointer", alignItems: "center",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "rgba(74,168,200,0.025)"; }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                  >
                    {/* Team logo */}
                    <TeamLogoImg abbr={sig.team} size={26} />

                    {/* Type */}
                    <div><TypeChip type={sig.type} /></div>

                    {/* Signal */}
                    <div style={{ paddingRight: 12 }}>
                      <div style={{ fontSize: 13, color: T.text, fontWeight: 500, lineHeight: 1.35, marginBottom: 2 }}>
                        {sig.headline}
                      </div>
                      <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint }}>
                        {sig.action_takeaway.slice(0, 75)}…
                      </div>
                    </div>

                    {/* Verdict */}
                    <VerdictBadge verdict={sig.verdict} />

                    {/* Conf */}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: sig.confidence >= 80 ? T.gold : T.textMuted, marginBottom: 3 }}>
                        {sig.confidence}%
                      </div>
                      <ConfidenceBar value={sig.confidence} width={50} height={3} />
                    </div>
                  </div>
                );
              })}

              <div style={{ margin: "16px 20px", padding: "10px 14px", background: "rgba(74,168,200,0.04)", border: `1px solid rgba(74,168,200,0.1)`, borderRadius: 4 }}>
                <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint }}>
                  <strong style={{ color: T.cyan }}>STUB DATA</strong> · {MLB_SIGNALS.length} realistic placeholder signals.
                </div>
              </div>
            </div>

            {/* Right modules */}
            <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>

              {/* Pitcher Alerts */}
              <div style={{ background: T.surface1, border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: `1px solid rgba(255,255,255,0.06)`, display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.orange, display: "inline-block" }} />
                  <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.textFaint }}>
                    Pitcher Alerts
                  </span>
                </div>
                <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {PITCHER_STATUS.map(p => (
                    <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 3, background: `${p.color}08` }}>
                      <PlayerHeadshot name={p.name} team={p.team} size={28} shape="circle" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 1 }}>{p.name}</div>
                        <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint }}>{p.note}</div>
                      </div>
                      <span style={{
                        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                        fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                        color: p.color, padding: "2px 6px", background: `${p.color}18`, borderRadius: 2,
                      }}>{p.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lineup Movement */}
              <div style={{ background: T.surface1, border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: `1px solid rgba(255,255,255,0.06)`, display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.textFaint, display: "inline-block" }} />
                  <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.textFaint }}>
                    Lineup Movement
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {LINEUP_NOTES.map(note => (
                    <div key={note.team} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                      <TeamLogoImg abbr={note.team} size={24} />
                      <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textMuted, lineHeight: 1.5 }}>{note.note}</div>
                    </div>
                  ))}
                  <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint, padding: "8px 12px" }}>
                    Lineups confirm ~3h before first pitch
                  </div>
                </div>
              </div>

              {/* Team Trends */}
              <div style={{ background: T.surface1, border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: `1px solid rgba(255,255,255,0.06)`, display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.textFaint, display: "inline-block" }} />
                  <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.textFaint }}>
                    Team Trends
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {TEAM_TRENDS.map(trend => (
                    <div key={trend.team} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                      <TeamLogoImg abbr={trend.team} size={24} />
                      <div style={{ flex: 1, fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textMuted }}>{trend.trend}</div>
                      <span style={{ fontSize: 14 }}>{trend.positive ? "▲" : "▼"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{ width: 300, background: T.surface1, borderLeft: `1px solid ${T.goldDim}`, flexShrink: 0, overflowY: "auto" }}>
            <div style={{
              height: 72, background: `linear-gradient(135deg, ${getTeamColors(selected.team).primary}BB, transparent)`,
              borderBottom: `1px solid rgba(255,255,255,0.07)`,
              display: "flex", alignItems: "center", padding: "0 14px", gap: 10, position: "relative",
            }}>
              <TeamLogoImg abbr={selected.team} size={40} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{selected.team}{selected.opponent ? ` vs ${selected.opponent}` : ""}</div>
                {selected.player && <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textFaint }}>{selected.player}</div>}
              </div>
              <button onClick={() => setSelected(null)} style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", color: T.textFaint, cursor: "pointer" }}><X size={14} /></button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
              {[
                { label: "Verdict", value: selected.verdict.toUpperCase(), color: VERDICT_COLORS[selected.verdict] ?? T.textFaint },
                { label: "Confidence", value: `${selected.confidence}%`, color: selected.confidence >= 80 ? T.gold : T.text },
              ].map((s, i) => (
                <div key={s.label} style={{ padding: "10px 0", textAlign: "center", background: T.surface2, borderRight: i === 0 ? `1px solid rgba(255,255,255,0.05)` : "none" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, color: T.textFaint, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "14px" }}>
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.4, marginBottom: 10 }}>{selected.headline}</div>
              <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.6, marginBottom: 10 }}>{selected.detail}</div>
              <div style={{ background: "rgba(74,168,200,0.06)", border: `1px solid rgba(74,168,200,0.18)`, borderRadius: 4, padding: "10px 12px" }}>
                <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.cyan, marginBottom: 5 }}>
                  Takeaway
                </div>
                <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5 }}>{selected.action_takeaway}</div>
              </div>
            </div>
          </div>
        )}
      </div>
      <style>{`.mlb-grid { } @media (max-width: 900px) { .mlb-grid { grid-template-columns: 1fr !important; } }`}</style>
    </V2Shell>
  );
}
