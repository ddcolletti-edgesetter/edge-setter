import type {
  ReplayIntelligenceSnapshotContract,
} from "./replay-intelligence-contract";

export interface ReplayAnomalyClusterNode {
  replay_id: string;

  anomaly_score: number;
  drift_score: number;
  confidence_score: number;

  category: string;
  sport: string;

  generated_at: string;
}

export interface ReplayAnomalyCluster {
  cluster_id: string;

  generated_at: string;

  severity: "low" | "medium" | "high";

  average_anomaly_score: number;
  average_drift_score: number;
  average_confidence_score: number;

  replay_ids: string[];

  nodes: ReplayAnomalyClusterNode[];
}

function readMetadata(
  snapshot: ReplayIntelligenceSnapshotContract,
): Record<string, unknown> {
  if (
    snapshot.metadata &&
    typeof snapshot.metadata === "object" &&
    !Array.isArray(snapshot.metadata)
  ) {
    return snapshot.metadata as Record<string, unknown>;
  }

  return {};
}

function readNumber(
  value: unknown,
  fallback: number,
): number {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : fallback;
}

function readString(
  value: unknown,
  fallback: string,
): string {
  return typeof value === "string"
    ? value
    : fallback;
}

function computeSeverity(
  anomalyScore: number,
): "low" | "medium" | "high" {
  if (anomalyScore >= 0.8) {
    return "high";
  }

  if (anomalyScore >= 0.5) {
    return "medium";
  }

  return "low";
}

export function buildReplayAnomalyClusters(
  snapshots: ReplayIntelligenceSnapshotContract[],
): ReplayAnomalyCluster[] {
  const grouped = new Map<
    string,
    ReplayAnomalyClusterNode[]
  >();

  for (const snapshot of snapshots) {
    const metadata = readMetadata(snapshot);

    const anomalyScore =
      readNumber(
        metadata.anomaly_score,
        0,
      );

    const driftScore =
      readNumber(
        metadata.drift_score,
        0,
      );

    const confidenceScore =
      readNumber(
        metadata.confidence_score,
        0,
      );

    const category =
      readString(
        metadata.category,
        snapshot.snapshot_kind,
      );

    const sport =
      readString(
        metadata.sport,
        "unknown",
      );

    const severity =
      computeSeverity(anomalyScore);

    const replayId =
      snapshot.scope_id ||
      snapshot.snapshot_id;

    const existing =
      grouped.get(severity) ?? [];

    existing.push({
      replay_id: replayId,

      anomaly_score: anomalyScore,
      drift_score: driftScore,
      confidence_score: confidenceScore,

      category,
      sport,

      generated_at:
        snapshot.generated_at,
    });

    grouped.set(severity, existing);
  }

  const clusters: ReplayAnomalyCluster[] = [];

    grouped.forEach((nodes, severity) => {
    const anomalyTotal =
      nodes.reduce(
        (sum, node) =>
          sum + node.anomaly_score,
        0,
      );

    const driftTotal =
      nodes.reduce(
        (sum, node) =>
          sum + node.drift_score,
        0,
      );

    const confidenceTotal =
      nodes.reduce(
        (sum, node) =>
          sum + node.confidence_score,
        0,
      );

    clusters.push({
      cluster_id:
        `cluster_${severity}`,

      generated_at:
        new Date().toISOString(),

      severity:
        severity as
          | "low"
          | "medium"
          | "high",

      average_anomaly_score:
        nodes.length > 0
          ? anomalyTotal / nodes.length
          : 0,

      average_drift_score:
        nodes.length > 0
          ? driftTotal / nodes.length
          : 0,

      average_confidence_score:
        nodes.length > 0
          ? confidenceTotal /
            nodes.length
          : 0,

      replay_ids:
        nodes.map(
          (node) => node.replay_id,
        ),

      nodes,
    });
});

  return clusters.sort(
    (a, b) =>
      b.average_anomaly_score -
      a.average_anomaly_score,
  );
}