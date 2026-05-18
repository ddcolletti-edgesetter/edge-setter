import {
  buildReplayDashboardAggregationResult,
  ReplayDashboardSourceRecord,
} from "../pipeline/replay-intelligence-dashboard";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const records: ReplayDashboardSourceRecord[] = [
  {
    replay_id: "replay_1",
    parent_replay_id: null,
    intelligence_hash: "hash_a",
    timestamp: "2026-05-18T10:00:00.000Z",
    category: "nba",
    anomaly_score: 0.8,
    drift_score: 0.2,
    confidence_score: 0.95,
  },
  {
    replay_id: "replay_2",
    parent_replay_id: "replay_1",
    intelligence_hash: "hash_b",
    timestamp: "2026-05-18T10:30:00.000Z",
    category: "nba",
    anomaly_score: 0,
    drift_score: 0.1,
    confidence_score: 0.98,
  },
  {
    replay_id: "replay_3",
    parent_replay_id: "replay_2",
    intelligence_hash: "hash_c",
    timestamp: "2026-05-18T11:00:00.000Z",
    category: "mlb",
    anomaly_score: 0.6,
    drift_score: 0.4,
    confidence_score: 0.9,
  },
];

const result = buildReplayDashboardAggregationResult(records, {
  limit: 100,
});

assert(result.dataset.summary.total_replays === 3, "invalid replay count");

assert(
  result.dataset.summary.total_anomalies === 2,
  "invalid anomaly count",
);

assert(
  result.dataset.timeline.length === 2,
  "invalid timeline bucket count",
);

assert(
  result.dataset.heatmap.length === 2,
  "invalid heatmap bucket count",
);

assert(
  result.dataset.lineage.nodes.length === 3,
  "invalid lineage node count",
);

assert(
  result.dataset.lineage.edges.length === 2,
  "invalid lineage edge count",
);

assert(
  result.dataset.anomalies.length === 2,
  "invalid anomaly extraction",
);

console.log("Replay intelligence dashboard validation passed.");
console.log(
  JSON.stringify(
    {
      summary: result.dataset.summary,
      timelineBuckets: result.dataset.timeline.length,
      heatmapBuckets: result.dataset.heatmap.length,
      lineageEdges: result.dataset.lineage.edges.length,
    },
    null,
    2,
  ),
);