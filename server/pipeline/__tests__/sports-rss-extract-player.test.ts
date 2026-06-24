import { describe, expect, it } from "vitest";
import { extractPlayer } from "../adapters/sports-rss";

describe("extractPlayer", () => {
  it("1 — prefix match (existing fast path): 'Name action...'", () => {
    expect(extractPlayer("Patrick Mahomes is questionable for Sunday")).toBe("Patrick Mahomes");
  });

  it("2 — Report: prefix stripped before prefix match", () => {
    expect(extractPlayer("Report: Cam Skattebo expected to miss Week 5")).toBe("Cam Skattebo");
  });

  it("3 — Sources: prefix + team + position indicator mid-title", () => {
    expect(extractPlayer("Sources: Giants RB Cam Skattebo out 4-6 weeks")).toBe("Cam Skattebo");
  });

  it("4 — team possessive before player name: \"Chiefs' Rashee Rice\"", () => {
    expect(extractPlayer("Chiefs' Rashee Rice listed questionable with knee")).toBe("Rashee Rice");
  });

  it("5 — parenthetical immediately after name: \"Rashee Rice (knee)\"", () => {
    expect(extractPlayer("Rashee Rice (knee) questionable Sunday")).toBe("Rashee Rice");
  });

  it("6 — position abbreviation before name: \"WR Name\"", () => {
    expect(extractPlayer("Eagles WR Dallas Goedert questionable with hamstring")).toBe("Dallas Goedert");
  });
});
