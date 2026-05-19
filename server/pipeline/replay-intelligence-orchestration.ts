import type {
  ReplayAnomalyCluster,
} from "./replay-anomaly-cluster";

import type {
  ReplayLineageNode,
} from "./replay-intelligence-lineage";

import type {
  ReplayPredictiveForecast,
} from "./replay-predictive-anomaly";

import type {
  ReplayHeatmapCell,
} from "./replay-intelligence-heatmap";

export interface ReplayIntelligenceOrchestrationSnapshot {
  generated_at: string;
  lineage_nodes: ReplayLineageNode[];
  anomaly_clusters: ReplayAnomalyCluster[];
  forecasts: ReplayPredictiveForecast[];
  heatmap: ReplayHeatmapCell[];
  convergence_score: number;
  orchestration_hash: string;
}

export interface ReplayIntelligenceConvergenceSummary {
  lineage_edges: number;
  anomaly_count: number;
  forecast_count: number;
  heatmap_cells: number;
  convergence_score: number;
}

export interface ReplayAnomalyClusterSummary {
  generated_at: string;
  cluster_count: number;
  node_count: number;
  replay_count: number;
  severity_counts: Record<ReplayAnomalyCluster["severity"], number>;
  average_anomaly_score: number;
  average_drift_score: number;
  average_confidence_score: number;
  cluster_ids: string[];
}

export interface ReplayHeatmapSummary {
  generated_at: string;
  cell_count: number;
  replay_count: number;
  categories: string[];
  severity_band_counts: Record<ReplayHeatmapCell["severity_band"], number>;
  confidence_band_counts: Record<ReplayHeatmapCell["confidence_band"], number>;
  average_severity: number;
  average_confidence_score: number;
}

export const REPLAY_INTELLIGENCE_ORCHESTRATION_FIXTURE_GENERATED_AT =
  "2026-01-01T00:00:00.000Z";

export function buildReplayIntelligenceConvergenceSummary(
  snapshot: ReplayIntelligenceOrchestrationSnapshot,
): ReplayIntelligenceConvergenceSummary {
  const lineageEdges = snapshot.lineage_nodes.reduce(
    (total, node) => total + node.child_replay_ids.length,
    0,
  );

  const anomalyCount = snapshot.anomaly_clusters.reduce(
    (total, cluster) => total + cluster.nodes.length,
    0,
  );

  const forecastCount = snapshot.forecasts.length;

  const heatmapCells = snapshot.heatmap.length;

  const convergenceScore =
    (
      lineageEdges +
      anomalyCount +
      forecastCount +
      heatmapCells
    ) /
    4;

  return {
    lineage_edges: lineageEdges,
    anomaly_count: anomalyCount,
    forecast_count: forecastCount,
    heatmap_cells: heatmapCells,
    convergence_score: Number(
      convergenceScore.toFixed(4),
    ),
  };
}

export function buildReplayIntelligenceOrchestrationSnapshot(
  input: {
    generated_at: string;
    lineage_nodes: ReplayLineageNode[];
    anomaly_clusters: ReplayAnomalyCluster[];
    forecasts: ReplayPredictiveForecast[];
    heatmap: ReplayHeatmapCell[];
    orchestration_hash: string;
  },
): ReplayIntelligenceOrchestrationSnapshot {
  const summary =
    buildReplayIntelligenceConvergenceSummary({
      generated_at: input.generated_at,
      lineage_nodes: input.lineage_nodes,
      anomaly_clusters: input.anomaly_clusters,
      forecasts: input.forecasts,
      heatmap: input.heatmap,
      convergence_score: 0,
      orchestration_hash: input.orchestration_hash,
    });

  return {
    generated_at: input.generated_at,
    lineage_nodes: input.lineage_nodes,
    anomaly_clusters: input.anomaly_clusters,
    forecasts: input.forecasts,
    heatmap: input.heatmap,
    convergence_score: summary.convergence_score,
    orchestration_hash: input.orchestration_hash,
  };
}

export function buildReplayAnomalyClusterSummary(
  clusters: readonly ReplayAnomalyCluster[],
  generatedAt: string = REPLAY_INTELLIGENCE_ORCHESTRATION_FIXTURE_GENERATED_AT,
): ReplayAnomalyClusterSummary {
  const sortedClusters = clusters.slice().sort((left, right) =>
    left.cluster_id.localeCompare(right.cluster_id),
  );
  const nodes = sortedClusters.flatMap((cluster) => cluster.nodes);

  return {
    generated_at: generatedAt,
    cluster_count: sortedClusters.length,
    node_count: nodes.length,
    replay_count: uniqueSorted(sortedClusters.flatMap((cluster) => cluster.replay_ids)).length,
    severity_counts: {
      low: sortedClusters.filter((cluster) => cluster.severity === "low").length,
      medium: sortedClusters.filter((cluster) => cluster.severity === "medium").length,
      high: sortedClusters.filter((cluster) => cluster.severity === "high").length,
    },
    average_anomaly_score: roundDeterministicAverage(
      sortedClusters.map((cluster) => cluster.average_anomaly_score),
    ),
    average_drift_score: roundDeterministicAverage(
      sortedClusters.map((cluster) => cluster.average_drift_score),
    ),
    average_confidence_score: roundDeterministicAverage(
      sortedClusters.map((cluster) => cluster.average_confidence_score),
    ),
    cluster_ids: sortedClusters.map((cluster) => cluster.cluster_id),
  };
}

export function buildReplayHeatmapSummary(
  cells: readonly ReplayHeatmapCell[],
  generatedAt: string = REPLAY_INTELLIGENCE_ORCHESTRATION_FIXTURE_GENERATED_AT,
): ReplayHeatmapSummary {
  const sortedCells = cells.slice().sort((left, right) =>
    left.category.localeCompare(right.category),
  );

  return {
    generated_at: generatedAt,
    cell_count: sortedCells.length,
    replay_count: sortedCells.reduce((total, cell) => total + cell.replay_count, 0),
    categories: sortedCells.map((cell) => cell.category),
    severity_band_counts: {
      low: sortedCells.filter((cell) => cell.severity_band === "low").length,
      medium: sortedCells.filter((cell) => cell.severity_band === "medium").length,
      high: sortedCells.filter((cell) => cell.severity_band === "high").length,
    },
    confidence_band_counts: {
      low: sortedCells.filter((cell) => cell.confidence_band === "low").length,
      medium: sortedCells.filter((cell) => cell.confidence_band === "medium").length,
      high: sortedCells.filter((cell) => cell.confidence_band === "high").length,
    },
    average_severity: roundDeterministicAverage(
      sortedCells.map((cell) => cell.average_severity),
    ),
    average_confidence_score: roundDeterministicAverage(
      sortedCells.map((cell) => cell.average_confidence_score),
    ),
  };
}

export function buildDeterministicReplayIntelligenceOrchestrationSnapshot(
  generatedAt: string = REPLAY_INTELLIGENCE_ORCHESTRATION_FIXTURE_GENERATED_AT,
): ReplayIntelligenceOrchestrationSnapshot {
  return buildReplayIntelligenceOrchestrationSnapshot({
    generated_at: generatedAt,
    lineage_nodes: [
      {
        replay_id: "orchestration-root",
        child_replay_ids: ["orchestration-child-a", "orchestration-child-b"],
        generated_at: generatedAt,
        category: "orchestration_fixture",
        sport: "nba",
        anomaly_score: 0.44,
        drift_score: 0.31,
        confidence_score: 0.91,
        depth: 0,
      },
      {
        replay_id: "orchestration-child-a",
        parent_replay_id: "orchestration-root",
        child_replay_ids: [],
        generated_at: generatedAt,
        category: "orchestration_fixture",
        sport: "nba",
        anomaly_score: 0.82,
        drift_score: 0.64,
        confidence_score: 0.86,
        depth: 1,
      },
      {
        replay_id: "orchestration-child-b",
        parent_replay_id: "orchestration-root",
        child_replay_ids: [],
        generated_at: generatedAt,
        category: "orchestration_fixture",
        sport: "nba",
        anomaly_score: 0.58,
        drift_score: 0.47,
        confidence_score: 0.89,
        depth: 1,
      },
    ],
    anomaly_clusters: [
      {
        cluster_id: "cluster_high",
        generated_at: generatedAt,
        severity: "high",
        average_anomaly_score: 0.82,
        average_drift_score: 0.64,
        average_confidence_score: 0.86,
        replay_ids: ["orchestration-child-a"],
        nodes: [
          {
            replay_id: "orchestration-child-a",
            anomaly_score: 0.82,
            drift_score: 0.64,
            confidence_score: 0.86,
            category: "orchestration_fixture",
            sport: "nba",
            generated_at: generatedAt,
          },
        ],
      },
      {
        cluster_id: "cluster_medium",
        generated_at: generatedAt,
        severity: "medium",
        average_anomaly_score: 0.58,
        average_drift_score: 0.47,
        average_confidence_score: 0.89,
        replay_ids: ["orchestration-child-b"],
        nodes: [
          {
            replay_id: "orchestration-child-b",
            anomaly_score: 0.58,
            drift_score: 0.47,
            confidence_score: 0.89,
            category: "orchestration_fixture",
            sport: "nba",
            generated_at: generatedAt,
          },
        ],
      },
    ],
    forecasts: [
      {
        timestamp: "2026-01-02T00:00:00.000Z",
        projected_anomaly_score: 0.66,
        projected_drift_score: 0.52,
        projected_confidence_score: 0.88,
        anomaly_velocity: 0.08,
        drift_velocity: 0.05,
        confidence_velocity: -0.01,
        anomaly_direction: "up",
        drift_direction: "up",
        confidence_direction: "down",
      },
      {
        timestamp: "2026-01-03T00:00:00.000Z",
        projected_anomaly_score: 0.61,
        projected_drift_score: 0.49,
        projected_confidence_score: 0.89,
        anomaly_velocity: -0.05,
        drift_velocity: -0.03,
        confidence_velocity: 0.01,
        anomaly_direction: "down",
        drift_direction: "down",
        confidence_direction: "up",
      },
    ],
    heatmap: [
      {
        category: "nba",
        replay_count: 2,
        average_severity: 0.7,
        average_confidence_score: 0.875,
        severity_band: "high",
        confidence_band: "high",
      },
      {
        category: "lineage",
        replay_count: 1,
        average_severity: 0.44,
        average_confidence_score: 0.91,
        severity_band: "medium",
        confidence_band: "high",
      },
    ],
    orchestration_hash:
      "replay-intelligence-orchestration:deterministic-fixture-v1",
  });
}

export function buildDeterministicReplayIntelligenceOrchestrationScaffold(
  generatedAt: string = REPLAY_INTELLIGENCE_ORCHESTRATION_FIXTURE_GENERATED_AT,
): ReplayIntelligenceOrchestrationSnapshot {
  return buildDeterministicReplayIntelligenceOrchestrationSnapshot(generatedAt);
}

function roundDeterministicAverage(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const average = values.reduce((total, value) => total + value, 0) / values.length;

  return Number(average.toFixed(4));
}

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right),
  );
}
