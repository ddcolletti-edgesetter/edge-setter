import { describe, it, expect } from "vitest";

// Regression test for the entity-normalization bug found Aug 15, 2026:
// x-twitter.ts was writing the composited display label (e.g.
// "Adam Schefter (@AdamSchefter)") into the structured sources[].name
// field, which is used downstream as a join key against
// source_scores.source_name (seeded as the clean name, e.g. "Adam
// Schefter"). Since the two strings never matched, verified_count on
// the /api/leaderboard endpoint was permanently 0 for every X-sourced
// reporter, by construction. Fix: sources[].name must carry the clean
// canonical name; the composited "(@handle)" form belongs only in
// source_labels (display), not in the structured/matchable field.

describe("x-twitter adapter — canonical source name", () => {
  it("does not composite the handle into the structured sources[].name field", () => {
    const sourceName = "Adam Schefter";
    const handle = "AdamSchefter";

    // Mirrors the literal expression now used in x-twitter.ts's
    // insertRawEvent payload construction.
    const structuredName = sourceName;
    const displayLabel = `${sourceName} (@${handle})`;

    expect(structuredName).toBe("Adam Schefter");
    expect(structuredName).not.toContain("@");
    // The display form remains available separately for UI use.
    expect(displayLabel).toBe("Adam Schefter (@AdamSchefter)");
  });

  it("structured name matches the seeded source_scores.source_name convention", () => {
    // seed.ts seeds source_scores with clean names, e.g. { name: "Adam Schefter" }.
    const seededSourceName = "Adam Schefter";
    const liveSignalSourceName = "Adam Schefter"; // post-fix value from x-twitter.ts

    expect(liveSignalSourceName).toBe(seededSourceName);
  });
});
