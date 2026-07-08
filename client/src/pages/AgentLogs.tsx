import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { adminAuthHeaders } from "@/components/AdminGate";
import AppLayout from "../components/AppLayout";
import { type Theme } from "../App";
import { FileText } from "lucide-react";

interface Props { theme: Theme; toggleTheme: () => void; }

/* Old Money agent color palette — muted, editorial */
const agentColors: Record<string, string> = {
  Scout:       "bg-[hsl(36,30%,14%)]  text-[hsl(36,46%,56%)]",
  Clusterer:   "bg-[hsl(20,35%,16%)]  text-[hsl(20,50%,60%)]",
  Retriever:   "bg-[hsl(146,25%,16%)] text-[hsl(146,38%,56%)]",
  Verifier:    "bg-[hsl(42,38%,16%)]  text-[hsl(42,55%,58%)]",
  SourceScorer:"bg-[hsl(30,32%,16%)]  text-[hsl(30,45%,56%)]",
  Publisher:   "bg-[hsl(155,18%,15%)] text-[hsl(155,32%,54%)]",
  "QA/Audit":  "bg-[hsl(4,40%,16%)]   text-[hsl(4,55%,58%)]",
};

export default function AgentLogs({ theme, toggleTheme }: Props) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["/api/logs"],
    queryFn: () => apiRequest("GET", "/api/logs?limit=100", undefined, adminAuthHeaders()).then(r => r.json()),
    refetchInterval: 15000,
  });

  const { data: audit } = useQuery({
    queryKey: ["/api/qa/audit"],
    queryFn: () => apiRequest("GET", "/api/qa/audit").then(r => r.json()),
    refetchInterval: 30000,
  });

  return (
    <AppLayout theme={theme} toggleTheme={toggleTheme} opsMode={true}>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto" data-testid="agent-logs-page">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="section-kicker">
              <span className="data-label text-primary">Pipeline Audit</span>
            </p>
            <h1
              className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2 mt-3"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: "-0.02em" }}
            >
              <FileText size={18} className="text-primary" />
              Agent Logs
            </h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">Full pipeline audit trail</p>
          </div>
        </div>

        <hr className="briefing-rule mb-5" />

        {/* QA Audit Panel */}
        {audit && (
          <div
            className={`p-4 rounded border mb-6 ${audit.pass
              ? "border-[hsl(146,30%,28%)] bg-[hsl(146,25%,12%)]"
              : "border-[hsl(4,50%,26%)] bg-[hsl(4,40%,12%)]"
            }`}
            data-testid="qa-audit-panel"
          >
            <p className={`font-bold text-sm mb-3 flex items-center gap-2 ${audit.pass ? "text-[hsl(146,42%,58%)]" : "text-[hsl(4,60%,58%)]"}`}
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              {audit.pass ? "✓ QA Audit: Pass" : "✗ QA Audit: Fail"}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <p className="data-label mb-1">Total Claims</p>
                <strong className="stat-num-display tabular-nums text-foreground font-bold text-base">
                  {audit.total_claims}
                </strong>
              </div>
              <div>
                <p className="data-label mb-1">Verdicts Issued</p>
                <strong className="stat-num-display tabular-nums text-foreground font-bold text-base">
                  {audit.verdicts_issued}
                </strong>
              </div>
              <div>
                <p className="data-label mb-1">Review Queue</p>
                <strong className="stat-num-display tabular-nums text-foreground font-bold text-base">
                  {audit.review_queue_count}
                </strong>
              </div>
              <div>
                <p className="data-label mb-1">Alerts Published</p>
                <strong className="stat-num-display tabular-nums text-foreground font-bold text-base">
                  {audit.alerts_published}
                </strong>
              </div>
            </div>
            {audit.invalid_verdicts > 0 && (
              <p className="text-xs text-[hsl(4,60%,58%)] mt-3">⚠ {audit.invalid_verdicts} invalid verdict types found</p>
            )}
          </div>
        )}

        {isLoading && (
          <div className="space-y-2" data-testid="skeleton-logs">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-10 rounded border border-border bg-muted/20 animate-pulse" />)}
          </div>
        )}

        {!isLoading && (!logs || logs.length === 0) && (
          <div className="text-center py-14 border border-border rounded bg-card" data-testid="empty-logs">
            <p className="text-sm text-muted-foreground">No agent logs yet</p>
          </div>
        )}

        {!isLoading && logs && logs.length > 0 && (
          <div className="rounded border border-border bg-card overflow-hidden editorial-table" data-testid="logs-table">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="text-left px-4 py-2.5"><span className="data-label">Time</span></th>
                    <th className="text-left px-4 py-2.5"><span className="data-label">Agent</span></th>
                    <th className="text-left px-4 py-2.5 hidden sm:table-cell"><span className="data-label">Decision</span></th>
                    <th className="text-left px-4 py-2.5 hidden md:table-cell"><span className="data-label">Status</span></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log: any) => (
                    <tr
                      key={log.id}
                      className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                      data-testid={`log-row-${log.id}`}
                    >
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${agentColors[log.agent_name] ?? "bg-muted text-muted-foreground"}`}>
                          {log.agent_name}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell max-w-xs truncate">
                        {log.decision_summary}
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        {log.error_state ? (
                          <span className="text-[hsl(4,60%,58%)]">⚠ {log.error_state}</span>
                        ) : (
                          <span className="text-[hsl(146,42%,52%)]">✓ ok</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
