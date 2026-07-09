import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { adminAuthHeaders } from "@/components/AdminGate";
import AppLayout from "../components/AppLayout";
import { type Theme } from "../App";
import { Zap, CheckCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props { theme: Theme; toggleTheme: () => void; }

export default function AlertsPage({ theme, toggleTheme }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: alerts, isLoading } = useQuery({
    queryKey: ["/api/alerts"],
    queryFn: () => apiRequest("GET", "/api/alerts", undefined, adminAuthHeaders()).then(r => r.json()),
    refetchInterval: 30000,
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/alerts/${id}/send`, undefined, adminAuthHeaders()).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Alert sent", description: "Alert marked as sent." });
      qc.invalidateQueries({ queryKey: ["/api/alerts"] });
    },
  });

  const pendingAlerts = alerts?.filter((a: any) => !a.sent_at) ?? [];
  const sentAlerts = alerts?.filter((a: any) => a.sent_at) ?? [];

  return (
    <AppLayout theme={theme} toggleTheme={toggleTheme} opsMode={true}>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto" data-testid="alerts-page">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="section-kicker">
              <span className="data-label text-primary">Pro Delivery</span>
            </p>
            <h1
              className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2 mt-3"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: "-0.02em" }}
            >
              <Zap size={18} className="text-primary" />
              Alert Flow
            </h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">Published signals ready for email delivery</p>
          </div>
          <div className="flex gap-2 text-[9px] mt-1">
            <span className="px-2.5 py-1 rounded border border-border bg-muted/30 text-muted-foreground font-bold uppercase tracking-widest tabular-nums">
              {pendingAlerts.length} pending
            </span>
            <span className="px-2.5 py-1 rounded border border-border bg-muted/30 text-muted-foreground font-bold uppercase tracking-widest tabular-nums">
              {sentAlerts.length} sent
            </span>
          </div>
        </div>

        <hr className="briefing-rule mb-5" />

        {/* Info brief */}
        <div className="p-4 rounded border border-border bg-muted/20 mb-6 text-xs text-muted-foreground leading-relaxed" data-testid="alert-info-box">
          <p className="data-label text-foreground mb-1.5 flex items-center gap-1.5">
            <Zap size={10} className="text-primary" />
            Pro alert delivery
          </p>
          Alerts generated only for <strong className="text-foreground">confirmed</strong> and <strong className="text-foreground">likely</strong> verdicts.
          High-risk signals pass review before publishing. Email delivery available on Pro tier ($19/month).
        </div>

        {isLoading && (
          <div className="space-y-2.5" data-testid="skeleton-alerts">
            {[1, 2, 3].map(i => <div key={i} className="h-20 rounded border border-border bg-muted/20 animate-pulse" />)}
          </div>
        )}

        {!isLoading && (!alerts || alerts.length === 0) && (
          <div className="text-center py-14 border border-border rounded bg-card" data-testid="empty-alerts">
            <p className="text-sm text-muted-foreground">No alerts generated yet</p>
          </div>
        )}

        {/* Pending */}
        {pendingAlerts.length > 0 && (
          <div className="mb-6" data-testid="pending-alerts-section">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={12} className="text-muted-foreground" />
              <h2
                className="text-sm font-bold"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                Ready to Send ({pendingAlerts.length})
              </h2>
              <hr className="flex-1 border-border" />
            </div>
            <div className="space-y-2">
              {pendingAlerts.map((alert: any) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onSend={() => sendMutation.mutate(alert.id)}
                  isPending={sendMutation.isPending}
                />
              ))}
            </div>
          </div>
        )}

        {/* Sent */}
        {sentAlerts.length > 0 && (
          <div data-testid="sent-alerts-section">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={12} className="text-primary" />
              <h2
                className="text-sm font-bold"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                Sent ({sentAlerts.length})
              </h2>
              <hr className="flex-1 border-border" />
            </div>
            <div className="space-y-2">
              {sentAlerts.slice(0, 10).map((alert: any) => (
                <AlertCard key={alert.id} alert={alert} sent />
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function AlertCard({
  alert, onSend, isPending, sent
}: {
  alert: any;
  onSend?: () => void;
  isPending?: boolean;
  sent?: boolean;
}) {
  const audienceStyle: Record<string, string> = {
    bettor: "text-[hsl(50,50%,58%)] border-[hsl(50,35%,28%)] bg-[hsl(50,30%,16%)]",
    fantasy: "text-[hsl(148,38%,54%)] border-[hsl(148,25%,26%)] bg-[hsl(148,22%,15%)]",
    all: "text-muted-foreground border-border bg-muted/30",
    pro: "text-primary border-primary/30 bg-primary/8",
  };

  return (
    <div
      className={`p-4 rounded border bg-card transition-colors ${sent ? "border-border opacity-60" : "border-border"}`}
      data-testid={`alert-card-${alert.id}`}
    >
      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
        <span className={`text-[9px] px-2 py-0.5 rounded border font-bold uppercase tracking-widest ${audienceStyle[alert.audience] ?? "text-muted-foreground border-border bg-muted/30"}`}>
          {(alert.audience ?? "all").toUpperCase()}
        </span>
        <span className="text-[9px] px-2 py-0.5 rounded border border-border bg-muted/30 text-muted-foreground uppercase tracking-widest font-semibold">
          {alert.channel ?? "feed"}
        </span>
        {sent && (
          <span className="text-[9px] text-primary font-bold uppercase tracking-widest ml-auto">✓ Sent</span>
        )}
      </div>
      <p className="text-sm text-foreground leading-snug font-mono text-[11px]" data-testid={`alert-text-${alert.id}`}>
        {alert.message_text}
      </p>
      {!sent && onSend && (
        <div className="mt-3 pt-2.5 border-t border-border">
          <button
            onClick={onSend}
            disabled={isPending}
            data-testid={`button-send-alert-${alert.id}`}
            className="text-[10px] font-bold uppercase tracking-widest bg-primary/10 text-primary border border-primary/30 px-3 py-1.5 rounded hover:bg-primary/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <Zap size={10} />
            Mark as Sent
          </button>
        </div>
      )}
    </div>
  );
}
