import {
  buildReplayIntelligenceAuditSummary,
} from "../pipeline/replay-intelligence-audit";

import {
  clearReplayIntelligenceAuditRows,
  insertReplayIntelligenceAuditRow,
  listReplayIntelligenceAuditRows,
  listReplayIntelligenceAuditRowsByReplayId,
} from "../pipeline/replay-intelligence-audit-store";

function main() {
  clearReplayIntelligenceAuditRows();

  insertReplayIntelligenceAuditRow({
    replay_id: "replay_001",
    generated_at: "2026-05-18T00:00:00.000Z",
    analytics_hash: "analytics_hash_001",
    convergence_hash: "convergence_hash_001",
    route_group_count: 10,
    validation_status: "passed",
  });

  insertReplayIntelligenceAuditRow({
    replay_id: "replay_001",
    generated_at: "2026-05-18T01:00:00.000Z",
    analytics_hash: "analytics_hash_002",
    convergence_hash: "convergence_hash_002",
    route_group_count: 10,
    validation_status: "warning",
  });

  const rows =
    listReplayIntelligenceAuditRows();

  const replayRows =
    listReplayIntelligenceAuditRowsByReplayId(
      "replay_001",
    );

  const summary =
    buildReplayIntelligenceAuditSummary(
      "replay_001",
      replayRows,
    );

  if (
    rows.length !== 2 ||
    replayRows.length !== 2 ||
    summary.passed_count !== 1 ||
    summary.warning_count !== 1
  ) {
    throw new Error(
      "Replay intelligence audit validation failed.",
    );
  }

  console.log(
    "Replay intelligence audit validation passed.",
  );

  console.log(
    JSON.stringify(
      {
        total_rows: rows.length,
        replay_rows: replayRows.length,
        passed_count:
          summary.passed_count,
        warning_count:
          summary.warning_count,
        deterministic_hash:
          summary.deterministic_hash,
      },
      null,
      2,
    ),
  );
}

main();