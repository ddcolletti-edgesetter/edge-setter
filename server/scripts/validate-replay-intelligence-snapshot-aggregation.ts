import fs from "node:fs";
import path from "node:path";
import express from "express";

const validationDir = path.resolve("C:/tmp/edgesetter-replay-intelligence-snapshot-aggregation");
if (!validationDir.startsWith(path.resolve("C:/tmp"))) {
  throw new Error(`Refusing to use validation dir outside C:/tmp: ${validationDir}`);
}

fs.rmSync(validationDir, { recursive: true, force: true });
fs.mkdirSync(validationDir, { recursive: true });
process.env.PIPELINE_DATA_DIR = validationDir;

const ROOT_REPLAY = "snapshot-root-replay";
const CHILD_REPLAY = "snapshot-child-replay";
const LEAF_REPLAY = "snapshot-leaf-replay";

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main(): Promise<void> {
  const store = await import("../pipeline/store");
  const auditStore = await import("../pipeline/replay-intelligence-audit-store");
  const convergenceStore = await import("../pipeline/replay-convergence-history-store");
  const historyStore = await import("../pipeline/replay-intelligence-history-store");
  const history = await import("../pipeline/replay-intelligence-history");
  const snapshots = await import("../pipeline/replay-intelligence-snapshot-aggregation");
  const routesModule = await import("../pipeline/routes");

  store.getPipelineDb();
  auditStore.clearReplayIntelligenceAuditRows();
  convergenceStore.clearReplayConvergenceHistoryRows();
  historyStore.clearReplayIntelligenceHistoryLineageRows();
  seedSnapshotHistory(auditStore, convergenceStore, historyStore);

  const historicalSnapshots = history.listReplayIntelligenceHistoricalSnapshots();
  assertEqual(historicalSnapshots.length, 5, "seeded historical snapshot count mismatch");
  const childCanonicalSnapshotHash = assertExists(historicalSnapshots.find(
    (snapshot) => snapshot.replay_hash === CHILD_REPLAY &&
      snapshot.generated_at === "2026-05-18T00:15:00.000Z",
  )?.snapshot_hash, "child canonical snapshot hash missing");

  const aggregation = snapshots.buildReplayIntelligenceSnapshotAggregation();
  const aggregationAgain = snapshots.buildReplayIntelligenceSnapshotAggregation();
  assertEqual(aggregation.count, 3, "canonical snapshot group count mismatch");
  assertEqual(aggregation.snapshot_count, 5, "snapshot aggregation count mismatch");
  assertEqual(
    aggregation.deterministic_hash,
    aggregationAgain.deterministic_hash,
    "snapshot aggregation hash is not deterministic",
  );
  assertEqual(Object.isFrozen(aggregation), true, "snapshot aggregation must be immutable");

  const childGroup = assertExists(
    aggregation.groups.find((group) => group.replay_hash === CHILD_REPLAY),
    "child snapshot group missing",
  );
  assertEqual(childGroup.snapshot_count, 3, "child canonical grouping mismatch");
  assertEqual(childGroup.canonical_snapshot_hash, childCanonicalSnapshotHash, "canonical snapshot hash mismatch");
  assertEqual(childGroup.compressed_ancestry.length, 2, "child ancestry compression mismatch");
  assertEqual(childGroup.compressed_ancestry[0]?.replay_hash, ROOT_REPLAY, "compressed ancestry root mismatch");
  assertEqual(childGroup.compressed_ancestry[1]?.replay_hash, CHILD_REPLAY, "compressed ancestry child mismatch");
  assertEqual(childGroup.convergence.total_replays, 12, "child convergence aggregation mismatch");
  assertEqual(childGroup.convergence.average_convergence_score, 90, "child convergence average mismatch");
  assertEqual(childGroup.mutation_summary.changed_field_count, 4, "child mutation summary mismatch");
  assertEqual(childGroup.reducer_ready_snapshots[2]?.reduction.total_replays, 12, "child reducer total mismatch");
  assertEqual(childGroup.reducer_ready_snapshots[2]?.consensus_ready, true, "child reducer consensus readiness mismatch");
  assertEqual(Object.isFrozen(childGroup.immutable_lineage), true, "immutable lineage map is not frozen");

  const reducers = assertExists(
    snapshots.deriveReplayIntelligenceSnapshotReducers(childCanonicalSnapshotHash),
    "snapshot reducers missing",
  );
  const reducersAgain = assertExists(
    snapshots.deriveReplayIntelligenceSnapshotReducers(childCanonicalSnapshotHash),
    "second snapshot reducers missing",
  );
  assertEqual(reducers.reducer_hash, reducersAgain.reducer_hash, "snapshot reducer hash mismatch");
  assertEqual(reducers.reducer_inputs.length, 3, "snapshot reducer input count mismatch");
  assertEqual(Object.isFrozen(reducers.reducer_inputs), true, "snapshot reducer inputs must be immutable");
  assertEqual(
    history.listReplayIntelligenceHistoricalSnapshots().find(
      (snapshot) => snapshot.snapshot_hash === childCanonicalSnapshotHash,
    )?.reducer_ready.convergence_score,
    95,
    "snapshot reducer derivation mutated historical snapshot",
  );

  const lookup = assertExists(
    snapshots.buildReplayIntelligenceSnapshotLookup(childCanonicalSnapshotHash),
    "snapshot lookup missing",
  );
  assertEqual(lookup.canonical_snapshot_hash, childCanonicalSnapshotHash, "snapshot lookup canonical hash mismatch");

  const convergence = assertExists(
    snapshots.buildReplayIntelligenceSnapshotConvergence(childCanonicalSnapshotHash),
    "snapshot convergence missing",
  );
  assertEqual(convergence.aggregation.average_convergence_score, 90, "snapshot convergence average mismatch");

  const lineage = assertExists(
    snapshots.buildReplayIntelligenceSnapshotLineage(childCanonicalSnapshotHash),
    "snapshot lineage missing",
  );
  assertEqual(lineage.compressed_ancestry.length, 2, "snapshot lineage ancestry mismatch");
  assertEqual(lineage.immutable_lineage[CHILD_REPLAY], ROOT_REPLAY, "snapshot immutable lineage parent mismatch");

  const app = express();
  routesModule.registerPipelineRoutes(app);
  validateRouteContracts(app);

  const listResponse = await invokeGet<any>(app, "/api/replay-intelligence/snapshots", {
    params: {},
    query: { request_id: "snapshot-list-validation" },
  });
  assertEqual(listResponse.statusCode, 200, "snapshot list status mismatch");
  assertEqual(listResponse.body.data.count, 3, "snapshot list group count mismatch");
  assertEqual(listResponse.body.data.snapshot_count, 5, "snapshot list count mismatch");

  const summaryResponse = await invokeGet<any>(app, "/api/replay-intelligence/snapshots/summary", {
    params: {},
    query: { request_id: "snapshot-summary-validation" },
  });
  assertEqual(summaryResponse.statusCode, 200, "snapshot summary status mismatch");
  assertEqual(summaryResponse.body.data.group_count, 3, "snapshot summary group count mismatch");
  assertEqual(summaryResponse.body.data.convergence.total_replays, 16, "snapshot summary convergence total mismatch");

  const lookupResponse = await invokeGet<any>(app, "/api/replay-intelligence/snapshots/:snapshotHash", {
    params: { snapshotHash: childCanonicalSnapshotHash },
    query: { request_id: "snapshot-lookup-validation" },
  });
  assertEqual(lookupResponse.statusCode, 200, "snapshot lookup route status mismatch");
  assertEqual(lookupResponse.body.data.snapshot.replay_hash, CHILD_REPLAY, "snapshot lookup route replay mismatch");

  const convergenceResponse = await invokeGet<any>(app, "/api/replay-intelligence/snapshots/:snapshotHash/convergence", {
    params: { snapshotHash: childCanonicalSnapshotHash },
    query: { request_id: "snapshot-convergence-validation" },
  });
  assertEqual(convergenceResponse.statusCode, 200, "snapshot convergence route status mismatch");
  assertEqual(convergenceResponse.body.data.aggregation.total_replays, 12, "snapshot convergence route total mismatch");

  const lineageResponse = await invokeGet<any>(app, "/api/replay-intelligence/snapshots/:snapshotHash/lineage", {
    params: { snapshotHash: childCanonicalSnapshotHash },
    query: { request_id: "snapshot-lineage-validation" },
  });
  assertEqual(lineageResponse.statusCode, 200, "snapshot lineage route status mismatch");
  assertEqual(lineageResponse.body.data.compressed_ancestry[0].replay_hash, ROOT_REPLAY, "snapshot lineage route root mismatch");

  const reducersResponse = await invokeGet<any>(app, "/api/replay-intelligence/snapshots/:snapshotHash/reducers", {
    params: { snapshotHash: childCanonicalSnapshotHash },
    query: { request_id: "snapshot-reducers-validation" },
  });
  assertEqual(reducersResponse.statusCode, 200, "snapshot reducers route status mismatch");
  assertEqual(reducersResponse.body.data.reducers.reduction.total_replays, 12, "snapshot reducers route total mismatch");
  assertEqual(reducersResponse.body.data.reducers.consensus_ready, true, "snapshot reducers route consensus mismatch");

  const missing = await invokeGet<any>(app, "/api/replay-intelligence/snapshots/:snapshotHash", {
    params: { snapshotHash: "missing-snapshot-hash" },
    query: { request_id: "snapshot-missing-validation" },
  });
  assertEqual(missing.statusCode, 404, "missing snapshot status mismatch");
  assertEqual(missing.body.status, "empty", "missing snapshot envelope mismatch");
  assertEqual(missing.body.errors[0].code, "not_found", "missing snapshot error code mismatch");

  assertEqual(auditStore.listReplayIntelligenceAuditRows().length, 4, "snapshot APIs must not mutate audit rows");
  assertEqual(convergenceStore.listReplayConvergenceHistoryRows().length, 5, "snapshot APIs must not mutate convergence rows");

  console.log("Replay intelligence snapshot aggregation validation passed.");
  console.log(JSON.stringify({
    validation_db: path.join(validationDir, "pipeline.db"),
    routes_validated: getRegisteredRoutes(app).filter(route =>
      route.startsWith("/api/replay-intelligence/snapshots"),
    ),
    group_count: aggregation.count,
    snapshot_count: aggregation.snapshot_count,
    child_canonical_snapshot_hash: childCanonicalSnapshotHash,
    child_group_hash: childGroup.group_hash,
    child_convergence_total_replays: childGroup.convergence.total_replays,
    child_mutation_changed_fields: childGroup.mutation_summary.changed_fields,
    reducer_hash: reducers.reducer_hash,
    immutable_outputs: {
      aggregation: Object.isFrozen(aggregation),
      child_group: Object.isFrozen(childGroup),
      reducer_inputs: Object.isFrozen(reducers.reducer_inputs),
      lineage_map: Object.isFrozen(childGroup.immutable_lineage),
    },
  }, null, 2));
}

function seedSnapshotHistory(
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
    id: "snapshot-convergence-root",
    replay_id: ROOT_REPLAY,
    generated_at: "2026-05-18T00:00:00.000Z",
    convergence_score: 84,
    instability_score: 3,
    stability_index: 81,
    replay_count: 2,
    convergence_hash: "convergence_root",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "snapshot-convergence-child-001",
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:05:00.000Z",
    convergence_score: 85,
    instability_score: 4,
    stability_index: 81,
    replay_count: 3,
    convergence_hash: "convergence_child_001",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "snapshot-convergence-child-002",
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:10:00.000Z",
    convergence_score: 90,
    instability_score: 2,
    stability_index: 88,
    replay_count: 4,
    convergence_hash: "convergence_child_002",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "snapshot-convergence-child-003",
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:15:00.000Z",
    convergence_score: 95,
    instability_score: 1,
    stability_index: 94,
    replay_count: 5,
    convergence_hash: "convergence_child_003",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "snapshot-convergence-leaf",
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
    "/api/replay-intelligence/snapshots",
    "/api/replay-intelligence/snapshots/summary",
    "/api/replay-intelligence/snapshots/:snapshotHash",
    "/api/replay-intelligence/snapshots/:snapshotHash/convergence",
    "/api/replay-intelligence/snapshots/:snapshotHash/lineage",
    "/api/replay-intelligence/snapshots/:snapshotHash/reducers",
  ];

  for (const route of requiredRoutes) {
    assertIncludes(routes, route, `missing replay intelligence snapshot route: ${route}`);
  }

  assertEqual(
    routes.indexOf("/api/replay-intelligence/snapshots/summary") <
      routes.indexOf("/api/replay-intelligence/snapshots/:snapshotHash"),
    true,
    "snapshot summary route must be registered before snapshot hash route",
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
