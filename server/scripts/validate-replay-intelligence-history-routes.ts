import fs from "node:fs";
import path from "node:path";
import express from "express";

const validationDir = path.resolve("C:/tmp/edgesetter-replay-intelligence-history-routes");
if (!validationDir.startsWith(path.resolve("C:/tmp"))) {
  throw new Error(`Refusing to use validation dir outside C:/tmp: ${validationDir}`);
}

fs.rmSync(validationDir, { recursive: true, force: true });
fs.mkdirSync(validationDir, { recursive: true });
process.env.PIPELINE_DATA_DIR = validationDir;

const ROOT_REPLAY = "history-root-replay";
const CHILD_REPLAY = "history-child-replay";
const LEAF_REPLAY = "history-leaf-replay";

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main(): Promise<void> {
  const store = await import("../pipeline/store");
  const auditStore = await import("../pipeline/replay-intelligence-audit-store");
  const convergenceStore = await import("../pipeline/replay-convergence-history-store");
  const historyStore = await import("../pipeline/replay-intelligence-history-store");
  const routesModule = await import("../pipeline/routes");

  store.getPipelineDb();
  auditStore.clearReplayIntelligenceAuditRows();
  convergenceStore.clearReplayConvergenceHistoryRows();
  historyStore.clearReplayIntelligenceHistoryLineageRows();

  seedHistoricalRecords(auditStore, convergenceStore, historyStore);

  const app = express();
  routesModule.registerPipelineRoutes(app);
  validateRouteContracts(app);

  const list = await invokeGet<any>(app, "/api/replay-intelligence/history", {
    params: {},
    query: { limit: "20", request_id: "history-list-validation" },
  });
  assertEqual(list.statusCode, 200, "history list status mismatch");
  assertEqual(list.body.status, "ok", "history list envelope status mismatch");
  assertEqual(list.body.data.total_count, 5, "history snapshot total mismatch");
  assertEqual(list.body.data.snapshots[0].replay_hash, CHILD_REPLAY, "history list deterministic replay ordering mismatch");
  assertEqual(typeof list.body.data.snapshots[0].snapshot_hash, "string", "history snapshot hash missing");

  const summary = await invokeGet<any>(app, "/api/replay-intelligence/history/summary", {
    params: {},
    query: { request_id: "history-summary-validation" },
  });
  assertEqual(summary.statusCode, 200, "history summary status mismatch");
  assertEqual(summary.body.data.replay_count, 3, "history summary replay count mismatch");
  assertEqual(summary.body.data.snapshot_count, 5, "history summary snapshot count mismatch");
  assertEqual(summary.body.data.lineage_node_count, 3, "history summary lineage count mismatch");
  assertEqual(summary.body.data.convergence.total_replays, 16, "history summary convergence total mismatch");
  assertEqual(summary.body.data.convergence.average_convergence_score, 89, "history summary convergence average mismatch");

  const detail = await invokeGet<any>(app, "/api/replay-intelligence/history/:replayHash", {
    params: { replayHash: CHILD_REPLAY },
    query: { request_id: "history-detail-validation" },
  });
  assertEqual(detail.statusCode, 200, "history detail status mismatch");
  assertEqual(detail.body.data.replay_hash, CHILD_REPLAY, "history detail replay mismatch");
  assertEqual(detail.body.data.count, 3, "history detail snapshot count mismatch");
  assertEqual(detail.body.data.snapshots[0].generated_at, "2026-05-18T00:05:00.000Z", "history detail chronological order mismatch");
  assertEqual(detail.body.data.snapshots[2].reducer_ready.convergence_score, 95, "history reducer-ready snapshot mismatch");

  const convergence = await invokeGet<any>(app, "/api/replay-intelligence/history/:replayHash/convergence", {
    params: { replayHash: CHILD_REPLAY },
    query: { request_id: "history-convergence-validation" },
  });
  assertEqual(convergence.statusCode, 200, "history convergence status mismatch");
  assertEqual(convergence.body.data.count, 3, "history convergence count mismatch");
  assertEqual(convergence.body.data.summary.total_replays, 12, "history convergence total replay mismatch");
  assertEqual(convergence.body.data.aggregation.average_convergence_score, 90, "history convergence average mismatch");
  assertEqual(convergence.body.data.reducer_ready[2].replay_count, 5, "history convergence reducer input mismatch");

  const timeline = await invokeGet<any>(app, "/api/replay-intelligence/history/:replayHash/timeline", {
    params: { replayHash: CHILD_REPLAY },
    query: { request_id: "history-timeline-validation" },
  });
  assertEqual(timeline.statusCode, 200, "history timeline status mismatch");
  assertEqual(timeline.body.data.count, 5, "history timeline count mismatch");
  assertEqual(timeline.body.data.timeline[0].generated_at, "2026-05-18T00:05:00.000Z", "history timeline first timestamp mismatch");
  assertEqual(timeline.body.data.timeline[0].event_type, "audit", "history timeline stable event ordering mismatch");
  assertEqual(timeline.body.data.timeline[4].generated_at, "2026-05-18T00:15:00.000Z", "history timeline final timestamp mismatch");

  const diff = await invokeGet<any>(app, "/api/replay-intelligence/history/:replayHash/diff", {
    params: { replayHash: CHILD_REPLAY },
    query: { request_id: "history-diff-validation" },
  });
  assertEqual(diff.statusCode, 200, "history diff status mismatch");
  assertEqual(diff.body.data.total_diffs, 4, "history diff total mismatch");
  assertEqual(diff.body.data.changed_fields, 4, "history diff changed count mismatch");
  assertEqual(diff.body.data.diffs[1].field, "convergence_hash", "history diff field mismatch");
  assertEqual(typeof diff.body.data.deterministic_hash, "string", "history diff hash missing");

  const lineage = await invokeGet<any>(app, "/api/replay-intelligence/history/:replayHash/lineage", {
    params: { replayHash: ROOT_REPLAY },
    query: { request_id: "history-lineage-validation" },
  });
  assertEqual(lineage.statusCode, 200, "history lineage status mismatch");
  assertEqual(lineage.body.data.root_replay_hash, ROOT_REPLAY, "history lineage root mismatch");
  assertEqual(lineage.body.data.count, 3, "history lineage count mismatch");
  assertEqual(lineage.body.data.nodes[0].children[0], CHILD_REPLAY, "history lineage child mismatch");
  assertEqual(lineage.body.data.nodes[2].depth, 2, "history lineage depth mismatch");
  assertEqual(lineage.body.data.traversal.max_depth, 2, "history traversal max depth mismatch");

  const missing = await invokeGet<any>(app, "/api/replay-intelligence/history/:replayHash", {
    params: { replayHash: "missing-replay" },
    query: { request_id: "history-missing-validation" },
  });
  assertEqual(missing.statusCode, 404, "history missing status mismatch");
  assertEqual(missing.body.status, "empty", "history missing envelope mismatch");
  assertEqual(missing.body.errors[0].code, "not_found", "history missing code mismatch");

  assertEqual(
    auditStore.listReplayIntelligenceAuditRows().length,
    4,
    "history routes must not mutate audit rows",
  );
  assertEqual(
    convergenceStore.listReplayConvergenceHistoryRows().length,
    5,
    "history routes must not mutate convergence rows",
  );

  console.log("Replay intelligence history route validation passed.");
  console.log(JSON.stringify({
    validation_db: path.join(validationDir, "pipeline.db"),
    routes_validated: getRegisteredRoutes(app).filter(route =>
      route.startsWith("/api/replay-intelligence/history"),
    ),
    snapshot_count: list.body.data.total_count,
    summary: {
      replay_count: summary.body.data.replay_count,
      snapshot_count: summary.body.data.snapshot_count,
      lineage_node_count: summary.body.data.lineage_node_count,
      convergence_total_replays: summary.body.data.convergence.total_replays,
      convergence_average: summary.body.data.convergence.average_convergence_score,
    },
    child_history_count: detail.body.data.count,
    child_convergence_count: convergence.body.data.count,
    timeline_first_event: timeline.body.data.timeline[0],
    diff_changed_fields: diff.body.data.changed_fields,
    lineage_count: lineage.body.data.count,
  }, null, 2));
}

function seedHistoricalRecords(
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
    validation_status: "passed",
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
    id: "convergence-root",
    replay_id: ROOT_REPLAY,
    generated_at: "2026-05-18T00:00:00.000Z",
    convergence_score: 84,
    instability_score: 3,
    stability_index: 81,
    replay_count: 2,
    convergence_hash: "convergence_root",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "convergence-child-001",
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:05:00.000Z",
    convergence_score: 85,
    instability_score: 4,
    stability_index: 81,
    replay_count: 3,
    convergence_hash: "convergence_child_001",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "convergence-child-002",
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:10:00.000Z",
    convergence_score: 90,
    instability_score: 2,
    stability_index: 88,
    replay_count: 4,
    convergence_hash: "convergence_child_002",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "convergence-child-003",
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:15:00.000Z",
    convergence_score: 95,
    instability_score: 1,
    stability_index: 94,
    replay_count: 5,
    convergence_hash: "convergence_child_003",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "convergence-leaf",
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
    "/api/replay-intelligence/history",
    "/api/replay-intelligence/history/summary",
    "/api/replay-intelligence/history/:replayHash",
    "/api/replay-intelligence/history/:replayHash/convergence",
    "/api/replay-intelligence/history/:replayHash/timeline",
    "/api/replay-intelligence/history/:replayHash/diff",
    "/api/replay-intelligence/history/:replayHash/lineage",
  ];

  for (const route of requiredRoutes) {
    assertIncludes(routes, route, `missing replay intelligence history route: ${route}`);
  }

  assertEqual(
    routes.indexOf("/api/replay-intelligence/history/summary") <
      routes.indexOf("/api/replay-intelligence/history/:replayHash"),
    true,
    "history summary route must be registered before history hash route",
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
