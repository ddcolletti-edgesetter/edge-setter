import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import V2Shell from "../components/V2Shell";
import { Award, TrendingUp, Clock, AlertCircle, CheckCircle } from "lucide-react";

const T = {
  bg:         "#0C0B09",
  surface1:   "#111317",
  surface2:   "#16191E",
  gold:       "#F5A623",
  goldDim:    "rgba(245,166,35,0.16)",
  goldBorder: "rgba(245,166,35,0.12)",
  text:       "#F3EFE6",
  textMuted:  "#B7AFA0",
  textFaint:  "#7E776A",
  green:      "#4CAF82",
  cyan:       "#4AA8C8",
  purple:     "#A778DC",
  red:        "#E05C5C",
  orange:     "#E87040",
  border:     "rgba(255,255,255,0.06)",
};

// ── Sport detection ──────────────────────────────────────────────────────────
const SOURCE_SPORT: Record<string, string> = {
  "ESPN NBA": "NBA", "The Athletic NBA": "NBA", "NBA Beat Writers (General)": "NBA",
  "Shams Charania": "NBA", "Adrian Wojnarowski": "NBA", "Bleacher Report NBA": "NBA",
  "ESPN MLB": "MLB", "The Athletic MLB": "MLB", "MLB Beat Writers (General)": "MLB",
  "Jon Heyman": "MLB", "Ken Rosenthal": "MLB", "Baseball Reference": "MLB",
  "FanGraphs": "MLB", "Bob Nightengale": "MLB", "Mark Feinsand": "MLB", "Rotowire MLB": "MLB",
  "Adam Schefter": "NFL", "Ian Rapoport": "NFL", "Tom Pelissero": "NFL",
  "Jeremy Fowler": "NFL", "Jay Glazer": "NFL", "The Athletic NFL": "NFL",
  "Pro Football Focus": "NFL", "ProFootballTalk": "NFL", "OverTheCap": "NFL",
  "Field Yates": "NFL",
  "Phil Steele": "CFB",
};

function getSourceSport(name: string): string {
  return SOURCE_SPORT[name] ?? "OTHER";
}

// ── Accuracy grade ───────────────────────────────────────────────────────────
function accuracyGrade(acc: number): string {
  if (acc >= 90) return "A+";
  if (acc >= 85) return "A";
  if (acc >= 80) return "B+";
  if (acc >= 75) return "B";
  if (acc >= 70) return "C+";
  if (acc >= 65) return "C";
  if (acc >= 55) return "D";
  return "F";
}

function gradeColor(acc: number): string {
  if (acc >= 85) return T.gold;
  if (acc >= 70) return T.cyan;
  if (acc >= 55) return T.textMuted;
  return T.textFaint;
}

// ── Status badge ─────────────────────────────────────────────────────────────
type StatusBadge = "ELITE" | "TRUSTED" | "TRACKED" | "UNVERIFIED";

function statusBadge(acc: number, verifiedCount: number): StatusBadge {
  if (acc >= 85) return "ELITE";
  if (acc >= 70) return "TRUSTED";
  if (acc >= 40 || verifiedCount > 0) return "TRACKED";
  return "UNVERIFIED";
}

function statusBadgeStyle(badge: StatusBadge): { bg: string; border: string; color: string } {
  switch (badge) {
    case "ELITE":      return { bg: "rgba(245,166,35,0.14)", border: "rgba(245,166,35,0.50)", color: T.gold };
    case "TRUSTED":    return { bg: "rgba(74,168,200,0.12)", border: "rgba(74,168,200,0.40)", color: T.cyan };
    case "TRACKED":    return { bg: "rgba(76,175,130,0.10)", border: "rgba(76,175,130,0.36)", color: T.green };
    case "UNVERIFIED": return { bg: "rgba(126,119,106,0.08)", border: "rgba(126,119,106,0.28)", color: T.textFaint };
  }
}

// ── Sport badge colors ────────────────────────────────────────────────────────
function sportPillStyle(sport: string): { bg: string; color: string } {
  switch (sport) {
    case "NBA": return { bg: "rgba(232,112,64,0.14)", color: T.orange };
    case "MLB": return { bg: "rgba(74,168,200,0.14)", color: T.cyan };
    case "NFL": return { bg: "rgba(76,175,130,0.14)", color: T.green };
    case "CFB": return { bg: "rgba(167,120,220,0.14)", color: T.purple };
    default:    return { bg: "rgba(255,255,255,0.05)", color: T.textFaint };
  }
}

// ── Subtitle from source_type ─────────────────────────────────────────────────
function sourceSubtitle(type: string | null): string {
  if (!type || type === "auto") return "Source";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

// ── Lead time formatting ──────────────────────────────────────────────────────
function fmtLead(mins: number): string {
  if (mins <= 0) return "—";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Mini bar ──────────────────────────────────────────────────────────────────
function Bar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
    </div>
  );
}

type Sport = "ALL" | "NBA" | "MLB" | "NFL" | "CFB";
type SortKey = "accuracy" | "weight" | "lead_time" | "verified";

const SPORT_OPTIONS: { value: Sport; label: string }[] = [
  { value: "ALL", label: "All Sports" },
  { value: "NBA", label: "NBA" },
  { value: "MLB", label: "MLB" },
  { value: "NFL", label: "NFL" },
  { value: "CFB", label: "CFB" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "accuracy",  label: "Accuracy %" },
  { value: "weight",    label: "Consensus Weight" },
  { value: "lead_time", label: "Lead Time" },
  { value: "verified",  label: "Verified Count" },
];

const COL = "44px 1fr 150px 130px 95px 75px 82px 72px";

export default function AccuracyPage() {
  return <V2Shell><AccuracyPageInner /></V2Shell>;
}

function AccuracyPageInner() {
  const [sport, setSport]   = useState<Sport>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("accuracy");

  const { data: rawScores, isLoading } = useQuery({
    queryKey: ["/api/leaderboard"],
    queryFn: () => apiRequest("GET", "/api/leaderboard").then(r => r.json()),
    refetchInterval: 60_000,
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
    return Array.from(seen.values()).map(row => {
      const acc       = parseFloat(row.overall_accuracy ?? "0");
      const verified  = row.verified_count ?? 0;
      const rel       = parseFloat(row.reliability_score ?? "0");
      const weight    = rel > 0 ? Math.round(rel) : Math.round(acc * 0.85);
      return {
        ...row,
        _acc:     acc,
        _lead:    parseFloat(row.average_lead_time_minutes ?? "0"),
        _fp:      parseFloat(row.false_positive_rate ?? "0"),
        _sport:   getSourceSport(row.source_name ?? ""),
        _badge:   statusBadge(acc, verified),
        _weight:  weight,
        _verified: verified,
      };
    });
  }, [rawScores]);

  const filtered = useMemo(() => {
    const list = sport === "ALL"
      ? [...scores]
      : scores.filter(s => s._sport === sport);
    return list.sort((a, b) => {
      if (sortKey === "lead_time") return a._lead - b._lead;
      if (sortKey === "weight")    return b._weight - a._weight;
      if (sortKey === "verified")  return b._verified - a._verified;
      return b._acc - a._acc;
    });
  }, [scores, sport, sortKey]);

  // ── Header stats ────────────────────────────────────────────────────────────
  const eliteCount    = scores.filter(s => s._badge === "ELITE").length;
  const avgAcc        = scores.length > 0
    ? scores.reduce((s, r) => s + r._acc, 0) / scores.length
    : 0;
  const totalVerified = scores.reduce((s, r) => s + r._verified, 0);

  const stats = [
    { label: "Sources Tracked",      value: isLoading ? "—" : String(scores.length) },
    { label: "Elite Sources",         value: isLoading ? "—" : String(eliteCount),         gold: true },
    { label: "Avg Accuracy",          value: isLoading ? "—" : `${avgAcc.toFixed(1)}%` },
    { label: "Total Claims Verified", value: isLoading ? "—" : String(totalVerified) },
  ];

  return (
    <div style={{ background: T.bg, minHeight: "100%", padding: "24px 24px 60px" }}>
      <div style={{ maxWidth: 1140, margin: "0 auto" }}>

        {/* ── Page header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Award size={15} color={T.gold} />
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.22em",
                textTransform: "uppercase", color: T.textFaint,
              }}>Intelligence Verified</span>
            </div>
            <h1 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 22, fontWeight: 700, color: T.text, margin: "0 0 5px",
            }}>SOURCE ACCURACY</h1>
            <p style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 12, color: T.textMuted, margin: 0, letterSpacing: "0.04em",
            }}>Verified accuracy rankings across all tracked intelligence sources</p>
          </div>

          {/* Stats bar */}
          <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
            {stats.map(s => (
              <div key={s.label} style={{
                textAlign: "center", padding: "8px 16px",
                background: T.surface1,
                border: `1px solid ${s.gold ? T.goldDim : T.border}`,
                borderRadius: 4, minWidth: 90,
              }}>
                <div style={{
                  fontSize: 18, fontWeight: 700,
                  color: s.gold ? T.gold : T.text,
                  fontVariantNumeric: "tabular-nums",
                }}>{s.value}</div>
                <div style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 9, color: T.textFaint, letterSpacing: "0.12em",
                  textTransform: "uppercase", marginTop: 2,
                }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Divider ── */}
        <div style={{ height: 1, background: T.goldBorder, marginBottom: 18 }} />

        {/* ── Filters ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
              textTransform: "uppercase", color: T.textFaint,
            }}>Sport:</span>
            <select
              value={sport}
              onChange={e => setSport(e.target.value as Sport)}
              style={{
                background: T.surface2, color: T.text,
                border: `1px solid rgba(255,255,255,0.12)`,
                borderRadius: 3, padding: "5px 28px 5px 10px",
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
                appearance: "none", cursor: "pointer", outline: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%237E776A'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center",
              }}
            >
              {SPORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
              textTransform: "uppercase", color: T.textFaint,
            }}>Sort:</span>
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              style={{
                background: T.surface2, color: T.text,
                border: `1px solid rgba(255,255,255,0.12)`,
                borderRadius: 3, padding: "5px 28px 5px 10px",
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
                appearance: "none", cursor: "pointer", outline: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%237E776A'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center",
              }}
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* ── Loading skeleton ── */}
        {isLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{
                height: 56, background: T.surface1,
                borderRadius: 3, opacity: 0.35 + i * 0.05,
              }} />
            ))}
          </div>
        )}

        {/* ── Table ── */}
        {!isLoading && filtered.length > 0 && (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" as any, borderRadius: 5 }}>
          <div style={{ border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 5, overflow: "hidden", minWidth: 760 }}>

            {/* Column headers */}
            <div style={{
              display: "grid", gridTemplateColumns: COL,
              padding: "8px 16px",
              background: T.surface2,
              borderBottom: "1px solid rgba(255,255,255,0.07)",
            }}>
              {[
                { label: "#",               icon: null,                     right: false },
                { label: "Source",          icon: null,                     right: false },
                { label: "Accuracy",        icon: <TrendingUp size={9} />,  right: false },
                { label: "Consensus Wt.",   icon: null,                     right: false },
                { label: "Lead Time",       icon: <Clock size={9} />,       right: true  },
                { label: "False+%",         icon: <AlertCircle size={9} />, right: true  },
                { label: "Verified",        icon: <CheckCircle size={9} />, right: true  },
                { label: "Sport",           icon: null,                     right: false },
              ].map(h => (
                <div key={h.label} style={{
                  display: "flex", alignItems: "center", gap: 3,
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
              const badge  = s._badge as StatusBadge;
              const bs     = statusBadgeStyle(badge);
              const gc     = gradeColor(s._acc);
              const grade  = accuracyGrade(s._acc);
              const sport2 = s._sport;
              const sp     = sportPillStyle(sport2);
              return (
                <div
                  key={s.source_id ?? s.id ?? i}
                  style={{
                    display: "grid", gridTemplateColumns: COL,
                    padding: "11px 16px", alignItems: "center",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(202,168,90,0.025)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                >
                  {/* Rank */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {i < 3 ? (
                      <span style={{ fontSize: 14, lineHeight: 1 }}>
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                      </span>
                    ) : (
                      <span style={{
                        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                        fontSize: 12, fontWeight: 700, color: T.textFaint,
                        fontVariantNumeric: "tabular-nums",
                      }}>{i + 1}</span>
                    )}
                  </div>

                  {/* Source name + subtitle + status badge */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2, flexWrap: "wrap" }}>
                      <span style={{
                        display: "block", width: "100%",
                        fontSize: 13, fontWeight: 600, color: T.text,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{s.source_name}</span>
                      <span style={{
                        display: "inline-flex", alignItems: "center",
                        padding: "1px 6px", borderRadius: 2,
                        border: `1px solid ${bs.border}`, background: bs.bg,
                        fontSize: 9, fontWeight: 700, letterSpacing: "0.13em",
                        textTransform: "uppercase", color: bs.color,
                        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                        whiteSpace: "nowrap",
                      }}>{badge}</span>
                    </div>
                    <div style={{
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 10, color: T.textFaint, letterSpacing: "0.06em",
                    }}>{sourceSubtitle(s.source_type)}</div>
                  </div>

                  {/* Accuracy grade + % + bar */}
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                      <span style={{
                        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                        fontSize: 16, fontWeight: 800, color: gc,
                        letterSpacing: "-0.01em", lineHeight: 1,
                      }}>{grade}</span>
                      <span style={{
                        fontSize: 12, fontWeight: 700, color: gc,
                        fontVariantNumeric: "tabular-nums",
                      }}>{s._acc.toFixed(1)}%</span>
                    </div>
                    <Bar value={s._acc} color={gc} />
                  </div>

                  {/* Consensus Weight X/100 */}
                  <div>
                    <div style={{
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 13, fontWeight: 700, color: T.textMuted,
                      fontVariantNumeric: "tabular-nums", marginBottom: 4,
                    }}>
                      {s._weight}<span style={{ fontSize: 10, color: T.textFaint }}>/100</span>
                    </div>
                    <Bar value={s._weight} color="rgba(245,166,35,0.50)" />
                  </div>

                  {/* Lead Time */}
                  <div style={{
                    textAlign: "right",
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 12, color: T.textMuted, fontVariantNumeric: "tabular-nums",
                  }}>{fmtLead(s._lead)}</div>

                  {/* False+% */}
                  <div style={{
                    textAlign: "right",
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 12, fontVariantNumeric: "tabular-nums",
                    color: s._fp > 20 ? T.red : T.textMuted,
                  }}>{s._fp > 0 ? `${s._fp.toFixed(1)}%` : "—"}</div>

                  {/* Verified count */}
                  <div style={{
                    textAlign: "right",
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums",
                    color: s._verified > 0 ? T.green : T.textFaint,
                  }}>{s._verified > 0 ? s._verified : "—"}</div>

                  {/* Sport badge */}
                  <div>
                    {sport2 !== "OTHER" ? (
                      <span style={{
                        display: "inline-flex", alignItems: "center",
                        padding: "2px 7px", borderRadius: 3,
                        background: sp.bg,
                        fontSize: 10, fontWeight: 700,
                        letterSpacing: "0.12em", textTransform: "uppercase",
                        color: sp.color,
                        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      }}>{sport2}</span>
                    ) : (
                      <span style={{ color: T.textFaint, fontSize: 10 }}>—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        )}

        {/* ── Empty state ── */}
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

        {/* ── Badge legend ── */}
        <div style={{
          marginTop: 28, padding: "14px 18px",
          background: T.surface1, border: `1px solid ${T.goldBorder}`, borderRadius: 4,
        }}>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.2em",
            textTransform: "uppercase", color: T.textFaint, marginBottom: 10,
          }}>Status Legend</div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {(["ELITE", "TRUSTED", "TRACKED", "UNVERIFIED"] as StatusBadge[]).map(b => {
              const bs2 = statusBadgeStyle(b);
              const desc = b === "ELITE" ? "85%+ accuracy"
                : b === "TRUSTED"  ? "70–84% accuracy"
                : b === "TRACKED"  ? "40–69% or has verified claims"
                : "No verified data";
              return (
                <div key={b} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    padding: "2px 8px", borderRadius: 2,
                    border: `1px solid ${bs2.border}`, background: bs2.bg,
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.13em",
                    textTransform: "uppercase", color: bs2.color,
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  }}>{b}</span>
                  <span style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 11, color: T.textFaint,
                  }}>{desc}</span>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
