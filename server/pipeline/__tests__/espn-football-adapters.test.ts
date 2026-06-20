import { describe, expect, it } from "vitest";

import { isCurrentESPNRow, isSignalWorthyNFLInjuryStatus, normalizeESPNNFLInjuryRows } from "../adapters/espn-nfl";
import { isCurrentESPNCFBRow, isSignalWorthyCFBInjuryStatus, normalizeESPNCFBInjuryRows } from "../adapters/espn-cfb";
import { isCurrentESPNTransaction, normalizeESPNNFLTransactionRows } from "../adapters/espn-nfl-transactions";
import { normalizeESPNCFBTransactionRows } from "../adapters/espn-cfb-transactions";

describe("ESPN football adapter normalization", () => {
  it("flattens grouped NFL injury payloads and preserves team context", () => {
    const rows = normalizeESPNNFLInjuryRows([
      {
        displayName: "Arizona Cardinals",
        abbreviation: "ARI",
        injuries: [
          {
            date: "2026-05-29T18:00Z",
            status: "Questionable",
            athlete: {
              displayName: "Example Player",
              position: { abbreviation: "QB" },
            },
          },
        ],
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].athlete?.displayName).toBe("Example Player");
    expect(rows[0].team?.abbreviation).toBe("ARI");
  });

  it("keeps flat NFL injury rows supported", () => {
    const rows = normalizeESPNNFLInjuryRows([
      {
        date: "2026-05-29T18:00Z",
        status: "Active",
        team: { abbreviation: "SF" },
        athlete: { displayName: "Flat Player" },
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].athlete?.displayName).toBe("Flat Player");
    expect(rows[0].team?.abbreviation).toBe("SF");
  });

  it("treats stale or missing injury timestamps as not current", () => {
    const now = new Date("2026-05-30T00:00:00.000Z");

    expect(isCurrentESPNRow("2026-05-29T18:00Z", 21, now)).toBe(true);
    expect(isCurrentESPNRow("2026-04-01T18:00Z", 21, now)).toBe(false);
    expect(isCurrentESPNRow(undefined, 21, now)).toBe(false);
  });

  it("does not treat active football injury rows as live signal-worthy", () => {
    expect(isSignalWorthyNFLInjuryStatus("Active")).toBe(false);
    expect(isSignalWorthyNFLInjuryStatus("Questionable")).toBe(true);
    expect(isSignalWorthyCFBInjuryStatus("Active")).toBe(false);
    expect(isSignalWorthyCFBInjuryStatus("Out")).toBe(true);
  });

  it("flattens grouped CFB rows but freshness guard keeps old rows out", () => {
    const now = new Date("2026-05-30T00:00:00.000Z");
    const rows = normalizeESPNCFBInjuryRows([
      {
        displayName: "Arkansas Razorbacks",
        abbreviation: "ARK",
        injuries: [
          {
            date: "2023-02-05T13:59Z",
            status: "Active",
            athlete: { displayName: "Old CFB Player" },
          },
        ],
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].team?.abbreviation).toBe("ARK");
    expect(isCurrentESPNCFBRow(rows[0].date, 21, now)).toBe(false);
  });

  it("normalizes flat NFL transaction rows and applies transaction freshness", () => {
    const now = new Date("2026-05-30T00:00:00.000Z");
    const rows = normalizeESPNNFLTransactionRows([
      {
        date: "2026-05-28T07:00Z",
        description: "Signed K Younghoe Koo to a three-year contract.",
        team: { abbreviation: "NYJ" },
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].team?.abbreviation).toBe("NYJ");
    expect(rows[0].description).toContain("Signed");
    expect(isCurrentESPNTransaction(rows[0].date, 14, now)).toBe(true);
    expect(isCurrentESPNTransaction("2026-04-01T07:00Z", 14, now)).toBe(false);
  });

  it("resolves NFL injury team from displayName when abbreviation is absent", () => {
    const rows = normalizeESPNNFLInjuryRows([
      {
        displayName: "Kansas City Chiefs",
        injuries: [
          {
            date: "2026-06-18T12:00Z",
            status: "Questionable",
            athlete: { displayName: "Patrick Mahomes" },
          },
        ],
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].team?.abbreviation).toBe("KC");
  });

  it("resolves CFB injury team from displayName when abbreviation is absent", () => {
    const rows = normalizeESPNCFBInjuryRows([
      {
        displayName: "Alabama Crimson Tide",
        injuries: [
          {
            date: "2026-06-18T12:00Z",
            status: "Out",
            athlete: { displayName: "Example Player" },
          },
        ],
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].team?.abbreviation).toBe("ALA");
  });

  it("resolves NFL transaction team from displayName when abbreviation is absent", () => {
    const rows = normalizeESPNNFLTransactionRows([
      {
        team: { displayName: "Pittsburgh Steelers" },
        items: [
          {
            description: "Waived WR Example Player.",
            date: "2026-06-18T07:00Z",
          },
        ],
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].team?.abbreviation).toBe("PIT");
  });

  it("resolves CFB transaction team from displayName when abbreviation is absent", () => {
    const rows = normalizeESPNCFBTransactionRows([
      {
        team: { displayName: "Georgia Bulldogs" },
        items: [
          {
            description: "Player entered transfer portal.",
            date: "2026-06-18T07:00Z",
          },
        ],
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].team?.abbreviation).toBe("UGA");
  });
});
