import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { publicConfidenceLabel } from "@/lib/storyLanguage";
import { Link } from "wouter";
import AppLayout from "../components/AppLayout";
import VerdictBadge from "../components/VerdictBadge";
import TopicBadge from "../components/TopicBadge";
import DataBadge from "../components/DataBadge";
import { type Theme } from "../App";
import { type SignalFeedItem } from "@shared/schema";
import { RefreshCw, SlidersHorizontal, Clock, Lock } from "lucide-react";

/** Number of signals shown free before the paywall gate. */
const FREE_SIGNAL_LIMIT = 3;

/** Parse a query param from canonical search, with legacy hash-route fallback. */
function getRouteParam(key: string): string {
  try {
    const canonical = new URLSearchParams(window.location.search).get(key);
    if (canonical) return canonical;
    const hash = window.location.hash;
    const qIdx = hash.indexOf("?");
    if (qIdx === -1) return "";
    const search = hash.slice(qIdx + 1);
    return new URLSearchParams(search).get(key) ?? "";
  } catch { return ""; }
}

interface Props { theme: Theme; toggleTheme: () => void; }

const LEAGUES = ["", "NFL", "College"];
const TOPICS = ["", "draft_week", "free_agency", "injury", "draft", "trade", "coaching", "depth_chart", "general"];
const VERDICTS = ["", "confirmed", "likely", "rumor", "contradicted", "review"];

// Signals created on or after this date are considered "live 2026 data"
const LIVE_CUTOFF_MS = new Date("2026-01-01T00:00:00Z").getTime();

/** Returns true if a signal's created_at is within the 2026 season window. */
function isLive2026(createdAt: string | null): boolean {
  if (!createdAt) return false;
  return new Date(createdAt).getTime() >= LIVE_CUTOFF_MS;
}

/** Strip raw DB metadata debug strings from rationale. */
function cleanRationale(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (/^Tier:\s*tier\d/i.test(raw)) return null;
  return raw;
}

export default function Dashboard({ theme, toggleTheme }: Props) {
  const [league, setLeague] = useState("");
  const [topic, setTopic] = useState(() => getRouteParam("topic"));
  const [verdict, setVerdict] = useState("");
  const highlightId = useRef<string>(getRouteParam("highlight"));
  const didScroll = useRef(false);

  const params = new URLSearchParams();
  if (league) params.set("league", league);
  if (topic) params.set("topic", topic);
  if (verdict) params.set("verdict", verdict);

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const { data: feed, isLoading, refetch } = useQuery<SignalFeedItem[]>({
    queryKey: ["/api/signal", league, topic, verdict],
    queryFn: () => apiRequest("GET", `/api/signal?${params.toString()}`).then(r => {
      setLastUpdated(new Date());
      return r.json();
    }),
    refetchInterval: 60000,
  });

  /* ── Highlight + scroll to a specific signal on deep-link ── */
  useEffect(() => {
    const id = highlightId.current;
    if (!id || didScroll.current || isLoading) return;
    // Give the DOM a tick to paint the feed
    const tryScroll = () => {
      const el = document.querySelector(`[data-testid="signal-card-${id}"]`) as HTMLElement | null;
      if (!el) return;
      didScroll.current = true;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Flash-highlight: gold ring that fades out
      el.style.transition = "box-shadow 0.3s ease, border-color 0.3s ease";
      el.style.boxShadow = "0 0 0 2px #F5B841, 0 0 24px rgba(245,184,65,0.35)";
      el.style.borderLeftColor = "#F5B841";
      setTimeout(() => {
        el.style.boxShadow = "";
        el.style.borderLeftColor = "";
      }, 2200);
    };
    const t = setTimeout(tryScroll, 120);
    return () => clearTimeout(t);
  }, [isLoading]);

  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
    queryFn: () => apiRequest("GET", "/api/stats").then(r => r.json()),
    refetchInterval: 30000,
  });

  // Count live vs demo signals
  const liveCount = feed?.filter(s => isLive2026(s.created_at)).length ?? 0;
  const totalCount = feed?.length ?? 0;
  const hasDemoSignals = totalCount > 0 && liveCount < totalCount;

  return (
    <AppLayout theme={theme} toggleTheme={toggleTheme}>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto" data-testid="dashboard-page">

        {/* Header — briefing document */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="section-kicker">
              <span className="data-label" style={{ color: "hsl(194 56% 51%)" }}>Intelligence Feed</span>
            </p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <h1
                className="text-xl font-bold tracking-tight text-foreground"
                style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: "-0.02em", margin: 0 }}
              >
                Live Signals — 2026 Offseason
              </h1>
              <DataBadge
                type={liveCount > 0 ? "live" : "demo"}
                label={liveCount > 0 ? `Live · ${liveCount} signal${liveCount !== 1 ? "s" : ""}` : "Limited Coverage"}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-1">
            {lastUpdated && (
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                <Clock size={10} />
                Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
            <button
              onClick={() => { refetch(); setLastUpdated(new Date()); }}
              className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-semibold text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded border border-border hover:bg-muted"
              data-testid="button-refresh-feed"
            >
              <RefreshCw size={11} />
              Refresh
            </button>
          </div>
        </div>

        <hr className="briefing-rule mb-4" />

        {/* Data status bar */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10,
            marginBottom: 20,
            padding: "9px 14px",
            background: liveCount > 0 ? "rgba(61,174,114,0.05)" : "rgba(245,184,65,0.05)",
            border: liveCount > 0 ? "1px solid rgba(61,174,114,0.18)" : "1px solid rgba(245,184,65,0.14)",
            borderRadius: 3,
            flexWrap: "wrap",
          }}
          data-testid="data-status-bar"
        >
          {liveCount > 0 ? (
            <>
              <DataBadge type="live" label="Live · 2026 Season" />
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 12, color: "#64748B", letterSpacing: "0.06em",
              }}>
                {liveCount} verified signal{liveCount !== 1 ? "s" : ""} from the 2026 NFL offseason.
                {hasDemoSignals && ` ${totalCount - liveCount} older signal${totalCount - liveCount !== 1 ? "s" : ""} shown as archive reference.`}
              </span>
            </>
          ) : (
            <>
              <DataBadge type="demo" />
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 12, color: "#64748B", letterSpacing: "0.06em",
              }}>
                Limited offseason coverage shown. Live 2026 signals appear when verified signal records are available.
              </span>
            </>
          )}
        </div>

        {/* KPI strip — parchment inset cards with analytics accent numerals */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6" data-testid="stats-strip">
            <StatCard label="Total Signals" value={stats.total_signals ?? 0} accentColor="hsl(42 61% 57%)" />
            <StatCard label="Confirmed" value={stats.verdict_breakdown?.confirmed ?? 0} accentColor="hsl(194 56% 58%)" />
            <StatCard label="Review Queue" value={stats.review_queue ?? 0} accentColor="hsl(330 42% 62%)" />
            <StatCard label="Sources" value={stats.sources_tracked ?? 0} accentColor="hsl(34 52% 89%)" />
          </div>
        )}

        {/* Filters — inline editorial toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-5 py-2.5 border-y border-border" data-testid="filter-bar">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">
            <SlidersHorizontal size={10} />
            <span>Filter</span>
          </div>
          <select
            value={league}
            onChange={e => setLeague(e.target.value)}
            className="text-[11px] uppercase tracking-wider font-semibold px-2.5 py-1.5 rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            data-testid="filter-league"
          >
            <option value="">All Leagues</option>
            {LEAGUES.filter(Boolean).map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select
            value={topic}
            onChange={e => setTopic(e.target.value)}
            className="text-[11px] uppercase tracking-wider font-semibold px-2.5 py-1.5 rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            data-testid="filter-topic"
          >
            <option value="">All Topics</option>
            {TOPICS.filter(Boolean).map(t => (
              <option key={t} value={t}>
                {t === "draft_week" ? "🏈 Draft Week" : t === "free_agency" ? "Free Agency" : t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <select
            value={verdict}
            onChange={e => setVerdict(e.target.value)}
            className="text-[11px] uppercase tracking-wider font-semibold px-2.5 py-1.5 rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            data-testid="filter-verdict"
          >
            <option value="">All Verdicts</option>
            {VERDICTS.filter(Boolean).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          {(league || topic || verdict) && (
            <button
              onClick={() => { setLeague(""); setTopic(""); setVerdict(""); }}
              className="text-[11px] uppercase tracking-widest font-semibold px-2.5 py-1.5 rounded text-muted-foreground hover:text-foreground border border-border hover:bg-muted"
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
            <p className="text-[12px] text-muted-foreground">Try clearing filters or refreshing the feed</p>
          </div>
        )}

        {!isLoading && feed && feed.length > 0 && (
          <div className="space-y-2" data-testid="signal-feed">
            {/* Free signals — shown in full */}
            {feed.slice(0, FREE_SIGNAL_LIMIT).map(item => (
              <SignalCard key={item.id} item={item} />
            ))}

            {/* Locked signals — blurred preview */}
            {feed.length > FREE_SIGNAL_LIMIT && (
              <div style={{ position: "relative" }} data-testid="paywall-gate">
                {/* Ghost previews — 2 blurred cards */}
                <div style={{ filter: "blur(4px)", pointerEvents: "none", userSelect: "none", opacity: 0.55 }}>
                  {feed.slice(FREE_SIGNAL_LIMIT, FREE_SIGNAL_LIMIT + 2).map(item => (
                    <div key={item.id} style={{ marginBottom: 8 }}>
                      <SignalCard item={item} />
                    </div>
                  ))}
                </div>

                {/* Lock overlay */}
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  background: "linear-gradient(to bottom, rgba(10,11,13,0.10) 0%, rgba(10,11,13,0.82) 38%, rgba(10,11,13,0.96) 100%)",
                  borderRadius: 4,
                  padding: "0 24px",
                  textAlign: "center",
                  gap: 16,
                }}>
                  <div style={{
                    width: 40, height: 40,
                    background: "rgba(245,184,65,0.10)",
                    border: "1px solid rgba(245,184,65,0.30)",
                    borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Lock size={16} style={{ color: "#F5B841" }} />
                  </div>

                  <div>
                    <p style={{
                      fontFamily: "'Playfair Display', Georgia, serif",
                      fontSize: 20, fontWeight: 700,
                      color: "#F8FAFC", margin: "0 0 8px", lineHeight: 1.2,
                    }}>
                      Stop chasing tweets.
                    </p>
                    <p style={{ fontSize: 14, color: "#94A3B8", margin: "0 0 20px", lineHeight: 1.55, maxWidth: 400 }}>
                      Pro unlocks the full live feed, 2026 Draft Board, archive search, and topic filters — all in one place.
                    </p>
                  </div>

                  <Link href="/pro">
                    <div
                      data-testid="paywall-upgrade-cta"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        background: "#F5B841",
                        color: "#050505",
                        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                        fontSize: 12, fontWeight: 700,
                        letterSpacing: "0.16em", textTransform: "uppercase",
                        padding: "12px 28px",
                        borderRadius: 3,
                        cursor: "pointer",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "#FFD166"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "#F5B841"; }}
                    >
                      Go Pro · $19/mo
                    </div>
                  </Link>

                  <p style={{ fontSize: 12, color: "#64748B", margin: 0 }}>
                    {feed.length - FREE_SIGNAL_LIMIT} more signal{feed.length - FREE_SIGNAL_LIMIT !== 1 ? "s" : ""} in this feed
                  </p>
                </div>
              </div>
            )}
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
        background: "#101827",
        border: "1px solid rgba(245,184,65,0.12)",
        padding: "18px 18px 14px",
        position: "relative",
        overflow: "hidden",
      }}
      data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "rgba(245,184,65,0.45)", pointerEvents: "none" }} />
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
    conf >= 75 ? "#F5B841" :
    "#94A3B8";

  const live = isLive2026(item.created_at);

  return (
    <div
      className="signal-card rounded"
      style={{
        background: "#101827",
        border: "1px solid rgba(245,184,65,0.10)",
        borderLeft: `3px solid ${live ? "rgba(61,174,114,0.50)" : "rgba(245,184,65,0.35)"}`,
        padding: "18px 20px",
      }}
      data-testid={`signal-card-${item.id}`}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderLeftColor = live ? "#3DAE72" : "#F5B841"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderLeftColor = live ? "rgba(61,174,114,0.50)" : "rgba(245,184,65,0.35)"; }}
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
            color: "#64748B", padding: "2px 7px", borderRadius: 2,
          }}>
            {item.league}
          </span>
        )}
        {/* Per-signal data status label */}
        {live
          ? <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
              color: "#3DAE72",
            }}><span className="live-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "#3DAE72", display: "inline-block" }} />Live · 2026</span>
          : <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
              color: "#64748B",
            }}>Demo</span>
        }
        <span style={{ fontSize: 12, color: "#64748B", marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
          {item.created_at ? new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}
        </span>
      </div>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          {(item.player || item.team) && (
            <p
              style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.14em",
                textTransform: "uppercase", color: "#F5B841",
                marginBottom: 6,
              }}
            >
              {[item.player, item.team].filter(Boolean).join(" · ")}
            </p>
          )}
          <p
            style={{ fontSize: 17, lineHeight: 1.5, color: "#F8FAFC", marginBottom: item.rationale ? 8 : 0 }}
            data-testid={`signal-text-${item.id}`}
          >
            {item.normalized_claim}
          </p>
          {cleanRationale(item.rationale) && (
            <p style={{ fontSize: 15, color: "#94A3B8", lineHeight: 1.6, margin: 0 }}>{cleanRationale(item.rationale)}</p>
          )}
        </div>
        <div
          className="flex-shrink-0 text-right"
          style={{ borderLeft: "1px solid rgba(245,184,65,0.10)", paddingLeft: 16, marginLeft: 4 }}
        >
          <div
            className="stat-num-display"
            style={{ color: confColor, fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}
          >
            {publicConfidenceLabel(conf)}
          </div>
          <p className="data-label" style={{ marginTop: 2 }}>Conf.</p>
          {item.source_name && (() => {
            const isPFF = item.source_name === "Pro Football Focus" || item.source_name === "PFF";
            const isLandry = item.source_name === "Landry Football" || item.source_name === "Chris Landry";
            const isSteele = item.source_name === "Phil Steele";
            if (isPFF) return (
              <span style={{
                display: "inline-block", marginTop: 5,
                padding: "2px 6px", borderRadius: 3,
                border: "1px solid rgba(245,184,65,0.35)",
                background: "rgba(245,184,65,0.10)",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.13em",
                textTransform: "uppercase", color: "#F5B841",
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              }}>PFF</span>
            );
            if (isLandry) return (
              <span style={{
                display: "inline-block", marginTop: 5,
                padding: "2px 6px", borderRadius: 3,
                border: "1px solid rgba(61,174,114,0.32)",
                background: "rgba(61,174,114,0.09)",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.13em",
                textTransform: "uppercase", color: "#3DAE72",
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              }}>Scout</span>
            );
            if (isSteele) return (
              <span style={{
                display: "inline-block", marginTop: 5,
                padding: "2px 6px", borderRadius: 3,
                border: "1px solid rgba(167,120,220,0.32)",
                background: "rgba(167,120,220,0.09)",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.13em",
                textTransform: "uppercase", color: "#A778DC",
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              }}>College</span>
            );
            return <p style={{ fontSize: 11, color: "#64748B", marginTop: 4, maxWidth: 88 }} className="truncate">{item.source_name}</p>;
          })()}
        </div>
      </div>
    </div>
  );
}
