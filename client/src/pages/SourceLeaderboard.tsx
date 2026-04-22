import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import AppLayout from "../components/AppLayout";
import { type Theme } from "../App";
import { Trophy, Clock, TrendingDown } from "lucide-react";

interface Props { theme: Theme; toggleTheme: () => void; }

/* ─── Analytics-aligned palette ────────────────────────────────── */
const C = {
  /* Shell surfaces — matches global dark shell tokens */
  bgBase:       "hsl(22 10%  9%)",
  panelBase:    "hsl(22 10% 11%)",
  panelLift:    "hsl(22 10% 13%)",
  panelElev:    "hsl(22 10% 15%)",
  /* Text on dark */
  ivoryPrimary: "hsl(34 52% 89%)",
  ivorySecond:  "hsl(34 22% 77%)",
  ivoryMuted:   "hsl(30 10% 58%)",
  ivorySub:     "hsl(25  9% 37%)",
  /* Borders */
  borderSub:    "hsl(22 10% 18%)",
  borderMid:    "hsl(22 10% 22%)",
  /* Analytics accuracy accents */
  anaCyan:      "hsl(194 56% 58%)",   /* ≥85% accuracy — confirmed/trust */
  anaAmber:     "hsl(42  61% 57%)",   /* ≥70% accuracy — caution */
  anaAmberDim:  "hsl(42  40% 42%)",   /* amber-gold for kickers/labels */
  /* Parchment band tokens (header band) */
  parchmentBg:  "hsl(38 34% 88%)",
  parchmentSoft:"hsl(38 30% 83%)",
  parchmentText:"hsl(22 12% 10%)",
  parchmentMid: "hsl(28 13% 32%)",
  parchmentBdr: "hsl(38 20% 70%)",
};

/* Tier badge — analytics accent classes from index.css */
function TierBadge({ tier }: { tier: string | null }) {
  const t = tier ?? "tier3";
  const num = t.replace("tier", "");
  const label = t === "tier1" ? "Official / T1"
    : t === "tier2" ? "High Trust"
    : t === "tier3" ? "Trusted"
    : t === "tier4" ? "Commentary"
    : "Low";
  const cls = `tier-${num}`;
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${cls}`}>
      {label}
    </span>
  );
}

export default function SourceLeaderboard({ theme, toggleTheme }: Props) {
  const { data: scores, isLoading } = useQuery({
    queryKey: ["/api/leaderboard"],
    queryFn: () => apiRequest("GET", "/api/leaderboard").then(r => r.json()),
    refetchInterval: 60000,
  });

  return (
    <AppLayout theme={theme} toggleTheme={toggleTheme}>
      <div
        className="min-h-full p-4 sm:p-6"
        data-testid="leaderboard-page"
        style={{ background: C.bgBase }}
      >
        <div className="max-w-7xl mx-auto">

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
                Source Leaderboard
              </h1>
              <p className="text-[11px] mt-0.5" style={{ color: C.ivoryMuted }}>Trust scoring across all tracked sources</p>
            </div>
          </div>

          {/* Briefing rule */}
          <hr className="briefing-rule mb-5" />

          {/* Tier legend */}
          <div
            className="flex flex-wrap gap-4 mb-5 py-2.5"
            style={{ borderTop: `1px solid ${C.borderSub}`, borderBottom: `1px solid ${C.borderSub}` }}
            data-testid="tier-legend"
          >
            {[
              { tier: "tier1", label: "Official / T1" },
              { tier: "tier2", label: "High Trust" },
              { tier: "tier3", label: "Trusted" },
              { tier: "tier4", label: "Commentary" },
            ].map(({ tier, label }) => (
              <div key={tier} className="flex items-center gap-1.5">
                <TierBadge tier={tier} />
                <span className="data-label" style={{ color: C.ivoryMuted }}>{label}</span>
              </div>
            ))}
          </div>

          {isLoading && (
            <div className="space-y-2" data-testid="skeleton-leaderboard">
              {[1, 2, 3, 4, 5].map(i => (
                <div
                  key={i}
                  className="h-12 rounded animate-pulse"
                  style={{ background: C.panelLift, border: `1px solid ${C.borderSub}` }}
                />
              ))}
            </div>
          )}

          {!isLoading && (!scores || scores.length === 0) && (
            <div
              className="text-center py-14 rounded"
              style={{ border: `1px solid ${C.borderMid}`, background: C.panelBase }}
              data-testid="empty-leaderboard"
            >
              <p className="text-sm" style={{ color: C.ivoryMuted }}>No source scores yet</p>
            </div>
          )}

          {!isLoading && scores && scores.length > 0 && (
            <div
              className="rounded overflow-hidden"
              style={{ border: `1px solid ${C.borderMid}` }}
              data-testid="leaderboard-table"
            >
              {/* Parchment header band — premium editorial contrast surface */}
              <div
                className="overflow-x-auto"
                style={{ background: C.panelBase }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{
                      background: C.parchmentSoft,
                      borderBottom: `1px solid ${C.parchmentBdr}`,
                    }}>
                      <th className="text-left px-4 py-3 w-8">
                        <span
                          className="text-[9px] font-bold uppercase tracking-widest"
                          style={{ color: C.parchmentMid }}
                        >#</span>
                      </th>
                      <th className="text-left px-4 py-3">
                        <span
                          className="text-[9px] font-bold uppercase tracking-widest"
                          style={{ color: C.parchmentMid }}
                        >Source</span>
                      </th>
                      <th className="text-left px-4 py-3 hidden sm:table-cell">
                        <span
                          className="text-[9px] font-bold uppercase tracking-widest"
                          style={{ color: C.parchmentMid }}
                        >Tier</span>
                      </th>
                      <th className="text-right px-4 py-3">
                        <span
                          className="flex items-center gap-1 justify-end text-[9px] font-bold uppercase tracking-widest"
                          style={{ color: C.parchmentMid }}
                        >
                          <Trophy size={10} />Accuracy
                        </span>
                      </th>
                      <th className="text-right px-4 py-3 hidden md:table-cell">
                        <span
                          className="flex items-center gap-1 justify-end text-[9px] font-bold uppercase tracking-widest"
                          style={{ color: C.parchmentMid }}
                        >
                          <Clock size={10} />Lead Time
                        </span>
                      </th>
                      <th className="text-right px-4 py-3 hidden lg:table-cell">
                        <span
                          className="flex items-center gap-1 justify-end text-[9px] font-bold uppercase tracking-widest"
                          style={{ color: C.parchmentMid }}
                        >
                          <TrendingDown size={10} />False+
                        </span>
                      </th>
                      <th className="text-right px-4 py-3 hidden md:table-cell">
                        <span
                          className="text-[9px] font-bold uppercase tracking-widest"
                          style={{ color: C.parchmentMid }}
                        >Injury Acc.</span>
                      </th>
                      <th className="text-right px-4 py-3 hidden lg:table-cell">
                        <span
                          className="text-[9px] font-bold uppercase tracking-widest"
                          style={{ color: C.parchmentMid }}
                        >Draft Acc.</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {scores.map((s: any, i: number) => {
                      const acc = parseFloat(s.overall_accuracy ?? "0");
                      /* Analytics accuracy tiers: cyan ≥85%, amber ≥70%, muted below */
                      const accColor =
                        acc >= 85 ? C.anaCyan :
                        acc >= 70 ? C.anaAmber :
                        C.ivoryMuted;
                      return (
                        <tr
                          key={s.id}
                          className="transition-colors"
                          style={{ borderBottom: `1px solid ${C.borderSub}` }}
                          onMouseEnter={e => (e.currentTarget.style.background = C.panelLift)}
                          onMouseLeave={e => (e.currentTarget.style.background = "")}
                          data-testid={`leaderboard-row-${s.source_id}`}
                        >
                          <td className="px-4 py-3 text-xs font-bold tabular-nums" style={{ color: C.ivorySub }}>{i + 1}</td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-sm" style={{ color: C.ivoryPrimary }}>{s.source_name}</p>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <TierBadge tier={s.trust_tier ?? null} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="stat-num-display text-sm font-bold" style={{ color: accColor }}>
                              {acc.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-xs tabular-nums hidden md:table-cell" style={{ color: C.ivoryMuted }}>
                            {parseFloat(s.average_lead_time_minutes ?? "0").toFixed(0)}m
                          </td>
                          <td className="px-4 py-3 text-right text-xs tabular-nums hidden lg:table-cell" style={{ color: C.ivoryMuted }}>
                            {parseFloat(s.false_positive_rate ?? "0").toFixed(1)}%
                          </td>
                          <td className="px-4 py-3 text-right text-xs tabular-nums hidden md:table-cell" style={{ color: C.ivoryMuted }}>
                            {parseFloat(s.injury_accuracy ?? "0").toFixed(1)}%
                          </td>
                          <td className="px-4 py-3 text-right text-xs tabular-nums hidden lg:table-cell" style={{ color: C.ivoryMuted }}>
                            {parseFloat(s.draft_accuracy ?? "0").toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
