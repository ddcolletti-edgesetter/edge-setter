/* ────────────────────────────────────────────────────────────
   Edge Setter — Source Registry
   Powers source confirmation strength, coverage display, and
   future reliability tracking. Not surfaced publicly as scores —
   used internally for signal weighting and UI source labels.
   ──────────────────────────────────────────────────────────── */

export type SourceType =
  | "beat_reporter"      // credentialed team beat writer
  | "wire_service"       // AP, Reuters, official wires
  | "official"           // league/team official injury reports, press releases
  | "sharp_money"        // sharp action / books tracking tools
  | "rotational"         // depth chart / rotation tracking specialists
  | "sportsbook"         // book-level line data
  | "analytics"          // advanced stats / model-based
  | "social"             // credible social (verified insiders, credentialed reporters)
  | "fantasy_platform"   // fantasy-specific sourcing (Rotowire, RotoGrinders, etc.)
  | "weather_service"    // weather providers
  | "transaction"        // official transaction wire (waiver claims, IL moves)
  | "broadcast"          // broadcast / TV reporter with access;

export type ReliabilityTier =
  | "A"   // high accuracy, direct access, official or verified beat
  | "B"   // strong track record, secondary access, syndicated wires
  | "C"   // useful signal value but lower verified hit rate; social/rotational
  | "stub"; // not yet rated — future integration

export interface SourceDefinition {
  id: string;
  name: string;
  shortName: string;
  type: SourceType;
  sports: ("NBA" | "MLB" | "NFL" | "CFB")[];
  reliabilityTier: ReliabilityTier;
  url?: string;
  notes?: string;
}

/* ── Source Registry ─────────────────────────────────────── */

export const SOURCES: SourceDefinition[] = [
  // ── OFFICIAL / WIRE ──────────────────────────────────────
  {
    id: "nba-official",
    name: "NBA Official Injury Report",
    shortName: "NBA Official",
    type: "official",
    sports: ["NBA"],
    reliabilityTier: "A",
    url: "https://www.nba.com/injuries",
    notes: "Mandatory league injury reports. Filed at designated windows before tip-off.",
  },
  {
    id: "mlb-official",
    name: "MLB Transaction Wire",
    shortName: "MLB Wire",
    type: "transaction",
    sports: ["MLB"],
    reliabilityTier: "A",
    url: "https://www.mlb.com/transactions",
    notes: "Official transaction and IL placement wire.",
  },
  {
    id: "nfl-official",
    name: "NFL Official Injury Report",
    shortName: "NFL Official",
    type: "official",
    sports: ["NFL"],
    reliabilityTier: "A",
    notes: "Wed/Thu/Fri reports with DNP, LP, FP designations.",
  },

  // ── BEAT REPORTERS ───────────────────────────────────────
  {
    id: "athletic-nba",
    name: "The Athletic — NBA",
    shortName: "The Athletic",
    type: "beat_reporter",
    sports: ["NBA"],
    reliabilityTier: "A",
    url: "https://theathletic.com/nba",
    notes: "Full-time team beat reporters. First-access injury and rotation info.",
  },
  {
    id: "athletic-mlb",
    name: "The Athletic — MLB",
    shortName: "The Athletic",
    type: "beat_reporter",
    sports: ["MLB"],
    reliabilityTier: "A",
    url: "https://theathletic.com/mlb",
  },
  {
    id: "athletic-nfl",
    name: "The Athletic — NFL",
    shortName: "The Athletic",
    type: "beat_reporter",
    sports: ["NFL"],
    reliabilityTier: "A",
    url: "https://theathletic.com/nfl",
  },
  {
    id: "athletic-cfb",
    name: "The Athletic — College Football",
    shortName: "The Athletic",
    type: "beat_reporter",
    sports: ["CFB"],
    reliabilityTier: "A",
    url: "https://theathletic.com/college-football",
  },
  {
    id: "espn-nba",
    name: "ESPN Insiders",
    shortName: "ESPN",
    type: "beat_reporter",
    sports: ["NBA", "MLB", "NFL", "CFB"],
    reliabilityTier: "B",
    notes: "Wide coverage; Woj (NBA), Schefter (NFL) are A-tier individually.",
  },
  {
    id: "wojnarowski",
    name: "Adrian Wojnarowski (ESPN)",
    shortName: "Woj",
    type: "beat_reporter",
    sports: ["NBA"],
    reliabilityTier: "A",
    notes: "Primary NBA breaking news source. Confirmed trades/signings ahead of all others.",
  },
  {
    id: "shams",
    name: "Shams Charania (The Athletic)",
    shortName: "Shams",
    type: "beat_reporter",
    sports: ["NBA"],
    reliabilityTier: "A",
    notes: "Co-primary NBA breaking news source alongside Woj.",
  },
  {
    id: "schefter",
    name: "Adam Schefter (ESPN)",
    shortName: "Schefter",
    type: "beat_reporter",
    sports: ["NFL"],
    reliabilityTier: "A",
    notes: "Primary NFL transactions/injury source.",
  },
  {
    id: "rapoport",
    name: "Ian Rapoport (NFL Network)",
    shortName: "Rapoport",
    type: "beat_reporter",
    sports: ["NFL"],
    reliabilityTier: "A",
  },

  // ── FANTASY / INJURY SPECIALISTS ─────────────────────────
  {
    id: "rotowire",
    name: "Rotowire",
    shortName: "Rotowire",
    type: "fantasy_platform",
    sports: ["NBA", "MLB", "NFL"],
    reliabilityTier: "B",
    url: "https://www.rotowire.com",
    notes: "Fast injury/lineup updates. Strong MLB lineup confirmation.",
  },
  {
    id: "rotogrinders",
    name: "RotoGrinders",
    shortName: "RotoGrinders",
    type: "fantasy_platform",
    sports: ["NBA", "MLB", "NFL"],
    reliabilityTier: "B",
    url: "https://rotogrinders.com",
  },
  {
    id: "fantasylabs",
    name: "FantasyLabs",
    shortName: "FantasyLabs",
    type: "analytics",
    sports: ["NBA", "MLB", "NFL"],
    reliabilityTier: "B",
  },

  // ── SHARP MONEY / BOOKS ──────────────────────────────────
  {
    id: "action-network",
    name: "Action Network",
    shortName: "Action Network",
    type: "sharp_money",
    sports: ["NBA", "MLB", "NFL", "CFB"],
    reliabilityTier: "B",
    url: "https://www.actionnetwork.com",
    notes: "Professional activity tracking, context movement, and steam alerts.",
  },
  {
    id: "pregame",
    name: "Pregame.com",
    shortName: "Pregame",
    type: "sharp_money",
    sports: ["NBA", "MLB", "NFL", "CFB"],
    reliabilityTier: "B",
  },
  {
    id: "pinnacle",
    name: "Pinnacle",
    shortName: "Pinnacle",
    type: "sportsbook",
    sports: ["NBA", "MLB", "NFL", "CFB"],
    reliabilityTier: "A",
    notes: "Sharp-side book. Market movement here carries the most signal weight.",
  },
  {
    id: "circa",
    name: "Circa Sports",
    shortName: "Circa",
    type: "sportsbook",
    sports: ["NBA", "MLB", "NFL", "CFB"],
    reliabilityTier: "A",
    notes: "High-limit sharp book. Early lines carry significant market signal.",
  },
  {
    id: "dk",
    name: "DraftKings",
    shortName: "DraftKings",
    type: "sportsbook",
    sports: ["NBA", "MLB", "NFL", "CFB"],
    reliabilityTier: "B",
    notes: "Public-weighted but volume matters; consensus line reference.",
  },

  // ── ROTATION / DEPTH ─────────────────────────────────────
  {
    id: "espn-depth",
    name: "ESPN Depth Charts",
    shortName: "ESPN Depth",
    type: "rotational",
    sports: ["NBA", "NFL", "CFB"],
    reliabilityTier: "B",
  },
  {
    id: "lineups-mlb",
    name: "Baseball Lineup Aggregators",
    shortName: "Lineup Agg.",
    type: "rotational",
    sports: ["MLB"],
    reliabilityTier: "B",
    notes: "Multiple MLB lineup trackers cross-referenced for confirmation.",
  },
  {
    id: "cfb-insiders",
    name: "247Sports / Rivals",
    shortName: "247Sports",
    type: "beat_reporter",
    sports: ["CFB"],
    reliabilityTier: "B",
    url: "https://247sports.com",
    notes: "Transfer portal, recruiting, depth chart tracking for CFB.",
  },
  {
    id: "on3",
    name: "On3 Sports",
    shortName: "On3",
    type: "beat_reporter",
    sports: ["CFB"],
    reliabilityTier: "B",
    url: "https://www.on3.com",
  },

  // ── ANALYTICS ────────────────────────────────────────────
  {
    id: "bref-nba",
    name: "Basketball Reference",
    shortName: "BBRef",
    type: "analytics",
    sports: ["NBA"],
    reliabilityTier: "A",
    url: "https://www.basketball-reference.com",
    notes: "Authoritative NBA historical and current stats.",
  },
  {
    id: "statcast",
    name: "MLB Statcast",
    shortName: "Statcast",
    type: "analytics",
    sports: ["MLB"],
    reliabilityTier: "A",
    url: "https://baseballsavant.mlb.com",
    notes: "Exit velocity, launch angle, barrel rate, sprint speed — tracking data.",
  },
  {
    id: "pff",
    name: "Pro Football Focus",
    shortName: "PFF",
    type: "analytics",
    sports: ["NFL", "CFB"],
    reliabilityTier: "B",
    url: "https://www.pff.com",
    notes: "Grading and matchup analytics. Strong for O-line / pass rush edges.",
  },

  // ── WEATHER ──────────────────────────────────────────────
  {
    id: "weather-gov",
    name: "National Weather Service",
    shortName: "NWS",
    type: "weather_service",
    sports: ["NFL", "CFB", "MLB"],
    reliabilityTier: "A",
  },
];

/* ── Lookup helpers ──────────────────────────────────────── */

export function getSourcesByType(type: SourceType): SourceDefinition[] {
  return SOURCES.filter(s => s.type === type);
}

export function getSourcesBySport(sport: "NBA" | "MLB" | "NFL" | "CFB"): SourceDefinition[] {
  return SOURCES.filter(s => s.sports.includes(sport));
}

export function getSourceById(id: string): SourceDefinition | undefined {
  return SOURCES.find(s => s.id === id);
}

export function getATierSources(sport?: "NBA" | "MLB" | "NFL" | "CFB"): SourceDefinition[] {
  return SOURCES.filter(s =>
    s.reliabilityTier === "A" && (!sport || s.sports.includes(sport))
  );
}

