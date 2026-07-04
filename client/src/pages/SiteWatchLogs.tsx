import { useQuery } from "@tanstack/react-query";
import AppLayout from "../components/AppLayout";
import { type Theme } from "../App";
import { Radio } from "lucide-react";

interface Props { theme: Theme; toggleTheme: () => void; }

import { getAdminPassword } from "@/components/AdminGate";

const T = {
  bg:       "#050505",
  surface1: "#0A0F1A",
  surface2: "#101827",
  surface3: "#101827",
  gold:     "#F5B841",
  goldDim:  "rgba(245,184,65,0.18)",
  text:     "#F8FAFC",
  muted:    "#94A3B8",
  faint:    "#64748B",
  green:    "#3DAE72",
  amber:    "#FF8A00",
  red:      "#FF5252",
};

function statusColor(s: string) {
  if (s === "ok")       return T.green;
  if (s === "warning")  return T.amber;
  if (s === "critical") return T.red;
  return T.faint;
}

function statusDot(s: string) {
  return <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: statusColor(s), marginRight: 6, flexShrink: 0 }} />;
}

export default function SiteWatchLogs({ theme, toggleTheme }: Props) {
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["/api/agent/site-watch"],
    queryFn: async () => {
      const r = await fetch(`/api/agent/site-watch?password=${encodeURIComponent(getAdminPassword())}&limit=50`);
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<Record<string, any>[]>;
    },
    refetchInterval: 30_000,
  });

  const runs = data ?? [];

  return (
    <AppLayout theme={theme} toggleTheme={toggleTheme} opsMode={true}>
      <div style={{ padding: "24px 24px 56px", maxWidth: 960, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: "'Barlow Condensed',Arial,sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: T.gold, margin: "0 0 8px" }}>
            Site Watch · Phase 1
          </p>
          <h1 style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 22, fontWeight: 900, color: T.text, margin: "0 0 4px", letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: 10 }}>
            <Radio size={18} style={{ color: T.gold }} />
            Site Watch Logs
          </h1>
          <p style={{ fontSize: 12, color: T.faint, margin: 0 }}>
            Production health checks — runs every 5 minutes automatically.
            {dataUpdatedAt ? ` Last fetched ${new Date(dataUpdatedAt).toLocaleTimeString()}.` : ""}
          </p>
        </div>

        <div style={{ height: 1, background: T.goldDim, marginBottom: 24 }} />

        {/* Summary strip */}
        {runs.length > 0 && (() => {
          const latest = runs[0];
          const okCount      = runs.filter(r => r.status === "ok").length;
          const warnCount    = runs.filter(r => r.status === "warning").length;
          const critCount    = runs.filter(r => r.status === "critical").length;
          return (
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
              {[
                { label: "Total Runs", value: runs.length, color: T.muted },
                { label: "OK",         value: okCount,    color: T.green },
                { label: "Warning",    value: warnCount,  color: T.amber },
                { label: "Critical",   value: critCount,  color: T.red   },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: T.surface1, border: `1px solid ${T.surface3}`, borderRadius: 3, padding: "10px 18px", minWidth: 90 }}>
                  <p style={{ fontFamily: "Georgia,serif", fontSize: 22, fontWeight: 900, color, margin: "0 0 2px", lineHeight: 1 }}>{value}</p>
                  <p style={{ fontFamily: "'Barlow Condensed',Arial,sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.faint, margin: 0 }}>{label}</p>
                </div>
              ))}
              <div style={{ background: T.surface1, border: `1px solid ${T.surface3}`, borderRadius: 3, padding: "10px 18px", flex: 1, minWidth: 180 }}>
                <p style={{ fontSize: 11, color: T.muted, margin: "0 0 2px" }}>Latest run: <span style={{ color: statusColor(latest.status), fontWeight: 700 }}>{latest.status?.toUpperCase()}</span></p>
                <p style={{ fontSize: 11, color: T.faint, margin: 0 }}>{new Date(latest.run_timestamp).toLocaleString()}</p>
                {latest.recommended_action && (
                  <p style={{ fontSize: 11, color: T.muted, margin: "4px 0 0", lineHeight: 1.4 }}>{latest.recommended_action}</p>
                )}
              </div>
            </div>
          );
        })()}

        {isLoading && (
          <div style={{ color: T.faint, fontSize: 12, padding: 32, textAlign: "center" }}>Loading…</div>
        )}

        {!isLoading && runs.length === 0 && (
          <div style={{ background: T.surface1, border: `1px solid ${T.surface3}`, borderRadius: 3, padding: 32, textAlign: "center" }}>
            <p style={{ color: T.muted, fontSize: 13, margin: 0 }}>No Site Watch runs yet. The scheduler fires 30 seconds after server startup, then every 5 minutes.</p>
          </div>
        )}

        {/* Log table */}
        {runs.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {runs.map((run) => {
              const checks: any[]   = Array.isArray(run.checks)   ? run.checks   : [];
              const anomalies: any[] = Array.isArray(run.anomalies) ? run.anomalies : [];
              const hasIssues = run.status !== "ok" || anomalies.length > 0;

              return (
                <div key={run.id} style={{ background: T.surface1, border: `1px solid ${hasIssues ? statusColor(run.status) + "40" : T.surface3}`, borderRadius: 3, overflow: "hidden" }}>

                  {/* Row header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: `1px solid ${T.surface3}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      {statusDot(run.status)}
                      <span style={{ fontFamily: "'Barlow Condensed',Arial,sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: statusColor(run.status) }}>
                        {run.status}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: T.faint }}>
                      {new Date(run.run_timestamp).toLocaleString()}
                    </span>
                    {run.alert_sent === 1 && (
                      <span style={{ marginLeft: "auto", fontFamily: "'Barlow Condensed'", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.amber, padding: "2px 8px", background: "rgba(212,147,42,0.12)", border: "1px solid rgba(212,147,42,0.30)", borderRadius: 2 }}>
                        Alert Sent
                      </span>
                    )}
                  </div>

                  {/* Checks grid */}
                  <div style={{ padding: "10px 16px", display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {checks.map((c, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, background: T.surface2, border: `1px solid ${c.status !== "ok" ? statusColor(c.status) + "50" : T.surface3}`, borderRadius: 2, padding: "4px 10px" }}>
                        {statusDot(c.status)}
                        <span style={{ fontSize: 11, color: c.status !== "ok" ? statusColor(c.status) : T.muted }}>{c.name}</span>
                        <span style={{ fontSize: 10, color: T.faint }}>· {c.detail}</span>
                      </div>
                    ))}
                  </div>

                  {/* Anomalies */}
                  {anomalies.length > 0 && (
                    <div style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                      {anomalies.map((a, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, background: a.severity === "critical" ? "rgba(255,82,82,0.08)" : "rgba(212,147,42,0.08)", border: `1px solid ${a.severity === "critical" ? "rgba(255,82,82,0.30)" : "rgba(212,147,42,0.30)"}`, borderRadius: 2, padding: "6px 10px" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: a.severity === "critical" ? T.red : T.amber, textTransform: "uppercase", letterSpacing: "0.10em", flexShrink: 0, marginTop: 1 }}>
                            ⚠ {a.severity}
                          </span>
                          <span style={{ fontSize: 11, color: T.muted, lineHeight: 1.4 }}>{a.type}: {a.detail}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Recommended action — only if non-ok */}
                  {run.status !== "ok" && run.recommended_action && (
                    <div style={{ padding: "0 16px 12px" }}>
                      <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>
                        <span style={{ color: T.faint, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.10em" }}>Action: </span>
                        {run.recommended_action}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
