import crypto from "crypto";
import {
  buildReplayIntelligenceAuditHash,
  type ReplayIntelligenceAuditRecord,
} from "./replay-intelligence-audit";
import {
  listReplayIntelligenceAuditRows,
  listReplayIntelligenceAuditRowsByReplayId,
} from "./replay-intelligence-audit-store";
import {
  buildReplayConvergenceHistorySummary,
  type ReplayConvergenceHistoryRecord,
} from "./replay-convergence-history";
import {
  listReplayConvergenceHistoryByReplayId,
  listReplayConvergenceHistoryRows,
  type ReplayConvergenceHistoryRow,
} from "./replay-convergence-history-store";
import { reduceReplayConvergenceAnalytics } from "./replay-convergence-reducer";
import {
  buildReplayStateDiffSummary,
  type ReplayStateDiffSummary,
} from "./replay-state-diff";
import {
  buildReplayTraversalSummary,
  type ReplayTraversalNode,
} from "./replay-traversal-intelligence";
import {
  getReplayIntelligenceHistoryLineageRow,
  listReplayIntelligenceHistoryLineageChildren,
  listReplayIntelligenceHistoryLineageRows,
  type ReplayIntelligenceHistoryLineageRow,
} from "./replay-intelligence-history-store";

const HISTORY_GENERATED_AT = "2026-01-01T00:00:00.000Z";

export interface ReplayIntelligenceHistoryAuditSnapshot
  extends ReplayIntelligenceAuditRecord {
  readonly audit_hash: string;
}

export interface ReplayIntelligenceHistoricalSnapshot {
  readonly replay_hash: string;
  readonly generated_at: string;
  readonly audit: ReplayIntelligenceHistoryAuditSnapshot | null;
  readonly convergence: ReplayConvergenceHistoryRow | null;
  readonly reducer_ready: {
    readonly replay_hash: string;
    readonly convergence_score: number;
    readonly instability_score: number;
    readonly replay_count: number;
  };
  readonly snapshot_hash: string;
}

export interface ReplayIntelligenceHistoryTimelineEvent {
  readonly event_type: "audit" | "convergence";
  readonly replay_hash: string;
  readonly generated_at: string;
  readonly event_hash: string;
}

export interface ReplayIntelligenceHistoryLineageExpansion {
  readonly root_replay_hash: string;
  readonly generated_at: string;
  readonly count: number;
  readonly nodes: readonly ReplayTraversalNode[];
  readonly traversal: ReturnType<typeof buildReplayTraversalSummary>;
  readonly deterministic_hash: string;
}

export function listReplayIntelligenceHistoricalSnapshots():
  ReplayIntelligenceHistoricalSnapshot[] {
  const replayHashes = Array.from(new Set([
    ...listReplayIntelligenceAuditRows().map((row) => row.replay_id),
    ...listReplayConvergenceHistoryRows().map((row) => row.replay_id),
  ])).sort((left, right) => left.localeCompare(right));

  return replayHashes.flatMap((replayHash) =>
    listReplayIntelligenceHistoricalSnapshotsByReplayHash(replayHash),
  );
}

export function listReplayIntelligenceHistoricalSnapshotsByReplayHash(
  replayHash: string,
): ReplayIntelligenceHistoricalSnapshot[] {
  const audits = sortAuditRows(
    listReplayIntelligenceAuditRowsByReplayId(replayHash),
  );
  const convergence = sortConvergenceRows(
    listReplayConvergenceHistoryByReplayId(replayHash),
  );
  const timestamps = Array.from(new Set([
    ...audits.map((row) => row.generated_at),
    ...convergence.map((row) => row.generated_at),
  ])).sort((left, right) => left.localeCompare(right));

  return timestamps.map((generatedAt) => {
    const audit = audits.find((row) => row.generated_at === generatedAt) ??
      latestAuditAtOrBefore(audits, generatedAt);
    const convergenceRow = convergence.find((row) => row.generated_at === generatedAt) ??
      latestConvergenceAtOrBefore(convergence, generatedAt);
    const auditSnapshot = audit ? auditApiRecord(audit) : null;
    const snapshot = {
      replay_hash: replayHash,
      generated_at: generatedAt,
      audit: auditSnapshot,
      convergence: convergenceRow ?? null,
      reducer_ready: {
        replay_hash: replayHash,
        convergence_score: convergenceRow?.convergence_score ?? 0,
        instability_score: convergenceRow?.instability_score ?? 0,
        replay_count: convergenceRow?.replay_count ?? 0,
      },
    };

    return {
      ...snapshot,
      snapshot_hash: deterministicHash(snapshot),
    };
  });
}

export function buildReplayIntelligenceHistorySummary() {
  const snapshots = listReplayIntelligenceHistoricalSnapshots();
  const replayHashes = Array.from(new Set(
    snapshots.map((snapshot) => snapshot.replay_hash),
  )).sort((left, right) => left.localeCompare(right));
  const convergenceRows = sortConvergenceRows(
    listReplayConvergenceHistoryRows(),
  );
  const aggregation = reduceReplayConvergenceAnalytics(convergenceRows);
  const generatedAt = latestTimestamp([
    ...snapshots.map((snapshot) => snapshot.generated_at),
    ...listReplayIntelligenceHistoryLineageRows().map((row) => row.generated_at),
  ]);
  const summary = {
    generated_at: generatedAt,
    replay_count: replayHashes.length,
    snapshot_count: snapshots.length,
    lineage_node_count: listReplayIntelligenceHistoryLineageRows().length,
    convergence: aggregation,
    replay_hashes: replayHashes,
  };

  return {
    ...summary,
    deterministic_hash: deterministicHash(summary),
  };
}

export function buildReplayIntelligenceHistoryForReplay(replayHash: string) {
  const snapshots = listReplayIntelligenceHistoricalSnapshotsByReplayHash(replayHash);
  if (snapshots.length === 0) return null;

  const payload = {
    replay_hash: replayHash,
    generated_at: latestTimestamp(snapshots.map((snapshot) => snapshot.generated_at)),
    count: snapshots.length,
    snapshots,
  };

  return {
    ...payload,
    deterministic_hash: deterministicHash(payload),
  };
}

export function buildReplayIntelligenceHistoryConvergence(replayHash: string) {
  const rows = sortConvergenceRows(
    listReplayConvergenceHistoryByReplayId(replayHash),
  );
  if (rows.length === 0) return null;

  const records = rows.map(toConvergenceRecord);
  const summary = buildReplayConvergenceHistorySummary(
    replayHash,
    records,
    latestTimestamp(rows.map((row) => row.generated_at)),
  );
  const reducer = reduceReplayConvergenceAnalytics(rows);
  const payload = {
    replay_hash: replayHash,
    generated_at: summary.generated_at,
    count: rows.length,
    records: rows,
    summary,
    reducer_ready: rows.map((row) => ({
      replay_hash: row.replay_id,
      convergence_score: row.convergence_score,
      instability_score: row.instability_score,
      replay_count: row.replay_count,
    })),
    aggregation: reducer,
  };

  return {
    ...payload,
    deterministic_hash: deterministicHash(payload),
  };
}

export function buildReplayIntelligenceHistoryTimeline(replayHash: string) {
  const events = chronologicalReplayTraversal(replayHash);
  if (events.length === 0) return null;

  const payload = {
    replay_hash: replayHash,
    generated_at: latestTimestamp(events.map((event) => event.generated_at)),
    count: events.length,
    timeline: events,
  };

  return {
    ...payload,
    deterministic_hash: deterministicHash(payload),
  };
}

export function buildReplayIntelligenceHistoryDiff(replayHash: string):
  ReplayStateDiffSummary | null {
  const snapshots = listReplayIntelligenceHistoricalSnapshotsByReplayHash(replayHash);
  if (snapshots.length === 0) return null;

  const first = snapshots[0];
  const latest = snapshots[snapshots.length - 1];
  return buildReplayStateDiffSummary(
    replayHash,
    [
      {
        field: "analytics_hash",
        previous_value: first.audit?.analytics_hash ?? null,
        current_value: latest.audit?.analytics_hash ?? null,
        changed: first.audit?.analytics_hash !== latest.audit?.analytics_hash,
      },
      {
        field: "convergence_hash",
        previous_value: first.audit?.convergence_hash ?? first.convergence?.convergence_hash ?? null,
        current_value: latest.audit?.convergence_hash ?? latest.convergence?.convergence_hash ?? null,
        changed:
          (first.audit?.convergence_hash ?? first.convergence?.convergence_hash ?? null) !==
          (latest.audit?.convergence_hash ?? latest.convergence?.convergence_hash ?? null),
      },
      {
        field: "validation_status",
        previous_value: first.audit?.validation_status ?? null,
        current_value: latest.audit?.validation_status ?? null,
        changed: first.audit?.validation_status !== latest.audit?.validation_status,
      },
      {
        field: "stability_index",
        previous_value: first.convergence?.stability_index ?? null,
        current_value: latest.convergence?.stability_index ?? null,
        changed: first.convergence?.stability_index !== latest.convergence?.stability_index,
      },
    ],
    latest.generated_at,
  );
}

export function buildReplayIntelligenceHistoryLineage(
  replayHash: string,
): ReplayIntelligenceHistoryLineageExpansion | null {
  const root = getReplayIntelligenceHistoryLineageRow(replayHash);
  if (!root && listReplayIntelligenceHistoricalSnapshotsByReplayHash(replayHash).length === 0) {
    return null;
  }

  const nodes = expandReplayLineage(replayHash);
  const generatedAt = latestTimestamp(nodes.map((node) =>
    getReplayIntelligenceHistoryLineageRow(node.replay_id)?.generated_at ??
    HISTORY_GENERATED_AT,
  ));
  const traversal = buildReplayTraversalSummary(replayHash, nodes, generatedAt);
  const payload = {
    root_replay_hash: replayHash,
    generated_at: generatedAt,
    count: nodes.length,
    nodes,
    traversal,
  };

  return {
    ...payload,
    deterministic_hash: deterministicHash(payload),
  };
}

export function chronologicalReplayTraversal(
  replayHash: string,
): ReplayIntelligenceHistoryTimelineEvent[] {
  const auditEvents = listReplayIntelligenceAuditRowsByReplayId(replayHash).map((row) => ({
    event_type: "audit" as const,
    replay_hash: replayHash,
    generated_at: row.generated_at,
    event_hash: buildReplayIntelligenceAuditHash(row),
  }));
  const convergenceEvents = listReplayConvergenceHistoryByReplayId(replayHash).map((row) => ({
    event_type: "convergence" as const,
    replay_hash: replayHash,
    generated_at: row.generated_at,
    event_hash: row.convergence_hash,
  }));

  return [...auditEvents, ...convergenceEvents].sort((left, right) =>
    left.generated_at.localeCompare(right.generated_at) ||
    left.event_type.localeCompare(right.event_type) ||
    left.event_hash.localeCompare(right.event_hash),
  );
}

export function expandReplayLineage(replayHash: string): ReplayTraversalNode[] {
  const visited = new Set<string>();
  const queue: Array<{ replayHash: string; parentReplayHash?: string; depth: number }> = [
    { replayHash, depth: 0 },
  ];
  const nodes: ReplayTraversalNode[] = [];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || visited.has(next.replayHash)) continue;
    visited.add(next.replayHash);

    const children = listReplayIntelligenceHistoryLineageChildren(next.replayHash)
      .map((row) => row.replay_hash)
      .sort((left, right) => left.localeCompare(right));
    nodes.push({
      replay_id: next.replayHash,
      parent_replay_id: next.parentReplayHash,
      depth: next.depth,
      children,
    });

    for (const child of children) {
      queue.push({
        replayHash: child,
        parentReplayHash: next.replayHash,
        depth: next.depth + 1,
      });
    }
  }

  return nodes.sort((left, right) =>
    left.depth - right.depth ||
    left.replay_id.localeCompare(right.replay_id),
  );
}

function auditApiRecord(
  record: ReplayIntelligenceAuditRecord,
): ReplayIntelligenceHistoryAuditSnapshot {
  return {
    ...record,
    audit_hash: buildReplayIntelligenceAuditHash(record),
  };
}

function sortAuditRows(
  records: readonly ReplayIntelligenceAuditRecord[],
): ReplayIntelligenceAuditRecord[] {
  return [...records].sort((left, right) =>
    left.generated_at.localeCompare(right.generated_at) ||
    left.replay_id.localeCompare(right.replay_id) ||
    left.analytics_hash.localeCompare(right.analytics_hash),
  );
}

function sortConvergenceRows(
  records: readonly ReplayConvergenceHistoryRow[],
): ReplayConvergenceHistoryRow[] {
  return [...records].sort((left, right) =>
    left.generated_at.localeCompare(right.generated_at) ||
    left.replay_id.localeCompare(right.replay_id) ||
    left.convergence_hash.localeCompare(right.convergence_hash),
  );
}

function latestAuditAtOrBefore(
  records: readonly ReplayIntelligenceAuditRecord[],
  generatedAt: string,
): ReplayIntelligenceAuditRecord | null {
  return [...records].reverse().find((row) => row.generated_at <= generatedAt) ?? null;
}

function latestConvergenceAtOrBefore(
  records: readonly ReplayConvergenceHistoryRow[],
  generatedAt: string,
): ReplayConvergenceHistoryRow | null {
  return [...records].reverse().find((row) => row.generated_at <= generatedAt) ?? null;
}

function toConvergenceRecord(
  row: ReplayConvergenceHistoryRow,
): ReplayConvergenceHistoryRecord {
  return {
    replay_id: row.replay_id,
    generated_at: row.generated_at,
    convergence_score: row.convergence_score,
    instability_score: row.instability_score,
    stability_index: row.stability_index,
    replay_count: row.replay_count,
  };
}

function latestTimestamp(timestamps: readonly string[]): string {
  return [...timestamps].sort((left, right) => right.localeCompare(left))[0] ??
    HISTORY_GENERATED_AT;
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
