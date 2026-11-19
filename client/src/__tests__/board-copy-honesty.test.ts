/**
 * Four claims the board made that nothing on the row supported.
 *
 * Each group below pins one of them, with the prod count it was running at on
 * 2026-11-19 (the four boards, 610 rows: 100 signals + 100 canonical
 * situations + the full slate per league).
 *
 *   1. A headline asserting a CAUSE — "<matchup> line movement follows late
 *      availability context" — on every market row in the league. 294 rows.
 *   2. A "why it matters" tile picked by keyword and written per league, so
 *      every CFB availability story said the same thing about depth charts.
 *      508 rows.
 *   3. A "Watch next" tile printing one of three sentences about the ENGINE's
 *      state. 400 rows.
 *   4. "ES Agents verified" (37 rows, 36 of them single-source), a "Confirmed"
 *      lifecycle chip on one source (36 rows), and "1 source check /
 *      corroborated" (177 rows) — three spellings of a corroboration claim
 *      with nothing corroborating it.
 *
 * Plus the two board status chips that read "Verified sources" whenever the
 * canonical endpoint returned a non-empty list.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  isGenericUncertaintyLine,
  publicLifecycleLabel,
  verifiedClaimIsBacked,
} from "@/lib/storyLanguage";
import { signalTrustLabel, signalTimingAdvantage } from "@/lib/signalBoardUx";
import { buildBoardSituations } from "@/lib/boardSituations";
import { toSituationRowData, toSituationStoryCardData, type AnyBoardGame } from "@/components/board/boardAdapters";
import type { SituationRowData } from "@/components/board/SituationRow";

const sourceOf = (...parts: string[]) =>
  fs.readFileSync(path.join(process.cwd(), "client", "src", ...parts), "utf8");

/**
 * The file with its comments removed.
 *
 * The comments where these strings were deleted QUOTE the deleted copy, which
 * is the point of them — a reader has to be able to see what used to print
 * here and why it stopped. A plain grep cannot tell a quotation from live code,
 * so the assertions below run against the code alone.
 */
function codeOf(...parts: string[]) {
  return sourceOf(...parts)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[^\n"'`]*\/\/.*$/gm, " ");
}

/* ── Fixtures, prod-shaped ───────────────────────────────────────────────── */

/** The pipeline marks an injury confirmed as soon as it has a designation. */
const SINGLE_SOURCE_OUT = {
  id: "sig-out",
  type: "injury",
  team: "NYJ",
  player: "Zachariah Branch",
  headline: "Zachariah Branch (Hamstring) — OUT",
  detail: "Branch is out for Sunday.",
  matchup: "NYJ @ LAC",
  verdict: "confirmed",
  confidence: 88,
  source_count: 1,
  sourceLabels: ["Beat Reporter"],
  sourceTypes: ["wire"],
  confirmationStrength: "Corroborated",
  injuryDesignation: "OUT",
  action_takeaway: "Monitor the depth chart.",
  timestamp: "2h ago",
  isoTimestamp: new Date().toISOString(),
};

const TWO_SOURCE_OUT = {
  ...SINGLE_SOURCE_OUT,
  id: "sig-out-2",
  source_count: 2,
  sourceLabels: ["Beat Reporter", "Second Beat"],
};

const OFFICIAL_SOURCE_OUT = {
  ...SINGLE_SOURCE_OUT,
  id: "sig-out-official",
  sourceLabels: ["NFL Injury Report"],
  sourceTypes: ["injury report"],
};

const TOTAL_MOVE = {
  id: "sig-move",
  type: "line_move",
  team: "DAL",
  opponent: "TEN",
  headline: "DAL: +48.5 → +54.5 — market movement",
  detail: "Line moved 6.0 points up from open.",
  matchup: "DAL @ TEN",
  verdict: "likely",
  confidence: 90,
  source_count: 1,
  lineMovement: { open: "48.5", current: "54.5", note: "Moved 6 pts" },
  timestamp: "1h ago",
  isoTimestamp: new Date().toISOString(),
};

function rowFor(signal: object, games: AnyBoardGame[] = []) {
  const situations = buildBoardSituations({
    league: "NFL",
    games: games as never[],
    signals: [signal] as never[],
  });
  const row = toSituationRowData(situations.find((s) => s.kind === "signal")!);
  return { row, story: toSituationStoryCardData(row, games) };
}

/** A hand-built row, for the copy paths that take one directly. */
function bareRow(overrides: Partial<SituationRowData> = {}): SituationRowData {
  return {
    id: "row-1",
    kind: "canonical",
    title: "Kyle Isbel injury",
    league: "NFL",
    sourceCount: 2,
    ...overrides,
  };
}

/* ── 1. The asserted cause in the market headline ────────────────────────── */

describe("the market headline no longer asserts a cause", () => {
  it("is gone from the source entirely", () => {
    const src = codeOf("components", "board", "boardAdapters.ts");
    expect(src).not.toContain("line movement follows late");
  });

  it("states the move instead", () => {
    const { story } = rowFor(TOTAL_MOVE);
    expect(story.headline).toBe("DAL-TEN total moves 48.5 → 54.5");
    expect(story.headline).not.toMatch(/availability|roster/i);
  });

  it("names the market, not the team's spread", () => {
    const { story } = rowFor(TOTAL_MOVE);
    expect(story.headline).not.toContain("+48.5");
    expect(story.headline).toContain("total");
  });

  it("drops the opener claim in the headline too when the game re-opened", () => {
    const game: AnyBoardGame = {
      id: "g1", awayTeam: "DAL", homeTeam: "TEN",
      statusDescription: "Scheduled", gameDate: new Date(Date.now() + 86_400_000),
      openTotal: 51.5,
    };
    const { story } = rowFor(TOTAL_MOVE, [game]);
    expect(story.headline).toBe("DAL-TEN total now 54.5");
    expect(story.headline).not.toContain("48.5");
  });

  it("still produces a headline for a market row with no resolvable move", () => {
    const { story } = rowFor({ ...TOTAL_MOVE, lineMovement: null, headline: "DAL market reacting" });
    expect(story.headline).toBeTruthy();
    expect(story.headline).not.toMatch(/line movement follows late/i);
  });
});

/* ── 2. The per-league "why it matters" templates ─────────────────────────── */

describe("why it matters carries the row's own evidence or nothing", () => {
  it("the league templates are gone from the source", () => {
    const src = codeOf("components", "board", "boardAdapters.ts");
    expect(src).not.toContain("can point to lineup, pitcher, injury");
    expect(src).not.toContain("can point to starter, rotation, late-scratch");
    expect(src).not.toContain("Availability changes can shift");
  });

  it("passes the row's evidence growth through", () => {
    const story = toSituationStoryCardData(bareRow({ evidenceGrowthLabel: "A second beat report attached" }));
    expect(story.whyItMatters).toContain("second beat report");
  });

  it("omits the tile when the row has no evidence growth of its own", () => {
    expect(toSituationStoryCardData(bareRow()).whyItMatters).toBeUndefined();
  });

  it("does not reach for a league sentence on an injury row", () => {
    const { story } = rowFor(SINGLE_SOURCE_OUT);
    expect(story.whyItMatters ?? "").not.toMatch(/depth charts, snap share|rotations, usage/i);
  });
});

/* ── 3. The three engine-state "Watch next" sentences ────────────────────── */

describe("the three engine-state uncertainty sentences", () => {
  const THREE = [
    "Independent confirmation is still limited.",
    "Validator agreement is not yet strong enough to close the loop.",
    "Remaining uncertainty is low relative to the current evidence.",
  ];

  it.each(THREE)("%s is recognised as generic", (line) => {
    expect(isGenericUncertaintyLine(line)).toBe(true);
  });

  it.each(THREE)("%s never reaches the Watch next tile", (line) => {
    const story = toSituationStoryCardData(bareRow({ uncertaintyLabel: line }));
    expect(story.watchNext ?? "").not.toContain(line.slice(0, 24));
  });

  it("falls through to the row's timing stage instead of printing nothing at all", () => {
    const story = toSituationStoryCardData(bareRow({
      uncertaintyLabel: THREE[0],
      timingStageLabel: "early signal",
    }));
    expect(story.watchNext).toBe("early signal");
  });

  it("keeps an uncertainty line that is actually about the story", () => {
    const story = toSituationStoryCardData(bareRow({
      uncertaintyLabel: "The team has not said whether he travels.",
    }));
    expect(story.watchNext).toContain("whether he travels");
  });

  it("does not treat an empty or absent line as generic", () => {
    expect(isGenericUncertaintyLine(undefined)).toBe(false);
    expect(isGenericUncertaintyLine("")).toBe(false);
    expect(isGenericUncertaintyLine("   ")).toBe(false);
  });

  it("SituationRow's own Watch next line routes through the same predicate", () => {
    // Both surfaces print a tile labelled "Watch next"; a fix in one only
    // moves the sentence to the other.
    const src = sourceOf("components", "board", "SituationRow.tsx");
    expect(src).toContain("isGenericUncertaintyLine(situation.uncertaintyLabel)");
  });
});

/* ── 4. Corroboration claims with nothing corroborating them ──────────────── */

describe("verifiedClaimIsBacked", () => {
  it("is earned by two or more sources", () => {
    expect(verifiedClaimIsBacked({ sourceCount: 2 })).toBe(true);
    expect(verifiedClaimIsBacked({ sourceCount: 7 })).toBe(true);
  });

  it("is earned by an official source on its own", () => {
    expect(verifiedClaimIsBacked({ sourceCount: 1, officialSource: true })).toBe(true);
  });

  it("is not earned by one wire", () => {
    expect(verifiedClaimIsBacked({ sourceCount: 1 })).toBe(false);
    expect(verifiedClaimIsBacked({ sourceCount: 0 })).toBe(false);
    expect(verifiedClaimIsBacked({})).toBe(false);
  });

  it("leaves a caller that passes no context alone", () => {
    expect(verifiedClaimIsBacked()).toBe(true);
    expect(verifiedClaimIsBacked(null)).toBe(true);
  });
});

describe("the timing stage stops claiming verification it does not have", () => {
  it("says what the one wire said, not that Edge Setter verified it", () => {
    const { row, story } = rowFor(SINGLE_SOURCE_OUT);
    expect(row.lifecycleLabel).toBe("Verified"); // the stage itself is untouched
    expect(row.timingStageLabel).toBe("Reported out");
    expect(story.watchNext).not.toMatch(/ES Agents verified/i);
    expect(story.timing).not.toMatch(/ES Agents verified/i);
    expect(story.relatedItems ?? []).not.toContain("ES Agents verified");
  });

  it("keeps the claim once a second source agrees", () => {
    const { row } = rowFor(TWO_SOURCE_OUT);
    expect(row.timingStageLabel).toBe("ES Agents verified");
  });

  it("keeps the claim on a lone official source", () => {
    const { row } = rowFor(OFFICIAL_SOURCE_OUT);
    expect(row.timingStageLabel).toBe("ES Agents verified");
  });

  it("stays neutral when the one source attached no showable designation", () => {
    const { row } = rowFor({ ...SINGLE_SOURCE_OUT, injuryDesignation: null, headline: "NYJ roster update" });
    expect(row.timingStageLabel).toBe("single report");
    expect(row.timingStageLabel).not.toMatch(/verified|out\b/i);
  });

  it("does not promote a designation the card itself withholds", () => {
    // A fabricated "Questionable" is withheld from the badge (see #96/#97). It
    // must not come back as the subject of a sentence instead.
    const { row } = rowFor({ ...SINGLE_SOURCE_OUT, injuryDesignation: "Questionable", headline: "NYJ injury update" });
    expect(row.timingStageLabel).not.toMatch(/questionable/i);
  });

  it("applies the same gate to the signal-level timing advantage", () => {
    expect(signalTimingAdvantage(SINGLE_SOURCE_OUT as never)).toBe("single report");
    expect(signalTimingAdvantage(TWO_SOURCE_OUT as never)).toBe("ES Agents verified");
  });
});

describe("the lifecycle chip stops reading Confirmed on one source", () => {
  it("degrades to Reported, which is what happened", () => {
    expect(publicLifecycleLabel("Verified", { sourceCount: 1 })).toBe("Reported");
    expect(publicLifecycleLabel("Confirmed", { sourceCount: 1 })).toBe("Reported");
  });

  it("still reads Confirmed when the claim is backed", () => {
    expect(publicLifecycleLabel("Verified", { sourceCount: 2 })).toBe("Confirmed");
    expect(publicLifecycleLabel("Verified", { sourceCount: 1, officialSource: true })).toBe("Confirmed");
  });

  it("is unchanged for callers that pass no context", () => {
    expect(publicLifecycleLabel("Verified")).toBe("Confirmed");
    expect(publicLifecycleLabel("Context Moving")).toBe("Market reacting");
    expect(publicLifecycleLabel("Resolved / Stale")).toBe("Cooling");
  });

  it("reaches the story card", () => {
    expect(rowFor(SINGLE_SOURCE_OUT).story.lifecycle).toBe("Reported");
    expect(rowFor(TWO_SOURCE_OUT).story.lifecycle).toBe("Confirmed");
  });

  it("carries the official-source fact on the row, where the chips read it", () => {
    expect(rowFor(OFFICIAL_SOURCE_OUT).row.officialSource).toBe(true);
    expect(rowFor(SINGLE_SOURCE_OUT).row.officialSource).toBe(false);
  });
});

describe("a corroboration word never sits next to a count of one", () => {
  it("drops the pipeline's strength word when one source backs it", () => {
    const label = signalTrustLabel(SINGLE_SOURCE_OUT as never);
    expect(label).toContain("1 source check");
    expect(label).not.toMatch(/corroborat/i);
  });

  it("keeps it once the count agrees with it", () => {
    expect(signalTrustLabel(TWO_SOURCE_OUT as never)).toMatch(/corroborat/i);
  });

  it("keeps a strength word that makes no corroboration claim", () => {
    const label = signalTrustLabel({ ...SINGLE_SOURCE_OUT, confirmationStrength: "Developing" } as never);
    expect(label).toContain("Developing");
  });

  it("drops 'confirmed status' from the same label for the same reason", () => {
    expect(signalTrustLabel(SINGLE_SOURCE_OUT as never)).not.toMatch(/confirmed status/i);
    expect(signalTrustLabel(TWO_SOURCE_OUT as never)).toMatch(/corroborat|confirmed status/i);
  });

  it("reaches the row tag the board actually renders", () => {
    // SituationRow prints tags.slice(0, 2), and tags[0] is the trust label.
    expect(rowFor(SINGLE_SOURCE_OUT).row.tags?.[0] ?? "").not.toMatch(/corroborat/i);
  });
});

/* ── The two board status chips ───────────────────────────────────────────── */

describe("the board status chip counts instead of claiming verification", () => {
  it.each(["CFBBoard.tsx", "NFLBoard.tsx"])("%s no longer says Verified source(s)", (page) => {
    const src = codeOf("pages", page);
    expect(src).not.toContain("Verified sources");
    expect(src).not.toContain("Verified source watch");
  });

  it.each(["CFBBoard.tsx", "NFLBoard.tsx"])("%s still prints a count", (page) => {
    expect(sourceOf("pages", page)).toMatch(/\.length\} (updates|watch items)/);
  });
});
