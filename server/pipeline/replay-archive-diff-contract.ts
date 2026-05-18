export type ReplayArchiveDiffCategory =
  | "manifest_mismatch"
  | "bundle_mismatch"
  | "snapshot_mismatch"
  | "signal_drift"
  | "provenance_evolution"
  | "settlement_mutation"
  | "timeline_mismatch"
  | "lineage_mismatch";

export interface ReplayArchiveDiffMismatch {
  category: ReplayArchiveDiffCategory;
  path: string;
  left: unknown;
  right: unknown;
  severity: "info" | "warning" | "critical";
}

export interface ReplayArchiveSignalDrift {
  signal_id: string;
  market: string;
  field: string;
  left: unknown;
  right: unknown;
}

export interface ReplayArchiveProvenanceEvolution {
  source_id: string;
  field: string;
  left: unknown;
  right: unknown;
}

export interface ReplayArchiveSettlementMutation {
  outcome_id: string;
  field: string;
  left: unknown;
  right: unknown;
}

export interface ReplayArchiveDiffResult {
  version: number;
  generated_at: string;
  left_archive_id: string;
  right_archive_id: string;
  deterministic_hash: string;
  mismatches: ReplayArchiveDiffMismatch[];
  signal_drift: ReplayArchiveSignalDrift[];
  provenance_evolution: ReplayArchiveProvenanceEvolution[];
  settlement_mutations: ReplayArchiveSettlementMutation[];
  equivalent: boolean;
}