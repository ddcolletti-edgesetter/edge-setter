/* ────────────────────────────────────────────────────────────
   Edge Setter — CFB V1 Mock Data
   All entries labeled [STUB]. Replace with live ingestion.
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
  | "portal";

export type Verdict = "confirmed" | "likely" | "rumor" | "contradicted" | "review";

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
  timestamp: string;
  tags: string[];
  conference?: string;
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
  timestamp: string;
  verdict: Verdict;
  conference: string;
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
  transfer:  { label: "TRANSFER",  color: "#D8B86A" },
  injury:    { label: "INJURY",    color: "#D94B4B" },
  depth:     { label: "DEPTH",     color: "#CAA85A" },
  line_move: { label: "LINE MOVE", color: "#4CAF82" },
  matchup:   { label: "MATCHUP",   color: "#CAA85A" },
  sharp:     { label: "SHARP",     color: "#4CAF82" },
  coaching:  { label: "COACHING",  color: "#D98A42" },
  weather:   { label: "WEATHER",   color: "#4AA8C8" },
  prop:      { label: "PROP",      color: "#D98A42" },
  trend:     { label: "TREND",     color: "#4AA8C8" },
  portal:    { label: "PORTAL",    color: "#D8B86A" },
};

/* ── Slate ── */
export const CFB_SLATE: CFBGame[] = [
  {
    id: "g1",
    away: "BAMA", home: "UGA",
    awayFull: "Alabama", homeFull: "Georgia",
    awayColor: "#9E1B32", homeColor: "#BA0C2F",
    spread: "UGA -3.5", total: "0/U 47.5",
    time: "3:30 PM ET",
    signals: 5, network: "CBS", conference: "SEC",
    _stub: true,
  } as any,
  {
    id: "g2",
    away: "MICH", home: "OHIO",
    awayFull: "Michigan", homeFull: "Ohio State",
    awayColor: "#00274C", homeColor: "#BB0000",
    spread: "OHIO -6.5", total: "0/U 44",
    time: "12:00 PM ET",
    signals: 4, network: "FOX", conference: "Big Ten",
    _stub: true,
  } as any,
  {
    id: "g3",
    away: "TX", home: "LSU",
    awayFull: "Texas", homeFull: "LSU",
    awayColor: "#BF5700", homeColor: "#461D7C",
    spread: "LSU -4", total: "0/U 51",
    time: "7:30 PM ET",
    signals: 3, network: "ESPN", conference: "SEC",
    _stub: true,
  } as any,
  {
    id: "g4",
    away: "USC", home: "ND",
    awayFull: "USC", homeFull: "Notre Dame",
    awayColor: "#990000", homeColor: "#0C2340",
    spread: "ND -2.5", total: "0/U 49",
    time: "4:00 PM ET",
    signals: 3, network: "NBC", conference: "Ind.",
    _stub: true,
  } as any,
  {
    id: "g5",
    away: "CLEM", home: "FSU",
    awayFull: "Clemson", homeFull: "Florida State",
    awayColor: "#F66733", homeColor: "#782F40",
    spread: "FSU -1.5", total: "0/U 45.5",
    time: "8:00 PM ET",
    signals: 2, network: "ABC", conference: "ACC",
    _stub: true,
  } as any,
];

/* ── Featured Edge ── */
export const CFB_FEATURED_EDGE: CFBFeaturedEdge = {
  id: "fe1",
  type: "transfer",
  team: "OHIO",
  headline: "Ohio State QB Will Howard quietly dominates fall camp — market still pricing him like a question mark",
  subhead: "Practice reports consistent: Howard completing 72% in team periods. Backup depth non-existent. Line opened OHIO -6.5 and has barely moved despite sharp early action.",
  action: "Take Ohio State -6.5 if you can still get it. Sharp side confirms. Public is fading the 'can he repeat?' narrative while the actual QB metrics say year-two leap.",
  confidence: 89,
  sources: 14,
  timestamp: "2h ago",
  verdict: "confirmed",
  conference: "Big Ten",
  _stub: true,
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
    detail: "Reporters tracking fall camp note Howard at 71–72% in team periods through three weeks. No public source has made this the headline. Line is still priced off spring uncertainty.",
    why_it_matters: "Ohio State's ceiling as a title contender hinges entirely on QB play. If Howard is legitimate, the market is severely undervaluing the Buckeyes heading into Big Ten play.",
    action_takeaway: "Target Ohio State team totals and spread throughout early season while public skepticism persists. This is a buy-low window on a potentially elite offense.",
    verdict: "confirmed",
    confidence: 89,
    sources: 14,
    timestamp: "2h ago",
    tags: ["QB", "Ohio State", "Big Ten", "Camp"],
    conference: "Big Ten",
    _stub: true,
  },
  {
    id: "s2",
    type: "line_move",
    team: "UGA",
    opponent: "BAMA",
    headline: "Georgia -3.5 → -5 overnight — sharp steam driving SEC opener total under",
    detail: "Line moved 1.5 points away from Alabama in a 4-hour window. Under also tracked from 48 to 47.5. Sharp ticket count on Georgia moneyline at 68% despite split public.",
    why_it_matters: "Classic sharp fade of public Alabama narrative. Books absorbed early Bama action then moved opposite. Secondary move on totals signals strong disagreement with the public over.",
    action_takeaway: "Georgia -5 or better still has value. Fade the Alabama sentiment market. Under 47.5 with steam confirmation is an independent play.",
    verdict: "confirmed",
    confidence: 84,
    sources: 11,
    timestamp: "1h ago",
    tags: ["Line Move", "Sharp", "SEC", "Total"],
    conference: "SEC",
    _stub: true,
  },
  {
    id: "s3",
    type: "injury",
    player: "TreVeyon Henderson",
    team: "OHIO",
    headline: "Henderson limited Wednesday — not on injury report yet, but practice observers flagged it",
    detail: "Multiple reporters confirmed Henderson worked with trainers separately in the first 20 minutes of practice. No official designation. Ohio State historically holds status until Thursday.",
    why_it_matters: "Henderson is a top-3 back in the Big Ten. If he's limited or unavailable vs Michigan, Ohio State's ground game shifts to Dallan Hayden — material change for the spread and player props.",
    action_takeaway: "Monitor Thursday report closely. If he draws a questionable tag, back Michigan +6.5 immediately. Hold Henderson rush props until clarity.",
    verdict: "rumor",
    confidence: 61,
    sources: 4,
    timestamp: "45m ago",
    tags: ["RB", "Ohio State", "Injury", "Big Ten"],
    conference: "Big Ten",
    _stub: true,
  },
  {
    id: "s4",
    type: "coaching",
    team: "LSU",
    headline: "LSU offensive coordinator implementing new RPO package for Texas matchup — scheme change confirmed",
    detail: "Multiple beat reporters confirmed Brian Kelly signed off on a new run-pass option set installed this week specifically targeting Texas's linebacker alignment. Film sessions extended Tuesday.",
    why_it_matters: "Texas held opponents to 3.8 YPC last season but surrendered big plays in space. LSU exploiting this with speed mismatches could flip the game script from a grind to an open shootout.",
    action_takeaway: "Lean toward LSU covering -4 if the over shows early. Total of 51 starts to look low if LSU opens the middle of the field. This is a live dog situation for TX +4.",
    verdict: "likely",
    confidence: 74,
    sources: 8,
    timestamp: "3h ago",
    tags: ["Coaching", "Scheme", "LSU", "SEC", "Texas"],
    conference: "SEC",
    _stub: true,
  },
  {
    id: "s5",
    type: "portal",
    player: "Darian Mensah",
    team: "TX",
    headline: "Texas portal QB Mensah elevated to co-starter — changes backup value entirely",
    detail: "Arch Manning is the clear starter, but Mensah was quietly elevated to co-starter designation in depth chart released Monday. Texas hasn't officially commented. Mensah put up 31 TDs at Tulane.",
    why_it_matters: "Backup QB elevation signals Texas is either managing Manning's workload or preparing for heavy opponent scouting. Either way, it creates prop uncertainty for first-half passing totals.",
    action_takeaway: "Fade Manning first-half passing props if the game script goes run-heavy early. Wait for full confirmation before betting the team total.",
    verdict: "rumor",
    confidence: 58,
    sources: 3,
    timestamp: "5h ago",
    tags: ["QB", "Transfer Portal", "Texas", "SEC"],
    conference: "SEC",
    _stub: true,
  },
  {
    id: "s6",
    type: "sharp",
    team: "ND",
    opponent: "USC",
    headline: "Notre Dame sharp action — 74% of sharp tickets on ND -2.5 vs USC",
    detail: "Books showing 74% sharp ticket count on Notre Dame despite even public handle. ND opened -2 and moved to -2.5 on overnight sharp. All three major sharp-tracking sources confirm.",
    why_it_matters: "Classic sharp fade of a USC public team. The Trojans draw big national betting interest regardless of situation — sharp money sees value on the other side.",
    action_takeaway: "ND -2.5 still has value. Don't chase if it moves to -4 or beyond. Under 49 also in sharp territory.",
    verdict: "confirmed",
    confidence: 82,
    sources: 10,
    timestamp: "1h ago",
    tags: ["Sharp", "Notre Dame", "USC", "Line Move"],
    conference: "Ind.",
    _stub: true,
  },
  {
    id: "s7",
    type: "depth",
    player: "Keon Coleman Jr.",
    team: "FSU",
    headline: "FSU WR depth charted as starter — Keon's departure creates target share void Clemson hasn't accounted for",
    detail: "Keon Coleman left for the NFL. Junior Toney Smith is now WR1 per released depth chart. Smith had 28 receptions last season — half of Keon's output. No transfer portal addition at the position.",
    why_it_matters: "Florida State's passing attack is materially weaker than last year's version Clemson prepared for. This creates a fade scenario: Clemson D is overrated but FSU offense is genuinely worse.",
    action_takeaway: "This game total of 45.5 is too high given FSU's thinned receiving corps. Under 45.5 has real value. Clemson +1.5 if you can get it as a live underdog with a real defensive edge.",
    verdict: "confirmed",
    confidence: 77,
    sources: 9,
    timestamp: "4h ago",
    tags: ["WR", "Depth Chart", "FSU", "ACC", "Clemson"],
    conference: "ACC",
    _stub: true,
  },
  {
    id: "s8",
    type: "weather",
    team: "MICH",
    opponent: "OHIO",
    headline: "Wind advisory issued for Columbus noon kickoff — 25 mph gusts projected",
    detail: "National Weather Service issued advisory through 3 PM for Franklin County. 23–28 mph sustained winds with gusts to 35 mph. Stadium sits in a natural wind tunnel. Passing game impact material.",
    why_it_matters: "Ohio State's offense is air-attack dependent. Michigan's defensive identity already disrupts timing routes. Add 30 mph gusts and OHIO's 44 total looks inflated.",
    action_takeaway: "Under 44 is the play. Consider it a two-unit lean. Weather conditions don't affect this matchup symmetrically — Ohio State carries more weather risk.",
    verdict: "confirmed",
    confidence: 91,
    sources: 5,
    timestamp: "30m ago",
    tags: ["Weather", "Total", "Big Ten", "Michigan", "Ohio State"],
    conference: "Big Ten",
    _stub: true,
  },
  {
    id: "s9",
    type: "trend",
    team: "BAMA",
    headline: "Alabama 0-4 ATS as a road underdog under Kalen DeBoer — historical pattern sharp money now exploiting",
    detail: "Since DeBoer took over, Alabama has failed to cover in all four instances as a road underdog. Books know the pattern. Overnight sharp action took Georgia to -5 citing this trend.",
    why_it_matters: "Pattern investing isn't reliable on its own, but when sharp action explicitly cites the trend AND the line moves in the trend's direction, that's confirmation, not coincidence.",
    action_takeaway: "Georgia -5 or better. Don't fade the trend when the market is confirming it with real money.",
    verdict: "likely",
    confidence: 71,
    sources: 7,
    timestamp: "6h ago",
    tags: ["ATS Trend", "Alabama", "SEC", "Coaching"],
    conference: "SEC",
    _stub: true,
  },
  {
    id: "s10",
    type: "prop",
    player: "Arch Manning",
    team: "TX",
    headline: "Arch Manning passing yards prop set at 238.5 — line inflated by narrative premium",
    detail: "Books pricing Manning off hype, not production. His true comp is a top-15 college passer on a run-first team. Texas ran 52% of the time last season. LSU's base 4-2-5 is built to stop spread offenses.",
    why_it_matters: "Manning props are the most public-side bet in CFB this week. Books have inflated the line. Regression to a run-first game plan against a defensive scheme that takes away RPO means the under hits.",
    action_takeaway: "Under 238.5 passing yards for Arch Manning. If line drops to 225, reconsider. The narrative premium is the edge.",
    verdict: "likely",
    confidence: 67,
    sources: 6,
    timestamp: "3h ago",
    tags: ["Prop", "QB", "Texas", "SEC", "LSU"],
    conference: "SEC",
    _stub: true,
  },
  {
    id: "s11",
    type: "matchup",
    team: "UNC",
    opponent: "PENN",
    headline: "Penn State slot WR vs UNC nickel coverage — schematic mismatch favors PSU passing game",
    detail: "UNC's nickel package struggles against speed in the slot. Penn State's KeAndre Lambert-Smith has been the most explosive slot in the B1G. UNC corners playing off-technique — 2.3 YAC allowed per route.",
    why_it_matters: "When a speed mismatch this specific shows up in film study, it tends to surface as a chunk play machine. PSU's passing totals should exceed market expectations.",
    action_takeaway: "Penn State team total over 24.5 first half. Lambert-Smith over 55.5 receiving yards is a live prop if the matchup stays as mapped.",
    verdict: "likely",
    confidence: 72,
    sources: 8,
    timestamp: "5h ago",
    tags: ["Matchup", "WR", "Penn State", "Big Ten", "UNC"],
    conference: "ACC/Big Ten",
    _stub: true,
  },
  {
    id: "s12",
    type: "transfer",
    player: "Cam Ward",
    team: "MICH",
    headline: "Cam Ward transfer era over — but depth chart ripple still affecting Michigan's line in early markets",
    detail: "Ward's departure to the NFL created a depth void Michigan addressed in the portal with Bryce Underwood. Books haven't fully updated power ratings to account for the new QB. Line still reflects Ward-era Michigan.",
    why_it_matters: "If oddsmakers are slow to reprice Michigan's ceiling, there's value in fading Michigan early in the season until Underwood proves himself. Or value in backing if Underwood shows elite ceiling.",
    action_takeaway: "Watch Michigan's opening drive efficiency in Week 1. If Underwood shows command, buy Michigan futures before the market reprices. For now, fade Michigan team totals on the over.",
    verdict: "review",
    confidence: 55,
    sources: 5,
    timestamp: "8h ago",
    tags: ["QB", "Transfer", "Michigan", "Big Ten"],
    conference: "Big Ten",
    _stub: true,
  },
];
