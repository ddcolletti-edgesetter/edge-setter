import type {
  ReplayMismatchSummary,
} from "./replay-contract";
import type {
  ReplayArchiveAncestryReconstructionResult,
  ReplayArchiveForensicMutationEntity,
  ReplayArchiveForensicMutationRecord,
  ReplayArchiveHistoricalQueryResult,
  ReplayArchiveIntelligenceAggregationBucket,
  ReplayArchiveIntelligenceAggregationDimension,
  ReplayArchiveIntelligenceAggregationQuery,
  ReplayArchiveIntelligenceAggregationResult,
  ReplayArchiveIntelligenceMetric,
  ReplayArchivePagedResult,
  ReplayArchiveQueryResultRecord,
  ReplayArchiveTemporalDriftRecord,
  ReplayArchiveTimeRangeFilter,
} from "./replay-archive-query-contract";
import type {
  ReplayArchiveSearchIndex,
} from "./replay-archive-index";
import {
  createReplayArchiveCanonicalIndexKey,
  stableReplayArchiveIndexStringify,
} from "./replay-archive-index";
import {
  buildReplayArchivePagedResult,
  filterReplayArchiveHistoricalRecords,
  matchesReplayArchiveTimeRange,
  paginateReplayArchiveItems,
  sortReplayArchiveItems,
} from "./replay-archive-query";

export type ReplayArchiveTrendDirection =
  | "increasing"
  | "decreasing"
  | "flat";

export type ReplayArchiveEvolutionScoreBand =
  | "stable"
  | "watch"
  | "volatile"
  | "critical";

export interface ReplayArchiveTemporalAggregationWindow {
  readonly window_id: string;
  readonly range: ReplayArchiveTimeRangeFilter;
}

export interface ReplayArchiveIntelligenceInput {
  readonly archives: readonly ReplayArchiveQueryResultRecord[];
  readonly drift_records: readonly ReplayArchiveTemporalDriftRecord[];
  readonly mutation_records: readonly ReplayArchiveForensicMutationRecord[];
  readonly ancestry_results: readonly ReplayArchiveAncestryReconstructionResult[];
}

export interface ReplayArchiveDriftTrendBucket {
  readonly window_id: string;
  readonly drift_count: number;
  readonly mismatch_count: number;
  readonly critical_mismatch_count: number;
  readonly equivalent_count: number;
  readonly affected_archive_ids: readonly string[];
  readonly mismatch_summaries: readonly ReplayMismatchSummary[];
  readonly deterministic_hash: string;
}

export interface ReplayArchiveDriftTrendSummary {
  readonly windows: readonly ReplayArchiveDriftTrendBucket[];
  readonly total_drift_count: number;
  readonly total_mismatch_count: number;
  readonly trend_direction: ReplayArchiveTrendDirection;
  readonly deterministic_hash: string;
}

export interface ReplayArchiveMutationFrequencyBucket {
  readonly category: string;
  readonly entity: ReplayArchiveForensicMutationEntity;
  readonly operation: string;
  readonly mutation_count: number;
  readonly critical_count: number;
  readonly affected_archive_ids: readonly string[];
  readonly first_changed_at: string | null;
  readonly last_changed_at: string | null;
  readonly deterministic_hash: string;
}

export interface ReplayArchiveLineageDepthMetrics {
  readonly archive_count: number;
  readonly max_depth: number;
  readonly average_depth: number;
  readonly root_archive_count: number;
  readonly leaf_archive_count: number;
  readonly depth_histogram: readonly ReplayArchiveDepthHistogramBucket[];
  readonly deterministic_hash: string;
}

export interface ReplayArchiveDepthHistogramBucket {
  readonly depth: number;
  readonly archive_count: number;
}

export interface ReplayArchiveAncestryIntelligenceSummary {
  readonly archive_id: string;
  readonly root_archive_id: string | null;
  readonly complete: boolean;
  readonly cycle_detected: boolean;
  readonly ancestry_depth: number;
  readonly drift_summary_count: number;
  readonly deterministic_hash: string;
}

export interface ReplayArchiveForensicReplayMetrics {
  readonly archive_count: number;
  readonly replay_count: number;
  readonly verified_count: number;
  readonly failed_count: number;
  readonly diverged_count: number;
  readonly mutation_count: number;
  readonly drift_count: number;
  readonly critical_mismatch_count: number;
  readonly total_bundle_size_bytes: number;
  readonly deterministic_hash: string;
}

export interface ReplayArchiveEvolutionScore {
  readonly archive_id: string;
  readonly game_id: string;
  readonly replay_hash: string | null;
  readonly score: number;
  readonly band: ReplayArchiveEvolutionScoreBand;
  readonly drift_count: number;
  readonly mutation_count: number;
  readonly lineage_depth: number;
  readonly critical_mismatch_count: number;
  readonly deterministic_hash: string;
}

export interface ReplayArchiveIntelligenceReport {
  readonly generated_at: string;
  readonly aggregation: ReplayArchiveIntelligenceAggregationResult;
  readonly drift_trends: ReplayArchiveDriftTrendSummary;
  readonly mutation_frequency: readonly ReplayArchiveMutationFrequencyBucket[];
  readonly lineage_depth_metrics: ReplayArchiveLineageDepthMetrics;
  readonly ancestry_summaries: readonly ReplayArchiveAncestryIntelligenceSummary[];
  readonly forensic_metrics: ReplayArchiveForensicReplayMetrics;
  readonly evolution_scores: readonly ReplayArchiveEvolutionScore[];
  readonly deterministic_hash: string;
}

export function buildReplayArchiveIntelligenceInputFromIndex(
  index: ReplayArchiveSearchIndex,
): ReplayArchiveIntelligenceInput {
  return {
    archives: index.entries.map((entry) => entry.result_record),
    drift_records: index.drift.records,
    mutation_records: index.mutations.records,
    ancestry_results: [],
  };
}

export function buildReplayArchiveIntelligenceInputFromHistoricalResult(
  historicalResult: ReplayArchiveHistoricalQueryResult,
  driftRecords: readonly ReplayArchiveTemporalDriftRecord[] = [],
  mutationRecords: readonly ReplayArchiveForensicMutationRecord[] = [],
  ancestryResults: readonly ReplayArchiveAncestryReconstructionResult[] = [],
): ReplayArchiveIntelligenceInput {
  return {
    archives: historicalResult.items,
    drift_records: driftRecords,
    mutation_records: mutationRecords,
    ancestry_results: ancestryResults,
  };
}

export function aggregateReplayArchiveIntelligence(
  query: ReplayArchiveIntelligenceAggregationQuery,
  index: ReplayArchiveSearchIndex,
): ReplayArchiveIntelligenceAggregationResult {
  const filteredArchiveEntries = filterReplayArchiveHistoricalRecords(
    index.entries,
    query.filters,
  );
  const input: ReplayArchiveIntelligenceInput = {
    archives: filteredArchiveEntries.map((entry) => entry.result_record),
    drift_records: index.drift.records,
    mutation_records: index.mutations.records,
    ancestry_results: [],
  };
  const buckets = buildReplayArchiveIntelligenceBuckets(
    input,
    query.dimensions,
    query.metrics,
  );
  const sortedBuckets = sortReplayArchiveItems(
    buckets,
    query.ordering,
    getIntelligenceBucketSortValue,
    compareIntelligenceBuckets,
  );
  const page = paginateReplayArchiveItems(
    sortedBuckets,
    query.pagination,
    (bucket) => bucket.dimension_key,
  );

  return buildReplayArchivePagedResult(
    page.items,
    buckets.length,
    page.page_info,
    query.ordering,
  );
}

export function buildReplayArchiveIntelligenceBuckets(
  input: ReplayArchiveIntelligenceInput,
  dimensions: readonly ReplayArchiveIntelligenceAggregationDimension[],
  metrics: readonly ReplayArchiveIntelligenceMetric[],
): readonly ReplayArchiveIntelligenceAggregationBucket[] {
  const bucketMap = new Map<string, ReplayArchiveQueryResultRecord[]>();
  const sortedArchives = input.archives.slice().sort(compareArchiveRecords);

  for (const archive of sortedArchives) {
    const key = buildDimensionKey(archive, input, dimensions);
    const existing = bucketMap.get(key) ?? [];
    bucketMap.set(key, existing.concat(archive));
  }

  return Array.from(bucketMap.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dimensionKey, archives]) => {
      const bucketDimensions = buildDimensionRecord(archives[0] ?? null, input, dimensions);
      const bucketMetrics = buildMetricRecord(archives, input, metrics);
      const mismatchSummaries = summarizeMismatchCategories(
        input.drift_records.filter((record) =>
          archives.some((archive) =>
            archive.manifest.archive_id === record.baseline_archive_id ||
            archive.manifest.archive_id === record.comparison_archive_id,
          ),
        ),
      );
      const mutationEntities = uniqueSorted(
        input.mutation_records
          .filter((record) =>
            archives.some((archive) => archive.manifest.archive_id === record.archive_id),
          )
          .map((record) => record.entity),
      ) as ReplayArchiveForensicMutationEntity[];

      return {
        dimension_key: dimensionKey,
        dimensions: bucketDimensions,
        metrics: bucketMetrics,
        mismatch_summaries: mismatchSummaries,
        mutation_entities: mutationEntities,
        deterministic_hash: createReplayArchiveCanonicalIndexKey([
          "intelligence_bucket",
          dimensionKey,
          stableReplayArchiveIndexStringify(bucketMetrics),
          stableReplayArchiveIndexStringify(mismatchSummaries),
        ]),
      };
    });
}

export function aggregateReplayArchiveDriftTrends(
  records: readonly ReplayArchiveTemporalDriftRecord[],
  windows: readonly ReplayArchiveTemporalAggregationWindow[],
): ReplayArchiveDriftTrendSummary {
  const sortedWindows = windows
    .slice()
    .sort((left, right) => left.window_id.localeCompare(right.window_id));
  const buckets = sortedWindows.map((window) => {
    const matchingRecords = records
      .filter((record) => matchesReplayArchiveTimeRange(record.observed_at, window.range))
      .sort(compareDriftRecords);
    const affectedArchiveIds = uniqueSorted(
      matchingRecords.flatMap((record) => [
        record.baseline_archive_id,
        record.comparison_archive_id,
      ]),
    );
    const mismatchSummaries = summarizeMismatchCategories(matchingRecords);
    const bucket: ReplayArchiveDriftTrendBucket = {
      window_id: window.window_id,
      drift_count: matchingRecords.filter((record) => !record.equivalent).length,
      mismatch_count: sumNumbers(matchingRecords.map((record) => record.mismatch_count)),
      critical_mismatch_count: countCriticalMismatches(matchingRecords),
      equivalent_count: matchingRecords.filter((record) => record.equivalent).length,
      affected_archive_ids: affectedArchiveIds,
      mismatch_summaries: mismatchSummaries,
      deterministic_hash: createReplayArchiveCanonicalIndexKey([
        "drift_window",
        window.window_id,
        matchingRecords.map((record) => record.deterministic_hash).join(","),
      ]),
    };

    return bucket;
  });
  const first = buckets[0]?.mismatch_count ?? 0;
  const last = buckets[buckets.length - 1]?.mismatch_count ?? 0;

  return {
    windows: buckets,
    total_drift_count: sumNumbers(buckets.map((bucket) => bucket.drift_count)),
    total_mismatch_count: sumNumbers(buckets.map((bucket) => bucket.mismatch_count)),
    trend_direction: classifyTrend(first, last),
    deterministic_hash: createReplayArchiveCanonicalIndexKey([
      "drift_trends",
      buckets.map((bucket) => bucket.deterministic_hash).join(","),
    ]),
  };
}

export function aggregateReplayArchiveMutationFrequency(
  records: readonly ReplayArchiveForensicMutationRecord[],
): readonly ReplayArchiveMutationFrequencyBucket[] {
  const bucketMap = new Map<string, ReplayArchiveForensicMutationRecord[]>();

  for (const record of records.slice().sort(compareMutationRecords)) {
    const key = createReplayArchiveCanonicalIndexKey([
      record.category,
      record.entity,
      record.operation,
    ]);
    const existing = bucketMap.get(key) ?? [];
    bucketMap.set(key, existing.concat(record));
  }

  return Array.from(bucketMap.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, bucketRecords]) => {
      const sortedRecords = bucketRecords.slice().sort(compareMutationRecords);
      const first = sortedRecords[0] ?? null;
      const last = sortedRecords[sortedRecords.length - 1] ?? null;

      return {
        category: String(first?.category ?? ""),
        entity: first?.entity ?? "archive_manifest",
        operation: String(first?.operation ?? ""),
        mutation_count: sortedRecords.length,
        critical_count: sortedRecords.filter((record) => record.severity === "critical").length,
        affected_archive_ids: uniqueSorted(sortedRecords.map((record) => record.archive_id)),
        first_changed_at: first?.changed_at ?? null,
        last_changed_at: last?.changed_at ?? null,
        deterministic_hash: createReplayArchiveCanonicalIndexKey([
          "mutation_frequency",
          key,
          sortedRecords.map((record) => record.deterministic_hash).join(","),
        ]),
      };
    });
}

export function computeReplayArchiveLineageDepthMetrics(
  archives: readonly ReplayArchiveQueryResultRecord[],
): ReplayArchiveLineageDepthMetrics {
  const depths = archives.map((archive) => archive.lineage_depth ?? 0);
  const maxDepth = depths.length > 0 ? Math.max(...depths) : 0;
  const depthCounts = new Map<number, number>();

  for (const depth of depths) {
    depthCounts.set(depth, (depthCounts.get(depth) ?? 0) + 1);
  }

  const histogram = Array.from(depthCounts.entries())
    .sort(([left], [right]) => left - right)
    .map(([depth, archiveCount]) => ({
      depth,
      archive_count: archiveCount,
    }));

  return {
    archive_count: archives.length,
    max_depth: maxDepth,
    average_depth: depths.length === 0 ? 0 : sumNumbers(depths) / depths.length,
    root_archive_count: archives.filter((archive) => !archive.manifest.parent_archive_id).length,
    leaf_archive_count: countLeafArchives(archives),
    depth_histogram: histogram,
    deterministic_hash: createReplayArchiveCanonicalIndexKey([
      "lineage_depth",
      archives.length,
      maxDepth,
      stableReplayArchiveIndexStringify(histogram),
    ]),
  };
}

export function summarizeReplayArchiveAncestryIntelligence(
  ancestryResults: readonly ReplayArchiveAncestryReconstructionResult[],
): readonly ReplayArchiveAncestryIntelligenceSummary[] {
  return ancestryResults
    .slice()
    .sort((left, right) => left.archive_id.localeCompare(right.archive_id))
    .map((result) => ({
      archive_id: result.archive_id,
      root_archive_id: result.root_archive_id,
      complete: result.complete,
      cycle_detected: result.cycle_detected,
      ancestry_depth: Math.max(0, result.nodes.length - 1),
      drift_summary_count: sumNumbers(result.drift_summary.map((summary) => summary.count)),
      deterministic_hash: createReplayArchiveCanonicalIndexKey([
        "ancestry_intelligence",
        result.archive_id,
        result.root_archive_id,
        result.complete,
        result.cycle_detected,
        result.nodes.map((node) => node.deterministic_hash).join(","),
      ]),
    }));
}

export function computeReplayArchiveForensicMetrics(
  input: ReplayArchiveIntelligenceInput,
): ReplayArchiveForensicReplayMetrics {
  const verifiedCount = input.archives.filter(
    (archive) => archive.manifest.verification_status === "verified",
  ).length;
  const failedCount = input.archives.filter(
    (archive) => archive.manifest.verification_status === "failed",
  ).length;
  const divergedCount = input.archives.filter(
    (archive) => archive.integrity_status === "diverged",
  ).length;
  const criticalMismatchCount =
    countCriticalMismatches(input.drift_records) +
    input.mutation_records.filter((record) => record.severity === "critical").length;
  const totalBundleSizeBytes = sumNumbers(
    input.archives.map((archive) => archive.manifest.bundle_size_bytes),
  );

  return {
    archive_count: input.archives.length,
    replay_count: sumNumbers(input.archives.map((archive) => archive.manifest.replay_count)),
    verified_count: verifiedCount,
    failed_count: failedCount,
    diverged_count: divergedCount,
    mutation_count: input.mutation_records.length,
    drift_count: input.drift_records.filter((record) => !record.equivalent).length,
    critical_mismatch_count: criticalMismatchCount,
    total_bundle_size_bytes: totalBundleSizeBytes,
    deterministic_hash: createReplayArchiveCanonicalIndexKey([
      "forensic_metrics",
      input.archives.length,
      verifiedCount,
      failedCount,
      divergedCount,
      input.mutation_records.length,
      criticalMismatchCount,
      totalBundleSizeBytes,
    ]),
  };
}

export function scoreReplayArchiveEvolution(
  archives: readonly ReplayArchiveQueryResultRecord[],
  driftRecords: readonly ReplayArchiveTemporalDriftRecord[],
  mutationRecords: readonly ReplayArchiveForensicMutationRecord[],
): readonly ReplayArchiveEvolutionScore[] {
  return archives
    .slice()
    .sort(compareArchiveRecords)
    .map((archive) => {
      const archiveId = archive.manifest.archive_id;
      const archiveDrifts = driftRecords.filter(
        (record) =>
          record.baseline_archive_id === archiveId ||
          record.comparison_archive_id === archiveId,
      );
      const archiveMutations = mutationRecords.filter(
        (record) => record.archive_id === archiveId,
      );
      const criticalMismatchCount =
        countCriticalMismatches(archiveDrifts) +
        archiveMutations.filter((record) => record.severity === "critical").length;
      const lineageDepth = archive.lineage_depth ?? 0;
      const score =
        archiveDrifts.filter((record) => !record.equivalent).length * 10 +
        archiveMutations.length * 5 +
        criticalMismatchCount * 20 +
        lineageDepth;

      return {
        archive_id: archiveId,
        game_id: archive.manifest.game_id,
        replay_hash: archive.replay_hash,
        score,
        band: classifyEvolutionScore(score),
        drift_count: archiveDrifts.length,
        mutation_count: archiveMutations.length,
        lineage_depth: lineageDepth,
        critical_mismatch_count: criticalMismatchCount,
        deterministic_hash: createReplayArchiveCanonicalIndexKey([
          "evolution_score",
          archiveId,
          score,
          archive.deterministic_hash,
        ]),
      };
    });
}

export function rankReplayArchiveEvolutionScores(
  scores: readonly ReplayArchiveEvolutionScore[],
): readonly ReplayArchiveEvolutionScore[] {
  return scores.slice().sort((left, right) =>
    right.score - left.score ||
    left.archive_id.localeCompare(right.archive_id) ||
    String(left.replay_hash ?? "").localeCompare(String(right.replay_hash ?? "")),
  );
}

export function buildReplayArchiveIntelligenceReport(
  params: {
    readonly generated_at: string;
    readonly aggregation_query: ReplayArchiveIntelligenceAggregationQuery;
    readonly index: ReplayArchiveSearchIndex;
    readonly windows: readonly ReplayArchiveTemporalAggregationWindow[];
    readonly ancestry_results?: readonly ReplayArchiveAncestryReconstructionResult[];
  },
): ReplayArchiveIntelligenceReport {
  const input = buildReplayArchiveIntelligenceInputFromIndex(params.index);
  const ancestryResults = params.ancestry_results ?? [];
  const reportInput: ReplayArchiveIntelligenceInput = {
    ...input,
    ancestry_results: ancestryResults,
  };
  const aggregation = aggregateReplayArchiveIntelligence(
    params.aggregation_query,
    params.index,
  );
  const driftTrends = aggregateReplayArchiveDriftTrends(
    input.drift_records,
    params.windows,
  );
  const mutationFrequency = aggregateReplayArchiveMutationFrequency(
    input.mutation_records,
  );
  const lineageDepthMetrics = computeReplayArchiveLineageDepthMetrics(input.archives);
  const ancestrySummaries = summarizeReplayArchiveAncestryIntelligence(ancestryResults);
  const forensicMetrics = computeReplayArchiveForensicMetrics(reportInput);
  const evolutionScores = rankReplayArchiveEvolutionScores(
    scoreReplayArchiveEvolution(
      input.archives,
      input.drift_records,
      input.mutation_records,
    ),
  );

  return {
    generated_at: params.generated_at,
    aggregation,
    drift_trends: driftTrends,
    mutation_frequency: mutationFrequency,
    lineage_depth_metrics: lineageDepthMetrics,
    ancestry_summaries: ancestrySummaries,
    forensic_metrics: forensicMetrics,
    evolution_scores: evolutionScores,
    deterministic_hash: createReplayArchiveCanonicalIndexKey([
      "intelligence_report",
      params.generated_at,
      aggregation.items.map((bucket) => bucket.deterministic_hash).join(","),
      driftTrends.deterministic_hash,
      mutationFrequency.map((bucket) => bucket.deterministic_hash).join(","),
      forensicMetrics.deterministic_hash,
      evolutionScores.map((score) => score.deterministic_hash).join(","),
    ]),
  };
}

function buildDimensionKey(
  archive: ReplayArchiveQueryResultRecord,
  input: ReplayArchiveIntelligenceInput,
  dimensions: readonly ReplayArchiveIntelligenceAggregationDimension[],
): string {
  if (dimensions.length === 0) {
    return "all";
  }

  return createReplayArchiveCanonicalIndexKey(
    dimensions.map((dimension) => getDimensionValue(archive, input, dimension)),
  );
}

function buildDimensionRecord(
  archive: ReplayArchiveQueryResultRecord | null,
  input: ReplayArchiveIntelligenceInput,
  dimensions: readonly ReplayArchiveIntelligenceAggregationDimension[],
): Record<ReplayArchiveIntelligenceAggregationDimension, string | null> {
  return {
    game_id: dimensions.includes("game_id") && archive ? archive.manifest.game_id : null,
    retention_class:
      dimensions.includes("retention_class") && archive
        ? archive.manifest.retention_class
        : null,
    verification_status:
      dimensions.includes("verification_status") && archive
        ? archive.manifest.verification_status
        : null,
    integrity_status:
      dimensions.includes("integrity_status") && archive
        ? archive.integrity_status
        : null,
    drift_category:
      dimensions.includes("drift_category") && archive
        ? getArchiveDriftCategories(archive, input).join(",")
        : null,
    mutation_entity:
      dimensions.includes("mutation_entity") && archive
        ? getArchiveMutationEntities(archive, input).join(",")
        : null,
    created_day:
      dimensions.includes("created_day") && archive
        ? archive.manifest.created_at.slice(0, 10)
        : null,
    created_month:
      dimensions.includes("created_month") && archive
        ? archive.manifest.created_at.slice(0, 7)
        : null,
  };
}

function buildMetricRecord(
  archives: readonly ReplayArchiveQueryResultRecord[],
  input: ReplayArchiveIntelligenceInput,
  metrics: readonly ReplayArchiveIntelligenceMetric[],
): Record<ReplayArchiveIntelligenceMetric, number> {
  const archiveIds = new Set(archives.map((archive) => archive.manifest.archive_id));
  const bucketDrifts = input.drift_records.filter(
    (record) =>
      archiveIds.has(record.baseline_archive_id) ||
      archiveIds.has(record.comparison_archive_id),
  );
  const bucketMutations = input.mutation_records.filter((record) =>
    archiveIds.has(record.archive_id),
  );

  return {
    archive_count: metrics.includes("archive_count") ? archives.length : 0,
    replay_count: metrics.includes("replay_count")
      ? sumNumbers(archives.map((archive) => archive.manifest.replay_count))
      : 0,
    mutation_count: metrics.includes("mutation_count") ? bucketMutations.length : 0,
    drift_count: metrics.includes("drift_count")
      ? bucketDrifts.filter((record) => !record.equivalent).length
      : 0,
    critical_mismatch_count: metrics.includes("critical_mismatch_count")
      ? countCriticalMismatches(bucketDrifts) +
        bucketMutations.filter((record) => record.severity === "critical").length
      : 0,
    verified_count: metrics.includes("verified_count")
      ? archives.filter((archive) => archive.manifest.verification_status === "verified").length
      : 0,
    failed_count: metrics.includes("failed_count")
      ? archives.filter((archive) => archive.manifest.verification_status === "failed").length
      : 0,
    bundle_size_bytes: metrics.includes("bundle_size_bytes")
      ? sumNumbers(archives.map((archive) => archive.manifest.bundle_size_bytes))
      : 0,
  };
}

function getDimensionValue(
  archive: ReplayArchiveQueryResultRecord,
  input: ReplayArchiveIntelligenceInput,
  dimension: ReplayArchiveIntelligenceAggregationDimension,
): string {
  switch (dimension) {
    case "game_id":
      return archive.manifest.game_id;
    case "retention_class":
      return archive.manifest.retention_class;
    case "verification_status":
      return archive.manifest.verification_status;
    case "integrity_status":
      return archive.integrity_status ?? "null";
    case "drift_category":
      return getArchiveDriftCategories(archive, input).join(",") || "none";
    case "mutation_entity":
      return getArchiveMutationEntities(archive, input).join(",") || "none";
    case "created_day":
      return archive.manifest.created_at.slice(0, 10);
    case "created_month":
      return archive.manifest.created_at.slice(0, 7);
  }
}

function getArchiveDriftCategories(
  archive: ReplayArchiveQueryResultRecord,
  input: ReplayArchiveIntelligenceInput,
): readonly string[] {
  const archiveId = archive.manifest.archive_id;

  return uniqueSorted(
    input.drift_records
      .filter(
        (record) =>
          record.baseline_archive_id === archiveId ||
          record.comparison_archive_id === archiveId,
      )
      .flatMap((record) => record.mismatch_categories),
  );
}

function getArchiveMutationEntities(
  archive: ReplayArchiveQueryResultRecord,
  input: ReplayArchiveIntelligenceInput,
): readonly string[] {
  return uniqueSorted(
    input.mutation_records
      .filter((record) => record.archive_id === archive.manifest.archive_id)
      .map((record) => record.entity),
  );
}

function getIntelligenceBucketSortValue(
  bucket: ReplayArchiveIntelligenceAggregationBucket,
  field: string,
): string | number | boolean | null {
  if (field === "dimension_key") {
    return bucket.dimension_key;
  }

  if (field === "metric_value") {
    return sumNumbers(Object.values(bucket.metrics));
  }

  return null;
}

function compareIntelligenceBuckets(
  left: ReplayArchiveIntelligenceAggregationBucket,
  right: ReplayArchiveIntelligenceAggregationBucket,
): number {
  return (
    left.dimension_key.localeCompare(right.dimension_key) ||
    left.deterministic_hash.localeCompare(right.deterministic_hash)
  );
}

function compareArchiveRecords(
  left: ReplayArchiveQueryResultRecord,
  right: ReplayArchiveQueryResultRecord,
): number {
  return (
    left.manifest.created_at.localeCompare(right.manifest.created_at) ||
    left.manifest.archive_id.localeCompare(right.manifest.archive_id) ||
    left.deterministic_hash.localeCompare(right.deterministic_hash)
  );
}

function compareDriftRecords(
  left: ReplayArchiveTemporalDriftRecord,
  right: ReplayArchiveTemporalDriftRecord,
): number {
  return (
    left.observed_at.localeCompare(right.observed_at) ||
    left.baseline_archive_id.localeCompare(right.baseline_archive_id) ||
    left.comparison_archive_id.localeCompare(right.comparison_archive_id) ||
    left.deterministic_hash.localeCompare(right.deterministic_hash)
  );
}

function compareMutationRecords(
  left: ReplayArchiveForensicMutationRecord,
  right: ReplayArchiveForensicMutationRecord,
): number {
  return (
    left.changed_at.localeCompare(right.changed_at) ||
    left.archive_id.localeCompare(right.archive_id) ||
    left.entity.localeCompare(right.entity) ||
    left.path.localeCompare(right.path) ||
    left.deterministic_hash.localeCompare(right.deterministic_hash)
  );
}

function summarizeMismatchCategories(
  records: readonly ReplayArchiveTemporalDriftRecord[],
): readonly ReplayMismatchSummary[] {
  const counts = new Map<string, number>();

  for (const record of records) {
    for (const mismatch of record.mismatches) {
      counts.set(mismatch.category, (counts.get(mismatch.category) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, count]) => ({
      category: category as ReplayMismatchSummary["category"],
      count,
    }));
}

function countCriticalMismatches(
  records: readonly ReplayArchiveTemporalDriftRecord[],
): number {
  return sumNumbers(
    records.map(
      (record) =>
        record.mismatches.filter((mismatch) => mismatch.severity === "critical").length,
    ),
  );
}

function countLeafArchives(
  archives: readonly ReplayArchiveQueryResultRecord[],
): number {
  const parentIds = new Set(
    archives
      .map((archive) => archive.manifest.parent_archive_id ?? null)
      .filter((archiveId): archiveId is string => archiveId !== null),
  );

  return archives.filter(
    (archive) => !parentIds.has(archive.manifest.archive_id),
  ).length;
}

function classifyTrend(
  firstValue: number,
  lastValue: number,
): ReplayArchiveTrendDirection {
  if (lastValue > firstValue) {
    return "increasing";
  }

  if (lastValue < firstValue) {
    return "decreasing";
  }

  return "flat";
}

function classifyEvolutionScore(score: number): ReplayArchiveEvolutionScoreBand {
  if (score >= 60) {
    return "critical";
  }

  if (score >= 30) {
    return "volatile";
  }

  if (score >= 10) {
    return "watch";
  }

  return "stable";
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right),
  );
}

function sumNumbers(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
