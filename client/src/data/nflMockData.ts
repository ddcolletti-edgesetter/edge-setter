/* ────────────────────────────────────────────────────────────
   Edge Setter — NFL V1 Mock Data
   All entries labeled [STUB]. Replace with live ingestion.
   ──────────────────────────────────────────────────────────── */

export type NFLSignalType =
  | "injury"
  | "depth"
  | "camp"
  | "line_move"
  | "matchup"
  | "weather"
  | "sharp"
  | "rookie"
  | "role_change"
  | "trend"
  | "prop";

export type Verdict = "confirmed" | "likely" | "rumor" | "contradicted" | "review";

export interface NFLSignal {
  id: string;
  type: NFLSignalType;
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
  proOnly?: boolean;
  _stub: true;
}

export interface NFLGame {
  id: string;
  away: string;
  home: string;
  awayFull: string;
  homeFull: string;
  awayColor: string;
  homeColor: string;
  spread: string;
  total: string;
  time: string;
  signals: number;
  sharpPct?: number;
  network?: string;
}

export interface NFLFeaturedEdge {
  id: string;
  type: NFLSignalType;
  team: string;
  headline: string;
  body: string;
  action: string;
  verdict: Verdict;
  confidence: number;
  sources: number;
  timestamp: string;
  teamColor: string;
}

/* ── Team color map (primary, secondary) ── */
export const NFL_TEAM_COLORS: Record<string, { primary: string; secondary: string }> = {
  KC:  { primary: "#E31837", secondary: "#FFB612" },
  SF:  { primary: "#AA0000", secondary: "#B3995D" },
  BUF: { primary: "#00338D", secondary: "#C60C30" },
  PHI: { primary: "#004C54", secondary: "#A5ACAF" },
  DAL: { primary: "#003594", secondary: "#869397" },
  BAL: { primary: "#241773", secondary: "#000000" },
  MIA: { primary: "#008E97", secondary: "#FC4C02" },
  DET: { primary: "#0076B6", secondary: "#B0B7BC" },
  GB:  { primary: "#203731", secondary: "#FFB612" },
  LAR: { primary: "#003594", secondary: "#FFA300" },
  CIN: { primary: "#FB4F14", secondary: "#000000" },
  HOU: { primary: "#03202F", secondary: "#A71930" },
  MIN: { primary: "#4F2683", secondary: "#FFC62F" },
  PIT: { primary: "#FFB612", secondary: "#101820" },
  NE:  { primary: "#002244", secondary: "#C60C30" },
  NYG: { primary: "#0B2265", secondary: "#A71930" },
};

/* ── NFL Signals (12 mock) ── */
export const NFL_SIGNALS: NFLSignal[] = [
  {
    id: "nfl-001",
    type: "injury",
    player: "Christian McCaffrey",
    team: "SF",
    opponent: "DAL",
    headline: "McCaffrey (rib) DNP Wednesday — questionable for Week 1",
    detail: "McCaffrey was a DNP at Wednesday's practice with a rib contusion sustained in the final preseason game. Elijah Mitchell took first-team reps. Kyle Shanahan said he expects McCaffrey to be a game-time decision.",
    why_it_matters: "McCaffrey is the central axis of SF's offense — 439 touches last season, averaging 6.0 YPC. If he's out or limited, the 49ers' floor collapses significantly against a stout Dallas front seven.",
    action_takeaway: "Monitor Friday's practice report. If McCaffrey is ruled out, fade SF team total and look at DAL covering the spread at -1.5.",
    verdict: "confirmed",
    confidence: 91,
    sources: 11,
    timestamp: "47m ago",
    tags: ["injury", "SF", "DAL", "RB", "week1"],
    _stub: true,
  },
  {
    id: "nfl-002",
    type: "line_move",
    team: "KC",
    opponent: "BUF",
    headline: "KC -3.5 → -5.5 since open — sharp action driving Chiefs line",
    detail: "The Chiefs opened at -3.5 on Sunday night and have moved to -5.5 by Wednesday afternoon. 68% of spread tickets are on Buffalo, but 71% of the money is on KC — classic sharp fade of public.\",",
    why_it_matters: "When ticket count and money percentage diverge this sharply this early in the week, it's a reliable sharp signal. The books are not moving this because of public action.",
    action_takeaway: "Lean KC -5 or better. If the line climbs past -6, the value degrades. Current window is -5 to -5.5.",
    verdict: "likely",
    confidence: 84,
    sources: 7,
    timestamp: "1h ago",
    tags: ["line_move", "KC", "BUF", "sharp", "week3"],
    proOnly: true,
    _stub: true,
  },
  {
    id: "nfl-003",
    type: "depth",
    player: "Raheem Mostert",
    team: "MIA",
    opponent: "NYG",
    headline: "De'Von Achane elevated — Mostert dropped to 2nd string in final depth chart",
    detail: "Miami released their official Week 1 depth chart Tuesday showing De'Von Achane as the RB1. Mostert logged limited reps Wednesday with what the team described as 'scheduled rest.' Beat writer for Sun-Sentinel confirms Achane is the clear lead back.",
    why_it_matters: "Achane was a yards-per-carry monster last season (6.4 YPC). This usage signal means target his rushing prop and Miami's backfield usage entirely differently.",
    action_takeaway: "Target Achane rushing yards props over the number. Fade Mostert entirely for this week's GPPs.",
    verdict: "confirmed",
    confidence: 88,
    sources: 9,
    timestamp: "2h ago",
    tags: ["depth", "MIA", "RB", "usage"],
    _stub: true,
  },
  {
    id: "nfl-004",
    type: "camp",
    player: "Malik Nabers",
    team: "NYG",
    opponent: "DAL",
    headline: "Nabers takes all first-team WR1 reps in Giants camp — Hyatt pushed to slot",
    detail: "Rookie WR Malik Nabers has taken every first-team rep at outside WR1 through the first 6 camp practices. OC Mike Kafka confirmed Nabers will be the X-receiver in the base offense. Wan'Dale Robinson running the slot.",
    why_it_matters: "Nabers' target share in an offense that desperately needs a true WR1 could be massive early-season. No competition for the role.",
    action_takeaway: "Buy Nabers in all dynasty/redraft formats. Monitor receiving yards props early in the season — the target volume will be there.",
    verdict: "likely",
    confidence: 79,
    sources: 6,
    timestamp: "3h ago",
    tags: ["camp", "NYG", "WR", "rookie"],
    _stub: true,
  },
  {
    id: "nfl-005",
    type: "sharp",
    team: "PHI",
    opponent: "GB",
    headline: "PHI receiving 23% of tickets, 67% of sharp money — classic steam move",
    detail: "Sharp money has been hammering Eagles -2.5 since a line move hook opened Thursday morning. Three syndicate moves logged between 8–11 AM. The public is heavily on Green Bay based on home field, creating a perfect steam setup.",
    why_it_matters: "Steam moves with this profile — public on one side, sharp money heavy on the other — hit at 58%+ against the spread over a 10-year sample.",
    action_takeaway: "PHI -2.5 or -3 has value through Friday. Avoid if it crosses -4.",
    verdict: "likely",
    confidence: 82,
    sources: 5,
    timestamp: "35m ago",
    tags: ["sharp", "PHI", "GB", "steam"],
    proOnly: true,
    _stub: true,
  },
  {
    id: "nfl-006",
    type: "matchup",
    team: "CIN",
    opponent: "BAL",
    headline: "Ja'Marr Chase vs. BAL CB2 — ranked 87th in coverage DVOA last 8 weeks",
    detail: "Marcus Peters is out this week, leaving Marlon Humphrey to shadow Chase with Kyle Hamilton over the top. The CB opposite Humphrey — Arthur Maulet — is ranked 87th in coverage DVOA and 91st in yards allowed per coverage snap over the last 8 weeks.",
    why_it_matters: "When Chase aligns opposite a weak coverage CB with safety help elsewhere, he tends to win routes vs. the leverage technique. This is a prime matchup for slot-boundary motion attacks.",
    action_takeaway: "Chase receiving yards over is the best bet on the board this week. Target 85+ yards at current lines.",
    verdict: "confirmed",
    confidence: 86,
    sources: 8,
    timestamp: "4h ago",
    tags: ["matchup", "CIN", "BAL", "WR", "coverage"],
    _stub: true,
  },
  {
    id: "nfl-007",
    type: "injury",
    player: "Lamar Jackson",
    team: "BAL",
    opponent: "CIN",
    headline: "Lamar Jackson (knee) listed LP Wednesday — not expected to miss time",
    detail: "Jackson appeared on the injury report with a knee designation listed as LP (limited participation) on Wednesday. Ravens staff said the listing is precautionary and related to standard maintenance. Jackson was not visibly limited in the session.",
    why_it_matters: "Any Lamar injury signal moves the market, even precautionary ones. Worth monitoring — a downgrade to DNP Thursday changes the entire BAL game script.",
    action_takeaway: "No action needed yet. Watch Thursday's report. If he's full practice, the knee designation is noise.",
    verdict: "review",
    confidence: 55,
    sources: 4,
    timestamp: "5h ago",
    tags: ["injury", "BAL", "QB", "CIN"],
    _stub: true,
  },
  {
    id: "nfl-008",
    type: "rookie",
    player: "Brock Bowers",
    team: "LV",
    opponent: "KC",
    headline: "Bowers drawing rave reviews at camp — lining up in 5 different alignments",
    detail: "TE Brock Bowers, the #13 overall pick, has been the most-discussed player in Raiders camp. He's been aligned as an inline TE, slot receiver, flexed wide, and as an H-back. OC Luke Getsy called him 'the most complete TE prospect I've seen since Kelce.'",
    why_it_matters: "Multi-alignment TEs with elite athleticism get targeted heavily in modern offenses because they create impossible matchup problems. Bowers may reach 100+ target pace before October.",
    action_takeaway: "Buy Bowers in every format. His target share will be enormous if his role stays this expansive into the regular season.",
    verdict: "likely",
    confidence: 76,
    sources: 7,
    timestamp: "6h ago",
    tags: ["rookie", "LV", "TE", "camp"],
    _stub: true,
  },
  {
    id: "nfl-009",
    type: "trend",
    team: "KC",
    headline: "Chiefs 9-2 ATS in first 3 weeks of season over last 4 years",
    detail: "Kansas City has covered the spread at a remarkable 9-2 clip in Weeks 1–3 of the regular season over the last four seasons. The team historically executes their game plan most efficiently before opponents have ample film on their offseason install.",
    why_it_matters: "Early-season ATS trends are more predictive than mid-season ones when rosters are newly assembled and coordinators have fresh scheme wrinkles installed.",
    action_takeaway: "Bias toward backing KC spreads in September until the trend breaks. Weight it with other signals, not in isolation.",
    verdict: "confirmed",
    confidence: 72,
    sources: 3,
    timestamp: "8h ago",
    tags: ["trend", "KC", "ATS", "early-season"],
    _stub: true,
  },
  {
    id: "nfl-010",
    type: "weather",
    team: "BUF",
    opponent: "NE",
    headline: "Buffalo — 22 MPH gusts + 38°F forecast for Sunday night",
    detail: "Weather data shows sustained 20–22 MPH winds with gusts up to 28 MPH and temperatures dropping to 38°F at game time. Precipitation probability is 35%. Historical data shows passing efficiency drops ~12% in Bills Stadium when wind exceeds 18 MPH.",
    why_it_matters: "This environment heavily favors run-heavy game scripts. Teams with strong RBs and weak passing identities outperform in these conditions relative to their expected output.",
    action_takeaway: "Lean the under. Fade QB passing yards props. Favor James Cook rushing yards over at current prices.",
    verdict: "confirmed",
    confidence: 90,
    sources: 6,
    timestamp: "9h ago",
    tags: ["weather", "BUF", "NE", "under", "wind"],
    _stub: true,
  },
  {
    id: "nfl-011",
    type: "prop",
    player: "Patrick Mahomes",
    team: "KC",
    opponent: "BUF",
    headline: "Mahomes passing yards — 285.5 line appears soft vs. Buffalo game script",
    detail: "Mahomes has gone over 285 yards in 7 of his last 9 head-to-heads with Buffalo. The current O/U sits at 285.5 — exactly median against a Bills defense that has allowed 300+ to Mahomes in 4 of the last 5 matchups. Expect KC to be in a competitive script, not a blowout.",
    why_it_matters: "Prop lines vs. specific opponents often lag historical averages. This line has not adjusted for the matchup-specific history.",
    action_takeaway: "Over 285.5 passing yards is the play. Buy early — line may move to 295 by Sunday.",
    verdict: "likely",
    confidence: 77,
    sources: 5,
    timestamp: "10h ago",
    tags: ["prop", "KC", "BUF", "QB", "mahomes"],
    proOnly: true,
    _stub: true,
  },
  {
    id: "nfl-012",
    type: "role_change",
    player: "Sam LaPorta",
    team: "DET",
    opponent: "LAR",
    headline: "LaPorta seeing expanded route tree in camp — blocking TE role reduced",
    detail: "Detroit's OC Ben Johnson confirmed LaPorta will run a more expansive route tree in Year 2, moving away from the heavy in-line blocking role he played as a rookie. Rookie TE Jack Leer will absorb most of the blocking assignments.",
    why_it_matters: "LaPorta's production last year came almost entirely from his receiving reps. More pass routes means more targets in an already pass-heavy Detroit offense.",
    action_takeaway: "LaPorta's ADP in fantasy is currently undervaluing this role expansion. Buy before the season. Watch targets in Week 1.",
    verdict: "likely",
    confidence: 74,
    sources: 5,
    timestamp: "11h ago",
    tags: ["role_change", "DET", "TE", "camp"],
    _stub: true,
  },
];

/* ── NFL Slate (today's games) ── */
export const NFL_SLATE: NFLGame[] = [
  {
    id: "nfl-game-001",
    away: "KC",
    home: "BUF",
    awayFull: "Kansas City Chiefs",
    homeFull: "Buffalo Bills",
    awayColor: "#E31837",
    homeColor: "#00338D",
    spread: "BUF -1.5",
    total: "O/U 48.5",
    time: "8:20 PM ET",
    signals: 4,
    sharpPct: 71,
    network: "NBC",
  },
  {
    id: "nfl-game-002",
    away: "SF",
    home: "DAL",
    awayFull: "San Francisco 49ers",
    homeFull: "Dallas Cowboys",
    awayColor: "#AA0000",
    homeColor: "#003594",
    spread: "DAL -1.5",
    total: "O/U 44.5",
    time: "4:25 PM ET",
    signals: 3,
    sharpPct: 58,
    network: "FOX",
  },
  {
    id: "nfl-game-003",
    away: "CIN",
    home: "BAL",
    awayFull: "Cincinnati Bengals",
    homeFull: "Baltimore Ravens",
    awayColor: "#FB4F14",
    homeColor: "#241773",
    spread: "BAL -3.5",
    total: "O/U 46",
    time: "1:00 PM ET",
    signals: 2,
    sharpPct: 62,
    network: "CBS",
  },
  {
    id: "nfl-game-004",
    away: "NYG",
    home: "PHI",
    awayFull: "New York Giants",
    homeFull: "Philadelphia Eagles",
    awayColor: "#0B2265",
    homeColor: "#004C54",
    spread: "PHI -6.5",
    total: "O/U 42",
    time: "1:00 PM ET",
    signals: 2,
    sharpPct: 67,
    network: "FOX",
  },
  {
    id: "nfl-game-005",
    away: "LV",
    home: "DET",
    awayFull: "Las Vegas Raiders",
    homeFull: "Detroit Lions",
    awayColor: "#A5ACAF",
    homeColor: "#0076B6",
    spread: "DET -7",
    total: "O/U 45",
    time: "1:00 PM ET",
    signals: 2,
    sharpPct: 54,
    network: "CBS",
  },
];

/* ── NFL Featured Edge ── */
export const NFL_FEATURED_EDGE: NFLFeaturedEdge = {
  id: "nfl-feat-001",
  type: "injury",
  team: "SF",
  headline: "McCaffrey DNP — 49ers backfield reshuffled before Week 1",
  body: "Christian McCaffrey missed practice Wednesday with a rib contusion. Elijah Mitchell absorbed the first-team reps. Shanahan stopped short of ruling him out but the injury report designation is a confirmed DNP. This is the highest-impact injury signal of the week — McCaffrey had 439 touches last year.",
  action: "Fade SF team total under 24. Target DAL covering at -1.5. Mitchell futures showing value for a 1-week window.",
  verdict: "confirmed",
  confidence: 91,
  sources: 11,
  timestamp: "47m ago",
  teamColor: "#AA0000",
};

/* ── Quick teams for V1 sidebar ── */
export const NFL_QUICK_TEAMS = [
  { abbr: "KC",  name: "Chiefs",   conf: "AFC" },
  { abbr: "SF",  name: "49ers",    conf: "NFC" },
  { abbr: "BUF", name: "Bills",    conf: "AFC" },
  { abbr: "PHI", name: "Eagles",   conf: "NFC" },
  { abbr: "BAL", name: "Ravens",   conf: "AFC" },
  { abbr: "DAL", name: "Cowboys",  conf: "NFC" },
  { abbr: "CIN", name: "Bengals",  conf: "AFC" },
  { abbr: "DET", name: "Lions",    conf: "NFC" },
];
