import { useState } from "react";
import V2Shell from "../components/V2Shell";
import { TOOLS } from "../data/v2MockData";
import { Link } from "wouter";
import { ArrowRight, ExternalLink, Zap, TrendingUp, Activity, BarChart2, Search, Database } from "lucide-react";
import { TeamLogo, T, getTeamColors } from "../components/v2/SportVisuals";

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
  "Beta":        { bg: "rgba(245,184,65,0.1)",   color: "#F5B841", border: "rgba(245,184,65,0.28)",  label: "BETA" },
  "Coming Soon": { bg: "rgba(100,116,139,0.08)", color: "#64748B", border: "rgba(100,116,139,0.18)", label: "SOON" },
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
              <>Try Beta <ArrowRight size={10} /></>
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
            NBA Signal Board
          </div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, color: T.textMuted, letterSpacing: "0.04em", lineHeight: 1.6, maxWidth: 480,
          }}>
            Real-time playoff intelligence. Player injuries, line moves, rotation notes, and matchup edges — 
            all in one visual board with confidence scoring and action takeaways.
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

export default function ToolsHub() {
  const liveTools = TOOLS.filter(t => t.status === "Live");
  const betaTools = TOOLS.filter(t => t.status === "Beta");
  const comingTools = TOOLS.filter(t => t.status === "Coming Soon");

  return (
    <V2Shell>
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
            Tools Hub
          </h1>
          <p style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, color: T.textMuted, margin: 0, letterSpacing: "0.04em", lineHeight: 1.65, maxWidth: 560,
          }}>
            Decision-oriented research tools for NBA, MLB, NFL, and CFB. Built for grinders, not casual fans.
          </p>
        </div>

        {/* ── Status summary pills ── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
          {[
            { label: "Live",        count: liveTools.length,  color: T.green,     bg: "rgba(0,230,118,0.1)",   border: "rgba(0,230,118,0.2)" },
            { label: "Beta",        count: betaTools.length,  color: T.gold,      bg: "rgba(245,184,65,0.08)",  border: "rgba(245,184,65,0.2)" },
            { label: "Coming Soon", count: comingTools.length,color: T.textFaint, bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.07)" },
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
          { label: "Beta — Available Now",   tools: betaTools,  accentColor: T.gold,      icon: <Zap size={12} /> },
          { label: "Coming Soon",            tools: comingTools,accentColor: T.textFaint,  icon: <TrendingUp size={12} /> },
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
            Product Roadmap
          </div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, color: T.textMuted, lineHeight: 1.7, letterSpacing: "0.04em", marginBottom: 14,
          }}>
            NBA + MLB tools launch first. NFL tools expand during training camp (August). CFB tools launch before fall camp.
            All "Coming Soon" tools have active development timelines. Pro subscribers get early access to Beta tools and first priority on new releases.
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
