import fs from "node:fs";
import path from "node:path";
import express from "express";

const validationDir = path.resolve("C:/tmp/edgesetter-replay-intelligence-aggregation");
if (!validationDir.startsWith(path.resolve("C:/tmp"))) {
  throw new Error(`Refusing to use validation dir outside C:/tmp: ${validationDir}`);
}

fs.rmSync(validationDir, { recursive: true, force: true });
fs.mkdirSync(validationDir, { recursive: true });
process.env.PIPELINE_DATA_DIR = validationDir;

const ROOT_REPLAY = "aggregation-root-replay";
const CHILD_REPLAY = "aggregation-child-replay";
const LEAF_REPLAY = "aggregation-leaf-replay";

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main(): Promise<void> {
  const store = await import("../pipeline/store");
  const auditStore = await import("../pipeline/replay-intelligence-audit-store");
  const convergenceStore = await import("../pipeline/replay-convergence-history-store");
  const historyStore = await import("../pipeline/replay-intelligence-history-store");
  const aggregationModule = await import("../pipeline/replay-intelligence-aggregation");
  const routesModule = await import("../pipeline/routes");

  store.getPipelineDb();
  auditStore.clearReplayIntelligenceAuditRows();
  convergenceStore.clearReplayConvergenceHistoryRows();
  historyStore.clearReplayIntelligenceHistoryLineageRows();
  seedReplayAggregationHistory(auditStore, convergenceStore, historyStore);

  const aggregations = aggregationModule.buildReplayIntelligenceAggregations();
  const aggregationsAgain = aggregationModule.buildReplayIntelligenceAggregations();
  assertEqual(aggregations.length, 3, "aggregation count mismatch");
  assertEqual(
    aggregations.map((item) => item.aggregation_hash).join("|"),
    aggregationsAgain.map((item) => item.aggregation_hash).join("|"),
    "aggregation hashes are not deterministic",
  );
  assertEqual(Object.isFrozen(aggregations), true, "aggregation list must be immutable");

  const childAggregation = assertExists(
    aggregations.find((item) => item.replay_hash === CHILD_REPLAY),
    "child aggregation missing",
  );
  assertEqual(childAggregation.convergence_accumulation.total_replays, 12, "convergence accumulation mismatch");
  assertEqual(childAggregation.convergence_accumulation.average_convergence_score, 90, "convergence average mismatch");
  assertEqual(childAggregation.mutation_aggregation.changed_field_count, 4, "mutation aggregation mismatch");
  assertEqual(childAggregation.folded_lineage.lineage[CHILD_REPLAY], ROOT_REPLAY, "lineage folding mismatch");
  assertEqual(childAggregation.folded_lineage.lineage_depth, 2, "lineage depth mismatch");
  assertEqual(childAggregation.stability.stability_score, 77.66666666666667, "stability score mismatch");
  assertEqual(childAggregation.stability.stability_band, "unstable", "stability band mismatch");
  assertEqual(childAggregation.reducers.reducer_hashes.length, 4, "reducer composition count mismatch");
  assertEqual(childAggregation.reducers.consensus_ready, false, "consensus readiness mismatch");
  assertEqual(Object.isFrozen(childAggregation), true, "aggregation output must be immutable");
  assertEqual(Object.isFrozen(childAggregation.reducers), true, "aggregation reducers must be immutable");
  assertEqual(Object.isFrozen(childAggregation.folded_lineage.lineage), true, "folded lineage must be immutable");

  const reconstructed = assertExists(
    aggregationModule.getReplayIntelligenceAggregationByHash(childAggregation.aggregation_hash),
    "aggregation reconstruction failed",
  );
  assertEqual(reconstructed.reproducibility_hash, childAggregation.reproducibility_hash, "reproducibility hash mismatch");
  assertEqual(reconstructed.aggregation_hash, childAggregation.aggregation_hash, "aggregation reconstruction hash mismatch");

  const reducers = assertExists(
    aggregationModule.buildReplayIntelligenceAggregationReducers(childAggregation.aggregation_hash),
    "aggregation reducers lookup failed",
  );
  const reducersAgain = assertExists(
    aggregationModule.buildReplayIntelligenceAggregationReducers(childAggregation.aggregation_hash),
    "second aggregation reducers lookup failed",
  );
  assertEqual(reducers.reducers.composition_hash, reducersAgain.reducers.composition_hash, "reducer determinism mismatch");

  const summary = aggregationModule.buildReplayIntelligenceAggregationSummary();
  assertEqual(summary.aggregation_count, 3, "aggregation summary count mismatch");
  assertEqual(summary.convergence.total_replays, 16, "aggregation summary convergence mismatch");

  const app = express();
  routesModule.registerPipelineRoutes(app);
  validateRouteContracts(app);

  const listResponse = await invokeGet<any>(app, "/api/replay-intelligence/aggregation", {
    params: {},
    query: { request_id: "aggregation-list-validation" },
  });
  assertEqual(listResponse.statusCode, 200, "aggregation list status mismatch");
  assertEqual(listResponse.body.data.count, 3, "aggregation list count mismatch");

  const summaryResponse = await invokeGet<any>(app, "/api/replay-intelligence/aggregation/summary", {
    params: {},
    query: { request_id: "aggregation-summary-validation" },
  });
  assertEqual(summaryResponse.statusCode, 200, "aggregation summary status mismatch");
  assertEqual(summaryResponse.body.data.aggregation_count, 3, "aggregation summary route count mismatch");

  const lookupResponse = await invokeGet<any>(app, "/api/replay-intelligence/aggregation/:aggregationHash", {
    params: { aggregationHash: childAggregation.aggregation_hash },
    query: { request_id: "aggregation-lookup-validation" },
  });
  assertEqual(lookupResponse.statusCode, 200, "aggregation lookup status mismatch");
  assertEqual(lookupResponse.body.data.aggregation_hash, childAggregation.aggregation_hash, "aggregation lookup hash mismatch");

  const reducersResponse = await invokeGet<any>(app, "/api/replay-intelligence/aggregation/:aggregationHash/reducers", {
    params: { aggregationHash: childAggregation.aggregation_hash },
    query: { request_id: "aggregation-reducers-validation" },
  });
  assertEqual(reducersResponse.statusCode, 200, "aggregation reducers route status mismatch");
  assertEqual(reducersResponse.body.data.reducers.composition_hash, childAggregation.reducers.composition_hash, "aggregation reducers route mismatch");

  const convergenceResponse = await invokeGet<any>(app, "/api/replay-intelligence/aggregation/:aggregationHash/convergence", {
    params: { aggregationHash: childAggregation.aggregation_hash },
    query: { request_id: "aggregation-convergence-validation" },
  });
  assertEqual(convergenceResponse.statusCode, 200, "aggregation convergence route status mismatch");
  assertEqual(convergenceResponse.body.data.convergence.total_replays, 12, "aggregation convergence route mismatch");

  const stabilityResponse = await invokeGet<any>(app, "/api/replay-intelligence/aggregation/:aggregationHash/stability", {
    params: { aggregationHash: childAggregation.aggregation_hash },
    query: { request_id: "aggregation-stability-validation" },
  });
  assertEqual(stabilityResponse.statusCode, 200, "aggregation stability route status mismatch");
  assertEqual(stabilityResponse.body.data.stability.stability_score, 77.66666666666667, "aggregation stability route mismatch");

  const lineageResponse = await invokeGet<any>(app, "/api/replay-intelligence/aggregation/:aggregationHash/lineage", {
    params: { aggregationHash: childAggregation.aggregation_hash },
    query: { request_id: "aggregation-lineage-validation" },
  });
  assertEqual(lineageResponse.statusCode, 200, "aggregation lineage route status mismatch");
  assertEqual(lineageResponse.body.data.folded_lineage.lineage[CHILD_REPLAY], ROOT_REPLAY, "aggregation lineage route mismatch");

  const missing = await invokeGet<any>(app, "/api/replay-intelligence/aggregation/:aggregationHash", {
    params: { aggregationHash: "missing-aggregation-hash" },
    query: { request_id: "aggregation-missing-validation" },
  });
  assertEqual(missing.statusCode, 404, "missing aggregation status mismatch");
  assertEqual(missing.body.status, "empty", "missing aggregation envelope mismatch");
  assertEqual(missing.body.errors[0].code, "not_found", "missing aggregation error mismatch");

  assertEqual(auditStore.listReplayIntelligenceAuditRows().length, 4, "aggregation APIs must not mutate audit rows");
  assertEqual(convergenceStore.listReplayConvergenceHistoryRows().length, 5, "aggregation APIs must not mutate convergence rows");

  console.log("Replay intelligence aggregation validation passed.");
  console.log(JSON.stringify({
    validation_db: path.join(validationDir, "pipeline.db"),
    routes_validated: getRegisteredRoutes(app).filter(route =>
      route.startsWith("/api/replay-intelligence/aggregation"),
    ),
    aggregation_count: aggregations.length,
    child_aggregation_hash: childAggregation.aggregation_hash,
    child_reproducibility_hash: childAggregation.reproducibility_hash,
    child_convergence_total_replays: childAggregation.convergence_accumulation.total_replays,
    child_stability_score: childAggregation.stability.stability_score,
    child_reducer_composition_hash: childAggregation.reducers.composition_hash,
    immutable_outputs: {
      aggregations: Object.isFrozen(aggregations),
      child_aggregation: Object.isFrozen(childAggregation),
      reducers: Object.isFrozen(childAggregation.reducers),
      lineage: Object.isFrozen(childAggregation.folded_lineage.lineage),
    },
  }, null, 2));
}

function seedReplayAggregationHistory(
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
    id: "aggregation-convergence-root",
    replay_id: ROOT_REPLAY,
    generated_at: "2026-05-18T00:00:00.000Z",
    convergence_score: 84,
    instability_score: 3,
    stability_index: 81,
    replay_count: 2,
    convergence_hash: "convergence_root",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "aggregation-convergence-child-001",
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:05:00.000Z",
    convergence_score: 85,
    instability_score: 4,
    stability_index: 81,
    replay_count: 3,
    convergence_hash: "convergence_child_001",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "aggregation-convergence-child-002",
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:10:00.000Z",
    convergence_score: 90,
    instability_score: 2,
    stability_index: 88,
    replay_count: 4,
    convergence_hash: "convergence_child_002",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "aggregation-convergence-child-003",
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:15:00.000Z",
    convergence_score: 95,
    instability_score: 1,
    stability_index: 94,
    replay_count: 5,
    convergence_hash: "convergence_child_003",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "aggregation-convergence-leaf",
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
    "/api/replay-intelligence/aggregation",
    "/api/replay-intelligence/aggregation/summary",
    "/api/replay-intelligence/aggregation/:aggregationHash",
    "/api/replay-intelligence/aggregation/:aggregationHash/reducers",
    "/api/replay-intelligence/aggregation/:aggregationHash/convergence",
    "/api/replay-intelligence/aggregation/:aggregationHash/stability",
    "/api/replay-intelligence/aggregation/:aggregationHash/lineage",
  ];

  for (const route of requiredRoutes) {
    assertIncludes(routes, route, `missing replay intelligence aggregation route: ${route}`);
  }

  assertEqual(
    routes.indexOf("/api/replay-intelligence/aggregation/summary") <
      routes.indexOf("/api/replay-intelligence/aggregation/:aggregationHash"),
    true,
    "aggregation summary route must be registered before aggregation hash route",
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
