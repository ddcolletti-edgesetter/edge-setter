/**
 * Distribution Drafts — Phase 2 Admin Page
 * Route: /#/distribution-drafts  (AdminGate-wrapped in App.tsx)
 *
 * Shows all distribution drafts with:
 * - Tab filter: All / Pending / Approved / Rejected
 * - Channel filter: All / X / Reddit
 * - Draft copy preview
 * - Approve / Reject / Regenerate actions
 * - Manual run trigger
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import AppLayout from "../components/AppLayout";
import { type Theme } from "../App";
import { useToast } from "@/hooks/use-toast";
import {
  Send, CheckCircle, XCircle, RefreshCw, Play,
  Twitter, MessageSquare, Clock, Filter, ExternalLink
} from "lucide-react";

interface Props { theme: Theme; toggleTheme: () => void; }

import { adminAuthHeaders } from "@/components/AdminGate";

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
  cyan:      "hsl(194 56% 55%)",
};

type TabKey = "all" | "pending" | "approved" | "rejected";
type ChannelKey = "all" | "x" | "reddit";

const STATUS_COLORS: Record<string, string> = {
  draft:            T.yellow,
  review_required:  T.yellow,
  approved:         T.green,
  rejected:         T.red,
  posted:           "#3DAE72",
};

const STATUS_LABELS: Record<string, string> = {
  draft:            "Draft",
  review_required:  "Review Required",
  approved:         "Approved",
  rejected:         "Rejected",
  posted:           "Auto-posted",
};

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === "x") return <Twitter size={12} style={{ color: T.textMuted }} />;
  return <MessageSquare size={12} style={{ color: T.textMuted }} />;
}

export default function DistributionDrafts({ theme, toggleTheme }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab]         = useState<TabKey>("all");
  const [channel, setChannel] = useState<ChannelKey>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Fetch drafts
  const { data: drafts = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/agent/distribution-drafts", tab, channel],
    queryFn: () => {
      const params = new URLSearchParams();
      if (tab !== "all") {
        if (tab === "pending") {
          params.set("status", "draft");
        } else {
          params.set("status", tab);
        }
      }
      if (channel !== "all") params.set("channel", channel);
      return apiRequest("GET", `/api/agent/distribution-drafts?${params}`, undefined, adminAuthHeaders()).then(r => r.json());
    },
    refetchInterval: 30000,
  });

  // Approve
  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/agent/distribution-drafts/${id}/approve`, undefined, adminAuthHeaders()).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Approved", description: "Draft marked approved." });
      qc.invalidateQueries({ queryKey: ["/api/agent/distribution-drafts"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Reject
  const rejectMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/agent/distribution-drafts/${id}/reject`, { notes: "Rejected by operator" }, adminAuthHeaders()).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Rejected", description: "Draft rejected." });
      qc.invalidateQueries({ queryKey: ["/api/agent/distribution-drafts"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Regenerate
  const regenMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/agent/distribution-drafts/${id}/regenerate`, undefined, adminAuthHeaders()).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: "Regenerated", description: `${data.drafts_created ?? 0} new draft(s) created.` });
      qc.invalidateQueries({ queryKey: ["/api/agent/distribution-drafts"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Post Now
  const postMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/agent/distribution-drafts/${id}/post`, undefined, adminAuthHeaders()).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: "Posted", description: `Tweet live: ${data.tweet_url}` });
      qc.invalidateQueries({ queryKey: ["/api/agent/distribution-drafts"] });
    },
    onError: (e: any) => toast({ title: "Post failed", description: e.message, variant: "destructive" }),
  });

  // Manual run
  const runMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/agent/distribution-drafts/run", undefined, adminAuthHeaders()).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: "Run Complete", description: `Checked ${data.signals_checked} signals. Created ${data.drafts_created} draft(s). Skipped ${data.drafts_skipped}.` });
      qc.invalidateQueries({ queryKey: ["/api/agent/distribution-drafts"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const tabs: { key: TabKey; label: string }[] = [
    { key: "all",      label: "All" },
    { key: "pending",  label: "Pending Review" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
  ];

  const channels: { key: ChannelKey; label: string }[] = [
    { key: "all",    label: "All Channels" },
    { key: "x",      label: "X" },
    { key: "reddit", label: "Reddit" },
  ];

  const pendingCount = (drafts as any[]).filter(d => d.status === "draft" || d.status === "review_required").length;

  return (
    <AppLayout theme={theme} toggleTheme={toggleTheme} opsMode={true}>
      <div style={{ padding: "28px 32px", maxWidth: 1100 }} data-testid="distribution-drafts-page">

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <Send size={16} style={{ color: T.gold }} />
              <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, fontWeight: 700, color: T.text, margin: 0 }}>
                Distribution Drafts
              </h1>
            </div>
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: T.textFaint, letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>
              Phase 2 Agent · X auto-posts at 95%+ confidence · Human review for all others
            </p>
          </div>
          <button
            data-testid="button-run-distribution-agent"
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 16px",
              background: T.gold, color: T.bg,
              border: "none", borderRadius: 3, cursor: "pointer",
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
              opacity: runMutation.isPending ? 0.6 : 1,
            }}
          >
            <Play size={12} />
            {runMutation.isPending ? "Running…" : "Run Agent"}
          </button>
        </div>

        {/* Stats strip */}
        {!isLoading && (
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Total",    value: (drafts as any[]).length },
              { label: "Pending",  value: pendingCount, color: T.yellow },
              { label: "Approved", value: (drafts as any[]).filter(d => d.status === "approved").length, color: T.green },
              { label: "Posted",   value: (drafts as any[]).filter(d => d.status === "posted").length, color: "#3DAE72" },
              { label: "Rejected", value: (drafts as any[]).filter(d => d.status === "rejected").length, color: T.red },
            ].map(stat => (
              <div key={stat.label} style={{ background: T.surface1, border: `1px solid ${T.goldDim}`, borderRadius: 3, padding: "10px 16px", minWidth: 80 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: stat.color ?? T.text, fontVariantNumeric: "tabular-nums" }}>{stat.value}</div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 1 }}>{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {/* Tab filter */}
          <div style={{ display: "flex", gap: 2 }}>
            {tabs.map(t => (
              <button
                key={t.key}
                data-testid={`tab-${t.key}`}
                onClick={() => setTab(t.key)}
                style={{
                  padding: "6px 12px",
                  background: tab === t.key ? T.gold : T.surface2,
                  color: tab === t.key ? T.bg : T.textMuted,
                  border: `1px solid ${tab === t.key ? T.gold : T.goldDim}`,
                  borderRadius: 3, cursor: "pointer",
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                  transition: "all 0.12s",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Channel filter */}
          <div style={{ display: "flex", gap: 2, marginLeft: 12 }}>
            <Filter size={12} style={{ color: T.textFaint, alignSelf: "center", marginRight: 4 }} />
            {channels.map(c => (
              <button
                key={c.key}
                data-testid={`channel-${c.key}`}
                onClick={() => setChannel(c.key)}
                style={{
                  padding: "6px 12px",
                  background: channel === c.key ? "rgba(245,184,65,0.12)" : T.surface2,
                  color: channel === c.key ? T.gold : T.textMuted,
                  border: `1px solid ${channel === c.key ? "rgba(245,184,65,0.4)" : T.goldDim}`,
                  borderRadius: 3, cursor: "pointer",
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                  transition: "all 0.12s",
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Draft list */}
        {isLoading ? (
          <div style={{ color: T.textFaint, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13 }}>Loading drafts…</div>
        ) : (drafts as any[]).length === 0 ? (
          <div style={{ background: T.surface1, border: `1px solid ${T.goldDim}`, borderRadius: 4, padding: 32, textAlign: "center" }}>
            <Send size={24} style={{ color: T.textFaint, marginBottom: 8 }} />
            <div style={{ color: T.textMuted, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, letterSpacing: "0.08em" }}>
              No drafts found. Run the agent to generate drafts from live signals.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(drafts as any[]).map((draft: any) => {
              const isOpen = expanded === draft.id;
              const isPending = draft.status === "draft" || draft.status === "review_required";
              return (
                <div
                  key={draft.id}
                  data-testid={`draft-card-${draft.id}`}
                  style={{
                    background: T.surface1,
                    border: `1px solid ${isOpen ? "rgba(245,184,65,0.3)" : T.goldDim}`,
                    borderLeft: `3px solid ${STATUS_COLORS[draft.status] ?? T.textFaint}`,
                    borderRadius: 4,
                    overflow: "hidden",
                    transition: "border-color 0.15s",
                  }}
                >
                  {/* Summary row */}
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" }}
                    onClick={() => setExpanded(isOpen ? null : draft.id)}
                  >
                    <ChannelIcon channel={draft.channel} />
                    <span style={{
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 10, fontWeight: 700,
                      letterSpacing: "0.18em", textTransform: "uppercase",
                      color: T.textFaint,
                      minWidth: 52,
                    }}>
                      {draft.channel === "x" ? "X POST" : "REDDIT"}
                    </span>

                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 600, color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {draft.headline}
                    </span>

                    {/* Signal info */}
                    {draft.player_name && (
                      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textFaint, letterSpacing: "0.08em" }}>
                        {draft.player_name}{draft.team ? ` · ${draft.team}` : ""}
                      </span>
                    )}

                    {/* Status badge */}
                    <span style={{
                      padding: "3px 8px",
                      borderRadius: 2,
                      background: `${STATUS_COLORS[draft.status]}22`,
                      color: STATUS_COLORS[draft.status] ?? T.textFaint,
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 10, fontWeight: 700,
                      letterSpacing: "0.12em", textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}>
                      {STATUS_LABELS[draft.status] ?? draft.status}
                    </span>

                    {/* Timestamp */}
                    <span style={{ fontSize: 10, color: T.textFaint, whiteSpace: "nowrap" }}>
                      {new Date(draft.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>

                  {/* Expanded copy + actions */}
                  {isOpen && (
                    <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${T.goldDim}` }}>
                      {/* Copy preview */}
                      <div style={{ marginTop: 14, marginBottom: 12 }}>
                        <div style={{
                          fontFamily: "'Barlow Condensed', sans-serif",
                          fontSize: 10, color: T.textFaint, letterSpacing: "0.16em",
                          textTransform: "uppercase", marginBottom: 6,
                        }}>
                          Copy Preview
                        </div>
                        <pre style={{
                          background: T.surface3,
                          border: `1px solid ${T.goldDim}`,
                          borderRadius: 3,
                          padding: "12px 14px",
                          fontFamily: "DM Sans, sans-serif",
                          fontSize: 13,
                          color: T.text,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          margin: 0,
                          lineHeight: 1.55,
                        }}>
                          {draft.copy}
                        </pre>
                      </div>

                      {/* Notes */}
                      {draft.notes && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
                            Agent Notes
                          </div>
                          <div style={{ fontSize: 12, color: T.textMuted }}>{draft.notes}</div>
                        </div>
                      )}

                      {/* Source signal */}
                      {draft.signal_title && (
                        <div style={{ marginBottom: 14 }}>
                          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                            Source Signal:{" "}
                          </span>
                          <span style={{ fontSize: 12, color: T.textMuted }}>{draft.signal_title}</span>
                          {draft.confidence_score && (
                            <span style={{ fontSize: 11, color: T.textFaint, marginLeft: 8 }}>{draft.confidence_score}% confidence · {draft.verdict}</span>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      {isPending && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            data-testid={`button-approve-${draft.id}`}
                            onClick={() => approveMutation.mutate(draft.id)}
                            disabled={approveMutation.isPending}
                            style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "7px 14px",
                              background: "rgba(76,175,125,0.12)", color: T.green,
                              border: `1px solid rgba(76,175,125,0.3)`,
                              borderRadius: 3, cursor: "pointer",
                              fontFamily: "'Barlow Condensed', sans-serif",
                              fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                            }}
                          >
                            <CheckCircle size={11} /> Approve
                          </button>
                          <button
                            data-testid={`button-reject-${draft.id}`}
                            onClick={() => rejectMutation.mutate(draft.id)}
                            disabled={rejectMutation.isPending}
                            style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "7px 14px",
                              background: "rgba(255,82,82,0.10)", color: T.red,
                              border: `1px solid rgba(255,82,82,0.25)`,
                              borderRadius: 3, cursor: "pointer",
                              fontFamily: "'Barlow Condensed', sans-serif",
                              fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                            }}
                          >
                            <XCircle size={11} /> Reject
                          </button>
                          <button
                            data-testid={`button-regen-${draft.id}`}
                            onClick={() => regenMutation.mutate(draft.id)}
                            disabled={regenMutation.isPending}
                            style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "7px 14px",
                              background: "rgba(245,184,65,0.08)", color: T.gold,
                              border: `1px solid rgba(245,184,65,0.25)`,
                              borderRadius: 3, cursor: "pointer",
                              fontFamily: "'Barlow Condensed', sans-serif",
                              fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                            }}
                          >
                            <RefreshCw size={11} /> Regenerate
                          </button>
                          {draft.channel === "x" && (
                            <button
                              data-testid={`button-post-${draft.id}`}
                              onClick={() => postMutation.mutate(draft.id)}
                              disabled={postMutation.isPending}
                              style={{
                                display: "flex", alignItems: "center", gap: 5,
                                padding: "7px 14px",
                                background: "rgba(29,161,242,0.10)", color: "#1DA1F2",
                                border: `1px solid rgba(29,161,242,0.25)`,
                                borderRadius: 3, cursor: "pointer",
                                fontFamily: "'Barlow Condensed', sans-serif",
                                fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                              }}
                            >
                              <Twitter size={11} /> Post Now
                            </button>
                          )}
                        </div>
                      )}
                      {!isPending && draft.status === "approved" && draft.channel === "x" && (
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, color: T.green, fontSize: 12 }}>
                            <CheckCircle size={13} /> Approved
                          </div>
                          <button
                            onClick={() => postMutation.mutate(draft.id)}
                            disabled={postMutation.isPending}
                            style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "7px 14px",
                              background: "rgba(29,161,242,0.10)", color: "#1DA1F2",
                              border: `1px solid rgba(29,161,242,0.25)`,
                              borderRadius: 3, cursor: "pointer",
                              fontFamily: "'Barlow Condensed', sans-serif",
                              fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                            }}
                          >
                            <Twitter size={11} /> Post Now
                          </button>
                        </div>
                      )}
                      {!isPending && draft.status === "approved" && draft.channel !== "x" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, color: T.green, fontSize: 12 }}>
                          <CheckCircle size={13} /> Approved — ready when you are
                        </div>
                      )}
                      {!isPending && draft.status === "posted" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#3DAE72", fontSize: 12 }}>
                            <Twitter size={13} /> Auto-posted to X
                          </div>
                          {draft.tweet_url && (
                            <a
                              href={draft.tweet_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: "flex", alignItems: "center", gap: 4,
                                fontSize: 11, color: "#1DA1F2", textDecoration: "none",
                                fontFamily: "'Barlow Condensed', sans-serif",
                                letterSpacing: "0.08em",
                              }}
                            >
                              <ExternalLink size={10} /> View tweet
                            </a>
                          )}
                          {draft.posted_at && (
                            <span style={{ fontSize: 10, color: T.textFaint }}>
                              {new Date(draft.posted_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                      )}
                      {!isPending && draft.status === "rejected" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, color: T.red, fontSize: 12 }}>
                          <XCircle size={13} /> Rejected
                        </div>
                      )}
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
