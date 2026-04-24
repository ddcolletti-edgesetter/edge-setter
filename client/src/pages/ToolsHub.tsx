import V2Shell from "../components/V2Shell";
import { TOOLS } from "../data/v2MockData";
import { Link } from "wouter";
import { ArrowRight, ExternalLink } from "lucide-react";

const T = {
  bg:         "#0A0B0D",
  surface1:   "#111317",
  surface2:   "#16191E",
  gold:       "#CAA85A",
  goldDim:    "rgba(202,168,90,0.16)",
  text:       "#F3EFE6",
  textMuted:  "#B7AFA0",
  textFaint:  "#7E776A",
  green:      "#4CAF82",
  orange:     "#D98A42",
  cyan:       "#4AA8C8",
};

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  "Live":         { bg: "rgba(76,175,130,0.12)", color: "#4CAF82",  border: "rgba(76,175,130,0.25)" },
  "Beta":         { bg: "rgba(202,168,90,0.1)",  color: "#CAA85A",  border: "rgba(202,168,90,0.25)" },
  "Coming Soon":  { bg: "rgba(126,119,106,0.1)", color: "#7E776A",  border: "rgba(126,119,106,0.2)" },
};

export default function ToolsHub() {
  const liveTools = TOOLS.filter(t => t.status === "Live");
  const betaTools = TOOLS.filter(t => t.status === "Beta");
  const comingTools = TOOLS.filter(t => t.status === "Coming Soon");

  return (
    <V2Shell>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 28px 60px" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.gold, display: "inline-block" }} />
            <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.textFaint }}>
              Intelligence Tools
            </span>
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 24, fontWeight: 700, color: T.text, margin: "0 0 8px" }}>
            Tools Hub
          </h1>
          <p style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 13, color: T.textMuted, margin: 0, letterSpacing: "0.04em", lineHeight: 1.6 }}>
            Decision-oriented research tools for NBA, MLB, NFL, and CFB. Built for grinders, not casual fans.
          </p>
        </div>

        {/* Status summary */}
        <div style={{ display: "flex", gap: 12, marginBottom: 32, flexWrap: "wrap" }}>
          {[
            { label: "Live", count: liveTools.length, color: T.green },
            { label: "Beta", count: betaTools.length, color: T.gold },
            { label: "Coming Soon", count: comingTools.length, color: T.textFaint },
          ].map(s => (
            <div key={s.label} style={{ padding: "8px 16px", background: T.surface1, border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 4, display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 18, fontWeight: 700, color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.count}</span>
              <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.textFaint }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Tool grid — group by status */}
        {[
          { label: "Live Now", tools: liveTools, accentColor: T.green },
          { label: "Beta — Available Now", tools: betaTools, accentColor: T.gold },
          { label: "Coming Soon", tools: comingTools, accentColor: T.textFaint },
        ].map(group => group.tools.length > 0 && (
          <section key={group.label} style={{ marginBottom: 36 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <span style={{ width: 3, height: 16, borderRadius: 2, background: group.accentColor, display: "inline-block" }} />
              <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: group.accentColor }}>
                {group.label}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
              {group.tools.map(tool => {
                const ss = STATUS_STYLE[tool.status];
                const isDisabled = tool.status === "Coming Soon";
                return (
                  <Link key={tool.id} href={tool.href}>
                    <div
                      data-testid={`tool-card-${tool.id}`}
                      style={{
                        padding: "20px 20px 18px", borderRadius: 5,
                        background: T.surface1,
                        border: `1px solid ${isDisabled ? "rgba(255,255,255,0.06)" : ss.border}`,
                        cursor: isDisabled ? "default" : "pointer",
                        opacity: isDisabled ? 0.65 : 1,
                        transition: "border-color 0.15s, background 0.15s",
                        display: "flex", flexDirection: "column", gap: 10, height: "100%",
                        position: "relative", overflow: "hidden",
                      }}
                      onMouseEnter={e => { if (!isDisabled) { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = ss.border; el.style.background = ss.bg; } }}
                      onMouseLeave={e => { if (!isDisabled) { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = `1px solid ${ss.border}`; el.style.background = T.surface1; } }}
                    >
                      {/* Left accent bar */}
                      {!isDisabled && (
                        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: ss.color }} />
                      )}
                      <div style={{ paddingLeft: isDisabled ? 0 : 4 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 20 }}>{tool.icon}</span>
                            <div>
                              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 14, fontWeight: 700, color: T.text }}>{tool.name}</div>
                              <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                                {tool.sport.map(s => (
                                  <span key={s} style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textFaint, padding: "1px 5px", background: "rgba(255,255,255,0.05)", borderRadius: 2 }}>{s}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                          {/* Status badge */}
                          <div style={{ padding: "3px 8px", borderRadius: 2, background: ss.bg, color: ss.color, fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", flexShrink: 0 }}>
                            {tool.status}
                          </div>
                        </div>
                        <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: T.textMuted, letterSpacing: "0.03em", lineHeight: 1.6 }}>
                          {tool.description}
                        </div>
                      </div>
                      {!isDisabled && (
                        <div style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: ss.color, marginTop: "auto", paddingLeft: 4 }}>
                          {tool.status === "Live" ? (
                            <>Open <ExternalLink size={10} /></>
                          ) : (
                            <>Try Beta <ArrowRight size={10} /></>
                          )}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        {/* Roadmap note */}
        <div style={{ padding: "18px 20px", background: T.surface1, border: `1px solid ${T.goldDim}`, borderRadius: 5, marginTop: 8 }}>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 13, fontWeight: 700, color: T.gold, marginBottom: 6 }}>Product Roadmap</div>
          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: T.textMuted, lineHeight: 1.7, letterSpacing: "0.04em" }}>
            NBA + MLB tools launch first. NFL tools expand during training camp (August). CFB tools launch before fall camp. 
            All "Coming Soon" tools have active development timelines.
            Pro subscribers get early access to Beta tools and first priority on new releases.
          </div>
          <div style={{ marginTop: 12 }}>
            <Link href="/pro">
              <button style={{ background: T.gold, color: T.bg, border: "none", borderRadius: 3, fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", padding: "8px 18px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                Get Pro Access · $19/mo <ArrowRight size={11} />
              </button>
            </Link>
          </div>
        </div>
      </div>
    </V2Shell>
  );
}
