import {
  buildReplayLineageGraph,
  traverseReplayLineage,
} from "../pipeline/replay-intelligence-lineage";

import {
  buildReplayAnomalyClusters,
} from "../pipeline/replay-anomaly-cluster";

import {
  cacheReplaySnapshot,
  getCachedReplaySnapshot,
  clearReplaySnapshotCache,
} from "../pipeline/replay-intelligence-cache";

import {
  persistReplayDashboardSnapshot,
  listReplayDashboardSnapshots,
  clearReplayDashboardSnapshots,
} from "../pipeline/replay-dashboard-snapshot";

import type {
  ReplayIntelligenceSnapshotContract,
} from "../pipeline/replay-intelligence-contract";

function buildSnapshot(
  id: string,
  parent?: string,
  anomaly = 0,
): ReplayIntelligenceSnapshotContract {
  return {
    snapshot_id: id,

    snapshot_kind:
      "drift_trend_snapshot",

    scope: "global",

    scope_id: id,

    generated_at:
      new Date().toISOString(),

    deterministic_hash:
      `hash_${id}`,

    report_version: 1,

    forensic_metrics: {} as ReplayIntelligenceSnapshotContract["forensic_metrics"],

    drift_trends: {} as ReplayIntelligenceSnapshotContract["drift_trends"],

    mutation_frequency: [],

    lineage_depth_metrics: {} as ReplayIntelligenceSnapshotContract["lineage_depth_metrics"],

    ancestry_summaries: [],

    evolution_scores: [],

    metadata: {
      parent_replay_id:
        parent ?? null,

      child_replay_ids: [],

      lineage_depth:
        parent ? 1 : 0,

      anomaly_score:
        anomaly,

      drift_score:
        anomaly,

      confidence_score: 1,

      category: "nba",

      sport: "basketball",
    },
  };
}

function main(): void {
  clearReplaySnapshotCache();

  clearReplayDashboardSnapshots();

  const snapshots: ReplayIntelligenceSnapshotContract[] =
    [
      buildSnapshot(
        "root",
        undefined,
        0.2,
      ),

      buildSnapshot(
        "child_1",
        "root",
        0.7,
      ),

      buildSnapshot(
        "child_2",
        "root",
        0.9,
      ),
    ];

  const lineage =
    buildReplayLineageGraph(
      snapshots,
    );

  if (
    lineage.total_nodes !== 3
  ) {
    throw new Error(
      "Lineage node count mismatch.",
    );
  }

  const traversal =
    traverseReplayLineage(
      snapshots,
      "root",
    );

  if (
    traversal.visited_nodes !==
    3
  ) {
    throw new Error(
      "Traversal mismatch.",
    );
  }

  const clusters =
    buildReplayAnomalyClusters(
      snapshots,
    );

  if (
    clusters.length === 0
  ) {
    throw new Error(
      "Cluster generation failed.",
    );
  }

  cacheReplaySnapshot(
    "root_cache",
    snapshots[0],
  );

  const cached =
    getCachedReplaySnapshot(
      "root_cache",
    );

  if (!cached) {
    throw new Error(
      "Cache retrieval failed.",
    );
  }

  for (const snapshot of snapshots) {
    persistReplayDashboardSnapshot(
      snapshot,
    );
  }

  const persisted =
    listReplayDashboardSnapshots();

  if (
    persisted.length !== 3
  ) {
    throw new Error(
      "Dashboard snapshot persistence mismatch.",
    );
  }

  console.log(
    "Replay lineage + cluster validation passed.",
  );

  console.log(
    JSON.stringify(
      {
        lineage_nodes:
          lineage.total_nodes,

        traversed_nodes:
          traversal.visited_nodes,

        cluster_count:
          clusters.length,

        persisted_snapshots:
          persisted.length,
      },
      null,
      2,
    ),
  );
}

main();