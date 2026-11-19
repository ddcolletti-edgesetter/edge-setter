/**
 * `opponent` is one team, not the whole matchup.
 *
 * All three adapters in signalsApi.ts used to do `opponent: ls.matchup`, and
 * `live_signals.matchup` is a PAIR — "GRE @ WAV" in all 166 matchups of a
 * 200-signal prod sample. Every surface that prints `${team} vs ${opponent}`
 * therefore rendered the team twice with the separator still in it:
 * "WAV vs GRE @ WAV", "TAMU vs TEX @ TAMU".
 *
 * Two rules under test: the opponent is the OTHER side, and when that cannot be
 * established the field is left unset rather than filled with something wrong.
 * The rendered board row is checked too, because that is where a reader saw it.
 */

import { describe, expect, it } from "vitest";

import {
  adaptToCFBSignal,
  adaptToNFLSignal,
  adaptToV2Signal,
  opponentFromMatchup,
  type LiveSignal,
} from "@/lib/signalsApi";
import { buildBoardSituations } from "@/lib/boardSituations";
import { toSituationRowData } from "@/components/board/boardAdapters";

function liveSignal(over: Partial<LiveSignal> = {}): LiveSignal {
  const now = "2026-11-19T00:00:00.000Z";
  return {
    id: "sig-1",
    league: "CFB",
    game_id: "CFB_2026_11_21_GRE_WAV",
    signal_type: "injury_update",
    headline: "Tulane starter listed out",
    body: "Reported by two outlets.",
    action_note: "Watch the line.",
    why_it_matters: "Starter availability moves this number.",
    team: "WAV",
    player: "A. Player",
    matchup: "GRE @ WAV",
    sources: [{ name: "Outlet", type: "media" }],
    source_count: 2,
    verdict: "likely",
    confidence: 70,
    confirmation_strength: "Corroborated",
    line_movement: null,
    injury_designation: null,
    lineup_status: null,
    weather_note: null,
    betting_relevance: true,
    fantasy_relevance: false,
    score: 70,
    score_band: "Strong",
    urgency_label: "WATCH",
    urgency_reason: "r",
    trust_label: "Developing",
    score_explanation: "",
    breakdown: {
      confidenceScore: 1,
      sourceQualityScore: 1,
      marketImpactScore: 1,
      recencyBonus: 1,
      relevanceScore: 1,
      contextScore: 1,
    },
    raw_event_ids: [],
    signal_time: now,
    created_at: now,
    updated_at: now,
    outcome_id: null,
    ...over,
  };
}

describe("opponentFromMatchup", () => {
  it("returns the other side, whichever side the team is on", () => {
    expect(opponentFromMatchup("GRE @ WAV", "WAV")).toBe("GRE");
    expect(opponentFromMatchup("GRE @ WAV", "GRE")).toBe("WAV");
    expect(opponentFromMatchup("TEX @ TAMU", "TAMU")).toBe("TEX");
  });

  it("accepts the separators the pipeline actually produces", () => {
    expect(opponentFromMatchup("GRE vs WAV", "WAV")).toBe("GRE");
    expect(opponentFromMatchup("GRE vs. WAV", "WAV")).toBe("GRE");
    expect(opponentFromMatchup("GRE at WAV", "WAV")).toBe("GRE");
    expect(opponentFromMatchup("  GRE   @   WAV  ", "wav")).toBe("GRE");
  });

  it("leaves it unset rather than guessing", () => {
    // Team is not in the pair: we do not know which side is the opponent.
    expect(opponentFromMatchup("GRE @ WAV", "OSU")).toBeUndefined();
    // No team at all, including the "—" the adapters substitute.
    expect(opponentFromMatchup("GRE @ WAV", null)).toBeUndefined();
    expect(opponentFromMatchup("GRE @ WAV", "—")).toBeUndefined();
    // Not a pair.
    expect(opponentFromMatchup("WAV", "WAV")).toBeUndefined();
    expect(opponentFromMatchup("GRE @ WAV @ OSU", "WAV")).toBeUndefined();
    expect(opponentFromMatchup(null, "WAV")).toBeUndefined();
    expect(opponentFromMatchup("", "WAV")).toBeUndefined();
  });
});

describe("every adapter stores a token, not the pair", () => {
  it("CFB", () => {
    expect(adaptToCFBSignal(liveSignal()).opponent).toBe("GRE");
  });

  it("NFL", () => {
    const signal = liveSignal({ league: "NFL", team: "DAL", matchup: "NYG @ DAL" });
    expect(adaptToNFLSignal(signal).opponent).toBe("NYG");
  });

  it("NBA and MLB", () => {
    const nba = liveSignal({ league: "NBA", team: "BOS", matchup: "MIA @ BOS" });
    expect(adaptToV2Signal(nba, "NBA").opponent).toBe("MIA");
    const mlb = liveSignal({ league: "MLB", team: "NYY", matchup: "BOS @ NYY" });
    expect(adaptToV2Signal(mlb, "MLB").opponent).toBe("BOS");
  });

  it("leaves the field unset when the matchup does not name the team", () => {
    const orphan = liveSignal({ team: "OSU", matchup: "GRE @ WAV" });
    expect(adaptToCFBSignal(orphan).opponent).toBeUndefined();
    expect(adaptToNFLSignal(orphan).opponent).toBeUndefined();
    expect(adaptToV2Signal(orphan, "NBA").opponent).toBeUndefined();
  });
});

describe("the board row a reader sees", () => {
  const rowFor = (signal: LiveSignal, league: "CFB" | "NFL" = "CFB") => {
    const adapted = league === "CFB" ? adaptToCFBSignal(signal) : adaptToNFLSignal(signal);
    const [situation] = buildBoardSituations({
      league,
      games: [],
      signals: [adapted as never],
    });
    return toSituationRowData(situation);
  };

  it("names each team once", () => {
    const row = rowFor(liveSignal());
    expect(row.matchup).toBe("WAV vs GRE");
    expect(row.matchup).not.toContain("@");
  });

  it("does the same for an NFL signal", () => {
    const row = rowFor(liveSignal({ league: "NFL", team: "DAL", matchup: "NYG @ DAL" }), "NFL");
    expect(row.matchup).toBe("DAL vs NYG");
  });

  it("shows the team alone when the opponent cannot be established", () => {
    const row = rowFor(liveSignal({ team: "OSU", matchup: "GRE @ WAV" }));
    expect(row.matchup).toBe("OSU");
  });
});
