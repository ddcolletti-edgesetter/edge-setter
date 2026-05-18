import type {
  ReplayArchiveManifest,
} from "./replay-archive-contract";
import type {
  ReplayArchiveLineageNode,
} from "./replay-archive-lineage";
import type {
  ReplayForensicJsonValue,
} from "./replay-forensic-contract";
import type {
  ReplayIntegrityStatus,
} from "./replay-contract";
import type {
  ReplayArchiveAncestryNode,
  ReplayArchiveForensicMutationRecord,
  ReplayArchiveQueryResultRecord,
  ReplayArchiveTemporalDriftRecord,
} from "./replay-archive-query-contract";

export interface ReplayArchiveIndexSourceRecord {
  readonly manifest: ReplayArchiveManifest;
  readonly replay_hash: string | null;
  readonly integrity_status: ReplayIntegrityStatus | null;
  readonly deterministic_hash: string;
  readonly snapshot_canonical_hash: string | null;
  readonly lineage_depth: number | null;
  readonly forensic_payload?: ReplayForensicJsonValue | null;
  readonly generated_report?: ReplayForensicJsonValue | null;
}

export interface ReplayArchiveIndexEntry {
  readonly canonical_key: string;
  readonly archive_id: string;
  readonly game_id: string;
  readonly replay_hash: string | null;
  readonly parent_archive_id: string | null;
  readonly root_archive_id: string | null;
  readonly created_at: string;
  readonly revision_number: number;
  readonly manifest: ReplayArchiveManifest;
  readonly result_record: ReplayArchiveQueryResultRecord;
}

export interface ReplayArchiveLineageIndex {
  readonly nodes: readonly ReplayArchiveLineageNode[];
  readonly nodes_by_archive_id: ReadonlyMap<string, ReplayArchiveLineageNode>;
  readonly children_by_parent_archive_id: ReadonlyMap<string, readonly ReplayArchiveLineageNode[]>;
  readonly root_archive_ids: readonly string[];
}

export interface ReplayArchiveDriftIndex {
  readonly records: readonly ReplayArchiveTemporalDriftRecord[];
  readonly by_pair_key: ReadonlyMap<string, ReplayArchiveTemporalDriftRecord>;
  readonly by_baseline_archive_id: ReadonlyMap<string, readonly ReplayArchiveTemporalDriftRecord[]>;
  readonly by_comparison_archive_id: ReadonlyMap<string, readonly ReplayArchiveTemporalDriftRecord[]>;
}

export interface ReplayArchiveMutationIndex {
  readonly records: readonly ReplayArchiveForensicMutationRecord[];
  readonly by_archive_id: ReadonlyMap<string, readonly ReplayArchiveForensicMutationRecord[]>;
  readonly by_replay_hash: ReadonlyMap<string, readonly ReplayArchiveForensicMutationRecord[]>;
  readonly by_category: ReadonlyMap<string, readonly ReplayArchiveForensicMutationRecord[]>;
}

export interface ReplayArchiveLookupMaps {
  readonly by_archive_id: ReadonlyMap<string, ReplayArchiveIndexEntry>;
  readonly by_game_id: ReadonlyMap<string, readonly ReplayArchiveIndexEntry[]>;
  readonly by_replay_hash: ReadonlyMap<string, readonly ReplayArchiveIndexEntry[]>;
  readonly by_root_archive_id: ReadonlyMap<string, readonly ReplayArchiveIndexEntry[]>;
  readonly by_parent_archive_id: ReadonlyMap<string, readonly ReplayArchiveIndexEntry[]>;
}

export interface ReplayArchiveSearchIndex {
  readonly entries: readonly ReplayArchiveIndexEntry[];
  readonly lookups: ReplayArchiveLookupMaps;
  readonly lineage: ReplayArchiveLineageIndex;
  readonly drift: ReplayArchiveDriftIndex;
  readonly mutations: ReplayArchiveMutationIndex;
}

export interface ReplayArchiveSearchIndexInput {
  readonly records: readonly ReplayArchiveIndexSourceRecord[];
  readonly lineage_nodes?: readonly ReplayArchiveLineageNode[];
  readonly drift_records?: readonly ReplayArchiveTemporalDriftRecord[];
  readonly mutation_records?: readonly ReplayArchiveForensicMutationRecord[];
}

export function stableReplayArchiveIndexStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableReplayArchiveIndexStringify(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `"${key}":${stableReplayArchiveIndexStringify(item)}`);

    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

export function createReplayArchiveCanonicalIndexKey(
  parts: readonly (string | number | boolean | null | undefined)[],
): string {
  return parts
    .map((part) => {
      if (part === null) {
        return "null";
      }

      if (part === undefined) {
        return "undefined";
      }

      return String(part);
    })
    .join("|");
}

export function compareReplayArchiveTimestamps(
  left: string,
  right: string,
): number {
  return left.localeCompare(right);
}

export function compareReplayArchiveIndexEntries(
  left: ReplayArchiveIndexEntry,
  right: ReplayArchiveIndexEntry,
): number {
  return (
    compareReplayArchiveTimestamps(left.created_at, right.created_at) ||
    left.archive_id.localeCompare(right.archive_id) ||
    left.canonical_key.localeCompare(right.canonical_key)
  );
}

export function compareReplayArchiveLineageNodes(
  left: ReplayArchiveLineageNode,
  right: ReplayArchiveLineageNode,
): number {
  return (
    compareReplayArchiveTimestamps(left.created_at, right.created_at) ||
    left.archive_id.localeCompare(right.archive_id) ||
    left.bundle_hash.localeCompare(right.bundle_hash)
  );
}

export function compareReplayArchiveDriftRecords(
  left: ReplayArchiveTemporalDriftRecord,
  right: ReplayArchiveTemporalDriftRecord,
): number {
  return (
    compareReplayArchiveTimestamps(left.observed_at, right.observed_at) ||
    left.baseline_archive_id.localeCompare(right.baseline_archive_id) ||
    left.comparison_archive_id.localeCompare(right.comparison_archive_id) ||
    left.deterministic_hash.localeCompare(right.deterministic_hash)
  );
}

export function compareReplayArchiveMutationRecords(
  left: ReplayArchiveForensicMutationRecord,
  right: ReplayArchiveForensicMutationRecord,
): number {
  return (
    compareReplayArchiveTimestamps(left.changed_at, right.changed_at) ||
    left.archive_id.localeCompare(right.archive_id) ||
    left.entity.localeCompare(right.entity) ||
    left.path.localeCompare(right.path) ||
    left.deterministic_hash.localeCompare(right.deterministic_hash)
  );
}

export function buildReplayArchiveIndexEntries(
  records: readonly ReplayArchiveIndexSourceRecord[],
): readonly ReplayArchiveIndexEntry[] {
  return records
    .map((record): ReplayArchiveIndexEntry => {
      const parentArchiveId = record.manifest.parent_archive_id ?? null;
      const rootArchiveId = record.manifest.root_archive_id ?? null;
      const canonicalKey = createReplayArchiveCanonicalIndexKey([
        "archive",
        record.manifest.archive_id,
        record.replay_hash,
        record.manifest.created_at,
        record.manifest.revision_number,
      ]);

      return {
        canonical_key: canonicalKey,
        archive_id: record.manifest.archive_id,
        game_id: record.manifest.game_id,
        replay_hash: record.replay_hash,
        parent_archive_id: parentArchiveId,
        root_archive_id: rootArchiveId,
        created_at: record.manifest.created_at,
        revision_number: record.manifest.revision_number,
        manifest: record.manifest,
        result_record: {
          manifest: record.manifest,
          replay_hash: record.replay_hash,
          integrity_status: record.integrity_status,
          deterministic_hash: record.deterministic_hash,
          snapshot_canonical_hash: record.snapshot_canonical_hash,
          lineage_depth: record.lineage_depth,
          forensic_payload: record.forensic_payload ?? null,
          generated_report: record.generated_report ?? null,
        },
      };
    })
    .sort(compareReplayArchiveIndexEntries);
}

export function buildReplayArchiveLookupMaps(
  entries: readonly ReplayArchiveIndexEntry[],
): ReplayArchiveLookupMaps {
  const byArchiveId = new Map<string, ReplayArchiveIndexEntry>();
  const byGameId = new Map<string, ReplayArchiveIndexEntry[]>();
  const byReplayHash = new Map<string, ReplayArchiveIndexEntry[]>();
  const byRootArchiveId = new Map<string, ReplayArchiveIndexEntry[]>();
  const byParentArchiveId = new Map<string, ReplayArchiveIndexEntry[]>();

  for (const entry of entries) {
    byArchiveId.set(entry.archive_id, entry);
    appendIndexValue(byGameId, entry.game_id, entry);

    if (entry.replay_hash) {
      appendIndexValue(byReplayHash, entry.replay_hash, entry);
    }

    if (entry.root_archive_id) {
      appendIndexValue(byRootArchiveId, entry.root_archive_id, entry);
    }

    if (entry.parent_archive_id) {
      appendIndexValue(byParentArchiveId, entry.parent_archive_id, entry);
    }
  }

  return {
    by_archive_id: byArchiveId,
    by_game_id: freezeIndexMapValues(byGameId, compareReplayArchiveIndexEntries),
    by_replay_hash: freezeIndexMapValues(byReplayHash, compareReplayArchiveIndexEntries),
    by_root_archive_id: freezeIndexMapValues(byRootArchiveId, compareReplayArchiveIndexEntries),
    by_parent_archive_id: freezeIndexMapValues(byParentArchiveId, compareReplayArchiveIndexEntries),
  };
}

export function buildReplayArchiveLineageIndex(
  entries: readonly ReplayArchiveIndexEntry[],
  lineageNodes: readonly ReplayArchiveLineageNode[] = [],
): ReplayArchiveLineageIndex {
  const explicitNodeIds = new Set(lineageNodes.map((node) => node.archive_id));
  const generatedNodes = entries
    .filter((entry) => !explicitNodeIds.has(entry.archive_id))
    .map((entry): ReplayArchiveLineageNode => ({
      archive_id: entry.archive_id,
      parent_archive_id: entry.parent_archive_id,
      created_at: entry.created_at,
      manifest_hash: entry.manifest.export_hash,
      bundle_hash: entry.manifest.bundle_hash,
    }));

  const nodes = [...lineageNodes, ...generatedNodes]
    .slice()
    .sort(compareReplayArchiveLineageNodes);
  const nodesByArchiveId = new Map<string, ReplayArchiveLineageNode>();
  const childrenByParentArchiveId = new Map<string, ReplayArchiveLineageNode[]>();

  for (const node of nodes) {
    nodesByArchiveId.set(node.archive_id, node);

    if (node.parent_archive_id) {
      appendIndexValue(childrenByParentArchiveId, node.parent_archive_id, node);
    }
  }

  const rootArchiveIds = nodes
    .filter((node) => !node.parent_archive_id)
    .map((node) => node.archive_id)
    .sort((left, right) => left.localeCompare(right));

  return {
    nodes,
    nodes_by_archive_id: nodesByArchiveId,
    children_by_parent_archive_id: freezeIndexMapValues(
      childrenByParentArchiveId,
      compareReplayArchiveLineageNodes,
    ),
    root_archive_ids: rootArchiveIds,
  };
}

export function buildReplayArchiveDriftIndex(
  records: readonly ReplayArchiveTemporalDriftRecord[] = [],
): ReplayArchiveDriftIndex {
  const sortedRecords = records.slice().sort(compareReplayArchiveDriftRecords);
  const byPairKey = new Map<string, ReplayArchiveTemporalDriftRecord>();
  const byBaselineArchiveId = new Map<string, ReplayArchiveTemporalDriftRecord[]>();
  const byComparisonArchiveId = new Map<string, ReplayArchiveTemporalDriftRecord[]>();

  for (const record of sortedRecords) {
    byPairKey.set(
      createReplayArchiveCanonicalIndexKey([
        record.baseline_archive_id,
        record.comparison_archive_id,
        record.observed_at,
      ]),
      record,
    );
    appendIndexValue(byBaselineArchiveId, record.baseline_archive_id, record);
    appendIndexValue(byComparisonArchiveId, record.comparison_archive_id, record);
  }

  return {
    records: sortedRecords,
    by_pair_key: byPairKey,
    by_baseline_archive_id: freezeIndexMapValues(
      byBaselineArchiveId,
      compareReplayArchiveDriftRecords,
    ),
    by_comparison_archive_id: freezeIndexMapValues(
      byComparisonArchiveId,
      compareReplayArchiveDriftRecords,
    ),
  };
}

export function buildReplayArchiveMutationIndex(
  records: readonly ReplayArchiveForensicMutationRecord[] = [],
): ReplayArchiveMutationIndex {
  const sortedRecords = records.slice().sort(compareReplayArchiveMutationRecords);
  const byArchiveId = new Map<string, ReplayArchiveForensicMutationRecord[]>();
  const byReplayHash = new Map<string, ReplayArchiveForensicMutationRecord[]>();
  const byCategory = new Map<string, ReplayArchiveForensicMutationRecord[]>();

  for (const record of sortedRecords) {
    appendIndexValue(byArchiveId, record.archive_id, record);
    appendIndexValue(byCategory, record.category, record);

    if (record.replay_hash) {
      appendIndexValue(byReplayHash, record.replay_hash, record);
    }
  }

  return {
    records: sortedRecords,
    by_archive_id: freezeIndexMapValues(byArchiveId, compareReplayArchiveMutationRecords),
    by_replay_hash: freezeIndexMapValues(byReplayHash, compareReplayArchiveMutationRecords),
    by_category: freezeIndexMapValues(byCategory, compareReplayArchiveMutationRecords),
  };
}

export function buildReplayArchiveSearchIndex(
  input: ReplayArchiveSearchIndexInput,
): ReplayArchiveSearchIndex {
  const entries = buildReplayArchiveIndexEntries(input.records);

  return {
    entries,
    lookups: buildReplayArchiveLookupMaps(entries),
    lineage: buildReplayArchiveLineageIndex(entries, input.lineage_nodes ?? []),
    drift: buildReplayArchiveDriftIndex(input.drift_records ?? []),
    mutations: buildReplayArchiveMutationIndex(input.mutation_records ?? []),
  };
}

export function buildReplayArchiveAncestryIndexNode(
  entry: ReplayArchiveIndexEntry,
  depthFromRoot: number,
  depthFromTarget: number,
): ReplayArchiveAncestryNode {
  return {
    archive_id: entry.archive_id,
    parent_archive_id: entry.parent_archive_id,
    root_archive_id: entry.root_archive_id,
    revision_number: entry.revision_number,
    depth_from_root: depthFromRoot,
    depth_from_target: depthFromTarget,
    created_at: entry.created_at,
    manifest: entry.manifest,
    deterministic_hash: createReplayArchiveCanonicalIndexKey([
      "ancestry",
      entry.archive_id,
      depthFromRoot,
      depthFromTarget,
      entry.result_record.deterministic_hash,
    ]),
  };
}

function appendIndexValue<TValue>(
  map: Map<string, TValue[]>,
  key: string,
  value: TValue,
): void {
  const existing = map.get(key) ?? [];
  map.set(key, [...existing, value]);
}

function freezeIndexMapValues<TValue>(
  map: Map<string, TValue[]>,
  compare: (left: TValue, right: TValue) => number,
): ReadonlyMap<string, readonly TValue[]> {
  const frozen = new Map<string, readonly TValue[]>();
  const keys = Array.from(map.keys()).sort((left, right) =>
    left.localeCompare(right),
  );

  for (const key of keys) {
    frozen.set(key, [...(map.get(key) ?? [])].sort(compare));
  }

  return frozen;
}
