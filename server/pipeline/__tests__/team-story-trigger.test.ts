import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { classifyTeamStoryTrigger, type TeamStoryTriggerInput } from "../team-story-trigger";

/**
 * classifyTeamStoryTrigger: NFL only, measurement only. Word-bounded patterns,
 * with the known false positives pinned as negatives, and a check that nothing
 * in the live path imports the module.
 */

function rss(headline: string, extra: Partial<TeamStoryTriggerInput> = {}): TeamStoryTriggerInput {
  return { league: "NFL", source_id: "rss_nfl_official_news", source_type: "rss", event_type: "transaction", payload: { headline }, ...extra };
}
const triggersOf = (input: TeamStoryTriggerInput) => classifyTeamStoryTrigger(input).map(m => m.trigger);

describe("positive cases, one per trigger", () => {
  const cases: Array<[string, string]> = [
    ["coach_fire", "Jets fire head coach Robert Saleh after 2-3 start"],
    ["coach_fire", "Saints head coach Dennis Allen fired after seventh straight loss"],
    ["coach_fire", "Raiders part ways with offensive coordinator Luke Getsy"],
    ["coach_hire", "Bears hire Ben Johnson as head coach"],
    ["coach_hire", "Kellen Moore named Saints head coach"],
    ["front_office", "Falcons fire general manager Terry Fontenot"],
    ["front_office", "Titans GM Ran Carthon fired after two seasons"],
    ["trade", "Browns traded Amari Cooper to the Bills"],
    ["trade", "Steelers acquire DK Metcalf in a trade with Seattle"],
    ["trade", "Cowboys trade for George Pickens"],
    ["season_ending_injury", "Aidan Hutchinson out for the season with a broken leg"],
    ["season_ending_injury", "Nick Bosa suffers season-ending knee injury"],
    ["season_ending_injury", "Report: Ravens LB has torn ACL"],
    ["suspension", "Rashee Rice suspended six games by the NFL"],
    ["suspension", "NFL hands Jalen Carter a one-game suspension"],
    ["retirement", "Jason Kelce announces retirement after 13 seasons"],
    ["retirement", "Matt Ryan retires as a Falcon"],
  ];
  it.each(cases)("%s: %s", (trigger, headline) => {
    const matches = classifyTeamStoryTrigger(rss(headline));
    const m = matches.find(x => x.trigger === trigger);
    expect(m, JSON.stringify(matches)).toBeDefined();
    expect(m!.evidence).toBe("text_pattern");
    expect(m!.field).toBe("payload.headline");
    expect(m!.pattern).toMatch(/^[a-z_]+$/);
  });

  it("reads notes when the headline has no trigger", () => {
    const m = classifyTeamStoryTrigger(rss("Roster update", { payload: { headline: "Roster update", notes: "The team has suspended CB John Doe indefinitely." } }));
    expect(m).toEqual([expect.objectContaining({ trigger: "suspension", field: "payload.notes", pattern: "suspended" })]);
  });

  it("one event can carry several triggers", () => {
    expect(triggersOf(rss("Panthers fire head coach Frank Reich and general manager Scott Fitterer dismissed"))).toEqual(["coach_fire", "front_office"]);
  });
});

describe("structured evidence (ESPN NFL api only)", () => {
  const espn = (event_type: string, payload: Record<string, unknown>): TeamStoryTriggerInput =>
    ({ league: "NFL", source_id: "espn", source_type: "api", event_type, payload });

  it("ESPN IR designation is season_ending_injury from payload.designation", () => {
    expect(classifyTeamStoryTrigger(espn("injury_update", { designation: "IR", notes: "Placed on injured reserve." }))).toEqual([
      { trigger: "season_ending_injury", evidence: "structured_field", field: "payload.designation", pattern: "espn_nfl_ir", matched: "IR" },
    ]);
  });

  it("ESPN transaction_type Trade is trade from payload.transaction_type", () => {
    expect(classifyTeamStoryTrigger(espn("transaction", { transaction_type: "Trade", notes: "Acquired WR X." }))).toEqual([
      { trigger: "trade", evidence: "structured_field", field: "payload.transaction_type", pattern: "espn_nfl_trade", matched: "Trade" },
    ]);
  });

  it("structured wins over text for the same trigger", () => {
    const m = classifyTeamStoryTrigger(espn("transaction", { transaction_type: "Trade", notes: "Traded to the Bills." }));
    expect(m).toHaveLength(1);
    expect(m[0].evidence).toBe("structured_field");
  });

  it("the same fields from a text source are not structured evidence", () => {
    expect(classifyTeamStoryTrigger(rss("Depth chart notes", { payload: { headline: "Depth chart notes", designation: "IR", transaction_type: "Trade" } }))).toEqual([]);
    expect(classifyTeamStoryTrigger({ ...espn("injury_update", { designation: "OUT" }) })).toEqual([]);
  });
});

describe("known false positives", () => {
  const negatives: Array<[string, string]> = [
    ["fired up", "Jets fired up for head coach's debut at MetLife"],
    ["fired up (no coach)", "Mahomes fired up after comeback win"],
    ["fires back", "Head coach fires back at critics"],
    ["retires the side", "Skubal retires the side in order in the first"],
    ["retires N straight", "Cole retires 10 straight batters"],
    ["retires a number", "Patriots to retire Tom Brady's No. 12"],
    ["retired jersey", "Bears unveil retired jersey ceremony plans"],
    ["sits out", "Saquon Barkley sits out practice with ankle soreness"],
    ["sits out (holdout)", "CeeDee Lamb sits out opener amid contract dispute"],
    ["season opener", "Bijan Robinson ruled out for the season opener"],
    ["trade deadline", "Trade deadline: five Bears who could be moved"],
    ["trade rumors", "Trade rumors swirl around Brandon Aiyuk"],
    ["game suspended", "Game suspended due to lightning in Miami"],
    ["coach of the week", "Ravens' Harbaugh named AFC Coach of the Week"],
    ["plain injury", "Jalen Hurts questionable with knee injury"],
  ];
  it.each(negatives)("%s: %s", (_label, headline) => {
    expect(classifyTeamStoryTrigger(rss(headline))).toEqual([]);
  });

  // Word boundaries: each of these contains a trigger word as a substring.
  const substrings: Array<[string, string]> = [
    ["misfired", "Head coach says the offense misfired all game"],
    ["retirees", "Team honors retirees at halftime"],
    ["suspenders", "Kelce in suspenders on the sideline"],
    ["GMT", "Names announced at 8pm GMT"],
  ];
  it.each(substrings)("word boundary — %s: %s", (_label, headline) => {
    expect(classifyTeamStoryTrigger(rss(headline))).toEqual([]);
  });

  it("the rejections are load-bearing: each negative above has a pattern that would otherwise fire", () => {
    // Without the "fired up" rejection, fire_coach would read "fired up for head coach".
    expect(/\bfire[sd]?\s+(?:\w+\s+){0,3}?head\s+coach\b/i.test("Jets fired up for head coach's debut")).toBe(true);
    expect(/\bretire[sd]?\b/i.test("Skubal retires the side in order")).toBe(true);
    expect(/\bsuspend(?:ed|s)?\b/i.test("Game suspended due to lightning")).toBe(true);
    expect(/\btrade\b/i.test("Trade deadline: five Bears")).toBe(true);
  });
});

describe("scope", () => {
  it("NBA, MLB and CFB return nothing, even for an obvious trigger", () => {
    for (const league of ["NBA", "MLB", "CFB"]) {
      expect(classifyTeamStoryTrigger(rss("Jets fire head coach Robert Saleh", { league }))).toEqual([]);
      expect(classifyTeamStoryTrigger({ league, source_id: "espn", source_type: "api", event_type: "injury_update", payload: { designation: "IR" } })).toEqual([]);
    }
  });

  it("missing or non-object payload is no match, not a throw", () => {
    expect(classifyTeamStoryTrigger(rss("x", { payload: null }))).toEqual([]);
    expect(classifyTeamStoryTrigger(rss("x", { payload: "Jets fire head coach" }))).toEqual([]);
  });
});

describe("nothing in the live path calls it", () => {
  const ROOT = path.resolve(__dirname, "../../..");
  const SELF = path.join(ROOT, "server/pipeline/team-story-trigger.ts");
  const CENSUS = path.join(ROOT, "server/scripts/team-story-trigger-census.ts");

  function walk(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "__tests__" || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.(ts|tsx|js|mjs|cjs)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
    return out;
  }

  it("only the census script imports team-story-trigger", () => {
    const files = ["server", "client/src", "shared"].flatMap(d => walk(path.join(ROOT, d)));
    expect(files.length).toBeGreaterThan(100); // the scan really covered the tree
    const importers = files
      .filter(f => f !== SELF)
      .filter(f => /team-story-trigger(?!-census)/.test(fs.readFileSync(f, "utf8")))
      .map(f => path.relative(ROOT, f).replace(/\\/g, "/"));
    expect(importers).toEqual(["server/scripts/team-story-trigger-census.ts"]);
    expect(fs.readFileSync(CENSUS, "utf8")).toContain('from "../pipeline/team-story-trigger"');
  });
});
