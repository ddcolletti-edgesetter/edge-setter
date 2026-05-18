import type {
  ReplayArchiveDriftTrendSummary,
  ReplayArchiveMutationFrequencyBucket,
} from "./replay-archive-intelligence";
import type {
  ReplayArchiveQueryErrorCode,
  ReplayArchiveQuerySeverity,
} from "./replay-archive-query-contract";
import type {
  ReplayAuditAnalyticsRow,
  ReplayEvolutionMetricRow,
  ReplayForensicIntelligenceRecordRow,
  ReplayIntelligenceRecordScope,
  ReplayIntelligenceSnapshotRow,
  ReplayLineageIntelligenceMetricRow,
} from "./replay-intelligence-contract";
import type { ReplayForensicJsonValue } from "./replay-forensic-contract";

export interface ReplayIntelligenceApiPagination {
  limit: number;
  cursor: string | null;
}

export interface ReplayIntelligenceApiPageInfo {
  limit: number;
  next_cursor: string | null;
  has_next_page: boolean;
}

export interface ReplayIntelligenceApiQueryMetadata {
  generated_at: string;
  deterministic_hash: string;
  request_id: string | null;
  page_info: ReplayIntelligenceApiPageInfo | null;
}

export interface ReplayIntelligenceApiError {
  code: ReplayArchiveQueryErrorCode | "invalid_request" | "not_found";
  message: string;
  field: string | null;
  severity: ReplayArchiveQuerySeverity;
  deterministic: true;
  details: Record<string, ReplayForensicJsonValue>;
}

export interface ReplayIntelligenceApiEnvelope<TData> {
  status: "ok" | "empty" | "error";
  metadata: ReplayIntelligenceApiQueryMetadata;
  data: TData | null;
  errors: readonly ReplayIntelligenceApiError[];
}

export interface ReplayIntelligenceSnapshotLookupRequest {
  snapshot_id: string;
  generated_at: string | null;
  request_id: string | null;
}

export interface ReplayIntelligenceSnapshotLookupResponse {
  snapshot: ReplayIntelligenceSnapshotRow;
}

export interface ReplayIntelligenceSnapshotListRequest {
  scope: ReplayIntelligenceRecordScope;
  scope_id: string;
  generated_at: string | null;
  request_id: string | null;
  pagination: ReplayIntelligenceApiPagination;
}

export interface ReplayIntelligenceSnapshotListResponse {
  scope: ReplayIntelligenceRecordScope;
  scope_id: string;
  count: number;
  snapshots: readonly ReplayIntelligenceSnapshotRow[];
}

export interface ReplayForensicIntelligenceFilter {
  snapshot_id: string | null;
  archive_id: string | null;
  replay_hash: string | null;
  severity: ReplayArchiveQuerySeverity | null;
  category: string | null;
}

export interface ReplayForensicIntelligenceLookupResponse {
  filters: ReplayForensicIntelligenceFilter;
  count: number;
  records: readonly ReplayForensicIntelligenceRecordRow[];
}

export interface ReplayEvolutionAnalyticsResponse {
  archive_id: string | null;
  game_id: string | null;
  count: number;
  metrics: readonly ReplayEvolutionMetricRow[];
}

export interface ReplayLineageIntelligenceAnalyticsResponse {
  root_archive_id: string | null;
  archive_id: string | null;
  count: number;
  metrics: readonly ReplayLineageIntelligenceMetricRow[];
}

export interface ReplayAuditAnalyticsSummaryResponse {
  scope: ReplayIntelligenceRecordScope | null;
  scope_id: string | null;
  snapshot_id: string | null;
  count: number;
  analytics: readonly ReplayAuditAnalyticsRow[];
}

export interface ReplayMutationTrendAnalyticsResponse {
  snapshot_id: string;
  count: number;
  mutation_frequency: readonly ReplayArchiveMutationFrequencyBucket[];
}

export interface ReplayDriftIntelligenceSummaryResponse {
  snapshot_id: string;
  drift_trends: ReplayArchiveDriftTrendSummary;
}
