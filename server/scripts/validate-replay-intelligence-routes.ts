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
  "/api/replay-intelligence/orchestration",
  "/api/replay-intelligence/orchestration/summary",
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
  "orchestration",
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
