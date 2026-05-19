import crypto from "crypto";
import { ReplayConvergenceReport } from "./replay-convergence-report";

export interface ReplayConvergenceExportBundle {
  export_id: string;
  generated_at: string;
  report_count: number;
  reports: ReplayConvergenceReport[];
  deterministic_hash: string;
}

export function buildReplayConvergenceExportBundle(
  reports: ReplayConvergenceReport[],
): ReplayConvergenceExportBundle {
  const generatedAt = new Date().toISOString();

  const deterministicHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        generatedAt,
        reports,
      }),
    )
    .digest("hex");

  return {
    export_id: deterministicHash.slice(0, 16),
    generated_at: generatedAt,
    report_count: reports.length,
    reports,
    deterministic_hash: deterministicHash,
  };
}