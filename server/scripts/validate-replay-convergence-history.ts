import {
  buildReplayConvergenceHistorySummary,
} from "../pipeline/replay-convergence-history";

import {
  clearReplayConvergenceHistoryRows,
  insertReplayConvergenceHistoryRow,
  listReplayConvergenceHistoryByReplayId,
  listReplayConvergenceHistoryRows,
} from "../pipeline/replay-convergence-history-store";

function main() {
  clearReplayConvergenceHistoryRows();

  insertReplayConvergenceHistoryRow({
    id: "conv_001",
    replay_id: "replay_001",
    generated_at: "2026-05-18T00:00:00.000Z",
    convergence_score: 91,
    instability_score: 1,
    stability_index: 90,
    replay_count: 4,
    convergence_hash: "hash_001",
  });

  insertReplayConvergenceHistoryRow({
    id: "conv_002",
    replay_id: "replay_001",
    generated_at: "2026-05-18T01:00:00.000Z",
    convergence_score: 95,
    instability_score: 0,
    stability_index: 95,
    replay_count: 6,
    convergence_hash: "hash_002",
  });

  const rows =
    listReplayConvergenceHistoryRows();

  const replayRows =
    listReplayConvergenceHistoryByReplayId(
      "replay_001",
    );

  const summary =
    buildReplayConvergenceHistorySummary(
      "replay_001",
      replayRows.map((row) => ({
        replay_id: row.replay_id,
        generated_at: row.generated_at,
        convergence_score:
          row.convergence_score,
        instability_score:
          row.instability_score,
        stability_index:
          row.stability_index,
        replay_count:
          row.replay_count,
      })),
    );

  if (
    rows.length !== 2 ||
    replayRows.length !== 2 ||
    summary.total_replays !== 10
  ) {
    throw new Error(
      "Replay convergence history validation failed.",
    );
  }

  console.log(
    "Replay convergence history validation passed.",
  );

  console.log(
    JSON.stringify(
      {
        total_rows: rows.length,
        replay_rows: replayRows.length,
        total_replays:
          summary.total_replays,
        deterministic_hash:
          summary.deterministic_hash,
      },
      null,
      2,
    ),
  );
}

main();