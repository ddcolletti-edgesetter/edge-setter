import crypto from "node:crypto";
import {
  getLatestReplayVerification,
  getReplayAuditByReplayHash,
  getReplayProvenance,
  listReplayAuditsByGameId,
  listReplayDivergenceHistory,
  listReplayLineageChildren,
  listReplayLineageParents,
  listReplayVerificationHistory,
  type ReplayAuditRow,
  type ReplayLineageRecord,
  type ReplayVerificationRecord,
} from "./store";
import { propagateReplayConfidence } from "./replay-confidence";
import { analyzeReplayDivergence, inspectReplayForensics } from "./replay-divergence";
import type {
  ReplayConfidenceResponse,
  ReplayDivergenceResponse,
  ReplayIntegrityStatus,
} from "./replay-contract";
import type {
  ReplayArchivalManifestArtifact,
  ReplayArchivalManifestScaffold,
  ReplayAuditExportBundle,
  ReplayComparisonReport,
  ReplayConfidenceReportSummary,
  ReplayForensicBundleMetadata,
  ReplayForensicJsonValue,
  ReplayLineageAwareExportPackage,
  ReplayLineageExportNode,
} from "./replay-forensic-contract";

export interface ReplayForensicExportOptions {
  generated_at?: string | null;
}

export function buildReplayAuditExportBundle(
  replayHash: string,
  opts: ReplayForensicExportOptions = {},
): ReplayAuditExportBundle | null {
  const audit = getReplayAuditByReplayHash(replayHash);
  if (!audit) return null;

  const latestVerification = getLatestReplayVerification(replayHash);
  const divergence = analyzeReplayDivergence(replayHash);
  const confidence = propagateReplayConfidence(replayHash);
  const forensicSnapshot = inspectReplayForensics(replayHash);

  return {
    bundle_version: 1,
    metadata: buildMetadata({
      audit,
      exportKind: "audit_bundle",
      integrityStatus: divergence?.integrity_status ?? integrityStatusFromVerification(latestVerification),
      generatedAt: opts.generated_at ?? latestVerification?.created_at ?? audit.created_at,
    }),
    audit,
    latest_verification: latestVerification,
    verification_history: sortVerificationHistory(listReplayVerificationHistory(replayHash)),
    provenance: getReplayProvenance(replayHash),
    divergence,
    divergence_history: sortDivergenceHistory(listReplayDivergenceHistory(replayHash)),
    confidence,
    forensic_snapshot: forensicSnapshot,
  };
}

export function buildReplayComparisonReport(
  replayHash: string,
  opts: ReplayForensicExportOptions = {},
): ReplayComparisonReport | null {
  const audit = getReplayAuditByReplayHash(replayHash);
  if (!audit) return null;

  const divergence = analyzeReplayDivergence(replayHash);
  if (!divergence) return null;

  return {
    report_version: 1,
    metadata: buildMetadata({
      audit,
      exportKind: "comparison_report",
      integrityStatus: divergence.integrity_status,
      generatedAt: opts.generated_at ?? divergence.analyzed_at ?? audit.created_at,
    }),
    comparison: divergence.comparison_metadata,
    replay_hash: replayHash,
    compared_against: divergence.compared_against,
    divergence_detected: divergence.divergence_detected,
    mismatch_count: divergence.mismatch_count,
    mismatch_categories: [...divergence.mismatch_categories].sort(),
    mismatch_summaries: [...divergence.mismatch_summaries].sort((a, b) => a.category.localeCompare(b.category)),
    mismatch_details: sortMismatchDetails(divergence.mismatch_details),
    integrity_status: divergence.integrity_status,
    analyzed_at: divergence.analyzed_at,
  };
}

export function buildReplayConfidenceReport(
  replayHash: string,
  opts: ReplayForensicExportOptions = {},
): ReplayConfidenceReportSummary | null {
  const audit = getReplayAuditByReplayHash(replayHash);
  if (!audit) return null;

  const confidence = propagateReplayConfidence(replayHash);
  if (!confidence) return null;

  const divergence = analyzeReplayDivergence(replayHash);

  return {
    report_version: 1,
    metadata: buildMetadata({
      audit,
      exportKind: "confidence_report",
      integrityStatus: divergence?.integrity_status ?? integrityStatusFromVerification(getLatestReplayVerification(replayHash)),
      generatedAt: opts.generated_at ?? confidence.generated_at ?? audit.created_at,
    }),
    replay_hash: replayHash,
    base_confidence: confidence.base_confidence,
    propagated_confidence: confidence.propagated_confidence,
    confidence_delta: confidence.confidence_delta,
    confidence_factor_count: confidence.confidence_factors.length,
    lineage_adjustment_count: confidence.lineage_adjustments.length,
    confidence_factors: sortConfidenceFactors(confidence),
    lineage_adjustments: [...confidence.lineage_adjustments].sort((a, b) => a.factor.localeCompare(b.factor)),
    generated_at: confidence.generated_at,
  };
}

export function buildLineageForensicPackage(
  replayHash: string,
  opts: ReplayForensicExportOptions = {},
): ReplayLineageAwareExportPackage | null {
  const rootBundle = buildReplayAuditExportBundle(replayHash, opts);
  if (!rootBundle) return null;

  const parentChain = sortLineageRecords(listReplayLineageParents(replayHash));
  const childChain = sortLineageRecords(listReplayLineageChildren(replayHash));
  const lineageNodes = buildLineageNodes(rootBundle.audit, parentChain, childChain);

  return {
    package_version: 1,
    metadata: {
      ...rootBundle.metadata,
      export_kind: "lineage_package",
      generated_at: opts.generated_at ?? rootBundle.metadata.generated_at,
    },
    root_replay_hash: replayHash,
    parent_chain: parentChain,
    child_chain: childChain,
    lineage_nodes: lineageNodes,
    root_bundle: rootBundle,
  };
}

export function buildReplayArchivalManifest(
  replayHash: string,
  opts: ReplayForensicExportOptions = {},
): ReplayArchivalManifestScaffold | null {
  const bundle = buildReplayAuditExportBundle(replayHash, opts);
  const comparison = buildReplayComparisonReport(replayHash, opts);
  const confidence = buildReplayConfidenceReport(replayHash, opts);
  const lineagePackage = buildLineageForensicPackage(replayHash, opts);
  if (!bundle) return null;

  const generatedAt = opts.generated_at ?? bundle.metadata.generated_at;
  const artifacts = sortManifestArtifacts([
    buildArtifact("audit_bundle", replayHash, bundle, generatedAt),
    comparison ? buildArtifact("comparison_report", replayHash, comparison, generatedAt) : null,
    confidence ? buildArtifact("confidence_report", replayHash, confidence, generatedAt) : null,
    lineagePackage ? buildArtifact("lineage_package", replayHash, lineagePackage, generatedAt) : null,
  ]);

  const contentHash = stableHash({
    replay_hash: replayHash,
    artifacts: artifacts.map(artifact => ({
      artifact_id: artifact.artifact_id,
      content_hash: artifact.content_hash,
    })),
  });

  return {
    manifest_version: 1,
    archive_id: `replay-archive:${replayHash}:${contentHash}`,
    replay_hash: replayHash,
    generated_at: generatedAt,
    source_system: "edge_setter_pipeline",
    export_versions: {
      forensic_export_version: 1,
      audit_bundle_version: 1,
      comparison_report_version: 1,
      confidence_report_version: 1,
      lineage_package_version: 1,
    },
    artifacts,
    integrity: {
      integrity_status: bundle.metadata.integrity_status,
      replay_hash: bundle.audit.replay_hash,
      timeline_hash: normalizeNullable(bundle.audit.timeline_hash),
      signal_hash: normalizeNullable(bundle.audit.signal_hash),
      snapshot_hash: normalizeNullable(bundle.audit.snapshot_hash),
      content_hash: contentHash,
    },
    notes: [],
  };
}

function buildMetadata(input: {
  audit: ReplayAuditRow;
  exportKind: ReplayForensicBundleMetadata["export_kind"];
  integrityStatus: ReplayIntegrityStatus;
  generatedAt: string | null;
}): ReplayForensicBundleMetadata {
  return {
    forensic_export_version: 1,
    replay_hash: input.audit.replay_hash,
    game_id: normalizeNullable(input.audit.game_id),
    as_of: normalizeNullable(input.audit.as_of),
    generated_at: input.generatedAt,
    export_source: "pipeline.sqlite",
    export_kind: input.exportKind,
    integrity_status: input.integrityStatus,
    replay_version: input.audit.replay_version ?? null,
    reconstruction_version: normalizeNullable(input.audit.reconstruction_version),
  };
}

function buildLineageNodes(
  rootAudit: ReplayAuditRow,
  parents: ReplayLineageRecord[],
  children: ReplayLineageRecord[],
): ReplayLineageExportNode[] {
  const replayHashes = uniqueStrings([
    rootAudit.replay_hash,
    ...parents.map(parent => parent.replay_hash),
    ...children.map(child => child.replay_hash),
  ]);

  return replayHashes
    .map(replayHash => {
      const audit = replayHash === rootAudit.replay_hash
        ? rootAudit
        : getReplayAuditByReplayHash(replayHash);
      if (!audit) return null;

      const parent = replayHash === rootAudit.replay_hash
        ? parents[0]?.replay_hash ?? null
        : readParentReplayHash(audit);
      const verification = getLatestReplayVerification(replayHash);
      const divergence = analyzeReplayDivergence(replayHash);

      return {
        replay_hash: replayHash,
        parent_replay_hash: parent,
        audit_id: audit.id,
        game_id: audit.game_id,
        as_of: audit.as_of,
        created_at: audit.created_at,
        integrity_status: divergence?.integrity_status ?? null,
        verification_status: verification?.verification_status ?? null,
      };
    })
    .filter((node): node is ReplayLineageExportNode => node !== null)
    .sort((a, b) => {
      const byCreated = a.created_at.localeCompare(b.created_at);
      if (byCreated !== 0) return byCreated;
      return a.replay_hash.localeCompare(b.replay_hash);
    });
}

function buildArtifact(
  artifactType: ReplayArchivalManifestArtifact["artifact_type"],
  replayHash: string,
  content: unknown,
  createdAt: string | null,
): ReplayArchivalManifestArtifact {
  const serialized = stableStringify(content);
  const contentHash = stableHash(content);

  return {
    artifact_id: `${artifactType}:${replayHash}:${contentHash}`,
    artifact_type: artifactType,
    replay_hash: replayHash,
    content_hash: contentHash,
    byte_size: Buffer.byteLength(serialized, "utf8"),
    created_at: createdAt,
  };
}

function readParentReplayHash(audit: ReplayAuditRow): string | null {
  const lineage = parseJsonObject(audit.lineage_json ?? null);
  const parent = lineage?.parent_replay_hash;
  return typeof parent === "string" ? parent : null;
}

function integrityStatusFromVerification(
  verification: ReplayVerificationRecord | null,
): ReplayIntegrityStatus {
  if (!verification) return "unverified";
  if (verification.verification_status === "verified") return "verified";
  if (verification.verification_status === "diverged") return "diverged";
  return "unverified";
}

function sortVerificationHistory(
  history: ReplayVerificationRecord[],
): ReplayVerificationRecord[] {
  return [...history].sort((a, b) => {
    const byCreated = b.created_at.localeCompare(a.created_at);
    if (byCreated !== 0) return byCreated;
    return a.id.localeCompare(b.id);
  });
}

function sortDivergenceHistory(
  history: ReturnType<typeof listReplayDivergenceHistory>,
): ReturnType<typeof listReplayDivergenceHistory> {
  return [...history].sort((a, b) => {
    const byAnalyzed = b.analyzed_at.localeCompare(a.analyzed_at);
    if (byAnalyzed !== 0) return byAnalyzed;
    return a.id.localeCompare(b.id);
  });
}

function sortLineageRecords(records: ReplayLineageRecord[]): ReplayLineageRecord[] {
  return [...records].sort((a, b) => {
    const byCreated = a.created_at.localeCompare(b.created_at);
    if (byCreated !== 0) return byCreated;
    return a.replay_hash.localeCompare(b.replay_hash);
  });
}

function sortMismatchDetails(
  details: ReplayDivergenceResponse["mismatch_details"],
): ReplayDivergenceResponse["mismatch_details"] {
  return [...details].sort((a, b) => {
    const byCategory = a.category.localeCompare(b.category);
    if (byCategory !== 0) return byCategory;
    return a.field.localeCompare(b.field);
  });
}

function sortConfidenceFactors(
  confidence: ReplayConfidenceResponse,
): ReplayConfidenceResponse["confidence_factors"] {
  return [...confidence.confidence_factors].sort((a, b) => a.factor.localeCompare(b.factor));
}

function sortManifestArtifacts(
  artifacts: Array<ReplayArchivalManifestArtifact | null>,
): ReplayArchivalManifestArtifact[] {
  return artifacts
    .filter((artifact): artifact is ReplayArchivalManifestArtifact => artifact !== null)
    .sort((a, b) => {
      const byType = a.artifact_type.localeCompare(b.artifact_type);
      if (byType !== 0) return byType;
      return a.artifact_id.localeCompare(b.artifact_id);
    });
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function normalizeNullable(value: string | null | undefined): string | null {
  return value ?? null;
}

function parseJsonObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function stableHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(value))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(toJsonSafe(sortKeys(value)));
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

function toJsonSafe(value: unknown): ReplayForensicJsonValue {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, ReplayForensicJsonValue>>((acc, key) => {
        const normalized = toJsonSafe((value as Record<string, unknown>)[key]);
        if (normalized !== undefined) acc[key] = normalized;
        return acc;
      }, {});
  }
  return null;
}
