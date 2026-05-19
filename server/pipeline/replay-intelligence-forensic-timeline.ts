import crypto from "crypto";
import {
  buildReplayIntelligenceHistoryDiff,
  chronologicalReplayTraversal,
  expandReplayLineage,
  listReplayIntelligenceHistoricalSnapshots,
} from "./replay-intelligence-history";
import { getReplayIntelligenceHistoryLineageRow } from "./replay-intelligence-history-store";
import { reduceReplayConvergenceAnalytics } from "./replay-convergence-reducer";

const FORENSIC_TIMELINE_GENERATED_AT = "2026-01-01T00:00:00.000Z";

export interface ReplayIntelligenceForensicTimelineEvent {
  readonly event_id: string;
  readonly event_type: "audit" | "convergence" | "mutation" | "anomaly";
  readonly replay_hash: string;
  readonly generated_at: string;
  readonly sequence: number;
  readonly event_hash: string;
  readonly severity: "info" | "warning" | "critical";
  readonly lineage_parent_hash: string | null;
}

export interface ReplayIntelligenceForensicAnomalyProgression {
  readonly event_id: string;
  readonly replay_hash: string;
  readonly generated_at: string;
  readonly sequence: number;
  readonly severity: "warning" | "critical";
  readonly status: "warning" | "failed";
  readonly anomaly_hash: string;
}

export interface ReplayIntelligenceForensicConvergenceEvolution {
  readonly replay_hash: string;
  readonly generated_at: string;
  readonly sequence: number;
  readonly convergence_score: number;
  readonly instability_score: number;
  readonly stability_index: number;
  readonly replay_count: number;
  readonly convergence_hash: string;
}

export interface ReplayIntelligenceForensicTimelineReducer {
  readonly timeline_hash: string;
  readonly replay_hash: string;
  readonly generated_at: string;
  readonly event_count: number;
  readonly anomaly_count: number;
  readonly convergence: ReturnType<typeof reduceReplayConvergenceAnalytics>;
  readonly drift_summary: {
    readonly replay_hash: string;
    readonly changed_fields: readonly string[];
    readonly changed_field_count: number;
    readonly deterministic_hash: string | null;
  };
  readonly chronology_hash: string;
  readonly reducer_hash: string;
  readonly orchestration_ready: boolean;
}

export interface ReplayIntelligenceForensicTimeline {
  readonly timeline_hash: string;
  readonly replay_hash: string;
  readonly generated_at: string;
  readonly event_count: number;
  readonly events: readonly ReplayIntelligenceForensicTimelineEvent[];
  readonly anomalies: readonly ReplayIntelligenceForensicAnomalyProgression[];
  readonly convergence_evolution: readonly ReplayIntelligenceForensicConvergenceEvolution[];
  readonly drift_summary: ReplayIntelligenceForensicTimelineReducer["drift_summary"];
  readonly immutable_event_lineage: Readonly<Record<string, string | null>>;
  readonly reducers: ReplayIntelligenceForensicTimelineReducer;
}

export function buildReplayIntelligenceForensicTimelines():
  readonly ReplayIntelligenceForensicTimeline[] {
  const replayHashes = Array.from(new Set(
    listReplayIntelligenceHistoricalSnapshots().map((snapshot) => snapshot.replay_hash),
  )).sort((left, right) => left.localeCompare(right));

  return deepFreeze(replayHashes.map(buildTimelineForReplay).filter(
    (timeline): timeline is ReplayIntelligenceForensicTimeline => timeline !== null,
  ));
}

export function buildReplayIntelligenceForensicTimelineSummary() {
  const timelines = buildReplayIntelligenceForensicTimelines();
  const convergence = reduceReplayConvergenceAnalytics(
    timelines.map((timeline) => ({
      convergence_score: timeline.reducers.convergence.average_convergence_score,
      instability_score: timeline.reducers.convergence.average_instability_score,
      replay_count: timeline.reducers.convergence.total_replays,
    })),
  );
  const payload = {
    generated_at: latestTimestamp(timelines.map((timeline) => timeline.generated_at)),
    timeline_count: timelines.length,
    event_count: timelines.reduce((sum, timeline) => sum + timeline.event_count, 0),
    anomaly_count: timelines.reduce((sum, timeline) => sum + timeline.anomalies.length, 0),
    convergence,
    timeline_hashes: timelines.map((timeline) => timeline.timeline_hash),
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

export function getReplayIntelligenceForensicTimelineByHash(
  timelineHash: string,
): ReplayIntelligenceForensicTimeline | null {
  return buildReplayIntelligenceForensicTimelines().find(
    (timeline) => timeline.timeline_hash === timelineHash,
  ) ?? null;
}

export function buildReplayIntelligenceForensicTimelineEvents(timelineHash: string) {
  const timeline = getReplayIntelligenceForensicTimelineByHash(timelineHash);
  if (!timeline) return null;
  const payload = {
    timeline_hash: timelineHash,
    replay_hash: timeline.replay_hash,
    generated_at: timeline.generated_at,
    count: timeline.events.length,
    events: timeline.events,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

export function buildReplayIntelligenceForensicTimelineAnomalies(timelineHash: string) {
  const timeline = getReplayIntelligenceForensicTimelineByHash(timelineHash);
  if (!timeline) return null;
  const payload = {
    timeline_hash: timelineHash,
    replay_hash: timeline.replay_hash,
    generated_at: timeline.generated_at,
    count: timeline.anomalies.length,
    anomalies: timeline.anomalies,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

export function buildReplayIntelligenceForensicTimelineConvergence(timelineHash: string) {
  const timeline = getReplayIntelligenceForensicTimelineByHash(timelineHash);
  if (!timeline) return null;
  const payload = {
    timeline_hash: timelineHash,
    replay_hash: timeline.replay_hash,
    generated_at: timeline.generated_at,
    count: timeline.convergence_evolution.length,
    convergence_evolution: timeline.convergence_evolution,
    aggregation: timeline.reducers.convergence,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

export function buildReplayIntelligenceForensicTimelineReducers(timelineHash: string) {
  const timeline = getReplayIntelligenceForensicTimelineByHash(timelineHash);
  if (!timeline) return null;
  const payload = {
    timeline_hash: timelineHash,
    reducers: timeline.reducers,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

function buildTimelineForReplay(
  replayHash: string,
): ReplayIntelligenceForensicTimeline | null {
  const snapshots = listReplayIntelligenceHistoricalSnapshots()
    .filter((snapshot) => snapshot.replay_hash === replayHash)
    .sort((left, right) =>
      left.generated_at.localeCompare(right.generated_at) ||
      left.snapshot_hash.localeCompare(right.snapshot_hash),
    );
  if (snapshots.length === 0) return null;

  const baseEvents = chronologicalReplayTraversal(replayHash);
  const mutationEvents = buildMutationEvents(replayHash);
  const anomalyEvents = buildAnomalyEvents(replayHash);
  const lineage = buildImmutableEventLineage(replayHash);
  const events = [...baseEvents.map((event) => ({
    event_type: event.event_type,
    replay_hash: event.replay_hash,
    generated_at: normalizeTimestamp(event.generated_at),
    event_hash: event.event_hash,
    severity: "info" as const,
    lineage_parent_hash: lineage[event.replay_hash] ?? null,
  })), ...mutationEvents, ...anomalyEvents]
    .sort((left, right) =>
      left.generated_at.localeCompare(right.generated_at) ||
      eventTypeRank(left.event_type) - eventTypeRank(right.event_type) ||
      left.event_hash.localeCompare(right.event_hash),
    )
    .map((event, index) => {
      const payload = {
        ...event,
        sequence: index + 1,
      };
      return {
        ...payload,
        event_id: deterministicHash(payload),
      };
    });

  const anomalies = events
    .filter((event) => event.event_type === "anomaly")
    .map((event) => {
      const status: "warning" | "failed" =
        event.severity === "critical" ? "failed" : "warning";
      const payload = {
        event_id: event.event_id,
        replay_hash: event.replay_hash,
        generated_at: event.generated_at,
        sequence: event.sequence,
        severity: event.severity as "warning" | "critical",
        status,
      };
      return {
        ...payload,
        anomaly_hash: deterministicHash(payload),
      };
    });
  const convergenceEvolution = snapshots
    .filter((snapshot) => snapshot.convergence)
    .map((snapshot, index) => ({
      replay_hash: replayHash,
      generated_at: normalizeTimestamp(snapshot.generated_at),
      sequence: index + 1,
      convergence_score: snapshot.convergence?.convergence_score ?? 0,
      instability_score: snapshot.convergence?.instability_score ?? 0,
      stability_index: snapshot.convergence?.stability_index ?? 0,
      replay_count: snapshot.convergence?.replay_count ?? 0,
      convergence_hash: snapshot.convergence?.convergence_hash ?? "",
    }));
  const driftSummary = buildDriftSummary(replayHash);
  const generatedAt = latestTimestamp(events.map((event) => event.generated_at));
  const timelineSeed = {
    replay_hash: replayHash,
    generated_at: generatedAt,
    events,
    anomalies,
    convergence_evolution: convergenceEvolution,
    drift_summary: driftSummary,
    immutable_event_lineage: lineage,
  };
  const timelineHash = deterministicHash(timelineSeed);
  const reducers = buildTimelineReducer(
    timelineHash,
    replayHash,
    generatedAt,
    events,
    anomalies,
    convergenceEvolution,
    driftSummary,
  );

  return deepFreeze({
    timeline_hash: timelineHash,
    replay_hash: replayHash,
    generated_at: generatedAt,
    event_count: events.length,
    events,
    anomalies,
    convergence_evolution: convergenceEvolution,
    drift_summary: driftSummary,
    immutable_event_lineage: lineage,
    reducers,
  });
}

function buildMutationEvents(replayHash: string) {
  const snapshots = listReplayIntelligenceHistoricalSnapshots()
    .filter((snapshot) => snapshot.replay_hash === replayHash)
    .sort((left, right) => left.generated_at.localeCompare(right.generated_at));
  const events: Array<Omit<ReplayIntelligenceForensicTimelineEvent, "event_id" | "sequence">> = [];

  for (let index = 1; index < snapshots.length; index += 1) {
    const previous = snapshots[index - 1];
    const current = snapshots[index];
    const changed =
      previous.audit?.analytics_hash !== current.audit?.analytics_hash ||
      (previous.audit?.convergence_hash ?? previous.convergence?.convergence_hash ?? null) !==
        (current.audit?.convergence_hash ?? current.convergence?.convergence_hash ?? null) ||
      previous.audit?.validation_status !== current.audit?.validation_status ||
      previous.convergence?.stability_index !== current.convergence?.stability_index;
    if (!changed) continue;

    const seed = {
      replay_hash: replayHash,
      generated_at: normalizeTimestamp(current.generated_at),
      previous_snapshot_hash: previous.snapshot_hash,
      current_snapshot_hash: current.snapshot_hash,
    };
    events.push({
      event_type: "mutation",
      replay_hash: replayHash,
      generated_at: seed.generated_at,
      event_hash: deterministicHash(seed),
      severity: "info",
      lineage_parent_hash: buildImmutableEventLineage(replayHash)[replayHash] ?? null,
    });
  }

  return events;
}

function buildAnomalyEvents(replayHash: string) {
  return listReplayIntelligenceHistoricalSnapshots()
    .filter((snapshot) =>
      snapshot.replay_hash === replayHash &&
      (snapshot.audit?.validation_status === "warning" ||
        snapshot.audit?.validation_status === "failed"),
    )
    .map((snapshot) => {
      const seed = {
        replay_hash: replayHash,
        generated_at: normalizeTimestamp(snapshot.generated_at),
        validation_status: snapshot.audit?.validation_status,
        snapshot_hash: snapshot.snapshot_hash,
      };
      return {
        event_type: "anomaly" as const,
        replay_hash: replayHash,
        generated_at: seed.generated_at,
        event_hash: deterministicHash(seed),
        severity: snapshot.audit?.validation_status === "failed"
          ? "critical" as const
          : "warning" as const,
        lineage_parent_hash: buildImmutableEventLineage(replayHash)[replayHash] ?? null,
      };
    });
}

function buildTimelineReducer(
  timelineHash: string,
  replayHash: string,
  generatedAt: string,
  events: readonly ReplayIntelligenceForensicTimelineEvent[],
  anomalies: readonly ReplayIntelligenceForensicAnomalyProgression[],
  convergenceEvolution: readonly ReplayIntelligenceForensicConvergenceEvolution[],
  driftSummary: ReplayIntelligenceForensicTimelineReducer["drift_summary"],
): ReplayIntelligenceForensicTimelineReducer {
  const convergence = reduceReplayConvergenceAnalytics(
    convergenceEvolution.map((event) => ({
      convergence_score: event.convergence_score,
      instability_score: event.instability_score,
      replay_count: event.replay_count,
    })),
  );
  const chronologyHash = deterministicHash(events.map((event) => ({
    sequence: event.sequence,
    generated_at: event.generated_at,
    event_hash: event.event_hash,
  })));
  const payload = {
    timeline_hash: timelineHash,
    replay_hash: replayHash,
    generated_at: generatedAt,
    event_count: events.length,
    anomaly_count: anomalies.length,
    convergence,
    drift_summary: driftSummary,
    chronology_hash: chronologyHash,
    orchestration_ready: events.length > 0 && isChronological(events),
  };

  return deepFreeze({
    ...payload,
    reducer_hash: deterministicHash(payload),
  });
}

function buildDriftSummary(
  replayHash: string,
): ReplayIntelligenceForensicTimelineReducer["drift_summary"] {
  const diff = buildReplayIntelligenceHistoryDiff(replayHash);
  return deepFreeze({
    replay_hash: replayHash,
    changed_fields: diff?.diffs
      .filter((item) => item.changed)
      .map((item) => item.field)
      .sort((left, right) => left.localeCompare(right)) ?? [],
    changed_field_count: diff?.changed_fields ?? 0,
    deterministic_hash: diff?.deterministic_hash ?? null,
  });
}

function buildImmutableEventLineage(
  replayHash: string,
): Readonly<Record<string, string | null>> {
  const lineage: Record<string, string | null> = {};
  const visited = new Set<string>();
  let current = getReplayIntelligenceHistoryLineageRow(replayHash);

  while (current && !visited.has(current.replay_hash)) {
    visited.add(current.replay_hash);
    lineage[current.replay_hash] = current.parent_replay_hash;
    current = current.parent_replay_hash
      ? getReplayIntelligenceHistoryLineageRow(current.parent_replay_hash)
      : null;
  }

  for (const node of expandReplayLineage(replayHash)) {
    if (!(node.replay_id in lineage)) {
      lineage[node.replay_id] = node.parent_replay_id ?? null;
    }
  }

  return deepFreeze(lineage);
}

function eventTypeRank(eventType: ReplayIntelligenceForensicTimelineEvent["event_type"]): number {
  return {
    audit: 0,
    convergence: 1,
    mutation: 2,
    anomaly: 3,
  }[eventType];
}

function isChronological(events: readonly ReplayIntelligenceForensicTimelineEvent[]): boolean {
  return events.every((event, index) =>
    index === 0 || events[index - 1].generated_at <= event.generated_at,
  );
}

function normalizeTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? timestamp : parsed.toISOString();
}

function latestTimestamp(timestamps: readonly string[]): string {
  return [...timestamps].sort((left, right) => right.localeCompare(left))[0] ??
    FORENSIC_TIMELINE_GENERATED_AT;
}

function deterministicHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(value))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) {
      deepFreeze(item);
    }
  }

  return value;
}
