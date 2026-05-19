import crypto from "crypto";
import { ReplayIntelligenceAnalyticsSummary } from "./replay-intelligence-analytics-contract";

export interface ReplayConvergenceReport {
  reconstruction_id: string;
  generated_at: string;
  convergence_score: number;
  instability_score: number;
  stable_metric_count: number;
  warning_metric_count: number;
  critical_metric_count: number;
  deterministic_hash: string;
}

export function buildReplayConvergenceReport(
  analytics: ReplayIntelligenceAnalyticsSummary,
): ReplayConvergenceReport {
  const stableMetricCount = analytics.metrics.filter(
    (metric) => metric.status === "stable",
  ).length;

  const warningMetricCount = analytics.metrics.filter(
    (metric) => metric.status === "warning",
  ).length;

  const criticalMetricCount = analytics.metrics.filter(
    (metric) => metric.status === "critical",
  ).length;

  const deterministicHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        reconstruction_id: analytics.reconstruction_id,
        generated_at: analytics.generated_at,
        convergence_score: analytics.convergence_score,
        instability_score: analytics.instability_score,
        stableMetricCount,
        warningMetricCount,
        criticalMetricCount,
      }),
    )
    .digest("hex");

  return {
    reconstruction_id: analytics.reconstruction_id,
    generated_at: analytics.generated_at,
    convergence_score: analytics.convergence_score,
    instability_score: analytics.instability_score,
    stable_metric_count: stableMetricCount,
    warning_metric_count: warningMetricCount,
    critical_metric_count: criticalMetricCount,
    deterministic_hash: deterministicHash,
  };
}