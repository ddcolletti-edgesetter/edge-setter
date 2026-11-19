/**
 * The row title, the "Sports context" line and the visual's caption print the
 * team's NAME; everything that parses a matchup keeps the token.
 *
 * #99 resolved CFB mascot tokens to school names and #101 added the name the
 * feed itself stored, but both stopped at the matchup line. The headline over
 * it, the identity line under it and the caption beside it still read
 * "OWL @ PAN". This finishes those three.
 *
 * ONE RULE, EVERYWHERE, and it is #101's: the name the games row stored, then
 * the CFB mascot-token lookup, then the token. Applied PER SIDE, so a matchup
 * with one nameable side names it rather than throwing both away.
 *
 * THE OTHER HALF IS WHAT MUST NOT MOVE. Four things read tokens and would
 * break on names, so each has a test below:
 *
 *   situation.title / row.title   editorialHeadline parses it for the player,
 *                                 the team and the market-dominant test;
 *                                 storyTitleHasValidPlayerName gates on it
 *   row.matchup                   cleanPublicMatchupLabel builds an uppercase
 *                                 hyphenated pair from it, and full names
 *                                 would make that "RICE OWLS-TEMPLE OWLS"
 *   identity.awayTeam/homeTeam    TeamLogoImg lookup keys
 *   story.primaryTeam/secondary   TeamLogoImg and resolveSportsImageAsset keys
 *
 * The signal-sourced path is out of scope by design: `team`/`opponent` come
 * from a signal, not a games row, and the mascot-slice table would mis-resolve
 * them (see cfbSchoolForGamesToken on FLA).
 */

import fs from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  toSituationRowData,
  toSituationStoryCardData,
  type AnyBoardGame,
} from "@/components/board/boardAdapters";
import { SportsIdentityLine } from "@/components/board/SituationRow";
import { SituationStoryCard } from "@/components/board/SituationStoryCard";
import { SportsStoryVisual } from "@/components/SportsMedia";
import { buildBoardSituations, type BoardGameInput } from "@/lib/boardSituations";

/** OWL is shared by four schools, so the lookup must refuse it; only a stored
 *  name can say which one this is. PAN is shared too. */
const SHARED_AWAY = "OWL";
const SHARED_HOME = "PAN";
/** BRO belongs to Western Michigan alone, so the lookup can name it with no
 *  stored name at all. TIG is Memphis's. */
const OWNED_AWAY = { token: "BRO", school: "Western Michigan Broncos" };
const OWNED_HOME = { token: "TIG", school: "Memphis Tigers" };

function situationFor(game: BoardGameInput, league = "CFB") {
  return buildBoardSituations({ league: league as never, games: [game], signals: [] })[0];
}

function rowFor(game: BoardGameInput, league = "CFB") {
  return toSituationRowData(situationFor(game, league));
}

function storyFor(game: BoardGameInput, league = "CFB") {
  return toSituationStoryCardData(rowFor(game, league), [game as AnyBoardGame]);
}

/**
 * What the rendered logos were looked up by.
 *
 * A token resolves either to an <img> whose alt is the abbreviation or, when
 * no logo URL exists for it, to the TeamCrest SVG whose aria-label is
 * "<ABBR> crest" — both of which are built from the lookup key. Reading both
 * is what makes this assertion hold whichever branch a given token takes.
 */
function logoKeys(container: HTMLElement): string {
  const imgs = Array.from(container.querySelectorAll("img")).map((el) => el.getAttribute("alt") ?? "");
  const crests = Array.from(container.querySelectorAll("[role='img']")).map((el) => el.getAttribute("aria-label") ?? "");
  return [...imgs, ...crests].join(" ");
}

/* ── 1. the row title ─────────────────────────────────────────────────────── */

describe("the row title", () => {
  it("names both sides from the stored names, even where no lookup could", () => {
    const situation = situationFor({
      id: "g1",
      awayTeam: SHARED_AWAY,
      homeTeam: SHARED_HOME,
      away_team_name: "Rice Owls",
      home_team_name: "Pittsburgh Panthers",
    });
    expect(situation.titleLabel).toBe("Rice Owls @ Pittsburgh Panthers");
  });

  it("falls back to the CFB lookup when the row stored no name", () => {
    const situation = situationFor({ id: "g1", awayTeam: OWNED_AWAY.token, homeTeam: OWNED_HOME.token });
    expect(situation.titleLabel).toBe(`${OWNED_AWAY.school} @ ${OWNED_HOME.school}`);
  });

  it("falls back PER SIDE, naming the half it can", () => {
    // Today's live slate has exactly this shape twice (ZIP @ MIN, CHI @ BUL):
    // one side the lookup owns, one side two schools share.
    const situation = situationFor({ id: "g1", awayTeam: OWNED_AWAY.token, homeTeam: SHARED_HOME });
    expect(situation.titleLabel).toBe(`${OWNED_AWAY.school} @ ${SHARED_HOME}`);
  });

  it("is left undefined when there is no better name than the tokens", () => {
    // Not an echo of `title`: undefined is what keeps every consumer's
    // `titleLabel ?? title` honest, and it is the NBA case — those rows store
    // no name and the CFB lookup does not apply to them.
    const situation = situationFor({ id: "g1", awayTeam: "MIL", homeTeam: "MIA" }, "NBA");
    expect(situation.title).toBe("MIL @ MIA");
    expect(situation.titleLabel).toBeUndefined();
  });

  it("names an NFL row, which has no lookup but does have stored names", () => {
    const situation = situationFor(
      {
        id: "g1",
        awayTeam: "IND",
        homeTeam: "HOU",
        away_team_name: "Indianapolis Colts",
        home_team_name: "Houston Texans",
      },
      "NFL",
    );
    expect(situation.titleLabel).toBe("Indianapolis Colts @ Houston Texans");
  });

  it("keeps the score on the end", () => {
    const situation = situationFor({
      id: "g1",
      awayTeam: OWNED_AWAY.token,
      homeTeam: OWNED_HOME.token,
      awayScore: 21,
      homeScore: 40,
    });
    expect(situation.title).toBe(`${OWNED_AWAY.token} @ ${OWNED_HOME.token} 21-40`);
    expect(situation.titleLabel).toBe(`${OWNED_AWAY.school} @ ${OWNED_HOME.school} 21-40`);
  });

  it("leaves `title` itself in tokens, because headline copy parses it", () => {
    const situation = situationFor({
      id: "g1",
      awayTeam: SHARED_AWAY,
      homeTeam: SHARED_HOME,
      away_team_name: "Rice Owls",
      home_team_name: "Pittsburgh Panthers",
    });
    expect(situation.title).toBe(`${SHARED_AWAY} @ ${SHARED_HOME}`);
    expect(toSituationRowData(situation).title).toBe(`${SHARED_AWAY} @ ${SHARED_HOME}`);
  });

  it("is carried only on game rows", () => {
    // A signal row's title is rewritten by fanFirstTitle, so a label built from
    // the raw one would no longer match what is printed.
    const [signalRow] = buildBoardSituations({
      league: "CFB" as never,
      games: [],
      signals: [
        { id: "s1", headline: "Starter ruled out", team: OWNED_AWAY.token, type: "injury", player: "Sam Smith" } as never,
      ],
    });
    expect(signalRow.kind).toBe("signal");
    expect(toSituationRowData(signalRow).titleLabel).toBeUndefined();
  });
});

/* ── 2. the card headline ─────────────────────────────────────────────────── */

describe("the card headline", () => {
  it("prints the names version of a game row's title", () => {
    const story = storyFor({
      id: "g1",
      awayTeam: SHARED_AWAY,
      homeTeam: SHARED_HOME,
      away_team_name: "Rice Owls",
      home_team_name: "Pittsburgh Panthers",
    });
    expect(story.headline).toBe("Rice Owls @ Pittsburgh Panthers");
  });

  it("renders that headline on the card", () => {
    render(<SituationStoryCard story={storyFor({ id: "g1", awayTeam: OWNED_AWAY.token, homeTeam: OWNED_HOME.token })} />);
    expect(screen.getByRole("heading", { name: `${OWNED_AWAY.school} @ ${OWNED_HOME.school}` })).toBeTruthy();
  });

  it("still keeps `matchup` in tokens for cleanPublicMatchupLabel", () => {
    const story = storyFor({
      id: "g1",
      awayTeam: SHARED_AWAY,
      homeTeam: SHARED_HOME,
      away_team_name: "Rice Owls",
      home_team_name: "Pittsburgh Panthers",
    });
    expect(story.row.matchup).toBe(`${SHARED_AWAY} @ ${SHARED_HOME}`);
  });

  it("does not let a name reach the market-movement headline, which parses tokens", () => {
    // A market-dominant title goes down the cleanPublicMatchupLabel branch and
    // never reaches the `raw` fallthrough. If the names version leaked into the
    // parse, this would read "RICE OWLS-PITTSBURGH PANTHERS line movement".
    const row = rowFor({
      id: "g1",
      awayTeam: SHARED_AWAY,
      homeTeam: SHARED_HOME,
      away_team_name: "Rice Owls",
      home_team_name: "Pittsburgh Panthers",
    });
    const { headline } = toSituationStoryCardData(
      { ...row, title: "Line move: spread -3 to -6", market: "market reaction detected" },
      [],
    );
    expect(headline).toContain(`${SHARED_AWAY}-${SHARED_HOME}`);
    expect(headline).not.toContain("Rice Owls");
  });
});

/* ── 3. the "Sports context" line ─────────────────────────────────────────── */

describe("the Sports context line", () => {
  const identityFor = (game: BoardGameInput) => rowFor(game).sportsIdentity;

  it("carries the names beside the tokens, never instead of them", () => {
    const identity = identityFor({
      id: "g1",
      awayTeam: SHARED_AWAY,
      homeTeam: SHARED_HOME,
      away_team_name: "Rice Owls",
      home_team_name: "Pittsburgh Panthers",
    });
    expect(identity?.awayTeam).toBe(SHARED_AWAY);
    expect(identity?.homeTeam).toBe(SHARED_HOME);
    expect(identity?.awayTeamName).toBe("Rice Owls");
    expect(identity?.homeTeamName).toBe("Pittsburgh Panthers");
  });

  it("prints them", () => {
    render(<SportsIdentityLine identity={identityFor({ id: "g1", awayTeam: OWNED_AWAY.token, homeTeam: OWNED_HOME.token })} />);
    expect(screen.getByText(`${OWNED_AWAY.school} @ ${OWNED_HOME.school}`)).toBeTruthy();
  });

  it("keeps the token on the side that has no name", () => {
    render(<SportsIdentityLine identity={identityFor({ id: "g1", awayTeam: OWNED_AWAY.token, homeTeam: SHARED_HOME })} />);
    expect(screen.getByText(`${OWNED_AWAY.school} @ ${SHARED_HOME}`)).toBeTruthy();
  });

  it("leaves the logos resolving from the tokens", () => {
    const { container } = render(
      <SportsIdentityLine identity={identityFor({ id: "g1", awayTeam: OWNED_AWAY.token, homeTeam: OWNED_HOME.token })} />,
    );
    // A full school name resolves no logo at all, so this is the assertion
    // that the caption's change did not reach the lookup key.
    const keys = logoKeys(container);
    expect(keys).toContain(OWNED_AWAY.token);
    expect(keys).toContain(OWNED_HOME.token);
    expect(keys).not.toContain("Broncos");
  });

  it("does not name the signal-sourced team/opponent branch", () => {
    const [signalRow] = buildBoardSituations({
      league: "CFB" as never,
      games: [],
      signals: [{ id: "s1", headline: "Starter ruled out", team: "FLA", opponent: "UGA", type: "injury" } as never],
    });
    const identity = toSituationRowData(signalRow).sportsIdentity;
    // FLA is Florida to the CFB mascot table and the Marlins to everything
    // else; without a games row behind it there is nothing to resolve from.
    expect(identity?.awayTeamName).toBeUndefined();
    expect(identity?.homeTeamName).toBeUndefined();
  });
});

/* ── 4. the visual's caption ──────────────────────────────────────────────── */

describe("the visual's caption", () => {
  it("prints the names while the logos keep the tokens", () => {
    const { container } = render(
      <SportsStoryVisual
        league="CFB"
        sport="cfb"
        primaryTeam={OWNED_AWAY.token}
        secondaryTeam={OWNED_HOME.token}
        primaryTeamName={OWNED_AWAY.school}
        secondaryTeamName={OWNED_HOME.school}
      />,
    );
    expect(screen.getByText(`${OWNED_AWAY.school} @ ${OWNED_HOME.school}`)).toBeTruthy();
    const keys = logoKeys(container);
    expect(keys).toContain(OWNED_AWAY.token);
    expect(keys).toContain(OWNED_HOME.token);
    expect(keys).not.toContain("Broncos");
  });

  it("falls back to the token for a side with no name", () => {
    render(
      <SportsStoryVisual
        league="CFB"
        sport="cfb"
        primaryTeam={OWNED_AWAY.token}
        secondaryTeam={SHARED_HOME}
        primaryTeamName={OWNED_AWAY.school}
      />,
    );
    expect(screen.getByText(`${OWNED_AWAY.school} @ ${SHARED_HOME}`)).toBeTruthy();
  });

  it("ignores a name for a slot whose token is absent", () => {
    // `primary` falls back to the SECONDARY token when primaryTeam is blank.
    // Printing the away team's name over the home team's logo would be worse
    // than printing a token.
    render(<SportsStoryVisual league="CFB" sport="cfb" secondaryTeam={OWNED_HOME.token} primaryTeamName={OWNED_AWAY.school} />);
    expect(screen.queryByText(new RegExp(OWNED_AWAY.school))).toBeNull();
  });

  it("is fed from the away/home branch only, not team/opponent", () => {
    const story = storyFor({ id: "g1", awayTeam: OWNED_AWAY.token, homeTeam: OWNED_HOME.token });
    expect(story.primaryTeam).toBe(OWNED_AWAY.token);
    expect(story.secondaryTeam).toBe(OWNED_HOME.token);
    expect(story.primaryTeamName).toBe(OWNED_AWAY.school);
    expect(story.secondaryTeamName).toBe(OWNED_HOME.school);
  });
});

/* ── 5. the boards that had no slate ──────────────────────────────────────── */

describe("the CFB and NFL boards' slate", () => {
  // Both pages called buildBoardSituations with `games: []`, so neither
  // produced a single game-derived row and every label built from a games row
  // — the matchup line, the stored names, the title — was dead code there.
  const slate: BoardGameInput[] = [
    { id: "g1", awayTeam: OWNED_AWAY.token, homeTeam: OWNED_HOME.token },
    { id: "g2", awayTeam: SHARED_AWAY, homeTeam: SHARED_HOME, away_team_name: "Rice Owls", home_team_name: "Pittsburgh Panthers" },
  ];

  it("produced nothing at all when the slate was empty", () => {
    expect(buildBoardSituations({ league: "CFB" as never, games: [], signals: [] })).toHaveLength(0);
  });

  it("produces one game row per game once the slate is passed", () => {
    const situations = buildBoardSituations({ league: "CFB" as never, games: slate, signals: [] });
    expect(situations.filter((s) => s.kind === "game")).toHaveLength(2);
  });

  it("gives every one of them a named title", () => {
    const situations = buildBoardSituations({ league: "CFB" as never, games: slate, signals: [] });
    expect(situations.map((s) => s.titleLabel).sort()).toEqual([
      "Rice Owls @ Pittsburgh Panthers",
      `${OWNED_AWAY.school} @ ${OWNED_HOME.school}`,
    ]);
  });
});

/* ── 6. the wiring, which no unit test above can see ──────────────────────
 *
 * Everything in section 5 proves buildBoardSituations does the right thing
 * when it is handed a slate. It cannot prove the pages hand it one — and for
 * CFB and NFL they did not, which is the whole of item 3. This reads the four
 * board pages the way watch-slate-kickoff-trust.test.tsx reads the adapters:
 * if it fails, a page has gone back to an empty slate and every game-derived
 * label on it is dead again.
 */
describe("every board page passes its slate", () => {
  const PAGES = ["CFBBoard.tsx", "NFLBoard.tsx", "NBABoard.tsx", "MLBBoard.tsx"];

  const sourceOf = (page: string) =>
    fs.readFileSync(path.join(process.cwd(), "client", "src", "pages", page), "utf8");

  it.each(PAGES)("%s calls buildBoardSituations exactly once", (page) => {
    // The assertion below reads the FIRST call. A second one would make it
    // pass for the wrong reason.
    expect(sourceOf(page).match(/buildBoardSituations\(/g) ?? []).toHaveLength(1);
  });

  it.each(PAGES)("%s does not pass an empty games array", (page) => {
    const call = sourceOf(page).split("buildBoardSituations({")[1]?.split("});")[0] ?? "";
    expect(call).not.toMatch(/games:\s*\[\s*\]/);
    expect(call).toMatch(/games:\s*liveGames/);
  });

  it.each(["CFBBoard.tsx", "NFLBoard.tsx"])("%s re-runs that memo when the slate arrives", (page) => {
    // The slate is fetched in an effect, so it is empty on first render. A
    // dependency array without it would freeze the board at zero game rows —
    // the same outcome as `games: []`, reached a slower way.
    const memo = sourceOf(page).split("buildBoardSituations({")[1] ?? "";
    const deps = memo.match(/\}, \[([^\]]*)\]\);/)?.[1] ?? "";
    expect(deps).toContain("liveGames");
  });
});
