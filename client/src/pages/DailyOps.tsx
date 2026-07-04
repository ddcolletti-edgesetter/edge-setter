/**
 * Daily Ops — Phase 2 Admin Page
 * Route: /#/daily-ops  (AdminGate-wrapped in App.tsx)
 *
 * Shows the latest daily ops summary + history list.
 * Supports manual run trigger.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import AppLayout from "../components/AppLayout";
import { type Theme } from "../App";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart2, Play, CheckCircle, AlertTriangle,
  AlertCircle, Clock, TrendingUp, ChevronDown, ChevronUp, Mail
} from "lucide-react";

interface Props { theme: Theme; toggleTheme: () => void; }

import { getAdminPassword } from "@/components/AdminGate";

const T = {
  bg:        "#050505",
  surface1:  "#0A0F1A",
  surface2:  "#101827",
  surface3:  "#101827",
  gold:      "#F5B841",
  goldDim:   "rgba(245,184,65,0.16)",
  text:      "#F8FAFC",
  textMuted: "#94A3B8",
  textFaint: "#64748B",
  green:     "#4CAF7D",
  red:       "#FF5252",
  yellow:    "#E0A830",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "ok") return <CheckCircle size={13} style={{ color: T.green }} />;
  if (status === "warning") return <AlertTriangle size={13} style={{ color: T.yellow }} />;
  if (status === "critical") return <AlertCircle size={13} style={{ color: T.red }} />;
  return <Clock size={13} style={{ color: T.textFaint }} />;
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: T.surface1, border: `1px solid ${T.goldDim}`, borderRadius: 4, marginBottom: 12 }}>
      <div style={{
        padding: "10px 16px",
        borderBottom: `1px solid ${T.goldDim}`,
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: 11, fontWeight: 700,
        letterSpacing: "0.18em", textTransform: "uppercase",
        color: T.textFaint,
      }}>
        {title}
      </div>
      <div style={{ padding: "14px 16px" }}>
        {children}
      </div>
    </div>
  );
}

function KV({ label, value, highlight }: { label: string; value: string | number | null | undefined; highlight?: string }) {
  const valStr = value === null || value === undefined ? "—" : String(value);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, gap: 12 }}>
      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: T.textFaint, letterSpacing: "0.06em", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: highlight ?? T.text, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
        {valStr}
      </span>
    </div>
  );
}

function SummaryDetail({ summary }: { summary: any }) {
  const h = summary.site_health ?? {};
  const p = summary.signal_pipeline ?? {};
  const q = summary.content_queue ?? {};
  const f = summary.funnel ?? {};
  const actions: string[] = summary.top_actions ?? [];

  const healthColor = h.critical_runs > 0 ? T.red : h.warning_runs > 0 ? T.yellow : T.green;

  return (
    <div>
      {/* Top actions */}
      {actions.length > 0 && (
        <div style={{ background: T.surface2, border: `1px solid ${T.goldDim}`, borderLeft: `3px solid ${T.gold}`, borderRadius: 4, padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.gold, marginBottom: 8 }}>
            Top 3 Actions
          </div>
          {actions.map((action, i) => (
            <div key={i} style={{ fontSize: 13, color: T.text, marginBottom: 6, lineHeight: 1.45 }}>
              {action}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Site Health */}
        <SectionCard title="Site Health">
          <KV label="Last status" value={h.last_status} highlight={healthColor} />
          <KV label="Runs (24h)" value={h.total_runs} />
          <KV label="OK / Warn / Crit" value={`${h.ok_runs ?? 0} / ${h.warning_runs ?? 0} / ${h.critical_runs ?? 0}`} />
          <KV label="Core routes healthy" value={h.core_routes_healthy ? "Yes" : "NO"} highlight={h.core_routes_healthy ? T.green : T.red} />
          {h.worst_anomaly && <KV label="Worst anomaly" value={h.worst_anomaly} highlight={T.yellow} />}
          <KV label="Last run" value={h.last_run_at ? new Date(h.last_run_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "N/A"} />
        </SectionCard>

        {/* Signal Pipeline */}
        <SectionCard title="Signal Pipeline (24h)">
          <KV label="Total ingested" value={p.total_ingested} />
          <KV label="Auto-published" value={p.auto_published} highlight={p.auto_published > 0 ? T.green : undefined} />
          <KV label="Review required" value={p.review_required} highlight={p.review_required > 0 ? T.yellow : undefined} />
          <KV label="Rejected" value={p.rejected} />
          <KV label="Pending" value={p.pending} />
          <KV label="Last signal at" value={p.last_signal_at ? new Date(p.last_signal_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "N/A"} />
        </SectionCard>

        {/* Content Queue */}
        <SectionCard title="Content Queue">
          <KV label="Pending review" value={q.pending_review} highlight={q.pending_review > 0 ? T.yellow : undefined} />
          <KV label="Oldest pending" value={q.oldest_pending_at ? new Date(q.oldest_pending_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "None"} />
          <KV label="Total live signals" value={q.total_signals} />
          <KV label="Drafts pending" value={q.distribution_drafts_pending} highlight={q.distribution_drafts_pending > 0 ? T.yellow : undefined} />
          <KV label="Drafts approved" value={q.distribution_drafts_approved} highlight={q.distribution_drafts_approved > 0 ? T.green : undefined} />
          <KV label="Drafts rejected" value={q.distribution_drafts_rejected} />
        </SectionCard>

        {/* Funnel */}
        <SectionCard title="Funnel / Traffic">
          <div style={{ marginBottom: 8 }}>
            <span style={{
              padding: "3px 8px",
              borderRadius: 2,
              background: f.plausible_status === "ok" ? "rgba(76,175,125,0.12)" : "rgba(224,168,48,0.12)",
              color: f.plausible_status === "ok" ? T.green : T.yellow,
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
            }}>
              Plausible: {f.plausible_status}
            </span>
          </div>
          {f.plausible_status === "not_configured" ? (
            <div style={{ fontSize: 12, color: T.textFaint, lineHeight: 1.5 }}>{f.funnel_notes}</div>
          ) : (
            <>
              <KV label="Landing visits" value={f.landing_visits} />
              <KV label="Signals visits" value={f.signals_visits} />
              <KV label="Paywall opens" value={f.paywall_opens} />
              <KV label="Checkout clicks" value={f.checkout_clicks} />
              <KV label="Success loads" value={f.success_page_loads} />
            </>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

export default function DailyOps({ theme, toggleTheme }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Latest summary
  const { data: latest, isLoading: latestLoading } = useQuery<any>({
    queryKey: ["/api/agent/daily-ops/latest"],
    queryFn: () => apiRequest("GET", "/api/agent/daily-ops/latest?password=" + encodeURIComponent(getAdminPassword())).then(r => r.json()),
    refetchInterval: 60000,
    retry: false,
  });

  // History
  const { data: history = [], isLoading: historyLoading } = useQuery<any[]>({
    queryKey: ["/api/agent/daily-ops"],
    queryFn: () => apiRequest("GET", "/api/agent/daily-ops?password=" + encodeURIComponent(getAdminPassword()) + "&limit=30").then(r => r.json()),
    refetchInterval: 60000,
  });

  // Manual run
  const runMutation = useMutation({
    mutationFn: (sendEmail: boolean) =>
      apiRequest("POST", "/api/agent/daily-ops/run", { password: getAdminPassword(), send_email: sendEmail }).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: "Daily Ops Run Complete", description: `Generated for ${data.date}. Email: ${data.email_sent ? "sent" : "skipped"}.` });
      qc.invalidateQueries({ queryKey: ["/api/agent/daily-ops"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const displaySummary = selectedId
    ? (history as any[]).find(s => s.id === selectedId) ?? latest
    : latest;

  const healthColor = (s: any) => {
    const h = s?.site_health ?? {};
    if (h.critical_runs > 0) return T.red;
    if (h.warning_runs > 0) return T.yellow;
    return T.green;
  };

  return (
    <AppLayout theme={theme} toggleTheme={toggleTheme} opsMode={true}>
      <div style={{ padding: "28px 32px", maxWidth: 1100 }} data-testid="daily-ops-page">

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <BarChart2 size={16} style={{ color: T.gold }} />
              <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, fontWeight: 700, color: T.text, margin: 0 }}>
                Daily Product Ops
              </h1>
            </div>
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: T.textFaint, letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>
              Phase 2 Agent · 06:00 UTC daily · Manual trigger available
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              data-testid="button-run-daily-ops-no-email"
              onClick={() => runMutation.mutate(false)}
              disabled={runMutation.isPending}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 14px",
                background: T.surface2, color: T.textMuted,
                border: `1px solid ${T.goldDim}`, borderRadius: 3, cursor: "pointer",
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                opacity: runMutation.isPending ? 0.6 : 1,
              }}
            >
              <Play size={11} /> Run (no email)
            </button>
            <button
              data-testid="button-run-daily-ops-with-email"
              onClick={() => runMutation.mutate(true)}
              disabled={runMutation.isPending}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 14px",
                background: T.gold, color: T.bg,
                border: "none", borderRadius: 3, cursor: "pointer",
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                opacity: runMutation.isPending ? 0.6 : 1,
              }}
            >
              <Mail size={11} /> Run + Email
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16 }}>
          {/* History sidebar */}
          <div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8, paddingLeft: 4 }}>
              History
            </div>
            {historyLoading ? (
              <div style={{ color: T.textFaint, fontSize: 12 }}>Loading…</div>
            ) : (history as any[]).length === 0 ? (
              <div style={{ color: T.textFaint, fontSize: 12 }}>No runs yet</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {(history as any[]).map((s: any) => {
                  const isSel = selectedId === s.id || (!selectedId && s.id === (latest as any)?.id);
                  return (
                    <button
                      key={s.id}
                      data-testid={`history-${s.id}`}
                      onClick={() => setSelectedId(s.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 10px",
                        background: isSel ? "rgba(245,184,65,0.10)" : "transparent",
                        border: `1px solid ${isSel ? "rgba(245,184,65,0.3)" : T.goldDim}`,
                        borderRadius: 3, cursor: "pointer", textAlign: "left",
                        borderLeft: `3px solid ${healthColor(s)}`,
                      }}
                    >
                      <StatusIcon status={s.site_health?.last_status ?? "no_data"} />
                      <div>
                        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, color: T.text }}>
                          {s.date}
                        </div>
                        <div style={{ fontSize: 10, color: T.textFaint }}>
                          {s.signal_pipeline?.total_ingested ?? 0} ingested · {s.content_queue?.pending_review ?? 0} pending
                        </div>
                      </div>
                      {s.email_sent ? <Mail size={10} style={{ color: T.textFaint, marginLeft: "auto" }} /> : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Main content */}
          <div>
            {latestLoading ? (
              <div style={{ color: T.textFaint, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13 }}>Loading latest summary…</div>
            ) : !displaySummary || displaySummary?.error ? (
              <div style={{ background: T.surface1, border: `1px solid ${T.goldDim}`, borderRadius: 4, padding: 32, textAlign: "center" }}>
                <BarChart2 size={24} style={{ color: T.textFaint, marginBottom: 8 }} />
                <div style={{ color: T.textMuted, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, letterSpacing: "0.08em" }}>
                  No daily ops summary yet. Click "Run + Email" to generate the first one.
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <StatusIcon status={displaySummary.site_health?.last_status ?? "no_data"} />
                  <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 16, fontWeight: 700, color: T.text }}>
                    {displaySummary.date}
                  </span>
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textFaint, marginLeft: 4 }}>
                    Generated {new Date(displaySummary.generated_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </span>
                  {displaySummary.email_sent && (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 8px", background: "rgba(76,175,125,0.12)", color: T.green, borderRadius: 2, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                      <Mail size={9} /> Email Sent
                    </span>
                  )}
                </div>
                <SummaryDetail summary={displaySummary} />
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
