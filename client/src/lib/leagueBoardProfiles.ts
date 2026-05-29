import type { Sport } from "./leagueModifiers";
import type { SituationLane } from "./boardEscalation";

export type LeagueBoardProfile = {
  league: Sport;
  boardLabel: string;
  liveStripLabel: string;
  featuredLabel: string;
  primarySignalTypes: string[];
  livePrioritySignalTypes: string[];
  laneOrder: SituationLane[];
  laneLabels: Record<SituationLane, string>;
  emptyState: string;
};

const LEGACY_LANE_LABELS: Record<SituationLane, string> = {
  escalating: "Escalating Stories",
  live: "Live Game Watch",
  decision: "Decision Windows",
  confirmed: "Verified Stories",
  background: "Background Watch",
};

const EDITORIAL_LANE_LABELS: Record<SituationLane, string> = {
  escalating: "Lead Developments",
  live: "Game Windows",
  decision: "Watch Before Lock",
  confirmed: "Confirmed Updates",
  background: "Monitoring",
};

const DEFAULT_LANE_ORDER: SituationLane[] = [
  "escalating",
  "live",
  "decision",
  "confirmed",
  "background",
];

export const LEAGUE_BOARD_PROFILES: Record<Sport, LeagueBoardProfile> = {
  NBA: {
    league: "NBA",
    boardLabel: "NBA Developing Stories Board",
    liveStripLabel: "Tonight's Games",
    featuredLabel: "Top Developing Story",
    primarySignalTypes: ["injury", "rotation", "lineup", "line_move", "sharp_money"],
    livePrioritySignalTypes: ["injury", "rotation", "lineup"],
    laneOrder: DEFAULT_LANE_ORDER,
    laneLabels: EDITORIAL_LANE_LABELS,
    emptyState: "Monitoring injuries, rotations, source agreement, external movement, and lineup confirmations.",
  },
  MLB: {
    league: "MLB",
    boardLabel: "MLB Developing Stories Board",
    liveStripLabel: "Today's Games",
    featuredLabel: "Top Developing Story",
    primarySignalTypes: ["lineup", "transaction", "weather", "injury", "line_move"],
    livePrioritySignalTypes: ["lineup", "transaction", "weather"],
    laneOrder: DEFAULT_LANE_ORDER,
    laneLabels: EDITORIAL_LANE_LABELS,
    emptyState: "Monitoring lineups, pitchers, weather, transactions, source agreement, and external movement.",
  },
  NFL: {
    league: "NFL",
    boardLabel: "NFL Developing Stories Board",
    liveStripLabel: "NFL Watch Slate",
    featuredLabel: "Top Developing Story",
    primarySignalTypes: ["injury", "line_move", "sharp", "sharp_money", "weather", "role_change"],
    livePrioritySignalTypes: ["injury", "weather", "line_move"],
    laneOrder: DEFAULT_LANE_ORDER,
    laneLabels: LEGACY_LANE_LABELS,
    emptyState: "Monitoring injury reports, weather, source agreement, external movement, roles, and matchup context.",
  },
  CFB: {
    league: "CFB",
    boardLabel: "CFB Developing Stories Board",
    liveStripLabel: "CFB Watch Slate",
    featuredLabel: "Top Developing Story",
    primarySignalTypes: ["line_move", "sharp", "injury", "coaching", "scheme", "transfer", "portal"],
    livePrioritySignalTypes: ["line_move", "injury", "weather", "coaching"],
    laneOrder: DEFAULT_LANE_ORDER,
    laneLabels: LEGACY_LANE_LABELS,
    emptyState: "Monitoring injuries, scheme changes, source agreement, market reaction, weather, and conference context.",
  },
};

export function getLeagueBoardProfile(league: Sport): LeagueBoardProfile {
  return LEAGUE_BOARD_PROFILES[league];
}
