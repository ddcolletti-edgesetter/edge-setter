import crypto from "node:crypto";

import type {
  ReplayAutonomousAgentLifecycleState,
  ReplayAutonomousAgentState,
  ReplayAutonomousConsensusState,
  ReplayAutonomousNormalizedTarget,
  ReplayAutonomousOrchestrationInput,
  ReplayAutonomousOrchestrationPhase,
  ReplayAutonomousOrchestrationRun,
  ReplayAutonomousOrchestrationSummary,
  ReplayAutonomousPhaseState,
  ReplayAutonomousRecoveryDirective,
  ReplayAutonomousRecoveryDirectiveKind,
  ReplayAutonomousReplayTarget,
} from "./replay-autonomous-orchestration-contract";

export const REPLAY_AUTONOMOUS_ORCHESTRATION_PHASES:
  readonly ReplayAutonomousOrchestrationPhase[] = [
    "target_selection",
    "reconstruction",
    "convergence_analysis",
    "recovery",
    "consensus",
  ];

export function buildReplayAutonomousOrchestrationRun(
  input: ReplayAutonomousOrchestrationInput,
): ReplayAutonomousOrchestrationRun {
  const generatedAt = input.clock.generated_at;
  const phases = normalizePhases(input.phases);
  const targets = normalizeTargets(input.targets);
  const recoveryDirectives = targets.map((target) =>
    buildRecoveryDirective(target, input.max_recovery_attempts),
  );
  const agents = buildAgentStates(
    targets,
    phases,
    recoveryDirectives,
    generatedAt,
    input.consensus_threshold,
  );
  const phaseStates = buildPhaseStates(phases, agents);
  const consensus = buildConsensusState(
    agents,
    input.consensus_threshold,
  );
  const runSeed = {
    kind: "replay_autonomous_orchestration_run",
    generated_at: generatedAt,
    target_hashes: targets.map((target) => target.target_hash),
    phase_hashes: phaseStates.map((phase) => phase.phase_hash),
    agent_hashes: agents.map((agent) => agent.deterministic_hash),
    recovery_hashes: recoveryDirectives.map((directive) => directive.deterministic_hash),
    consensus_hash: consensus.consensus_hash,
  };
  const runHash = computeReplayAutonomousOrchestrationHash(runSeed);
  const runId = `replay-autonomous-orchestration:${runHash}`;
  const summary = buildReplayAutonomousOrchestrationSummary({
    run_id: runId,
    run_hash: runHash,
    generated_at: generatedAt,
    targets,
    phases: phaseStates,
    agents,
    recovery_directives: recoveryDirectives,
    consensus,
  });
  const payload = {
    run_id: runId,
    run_hash: runHash,
    generated_at: generatedAt,
    targets,
    phases: phaseStates,
    agents,
    recovery_directives: recoveryDirectives,
    consensus,
    summary,
  };

  return deepFreeze({
    ...payload,
    deterministic_hash: computeReplayAutonomousOrchestrationHash(payload),
  });
}

export function buildReplayAutonomousOrchestrationSummary(
  input: {
    readonly run_id: string;
    readonly run_hash: string;
    readonly generated_at: string;
    readonly targets: readonly ReplayAutonomousNormalizedTarget[];
    readonly phases: readonly ReplayAutonomousPhaseState[];
    readonly agents: readonly ReplayAutonomousAgentState[];
    readonly recovery_directives: readonly ReplayAutonomousRecoveryDirective[];
    readonly consensus: ReplayAutonomousConsensusState;
  },
): ReplayAutonomousOrchestrationSummary {
  const payload = {
    run_id: input.run_id,
    run_hash: input.run_hash,
    generated_at: input.generated_at,
    target_count: input.targets.length,
    phase_count: input.phases.length,
    agent_count: input.agents.length,
    completed_count: input.agents.filter((agent) =>
      agent.lifecycle_state === "completed",
    ).length,
    recovered_count: input.agents.filter((agent) =>
      agent.lifecycle_state === "recovered",
    ).length,
    blocked_count: input.agents.filter((agent) =>
      agent.lifecycle_state === "blocked",
    ).length,
    recovery_directive_count: input.recovery_directives.filter((directive) =>
      directive.directive !== "none",
    ).length,
    consensus_ready_count: input.consensus.ready_count,
    consensus_ready: input.consensus.consensus_ready,
    target_hashes: input.targets.map((target) => target.target_hash),
    phase_hashes: input.phases.map((phase) => phase.phase_hash),
  };

  return deepFreeze({
    ...payload,
    summary_hash: computeReplayAutonomousOrchestrationHash(payload),
  });
}

function normalizeTargets(
  targets: readonly ReplayAutonomousReplayTarget[],
): readonly ReplayAutonomousNormalizedTarget[] {
  return deepFreeze(targets
    .map((target) => {
      const normalized = {
        replay_hash: target.replay_hash,
        priority: target.priority,
        anomaly_score: target.anomaly_score,
        drift_score: target.drift_score,
        confidence_score: target.confidence_score,
        lineage_depth: target.lineage_depth,
        requested_phases: target.requested_phases
          ? normalizePhases(target.requested_phases)
          : undefined,
        target_metadata: target.target_metadata
          ? sortRecord(target.target_metadata)
          : undefined,
      };

      return {
        ...normalized,
        target_hash: computeReplayAutonomousOrchestrationHash(normalized),
      };
    })
    .sort((left, right) =>
      right.priority - left.priority ||
      left.replay_hash.localeCompare(right.replay_hash) ||
      left.target_hash.localeCompare(right.target_hash),
    ));
}

function normalizePhases(
  phases: readonly ReplayAutonomousOrchestrationPhase[] | undefined,
): readonly ReplayAutonomousOrchestrationPhase[] {
  const requested = new Set(phases ?? REPLAY_AUTONOMOUS_ORCHESTRATION_PHASES);
  return REPLAY_AUTONOMOUS_ORCHESTRATION_PHASES.filter((phase) =>
    requested.has(phase),
  );
}

function buildRecoveryDirective(
  target: ReplayAutonomousNormalizedTarget,
  maxAttempts: number,
): ReplayAutonomousRecoveryDirective {
  const directive = classifyRecoveryDirective(target);
  const payload = {
    replay_hash: target.replay_hash,
    target_hash: target.target_hash,
    directive,
    reason: recoveryReason(directive),
    max_attempts: directive === "none" ? 0 : maxAttempts,
  };
  const deterministicHash = computeReplayAutonomousOrchestrationHash(payload);

  return deepFreeze({
    directive_id: `replay-autonomous-recovery:${deterministicHash}`,
    ...payload,
    deterministic_hash: deterministicHash,
  });
}

function buildAgentStates(
  targets: readonly ReplayAutonomousNormalizedTarget[],
  phases: readonly ReplayAutonomousOrchestrationPhase[],
  recoveryDirectives: readonly ReplayAutonomousRecoveryDirective[],
  generatedAt: string,
  consensusThreshold: number,
): readonly ReplayAutonomousAgentState[] {
  const directivesByTarget = new Map(
    recoveryDirectives.map((directive) => [directive.target_hash, directive]),
  );

  return deepFreeze(targets.flatMap((target) => {
    const targetPhases = target.requested_phases
      ? phases.filter((phase) => target.requested_phases?.includes(phase))
      : phases;
    const directive = directivesByTarget.get(target.target_hash);
    if (!directive) return [];

    return targetPhases.map((phase) =>
      buildAgentState(
        target,
        phase,
        directive,
        generatedAt,
        consensusThreshold,
      ),
    );
  }).sort((left, right) =>
    left.phase.localeCompare(right.phase) ||
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.agent_id.localeCompare(right.agent_id),
  ));
}

function buildAgentState(
  target: ReplayAutonomousNormalizedTarget,
  phase: ReplayAutonomousOrchestrationPhase,
  directive: ReplayAutonomousRecoveryDirective,
  generatedAt: string,
  consensusThreshold: number,
): ReplayAutonomousAgentState {
  const lifecycleState = classifyLifecycleState(phase, directive.directive);
  const payload = {
    replay_hash: target.replay_hash,
    target_hash: target.target_hash,
    phase,
    lifecycle_state: lifecycleState,
    recovery_directive: directive.directive,
    consensus_ready: isAgentConsensusReady(
      target,
      lifecycleState,
      consensusThreshold,
    ),
    generated_at: generatedAt,
  };
  const deterministicHash = computeReplayAutonomousOrchestrationHash(payload);

  return deepFreeze({
    agent_id: `replay-autonomous-agent:${deterministicHash}`,
    ...payload,
    deterministic_hash: deterministicHash,
  });
}

function buildPhaseStates(
  phases: readonly ReplayAutonomousOrchestrationPhase[],
  agents: readonly ReplayAutonomousAgentState[],
): readonly ReplayAutonomousPhaseState[] {
  return deepFreeze(phases.map((phase) => {
    const phaseAgents = agents.filter((agent) => agent.phase === phase);
    const payload = {
      phase,
      lifecycle_state: classifyPhaseLifecycleState(phaseAgents),
      target_count: phaseAgents.length,
      completed_count: phaseAgents.filter((agent) =>
        agent.lifecycle_state === "completed",
      ).length,
      recovered_count: phaseAgents.filter((agent) =>
        agent.lifecycle_state === "recovered",
      ).length,
      blocked_count: phaseAgents.filter((agent) =>
        agent.lifecycle_state === "blocked",
      ).length,
      consensus_ready_count: phaseAgents.filter((agent) =>
        agent.consensus_ready,
      ).length,
    };

    return {
      ...payload,
      phase_hash: computeReplayAutonomousOrchestrationHash(payload),
    };
  }));
}

function buildConsensusState(
  agents: readonly ReplayAutonomousAgentState[],
  threshold: number,
): ReplayAutonomousConsensusState {
  const readyCount = agents.filter((agent) => agent.consensus_ready).length;
  const readinessRatio = agents.length === 0 ? 0 : readyCount / agents.length;
  const payload = {
    consensus_ready: agents.length > 0 && readinessRatio >= threshold,
    threshold,
    ready_count: readyCount,
    agent_count: agents.length,
    readiness_ratio: Number(readinessRatio.toFixed(4)),
  };

  return deepFreeze({
    ...payload,
    consensus_hash: computeReplayAutonomousOrchestrationHash(payload),
  });
}

function classifyRecoveryDirective(
  target: ReplayAutonomousNormalizedTarget,
): ReplayAutonomousRecoveryDirectiveKind {
  if (target.confidence_score < 0.65) return "manual_review";
  if (target.anomaly_score >= 0.9) return "quarantine";
  if (target.drift_score >= 0.72 || target.lineage_depth >= 4) {
    return "reconstruct_from_lineage";
  }
  if (target.anomaly_score >= 0.65 || target.drift_score >= 0.55) return "retry";
  return "none";
}

function recoveryReason(
  directive: ReplayAutonomousRecoveryDirectiveKind,
): string {
  switch (directive) {
    case "manual_review":
      return "confidence_below_autonomous_threshold";
    case "quarantine":
      return "critical_anomaly_threshold_exceeded";
    case "reconstruct_from_lineage":
      return "lineage_or_drift_reconstruction_required";
    case "retry":
      return "recoverable_instability_detected";
    case "none":
      return "no_recovery_required";
  }
}

function classifyLifecycleState(
  phase: ReplayAutonomousOrchestrationPhase,
  directive: ReplayAutonomousRecoveryDirectiveKind,
): ReplayAutonomousAgentLifecycleState {
  if (phase === "target_selection") return "completed";
  if (directive === "manual_review" || directive === "quarantine") return "blocked";
  if (directive === "retry" || directive === "reconstruct_from_lineage") {
    return phase === "recovery" || phase === "consensus" ? "recovered" : "completed";
  }
  return "completed";
}

function classifyPhaseLifecycleState(
  agents: readonly ReplayAutonomousAgentState[],
): ReplayAutonomousAgentLifecycleState {
  if (agents.length === 0) return "queued";
  if (agents.some((agent) => agent.lifecycle_state === "blocked")) return "blocked";
  if (agents.some((agent) => agent.lifecycle_state === "recovered")) return "recovered";
  if (agents.every((agent) => agent.lifecycle_state === "completed")) return "completed";
  return "running";
}

function isAgentConsensusReady(
  target: ReplayAutonomousNormalizedTarget,
  lifecycleState: ReplayAutonomousAgentLifecycleState,
  consensusThreshold: number,
): boolean {
  return lifecycleState !== "blocked" &&
    target.confidence_score >= consensusThreshold &&
    target.anomaly_score < 0.9;
}

function sortRecord(
  record: Readonly<Record<string, string | number | boolean | null>>,
): Readonly<Record<string, string | number | boolean | null>> {
  return Object.keys(record)
    .sort((left, right) => left.localeCompare(right))
    .reduce<Record<string, string | number | boolean | null>>((acc, key) => {
      acc[key] = record[key] ?? null;
      return acc;
    }, {});
}

function computeReplayAutonomousOrchestrationHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableReplayAutonomousOrchestrationStringify(value))
    .digest("hex");
}

function stableReplayAutonomousOrchestrationStringify(value: unknown): string {
  return JSON.stringify(sortReplayAutonomousOrchestrationKeys(value));
}

function sortReplayAutonomousOrchestrationKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortReplayAutonomousOrchestrationKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortReplayAutonomousOrchestrationKeys(
          (value as Record<string, unknown>)[key],
        );
        return acc;
      }, {});
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    return null;
  }

  if (typeof value === "undefined") {
    return null;
  }

  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) {
      deepFreeze(item);
    }
  }

  return value;
}
