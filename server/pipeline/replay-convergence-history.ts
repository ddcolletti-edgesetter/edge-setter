import crypto from "crypto";

export interface ReplayConvergenceHistoryRecord {
  replay_id: string;
  generated_at: string;
  convergence_score: number;
  instability_score: number;
  stability_index: number;
  replay_count: number;
}

export interface ReplayConvergenceHistorySummary {
  replay_id: string;
  generated_at: string;
  average_convergence_score: number;
  average_instability_score: number;
  average_stability_index: number;
  total_replays: number;
  deterministic_hash: string;
}

export function buildReplayConvergenceHistorySummary(
  replayId: string,
  records: ReplayConvergenceHistoryRecord[],
  generatedAt = new Date().toISOString(),
): ReplayConvergenceHistorySummary {
  const totalReplays = records.reduce((sum, record) => {
    return sum + record.replay_count;
  }, 0);

  const averageConvergenceScore =
    records.length === 0
      ? 0
      : records.reduce((sum, record) => {
          return sum + record.convergence_score;
        }, 0) / records.length;

  const averageInstabilityScore =
    records.length === 0
      ? 0
      : records.reduce((sum, record) => {
          return sum + record.instability_score;
        }, 0) / records.length;

  const averageStabilityIndex =
    records.length === 0
      ? 0
      : records.reduce((sum, record) => {
          return sum + record.stability_index;
        }, 0) / records.length;

  const deterministicHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        replayId,
        generatedAt,
        records,
      }),
    )
    .digest("hex");

  return {
    replay_id: replayId,
    generated_at: generatedAt,
    average_convergence_score: averageConvergenceScore,
    average_instability_score: averageInstabilityScore,
    average_stability_index: averageStabilityIndex,
    total_replays: totalReplays,
    deterministic_hash: deterministicHash,
  };
}
