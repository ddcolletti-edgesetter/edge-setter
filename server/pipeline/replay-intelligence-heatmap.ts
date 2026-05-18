export interface ReplayHeatmapPoint {
  category: string;
  severity: number;
  confidence_score: number;
  replay_count?: number;
}

export interface ReplayHeatmapCell {
  category: string;

  replay_count: number;

  average_severity: number;
  average_confidence_score: number;

  severity_band: "low" | "medium" | "high";
  confidence_band: "low" | "medium" | "high";
}

export interface ReplayHeatmapResult {
  generated_at: string;
  cells: ReplayHeatmapCell[];
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  return (
    values.reduce((sum, value) => sum + value, 0) /
    values.length
  );
}

function severityBand(
  value: number,
): "low" | "medium" | "high" {
  if (value >= 0.7) {
    return "high";
  }

  if (value >= 0.4) {
    return "medium";
  }

  return "low";
}

function confidenceBand(
  value: number,
): "low" | "medium" | "high" {
  if (value >= 0.85) {
    return "high";
  }

  if (value >= 0.6) {
    return "medium";
  }

  return "low";
}

export function buildReplayHeatmapResult(
  points: ReplayHeatmapPoint[],
): ReplayHeatmapResult {
  const grouped = new Map<
    string,
    ReplayHeatmapPoint[]
  >();

  for (const point of points) {
    if (!grouped.has(point.category)) {
      grouped.set(point.category, []);
    }

    grouped.get(point.category)!.push(point);
  }

  const cells: ReplayHeatmapCell[] = Array.from(
    grouped.entries(),
  )
    .sort(([left], [right]) =>
      left.localeCompare(right),
    )
    .map(([category, rows]) => {
      const averageSeverity = average(
        rows.map((row) => row.severity),
      );

      const averageConfidence = average(
        rows.map((row) => row.confidence_score),
      );

      return {
        category,

        replay_count: rows.reduce(
          (sum, row) => sum + (row.replay_count ?? 1),
          0,
        ),

        average_severity: averageSeverity,
        average_confidence_score:
          averageConfidence,

        severity_band:
          severityBand(averageSeverity),

        confidence_band:
          confidenceBand(averageConfidence),
      };
    });

  return {
    generated_at: new Date().toISOString(),
    cells,
  };
}