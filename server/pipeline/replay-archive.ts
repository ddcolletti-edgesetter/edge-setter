import crypto from "crypto";

import type {
  ReplayArchiveManifest,
  ReplayArchiveSnapshot,
} from "./replay-archive-contract";

import type {
  ReplayForensicBundleMetadata,
  ReplayForensicJsonValue,
} from "./replay-forensic-contract";

function stableSerialize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue(
          (value as Record<string, unknown>)[key],
        );

        return acc;
      }, {});
  }

  return value;
}

export function sha256(input: string): string {
  return crypto
    .createHash("sha256")
    .update(input, "utf8")
    .digest("hex");
}

export function computeCanonicalHash(
  value: unknown,
): string {
  return sha256(stableSerialize(value));
}

export function createReplayArchiveSnapshot(params: {
  archive_id: string;

  forensic_metadata: ReplayForensicBundleMetadata;

  forensic_payload: ReplayForensicJsonValue;

  generated_report: ReplayForensicJsonValue;
}): ReplayArchiveSnapshot {
  const snapshotPayload = {
    forensic_metadata: params.forensic_metadata,
    forensic_payload: params.forensic_payload,
    generated_report: params.generated_report,
  };

  const canonical_hash =
    computeCanonicalHash(snapshotPayload);

  return {
    archive_id: params.archive_id,

    forensic_metadata: params.forensic_metadata,

    forensic_payload: params.forensic_payload,

    generated_report: params.generated_report,

    canonical_hash,

    created_at: new Date().toISOString(),
  };
}

export function createReplayArchiveManifest(params: {
  archive_id: string;

  game_id: string;

  forensic_version: number;

  snapshot_hash: string;

  bundle_hash: string;

  export_hash: string;

  timeline_hash: string;

  signal_hash: string;

  settlement_hash: string;

  provenance_hash: string;

  replay_count: number;

  bundle_size_bytes: number;

  retention_class: ReplayArchiveManifest["retention_class"];

  tags?: string[];

  parent_archive_id?: string;

  root_archive_id?: string;

  revision_number?: number;
}): ReplayArchiveManifest {
  return {
    archive_id: params.archive_id,

    game_id: params.game_id,

    created_at: new Date().toISOString(),

    forensic_version: params.forensic_version,

    snapshot_hash: params.snapshot_hash,

    bundle_hash: params.bundle_hash,

    export_hash: params.export_hash,

    timeline_hash: params.timeline_hash,

    signal_hash: params.signal_hash,

    settlement_hash: params.settlement_hash,

    provenance_hash: params.provenance_hash,

    compression: "gzip",

    bundle_size_bytes: params.bundle_size_bytes,

    replay_count: params.replay_count,

    verification_status: "verified",

    retention_class: params.retention_class,

    parent_archive_id:
      params.parent_archive_id,

    root_archive_id:
      params.root_archive_id,

    revision_number:
      params.revision_number ?? 1,

    tags: params.tags ?? [],
  };
}