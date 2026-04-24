import { useState } from "react";
import V2Shell, { SportBadge } from "../components/V2Shell";
import { MLB_SIGNALS, type V2Signal } from "../data/v2MockData";
import { AlertTriangle, TrendingUp, Zap, BarChart2, Clock, ChevronRight, X } from "lucide-react";

const T = {
  bg:         "#0A0B0D",
  surface1:   "#111317",
  surface2:   "#16191E",
  gold:       "#CAA85A",
  goldDim:    "rgba(202,168,90,0.16)",
  text:       "#F3EFE6",
  textMuted:  "#B7AFA0",
  textFaint:  "#7E776A",
  green:      "#4CAF82",
  orange:     "#D98A42",
  cyan:       "#4AA8C8",
  danger:     "#D94B4B",
};

const VERDICT_COLOR: Record<string, string> = {
  confirmed: T.green, likely: T.gold, rumor: T.orange, contradicted: T.danger, review: T.textFaint,
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  injury: <AlertTriangle size={12} />, line_move: <TrendingUp size={12} />,
  matchup_edge: <Zap size={12} />, rotation: <BarChart2 size={12} />,
  prop: <Zap size={12} />, news: <Clock size={12} />, trend: <TrendingUp size={12} />, lineup: <BarChart2 size={12} />,
};

const MLB_FILTERS = ["Today", "Pitchers", "Lineup", "Props", "Trends", "Line Moves"];

/* Placeholder modules */
function ModuleCard({ title, children, color = T.textFaint }: { title: string; children: React.ReactNode; color?: string }) {
  return (
    <div style={{ background: T.surface1, border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 4, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: `1px solid rgba(255,255,255,0.06)`, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, display: "inline-block" }} />
        <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.textFaint }}>
          {title}
        </span>
      </div>
      <div style={{ padding: "12px 14px" }}>{children}</div>
    </div>
  );
}

export default function MLBBoard() {
  const [activeFilter, setActiveFilter] = useState("Today");
  const [selected, setSelected] = useState<V2Signal | null>(null);

  const filtered = MLB_SIGNALS.filter(sig => {
    if (activeFilter === "Today") return true;
    if (activeFilter === "Pitchers") return sig.type === "injury" && sig.tags.includes("pitcher") || sig.player?.toLowerCase().includes("pitcher") || sig.headline.toLowerCase().includes("pitcher") || sig.headline.toLowerCase().includes("starter") || sig.headline.toLowerCase().includes("rotation") || sig.tags.includes("pitcher");
    if (activeFilter === "Props") return sig.type === "prop";
    if (activeFilter === "Trends") return sig.type === "trend";
    if (activeFilter === "Line Moves") return sig.type === "line_move";
    if (activeFilter === "Lineup") return sig.type === "lineup" || sig.type === "rotation";
    return true;
  });

  return (
    <V2Shell boardsMode>
      <div style={{ display: "flex", height: "100%", minHeight: "calc(100vh - 48px)" }}>

        {/* Board subnav */}
        <aside style={{ width: 190, background: T.surface1, borderRight: `1px solid ${T.goldDim}`, flexShrink: 0, padding: "16px 10px" }}>
          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.textFaint, padding: "0 8px", marginBottom: 10 }}>MLB Board</div>
          {["Signal Stream", "Games Today", "Pitcher News", "Lineup Movement", "Team Trends", "Line Movement"].map((label, i) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", marginBottom: 1,
              borderRadius: 3, borderLeft: `2px solid ${i === 0 ? T.cyan : "transparent"}`,
              background: i === 0 ? "rgba(74,168,200,0.06)" : "transparent",
              color: i === 0 ? T.cyan : T.textMuted, cursor: "pointer",
            }}
              onMouseEnter={e => { if (i !== 0) { const el = e.currentTarget as HTMLDivElement; el.style.background = "rgba(74,168,200,0.03)"; el.style.color = T.text; } }}
              onMouseLeave={e => { if (i !== 0) { const el = e.currentTarget as HTMLDivElement; el.style.background = "transparent"; el.style.color = T.textMuted; } }}
            >
              <ChevronRight size={10} style={{ opacity: i === 0 ? 1 : 0.4 }} />
              <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>
            </div>
          ))}

          <div style={{ margin: "16px 0 10px", borderTop: `1px solid ${T.goldDim}` }} />
          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.textFaint, padding: "0 8px", marginBottom: 8 }}>Teams</div>
          {["NYY", "LAD", "ATL", "BAL", "CHC", "HOU"].map(tm => (
            <div key={tm} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 3, color: T.textMuted, cursor: "pointer" }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.color = T.text; el.style.background = "rgba(74,168,200,0.03)"; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.color = T.textMuted; el.style.background = "transparent"; }}>
              <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>{tm}</span>
            </div>
          ))}
        </aside>

        {/* Main canvas */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Header */}
          <div style={{ padding: "14px 20px", borderBottom: `1px solid rgba(255,255,255,0.06)`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 16, fontWeight: 700, color: T.text }}>MLB Intelligence Board</span>
                <SportBadge status="ACTIVE" />
              </div>
              <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textFaint, letterSpacing: "0.06em" }}>
                Regular season · {MLB_SIGNALS.length} signals · Updated continuously
              </div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {[
                { label: "Signals", value: MLB_SIGNALS.length, color: T.text },
                { label: "Confirmed", value: MLB_SIGNALS.filter(s => s.verdict === "confirmed").length, color: T.green },
              ].map(stat => (
                <div key={stat.label} style={{ textAlign: "center", padding: "6px 12px", background: T.surface1, border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 3 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                  <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, color: T.textFaint, letterSpacing: "0.1em", textTransform: "uppercase" }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div style={{ padding: "10px 20px", borderBottom: `1px solid rgba(255,255,255,0.06)`, display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
            {MLB_FILTERS.map(f => {
              const isActive = f === activeFilter;
              return (
                <button key={f} onClick={() => setActiveFilter(f)} style={{
                  padding: "5px 12px", borderRadius: 2, border: `1px solid ${isActive ? T.cyan : "rgba(255,255,255,0.1)"}`,
                  background: isActive ? "rgba(74,168,200,0.08)" : "transparent",
                  color: isActive ? T.cyan : T.textMuted,
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                  cursor: "pointer",
                }}>
                  {f}
                </button>
              );
            })}
          </div>

          {/* 2-column layout: signals + modules */}
          <div style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "1fr 280px", gap: 0 }} className="mlb-grid">
            {/* Signal list */}
            <div style={{ borderRight: `1px solid rgba(255,255,255,0.06)` }}>
              {/* Table header */}
              <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 80px 60px 60px", gap: 0, padding: "6px 20px", background: T.surface2, borderBottom: `1px solid rgba(255,255,255,0.06)`, position: "sticky", top: 0 }}>
                {["Type", "Signal", "Team", "Verdict", "Conf"].map(h => (
                  <div key={h} style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.textFaint }}>{h}</div>
                ))}
              </div>
              {filtered.map(sig => {
                const vColor = VERDICT_COLOR[sig.verdict] ?? T.textFaint;
                const isSelected = selected?.id === sig.id;
                return (
                  <div key={sig.id} data-testid={`mlb-signal-${sig.id}`}
                    onClick={() => setSelected(isSelected ? null : sig)}
                    style={{
                      display: "grid", gridTemplateColumns: "90px 1fr 80px 60px 60px", gap: 0,
                      padding: "11px 20px", borderBottom: `1px solid rgba(255,255,255,0.04)`,
                      background: isSelected ? "rgba(74,168,200,0.05)" : "transparent",
                      cursor: "pointer", alignItems: "start",
                    }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "rgba(74,168,200,0.025)"; }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 5, color: T.textFaint, paddingTop: 2 }}>
                      {TYPE_ICON[sig.type]}
                      <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textFaint }}>
                        {sig.type.replace("_", " ").toUpperCase().slice(0, 10)}
                      </span>
                    </div>
                    <div style={{ paddingRight: 12 }}>
                      <div style={{ fontSize: 13, color: T.text, fontWeight: 500, lineHeight: 1.4, marginBottom: 2 }}>{sig.headline}</div>
                      <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint }}>
                        {sig.action_takeaway.slice(0, 80)}…
                      </div>
                    </div>
                    <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint }}>{sig.team}</div>
                    <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: vColor }}>{sig.verdict}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: sig.confidence >= 80 ? T.gold : T.textMuted }}>{sig.confidence}%</div>
                  </div>
                );
              })}
              <div style={{ margin: "16px 20px", padding: "10px 14px", background: "rgba(74,168,200,0.04)", border: `1px solid rgba(74,168,200,0.1)`, borderRadius: 4 }}>
                <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint }}>
                  <strong style={{ color: T.cyan }}>STUB DATA</strong> · {MLB_SIGNALS.length} realistic placeholder signals. Wire MLB signal ingestion to replace.
                </div>
              </div>
            </div>

            {/* Right modules */}
            <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
              <ModuleCard title="Games Today" color={T.cyan}>
                {[
                  { away: "HOU", home: "NYY", time: "1:05 PM ET", total: "8", ml: "NYY -115" },
                  { away: "LAD", home: "ATL", time: "4:10 PM ET", total: "8.5", ml: "ATL -108" },
                  { away: "CHC", home: "NYM", time: "7:10 PM ET", total: "8", ml: "NYM -112" },
                ].map(g => (
                  <div key={g.away + g.home} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                    <div style={{ fontSize: 12, color: T.text }}>{g.away} @ {g.home}</div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.gold }}>{g.ml}</div>
                      <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint }}>O/U {g.total} · {g.time}</div>
                    </div>
                  </div>
                ))}
              </ModuleCard>

              <ModuleCard title="Pitcher Alerts" color={T.orange}>
                <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textMuted, letterSpacing: "0.04em", lineHeight: 1.7 }}>
                  <div style={{ color: T.danger, fontWeight: 700 }}>⚠ G. Cole (NYY) — scratched</div>
                  <div style={{ color: T.orange }}>⚠ S. Strider (ATL) — IL, monitoring</div>
                  <div style={{ color: T.green }}>✓ Y. Yamamoto (LAD) — on schedule</div>
                  <div style={{ color: T.green }}>✓ M. Fried (ATL) — confirmed starter</div>
                </div>
              </ModuleCard>

              <ModuleCard title="Lineup Movement" color={T.textFaint}>
                <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textMuted, letterSpacing: "0.04em", lineHeight: 1.7 }}>
                  <div>NYY — Soto dropped to 5th vs LHP</div>
                  <div>LAD — Freeman returning to cleanup</div>
                  <div>ATL — Ozuna benched vs elite RHP</div>
                  <div style={{ color: T.textFaint }}>Lineups confirm ~3h before first pitch</div>
                </div>
              </ModuleCard>

              <ModuleCard title="Team Trends" color={T.textFaint}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {["BAL 11-3 day games", "LAD 8-2 at home vs RHP", "NYY 4-9 vs elite pitching", "ATL 7-1 with Fried healthy"].map(trend => (
                    <div key={trend} style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textMuted, padding: "4px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                      {trend}
                    </div>
                  ))}
                </div>
              </ModuleCard>
            </div>
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{ width: 300, background: T.surface1, borderLeft: `1px solid ${T.goldDim}`, flexShrink: 0, overflowY: "auto" }}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid rgba(255,255,255,0.06)`, display: "flex", alignItems: "flex-start", gap: 6 }}>
              <div style={{ flex: 1, fontSize: 13, color: T.text, fontWeight: 600, lineHeight: 1.4 }}>{selected.headline}</div>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: T.textFaint, cursor: "pointer", flexShrink: 0 }}><X size={14} /></button>
            </div>
            <div style={{ padding: "14px" }}>
              <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.6, marginBottom: 12 }}>{selected.detail}</div>
              <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.6, marginBottom: 12 }}>{selected.why_it_matters}</div>
              <div style={{ background: "rgba(74,168,200,0.06)", border: `1px solid rgba(74,168,200,0.15)`, borderRadius: 4, padding: "10px 12px" }}>
                <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.cyan, marginBottom: 5 }}>Takeaway</div>
                <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5 }}>{selected.action_takeaway}</div>
              </div>
            </div>
          </div>
        )}
      </div>
      <style>{`.mlb-grid { @media (max-width: 900px) { grid-template-columns: 1fr !important; } }`}</style>
    </V2Shell>
  );
}
