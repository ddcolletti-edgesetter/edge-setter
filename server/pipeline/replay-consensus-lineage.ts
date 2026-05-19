import crypto from "node:crypto";

import type Database from "better-sqlite3";

import type {
  ReplayArbitrationResult,
} from "./replay-arbitration-contract";
import {
  initializeReplayOrchestrationPersistenceSchema,
} from "./replay-orchestration-persistence";
import type {
  ReplayConsensusResult,
  ReplayConsensusValidatorResult,
} from "./replay-consensus-contract";
import type {
  ReplayConsensusLineageEdge,
  ReplayConsensusLineageEdgeKind,
  ReplayConsensusLineageNode,
  ReplayConsensusLineageNodeKind,
  ReplayConsensusLineageSnapshot,
  ReplayConsensusLineageTraversal,
} from "./replay-consensus-lineage-contract";
import type {
  ReplayRecoveryCoordinationResult,
} from "./replay-recovery-coordination-contract";

type SqliteDatabase = Database.Database;

interface PayloadRow {
  readonly payload: string;
}

interface HistoryRow {
  readonly history_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly event_type: string;
  readonly source_hash: string;
  readonly generated_at: string;
  readonly persisted_at: string;
  readonly sequence: number;
  readonly history_hash: string;
}

interface BranchRow {
  readonly branch_state_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly source_branch_hash: string;
  readonly recovered_branch_hash: string;
  readonly state: string;
  readonly promotion_ready: number;
  readonly persisted_at: string;
  readonly persistence_hash: string;
}

interface CheckpointRow {
  readonly checkpoint_id: string;
  readonly run_id: string;
  readonly replay_hash: string;
  readonly parent_replay_hash: string | null;
  readonly rollback_required: number;
  readonly checkpoint_hash: string;
  readonly persisted_at: string;
  readonly persistence_hash: string;
}

export function buildReplayConsensusLineageSnapshot(
  db: SqliteDatabase,
  runId: string,
): ReplayConsensusLineageSnapshot {
  initializeReplayOrchestrationPersistenceSchema(db);

  const run = loadRun(db, runId);
  const consensusResults = loadConsensusResults(db, runId);
  const arbitrationResults = loadArbitrationResults(db, runId);
  const recoveryResults = loadRecoveryResults(db, runId);
  const historyRows = loadHistoryRows(db, runId);
  const branchRows = loadBranchRows(db, runId);
  const checkpointRows = loadCheckpointRows(db, runId);
  const generatedAt = run?.generated_at ??
    latestTimestamp(historyRows.map((row) => row.generated_at));
  const nodes = buildNodes({
    runId,
    generatedAt,
    runHash: run?.run_hash ?? runId,
    consensusResults,
    arbitrationResults,
    recoveryResults,
    historyRows,
    branchRows,
    checkpointRows,
  });
  const edges = buildEdges({
    runId,
    runNodeId: nodeId("orchestration_run", runId),
    consensusResults,
    arbitrationResults,
    recoveryResults,
    historyRows,
    branchRows,
    checkpointRows,
  }, nodes);
  const replayHashes = Array.from(new Set(nodes.map((node) => node.replay_hash)))
    .sort((left, right) => left.localeCompare(right));
  const graphSeed = {
    run_id: runId,
    generated_at: generatedAt,
    node_hashes: nodes.map((node) => node.node_hash),
    edge_hashes: edges.map((edge) => edge.edge_hash),
    replay_hashes: replayHashes,
  };
  const graphHash = deterministicHash(graphSeed);

  return deepFreeze({
    run_id: runId,
    generated_at: generatedAt,
    node_count: nodes.length,
    edge_count: edges.length,
    replay_hashes: replayHashes,
    nodes,
    edges,
    graph_hash: graphHash,
    deterministic_hash: deterministicHash({
      ...graphSeed,
      graph_hash: graphHash,
    }),
  });
}

export function getReplayAncestry(
  graph: ReplayConsensusLineageSnapshot,
  replayHash: string,
): ReplayConsensusLineageTraversal {
  return traverse(graph, replayHash, "replay_ancestry", (edge, nodeIds) =>
    edge.kind === "descends_from" &&
    nodeIds.has(edge.to_node_id),
  );
}

export function getBranchDescendants(
  graph: ReplayConsensusLineageSnapshot,
  replayHash: string,
): ReplayConsensusLineageTraversal {
  return traverse(graph, replayHash, "branch_descendants", (edge, nodeIds) =>
    edge.kind === "descends_from" &&
    nodeIds.has(edge.from_node_id),
  );
}

export function getValidatorInfluenceChain(
  graph: ReplayConsensusLineageSnapshot,
  validatorId: string,
): ReplayConsensusLineageTraversal {
  return traverseFromNodeIds(
    graph,
    validatorId,
    "validator_influence_chain",
    graph.nodes
      .filter((node) => node.kind === "validator" && node.metadata.validator_id === validatorId)
      .map((node) => node.node_id),
    (edge, nodeIds) =>
      ((edge.kind === "participates_in" || edge.kind === "propagates_influence") && nodeIds.has(edge.from_node_id)) ||
      (edge.kind === "arbitrates" && nodeIds.has(edge.from_node_id)) ||
      (edge.kind === "recovers" && nodeIds.has(edge.from_node_id)),
  );
}

export function getRecoveryAncestry(
  graph: ReplayConsensusLineageSnapshot,
  replayHash: string,
): ReplayConsensusLineageTraversal {
  return traverseKinds(graph, replayHash, "recovery_ancestry", [
    "recovery_coordination",
    "checkpoint",
    "replay_branch",
    "arbitration_outcome",
    "consensus_decision",
    "validator",
  ]);
}

export function getArbitrationAncestry(
  graph: ReplayConsensusLineageSnapshot,
  replayHash: string,
): ReplayConsensusLineageTraversal {
  return traverseKinds(graph, replayHash, "arbitration_ancestry", [
    "arbitration_outcome",
    "consensus_decision",
    "validator",
    "divergence",
  ]);
}

export function getConvergenceLineage(
  graph: ReplayConsensusLineageSnapshot,
  replayHash: string,
): ReplayConsensusLineageTraversal {
  const nodes = graph.nodes.filter((node) =>
    node.kind === "orchestration_run" ||
    (node.replay_hash === replayHash && [
      "execution_history",
      "consensus_decision",
      "arbitration_outcome",
      "recovery_coordination",
    ].includes(node.kind)),
  );
  const nodeIds = new Set(nodes.map((node) => node.node_id));
  const edges = graph.edges.filter((edge) =>
    nodeIds.has(edge.from_node_id) &&
    nodeIds.has(edge.to_node_id) &&
    (edge.replay_hash === replayHash || edge.kind === "records_history"),
  );

  return buildTraversal(replayHash, "convergence_lineage", [...nodes].sort(compareNodes), [...edges].sort(compareEdges));
}

export function getCheckpointGenealogy(
  graph: ReplayConsensusLineageSnapshot,
  checkpointId: string,
): ReplayConsensusLineageTraversal {
  const checkpointNodes = graph.nodes
    .filter((node) => node.kind === "checkpoint" && node.metadata.checkpoint_id === checkpointId)
  const roots = checkpointNodes.map((node) => node.node_id);
  const checkpointHashes = new Set(checkpointNodes.map((node) => node.source_hash));

  return traverseFromNodeIds(graph, checkpointId, "checkpoint_genealogy", roots, (edge, nodeIds) =>
    (edge.kind === "anchors_checkpoint" && (nodeIds.has(edge.from_node_id) || nodeIds.has(edge.to_node_id))) ||
    (edge.kind === "anchors_checkpoint" && checkpointHashes.has(edge.source_hash)) ||
    (edge.kind === "descends_from" && nodeIds.has(edge.to_node_id)),
  );
}

function buildNodes(input: {
  readonly runId: string;
  readonly generatedAt: string;
  readonly runHash: string;
  readonly consensusResults: readonly ReplayConsensusResult[];
  readonly arbitrationResults: readonly ReplayArbitrationResult[];
  readonly recoveryResults: readonly ReplayRecoveryCoordinationResult[];
  readonly historyRows: readonly HistoryRow[];
  readonly branchRows: readonly BranchRow[];
  readonly checkpointRows: readonly CheckpointRow[];
}): readonly ReplayConsensusLineageNode[] {
  const nodes: ReplayConsensusLineageNode[] = [
    buildNode("orchestration_run", input.runId, input.runId, input.runId, input.generatedAt, {
      run_id: input.runId,
      run_hash: input.runHash,
    }),
  ];

  for (const consensus of input.consensusResults) {
    nodes.push(buildNode("consensus_decision", consensus.replay_hash, consensus.consensus_hash, `consensus:${consensus.replay_hash}`, consensus.generated_at, {
      consensus_vote: consensus.summary.consensus_vote,
      confidence: consensus.summary.consensus_confidence,
      divergence_detected: consensus.divergence.divergence_detected,
    }));
    if (consensus.divergence.divergence_detected) {
      nodes.push(buildNode("divergence", consensus.replay_hash, consensus.divergence.divergence_hash, `divergence:${consensus.divergence.dominant_category}`, consensus.generated_at, {
        dominant_category: consensus.divergence.dominant_category,
        categories: consensus.divergence.categories.join(","),
      }));
    }
    for (const validator of consensus.validators) {
      nodes.push(buildValidatorNode(consensus.replay_hash, validator));
    }
  }

  for (const arbitration of input.arbitrationResults) {
    nodes.push(buildNode("arbitration_outcome", arbitration.consensus_reference.replay_hash, arbitration.deterministic_hash, `arbitration:${arbitration.adjudication.outcome}`, arbitration.generated_at, {
      outcome: arbitration.adjudication.outcome,
      confidence: arbitration.adjudication.confidence,
      severity: arbitration.severity.score,
    }));
  }

  for (const recovery of input.recoveryResults) {
    nodes.push(buildNode("recovery_coordination", recovery.arbitration_reference.replay_hash, recovery.deterministic_hash, `recovery:${recovery.summary.state}`, recovery.generated_at, {
      state: recovery.summary.state,
      confidence: recovery.confidence.score,
      action_count: recovery.summary.action_count,
    }));
  }

  for (const branch of input.branchRows) {
    nodes.push(buildNode("replay_branch", branch.replay_hash, branch.replay_hash, `branch:${branch.state}`, branch.persisted_at, {
      source_branch_hash: branch.source_branch_hash,
      recovered_branch_hash: branch.recovered_branch_hash,
      state: branch.state,
      promotion_ready: branch.promotion_ready === 1,
    }));
  }

  for (const checkpoint of input.checkpointRows) {
    nodes.push(buildNode("checkpoint", checkpoint.replay_hash, checkpoint.checkpoint_hash, `checkpoint:${checkpoint.checkpoint_id}`, checkpoint.persisted_at, {
      checkpoint_id: checkpoint.checkpoint_id,
      parent_replay_hash: checkpoint.parent_replay_hash,
      rollback_required: checkpoint.rollback_required === 1,
    }));
  }

  for (const history of input.historyRows) {
    nodes.push(buildNode("execution_history", history.replay_hash, history.history_hash, `history:${history.event_type}:${history.sequence}`, history.generated_at, {
      event_type: history.event_type,
      sequence: history.sequence,
    }));
  }

  for (const replayHash of collectReplayBranchHashes(input)) {
    nodes.push(buildNode("replay_branch", replayHash, replayHash, `branch:${replayHash}`, input.generatedAt, {
      source_branch_hash: replayHash,
      recovered_branch_hash: replayHash,
      state: "inferred",
      promotion_ready: false,
    }));
  }

  return deepFreeze([...dedupeNodes(nodes)].sort(compareNodes));
}

function buildEdges(input: {
  readonly runId: string;
  readonly runNodeId: string;
  readonly consensusResults: readonly ReplayConsensusResult[];
  readonly arbitrationResults: readonly ReplayArbitrationResult[];
  readonly recoveryResults: readonly ReplayRecoveryCoordinationResult[];
  readonly historyRows: readonly HistoryRow[];
  readonly branchRows: readonly BranchRow[];
  readonly checkpointRows: readonly CheckpointRow[];
}, nodes: readonly ReplayConsensusLineageNode[]): readonly ReplayConsensusLineageEdge[] {
  const edges: ReplayConsensusLineageEdge[] = [];
  const nodeIds = new Set(nodes.map((node) => node.node_id));

  for (const consensus of input.consensusResults) {
    const consensusNodeId = nodeId("consensus_decision", consensus.consensus_hash);
    edges.push(buildEdge("orchestrates", input.runNodeId, consensusNodeId, consensus.replay_hash, consensus.consensus_hash));
    if (consensus.compared_replay_hash) {
      addReplayBranchEdge(edges, "descends_from", consensus.compared_replay_hash, consensus.replay_hash, consensus.consensus_hash, nodeIds);
    }
    if (consensus.divergence.divergence_detected) {
      const divergenceNodeId = nodeId("divergence", consensus.divergence.divergence_hash);
      edges.push(buildEdge("tracks_divergence", consensusNodeId, divergenceNodeId, consensus.replay_hash, consensus.divergence.divergence_hash));
    }
    for (const validator of consensus.validators) {
      const validatorNodeId = nodeId("validator", validator.validator_hash);
      edges.push(buildEdge("participates_in", validatorNodeId, consensusNodeId, consensus.replay_hash, validator.validator_hash));
      if (consensus.divergence.divergence_detected && validator.divergence_categories.some((category) => category !== "none")) {
        edges.push(buildEdge("propagates_influence", validatorNodeId, nodeId("divergence", consensus.divergence.divergence_hash), consensus.replay_hash, validator.validator_hash));
      }
    }
  }

  for (const arbitration of input.arbitrationResults) {
    edges.push(buildEdge(
      "arbitrates",
      nodeId("consensus_decision", arbitration.consensus_reference.consensus_hash),
      nodeId("arbitration_outcome", arbitration.deterministic_hash),
      arbitration.consensus_reference.replay_hash,
      arbitration.deterministic_hash,
    ));
  }

  for (const recovery of input.recoveryResults) {
    const recoveryNodeId = nodeId("recovery_coordination", recovery.deterministic_hash);
    edges.push(buildEdge(
      "recovers",
      nodeId("arbitration_outcome", recovery.arbitration_reference.arbitration_hash),
      recoveryNodeId,
      recovery.arbitration_reference.replay_hash,
      recovery.deterministic_hash,
    ));
    edges.push(buildEdge(
      "evolves_to",
      recoveryNodeId,
      nodeId("replay_branch", recovery.arbitration_reference.replay_hash),
      recovery.arbitration_reference.replay_hash,
      recovery.branch_restoration.branch_plan_hash,
    ));
    edges.push(buildEdge(
      "anchors_checkpoint",
      recoveryNodeId,
      nodeId("checkpoint", recovery.checkpoint.checkpoint_hash),
      recovery.arbitration_reference.replay_hash,
      recovery.checkpoint.checkpoint_hash,
    ));
    for (const lineage of recovery.lineage) {
      if (lineage.parent_replay_hash) {
        addReplayBranchEdge(edges, "inherits_recovery", lineage.parent_replay_hash, recovery.arbitration_reference.replay_hash, lineage.recovery_lineage_hash, nodeIds);
      }
    }
  }

  for (const branch of input.branchRows) {
    addReplayBranchEdge(edges, "descends_from", branch.source_branch_hash, branch.replay_hash, branch.persistence_hash, nodeIds);
  }

  for (const checkpoint of input.checkpointRows) {
    if (checkpoint.parent_replay_hash) {
      addReplayBranchEdge(edges, "anchors_checkpoint", checkpoint.parent_replay_hash, checkpoint.replay_hash, checkpoint.checkpoint_hash, nodeIds);
    }
  }

  for (const history of input.historyRows) {
    edges.push(buildEdge(
      "records_history",
      input.runNodeId,
      nodeId("execution_history", history.history_hash),
      history.replay_hash,
      history.history_hash,
    ));
  }

  return deepFreeze([...dedupeEdges(edges.filter((edge) =>
    nodeIds.has(edge.from_node_id) && nodeIds.has(edge.to_node_id),
  ))].sort(compareEdges));
}

function buildValidatorNode(
  replayHash: string,
  validator: ReplayConsensusValidatorResult,
): ReplayConsensusLineageNode {
  return buildNode("validator", replayHash, validator.validator_hash, `validator:${validator.validator_id}`, validator.generated_at, {
    validator_id: validator.validator_id,
    validator_type: validator.validator_type,
    vote: validator.vote,
    weight: validator.weight,
    propagated_confidence: validator.propagated_confidence,
    lineage_hash: validator.lineage_reference.lineage_hash,
  });
}

function buildNode(
  kind: ReplayConsensusLineageNodeKind,
  replayHash: string,
  sourceHash: string,
  label: string,
  generatedAt: string,
  metadata: Readonly<Record<string, string | number | boolean | null>>,
): ReplayConsensusLineageNode {
  const payload = {
    kind,
    replay_hash: replayHash,
    source_hash: sourceHash,
    label,
    generated_at: generatedAt,
    metadata: sortRecord(metadata),
  };
  const hash = deterministicHash(payload);

  return deepFreeze({
    node_id: nodeId(kind, sourceHash),
    ...payload,
    node_hash: hash,
  });
}

function buildEdge(
  kind: ReplayConsensusLineageEdgeKind,
  fromNodeId: string,
  toNodeId: string,
  replayHash: string,
  sourceHash: string,
): ReplayConsensusLineageEdge {
  const payload = {
    kind,
    from_node_id: fromNodeId,
    to_node_id: toNodeId,
    replay_hash: replayHash,
    source_hash: sourceHash,
  };
  const hash = deterministicHash(payload);

  return deepFreeze({
    edge_id: `replay-consensus-lineage-edge:${hash}`,
    ...payload,
    edge_hash: hash,
  });
}

function addReplayBranchEdge(
  edges: ReplayConsensusLineageEdge[],
  kind: ReplayConsensusLineageEdgeKind,
  parentReplayHash: string,
  childReplayHash: string,
  sourceHash: string,
  nodeIds: ReadonlySet<string>,
): void {
  const parentNode = nodeId("replay_branch", parentReplayHash);
  const childNode = nodeId("replay_branch", childReplayHash);
  if (!nodeIds.has(parentNode) || !nodeIds.has(childNode)) return;
  edges.push(buildEdge(kind, parentNode, childNode, childReplayHash, sourceHash));
}

function traverseKinds(
  graph: ReplayConsensusLineageSnapshot,
  replayHash: string,
  query: string,
  kinds: readonly ReplayConsensusLineageNodeKind[],
): ReplayConsensusLineageTraversal {
  const nodes = graph.nodes.filter((node) =>
    node.replay_hash === replayHash && kinds.includes(node.kind),
  );
  const nodeIds = new Set(nodes.map((node) => node.node_id));
  const edges = graph.edges.filter((edge) =>
    nodeIds.has(edge.from_node_id) && nodeIds.has(edge.to_node_id),
  );
  return buildTraversal(replayHash, query, nodes, edges);
}

function traverse(
  graph: ReplayConsensusLineageSnapshot,
  replayHash: string,
  query: string,
  includeEdge: (edge: ReplayConsensusLineageEdge, nodeIds: ReadonlySet<string>) => boolean,
): ReplayConsensusLineageTraversal {
  return traverseFromNodeIds(
    graph,
    replayHash,
    query,
    graph.nodes
      .filter((node) => node.kind === "replay_branch" && node.replay_hash === replayHash)
      .map((node) => node.node_id),
    includeEdge,
  );
}

function traverseFromNodeIds(
  graph: ReplayConsensusLineageSnapshot,
  root: string,
  query: string,
  rootNodeIds: readonly string[],
  includeEdge: (edge: ReplayConsensusLineageEdge, nodeIds: ReadonlySet<string>) => boolean,
): ReplayConsensusLineageTraversal {
  const nodeIds = new Set(rootNodeIds);
  const edgeIds = new Set<string>();
  let changed = true;

  while (changed) {
    changed = false;
    for (const edge of graph.edges) {
      if (!includeEdge(edge, nodeIds)) continue;
      if (!edgeIds.has(edge.edge_id)) {
        edgeIds.add(edge.edge_id);
        changed = true;
      }
      if (!nodeIds.has(edge.from_node_id)) {
        nodeIds.add(edge.from_node_id);
        changed = true;
      }
      if (!nodeIds.has(edge.to_node_id)) {
        nodeIds.add(edge.to_node_id);
        changed = true;
      }
    }
  }

  const nodes = graph.nodes.filter((node) => nodeIds.has(node.node_id)).sort(compareNodes);
  const edges = graph.edges.filter((edge) => edgeIds.has(edge.edge_id)).sort(compareEdges);
  return buildTraversal(root, query, nodes, edges);
}

function buildTraversal(
  root: string,
  query: string,
  nodes: readonly ReplayConsensusLineageNode[],
  edges: readonly ReplayConsensusLineageEdge[],
): ReplayConsensusLineageTraversal {
  const payload = {
    root,
    query,
    node_hashes: nodes.map((node) => node.node_hash),
    edge_hashes: edges.map((edge) => edge.edge_hash),
  };

  return deepFreeze({
    root,
    query,
    nodes: deepFreeze([...nodes]),
    edges: deepFreeze([...edges]),
    traversal_hash: deterministicHash(payload),
  });
}

function loadRun(db: SqliteDatabase, runId: string): { readonly run_hash: string; readonly generated_at: string } | null {
  return db.prepare("SELECT run_hash, generated_at FROM replay_orchestration_runs WHERE run_id = ?")
    .get(runId) as { readonly run_hash: string; readonly generated_at: string } | undefined ?? null;
}

function loadConsensusResults(db: SqliteDatabase, runId: string): readonly ReplayConsensusResult[] {
  const rows = db.prepare(`
    SELECT payload FROM replay_orchestration_consensus_results
    WHERE run_id = ?
    ORDER BY replay_hash ASC, consensus_hash ASC
  `).all(runId) as PayloadRow[];
  return rows.map((row) => JSON.parse(row.payload) as ReplayConsensusResult);
}

function loadArbitrationResults(db: SqliteDatabase, runId: string): readonly ReplayArbitrationResult[] {
  const rows = db.prepare(`
    SELECT payload FROM replay_orchestration_arbitration_results
    WHERE run_id = ?
    ORDER BY replay_hash ASC, arbitration_hash ASC
  `).all(runId) as PayloadRow[];
  return rows.map((row) => JSON.parse(row.payload) as ReplayArbitrationResult);
}

function loadRecoveryResults(db: SqliteDatabase, runId: string): readonly ReplayRecoveryCoordinationResult[] {
  const rows = db.prepare(`
    SELECT payload FROM replay_orchestration_recovery_results
    WHERE run_id = ?
    ORDER BY replay_hash ASC, recovery_hash ASC
  `).all(runId) as PayloadRow[];
  return rows.map((row) => JSON.parse(row.payload) as ReplayRecoveryCoordinationResult);
}

function loadHistoryRows(db: SqliteDatabase, runId: string): readonly HistoryRow[] {
  return db.prepare(`
    SELECT * FROM replay_orchestration_execution_history
    WHERE run_id = ?
    ORDER BY sequence ASC, history_id ASC
  `).all(runId) as HistoryRow[];
}

function loadBranchRows(db: SqliteDatabase, runId: string): readonly BranchRow[] {
  return db.prepare(`
    SELECT * FROM replay_orchestration_branch_state
    WHERE run_id = ?
    ORDER BY replay_hash ASC, branch_state_id ASC
  `).all(runId) as BranchRow[];
}

function loadCheckpointRows(db: SqliteDatabase, runId: string): readonly CheckpointRow[] {
  return db.prepare(`
    SELECT * FROM replay_orchestration_recovery_checkpoints
    WHERE run_id = ?
    ORDER BY replay_hash ASC, checkpoint_id ASC
  `).all(runId) as CheckpointRow[];
}

function nodeId(kind: ReplayConsensusLineageNodeKind, sourceHash: string): string {
  return `replay-consensus-lineage-node:${kind}:${sourceHash}`;
}

function collectReplayBranchHashes(input: {
  readonly consensusResults: readonly ReplayConsensusResult[];
  readonly recoveryResults: readonly ReplayRecoveryCoordinationResult[];
  readonly branchRows: readonly BranchRow[];
  readonly checkpointRows: readonly CheckpointRow[];
}): readonly string[] {
  const hashes = new Set<string>();

  for (const consensus of input.consensusResults) {
    hashes.add(consensus.replay_hash);
    if (consensus.compared_replay_hash) hashes.add(consensus.compared_replay_hash);
  }
  for (const recovery of input.recoveryResults) {
    hashes.add(recovery.arbitration_reference.replay_hash);
    hashes.add(recovery.branch_restoration.source_branch_hash);
    for (const lineage of recovery.lineage) {
      hashes.add(lineage.replay_hash);
      if (lineage.parent_replay_hash) hashes.add(lineage.parent_replay_hash);
    }
  }
  for (const branch of input.branchRows) {
    hashes.add(branch.replay_hash);
    hashes.add(branch.source_branch_hash);
  }
  for (const checkpoint of input.checkpointRows) {
    hashes.add(checkpoint.replay_hash);
    if (checkpoint.parent_replay_hash) hashes.add(checkpoint.parent_replay_hash);
  }

  return Array.from(hashes).sort((left, right) => left.localeCompare(right));
}

function compareNodes(
  left: ReplayConsensusLineageNode,
  right: ReplayConsensusLineageNode,
): number {
  return left.kind.localeCompare(right.kind) ||
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.node_id.localeCompare(right.node_id);
}

function compareEdges(
  left: ReplayConsensusLineageEdge,
  right: ReplayConsensusLineageEdge,
): number {
  return left.kind.localeCompare(right.kind) ||
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.edge_id.localeCompare(right.edge_id);
}

function dedupeNodes(
  nodes: readonly ReplayConsensusLineageNode[],
): readonly ReplayConsensusLineageNode[] {
  return Array.from(new Map(nodes.map((node) => [node.node_id, node])).values());
}

function dedupeEdges(
  edges: readonly ReplayConsensusLineageEdge[],
): readonly ReplayConsensusLineageEdge[] {
  return Array.from(new Map(edges.map((edge) => [edge.edge_id, edge])).values());
}

function latestTimestamp(timestamps: readonly string[]): string {
  return [...timestamps].sort((left, right) => right.localeCompare(left))[0] ??
    "1970-01-01T00:00:00.000Z";
}

function sortRecord(
  record: Readonly<Record<string, string | number | boolean | null>>,
): Readonly<Record<string, string | number | boolean | null>> {
  return Object.keys(record)
    .sort((left, right) => left.localeCompare(right))
    .reduce<Record<string, string | number | boolean | null>>((acc, key) => {
      acc[key] = record[key] ?? null;
      return acc;
    }, {});
}

function deterministicHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(value))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortLineageKeys(value));
}

function sortLineageKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortLineageKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortLineageKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (typeof value === "undefined") return null;
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) {
      deepFreeze(item);
    }
  }

  return value;
}
