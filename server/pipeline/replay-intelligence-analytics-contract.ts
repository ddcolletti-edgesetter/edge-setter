export interface ReplayIntelligenceAnalyticsRequest {
  reconstruction_id: string;
  generated_at: string;
  traversal_depth: number;
}

export interface ReplayIntelligenceAnalyticsMetric {
  key: string;
  value: number;
  weight: number;
  status: "stable" | "warning" | "critical";
}

export interface ReplayIntelligenceAnalyticsSummary {
  reconstruction_id: string;
  generated_at: string;
  metrics: ReplayIntelligenceAnalyticsMetric[];
  convergence_score: number;
  instability_score: number;
  deterministic_hash: string;
}