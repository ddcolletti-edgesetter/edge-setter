import { useState, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle, Clock, GitBranch, ShieldCheck, TrendingDown, Trophy } from "lucide-react";
import { AgentCalibrationBadge } from "@/components/AgentCalibration";
import V2Shell from "../components/V2Shell";
const C = {
  bgBase:       "hsl(22 10%  9%)",
  panelBase:    "#0A0F1A",
  panelLift:    "#101827",
  panelElev:    "#101827",
  ivoryPrimary: "#F8FAFC",
  ivorySecond:  "#94A3B8",
  ivoryMuted:   "#64748B",
  ivorySub:     "hsl(25  9% 37%)",
  borderSub:    "rgba(245,184,65,0.12)",
  borderMid:    "hsl(22 10% 22%)",
  anaCyan:      "hsl(194 56% 58%)",
  anaAmber:     "hsl(42  61% 57%)",
  anaAmberDim:  "hsl(42  40% 42%)",
  parchmentBg:  "hsl(38 34% 88%)",
  parchmentSoft:"hsl(38 30% 83%)",
  parchmentText:"hsl(22 12% 10%)",
  parchmentMid: "hsl(28 13% 32%)",
  parchmentBdr: "hsl(38 20% 70%)",
};

function TierBadge({ tier }: { tier: string | null }) {
  const t = tier ?? "tier3";
  const num = t.replace("tier", "");
  const label = t === "tier1" ? "TIER 1"
    : t === "tier2" ? "TIER 2"
    : t === "tier3" ? "TIER 3"
    : t === "tier4" ? "TIER 4"
    : "TIER 5";
  const cls = `tier-${num}`;
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${cls}`}>
      {label}
    </span>
  );
}

function SourceTypeBadge({ sourceType }: { sourceType?: string | null }) {
  const configs: Record<string, { border: string; bg: string; color: string; label: string }> = {
    analytics:      { border: "rgba(245,184,65,0.30)",  bg: "rgba(245,184,65,0.08)",  color: "#F5B841", label: "Analytics" },
    analyst:        { border: "rgba(56,170,203,0.25)",  bg: "rgba(56,170,203,0.07)",  color: "#38AACB", label: "Analyst" },
    scouting:       { border: "rgba(61,174,114,0.28)",  bg: "rgba(61,174,114,0.08)",  color: "#3DAE72", label: "Scouting" },
    college_analyst:{ border: "rgba(167,120,220,0.28)", bg: "rgba(167,120,220,0.08)", color: "#A778DC", label: "College" },
  };
  const cfg = configs[sourceType ?? ""];
  if (!cfg) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 7px", borderRadius: 3,
      border: `1px solid ${cfg.border}`, background: cfg.bg,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
      textTransform: "uppercase" as const, color: cfg.color,
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      whiteSpace: "nowrap" as const,
    }}>
      {cfg.label}
    </span>
  );
}

type FilterChip = "all" | "insider" | "analytics" | "scouting" | "college";
type LeagueTab = "ALL" | "NBA" | "MLB" | "NFL" | "CFB";

const FILTER_CHIPS: { id: FilterChip; label: string; types: string[] }[] = [
  { id: "all",       label: "All",       types: [] },
  { id: "insider",   label: "Insider",   types: ["reporter", "official"] },
  { id: "analytics", label: "Analytics", types: ["analytics"] },
  { id: "scouting",  label: "Scouting",  types: ["scouting"] },
  { id: "college",   label: "College",   types: ["college_analyst"] },
];

const LEAGUE_TABS: LeagueTab[] = ["ALL", "NBA", "MLB", "NFL", "CFB"];

const SOURCE_LEAGUE_MAP: Record<string, LeagueTab[]> = {
  // NBA
  "ESPN NBA":               ["NBA"],
  "The Athletic NBA":       ["NBA"],
  "NBA Beat Writers (General)": ["NBA"],
  "NBA Official":           ["NBA"],
  "Reddit r/nba":           ["NBA"],
  "Shams Charania":         ["NBA"],
  "Bleacher Report NBA":    ["NBA"],
  "Adrian Wojnarowski":     ["NBA"],
  // MLB
  "ESPN MLB":               ["MLB"],
  "The Athletic MLB":       ["MLB"],
  "MLB Beat Writers (General)": ["MLB"],
  "MLB Official":           ["MLB"],
  "Reddit r/baseball":      ["MLB"],
  "Jon Heyman":             ["MLB"],
  "Ken Rosenthal":          ["MLB"],
  "Baseball Reference":     ["MLB"],
  "Bob Nightengale":        ["MLB"],
  "FanGraphs":              ["MLB"],
  "Mark Feinsand":          ["MLB"],
  "Rotowire MLB":           ["MLB"],
  // NFL
  "Adam Schefter":          ["NFL"],
  "Ian Rapoport":           ["NFL"],
  "Tom Pelissero":          ["NFL"],
  "Jeremy Fowler":          ["NFL"],
  "Jay Glazer":             ["NFL"],
  "The Athletic NFL":       ["NFL"],
  "NFL Official":           ["NFL"],
  "Reddit r/nfl":           ["NFL"],
  "Pro Football Focus":     ["NFL"],
  "ProFootballTalk":        ["NFL"],
  "OverTheCap":             ["NFL"],
  "Landry Football":        ["NFL"],
  // CFB
  "Phil Steele":            ["CFB"],
  "Bleacher Report":        ["CFB", "NFL", "NBA", "MLB"],
  "Field Yates":            ["NFL"],
};

function getSourceLeagues(sourceName: string): LeagueTab[] {
  return SOURCE_LEAGUE_MAP[sourceName] ?? ["NFL", "NBA", "MLB", "CFB"];
}

function SourceLeagueChips({ leagues }: { leagues: LeagueTab[] }) {
  const visible = leagues.filter((league) => league !== "ALL").slice(0, 3);
  if (!visible.length) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      {visible.map((league) => (
        <span
          key={league}
          style={{
            border: `1px solid ${C.borderSub}`,
            borderRadius: 3,
            color: C.ivoryMuted,
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.12em",
            lineHeight: 1,
            padding: "3px 5px",
            textTransform: "uppercase" as const,
          }}
        >
          {league}
        </span>
      ))}
      {leagues.length > visible.length && (
        <span style={{ color: C.ivorySub, fontSize: 11, fontWeight: 700 }}>+{leagues.length - visible.length}</span>
      )}
    </span>
  );
}

function TrustCard({
  title,
  text,
  icon,
}: {
  title: string;
  text: string;
  icon: ReactNode;
}) {
  return (
    <div
      style={{
        minWidth: 0,
        width: "100%",
        maxWidth: "min(100%, calc(100vw - 96px))",
        border: `1px solid ${C.borderSub}`,
        borderRadius: 4,
        background: "rgba(16,24,39,0.48)",
        overflow: "hidden",
        padding: "12px 14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, minWidth: 0 }}>
        <span style={{ color: C.anaAmber, flexShrink: 0 }}>{icon}</span>
        <span
          className="data-label"
          style={{ color: C.ivoryPrimary, fontSize: 10, minWidth: 0, whiteSpace: "normal" }}
        >
          {title}
        </span>
      </div>
      <p style={{ color: C.ivoryMuted, fontSize: 12, lineHeight: 1.45, margin: 0, overflowWrap: "anywhere" }}>
        {text}
      </p>
    </div>
  );
}

function SourceTrustExplainers({ sourceCount }: { sourceCount: number }) {
  return (
    <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <AgentCalibrationBadge
          compact
          input={{
            confidence: null,
            sourceCount,
            timingLabel: "Source timing compared",
            storyType: "source reliability",
            sourceSummary: "Reliability tested over time",
          }}
        />
        <span style={{ color: C.ivoryMuted, fontSize: 12, lineHeight: 1.45 }}>
          EdgeSetter ranks source behavior by reliability, timing, confirmation history, and agreement with other evidence.
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-4">
        <TrustCard
          title="Source agreement"
          text="Multiple reliable reports, official confirmation, and matching market or depth-chart movement strengthen a developing story."
          icon={<CheckCircle size={14} />}
        />
        <TrustCard
          title="Reliability tiers"
          text="Official, team, league, beat, market, fantasy, and broader media sources stay separated so confidence is earned in context."
          icon={<ShieldCheck size={14} />}
        />
        <TrustCard
          title="Historical calibration"
          text="Where prior data exists, source timing and reliability are checked against comparable sports movement from earlier seasons."
          icon={<GitBranch size={14} />}
        />
        <TrustCard
          title="What weakens it"
          text="Conflicting reports, stale trails, missing market reaction, or later clarification can reduce confidence before a story settles."
          icon={<TrendingDown size={14} />}
        />
      </div>
    </div>
  );
}

export default function SourceLeaderboard() {
  return <V2Shell brandContext="SOURCE INTEL"><SourceLeaderboardInner /></V2Shell>;
}

function SourceLeaderboardInner() {
  const [activeFilter, setActiveFilter] = useState<FilterChip>("all");
  const [activeLeague, setActiveLeague] = useState<LeagueTab>("ALL");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  const { data: rawScores, isLoading } = useQuery({
    queryKey: ["/api/leaderboard"],
    queryFn: () => apiRequest("GET", "/api/leaderboard").then(r => r.json()),
    refetchInterval: 60000,
  });

  const scores: any[] = (() => {
    if (!rawScores) return [];
    const seen = new Map<string, any>();
    for (const row of rawScores) {
      const key = row.source_id ?? row.source_name ?? row.id;
      if (!key) continue;
      const existing = seen.get(key);
      if (!existing || parseFloat(row.overall_accuracy ?? 0) > parseFloat(existing.overall_accuracy ?? 0)) {
        seen.set(key, row);
      }
    }
    return Array.from(seen.values());
  })();

  const leagueFiltered = activeLeague === "ALL"
    ? scores
    : scores.filter((s: any) => {
        const leagues = getSourceLeagues(s.source_name ?? "");
        return leagues.includes(activeLeague);
      });

  const chip = FILTER_CHIPS.find(c => c.id === activeFilter)!;
  const filteredScores = chip.types.length === 0
    ? leagueFiltered
    : leagueFiltered.filter((s: any) => chip.types.includes(s.source_type ?? ""));

  return (
    <div
      className="source-accuracy-page min-h-full p-4 sm:p-6"
      data-testid="leaderboard-page"
      style={{ background: C.bgBase, boxSizing: "border-box", maxWidth: "100vw", overflowX: "hidden" }}
    >
      <div className="max-w-7xl mx-auto" style={{ width: "100%", maxWidth: "min(80rem, calc(100vw - 96px))", minWidth: 0 }}>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="section-kicker mb-1">
              <span className="data-label" style={{ color: C.anaAmberDim }}>Source Intelligence</span>
            </div>
            <h1
              className="text-xl font-bold tracking-tight mt-3"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: "-0.02em", color: C.ivoryPrimary }}
            >
              Source Intelligence
            </h1>
            <p className="text-[12px] mt-0.5" style={{ color: C.ivoryMuted, maxWidth: "min(720px, calc(100vw - 96px))", lineHeight: 1.45, overflowWrap: "anywhere" }}>
              Reliability tracking for the sources that shape developing sports stories, from official confirmation to market, fantasy, team, and broader media context.
            </p>
          </div>
        </div>

        <hr className="briefing-rule mb-5" />

        <SourceTrustExplainers sourceCount={scores.length} />

        {/* League tabs */}
        <div className="flex gap-1 mb-4" data-testid="league-tabs">
          {LEAGUE_TABS.map(league => {
            const active = activeLeague === league;
            return (
              <button
                key={league}
                onClick={() => setActiveLeague(league)}
                style={{
                  padding: "5px 14px", borderRadius: 3,
                  border: active ? "1px solid rgba(245,184,65,0.50)" : `1px solid ${C.borderMid}`,
                  background: active ? "rgba(245,184,65,0.12)" : "transparent",
                  color: active ? "#F5B841" : C.ivoryMuted,
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
                  textTransform: "uppercase" as const,
                  cursor: "pointer", transition: "all 0.12s",
                }}
              >
                {league}
              </button>
            );
          })}
        </div>

        {/* Tier legend */}
        <div
          className="flex flex-wrap gap-4 mb-5 py-2.5"
          style={{ borderTop: `1px solid ${C.borderSub}`, borderBottom: `1px solid ${C.borderSub}` }}
        >
          {["tier1","tier2","tier3","tier4"].map(tier => (
            <div key={tier} className="flex items-center gap-1.5">
              <TierBadge tier={tier} />
            </div>
          ))}
          <span style={{ color: C.ivoryMuted, fontSize: 12, lineHeight: 1.4 }}>
            Tiers reflect tracked source behavior where data is available, not a guarantee on any single story.
          </span>
        </div>

        {/* Source-type filter chips */}
        <div className="flex flex-wrap gap-2 mb-5">
          {FILTER_CHIPS.map(c => {
            const active = activeFilter === c.id;
            const activeStyles: Record<FilterChip, { border: string; bg: string; color: string }> = {
              all:       { border: "rgba(245,184,65,0.50)",  bg: "rgba(245,184,65,0.14)",  color: "#F5B841" },
              insider:   { border: "rgba(56,170,203,0.45)",  bg: "rgba(56,170,203,0.10)",  color: "#38AACB" },
              analytics: { border: "rgba(245,184,65,0.45)",  bg: "rgba(245,184,65,0.12)",  color: "#F5B841" },
              scouting:  { border: "rgba(61,174,114,0.45)",  bg: "rgba(61,174,114,0.10)",  color: "#3DAE72" },
              college:   { border: "rgba(167,120,220,0.45)", bg: "rgba(167,120,220,0.10)", color: "#A778DC" },
            };
            const s = active ? activeStyles[c.id] : null;
            return (
              <button
                key={c.id}
                onClick={() => setActiveFilter(c.id)}
                style={{
                  display: "inline-flex", alignItems: "center",
                  padding: "5px 13px", borderRadius: 3,
                  border: active ? `1px solid ${s!.border}` : `1px solid ${C.borderMid}`,
                  background: active ? s!.bg : "transparent",
                  color: active ? s!.color : C.ivoryMuted,
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
                  textTransform: "uppercase" as const,
                  cursor: "pointer", transition: "all 0.12s",
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {isLoading && (
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-12 rounded animate-pulse"
                style={{ background: C.panelLift, border: `1px solid ${C.borderSub}` }} />
            ))}
          </div>
        )}

        {!isLoading && (!filteredScores || filteredScores.length === 0) && (
          <div className="text-center py-14 rounded"
            style={{ border: `1px solid ${C.borderMid}`, background: C.panelBase }}>
            <p className="text-sm" style={{ color: C.ivoryMuted }}>
              No source reliability records found for {activeLeague === "ALL" ? "the current filter" : activeLeague}.
            </p>
          </div>
        )}

        {!isLoading && filteredScores && filteredScores.length > 0 && (
          isMobile ? (
            // ── MOBILE: card list ──────────────────────────────────────────
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredScores.map((s: any, i: number) => {
                const acc = parseFloat(s.overall_accuracy ?? "0");
                const accColor = acc >= 85 ? C.anaCyan : acc >= 70 ? C.anaAmber : C.ivoryMuted;
                const leadTime = parseFloat(s.average_lead_time_minutes ?? "0").toFixed(0);
                const leagues = getSourceLeagues(s.source_name ?? "");
                return (
                  <div
                    key={s.source_id ?? s.id ?? i}
                    style={{
                      background: C.panelBase,
                      border: `1px solid ${C.borderSub}`,
                      borderRadius: 4,
                      padding: "14px 16px",
                    }}
                  >
                    {/* Row 1: rank + name + accuracy */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                      <span style={{
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontSize: 13, fontWeight: 800, color: C.ivorySub,
                        minWidth: 20, textAlign: "center",
                      }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: "'Barlow Condensed', sans-serif",
                          fontSize: 15, fontWeight: 700, color: C.ivoryPrimary,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {s.source_name}
                        </div>
                      </div>
                      <span style={{
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontSize: 17, fontWeight: 800, color: accColor,
                        flexShrink: 0,
                      }}>
                        {acc.toFixed(1)}%
                      </span>
                    </div>
                    {/* Row 2: tier + type + lead time */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <TierBadge tier={s.trust_tier ?? null} />
                      <SourceTypeBadge sourceType={s.source_type} />
                      <SourceLeagueChips leagues={leagues} />
                      {leadTime !== "0" && (
                        <span style={{ fontSize: 11, color: C.ivoryMuted, marginLeft: "auto" }}>
                          <Clock size={10} style={{ display: "inline", marginRight: 3 }} />
                          {leadTime}m timing edge
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // ── DESKTOP: full table ────────────────────────────────────────
            <div className="rounded overflow-hidden" style={{ border: `1px solid ${C.borderMid}` }}>
              <div className="overflow-x-auto" style={{ background: C.panelBase }}>
                <table className="w-full text-base">
                  <thead>
                    <tr style={{ background: C.parchmentSoft, borderBottom: `1px solid ${C.parchmentBdr}` }}>
                      <th className="text-left px-4 py-3 w-8">
                        <span className="text-[12px] font-bold uppercase tracking-widest" style={{ color: C.parchmentMid }}>#</span>
                      </th>
                      <th className="text-left px-4 py-3">
                        <span className="text-[12px] font-bold uppercase tracking-widest" style={{ color: C.parchmentMid }}>Source</span>
                      </th>
                      <th className="text-left px-4 py-3">
                        <span className="text-[12px] font-bold uppercase tracking-widest" style={{ color: C.parchmentMid }}>Tier</span>
                      </th>
                      <th className="text-right px-4 py-3">
                        <span className="flex items-center gap-1 justify-end text-[12px] font-bold uppercase tracking-widest" style={{ color: C.parchmentMid }}>
                          <Trophy size={11} />Tracked accuracy
                        </span>
                      </th>
                      <th className="text-right px-4 py-3">
                        <span className="flex items-center gap-1 justify-end text-[12px] font-bold uppercase tracking-widest" style={{ color: C.parchmentMid }}>
                          <Clock size={11} />Timing edge
                        </span>
                      </th>
                      <th className="text-right px-4 py-3">
                        <span className="flex items-center gap-1 justify-end text-[12px] font-bold uppercase tracking-widest" style={{ color: C.parchmentMid }}>
                          <TrendingDown size={11} />Weakened
                        </span>
                      </th>
                      <th className="text-right px-4 py-3">
                        <span className="text-[12px] font-bold uppercase tracking-widest" style={{ color: C.parchmentMid }}>Availability</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredScores.map((s: any, i: number) => {
                      const acc = parseFloat(s.overall_accuracy ?? "0");
                      const accColor = acc >= 85 ? C.anaCyan : acc >= 70 ? C.anaAmber : C.ivoryMuted;
                      const leagues = getSourceLeagues(s.source_name ?? "");
                      return (
                        <tr
                          key={s.source_id ?? s.id ?? i}
                          className="transition-colors"
                          style={{ borderBottom: `1px solid ${C.borderSub}` }}
                          onMouseEnter={e => (e.currentTarget.style.background = C.panelLift)}
                          onMouseLeave={e => (e.currentTarget.style.background = "")}
                        >
                          <td className="px-4 py-3 text-sm font-bold tabular-nums" style={{ color: C.ivorySub }}>{i + 1}</td>
                          <td className="px-4 py-3" style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 600, color: C.ivoryPrimary }}>{s.source_name}</span>
                              <SourceTypeBadge sourceType={s.source_type} />
                              <SourceLeagueChips leagues={leagues} />
                            </div>
                          </td>
                          <td className="px-4 py-3"><TierBadge tier={s.trust_tier ?? null} /></td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-bold" style={{ color: accColor }}>{acc.toFixed(1)}%</span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm tabular-nums" style={{ color: C.ivoryMuted }}>
                            {parseFloat(s.average_lead_time_minutes ?? "0").toFixed(0)}m
                          </td>
                          <td className="px-4 py-3 text-right text-sm tabular-nums" style={{ color: C.ivoryMuted }}>
                            {parseFloat(s.false_positive_rate ?? "0").toFixed(1)}%
                          </td>
                          <td className="px-4 py-3 text-right text-sm tabular-nums" style={{ color: C.ivoryMuted }}>
                            {parseFloat(s.injury_accuracy ?? "0").toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
