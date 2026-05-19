import crypto from "crypto";
import {
  buildReplayIntelligenceHistoricalExports,
  type ReplayIntelligenceHistoricalExportBundle,
} from "./replay-intelligence-historical-export";
import { reduceReplayConvergenceAnalytics } from "./replay-convergence-reducer";

const AGGREGATED_AT = "2026-01-01T00:00:00.000Z";

export interface ReplayIntelligenceAggregationReducerComposition {
  readonly aggregation_hash: string;
  readonly replay_hash: string;
  readonly export_hash: string;
  readonly reducer_hashes: readonly string[];
  readonly convergence: ReturnType<typeof reduceReplayConvergenceAnalytics>;
  readonly stability_score: number;
  readonly consensus_ready: boolean;
  readonly composition_hash: string;
}

export interface ReplayIntelligenceAggregationResult {
  readonly aggregation_hash: string;
  readonly replay_hash: string;
  readonly generated_at: string;
  readonly compressed_replay: {
    readonly export_hash: string;
    readonly manifest_hash: string;
    readonly archive_hash: string;
    readonly timeline_hash: string;
    readonly artifact_count: number;
    readonly compression_hash: string;
  };
  readonly convergence_accumulation: ReturnType<typeof reduceReplayConvergenceAnalytics>;
  readonly stability: {
    readonly replay_hash: string;
    readonly stability_score: number;
    readonly stability_band: "stable" | "watch" | "unstable";
    readonly anomaly_count: number;
    readonly drift_field_count: number;
    readonly deterministic_hash: string;
  };
  readonly mutation_aggregation: {
    readonly replay_hash: string;
    readonly changed_fields: readonly string[];
    readonly changed_field_count: number;
    readonly mutation_hash: string;
  };
  readonly folded_lineage: {
    readonly replay_hash: string;
    readonly lineage_depth: number;
    readonly lineage: Readonly<Record<string, string | null>>;
    readonly lineage_hash: string;
  };
  readonly reducers: ReplayIntelligenceAggregationReducerComposition;
  readonly reproducibility_hash: string;
  readonly consensus_ready: boolean;
}

export function buildReplayIntelligenceAggregations():
  readonly ReplayIntelligenceAggregationResult[] {
  return deepFreeze(buildReplayIntelligenceHistoricalExports()
    .map(buildAggregationFromExport)
    .sort((left, right) =>
      left.replay_hash.localeCompare(right.replay_hash) ||
      left.aggregation_hash.localeCompare(right.aggregation_hash),
    ));
}

export function buildReplayIntelligenceAggregationSummary() {
  const aggregations = buildReplayIntelligenceAggregations();
  const convergence = reduceReplayConvergenceAnalytics(
    aggregations.map((aggregation) => ({
      convergence_score: aggregation.convergence_accumulation.average_convergence_score,
      instability_score: aggregation.convergence_accumulation.average_instability_score,
      replay_count: aggregation.convergence_accumulation.total_replays,
    })),
  );
  const payload = {
    generated_at: latestTimestamp(aggregations.map((item) => item.generated_at)),
    aggregation_count: aggregations.length,
    consensus_ready_count: aggregations.filter((item) => item.consensus_ready).length,
    average_stability_score: aggregations.length === 0
      ? 0
      : aggregations.reduce((sum, item) => sum + item.stability.stability_score, 0) /
        aggregations.length,
    convergence,
    aggregation_hashes: aggregations.map((item) => item.aggregation_hash),
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

export function getReplayIntelligenceAggregationByHash(
  aggregationHash: string,
): ReplayIntelligenceAggregationResult | null {
  return buildReplayIntelligenceAggregations().find(
    (aggregation) => aggregation.aggregation_hash === aggregationHash,
  ) ?? null;
}

export function buildReplayIntelligenceAggregationReducers(
  aggregationHash: string,
) {
  const aggregation = getReplayIntelligenceAggregationByHash(aggregationHash);
  if (!aggregation) return null;
  const payload = {
    aggregation_hash: aggregationHash,
    reducers: aggregation.reducers,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

export function buildReplayIntelligenceAggregationConvergence(
  aggregationHash: string,
) {
  const aggregation = getReplayIntelligenceAggregationByHash(aggregationHash);
  if (!aggregation) return null;
  const payload = {
    aggregation_hash: aggregationHash,
    replay_hash: aggregation.replay_hash,
    convergence: aggregation.convergence_accumulation,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

export function buildReplayIntelligenceAggregationStability(
  aggregationHash: string,
) {
  const aggregation = getReplayIntelligenceAggregationByHash(aggregationHash);
  if (!aggregation) return null;
  const payload = {
    aggregation_hash: aggregationHash,
    stability: aggregation.stability,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

export function buildReplayIntelligenceAggregationLineage(
  aggregationHash: string,
) {
  const aggregation = getReplayIntelligenceAggregationByHash(aggregationHash);
  if (!aggregation) return null;
  const payload = {
    aggregation_hash: aggregationHash,
    folded_lineage: aggregation.folded_lineage,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

function buildAggregationFromExport(
  bundle: ReplayIntelligenceHistoricalExportBundle,
): ReplayIntelligenceAggregationResult {
  const replayHash = bundle.metadata.replay_hash;
  const convergence = bundle.archive.convergence;
  const mutation = buildMutationAggregation(bundle);
  const foldedLineage = buildFoldedLineage(bundle);
  const stability = buildStability(bundle, mutation.changed_field_count);
  const compressedReplaySeed = {
    export_hash: bundle.export_hash,
    manifest_hash: bundle.manifest.manifest_hash,
    archive_hash: bundle.archive.archive_hash,
    timeline_hash: bundle.archive.timeline.timeline_hash,
    artifact_count: bundle.manifest.artifact_count,
  };
  const compressedReplay = {
    ...compressedReplaySeed,
    compression_hash: deterministicHash(compressedReplaySeed),
  };
  const reducerHashes = [
    bundle.archive.reducers.timeline.reducer_hash,
    ...bundle.archive.reducers.snapshots.map((item) => item.reducer_hash),
  ].sort((left, right) => left.localeCompare(right));
  const aggregationSeed = {
    replay_hash: replayHash,
    compressed_replay: compressedReplay,
    convergence,
    mutation,
    folded_lineage: foldedLineage,
    reducer_hashes: reducerHashes,
    stability_score: stability.stability_score,
  };
  const aggregationHash = deterministicHash(aggregationSeed);
  const reducersSeed = {
    aggregation_hash: aggregationHash,
    replay_hash: replayHash,
    export_hash: bundle.export_hash,
    reducer_hashes: reducerHashes,
    convergence,
    stability_score: stability.stability_score,
    consensus_ready: bundle.verification.verified && stability.stability_score >= 80,
  };
  const reducers = deepFreeze({
    ...reducersSeed,
    composition_hash: deterministicHash(reducersSeed),
  });
  const reproducibilitySeed = {
    aggregation_hash: aggregationHash,
    export_hash: bundle.export_hash,
    verification_hash: bundle.verification.verification_hash,
    reducer_composition_hash: reducers.composition_hash,
  };

  return deepFreeze({
    aggregation_hash: aggregationHash,
    replay_hash: replayHash,
    generated_at: bundle.metadata.generated_at,
    compressed_replay: compressedReplay,
    convergence_accumulation: convergence,
    stability,
    mutation_aggregation: mutation,
    folded_lineage: foldedLineage,
    reducers,
    reproducibility_hash: deterministicHash(reproducibilitySeed),
    consensus_ready: reducers.consensus_ready,
  });
}

function buildMutationAggregation(bundle: ReplayIntelligenceHistoricalExportBundle) {
  const changedFields = Array.from(new Set([
    ...bundle.archive.snapshot_group.mutation_summary.changed_fields,
    ...bundle.archive.timeline.drift_summary.changed_fields,
  ])).sort((left, right) => left.localeCompare(right));
  const payload = {
    replay_hash: bundle.metadata.replay_hash,
    changed_fields: changedFields,
    changed_field_count: changedFields.length,
  };

  return deepFreeze({
    ...payload,
    mutation_hash: deterministicHash(payload),
  });
}

function buildFoldedLineage(bundle: ReplayIntelligenceHistoricalExportBundle) {
  const lineage = deepFreeze({ ...bundle.archive.lineage });
  const lineageDepth = Object.keys(lineage).length === 0
    ? 0
    : Math.max(0, Object.keys(lineage).length - 1);
  const payload = {
    replay_hash: bundle.metadata.replay_hash,
    lineage_depth: lineageDepth,
    lineage,
  };

  return deepFreeze({
    ...payload,
    lineage_hash: deterministicHash(payload),
  });
}

function buildStability(
  bundle: ReplayIntelligenceHistoricalExportBundle,
  driftFieldCount: number,
) {
  const anomalyCount = bundle.archive.timeline.anomalies.length;
  const convergenceScore = bundle.archive.convergence.average_convergence_score;
  const instabilityScore = bundle.archive.convergence.average_instability_score;
  const stabilityScore = Math.max(
    0,
    Math.min(100, convergenceScore - instabilityScore - anomalyCount * 2 - driftFieldCount),
  );
  const payload = {
    replay_hash: bundle.metadata.replay_hash,
    stability_score: stabilityScore,
    stability_band: stabilityScore >= 90
      ? "stable" as const
      : stabilityScore >= 80
        ? "watch" as const
        : "unstable" as const,
    anomaly_count: anomalyCount,
    drift_field_count: driftFieldCount,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

function latestTimestamp(timestamps: readonly string[]): string {
  return [...timestamps].sort((left, right) => right.localeCompare(left))[0] ??
    AGGREGATED_AT;
}

function deterministicHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(value))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
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
