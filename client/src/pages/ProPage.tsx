/**
 * /pro — Edge Setter Pro onboarding + upgrade
 *
 * Single-page flow:
 *   1. Hero headline targeting fantasy/DFS/betting grinders
 *   2. 3 benefit bullets with concrete value props
 *   3. Explicit Pro feature list
 *   4. Email → Stripe checkout — no extra steps
 *   5. If already Pro: show management panel
 */
import { useState } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import type { Signal } from "@shared/schema";
import { CheckCircle2, ChevronRight, Lock, Zap, BarChart2, Archive } from "lucide-react";

const C = {
  bg:         "#0A0B0D",
  surface1:   "#111317",
  surface2:   "#16191E",
  surface3:   "#1B1F25",
  gold:       "#CAA85A",
  goldBright: "#D8B86A",
  goldDim:    "rgba(202,168,90,0.15)",
  text:       "#F3EFE6",
  textMuted:  "#B7AFA0",
  textFaint:  "#7E776A",
  green:      "#3DAE72",
  red:        "#C04040",
  amber:      "#D4932A",
};

function Cap({ children, color, size = 9 }: { children: React.ReactNode; color?: string; size?: number }) {
  return (
    <span style={{
      fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
      fontSize: size, fontWeight: 700, letterSpacing: "0.18em",
      textTransform: "uppercase", color: color ?? C.textFaint,
    }}>
      {children}
    </span>
  );
}

function GoldRule({ opacity = 0.18, my = 0 }: { opacity?: number; my?: number }) {
  return <div style={{ height: 1, background: C.gold, opacity, margin: `${my}px 0`, flexShrink: 0 }} />;
}

/* ── Pro feature list ─────────────────────────────────────────── */
const PRO_FEATURES = [
  { icon: Zap,       label: "Full Live Signals Feed",         detail: "Every 2026 offseason signal, unfiltered. No 3-signal cap." },
  { icon: BarChart2, label: "Topic Filters",                  detail: "Slice by Free Agency, Injuries, Depth Chart, Draft, Trades." },
  { icon: CheckCircle2, label: "Confidence Scores & Verdicts", detail: "0–100 confidence, confirmed/likely/rumor/contradicted ratings." },
  { icon: Archive,   label: "2026 Draft Board",               detail: "Full 2026 class with rankings, team fits, and signal history." },
  { icon: Archive,   label: "Archive Search",                 detail: "Search prior-season signals by player, team, or topic." },
  { icon: Zap,       label: "Today's Top Signal History",     detail: "See every featured signal we've surfaced, with rationale." },
];

/* ── Checkout form ────────────────────────────────────────────── */
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
      const { url, error: apiError } = await res.json();
      if (apiError) { setError(apiError); setLoading(false); return; }
      if (url) window.location.href = url;
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 440 }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 0,
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
            fontSize: 14,
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
            fontSize: 11, fontWeight: 700,
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
      {error && (
        <p style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{error}</p>
      )}
      <p style={{ fontSize: 12, color: C.textFaint, marginTop: 10, lineHeight: 1.5 }}>
        Billed monthly. Cancel any time from your billing portal.
        Powered by Stripe — your card is never stored on our servers.
      </p>
    </div>
  );
}

/* ── Already-pro management panel ────────────────────────────── */
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
        <Cap color={C.green} size={10}>Pro Active</Cap>
      </div>
      <p style={{
        fontFamily: "'Playfair Display',Georgia,serif",
        fontSize: 20, fontWeight: 700,
        color: C.text, margin: "0 0 8px",
      }}>
        You have full access.
      </p>
      <p style={{ fontSize: 14, color: C.textMuted, margin: "0 0 24px", lineHeight: 1.55 }}>
        Head to the Signal Board to see the full live feed.
      </p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <Link href="/dashboard">
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: C.gold, color: C.bg,
            fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
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
            fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
            padding: "10px 22px", borderRadius: 3, cursor: "pointer",
          }}
        >
          {portalLoading ? "…" : "Manage Billing"}
        </button>
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────── */
export default function ProPage() {
  const [email, setEmail] = useState("");
  const [isPro, setIsPro] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [billingStatus, setBillingStatus] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  // Check existing access (used by the "Already Pro?" path)
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

      {/* ── Nav ─────────────────────────────────────────────── */}
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
          <Link href="/dashboard">
            <div style={{
              fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
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

        {/* ── Already Pro check ───────────────────────────── */}
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
                  <Cap color={C.amber} size={9}>⚠ Payment Issue</Cap>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: C.textMuted }}>
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
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
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
            {/* ── Draft Week urgency banner ──────────────────── */}
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              background: "rgba(202,168,90,0.07)",
              border: "1px solid rgba(202,168,90,0.30)",
              borderLeft: `3px solid ${C.gold}`,
              borderRadius: 4, padding: "12px 16px",
              marginBottom: 28,
            }}>
              <span style={{
                fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.18em",
                textTransform: "uppercase", color: C.gold,
                marginTop: 1, flexShrink: 0,
              }}>⚡ Draft Week</span>
              <span style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>
                <strong style={{ color: C.text }}>2026 NFL Draft is Apr 24–26.</strong>{" "}
                Pro unlocks all 11 live signals: prospect risers, medical flags, landing spots, and team-fit intel — before the picks are in.
              </span>
            </div>

            {/* ── Eyebrow ──────────────────────────────────────────── */}
            <div style={{
              fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.22em",
              textTransform: "uppercase", color: C.gold, marginBottom: 20,
            }}>
              Edge Setter Pro · $19/month
            </div>

            {/* ── Headline ───────────────────────────────────────── */}
            <h1 style={{
              fontFamily: "'Playfair Display',Georgia,serif",
              fontSize: "clamp(2rem, 4vw, 3.25rem)",
              fontWeight: 700, color: C.text,
              lineHeight: 1.1, letterSpacing: "-0.02em",
              margin: "0 0 20px",
              maxWidth: 680,
            }}>
              The pick is made in the 72 hours before it.<br />
              <span style={{ color: C.gold }}>Pro sees those 72 hours.</span>
            </h1>

            <p style={{
              fontSize: 17, color: C.textMuted, lineHeight: 1.65,
              maxWidth: 560, margin: "0 0 48px",
            }}>
              Edge Setter tracks every prospect movement, medical flag, team-fit signal,
              and landing-spot confirmation during draft week — confidence-scored and actionable
              for your dynasty league, DFS lineup, or futures card.
            </p>

            {/* ── 3 benefit bullets ───────────────────────── */}
            <div style={{
              display: "flex", flexDirection: "column", gap: 20,
              marginBottom: 48,
              paddingLeft: 0,
            }}>
              {[
                {
                  headline: "Every signal, ranked by confidence.",
                  body: "Free agency rumors, injury updates, depth chart shuffles — each one scored 0–100 based on source reliability and corroboration. You see the edge, not the noise.",
                },
                {
                  headline: "One action per signal.",
                  body: "No parsing tweet threads. Every signal includes a concrete action takeaway — exactly what to do with the intel in your fantasy league, DFS lineup, or betting card.",
                },
                {
                  headline: "2026 Draft Board + full archive.",
                  body: "The complete 2026 class with live rankings plus searchable signal history by player, team, or topic. Know what insiders said last week, last month, last season.",
                },
              ].map((b, i) => (
                <div key={i} style={{
                  display: "flex", gap: 18, alignItems: "flex-start",
                }}>
                  <div style={{
                    width: 28, height: 28, flexShrink: 0,
                    background: "rgba(202,168,90,0.10)",
                    border: "1px solid rgba(202,168,90,0.25)",
                    borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginTop: 2,
                  }}>
                    <CheckCircle2 size={14} style={{ color: C.gold }} />
                  </div>
                  <div>
                    <p style={{
                      fontFamily: "'Playfair Display',Georgia,serif",
                      fontSize: 17, fontWeight: 700,
                      color: C.text, margin: "0 0 4px", lineHeight: 1.3,
                    }}>
                      {b.headline}
                    </p>
                    <p style={{ fontSize: 15, color: C.textMuted, margin: 0, lineHeight: 1.6 }}>
                      {b.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <GoldRule opacity={0.14} my={0} />

            {/* ── Pro feature list ────────────────────────── */}
            <div style={{ padding: "36px 0 40px" }}>
              <Cap color={C.textFaint} size={10}>What's included</Cap>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 16,
                marginTop: 20,
              }}>
                {PRO_FEATURES.map(({ icon: Icon, label, detail }) => (
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
                      border: "1px solid rgba(202,168,90,0.20)",
                      borderRadius: 4,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon size={14} style={{ color: C.gold }} />
                    </div>
                    <div>
                      <p style={{
                        fontSize: 14, fontWeight: 600,
                        color: C.text, margin: "0 0 4px", lineHeight: 1.3,
                      }}>
                        {label}
                      </p>
                      <p style={{ fontSize: 13, color: C.textMuted, margin: 0, lineHeight: 1.5 }}>
                        {detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <GoldRule opacity={0.14} my={0} />

            {/* ── Checkout ────────────────────────────────── */}
            <div style={{ paddingTop: 40 }}>
              <div style={{ marginBottom: 24 }}>
                <p style={{
                  fontFamily: "'Playfair Display',Georgia,serif",
                  fontSize: 22, fontWeight: 700,
                  color: C.text, margin: "0 0 8px",
                }}>
                  Get Pro access — $19/month
                </p>
                <p style={{ fontSize: 14, color: C.textMuted, margin: 0, lineHeight: 1.55 }}>
                  Enter your email and you'll be taken directly to Stripe checkout. No account creation, no waiting.
                </p>
              </div>
              <CheckoutForm />
            </div>

            {/* ── Already Pro? ────────────────────────────── */}
            <div style={{
              marginTop: 40, paddingTop: 32,
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}>
              <Cap color={C.textFaint} size={9}>Already a subscriber?</Cap>
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
                    color: C.text, fontSize: 13,
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
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
                    borderRadius: 3,
                  }}
                >
                  {checking ? "Checking…" : "Verify Access"}
                </button>
              </div>
              {isPro === false && (
                <p style={{ fontSize: 13, color: C.red, marginTop: 8 }}>
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
