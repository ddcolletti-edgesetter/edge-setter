import crypto from "crypto";
import {
  ReplayIntelligenceAnalyticsMetric,
  ReplayIntelligenceAnalyticsRequest,
  ReplayIntelligenceAnalyticsSummary,
} from "./replay-intelligence-analytics-contract";

export function buildReplayIntelligenceAnalytics(
  request: ReplayIntelligenceAnalyticsRequest,
  metrics: ReplayIntelligenceAnalyticsMetric[],
): ReplayIntelligenceAnalyticsSummary {
  const convergenceScore =
    metrics.length === 0
      ? 0
      : metrics.reduce((sum, metric) => {
          return sum + metric.value * metric.weight;
        }, 0) / metrics.length;

  const instabilityScore =
    metrics.filter((metric) => metric.status !== "stable").length;

  const deterministicHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        reconstruction_id: request.reconstruction_id,
        generated_at: request.generated_at,
        traversal_depth: request.traversal_depth,
        metrics,
        convergenceScore,
        instabilityScore,
      }),
    )
    .digest("hex");

  return {
    reconstruction_id: request.reconstruction_id,
    generated_at: request.generated_at,
    metrics,
    convergence_score: convergenceScore,
    instability_score: instabilityScore,
    deterministic_hash: deterministicHash,
  };
}