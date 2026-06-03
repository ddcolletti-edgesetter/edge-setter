import AppShell from "@/components/V2Shell";
import { CreditCard, Zap, CheckCircle, Calendar, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { useLocation } from "wouter";

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function formatAmount(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

interface SubscriptionDetails {
  planName: string;
  amount: number;
  currency: string;
  interval: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}

export default function Billing() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { email, user: authUser, isPro, authLoading } = useAuth();
  const [portalLoading, setPortalLoading] = useState(false);
  const isLoading = authLoading;
  const subDetails = null as SubscriptionDetails | null;
  const accountEmail = authUser?.email ?? email;
  const accessStatus = authUser?.access_status ?? (isPro ? "active" : null);
  const billingStatus = authUser?.billing_status ?? accessStatus;
  const hasStripeCustomer = Boolean(authUser?.stripe_customer_id);
  const isCanceledOrInactive = !isPro && (accessStatus === "canceled" || billingStatus === "canceled");
  const planStatusLabel = isPro ? "PRO - ACTIVE" : isCanceledOrInactive ? "PRO - CANCELED" : "FREE PLAN";
  const planStatusDescription = isPro
    ? "You have full access to all intelligence boards, real-time signals, and the complete archive."
    : isCanceledOrInactive
      ? "Your Pro access is not active. Resubscribe to restore subscriber features."
      : "Upgrade to Pro to unlock all boards, real-time alerts, and the full signal archive.";
  const detailsPlanName = isPro || isCanceledOrInactive ? "EdgeSetter Pro" : "Free";
  const detailsAmount = subDetails
    ? `${formatAmount(subDetails.amount, subDetails.currency)} / ${subDetails.interval}`
    : isPro
      ? "Managed in Stripe"
      : "Not active";
  const detailsStatus = isPro ? "Active" : isCanceledOrInactive ? "Canceled" : "Inactive";
  const detailsPeriodLabel = subDetails?.cancelAtPeriodEnd ? "ACCESS ENDS" : "NEXT BILLING";
  const detailsPeriod = subDetails?.currentPeriodEnd
    ? formatDate(subDetails.currentPeriodEnd)
    : isPro
      ? "Managed in Stripe portal"
      : "Not active";
  const portalMutation = {
    isPending: portalLoading,
    mutate: async (_args?: { origin?: string }) => {
      if (!accountEmail || portalLoading) return;
      setPortalLoading(true);
      try {
        let res: Response;
        try {
          res = await apiRequest("POST", "/api/billing/portal", { email: accountEmail });
        } catch {
          const refresh = await apiRequest("POST", "/api/billing/session", { email: accountEmail });
          const refreshData = await refresh.json();
          if (!refreshData.success) throw new Error("Billing session refresh failed");
          res = await apiRequest("POST", "/api/billing/portal", { email: accountEmail });
        }
        const data = await res.json();
        if (data.url) window.location.href = data.url;
      } catch {
        toast({ title: "Billing portal unavailable", description: "Verify your Pro access or try again after checkout completes." });
      } finally {
        setPortalLoading(false);
      }
    },
  };
  const checkoutMutation = { isPending: false, mutate: (_args?: unknown) => setLocation("/pro") };

  return (
    <AppShell>
      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "clamp(20px, 5vw, 48px) clamp(16px, 5vw, 28px)" }}>
        {/* Header */}
        <div style={{ marginBottom: "36px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <CreditCard size={20} style={{ color: "#F5B841" }} />
            <h1 style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: "1.8rem", fontWeight: 900,
              color: "var(--es-text-primary)", letterSpacing: "0.04em", margin: 0,
            }}>BILLING & SUBSCRIPTION</h1>
          </div>
          <p style={{ color: "var(--es-text-muted)", fontSize: "0.9rem", margin: 0 }}>
            Manage your Edge Setter Pro subscription and payment details.
          </p>
        </div>

        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {[1, 2].map(i => (
              <div key={i} style={{ height: "80px", borderRadius: "12px", background: "#1A1E2A", animation: "pulse 1.5s infinite" }} />
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            {/* Plan Status Card */}
            <div className="es-card" style={{
              padding: "28px 28px",
              borderLeft: `3px solid ${isPro ? "#00E676" : "#F5B841"}`,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    {isPro ? (
                      <CheckCircle size={16} style={{ color: "#00E676" }} />
                    ) : (
                      <Zap size={16} style={{ color: "#F5B841" }} />
                    )}
                    <span style={{
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: "1.1rem", fontWeight: 900,
                      color: isPro ? "#00E676" : "#F5B841",
                      letterSpacing: "0.06em",
                    }}>
                      {planStatusLabel}
                    </span>
                  </div>
                  {accountEmail && (
                    <p style={{ color: "var(--es-text-muted)", fontSize: "0.78rem", margin: "0 0 6px", letterSpacing: "0.04em" }}>
                      Account: {accountEmail}
                    </p>
                  )}
                  <p style={{ color: "var(--es-text-muted)", fontSize: "0.85rem", margin: 0 }}>
                    {planStatusDescription}
                  </p>
                </div>
                {!isPro && (
                  <button
                    onClick={() => checkoutMutation.mutate({ origin: window.location.origin })}
                    disabled={checkoutMutation.isPending}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "8px",
                      padding: "10px 20px", borderRadius: "8px",
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: "0.85rem", fontWeight: 800,
                      letterSpacing: "0.06em", textTransform: "uppercase",
                      cursor: "pointer", whiteSpace: "nowrap",
                      background: "linear-gradient(135deg, #F5B841, #F5B841)",
                      color: "#0A0C10", border: "none",
                      boxShadow: "0 4px 16px rgba(245,184,65,0.3)",
                      opacity: checkoutMutation.isPending ? 0.7 : 1,
                    }}
                  >
                    <Zap size={13} />
                    {checkoutMutation.isPending ? "Loading…" : "Upgrade — $19/mo"}
                  </button>
                )}
              </div>
            </div>

            {/* Subscription Details */}
            {(isPro || isCanceledOrInactive) && (
              <div className="es-card" style={{ padding: "28px" }}>
                <h2 style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: "0.85rem", fontWeight: 700,
                  color: "var(--es-text-muted)", letterSpacing: "0.1em",
                  textTransform: "uppercase", margin: "0 0 20px",
                }}>SUBSCRIPTION DETAILS</h2>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "20px" }}>
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--es-text-muted)", marginBottom: "4px", letterSpacing: "0.08em" }}>PLAN</div>
                    <div style={{ fontWeight: 700, color: "var(--es-text-primary)", fontSize: "0.95rem" }}>{subDetails?.planName ?? detailsPlanName}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--es-text-muted)", marginBottom: "4px", letterSpacing: "0.08em" }}>AMOUNT</div>
                    <div style={{ fontWeight: 700, color: "var(--es-text-primary)", fontSize: "0.95rem" }}>{detailsAmount}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--es-text-muted)", marginBottom: "4px", letterSpacing: "0.08em" }}>STATUS</div>
                    <div style={{ fontWeight: 700, color: isPro ? "#00E676" : "#F5B841", fontSize: "0.95rem", textTransform: "capitalize" }}>
                      {subDetails?.cancelAtPeriodEnd ? "Cancels at period end" : detailsStatus}
                    </div>
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.75rem", color: "var(--es-text-muted)", marginBottom: "4px", letterSpacing: "0.08em" }}>
                      <Calendar size={11} /> {detailsPeriodLabel}
                    </div>
                    <div style={{ fontWeight: 700, color: "var(--es-text-primary)", fontSize: "0.95rem" }}>
                      {detailsPeriod}
                    </div>
                  </div>
                </div>

                {subDetails?.cancelAtPeriodEnd && (
                  <div style={{
                    marginTop: "20px", padding: "12px 16px",
                    background: "rgba(245,184,65,0.08)", border: "1px solid rgba(245,184,65,0.2)",
                    borderRadius: "8px", fontSize: "0.85rem", color: "#F5B841",
                  }}>
                    Your subscription is set to cancel on {formatDate(subDetails.currentPeriodEnd)}. You'll retain Pro access until then.
                  </div>
                )}
              </div>
            )}

            {/* Manage Subscription (verified Stripe customer only) */}
            {isPro && hasStripeCustomer && (
              <div className="es-card" style={{ padding: "24px 28px" }}>
                <h2 style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: "0.85rem", fontWeight: 700,
                  color: "var(--es-text-muted)", letterSpacing: "0.1em",
                  textTransform: "uppercase", margin: "0 0 16px",
                }}>MANAGE SUBSCRIPTION</h2>
                <p style={{ color: "var(--es-text-muted)", fontSize: "0.85rem", margin: "0 0 16px", lineHeight: 1.6 }}>
                  Update your payment method, download invoices, or cancel your subscription through the Stripe billing portal.
                </p>
                <button
                  onClick={() => portalMutation.mutate({ origin: window.location.origin })}
                  disabled={portalMutation.isPending}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "8px",
                    padding: "10px 20px", borderRadius: "8px",
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: "0.85rem", fontWeight: 800,
                    letterSpacing: "0.06em", textTransform: "uppercase",
                    cursor: "pointer",
                    background: "transparent",
                    color: "#F5B841",
                    border: "1px solid rgba(245,184,65,0.4)",
                    opacity: portalMutation.isPending ? 0.7 : 1,
                  }}
                >
                  <ExternalLink size={13} />
                  {portalMutation.isPending ? "Opening…" : "Open Billing Portal"}
                </button>
              </div>
            )}

            {/* What's included */}
            <div className="es-card" style={{ padding: "24px 28px" }}>
              <h2 style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: "0.85rem", fontWeight: 700,
                color: "var(--es-text-muted)", letterSpacing: "0.1em",
                textTransform: "uppercase", margin: "0 0 16px",
              }}>WHAT'S INCLUDED IN PRO</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px" }}>
                {[
                  "All intelligence boards (NBA, MLB, NFL, CFB)",
                  "Real-time signal stream — no delay",
                  "Full signal archive (unlimited history)",
                  "Injury & lineup alerts",
                  "Line movement tracking",
                  "Consensus confidence scores",
                  "Multi-sport coverage",
                  "Early access to new features",
                ].map((feature) => (
                  <div key={feature} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <CheckCircle size={13} style={{ color: "#00E676", flexShrink: 0, marginTop: "2px" }} />
                    <span style={{ fontSize: "0.85rem", color: "var(--es-text-muted)", lineHeight: 1.4 }}>{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
