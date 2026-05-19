import fs from "node:fs";
import path from "node:path";
import express from "express";

const validationDir = path.resolve("C:/tmp/edgesetter-replay-intelligence-convergence-persistence");
if (!validationDir.startsWith(path.resolve("C:/tmp"))) {
  throw new Error(`Refusing to use validation dir outside C:/tmp: ${validationDir}`);
}

fs.rmSync(validationDir, { recursive: true, force: true });
fs.mkdirSync(validationDir, { recursive: true });
process.env.PIPELINE_DATA_DIR = validationDir;

const ROOT_REPLAY = "convergence-root-replay";
const CHILD_REPLAY = "convergence-child-replay";
const LEAF_REPLAY = "convergence-leaf-replay";

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main(): Promise<void> {
  const store = await import("../pipeline/store");
  const auditStore = await import("../pipeline/replay-intelligence-audit-store");
  const convergenceStore = await import("../pipeline/replay-convergence-history-store");
  const historyStore = await import("../pipeline/replay-intelligence-history-store");
  const convergencePersistence = await import("../pipeline/replay-intelligence-convergence-persistence");
  const routesModule = await import("../pipeline/routes");

  store.getPipelineDb();
  auditStore.clearReplayIntelligenceAuditRows();
  convergenceStore.clearReplayConvergenceHistoryRows();
  historyStore.clearReplayIntelligenceHistoryLineageRows();
  seedReplayConvergencePersistenceHistory(auditStore, convergenceStore, historyStore);

  const records = convergencePersistence.listReplayIntelligenceConvergencePersistenceRecords();
  const recordsAgain = convergencePersistence.listReplayIntelligenceConvergencePersistenceRecords();
  assertEqual(records.length, 5, "convergence persistence record count mismatch");
  assertEqual(
    records.map((record) => record.convergence_hash).join("|"),
    recordsAgain.map((record) => record.convergence_hash).join("|"),
    "deterministic convergence hashes mismatch",
  );
  assertEqual(Object.isFrozen(records), true, "convergence persistence list must be immutable");

  const childLatest = assertExists(
    records.find((record) => record.replay_hash === CHILD_REPLAY && record.sequence === 2),
    "latest child convergence persistence record missing",
  );
  assertEqual(childLatest.longitudinal.record_count, 3, "longitudinal record count mismatch");
  assertEqual(childLatest.reconstruction.source_convergence_hashes.join(","), "child-source-001,child-source-002,child-source-003", "reconstruction source ordering mismatch");
  assertEqual(childLatest.drift.drift_count, 2, "drift accumulation count mismatch");
  assertEqual(childLatest.drift.total_stability_delta, 8, "drift stability accumulation mismatch");
  assertEqual(childLatest.stability.current_stability_index, 89, "stability current index mismatch");
  assertEqual(childLatest.stability.previous_stability_index, 83, "stability previous index mismatch");
  assertEqual(childLatest.stability.stability_delta, 6, "stability evolution delta mismatch");
  assertEqual(childLatest.reducer.input_count, 3, "reducer persistence input count mismatch");
  assertEqual(childLatest.reducer.reduced.total_replays, 12, "reducer persistence total replay count mismatch");
  assertEqual(childLatest.anomalies.anomaly_count, 2, "anomaly accumulation mismatch");
  assertEqual(childLatest.lineage.parent_replay_hash, ROOT_REPLAY, "lineage parent mismatch");
  assertEqual(childLatest.lineage.children.join(","), LEAF_REPLAY, "lineage children mismatch");
  assertEqual(childLatest.lineage.lineage_depth, 1, "lineage depth mismatch");
  assertEqual(Object.isFrozen(childLatest), true, "convergence persistence record must be immutable");
  assertEqual(Object.isFrozen(childLatest.drift.events), true, "drift events must be immutable");
  assertEqual(Object.isFrozen(childLatest.lineage.lineage), true, "lineage map must be immutable");

  const reconstructed = assertExists(
    convergencePersistence.getReplayIntelligenceConvergencePersistenceByHash(childLatest.convergence_hash),
    "convergence persistence reconstruction lookup failed",
  );
  assertEqual(reconstructed.reconstruction.reconstruction_hash, childLatest.reconstruction.reconstruction_hash, "deterministic convergence reconstruction mismatch");

  const sourceLookup = assertExists(
    convergencePersistence.getReplayIntelligenceConvergencePersistenceByHash("child-source-003"),
    "source convergence hash lookup failed",
  );
  assertEqual(sourceLookup.convergence_hash, childLatest.convergence_hash, "source convergence hash should resolve latest child record");

  const history = assertExists(
    convergencePersistence.buildReplayIntelligenceConvergencePersistenceHistory(childLatest.convergence_hash),
    "convergence persistence history missing",
  );
  assertEqual(history.count, 3, "longitudinal convergence reconstruction history count mismatch");

  const stability = assertExists(
    convergencePersistence.buildReplayIntelligenceConvergencePersistenceStability(childLatest.convergence_hash),
    "convergence persistence stability missing",
  );
  const stabilityAgain = assertExists(
    convergencePersistence.buildReplayIntelligenceConvergencePersistenceStability(childLatest.convergence_hash),
    "second convergence persistence stability missing",
  );
  assertEqual(stability.deterministic_hash, stabilityAgain.deterministic_hash, "stability API determinism mismatch");

  const drift = assertExists(
    convergencePersistence.buildReplayIntelligenceConvergencePersistenceDrift(childLatest.convergence_hash),
    "convergence persistence drift missing",
  );
  assertEqual(drift.drift.fields.join(","), "convergence_hash,convergence_score,instability_score,replay_count,stability_index", "drift field accumulation mismatch");

  const lineage = assertExists(
    convergencePersistence.buildReplayIntelligenceConvergencePersistenceLineage(childLatest.convergence_hash),
    "convergence persistence lineage missing",
  );
  assertEqual(lineage.lineage.lineage[CHILD_REPLAY], ROOT_REPLAY, "lineage persistence map mismatch");

  const summary = convergencePersistence.buildReplayIntelligenceConvergencePersistenceSummary();
  assertEqual(summary.convergence_count, 5, "convergence persistence summary count mismatch");
  assertEqual(summary.replay_count, 3, "convergence persistence summary replay count mismatch");

  const app = express();
  routesModule.registerPipelineRoutes(app);
  validateRouteContracts(app);

  const listResponse = await invokeGet<any>(app, "/api/replay-intelligence/convergence", {
    params: {},
    query: { request_id: "convergence-persistence-list-validation" },
  });
  assertEqual(listResponse.statusCode, 200, "convergence list route status mismatch");
  assertEqual(listResponse.body.data.total_count, 5, "convergence list route count mismatch");

  const summaryResponse = await invokeGet<any>(app, "/api/replay-intelligence/convergence/summary", {
    params: {},
    query: { request_id: "convergence-persistence-summary-validation" },
  });
  assertEqual(summaryResponse.statusCode, 200, "convergence summary route status mismatch");
  assertEqual(summaryResponse.body.data.convergence_count, 5, "convergence summary route count mismatch");

  const lookupResponse = await invokeGet<any>(app, "/api/replay-intelligence/convergence/:convergenceHash", {
    params: { convergenceHash: childLatest.convergence_hash },
    query: { request_id: "convergence-persistence-lookup-validation" },
  });
  assertEqual(lookupResponse.statusCode, 200, "convergence lookup route status mismatch");
  assertEqual(lookupResponse.body.data.convergence_hash, childLatest.convergence_hash, "convergence lookup route hash mismatch");

  const historyResponse = await invokeGet<any>(app, "/api/replay-intelligence/convergence/:convergenceHash/history", {
    params: { convergenceHash: childLatest.convergence_hash },
    query: { request_id: "convergence-persistence-history-validation" },
  });
  assertEqual(historyResponse.statusCode, 200, "convergence history route status mismatch");
  assertEqual(historyResponse.body.data.count, 3, "convergence history route count mismatch");

  const stabilityResponse = await invokeGet<any>(app, "/api/replay-intelligence/convergence/:convergenceHash/stability", {
    params: { convergenceHash: childLatest.convergence_hash },
    query: { request_id: "convergence-persistence-stability-validation" },
  });
  assertEqual(stabilityResponse.statusCode, 200, "convergence stability route status mismatch");
  assertEqual(stabilityResponse.body.data.stability.current_stability_index, 89, "convergence stability route mismatch");

  const driftResponse = await invokeGet<any>(app, "/api/replay-intelligence/convergence/:convergenceHash/drift", {
    params: { convergenceHash: childLatest.convergence_hash },
    query: { request_id: "convergence-persistence-drift-validation" },
  });
  assertEqual(driftResponse.statusCode, 200, "convergence drift route status mismatch");
  assertEqual(driftResponse.body.data.drift.drift_count, 2, "convergence drift route mismatch");

  const lineageResponse = await invokeGet<any>(app, "/api/replay-intelligence/convergence/:convergenceHash/lineage", {
    params: { convergenceHash: childLatest.convergence_hash },
    query: { request_id: "convergence-persistence-lineage-validation" },
  });
  assertEqual(lineageResponse.statusCode, 200, "convergence lineage route status mismatch");
  assertEqual(lineageResponse.body.data.lineage.parent_replay_hash, ROOT_REPLAY, "convergence lineage route mismatch");

  const missing = await invokeGet<any>(app, "/api/replay-intelligence/convergence/:convergenceHash", {
    params: { convergenceHash: "missing-convergence-hash" },
    query: { request_id: "convergence-persistence-missing-validation" },
  });
  assertEqual(missing.statusCode, 404, "missing convergence status mismatch");
  assertEqual(missing.body.status, "empty", "missing convergence envelope mismatch");
  assertEqual(missing.body.errors[0].code, "not_found", "missing convergence error mismatch");

  assertEqual(convergenceStore.listReplayConvergenceHistoryRows().length, 5, "convergence APIs must not mutate convergence rows");
  assertEqual(auditStore.listReplayIntelligenceAuditRows().length, 4, "convergence APIs must not mutate audit rows");
  assertEqual(historyStore.listReplayIntelligenceHistoryLineageRows().length, 3, "convergence APIs must not mutate lineage rows");

  console.log("Replay intelligence convergence persistence validation passed.");
  console.log(JSON.stringify({
    validation_db: path.join(validationDir, "pipeline.db"),
    routes_validated: getRegisteredRoutes(app).filter(route =>
      route.startsWith("/api/replay-intelligence/convergence"),
    ),
    convergence_count: records.length,
    child_convergence_hash: childLatest.convergence_hash,
    child_reconstruction_hash: childLatest.reconstruction.reconstruction_hash,
    child_reducer_hash: childLatest.reducer.reducer_hash,
    child_stability_hash: childLatest.stability.stability_hash,
    child_drift_hash: childLatest.drift.drift_hash,
    child_lineage_hash: childLatest.lineage.lineage_hash,
    immutable_outputs: {
      records: Object.isFrozen(records),
      child_record: Object.isFrozen(childLatest),
      drift_events: Object.isFrozen(childLatest.drift.events),
      lineage: Object.isFrozen(childLatest.lineage.lineage),
    },
  }, null, 2));
}

function seedReplayConvergencePersistenceHistory(
  auditStore: typeof import("../pipeline/replay-intelligence-audit-store"),
  convergenceStore: typeof import("../pipeline/replay-convergence-history-store"),
  historyStore: typeof import("../pipeline/replay-intelligence-history-store"),
): void {
  auditStore.insertReplayIntelligenceAuditRow({
    replay_id: ROOT_REPLAY,
    generated_at: "2026-05-18T00:00:00.000Z",
    analytics_hash: "root-analytics",
    convergence_hash: "root-source-001",
    route_group_count: 6,
    validation_status: "passed",
  });
  auditStore.insertReplayIntelligenceAuditRow({
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:05:00.000Z",
    analytics_hash: "child-analytics-001",
    convergence_hash: "child-source-001",
    route_group_count: 6,
    validation_status: "warning",
  });
  auditStore.insertReplayIntelligenceAuditRow({
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:15:00.000Z",
    analytics_hash: "child-analytics-003",
    convergence_hash: "child-source-003",
    route_group_count: 8,
    validation_status: "failed",
  });
  auditStore.insertReplayIntelligenceAuditRow({
    replay_id: LEAF_REPLAY,
    generated_at: "2026-05-18T00:20:00.000Z",
    analytics_hash: "leaf-analytics",
    convergence_hash: "leaf-source-001",
    route_group_count: 7,
    validation_status: "passed",
  });

  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "convergence-root-001",
    replay_id: ROOT_REPLAY,
    generated_at: "2026-05-18T00:00:00.000Z",
    convergence_score: 86,
    instability_score: 3,
    stability_index: 83,
    replay_count: 2,
    convergence_hash: "root-source-001",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "convergence-child-001",
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:05:00.000Z",
    convergence_score: 85,
    instability_score: 4,
    stability_index: 81,
    replay_count: 3,
    convergence_hash: "child-source-001",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "convergence-child-002",
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:10:00.000Z",
    convergence_score: 88,
    instability_score: 5,
    stability_index: 83,
    replay_count: 4,
    convergence_hash: "child-source-002",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "convergence-child-003",
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:15:00.000Z",
    convergence_score: 92,
    instability_score: 3,
    stability_index: 89,
    replay_count: 5,
    convergence_hash: "child-source-003",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "convergence-leaf-001",
    replay_id: LEAF_REPLAY,
    generated_at: "2026-05-18T00:20:00.000Z",
    convergence_score: 94,
    instability_score: 2,
    stability_index: 92,
    replay_count: 2,
    convergence_hash: "leaf-source-001",
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
    "/api/replay-intelligence/convergence",
    "/api/replay-intelligence/convergence/summary",
    "/api/replay-intelligence/convergence/:convergenceHash",
    "/api/replay-intelligence/convergence/:convergenceHash/history",
    "/api/replay-intelligence/convergence/:convergenceHash/stability",
    "/api/replay-intelligence/convergence/:convergenceHash/drift",
    "/api/replay-intelligence/convergence/:convergenceHash/lineage",
  ];

  for (const route of requiredRoutes) {
    assertIncludes(routes, route, `missing replay intelligence convergence persistence route: ${route}`);
  }

  assertEqual(
    routes.indexOf("/api/replay-intelligence/convergence/summary") <
      routes.indexOf("/api/replay-intelligence/convergence/:convergenceHash"),
    true,
    "convergence summary route must be registered before convergence hash route",
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
