/**
 * Edge Setter — Ops Dashboard (/admin/ops)
 * Owner-only. Auto-refreshes every 60 seconds.
 * Shows pipeline health, signal volume, subscriber KPIs,
 * source accuracy, and a plain-English action log.
 */

import { useState, useEffect, useCallback } from "react";

const ADMIN_PASS = "edgesetter-admin-2026";
const REFRESH_INTERVAL = 60_000;

/* ─── Types ──────────────────────────────────────────────── */

interface PipelineHealth {
  component:   string;
  last_run_at: string | null;
  last_status: string | null;
  last_result: Record<string, any>;
}

interface OpsData {
  pipeline_health: PipelineHealth[];
  signal_volume:   Array<{ league: string; count: number }>;
  subscribers:     { active: number; mrr: number; beta: number };
  alerts_today:    number;
  source_accuracy: Array<{
    id: string; league: string; signal_type: string | null; source_type: string | null;
    total_signals: number; wins: number; losses: number; hit_rate: number; avg_clv: number | null;
  }>;
  action_log: Array<{ timestamp: string; component: string; message: string; severity: string }>;
}

/* ─── Helpers ────────────────────────────────────────────── */

function ageName(iso: string | null): string {
  if (!iso) return "never";
  const mins = (Date.now() - new Date(iso).getTime()) / 60000;
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${Math.round(mins)}m ago`;
  const hrs = mins / 60;
  if (hrs < 24)   return `${Math.round(hrs)}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function statusColor(s: "green" | "yellow" | "red" | "grey"): string {
  return { green: "#3DAE72", yellow: "#D4932A", red: "#D94B4B", grey: "#5A5448" }[s];
}

function statusLabel(s: "green" | "yellow" | "red" | "grey"): string {
  return { green: "Healthy", yellow: "Degraded", red: "Down", grey: "Idle" }[s];
}

function isActiveHours(): boolean {
  const h = new Date().getUTCHours();
  return h >= 12 || h <= 6;
}

function getHealthStatus(h: PipelineHealth | undefined): "green" | "yellow" | "red" | "grey" {
  if (!h || !h.last_run_at) return "grey";
  if (h.last_status === "error") return "red";
  const ageMin = (Date.now() - new Date(h.last_run_at).getTime()) / 60000;
  if (h.last_status === "warning" || ageMin >= 20) {
    if (ageMin >= 60) return isActiveHours() ? "red" : "grey";
    return "yellow";
  }
  return "green";
}

function severityColor(s: string): string {
  if (s === "error")   return "#D94B4B";
  if (s === "warning") return "#D4932A";
  return "#7E776A";
}

function fmt(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
    " " + d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/* ─── Sub-components ─────────────────────────────────────── */

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 120, background: "#111317", border: "1px solid #1B1F25",
      borderRadius: 3, padding: "16px 20px",
    }}>
      <p style={{ margin: "0 0 4px", fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#7E776A" }}>{label}</p>
      <p style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 28, fontWeight: 900, color: "#F3EFE6", lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ margin: "4px 0 0", fontSize: 11, color: "#5A5448" }}>{sub}</p>}
    </div>
  );
}

function AgentCard({ name, health }: { name: string; health: PipelineHealth | undefined }) {
  const status = getHealthStatus(health);
  const color  = statusColor(status);
  const result = health?.last_result ?? {};
  const detail = health?.last_run_at ? ageName(health.last_run_at) : "no data";

  return (
    <div style={{
      flex: 1, minWidth: 140, background: "#111317", border: `1px solid ${color}30`,
      borderRadius: 3, padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#F3EFE6" }}>{name}</p>
      </div>
      <p style={{ margin: "0 0 2px", fontSize: 11, color: color, fontWeight: 700 }}>{statusLabel(status)}</p>
      <p style={{ margin: 0, fontSize: 11, color: "#5A5448" }}>{detail}</p>
      {result.processed !== undefined && (
        <p style={{ margin: "4px 0 0", fontSize: 10, color: "#7E776A" }}>{result.processed} signals processed</p>
      )}
      {result.dispatched !== undefined && (
        <p style={{ margin: "4px 0 0", fontSize: 10, color: "#7E776A" }}>{result.dispatched} dispatched → {result.users_notified} users</p>
      )}
      {result.signals_settled !== undefined && (
        <p style={{ margin: "4px 0 0", fontSize: 10, color: "#7E776A" }}>{result.signals_settled} outcomes settled</p>
      )}
      {result.elapsed_ms !== undefined && (
        <p style={{ margin: "4px 0 0", fontSize: 10, color: "#7E776A" }}>{(result.elapsed_ms / 1000).toFixed(1)}s cycle</p>
      )}
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────── */

export default function OpsBoard() {
  const [data,        setData]        = useState<OpsData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown,   setCountdown]   = useState(REFRESH_INTERVAL / 1000);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/ops-dashboard", {
        headers: { Authorization: `Bearer ${ADMIN_PASS}` },
      });
      if (!resp.ok) throw new Error(`${resp.status}`);
      setData(await resp.json());
      setLastUpdated(new Date());
      setCountdown(REFRESH_INTERVAL / 1000);
    } catch (e: any) {
      setError(e.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(load, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [load]);

  // Countdown ticker
  useEffect(() => {
    const tick = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(tick);
  }, []);

  const healthByComponent = new Map(
    (data?.pipeline_health ?? []).map(h => [h.component, h])
  );

  const maxSignals = Math.max(1, ...(data?.signal_volume ?? []).map(v => v.count));

  return (
    <div style={{ minHeight: "100vh", background: "#0A0B0D", padding: "32px 24px", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* ── Header ───────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "#CAA85A" }}>Owner Only</p>
            <h1 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 900, color: "#F3EFE6", lineHeight: 1.1 }}>Ops Dashboard</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {lastUpdated && (
              <p style={{ margin: 0, fontSize: 11, color: "#5A5448" }}>
                Updated {fmtTime(lastUpdated.toISOString())} · refresh in {countdown}s
              </p>
            )}
            <button
              onClick={load}
              disabled={loading}
              style={{
                padding: "7px 16px", background: loading ? "#1B1F25" : "#1B1F25",
                border: "1px solid #2A2620", borderRadius: 2, cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "'Arial Narrow', Arial, sans-serif", fontSize: 10,
                fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
                color: loading ? "#5A5448" : "#CAA85A",
              }}
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: 20, padding: "10px 16px", background: "#1A0F0F", border: "1px solid #4A2020", borderRadius: 3 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#D94B4B" }}>Error: {error}</p>
          </div>
        )}

        {data && <>

          {/* ── KPI Strip ────────────────────────────────────── */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <KpiCard label="Active Pro" value={data.subscribers.active} sub={`${data.subscribers.beta} on beta comp`} />
            <KpiCard label="MRR" value={fmt(data.subscribers.mrr)} sub="Stripe actives only" />
            <KpiCard label="Signals Today" value={data.signal_volume.reduce((s, v) => s + v.count, 0)} sub="last 24 hours" />
            <KpiCard label="Alerts Sent" value={data.alerts_today} sub="last 24 hours" />
          </div>

          {/* ── Agent Health ──────────────────────────────────── */}
          <Section title="Agent Health">
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <AgentCard name="Ingestion"  health={healthByComponent.get("ingestion")} />
              <AgentCard name="Processor"  health={healthByComponent.get("ingestion")} />
              <AgentCard name="Alerts"     health={healthByComponent.get("alerts")} />
              <AgentCard name="Settlement" health={healthByComponent.get("settlement")} />
            </div>
          </Section>

          {/* ── Two-column: Volume + Sources ──────────────────── */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>

            {/* Signal Volume */}
            <div style={{ flex: "1 1 300px", background: "#111317", border: "1px solid #1B1F25", borderRadius: 3, padding: 20 }}>
              <p style={{ margin: "0 0 16px", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#7E776A" }}>Signal Volume — Last 24h</p>
              {data.signal_volume.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: "#5A5448" }}>No signals yet.</p>
              ) : data.signal_volume.map(v => (
                <div key={v.league} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#F3EFE6" }}>{v.league}</span>
                    <span style={{ fontSize: 11, color: "#CAA85A", fontWeight: 700 }}>{v.count}</span>
                  </div>
                  <div style={{ height: 4, background: "#1B1F25", borderRadius: 2 }}>
                    <div style={{ height: 4, borderRadius: 2, background: "#CAA85A", width: `${(v.count / maxSignals) * 100}%`, transition: "width 0.3s" }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Source Accuracy */}
            <div style={{ flex: "1 1 300px", background: "#111317", border: "1px solid #1B1F25", borderRadius: 3, padding: 20 }}>
              <p style={{ margin: "0 0 16px", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#7E776A" }}>Source Accuracy</p>
              {data.source_accuracy.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: "#5A5448" }}>No settled outcomes yet.</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["League", "Type", "Signals", "Hit Rate"].map(h => (
                        <th key={h} style={{ padding: "0 8px 8px 0", textAlign: "left", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#5A5448" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.source_accuracy.slice(0, 8).map(row => {
                      const hr   = Math.round((row.hit_rate ?? 0) * 100);
                      const hrColor = hr >= 60 ? "#3DAE72" : hr >= 45 ? "#CAA85A" : "#D94B4B";
                      return (
                        <tr key={row.id} style={{ borderTop: "1px solid #1B1F25" }}>
                          <td style={{ padding: "7px 8px 7px 0", fontSize: 11, color: "#B7AFA0" }}>{row.league}</td>
                          <td style={{ padding: "7px 8px 7px 0", fontSize: 11, color: "#7E776A" }}>{row.signal_type ?? "All"}</td>
                          <td style={{ padding: "7px 8px 7px 0", fontSize: 11, color: "#7E776A" }}>{row.total_signals}</td>
                          <td style={{ padding: "7px 0 7px 0", fontSize: 12, fontWeight: 700, color: hrColor }}>{hr}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

          </div>

          {/* ── Action Log ────────────────────────────────────── */}
          <Section title="Action Log">
            {data.action_log.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: "#5A5448" }}>No anomalies or warnings recorded.</p>
            ) : (
              <div>
                {data.action_log.map((entry, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex", gap: 12, padding: "10px 0",
                      borderTop: i > 0 ? "1px solid #1B1F25" : undefined,
                      alignItems: "flex-start",
                    }}
                  >
                    <span style={{
                      marginTop: 2, width: 6, height: 6, borderRadius: "50%",
                      background: severityColor(entry.severity), flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: "0 0 2px", fontSize: 12, color: "#F3EFE6", lineHeight: 1.5 }}>{entry.message}</p>
                      <p style={{ margin: 0, fontSize: 10, color: "#5A5448" }}>
                        {entry.component} · {fmtTime(entry.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

        </>}

        {loading && !data && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 12, color: "#7E776A", letterSpacing: "0.12em" }}>Loading…</p>
          </div>
        )}

      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#111317", border: "1px solid #1B1F25", borderRadius: 3, padding: 20, marginBottom: 16 }}>
      <p style={{ margin: "0 0 16px", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#7E776A" }}>{title}</p>
      {children}
    </div>
  );
}
