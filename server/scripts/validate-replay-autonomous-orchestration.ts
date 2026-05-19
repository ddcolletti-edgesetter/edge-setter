import {
  buildReplayAutonomousOrchestrationRun,
} from "../pipeline/replay-autonomous-orchestration";
import type {
  ReplayAutonomousOrchestrationInput,
} from "../pipeline/replay-autonomous-orchestration-contract";

const FIXED_GENERATED_AT = "2026-05-19T12:00:00.000Z";

const input: ReplayAutonomousOrchestrationInput = {
  clock: {
    generated_at: FIXED_GENERATED_AT,
  },
  consensus_threshold: 0.82,
  max_recovery_attempts: 2,
  phases: [
    "consensus",
    "target_selection",
    "recovery",
    "convergence_analysis",
    "reconstruction",
  ],
  targets: [
    {
      replay_hash: "autonomous-replay-watch",
      priority: 20,
      anomaly_score: 0.68,
      drift_score: 0.4,
      confidence_score: 0.87,
      lineage_depth: 1,
      target_metadata: {
        league: "nba",
        fixture: true,
      },
    },
    {
      replay_hash: "autonomous-replay-critical",
      priority: 30,
      anomaly_score: 0.94,
      drift_score: 0.8,
      confidence_score: 0.91,
      lineage_depth: 5,
      target_metadata: {
        league: "nfl",
        fixture: true,
      },
    },
    {
      replay_hash: "autonomous-replay-stable",
      priority: 10,
      anomaly_score: 0.1,
      drift_score: 0.12,
      confidence_score: 0.95,
      lineage_depth: 0,
      requested_phases: [
        "target_selection",
        "convergence_analysis",
        "consensus",
      ],
      target_metadata: {
        league: "mlb",
        fixture: true,
      },
    },
  ],
};

const run = buildReplayAutonomousOrchestrationRun(input);
const runAgain = buildReplayAutonomousOrchestrationRun({
  ...input,
  phases: [...(input.phases ?? [])].reverse(),
  targets: [...input.targets].reverse(),
});

assertEqual(run.generated_at, FIXED_GENERATED_AT, "run generated_at must come from input clock");
assertEqual(run.run_hash, runAgain.run_hash, "run hash must be deterministic across input ordering");
assertEqual(run.run_id, `replay-autonomous-orchestration:${run.run_hash}`, "run id must derive from run hash");
assertEqual(run.deterministic_hash, runAgain.deterministic_hash, "deterministic hash must be stable");
assertEqual(run.targets.map((target) => target.replay_hash).join(","), "autonomous-replay-critical,autonomous-replay-watch,autonomous-replay-stable", "targets must be priority sorted");
assertEqual(run.phases.map((phase) => phase.phase).join(","), "target_selection,reconstruction,convergence_analysis,recovery,consensus", "phases must use canonical order");
assertEqual(run.summary.target_count, 3, "summary target count mismatch");
assertEqual(run.summary.phase_count, 5, "summary phase count mismatch");
assertEqual(run.summary.agent_count, 13, "summary agent count mismatch");
assertEqual(run.recovery_directives.length, 3, "recovery directive count mismatch");
assertEqual(run.summary.recovery_directive_count, 2, "active recovery directive count mismatch");
assertEqual(run.summary.blocked_count, 4, "blocked agent count mismatch");
assertEqual(run.summary.recovered_count, 2, "recovered agent count mismatch");
assertEqual(run.summary.completed_count, 7, "completed agent count mismatch");
assertEqual(run.consensus.ready_count, 8, "consensus ready count mismatch");
assertEqual(run.consensus.consensus_ready, false, "consensus should not be ready with critical blocked target");
assertEqual(run.summary.consensus_ready, false, "summary consensus readiness mismatch");

const criticalDirective = assertExists(
  run.recovery_directives.find((directive) =>
    directive.replay_hash === "autonomous-replay-critical",
  ),
  "critical replay directive missing",
);
assertEqual(criticalDirective.directive, "quarantine", "critical replay directive mismatch");

const watchDirective = assertExists(
  run.recovery_directives.find((directive) =>
    directive.replay_hash === "autonomous-replay-watch",
  ),
  "watch replay directive missing",
);
assertEqual(watchDirective.directive, "retry", "watch replay directive mismatch");

const stableDirective = assertExists(
  run.recovery_directives.find((directive) =>
    directive.replay_hash === "autonomous-replay-stable",
  ),
  "stable replay directive missing",
);
assertEqual(stableDirective.directive, "none", "stable replay directive mismatch");

const stableAgents = run.agents.filter((agent) =>
  agent.replay_hash === "autonomous-replay-stable",
);
assertEqual(stableAgents.length, 3, "target requested phases should limit stable replay agents");
assertEqual(
  stableAgents.map((agent) => agent.phase).sort().join(","),
  "consensus,convergence_analysis,target_selection",
  "stable replay requested phase set mismatch",
);

assertEqual(Object.isFrozen(run), true, "run output must be immutable");
assertEqual(Object.isFrozen(run.targets), true, "targets output must be immutable");
assertEqual(Object.isFrozen(run.agents), true, "agents output must be immutable");
assertEqual(Object.isFrozen(run.summary), true, "summary output must be immutable");

console.log("Replay autonomous orchestration validation passed.");
console.log(JSON.stringify({
  generated_at: run.generated_at,
  run_id: run.run_id,
  run_hash: run.run_hash,
  deterministic_hash: run.deterministic_hash,
  summary: run.summary,
  consensus: run.consensus,
  recovery_directives: run.recovery_directives.map((directive) => ({
    replay_hash: directive.replay_hash,
    directive: directive.directive,
    reason: directive.reason,
    deterministic_hash: directive.deterministic_hash,
  })),
  immutable_outputs: {
    run: Object.isFrozen(run),
    targets: Object.isFrozen(run.targets),
    agents: Object.isFrozen(run.agents),
    summary: Object.isFrozen(run.summary),
  },
}, null, 2));

function assertExists<T>(value: T | null | undefined, message: string): T {
  if (value == null) {
    throw new Error(message);
  }
  return value;
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}
