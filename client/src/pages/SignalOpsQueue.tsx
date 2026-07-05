/**
 * Signal Ops Queue — Admin review page for review_required signals.
 * Route: /#/signal-ops-queue (gated by AdminGate)
 *
 * Shows:
 *   - Summary stats (pending / auto-published / rejected)
 *   - Review queue table — approve or reject each item
 *   - Color-coded confidence scores and decisions
 *   - Reason column for full auditability
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AppLayout from "../components/AppLayout";
import { type Theme } from "../App";
import { Shield, CheckCircle, XCircle, Clock, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props { theme: Theme; toggleTheme: () => void; }

import { adminAuthHeaders } from "@/components/AdminGate";

const T = {
  bg:          "#050505",
  surface1:    "#0A0F1A",
  surface2:    "#101827",
  surface3:    "#101827",
  gold:        "#F5B841",
  goldDim:     "rgba(245,184,65,0.20)",
  text:        "#F8FAFC",
  textMuted:   "#94A3B8",
  textFaint:   "#64748B",
  green:       "#3DAE72",
  red:         "#FF5252",
  amber:       "#FF8A00",
};

function confColor(score: number) {
  if (score >= 80) return T.green;
  if (score >= 60) return T.gold;
  return T.red;
}

function decisionColor(decision: string) {
  if (decision === "auto_publish" || decision === "published") return T.green;
  if (decision === "review_required") return T.amber;
  if (decision === "reject") return T.red;
  return T.textFaint;
}

function decisionLabel(decision: string) {
  if (decision === "auto_publish") return "Auto-Published";
  if (decision === "published")   return "Published";
  if (decision === "review_required") return "Review Required";
  if (decision === "reject")      return "Rejected";
  return decision;
}

async function apiPost(path: string, body: object) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiGet(path: string) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function SignalOpsQueue({ theme, toggleTheme }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"review_required" | "auto_publish" | "reject" | "all">("review_required");
  const [ingestInput, setIngestInput] = useState("");
  const [ingestLoading, setIngestLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/agent/signal-ops/queue", tab],
    queryFn: async () => {
      const decision = tab === "all" ? "" : tab;
      const res = await fetch(`/api/agent/signal-ops/queue${decision ? `?decision=${decision}` : ""}`, { headers: adminAuthHeaders() });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: 15000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/api/agent/signal-ops/queue/${id}/approve`, {}),
    onSuccess: () => {
      toast({ title: "Approved", description: "Signal published to live feed." });
      qc.invalidateQueries({ queryKey: ["/api/agent/signal-ops/queue"] });
      qc.invalidateQueries({ queryKey: ["/api/signals"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiPost(`/api/agent/signal-ops/queue/${id}/reject`, { reason }),
    onSuccess: () => {
      toast({ title: "Rejected", description: "Item removed from queue." });
      qc.invalidateQueries({ queryKey: ["/api/agent/signal-ops/queue"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleIngest = async () => {
    let parsed: any;
    try { parsed = JSON.parse(ingestInput); } catch (_) {
      toast({ title: "Invalid JSON", description: "Input must be valid JSON", variant: "destructive" });
      return;
    }
    setIngestLoading(true);
    try {
      const isArray = Array.isArray(parsed);
      const endpoint = isArray ? "/api/agent/signal-ops/batch" : "/api/agent/signal-ops";
      const body = isArray ? { inputs: parsed } : parsed;
      const result = await apiPost(endpoint, body);
      toast({ title: "Ingested", description: isArray ? `${result.count} signals processed` : `Decision: ${result.decision}` });
      setIngestInput("");
      qc.invalidateQueries({ queryKey: ["/api/agent/signal-ops/queue"] });
    } catch (e: any) {
      toast({ title: "Ingest failed", description: e.message, variant: "destructive" });
    } finally {
      setIngestLoading(false);
    }
  };

  const items: Record<string, any>[] = data?.items ?? [];

  const tabs: { key: typeof tab; label: string; icon: any }[] = [
    { key: "review_required", label: "Review Required", icon: Clock },
    { key: "auto_publish",    label: "Auto-Published",  icon: Zap },
    { key: "reject",          label: "Rejected",         icon: XCircle },
    { key: "all",             label: "All",              icon: Shield },
  ];

  return (
    <AppLayout theme={theme} toggleTheme={toggleTheme} opsMode={true}>
      <div style={{ padding: "24px 24px 48px", maxWidth: 960, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: "'Barlow Condensed',Arial,sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: T.gold, margin: "0 0 8px" }}>
            Signal Ops · Phase 1
          </p>
          <h1 style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 22, fontWeight: 900, color: T.text, margin: "0 0 4px", letterSpacing: "-0.01em" }}>
            Signal Ops Queue
          </h1>
          <p style={{ fontSize: 12, color: T.textFaint, margin: 0 }}>
            Review, approve, or reject signals flagged by the pipeline. Auto-published items are already live.
          </p>
        </div>

        <div style={{ height: 1, background: T.goldDim, marginBottom: 24 }} />

        {/* Manual Ingest */}
        <div style={{ background: T.surface1, border: `1px solid ${T.surface3}`, borderRadius: 3, padding: 20, marginBottom: 24 }}>
          <p style={{ fontFamily: "'Barlow Condensed',Arial,sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.textFaint, margin: "0 0 10px" }}>
            Manual Ingest
          </p>
          <p style={{ fontSize: 11, color: T.textMuted, margin: "0 0 10px" }}>
            Paste a single Signal Ops input object or an array of objects to run through the pipeline.
          </p>
          <textarea
            value={ingestInput}
            onChange={e => setIngestInput(e.target.value)}
            placeholder={`{\n  "source_name": "Adam Schefter",\n  "source_url": "https://twitter.com/...",\n  "timestamp": "2026-04-23T09:00:00Z",\n  "headline": "Jets visiting Arvell Reese today...",\n  "body": "...",\n  "player_tags": ["Arvell Reese"],\n  "team_tags": ["Jets"]\n}`}
            style={{ width: "100%", boxSizing: "border-box", height: 140, background: T.bg, border: `1px solid rgba(245,184,65,0.25)`, color: T.text, fontSize: 11, fontFamily: "monospace", padding: "10px 12px", resize: "vertical", borderRadius: 2, outline: "none" }}
          />
          <button
            onClick={handleIngest}
            disabled={ingestLoading || !ingestInput.trim()}
            style={{ marginTop: 10, padding: "9px 20px", background: ingestLoading ? T.surface3 : T.gold, color: T.bg, border: "none", cursor: ingestLoading ? "not-allowed" : "pointer", fontFamily: "'Barlow Condensed'", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", borderRadius: 2 }}
          >
            {ingestLoading ? "Processing…" : "Run Signal Ops"}
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${T.surface3}`, paddingBottom: 0 }}>
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{ padding: "8px 16px", background: "none", border: "none", borderBottom: tab === key ? `2px solid ${T.gold}` : "2px solid transparent", color: tab === key ? T.gold : T.textFaint, cursor: "pointer", fontFamily: "'Barlow Condensed'", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", transition: "color 0.15s" }}
            >
              {label} {data?.count !== undefined && tab === key ? `(${data.count})` : ""}
            </button>
          ))}
        </div>

        {/* Queue table */}
        {isLoading && (
          <div style={{ color: T.textFaint, fontSize: 12, padding: 24 }}>Loading…</div>
        )}

        {!isLoading && items.length === 0 && (
          <div style={{ background: T.surface1, border: `1px solid ${T.surface3}`, borderRadius: 3, padding: 32, textAlign: "center" }}>
            <CheckCircle size={24} style={{ color: T.green, margin: "0 auto 10px", display: "block" }} />
            <p style={{ color: T.textMuted, fontSize: 13, margin: 0 }}>Queue is empty for this filter.</p>
          </div>
        )}

        {!isLoading && items.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map((item: Record<string, any>) => (
              <div key={item.id} style={{ background: T.surface1, border: `1px solid ${T.surface3}`, borderRadius: 3, padding: "16px 18px" }}>

                {/* Top row: headline + confidence + decision */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 14, fontWeight: 700, color: T.text, margin: "0 0 4px", lineHeight: 1.3 }}>
                      {item.normalized_headline || item.raw_headline}
                    </p>
                    <p style={{ fontSize: 11, color: T.textFaint, margin: 0 }}>
                      {item.source_name} · {item.signal_type?.replace(/_/g, " ")} · {item.player || "?"} · {item.team || "?"}
                    </p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{ fontFamily: "Georgia,serif", fontSize: 26, fontWeight: 900, color: confColor(item.confidence_score ?? 0), margin: "0 0 2px", lineHeight: 1 }}>
                      {item.confidence_score ?? 0}
                    </p>
                    <p style={{ fontFamily: "'Barlow Condensed'", fontSize: 8, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: decisionColor(item.decision), margin: 0 }}>
                      {decisionLabel(item.decision)}
                    </p>
                  </div>
                </div>

                {/* Reason */}
                <div style={{ background: T.surface2, borderLeft: `3px solid ${decisionColor(item.decision)}`, padding: "8px 12px", borderRadius: "0 2px 2px 0", marginBottom: 12 }}>
                  <p style={{ fontSize: 11, color: T.textMuted, margin: 0, lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 9 }}>Reason: </span>
                    {item.reason || "—"}
                  </p>
                </div>

                {/* Conflict flags */}
                {item.conflict_flags && item.conflict_flags !== "[]" && item.conflict_flags !== "" && (
                  <div style={{ marginBottom: 12 }}>
                    {(JSON.parse(item.conflict_flags || "[]") as string[]).map((f, i) => (
                      <p key={i} style={{ fontSize: 11, color: T.red, margin: "0 0 4px" }}>⚠ {f}</p>
                    ))}
                  </div>
                )}

                {/* Metadata row */}
                <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 10, color: T.textFaint }}>
                  <span>Sources: {item.source_count}</span>
                  <span>Cluster: {item.cluster_id?.slice(0, 8) || "—"}</span>
                  <span>{new Date(item.created_at).toLocaleString()}</span>
                </div>

                {/* Actions — only for review_required */}
                {item.decision === "review_required" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => approveMutation.mutate(item.id)}
                      disabled={approveMutation.isPending}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: T.green, color: "#050505", border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed'", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", borderRadius: 2 }}
                    >
                      <CheckCircle size={12} /> Approve & Publish
                    </button>
                    <button
                      onClick={() => rejectMutation.mutate({ id: item.id, reason: "Human review rejected" })}
                      disabled={rejectMutation.isPending}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: T.surface3, color: T.red, border: `1px solid rgba(255,82,82,0.30)`, cursor: "pointer", fontFamily: "'Barlow Condensed'", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", borderRadius: 2 }}
                    >
                      <XCircle size={12} /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
