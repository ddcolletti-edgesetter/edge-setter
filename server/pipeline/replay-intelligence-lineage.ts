import type {
  ReplayIntelligenceSnapshotContract,
} from "./replay-intelligence-contract";

export interface ReplayLineageNode {
  replay_id: string;
  parent_replay_id?: string;
  child_replay_ids: string[];

  generated_at: string;

  category: string;
  sport: string;

  anomaly_score?: number;
  drift_score?: number;

  confidence_score: number;

  depth: number;
}

export interface ReplayLineageEdge {
  from_replay_id: string;
  to_replay_id: string;

  relationship: "parent" | "child" | "derived";
}

export interface ReplayLineageGraph {
  root_replay_id: string;

  generated_at: string;

  nodes: ReplayLineageNode[];
  edges: ReplayLineageEdge[];

  total_nodes: number;
  max_depth: number;
}

export interface ReplayLineageTraversalResult {
  root_replay_id: string;

  visited_nodes: number;

  traversed_at: string;

  lineage: ReplayLineageGraph;
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

function readString(
  value: unknown,
  fallback: string,
): string {
  return typeof value === "string" ? value : fallback;
}

function readNumber(
  value: unknown,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function buildReplayLineageGraph(
  snapshots: ReplayIntelligenceSnapshotContract[],
): ReplayLineageGraph {
  const nodes: ReplayLineageNode[] = [];
  const edges: ReplayLineageEdge[] = [];

  for (const snapshot of snapshots) {
    const metadata = readMetadata(snapshot);

    const replayId =
      snapshot.scope_id || snapshot.snapshot_id;

    const parentReplayId =
      readString(metadata.parent_replay_id, "");

    const childReplayIds =
      readStringArray(metadata.child_replay_ids);

    const depth =
      readNumber(metadata.lineage_depth, 0);

    nodes.push({
      replay_id: replayId,
      parent_replay_id:
        parentReplayId.length > 0 ? parentReplayId : undefined,
      child_replay_ids: childReplayIds,

      generated_at: snapshot.generated_at,

      category: readString(metadata.category, snapshot.snapshot_kind),
      sport: readString(metadata.sport, "unknown"),

      anomaly_score: readNumber(metadata.anomaly_score, 0),
      drift_score: readNumber(metadata.drift_score, 0),

      confidence_score: readNumber(metadata.confidence_score, 0),

      depth,
    });

    if (parentReplayId.length > 0) {
      edges.push({
        from_replay_id: parentReplayId,
        to_replay_id: replayId,
        relationship: "child",
      });
    }

    for (const childReplayId of childReplayIds) {
      edges.push({
        from_replay_id: replayId,
        to_replay_id: childReplayId,
        relationship: "derived",
      });
    }
  }

  const rootNode =
    nodes.find((node) => !node.parent_replay_id) ??
    nodes[0];

  const maxDepth =
    nodes.reduce(
      (max, node) => Math.max(max, node.depth),
      0,
    );

  return {
    root_replay_id:
      rootNode?.replay_id ?? "unknown",

    generated_at: new Date().toISOString(),

    nodes,
    edges,

    total_nodes: nodes.length,
    max_depth: maxDepth,
  };
}

export function traverseReplayLineage(
  snapshots: ReplayIntelligenceSnapshotContract[],
  rootReplayId: string,
): ReplayLineageTraversalResult {
  const lineage =
    buildReplayLineageGraph(snapshots);

  const visited = new Set<string>();

  const adjacency = new Map<string, string[]>();

  for (const edge of lineage.edges) {
    const existing =
      adjacency.get(edge.from_replay_id) ?? [];

    existing.push(edge.to_replay_id);

    adjacency.set(edge.from_replay_id, existing);
  }

  function walk(replayId: string): void {
    if (visited.has(replayId)) {
      return;
    }

    visited.add(replayId);

    const children =
      adjacency.get(replayId) ?? [];

    for (const child of children) {
      walk(child);
    }
  }

  walk(rootReplayId);

  return {
    root_replay_id: rootReplayId,

    visited_nodes: visited.size,

    traversed_at: new Date().toISOString(),

    lineage,
  };
}