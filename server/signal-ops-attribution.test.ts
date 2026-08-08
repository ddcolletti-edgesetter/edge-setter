import { describe, it, expect } from "vitest";
import { extractPlayerWithProvenance } from "./signal-ops";

describe("player attribution provenance", () => {
  it("trusts structured player tags over free-text guessing", () => {
    const r = extractPlayerWithProvenance(
      "Devin Neal expected to replace Christen Miller",
      "",
      ["Christen Miller"],
    );
    expect(r.player).toBe("Christen Miller");
    expect(r.provenance).toBe("tagged");
  });

  it("does NOT tag a reporter as the player (the Schefter trap)", () => {
    const r = extractPlayerWithProvenance(
      "Sources tell Adam Schefter that Christen Miller is questionable",
      "",
      [],
    );
    // Must skip the reporter and land on the actual subject.
    expect(r.player).toBe("Christen Miller");
    // But provenance is heuristic, so downstream forces human review.
    expect(r.provenance).toBe("heuristic");
  });

  it("flags heuristic extraction so it cannot silently auto-publish", () => {
    const r = extractPlayerWithProvenance(
      "Devin Neal expected to replace Christen Miller",
      "",
      [],
    );
    // The heuristic will grab the FIRST non-reporter name, which here is the
    // replacement, not the injured player — exactly why provenance must be
    // surfaced as untrustworthy rather than published as fact.
    expect(r.provenance).toBe("heuristic");
  });

  it("returns none when no name can be found", () => {
    const r = extractPlayerWithProvenance("weather delay expected", "", []);
    expect(r.provenance).toBe("none");
    expect(r.player).toBe("Unknown");
  });
});
