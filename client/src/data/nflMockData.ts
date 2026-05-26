/* ────────────────────────────────────────────────────────────
   Edge Setter — NFL Signal Data (Enriched — Sprint 5)
   All entries labeled [STUB]. Replace with live ingestion.

   Sprint 5 additions:
   - sourceTypes[]      : source category labels
   - sourceLabels[]     : named sources where surfaceable
   - confirmationStrength: single | corroborated | consensus
   - isoTimestamp       : ISO 8601 for sorting
   - lineMovement       : spread/total shift data
   - bettingRelevance   : bool
   - fantasyRelevance   : bool
   - schemeNote         : coaching/scheme intel (NFL/CFB-specific)
   - injuryDesignation  : DNP | LP | FP | Q | D | OUT
   - hitRateStub / closingLineValueStub : future tracking stubs
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
  | "prop"
  | "scheme"
  | "transaction";

export type Verdict = "confirmed" | "likely" | "rumor" | "contradicted" | "review";
export type ConfirmationStrength = "single" | "corroborated" | "consensus";

export interface LineMovement {
  open: string;
  current: string;
  direction: "up" | "down" | "both" | "flat";
  note?: string;
}

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
  sourceTypes?: string[];
  sourceLabels?: string[];
  confirmationStrength?: ConfirmationStrength;
  timestamp: string;
  isoTimestamp?: string;
  tags: string[];
  proOnly?: boolean;
  lineMovement?: LineMovement;
  bettingRelevance?: boolean;
  fantasyRelevance?: boolean;
  injuryDesignation?: "DNP" | "LP" | "FP" | "Q" | "D" | "OUT";
  schemeNote?: string;
  matchupEdge?: string;
  hitRateStub?: null;
  closingLineValueStub?: null;
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
  lineMovement?: LineMovement;
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
  sourceLabels?: string[];
  timestamp: string;
  teamColor: string;
  whyItMatters?: string;
}

/* ── Team color map ── */
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

/* ── NFL Signals ── */
export const NFL_SIGNALS: NFLSignal[] = [
  {
    id: "nfl-001",
    type: "injury",
    player: "Christian McCaffrey",
    team: "SF",
    opponent: "DAL",
    headline: "McCaffrey (rib) DNP Wednesday — questionable for Week 1",
    detail: "McCaffrey was a DNP at Wednesday's practice with a rib contusion sustained in the final preseason game. Elijah Mitchell absorbed the first-team reps. Kyle Shanahan said he expects McCaffrey to be a game-time decision. Beat reporter confirmed Mitchell ran the full first-team period.",
    why_it_matters: "McCaffrey is the central axis of SF's offense — 439 touches last season, 6.0 YPC. Without him, SF's floor collapses against a stout Dallas front seven. Mitchell is a capable back but far less explosive in space.",
    action_takeaway: "Monitor Friday's report. If McCaffrey is confirmed out, fade SF team total under 24; look at DAL -1.5 covering. Mitchell rushing yards props gain value.",
    verdict: "confirmed",
    confidence: 91,
    sources: 11,
    sourceTypes: ["official report", "beat reporter", "practice observation"],
    sourceLabels: ["NFL Official Injury Report", "The Athletic (SF Beat)", "ESPN"],
    confirmationStrength: "consensus",
    timestamp: "47m ago",
    isoTimestamp: "2026-04-26T14:13:00Z",
    tags: ["injury", "SF", "DAL", "RB", "week1"],
    injuryDesignation: "DNP",
    bettingRelevance: true,
    fantasyRelevance: true,
    matchupEdge: "Mitchell: 5.8 YPC vs. Dallas front this preseason. Shanahan's run scheme minimally impacted.",
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "nfl-002",
    type: "line_move",
    team: "KC",
    opponent: "BUF",
    headline: "KC -3.5 → -5.5 since open — sharp action driving Chiefs line",
    detail: "KC opened at -3.5 Sunday night and moved to -5.5 by Wednesday afternoon. Public attention is split toward Buffalo, but tracked professional activity is KC-side. Three external shifts logged at Pinnacle (8 AM, 11 AM, 2 PM) — all KC side.",
    why_it_matters: "When ticket count and money percentage diverge this sharply early in the week, it reflects syndicate or professional action. Public is fading KC; professional market activity is not.",
    action_takeaway: "Lean KC -5 or better. Value window is -5 to -5.5. If line climbs past -6, the edge degrades significantly.",
    verdict: "likely",
    confidence: 84,
    sources: 7,
    sourceTypes: ["sportsbook", "professional market activity", "line tracking"],
    sourceLabels: ["Pinnacle", "Circa Sports", "Action Network"],
    confirmationStrength: "consensus",
    timestamp: "1h ago",
    isoTimestamp: "2026-04-26T14:00:00Z",
    tags: ["line_move", "KC", "BUF", "sharp", "week3"],
    lineMovement: {
      open: "KC -3.5",
      current: "KC -5.5",
      direction: "down",
      note: "71% professional activity vs 68% public tickets on BUF — sharp-driven",
    },
    proOnly: true,
    bettingRelevance: true,
    fantasyRelevance: false,
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "nfl-003",
    type: "depth",
    player: "Raheem Mostert",
    team: "MIA",
    opponent: "NYG",
    headline: "De'Von Achane elevated — Mostert dropped to 2nd string in final depth chart",
    detail: "Miami's official Week 1 depth chart shows De'Von Achane as RB1. Mostert logged limited reps Wednesday (described as 'scheduled rest'). Sun-Sentinel beat writer confirms Achane is the clear lead back going forward. No injury concern — this is a pure performance-based decision.",
    why_it_matters: "Achane was a yards-per-carry monster at 6.4 YPC last season. Full lead back duties in an Dolphins offense restructures the backfield's DFS and season-long value entirely.",
    action_takeaway: "Target Achane rushing yards props over the number. Fade Mostert in all GPPs. Buy Achane's ADP aggressively in redraft.",
    verdict: "confirmed",
    confidence: 88,
    sources: 9,
    sourceTypes: ["official", "beat reporter", "practice observation"],
    sourceLabels: ["MIA Official Depth Chart", "Sun-Sentinel", "ESPN"],
    confirmationStrength: "consensus",
    timestamp: "2h ago",
    isoTimestamp: "2026-04-26T13:00:00Z",
    tags: ["depth", "MIA", "RB", "usage"],
    bettingRelevance: false,
    fantasyRelevance: true,
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "nfl-004",
    type: "camp",
    player: "Malik Nabers",
    team: "NYG",
    opponent: "DAL",
    headline: "Nabers takes all first-team WR1 reps in Giants camp — Hyatt pushed to slot",
    detail: "Rookie WR Malik Nabers has taken every first-team rep at outside WR1 through 6 camp practices. OC Mike Kafka confirmed Nabers will be the X-receiver in the base offense. Wan'Dale Robinson is running the slot. No competition for the role has materialized.",
    why_it_matters: "Nabers' target share in an offense desperately needing a true WR1 could be massive early-season. Unchallenged WR1 reps are the clearest signal of game-week target volume.",
    action_takeaway: "Buy Nabers in all dynasty and redraft formats. Monitor early-season receiving yards props — volume will be there.",
    verdict: "likely",
    confidence: 79,
    sources: 6,
    sourceTypes: ["beat reporter", "practice observation", "official"],
    sourceLabels: ["The Athletic (NYG Beat)", "ESPN", "NYG Official Depth Chart"],
    confirmationStrength: "corroborated",
    timestamp: "3h ago",
    isoTimestamp: "2026-04-26T12:00:00Z",
    tags: ["camp", "NYG", "WR", "rookie"],
    bettingRelevance: false,
    fantasyRelevance: true,
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "nfl-005",
    type: "sharp",
    team: "PHI",
    opponent: "GB",
    headline: "PHI receiving 23% of tickets, 67% of professional market activity — classic steam",
    detail: "Professional source activity has been heavy on Eagles context since Thursday morning. Three syndicate moves logged between 8–11 AM. Public attention is heavily on Green Bay (home field narrative), while the external movement favors PHI.",
    why_it_matters: "Market moves with this profile — public on one side, professional market activity heavy on the other — hit at 58%+ ATS over large historical samples. Syndicate action is rarely wrong this early in the week.",
    action_takeaway: "PHI -2.5 or -3 has value through Friday. Avoid if line crosses -4.",
    verdict: "likely",
    confidence: 82,
    sources: 5,
    sourceTypes: ["professional market activity", "sportsbook", "line tracking"],
    sourceLabels: ["Action Network", "Pregame.com", "Pinnacle"],
    confirmationStrength: "corroborated",
    timestamp: "35m ago",
    isoTimestamp: "2026-04-26T14:25:00Z",
    tags: ["sharp", "PHI", "GB", "steam"],
    lineMovement: {
      open: "PHI -2",
      current: "PHI -2.5",
      direction: "down",
      note: "67% professional source activity PHI vs 23% public tickets — external movement",
    },
    proOnly: true,
    bettingRelevance: true,
    fantasyRelevance: false,
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "nfl-006",
    type: "matchup",
    player: "Ja'Marr Chase",
    team: "CIN",
    opponent: "BAL",
    headline: "Chase vs. BAL CB2 — ranked 87th in coverage DVOA last 8 weeks",
    detail: "Marcus Peters is out this week. Marlon Humphrey will shadow Chase with Kyle Hamilton over the top. The CB opposite Humphrey — Arthur Maulet — is ranked 87th in coverage DVOA and 91st in yards allowed per coverage snap over the last 8 weeks.",
    why_it_matters: "Chase aligns opposite a weak coverage CB with safety help elsewhere. He wins routes vs. leverage technique — CIN's motion and pick-route concepts exploit this exactly.",
    action_takeaway: "Chase receiving yards over is the best prop on the board. Target 85+ yards at current lines.",
    verdict: "confirmed",
    confidence: 86,
    sources: 8,
    sourceTypes: ["analytics", "beat reporter", "official"],
    sourceLabels: ["PFF", "The Athletic (CIN Beat)", "NFL Official Injury Report"],
    confirmationStrength: "consensus",
    timestamp: "4h ago",
    isoTimestamp: "2026-04-26T11:00:00Z",
    tags: ["matchup", "CIN", "BAL", "WR", "coverage"],
    schemeNote: "CIN's motion/pick-route scheme targets the weaker CB2 gap that Maulet's absence creates. Expect heavy Chase alignment opposite Maulet.",
    matchupEdge: "Chase vs. Maulet: Chase averages 88 yards in last 3 matchups vs. BAL CB2 slot.",
    bettingRelevance: true,
    fantasyRelevance: true,
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "nfl-007",
    type: "injury",
    player: "Lamar Jackson",
    team: "BAL",
    opponent: "CIN",
    headline: "Lamar Jackson (knee) listed LP Wednesday — not expected to miss time",
    detail: "Jackson appeared on the injury report with a knee designation (limited participation) on Wednesday. Ravens staff called it precautionary and related to standard maintenance. Jackson was not visibly limited in the session observed by media.",
    why_it_matters: "Any Lamar injury signal moves the market, even precautionary. A downgrade to DNP Thursday changes the entire BAL game script and spread.",
    action_takeaway: "No action yet. Watch Thursday's report. Full practice = noise. DNP Thursday = significant short-side BAL fade.",
    verdict: "review",
    confidence: 55,
    sources: 4,
    sourceTypes: ["official report", "beat reporter"],
    sourceLabels: ["NFL Official Injury Report", "ESPN"],
    confirmationStrength: "single",
    timestamp: "5h ago",
    isoTimestamp: "2026-04-26T10:00:00Z",
    tags: ["injury", "BAL", "QB", "CIN"],
    injuryDesignation: "LP",
    bettingRelevance: true,
    fantasyRelevance: true,
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "nfl-008",
    type: "rookie",
    player: "Brock Bowers",
    team: "LV",
    opponent: "KC",
    headline: "Bowers drawing rave reviews at camp — lining up in 5 different alignments",
    detail: "TE Brock Bowers (#13 overall pick) has been the most-discussed player in Raiders camp. Aligned as inline TE, slot receiver, flexed wide, H-back, and wing. OC Luke Getsy: 'most complete TE prospect I've seen since Kelce.' Target share potential is enormous.",
    why_it_matters: "Multi-alignment TEs with elite athleticism get targeted heavily in modern offenses. Bowers may hit 100+ target pace before October if this role holds through the regular season.",
    action_takeaway: "Buy Bowers in every format. Target share will be enormous if role stays expansive.",
    verdict: "likely",
    confidence: 76,
    sources: 7,
    sourceTypes: ["beat reporter", "practice observation", "broadcast"],
    sourceLabels: ["The Athletic", "Raiders.com", "NFL Network"],
    confirmationStrength: "corroborated",
    timestamp: "6h ago",
    isoTimestamp: "2026-04-26T09:00:00Z",
    tags: ["rookie", "LV", "TE", "camp"],
    bettingRelevance: false,
    fantasyRelevance: true,
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "nfl-009",
    type: "trend",
    team: "KC",
    headline: "Chiefs 9-2 ATS in first 3 weeks of season — last 4 years",
    detail: "Kansas City has covered the spread at a 9-2 clip in Weeks 1–3 of the regular season over four consecutive seasons. The team historically executes most efficiently before opponents have ample film on their offseason scheme install.",
    why_it_matters: "Early-season ATS trends carry more predictive weight than mid-season ones — coordinators have fresh wrinkles, and defenses haven't adjusted.",
    action_takeaway: "Bias KC spread bets in September until trend breaks. Weight alongside other signals, not in isolation.",
    verdict: "confirmed",
    confidence: 72,
    sources: 3,
    sourceTypes: ["analytics"],
    sourceLabels: ["Action Network Historical Data"],
    confirmationStrength: "single",
    timestamp: "8h ago",
    isoTimestamp: "2026-04-26T07:00:00Z",
    tags: ["trend", "KC", "ATS", "early-season"],
    bettingRelevance: true,
    fantasyRelevance: false,
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "nfl-010",
    type: "weather",
    team: "BUF",
    opponent: "NE",
    headline: "Buffalo — 22 MPH gusts + 38°F forecast for Sunday night",
    detail: "Sustained 20–22 MPH winds with gusts to 28 MPH and 38°F at game time. Precipitation probability: 35%. Historical data shows passing efficiency drops ~12% in Bills Stadium when wind exceeds 18 MPH.",
    why_it_matters: "This environment heavily favors run-heavy game scripts. QBs on both sides will be compromised. Teams with strong RBs outperform relative to expected output in these conditions.",
    action_takeaway: "Lean the under. Fade QB passing yards props. James Cook rushing yards over at current prices has value.",
    verdict: "confirmed",
    confidence: 90,
    sources: 6,
    sourceTypes: ["weather service", "analytics", "sportsbook"],
    sourceLabels: ["National Weather Service", "Action Network", "Pinnacle"],
    confirmationStrength: "consensus",
    timestamp: "9h ago",
    isoTimestamp: "2026-04-26T06:00:00Z",
    tags: ["weather", "BUF", "NE", "under", "wind"],
    bettingRelevance: true,
    fantasyRelevance: true,
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "nfl-011",
    type: "prop",
    player: "Patrick Mahomes",
    team: "KC",
    opponent: "BUF",
    headline: "Mahomes passing yards — 285.5 line appears soft vs. Buffalo game script",
    detail: "Mahomes has gone over 285 yards in 7 of his last 9 head-to-heads with Buffalo. Current O/U: 285.5 — exactly median against a Bills defense that allowed 300+ to Mahomes in 4 of the last 5 matchups. Expect a competitive script, not a blowout.",
    why_it_matters: "Prop lines vs. specific opponents often lag historical matchup averages. This line has not adjusted for the historical Mahomes vs. BUF data.",
    action_takeaway: "Over 285.5 passing yards. Buy early — line may move to 295 by Sunday.",
    verdict: "likely",
    confidence: 77,
    sources: 5,
    sourceTypes: ["analytics", "sportsbook"],
    sourceLabels: ["Action Network", "PFF"],
    confirmationStrength: "corroborated",
    timestamp: "10h ago",
    isoTimestamp: "2026-04-26T05:00:00Z",
    tags: ["prop", "KC", "BUF", "QB", "mahomes"],
    proOnly: true,
    bettingRelevance: true,
    fantasyRelevance: true,
    matchupEdge: "Mahomes: 7/9 over 285 yards vs. BUF all-time. Line currently at exactly his median.",
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "nfl-012",
    type: "role_change",
    player: "Sam LaPorta",
    team: "DET",
    opponent: "LAR",
    headline: "LaPorta seeing expanded route tree — blocking TE role reduced in Year 2",
    detail: "Detroit OC Ben Johnson confirmed LaPorta will run a more expansive route tree in Year 2, moving away from the heavy in-line blocking role. Rookie TE Jack Leer absorbs most blocking assignments. LaPorta's pass-route snaps projected to increase 30%.",
    why_it_matters: "LaPorta's production last year came almost entirely from receiving reps. More routes means more targets in an already pass-heavy Detroit offense.",
    action_takeaway: "LaPorta's ADP undervalues this role expansion. Buy before season. Watch Week 1 targets closely.",
    verdict: "likely",
    confidence: 74,
    sources: 5,
    sourceTypes: ["beat reporter", "official"],
    sourceLabels: ["The Athletic (DET Beat)", "Lions.com"],
    confirmationStrength: "corroborated",
    timestamp: "11h ago",
    isoTimestamp: "2026-04-26T04:00:00Z",
    tags: ["role_change", "DET", "TE", "camp"],
    bettingRelevance: false,
    fantasyRelevance: true,
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
];

/* ── NFL Slate ── */
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
    lineMovement: { open: "KC -3.5", current: "BUF -1.5", direction: "both", note: "Sharp swing — line moved 5 pts" },
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
  sourceLabels: ["NFL Official Injury Report", "The Athletic", "ESPN"],
  timestamp: "47m ago",
  teamColor: "#AA0000",
  whyItMatters: "McCaffrey is the axis of SF's entire offensive system — 439 touches, 6.0 YPC. Without him, SF's floor collapses vs. a strong Dallas front.",
};

/* ── Quick teams for sidebar ── */
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


