/**
 * Edge Setter — Alert Settings (Pro only)
 * Pro users configure which sports, signal types, and confidence
 * thresholds trigger email and/or push notifications.
 */

import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useLocation } from "wouter";
import V2Shell from "../components/V2Shell";
import { T } from "../components/v2/SportVisuals";

const LEAGUES      = ["NBA", "MLB", "NFL", "CFB"] as const;
const SIGNAL_TYPES = [
  { value: "injury_update",  label: "Injuries" },
  { value: "line_move",      label: "Line Moves" },
  { value: "lineup_change",  label: "Lineup Changes" },
  { value: "lineup_confirm", label: "Lineup Confirmations" },
  { value: "transaction",    label: "Transactions" },
  { value: "weather_update", label: "Weather" },
] as const;

const CONFIDENCE_OPTS = [
  { value: 70,  label: "All notable signals" },
  { value: 80,  label: "Strong signals only" },
  { value: 85,  label: "Strongest signals" },
  { value: 90,  label: "Only the strongest" },
];

interface Prefs {
  leagues:        string[];
  signal_types:   string[];
  min_confidence: number;
  channels:       string[];
  is_active:      boolean;
}

const DEFAULT_PREFS: Prefs = {
  leagues:        ["NBA", "MLB"],
  signal_types:   [],
  min_confidence: 80,
  channels:       ["email"],
  is_active:      true,
};

const ALERT_DELIVERY_PAUSED = true;

export default function AlertSettingsPage() {
  const { email, isPro, authLoading } = useAuth();
  const [, setLocation] = useLocation();

  const [prefs,       setPrefs]       = useState<Prefs>(DEFAULT_PREFS);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [pushStatus,  setPushStatus]  = useState<"idle" | "requesting" | "subscribed" | "denied">("idle");

  // Redirect non-Pro users
  useEffect(() => {
    if (!authLoading && !isPro) setLocation("/");
  }, [authLoading, isPro, setLocation]);

  // Load existing preferences
  useEffect(() => {
    if (!email || !isPro) return;
    fetch(`/api/user/alert-preferences?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(data => {
        if (data.preferences) setPrefs(data.preferences);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [email, isPro]);

  // Check existing push subscription status
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        if (sub) setPushStatus("subscribed");
      });
    }).catch(() => {});
  }, []);

  function toggleLeague(league: string) {
    setPrefs(p => ({
      ...p,
      leagues: p.leagues.includes(league)
        ? p.leagues.filter(l => l !== league)
        : [...p.leagues, league],
    }));
  }

  function toggleSignalType(type: string) {
    setPrefs(p => ({
      ...p,
      signal_types: p.signal_types.includes(type)
        ? p.signal_types.filter(t => t !== type)
        : [...p.signal_types, type],
    }));
  }

  function toggleChannel(channel: string) {
    setPrefs(p => ({
      ...p,
      channels: p.channels.includes(channel)
        ? p.channels.filter(c => c !== channel)
        : [...p.channels, channel],
    }));
  }

  async function requestPushPermission() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setError("Push notifications are not supported in this browser.");
      return;
    }
    setPushStatus("requesting");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushStatus("denied");
        return;
      }

      // Get VAPID public key
      const keyResp = await fetch("/api/alerts/vapid-public-key");
      const { publicKey } = await keyResp.json();
      if (!publicKey) {
        setError("Push notifications are not configured on this server.");
        setPushStatus("idle");
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const { endpoint, keys } = sub.toJSON() as any;
      await fetch("/api/user/push-subscription", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, endpoint, p256dh: keys.p256dh, auth: keys.auth }),
      });

      setPushStatus("subscribed");
      if (!prefs.channels.includes("push")) {
        setPrefs(p => ({ ...p, channels: [...p.channels, "push"] }));
      }
    } catch (err: any) {
      setError(err.message ?? "Failed to enable push notifications.");
      setPushStatus("idle");
    }
  }

  async function disablePush() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/user/push-subscription", {
          method:  "DELETE",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ email, endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPushStatus("idle");
      setPrefs(p => ({ ...p, channels: p.channels.filter(c => c !== "push") }));
    } catch (err: any) {
      setError(err.message ?? "Failed to disable push.");
    }
  }

  async function handleSave() {
    if (!email) return;
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch("/api/user/alert-preferences", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, ...prefs }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error ?? "Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || (isPro && loading)) {
    return (
      <V2Shell brandContext="ALERT DESK"><div style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#64748B", fontFamily: "'Arial Narrow', Arial, sans-serif", letterSpacing: "0.12em" }}>Loading…</p>
      </div></V2Shell>
    );
  }

  if (!isPro) return null;

  return (
    <V2Shell brandContext="ALERT DESK">
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 28px 60px", fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: T.gold }}>
            Pro access active
          </p>
          <h1 style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: 24, fontWeight: 800, color: T.text, lineHeight: 1.15 }}>
            Saved Alert Preferences
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: T.textMuted, lineHeight: 1.55, letterSpacing: "0.04em", maxWidth: 560 }}>
            Email delivery is not active yet. Push notifications are not active yet. Your preferences can be saved now.
          </p>
        </div>

        {/* Preference status */}
        <div style={{ background: "rgba(245,184,65,0.06)", border: "1px solid rgba(245,184,65,0.24)", borderRadius: 5, padding: "14px 18px", marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: T.gold, letterSpacing: "0.14em", textTransform: "uppercase" }}>Delivery not active</p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>
            Your preferences can be saved now.
          </p>
        </div>

        {/* Master preference toggle */}
        <div style={{ background: T.surface1, border: `1px solid ${T.border}`, borderRadius: 5, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18 }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: T.text, letterSpacing: "0.1em", textTransform: "uppercase" }}>Saved preference profile</p>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: T.textMuted, lineHeight: 1.4 }}>
              Keep your alert preferences ready for your saved sports and story thresholds.
            </p>
          </div>
          <button
            onClick={() => setPrefs(p => ({ ...p, is_active: !p.is_active }))}
            style={{
              width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
              background: prefs.is_active ? T.gold : T.surface3,
              position: "relative", transition: "background 0.2s",
            }}
          >
            <span style={{
              position: "absolute", top: 3, left: prefs.is_active ? 23 : 3,
              width: 18, height: 18, borderRadius: "50%", background: T.text,
              transition: "left 0.2s",
            }} />
          </button>
        </div>

        {/* Sports */}
        <Section title="Sports">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {LEAGUES.map(lg => (
              <Toggle
                key={lg}
                active={prefs.leagues.includes(lg)}
                onClick={() => toggleLeague(lg)}
                label={lg}
              />
            ))}
          </div>
        </Section>

        {/* Signal types */}
        <Section title="Signal Types" subtitle="Leave all unchecked to receive all types.">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {SIGNAL_TYPES.map(st => (
              <Toggle
                key={st.value}
                active={prefs.signal_types.includes(st.value)}
                onClick={() => toggleSignalType(st.value)}
                label={st.label}
              />
            ))}
          </div>
        </Section>

        {/* Signal-strength threshold */}
        <Section title="Minimum Signal Strength">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {CONFIDENCE_OPTS.map(opt => (
              <Toggle
                key={opt.value}
                active={prefs.min_confidence === opt.value}
                onClick={() => setPrefs(p => ({ ...p, min_confidence: opt.value }))}
                label={opt.label}
              />
            ))}
          </div>
        </Section>

        {/* Channels */}
        <Section title="Delivery Channels" subtitle="Choose where EdgeSetter should use your saved alert preferences.">
          {/* Email */}
          <ChannelRow
            label="Email"
            description="Email delivery is not active yet."
            active={prefs.channels.includes("email")}
            onClick={() => toggleChannel("email")}
            paused={ALERT_DELIVERY_PAUSED}
          />

          {/* Push */}
          <div style={{ marginTop: 12 }}>
            <ChannelRow
              label="Push Notifications"
              description={
                pushStatus === "subscribed" ? "Push notifications are not active yet." :
                pushStatus === "denied"     ? "Permission denied - check browser settings" :
                                              "Push notifications are not active yet."
              }
              active={prefs.channels.includes("push") && pushStatus === "subscribed"}
              onClick={() => {
                if (pushStatus === "subscribed") {
                  disablePush();
                } else {
                  requestPushPermission();
                }
              }}
              loading={pushStatus === "requesting"}
              disabled={pushStatus === "denied"}
              paused={ALERT_DELIVERY_PAUSED}
            />
          </div>
        </Section>

        {/* Error */}
        {error && (
          <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(255,82,82,0.08)", border: "1px solid rgba(255,82,82,0.26)", borderRadius: 4 }}>
            <p style={{ margin: 0, fontSize: 13, color: T.danger }}>{error}</p>
          </div>
        )}

        {/* Save */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "11px 28px", background: saving ? T.textFaint : T.gold,
              color: T.bg, border: "none", borderRadius: 3,
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12,
              fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save Settings"}
          </button>
          {saved && (
            <p style={{ margin: 0, fontSize: 13, color: T.green }}>Settings saved.</p>
          )}
        </div>

      </div>
    </V2Shell>
  );
}

/* ─── Sub-components ──────────────────────────────────────── */

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: T.surface1, border: `1px solid ${T.border}`, borderRadius: 5, padding: "20px", marginBottom: 16 }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: T.textFaint }}>
        {title}
      </p>
      {subtitle && <p style={{ margin: "0 0 12px", fontSize: 12, color: T.textMuted }}>{subtitle}</p>}
      {!subtitle && <div style={{ marginTop: 12 }} />}
      {children}
    </div>
  );
}

function Toggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px", border: `1px solid ${active ? T.gold : "rgba(255,255,255,0.08)"}`,
        background: active ? "rgba(245,184,65,0.12)" : "transparent",
        color: active ? T.gold : T.textFaint, borderRadius: 3,
        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11,
        fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
        cursor: "pointer", transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

function ChannelRow({
  label, description, active, onClick, loading = false, disabled = false, paused = false,
}: {
  label: string; description: string; active: boolean;
  onClick: () => void; loading?: boolean; disabled?: boolean; paused?: boolean;
}) {
  const isDisabled = disabled || paused;
  const shownActive = active && !paused;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderTop: `1px solid ${T.border}` }}>
      <div>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: isDisabled ? T.textFaint : T.text }}>
          {label} {paused && <span style={{ color: T.gold, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" }}>- Paused</span>}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 12, color: T.textMuted }}>{description}</p>
      </div>
      <button
        onClick={isDisabled ? undefined : onClick}
        disabled={loading || isDisabled}
        aria-label={`${label} delivery ${paused ? "paused" : shownActive ? "enabled" : "disabled"}`}
        style={{
          width: 44, height: 24, borderRadius: 12, border: "none",
          cursor: isDisabled || loading ? "not-allowed" : "pointer",
          background: shownActive ? T.gold : T.surface3,
          position: "relative", transition: "background 0.2s", flexShrink: 0, marginLeft: 16,
          opacity: isDisabled ? 0.5 : 1,
        }}
      >
        <span style={{
          position: "absolute", top: 3, left: shownActive ? 23 : 3,
          width: 18, height: 18, borderRadius: "50%", background: T.text,
          transition: "left 0.2s",
        }} />
      </button>
    </div>
  );
}

/* ─── VAPID key conversion helper ────────────────────────── */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw     = atob(base64);
  return new Uint8Array(Array.from(raw).map(c => c.charCodeAt(0)));
}
