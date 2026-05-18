import type {
  ReplayArchiveAncestryIntelligenceSummary,
  ReplayArchiveDriftTrendSummary,
  ReplayArchiveEvolutionScore,
  ReplayArchiveForensicReplayMetrics,
  ReplayArchiveLineageDepthMetrics,
  ReplayArchiveMutationFrequencyBucket,
} from "./replay-archive-intelligence";
import type {
  ReplayArchiveQueryAuditContext,
  ReplayArchiveQueryError,
  ReplayArchiveQueryStatus,
} from "./replay-archive-query-contract";
import type { ReplayForensicJsonValue } from "./replay-forensic-contract";

export type ReplayIntelligenceSnapshotKind =
  | "archive_intelligence_report"
  | "drift_trend_snapshot"
  | "mutation_frequency_snapshot"
  | "lineage_depth_snapshot"
  | "forensic_metrics_snapshot";

export type ReplayIntelligenceRecordScope =
  | "archive"
  | "replay"
  | "game"
  | "lineage"
  | "global";

export type ReplayAuditAnalyticsWindow =
  | "daily"
  | "weekly"
  | "monthly"
  | "season"
  | "all_time";

export interface ReplayIntelligencePersistenceEnvelope<TPayload> {
  version: 1;
  generated_at: string;
  deterministic_hash: string;
  audit_context: ReplayArchiveQueryAuditContext;
  payload: TPayload;
  errors: readonly ReplayArchiveQueryError[];
}

export interface ReplayIntelligenceSnapshotContract {
  snapshot_id: string;
  snapshot_kind: ReplayIntelligenceSnapshotKind;
  scope: ReplayIntelligenceRecordScope;
  scope_id: string;
  generated_at: string;
  deterministic_hash: string;
  report_version: 1;
  forensic_metrics: ReplayArchiveForensicReplayMetrics;
  drift_trends: ReplayArchiveDriftTrendSummary;
  mutation_frequency: readonly ReplayArchiveMutationFrequencyBucket[];
  lineage_depth_metrics: ReplayArchiveLineageDepthMetrics;
  ancestry_summaries: readonly ReplayArchiveAncestryIntelligenceSummary[];
  evolution_scores: readonly ReplayArchiveEvolutionScore[];
  metadata: ReplayForensicJsonValue;
}

export interface ReplayForensicIntelligenceRecordContract {
  record_id: string;
  snapshot_id: string;
  archive_id: string | null;
  replay_hash: string | null;
  game_id: string | null;
  metric_name: string;
  metric_value: number;
  severity: "info" | "warning" | "critical";
  category: string;
  observed_at: string;
  deterministic_hash: string;
  details: ReplayForensicJsonValue;
}

export interface ReplayEvolutionMetricContract {
  metric_id: string;
  snapshot_id: string;
  archive_id: string;
  game_id: string;
  replay_hash: string | null;
  score: number;
  band: ReplayArchiveEvolutionScore["band"];
  drift_count: number;
  mutation_count: number;
  lineage_depth: number;
  critical_mismatch_count: number;
  computed_at: string;
  deterministic_hash: string;
}

export interface ReplayLineageIntelligenceMetricContract {
  metric_id: string;
  snapshot_id: string;
  root_archive_id: string | null;
  archive_id: string | null;
  max_depth: number;
  average_depth: number;
  root_archive_count: number;
  leaf_archive_count: number;
  cycle_detected: boolean;
  complete: boolean;
  computed_at: string;
  deterministic_hash: string;
  details: ReplayForensicJsonValue;
}

export interface ReplayAuditAnalyticsContract {
  analytics_id: string;
  snapshot_id: string;
  scope: ReplayIntelligenceRecordScope;
  scope_id: string;
  window: ReplayAuditAnalyticsWindow;
  window_start: string | null;
  window_end: string | null;
  archive_count: number;
  replay_count: number;
  verified_count: number;
  failed_count: number;
  diverged_count: number;
  mutation_count: number;
  drift_count: number;
  critical_mismatch_count: number;
  computed_at: string;
  deterministic_hash: string;
  details: ReplayForensicJsonValue;
}

export interface ReplayIntelligenceSnapshotRow extends ReplayIntelligenceSnapshotContract {
  payload_json: string;
}

export interface ReplayForensicIntelligenceRecordRow
  extends ReplayForensicIntelligenceRecordContract {
  details_json: string;
}

export interface ReplayEvolutionMetricRow extends ReplayEvolutionMetricContract {}

export interface ReplayLineageIntelligenceMetricRow
  extends ReplayLineageIntelligenceMetricContract {
  cycle_detected: boolean;
  complete: boolean;
  details_json: string;
}

export interface ReplayAuditAnalyticsRow extends ReplayAuditAnalyticsContract {
  details_json: string;
}

export interface ReplayIntelligenceQueryResult<TRecord> {
  status: ReplayArchiveQueryStatus;
  generated_at: string;
  deterministic_hash: string;
  count: number;
  records: readonly TRecord[];
  errors: readonly ReplayArchiveQueryError[];
}
