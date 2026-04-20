/**
 * /signals — Public signal board
 * Shows seeded signals immediately — never empty.
 */
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import type { Signal } from "@shared/schema";

// ─── Palette (matches LandingPage) ──────────────────────────────────────────
const C = {
  void: "#080706",
  shell: "#0C0A08",
  panel: "#111009",
  lift: "#181410",
  gold: "#C9A84C",
  goldBright: "#E2BE6A",
  goldDim: "#6A5218",
  ivory: "#F0E8D6",
  ivoryMid: "#B8AD98",
  ivoryDim: "#6E6458",
  ivoryFaint: "#242018",
  green: "#3DAE72",
  cyan: "#38A8C8",
  amber: "#D4932A",
  red: "#C04040",
};

function Cap({ children, color, size = 9 }: { children: React.ReactNode; color?: string; size?: number }) {
  return (
    <span style={{
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: size, fontWeight: 700, letterSpacing: "0.18em",
      textTransform: "uppercase", color: color ?? C.ivoryDim,
    }}>
      {children}
    </span>
  );
}

function StatusBadge({ tag }: { tag: string }) {
  const colorMap: Record<string, string> = {
    verified: C.green,
    "high-risk": C.red,
    speculative: C.amber,
  };
  const color = colorMap[tag] ?? C.ivoryDim;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: 8, fontWeight: 700, letterSpacing: "0.2em",
      textTransform: "uppercase", color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, display: "inline-block" }} />
      {tag}
    </span>
  );
}

function ConfBar({ score }: { score: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 2, background: C.ivoryFaint, borderRadius: 1 }}>
        <div style={{ width: `${score}%`, height: "100%", background: score >= 88 ? C.green : score >= 80 ? C.gold : C.amber, borderRadius: 1 }} />
      </div>
      <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, color: C.ivory, minWidth: 28, textAlign: "right" }}>{score}</span>
    </div>
  );
}

function SignalCard({ signal, featured }: { signal: Signal; featured?: boolean }) {
  return (
    <div
      data-testid={`signal-card-${signal.id}`}
      style={{
        background: featured ? C.shell : "transparent",
        border: featured ? `1px solid ${C.gold}40` : `none`,
        borderTop: `1px solid ${featured ? C.gold : C.ivoryFaint}`,
        padding: featured ? "20px 22px 18px" : "16px 0 14px",
        position: "relative",
      }}
    >
      {featured && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: C.gold }} />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <StatusBadge tag={signal.status_tag} />
            <Cap color={C.ivoryDim}>{signal.signal_type}</Cap>
          </div>
          <p style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: featured ? 18 : 15,
            fontWeight: 700, color: C.ivory,
            margin: "0 0 4px", lineHeight: 1.25,
          }}>
            {signal.title}
          </p>
          <Cap color={C.gold}>{signal.player_name}</Cap>
          <Cap color={C.ivoryDim}> · {signal.team}</Cap>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: featured ? 28 : 22, fontWeight: 900, color: C.goldBright, lineHeight: 1 }}>{signal.confidence_score}</div>
          <Cap color={C.ivoryDim}>conf</Cap>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <ConfBar score={signal.confidence_score} />
      </div>

      <p style={{ fontSize: 12, color: C.ivoryMid, margin: "0 0 10px", lineHeight: 1.5 }}>
        {signal.summary}
      </p>

      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        <div style={{ width: 2, height: 28, background: C.gold, opacity: 0.6, flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: 11, color: C.ivory, margin: 0, lineHeight: 1.5, fontStyle: "italic" }}>
          {signal.action_takeaway}
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
        <Cap color={C.ivoryDim}>{signal.source_count} sources · {signal.verdict}</Cap>
        {featured && (
          <Link href="/pro">
            <a style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: C.gold, textDecoration: "none" }}>
              Full source detail — Pro →
            </a>
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
    } catch (e) {
      setCheckoutLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: C.void, color: C.ivory }}>
      {/* Nav */}
      <div style={{ background: C.shell, borderBottom: `1px solid ${C.gold}30`, padding: "0 20px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", height: 48 }}>
          <Link href="/">
            <a style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: C.ivory }}>EDGE SETTER<span style={{ color: C.gold }}>.</span></span>
            </a>
          </Link>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <span style={{ fontFamily: "'Barlow Condensed'", fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase", color: C.green }}>
              <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: C.green, marginRight: 5 }} />
              Signal Feed Active
            </span>
            <Link href="/pro">
              <a style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: C.void, background: C.gold, padding: "6px 14px", textDecoration: "none" }}>
                Upgrade to Pro
              </a>
            </Link>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 48px" }}>
        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <Cap color={C.gold} size={10}>Public Signal Board</Cap>
          <div style={{ height: 1, background: C.gold, opacity: 0.3, marginTop: 8, marginBottom: 12 }} />
          <p style={{ fontSize: 13, color: C.ivoryDim, margin: 0 }}>
            Verified NFL signals — scored, sourced, and ready to act on. Pro subscribers get full source detail and confidence breakdowns.
          </p>
        </div>

        {isLoading ? (
          <div style={{ padding: "40px 0", textAlign: "center" }}>
            <Cap color={C.ivoryDim}>Loading signals…</Cap>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 32 }}>
            {/* Signal feed */}
            <div>
              {featured && <SignalCard signal={featured} featured />}
              <div style={{ marginTop: featured ? 20 : 0 }}>
                {rest.map(s => <SignalCard key={s.id} signal={s} />)}
              </div>
            </div>

            {/* Sidebar */}
            <div>
              {/* Waitlist / upgrade CTA */}
              <div style={{ borderTop: `2px solid ${C.gold}`, padding: "18px 0 0" }}>
                {!submitted ? (
                  <>
                    <Cap color={C.goldBright} size={10}>Early Access</Cap>
                    <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 16, fontWeight: 700, color: C.ivory, margin: "8px 0 4px" }}>
                      Request entry.
                    </p>
                    <p style={{ fontSize: 12, color: C.ivoryDim, margin: "0 0 14px", lineHeight: 1.5 }}>
                      Join the list. Free board access — no card required.
                    </p>
                    <input
                      data-testid="input-waitlist-email"
                      type="email"
                      placeholder="Email address"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && email && waitlistMutation.mutate({ email })}
                      style={{
                        width: "100%", boxSizing: "border-box",
                        background: C.shell, border: `1px solid ${C.ivoryFaint}`,
                        borderTop: `1px solid ${C.gold}40`,
                        color: C.ivory, fontSize: 12, padding: "9px 12px",
                        outline: "none", fontFamily: "inherit", marginBottom: 8,
                      }}
                    />
                    <button
                      data-testid="button-request-access"
                      onClick={() => email && waitlistMutation.mutate({ email })}
                      disabled={waitlistMutation.isPending || !email}
                      style={{
                        width: "100%", padding: "10px 0",
                        background: waitlistMutation.isPending ? C.goldDim : C.gold,
                        color: C.void, border: "none", cursor: "pointer",
                        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                        fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
                      }}
                    >
                      {waitlistMutation.isPending ? "Sending…" : "Request Access"}
                    </button>
                    {waitlistMutation.isError && (
                      <p style={{ fontSize: 11, color: C.red, marginTop: 6 }}>
                        {(waitlistMutation.error as any)?.message ?? "Something went wrong"}
                      </p>
                    )}
                  </>
                ) : (
                  <div data-testid="waitlist-success">
                    <Cap color={C.green} size={9}>Confirmed</Cap>
                    <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 15, fontWeight: 700, color: C.ivory, margin: "8px 0 6px" }}>
                      You're on the list.
                    </p>
                    <p style={{ fontSize: 12, color: C.ivoryDim, margin: "0 0 14px", lineHeight: 1.5 }}>
                      We'll send your invite when your spot opens. Check your email for a preview link.
                    </p>
                    <p style={{ fontSize: 11, color: C.ivoryDim, margin: "0 0 12px" }}>What best describes you?</p>
                    {["Sports bettor", "Fantasy player", "Content creator", "Other"].map(role => (
                      <button
                        key={role}
                        data-testid={`button-role-${role.toLowerCase().replace(/\s+/g, "-")}`}
                        onClick={() => apiRequest("POST", "/api/waitlist", { email, role: role.toLowerCase() }).catch(() => {})}
                        style={{
                          display: "block", width: "100%", marginBottom: 4,
                          padding: "7px 12px", background: "transparent",
                          border: `1px solid ${C.ivoryFaint}`, color: C.ivoryMid,
                          fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                          fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
                          textTransform: "uppercase", cursor: "pointer", textAlign: "left",
                        }}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Pro upgrade panel */}
              <div style={{ borderTop: `1px solid ${C.ivoryFaint}`, marginTop: 20, paddingTop: 18 }}>
                <Cap color={C.gold} size={9}>Pro Intelligence</Cap>
                <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, fontWeight: 900, color: C.goldBright, margin: "6px 0 2px" }}>
                  $19<span style={{ fontSize: 13, color: C.ivoryMid, fontFamily: "'Barlow Condensed'" }}>/mo</span>
                </p>
                <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 14px" }}>
                  {["Full signal feed", "Confidence scores", "Verdict detail", "Source notes", "Pro email alerts"].map(f => (
                    <li key={f} style={{ fontSize: 11, color: C.ivoryMid, marginBottom: 5, paddingLeft: 12, position: "relative" }}>
                      <span style={{ position: "absolute", left: 0, color: C.gold }}>·</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <input
                  data-testid="input-pro-email"
                  type="email"
                  placeholder="Email for Pro access"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: C.shell, border: `1px solid ${C.ivoryFaint}`,
                    color: C.ivory, fontSize: 12, padding: "9px 12px",
                    outline: "none", fontFamily: "inherit", marginBottom: 8,
                  }}
                />
                <button
                  data-testid="button-upgrade-pro"
                  onClick={handleCheckout}
                  disabled={checkoutLoading || !email}
                  style={{
                    width: "100%", padding: "11px 0",
                    background: checkoutLoading ? C.goldDim : C.gold,
                    color: C.void, border: "none", cursor: "pointer",
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
                  }}
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
