import zlib from "zlib";

import type {
  ReplayArchiveManifest,
  ReplayArchiveSnapshot,
} from "./replay-archive-contract";

import {
  computeCanonicalHash,
} from "./replay-archive";

export interface ReplayArchiveBundle {
  manifest: ReplayArchiveManifest;
  snapshot: ReplayArchiveSnapshot;
}

export function createReplayArchiveBundle(
  bundle: ReplayArchiveBundle,
): Buffer {
  const canonicalJson = JSON.stringify({
    manifest: bundle.manifest,
    snapshot: bundle.snapshot,
  });

  return zlib.gzipSync(canonicalJson);
}

export function extractReplayArchiveBundle(
  compressed: Buffer,
): ReplayArchiveBundle {
  const json = zlib.gunzipSync(compressed).toString("utf8");

  return JSON.parse(json) as ReplayArchiveBundle;
}

export function computeReplayArchiveBundleHash(
  compressed: Buffer,
): string {
  return computeCanonicalHash({
    bundle_sha256_source:
      compressed.toString("base64"),
  });
}