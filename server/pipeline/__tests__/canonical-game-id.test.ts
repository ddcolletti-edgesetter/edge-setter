import { describe, expect, it, vi } from "vitest";
import {
  canonicalGameId,
  mlbCanonicalTeamCode,
  mlbTeamIdCodeEntries,
  MLB_CLUB_COUNT,
} from "../canonical-game-id";

/**
 * Coverage for the canonical game-identity layer that unifies MLB's two game
 * rows (odds-bearing vs score-bearing) onto one id, so settlement finally grades
 * against a row that has a spread and produces non-null hits.
 *
 * The team-code map was pinned empirically 2026-08-17 against live StatsAPI
 * /api/v1/teams and the prod odds `games` table. The surprises those dumps
 * exposed are asserted explicitly below so a regression can't quietly undo them:
 *   - Arizona: StatsAPI "AZ" must normalize to canonical "ARI"
 *   - Athletics: "ATH" both sides (odds feed sends bare "Athletics")
 *   - White Sox: "CWS" both sides (the legacy "CHW" table entry was stale)
 */

describe("canonicalGameId", () => {
  it("formats LEAGUE_YYYY_MM_DD_AWAY_HOME from an ISO datetime", () => {
    expect(canonicalGameId("MLB", "2026-08-17T23:05:00Z", "NYY", "BOS"))
      .toBe("MLB_2026_08_17_NYY_BOS");
  });

  it("accepts a bare YYYY-MM-DD date", () => {
    expect(canonicalGameId("NBA", "2026-01-02", "LAL", "GSW"))
      .toBe("NBA_2026_01_02_LAL_GSW");
  });

  it("uses only the date portion, dropping the time", () => {
    const withTime = canonicalGameId("MLB", "2026-08-17T18:40:00-04:00", "SF", "LAD");
    const dateOnly = canonicalGameId("MLB", "2026-08-17", "SF", "LAD");
    expect(withTime).toBe(dateOnly);
    expect(withTime).toBe("MLB_2026_08_17_SF_LAD");
  });
});

describe("mlbCanonicalTeamCode — full club coverage", () => {
  it("maps all 30 clubs by team id, each to a non-null code", () => {
    const entries = mlbTeamIdCodeEntries();
    expect(entries).toHaveLength(MLB_CLUB_COUNT);
    for (const [id, expected] of entries) {
      expect(mlbCanonicalTeamCode({ id })).toBe(expected);
    }
  });

  it("produces a unique code per club (no two ids collide)", () => {
    const codes = mlbTeamIdCodeEntries().map(([, code]) => code);
    expect(new Set(codes).size).toBe(MLB_CLUB_COUNT);
  });
});

describe("mlbCanonicalTeamCode — the empirically pinned surprises", () => {
  it("Arizona (id 109) normalizes StatsAPI 'AZ' → 'ARI'", () => {
    expect(mlbCanonicalTeamCode({ id: 109, abbreviation: "AZ" })).toBe("ARI");
  });

  it("Arizona resolves to ARI even from abbreviation alone (no id)", () => {
    expect(mlbCanonicalTeamCode({ abbreviation: "AZ" })).toBe("ARI");
  });

  it("Athletics (id 133) → 'ATH' (both feeds agree)", () => {
    expect(mlbCanonicalTeamCode({ id: 133, abbreviation: "ATH" })).toBe("ATH");
    expect(mlbCanonicalTeamCode({ abbreviation: "ATH" })).toBe("ATH");
  });

  it("White Sox (id 145) → 'CWS' (not the stale 'CHW')", () => {
    expect(mlbCanonicalTeamCode({ id: 145, abbreviation: "CWS" })).toBe("CWS");
  });

  it("prefers the team id over a drifting abbreviation", () => {
    // Even if a future feed sent a wrong/blank abbreviation, the id wins.
    expect(mlbCanonicalTeamCode({ id: 147, abbreviation: "" })).toBe("NYY");
  });
});

describe("mlbCanonicalTeamCode — non-fatal on unknown/non-club", () => {
  it("returns null (never throws) for an All-Star / non-club ref and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // "American League" / "National League" All-Star rows have no club id and
    // collapse to codes like "LEA" via the odds fallback — must be skipped.
    expect(mlbCanonicalTeamCode({ id: 159, abbreviation: "AL", name: "American League All-Stars" })).toBeNull();
    expect(mlbCanonicalTeamCode({ abbreviation: "LEA" })).toBeNull();
    expect(mlbCanonicalTeamCode(null)).toBeNull();
    expect(mlbCanonicalTeamCode({})).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("StatsAPI ↔ Odds convergence — both sides build the SAME id", () => {
  // Odds-side codes as actually stored in prod (GLOB 'MLB_*'), pinned 2026-08-17.
  // StatsAPI side is derived from team id via the normalizer. If these ever
  // diverge, MLB re-splits into two rows and settlement breaks again.
  const CASES: Array<{
    name: string;
    date: string;
    away: { id: number; abbr: string }; awayOdds: string;
    home: { id: number; abbr: string }; homeOdds: string;
  }> = [
    { name: "Arizona @ Dodgers", date: "2026-08-17T02:10:00Z",
      away: { id: 109, abbr: "AZ" },  awayOdds: "ARI",
      home: { id: 119, abbr: "LAD" }, homeOdds: "LAD" },
    { name: "Athletics @ Astros", date: "2026-08-17T00:05:00Z",
      away: { id: 133, abbr: "ATH" }, awayOdds: "ATH",
      home: { id: 117, abbr: "HOU" }, homeOdds: "HOU" },
    { name: "White Sox @ Yankees", date: "2026-08-17T17:05:00Z",
      away: { id: 145, abbr: "CWS" }, awayOdds: "CWS",
      home: { id: 147, abbr: "NYY" }, homeOdds: "NYY" },
  ];

  for (const c of CASES) {
    it(`${c.name}: statsapi-derived id == odds-derived id`, () => {
      const fromStatsApi = canonicalGameId(
        "MLB", c.date,
        mlbCanonicalTeamCode(c.away)!, mlbCanonicalTeamCode(c.home)!,
      );
      const fromOdds = canonicalGameId("MLB", c.date, c.awayOdds, c.homeOdds);
      expect(fromStatsApi).toBe(fromOdds);
    });
  }
});
