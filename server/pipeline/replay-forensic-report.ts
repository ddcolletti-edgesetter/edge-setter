import crypto from "node:crypto";
import type { ReplayIntegrityStatus, ReplayMismatchCategory } from "./replay-contract";
import {
  buildLineageForensicPackage,
  buildReplayAuditExportBundle,
  buildReplayComparisonReport,
  buildReplayConfidenceReport,
  type ReplayForensicExportOptions,
} from "./replay-forensic-export";
import type {
  ReplayAuditExportBundle,
  ReplayComparisonReport,
  ReplayConfidenceReportSummary,
  ReplayForensicBundleMetadata,
  ReplayForensicJsonValue,
  ReplayLineageAwareExportPackage,
} from "./replay-forensic-contract";

export interface ReplaySeveritySummary {
  severity: "critical" | "warning" | "info";
  count: number;
}

export interface ReplayCategorySummary {
  category: ReplayMismatchCategory;
  count: number;
}

export interface ReplayDivergenceSummaryReport {
  report_version: 1;
  replay_hash: string;
  compared_against: string | null;
  divergence_detected: boolean;
  mismatch_count: number;
  category_counts: ReplayCategorySummary[];
  severity_counts: ReplaySeveritySummary[];
  critical_fields: string[];
  warning_fields: string[];
  analyzed_at: string | null;
  summary_fingerprint: string;
}

export interface ReplayIntegritySummaryReport {
  report_version: 1;
  replay_hash: string;
  integrity_status: ReplayIntegrityStatus;
  replay_hash_present: boolean;
  timeline_hash_present: boolean;
  signal_hash_present: boolean;
  snapshot_hash_present: boolean;
  content_hash_present: boolean;
  indicator_count: number;
  failed_indicators: string[];
  summary_fingerprint: string;
}

export interface ReplayConfidenceSummaryReport {
  report_version: 1;
  replay_hash: string;
  base_confidence: number | null;
  propagated_confidence: number | null;
  confidence_delta: number | null;
  confidence_direction: "improved" | "reduced" | "unchanged" | "unknown";
  negative_factor_count: number;
  positive_factor_count: number;
  lineage_adjustment_total: number;
  strongest_negative_factor: string | null;
  generated_at: string | null;
  summary_fingerprint: string;
}

export interface ReplayLineageSummaryReport {
  report_version: 1;
  replay_hash: string;
  parent_depth: number;
  child_count: number;
  lineage_node_count: number;
  root_replay_hash: string;
  earliest_lineage_at: string | null;
  latest_lineage_at: string | null;
  lineage_integrity_statuses: Array<{
    integrity_status: ReplayIntegrityStatus | "unknown";
    count: number;
  }>;
  summary_fingerprint: string;
}

export interface ReplayVerificationSummaryReport {
  report_version: 1;
  replay_hash: string;
  verification_count: number;
  verified_count: number;
  diverged_count: number;
  unknown_count: number;
  pass_ratio: number | null;
  fail_ratio: number | null;
  latest_status: string | null;
  latest_created_at: string | null;
  summary_fingerprint: string;
}

export interface ReplayForensicOverviewReport {
  overview_version: 1;
  metadata: ReplayForensicBundleMetadata;
  replay_hash: string;
  comparison: ReplayComparisonSummary;
  divergence: ReplayDivergenceSummaryReport | null;
  integrity: ReplayIntegritySummaryReport | null;
  confidence: ReplayConfidenceSummaryReport | null;
  lineage: ReplayLineageSummaryReport | null;
  verification: ReplayVerificationSummaryReport | null;
  audit_review_flags: string[];
  summary_fingerprint: string;
}

export interface ReplayComparisonSummary {
  compared_against: string | null;
  current_audit_id: string | null;
  compared_audit_id: string | null;
  divergence_detected: boolean;
  mismatch_count: number;
  integrity_status: ReplayIntegrityStatus | null;
}

export function buildReplayForensicOverview(
  replayHash: string,
  opts: ReplayForensicExportOptions = {},
): ReplayForensicOverviewReport | null {
  const bundle = buildReplayAuditExportBundle(replayHash, opts);
  if (!bundle) return null;

  const comparison = buildReplayComparisonReport(replayHash, opts);
  const divergence = buildReplayDivergenceSummary(replayHash, opts);
  const integrity = buildReplayIntegritySummary(replayHash, opts);
  const confidence = buildReplayConfidenceSummary(replayHash, opts);
  const lineage = buildReplayLineageSummary(replayHash, opts);
  const verification = buildReplayVerificationSummary(replayHash, opts);

  const body = {
    overview_version: 1 as const,
    metadata: bundle.metadata,
    replay_hash: replayHash,
    comparison: buildComparisonSummary(comparison),
    divergence,
    integrity,
    confidence,
    lineage,
    verification,
    audit_review_flags: buildAuditReviewFlags({ divergence, integrity, confidence, verification }),
  };

  return {
    ...body,
    summary_fingerprint: stableHash(body),
  };
}

export function buildReplayDivergenceSummary(
  replayHash: string,
  opts: ReplayForensicExportOptions = {},
): ReplayDivergenceSummaryReport | null {
  const comparison = buildReplayComparisonReport(replayHash, opts);
  if (!comparison) return null;

  const body = {
    report_version: 1 as const,
    replay_hash: replayHash,
    compared_against: comparison.compared_against,
    divergence_detected: comparison.divergence_detected,
    mismatch_count: comparison.mismatch_count,
    category_counts: summarizeCategories(comparison),
    severity_counts: summarizeSeverities(comparison),
    critical_fields: fieldsBySeverity(comparison, "critical"),
    warning_fields: fieldsBySeverity(comparison, "warning"),
    analyzed_at: comparison.analyzed_at,
  };

  return {
    ...body,
    summary_fingerprint: stableHash(body),
  };
}

export function buildReplayIntegritySummary(
  replayHash: string,
  opts: ReplayForensicExportOptions = {},
): ReplayIntegritySummaryReport | null {
  const bundle = buildReplayAuditExportBundle(replayHash, opts);
  if (!bundle) return null;

  const contentHashPresent = Boolean(bundle.divergence || bundle.divergence_history.length > 0);
  const indicators = {
    replay_hash_present: Boolean(bundle.audit.replay_hash),
    timeline_hash_present: Boolean(bundle.audit.timeline_hash),
    signal_hash_present: Boolean(bundle.audit.signal_hash),
    snapshot_hash_present: Boolean(bundle.audit.snapshot_hash),
    content_hash_present: contentHashPresent,
  };
  const failedIndicators = Object.entries(indicators)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)
    .sort();

  const body = {
    report_version: 1 as const,
    replay_hash: replayHash,
    integrity_status: bundle.metadata.integrity_status,
    replay_hash_present: indicators.replay_hash_present,
    timeline_hash_present: indicators.timeline_hash_present,
    signal_hash_present: indicators.signal_hash_present,
    snapshot_hash_present: indicators.snapshot_hash_present,
    content_hash_present: indicators.content_hash_present,
    indicator_count: Object.keys(indicators).length,
    failed_indicators: failedIndicators,
  };

  return {
    ...body,
    summary_fingerprint: stableHash(body),
  };
}

export function buildReplayConfidenceSummary(
  replayHash: string,
  opts: ReplayForensicExportOptions = {},
): ReplayConfidenceSummaryReport | null {
  const confidence = buildReplayConfidenceReport(replayHash, opts);
  if (!confidence) return null;

  const negativeFactors = confidence.confidence_factors
    .filter(factor => factor.adjustment < 0)
    .sort((a, b) => a.adjustment - b.adjustment || a.factor.localeCompare(b.factor));
  const positiveFactorCount = confidence.confidence_factors
    .filter(factor => factor.adjustment > 0).length;
  const lineageAdjustmentTotal = roundNumber(
    confidence.lineage_adjustments.reduce((sum, item) => sum + item.adjustment, 0),
  );

  const body = {
    report_version: 1 as const,
    replay_hash: replayHash,
    base_confidence: confidence.base_confidence,
    propagated_confidence: confidence.propagated_confidence,
    confidence_delta: confidence.confidence_delta,
    confidence_direction: confidenceDirection(confidence.confidence_delta),
    negative_factor_count: negativeFactors.length,
    positive_factor_count: positiveFactorCount,
    lineage_adjustment_total: lineageAdjustmentTotal,
    strongest_negative_factor: negativeFactors[0]?.factor ?? null,
    generated_at: confidence.generated_at,
  };

  return {
    ...body,
    summary_fingerprint: stableHash(body),
  };
}

export function buildReplayLineageSummary(
  replayHash: string,
  opts: ReplayForensicExportOptions = {},
): ReplayLineageSummaryReport | null {
  const lineagePackage = buildLineageForensicPackage(replayHash, opts);
  if (!lineagePackage) return null;

  const lineageDates = lineagePackage.lineage_nodes
    .map(node => node.created_at)
    .filter(Boolean)
    .sort();

  const body = {
    report_version: 1 as const,
    replay_hash: replayHash,
    parent_depth: lineagePackage.parent_chain.length,
    child_count: lineagePackage.child_chain.length,
    lineage_node_count: lineagePackage.lineage_nodes.length,
    root_replay_hash: lineagePackage.root_replay_hash,
    earliest_lineage_at: lineageDates[0] ?? null,
    latest_lineage_at: lineageDates[lineageDates.length - 1] ?? null,
    lineage_integrity_statuses: summarizeLineageIntegrity(lineagePackage),
  };

  return {
    ...body,
    summary_fingerprint: stableHash(body),
  };
}

export function buildReplayVerificationSummary(
  replayHash: string,
  opts: ReplayForensicExportOptions = {},
): ReplayVerificationSummaryReport | null {
  const bundle = buildReplayAuditExportBundle(replayHash, opts);
  if (!bundle) return null;

  const history = [...bundle.verification_history].sort((a, b) => {
    const byCreated = b.created_at.localeCompare(a.created_at);
    if (byCreated !== 0) return byCreated;
    return a.id.localeCompare(b.id);
  });
  const verifiedCount = history.filter(row => row.verification_status === "verified").length;
  const divergedCount = history.filter(row => row.verification_status === "diverged").length;
  const unknownCount = history.length - verifiedCount - divergedCount;

  const body = {
    report_version: 1 as const,
    replay_hash: replayHash,
    verification_count: history.length,
    verified_count: verifiedCount,
    diverged_count: divergedCount,
    unknown_count: unknownCount,
    pass_ratio: ratio(verifiedCount, history.length),
    fail_ratio: ratio(divergedCount, history.length),
    latest_status: history[0]?.verification_status ?? null,
    latest_created_at: history[0]?.created_at ?? null,
  };

  return {
    ...body,
    summary_fingerprint: stableHash(body),
  };
}

function buildComparisonSummary(
  comparison: ReplayComparisonReport | null,
): ReplayComparisonSummary {
  return {
    compared_against: comparison?.compared_against ?? null,
    current_audit_id: comparison?.comparison.current_audit_id ?? null,
    compared_audit_id: comparison?.comparison.compared_audit_id ?? null,
    divergence_detected: comparison?.divergence_detected ?? false,
    mismatch_count: comparison?.mismatch_count ?? 0,
    integrity_status: comparison?.integrity_status ?? null,
  };
}

function summarizeCategories(comparison: ReplayComparisonReport): ReplayCategorySummary[] {
  const counts = new Map<ReplayMismatchCategory, number>();
  for (const detail of comparison.mismatch_details) {
    counts.set(detail.category, (counts.get(detail.category) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

function summarizeSeverities(comparison: ReplayComparisonReport): ReplaySeveritySummary[] {
  const severities: ReplaySeveritySummary["severity"][] = ["critical", "warning", "info"];
  return severities
    .map(severity => ({
      severity,
      count: comparison.mismatch_details.filter(detail => detail.severity === severity).length,
    }))
    .filter(summary => summary.count > 0);
}

function fieldsBySeverity(
  comparison: ReplayComparisonReport,
  severity: ReplaySeveritySummary["severity"],
): string[] {
  return uniqueStrings(
    comparison.mismatch_details
      .filter(detail => detail.severity === severity)
      .map(detail => `${detail.category}.${detail.field}`),
  );
}

function summarizeLineageIntegrity(
  lineagePackage: ReplayLineageAwareExportPackage,
): ReplayLineageSummaryReport["lineage_integrity_statuses"] {
  const counts = new Map<ReplayIntegrityStatus | "unknown", number>();
  for (const node of lineagePackage.lineage_nodes) {
    const status = node.integrity_status ?? "unknown";
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([integrity_status, count]) => ({ integrity_status, count }))
    .sort((a, b) => a.integrity_status.localeCompare(b.integrity_status));
}

function buildAuditReviewFlags(input: {
  divergence: ReplayDivergenceSummaryReport | null;
  integrity: ReplayIntegritySummaryReport | null;
  confidence: ReplayConfidenceSummaryReport | null;
  verification: ReplayVerificationSummaryReport | null;
}): string[] {
  const flags: string[] = [];

  if (input.divergence?.divergence_detected) flags.push("divergence_detected");
  if ((input.divergence?.severity_counts.find(item => item.severity === "critical")?.count ?? 0) > 0) {
    flags.push("critical_mismatch_present");
  }
  if (input.integrity?.integrity_status === "diverged") flags.push("integrity_diverged");
  if ((input.integrity?.failed_indicators.length ?? 0) > 0) flags.push("missing_integrity_indicators");
  if ((input.confidence?.propagated_confidence ?? 100) < 50) flags.push("low_propagated_confidence");
  if ((input.verification?.fail_ratio ?? 0) > 0) flags.push("verification_failures_present");

  return uniqueStrings(flags);
}

function confidenceDirection(delta: number | null): ReplayConfidenceSummaryReport["confidence_direction"] {
  if (delta == null) return "unknown";
  if (delta > 0) return "improved";
  if (delta < 0) return "reduced";
  return "unchanged";
}

function ratio(part: number, total: number): number | null {
  if (total === 0) return null;
  return roundNumber(part / total);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function roundNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
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
        acc[key] = toJsonSafe((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return null;
}
