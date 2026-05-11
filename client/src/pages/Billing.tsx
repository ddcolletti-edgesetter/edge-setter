import AppShell from "@/components/AppShell";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { CreditCard, Zap, CheckCircle, AlertCircle, Calendar, ExternalLink, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function formatAmount(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

export default function Billing() {
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const { data: subDetails, isLoading: subLoading } = trpc.billing.subscriptionDetails.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: status } = trpc.billing.status.useQuery(undefined, { enabled: !!user });

  const portalMutation = trpc.billing.portalSession.useMutation({
    onSuccess: (data) => {
      toast({ title: "Opening Stripe billing portal…" });
      window.open(data.url, "_blank");
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message ?? "Could not open billing portal", variant: "destructive" });
    },
  });

  const checkoutMutation = trpc.billing.createCheckout.useMutation({
    onSuccess: (data) => {
      toast({ title: "Opening Stripe checkout…" });
      window.open(data.url, "_blank");
    },
    onError: (err) => toast({ title: "Error", description: err.message ?? "Checkout failed", variant: "destructive" }),
  });

  const isPro = status?.isPro ?? false;
  const isLoading = authLoading || subLoading;

  return (
    <AppShell>
      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "clamp(20px, 5vw, 48px) clamp(16px, 5vw, 28px)" }}>
        {/* Header */}
        <div style={{ marginBottom: "36px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <CreditCard size={20} style={{ color: "#F5A623" }} />
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
        ) : !user ? (
          <div className="es-card" style={{ padding: "32px", textAlign: "center" }}>
            <AlertCircle size={32} style={{ color: "#F5A623", margin: "0 auto 12px" }} />
            <p style={{ color: "var(--es-text-muted)" }}>Please log in to view your billing details.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            {/* Plan Status Card */}
            <div className="es-card" style={{
              padding: "28px 28px",
              borderLeft: `3px solid ${isPro ? "#39FF14" : "#F5A623"}`,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    {isPro ? (
                      <CheckCircle size={16} style={{ color: "#39FF14" }} />
                    ) : (
                      <Zap size={16} style={{ color: "#F5A623" }} />
                    )}
                    <span style={{
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: "1.1rem", fontWeight: 900,
                      color: isPro ? "#39FF14" : "#F5A623",
                      letterSpacing: "0.06em",
                    }}>
                      {isPro ? "PRO — ACTIVE" : "FREE PLAN"}
                    </span>
                  </div>
                  <p style={{ color: "var(--es-text-muted)", fontSize: "0.85rem", margin: 0 }}>
                    {isPro
                      ? "You have full access to all intelligence boards, real-time signals, and the complete archive."
                      : "Upgrade to Pro to unlock all boards, real-time alerts, and the full signal archive."}
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
                      background: "linear-gradient(135deg, #F5A623, #E8941A)",
                      color: "#0A0C10", border: "none",
                      boxShadow: "0 4px 16px rgba(245,166,35,0.3)",
                      opacity: checkoutMutation.isPending ? 0.7 : 1,
                    }}
                  >
                    <Zap size={13} />
                    {checkoutMutation.isPending ? "Loading…" : "Upgrade — $19/mo"}
                  </button>
                )}
              </div>
            </div>

            {/* Subscription Details (Pro only) */}
            {isPro && subDetails && (
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
                    <div style={{ fontWeight: 700, color: "var(--es-text-primary)", fontSize: "0.95rem" }}>{subDetails.planName}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--es-text-muted)", marginBottom: "4px", letterSpacing: "0.08em" }}>AMOUNT</div>
                    <div style={{ fontWeight: 700, color: "var(--es-text-primary)", fontSize: "0.95rem" }}>
                      {formatAmount(subDetails.amount, subDetails.currency)} / {subDetails.interval}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--es-text-muted)", marginBottom: "4px", letterSpacing: "0.08em" }}>STATUS</div>
                    <div style={{ fontWeight: 700, color: subDetails.status === "active" ? "#39FF14" : "#F5A623", fontSize: "0.95rem", textTransform: "capitalize" }}>
                      {subDetails.cancelAtPeriodEnd ? "Cancels at period end" : subDetails.status}
                    </div>
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.75rem", color: "var(--es-text-muted)", marginBottom: "4px", letterSpacing: "0.08em" }}>
                      <Calendar size={11} /> {subDetails.cancelAtPeriodEnd ? "ACCESS ENDS" : "NEXT BILLING"}
                    </div>
                    <div style={{ fontWeight: 700, color: "var(--es-text-primary)", fontSize: "0.95rem" }}>
                      {formatDate(subDetails.currentPeriodEnd)}
                    </div>
                  </div>
                </div>

                {subDetails.cancelAtPeriodEnd && (
                  <div style={{
                    marginTop: "20px", padding: "12px 16px",
                    background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)",
                    borderRadius: "8px", fontSize: "0.85rem", color: "#F5A623",
                  }}>
                    Your subscription is set to cancel on {formatDate(subDetails.currentPeriodEnd)}. You'll retain Pro access until then.
                  </div>
                )}
              </div>
            )}

            {/* Manage Subscription (Pro only) */}
            {isPro && (
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
                    color: "#F5A623",
                    border: "1px solid rgba(245,166,35,0.4)",
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
                    <CheckCircle size={13} style={{ color: "#39FF14", flexShrink: 0, marginTop: "2px" }} />
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
