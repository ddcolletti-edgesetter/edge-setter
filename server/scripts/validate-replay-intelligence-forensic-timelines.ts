import fs from "node:fs";
import path from "node:path";
import express from "express";

const validationDir = path.resolve("C:/tmp/edgesetter-replay-intelligence-forensic-timelines");
if (!validationDir.startsWith(path.resolve("C:/tmp"))) {
  throw new Error(`Refusing to use validation dir outside C:/tmp: ${validationDir}`);
}

fs.rmSync(validationDir, { recursive: true, force: true });
fs.mkdirSync(validationDir, { recursive: true });
process.env.PIPELINE_DATA_DIR = validationDir;

const ROOT_REPLAY = "forensic-root-replay";
const CHILD_REPLAY = "forensic-child-replay";
const LEAF_REPLAY = "forensic-leaf-replay";

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main(): Promise<void> {
  const store = await import("../pipeline/store");
  const auditStore = await import("../pipeline/replay-intelligence-audit-store");
  const convergenceStore = await import("../pipeline/replay-convergence-history-store");
  const historyStore = await import("../pipeline/replay-intelligence-history-store");
  const forensic = await import("../pipeline/replay-intelligence-forensic-timeline");
  const routesModule = await import("../pipeline/routes");

  store.getPipelineDb();
  auditStore.clearReplayIntelligenceAuditRows();
  convergenceStore.clearReplayConvergenceHistoryRows();
  historyStore.clearReplayIntelligenceHistoryLineageRows();
  seedReplayTimelineHistory(auditStore, convergenceStore, historyStore);

  const timelines = forensic.buildReplayIntelligenceForensicTimelines();
  const timelinesAgain = forensic.buildReplayIntelligenceForensicTimelines();
  assertEqual(timelines.length, 3, "forensic timeline count mismatch");
  assertEqual(
    timelines.map((timeline) => timeline.timeline_hash).join("|"),
    timelinesAgain.map((timeline) => timeline.timeline_hash).join("|"),
    "forensic timeline hashes are not deterministic",
  );
  assertEqual(Object.isFrozen(timelines), true, "forensic timeline list must be immutable");

  const childTimeline = assertExists(
    timelines.find((timeline) => timeline.replay_hash === CHILD_REPLAY),
    "child forensic timeline missing",
  );
  assertEqual(childTimeline.event_count, 10, "child forensic event count mismatch");
  assertEqual(isChronological(childTimeline.events), true, "child forensic events are not chronological");
  assertEqual(childTimeline.events[0]?.generated_at, "2026-05-18T00:05:00.000Z", "first forensic event timestamp mismatch");
  assertEqual(childTimeline.events[0]?.event_type, "audit", "forensic event type ordering mismatch");
  assertEqual(childTimeline.anomalies.length, 3, "anomaly progression count mismatch");
  assertEqual(childTimeline.anomalies[0]?.status, "warning", "first anomaly status mismatch");
  assertEqual(childTimeline.anomalies[2]?.status, "failed", "final anomaly status mismatch");
  assertEqual(childTimeline.convergence_evolution.length, 3, "convergence evolution count mismatch");
  assertEqual(childTimeline.reducers.convergence.total_replays, 12, "forensic convergence total mismatch");
  assertEqual(childTimeline.reducers.convergence.average_convergence_score, 90, "forensic convergence average mismatch");
  assertEqual(childTimeline.drift_summary.changed_field_count, 4, "forensic drift summary mismatch");
  assertEqual(childTimeline.immutable_event_lineage[CHILD_REPLAY], ROOT_REPLAY, "forensic lineage parent mismatch");
  assertEqual(Object.isFrozen(childTimeline.reducers), true, "forensic reducers must be immutable");
  assertEqual(Object.isFrozen(childTimeline.events), true, "forensic events must be immutable");
  assertEqual(Object.isFrozen(childTimeline.immutable_event_lineage), true, "forensic lineage must be immutable");

  const reducers = assertExists(
    forensic.buildReplayIntelligenceForensicTimelineReducers(childTimeline.timeline_hash),
    "forensic reducers payload missing",
  );
  const reducersAgain = assertExists(
    forensic.buildReplayIntelligenceForensicTimelineReducers(childTimeline.timeline_hash),
    "second forensic reducers payload missing",
  );
  assertEqual(
    reducers.reducers.reducer_hash,
    reducersAgain.reducers.reducer_hash,
    "forensic reducer hash mismatch",
  );
  assertEqual(reducers.reducers.orchestration_ready, true, "forensic reducer orchestration readiness mismatch");

  const summary = forensic.buildReplayIntelligenceForensicTimelineSummary();
  assertEqual(summary.timeline_count, 3, "forensic summary timeline count mismatch");
  assertEqual(summary.anomaly_count, 3, "forensic summary anomaly count mismatch");
  assertEqual(summary.convergence.total_replays, 16, "forensic summary convergence total mismatch");

  const reconstruction = assertExists(
    forensic.getReplayIntelligenceForensicTimelineByHash(childTimeline.timeline_hash),
    "timeline reconstruction by hash failed",
  );
  assertEqual(reconstruction.timeline_hash, childTimeline.timeline_hash, "reconstructed timeline hash mismatch");
  assertEqual(
    reconstruction.events.map((event) => event.event_id).join("|"),
    childTimeline.events.map((event) => event.event_id).join("|"),
    "reconstructed timeline event order mismatch",
  );

  const app = express();
  routesModule.registerPipelineRoutes(app);
  validateRouteContracts(app);

  const listResponse = await invokeGet<any>(app, "/api/replay-intelligence/forensics/timelines", {
    params: {},
    query: { request_id: "forensic-list-validation" },
  });
  assertEqual(listResponse.statusCode, 200, "forensic timeline list status mismatch");
  assertEqual(listResponse.body.data.count, 3, "forensic timeline list count mismatch");

  const summaryResponse = await invokeGet<any>(app, "/api/replay-intelligence/forensics/timelines/summary", {
    params: {},
    query: { request_id: "forensic-summary-validation" },
  });
  assertEqual(summaryResponse.statusCode, 200, "forensic timeline summary status mismatch");
  assertEqual(summaryResponse.body.data.anomaly_count, 3, "forensic timeline summary anomaly mismatch");

  const lookupResponse = await invokeGet<any>(app, "/api/replay-intelligence/forensics/timelines/:timelineHash", {
    params: { timelineHash: childTimeline.timeline_hash },
    query: { request_id: "forensic-lookup-validation" },
  });
  assertEqual(lookupResponse.statusCode, 200, "forensic timeline lookup status mismatch");
  assertEqual(lookupResponse.body.data.timeline_hash, childTimeline.timeline_hash, "forensic timeline lookup hash mismatch");

  const eventsResponse = await invokeGet<any>(app, "/api/replay-intelligence/forensics/timelines/:timelineHash/events", {
    params: { timelineHash: childTimeline.timeline_hash },
    query: { request_id: "forensic-events-validation" },
  });
  assertEqual(eventsResponse.statusCode, 200, "forensic events status mismatch");
  assertEqual(eventsResponse.body.data.count, 10, "forensic events count mismatch");
  assertEqual(isChronological(eventsResponse.body.data.events), true, "forensic route events not chronological");

  const anomaliesResponse = await invokeGet<any>(app, "/api/replay-intelligence/forensics/timelines/:timelineHash/anomalies", {
    params: { timelineHash: childTimeline.timeline_hash },
    query: { request_id: "forensic-anomalies-validation" },
  });
  assertEqual(anomaliesResponse.statusCode, 200, "forensic anomalies status mismatch");
  assertEqual(anomaliesResponse.body.data.count, 3, "forensic anomalies count mismatch");
  assertEqual(anomaliesResponse.body.data.anomalies[2].severity, "critical", "forensic anomaly severity mismatch");

  const convergenceResponse = await invokeGet<any>(app, "/api/replay-intelligence/forensics/timelines/:timelineHash/convergence", {
    params: { timelineHash: childTimeline.timeline_hash },
    query: { request_id: "forensic-convergence-validation" },
  });
  assertEqual(convergenceResponse.statusCode, 200, "forensic convergence status mismatch");
  assertEqual(convergenceResponse.body.data.aggregation.total_replays, 12, "forensic convergence route total mismatch");

  const reducersResponse = await invokeGet<any>(app, "/api/replay-intelligence/forensics/timelines/:timelineHash/reducers", {
    params: { timelineHash: childTimeline.timeline_hash },
    query: { request_id: "forensic-reducers-validation" },
  });
  assertEqual(reducersResponse.statusCode, 200, "forensic reducers status mismatch");
  assertEqual(reducersResponse.body.data.reducers.orchestration_ready, true, "forensic reducers route readiness mismatch");

  const missing = await invokeGet<any>(app, "/api/replay-intelligence/forensics/timelines/:timelineHash", {
    params: { timelineHash: "missing-timeline-hash" },
    query: { request_id: "forensic-missing-validation" },
  });
  assertEqual(missing.statusCode, 404, "missing forensic timeline status mismatch");
  assertEqual(missing.body.status, "empty", "missing forensic timeline envelope mismatch");
  assertEqual(missing.body.errors[0].code, "not_found", "missing forensic timeline error mismatch");

  assertEqual(auditStore.listReplayIntelligenceAuditRows().length, 4, "forensic APIs must not mutate audit rows");
  assertEqual(convergenceStore.listReplayConvergenceHistoryRows().length, 5, "forensic APIs must not mutate convergence rows");

  console.log("Replay intelligence forensic timeline validation passed.");
  console.log(JSON.stringify({
    validation_db: path.join(validationDir, "pipeline.db"),
    routes_validated: getRegisteredRoutes(app).filter(route =>
      route.startsWith("/api/replay-intelligence/forensics/timelines"),
    ),
    timeline_count: timelines.length,
    child_timeline_hash: childTimeline.timeline_hash,
    child_event_count: childTimeline.event_count,
    child_anomaly_count: childTimeline.anomalies.length,
    child_convergence_total_replays: childTimeline.reducers.convergence.total_replays,
    child_reducer_hash: childTimeline.reducers.reducer_hash,
    immutable_outputs: {
      timelines: Object.isFrozen(timelines),
      child_events: Object.isFrozen(childTimeline.events),
      child_reducers: Object.isFrozen(childTimeline.reducers),
      child_lineage: Object.isFrozen(childTimeline.immutable_event_lineage),
    },
  }, null, 2));
}

function seedReplayTimelineHistory(
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
    id: "forensic-convergence-root",
    replay_id: ROOT_REPLAY,
    generated_at: "2026-05-18T00:00:00.000Z",
    convergence_score: 84,
    instability_score: 3,
    stability_index: 81,
    replay_count: 2,
    convergence_hash: "convergence_root",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "forensic-convergence-child-001",
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:05:00.000Z",
    convergence_score: 85,
    instability_score: 4,
    stability_index: 81,
    replay_count: 3,
    convergence_hash: "convergence_child_001",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "forensic-convergence-child-002",
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:10:00.000Z",
    convergence_score: 90,
    instability_score: 2,
    stability_index: 88,
    replay_count: 4,
    convergence_hash: "convergence_child_002",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "forensic-convergence-child-003",
    replay_id: CHILD_REPLAY,
    generated_at: "2026-05-18T00:15:00.000Z",
    convergence_score: 95,
    instability_score: 1,
    stability_index: 94,
    replay_count: 5,
    convergence_hash: "convergence_child_003",
  });
  convergenceStore.insertReplayConvergenceHistoryRow({
    id: "forensic-convergence-leaf",
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
    "/api/replay-intelligence/forensics/timelines",
    "/api/replay-intelligence/forensics/timelines/summary",
    "/api/replay-intelligence/forensics/timelines/:timelineHash",
    "/api/replay-intelligence/forensics/timelines/:timelineHash/events",
    "/api/replay-intelligence/forensics/timelines/:timelineHash/anomalies",
    "/api/replay-intelligence/forensics/timelines/:timelineHash/convergence",
    "/api/replay-intelligence/forensics/timelines/:timelineHash/reducers",
  ];

  for (const route of requiredRoutes) {
    assertIncludes(routes, route, `missing replay intelligence forensic route: ${route}`);
  }

  assertEqual(
    routes.indexOf("/api/replay-intelligence/forensics/timelines/summary") <
      routes.indexOf("/api/replay-intelligence/forensics/timelines/:timelineHash"),
    true,
    "forensic summary route must be registered before timeline hash route",
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

function isChronological(events: readonly { generated_at: string }[]): boolean {
  return events.every((event, index) =>
    index === 0 || events[index - 1].generated_at <= event.generated_at,
  );
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
