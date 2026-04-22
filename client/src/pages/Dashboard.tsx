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
      <div className="p-4 sm:p-6 max-w-7xl mx-auto" data-testid="dashboard-page">

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

/* StatCard — Film Ledger premium stat card */
function StatCard({ label, value, accentColor }: { label: string; value: number; accentColor: string }) {
  return (
    <div
      className="rounded"
      style={{
        background: "#16191E",
        border: "1px solid rgba(202,168,90,0.12)",
        padding: "18px 18px 14px",
        position: "relative",
        overflow: "hidden",
      }}
      data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "rgba(202,168,90,0.45)", pointerEvents: "none" }} />
      <p
        className="stat-num-display"
        style={{ color: accentColor, fontFamily: "'Playfair Display', Georgia, serif", fontSize: 32, fontWeight: 700, lineHeight: 1, marginBottom: 6 }}
      >
        {value}
      </p>
      <p className="data-label">{label}</p>
    </div>
  );
}

/* SignalCard — Film Ledger premium signal card */
function SignalCard({ item }: { item: SignalFeedItem }) {
  const conf = parseFloat(item.confidence_score ?? "0");
  const confColor =
    conf >= 88 ? "#3DAE72" :
    conf >= 75 ? "#CAA85A" :
    "#B7AFA0";

  return (
    <div
      className="signal-card rounded"
      style={{
        background: "#16191E",
        border: "1px solid rgba(202,168,90,0.10)",
        borderLeft: "3px solid rgba(202,168,90,0.35)",
        padding: "18px 20px",
      }}
      data-testid={`signal-card-${item.id}`}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderLeftColor = "#CAA85A"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderLeftColor = "rgba(202,168,90,0.35)"; }}
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <VerdictBadge verdict={item.verdict} />
        <TopicBadge topic={item.topic} />
        {item.league && (
          <span style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
            textTransform: "uppercase",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#7E776A", padding: "2px 7px", borderRadius: 2,
          }}>
            {item.league}
          </span>
        )}
        <span style={{ fontSize: 12, color: "#7E776A", marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
          {item.created_at ? new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
        </span>
      </div>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          {(item.player || item.team) && (
            <p
              style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
                textTransform: "uppercase", color: "#CAA85A",
                marginBottom: 6,
              }}
            >
              {[item.player, item.team].filter(Boolean).join(" · ")}
            </p>
          )}
          <p
            style={{ fontSize: 16, lineHeight: 1.5, color: "#F3EFE6", marginBottom: item.rationale ? 8 : 0 }}
            data-testid={`signal-text-${item.id}`}
          >
            {item.normalized_claim}
          </p>
          {item.rationale && (
            <p style={{ fontSize: 14, color: "#B7AFA0", lineHeight: 1.6, margin: 0 }}>{item.rationale}</p>
          )}
        </div>
        <div
          className="flex-shrink-0 text-right"
          style={{ borderLeft: "1px solid rgba(202,168,90,0.10)", paddingLeft: 16, marginLeft: 4 }}
        >
          <div
            className="stat-num-display"
            style={{ color: confColor, fontSize: 28, fontWeight: 700 }}
          >
            {conf.toFixed(0)}<span style={{ fontSize: 14 }}>%</span>
          </div>
          <p className="data-label" style={{ marginTop: 2 }}>Conf.</p>
          {item.source_name && (
            <p style={{ fontSize: 11, color: "#7E776A", marginTop: 4, maxWidth: 88 }} className="truncate">{item.source_name}</p>
          )}
        </div>
      </div>
    </div>
  );
}
