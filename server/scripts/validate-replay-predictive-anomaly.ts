import {
  buildReplayPredictiveForecast,
  ReplayPredictivePoint,
} from "../pipeline/replay-predictive-anomaly";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const points: ReplayPredictivePoint[] = [
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
];

const result = buildReplayPredictiveForecast(points);

assert(result.sample_size === 3, "invalid sample size");

assert(
  result.forecasts.length === 2,
  "invalid forecast count",
);

assert(
  result.forecasts[0].anomaly_direction === "up",
  "invalid anomaly direction",
);

assert(
  result.forecasts[0].drift_direction === "up",
  "invalid drift direction",
);

assert(
  result.forecasts[0].confidence_direction === "down",
  "invalid confidence direction",
);

console.log(
  "Replay predictive anomaly validation passed.",
);

console.log(
  JSON.stringify(
    {
      generated_at: result.generated_at,
      forecasts: result.forecasts,
    },
    null,
    2,
  ),
);