import type {
  ReplayArchiveBundle,
} from "./replay-archive-bundle";

import {
  extractReplayArchiveBundle,
} from "./replay-archive-bundle";

import {
  computeCanonicalHash,
} from "./replay-archive";

export interface ReplayArchiveVerificationMismatch {
  type: string;
  path: string;
  expected: string;
  actual: string;
}

export interface ReplayArchiveVerificationResult {
  archive_id: string | null;
  verified: boolean;
  mismatch_count: number;
  mismatches: ReplayArchiveVerificationMismatch[];
}

export function verifyReplayArchiveBundle(
  compressed: Buffer,
): ReplayArchiveVerificationResult {
  let bundle: ReplayArchiveBundle;

  try {
    bundle = extractReplayArchiveBundle(compressed);
  } catch (error) {
    return {
      archive_id: null,
      verified: false,
      mismatch_count: 1,
      mismatches: [
        {
          type: "bundle_extraction_failed",
          path: "bundle",
          expected: "valid_gzip_json_bundle",
          actual:
            error instanceof Error
              ? error.message
              : "unknown_error",
        },
      ],
    };
  }

  const mismatches: ReplayArchiveVerificationMismatch[] = [];

  const snapshotPayload = {
    forensic_metadata: bundle.snapshot.forensic_metadata,
    forensic_payload: bundle.snapshot.forensic_payload,
    generated_report: bundle.snapshot.generated_report,
  };

  const actualSnapshotHash =
    computeCanonicalHash(snapshotPayload);

  if (
    actualSnapshotHash !==
    bundle.snapshot.canonical_hash
  ) {
    mismatches.push({
      type: "snapshot_hash_mismatch",
      path: "snapshot.canonical_hash",
      expected: bundle.snapshot.canonical_hash,
      actual: actualSnapshotHash,
    });
  }

  if (
    bundle.manifest.snapshot_hash !==
    bundle.snapshot.canonical_hash
  ) {
    mismatches.push({
      type: "manifest_snapshot_hash_mismatch",
      path: "manifest.snapshot_hash",
      expected: bundle.snapshot.canonical_hash,
      actual: bundle.manifest.snapshot_hash,
    });
  }

  if (
    bundle.manifest.archive_id !==
    bundle.snapshot.archive_id
  ) {
    mismatches.push({
      type: "archive_id_mismatch",
      path: "manifest.archive_id",
      expected: bundle.snapshot.archive_id,
      actual: bundle.manifest.archive_id,
    });
  }

  return {
    archive_id: bundle.manifest.archive_id,
    verified: mismatches.length === 0,
    mismatch_count: mismatches.length,
    mismatches,
  };
}