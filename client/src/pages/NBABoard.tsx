import { useState } from "react";
import V2Shell, { SportBadge } from "../components/V2Shell";
import { NBA_SIGNALS, NBA_TONIGHT, type V2Signal } from "../data/v2MockData";
import { AlertTriangle, TrendingUp, Zap, BarChart2, Clock, X, ChevronRight } from "lucide-react";

const T = {
  bg:         "#0A0B0D",
  surface1:   "#111317",
  surface2:   "#16191E",
  surface3:   "#1B1F25",
  gold:       "#CAA85A",
  goldBright: "#D8B86A",
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
  confirmed: T.green,
  likely:    T.gold,
  rumor:     T.orange,
  contradicted: T.danger,
  review:    T.textFaint,
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  injury:       <AlertTriangle size={12} />,
  line_move:    <TrendingUp size={12} />,
  matchup_edge: <Zap size={12} />,
  rotation:     <BarChart2 size={12} />,
  prop:         <Zap size={12} />,
  news:         <Clock size={12} />,
  trend:        <TrendingUp size={12} />,
};

const TYPE_LABEL: Record<string, string> = {
  injury: "INJURY", line_move: "LINE MOVE", matchup_edge: "MATCHUP", rotation: "ROTATION",
  prop: "PROP", news: "NEWS", trend: "TREND", lineup: "LINEUP",
};

const FILTERS = ["Today", "Players", "Teams", "Injuries", "Props", "Matchups", "Playoffs"];

type FilterKey = typeof FILTERS[number];

function matchFilter(sig: V2Signal, filter: FilterKey): boolean {
  if (filter === "Today") return true;
  if (filter === "Injuries") return sig.type === "injury";
  if (filter === "Props") return sig.type === "prop";
  if (filter === "Matchups") return sig.type === "matchup_edge";
  if (filter === "Players") return !!sig.player;
  if (filter === "Teams") return !sig.player;
  if (filter === "Playoffs") return sig.tags.includes("playoffs") || sig.tags.some(t => ["LAL","BOS","MIA","GSW","DEN","MIN","OKC","DAL","NYK","PHI"].includes(t));
  return true;
}

/* Detail panel */
function DetailPanel({ sig, onClose }: { sig: V2Signal; onClose: () => void }) {
  const vColor = VERDICT_COLOR[sig.verdict] ?? T.textFaint;
  return (
    <div
      data-testid="detail-panel"
      style={{
        width: 340, background: T.surface1, borderLeft: `1px solid ${T.goldDim}`,
        flexShrink: 0, display: "flex", flexDirection: "column", overflowY: "auto",
      }}
    >
      {/* Header */}
      <div style={{ padding: "14px 16px 12px", borderBottom: `1px solid rgba(255,255,255,0.06)`, display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.gold }}>
              {sig.team}{sig.opponent ? ` · ${sig.opponent}` : ""}
            </span>
            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, color: T.textFaint }}>
              {sig.timestamp}
            </span>
          </div>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 600, lineHeight: 1.4 }}>
            {sig.headline}
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: T.textFaint, cursor: "pointer", padding: 4, flexShrink: 0 }}>
          <X size={14} />
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "rgba(255,255,255,0.04)" }}>
        {[
          { label: "Verdict", value: sig.verdict.toUpperCase(), color: vColor },
          { label: "Confidence", value: `${sig.confidence}%`, color: T.text },
          { label: "Sources", value: String(sig.sources), color: T.text },
        ].map(s => (
          <div key={s.label} style={{ padding: "10px 12px", background: T.surface2, textAlign: "center" }}>
            <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 14, fontWeight: 700, color: s.color, letterSpacing: "0.02em" }}>{s.value}</div>
            <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, color: T.textFaint, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Body */}
      <div style={{ padding: "16px", flex: 1 }}>
        {sig.player && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.textFaint, marginBottom: 5 }}>Player</div>
            <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{sig.player}</div>
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.textFaint, marginBottom: 5 }}>Signal Detail</div>
          <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>{sig.detail}</div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.textFaint, marginBottom: 5 }}>Why It Matters</div>
          <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>{sig.why_it_matters}</div>
        </div>

        <div style={{ background: "rgba(202,168,90,0.06)", border: `1px solid rgba(202,168,90,0.18)`, borderRadius: 4, padding: "12px 14px" }}>
          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.gold, marginBottom: 6 }}>Action Takeaway</div>
          <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6, fontWeight: 500 }}>{sig.action_takeaway}</div>
        </div>

        {/* Tags */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 14 }}>
          {sig.tags.map(tag => (
            <span key={tag} style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textFaint, padding: "2px 6px", background: "rgba(255,255,255,0.05)", borderRadius: 2 }}>
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function NBABoard() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("Today");
  const [selected, setSelected] = useState<V2Signal | null>(null);

  const filtered = NBA_SIGNALS.filter(s => matchFilter(s, activeFilter));

  return (
    <V2Shell boardsMode>
      <div style={{ display: "flex", height: "100%", minHeight: "calc(100vh - 48px)" }}>

        {/* ─── Board subnav ─── */}
        <aside style={{ width: 200, background: T.surface1, borderRight: `1px solid ${T.goldDim}`, flexShrink: 0, padding: "16px 10px" }}>
          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.textFaint, padding: "0 8px", marginBottom: 10 }}>
            NBA Board
          </div>

          {[
            { label: "Signal Stream", active: true },
            { label: "Tonight's Slate", active: false },
            { label: "Injury Volatility", active: false },
            { label: "Line Movement", active: false },
            { label: "Matchup Edges", active: false },
            { label: "Rotation Notes", active: false },
            { label: "Playoff Tracker", active: false },
          ].map(({ label, active }) => (
            <div
              key={label}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", marginBottom: 1,
                borderRadius: 3, borderLeft: `2px solid ${active ? T.gold : "transparent"}`,
                background: active ? "rgba(202,168,90,0.07)" : "transparent",
                color: active ? T.gold : T.textMuted,
                cursor: "pointer", transition: "background 0.12s, color 0.12s",
              }}
              onMouseEnter={e => { if (!active) { const el = e.currentTarget as HTMLDivElement; el.style.background = "rgba(202,168,90,0.03)"; el.style.color = T.text; } }}
              onMouseLeave={e => { if (!active) { const el = e.currentTarget as HTMLDivElement; el.style.background = "transparent"; el.style.color = T.textMuted; } }}
            >
              <ChevronRight size={10} style={{ opacity: active ? 1 : 0.4 }} />
              <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                {label}
              </span>
            </div>
          ))}

          <div style={{ margin: "16px 0 10px", borderTop: `1px solid ${T.goldDim}` }} />
          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.textFaint, padding: "0 8px", marginBottom: 8 }}>
            Quick Teams
          </div>
          {["LAL", "BOS", "DEN", "GSW", "MIA", "OKC"].map(tm => (
            <div key={tm} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 3, color: T.textMuted, cursor: "pointer" }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.color = T.text; el.style.background = "rgba(202,168,90,0.03)"; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.color = T.textMuted; el.style.background = "transparent"; }}>
              <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>{tm}</span>
            </div>
          ))}
        </aside>

        {/* ─── Main canvas ─── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

          {/* Board header */}
          <div style={{ padding: "14px 20px", borderBottom: `1px solid rgba(255,255,255,0.06)`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 16, fontWeight: 700, color: T.text }}>NBA Intelligence Board</span>
                <SportBadge status="LIVE" />
              </div>
              <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textFaint, letterSpacing: "0.06em" }}>
                Playoffs active · {NBA_SIGNALS.length} signals · Updated continuously
              </div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {/* Signal count tiles */}
              {[
                { label: "Total", value: NBA_SIGNALS.length, color: T.text },
                { label: "Confirmed", value: NBA_SIGNALS.filter(s => s.verdict === "confirmed").length, color: T.green },
                { label: "High Conf", value: NBA_SIGNALS.filter(s => s.confidence >= 80).length, color: T.gold },
              ].map(stat => (
                <div key={stat.label} style={{ textAlign: "center", padding: "6px 12px", background: T.surface1, border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 3 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: stat.color, fontVariantNumeric: "tabular-nums" }}>{stat.value}</div>
                  <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, color: T.textFaint, letterSpacing: "0.12em", textTransform: "uppercase" }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Filter chips */}
          <div style={{ padding: "10px 20px", borderBottom: `1px solid rgba(255,255,255,0.06)`, display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
            {FILTERS.map(f => {
              const isActive = f === activeFilter;
              return (
                <button
                  key={f}
                  data-testid={`filter-${f.toLowerCase()}`}
                  onClick={() => setActiveFilter(f)}
                  style={{
                    padding: "5px 12px", borderRadius: 2, border: `1px solid ${isActive ? T.gold : "rgba(255,255,255,0.1)"}`,
                    background: isActive ? "rgba(202,168,90,0.1)" : "transparent",
                    color: isActive ? T.gold : T.textMuted,
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                    cursor: "pointer", transition: "all 0.12s",
                  }}
                >
                  {f}
                </button>
              );
            })}
          </div>

          {/* Tonight's slate strip */}
          <div style={{ padding: "10px 20px", borderBottom: `1px solid rgba(255,255,255,0.06)`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0, overflowX: "auto" }}>
            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.textFaint, flexShrink: 0 }}>Tonight</span>
            {NBA_TONIGHT.map(game => (
              <div key={game.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", background: T.surface2, borderRadius: 3, border: `1px solid rgba(255,255,255,0.06)`, flexShrink: 0, cursor: "pointer" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{game.away} @ {game.home}</span>
                <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.gold }}>{game.spread}</span>
                <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint }}>O/U {game.total}</span>
                <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint }}>{game.time}</span>
              </div>
            ))}
          </div>

          {/* Signal table */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 90px 70px 70px 70px", gap: 0, padding: "6px 20px", background: T.surface2, borderBottom: `1px solid rgba(255,255,255,0.06)`, position: "sticky", top: 0 }}>
              {["Type", "Signal", "Player / Team", "Verdict", "Conf", "Time"].map(h => (
                <div key={h} style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.textFaint }}>{h}</div>
              ))}
            </div>

            {filtered.length === 0 && (
              <div style={{ padding: "40px 20px", textAlign: "center", color: T.textFaint, fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 13, letterSpacing: "0.1em" }}>
                No signals match this filter
              </div>
            )}

            {filtered.map(sig => {
              const vColor = VERDICT_COLOR[sig.verdict] ?? T.textFaint;
              const isSelected = selected?.id === sig.id;
              return (
                <div
                  key={sig.id}
                  data-testid={`nba-signal-${sig.id}`}
                  onClick={() => setSelected(isSelected ? null : sig)}
                  style={{
                    display: "grid", gridTemplateColumns: "100px 1fr 90px 70px 70px 70px", gap: 0,
                    padding: "11px 20px", borderBottom: `1px solid rgba(255,255,255,0.04)`,
                    background: isSelected ? "rgba(202,168,90,0.05)" : "transparent",
                    cursor: "pointer", alignItems: "start", transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "rgba(202,168,90,0.025)"; }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                >
                  {/* Type */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, color: T.textFaint, paddingTop: 2 }}>
                    {TYPE_ICON[sig.type]}
                    <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textFaint }}>
                      {TYPE_LABEL[sig.type]}
                    </span>
                  </div>
                  {/* Headline */}
                  <div style={{ paddingRight: 16 }}>
                    <div style={{ fontSize: 13, color: T.text, fontWeight: 500, lineHeight: 1.4, marginBottom: 2 }}>{sig.headline}</div>
                    <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint, lineHeight: 1.4 }}>
                      {sig.action_takeaway.slice(0, 90)}{sig.action_takeaway.length > 90 ? "…" : ""}
                    </div>
                  </div>
                  {/* Player/Team */}
                  <div>
                    {sig.player && <div style={{ fontSize: 12, color: T.text, fontWeight: 500, marginBottom: 1 }}>{sig.player}</div>}
                    <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint }}>{sig.team}{sig.opponent ? ` · ${sig.opponent}` : ""}</div>
                  </div>
                  {/* Verdict */}
                  <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: vColor, paddingTop: 2 }}>
                    {sig.verdict}
                  </div>
                  {/* Confidence */}
                  <div style={{ paddingTop: 2 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: sig.confidence >= 80 ? T.gold : T.textMuted, fontVariantNumeric: "tabular-nums" }}>
                      {sig.confidence}%
                    </div>
                  </div>
                  {/* Time */}
                  <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint, paddingTop: 3 }}>
                    {sig.timestamp}
                  </div>
                </div>
              );
            })}

            {/* Stub notice */}
            <div style={{ margin: "16px 20px", padding: "10px 14px", background: "rgba(202,168,90,0.04)", border: `1px solid rgba(202,168,90,0.1)`, borderRadius: 4 }}>
              <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint, lineHeight: 1.5 }}>
                <strong style={{ color: T.gold }}>STUB DATA</strong> · {NBA_SIGNALS.length} realistic placeholder signals. Wire live NBA signal ingestion to replace. Click any row to see detail panel →
              </div>
            </div>
          </div>
        </div>

        {/* ─── Detail rail ─── */}
        {selected && (
          <DetailPanel sig={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </V2Shell>
  );
}
