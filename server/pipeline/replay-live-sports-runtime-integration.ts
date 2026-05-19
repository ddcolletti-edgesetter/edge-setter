import crypto from "node:crypto";

import type Database from "better-sqlite3";

import { buildReplayLiveRuntimeSnapshot } from "./replay-live-runtime";
import { buildReplayObservabilitySnapshot } from "./replay-observability";
import { buildReplayProductionOrchestrationSnapshot } from "./replay-production-orchestration";
import {
  getLiveSignals,
  getOutcomes,
  getPipelineDb,
  getRawEvents,
  getSnapshotHistory,
} from "./store";
import type {
  ReplayLiveBridgeInput,
  ReplayLiveInjuryReport,
  ReplayLiveOddsSnapshot,
  ReplayLiveSourceIntelligenceEvent,
} from "./replay-live-intelligence-bridge-contract";
import type {
  ReplayLiveSportsFeedSnapshot,
  ReplayLiveSportsRuntimeAction,
  ReplayLiveSportsRuntimeIntegrationInput,
  ReplayLiveSportsRuntimeIntegrationSnapshot,
  ReplayLiveSportsRuntimeLeague,
  ReplayLiveSportsRuntimeQuery,
  ReplayLiveSportsRuntimeState,
  ReplayLiveFeedIngestionRecord,
  ReplayLiveSignalPropagationRecord,
  ReplayLiveTelemetryPersistenceRecord,
  ReplayRealSettlementScoringRecord,
  ReplayRuntimeGovernanceAdaptationRecord,
} from "./replay-live-sports-runtime-integration-contract";
import type { LiveSignal, Outcome, RawEvent } from "./types";

type SqliteDatabase = Database.Database;

interface PayloadRow {
  readonly payload: string;
}

const SUPPORTED_ACTIONS: readonly ReplayLiveSportsRuntimeAction[] = [
  "ingest_live_mlb_runtime",
  "ingest_live_nba_runtime",
  "ingest_odds_movement_runtime",
  "ingest_injury_intelligence_runtime",
  "ingest_beat_writer_intelligence",
  "propagate_live_signal_runtime",
  "score_real_settlement_runtime",
  "adapt_runtime_governance",
  "persist_live_telemetry",
  "freeze_live_sports_runtime_snapshot",
];

const SUPPORTED_QUERIES: readonly ReplayLiveSportsRuntimeQuery[] = [
  "get_live_feed_ingestion",
  "get_live_signal_propagation",
  "get_real_settlement_scoring",
  "get_runtime_governance_adaptation",
  "get_live_telemetry_persistence",
];

export function initializeReplayLiveSportsRuntimeIntegrationSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS replay_live_sports_runtime_integrations (
      integration_id TEXT PRIMARY KEY,
      generated_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      state TEXT NOT NULL,
      deterministic_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replay_live_sports_runtime_views (
      view_id TEXT PRIMARY KEY,
      integration_id TEXT NOT NULL,
      view_kind TEXT NOT NULL,
      view_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);
}

export function buildReplayLiveSportsRuntimeIntegrationSnapshot(
  db: SqliteDatabase,
  input: ReplayLiveSportsRuntimeIntegrationInput,
): ReplayLiveSportsRuntimeIntegrationSnapshot {
  initializeReplayLiveSportsRuntimeIntegrationSchema(db);

  const bridgeInputs = input.feeds.map((feed, index) => buildBridgeInput(input, feed, index));
  const runtime = buildReplayLiveRuntimeSnapshot(db, {
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    scheduler_interval_ms: input.scheduler_interval_ms ?? 60_000,
    cycles: bridgeInputs.map((bridgeInput, index) => ({
      cycle_id: `live-sports-cycle:${input.feeds[index]?.league ?? "unknown"}:${index + 1}`,
      bridge_input: bridgeInput,
    })),
    drift_threshold: 0.12,
  });
  const observability = buildReplayObservabilitySnapshot(db, {
    generated_at: input.persisted_at,
    runtime_snapshot: runtime,
  });
  const production = buildReplayProductionOrchestrationSnapshot(db, {
    generated_at: input.persisted_at,
    persisted_at: input.persisted_at,
    runtime_snapshot: runtime,
    observability_snapshot: observability,
    runtime_nodes: input.runtime_nodes,
    failed_node_ids: input.runtime_nodes.filter((node) => !node.healthy).map((node) => node.node_id),
    lease_ttl_ms: 180_000,
    watchdog_timeout_ms: 90_000,
  });
  const feedIngestion = buildFeedIngestion(input, runtime);
  const signalPropagation = buildSignalPropagation(input, runtime);
  const settlementScoring = buildSettlementScoring(input, runtime);
  const governanceAdaptation = buildGovernanceAdaptation(input, runtime);
  const telemetryPersistence = buildTelemetryPersistence(input, runtime, production);
  const state = classifyIntegrationState(feedIngestion, settlementScoring, governanceAdaptation, telemetryPersistence);
  const seed = {
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    runtime_hash: runtime.deterministic_hash,
    observability_hash: observability.deterministic_hash,
    production_hash: production.deterministic_hash,
    ingestion_hashes: feedIngestion.map((record) => record.ingestion_hash),
    propagation_hashes: signalPropagation.map((record) => record.propagation_hash),
    scoring_hashes: settlementScoring.map((record) => record.scoring_hash),
    governance_hashes: governanceAdaptation.map((record) => record.adaptation_hash),
    telemetry_hashes: telemetryPersistence.map((record) => record.persistence_hash),
  };
  const deterministicHash = computeReplayLiveSportsRuntimeIntegrationHash(seed);
  const snapshot = deepFreeze({
    integration_id: `replay-live-sports-runtime:${deterministicHash}`,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    state,
    bridge_inputs: bridgeInputs,
    runtime_snapshot: runtime,
    observability_snapshot: observability,
    production_snapshot: production,
    feed_ingestion: feedIngestion,
    signal_propagation: signalPropagation,
    settlement_scoring: settlementScoring,
    governance_adaptation: governanceAdaptation,
    telemetry_persistence: telemetryPersistence,
    supported_actions: SUPPORTED_ACTIONS,
    supported_queries: SUPPORTED_QUERIES,
    deterministic_hash: deterministicHash,
  });

  persistReplayLiveSportsRuntimeIntegrationSnapshot(db, snapshot);
  return snapshot;
}

export function collectLiveSportsRuntimeFeedsFromStore(input: {
  readonly generated_at: string;
  readonly since?: string;
  readonly limit?: number;
  readonly leagues?: readonly ReplayLiveSportsRuntimeLeague[];
}): readonly ReplayLiveSportsFeedSnapshot[] {
  const leagues = input.leagues ?? ["NBA", "MLB"];
  return leagues.map((league) => {
    const rawEvents = getRawEvents({ league, limit: input.limit ?? 200 });
    const liveSignals = getLiveSignals({ league, since: input.since, limit: input.limit ?? 200 });
    const outcomes = liveSignals.flatMap((signal) => getOutcomes(signal.id));
    const gameIds = Array.from(new Set([
      ...rawEvents.map((event) => event.game_id).filter((value): value is string => Boolean(value)),
      ...liveSignals.map((signal) => signal.game_id).filter((value): value is string => Boolean(value)),
      ...outcomes.map((outcome) => outcome.game_id),
    ])).sort((left, right) => left.localeCompare(right));
    const oddsSnapshots = gameIds.flatMap((gameId) =>
      getSnapshotHistory(gameId, 20).map(snapshotFromStore),
    );
    return {
      league,
      generated_at: input.generated_at,
      raw_events: rawEvents,
      live_signals: liveSignals,
      odds_snapshots: oddsSnapshots,
      injury_reports: buildInjuryReportsFromLive(league, rawEvents, liveSignals, input.generated_at),
      source_intelligence_events: buildSourceIntelligenceFromLive(league, liveSignals, input.generated_at),
      settled_outcomes: outcomes,
    };
  });
}

export function getLiveFeedIngestion(db: SqliteDatabase, integrationId: string): readonly ReplayLiveFeedIngestionRecord[] {
  return getViewList<ReplayLiveFeedIngestionRecord>(db, integrationId, "feed_ingestion");
}

export function getLiveSignalPropagation(db: SqliteDatabase, integrationId: string): readonly ReplayLiveSignalPropagationRecord[] {
  return getViewList<ReplayLiveSignalPropagationRecord>(db, integrationId, "signal_propagation");
}

export function getRealSettlementRuntimeScoring(db: SqliteDatabase, integrationId: string): readonly ReplayRealSettlementScoringRecord[] {
  return getViewList<ReplayRealSettlementScoringRecord>(db, integrationId, "settlement_scoring");
}

export function getRuntimeGovernanceAdaptation(db: SqliteDatabase, integrationId: string): readonly ReplayRuntimeGovernanceAdaptationRecord[] {
  return getViewList<ReplayRuntimeGovernanceAdaptationRecord>(db, integrationId, "governance_adaptation");
}

export function getLiveTelemetryPersistence(db: SqliteDatabase, integrationId: string): readonly ReplayLiveTelemetryPersistenceRecord[] {
  return getViewList<ReplayLiveTelemetryPersistenceRecord>(db, integrationId, "telemetry_persistence");
}

export function serializeReplayLiveSportsRuntimeIntegrationSnapshot(snapshot: ReplayLiveSportsRuntimeIntegrationSnapshot): string {
  return stableIntegrationStringify(snapshot);
}

export function computeReplayLiveSportsRuntimeIntegrationHash(value: unknown): string {
  return crypto.createHash("sha256").update(stableIntegrationStringify(value)).digest("hex");
}

function buildBridgeInput(
  input: ReplayLiveSportsRuntimeIntegrationInput,
  feed: ReplayLiveSportsFeedSnapshot,
  index: number,
): ReplayLiveBridgeInput {
  return {
    bridge_id: `live-sports-bridge:${feed.league}:${index + 1}`,
    generated_at: feed.generated_at,
    persisted_at: input.persisted_at,
    raw_events: feed.raw_events,
    live_signals: feed.live_signals,
    odds_snapshots: feed.odds_snapshots,
    injury_reports: feed.injury_reports,
    source_intelligence_events: feed.source_intelligence_events,
    settled_outcomes: feed.settled_outcomes,
    consensus_threshold: 0.6,
    approval_threshold: 0.52,
  };
}

function buildFeedIngestion(
  input: ReplayLiveSportsRuntimeIntegrationInput,
  runtime: ReturnType<typeof buildReplayLiveRuntimeSnapshot>,
): readonly ReplayLiveFeedIngestionRecord[] {
  return deepFreeze(input.feeds.map((feed, index) => {
    const bridge = runtime.executed_cycles[index]?.bridge_snapshot;
    const seed = {
      league: feed.league,
      raw_event_count: feed.raw_events.length,
      live_signal_count: feed.live_signals.length,
      odds_snapshot_count: feed.odds_snapshots.length,
      injury_report_count: feed.injury_reports.length,
      source_intelligence_count: feed.source_intelligence_events.length,
      settled_outcome_count: feed.settled_outcomes.length,
      bridge_hash: bridge?.deterministic_hash ?? "missing",
    };
    const ingestionHash = computeReplayLiveSportsRuntimeIntegrationHash(seed);
    return {
      ingestion_id: `live-sports-ingestion:${ingestionHash}`,
      ...seed,
      ingestion_hash: ingestionHash,
    };
  }));
}

function buildSignalPropagation(
  input: ReplayLiveSportsRuntimeIntegrationInput,
  runtime: ReturnType<typeof buildReplayLiveRuntimeSnapshot>,
): readonly ReplayLiveSignalPropagationRecord[] {
  return deepFreeze(input.feeds.flatMap((feed, feedIndex) => {
    const cycle = runtime.cycles[feedIndex];
    const bridge = runtime.executed_cycles[feedIndex]?.bridge_snapshot;
    return feed.live_signals.map((signal) => {
      const canonical = bridge?.adapter.canonical_records.find((record) => record.signal_id === signal.id);
      const seed = {
        league: feed.league,
        signal_id: signal.id,
        runtime_cycle_id: cycle?.cycle_id ?? `cycle:${feedIndex}`,
        bridge_replay_hash: canonical?.replay_hash ?? null,
        propagated: Boolean(canonical),
      };
      const propagationHash = computeReplayLiveSportsRuntimeIntegrationHash(seed);
      return {
        propagation_id: `live-sports-signal-propagation:${propagationHash}`,
        ...seed,
        propagation_hash: propagationHash,
      };
    });
  }));
}

function buildSettlementScoring(
  input: ReplayLiveSportsRuntimeIntegrationInput,
  runtime: ReturnType<typeof buildReplayLiveRuntimeSnapshot>,
): readonly ReplayRealSettlementScoringRecord[] {
  return deepFreeze(input.feeds.flatMap((feed, feedIndex) => {
    const trust = runtime.executed_cycles[feedIndex]?.trust_snapshot;
    return feed.settled_outcomes.map((outcome) => {
      const trustScoreCount = trust?.outcome_scores.filter((score) => score.outcome_id === outcome.id).length ?? 0;
      const seed = {
        league: feed.league,
        outcome_id: outcome.id,
        signal_id: outcome.signal_id,
        hit: outcome.hit,
        clv: outcome.clv,
        trust_score_count: trustScoreCount,
      };
      const scoringHash = computeReplayLiveSportsRuntimeIntegrationHash(seed);
      return {
        scoring_id: `live-sports-settlement-scoring:${scoringHash}`,
        ...seed,
        scoring_hash: scoringHash,
      };
    });
  }));
}

function buildGovernanceAdaptation(
  input: ReplayLiveSportsRuntimeIntegrationInput,
  runtime: ReturnType<typeof buildReplayLiveRuntimeSnapshot>,
): readonly ReplayRuntimeGovernanceAdaptationRecord[] {
  return deepFreeze(input.feeds.map((feed, index) => {
    const bridge = runtime.executed_cycles[index]?.bridge_snapshot;
    const decisions = bridge?.governance_snapshot.decisions ?? [];
    const seed = {
      league: feed.league,
      runtime_cycle_id: runtime.cycles[index]?.cycle_id ?? `cycle:${index}`,
      governance_decision_count: decisions.length,
      promoted_count: decisions.filter((decision) => decision.action === "promote_branch").length,
      review_count: decisions.filter((decision) => decision.action === "require_review").length,
    };
    const adaptationHash = computeReplayLiveSportsRuntimeIntegrationHash(seed);
    return {
      adaptation_id: `live-sports-governance-adaptation:${adaptationHash}`,
      ...seed,
      adaptation_hash: adaptationHash,
    };
  }));
}

function buildTelemetryPersistence(
  input: ReplayLiveSportsRuntimeIntegrationInput,
  runtime: ReturnType<typeof buildReplayLiveRuntimeSnapshot>,
  production: ReturnType<typeof buildReplayProductionOrchestrationSnapshot>,
): readonly ReplayLiveTelemetryPersistenceRecord[] {
  return deepFreeze(input.feeds.map((feed, index) => {
    const cycleId = runtime.cycles[index]?.cycle_id ?? `cycle:${index}`;
    const telemetry = runtime.telemetry.find((record) => record.cycle_id === cycleId);
    const survivability = production.survivability_telemetry.find((record) => record.cycle_id === cycleId);
    const seed = {
      league: feed.league,
      runtime_cycle_id: cycleId,
      telemetry_hash: telemetry?.telemetry_hash ?? "missing",
      production_survivability_hash: survivability?.telemetry_hash ?? null,
      persisted: Boolean(telemetry && survivability),
    };
    const persistenceHash = computeReplayLiveSportsRuntimeIntegrationHash(seed);
    return {
      persistence_id: `live-sports-telemetry-persistence:${persistenceHash}`,
      ...seed,
      persistence_hash: persistenceHash,
    };
  }));
}

function buildInjuryReportsFromLive(
  league: ReplayLiveSportsRuntimeLeague,
  rawEvents: readonly RawEvent[],
  liveSignals: readonly LiveSignal[],
  generatedAt: string,
): readonly ReplayLiveInjuryReport[] {
  const rawReports = rawEvents
    .filter((event) => event.event_type === "injury_update" && event.player)
    .map((event) => ({
      report_id: `store-injury:${event.id}`,
      league,
      team: event.team,
      player: event.player ?? "Unknown",
      designation: String(event.payload.designation ?? event.payload.status ?? "Questionable"),
      body_part: typeof event.payload.body_part === "string" ? event.payload.body_part : null,
      source_id: event.source_id,
      confidence: typeof event.payload.confidence === "number" ? event.payload.confidence : 64,
      reported_at: event.received_at,
    }));
  const signalReports = liveSignals
    .filter((signal) => signal.signal_type === "injury_update" && signal.player)
    .map((signal) => ({
      report_id: `store-signal-injury:${signal.id}`,
      league,
      team: signal.team,
      player: signal.player ?? "Unknown",
      designation: signal.injury_designation ?? "Questionable",
      body_part: null,
      source_id: signal.sources[0]?.name ?? "live_signal",
      confidence: signal.confidence,
      reported_at: signal.signal_time ?? generatedAt,
    }));
  return deepFreeze([...rawReports, ...signalReports].sort((left, right) => left.report_id.localeCompare(right.report_id)));
}

function buildSourceIntelligenceFromLive(
  league: ReplayLiveSportsRuntimeLeague,
  liveSignals: readonly LiveSignal[],
  generatedAt: string,
): readonly ReplayLiveSourceIntelligenceEvent[] {
  const accuracy = loadSourceAccuracy();
  return deepFreeze(liveSignals.flatMap((signal) =>
    signal.sources.map((source) => {
      const key = `${league}|${source.name}`;
      const reliability = accuracy.get(key) ?? defaultReliability(signal);
      return {
        event_id: `store-source-intelligence:${signal.id}:${source.name}`,
        source_id: source.name,
        source_name: source.name,
        source_type: source.type,
        reliability_score: reliability,
        topic: signal.signal_type,
        league,
        signal_id: signal.id,
        observed_at: signal.updated_at ?? generatedAt,
      };
    })
  ).sort((left, right) => left.event_id.localeCompare(right.event_id)));
}

function loadSourceAccuracy(): Map<string, number> {
  const db = getPipelineDb();
  try {
    const rows = db.prepare(`
      SELECT league, source_id, source_name, hit_rate, avg_clv
      FROM pipeline_source_accuracy
      WHERE source_id IS NOT NULL OR source_name IS NOT NULL
    `).all() as { league: string; source_id: string | null; source_name: string | null; hit_rate: number | null; avg_clv: number | null }[];
    return new Map(rows.map((row) => {
      const hitComponent = row.hit_rate === null ? 62 : row.hit_rate * 100;
      const clvComponent = row.avg_clv === null ? 0 : Math.max(-18, Math.min(18, row.avg_clv * 8));
      return [`${row.league}|${row.source_name ?? row.source_id ?? "unknown"}`, Math.round(Math.max(0, Math.min(100, hitComponent + clvComponent)) * 100) / 100];
    }));
  } catch {
    return new Map();
  }
}

function snapshotFromStore(row: {
  id: string;
  game_id: string;
  league: string;
  sportsbook: string;
  market_source: string;
  spread_line: number | null;
  spread_team: string | null;
  total_line: number | null;
  moneyline_home: number | null;
  moneyline_away: number | null;
  source_game_id: string | null;
  snapshot_at: string;
}): ReplayLiveOddsSnapshot {
  return {
    id: row.id,
    game_id: row.game_id,
    league: row.league,
    sportsbook: row.sportsbook,
    market_source: row.market_source,
    spread_line: row.spread_line,
    spread_team: row.spread_team,
    total_line: row.total_line,
    moneyline_home: row.moneyline_home,
    moneyline_away: row.moneyline_away,
    source_game_id: row.source_game_id,
    snapshot_at: row.snapshot_at,
  };
}

function classifyIntegrationState(
  ingestion: readonly ReplayLiveFeedIngestionRecord[],
  scoring: readonly ReplayRealSettlementScoringRecord[],
  governance: readonly ReplayRuntimeGovernanceAdaptationRecord[],
  telemetry: readonly ReplayLiveTelemetryPersistenceRecord[],
): ReplayLiveSportsRuntimeState {
  if (telemetry.some((record) => !record.persisted)) return "degraded";
  if (scoring.some((record) => record.trust_score_count > 0)) return "converging";
  if (governance.some((record) => record.governance_decision_count > 0)) return "governing";
  if (ingestion.some((record) => record.live_signal_count > 0)) return "propagating";
  return "collecting";
}

function defaultReliability(signal: LiveSignal): number {
  return signal.verdict === "confirmed" ? 86 : signal.verdict === "likely" ? 74 : signal.verdict === "rumor" ? 52 : 60;
}

function persistReplayLiveSportsRuntimeIntegrationSnapshot(
  db: SqliteDatabase,
  snapshot: ReplayLiveSportsRuntimeIntegrationSnapshot,
): void {
  const write = db.transaction(() => {
    db.prepare(`
      INSERT OR REPLACE INTO replay_live_sports_runtime_integrations
      (integration_id, generated_at, persisted_at, state, deterministic_hash, payload)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(snapshot.integration_id, snapshot.generated_at, snapshot.persisted_at, snapshot.state, snapshot.deterministic_hash, stableIntegrationStringify(snapshot));
    for (const record of snapshot.feed_ingestion) persistView(db, snapshot, "feed_ingestion", record.ingestion_id, record.ingestion_hash, record);
    for (const record of snapshot.signal_propagation) persistView(db, snapshot, "signal_propagation", record.propagation_id, record.propagation_hash, record);
    for (const record of snapshot.settlement_scoring) persistView(db, snapshot, "settlement_scoring", record.scoring_id, record.scoring_hash, record);
    for (const record of snapshot.governance_adaptation) persistView(db, snapshot, "governance_adaptation", record.adaptation_id, record.adaptation_hash, record);
    for (const record of snapshot.telemetry_persistence) persistView(db, snapshot, "telemetry_persistence", record.persistence_id, record.persistence_hash, record);
  });
  write();
}

function persistView(
  db: SqliteDatabase,
  snapshot: ReplayLiveSportsRuntimeIntegrationSnapshot,
  viewKind: string,
  viewId: string,
  viewHash: string,
  payload: unknown,
): void {
  db.prepare(`
    INSERT OR REPLACE INTO replay_live_sports_runtime_views
    (view_id, integration_id, view_kind, view_hash, payload)
    VALUES (?, ?, ?, ?, ?)
  `).run(viewId, snapshot.integration_id, viewKind, viewHash, stableIntegrationStringify(payload));
}

function getViewList<T>(db: SqliteDatabase, integrationId: string, viewKind: string): readonly T[] {
  initializeReplayLiveSportsRuntimeIntegrationSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_live_sports_runtime_views
    WHERE integration_id = ? AND view_kind = ?
    ORDER BY view_hash ASC
  `).all(integrationId, viewKind) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as T));
}

function stableIntegrationStringify(value: unknown): string {
  return JSON.stringify(sortIntegrationKeys(value));
}

function sortIntegrationKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortIntegrationKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortIntegrationKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (typeof value === "undefined") return null;
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value;
}
