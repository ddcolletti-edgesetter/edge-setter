export interface ReplayAnalyticsHistoryRow {
  id: string;
  replay_id: string;
  reconstruction_id: string;
  generated_at: string;
  convergence_score: number;
  instability_score: number;
  analytics_hash: string;
}

const replayAnalyticsHistoryRows: ReplayAnalyticsHistoryRow[] = [];

export function insertReplayAnalyticsHistoryRow(
  row: ReplayAnalyticsHistoryRow,
): ReplayAnalyticsHistoryRow {
  replayAnalyticsHistoryRows.push(row);
  return row;
}

export function listReplayAnalyticsHistoryRows(): ReplayAnalyticsHistoryRow[] {
  return [...replayAnalyticsHistoryRows];
}

export function listReplayAnalyticsHistoryByReplayId(
  replayId: string,
): ReplayAnalyticsHistoryRow[] {
  return replayAnalyticsHistoryRows.filter(
    (row) => row.replay_id === replayId,
  );
}

export function getLatestReplayAnalyticsHistoryByReplayId(
  replayId: string,
): ReplayAnalyticsHistoryRow | undefined {
  return listReplayAnalyticsHistoryByReplayId(replayId).sort((a, b) =>
    b.generated_at.localeCompare(a.generated_at),
  )[0];
}

export function clearReplayAnalyticsHistoryRows(): void {
  replayAnalyticsHistoryRows.length = 0;
}