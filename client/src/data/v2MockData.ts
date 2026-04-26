/* ────────────────────────────────────────────────────────────
   Edge Setter v2 — Enriched signal data for NBA + MLB boards
   All entries labeled [STUB]. Replace with live API data when
   signal ingestion is wired to real sources.

   Data model upgraded Sprint 5:
   - sourceTypes[]  : categories of sources confirming this signal
   - sourceLabels[] : named sources where surfaceable
   - lineMovement   : spread/total shift with direction
   - bettingRelevance : true if this has a direct market angle
   - fantasyRelevance : true if this affects DFS/season lineups
   - isoTimestamp   : machine-readable timestamp for freshness sorting
   - hitRateStub    : placeholder for future confidence tracking
   - confirmationStrength: "single" | "corroborated" | "consensus"
   ──────────────────────────────────────────────────────────── */

export type SignalType =
  | "injury"
  | "line_move"
  | "matchup_edge"
  | "rotation"
  | "lineup"
  | "trend"
  | "prop"
  | "news"
  | "sharp_money"
  | "coaching"
  | "weather"
  | "depth"
  | "portal"
  | "transaction";

export type Verdict = "confirmed" | "likely" | "rumor" | "contradicted" | "review";

export type ConfirmationStrength = "single" | "corroborated" | "consensus";

export interface LineMovement {
  open: string;
  current: string;
  direction: "up" | "down" | "both" | "flat";
  note?: string;
}

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
  sources: number;                        // count of independent sources
  sourceTypes?: string[];                 // e.g. ["beat reporter", "official report"]
  sourceLabels?: string[];                // named sources where surfaceable
  confirmationStrength?: ConfirmationStrength;
  timestamp: string;                      // human-readable relative time
  isoTimestamp?: string;                  // ISO 8601 for sorting/freshness
  tags: string[];
  lineMovement?: LineMovement;
  bettingRelevance?: boolean;
  fantasyRelevance?: boolean;
  pitcherMatchup?: string;               // MLB-specific
  lineupStatus?: string;                 // MLB lineup confirmation status
  rotationNote?: string;                 // NBA rotation/playoff context
  matchupEdge?: string;                  // matchup-specific edge note
  // Future tracking stubs (not displayed publicly yet)
  hitRateStub?: null;
  closingLineValueStub?: null;
  _stub: true;
}

/* ══════════════════════════════════════════════════════════
   NBA SIGNALS
   ══════════════════════════════════════════════════════════ */

export const NBA_SIGNALS: V2Signal[] = [
  {
    id: "nba-001",
    sport: "NBA",
    type: "injury",
    player: "Anthony Davis",
    team: "LAL",
    opponent: "GSW",
    headline: "Anthony Davis listed as questionable — left ankle soreness",
    detail: "Davis was a late add to the injury report after Thursday's shootaround. Team describes it as manageable and monitored. He's played all 5 playoff games, averaging 28.4 pts / 12.1 reb / 2.3 blk. Practice participation was limited — he was seen doing shooting but skipped 5-on-5.",
    why_it_matters: "Davis is LAL's defensive anchor and interior threat. A limited Davis opens the paint for Curry drives, changes LAL's help rotations, and almost certainly shifts the spread 1.5–2 points. Watch for Hachimura and Reaves usage bumps.",
    action_takeaway: "Hold any LAL position until official status drops at 7:00 PM ET. If Davis is downgraded to doubtful/out, fade LAL team total (target Under); look at GSW -1.5 alt spread and Curry over props.",
    verdict: "likely",
    confidence: 78,
    sources: 8,
    sourceTypes: ["official report", "beat reporter", "practice observation"],
    sourceLabels: ["NBA Official Injury Report", "The Athletic", "ESPN"],
    confirmationStrength: "corroborated",
    timestamp: "22m ago",
    isoTimestamp: "2026-04-26T14:38:00Z",
    tags: ["injury", "playoffs", "LAL", "GSW"],
    bettingRelevance: true,
    fantasyRelevance: true,
    rotationNote: "If Davis sits, expect Hachimura at the 5. LeBron will absorb more defensive load.",
    matchupEdge: "Curry is 7-for-12 from 3 against Davis-less LAL lineups this postseason.",
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "nba-002",
    sport: "NBA",
    type: "line_move",
    team: "BOS",
    opponent: "MIA",
    headline: "BOS -6.5 → -8 sharp steam — Celtics absorbing buy-side",
    detail: "Line moved 1.5 points across Pinnacle, Circa, and DraftKings within a 90-minute window with reverse public action. Public money is 61% on MIA but 80% of tracked sharp handles are on BOS. Ticket split does not explain the move — this is sharp-driven. Opened at -6 Sunday night.",
    why_it_matters: "When the line moves against public betting percentage, it almost always reflects sharp or syndicate action. BOS is a consensus sharp-side lean. The 1.5-point move is significant for a 3-game playoff series.",
    action_takeaway: "BOS -7.5 or better (split the difference) if you can find it. Avoid -8 or worse unless Davis news pushes it. BOS team total over also worth a look — Celtics are averaging 117 in their last 4.",
    verdict: "confirmed",
    confidence: 84,
    sources: 11,
    sourceTypes: ["sportsbook", "sharp money", "line tracking"],
    sourceLabels: ["Pinnacle", "Circa Sports", "Action Network"],
    confirmationStrength: "consensus",
    timestamp: "8h ago",
    isoTimestamp: "2026-04-26T07:00:00Z",
    tags: ["line_move", "sharp", "BOS", "MIA", "playoffs"],
    lineMovement: {
      open: "-6",
      current: "-8",
      direction: "down",
      note: "1.5-pt move against 61% public MIA lean — sharp-driven",
    },
    bettingRelevance: true,
    fantasyRelevance: false,
    matchupEdge: "Celtics +12.4 net rating when Tatum/Brown are both 20+ — both averaging 23+ this series.",
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "nba-003",
    sport: "NBA",
    type: "matchup_edge",
    team: "BOS",
    opponent: "MIA",
    headline: "Brown vs Butler matchup — BOS exploiting Butler's right-hand bias",
    detail: "Advanced tracking shows Butler goes right 74% of the time in isolation on the left block. Brown has shaded right in coverage in Games 2–3, holding Butler to 6/18 from the field. BOS coaching staff flagged this adjustment in their Game 3 film session (per The Athletic source). Butler has not adjusted.",
    why_it_matters: "Coaching adjustments that persist across games tend to compound. If Butler can't solve Brown's shade, Miami's half-court offense stalls — they rank 28th in half-court efficiency when Butler is held under 20.",
    action_takeaway: "Butler under points (22.5 if available) is the cleaner bet. MIA team total under also has value — they score 6.3 fewer points per 100 when Butler is under 20.",
    verdict: "confirmed",
    confidence: 71,
    sources: 6,
    sourceTypes: ["analytics", "beat reporter", "tracking data"],
    sourceLabels: ["The Athletic", "Second Spectrum", "BBRef"],
    confirmationStrength: "corroborated",
    timestamp: "1h ago",
    isoTimestamp: "2026-04-26T14:00:00Z",
    tags: ["matchup", "BOS", "MIA", "playoffs", "defense"],
    bettingRelevance: true,
    fantasyRelevance: true,
    rotationNote: "BOS has not changed their Brown-on-Butler assignment — expect same look in Game 4.",
    matchupEdge: "Butler: 6/18 FG, 3/9 3P, 16 pts in Games 2–3 when Brown is primary defender.",
    hitRateStub: null,
    closingLineValueStub: null,
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
    detail: "Jokic played a playoff-high 42 minutes in Game 4. Denver used a closing lineup of Jokic, Murray, KCP, Gordon, and Porter Jr. — abandoning the DeRozan experiment that cost them in Game 3. Coach Malone said he's comfortable with this look and won't change it. Murray logged 46 minutes.",
    why_it_matters: "Denver's best lineup (Jokic + Murray) has a +21 net rating in this series. The Game 3 blunder (starting DeRozan in closing minutes) appears corrected. Expect DEN to be much tighter defensively with this closing group.",
    action_takeaway: "DEN team total over has value if line hasn't adjusted — this closing unit scores efficiently. Also: DEN -3.5 or better for Game 5 at home is worth monitoring once line posts.",
    verdict: "confirmed",
    confidence: 91,
    sources: 7,
    sourceTypes: ["official", "beat reporter", "broadcast"],
    sourceLabels: ["ESPN", "The Athletic", "Altitude TV"],
    confirmationStrength: "consensus",
    timestamp: "1h ago",
    isoTimestamp: "2026-04-26T14:00:00Z",
    tags: ["rotation", "DEN", "MIN", "playoffs", "lineup"],
    bettingRelevance: true,
    fantasyRelevance: true,
    rotationNote: "Jokic/Murray closing pairing confirmed. DeRozan out of closing lineup.",
    matchupEdge: "DEN best 5 (+21 NRtg this series) vs MIN's base with Edwards: edge to DEN.",
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "nba-005",
    sport: "NBA",
    type: "injury",
    player: "Jamal Murray",
    team: "DEN",
    opponent: "MIN",
    headline: "Murray 46 minutes — fatigue flag entering Game 5",
    detail: "Murray played 46 of a possible 48 minutes in Game 4. DEN has no viable backup at point guard — Christian Braun was the only other guard on the floor in crunch time. Murray is averaging 38.4 minutes this series, highest of any guard in the playoffs.",
    why_it_matters: "Playoff fatigue at this usage level is real. Historically, guards logging 42+ minutes in back-to-back games show -3.2 PPG and -1.8 APG drops. Game 5 is 48 hours after Game 4.",
    action_takeaway: "Watch Murray's early minutes and energy in Game 5. Under his points line (24.5) has value — fatigue-driven efficiency dips are measurable in this dataset.",
    verdict: "likely",
    confidence: 66,
    sources: 5,
    sourceTypes: ["analytics", "official", "beat reporter"],
    sourceLabels: ["BBRef", "ESPN", "The Athletic"],
    confirmationStrength: "corroborated",
    timestamp: "45m ago",
    isoTimestamp: "2026-04-26T14:15:00Z",
    tags: ["injury", "fatigue", "DEN", "Murray", "playoffs"],
    bettingRelevance: true,
    fantasyRelevance: true,
    rotationNote: "DEN has no option to reduce Murray's minutes — no viable backup PG.",
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "nba-006",
    sport: "NBA",
    type: "sharp_money",
    team: "GSW",
    opponent: "LAL",
    headline: "GSW total steam — Over 218.5 absorbed sharp action both books",
    detail: "GSW/LAL game total opened at 214.5 and has climbed to 218.5 at Pinnacle, 218 at DraftKings. Sharp handle is 77% on the Over despite only 45% of public tickets. Three separate steam moves detected in the last 6 hours.",
    why_it_matters: "Total moves of this magnitude (4 points) in a playoff game almost always trace to legitimate sharp action. Both teams have exceeded their projected totals in 4 of 5 games this series.",
    action_takeaway: "Over 218 or better is the value. Avoid the -120 or worse number. Also note: Davis uncertainty could suppress this if he's listed out — wait for his status before pulling the trigger.",
    verdict: "confirmed",
    confidence: 79,
    sources: 9,
    sourceTypes: ["sportsbook", "sharp money", "line tracking"],
    sourceLabels: ["Pinnacle", "DraftKings", "Action Network"],
    confirmationStrength: "consensus",
    timestamp: "3h ago",
    isoTimestamp: "2026-04-26T12:00:00Z",
    tags: ["sharp", "line_move", "total", "GSW", "LAL"],
    lineMovement: {
      open: "214.5",
      current: "218.5",
      direction: "up",
      note: "+4 points, 77% sharp handles on Over vs 45% public",
    },
    bettingRelevance: true,
    fantasyRelevance: false,
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "nba-007",
    sport: "NBA",
    type: "prop",
    player: "Stephen Curry",
    team: "GSW",
    opponent: "LAL",
    headline: "Curry 3PT props inflated — market hasn't adjusted for Davis status",
    detail: "Curry's 3PT made prop is sitting at 4.5 across most books. In games where Davis plays limited minutes or is out, Curry averages 5.8 made 3s in this series. Books priced this line before today's Davis injury report dropped.",
    why_it_matters: "A Davis absence removes the primary interior deterrent that pulls Curry off the perimeter. Curry's open-3 frequency jumps by 2.4 attempts per game in such scenarios per tracking data.",
    action_takeaway: "Curry over 4.5 threes (+110 or better) if Davis is confirmed doubtful/out. Even with Davis playing limited minutes, the over has value at 4.5.",
    verdict: "likely",
    confidence: 73,
    sources: 6,
    sourceTypes: ["analytics", "sportsbook", "tracking data"],
    sourceLabels: ["Second Spectrum", "DraftKings", "Action Network"],
    confirmationStrength: "corroborated",
    timestamp: "18m ago",
    isoTimestamp: "2026-04-26T14:42:00Z",
    tags: ["prop", "Curry", "GSW", "LAL", "playoffs"],
    bettingRelevance: true,
    fantasyRelevance: true,
    matchupEdge: "Curry: 5.8 made 3s per game in Davis-out/limited lineups this postseason.",
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "nba-008",
    sport: "NBA",
    type: "injury",
    player: "Giannis Antetokounmpo",
    team: "MIL",
    opponent: "IND",
    headline: "Giannis ruled out — knee soreness, missed practice",
    detail: "Giannis was officially ruled out for Game 5 after missing the full practice session. Team confirmed it's the same right knee issue that limited him in Games 2 and 3. He did not travel with the team. Adrian Wojnarowski first reported; now confirmed by the official NBA injury report.",
    why_it_matters: "Without Giannis, MIL loses their entire offensive identity — 32.1% usage rate, and no one else replicates his interior pressure. IND's advantage in pace and perimeter shooting becomes massive.",
    action_takeaway: "IND spread and IND team total are both live. Also: Brook Lopez usage spike — he'll see 36+ minutes and 15+ shots. Lopez over points/rebounds has value.",
    verdict: "confirmed",
    confidence: 99,
    sources: 14,
    sourceTypes: ["official report", "beat reporter", "insider"],
    sourceLabels: ["NBA Official Injury Report", "ESPN (Woj)", "The Athletic (Shams)"],
    confirmationStrength: "consensus",
    timestamp: "47m ago",
    isoTimestamp: "2026-04-26T14:13:00Z",
    tags: ["injury", "out", "MIL", "IND", "Giannis", "playoffs"],
    bettingRelevance: true,
    fantasyRelevance: true,
    rotationNote: "Brook Lopez starts and is expected to see 36+ mins. Khris Middleton absorption of playmaking duties.",
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
];

/* ── Tonight's Slate ──────────────────────────────────────── */

export interface NBAGame {
  id: string;
  away: string;
  home: string;
  awayFull: string;
  homeFull: string;
  time: string;
  network?: string;
  spread: string;
  total: string;
  signals: number;
  seriesRecord?: string;
  isPlayoffs?: boolean;
  gameNumber?: number;
  lineMovement?: LineMovement;
}

export const NBA_TONIGHT: NBAGame[] = [
  {
    id: "gm-gsw-lal",
    away: "GSW",
    home: "LAL",
    awayFull: "Golden State Warriors",
    homeFull: "Los Angeles Lakers",
    time: "7:30 PM ET",
    network: "TNT",
    spread: "LAL -4.5",
    total: "O/U 213.5",
    signals: 4,
    seriesRecord: "LAL leads 3-2",
    isPlayoffs: true,
    gameNumber: 6,
    lineMovement: { open: "LAL -3.5", current: "LAL -4.5", direction: "down", note: "Sharp LAL action" },
  },
  {
    id: "gm-mia-bos",
    away: "MIA",
    home: "BOS",
    awayFull: "Miami Heat",
    homeFull: "Boston Celtics",
    time: "8:30 PM ET",
    network: "ESPN",
    spread: "BOS -8",
    total: "O/U 214",
    signals: 3,
    seriesRecord: "BOS leads 3-1",
    isPlayoffs: true,
    gameNumber: 5,
    lineMovement: { open: "BOS -6", current: "BOS -8", direction: "down", note: "Sharp BOS steam" },
  },
  {
    id: "gm-min-den",
    away: "MIN",
    home: "DEN",
    awayFull: "Minnesota Timberwolves",
    homeFull: "Denver Nuggets",
    time: "10:00 PM ET",
    network: "TNT",
    spread: "DEN -5.5",
    total: "O/U 219",
    signals: 2,
    seriesRecord: "Tied 2-2",
    isPlayoffs: true,
    gameNumber: 5,
  },
];

/* ══════════════════════════════════════════════════════════
   MLB SIGNALS
   ══════════════════════════════════════════════════════════ */

export interface MLBSignal extends Omit<V2Signal, "sport"> {
  sport: "MLB";
  pitcherMatchup?: string;
  pitcherHandedness?: "LHP" | "RHP";
  pitcherRecentERA?: number;
  lineupConfirmed?: boolean;
  lineupConfirmationSources?: string[];
  weatherNote?: string;
  parkFactor?: "neutral" | "hitter" | "pitcher";
}

export const MLB_SIGNALS: V2Signal[] = [
  {
    id: "mlb-001",
    sport: "MLB",
    type: "lineup",
    player: "Michael King",
    team: "SD",
    opponent: "LAD",
    headline: "Cole scratched — right elbow inflammation, 7-day IL likely",
    detail: "Gerrit Cole was scratched from tonight's scheduled start with right elbow inflammation. Michael King is being called up from Triple-A El Paso to start. LAD lineup was already submitted with Cole as the projected starter. Rotowire and The Athletic both confirmed the IL placement is expected to be made official within the hour.",
    why_it_matters: "Cole vs. King is a massive quality gap. LAD ranks 3rd in OPS vs. RHP this season; King's last 3 starts show a 5.12 ERA and 1.4 WHIP. This dramatically reshapes the run environment for tonight.",
    action_takeaway: "LAD ML now has strong value — was around -130 with Cole, now underpriced relative to King's upside. LAD run line (-1.5) is worth a look. Over also improves significantly.",
    verdict: "confirmed",
    confidence: 97,
    sources: 11,
    sourceTypes: ["official", "beat reporter", "wire service"],
    sourceLabels: ["MLB Transaction Wire", "Rotowire", "The Athletic"],
    confirmationStrength: "consensus",
    timestamp: "1h ago",
    isoTimestamp: "2026-04-26T14:00:00Z",
    tags: ["lineup", "injury", "starter", "SD", "LAD"],
    lineupStatus: "IL placement pending official confirmation",
    bettingRelevance: true,
    fantasyRelevance: true,
    pitcherMatchup: "King (RHP, 5.12 ERA L3) vs. LAD",
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "mlb-002",
    sport: "MLB",
    type: "line_move",
    team: "KC",
    opponent: "BUF",
    headline: "KC -3.5 → -5.5 since open — sharp action driving Chiefs line",
    detail: "Opening line movement of 2 full points, driven primarily by sharp handle at Pinnacle and Circa. Public split is 53% on KC but 84% of tracked sharp handles are KC-side. This is one of the cleanest sharp signals of the week — it crossed 3 key numbers (4, 4.5, 5).",
    why_it_matters: "A 2-point move crossing multiple key numbers in MLB is rare and almost always sharp-driven. Books have high limits on this game — meaning the sharpest bettors already acted.",
    action_takeaway: "KC -4.5 if available. Do not buy the -5.5 — you're chasing the sharp number, not getting it. Alt run line KC -1.5 also viable as a consolation entry.",
    verdict: "confirmed",
    confidence: 84,
    sources: 9,
    sourceTypes: ["sportsbook", "sharp money", "line tracking"],
    sourceLabels: ["Pinnacle", "Circa Sports", "Action Network"],
    confirmationStrength: "consensus",
    timestamp: "1h ago",
    isoTimestamp: "2026-04-26T13:55:00Z",
    tags: ["line_move", "sharp", "KC", "MLB"],
    lineMovement: {
      open: "KC -3.5",
      current: "KC -5.5",
      direction: "down",
      note: "2-pt move crossing 4/4.5/5 — sharp-driven, 84% sharp handle KC",
    },
    bettingRelevance: true,
    fantasyRelevance: false,
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "mlb-003",
    sport: "MLB",
    type: "lineup",
    player: "Aaron Judge",
    team: "NYY",
    opponent: "BAL",
    headline: "Judge confirmed in NYY lineup — batting cleanup, DH slot",
    detail: "Aaron Judge is confirmed in tonight's lineup despite a scheduled rest day that was rumored earlier this week. He's batting 4th as DH. Judge is 9-for-21 (.429) with 3 HR in his last 5 games against BAL. Lineup confirmed by Rotowire and cross-referenced by two MLB lineup aggregators.",
    why_it_matters: "Judge's presence vs. a lefty (Bradish) is the key matchup angle. He's hitting .418 vs. LHP this season. His lineup confirmation also keeps NYY fantasy stack intact.",
    action_takeaway: "Judge over 0.5 HR is worth a look at standard prices. NYY team total over also gains value with Judge in the middle of the order against a starter he's seen before.",
    verdict: "confirmed",
    confidence: 94,
    sources: 7,
    sourceTypes: ["official", "fantasy platform", "beat reporter"],
    sourceLabels: ["Rotowire", "ESPN", "NY Post Beat"],
    confirmationStrength: "consensus",
    timestamp: "2h ago",
    isoTimestamp: "2026-04-26T13:00:00Z",
    tags: ["lineup", "Judge", "NYY", "BAL"],
    lineupStatus: "Confirmed — 4th (DH)",
    pitcherMatchup: "Bradish (LHP, 2.88 ERA) vs NYY",
    bettingRelevance: true,
    fantasyRelevance: true,
    matchupEdge: "Judge: .418 vs LHP this season. 9-for-21 in last 5 games vs BAL.",
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "mlb-004",
    sport: "MLB",
    type: "weather",
    team: "CHC",
    opponent: "MIL",
    headline: "Wrigley wind blowing out at 18 mph — total climbed 1.5 runs",
    detail: "Wind is 18 mph out to center field at Wrigley this afternoon. Total has already climbed from 8.5 to 10 since the wind data was factored in. Both pitchers (Steele, Burnes) rely on ground balls — wind out at Wrigley significantly boosts HR probability.",
    why_it_matters: "18 mph out at Wrigley is one of the strongest environmental boosts in baseball. Historical data shows overs hit at a 61% rate in Wrigley games with 15+ mph outward wind.",
    action_takeaway: "Over 9.5 still has value if you missed 8.5/9. Wrigley HR props are also worth exploring — both cleanup hitters face pitchers who are flyball-susceptible in wind conditions.",
    verdict: "confirmed",
    confidence: 88,
    sources: 5,
    sourceTypes: ["weather service", "sportsbook", "analytics"],
    sourceLabels: ["National Weather Service", "Action Network", "Statcast Park Factors"],
    confirmationStrength: "corroborated",
    timestamp: "3h ago",
    isoTimestamp: "2026-04-26T12:00:00Z",
    tags: ["weather", "CHC", "MIL", "total", "wind"],
    lineMovement: {
      open: "8.5",
      current: "10",
      direction: "up",
      note: "+1.5 run climb tied directly to wind data — wind 18mph out to center",
    },
    bettingRelevance: true,
    fantasyRelevance: true,
    weatherNote: "18 mph out to CF. Forecast stable through first pitch.",
    parkFactor: "hitter",
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "mlb-005",
    sport: "MLB",
    type: "matchup_edge",
    team: "HOU",
    opponent: "TEX",
    headline: "HOU lefty matchup stack — TEX bullpen exposed vs LHB",
    detail: "TEX is expected to go to the bullpen by the 5th inning tonight, and their pen ranks 28th vs. left-handed batters this season (4.89 ERA, .271 BAA). HOU has three quality left-handed hitters in the heart of their order — Alvarez, Abreu, and McCormick. The platoon advantage is sharp.",
    why_it_matters: "Late-game matchups vs. weak pen arms amplify the LHB advantage. TEX closer has also struggled against lefties (0.82 WHIP in that split).",
    action_takeaway: "HOU team total over gains value in the 6th–9th inning if TEX's pen enters as expected. HOU ML is also lean-worthy at reasonable prices.",
    verdict: "likely",
    confidence: 68,
    sources: 6,
    sourceTypes: ["analytics", "beat reporter", "sportsbook"],
    sourceLabels: ["Statcast", "The Athletic", "Action Network"],
    confirmationStrength: "corroborated",
    timestamp: "4h ago",
    isoTimestamp: "2026-04-26T11:00:00Z",
    tags: ["matchup", "HOU", "TEX", "bullpen", "platoon"],
    pitcherMatchup: "TEX pen (LHB: 4.89 ERA, 28th) vs HOU LHB stack",
    bettingRelevance: true,
    fantasyRelevance: true,
    matchupEdge: "Alvarez .332 / Abreu .298 / McCormick .311 vs RHP relievers this season.",
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
  {
    id: "mlb-006",
    sport: "MLB",
    type: "transaction",
    player: "Spencer Strider",
    team: "ATL",
    opponent: "NYM",
    headline: "Strider activated from 60-day IL — pitching tonight",
    detail: "Spencer Strider was activated from the 60-day IL this morning and is confirmed as tonight's starter against NYM. He logged 3 minor league rehab starts, posting a 1.89 ERA with 14 K in 9.2 IP. His stuff (97 mph fastball, 35% whiff rate on slider) appeared fully restored per tracking data from his last rehab outing.",
    why_it_matters: "Strider is a top-5 starter when healthy. His return changes ATL's entire pitching calculus and dramatically suppresses NYM's offensive upside for this game.",
    action_takeaway: "ATL ML is undervalued anywhere near -130 or better with Strider returning. NYM total under is also in play — they struggle vs. elite fastball/slider combinations.",
    verdict: "confirmed",
    confidence: 96,
    sources: 12,
    sourceTypes: ["official", "transaction", "beat reporter", "analytics"],
    sourceLabels: ["MLB Transaction Wire", "Rotowire", "The Athletic", "Statcast"],
    confirmationStrength: "consensus",
    timestamp: "30m ago",
    isoTimestamp: "2026-04-26T14:30:00Z",
    tags: ["transaction", "starter", "ATL", "Strider", "IL return"],
    lineupStatus: "Activated — confirmed starter",
    pitcherMatchup: "Strider (RHP, returned from 60-day IL) vs NYM",
    bettingRelevance: true,
    fantasyRelevance: true,
    matchupEdge: "Strider rehab: 1.89 ERA, 14 K / 9.2 IP. Stuff fully restored (97 mph FB, 35% whiff on slider).",
    hitRateStub: null,
    closingLineValueStub: null,
    _stub: true,
  },
];

/* ── Tools stub (used by V2Home sidebar) ── */
export const TOOLS = [
  { id: "matchups",    name: "Matchups",       sport: ["NBA", "MLB", "NFL"],    status: "Coming Soon", href: "/v2/tools/matchups",   icon: "✗" },
  { id: "signals",     name: "Player Signals",  sport: ["NBA", "MLB"],           status: "Beta",        href: "/v2/tools/signals",    icon: "↗" },
  { id: "trends",      name: "Team Trends",     sport: ["NBA", "MLB", "NFL", "CFB"], status: "Coming Soon", href: "/v2/tools/trends", icon: "↗" },
  { id: "watchlist",   name: "Watchlist",       sport: ["NBA", "MLB", "NFL"],    status: "Coming Soon", href: "/v2/tools/watchlist",  icon: "★" },
  { id: "movement",    name: "Market Movement", sport: ["NBA", "MLB"],           status: "Beta",        href: "/v2/tools/movement",   icon: "↗" },
];
