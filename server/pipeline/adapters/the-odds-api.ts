/**
 * Edge Setter — The Odds API Adapter  (Sprint 7)
 *
 * Source: https://the-odds-api.com
 * Free tier: 500 requests/month.
 * Env: THE_ODDS_API_KEY
 *
 * Fetches spreads + totals for NBA and MLB games.
 * Normalizes each game into:
 *   1. A Game record (upserted to games table)
 *   2. A RawEvent of type "line_move" (if line changed) or "odds_open" (new game)
 *
 * Called by the ingestion scheduler every 15 minutes during active hours.
 */

import { upsertGame, getGame, insertRawEvent, insertOddsSnapshot, getOddsFetchState, recordOddsFetchState, type OddsFetchState } from "../store";
import type { League } from "../types";
import { canonicalGameId } from "../canonical-game-id";

const API_KEY = process.env.THE_ODDS_API_KEY ?? "";
const BASE_URL = "https://api.the-odds-api.com/v4";

/* ─── Persistent throttle + quota guard ───────────────────────
 *
 * The 20K-credit plan was burning ~34k credits/month: every /odds call costs 3
 * credits (spreads,totals,h2h × us region) and we fired 4 leagues every 15 min
 * plus on every boot, then kept hammering 401s once the quota ran dry. This guard
 * throttles each league to at most once per ODDS_MIN_INTERVAL_MIN and stops
 * calling entirely for the rest of the UTC month once credits are exhausted
 * (credits reset on the 1st at 00:00 UTC). State lives in SQLite so the frequent
 * Render restarts don't reset it.
 */

/** Minimum minutes between successful odds fetches per league (env-tunable). */
function oddsMinIntervalMin(): number {
  const v = Number(process.env.ODDS_MIN_INTERVAL_MIN);
  return Number.isFinite(v) && v > 0 ? v : 60;
}

/** True when `iso` falls in the same UTC year+month as `now` (credit-reset boundary). */
function sameUTCMonth(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

/**
 * Decide whether to skip an odds fetch for a league, given its persisted state.
 * Pure + exported so the skip rules can be unit-tested without a DB or network.
 *
 * Skip when:
 *   a) the last success was within `minIntervalMin` minutes (throttle), or
 *   b) last_remaining is known and < 3 and the last attempt was this UTC month
 *      (out of credits — they only reset on the 1st at 00:00 UTC), or
 *   c) the last status was 401 and the last attempt was this UTC month.
 */
export function shouldSkipOddsFetch(
  state: OddsFetchState | null | undefined,
  now: Date,
  minIntervalMin: number,
): { skip: boolean; reason?: string } {
  if (!state) return { skip: false };

  // a) throttle window since last SUCCESS
  if (state.last_success_at) {
    const ageMs = now.getTime() - new Date(state.last_success_at).getTime();
    if (ageMs >= 0 && ageMs < minIntervalMin * 60_000) {
      return { skip: true, reason: `throttled — last success ${Math.round(ageMs / 60_000)}m ago (< ${minIntervalMin}m)` };
    }
  }

  // b) low remaining credits, same UTC month as the last attempt
  if (
    state.last_remaining !== null && state.last_remaining !== undefined && state.last_remaining < 3 &&
    state.last_attempt_at && sameUTCMonth(state.last_attempt_at, now)
  ) {
    return { skip: true, reason: `low credits — ${state.last_remaining} remaining this UTC month` };
  }

  // c) out of credits (401), same UTC month as the last attempt
  if (state.last_status === 401 && state.last_attempt_at && sameUTCMonth(state.last_attempt_at, now)) {
    return { skip: true, reason: `out of credits — last call returned 401 this UTC month` };
  }

  return { skip: false };
}

// Betting key numbers — thresholds where public/sharp behavior shifts sharply.
// Same list the client scorer uses (client/src/lib/signalScorer.ts scoreMarketImpact),
// applied identically so a signal scores the same on server and client. A line move
// that crosses one of these sets crossed_key_number on the payload, which the scorer
// reads (buildScoreInputs -> ScoreInputs.crossedKeyNumber) for a +3 market bonus.
const KEY_NUMBERS = [3, 3.5, 6.5, 7, 10, 10.5, 14];

export function crossesKeyNumber(open: number, current: number): boolean {
  const o = Math.abs(open);
  const c = Math.abs(current);
  return KEY_NUMBERS.some((kn) => (o < kn && c >= kn) || (o > kn && c <= kn));
}

/* Sport keys for The Odds API */
const SPORT_KEYS: Record<League, string> = {
  NBA: "basketball_nba",
  MLB: "baseball_mlb",
  NFL: "americanfootball_nfl",
  CFB: "americanfootball_ncaaf",
};

export interface OddsAPIGame {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsAPIBookmaker[];
}

interface OddsAPIBookmaker {
  key: string;
  title: string;
  markets: OddsAPIMarket[];
}

interface OddsAPIMarket {
  key: "spreads" | "totals" | "h2h";
  outcomes: OddsAPIOutcome[];
}

interface OddsAPIOutcome {
  name: string;
  price: number;  // American odds for h2h; decimal for spreads
  point?: number; // spread/total value
}

/* ─── Fetch odds for a league ─────────────────────────────── */

interface FetchOddsResult {
  games: OddsAPIGame[];
  status: number;             // HTTP status; 0 on a network/transport error
  remaining: number | null;   // x-requests-remaining header, if present
}

export async function fetchOdds(league: League): Promise<FetchOddsResult> {
  if (!API_KEY) {
    throw new Error("THE_ODDS_API_KEY is not set — odds fetch skipped");
  }

  const sportKey = SPORT_KEYS[league];
  const url = `${BASE_URL}/sports/${sportKey}/odds/?apiKey=${API_KEY}&regions=us&markets=spreads,totals,h2h&oddsFormat=american&dateFormat=iso`;

  const parseInt10 = (v: string | null): number | null => {
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  try {
    const resp = await fetch(url);
    const remaining = parseInt10(resp.headers.get("x-requests-remaining"));
    if (!resp.ok) {
      console.error(`[odds-api] HTTP ${resp.status} for ${league}. Remaining quota: ${remaining}`);
      return { games: [], status: resp.status, remaining };
    }
    const used = resp.headers.get("x-requests-used");
    const last = resp.headers.get("x-requests-last");
    console.log(`[odds-api] ${league} fetched. Remaining: ${remaining} · used: ${used} · last: ${last}`);
    return { games: (await resp.json()) as OddsAPIGame[], status: resp.status, remaining };
  } catch (err: any) {
    console.error(`[odds-api] Fetch error for ${league}:`, err.message);
    return { games: [], status: 0, remaining: null };
  }
}

/* ─── Normalize & ingest ──────────────────────────────────── */

export async function ingestOdds(league: League): Promise<{ games: number; events: number }> {
  // Persistent throttle + quota guard — skip the call entirely when we're inside
  // the throttle window or out of credits for the month (see shouldSkipOddsFetch).
  const now = new Date();
  const priorState = getOddsFetchState(league);
  const decision = shouldSkipOddsFetch(priorState, now, oddsMinIntervalMin());
  if (decision.skip) {
    console.log(`[odds-api] ${league} skipped: ${decision.reason}`);
    return { games: 0, events: 0 };
  }

  const result = await fetchOdds(league);

  // Record the attempt outcome so the throttle survives restarts. last_success_at
  // only advances on a 2xx; otherwise we carry the prior value forward.
  const nowIso = now.toISOString();
  const ok = result.status >= 200 && result.status < 300;
  recordOddsFetchState({
    league,
    last_success_at: ok ? nowIso : (priorState?.last_success_at ?? null),
    last_attempt_at: nowIso,
    last_remaining: result.remaining ?? priorState?.last_remaining ?? null,
    last_status: result.status,
  });

  const apiGames = result.games;
  let gamesUpserted = 0;
  let eventsCreated = 0;

  for (const ag of apiGames) {
    // Pick a consensus bookmaker (prefer pinnacle, then first available)
    const bm = ag.bookmakers.find(b => b.key === "pinnacle") ?? ag.bookmakers[0];
    if (!bm) continue;

    const spreadsMarket = bm.markets.find(m => m.key === "spreads");
    const totalsMarket  = bm.markets.find(m => m.key === "totals");
    const h2hMarket     = bm.markets.find(m => m.key === "h2h");

    // Extract spread
    let spreadLine: number | null = null;
    let spreadTeam: string | null = null;
    if (spreadsMarket) {
      const homeOutcome = spreadsMarket.outcomes.find(o => o.name === ag.home_team);
      if (homeOutcome?.point !== undefined) {
        spreadLine = homeOutcome.point;
        spreadTeam = ag.home_team;
      }
    }

    // Extract total
    const totalLine = totalsMarket?.outcomes.find(o => o.name === "Over")?.point ?? null;

    // Extract moneylines
    const mlHome = h2hMarket?.outcomes.find(o => o.name === ag.home_team)?.price ?? null;
    const mlAway = h2hMarket?.outcomes.find(o => o.name === ag.away_team)?.price ?? null;

    // Build canonical game id (shared helper — the one id scheme all leagues use)
    const gameId = canonicalGameId(
      league,
      ag.commence_time,
      shortCode(ag.away_team),
      shortCode(ag.home_team),
    );
insertOddsSnapshot({
  game_id: gameId,
  league,
  sportsbook: bm.key,
  spread_line: spreadLine,
  spread_team: spreadTeam ? shortCode(spreadTeam) : null,
  total_line: totalLine,
  moneyline_home: mlHome,
  moneyline_away: mlAway,
  source_game_id: ag.id,
  snapshot_at: new Date().toISOString(),
});
    // Check if game already exists for open_line tracking
    const existing = getGame(gameId);

    const game = upsertGame({
      id: gameId,
      league,
      home_team: shortCode(ag.home_team),
      away_team: shortCode(ag.away_team),
      game_time: ag.commence_time,
      status: "scheduled",
      spread_line: spreadLine,
      spread_team: spreadTeam ? shortCode(spreadTeam) : null,
      total_line: totalLine,
      moneyline_home: mlHome,
      moneyline_away: mlAway,
      // Preserve open lines from first ingest
      open_spread: existing?.open_spread ?? spreadLine,
      open_total:  existing?.open_total  ?? totalLine,
      home_score: null,
away_score: null,
      source_game_id: ag.id,
    });
    gamesUpserted++;

    // Detect line move — spread
    // Trigger: line changed this cycle AND cumulative move from open >= 0.5.
    // Comparing to spread_line (previous cycle) misses gradual moves that never
    // jump 0.5 in a single 15-min window but accumulate to a meaningful shift.
    if (existing && spreadLine !== null && existing.spread_line !== null && spreadLine !== existing.spread_line) {
      const openSpread = existing.open_spread ?? existing.spread_line;
      const deltaFromOpen = Math.abs(spreadLine - openSpread);
      if (deltaFromOpen >= 0.5) {
        insertRawEvent({
          source_id: "the_odds_api",
          source_type: "api",
          league,
          game_id: gameId,
          team: shortCode(spreadTeam ?? ag.home_team),
          player: null,
          event_type: "line_move",
          payload: {
            open_line: openSpread,
            current_line: spreadLine,
            line_delta: deltaFromOpen,
            market: "spread",
            sharp_money: false,
            crossed_key_number: crossesKeyNumber(openSpread, spreadLine),
            matchup: `${shortCode(ag.away_team)} @ ${shortCode(ag.home_team)}`,
            game_time: ag.commence_time,
            source_types: ["sportsbook"],
            source_labels: [bm.title],
            source_count: ag.bookmakers.length,
            bookmaker: bm.key,
            sources: [{ name: bm.title, type: "sportsbook" }],
          },
        });
        eventsCreated++;
        console.log(`[odds-api] Spread move: ${league} ${shortCode(ag.away_team)}@${shortCode(ag.home_team)} open ${openSpread} → ${spreadLine} (Δ${deltaFromOpen} from open, prev ${existing.spread_line})`);
      }
    }

    // Detect line move — total
    if (existing && totalLine !== null && existing.total_line !== null && totalLine !== existing.total_line) {
      const openTotal = existing.open_total ?? existing.total_line;
      const totalDeltaFromOpen = Math.abs(totalLine - openTotal);
      if (totalDeltaFromOpen >= 0.5) {
        insertRawEvent({
          source_id: "the_odds_api",
          source_type: "api",
          league,
          game_id: gameId,
          team: shortCode(ag.home_team),
          player: null,
          event_type: "line_move",
          payload: {
            open_line: openTotal,
            current_line: totalLine,
            line_delta: totalDeltaFromOpen,
            market: "total",
            sharp_money: false,
            crossed_key_number: crossesKeyNumber(openTotal, totalLine),
            matchup: `${shortCode(ag.away_team)} @ ${shortCode(ag.home_team)}`,
            game_time: ag.commence_time,
            source_types: ["sportsbook"],
            source_labels: [bm.title],
            source_count: ag.bookmakers.length,
            bookmaker: bm.key,
            sources: [{ name: bm.title, type: "sportsbook" }],
          },
        });
        eventsCreated++;
        console.log(`[odds-api] Total move: ${league} ${shortCode(ag.away_team)}@${shortCode(ag.home_team)} open O/U ${openTotal} → ${totalLine} (Δ${totalDeltaFromOpen} from open)`);
      }
    }

    if (!existing && spreadLine !== null) {
      // First time seeing this game — create odds_open event
      insertRawEvent({
        source_id: "the_odds_api",
        source_type: "api",
        league,
        game_id: gameId,
        team: shortCode(ag.home_team),
        player: null,
        event_type: "odds_open",
        payload: {
          open_spread: spreadLine,
          open_total: totalLine,
          matchup: `${shortCode(ag.away_team)} @ ${shortCode(ag.home_team)}`,
          game_time: ag.commence_time,
          bookmaker: bm.key,
        },
      });
      eventsCreated++;
    }
  }

  return { games: gamesUpserted, events: eventsCreated };
}

/* ─── Team name → short code ──────────────────────────────── */

const NAME_TO_CODE: Record<string, string> = {
  // NBA
  "Boston Celtics": "BOS", "Miami Heat": "MIA", "New York Knicks": "NYK",
  "Golden State Warriors": "GSW", "Los Angeles Lakers": "LAL",
  "Denver Nuggets": "DEN", "Oklahoma City Thunder": "OKC",
  "Milwaukee Bucks": "MIL", "Philadelphia 76ers": "PHI", "Cleveland Cavaliers": "CLE",
  "Minnesota Timberwolves": "MIN", "Dallas Mavericks": "DAL",
  "Los Angeles Clippers": "LAC", "Sacramento Kings": "SAC",
  "Phoenix Suns": "PHX", "Indiana Pacers": "IND", "Chicago Bulls": "CHI",
  "Atlanta Hawks": "ATL", "Toronto Raptors": "TOR", "Brooklyn Nets": "BKN",
  "Memphis Grizzlies": "MEM", "New Orleans Pelicans": "NOP",
  "Utah Jazz": "UTA", "Portland Trail Blazers": "POR",
  "San Antonio Spurs": "SAS", "Charlotte Hornets": "CHA",
  "Washington Wizards": "WAS", "Detroit Pistons": "DET",
  "Houston Rockets": "HOU", "Orlando Magic": "ORL",
  // MLB
  "Boston Red Sox": "BOS", "New York Yankees": "NYY", "Tampa Bay Rays": "TB",
  "Toronto Blue Jays": "TOR", "Baltimore Orioles": "BAL",
  "Chicago White Sox": "CWS", "Cleveland Guardians": "CLE",
  "Detroit Tigers": "DET", "Kansas City Royals": "KC",
  "Minnesota Twins": "MIN", "Houston Astros": "HOU",
  "Los Angeles Angels": "LAA",
  // Athletics relocated (2025); the live feed now sends a bare "Athletics" and
  // StatsAPI's canonical code is "ATH". Map every historical/current name form
  // to ATH so the odds row can never split from the StatsAPI row on this club.
  "Athletics": "ATH", "Oakland Athletics": "ATH", "Sacramento Athletics": "ATH",
  "Seattle Mariners": "SEA", "Texas Rangers": "TEX",
  "New York Mets": "NYM", "Atlanta Braves": "ATL",
  "Philadelphia Phillies": "PHI", "Miami Marlins": "MIA",
  "Washington Nationals": "WSH", "Chicago Cubs": "CHC",
  "Milwaukee Brewers": "MIL", "St. Louis Cardinals": "STL",
  "Pittsburgh Pirates": "PIT", "Cincinnati Reds": "CIN",
  "Los Angeles Dodgers": "LAD", "San Francisco Giants": "SF",
  "Arizona Diamondbacks": "ARI", "Colorado Rockies": "COL",
  "San Diego Padres": "SD",
  // NFL
  "Kansas City Chiefs": "KC",        "Buffalo Bills": "BUF",
  "San Francisco 49ers": "SF",       "Dallas Cowboys": "DAL",
  "Philadelphia Eagles": "PHI",      "New England Patriots": "NE",
  "Baltimore Ravens": "BAL",         "Cincinnati Bengals": "CIN",
  "Las Vegas Raiders": "LV",         "Denver Broncos": "DEN",
  "Green Bay Packers": "GB",         "Detroit Lions": "DET",
  "Miami Dolphins": "MIA",           "New York Giants": "NYG",
  "New York Jets": "NYJ",            "Los Angeles Rams": "LAR",
  "Los Angeles Chargers": "LAC",     "Seattle Seahawks": "SEA",
  "Arizona Cardinals": "ARI",        "Atlanta Falcons": "ATL",
  "Carolina Panthers": "CAR",        "Chicago Bears": "CHI",
  "Cleveland Browns": "CLE",         "Indianapolis Colts": "IND",
  "Jacksonville Jaguars": "JAX",     "Minnesota Vikings": "MIN",
  "New Orleans Saints": "NO",        "Pittsburgh Steelers": "PIT",
  "Tampa Bay Buccaneers": "TB",      "Tennessee Titans": "TEN",
  "Washington Commanders": "WSH",    "Houston Texans": "HOU",
  // CFB — mapped to ESPN abbreviations for score-matching
  "Alabama Crimson Tide": "ALA",     "Georgia Bulldogs": "UGA",
  "Ohio State Buckeyes": "OSU",      "Michigan Wolverines": "MICH",
  "Notre Dame Fighting Irish": "ND", "Texas Longhorns": "TEX",
  "Oregon Ducks": "ORE",             "Penn State Nittany Lions": "PSU",
  "Florida State Seminoles": "FSU",  "Oklahoma Sooners": "OU",
  "LSU Tigers": "LSU",               "Clemson Tigers": "CLEM",
  "Texas A&M Aggies": "TAMU",        "USC Trojans": "USC",
  "Tennessee Volunteers": "TENN",    "Utah Utes": "UTAH",
  "Iowa Hawkeyes": "IOWA",           "Wisconsin Badgers": "WIS",
  "TCU Horned Frogs": "TCU",         "Arkansas Razorbacks": "ARK",
  "Auburn Tigers": "AUB",            "Missouri Tigers": "MIZ",
  "Michigan State Spartans": "MSU",  "Oklahoma State Cowboys": "OKST",
  "Washington Huskies": "WASH",      "Ole Miss Rebels": "MISS",
  "Mississippi State Bulldogs": "MSST", "Kansas State Wildcats": "KSU",
  "Iowa State Cyclones": "ISU",      "Baylor Bears": "BAY",
  "Colorado Buffaloes": "COLO",      "North Carolina Tar Heels": "UNC",
  "Louisville Cardinals": "LOU",     "Virginia Tech Hokies": "VT",
  "West Virginia Mountaineers": "WVU", "Pittsburgh Panthers": "PITT",
  "NC State Wolfpack": "NCST",       "Duke Blue Devils": "DUKE",
  "UCLA Bruins": "UCLA",             "Stanford Cardinal": "STAN",
  "California Golden Bears": "CAL",  "Arizona Wildcats": "ARIZ",
  "Arizona State Sun Devils": "ASU", "Utah State Aggies": "USU",
  "Boise State Broncos": "BSU",      "Air Force Falcons": "AFA",
  "Army Black Knights": "ARMY",      "Navy Midshipmen": "NAVY",
};

function shortCode(name: string): string {
  return NAME_TO_CODE[name] ?? name.split(" ").pop()?.slice(0, 3).toUpperCase() ?? name.slice(0, 3).toUpperCase();
}
