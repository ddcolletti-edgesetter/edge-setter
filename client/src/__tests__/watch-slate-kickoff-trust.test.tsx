/**
 * The watch slate obeys the same kickoff gate the story card does.
 *
 * `games.game_time` is first-writer-wins — all three upserts in
 * server/pipeline/store.ts list it in their INSERT column list and in none of
 * their ON CONFLICT clauses — so whichever adapter creates the row fixes the
 * start time permanently. The story card has refused to print that time for
 * anything but NFL since KICKOFF_TRUSTED_LEAGUES existed; the slate printed it
 * for every league, which made the slate the one surface where a stale CFB
 * kickoff still reached a reader.
 *
 * That is not hypothetical: in the live CFB slate on 2026-11-19, six of 73
 * games had a second row from the same feed event with a start time 3.5 to 12
 * hours later, and the original row's time was never corrected. See
 * public-game-slate-dedupe.test.ts for those six.
 *
 * The second half of this file pins the SOURCE FACT the gate's comment now
 * rests on, because that comment used to assert a module that does not exist.
 */

import fs from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  kickoffIsTrustedForLeague,
  toLiveGamePillData,
  type AnyBoardGame,
} from "@/components/board/boardAdapters";
import { LiveGameStrip } from "@/components/board/LiveGameStrip";

const KICKOFF = "2026-11-21T20:30:00Z";

const game = (over: Partial<AnyBoardGame> = {}): AnyBoardGame => ({
  id: "g1",
  awayTeam: "ARIZ",
  homeTeam: "KSU",
  status: "scheduled",
  game_time: KICKOFF,
  ...over,
});

describe("the pill's time", () => {
  it("is printed for NFL, whose kickoff windows are fixed months ahead", () => {
    const pill = toLiveGamePillData(game({ awayTeam: "NYG", homeTeam: "DAL" }), 0, "nfl");
    expect(pill.period).toBeTruthy();
  });

  it("is printed for NBA, whose stored tip times were measured against finals", () => {
    // See NBA_FINAL_GAME_DURATIONS below for the measurement this rests on.
    const pill = toLiveGamePillData(game({ awayTeam: "BOS", homeTeam: "NYK" }), 0, "nba");
    expect(pill.period).toBeTruthy();
  });

  it.each(["cfb", "mlb"] as const)("is withheld for %s", (sport) => {
    expect(toLiveGamePillData(game(), 0, sport).period).toBeUndefined();
  });

  it("is withheld when no league is known at all", () => {
    // An unknown league is not a trusted one. Guessing here would reintroduce
    // the bug for any caller that forgets the sport hint.
    expect(toLiveGamePillData(game(), 0, undefined).period).toBeUndefined();
  });

  it("is withheld for a LIVE untrusted game too, which keeps its clock", () => {
    const pill = toLiveGamePillData(game({ status: "In Progress" }), 0, "cfb");
    expect(pill.period).toBeUndefined();
    // `clock` is the live status, not the stored kickoff, so it stays.
    expect(pill.clock).toBe("In Progress");
  });

  it("ignores a pre-formatted `time` field for an untrusted league", () => {
    // game.time is the same stored value, already formatted upstream. Gating
    // only formatGameTime would leave that path open.
    expect(toLiveGamePillData(game({ time: "3:30 PM" }), 0, "cfb").period).toBeUndefined();
    expect(toLiveGamePillData(game({ time: "3:30 PM" }), 0, "nfl").period).toBe("3:30 PM");
  });

  it("uses exactly the gate the card uses", () => {
    for (const sport of ["cfb", "mlb", "nba", "nfl"] as const) {
      const shown = toLiveGamePillData(game(), 0, sport).period !== undefined;
      expect(shown).toBe(kickoffIsTrustedForLeague(sport));
    }
  });
});

describe("the strip's featured line", () => {
  it("falls back to the status label for CFB instead of a time", () => {
    render(<LiveGameStrip games={[toLiveGamePillData(game(), 0, "cfb")]} />);
    // The school names come from the CFB token lookup and are not what this
    // test is about; the tail is. No clock-shaped string is on the strip.
    expect(screen.getByText(/Arizona Wildcats @ Kansas State Wildcats \/ Scheduled/)).toBeTruthy();
    expect(screen.queryByText(/\d{1,2}:\d{2}/)).toBeNull();
  });

  it("still prints the NFL time", () => {
    const pill = toLiveGamePillData(game({ awayTeam: "NYG", homeTeam: "DAL" }), 0, "nfl");
    render(<LiveGameStrip games={[pill]} />);
    expect(screen.getByText(new RegExp(`NYG @ DAL / ${pill.period}`))).toBeTruthy();
  });
});

/* ── The fact the gate's comment rests on ─────────────────────────────────
 *
 * This lives in a client test because the comment being guarded is in
 * client/src/components/board/boardAdapters.ts. It reads server source and
 * asserts nothing about behaviour: if it fails, the comment above
 * KICKOFF_TRUSTED_LEAGUES has gone stale and the trust decision itself should
 * be revisited — which is exactly what happened to the sentence it replaced
 * ("its schedule is written by the ESPN schedule ingester before any odds
 * adapter sees the game"; no such ingester has ever existed).
 */
describe("who writes a games row", () => {
  const ADAPTER_DIR = path.join(process.cwd(), "server", "pipeline", "adapters");

  const adapterFiles = () =>
    fs.readdirSync(ADAPTER_DIR).filter((f) => f.endsWith(".ts"));

  it("is exactly the odds adapter and the MLB schedule adapter", () => {
    const writers = adapterFiles().filter((file) => {
      const source = fs.readFileSync(path.join(ADAPTER_DIR, file), "utf8");
      return /\bupsertGame\s*\(/.test(source) || /\btouchGameSchedule\s*\(/.test(source);
    });
    expect(writers.sort()).toEqual(["mlb-statsapi.ts", "the-odds-api.ts"]);
  });

  it("does not include any ESPN adapter", () => {
    for (const file of adapterFiles().filter((f) => f.startsWith("espn-") && !f.includes("historical"))) {
      const source = fs.readFileSync(path.join(ADAPTER_DIR, file), "utf8");
      expect(/\bupsertGame\b|\btouchGameSchedule\b/.test(source), `${file} writes a games row`).toBe(false);
    }
  });

  it("and no UPDATE on the table touches game_time", () => {
    const store = fs.readFileSync(path.join(process.cwd(), "server", "pipeline", "store.ts"), "utf8");
    // Up to WHERE, not up to the next quote: the statement contains
    // status='final', so a quote-terminated match stops before it reaches the
    // column list this test is about, and passes for the wrong reason.
    const updates = store.match(/UPDATE\s+games\s+SET[\s\S]*?WHERE/g) ?? [];
    expect(updates.length).toBeGreaterThan(0);
    for (const statement of updates) {
      expect(statement).not.toContain("game_time");
    }
  });
});
