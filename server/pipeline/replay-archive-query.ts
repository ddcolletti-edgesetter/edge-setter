import type {
  ReplayArchiveLineageNode,
} from "./replay-archive-lineage";
import type {
  ReplayMismatchSummary,
} from "./replay-contract";
import type {
  ReplayArchiveAncestryNode,
  ReplayArchiveAncestryReconstructionQuery,
  ReplayArchiveAncestryReconstructionResult,
  ReplayArchiveForensicMutationRecord,
  ReplayArchiveForensicMutationSearchQuery,
  ReplayArchiveForensicMutationSearchResult,
  ReplayArchiveHistoricalQuery,
  ReplayArchiveHistoricalQueryFilters,
  ReplayArchiveHistoricalQueryResult,
  ReplayArchiveLineageTraversalEdge,
  ReplayArchiveLineageTraversalQuery,
  ReplayArchiveLineageTraversalResult,
  ReplayArchiveOrdering,
  ReplayArchivePageInfo,
  ReplayArchivePagedResult,
  ReplayArchivePagination,
  ReplayArchiveQueryEnvelope,
  ReplayArchiveQueryResultRecord,
  ReplayArchiveTemporalDriftDimension,
  ReplayArchiveTemporalDriftQuery,
  ReplayArchiveTemporalDriftRecord,
  ReplayArchiveTemporalDriftResult,
  ReplayArchiveTimeRangeFilter,
} from "./replay-archive-query-contract";
import type {
  ReplayArchiveIndexEntry,
  ReplayArchiveSearchIndex,
} from "./replay-archive-index";
import {
  buildReplayArchiveAncestryIndexNode,
  compareReplayArchiveDriftRecords,
  compareReplayArchiveIndexEntries,
  compareReplayArchiveLineageNodes,
  compareReplayArchiveMutationRecords,
  createReplayArchiveCanonicalIndexKey,
  stableReplayArchiveIndexStringify,
} from "./replay-archive-index";

export function matchesReplayArchiveTimeRange(
  timestamp: string | null | undefined,
  range: ReplayArchiveTimeRangeFilter | null,
): boolean {
  if (!range || !timestamp) {
    return true;
  }

  const fromMatches =
    !range.from ||
    (isFromInclusive(range.inclusivity)
      ? timestamp.localeCompare(range.from) >= 0
      : timestamp.localeCompare(range.from) > 0);
  const toMatches =
    !range.to ||
    (isToInclusive(range.inclusivity)
      ? timestamp.localeCompare(range.to) <= 0
      : timestamp.localeCompare(range.to) < 0);

  return fromMatches && toMatches;
}

export function filterReplayArchiveHistoricalRecords(
  entries: readonly ReplayArchiveIndexEntry[],
  filters: ReplayArchiveHistoricalQueryFilters,
): readonly ReplayArchiveIndexEntry[] {
  return entries.filter((entry) => {
    const manifest = entry.manifest;

    return (
      matchesStringSet(entry.game_id, filters.game_ids) &&
      matchesStringSet(entry.archive_id, filters.archive_ids) &&
      matchesNullableStringSet(entry.replay_hash, filters.replay_hashes) &&
      matchesNullableStringSet(entry.root_archive_id, filters.root_archive_ids) &&
      matchesNullableStringSet(entry.parent_archive_id, filters.parent_archive_ids) &&
      matchesStringSet(manifest.retention_class, filters.retention_classes) &&
      matchesStringSet(manifest.verification_status, filters.verification_statuses) &&
      matchesNullableStringSet(entry.result_record.integrity_status, filters.integrity_statuses) &&
      matchesNumberSet(manifest.forensic_version, filters.forensic_versions) &&
      matchesNumberSet(manifest.revision_number, filters.revision_numbers) &&
      matchesAllTags(manifest.tags, filters.tags_all) &&
      matchesAnyTag(manifest.tags, filters.tags_any) &&
      matchesReplayArchiveTimeRange(manifest.created_at, filters.created_at) &&
      matchesReplayArchiveTimeRange(extractRecordTimestamp(entry, "as_of"), filters.as_of) &&
      matchesReplayArchiveTimeRange(extractRecordTimestamp(entry, "generated_at"), filters.generated_at) &&
      matchesStringSet(manifest.snapshot_hash, filters.snapshot_hashes) &&
      matchesStringSet(manifest.bundle_hash, filters.bundle_hashes) &&
      matchesStringSet(manifest.export_hash, filters.export_hashes) &&
      matchesStringSet(manifest.timeline_hash, filters.timeline_hashes) &&
      matchesStringSet(manifest.signal_hash, filters.signal_hashes) &&
      matchesStringSet(manifest.settlement_hash, filters.settlement_hashes) &&
      matchesStringSet(manifest.provenance_hash, filters.provenance_hashes)
    );
  });
}

export function executeReplayArchiveHistoricalQuery(
  query: ReplayArchiveHistoricalQuery,
  index: ReplayArchiveSearchIndex,
  generatedAt: string,
): ReplayArchiveQueryEnvelope<ReplayArchiveHistoricalQueryResult> {
  const filtered = filterReplayArchiveHistoricalRecords(index.entries, query.filters);
  const sorted = sortReplayArchiveItems(
    filtered,
    query.ordering,
    getReplayArchiveIndexEntrySortValue,
    compareReplayArchiveIndexEntries,
  );
  const paged = paginateReplayArchiveItems(
    sorted,
    query.pagination,
    (entry) => entry.canonical_key,
  );
  const items = paged.items.map((entry) =>
    projectReplayArchiveQueryResultRecord(
      entry.result_record,
      query.include_forensic_payload,
      query.include_generated_report,
    ),
  );
  const data = buildReplayArchivePagedResult(
    items,
    filtered.length,
    paged.page_info,
    query.ordering,
  );

  return buildReplayArchiveQueryEnvelope(query, data, generatedAt);
}

export function traverseReplayArchiveLineage(
  query: ReplayArchiveLineageTraversalQuery,
  index: ReplayArchiveSearchIndex,
): ReplayArchiveLineageTraversalResult {
  const traversal = collectReplayArchiveLineageTraversal(query, index);
  const sortedNodes = sortReplayArchiveItems(
    traversal.nodes,
    query.ordering,
    getReplayArchiveLineageNodeSortValue,
    compareReplayArchiveLineageNodes,
  );
  const paged = paginateReplayArchiveItems(
    sortedNodes,
    query.pagination,
    (node) => node.archive_id,
  );
  const pagedNodeIds = new Set(paged.items.map((node) => node.archive_id));
  const edges = traversal.edges
    .filter(
      (edge) =>
        pagedNodeIds.has(edge.parent_archive_id) ||
        pagedNodeIds.has(edge.child_archive_id),
    )
    .sort(compareReplayArchiveLineageEdges);

  return {
    root_archive_id: query.root_archive_id,
    direction: query.direction,
    max_depth: query.max_depth,
    nodes: paged.items,
    edges,
    cycle_detected: traversal.cycle_detected,
    page_info: paged.page_info,
  };
}

export function reconstructReplayArchiveAncestry(
  query: ReplayArchiveAncestryReconstructionQuery,
  index: ReplayArchiveSearchIndex,
): ReplayArchiveAncestryReconstructionResult {
  const target = index.lookups.by_archive_id.get(query.archive_id);

  if (!target) {
    return {
      archive_id: query.archive_id,
      root_archive_id: query.root_archive_id,
      complete: false,
      cycle_detected: false,
      nodes: [],
      timeline_events: [],
      drift_summary: [],
      deterministic_hash: createReplayArchiveCanonicalIndexKey([
        "ancestry_missing",
        query.archive_id,
      ]),
    };
  }

  const chain: ReplayArchiveIndexEntry[] = [];
  const seen = new Set<string>();
  let current: ReplayArchiveIndexEntry | undefined = target;
  let cycleDetected = false;
  let complete = true;

  while (current && chain.length <= query.max_depth) {
    if (seen.has(current.archive_id)) {
      cycleDetected = true;
      complete = false;
      break;
    }

    seen.add(current.archive_id);
    chain.push(current);

    if (!current.parent_archive_id) {
      break;
    }

    current = index.lookups.by_archive_id.get(current.parent_archive_id);

    if (!current) {
      complete = false;
    }
  }

  if (chain.length > query.max_depth) {
    complete = false;
  }

  const rootFirst = chain.slice().reverse();
  const nodes = rootFirst.map((entry, indexInChain): ReplayArchiveAncestryNode => {
    const ancestryNode = buildReplayArchiveAncestryIndexNode(
      entry,
      indexInChain,
      rootFirst.length - indexInChain - 1,
    );

    return query.include_manifests
      ? ancestryNode
      : {
          ...ancestryNode,
          manifest: null,
        };
  });
  const deterministicHash = createReplayArchiveCanonicalIndexKey([
    "ancestry",
    query.archive_id,
    nodes.map((node) => node.deterministic_hash).join(","),
    complete,
    cycleDetected,
  ]);

  return {
    archive_id: query.archive_id,
    root_archive_id: nodes[0]?.archive_id ?? query.root_archive_id,
    complete,
    cycle_detected: cycleDetected,
    nodes,
    timeline_events: query.include_timeline_events ? [] : [],
    drift_summary: query.include_drift_summary
      ? summarizeReplayArchiveDrift(index.drift.records)
      : [],
    deterministic_hash: deterministicHash,
  };
}

export function filterReplayArchiveTemporalDriftRecords(
  records: readonly ReplayArchiveTemporalDriftRecord[],
  query: ReplayArchiveTemporalDriftQuery,
): readonly ReplayArchiveTemporalDriftRecord[] {
  const categories = driftDimensionsToCategories(query.drift_dimensions);

  return records.filter((record) => {
    const comparisonMatches =
      query.comparison_archive_ids.length === 0 ||
      query.comparison_archive_ids.includes(record.comparison_archive_id);
    const categoriesMatch =
      categories.length === 0 ||
      record.mismatch_categories.some((category) => categories.includes(category));

    return (
      record.baseline_archive_id === query.baseline_archive_id &&
      comparisonMatches &&
      (query.include_equivalent || !record.equivalent) &&
      categoriesMatch &&
      matchesReplayArchiveTimeRange(record.observed_at, query.observed_at)
    );
  });
}

export function executeReplayArchiveTemporalDriftQuery(
  query: ReplayArchiveTemporalDriftQuery,
  index: ReplayArchiveSearchIndex,
  generatedAt: string,
): ReplayArchiveQueryEnvelope<ReplayArchiveTemporalDriftResult> {
  const filtered = filterReplayArchiveTemporalDriftRecords(
    index.drift.records,
    query,
  );
  const sorted = sortReplayArchiveItems(
    filtered,
    query.ordering,
    getReplayArchiveDriftSortValue,
    compareReplayArchiveDriftRecords,
  );
  const paged = paginateReplayArchiveItems(
    sorted,
    query.pagination,
    (record) =>
      createReplayArchiveCanonicalIndexKey([
        record.baseline_archive_id,
        record.comparison_archive_id,
        record.observed_at,
      ]),
  );
  const items = query.include_mismatch_details
    ? paged.items
    : paged.items.map((record) => ({
        ...record,
        mismatches: [],
      }));
  const data = buildReplayArchivePagedResult(
    items,
    filtered.length,
    paged.page_info,
    query.ordering,
  );

  return buildReplayArchiveQueryEnvelope(query, data, generatedAt);
}

export function filterReplayArchiveForensicMutationRecords(
  records: readonly ReplayArchiveForensicMutationRecord[],
  query: ReplayArchiveForensicMutationSearchQuery,
  resolveGameId: (archiveId: string) => string | null = () => null,
): readonly ReplayArchiveForensicMutationRecord[] {
  return records.filter((record) => {
    const valueMatches =
      matchesStringSet(record.archive_id, query.archive_ids) &&
      matchesNullableStringSet(record.replay_hash, query.replay_hashes) &&
      matchesStringSet(record.entity, query.entities) &&
      matchesStringSet(record.operation, query.operations) &&
      matchesStringSet(record.category, query.categories) &&
      matchesStringSet(record.severity, query.severities) &&
      matchesAnyPath(record.path, query.paths) &&
      matchesReplayArchiveTimeRange(record.changed_at, query.changed_at);

    if (!valueMatches) {
      return false;
    }

    if (query.game_ids.length === 0) {
      return true;
    }

    const gameId = resolveGameId(record.archive_id);

    return gameId !== null && query.game_ids.includes(gameId);
  });
}

export function executeReplayArchiveForensicMutationSearch(
  query: ReplayArchiveForensicMutationSearchQuery,
  index: ReplayArchiveSearchIndex,
  generatedAt: string,
): ReplayArchiveQueryEnvelope<ReplayArchiveForensicMutationSearchResult> {
  const filtered = filterReplayArchiveForensicMutationRecords(
    index.mutations.records,
    query,
    (archiveId) => index.lookups.by_archive_id.get(archiveId)?.game_id ?? null,
  );
  const sorted = sortReplayArchiveItems(
    filtered,
    query.ordering,
    getReplayArchiveMutationSortValue,
    compareReplayArchiveMutationRecords,
  );
  const paged = paginateReplayArchiveItems(
    sorted,
    query.pagination,
    (record) =>
      createReplayArchiveCanonicalIndexKey([
        record.archive_id,
        record.entity,
        record.path,
        record.changed_at,
        record.deterministic_hash,
      ]),
  );
  const items = query.include_payload_values
    ? paged.items
    : paged.items.map((record) => ({
        ...record,
        previous_value: null,
        current_value: null,
      }));
  const data = buildReplayArchivePagedResult(
    items,
    filtered.length,
    paged.page_info,
    query.ordering,
  );

  return buildReplayArchiveQueryEnvelope(query, data, generatedAt);
}

export function sortReplayArchiveItems<TItem>(
  items: readonly TItem[],
  ordering: readonly ReplayArchiveOrdering[],
  getValue: (item: TItem, field: string) => string | number | boolean | null,
  fallbackCompare: (left: TItem, right: TItem) => number,
): readonly TItem[] {
  return items.slice().sort((left, right) => {
    for (const order of ordering) {
      const compared = compareReplayArchiveSortValues(
        getValue(left, order.field),
        getValue(right, order.field),
        order.null_ordering,
      );

      if (compared !== 0) {
        return order.direction === "asc" ? compared : -compared;
      }

      for (const tieBreaker of order.tie_breakers) {
        const tieCompared = compareReplayArchiveSortValues(
          getValue(left, tieBreaker.field),
          getValue(right, tieBreaker.field),
          "nulls_last",
        );

        if (tieCompared !== 0) {
          return tieBreaker.direction === "asc" ? tieCompared : -tieCompared;
        }
      }
    }

    return fallbackCompare(left, right);
  });
}

export function paginateReplayArchiveItems<TItem>(
  items: readonly TItem[],
  pagination: ReplayArchivePagination,
  getCursor: (item: TItem) => string,
): { readonly items: readonly TItem[]; readonly page_info: ReplayArchivePageInfo } {
  const limit = Math.max(0, pagination.limit);
  const cursorIndex = pagination.cursor
    ? items.findIndex((item) => getCursor(item) === pagination.cursor)
    : -1;
  const start =
    pagination.cursor_direction === "backward"
      ? Math.max(0, (cursorIndex === -1 ? items.length : cursorIndex) - limit)
      : cursorIndex + 1;
  const end =
    pagination.cursor_direction === "backward"
      ? cursorIndex === -1
        ? items.length
        : cursorIndex
      : start + limit;
  const pageItems = items.slice(start, end);

  return {
    items: pageItems,
    page_info: {
      limit,
      next_cursor:
        end < items.length && pageItems.length > 0
          ? getCursor(pageItems[pageItems.length - 1] as TItem)
          : null,
      previous_cursor:
        start > 0 && pageItems.length > 0
          ? getCursor(pageItems[0] as TItem)
          : null,
      has_next_page: end < items.length,
      has_previous_page: start > 0,
    },
  };
}

export function buildReplayArchivePagedResult<TItem>(
  items: readonly TItem[],
  totalCount: number,
  pageInfo: ReplayArchivePageInfo,
  ordering: readonly ReplayArchiveOrdering[],
): ReplayArchivePagedResult<TItem> {
  return {
    count: items.length,
    total_count: totalCount,
    page_info: pageInfo,
    ordering,
    items,
  };
}

export function buildReplayArchiveQueryEnvelope<TData>(
  query: unknown,
  data: TData,
  generatedAt: string,
): ReplayArchiveQueryEnvelope<TData> {
  const queryHash = stableReplayArchiveIndexStringify(query);
  const deterministicHash = stableReplayArchiveIndexStringify(data);

  return {
    status: isEmptyQueryData(data) ? "empty" : "ok",
    version: 1,
    generated_at: generatedAt,
    query_hash: queryHash,
    deterministic_hash: deterministicHash,
    audit_context: extractAuditContext(query),
    data,
    errors: [],
  };
}

function collectReplayArchiveLineageTraversal(
  query: ReplayArchiveLineageTraversalQuery,
  index: ReplayArchiveSearchIndex,
): {
  readonly nodes: readonly ReplayArchiveLineageNode[];
  readonly edges: readonly ReplayArchiveLineageTraversalEdge[];
  readonly cycle_detected: boolean;
} {
  const collectedNodes = new Map<string, ReplayArchiveLineageNode>();
  const collectedEdges = new Map<string, ReplayArchiveLineageTraversalEdge>();
  const visited = new Set<string>();
  let cycleDetected = false;

  const collectNode = (node: ReplayArchiveLineageNode, depth: number): void => {
    if (!matchesReplayArchiveTimeRange(node.created_at, query.created_at)) {
      return;
    }

    if (query.stop_at_archive_ids.includes(node.archive_id) && depth > 0) {
      return;
    }

    if (visited.has(`${node.archive_id}:${depth}`)) {
      cycleDetected = true;
      return;
    }

    visited.add(`${node.archive_id}:${depth}`);
    collectedNodes.set(node.archive_id, node);

    if (depth >= query.max_depth) {
      return;
    }

    if (
      query.direction === "parents" ||
      query.direction === "ancestors" ||
      query.direction === "both"
    ) {
      collectParent(node, depth + 1);
    }

    if (
      query.direction === "children" ||
      query.direction === "descendants" ||
      query.direction === "both"
    ) {
      collectChildren(node, depth + 1);
    }

    if (query.include_siblings && node.parent_archive_id) {
      for (const sibling of index.lineage.children_by_parent_archive_id.get(node.parent_archive_id) ?? []) {
        collectedNodes.set(sibling.archive_id, sibling);
      }
    }
  };

  const collectParent = (node: ReplayArchiveLineageNode, depth: number): void => {
    if (!node.parent_archive_id) {
      return;
    }

    const parent = index.lineage.nodes_by_archive_id.get(node.parent_archive_id);

    if (!parent) {
      return;
    }

    collectEdge(parent.archive_id, node.archive_id, parent.created_at, depth);
    collectNode(parent, depth);
  };

  const collectChildren = (node: ReplayArchiveLineageNode, depth: number): void => {
    for (const child of index.lineage.children_by_parent_archive_id.get(node.archive_id) ?? []) {
      collectEdge(node.archive_id, child.archive_id, child.created_at, depth);
      collectNode(child, depth);
    }
  };

  const collectEdge = (
    parentArchiveId: string,
    childArchiveId: string,
    createdAt: string,
    depth: number,
  ): void => {
    const key = createReplayArchiveCanonicalIndexKey([
      parentArchiveId,
      childArchiveId,
      depth,
    ]);
    collectedEdges.set(key, {
      parent_archive_id: parentArchiveId,
      child_archive_id: childArchiveId,
      depth,
      created_at: createdAt,
      deterministic_hash: key,
    });
  };

  const root = index.lineage.nodes_by_archive_id.get(query.root_archive_id);

  if (root && query.include_root) {
    collectNode(root, 0);
  } else if (root) {
    if (
      query.direction === "parents" ||
      query.direction === "ancestors" ||
      query.direction === "both"
    ) {
      collectParent(root, 1);
    }

    if (
      query.direction === "children" ||
      query.direction === "descendants" ||
      query.direction === "both"
    ) {
      collectChildren(root, 1);
    }
  }

  return {
    nodes: Array.from(collectedNodes.values()).sort(compareReplayArchiveLineageNodes),
    edges: Array.from(collectedEdges.values()).sort(compareReplayArchiveLineageEdges),
    cycle_detected: cycleDetected,
  };
}

function projectReplayArchiveQueryResultRecord(
  record: ReplayArchiveQueryResultRecord,
  includeForensicPayload: boolean,
  includeGeneratedReport: boolean,
): ReplayArchiveQueryResultRecord {
  return {
    ...record,
    forensic_payload: includeForensicPayload ? record.forensic_payload : null,
    generated_report: includeGeneratedReport ? record.generated_report : null,
  };
}

function summarizeReplayArchiveDrift(
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

function driftDimensionsToCategories(
  dimensions: readonly ReplayArchiveTemporalDriftDimension[],
): readonly string[] {
  const categoryByDimension: Record<ReplayArchiveTemporalDriftDimension, string> = {
    manifest: "manifest_mismatch",
    bundle: "bundle_mismatch",
    snapshot: "snapshot_mismatch",
    signal: "signal_drift",
    provenance: "provenance_evolution",
    settlement: "settlement_mutation",
    timeline: "timeline_mismatch",
    lineage: "lineage_mismatch",
    integrity: "integrity_hash_mismatch",
  };

  return dimensions.map((dimension) => categoryByDimension[dimension]);
}

function compareReplayArchiveLineageEdges(
  left: ReplayArchiveLineageTraversalEdge,
  right: ReplayArchiveLineageTraversalEdge,
): number {
  return (
    left.depth - right.depth ||
    left.created_at.localeCompare(right.created_at) ||
    left.parent_archive_id.localeCompare(right.parent_archive_id) ||
    left.child_archive_id.localeCompare(right.child_archive_id)
  );
}

function compareReplayArchiveSortValues(
  left: string | number | boolean | null,
  right: string | number | boolean | null,
  nullOrdering: "nulls_first" | "nulls_last",
): number {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return nullOrdering === "nulls_first" ? -1 : 1;
  }

  if (right === null) {
    return nullOrdering === "nulls_first" ? 1 : -1;
  }

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right));
}

function getReplayArchiveIndexEntrySortValue(
  entry: ReplayArchiveIndexEntry,
  field: string,
): string | number | boolean | null {
  const manifestValue = getRecordValue(entry.manifest, field);
  const entryValue = getRecordValue(entry, field);

  return normalizeSortValue(entryValue ?? manifestValue);
}

function getReplayArchiveLineageNodeSortValue(
  node: ReplayArchiveLineageNode,
  field: string,
): string | number | boolean | null {
  return normalizeSortValue(getRecordValue(node, field));
}

function getReplayArchiveDriftSortValue(
  record: ReplayArchiveTemporalDriftRecord,
  field: string,
): string | number | boolean | null {
  if (field === "archive_id") {
    return record.comparison_archive_id;
  }

  return normalizeSortValue(getRecordValue(record, field));
}

function getReplayArchiveMutationSortValue(
  record: ReplayArchiveForensicMutationRecord,
  field: string,
): string | number | boolean | null {
  return normalizeSortValue(getRecordValue(record, field));
}

function normalizeSortValue(value: unknown): string | number | boolean | null {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return null;
}

function getRecordValue(record: object, field: string): unknown {
  return (record as Record<string, unknown>)[field];
}

function extractRecordTimestamp(
  entry: ReplayArchiveIndexEntry,
  field: "as_of" | "generated_at",
): string | null {
  const payload =
    typeof entry.result_record.forensic_payload === "object" &&
    entry.result_record.forensic_payload !== null &&
    !Array.isArray(entry.result_record.forensic_payload)
      ? entry.result_record.forensic_payload
      : null;

  if (!payload) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[field];

  return typeof value === "string" ? value : null;
}

function matchesStringSet<TValue extends string>(
  value: TValue,
  allowed: readonly TValue[] | readonly string[],
): boolean {
  return allowed.length === 0 || allowed.includes(value);
}

function matchesNullableStringSet<TValue extends string>(
  value: TValue | null,
  allowed: readonly TValue[] | readonly string[],
): boolean {
  return allowed.length === 0 || (value !== null && allowed.includes(value));
}

function matchesNumberSet(value: number, allowed: readonly number[]): boolean {
  return allowed.length === 0 || allowed.includes(value);
}

function matchesAllTags(tags: readonly string[], required: readonly string[]): boolean {
  return required.every((tag) => tags.includes(tag));
}

function matchesAnyTag(tags: readonly string[], allowed: readonly string[]): boolean {
  return allowed.length === 0 || allowed.some((tag) => tags.includes(tag));
}

function matchesAnyPath(path: string, allowed: readonly string[]): boolean {
  return allowed.length === 0 || allowed.some((candidate) => path.startsWith(candidate));
}

function isFromInclusive(inclusivity: ReplayArchiveTimeRangeFilter["inclusivity"]): boolean {
  return inclusivity === "inclusive" || inclusivity === "from_inclusive";
}

function isToInclusive(inclusivity: ReplayArchiveTimeRangeFilter["inclusivity"]): boolean {
  return inclusivity === "inclusive" || inclusivity === "to_inclusive";
}

function extractAuditContext(query: unknown): ReplayArchiveQueryEnvelope<unknown>["audit_context"] {
  const auditContext = (query as { audit_context?: unknown }).audit_context;

  if (
    auditContext &&
    typeof auditContext === "object" &&
    "requested_at" in auditContext &&
    "request_id" in auditContext
  ) {
    return auditContext as ReplayArchiveQueryEnvelope<unknown>["audit_context"];
  }

  return {
    requested_at: "",
    requested_by: null,
    request_id: "",
    consistency: "strict_replay_safe",
    source_system: "edge_setter_pipeline",
  };
}

function isEmptyQueryData(data: unknown): boolean {
  if (
    data &&
    typeof data === "object" &&
    "count" in data &&
    (data as { count?: unknown }).count === 0
  ) {
    return true;
  }

  return false;
}
