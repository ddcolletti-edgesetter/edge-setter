import fs from "node:fs";
import path from "node:path";

interface RegisteredRoute {
  readonly method: string;
  readonly path: string;
}

interface RouteGroupSummary {
  readonly group: string;
  readonly count: number;
  readonly paths: readonly string[];
}

const routesPath = path.resolve("server/pipeline/routes.ts");
const source = fs.readFileSync(routesPath, "utf8");
const routes = extractRegisteredRoutes(source);

const requiredPaths = [
  "/api/replay-intelligence/convergence-timeline",
  "/api/replay-intelligence/orchestration",
  "/api/replay-intelligence/orchestration/summary",
  "/api/replay-intelligence/restoration",
  "/api/replay-intelligence/restoration/checkpoint",
  "/api/replay-intelligence/restoration/rollback",
  "/api/replay-intelligence/restoration/timeline",
  "/api/replay-intelligence/replayback",
  "/api/replay-intelligence/replayback/history",
  "/api/replay-intelligence/replayback/reconstruction",
  "/api/replay-intelligence/analytics",
  "/api/replay-intelligence/convergence-report",
  "/api/replay-intelligence/convergence-export",
  "/api/replay-intelligence/convergence",
  "/api/replay-intelligence/convergence/summary",
  "/api/replay-intelligence/convergence/:convergenceHash",
  "/api/replay-intelligence/convergence/:convergenceHash/history",
  "/api/replay-intelligence/convergence/:convergenceHash/stability",
  "/api/replay-intelligence/convergence/:convergenceHash/drift",
  "/api/replay-intelligence/convergence/:convergenceHash/lineage",
  "/api/replay-intelligence/history",
  "/api/replay-intelligence/history/summary",
  "/api/replay-intelligence/history/:replayHash",
  "/api/replay-intelligence/history/:replayHash/convergence",
  "/api/replay-intelligence/history/:replayHash/timeline",
  "/api/replay-intelligence/history/:replayHash/diff",
  "/api/replay-intelligence/history/:replayHash/lineage",
  "/api/replay-intelligence/snapshots",
  "/api/replay-intelligence/snapshots/summary",
  "/api/replay-intelligence/snapshots/:snapshotHash",
  "/api/replay-intelligence/snapshots/:snapshotHash/convergence",
  "/api/replay-intelligence/snapshots/:snapshotHash/lineage",
  "/api/replay-intelligence/snapshots/:snapshotHash/reducers",
  "/api/replay-intelligence/forensics/timelines",
  "/api/replay-intelligence/forensics/timelines/summary",
  "/api/replay-intelligence/forensics/timelines/:timelineHash",
  "/api/replay-intelligence/forensics/timelines/:timelineHash/events",
  "/api/replay-intelligence/forensics/timelines/:timelineHash/anomalies",
  "/api/replay-intelligence/forensics/timelines/:timelineHash/convergence",
  "/api/replay-intelligence/forensics/timelines/:timelineHash/reducers",
  "/api/replay-intelligence/exports",
  "/api/replay-intelligence/exports/summary",
  "/api/replay-intelligence/exports/:exportHash",
  "/api/replay-intelligence/exports/:exportHash/download",
  "/api/replay-intelligence/exports/:exportHash/manifest",
  "/api/replay-intelligence/exports/:exportHash/lineage",
  "/api/replay-intelligence/exports/:exportHash/verification",
  "/api/replay-intelligence/aggregation",
  "/api/replay-intelligence/aggregation/summary",
  "/api/replay-intelligence/aggregation/:aggregationHash",
  "/api/replay-intelligence/aggregation/:aggregationHash/reducers",
  "/api/replay-intelligence/aggregation/:aggregationHash/convergence",
  "/api/replay-intelligence/aggregation/:aggregationHash/stability",
  "/api/replay-intelligence/aggregation/:aggregationHash/lineage",
  "/api/replay-intelligence/traversal",
  "/api/replay-intelligence/state-diff",
];

for (const routePath of requiredPaths) {
  if (!routes.some((route) => route.path === routePath)) {
    throw new Error(`Missing required replay intelligence route: ${routePath}`);
  }
}

const summaries: RouteGroupSummary[] = [
  buildRouteGroupSummary("orchestration", routes, (routePath) =>
    routePath.startsWith("/api/replay-intelligence/orchestration"),
  ),
  buildRouteGroupSummary("restoration", routes, (routePath) =>
    routePath.startsWith("/api/replay-intelligence/restoration"),
  ),
  buildRouteGroupSummary("replayback", routes, (routePath) =>
    routePath.startsWith("/api/replay-intelligence/replayback"),
  ),
    buildRouteGroupSummary("analytics", routes, (routePath) =>
    [
      "/api/replay-intelligence/analytics",
      "/api/replay-intelligence/convergence-report",
      "/api/replay-intelligence/convergence-export",
      "/api/replay-intelligence/convergence",
      "/api/replay-intelligence/convergence/summary",
      "/api/replay-intelligence/convergence/:convergenceHash",
      "/api/replay-intelligence/convergence/:convergenceHash/history",
      "/api/replay-intelligence/convergence/:convergenceHash/stability",
      "/api/replay-intelligence/convergence/:convergenceHash/drift",
      "/api/replay-intelligence/convergence/:convergenceHash/lineage",
      "/api/replay-intelligence/traversal",
      "/api/replay-intelligence/state-diff",
      "/api/replay-intelligence/convergence-timeline",
    ].includes(routePath),
  ),
  buildRouteGroupSummary("lineage", routes, (routePath) =>
    routePath.includes("/lineage/") || routePath.includes("/lineage"),
  ),
  buildRouteGroupSummary("anomaly_cluster", routes, (routePath) =>
    routePath.includes("anomaly") || routePath.includes("cluster"),
  ),
  buildRouteGroupSummary("heatmap", routes, (routePath) =>
    routePath.includes("heatmap"),
  ),
  buildRouteGroupSummary("predictive", routes, (routePath) =>
    routePath.includes("predictive") || routePath.includes("timeseries"),
  ),
  buildRouteGroupSummary("dashboard", routes, (routePath) =>
    routePath.includes("dashboard"),
  ),
  buildRouteGroupSummary("export", routes, (routePath) =>
    routePath.includes("export"),
  ),
];

const expectedPresentGroups = [
  "analytics",
  "orchestration",
  "restoration",
  "replayback",
  "lineage",
  "anomaly_cluster",
  "heatmap",
  "predictive",
  "dashboard",
  "export",
];

for (const group of expectedPresentGroups) {
  const summary = summaries.find((candidate) => candidate.group === group);
  if (!summary || summary.count === 0) {
    throw new Error(`Expected replay intelligence route group to be present: ${group}`);
  }
}

console.log("Replay intelligence route validation passed.");
console.log(JSON.stringify({
  route_group_count: summaries.length,
  groups: summaries,
}, null, 2));

function extractRegisteredRoutes(content: string): readonly RegisteredRoute[] {
  const routesByKey = new Map<string, RegisteredRoute>();
  const routePattern = /app\.(get|post|put|delete|patch)\(\s*["']([^"']+)["']/g;
  let match = routePattern.exec(content);

  while (match) {
    const method = match[1]?.toUpperCase() ?? "";
    const routePath = match[2] ?? "";
    if (isReplayIntelligenceRoute(routePath)) {
      routesByKey.set(`${method} ${routePath}`, {
        method,
        path: routePath,
      });
    }

    match = routePattern.exec(content);
  }

  return Array.from(routesByKey.values()).sort((left, right) =>
    left.path.localeCompare(right.path) ||
    left.method.localeCompare(right.method),
  );
}

function isReplayIntelligenceRoute(routePath: string): boolean {
  return routePath.includes("replay-intelligence") ||
    routePath.includes("/api/replay/intelligence") ||
    routePath.includes("/api/replay/lineage") ||
    routePath.includes("/api/replay/:gameId/forensic/export");
}

function buildRouteGroupSummary(
  group: string,
  allRoutes: readonly RegisteredRoute[],
  matches: (routePath: string) => boolean,
): RouteGroupSummary {
  const paths = allRoutes
    .filter((route) => matches(route.path))
    .map((route) => `${route.method} ${route.path}`)
    .sort((left, right) => left.localeCompare(right));

  return {
    group,
    count: paths.length,
    paths,
  };
}
