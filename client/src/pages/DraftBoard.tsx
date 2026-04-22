import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import AppLayout from "../components/AppLayout";
import VerdictBadge from "../components/VerdictBadge";
import { type Theme } from "../App";
import { type SignalFeedItem } from "@shared/schema";
import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

interface Props { theme: Theme; toggleTheme: () => void; }

interface Prospect {
  rank: number;
  name: string;
  pos: string;
  school: string;
  projected: string;
  conf: number;
  team: string;
  // Confidence breakdown by category
  breakdown: { label: string; score: number }[];
  // Brief scouting note
  note: string;
}

export default function DraftBoard({ theme, toggleTheme }: Props) {
  const [expandedRank, setExpandedRank] = useState<number | null>(null);
  type SortKey = "rank" | "conf" | "pos" | "projected";
  type SortDir = "asc" | "desc";
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [posFilter, setPosFilter] = useState<string>("ALL");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "conf" ? "desc" : "asc"); // Edge Score defaults desc (best first)
    }
    setExpandedRank(null); // collapse on re-sort
  };

  // Round order for sorting projected round
  const roundOrder: Record<string, number> = {
    "1st Round": 1, "1st–2nd Round": 2, "2nd Round": 3, "2nd–3rd Round": 4, "3rd Round": 5,
  };

  const availablePos = ["ALL", ...Array.from(new Set(prospects.map(p => p.pos)))];

  const sortedProspects = useMemo(() => {
    let list = [...prospects];
    if (posFilter !== "ALL") list = list.filter(p => p.pos === posFilter);
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "rank")      cmp = a.rank - b.rank;
      else if (sortKey === "conf") cmp = a.conf - b.conf;
      else if (sortKey === "pos")  cmp = a.pos.localeCompare(b.pos);
      else if (sortKey === "projected") {
        const ao = roundOrder[a.projected] ?? 9;
        const bo = roundOrder[b.projected] ?? 9;
        cmp = ao - bo;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [sortKey, sortDir, posFilter]);

  const { data: draftItems, isLoading } = useQuery<SignalFeedItem[]>({
    queryKey: ["/api/signal", "draft"],
    queryFn: () => apiRequest("GET", "/api/signal?topic=draft").then(r => r.json()),
    refetchInterval: 60000,
  });

  // Also fetch ALL signals so we can match by player name
  const { data: allSignals } = useQuery<SignalFeedItem[]>({
    queryKey: ["/api/signal"],
    queryFn: () => apiRequest("GET", "/api/signal").then(r => r.json()),
  });

  const items = draftItems ?? [];

  const prospects: Prospect[] = [
    {
      rank: 1, name: "Cam Ward", pos: "QB", school: "Miami (FL)",
      projected: "1st Round", conf: 96, team: "Tennessee Titans",
      breakdown: [
        { label: "Arm Talent", score: 97 },
        { label: "Accuracy", score: 94 },
        { label: "Mobility", score: 88 },
        { label: "NFL Readiness", score: 95 },
      ],
      note: "Elite arm talent with rare touch and zip. Tennessee's clear franchise QB target. No significant combine red flags.",
    },
    {
      rank: 2, name: "Travis Hunter", pos: "WR/CB", school: "Colorado",
      projected: "1st Round", conf: 94, team: "Cleveland Browns",
      breakdown: [
        { label: "Receiving", score: 96 },
        { label: "Coverage", score: 91 },
        { label: "Athleticism", score: 98 },
        { label: "NFL Readiness", score: 90 },
      ],
      note: "Two-way generational talent. Heisman winner. Cleveland values the WR role primarily; CB is a bonus weapon.",
    },
    {
      rank: 3, name: "Abdul Carter", pos: "EDGE", school: "Penn State",
      projected: "1st Round", conf: 91, team: "NY Giants",
      breakdown: [
        { label: "Pass Rush", score: 95 },
        { label: "Run Defense", score: 86 },
        { label: "Athleticism", score: 93 },
        { label: "NFL Readiness", score: 89 },
      ],
      note: "Explosive first step and elite bend. Giants desperately need edge presence; Carter fills immediately.",
    },
    {
      rank: 4, name: "Will Johnson", pos: "CB", school: "Michigan",
      projected: "1st Round", conf: 88, team: "New England Patriots",
      breakdown: [
        { label: "Coverage", score: 92 },
        { label: "Tackling", score: 87 },
        { label: "Ball Skills", score: 90 },
        { label: "NFL Readiness", score: 85 },
      ],
      note: "Long, physical corner with elite press coverage. New England rebuilding secondary around him.",
    },
    {
      rank: 5, name: "Ashton Jeanty", pos: "RB", school: "Boise State",
      projected: "1st Round", conf: 85, team: "Jacksonville Jaguars",
      breakdown: [
        { label: "Explosiveness", score: 96 },
        { label: "Vision", score: 89 },
        { label: "Pass Pro", score: 78 },
        { label: "NFL Readiness", score: 84 },
      ],
      note: "Heisman runner-up. Historic production at Boise State. Jacksonville needs a backfield centerpiece.",
    },
    {
      rank: 6, name: "Mason Graham", pos: "DT", school: "Michigan",
      projected: "1st Round", conf: 83, team: "Las Vegas Raiders",
      breakdown: [
        { label: "Pass Rush", score: 87 },
        { label: "Run Stop", score: 92 },
        { label: "Leverage", score: 90 },
        { label: "NFL Readiness", score: 83 },
      ],
      note: "Dominant interior anchor. Run-stopping specialist who flashes pass rush upside on 3-tech snaps.",
    },
    {
      rank: 7, name: "Tetairoa McMillan", pos: "WR", school: "Arizona",
      projected: "1st Round", conf: 81, team: "Carolina Panthers",
      breakdown: [
        { label: "Route Running", score: 85 },
        { label: "Catch Radius", score: 94 },
        { label: "YAC", score: 80 },
        { label: "NFL Readiness", score: 80 },
      ],
      note: "6'5\" contested-catch specialist. Carolina needs a true X receiver to build their passing game around.",
    },
    {
      rank: 8, name: "Kelvin Banks Jr.", pos: "OT", school: "Texas",
      projected: "1st Round", conf: 79, team: "New York Giants",
      breakdown: [
        { label: "Pass Block", score: 88 },
        { label: "Run Block", score: 82 },
        { label: "Footwork", score: 86 },
        { label: "NFL Readiness", score: 80 },
      ],
      note: "Elite pass protector with three-year starting pedigree. Anchors left side immediately at NFL level.",
    },
    {
      rank: 9, name: "Jalon Walker", pos: "LB", school: "Georgia",
      projected: "1st–2nd Round", conf: 74, team: "Atlanta Falcons",
      breakdown: [
        { label: "Coverage", score: 82 },
        { label: "Run Stop", score: 79 },
        { label: "Pass Rush", score: 76 },
        { label: "NFL Readiness", score: 74 },
      ],
      note: "Versatile chess piece linebacker. Atlanta values his coverage ability in modern 2-high shell schemes.",
    },
    {
      rank: 10, name: "Jihaad Campbell", pos: "LB", school: "Alabama",
      projected: "1st–2nd Round", conf: 72, team: "Philadelphia Eagles",
      breakdown: [
        { label: "Coverage", score: 78 },
        { label: "Run Stop", score: 80 },
        { label: "Blitz", score: 82 },
        { label: "NFL Readiness", score: 72 },
      ],
      note: "High-motor off-ball linebacker with blitz upside. Eagles' defensive scheme maximizes his versatility.",
    },
  ];

  const confColor = (c: number) =>
    c >= 90 ? "text-[hsl(146,42%,52%)]" : c >= 80 ? "text-primary" : "text-muted-foreground";

  const confBarColor = (c: number) =>
    c >= 90 ? "hsl(146,42%,52%)" : c >= 80 ? "hsl(34,62%,55%)" : "hsl(215,20%,45%)";

  // Match signals to a prospect by player name (case-insensitive partial match)
  const linkedSignals = (name: string): SignalFeedItem[] => {
    if (!allSignals) return [];
    const lastName = name.split(" ").pop()?.toLowerCase() ?? "";
    const firstName = name.split(" ")[0]?.toLowerCase() ?? "";
    return allSignals.filter(s => {
      const p = (s.player ?? "").toLowerCase();
      return p.includes(lastName) || p.includes(firstName + " ");
    }).slice(0, 3);
  };

  return (
    <AppLayout theme={theme} toggleTheme={toggleTheme}>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto" data-testid="draft-board-page">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="section-kicker">
              <span className="data-label text-primary">Intelligence Module</span>
            </p>
            <h1
              className="text-xl font-bold tracking-tight text-foreground mt-3"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: "-0.02em" }}
            >
              Draft Board
            </h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">2025 NFL Draft prospects · Edge Setter Intel</p>
          </div>
          <span className="text-[9px] px-2.5 py-1 rounded border border-primary/30 bg-primary/8 text-primary font-bold uppercase tracking-widest whitespace-nowrap mt-1">
            NFL Draft 2025
          </span>
        </div>

        <hr className="briefing-rule mb-5" />

        {/* Top Prospects Table */}
        <div className="rounded border border-border bg-card mb-6 overflow-hidden editorial-table" data-testid="draft-prospects-table">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/20">
            <h2
              className="text-sm font-bold"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              Top Prospects
            </h2>
            {/* Position filter pills */}
            <div className="flex items-center gap-1 flex-wrap justify-end">
              {availablePos.map(pos => (
                <button
                  key={pos}
                  onClick={() => { setPosFilter(pos); setExpandedRank(null); }}
                  data-testid={`filter-pos-${pos}`}
                  className={`text-[8px] px-2 py-0.5 rounded border font-bold uppercase tracking-widest transition-colors ${
                    posFilter === pos
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-transparent text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-prospects">
              <thead>
                <tr className="border-b border-border bg-muted/10">
                  {/* Rank — sortable */}
                  <th className="text-left px-4 py-2.5 w-9">
                    <button
                      onClick={() => handleSort("rank")}
                      data-testid="sort-rank"
                      className="flex items-center gap-1 group"
                    >
                      <span className={`data-label transition-colors ${ sortKey === "rank" ? "text-primary" : "group-hover:text-foreground" }`}>#</span>
                      {sortKey === "rank"
                        ? (sortDir === "asc" ? <ChevronUp size={10} className="text-primary" /> : <ChevronDown size={10} className="text-primary" />)
                        : <ChevronsUpDown size={10} className="text-muted-foreground/40 group-hover:text-muted-foreground" />}
                    </button>
                  </th>
                  {/* Player — not sortable, but pos is */}
                  <th className="text-left px-4 py-2.5">
                    <button
                      onClick={() => handleSort("pos")}
                      data-testid="sort-pos"
                      className="flex items-center gap-1 group"
                    >
                      <span className={`data-label transition-colors ${ sortKey === "pos" ? "text-primary" : "group-hover:text-foreground" }`}>Player / Pos</span>
                      {sortKey === "pos"
                        ? (sortDir === "asc" ? <ChevronUp size={10} className="text-primary" /> : <ChevronDown size={10} className="text-primary" />)
                        : <ChevronsUpDown size={10} className="text-muted-foreground/40 group-hover:text-muted-foreground" />}
                    </button>
                  </th>
                  <th className="text-left px-4 py-2.5 hidden sm:table-cell">
                    <span className="data-label">School</span>
                  </th>
                  {/* Projection — sortable */}
                  <th className="text-left px-4 py-2.5">
                    <button
                      onClick={() => handleSort("projected")}
                      data-testid="sort-projected"
                      className="flex items-center gap-1 group"
                    >
                      <span className={`data-label transition-colors ${ sortKey === "projected" ? "text-primary" : "group-hover:text-foreground" }`}>Projection</span>
                      {sortKey === "projected"
                        ? (sortDir === "asc" ? <ChevronUp size={10} className="text-primary" /> : <ChevronDown size={10} className="text-primary" />)
                        : <ChevronsUpDown size={10} className="text-muted-foreground/40 group-hover:text-muted-foreground" />}
                    </button>
                  </th>
                  {/* Edge Score — sortable */}
                  <th className="text-right px-4 py-2.5">
                    <button
                      onClick={() => handleSort("conf")}
                      data-testid="sort-edge-score"
                      className="flex items-center gap-1 justify-end ml-auto group"
                    >
                      {sortKey === "conf"
                        ? (sortDir === "asc" ? <ChevronUp size={10} className="text-primary" /> : <ChevronDown size={10} className="text-primary" />)
                        : <ChevronsUpDown size={10} className="text-muted-foreground/40 group-hover:text-muted-foreground" />}
                      <span className={`data-label transition-colors ${ sortKey === "conf" ? "text-primary" : "group-hover:text-foreground" }`}>Edge Score</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedProspects.map((p, idx) => {
                  const isOpen = expandedRank === p.rank;
                  const displayRank = sortKey === "rank" ? p.rank : idx + 1;
                  const signals = linkedSignals(p.name);
                  return (
                    <>
                      {/* Main row */}
                      <tr
                        key={p.rank}
                        onClick={() => setExpandedRank(isOpen ? null : p.rank)}
                        className={`border-b border-border/50 transition-colors cursor-pointer select-none
                          ${ isOpen ? "bg-muted/30" : "hover:bg-muted/20" }`}
                        data-testid={`prospect-row-${p.rank}`}
                      >
                        <td className="px-4 py-3 text-xs font-bold tabular-nums text-muted-foreground">{displayRank}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-sm text-foreground">{p.name}</p>
                          <p className="text-[10px] text-muted-foreground">{p.pos} · {p.team}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">{p.school}</td>
                        <td className="px-4 py-3">
                          <span className="text-[9px] px-2 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground font-semibold uppercase tracking-wider">
                            {p.projected}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className={`stat-num-display text-sm font-bold ${confColor(p.conf)}`}>
                              {p.conf}
                            </span>
                            {isOpen
                              ? <ChevronUp size={13} className="text-muted-foreground" />
                              : <ChevronDown size={13} className="text-muted-foreground" />}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded detail panel */}
                      {isOpen && (
                        <tr key={`${p.rank}-expand`} className="bg-muted/10 border-b border-primary/20">
                          <td colSpan={5} className="px-5 py-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                              {/* Col 1 — Profile */}
                              <div>
                                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Prospect Profile</p>
                                <div className="space-y-1">
                                  {[
                                    { label: "Position",   value: p.pos },
                                    { label: "School",     value: p.school },
                                    { label: "Projection", value: p.projected },
                                    { label: "Proj. Team", value: p.team },
                                  ].map(({ label, value }) => (
                                    <div key={label} className="flex justify-between items-baseline gap-4">
                                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap">{label}</span>
                                      <span className="text-[11px] text-foreground font-semibold text-right">{value}</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-3 pt-3 border-t border-border/40">
                                  <p className="text-[10px] text-muted-foreground leading-relaxed italic">{p.note}</p>
                                </div>
                              </div>

                              {/* Col 2 — Confidence Breakdown */}
                              <div>
                                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Edge Score Breakdown</p>
                                <div className="space-y-2">
                                  {p.breakdown.map(({ label, score }) => (
                                    <div key={label}>
                                      <div className="flex justify-between mb-0.5">
                                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
                                        <span className="text-[10px] font-bold tabular-nums" style={{ color: confBarColor(score) }}>{score}</span>
                                      </div>
                                      <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
                                        <div
                                          className="h-full rounded-full transition-all duration-500"
                                          style={{ width: `${score}%`, background: confBarColor(score) }}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                  {/* Overall */}
                                  <div className="pt-1.5 border-t border-border/40">
                                    <div className="flex justify-between mb-0.5">
                                      <span className="text-[9px] uppercase tracking-wider font-bold text-foreground">Overall</span>
                                      <span className={`text-[11px] font-bold tabular-nums ${confColor(p.conf)}`}>{p.conf}</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                                      <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{ width: `${p.conf}%`, background: confBarColor(p.conf) }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Col 3 — Linked Signals */}
                              <div>
                                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                                  Linked Signals {signals.length > 0 && <span className="text-primary">· {signals.length}</span>}
                                </p>
                                {signals.length === 0 ? (
                                  <p className="text-[10px] text-muted-foreground italic">No signals found for this prospect in current cycle.</p>
                                ) : (
                                  <div className="space-y-2">
                                    {signals.map(s => (
                                      <div key={s.id} className="p-2.5 rounded border border-border/60 bg-card">
                                        <div className="flex items-center gap-1.5 mb-1">
                                          <VerdictBadge verdict={s.verdict} />
                                          <span className="text-[9px] text-muted-foreground ml-auto">{s.source_name}</span>
                                        </div>
                                        <p className="text-[10px] text-foreground leading-snug">{s.normalized_claim}</p>
                                        <p className="text-[9px] text-muted-foreground mt-1">{parseFloat(s.confidence_score ?? "0").toFixed(0)}% conf</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Draft Intelligence Feed */}
        <div className="flex items-center gap-3 mb-4">
          <h2
            className="text-sm font-bold"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Draft Intelligence Signals
          </h2>
          <hr className="flex-1 border-border" />
        </div>

        {isLoading && (
          <div className="space-y-2.5" data-testid="skeleton-draft">
            {[1, 2, 3].map(i => <div key={i} className="h-16 rounded border border-border bg-muted/20 animate-pulse" />)}
          </div>
        )}
        {!isLoading && items.length === 0 && (
          <div className="text-center py-10 border border-border rounded bg-card" data-testid="empty-draft-signals">
            <p className="text-sm text-muted-foreground">No draft signals in current cycle</p>
          </div>
        )}
        {items.map(item => (
          <div key={item.id} className="p-4 rounded border border-border bg-card mb-2 signal-card" data-testid={`draft-signal-${item.id}`}>
            <div className="flex flex-wrap gap-1.5 mb-2">
              <VerdictBadge verdict={item.verdict} />
              {item.league && (
                <span className="text-[9px] px-2 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground uppercase tracking-wider font-semibold">
                  {item.league}
                </span>
              )}
            </div>
            {item.player && (
              <p className="text-[10px] font-bold text-primary mb-1 uppercase tracking-wider">{item.player}</p>
            )}
            <p className="text-sm text-foreground">{item.normalized_claim}</p>
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border">
              <span className="text-[10px] text-muted-foreground">{item.source_name}</span>
              <span className="stat-num-display text-[10px] tabular-nums text-muted-foreground ml-auto">{parseFloat(item.confidence_score ?? "0").toFixed(0)}% conf</span>
            </div>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
