import V2Shell, { SportBadge } from "../components/V2Shell";
import { Link } from "wouter";
import { NBA_SIGNALS, MLB_SIGNALS, NBA_TONIGHT, TOOLS } from "../data/v2MockData";
import { ArrowRight, Zap, TrendingUp, AlertTriangle, BarChart2, Clock } from "lucide-react";

const T = {
  bg:         "#0A0B0D",
  surface1:   "#111317",
  surface2:   "#16191E",
  surface3:   "#1B1F25",
  gold:       "#CAA85A",
  goldBright: "#D8B86A",
  goldDim:    "rgba(202,168,90,0.16)",
  text:       "#F3EFE6",
  textMuted:  "#B7AFA0",
  textFaint:  "#7E776A",
  green:      "#4CAF82",
  orange:     "#D98A42",
  cyan:       "#4AA8C8",
  danger:     "#D94B4B",
};

const VERDICT_COLOR: Record<string, string> = {
  confirmed: T.green,
  likely:    T.gold,
  rumor:     T.orange,
  contradicted: T.danger,
  review:    T.textFaint,
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  injury:       <AlertTriangle size={11} />,
  line_move:    <TrendingUp size={11} />,
  matchup_edge: <Zap size={11} />,
  rotation:     <BarChart2 size={11} />,
  lineup:       <BarChart2 size={11} />,
  trend:        <TrendingUp size={11} />,
  prop:         <Zap size={11} />,
  news:         <Clock size={11} />,
};

/* Board card */
interface BoardCardProps {
  sport: string;
  label: string;
  description: string;
  href: string;
  status: "LIVE" | "ACTIVE" | "BUILDING" | "OFFSEASON" | "COMING SOON";
  primary?: boolean;
  signalCount?: number;
  color: string;
}

function BoardCard({ sport, label, description, href, status, primary, signalCount, color }: BoardCardProps) {
  const disabled = status === "COMING SOON" || status === "OFFSEASON";
  return (
    <Link href={disabled ? "#" : href}>
      <div
        data-testid={`board-card-${sport.toLowerCase()}`}
        style={{
          border: primary
            ? `1px solid rgba(202,168,90,0.4)`
            : `1px solid rgba(255,255,255,0.07)`,
          borderRadius: 5,
          background: primary ? "rgba(202,168,90,0.04)" : T.surface1,
          padding: "20px 20px 18px",
          cursor: disabled ? "default" : "pointer",
          transition: "border-color 0.15s, background 0.15s",
          position: "relative",
          overflow: "hidden",
          opacity: disabled ? 0.55 : 1,
        }}
        onMouseEnter={e => {
          if (!disabled && !primary) {
            const el = e.currentTarget as HTMLDivElement;
            el.style.borderColor = "rgba(202,168,90,0.25)";
            el.style.background = "rgba(202,168,90,0.02)";
          }
        }}
        onMouseLeave={e => {
          if (!disabled && !primary) {
            const el = e.currentTarget as HTMLDivElement;
            el.style.borderColor = "rgba(255,255,255,0.07)";
            el.style.background = T.surface1;
          }
        }}
      >
        {primary && (
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: T.gold }} />
        )}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
          {/* Sport abbr */}
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em",
            color: color, lineHeight: 1,
          }}>
            {sport}
          </div>
          <SportBadge status={status} />
        </div>
        <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 5 }}>
          {label}
        </div>
        <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: T.textMuted, letterSpacing: "0.04em", lineHeight: 1.5, marginBottom: 14 }}>
          {description}
        </div>
        {!disabled && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {signalCount != null && (
              <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.textFaint, letterSpacing: "0.1em" }}>
                {signalCount} signals today
              </span>
            )}
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: primary ? T.gold : T.textMuted, marginLeft: "auto" }}>
              Open Board <ArrowRight size={10} />
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

/* Signal row */
function SignalRow({ sig, showSport }: { sig: (typeof NBA_SIGNALS)[0]; showSport?: boolean }) {
  const vColor = VERDICT_COLOR[sig.verdict] ?? T.textFaint;
  return (
    <div
      data-testid={`signal-row-${sig.id}`}
      style={{
        display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px",
        borderBottom: `1px solid rgba(255,255,255,0.04)`,
        transition: "background 0.12s", cursor: "pointer",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(202,168,90,0.03)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
    >
      {/* Type icon */}
      <div style={{ color: T.textFaint, marginTop: 1, flexShrink: 0 }}>
        {TYPE_ICON[sig.type] ?? <Zap size={11} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
          {showSport && (
            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: sig.sport === "NBA" ? T.gold : T.cyan, textTransform: "uppercase" }}>
              {sig.sport}
            </span>
          )}
          <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: T.textFaint, textTransform: "uppercase" }}>
            {sig.team}{sig.opponent ? ` · ${sig.opponent}` : ""}
          </span>
          <span style={{ color: T.textFaint, fontSize: 10 }}>·</span>
          <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.06em" }}>
            {sig.timestamp}
          </span>
        </div>
        <div style={{ fontSize: 13, color: T.text, fontWeight: 500, lineHeight: 1.4, marginBottom: 4 }}>
          {sig.headline}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: vColor }}>
            {sig.verdict}
          </span>
          <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint }}>
            {sig.confidence}% conf
          </span>
          <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint }}>
            {sig.sources} sources
          </span>
        </div>
      </div>
    </div>
  );
}

export default function V2Home() {
  const topSignals = [
    ...NBA_SIGNALS.filter(s => s.confidence >= 80),
    ...MLB_SIGNALS.filter(s => s.confidence >= 70),
  ].sort((a, b) => b.confidence - a.confidence).slice(0, 8);

  return (
    <V2Shell>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 0 48px" }}>

        {/* ─── Command Center Hero ─── */}
        <section
          data-testid="command-center"
          style={{
            borderBottom: `1px solid ${T.goldDim}`,
            padding: "28px 28px 24px",
            background: `linear-gradient(135deg, rgba(202,168,90,0.03) 0%, transparent 60%)`,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.green, display: "inline-block" }} />
                <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.green }}>
                  Intelligence Terminal · Live
                </span>
              </div>
              <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 26, fontWeight: 700, color: T.text, margin: "0 0 8px", lineHeight: 1.25, letterSpacing: "-0.02em" }}>
                Sports Intelligence<br />Research Workspace
              </h1>
              <p style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 14, color: T.textMuted, margin: "0 0 20px", lineHeight: 1.6, letterSpacing: "0.03em", maxWidth: 480 }}>
                Real-time signals, boards, and decision tools for NBA, MLB, and beyond.
                Built for fantasy players, DFS grinders, and sharp bettors.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link href="/v2/nba">
                  <button
                    data-testid="cta-open-nba"
                    style={{
                      background: T.gold, color: T.bg, border: "none", borderRadius: 3,
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
                      padding: "10px 22px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    Open NBA Board <ArrowRight size={12} />
                  </button>
                </Link>
                <Link href="/v2/tools">
                  <button
                    data-testid="cta-explore-tools"
                    style={{
                      background: "transparent", color: T.text,
                      border: `1px solid rgba(202,168,90,0.28)`, borderRadius: 3,
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
                      padding: "10px 22px", cursor: "pointer",
                    }}
                  >
                    Explore Tools
                  </button>
                </Link>
              </div>
            </div>

            {/* Tonight's Slate — right side */}
            <div style={{ background: T.surface1, border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 5, minWidth: 280, maxWidth: 360, flex: "1 0 280px" }}>
              <div style={{ padding: "12px 14px", borderBottom: `1px solid rgba(255,255,255,0.06)`, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, display: "inline-block" }} />
                <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.textFaint }}>
                  Tonight's NBA Slate
                </span>
              </div>
              {NBA_TONIGHT.map(game => (
                <div key={game.id} style={{ padding: "10px 14px", borderBottom: `1px solid rgba(255,255,255,0.04)`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 2 }}>
                      {game.away} <span style={{ color: T.textFaint, fontWeight: 400 }}>@</span> {game.home}
                    </div>
                    {game.series && <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.06em" }}>{game.series}</div>}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.gold, letterSpacing: "0.06em", marginBottom: 1 }}>{game.spread}</div>
                    <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.04em" }}>O/U {game.total}</div>
                    <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.04em" }}>{game.time}</div>
                  </div>
                </div>
              ))}
              <div style={{ padding: "8px 14px" }}>
                <Link href="/v2/nba">
                  <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.gold, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                    Open NBA Board <ArrowRight size={10} />
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Main body ─── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 0 }} className="v2-main-grid">

          {/* Left column */}
          <div style={{ borderRight: `1px solid ${T.goldDim}` }}>

            {/* Board cards */}
            <section style={{ padding: "24px 28px 0" }}>
              <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.textFaint, marginBottom: 14 }}>
                Boards
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                <BoardCard sport="NBA" label="NBA Board" description="Playoffs live. Injury flags, line movement, matchup edges, rotation intel." href="/v2/nba" status="LIVE" primary signalCount={NBA_SIGNALS.length} color={T.gold} />
                <BoardCard sport="MLB" label="MLB Board" description="Regular season active. Pitcher news, lineup movement, team trends." href="/v2/mlb" status="ACTIVE" signalCount={MLB_SIGNALS.length} color={T.cyan} />
                <BoardCard sport="NFL" label="NFL Board" description="Offseason. Draft analysis and roster movement available. Full season board launching August." href="/v2/nfl" status="OFFSEASON" color={T.textFaint} />
                <BoardCard sport="CFB" label="CFB Board" description="Building now. College football intelligence board launching before fall camp." href="/v2/cfb" status="COMING SOON" color={T.textFaint} />
              </div>
            </section>

            {/* Live signal feed */}
            <section style={{ marginTop: 28 }}>
              <div style={{ padding: "0 28px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.textFaint }}>
                  Top Signals — Live
                </div>
                <Link href="/v2/nba">
                  <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: T.gold, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                    All NBA <ArrowRight size={10} />
                  </span>
                </Link>
              </div>
              <div style={{ border: `1px solid rgba(255,255,255,0.06)`, borderLeft: "none", borderRight: "none" }}>
                {topSignals.map(sig => (
                  <SignalRow key={sig.id} sig={sig} showSport />
                ))}
              </div>
            </section>
          </div>

          {/* Right column */}
          <div>
            {/* Tools preview */}
            <div style={{ padding: "24px 20px 0" }}>
              <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.textFaint, marginBottom: 14 }}>
                Tools
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {TOOLS.slice(0, 5).map(tool => {
                  const statusColor = tool.status === "Live" ? T.green : tool.status === "Beta" ? T.gold : T.textFaint;
                  return (
                    <Link key={tool.id} href={tool.href}>
                      <div
                        data-testid={`tool-preview-${tool.id}`}
                        style={{
                          padding: "12px 14px", borderRadius: 4,
                          background: T.surface1, border: `1px solid rgba(255,255,255,0.06)`,
                          cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                          transition: "border-color 0.12s",
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(202,168,90,0.22)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.06)"; }}
                      >
                        <span style={{ fontSize: 16 }}>{tool.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 1 }}>{tool.name}</div>
                          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.04em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {tool.sport.join(" · ")}
                          </div>
                        </div>
                        <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: statusColor, flexShrink: 0 }}>
                          {tool.status}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
              <Link href="/v2/tools">
                <div style={{ marginTop: 10, padding: "9px 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.textMuted, cursor: "pointer", border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 4 }}>
                  All Tools <ArrowRight size={10} />
                </div>
              </Link>
            </div>

            {/* MLB snapshot */}
            <div style={{ padding: "24px 20px 0" }}>
              <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.textFaint, marginBottom: 14 }}>
                MLB Signals
              </div>
              <div style={{ background: T.surface1, border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 4, overflow: "hidden" }}>
                {MLB_SIGNALS.slice(0, 3).map(sig => (
                  <SignalRow key={sig.id} sig={sig} />
                ))}
                <div style={{ padding: "10px 16px", borderTop: `1px solid rgba(255,255,255,0.06)` }}>
                  <Link href="/v2/mlb">
                    <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.cyan, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                      Open MLB Board <ArrowRight size={10} />
                    </span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Data stub notice */}
            <div style={{ margin: "20px", padding: "10px 14px", background: "rgba(202,168,90,0.04)", border: `1px solid rgba(202,168,90,0.12)`, borderRadius: 4 }}>
              <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.textFaint, lineHeight: 1.5, letterSpacing: "0.04em" }}>
                <strong style={{ color: T.gold }}>STUB DATA</strong> — Signal data above is realistic placeholder content. Wire live NBA/MLB signal ingestion to replace.
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .v2-main-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </V2Shell>
  );
}
