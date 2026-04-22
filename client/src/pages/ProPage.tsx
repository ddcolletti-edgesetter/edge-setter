/**
 * /pro — Gated Pro signal board
 * - If user has no email stored → show upgrade prompt
 * - If email found but not pro → show upgrade prompt
 * - If pro → show full board with source notes
 */
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import type { Signal, SourceNote } from "@shared/schema";

const C = {
  void: "#080706", shell: "#0C0A08", panel: "#111009", lift: "#181410",
  gold: "#C9A84C", goldBright: "#E2BE6A", goldDim: "#6A5218",
  ivory: "#F0E8D6", ivoryMid: "#B8AD98", ivoryDim: "#6E6458", ivoryFaint: "#242018",
  green: "#3DAE72", cyan: "#38A8C8", amber: "#D4932A", red: "#C04040",
};

function Cap({ children, color, size = 9 }: { children: React.ReactNode; color?: string; size?: number }) {
  return <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: size, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: color ?? C.ivoryDim }}>{children}</span>;
}

function StatusDot({ tag }: { tag: string }) {
  const colors: Record<string, string> = { verified: C.green, "high-risk": C.red, speculative: C.amber };
  return <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: colors[tag] ?? C.ivoryDim }} />;
}

function ProSignalCard({ signal }: { signal: Signal }) {
  const [expanded, setExpanded] = useState(false);
  const { data: notes = [] } = useQuery<SourceNote[]>({
    queryKey: ["/api/signals", signal.id, "notes"],
    queryFn: () => apiRequest("GET", `/api/signals/${signal.id}/notes`).then(r => r.json()),
    enabled: expanded,
  });

  return (
    <div data-testid={`pro-signal-${signal.id}`} style={{ borderTop: `1px solid ${C.ivoryFaint}`, padding: "16px 0 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <StatusDot tag={signal.status_tag} />
            <Cap color={C.ivoryDim}>{signal.status_tag}</Cap>
            <Cap color={C.ivoryDim}>·</Cap>
            <Cap color={C.ivoryDim}>{signal.signal_type}</Cap>
          </div>
          <p style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 16, fontWeight: 700, color: C.ivory, margin: "0 0 4px", lineHeight: 1.25 }}>{signal.title}</p>
          <Cap color={C.gold}>{signal.player_name}</Cap><Cap color={C.ivoryDim}> · {signal.team}</Cap>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 26, fontWeight: 900, color: C.goldBright, lineHeight: 1 }}>{signal.confidence_score}</div>
          <Cap color={C.ivoryDim}>/{signal.source_count} src</Cap>
        </div>
      </div>

      <p style={{ fontSize: 12, color: C.ivoryMid, margin: "10px 0 8px", lineHeight: 1.55 }}>{signal.summary}</p>

      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <div style={{ width: 2, height: 24, background: C.gold, opacity: 0.6, flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: 11, color: C.ivory, margin: 0, lineHeight: 1.5, fontStyle: "italic" }}>{signal.action_takeaway}</p>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Cap color={C.gold}>{signal.verdict}</Cap>
        <button
          data-testid={`button-expand-${signal.id}`}
          onClick={() => setExpanded(!expanded)}
          style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed',Arial,sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: expanded ? C.ivoryDim : C.gold }}
        >
          {expanded ? "Hide sources ↑" : "Source detail →"}
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.ivoryFaint}` }}>
          <Cap color={C.cyan} size={8}>Source Notes — {notes.length} sources</Cap>
          {notes.length === 0 ? (
            <p style={{ fontSize: 11, color: C.ivoryDim, marginTop: 8 }}>No source notes available.</p>
          ) : (
            notes.map(n => (
              <div key={n.id} style={{ marginTop: 10, paddingLeft: 10, borderLeft: `1px solid ${C.gold}40` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <Cap color={C.ivory}>{n.source_name}</Cap>
                  <Cap color={C.ivoryDim}>{n.source_type}{n.trust_score ? ` · ${n.trust_score}` : ""}</Cap>
                </div>
                <p style={{ fontSize: 11, color: C.ivoryMid, margin: 0, lineHeight: 1.5 }}>{n.note}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function UpgradeGate({ email, onEmailChange }: { email: string; onEmailChange: (e: string) => void }) {
  const [loading, setLoading] = useState(false);

  async function handleCheckout() {
    if (!email) return;
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/checkout", { email });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "80px auto", textAlign: "center" }}>
      <Cap color={C.gold} size={10}>Pro Intelligence</Cap>
      <p style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 28, fontWeight: 900, color: C.ivory, margin: "10px 0 8px", lineHeight: 1.1 }}>Full signal access.</p>
      <p style={{ fontSize: 13, color: C.ivoryDim, margin: "0 0 28px", lineHeight: 1.6 }}>
        Source notes, confidence scores, verdict detail, and the complete feed — $19/month.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 12 }}>
        <input
          data-testid="input-pro-gate-email"
          type="email"
          placeholder="Your email address"
          value={email}
          onChange={e => onEmailChange(e.target.value)}
          style={{ background: C.shell, border: `1px solid ${C.ivoryFaint}`, borderTop: `1px solid ${C.gold}40`, color: C.ivory, fontSize: 12, padding: "10px 14px", outline: "none", fontFamily: "inherit" }}
        />
        <button
          data-testid="button-upgrade-pro-gate"
          onClick={handleCheckout}
          disabled={loading || !email}
          style={{ padding: "10px 20px", background: loading ? C.goldDim : C.gold, color: C.void, border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed',Arial,sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", whiteSpace: "nowrap" }}
        >
          {loading ? "…" : "Upgrade — $19/mo"}
        </button>
      </div>
      <Link href="/signals">
        <a style={{ fontSize: 11, color: C.ivoryDim, textDecoration: "none", fontFamily: "'Barlow Condensed',Arial,sans-serif", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          ← Back to free signal board
        </a>
      </Link>
    </div>
  );
}

export default function ProPage() {
  const [email, setEmail] = useState("");
  const [isPro, setIsPro] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [billingStatus, setBillingStatus] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const { data: signals = [] } = useQuery<Signal[]>({
    queryKey: ["/api/signals/all"],
    queryFn: () => apiRequest("GET", "/api/signals/all").then(r => r.json()),
    enabled: isPro === true,
  });

  async function checkAccess(e: string) {
    if (!e) return;
    setChecking(true);
    try {
      const res = await apiRequest("GET", `/api/user?email=${encodeURIComponent(e)}`);
      const user = await res.json();
      const isActivePro = user?.plan === "pro" && user?.access_status === "active";
      setIsPro(isActivePro);
      if (isActivePro) setBillingStatus(user?.billing_status ?? "active");
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
      else alert(data.error ?? "Could not open billing portal");
    } catch {
      alert("Could not open billing portal. Please try again.");
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: C.void, color: C.ivory }}>
      {/* Nav */}
      <div style={{ background: C.shell, borderBottom: `1px solid ${C.gold}30`, padding: "0 20px" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", height: 48 }}>
          <Link href="/"><a style={{ textDecoration: "none" }}>
            <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: C.ivory }}>EDGE SETTER<span style={{ color: C.gold }}>.</span></span>
          </a></Link>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {isPro && <Cap color={C.green} size={8}>● Pro Active</Cap>}
            <Link href="/signals"><a style={{ fontFamily: "'Barlow Condensed',Arial,sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.ivoryDim, textDecoration: "none" }}>Signal Board</a></Link>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 20px 48px" }}>
        {isPro === null && (
          <div style={{ maxWidth: 520, margin: "60px auto" }}>
            <Cap color={C.gold} size={10}>Pro Board</Cap>
            <p style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 20, fontWeight: 700, color: C.ivory, margin: "10px 0 16px" }}>Enter your email to access.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
              <input
                data-testid="input-pro-email-check"
                type="email"
                placeholder="Your email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && checkAccess(email)}
                style={{ background: C.shell, border: `1px solid ${C.ivoryFaint}`, borderTop: `1px solid ${C.gold}40`, color: C.ivory, fontSize: 12, padding: "10px 14px", outline: "none", fontFamily: "inherit" }}
              />
              <button
                data-testid="button-check-access"
                onClick={() => checkAccess(email)}
                disabled={checking || !email}
                style={{ padding: "10px 18px", background: C.gold, color: C.void, border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed',Arial,sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}
              >
                {checking ? "…" : "Access"}
              </button>
            </div>
            <p style={{ fontSize: 11, color: C.ivoryDim, marginTop: 10 }}>
              Don't have Pro?{" "}
              <button onClick={() => setIsPro(false)} style={{ background: "none", border: "none", color: C.gold, cursor: "pointer", fontSize: 11, fontFamily: "inherit", padding: 0 }}>Upgrade for $19/mo →</button>
            </p>
          </div>
        )}

        {isPro === false && (
          <UpgradeGate email={email} onEmailChange={setEmail} />
        )}

        {isPro === true && (
          <div>
            {/* Billing warning banner — shows on past_due / payment_failed */}
            {(billingStatus === "past_due" || billingStatus === "payment_failed") && (
              <div style={{ background: "#2A1800", border: `1px solid ${C.amber}`, borderRadius: 2, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <span style={{ fontFamily: "'Barlow Condensed',Arial,sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: C.amber }}>⚠ Payment Issue</span>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: C.ivoryMid }}>Your last payment failed. Update your card to keep Pro access.</p>
                </div>
                <button
                  onClick={openBillingPortal}
                  disabled={portalLoading}
                  style={{ padding: "8px 16px", background: C.amber, color: C.void, border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed',Arial,sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", whiteSpace: "nowrap" }}
                >
                  {portalLoading ? "…" : "Fix Payment →"}
                </button>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <Cap color={C.green} size={10}>Pro Intelligence Board</Cap>
                <div style={{ height: 1, background: C.gold, opacity: 0.4, marginTop: 6 }} />
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <button
                  data-testid="button-manage-billing"
                  onClick={openBillingPortal}
                  disabled={portalLoading}
                  style={{ background: "none", border: `1px solid ${C.ivoryFaint}`, color: C.ivoryDim, cursor: "pointer", fontFamily: "'Barlow Condensed',Arial,sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", padding: "5px 12px" }}
                >
                  {portalLoading ? "…" : "Manage Billing"}
                </button>
                <Cap color={C.ivoryDim}>{signals.length} signals</Cap>
              </div>
            </div>
            {signals.map(s => <ProSignalCard key={s.id} signal={s} />)}
          </div>
        )}
      </div>
    </div>
  );
}
