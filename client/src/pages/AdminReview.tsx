import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import AppLayout from "../components/AppLayout";
import VerdictBadge from "../components/VerdictBadge";
import TopicBadge from "../components/TopicBadge";
import { type Theme } from "../App";
import { Shield, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props { theme: Theme; toggleTheme: () => void; }

export default function AdminReview({ theme, toggleTheme }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: queue, isLoading } = useQuery({
    queryKey: ["/api/admin/review"],
    queryFn: () => apiRequest("GET", "/api/admin/review").then(r => r.json()),
    refetchInterval: 30000,
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/admin/review/${id}/resolve`).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Resolved", description: "Signal approved and published to feed." });
      qc.invalidateQueries({ queryKey: ["/api/admin/review"] });
      qc.invalidateQueries({ queryKey: ["/api/signal"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to resolve review item.", variant: "destructive" });
    },
  });

  return (
    <AppLayout theme={theme} toggleTheme={toggleTheme}>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto" data-testid="admin-review-page">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="section-kicker">
              <span className="data-label text-primary">Operational</span>
            </p>
            <h1
              className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2 mt-3"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: "-0.02em" }}
            >
              <Shield size={18} className="text-primary" />
              Review Queue
            </h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">High-risk claims awaiting human review</p>
          </div>
          {queue && (
            <span
              className="text-[9px] px-2.5 py-1 rounded border border-destructive/30 bg-destructive/8 text-destructive font-bold uppercase tracking-widest tabular-nums mt-1"
              data-testid="review-count-badge"
            >
              {queue.length} pending
            </span>
          )}
        </div>

        <hr className="briefing-rule mb-5" />

        {/* Criteria */}
        <div
          className="p-4 rounded border border-border bg-muted/20 mb-5 text-xs text-muted-foreground leading-relaxed"
          data-testid="review-criteria-info"
        >
          <p className="data-label text-foreground mb-1.5">Review criteria</p>
          QB injuries · First-round draft movement · Coaching changes · Playoff-impacting injury · Conflicting high-authority evidence
        </div>

        {isLoading && (
          <div className="space-y-3" data-testid="skeleton-review">
            {[1, 2].map(i => <div key={i} className="h-32 rounded border border-border bg-muted/20 animate-pulse" />)}
          </div>
        )}

        {!isLoading && (!queue || queue.length === 0) && (
          <div className="text-center py-14 border border-border rounded bg-card" data-testid="empty-review-queue">
            <CheckCircle size={28} className="text-primary mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground">Review queue is empty</p>
            <p className="text-[11px] text-muted-foreground mt-1">All signals are processing normally</p>
          </div>
        )}

        {!isLoading && queue && queue.length > 0 && (
          <div className="space-y-3" data-testid="review-queue-list">
            {queue.map((item: any) => (
              <ReviewItem
                key={item.id}
                item={item}
                onResolve={() => resolveMutation.mutate(item.id)}
                isPending={resolveMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function ReviewItem({ item, onResolve, isPending }: {
  item: any;
  onResolve: () => void;
  isPending: boolean;
}) {
  return (
    <div
      className="p-4 rounded border border-border bg-card"
      data-testid={`review-item-${item.id}`}
    >
      {/* Status strip */}
      <div className="flex items-center gap-1.5 mb-3 pb-2.5 border-b border-border">
        <div className="w-1.5 h-1.5 rounded-full bg-destructive live-dot" />
        <span className="text-[9px] font-bold text-destructive uppercase tracking-widest">Review Required</span>
        <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
          {item.created_at ? new Date(item.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <VerdictBadge verdict={item.verdict} />
        {item.event && <TopicBadge topic={item.event.topic} />}
      </div>

      {item.event && (item.event.player || item.event.team) && (
        <p className="text-[10px] font-bold text-primary mb-1.5 uppercase tracking-wider">
          {[item.event.player, item.event.team].filter(Boolean).join(" · ")}
        </p>
      )}

      {item.claim && (
        <p className="text-sm text-foreground mb-3 leading-snug">{item.claim.raw_claim_text}</p>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-3">
        {item.confidence_score && (
          <span className="tabular-nums">
            Confidence: <strong className="text-foreground">{parseFloat(item.confidence_score).toFixed(0)}%</strong>
          </span>
        )}
        {item.source && (
          <span>Source: <strong className="text-foreground">{item.source.name}</strong></span>
        )}
        {item.rationale && (
          <span className="block w-full mt-1 text-[11px] text-muted-foreground leading-relaxed">{item.rationale}</span>
        )}
      </div>

      <div className="flex gap-2 pt-2.5 border-t border-border">
        <button
          onClick={onResolve}
          disabled={isPending}
          data-testid={`button-resolve-${item.id}`}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest bg-primary/10 text-primary border border-primary/30 px-3 py-1.5 rounded hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          <CheckCircle size={11} />
          Approve & Publish
        </button>
        <button
          data-testid={`button-flag-${item.id}`}
          className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 py-1.5 rounded border border-border hover:bg-muted transition-colors"
        >
          Flag as False
        </button>
      </div>
    </div>
  );
}
