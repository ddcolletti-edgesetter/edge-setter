import type {
  ReplayIntelligenceExportBundle,
  ReplayLongHorizonAuditSimulationConfig,
  ReplayLongHorizonAuditSimulationResult,
  ReplayLongHorizonAuditSimulationRun,
  ReplayPredictiveAnomalyScore,
} from "./replay-intelligence-export-contract";
import {
  computeReplayIntelligenceCanonicalHash,
  summarizeReplayIntelligenceExportBundle,
  validateReplayIntelligenceExportBundle,
} from "./replay-intelligence-export";

export type ReplayAuditAnomalyClassification =
  | "none"
  | "watch"
  | "elevated"
  | "critical";

export interface ReplayAuditSimulationLineageNode {
  readonly lineage_id: string;
  readonly replay_id: string;
  readonly parent_lineage_id: string | null;
  readonly depth: number;
  readonly canonical_hash: string;
}

export interface ReplayAuditSimulationCanonicalHook {
  readonly hook_id: string;
  readonly hook_type:
    | "export_bundle"
    | "lineage"
    | "scoring_formula"
    | "external_anchor";
  readonly canonical_hash: string;
}

export interface ReplayAuditSimulationInput {
  readonly config: ReplayLongHorizonAuditSimulationConfig;
  readonly export_bundle: ReplayIntelligenceExportBundle;
  readonly baseline_confidence_score?: number;
  readonly lineage?: readonly ReplayAuditSimulationLineageNode[];
  readonly parent_run_ids?: readonly string[];
  readonly canonical_hooks?: readonly ReplayAuditSimulationCanonicalHook[];
}

export interface ReplayAuditSimulationRun extends ReplayLongHorizonAuditSimulationRun {
  readonly lineage_id: string;
  readonly export_id: string;
  readonly horizon_days: number;
  readonly iteration_count: number;
  readonly parent_run_ids: readonly string[];
  readonly canonical_hooks: readonly ReplayAuditSimulationCanonicalHook[];
}

export interface ReplayAuditDriftScore {
  readonly replay_id: string;
  readonly generated_at: string;
  readonly drift_score: number;
  readonly drift_band: ReplayAuditAnomalyClassification;
  readonly horizon_pressure: number;
  readonly lineage_pressure: number;
  readonly snapshot_pressure: number;
  readonly canonical_hash: string;
}

export interface ReplayAuditPredictiveAnomalyScore extends ReplayPredictiveAnomalyScore {
  readonly anomaly_classification: ReplayAuditAnomalyClassification;
  readonly drift_score: number;
  readonly lineage_depth: number;
  readonly formula_version: number;
}

export interface ReplayAuditSimulationIteration {
  readonly iteration_index: number;
  readonly simulated_at: string;
  readonly drift: ReplayAuditDriftScore;
  readonly anomaly: ReplayAuditPredictiveAnomalyScore;
  readonly propagated_confidence_score: number;
  readonly canonical_hash: string;
}

export interface ReplayAuditSimulationResult extends ReplayLongHorizonAuditSimulationResult {
  readonly run_id: string;
  readonly replay_id: string;
  readonly lineage_id: string;
  readonly export_id: string;
  readonly horizon_days: number;
  readonly iteration_count: number;
  readonly anomaly_classification_counts: Record<ReplayAuditAnomalyClassification, number>;
  readonly iterations: readonly ReplayAuditSimulationIteration[];
  readonly lineage: readonly ReplayAuditSimulationLineageNode[];
  readonly canonical_hooks: readonly ReplayAuditSimulationCanonicalHook[];
}

export interface ReplayAuditSimulationSummary {
  readonly simulation_id: string;
  readonly run_id: string;
  readonly generated_at: string;
  readonly replay_id: string;
  readonly lineage_id: string;
  readonly export_id: string;
  readonly canonical_hash: string;
  readonly horizon_days: number;
  readonly iteration_count: number;
  readonly anomaly_count: number;
  readonly max_anomaly_score: number;
  readonly average_anomaly_score: number;
  readonly drift_score: number;
  readonly confidence_score: number;
  readonly anomaly_classification_counts: Record<ReplayAuditAnomalyClassification, number>;
  readonly canonical_hook_count: number;
  readonly lineage_depth: number;
}

export interface ReplayAuditSimulationValidationResult {
  readonly valid: boolean;
  readonly generated_at: string;
  readonly simulation_id: string;
  readonly run_id: string;
  readonly canonical_hash: string;
  readonly mismatches: readonly string[];
}

const SCORING_FORMULA_VERSION = 1;

export function createReplayAuditSimulationRun(
  input: ReplayAuditSimulationInput,
): ReplayAuditSimulationRun {
  const canonicalHooks = buildCanonicalHooks(input);
  const parentRunIds = sortStrings(input.parent_run_ids ?? []);
  const runHash = computeReplayIntelligenceCanonicalHash({
    kind: "replay_audit_simulation_run",
    version: SCORING_FORMULA_VERSION,
    config: input.config,
    export_hash: input.export_bundle.canonical_hash,
    parent_run_ids: parentRunIds,
    canonical_hooks: canonicalHooks,
  });

  return {
    run_id: `replay-audit-simulation-run:${runHash}`,
    generated_at: input.config.generated_at,
    simulation_id: input.config.simulation_id,
    replay_id: input.config.replay_id,
    lineage_id: input.config.lineage_id,
    export_id: input.export_bundle.export_id,
    horizon_days: normalizeNonNegativeInteger(input.config.horizon_days),
    iteration_count: normalizeNonNegativeInteger(input.config.iteration_count),
    parent_run_ids: parentRunIds,
    canonical_hooks: canonicalHooks,
    canonical_hash: computeReplayIntelligenceCanonicalHash({
      kind: "replay_audit_simulation_run_record",
      run_hash: runHash,
      generated_at: input.config.generated_at,
    }),
  };
}

export function executeReplayAuditSimulation(
  input: ReplayAuditSimulationInput,
): ReplayAuditSimulationResult {
  const run = createReplayAuditSimulationRun(input);
  const lineage = buildReplayAuditLineage(input);
  const iterationCount = normalizeNonNegativeInteger(input.config.iteration_count);
  const iterations = Array.from({ length: iterationCount }, (_, index) => {
    const simulatedAt = buildDeterministicIterationTimestamp(
      input.config.generated_at,
      input.config.horizon_days,
      index,
      iterationCount,
    );
    const drift = computeReplayAuditDriftScore({
      generated_at: simulatedAt,
      replay_id: input.config.replay_id,
      horizon_days: input.config.horizon_days,
      iteration_index: index,
      iteration_count: iterationCount,
      export_bundle: input.export_bundle,
      lineage,
    });
    const anomaly = computeReplayPredictiveAnomalyScore({
      generated_at: simulatedAt,
      replay_id: input.config.replay_id,
      drift_score: drift.drift_score,
      iteration_index: index,
      iteration_count: iterationCount,
      lineage,
      baseline_confidence_score: input.baseline_confidence_score,
      source_hash: drift.canonical_hash,
    });
    const propagatedConfidenceScore = propagateDeterministicConfidence(
      input.baseline_confidence_score,
      anomaly.confidence_score,
      drift.drift_score,
      index,
    );

    return {
      iteration_index: index,
      simulated_at: simulatedAt,
      drift,
      anomaly,
      propagated_confidence_score: propagatedConfidenceScore,
      canonical_hash: computeReplayIntelligenceCanonicalHash({
        kind: "replay_audit_simulation_iteration",
        index,
        simulated_at: simulatedAt,
        drift_hash: drift.canonical_hash,
        anomaly_hash: anomaly.canonical_hash,
        propagated_confidence_score: propagatedConfidenceScore,
      }),
    };
  });
  const anomalyScores = iterations.map((iteration) => iteration.anomaly.anomaly_score);
  const driftScores = iterations.map((iteration) => iteration.drift.drift_score);
  const confidenceScores = iterations.map((iteration) => iteration.propagated_confidence_score);
  const anomalyClassificationCounts = countAnomalyClassifications(iterations);
  const resultBody = {
    kind: "replay_audit_simulation_result",
    version: SCORING_FORMULA_VERSION,
    run_hash: run.canonical_hash,
    iteration_hashes: iterations.map((iteration) => iteration.canonical_hash),
    lineage_hashes: lineage.map((node) => node.canonical_hash),
    canonical_hooks: run.canonical_hooks,
  };

  return {
    simulation_id: input.config.simulation_id,
    run_id: run.run_id,
    generated_at: input.config.generated_at,
    replay_id: input.config.replay_id,
    lineage_id: input.config.lineage_id,
    export_id: input.export_bundle.export_id,
    horizon_days: run.horizon_days,
    iteration_count: run.iteration_count,
    anomaly_count: iterations.filter(
      (iteration) => iteration.anomaly.anomaly_classification !== "none",
    ).length,
    drift_score: roundScore(average(driftScores)),
    confidence_score: roundScore(average(confidenceScores)),
    anomaly_classification_counts: anomalyClassificationCounts,
    iterations,
    lineage,
    canonical_hooks: run.canonical_hooks,
    canonical_hash: computeReplayIntelligenceCanonicalHash(resultBody),
  };
}

export function computeReplayAuditDriftScore(params: {
  readonly generated_at: string;
  readonly replay_id: string;
  readonly horizon_days: number;
  readonly iteration_index: number;
  readonly iteration_count: number;
  readonly export_bundle: ReplayIntelligenceExportBundle;
  readonly lineage?: readonly ReplayAuditSimulationLineageNode[];
}): ReplayAuditDriftScore {
  const exportSummary = summarizeReplayIntelligenceExportBundle(params.export_bundle);
  const horizonPressure = clampScore(normalizeNonNegativeInteger(params.horizon_days) / 3.65);
  const lineagePressure = clampScore(maxLineageDepth(params.lineage ?? []) * 7.5);
  const snapshotPressure = clampScore(
    exportSummary.snapshot_count * 4 + exportSummary.file_count * 2,
  );
  const iterationPressure = params.iteration_count <= 1
    ? 0
    : (params.iteration_index / (params.iteration_count - 1)) * 15;
  const driftScore = roundScore(
    clampScore(horizonPressure * 0.35 + lineagePressure * 0.25 + snapshotPressure * 0.25 + iterationPressure),
  );

  return {
    replay_id: params.replay_id,
    generated_at: params.generated_at,
    drift_score: driftScore,
    drift_band: classifyAnomalyScore(driftScore),
    horizon_pressure: roundScore(horizonPressure),
    lineage_pressure: roundScore(lineagePressure),
    snapshot_pressure: roundScore(snapshotPressure),
    canonical_hash: computeReplayIntelligenceCanonicalHash({
      kind: "replay_audit_drift_score",
      version: SCORING_FORMULA_VERSION,
      generated_at: params.generated_at,
      replay_id: params.replay_id,
      horizon_pressure: roundScore(horizonPressure),
      lineage_pressure: roundScore(lineagePressure),
      snapshot_pressure: roundScore(snapshotPressure),
      iteration_pressure: roundScore(iterationPressure),
      export_hash: params.export_bundle.canonical_hash,
    }),
  };
}

export function computeReplayPredictiveAnomalyScore(params: {
  readonly generated_at: string;
  readonly replay_id: string;
  readonly drift_score: number;
  readonly iteration_index: number;
  readonly iteration_count: number;
  readonly lineage?: readonly ReplayAuditSimulationLineageNode[];
  readonly baseline_confidence_score?: number;
  readonly source_hash?: string | null;
}): ReplayAuditPredictiveAnomalyScore {
  const lineageDepth = maxLineageDepth(params.lineage ?? []);
  const confidenceScore = propagateDeterministicConfidence(
    params.baseline_confidence_score,
    100 - params.drift_score * 0.55,
    params.drift_score,
    params.iteration_index,
  );
  const horizonStepPressure = params.iteration_count <= 1
    ? 0
    : (params.iteration_index + 1) / params.iteration_count;
  const anomalyScore = roundScore(
    clampScore(params.drift_score * 0.72 + lineageDepth * 4 + horizonStepPressure * 12),
  );
  const classification = classifyAnomalyScore(anomalyScore);

  return {
    replay_id: params.replay_id,
    generated_at: params.generated_at,
    anomaly_type: classification === "none"
      ? "placeholder_no_anomaly"
      : `placeholder_${classification}_replay_anomaly`,
    anomaly_score: anomalyScore,
    anomaly_classification: classification,
    confidence_score: confidenceScore,
    drift_score: roundScore(params.drift_score),
    lineage_depth: lineageDepth,
    formula_version: SCORING_FORMULA_VERSION,
    canonical_hash: computeReplayIntelligenceCanonicalHash({
      kind: "replay_predictive_anomaly_score",
      version: SCORING_FORMULA_VERSION,
      generated_at: params.generated_at,
      replay_id: params.replay_id,
      anomaly_score: anomalyScore,
      classification,
      confidence_score: confidenceScore,
      drift_score: roundScore(params.drift_score),
      lineage_depth: lineageDepth,
      source_hash: params.source_hash ?? null,
    }),
  };
}

export function summarizeReplayAuditSimulation(
  result: ReplayAuditSimulationResult,
): ReplayAuditSimulationSummary {
  const anomalyScores = result.iterations.map((iteration) => iteration.anomaly.anomaly_score);

  return {
    simulation_id: result.simulation_id,
    run_id: result.run_id,
    generated_at: result.generated_at,
    replay_id: result.replay_id,
    lineage_id: result.lineage_id,
    export_id: result.export_id,
    canonical_hash: result.canonical_hash,
    horizon_days: result.horizon_days,
    iteration_count: result.iteration_count,
    anomaly_count: result.anomaly_count,
    max_anomaly_score: anomalyScores.length === 0 ? 0 : roundScore(Math.max(...anomalyScores)),
    average_anomaly_score: roundScore(average(anomalyScores)),
    drift_score: result.drift_score,
    confidence_score: result.confidence_score,
    anomaly_classification_counts: result.anomaly_classification_counts,
    canonical_hook_count: result.canonical_hooks.length,
    lineage_depth: maxLineageDepth(result.lineage),
  };
}

export function validateReplayAuditSimulationResult(
  result: ReplayAuditSimulationResult,
  generatedAt: string = result.generated_at,
): ReplayAuditSimulationValidationResult {
  const mismatches: string[] = [];
  const sortedIterations = sortIterations(result.iterations);
  const sortedLineage = sortLineage(result.lineage);
  const sortedHooks = sortCanonicalHooks(result.canonical_hooks);
  const expectedCounts = countAnomalyClassifications(result.iterations);
  const expectedResultHash = computeReplayIntelligenceCanonicalHash({
    kind: "replay_audit_simulation_result",
    version: SCORING_FORMULA_VERSION,
    run_hash: computeReplayIntelligenceCanonicalHash({
      kind: "replay_audit_simulation_run_record",
      run_hash: result.run_id.replace("replay-audit-simulation-run:", ""),
      generated_at: result.generated_at,
    }),
    iteration_hashes: result.iterations.map((iteration) => iteration.canonical_hash),
    lineage_hashes: result.lineage.map((node) => node.canonical_hash),
    canonical_hooks: result.canonical_hooks,
  });

  if (result.generated_at !== generatedAt) mismatches.push("result.generated_at does not match validation timestamp");
  if (!result.simulation_id) mismatches.push("simulation_id is required");
  if (!result.run_id.startsWith("replay-audit-simulation-run:")) mismatches.push("run_id prefix mismatch");
  if (!sameOrder(result.iterations, sortedIterations, (iteration) => String(iteration.iteration_index))) mismatches.push("iterations are not stably sorted");
  if (!sameOrder(result.lineage, sortedLineage, (node) => node.canonical_hash)) mismatches.push("lineage is not stably sorted");
  if (!sameOrder(result.canonical_hooks, sortedHooks, (hook) => hook.hook_id)) mismatches.push("canonical hooks are not stably sorted");
  if (result.anomaly_count !== result.iterations.filter((iteration) => iteration.anomaly.anomaly_classification !== "none").length) mismatches.push("anomaly_count mismatch");
  if (result.iteration_count !== result.iterations.length) mismatches.push("iteration_count mismatch");
  if (result.drift_score !== roundScore(average(result.iterations.map((iteration) => iteration.drift.drift_score)))) mismatches.push("drift_score mismatch");
  if (result.confidence_score !== roundScore(average(result.iterations.map((iteration) => iteration.propagated_confidence_score)))) mismatches.push("confidence_score mismatch");
  if (!sameClassificationCounts(result.anomaly_classification_counts, expectedCounts)) mismatches.push("anomaly classification counts mismatch");
  if (result.canonical_hash !== expectedResultHash) mismatches.push("result canonical_hash mismatch");

  for (const iteration of result.iterations) {
    const expectedIterationHash = computeReplayIntelligenceCanonicalHash({
      kind: "replay_audit_simulation_iteration",
      index: iteration.iteration_index,
      simulated_at: iteration.simulated_at,
      drift_hash: iteration.drift.canonical_hash,
      anomaly_hash: iteration.anomaly.canonical_hash,
      propagated_confidence_score: iteration.propagated_confidence_score,
    });
    if (iteration.canonical_hash !== expectedIterationHash) {
      mismatches.push(`iteration canonical_hash mismatch: ${iteration.iteration_index}`);
    }
  }

  return {
    valid: mismatches.length === 0,
    generated_at: generatedAt,
    simulation_id: result.simulation_id,
    run_id: result.run_id,
    canonical_hash: result.canonical_hash,
    mismatches: sortStrings(mismatches),
  };
}

function buildCanonicalHooks(
  input: ReplayAuditSimulationInput,
): readonly ReplayAuditSimulationCanonicalHook[] {
  const exportValidation = validateReplayIntelligenceExportBundle(
    input.export_bundle,
    input.export_bundle.generated_at,
  );
  const hooks: ReplayAuditSimulationCanonicalHook[] = [
    {
      hook_id: "export_bundle",
      hook_type: "export_bundle",
      canonical_hash: input.export_bundle.canonical_hash,
    },
    {
      hook_id: "export_validation",
      hook_type: "external_anchor",
      canonical_hash: exportValidation.canonical_hash,
    },
    {
      hook_id: "scoring_formula_v1",
      hook_type: "scoring_formula",
      canonical_hash: computeReplayIntelligenceCanonicalHash({
        kind: "replay_audit_scoring_formula",
        version: SCORING_FORMULA_VERSION,
      }),
    },
  ];

  return sortCanonicalHooks(hooks.concat(input.canonical_hooks ?? []));
}

function buildReplayAuditLineage(
  input: ReplayAuditSimulationInput,
): readonly ReplayAuditSimulationLineageNode[] {
  const lineage = input.lineage && input.lineage.length > 0
    ? input.lineage
    : [{
        lineage_id: input.config.lineage_id,
        replay_id: input.config.replay_id,
        parent_lineage_id: null,
        depth: 0,
        canonical_hash: computeReplayIntelligenceCanonicalHash({
          kind: "replay_audit_lineage_node",
          lineage_id: input.config.lineage_id,
          replay_id: input.config.replay_id,
          parent_lineage_id: null,
          depth: 0,
        }),
      }];

  return sortLineage(lineage).map((node) => ({
    ...node,
    depth: normalizeNonNegativeInteger(node.depth),
  }));
}

function buildDeterministicIterationTimestamp(
  generatedAt: string,
  horizonDays: number,
  iterationIndex: number,
  iterationCount: number,
): string {
  if (iterationCount <= 1) {
    return generatedAt;
  }

  const baseMs = Date.parse(generatedAt);
  if (!Number.isFinite(baseMs)) {
    return `${generatedAt}#iteration-${iterationIndex}`;
  }

  const horizonMs = normalizeNonNegativeInteger(horizonDays) * 24 * 60 * 60 * 1000;
  const offsetMs = Math.round((horizonMs * iterationIndex) / (iterationCount - 1));

  return new Date(baseMs + offsetMs).toISOString();
}

function classifyAnomalyScore(score: number): ReplayAuditAnomalyClassification {
  if (score >= 75) return "critical";
  if (score >= 50) return "elevated";
  if (score >= 25) return "watch";
  return "none";
}

function propagateDeterministicConfidence(
  baselineConfidenceScore: number | undefined,
  localConfidenceScore: number,
  driftScore: number,
  iterationIndex: number,
): number {
  const baseline = baselineConfidenceScore ?? 85;
  const iterationPenalty = Math.min(10, iterationIndex * 0.5);
  const propagated = baseline * 0.55 + localConfidenceScore * 0.35 - driftScore * 0.1 - iterationPenalty;

  return roundScore(clampScore(propagated));
}

function countAnomalyClassifications(
  iterations: readonly ReplayAuditSimulationIteration[],
): Record<ReplayAuditAnomalyClassification, number> {
  const counts: Record<ReplayAuditAnomalyClassification, number> = {
    none: 0,
    watch: 0,
    elevated: 0,
    critical: 0,
  };

  for (const iteration of iterations) {
    counts[iteration.anomaly.anomaly_classification] += 1;
  }

  return counts;
}

function sameClassificationCounts(
  left: Record<ReplayAuditAnomalyClassification, number>,
  right: Record<ReplayAuditAnomalyClassification, number>,
): boolean {
  return left.none === right.none &&
    left.watch === right.watch &&
    left.elevated === right.elevated &&
    left.critical === right.critical;
}

function sortIterations(
  iterations: readonly ReplayAuditSimulationIteration[],
): readonly ReplayAuditSimulationIteration[] {
  return iterations.slice().sort((left, right) =>
    left.iteration_index - right.iteration_index ||
    left.simulated_at.localeCompare(right.simulated_at) ||
    left.canonical_hash.localeCompare(right.canonical_hash),
  );
}

function sortLineage(
  lineage: readonly ReplayAuditSimulationLineageNode[],
): readonly ReplayAuditSimulationLineageNode[] {
  return lineage.slice().sort((left, right) =>
    left.depth - right.depth ||
    left.lineage_id.localeCompare(right.lineage_id) ||
    left.replay_id.localeCompare(right.replay_id) ||
    left.canonical_hash.localeCompare(right.canonical_hash),
  );
}

function sortCanonicalHooks(
  hooks: readonly ReplayAuditSimulationCanonicalHook[],
): readonly ReplayAuditSimulationCanonicalHook[] {
  return hooks.slice().sort((left, right) =>
    left.hook_id.localeCompare(right.hook_id) ||
    left.hook_type.localeCompare(right.hook_type) ||
    left.canonical_hash.localeCompare(right.canonical_hash),
  );
}

function sameOrder<T>(
  left: readonly T[],
  right: readonly T[],
  getKey: (item: T) => string,
): boolean {
  return left.map(getKey).join("\n") === right.map(getKey).join("\n");
}

function sortStrings(values: readonly string[]): readonly string[] {
  return values.slice().sort((left, right) => left.localeCompare(right));
}

function maxLineageDepth(lineage: readonly ReplayAuditSimulationLineageNode[]): number {
  return lineage.length === 0
    ? 0
    : Math.max(...lineage.map((node) => normalizeNonNegativeInteger(node.depth)));
}

function normalizeNonNegativeInteger(value: number): number {
  return Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0));
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
