import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import AppLayout from "../components/AppLayout";
import VerdictBadge from "../components/VerdictBadge";
import TopicBadge from "../components/TopicBadge";
import { type Theme } from "../App";
import { type SignalFeedItem } from "@shared/schema";
import { RefreshCw, SlidersHorizontal } from "lucide-react";

interface Props { theme: Theme; toggleTheme: () => void; }

const LEAGUES = ["", "NFL", "College"];
const TOPICS = ["", "injury", "draft", "trade", "coaching", "transaction", "depth_chart", "general"];
const VERDICTS = ["", "confirmed", "likely", "rumor", "contradicted", "review"];

export default function Dashboard({ theme, toggleTheme }: Props) {
  const [league, setLeague] = useState("");
  const [topic, setTopic] = useState("");
  const [verdict, setVerdict] = useState("");

  const params = new URLSearchParams();
  if (league) params.set("league", league);
  if (topic) params.set("topic", topic);
  if (verdict) params.set("verdict", verdict);

  const { data: feed, isLoading, refetch } = useQuery<SignalFeedItem[]>({
    queryKey: ["/api/signal", league, topic, verdict],
    queryFn: () => apiRequest("GET", `/api/signal?${params.toString()}`).then(r => r.json()),
    refetchInterval: 60000,
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
    queryFn: () => apiRequest("GET", "/api/stats").then(r => r.json()),
    refetchInterval: 30000,
  });

  return (
    <AppLayout theme={theme} toggleTheme={toggleTheme}>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto" data-testid="dashboard-page">

        {/* Header — briefing document */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="section-kicker">
              <span className="data-label" style={{ color: "hsl(194 56% 51%)" }}>Intelligence Feed</span>
            </p>
            <h1
              className="text-xl font-bold tracking-tight text-foreground mt-3"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: "-0.02em" }}
            >
              Signal Board
            </h1>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded border border-border hover:bg-muted mt-1"
            data-testid="button-refresh-feed"
          >
            <RefreshCw size={11} />
            Refresh
          </button>
        </div>

        <hr className="briefing-rule mb-6" />

        {/* KPI strip — parchment inset cards with analytics accent numerals */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6" data-testid="stats-strip">
            {/* Total Signals — amber */}
            <StatCard
              label="Total Signals"
              value={stats.total_signals ?? 0}
              accentColor="hsl(42 61% 57%)"
            />
            {/* Confirmed — cyan (trust/verified) */}
            <StatCard
              label="Confirmed"
              value={stats.verdict_breakdown?.confirmed ?? 0}
              accentColor="hsl(194 56% 58%)"
            />
            {/* Review Queue — magenta (alert) */}
            <StatCard
              label="Review Queue"
              value={stats.review_queue ?? 0}
              accentColor="hsl(330 42% 62%)"
            />
            {/* Sources — slate (neutral data) */}
            <StatCard
              label="Sources"
              value={stats.sources_tracked ?? 0}
              accentColor="hsl(34 52% 89%)"
            />
          </div>
        )}

        {/* Filters — inline editorial toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-5 py-2.5 border-y border-border" data-testid="filter-bar">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
            <SlidersHorizontal size={10} />
            <span>Filter</span>
          </div>
          <select
            value={league}
            onChange={e => setLeague(e.target.value)}
            className="text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1.5 rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            data-testid="filter-league"
          >
            <option value="">All Leagues</option>
            {LEAGUES.filter(Boolean).map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select
            value={topic}
            onChange={e => setTopic(e.target.value)}
            className="text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1.5 rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            data-testid="filter-topic"
          >
            <option value="">All Topics</option>
            {TOPICS.filter(Boolean).map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
          <select
            value={verdict}
            onChange={e => setVerdict(e.target.value)}
            className="text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1.5 rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            data-testid="filter-verdict"
          >
            <option value="">All Verdicts</option>
            {VERDICTS.filter(Boolean).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          {(league || topic || verdict) && (
            <button
              onClick={() => { setLeague(""); setTopic(""); setVerdict(""); }}
              className="text-[10px] uppercase tracking-widest font-semibold px-2.5 py-1.5 rounded text-muted-foreground hover:text-foreground border border-border hover:bg-muted"
              data-testid="button-clear-filters"
            >
              Clear
            </button>
          )}
        </div>

        {/* Feed */}
        {isLoading && (
          <div className="space-y-2.5" data-testid="skeleton-feed">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-20 rounded border border-border bg-muted/20 animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && (!feed || feed.length === 0) && (
          <div className="text-center py-16 border border-border rounded bg-card" data-testid="empty-state-feed">
            <p className="text-sm font-semibold text-foreground mb-1">No signals match your filters</p>
            <p className="text-[11px] text-muted-foreground">Try clearing filters or refreshing the feed</p>
          </div>
        )}

        {!isLoading && feed && feed.length > 0 && (
          <div className="space-y-2" data-testid="signal-feed">
            {feed.map(item => (
              <SignalCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

/* StatCard — dark graphite card with analytics accent numeral */
function StatCard({ label, value, accentColor }: { label: string; value: number; accentColor: string }) {
  return (
    <div
      className="p-3.5 rounded"
      style={{
        background: "hsl(22 10% 13%)",
        border: "1px solid hsl(22 10% 22%)",
      }}
      data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <p
        className="stat-num-display text-xl font-bold"
        style={{ color: accentColor, fontFamily: "'Playfair Display', Georgia, serif" }}
      >
        {value}
      </p>
      <p className="data-label mt-0.5">{label}</p>
    </div>
  );
}

/* SignalCard — dark card with analytics confidence colors */
function SignalCard({ item }: { item: SignalFeedItem }) {
  const conf = parseFloat(item.confidence_score ?? "0");
  /* Analytics accent: cyan ≥80%, amber ≥60%, muted otherwise */
  const confColor =
    conf >= 80 ? "hsl(194 56% 58%)" :
    conf >= 60 ? "hsl(42 61% 57%)" :
    "hsl(30 10% 58%)";

  return (
    <div
      className="signal-card p-4 rounded"
      style={{
        background: "hsl(22 10% 13%)",
        border: "1px solid hsl(22 10% 22%)",
      }}
      data-testid={`signal-card-${item.id}`}
    >
      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
        <VerdictBadge verdict={item.verdict} />
        <TopicBadge topic={item.topic} />
        {item.league && (
          <span className="text-[9px] px-2 py-0.5 rounded border border-border bg-muted/50 text-muted-foreground uppercase tracking-wider font-semibold">
            {item.league}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
          {item.created_at ? new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
        </span>
      </div>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {(item.player || item.team) && (
            <p
              className="text-[10px] font-bold mb-1 uppercase tracking-wider"
              style={{ color: "hsl(42 61% 57%)" }}
            >
              {[item.player, item.team].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="text-sm leading-snug text-foreground" data-testid={`signal-text-${item.id}`}>
            {item.normalized_claim}
          </p>
          {item.rationale && (
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{item.rationale}</p>
          )}
        </div>
        <div
          className="flex-shrink-0 text-right pl-3 ml-1"
          style={{ borderLeft: "1px solid hsl(22 10% 22%)" }}
        >
          <div
            className="stat-num-display text-lg font-bold"
            style={{ color: confColor }}
          >
            {conf.toFixed(0)}%
          </div>
          <p className="data-label">conf.</p>
          {item.source_name && (
            <p className="text-[10px] text-muted-foreground mt-1 max-w-[80px] truncate">{item.source_name}</p>
          )}
        </div>
      </div>
    </div>
  );
}
