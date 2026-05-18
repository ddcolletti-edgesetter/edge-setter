import crypto from "node:crypto";

import type {
  ReplayIntelligenceExportBundle,
  ReplayIntelligenceExportFileEntry,
  ReplayIntelligenceExportManifest,
  ReplayIntelligenceExportValidationResult,
  ReplayIntelligenceSnapshotPackage,
} from "./replay-intelligence-export-contract";
import type {
  ReplayIntelligenceSnapshotContract,
} from "./replay-intelligence-contract";

export interface ReplayIntelligenceSnapshotPackageInput {
  snapshot: ReplayIntelligenceSnapshotContract;
  replay_id: string;
  archive_id: string;
  lineage_id: string;
  category?: string | null;
}

export interface ReplayIntelligenceManifestInput {
  generated_at: string;
  replay_id: string;
  archive_id: string;
  intelligence_id: string;
  lineage_id: string;
  snapshots: readonly ReplayIntelligenceSnapshotPackage[];
  files?: readonly ReplayIntelligenceExportFileEntry[];
  export_id?: string | null;
}

export interface ReplayIntelligenceExportBundleInput extends ReplayIntelligenceManifestInput {}

export interface ReplayIntelligenceExportBundleSummary {
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
  categories: readonly string[];
  total_byte_size: number;
}

export function buildReplayIntelligenceManifest(
  input: ReplayIntelligenceManifestInput,
): ReplayIntelligenceExportManifest {
  const snapshots = sortReplayIntelligenceSnapshotPackages(input.snapshots);
  const files = sortReplayIntelligenceExportFileEntries(input.files ?? []);
  const exportId = input.export_id ?? buildReplayIntelligenceExportId({
    generated_at: input.generated_at,
    replay_id: input.replay_id,
    archive_id: input.archive_id,
    intelligence_id: input.intelligence_id,
    lineage_id: input.lineage_id,
    snapshot_hashes: snapshots.map(snapshot => snapshot.canonical_hash),
    file_hashes: files.map(file => file.canonical_hash),
  });
  const canonicalBody = {
    version: 1,
    generated_at: input.generated_at,
    export_id: exportId,
    replay_id: input.replay_id,
    archive_id: input.archive_id,
    intelligence_id: input.intelligence_id,
    lineage_id: input.lineage_id,
    file_count: files.length,
    snapshot_count: snapshots.length,
    snapshot_hashes: snapshots.map(snapshot => snapshot.canonical_hash),
    file_hashes: files.map(file => file.canonical_hash),
  };

  return {
    version: 1,
    generated_at: input.generated_at,
    export_id: exportId,
    replay_id: input.replay_id,
    archive_id: input.archive_id,
    intelligence_id: input.intelligence_id,
    lineage_id: input.lineage_id,
    canonical_hash: computeReplayIntelligenceCanonicalHash(canonicalBody),
    file_count: files.length,
    snapshot_count: snapshots.length,
  };
}

export function buildReplayIntelligenceSnapshotPackage(
  input: ReplayIntelligenceSnapshotPackageInput,
): ReplayIntelligenceSnapshotPackage {
  const category = input.category ?? input.snapshot.snapshot_kind;
  const payloadHash = computeReplayIntelligenceCanonicalHash({
    snapshot_id: input.snapshot.snapshot_id,
    snapshot_kind: input.snapshot.snapshot_kind,
    scope: input.snapshot.scope,
    scope_id: input.snapshot.scope_id,
    generated_at: input.snapshot.generated_at,
    deterministic_hash: input.snapshot.deterministic_hash,
    report_version: input.snapshot.report_version,
    forensic_metrics: input.snapshot.forensic_metrics,
    drift_trends: input.snapshot.drift_trends,
    mutation_frequency: sortByHash(input.snapshot.mutation_frequency),
    lineage_depth_metrics: input.snapshot.lineage_depth_metrics,
    ancestry_summaries: sortByArchiveId(input.snapshot.ancestry_summaries),
    evolution_scores: sortByArchiveId(input.snapshot.evolution_scores),
    metadata: input.snapshot.metadata,
  });
  const canonicalBody = {
    snapshot_id: input.snapshot.snapshot_id,
    generated_at: input.snapshot.generated_at,
    replay_id: input.replay_id,
    archive_id: input.archive_id,
    lineage_id: input.lineage_id,
    category,
    payload_hash: payloadHash,
  };

  return {
    snapshot_id: input.snapshot.snapshot_id,
    generated_at: input.snapshot.generated_at,
    replay_id: input.replay_id,
    archive_id: input.archive_id,
    lineage_id: input.lineage_id,
    category,
    payload_hash: payloadHash,
    canonical_hash: computeReplayIntelligenceCanonicalHash(canonicalBody),
  };
}

export function buildReplayIntelligenceExportBundle(
  input: ReplayIntelligenceExportBundleInput,
): ReplayIntelligenceExportBundle {
  const snapshots = sortReplayIntelligenceSnapshotPackages(input.snapshots);
  const files = sortReplayIntelligenceExportFileEntries(input.files ?? []);
  const manifest = buildReplayIntelligenceManifest({
    ...input,
    snapshots,
    files,
  });
  const canonicalBody = {
    version: 1,
    generated_at: input.generated_at,
    export_id: manifest.export_id,
    lineage_id: input.lineage_id,
    manifest_hash: manifest.canonical_hash,
    snapshot_hashes: snapshots.map(snapshot => snapshot.canonical_hash),
    file_hashes: files.map(file => file.canonical_hash),
  };

  return {
    version: 1,
    generated_at: input.generated_at,
    export_id: manifest.export_id,
    lineage_id: input.lineage_id,
    canonical_hash: computeReplayIntelligenceCanonicalHash(canonicalBody),
    manifest,
    snapshots,
    files,
  };
}

export function validateReplayIntelligenceExportBundle(
  bundle: ReplayIntelligenceExportBundle,
  generatedAt: string = bundle.generated_at,
): ReplayIntelligenceExportValidationResult {
  const mismatches: string[] = [];
  const sortedSnapshots = sortReplayIntelligenceSnapshotPackages(bundle.snapshots);
  const sortedFiles = sortReplayIntelligenceExportFileEntries(bundle.files);
  const expectedManifest = buildReplayIntelligenceManifest({
    generated_at: bundle.manifest.generated_at,
    replay_id: bundle.manifest.replay_id,
    archive_id: bundle.manifest.archive_id,
    intelligence_id: bundle.manifest.intelligence_id,
    lineage_id: bundle.manifest.lineage_id,
    export_id: bundle.manifest.export_id,
    snapshots: bundle.snapshots,
    files: bundle.files,
  });
  const expectedBundleHash = computeReplayIntelligenceCanonicalHash({
    version: bundle.version,
    generated_at: bundle.generated_at,
    export_id: bundle.export_id,
    lineage_id: bundle.lineage_id,
    manifest_hash: expectedManifest.canonical_hash,
    snapshot_hashes: sortedSnapshots.map(snapshot => snapshot.canonical_hash),
    file_hashes: sortedFiles.map(file => file.canonical_hash),
  });

  if (bundle.version !== 1) mismatches.push("bundle.version must be 1");
  if (bundle.manifest.version !== 1) mismatches.push("manifest.version must be 1");
  if (bundle.generated_at !== generatedAt) mismatches.push("bundle.generated_at does not match validation timestamp");
  if (bundle.generated_at !== bundle.manifest.generated_at) mismatches.push("bundle and manifest generated_at differ");
  if (bundle.export_id !== bundle.manifest.export_id) mismatches.push("bundle and manifest export_id differ");
  if (bundle.lineage_id !== bundle.manifest.lineage_id) mismatches.push("bundle and manifest lineage_id differ");
  if (bundle.manifest.snapshot_count !== bundle.snapshots.length) mismatches.push("manifest snapshot_count mismatch");
  if (bundle.manifest.file_count !== bundle.files.length) mismatches.push("manifest file_count mismatch");
  if (bundle.manifest.canonical_hash !== expectedManifest.canonical_hash) mismatches.push("manifest canonical_hash mismatch");
  if (bundle.canonical_hash !== expectedBundleHash) mismatches.push("bundle canonical_hash mismatch");
  if (!sameOrder(bundle.snapshots, sortedSnapshots, snapshot => snapshot.canonical_hash)) mismatches.push("snapshots are not stably sorted");
  if (!sameOrder(bundle.files, sortedFiles, file => file.path)) mismatches.push("files are not stably sorted");

  for (const snapshot of bundle.snapshots) {
    const expectedSnapshotHash = computeReplayIntelligenceCanonicalHash({
      snapshot_id: snapshot.snapshot_id,
      generated_at: snapshot.generated_at,
      replay_id: snapshot.replay_id,
      archive_id: snapshot.archive_id,
      lineage_id: snapshot.lineage_id,
      category: snapshot.category,
      payload_hash: snapshot.payload_hash,
    });
    if (snapshot.canonical_hash !== expectedSnapshotHash) {
      mismatches.push(`snapshot canonical_hash mismatch: ${snapshot.snapshot_id}`);
    }
  }

  for (const file of bundle.files) {
    if (file.byte_size < 0) mismatches.push(`file byte_size cannot be negative: ${file.path}`);
    if (!file.canonical_hash) mismatches.push(`file canonical_hash missing: ${file.path}`);
  }

  return {
    valid: mismatches.length === 0,
    generated_at: generatedAt,
    export_id: bundle.export_id,
    canonical_hash: bundle.canonical_hash,
    mismatches: mismatches.sort((left, right) => left.localeCompare(right)),
  };
}

export function summarizeReplayIntelligenceExportBundle(
  bundle: ReplayIntelligenceExportBundle,
): ReplayIntelligenceExportBundleSummary {
  const categories = Array.from(new Set(bundle.snapshots.map(snapshot => snapshot.category)))
    .sort((left, right) => left.localeCompare(right));

  return {
    version: bundle.version,
    generated_at: bundle.generated_at,
    export_id: bundle.export_id,
    replay_id: bundle.manifest.replay_id,
    archive_id: bundle.manifest.archive_id,
    intelligence_id: bundle.manifest.intelligence_id,
    lineage_id: bundle.lineage_id,
    canonical_hash: bundle.canonical_hash,
    file_count: bundle.files.length,
    snapshot_count: bundle.snapshots.length,
    categories,
    total_byte_size: bundle.files.reduce((total, file) => total + file.byte_size, 0),
  };
}

export function computeReplayIntelligenceCanonicalHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableReplayIntelligenceStringify(value))
    .digest("hex");
}

function buildReplayIntelligenceExportId(value: unknown): string {
  return `replay-intelligence-export:${computeReplayIntelligenceCanonicalHash(value)}`;
}

function sortReplayIntelligenceSnapshotPackages(
  snapshots: readonly ReplayIntelligenceSnapshotPackage[],
): ReplayIntelligenceSnapshotPackage[] {
  return [...snapshots].sort((left, right) =>
    left.generated_at.localeCompare(right.generated_at) ||
    left.category.localeCompare(right.category) ||
    left.snapshot_id.localeCompare(right.snapshot_id) ||
    left.canonical_hash.localeCompare(right.canonical_hash)
  );
}

function sortReplayIntelligenceExportFileEntries(
  files: readonly ReplayIntelligenceExportFileEntry[],
): ReplayIntelligenceExportFileEntry[] {
  return [...files].sort((left, right) =>
    left.path.localeCompare(right.path) ||
    left.file_name.localeCompare(right.file_name) ||
    left.canonical_hash.localeCompare(right.canonical_hash)
  );
}

function sortByHash<T extends { deterministic_hash?: string; canonical_hash?: string }>(
  values: readonly T[],
): T[] {
  return [...values].sort((left, right) =>
    String(left.deterministic_hash ?? left.canonical_hash ?? "").localeCompare(
      String(right.deterministic_hash ?? right.canonical_hash ?? ""),
    )
  );
}

function sortByArchiveId<T extends { archive_id: string }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) =>
    left.archive_id.localeCompare(right.archive_id) ||
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  );
}

function sameOrder<T>(
  left: readonly T[],
  right: readonly T[],
  getKey: (item: T) => string,
): boolean {
  return left.map(getKey).join("\n") === right.map(getKey).join("\n");
}

function stableReplayIntelligenceStringify(value: unknown): string {
  return JSON.stringify(sortReplayIntelligenceKeys(value));
}

function sortReplayIntelligenceKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortReplayIntelligenceKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortReplayIntelligenceKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    return null;
  }

  if (typeof value === "undefined") {
    return null;
  }

  return value;
}
