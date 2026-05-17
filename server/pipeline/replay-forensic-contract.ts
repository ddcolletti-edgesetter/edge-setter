import type {
  ReplayAuditRow,
  ReplayDivergenceHistoryRecord,
  ReplayLineageRecord,
  ReplayProvenanceRecord,
  ReplayVerificationRecord,
} from "./store";
import type {
  ReplayComparisonMetadata,
  ReplayConfidenceResponse,
  ReplayDivergenceResponse,
  ReplayForensicsResponse,
  ReplayIntegrityStatus,
  ReplayMismatchCategory,
  ReplayMismatchDetail,
  ReplayMismatchSummary,
} from "./replay-contract";

export type ReplayForensicJsonScalar = string | number | boolean | null;

export type ReplayForensicJsonValue =
  | ReplayForensicJsonScalar
  | ReplayForensicJsonValue[]
  | { [key: string]: ReplayForensicJsonValue };

export interface ReplayForensicBundleMetadata {
  forensic_export_version: 1;
  replay_hash: string;
  game_id: string | null;
  as_of: string | null;
  generated_at: string | null;
  export_source: "pipeline.sqlite";
  export_kind:
    | "audit_bundle"
    | "comparison_report"
    | "confidence_report"
    | "lineage_package"
    | "archival_manifest";
  integrity_status: ReplayIntegrityStatus;
  replay_version: number | null;
  reconstruction_version: string | null;
}

export interface ReplayAuditExportBundle {
  bundle_version: 1;
  metadata: ReplayForensicBundleMetadata;
  audit: ReplayAuditRow;
  latest_verification: ReplayVerificationRecord | null;
  verification_history: ReplayVerificationRecord[];
  provenance: ReplayProvenanceRecord | null;
  divergence: ReplayDivergenceResponse | null;
  divergence_history: ReplayDivergenceHistoryRecord[];
  confidence: ReplayConfidenceResponse | null;
  forensic_snapshot: ReplayForensicsResponse | null;
}

export interface ReplayComparisonReport {
  report_version: 1;
  metadata: ReplayForensicBundleMetadata;
  comparison: ReplayComparisonMetadata;
  replay_hash: string;
  compared_against: string | null;
  divergence_detected: boolean;
  mismatch_count: number;
  mismatch_categories: ReplayMismatchCategory[];
  mismatch_summaries: ReplayMismatchSummary[];
  mismatch_details: ReplayMismatchDetail[];
  integrity_status: ReplayIntegrityStatus;
  analyzed_at: string | null;
}

export interface ReplayConfidenceReportSummary {
  report_version: 1;
  metadata: ReplayForensicBundleMetadata;
  replay_hash: string;
  base_confidence: number;
  propagated_confidence: number;
  confidence_delta: number;
  confidence_factor_count: number;
  lineage_adjustment_count: number;
  confidence_factors: ReplayConfidenceResponse["confidence_factors"];
  lineage_adjustments: ReplayConfidenceResponse["lineage_adjustments"];
  generated_at: string | null;
}

export interface ReplayLineageExportNode {
  replay_hash: string;
  parent_replay_hash: string | null;
  audit_id: string;
  game_id: string;
  as_of: string;
  created_at: string;
  integrity_status: ReplayIntegrityStatus | null;
  verification_status: string | null;
}

export interface ReplayLineageAwareExportPackage {
  package_version: 1;
  metadata: ReplayForensicBundleMetadata;
  root_replay_hash: string;
  parent_chain: ReplayLineageRecord[];
  child_chain: ReplayLineageRecord[];
  lineage_nodes: ReplayLineageExportNode[];
  root_bundle: ReplayAuditExportBundle;
}

export interface ReplayArchivalManifestArtifact {
  artifact_id: string;
  artifact_type:
    | "audit_bundle"
    | "comparison_report"
    | "confidence_report"
    | "lineage_package"
    | "raw_json";
  replay_hash: string;
  content_hash: string | null;
  byte_size: number | null;
  created_at: string | null;
}

export interface ReplayArchivalManifestScaffold {
  manifest_version: 1;
  archive_id: string;
  replay_hash: string;
  generated_at: string | null;
  source_system: "edge_setter_pipeline";
  export_versions: {
    forensic_export_version: 1;
    audit_bundle_version: 1;
    comparison_report_version: 1;
    confidence_report_version: 1;
    lineage_package_version: 1;
  };
  artifacts: ReplayArchivalManifestArtifact[];
  integrity: {
    integrity_status: ReplayIntegrityStatus;
    replay_hash: string;
    timeline_hash: string | null;
    signal_hash: string | null;
    snapshot_hash: string | null;
    content_hash: string | null;
  };
  notes: ReplayForensicJsonValue[];
}
