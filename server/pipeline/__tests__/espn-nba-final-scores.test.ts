import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * NBA final scores reach our games rows for every team.
 *
 * ESPN's scoreboard abbreviates six teams differently from our games table —
 * GS, NO, NY, SA, UTAH, WSH against GSW, NOP, NYK, SAS, UTA, WAS — and
 * fetchNBAFinalScores passed those codes straight to findGameByTeams. On prod
 * (2026-11-20) 87 past NBA games were still "scheduled", and none of the six
 * teams had a single final. The scoreboard used here is ESPN's real one for
 * 2026-11-19 (fixtures/espn-nba-scoreboard-20261119.json), and the rows are the
 * four prod games it covers. With ESPN's codes passed straight through, only
 * POR @ MIL matched.
 *
 * global fetch is stubbed rather than the adapter, so the real
 * fetchNBAFinalScores -> findGameByTeams path runs against a real SQLite file.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-nba-finals-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;

type StoreMod = typeof import("../store");
type NbaMod = typeof import("../adapters/espn-nba");
let store: StoreMod;
let nba: NbaMod;

const SCOREBOARD = JSON.parse(fs.readFileSync(
  path.join(__dirname, "fixtures", "espn-nba-scoreboard-20261119.json"), "utf8",
)) as { events: Array<{ date: string }> };

/** The four prod rows, as stored (codes, ids and tip-off times copied from /api/v2/games). */
const PROD_ROWS = [
  { id: "NBA_2026_11_20_GSW_MEM", home: "MEM", away: "GSW" },
  { id: "NBA_2026_11_20_POR_MIL", home: "MIL", away: "POR" },
  { id: "NBA_2026_11_20_NYK_MIN", home: "MIN", away: "NYK" },
  { id: "NBA_2026_11_20_LAC_SAS", home: "SAS", away: "LAC" },
];

function stubScoreboard(events: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = String(url).includes("dates=20261119") ? { events } : { events: [] };
    return { ok: true, status: 200, json: async () => body } as Response;
  }));
}

beforeAll(async () => {
  store = await import("../store");
  nba = await import("../adapters/espn-nba");
  for (const row of PROD_ROWS) {
    store.upsertGame({
      id: row.id, league: "NBA", home_team: row.home, away_team: row.away,
      game_time: "2026-11-20T01:10:00Z", status: "scheduled",
      spread_line: null, spread_team: null, total_line: null,
      moneyline_home: null, moneyline_away: null, open_spread: null, open_total: null,
      home_score: null, away_score: null, source_game_id: null,
    } as never);
  }
  // fetchNBAFinalScores reads "today" and "yesterday" off the clock.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T09:35:00Z"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(() => {
  vi.useRealTimers();
});

describe("fetchNBAFinalScores", () => {
  it("matches all four games on ESPN's 2026-11-19 scoreboard to their prod rows", async () => {
    stubScoreboard(SCOREBOARD.events);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const scores = await nba.fetchNBAFinalScores();
    expect(scores.sort((a, b) => a.game_id.localeCompare(b.game_id))).toEqual([
      { game_id: "NBA_2026_11_20_GSW_MEM", home_score: 126, away_score: 98 },
      { game_id: "NBA_2026_11_20_LAC_SAS", home_score: 124, away_score: 112 },
      { game_id: "NBA_2026_11_20_NYK_MIN", home_score: 99, away_score: 102 },
      { game_id: "NBA_2026_11_20_POR_MIL", home_score: 114, away_score: 124 },
    ]);
    // Every game matched, so no zero-match warning. LA Clippers is the one name
    // the map does not hold ("los angeles clippers"), so that code came from
    // ESPN's abbreviation, and that is said.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe(
      `[espn-nba] 1 team(s) not in the name map, resolved by ESPN abbreviation: "LA Clippers" → LAC in LAC@SAS 2026-11-20`,
    );
  });

  it("would have matched only POR @ MIL with ESPN's codes passed straight through", () => {
    const raw = [["MEM", "GS"], ["MIL", "POR"], ["MIN", "NY"], ["SA", "LAC"]]
      .filter(([home, away]) => store.findGameByTeams("NBA", home, away, "2026-11-20"));
    expect(raw).toEqual([["MIL", "POR"]]);
  });

  it("warns with a count when a completed ESPN game matches no games row", async () => {
    // The same real game, moved to a date we hold no row for.
    const moved = JSON.parse(JSON.stringify(SCOREBOARD.events[0]));
    moved.date = "2026-11-25T01:00Z";
    stubScoreboard([...SCOREBOARD.events, moved]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const scores = await nba.fetchNBAFinalScores();
    expect(scores).toHaveLength(4);
    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages.filter((m) => m.includes("matched no games row"))).toEqual([
      "[espn-nba] 1 completed ESPN game(s) matched no games row: GSW@MEM 2026-11-25",
    ]);
  });

  it("warns, with the team name and matchup, for each code that came from ESPN's abbreviation", async () => {
    // A name the map does not hold, on a game we do hold a row for.
    const renamed = JSON.parse(JSON.stringify(SCOREBOARD.events[0]));
    renamed.competitions[0].competitors.find((c: { homeAway: string }) => c.homeAway === "away").team =
      { abbreviation: "GSW", displayName: "Golden State" };
    stubScoreboard([renamed]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const scores = await nba.fetchNBAFinalScores();
    expect(scores).toEqual([{ game_id: "NBA_2026_11_20_GSW_MEM", home_score: 126, away_score: 98 }]);
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
      `[espn-nba] 1 team(s) not in the name map, resolved by ESPN abbreviation: "Golden State" → GSW in GSW@MEM 2026-11-20`,
    ]);
  });
});

describe("resolveNBAScoreboardTeam", () => {
  // Every team as ESPN's scoreboard names it (2026-11-10 … 11-19), and the code our games table stores.
  const ESPN_TEAMS: Array<[string, string, string]> = [
    ["ATL", "Atlanta Hawks", "ATL"], ["BOS", "Boston Celtics", "BOS"], ["BKN", "Brooklyn Nets", "BKN"],
    ["CHA", "Charlotte Hornets", "CHA"], ["CHI", "Chicago Bulls", "CHI"], ["CLE", "Cleveland Cavaliers", "CLE"],
    ["DAL", "Dallas Mavericks", "DAL"], ["DEN", "Denver Nuggets", "DEN"], ["DET", "Detroit Pistons", "DET"],
    ["GS", "Golden State Warriors", "GSW"], ["HOU", "Houston Rockets", "HOU"], ["IND", "Indiana Pacers", "IND"],
    ["LAC", "LA Clippers", "LAC"], ["LAL", "Los Angeles Lakers", "LAL"], ["MEM", "Memphis Grizzlies", "MEM"],
    ["MIA", "Miami Heat", "MIA"], ["MIL", "Milwaukee Bucks", "MIL"], ["MIN", "Minnesota Timberwolves", "MIN"],
    ["NO", "New Orleans Pelicans", "NOP"], ["NY", "New York Knicks", "NYK"], ["OKC", "Oklahoma City Thunder", "OKC"],
    ["ORL", "Orlando Magic", "ORL"], ["PHI", "Philadelphia 76ers", "PHI"], ["PHX", "Phoenix Suns", "PHX"],
    ["POR", "Portland Trail Blazers", "POR"], ["SAC", "Sacramento Kings", "SAC"], ["SA", "San Antonio Spurs", "SAS"],
    ["TOR", "Toronto Raptors", "TOR"], ["UTAH", "Utah Jazz", "UTA"], ["WSH", "Washington Wizards", "WAS"],
  ];

  it("gives our code for all 30 teams", () => {
    for (const [abbreviation, displayName, ours] of ESPN_TEAMS) {
      expect(nba.resolveNBAScoreboardTeam({ abbreviation, displayName }), displayName).toBe(ours);
    }
  });
});
