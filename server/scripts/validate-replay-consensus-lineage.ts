import Database from "better-sqlite3";

import {
  buildReplayArbitrationResult,
} from "../pipeline/replay-arbitration";
import {
  buildReplayAutonomousOrchestrationRun,
} from "../pipeline/replay-autonomous-orchestration";
import {
  buildReplayConsensusResult,
} from "../pipeline/replay-consensus";
import {
  buildReplayConsensusLineageSnapshot,
  getArbitrationAncestry,
  getBranchDescendants,
  getCheckpointGenealogy,
  getConvergenceLineage,
  getRecoveryAncestry,
  getReplayAncestry,
  getValidatorInfluenceChain,
} from "../pipeline/replay-consensus-lineage";
import {
  initializeReplayOrchestrationPersistenceSchema,
  persistReplayOrchestrationLifecycle,
} from "../pipeline/replay-orchestration-persistence";
import {
  buildReplayRecoveryCoordinationResult,
} from "../pipeline/replay-recovery-coordination";
import type {
  ReplayConsensusDivergenceCategory,
  ReplayConsensusInput,
  ReplayConsensusVote,
} from "../pipeline/replay-consensus-contract";

const GENERATED_AT = "2026-05-19T17:00:00.000Z";
const PERSISTED_AT = "2026-05-19T17:05:00.000Z";

const run = buildReplayAutonomousOrchestrationRun({
  clock: {
    generated_at: GENERATED_AT,
  },
  consensus_threshold: 0.8,
  max_recovery_attempts: 2,
  targets: [
    {
      replay_hash: "lineage-snapshot",
      priority: 30,
      anomaly_score: 0.72,
      drift_score: 0.61,
      confidence_score: 0.89,
      lineage_depth: 1,
    },
    {
      replay_hash: "lineage-timeline",
      priority: 20,
      anomaly_score: 0.58,
      drift_score: 0.76,
      confidence_score: 0.86,
      lineage_depth: 2,
    },
  ],
});

const snapshotConsensus = buildReplayConsensusResult(consensusFixture("lineage-snapshot", "lineage-root", [
  validator("snapshot-validator-a", "snapshot_validator", 2, 91, "diverge", ["snapshot"], "lineage-snapshot", "lineage-root"),
  validator("snapshot-validator-b", "provenance_validator", 1, 86, "approve", [], "lineage-snapshot", "lineage-root"),
]));
const timelineConsensus = buildReplayConsensusResult(consensusFixture("lineage-timeline", "lineage-snapshot", [
  validator("timeline-validator-a", "timeline_validator", 1.5, 89, "diverge", ["timeline"], "lineage-timeline", "lineage-snapshot"),
  validator("timeline-validator-b", "settlement_validator", 1, 83, "approve", [], "lineage-timeline", "lineage-snapshot"),
]));
const snapshotArbitration = buildReplayArbitrationResult({
  generated_at: GENERATED_AT,
  consensus: snapshotConsensus,
});
const timelineArbitration = buildReplayArbitrationResult({
  generated_at: GENERATED_AT,
  consensus: timelineConsensus,
});
const snapshotRecovery = buildReplayRecoveryCoordinationResult({
  generated_at: GENERATED_AT,
  arbitration: snapshotArbitration,
  max_retry_attempts: 2,
});
const timelineRecovery = buildReplayRecoveryCoordinationResult({
  generated_at: GENERATED_AT,
  arbitration: timelineArbitration,
  max_retry_attempts: 2,
});

const db = new Database(":memory:");
initializeReplayOrchestrationPersistenceSchema(db);

try {
  persistReplayOrchestrationLifecycle(db, {
    persisted_at: PERSISTED_AT,
    orchestration_run: run,
    consensus_results: [timelineConsensus, snapshotConsensus],
    arbitration_results: [timelineArbitration, snapshotArbitration],
    recovery_results: [timelineRecovery, snapshotRecovery],
  });

  const graph = buildReplayConsensusLineageSnapshot(db, run.run_id);
  const graphAgain = buildReplayConsensusLineageSnapshot(db, run.run_id);

  assertEqual(graph.deterministic_hash, graphAgain.deterministic_hash, "lineage graph hash must be stable");
  assertEqual(graph.graph_hash, graphAgain.graph_hash, "graph hash must be stable");
  assertEqual(graph.replay_hashes.includes("lineage-root"), true, "root branch must be represented");
  assertEqual(graph.replay_hashes.includes("lineage-snapshot"), true, "snapshot branch must be represented");
  assertEqual(graph.replay_hashes.includes("lineage-timeline"), true, "timeline branch must be represented");

  const timelineAncestry = getReplayAncestry(graph, "lineage-timeline");
  assertTraversalHasReplay(timelineAncestry, "lineage-root", "timeline ancestry should include root");
  assertTraversalHasReplay(timelineAncestry, "lineage-snapshot", "timeline ancestry should include snapshot parent");
  assertEqual(timelineAncestry.edges.some((edge) => edge.kind === "descends_from"), true, "ancestry should use descends_from edges");

  const rootDescendants = getBranchDescendants(graph, "lineage-root");
  assertTraversalHasReplay(rootDescendants, "lineage-snapshot", "root descendants should include snapshot");
  assertTraversalHasReplay(rootDescendants, "lineage-timeline", "root descendants should include timeline");

  const validatorInfluence = getValidatorInfluenceChain(graph, "timeline-validator-a");
  assertEqual(validatorInfluence.nodes.some((node) => node.kind === "validator"), true, "validator influence should include validator");
  assertEqual(validatorInfluence.nodes.some((node) => node.kind === "consensus_decision"), true, "validator influence should reach consensus");
  assertEqual(validatorInfluence.nodes.some((node) => node.kind === "arbitration_outcome"), true, "validator influence should reach arbitration");
  assertEqual(validatorInfluence.nodes.some((node) => node.kind === "recovery_coordination"), true, "validator influence should reach recovery");
  assertEqual(validatorInfluence.edges.some((edge) => edge.kind === "propagates_influence"), true, "validator influence should propagate divergence");

  const recoveryAncestry = getRecoveryAncestry(graph, "lineage-timeline");
  assertEqual(recoveryAncestry.nodes.some((node) => node.kind === "checkpoint"), true, "recovery ancestry should include checkpoint");
  assertEqual(recoveryAncestry.nodes.some((node) => node.kind === "recovery_coordination"), true, "recovery ancestry should include recovery");

  const arbitrationAncestry = getArbitrationAncestry(graph, "lineage-snapshot");
  assertEqual(arbitrationAncestry.nodes.some((node) => node.kind === "arbitration_outcome"), true, "arbitration ancestry should include arbitration");
  assertEqual(arbitrationAncestry.nodes.some((node) => node.kind === "divergence"), true, "arbitration ancestry should include divergence");

  const convergenceLineage = getConvergenceLineage(graph, "lineage-snapshot");
  assertEqual(convergenceLineage.nodes.some((node) => node.kind === "execution_history"), true, "convergence lineage should include execution history");
  assertEqual(convergenceLineage.edges.some((edge) => edge.kind === "records_history"), true, "convergence lineage should include history edges");

  const checkpointGenealogy = getCheckpointGenealogy(graph, timelineRecovery.checkpoint.checkpoint_id);
  assertTraversalHasReplay(checkpointGenealogy, "lineage-snapshot", "checkpoint genealogy should include checkpoint parent");
  assertTraversalHasReplay(checkpointGenealogy, "lineage-timeline", "checkpoint genealogy should include checkpoint replay");
  assertEqual(checkpointGenealogy.nodes.some((node) => node.kind === "checkpoint"), true, "checkpoint genealogy should include checkpoint node");

  assertEqual(Object.isFrozen(graph), true, "lineage graph must be immutable");
  assertEqual(Object.isFrozen(graph.nodes), true, "lineage nodes must be immutable");
  assertEqual(Object.isFrozen(graph.edges), true, "lineage edges must be immutable");
  assertEqual(Object.isFrozen(timelineAncestry), true, "lineage traversal must be immutable");
  assertEqual(Object.isFrozen(validatorInfluence.nodes), true, "validator influence nodes must be immutable");

  console.log("Replay consensus lineage validation passed.");
  console.log(JSON.stringify({
    run_id: graph.run_id,
    graph_hash: graph.graph_hash,
    deterministic_hash: graph.deterministic_hash,
    node_count: graph.node_count,
    edge_count: graph.edge_count,
    replay_hashes: graph.replay_hashes,
    ancestry: {
      timeline: {
        nodes: timelineAncestry.nodes.map((node) => `${node.kind}:${node.replay_hash}`),
        traversal_hash: timelineAncestry.traversal_hash,
      },
      root_descendants: rootDescendants.nodes.map((node) => `${node.kind}:${node.replay_hash}`),
    },
    validator_influence: {
      nodes: validatorInfluence.nodes.map((node) => `${node.kind}:${node.label}`),
      edges: validatorInfluence.edges.map((edge) => edge.kind),
      traversal_hash: validatorInfluence.traversal_hash,
    },
    recovery_inheritance: recoveryAncestry.nodes.map((node) => `${node.kind}:${node.replay_hash}`),
    checkpoint_genealogy: checkpointGenealogy.nodes.map((node) => `${node.kind}:${node.replay_hash}`),
    immutable_outputs: {
      graph: Object.isFrozen(graph),
      nodes: Object.isFrozen(graph.nodes),
      edges: Object.isFrozen(graph.edges),
      traversal: Object.isFrozen(timelineAncestry),
      validator_nodes: Object.isFrozen(validatorInfluence.nodes),
    },
  }, null, 2));
} finally {
  db.close();
}

function consensusFixture(
  replayHash: string,
  parentReplayHash: string | null,
  validators: ReplayConsensusInput["validators"],
): ReplayConsensusInput {
  return {
    generated_at: GENERATED_AT,
    replay_hash: replayHash,
    compared_replay_hash: parentReplayHash,
    quorum_threshold: 0.5,
    approval_threshold: 0.5,
    validators,
  };
}

function validator(
  validatorId: string,
  validatorType: string,
  weight: number,
  baseConfidence: number,
  vote: ReplayConsensusVote,
  categories: readonly ReplayConsensusDivergenceCategory[],
  replayHash: string,
  parentReplayHash: string | null,
): ReplayConsensusInput["validators"][number] {
  return {
    validator_id: validatorId,
    validator_type: validatorType,
    weight,
    base_confidence: baseConfidence,
    vote,
    divergence_categories: categories,
    lineage_reference: {
      replay_hash: replayHash,
      parent_replay_hash: parentReplayHash,
      lineage_hash: `lineage-${validatorId}`,
      generated_at: GENERATED_AT,
    },
  };
}

function assertTraversalHasReplay(
  traversal: { readonly nodes: readonly { readonly replay_hash: string }[] },
  replayHash: string,
  message: string,
): void {
  if (!traversal.nodes.some((node) => node.replay_hash === replayHash)) {
    throw new Error(`${message}. Traversal replays: ${traversal.nodes.map((node) => node.replay_hash).join(",")}.`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}
