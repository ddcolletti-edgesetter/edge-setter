export interface ReplayConvergenceReducerInput {
  convergence_score: number;
  instability_score: number;
  replay_count: number;
}

export interface ReplayConvergenceReducerResult {
  average_convergence_score: number;
  average_instability_score: number;
  total_replays: number;
  stability_index: number;
}

export function reduceReplayConvergenceAnalytics(
  inputs: ReplayConvergenceReducerInput[],
): ReplayConvergenceReducerResult {
  if (inputs.length === 0) {
    return {
      average_convergence_score: 0,
      average_instability_score: 0,
      total_replays: 0,
      stability_index: 0,
    };
  }

  const totalConvergenceScore = inputs.reduce((sum, input) => {
    return sum + input.convergence_score;
  }, 0);

  const totalInstabilityScore = inputs.reduce((sum, input) => {
    return sum + input.instability_score;
  }, 0);

  const totalReplays = inputs.reduce((sum, input) => {
    return sum + input.replay_count;
  }, 0);

  const averageConvergenceScore =
    totalConvergenceScore / inputs.length;

  const averageInstabilityScore =
    totalInstabilityScore / inputs.length;

  const stabilityIndex =
    averageConvergenceScore - averageInstabilityScore;

  return {
    average_convergence_score: averageConvergenceScore,
    average_instability_score: averageInstabilityScore,
    total_replays: totalReplays,
    stability_index: stabilityIndex,
  };
}