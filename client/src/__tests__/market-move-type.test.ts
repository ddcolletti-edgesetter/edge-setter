/**
 * A line move has to say which market it moved in.
 *
 * `live_signals.line_movement` is four numbers and no market word, so every
 * label downstream used to treat the number as a spread on the signal's team —
 * which turned an NFL total into "DAL: +48.5 → +54.5" and an NBA total into
 * "MIL: +225.5 → +228.5". The number was right and the sentence was false.
 *
 * These tests pin the three things that can go wrong again:
 *
 *   1. the RESOLUTION ORDER (a recorded market beats a matched opener beats a
 *      guess from the size of the number),
 *   2. the LABELS (a total has no team and no sign; a spread has both),
 *   3. the OPENER CLAIM (an arrow asserts the move started at the number still
 *      on the board, and is dropped when the games row says otherwise).
 *
 * The board-level cases at the bottom run real prod-shaped rows through
 * `buildBoardSituations` so a regression anywhere in the plumbing — the game
 * openers the pages carry, the signal-to-game match, the row field — fails
 * here and not only in the helper.
 */
import { describe, expect, it } from "vitest";
import {
  gameOpeners,
  parsePipelineMoveSummary,
  resolveMarketMove,
  resolveSignalMarketMove,
} from "@/lib/marketMove";
import { buildBoardSituations } from "@/lib/boardSituations";
import { toSituationRowData, toSituationStoryCardData, type AnyBoardGame } from "@/components/board/boardAdapters";

/* An NFL total move exactly as prod serves it: game DAL/PHI opened 48.5 and
 * sits at 54.5, and the signal's team token is the home side, which is all the
 * odds adapter puts on a TOTAL raw event. */
const NFL_TOTAL = { open: 48.5, current: 54.5, team: "DAL", league: "NFL" } as const;
const NFL_SPREAD = { open: -9.5, current: -3, team: "LAC", league: "NFL" } as const;

describe("resolveMarketMove — resolution order", () => {
  it("takes the market the pipeline recorded over anything it could infer", () => {
    // Everything else in this input argues SPREAD: 6.5 is inside NFL's spread
    // band, and it matches the game's open_spread exactly. The recorded word
    // still wins, because it is evidence and the other two are inference.
    const move = resolveMarketMove({
      open: 6.5,
      current: 9.5,
      team: "DAL",
      league: "NFL",
      marketImpact: ["total moved 3 up"],
      openSpread: 6.5,
      openTotal: 48.5,
    });
    expect(move?.kind).toBe("total");
    expect(move?.basis).toBe("market-impact");
  });

  it("falls to an exact opener match when no market was recorded", () => {
    const move = resolveMarketMove({ ...NFL_TOTAL, openSpread: -3.5, openTotal: 48.5 });
    expect(move?.kind).toBe("total");
    expect(move?.basis).toBe("opener-match");
  });

  it("ignores an opener that matches both markets, because that identifies nothing", () => {
    const move = resolveMarketMove({ open: 44, current: 47, league: "NFL", openSpread: 44, openTotal: 44 });
    expect(move?.basis).toBe("magnitude");
  });

  it("ignores an opener that is merely close — equality or nothing", () => {
    const move = resolveMarketMove({ ...NFL_TOTAL, openSpread: 48, openTotal: 49 });
    expect(move?.basis).toBe("magnitude");
  });

  it("falls to magnitude last, and says so", () => {
    expect(resolveMarketMove(NFL_TOTAL)?.kind).toBe("total");
    expect(resolveMarketMove(NFL_TOTAL)?.basis).toBe("magnitude");
    expect(resolveMarketMove(NFL_SPREAD)?.kind).toBe("spread");
  });

  it("ignores a marketImpact blob that names both markets", () => {
    const move = resolveMarketMove({ ...NFL_TOTAL, marketImpact: ["total moved 3 up", "spread moved 1 down"] });
    expect(move?.basis).not.toBe("market-impact");
  });
});

describe("resolveMarketMove — magnitude is a guess, and knows its limits", () => {
  it("reads a negative number as a spread in every league, whatever its size", () => {
    // CFB's deepest favourite on prod is −58.5, which sits well inside the CFB
    // total range by magnitude alone. A total is a sum of points and is never
    // negative, so the sign settles it before any band is consulted.
    expect(resolveMarketMove({ open: -58.5, current: -54.5, league: "CFB" })?.kind).toBe("spread");
    expect(resolveMarketMove({ open: -225.5, current: -228.5, league: "NBA" })?.kind).toBe("spread");
  });

  it("separates NBA totals from NBA spreads", () => {
    expect(resolveMarketMove({ open: 225.5, current: 228.5, league: "NBA" })?.kind).toBe("total");
    expect(resolveMarketMove({ open: 16.5, current: 18.5, league: "NBA" })?.kind).toBe("spread");
  });

  it("separates CFB totals from CFB positive spreads", () => {
    expect(resolveMarketMove({ open: 36.5, current: 39.5, league: "CFB" })?.kind).toBe("total");
    expect(resolveMarketMove({ open: 10.5, current: 14.5, league: "CFB" })?.kind).toBe("spread");
  });

  it("declines to guess inside MLB's overlap, where neither market is ruled out", () => {
    // MLB run lines reach 2.5 and MLB totals start at 1.5 on prod, so the band
    // between the two bounds belongs to both markets. "unknown" prints the
    // numbers with no market word rather than inventing one.
    const move = resolveMarketMove({ open: 3, current: 3.5, team: "LAD", league: "MLB" });
    expect(move?.kind).toBe("unknown");
    expect(move?.basis).toBe("undecided");
    expect(move?.text).toBe("3 → 3.5");
    expect(move?.text).not.toMatch(/LAD|Total|Spread/);
  });

  it("reads an MLB run line below the overlap as a spread", () => {
    expect(resolveMarketMove({ open: 1.5, current: 2.5, team: "LAD", league: "MLB" })?.kind).toBe("spread");
  });

  it("still reads an MLB total above the overlap, and an MLB negative as a spread", () => {
    expect(resolveMarketMove({ open: 8.5, current: 9.5, league: "MLB" })?.kind).toBe("total");
    expect(resolveMarketMove({ open: -1.5, current: -2.5, league: "MLB" })?.kind).toBe("spread");
  });

  it("declines to guess for a league it has no band for", () => {
    expect(resolveMarketMove({ open: 44, current: 47, league: "NHL" })?.kind).toBe("unknown");
    expect(resolveMarketMove({ open: 44, current: 47 })?.kind).toBe("unknown");
  });
});

describe("resolveMarketMove — the printed label", () => {
  it("prints a total with no team name and no plus sign", () => {
    const move = resolveMarketMove(NFL_TOTAL);
    expect(move?.text).toBe("Total 48.5 → 54.5");
    expect(move?.text).not.toContain("DAL");
    expect(move?.text).not.toContain("+");
  });

  it("prints a spread with its team and its side", () => {
    expect(resolveMarketMove(NFL_SPREAD)?.text).toBe("LAC −9.5 → −3");
    expect(resolveMarketMove({ open: 10.5, current: 14.5, team: "GAM", league: "CFB" })?.text)
      .toBe("GAM +10.5 → +14.5");
  });

  it("uses a real minus sign, not a hyphen, for a negative number", () => {
    expect(resolveMarketMove(NFL_SPREAD)?.text).toContain("−");
    expect(resolveMarketMove(NFL_SPREAD)?.text).not.toContain("-");
  });

  it("says Spread when a spread move carries no team token", () => {
    expect(resolveMarketMove({ open: -3.5, current: -4.5, league: "NFL" })?.text).toBe("Spread −3.5 → −4.5");
  });

  it("drops a trailing .0 rather than printing it", () => {
    expect(resolveMarketMove({ open: 48, current: 54, league: "NFL" })?.text).toBe("Total 48 → 54");
  });
});

describe("resolveMarketMove — the 'from the opener' claim", () => {
  it("keeps the arrow when the games row still opens at the move's open", () => {
    const move = resolveMarketMove({ ...NFL_TOTAL, openTotal: 48.5 });
    expect(move?.fromOpener).toBe(true);
    expect(move?.text).toBe("Total 48.5 → 54.5");
  });

  it("drops the arrow when the games row has since opened somewhere else", () => {
    // What #103's re-baselining did to 122 of 124 future NFL games: the stored
    // signal still records an August futures price as its open. 48.5 is no
    // longer the opener, so the move may not be described as running from it.
    const move = resolveMarketMove({ ...NFL_TOTAL, openTotal: 51.5 });
    expect(move?.fromOpener).toBe(false);
    expect(move?.text).toBe("Total now 54.5");
    expect(move?.text).not.toContain("48.5");
    expect(move?.text).not.toContain("→");
  });

  it("drops the arrow on a spread the same way, keeping the team and the side", () => {
    const move = resolveMarketMove({ ...NFL_SPREAD, openSpread: -7.5 });
    expect(move?.fromOpener).toBe(false);
    expect(move?.text).toBe("LAC −3 now");
  });

  it("keeps the arrow when we hold no opener at all — absence is not a contradiction", () => {
    expect(resolveMarketMove(NFL_TOTAL)?.fromOpener).toBe(true);
    expect(resolveMarketMove({ ...NFL_TOTAL, openTotal: null, openSpread: null })?.fromOpener).toBe(true);
  });

  it("checks the claim against the opener for the market it resolved, not the other one", () => {
    // Resolved TOTAL. open_spread disagreeing with 48.5 is irrelevant; only
    // open_total can contradict a total's opener.
    const move = resolveMarketMove({ ...NFL_TOTAL, openSpread: -3.5, openTotal: 48.5 });
    expect(move?.fromOpener).toBe(true);
  });
});

describe("resolveMarketMove — nothing to describe", () => {
  it("returns nothing without two numbers", () => {
    expect(resolveMarketMove({ open: null, current: 54.5, league: "NFL" })).toBeUndefined();
    expect(resolveMarketMove({ open: 48.5, current: undefined, league: "NFL" })).toBeUndefined();
    expect(resolveMarketMove({ open: "", current: "", league: "NFL" })).toBeUndefined();
  });

  it("returns nothing for an opening-line row, where the two prices are the same", () => {
    expect(resolveMarketMove({ open: 48.5, current: 48.5, league: "NFL" })).toBeUndefined();
  });

  it("reads the numbers out of strings, which is how the adapters carry them", () => {
    expect(resolveSignalMarketMove({ team: "DAL", lineMovement: { open: "48.5", current: "54.5" } }, { league: "NFL" })?.text)
      .toBe("Total 48.5 → 54.5");
  });

  it("returns nothing for a signal with no movement", () => {
    expect(resolveSignalMarketMove({ team: "DAL", lineMovement: null }, { league: "NFL" })).toBeUndefined();
    expect(resolveSignalMarketMove(undefined, { league: "NFL" })).toBeUndefined();
  });
});

describe("gameOpeners", () => {
  it("reads either spelling the games row arrives in", () => {
    expect(gameOpeners({ open_spread: -3.5, open_total: 48.5 })).toEqual({ openSpread: -3.5, openTotal: 48.5 });
    expect(gameOpeners({ openSpread: "-3.5", openTotal: "48.5" })).toEqual({ openSpread: -3.5, openTotal: 48.5 });
  });

  it("gives null, not zero, for a row with no opener", () => {
    expect(gameOpeners({})).toEqual({ openSpread: null, openTotal: null });
    expect(gameOpeners(undefined)).toEqual({ openSpread: null, openTotal: null });
  });
});

describe("parsePipelineMoveSummary", () => {
  it("reads the one template the pipeline writes", () => {
    expect(parsePipelineMoveSummary("MIL: +225.5 → +228.5 — market movement"))
      .toEqual({ team: "MIL", open: 225.5, current: 228.5 });
    expect(parsePipelineMoveSummary("LAC: -9.5 → -3 — market movement"))
      .toEqual({ team: "LAC", open: -9.5, current: -3 });
  });

  it("refuses anything that is not that template", () => {
    expect(parsePipelineMoveSummary("Kyle Isbel injury")).toBeUndefined();
    expect(parsePipelineMoveSummary("Line moved 6.0 points up from open.")).toBeUndefined();
    expect(parsePipelineMoveSummary("225.5 to 228.5")).toBeUndefined();
    expect(parsePipelineMoveSummary(null)).toBeUndefined();
  });
});

/* ── Board level ─────────────────────────────────────────────────────────────
 *
 * The same prod shapes the boards actually receive, through the real builder,
 * so the openers the four board pages now carry and the signal-to-game match
 * are both covered rather than assumed.
 */

const NFL_TOTAL_SIGNAL = {
  id: "sig-total",
  type: "line_move",
  team: "DAL",
  opponent: "PHI",
  headline: "DAL: +48.5 → +54.5 — market movement",
  detail: "Line moved 6.0 points up from open.",
  matchup: "DAL @ PHI",
  confidence: 90,
  verdict: "likely",
  source_count: 1,
  lineMovement: { open: "48.5", current: "54.5", note: "Moved 6 pts" },
  timestamp: "2h ago",
  isoTimestamp: new Date().toISOString(),
};

function nflGame(openers: Partial<AnyBoardGame>): AnyBoardGame {
  return {
    id: "NFL_2026_11_22_DAL_PHI",
    awayTeam: "DAL",
    homeTeam: "PHI",
    statusDescription: "Scheduled",
    gameDate: new Date(Date.now() + 86_400_000),
    ...openers,
  };
}

function storyFor(games: AnyBoardGame[]) {
  const situations = buildBoardSituations({
    league: "NFL",
    games: games as never[],
    signals: [NFL_TOTAL_SIGNAL] as never[],
  });
  const signalRow = situations.find((s) => s.kind === "signal")!;
  const row = toSituationRowData(signalRow);
  return { row, story: toSituationStoryCardData(row, games) };
}

describe("board rows — a total is never printed as its team's spread", () => {
  it("names the market and drops the team on a total", () => {
    const { row, story } = storyFor([nflGame({ openSpread: -3.5, openTotal: 48.5 })]);
    expect(row.marketMove?.kind).toBe("total");
    expect(story.whatHappened).toContain("Total 48.5 → 54.5");
    expect(story.whatHappened).not.toContain("DAL: +48.5");
    expect(story.market).toContain("Total 48.5 → 54.5");
  });

  it("drops the opener claim when the game has re-opened elsewhere", () => {
    const { row, story } = storyFor([nflGame({ openSpread: -3.5, openTotal: 51.5 })]);
    expect(row.marketMove?.fromOpener).toBe(false);
    expect(story.whatHappened).toContain("Total now 54.5");
    expect(story.whatHappened).not.toContain("48.5");
  });

  it("still resolves the market when the signal matched no game at all", () => {
    const { row, story } = storyFor([]);
    expect(row.marketMove?.kind).toBe("total");
    expect(row.marketMove?.basis).toBe("magnitude");
    expect(story.whatHappened).toContain("Total 48.5 → 54.5");
  });

  it("does not print the move twice — the deck drops it, the lead keeps it", () => {
    const { story } = storyFor([nflGame({ openTotal: 48.5 })]);
    expect(story.whatHappened).toContain("Total 48.5 → 54.5");
    expect(story.dek ?? "").not.toMatch(/48\.5/);
  });

  it("prints the move as the whole 'What happened' sentence", () => {
    const { story } = storyFor([nflGame({ openTotal: 48.5 })]);
    expect(story.headline).toBeTruthy();
    expect(story.whatHappened).toBe("Total 48.5 → 54.5.");
  });

  it("leaves a story with no market move untouched", () => {
    const injury = {
      ...NFL_TOTAL_SIGNAL,
      id: "sig-injury",
      type: "injury",
      player: "CeeDee Lamb",
      headline: "CeeDee Lamb (DAL) listed with an ankle injury",
      detail: "Lamb was limited in practice.",
      lineMovement: null,
    };
    const situations = buildBoardSituations({ league: "NFL", games: [], signals: [injury] as never[] });
    const row = toSituationRowData(situations.find((s) => s.kind === "signal")!);
    expect(row.marketMove).toBeUndefined();
    expect(toSituationStoryCardData(row, []).whatHappened).not.toMatch(/Total|Spread/);
  });
});
