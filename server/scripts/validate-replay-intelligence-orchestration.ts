import crypto from "crypto";

import {
  buildReplayIntelligenceOrchestrationSnapshot,
  buildReplayIntelligenceConvergenceSummary,
} from "../pipeline/replay-intelligence-orchestration";

const snapshot =
  buildReplayIntelligenceOrchestrationSnapshot({
    generated_at: "2026-01-01T00:00:00.000Z",

    lineage_nodes: [
      {
        replay_id: "root",
        child_replay_ids: ["child-a", "child-b"],
        generated_at: "2026-01-01T00:00:00.000Z",
        category: "fixture",
        sport: "nba",
        anomaly_score: 0.5,
        drift_score: 0.4,
        confidence_score: 0.9,
        depth: 0,
      },
    ],

    anomaly_clusters: [
      {
        cluster_id: "cluster-1",
        generated_at: "2026-01-01T00:00:00.000Z",
        severity: "high",
        average_anomaly_score: 0.92,
        average_drift_score: 0.68,
        average_confidence_score: 0.88,
        replay_ids: ["replay-1", "replay-2"],
        nodes: [
          {
            replay_id: "replay-1",
            anomaly_score: 0.91,
            drift_score: 0.67,
            confidence_score: 0.89,
            category: "fixture",
            sport: "nba",
            generated_at: "2026-01-01T00:00:00.000Z",
          },
          {
            replay_id: "replay-2",
            anomaly_score: 0.93,
            drift_score: 0.69,
            confidence_score: 0.87,
            category: "fixture",
            sport: "nba",
            generated_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    ],

    forecasts: [
      {
        timestamp: "2026-01-02T00:00:00.000Z",
        projected_anomaly_score: 0.81,
        projected_drift_score: 0.62,
        projected_confidence_score: 0.88,
        anomaly_velocity: 0.04,
        drift_velocity: 0.02,
        confidence_velocity: -0.01,
        anomaly_direction: "up",
        drift_direction: "up",
        confidence_direction: "down",
      },
    ],

    heatmap: [
      {
        category: "nba",
        replay_count: 12,
        average_severity: 0.77,
        average_confidence_score: 0.86,
        severity_band: "high",
        confidence_band: "high",
      },
    ],

    orchestration_hash: crypto
      .createHash("sha256")
      .update("orchestration")
      .digest("hex"),
  });

const summary =
  buildReplayIntelligenceConvergenceSummary(
    snapshot,
  );

if (summary.lineage_edges !== 2) {
  throw new Error(
    "Expected lineage edge count to equal 2",
  );
}

if (summary.anomaly_count !== 2) {
  throw new Error(
    "Expected anomaly replay count to equal 2",
  );
}

if (summary.forecast_count !== 1) {
  throw new Error(
    "Expected forecast count to equal 1",
  );
}

if (summary.heatmap_cells !== 1) {
  throw new Error(
    "Expected heatmap cell count to equal 1",
  );
}

if (snapshot.convergence_score <= 0) {
  throw new Error(
    "Expected convergence score to be positive",
  );
}

console.log(
  "Replay intelligence orchestration validation passed.",
);

console.log(
  JSON.stringify(
    {
      summary,
      orchestration_hash:
        snapshot.orchestration_hash,
    },
    null,
    2,
  ),
);
