import {
  getLatestReplayVerification,
  getReplayAuditByReplayHash,
  getReplayProvenance,
  getLatestReplayDivergenceHistory,
  listReplayDivergenceHistory,
  listReplayLineageChildren,
  listReplayLineageParents,
  upsertReplayDivergenceHistory,
  type ReplayAuditRow,
  type ReplayDivergenceHistoryRecord,
  type ReplayLineageRecord,
  type ReplayProvenanceRecord,
  type ReplayVerificationRecord,
} from "./store";
import type {
  ReplayComparisonMetadata,
  ReplayConfidenceDelta,
  ReplayDivergenceResponse,
  ReplayForensicsResponse,
  ReplayIntegrityStatus,
  ReplayMismatchCategory,
  ReplayMismatchDetail,
  ReplayMismatchSummary,
  ReplayVerificationLineageReference,
} from "./replay-contract";

interface ReplayForensicBundle {
  audit: ReplayAuditRow | null;
  verification: ReplayVerificationRecord | null;
  provenance: ReplayProvenanceRecord | null;
  parents: ReplayLineageRecord[];
  children: ReplayLineageRecord[];
}

export function analyzeReplayDivergence(replayHash: string): ReplayDivergenceResponse | null {
  const current = loadReplayForensicBundle(replayHash);
  if (!current.audit || !current.verification) return null;

  const parent = current.parents[0] ?? null;
  const comparedAudit = parent ? getReplayAuditByReplayHash(parent.replay_hash) : null;
  const comparedVerification = parent ? getLatestReplayVerification(parent.replay_hash) : null;
  const comparedProvenance = parent ? getReplayProvenance(parent.replay_hash) : null;

  const details = buildMismatchDetails({
    currentAudit: current.audit,
    currentVerification: current.verification,
    currentProvenance: current.provenance,
    comparedAudit,
    comparedVerification,
    comparedProvenance,
  });

  const categories = uniqueCategories(details);
  const integrityStatus = resolveIntegrityStatus(current.verification, comparedAudit, details);
  const lineageReference = buildLineageReference(current.audit, parent);
  const metadata = buildComparisonMetadata(current.audit, comparedAudit);
  const confidenceDelta = compareConfidence(current.audit, comparedAudit);

  const analysis: ReplayDivergenceResponse = {
    replay_hash: replayHash,
    compared_against: comparedAudit?.replay_hash ?? parent?.replay_hash ?? null,
    divergence_detected: details.length > 0,
    mismatch_count: details.length,
    mismatch_categories: categories,
    mismatch_summaries: summarizeMismatches(details),
    mismatch_details: details,
    integrity_status: integrityStatus,
    confidence_delta: confidenceDelta,
    lineage_reference: lineageReference,
    comparison_metadata: metadata,
    analyzed_at: current.verification.created_at,
  };

  persistReplayDivergenceAnalysis(analysis);

  return analysis;
}

export function getLatestReplayDivergenceAnalysis(
  replayHash: string,
): ReplayDivergenceHistoryRecord | null {
  analyzeReplayDivergence(replayHash);
  return getLatestReplayDivergenceHistory(replayHash);
}

export function listReplayDivergenceAnalysisHistory(
  replayHash: string,
): ReplayDivergenceHistoryRecord[] {
  return listReplayDivergenceHistory(replayHash);
}

export function inspectReplayForensics(replayHash: string): ReplayForensicsResponse | null {
  const current = loadReplayForensicBundle(replayHash);
  if (!current.audit || !current.verification) return null;

  const divergence = analyzeReplayDivergence(replayHash);
  if (!divergence) return null;

  return {
    replay_hash: replayHash,
    metadata: divergence.comparison_metadata,
    audit: current.audit,
    provenance: current.provenance,
    lineage: {
      parents: current.parents,
      children: current.children,
    },
    latest_verification: current.verification,
    divergence,
    integrity_status: divergence.integrity_status,
    audit_timestamps: {
      audit_created_at: current.audit.created_at,
      verification_created_at: current.verification.created_at,
      provenance_created_at: current.provenance?.created_at ?? null,
      lineage_parent_created_at: current.parents[0]?.created_at ?? null,
    },
  };
}

function loadReplayForensicBundle(replayHash: string): ReplayForensicBundle {
  return {
    audit: getReplayAuditByReplayHash(replayHash),
    verification: getLatestReplayVerification(replayHash),
    provenance: getReplayProvenance(replayHash),
    parents: listReplayLineageParents(replayHash),
    children: listReplayLineageChildren(replayHash),
  };
}

function persistReplayDivergenceAnalysis(analysis: ReplayDivergenceResponse): void {
  if (!analysis.analyzed_at) return;

  upsertReplayDivergenceHistory({
    replay_hash: analysis.replay_hash,
    compared_against: analysis.compared_against,
    divergence_detected: analysis.divergence_detected,
    mismatch_count: analysis.mismatch_count,
    mismatch_categories_json: stableStringify(analysis.mismatch_categories),
    mismatch_details_json: stableStringify(analysis.mismatch_details),
    integrity_status: analysis.integrity_status,
    confidence_delta: analysis.confidence_delta.delta,
    analyzed_at: analysis.analyzed_at,
  });
}

function buildMismatchDetails(input: {
  currentAudit: ReplayAuditRow;
  currentVerification: ReplayVerificationRecord;
  currentProvenance: ReplayProvenanceRecord | null;
  comparedAudit: ReplayAuditRow | null;
  comparedVerification: ReplayVerificationRecord | null;
  comparedProvenance: ReplayProvenanceRecord | null;
}): ReplayMismatchDetail[] {
  const details: ReplayMismatchDetail[] = [];

  if (!input.comparedAudit) {
    return details;
  }

  compareReplayTimelines(details, input.currentAudit, input.comparedAudit);
  compareSnapshotHashes(details, input.currentAudit, input.comparedAudit);
  compareSignalCounts(details, input.currentProvenance, input.comparedProvenance);
  compareSettlementOutputs(details, input.currentVerification, input.comparedVerification);
  compareProvenance(details, input.currentAudit, input.comparedAudit, input.currentProvenance, input.comparedProvenance);
  compareIntegrityHashes(details, input.currentAudit, input.comparedAudit);

  return details.sort((a, b) => {
    const byCategory = a.category.localeCompare(b.category);
    if (byCategory !== 0) return byCategory;
    return a.field.localeCompare(b.field);
  });
}

function compareReplayTimelines(
  details: ReplayMismatchDetail[],
  current: ReplayAuditRow,
  compared: ReplayAuditRow,
): void {
  pushIfChanged(details, "timeline_mismatch", "timeline_hash", current.timeline_hash ?? null, compared.timeline_hash ?? null, "critical");
}

function compareSnapshotHashes(
  details: ReplayMismatchDetail[],
  current: ReplayAuditRow,
  compared: ReplayAuditRow,
): void {
  pushIfChanged(details, "snapshot_mismatch", "snapshot_hash", current.snapshot_hash ?? null, compared.snapshot_hash ?? null, "critical");
}

function compareSignalCounts(
  details: ReplayMismatchDetail[],
  current: ReplayProvenanceRecord | null,
  compared: ReplayProvenanceRecord | null,
): void {
  pushIfChanged(
    details,
    "signal_mismatch",
    "signal_count",
    readNumber(current?.provenance, "signal_count"),
    readNumber(compared?.provenance, "signal_count"),
    "warning",
  );
}

function compareSettlementOutputs(
  details: ReplayMismatchDetail[],
  current: ReplayVerificationRecord,
  compared: ReplayVerificationRecord | null,
): void {
  pushIfChanged(
    details,
    "settlement_mismatch",
    "verification_status",
    current.verification_status,
    compared?.verification_status ?? null,
    "warning",
  );
  pushIfChanged(
    details,
    "settlement_mismatch",
    "divergence_count",
    current.divergence_count,
    compared?.divergence_count ?? null,
    "warning",
  );
  pushIfChanged(
    details,
    "settlement_mismatch",
    "divergence_summary",
    normalizeJsonString(current.divergence_summary_json),
    normalizeJsonString(compared?.divergence_summary_json ?? null),
    "warning",
  );
}

function compareProvenance(
  details: ReplayMismatchDetail[],
  currentAudit: ReplayAuditRow,
  comparedAudit: ReplayAuditRow,
  current: ReplayProvenanceRecord | null,
  compared: ReplayProvenanceRecord | null,
): void {
  pushIfChanged(
    details,
    "provenance_mismatch",
    "reconstruction_version",
    currentAudit.reconstruction_version ?? null,
    comparedAudit.reconstruction_version ?? null,
    "warning",
  );
  pushIfChanged(
    details,
    "provenance_mismatch",
    "replay_version",
    currentAudit.replay_version,
    comparedAudit.replay_version,
    "warning",
  );
  pushIfChanged(
    details,
    "provenance_mismatch",
    "replay_engine_version",
    readString(current?.provenance, "replay_engine_version"),
    readString(compared?.provenance, "replay_engine_version"),
    "warning",
  );
  pushIfChanged(
    details,
    "provenance_mismatch",
    "source_metadata",
    readObject(current?.provenance, "replay_source_metadata"),
    readObject(compared?.provenance, "replay_source_metadata"),
    "warning",
  );
}

function compareIntegrityHashes(
  details: ReplayMismatchDetail[],
  current: ReplayAuditRow,
  compared: ReplayAuditRow,
): void {
  pushIfChanged(details, "integrity_hash_mismatch", "replay_hash", current.replay_hash, compared.replay_hash, "critical");
  pushIfChanged(details, "integrity_hash_mismatch", "signal_hash", current.signal_hash ?? null, compared.signal_hash ?? null, "critical");
}

function pushIfChanged(
  details: ReplayMismatchDetail[],
  category: ReplayMismatchCategory,
  field: string,
  current: unknown,
  compared: unknown,
  severity: ReplayMismatchDetail["severity"],
): void {
  if (stableStringify(current) === stableStringify(compared)) return;

  details.push({
    category,
    field,
    current,
    compared_against: compared,
    severity,
  });
}

function uniqueCategories(details: ReplayMismatchDetail[]): ReplayMismatchCategory[] {
  return Array.from(new Set(details.map(detail => detail.category))).sort();
}

function summarizeMismatches(details: ReplayMismatchDetail[]): ReplayMismatchSummary[] {
  return uniqueCategories(details).map(category => ({
    category,
    count: details.filter(detail => detail.category === category).length,
  }));
}

function resolveIntegrityStatus(
  verification: ReplayVerificationRecord,
  comparedAudit: ReplayAuditRow | null,
  details: ReplayMismatchDetail[],
): ReplayIntegrityStatus {
  if (!comparedAudit) return "missing_comparison";
  if (details.length > 0 || verification.divergence_count > 0 || verification.verification_status === "diverged") {
    return "diverged";
  }
  if (verification.verification_status === "verified") return "verified";
  return "unverified";
}

function compareConfidence(
  current: ReplayAuditRow,
  compared: ReplayAuditRow | null,
): ReplayConfidenceDelta {
  const currentConfidence = readAverageConfidence(current.provenance_json ?? null);
  const comparedConfidence = readAverageConfidence(compared?.provenance_json ?? null);

  return {
    current: currentConfidence,
    compared_against: comparedConfidence,
    delta: currentConfidence != null && comparedConfidence != null
      ? roundDelta(currentConfidence - comparedConfidence)
      : null,
  };
}

function buildLineageReference(
  current: ReplayAuditRow,
  parent: ReplayLineageRecord | null,
): ReplayVerificationLineageReference | null {
  if (!parent) return null;

  return {
    replay_hash: current.replay_hash,
    parent_replay_hash: parent.replay_hash,
    audit_id: current.id,
    created_at: current.created_at,
  };
}

function buildComparisonMetadata(
  current: ReplayAuditRow,
  compared: ReplayAuditRow | null,
): ReplayComparisonMetadata {
  return {
    replay_hash: current.replay_hash,
    compared_against: compared?.replay_hash ?? null,
    current_audit_id: current.id,
    compared_audit_id: compared?.id ?? null,
    current_created_at: current.created_at,
    compared_created_at: compared?.created_at ?? null,
    current_as_of: current.as_of,
    compared_as_of: compared?.as_of ?? null,
  };
}

function readAverageConfidence(provenanceJson: string | null): number | null {
  const parsed = parseJsonObject(provenanceJson);
  return readNumber(parsed, "average_confidence");
}

function readNumber(source: Record<string, unknown> | null | undefined, key: string): number | null {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(source: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = source?.[key];
  return typeof value === "string" ? value : null;
}

function readObject(source: Record<string, unknown> | null | undefined, key: string): Record<string, unknown> | null {
  const value = source?.[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeJsonString(value: string | null): string | null {
  const parsed = parseJsonValue(value);
  return parsed === null ? null : stableStringify(parsed);
}

function parseJsonObject(value: string | null): Record<string, unknown> | null {
  const parsed = parseJsonValue(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
}

function parseJsonValue(value: string | null): unknown | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return value;
}

function roundDelta(value: number): number {
  return Math.round(value * 1000) / 1000;
}
