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
  findGameForStory,
  formatKickoff,
  kickoffIsTrustedForLeague,
  normalizeInjuryDesignation,
  opponentLabelFor,
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
    injuryDesignation: "Questionable",
    ...overrides,
  };
}

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
    const story = toSituationStoryCardData(buildRow(), [game()]);
    render(<SituationStoryCard story={story} />);

    expect(screen.getByTestId("story-injury-designation")).toHaveTextContent("QUESTIONABLE");
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
    expect(screen.getByTestId("story-injury-designation")).toHaveTextContent("QUESTIONABLE");
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
    const story = toSituationStoryCardData(buildRow({ injuryDesignation: undefined }), [game()]);
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
  it("prints the kickoff for NFL, the one league whose first writer is authoritative", () => {
    const story = toSituationStoryCardData(buildRow({ league: "NFL" }), [game()]);
    expect(story.kickoff).toBe(expectedKickoff(KICKOFF_ISO));
  });

  it.each(["CFB", "NBA", "MLB"])(
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
    it("trusts NFL in any casing", () => {
      expect(kickoffIsTrustedForLeague("NFL")).toBe(true);
      expect(kickoffIsTrustedForLeague("nfl")).toBe(true);
    });

    it.each(["CFB", "NBA", "MLB", "", undefined])("does not trust %s", (league) => {
      expect(kickoffIsTrustedForLeague(league as string | undefined)).toBe(false);
    });
  });
});
