/* ────────────────────────────────────────────────────────────
   Edge Setter — CFB Signal Data (Enriched — Sprint 5)
   All entries labeled [STUB]. Replace with live ingestion.

   Sprint 5 additions:
   - sourceTypes[]      : source category labels
   - sourceLabels[]     : named sources where surfaceable
   - confirmationStrength: single | corroborated | consensus
   - isoTimestamp       : ISO 8601 for sorting
   - lineMovement       : spread/total shift data
   - bettingRelevance / fantasyRelevance : bool
   - schemeNote         : coaching/scheme intel
   - injuryDesignation  : official status label
   - hitRateStub / closingLineValueStub : future tracking
   ──────────────────────────────────────────────────────────── */

export type CFBSignalType =
  | "transfer"
  | "injury"
  | "depth"
  | "line_move"
  | "matchup"
  | "sharp"
  | "coaching"
  | "weather"
  | "prop"
  | "trend"
  | "portal"
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

export interface CFBSignal {
  id: string;
  type: CFBSignalType;
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
  conference?: string;
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

export interface CFBGame {
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
  network?: string;
  conference?: string;
  lineMovement?: LineMovement;
}

export interface CFBFeaturedEdge {
  id: string;
  type: CFBSignalType;
  team: string;
  headline: string;
  subhead: string;
  action: string;
  confidence: number;
  sources: number;
  sourceLabels?: string[];
  timestamp: string;
  verdict: Verdict;
  conference: string;
  whyItMatters?: string;
}

/* ── Team colors ── */
export const CFB_TEAM_COLORS: Record<string, { primary: string; secondary: string }> = {
  "BAMA": { primary: "#9E1B32", secondary: "#828A8F" },
  "OHIO": { primary: "#BB0000", secondary: "#666666" },
  "MICH": { primary: "#00274C", secondary: "#FFCB05" },
  "UGA":  { primary: "#BA0C2F", secondary: "#000000" },
  "LSU":  { primary: "#461D7C", secondary: "#FDD023" },
  "TX":   { primary: "#BF5700", secondary: "#333F48" },
  "USC":  { primary: "#990000", secondary: "#FFC72C" },
  "ND":   { primary: "#0C2340", secondary: "#C99700" },
  "PENN": { primary: "#041E42", secondary: "#009CDE" },
  "FSU":  { primary: "#782F40", secondary: "#CEB888" },
  "CLEM": { primary: "#F66733", secondary: "#522D80" },
  "UNC":  { primary: "#4B9CD3", secondary: "#13294B" },
};

/* ── Signal type meta ── */
export const CFB_TYPE_META: Record<CFBSignalType, { label: string; color: string }> = {
  transfer:    { label: "TRANSFER",    color: "#D8B86A" },
  injury:      { label: "INJURY",      color: "#D94B4B" },
  depth:       { label: "DEPTH",       color: "#CAA85A" },
  line_move:   { label: "LINE MOVE",   color: "#4CAF82" },
  matchup:     { label: "MATCHUP",     color: "#CAA85A" },
  sharp:       { label: "SHARP",       color: "#4CAF82" },
  coaching:    { label: "COACHING",    color: "#D98A42" },
  weather:     { label: "WEATHER",     color: "#4AA8C8" },
  prop:        { label: "PROP",        color: "#D98A42" },
  trend:       { label: "TREND",       color: "#4AA8C8" },
  portal:      { label: "PORTAL",      color: "#D8B86A" },
  scheme:      { label: "SCHEME",      color: "#D98A42" },
  transaction: { label: "TRANSACTION", color: "#4AA8C8" },
};

/* ── Slate ── */
export const CFB_SLATE: CFBGame[] = [
  {
    id: "g1",
    away: "BAMA", home: "UGA",
    awayFull: "Alabama", homeFull: "Georgia",
    awayColor: "#9E1B32", homeColor: "#BA0C2F",
    spread: "UGA -3.5", total: "O/U 47.5",
    time: "3:30 PM ET",
    signals: 5, network: "CBS", conference: "SEC",
    lineMovement: { open: "UGA -2", current: "UGA -3.5", direction: "down", note: "Sharp UGA steam overnight" },
  },
  {
    id: "g2",
    away: "MICH", home: "OHIO",
    awayFull: "Michigan", homeFull: "Ohio State",
    awayColor: "#00274C", homeColor: "#BB0000",
    spread: "OHIO -6.5", total: "O/U 44",
    time: "12:00 PM ET",
    signals: 4, network: "FOX", conference: "Big Ten",
  },
  {
    id: "g3",
    away: "TX", home: "LSU",
    awayFull: "Texas", homeFull: "LSU",
    awayColor: "#BF5700", homeColor: "#461D7C",
    spread: "LSU -4", total: "O/U 51",
    time: "7:30 PM ET",
    signals: 3, network: "ESPN", conference: "SEC",
  },
  {
    id: "g4",
    away: "USC", home: "ND",
    awayFull: "USC", homeFull: "Notre Dame",
    awayColor: "#990000", homeColor: "#0C2340",
    spread: "ND -2.5", total: "O/U 49",
    time: "4:00 PM ET",
    signals: 3, network: "NBC", conference: "Ind.",
  },
  {
    id: "g5",
    away: "CLEM", home: "FSU",
    awayFull: "Clemson", homeFull: "Florida State",
    awayColor: "#F66733", homeColor: "#782F40",
    spread: "FSU -1.5", total: "O/U 45.5",
    time: "8:00 PM ET",
    signals: 2, network: "ABC", conference: "ACC",
  },
];

/* ── Featured Edge ── */
export const CFB_FEATURED_EDGE: CFBFeaturedEdge = {
  id: "fe1",
  type: "transfer",
  team: "OHIO",
  headline: "Ohio State QB Will Howard dominates fall camp — market still pricing him like a question mark",
  subhead: "Howard completing 72% in team periods. Backup depth nonexistent. Line opened -6.5 and has barely moved despite early sharp action. Three sources confirm scheme install is ahead of schedule.",
  action: "Take Ohio State -6.5 if still available. Sharp money confirms. Public fading 'can he repeat?' while actual QB metrics signal year-two leap.",
  confidence: 89,
  sources: 14,
  sourceLabels: ["The Athletic (OHIO Beat)", "247Sports", "Action Network"],
  timestamp: "2h ago",
  verdict: "confirmed",
  conference: "Big Ten",
  whyItMatters: "Ohio State's title ceiling is 100% QB-dependent. A legitimate Howard locks the Buckeyes as a preseason market steal — oddsmakers haven't moved the number yet.",
};

/* ── Quick Teams ── */
export const CFB_QUICK_TEAMS = ["BAMA", "UGA", "OHIO", "MICH", "TX", "LSU", "USC", "ND"];

/* ── Signals ── */
export const CFB_SIGNALS: CFBSignal[] = [
  {
    id: "s1",
    type: "transfer",
    player: "Will Howard",
    team: "OHIO",
    opponent: "MICH",
    headline: "Will Howard leads all P4 QBs in camp completion% — quietly dominant",
    detail: "Reporters tracking fall camp have Howard at 71–72% in team periods through three weeks. No major outlet has made this the headline — public narrative is still 'can he repeat?' Line is priced off spring uncertainty, not current camp evidence.",
    why_it_matters: "Ohio State's ceiling as a title contender hinges on QB play. If Howard is legitimate, the market is severely undervaluing the Buckeyes heading into Big Ten play.",
    action_takeaway: "Target Ohio State team totals and spread through early season while public skepticism persists. Buy-low window on a potentially elite offense.",
    verdict: "confirmed",
    confidence: 89,
    sources: 14,
    sourceTypes: ["beat reporter", "practice observation", "analytics"],
    sourceLabels: ["The Athletic (OHIO Beat)", "247Sports", "ESPN"],
    confirmationStrength: "consensus",
    timestamp: "2h ago",
    isoTimestamp: "2026-04-26T13:00:00Z",
    tags: ["QB", "Ohio State", "Big Ten", "Camp"],
    conference: "Big Ten",
    bettingRelevance: true,
    fantasyRelevance: false,
    schemeNote: "OC Chip Kelly's scheme install reportedly ahead of schedule — new deep route tree installed Week 2 of camp.",
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "s2",
    type: "line_move",
    team: "UGA",
    opponent: "BAMA",
    headline: "Georgia -3.5 → -5 overnight — sharp steam driving SEC opener total under",
    detail: "Line moved 1.5 points away from Alabama in a 4-hour overnight window. Under also tracked from 48 to 47.5. Sharp ticket count on Georgia moneyline at 68% despite a split public handle. All three major sharp-tracking sources confirm the move.",
    why_it_matters: "Classic sharp fade of the Alabama public narrative. Books absorbed early Bama action then moved opposite. The secondary under move on totals signals strong disagreement with the public over.",
    action_takeaway: "Georgia -5 or better still has value. Fade the Alabama sentiment market. Under 47.5 with steam confirmation is an independent play.",
    verdict: "confirmed",
    confidence: 84,
    sources: 11,
    sourceTypes: ["sportsbook", "sharp money", "line tracking"],
    sourceLabels: ["Pinnacle", "Action Network", "Circa Sports"],
    confirmationStrength: "consensus",
    timestamp: "1h ago",
    isoTimestamp: "2026-04-26T14:00:00Z",
    tags: ["Line Move", "Sharp", "SEC", "Total"],
    conference: "SEC",
    lineMovement: {
      open: "UGA -2",
      current: "UGA -3.5",
      direction: "down",
      note: "1.5-pt overnight move, 68% sharp tickets UGA — reverse public action",
    },
    bettingRelevance: true,
    fantasyRelevance: false,
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "s3",
    type: "injury",
    player: "TreVeyon Henderson",
    team: "OHIO",
    headline: "Henderson limited Wednesday — not on report yet, practice observers flagged it",
    detail: "Multiple reporters confirmed Henderson worked with trainers separately for the first 20 minutes of Wednesday's practice. No official designation yet. Ohio State historically holds status until Thursday's report. First-team reps taken by Dallan Hayden.",
    why_it_matters: "Henderson is a top-3 back in the Big Ten. If unavailable vs. Michigan, Ohio State's ground game shifts to Hayden — material change for the spread and player props.",
    action_takeaway: "Monitor Thursday's report closely. If Henderson draws a Questionable tag, consider Michigan +6.5 immediately. Hold Henderson rush props until clarity.",
    verdict: "rumor",
    confidence: 61,
    sources: 4,
    sourceTypes: ["beat reporter", "practice observation"],
    sourceLabels: ["247Sports", "Eleven Warriors"],
    confirmationStrength: "single",
    timestamp: "45m ago",
    isoTimestamp: "2026-04-26T14:15:00Z",
    tags: ["RB", "Ohio State", "Injury", "Big Ten"],
    conference: "Big Ten",
    injuryDesignation: "LP",
    bettingRelevance: true,
    fantasyRelevance: true,
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "s4",
    type: "coaching",
    team: "LSU",
    headline: "LSU OC implementing new RPO package for Texas matchup — scheme change confirmed",
    detail: "Multiple beat reporters confirmed Brian Kelly signed off on a new run-pass option set installed this week specifically targeting Texas's linebacker alignment. Film sessions extended Tuesday and Wednesday. Two LSU practice observers noted new formation wrinkles not seen in previous games.",
    why_it_matters: "Texas held opponents to 3.8 YPC last season but surrendered big plays in space. LSU exploiting this with speed mismatches could flip the game script from a grind to an open shootout.",
    action_takeaway: "Lean toward LSU covering -4 if the over shows early. Total of 51 starts to look low if LSU opens the middle of the field.",
    verdict: "likely",
    confidence: 74,
    sources: 8,
    sourceTypes: ["beat reporter", "practice observation", "analytics"],
    sourceLabels: ["The Athletic (LSU Beat)", "247Sports", "PFF"],
    confirmationStrength: "corroborated",
    timestamp: "3h ago",
    isoTimestamp: "2026-04-26T12:00:00Z",
    tags: ["Coaching", "Scheme", "LSU", "SEC", "Texas"],
    conference: "SEC",
    schemeNote: "New RPO set targets Texas's LB alignment — speed mismatches in space, not power running. Scheme is specifically built for this opponent.",
    matchupEdge: "Texas LBs allowed 4.8 YPC to RPO-heavy offenses last season. LSU's speed at RB/WR exploits this.",
    bettingRelevance: true,
    fantasyRelevance: false,
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "s5",
    type: "portal",
    player: "Darian Mensah",
    team: "TX",
    headline: "Texas portal QB Mensah elevated to co-starter — changes backup value entirely",
    detail: "Arch Manning is the clear starter but Mensah was quietly elevated to co-starter designation in the depth chart released Monday. Texas hasn't officially commented. Mensah put up 31 TDs at Tulane — legitimate dual-threat with transfer portal track record.",
    why_it_matters: "Backup QB elevation signals Texas is managing Manning's workload or preparing for heavy opponent scouting. Either way it creates prop uncertainty for first-half passing totals.",
    action_takeaway: "Fade Manning first-half passing props if game script goes run-heavy early. Wait for full confirmation before betting team total.",
    verdict: "rumor",
    confidence: 58,
    sources: 3,
    sourceTypes: ["beat reporter", "official"],
    sourceLabels: ["On3", "Texas Official Depth Chart"],
    confirmationStrength: "single",
    timestamp: "5h ago",
    isoTimestamp: "2026-04-26T10:00:00Z",
    tags: ["QB", "Transfer Portal", "Texas", "SEC"],
    conference: "SEC",
    bettingRelevance: true,
    fantasyRelevance: false,
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "s6",
    type: "sharp",
    team: "ND",
    opponent: "USC",
    headline: "Notre Dame sharp action — 74% of sharp tickets on ND -2.5 vs USC",
    detail: "Books showing 74% sharp ticket count on Notre Dame despite even public handle. ND opened -2 and moved to -2.5 on overnight sharp. All three major sharp-tracking sources confirm. USC draws big public handle regardless of situation — classic fade target.",
    why_it_matters: "Classic sharp fade of a USC public team. Sharp money consistently fades USC in big-narrative games. ND's home-field edge and the defensive matchup favor the Irish.",
    action_takeaway: "ND -2.5 still has value. Don't chase past -4. Under 49 also in sharp territory.",
    verdict: "confirmed",
    confidence: 82,
    sources: 10,
    sourceTypes: ["sharp money", "sportsbook", "line tracking"],
    sourceLabels: ["Action Network", "Pinnacle", "Circa Sports"],
    confirmationStrength: "consensus",
    timestamp: "1h ago",
    isoTimestamp: "2026-04-26T14:00:00Z",
    tags: ["Sharp", "Notre Dame", "USC", "Line Move"],
    conference: "Ind.",
    lineMovement: {
      open: "ND -2",
      current: "ND -2.5",
      direction: "down",
      note: "74% sharp tickets ND, public split — classic public-fade setup",
    },
    bettingRelevance: true,
    fantasyRelevance: false,
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "s7",
    type: "depth",
    player: "Toney Smith",
    team: "FSU",
    headline: "FSU WR depth thinned after Keon departure — Clemson hasn't adjusted to new receiver corps",
    detail: "Keon Coleman left for the NFL. Junior Toney Smith is now WR1 per released depth chart with 28 receptions last season — half of Keon's output. No portal addition at the position. Clemson's prep material is based on last year's FSU passing attack.",
    why_it_matters: "Florida State's passing attack is materially weaker. Clemson's D is building against a 2023 FSU that no longer exists.",
    action_takeaway: "Under 45.5 has real value given FSU's thinned receiving corps. Clemson +1.5 as live underdog with genuine defensive edge is worth a look.",
    verdict: "confirmed",
    confidence: 77,
    sources: 9,
    sourceTypes: ["beat reporter", "official", "analytics"],
    sourceLabels: ["The Athletic (FSU Beat)", "FSU Official Depth Chart", "PFF"],
    confirmationStrength: "corroborated",
    timestamp: "4h ago",
    isoTimestamp: "2026-04-26T11:00:00Z",
    tags: ["WR", "Depth Chart", "FSU", "ACC", "Clemson"],
    conference: "ACC",
    bettingRelevance: true,
    fantasyRelevance: false,
    matchupEdge: "FSU WR1 replacement: Smith 28 rec vs Keon's 54 last season — 37% target share reduction at the position.",
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "s8",
    type: "weather",
    team: "MICH",
    opponent: "OHIO",
    headline: "Wind advisory — 25 mph gusts projected for Columbus noon kickoff",
    detail: "National Weather Service advisory issued through 3 PM for Franklin County. 23–28 mph sustained winds, gusts to 35 mph. Ohio Stadium sits in a natural wind tunnel that amplifies field-level conditions by 15–20% vs. surrounding area readings.",
    why_it_matters: "Ohio State's offense is air-attack dependent. Michigan's defensive identity already disrupts timing routes. 30 mph gusts materially suppress OHIO's passing game — the 44 total looks inflated.",
    action_takeaway: "Under 44 is the play. Consider two-unit lean. Ohio State carries more weather risk than Michigan — OSU is pass-first; UM adjusts to run.",
    verdict: "confirmed",
    confidence: 91,
    sources: 5,
    sourceTypes: ["weather service", "analytics", "beat reporter"],
    sourceLabels: ["National Weather Service", "Action Network", "The Athletic"],
    confirmationStrength: "corroborated",
    timestamp: "30m ago",
    isoTimestamp: "2026-04-26T14:30:00Z",
    tags: ["Weather", "Total", "Big Ten", "Michigan", "Ohio State"],
    conference: "Big Ten",
    bettingRelevance: true,
    fantasyRelevance: false,
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "s9",
    type: "trend",
    team: "BAMA",
    headline: "Alabama 0-4 ATS as road underdog under DeBoer — sharp money now exploiting pattern",
    detail: "Since DeBoer took over, Alabama has failed to cover in all four instances as a road underdog. Books know the pattern. Overnight sharp action took Georgia to -5 explicitly citing this trend — confirmed by Action Network data.",
    why_it_matters: "Pattern investing isn't reliable alone, but when sharp money explicitly cites the trend AND the line moves in the trend's direction, that's confirmation — not coincidence.",
    action_takeaway: "Georgia -5 or better. Don't fade the trend when the market is confirming it with real money.",
    verdict: "likely",
    confidence: 71,
    sources: 7,
    sourceTypes: ["analytics", "sharp money", "sportsbook"],
    sourceLabels: ["Action Network", "Pinnacle", "PFF"],
    confirmationStrength: "corroborated",
    timestamp: "6h ago",
    isoTimestamp: "2026-04-26T09:00:00Z",
    tags: ["ATS Trend", "Alabama", "SEC", "Coaching"],
    conference: "SEC",
    bettingRelevance: true,
    fantasyRelevance: false,
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "s10",
    type: "prop",
    player: "Arch Manning",
    team: "TX",
    headline: "Manning passing yards prop at 238.5 — inflated by narrative premium",
    detail: "Books pricing Manning off hype, not production. His true comp is a top-15 college passer on a run-first team — Texas ran 52% last season. LSU's base 4-2-5 is built to stop spread offenses and specifically RPO attacks.",
    why_it_matters: "Manning props are the most public-side bet in CFB this week. Books have inflated the line. Regression to a run-first game plan against a defensive scheme that takes away RPO means the under hits.",
    action_takeaway: "Under 238.5 passing yards for Manning. If line drops to 225, reconsider value. The narrative premium is the edge here.",
    verdict: "likely",
    confidence: 67,
    sources: 6,
    sourceTypes: ["analytics", "sportsbook", "sharp money"],
    sourceLabels: ["PFF", "Action Network", "Statcast"],
    confirmationStrength: "corroborated",
    timestamp: "3h ago",
    isoTimestamp: "2026-04-26T12:00:00Z",
    tags: ["Prop", "QB", "Texas", "SEC", "LSU"],
    conference: "SEC",
    bettingRelevance: true,
    fantasyRelevance: false,
    schemeNote: "LSU 4-2-5 base is specifically designed to stop RPO attacks. Manning's completion rate drops 8% vs. 2-high shell coverages he'll see all night.",
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "s11",
    type: "matchup",
    team: "PENN",
    opponent: "UNC",
    headline: "Penn State slot WR vs UNC nickel — schematic mismatch favors PSU passing game",
    detail: "UNC's nickel package struggles against speed in the slot. Penn State's KeAndre Lambert-Smith has been the most explosive slot in the B1G. UNC corners playing off-technique — 2.3 YAC allowed per route, 28th in conference.",
    why_it_matters: "Speed mismatch this specific tends to produce chunk plays. PSU's passing totals should exceed market expectations.",
    action_takeaway: "Penn State team total over 24.5 first half. Lambert-Smith over 55.5 receiving yards is a live prop if matchup stays mapped as expected.",
    verdict: "likely",
    confidence: 72,
    sources: 8,
    sourceTypes: ["analytics", "beat reporter"],
    sourceLabels: ["PFF", "The Athletic (PSU Beat)"],
    confirmationStrength: "corroborated",
    timestamp: "5h ago",
    isoTimestamp: "2026-04-26T10:00:00Z",
    tags: ["Matchup", "WR", "Penn State", "Big Ten", "UNC"],
    conference: "ACC/Big Ten",
    schemeNote: "PSU route tree uses speed-out and crossers specifically designed to attack off-man technique. UNC's nickel plays off — creates easy completions for Lambert-Smith.",
    matchupEdge: "Lambert-Smith: 78 avg receiving yards vs off-man coverage this season. UNC runs off-man 67% of the time.",
    bettingRelevance: true,
    fantasyRelevance: false,
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "s12",
    type: "transfer",
    player: "Cam Ward",
    team: "MICH",
    headline: "Ward era ended — Michigan QB market still slow to reprice for Underwood era",
    detail: "Ward's NFL departure created a void Michigan addressed with Bryce Underwood (portal). Books haven't fully updated power ratings. Line still reflects Ward-era Michigan ceiling. Underwood shows promise in camp (67% in team periods) but is an unknown commodity in big games.",
    why_it_matters: "Oddsmakers slow to reprice Michigan's ceiling creates exploitable value on both sides — fade Michigan team totals until Underwood proves himself, OR buy Michigan futures if Week 1 shows command.",
    action_takeaway: "Watch Michigan's opening drive efficiency in Week 1. Underwood command = buy futures before repricing. For now: fade Michigan team totals on the over.",
    verdict: "review",
    confidence: 55,
    sources: 5,
    sourceTypes: ["beat reporter", "analytics", "official"],
    sourceLabels: ["The Athletic (MICH Beat)", "247Sports", "Michigan Official Depth Chart"],
    confirmationStrength: "corroborated",
    timestamp: "8h ago",
    isoTimestamp: "2026-04-26T07:00:00Z",
    tags: ["QB", "Transfer", "Michigan", "Big Ten"],
    conference: "Big Ten",
    bettingRelevance: true,
    fantasyRelevance: false,
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
];
