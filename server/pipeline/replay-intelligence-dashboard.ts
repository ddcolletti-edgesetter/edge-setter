import {
  ReplayDashboardAggregationResult,
  ReplayDashboardAnomalyPoint,
  ReplayDashboardDataset,
  ReplayDashboardHeatmapCell,
  ReplayDashboardLineageEdge,
  ReplayDashboardLineageGraph,
  ReplayDashboardLineageNode,
  ReplayDashboardQuery,
  ReplayDashboardSummary,
  ReplayDashboardTimeBucket,
} from "./replay-intelligence-dashboard-contract";

export interface ReplayDashboardSourceRecord {
  replay_id: string;
  parent_replay_id?: string | null;

  intelligence_hash: string;

  timestamp: string;
  category: string;

  anomaly_score: number;
  drift_score: number;
  confidence_score: number;
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildReplayDashboardDataset(
  records: ReplayDashboardSourceRecord[],
): ReplayDashboardDataset {
  const timelineMap = new Map<string, ReplayDashboardSourceRecord[]>();
  const heatmapMap = new Map<string, ReplayDashboardSourceRecord[]>();

  const anomalyPoints: ReplayDashboardAnomalyPoint[] = [];
  const lineageNodes: ReplayDashboardLineageNode[] = [];
  const lineageEdges: ReplayDashboardLineageEdge[] = [];

  for (const record of records) {
    const bucket = record.timestamp.slice(0, 13);

    if (!timelineMap.has(bucket)) {
      timelineMap.set(bucket, []);
    }

    timelineMap.get(bucket)!.push(record);

    const heatmapKey = `${record.category}`;

    if (!heatmapMap.has(heatmapKey)) {
      heatmapMap.set(heatmapKey, []);
    }

    heatmapMap.get(heatmapKey)!.push(record);

    if (record.anomaly_score > 0) {
      anomalyPoints.push({
        timestamp: record.timestamp,
        category: record.category,
        severity: record.anomaly_score,
        replay_id: record.replay_id,
        intelligence_hash: record.intelligence_hash,
      });
    }

    lineageNodes.push({
      replay_id: record.replay_id,
      parent_replay_id: record.parent_replay_id ?? null,
      intelligence_hash: record.intelligence_hash,
      created_at: record.timestamp,
      anomaly_score: record.anomaly_score,
      drift_score: record.drift_score,
      confidence_score: record.confidence_score,
    });

    if (record.parent_replay_id) {
      lineageEdges.push({
        source_replay_id: record.parent_replay_id,
        target_replay_id: record.replay_id,
        relationship: "derived",
      });
    }
  }

  const timeline: ReplayDashboardTimeBucket[] = Array.from(
    timelineMap.entries(),
  )
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([timestamp, bucketRecords]) => ({
      timestamp,
      replay_count: bucketRecords.length,
      anomaly_count: bucketRecords.filter(
        (record) => record.anomaly_score > 0,
      ).length,
      drift_score: average(
        bucketRecords.map((record) => record.drift_score),
      ),
      confidence_score: average(
        bucketRecords.map((record) => record.confidence_score),
      ),
    }));

  const heatmap: ReplayDashboardHeatmapCell[] = Array.from(
    heatmapMap.entries(),
  )
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, bucketRecords]) => ({
      dimension: "category",
      label,
      replay_count: bucketRecords.length,
      anomaly_count: bucketRecords.filter(
        (record) => record.anomaly_score > 0,
      ).length,
      drift_score: average(
        bucketRecords.map((record) => record.drift_score),
      ),
      confidence_score: average(
        bucketRecords.map((record) => record.confidence_score),
      ),
    }));

  const summary: ReplayDashboardSummary = {
    total_replays: records.length,
    total_anomalies: anomalyPoints.length,
    average_drift_score: average(
      records.map((record) => record.drift_score),
    ),
    average_confidence_score: average(
      records.map((record) => record.confidence_score),
    ),
    latest_replay_at:
      records.length > 0
        ? records
            .map((record) => record.timestamp)
            .sort()
            .at(-1) ?? null
        : null,
  };

  const lineage: ReplayDashboardLineageGraph = {
    nodes: lineageNodes,
    edges: lineageEdges,
  };

  return {
    summary,
    timeline,
    anomalies: anomalyPoints,
    heatmap,
    lineage,
  };
}

export function buildReplayDashboardAggregationResult(
  records: ReplayDashboardSourceRecord[],
  query: ReplayDashboardQuery,
): ReplayDashboardAggregationResult {
  return {
    generated_at: new Date().toISOString(),
    query,
    dataset: buildReplayDashboardDataset(records),
  };
}