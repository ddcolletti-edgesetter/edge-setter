import fs from "node:fs";
import path from "node:path";
import express from "express";

const validationDir = path.resolve("C:/tmp/edgesetter-replay-intelligence-audit-routes");
if (!validationDir.startsWith(path.resolve("C:/tmp"))) {
  throw new Error(`Refusing to use validation dir outside C:/tmp: ${validationDir}`);
}

fs.rmSync(validationDir, { recursive: true, force: true });
fs.mkdirSync(validationDir, { recursive: true });
process.env.PIPELINE_DATA_DIR = validationDir;

const REPLAY_ID = "audit-validation-replay";
const OTHER_REPLAY_ID = "audit-validation-other-replay";

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main(): Promise<void> {
  const store = await import("../pipeline/store");
  const auditModule = await import("../pipeline/replay-intelligence-audit");
  const auditStore = await import("../pipeline/replay-intelligence-audit-store");
  const routesModule = await import("../pipeline/routes");

  store.getPipelineDb();
  auditStore.clearReplayIntelligenceAuditRows();

  const seededRows = [
    auditStore.insertReplayIntelligenceAuditRow({
      replay_id: REPLAY_ID,
      generated_at: "2026-05-18T00:00:00.000Z",
      analytics_hash: "analytics_hash_001",
      convergence_hash: "convergence_hash_001",
      route_group_count: 5,
      validation_status: "passed",
    }),
    auditStore.insertReplayIntelligenceAuditRow({
      replay_id: REPLAY_ID,
      generated_at: "2026-05-18T01:00:00.000Z",
      analytics_hash: "analytics_hash_002",
      convergence_hash: "convergence_hash_002",
      route_group_count: 6,
      validation_status: "warning",
    }),
    auditStore.insertReplayIntelligenceAuditRow({
      replay_id: OTHER_REPLAY_ID,
      generated_at: "2026-05-18T02:00:00.000Z",
      analytics_hash: "analytics_hash_003",
      convergence_hash: "convergence_hash_003",
      route_group_count: 6,
      validation_status: "failed",
    }),
  ];

  const auditHash = auditModule.buildReplayIntelligenceAuditHash(seededRows[1]);
  const app = express();
  routesModule.registerPipelineRoutes(app);

  validateRouteContracts(app);

  const list = await invokeGet<any>(app, "/api/replay-intelligence/audit", {
    params: {},
    query: { limit: "10", request_id: "audit-route-validation" },
  });
  assertEqual(list.statusCode, 200, "audit list status mismatch");
  assertEqual(list.body.status, "ok", "audit list envelope status mismatch");
  assertEqual(list.body.data.count, 3, "audit list count mismatch");
  assertEqual(list.body.data.total_count, 3, "audit list total_count mismatch");
  assertEqual(typeof list.body.data.audits[0].audit_hash, "string", "audit list hash missing");

  const summary = await invokeGet<any>(app, "/api/replay-intelligence/audit/summary", {
    params: {},
    query: { request_id: "audit-summary-validation" },
  });
  assertEqual(summary.statusCode, 200, "audit summary status mismatch");
  assertEqual(summary.body.status, "ok", "audit summary envelope status mismatch");
  assertEqual(summary.body.data.total_records, 3, "audit summary total mismatch");
  assertEqual(summary.body.data.passed_count, 1, "audit summary passed mismatch");
  assertEqual(summary.body.data.warning_count, 1, "audit summary warning mismatch");
  assertEqual(summary.body.data.failed_count, 1, "audit summary failed mismatch");
  assertEqual(summary.body.data.replay_count, 2, "audit summary replay_count mismatch");
  assertEqual(typeof summary.body.data.deterministic_hash, "string", "audit summary hash missing");

  const detail = await invokeGet<any>(app, "/api/replay-intelligence/audit/:auditHash", {
    params: { auditHash },
    query: { request_id: "audit-detail-validation" },
  });
  assertEqual(detail.statusCode, 200, "audit detail status mismatch");
  assertEqual(detail.body.data.audit_hash, auditHash, "audit detail hash mismatch");
  assertEqual(detail.body.data.audit.replay_id, REPLAY_ID, "audit detail replay mismatch");
  assertEqual(detail.body.data.audit.route_group_count, 6, "audit detail route group mismatch");

  const timeline = await invokeGet<any>(app, "/api/replay-intelligence/audit/:auditHash/timeline", {
    params: { auditHash },
    query: { request_id: "audit-timeline-validation" },
  });
  assertEqual(timeline.statusCode, 200, "audit timeline status mismatch");
  assertEqual(timeline.body.data.replay_id, REPLAY_ID, "audit timeline replay mismatch");
  assertEqual(timeline.body.data.count, 2, "audit timeline count mismatch");
  assertEqual(timeline.body.data.timeline[0].generated_at, "2026-05-18T00:00:00.000Z", "audit timeline order mismatch");
  assertEqual(timeline.body.data.timeline[1].convergence_hash, "convergence_hash_002", "audit timeline convergence mismatch");

  const convergence = await invokeGet<any>(app, "/api/replay-intelligence/audit/:auditHash/convergence", {
    params: { auditHash },
    query: { request_id: "audit-convergence-validation" },
  });
  assertEqual(convergence.statusCode, 200, "audit convergence status mismatch");
  assertEqual(convergence.body.data.convergence_hash, "convergence_hash_002", "audit convergence hash mismatch");
  assertEqual(convergence.body.data.analytics_hash, "analytics_hash_002", "audit convergence analytics mismatch");
  assertEqual(convergence.body.data.validation_status, "warning", "audit convergence status mismatch");

  const history = await invokeGet<any>(app, "/api/replay-intelligence/audit/:auditHash/history", {
    params: { auditHash },
    query: { request_id: "audit-history-validation" },
  });
  assertEqual(history.statusCode, 200, "audit history status mismatch");
  assertEqual(history.body.data.replay_id, REPLAY_ID, "audit history replay mismatch");
  assertEqual(history.body.data.count, 2, "audit history count mismatch");
  assertEqual(history.body.data.history[0].generated_at, "2026-05-18T01:00:00.000Z", "audit history newest-first mismatch");
  assertEqual(typeof history.body.data.history[0].audit_hash, "string", "audit history hash missing");

  const missing = await invokeGet<any>(app, "/api/replay-intelligence/audit/:auditHash", {
    params: { auditHash: "missing-audit-hash" },
    query: { request_id: "audit-missing-validation" },
  });
  assertEqual(missing.statusCode, 404, "missing audit status mismatch");
  assertEqual(missing.body.status, "empty", "missing audit envelope status mismatch");
  assertEqual(missing.body.errors[0].code, "not_found", "missing audit error code mismatch");

  assertEqual(
    auditStore.listReplayIntelligenceAuditRows().length,
    seededRows.length,
    "audit routes must not mutate seeded records",
  );

  console.log("Replay intelligence audit route validation passed.");
  console.log(JSON.stringify({
    validation_db: path.join(validationDir, "pipeline.db"),
    routes_validated: getRegisteredRoutes(app).filter(route =>
      route.startsWith("/api/replay-intelligence/audit"),
    ),
    audit_hash: auditHash,
    audit_count: list.body.data.count,
    summary: {
      total_records: summary.body.data.total_records,
      passed_count: summary.body.data.passed_count,
      warning_count: summary.body.data.warning_count,
      failed_count: summary.body.data.failed_count,
      replay_count: summary.body.data.replay_count,
    },
    timeline_count: timeline.body.data.count,
    history_count: history.body.data.count,
    convergence_hash: convergence.body.data.convergence_hash,
  }, null, 2));
}

function validateRouteContracts(app: express.Express): void {
  const routes = getRegisteredRoutes(app);
  const requiredRoutes = [
    "/api/replay-intelligence/audit",
    "/api/replay-intelligence/audit/summary",
    "/api/replay-intelligence/audit/:auditHash",
    "/api/replay-intelligence/audit/:auditHash/timeline",
    "/api/replay-intelligence/audit/:auditHash/convergence",
    "/api/replay-intelligence/audit/:auditHash/history",
  ];

  for (const route of requiredRoutes) {
    assertIncludes(routes, route, `missing replay intelligence audit route: ${route}`);
  }

  assertEqual(
    routes.indexOf("/api/replay-intelligence/audit/summary") <
      routes.indexOf("/api/replay-intelligence/audit/:auditHash"),
    true,
    "audit summary route must be registered before audit hash route",
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
