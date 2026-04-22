import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import AppLayout from "../components/AppLayout";
import VerdictBadge from "../components/VerdictBadge";
import DataBadge from "../components/DataBadge";
import { type Theme } from "../App";
import { type SignalFeedItem } from "@shared/schema";
import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronRight, TrendingUp, TrendingDown, AlertTriangle, Zap } from "lucide-react";

interface Props { theme: Theme; toggleTheme: () => void; }

interface Prospect {
  rank: number;
  name: string;
  pos: string;
  school: string;
  projected: string;
  conf: number;
  team: string;
  breakdown: { label: string; score: number }[];
  note: string;
  trend: number[];
  momentum?: "rising" | "falling" | "stable";
  buzz?: string;
  teamFitWatch?: string;
  latestUpdate?: string;
}

/* ── Static prospect data — module-level to avoid esbuild TDZ ── */
const ROUND_ORDER: Record<string, number> = {
  "1st Round": 1, "1st–2nd Round": 2, "2nd Round": 3, "2nd–3rd Round": 4, "3rd Round": 5,
};

/* ── 2026 NFL Draft class ── Updated Apr 22, 2026 ── */
const PROSPECTS_2026: Prospect[] = [
  {
    rank: 1, name: "Fernando Mendoza", pos: "QB", school: "Indiana",
    projected: "1st Round", conf: 97, team: "Las Vegas Raiders",
    trend: [90, 92, 93, 94, 95, 96, 97],
    breakdown: [
      { label: "Pocket Presence", score: 97 },
      { label: "Accuracy", score: 96 },
      { label: "Decision Making", score: 95 },
      { label: "NFL Readiness", score: 94 },
    ],
    note: "Heisman winner and national champion. Cerebral pocket passer with elite processing speed. Consensus #1 overall to Las Vegas Raiders.",
    momentum: "stable",
    buzz: "Medical cleared",
    teamFitWatch: "LV Raiders — locked",
    latestUpdate: "All medicals passed. Raiders confirmed as pick. PFF grades Mendoza 96.2 — highest college QB grade in PFF history.",
  },
  {
    rank: 2, name: "Arvell Reese", pos: "EDGE", school: "Ohio State",
    projected: "1st Round", conf: 95, team: "New York Jets",
    trend: [88, 90, 91, 93, 94, 94, 95],
    breakdown: [
      { label: "Pass Rush", score: 97 },
      { label: "Athleticism", score: 96 },
      { label: "Run Defense", score: 91 },
      { label: "Motor", score: 95 },
    ],
    note: "Elite physicality and explosiveness. Multiple scouts tab as most physically dominant prospect since Myles Garrett. Jets strong fit at #2.",
    momentum: "rising",
    buzz: "Landing spot locked",
    teamFitWatch: "NYJ Jets — confirmed fit",
    latestUpdate: "Reese visit to Jets went exceptional. No trade-down calls entertained. Landry Football scouting: Reese's hand technique and burst profile grade well at the next level. Wide-9 deployment is a favorable fit for his athleticism.",
  },
  {
    rank: 3, name: "Rueben Bain Jr.", pos: "EDGE", school: "Miami (FL)",
    projected: "1st Round", conf: 93, team: "Arizona Cardinals",
    trend: [87, 88, 90, 91, 92, 93, 93],
    breakdown: [
      { label: "Pass Rush", score: 96 },
      { label: "Burst/Get-Off", score: 95 },
      { label: "Power", score: 94 },
      { label: "Bend", score: 90 },
    ],
    note: "Power end with elite initial quickness. When Bain lines up across from you, offensive linemen know they are in for a long day.",
    momentum: "stable",
    buzz: "Trade-down buzz",
    teamFitWatch: "ARI Cardinals — trade-down possible",
    latestUpdate: "Cards taking calls to move down. Bain stays favored if pick holds. PFF: 94.7 pass-rush grade, 26.1% pressure rate — best in FBS.",
  },
  {
    rank: 4, name: "Jeremiyah Love", pos: "RB", school: "Notre Dame",
    projected: "1st Round", conf: 90, team: "Tennessee Titans",
    trend: [84, 85, 87, 88, 89, 89, 90],
    breakdown: [
      { label: "Explosiveness", score: 97 },
      { label: "Vision", score: 91 },
      { label: "Pass Catching", score: 88 },
      { label: "Contact Balance", score: 90 },
    ],
    note: "90% probability top-5 pick per Draft Day Predictor. Most explosive back in recent memory. Rare juice and elusiveness at 215 lbs.",
    momentum: "rising",
    buzz: "Stock surging",
    teamFitWatch: "TEN Titans — OC praised pass-catching",
    latestUpdate: "Private visits with 3 top-5 teams in 48h window. Historic RB pre-draft buzz. Phil Steele college preview: Love grades among the top RBs in the class, with production holding up well against ranked opponents.",
  },
  {
    rank: 5, name: "Caleb Downs", pos: "S", school: "Ohio State",
    projected: "1st Round", conf: 92, team: "New York Giants",
    trend: [86, 88, 89, 90, 91, 92, 92],
    breakdown: [
      { label: "Range", score: 97 },
      { label: "Processing Speed", score: 96 },
      { label: "Tackling", score: 93 },
      { label: "Coverage", score: 92 },
    ],
    note: "Earl Thomas comp from his DC at Ohio State. Defensive eraser with incredible all-around athleticism. Giants filling major secondary void.",
    momentum: "stable",
    buzz: "Starter confirmed",
    teamFitWatch: "NYG Giants — immediate FS1",
    latestUpdate: "Giants coaching staff confirmed drafting a starter. Daboll public statement.",
  },
  {
    rank: 6, name: "Kadyn Proctor", pos: "OT", school: "Alabama",
    projected: "1st Round", conf: 89, team: "New England Patriots",
    trend: [84, 85, 87, 88, 88, 89, 89],
    breakdown: [
      { label: "Run Blocking", score: 94 },
      { label: "Pass Pro", score: 91 },
      { label: "Athleticism", score: 90 },
      { label: "Consistency", score: 88 },
    ],
    note: "Moves people in the run game and builds firm pockets. Patriots need an anchor at LT after Mayo restructure.",
    momentum: "rising",
    buzz: "FA fallout",
    teamFitWatch: "NE Patriots — not trading out",
    latestUpdate: "Patriots struck out on 3 OT free agents. Proctor now unambiguous top priority.",
  },
  {
    rank: 7, name: "Spencer Fano", pos: "OT", school: "Utah",
    projected: "1st Round", conf: 88, team: "Cleveland Browns",
    trend: [83, 84, 85, 86, 87, 88, 88],
    breakdown: [
      { label: "Natural Coordination", score: 96 },
      { label: "Athleticism", score: 93 },
      { label: "Footwork", score: 92 },
      { label: "Strength", score: 87 },
    ],
    note: "Natural coordination makes everything look effortless. Can't go wrong drafting athletes like Fano. Possible IOL slide adds versatility.",
    momentum: "falling",
    buzz: "Medical flag",
    teamFitWatch: "CLE Browns — backup OT in play",
    latestUpdate: "Browns requested additional imaging on prior ankle procedure.",
  },
  {
    rank: 8, name: "Sonny Styles", pos: "LB", school: "Ohio State",
    projected: "1st Round", conf: 87, team: "Washington Commanders",
    trend: [82, 83, 84, 85, 86, 87, 87],
    breakdown: [
      { label: "Athleticism", score: 98 },
      { label: "Range", score: 93 },
      { label: "Pass Rush", score: 87 },
      { label: "Coverage", score: 88 },
    ],
    note: "6-foot-4, 250 lbs, runs 4.46s forty. No comp for this size/speed combination at LB. Different breed.",
    momentum: "rising",
    buzz: "Scheme fit",
    teamFitWatch: "WAS Commanders — Quinn walked him through scheme",
    latestUpdate: "Quinn ran Styles through LB-heavy walk-through. Source: 'perfect fit.'",
  },
  {
    rank: 9, name: "Mansoor Delane", pos: "CB", school: "LSU",
    projected: "1st Round", conf: 86, team: "New Orleans Saints",
    trend: [81, 82, 83, 84, 85, 86, 86],
    breakdown: [
      { label: "Man Coverage", score: 94 },
      { label: "Ball Skills", score: 91 },
      { label: "Athleticism", score: 92 },
      { label: "Tackling", score: 84 },
    ],
    note: "True island corner in a league trending away from the type. Can revive lockdown CB role at next level.",
    momentum: "stable",
    buzz: "Trade-down at #9",
    teamFitWatch: "NO Saints — open to moving down",
    latestUpdate: "Saints fielded QB/EDGE trade-up calls. Delane safe in 9–14 range.",
  },
  {
    rank: 10, name: "Makai Lemon", pos: "WR", school: "USC",
    projected: "1st Round", conf: 85, team: "Kansas City Chiefs",
    trend: [80, 81, 82, 83, 84, 85, 85],
    breakdown: [
      { label: "Route Running", score: 93 },
      { label: "Separation", score: 92 },
      { label: "YAC", score: 90 },
      { label: "Hands", score: 88 },
    ],
    note: "Some scouts believe most talented WR in class, would be top-10 without injury concerns from 2025 season.",
    momentum: "falling",
    buzz: "Medical flag",
    teamFitWatch: "KC Chiefs — Stewart as safe floor",
    latestUpdate: "3 teams in 8–15 range requested updated shoulder imaging. Slide risk real.",
  },
];

/* ── 2025 archive class (prior year reference) ── */
const PROSPECTS_2025: Prospect[] = [
  {
    rank: 1, name: "Cam Ward", pos: "QB", school: "Miami (FL)",
    projected: "1st Round", conf: 96, team: "Tennessee Titans",
    trend: [91, 92, 93, 94, 94, 95, 96],
    breakdown: [{ label: "Arm Talent", score: 97 }, { label: "Accuracy", score: 94 }, { label: "Mobility", score: 88 }, { label: "NFL Readiness", score: 95 }],
    note: "Selected #1 overall by Tennessee. Delivered on pre-draft hype with strong rookie camp showing.",
  },
  {
    rank: 2, name: "Travis Hunter", pos: "WR/CB", school: "Colorado",
    projected: "1st Round", conf: 94, team: "Cleveland Browns",
    trend: [96, 95, 95, 94, 93, 94, 94],
    breakdown: [{ label: "Receiving", score: 96 }, { label: "Coverage", score: 91 }, { label: "Athleticism", score: 98 }, { label: "NFL Readiness", score: 90 }],
    note: "Heisman winner. Cleveland used him primarily at WR in 2025 as anticipated.",
  },
  {
    rank: 3, name: "Abdul Carter", pos: "EDGE", school: "Penn State",
    projected: "1st Round", conf: 91, team: "NY Giants",
    trend: [87, 88, 89, 90, 90, 91, 91],
    breakdown: [{ label: "Pass Rush", score: 95 }, { label: "Run Defense", score: 86 }, { label: "Athleticism", score: 93 }, { label: "NFL Readiness", score: 89 }],
    note: "Giants' selection. Showed immediate edge presence in rookie season.",
  },
  {
    rank: 4, name: "Will Johnson", pos: "CB", school: "Michigan",
    projected: "1st Round", conf: 88, team: "New England Patriots",
    trend: [90, 90, 89, 88, 89, 88, 88],
    breakdown: [{ label: "Coverage", score: 92 }, { label: "Tackling", score: 87 }, { label: "Ball Skills", score: 90 }, { label: "NFL Readiness", score: 85 }],
    note: "Physical press corner. New England's secondary anchor for their rebuild.",
  },
  {
    rank: 5, name: "Ashton Jeanty", pos: "RB", school: "Boise State",
    projected: "1st Round", conf: 85, team: "Jacksonville Jaguars",
    trend: [82, 83, 85, 86, 85, 85, 85],
    breakdown: [{ label: "Explosiveness", score: 96 }, { label: "Vision", score: 89 }, { label: "Pass Pro", score: 78 }, { label: "NFL Readiness", score: 84 }],
    note: "Heisman runner-up. Historic production. Jacksonville used him as their primary back from day one.",
  },
];

const SEASON_DATA: Record<string, { prospects: Prospect[]; lastUpdated: string; status: "live" | "demo" | "archive" }> = {
  "2026": { prospects: PROSPECTS_2026, lastUpdated: "April 22, 2026", status: "live" },
  "2025": { prospects: PROSPECTS_2025, lastUpdated: "April 30, 2025", status: "archive" },
};

const AVAILABLE_SEASONS = ["2026", "2025"];

/* ── Sparkline ── */
function buildSparkPath(data: number[], width: number, height: number): { linePath: string; areaPath: string; lastPt: number[]; strokeColor: string } {
  const vMin = Math.min(...data) - 2;
  const vMax = Math.max(...data) + 2;
  const vRange = vMax - vMin || 1;
  const vStep = width / (data.length - 1);
  const coords: number[][] = data.map((v, i) => [i * vStep, height - ((v - vMin) / vRange) * height]);
  const linePath = coords.map((pt, i) => `${i === 0 ? "M" : "L"}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join(" ");
  const areaPath = linePath + ` L${(data.length - 1) * vStep},${height} L0,${height} Z`;
  const vDelta = data[data.length - 1] - data[0];
  const strokeColor = vDelta > 1 ? "#3DAE72" : vDelta < -1 ? "#C04040" : "#C9A84C";
  return { linePath, areaPath, lastPt: coords[coords.length - 1], strokeColor };
}

function Sparkline({ data, width = 64, height = 24 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const sp = buildSparkPath(data, width, height);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", overflow: "visible" }}>
      <path d={sp.areaPath} fill={sp.strokeColor} fillOpacity={0.12} />
      <path d={sp.linePath} fill="none" stroke={sp.strokeColor} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sp.lastPt[0]} cy={sp.lastPt[1]} r={2} fill={sp.strokeColor} />
    </svg>
  );
}

function MomentumBadge({ type }: { type: "rising" | "falling" | "stable" }) {
  if (type === "rising") return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
      fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
      color: "#3DAE72", background: "rgba(61,174,114,0.10)",
      border: "1px solid rgba(61,174,114,0.25)", borderRadius: 2, padding: "2px 6px",
    }}>
      <TrendingUp size={9} /> Rising
    </span>
  );
  if (type === "falling") return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
      fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
      color: "#C04040", background: "rgba(192,64,64,0.10)",
      border: "1px solid rgba(192,64,64,0.25)", borderRadius: 2, padding: "2px 6px",
    }}>
      <TrendingDown size={9} /> Falling
    </span>
  );
  return null;
}

function BuzzTag({ label }: { label: string }) {
  const isAlert = label.toLowerCase().includes("medical") || label.toLowerCase().includes("flag");
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
      fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
      color: isAlert ? "#D4932A" : "#CAA85A",
      background: isAlert ? "rgba(212,147,42,0.08)" : "rgba(202,168,90,0.08)",
      border: `1px solid ${isAlert ? "rgba(212,147,42,0.25)" : "rgba(202,168,90,0.20)"}`,
      borderRadius: 2, padding: "2px 6px",
    }}>
      {isAlert && <AlertTriangle size={8} />} {label}
    </span>
  );
}

export default function DraftBoard({ theme, toggleTheme }: Props) {
  const [expandedRank, setExpandedRank] = useState<number | null>(null);
  const [activeSeason, setActiveSeason] = useState("2026");
  type SortKey = "rank" | "conf" | "pos" | "projected";
  type SortDir = "asc" | "desc";
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [posFilter, setPosFilter] = useState<string>("ALL");

  const seasonMeta = SEASON_DATA[activeSeason];
  const PROSPECTS = seasonMeta.prospects;
  const AVAILABLE_POS = ["ALL", ...Array.from(new Set(PROSPECTS.map(p => p.pos)))];

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "conf" ? "desc" : "asc");
    }
    setExpandedRank(null);
  };

  // Reset filters when season changes
  const handleSeasonChange = (season: string) => {
    setActiveSeason(season);
    setPosFilter("ALL");
    setSortKey("rank");
    setSortDir("asc");
    setExpandedRank(null);
  };

  const sortedProspects = useMemo(() => {
    let list = [...PROSPECTS];
    if (posFilter !== "ALL") list = list.filter(p => p.pos === posFilter);
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "rank")      cmp = a.rank - b.rank;
      else if (sortKey === "conf") cmp = a.conf - b.conf;
      else if (sortKey === "pos")  cmp = a.pos.localeCompare(b.pos);
      else if (sortKey === "projected") {
        const ao = ROUND_ORDER[a.projected] ?? 9;
        const bo = ROUND_ORDER[b.projected] ?? 9;
        cmp = ao - bo;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [sortKey, sortDir, posFilter, PROSPECTS]);

  const { data: draftItems, isLoading } = useQuery<SignalFeedItem[]>({
    queryKey: ["/api/signal", "draft_week"],
    queryFn: () => apiRequest("GET", "/api/signal?topic=draft_week").then(r => r.json()),
    refetchInterval: 60000,
  });

  const { data: allSignals } = useQuery<SignalFeedItem[]>({
    queryKey: ["/api/signal"],
    queryFn: () => apiRequest("GET", "/api/signal").then(r => r.json()),
  });

  const items = draftItems ?? [];

  const confColor = (c: number) =>
    c >= 90 ? "text-[#3DAE72]" : c >= 80 ? "text-primary" : "text-muted-foreground";

  const confBarColor = (c: number) =>
    c >= 90 ? "#3DAE72" : c >= 80 ? "#D8B86A" : "#7E776A";

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
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="section-kicker">
              <span className="data-label text-primary">Intelligence Module</span>
            </p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <h1
                className="text-xl font-bold tracking-tight text-foreground"
                style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: "-0.02em", margin: 0 }}
              >
                Draft Board
              </h1>
              <DataBadge
                type={seasonMeta.status}
                label={activeSeason === "2026" ? "Live · 2026 Class" : `Archive · ${activeSeason}`}
              />
            </div>
            <p className="text-[12px] text-muted-foreground mt-1.5">
              {activeSeason} NFL Draft prospects · Edge Setter Intel · Last updated {seasonMeta.lastUpdated}
            </p>
          </div>

          {/* Season selector */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div
              style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.18em",
                textTransform: "uppercase", color: "#7E776A",
                marginBottom: 2,
              }}
            >
              Season
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {AVAILABLE_SEASONS.map(season => (
                <button
                  key={season}
                  onClick={() => handleSeasonChange(season)}
                  data-testid={`season-btn-${season}`}
                  style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 12, fontWeight: 700, letterSpacing: "0.14em",
                    textTransform: "uppercase", padding: "5px 12px",
                    borderRadius: 3, cursor: "pointer",
                    border: activeSeason === season
                      ? "1px solid rgba(202,168,90,0.55)"
                      : "1px solid rgba(202,168,90,0.18)",
                    background: activeSeason === season
                      ? "rgba(202,168,90,0.12)"
                      : "transparent",
                    color: activeSeason === season ? "#CAA85A" : "#7E776A",
                    transition: "all 0.15s",
                  }}
                >
                  {season}
                </button>
              ))}
            </div>
            {activeSeason !== "2026" && (
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
                color: "#7E776A",
                display: "flex", alignItems: "center", gap: 4,
              }}>
                Archive · Read only
              </span>
            )}
          </div>
        </div>

        <hr className="briefing-rule mb-5" />

        {/* Top Prospects Table */}
        <div className="rounded border border-border bg-card mb-6 overflow-hidden editorial-table" data-testid="draft-prospects-table">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/20" style={{ flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 className="text-sm font-bold" style={{ fontFamily: "'Playfair Display', Georgia, serif", margin: 0 }}>
                Top Prospects — {activeSeason} Class
              </h2>
              <DataBadge type={seasonMeta.status} label={activeSeason === "2026" ? "Live · 2026" : `Archive · ${activeSeason}`} />
            </div>
            {/* Position filter pills */}
            <div className="flex items-center gap-1 flex-wrap justify-end">
              {AVAILABLE_POS.map(pos => (
                <button
                  key={pos}
                  onClick={() => { setPosFilter(pos); setExpandedRank(null); }}
                  data-testid={`filter-pos-${pos}`}
                  className={`text-[12px] px-3 py-1 rounded border font-bold uppercase tracking-widest transition-colors ${
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
                  <th className="text-left px-4 py-2.5 w-9">
                    <button onClick={() => handleSort("rank")} data-testid="sort-rank" className="flex items-center gap-1 group">
                      <span className={`data-label transition-colors ${ sortKey === "rank" ? "text-primary" : "group-hover:text-foreground" }`}>#</span>
                      {sortKey === "rank"
                        ? (sortDir === "asc" ? <ChevronUp size={10} className="text-primary" /> : <ChevronDown size={10} className="text-primary" />)
                        : <ChevronsUpDown size={10} className="text-muted-foreground/40 group-hover:text-muted-foreground" />}
                    </button>
                  </th>
                  <th className="text-left px-4 py-2.5">
                    <button onClick={() => handleSort("pos")} data-testid="sort-pos" className="flex items-center gap-1 group">
                      <span className={`data-label transition-colors ${ sortKey === "pos" ? "text-primary" : "group-hover:text-foreground" }`}>Player / Pos</span>
                      {sortKey === "pos"
                        ? (sortDir === "asc" ? <ChevronUp size={10} className="text-primary" /> : <ChevronDown size={10} className="text-primary" />)
                        : <ChevronsUpDown size={10} className="text-muted-foreground/40 group-hover:text-muted-foreground" />}
                    </button>
                  </th>
                  <th className="text-left px-4 py-2.5 hidden sm:table-cell">
                    <span className="data-label">School</span>
                  </th>
                  <th className="text-left px-4 py-2.5">
                    <button onClick={() => handleSort("projected")} data-testid="sort-projected" className="flex items-center gap-1 group">
                      <span className={`data-label transition-colors ${ sortKey === "projected" ? "text-primary" : "group-hover:text-foreground" }`}>Projection</span>
                      {sortKey === "projected"
                        ? (sortDir === "asc" ? <ChevronUp size={10} className="text-primary" /> : <ChevronDown size={10} className="text-primary" />)
                        : <ChevronsUpDown size={10} className="text-muted-foreground/40 group-hover:text-muted-foreground" />}
                    </button>
                  </th>
                  <th className="text-center px-3 py-2.5 hidden md:table-cell">
                    <span className="data-label">7d Trend</span>
                  </th>
                  <th className="text-left px-3 py-2.5 hidden lg:table-cell">
                    <span className="data-label">Momentum</span>
                  </th>
                  <th className="text-right px-4 py-2.5">
                    <button onClick={() => handleSort("conf")} data-testid="sort-edge-score" className="flex items-center gap-1 justify-end ml-auto group">
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
                        <td className="px-4 py-4 text-sm font-bold tabular-nums text-muted-foreground">{displayRank}</td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-[17px] text-foreground leading-tight">{p.name}</p>
                          <p className="text-[13px] text-muted-foreground mt-0.5">{p.pos} · {p.team}</p>
                        </td>
                        <td className="px-4 py-4 text-sm text-muted-foreground hidden sm:table-cell">{p.school}</td>
                        <td className="px-4 py-4">
                          <span className="text-[11px] px-2.5 py-1 rounded border border-border bg-muted/40 text-muted-foreground font-semibold uppercase tracking-wider">
                            {p.projected}
                          </span>
                        </td>
                        {/* Sparkline cell */}
                        <td className="px-3 py-4 hidden md:table-cell">
                          <div className="flex flex-col items-center gap-0.5">
                            <Sparkline data={p.trend} width={64} height={22} />
                            {(() => {
                              const delta = p.trend[p.trend.length - 1] - p.trend[0];
                              const color = delta > 1 ? "text-[#3DAE72]" : delta < -1 ? "text-[#C04040]" : "text-primary";
                              const sign = delta > 0 ? "+" : "";
                              return (
                                <span className={`text-[10px] font-bold tabular-nums ${color}`}>
                                  {sign}{delta}
                                </span>
                              );
                            })()}
                          </div>
                        </td>
                        {/* Momentum + Buzz cell */}
                        <td className="px-3 py-4 hidden lg:table-cell">
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                            {p.momentum && p.momentum !== "stable" && <MomentumBadge type={p.momentum} />}
                            {p.buzz && <BuzzTag label={p.buzz} />}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className={`stat-num-display text-lg font-bold ${confColor(p.conf)}`}>
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
                          <td colSpan={7} className="px-5 py-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                              {/* Col 1 — Profile */}
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Prospect Profile</p>
                                <div className="space-y-1">
                                  {[
                                    { label: "Position",   value: p.pos },
                                    { label: "School",     value: p.school },
                                    { label: "Projection", value: p.projected },
                                    { label: "Proj. Team", value: p.team },
                                  ].map(({ label, value }) => (
                                    <div key={label} className="flex justify-between items-baseline gap-4">
                                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap">{label}</span>
                                      <span className="text-[12px] text-foreground font-semibold text-right">{value}</span>
                                    </div>
                                  ))}
                                </div>
                                {/* Team Fit Watch */}
                                {p.teamFitWatch && (
                                  <div className="mt-2 pt-2 border-t border-border/40">
                                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Team Fit Watch</p>
                                    <p className="text-[11px] text-primary font-semibold">{p.teamFitWatch}</p>
                                  </div>
                                )}
                                {/* Latest Update */}
                                {p.latestUpdate && (
                                  <div className="mt-2 pt-2 border-t border-border/40">
                                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Latest Intel</p>
                                    <p className="text-[11px] text-foreground leading-snug">{p.latestUpdate}</p>
                                  </div>
                                )}
                                <div className="mt-3 pt-3 border-t border-border/40">
                                  <p className="text-[11px] text-muted-foreground leading-relaxed italic">{p.note}</p>
                                </div>
                              </div>

                              {/* Col 2 — Edge Score Breakdown */}
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Edge Score Breakdown</p>
                                <div className="flex items-center gap-3 mb-3 pb-2 border-b border-border/40">
                                  <Sparkline data={p.trend} width={100} height={30} />
                                  <div>
                                    {(() => {
                                      const delta = p.trend[p.trend.length - 1] - p.trend[0];
                                      const color = delta > 1 ? "#3DAE72" : delta < -1 ? "#C04040" : "#C9A84C";
                                      const sign = delta > 0 ? "+" : "";
                                      return (
                                        <>
                                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">7-Day Move</p>
                                          <p className="text-base font-bold tabular-nums leading-tight" style={{ color }}>
                                            {sign}{delta} pts
                                          </p>
                                          <p className="text-[9px] text-muted-foreground">
                                            {p.trend[0]} → {p.trend[p.trend.length - 1]}
                                          </p>
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  {p.breakdown.map(({ label, score }) => (
                                    <div key={label}>
                                      <div className="flex justify-between mb-0.5">
                                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
                                        <span className="text-[11px] font-bold tabular-nums" style={{ color: confBarColor(score) }}>{score}</span>
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
                                      <span className="text-[10px] uppercase tracking-wider font-bold text-foreground">Overall</span>
                                      <span className={`text-[12px] font-bold tabular-nums ${confColor(p.conf)}`}>{p.conf}</span>
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
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                                  Linked Signals {signals.length > 0 && <span className="text-primary">· {signals.length}</span>}
                                </p>
                                {signals.length === 0 ? (
                                  <p className="text-[11px] text-muted-foreground italic">No signals found for this prospect in current cycle.</p>
                                ) : (
                                  <div className="space-y-2">
                                    {signals.map(s => (
                                      <div key={s.id} className="p-2.5 rounded border border-border/60 bg-card">
                                        <div className="flex items-center gap-1.5 mb-1">
                                          <VerdictBadge verdict={s.verdict} />
                                          <span className="text-[10px] text-muted-foreground ml-auto">{s.source_name}</span>
                                        </div>
                                        <p className="text-[11px] text-foreground leading-snug">{s.normalized_claim}</p>
                                        <p className="text-[10px] text-muted-foreground mt-1">{parseFloat(s.confidence_score ?? "0").toFixed(0)}% conf</p>
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
          <h2 className="text-sm font-bold" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Draft Week Signals
          </h2>
          <hr className="flex-1 border-border" />
          {activeSeason === "2026" ? (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
              fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
              color: "#3DAE72", background: "rgba(61,174,114,0.10)",
              border: "1px solid rgba(61,174,114,0.25)", borderRadius: 2, padding: "3px 8px",
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#3DAE72", display: "inline-block" }} />
              Live · {items.length} signals
            </span>
          ) : (
            <DataBadge type="archive" label="Archive" />
          )}
        </div>

        {/* Live event urgency bar for 2026 */}
        {activeSeason === "2026" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(202,168,90,0.06)",
            border: "1px solid rgba(202,168,90,0.22)",
            borderRadius: 4, padding: "9px 14px", marginBottom: 16,
            flexWrap: "wrap", rowGap: 4,
          }}>
            <Zap size={12} style={{ color: "#CAA85A", flexShrink: 0 }} />
            <span style={{
              fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
              color: "#CAA85A",
            }}>Draft Week Live · Apr 24–26</span>
            <span style={{ fontSize: 12, color: "#B7AFA0", marginLeft: 4 }}>
              Prospect risers/fallers, medical flags, team-fit confirmations — updated in real time.
            </span>
          </div>
        )}

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
                <span className="text-[10px] px-2 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground uppercase tracking-wider font-semibold">
                  {item.league}
                </span>
              )}
              {(item as any).source_name && (item as any).source_name !== "Edge Setter Intel" && (
                <BuzzTag label={(item as any).source_name} />
              )}
            </div>
            {item.player && (
              <p className="text-[11px] font-bold text-primary mb-1 uppercase tracking-wider">{item.player}</p>
            )}
            <p className="text-sm text-foreground">{item.normalized_claim}</p>
            {(item as any).rationale && (
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug" style={{ fontStyle: "italic" }}>
                Action: {(item as any).rationale}
              </p>
            )}
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border">
              <span className="text-[11px] text-muted-foreground">{item.source_name}</span>
              <span className="stat-num-display text-[11px] tabular-nums text-muted-foreground ml-auto">{parseFloat(item.confidence_score ?? "0").toFixed(0)}% conf</span>
            </div>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
