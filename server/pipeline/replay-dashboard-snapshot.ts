import type {
  ReplayIntelligenceSnapshotContract,
} from "./replay-intelligence-contract";

export interface ReplayDashboardSnapshotRecord {
  snapshot_id: string;
  snapshot_kind: string;
  scope_id: string;
  generated_at: string;
  deterministic_hash: string;
  payload: ReplayIntelligenceSnapshotContract;
}

const replayDashboardSnapshots =
  new Map<string, ReplayDashboardSnapshotRecord>();

export function persistReplayDashboardSnapshot(
  snapshot: ReplayIntelligenceSnapshotContract,
): ReplayDashboardSnapshotRecord {
  const record: ReplayDashboardSnapshotRecord = {
    snapshot_id: snapshot.snapshot_id,
    snapshot_kind: snapshot.snapshot_kind,
    scope_id: snapshot.scope_id,
    generated_at: snapshot.generated_at,
    deterministic_hash: snapshot.deterministic_hash,
    payload: snapshot,
  };

  replayDashboardSnapshots.set(snapshot.snapshot_id, record);

  return record;
}

export function getReplayDashboardSnapshot(
  snapshotId: string,
): ReplayDashboardSnapshotRecord | null {
  return replayDashboardSnapshots.get(snapshotId) ?? null;
}

export function listReplayDashboardSnapshots():
  ReplayDashboardSnapshotRecord[] {
  return Array.from(replayDashboardSnapshots.values());
}

export function clearReplayDashboardSnapshots(): void {
  replayDashboardSnapshots.clear();
}