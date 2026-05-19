import fs from "node:fs";
import path from "node:path";
import express from "express";

const validationDir = path.resolve("C:/tmp/edgesetter-replay-intelligence-historical-export");
if (!validationDir.startsWith(path.resolve("C:/tmp"))) {
  throw new Error(`Refusing to use validation dir outside C:/tmp: ${validationDir}`);
}

fs.rmSync(validationDir, { recursive: true, force: true });
fs.mkdirSync(validationDir, { recursive: true });
process.env.PIPELINE_DATA_DIR = validationDir;

const ROOT_REPLAY = "export-root-replay";
const CHILD_REPLAY = "export-child-replay";
const LEAF_REPLAY = "export-leaf-replay";

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main(): Promise<void> {
  const store = await import("../pipeline/store");
  const auditStore = await import("../pipeline/replay-intelligence-audit-store");
  const convergenceStore = await import("../pipeline/replay-convergence-history-store");
  const historyStore = await import("../pipeline/replay-intelligence-history-store");
  const exportModule = await import("../pipeline/replay-intelligence-historical-export");
  const routesModule = await import("../pipeline/routes");

  store.getPipelineDb();
  auditStore.clearReplayIntelligenceAuditRows();
  convergenceStore.clearReplayConvergenceHistoryRows();
  historyStore.clearReplayIntelligenceHistoryLineageRows();
  seedReplayExportHistory(auditStore, convergenceStore, historyStore);

  const exports = exportModule.buildReplayIntelligenceHistoricalExports();
  const exportsAgain = exportModule.buildReplayIntelligenceHistoricalExports();
  assertEqual(exports.length, 3, "historical export count mismatch");
  assertEqual(
    exports.map((bundle) => bundle.export_hash).join("|"),
    exportsAgain.map((bundle) => bundle.export_hash).join("|"),
    "historical export hashes are not deterministic",
  );
  assertEqual(Object.isFrozen(exports), true, "historical exports list must be immutable");

  const childExport = assertExists(
    exports.find((bundle) => bundle.metadata.replay_hash === CHILD_REPLAY),
    "child historical export missing",
  );
  assertEqual(childExport.manifest.export_hash, childExport.export_hash, "manifest export hash mismatch");
  assertEqual(childExport.manifest.export_version, 1, "manifest version mismatch");
  assertEqual(childExport.manifest.artifact_hashes.length, childExport.manifest.artifact_count, "manifest artifact count mismatch");
  assertEqual(
    childExport.manifest.artifact_hashes.join("|"),
    [...childExport.manifest.artifact_hashes].sort((left, right) => left.localeCompare(right)).join("|"),
    "manifest artifact hashes are not canonical",
  );
  assertEqual(childExport.archive.timeline.timeline_hash, childExport.manifest.timeline_hash, "timeline bundle missing from export");
  assertEqual(childExport.archive.timeline.event_count, 10, "timeline bundle event count mismatch");
  assertEqual(childExport.archive.snapshot_group.group_hash, childExport.manifest.snapshot_group_hash, "snapshot group embedding mismatch");
  assertEqual(childExport.archive.convergence.total_replays, 12, "convergence embedding mismatch");
  assertEqual(childExport.archive.reducers.timeline.reducer_hash, childExport.manifest.reducer_hash, "timeline reducer embedding mismatch");
  assertEqual(childExport.archive.reducers.snapshots.length, 3, "snapshot reducer embedding mismatch");
  assertEqual(childExport.archive.lineage[CHILD_REPLAY], ROOT_REPLAY, "lineage embedding mismatch");
  assertEqual(Object.isFrozen(childExport), true, "historical export must be immutable");
  assertEqual(Object.isFrozen(childExport.metadata), true, "export metadata must be immutable");
  assertEqual(Object.isFrozen(childExport.archive.lineage), true, "export lineage must be immutable");
  assertEqual(childExport.verification.verified, true, "export verification failed");

  const manifest = assertExists(
    exportModule.buildReplayIntelligenceHistoricalExportManifest(childExport.export_hash),
    "manifest lookup failed",
  );
  assertEqual(manifest.manifest_hash, childExport.manifest.manifest_hash, "manifest lookup hash mismatch");

  const lineage = assertExists(
    exportModule.buildReplayIntelligenceHistoricalExportLineage(childExport.export_hash),
    "lineage lookup failed",
  );
  assertEqual(lineage.lineage[CHILD_REPLAY], ROOT_REPLAY, "lineage lookup parent mismatch");

  const verification = assertExists(
    exportModule.buildReplayIntelligenceHistoricalExportVerification(childExport.export_hash),
    "verification lookup failed",
  );
  assertEqual(verification.verification_hash, childExport.verification.verification_hash, "verification hash mismatch");
  assertEqual(verification.verified, true, "verification lookup integrity mismatch");

  const summary = exportModule.buildReplayIntelligenceHistoricalExportSummary();
  assertEqual(summary.export_count, 3, "export summary count mismatch");
  assertEqual(summary.verified_count, 3, "export summary verified count mismatch");

  const app = express();
  routesModule.registerPipelineRoutes(app);
  validateRouteContracts(app);

  const listResponse = await invokeGet<any>(app, "/api/replay-intelligence/exports", {
    params: {},
    query: { request_id: "export-list-validation" },
  });
  assertEqual(listResponse.statusCode, 200, "export list status mismatch");
  assertEqual(listResponse.body.data.count, 3, "export list count mismatch");

  const summaryResponse = await invokeGet<any>(app, "/api/replay-intelligence/exports/summary", {
    params: {},
    query: { request_id: "export-summary-validation" },
  });
  assertEqual(summaryResponse.statusCode, 200, "export summary status mismatch");
  assertEqual(summaryResponse.body.data.verified_count, 3, "export summary route verified mismatch");

  const lookupResponse = await invokeGet<any>(app, "/api/replay-intelligence/exports/:exportHash", {
    params: { exportHash: childExport.export_hash },
    query: { request_id: "export-lookup-validation" },
  });
  assertEqual(lookupResponse.statusCode, 200, "export lookup status mismatch");
  assertEqual(lookupResponse.body.data.export_hash, childExport.export_hash, "export lookup hash mismatch");

  const downloadResponse = await invokeGet<any>(app, "/api/replay-intelligence/exports/:exportHash/download", {
    params: { exportHash: childExport.export_hash },
    query: { request_id: "export-download-validation" },
  });
  assertEqual(downloadResponse.statusCode, 200, "export download status mismatch");
  assertEqual(downloadResponse.body.data.content_type, "application/json", "export download content type mismatch");
  assertEqual(downloadResponse.body.data.bundle.archive.timeline.timeline_hash, childExport.archive.timeline.timeline_hash, "export download timeline mismatch");

  const manifestResponse = await invokeGet<any>(app, "/api/replay-intelligence/exports/:exportHash/manifest", {
    params: { exportHash: childExport.export_hash },
    query: { request_id: "export-manifest-validation" },
  });
  assertEqual(manifestResponse.statusCode, 200, "export manifest status mismatch");
  assertEqual(manifestResponse.body.data.manifest_hash, childExport.manifest.manifest_hash, "export manifest route hash mismatch");

  const lineageResponse = await invokeGet<any>(app, "/api/replay-intelligence/exports/:exportHash/lineage", {
    params: { exportHash: childExport.export_hash },
    query: { request_id: "export-lineage-validation" },
  });
  assertEqual(lineageResponse.statusCode, 200, "export lineage status mismatch");
  assertEqual(lineageResponse.body.data.lineage[CHILD_REPLAY], ROOT_REPLAY, "export lineage route mismatch");

  const verificationResponse = await invokeGet<any>(app, "/api/replay-intelligence/exports/:exportHash/verification", {
    params: { exportHash: childExport.export_hash },
    query: { request_id: "export-verification-validation" },
  });
  assertEqual(verificationResponse.statusCode, 200, "export verification status mismatch");
  assertEqual(verificationResponse.body.data.verified, true, "export verification route mismatch");

  const missing = await invokeGet<any>(app, "/api/replay-intelligence/exports/:exportHash", {
    params: { exportHash: "missing-export-hash" },
    query: { request_id: "export-missing-validation" },
  });
  assertEqual(missing.statusCode, 404, "missing export status mismatch");
  assertEqual(missing.body.status, "empty", "missing export envelope mismatch");
  assertEqual(missing.body.errors[0].code, "not_found", "missing export error mismatch");

  assertEqual(auditStore.listReplayIntelligenceAuditRows().length, 4, "export APIs must not mutate audit rows");
  assertEqual(convergenceStore.listReplayConvergenceHistoryRows().length, 5, "export APIs must not mutate convergence rows");

  console.log("Replay intelligence historical export validation passed.");
  console.log(JSON.stringify({
    validation_db: path.join(validationDir, "pipeline.db"),
    routes_validated: getRegisteredRoutes(app).filter(route =>
      route.startsWith("/api/replay-intelligence/exports"),
    ),
    export_count: exports.length,
    child_export_hash: childExport.export_hash,
    child_manifest_hash: childExport.manifest.manifest_hash,
    child_archive_hash: childExport.archive.archive_hash,
    child_artifact_count: childExport.manifest.artifact_count,
    child_timeline_hash: childExport.archive.timeline.timeline_hash,
    child_verification_hash: childExport.verification.verification_hash,
    immutable_outputs: {
      export_bundle: Object.isFrozen(childExport),
      metadata: Object.isFrozen(childExport.metadata),
      lineage: Object.isFrozen(childExport.archive.lineage),
      manifest: Object.isFrozen(childExport.manifest),
    },
  }, null, 2));
}

function seedReplayExportHistory(
  auditStore: typeof import("../pipeline/replay-intelligence-audit-store"),
  convergenceStore: typeof import("../pipeline/replay-convergence-history-store"),
  historyStore: typeof import("../pipeline/replay-intelligence-history-store"),
): void {
  auditStore.insertReplayIntelligenceAuditRow({
    replay_id: ROOT_REPLAY,
    generated_at: "2026-05-18T00:00:00.000Z",
    analytics_hash: "analytics_root",
    convergence_hash: "convergence_root",
    route_group_count: 6,
    validation_status: "passed",
  });
  auditStore.insertReplayIntelligenceAuditRow({
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:05:00.000Z",
    analytics_hash: "analytics_child_001",
    convergence_hash: "convergence_child_001",
    route_group_count: 6,
    validation_status: "warning",
  });
  auditStore.insertReplayIntelligenceAuditRow({
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:15:00.000Z",
    analytics_hash: "analytics_child_002",
    convergence_hash: "convergence_child_003",
    route_group_count: 7,
    validation_status: "failed",
  });
  auditStore.insertReplayIntelligenceAuditRow({
    replay_id: LEAF_REPLAY,
    generated_at: "2026-05-18T00:20:00.000Z",
    analytics_hash: "analytics_leaf",
    convergence_hash: "convergence_leaf",
    route_group_count: 7,
    validation_status: "passed",
  });

  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "export-convergence-root",
    replay_id: ROOT_REPLAY,
    generated_at: "2026-05-18T00:00:00.000Z",
    convergence_score: 84,
    instability_score: 3,
    stability_index: 81,
    replay_count: 2,
    convergence_hash: "convergence_root",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "export-convergence-child-001",
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:05:00.000Z",
    convergence_score: 85,
    instability_score: 4,
    stability_index: 81,
    replay_count: 3,
    convergence_hash: "convergence_child_001",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "export-convergence-child-002",
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:10:00.000Z",
    convergence_score: 90,
    instability_score: 2,
    stability_index: 88,
    replay_count: 4,
    convergence_hash: "convergence_child_002",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "export-convergence-child-003",
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:15:00.000Z",
    convergence_score: 95,
    instability_score: 1,
    stability_index: 94,
    replay_count: 5,
    convergence_hash: "convergence_child_003",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "export-convergence-leaf",
    replay_id: LEAF_REPLAY,
    generated_at: "2026-05-18T00:20:00.000Z",
    convergence_score: 91,
    instability_score: 1,
    stability_index: 90,
    replay_count: 2,
    convergence_hash: "convergence_leaf",
  });

  historyStore.insertReplayIntelligenceHistoryLineageRow({
    replay_hash: ROOT_REPLAY,
    parent_replay_hash: null,
    generated_at: "2026-05-18T00:00:00.000Z",
  });
  historyStore.insertReplayIntelligenceHistoryLineageRow({
    replay_hash: CHILD_REPLAY,
    parent_replay_hash: ROOT_REPLAY,
    generated_at: "2026-05-18T00:05:00.000Z",
  });
  historyStore.insertReplayIntelligenceHistoryLineageRow({
    replay_hash: LEAF_REPLAY,
    parent_replay_hash: CHILD_REPLAY,
    generated_at: "2026-05-18T00:20:00.000Z",
  });
}

function validateRouteContracts(app: express.Express): void {
  const routes = getRegisteredRoutes(app);
  const requiredRoutes = [
    "/api/replay-intelligence/exports",
    "/api/replay-intelligence/exports/summary",
    "/api/replay-intelligence/exports/:exportHash",
    "/api/replay-intelligence/exports/:exportHash/download",
    "/api/replay-intelligence/exports/:exportHash/manifest",
    "/api/replay-intelligence/exports/:exportHash/lineage",
    "/api/replay-intelligence/exports/:exportHash/verification",
  ];

  for (const route of requiredRoutes) {
    assertIncludes(routes, route, `missing replay intelligence export route: ${route}`);
  }

  assertEqual(
    routes.indexOf("/api/replay-intelligence/exports/summary") <
      routes.indexOf("/api/replay-intelligence/exports/:exportHash"),
    true,
    "export summary route must be registered before export hash route",
  );
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

async function invokeGet<TBody>(
  app: express.Express,
  routePath: string,
  request: {
    params: Record<string, string>;
    query: Record<string, string>;
  },
): Promise<{ statusCode: number; body: TBody }> {
  const stack = ((app as any).router?.stack ?? []) as any[];
  const layer = stack.find(item => item.route?.path === routePath && item.route?.methods?.get);
  if (!layer) {
    throw new Error(`Route not registered for validation: ${routePath}`);
  }

  const handler = layer.route.stack.find((item: any) => item.method === "get")?.handle;
  if (!handler) {
    throw new Error(`GET handler missing for validation route: ${routePath}`);
  }

  let statusCode = 200;
  let body: TBody | null = null;
  const req = {
    params: request.params,
    query: request.query,
    headers: {},
    body: {},
  };
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(payload: TBody) {
      body = payload;
      return res;
    },
  };

  await Promise.resolve(handler(req, res));
  if (body === null) {
    throw new Error(`Route did not produce a JSON body: ${routePath}`);
  }

  return { statusCode, body };
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
