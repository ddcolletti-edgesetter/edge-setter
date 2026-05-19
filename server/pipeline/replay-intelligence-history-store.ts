export interface ReplayIntelligenceHistoryLineageRow {
  replay_hash: string;
  parent_replay_hash: string | null;
  generated_at: string;
}

const replayIntelligenceHistoryLineageRows:
  ReplayIntelligenceHistoryLineageRow[] = [];

export function insertReplayIntelligenceHistoryLineageRow(
  row: ReplayIntelligenceHistoryLineageRow,
): ReplayIntelligenceHistoryLineageRow {
  replayIntelligenceHistoryLineageRows.push(row);
  return row;
}

export function listReplayIntelligenceHistoryLineageRows():
  ReplayIntelligenceHistoryLineageRow[] {
  return [...replayIntelligenceHistoryLineageRows];
}

export function listReplayIntelligenceHistoryLineageChildren(
  parentReplayHash: string,
): ReplayIntelligenceHistoryLineageRow[] {
  return replayIntelligenceHistoryLineageRows.filter(
    (row) => row.parent_replay_hash === parentReplayHash,
  );
}

export function getReplayIntelligenceHistoryLineageRow(
  replayHash: string,
): ReplayIntelligenceHistoryLineageRow | null {
  return replayIntelligenceHistoryLineageRows.find(
    (row) => row.replay_hash === replayHash,
  ) ?? null;
}

export function clearReplayIntelligenceHistoryLineageRows(): void {
  replayIntelligenceHistoryLineageRows.length = 0;
}
