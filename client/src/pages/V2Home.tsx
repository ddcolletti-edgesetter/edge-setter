import V2Shell, { SportBadge } from "../components/V2Shell";
import { Link } from "wouter";
import { NBA_SIGNALS, MLB_SIGNALS, NBA_TONIGHT, TOOLS } from "../data/v2MockData";
import {
  PlayerAvatar, TeamLogo, GameCard, FeaturedEdgeCard,
  VerdictBadge, TypeChip, ConfidenceBar, T, VERDICT_COLORS, getTeamColors,
} from "../components/v2/SportVisuals";
import { ArrowRight, Zap } from "lucide-react";

/* ── Board card with visual treatment ── */
function BoardCard({
  sport, label, description, href, status, primary, signalCount, color, accentBg,
}: {
  sport: string; label: string; description: string; href: string;
  status: "LIVE" | "ACTIVE" | "BUILDING" | "OFFSEASON" | "COMING SOON";
  primary?: boolean; signalCount?: number; color: string; accentBg?: string;
}) {
  const disabled = status === "COMING SOON" || status === "OFFSEASON";

  return (
    <Link href={disabled ? "#" : href}>
      <div
        data-testid={`board-card-${sport.toLowerCase()}`}
        style={{
          border: primary ? `1px solid rgba(202,168,90,0.45)` : `1px solid rgba(255,255,255,0.08)`,
          borderRadius: 5, overflow: "hidden",
          background: primary
            ? `linear-gradient(135deg, rgba(202,168,90,0.06) 0%, ${T.surface1} 60%)`
            : T.surface1,
          cursor: disabled ? "default" : "pointer",
          transition: "border-color 0.15s, transform 0.12s",
          position: "relative",
          opacity: disabled ? 0.55 : 1,
        }}
        onMouseEnter={e => { if (!disabled) { const el = e.currentTarget as HTMLDivElement; el.style.transform = "translateY(-1px)"; el.style.borderColor = primary ? "rgba(202,168,90,0.65)" : "rgba(202,168,90,0.28)"; } }}
        onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.transform = "translateY(0)"; el.style.borderColor = primary ? "rgba(202,168,90,0.45)" : "rgba(255,255,255,0.08)"; }}
      >
        {primary && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: T.gold }} />}

        {/* Visual band */}
        <div style={{
          height: 52, background: accentBg ?? `rgba(202,168,90,0.03)`,
          borderBottom: `1px solid rgba(255,255,255,0.05)`,
          display: "flex", alignItems: "center", padding: "0 16px", gap: 10,
          position: "relative", overflow: "hidden",
        }}>
          {/* Background glow */}
          {!disabled && (
            <div style={{
              position: "absolute", right: 0, top: 0, bottom: 0, width: "50%",
              background: `linear-gradient(90deg, transparent, ${color}11)`,
            }} />
          )}
          {/* Sport abbr giant watermark */}
          <div style={{
            position: "absolute", right: 12, bottom: -4,
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 44, fontWeight: 900, color: `${color}18`, letterSpacing: "-0.04em", lineHeight: 1,
            userSelect: "none",
          }}>{sport}</div>

          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 26, fontWeight: 900, color, letterSpacing: "-0.02em", lineHeight: 1,
            position: "relative", zIndex: 1,
          }}>{sport}</div>
          <SportBadge status={status} />
        </div>

        <div style={{ padding: "14px 16px 16px" }}>
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 5,
          }}>{label}</div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, color: T.textMuted, letterSpacing: "0.03em", lineHeight: 1.55, marginBottom: 14,
          }}>{description}</div>
          {!disabled && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {signalCount != null && (
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 13, color: T.textFaint, letterSpacing: "0.08em",
                }}>{signalCount} signals</span>
              )}
              <span style={{
                display: "flex", alignItems: "center", gap: 4, marginLeft: "auto",
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                color: primary ? T.gold : T.textMuted,
              }}>
                Open Board <ArrowRight size={10} />
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

/* ── Signal feed row ── */
function FeedRow({ sig }: { sig: typeof NBA_SIGNALS[0] }) {
  const sportColor = sig.sport === "NBA" ? T.gold : T.cyan;
  return (
    <div
      style={{
        display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 16px",
        borderBottom: `1px solid rgba(255,255,255,0.04)`,
        transition: "background 0.12s", cursor: "pointer",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(202,168,90,0.025)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
    >
      {/* Sport accent */}
      <div style={{ width: 2, alignSelf: "stretch", borderRadius: 2, background: sportColor, flexShrink: 0, marginTop: 2 }} />

      {/* Avatar or logo */}
      {sig.player
        ? <PlayerAvatar name={sig.player} team={sig.team} size={30} />
        : <TeamLogo abbr={sig.team} size={30} />
      }

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
          <span style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: sportColor, textTransform: "uppercase",
          }}>{sig.sport}</span>
          <TypeChip type={sig.type} />
          <span style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, color: T.textFaint,
          }}>{sig.timestamp}</span>
        </div>
        <div style={{ fontSize: 13, color: T.text, fontWeight: 500, lineHeight: 1.35, marginBottom: 4 }}>
          {sig.headline}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <VerdictBadge verdict={sig.verdict} />
          <span style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, color: T.textFaint,
          }}>{sig.confidence}% conf · {sig.sources} sources</span>
        </div>
      </div>
    </div>
  );
}

export default function V2Home() {
  const topSignals = [
    ...NBA_SIGNALS.filter(s => s.confidence >= 80),
    ...MLB_SIGNALS.filter(s => s.confidence >= 72),
  ].sort((a, b) => b.confidence - a.confidence).slice(0, 9);

  const featuredNBA = NBA_SIGNALS.find(s => s.confidence >= 91) ?? NBA_SIGNALS[0];

  return (
    <V2Shell>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      <div style={{ maxWidth: 1440, margin: "0 auto", paddingBottom: 48 }}>

        {/* ─── Above-the-fold hero strip ─── */}
        <section style={{
          borderBottom: `1px solid ${T.goldDim}`,
          background: `linear-gradient(135deg, rgba(202,168,90,0.04) 0%, transparent 50%)`,
          padding: "24px 28px",
        }}>
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>

            {/* Left — command center text */}
            <div style={{ flex: "1 0 320px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.green, display: "inline-block", animation: "pulse 1.8s infinite" }} />
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 13, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.green,
                }}>Intelligence Terminal · Live</span>
              </div>
              <h1 style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 28, fontWeight: 700, color: T.text,
                margin: "0 0 10px", lineHeight: 1.2, letterSpacing: "-0.02em",
              }}>
                Sports Intelligence<br />
                <span style={{ color: T.gold }}>Research Workspace</span>
              </h1>
              <p style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 13, color: T.textMuted, margin: "0 0 20px",
                lineHeight: 1.65, letterSpacing: "0.03em", maxWidth: 440,
              }}>
                Real-time signals, boards, and decision tools for NBA, MLB, and beyond.
                Built for fantasy players, DFS grinders, and sharp bettors.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link href="/v2/nba">
                  <button data-testid="cta-open-nba" style={{
                    background: T.gold, color: T.bg, border: "none", borderRadius: 3,
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
                    padding: "11px 24px", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                    boxShadow: `0 4px 20px rgba(202,168,90,0.3)`,
                  }}>
                    Open NBA Board <ArrowRight size={12} />
                  </button>
                </Link>
                <Link href="/v2/tools">
                  <button style={{
                    background: "transparent", color: T.text,
                    border: `1px solid rgba(202,168,90,0.28)`, borderRadius: 3,
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
                    padding: "11px 22px", cursor: "pointer",
                  }}>Explore Tools</button>
                </Link>
              </div>

              {/* Sport status strip */}
              <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
                {[
                  { sport: "NBA", status: "LIVE" as const, color: T.green },
                  { sport: "MLB", status: "ACTIVE" as const, color: T.cyan },
                  { sport: "NFL", status: "ACTIVE" as const, color: T.cyan },
                  { sport: "CFB", status: "ACTIVE" as const, color: T.cyan },
                ].map(({ sport, status, color }) => (
                  <div key={sport} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
                    <span style={{
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 13, fontWeight: 700, color: T.textFaint, letterSpacing: "0.1em", textTransform: "uppercase",
                    }}>{sport}</span>
                    <SportBadge status={status} />
                  </div>
                ))}
              </div>
            </div>

            {/* Right — tonight's marquee game + featured edge */}
            <div style={{ flex: "0 0 460px", display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Marquee game */}
              <div>
                <div style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
                  color: T.textFaint, marginBottom: 8, display: "flex", alignItems: "center", gap: 6,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, display: "inline-block", animation: "pulse 1.8s infinite" }} />
                  Marquee Tonight · NBA Playoffs
                </div>
                <GameCard
                  away={NBA_TONIGHT[0].away}
                  home={NBA_TONIGHT[0].home}
                  time={NBA_TONIGHT[0].time}
                  series={NBA_TONIGHT[0].series}
                  spread={NBA_TONIGHT[0].spread}
                  total={NBA_TONIGHT[0].total}
                />
              </div>
              {/* Top featured edge mini */}
              <div style={{
                background: T.surface1, border: `1px solid rgba(202,168,90,0.2)`,
                borderRadius: 4, padding: "12px 14px",
                borderLeft: `3px solid ${T.gold}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <Zap size={11} style={{ color: T.gold }} />
                  <span style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.gold,
                  }}>Top Edge Right Now</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <PlayerAvatar name={featuredNBA.player ?? ""} team={featuredNBA.team} size={36} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: T.text, fontWeight: 600, lineHeight: 1.35, marginBottom: 4 }}>
                      {featuredNBA.headline}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <VerdictBadge verdict={featuredNBA.verdict} />
                      <span style={{
                        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                        fontSize: 12, color: T.gold, fontWeight: 700,
                      }}>{featuredNBA.confidence}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Main grid ─── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 308px", gap: 0 }} className="v2-main-grid">

          {/* Left column */}
          <div style={{ borderRight: `1px solid ${T.goldDim}` }}>

            {/* Board cards */}
            <section style={{ padding: "24px 28px 0" }}>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 13, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
                color: T.textFaint, marginBottom: 14,
              }}>Boards</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                <BoardCard
                  sport="NBA" label="NBA Board"
                  description="Playoffs live. Injury flags, line movement, matchup edges, rotation intel."
                  href="/v2/nba" status="LIVE" primary signalCount={NBA_SIGNALS.length}
                  color={T.gold}
                  accentBg="linear-gradient(135deg, rgba(202,168,90,0.08) 0%, rgba(85,37,131,0.1) 100%)"
                />
                <BoardCard
                  sport="MLB" label="MLB Board"
                  description="Regular season active. Pitcher news, lineup movement, team trends."
                  href="/v2/mlb" status="ACTIVE" signalCount={MLB_SIGNALS.length}
                  color={T.cyan}
                  accentBg="linear-gradient(135deg, rgba(74,168,200,0.08) 0%, rgba(0,42,98,0.1) 100%)"
                />
                <BoardCard
                  sport="NFL" label="NFL Board"
                  description="Active board. Injuries, depth chart movement, line shifts, and matchup intel — every week."
                  href="/v2/nfl" status="ACTIVE"
                  color={T.orange}
                  accentBg="linear-gradient(135deg, rgba(217,138,66,0.07) 0%, rgba(30,20,10,0.1) 100%)"
                />
                <BoardCard
                  sport="CFB" label="CFB Board"
                  description="Active board. Transfer intel, QB battles, sharp line movement, and coaching/scheme edges."
                  href="/v2/cfb" status="ACTIVE"
                  color={T.green}
                  accentBg="linear-gradient(135deg, rgba(76,175,130,0.07) 0%, rgba(0,30,15,0.1) 100%)"
                />
              </div>
            </section>

            {/* Live signal feed */}
            <section style={{ marginTop: 28 }}>
              <div style={{
                padding: "0 28px 12px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, display: "inline-block", animation: "pulse 1.8s infinite" }} />
                  <span style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 13, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: T.textFaint,
                  }}>Live Signal Feed</span>
                </div>
                <Link href="/v2/nba">
                  <span style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: T.gold,
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                  }}>All NBA <ArrowRight size={10} /></span>
                </Link>
              </div>
              <div style={{ border: `1px solid rgba(255,255,255,0.06)`, borderLeft: "none", borderRight: "none" }}>
                {topSignals.map(sig => <FeedRow key={sig.id} sig={sig} />)}
              </div>
            </section>
          </div>

          {/* Right column */}
          <div>
            {/* Tonight's slate */}
            <div style={{ padding: "24px 18px 0" }}>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
                color: T.textFaint, marginBottom: 12,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, display: "inline-block" }} />
                Tonight's Slate
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {NBA_TONIGHT.map(g => (
                  <GameCard
                    key={g.id}
                    away={g.away} home={g.home}
                    time={g.time} series={g.series}
                    spread={g.spread} total={g.total}
                    compact
                  />
                ))}
              </div>
            </div>

            {/* Tools preview */}
            <div style={{ padding: "24px 18px 0" }}>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
                color: T.textFaint, marginBottom: 12,
              }}>Tools</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {TOOLS.slice(0, 5).map(tool => {
                  const statusColor = tool.status === "Live" ? T.green : tool.status === "Beta" ? T.gold : T.textFaint;
                  return (
                    <Link key={tool.id} href={tool.href}>
                      <div
                        data-testid={`tool-preview-${tool.id}`}
                        style={{
                          padding: "10px 12px", borderRadius: 4,
                          background: T.surface1, border: `1px solid rgba(255,255,255,0.06)`,
                          cursor: "pointer", display: "flex", alignItems: "center", gap: 9,
                          transition: "border-color 0.12s, transform 0.1s",
                        }}
                        onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = "rgba(202,168,90,0.25)"; el.style.transform = "translateX(2px)"; }}
                        onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = "rgba(255,255,255,0.06)"; el.style.transform = "translateX(0)"; }}
                      >
                        <span style={{ fontSize: 15 }}>{tool.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 1 }}>{tool.name}</div>
                          <div style={{
                            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                            fontSize: 13, color: T.textFaint, letterSpacing: "0.04em",
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>{tool.sport.join(" · ")}</div>
                        </div>
                        <span style={{
                          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                          fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                          color: statusColor, flexShrink: 0,
                        }}>{tool.status}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
              <Link href="/v2/tools">
                <div style={{
                  marginTop: 8, padding: "8px 12px",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
                  color: T.textMuted, cursor: "pointer",
                  border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 4,
                }}>All Tools <ArrowRight size={10} /></div>
              </Link>
            </div>

            {/* MLB mini */}
            <div style={{ padding: "24px 18px 0" }}>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
                color: T.textFaint, marginBottom: 12,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.cyan, display: "inline-block" }} />
                MLB Signals
              </div>
              <div style={{
                background: T.surface1, border: `1px solid rgba(255,255,255,0.06)`,
                borderRadius: 4, overflow: "hidden",
              }}>
                {MLB_SIGNALS.slice(0, 3).map(sig => (
                  <div key={sig.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 12px",
                    borderBottom: `1px solid rgba(255,255,255,0.04)`,
                  }}>
                    <div style={{ width: 2, alignSelf: "stretch", borderRadius: 2, background: T.cyan, flexShrink: 0 }} />
                    <TeamLogo abbr={sig.team} size={24} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: T.text, fontWeight: 500, lineHeight: 1.35, marginBottom: 3 }}>
                        {sig.headline}
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <TypeChip type={sig.type} />
                        <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: T.textFaint }}>
                          {sig.confidence}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                <div style={{ padding: "8px 12px", borderTop: `1px solid rgba(255,255,255,0.05)` }}>
                  <Link href="/v2/mlb">
                    <span style={{
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                      color: T.cyan, cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                    }}>Open MLB Board <ArrowRight size={10} /></span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Stub notice */}
            <div style={{ margin: "20px 18px 0", padding: "9px 12px", background: "rgba(202,168,90,0.03)", border: `1px solid rgba(202,168,90,0.1)`, borderRadius: 4 }}>
              <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 13, color: T.textFaint, lineHeight: 1.5 }}>
                <strong style={{ color: T.gold }}>STUB DATA</strong> — Signals + odds are realistic placeholders.
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
