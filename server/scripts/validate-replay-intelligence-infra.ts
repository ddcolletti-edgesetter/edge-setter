import fs from "node:fs";
import path from "node:path";
import express from "express";

import {
  aggregateReplayArchiveDriftTrends,
  aggregateReplayArchiveMutationFrequency,
  buildReplayArchiveIntelligenceReport,
  computeReplayArchiveForensicMetrics,
  computeReplayArchiveLineageDepthMetrics,
  rankReplayArchiveEvolutionScores,
  scoreReplayArchiveEvolution,
} from "../pipeline/replay-archive-intelligence";
import {
  buildReplayArchiveSearchIndex,
  stableReplayArchiveIndexStringify,
} from "../pipeline/replay-archive-index";
import {
  reconstructReplayArchiveAncestry,
} from "../pipeline/replay-archive-query";
import type {
  ReplayArchiveManifest,
} from "../pipeline/replay-archive-contract";
import type {
  ReplayArchiveIndexSourceRecord,
} from "../pipeline/replay-archive-index";
import type {
  ReplayArchiveForensicMutationRecord,
  ReplayArchiveHistoricalQueryFilters,
  ReplayArchiveIntelligenceAggregationQuery,
  ReplayArchiveQueryAuditContext,
  ReplayArchiveTemporalDriftRecord,
} from "../pipeline/replay-archive-query-contract";
import type {
  ReplayAuditAnalyticsContract,
  ReplayEvolutionMetricContract,
  ReplayForensicIntelligenceRecordContract,
  ReplayIntelligenceSnapshotContract,
  ReplayLineageIntelligenceMetricContract,
} from "../pipeline/replay-intelligence-contract";
import type {
  ReplayIntelligenceApiEnvelope,
} from "../pipeline/replay-intelligence-api-contract";

const validationDir = path.resolve("C:/tmp/edgesetter-replay-intelligence-infra-validation");
if (!validationDir.startsWith(path.resolve("C:/tmp"))) {
  throw new Error(`Refusing to use validation dir outside C:/tmp: ${validationDir}`);
}

fs.rmSync(validationDir, { recursive: true, force: true });
fs.mkdirSync(validationDir, { recursive: true });
process.env.PIPELINE_DATA_DIR = validationDir;

const GENERATED_AT = "2026-03-01T00:30:00.000Z";
const OLDER_GENERATED_AT = "2026-03-01T00:20:00.000Z";
const COMPUTED_AT = "2026-03-01T00:31:00.000Z";
const SNAPSHOT_ID = "intelligence-snapshot-main";
const OLDER_SNAPSHOT_ID = "intelligence-snapshot-older";
const GAME_ID = "intelligence-game-alpha";
const ROOT_ARCHIVE_ID = "intelligence-archive-root";
const CHILD_ARCHIVE_ID = "intelligence-archive-child";
const SIBLING_ARCHIVE_ID = "intelligence-archive-sibling";

const AUDIT_CONTEXT: ReplayArchiveQueryAuditContext = {
  requested_at: "2026-03-01T00:32:00.000Z",
  requested_by: "validate-replay-intelligence-infra",
  request_id: "replay-intelligence-validation-001",
  consistency: "strict_replay_safe",
  source_system: "edge_setter_pipeline",
};

const manifests: readonly ReplayArchiveManifest[] = [
  createManifest({
    archive_id: ROOT_ARCHIVE_ID,
    game_id: GAME_ID,
    created_at: "2026-03-01T00:00:00.000Z",
    revision_number: 1,
    replay_count: 1,
    bundle_size_bytes: 1000,
    verification_status: "verified",
    retention_class: "historical",
    tags: ["validation", "root"],
  }),
  createManifest({
    archive_id: CHILD_ARCHIVE_ID,
    game_id: GAME_ID,
    created_at: "2026-03-01T00:10:00.000Z",
    revision_number: 2,
    replay_count: 2,
    bundle_size_bytes: 1200,
    verification_status: "verified",
    retention_class: "historical",
    parent_archive_id: ROOT_ARCHIVE_ID,
    root_archive_id: ROOT_ARCHIVE_ID,
    tags: ["validation", "child"],
  }),
  createManifest({
    archive_id: SIBLING_ARCHIVE_ID,
    game_id: GAME_ID,
    created_at: "2026-03-01T00:10:00.000Z",
    revision_number: 3,
    replay_count: 3,
    bundle_size_bytes: 1400,
    verification_status: "failed",
    retention_class: "seasonal",
    parent_archive_id: ROOT_ARCHIVE_ID,
    root_archive_id: ROOT_ARCHIVE_ID,
    tags: ["validation", "sibling"],
  }),
  createManifest({
    archive_id: "intelligence-archive-beta",
    game_id: "intelligence-game-beta",
    created_at: "2026-03-01T00:15:00.000Z",
    revision_number: 1,
    replay_count: 1,
    bundle_size_bytes: 900,
    verification_status: "verified",
    retention_class: "permanent",
    tags: ["validation", "beta"],
  }),
];

const indexRecords: readonly ReplayArchiveIndexSourceRecord[] = manifests.map((manifest) => ({
  manifest,
  replay_hash: `${manifest.archive_id}-replay`,
  integrity_status: manifest.archive_id === SIBLING_ARCHIVE_ID ? "diverged" : "verified",
  deterministic_hash: `deterministic-${manifest.archive_id}`,
  snapshot_canonical_hash: manifest.snapshot_hash,
  lineage_depth: manifest.revision_number - 1,
  forensic_payload: {
    archive_id: manifest.archive_id,
    fixture: "replay-intelligence-validation",
  },
  generated_report: {
    archive_id: manifest.archive_id,
    status: manifest.verification_status,
  },
}));

const driftRecords: readonly ReplayArchiveTemporalDriftRecord[] = [
  {
    baseline_archive_id: ROOT_ARCHIVE_ID,
    comparison_archive_id: CHILD_ARCHIVE_ID,
    observed_at: "2026-03-01T00:12:00.000Z",
    equivalent: false,
    mismatch_count: 2,
    mismatch_categories: ["signal_drift", "settlement_mutation"],
    signal_drift: [{
      signal_id: "signal-alpha",
      market: "spread",
      field: "confidence",
      left: 0.72,
      right: 0.81,
    }],
    provenance_evolution: [],
    settlement_mutations: [{
      outcome_id: "outcome-alpha",
      field: "result",
      left: "pending",
      right: "win",
    }],
    mismatches: [
      {
        category: "signal_drift",
        path: "signals.signal-alpha.confidence",
        left: 0.72,
        right: 0.81,
        severity: "warning",
      },
      {
        category: "settlement_mutation",
        path: "settlements.outcome-alpha.result",
        left: "pending",
        right: "win",
        severity: "critical",
      },
    ],
    deterministic_hash: "drift-root-child",
  },
  {
    baseline_archive_id: CHILD_ARCHIVE_ID,
    comparison_archive_id: SIBLING_ARCHIVE_ID,
    observed_at: "2026-03-01T00:18:00.000Z",
    equivalent: false,
    mismatch_count: 1,
    mismatch_categories: ["provenance_evolution"],
    signal_drift: [],
    provenance_evolution: [{
      source_id: "validation-source-alpha",
      field: "source_count",
      left: 2,
      right: 3,
    }],
    settlement_mutations: [],
    mismatches: [{
      category: "provenance_evolution",
      path: "provenance.source_count",
      left: 2,
      right: 3,
      severity: "info",
    }],
    deterministic_hash: "drift-child-sibling",
  },
  {
    baseline_archive_id: ROOT_ARCHIVE_ID,
    comparison_archive_id: SIBLING_ARCHIVE_ID,
    observed_at: "2026-03-01T00:19:00.000Z",
    equivalent: true,
    mismatch_count: 0,
    mismatch_categories: [],
    signal_drift: [],
    provenance_evolution: [],
    settlement_mutations: [],
    mismatches: [],
    deterministic_hash: "drift-root-sibling-equivalent",
  },
];

const mutationRecords: readonly ReplayArchiveForensicMutationRecord[] = [
  {
    archive_id: CHILD_ARCHIVE_ID,
    replay_hash: `${CHILD_ARCHIVE_ID}-replay`,
    entity: "signal",
    entity_id: "signal-alpha",
    operation: "updated",
    category: "signal_mismatch",
    path: "signals.signal-alpha.confidence",
    previous_value: 0.72,
    current_value: 0.81,
    severity: "warning",
    changed_at: "2026-03-01T00:13:00.000Z",
    deterministic_hash: "mutation-child-signal-confidence",
  },
  {
    archive_id: SIBLING_ARCHIVE_ID,
    replay_hash: `${SIBLING_ARCHIVE_ID}-replay`,
    entity: "settlement",
    entity_id: "outcome-alpha",
    operation: "status_changed",
    category: "settlement_mismatch",
    path: "settlements.outcome-alpha.result",
    previous_value: "pending",
    current_value: "loss",
    severity: "critical",
    changed_at: "2026-03-01T00:20:00.000Z",
    deterministic_hash: "mutation-sibling-settlement-result",
  },
  {
    archive_id: SIBLING_ARCHIVE_ID,
    replay_hash: `${SIBLING_ARCHIVE_ID}-replay`,
    entity: "settlement",
    entity_id: "outcome-beta",
    operation: "status_changed",
    category: "settlement_mismatch",
    path: "settlements.outcome-beta.result",
    previous_value: "pending",
    current_value: "void",
    severity: "warning",
    changed_at: "2026-03-01T00:20:00.000Z",
    deterministic_hash: "mutation-sibling-settlement-beta",
  },
];

const index = buildReplayArchiveSearchIndex({
  records: indexRecords,
  drift_records: driftRecords,
  mutation_records: mutationRecords,
});

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main(): Promise<void> {
  const store = await import("../pipeline/store");
  const routesModule = await import("../pipeline/routes");

  const ancestryResults = [
    reconstructReplayArchiveAncestry(createAncestryQuery(CHILD_ARCHIVE_ID), index),
    reconstructReplayArchiveAncestry(createAncestryQuery(SIBLING_ARCHIVE_ID), index),
  ];
  const aggregationQuery = createAggregationQuery();
  const report = buildReplayArchiveIntelligenceReport({
    generated_at: GENERATED_AT,
    aggregation_query: aggregationQuery,
    index,
    windows: [
      {
        window_id: "window-early",
        range: {
          from: "2026-03-01T00:00:00.000Z",
          to: "2026-03-01T00:15:00.000Z",
          inclusivity: "inclusive",
        },
      },
      {
        window_id: "window-late",
        range: {
          from: "2026-03-01T00:15:00.001Z",
          to: "2026-03-01T00:30:00.000Z",
          inclusivity: "inclusive",
        },
      },
    ],
    ancestry_results: ancestryResults,
  });

  validateHelperLayer(report, ancestryResults);
  seedPersistence(store, report);
  validatePersistence(store, report);
  await validateApiLayer(routesModule.registerPipelineRoutes, report);

  console.log("Replay intelligence infrastructure validation passed.");
  console.log(`Validation DB: ${path.join(validationDir, "pipeline.db")}`);
  console.log(`Snapshots: ${store.listReplayIntelligenceSnapshots("game", GAME_ID).length}`);
  console.log(`Forensic records: ${store.listReplayForensicIntelligenceBySnapshot(SNAPSHOT_ID).length}`);
  console.log(`Evolution scores: ${report.evolution_scores.map(score => `${score.archive_id}:${score.score}`).join(",")}`);
}

function validateHelperLayer(
  report: ReturnType<typeof buildReplayArchiveIntelligenceReport>,
  ancestryResults: ReturnType<typeof reconstructReplayArchiveAncestry>[],
): void {
  const driftTrends = aggregateReplayArchiveDriftTrends(driftRecords, [
    {
      window_id: "window-early",
      range: {
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-01T00:15:00.000Z",
        inclusivity: "inclusive",
      },
    },
    {
      window_id: "window-late",
      range: {
        from: "2026-03-01T00:15:00.001Z",
        to: "2026-03-01T00:30:00.000Z",
        inclusivity: "inclusive",
      },
    },
  ]);
  const mutationFrequency = aggregateReplayArchiveMutationFrequency(mutationRecords);
  const lineageMetrics = computeReplayArchiveLineageDepthMetrics(index.entries.map(entry => entry.result_record));
  const forensicMetrics = computeReplayArchiveForensicMetrics({
    archives: index.entries.map(entry => entry.result_record),
    drift_records: driftRecords,
    mutation_records: mutationRecords,
    ancestry_results: ancestryResults,
  });
  const evolutionScores = rankReplayArchiveEvolutionScores(
    scoreReplayArchiveEvolution(index.entries.map(entry => entry.result_record), driftRecords, mutationRecords),
  );

  assertEqual(report.drift_trends.deterministic_hash, driftTrends.deterministic_hash, "drift trend aggregation is inconsistent");
  assertEqual(report.mutation_frequency.length, mutationFrequency.length, "mutation frequency aggregation count mismatch");
  assertEqual(report.lineage_depth_metrics.deterministic_hash, lineageMetrics.deterministic_hash, "lineage depth aggregation is inconsistent");
  assertEqual(report.forensic_metrics.deterministic_hash, forensicMetrics.deterministic_hash, "forensic metrics aggregation is inconsistent");
  assertEqual(
    report.evolution_scores.map(score => score.deterministic_hash).join(","),
    evolutionScores.map(score => score.deterministic_hash).join(","),
    "replay evolution scoring is inconsistent",
  );
  assertEqual(report.forensic_metrics.archive_count, 4, "forensic archive count mismatch");
  assertEqual(report.forensic_metrics.replay_count, 7, "forensic replay count mismatch");
  assertEqual(report.forensic_metrics.critical_mismatch_count, 2, "critical mismatch aggregation mismatch");
  assertEqual(report.lineage_depth_metrics.max_depth, 2, "lineage max depth mismatch");
  assertEqual(report.lineage_depth_metrics.leaf_archive_count, 3, "lineage leaf count mismatch");
  assertEqual(report.drift_trends.trend_direction, "decreasing", "drift trend direction mismatch");
  assertEqual(report.ancestry_summaries.length, 2, "ancestry summary count mismatch");
  assertEqual(report.ancestry_summaries[0]?.archive_id, CHILD_ARCHIVE_ID, "ancestry summaries must be sorted by archive id");
  assertEqual(ancestryResults[0]?.nodes.map(node => node.archive_id).join(","), `${ROOT_ARCHIVE_ID},${CHILD_ARCHIVE_ID}`, "lineage reconstruction chain mismatch");
  assertEqual(stableReplayArchiveIndexStringify({ z: 1, a: 2 }), '{"a":2,"z":1}', "stable helper stringify changed");
}

function seedPersistence(
  store: typeof import("../pipeline/store"),
  report: ReturnType<typeof buildReplayArchiveIntelligenceReport>,
): void {
  const snapshot = createSnapshot(SNAPSHOT_ID, GENERATED_AT, report);
  const olderSnapshot = createSnapshot(OLDER_SNAPSHOT_ID, OLDER_GENERATED_AT, report);
  store.upsertReplayIntelligenceSnapshot(snapshot);
  store.upsertReplayIntelligenceSnapshot(olderSnapshot);

  const forensicRecords: ReplayForensicIntelligenceRecordContract[] = [
    {
      record_id: "forensic-record-a",
      snapshot_id: SNAPSHOT_ID,
      archive_id: CHILD_ARCHIVE_ID,
      replay_hash: `${CHILD_ARCHIVE_ID}-replay`,
      game_id: GAME_ID,
      metric_name: "mutation_count",
      metric_value: 1,
      severity: "warning",
      category: "signal_mismatch",
      observed_at: "2026-03-01T00:25:00.000Z",
      deterministic_hash: "forensic-record-a-hash",
      details: { archive_id: CHILD_ARCHIVE_ID, field: "confidence" },
    },
    {
      record_id: "forensic-record-b",
      snapshot_id: SNAPSHOT_ID,
      archive_id: SIBLING_ARCHIVE_ID,
      replay_hash: `${SIBLING_ARCHIVE_ID}-replay`,
      game_id: GAME_ID,
      metric_name: "critical_mismatch_count",
      metric_value: 1,
      severity: "critical",
      category: "settlement_mismatch",
      observed_at: "2026-03-01T00:26:00.000Z",
      deterministic_hash: "forensic-record-b-hash",
      details: { archive_id: SIBLING_ARCHIVE_ID, field: "result" },
    },
    {
      record_id: "forensic-record-c",
      snapshot_id: SNAPSHOT_ID,
      archive_id: SIBLING_ARCHIVE_ID,
      replay_hash: `${SIBLING_ARCHIVE_ID}-replay`,
      game_id: GAME_ID,
      metric_name: "mutation_count",
      metric_value: 2,
      severity: "warning",
      category: "settlement_mismatch",
      observed_at: "2026-03-01T00:26:00.000Z",
      deterministic_hash: "forensic-record-c-hash",
      details: { archive_id: SIBLING_ARCHIVE_ID, field: "secondary_result" },
    },
  ];
  forensicRecords.forEach(record => store.upsertReplayForensicIntelligenceRecord(record));

  for (const score of report.evolution_scores) {
    const metric: ReplayEvolutionMetricContract = {
      metric_id: `evolution-${score.archive_id}`,
      snapshot_id: SNAPSHOT_ID,
      archive_id: score.archive_id,
      game_id: score.game_id,
      replay_hash: score.replay_hash,
      score: score.score,
      band: score.band,
      drift_count: score.drift_count,
      mutation_count: score.mutation_count,
      lineage_depth: score.lineage_depth,
      critical_mismatch_count: score.critical_mismatch_count,
      computed_at: COMPUTED_AT,
      deterministic_hash: score.deterministic_hash,
    };
    store.upsertReplayEvolutionMetric(metric);
  }

  const lineageMetric: ReplayLineageIntelligenceMetricContract = {
    metric_id: "lineage-metric-root",
    snapshot_id: SNAPSHOT_ID,
    root_archive_id: ROOT_ARCHIVE_ID,
    archive_id: CHILD_ARCHIVE_ID,
    max_depth: report.lineage_depth_metrics.max_depth,
    average_depth: report.lineage_depth_metrics.average_depth,
    root_archive_count: report.lineage_depth_metrics.root_archive_count,
    leaf_archive_count: report.lineage_depth_metrics.leaf_archive_count,
    cycle_detected: false,
    complete: true,
    computed_at: COMPUTED_AT,
    deterministic_hash: report.lineage_depth_metrics.deterministic_hash,
    details: { histogram: report.lineage_depth_metrics.depth_histogram.map(bucket => ({ ...bucket })) },
  };
  store.upsertReplayLineageIntelligenceMetric(lineageMetric);

  const analytics: ReplayAuditAnalyticsContract = {
    analytics_id: "audit-analytics-game",
    snapshot_id: SNAPSHOT_ID,
    scope: "game",
    scope_id: GAME_ID,
    window: "all_time",
    window_start: null,
    window_end: GENERATED_AT,
    archive_count: report.forensic_metrics.archive_count,
    replay_count: report.forensic_metrics.replay_count,
    verified_count: report.forensic_metrics.verified_count,
    failed_count: report.forensic_metrics.failed_count,
    diverged_count: report.forensic_metrics.diverged_count,
    mutation_count: report.forensic_metrics.mutation_count,
    drift_count: report.forensic_metrics.drift_count,
    critical_mismatch_count: report.forensic_metrics.critical_mismatch_count,
    computed_at: COMPUTED_AT,
    deterministic_hash: report.forensic_metrics.deterministic_hash,
    details: { report_hash: report.deterministic_hash },
  };
  store.upsertReplayAuditAnalytics(analytics);
}

function validatePersistence(
  store: typeof import("../pipeline/store"),
  report: ReturnType<typeof buildReplayArchiveIntelligenceReport>,
): void {
  const snapshot = assertExists(store.getReplayIntelligenceSnapshot(SNAPSHOT_ID), "snapshot persistence lookup failed");
  assertEqual(snapshot.deterministic_hash, report.deterministic_hash, "snapshot deterministic hash did not persist");
  assertEqual(snapshot.mutation_frequency.length, 2, "snapshot mutation frequency did not deserialize");
  assertEqual(snapshot.drift_trends.total_mismatch_count, 3, "snapshot drift summary did not deserialize");

  const snapshots = store.listReplayIntelligenceSnapshots("game", GAME_ID);
  assertEqual(snapshots.map(row => row.snapshot_id).join(","), `${SNAPSHOT_ID},${OLDER_SNAPSHOT_ID}`, "snapshot list sorting mismatch");

  const forensicBySnapshot = store.listReplayForensicIntelligenceBySnapshot(SNAPSHOT_ID);
  assertEqual(forensicBySnapshot.map(row => row.record_id).join(","), "forensic-record-b,forensic-record-c,forensic-record-a", "forensic snapshot ordering mismatch");
  assertEqual(store.listReplayForensicIntelligenceByArchive(SIBLING_ARCHIVE_ID).length, 2, "forensic archive lookup mismatch");
  assertEqual(store.listReplayForensicIntelligenceByReplayHash(`${SIBLING_ARCHIVE_ID}-replay`).length, 2, "forensic replay lookup mismatch");

  const latestEvolution = assertExists(store.getLatestReplayEvolutionMetricByArchive(SIBLING_ARCHIVE_ID), "latest evolution metric lookup failed");
  assertEqual(latestEvolution.score, 42, "evolution score persistence mismatch");
  assertEqual(store.listReplayEvolutionMetricsByGame(GAME_ID)[0]?.archive_id, CHILD_ARCHIVE_ID, "evolution game ordering mismatch");

  const lineage = assertExists(store.getLatestReplayLineageIntelligenceByArchive(CHILD_ARCHIVE_ID), "lineage intelligence lookup failed");
  assertEqual(lineage.complete, true, "lineage complete flag did not deserialize");
  assertEqual(lineage.cycle_detected, false, "lineage cycle flag did not deserialize");

  const audit = assertExists(store.listReplayAuditAnalytics("game", GAME_ID)[0], "audit analytics lookup failed");
  assertEqual(audit.mutation_count, 3, "audit mutation count mismatch");
  assertEqual(store.listReplayAuditAnalyticsBySnapshot(SNAPSHOT_ID).length, 1, "audit analytics snapshot lookup mismatch");
}

async function validateApiLayer(
  registerPipelineRoutes: (app: express.Express) => void,
  report: ReturnType<typeof buildReplayArchiveIntelligenceReport>,
): Promise<void> {
  const app = express();
  registerPipelineRoutes(app);
  const routes = getRegisteredRoutes(app);
  const requiredRoutes = [
    "/api/replay/intelligence/snapshot/:snapshotId",
    "/api/replay/intelligence/snapshots/:scope/:scopeId",
    "/api/replay/intelligence/forensic/snapshot/:snapshotId",
    "/api/replay/intelligence/forensic/archive/:archiveId",
    "/api/replay/intelligence/forensic/replay/:replayHash",
    "/api/replay/intelligence/evolution/archive/:archiveId/latest",
    "/api/replay/intelligence/evolution/game/:gameId",
    "/api/replay/intelligence/lineage/root/:rootArchiveId",
    "/api/replay/intelligence/lineage/archive/:archiveId/latest",
    "/api/replay/intelligence/audit/snapshot/:snapshotId",
    "/api/replay/intelligence/audit/:scope/:scopeId",
    "/api/replay/intelligence/mutations/snapshot/:snapshotId/trends",
    "/api/replay/intelligence/drift/snapshot/:snapshotId/summary",
  ];
  for (const route of requiredRoutes) {
    assertIncludes(routes, route, `missing intelligence route registration: ${route}`);
  }

  const snapshotEnvelope = await invokeGet<ReplayIntelligenceApiEnvelope<any>>(app, "/api/replay/intelligence/snapshot/:snapshotId", {
    params: { snapshotId: SNAPSHOT_ID },
    query: { generated_at: GENERATED_AT, request_id: "api-validation-snapshot" },
  });
  assertEqual(snapshotEnvelope.statusCode, 200, "snapshot API status mismatch");
  assertEnvelope(snapshotEnvelope.body, "ok", report.deterministic_hash, "api-validation-snapshot");
  assertEqual(snapshotEnvelope.body.data?.snapshot.snapshot_id, SNAPSHOT_ID, "snapshot API payload mismatch");

  const snapshotPage = await invokeGet<ReplayIntelligenceApiEnvelope<any>>(app, "/api/replay/intelligence/snapshots/:scope/:scopeId", {
    params: { scope: "game", scopeId: GAME_ID },
    query: { limit: "1", generated_at: GENERATED_AT, request_id: "api-validation-snapshot-page" },
  });
  assertEnvelope(snapshotPage.body, "ok", "unused", "api-validation-snapshot-page", { skipHash: true });
  assertEqual(snapshotPage.body.data?.snapshots.map((row: any) => row.snapshot_id).join(","), SNAPSHOT_ID, "snapshot pagination first page mismatch");
  assertEqual(snapshotPage.body.metadata.page_info?.next_cursor, SNAPSHOT_ID, "snapshot pagination cursor mismatch");
  assertEqual(snapshotPage.body.metadata.page_info?.has_next_page, true, "snapshot pagination next flag mismatch");

  const forensicPage = await invokeGet<ReplayIntelligenceApiEnvelope<any>>(app, "/api/replay/intelligence/forensic/snapshot/:snapshotId", {
    params: { snapshotId: SNAPSHOT_ID },
    query: { limit: "2", severity: "warning", generated_at: GENERATED_AT },
  });
  assertEqual(forensicPage.body.data?.records.map((row: any) => row.record_id).join(","), "forensic-record-c,forensic-record-a", "forensic API filtering or ordering mismatch");
  assertEqual(forensicPage.body.metadata.page_info?.has_next_page, false, "forensic API pagination next flag mismatch");

  const evolutionPage = await invokeGet<ReplayIntelligenceApiEnvelope<any>>(app, "/api/replay/intelligence/evolution/game/:gameId", {
    params: { gameId: GAME_ID },
    query: { limit: "2" },
  });
  assertEqual(evolutionPage.body.data?.metrics.map((row: any) => row.archive_id).join(","), `${CHILD_ARCHIVE_ID},${SIBLING_ARCHIVE_ID}`, "evolution API ordering mismatch");
  assertEqual(evolutionPage.body.metadata.page_info?.next_cursor, `evolution-${SIBLING_ARCHIVE_ID}`, "evolution API cursor mismatch");

  const lineageEnvelope = await invokeGet<ReplayIntelligenceApiEnvelope<any>>(app, "/api/replay/intelligence/lineage/archive/:archiveId/latest", {
    params: { archiveId: CHILD_ARCHIVE_ID },
    query: {},
  });
  assertEqual(lineageEnvelope.body.data?.metrics[0]?.complete, true, "lineage API payload mismatch");

  const auditEnvelope = await invokeGet<ReplayIntelligenceApiEnvelope<any>>(app, "/api/replay/intelligence/audit/:scope/:scopeId", {
    params: { scope: "game", scopeId: GAME_ID },
    query: {},
  });
  assertEqual(auditEnvelope.body.data?.analytics[0]?.critical_mismatch_count, 2, "audit analytics API payload mismatch");

  const mutationEnvelope = await invokeGet<ReplayIntelligenceApiEnvelope<any>>(app, "/api/replay/intelligence/mutations/snapshot/:snapshotId/trends", {
    params: { snapshotId: SNAPSHOT_ID },
    query: {},
  });
  assertEqual(mutationEnvelope.body.data?.mutation_frequency.length, 2, "mutation trend API payload mismatch");

  const driftEnvelope = await invokeGet<ReplayIntelligenceApiEnvelope<any>>(app, "/api/replay/intelligence/drift/snapshot/:snapshotId/summary", {
    params: { snapshotId: SNAPSHOT_ID },
    query: {},
  });
  assertEqual(driftEnvelope.body.data?.drift_trends.total_drift_count, 2, "drift summary API payload mismatch");

  const notFoundEnvelope = await invokeGet<ReplayIntelligenceApiEnvelope<any>>(app, "/api/replay/intelligence/snapshot/:snapshotId", {
    params: { snapshotId: "missing-snapshot" },
    query: { request_id: "api-validation-missing" },
  });
  assertEqual(notFoundEnvelope.statusCode, 404, "missing snapshot API status mismatch");
  assertEnvelope(notFoundEnvelope.body, "empty", "not_found", "api-validation-missing");
  assertEqual(notFoundEnvelope.body.errors[0]?.deterministic, true, "API error envelope must be deterministic");
}

function createSnapshot(
  snapshotId: string,
  generatedAt: string,
  report: ReturnType<typeof buildReplayArchiveIntelligenceReport>,
): ReplayIntelligenceSnapshotContract {
  return {
    snapshot_id: snapshotId,
    snapshot_kind: "archive_intelligence_report",
    scope: "game",
    scope_id: GAME_ID,
    generated_at: generatedAt,
    deterministic_hash: report.deterministic_hash,
    report_version: 1,
    forensic_metrics: report.forensic_metrics,
    drift_trends: report.drift_trends,
    mutation_frequency: report.mutation_frequency,
    lineage_depth_metrics: report.lineage_depth_metrics,
    ancestry_summaries: report.ancestry_summaries,
    evolution_scores: report.evolution_scores,
    metadata: {
      fixture: "validate-replay-intelligence-infra",
      report_hash: report.deterministic_hash,
    },
  };
}

function createAggregationQuery(): ReplayArchiveIntelligenceAggregationQuery {
  return {
    filters: createEmptyFilters({ tags_all: ["validation"] }),
    dimensions: ["game_id"],
    metrics: [
      "archive_count",
      "replay_count",
      "mutation_count",
      "drift_count",
      "critical_mismatch_count",
      "verified_count",
      "failed_count",
      "bundle_size_bytes",
    ],
    created_at_bucket_timezone: "UTC",
    ordering: [{
      field: "dimension_key",
      direction: "asc",
      null_ordering: "nulls_last",
      tie_breakers: [{ field: "archive_id", direction: "asc" }],
    }],
    pagination: {
      limit: 10,
      cursor: null,
      cursor_direction: "forward",
    },
    audit_context: AUDIT_CONTEXT,
  };
}

function createAncestryQuery(archiveId: string) {
  return {
    archive_id: archiveId,
    root_archive_id: ROOT_ARCHIVE_ID,
    replay_hash: `${archiveId}-replay`,
    max_depth: 5,
    include_manifests: true,
    include_timeline_events: true,
    include_drift_summary: true,
    audit_context: AUDIT_CONTEXT,
  };
}

function createEmptyFilters(
  overrides: Partial<ReplayArchiveHistoricalQueryFilters> = {},
): ReplayArchiveHistoricalQueryFilters {
  return {
    game_ids: [],
    archive_ids: [],
    replay_hashes: [],
    root_archive_ids: [],
    parent_archive_ids: [],
    retention_classes: [],
    verification_statuses: [],
    integrity_statuses: [],
    forensic_versions: [],
    revision_numbers: [],
    tags_all: [],
    tags_any: [],
    created_at: null,
    as_of: null,
    generated_at: null,
    snapshot_hashes: [],
    bundle_hashes: [],
    export_hashes: [],
    timeline_hashes: [],
    signal_hashes: [],
    settlement_hashes: [],
    provenance_hashes: [],
    ...overrides,
  };
}

function createManifest(params: {
  archive_id: string;
  game_id: string;
  created_at: string;
  revision_number: number;
  replay_count: number;
  bundle_size_bytes: number;
  verification_status: ReplayArchiveManifest["verification_status"];
  retention_class: ReplayArchiveManifest["retention_class"];
  tags: string[];
  parent_archive_id?: string;
  root_archive_id?: string;
}): ReplayArchiveManifest {
  return {
    archive_id: params.archive_id,
    game_id: params.game_id,
    created_at: params.created_at,
    forensic_version: 1,
    snapshot_hash: `snapshot-${params.archive_id}`,
    bundle_hash: `bundle-${params.archive_id}`,
    export_hash: `export-${params.archive_id}`,
    timeline_hash: `timeline-${params.archive_id}`,
    signal_hash: `signal-${params.archive_id}`,
    settlement_hash: `settlement-${params.archive_id}`,
    provenance_hash: `provenance-${params.archive_id}`,
    compression: "gzip",
    bundle_size_bytes: params.bundle_size_bytes,
    replay_count: params.replay_count,
    verification_status: params.verification_status,
    retention_class: params.retention_class,
    parent_archive_id: params.parent_archive_id,
    root_archive_id: params.root_archive_id,
    revision_number: params.revision_number,
    tags: params.tags,
  };
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

function assertEnvelope<TData>(
  envelope: ReplayIntelligenceApiEnvelope<TData>,
  status: ReplayIntelligenceApiEnvelope<TData>["status"],
  deterministicHash: string,
  requestId: string | null,
  opts: { skipHash?: boolean } = {},
): void {
  assertEqual(envelope.status, status, "API envelope status mismatch");
  assertEqual(envelope.metadata.request_id, requestId, "API envelope request_id mismatch");
  if (!opts.skipHash) {
    assertEqual(envelope.metadata.deterministic_hash, deterministicHash, "API envelope deterministic hash mismatch");
  }
  assertEqual(Array.isArray(envelope.errors), true, "API envelope errors must be an array");
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
