import fs from "node:fs";
import path from "node:path";
import express from "express";

const validationDir = path.resolve("C:/tmp/edgesetter-replay-audit-validation");
if (!validationDir.startsWith(path.resolve("C:/tmp"))) {
  throw new Error(`Refusing to use validation dir outside C:/tmp: ${validationDir}`);
}

fs.rmSync(validationDir, { recursive: true, force: true });
fs.mkdirSync(validationDir, { recursive: true });
process.env.PIPELINE_DATA_DIR = validationDir;

const GAME_ID = "validation-game-001";
const PARENT_HASH = "validation-parent-replay-hash";
const CHILD_HASH = "validation-child-replay-hash";
const PARENT_CREATED_AT = "2026-01-01T00:00:00.000Z";
const CHILD_CREATED_AT = "2026-01-01T00:05:00.000Z";

const parentProvenance = {
  replay_engine_version: "replay-engine-v1",
  reconstruction_timestamp: "2026-01-01T00:00:00.000Z",
  snapshot_count: 2,
  signal_count: 1,
  average_confidence: 82,
  replay_source_metadata: {
    source: "validation.sqlite",
    game_id: GAME_ID,
    as_of: "2026-01-01T00:00:00.000Z",
    latest_snapshot_id: "snapshot-parent",
  },
};

const childProvenance = {
  replay_engine_version: "replay-engine-v1",
  reconstruction_timestamp: "2026-01-01T00:05:00.000Z",
  snapshot_count: 3,
  signal_count: 2,
  average_confidence: 76,
  replay_source_metadata: {
    source: "validation.sqlite",
    game_id: GAME_ID,
    as_of: "2026-01-01T00:05:00.000Z",
    latest_snapshot_id: "snapshot-child",
  },
};

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main(): Promise<void> {
  const store = await import("../pipeline/store");
  const divergenceModule = await import("../pipeline/replay-divergence");
  const confidenceModule = await import("../pipeline/replay-confidence");
  const routesModule = await import("../pipeline/routes");

  seedReplayAudits(store.getPipelineDb);

  assertExists(
    store.getReplayAuditByReplayHash(CHILD_HASH),
    "replay audit lookup failed for child replay hash",
  );

  const audits = store.listReplayAuditsByGameId(GAME_ID);
  assertEqual(audits.length, 2, "expected two replay audits for validation game");
  assertEqual(audits[0]?.replay_hash, CHILD_HASH, "audit list is not newest-first");

  const latestVerification = assertExists(
    store.getLatestReplayVerification(CHILD_HASH),
    "latest verification lookup failed",
  );
  assertEqual(latestVerification.verification_status, "diverged", "latest verification status mismatch");

  const verificationHistory = store.listReplayVerificationHistory(CHILD_HASH);
  assertEqual(verificationHistory.length, 1, "verification history lookup failed");
  assertEqual(verificationHistory[0]?.replay_hash, CHILD_HASH, "verification history replay hash mismatch");

  const provenance = assertExists(
    store.getReplayProvenance(CHILD_HASH),
    "provenance lookup failed",
  );
  assertEqual(provenance.provenance?.signal_count, 2, "provenance payload did not deserialize");

  const children = store.listReplayLineageChildren(PARENT_HASH);
  assertEqual(children.length, 1, "lineage child lookup failed");
  assertEqual(children[0]?.replay_hash, CHILD_HASH, "lineage child replay hash mismatch");

  const parents = store.listReplayLineageParents(CHILD_HASH);
  assertEqual(parents.length, 1, "lineage parent traversal failed");
  assertEqual(parents[0]?.replay_hash, PARENT_HASH, "lineage parent replay hash mismatch");

  const divergence = assertExists(
    divergenceModule.analyzeReplayDivergence(CHILD_HASH),
    "divergence analysis failed",
  );
  assertEqual(divergence.compared_against, PARENT_HASH, "divergence comparison target mismatch");
  assertEqual(divergence.divergence_detected, true, "divergence detection mismatch");
  assertIncludes(divergence.mismatch_categories, "timeline_mismatch", "missing timeline mismatch");
  assertIncludes(divergence.mismatch_categories, "snapshot_mismatch", "missing snapshot mismatch");
  assertIncludes(divergence.mismatch_categories, "signal_mismatch", "missing signal mismatch");

  const latestDivergence = assertExists(
    divergenceModule.getLatestReplayDivergenceAnalysis(CHILD_HASH),
    "latest persisted divergence lookup failed",
  );
  assertEqual(latestDivergence.replay_hash, CHILD_HASH, "latest divergence replay hash mismatch");
  assertEqual(latestDivergence.analyzed_at, CHILD_CREATED_AT, "latest divergence analyzed_at mismatch");

  const divergenceHistory = store.listReplayDivergenceHistory(CHILD_HASH);
  assertEqual(divergenceHistory.length, 1, "persisted divergence history read failed");
  assertEqual(
    divergenceModule.listReplayDivergenceAnalysisHistory(CHILD_HASH).length,
    1,
    "divergence analysis history wrapper mismatch",
  );

  const confidence = assertExists(
    confidenceModule.propagateReplayConfidence(CHILD_HASH),
    "confidence propagation failed",
  );
  assertEqual(confidence.replay_hash, CHILD_HASH, "confidence replay hash mismatch");
  assertEqual(confidence.generated_at, CHILD_CREATED_AT, "confidence generated_at should use persisted timestamp");
  assertEqual(typeof confidence.base_confidence, "number", "confidence base type mismatch");
  assertEqual(typeof confidence.propagated_confidence, "number", "confidence propagated type mismatch");
  assertEqual(Array.isArray(confidence.confidence_factors), true, "confidence factors missing");
  assertEqual(Array.isArray(confidence.lineage_adjustments), true, "lineage adjustments missing");

  validateRouteContracts(routesModule.registerPipelineRoutes);

  console.log("Replay audit query infrastructure validation passed.");
  console.log(`Validation DB: ${path.join(validationDir, "pipeline.db")}`);
  console.log(`Divergence mismatches: ${divergence.mismatch_categories.join(",")}`);
  console.log(`Propagated confidence: ${confidence.propagated_confidence}`);
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
    "validation-audit-parent",
    GAME_ID,
    PARENT_CREATED_AT,
    PARENT_HASH,
    "timeline-parent",
    "signal-parent",
    "snapshot-parent",
    "verified",
    0,
    "[]",
    stableStringify(parentProvenance),
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
    "validation-audit-child",
    GAME_ID,
    CHILD_CREATED_AT,
    CHILD_HASH,
    "timeline-child",
    "signal-child",
    "snapshot-child",
    "diverged",
    1,
    stableStringify([{ category: "validation", detail: "deterministic mismatch" }]),
    stableStringify(childProvenance),
    stableStringify({
      parent_replay_hash: PARENT_HASH,
      replay_generation_chain: ["load_snapshots", "load_signals", "persist_audit"],
      normalization_version: "normalization-v1",
    }),
    "reconstruction-v1",
    1,
    CHILD_CREATED_AT,
  );
}

function validateRouteContracts(registerPipelineRoutes: (app: express.Express) => void): void {
  const app = express();
  registerPipelineRoutes(app);
  const routes = getRegisteredRoutes(app);
  const requiredRoutes = [
    "/api/replay/audits/:gameId",
    "/api/replay/audit/:replayHash",
    "/api/replay/verification/:replayHash/latest",
    "/api/replay/verification/:replayHash/history",
    "/api/replay/provenance/:replayHash",
    "/api/replay/lineage/:replayHash/children",
    "/api/replay/lineage/:replayHash/parents",
    "/api/replay/divergence/:replayHash/history",
    "/api/replay/divergence/:replayHash/latest",
    "/api/replay/divergence/:replayHash",
    "/api/replay/confidence/:replayHash",
    "/api/replay/forensics/:replayHash",
    "/api/replay/:gameId",
  ];

  for (const route of requiredRoutes) {
    assertIncludes(routes, route, `missing route registration: ${route}`);
  }

  assertEqual(
    routes.indexOf("/api/replay/divergence/:replayHash/latest")
      < routes.indexOf("/api/replay/divergence/:replayHash"),
    true,
    "specific divergence routes must be registered before generic divergence route",
  );
  assertEqual(
    routes.indexOf("/api/replay/forensics/:replayHash")
      < routes.indexOf("/api/replay/:gameId"),
    true,
    "forensics route must be registered before generic replay route",
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
