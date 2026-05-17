import type {
  ReplayForensicBundleMetadata,
  ReplayForensicJsonValue,
} from "./replay-forensic-contract";

export type ReplayArchiveRetentionClass =
  | "short_term"
  | "seasonal"
  | "historical"
  | "permanent";

export type ReplayArchiveVerificationStatus =
  | "verified"
  | "failed";

export interface ReplayArchiveManifest {
  archive_id: string;
  game_id: string;
  created_at: string;
  forensic_version: number;

  snapshot_hash: string;
  bundle_hash: string;

  export_hash: string;
  timeline_hash: string;
  signal_hash: string;
  settlement_hash: string;
  provenance_hash: string;

  compression: "gzip";
  bundle_size_bytes: number;

  replay_count: number;
  verification_status: ReplayArchiveVerificationStatus;

  retention_class: ReplayArchiveRetentionClass;

  parent_archive_id?: string;
  root_archive_id?: string;
  revision_number: number;

  tags: string[];
}

export interface ReplayArchiveSnapshot {
  archive_id: string;
  forensic_metadata: ReplayForensicBundleMetadata;
forensic_payload: ReplayForensicJsonValue;
generated_report: ReplayForensicJsonValue;
  canonical_hash: string;
  created_at: string;
}

export interface ReplayArchiveDiffMismatch {
  type: string;
  path: string;
  left: unknown;
  right: unknown;
}

export interface ReplayArchiveDiff {
  archive_id_left: string;
  archive_id_right: string;
  mismatch_count: number;
  mismatches: ReplayArchiveDiffMismatch[];
}