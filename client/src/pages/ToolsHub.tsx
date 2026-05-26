import { useState } from "react";
import V2Shell from "../components/V2Shell";
import { TOOLS } from "../data/v2MockData";
import { Link } from "wouter";
import { ArrowRight, ExternalLink, Zap, TrendingUp, Activity, BarChart2, Search, Database } from "lucide-react";
import { T } from "../components/v2/SportVisuals";
import { SportsStoryVisual, leagueToSport } from "@/components/SportsMedia";

/* ── Sport badge config ── */
const SPORT_ACCENT: Record<string, string> = {
  NBA: "#F5B841",
  MLB: "#00B7FF",
  NFL: "#FF8A00",
  CFB: "#00E676",
};

const SPORT_BG: Record<string, string> = {
  NBA: "rgba(245,184,65,0.12)",
  MLB: "rgba(0,183,255,0.12)",
  NFL: "rgba(255,138,0,0.12)",
  CFB: "rgba(0,230,118,0.12)",
};

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string; label: string }> = {
  "Live":        { bg: "rgba(0,230,118,0.12)",  color: "#00E676", border: "rgba(0,230,118,0.28)",  label: "LIVE" },
  "Beta":        { bg: "rgba(245,184,65,0.1)",   color: "#F5B841", border: "rgba(245,184,65,0.28)",  label: "LIMITED" },
  "Coming Soon": { bg: "rgba(100,116,139,0.08)", color: "#64748B", border: "rgba(100,116,139,0.18)", label: "WATCHLIST" },
};

/* Map tool icon strings to lucide-react components */
function ToolIcon({ icon, color, size = 22 }: { icon: string; color: string; size?: number }) {
  const style = { color, width: size, height: size };
  if (icon === "📊") return <BarChart2 style={style} />;
  if (icon === "🏀") return <Activity style={style} />;
  if (icon === "⚡") return <Zap style={style} />;
  if (icon === "📈") return <TrendingUp style={style} />;
  if (icon === "🔍") return <Search style={style} />;
  return <Database style={style} />;
}

const TOOL_VISUAL_TEAMS: Record<string, [string, string]> = {
  NBA: ["LAL", "BOS"],
  MLB: ["NYY", "LAD"],
  NFL: ["KC", "BUF"],
  CFB: ["UGA", "BAMA"],
};

const PRODUCT_STATES = [
  { sport: "NBA", status: "Live board", detail: "Full board and tool workflow active", href: "/nba" },
  { sport: "MLB", status: "Active board", detail: "Lineup, pitcher, weather, and game context supported", href: "/mlb" },
  { sport: "NFL", status: "Limited watchlist", detail: "Offseason context only until game-week coverage is reliable", href: "/nfl" },
  { sport: "CFB", status: "Limited watchlist", detail: "Offseason and conference monitoring, not a full live slate", href: "/cfb" },
];

function toolWorkflowCopy(tool: typeof TOOLS[number]) {
  const sport = tool.sport[0] ?? "NBA";
  const name = tool.name.toLowerCase();
  if (name.includes("lineup") || name.includes("injur")) {
    return {
      monitors: "Player status, late lineup changes, and source confirmation",
      outputs: "Availability context, urgency, and board-ready story leads",
      supports: sport === "NBA" ? "NBA live board" : sport === "MLB" ? "MLB active board" : `${sport} limited watchlist`,
    };
  }
  if (name.includes("source") || name.includes("leader")) {
    return {
      monitors: "Reporter reliability, confirmation patterns, and source coverage",
      outputs: "Trust context and source-check status",
      supports: "Signals and detail drawers",
    };
  }
  if (name.includes("market") || name.includes("movement")) {
    return {
      monitors: "External movement tied to verified sports context",
      outputs: "Timing support and context movement labels",
      supports: "Board confidence support",
    };
  }
  return {
    monitors: "Sports stories, source checks, and timing windows",
    outputs: "Workflow-ready context with confidence support",
    supports: `${tool.sport.join(" / ")} workflows`,
  };
}

/* Sport tag badge */
function SportTag({ sport }: { sport: string }) {
  const accent = SPORT_ACCENT[sport] ?? T.textFaint;
  const bg = SPORT_BG[sport] ?? "rgba(255,255,255,0.05)";
  return (
    <span style={{
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
      color: accent, padding: "2px 6px",
      background: bg, borderRadius: 2,
      border: `1px solid ${accent}33`,
    }}>{sport}</span>
  );
}

/* ── Individual tool card ── */
function ToolCard({ tool }: { tool: typeof TOOLS[number] }) {
  const [hovered, setHovered] = useState(false);
  const ss = STATUS_STYLE[tool.status] ?? STATUS_STYLE["Coming Soon"];
  const isDisabled = tool.status === "Coming Soon";
  const primarySport = tool.sport[0] ?? "NBA";
  const accentColor = SPORT_ACCENT[primarySport] ?? T.gold;
  const description = "description" in tool && typeof tool.description === "string" ? tool.description : undefined;
  const visualTeams = TOOL_VISUAL_TEAMS[primarySport] ?? TOOL_VISUAL_TEAMS.NBA;
  const workflow = toolWorkflowCopy(tool);

  const card = (
    <div
      data-testid={`tool-card-${tool.id}`}
      onMouseEnter={() => !isDisabled && setHovered(true)}
      onMouseLeave={() => !isDisabled && setHovered(false)}
      style={{
        position: "relative", overflow: "hidden",
        borderRadius: 5, height: "100%",
        background: hovered ? ss.bg : T.surface1,
        border: `1px solid ${hovered ? ss.border : isDisabled ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.09)"}`,
        cursor: isDisabled ? "default" : "pointer",
        opacity: isDisabled ? 0.58 : 1,
        transition: "border-color 0.15s, background 0.15s, transform 0.12s",
        transform: hovered ? "translateY(-1px)" : "none",
        display: "flex", flexDirection: "column",
        padding: "18px 18px 16px",
      }}
    >
      {/* Top accent bar */}
      {!isDisabled && (
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
          background: `linear-gradient(180deg, ${accentColor}, ${accentColor}55)`,
          borderRadius: "3px 0 0 3px",
        }} />
      )}

      {/* Subtle radial glow behind icon */}
      {!isDisabled && (
        <div style={{
          position: "absolute", top: -20, right: -20, width: 100, height: 100,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accentColor}11, transparent 70%)`,
          pointerEvents: "none",
        }} />
      )}

      <div style={{ paddingLeft: isDisabled ? 0 : 8 }}>
        <SportsStoryVisual
          league={primarySport}
          sport={leagueToSport(primarySport)}
          primaryTeam={visualTeams[0]}
          secondaryTeam={visualTeams[1]}
          title={tool.name}
          storyType="Tool workflow"
          detail={workflow.monitors}
          size="mini"
          className="tool-card-sports-visual"
        />

        {/* Header row: icon + name + status */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Icon container */}
            <div style={{
              width: 38, height: 38, borderRadius: 6, flexShrink: 0,
              background: isDisabled ? "rgba(255,255,255,0.04)" : `${accentColor}15`,
              border: `1px solid ${isDisabled ? "rgba(255,255,255,0.06)" : accentColor + "33"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <ToolIcon icon={tool.icon} color={isDisabled ? T.textFaint : accentColor} size={18} />
            </div>
            <div>
              <div style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 14, fontWeight: 700, color: T.text, lineHeight: 1.2, marginBottom: 4,
              }}>{tool.name}</div>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                {tool.sport.map(s => <SportTag key={s} sport={s} />)}
              </div>
            </div>
          </div>

          {/* Status badge */}
          <div style={{
            padding: "3px 7px", borderRadius: 2,
            background: ss.bg, color: ss.color,
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 13, fontWeight: 700, letterSpacing: "0.14em",
            border: `1px solid ${ss.border}`,
            flexShrink: 0,
          }}>
            {ss.label}
          </div>
        </div>

        {/* Description */}
        {description && (
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, color: T.textMuted, letterSpacing: "0.03em", lineHeight: 1.65,
            marginBottom: 12,
          }}>
            {description}
          </div>
        )}

        <div className="tool-workflow-proof">
          {[
            ["Monitors", workflow.monitors],
            ["Outputs", workflow.outputs],
            ["Supports", workflow.supports],
          ].map(([label, value]) => (
            <div key={label} className="tool-workflow-proof-row">
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>

        {/* CTA row */}
        {!isDisabled && (
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
            color: ss.color, marginTop: "auto",
          }}>
            {tool.status === "Live" ? (
              <>Open <ExternalLink size={10} /></>
            ) : (
              <>Open Internal <ArrowRight size={10} /></>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (isDisabled) return card;
  return <Link href={tool.href}>{card}</Link>;
}

/* ── Featured tool hero ── */
function FeaturedToolBanner() {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative", overflow: "hidden",
        borderRadius: 6, padding: "22px 24px",
        background: "linear-gradient(135deg, rgba(245,184,65,0.1) 0%, rgba(245,184,65,0.03) 60%, transparent 100%)",
        border: `1px solid ${hovered ? "rgba(245,184,65,0.4)" : "rgba(245,184,65,0.22)"}`,
        marginBottom: 32, cursor: "pointer",
        transition: "border-color 0.15s",
      }}
    >
      {/* Gold top bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, #F5B841, #FFD16655)" }} />

      {/* Background orb */}
      <div style={{
        position: "absolute", right: -40, top: -40, width: 200, height: 200, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(245,184,65,0.07), transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Zap size={14} style={{ color: T.gold }} />
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 12, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: T.gold,
            }}>Featured Tool — Now Live</span>
          </div>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 6 }}>
            NBA Intelligence Board
          </div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, color: T.textMuted, letterSpacing: "0.04em", lineHeight: 1.6, maxWidth: 480,
          }}>
            Real-time playoff intelligence. Player injuries, rotation notes, matchup context, and external movement as supporting context — 
            all in one visual board with confidence scoring and source-backed takeaways.
          </div>
        </div>
        <Link href="/nba">
          <button style={{
            background: T.gold, color: T.bg, border: "none", borderRadius: 3,
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 13, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
            padding: "10px 22px", cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 6,
            flexShrink: 0,
          }}>
            Open Board <ArrowRight size={11} />
          </button>
        </Link>
      </div>
    </div>
  );
}

function SportsWorkflowDeck() {
  const workflows = [
    {
      league: "NBA",
      teams: ["LAL", "BOS"],
      title: "Availability Desk",
      monitors: "Warmups, late scratches, rotations, role changes",
      outputs: "Confirmed player status, minute context, source picture",
      supports: "NBA board and signal detail drawers",
    },
    {
      league: "MLB",
      teams: ["NYY", "LAD"],
      title: "Lineup + Pitcher Watch",
      monitors: "Probable starters, lineup cards, weather, bullpen load",
      outputs: "Game context, lineup confirmation, timing flags",
      supports: "MLB board and top developments",
    },
    {
      league: "NFL",
      teams: ["KC", "BUF"],
      title: "Game-Week Context",
      monitors: "Practice reports, injury tags, depth pressure, matchup notes",
      outputs: "Offseason watches, source checks, story priority",
      supports: "Limited NFL watchlist until season coverage expands",
    },
    {
      league: "CFB",
      teams: ["UGA", "BAMA"],
      title: "Conference Intelligence",
      monitors: "Roster movement, QB rooms, travel, conference context",
      outputs: "Source-backed developments and game environment notes",
      supports: "Limited CFB watchlist and conference watch",
    },
  ];

  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 3, height: 16, borderRadius: 2, background: T.gold }} />
        <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 13, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: T.gold }}>
          Sports Intelligence Workflows
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
        {workflows.map((item) => {
          const accent = SPORT_ACCENT[item.league] ?? T.gold;
          return (
            <article key={item.league} style={{
              minHeight: 236,
              border: `1px solid ${accent}33`,
              borderRadius: 6,
              padding: 14,
              background: `linear-gradient(135deg, ${accent}18, rgba(10,15,26,0.86) 44%, rgba(5,5,5,0.72))`,
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <SportsStoryVisual
                  league={item.league}
                  sport={leagueToSport(item.league)}
                  primaryTeam={item.teams[0]}
                  secondaryTeam={item.teams[1]}
                  title={item.title}
                  storyType="Workflow"
                  detail={item.monitors}
                  size="mini"
                  className="tools-workflow-visual"
                />
                <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, fontWeight: 900, letterSpacing: "0.14em", color: accent }}>{item.league}</span>
              </div>
              <h3 style={{ margin: "16px 0 6px", color: T.text, fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18, lineHeight: 1.15 }}>{item.title}</h3>
              <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
                {[
                  ["Monitors", item.monitors],
                  ["Outputs", item.outputs],
                  ["Supports", item.supports],
                ].map(([label, value]) => (
                  <div key={label} style={{
                    display: "grid",
                    gridTemplateColumns: "72px minmax(0, 1fr)",
                    gap: 8,
                    alignItems: "start",
                    padding: "7px 8px",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 4,
                    background: "rgba(255,255,255,0.035)",
                  }}>
                    <span style={{
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 11,
                      fontWeight: 900,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: accent,
                    }}>{label}</span>
                    <span style={{
                      color: T.textMuted,
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 12,
                      lineHeight: 1.35,
                      letterSpacing: "0.03em",
                    }}>{value}</span>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ProductStateStrip() {
  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
        {PRODUCT_STATES.map((item) => {
          const accent = SPORT_ACCENT[item.sport] ?? T.textFaint;
          return (
            <Link key={item.sport} href={item.href}>
              <div style={{
                minHeight: 92,
                padding: "12px 14px",
                borderRadius: 5,
                border: `1px solid ${accent}33`,
                background: "rgba(10,15,26,0.82)",
                cursor: "pointer",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 13, fontWeight: 900, letterSpacing: "0.16em", color: accent }}>{item.sport}</span>
                  <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: item.status.includes("Live") ? T.green : item.status.includes("Active") ? "#00B7FF" : T.textFaint }}>
                    {item.status}
                  </span>
                </div>
                <p style={{ margin: 0, color: T.textMuted, fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, lineHeight: 1.45, letterSpacing: "0.03em" }}>
                  {item.detail}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default function ToolsHub() {
  const liveTools = TOOLS.filter(t => t.status === "Live");
  const betaTools = TOOLS.filter(t => t.status === "Beta");
  const visibleTools = [...liveTools, ...betaTools];

  return (
    <V2Shell brandContext="SPORTS INTEL TOOLS">
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 28px 60px" }}>

        {/* ── Page Header ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: T.gold }} />
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 12, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: T.textFaint,
            }}>Intelligence Tools</span>
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, fontWeight: 700, color: T.text, margin: "0 0 8px" }}>
            Tool Desk
          </h1>
          <p style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, color: T.textMuted, margin: 0, letterSpacing: "0.04em", lineHeight: 1.65, maxWidth: 560,
          }}>
            Operational research tools for injuries, lineups, role changes, source checks, and game-context review. NBA is live, MLB is active, and NFL/CFB remain limited watchlists until their coverage is reliable enough for full live-board treatment.
          </p>
        </div>

        <ProductStateStrip />

        {/* ── Status summary pills ── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
          {[
            { label: "Live Boards", count: 1,                 color: T.green,     bg: "rgba(0,230,118,0.1)",   border: "rgba(0,230,118,0.2)" },
            { label: "Active MLB",  count: 1,                 color: "#00B7FF",   bg: "rgba(0,183,255,0.08)",  border: "rgba(0,183,255,0.2)" },
            { label: "Limited",     count: 2 + betaTools.length, color: T.gold,   bg: "rgba(245,184,65,0.08)",  border: "rgba(245,184,65,0.2)" },
            { label: "Available",   count: visibleTools.length,color: T.textMuted, bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.07)" },
          ].map(s => (
            <div key={s.label} style={{
              padding: "7px 14px",
              background: s.bg,
              border: `1px solid ${s.border}`,
              borderRadius: 4, display: "flex", gap: 8, alignItems: "center",
            }}>
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 17, fontWeight: 800, color: s.color, fontVariantNumeric: "tabular-nums",
              }}>{s.count}</span>
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.textFaint,
              }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* ── Featured tool hero ── */}
        <SportsWorkflowDeck />

        <FeaturedToolBanner />

        {/* ── Sport filter row (visual only) ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.textFaint,
            marginRight: 4,
          }}>By Sport:</span>
          {["NBA", "MLB", "NFL", "CFB"].map(sport => {
            const accent = SPORT_ACCENT[sport] ?? T.textFaint;
            const count = TOOLS.filter(t => t.sport.includes(sport)).length;
            return (
              <div key={sport} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 3,
                background: "rgba(255,255,255,0.03)",
                border: `1px solid rgba(255,255,255,0.07)`,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: accent,
                }}>{sport}</span>
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 12, color: T.textFaint,
                }}>{count}</span>
              </div>
            );
          })}
        </div>

        {/* ── Tool grid — grouped by status ── */}
        {[
          { label: "Live Now",               tools: liveTools,  accentColor: T.green,     icon: <Activity size={12} /> },
          { label: "Limited Tool Access",    tools: betaTools,  accentColor: T.gold,      icon: <Zap size={12} /> },
        ].map(group => group.tools.length > 0 && (
          <section key={group.label} style={{ marginBottom: 36 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 3, height: 16, borderRadius: 2, background: group.accentColor }} />
              <div style={{ color: group.accentColor, opacity: 0.8 }}>{group.icon}</div>
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 13, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
                color: group.accentColor,
              }}>{group.label}</span>
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 12, color: T.textFaint,
                marginLeft: 2,
              }}>({group.tools.length})</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
              {group.tools.map(tool => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>
          </section>
        ))}

        {/* ── Roadmap note ── */}
        <div style={{
          padding: "20px 22px", background: T.surface1,
          border: `1px solid ${T.goldDim}`, borderRadius: 5, marginTop: 8,
          position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, rgba(245,184,65,0.5), transparent)" }} />
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 13, fontWeight: 700, color: T.gold, marginBottom: 6 }}>
            Access Notes
          </div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, color: T.textMuted, lineHeight: 1.7, letterSpacing: "0.04em", marginBottom: 14,
          }}>
            This desk only shows tools that support current sports intelligence workflows. Limited tools are marked as limited or watchlist until their signal coverage is reliable enough for production use.
          </div>
          <Link href="/pro">
            <button style={{
              background: T.gold, color: T.bg, border: "none", borderRadius: 3,
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 13, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
              padding: "8px 18px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              Get Pro Access · $19/mo <ArrowRight size={11} />
            </button>
          </Link>
        </div>
      </div>
    </V2Shell>
  );
}

