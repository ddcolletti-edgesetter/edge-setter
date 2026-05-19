import crypto from "crypto";
import {
  buildReplayIntelligenceForensicTimelines,
  type ReplayIntelligenceForensicTimeline,
} from "./replay-intelligence-forensic-timeline";
import {
  buildReplayIntelligenceSnapshotGroups,
  type ReplayIntelligenceSnapshotGroup,
} from "./replay-intelligence-snapshot-aggregation";

const EXPORT_GENERATED_AT = "2026-01-01T00:00:00.000Z";
const EXPORT_VERSION = 1;

export interface ReplayIntelligenceExportManifest {
  readonly export_hash: string;
  readonly replay_hash: string;
  readonly generated_at: string;
  readonly export_version: 1;
  readonly artifact_count: number;
  readonly artifact_hashes: readonly string[];
  readonly timeline_hash: string;
  readonly snapshot_group_hash: string;
  readonly reducer_hash: string;
  readonly lineage_hash: string;
  readonly manifest_hash: string;
}

export interface ReplayIntelligenceHistoricalExportBundle {
  readonly export_hash: string;
  readonly metadata: {
    readonly export_kind: "replay_intelligence_historical_export";
    readonly export_version: 1;
    readonly replay_hash: string;
    readonly generated_at: string;
    readonly deterministic: true;
    readonly immutable: true;
  };
  readonly manifest: ReplayIntelligenceExportManifest;
  readonly archive: {
    readonly replay_hash: string;
    readonly timeline: ReplayIntelligenceForensicTimeline;
    readonly snapshot_group: ReplayIntelligenceSnapshotGroup;
    readonly lineage: Readonly<Record<string, string | null>>;
    readonly convergence: ReplayIntelligenceSnapshotGroup["convergence"];
    readonly reducers: {
      readonly timeline: ReplayIntelligenceForensicTimeline["reducers"];
      readonly snapshots: ReplayIntelligenceSnapshotGroup["reducer_ready_snapshots"];
    };
    readonly archive_hash: string;
  };
  readonly verification: {
    readonly export_hash: string;
    readonly manifest_hash: string;
    readonly archive_hash: string;
    readonly timeline_hash: string;
    readonly reducer_hash: string;
    readonly lineage_hash: string;
    readonly verified: boolean;
    readonly verification_hash: string;
  };
}

export function buildReplayIntelligenceHistoricalExports():
  readonly ReplayIntelligenceHistoricalExportBundle[] {
  const timelines = buildReplayIntelligenceForensicTimelines();
  const groups = buildReplayIntelligenceSnapshotGroups();
  const replayHashes = Array.from(new Set([
    ...timelines.map((timeline) => timeline.replay_hash),
    ...groups.map((group) => group.replay_hash),
  ])).sort((left, right) => left.localeCompare(right));

  return deepFreeze(replayHashes.map((replayHash) =>
    buildReplayIntelligenceHistoricalExportForReplay(replayHash),
  ).filter((bundle): bundle is ReplayIntelligenceHistoricalExportBundle =>
    bundle !== null,
  ));
}

export function buildReplayIntelligenceHistoricalExportSummary() {
  const exports = buildReplayIntelligenceHistoricalExports();
  const payload = {
    generated_at: latestTimestamp(exports.map((bundle) => bundle.metadata.generated_at)),
    export_count: exports.length,
    artifact_count: exports.reduce(
      (sum, bundle) => sum + bundle.manifest.artifact_count,
      0,
    ),
    export_hashes: exports.map((bundle) => bundle.export_hash),
    verified_count: exports.filter((bundle) => bundle.verification.verified).length,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

export function getReplayIntelligenceHistoricalExportByHash(
  exportHash: string,
): ReplayIntelligenceHistoricalExportBundle | null {
  return buildReplayIntelligenceHistoricalExports().find(
    (bundle) => bundle.export_hash === exportHash,
  ) ?? null;
}

export function buildReplayIntelligenceHistoricalExportManifest(
  exportHash: string,
): ReplayIntelligenceExportManifest | null {
  return getReplayIntelligenceHistoricalExportByHash(exportHash)?.manifest ?? null;
}

export function buildReplayIntelligenceHistoricalExportLineage(
  exportHash: string,
) {
  const bundle = getReplayIntelligenceHistoricalExportByHash(exportHash);
  if (!bundle) return null;
  const payload = {
    export_hash: exportHash,
    replay_hash: bundle.metadata.replay_hash,
    lineage: bundle.archive.lineage,
    lineage_hash: bundle.manifest.lineage_hash,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

export function buildReplayIntelligenceHistoricalExportVerification(
  exportHash: string,
) {
  return getReplayIntelligenceHistoricalExportByHash(exportHash)?.verification ?? null;
}

function buildReplayIntelligenceHistoricalExportForReplay(
  replayHash: string,
): ReplayIntelligenceHistoricalExportBundle | null {
  const timeline = buildReplayIntelligenceForensicTimelines().find(
    (candidate) => candidate.replay_hash === replayHash,
  );
  const snapshotGroup = buildReplayIntelligenceSnapshotGroups().find(
    (candidate) => candidate.replay_hash === replayHash,
  );
  if (!timeline || !snapshotGroup) return null;

  const generatedAt = latestTimestamp([
    timeline.generated_at,
    snapshotGroup.generated_at,
  ]);
  const lineage = deepFreeze({
    ...snapshotGroup.immutable_lineage,
    ...timeline.immutable_event_lineage,
  });
  const lineageHash = deterministicHash(lineage);
  const archiveSeed = {
    replay_hash: replayHash,
    timeline_hash: timeline.timeline_hash,
    snapshot_group_hash: snapshotGroup.group_hash,
    lineage_hash: lineageHash,
    convergence: snapshotGroup.convergence,
    timeline_reducer_hash: timeline.reducers.reducer_hash,
    snapshot_reducer_hashes: snapshotGroup.reducer_ready_snapshots.map((item) =>
      item.reducer_hash,
    ),
  };
  const archiveHash = deterministicHash(archiveSeed);
  const artifactHashes = [
    archiveHash,
    timeline.timeline_hash,
    snapshotGroup.group_hash,
    timeline.reducers.reducer_hash,
    lineageHash,
    ...snapshotGroup.reducer_ready_snapshots.map((item) => item.reducer_hash),
  ].sort((left, right) => left.localeCompare(right));
  const manifestSeed = {
    replay_hash: replayHash,
    generated_at: generatedAt,
    export_version: EXPORT_VERSION,
    artifact_hashes: artifactHashes,
    timeline_hash: timeline.timeline_hash,
    snapshot_group_hash: snapshotGroup.group_hash,
    reducer_hash: timeline.reducers.reducer_hash,
    lineage_hash: lineageHash,
  };
  const manifestHash = deterministicHash(manifestSeed);
  const exportHash = deterministicHash({
    kind: "replay_intelligence_historical_export",
    manifest_hash: manifestHash,
    archive_hash: archiveHash,
  });
  const manifest: ReplayIntelligenceExportManifest = deepFreeze({
    export_hash: exportHash,
    replay_hash: replayHash,
    generated_at: generatedAt,
    export_version: EXPORT_VERSION,
    artifact_count: artifactHashes.length,
    artifact_hashes: artifactHashes,
    timeline_hash: timeline.timeline_hash,
    snapshot_group_hash: snapshotGroup.group_hash,
    reducer_hash: timeline.reducers.reducer_hash,
    lineage_hash: lineageHash,
    manifest_hash: manifestHash,
  });
  const archive = deepFreeze({
    replay_hash: replayHash,
    timeline,
    snapshot_group: snapshotGroup,
    lineage,
    convergence: snapshotGroup.convergence,
    reducers: {
      timeline: timeline.reducers,
      snapshots: snapshotGroup.reducer_ready_snapshots,
    },
    archive_hash: archiveHash,
  });
  const verificationSeed = {
    export_hash: exportHash,
    manifest_hash: manifestHash,
    archive_hash: archiveHash,
    timeline_hash: timeline.timeline_hash,
    reducer_hash: timeline.reducers.reducer_hash,
    lineage_hash: lineageHash,
    artifact_hashes: artifactHashes,
  };
  const verificationHash = deterministicHash(verificationSeed);
  const verification = deepFreeze({
    export_hash: exportHash,
    manifest_hash: manifestHash,
    archive_hash: archiveHash,
    timeline_hash: timeline.timeline_hash,
    reducer_hash: timeline.reducers.reducer_hash,
    lineage_hash: lineageHash,
    verified:
      manifest.export_hash === exportHash &&
      manifest.manifest_hash === manifestHash &&
      archive.archive_hash === archiveHash &&
      artifactHashes.includes(timeline.timeline_hash) &&
      artifactHashes.includes(snapshotGroup.group_hash),
    verification_hash: verificationHash,
  });

  return deepFreeze({
    export_hash: exportHash,
    metadata: {
      export_kind: "replay_intelligence_historical_export",
      export_version: EXPORT_VERSION,
      replay_hash: replayHash,
      generated_at: generatedAt,
      deterministic: true,
      immutable: true,
    },
    manifest,
    archive,
    verification,
  });
}

function latestTimestamp(timestamps: readonly string[]): string {
  return [...timestamps].sort((left, right) => right.localeCompare(left))[0] ??
    EXPORT_GENERATED_AT;
}

function deterministicHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(value))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) {
      deepFreeze(item);
    }
  }

  return value;
}
