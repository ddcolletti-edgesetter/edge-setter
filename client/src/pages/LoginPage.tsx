import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { CheckCircle2 } from "lucide-react";

const C = {
  bg: "#050505",
  surface1: "#0A0F1A",
  surface2: "#101827",
  gold: "#F5B841",
  text: "#F8FAFC",
  textMuted: "#94A3B8",
  textFaint: "#64748B",
  green: "#18D47B",
  red: "#C04040",
};

export default function LoginPage() {
  const { email: authEmail, isPro, login, authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState(authEmail ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authEmail) setEmail(e => e || authEmail);
  }, [authEmail]);

  useEffect(() => {
    if (!authLoading && isPro) setLocation("/");
  }, [authLoading, isPro, setLocation]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const result = await login(email);
    setSubmitting(false);
    if (result) {
      setError(result);
      return;
    }
    setLocation("/");
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #071019 0%, #050505 70%)",
      color: C.text,
      display: "grid",
      placeItems: "center",
      padding: "32px 16px",
    }}>
      <main style={{ width: "min(100%, 520px)" }}>
        <Link href="/">
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 28 }}>
            <img src="/brand/edgesetter-emblem.png" alt="" style={{ width: 34, height: 34, objectFit: "contain" }} />
            <span style={{ fontFamily: "'Satoshi','Inter',system-ui,sans-serif", fontSize: 15, fontWeight: 800 }}>
              Edge Setter
            </span>
          </div>
        </Link>

        <section style={{
          background: "rgba(10,20,32,0.82)",
          border: "1px solid rgba(82,101,122,0.28)",
          borderTop: `3px solid ${C.gold}`,
          borderRadius: 8,
          padding: "30px 28px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.34)",
        }}>
          <div style={{
            fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: C.gold,
            marginBottom: 12,
          }}>
            Already a subscriber?
          </div>
          <h1 style={{
            fontFamily: "'Playfair Display',Georgia,serif",
            fontSize: "clamp(2rem, 7vw, 3rem)",
            lineHeight: 1,
            margin: "0 0 12px",
            letterSpacing: "-0.01em",
          }}>
            Sign in to restore access
          </h1>
          <p style={{ color: C.textMuted, fontSize: 16, lineHeight: 1.6, margin: "0 0 24px" }}>
            Enter the email tied to your Pro subscription. This verifies your existing account and returns you to the app.
          </p>

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
            <input
              data-testid="input-login-email"
              type="email"
              placeholder="Subscriber email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              style={{
                background: C.surface2,
                border: "1px solid rgba(248,250,252,0.12)",
                borderRadius: 4,
                color: C.text,
                fontSize: 16,
                padding: "13px 14px",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <button
              data-testid="button-login-submit"
              type="submit"
              disabled={submitting || !email.trim()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                minHeight: 44,
                background: C.gold,
                color: C.bg,
                border: "none",
                borderRadius: 4,
                cursor: submitting || !email.trim() ? "default" : "pointer",
                fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif",
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                opacity: submitting || !email.trim() ? 0.72 : 1,
              }}
            >
              <CheckCircle2 size={15} />
              {submitting ? "Checking" : "Sign In"}
            </button>
          </form>

          {error && (
            <p role="alert" style={{ color: C.red, fontSize: 14, lineHeight: 1.5, margin: "12px 0 0" }}>
              {error}
            </p>
          )}

          <div style={{ height: 1, background: "rgba(248,250,252,0.08)", margin: "24px 0 18px" }} />
          <p style={{ color: C.textFaint, fontSize: 14, lineHeight: 1.5, margin: 0 }}>
            Not subscribed yet? <Link href="/pro"><span style={{ color: C.gold, cursor: "pointer", fontWeight: 700 }}>Get Pro</span></Link>.
          </p>
        </section>
      </main>
    </div>
  );
}
