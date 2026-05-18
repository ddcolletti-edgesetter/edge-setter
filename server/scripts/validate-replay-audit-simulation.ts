import {
  computeReplayAuditDriftScore,
  computeReplayPredictiveAnomalyScore,
  createReplayAuditSimulationRun,
  executeReplayAuditSimulation,
  summarizeReplayAuditSimulation,
  validateReplayAuditSimulationResult,
  type ReplayAuditSimulationCanonicalHook,
  type ReplayAuditSimulationInput,
  type ReplayAuditSimulationLineageNode,
} from "../pipeline/replay-audit-simulation";
import {
  buildReplayIntelligenceExportBundle,
  computeReplayIntelligenceCanonicalHash,
} from "../pipeline/replay-intelligence-export";
import type {
  ReplayIntelligenceExportFileEntry,
  ReplayIntelligenceSnapshotPackage,
  ReplayLongHorizonAuditSimulationConfig,
} from "../pipeline/replay-intelligence-export-contract";

const GENERATED_AT = "2026-04-02T00:00:00.000Z";
const REPLAY_ID = "replay-audit-simulation-replay";
const ARCHIVE_ID = "replay-audit-simulation-archive";
const INTELLIGENCE_ID = "replay-audit-simulation-intelligence";
const LINEAGE_ID = "lineage-middle";
const BASELINE_CONFIDENCE_SCORE = 92;

const config: ReplayLongHorizonAuditSimulationConfig = {
  simulation_id: "replay-audit-simulation-fixture",
  generated_at: GENERATED_AT,
  replay_id: REPLAY_ID,
  lineage_id: LINEAGE_ID,
  horizon_days: 365,
  iteration_count: 4,
};

const snapshots: ReplayIntelligenceSnapshotPackage[] = [
  createSnapshotPackage("snapshot-zeta", "2026-04-02T00:00:02.000Z", "zeta"),
  createSnapshotPackage("snapshot-alpha", "2026-04-02T00:00:01.000Z", "alpha"),
];

const files: ReplayIntelligenceExportFileEntry[] = [
  createFileEntry("snapshots/zeta.json", "zeta.json", { snapshot_id: "zeta", value: 2 }),
  createFileEntry("manifest/alpha.json", "alpha.json", { snapshot_id: "alpha", value: 1 }),
];

const exportBundle = buildReplayIntelligenceExportBundle({
  generated_at: GENERATED_AT,
  replay_id: REPLAY_ID,
  archive_id: ARCHIVE_ID,
  intelligence_id: INTELLIGENCE_ID,
  lineage_id: LINEAGE_ID,
  snapshots,
  files,
});

const lineage: ReplayAuditSimulationLineageNode[] = [
  createLineageNode("lineage-leaf", "replay-leaf", "lineage-middle", 2),
  createLineageNode("lineage-root", "replay-root", null, 0),
  createLineageNode("lineage-middle", REPLAY_ID, "lineage-root", 1),
];

const canonicalHooks: ReplayAuditSimulationCanonicalHook[] = [
  createCanonicalHook("zz-external-anchor", "external_anchor", { z: 1 }),
  createCanonicalHook("aa-lineage-anchor", "lineage", { a: 1 }),
];

const input: ReplayAuditSimulationInput = {
  config,
  export_bundle: exportBundle,
  baseline_confidence_score: BASELINE_CONFIDENCE_SCORE,
  lineage,
  parent_run_ids: ["parent-run-z", "parent-run-a"],
  canonical_hooks: canonicalHooks,
};

validateRunCreation();
validateSimulationExecution();
validateDriftScoreDeterminism();
validateAnomalyScoreDeterminism();
validateConfidencePropagation();
validateSummaryGeneration();
validateStableSorting();

console.log("Replay audit simulation validation passed.");

function validateRunCreation(): void {
  const run = createReplayAuditSimulationRun(input);
  const runAgain = createReplayAuditSimulationRun({
    ...input,
    parent_run_ids: ["parent-run-a", "parent-run-z"],
    canonical_hooks: [...canonicalHooks].reverse(),
  });

  assertEqual(run.generated_at, GENERATED_AT, "run timestamp mismatch");
  assertEqual(run.simulation_id, config.simulation_id, "run simulation id mismatch");
  assertEqual(run.replay_id, REPLAY_ID, "run replay id mismatch");
  assertEqual(run.lineage_id, LINEAGE_ID, "run lineage id mismatch");
  assertEqual(run.horizon_days, 365, "run horizon mismatch");
  assertEqual(run.iteration_count, 4, "run iteration count mismatch");
  assertEqual(run.parent_run_ids.join(","), "parent-run-a,parent-run-z", "parent run ids are not sorted");
  assertEqual(run.run_id, runAgain.run_id, "run id is not deterministic");
  assertEqual(run.canonical_hash, runAgain.canonical_hash, "run canonical hash is not deterministic");
}

function validateSimulationExecution(): void {
  const result = executeReplayAuditSimulation(input);
  const resultAgain = executeReplayAuditSimulation({
    ...input,
    lineage: [...lineage].reverse(),
    parent_run_ids: ["parent-run-a", "parent-run-z"],
    canonical_hooks: [...canonicalHooks].reverse(),
  });
  const validation = validateReplayAuditSimulationResult(result, GENERATED_AT);

  assertEqual(result.canonical_hash, resultAgain.canonical_hash, "result canonical hash is not deterministic");
  assertEqual(result.run_id, resultAgain.run_id, "result run id is not deterministic");
  assertEqual(result.iterations.length, 4, "result iteration count mismatch");
  assertEqual(result.iterations.map((iteration) => iteration.simulated_at).join(","), [
    "2026-04-02T00:00:00.000Z",
    "2026-08-01T16:00:00.000Z",
    "2026-12-01T08:00:00.000Z",
    "2027-04-02T00:00:00.000Z",
  ].join(","), "deterministic iteration timestamps mismatch");
  assertEqual(validation.valid, true, `simulation validation failed: ${validation.mismatches.join(",")}`);
}

function validateDriftScoreDeterminism(): void {
  const result = executeReplayAuditSimulation(input);
  const drift = computeReplayAuditDriftScore({
    generated_at: result.iterations[2].simulated_at,
    replay_id: REPLAY_ID,
    horizon_days: config.horizon_days,
    iteration_index: 2,
    iteration_count: config.iteration_count,
    export_bundle: exportBundle,
    lineage,
  });
  const driftAgain = computeReplayAuditDriftScore({
    generated_at: result.iterations[2].simulated_at,
    replay_id: REPLAY_ID,
    horizon_days: config.horizon_days,
    iteration_index: 2,
    iteration_count: config.iteration_count,
    export_bundle: exportBundle,
    lineage: [...lineage].reverse(),
  });

  assertEqual(drift.drift_score, 51.75, "drift score formula mismatch");
  assertEqual(drift.drift_band, "elevated", "drift band mismatch");
  assertEqual(drift.canonical_hash, driftAgain.canonical_hash, "drift hash is not deterministic");
  assertEqual(result.iterations[2].drift.canonical_hash, drift.canonical_hash, "executed drift hash mismatch");
}

function validateAnomalyScoreDeterminism(): void {
  const result = executeReplayAuditSimulation(input);
  const anomaly = computeReplayPredictiveAnomalyScore({
    generated_at: result.iterations[3].simulated_at,
    replay_id: REPLAY_ID,
    drift_score: result.iterations[3].drift.drift_score,
    iteration_index: 3,
    iteration_count: config.iteration_count,
    lineage,
    baseline_confidence_score: BASELINE_CONFIDENCE_SCORE,
    source_hash: result.iterations[3].drift.canonical_hash,
  });
  const anomalyAgain = computeReplayPredictiveAnomalyScore({
    generated_at: result.iterations[3].simulated_at,
    replay_id: REPLAY_ID,
    drift_score: result.iterations[3].drift.drift_score,
    iteration_index: 3,
    iteration_count: config.iteration_count,
    lineage: [...lineage].reverse(),
    baseline_confidence_score: BASELINE_CONFIDENCE_SCORE,
    source_hash: result.iterations[3].drift.canonical_hash,
  });

  assertEqual(anomaly.anomaly_score, 60.86, "anomaly score formula mismatch");
  assertEqual(anomaly.anomaly_classification, "elevated", "anomaly classification mismatch");
  assertEqual(anomaly.anomaly_type, "placeholder_elevated_replay_anomaly", "anomaly placeholder type mismatch");
  assertEqual(anomaly.canonical_hash, anomalyAgain.canonical_hash, "anomaly hash is not deterministic");
  assertEqual(result.iterations[3].anomaly.canonical_hash, anomaly.canonical_hash, "executed anomaly hash mismatch");
}

function validateConfidencePropagation(): void {
  const result = executeReplayAuditSimulation(input);
  const propagated = result.iterations.map((iteration) => iteration.propagated_confidence_score);

  assertEqual(propagated.join(","), "72.111,70.424,68.737,67.05", "propagated confidence sequence mismatch");
  assertEqual(result.confidence_score, 69.581, "result confidence average mismatch");
  assertEqual(result.iterations[0].anomaly.confidence_score, 73.388, "anomaly confidence propagation mismatch");
}

function validateSummaryGeneration(): void {
  const result = executeReplayAuditSimulation(input);
  const summary = summarizeReplayAuditSimulation(result);

  assertEqual(summary.simulation_id, config.simulation_id, "summary simulation id mismatch");
  assertEqual(summary.run_id, result.run_id, "summary run id mismatch");
  assertEqual(summary.horizon_days, 365, "summary horizon mismatch");
  assertEqual(summary.iteration_count, 4, "summary iteration count mismatch");
  assertEqual(summary.anomaly_count, 4, "summary anomaly count mismatch");
  assertEqual(summary.max_anomaly_score, 60.86, "summary max anomaly score mismatch");
  assertEqual(summary.average_anomaly_score, 50.96, "summary average anomaly score mismatch");
  assertEqual(summary.drift_score, 49.25, "summary drift score mismatch");
  assertEqual(summary.confidence_score, result.confidence_score, "summary confidence score mismatch");
  assertEqual(summary.lineage_depth, 2, "summary lineage depth mismatch");
  assertEqual(summary.canonical_hook_count, 5, "summary canonical hook count mismatch");
}

function validateStableSorting(): void {
  const result = executeReplayAuditSimulation(input);

  assertEqual(result.lineage.map((node) => node.lineage_id).join(","), "lineage-root,lineage-middle,lineage-leaf", "lineage is not stably sorted");
  assertEqual(result.canonical_hooks.map((hook) => hook.hook_id).join(","), "aa-lineage-anchor,export_bundle,export_validation,scoring_formula_v1,zz-external-anchor", "canonical hooks are not stably sorted");
  assertEqual(result.iterations.map((iteration) => iteration.iteration_index).join(","), "0,1,2,3", "iterations are not stably sorted");
  assertEqual(exportBundle.snapshots.map((snapshot) => snapshot.snapshot_id).join(","), "snapshot-alpha,snapshot-zeta", "export snapshots are not stably sorted");
  assertEqual(exportBundle.files.map((file) => file.path).join(","), "manifest/alpha.json,snapshots/zeta.json", "export files are not stably sorted");
}

function createSnapshotPackage(
  snapshotId: string,
  generatedAt: string,
  category: string,
): ReplayIntelligenceSnapshotPackage {
  const payloadHash = computeReplayIntelligenceCanonicalHash({
    snapshot_id: snapshotId,
    generated_at: generatedAt,
    category,
  });

  return {
    snapshot_id: snapshotId,
    generated_at: generatedAt,
    replay_id: REPLAY_ID,
    archive_id: ARCHIVE_ID,
    lineage_id: LINEAGE_ID,
    category,
    payload_hash: payloadHash,
    canonical_hash: computeReplayIntelligenceCanonicalHash({
      snapshot_id: snapshotId,
      generated_at: generatedAt,
      replay_id: REPLAY_ID,
      archive_id: ARCHIVE_ID,
      lineage_id: LINEAGE_ID,
      category,
      payload_hash: payloadHash,
    }),
  };
}

function createFileEntry(
  path: string,
  fileName: string,
  payload: Record<string, unknown>,
): ReplayIntelligenceExportFileEntry {
  const serialized = JSON.stringify(payload);

  return {
    path,
    file_name: fileName,
    content_type: "application/json",
    byte_size: Buffer.byteLength(serialized, "utf8"),
    canonical_hash: computeReplayIntelligenceCanonicalHash(payload),
  };
}

function createLineageNode(
  lineageId: string,
  replayId: string,
  parentLineageId: string | null,
  depth: number,
): ReplayAuditSimulationLineageNode {
  return {
    lineage_id: lineageId,
    replay_id: replayId,
    parent_lineage_id: parentLineageId,
    depth,
    canonical_hash: computeReplayIntelligenceCanonicalHash({
      kind: "replay_audit_lineage_node",
      lineage_id: lineageId,
      replay_id: replayId,
      parent_lineage_id: parentLineageId,
      depth,
    }),
  };
}

function createCanonicalHook(
  hookId: string,
  hookType: ReplayAuditSimulationCanonicalHook["hook_type"],
  payload: Record<string, unknown>,
): ReplayAuditSimulationCanonicalHook {
  return {
    hook_id: hookId,
    hook_type: hookType,
    canonical_hash: computeReplayIntelligenceCanonicalHash(payload),
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}
