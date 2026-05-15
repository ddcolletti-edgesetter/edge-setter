import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import V2Shell from "../components/V2Shell";
import { Award, ExternalLink, TrendingUp, Clock } from "lucide-react";

const T = {
  bg:        "#0A0B0D",
  surface1:  "#111317",
  surface2:  "#16191E",
  gold:      "#CAA85A",
  goldDim:   "rgba(202,168,90,0.16)",
  goldBorder:"rgba(202,168,90,0.12)",
  text:      "#F3EFE6",
  textMuted: "#B7AFA0",
  textFaint: "#7E776A",
  green:     "#4CAF82",
  cyan:      "#4AA8C8",
  purple:    "#A778DC",
  red:       "#E05C5C",
  border:    "rgba(255,255,255,0.06)",
};

function computeTier(acc: number): string {
  if (acc >= 85) return "tier1";
  if (acc >= 70) return "tier2";
  if (acc >= 55) return "tier3";
  return "tier4";
}

function tierLabel(tier: string): string {
  switch (tier) {
    case "tier1": return "TIER 1 ELITE";
    case "tier2": return "TIER 2";
    case "tier3": return "TIER 3";
    default:      return "TIER 4";
  }
}

function tierColors(tier: string): { bg: string; border: string; color: string } {
  switch (tier) {
    case "tier1": return { bg: "rgba(202,168,90,0.14)", border: "rgba(202,168,90,0.48)", color: T.gold };
    case "tier2": return { bg: "rgba(74,168,200,0.12)", border: "rgba(74,168,200,0.38)", color: T.cyan };
    case "tier3": return { bg: "rgba(76,175,130,0.10)", border: "rgba(76,175,130,0.34)", color: T.green };
    default:      return { bg: "rgba(126,119,106,0.08)", border: "rgba(126,119,106,0.28)", color: T.textFaint };
  }
}

const SOURCE_SPORT: Record<string, string> = {
  "ESPN NBA": "NBA", "The Athletic NBA": "NBA", "NBA Beat Writers (General)": "NBA",
  "Shams Charania": "NBA", "Adrian Wojnarowski": "NBA", "Bleacher Report NBA": "NBA",
  "ESPN MLB": "MLB", "The Athletic MLB": "MLB", "MLB Beat Writers (General)": "MLB",
  "Jon Heyman": "MLB", "Ken Rosenthal": "MLB", "Baseball Reference": "MLB",
  "FanGraphs": "MLB", "Bob Nightengale": "MLB", "Mark Feinsand": "MLB", "Rotowire MLB": "MLB",
  "Adam Schefter": "NFL", "Ian Rapoport": "NFL", "Tom Pelissero": "NFL",
  "Jeremy Fowler": "NFL", "Jay Glazer": "NFL", "The Athletic NFL": "NFL",
  "Pro Football Focus": "NFL", "ProFootballTalk": "NFL", "OverTheCap": "NFL",
  "Phil Steele": "CFB", "Field Yates": "NFL",
};

function getSourceSport(name: string): string {
  return SOURCE_SPORT[name] ?? "ALL";
}

type Sport = "ALL" | "NBA" | "MLB" | "NFL" | "CFB";
type SortKey = "accuracy" | "weight" | "claims" | "lead_time";

const SPORTS: Sport[] = ["ALL", "NBA", "MLB", "NFL", "CFB"];
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "accuracy",  label: "Accuracy %" },
  { key: "weight",    label: "Consensus Weight" },
  { key: "claims",    label: "Total Claims" },
  { key: "lead_time", label: "Lead Time" },
];

function RankMedal({ rank }: { rank: number }) {
  if (rank <= 3) {
    const emoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉";
    return <span style={{ fontSize: 15, lineHeight: 1 }}>{emoji}</span>;
  }
  return (
    <span style={{
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: 12, fontWeight: 700, color: T.textFaint, fontVariantNumeric: "tabular-nums",
    }}>{rank}</span>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const c = tierColors(tier);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 3,
      border: `1px solid ${c.border}`, background: c.bg,
      fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
      textTransform: "uppercase" as const, color: c.color, whiteSpace: "nowrap" as const,
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
    }}>
      {tierLabel(tier)}
    </span>
  );
}

function SportBadge({ sport }: { sport: string }) {
  if (sport === "ALL") return null;
  const colors: Record<string, { bg: string; color: string }> = {
    NBA: { bg: "rgba(202,168,90,0.10)", color: T.gold },
    MLB: { bg: "rgba(76,175,130,0.10)", color: T.green },
    NFL: { bg: "rgba(74,168,200,0.10)", color: T.cyan },
    CFB: { bg: "rgba(167,120,220,0.10)", color: T.purple },
  };
  const c = colors[sport] ?? { bg: "rgba(255,255,255,0.05)", color: T.textFaint };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "1px 6px", borderRadius: 2,
      background: c.bg, fontSize: 10, fontWeight: 700,
      letterSpacing: "0.12em", textTransform: "uppercase" as const, color: c.color,
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
    }}>{sport}</span>
  );
}

function Bar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div style={{ width: "100%", height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
    </div>
  );
}

export default function V2Sources() {
  return <V2Shell boardsMode><V2SourcesInner /></V2Shell>;
}

function V2SourcesInner() {
  const [sport, setSport] = useState<Sport>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("accuracy");

  const { data: rawScores, isLoading } = useQuery({
    queryKey: ["/api/leaderboard"],
    queryFn: () => apiRequest("GET", "/api/leaderboard").then(r => r.json()),
    refetchInterval: 60000,
  });

  const scores = useMemo(() => {
    if (!rawScores) return [];
    const seen = new Map<string, any>();
    for (const row of rawScores as any[]) {
      const key = row.source_id ?? row.source_name ?? row.id;
      if (!key) continue;
      const existing = seen.get(key);
      if (!existing || parseFloat(row.overall_accuracy ?? 0) > parseFloat(existing.overall_accuracy ?? 0)) {
        seen.set(key, row);
      }
    }
    return Array.from(seen.values()).map(row => ({
      ...row,
      _acc:      parseFloat(row.overall_accuracy ?? "0"),
      _lead:     parseFloat(row.average_lead_time_minutes ?? "0"),
      _fp:       parseFloat(row.false_positive_rate ?? "0"),
      _sport:    getSourceSport(row.source_name ?? ""),
      _tier:     computeTier(parseFloat(row.overall_accuracy ?? "0")),
    }));
  }, [rawScores]);

  const filtered = useMemo(() => {
    const list = sport === "ALL"
      ? [...scores]
      : scores.filter(s => s._sport === sport || s._sport === "ALL");
    return list.sort((a, b) => {
      if (sortKey === "lead_time") return a._lead - b._lead;
      return b._acc - a._acc;
    });
  }, [scores, sport, sortKey]);

  const tier1Count = scores.filter(s => s._tier === "tier1").length;

  return (
    <div style={{ background: T.bg, minHeight: "100%", padding: "24px 24px 60px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Award size={16} color={T.gold} />
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: T.textFaint,
              }}>Source Intelligence</span>
            </div>
            <h1 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 22, fontWeight: 700, color: T.text, margin: "0 0 5px",
            }}>SOURCE LEADERBOARD</h1>
            <p style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 12, color: T.textMuted, margin: 0, letterSpacing: "0.04em",
            }}>Accuracy rankings across all tracked intelligence sources</p>
          </div>

          <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
            {[
              { label: "Sources Tracked", value: isLoading ? "—" : String(scores.length) },
              { label: "Tier 1 Elite",    value: isLoading ? "—" : String(tier1Count), gold: true },
              { label: "Total Claims",    value: "—" },
            ].map(s => (
              <div key={s.label} style={{
                textAlign: "center", padding: "8px 16px",
                background: T.surface1,
                border: `1px solid ${s.gold ? T.goldDim : T.border}`,
                borderRadius: 4,
              }}>
                <div style={{
                  fontSize: 19, fontWeight: 700, color: s.gold ? T.gold : T.text,
                  fontVariantNumeric: "tabular-nums",
                }}>{s.value}</div>
                <div style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 10, color: T.textFaint, letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 2,
                }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Rule ── */}
        <div style={{ height: 1, background: T.goldBorder, marginBottom: 18 }} />

        {/* ── Filters + Sort ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          {SPORTS.map(s => {
            const active = sport === s;
            return (
              <button key={s} onClick={() => setSport(s)} style={{
                padding: "5px 14px", borderRadius: 3,
                border: `1px solid ${active ? "rgba(202,168,90,0.50)" : "rgba(255,255,255,0.10)"}`,
                background: active ? "rgba(202,168,90,0.12)" : "transparent",
                color: active ? T.gold : T.textMuted,
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
                textTransform: "uppercase", cursor: "pointer", transition: "all 0.12s",
              }}>{s === "ALL" ? "All Sports" : s}</button>
            );
          })}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.textFaint,
            }}>Sort:</span>
            {SORT_OPTIONS.map(o => {
              const active = sortKey === o.key;
              return (
                <button key={o.key} onClick={() => setSortKey(o.key)} style={{
                  padding: "4px 10px", borderRadius: 2,
                  border: `1px solid ${active ? "rgba(202,168,90,0.40)" : "rgba(255,255,255,0.07)"}`,
                  background: active ? "rgba(202,168,90,0.08)" : "transparent",
                  color: active ? T.gold : T.textFaint,
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
                  textTransform: "uppercase", cursor: "pointer", transition: "all 0.1s",
                }}>{o.label}</button>
              );
            })}
          </div>
        </div>

        {/* ── Loading ── */}
        {isLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ height: 52, background: T.surface1, borderRadius: 3, opacity: 0.4 + i * 0.05 }} />
            ))}
          </div>
        )}

        {/* ── Table ── */}
        {!isLoading && filtered.length > 0 && (
          <div style={{ border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 5, overflow: "hidden" }}>

            {/* Col headers */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "44px 1fr 140px 200px 170px 72px 80px",
              padding: "8px 16px",
              background: T.surface2,
              borderBottom: "1px solid rgba(255,255,255,0.07)",
            }}>
              {[
                { label: "#" },
                { label: "Source" },
                { label: "Tier" },
                { label: "Accuracy %", icon: <TrendingUp size={10} /> },
                { label: "Consensus Weight" },
                { label: "FP Rate", right: true },
                { label: "Lead Time", icon: <Clock size={10} />, right: true },
              ].map(h => (
                <div key={h.label} style={{
                  display: "flex", alignItems: "center", gap: 4,
                  justifyContent: h.right ? "flex-end" : "flex-start",
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.16em",
                  textTransform: "uppercase", color: T.textFaint,
                }}>
                  {h.icon}{h.label}
                </div>
              ))}
            </div>

            {/* Rows */}
            {filtered.map((s, i) => {
              const acc = s._acc;
              const accColor = acc >= 85 ? T.gold : acc >= 70 ? T.cyan : acc >= 55 ? T.textMuted : T.textFaint;
              return (
                <div
                  key={s.source_id ?? s.id ?? i}
                  data-testid={`leaderboard-row-${s.source_id}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "44px 1fr 140px 200px 170px 72px 80px",
                    padding: "11px 16px", alignItems: "center",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(202,168,90,0.025)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                >
                  {/* Rank */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <RankMedal rank={i + 1} />
                  </div>

                  {/* Source name + sport badge + link */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{
                        fontSize: 13, fontWeight: 600, color: T.text,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{s.source_name}</span>
                      <SportBadge sport={s._sport} />
                      {s.source_url && (
                        <a href={s.source_url} target="_blank" rel="noopener noreferrer"
                          style={{ color: T.textFaint, display: "flex", flexShrink: 0 }}>
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Tier badge */}
                  <div><TierBadge tier={s._tier} /></div>

                  {/* Accuracy bar */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700, color: accColor,
                        fontVariantNumeric: "tabular-nums", minWidth: 38,
                      }}>{acc.toFixed(1)}%</span>
                    </div>
                    <Bar value={acc} color={accColor} />
                  </div>

                  {/* Consensus weight bar (accuracy proxy) */}
                  <div>
                    <Bar value={acc} color="rgba(202,168,90,0.55)" />
                  </div>

                  {/* FP Rate */}
                  <div style={{
                    textAlign: "right",
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 12, color: s._fp > 20 ? T.red : T.textMuted,
                    fontVariantNumeric: "tabular-nums",
                  }}>{s._fp.toFixed(1)}%</div>

                  {/* Lead time */}
                  <div style={{
                    textAlign: "right",
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 12, color: T.textMuted, fontVariantNumeric: "tabular-nums",
                  }}>{s._lead.toFixed(0)}m</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && filtered.length === 0 && (
          <div style={{
            padding: "48px", textAlign: "center",
            border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5,
          }}>
            <Award size={28} color={T.textFaint} style={{ margin: "0 auto 10px", display: "block" }} />
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textFaint,
            }}>
              No sources found{sport !== "ALL" ? ` for ${sport}` : ""}
            </div>
          </div>
        )}

        {/* ── Grade legend ── */}
        <div style={{
          marginTop: 28, padding: "14px 18px",
          background: T.surface1, border: `1px solid ${T.goldBorder}`, borderRadius: 4,
        }}>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
            color: T.textFaint, marginBottom: 10,
          }}>Grade Legend</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {[
              { tier: "tier1", desc: "85%+ accuracy" },
              { tier: "tier2", desc: "70–84% accuracy" },
              { tier: "tier3", desc: "55–69% accuracy" },
              { tier: "tier4", desc: "<55% accuracy" },
            ].map(g => {
              const c = tierColors(g.tier);
              return (
                <div key={g.tier} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{
                    padding: "1px 7px", borderRadius: 2,
                    border: `1px solid ${c.border}`, background: c.bg,
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
                    textTransform: "uppercase" as const, color: c.color,
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  }}>{tierLabel(g.tier)}</span>
                  <span style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 11, color: T.textFaint,
                  }}>{g.desc}</span>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
