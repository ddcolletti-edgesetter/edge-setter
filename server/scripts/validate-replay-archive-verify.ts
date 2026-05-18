import {
  computeCanonicalHash,
  createReplayArchiveManifest,
  createReplayArchiveSnapshot,
} from "../pipeline/replay-archive";

import {
  createReplayArchiveBundle,
} from "../pipeline/replay-archive-bundle";

import {
  verifyReplayArchiveBundle,
} from "../pipeline/replay-archive-verify";

import type {
  ReplayForensicBundleMetadata,
} from "../pipeline/replay-forensic-contract";

const forensicMetadata: ReplayForensicBundleMetadata = {
  forensic_export_version: 1,
  replay_hash: "verify-test-hash",
  game_id: "nba_verify_game",
  as_of: "2026-05-17T00:00:00.000Z",
  generated_at: "2026-05-17T00:00:00.000Z",
  export_source: "pipeline.sqlite",
  export_kind: "archival_manifest",
  integrity_status: "verified",
  replay_version: 1,
  reconstruction_version: "1",
};

const forensicPayload = {
  signals: [
    {
      market: "spread",
      confidence: 0.92,
    },
  ],
};

const generatedReport = {
  summary: {
    verified: true,
  },
};

const snapshot =
  createReplayArchiveSnapshot({
    archive_id: "archive_verify_001",

    forensic_metadata:
      forensicMetadata,

    forensic_payload:
      forensicPayload,

    generated_report:
      generatedReport,
  });

const manifest =
  createReplayArchiveManifest({
    archive_id: "archive_verify_001",

    game_id: "nba_verify_game",

    forensic_version: 1,

    snapshot_hash:
      snapshot.canonical_hash,

    bundle_hash:
      computeCanonicalHash({
        bundle: "verify",
      }),

    export_hash:
      computeCanonicalHash(
        forensicPayload,
      ),

    timeline_hash:
      computeCanonicalHash({
        timeline: [],
      }),

    signal_hash:
      computeCanonicalHash({
        signals:
          forensicPayload.signals,
      }),

    settlement_hash:
      computeCanonicalHash({
        settlement: [],
      }),

    provenance_hash:
      computeCanonicalHash({
        provenance: [],
      }),

    replay_count: 1,

    bundle_size_bytes: 2048,

    retention_class:
      "historical",
  });

const bundle =
  createReplayArchiveBundle({
    manifest,
    snapshot,
  });

const verification =
  verifyReplayArchiveBundle(bundle);

if (!verification.verified) {
  console.error(
    verification.mismatches,
  );

  throw new Error(
    "Replay archive verification failed.",
  );
}

console.log(
  "Replay archive verification validation passed.",
);

console.log(
  "Verified archive:",
  verification.archive_id,
);