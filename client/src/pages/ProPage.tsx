/**
 * /pro — Edge Setter Pro
 *
 * Sharp product page for fantasy/DFS/betting grinders.
 * No brochure walls. One clear offer. One CTA.
 */
import { useState } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle2, Zap, BarChart2, Filter, BookOpen, ChevronRight } from "lucide-react";

const C = {
  bg:         "#0A0B0D",
  surface1:   "#111317",
  surface2:   "#16191E",
  gold:       "#CAA85A",
  goldBright: "#D8B86A",
  goldDim:    "rgba(202,168,90,0.14)",
  text:       "#F3EFE6",
  textMuted:  "#B7AFA0",
  textFaint:  "#7E776A",
  green:      "#3DAE72",
  red:        "#C04040",
  amber:      "#D4932A",
};

const FEATURES = [
  {
    icon: Zap,
    label: "Full live signal feed",
    detail: "Every signal, no cap. Draft picks, free agency moves, injury flags, depth chart shuffles — all scored 0–100.",
  },
  {
    icon: BarChart2,
    label: "Full Draft Board",
    detail: "2026 class with latest intel, movement tags, and team-fit signals updated in real time.",
  },
  {
    icon: Filter,
    label: "All 6 topic filters",
    detail: "Slice by Draft Week, Free Agency, Injuries, Depth Chart, Trades, or Coaching — instantly.",
  },
  {
    icon: BookOpen,
    label: "Today's Top Signal history",
    detail: "Every featured signal we've surfaced, with full rationale and source notes.",
  },
  {
    icon: CheckCircle2,
    label: "Confidence scores + action takeaways",
    detail: "Confirmed / likely / rumor / contradicted verdicts plus a single concrete action per signal.",
  },
];

/* ── Checkout form ─────────────────────────────────────────────── */
function CheckoutForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCheckout() {
    if (!email) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest("POST", "/api/checkout", { email });
      const { url, error: apiErr } = await res.json();
      if (apiErr) { setError(apiErr); setLoading(false); return; }
      if (url) window.location.href = url;
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        border: `1px solid rgba(202,168,90,0.35)`,
        borderRadius: 4,
        overflow: "hidden",
      }}>
        <input
          data-testid="input-pro-email"
          type="email"
          placeholder="Your email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleCheckout()}
          style={{
            background: C.surface2,
            border: "none",
            borderRight: `1px solid rgba(202,168,90,0.20)`,
            color: C.text,
            fontSize: 16,
            padding: "14px 18px",
            outline: "none",
            fontFamily: "inherit",
            minWidth: 0,
          }}
        />
        <button
          data-testid="button-checkout"
          onClick={handleCheckout}
          disabled={loading || !email}
          style={{
            padding: "14px 22px",
            background: loading ? C.goldDim : C.gold,
            color: C.bg,
            border: "none",
            cursor: loading || !email ? "default" : "pointer",
            fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
            fontSize: 13, fontWeight: 700,
            letterSpacing: "0.18em", textTransform: "uppercase",
            whiteSpace: "nowrap",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => { if (!loading && email) (e.currentTarget as HTMLButtonElement).style.background = C.goldBright; }}
          onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = loading ? C.goldDim : C.gold; }}
        >
          {loading ? "Redirecting…" : "Go Pro · $19/mo"}
        </button>
      </div>
      {error && <p style={{ fontSize: 13, color: C.red, marginTop: 8 }}>{error}</p>}
      <p style={{ fontSize: 13, color: C.textFaint, marginTop: 10, lineHeight: 1.5 }}>
        Billed monthly. Cancel any time. Powered by Stripe — your card is never stored on our servers.
      </p>
    </div>
  );
}

/* ── Already-Pro panel ─────────────────────────────────────────── */
function ProManagementPanel({ email }: { email: string }) {
  const [portalLoading, setPortalLoading] = useState(false);

  async function openBillingPortal() {
    if (portalLoading) return;
    setPortalLoading(true);
    try {
      const res = await apiRequest("POST", "/api/billing/portal", { email });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error ?? "Could not open billing portal.");
    } catch {
      alert("Could not open billing portal. Please try again.");
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <div style={{
      background: C.surface1,
      border: `1px solid rgba(61,174,114,0.30)`,
      borderTop: `3px solid ${C.green}`,
      borderRadius: 4,
      padding: "28px 32px",
      maxWidth: 480,
      margin: "0 auto",
      textAlign: "center",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, display: "inline-block" }} />
        <span style={{
          fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
          fontSize: 12, fontWeight: 700, letterSpacing: "0.18em",
          textTransform: "uppercase", color: C.green,
        }}>
          Pro Active
        </span>
      </div>
      <p style={{
        fontFamily: "'Playfair Display',Georgia,serif",
        fontSize: 20, fontWeight: 700,
        color: C.text, margin: "0 0 8px",
      }}>
        You have full access.
      </p>
      <p style={{ fontSize: 16, color: C.textMuted, margin: "0 0 24px", lineHeight: 1.55 }}>
        Head to the Signal Board to see the full live feed.
      </p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <Link href="/dashboard">
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: C.gold, color: C.bg,
            fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
            fontSize: 13, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
            padding: "10px 22px", borderRadius: 3, cursor: "pointer",
          }}>
            Open Signal Board <ChevronRight size={12} />
          </div>
        </Link>
        <button
          data-testid="button-manage-billing"
          onClick={openBillingPortal}
          disabled={portalLoading}
          style={{
            background: "transparent",
            border: `1px solid rgba(255,255,255,0.10)`,
            color: C.textFaint,
            fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
            fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
            padding: "10px 22px", borderRadius: 3, cursor: "pointer",
          }}
        >
          {portalLoading ? "…" : "Manage Billing"}
        </button>
      </div>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────── */
export default function ProPage() {
  const [email, setEmail] = useState("");
  const [isPro, setIsPro] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [billingStatus, setBillingStatus] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  async function checkAccess(e: string) {
    if (!e) return;
    setChecking(true);
    try {
      const res = await apiRequest("GET", `/api/user?email=${encodeURIComponent(e)}`);
      const user = await res.json();
      const active = user?.plan === "pro" && user?.access_status === "active";
      setIsPro(active);
      if (active) setBillingStatus(user?.billing_status ?? "active");
    } finally {
      setChecking(false);
    }
  }

  async function openBillingPortal() {
    if (!email || portalLoading) return;
    setPortalLoading(true);
    try {
      const res = await apiRequest("POST", "/api/billing/portal", { email });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error ?? "Could not open billing portal.");
    } catch {
      alert("Could not open billing portal. Please try again.");
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text }}>

      {/* Nav */}
      <div style={{
        background: C.surface1,
        borderBottom: `1px solid rgba(202,168,90,0.14)`,
        borderTop: "2px solid rgba(202,168,90,0.60)",
      }}>
        <div style={{
          maxWidth: 1440, margin: "0 auto",
          padding: "0 32px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          height: 56,
        }}>
          <Link href="/">
            <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="3" fill="#111317" />
                <rect x="6" y="7" width="20" height="2.5" rx="0.5" fill="#CAA85A" />
                <rect x="6" y="14.75" width="13" height="2.5" rx="0.5" fill="#CAA85A" />
                <rect x="6" y="22.5" width="20" height="2.5" rx="0.5" fill="#CAA85A" />
                <rect x="21" y="14.75" width="5" height="2.5" rx="0.5" fill="#D8B86A" opacity="0.6" />
              </svg>
              <span style={{
                fontFamily: "'Playfair Display',Georgia,serif",
                fontSize: 16, fontWeight: 700, color: C.text,
              }}>Edge Setter</span>
            </div>
          </Link>
          <Link href="/signals">
            <div style={{
              fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
              fontSize: 13, fontWeight: 700, letterSpacing: "0.14em",
              textTransform: "uppercase", color: C.textFaint, cursor: "pointer",
              transition: "color 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.color = C.gold; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.color = C.textFaint; }}>
              ← Signal Board
            </div>
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "64px 32px 96px" }}>

        {isPro === true ? (
          <>
            {(billingStatus === "past_due" || billingStatus === "payment_failed") && (
              <div style={{
                background: C.surface1,
                border: `1px solid ${C.amber}`,
                borderRadius: 4,
                padding: "14px 20px",
                marginBottom: 24,
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              }}>
                <div>
                  <span style={{
                    fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                    fontSize: 12, fontWeight: 700, letterSpacing: "0.18em",
                    textTransform: "uppercase", color: C.amber,
                  }}>⚠ Payment Issue</span>
                  <p style={{ margin: "4px 0 0", fontSize: 15, color: C.textMuted }}>
                    Your last payment failed. Update your card to keep Pro access.
                  </p>
                </div>
                <button
                  onClick={openBillingPortal}
                  disabled={portalLoading}
                  style={{
                    padding: "8px 16px", background: C.amber, color: C.bg,
                    border: "none", cursor: "pointer",
                    fontFamily: "'Barlow Condensed',Arial,sans-serif",
                    fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}
                >
                  {portalLoading ? "…" : "Fix Payment →"}
                </button>
              </div>
            )}
            <ProManagementPanel email={email} />
          </>
        ) : (
          <>
            {/* Draft Week urgency banner */}
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              background: "rgba(202,168,90,0.07)",
              border: "1px solid rgba(202,168,90,0.30)",
              borderLeft: `3px solid ${C.gold}`,
              borderRadius: 4, padding: "12px 16px",
              marginBottom: 36,
            }}>
              <span style={{
                fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.18em",
                textTransform: "uppercase", color: C.gold,
                marginTop: 1, flexShrink: 0,
              }}>⚡ Live Now</span>
              <span style={{ fontSize: 15, color: C.textMuted, lineHeight: 1.5 }}>
                <strong style={{ color: C.text }}>2026 NFL Draft is Apr 24–26.</strong>{" "}
                Act on draft-week movement before your league or the market does.
              </span>
            </div>

            {/* Eyebrow */}
            <div style={{
              fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
              fontSize: 13, fontWeight: 700, letterSpacing: "0.22em",
              textTransform: "uppercase", color: C.gold, marginBottom: 18,
            }}>
              Edge Setter Pro · $19/month
            </div>

            {/* Headline */}
            <h1 style={{
              fontFamily: "'Playfair Display',Georgia,serif",
              fontSize: "clamp(1.9rem, 3.8vw, 3rem)",
              fontWeight: 700, color: C.text,
              lineHeight: 1.1, letterSpacing: "-0.02em",
              margin: "0 0 16px",
              maxWidth: 700,
            }}>
              Stop chasing tweets.<br />
              <span style={{ color: C.gold }}>See the signals before your league does.</span>
            </h1>

            {/* Sub-headline */}
            <p style={{
              fontSize: 18, color: C.textMuted, lineHeight: 1.65,
              maxWidth: 560, margin: "0 0 12px",
            }}>
              Built for sharp fantasy, DFS, and betting players who already follow the news but want it condensed into edges.
            </p>
            <p style={{
              fontSize: 16, color: C.textFaint, lineHeight: 1.6,
              maxWidth: 540, margin: "0 0 48px",
            }}>
              Every signal is confidence-scored 0–100. Every signal includes one action. No recap threads. No noise.
            </p>

            {/* 4 direct bullet proof points */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 16,
              marginBottom: 52,
            }}>
              {FEATURES.map(({ icon: Icon, label, detail }) => (
                <div key={label} style={{
                  background: C.surface1,
                  border: "1px solid rgba(202,168,90,0.12)",
                  borderRadius: 4,
                  padding: "18px 20px",
                  display: "flex", gap: 14, alignItems: "flex-start",
                }}>
                  <div style={{
                    width: 32, height: 32, flexShrink: 0,
                    background: C.goldDim,
                    border: "1px solid rgba(202,168,90,0.22)",
                    borderRadius: 4,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon size={14} style={{ color: C.gold }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: "0 0 4px", lineHeight: 1.3 }}>
                      {label}
                    </p>
                    <p style={{ fontSize: 15, color: C.textMuted, margin: 0, lineHeight: 1.5 }}>
                      {detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Separator */}
            <div style={{ height: 1, background: C.gold, opacity: 0.14, marginBottom: 44 }} />

            {/* Checkout block */}
            <div>
              <p style={{
                fontFamily: "'Playfair Display',Georgia,serif",
                fontSize: 24, fontWeight: 700,
                color: C.text, margin: "0 0 6px",
              }}>
                Edge Setter Pro — $19/month
              </p>
              <p style={{
                fontSize: 16, color: C.textMuted, margin: "0 0 24px", lineHeight: 1.55,
                maxWidth: 480,
              }}>
                Enter your email and you'll be taken to Stripe checkout. No account creation required.
              </p>
              <CheckoutForm />
            </div>

            {/* Already Pro? */}
            <div style={{
              marginTop: 48, paddingTop: 32,
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}>
              <span style={{
                fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.18em",
                textTransform: "uppercase", color: C.textFaint,
              }}>
                Already a subscriber?
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <input
                  data-testid="input-pro-email-check"
                  type="email"
                  placeholder="Enter your email to verify access"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && checkAccess(email)}
                  style={{
                    background: C.surface2,
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: C.text, fontSize: 15,
                    padding: "8px 14px", outline: "none",
                    fontFamily: "inherit", borderRadius: 3, minWidth: 220,
                  }}
                />
                <button
                  data-testid="button-check-access"
                  onClick={() => checkAccess(email)}
                  disabled={checking || !email}
                  style={{
                    padding: "8px 16px",
                    background: "transparent",
                    border: "1px solid rgba(202,168,90,0.25)",
                    color: C.gold,
                    cursor: checking || !email ? "default" : "pointer",
                    fontFamily: "'Barlow Condensed',Arial,sans-serif",
                    fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
                    borderRadius: 3,
                  }}
                >
                  {checking ? "Checking…" : "Verify Access"}
                </button>
              </div>
              {isPro === false && (
                <p style={{ fontSize: 15, color: C.red, marginTop: 8 }}>
                  No active Pro subscription found for that email.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
