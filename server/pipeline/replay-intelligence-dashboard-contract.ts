export interface ReplayDashboardTimeBucket {
  timestamp: string;
  replay_count: number;
  anomaly_count: number;
  drift_score: number;
  confidence_score: number;
}

export interface ReplayDashboardAnomalyPoint {
  timestamp: string;
  category: string;
  severity: number;
  replay_id: string;
  intelligence_hash: string;
}

export interface ReplayDashboardHeatmapCell {
  dimension: string;
  label: string;
  replay_count: number;
  anomaly_count: number;
  drift_score: number;
  confidence_score: number;
}

export interface ReplayDashboardLineageNode {
  replay_id: string;
  parent_replay_id: string | null;
  intelligence_hash: string;
  created_at: string;
  anomaly_score: number;
  drift_score: number;
  confidence_score: number;
}

export interface ReplayDashboardLineageEdge {
  source_replay_id: string;
  target_replay_id: string;
  relationship: string;
}

export interface ReplayDashboardLineageGraph {
  nodes: ReplayDashboardLineageNode[];
  edges: ReplayDashboardLineageEdge[];
}

export interface ReplayDashboardSummary {
  total_replays: number;
  total_anomalies: number;
  average_drift_score: number;
  average_confidence_score: number;
  latest_replay_at: string | null;
}

export interface ReplayDashboardDataset {
  summary: ReplayDashboardSummary;
  timeline: ReplayDashboardTimeBucket[];
  anomalies: ReplayDashboardAnomalyPoint[];
  heatmap: ReplayDashboardHeatmapCell[];
  lineage: ReplayDashboardLineageGraph;
}

export interface ReplayDashboardQuery {
  start_at?: string;
  end_at?: string;
  replay_ids?: string[];
  intelligence_hashes?: string[];
  categories?: string[];
  limit?: number;
}

export interface ReplayDashboardAggregationResult {
  generated_at: string;
  query: ReplayDashboardQuery;
  dataset: ReplayDashboardDataset;
}