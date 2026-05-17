import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";

const validationDir = path.resolve("C:/tmp/edgesetter-replay-forensic-export-validation");
if (!validationDir.startsWith(path.resolve("C:/tmp"))) {
  throw new Error(`Refusing to use validation dir outside C:/tmp: ${validationDir}`);
}

fs.rmSync(validationDir, { recursive: true, force: true });
fs.mkdirSync(validationDir, { recursive: true });
process.env.PIPELINE_DATA_DIR = validationDir;

const GAME_ID = "forensic-validation-game-001";
const PARENT_HASH = "forensic-parent-replay-hash";
const CHILD_HASH = "forensic-child-replay-hash";
const GRANDCHILD_HASH = "forensic-grandchild-replay-hash";
const PARENT_CREATED_AT = "2026-02-01T00:00:00.000Z";
const CHILD_OLD_CREATED_AT = "2026-02-01T00:04:00.000Z";
const CHILD_CREATED_AT = "2026-02-01T00:05:00.000Z";
const GRANDCHILD_CREATED_AT = "2026-02-01T00:06:00.000Z";

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main(): Promise<void> {
  const store = await import("../pipeline/store");
  const exportModule = await import("../pipeline/replay-forensic-export");
  const reportModule = await import("../pipeline/replay-forensic-report");
  const routesModule = await import("../pipeline/routes");

  seedReplayAudits(store.getPipelineDb);

  const bundle = assertExists(
    exportModule.buildReplayAuditExportBundle(CHILD_HASH),
    "forensic audit export bundle generation failed",
  );
  const bundleAgain = assertExists(
    exportModule.buildReplayAuditExportBundle(CHILD_HASH),
    "second forensic audit export bundle generation failed",
  );
  assertEqual(stableStringify(bundleAgain), stableStringify(bundle), "audit export bundle is not byte-stable");
  assertEqual(bundle.metadata.generated_at, CHILD_CREATED_AT, "audit export generated_at should be persisted");
  assertEqual(bundle.verification_history.length, 2, "verification history should include deterministic fixture history");
  assertEqual(bundle.verification_history[0]?.created_at, CHILD_CREATED_AT, "verification history is not newest-first");

  const comparison = assertExists(
    exportModule.buildReplayComparisonReport(CHILD_HASH),
    "comparison report generation failed",
  );
  assertEqual(comparison.compared_against, PARENT_HASH, "comparison target mismatch");
  assertEqual(isSorted(comparison.mismatch_details.map(detail => `${detail.category}.${detail.field}`)), true, "mismatch details are not sorted");

  const confidenceExport = assertExists(
    exportModule.buildReplayConfidenceReport(CHILD_HASH),
    "confidence export generation failed",
  );
  assertEqual(confidenceExport.generated_at, CHILD_CREATED_AT, "confidence export timestamp mismatch");
  assertEqual(isSorted(confidenceExport.confidence_factors.map(factor => factor.factor)), true, "confidence factors are not sorted");

  const lineagePackage = assertExists(
    exportModule.buildLineageForensicPackage(CHILD_HASH),
    "lineage forensic package generation failed",
  );
  assertEqual(lineagePackage.root_replay_hash, CHILD_HASH, "lineage package root mismatch");
  assertEqual(lineagePackage.parent_chain.length, 1, "lineage package parent depth mismatch");
  assertEqual(lineagePackage.child_chain.length, 1, "lineage package child chain should include deterministic grandchild row");
  assertEqual(isSorted(lineagePackage.child_chain.map(row => `${row.created_at}.${row.id}`)), true, "lineage child chain is not stable sorted");

  const manifest = assertExists(
    exportModule.buildReplayArchivalManifest(CHILD_HASH),
    "archival manifest generation failed",
  );
  const manifestAgain = assertExists(
    exportModule.buildReplayArchivalManifest(CHILD_HASH),
    "second archival manifest generation failed",
  );
  assertEqual(stableStringify(manifestAgain), stableStringify(manifest), "archival manifest is not byte-stable");
  assertEqual(Boolean(manifest.integrity.content_hash), true, "manifest content hash missing");
  assertEqual(isSorted(manifest.artifacts.map(artifact => artifact.artifact_type)), true, "manifest artifacts are not sorted");

  const overview = assertExists(
    reportModule.buildReplayForensicOverview(CHILD_HASH),
    "forensic overview report generation failed",
  );
  const overviewAgain = assertExists(
    reportModule.buildReplayForensicOverview(CHILD_HASH),
    "second forensic overview report generation failed",
  );
  assertEqual(stableStringify(overviewAgain), stableStringify(overview), "forensic overview is not byte-stable");
  assertEqual(
    overview.summary_fingerprint,
    fingerprintWithout(overview, "summary_fingerprint"),
    "overview summary fingerprint mismatch",
  );

  const divergenceSummary = assertExists(
    reportModule.buildReplayDivergenceSummary(CHILD_HASH),
    "divergence summary generation failed",
  );
  assertEqual(divergenceSummary.divergence_detected, true, "divergence summary detection mismatch");
  assertEqual(isSorted(divergenceSummary.category_counts.map(item => item.category)), true, "divergence categories are not sorted");
  assertEqual(
    divergenceSummary.summary_fingerprint,
    fingerprintWithout(divergenceSummary, "summary_fingerprint"),
    "divergence summary fingerprint mismatch",
  );

  const integritySummary = assertExists(
    reportModule.buildReplayIntegritySummary(CHILD_HASH),
    "integrity summary generation failed",
  );
  assertEqual(integritySummary.replay_hash_present, true, "integrity summary replay hash indicator failed");
  assertEqual(integritySummary.timeline_hash_present, true, "integrity summary timeline hash indicator failed");
  assertEqual(integritySummary.signal_hash_present, true, "integrity summary signal hash indicator failed");
  assertEqual(integritySummary.snapshot_hash_present, true, "integrity summary snapshot hash indicator failed");

  const confidenceSummary = assertExists(
    reportModule.buildReplayConfidenceSummary(CHILD_HASH),
    "confidence summary generation failed",
  );
  assertEqual(confidenceSummary.confidence_direction, "reduced", "confidence summary direction mismatch");
  assertEqual(confidenceSummary.negative_factor_count > 0, true, "confidence summary should include negative factors");

  validateRouteContracts(routesModule.registerPipelineRoutes);

  console.log("Replay forensic export validation passed.");
  console.log(`Validation DB: ${path.join(validationDir, "pipeline.db")}`);
  console.log(`Overview fingerprint: ${overview.summary_fingerprint}`);
  console.log(`Manifest content hash: ${manifest.integrity.content_hash}`);
}

function seedReplayAudits(getPipelineDb: () => any): void {
  const db = getPipelineDb();
  const insert = db.prepare(`
    INSERT INTO replay_audits (
      id,
      game_id,
      as_of,
      replay_hash,
      timeline_hash,
      signal_hash,
      snapshot_hash,
      verification_status,
      divergence_count,
      divergence_summary_json,
      provenance_json,
      lineage_json,
      reconstruction_version,
      replay_version,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    "forensic-parent-audit",
    GAME_ID,
    PARENT_CREATED_AT,
    PARENT_HASH,
    "timeline-parent",
    "signal-parent",
    "snapshot-parent",
    "verified",
    0,
    "[]",
    stableStringify({
      replay_engine_version: "replay-engine-v1",
      reconstruction_timestamp: PARENT_CREATED_AT,
      snapshot_count: 2,
      signal_count: 1,
      average_confidence: 84,
      replay_source_metadata: {
        source: "forensic-validation.sqlite",
        game_id: GAME_ID,
        as_of: PARENT_CREATED_AT,
        latest_snapshot_id: "snapshot-parent",
      },
    }),
    stableStringify({
      parent_replay_hash: null,
      replay_generation_chain: ["load_snapshots", "load_signals", "persist_audit"],
      normalization_version: "normalization-v1",
    }),
    "reconstruction-v1",
    1,
    PARENT_CREATED_AT,
  );

  insert.run(
    "forensic-child-audit-old",
    GAME_ID,
    CHILD_OLD_CREATED_AT,
    CHILD_HASH,
    "timeline-child-old",
    "signal-child-old",
    "snapshot-child-old",
    "verified",
    0,
    "[]",
    stableStringify({
      replay_engine_version: "replay-engine-v1",
      reconstruction_timestamp: CHILD_OLD_CREATED_AT,
      snapshot_count: 2,
      signal_count: 1,
      average_confidence: 80,
      replay_source_metadata: {
        source: "forensic-validation.sqlite",
        game_id: GAME_ID,
        as_of: CHILD_OLD_CREATED_AT,
        latest_snapshot_id: "snapshot-child-old",
      },
    }),
    stableStringify({
      parent_replay_hash: PARENT_HASH,
      replay_generation_chain: ["load_snapshots", "load_signals", "persist_audit"],
      normalization_version: "normalization-v1",
    }),
    "reconstruction-v1",
    1,
    CHILD_OLD_CREATED_AT,
  );

  insert.run(
    "forensic-child-audit",
    GAME_ID,
    CHILD_CREATED_AT,
    CHILD_HASH,
    "timeline-child",
    "signal-child",
    "snapshot-child",
    "diverged",
    1,
    stableStringify([{ category: "validation", detail: "forensic mismatch" }]),
    stableStringify({
      replay_engine_version: "replay-engine-v1",
      reconstruction_timestamp: CHILD_CREATED_AT,
      snapshot_count: 3,
      signal_count: 2,
      average_confidence: 72,
      replay_source_metadata: {
        source: "forensic-validation.sqlite",
        game_id: GAME_ID,
        as_of: CHILD_CREATED_AT,
        latest_snapshot_id: "snapshot-child",
      },
    }),
    stableStringify({
      parent_replay_hash: PARENT_HASH,
      replay_generation_chain: ["load_snapshots", "load_signals", "persist_audit"],
      normalization_version: "normalization-v1",
    }),
    "reconstruction-v1",
    1,
    CHILD_CREATED_AT,
  );

  insert.run(
    "forensic-grandchild-audit",
    GAME_ID,
    GRANDCHILD_CREATED_AT,
    GRANDCHILD_HASH,
    "timeline-grandchild",
    "signal-grandchild",
    "snapshot-grandchild",
    "verified",
    0,
    "[]",
    stableStringify({
      replay_engine_version: "replay-engine-v1",
      reconstruction_timestamp: GRANDCHILD_CREATED_AT,
      snapshot_count: 3,
      signal_count: 2,
      average_confidence: 75,
      replay_source_metadata: {
        source: "forensic-validation.sqlite",
        game_id: GAME_ID,
        as_of: GRANDCHILD_CREATED_AT,
        latest_snapshot_id: "snapshot-grandchild",
      },
    }),
    stableStringify({
      parent_replay_hash: CHILD_HASH,
      replay_generation_chain: ["load_snapshots", "load_signals", "persist_audit"],
      normalization_version: "normalization-v1",
    }),
    "reconstruction-v1",
    1,
    GRANDCHILD_CREATED_AT,
  );
}

function validateRouteContracts(registerPipelineRoutes: (app: express.Express) => void): void {
  const app = express();
  registerPipelineRoutes(app);
  const routes = getRegisteredRoutes(app);
  const requiredRoutes = [
    "/api/replay/:gameId/forensic/export",
    "/api/replay/:gameId/forensic/report",
    "/api/replay/:gameId/forensic/lineage",
    "/api/replay/:gameId/forensic/confidence",
  ];

  for (const route of requiredRoutes) {
    assertIncludes(routes, route, `missing forensic route registration: ${route}`);
    assertEqual(
      routes.indexOf(route) < routes.indexOf("/api/replay/:gameId"),
      true,
      `${route} must be registered before generic replay route`,
    );
  }
}

function getRegisteredRoutes(app: express.Express): string[] {
  const stack = ((app as any).router?.stack ?? []) as Array<{
    route?: { path: string; methods: Record<string, boolean> };
  }>;

  return stack
    .filter(layer => layer.route?.methods?.get)
    .map(layer => layer.route?.path)
    .filter((route): route is string => typeof route === "string");
}

function assertExists<T>(value: T | null | undefined, message: string): T {
  if (value == null) {
    throw new Error(message);
  }
  return value;
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function assertIncludes<T>(values: T[], expected: T, message: string): void {
  if (!values.includes(expected)) {
    throw new Error(`${message}. Values: ${values.join(", ")}`);
  }
}

function isSorted(values: string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1].localeCompare(value) <= 0);
}

function fingerprintWithout(value: object, key: string): string {
  const { [key]: _removed, ...body } = value as Record<string, unknown>;
  return stableHash(body);
}

function stableHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(value))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
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
