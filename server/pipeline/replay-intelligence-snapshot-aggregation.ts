import crypto from "crypto";
import {
  buildReplayIntelligenceHistoryDiff,
  expandReplayLineage,
  listReplayIntelligenceHistoricalSnapshots,
  type ReplayIntelligenceHistoricalSnapshot,
} from "./replay-intelligence-history";
import {
  getReplayIntelligenceHistoryLineageRow,
  listReplayIntelligenceHistoryLineageRows,
} from "./replay-intelligence-history-store";
import { reduceReplayConvergenceAnalytics } from "./replay-convergence-reducer";

const SNAPSHOT_AGGREGATED_AT = "2026-01-01T00:00:00.000Z";

export interface ReplayIntelligenceCompressedAncestryNode {
  readonly replay_hash: string;
  readonly parent_replay_hash: string | null;
  readonly depth: number;
}

export interface ReplayIntelligenceMutationSummary {
  readonly replay_hash: string;
  readonly generated_at: string;
  readonly transition_count: number;
  readonly changed_field_count: number;
  readonly changed_fields: readonly string[];
  readonly deterministic_hash: string;
}

export interface ReplayIntelligenceSnapshotReducerDerivation {
  readonly snapshot_hash: string;
  readonly replay_hash: string;
  readonly generated_at: string;
  readonly reducer_inputs: readonly {
    readonly replay_hash: string;
    readonly convergence_score: number;
    readonly instability_score: number;
    readonly replay_count: number;
  }[];
  readonly reduction: ReturnType<typeof reduceReplayConvergenceAnalytics>;
  readonly consensus_ready: boolean;
  readonly reducer_hash: string;
}

export interface ReplayIntelligenceSnapshotGroup {
  readonly replay_hash: string;
  readonly generated_at: string;
  readonly canonical_snapshot_hash: string;
  readonly snapshot_count: number;
  readonly snapshots: readonly ReplayIntelligenceHistoricalSnapshot[];
  readonly compressed_ancestry: readonly ReplayIntelligenceCompressedAncestryNode[];
  readonly convergence: ReturnType<typeof reduceReplayConvergenceAnalytics>;
  readonly mutation_summary: ReplayIntelligenceMutationSummary;
  readonly reducer_ready_snapshots: readonly ReplayIntelligenceSnapshotReducerDerivation[];
  readonly immutable_lineage: Readonly<Record<string, string | null>>;
  readonly group_hash: string;
}

export function buildReplayIntelligenceSnapshotAggregation() {
  const groups = buildReplayIntelligenceSnapshotGroups();
  const payload = {
    generated_at: latestTimestamp(groups.map((group) => group.generated_at)),
    count: groups.length,
    snapshot_count: groups.reduce((sum, group) => sum + group.snapshot_count, 0),
    groups,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

export function buildReplayIntelligenceSnapshotSummary() {
  const aggregation = buildReplayIntelligenceSnapshotAggregation();
  const convergence = reduceReplayConvergenceAnalytics(
    aggregation.groups.map((group) => ({
      convergence_score: group.convergence.average_convergence_score,
      instability_score: group.convergence.average_instability_score,
      replay_count: group.convergence.total_replays,
    })),
  );
  const payload = {
    generated_at: aggregation.generated_at,
    group_count: aggregation.count,
    snapshot_count: aggregation.snapshot_count,
    lineage_node_count: listReplayIntelligenceHistoryLineageRows().length,
    convergence,
    canonical_snapshot_hashes: aggregation.groups.map((group) =>
      group.canonical_snapshot_hash,
    ),
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

export function buildReplayIntelligenceSnapshotGroups():
  readonly ReplayIntelligenceSnapshotGroup[] {
  const snapshots = listReplayIntelligenceHistoricalSnapshots();
  const replayHashes = Array.from(new Set(
    snapshots.map((snapshot) => snapshot.replay_hash),
  )).sort((left, right) => left.localeCompare(right));

  return deepFreeze(replayHashes.map((replayHash) => {
    const replaySnapshots = sortSnapshots(
      snapshots.filter((snapshot) => snapshot.replay_hash === replayHash),
    );
    const generatedAt = latestTimestamp(replaySnapshots.map((snapshot) =>
      snapshot.generated_at,
    ));
    const canonicalSnapshotHash =
      replaySnapshots[replaySnapshots.length - 1]?.snapshot_hash ?? "";
    const reducerReadySnapshots = replaySnapshots.map((snapshot) =>
      deriveReplayIntelligenceSnapshotReducers(snapshot.snapshot_hash),
    ).filter((snapshot): snapshot is ReplayIntelligenceSnapshotReducerDerivation =>
      snapshot !== null,
    );
    const lineage = buildImmutableLineageMap(replayHash);
    const payload = {
      replay_hash: replayHash,
      generated_at: generatedAt,
      canonical_snapshot_hash: canonicalSnapshotHash,
      snapshot_count: replaySnapshots.length,
      snapshots: replaySnapshots,
      compressed_ancestry: compressReplayAncestry(replayHash),
      convergence: reduceReplayConvergenceAnalytics(
        replaySnapshots.map((snapshot) => snapshot.reducer_ready),
      ),
      mutation_summary: summarizeReplaySnapshotMutations(replayHash, replaySnapshots),
      reducer_ready_snapshots: reducerReadySnapshots,
      immutable_lineage: lineage,
    };

    return deepFreeze({
      ...payload,
      group_hash: deterministicHash(payload),
    });
  }));
}

export function getReplayIntelligenceSnapshotByHash(
  snapshotHash: string,
): ReplayIntelligenceHistoricalSnapshot | null {
  return listReplayIntelligenceHistoricalSnapshots().find(
    (snapshot) => snapshot.snapshot_hash === snapshotHash,
  ) ?? null;
}

export function buildReplayIntelligenceSnapshotLookup(snapshotHash: string) {
  const snapshot = getReplayIntelligenceSnapshotByHash(snapshotHash);
  if (!snapshot) return null;

  const group = buildReplayIntelligenceSnapshotGroups().find(
    (candidate) => candidate.replay_hash === snapshot.replay_hash,
  );
  const payload = {
    snapshot_hash: snapshotHash,
    snapshot,
    group_hash: group?.group_hash ?? null,
    canonical_snapshot_hash: group?.canonical_snapshot_hash ?? snapshotHash,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

export function buildReplayIntelligenceSnapshotConvergence(snapshotHash: string) {
  const snapshot = getReplayIntelligenceSnapshotByHash(snapshotHash);
  if (!snapshot) return null;

  const group = buildReplayIntelligenceSnapshotGroups().find(
    (candidate) => candidate.replay_hash === snapshot.replay_hash,
  );
  if (!group) return null;

  const payload = {
    snapshot_hash: snapshotHash,
    replay_hash: snapshot.replay_hash,
    generated_at: group.generated_at,
    selected_snapshot: snapshot,
    aggregation: group.convergence,
    canonical_snapshot_hash: group.canonical_snapshot_hash,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

export function buildReplayIntelligenceSnapshotLineage(snapshotHash: string) {
  const snapshot = getReplayIntelligenceSnapshotByHash(snapshotHash);
  if (!snapshot) return null;

  const payload = {
    snapshot_hash: snapshotHash,
    replay_hash: snapshot.replay_hash,
    generated_at: snapshot.generated_at,
    compressed_ancestry: compressReplayAncestry(snapshot.replay_hash),
    lineage: expandReplayLineage(snapshot.replay_hash),
    immutable_lineage: buildImmutableLineageMap(snapshot.replay_hash),
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

export function deriveReplayIntelligenceSnapshotReducers(
  snapshotHash: string,
): ReplayIntelligenceSnapshotReducerDerivation | null {
  const snapshot = getReplayIntelligenceSnapshotByHash(snapshotHash);
  if (!snapshot) return null;

  const replaySnapshots = sortSnapshots(
    listReplayIntelligenceHistoricalSnapshots().filter(
      (candidate) => candidate.replay_hash === snapshot.replay_hash &&
        candidate.generated_at <= snapshot.generated_at,
    ),
  );
  const reducerInputs = replaySnapshots.map((candidate) => ({
    replay_hash: candidate.reducer_ready.replay_hash,
    convergence_score: candidate.reducer_ready.convergence_score,
    instability_score: candidate.reducer_ready.instability_score,
    replay_count: candidate.reducer_ready.replay_count,
  }));
  const reduction = reduceReplayConvergenceAnalytics(reducerInputs);
  const payload = {
    snapshot_hash: snapshotHash,
    replay_hash: snapshot.replay_hash,
    generated_at: snapshot.generated_at,
    reducer_inputs: reducerInputs,
    reduction,
    consensus_ready: reducerInputs.length > 0 && reduction.total_replays > 0,
  };

  return deepFreeze({
    ...payload,
    reducer_hash: deterministicHash(payload),
  });
}

export function buildReplayIntelligenceSnapshotReducers(snapshotHash: string) {
  const reducers = deriveReplayIntelligenceSnapshotReducers(snapshotHash);
  if (!reducers) return null;

  const payload = {
    snapshot_hash: snapshotHash,
    reducers,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: deterministicHash(payload),
  });
}

export function compressReplayAncestry(
  replayHash: string,
): readonly ReplayIntelligenceCompressedAncestryNode[] {
  const nodes: ReplayIntelligenceCompressedAncestryNode[] = [];
  const visited = new Set<string>();
  let current = getReplayIntelligenceHistoryLineageRow(replayHash);

  while (current && !visited.has(current.replay_hash)) {
    visited.add(current.replay_hash);
    nodes.push({
      replay_hash: current.replay_hash,
      parent_replay_hash: current.parent_replay_hash,
      depth: 0,
    });
    current = current.parent_replay_hash
      ? getReplayIntelligenceHistoryLineageRow(current.parent_replay_hash)
      : null;
  }

  return deepFreeze(nodes.reverse().map((node, index) => ({
    ...node,
    depth: index,
  })));
}

export function summarizeReplaySnapshotMutations(
  replayHash: string,
  snapshots = listReplayIntelligenceHistoricalSnapshots().filter(
    (snapshot) => snapshot.replay_hash === replayHash,
  ),
): ReplayIntelligenceMutationSummary {
  const sorted = sortSnapshots(snapshots);
  const changedFields = new Set<string>();

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous.audit?.analytics_hash !== current.audit?.analytics_hash) {
      changedFields.add("analytics_hash");
    }
    if (
      (previous.audit?.convergence_hash ?? previous.convergence?.convergence_hash ?? null) !==
      (current.audit?.convergence_hash ?? current.convergence?.convergence_hash ?? null)
    ) {
      changedFields.add("convergence_hash");
    }
    if (previous.audit?.validation_status !== current.audit?.validation_status) {
      changedFields.add("validation_status");
    }
    if (previous.convergence?.stability_index !== current.convergence?.stability_index) {
      changedFields.add("stability_index");
    }
  }

  const diff = buildReplayIntelligenceHistoryDiff(replayHash);
  const payload = {
    replay_hash: replayHash,
    generated_at: latestTimestamp(sorted.map((snapshot) => snapshot.generated_at)),
    transition_count: Math.max(0, sorted.length - 1),
    changed_field_count: changedFields.size,
    changed_fields: Array.from(changedFields).sort((left, right) =>
      left.localeCompare(right),
    ),
    diff_hash: diff?.deterministic_hash ?? null,
  };

  return deepFreeze({
    replay_hash: payload.replay_hash,
    generated_at: payload.generated_at,
    transition_count: payload.transition_count,
    changed_field_count: payload.changed_field_count,
    changed_fields: payload.changed_fields,
    deterministic_hash: deterministicHash(payload),
  });
}

function buildImmutableLineageMap(
  replayHash: string,
): Readonly<Record<string, string | null>> {
  const lineage = Object.fromEntries(
    compressReplayAncestry(replayHash).map((node) => [
      node.replay_hash,
      node.parent_replay_hash,
    ]),
  ) as Record<string, string | null>;

  return deepFreeze(lineage);
}

function sortSnapshots(
  snapshots: readonly ReplayIntelligenceHistoricalSnapshot[],
): ReplayIntelligenceHistoricalSnapshot[] {
  return [...snapshots].sort((left, right) =>
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.generated_at.localeCompare(right.generated_at) ||
    left.snapshot_hash.localeCompare(right.snapshot_hash),
  );
}

function latestTimestamp(timestamps: readonly string[]): string {
  return [...timestamps].sort((left, right) => right.localeCompare(left))[0] ??
    SNAPSHOT_AGGREGATED_AT;
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
