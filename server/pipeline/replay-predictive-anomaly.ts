export interface ReplayPredictivePoint {
  timestamp: string;
  anomaly_score: number;
  drift_score: number;
  confidence_score: number;
}

export interface ReplayPredictiveForecast {
  timestamp: string;

  projected_anomaly_score: number;
  projected_drift_score: number;
  projected_confidence_score: number;

  anomaly_velocity: number;
  drift_velocity: number;
  confidence_velocity: number;

  anomaly_direction: "up" | "down" | "flat";
  drift_direction: "up" | "down" | "flat";
  confidence_direction: "up" | "down" | "flat";
}

export interface ReplayPredictiveForecastResult {
  generated_at: string;
  sample_size: number;
  forecasts: ReplayPredictiveForecast[];
}

function direction(
  value: number,
): "up" | "down" | "flat" {
  if (value > 0) {
    return "up";
  }

  if (value < 0) {
    return "down";
  }

  return "flat";
}

export function buildReplayPredictiveForecast(
  points: ReplayPredictivePoint[],
): ReplayPredictiveForecastResult {
  const sorted = [...points].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp),
  );

  const forecasts: ReplayPredictiveForecast[] = [];

  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1];
    const current = sorted[index];

    const anomalyVelocity =
      current.anomaly_score - previous.anomaly_score;

    const driftVelocity =
      current.drift_score - previous.drift_score;

    const confidenceVelocity =
      current.confidence_score -
      previous.confidence_score;

    forecasts.push({
      timestamp: current.timestamp,

      projected_anomaly_score:
        current.anomaly_score + anomalyVelocity,

      projected_drift_score:
        current.drift_score + driftVelocity,

      projected_confidence_score:
        current.confidence_score + confidenceVelocity,

      anomaly_velocity: anomalyVelocity,
      drift_velocity: driftVelocity,
      confidence_velocity: confidenceVelocity,

      anomaly_direction: direction(anomalyVelocity),
      drift_direction: direction(driftVelocity),
      confidence_direction: direction(
        confidenceVelocity,
      ),
    });
  }

  return {
    generated_at: new Date().toISOString(),
    sample_size: sorted.length,
    forecasts,
  };
}