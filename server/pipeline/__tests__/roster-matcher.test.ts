import { describe, expect, it } from "vitest";
import { matchRosterPlayer } from "../roster-matcher";
import type { RosterPlayer, RosterStaff } from "../store";

function p(full: string, last: string, extra: Partial<RosterPlayer> = {}): RosterPlayer {
  return { league: "NFL", team: "KC", espn_id: extra.espn_id ?? null, full_name: full, first_name: extra.first_name ?? full.split(" ")[0], last_name: last, position: extra.position ?? "WR", status: extra.status ?? "active" };
}

function coach(full: string, last: string, role = "HC"): RosterStaff {
  return { league: "NFL", team: "DET", full_name: full, first_name: full.split(" ")[0], last_name: last, role };
}

const KC: RosterPlayer[] = [
  p("Patrick Mahomes", "Mahomes", { position: "QB" }),
  p("Rashee Rice", "Rice"),
  p("Travis Kelce", "Kelce", { position: "TE" }),
  p("Chris Jones", "Jones", { position: "DT" }),
  p("Trey Smith", "Smith", { position: "OG" }),
  p("Nikko Remigio", "Remigio"),
];

describe("matchRosterPlayer — full name", () => {
  it("matches a full name anywhere in the headline", () => {
    expect(matchRosterPlayer("Chiefs' Rashee Rice questionable with knee", KC))
      .toMatchObject({ name: "Rashee Rice", confidence: "full_name" });
  });

  it("matches at headline start with a colon (Rotowire shape)", () => {
    expect(matchRosterPlayer("Patrick Mahomes: dealing with ankle", KC))
      .toMatchObject({ name: "Patrick Mahomes", confidence: "full_name" });
  });

  it("is diacritic- and punctuation-insensitive", () => {
    expect(matchRosterPlayer("Report: Nikko Remigio (hamstring) limited", KC))
      .toMatchObject({ name: "Nikko Remigio", confidence: "full_name" });
  });
});

describe("matchRosterPlayer — last-name fallback", () => {
  it("falls back to a unique capitalised surname, flagged low-confidence", () => {
    expect(matchRosterPlayer("Mahomes exits practice early", KC))
      .toMatchObject({ name: "Patrick Mahomes", confidence: "last_name" });
  });

  it("skips a surname used as a lowercase common word", () => {
    // "rice" lowercase mid-sentence is the food, not Rashee Rice.
    expect(matchRosterPlayer("Team serves rice at fan event", KC)).toBeNull();
  });

  it("skips ambiguous surnames shared by two rostered players", () => {
    const roster = [...KC, p("Cam Smith", "Smith", { position: "CB" })];
    // two Smiths → cannot disambiguate → no fallback match
    expect(matchRosterPlayer("Smith ruled out Sunday", roster)).toBeNull();
  });
});

describe("matchRosterPlayer — staff-surname exclusion (last-name tier only)", () => {
  const DET = [p("Jack Campbell", "Campbell", { position: "LB" }), p("Jared Goff", "Goff", { position: "QB" })];
  const DET_STAFF = [coach("Dan Campbell", "Campbell", "HC")];

  it("suppresses a bare surname shared with a coach (Campbell → HC Dan Campbell)", () => {
    // Without staff this returns LB Jack Campbell; with staff it must be null.
    expect(matchRosterPlayer("What jumps out to Campbell about Detroit's Week 1 matchup?", DET))
      .toMatchObject({ name: "Jack Campbell", confidence: "last_name" });
    expect(matchRosterPlayer("What jumps out to Campbell about Detroit's Week 1 matchup?", DET, DET_STAFF))
      .toBeNull();
  });

  it("still matches the player when written out in full, even with a same-surname coach", () => {
    expect(matchRosterPlayer("Jack Campbell leads the defense in Week 1", DET, DET_STAFF))
      .toMatchObject({ name: "Jack Campbell", confidence: "full_name" });
  });

  it("does not affect surnames that are not staff (Goff still falls back)", () => {
    expect(matchRosterPlayer("Goff sharp in the opener", DET, DET_STAFF))
      .toMatchObject({ name: "Jared Goff", confidence: "last_name" });
  });
});

describe("matchRosterPlayer — no match / guards", () => {
  it("returns null when no roster name is present", () => {
    expect(matchRosterPlayer("Chiefs sign practice-squad lineman", KC)).toBeNull();
  });

  it("returns null for an empty roster (team-scoped, roster not yet loaded)", () => {
    expect(matchRosterPlayer("Patrick Mahomes questionable", [])).toBeNull();
  });

  it("prefers the full-name match over a bare surname when both are present", () => {
    // "Chris Jones" full name present → full_name, not the Jones surname fallback
    expect(matchRosterPlayer("Chris Jones dominant in win", KC))
      .toMatchObject({ name: "Chris Jones", confidence: "full_name" });
  });
});
