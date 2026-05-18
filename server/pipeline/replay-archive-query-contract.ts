import type {
  ReplayArchiveManifest,
  ReplayArchiveRetentionClass,
  ReplayArchiveVerificationStatus,
} from "./replay-archive-contract";
import type {
  ReplayArchiveDiffCategory,
  ReplayArchiveDiffMismatch,
  ReplayArchiveProvenanceEvolution,
  ReplayArchiveSettlementMutation,
  ReplayArchiveSignalDrift,
} from "./replay-archive-diff-contract";
import type { ReplayArchiveLineageNode } from "./replay-archive-lineage";
import type { ReplayArchiveTimelineEvent } from "./replay-archive-timeline";
import type { ReplayForensicJsonValue } from "./replay-forensic-contract";
import type {
  ReplayIntegrityStatus,
  ReplayMismatchCategory,
  ReplayMismatchDetail,
  ReplayMismatchSummary,
} from "./replay-contract";

export type ReplayArchiveIsoTimestamp = string;

export type ReplayArchiveQueryConsistency =
  | "strict_replay_safe"
  | "audit_snapshot"
  | "forensic_export";

export type ReplayArchiveQueryScope =
  | "archive_manifest"
  | "archive_snapshot"
  | "archive_bundle"
  | "archive_lineage"
  | "archive_diff"
  | "forensic_mutation"
  | "replay_intelligence";

export type ReplayArchiveSortDirection = "asc" | "desc";

export type ReplayArchiveNullOrdering = "nulls_first" | "nulls_last";

export type ReplayArchiveQueryStatus =
  | "ok"
  | "empty"
  | "partial"
  | "error";

export type ReplayArchiveQueryErrorCode =
  | "invalid_filter"
  | "invalid_pagination"
  | "invalid_ordering"
  | "archive_not_found"
  | "lineage_cycle_detected"
  | "lineage_depth_exceeded"
  | "temporal_window_invalid"
  | "deterministic_hash_mismatch"
  | "forensic_payload_unavailable"
  | "query_not_supported";

export type ReplayArchiveQuerySeverity =
  | "info"
  | "warning"
  | "critical";

export interface ReplayArchiveTimeRangeFilter {
  from: ReplayArchiveIsoTimestamp | null;
  to: ReplayArchiveIsoTimestamp | null;
  inclusivity: "inclusive" | "exclusive" | "from_inclusive" | "to_inclusive";
}

export interface ReplayArchivePagination {
  limit: number;
  cursor: string | null;
  cursor_direction: "forward" | "backward";
}

export interface ReplayArchivePageInfo {
  limit: number;
  next_cursor: string | null;
  previous_cursor: string | null;
  has_next_page: boolean;
  has_previous_page: boolean;
}

export interface ReplayArchiveOrdering<TField extends string = string> {
  field: TField;
  direction: ReplayArchiveSortDirection;
  null_ordering: ReplayArchiveNullOrdering;
  tie_breakers: readonly ReplayArchiveOrderingTieBreaker[];
}

export interface ReplayArchiveOrderingTieBreaker {
  field:
    | "archive_id"
    | "replay_hash"
    | "game_id"
    | "created_at"
    | "revision_number"
    | "deterministic_hash";
  direction: ReplayArchiveSortDirection;
}

export interface ReplayArchiveQueryAuditContext {
  requested_at: ReplayArchiveIsoTimestamp;
  requested_by: string | null;
  request_id: string;
  consistency: ReplayArchiveQueryConsistency;
  source_system: "edge_setter_pipeline";
}

export interface ReplayArchiveQueryError {
  code: ReplayArchiveQueryErrorCode;
  message: string;
  field: string | null;
  severity: ReplayArchiveQuerySeverity;
  deterministic: true;
  details: Record<string, ReplayForensicJsonValue>;
}

export interface ReplayArchiveQueryEnvelope<TData> {
  status: ReplayArchiveQueryStatus;
  version: 1;
  generated_at: ReplayArchiveIsoTimestamp;
  query_hash: string;
  deterministic_hash: string;
  audit_context: ReplayArchiveQueryAuditContext;
  data: TData | null;
  errors: readonly ReplayArchiveQueryError[];
}

export interface ReplayArchivePagedResult<TItem> {
  count: number;
  total_count: number | null;
  page_info: ReplayArchivePageInfo;
  ordering: readonly ReplayArchiveOrdering[];
  items: readonly TItem[];
}

export type ReplayArchiveManifestSortField =
  | "created_at"
  | "game_id"
  | "archive_id"
  | "revision_number"
  | "replay_count"
  | "bundle_size_bytes"
  | "verification_status"
  | "retention_class";

export interface ReplayArchiveHistoricalQueryFilters {
  game_ids: readonly string[];
  archive_ids: readonly string[];
  replay_hashes: readonly string[];
  root_archive_ids: readonly string[];
  parent_archive_ids: readonly string[];
  retention_classes: readonly ReplayArchiveRetentionClass[];
  verification_statuses: readonly ReplayArchiveVerificationStatus[];
  integrity_statuses: readonly ReplayIntegrityStatus[];
  forensic_versions: readonly number[];
  revision_numbers: readonly number[];
  tags_all: readonly string[];
  tags_any: readonly string[];
  created_at: ReplayArchiveTimeRangeFilter | null;
  as_of: ReplayArchiveTimeRangeFilter | null;
  generated_at: ReplayArchiveTimeRangeFilter | null;
  snapshot_hashes: readonly string[];
  bundle_hashes: readonly string[];
  export_hashes: readonly string[];
  timeline_hashes: readonly string[];
  signal_hashes: readonly string[];
  settlement_hashes: readonly string[];
  provenance_hashes: readonly string[];
}

export interface ReplayArchiveHistoricalQuery {
  filters: ReplayArchiveHistoricalQueryFilters;
  ordering: readonly ReplayArchiveOrdering<ReplayArchiveManifestSortField>[];
  pagination: ReplayArchivePagination;
  include_snapshot: boolean;
  include_forensic_payload: boolean;
  include_generated_report: boolean;
  audit_context: ReplayArchiveQueryAuditContext;
}

export interface ReplayArchiveQueryResultRecord {
  manifest: ReplayArchiveManifest;
  replay_hash: string | null;
  integrity_status: ReplayIntegrityStatus | null;
  deterministic_hash: string;
  snapshot_canonical_hash: string | null;
  lineage_depth: number | null;
  forensic_payload: ReplayForensicJsonValue | null;
  generated_report: ReplayForensicJsonValue | null;
}

export type ReplayArchiveHistoricalQueryResult =
  ReplayArchivePagedResult<ReplayArchiveQueryResultRecord>;

export type ReplayArchiveHistoricalQueryEnvelope =
  ReplayArchiveQueryEnvelope<ReplayArchiveHistoricalQueryResult>;

export type ReplayArchiveLineageTraversalDirection =
  | "parents"
  | "children"
  | "ancestors"
  | "descendants"
  | "both";

export interface ReplayArchiveLineageTraversalQuery {
  root_archive_id: string;
  direction: ReplayArchiveLineageTraversalDirection;
  max_depth: number;
  include_root: boolean;
  include_siblings: boolean;
  stop_at_archive_ids: readonly string[];
  created_at: ReplayArchiveTimeRangeFilter | null;
  ordering: readonly ReplayArchiveOrdering<"created_at" | "archive_id">[];
  pagination: ReplayArchivePagination;
  audit_context: ReplayArchiveQueryAuditContext;
}

export interface ReplayArchiveLineageTraversalEdge {
  parent_archive_id: string;
  child_archive_id: string;
  depth: number;
  created_at: ReplayArchiveIsoTimestamp;
  deterministic_hash: string;
}

export interface ReplayArchiveLineageTraversalResult {
  root_archive_id: string;
  direction: ReplayArchiveLineageTraversalDirection;
  max_depth: number;
  nodes: readonly ReplayArchiveLineageNode[];
  edges: readonly ReplayArchiveLineageTraversalEdge[];
  cycle_detected: boolean;
  page_info: ReplayArchivePageInfo;
}

export type ReplayArchiveLineageTraversalEnvelope =
  ReplayArchiveQueryEnvelope<ReplayArchiveLineageTraversalResult>;

export type ReplayArchiveTemporalDriftDimension =
  | "manifest"
  | "bundle"
  | "snapshot"
  | "signal"
  | "provenance"
  | "settlement"
  | "timeline"
  | "lineage"
  | "integrity";

export interface ReplayArchiveTemporalDriftQuery {
  baseline_archive_id: string;
  comparison_archive_ids: readonly string[];
  drift_dimensions: readonly ReplayArchiveTemporalDriftDimension[];
  observed_at: ReplayArchiveTimeRangeFilter | null;
  include_equivalent: boolean;
  include_mismatch_details: boolean;
  ordering: readonly ReplayArchiveOrdering<"observed_at" | "archive_id" | "mismatch_count">[];
  pagination: ReplayArchivePagination;
  audit_context: ReplayArchiveQueryAuditContext;
}

export interface ReplayArchiveTemporalDriftRecord {
  baseline_archive_id: string;
  comparison_archive_id: string;
  observed_at: ReplayArchiveIsoTimestamp;
  equivalent: boolean;
  mismatch_count: number;
  mismatch_categories: readonly ReplayArchiveDiffCategory[];
  signal_drift: readonly ReplayArchiveSignalDrift[];
  provenance_evolution: readonly ReplayArchiveProvenanceEvolution[];
  settlement_mutations: readonly ReplayArchiveSettlementMutation[];
  mismatches: readonly ReplayArchiveDiffMismatch[];
  deterministic_hash: string;
}

export type ReplayArchiveTemporalDriftResult =
  ReplayArchivePagedResult<ReplayArchiveTemporalDriftRecord>;

export type ReplayArchiveTemporalDriftEnvelope =
  ReplayArchiveQueryEnvelope<ReplayArchiveTemporalDriftResult>;

export type ReplayArchiveForensicMutationEntity =
  | "archive_manifest"
  | "archive_snapshot"
  | "forensic_payload"
  | "generated_report"
  | "signal"
  | "settlement"
  | "provenance"
  | "timeline_event"
  | "lineage_edge";

export type ReplayArchiveForensicMutationOperation =
  | "created"
  | "updated"
  | "removed"
  | "reordered"
  | "hash_changed"
  | "status_changed";

export interface ReplayArchiveForensicMutationSearchQuery {
  archive_ids: readonly string[];
  game_ids: readonly string[];
  replay_hashes: readonly string[];
  entities: readonly ReplayArchiveForensicMutationEntity[];
  operations: readonly ReplayArchiveForensicMutationOperation[];
  categories: readonly ReplayMismatchCategory[];
  severities: readonly ReplayArchiveQuerySeverity[];
  paths: readonly string[];
  changed_at: ReplayArchiveTimeRangeFilter | null;
  include_payload_values: boolean;
  ordering: readonly ReplayArchiveOrdering<"changed_at" | "archive_id" | "entity" | "path">[];
  pagination: ReplayArchivePagination;
  audit_context: ReplayArchiveQueryAuditContext;
}

export interface ReplayArchiveForensicMutationRecord {
  archive_id: string;
  replay_hash: string | null;
  entity: ReplayArchiveForensicMutationEntity;
  entity_id: string;
  operation: ReplayArchiveForensicMutationOperation;
  category: ReplayMismatchCategory | ReplayArchiveDiffCategory;
  path: string;
  previous_value: ReplayForensicJsonValue | null;
  current_value: ReplayForensicJsonValue | null;
  severity: ReplayArchiveQuerySeverity;
  changed_at: ReplayArchiveIsoTimestamp;
  deterministic_hash: string;
}

export type ReplayArchiveForensicMutationSearchResult =
  ReplayArchivePagedResult<ReplayArchiveForensicMutationRecord>;

export type ReplayArchiveForensicMutationSearchEnvelope =
  ReplayArchiveQueryEnvelope<ReplayArchiveForensicMutationSearchResult>;

export interface ReplayArchiveAncestryReconstructionQuery {
  archive_id: string;
  root_archive_id: string | null;
  replay_hash: string | null;
  max_depth: number;
  include_manifests: boolean;
  include_timeline_events: boolean;
  include_drift_summary: boolean;
  audit_context: ReplayArchiveQueryAuditContext;
}

export interface ReplayArchiveAncestryNode {
  archive_id: string;
  parent_archive_id: string | null;
  root_archive_id: string | null;
  revision_number: number;
  depth_from_root: number;
  depth_from_target: number;
  created_at: ReplayArchiveIsoTimestamp;
  manifest: ReplayArchiveManifest | null;
  deterministic_hash: string;
}

export interface ReplayArchiveAncestryReconstructionResult {
  archive_id: string;
  root_archive_id: string | null;
  complete: boolean;
  cycle_detected: boolean;
  nodes: readonly ReplayArchiveAncestryNode[];
  timeline_events: readonly ReplayArchiveTimelineEvent[];
  drift_summary: readonly ReplayMismatchSummary[];
  deterministic_hash: string;
}

export type ReplayArchiveAncestryReconstructionEnvelope =
  ReplayArchiveQueryEnvelope<ReplayArchiveAncestryReconstructionResult>;

export type ReplayArchiveIntelligenceAggregationDimension =
  | "game_id"
  | "retention_class"
  | "verification_status"
  | "integrity_status"
  | "drift_category"
  | "mutation_entity"
  | "created_day"
  | "created_month";

export type ReplayArchiveIntelligenceMetric =
  | "archive_count"
  | "replay_count"
  | "mutation_count"
  | "drift_count"
  | "critical_mismatch_count"
  | "verified_count"
  | "failed_count"
  | "bundle_size_bytes";

export interface ReplayArchiveIntelligenceAggregationQuery {
  filters: ReplayArchiveHistoricalQueryFilters;
  dimensions: readonly ReplayArchiveIntelligenceAggregationDimension[];
  metrics: readonly ReplayArchiveIntelligenceMetric[];
  created_at_bucket_timezone: "UTC";
  ordering: readonly ReplayArchiveOrdering<"dimension_key" | "metric_value">[];
  pagination: ReplayArchivePagination;
  audit_context: ReplayArchiveQueryAuditContext;
}

export interface ReplayArchiveIntelligenceAggregationBucket {
  dimension_key: string;
  dimensions: Record<ReplayArchiveIntelligenceAggregationDimension, string | null>;
  metrics: Record<ReplayArchiveIntelligenceMetric, number>;
  mismatch_summaries: readonly ReplayMismatchSummary[];
  mutation_entities: readonly ReplayArchiveForensicMutationEntity[];
  deterministic_hash: string;
}

export type ReplayArchiveIntelligenceAggregationResult =
  ReplayArchivePagedResult<ReplayArchiveIntelligenceAggregationBucket>;

export type ReplayArchiveIntelligenceAggregationEnvelope =
  ReplayArchiveQueryEnvelope<ReplayArchiveIntelligenceAggregationResult>;

export interface ReplayArchiveStableQueryResultSet {
  historical_query: ReplayArchiveHistoricalQueryEnvelope | null;
  lineage_traversal: ReplayArchiveLineageTraversalEnvelope | null;
  temporal_drift: ReplayArchiveTemporalDriftEnvelope | null;
  forensic_mutation_search: ReplayArchiveForensicMutationSearchEnvelope | null;
  ancestry_reconstruction: ReplayArchiveAncestryReconstructionEnvelope | null;
  intelligence_aggregation: ReplayArchiveIntelligenceAggregationEnvelope | null;
}

export interface ReplayArchiveQueryDiagnostic {
  scope: ReplayArchiveQueryScope;
  deterministic_hash: string;
  warnings: readonly ReplayArchiveQueryError[];
  mismatch_details: readonly ReplayMismatchDetail[];
}
