import crypto from "crypto";

export interface ReplayConvergenceTimelinePoint {
  generated_at: string;
  convergence_score: number;
  instability_score: number;
  stability_index: number;
}

export interface ReplayConvergenceTimeline {
  replay_id: string;
  generated_at: string;
  points: ReplayConvergenceTimelinePoint[];
  deterministic_hash: string;
}

export function buildReplayConvergenceTimeline(
  replayId: string,
  points: ReplayConvergenceTimelinePoint[],
): ReplayConvergenceTimeline {
  const generatedAt = new Date().toISOString();

  const deterministicHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        replayId,
        generatedAt,
        points,
      }),
    )
    .digest("hex");

  return {
    replay_id: replayId,
    generated_at: generatedAt,
    points,
    deterministic_hash: deterministicHash,
  };
}