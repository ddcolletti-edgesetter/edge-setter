export interface ReplayIntelligenceExportBundle {
  version: number;
  generated_at: string;
  export_id: string;
  lineage_id: string;
  canonical_hash: string;
  manifest: ReplayIntelligenceExportManifest;
  snapshots: ReplayIntelligenceSnapshotPackage[];
  files: ReplayIntelligenceExportFileEntry[];
}

export interface ReplayIntelligenceExportManifest {
  version: number;
  generated_at: string;
  export_id: string;
  replay_id: string;
  archive_id: string;
  intelligence_id: string;
  lineage_id: string;
  canonical_hash: string;
  file_count: number;
  snapshot_count: number;
}

export interface ReplayIntelligenceSnapshotPackage {
  snapshot_id: string;
  generated_at: string;
  replay_id: string;
  archive_id: string;
  lineage_id: string;
  canonical_hash: string;
  category: string;
  payload_hash: string;
}

export interface ReplayIntelligenceExportFileEntry {
  path: string;
  file_name: string;
  content_type: string;
  byte_size: number;
  canonical_hash: string;
}

export interface ReplayIntelligenceExportValidationResult {
  valid: boolean;
  generated_at: string;
  export_id: string;
  canonical_hash: string;
  mismatches: string[];
}

export interface ReplayLongHorizonAuditSimulationConfig {
  simulation_id: string;
  generated_at: string;
  replay_id: string;
  lineage_id: string;
  horizon_days: number;
  iteration_count: number;
}

export interface ReplayLongHorizonAuditSimulationRun {
  run_id: string;
  generated_at: string;
  simulation_id: string;
  replay_id: string;
  canonical_hash: string;
}

export interface ReplayLongHorizonAuditSimulationResult {
  simulation_id: string;
  generated_at: string;
  anomaly_count: number;
  drift_score: number;
  confidence_score: number;
  canonical_hash: string;
}

export interface ReplayPredictiveAnomalyScore {
  replay_id: string;
  generated_at: string;
  anomaly_type: string;
  anomaly_score: number;
  confidence_score: number;
  canonical_hash: string;
}

export interface ReplayIntelligenceDashboardDataset {
  dataset_id: string;
  generated_at: string;
  replay_id: string;
  lineage_id: string;
  metric_count: number;
  canonical_hash: string;
}