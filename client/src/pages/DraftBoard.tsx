import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import AppLayout from "../components/AppLayout";
import VerdictBadge from "../components/VerdictBadge";
import { type Theme } from "../App";
import { type SignalFeedItem } from "@shared/schema";

interface Props { theme: Theme; toggleTheme: () => void; }

export default function DraftBoard({ theme, toggleTheme }: Props) {
  const { data: draftItems, isLoading } = useQuery<SignalFeedItem[]>({
    queryKey: ["/api/signal", "draft"],
    queryFn: () => apiRequest("GET", "/api/signal?topic=draft").then(r => r.json()),
    refetchInterval: 60000,
  });

  const items = draftItems ?? [];

  const prospects = [
    { rank: 1, name: "Cam Ward", pos: "QB", school: "Miami (FL)", projected: "1st Round", conf: 96, team: "Tennessee Titans" },
    { rank: 2, name: "Travis Hunter", pos: "WR/CB", school: "Colorado", projected: "1st Round", conf: 94, team: "Cleveland Browns" },
    { rank: 3, name: "Abdul Carter", pos: "EDGE", school: "Penn State", projected: "1st Round", conf: 91, team: "NY Giants" },
    { rank: 4, name: "Will Johnson", pos: "CB", school: "Michigan", projected: "1st Round", conf: 88, team: "New England Patriots" },
    { rank: 5, name: "Ashton Jeanty", pos: "RB", school: "Boise State", projected: "1st Round", conf: 85, team: "Jacksonville Jaguars" },
    { rank: 6, name: "Mason Graham", pos: "DT", school: "Michigan", projected: "1st Round", conf: 83, team: "Las Vegas Raiders" },
    { rank: 7, name: "Tetairoa McMillan", pos: "WR", school: "Arizona", projected: "1st Round", conf: 81, team: "Carolina Panthers" },
    { rank: 8, name: "Kelvin Banks Jr.", pos: "OT", school: "Texas", projected: "1st Round", conf: 79, team: "New York Giants" },
    { rank: 9, name: "Jalon Walker", pos: "LB", school: "Georgia", projected: "1st–2nd Round", conf: 74, team: "Atlanta Falcons" },
    { rank: 10, name: "Jihaad Campbell", pos: "LB", school: "Alabama", projected: "1st–2nd Round", conf: 72, team: "Philadelphia Eagles" },
  ];

  const confColor = (c: number) =>
    c >= 90 ? "text-[hsl(146,42%,52%)]" : c >= 80 ? "text-primary" : "text-muted-foreground";

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
              Top 10 Prospects
            </h2>
            <span className="data-label">Edge score · Confidence</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-prospects">
              <thead>
                <tr className="border-b border-border bg-muted/10">
                  <th className="text-left px-4 py-2.5 w-9">
                    <span className="data-label">#</span>
                  </th>
                  <th className="text-left px-4 py-2.5">
                    <span className="data-label">Player</span>
                  </th>
                  <th className="text-left px-4 py-2.5 hidden sm:table-cell">
                    <span className="data-label">School</span>
                  </th>
                  <th className="text-left px-4 py-2.5">
                    <span className="data-label">Projection</span>
                  </th>
                  <th className="text-right px-4 py-2.5">
                    <span className="data-label">Edge Score</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {prospects.map(p => (
                  <tr
                    key={p.rank}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                    data-testid={`prospect-row-${p.rank}`}
                  >
                    <td className="px-4 py-3 text-xs font-bold tabular-nums text-muted-foreground">{p.rank}</td>
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
                      <span
                        className={`stat-num-display text-sm font-bold ${confColor(p.conf)}`}
                      >
                        {p.conf}
                      </span>
                    </td>
                  </tr>
                ))}
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
