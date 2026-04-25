import { useState } from "react";
import V2Shell, { SportBadge } from "../components/V2Shell";
import { NBA_SIGNALS, NBA_TONIGHT, type V2Signal } from "../data/v2MockData";
import {
  PlayerAvatar, TeamLogo, GameCard, FeaturedEdgeCard,
  VerdictBadge, TypeChip, ConfidenceBar, T, VERDICT_COLORS, getTeamColors,
} from "../components/v2/SportVisuals";
import { ChevronRight, X, Filter, Zap } from "lucide-react";

const FILTERS = ["Today", "Players", "Teams", "Injuries", "Props", "Matchups", "Playoffs"] as const;
type FilterKey = typeof FILTERS[number];

function matchFilter(sig: V2Signal, filter: FilterKey): boolean {
  if (filter === "Today") return true;
  if (filter === "Injuries") return sig.type === "injury";
  if (filter === "Props") return sig.type === "prop";
  if (filter === "Matchups") return sig.type === "matchup_edge";
  if (filter === "Players") return !!sig.player;
  if (filter === "Teams") return !sig.player;
  if (filter === "Playoffs") return sig.tags.some(t =>
    ["playoffs","LAL","BOS","MIA","GSW","DEN","MIN","OKC","DAL","NYK","PHI"].includes(t));
  return true;
}

/* ── Detail panel ── */
function DetailPanel({ sig, onClose }: { sig: V2Signal; onClose: () => void }) {
  const teamColors = getTeamColors(sig.team);
  const vColor = VERDICT_COLORS[sig.verdict] ?? T.textFaint;

  return (
    <div
      data-testid="detail-panel"
      style={{
        width: 340, background: T.surface1, borderLeft: `1px solid ${T.goldDim}`,
        flexShrink: 0, display: "flex", flexDirection: "column", overflowY: "auto",
      }}
    >
      {/* Hero visual band */}
      <div style={{
        height: 90, position: "relative", overflow: "hidden",
        background: `linear-gradient(135deg, ${teamColors.primary}CC, ${teamColors.primary}55)`,
        borderBottom: `1px solid rgba(255,255,255,0.07)`,
        display: "flex", alignItems: "flex-end", padding: "0 16px 12px",
      }}>
        {/* Background texture */}
        <div style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(ellipse at 80% 50%, ${teamColors.secondary}22, transparent 60%)`,
        }} />

        {/* Close button */}
        <button onClick={onClose} style={{
          position: "absolute", top: 10, right: 10,
          background: "rgba(0,0,0,0.4)", border: "none", borderRadius: "50%",
          color: T.textMuted, cursor: "pointer", width: 24, height: 24,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <X size={13} />
        </button>

        {/* Player / team visual */}
        {sig.player ? (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, position: "relative", zIndex: 2 }}>
            <PlayerAvatar name={sig.player} team={sig.team} size={60} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text, lineHeight: 1.2, marginBottom: 3 }}>{sig.player}</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <TeamLogo abbr={sig.team} size={16} />
                <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textFaint, letterSpacing: "0.1em", textTransform: "uppercase" }}>{sig.team}{sig.opponent ? ` · ${sig.opponent}` : ""}</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, position: "relative", zIndex: 2 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <TeamLogo abbr={sig.team} size={44} />
              {sig.opponent && <TeamLogo abbr={sig.opponent} size={44} />}
            </div>
            <div>
              <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 13, fontWeight: 700, color: T.text, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {sig.team}{sig.opponent ? ` vs ${sig.opponent}` : ""}
              </div>
              <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint }}>{sig.timestamp}</div>
            </div>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
        {[
          { label: "Verdict", value: sig.verdict.toUpperCase(), color: vColor },
          { label: "Confidence", value: `${sig.confidence}%`, color: sig.confidence >= 80 ? T.gold : T.text },
          { label: "Sources", value: String(sig.sources), color: T.text },
        ].map((s, i) => (
          <div key={s.label} style={{
            padding: "10px 0", textAlign: "center",
            background: T.surface2,
            borderRight: i < 2 ? `1px solid rgba(255,255,255,0.05)` : "none",
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: s.color, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
            <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, color: T.textFaint, letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Confidence bar */}
      <div style={{ padding: "10px 16px 0", display: "flex", alignItems: "center", gap: 8 }}>
        <ConfidenceBar value={sig.confidence} width="100%" as any height={6} />
      </div>

      {/* Body */}
      <div style={{ padding: "14px 16px", flex: 1 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          <TypeChip type={sig.type} />
          <VerdictBadge verdict={sig.verdict} />
        </div>

        <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.4, marginBottom: 12 }}>
          {sig.headline}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.textFaint, marginBottom: 5 }}>Signal Detail</div>
          <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>{sig.detail}</div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.textFaint, marginBottom: 5 }}>Why It Matters</div>
          <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>{sig.why_it_matters}</div>
        </div>

        <div style={{
          background: "rgba(202,168,90,0.07)", border: `1px solid rgba(202,168,90,0.22)`,
          borderRadius: 4, padding: "12px 14px",
        }}>
          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.gold, marginBottom: 6 }}>
            ⚡ Action Takeaway
          </div>
          <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6, fontWeight: 500 }}>{sig.action_takeaway}</div>
        </div>

        {/* Tags */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 12 }}>
          {sig.tags.map(tag => (
            <span key={tag} style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
              color: T.textFaint, padding: "2px 6px",
              background: "rgba(255,255,255,0.05)", borderRadius: 2,
            }}>{tag}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function NBABoard() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("Today");
  const [selected, setSelected] = useState<V2Signal | null>(null);

  const filtered = NBA_SIGNALS.filter(s => matchFilter(s, activeFilter));

  // Featured signal: highest confidence non-selected
  const featured = NBA_SIGNALS.find(s => s.confidence >= 84) ?? NBA_SIGNALS[0];

  return (
    <V2Shell boardsMode>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .sig-row:hover { background: rgba(202,168,90,0.03) !important; }
      `}</style>

      <div style={{ display: "flex", height: "100%", minHeight: "calc(100vh - 48px)" }}>

        {/* ─── Board subnav ─── */}
        <aside style={{
          width: 196, background: T.surface1, borderRight: `1px solid ${T.goldDim}`,
          flexShrink: 0, padding: "16px 10px", overflowY: "auto",
        }}>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
            color: T.textFaint, padding: "0 8px", marginBottom: 10,
          }}>NBA Board</div>

          {[
            { label: "Signal Stream", active: true },
            { label: "Tonight's Slate", active: false },
            { label: "Injury Volatility", active: false },
            { label: "Line Movement", active: false },
            { label: "Matchup Edges", active: false },
            { label: "Rotation Notes", active: false },
            { label: "Playoff Tracker", active: false },
          ].map(({ label, active }) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", marginBottom: 1,
              borderRadius: 3, borderLeft: `2px solid ${active ? T.gold : "transparent"}`,
              background: active ? "rgba(202,168,90,0.07)" : "transparent",
              color: active ? T.gold : T.textMuted, cursor: "pointer",
              transition: "background 0.12s, color 0.12s",
            }}>
              <ChevronRight size={10} style={{ opacity: active ? 1 : 0.4 }} />
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
              }}>{label}</span>
            </div>
          ))}

          <div style={{ margin: "16px 0 10px", borderTop: `1px solid ${T.goldDim}` }} />

          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
            color: T.textFaint, padding: "0 8px", marginBottom: 8,
          }}>Quick Teams</div>

          {["LAL", "BOS", "DEN", "GSW", "MIA", "OKC", "NYK", "MIN"].map(tm => (
            <div key={tm} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 3,
              cursor: "pointer",
            }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.background = "rgba(202,168,90,0.04)"; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.background = "transparent"; }}
            >
              <TeamLogo abbr={tm} size={20} />
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textMuted,
              }}>{tm}</span>
            </div>
          ))}
        </aside>

        {/* ─── Main canvas ─── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

          {/* Board header */}
          <div style={{
            padding: "12px 20px", borderBottom: `1px solid rgba(255,255,255,0.06)`,
            display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
            background: T.surface1,
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 16, fontWeight: 700, color: T.text }}>
                  NBA Intelligence Board
                </span>
                <SportBadge status="LIVE" />
              </div>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 11, color: T.textFaint, letterSpacing: "0.06em",
              }}>
                Playoffs active · {NBA_SIGNALS.length} signals · Updated continuously
              </div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {[
                { label: "Total", value: NBA_SIGNALS.length, color: T.text },
                { label: "Confirmed", value: NBA_SIGNALS.filter(s => s.verdict === "confirmed").length, color: T.green },
                { label: "High Conf", value: NBA_SIGNALS.filter(s => s.confidence >= 80).length, color: T.gold },
              ].map(stat => (
                <div key={stat.label} style={{
                  textAlign: "center", padding: "6px 12px",
                  background: T.surface2, border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 3,
                }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: stat.color, fontVariantNumeric: "tabular-nums" }}>{stat.value}</div>
                  <div style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 9, color: T.textFaint, letterSpacing: "0.12em", textTransform: "uppercase",
                  }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Tonight's Slate strip ── */}
          <div style={{
            padding: "12px 20px", borderBottom: `1px solid rgba(255,255,255,0.06)`,
            flexShrink: 0, overflowX: "auto",
          }}>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
              color: T.textFaint, marginBottom: 10,
            }}>
              Tonight's Slate
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              {NBA_TONIGHT.map(game => (
                <div key={game.id} style={{ width: 220, flexShrink: 0 }}>
                  <GameCard
                    away={game.away} home={game.home}
                    time={game.time} series={game.series}
                    spread={game.spread} total={game.total}
                    compact
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── Featured Edge ── */}
          <div style={{ padding: "16px 20px 0", flexShrink: 0 }}>
            <FeaturedEdgeCard signal={featured} sport="NBA" />
          </div>

          {/* ── Filter chips ── */}
          <div style={{
            padding: "12px 20px", borderBottom: `1px solid rgba(255,255,255,0.06)`,
            display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap",
            marginTop: 16,
          }}>
            <Filter size={11} style={{ color: T.textFaint, marginRight: 4 }} />
            {FILTERS.map(f => {
              const isActive = f === activeFilter;
              return (
                <button
                  key={f}
                  data-testid={`filter-${f.toLowerCase()}`}
                  onClick={() => setActiveFilter(f)}
                  style={{
                    padding: "5px 12px", borderRadius: 2,
                    border: `1px solid ${isActive ? T.gold : "rgba(255,255,255,0.1)"}`,
                    background: isActive ? "rgba(202,168,90,0.1)" : "transparent",
                    color: isActive ? T.gold : T.textMuted,
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                    cursor: "pointer", transition: "all 0.12s",
                  }}
                >{f}</button>
              );
            })}
          </div>

          {/* ── Signal table ── */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {/* Header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "36px 120px 1fr 110px 80px 80px 72px",
              padding: "6px 20px",
              background: T.surface2,
              borderBottom: `1px solid rgba(255,255,255,0.06)`,
              position: "sticky", top: 0, zIndex: 5,
            }}>
              {["", "Type", "Signal", "Player", "Verdict", "Conf", "Time"].map(h => (
                <div key={h} style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
                  color: T.textFaint,
                }}>{h}</div>
              ))}
            </div>

            {filtered.map((sig, idx) => {
              const isSelected = selected?.id === sig.id;
              const vColor = VERDICT_COLORS[sig.verdict] ?? T.textFaint;
              const typeColor = { injury: T.danger, line_move: T.green, matchup_edge: T.gold, prop: T.orange, rotation: T.cyan, news: T.textMuted, trend: T.cyan }[sig.type] ?? T.textFaint;

              return (
                <div
                  key={sig.id}
                  className="sig-row"
                  data-testid={`nba-signal-${sig.id}`}
                  onClick={() => setSelected(isSelected ? null : sig)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "36px 120px 1fr 110px 80px 80px 72px",
                    padding: "10px 20px",
                    borderBottom: `1px solid rgba(255,255,255,0.04)`,
                    background: isSelected ? "rgba(202,168,90,0.055)" : "transparent",
                    cursor: "pointer", alignItems: "center",
                    borderLeft: `3px solid ${isSelected ? T.gold : typeColor + "55"}`,
                    transition: "background 0.1s, border-left-color 0.1s",
                  }}
                >
                  {/* Index */}
                  <div style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 10, color: T.textFaint, fontVariantNumeric: "tabular-nums",
                  }}>{idx + 1}</div>

                  {/* Type */}
                  <div><TypeChip type={sig.type} /></div>

                  {/* Headline */}
                  <div style={{ paddingRight: 16 }}>
                    <div style={{ fontSize: 13, color: T.text, fontWeight: 500, lineHeight: 1.35, marginBottom: 2 }}>
                      {sig.headline}
                    </div>
                    <div style={{
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 10, color: T.textFaint, lineHeight: 1.4,
                    }}>
                      {sig.action_takeaway.slice(0, 70)}…
                    </div>
                  </div>

                  {/* Player avatar + team */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {sig.player ? (
                      <>
                        <PlayerAvatar name={sig.player} team={sig.team} size={28} />
                        <div>
                          <div style={{ fontSize: 11, color: T.text, fontWeight: 600, lineHeight: 1.2 }}>
                            {sig.player.split(" ").slice(-1)[0]}
                          </div>
                          <div style={{
                            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                            fontSize: 9, color: T.textFaint, letterSpacing: "0.1em",
                          }}>{sig.team}</div>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <TeamLogo abbr={sig.team} size={22} />
                        {sig.opponent && <TeamLogo abbr={sig.opponent} size={22} />}
                      </div>
                    )}
                  </div>

                  {/* Verdict */}
                  <VerdictBadge verdict={sig.verdict} />

                  {/* Confidence */}
                  <div>
                    <div style={{
                      fontSize: 14, fontWeight: 700, color: sig.confidence >= 80 ? T.gold : T.textMuted,
                      fontVariantNumeric: "tabular-nums", marginBottom: 3,
                    }}>{sig.confidence}%</div>
                    <ConfidenceBar value={sig.confidence} width={50} height={3} />
                  </div>

                  {/* Time */}
                  <div style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 10, color: T.textFaint,
                  }}>{sig.timestamp}</div>
                </div>
              );
            })}

            {/* Stub notice */}
            <div style={{
              margin: "16px 20px", padding: "10px 14px",
              background: "rgba(202,168,90,0.04)", border: `1px solid rgba(202,168,90,0.1)`, borderRadius: 4,
            }}>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 10, color: T.textFaint, lineHeight: 1.5,
              }}>
                <strong style={{ color: T.gold }}>STUB DATA</strong> · {NBA_SIGNALS.length} realistic placeholder signals. Wire live NBA signal ingestion to replace. Click any row to open the intelligence detail panel →
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
