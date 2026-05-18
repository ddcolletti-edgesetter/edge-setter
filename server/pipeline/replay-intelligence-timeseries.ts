
export interface ReplayIntelligenceTimeseriesPoint {
  timestamp: string;
  anomaly_score: number;
  drift_score: number;
  confidence_score: number;
}

export interface ReplayIntelligenceWindowSummary {
  start_at: string;
  end_at: string;

  replay_count: number;

  average_anomaly_score: number;
  average_drift_score: number;
  average_confidence_score: number;

  anomaly_direction: "up" | "down" | "flat";
  drift_direction: "up" | "down" | "flat";
  confidence_direction: "up" | "down" | "flat";
}

export interface ReplayIntelligenceTrendResult {
  generated_at: string;
  windows: ReplayIntelligenceWindowSummary[];
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function direction(
  current: number,
  previous: number,
): "up" | "down" | "flat" {
  if (current > previous) {
    return "up";
  }

  if (current < previous) {
    return "down";
  }

  return "flat";
}

export function buildReplayIntelligenceTrendResult(
  points: ReplayIntelligenceTimeseriesPoint[],
  windowSize: number,
): ReplayIntelligenceTrendResult {
  const sorted = [...points].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp),
  );

  const windows: ReplayIntelligenceWindowSummary[] = [];

  for (let index = 0; index < sorted.length; index += windowSize) {
    const slice = sorted.slice(index, index + windowSize);

    if (!slice.length) {
      continue;
    }

    const averageAnomalyScore = average(
      slice.map((point) => point.anomaly_score),
    );

    const averageDriftScore = average(
      slice.map((point) => point.drift_score),
    );

    const averageConfidenceScore = average(
      slice.map((point) => point.confidence_score),
    );

    const previous = windows.at(-1);

    windows.push({
      start_at: slice[0].timestamp,
      end_at: slice[slice.length - 1].timestamp,

      replay_count: slice.length,

      average_anomaly_score: averageAnomalyScore,
      average_drift_score: averageDriftScore,
      average_confidence_score: averageConfidenceScore,

      anomaly_direction: previous
        ? direction(
            averageAnomalyScore,
            previous.average_anomaly_score,
          )
        : "flat",

      drift_direction: previous
        ? direction(
            averageDriftScore,
            previous.average_drift_score,
          )
        : "flat",

      confidence_direction: previous
        ? direction(
            averageConfidenceScore,
            previous.average_confidence_score,
          )
        : "flat",
    });
  }

  return {
    generated_at: new Date().toISOString(),
    windows,
  };
}