import {
  buildReplayIntelligenceTrendResult,
  ReplayIntelligenceTimeseriesPoint,
} from "../pipeline/replay-intelligence-timeseries";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const points: ReplayIntelligenceTimeseriesPoint[] = [
  {
    timestamp: "2026-05-18T10:00:00.000Z",
    anomaly_score: 0.2,
    drift_score: 0.1,
    confidence_score: 0.98,
  },
  {
    timestamp: "2026-05-18T11:00:00.000Z",
    anomaly_score: 0.4,
    drift_score: 0.2,
    confidence_score: 0.96,
  },
  {
    timestamp: "2026-05-18T12:00:00.000Z",
    anomaly_score: 0.7,
    drift_score: 0.5,
    confidence_score: 0.9,
  },
  {
    timestamp: "2026-05-18T13:00:00.000Z",
    anomaly_score: 0.6,
    drift_score: 0.45,
    confidence_score: 0.91,
  },
];

const result = buildReplayIntelligenceTrendResult(points, 2);

assert(result.windows.length === 2, "invalid window count");

assert(
  result.windows[0].anomaly_direction === "flat",
  "invalid first anomaly direction",
);

assert(
  result.windows[1].anomaly_direction === "up",
  "invalid anomaly trend direction",
);

assert(
  result.windows[1].drift_direction === "up",
  "invalid drift trend direction",
);

assert(
  result.windows[1].confidence_direction === "down",
  "invalid confidence trend direction",
);

console.log("Replay intelligence timeseries validation passed.");
console.log(
  JSON.stringify(
    {
      generated_at: result.generated_at,
      windows: result.windows,
    },
    null,
    2,
  ),
);