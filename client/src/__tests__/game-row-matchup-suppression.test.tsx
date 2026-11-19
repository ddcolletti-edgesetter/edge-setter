/**
 * A game-derived board row is suppressed when a signal- or canonical-derived
 * row already covers the same matchup.
 *
 * #104 gave the CFB and NFL boards a slate for the first time, which added one
 * game row per fixture. A game row carries no story of its own — its
 * confidenceNote is literally "Game context only; no verified story attached" —
 * so on a fixture something is already being reported about, it is a second
 * card saying strictly less than the first. Measured against the prod slates
 * on 2026-11-19: 58 of 67 CFB game rows and 11 of 11 NFL game rows sat on a
 * matchup that already had a story card.
 *
 * THE RULE IS DELIBERATELY NARROW, and the narrowness is most of what is
 * tested below:
 *
 *   both sides, or nothing   A story about one team does not stand in for the
 *                            fixture. A Georgia injury says nothing about who
 *                            Georgia plays, and a one-sided rule would erase a
 *                            game row for every team with any open story.
 *   tokens, not names        A games row stores shortCode(odds name) and a
 *                            signal carries the same abbreviation. #101/#104
 *                            resolve those to school names for DISPLAY; the
 *                            two lineages only line up before either does.
 *   unordered                A games row is away-then-home, a signal is
 *                            subject-then-opponent. Prod serves "BEA @ GAM"
 *                            for the game and "GAM-BEA" for the signal on it.
 *   a token two teams share  cannot identify a side. "OWL @ OWL" is Rice at
 *                            Temple; a canonical row whose only team is "OWL"
 *                            names one of them and there is no way to say
 *                            which, so the game row stays.
 *
 * And the other half: the rows that SURVIVE must keep everything #99/#101/#104
 * gave them. Section 4 is that guard.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CFBBoard from "@/pages/CFBBoard";
import { SignalGateProvider } from "@/context/SignalGate";
import { useAuth } from "@/context/AuthContext";
import { useCFBSignals } from "@/hooks/useSignals";
import { useCanonicalSituations } from "@/lib/situationsApi";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import {
  buildBoardSituations,
  dropGameSituationsCoveredByStories,
  situationMatchupPair,
  type BoardSituation,
} from "@/lib/boardSituations";
import { mergeCanonicalWithBoardSituations } from "@/lib/situationAdapters";

/* ------------------------------------------------------------------ stubs */

function situation(kind: BoardSituation["kind"], fields: Partial<BoardSituation>): BoardSituation {
  return {
    id: `${kind}-${fields.id ?? "x"}`,
    kind,
    league: "CFB",
    lane: "decision",
    escalation: "Watch",
    title: "stub",
    score: 10,
    confidence: 50,
    sourceCount: 1,
    trustLabel: "Monitoring",
    lifecycle: "Developing",
    lifecycleStage: "Developing",
    isLive: false,
    isActionable: false,
    relatedSignalIds: [],
    ...fields,
  } as BoardSituation;
}

const gameRow = (away: string, home: string, id = `${away}-${home}`) =>
  situation("game", { id, awayTeam: away, homeTeam: home, gameId: id });
const signalRow = (team: string, opponent?: string, id = `${team}-${opponent}`) =>
  situation("signal", { id, team, opponent });
const canonicalRow = (team: string, opponent?: string, id = `${team}-${opponent}`) =>
  situation("canonical", { id, team, opponent });

const gameLabels = (situations: readonly BoardSituation[]) =>
  situations.filter((s) => s.kind === "game").map((s) => `${s.awayTeam} @ ${s.homeTeam}`);

/* ------------------------------------------- 1. the pair a situation names */

describe("situationMatchupPair", () => {
  it("reads a game row from its away/home tokens", () => {
    expect(situationMatchupPair(gameRow("BEA", "GAM"))).toBe("bea|gam");
  });

  it("reads a signal or canonical row from team/opponent", () => {
    expect(situationMatchupPair(signalRow("GAM", "BEA"))).toBe("bea|gam");
    expect(situationMatchupPair(canonicalRow("GAM", "BEA"))).toBe("bea|gam");
  });

  it("is unordered, because the two lineages disagree about direction", () => {
    expect(situationMatchupPair(gameRow("BEA", "GAM")))
      .toBe(situationMatchupPair(signalRow("GAM", "BEA")));
  });

  it("ignores case and punctuation so the two lineages compare equal", () => {
    expect(situationMatchupPair(signalRow("ok-st.", "A.S.U."))).toBe("asu|okst");
  });

  it("is null when the row names only one team", () => {
    expect(situationMatchupPair(signalRow("UGA", undefined))).toBeNull();
    expect(situationMatchupPair(canonicalRow("UGA"))).toBeNull();
  });

  it("is null when both sides are the same token, which names neither side", () => {
    expect(situationMatchupPair(gameRow("OWL", "OWL"))).toBeNull();
  });

  it("is null for TBD, which is not a team", () => {
    expect(situationMatchupPair(gameRow("TBD", "TBD"))).toBeNull();
    expect(situationMatchupPair(gameRow("TBD", "GAM"))).toBeNull();
  });
});

/* ----------------------------------------------------- 2. the suppression */

describe("dropGameSituationsCoveredByStories", () => {
  it("drops a game row a signal already covers", () => {
    const out = dropGameSituationsCoveredByStories([gameRow("BEA", "GAM"), signalRow("GAM", "BEA")]);
    expect(gameLabels(out)).toEqual([]);
    expect(out).toHaveLength(1);
  });

  it("drops a game row a canonical situation already covers", () => {
    const out = dropGameSituationsCoveredByStories([gameRow("BEA", "GAM"), canonicalRow("BEA", "GAM")]);
    expect(gameLabels(out)).toEqual([]);
  });

  it("keeps a game row nothing covers", () => {
    const out = dropGameSituationsCoveredByStories([gameRow("UNC", "CAV"), signalRow("GAM", "BEA")]);
    expect(gameLabels(out)).toEqual(["UNC @ CAV"]);
  });

  it("keeps a game row when the story names only one of its teams", () => {
    const out = dropGameSituationsCoveredByStories([gameRow("UNC", "CAV"), signalRow("UNC", undefined)]);
    expect(gameLabels(out)).toEqual(["UNC @ CAV"]);
  });

  it("keeps a game row when the story names one of its teams and a THIRD team", () => {
    const out = dropGameSituationsCoveredByStories([gameRow("UNC", "CAV"), signalRow("UNC", "DUKE")]);
    expect(gameLabels(out)).toEqual(["UNC @ CAV"]);
  });

  it("keeps a game whose two sides share a mascot token, which no story can disambiguate", () => {
    // Rice Owls at Temple Owls, with a canonical "OWL" story on the board.
    const out = dropGameSituationsCoveredByStories([gameRow("OWL", "OWL"), canonicalRow("OWL", undefined)]);
    expect(gameLabels(out)).toEqual(["OWL @ OWL"]);
  });

  it("never drops a non-game row", () => {
    const out = dropGameSituationsCoveredByStories([signalRow("GAM", "BEA"), canonicalRow("GAM", "BEA")]);
    expect(out).toHaveLength(2);
  });

  it("leaves a board with no stories on it completely alone", () => {
    const only = [gameRow("UNC", "CAV"), gameRow("BEA", "GAM")];
    expect(gameLabels(dropGameSituationsCoveredByStories(only))).toEqual(["UNC @ CAV", "BEA @ GAM"]);
  });

  it("drops only the covered games, keeping the rest in order", () => {
    const out = dropGameSituationsCoveredByStories([
      gameRow("BEA", "GAM"), gameRow("UNC", "CAV"), gameRow("UTAH", "TCU"),
      signalRow("GAM", "BEA"), canonicalRow("TCU", "UTAH"),
    ]);
    expect(gameLabels(out)).toEqual(["UNC @ CAV"]);
  });
});

/* --------------------------------------- 3. through the board's own merge */

describe("mergeCanonicalWithBoardSituations", () => {
  it("drops a game a canonical row covers", () => {
    const out = mergeCanonicalWithBoardSituations(
      [canonicalRow("GAM", "BEA")],
      [gameRow("BEA", "GAM"), gameRow("UNC", "CAV")],
    );
    expect(gameLabels(out)).toEqual(["UNC @ CAV"]);
  });

  it("drops a game a signal covers even with NO canonical rows at all", () => {
    // The early return used to hand the fallback straight back.
    const out = mergeCanonicalWithBoardSituations(
      [],
      [gameRow("BEA", "GAM"), gameRow("UNC", "CAV"), signalRow("GAM", "BEA")],
    );
    expect(gameLabels(out)).toEqual(["UNC @ CAV"]);
  });

  it("still covers a matchup whose signal row the canonical pass deduped away", () => {
    // Same league/type/player/team, so storyKey drops the signal row. The
    // canonical row that replaced it must keep covering the fixture, which is
    // why the suppression runs AFTER the storyKey pass rather than before.
    const canonical = situation("canonical", {
      id: "c1", signalType: "injury", player: "A Player", team: "BEA", opponent: "GAM",
    });
    const signal = situation("signal", {
      id: "s1", signalType: "injury", player: "A Player", team: "BEA", opponent: "GAM",
    });
    const out = mergeCanonicalWithBoardSituations([canonical], [gameRow("BEA", "GAM"), signal]);
    expect(out.filter((s) => s.kind === "signal")).toHaveLength(0);
    expect(gameLabels(out)).toEqual([]);
  });

  it("keeps every non-game row it was given", () => {
    const out = mergeCanonicalWithBoardSituations(
      [canonicalRow("GAM", "BEA", "c")],
      [gameRow("BEA", "GAM"), signalRow("UNC", "CAV", "s")],
    );
    expect(out.map((s) => s.kind).sort()).toEqual(["canonical", "signal"]);
  });
});

/* ---------------------------- 4. what the surviving game rows keep */

describe("the surviving game rows keep their names", () => {
  const games = [
    // Covered by the signal below, so it goes.
    { id: "g1", awayTeam: "BEA", homeTeam: "GAM", awayTeamName: "Sam Houston State Bearkats", homeTeamName: "Jacksonville State Gamecocks" },
    // Nothing covers this one, so it stays, with both names.
    { id: "g2", awayTeam: "UNC", homeTeam: "CAV", awayTeamName: "North Carolina Tar Heels", homeTeamName: "Virginia Cavaliers" },
  ];

  function build() {
    const fallback = buildBoardSituations({
      league: "CFB",
      games,
      signals: [{
        id: "s1", type: "line_move", team: "GAM", opponent: "BEA",
        headline: "GAM-BEA market move", detail: "A move is being reviewed.",
        player: "Market Desk", confidence: 70, source_count: 2,
      } as any],
    });
    return mergeCanonicalWithBoardSituations([], fallback);
  }

  it("suppresses the covered game and keeps the uncovered one", () => {
    expect(gameLabels(build())).toEqual(["UNC @ CAV"]);
  });

  it("keeps the stored names on the survivor's display title", () => {
    const survivor = build().find((s) => s.kind === "game")!;
    expect(survivor.titleLabel).toBe("North Carolina Tar Heels @ Virginia Cavaliers");
  });

  it("still keeps the survivor's parseable title in tokens", () => {
    const survivor = build().find((s) => s.kind === "game")!;
    expect(survivor.title).toBe("UNC @ CAV");
    expect(survivor.awayTeam).toBe("UNC");
    expect(survivor.homeTeam).toBe("CAV");
  });
});

/* ------------------------------------------- 5. on the real CFB board */

vi.mock("@/context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/useSignals", () => ({
  useNFLSignals: vi.fn(), useCFBSignals: vi.fn(), useNBASignals: vi.fn(),
}));
vi.mock("@/lib/situationsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/situationsApi")>();
  return { ...actual, useCanonicalSituations: vi.fn() };
});
vi.mock("@/lib/fetchWithTimeout", () => ({ fetchWithTimeout: vi.fn() }));

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("CFB board", () => {
  /** Two fixtures today; one of them has a market story on it. */
  function prime() {
    vi.mocked(useAuth).mockReturnValue({
      email: "subscriber@example.com", user: null, isPro: true,
      authLoading: false, login: vi.fn(), logout: vi.fn(),
    } as any);
    vi.mocked(useCanonicalSituations).mockReturnValue({
      situations: [], loading: false, error: null, refresh: vi.fn(),
    } as any);
    const soon = new Date(Date.now() + 6 * 3600_000).toISOString();
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      json: async () => ({
        games: [
          { id: "g1", home_team: "GAM", away_team: "BEA", home_team_name: "Jacksonville State Gamecocks", away_team_name: "Sam Houston State Bearkats", game_time: soon, status: "scheduled", updated_at: soon },
          { id: "g2", home_team: "CAV", away_team: "UNC", home_team_name: "Virginia Cavaliers", away_team_name: "North Carolina Tar Heels", game_time: soon, status: "scheduled", updated_at: soon },
        ],
      }),
    } as Response);
    vi.mocked(useCFBSignals).mockReturnValue({
      signals: [{
        id: "s1", type: "line_move", player: "Market Desk", team: "GAM", opponent: "BEA",
        headline: "GAM-BEA line movement follows late availability context",
        detail: "A spread move is being reviewed against late availability context.",
        why_it_matters: "A move can point to lineup or availability news.",
        action_takeaway: "Watch for a confirming report.",
        verdict: "review", confidence: 74, sources: 2, source_count: 2, timestamp: "12m ago",
      }],
      loading: false, isLive: true, error: null, refresh: vi.fn(),
    } as any);
  }

  /** The story cards only. The slate strip prints both fixtures from
   *  `liveGames` directly and must not be read as a card. */
  const cardText = () =>
    Array.from(document.querySelectorAll(".situation-story-card"))
      .map((el) => (el.textContent ?? "").replace(/\s+/g, " "));

  async function renderCFB() {
    prime();
    render(<SignalGateProvider><CFBBoard /></SignalGateProvider>);
    await waitFor(() => expect(screen.getByText("CFB Story Board")).toBeInTheDocument());
    // The slate arrives from an effect, so wait for the uncovered fixture.
    await waitFor(() =>
      expect(cardText().some((t) => t.includes("North Carolina Tar Heels @ Virginia Cavaliers"))).toBe(true));
  }

  it("prints the uncovered fixture on a card, under both school names", async () => {
    await renderCFB();
    expect(cardText().filter((t) => t.includes("North Carolina Tar Heels @ Virginia Cavaliers")))
      .toHaveLength(1);
  });

  it("gives the fixture the story already covers no card of its own", async () => {
    await renderCFB();
    expect(cardText().filter((t) => t.includes("Sam Houston State Bearkats @ Jacksonville State Gamecocks")))
      .toHaveLength(0);
  });

  it("still shows the story that covered it", async () => {
    await renderCFB();
    expect(cardText().filter((t) => /line movement follows late availability context/i.test(t)).length)
      .toBeGreaterThan(0);
  });

  it("keeps the suppressed fixture on the slate strip, which is not a story card", async () => {
    await renderCFB();
    // toLiveGamePillData reads `liveGames` directly, never the situation list,
    // so suppressing the card must not take the fixture off the board.
    expect(screen.getAllByText(/Sam Houston State Bearkats @ Jacksonville State Gamecocks/).length)
      .toBeGreaterThan(0);
  });
});
