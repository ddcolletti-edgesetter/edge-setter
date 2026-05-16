import { describe, expect, it } from "vitest";
import { exportReplayParityReport } from "../replay-validation";

describe("replay parity regression", () => {
  it("keeps stored outcomes aligned with deterministic replay CLV", () => {
    const report = exportReplayParityReport();

    expect(report.total).toBeGreaterThan(0);
    expect(report.mismatched).toBe(0);
    expect(report.matched).toBe(report.total);
  });
});
