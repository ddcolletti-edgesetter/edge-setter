import crypto from "crypto";

export interface ReplayArchiveLineageNode {
  archive_id: string;
  parent_archive_id: string | null;
  created_at: string;
  manifest_hash: string;
  bundle_hash: string;
}

export interface ReplayArchiveLineageComparison {
  left_archive_id: string;
  right_archive_id: string;
  shared_parent_id: string | null;
  divergence_depth: number;
  deterministic_hash: string;
  lineage_equal: boolean;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `"${key}":${stableStringify(val)}`);

    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

function hashValue(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(value))
    .digest("hex");
}

function buildAncestorChain(
  archiveId: string,
  nodes: Map<string, ReplayArchiveLineageNode>,
): string[] {
  const chain: string[] = [];

  let current = nodes.get(archiveId);

  while (current) {
    chain.push(current.archive_id);

    if (!current.parent_archive_id) {
      break;
    }

    current = nodes.get(current.parent_archive_id);
  }

  return chain;
}

export function compareReplayArchiveLineage(
  leftArchiveId: string,
  rightArchiveId: string,
  lineageNodes: ReplayArchiveLineageNode[],
): ReplayArchiveLineageComparison {
  const nodeMap = new Map<string, ReplayArchiveLineageNode>();

  for (const node of lineageNodes) {
    nodeMap.set(node.archive_id, node);
  }

  const leftChain = buildAncestorChain(leftArchiveId, nodeMap);
  const rightChain = buildAncestorChain(rightArchiveId, nodeMap);

  let sharedParentId: string | null = null;

  for (const archiveId of leftChain) {
    if (rightChain.includes(archiveId)) {
      sharedParentId = archiveId;
      break;
    }
  }

  const divergenceDepth =
    leftChain.length + rightChain.length -
    (sharedParentId ? 2 : 0);

  const lineageEqual =
    stableStringify(leftChain) === stableStringify(rightChain);

  const deterministicHash = hashValue({
    leftChain,
    rightChain,
    sharedParentId,
    divergenceDepth,
    lineageEqual,
  });

  return {
    left_archive_id: leftArchiveId,
    right_archive_id: rightArchiveId,
    shared_parent_id: sharedParentId,
    divergence_depth: divergenceDepth,
    deterministic_hash: deterministicHash,
    lineage_equal: lineageEqual,
  };
}