/**
 * Story card: availability, player, opponent and kickoff.
 *
 * The three facts under test all existed in the pipeline before this change and
 * none of them reached the card: the injury designation arrived as `tags[2]`
 * behind a `tags.slice(0, 2)`, the player was passed only to the artwork, and
 * the kickoff was formatted for the live-game pills and nowhere else.
 *
 * Half of these cases are about what is NOT rendered. A kickoff attached to the
 * wrong game, or a "vs" that asserts home field we cannot prove, is worse than
 * a blank line, so every omission path has its own test.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  badgeableInjuryDesignation,
  findGameForStory,
  formatKickoff,
  kickoffIsTrustedForLeague,
  normalizeInjuryDesignation,
  opponentLabelFor,
  toSituationRowData,
  toSituationStoryCardData,
  type AnyBoardGame,
} from "@/components/board/boardAdapters";
import { SituationStoryCard } from "@/components/board/SituationStoryCard";
import type { SituationRowData } from "@/components/board/SituationRow";

/** The same formatters the adapter uses, so these assertions hold in any zone. */
const expectedKickoff = (iso: string) => {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
  return `${day} ${time}`;
};

/** The zone abbreviation the runtime would print for this instant, e.g. "PST". */
const expectedZone = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
    .formatToParts(new Date(iso))
    .find((part) => part.type === "timeZoneName")?.value;

const KICKOFF_ISO = "2026-11-15T20:30:00Z";

function buildRow(overrides: Partial<SituationRowData> = {}): SituationRowData {
  return {
    id: "sit-1",
    title: "Travis Kelce limited in Friday practice",
    subtitle: "Beat reporter and team report agree on a limited session.",
    league: "NFL",
    sourceCount: 3,
    sportsIdentity: {
      awayTeam: "KC",
      homeTeam: "BUF",
      team: "KC",
      opponent: "BUF",
      player: "Travis Kelce",
      sideKnown: true,
      sport: "nfl",
    },
    // "OUT" rather than "Questionable": the processor fabricates Questionable
    // for every text-classified source, so the card now withholds it and these
    // cases would be testing the suppression instead of what they were written
    // for. See the "withholds a designation it cannot stand behind" block.
    injuryDesignation: "OUT",
    ...overrides,
  };
}

/**
 * A title that does NOT contain the player's name.
 *
 * The card drops the player chip when the headline already names him (see
 * story-card-polish.test.tsx, item 1), and this fixture's default title does.
 * The two cases below that are about the chip itself therefore need a
 * headline that leaves the chip something to say.
 */
const TITLE_WITHOUT_PLAYER = "KC availability picture tightens before Sunday";

const game = (over: Partial<AnyBoardGame> = {}): AnyBoardGame => ({
  id: "game-1",
  awayTeam: "KC",
  homeTeam: "BUF",
  gameDate: new Date(KICKOFF_ISO),
  ...over,
});

describe("normalizeInjuryDesignation", () => {
  it("expands only the unambiguous designations", () => {
    expect(normalizeInjuryDesignation("Out")).toBe("OUT");
    expect(normalizeInjuryDesignation("out")).toBe("OUT");
    expect(normalizeInjuryDesignation("D")).toBe("DOUBTFUL");
    expect(normalizeInjuryDesignation("Doubtful")).toBe("DOUBTFUL");
    expect(normalizeInjuryDesignation("Q")).toBe("QUESTIONABLE");
    expect(normalizeInjuryDesignation("Questionable")).toBe("QUESTIONABLE");
    expect(normalizeInjuryDesignation("P")).toBe("PROBABLE");
  });

  it("passes unverified codes through instead of inventing a longer label", () => {
    expect(normalizeInjuryDesignation("IL-60")).toBe("IL-60");
    expect(normalizeInjuryDesignation("lp")).toBe("LP");
    expect(normalizeInjuryDesignation("DNP")).toBe("DNP");
  });

  it("returns undefined for absent values rather than a placeholder", () => {
    expect(normalizeInjuryDesignation(undefined)).toBeUndefined();
    expect(normalizeInjuryDesignation(null)).toBeUndefined();
    expect(normalizeInjuryDesignation("")).toBeUndefined();
    expect(normalizeInjuryDesignation("   ")).toBeUndefined();
  });
});

describe("formatKickoff", () => {
  it("formats a parseable instant as day + time", () => {
    expect(formatKickoff(KICKOFF_ISO)).toBe(expectedKickoff(KICKOFF_ISO));
    expect(formatKickoff(KICKOFF_ISO)).toMatch(/^[^\s]+ \d{1,2}:\d{2}/);
  });

  it("names the zone, so the hour is not ambiguous between readers", () => {
    const zone = expectedZone(KICKOFF_ISO);
    // Every ICU build resolves a zone name for a valid instant; if this is
    // undefined the assertion below would be vacuous.
    expect(zone).toBeTruthy();
    // The zone is appended after the clock time, not substituted for it: the
    // string still starts "Sat 3:30" and ends with the zone.
    const formatted = formatKickoff(KICKOFF_ISO) as string;
    expect(formatted).toMatch(/^[^\s]+ \d{1,2}:\d{2}/);
    expect(formatted.endsWith(zone as string)).toBe(true);
    expect(formatted.indexOf(zone as string)).toBeGreaterThan("Sat 3:30".length - 1);
  });

  it("returns undefined rather than echoing an unparseable value", () => {
    expect(formatKickoff("not a date")).toBeUndefined();
    expect(formatKickoff(new Date("nonsense"))).toBeUndefined();
    expect(formatKickoff(null)).toBeUndefined();
    expect(formatKickoff(undefined)).toBeUndefined();
    expect(formatKickoff("")).toBeUndefined();
  });
});

describe("findGameForStory", () => {
  const identity = buildRow().sportsIdentity;

  it("matches the game that shares both sides", () => {
    const match = findGameForStory(identity, [game({ id: "other", awayTeam: "SF", homeTeam: "SEA" }), game()]);
    expect(match?.game.id).toBe("game-1");
    expect(match?.storyIsHome).toBe(false);
  });

  it("matches on one side when only one game touches the story", () => {
    const match = findGameForStory(identity, [game({ id: "single", awayTeam: "KC", homeTeam: "DEN" })]);
    expect(match?.game.id).toBe("single");
  });

  it("returns undefined with no slate", () => {
    expect(findGameForStory(identity, [])).toBeUndefined();
    expect(findGameForStory(identity, undefined)).toBeUndefined();
  });

  it("refuses an ambiguous both-sides match (doubleheader)", () => {
    const match = findGameForStory(identity, [game({ id: "dh-1" }), game({ id: "dh-2" })]);
    expect(match).toBeUndefined();
  });

  it("refuses an ambiguous one-side match (team plays twice in the window)", () => {
    const match = findGameForStory(identity, [
      game({ id: "a", awayTeam: "KC", homeTeam: "DEN" }),
      game({ id: "b", awayTeam: "LV", homeTeam: "KC" }),
    ]);
    expect(match).toBeUndefined();
  });

  it("returns undefined when the story carries no team tokens", () => {
    expect(findGameForStory({ sport: "nfl" }, [game()])).toBeUndefined();
  });
});

describe("opponentLabelFor", () => {
  it("takes the side from the joined game", () => {
    const home = findGameForStory({ team: "BUF", sport: "nfl" }, [game()]);
    expect(opponentLabelFor({ team: "BUF", sport: "nfl" }, home)).toBe("vs KC");

    const away = findGameForStory({ team: "KC", sport: "nfl" }, [game()]);
    expect(opponentLabelFor({ team: "KC", sport: "nfl" }, away)).toBe("at BUF");
  });

  it("uses the identity only when the away/home pair is real", () => {
    expect(opponentLabelFor(buildRow().sportsIdentity)).toBe("at BUF");
  });

  it("omits the preposition when the side is an artefact of the fallback", () => {
    // sideKnown false = awayTeam/homeTeam were filled in from team/opponent.
    expect(
      opponentLabelFor({ team: "KC", opponent: "BUF", awayTeam: "KC", homeTeam: "BUF", sideKnown: false }),
    ).toBeUndefined();
  });
});

describe("SituationStoryCard identity line", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows designation, player, then opponent and kickoff", () => {
    const story = toSituationStoryCardData(buildRow({ title: TITLE_WITHOUT_PLAYER }), [game()]);
    render(<SituationStoryCard story={story} />);

    expect(screen.getByTestId("story-injury-designation")).toHaveTextContent("OUT");
    expect(screen.getByTestId("story-player")).toHaveTextContent("Travis Kelce");
    expect(screen.getByTestId("story-where-when")).toHaveTextContent(`at BUF, ${expectedKickoff(KICKOFF_ISO)}`);
  });

  it("reads the designation from the field, not from the sliced tag array", () => {
    // Two tags ahead of it is the normal case, and tags.slice(0, 2) drops the
    // designation entirely — so the card must not be reading tags.
    const story = toSituationStoryCardData(
      buildRow({ tags: ["Trusted source", "Confidence rising", "Questionable"] }),
      [game()],
    );
    render(<SituationStoryCard story={story} />);
    // The tag array says Questionable and the field says OUT, so this also
    // pins which of the two the card reads.
    expect(screen.getByTestId("story-injury-designation")).toHaveTextContent("OUT");
  });

  it("omits the kickoff when no game matches, keeping the opponent", () => {
    const story = toSituationStoryCardData(buildRow(), [game({ awayTeam: "SF", homeTeam: "SEA" })]);
    expect(story.kickoff).toBeUndefined();
    render(<SituationStoryCard story={story} />);
    expect(screen.getByTestId("story-where-when")).toHaveTextContent("at BUF");
    expect(screen.getByTestId("story-where-when").textContent).not.toContain(",");
  });

  it("omits the kickoff when the matched game has an unparseable time", () => {
    const story = toSituationStoryCardData(buildRow(), [game({ gameDate: null, game_time: "soon" })]);
    expect(story.kickoff).toBeUndefined();
    render(<SituationStoryCard story={story} />);
    expect(screen.getByTestId("story-where-when")).toHaveTextContent("at BUF");
  });

  it("omits the designation tag when the signal carries none", () => {
    const story = toSituationStoryCardData(
      buildRow({ injuryDesignation: undefined, title: TITLE_WITHOUT_PLAYER }),
      [game()],
    );
    render(<SituationStoryCard story={story} />);
    expect(screen.queryByTestId("story-injury-designation")).not.toBeInTheDocument();
    expect(screen.getByTestId("story-player")).toBeInTheDocument();
  });

  it("omits the player when none resolved", () => {
    const row = buildRow();
    const story = toSituationStoryCardData(
      { ...row, sportsIdentity: { ...row.sportsIdentity, player: undefined } },
      [game()],
    );
    render(<SituationStoryCard story={story} />);
    expect(screen.queryByTestId("story-player")).not.toBeInTheDocument();
    expect(screen.getByTestId("story-injury-designation")).toBeInTheDocument();
  });

  it("drops the whole line when all three facts are absent", () => {
    const story = toSituationStoryCardData(
      buildRow({ injuryDesignation: undefined, sportsIdentity: { sport: "nfl" } }),
      [],
    );
    render(<SituationStoryCard story={story} />);
    expect(screen.queryByTestId("story-injury-designation")).not.toBeInTheDocument();
    expect(screen.queryByTestId("story-player")).not.toBeInTheDocument();
    expect(screen.queryByTestId("story-where-when")).not.toBeInTheDocument();
  });

  it("shows no kickoff for an ambiguous doubleheader rather than picking one", () => {
    const story = toSituationStoryCardData(buildRow(), [game({ id: "dh-1" }), game({ id: "dh-2" })]);
    expect(story.kickoff).toBeUndefined();
    render(<SituationStoryCard story={story} />);
    expect(screen.getByTestId("story-where-when").textContent).not.toMatch(/\d{1,2}:\d{2}/);
  });
});

/**
 * Kickoff is printed for NFL only.
 *
 * `games.game_time` is first-writer-wins: all three upserts in
 * server/pipeline/store.ts list it in the INSERT column list and in none of
 * their ON CONFLICT DO UPDATE SET clauses, so whichever adapter creates the
 * row fixes the kickoff permanently and a later feed cannot correct it. A
 * wrong-but-parseable time renders with full confidence, so every league
 * except NFL takes the same blank as a missing time.
 *
 * These are the cases to extend when a league is switched on.
 */
describe("kickoff is gated by league", () => {
  it.each(["NFL", "NBA"])(
    "prints the kickoff for %s, whose stored game_time was checked and holds",
    (league) => {
      const story = toSituationStoryCardData(buildRow({ league }), [game()]);
      expect(story.kickoff).toBe(expectedKickoff(KICKOFF_ISO));
    },
  );

  it.each(["CFB", "MLB"])(
    "omits the kickoff for %s, whose stored game_time can be wrong",
    (league) => {
      const story = toSituationStoryCardData(buildRow({ league }), [game()]);
      expect(story.kickoff).toBeUndefined();
    },
  );

  it("still shows the opponent for an untrusted league — only the time is withheld", () => {
    const story = toSituationStoryCardData(buildRow({ league: "CFB" }), [game()]);
    expect(story.kickoff).toBeUndefined();
    expect(story.opponentLabel).toBe("at BUF");
  });

  it("renders the untrusted league's card with no trailing comma or empty slot", () => {
    render(
      <SituationStoryCard
        story={toSituationStoryCardData(buildRow({ league: "CFB" }), [game()])}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByTestId("story-where-when")).toHaveTextContent("at BUF");
    expect(screen.getByTestId("story-where-when").textContent?.trim()).not.toMatch(/,$/);
  });

  describe("kickoffIsTrustedForLeague", () => {
    it.each(["NFL", "NBA"])("trusts %s in any casing", (league) => {
      expect(kickoffIsTrustedForLeague(league)).toBe(true);
      expect(kickoffIsTrustedForLeague(league.toLowerCase())).toBe(true);
    });

    it.each(["CFB", "MLB", "", undefined])("does not trust %s", (league) => {
      expect(kickoffIsTrustedForLeague(league as string | undefined)).toBe(false);
    });
  });
});

/**
 * The badge withholds any designation it cannot stand behind.
 *
 * `processor.ts:64` defaults a missing designation to "Questionable", and the
 * five text-classified adapters send no designation at all, so a stored
 * "Questionable" carries no information about whether a source said it. These
 * cases pin the suppression and, just as importantly, pin that the
 * designations we CAN stand behind still render.
 */
describe("badgeableInjuryDesignation", () => {
  it("withholds QUESTIONABLE however it was spelled, because it may be fabricated", () => {
    expect(badgeableInjuryDesignation("Questionable")).toBeUndefined();
    expect(badgeableInjuryDesignation("questionable")).toBeUndefined();
    expect(badgeableInjuryDesignation("QUESTIONABLE")).toBeUndefined();
    // "Q" normalizes to QUESTIONABLE, so it has to be withheld by the same rule
    // rather than slipping through in its short form.
    expect(badgeableInjuryDesignation("Q")).toBeUndefined();
  });

  it("keeps the designations a source actually had to supply", () => {
    expect(badgeableInjuryDesignation("OUT")).toBe("OUT");
    expect(badgeableInjuryDesignation("Doubtful")).toBe("DOUBTFUL");
    expect(badgeableInjuryDesignation("D")).toBe("DOUBTFUL");
    expect(badgeableInjuryDesignation("IL-60")).toBe("IL-60");
    expect(badgeableInjuryDesignation("DNP")).toBe("DNP");
    expect(badgeableInjuryDesignation("LP")).toBe("LP");
    expect(badgeableInjuryDesignation("Probable")).toBe("PROBABLE");
  });

  it("still returns undefined for an absent designation", () => {
    expect(badgeableInjuryDesignation(undefined)).toBeUndefined();
    expect(badgeableInjuryDesignation(null)).toBeUndefined();
    expect(badgeableInjuryDesignation("  ")).toBeUndefined();
  });

  it.each([
    ["off the injury report", "Kelce is off the injury report ahead of Sunday."],
    ["removed from the injury report", "Removed from the injury report Friday."],
    ["full participant", "Kelce was a full participant in Thursday's session."],
    ["cleared", "Kelce has been cleared to play."],
    ["activated", "The team activated Kelce from injured reserve."],
    ["no longer listed", "Kelce is no longer listed on the report."],
  ])("drops even OUT when the prose says %s", (_label, prose) => {
    expect(badgeableInjuryDesignation("OUT", prose)).toBeUndefined();
  });

  it("keeps OUT when the prose does not contradict it", () => {
    expect(badgeableInjuryDesignation("OUT", "Kelce did not practice and is expected to miss Sunday."))
      .toBe("OUT");
  });

  it("does not read a contradiction out of ordinary injury-report prose", () => {
    // The word "report" alone is not the phrase, or every signal would lose its
    // badge — the fixture's own subtitle says "team report".
    expect(badgeableInjuryDesignation("OUT", "Beat reporter and team report agree on a limited session."))
      .toBe("OUT");
    expect(badgeableInjuryDesignation("OUT", "Listed on the injury report with a knee issue."))
      .toBe("OUT");
  });
});

describe("the story card's injury badge", () => {
  it("renders no badge at all for a fabricated Questionable", () => {
    // TITLE_WITHOUT_PLAYER because this case asserts the player chip survives,
    // and the default headline names him, which drops the chip on its own.
    const story = toSituationStoryCardData(
      buildRow({ injuryDesignation: "Questionable", title: TITLE_WITHOUT_PLAYER }),
      [game()],
    );
    expect(story.injuryDesignation).toBeUndefined();
    render(<SituationStoryCard story={story} />);
    expect(screen.queryByTestId("story-injury-designation")).not.toBeInTheDocument();
    // The rest of the identity line survives: this hides one claim, not the row.
    expect(screen.getByTestId("story-player")).toHaveTextContent("Travis Kelce");
    expect(screen.getByTestId("story-where-when")).toBeInTheDocument();
  });

  it("renders no badge when the story's own prose contradicts it", () => {
    const story = toSituationStoryCardData(
      buildRow({ subtitle: "Travis Kelce is off the injury report and will play." }),
      [game()],
    );
    expect(story.injuryDesignation).toBeUndefined();
    render(<SituationStoryCard story={story} />);
    expect(screen.queryByTestId("story-injury-designation")).not.toBeInTheDocument();
  });

  it("keeps the badge for OUT and DOUBTFUL", () => {
    for (const [stored, shown] of [["OUT", "OUT"], ["Doubtful", "DOUBTFUL"]] as const) {
      const { unmount } = render(
        <SituationStoryCard story={toSituationStoryCardData(buildRow({ injuryDesignation: stored }), [game()])} />,
      );
      expect(screen.getByTestId("story-injury-designation")).toHaveTextContent(shown);
      unmount();
    }
  });

  it("drops the designation from the row's tag array too, so the two surfaces agree", () => {
    const withFabricated = toSituationRowData({
      id: "sit-tags",
      kind: "signal",
      league: "NFL",
      title: "Travis Kelce limited in Friday practice",
      detail: "Beat reporter and team report agree on a limited session.",
      signal: { injuryDesignation: "Questionable" },
      confidence: 70,
      score: 70,
      sourceCount: 2,
    } as unknown as Parameters<typeof toSituationRowData>[0]);
    expect(withFabricated.tags).not.toContain("Questionable");

    const withReal = toSituationRowData({
      id: "sit-tags-2",
      kind: "signal",
      league: "NFL",
      title: "Travis Kelce ruled out",
      detail: "Did not practice all week.",
      signal: { injuryDesignation: "OUT" },
      confidence: 70,
      score: 70,
      sourceCount: 2,
    } as unknown as Parameters<typeof toSituationRowData>[0]);
    expect(withReal.tags).toContain("OUT");
  });
});
