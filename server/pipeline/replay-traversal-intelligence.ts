import crypto from "crypto";

export interface ReplayTraversalNode {
  replay_id: string;
  parent_replay_id?: string;
  depth: number;
  children: string[];
}

export interface ReplayTraversalSummary {
  root_replay_id: string;
  generated_at: string;
  total_nodes: number;
  max_depth: number;
  traversal_hash: string;
}

export function buildReplayTraversalSummary(
  rootReplayId: string,
  nodes: ReplayTraversalNode[],
  generatedAt = new Date().toISOString(),
): ReplayTraversalSummary {
  const maxDepth =
    nodes.length === 0
      ? 0
      : Math.max(...nodes.map((node) => node.depth));

  const traversalHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        rootReplayId,
        nodes,
        maxDepth,
      }),
    )
    .digest("hex");

  return {
    root_replay_id: rootReplayId,
    generated_at: generatedAt,
    total_nodes: nodes.length,
    max_depth: maxDepth,
    traversal_hash: traversalHash,
  };
}
