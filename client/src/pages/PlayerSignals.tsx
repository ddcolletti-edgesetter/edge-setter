import { useState, useMemo, useEffect } from "react";
import AppShell from "@/components/V2Shell";
import { useNBASignals, useMLBSignals } from "@/hooks/useSignals";
import { publicConfidenceLabel } from "@/lib/storyLanguage";
import { Activity, Search, User, Zap, X, AlertTriangle, TrendingUp, BarChart2 } from "lucide-react";
import type { V2Signal } from "@/data/v2MockData";
import { SignalDetailDrawer, type SignalDetailLike } from "@/components/SignalDetailDrawer";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:        "#050505",
  surface1:  "#0A0F1A",
  surface2:  "#101827",
  gold:      "#F5B841",
  goldDim:   "rgba(245,184,65,0.14)",
  green:     "#00E676",
  red:       "#FF5252",
  blue:      "#00B7FF",
  purple:    "#B06EFF",
  text:      "#F0EDE6",
  textMuted: "#8A8278",
  textFaint: "#64748B",
  border:    "rgba(245,184,65,0.12)",
  borderMid: "rgba(255,255,255,0.07)",
};

type Sport = "ALL" | "NBA" | "MLB";

type Signal = {
  id: string;
  title: string;
  summary: string | null;
  playerName: string | null;
  teamName: string | null;
  signalType: string;
  urgencyScore: number | null;
  confidenceScore: number | null;
  statusTag: string | null;
  actionTakeaway: string | null;
  publishedAt: Date | string;
  sport?: string;
};

function toPlayerSignal(signal: V2Signal): Signal {
  return {
    id: signal.id,
    title: signal.headline,
    summary: signal.detail,
    playerName: signal.player ?? null,
    teamName: signal.team,
    signalType: signal.type,
    urgencyScore: null,
    confidenceScore: signal.confidence,
    statusTag: signal.verdict,
    actionTakeaway: signal.action_takeaway,
    publishedAt: signal.isoTimestamp ?? signal.timestamp,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(ts: Date | string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function confColor(score: number) {
  if (score >= 80) return T.green;
  if (score >= 60) return T.gold;
  return T.red;
}

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  injury:     { bg: "rgba(255,85,85,0.12)",   color: "#FF5252" },
  lineup:     { bg: "rgba(74,158,255,0.12)",  color: "#00B7FF" },
  line_move:  { bg: "rgba(176,110,255,0.12)", color: "#B06EFF" },
  line_moves: { bg: "rgba(176,110,255,0.12)", color: "#B06EFF" },
  prop:       { bg: "rgba(0,230,118,0.10)",   color: "#00E676" },
  props:      { bg: "rgba(0,230,118,0.10)",   color: "#00E676" },
  trend:      { bg: "rgba(74,158,255,0.10)",  color: "#00B7FF" },
};

function typeBadge(type: string) {
  const c = TYPE_COLORS[(type ?? "").toLowerCase()] ?? { bg: "rgba(245,184,65,0.10)", color: T.gold };
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 3,
      background: c.bg, color: c.color,
      fontFamily: "'Barlow Condensed', sans-serif",
      fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const,
      whiteSpace: "nowrap" as const,
    }}>{type?.replace(/_/g, " ") ?? "SIGNAL"}</span>
  );
}

function verdictColor(tag: string | null) {
  if (!tag) return T.textFaint;
  if (tag === "verified" || tag === "confirmed") return T.green;
  if (tag === "developing" || tag === "official") return T.gold;
  return T.textFaint;
}

// ── Signal Card ───────────────────────────────────────────────────────────────
function toDrawerSignal(signal: Signal): SignalDetailLike {
  return {
    id: signal.id,
    headline: signal.title,
    detail: signal.summary,
    player: signal.playerName,
    team: signal.teamName,
    type: signal.signalType,
    confidence: signal.confidenceScore,
    verdict: signal.statusTag,
    action_takeaway: signal.actionTakeaway,
    timestamp: typeof signal.publishedAt === "string" ? signal.publishedAt : signal.publishedAt.toISOString(),
    isoTimestamp: typeof signal.publishedAt === "string" ? signal.publishedAt : signal.publishedAt.toISOString(),
    sources: null,
  };
}

function PlayerSignalCard({ signal, sport, onOpenDetails }: { signal: Signal; sport: string; onOpenDetails: (signal: Signal) => void }) {
  const conf = signal.confidenceScore ?? 0;
  const vc = verdictColor(signal.statusTag);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${signal.title} signal detail`}
      onClick={() => onOpenDetails(signal)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpenDetails(signal);
      }}
      style={{
        background: T.surface1,
        border: `1px solid ${T.borderMid}`,
        borderRadius: 6,
        padding: "16px 18px",
        cursor: "pointer",
        transition: "border-color 0.12s, background 0.12s",
        marginBottom: 8,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = T.border; (e.currentTarget as HTMLElement).style.background = T.surface2; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.borderMid; (e.currentTarget as HTMLElement).style.background = T.surface1; }}
    >
      {/* Row 1: type + sport + verdict + time */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {typeBadge(signal.signalType)}
        <span style={{
          padding: "2px 7px", borderRadius: 3,
          background: sport === "NBA" ? "rgba(245,184,65,0.1)" : "rgba(0,230,118,0.08)",
          color: sport === "NBA" ? T.gold : T.green,
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
        }}>{sport}</span>
        {signal.statusTag && (
          <span style={{ fontSize: 11, fontWeight: 700, color: vc, marginLeft: 2, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
            {signal.statusTag}
          </span>
        )}
        <span style={{ marginLeft: "auto", fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: T.textFaint }}>
          {timeAgo(signal.publishedAt)}
        </span>
      </div>

      {/* Row 2: title */}
      <div style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: 17, fontWeight: 700, color: T.text,
        lineHeight: 1.3, marginBottom: 6,
      }}>
        {signal.title}
      </div>

      {/* Row 3: team + confidence */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        {signal.teamName && (
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: T.textMuted }}>
            {signal.teamName}
          </span>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <div style={{ width: 64, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${conf}%`, height: "100%", background: confColor(conf), borderRadius: 2 }} />
          </div>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, color: confColor(conf), whiteSpace: "nowrap" }}>
            {publicConfidenceLabel(conf)}
          </span>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: T.blue }}>
          View detail
        </span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PlayerSignals() {
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState<Sport>("ALL");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [drawerSignal, setDrawerSignal] = useState<Signal | null>(null);

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  const { signals: nbaData, loading: nbaLoading } = useNBASignals([]);
  const { signals: mlbData, loading: mlbLoading } = useMLBSignals([]);

  const isLoading = nbaLoading || mlbLoading;

  // Merge signals, tag with sport, filter to player signals only
  const allPlayerSignals = useMemo(() => {
    const nba = (nbaData ?? []).map(toPlayerSignal)
      .filter(s => s.playerName)
      .map(s => ({ ...s, sport: "NBA" }));
    const mlb = (mlbData ?? []).map(toPlayerSignal)
      .filter(s => s.playerName)
      .map(s => ({ ...s, sport: "MLB" }));
    return [...nba, ...mlb].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  }, [nbaData, mlbData]);

  // Apply filters
  const results = useMemo(() => {
    let list = allPlayerSignals;
    if (sport !== "ALL") list = list.filter(s => s.sport === sport);
    if (query.trim().length >= 2) {
      const q = query.toLowerCase();
      list = list.filter(s =>
        s.playerName?.toLowerCase().includes(q) ||
        s.teamName?.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allPlayerSignals, sport, query]);

  // Unique players for suggestions
  const topPlayers = useMemo(() => {
    const counts: Record<string, number> = {};
    allPlayerSignals.forEach(s => {
      if (s.playerName) counts[s.playerName] = (counts[s.playerName] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name);
  }, [allPlayerSignals]);

  const showSuggestions = query.trim().length === 0;

  return (
    <AppShell>
      <SignalDetailDrawer
        open={!!drawerSignal}
        signal={drawerSignal ? toDrawerSignal(drawerSignal) : null}
        sport={drawerSignal?.sport ?? "NBA"}
        onClose={() => setDrawerSignal(null)}
      />
      <div style={{ background: T.bg, minHeight: "100%", padding: isMobile ? "20px 16px 60px" : "28px 28px 60px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <User size={16} style={{ color: T.gold }} />
              <span style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.2em",
                textTransform: "uppercase", color: T.textFaint,
              }}>Intelligence Tools</span>
            </div>
            <h1 style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: isMobile ? 28 : 36, fontWeight: 900,
              color: T.text, letterSpacing: "0.03em", margin: "0 0 6px",
            }}>PLAYER SIGNAL SEARCH</h1>
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, color: T.textMuted, margin: 0 }}>
              Search any player to surface all active signals — injuries, lineup changes, props, and sharp intel.
            </p>
          </div>

          {/* Search bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 16px",
            background: T.surface1, border: `1px solid ${T.border}`,
            borderRadius: 8, marginBottom: 16,
          }}>
            <Search size={16} style={{ color: T.gold, flexShrink: 0 }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search player name, team, or keyword..."
              autoFocus
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 16, color: T.text,
              }}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                style={{ background: "none", border: "none", cursor: "pointer", color: T.textFaint, padding: 2 }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Sport filter */}
          <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
            {(["ALL", "NBA", "MLB"] as Sport[]).map(s => (
              <button
                key={s}
                onClick={() => setSport(s)}
                style={{
                  padding: "6px 16px", borderRadius: 4,
                  border: sport === s ? `1px solid rgba(245,184,65,0.5)` : `1px solid ${T.borderMid}`,
                  background: sport === s ? T.goldDim : "transparent",
                  color: sport === s ? T.gold : T.textMuted,
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 13, fontWeight: 700, letterSpacing: "0.1em",
                  cursor: "pointer", transition: "all 0.12s",
                }}
              >{s}</button>
            ))}
            <span style={{
              marginLeft: "auto", alignSelf: "center",
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 12, color: T.textFaint,
            }}>
              {isLoading ? "Loading…" : `${results.length} signal${results.length !== 1 ? "s" : ""}`}
            </span>
          </div>

          {/* Player quick-picks when no search */}
          {showSuggestions && topPlayers.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.18em",
                textTransform: "uppercase", color: T.textFaint, marginBottom: 12,
              }}>Most Active Players</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {topPlayers.map(name => (
                  <button
                    key={name}
                    onClick={() => setQuery(name)}
                    style={{
                      padding: "6px 14px", borderRadius: 20,
                      background: T.surface1, border: `1px solid ${T.borderMid}`,
                      color: T.text, fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 13, fontWeight: 600, cursor: "pointer",
                      transition: "border-color 0.12s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = T.border)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = T.borderMid)}
                  >{name}</button>
                ))}
              </div>
            </div>
          )}

          {/* Loading skeletons */}
          {isLoading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} style={{
                  height: 90, borderRadius: 6,
                  background: T.surface1, opacity: 0.4 + i * 0.1,
                }} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && results.length === 0 && query.trim().length >= 2 && (
            <div style={{ textAlign: "center", padding: "60px 24px" }}>
              <User size={40} style={{ color: T.textFaint, margin: "0 auto 14px", display: "block" }} />
              <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: T.textMuted, margin: "0 0 6px" }}>
                No signals found for "{query}"
              </p>
              <p style={{ fontSize: 13, color: T.textFaint, margin: 0 }}>Try a different name or check spelling.</p>
            </div>
          )}

          {/* Results */}
          {!isLoading && results.length > 0 && (
            <div>
              {/* Group by player when searching */}
              {query.trim().length >= 2 ? (
                <div>
                  {results.map(signal => (
                    <PlayerSignalCard key={`${signal.id}-${signal.sport}`} signal={signal} sport={signal.sport ?? "NBA"} onOpenDetails={setDrawerSignal} />
                  ))}
                </div>
              ) : (
                // No search: show latest signals
                <div>
                  <div style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.18em",
                    textTransform: "uppercase", color: T.textFaint, marginBottom: 12,
                  }}>Latest Player Signals</div>
                  {results.slice(0, 30).map(signal => (
                    <PlayerSignalCard key={`${signal.id}-${signal.sport}`} signal={signal} sport={signal.sport ?? "NBA"} onOpenDetails={setDrawerSignal} />
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </AppShell>
  );
}
