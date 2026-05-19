import {
  buildReplayIntelligenceAnalytics,
} from "../pipeline/replay-intelligence-analytics";

import {
  buildReplayConvergenceReport,
} from "../pipeline/replay-convergence-report";

import {
  buildReplayTraversalSummary,
} from "../pipeline/replay-traversal-intelligence";

import {
  buildReplayStateDiffSummary,
} from "../pipeline/replay-state-diff";

import {
  buildReplayReconstructionHistorySummary,
} from "../pipeline/replay-reconstruction-history";

import {
  reduceReplayConvergenceAnalytics,
} from "../pipeline/replay-convergence-reducer";

import {
  buildReplayConvergenceExportBundle,
} from "../pipeline/replay-convergence-export";

function main() {
  const analytics = buildReplayIntelligenceAnalytics(
    {
      reconstruction_id: "recon_001",
      generated_at: "2026-05-18T00:00:00.000Z",
      traversal_depth: 4,
    },
    [
      {
        key: "timeline_integrity",
        value: 98,
        weight: 1,
        status: "stable",
      },
      {
        key: "signal_consistency",
        value: 87,
        weight: 1,
        status: "warning",
      },
    ],
  );

  const convergenceReport =
    buildReplayConvergenceReport(analytics);

  const traversalSummary =
    buildReplayTraversalSummary("root_replay", [
      {
        replay_id: "root_replay",
        depth: 0,
        children: ["child_replay"],
      },
      {
        replay_id: "child_replay",
        parent_replay_id: "root_replay",
        depth: 1,
        children: [],
      },
    ]);

  const diffSummary = buildReplayStateDiffSummary(
    "replay_001",
    [
      {
        field: "status",
        previous_value: "pending",
        current_value: "settled",
        changed: true,
      },
    ],
  );

  const reconstructionHistory =
    buildReplayReconstructionHistorySummary(
      "replay_001",
      [
        {
          reconstruction_id: "recon_001",
          replay_id: "replay_001",
          generated_at: "2026-05-18T00:00:00.000Z",
          convergence_score: 92,
          instability_score: 1,
          reconstruction_hash: "abc123",
        },
      ],
    );

  const reducer =
    reduceReplayConvergenceAnalytics([
      {
        convergence_score: 92,
        instability_score: 1,
        replay_count: 4,
      },
    ]);

  const exportBundle =
    buildReplayConvergenceExportBundle([
      convergenceReport,
    ]);

  if (
    analytics.metrics.length !== 2 ||
    traversalSummary.total_nodes !== 2 ||
    diffSummary.changed_fields !== 1 ||
    reconstructionHistory.total_reconstructions !== 1 ||
    reducer.total_replays !== 4 ||
    exportBundle.report_count !== 1
  ) {
    throw new Error(
      "Replay intelligence analytics validation failed.",
    );
  }

  console.log(
    "Replay intelligence analytics validation passed.",
  );

  console.log(
    JSON.stringify(
      {
        analytics_hash:
          analytics.deterministic_hash,
        traversal_hash:
          traversalSummary.traversal_hash,
        diff_hash:
          diffSummary.deterministic_hash,
        reconstruction_hash:
          reconstructionHistory.deterministic_hash,
        export_hash:
          exportBundle.deterministic_hash,
      },
      null,
      2,
    ),
  );
}

main();