/**
 * SignalsPage — Public Signal Board
 * Free limit: 3 signals. Featured signal counts as 1.
 * Additional signals show as LockedSignalCard with ProGateModal.
 */
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import type { Signal } from "@shared/schema";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { useSignalGate, FREE_LIMIT } from "@/context/SignalGate";
import LockedSignalCard from "@/components/paywall/LockedSignalCard";
import ProGateModal from "@/components/paywall/ProGateModal";
import ProValueModule from "@/components/paywall/ProValueModule";
import { SignalDetailDrawer, type SignalDetailLike } from "@/components/SignalDetailDrawer";
import { trackSignalsVisit, trackCheckoutClick } from "@/lib/analytics";

const T = {
  bg:        "#050505",
  surface1:  "#0A0F1A",
  surface2:  "#101827",
  surface3:  "#101827",
  gold:      "#F5B841",
  goldBright:"#FFD166",
  text:      "#F8FAFC",
  textMuted: "#94A3B8",
  textFaint: "#64748B",
  green:     "#3DAE72",
  cyan:      "#38AACB",
  red:       "#FF5252",
  amber:     "#FF8A00",
};

function VerdictPill({ type }: { type: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    confirmed:    { bg: "rgba(56,170,203,0.12)", color: "#5AC8E0", label: "Confirmed" },
    likely:       { bg: "rgba(245,184,65,0.12)", color: "#FFD166", label: "Likely" },
    rumor:        { bg: "rgba(120,80,176,0.12)", color: "#A07ACC", label: "Rumor" },
    contradicted: { bg: "rgba(207,74,74,0.12)",  color: "#E08080", label: "Contradicted" },
    review:       { bg: "rgba(78,111,160,0.12)", color: "#7A9CC8", label: "In Review" },
  };
  const key = Object.keys(map).find(k => type.toLowerCase().includes(k)) ?? "review";
  const s = map[key];
  return (
    <span style={{
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: 12, fontWeight: 700, letterSpacing: "0.12em",
      textTransform: "uppercase",
      background: s.bg, color: s.color,
      border: `1px solid ${s.color}44`,
      padding: "3px 8px", borderRadius: 2,
      display: "inline-flex", alignItems: "center", gap: 5,
    }}>
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: s.color, display: "inline-block" }} />
      {s.label}
    </span>
  );
}

function ConfBar({ score }: { score: number }) {
  const color = score >= 88 ? T.green : score >= 78 ? T.gold : T.amber;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: `${score}%`, background: color, borderRadius: 2 }} />
      </div>
      <span style={{
        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
        fontSize: 12, fontWeight: 700, color: T.gold, minWidth: 28, textAlign: "right",
      }}>
        {score}
      </span>
    </div>
  );
}

function toDrawerSignal(signal: Signal): SignalDetailLike {
  return {
    id: signal.id,
    headline: signal.title,
    detail: signal.summary,
    player: signal.player_name,
    team: signal.team,
    type: signal.signal_type,
    confidence: signal.confidence_score,
    verdict: signal.verdict ?? signal.status_tag,
    action_takeaway: signal.action_takeaway,
    timestamp: signal.updated_at ?? signal.created_at,
    isoTimestamp: signal.updated_at ?? signal.created_at,
    sources: signal.source_count,
    why_it_matters: signal.summary,
  };
}

function SignalCard({ signal, featured, onOpenDetails }: { signal: Signal; featured?: boolean; onOpenDetails: (signal: Signal) => void }) {
  const openDetails = () => onOpenDetails(signal);

  return (
    <div
      data-testid={`signal-card-${signal.id}`}
      role="button"
      tabIndex={0}
      aria-label={`Open ${signal.title} signal detail`}
      onClick={openDetails}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openDetails();
      }}
      style={{
        background: featured ? T.surface2 : T.surface1,
        border: featured ? `1px solid rgba(245,184,65,0.30)` : `1px solid rgba(245,184,65,0.10)`,
        borderLeft: `3px solid ${featured ? T.gold : "rgba(245,184,65,0.35)"}`,
        borderRadius: 4,
        padding: featured ? "24px 24px 20px" : "20px 20px 16px",
        position: "relative",
        overflow: "hidden",
        transition: "border-left-color 0.15s, border-color 0.15s, background 0.15s",
        marginBottom: 12,
        cursor: "pointer",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderLeftColor = T.gold;
        (e.currentTarget as HTMLDivElement).style.borderColor = featured ? "rgba(245,184,65,0.42)" : "rgba(0,183,255,0.22)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderLeftColor = featured ? T.gold : "rgba(245,184,65,0.35)";
        (e.currentTarget as HTMLDivElement).style.borderColor = featured ? "rgba(245,184,65,0.30)" : "rgba(245,184,65,0.10)";
      }}
    >
      {featured && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: T.gold, pointerEvents: "none" }} />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <VerdictPill type={signal.verdict?.toLowerCase() ?? "review"} />
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 12, fontWeight: 700, letterSpacing: "0.14em",
              textTransform: "uppercase", color: T.textFaint,
            }}>
              {signal.signal_type}
            </span>
          </div>
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: featured ? 22 : 19, fontWeight: 700,
            color: T.text, lineHeight: 1.3, marginBottom: 6,
          }}>
            {signal.title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 13, fontWeight: 700, letterSpacing: "0.14em",
              textTransform: "uppercase", color: T.gold,
            }}>
              {signal.player_name}
            </span>
            <span style={{ color: T.textFaint, fontSize: 12 }}>·</span>
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 13, fontWeight: 700, letterSpacing: "0.10em",
              textTransform: "uppercase", color: T.textFaint,
            }}>
              {signal.team}
            </span>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: featured ? 36 : 28, fontWeight: 700,
            color: T.gold, lineHeight: 1,
            letterSpacing: "-0.03em",
          }}>
            {signal.confidence_score}
          </div>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
            textTransform: "uppercase", color: T.textFaint, marginTop: 2,
          }}>
            Confidence
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <ConfBar score={signal.confidence_score} />
      </div>

      {signal.summary && (
        <p style={{ fontSize: 16, color: T.textMuted, margin: "0 0 12px", lineHeight: 1.65 }}>
          {signal.summary}
        </p>
      )}

      {signal.action_takeaway && (
        <div style={{
          display: "flex", gap: 10, alignItems: "flex-start",
          padding: "12px 14px",
          background: "rgba(245,184,65,0.05)",
          border: "1px solid rgba(245,184,65,0.12)",
          borderRadius: 3,
          marginBottom: 12,
        }}>
          <div style={{ width: 2, flexShrink: 0, alignSelf: "stretch", background: T.gold, borderRadius: 1, opacity: 0.7 }} />
          <p style={{ fontSize: 16, color: T.text, margin: 0, lineHeight: 1.55, fontStyle: "italic" }}>
            {signal.action_takeaway}
          </p>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span style={{
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 12, fontWeight: 700, letterSpacing: "0.12em",
          textTransform: "uppercase", color: T.textFaint,
        }}>
          {signal.source_count} sources
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openDetails();
          }}
          style={{
            background: "rgba(0,183,255,0.08)",
            border: "1px solid rgba(0,183,255,0.22)",
            borderRadius: 3,
            color: "#00B7FF",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.12em",
            padding: "6px 9px",
            textTransform: "uppercase",
          }}
        >
          View detail <ChevronRight size={10} />
        </button>
        {featured && (
          <Link href="/pro">
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 12, fontWeight: 700, letterSpacing: "0.14em",
              textTransform: "uppercase", color: T.gold,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
              transition: "color 0.15s",
            }}
            onClick={e => e.stopPropagation()}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.color = T.goldBright; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.color = T.gold; }}>
              Full Source Detail — Pro <ChevronRight size={10} />
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * GatedSignalCard — decides whether to show the full card or the locked version.
 * Uses position-based gating: cards at index < FREE_LIMIT are free, rest are locked.
 * The context tracks viewed IDs for dedup across nav events.
 */
function GatedSignalCard({ signal, featured, globalIndex, onOpenDetails }: { signal: Signal; featured?: boolean; globalIndex: number; onOpenDetails: (signal: Signal) => void }) {
  const { consumeSignal } = useSignalGate();
  // Position-based: first FREE_LIMIT signals are always free
  const isFree = globalIndex < FREE_LIMIT;

  // Register the view for free signals (for the meter display)
  useEffect(() => {
    if (isFree) {
      consumeSignal(signal.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal.id, isFree]);

  if (!isFree) {
    return <LockedSignalCard signal={signal} index={globalIndex} />;
  }
  return <SignalCard signal={signal} featured={featured} onOpenDetails={onOpenDetails} />;
}

export default function SignalsPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [drawerSignal, setDrawerSignal] = useState<Signal | null>(null);

  const { data: signals = [], isLoading, refetch } = useQuery<Signal[]>({
    queryKey: ["/api/signals"],
    queryFn: () => apiRequest("GET", "/api/signals").then(r => {
      setLastUpdated(new Date());
      return r.json();
    }),
    refetchInterval: 60000,
  });

  const waitlistMutation = useMutation({
    mutationFn: (data: { email: string }) => {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 12000)
      );
      return Promise.race([
        apiRequest("POST", "/api/waitlist", { email: data.email }),
        timeout,
      ]);
    },
    onSuccess: () => setSubmitted(true),
    onError: (err: any) => {
      if (err?.message === "timeout") {
        alert("Server is warming up. Please try again in a moment.");
      }
    },
  });

  const featured = signals.find(s => s.is_featured);
  const rest = signals.filter(s => !s.is_featured);

  // Full ordered list for gating: featured is index 0, rest follow
  const allOrdered: Signal[] = featured ? [featured, ...rest] : rest;

  // Track signals visit on mount
  useEffect(() => { trackSignalsVisit(); }, []);

  async function handleCheckout() {
    if (!email) return;
    setCheckoutLoading(true);
    trackCheckoutClick("signals_sidebar");
    try {
      const res = await apiRequest("POST", "/api/checkout", { email });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      setCheckoutLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text }}>

      {/* ProGateModal — portal-level, always present when triggered */}
      <ProGateModal />
      <SignalDetailDrawer
        open={!!drawerSignal}
        signal={drawerSignal ? toDrawerSignal(drawerSignal) : null}
        sport="NFL"
        onClose={() => setDrawerSignal(null)}
      />

      {/* Top bar */}
      <div style={{
        background: T.surface1,
        borderBottom: "1px solid rgba(245,184,65,0.14)",
        borderTop: "2px solid rgba(245,184,65,0.60)",
        padding: "0 16px",
      }}>
        <div style={{
          maxWidth: 1440, margin: "0 auto",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          minHeight: 52,
        }}>
          <Link href="/">
            <div style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 15, fontWeight: 700,
              color: T.text, cursor: "pointer",
              letterSpacing: "-0.01em",
            }}>
              Edge Setter
            </div>
          </Link>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span className="hidden md:flex" style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
              textTransform: "uppercase",
              alignItems: "center", gap: 6, color: T.green,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, display: "inline-block" }} className="live-dot" />
              Signal Feed Active
            </span>
            {lastUpdated && (
              <span className="hidden md:flex" style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase",
                color: T.textFaint, alignItems: "center", gap: 4,
              }}>
                Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                <button
                  onClick={() => refetch()}
                  style={{ background: "none", border: "none", color: T.gold, cursor: "pointer", padding: "0 2px", lineHeight: 1, fontSize: 12 }}
                  title="Refresh signals"
                >
                  ↻
                </button>
              </span>
            )}
            <Link href="/pro">
              <button
                data-testid="button-topbar-go-pro"
                style={{
                  background: T.gold, color: T.bg,
                  border: "none", borderRadius: 3, cursor: "pointer",
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  padding: "7px 16px", minHeight: 36,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = T.goldBright; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = T.gold; }}
              >
                Go Pro · $19/mo
              </button>
            </Link>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "40px 32px 72px" }}>
        {/* Page header */}
        <div style={{ marginBottom: 40 }}>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 13, fontWeight: 700, letterSpacing: "0.20em",
            textTransform: "uppercase", color: T.gold, marginBottom: 10,
          }}>
            Public Signal Board
          </div>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "clamp(1.75rem, 3vw, 2.5rem)",
            fontWeight: 700, color: T.text, marginBottom: 14,
            letterSpacing: "-0.02em", lineHeight: 1.1,
          }}>
            NFL Intelligence Feed
          </h1>
          {/* Free-limit banner */}
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            padding: "10px 14px",
            background: "rgba(245,184,65,0.06)",
            border: "1px solid rgba(245,184,65,0.22)",
            borderRadius: 3,
            marginBottom: 18,
          }}>
            <span style={{
              fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
              fontSize: 12, fontWeight: 700, letterSpacing: "0.14em",
              textTransform: "uppercase", color: T.gold, flexShrink: 0, marginTop: 1,
            }}>
              Free access
            </span>
            <span style={{ fontSize: 15, color: T.textMuted, lineHeight: 1.5 }}>
              You can fully read the {FREE_LIMIT} most recent signals.{" "}
              <Link href="/pro">
                <span style={{ color: T.gold, cursor: "pointer", textDecoration: "underline", textDecorationColor: "rgba(245,184,65,0.40)" }}>
                  Pro unlocks full signal detail, source context, and action windows.
                </span>
              </Link>
            </span>
          </div>
          <div style={{ height: 1, background: "rgba(245,184,65,0.18)" }} />
        </div>

        {isLoading ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: T.textFaint,
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Loading signals…
          </div>
        ) : (
          <div style={{
            gridTemplateColumns: "1fr 320px",
            gap: 40,
          }}
          className="block lg:grid">
            {/* Signal feed */}
            <div>
              {allOrdered.map((signal, i) => (
                <GatedSignalCard
                  key={signal.id}
                  signal={signal}
                  featured={signal.is_featured ?? false}
                  globalIndex={i}
                  onOpenDetails={setDrawerSignal}
                />
              ))}
            </div>

            {/* Sidebar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Pro value module — top of sidebar */}
              <ProValueModule />

              {/* Waitlist */}
              <div style={{
                background: T.surface1,
                border: "1px solid rgba(245,184,65,0.22)",
                borderRadius: 4,
                padding: "24px 22px",
                position: "relative", overflow: "hidden",
              }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: T.gold, pointerEvents: "none" }} />
                {!submitted ? (
                  <>
                    <div style={{
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
                      textTransform: "uppercase", color: T.gold, marginBottom: 10,
                    }}>
                      Early Access
                    </div>
                    <div style={{
                      fontFamily: "'Playfair Display', Georgia, serif",
                      fontSize: 18, fontWeight: 700, color: T.text,
                      marginBottom: 8, lineHeight: 1.25,
                    }}>
                      Request entry.
                    </div>
                    <p style={{ fontSize: 15, color: T.textMuted, margin: "0 0 18px", lineHeight: 1.6 }}>
                      Join the list for free board access — no card required.
                    </p>
                    <input
                      data-testid="input-waitlist-email"
                      type="email"
                      placeholder="Email address"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && email && waitlistMutation.mutate({ email })}
                      className="input-premium"
                      style={{ marginBottom: 10 }}
                    />
                    <button
                      data-testid="button-request-access"
                      onClick={() => email && waitlistMutation.mutate({ email })}
                      disabled={waitlistMutation.isPending || !email}
                      className="btn-primary"
                      style={{ width: "100%" }}
                    >
                      {waitlistMutation.isPending ? "Sending…" : "Request Access"}
                    </button>
                  </>
                ) : (
                  <div data-testid="waitlist-success" style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <CheckCircle2 size={20} style={{ color: T.green, flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div style={{
                        fontFamily: "'Playfair Display', Georgia, serif",
                        fontSize: 17, fontWeight: 700, color: T.text, marginBottom: 6,
                      }}>
                        You're on the list.
                      </div>
                      <p style={{ fontSize: 15, color: T.textMuted, margin: 0, lineHeight: 1.6 }}>
                        We'll send your invite when your spot opens.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
