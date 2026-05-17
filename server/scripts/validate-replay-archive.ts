import {
  computeCanonicalHash,
  createReplayArchiveManifest,
  createReplayArchiveSnapshot,
} from "../pipeline/replay-archive";

const forensicMetadata = {
  forensic_export_version: 1,
  replay_hash: "test-replay-hash",
  game_id: "nba_test_game",
  as_of: "2026-05-17T00:00:00.000Z",
  generated_at: "2026-05-17T00:00:00.000Z",
  export_source: "pipeline.sqlite",
  export_kind: "archival_manifest",
  integrity_status: "verified",
  replay_version: 1,
  reconstruction_version: "1",
};

const forensicPayload = {
  snapshots: [
    {
      sportsbook: "draftkings",
      spread_line: -3.5,
    },
  ],

  signals: [
    {
      market: "spread",
      confidence: 0.91,
    },
  ],
};

const generatedReport = {
  summary: {
    mismatches: 0,
    integrity_status: "verified",
  },
};

const snapshotA =
  createReplayArchiveSnapshot({
    archive_id: "archive_test_001",

    forensic_metadata:
      forensicMetadata,

    forensic_payload:
      forensicPayload,

    generated_report:
      generatedReport,
  });

const snapshotB =
  createReplayArchiveSnapshot({
    archive_id: "archive_test_001",

    forensic_metadata:
      forensicMetadata,

    forensic_payload:
      forensicPayload,

    generated_report:
      generatedReport,
  });

if (
  snapshotA.canonical_hash !==
  snapshotB.canonical_hash
) {
  throw new Error(
    "Deterministic snapshot hash mismatch.",
  );
}

const manifest =
  createReplayArchiveManifest({
    archive_id: "archive_test_001",

    game_id: "nba_test_game",

    forensic_version: 1,

    snapshot_hash:
      snapshotA.canonical_hash,

    bundle_hash:
      computeCanonicalHash({
        bundle: "test",
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

    bundle_size_bytes: 1024,

    retention_class:
      "historical",

    tags: [
      "validation",
      "deterministic",
    ],
  });

if (
  manifest.snapshot_hash !==
  snapshotA.canonical_hash
) {
  throw new Error(
    "Manifest snapshot hash mismatch.",
  );
}

console.log(
  "Replay archive validation passed.",
);

console.log(
  "Canonical hash:",
  snapshotA.canonical_hash,
);

console.log(
  "Manifest archive:",
  manifest.archive_id,
);