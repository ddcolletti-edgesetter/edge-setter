import type {
  ReplayAuditRow,
  ReplayDivergenceHistoryRecord,
  ReplayLineageRecord,
  ReplayProvenanceRecord,
  ReplayVerificationRecord,
} from "./store";

export interface ReplayApiResponse {
  version: number;
  generated_at: string;
  game_id: string;
  as_of: string;
  integrity_hash: string;
  timeline_hash: string;
  snapshots: ReplaySnapshotContract[];
  signals: ReplaySignalContract[];
  timeline: ReplayTimelineEvent[];
  clv_states: ReplayClvContract[];
}

export interface ReplaySnapshotContract {
  id: string;
  snapshot_at: string;
  spread_line: number | null;
  total_line: number | null;
  moneyline_home: number | null;
  moneyline_away: number | null;
}

export interface ReplaySignalContract {
  signal_id: string;
  created_at: string;
  signal_type: string | null;
  market: string | null;
  confidence: number | null;
  line_at_signal: number | null;
}

export interface ReplayTimelineEvent {
  ts: string;
  type:
    | "snapshot"
    | "signal_created"
    | "signal_updated"
    | "signal_settled";
  entity_id: string;
  payload: Record<string, unknown>;
}

export interface ReplayClvContract {
  signal_id: string;
  market: string;
  line_at_signal: number | null;
  closing_line: number | null;
  clv: number | null;
}

export interface ReplayAuditListResponse {
  game_id: string;
  count: number;
  audits: ReplayAuditRow[];
}

export interface ReplayAuditDetailResponse {
  audit: ReplayAuditRow;
}

export interface ReplayVerificationLatestResponse {
  verification: ReplayVerificationRecord;
}

export interface ReplayVerificationHistoryResponse {
  replay_hash: string;
  count: number;
  history: ReplayVerificationRecord[];
}

export interface ReplayProvenanceResponse {
  provenance: ReplayProvenanceRecord;
}

export interface ReplayLineageChildrenResponse {
  replay_hash: string;
  count: number;
  children: ReplayLineageRecord[];
}

export interface ReplayLineageParentsResponse {
  replay_hash: string;
  count: number;
  parents: ReplayLineageRecord[];
}

export type ReplayMismatchCategory =
  | "timeline_mismatch"
  | "snapshot_mismatch"
  | "signal_mismatch"
  | "settlement_mismatch"
  | "provenance_mismatch"
  | "integrity_hash_mismatch";

export interface ReplayMismatchSummary {
  category: ReplayMismatchCategory;
  count: number;
}

export interface ReplayMismatchDetail {
  category: ReplayMismatchCategory;
  field: string;
  current: unknown;
  compared_against: unknown;
  severity: "info" | "warning" | "critical";
}

export interface ReplayConfidenceDelta {
  current: number | null;
  compared_against: number | null;
  delta: number | null;
}

export interface ReplayVerificationLineageReference {
  replay_hash: string;
  parent_replay_hash: string | null;
  audit_id: string;
  created_at: string;
}

export interface ReplayComparisonMetadata {
  replay_hash: string;
  compared_against: string | null;
  current_audit_id: string | null;
  compared_audit_id: string | null;
  current_created_at: string | null;
  compared_created_at: string | null;
  current_as_of: string | null;
  compared_as_of: string | null;
}

export type ReplayIntegrityStatus =
  | "verified"
  | "diverged"
  | "unverified"
  | "missing_comparison";

export interface ReplayDivergenceResponse {
  replay_hash: string;
  compared_against: string | null;
  divergence_detected: boolean;
  mismatch_count: number;
  mismatch_categories: ReplayMismatchCategory[];
  mismatch_summaries: ReplayMismatchSummary[];
  mismatch_details: ReplayMismatchDetail[];
  integrity_status: ReplayIntegrityStatus;
  confidence_delta: ReplayConfidenceDelta;
  lineage_reference: ReplayVerificationLineageReference | null;
  comparison_metadata: ReplayComparisonMetadata;
  analyzed_at: string | null;
}

export interface ReplayForensicsResponse {
  replay_hash: string;
  metadata: ReplayComparisonMetadata;
  audit: ReplayAuditRow | null;
  provenance: ReplayProvenanceRecord | null;
  lineage: {
    parents: ReplayLineageRecord[];
    children: ReplayLineageRecord[];
  };
  latest_verification: ReplayVerificationRecord | null;
  divergence: ReplayDivergenceResponse;
  integrity_status: ReplayIntegrityStatus;
  audit_timestamps: {
    audit_created_at: string | null;
    verification_created_at: string | null;
    provenance_created_at: string | null;
    lineage_parent_created_at: string | null;
  };
}

export interface ReplayDivergenceHistoryLatestResponse {
  divergence: ReplayDivergenceHistoryRecord;
}

export interface ReplayDivergenceHistoryResponse {
  replay_hash: string;
  count: number;
  history: ReplayDivergenceHistoryRecord[];
}

export interface ReplayConfidenceFactor {
  factor:
    | "verification_status"
    | "mismatch_count"
    | "mismatch_categories"
    | "integrity_status"
    | "provenance_completeness";
  adjustment: number;
  reason: string;
}

export interface ReplayLineageConfidenceAdjustment {
  factor: "parent_lineage" | "missing_parent_comparison";
  adjustment: number;
  reason: string;
}

export interface ReplayConfidenceResponse {
  replay_hash: string;
  base_confidence: number;
  propagated_confidence: number;
  confidence_delta: number;
  confidence_factors: ReplayConfidenceFactor[];
  lineage_adjustments: ReplayLineageConfidenceAdjustment[];
  generated_at: string | null;
}
