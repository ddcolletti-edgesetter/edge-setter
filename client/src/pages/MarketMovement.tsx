import { useState, useMemo, useEffect } from "react";
import AppShell from "@/components/V2Shell";
import { trpc } from "@/lib/trpc";
import { TrendingUp, TrendingDown, Zap, BarChart2, AlertTriangle } from "lucide-react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:        "#0C0B09",
  surface1:  "#131110",
  surface2:  "#1A1714",
  surface3:  "#201D19",
  gold:      "#F5A623",
  goldDim:   "rgba(245,166,35,0.14)",
  green:     "#39FF14",
  red:       "#FF5555",
  purple:    "#B06EFF",
  cyan:      "#4AA8C8",
  text:      "#F0EDE6",
  textMuted: "#8A8278",
  textFaint: "#4A4235",
  border:    "rgba(245,166,35,0.12)",
  borderMid: "rgba(255,255,255,0.07)",
};

type Sport = "ALL" | "NBA" | "MLB";
type SortKey = "time" | "confidence" | "urgency";

type Signal = {
  id: number;
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

// Try to extract a line value from the title text
function extractLine(text: string): { from: string; to: string } | null {
  // Pattern: -3.5 → -5.5, or -110 → -130, or from X to Y
  const arrowMatch = text.match(/([+-]?\d+\.?\d*)\s*[→→>]\s*([+-]?\d+\.?\d*)/);
  if (arrowMatch) return { from: arrowMatch[1], to: arrowMatch[2] };
  return null;
}

function lineDirection(from: string, to: string): "up" | "down" | "neutral" {
  const f = parseFloat(from);
  const t = parseFloat(to);
  if (isNaN(f) || isNaN(t)) return "neutral";
  return t > f ? "up" : t < f ? "down" : "neutral";
}

function urgencyLabel(score: number): { label: string; color: string } {
  if (score >= 8) return { label: "HIGH", color: T.red };
  if (score >= 5) return { label: "MED", color: T.gold };
  return { label: "LOW", color: T.textMuted };
}

// ── Market Move Card ──────────────────────────────────────────────────────────
function MoveCard({ signal, sport }: { signal: Signal; sport: string }) {
  const [expanded, setExpanded] = useState(false);
  const conf = signal.confidenceScore ?? 0;
  const urgency = signal.urgencyScore ?? 0;
  const { label: urgLabel, color: urgColor } = urgencyLabel(urgency);
  const lineMove = extractLine(signal.title);
  const direction = lineMove ? lineDirection(lineMove.from, lineMove.to) : "neutral";

  const accentColor = direction === "up" ? T.green : direction === "down" ? T.red : T.purple;

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{
        background: T.surface1,
        border: `1px solid ${T.borderMid}`,
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: 6,
        overflow: "hidden",
        cursor: "pointer",
        marginBottom: 10,
        transition: "border-color 0.12s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surface2; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.surface1; }}
    >
      {/* Top accent bar */}
      <div style={{ height: 2, background: `linear-gradient(90deg, ${accentColor}88, transparent)` }} />

      <div style={{ padding: "14px 18px" }}>
        {/* Row 1: sport + urgency + verdict + time */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{
            padding: "2px 8px", borderRadius: 3,
            background: "rgba(176,110,255,0.12)", color: T.purple,
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
          }}>LINE MOVE</span>
          <span style={{
            padding: "2px 7px", borderRadius: 3,
            background: sport === "NBA" ? "rgba(245,166,35,0.1)" : "rgba(57,255,20,0.08)",
            color: sport === "NBA" ? T.gold : T.green,
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
          }}>{sport}</span>
          <span style={{
            padding: "2px 6px", borderRadius: 3,
            background: `${urgColor}14`, color: urgColor,
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
          }}>{urgLabel}</span>
          <span style={{ marginLeft: "auto", fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: T.textFaint }}>
            {timeAgo(signal.publishedAt)}
          </span>
        </div>

        {/* Row 2: title + line visual */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 17, fontWeight: 700, color: T.text, lineHeight: 1.3,
            }}>
              {signal.title}
            </div>
            {signal.teamName && (
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: T.textMuted, marginTop: 4 }}>
                {signal.playerName ? `${signal.playerName} · ` : ""}{signal.teamName}
              </div>
            )}
          </div>

          {/* Line movement visual */}
          {lineMove ? (
            <div style={{
              flexShrink: 0, textAlign: "center",
              padding: "8px 14px", borderRadius: 6,
              background: `${accentColor}10`, border: `1px solid ${accentColor}30`,
            }}>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 18, fontWeight: 700, color: accentColor, lineHeight: 1 }}>
                {lineMove.from}
                <span style={{ fontSize: 14, margin: "0 4px", opacity: 0.6 }}>→</span>
                {lineMove.to}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 4 }}>
                {direction === "up" ? <TrendingUp size={11} style={{ color: accentColor }} /> : direction === "down" ? <TrendingDown size={11} style={{ color: accentColor }} /> : null}
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: accentColor, fontWeight: 700, letterSpacing: "0.08em" }}>
                  {direction === "up" ? "MOVING UP" : direction === "down" ? "MOVING DOWN" : "MOVE"}
                </span>
              </div>
            </div>
          ) : (
            // No parseable line — show confidence instead
            <div style={{
              flexShrink: 0, textAlign: "center",
              padding: "8px 14px", borderRadius: 6,
              background: T.surface3,
            }}>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 18, fontWeight: 700, color: conf >= 80 ? T.green : T.gold }}>
                {conf}%
              </div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.08em", marginTop: 2 }}>CONF</div>
            </div>
          )}
        </div>

        {/* Confidence bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
            <div style={{ width: `${conf}%`, height: "100%", background: accentColor, borderRadius: 2, opacity: 0.8 }} />
          </div>
          <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: T.textMuted, flexShrink: 0 }}>
            {conf}% confidence
          </span>
        </div>

        {/* Expanded */}
        {expanded && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.borderMid}` }}>
            {signal.summary && (
              <p style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.65, margin: "0 0 10px" }}>{signal.summary}</p>
            )}
            {signal.actionTakeaway && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "8px 12px", borderRadius: 5,
                background: T.goldDim, border: `1px solid rgba(245,166,35,0.2)`,
              }}>
                <Zap size={11} style={{ color: T.gold, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: T.gold, lineHeight: 1.5 }}>{signal.actionTakeaway}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stat pill ─────────────────────────────────────────────────────────────────
function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      padding: "10px 18px", borderRadius: 6, textAlign: "center",
      background: T.surface1, border: `1px solid ${T.borderMid}`,
    }}>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 900, color, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, color: T.textFaint, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 3 }}>
        {label}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MarketMovement() {
  const [sport, setSport] = useState<Sport>("ALL");
  const [sort, setSort] = useState<SortKey>("time");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  const { data: nbaData, isLoading: nbaLoading } = trpc.signals.nba.useQuery({ limit: 200 });
  const { data: mlbData, isLoading: mlbLoading } = trpc.signals.mlb.useQuery({ limit: 200 });

  const isLoading = nbaLoading || mlbLoading;

  // Merge + filter to line move signals only
  const lineMoveSignals = useMemo(() => {
    const isLineMove = (s: Signal) =>
      ["line_move", "line_moves", "sharp", "sharp_money"].includes((s.signalType ?? "").toLowerCase());

    const nba = ((nbaData ?? []) as Signal[]).filter(isLineMove).map(s => ({ ...s, sport: "NBA" }));
    const mlb = ((mlbData ?? []) as Signal[]).filter(isLineMove).map(s => ({ ...s, sport: "MLB" }));
    return [...nba, ...mlb];
  }, [nbaData, mlbData]);

  const filtered = useMemo(() => {
    let list = lineMoveSignals;
    if (sport !== "ALL") list = list.filter(s => s.sport === sport);
    return [...list].sort((a, b) => {
      if (sort === "confidence") return (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0);
      if (sort === "urgency") return (b.urgencyScore ?? 0) - (a.urgencyScore ?? 0);
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
  }, [lineMoveSignals, sport, sort]);

  // Stats
  const highConf = filtered.filter(s => (s.confidenceScore ?? 0) >= 80).length;
  const highUrgency = filtered.filter(s => (s.urgencyScore ?? 0) >= 7).length;
  const withLine = filtered.filter(s => extractLine(s.title)).length;

  return (
    <AppShell>
      <div style={{ background: T.bg, minHeight: "100%", padding: isMobile ? "20px 16px 60px" : "28px 28px 60px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <BarChart2 size={16} style={{ color: T.purple }} />
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
            }}>MARKET MOVEMENT</h1>
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, color: T.textMuted, margin: 0 }}>
              Real-time line movement and sharp money signals. Know when the books are getting hit and why.
            </p>
          </div>

          {/* Stats strip */}
          {!isLoading && filtered.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, marginBottom: 24 }}>
              <StatPill label="Total Moves" value={filtered.length} color={T.purple} />
              <StatPill label="High Conf" value={highConf} color={T.green} />
              <StatPill label="High Urgency" value={highUrgency} color={T.red} />
              <StatPill label="With Line Data" value={withLine} color={T.gold} />
            </div>
          )}

          {/* Filters */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {/* Sport */}
            <div style={{ display: "flex", gap: 6 }}>
              {(["ALL", "NBA", "MLB"] as Sport[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSport(s)}
                  style={{
                    padding: "6px 14px", borderRadius: 4,
                    border: sport === s ? `1px solid rgba(176,110,255,0.5)` : `1px solid ${T.borderMid}`,
                    background: sport === s ? "rgba(176,110,255,0.12)" : "transparent",
                    color: sport === s ? T.purple : T.textMuted,
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 13, fontWeight: 700, letterSpacing: "0.1em",
                    cursor: "pointer", transition: "all 0.12s",
                  }}
                >{s}</button>
              ))}
            </div>

            {/* Sort */}
            <div style={{ display: "flex", gap: 6, marginLeft: isMobile ? 0 : "auto" }}>
              {([
                { key: "time" as SortKey, label: "Latest" },
                { key: "confidence" as SortKey, label: "Confidence" },
                { key: "urgency" as SortKey, label: "Urgency" },
              ]).map(s => (
                <button
                  key={s.key}
                  onClick={() => setSort(s.key)}
                  style={{
                    padding: "5px 12px", borderRadius: 4,
                    border: sort === s.key ? `1px solid ${T.border}` : `1px solid transparent`,
                    background: sort === s.key ? T.goldDim : "transparent",
                    color: sort === s.key ? T.gold : T.textMuted,
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                    cursor: "pointer", transition: "all 0.12s",
                  }}
                >{s.label}</button>
              ))}
            </div>
          </div>

          {/* Loading */}
          {isLoading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{ height: 100, borderRadius: 6, background: T.surface1, opacity: 0.3 + i * 0.1 }} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 24px" }}>
              <BarChart2 size={40} style={{ color: T.textFaint, margin: "0 auto 14px", display: "block" }} />
              <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: T.textMuted, margin: "0 0 6px" }}>
                No line movement signals right now
              </p>
              <p style={{ fontSize: 13, color: T.textFaint, margin: 0 }}>
                Agents are monitoring. Sharp money moves will appear here as they're detected.
              </p>
            </div>
          )}

          {/* Signal feed */}
          {!isLoading && filtered.length > 0 && (
            <div>
              {/* Live indicator */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.purple, display: "inline-block", boxShadow: `0 0 8px ${T.purple}` }} />
                <span style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.16em",
                  textTransform: "uppercase", color: T.purple,
                }}>Live Market Feed — {filtered.length} move{filtered.length !== 1 ? "s" : ""}</span>
              </div>

              {filtered.map(signal => (
                <MoveCard key={`${signal.id}-${signal.sport}`} signal={signal} sport={signal.sport ?? "NBA"} />
              ))}
            </div>
          )}

        </div>
      </div>
    </AppShell>
  );
}
