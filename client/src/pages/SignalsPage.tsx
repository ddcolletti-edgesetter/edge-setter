/**
 * SignalsPage — Luxury Film Ledger redesign
 * Full-page signal board with premium card hierarchy
 */
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import type { Signal } from "@shared/schema";
import { CheckCircle2, ChevronRight } from "lucide-react";

const T = {
  bg:        "#0A0B0D",
  surface1:  "#111317",
  surface2:  "#16191E",
  surface3:  "#1B1F25",
  gold:      "#CAA85A",
  goldBright:"#D8B86A",
  text:      "#F3EFE6",
  textMuted: "#B7AFA0",
  textFaint: "#7E776A",
  green:     "#3DAE72",
  cyan:      "#38AACB",
  red:       "#D94B4B",
  amber:     "#D4932A",
};

function VerdictPill({ type }: { type: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    confirmed:    { bg: "rgba(56,170,203,0.12)", color: "#5AC8E0", label: "Confirmed" },
    likely:       { bg: "rgba(202,168,90,0.12)", color: "#D8B86A", label: "Likely" },
    rumor:        { bg: "rgba(120,80,176,0.12)", color: "#A07ACC", label: "Rumor" },
    contradicted: { bg: "rgba(207,74,74,0.12)",  color: "#E08080", label: "Contradicted" },
    review:       { bg: "rgba(78,111,160,0.12)", color: "#7A9CC8", label: "In Review" },
  };
  const key = Object.keys(map).find(k => type.toLowerCase().includes(k)) ?? "review";
  const s = map[key];
  return (
    <span style={{
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
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

function SignalCard({ signal, featured }: { signal: Signal; featured?: boolean }) {
  return (
    <div
      data-testid={`signal-card-${signal.id}`}
      style={{
        background: featured ? T.surface2 : T.surface1,
        border: featured ? `1px solid rgba(202,168,90,0.30)` : `1px solid rgba(202,168,90,0.10)`,
        borderLeft: `3px solid ${featured ? T.gold : "rgba(202,168,90,0.35)"}`,
        borderRadius: 4,
        padding: featured ? "24px 24px 20px" : "20px 20px 16px",
        position: "relative",
        overflow: "hidden",
        transition: "border-left-color 0.15s",
        marginBottom: 12,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderLeftColor = T.gold;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderLeftColor = featured ? T.gold : "rgba(202,168,90,0.35)";
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
              fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
              textTransform: "uppercase", color: T.textFaint,
            }}>
              {signal.signal_type}
            </span>
          </div>
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: featured ? 20 : 17, fontWeight: 700,
            color: T.text, lineHeight: 1.3, marginBottom: 6,
          }}>
            {signal.title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
              textTransform: "uppercase", color: T.gold,
            }}>
              {signal.player_name}
            </span>
            <span style={{ color: T.textFaint, fontSize: 10 }}>·</span>
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.10em",
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
            fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
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
        <p style={{ fontSize: 15, color: T.textMuted, margin: "0 0 12px", lineHeight: 1.65 }}>
          {signal.summary}
        </p>
      )}

      {signal.action_takeaway && (
        <div style={{
          display: "flex", gap: 10, alignItems: "flex-start",
          padding: "12px 14px",
          background: "rgba(202,168,90,0.05)",
          border: "1px solid rgba(202,168,90,0.12)",
          borderRadius: 3,
          marginBottom: 12,
        }}>
          <div style={{ width: 2, flexShrink: 0, alignSelf: "stretch", background: T.gold, borderRadius: 1, opacity: 0.7, pointerEvents: "none" }} />
          <p style={{ fontSize: 14, color: T.text, margin: 0, lineHeight: 1.55, fontStyle: "italic" }}>
            {signal.action_takeaway}
          </p>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span style={{
          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
          fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
          textTransform: "uppercase", color: T.textFaint,
        }}>
          {signal.source_count} sources
        </span>
        {featured && (
          <Link href="/pro">
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
              textTransform: "uppercase", color: T.gold,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
              transition: "color 0.15s",
            }}
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

export default function SignalsPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const { data: signals = [], isLoading } = useQuery<Signal[]>({
    queryKey: ["/api/signals"],
  });

  const waitlistMutation = useMutation({
    mutationFn: (data: { email: string }) =>
      apiRequest("POST", "/api/waitlist", { email: data.email }),
    onSuccess: () => setSubmitted(true),
  });

  const featured = signals.find(s => s.is_featured);
  const rest = signals.filter(s => !s.is_featured);

  async function handleCheckout() {
    if (!email) return;
    setCheckoutLoading(true);
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
      {/* Top bar */}
      <div style={{
        background: T.surface1,
        borderBottom: "1px solid rgba(202,168,90,0.14)",
        borderTop: "2px solid rgba(202,168,90,0.60)",
        padding: "0 32px",
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
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <span style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
              textTransform: "uppercase",
              display: "flex", alignItems: "center", gap: 6, color: T.green,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, display: "inline-block" }} className="live-dot" />
              Signal Feed Active
            </span>
            <Link href="/pro">
              <button style={{
                background: T.gold, color: T.bg,
                border: "none", borderRadius: 3, cursor: "pointer",
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
                textTransform: "uppercase",
                padding: "7px 16px", minHeight: 36,
                transition: "background 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = T.goldBright; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = T.gold; }}>
                Upgrade to Pro
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
            fontSize: 11, fontWeight: 700, letterSpacing: "0.20em",
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
          <div style={{ height: 1, background: "rgba(202,168,90,0.18)" }} />
        </div>

        {isLoading ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: T.textFaint,
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Loading signals…
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 320px",
            gap: 40,
          }}
          className="block lg:grid">
            {/* Signal feed */}
            <div>
              {featured && <SignalCard signal={featured} featured />}
              <div>
                {rest.map(s => <SignalCard key={s.id} signal={s} />)}
              </div>
            </div>

            {/* Sidebar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Waitlist */}
              <div style={{
                background: T.surface1,
                border: "1px solid rgba(202,168,90,0.22)",
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
                    <p style={{ fontSize: 14, color: T.textMuted, margin: "0 0 18px", lineHeight: 1.6 }}>
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
                      <p style={{ fontSize: 14, color: T.textMuted, margin: 0, lineHeight: 1.6 }}>
                        We'll send your invite when your spot opens.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Pro upgrade panel */}
              <div style={{
                background: T.surface1,
                border: "1px solid rgba(202,168,90,0.14)",
                borderRadius: 4,
                padding: "24px 22px",
              }}>
                <div style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
                  textTransform: "uppercase", color: T.textFaint, marginBottom: 8,
                }}>
                  Pro Intelligence
                </div>
                <div style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 40, fontWeight: 700, color: T.gold,
                  letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 4,
                }}>
                  $19
                  <span style={{ fontSize: 16, color: T.textFaint, fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif" }}>
                    /mo
                  </span>
                </div>
                <p style={{ fontSize: 14, color: T.textMuted, margin: "0 0 16px", lineHeight: 1.6 }}>
                  Full signal feed · All confidence data · Action takeaways
                </p>
                <div style={{ marginBottom: 16 }}>
                  {["Full signal archive", "Confidence scores", "Verdict detail", "Source notes", "Pro alerts"].map(f => (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <CheckCircle2 size={13} style={{ color: T.gold, flexShrink: 0 }} />
                      <span style={{ fontSize: 14, color: T.textMuted }}>{f}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: 10 }}>
                  <input
                    data-testid="input-pro-email"
                    type="email"
                    placeholder="Email for Pro access"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="input-premium"
                    style={{ marginBottom: 10 }}
                  />
                </div>
                <button
                  data-testid="button-upgrade-pro"
                  onClick={handleCheckout}
                  disabled={checkoutLoading || !email}
                  className="btn-primary"
                  style={{ width: "100%" }}
                >
                  {checkoutLoading ? "Redirecting…" : "Upgrade to Pro — $19/mo"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
