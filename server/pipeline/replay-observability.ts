import crypto from "node:crypto";

import type Database from "better-sqlite3";

import { initializeReplayLiveRuntimeSchema } from "./replay-live-runtime";
import type {
  ReplayLiveRuntimeSnapshot,
} from "./replay-live-runtime-contract";
import type {
  ReplayConsensusDriftVisualizationApi,
  ReplayExecutionTimelineApi,
  ReplayGovernanceStateVisualizationApi,
  ReplayLineageGraphApi,
  ReplayLineageGraphEdgeApi,
  ReplayLineageGraphNodeApi,
  ReplayObservabilityInput,
  ReplayObservabilityQuery,
  ReplayObservabilitySnapshot,
  ReplayObservabilityView,
  ReplayRecoveryEventVisualizationApi,
  ReplayRuntimePropagationVisualizationApi,
  ReplayTelemetryAggregationApi,
  ReplayValidatorTrustEvolutionApi,
} from "./replay-observability-contract";

type SqliteDatabase = Database.Database;

interface PayloadRow {
  readonly payload: string;
}

const SUPPORTED_VIEWS: readonly ReplayObservabilityView[] = [
  "runtime_telemetry_aggregation",
  "consensus_drift_visualization",
  "validator_trust_evolution",
  "replay_lineage_graph",
  "runtime_propagation_visualization",
  "governance_state_visualization",
  "recovery_event_visualization",
  "replay_execution_timeline",
];

const SUPPORTED_QUERIES: readonly ReplayObservabilityQuery[] = [
  "get_runtime_telemetry_aggregation",
  "get_consensus_drift_visualization",
  "get_validator_trust_evolution",
  "get_replay_lineage_graph",
  "get_runtime_propagation_visualization",
  "get_governance_state_visualization",
  "get_recovery_event_visualization",
  "get_replay_execution_timeline",
];

export function initializeReplayObservabilitySchema(db: SqliteDatabase): void {
  initializeReplayLiveRuntimeSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS replay_observability_snapshots (
      observability_id TEXT PRIMARY KEY,
      runtime_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      runtime_hash TEXT NOT NULL,
      deterministic_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replay_observability_views (
      view_id TEXT PRIMARY KEY,
      observability_id TEXT NOT NULL,
      runtime_id TEXT NOT NULL,
      view_kind TEXT NOT NULL,
      view_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_observability_views_runtime
      ON replay_observability_views(runtime_id, view_kind);
  `);
}

export function buildReplayObservabilitySnapshot(
  db: SqliteDatabase,
  input: ReplayObservabilityInput,
): ReplayObservabilitySnapshot {
  initializeReplayObservabilitySchema(db);

  const telemetryAggregation = buildTelemetryAggregation(input.runtime_snapshot);
  const consensusDriftVisualization = buildConsensusDriftVisualization(input.runtime_snapshot);
  const validatorTrustEvolution = buildValidatorTrustEvolution(input.runtime_snapshot);
  const replayLineageGraph = buildReplayLineageGraph(input.runtime_snapshot);
  const runtimePropagationVisualization = buildRuntimePropagationVisualization(input.runtime_snapshot);
  const governanceStateVisualization = buildGovernanceStateVisualization(input.runtime_snapshot);
  const recoveryEventVisualization = buildRecoveryEventVisualization(input.runtime_snapshot);
  const replayExecutionTimeline = buildReplayExecutionTimeline(input.runtime_snapshot);
  const seed = {
    runtime_id: input.runtime_snapshot.runtime_id,
    generated_at: input.generated_at,
    runtime_hash: input.runtime_snapshot.deterministic_hash,
    telemetry_hash: telemetryAggregation.aggregation_hash,
    drift_hashes: consensusDriftVisualization.map((point) => point.point_hash),
    trust_hashes: validatorTrustEvolution.map((series) => series.series_hash),
    lineage_hash: replayLineageGraph.graph_hash,
    propagation_hashes: runtimePropagationVisualization.map((item) => item.propagation_hash),
    governance_hashes: governanceStateVisualization.map((item) => item.state_hash),
    recovery_hashes: recoveryEventVisualization.map((item) => item.event_hash),
    timeline_hashes: replayExecutionTimeline.map((item) => item.timeline_hash),
  };
  const deterministicHash = computeReplayObservabilityHash(seed);
  const snapshot = deepFreeze({
    observability_id: `replay-observability:${deterministicHash}`,
    runtime_id: input.runtime_snapshot.runtime_id,
    generated_at: input.generated_at,
    runtime_hash: input.runtime_snapshot.deterministic_hash,
    telemetry_aggregation: telemetryAggregation,
    consensus_drift_visualization: consensusDriftVisualization,
    validator_trust_evolution: validatorTrustEvolution,
    replay_lineage_graph: replayLineageGraph,
    runtime_propagation_visualization: runtimePropagationVisualization,
    governance_state_visualization: governanceStateVisualization,
    recovery_event_visualization: recoveryEventVisualization,
    replay_execution_timeline: replayExecutionTimeline,
    supported_views: SUPPORTED_VIEWS,
    supported_queries: SUPPORTED_QUERIES,
    deterministic_hash: deterministicHash,
  });

  persistReplayObservabilitySnapshot(db, snapshot);
  return snapshot;
}

export function getRuntimeTelemetryAggregation(
  db: SqliteDatabase,
  runtimeId: string,
): ReplayTelemetryAggregationApi | null {
  return getSingleView(db, runtimeId, "runtime_telemetry_aggregation") as ReplayTelemetryAggregationApi | null;
}

export function getConsensusDriftVisualization(
  db: SqliteDatabase,
  runtimeId: string,
): readonly ReplayConsensusDriftVisualizationApi[] {
  return getViewList<ReplayConsensusDriftVisualizationApi>(db, runtimeId, "consensus_drift_visualization");
}

export function getValidatorTrustEvolution(
  db: SqliteDatabase,
  runtimeId: string,
): readonly ReplayValidatorTrustEvolutionApi[] {
  return getViewList<ReplayValidatorTrustEvolutionApi>(db, runtimeId, "validator_trust_evolution");
}

export function getReplayLineageGraph(
  db: SqliteDatabase,
  runtimeId: string,
): ReplayLineageGraphApi | null {
  return getSingleView(db, runtimeId, "replay_lineage_graph") as ReplayLineageGraphApi | null;
}

export function getRuntimePropagationVisualization(
  db: SqliteDatabase,
  runtimeId: string,
): readonly ReplayRuntimePropagationVisualizationApi[] {
  return getViewList<ReplayRuntimePropagationVisualizationApi>(db, runtimeId, "runtime_propagation_visualization");
}

export function getGovernanceStateVisualization(
  db: SqliteDatabase,
  runtimeId: string,
): readonly ReplayGovernanceStateVisualizationApi[] {
  return getViewList<ReplayGovernanceStateVisualizationApi>(db, runtimeId, "governance_state_visualization");
}

export function getRecoveryEventVisualization(
  db: SqliteDatabase,
  runtimeId: string,
): readonly ReplayRecoveryEventVisualizationApi[] {
  return getViewList<ReplayRecoveryEventVisualizationApi>(db, runtimeId, "recovery_event_visualization");
}

export function getReplayExecutionTimeline(
  db: SqliteDatabase,
  runtimeId: string,
): readonly ReplayExecutionTimelineApi[] {
  return getViewList<ReplayExecutionTimelineApi>(db, runtimeId, "replay_execution_timeline");
}

export function serializeReplayObservabilitySnapshot(snapshot: ReplayObservabilitySnapshot): string {
  return stableObservabilityStringify(snapshot);
}

export function computeReplayObservabilityHash(value: unknown): string {
  return crypto.createHash("sha256").update(stableObservabilityStringify(value)).digest("hex");
}

function buildTelemetryAggregation(runtime: ReplayLiveRuntimeSnapshot): ReplayTelemetryAggregationApi {
  const seed = {
    runtime_id: runtime.runtime_id,
    cycle_count: runtime.cycles.length,
    total_canonical_records: runtime.telemetry.reduce((sum, record) => sum + record.canonical_records, 0),
    total_consensus_results: runtime.telemetry.reduce((sum, record) => sum + record.consensus_results, 0),
    total_recovery_results: runtime.telemetry.reduce((sum, record) => sum + record.recovery_results, 0),
    average_trust_score: roundObservabilityNumber(average(runtime.telemetry.map((record) => record.average_trust_score))),
    average_drift_score: roundObservabilityNumber(average(runtime.telemetry.map((record) => record.drift_score))),
  };
  const aggregationHash = computeReplayObservabilityHash(seed);
  return {
    api_id: `replay-telemetry-aggregation:${aggregationHash}`,
    ...seed,
    aggregation_hash: aggregationHash,
  };
}

function buildConsensusDriftVisualization(runtime: ReplayLiveRuntimeSnapshot): readonly ReplayConsensusDriftVisualizationApi[] {
  return deepFreeze(runtime.consensus_drift.map((record, index) => {
    const seed = {
      cycle_id: record.cycle_id,
      previous_cycle_id: record.previous_cycle_id,
      x_sequence: index + 1,
      drift_score: record.drift_score,
      approval_ratio_delta: record.approval_ratio_delta,
      trust_score_delta: record.trust_score_delta,
      drift_detected: record.drift_detected,
      severity_band: severityBand(record.drift_score),
    };
    const pointHash = computeReplayObservabilityHash(seed);
    return {
      point_id: `replay-drift-point:${pointHash}`,
      ...seed,
      point_hash: pointHash,
    };
  }));
}

function buildValidatorTrustEvolution(runtime: ReplayLiveRuntimeSnapshot): readonly ReplayValidatorTrustEvolutionApi[] {
  const byValidator = new Map<string, {
    validator_id: string;
    validator_type: string;
    points: ReplayValidatorTrustEvolutionApi["points"];
  }>();
  for (const loop of runtime.validator_execution_loops) {
    const key = loop.validator_id;
    const current = byValidator.get(key) ?? {
      validator_id: loop.validator_id,
      validator_type: loop.validator_type,
      points: [],
    };
    current.points = [...current.points, {
      cycle_id: loop.cycle_id,
      trust_score: loop.trust_score,
      adapted_weight: loop.adapted_weight,
      trust_state: loop.trust_state,
    }];
    byValidator.set(key, current);
  }

  return deepFreeze(Array.from(byValidator.values()).map((series) => {
    const points = [...series.points].sort((left, right) => left.cycle_id.localeCompare(right.cycle_id));
    const latest = points.at(-1);
    const first = points[0];
    const seed = {
      validator_id: series.validator_id,
      validator_type: series.validator_type,
      points,
      latest_trust_score: latest?.trust_score ?? 0,
      trust_delta: roundObservabilityNumber((latest?.trust_score ?? 0) - (first?.trust_score ?? 0)),
    };
    const seriesHash = computeReplayObservabilityHash(seed);
    return {
      series_id: `replay-validator-trust-series:${seriesHash}`,
      ...seed,
      series_hash: seriesHash,
    };
  }).sort((left, right) => left.validator_id.localeCompare(right.validator_id)));
}

function buildReplayLineageGraph(runtime: ReplayLiveRuntimeSnapshot): ReplayLineageGraphApi {
  const nodes: ReplayLineageGraphNodeApi[] = [];
  const edges: ReplayLineageGraphEdgeApi[] = [];
  const runtimeNode = graphNode("runtime", runtime.runtime_id, null, runtime.deterministic_hash, "runtime");
  nodes.push(runtimeNode);

  for (const cycle of runtime.cycles) {
    const cycleNode = graphNode("cycle", cycle.cycle_id, cycle.cycle_id, cycle.cycle_hash, "cycle");
    const bridgeNode = graphNode("bridge", `bridge:${cycle.cycle_id}`, cycle.cycle_id, cycle.bridge_hash, "bridge");
    const trustNode = graphNode("trust", `trust:${cycle.cycle_id}`, cycle.cycle_id, cycle.trust_hash, "trust");
    nodes.push(cycleNode, bridgeNode, trustNode);
    edges.push(graphEdge(runtimeNode.node_id, cycleNode.node_id, "executes"));
    edges.push(graphEdge(cycleNode.node_id, bridgeNode.node_id, "produces"));
    edges.push(graphEdge(bridgeNode.node_id, trustNode.node_id, "produces"));
  }

  for (const coordination of runtime.consensus_coordination) {
    const node = graphNode("consensus", `consensus:${coordination.coordination_id}`, coordination.cycle_id, coordination.coordination_hash, "consensus");
    nodes.push(node);
    edges.push(graphEdge(`cycle:${coordination.cycle_id}`, node.node_id, "coordinates"));
  }

  for (const recovery of runtime.recovery_monitoring) {
    const node = graphNode("recovery", `recovery:${recovery.recovery_id}`, recovery.cycle_id, recovery.recovery_hash, "recovery");
    nodes.push(node);
    edges.push(graphEdge(`cycle:${recovery.cycle_id}`, node.node_id, "recovers"));
  }

  for (const propagation of runtime.intelligence_propagation) {
    const node = graphNode("propagation", `propagation:${propagation.propagation_id}`, propagation.cycle_id, propagation.propagation_hash, "propagation");
    nodes.push(node);
    edges.push(graphEdge(`trust:${propagation.cycle_id}`, node.node_id, "propagates"));
  }

  const sortedNodes = nodes.sort((left, right) => left.node_id.localeCompare(right.node_id));
  const sortedEdges = edges.sort((left, right) => left.edge_id.localeCompare(right.edge_id));
  const seed = {
    runtime_id: runtime.runtime_id,
    node_hashes: sortedNodes.map((node) => node.node_hash),
    edge_hashes: sortedEdges.map((edge) => edge.edge_hash),
  };
  const graphHash = computeReplayObservabilityHash(seed);
  return deepFreeze({
    graph_id: `replay-observability-lineage:${graphHash}`,
    nodes: sortedNodes,
    edges: sortedEdges,
    graph_hash: graphHash,
  });
}

function buildRuntimePropagationVisualization(runtime: ReplayLiveRuntimeSnapshot): readonly ReplayRuntimePropagationVisualizationApi[] {
  return deepFreeze(runtime.intelligence_propagation.map((record) => ({
    propagation_id: record.propagation_id,
    cycle_id: record.cycle_id,
    bridge_hash: record.bridge_hash,
    trust_hash: record.trust_hash,
    intelligence_hash: record.consensus_intelligence_hash,
    evolution_hash: record.evolution_hash,
    propagated_validator_count: record.propagated_validator_count,
    propagation_hash: record.propagation_hash,
  })));
}

function buildGovernanceStateVisualization(runtime: ReplayLiveRuntimeSnapshot): readonly ReplayGovernanceStateVisualizationApi[] {
  const groups = new Map<string, string[]>();
  for (const record of runtime.consensus_coordination) {
    const key = `${record.cycle_id}|${record.governance_action ?? "none"}`;
    groups.set(key, [...(groups.get(key) ?? []), record.replay_hash].sort((left, right) => left.localeCompare(right)));
  }
  return deepFreeze(Array.from(groups.entries()).map(([key, replayHashes]) => {
    const [cycleId, governanceAction] = key.split("|");
    const seed = {
      cycle_id: cycleId ?? "",
      governance_action: governanceAction ?? "none",
      decision_count: replayHashes.length,
      replay_hashes: replayHashes,
    };
    const stateHash = computeReplayObservabilityHash(seed);
    return {
      state_id: `replay-governance-state-view:${stateHash}`,
      ...seed,
      state_hash: stateHash,
    };
  }).sort((left, right) =>
    left.cycle_id.localeCompare(right.cycle_id) ||
    left.governance_action.localeCompare(right.governance_action),
  ));
}

function buildRecoveryEventVisualization(runtime: ReplayLiveRuntimeSnapshot): readonly ReplayRecoveryEventVisualizationApi[] {
  return deepFreeze(runtime.recovery_monitoring.map((record) => {
    const seed = {
      cycle_id: record.cycle_id,
      replay_hash: record.replay_hash,
      recovery_required: record.recovery_required,
      recovery_action_count: record.recovery_action_count,
      trust_state: record.trust_state,
    };
    const eventHash = computeReplayObservabilityHash(seed);
    return {
      recovery_event_id: `replay-recovery-event-view:${eventHash}`,
      ...seed,
      event_hash: eventHash,
    };
  }));
}

function buildReplayExecutionTimeline(runtime: ReplayLiveRuntimeSnapshot): readonly ReplayExecutionTimelineApi[] {
  return deepFreeze(runtime.state_stream.map((event) => {
    const seed = {
      cycle_id: event.cycle_id,
      sequence: event.sequence,
      state: event.state,
      event_type: event.event_type,
      payload_hash: event.payload_hash,
    };
    const timelineHash = computeReplayObservabilityHash(seed);
    return {
      timeline_event_id: `replay-execution-timeline:${timelineHash}`,
      ...seed,
      timeline_hash: timelineHash,
    };
  }));
}

function graphNode(
  nodeKind: ReplayLineageGraphNodeApi["node_kind"],
  label: string,
  cycleId: string | null,
  sourceHash: string,
  idPrefix: string,
): ReplayLineageGraphNodeApi {
  const seed = { node_kind: nodeKind, label, cycle_id: cycleId, source_hash: sourceHash };
  const nodeHash = computeReplayObservabilityHash(seed);
  return {
    node_id: `${idPrefix}:${label}`,
    ...seed,
    node_hash: nodeHash,
  };
}

function graphEdge(
  fromNodeId: string,
  toNodeId: string,
  relationship: ReplayLineageGraphEdgeApi["relationship"],
): ReplayLineageGraphEdgeApi {
  const seed = { from_node_id: fromNodeId, to_node_id: toNodeId, relationship };
  const edgeHash = computeReplayObservabilityHash(seed);
  return {
    edge_id: `replay-lineage-edge:${edgeHash}`,
    ...seed,
    edge_hash: edgeHash,
  };
}

function persistReplayObservabilitySnapshot(db: SqliteDatabase, snapshot: ReplayObservabilitySnapshot): void {
  const write = db.transaction(() => {
    db.prepare(`
      INSERT OR REPLACE INTO replay_observability_snapshots
      (observability_id, runtime_id, generated_at, runtime_hash, deterministic_hash, payload)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(snapshot.observability_id, snapshot.runtime_id, snapshot.generated_at, snapshot.runtime_hash, snapshot.deterministic_hash, stableObservabilityStringify(snapshot));

    persistView(db, snapshot, "runtime_telemetry_aggregation", snapshot.telemetry_aggregation.api_id, snapshot.telemetry_aggregation.aggregation_hash, snapshot.telemetry_aggregation);
    persistView(db, snapshot, "replay_lineage_graph", snapshot.replay_lineage_graph.graph_id, snapshot.replay_lineage_graph.graph_hash, snapshot.replay_lineage_graph);
    for (const point of snapshot.consensus_drift_visualization) persistView(db, snapshot, "consensus_drift_visualization", point.point_id, point.point_hash, point);
    for (const series of snapshot.validator_trust_evolution) persistView(db, snapshot, "validator_trust_evolution", series.series_id, series.series_hash, series);
    for (const item of snapshot.runtime_propagation_visualization) persistView(db, snapshot, "runtime_propagation_visualization", item.propagation_id, item.propagation_hash, item);
    for (const item of snapshot.governance_state_visualization) persistView(db, snapshot, "governance_state_visualization", item.state_id, item.state_hash, item);
    for (const item of snapshot.recovery_event_visualization) persistView(db, snapshot, "recovery_event_visualization", item.recovery_event_id, item.event_hash, item);
    for (const item of snapshot.replay_execution_timeline) persistView(db, snapshot, "replay_execution_timeline", item.timeline_event_id, item.timeline_hash, item);
  });
  write();
}

function persistView(
  db: SqliteDatabase,
  snapshot: ReplayObservabilitySnapshot,
  viewKind: ReplayObservabilityView,
  viewId: string,
  viewHash: string,
  payload: unknown,
): void {
  db.prepare(`
    INSERT OR REPLACE INTO replay_observability_views
    (view_id, observability_id, runtime_id, view_kind, view_hash, payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(viewId, snapshot.observability_id, snapshot.runtime_id, viewKind, viewHash, stableObservabilityStringify(payload));
}

function getSingleView(
  db: SqliteDatabase,
  runtimeId: string,
  viewKind: ReplayObservabilityView,
): unknown | null {
  initializeReplayObservabilitySchema(db);
  const row = db.prepare(`
    SELECT payload FROM replay_observability_views
    WHERE runtime_id = ? AND view_kind = ?
    ORDER BY view_hash ASC
    LIMIT 1
  `).get(runtimeId, viewKind) as PayloadRow | undefined;
  return row ? deepFreeze(JSON.parse(row.payload) as unknown) : null;
}

function getViewList<T>(
  db: SqliteDatabase,
  runtimeId: string,
  viewKind: ReplayObservabilityView,
): readonly T[] {
  initializeReplayObservabilitySchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_observability_views
    WHERE runtime_id = ? AND view_kind = ?
    ORDER BY view_hash ASC
  `).all(runtimeId, viewKind) as PayloadRow[];
  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as T));
}

function severityBand(value: number): "low" | "medium" | "high" {
  if (value >= 0.45) return "high";
  if (value >= 0.18) return "medium";
  return "low";
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundObservabilityNumber(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function stableObservabilityStringify(value: unknown): string {
  return JSON.stringify(sortObservabilityKeys(value));
}

function sortObservabilityKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObservabilityKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortObservabilityKeys((value as Record<string, unknown>)[key]);
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
