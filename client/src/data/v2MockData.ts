/* ────────────────────────────────────────────────────────────
   Edge Setter v2 — Mock/stub data for NBA + MLB boards
   All entries clearly labeled as STUB. Replace with live API
   data when signal ingestion is wired to NBA/MLB sources.
   ──────────────────────────────────────────────────────────── */

export type SignalType =
  | "injury"
  | "line_move"
  | "matchup_edge"
  | "rotation"
  | "lineup"
  | "trend"
  | "prop"
  | "news";

export type Verdict = "confirmed" | "likely" | "rumor" | "contradicted" | "review";

export interface V2Signal {
  id: string;
  sport: "NBA" | "MLB";
  type: SignalType;
  player?: string;
  team: string;
  opponent?: string;
  headline: string;
  detail: string;
  why_it_matters: string;
  action_takeaway: string;
  verdict: Verdict;
  confidence: number;
  sources: number;
  timestamp: string;
  tags: string[];
  _stub: true;
}

export const NBA_SIGNALS: V2Signal[] = [
  {
    id: "nba-001",
    sport: "NBA",
    type: "injury",
    player: "Anthony Davis",
    team: "LAL",
    opponent: "GSW",
    headline: "Anthony Davis listed as questionable — left ankle soreness",
    detail: "Davis was a late add to the injury report after Thursday's shootaround. Described as manageable but monitored. He's played all 5 playoff games, averaging 28.4 pts / 12.1 reb.",
    why_it_matters: "Davis is the load-bearing axis of LAL's defense. A limited Davis opens up the paint for Curry drives and changes LAL's help rotations significantly.",
    action_takeaway: "Monitor official status at 7:00 PM ET. If downgraded, fade LAL team total; look at GSW alt spreads.",
    verdict: "likely",
    confidence: 78,
    sources: 8,
    timestamp: "2h ago",
    tags: ["injury", "playoffs", "LAL", "GSW"],
    _stub: true,
  },
  {
    id: "nba-002",
    sport: "NBA",
    type: "line_move",
    team: "BOS",
    opponent: "MIA",
    headline: "BOS -6.5 → -8 sharp-side steam — Celtics absorbing buy-side",
    detail: "Line moved 1.5 points across major books with reverse public action. 63% of tickets on MIA but 71% of money on BOS. Classic sharp-fade pattern on a short-rest Miami team.",
    why_it_matters: "Steam moves of 1.5+ pts in the playoffs historically indicate pro syndicate positioning. BOS is 8-2 ATS at home in elimination spots since 2021.",
    action_takeaway: "Buy BOS if you can still get -7.5 or better. Public hammering MIA creates line value on Boston.",
    verdict: "confirmed",
    confidence: 84,
    sources: 12,
    timestamp: "45m ago",
    tags: ["line_move", "steam", "BOS", "MIA"],
    _stub: true,
  },
  {
    id: "nba-003",
    sport: "NBA",
    type: "matchup_edge",
    player: "Jaylen Brown",
    team: "BOS",
    opponent: "MIA",
    headline: "Brown vs Butler matchup: BOS exploiting Butler's right-hand bias",
    detail: "Film review shows Butler forcing opponents left at 73% rate. Brown generates 1.18 PPP when attacking right → left cross. BOS ran this action 14 times in Game 3; Brown converted 9.",
    why_it_matters: "If BOS continues scheming Brown on Butler matchup possessions, Brown's scoring line is underpriced. He's listed at 24.5 pts.",
    action_takeaway: "Target J. Brown over 24.5 pts. BOS usage vs Butler matchup supports the volume.",
    verdict: "likely",
    confidence: 71,
    sources: 5,
    timestamp: "3h ago",
    tags: ["matchup", "props", "BOS", "MIA"],
    _stub: true,
  },
  {
    id: "nba-004",
    sport: "NBA",
    type: "rotation",
    player: "Nikola Jokic",
    team: "DEN",
    opponent: "MIN",
    headline: "Denver closing lineup shift — Jokic logged 42 of 48 mins in Game 4",
    detail: "Mike Malone effectively abandoned the DeAndre Jordan closing experiment. Jokic is now the only center in crunch rotations. His minutes cap appears removed for playoff games.",
    why_it_matters: "Uncapped Jokic minutes means rebounds and assists prop totals are ceiling-free. In 42+ min games this season, he averages 14.2 reb and 11.8 ast.",
    action_takeaway: "Jokic triple-double is +115 — value given the rotation news. Assists over 10.5 is also in play.",
    verdict: "confirmed",
    confidence: 91,
    sources: 6,
    timestamp: "1h ago",
    tags: ["rotation", "props", "DEN", "MIN"],
    _stub: true,
  },
  {
    id: "nba-005",
    sport: "NBA",
    type: "prop",
    player: "Stephen Curry",
    team: "GSW",
    opponent: "LAL",
    headline: "Curry 3PM prop inflated — LAL switching scheme limiting pull-up volume",
    detail: "LAL is the only defense running a true switch-everything scheme vs GSW. It cuts Curry's off-screen 3PA from 7.2 (season) to 4.1 (this series). His 3PM line (4.5) hasn't adjusted.",
    why_it_matters: "If defensive scheme suppresses Curry pull-ups, the over on 4.5 3PM is vulnerable. He's hit it 2 of 5 games in this series despite high usage.",
    action_takeaway: "Fade Curry 3PM over 4.5. Under is +108 — positive expected value given scheme context.",
    verdict: "likely",
    confidence: 68,
    sources: 4,
    timestamp: "4h ago",
    tags: ["prop", "fade", "GSW", "LAL"],
    _stub: true,
  },
  {
    id: "nba-006",
    sport: "NBA",
    type: "news",
    player: "Giannis Antetokounmpo",
    team: "MIL",
    headline: "Giannis officially ruled out — knee soreness, missed practice",
    detail: "MIL announced Giannis will not play in Game 5. Khris Middleton expected to start and Damian Lillard will see increased usage. Bucks are -8.5 road underdogs without him.",
    why_it_matters: "Without Giannis, MIL loses their rim-protection and primary ball-handler. The market likely hasn't fully priced the total shift — IND spreads and team totals are both exposed.",
    action_takeaway: "Bet IND -8.5 or better. IND team total over looks live. Middleton and Lillard props will be inflated — fade.",
    verdict: "confirmed",
    confidence: 99,
    sources: 14,
    timestamp: "22m ago",
    tags: ["injury", "ruled out", "MIL", "IND"],
    _stub: true,
  },
  {
    id: "nba-007",
    sport: "NBA",
    type: "trend",
    team: "NYK",
    opponent: "PHI",
    headline: "Knicks 7-1 ATS in elimination games under Tom Thibodeau",
    detail: "Since 2022, NYK is 7-1 ATS when facing elimination, with an average cover margin of +5.2. The formula: massive defensive intensity spike, Jalen Brunson usage >31%, bench contraction.",
    why_it_matters: "Trends don't predict outcomes but this is sample-size meaningful. NYK -3.5 at home with elimination pressure matches their historical profile precisely.",
    action_takeaway: "NYK ATS vs a Philadelphia team averaging 4.2 more turnovers on the road. Lean NYK.",
    verdict: "likely",
    confidence: 65,
    sources: 3,
    timestamp: "6h ago",
    tags: ["trend", "ATS", "NYK", "PHI"],
    _stub: true,
  },
  {
    id: "nba-008",
    sport: "NBA",
    type: "injury",
    player: "Ja Morant",
    team: "MEM",
    headline: "Ja Morant — practice report: full participant, no restrictions",
    detail: "After 2 games with a minutes restriction, Morant was a full practice participant. The team removed the conditioning flag from his injury report. Expected full workload.",
    why_it_matters: "Morant returning to full minutes (30+) raises his floor on all props. His per-36 numbers haven't changed — just the opportunity.",
    action_takeaway: "Morant points over looks underpriced if his line was set on restricted-minutes assumption. Confirm injury report at 5:30 ET.",
    verdict: "likely",
    confidence: 73,
    sources: 7,
    timestamp: "5h ago",
    tags: ["injury", "return", "MEM"],
    _stub: true,
  },
  {
    id: "nba-009",
    sport: "NBA",
    type: "matchup_edge",
    player: "Draymond Green",
    team: "GSW",
    opponent: "LAL",
    headline: "Draymond foul trouble risk — LAL scheming post-up switches deliberately",
    detail: "LAL's playbook vs DRG: run Davis into Draymond on post-up seals, force him to commit early fouls. Davis targeted DRG on 11 of 14 post-up possessions in Game 3. DRG averaged 4.3 fouls in those games.",
    why_it_matters: "Draymond's minutes prop (28.5) is vulnerable if LAL successfully draws early foul trouble. GSW's defensive scheme collapses without him.",
    action_takeaway: "DRG under 28.5 min is actionable if he's in foul trouble by Q2. Live-bet angle: watch first 6 minutes.",
    verdict: "review",
    confidence: 58,
    sources: 3,
    timestamp: "2h ago",
    tags: ["matchup", "foul trouble", "GSW", "LAL"],
    _stub: true,
  },
  {
    id: "nba-010",
    sport: "NBA",
    type: "line_move",
    team: "OKC",
    opponent: "DAL",
    headline: "OKC-DAL total opened 214.5 → moved to 211.5 — sharp under action",
    detail: "Total moved 3 points in 4 hours. 78% of tickets on over but 82% of money on under. Book-wide under movement suggests coordinated sharp positioning. Both teams top-10 defensive rating this playoff run.",
    why_it_matters: "3-point total moves almost never happen without serious syndicate involvement. Under 211 or better if available.",
    action_takeaway: "Target under 211.5 or better. Do not take over at 211.5 given this steam pattern.",
    verdict: "confirmed",
    confidence: 87,
    sources: 9,
    timestamp: "1h ago",
    tags: ["line_move", "total", "OKC", "DAL"],
    _stub: true,
  },
  {
    id: "nba-011",
    sport: "NBA",
    type: "prop",
    player: "Luka Dončić",
    team: "DAL",
    opponent: "OKC",
    headline: "Luka assists over 8.5 — OKC switching creating passing lanes",
    detail: "OKC's switch-everything coverage opens corner passing windows that Luka exploits for hockey assists. In 5 games vs OKC this season, he averaged 10.2 assists. Market stuck at 8.5.",
    why_it_matters: "When OKC can't sag off shooters, Luka's dump-off game activates. Kyrie Irving and P.J. Washington are 2 corner threats OKC can't ignore.",
    action_takeaway: "Luka assists over 8.5 at -108 looks underpriced for this matchup.",
    verdict: "likely",
    confidence: 76,
    sources: 6,
    timestamp: "3h ago",
    tags: ["prop", "assists", "DAL", "OKC"],
    _stub: true,
  },
  {
    id: "nba-012",
    sport: "NBA",
    type: "news",
    player: "Victor Wembanyama",
    team: "SAS",
    headline: "Wemby named Defensive Player of the Year — unanimous",
    detail: "Victor Wembanyama won DPOY unanimously in his second season. Led the league in blocks (4.6) and was top-5 in steals. SAA's offseason priorities shift to building around him long-term.",
    why_it_matters: "Long-term team construction signal. Wemby props and SAA futures look better with confirmed franchise status. Summer league and offseason roster news will carry more weight.",
    action_takeaway: "Award news is priced in. Monitor SAA free agency + trade targets this summer.",
    verdict: "confirmed",
    confidence: 99,
    sources: 22,
    timestamp: "8h ago",
    tags: ["news", "award", "SAS"],
    _stub: true,
  },
];

export const MLB_SIGNALS: V2Signal[] = [
  {
    id: "mlb-001",
    sport: "MLB",
    type: "lineup",
    player: "Gerrit Cole",
    team: "NYY",
    opponent: "HOU",
    headline: "Cole scratched — right elbow inflammation, 7-day IL likely",
    detail: "New York confirmed Cole will not make his scheduled start. Marcus Stroman moved into the rotation. Cole's second IL stint this season; team says it's precautionary but timeline is unclear.",
    why_it_matters: "NYY rotation depth is thin. Stroman's ERA vs HOU lefty lineup is 5.12 in 3 career appearances.",
    action_takeaway: "Fade NYY ML with Stroman starting. HOU team total over looks live.",
    verdict: "confirmed",
    confidence: 97,
    sources: 11,
    timestamp: "1h ago",
    tags: ["injury", "pitcher", "NYY", "HOU"],
    _stub: true,
  },
  {
    id: "mlb-002",
    sport: "MLB",
    type: "line_move",
    team: "ATL",
    opponent: "LAD",
    headline: "ATL-LAD F5 total moved 0.5 — early sharp under steam",
    detail: "F5 total opened 4.5, moved to 4.0 across the market. Both Fried and Yamamoto are projected starters. Fried's pitch count has been restricted in starts following rest of 6+ days.",
    why_it_matters: "F5 under 4.0 in an elite pitcher matchup is standard sharp play. Fried's recent starts with 7+ days rest average 4.1 innings — shorter outings suppress F5 scoring.",
    action_takeaway: "F5 under 4.0 at -105 is the target. Do not buy into first-five juice above -125.",
    verdict: "likely",
    confidence: 72,
    sources: 7,
    timestamp: "2h ago",
    tags: ["line_move", "F5", "ATL", "LAD"],
    _stub: true,
  },
  {
    id: "mlb-003",
    sport: "MLB",
    type: "trend",
    team: "BAL",
    headline: "Baltimore 11-3 in day games under Brandon Hyde — weather advantage today",
    detail: "BAL's 11-3 day game record is driven by bullpen freshness and their hitters' avg .303 against RHP in afternoon games (1-4 PM ET window). Today's 1:05 PM ET start fits exactly.",
    why_it_matters: "Opponent is 4-9 in day games, making this a two-sided edge. Park factors at Camden Yards today: wind blowing out to CF at 12 mph.",
    action_takeaway: "BAL ML or RL depending on opponent line. Team total over is the cleaner play given wind.",
    verdict: "likely",
    confidence: 67,
    sources: 4,
    timestamp: "5h ago",
    tags: ["trend", "day game", "BAL"],
    _stub: true,
  },
  {
    id: "mlb-004",
    sport: "MLB",
    type: "prop",
    player: "Shohei Ohtani",
    team: "LAD",
    headline: "Ohtani strikeout prop 1.5 — contact rate vs RHP surging this month",
    detail: "Ohtani's K rate vs RHP is down to 12.4% in April (career avg 24.1%). He's making contact on breaking balls significantly more. His strikeout line of 1.5 looks overpriced.",
    why_it_matters: "Props set on seasonal averages miss month-to-month batted ball evolution. If contact rate is genuinely sustainably improved, his K line is exploitable.",
    action_takeaway: "Ohtani under 1.5 K at -120. Track swinging strike rate through lineup to confirm.",
    verdict: "review",
    confidence: 61,
    sources: 4,
    timestamp: "4h ago",
    tags: ["prop", "strikeout", "LAD"],
    _stub: true,
  },
  {
    id: "mlb-005",
    sport: "MLB",
    type: "injury",
    player: "Spencer Strider",
    team: "ATL",
    headline: "Strider cleared to throw — bullpen sessions resumed after shoulder program",
    detail: "Atlanta confirmed Strider has resumed mound sessions after his shoulder setback. No firm return timeline but the team characterized progress as 'ahead of schedule'. Rehab starts likely 3-4 weeks away.",
    why_it_matters: "Strider returning changes ATL rotation outlook significantly. Monitor roster moves and ATL futures pricing for adjustment.",
    action_takeaway: "No immediate action. Flag for ATL future reassessment in 2-3 weeks when rehab start timeline clarifies.",
    verdict: "likely",
    confidence: 74,
    sources: 8,
    timestamp: "7h ago",
    tags: ["injury", "return", "ATL"],
    _stub: true,
  },
  {
    id: "mlb-006",
    sport: "MLB",
    type: "matchup_edge",
    player: "Cody Bellinger",
    team: "CHC",
    opponent: "NYM",
    headline: "Bellinger vs Díaz — historically elite: .478 BA, 3 HR in 23 PA",
    detail: "Bellinger owns Edwin Díaz across their career matchup history. Díaz likely closes if CHC leads late — this matchup angle has cash game + prop value simultaneously.",
    why_it_matters: "Known closer matchup advantages are one of the most exploitable edges in MLB same-game parlays. Díaz's slider location has also been inconsistent in his last 4 outings.",
    action_takeaway: "Bellinger hits, runs scored, or HR in 9th-inning SameGameParlay if CHC is competitive entering the 8th.",
    verdict: "likely",
    confidence: 69,
    sources: 5,
    timestamp: "3h ago",
    tags: ["matchup", "SGP", "CHC", "NYM"],
    _stub: true,
  },
];

/* ── Tonight's NBA Slate ── */
export interface NBAGame {
  id: string;
  home: string;
  away: string;
  time: string;
  series?: string;
  spread: string;
  total: string;
  status: "upcoming" | "live" | "final";
  _stub: true;
}

export const NBA_TONIGHT: NBAGame[] = [
  { id: "g1", away: "GSW", home: "LAL", time: "7:30 PM ET", series: "LAL leads 3-2", spread: "LAL -4.5", total: "213.5", status: "upcoming", _stub: true },
  { id: "g2", away: "MIA", home: "BOS", time: "8:00 PM ET", series: "BOS leads 3-1", spread: "BOS -8", total: "208.5", status: "upcoming", _stub: true },
  { id: "g3", away: "MIN", home: "DEN", time: "10:00 PM ET", series: "Tied 2-2", spread: "DEN -5.5", total: "219", status: "upcoming", _stub: true },
];

/* ── Tool definitions ── */
export interface Tool {
  id: string;
  name: string;
  description: string;
  status: "Live" | "Beta" | "Coming Soon";
  sport: string[];
  href: string;
  icon: string;
}

export const TOOLS: Tool[] = [
  { id: "t1", name: "Matchups",       description: "Head-to-head matchup grades and scheme advantages across all sports.",  status: "Coming Soon", sport: ["NBA","MLB","NFL"],        href: "/v2/tools/matchups",       icon: "⚔️" },
  { id: "t2", name: "Player Signals", description: "Real-time player-level intelligence: props, injury flags, usage shifts.", status: "Beta",       sport: ["NBA","MLB"],             href: "/v2/tools/player-signals", icon: "📡" },
  { id: "t3", name: "Team Trends",    description: "Rolling situational records: home/away, rest, day/night, ATS, O/U.",     status: "Coming Soon", sport: ["NBA","MLB","NFL","CFB"],  href: "/v2/tools/team-trends",    icon: "📈" },
  { id: "t4", name: "Watchlist",      description: "Save signals, players, and games for quick daily review.",               status: "Coming Soon", sport: ["NBA","MLB","NFL"],        href: "/v2/my-edge",              icon: "⭐" },
  { id: "t5", name: "Market Movement",description: "Line and total movement tracker: sharp steam, reverse action, CLV.",     status: "Beta",        sport: ["NBA","MLB"],             href: "/v2/tools/market",         icon: "📊" },
  { id: "t6", name: "Props / Edges",  description: "Model-based player prop grades compared to market consensus lines.",     status: "Coming Soon", sport: ["NBA","MLB","NFL"],        href: "/v2/tools/props",          icon: "🎯" },
  { id: "t7", name: "Source Leaderboard", description: "Track accuracy and volume across all Edge Setter sources.",         status: "Live",        sport: ["NFL","NBA","MLB"],        href: "/leaderboard",            icon: "🏆" },
];
