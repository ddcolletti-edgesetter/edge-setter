export interface ReplayConvergenceHistoryRow {
  id: string;
  replay_id: string;
  generated_at: string;
  convergence_score: number;
  instability_score: number;
  stability_index: number;
  replay_count: number;
  convergence_hash: string;
}

const replayConvergenceHistoryRows:
  ReplayConvergenceHistoryRow[] = [];

export function insertReplayConvergenceHistoryRow(
  row: ReplayConvergenceHistoryRow,
): ReplayConvergenceHistoryRow {
  replayConvergenceHistoryRows.push(row);
  return row;
}

export function listReplayConvergenceHistoryRows():
  ReplayConvergenceHistoryRow[] {
  return [...replayConvergenceHistoryRows];
}

export function listReplayConvergenceHistoryByReplayId(
  replayId: string,
): ReplayConvergenceHistoryRow[] {
  return replayConvergenceHistoryRows.filter(
    (row) => row.replay_id === replayId,
  );
}

export function clearReplayConvergenceHistoryRows(): void {
  replayConvergenceHistoryRows.length = 0;
}