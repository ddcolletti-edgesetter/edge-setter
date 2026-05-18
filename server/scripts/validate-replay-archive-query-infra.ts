import {
  buildReplayArchiveSearchIndex,
  createReplayArchiveCanonicalIndexKey,
  stableReplayArchiveIndexStringify,
} from "../pipeline/replay-archive-index";
import {
  buildReplayArchiveQueryEnvelope,
  executeReplayArchiveForensicMutationSearch,
  executeReplayArchiveHistoricalQuery,
  executeReplayArchiveTemporalDriftQuery,
  filterReplayArchiveForensicMutationRecords,
  filterReplayArchiveHistoricalRecords,
  filterReplayArchiveTemporalDriftRecords,
  matchesReplayArchiveTimeRange,
  paginateReplayArchiveItems,
  reconstructReplayArchiveAncestry,
  sortReplayArchiveItems,
  traverseReplayArchiveLineage,
} from "../pipeline/replay-archive-query";
import type {
  ReplayArchiveManifest,
} from "../pipeline/replay-archive-contract";
import type {
  ReplayArchiveLineageNode,
} from "../pipeline/replay-archive-lineage";
import type {
  ReplayArchiveIndexSourceRecord,
} from "../pipeline/replay-archive-index";
import type {
  ReplayArchiveForensicMutationRecord,
  ReplayArchiveHistoricalQuery,
  ReplayArchiveHistoricalQueryFilters,
  ReplayArchiveLineageTraversalQuery,
  ReplayArchiveQueryAuditContext,
  ReplayArchiveQueryEnvelope,
  ReplayArchiveTemporalDriftRecord,
} from "../pipeline/replay-archive-query-contract";

const GENERATED_AT = "2026-01-01T00:10:00.000Z";
const AUDIT_CONTEXT: ReplayArchiveQueryAuditContext = {
  requested_at: "2026-01-01T00:11:00.000Z",
  requested_by: "validation-script",
  request_id: "archive-query-validation-001",
  consistency: "strict_replay_safe",
  source_system: "edge_setter_pipeline",
};

const manifests: readonly ReplayArchiveManifest[] = [
  createManifest({
    archive_id: "archive-root",
    game_id: "game-alpha",
    created_at: "2026-01-01T00:00:00.000Z",
    revision_number: 1,
    retention_class: "historical",
    verification_status: "verified",
    tags: ["validation", "root"],
  }),
  createManifest({
    archive_id: "archive-child",
    game_id: "game-alpha",
    created_at: "2026-01-01T00:05:00.000Z",
    revision_number: 2,
    parent_archive_id: "archive-root",
    root_archive_id: "archive-root",
    retention_class: "historical",
    verification_status: "verified",
    tags: ["validation", "child", "drift"],
  }),
  createManifest({
    archive_id: "archive-sibling",
    game_id: "game-alpha",
    created_at: "2026-01-01T00:06:00.000Z",
    revision_number: 3,
    parent_archive_id: "archive-root",
    root_archive_id: "archive-root",
    retention_class: "seasonal",
    verification_status: "failed",
    tags: ["validation", "sibling"],
  }),
  createManifest({
    archive_id: "archive-other",
    game_id: "game-beta",
    created_at: "2026-01-02T00:00:00.000Z",
    revision_number: 1,
    retention_class: "permanent",
    verification_status: "verified",
    tags: ["validation", "other"],
  }),
];

const records: readonly ReplayArchiveIndexSourceRecord[] = manifests.map((manifest) => ({
  manifest,
  replay_hash: `${manifest.archive_id}-replay-hash`,
  integrity_status:
    manifest.archive_id === "archive-sibling" ? "diverged" : "verified",
  deterministic_hash: `${manifest.archive_id}-deterministic-hash`,
  snapshot_canonical_hash: manifest.snapshot_hash,
  lineage_depth: manifest.revision_number - 1,
  forensic_payload: {
    as_of: manifest.created_at,
    generated_at: GENERATED_AT,
    archive_id: manifest.archive_id,
  },
  generated_report: {
    archive_id: manifest.archive_id,
    summary: "fixed validation report",
  },
}));

const lineageNodes: readonly ReplayArchiveLineageNode[] = [
  {
    archive_id: "archive-root",
    parent_archive_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    manifest_hash: "export-archive-root",
    bundle_hash: "bundle-archive-root",
  },
  {
    archive_id: "archive-child",
    parent_archive_id: "archive-root",
    created_at: "2026-01-01T00:05:00.000Z",
    manifest_hash: "export-archive-child",
    bundle_hash: "bundle-archive-child",
  },
  {
    archive_id: "archive-sibling",
    parent_archive_id: "archive-root",
    created_at: "2026-01-01T00:06:00.000Z",
    manifest_hash: "export-archive-sibling",
    bundle_hash: "bundle-archive-sibling",
  },
  {
    archive_id: "archive-other",
    parent_archive_id: null,
    created_at: "2026-01-02T00:00:00.000Z",
    manifest_hash: "export-archive-other",
    bundle_hash: "bundle-archive-other",
  },
];

const driftRecords: readonly ReplayArchiveTemporalDriftRecord[] = [
  {
    baseline_archive_id: "archive-root",
    comparison_archive_id: "archive-child",
    observed_at: "2026-01-01T00:07:00.000Z",
    equivalent: false,
    mismatch_count: 2,
    mismatch_categories: ["signal_drift", "settlement_mutation"],
    signal_drift: [
      {
        signal_id: "signal-1",
        market: "spread",
        field: "confidence",
        left: 0.7,
        right: 0.8,
      },
    ],
    provenance_evolution: [],
    settlement_mutations: [
      {
        outcome_id: "outcome-1",
        field: "result",
        left: "pending",
        right: "win",
      },
    ],
    mismatches: [
      {
        category: "signal_drift",
        path: "signals.signal-1.confidence",
        left: 0.7,
        right: 0.8,
        severity: "warning",
      },
      {
        category: "settlement_mutation",
        path: "settlements.outcome-1.result",
        left: "pending",
        right: "win",
        severity: "critical",
      },
    ],
    deterministic_hash: "drift-root-child",
  },
  {
    baseline_archive_id: "archive-root",
    comparison_archive_id: "archive-sibling",
    observed_at: "2026-01-01T00:08:00.000Z",
    equivalent: true,
    mismatch_count: 0,
    mismatch_categories: [],
    signal_drift: [],
    provenance_evolution: [],
    settlement_mutations: [],
    mismatches: [],
    deterministic_hash: "drift-root-sibling",
  },
];

const mutationRecords: readonly ReplayArchiveForensicMutationRecord[] = [
  {
    archive_id: "archive-child",
    replay_hash: "archive-child-replay-hash",
    entity: "signal",
    entity_id: "signal-1",
    operation: "updated",
    category: "signal_mismatch",
    path: "signals.signal-1.confidence",
    previous_value: 0.7,
    current_value: 0.8,
    severity: "warning",
    changed_at: "2026-01-01T00:07:00.000Z",
    deterministic_hash: "mutation-signal-confidence",
  },
  {
    archive_id: "archive-sibling",
    replay_hash: "archive-sibling-replay-hash",
    entity: "settlement",
    entity_id: "outcome-1",
    operation: "status_changed",
    category: "settlement_mismatch",
    path: "settlements.outcome-1.result",
    previous_value: "pending",
    current_value: "loss",
    severity: "critical",
    changed_at: "2026-01-01T00:09:00.000Z",
    deterministic_hash: "mutation-settlement-result",
  },
];

const index = buildReplayArchiveSearchIndex({
  records,
  lineage_nodes: lineageNodes,
  drift_records: driftRecords,
  mutation_records: mutationRecords,
});

validateContracts();
validateIndexConstruction();
validateHistoricalFiltering();
validateSortingAndPagination();
validateLineageTraversal();
validateAncestryReconstruction();
validateTemporalDriftFilters();
validateForensicMutationFilters();
validateEnvelopes();

console.log("Replay archive historical query infrastructure validation passed.");
console.log(`Archive index entries: ${index.entries.length}`);
console.log(`Lineage nodes: ${index.lineage.nodes.length}`);
console.log(`Drift records: ${index.drift.records.length}`);
console.log(`Mutation records: ${index.mutations.records.length}`);

function validateContracts(): void {
  const key = createReplayArchiveCanonicalIndexKey([
    "archive",
    "archive-child",
    "archive-child-replay-hash",
    2,
  ]);

  assertEqual(
    key,
    "archive|archive-child|archive-child-replay-hash|2",
    "canonical index key generation changed",
  );
  assertEqual(
    stableReplayArchiveIndexStringify({ b: 2, a: 1 }),
    '{"a":1,"b":2}',
    "stable index stringify must sort object keys",
  );
  assertEqual(
    matchesReplayArchiveTimeRange("2026-01-01T00:05:00.000Z", {
      from: "2026-01-01T00:05:00.000Z",
      to: "2026-01-01T00:06:00.000Z",
      inclusivity: "inclusive",
    }),
    true,
    "inclusive temporal filter should include boundary timestamp",
  );
}

function validateIndexConstruction(): void {
  assertEqual(index.entries.length, 4, "archive index entry count mismatch");
  assertEqual(
    index.entries.map((entry) => entry.archive_id).join(","),
    "archive-root,archive-child,archive-sibling,archive-other",
    "archive index entries are not in deterministic timestamp order",
  );
  assertEqual(
    index.lookups.by_archive_id.get("archive-child")?.parent_archive_id,
    "archive-root",
    "archive lookup by archive_id failed",
  );
  assertEqual(
    index.lookups.by_game_id.get("game-alpha")?.length,
    3,
    "archive lookup by game_id failed",
  );
  assertEqual(
    index.lineage.children_by_parent_archive_id.get("archive-root")?.map((node) => node.archive_id).join(","),
    "archive-child,archive-sibling",
    "lineage relationship index is not deterministically ordered",
  );
}

function validateHistoricalFiltering(): void {
  const filters = createEmptyFilters({
    game_ids: ["game-alpha"],
    retention_classes: ["historical"],
    tags_all: ["validation"],
    created_at: {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-01T00:05:00.000Z",
      inclusivity: "inclusive",
    },
  });
  const filtered = filterReplayArchiveHistoricalRecords(index.entries, filters);

  assertEqual(
    filtered.map((entry) => entry.archive_id).join(","),
    "archive-root,archive-child",
    "historical archive filtering returned unexpected records",
  );

  const query: ReplayArchiveHistoricalQuery = {
    filters,
    ordering: [
      {
        field: "created_at",
        direction: "desc",
        null_ordering: "nulls_last",
        tie_breakers: [{ field: "archive_id", direction: "asc" }],
      },
    ],
    pagination: {
      limit: 1,
      cursor: null,
      cursor_direction: "forward",
    },
    include_snapshot: false,
    include_forensic_payload: false,
    include_generated_report: false,
    audit_context: AUDIT_CONTEXT,
  };
  const envelope = executeReplayArchiveHistoricalQuery(query, index, GENERATED_AT);

  assertEqual(envelope.status, "ok", "historical query envelope status mismatch");
  assertEqual(envelope.data?.count, 1, "historical query pagination count mismatch");
  assertEqual(
    envelope.data?.items[0]?.manifest.archive_id,
    "archive-child",
    "historical query ordering should return newest archive first",
  );
  assertEqual(
    envelope.data?.items[0]?.forensic_payload,
    null,
    "historical query should omit forensic payload when requested",
  );
}

function validateSortingAndPagination(): void {
  const sorted = sortReplayArchiveItems(
    index.entries,
    [
      {
        field: "revision_number",
        direction: "desc",
        null_ordering: "nulls_last",
        tie_breakers: [{ field: "archive_id", direction: "asc" }],
      },
    ],
    (entry, field) => {
      if (field === "revision_number") {
        return entry.revision_number;
      }

      if (field === "archive_id") {
        return entry.archive_id;
      }

      return null;
    },
    (left, right) => left.archive_id.localeCompare(right.archive_id),
  );

  assertEqual(
    sorted.map((entry) => entry.archive_id).join(","),
    "archive-sibling,archive-child,archive-other,archive-root",
    "deterministic custom sorting returned unexpected order",
  );

  const page = paginateReplayArchiveItems(sorted, {
    limit: 2,
    cursor: null,
    cursor_direction: "forward",
  }, (entry) => entry.archive_id);

  assertEqual(page.items.length, 2, "pagination page size mismatch");
  assertEqual(page.page_info.has_next_page, true, "pagination should expose next page");
  assertEqual(
    page.page_info.next_cursor,
    "archive-child",
    "pagination next cursor mismatch",
  );
}

function validateLineageTraversal(): void {
  const query: ReplayArchiveLineageTraversalQuery = {
    root_archive_id: "archive-root",
    direction: "descendants",
    max_depth: 2,
    include_root: true,
    include_siblings: false,
    stop_at_archive_ids: [],
    created_at: null,
    ordering: [
      {
        field: "created_at",
        direction: "asc",
        null_ordering: "nulls_last",
        tie_breakers: [{ field: "archive_id", direction: "asc" }],
      },
    ],
    pagination: {
      limit: 10,
      cursor: null,
      cursor_direction: "forward",
    },
    audit_context: AUDIT_CONTEXT,
  };
  const result = traverseReplayArchiveLineage(query, index);

  assertEqual(result.cycle_detected, false, "lineage traversal should not detect a cycle");
  assertEqual(
    result.nodes.map((node) => node.archive_id).join(","),
    "archive-root,archive-child,archive-sibling",
    "lineage traversal node order mismatch",
  );
  assertEqual(result.edges.length, 2, "lineage traversal edge count mismatch");
}

function validateAncestryReconstruction(): void {
  const result = reconstructReplayArchiveAncestry({
    archive_id: "archive-child",
    root_archive_id: "archive-root",
    replay_hash: "archive-child-replay-hash",
    max_depth: 5,
    include_manifests: true,
    include_timeline_events: true,
    include_drift_summary: true,
    audit_context: AUDIT_CONTEXT,
  }, index);

  assertEqual(result.complete, true, "ancestry reconstruction should be complete");
  assertEqual(result.cycle_detected, false, "ancestry reconstruction should not detect a cycle");
  assertEqual(
    result.nodes.map((node) => node.archive_id).join(","),
    "archive-root,archive-child",
    "ancestry reconstruction chain mismatch",
  );
  assertEqual(
    result.nodes[0]?.depth_from_root,
    0,
    "ancestry root depth mismatch",
  );
  assertEqual(
    result.drift_summary.length > 0,
    true,
    "ancestry drift summary should be populated when requested",
  );
}

function validateTemporalDriftFilters(): void {
  const query = {
    baseline_archive_id: "archive-root",
    comparison_archive_ids: [],
    drift_dimensions: ["signal" as const],
    observed_at: {
      from: "2026-01-01T00:07:00.000Z",
      to: "2026-01-01T00:08:00.000Z",
      inclusivity: "inclusive" as const,
    },
    include_equivalent: false,
    include_mismatch_details: false,
    ordering: [
      {
        field: "observed_at" as const,
        direction: "asc" as const,
        null_ordering: "nulls_last" as const,
        tie_breakers: [{ field: "archive_id" as const, direction: "asc" as const }],
      },
    ],
    pagination: {
      limit: 10,
      cursor: null,
      cursor_direction: "forward" as const,
    },
    audit_context: AUDIT_CONTEXT,
  };
  const filtered = filterReplayArchiveTemporalDriftRecords(driftRecords, query);

  assertEqual(filtered.length, 1, "temporal drift filtering should return one non-equivalent signal drift");
  assertEqual(filtered[0]?.comparison_archive_id, "archive-child", "temporal drift comparison mismatch");

  const envelope = executeReplayArchiveTemporalDriftQuery(query, index, GENERATED_AT);
  assertEqual(
    envelope.data?.items[0]?.mismatches.length,
    0,
    "temporal drift query should omit mismatch details when requested",
  );
}

function validateForensicMutationFilters(): void {
  const query = {
    archive_ids: [],
    game_ids: ["game-alpha"],
    replay_hashes: [],
    entities: ["settlement" as const],
    operations: ["status_changed" as const],
    categories: ["settlement_mismatch" as const],
    severities: ["critical" as const],
    paths: ["settlements"],
    changed_at: {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-01T00:10:00.000Z",
      inclusivity: "inclusive" as const,
    },
    include_payload_values: false,
    ordering: [
      {
        field: "changed_at" as const,
        direction: "asc" as const,
        null_ordering: "nulls_last" as const,
        tie_breakers: [{ field: "archive_id" as const, direction: "asc" as const }],
      },
    ],
    pagination: {
      limit: 10,
      cursor: null,
      cursor_direction: "forward" as const,
    },
    audit_context: AUDIT_CONTEXT,
  };
  const filtered = filterReplayArchiveForensicMutationRecords(
    mutationRecords,
    query,
    (archiveId) => index.lookups.by_archive_id.get(archiveId)?.game_id ?? null,
  );

  assertEqual(filtered.length, 1, "forensic mutation filtering should return one settlement mutation");
  assertEqual(filtered[0]?.archive_id, "archive-sibling", "forensic mutation archive mismatch");

  const envelope = executeReplayArchiveForensicMutationSearch(query, index, GENERATED_AT);
  assertEqual(
    envelope.data?.items[0]?.current_value,
    null,
    "forensic mutation query should omit payload values when requested",
  );
}

function validateEnvelopes(): void {
  const success = buildReplayArchiveQueryEnvelope(
    {
      audit_context: AUDIT_CONTEXT,
      validation: "success-envelope",
    },
    {
      count: 1,
      items: ["archive-child"],
    },
    GENERATED_AT,
  );

  assertEqual(success.status, "ok", "success envelope status mismatch");
  assertEqual(success.version, 1, "success envelope version mismatch");
  assertEqual(success.generated_at, GENERATED_AT, "success envelope generated_at mismatch");
  assertEqual(success.audit_context.request_id, AUDIT_CONTEXT.request_id, "success envelope audit context mismatch");

  const errorEnvelope: ReplayArchiveQueryEnvelope<null> = {
    status: "error",
    version: 1,
    generated_at: GENERATED_AT,
    query_hash: "validation-error-query",
    deterministic_hash: "validation-error-deterministic",
    audit_context: AUDIT_CONTEXT,
    data: null,
    errors: [
      {
        code: "invalid_filter",
        message: "Validation error envelope fixture",
        field: "filters.created_at",
        severity: "critical",
        deterministic: true,
        details: {
          expected: "fixed validation failure",
        },
      },
    ],
  };

  assertEqual(errorEnvelope.status, "error", "error envelope status mismatch");
  assertEqual(errorEnvelope.errors[0]?.deterministic, true, "error envelope must be deterministic");
  assertEqual(errorEnvelope.errors[0]?.code, "invalid_filter", "error envelope code mismatch");
}

function createEmptyFilters(
  overrides: Partial<ReplayArchiveHistoricalQueryFilters> = {},
): ReplayArchiveHistoricalQueryFilters {
  return {
    game_ids: [],
    archive_ids: [],
    replay_hashes: [],
    root_archive_ids: [],
    parent_archive_ids: [],
    retention_classes: [],
    verification_statuses: [],
    integrity_statuses: [],
    forensic_versions: [],
    revision_numbers: [],
    tags_all: [],
    tags_any: [],
    created_at: null,
    as_of: null,
    generated_at: null,
    snapshot_hashes: [],
    bundle_hashes: [],
    export_hashes: [],
    timeline_hashes: [],
    signal_hashes: [],
    settlement_hashes: [],
    provenance_hashes: [],
    ...overrides,
  };
}

function createManifest(params: {
  archive_id: string;
  game_id: string;
  created_at: string;
  revision_number: number;
  retention_class: ReplayArchiveManifest["retention_class"];
  verification_status: ReplayArchiveManifest["verification_status"];
  tags: string[];
  parent_archive_id?: string;
  root_archive_id?: string;
}): ReplayArchiveManifest {
  return {
    archive_id: params.archive_id,
    game_id: params.game_id,
    created_at: params.created_at,
    forensic_version: 1,
    snapshot_hash: `snapshot-${params.archive_id}`,
    bundle_hash: `bundle-${params.archive_id}`,
    export_hash: `export-${params.archive_id}`,
    timeline_hash: `timeline-${params.archive_id}`,
    signal_hash: `signal-${params.archive_id}`,
    settlement_hash: `settlement-${params.archive_id}`,
    provenance_hash: `provenance-${params.archive_id}`,
    compression: "gzip",
    bundle_size_bytes: 1024 + params.revision_number,
    replay_count: params.revision_number,
    verification_status: params.verification_status,
    retention_class: params.retention_class,
    parent_archive_id: params.parent_archive_id,
    root_archive_id: params.root_archive_id,
    revision_number: params.revision_number,
    tags: params.tags,
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}
