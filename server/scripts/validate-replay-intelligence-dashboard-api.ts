import {
  buildReplayDashboardAggregationResult,
} from "../pipeline/replay-intelligence-dashboard";

import {
  buildReplayIntelligenceTrendResult,
} from "../pipeline/replay-intelligence-timeseries";

import {
  listReplayDashboardAggregateRows,
} from "../pipeline/store";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function main(): void {
  const rows = listReplayDashboardAggregateRows();

  const dashboard = buildReplayDashboardAggregationResult(
    rows.map((row) => ({
      replay_id: row.replay_id,
      parent_replay_id: row.parent_replay_id,
      intelligence_hash: row.intelligence_hash,
      category: row.category,
      timestamp: row.timestamp,
      anomaly_score: row.anomaly_score,
      drift_score: row.drift_score,
      confidence_score: row.confidence_score,
    })),
    {},
  );

  const timeseries = buildReplayIntelligenceTrendResult(
    rows.map((row) => ({
      timestamp: row.timestamp,
      anomaly_score: row.anomaly_score,
      drift_score: row.drift_score,
      confidence_score: row.confidence_score,
    })),
    10,
  );

  assert(dashboard.dataset.summary.total_replays >= 0, "invalid dashboard");
  assert(Array.isArray(timeseries.windows), "invalid timeseries");

  console.log(
    "Replay intelligence dashboard API validation passed.",
  );

  console.log(
    JSON.stringify(
      {
        dashboardSummary: dashboard.dataset.summary,
        timeseriesWindowCount: timeseries.windows.length,
      },
      null,
      2,
    ),
  );
}

main();