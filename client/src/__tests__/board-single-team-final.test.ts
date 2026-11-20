/**
 * A story that names one team and carries no game_id leaves the board once
 * that team's next game is over.
 *
 * Prod, 2026-11-20: the NFL lead was "Jake Andrews (Coach's Decision) — OUT",
 * an HOU injury signal written at 23:59Z with no game_id and no opponent, for
 * the HOU–IND game that kicked off at 01:15Z and went final. Two IND injury
 * cards (Jalen Travis, Jerry Tillery) were canonical situations with
 * teams ["IND"]. Neither the id rule nor the pair rule could place them, so the
 * finished-game filter kept them.
 */
import { describe, expect, it } from "vitest";
import { buildBoardSituations, type BoardGameInput, type BoardSituation } from "@/lib/boardSituations";
import { dropStoriesNoLongerLive, indexStoryGames, resolveStoryGame } from "@/lib/boardStoryGame";
import { canonicalSituationToBoardSituation } from "@/lib/situationAdapters";
import type { CanonicalSituation } from "@/lib/situationsApi";

const NOW = Date.parse("2026-11-20T09:35:00Z");
type Game = BoardGameInput & { id: string; league: string };

/* Prod rows, trimmed. */
const HOU_IND_FINAL: Game = {
  id: "NFL_2026_11_20_IND_HOU", league: "NFL", away_team: "IND", home_team: "HOU",
  game_time: "2026-11-20T01:15:00Z", status: "final",
};
const HOU_NEXT: Game = {
  id: "NFL_2026_11_29_BAL_HOU", league: "NFL", away_team: "BAL", home_team: "HOU",
  game_time: "2026-11-29T18:00:00Z", status: "scheduled",
};
const IND_NEXT: Game = {
  id: "NFL_2026_11_29_NYG_IND", league: "NFL", away_team: "NYG", home_team: "IND",
  game_time: "2026-11-29T18:00:00Z", status: "scheduled",
};
const NFL_GAMES = [HOU_IND_FINAL, HOU_NEXT, IND_NEXT];

function injurySignal(id: string, team: string, at: string) {
  return {
    id, type: "injury", team, player: "Jake Andrews",
    headline: "Jake Andrews (Coach's Decision) — OUT",
    detail: "Ruled out.", verdict: "likely", confidence: 84, source_count: 1,
    timestamp: "9h ago", isoTimestamp: at, signal_time: at,
  };
}

function signalStory(league: "NFL" | "NBA" | "MLB" | "CFB", team: string, at: string, id = "sig-1"): BoardSituation {
  const rows = buildBoardSituations({ league, games: [], signals: [injurySignal(id, team, at)] as never[] })
    .filter((s) => s.kind === "signal");
  expect(rows).toHaveLength(1);
  return rows[0];
}

function canonicalStory(team: string, lastUpdatedAt: string, league = "NFL"): BoardSituation {
  return canonicalSituationToBoardSituation({
    id: "sit-ind", title: "Jalen Travis injury", summary: "Jalen Travis (Knee) — OUT",
    sport: "football", league, teams: [team], players: ["Jalen Travis"], situationType: "injury",
    lifecycleState: "developing", lifecycleExplanation: "", confidence: 70, confidenceLabel: "medium",
    confidenceFactors: { scores: {}, whyConfidenceIncreased: [], whyConfidenceDecreased: [], evidenceThatMattersMost: [], whatRemainsUncertain: [] },
    severity: "medium", escalationScore: 60, timingPressure: "medium", operationalVisibilityScore: 80,
    lastUpdatedAt, firstSeenAt: "2026-11-10T02:15:05.722Z", evidenceCount: 3, sourceCount: 1,
    latestEvidence: [], stateHistoryPreview: [], confidenceHistoryPreview: [], replayHash: "r",
  } as unknown as CanonicalSituation);
}

const kept = (situations: BoardSituation[], games: Game[], kickoffTrusted = true) =>
  dropStoriesNoLongerLive(situations, games, { kickoffTrusted, now: NOW }).map((s) => s.id);

describe("a one-team story with no game_id", () => {
  it("drops a pregame report once its team's game is final (the prod HOU lead, and the IND canonical cards)", () => {
    const lead = signalStory("NFL", "HOU", "2026-11-19T23:59:44.814Z");
    const travis = canonicalStory("IND", "2026-11-18T18:59:42.360Z");
    const match = resolveStoryGame(lead, indexStoryGames(NFL_GAMES));
    expect(match).toMatchObject({ how: "team", game: { id: HOU_IND_FINAL.id } });
    expect(resolveStoryGame(travis, indexStoryGames(NFL_GAMES))?.game.id).toBe(HOU_IND_FINAL.id);
    expect(kept([lead, travis], NFL_GAMES)).toEqual([]);
    // Final drops even where the kickoff is not trusted.
    expect(kept([lead, travis], NFL_GAMES, false)).toEqual([]);
  });

  it("keeps a report filed after the final, matched to the team's next game", () => {
    const postGame = signalStory("NFL", "HOU", "2026-11-20T03:00:00Z");
    expect(resolveStoryGame(postGame, indexStoryGames(NFL_GAMES))?.game.id).toBe(HOU_NEXT.id);
    expect(kept([postGame], NFL_GAMES)).toEqual([postGame.id]);
  });

  it("keeps a report filed after the team's last stored game (no fall-back to the latest game)", () => {
    const offseason = signalStory("MLB", "TOR", "2026-11-19T21:14:43.997Z");
    const lastGame: Game = { id: "MLB_2026_09_28_TOR_NYY", league: "MLB", away_team: "TOR", home_team: "NYY", game_time: "2026-09-28T17:05:00Z", status: "final" };
    expect(resolveStoryGame(offseason, indexStoryGames([lastGame]))).toBeUndefined();
    expect(kept([offseason], [lastGame])).toEqual([offseason.id]);
  });

  it("never matches a game in another league that shares the team code", () => {
    const nflInd = canonicalStory("IND", "2026-11-18T18:59:42.360Z");
    const pacersFinal: Game = { id: "NBA_2026_11_19_IND_CLE", league: "NBA", away_team: "IND", home_team: "CLE", game_time: "2026-11-19T00:40:00Z", status: "final" };
    expect(resolveStoryGame(nflInd, indexStoryGames([pacersFinal]))).toBeUndefined();
    expect(kept([nflInd], [pacersFinal])).toEqual([nflInd.id]);
    // And the other way round: a Pacers report does not land on the Colts game.
    const pacersReport = signalStory("NBA", "IND", "2026-11-19T23:00:00Z");
    expect(resolveStoryGame(pacersReport, indexStoryGames(NFL_GAMES))).toBeUndefined();
  });

  it("does not index a game row that carries no league", () => {
    const { league: _drop, ...noLeague } = HOU_IND_FINAL;
    const lead = signalStory("NFL", "HOU", "2026-11-19T23:59:44.814Z");
    expect(kept([lead], [noLeague as Game])).toEqual([lead.id]);
  });

  it("leaves CFB out: one code can name several schools", () => {
    const cfb = signalStory("CFB", "OWL", "2026-11-18T15:29:39.355Z");
    const owlFinal: Game = { id: "CFB_2026_11_19_OWL_KSU", league: "CFB", away_team: "OWL", home_team: "KSU", game_time: "2026-11-19T22:35:00Z", status: "final" };
    expect(resolveStoryGame(cfb, indexStoryGames([owlFinal]))).toBeUndefined();
    expect(kept([cfb], [owlFinal], false)).toEqual([cfb.id]);
  });
});
