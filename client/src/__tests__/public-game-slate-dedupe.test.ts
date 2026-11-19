/**
 * A rescheduled game is one game.
 *
 * The canonical game id is LEAGUE_DATE_AWAY_HOME, so when a start time moves
 * across a UTC midnight the pipeline mints a NEW row and orphans the old one.
 * `gameDedupeKey` includes the UTC day, so it sees two different games: same
 * two teams, different day, both inside the three-day public window. The board
 * listed each of them twice.
 *
 * THE FIXTURE IS REAL. These are the six pairs in the live CFB slate on
 * 2026-11-19, taken from GET /api/v2/games?league=CFB: 73 rows in the window,
 * 73 after the old dedupe, six of them the same feed event twice. Ids, start
 * times, source ids and timestamps are the production values.
 */

import { describe, expect, it } from "vitest";

import {
  dedupePublicGames,
  publicGamesForLeague,
  type PublicGameLike,
} from "@/lib/publicDisplayHygiene";

const NOW = new Date("2026-11-19T06:55:00.000Z");

type Row = PublicGameLike & { id: string };

function row(over: Partial<Row> & { id: string }): Row {
  return {
    league: "CFB",
    status: "scheduled",
    spread_line: -3.5,
    total_line: 52.5,
    created_at: "2026-11-15T12:13:31.011Z",
    ...over,
  } as Row;
}

/** The six double-listed pairs, exactly as prod served them. */
const PAIRS: Array<{
  source: string;
  away: string;
  home: string;
  stale: { id: string; game_time: string; updated_at: string };
  live: { id: string; game_time: string; updated_at: string };
}> = [
  {
    source: "430ea047c8a027987881d51f810a6cf8", away: "WAR", home: "PAC",
    stale: { id: "CFB_2026_11_21_WAR_PAC", game_time: "2026-11-21T15:30:00Z", updated_at: "2026-11-15T16:43:30.998Z" },
    live: { id: "CFB_2026_11_22_WAR_PAC", game_time: "2026-11-22T03:30:00Z", updated_at: "2026-11-19T06:40:04.499Z" },
  },
  {
    source: "8d53f308424d388c9003e02cac8b4cf6", away: "VT", home: "HUR",
    stale: { id: "CFB_2026_11_21_VT_HUR", game_time: "2026-11-21T16:00:00Z", updated_at: "2026-11-15T21:43:30.987Z" },
    live: { id: "CFB_2026_11_22_VT_HUR", game_time: "2026-11-22T00:00:00Z", updated_at: "2026-11-19T06:40:04.472Z" },
  },
  {
    source: "7585fb8b12453a68ca1195319ae44c78", away: "UTAH", home: "TCU",
    stale: { id: "CFB_2026_11_21_UTAH_TCU", game_time: "2026-11-21T17:00:00Z", updated_at: "2026-11-16T06:13:31.166Z" },
    live: { id: "CFB_2026_11_22_UTAH_TCU", game_time: "2026-11-22T02:00:00Z", updated_at: "2026-11-19T06:40:04.492Z" },
  },
  {
    source: "9f3f8efae55dbb803964a5107350e263", away: "ROA", home: "BLA",
    stale: { id: "CFB_2026_11_21_ROA_BLA", game_time: "2026-11-21T17:00:00Z", updated_at: "2026-11-15T16:43:31.035Z" },
    live: { id: "CFB_2026_11_22_ROA_BLA", game_time: "2026-11-22T01:00:00Z", updated_at: "2026-11-19T06:40:04.490Z" },
  },
  {
    source: "9470f469f957e9eddae9392cb23b4623", away: "ARIZ", home: "KSU",
    stale: { id: "CFB_2026_11_21_ARIZ_KSU", game_time: "2026-11-21T20:30:00Z", updated_at: "2026-11-16T06:13:31.147Z" },
    live: { id: "CFB_2026_11_22_ARIZ_KSU", game_time: "2026-11-22T00:00:00Z", updated_at: "2026-11-19T06:40:04.466Z" },
  },
  {
    source: "44e73391c2ac535ab552aac4bdcfa3b3", away: "PITT", home: "LOU",
    stale: { id: "CFB_2026_11_21_PITT_LOU", game_time: "2026-11-21T20:30:00Z", updated_at: "2026-11-16T06:13:31.159Z" },
    live: { id: "CFB_2026_11_22_PITT_LOU", game_time: "2026-11-22T00:30:00Z", updated_at: "2026-11-19T06:40:04.487Z" },
  },
];

const pairRows = PAIRS.flatMap(({ source, away, home, stale, live }) => [
  row({ ...stale, away_team: away, home_team: home, source_game_id: source }),
  row({ ...live, away_team: away, home_team: home, source_game_id: source }),
]);

/** Two games nothing is wrong with, to prove the slate is not just shrinking. */
const CONTROLS = [
  row({ id: "CFB_2026_11_21_BRO_OWL", away_team: "BRO", home_team: "OWL", game_time: "2026-11-21T19:00:00Z", source_game_id: "ctrl-1", updated_at: "2026-11-19T06:40:04.400Z" }),
  row({ id: "CFB_2026_11_22_CAT_TIG", away_team: "CAT", home_team: "TIG", game_time: "2026-11-22T19:00:00Z", source_game_id: "ctrl-2", updated_at: "2026-11-19T06:40:04.401Z" }),
];

describe("the six double-listed CFB games", () => {
  const slate = () => publicGamesForLeague([...pairRows, ...CONTROLS], "CFB", NOW);

  it("are all in the window, which is why both rows reached the board", () => {
    // Non-vacuity for everything below: if the stale rows fell outside the
    // three-day window the dedupe would have nothing to do.
    const ids = new Set([...pairRows, ...CONTROLS].map((g) => g.id));
    expect(ids.size).toBe(14);
    for (const game of [...pairRows, ...CONTROLS]) {
      expect(publicGamesForLeague([game], "CFB", NOW)).toHaveLength(1);
    }
  });

  it("were invisible to the old key, because the UTC day differs", () => {
    // The mechanism, pinned: same teams, different day. No tie-break on
    // completeness could have separated these — the old key put them in
    // different buckets entirely.
    for (const { stale, live } of PAIRS) {
      expect(stale.game_time.slice(0, 10)).not.toBe(live.game_time.slice(0, 10));
    }
  });

  it("collapse to one row each", () => {
    expect(slate()).toHaveLength(8);
  });

  it("keep the row the feed is still updating, and drop the orphan", () => {
    const kept = new Set(slate().map((g) => (g as Row).id));
    for (const { stale, live } of PAIRS) {
      expect(kept.has(live.id), `${live.id} should be kept`).toBe(true);
      expect(kept.has(stale.id), `${stale.id} should be dropped`).toBe(false);
    }
  });

  it("leaves every other game on the slate", () => {
    const kept = new Set(slate().map((g) => (g as Row).id));
    expect(kept.has("CFB_2026_11_21_BRO_OWL")).toBe(true);
    expect(kept.has("CFB_2026_11_22_CAT_TIG")).toBe(true);
  });
});

describe("which row wins", () => {
  it("is the newest, even when the orphan looks more complete", () => {
    // The stale row carries every completeness field; the live row carries the
    // bare minimum. If this pass ranked by gameCompletenessScore — the rule the
    // FIRST pass uses — the orphan with the wrong start time would survive.
    const stale = row({
      id: "CFB_2026_11_21_A_B",
      away_team: "A", home_team: "B",
      game_time: "2026-11-21T23:30:00Z",
      source_game_id: "src-x",
      spread_line: -7, total_line: 61.5, open_spread: -6.5, open_total: 60.5,
      status: "scheduled",
      updated_at: "2026-11-15T00:00:00.000Z",
    });
    const live = row({
      id: "CFB_2026_11_22_A_B",
      away_team: "A", home_team: "B",
      game_time: "2026-11-22T01:30:00Z",
      source_game_id: "src-x",
      spread_line: null, total_line: null, open_spread: null, open_total: null,
      status: null,
      updated_at: "2026-11-19T06:40:00.000Z",
    });

    const kept = dedupePublicGames([stale, live]) as Row[];
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe("CFB_2026_11_22_A_B");
  });

  it("falls back to created_at when a row has no updated_at", () => {
    const older = row({ id: "g-old", away_team: "A", home_team: "B", game_time: "2026-11-21T23:30:00Z", source_game_id: "src-y", updated_at: null, created_at: "2026-11-10T00:00:00.000Z" });
    const newer = row({ id: "g-new", away_team: "A", home_team: "B", game_time: "2026-11-22T01:30:00Z", source_game_id: "src-y", updated_at: null, created_at: "2026-11-18T00:00:00.000Z" });
    expect((dedupePublicGames([older, newer]) as Row[]).map((g) => g.id)).toEqual(["g-new"]);
  });
});

describe("what must NOT be collapsed", () => {
  it("two rows with no source id at all", () => {
    // An unidentified row is kept as itself. Collapsing them would merge games
    // on nothing more than "neither has an id".
    const a = row({ id: "no-src-1", away_team: "A", home_team: "B", game_time: "2026-11-21T23:30:00Z", source_game_id: null });
    const b = row({ id: "no-src-2", away_team: "C", home_team: "D", game_time: "2026-11-22T01:30:00Z", source_game_id: "" });
    expect(dedupePublicGames([a, b])).toHaveLength(2);
  });

  it("the same feed id in two different leagues", () => {
    // source_game_id comes from a different feed per league; nothing guarantees
    // it is unique across them.
    const cfb = row({ id: "cfb-1", league: "CFB", away_team: "A", home_team: "B", game_time: "2026-11-21T23:30:00Z", source_game_id: "shared-id" });
    const nfl = row({ id: "nfl-1", league: "NFL", away_team: "C", home_team: "D", game_time: "2026-11-22T01:30:00Z", source_game_id: "shared-id" });
    expect(dedupePublicGames([cfb, nfl])).toHaveLength(2);
  });

  it("a real doubleheader-style pair with different feed ids on one day", () => {
    // Same teams, same day, two feed events. The FIRST pass still owns this
    // case and still keeps the more complete row — unchanged by this change.
    const thin = row({ id: "dh-thin", away_team: "A", home_team: "B", game_time: "2026-11-21T17:00:00Z", source_game_id: "dh-1", spread_line: null, total_line: null, status: null, updated_at: "2026-11-19T06:00:00.000Z" });
    const full = row({ id: "dh-full", away_team: "A", home_team: "B", game_time: "2026-11-21T22:00:00Z", source_game_id: "dh-2", updated_at: "2026-11-15T06:00:00.000Z" });
    const kept = dedupePublicGames([thin, full]) as Row[];
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe("dh-full");
  });
});
