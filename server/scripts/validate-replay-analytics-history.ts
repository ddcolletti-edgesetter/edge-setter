import {
  clearReplayAnalyticsHistoryRows,
  getLatestReplayAnalyticsHistoryByReplayId,
  insertReplayAnalyticsHistoryRow,
  listReplayAnalyticsHistoryByReplayId,
  listReplayAnalyticsHistoryRows,
} from "../pipeline/replay-analytics-history-store";

function main() {
  clearReplayAnalyticsHistoryRows();

  insertReplayAnalyticsHistoryRow({
    id: "hist_001",
    replay_id: "replay_001",
    reconstruction_id: "recon_001",
    generated_at: "2026-05-18T00:00:00.000Z",
    convergence_score: 91,
    instability_score: 1,
    analytics_hash: "hash_001",
  });

  insertReplayAnalyticsHistoryRow({
    id: "hist_002",
    replay_id: "replay_001",
    reconstruction_id: "recon_002",
    generated_at: "2026-05-18T01:00:00.000Z",
    convergence_score: 96,
    instability_score: 0,
    analytics_hash: "hash_002",
  });

  const allRows = listReplayAnalyticsHistoryRows();
  const replayRows =
    listReplayAnalyticsHistoryByReplayId("replay_001");
  const latest =
    getLatestReplayAnalyticsHistoryByReplayId("replay_001");

  if (
    allRows.length !== 2 ||
    replayRows.length !== 2 ||
    latest?.reconstruction_id !== "recon_002"
  ) {
    throw new Error(
      "Replay analytics history validation failed.",
    );
  }

  console.log(
    "Replay analytics history validation passed.",
  );

  console.log(
    JSON.stringify(
      {
        total_rows: allRows.length,
        replay_rows: replayRows.length,
        latest_reconstruction_id:
          latest.reconstruction_id,
      },
      null,
      2,
    ),
  );
}

main();