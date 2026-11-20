/**
 * Eight things the boards printed that the rows did not support, each pinned
 * with the prod count it was running at (four boards, captured 2026-11-20):
 *
 *   1. Stories about a game that was already final or under way (NBA: 1 final,
 *      2 tipped off; NFL: Thursday's HOU–IND, final).
 *   2. "Why it matters" built from the engine's fixed confidence reasons —
 *      "Independent confirmations show convergence beyond a single source" on
 *      73 cards. Every Why-it-matters line on all four boards (208) was one of
 *      eight fixed sentences.
 *   3. "The market moved before the full lineup, pitching, injury, or weather
 *      picture was clear." after every market move's numbers. 148 cards.
 *   4. "<player> is a confirmed scratch — direct market impact expected." in
 *      Why it matters AND the Evidence tile (5 cards), and a "Verified" stage
 *      label on 68 single-source cards.
 *   5. "Detected 206h before national pickup", "Strong support within 312h",
 *      and a card titled only "operator note".
 *   6. The same game's same market as two to five cards, the lead among them
 *      (57 extra cards), and a lead that printed its own headline three times.
 *   7. Signal headlines in tokens ("DAL-TEN total moves …") when the signal's
 *      own game_id names a games row that stores both teams' names.
 *   8. "medium medium", "Developing Developing" and "Priority 100" on the
 *      Stories to Watch strip.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { buildBoardSituations, type BoardGameInput, type BoardSituation } from "@/lib/boardSituations";
import { collapseMarketTwins, dropStoriesNoLongerLive } from "@/lib/boardStoryGame";
import { canonicalSituationToBoardSituation, computeDetectionLeadDisplay } from "@/lib/situationAdapters";
import type { CanonicalSituation } from "@/lib/situationsApi";
import {
  featuredCopy,
  toSituationRowData,
  toSituationStoryCardData,
  withoutTemplateSentences,
} from "@/components/board/boardAdapters";
import { SituationRow } from "@/components/board/SituationRow";
import { SituationStoryCard } from "@/components/board/SituationStoryCard";
import { FeaturedSituation } from "@/components/board/FeaturedSituation";

const NOW = Date.parse("2026-11-20T09:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const hoursAhead = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

const sourceOf = (...parts: string[]) =>
  fs.readFileSync(path.join(process.cwd(), "client", "src", ...parts), "utf8");
/** Code only: the comments that explain a deletion quote the deleted copy. */
const codeOf = (...parts: string[]) =>
  sourceOf(...parts).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[^\n"'`]*\/\/.*$/gm, " ");

/* ── Fixtures, prod-shaped ───────────────────────────────────────────────── */

function game(overrides: Partial<BoardGameInput> & { id: string }): BoardGameInput {
  return {
    away_team: "TEN",
    home_team: "DAL",
    away_team_name: "Tennessee Titans",
    home_team_name: "Dallas Cowboys",
    game_time: hoursAhead(48),
    status: "scheduled",
    ...overrides,
  };
}

function totalMove(overrides: Record<string, unknown> = {}) {
  return {
    id: "sig-total",
    type: "line_move",
    team: "DAL",
    opponent: "TEN",
    headline: "DAL: +51.5 → +54.5 — market movement",
    detail: "Line moved 3.0 points up from open.",
    why_it_matters: "Market movement may be reacting to new sports context before full public confirmation.",
    verdict: "likely",
    confidence: 90,
    source_count: 1,
    lineMovement: { open: "51.5", current: "54.5", note: "Moved +3 pts" },
    timestamp: "4h ago",
    isoTimestamp: hoursAgo(4),
    ...overrides,
  };
}

function canonical(overrides: Partial<CanonicalSituation> = {}): CanonicalSituation {
  return {
    id: "sit-1",
    title: "DAL / TEN market",
    summary: "DAL: +51.5 → +54.5 — market movement",
    sport: "football",
    league: "NFL",
    teams: ["DAL", "TEN"],
    players: [],
    situationType: "market",
    lifecycleState: "developing",
    lifecycleExplanation: "",
    confidence: 60,
    confidenceLabel: "medium",
    confidenceFactors: {
      scores: { source_reliability: 18, independent_confirmations: 18, market_alignment: 14, validator_agreement: 7, official_confirmation: 0, freshness: 10, contradiction_penalty: 0 },
      whyConfidenceIncreased: [],
      whyConfidenceDecreased: [],
      evidenceThatMattersMost: [],
      whatRemainsUncertain: [],
    },
    severity: "medium",
    escalationScore: 70,
    timingPressure: "medium",
    operationalVisibilityScore: 100,
    lastUpdatedAt: hoursAgo(4),
    firstSeenAt: hoursAgo(100),
    evidenceCount: 14,
    sourceCount: 2,
    latestEvidence: [
      { eventType: "line_move", sourceType: "api", timestamp: hoursAgo(4), confidenceDelta: null, marketImpact: "total moved 3 up", validatorAgreement: null, summary: "DAL: +51.5 → +54.5 — market movement", replayHash: "h1" },
    ],
    stateHistoryPreview: [],
    confidenceHistoryPreview: [
      { previousConfidence: 64, newConfidence: 60, delta: -4, reasons: ["Independent confirmations show convergence beyond a single source"], timestamp: hoursAgo(4), replayHash: "c1" },
    ],
    replayHash: "r1",
    ...overrides,
  } as CanonicalSituation;
}

const signalRows = (signals: object[], allGames: BoardGameInput[] = [], league: "NFL" | "CFB" | "NBA" = "NFL") =>
  buildBoardSituations({ league, games: [], signals: signals as never[], allGames }).filter((s) => s.kind === "signal");

const storyOf = (situation: BoardSituation) => toSituationStoryCardData(toSituationRowData(situation), []);

/* ── 1. stories whose game is over ───────────────────────────────────────── */

describe("1. a story leaves the board once its game is over", () => {
  const live = (situations: BoardSituation[], games: BoardGameInput[], kickoffTrusted: boolean) =>
    dropStoriesNoLongerLive(situations, games, { kickoffTrusted, now: NOW }).map((s) => s.id);

  it("drops a signal whose own game_id names a final game, in every league", () => {
    const games = [game({ id: "G1", status: "final", game_time: hoursAgo(20) })];
    const rows = signalRows([totalMove({ gameId: "G1" })], games);
    expect(live(rows, games, false)).toEqual([]);
    expect(live(rows, games, true)).toEqual([]);
  });

  it("drops a started game only where the kickoff is trusted", () => {
    const games = [game({ id: "G1", status: "scheduled", game_time: hoursAgo(1) })];
    const rows = signalRows([totalMove({ gameId: "G1" })], games);
    expect(live(rows, games, true)).toEqual([]);
    expect(live(rows, games, false)).toEqual(["signal-sig-total"]);
  });

  it("keeps a story whose game has not started", () => {
    const games = [game({ id: "G1" })];
    expect(live(signalRows([totalMove({ gameId: "G1" })], games), games, true)).toEqual(["signal-sig-total"]);
  });

  it("matches a canonical situation to the NEXT meeting of a pair that plays twice", () => {
    const games = [
      game({ id: "SEPT", status: "final", game_time: "2026-09-27T17:00:00Z" }),
      game({ id: "NOV", game_time: hoursAhead(72) }),
    ];
    const updatedToday = canonicalSituationToBoardSituation(canonical({ lastUpdatedAt: hoursAgo(4), firstSeenAt: "2026-09-20T00:00:00Z" }));
    const updatedInSeptember = canonicalSituationToBoardSituation(canonical({ id: "sit-old", lastUpdatedAt: "2026-09-26T00:00:00Z" }));
    expect(live([updatedToday, updatedInSeptember], games, true)).toEqual([updatedToday.id]);
  });

  it("leaves game rows alone, and keeps a story it cannot place", () => {
    const situations = buildBoardSituations({ league: "NFL", games: [game({ id: "G1", status: "final", game_time: hoursAgo(20) })] as never[], signals: [] });
    const unplaced = signalRows([totalMove({ opponent: undefined, team: "DAL" })]);
    expect(live([...situations, ...unplaced], [game({ id: "G1", status: "final", game_time: hoursAgo(20) })], true)).toHaveLength(situations.length + unplaced.length);
  });

  it("is applied on all four boards, against the unwindowed games table", () => {
    for (const page of ["CFBBoard.tsx", "NFLBoard.tsx", "NBABoard.tsx", "MLBBoard.tsx"]) {
      const code = codeOf("pages", page);
      expect(code).toContain("dropStoriesNoLongerLive(");
      expect(code).toContain("setAllGames(payload.games ?? [])");
      expect(code).toMatch(/allGames,\r?\n\s*\}\);/);
    }
  });
});

/* ── 2. Why it matters ───────────────────────────────────────────────────── */

describe("2. 'Why it matters' only with story-specific content", () => {
  it("drops the engine's convergence sentence, and with it the tile", () => {
    expect(withoutTemplateSentences("Independent confirmations show convergence beyond a single source")).toBeUndefined();
    expect(storyOf(canonicalSituationToBoardSituation(canonical())).whyItMatters).toBeUndefined();
  });

  it("drops every fixed engine reason, in the rewritten spelling too", () => {
    for (const reason of [
      "Official confirmation materially supports the situation",
      "official update materially supports the situation",
      "Market movement aligns with the reported development",
      "market reaction may be reacting to new sports context before public confirmation.",
      "Ja'Marr Chase's status is uncertain; wait for a final designation before committing.",
    ]) {
      expect(withoutTemplateSentences(reason), reason).toBeUndefined();
    }
  });

  it("keeps a reason that is about the story", () => {
    const own = "The coordinator said the starter will be a game-time decision.";
    const situation = canonicalSituationToBoardSituation(canonical({
      confidenceHistoryPreview: [{ previousConfidence: 60, newConfidence: 64, delta: 4, reasons: ["Independent confirmations show convergence beyond a single source", own], timestamp: hoursAgo(1), replayHash: "c" }],
    }));
    expect(storyOf(situation).whyItMatters).toBe(own);
  });

  it("gives the lead block no engine-state 'Why it matters' and no template summary", () => {
    const lead = featuredCopy(signalRows([totalMove()])[0], "NBA");
    expect(lead.secondaryRead).toBeUndefined();
    expect(lead.summary ?? "").not.toMatch(/may be reacting to new sports context/i);
    expect(featuredCopy(canonicalSituationToBoardSituation(canonical()), "CFB").secondaryRead).toBeUndefined();
  });

  it("no longer falls back to the evidence summary or an event count", () => {
    const code = codeOf("components", "board", "boardAdapters.ts");
    expect(code).not.toContain("evidence events attached");
  });
});

/* ── 3. the trailing market sentence ─────────────────────────────────────── */

describe("3. 'What happened' on a market move is the number sentence alone", () => {
  it("prints the move and nothing after it", () => {
    const games = [game({ id: "G1", open_total: 51.5 } as never)];
    const story = storyOf(signalRows([totalMove({ gameId: "G1" })], games)[0]);
    expect(story.whatHappened).toBe("Total 51.5 → 54.5.");
  });

  it("is gone from the code in both its league spellings", () => {
    const code = codeOf("components", "board", "boardAdapters.ts");
    expect(code).not.toContain("market moved before the full");
    expect(code).not.toContain("pre-tip market moved");
  });
});

/* ── 4. confirmed scratch, and VERIFIED on one source ────────────────────── */

describe("4. no 'confirmed scratch' claim, and no VERIFIED on a single source", () => {
  const scratch = {
    id: "sig-out",
    type: "injury",
    team: "NYJ",
    opponent: "LAC",
    player: "Zachariah Branch",
    headline: "Zachariah Branch (Hamstring) — OUT",
    detail: "Branch is out for Sunday.",
    why_it_matters: "Zachariah Branch is a confirmed scratch — direct market impact expected.",
    verdict: "confirmed",
    confidence: 88,
    source_count: 1,
    injuryDesignation: "OUT",
    isoTimestamp: hoursAgo(2),
  };

  it("keeps the sentence out of Why it matters and the Evidence tile", () => {
    const story = storyOf(signalRows([scratch])[0]);
    expect(story.whyItMatters ?? "").not.toMatch(/confirmed scratch/i);
    expect(story.evidence ?? "").not.toMatch(/confirmed scratch/i);
  });

  const cardText = (sourceCount: number) => {
    const row = { ...toSituationRowData(canonicalSituationToBoardSituation(canonical({ lifecycleState: "confirmed", sourceCount }))), escalationState: "verified" as const, lifecycleVisualState: "verified" as const };
    const { container } = render(React.createElement(SituationStoryCard, { story: toSituationStoryCardData(row, []) }));
    const text = container.textContent ?? "";
    cleanup();
    return text;
  };

  it("withholds the VERIFIED pill and the 'Verified' stage on one source", () => {
    const text = cardText(1);
    expect(text).not.toContain("VERIFIED");
    expect(text).not.toContain("Verified");
  });

  it("keeps both on two sources", () => {
    const text = cardText(2);
    expect(text).toContain("VERIFIED");
    expect(text).toContain("Verified");
  });
});

/* ── 5. operator notes and long durations ────────────────────────────────── */

describe("5. no week-long 'before pickup' or 'within' durations, and no untitled notes", () => {
  const withPickupAfter = (hours: number) => canonical({
    situationType: "operator_note",
    lifecycleState: "developing",
    firstSeenAt: hoursAgo(hours + 1),
    latestEvidence: [{ eventType: "rss_item", sourceType: "rss", timestamp: hoursAgo(1), confidenceDelta: null, marketImpact: null, validatorAgreement: null, summary: "", replayHash: "e" }],
  });

  it("hides a national-pickup lead over 48h and keeps a shorter one", () => {
    expect(computeDetectionLeadDisplay(withPickupAfter(206))).toBeUndefined();
    expect(computeDetectionLeadDisplay(withPickupAfter(30))).toEqual({ lead: "30h", kind: "pickup" });
  });

  const journey = (hours: number) => canonicalSituationToBoardSituation(canonical({
    firstSeenAt: hoursAgo(hours + 1),
    confidenceHistoryPreview: [{ previousConfidence: 60, newConfidence: 82, delta: 22, reasons: [], timestamp: hoursAgo(1), replayHash: "c" }],
  })).confidenceJourney;

  it("hides a 'within' duration over 72h and keeps a shorter one", () => {
    expect(journey(312)).toBeUndefined();
    expect(journey(20)).toMatch(/within 20h$/);
  });

  it("drops a card titled only 'operator note'", () => {
    const note = canonicalSituationToBoardSituation(canonical({ id: "sit-note", title: "operator note", teams: [], situationType: "operator_note" }));
    const named = canonicalSituationToBoardSituation(canonical({ id: "sit-named", title: "SEA operator note", teams: ["SEA"], situationType: "operator_note" }));
    expect(dropStoriesNoLongerLive([note, named], [], { kickoffTrusted: true, now: NOW }).map((s) => s.id)).toEqual([named.id]);
  });
});

/* ── 6. one story, one card ──────────────────────────────────────────────── */

describe("6. one card per game and market", () => {
  const games = [game({ id: "G1" })];

  it("collapses a signal into its canonical twin when both changed together, and the twin keeps the game", () => {
    const signal = signalRows([totalMove({ gameId: "G1" })], games)[0];
    const twin = canonicalSituationToBoardSituation(canonical());
    const out = collapseMarketTwins([twin, signal]);
    expect(out.map((s) => s.id)).toEqual([twin.id]);
    expect((out[0].game as BoardGameInput).id).toBe("G1");
  });

  it("keeps the fresher card when the canonical twin is days stale", () => {
    const signal = signalRows([totalMove({ gameId: "G1" })], games)[0];
    const stale = canonicalSituationToBoardSituation(canonical({ lastUpdatedAt: hoursAgo(100) }));
    expect(collapseMarketTwins([stale, signal]).map((s) => s.id)).toEqual([signal.id]);
  });

  it("never collapses a spread into a total", () => {
    const total = signalRows([totalMove({ gameId: "G1" })], games)[0];
    const spread = signalRows([totalMove({ id: "sig-spread", headline: "DAL: -3.5 → -5.5 — market movement", lineMovement: { open: "-3.5", current: "-5.5", note: "Moved -2 pts" }, gameId: "G1" })], games)[0];
    expect(total.marketMove?.kind).toBe("total");
    expect(spread.marketMove?.kind).toBe("spread");
    expect(collapseMarketTwins([total, spread])).toHaveLength(2);
  });

  it("prints the lead's headline once", () => {
    const row = toSituationRowData(signalRows([totalMove({ gameId: "G1" })], games)[0]);
    const story = toSituationStoryCardData(row, []);
    expect(story.relatedItems?.some((item) => item.includes(story.headline))).toBe(false);
    const { container } = render(React.createElement(FeaturedSituation, { situation: row, presentation: "story", league: "NFL" }));
    expect((container.textContent ?? "").split(story.headline).length - 1).toBe(1);
    cleanup();
  });
});

/* ── 7. team names through the signal's own game ─────────────────────────── */

describe("7. a signal's headline names both teams from its own games row", () => {
  it("reads 'away at home' with the names the games row stored", () => {
    const games = [game({ id: "G1", open_total: 51.5 } as never)];
    expect(storyOf(signalRows([totalMove({ gameId: "G1" })], games)[0]).headline)
      .toBe("Tennessee Titans at Dallas Cowboys total moves 51.5 → 54.5");
  });

  it("keeps the tokens when the signal has no game_id", () => {
    expect(storyOf(signalRows([totalMove()])[0]).headline).toMatch(/^DAL-TEN total/);
  });

  it("keeps the tokens when the games row stored no names", () => {
    const games = [game({ id: "G1", away_team_name: null, home_team_name: null })];
    expect(storyOf(signalRows([totalMove({ gameId: "G1" })], games)[0]).headline).toMatch(/^(DAL-TEN|TEN-DAL) total/);
  });

  it("carries game_id through every signal adapter", () => {
    const code = codeOf("lib", "signalsApi.ts");
    expect(code.match(/gameId:\s+ls\.game_id \?\? undefined/g)).toHaveLength(3);
  });
});

/* ── 8. the Stories to Watch strip ───────────────────────────────────────── */

describe("8. the strip says each chip once and prints no priority score", () => {
  it("drops the duplicate chips and the Priority label", () => {
    const row = toSituationRowData(canonicalSituationToBoardSituation(canonical()));
    const { container } = render(React.createElement(SituationRow, { situation: row, compact: true, copyVariant: "editorial" }));
    const leaves = Array.from(container.querySelectorAll("span"))
      .filter((el) => el.children.length === 0)
      .map((el) => (el.textContent ?? "").trim())
      .filter(Boolean);
    const text = container.textContent ?? "";
    const badges = Array.from(container.querySelectorAll(".uppercase")).map((el) => (el.textContent ?? "").trim());
    cleanup();
    expect(text).not.toMatch(/Priority \d+/);
    expect(leaves.filter((chip) => chip.toLowerCase() === "medium")).toHaveLength(1);
    expect(badges.filter((badge) => badge === "Developing")).toHaveLength(1);
  });
});
