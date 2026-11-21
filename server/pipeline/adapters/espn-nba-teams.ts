/**
 * ESPN NBA team name → our games-table code.
 *
 * A leaf module with no imports, so a read-only script can resolve teams the
 * same way the adapter does without loading ../store — which imports
 * ../storage, and that opens edge_setter.db read-write and runs its schema on
 * import.
 */

export const NBA_DISPLAY_TO_ABBR: Record<string, string> = {
  "atlanta hawks": "ATL", "boston celtics": "BOS", "brooklyn nets": "BKN",
  "charlotte hornets": "CHA", "chicago bulls": "CHI", "cleveland cavaliers": "CLE",
  "dallas mavericks": "DAL", "denver nuggets": "DEN", "detroit pistons": "DET",
  "golden state warriors": "GSW", "houston rockets": "HOU", "indiana pacers": "IND",
  "los angeles clippers": "LAC", "los angeles lakers": "LAL", "memphis grizzlies": "MEM",
  "miami heat": "MIA", "milwaukee bucks": "MIL", "minnesota timberwolves": "MIN",
  "new orleans pelicans": "NOP", "new york knicks": "NYK", "oklahoma city thunder": "OKC",
  "orlando magic": "ORL", "philadelphia 76ers": "PHI", "phoenix suns": "PHX",
  "portland trail blazers": "POR", "sacramento kings": "SAC", "san antonio spurs": "SAS",
  "toronto raptors": "TOR", "utah jazz": "UTA", "washington wizards": "WAS",
};

/**
 * Our games-table code → the team's full name, as The Odds API spells it (the
 * NBA keys of the odds adapter's NAME_TO_CODE, which is what writes
 * games.home_team_name on every row it touches). Every code is one club, so a
 * games row's code names its team exactly; this is what lets NBA rows created
 * before the name columns existed be named after the fact.
 */
export const NBA_TEAM_NAME_BY_ABBR: Readonly<Record<string, string>> = {
  ATL: "Atlanta Hawks", BOS: "Boston Celtics", BKN: "Brooklyn Nets",
  CHA: "Charlotte Hornets", CHI: "Chicago Bulls", CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks", DEN: "Denver Nuggets", DET: "Detroit Pistons",
  GSW: "Golden State Warriors", HOU: "Houston Rockets", IND: "Indiana Pacers",
  LAC: "Los Angeles Clippers", LAL: "Los Angeles Lakers", MEM: "Memphis Grizzlies",
  MIA: "Miami Heat", MIL: "Milwaukee Bucks", MIN: "Minnesota Timberwolves",
  NOP: "New Orleans Pelicans", NYK: "New York Knicks", OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic", PHI: "Philadelphia 76ers", PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers", SAC: "Sacramento Kings", SAS: "San Antonio Spurs",
  TOR: "Toronto Raptors", UTA: "Utah Jazz", WAS: "Washington Wizards",
};

/**
 * Our games-table code for a scoreboard competitor, by team NAME first.
 *
 * ESPN's scoreboard abbreviations are not ours for six teams — GS, NO, NY, SA,
 * UTAH, WSH against our GSW, NOP, NYK, SAS, UTA, WAS — so passing them straight
 * to findGameByTeams missed every game those teams played: on prod
 * (2026-11-20) 87 past NBA games were still "scheduled" and none of the six had
 * a single final. The display name goes through NBA_DISPLAY_TO_ABBR, the map
 * the injury adapter already writes our codes with, so both paths agree.
 *
 * Name first, not abbreviation first as the injury adapter's resolveNBATeamAbbr
 * does: the injury feed's groups carry no abbreviation, the scoreboard's teams
 * always do, and it is the scoreboard's abbreviation that is wrong. The
 * abbreviation is only the fall-back for a name the map doesn't hold — today
 * just "LA Clippers" (the map has "los angeles clippers"), whose ESPN code LAC
 * is also ours.
 */
export function resolveNBAScoreboardTeam(team: { abbreviation: string; displayName?: string }): string {
  return NBA_DISPLAY_TO_ABBR[team.displayName?.toLowerCase().trim() ?? ""] ?? team.abbreviation;
}
