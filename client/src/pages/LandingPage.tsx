/**
 * Edge Setter — LandingPage v6 (Luxury Film Ledger)
 *
 * Primary reference: luxury_film_ledger_dark.jpg (Kane card style)
 * Palette: #0A0B0D bg, #CAA85A gold, #F3EFE6 text
 * Philosophy: premium intelligence terminal — sell product first, dashboard second
 */
import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type Theme } from "../App";
import { Moon, ChevronRight, CheckCircle2, X, Menu, Activity } from "lucide-react";
import DataBadge from "../components/DataBadge";

interface Props { theme: Theme; toggleTheme: () => void; }

/* ── Design tokens ── */
const T = {
  bg:        "#0A0B0D",
  surface1:  "#111317",
  surface2:  "#16191E",
  surface3:  "#1B1F25",
  gold:      "#CAA85A",
  goldBright:"#D8B86A",
  goldDim:   "rgba(202,168,90,0.16)",
  text:      "#F3EFE6",
  textMuted: "#B7AFA0",
  textFaint: "#7E776A",
  danger:    "#D94B4B",
  green:     "#3DAE72",
  cyan:      "#38AACB",
};

/* ── Primitives ── */

function GoldRule({ opacity = 0.22, my = 0 }: { opacity?: number; my?: number }) {
  return (
    <div style={{
      height: 1, background: T.gold, opacity,
      margin: `${my}px 0`, flexShrink: 0,
      pointerEvents: "none",
    }} />
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: 11, fontWeight: 700,
      letterSpacing: "0.22em", textTransform: "uppercase",
      color: T.gold, marginBottom: 12,
      display: "flex", alignItems: "center", gap: 10,
    }}>
      {children}
      <div style={{ flex: 1, maxWidth: 32, height: 1, background: T.gold, opacity: 0.35, pointerEvents: "none" }} />
    </div>
  );
}

function VerdictPill({ type }: { type: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    confirmed:    { bg: "rgba(56,170,203,0.12)", color: "#5AC8E0", label: "Confirmed" },
    likely:       { bg: "rgba(202,168,90,0.12)", color: "#D8B86A", label: "Likely" },
    rumor:        { bg: "rgba(120,80,176,0.12)", color: "#A07ACC", label: "Rumor" },
    contradicted: { bg: "rgba(207,74,74,0.12)", color: "#E08080", label: "Contradicted" },
    review:       { bg: "rgba(78,111,160,0.12)", color: "#7A9CC8", label: "In Review" },
  };
  const s = map[type.toLowerCase()] ?? map.review;
  return (
    <span style={{
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
      textTransform: "uppercase",
      background: s.bg, color: s.color,
      border: `1px solid ${s.color}44`,
      padding: "3px 8px", borderRadius: 2,
      display: "inline-flex", alignItems: "center",
    }}>
      {s.label}
    </span>
  );
}

/* ── Chalk field + route diagram (hero background) ── */
function ChalkField() {
  // Simple, high-contrast chalkboard approach:
  // - 3 bold vertical yard lines (10, 50, 40 yd equiv) dominate
  // - Clear horizontal sidelines
  // - 2 large hash rows
  // - 2 strong gold routes with arrowheads
  // All strokes are intentionally opaque — wrapper div controls overall opacity

  const W = 1200, H = 480;
  const FL = 0, FR = W;          // edge to edge
  const FT = 0, FB = H;
  const FH = H;

  // Key yard lines — just 7, evenly spaced like real 100-yd field sections
  // Map the full width to 100 yards. Show 5 major lines (20, 30, 40, 50, 60 yd marks)
  const YD = W / 10;             // 10 yd increments
  const majorX = [2, 3, 4, 5, 6, 7, 8].map(i => i * YD);  // 20–80 yd marks
  const midX = 5 * YD;           // 50-yard line

  // Hash rows
  const HT = FT + FH * 0.38;
  const HB = FT + FH * 0.62;

  // Stroke colours — these are the RAW line colours; wrapper at ~0.45 opacity brings them to final level
  const sideline = "rgba(255,255,255,0.70)";  // top/bottom sideline
  const ydLine   = "rgba(255,255,255,0.45)";  // interior yard lines
  const midLine  = "rgba(255,255,255,0.85)";  // 50-yd — the hero line
  const hashC    = "rgba(255,255,255,0.55)";  // hash marks
  const routeC   = "rgba(202,168,90,0.90)";   // gold routes
  const arrowC   = "rgba(202,168,90,0.85)";   // gold arrowheads

  // Hash spacing: every YD interval
  const hashXArr = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => i * YD);
  const HH = 12;  // hash half-height

  return (
    <svg
      aria-hidden="true"
      style={{
        position: "absolute", inset: 0,
        width: "100%", height: "100%",
        pointerEvents: "none",
        // Fade out bottom 40% so field blends to dark bg
        maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.8) 45%, rgba(0,0,0,0.2) 75%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.8) 45%, rgba(0,0,0,0.2) 75%, transparent 100%)",
      }}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMin slice"
      fill="none"
    >
      {/* Top sideline */}
      <line x1={FL} y1={FT + 4} x2={FR} y2={FT + 4} stroke={sideline} strokeWidth="2.5" />
      {/* Bottom sideline (fades with mask) */}
      <line x1={FL} y1={FB - 4} x2={FR} y2={FB - 4} stroke={sideline} strokeWidth="2.5" />

      {/* Interior yard lines */}
      {majorX.map((x, i) => (
        <line key={i}
          x1={x} y1={FT} x2={x} y2={FB}
          stroke={x === midX ? midLine : ydLine}
          strokeWidth={x === midX ? "3.0" : "1.5"}
        />
      ))}

      {/* Hash marks — upper row */}
      {hashXArr.map((x, i) => (
        <line key={`hu-${i}`}
          x1={x} y1={HT - HH} x2={x} y2={HT + HH}
          stroke={hashC} strokeWidth="2.0" />
      ))}
      {/* Hash marks — lower row */}
      {hashXArr.map((x, i) => (
        <line key={`hd-${i}`}
          x1={x} y1={HB - HH} x2={x} y2={HB + HH}
          stroke={hashC} strokeWidth="2.0" />
      ))}

      {/* ── Route 1: Post — diagonal slash toward end zone ── */}
      {/* Starts between hash rows, bends hard diagonal upward-right */}
      <path
        d={`M ${YD * 2.2} ${HB + 10} L ${YD * 2.2} ${HT + 20} Q ${YD * 2.8} ${HT - 40} ${YD * 3.6} ${FT + 30}`}
        stroke={routeC} strokeWidth="2.8" strokeDasharray="14 8"
        strokeLinecap="round"
      />
      {/* arrowhead at top */}
      <polygon
        points={`${YD * 3.6} ${FT + 30}, ${YD * 3.42} ${FT + 64}, ${YD * 3.76} ${FT + 64}`}
        fill={arrowC}
      />

      {/* ── Route 2: Curl / comeback — sideline break ── */}
      {/* Starts near midfield, runs up then hooks back */}
      <path
        d={`M ${YD * 6.5} ${HB + 5} L ${YD * 6.5} ${HT - 10} Q ${YD * 6.3} ${FT + 25} ${YD * 5.6} ${HT}`}
        stroke={routeC} strokeWidth="2.8" strokeDasharray="14 8"
        strokeLinecap="round"
      />
      {/* arrowhead pointing left at curl endpoint */}
      <polygon
        points={`${YD * 5.6} ${HT}, ${YD * 5.85} ${HT - 14}, ${YD * 5.85} ${HT + 14}`}
        fill={arrowC}
      />
    </svg>
  );
}

/* ── YardlineDivider: replaces plain GoldRule between hero & Live Now ── */
function YardlineDivider() {
  return (
    <div
      aria-hidden="true"
      style={{
        maxWidth: 1440, margin: "0 auto",
        padding: "0 32px",
        pointerEvents: "none",
        position: "relative",
        height: 28,
        display: "flex",
        alignItems: "center",
      }}
    >
      <svg
        style={{ width: "100%", height: 28, display: "block", overflow: "visible" }}
        viewBox="0 0 1200 28"
        preserveAspectRatio="none"
        fill="none"
      >
        {/* Main yard line — gold, low opacity */}
        <line x1="0" y1="14" x2="1200" y2="14"
          stroke="rgba(202,168,90,0.22)" strokeWidth="1.2" />

        {/* Hash marks — evenly spaced, like painted yard-line hashes */}
        {Array.from({ length: 25 }, (_, i) => {
          const x = 24 + i * 48;
          const isMid = i === 12;
          const h = isMid ? 10 : 6;
          const col = isMid ? "rgba(202,168,90,0.40)" : "rgba(202,168,90,0.18)";
          return (
            <line key={i}
              x1={x} y1={14 - h} x2={x} y2={14 + h}
              stroke={col} strokeWidth={isMid ? "1.4" : "1.0"} />
          );
        })}
      </svg>
    </div>
  );
}

function LandingLogo() {
  return (
    <svg width="42" height="42" viewBox="0 0 32 32" fill="none" aria-label="Edge Setter">
      <rect width="32" height="32" rx="3" fill="#111317" />
      <rect x="6" y="7" width="20" height="2.5" rx="0.5" fill="#CAA85A" />
      <rect x="6" y="14.75" width="13" height="2.5" rx="0.5" fill="#CAA85A" />
      <rect x="6" y="22.5" width="20" height="2.5" rx="0.5" fill="#CAA85A" />
      <rect x="21" y="14.75" width="5" height="2.5" rx="0.5" fill="#D8B86A" opacity="0.6" />
    </svg>
  );
}

/* ── Featured Player Card (Kane-style) ── */
/* ── Live Signal Preview Panel ── replaces the old ambiguous player card ── */
function FeaturedCard({ signal }: { signal: any }) {
  const signalId = signal?.id ?? null;
  const name   = signal?.player_name ?? signal?.player ?? "Patrick Mahomes";
  const team   = signal?.team ?? "KC Chiefs";
  const title  = signal?.title ?? signal?.normalized_claim ?? "Full go after mid-week ankle scare";
  const conf   = signal?.confidence_score ?? 92;
  const verdict = signal?.verdict ?? "confirmed";
  const summary = signal?.summary ?? signal?.rationale ?? "Multiple KC beat writers confirm full participation in Friday practice after early-week limited tags.";
  const action  = signal?.action_takeaway ?? "Treat as full-go; downgrade mobility concern only.";
  const source  = signal?.primary_source ?? "Ian Rapoport";

  return (
    <div
      style={{
        background: T.surface1,
        border: `1px solid rgba(202,168,90,0.28)`,
        borderRadius: 6,
        overflow: "hidden",
        minWidth: 320,
        maxWidth: 420,
        width: "100%",
      }}
    >
      {/* Header eyebrow */}
      <div style={{
        padding: "12px 20px",
        borderBottom: `1px solid rgba(202,168,90,0.12)`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: T.surface2,
      }}>
        <div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.18em",
            textTransform: "uppercase", color: T.gold,
          }}>
            Today's Top Signal
          </div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10, letterSpacing: "0.06em",
            color: T.textFaint, marginTop: 2,
          }}>
            The highest-confidence intel in today's feed
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span className="live-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, display: "inline-block" }} />
          <span style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
            textTransform: "uppercase", color: T.green,
          }}>Live</span>
        </div>
      </div>

      {/* Player + confidence strip */}
      <div style={{
        padding: "16px 20px 14px",
        borderBottom: `1px solid rgba(202,168,90,0.10)`,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <div>
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 22, fontWeight: 700,
            color: T.text, lineHeight: 1.15, letterSpacing: "-0.01em",
          }}>{name}</div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.16em",
            textTransform: "uppercase", color: T.gold, marginTop: 3,
          }}>{team}</div>
        </div>
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 40, fontWeight: 700, color: T.gold,
            lineHeight: 1, letterSpacing: "-0.03em",
          }}>{conf}</div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
            textTransform: "uppercase", color: T.textFaint, marginTop: 2,
          }}>Confidence</div>
        </div>
      </div>

      {/* Signal body */}
      <div style={{ padding: "16px 20px 20px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
          <VerdictPill type={verdict.toLowerCase()} />
        </div>
        <div style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 17, fontWeight: 700,
          color: T.text, lineHeight: 1.35, marginBottom: 10,
        }}>{title}</div>
        <p style={{
          fontSize: 15, color: T.textMuted, lineHeight: 1.6,
          margin: "0 0 12px",
        }}>{summary}</p>
        <div style={{
          background: T.surface2,
          border: `1px solid rgba(202,168,90,0.12)`,
          borderLeft: `3px solid ${T.gold}`,
          borderRadius: 3,
          padding: "10px 14px",
          marginBottom: 14,
        }}>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
            textTransform: "uppercase", color: T.gold, marginBottom: 3,
          }}>Action Takeaway</div>
          <div style={{ fontSize: 14, color: T.text, lineHeight: 1.45 }}>{action}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
            textTransform: "uppercase", color: T.textFaint,
          }}>Source: {source}</div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
            textTransform: "uppercase", color: T.textFaint,
          }}>DEMO DATA</div>
        </div>
        {/* View in Signal Board link */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(202,168,90,0.10)" }}>
          <Link href={signalId ? `/dashboard?highlight=${signalId}` : "/dashboard"}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.16em",
              textTransform: "uppercase", color: T.gold,
              cursor: "pointer",
              transition: "color 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.color = T.goldBright; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.color = T.gold; }}>
              View in Signal Board
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 5h8M6 2l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatBox({ value, label, highlight = false }: { value: string; label: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? "rgba(202,168,90,0.10)" : "#16191E",
      border: `1px solid ${highlight ? "rgba(202,168,90,0.35)" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 3,
      padding: "6px 10px",
      textAlign: "center",
      minWidth: 58,
    }}>
      <div style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: 20, fontWeight: 700,
        color: highlight ? T.gold : T.text,
        lineHeight: 1,
        letterSpacing: "-0.02em",
      }}>
        {value}
      </div>
      <div style={{
        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
        fontSize: 9, fontWeight: 700,
        letterSpacing: "0.12em", textTransform: "uppercase",
        color: T.textFaint,
        marginTop: 3,
      }}>
        {label}
      </div>
    </div>
  );
}

/* ── Team color accent map ── */
const TEAM_COLORS: Record<string, string> = {
  "KC Chiefs": "#E31837", "Kansas City Chiefs": "#E31837",
  "Baltimore Ravens": "#241773", "Ravens": "#241773",
  "Buffalo Bills": "#00338D", "Bills": "#00338D",
  "Dallas Cowboys": "#003594", "Cowboys": "#003594",
  "San Francisco 49ers": "#AA0000", "49ers": "#AA0000",
  "Philadelphia Eagles": "#004C54", "Eagles": "#004C54",
  "Miami Dolphins": "#008E97", "Dolphins": "#008E97",
  "Cincinnati Bengals": "#FB4F14", "Bengals": "#FB4F14",
  "Los Angeles Rams": "#003594", "Rams": "#003594",
  "Green Bay Packers": "#203731", "Packers": "#203731",
  "Detroit Lions": "#0076B6", "Lions": "#0076B6",
  "Chicago Bears": "#0B162A", "Bears": "#0B162A",
  "Minnesota Vikings": "#4F2683", "Vikings": "#4F2683",
  "New York Giants": "#0B2265", "Giants": "#0B2265",
  "New England Patriots": "#002244", "Patriots": "#002244",
  "Jacksonville Jaguars": "#006778", "Jaguars": "#006778",
  "Tennessee Titans": "#0C2340", "Titans": "#0C2340",
  "Carolina Panthers": "#0085CA", "Panthers": "#0085CA",
  "Las Vegas Raiders": "#A5ACAF", "Raiders": "#A5ACAF",
  "New York Jets": "#125740", "Jets": "#125740",
  "Pittsburgh Steelers": "#FFB612", "Steelers": "#FFB612",
  "Cleveland Browns": "#FF3C00", "Browns": "#FF3C00",
  "Atlanta Falcons": "#A71930", "Falcons": "#A71930",
  "New Orleans Saints": "#D3BC8D", "Saints": "#D3BC8D",
  "Tampa Bay Buccaneers": "#D50A0A", "Buccaneers": "#D50A0A",
  "Seattle Seahawks": "#002244", "Seahawks": "#002244",
  "Arizona Cardinals": "#97233F", "Cardinals": "#97233F",
  "Los Angeles Chargers": "#0080C6", "Chargers": "#0080C6",
  "Denver Broncos": "#FB4F14", "Broncos": "#FB4F14",
  "Indianapolis Colts": "#002C5F", "Colts": "#002C5F",
  "Houston Texans": "#03202F", "Texans": "#03202F",
  "Washington Commanders": "#5A1414", "Commanders": "#5A1414",
};
function teamColor(team: string | undefined): string {
  if (!team) return T.gold;
  for (const [k, v] of Object.entries(TEAM_COLORS)) {
    if (team.includes(k) || k.includes(team)) return v;
  }
  return T.gold;
}

/* ── Signal Feed Tile ── */
function SignalTile({ signal }: { signal: any }) {
  const accent = teamColor(signal.team);
  return (
    <div
      style={{
        background: T.surface2,
        border: `1px solid rgba(202,168,90,0.10)`,
        borderRadius: 4,
        overflow: "hidden",
        transition: "border-color 0.15s, background 0.15s",
        cursor: "default",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = `${T.gold}55`;
        el.style.background = T.surface3;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = "rgba(202,168,90,0.10)";
        el.style.background = T.surface2;
      }}
    >
      {/* Team color accent bar */}
      <div style={{ height: 3, background: accent, opacity: 0.75, pointerEvents: "none" }} />
      <div style={{ padding: "16px 20px 18px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
            textTransform: "uppercase", color: T.gold, marginBottom: 4,
          }}>
            {signal.player_name ?? "Signal"} · {signal.team ?? ""}
          </div>
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 17, fontWeight: 700,
            color: T.text, lineHeight: 1.3,
          }}>
            {signal.title}
          </div>
        </div>
        <VerdictPill type={(signal.verdict ?? "review").toLowerCase()} />
      </div>
      {signal.summary && (
        <p style={{
          fontSize: 15, color: T.textMuted, lineHeight: 1.6,
          margin: "8px 0 10px",
        }}>
          {signal.summary}
        </p>
      )}
      {signal.action_takeaway && (
        <div style={{
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 11, fontWeight: 700, letterSpacing: "0.10em",
          color: T.gold, textTransform: "uppercase",
        }}>
          → {signal.action_takeaway}
        </div>
      )}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginTop: 12,
        paddingTop: 10, borderTop: "1px solid rgba(202,168,90,0.08)",
      }}>
        <div style={{
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
          textTransform: "uppercase", color: T.textFaint,
        }}>
          Confidence
        </div>
        <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, position: "relative" }}>
          <div style={{
            position: "absolute", top: 0, left: 0, bottom: 0,
            width: `${signal.confidence_score ?? 70}%`,
            background: T.gold, borderRadius: 2,
          }} />
        </div>
        <div style={{
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 11, fontWeight: 700, color: T.gold,
        }}>
          {signal.confidence_score ?? 70}
        </div>
      </div>
      </div>
    </div>
  );
}

/* ── Waitlist form ── */
function WaitlistForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", league: "" });
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: (data: typeof form) => {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 12000)
      );
      return Promise.race([
        apiRequest("POST", "/api/waitlist", data).then(r => r.json()),
        timeout,
      ]);
    },
    onSuccess: () => {
      toast({ title: "You're on the list.", description: "We'll reach out when spots open." });
      onSuccess();
    },
    onError: (err: any) => {
      const isTimeout = err?.message === "timeout";
      toast({
        title: isTimeout ? "Server is warming up…" : "Submission failed.",
        description: isTimeout
          ? "Our server took too long to respond. Please try again in a moment."
          : "Check your connection and try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim()) return;
    mutation.mutate(form);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {[
        { id: "name",   label: "Full Name",      placeholder: "Your name",       type: "text" },
        { id: "email",  label: "Email Address",  placeholder: "you@example.com", type: "email", required: true },
        { id: "league", label: "Leagues / Format", placeholder: "e.g. Redraft, Dynasty, DFS", type: "text" },
      ].map(f => (
        <div key={f.id}>
          <label className="label-premium" htmlFor={f.id}>{f.label}</label>
          <input
            id={f.id}
            type={f.type}
            required={f.required}
            placeholder={f.placeholder}
            className="input-premium"
            value={(form as any)[f.id]}
            onChange={e => setForm(prev => ({ ...prev, [f.id]: e.target.value }))}
          />
        </div>
      ))}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="btn-primary"
        style={{ marginTop: 8, width: "100%" }}
      >
        {mutation.isPending ? "Submitting…" : "Request Pro Access"}
        {!mutation.isPending && <ChevronRight size={14} />}
      </button>
    </form>
  );
}

/* ── Digest subscribe form ── */
function DigestSubscribeForm({ onSuccess }: { onSuccess: () => void }) {
  const [digestEmail, setDigestEmail] = useState("");
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: (emailVal: string) => {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 12000)
      );
      return Promise.race([
        apiRequest("POST", "/api/digest/subscribe", { email: emailVal, source: "landing_page" }).then(r => r.json()),
        timeout,
      ]);
    },
    onSuccess: () => {
      toast({ title: "You're subscribed.", description: "Today's top signal, daily — check your inbox." });
      onSuccess();
    },
    onError: (err: any) => {
      const isTimeout = err?.message === "timeout";
      toast({
        title: isTimeout ? "Server is warming up…" : "Subscription failed.",
        description: isTimeout
          ? "Our server took too long to respond. Please try again in a moment."
          : "Check your email address and try again.",
        variant: "destructive",
      });
    },
  });

  const handleDigestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!digestEmail.trim() || !digestEmail.includes("@")) return;
    mutation.mutate(digestEmail.trim());
  };

  return (
    <form onSubmit={handleDigestSubmit} style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
      <input
        type="email"
        required
        placeholder="you@example.com"
        className="input-premium"
        value={digestEmail}
        onChange={e => setDigestEmail(e.target.value)}
        style={{ flex: "1 1 220px", minWidth: 0 }}
        data-testid="input-digest-email"
      />
      <button
        type="submit"
        disabled={mutation.isPending}
        className="btn-primary"
        style={{ flexShrink: 0 }}
        data-testid="btn-digest-subscribe"
      >
        {mutation.isPending ? "Subscribing…" : "Get Today's Signal"}
        {!mutation.isPending && <ChevronRight size={14} />}
      </button>
    </form>
  );
}

/* ══ MAIN LANDING PAGE ══════════════════════════════════════════════ */
export default function LandingPage({ theme, toggleTheme }: Props) {
  const [, navigate] = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);
  const [digestDone, setDigestDone] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  const { data: signals } = useQuery<any[]>({
    queryKey: ["/api/signals"],
    queryFn: () => apiRequest("GET", "/api/signals").then(r => r.json()),
  });

  const publicSignals = (signals ?? []).filter((s: any) => s.is_public !== false).slice(0, 4);
  const featuredSignal = (signals ?? []).find((s: any) => s.is_featured) ?? publicSignals[0];

  // Close nav on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setNavOpen(false);
      }
    };
    if (navOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [navOpen]);

  return (
    <div style={{ background: T.bg, color: T.text, minHeight: "100vh" }}>

      {/* ══ HEADER ══════════════════════════════════════════════════ */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(10,11,13,0.96)",
        borderBottom: "1px solid rgba(202,168,90,0.14)",
        borderTop: "2px solid rgba(202,168,90,0.60)",
        backdropFilter: "blur(16px)",
      }}>
        <div style={{
          maxWidth: 1440, margin: "0 auto",
          padding: "0 32px",
          display: "flex", alignItems: "center",
          minHeight: 60, gap: 24,
        }}>
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 11, flexShrink: 0 }}>
            <LandingLogo />
            <div>
              <div style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontWeight: 700, fontSize: 20,
                color: T.text, letterSpacing: "-0.01em",
              }}>
                Edge Setter
              </div>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.20em",
                textTransform: "uppercase", color: T.textFaint,
              }}>
                NFL Intelligence
              </div>
            </div>
          </div>

          {/* Nav — desktop */}
          <nav style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 32 }}
            className="hidden md:flex">
            {[
              { label: "Signal Board", href: "/dashboard" },
              { label: "Draft Board", href: "/draft" },
              { label: "Sources", href: "/leaderboard" },
            ].map(item => (
              <Link key={item.href} href={item.href}>
                <div style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 12, fontWeight: 700,
                  letterSpacing: "0.14em", textTransform: "uppercase",
                  color: T.textMuted, cursor: "pointer",
                  padding: "6px 14px", borderRadius: 3,
                  transition: "color 0.15s, background 0.15s",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.color = T.gold;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.color = T.textMuted;
                }}>
                  {item.label}
                </div>
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            {/* Dark mode badge — always dark, no toggle */}
            <div style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "3px 8px",
              borderRadius: 3,
              border: "1px solid rgba(202,168,90,0.16)",
              color: T.textFaint,
            }}>
              <Moon size={10} />
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}>Dark</span>
            </div>

            {/* Hamburger — mobile */}
            <div ref={navRef} style={{ position: "relative" }} className="md:hidden">
              <button
                onClick={() => setNavOpen(o => !o)}
                style={{
                  background: "none", border: "none",
                  color: T.textMuted, cursor: "pointer", padding: 4,
                  display: "flex", alignItems: "center",
                }}
              >
                {navOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
              {navOpen && (
                <div style={{
                  position: "absolute", top: "calc(100% + 8px)", right: 0,
                  background: T.surface1,
                  border: `1px solid rgba(202,168,90,0.22)`,
                  borderRadius: 4, minWidth: 180,
                  zIndex: 100, overflow: "hidden",
                }}>
                  {[
                    { label: "Signal Board", href: "/dashboard" },
                    { label: "Draft Board", href: "/draft" },
                    { label: "Sources", href: "/leaderboard" },
                    { label: "Go Pro — $19/mo", href: "/pro" },
                  ].map(item => (
                    <Link key={item.href} href={item.href}>
                      <div
                        onClick={() => setNavOpen(false)}
                        style={{
                          padding: "13px 18px",
                          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                          fontSize: 12, fontWeight: 700,
                          letterSpacing: "0.14em", textTransform: "uppercase",
                          color: item.href === "/pro" ? T.gold : T.textMuted,
                          borderBottom: "1px solid rgba(202,168,90,0.08)",
                          cursor: "pointer",
                          transition: "background 0.12s, color 0.12s",
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLDivElement).style.background = "rgba(202,168,90,0.06)";
                          (e.currentTarget as HTMLDivElement).style.color = T.gold;
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLDivElement).style.background = "transparent";
                          (e.currentTarget as HTMLDivElement).style.color = item.href === "/pro" ? T.gold : T.textMuted;
                        }}
                      >
                        {item.label}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* CTA */}
            <button
              onClick={() => navigate("/pro")}
              style={{
                background: T.gold, color: T.bg,
                border: "none", borderRadius: 3,
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 12, fontWeight: 700,
                letterSpacing: "0.14em", textTransform: "uppercase",
                padding: "0 20px", minHeight: 40,
                cursor: "pointer", whiteSpace: "nowrap",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = T.goldBright; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = T.gold; }}
            >
              Go Pro · $19
            </button>
          </div>
        </div>
      </header>

      {/* ══ HERO ════════════════════════════════════════════════════ */}
      <section style={{
        maxWidth: 1440, margin: "0 auto",
        padding: "72px 32px 64px",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: "64px 56px",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
      }}
      className="block md:grid"
      >
        {/* Chalk field diagram — decorative background, desktop only */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0,
            opacity: 0.22,
            pointerEvents: "none",
            zIndex: 0,
          }}
          className="hidden md:block"
        >
          <ChalkField />
        </div>

        {/* Left: copy */}
        <div style={{ maxWidth: 620, position: "relative", zIndex: 2 }}>
          <Eyebrow>Draft Week Intelligence · 2026 NFL Draft · Apr 24–26</Eyebrow>

          <h1
            className="display-serif"
            style={{
              fontSize: "clamp(2.25rem, 4.5vw, 3.5rem)",
              color: T.text,
              marginBottom: 16,
              lineHeight: 1.06,
            }}
          >
            Know the move
            <br />
            <span style={{
              background: `linear-gradient(135deg, ${T.gold} 0%, ${T.goldBright} 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              before your league does.
            </span>
          </h1>

          <p style={{
            fontSize: "1.0625rem",
            color: T.textMuted,
            lineHeight: 1.65,
            maxWidth: 500,
            marginBottom: 12,
          }}>
            Draft week is the highest-signal 72 hours in football.
            Edge Setter tracks prospect risers and fallers, team-fit buzz,
            medical flags, and free-agency fallout — verified, confidence-scored,
            actionable before the pick is in.
          </p>

          {/* Draft week urgency bar */}
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            marginBottom: 28,
            padding: "10px 14px",
            background: "rgba(202,168,90,0.07)",
            border: "1px solid rgba(202,168,90,0.28)",
            borderRadius: 4,
            maxWidth: 480,
          }}>
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
              textTransform: "uppercase", color: T.gold,
              marginTop: 1, flexShrink: 0,
            }}>Live now →</span>
            <span style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.5 }}>
              <strong style={{ color: T.text }}>Draft Week feed is live.</strong>{" "}
              Prospect movement, landing-spot signals, and team-fit intel — updated in real time.
              Free users see the top 3. Pro unlocks everything.
            </span>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", position: "relative", zIndex: 3 }}>
            <button
              onClick={() => navigate("/dashboard")}
              className="btn-primary"
              style={{ cursor: "pointer" }}
            >
              Open Signal Board
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => navigate("/pro")}
              className="btn-secondary"
              style={{ cursor: "pointer" }}
            >
              Go Pro · $19/mo
            </button>
          </div>

          {/* Trust indicators */}
          <div style={{
            display: "flex", alignItems: "center", gap: 24,
            marginTop: 36,
            paddingTop: 28,
            borderTop: "1px solid rgba(202,168,90,0.12)",
            flexWrap: "wrap", rowGap: 12,
          }}>
            {[
              { val: "Live",   label: "Draft Week Feed" },
              { val: "72h",    label: "Critical Window" },
              { val: "$19",    label: "Per Month Pro" },
            ].map(stat => (
              <div key={stat.label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 26, fontWeight: 700,
                  color: T.gold, lineHeight: 1,
                  letterSpacing: "-0.02em",
                }}>
                  {stat.val}
                </div>
                <div style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.16em", textTransform: "uppercase",
                  color: T.textFaint,
                }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: featured signal card */}
        <div style={{ display: "flex", justifyContent: "center", position: "relative", zIndex: 1 }}>
          <FeaturedCard signal={featuredSignal} />
        </div>
      </section>

      {/* ══ YARD LINE DIVIDER ════════════════════════════════════════ */}
      <YardlineDivider />

      {/* ══ WHAT'S LIVE NOW ══════════════════════════════════════════ */}
      <section style={{ maxWidth: 1440, margin: "0 auto", padding: "64px 32px 56px" }}>
        <Eyebrow>Platform Status · April 2026</Eyebrow>
        <h2 style={{
          fontSize: "clamp(1.375rem, 2vw, 1.875rem)",
          color: T.text,
          margin: "0 0 40px",
          fontFamily: "'Playfair Display', Georgia, serif",
        }}>
          What's Live Now
        </h2>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 20,
        }}>
          {/* Card 1 — Signal Board */}
          <Link href="/dashboard">
            <div style={{
              background: T.surface1,
              border: `1px solid rgba(61,174,114,0.28)`,
              borderTop: `3px solid #3DAE72`,
              borderRadius: 6,
              padding: "24px 28px",
              cursor: "pointer",
              transition: "border-color 0.2s, background 0.2s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = T.surface2; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = T.surface1; }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <DataBadge type="live" label="Live · 2026 Offseason" />
                <ChevronRight size={14} style={{ color: T.textFaint }} />
              </div>
              <div style={{ fontSize: 17, fontWeight: 600, color: T.text, marginBottom: 8, fontFamily: "'Playfair Display', Georgia, serif" }}>
                Signal Board
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.55, color: T.textMuted }}>
                Free agency moves, injury reports, depth chart changes, and draft intelligence — updated as signals break.
              </div>
              {/* Free Agency first-class callout */}
              <div style={{
                marginTop: 14,
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "rgba(202,168,90,0.10)",
                border: "1px solid rgba(202,168,90,0.22)",
                borderRadius: 3, padding: "4px 10px",
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.gold, display: "inline-block", flexShrink: 0 }} />
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
                  textTransform: "uppercase", color: T.gold,
                }}>Free Agency · Active Now</span>
              </div>
            </div>
          </Link>

          {/* Card 2 — Draft Board */}
          <Link href="/draft">
            <div style={{
              background: T.surface1,
              border: `1px solid rgba(61,174,114,0.28)`,
              borderTop: `3px solid #3DAE72`,
              borderRadius: 6,
              padding: "24px 28px",
              cursor: "pointer",
              transition: "border-color 0.2s, background 0.2s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = T.surface2; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = T.surface1; }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <DataBadge type="live" label="Live · 2026 Class" />
                <ChevronRight size={14} style={{ color: T.textFaint }} />
              </div>
              <div style={{ fontSize: 17, fontWeight: 600, color: T.text, marginBottom: 8, fontFamily: "'Playfair Display', Georgia, serif" }}>
                Draft Board
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.55, color: T.textMuted }}>
                2026 NFL Draft prospect rankings — Fernando Mendoza, Arvell Reese, Rueben Bain Jr., and the full class. Updated April 22, 2026.
              </div>
            </div>
          </Link>

          {/* Card 3 — Source Leaderboard */}
          <Link href="/leaderboard">
            <div style={{
              background: T.surface1,
              border: `1px solid rgba(202,168,90,0.22)`,
              borderTop: `3px solid rgba(202,168,90,0.55)`,
              borderRadius: 6,
              padding: "24px 28px",
              cursor: "pointer",
              transition: "border-color 0.2s, background 0.2s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = T.surface2; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = T.surface1; }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <DataBadge type="demo" label="Demo" />
                <ChevronRight size={14} style={{ color: T.textFaint }} />
              </div>
              <div style={{ fontSize: 17, fontWeight: 600, color: T.text, marginBottom: 8, fontFamily: "'Playfair Display', Georgia, serif" }}>
                Source Leaderboard
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.55, color: T.textMuted }}>
                Analyst accuracy scoring by beat reporter, insider, and media outlet. Live source tracking coming with Pro launch.
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* ══ KEY TOPICS STRIP ═════════════════════════════════════════ */}
      <section style={{ maxWidth: 1440, margin: "0 auto", padding: "0 32px 56px" }}>
        <div style={{
          background: T.surface1,
          border: `1px solid rgba(202,168,90,0.14)`,
          borderRadius: 6,
          padding: "22px 28px",
          display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12,
        }}>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.20em",
            textTransform: "uppercase", color: T.textFaint,
            marginRight: 8, flexShrink: 0,
          }}>Jump To</div>
          {[
            { label: "Free Agency",        topic: "free_agency",  hot: true  },
            { label: "Injuries",           topic: "injury",       hot: false },
            { label: "Depth Chart Moves",  topic: "depth_chart",  hot: false },
            { label: "Draft Intelligence", topic: "draft",        hot: false },
            { label: "Trades",             topic: "trade",        hot: false },
            { label: "Coaching",           topic: "coaching",     hot: false },
          ].map(({ label, topic, hot }) => (
            <a
              key={topic}
              href={`#/dashboard?topic=${topic}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: hot ? "rgba(202,168,90,0.12)" : "rgba(255,255,255,0.04)",
                border: hot ? "1px solid rgba(202,168,90,0.35)" : "1px solid rgba(255,255,255,0.09)",
                borderRadius: 3,
                padding: "6px 14px",
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.13em",
                textTransform: "uppercase",
                color: hot ? T.gold : T.textMuted,
                textDecoration: "none",
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s, border-color 0.15s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.background = hot ? "rgba(202,168,90,0.20)" : "rgba(255,255,255,0.08)";
                (e.currentTarget as HTMLAnchorElement).style.color = hot ? T.goldBright : T.text;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.background = hot ? "rgba(202,168,90,0.12)" : "rgba(255,255,255,0.04)";
                (e.currentTarget as HTMLAnchorElement).style.color = hot ? T.gold : T.textMuted;
              }}
            >
              {hot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.gold, display: "inline-block", flexShrink: 0 }} />}
              {label}
            </a>
          ))}
        </div>
      </section>

      {/* ══ INTELLIGENCE FEED ════════════════════════════════════════ */}
      {publicSignals.length > 0 && (
        <section style={{ maxWidth: 1440, margin: "0 auto", padding: "72px 32px 64px" }}>
          <Eyebrow>Live Intelligence Feed · 2026 Offseason</Eyebrow>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32, gap: 16 }}>
            <h2 style={{ fontSize: "clamp(1.375rem, 2vw, 1.875rem)", color: T.text, margin: 0 }}>
              Latest Signals
            </h2>
            <Link href="/dashboard">
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 12, fontWeight: 700,
                letterSpacing: "0.14em", textTransform: "uppercase",
                color: T.gold, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5,
                transition: "color 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.color = T.goldBright; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.color = T.gold; }}>
                View All <ChevronRight size={12} />
              </div>
            </Link>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 16,
          }}>
            {publicSignals.map((signal: any) => (
              <SignalTile key={signal.id} signal={signal} />
            ))}
          </div>
        </section>
      )}

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 32px" }}>
        <GoldRule opacity={0.12} />
      </div>

      {/* ══ HOW IT WORKS ═════════════════════════════════════════════ */}
      <section style={{ maxWidth: 1440, margin: "0 auto", padding: "72px 32px 64px" }}>
        <Eyebrow>Intelligence Pipeline</Eyebrow>
        <h2 style={{ fontSize: "clamp(1.375rem, 2vw, 1.875rem)", color: T.text, marginBottom: 48 }}>
          From signal to edge — in seconds
        </h2>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 2,
        }}>
          {[
            { n: "01", title: "Signal Ingestion", body: "Beat writers, beat reporters, team insiders, analytics services (incl. PFF), independent scouts (Landry Football), and college analysts (Phil Steele) monitored in real time across 15+ verified sources." },
            { n: "02", title: "Confidence Scoring", body: "Each signal receives a 0–100 confidence score based on source reliability, corroboration, and timing." },
            { n: "03", title: "Verdict Assignment", body: "Signals are classified: Confirmed, Likely, Rumor, or Contradicted — with reasoning you can trust." },
            { n: "04", title: "Action Takeaway", body: "Every signal includes a concrete action step — what to do with this intelligence in your leagues." },
          ].map(step => (
            <div key={step.n} style={{
              background: T.surface1,
              border: "1px solid rgba(202,168,90,0.10)",
              padding: "28px 24px",
              position: "relative",
            }}>
              <div style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 56, fontWeight: 700,
                color: "rgba(202,168,90,0.10)",
                lineHeight: 1,
                position: "absolute", top: 16, right: 20,
                letterSpacing: "-0.04em",
                pointerEvents: "none",
                userSelect: "none",
              }}>
                {step.n}
              </div>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 10, fontWeight: 700,
                letterSpacing: "0.18em", textTransform: "uppercase",
                color: T.gold, marginBottom: 12,
              }}>
                Step {step.n}
              </div>
              <h3 style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 18, fontWeight: 700,
                color: T.text, marginBottom: 12, lineHeight: 1.25,
              }}>
                {step.title}
              </h3>
              <p style={{ fontSize: 15, color: T.textMuted, lineHeight: 1.65, margin: 0 }}>
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 32px" }}>
        <GoldRule opacity={0.12} />
      </div>

      {/* ══ PRICING ══════════════════════════════════════════════════ */}
      <section style={{ maxWidth: 1440, margin: "0 auto", padding: "72px 32px 64px" }}>
        <Eyebrow>Access Tiers</Eyebrow>
        <h2 style={{ fontSize: "clamp(1.375rem, 2vw, 1.875rem)", color: T.text, marginBottom: 48 }}>
          Choose your edge
        </h2>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
          maxWidth: 900,
        }}>
          {/* Free tier */}
          <div style={{
            background: T.surface1,
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 4,
            padding: "32px 28px",
          }}>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
              textTransform: "uppercase", color: T.textFaint, marginBottom: 12,
            }}>
              Free
            </div>
            <div style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 40, fontWeight: 700, color: T.text,
              letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 6,
            }}>
              $0
            </div>
            <div style={{
              fontSize: 14, color: T.textFaint, marginBottom: 28,
            }}>
              First 3 live signals
            </div>
            <GoldRule opacity={0.10} my={0} />
            <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 20 }}>
              {["3 most-recent live signals", "Verdict labels (confirmed/rumor)", "Confidence score preview"].map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle2 size={14} style={{ color: T.textFaint, flexShrink: 0 }} />
                  <span style={{ fontSize: 15, color: T.textMuted }}>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pro tier */}
          <div style={{
            background: T.surface1,
            border: `1px solid rgba(202,168,90,0.40)`,
            borderRadius: 4,
            padding: "32px 28px",
            position: "relative",
            overflow: "hidden",
          }}>
            {/* Gold top bar */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0,
              height: 3, background: T.gold, pointerEvents: "none",
            }} />
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
                textTransform: "uppercase", color: T.gold, marginBottom: 12,
              }}>
                Pro
              </div>
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
                textTransform: "uppercase",
                background: "rgba(202,168,90,0.15)",
                color: T.gold,
                border: "1px solid rgba(202,168,90,0.30)",
                padding: "3px 8px", borderRadius: 2,
              }}>
                Most Popular
              </span>
            </div>
            <div style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 40, fontWeight: 700, color: T.gold,
              letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 6,
            }}>
              $19
            </div>
            <div style={{ fontSize: 14, color: T.textFaint, marginBottom: 28 }}>
              per month
            </div>
            <GoldRule opacity={0.20} my={0} />
            <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 20, marginBottom: 28 }}>
              {[
                "Full live signals feed — no cap",
                "Free Agency, Injury & topic filters",
                "Confidence scores + verdict detail",
                "Action takeaway on every signal",
                "2026 Draft Board + archive search",
                "Today's Top Signal history",
              ].map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle2 size={14} style={{ color: T.gold, flexShrink: 0 }} />
                  <span style={{ fontSize: 15, color: T.textMuted }}>{f}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate("/pro")}
              className="btn-primary"
              style={{ width: "100%" }}
            >
              Get Pro Access
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 32px" }}>
        <GoldRule opacity={0.12} />
      </div>

      {/* ══ WAITLIST / REQUEST ACCESS ════════════════════════════════ */}
      <section id="waitlist" style={{ maxWidth: 1440, margin: "0 auto", padding: "72px 32px 80px" }}>
        <div style={{ maxWidth: 560 }}>
          <Eyebrow>For the grinders</Eyebrow>
          {waitlistDone ? (
            <div style={{
              background: "rgba(61,174,114,0.08)",
              border: "1px solid rgba(61,174,114,0.25)",
              borderRadius: 4,
              padding: "32px 28px",
              display: "flex", alignItems: "flex-start", gap: 16,
            }}>
              <CheckCircle2 size={22} style={{ color: T.green, flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 20, fontWeight: 700,
                  color: T.text, marginBottom: 8,
                }}>
                  You're on the list.
                </div>
                <p style={{ fontSize: 15, color: T.textMuted, margin: 0, lineHeight: 1.6 }}>
                  We'll reach out when Pro spots open. Watch your inbox.
                </p>
              </div>
            </div>
          ) : (
            <>
              <h2 style={{
                fontSize: "clamp(1.375rem, 2vw, 1.875rem)",
                color: T.text, marginBottom: 12,
              }}>
                Stop chasing tweets.
              </h2>
              <p style={{ fontSize: 16, color: T.textMuted, lineHeight: 1.65, marginBottom: 36 }}>
                Fantasy players, DFS grinders, and bettors who follow NFL news
                already know the information is out there — it's just scattered
                across tweets, podcasts, and beat reporters. Edge Setter converts
                it into ranked edges with confidence scores and a single action, so
                you're acting on intelligence, not noise.
              </p>
              <WaitlistForm onSuccess={() => setWaitlistDone(true)} />
            </>
          )}
        </div>
      </section>

      {/* ══ DAILY DIGEST ══════════════════════════════════════════════ */}
      <section style={{ background: "rgba(202,168,90,0.04)", borderTop: "1px solid rgba(202,168,90,0.14)", borderBottom: "1px solid rgba(202,168,90,0.14)" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "56px 32px" }}>
          {digestDone ? (
            <div style={{
              maxWidth: 520,
              background: "rgba(61,174,114,0.08)",
              border: "1px solid rgba(61,174,114,0.25)",
              borderRadius: 4,
              padding: "28px 28px",
              display: "flex", alignItems: "flex-start", gap: 16,
            }}>
              <CheckCircle2 size={20} style={{ color: T.green, flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 18, fontWeight: 700,
                  color: T.text, marginBottom: 6,
                }}>
                  You're subscribed.
                </div>
                <p style={{ fontSize: 14, color: T.textMuted, margin: 0, lineHeight: 1.6 }}>
                  Today's top signal lands in your inbox each day. Free — no card required.
                </p>
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: 520 }}>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 11, fontWeight: 700,
                letterSpacing: "0.22em", textTransform: "uppercase",
                color: T.gold, marginBottom: 10,
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <Activity size={13} />
                Free Daily Digest
              </div>
              <h2 style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "clamp(1.25rem, 2vw, 1.6rem)",
                fontWeight: 700, color: T.text,
                marginBottom: 10, lineHeight: 1.2,
              }}>
                Today's top signal. In your inbox. Free.
              </h2>
              <p style={{ fontSize: 15, color: T.textMuted, lineHeight: 1.6, marginBottom: 20 }}>
                The #1 edge from today's feed — with confidence score and the one action to take. Signals 2 and 3 are Pro-only.
              </p>
              <DigestSubscribeForm onSuccess={() => setDigestDone(true)} />
              <p style={{ fontSize: 12, color: T.textFaint, marginTop: 12 }}>
                No card required. Unsubscribe anytime.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ══ FOOTER ═══════════════════════════════════════════════════ */}
      <footer style={{
        borderTop: "1px solid rgba(202,168,90,0.14)",
        background: T.surface1,
      }}>
        <div style={{
          maxWidth: 1440, margin: "0 auto",
          padding: "40px 32px",
          display: "flex", alignItems: "flex-start",
          justifyContent: "space-between", gap: 40,
          flexWrap: "wrap", rowGap: 32,
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <LandingLogo />
              <span style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 16, fontWeight: 700,
                color: T.text,
              }}>
                Edge Setter
              </span>
            </div>
            <p style={{ fontSize: 14, color: T.textFaint, maxWidth: 240, lineHeight: 1.6, margin: 0 }}>
              Premium NFL intelligence for fantasy players and analysts.
            </p>
          </div>

          <div style={{ display: "flex", gap: 48, flexWrap: "wrap", rowGap: 24 }}>
            {[
              {
                heading: "Intelligence",
                links: [
                  { label: "Signal Board", href: "/dashboard" },
                  { label: "Draft Board", href: "/draft" },
                  { label: "Sources", href: "/leaderboard" },
                ],
              },
              {
                heading: "Account",
                links: [
                  { label: "Go Pro", href: "/pro" },
                  { label: "Alerts", href: "/alerts" },
                ],
              },
            ].map(col => (
              <div key={col.heading}>
                <div style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.18em", textTransform: "uppercase",
                  color: T.textFaint, marginBottom: 16,
                }}>
                  {col.heading}
                </div>
                {col.links.map(link => (
                  <Link key={link.href} href={link.href}>
                    <div style={{
                      fontSize: 15, color: T.textMuted,
                      marginBottom: 10, cursor: "pointer",
                      transition: "color 0.15s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.color = T.gold; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.color = T.textMuted; }}>
                      {link.label}
                    </div>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div style={{
          borderTop: "1px solid rgba(202,168,90,0.08)",
          padding: "18px 32px",
          maxWidth: 1440, margin: "0 auto",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 12,
        }}>
          <span style={{ fontSize: 13, color: T.textFaint }}>
            © 2026 Edge Setter. All rights reserved.
          </span>
          <span style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 10, fontWeight: 700,
            letterSpacing: "0.16em", textTransform: "uppercase",
            color: T.textFaint,
          }}>
            For informational purposes only
          </span>
        </div>
      </footer>
    </div>
  );
}
