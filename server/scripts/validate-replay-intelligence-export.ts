import {
  buildReplayIntelligenceExportBundle,
  buildReplayIntelligenceManifest,
  buildReplayIntelligenceSnapshotPackage,
  computeReplayIntelligenceCanonicalHash,
  summarizeReplayIntelligenceExportBundle,
  validateReplayIntelligenceExportBundle,
} from "../pipeline/replay-intelligence-export";
import type {
  ReplayIntelligenceExportFileEntry,
} from "../pipeline/replay-intelligence-export-contract";
import type {
  ReplayIntelligenceSnapshotContract,
} from "../pipeline/replay-intelligence-contract";

const GENERATED_AT = "2026-04-01T00:00:00.000Z";
const REPLAY_ID = "replay-intelligence-export-replay";
const ARCHIVE_ID = "replay-intelligence-export-archive";
const INTELLIGENCE_ID = "replay-intelligence-export-intelligence";
const LINEAGE_ID = "replay-intelligence-export-lineage";

const snapshotA = createSnapshot({
  snapshot_id: "snapshot-alpha",
  snapshot_kind: "archive_intelligence_report",
  scope: "archive",
  scope_id: ARCHIVE_ID,
  generated_at: "2026-04-01T00:00:02.000Z",
  deterministic_hash: "snapshot-alpha-deterministic",
});

const snapshotB = createSnapshot({
  snapshot_id: "snapshot-beta",
  snapshot_kind: "mutation_frequency_snapshot",
  scope: "archive",
  scope_id: ARCHIVE_ID,
  generated_at: "2026-04-01T00:00:01.000Z",
  deterministic_hash: "snapshot-beta-deterministic",
});

const packageA = buildReplayIntelligenceSnapshotPackage({
  snapshot: snapshotA,
  replay_id: REPLAY_ID,
  archive_id: ARCHIVE_ID,
  lineage_id: LINEAGE_ID,
});

const packageB = buildReplayIntelligenceSnapshotPackage({
  snapshot: snapshotB,
  replay_id: REPLAY_ID,
  archive_id: ARCHIVE_ID,
  lineage_id: LINEAGE_ID,
  category: "mutation_trends",
});

const files: ReplayIntelligenceExportFileEntry[] = [
  createFile("snapshots/zeta.json", "zeta.json", { snapshot_id: "zeta", value: 2 }),
  createFile("manifest/alpha.json", "alpha.json", { snapshot_id: "alpha", value: 1 }),
];

validateSnapshotPackages();
validateManifest();
validateBundle();
validateCanonicalHashDeterminism();
validateSummary();
validateValidationHelper();

console.log("Replay intelligence export validation passed.");
console.log(`Export snapshots: 2`);
console.log(`Export files: 2`);

function validateSnapshotPackages(): void {
  assertEqual(packageA.snapshot_id, "snapshot-alpha", "snapshot package id mismatch");
  assertEqual(packageA.category, "archive_intelligence_report", "default snapshot category mismatch");
  assertEqual(packageB.category, "mutation_trends", "explicit snapshot category mismatch");
  assertEqual(Boolean(packageA.payload_hash), true, "snapshot payload hash missing");
  assertEqual(Boolean(packageA.canonical_hash), true, "snapshot canonical hash missing");

  const packageAAgain = buildReplayIntelligenceSnapshotPackage({
    snapshot: snapshotA,
    replay_id: REPLAY_ID,
    archive_id: ARCHIVE_ID,
    lineage_id: LINEAGE_ID,
  });
  assertEqual(packageAAgain.canonical_hash, packageA.canonical_hash, "snapshot package hash is not deterministic");
  assertEqual(packageAAgain.payload_hash, packageA.payload_hash, "snapshot payload hash is not deterministic");
}

function validateManifest(): void {
  const manifest = buildReplayIntelligenceManifest({
    generated_at: GENERATED_AT,
    replay_id: REPLAY_ID,
    archive_id: ARCHIVE_ID,
    intelligence_id: INTELLIGENCE_ID,
    lineage_id: LINEAGE_ID,
    snapshots: [packageA, packageB],
    files,
  });
  const manifestAgain = buildReplayIntelligenceManifest({
    generated_at: GENERATED_AT,
    replay_id: REPLAY_ID,
    archive_id: ARCHIVE_ID,
    intelligence_id: INTELLIGENCE_ID,
    lineage_id: LINEAGE_ID,
    snapshots: [packageB, packageA],
    files: [...files].reverse(),
  });

  assertEqual(manifest.version, 1, "manifest version mismatch");
  assertEqual(manifest.generated_at, GENERATED_AT, "manifest timestamp mismatch");
  assertEqual(manifest.snapshot_count, 2, "manifest snapshot count mismatch");
  assertEqual(manifest.file_count, 2, "manifest file count mismatch");
  assertEqual(manifest.export_id, manifestAgain.export_id, "manifest export id should be order independent");
  assertEqual(manifest.canonical_hash, manifestAgain.canonical_hash, "manifest canonical hash should be order independent");
}

function validateBundle(): void {
  const bundle = buildBundle();
  const bundleAgain = buildReplayIntelligenceExportBundle({
    generated_at: GENERATED_AT,
    replay_id: REPLAY_ID,
    archive_id: ARCHIVE_ID,
    intelligence_id: INTELLIGENCE_ID,
    lineage_id: LINEAGE_ID,
    snapshots: [packageB, packageA],
    files: [...files].reverse(),
  });

  assertEqual(bundle.version, 1, "bundle version mismatch");
  assertEqual(bundle.generated_at, GENERATED_AT, "bundle timestamp mismatch");
  assertEqual(bundle.manifest.snapshot_count, 2, "bundle manifest snapshot count mismatch");
  assertEqual(bundle.snapshots.map(snapshot => snapshot.snapshot_id).join(","), "snapshot-beta,snapshot-alpha", "bundle snapshots are not stably sorted");
  assertEqual(bundle.files.map(file => file.path).join(","), "manifest/alpha.json,snapshots/zeta.json", "bundle files are not stably sorted");
  assertEqual(bundle.export_id, bundle.manifest.export_id, "bundle and manifest export id mismatch");
  assertEqual(bundle.canonical_hash, bundleAgain.canonical_hash, "bundle canonical hash should be order independent");
  assertEqual(bundle.export_id, bundleAgain.export_id, "bundle export id should be order independent");
}

function validateCanonicalHashDeterminism(): void {
  const left = computeReplayIntelligenceCanonicalHash({
    z: 1,
    a: {
      beta: true,
      alpha: ["x", "y"],
    },
  });
  const right = computeReplayIntelligenceCanonicalHash({
    a: {
      alpha: ["x", "y"],
      beta: true,
    },
    z: 1,
  });

  assertEqual(left, right, "canonical hash must sort object keys deterministically");
  assertEqual(left.length, 64, "canonical hash should be sha256 hex length");
}

function validateSummary(): void {
  const bundle = buildBundle();
  const summary = summarizeReplayIntelligenceExportBundle(bundle);

  assertEqual(summary.version, 1, "summary version mismatch");
  assertEqual(summary.export_id, bundle.export_id, "summary export id mismatch");
  assertEqual(summary.snapshot_count, 2, "summary snapshot count mismatch");
  assertEqual(summary.file_count, 2, "summary file count mismatch");
  assertEqual(summary.categories.join(","), "archive_intelligence_report,mutation_trends", "summary categories not sorted");
  assertEqual(summary.total_byte_size, files[0].byte_size + files[1].byte_size, "summary byte size mismatch");
}

function validateValidationHelper(): void {
  const bundle = buildBundle();
  const result = validateReplayIntelligenceExportBundle(bundle, GENERATED_AT);
  assertEqual(result.valid, true, "valid bundle should pass validation");
  assertEqual(result.mismatches.length, 0, "valid bundle should not produce mismatches");
  assertEqual(result.export_id, bundle.export_id, "validation export id mismatch");
  assertEqual(result.canonical_hash, bundle.canonical_hash, "validation canonical hash mismatch");

  const invalid = validateReplayIntelligenceExportBundle({
    ...bundle,
    canonical_hash: "invalid-canonical-hash",
  }, GENERATED_AT);
  assertEqual(invalid.valid, false, "invalid bundle should fail validation");
  assertIncludes(invalid.mismatches, "bundle canonical_hash mismatch", "invalid bundle mismatch missing");
}

function buildBundle() {
  return buildReplayIntelligenceExportBundle({
    generated_at: GENERATED_AT,
    replay_id: REPLAY_ID,
    archive_id: ARCHIVE_ID,
    intelligence_id: INTELLIGENCE_ID,
    lineage_id: LINEAGE_ID,
    snapshots: [packageA, packageB],
    files,
  });
}

function createFile(
  path: string,
  fileName: string,
  payload: Record<string, unknown>,
): ReplayIntelligenceExportFileEntry {
  const serialized = JSON.stringify(payload);

  return {
    path,
    file_name: fileName,
    content_type: "application/json",
    byte_size: Buffer.byteLength(serialized, "utf8"),
    canonical_hash: computeReplayIntelligenceCanonicalHash(payload),
  };
}

function createSnapshot(params: Pick<
  ReplayIntelligenceSnapshotContract,
  "snapshot_id" | "snapshot_kind" | "scope" | "scope_id" | "generated_at" | "deterministic_hash"
>): ReplayIntelligenceSnapshotContract {
  return {
    ...params,
    report_version: 1,
    forensic_metrics: {
      archive_count: 2,
      replay_count: 3,
      verified_count: 1,
      failed_count: 1,
      diverged_count: 1,
      mutation_count: 2,
      drift_count: 1,
      critical_mismatch_count: 1,
      total_bundle_size_bytes: 2048,
      deterministic_hash: `${params.snapshot_id}-forensic-metrics`,
    },
    drift_trends: {
      windows: [
        {
          window_id: "window-late",
          drift_count: 0,
          mismatch_count: 0,
          critical_mismatch_count: 0,
          equivalent_count: 1,
          affected_archive_ids: ["archive-beta"],
          mismatch_summaries: [],
          deterministic_hash: `${params.snapshot_id}-drift-late`,
        },
        {
          window_id: "window-early",
          drift_count: 1,
          mismatch_count: 2,
          critical_mismatch_count: 1,
          equivalent_count: 0,
          affected_archive_ids: ["archive-alpha"],
          mismatch_summaries: [{ category: "signal_mismatch", count: 1 }],
          deterministic_hash: `${params.snapshot_id}-drift-early`,
        },
      ],
      total_drift_count: 1,
      total_mismatch_count: 2,
      trend_direction: "decreasing",
      deterministic_hash: `${params.snapshot_id}-drift-trends`,
    },
    mutation_frequency: [
      {
        category: "settlement_mismatch",
        entity: "settlement",
        operation: "status_changed",
        mutation_count: 1,
        critical_count: 1,
        affected_archive_ids: ["archive-beta"],
        first_changed_at: "2026-04-01T00:00:01.000Z",
        last_changed_at: "2026-04-01T00:00:01.000Z",
        deterministic_hash: `${params.snapshot_id}-mutation-b`,
      },
      {
        category: "signal_mismatch",
        entity: "signal",
        operation: "updated",
        mutation_count: 1,
        critical_count: 0,
        affected_archive_ids: ["archive-alpha"],
        first_changed_at: "2026-04-01T00:00:00.000Z",
        last_changed_at: "2026-04-01T00:00:00.000Z",
        deterministic_hash: `${params.snapshot_id}-mutation-a`,
      },
    ],
    lineage_depth_metrics: {
      archive_count: 2,
      max_depth: 1,
      average_depth: 0.5,
      root_archive_count: 1,
      leaf_archive_count: 1,
      depth_histogram: [
        { depth: 1, archive_count: 1 },
        { depth: 0, archive_count: 1 },
      ],
      deterministic_hash: `${params.snapshot_id}-lineage-depth`,
    },
    ancestry_summaries: [
      {
        archive_id: "archive-beta",
        root_archive_id: "archive-alpha",
        complete: true,
        cycle_detected: false,
        ancestry_depth: 1,
        drift_summary_count: 1,
        deterministic_hash: `${params.snapshot_id}-ancestry-beta`,
      },
      {
        archive_id: "archive-alpha",
        root_archive_id: null,
        complete: true,
        cycle_detected: false,
        ancestry_depth: 0,
        drift_summary_count: 0,
        deterministic_hash: `${params.snapshot_id}-ancestry-alpha`,
      },
    ],
    evolution_scores: [
      {
        archive_id: "archive-beta",
        game_id: "game-export",
        replay_hash: "replay-beta",
        score: 20,
        band: "watch",
        drift_count: 1,
        mutation_count: 1,
        lineage_depth: 1,
        critical_mismatch_count: 0,
        deterministic_hash: `${params.snapshot_id}-evolution-beta`,
      },
      {
        archive_id: "archive-alpha",
        game_id: "game-export",
        replay_hash: "replay-alpha",
        score: 0,
        band: "stable",
        drift_count: 0,
        mutation_count: 0,
        lineage_depth: 0,
        critical_mismatch_count: 0,
        deterministic_hash: `${params.snapshot_id}-evolution-alpha`,
      },
    ],
    metadata: {
      fixture: "replay-intelligence-export-validation",
      nested: {
        z: 1,
        a: true,
      },
    },
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function assertIncludes<T>(values: readonly T[], expected: T, message: string): void {
  if (!values.includes(expected)) {
    throw new Error(`${message}. Values: ${values.join(", ")}`);
  }
}
