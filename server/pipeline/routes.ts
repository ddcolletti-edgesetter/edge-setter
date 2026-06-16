/**
 * Edge Setter — Pipeline API Routes  (Sprint 7–9)
 *
 * Registers all pipeline endpoints on the Express app:
 *
 *   Delivery (public)
 *   ─────────────────
 *   GET  /api/v2/signals              — filtered signal feed
 *   GET  /api/v2/signals/:id          — signal detail
 *   GET  /api/v2/games                — today's games
 *   GET  /api/stats/track-record      — aggregate hit-rate + CLV stats per league
 *
 *   Ingestion (admin-gated)
 *   ──────────────────────
 *   POST /api/pipeline/ingest/manual  — operator creates a RawEvent by hand
 *   POST /api/pipeline/ingest/run     — trigger a full ingest + process cycle
 *   GET  /api/pipeline/raw-events     — view raw events (admin)
 *   GET  /api/pipeline/status         — pipeline health summary
 *
 *   Outcomes
 *   ────────
 *   POST /api/outcomes                — record an outcome + auto-compute CLV
 *   GET  /api/outcomes/:signal_id     — get outcomes for a signal
 */

import type { Express, Request, Response } from "express";
import {
  getLiveSignals, getLiveSignal,
  getGames, getRawEvents, insertRawEvent,
  createOutcome, getOutcomes,
  getTrackRecord, getPipelineDb,
  listReplayAuditsByGameId,
  getReplayAuditByReplayHash,
  getLatestReplayVerification,
  listReplayVerificationHistory,
  getReplayProvenance,
  listReplayLineageChildren,
  listReplayLineageParents,
  getReplayIntelligenceSnapshot,
  listReplayIntelligenceSnapshots,
  listReplayForensicIntelligenceBySnapshot,
  listReplayForensicIntelligenceByArchive,
  listReplayForensicIntelligenceByReplayHash,
  getLatestReplayEvolutionMetricByArchive,
  listReplayEvolutionMetricsByGame,
  listReplayLineageIntelligenceByRootArchive,
  getLatestReplayLineageIntelligenceByArchive,
  listReplayAuditAnalytics,
  listReplayAuditAnalyticsBySnapshot,
  listReplayDashboardAggregateRows, 
} from "./store";
import { processRawEvents, processOne } from "./processor";
import { runIngestionCycle } from "./ingestion";
import { listCanonicalSituationApiResponses, type CanonicalSituationOrderBy } from "./situations-api";
import { ingestNFLInjuries } from "./adapters/espn-nfl";
import { ingestCFBInjuries } from "./adapters/espn-cfb";
import { buildReplayIntelligenceAnalytics } from "./replay-intelligence-analytics";
import {
  buildReplayIntelligenceAuditHash,
  buildReplayIntelligenceAuditSummary,
  type ReplayIntelligenceAuditRecord,
} from "./replay-intelligence-audit";
import {
  getReplayIntelligenceAuditRowByHash,
  listReplayIntelligenceAuditRows,
  listReplayIntelligenceAuditRowsByAuditHash,
} from "./replay-intelligence-audit-store";
import {
  buildReplayIntelligenceHistoryConvergence,
  buildReplayIntelligenceHistoryDiff,
  buildReplayIntelligenceHistoryForReplay,
  buildReplayIntelligenceHistoryLineage,
  buildReplayIntelligenceHistorySummary,
  buildReplayIntelligenceHistoryTimeline,
  listReplayIntelligenceHistoricalSnapshots,
} from "./replay-intelligence-history";
import {
  buildReplayIntelligenceSnapshotAggregation,
  buildReplayIntelligenceSnapshotConvergence,
  buildReplayIntelligenceSnapshotLineage,
  buildReplayIntelligenceSnapshotLookup,
  buildReplayIntelligenceSnapshotReducers,
  buildReplayIntelligenceSnapshotSummary,
} from "./replay-intelligence-snapshot-aggregation";
import {
  buildReplayIntelligenceForensicTimelineAnomalies,
  buildReplayIntelligenceForensicTimelineConvergence,
  buildReplayIntelligenceForensicTimelineEvents,
  buildReplayIntelligenceForensicTimelineReducers,
  buildReplayIntelligenceForensicTimelineSummary,
  buildReplayIntelligenceForensicTimelines,
  getReplayIntelligenceForensicTimelineByHash,
} from "./replay-intelligence-forensic-timeline";
import {
  buildReplayIntelligenceHistoricalExportLineage,
  buildReplayIntelligenceHistoricalExportManifest,
  buildReplayIntelligenceHistoricalExportSummary,
  buildReplayIntelligenceHistoricalExportVerification,
  buildReplayIntelligenceHistoricalExports,
  getReplayIntelligenceHistoricalExportByHash,
} from "./replay-intelligence-historical-export";
import {
  buildReplayIntelligenceAggregationConvergence,
  buildReplayIntelligenceAggregationLineage,
  buildReplayIntelligenceAggregationReducers,
  buildReplayIntelligenceAggregationStability,
  buildReplayIntelligenceAggregationSummary,
  buildReplayIntelligenceAggregations,
  getReplayIntelligenceAggregationByHash,
} from "./replay-intelligence-aggregation";
import {
  buildReplayIntelligenceConvergencePersistenceDrift,
  buildReplayIntelligenceConvergencePersistenceHistory,
  buildReplayIntelligenceConvergencePersistenceLineage,
  buildReplayIntelligenceConvergencePersistenceStability,
  buildReplayIntelligenceConvergencePersistenceSummary,
  getReplayIntelligenceConvergencePersistenceByHash,
  listReplayIntelligenceConvergencePersistenceRecords,
} from "./replay-intelligence-convergence-persistence";
import { buildReplayConvergenceReport } from "./replay-convergence-report";
import { buildReplayConvergenceTimeline } from "./replay-convergence-timeline";
import { buildReplayConvergenceExportBundle } from "./replay-convergence-export";
import { buildReplayTraversalSummary } from "./replay-traversal-intelligence";
import { buildReplayStateDiffSummary } from "./replay-state-diff";
import {
  insertReplayAnalyticsHistoryRow,
  listReplayAnalyticsHistoryByReplayId,
  getLatestReplayAnalyticsHistoryByReplayId,
} from "./replay-analytics-history-store";
import { ingestOdds } from "./adapters/the-odds-api";
import { settleGame, autoSettleFinishedGames, computeSourceAccuracy } from "./settlement";
import { runFullBackfill, getBackfillStatus } from "./backfill";
import { runCalibration, getStoredCalibration } from "./calibration";
import { computeSpreadOrTotalClv } from "./clv";
import type { League, RawEventType } from "./types";
import { getReplayState } from "./replay";
import { mapReplayToApiResponse } from "./replay-mapper";
import type {
  ReplayAuditDetailResponse,
  ReplayAuditListResponse,
  ReplayDivergenceHistoryLatestResponse,
  ReplayDivergenceHistoryResponse,
  ReplayLineageChildrenResponse,
  ReplayLineageParentsResponse,
  ReplayProvenanceResponse,
  ReplayVerificationHistoryResponse,
  ReplayVerificationLatestResponse,
} from "./replay-contract";
import type {
  ReplayAuditAnalyticsSummaryResponse,
  ReplayDriftIntelligenceSummaryResponse,
  ReplayEvolutionAnalyticsResponse,
  ReplayForensicIntelligenceFilter,
  ReplayForensicIntelligenceLookupResponse,
  ReplayIntelligenceApiEnvelope,
  ReplayIntelligenceApiError,
  ReplayIntelligenceApiPageInfo,
  ReplayIntelligenceApiPagination,
  ReplayIntelligenceSnapshotListResponse,
  ReplayIntelligenceSnapshotLookupResponse,
  ReplayLineageIntelligenceAnalyticsResponse,
  ReplayMutationTrendAnalyticsResponse,
} from "./replay-intelligence-api-contract";
import type {
  ReplayForensicIntelligenceRecordRow,
  ReplayIntelligenceRecordScope,
} from "./replay-intelligence-contract";
import {
  analyzeReplayDivergence,
  getLatestReplayDivergenceAnalysis,
  inspectReplayForensics,
  listReplayDivergenceAnalysisHistory,
} from "./replay-divergence";
import { propagateReplayConfidence } from "./replay-confidence";
import {
  buildLineageForensicPackage,
  buildReplayAuditExportBundle,
} from "./replay-forensic-export";
import {
  buildReplayConfidenceSummary,
  buildReplayForensicOverview,
} from "./replay-forensic-report";
import {
  buildReplayDashboardAggregationResult,
  ReplayDashboardSourceRecord,
} from "./replay-intelligence-dashboard";
import {
  buildReplayIntelligenceTrendResult,
  ReplayIntelligenceTimeseriesPoint,
} from "./replay-intelligence-timeseries";
import {
  buildReplayAnomalyClusterSummary,
  buildDeterministicReplayIntelligenceOrchestrationScaffold,
  buildDeterministicReplayIntelligenceOrchestrationSnapshot,
  buildReplayHeatmapSummary,
  buildReplayIntelligenceConvergenceSummary,
  buildReplayIntelligenceOrchestrationSnapshot,
} from "./replay-intelligence-orchestration";
import {
  buildReplayIntelligencePersistentSnapshot,
  buildReplayIntelligenceRecoveryMetadata,
} from "./replay-intelligence-persistence";
import {
  buildReplayIntelligenceRecoveryResult,
  buildReplayIntelligenceRecoverySnapshot,
  buildReplayIntelligenceRollbackCandidate,
} from "./replay-intelligence-recovery";
import {
  buildReplayIntelligenceReplayTimeline,
  buildReplayIntelligenceRestorationCheckpoint,
  buildReplayIntelligenceRestorationResult,
  buildReplayIntelligenceRestorationSnapshot,
} from "./replay-intelligence-restoration";
import {
  buildReplayIntelligenceReducerState,
  buildReplayIntelligenceReplaybackCheckpoint,
  buildReplayIntelligenceReplaybackState,
  buildReplayIntelligenceRestorationReducerResult,
} from "./replay-intelligence-reducer";
import {
  buildReplayIntelligenceReplayTimelineApiResponse,
  buildReplayIntelligenceRestorationApiResponse,
  buildReplayIntelligenceRollbackApiResponse,
} from "./replay-intelligence-restoration-api";
import {
  buildReplayIntelligenceReplaybackApiResponse,
  buildReplayIntelligenceReplaybackHistoryResponse,
  buildReplayIntelligenceReplayReconstructionResponse,
} from "./replay-intelligence-replayback-api";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "edgesetter-admin-2026";
const REPLAY_INTELLIGENCE_RESTORATION_PERSISTED_AT = "2026-01-03T00:00:00.000Z";
const REPLAY_INTELLIGENCE_RESTORATION_RECOVERED_AT = "2026-01-04T00:00:00.000Z";
const REPLAY_INTELLIGENCE_RESTORATION_RESTORED_AT = "2026-01-05T00:00:00.000Z";
const REPLAY_INTELLIGENCE_REPLAYBACK_REPLAYED_AT = "2026-01-06T00:00:00.000Z";
const REPLAY_INTELLIGENCE_AUDIT_GENERATED_AT = "2026-01-01T00:00:00.000Z";

type ReplayIntelligenceAuditApiRecord = ReplayIntelligenceAuditRecord & {
  readonly audit_hash: string;
};

function requireAdmin(req: Request, res: Response): boolean {
  const authHeader = req.headers.authorization ?? "";
  const pw = authHeader.startsWith("Bearer ") ? authHeader.slice(7)
    : (req.body?.password ?? (req.query as any).password);
  if (pw !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function latestReplayHashForGame(gameId: string): string | null {
  return listReplayAuditsByGameId(gameId)[0]?.replay_hash ?? null;
}

function queryString(req: Request, key: string): string | null {
  const value = req.query[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

function replayIntelligencePagination(req: Request): ReplayIntelligenceApiPagination {
  const rawLimit = Number(queryString(req, "limit") ?? 50);
  return {
    limit: Number.isFinite(rawLimit) ? Math.max(0, Math.min(rawLimit, 500)) : 50,
    cursor: queryString(req, "cursor"),
  };
}

function paginateReplayIntelligenceRows<T>(
  rows: readonly T[],
  pagination: ReplayIntelligenceApiPagination,
  getCursor: (row: T) => string,
): { rows: readonly T[]; pageInfo: ReplayIntelligenceApiPageInfo } {
  const start = pagination.cursor
    ? rows.findIndex((row) => getCursor(row) === pagination.cursor) + 1
    : 0;
  const safeStart = Math.max(0, start);
  const pageRows = rows.slice(safeStart, safeStart + pagination.limit);
  const end = safeStart + pageRows.length;

  return {
    rows: pageRows,
    pageInfo: {
      limit: pagination.limit,
      next_cursor:
        end < rows.length && pageRows.length > 0
          ? getCursor(pageRows[pageRows.length - 1] as T)
          : null,
      has_next_page: end < rows.length,
    },
  };
}

function replayIntelligenceEnvelope<TData>(
  req: Request,
  data: TData | null,
  deterministicHash: string,
  pageInfo: ReplayIntelligenceApiPageInfo | null = null,
): ReplayIntelligenceApiEnvelope<TData> {
  return {
    status: data ? "ok" : "empty",
    metadata: {
      generated_at: queryString(req, "generated_at") ?? "",
      deterministic_hash: deterministicHash,
      request_id: queryString(req, "request_id"),
      page_info: pageInfo,
    },
    data,
    errors: [],
  };
}

function replayIntelligenceErrorEnvelope(
  req: Request,
  status: "empty" | "error",
  error: ReplayIntelligenceApiError,
): ReplayIntelligenceApiEnvelope<null> {
  return {
    status,
    metadata: {
      generated_at: queryString(req, "generated_at") ?? "",
      deterministic_hash: error.code,
      request_id: queryString(req, "request_id"),
      page_info: null,
    },
    data: null,
    errors: [error],
  };
}

function replayIntelligenceError(
  code: ReplayIntelligenceApiError["code"],
  message: string,
  field: string | null,
): ReplayIntelligenceApiError {
  return {
    code,
    message,
    field,
    severity: code === "not_found" ? "warning" : "critical",
    deterministic: true,
    details: {},
  };
}

function buildReplayIntelligenceRestorationApiScaffold() {
  const orchestrationSnapshot =
    buildDeterministicReplayIntelligenceOrchestrationScaffold();
  const persistentSnapshot =
    buildReplayIntelligencePersistentSnapshot(
      orchestrationSnapshot,
      REPLAY_INTELLIGENCE_RESTORATION_PERSISTED_AT,
    );
  const recoveryMetadata =
    buildReplayIntelligenceRecoveryMetadata(
      orchestrationSnapshot,
      REPLAY_INTELLIGENCE_RESTORATION_PERSISTED_AT,
    );
  const recoverySnapshot =
    buildReplayIntelligenceRecoverySnapshot(
      orchestrationSnapshot,
      persistentSnapshot,
      recoveryMetadata,
      REPLAY_INTELLIGENCE_RESTORATION_RECOVERED_AT,
    );
  const recoveryResult =
    buildReplayIntelligenceRecoveryResult(recoverySnapshot);
  const rollbackCandidate =
    buildReplayIntelligenceRollbackCandidate(recoverySnapshot);
  const restorationSnapshot =
    buildReplayIntelligenceRestorationSnapshot(
      orchestrationSnapshot,
      recoverySnapshot,
      rollbackCandidate,
      REPLAY_INTELLIGENCE_RESTORATION_RESTORED_AT,
    );
  const restorationResult =
    buildReplayIntelligenceRestorationResult(restorationSnapshot);
  const replayTimeline =
    buildReplayIntelligenceReplayTimeline(restorationSnapshot);
  const checkpoint =
    buildReplayIntelligenceRestorationCheckpoint(restorationSnapshot);
  const reducerState =
    buildReplayIntelligenceReducerState(
      orchestrationSnapshot,
      persistentSnapshot,
      recoverySnapshot,
      restorationSnapshot,
    );
  const replaybackState =
    buildReplayIntelligenceReplaybackState(
      reducerState,
      replayTimeline,
      REPLAY_INTELLIGENCE_REPLAYBACK_REPLAYED_AT,
    );
  const reducerResult =
    buildReplayIntelligenceRestorationReducerResult(replaybackState);
  const replaybackCheckpoint =
    buildReplayIntelligenceReplaybackCheckpoint(replaybackState);

  return {
    orchestrationSnapshot,
    persistentSnapshot,
    recoveryMetadata,
    recoverySnapshot,
    recoveryResult,
    rollbackCandidate,
    restorationSnapshot,
    restorationResult,
    replayTimeline,
    checkpoint,
    reducerState,
    replaybackState,
    reducerResult,
    replaybackCheckpoint,
  };
}

function filterForensicIntelligenceRecords(
  records: readonly ReplayForensicIntelligenceRecordRow[],
  filter: ReplayForensicIntelligenceFilter,
): readonly ReplayForensicIntelligenceRecordRow[] {
  return records.filter((record) =>
    (!filter.severity || record.severity === filter.severity) &&
    (!filter.category || record.category === filter.category),
  );
}

function replayIntelligenceAuditApiRecord(
  record: ReplayIntelligenceAuditRecord,
): ReplayIntelligenceAuditApiRecord {
  return {
    ...record,
    audit_hash: buildReplayIntelligenceAuditHash(record),
  };
}

function sortReplayIntelligenceAuditRows(
  records: readonly ReplayIntelligenceAuditRecord[],
): ReplayIntelligenceAuditRecord[] {
  return [...records].sort((left, right) =>
    right.generated_at.localeCompare(left.generated_at) ||
    left.replay_id.localeCompare(right.replay_id) ||
    left.analytics_hash.localeCompare(right.analytics_hash) ||
    left.convergence_hash.localeCompare(right.convergence_hash),
  );
}

function sortReplayIntelligenceAuditTimelineRows(
  records: readonly ReplayIntelligenceAuditRecord[],
): ReplayIntelligenceAuditRecord[] {
  return [...records].sort((left, right) =>
    left.generated_at.localeCompare(right.generated_at) ||
    left.replay_id.localeCompare(right.replay_id) ||
    left.analytics_hash.localeCompare(right.analytics_hash) ||
    left.convergence_hash.localeCompare(right.convergence_hash),
  );
}

function replayIntelligenceAuditGeneratedAt(
  records: readonly ReplayIntelligenceAuditRecord[],
): string {
  return sortReplayIntelligenceAuditRows(records)[0]?.generated_at ??
    REPLAY_INTELLIGENCE_AUDIT_GENERATED_AT;
}

export function registerPipelineRoutes(app: Express) {

  /* ══════════════════════════════════════════════════════
     DELIVERY API — public
     ══════════════════════════════════════════════════════ */
  /**
   * GET /api/replay/audits/:gameId
   *
   * Lists persisted replay audits for a game, newest first.
   */
  app.get("/api/replay/intelligence/snapshot/:snapshotId", (req: Request, res: Response) => {
    const snapshotId = routeParam(req.params.snapshotId);
    if (!snapshotId) {
      return res.status(400).json(replayIntelligenceErrorEnvelope(
        req,
        "error",
        replayIntelligenceError("invalid_request", "snapshotId is required", "snapshotId"),
      ));
    }

    const snapshot = getReplayIntelligenceSnapshot(snapshotId);
    if (!snapshot) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence snapshot not found", "snapshotId"),
      ));
    }

    const response: ReplayIntelligenceSnapshotLookupResponse = { snapshot };
    return res.json(replayIntelligenceEnvelope(req, response, snapshot.deterministic_hash));
  });

  app.get("/api/replay/intelligence/snapshots/:scope/:scopeId", (req: Request, res: Response) => {
    const scope = routeParam(req.params.scope) as ReplayIntelligenceRecordScope;
    const scopeId = routeParam(req.params.scopeId);
    const pagination = replayIntelligencePagination(req);
    const snapshots = listReplayIntelligenceSnapshots(scope, scopeId);
    const page = paginateReplayIntelligenceRows(
      snapshots,
      pagination,
      (snapshot) => snapshot.snapshot_id,
    );
    const response: ReplayIntelligenceSnapshotListResponse = {
      scope,
      scope_id: scopeId,
      count: page.rows.length,
      snapshots: page.rows,
    };

    return res.json(replayIntelligenceEnvelope(
      req,
      response,
      snapshots.map((snapshot) => snapshot.deterministic_hash).join("|"),
      page.pageInfo,
    ));
  });

  app.get("/api/replay/intelligence/forensic/snapshot/:snapshotId", (req: Request, res: Response) => {
    const snapshotId = routeParam(req.params.snapshotId);
    const filter: ReplayForensicIntelligenceFilter = {
      snapshot_id: snapshotId,
      archive_id: null,
      replay_hash: null,
      severity: queryString(req, "severity") as ReplayForensicIntelligenceFilter["severity"],
      category: queryString(req, "category"),
    };
    const pagination = replayIntelligencePagination(req);
    const records = filterForensicIntelligenceRecords(
      listReplayForensicIntelligenceBySnapshot(snapshotId),
      filter,
    );
    const page = paginateReplayIntelligenceRows(records, pagination, (record) => record.record_id);
    const response: ReplayForensicIntelligenceLookupResponse = {
      filters: filter,
      count: page.rows.length,
      records: page.rows,
    };

    return res.json(replayIntelligenceEnvelope(
      req,
      response,
      records.map((record) => record.deterministic_hash).join("|"),
      page.pageInfo,
    ));
  });

  app.get("/api/replay/intelligence/forensic/archive/:archiveId", (req: Request, res: Response) => {
    const archiveId = routeParam(req.params.archiveId);
    const filter: ReplayForensicIntelligenceFilter = {
      snapshot_id: null,
      archive_id: archiveId,
      replay_hash: null,
      severity: queryString(req, "severity") as ReplayForensicIntelligenceFilter["severity"],
      category: queryString(req, "category"),
    };
    const pagination = replayIntelligencePagination(req);
    const records = filterForensicIntelligenceRecords(
      listReplayForensicIntelligenceByArchive(archiveId),
      filter,
    );
    const page = paginateReplayIntelligenceRows(records, pagination, (record) => record.record_id);
    const response: ReplayForensicIntelligenceLookupResponse = {
      filters: filter,
      count: page.rows.length,
      records: page.rows,
    };

    return res.json(replayIntelligenceEnvelope(
      req,
      response,
      records.map((record) => record.deterministic_hash).join("|"),
      page.pageInfo,
    ));
  });

  app.get("/api/replay/intelligence/forensic/replay/:replayHash", (req: Request, res: Response) => {
    const replayHash = routeParam(req.params.replayHash);
    const filter: ReplayForensicIntelligenceFilter = {
      snapshot_id: null,
      archive_id: null,
      replay_hash: replayHash,
      severity: queryString(req, "severity") as ReplayForensicIntelligenceFilter["severity"],
      category: queryString(req, "category"),
    };
    const pagination = replayIntelligencePagination(req);
    const records = filterForensicIntelligenceRecords(
      listReplayForensicIntelligenceByReplayHash(replayHash),
      filter,
    );
    const page = paginateReplayIntelligenceRows(records, pagination, (record) => record.record_id);
    const response: ReplayForensicIntelligenceLookupResponse = {
      filters: filter,
      count: page.rows.length,
      records: page.rows,
    };

    return res.json(replayIntelligenceEnvelope(
      req,
      response,
      records.map((record) => record.deterministic_hash).join("|"),
      page.pageInfo,
    ));
  });

  app.get("/api/replay/intelligence/evolution/archive/:archiveId/latest", (req: Request, res: Response) => {
    const archiveId = routeParam(req.params.archiveId);
    const metric = getLatestReplayEvolutionMetricByArchive(archiveId);
    const response: ReplayEvolutionAnalyticsResponse = {
      archive_id: archiveId,
      game_id: metric?.game_id ?? null,
      count: metric ? 1 : 0,
      metrics: metric ? [metric] : [],
    };

    return res.json(replayIntelligenceEnvelope(
      req,
      response,
      metric?.deterministic_hash ?? `empty|${archiveId}`,
    ));
  });

  app.get("/api/replay/intelligence/evolution/game/:gameId", (req: Request, res: Response) => {
    const gameId = routeParam(req.params.gameId);
    const pagination = replayIntelligencePagination(req);
    const metrics = listReplayEvolutionMetricsByGame(gameId);
    const page = paginateReplayIntelligenceRows(metrics, pagination, (metric) => metric.metric_id);
    const response: ReplayEvolutionAnalyticsResponse = {
      archive_id: null,
      game_id: gameId,
      count: page.rows.length,
      metrics: page.rows,
    };

    return res.json(replayIntelligenceEnvelope(
      req,
      response,
      metrics.map((metric) => metric.deterministic_hash).join("|"),
      page.pageInfo,
    ));
  });

  app.get("/api/replay/intelligence/lineage/root/:rootArchiveId", (req: Request, res: Response) => {
    const rootArchiveId = routeParam(req.params.rootArchiveId);
    const pagination = replayIntelligencePagination(req);
    const metrics = listReplayLineageIntelligenceByRootArchive(rootArchiveId);
    const page = paginateReplayIntelligenceRows(metrics, pagination, (metric) => metric.metric_id);
    const response: ReplayLineageIntelligenceAnalyticsResponse = {
      root_archive_id: rootArchiveId,
      archive_id: null,
      count: page.rows.length,
      metrics: page.rows,
    };

    return res.json(replayIntelligenceEnvelope(
      req,
      response,
      metrics.map((metric) => metric.deterministic_hash).join("|"),
      page.pageInfo,
    ));
  });

  app.get("/api/replay/intelligence/lineage/archive/:archiveId/latest", (req: Request, res: Response) => {
    const archiveId = routeParam(req.params.archiveId);
    const metric = getLatestReplayLineageIntelligenceByArchive(archiveId);
    const response: ReplayLineageIntelligenceAnalyticsResponse = {
      root_archive_id: metric?.root_archive_id ?? null,
      archive_id: archiveId,
      count: metric ? 1 : 0,
      metrics: metric ? [metric] : [],
    };

    return res.json(replayIntelligenceEnvelope(
      req,
      response,
      metric?.deterministic_hash ?? `empty|${archiveId}`,
    ));
  });

  app.get("/api/replay/intelligence/audit/snapshot/:snapshotId", (req: Request, res: Response) => {
    const snapshotId = routeParam(req.params.snapshotId);
    const pagination = replayIntelligencePagination(req);
    const analytics = listReplayAuditAnalyticsBySnapshot(snapshotId);
    const page = paginateReplayIntelligenceRows(analytics, pagination, (row) => row.analytics_id);
    const response: ReplayAuditAnalyticsSummaryResponse = {
      scope: null,
      scope_id: null,
      snapshot_id: snapshotId,
      count: page.rows.length,
      analytics: page.rows,
    };

    return res.json(replayIntelligenceEnvelope(
      req,
      response,
      analytics.map((row) => row.deterministic_hash).join("|"),
      page.pageInfo,
    ));
  });

  app.get("/api/replay/intelligence/audit/:scope/:scopeId", (req: Request, res: Response) => {
    const scope = routeParam(req.params.scope) as ReplayIntelligenceRecordScope;
    const scopeId = routeParam(req.params.scopeId);
    const pagination = replayIntelligencePagination(req);
    const analytics = listReplayAuditAnalytics(scope, scopeId);
    const page = paginateReplayIntelligenceRows(analytics, pagination, (row) => row.analytics_id);
    const response: ReplayAuditAnalyticsSummaryResponse = {
      scope,
      scope_id: scopeId,
      snapshot_id: null,
      count: page.rows.length,
      analytics: page.rows,
    };

    return res.json(replayIntelligenceEnvelope(
      req,
      response,
      analytics.map((row) => row.deterministic_hash).join("|"),
      page.pageInfo,
    ));
  });

  app.get("/api/replay/intelligence/mutations/snapshot/:snapshotId/trends", (req: Request, res: Response) => {
    const snapshotId = routeParam(req.params.snapshotId);
    const snapshot = getReplayIntelligenceSnapshot(snapshotId);
    if (!snapshot) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence snapshot not found", "snapshotId"),
      ));
    }

    const response: ReplayMutationTrendAnalyticsResponse = {
      snapshot_id: snapshotId,
      count: snapshot.mutation_frequency.length,
      mutation_frequency: snapshot.mutation_frequency,
    };

    return res.json(replayIntelligenceEnvelope(req, response, snapshot.deterministic_hash));
  });

  app.get("/api/replay/intelligence/drift/snapshot/:snapshotId/summary", (req: Request, res: Response) => {
    const snapshotId = routeParam(req.params.snapshotId);
    const snapshot = getReplayIntelligenceSnapshot(snapshotId);
    if (!snapshot) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence snapshot not found", "snapshotId"),
      ));
    }

    const response: ReplayDriftIntelligenceSummaryResponse = {
      snapshot_id: snapshotId,
      drift_trends: snapshot.drift_trends,
    };

    return res.json(replayIntelligenceEnvelope(req, response, snapshot.deterministic_hash));
  });

  app.get("/api/replay/audits/:gameId", (req: Request, res: Response) => {
    const gameId = routeParam(req.params.gameId);
    if (!gameId) return res.status(400).json({ error: "gameId is required" });

    const audits = listReplayAuditsByGameId(gameId);
    const response: ReplayAuditListResponse = {
      game_id: gameId,
      count: audits.length,
      audits,
    };

    return res.json(response);
  });

  /**
   * GET /api/replay/audit/:replayHash
   *
   * Returns the latest persisted audit row for a replay hash.
   */
  app.get("/api/replay/audit/:replayHash", (req: Request, res: Response) => {
    const replayHash = routeParam(req.params.replayHash);
    if (!replayHash) return res.status(400).json({ error: "replayHash is required" });

    const audit = getReplayAuditByReplayHash(replayHash);
    if (!audit) return res.status(404).json({ error: "Replay audit not found" });

    const response: ReplayAuditDetailResponse = { audit };
    return res.json(response);
  });

  /**
   * GET /api/replay/verification/:replayHash/latest
   *
   * Returns the latest verification record for a replay hash.
   */
  app.get("/api/replay/verification/:replayHash/latest", (req: Request, res: Response) => {
    const replayHash = routeParam(req.params.replayHash);
    if (!replayHash) return res.status(400).json({ error: "replayHash is required" });

    const verification = getLatestReplayVerification(replayHash);
    if (!verification) return res.status(404).json({ error: "Replay verification not found" });

    const response: ReplayVerificationLatestResponse = { verification };
    return res.json(response);
  });

  /**
   * GET /api/replay/verification/:replayHash/history
   *
   * Lists verification records for a replay hash, newest first.
   */
  app.get("/api/replay/verification/:replayHash/history", (req: Request, res: Response) => {
    const replayHash = routeParam(req.params.replayHash);
    if (!replayHash) return res.status(400).json({ error: "replayHash is required" });

    const history = listReplayVerificationHistory(replayHash);
    const response: ReplayVerificationHistoryResponse = {
      replay_hash: replayHash,
      count: history.length,
      history,
    };

    return res.json(response);
  });

  /**
   * GET /api/replay/provenance/:replayHash
   *
   * Returns provenance metadata for a replay hash.
   */
  app.get("/api/replay/provenance/:replayHash", (req: Request, res: Response) => {
    const replayHash = routeParam(req.params.replayHash);
    if (!replayHash) return res.status(400).json({ error: "replayHash is required" });

    const provenance = getReplayProvenance(replayHash);
    if (!provenance) return res.status(404).json({ error: "Replay provenance not found" });

    const response: ReplayProvenanceResponse = { provenance };
    return res.json(response);
  });

  /**
   * GET /api/replay/lineage/:replayHash/children
   *
   * Lists child replay audits that reference the provided replay hash as parent.
   */
  app.get("/api/replay/lineage/:replayHash/children", (req: Request, res: Response) => {
    const replayHash = routeParam(req.params.replayHash);
    if (!replayHash) return res.status(400).json({ error: "replayHash is required" });

    const children = listReplayLineageChildren(replayHash);
    const response: ReplayLineageChildrenResponse = {
      replay_hash: replayHash,
      count: children.length,
      children,
    };

    return res.json(response);
  });

  /**
   * GET /api/replay/lineage/:replayHash/parents
   *
   * Traverses parent replay audits from the provided child replay hash.
   */
  app.get("/api/replay/lineage/:replayHash/parents", (req: Request, res: Response) => {
    const replayHash = routeParam(req.params.replayHash);
    if (!replayHash) return res.status(400).json({ error: "replayHash is required" });

    const parents = listReplayLineageParents(replayHash);
    const response: ReplayLineageParentsResponse = {
      replay_hash: replayHash,
      count: parents.length,
      parents,
    };

    return res.json(response);
  });

  /**
   * GET /api/replay/divergence/:replayHash/history
   *
   * Lists persisted replay divergence analyses, newest first.
   */
  app.get("/api/replay/divergence/:replayHash/history", (req: Request, res: Response) => {
    const replayHash = routeParam(req.params.replayHash);
    if (!replayHash) return res.status(400).json({ error: "replayHash is required" });

    const history = listReplayDivergenceAnalysisHistory(replayHash);
    const response: ReplayDivergenceHistoryResponse = {
      replay_hash: replayHash,
      count: history.length,
      history,
    };

    return res.json(response);
  });

  /**
   * GET /api/replay/divergence/:replayHash/latest
   *
   * Returns the latest persisted replay divergence analysis.
   */
  app.get("/api/replay/divergence/:replayHash/latest", (req: Request, res: Response) => {
    const replayHash = routeParam(req.params.replayHash);
    if (!replayHash) return res.status(400).json({ error: "replayHash is required" });

    const divergence = getLatestReplayDivergenceAnalysis(replayHash);
    if (!divergence) return res.status(404).json({ error: "Replay divergence history not found" });

    const response: ReplayDivergenceHistoryLatestResponse = { divergence };
    return res.json(response);
  });

  /**
   * GET /api/replay/divergence/:replayHash
   *
   * Deterministic replay divergence analytics.
   */
  app.get("/api/replay/divergence/:replayHash", (req: Request, res: Response) => {
    const replayHash = routeParam(req.params.replayHash);
    if (!replayHash) return res.status(400).json({ error: "replayHash is required" });

    const divergence = analyzeReplayDivergence(replayHash);
    if (!divergence) return res.status(404).json({ error: "Replay divergence record not found" });

    return res.json(divergence);
  });

  /**
   * GET /api/replay/confidence/:replayHash
   *
   * Returns deterministic replay confidence propagation.
   */
  app.get("/api/replay/confidence/:replayHash", (req: Request, res: Response) => {
    const replayHash = routeParam(req.params.replayHash);
    if (!replayHash) return res.status(400).json({ error: "replayHash is required" });

    const confidence = propagateReplayConfidence(replayHash);
    if (!confidence) return res.status(404).json({ error: "Replay confidence not found" });

    return res.json(confidence);
  });

  /**
   * GET /api/replay/forensics/:replayHash
   *
   * Returns deterministic replay audit inspection data.
   */
  app.get("/api/replay/forensics/:replayHash", (req: Request, res: Response) => {
    const replayHash = routeParam(req.params.replayHash);
    if (!replayHash) return res.status(400).json({ error: "replayHash is required" });

    const forensics = inspectReplayForensics(replayHash);
    if (!forensics) return res.status(404).json({ error: "Replay forensics not found" });

    return res.json(forensics);
  });

  /**
   * GET /api/replay/:gameId/forensic/export
   *
   * Returns the latest replay forensic export bundle for a game.
   */
  app.get("/api/replay/:gameId/forensic/export", (req: Request, res: Response) => {
    const gameId = routeParam(req.params.gameId);
    if (!gameId) return res.status(400).json({ error: "gameId is required" });

    const replayHash = latestReplayHashForGame(gameId);
    if (!replayHash) return res.status(404).json({ error: "Replay audit not found for game" });

    const bundle = buildReplayAuditExportBundle(replayHash);
    if (!bundle) return res.status(404).json({ error: "Replay forensic export not found" });

    return res.json(bundle);
  });

  /**
   * GET /api/replay/:gameId/forensic/report
   *
   * Returns the latest replay forensic overview report for a game.
   */
  app.get("/api/replay/:gameId/forensic/report", (req: Request, res: Response) => {
    const gameId = routeParam(req.params.gameId);
    if (!gameId) return res.status(400).json({ error: "gameId is required" });

    const replayHash = latestReplayHashForGame(gameId);
    if (!replayHash) return res.status(404).json({ error: "Replay audit not found for game" });

    const report = buildReplayForensicOverview(replayHash);
    if (!report) return res.status(404).json({ error: "Replay forensic report not found" });

    return res.json(report);
  });

  /**
   * GET /api/replay/:gameId/forensic/lineage
   *
   * Returns the latest lineage-aware forensic package for a game.
   */
  app.get("/api/replay/:gameId/forensic/lineage", (req: Request, res: Response) => {
    const gameId = routeParam(req.params.gameId);
    if (!gameId) return res.status(400).json({ error: "gameId is required" });

    const replayHash = latestReplayHashForGame(gameId);
    if (!replayHash) return res.status(404).json({ error: "Replay audit not found for game" });

    const lineage = buildLineageForensicPackage(replayHash);
    if (!lineage) return res.status(404).json({ error: "Replay forensic lineage not found" });

    return res.json(lineage);
  });

  /**
   * GET /api/replay/:gameId/forensic/confidence
   *
   * Returns the latest replay forensic confidence summary for a game.
   */
  app.get("/api/replay/:gameId/forensic/confidence", (req: Request, res: Response) => {
    const gameId = routeParam(req.params.gameId);
    if (!gameId) return res.status(400).json({ error: "gameId is required" });

    const replayHash = latestReplayHashForGame(gameId);
    if (!replayHash) return res.status(404).json({ error: "Replay audit not found for game" });

    const confidence = buildReplayConfidenceSummary(replayHash);
    if (!confidence) return res.status(404).json({ error: "Replay forensic confidence not found" });

    return res.json(confidence);
  });

  /**
   * GET /api/replay/:gameId
   *
   * Deterministic replay reconstruction endpoint.
   *
   * Query params:
   *   asOf — optional ISO timestamp replay cutoff
   */
  app.get("/api/replay/:gameId", (req: Request, res: Response) => {
    try {
      const gameId = String(req.params.gameId);
      const asOf =
  typeof req.query.asOf === "string"
    ? req.query.asOf
    : Array.isArray(req.query.asOf) && typeof req.query.asOf[0] === "string"
      ? req.query.asOf[0]
      : new Date().toISOString();

      if (!gameId) {
        return res.status(400).json({
          error: "gameId is required",
        });
      }

      const replay = getReplayState(gameId, asOf);

      if (!replay) {
        return res.status(404).json({
          error: "Replay state not found",
        });
      }

      const response = mapReplayToApiResponse(replay);

      return res.json(response);
    } catch (err: any) {
      console.error("[replay-api]", err);

      return res.status(500).json({
        error: err.message ?? "Replay API failure",
      });
    }
  });
  /**
   * GET /api/v2/signals
   *
   * Query params:
   *   league  — NBA | MLB | NFL | CFB
   *   since   — ISO timestamp (e.g. 2026-04-26T00:00:00Z)
   *   limit   — default 50, max 200
   *   band    — Elite | Strong | Watchlist | Informational
   *   type    — signal_type filter
   *
   * Returns: LiveSignal[] sorted by score DESC
   *
   * Example:
   *   GET /api/v2/signals?league=NBA&limit=20
   *   GET /api/v2/signals?since=2026-04-26T12:00:00Z&band=Elite
   */
  app.get("/api/v2/signals", (req: Request, res: Response) => {
    const { league, since, band, type } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Number(req.query.limit ?? 50), 200);

    const pdb = getPipelineDb();
    const conds: string[] = [];
    const params: unknown[] = [];
    if (league) { conds.push("league=?"); params.push(league); }
    if (since)  { conds.push("created_at>=?"); params.push(since); }
    if (band)   { conds.push("score_band=?"); params.push(band); }
    if (type)   { conds.push("signal_type=?"); params.push(type); }
    const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
    const rows = pdb.prepare(
      `SELECT * FROM live_signals ${where} ORDER BY created_at DESC LIMIT ?`
    ).all(...params, limit) as any[];

    const signals = rows.map(row => ({
      ...row,
      sources: JSON.parse(row.sources ?? "[]"),
      line_movement: row.line_movement ? JSON.parse(row.line_movement) : null,
      breakdown: JSON.parse(row.breakdown ?? "{}"),
      raw_event_ids: JSON.parse(row.raw_event_ids ?? "[]"),
      betting_relevance: row.betting_relevance === 1,
      fantasy_relevance: row.fantasy_relevance === 1,
    }));

    res.json({ count: signals.length, signals });
  });

  /**
   * GET /api/v2/signals/:id
   *
   * Returns: LiveSignal with full breakdown
   *
   * Example:
   *   GET /api/v2/signals/550e8400-e29b-41d4-a716-446655440000
   */
  app.get("/api/v2/signals/:id", (req: Request, res: Response) => {
    const signal = getLiveSignal(req.params.id as string);
    if (!signal) return res.status(404).json({ error: "Signal not found" });
    return res.json(signal);
  });

  /**
   * GET /api/v2/situations
   *
   * Canonical situation feed for future board/homepage use.
   * Signals remain the public delivery surface during the transition.
   */
  app.get("/api/v2/situations", (req: Request, res: Response) => {
    const {
      league,
      sport,
      situation_type,
      situationType,
      state,
      lifecycle_state,
      active_only,
      activeOnly,
      order_by,
      orderBy,
    } = req.query as {
      league?: string;
      sport?: string;
      situation_type?: string;
      situationType?: string;
      state?: string;
      lifecycle_state?: string;
      active_only?: string;
      activeOnly?: string;
      order_by?: CanonicalSituationOrderBy;
      orderBy?: CanonicalSituationOrderBy;
    };
    const limit = Math.min(Math.max(Number(req.query.limit ?? 100), 0), 250);
    const validOrder = new Set(["operational_visibility_score", "escalation_score", "confidence", "updated_at"]);
    const requestedOrder = order_by ?? orderBy;
    const requestedActiveOnly = active_only ?? activeOnly;
    const situations = listCanonicalSituationApiResponses({
      league,
      sport,
      situationType: situation_type ?? situationType,
      lifecycleState: state ?? lifecycle_state,
      activeOnly: requestedActiveOnly === "true" || requestedActiveOnly === "1",
      orderBy: validOrder.has(requestedOrder ?? "") ? requestedOrder : "updated_at",
      limit,
    });
    return res.json({ count: situations.length, situations });
  });

  /**
   * GET /api/v2/games
   *
   * Query params:
   *   league  — NBA | MLB | NFL | CFB
   *
   * Example:
   *   GET /api/v2/games?league=MLB
   */
  app.get("/api/v2/games", (req: Request, res: Response) => {
    const { league } = req.query as { league?: string };
    const games = getGames(league);
    res.json({ count: games.length, games });
  });

  /* ══════════════════════════════════════════════════════
     INGESTION API — admin-gated
     ══════════════════════════════════════════════════════ */

  /**
   * POST /api/pipeline/ingest/manual
   *
   * Creates a RawEvent by hand (operator use).
   * The event is immediately processed into a LiveSignal.
   *
   * Body:
   * {
   *   "password": "edgesetter-admin-2026",
   *   "league": "NBA",
   *   "team": "BOS",
   *   "player": "Jayson Tatum",
   *   "event_type": "injury_update",
   *   "payload": {
   *     "designation": "Questionable",
   *     "body_part": "ankle",
   *     "notes": "Tatum tweaked ankle in practice — status TBD.",
   *     "confidence": 72,
   *     "confirmation": "Developing",
   *     "source_types": ["beat_reporter"],
   *     "source_labels": ["ESPN Adrian Wojnarowski"],
   *     "source_count": 1,
   *     "sources": [{ "name": "ESPN Woj", "type": "beat_reporter" }]
   *   }
   * }
   *
   * Returns: { raw_event, signal }
   *
   * Supported event_types:
   *   injury_update | lineup_confirm | lineup_change | line_move |
   *   weather_update | scheme_note | transaction | eligibility_ruling | manual
   */
  app.post("/api/pipeline/ingest/manual", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;

    const { league, team, player, event_type, game_id, payload } = req.body;
    if (!league || !event_type || !payload) {
      return res.status(400).json({ error: "league, event_type, and payload are required" });
    }

    const VALID_LEAGUES = ["NBA", "MLB", "NFL", "CFB"];
    const VALID_TYPES: RawEventType[] = [
      "injury_update", "lineup_confirm", "lineup_change", "line_move",
      "weather_update", "scheme_note", "transaction", "eligibility_ruling", "manual", "odds_open",
    ];

    if (!VALID_LEAGUES.includes(league)) {
      return res.status(400).json({ error: `Invalid league. Must be one of: ${VALID_LEAGUES.join(", ")}` });
    }
    if (!VALID_TYPES.includes(event_type)) {
      return res.status(400).json({ error: `Invalid event_type. Must be one of: ${VALID_TYPES.join(", ")}` });
    }

    try {
      const raw = insertRawEvent({
        source_id: "operator",
        source_type: "manual",
        league: league as League,
        game_id: game_id ?? null,
        team: team ?? null,
        player: player ?? null,
        event_type: event_type as RawEventType,
        payload,
      });

      // Process immediately
      const signal = await processOne(raw);

      return res.json({
        success: true,
        raw_event: raw,
        signal,
      });
    } catch (err: any) {
      console.error("[pipeline/manual]", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/pipeline/ingest/run
   *
   * Triggers a full ingest + process cycle (all adapters).
   * Admin-gated. Useful for on-demand refresh without waiting for scheduler.
   *
   * Body: { "password": "edgesetter-admin-2026" }
   */
  app.post("/api/pipeline/ingest/run", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const result = await runIngestionCycle();
      return res.json({ success: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/pipeline/ingest/nfl
   *
   * Manually trigger NFL odds + injury ingestion (bypasses season guard).
   * Useful for preseason testing or on-demand refresh.
   *
   * Body: { "password": "..." }
   */
  app.post("/api/pipeline/ingest/nfl", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const [odds, injuries] = await Promise.all([
        ingestOdds("NFL").catch(e => ({ games: 0, events: 0, error: e.message })),
        ingestNFLInjuries().catch(e => ({ created: 0, skipped: 0, error: e.message })),
      ]);
      const processed = await processRawEvents().catch(e => ({ processed: 0, errors: 0 }));
      return res.json({ success: true, odds, injuries, processed });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/internal/nfl-keepalive-a7x9k
   *
   * Unauthenticated ingest trigger for UptimeRobot keepalive.
   * Obscured path is the only protection — do not publicize this URL.
   * Triggers the same NFL ingest cycle as the admin route.
   */
  app.post("/api/internal/nfl-keepalive-a7x9k", async (req: Request, res: Response) => {
    try {
      const [odds, injuries] = await Promise.all([
        ingestOdds("NFL").catch((e: any) => ({ games: 0, events: 0, error: e.message })),
        ingestNFLInjuries().catch((e: any) => ({ created: 0, skipped: 0, error: e.message })),
      ]);
      const processed = await processRawEvents().catch((e: any) => ({ processed: 0, errors: 0 }));
      return res.json({ success: true, source: "keepalive", odds, injuries, processed });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/pipeline/ingest/cfb
   *
   * Manually trigger CFB odds + injury ingestion (bypasses season guard).
   *
   * Body: { "password": "..." }
   */
  app.post("/api/pipeline/ingest/cfb", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const [odds, injuries] = await Promise.all([
        ingestOdds("CFB").catch(e => ({ games: 0, events: 0, error: e.message })),
        ingestCFBInjuries().catch(e => ({ created: 0, skipped: 0, error: e.message })),
      ]);
      const processed = await processRawEvents().catch(e => ({ processed: 0, errors: 0 }));
      return res.json({ success: true, odds, injuries, processed });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/pipeline/process
   *
   * Runs the processor against all pending unprocessed RawEvents.
   * Admin-gated. Useful if ingestion ran but processor was skipped.
   */
  app.post("/api/pipeline/process", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const result = await processRawEvents();
      return res.json({ success: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/pipeline/raw-events
   *
   * View raw events (admin). Useful for debugging the pipeline.
   *
   * Query params:
   *   league    — filter by league
   *   processed — "true" | "false" | unset (all)
   *   limit     — default 50
   */
  app.get("/api/pipeline/raw-events", (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const { league } = req.query as { league?: string };
    const processed = req.query.processed === "true" ? true
      : req.query.processed === "false" ? false
      : undefined;
    const limit = Math.min(Number(req.query.limit ?? 50), 500);

    const events = getRawEvents({ league: league as League | undefined, processed, limit });
    return res.json({ count: events.length, events });
  });

  /**
   * GET /api/pipeline/status
   *
   * Pipeline health summary — useful for the ops dashboard.
   */
  app.get("/api/pipeline/status", (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const pending = getRawEvents({ processed: false, limit: 500 });
    const recent = getLiveSignals({ limit: 20 });
    const byLeague = { NBA: 0, MLB: 0, NFL: 0, CFB: 0 } as Record<string, number>;
    recent.forEach(s => { byLeague[s.league] = (byLeague[s.league] ?? 0) + 1; });

    return res.json({
      pending_raw_events: pending.length,
      recent_signals_count: recent.length,
      signals_by_league: byLeague,
      top_signal: recent[0] ?? null,
    });
  });

  /* ══════════════════════════════════════════════════════
     OUTCOMES — CLV computation implemented
     ══════════════════════════════════════════════════════ */

  /**
   * POST /api/outcomes
   *
   * Record the final result for a game market and auto-compute CLV.
   *
   * CLV model:
   *   For spreads and totals:
   *     clv_points = line_at_signal − closing_line
   *     Positive  = we got the better number (beat the close)
   *     Negative  = market moved against us
   *
   *   For moneylines:
   *     clv_points = null (not yet computed — moneyline CLV deferred)
   *
   *   Pure scheme/context signals with no numeric market:
   *     clv_points = null
   *
   * Body:
   * {
   *   "password": "edgesetter-admin-2026",
   *   "signal_id": "<uuid>",
   *   "game_id": "<game_id>",
   *   "market": "spread",         // spread | total | moneyline
   *   "home_score": 112,
   *   "away_score": 108,
   *   "line_at_signal": -6.5,     // line when signal was generated
   *   "closing_line": -7.5,       // line at game start
   *   "actual_result": 4,
   *   "hit": true
   * }
   *
   * Response includes computed clv_points.
   */
  app.post("/api/outcomes", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const { signal_id, game_id, market, home_score, away_score,
            line_at_signal, closing_line, actual_result, hit } = req.body;

    if (!signal_id || !game_id) {
      return res.status(400).json({ error: "signal_id and game_id are required" });
    }

    // ── CLV computation ────────────────────────────────────────
    //
    // CLV is only meaningful for numeric markets (spread / total).
    // Moneyline CLV requires implied-probability conversion — deferred.
    // Pure context signals with no numeric line → null.
    //
    let computedClv: number | null = null;
    const mkt: string = market ?? "spread";

    if ((mkt === "spread" || mkt === "total")
        && line_at_signal != null && closing_line != null) {
      // line_at_signal: the number we recommended acting on.
      // closing_line:   the market's final number at game time.
      //
      // For spreads — positive means we got the better number:
      //   e.g. signal said -3, closed -5 → we beat the close by 2 pts → +2.0
      //   e.g. signal said -6.5, closed -5 → market moved in our favour? No —
      //        the team is now a smaller fav, so we would have gotten more points
      //        at the close. This convention tracks: did the market validate us?
      //
      // Convention: clv_points = line_at_signal − closing_line
      //   Works for spreads (neg fav): signal=-3, close=-5 → -3−(−5) = +2 (we beat close)
      //   Works for totals: signal=220, close=224 → -4 (over bettor took worse number)
      //
      // Round to 1 decimal; cap at ±20 to guard against data entry errors
      computedClv = computeSpreadOrTotalClv(line_at_signal as number, closing_line as number);
    }
    // Moneyline CLV: deferred (not yet computed)
    // if (mkt === "moneyline") { ... }

    try {
      const outcome = createOutcome({
        signal_id,
        game_id,
        market: mkt as "spread" | "total" | "moneyline",
        home_score: home_score ?? null,
        away_score: away_score ?? null,
        line_at_signal: line_at_signal ?? null,
        closing_line: closing_line ?? null,
        actual_result: actual_result ?? null,
        hit: hit ?? null,
        clv: computedClv,
        recorded_at: new Date().toISOString(),
      });

      return res.json({
        success: true,
        outcome,
        clv_computed: computedClv !== null,
        clv_points: computedClv,
        clv_note: computedClv !== null
          ? `${computedClv > 0 ? "+" : ""}${computedClv} pts vs closing line (${computedClv > 0 ? "beat the close" : "market moved against signal"})`
          : mkt === "moneyline"
            ? "Moneyline CLV deferred — use clv_cents when implemented"
            : "No numeric line available — CLV not applicable for this signal type",
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/outcomes/:signal_id
   *
   * Get all outcomes recorded for a given signal.
   */
  app.get("/api/outcomes/:signal_id", (req: Request, res: Response) => {
    const signalId: string = req.params.signal_id as string;
    const outcomes = getOutcomes(signalId);
    return res.json({ count: outcomes.length, outcomes });
  });

  /**
   * GET /api/stats/track-record?league=NBA
   *
   * Returns aggregate hit-rate + avg CLV for a league (overall + per signal_type).
   * Window: all-time (no date filter). Only settled outcomes (hit IS NOT NULL) count.
   * Moneyline CLV is deferred so avg_clv_points excludes null clv rows.
   *
   * No auth required — display-only, no sensitive data.
   */
  app.get("/api/stats/track-record", (req: Request, res: Response) => {
    const league = (req.query.league as string ?? "").toUpperCase();
    const VALID = ["NBA", "MLB", "NFL", "CFB"];
    if (!VALID.includes(league)) {
      return res.status(400).json({
        error: `league must be one of: ${VALID.join(", ")}.`,
      });
    }
    try {
      const record = getTrackRecord(league);
      return res.json(record);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /* ══════════════════════════════════════════════════════
     SETTLEMENT — admin-gated
     ══════════════════════════════════════════════════════ */

  /**
   * POST /api/pipeline/settle
   *
   * Fetch final scores from NBA + MLB APIs and auto-settle all
   * signals for completed games. Recomputes source accuracy table.
   *
   * Body: { "password": "..." }
   *
   * This is also called automatically at the end of each ingestion cycle.
   */
  app.post("/api/pipeline/settle", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const result = await autoSettleFinishedGames();
      computeSourceAccuracy();
      return res.json({ success: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/pipeline/settle/:game_id
   *
   * Manually settle a specific game by providing the final scores.
   * Use this when auto-settlement misses a game (e.g. NFL/CFB with no adapter).
   *
   * Body:
   * {
   *   "password": "...",
   *   "home_score": 28,
   *   "away_score": 21
   * }
   */
  app.post("/api/pipeline/settle/:game_id", (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const { home_score, away_score } = req.body;
    if (home_score == null || away_score == null) {
      return res.status(400).json({ error: "home_score and away_score are required" });
    }
    try {
      const gameId = Array.isArray(req.params.game_id) ? req.params.game_id[0] : req.params.game_id;
      const result = settleGame(gameId, Number(home_score), Number(away_score));
      computeSourceAccuracy();
      return res.json({ success: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/pipeline/recompute-accuracy
   *
   * Force-recompute source accuracy stats from existing settled outcomes.
   * Useful after manual outcome edits via POST /api/outcomes.
   */
  app.post("/api/pipeline/recompute-accuracy", (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      computeSourceAccuracy();
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /* ══════════════════════════════════════════════════════
     BACKFILL — admin-gated
     ══════════════════════════════════════════════════════ */

  /**
   * POST /api/pipeline/backfill
   *
   * Trigger the full historical backfill.
   * Re-entrant: completed phases are skipped automatically.
   * This is a long-running operation (~5–20 min for full backfill).
   *
   * Body (all optional — defaults run all seasons):
   * {
   *   "password": "...",
   *   "nfl":  { "seasons": [2024, 2025] },
   *   "cfb":  { "seasons": [2024, 2025] },
   *   "nba":  { "seasons": ["2024-25", "2025-26"] },
   *   "mlb":  { "seasons": [2025, 2026] },
   *   "skipProcessing": false,
   *   "skipSettlement": false,
   *   "resetPhases": ["MLB"]   // clear phase records before running (forces re-run)
   * }
   */
  app.post("/api/pipeline/backfill", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const { nfl, cfb, nba, mlb, skipProcessing, skipSettlement, resetPhases } = req.body ?? {};
      const result = await runFullBackfill({ nfl, cfb, nba, mlb, skipProcessing, skipSettlement, resetPhases });
      return res.json({ success: result.errors.length === 0, ...result });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/pipeline/backfill-status
   *
   * Returns the current state of each backfill phase.
   * No auth required — read-only progress display.
   */
  app.get("/api/pipeline/backfill-status", (_req: Request, res: Response) => {
    try {
      const phases = getBackfillStatus();
      const summary = {
        total: phases.length,
        done: phases.filter(p => p.status === "done").length,
        running: phases.filter(p => p.status === "running").length,
        error: phases.filter(p => p.status === "error").length,
        pending: phases.filter(p => p.status === "pending").length,
      };
      return res.json({ summary, phases });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
/**
 * GET /api/replay-intelligence/anomaly-clusters
 *
 * Returns deterministic replay intelligence anomaly cluster scaffold data.
 */
app.get("/api/replay-intelligence/anomaly-clusters", (req: Request, res: Response) => {
  try {
    const generatedAt =
      queryString(req, "generated_at") ??
      "2026-01-01T00:00:00.000Z";
    const snapshot =
      buildDeterministicReplayIntelligenceOrchestrationSnapshot(generatedAt);

    return res.json(replayIntelligenceEnvelope(
      req,
      {
        generated_at: generatedAt,
        count: snapshot.anomaly_clusters.length,
        clusters: snapshot.anomaly_clusters,
      },
      snapshot.orchestration_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/replay-intelligence/anomaly-clusters/summary
 *
 * Returns deterministic replay intelligence anomaly cluster summary data.
 */
app.get("/api/replay-intelligence/anomaly-clusters/summary", (req: Request, res: Response) => {
  try {
    const generatedAt =
      queryString(req, "generated_at") ??
      "2026-01-01T00:00:00.000Z";
    const snapshot =
      buildDeterministicReplayIntelligenceOrchestrationSnapshot(generatedAt);
    const summary =
      buildReplayAnomalyClusterSummary(snapshot.anomaly_clusters, generatedAt);

    return res.json(replayIntelligenceEnvelope(
      req,
      summary,
      snapshot.orchestration_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/replay-intelligence/heatmap
 *
 * Returns deterministic replay intelligence heatmap scaffold data.
 */
app.get("/api/replay-intelligence/heatmap", (req: Request, res: Response) => {
  try {
    const generatedAt =
      queryString(req, "generated_at") ??
      "2026-01-01T00:00:00.000Z";
    const snapshot =
      buildDeterministicReplayIntelligenceOrchestrationSnapshot(generatedAt);

    return res.json(replayIntelligenceEnvelope(
      req,
      {
        generated_at: generatedAt,
        count: snapshot.heatmap.length,
        cells: snapshot.heatmap,
      },
      snapshot.orchestration_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/replay-intelligence/heatmap/summary
 *
 * Returns deterministic replay intelligence heatmap summary data.
 */
app.get("/api/replay-intelligence/heatmap/summary", (req: Request, res: Response) => {
  try {
    const generatedAt =
      queryString(req, "generated_at") ??
      "2026-01-01T00:00:00.000Z";
    const snapshot =
      buildDeterministicReplayIntelligenceOrchestrationSnapshot(generatedAt);
    const summary =
      buildReplayHeatmapSummary(snapshot.heatmap, generatedAt);

    return res.json(replayIntelligenceEnvelope(
      req,
      summary,
      snapshot.orchestration_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/replay-intelligence/orchestration
 *
 * Returns deterministic replay intelligence orchestration scaffold data.
 */
app.get("/api/replay-intelligence/orchestration", (req: Request, res: Response) => {
  try {
    const generatedAt =
      queryString(req, "generated_at") ??
      "2026-01-01T00:00:00.000Z";
    const scaffold =
      buildDeterministicReplayIntelligenceOrchestrationSnapshot(generatedAt);
    const snapshot =
      buildReplayIntelligenceOrchestrationSnapshot({
        generated_at: generatedAt,
        lineage_nodes: scaffold.lineage_nodes,
        anomaly_clusters: scaffold.anomaly_clusters,
        forecasts: scaffold.forecasts,
        heatmap: scaffold.heatmap,
        orchestration_hash: scaffold.orchestration_hash,
      });

    return res.json(replayIntelligenceEnvelope(
      req,
      snapshot,
      snapshot.orchestration_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/replay-intelligence/orchestration/summary
 *
 * Returns deterministic replay intelligence orchestration convergence summary data.
 */
app.get("/api/replay-intelligence/orchestration/summary", (req: Request, res: Response) => {
  try {
    const generatedAt =
      queryString(req, "generated_at") ??
      "2026-01-01T00:00:00.000Z";
    const scaffold =
      buildDeterministicReplayIntelligenceOrchestrationSnapshot(generatedAt);
    const snapshot =
      buildReplayIntelligenceOrchestrationSnapshot({
        generated_at: generatedAt,
        lineage_nodes: scaffold.lineage_nodes,
        anomaly_clusters: scaffold.anomaly_clusters,
        forecasts: scaffold.forecasts,
        heatmap: scaffold.heatmap,
        orchestration_hash: scaffold.orchestration_hash,
      });
    const summary =
      buildReplayIntelligenceConvergenceSummary(snapshot);

    return res.json(replayIntelligenceEnvelope(
      req,
      summary,
      snapshot.orchestration_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/replay-intelligence/restoration
 *
 * Returns deterministic replay intelligence restoration scaffold response data.
 */
app.get("/api/replay-intelligence/restoration", (req: Request, res: Response) => {
  try {
    const scaffold =
      buildReplayIntelligenceRestorationApiScaffold();
    const response =
      buildReplayIntelligenceRestorationApiResponse(
        scaffold.restorationSnapshot,
        scaffold.restorationResult,
        scaffold.checkpoint,
      );

    return res.json(replayIntelligenceEnvelope(
      req,
      response,
      scaffold.restorationSnapshot.restoration_id,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/replay-intelligence/restoration/checkpoint
 *
 * Returns deterministic replay intelligence restoration checkpoint scaffold data.
 */
app.get("/api/replay-intelligence/restoration/checkpoint", (req: Request, res: Response) => {
  try {
    const scaffold =
      buildReplayIntelligenceRestorationApiScaffold();

    return res.json(replayIntelligenceEnvelope(
      req,
      {
        ...scaffold.checkpoint,
        recovery_restored: scaffold.recoveryResult.restored,
        restoration_restored: scaffold.restorationResult.restored,
      },
      scaffold.checkpoint.checkpoint_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/replay-intelligence/restoration/rollback
 *
 * Returns deterministic replay intelligence rollback scaffold response data.
 */
app.get("/api/replay-intelligence/restoration/rollback", (req: Request, res: Response) => {
  try {
    const scaffold =
      buildReplayIntelligenceRestorationApiScaffold();
    const response =
      buildReplayIntelligenceRollbackApiResponse(
        scaffold.rollbackCandidate,
        scaffold.restorationSnapshot,
      );

    return res.json(replayIntelligenceEnvelope(
      req,
      response,
      scaffold.rollbackCandidate.rollback_candidate_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/replay-intelligence/restoration/timeline
 *
 * Returns deterministic replay intelligence restoration replay timeline data.
 */
app.get("/api/replay-intelligence/restoration/timeline", (req: Request, res: Response) => {
  try {
    const scaffold =
      buildReplayIntelligenceRestorationApiScaffold();
    const response =
      buildReplayIntelligenceReplayTimelineApiResponse(
        scaffold.replayTimeline,
        scaffold.restorationSnapshot,
      );

    return res.json(replayIntelligenceEnvelope(
      req,
      response,
      scaffold.replayTimeline.replay_timeline_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/replay-intelligence/replayback
 *
 * Returns deterministic replay intelligence replayback scaffold response data.
 */
app.get("/api/replay-intelligence/replayback", (req: Request, res: Response) => {
  try {
    const scaffold =
      buildReplayIntelligenceRestorationApiScaffold();
    const response =
      buildReplayIntelligenceReplaybackApiResponse(
        scaffold.replaybackState,
        scaffold.reducerResult,
        scaffold.replaybackCheckpoint,
      );

    return res.json(replayIntelligenceEnvelope(
      req,
      response,
      response.reconstruction_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/replay-intelligence/replayback/history
 *
 * Returns deterministic replay intelligence replayback history data.
 */
app.get("/api/replay-intelligence/replayback/history", (req: Request, res: Response) => {
  try {
    const scaffold =
      buildReplayIntelligenceRestorationApiScaffold();
    const response =
      buildReplayIntelligenceReplaybackHistoryResponse(
        scaffold.replaybackState,
        scaffold.replayTimeline,
      );

    return res.json(replayIntelligenceEnvelope(
      req,
      response,
      response.replayback_history_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/replay-intelligence/replayback/reconstruction
 *
 * Returns deterministic replay intelligence replay reconstruction data.
 */
app.get("/api/replay-intelligence/replayback/reconstruction", (req: Request, res: Response) => {
  try {
    const scaffold =
      buildReplayIntelligenceRestorationApiScaffold();
    const response =
      buildReplayIntelligenceReplayReconstructionResponse(
        scaffold.replaybackState,
      );

    return res.json(replayIntelligenceEnvelope(
      req,
      response,
      response.reconstruction_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
app.get(
  "/api/replay-intelligence/analytics",
  async (_req: Request, res: Response) => {
    const analytics =
      buildReplayIntelligenceAnalytics(
        {
          reconstruction_id: "recon_demo",
          generated_at: new Date().toISOString(),
          traversal_depth: 3,
        },
        [
          {
            key: "timeline_integrity",
            value: 97,
            weight: 1,
            status: "stable",
          },
          {
            key: "signal_consistency",
            value: 88,
            weight: 1,
            status: "warning",
          },
        ],
      );
    insertReplayAnalyticsHistoryRow({
      id: analytics.deterministic_hash.slice(0, 12),
      replay_id: "replay_demo",
      reconstruction_id: analytics.reconstruction_id,
      generated_at: analytics.generated_at,
      convergence_score: analytics.convergence_score,
      instability_score: analytics.instability_score,
      analytics_hash: analytics.deterministic_hash,
    });
        return res.json({
      analytics,
      latest:
        getLatestReplayAnalyticsHistoryByReplayId(
          "replay_demo",
        ),
      history:
        listReplayAnalyticsHistoryByReplayId(
          "replay_demo",
        ),
    });
  },
);

app.get(
  "/api/replay-intelligence/convergence-report",
  async (_req: Request, res: Response) => {
    const analytics =
      buildReplayIntelligenceAnalytics(
        {
          reconstruction_id: "recon_demo",
          generated_at: new Date().toISOString(),
          traversal_depth: 3,
        },
        [
          {
            key: "timeline_integrity",
            value: 97,
            weight: 1,
            status: "stable",
          },
        ],
      );

    const report =
      buildReplayConvergenceReport(
        analytics,
      );

    return res.json(report);
  },
);

app.get(
  "/api/replay-intelligence/traversal",
  async (_req: Request, res: Response) => {
    const traversal =
      buildReplayTraversalSummary(
        "root_replay",
        [
          {
            replay_id: "root_replay",
            depth: 0,
            children: ["child_replay"],
          },
          {
            replay_id: "child_replay",
            parent_replay_id: "root_replay",
            depth: 1,
            children: [],
          },
        ],
      );

    return res.json(traversal);
  },
);

app.get(
  "/api/replay-intelligence/state-diff",
  async (_req: Request, res: Response) => {
    const diff =
      buildReplayStateDiffSummary(
        "replay_demo",
        [
          {
            field: "status",
            previous_value: "pending",
            current_value: "settled",
            changed: true,
          },
        ],
      );

    return res.json(diff);
  },
);

app.get(
  "/api/replay-intelligence/convergence-timeline",
  async (_req: Request, res: Response) => {
    const timeline =
      buildReplayConvergenceTimeline(
        "replay_demo",
        [
          {
            generated_at: "2026-05-18T00:00:00.000Z",
            convergence_score: 91,
            instability_score: 1,
            stability_index: 90,
          },
          {
            generated_at: "2026-05-18T01:00:00.000Z",
            convergence_score: 96,
            instability_score: 0,
            stability_index: 96,
          },
        ],
      );

    return res.json(timeline);
  },
);

app.get(
  "/api/replay-intelligence/convergence-export",
  async (_req: Request, res: Response) => {
    const report =
      buildReplayConvergenceReport({
        reconstruction_id: "recon_demo",
        generated_at:
          "2026-05-18T00:00:00.000Z",
        metrics: [],
        convergence_score: 95,
        instability_score: 1,
        deterministic_hash: "demo_hash",
      });

    const bundle =
      buildReplayConvergenceExportBundle([
        report,
      ]);

    return res.json(bundle);
  },
);

app.get("/api/replay-intelligence/audit", (req: Request, res: Response) => {
  try {
    const records = sortReplayIntelligenceAuditRows(
      listReplayIntelligenceAuditRows(),
    );
    const pagination = replayIntelligencePagination(req);
    const page = paginateReplayIntelligenceRows(
      records,
      pagination,
      (record) => buildReplayIntelligenceAuditHash(record),
    );
    const audits = page.rows.map(replayIntelligenceAuditApiRecord);

    return res.json(replayIntelligenceEnvelope(
      req,
      {
        generated_at: replayIntelligenceAuditGeneratedAt(records),
        count: audits.length,
        total_count: records.length,
        audits,
      },
      audits.map((audit) => audit.audit_hash).join("|") ||
        "empty|replay-intelligence-audit",
      page.pageInfo,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/audit/summary", (req: Request, res: Response) => {
  try {
    const records = sortReplayIntelligenceAuditRows(
      listReplayIntelligenceAuditRows(),
    );
    const summary = buildReplayIntelligenceAuditSummary(
      "all",
      records,
      replayIntelligenceAuditGeneratedAt(records),
    );

    return res.json(replayIntelligenceEnvelope(
      req,
      {
        ...summary,
        replay_count: new Set(records.map((record) => record.replay_id)).size,
      },
      summary.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/audit/:auditHash", (req: Request, res: Response) => {
  try {
    const auditHash = routeParam(req.params.auditHash);
    const audit = auditHash ? getReplayIntelligenceAuditRowByHash(auditHash) : null;
    if (!audit) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence audit not found", "auditHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      {
        audit_hash: auditHash,
        audit,
      },
      auditHash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/audit/:auditHash/timeline", (req: Request, res: Response) => {
  try {
    const auditHash = routeParam(req.params.auditHash);
    const audit = auditHash ? getReplayIntelligenceAuditRowByHash(auditHash) : null;
    if (!audit) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence audit not found", "auditHash"),
      ));
    }

    const timeline = sortReplayIntelligenceAuditTimelineRows(
      listReplayIntelligenceAuditRowsByAuditHash(auditHash),
    ).map((record) => ({
      audit_hash: buildReplayIntelligenceAuditHash(record),
      generated_at: record.generated_at,
      validation_status: record.validation_status,
      route_group_count: record.route_group_count,
      analytics_hash: record.analytics_hash,
      convergence_hash: record.convergence_hash,
    }));

    return res.json(replayIntelligenceEnvelope(
      req,
      {
        audit_hash: auditHash,
        replay_id: audit.replay_id,
        count: timeline.length,
        timeline,
      },
      timeline.map((entry) => entry.audit_hash).join("|"),
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/audit/:auditHash/convergence", (req: Request, res: Response) => {
  try {
    const auditHash = routeParam(req.params.auditHash);
    const audit = auditHash ? getReplayIntelligenceAuditRowByHash(auditHash) : null;
    if (!audit) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence audit not found", "auditHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      {
        audit_hash: auditHash,
        replay_id: audit.replay_id,
        generated_at: audit.generated_at,
        analytics_hash: audit.analytics_hash,
        convergence_hash: audit.convergence_hash,
        route_group_count: audit.route_group_count,
        validation_status: audit.validation_status,
      },
      auditHash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/audit/:auditHash/history", (req: Request, res: Response) => {
  try {
    const auditHash = routeParam(req.params.auditHash);
    const audit = auditHash ? getReplayIntelligenceAuditRowByHash(auditHash) : null;
    if (!audit) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence audit not found", "auditHash"),
      ));
    }

    const history = sortReplayIntelligenceAuditRows(
      listReplayIntelligenceAuditRowsByAuditHash(auditHash),
    ).map(replayIntelligenceAuditApiRecord);

    return res.json(replayIntelligenceEnvelope(
      req,
      {
        audit_hash: auditHash,
        replay_id: audit.replay_id,
        count: history.length,
        history,
      },
      history.map((entry) => entry.audit_hash).join("|"),
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/history", (req: Request, res: Response) => {
  try {
    const snapshots = listReplayIntelligenceHistoricalSnapshots();
    const pagination = replayIntelligencePagination(req);
    const page = paginateReplayIntelligenceRows(
      snapshots,
      pagination,
      (snapshot) => snapshot.snapshot_hash,
    );

    return res.json(replayIntelligenceEnvelope(
      req,
      {
        count: page.rows.length,
        total_count: snapshots.length,
        snapshots: page.rows,
      },
      page.rows.map((snapshot) => snapshot.snapshot_hash).join("|") ||
        "empty|replay-intelligence-history",
      page.pageInfo,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/history/summary", (req: Request, res: Response) => {
  try {
    const summary = buildReplayIntelligenceHistorySummary();

    return res.json(replayIntelligenceEnvelope(
      req,
      summary,
      summary.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/history/:replayHash", (req: Request, res: Response) => {
  try {
    const replayHash = routeParam(req.params.replayHash);
    const history = replayHash
      ? buildReplayIntelligenceHistoryForReplay(replayHash)
      : null;
    if (!history) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence history not found", "replayHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      history,
      history.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/history/:replayHash/convergence", (req: Request, res: Response) => {
  try {
    const replayHash = routeParam(req.params.replayHash);
    const convergence = replayHash
      ? buildReplayIntelligenceHistoryConvergence(replayHash)
      : null;
    if (!convergence) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence convergence history not found", "replayHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      convergence,
      convergence.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/history/:replayHash/timeline", (req: Request, res: Response) => {
  try {
    const replayHash = routeParam(req.params.replayHash);
    const timeline = replayHash
      ? buildReplayIntelligenceHistoryTimeline(replayHash)
      : null;
    if (!timeline) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence timeline not found", "replayHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      timeline,
      timeline.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/history/:replayHash/diff", (req: Request, res: Response) => {
  try {
    const replayHash = routeParam(req.params.replayHash);
    const diff = replayHash
      ? buildReplayIntelligenceHistoryDiff(replayHash)
      : null;
    if (!diff) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence diff not found", "replayHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      diff,
      diff.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/history/:replayHash/lineage", (req: Request, res: Response) => {
  try {
    const replayHash = routeParam(req.params.replayHash);
    const lineage = replayHash
      ? buildReplayIntelligenceHistoryLineage(replayHash)
      : null;
    if (!lineage) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence lineage not found", "replayHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      lineage,
      lineage.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/snapshots", (req: Request, res: Response) => {
  try {
    const aggregation = buildReplayIntelligenceSnapshotAggregation();

    return res.json(replayIntelligenceEnvelope(
      req,
      aggregation,
      aggregation.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/snapshots/summary", (req: Request, res: Response) => {
  try {
    const summary = buildReplayIntelligenceSnapshotSummary();

    return res.json(replayIntelligenceEnvelope(
      req,
      summary,
      summary.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/snapshots/:snapshotHash", (req: Request, res: Response) => {
  try {
    const snapshotHash = routeParam(req.params.snapshotHash);
    const snapshot = snapshotHash
      ? buildReplayIntelligenceSnapshotLookup(snapshotHash)
      : null;
    if (!snapshot) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence snapshot not found", "snapshotHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      snapshot,
      snapshot.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/snapshots/:snapshotHash/convergence", (req: Request, res: Response) => {
  try {
    const snapshotHash = routeParam(req.params.snapshotHash);
    const convergence = snapshotHash
      ? buildReplayIntelligenceSnapshotConvergence(snapshotHash)
      : null;
    if (!convergence) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence snapshot convergence not found", "snapshotHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      convergence,
      convergence.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/snapshots/:snapshotHash/lineage", (req: Request, res: Response) => {
  try {
    const snapshotHash = routeParam(req.params.snapshotHash);
    const lineage = snapshotHash
      ? buildReplayIntelligenceSnapshotLineage(snapshotHash)
      : null;
    if (!lineage) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence snapshot lineage not found", "snapshotHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      lineage,
      lineage.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/snapshots/:snapshotHash/reducers", (req: Request, res: Response) => {
  try {
    const snapshotHash = routeParam(req.params.snapshotHash);
    const reducers = snapshotHash
      ? buildReplayIntelligenceSnapshotReducers(snapshotHash)
      : null;
    if (!reducers) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence snapshot reducers not found", "snapshotHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      reducers,
      reducers.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/forensics/timelines", (req: Request, res: Response) => {
  try {
    const timelines = buildReplayIntelligenceForensicTimelines();
    const payload = {
      count: timelines.length,
      timelines,
    };

    return res.json(replayIntelligenceEnvelope(
      req,
      payload,
      timelines.map((timeline) => timeline.timeline_hash).join("|") ||
        "empty|replay-intelligence-forensic-timelines",
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/forensics/timelines/summary", (req: Request, res: Response) => {
  try {
    const summary = buildReplayIntelligenceForensicTimelineSummary();

    return res.json(replayIntelligenceEnvelope(
      req,
      summary,
      summary.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/forensics/timelines/:timelineHash", (req: Request, res: Response) => {
  try {
    const timelineHash = routeParam(req.params.timelineHash);
    const timeline = timelineHash
      ? getReplayIntelligenceForensicTimelineByHash(timelineHash)
      : null;
    if (!timeline) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence forensic timeline not found", "timelineHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      timeline,
      timeline.timeline_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/forensics/timelines/:timelineHash/events", (req: Request, res: Response) => {
  try {
    const timelineHash = routeParam(req.params.timelineHash);
    const events = timelineHash
      ? buildReplayIntelligenceForensicTimelineEvents(timelineHash)
      : null;
    if (!events) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence forensic events not found", "timelineHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      events,
      events.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/forensics/timelines/:timelineHash/anomalies", (req: Request, res: Response) => {
  try {
    const timelineHash = routeParam(req.params.timelineHash);
    const anomalies = timelineHash
      ? buildReplayIntelligenceForensicTimelineAnomalies(timelineHash)
      : null;
    if (!anomalies) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence forensic anomalies not found", "timelineHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      anomalies,
      anomalies.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/forensics/timelines/:timelineHash/convergence", (req: Request, res: Response) => {
  try {
    const timelineHash = routeParam(req.params.timelineHash);
    const convergence = timelineHash
      ? buildReplayIntelligenceForensicTimelineConvergence(timelineHash)
      : null;
    if (!convergence) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence forensic convergence not found", "timelineHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      convergence,
      convergence.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/forensics/timelines/:timelineHash/reducers", (req: Request, res: Response) => {
  try {
    const timelineHash = routeParam(req.params.timelineHash);
    const reducers = timelineHash
      ? buildReplayIntelligenceForensicTimelineReducers(timelineHash)
      : null;
    if (!reducers) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence forensic reducers not found", "timelineHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      reducers,
      reducers.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/exports", (req: Request, res: Response) => {
  try {
    const exports = buildReplayIntelligenceHistoricalExports();
    const payload = {
      count: exports.length,
      exports,
    };

    return res.json(replayIntelligenceEnvelope(
      req,
      payload,
      exports.map((bundle) => bundle.export_hash).join("|") ||
        "empty|replay-intelligence-exports",
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/exports/summary", (req: Request, res: Response) => {
  try {
    const summary = buildReplayIntelligenceHistoricalExportSummary();

    return res.json(replayIntelligenceEnvelope(
      req,
      summary,
      summary.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/exports/:exportHash", (req: Request, res: Response) => {
  try {
    const exportHash = routeParam(req.params.exportHash);
    const bundle = exportHash
      ? getReplayIntelligenceHistoricalExportByHash(exportHash)
      : null;
    if (!bundle) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence export not found", "exportHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      bundle,
      bundle.export_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/exports/:exportHash/download", (req: Request, res: Response) => {
  try {
    const exportHash = routeParam(req.params.exportHash);
    const bundle = exportHash
      ? getReplayIntelligenceHistoricalExportByHash(exportHash)
      : null;
    if (!bundle) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence export not found", "exportHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      {
        export_hash: exportHash,
        content_type: "application/json",
        filename: `${exportHash}.json`,
        bundle,
      },
      bundle.export_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/exports/:exportHash/manifest", (req: Request, res: Response) => {
  try {
    const exportHash = routeParam(req.params.exportHash);
    const manifest = exportHash
      ? buildReplayIntelligenceHistoricalExportManifest(exportHash)
      : null;
    if (!manifest) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence export manifest not found", "exportHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      manifest,
      manifest.manifest_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/exports/:exportHash/lineage", (req: Request, res: Response) => {
  try {
    const exportHash = routeParam(req.params.exportHash);
    const lineage = exportHash
      ? buildReplayIntelligenceHistoricalExportLineage(exportHash)
      : null;
    if (!lineage) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence export lineage not found", "exportHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      lineage,
      lineage.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/exports/:exportHash/verification", (req: Request, res: Response) => {
  try {
    const exportHash = routeParam(req.params.exportHash);
    const verification = exportHash
      ? buildReplayIntelligenceHistoricalExportVerification(exportHash)
      : null;
    if (!verification) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence export verification not found", "exportHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      verification,
      verification.verification_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/aggregation", (req: Request, res: Response) => {
  try {
    const aggregations = buildReplayIntelligenceAggregations();
    const payload = {
      count: aggregations.length,
      aggregations,
    };

    return res.json(replayIntelligenceEnvelope(
      req,
      payload,
      aggregations.map((aggregation) => aggregation.aggregation_hash).join("|") ||
        "empty|replay-intelligence-aggregation",
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/aggregation/summary", (req: Request, res: Response) => {
  try {
    const summary = buildReplayIntelligenceAggregationSummary();

    return res.json(replayIntelligenceEnvelope(
      req,
      summary,
      summary.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/aggregation/:aggregationHash", (req: Request, res: Response) => {
  try {
    const aggregationHash = routeParam(req.params.aggregationHash);
    const aggregation = aggregationHash
      ? getReplayIntelligenceAggregationByHash(aggregationHash)
      : null;
    if (!aggregation) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence aggregation not found", "aggregationHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      aggregation,
      aggregation.aggregation_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/aggregation/:aggregationHash/reducers", (req: Request, res: Response) => {
  try {
    const aggregationHash = routeParam(req.params.aggregationHash);
    const reducers = aggregationHash
      ? buildReplayIntelligenceAggregationReducers(aggregationHash)
      : null;
    if (!reducers) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence aggregation reducers not found", "aggregationHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      reducers,
      reducers.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/aggregation/:aggregationHash/convergence", (req: Request, res: Response) => {
  try {
    const aggregationHash = routeParam(req.params.aggregationHash);
    const convergence = aggregationHash
      ? buildReplayIntelligenceAggregationConvergence(aggregationHash)
      : null;
    if (!convergence) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence aggregation convergence not found", "aggregationHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      convergence,
      convergence.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/aggregation/:aggregationHash/stability", (req: Request, res: Response) => {
  try {
    const aggregationHash = routeParam(req.params.aggregationHash);
    const stability = aggregationHash
      ? buildReplayIntelligenceAggregationStability(aggregationHash)
      : null;
    if (!stability) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence aggregation stability not found", "aggregationHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      stability,
      stability.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/aggregation/:aggregationHash/lineage", (req: Request, res: Response) => {
  try {
    const aggregationHash = routeParam(req.params.aggregationHash);
    const lineage = aggregationHash
      ? buildReplayIntelligenceAggregationLineage(aggregationHash)
      : null;
    if (!lineage) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence aggregation lineage not found", "aggregationHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      lineage,
      lineage.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/convergence", (req: Request, res: Response) => {
  try {
    const records = listReplayIntelligenceConvergencePersistenceRecords();
    const pagination = replayIntelligencePagination(req);
    const page = paginateReplayIntelligenceRows(
      records,
      pagination,
      (record) => record.convergence_hash,
    );
    const payload = {
      count: page.rows.length,
      total_count: records.length,
      convergences: page.rows,
    };

    return res.json(replayIntelligenceEnvelope(
      req,
      payload,
      page.rows.map((record) => record.convergence_hash).join("|") ||
        "empty|replay-intelligence-convergence",
      page.pageInfo,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/convergence/summary", (req: Request, res: Response) => {
  try {
    const summary = buildReplayIntelligenceConvergencePersistenceSummary();

    return res.json(replayIntelligenceEnvelope(
      req,
      summary,
      summary.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/convergence/:convergenceHash", (req: Request, res: Response) => {
  try {
    const convergenceHash = routeParam(req.params.convergenceHash);
    const convergence = convergenceHash
      ? getReplayIntelligenceConvergencePersistenceByHash(convergenceHash)
      : null;
    if (!convergence) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence convergence persistence not found", "convergenceHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      convergence,
      convergence.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/convergence/:convergenceHash/history", (req: Request, res: Response) => {
  try {
    const convergenceHash = routeParam(req.params.convergenceHash);
    const history = convergenceHash
      ? buildReplayIntelligenceConvergencePersistenceHistory(convergenceHash)
      : null;
    if (!history) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence convergence history not found", "convergenceHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      history,
      history.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/convergence/:convergenceHash/stability", (req: Request, res: Response) => {
  try {
    const convergenceHash = routeParam(req.params.convergenceHash);
    const stability = convergenceHash
      ? buildReplayIntelligenceConvergencePersistenceStability(convergenceHash)
      : null;
    if (!stability) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence convergence stability not found", "convergenceHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      stability,
      stability.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/convergence/:convergenceHash/drift", (req: Request, res: Response) => {
  try {
    const convergenceHash = routeParam(req.params.convergenceHash);
    const drift = convergenceHash
      ? buildReplayIntelligenceConvergencePersistenceDrift(convergenceHash)
      : null;
    if (!drift) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence convergence drift not found", "convergenceHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      drift,
      drift.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/replay-intelligence/convergence/:convergenceHash/lineage", (req: Request, res: Response) => {
  try {
    const convergenceHash = routeParam(req.params.convergenceHash);
    const lineage = convergenceHash
      ? buildReplayIntelligenceConvergencePersistenceLineage(convergenceHash)
      : null;
    if (!lineage) {
      return res.status(404).json(replayIntelligenceErrorEnvelope(
        req,
        "empty",
        replayIntelligenceError("not_found", "Replay intelligence convergence lineage not found", "convergenceHash"),
      ));
    }

    return res.json(replayIntelligenceEnvelope(
      req,
      lineage,
      lineage.deterministic_hash,
    ));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/pipeline/replay-intelligence-dashboard
 *
 * Returns deterministic replay intelligence dashboard aggregation data.
 * Current scaffold uses deterministic source records until persistence wiring is added.
 */

app.get("/api/pipeline/replay-intelligence-dashboard", (_req: Request, res: Response) => {
  try {
    const records = listReplayDashboardAggregateRows().map(
  (row): ReplayDashboardSourceRecord => ({
    replay_id: row.replay_id,
    parent_replay_id: row.parent_replay_id,
    intelligence_hash: row.intelligence_hash,
    category: row.category,
    timestamp: row.timestamp,
    anomaly_score: row.anomaly_score,
    drift_score: row.drift_score,
    confidence_score: row.confidence_score,
  }),
);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
app.get(
  "/api/pipeline/replay-intelligence-timeseries",
  (_req: Request, res: Response) => {
    try {
      const points: ReplayIntelligenceTimeseriesPoint[] =
        listReplayDashboardAggregateRows().map((row) => ({
          timestamp: row.timestamp,
          anomaly_score: row.anomaly_score,
          drift_score: row.drift_score,
          confidence_score: row.confidence_score,
        }));

      return res.json(
        buildReplayIntelligenceTrendResult(points, 10),
      );
    } catch (err: any) {
      return res.status(500).json({
        error: err.message,
      });
    }
  },
);
  /* ══════════════════════════════════════════════════════
     CALIBRATION — admin-gated
     ══════════════════════════════════════════════════════ */

  /**
   * POST /api/pipeline/calibrate
   *
   * Run the calibration engine against all settled outcomes.
   * Returns a CalibrationReport with component correlations and suggested weights.
   * Suggested weights are NOT auto-applied — review before changing scorer.ts.
   *
   * Body: { "password": "..." }
   */
  app.post("/api/pipeline/calibrate", (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const report = runCalibration();
      return res.json({ success: true, report });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/stats/accuracy-ledger
   *
   * Full accuracy ledger: hit rates and CLV by league, signal_type, and (optionally) season.
   * Sourced from the pipeline_source_accuracy table, populated by computeSourceAccuracy().
   *
   * Query params:
   *   league — filter to a specific league (NBA | MLB | NFL | CFB)
   *
   * No auth required — display-only.
   */
  app.get("/api/stats/accuracy-ledger", (req: Request, res: Response) => {
    try {
      const { league } = req.query as { league?: string };
      const db = getPipelineDb();

      const conds: string[] = [];
      const params: unknown[] = [];
      if (league) {
        const valid = ["NBA", "MLB", "NFL", "CFB"];
        if (!valid.includes(league.toUpperCase())) {
          return res.status(400).json({ error: `league must be one of: ${valid.join(", ")}` });
        }
        conds.push("league = ?");
        params.push(league.toUpperCase());
      }
      const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

      const rows = db.prepare(
        `SELECT * FROM pipeline_source_accuracy ${where} ORDER BY league, signal_type NULLS FIRST`
      ).all(...params) as any[];

      const calibration = getStoredCalibration();

      return res.json({
        count: rows.length,
        ledger: rows,
        calibration_available: calibration.length > 0,
        calibration_computed_at: calibration[0]?.computed_at ?? null,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  console.log("[pipeline] Routes registered");
}
