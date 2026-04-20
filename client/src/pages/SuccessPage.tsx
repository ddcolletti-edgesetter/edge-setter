/**
 * /success — Post-Stripe payment confirmation
 * Reads session_id + email from query params, verifies with backend,
 * marks user as pro, logs the event.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

const C = {
  void: "#080706", shell: "#0C0A08",
  gold: "#C9A84C", goldBright: "#E2BE6A", goldDim: "#6A5218",
  ivory: "#F0E8D6", ivoryMid: "#B8AD98", ivoryDim: "#6E6458", ivoryFaint: "#242018",
  green: "#3DAE72",
};

function Cap({ children, color, size = 9 }: { children: React.ReactNode; color?: string; size?: number }) {
  return <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: size, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: color ?? C.ivoryDim }}>{children}</span>;
}

export default function SuccessPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const hash = window.location.hash; // e.g. #/success?session_id=xxx&email=yyy
    const queryStr = hash.includes("?") ? hash.split("?")[1] : "";
    const params = new URLSearchParams(queryStr);
    const session_id = params.get("session_id");
    const emailParam = params.get("email") ?? "";
    setEmail(emailParam);

    // Log the page view immediately
    apiRequest("POST", "/api/events/log", { event_name: "success_page_view", email: emailParam }).catch(() => {});

    if (!session_id) {
      setStatus("error");
      return;
    }

    apiRequest("POST", "/api/verify-subscription", { session_id, email: emailParam })
      .then(r => r.json())
      .then(data => {
        setStatus(data.success ? "success" : "error");
      })
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: C.void, display: "flex", flexDirection: "column" }}>
      {/* Nav */}
      <div style={{ background: C.shell, borderBottom: `1px solid ${C.gold}30`, padding: "0 20px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", height: 48, display: "flex", alignItems: "center" }}>
          <Link href="/"><a style={{ textDecoration: "none" }}>
            <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: C.ivory }}>EDGE SETTER<span style={{ color: C.gold }}>.</span></span>
          </a></Link>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
        {status === "loading" && (
          <div style={{ textAlign: "center" }}>
            <Cap color={C.ivoryDim}>Confirming your subscription…</Cap>
          </div>
        )}

        {status === "success" && (
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            {/* Gold top accent */}
            <div style={{ width: 40, height: 2, background: C.gold, margin: "0 auto 20px" }} />
            <Cap color={C.green} size={10}>Pro Access Active</Cap>
            <p style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 32, fontWeight: 900, color: C.ivory,
              margin: "12px 0 8px", lineHeight: 1.1,
            }}>
              Welcome to Pro.
            </p>
            {email && (
              <p style={{ fontSize: 12, color: C.ivoryDim, margin: "0 0 8px" }}>
                Confirmation sent to <span style={{ color: C.ivoryMid }}>{email}</span>
              </p>
            )}
            <p style={{ fontSize: 13, color: C.ivoryDim, margin: "0 0 28px", lineHeight: 1.6 }}>
              Your Pro access is active at $19/month. Full signal feed, confidence scores, source notes, and verdict detail.
            </p>
            <Link href="/pro">
              <a
                data-testid="button-open-pro-board"
                style={{
                  display: "inline-block", padding: "12px 28px",
                  background: C.gold, color: C.void, textDecoration: "none",
                  fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
                }}
              >
                Open Pro Signal Board →
              </a>
            </Link>
            <div style={{ marginTop: 24 }}>
              <Link href="/signals">
                <a style={{ fontSize: 11, color: C.ivoryDim, textDecoration: "none", fontFamily: "'Barlow Condensed',Arial,sans-serif", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  Back to public board
                </a>
              </Link>
            </div>
          </div>
        )}

        {status === "error" && (
          <div style={{ maxWidth: 440, textAlign: "center" }}>
            <Cap color={C.gold} size={10}>Payment Complete</Cap>
            <p style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 24, fontWeight: 700, color: C.ivory, margin: "12px 0 8px" }}>
              Access is being set up.
            </p>
            <p style={{ fontSize: 13, color: C.ivoryDim, margin: "0 0 24px", lineHeight: 1.6 }}>
              Your payment went through. If Pro access isn't active yet, try entering your email on the Pro board — it updates automatically within a minute.
            </p>
            <Link href="/pro">
              <a style={{ display: "inline-block", padding: "11px 24px", background: C.gold, color: C.void, textDecoration: "none", fontFamily: "'Barlow Condensed',Arial,sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase" }}>
                Try Pro Board →
              </a>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
