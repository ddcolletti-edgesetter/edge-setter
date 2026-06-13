/**
 * Edge Setter — Team Color Manifest
 *
 * Primary/secondary brand colors for every team EdgeSetter covers:
 * 32 NFL + 30 NBA + 30 MLB + all 130 CFB programs (P4 + G5, keyed by the
 * team_key values in server/pipeline/bootstrap/cfb-source-seed.json).
 *
 * Used by logo fallbacks: circle background = primary, abbreviation in white.
 * For black-and-gold programs the dark shade is listed as primary so white
 * text stays readable.
 *
 * League maps are separate because abbreviations collide across leagues
 * (MIA, CIN, HOU, ATL...). Use teamColorsFor(abbr, sport) when the league is
 * known; the merged no-sport lookup keeps legacy NBA→MLB→NFL→CFB priority.
 */

export interface TeamColorEntry {
  primary: string;
  secondary: string;
}

export type TeamColorSport = "nba" | "mlb" | "nfl" | "cfb";

export const NFL_TEAM_COLORS: Record<string, TeamColorEntry> = {
  ARI: { primary: "#97233F", secondary: "#FFB612" },
  ATL: { primary: "#A71930", secondary: "#A5ACAF" },
  BAL: { primary: "#241773", secondary: "#9E7C0C" },
  BUF: { primary: "#00338D", secondary: "#C60C30" },
  CAR: { primary: "#0085CA", secondary: "#101820" },
  CHI: { primary: "#0B162A", secondary: "#C83803" },
  CIN: { primary: "#FB4F14", secondary: "#101820" },
  CLE: { primary: "#311D00", secondary: "#FF3C00" },
  DAL: { primary: "#003594", secondary: "#869397" },
  DEN: { primary: "#FB4F14", secondary: "#002244" },
  DET: { primary: "#0076B6", secondary: "#B0B7BC" },
  GB:  { primary: "#203731", secondary: "#FFB612" },
  HOU: { primary: "#03202F", secondary: "#A71930" },
  IND: { primary: "#002C5F", secondary: "#A2AAAD" },
  JAX: { primary: "#006778", secondary: "#D7A22A" },
  KC:  { primary: "#E31837", secondary: "#FFB81C" },
  LAC: { primary: "#0080C6", secondary: "#FFC20E" },
  LAR: { primary: "#003594", secondary: "#FFA300" },
  LV:  { primary: "#101820", secondary: "#A5ACAF" },
  MIA: { primary: "#008E97", secondary: "#FC4C02" },
  MIN: { primary: "#4F2683", secondary: "#FFC62F" },
  NE:  { primary: "#002244", secondary: "#C60C30" },
  NO:  { primary: "#101820", secondary: "#D3BC8D" },
  NYG: { primary: "#0B2265", secondary: "#A71930" },
  NYJ: { primary: "#125740", secondary: "#FFFFFF" },
  PHI: { primary: "#004C54", secondary: "#A5ACAF" },
  PIT: { primary: "#101820", secondary: "#FFB612" },
  SEA: { primary: "#002244", secondary: "#69BE28" },
  SF:  { primary: "#AA0000", secondary: "#B3995D" },
  TB:  { primary: "#D50A0A", secondary: "#34302B" },
  TEN: { primary: "#0C2340", secondary: "#4B92DB" },
  WAS: { primary: "#5A1414", secondary: "#FFB612" },
  WSH: { primary: "#5A1414", secondary: "#FFB612" },
};

export const NBA_TEAM_COLORS: Record<string, TeamColorEntry> = {
  ATL: { primary: "#C8102E", secondary: "#FDB927" },
  BKN: { primary: "#101820", secondary: "#FFFFFF" },
  BOS: { primary: "#007A33", secondary: "#FFFFFF" },
  CHA: { primary: "#1D1160", secondary: "#00788C" },
  CHI: { primary: "#CE1141", secondary: "#101820" },
  CLE: { primary: "#860038", secondary: "#FDBB30" },
  DAL: { primary: "#00538C", secondary: "#B8C4CA" },
  DEN: { primary: "#0E2240", secondary: "#FEC524" },
  DET: { primary: "#C8102E", secondary: "#1D42BA" },
  GSW: { primary: "#1D428A", secondary: "#FFC72C" },
  HOU: { primary: "#CE1141", secondary: "#C4CED4" },
  IND: { primary: "#002D62", secondary: "#FDBB30" },
  LAC: { primary: "#C8102E", secondary: "#1D428A" },
  LAL: { primary: "#552583", secondary: "#FDB927" },
  MEM: { primary: "#5D76A9", secondary: "#12173F" },
  MIA: { primary: "#98002E", secondary: "#F9A01B" },
  MIL: { primary: "#00471B", secondary: "#EEE1C6" },
  MIN: { primary: "#0C2340", secondary: "#236192" },
  NOP: { primary: "#0C2340", secondary: "#C3142D" },
  NYK: { primary: "#006BB6", secondary: "#F58426" },
  OKC: { primary: "#007AC1", secondary: "#EF3B24" },
  ORL: { primary: "#0077C0", secondary: "#C4CED4" },
  PHI: { primary: "#006BB6", secondary: "#ED174C" },
  PHX: { primary: "#1D1160", secondary: "#E56020" },
  POR: { primary: "#E03A3E", secondary: "#101820" },
  SAC: { primary: "#5A2D81", secondary: "#63727A" },
  SAS: { primary: "#101820", secondary: "#C4CED4" },
  TOR: { primary: "#CE1141", secondary: "#101820" },
  UTA: { primary: "#002B5C", secondary: "#F9A01B" },
  WAS: { primary: "#002B5C", secondary: "#E31837" },
};

export const MLB_TEAM_COLORS: Record<string, TeamColorEntry> = {
  ARI: { primary: "#A71930", secondary: "#E3D4AD" },
  ATL: { primary: "#CE1141", secondary: "#13274F" },
  BAL: { primary: "#DF4601", secondary: "#101820" },
  BOS: { primary: "#BD3039", secondary: "#0C2340" },
  CHC: { primary: "#0E3386", secondary: "#CC3433" },
  CWS: { primary: "#27251F", secondary: "#C4CED4" },
  CHW: { primary: "#27251F", secondary: "#C4CED4" },
  CIN: { primary: "#C6011F", secondary: "#101820" },
  CLE: { primary: "#00385D", secondary: "#E50022" },
  COL: { primary: "#333366", secondary: "#C4CED4" },
  DET: { primary: "#0C2340", secondary: "#FA4616" },
  HOU: { primary: "#002D62", secondary: "#EB6E1F" },
  KCR: { primary: "#004687", secondary: "#BD9B60" },
  KC:  { primary: "#004687", secondary: "#BD9B60" },
  LAA: { primary: "#BA0021", secondary: "#003263" },
  LAD: { primary: "#005A9C", secondary: "#EF3E42" },
  MIA: { primary: "#00A3E0", secondary: "#EF3340" },
  MIL: { primary: "#12284B", secondary: "#FFC52F" },
  MIN: { primary: "#002B5C", secondary: "#D31145" },
  NYM: { primary: "#002D72", secondary: "#FF5910" },
  NYY: { primary: "#132448", secondary: "#C4CED4" },
  OAK: { primary: "#003831", secondary: "#EFB21E" },
  PHI: { primary: "#E81828", secondary: "#002D72" },
  PIT: { primary: "#27251F", secondary: "#FDB827" },
  SDP: { primary: "#2F241D", secondary: "#FFC425" },
  SD:  { primary: "#2F241D", secondary: "#FFC425" },
  SFG: { primary: "#FD5A1E", secondary: "#27251F" },
  SEA: { primary: "#0C2C56", secondary: "#005C5C" },
  STL: { primary: "#C41E3A", secondary: "#0C2340" },
  TBR: { primary: "#092C5C", secondary: "#8FBCE6" },
  TB:  { primary: "#092C5C", secondary: "#8FBCE6" },
  TEX: { primary: "#003278", secondary: "#C0111F" },
  TOR: { primary: "#134A8E", secondary: "#1D2D5C" },
  WSN: { primary: "#AB0003", secondary: "#14225A" },
  WSH: { primary: "#AB0003", secondary: "#14225A" },
};

// Keys match team_key in cfb-source-seed.json (130 programs, P4 + G5).
export const CFB_TEAM_COLORS: Record<string, TeamColorEntry> = {
  // ── SEC ──
  ALA:  { primary: "#9E1B32", secondary: "#828A8F" },
  ARK:  { primary: "#9D2235", secondary: "#FFFFFF" },
  AUB:  { primary: "#03244D", secondary: "#DD550C" },
  FLA:  { primary: "#0021A5", secondary: "#FA4616" },
  UGA:  { primary: "#BA0C2F", secondary: "#101820" },
  UK:   { primary: "#0033A0", secondary: "#FFFFFF" },
  LSU:  { primary: "#461D7C", secondary: "#FDD023" },
  MISS: { primary: "#CE1126", secondary: "#14213D" },
  MSST: { primary: "#5D1725", secondary: "#FFFFFF" },
  MIZ:  { primary: "#101820", secondary: "#F1B82D" },
  OU:   { primary: "#841617", secondary: "#FDF9D8" },
  SC:   { primary: "#73000A", secondary: "#101820" },
  TENN: { primary: "#FF8200", secondary: "#FFFFFF" },
  TEX:  { primary: "#BF5700", secondary: "#FFFFFF" },
  TAMU: { primary: "#500000", secondary: "#FFFFFF" },
  VAN:  { primary: "#101820", secondary: "#866D4B" },
  // ── Big Ten ──
  ILL:  { primary: "#13294B", secondary: "#E84A27" },
  IND:  { primary: "#990000", secondary: "#EEEDEB" },
  IOWA: { primary: "#101820", secondary: "#FFCD00" },
  MD:   { primary: "#E03A3E", secondary: "#FFD520" },
  MICH: { primary: "#00274C", secondary: "#FFCB05" },
  MSU:  { primary: "#18453B", secondary: "#FFFFFF" },
  MINN: { primary: "#7A0019", secondary: "#FFCC33" },
  NEB:  { primary: "#E41C38", secondary: "#FFFFFF" },
  NU:   { primary: "#4E2A84", secondary: "#FFFFFF" },
  OSU:  { primary: "#BB0000", secondary: "#666666" },
  ORE:  { primary: "#154733", secondary: "#FEE123" },
  PSU:  { primary: "#041E42", secondary: "#FFFFFF" },
  PUR:  { primary: "#101820", secondary: "#CFB991" },
  RUT:  { primary: "#CC0033", secondary: "#5F6A72" },
  UCLA: { primary: "#2D68C4", secondary: "#F2A900" },
  USC:  { primary: "#990000", secondary: "#FFC72C" },
  WASH: { primary: "#4B2E83", secondary: "#B7A57A" },
  WIS:  { primary: "#C5050C", secondary: "#FFFFFF" },
  // ── Big 12 ──
  ARIZ: { primary: "#CC0033", secondary: "#003366" },
  ASU:  { primary: "#8C1D40", secondary: "#FFC627" },
  BAY:  { primary: "#154734", secondary: "#FFB81C" },
  BYU:  { primary: "#002E5D", secondary: "#FFFFFF" },
  CIN:  { primary: "#E00122", secondary: "#101820" },
  COL:  { primary: "#101820", secondary: "#CFB87C" },
  HOU:  { primary: "#C8102E", secondary: "#FFFFFF" },
  ISU:  { primary: "#C8102E", secondary: "#F1BE48" },
  KU:   { primary: "#0051BA", secondary: "#E8000D" },
  KSU:  { primary: "#512888", secondary: "#FFFFFF" },
  OKST: { primary: "#FF7300", secondary: "#101820" },
  TCU:  { primary: "#4D1979", secondary: "#A3A9AC" },
  TTU:  { primary: "#CC0000", secondary: "#101820" },
  UCF:  { primary: "#101820", secondary: "#BA9B37" },
  UTAH: { primary: "#CC0000", secondary: "#FFFFFF" },
  WVU:  { primary: "#002855", secondary: "#EAAA00" },
  // ── ACC ──
  BC:   { primary: "#862633", secondary: "#BC9B6A" },
  CAL:  { primary: "#003262", secondary: "#FDB515" },
  CLEM: { primary: "#F56600", secondary: "#522D80" },
  DUKE: { primary: "#003087", secondary: "#FFFFFF" },
  FSU:  { primary: "#782F40", secondary: "#CEB888" },
  GT:   { primary: "#003057", secondary: "#B3A369" },
  LOU:  { primary: "#AD0000", secondary: "#101820" },
  MIA:  { primary: "#005030", secondary: "#F47321" },
  UNC:  { primary: "#7BAFD4", secondary: "#13294B" },
  NCST: { primary: "#CC0000", secondary: "#101820" },
  PITT: { primary: "#003594", secondary: "#FFB81C" },
  SMU:  { primary: "#0033A0", secondary: "#C8102E" },
  STAN: { primary: "#8C1515", secondary: "#FFFFFF" },
  SYR:  { primary: "#D44500", secondary: "#000E54" },
  UVA:  { primary: "#232D4B", secondary: "#F84C1E" },
  VT:   { primary: "#630031", secondary: "#CF4420" },
  WAKE: { primary: "#101820", secondary: "#9E7E38" },
  // ── Independents ──
  ND:     { primary: "#0C2340", secondary: "#C99700" },
  UCONN:  { primary: "#000E2F", secondary: "#FFFFFF" },
  // ── AAC ──
  ARMY:  { primary: "#2C2A29", secondary: "#D4BF91" },
  CHAR:  { primary: "#046A38", secondary: "#B9975B" },
  ECU:   { primary: "#592A8A", secondary: "#FDC82F" },
  FAU:   { primary: "#003366", secondary: "#CC0000" },
  MEM:   { primary: "#003087", secondary: "#898D8D" },
  NAVY:  { primary: "#00205B", secondary: "#C5B783" },
  RICE:  { primary: "#00205B", secondary: "#C1C6C8" },
  TEMP:  { primary: "#9D2235", secondary: "#FFFFFF" },
  TUL:   { primary: "#006747", secondary: "#418FDE" },
  TULSA: { primary: "#002D72", secondary: "#C5B783" },
  UAB:   { primary: "#1E6B52", secondary: "#F4C300" },
  UNT:   { primary: "#00853E", secondary: "#101820" },
  USF:   { primary: "#006747", secondary: "#CFC493" },
  UTSA:  { primary: "#0C2340", secondary: "#F15A22" },
  // ── Conference USA ──
  FIU:  { primary: "#081E3F", secondary: "#B6862C" },
  JSU:  { primary: "#CC0000", secondary: "#FFFFFF" },
  LIB:  { primary: "#0A254E", secondary: "#990000" },
  LT:   { primary: "#002F8B", secondary: "#E31B23" },
  MTSU: { primary: "#0066CC", secondary: "#101820" },
  NMSU: { primary: "#891216", secondary: "#FFFFFF" },
  SHSU: { primary: "#F56423", secondary: "#FFFFFF" },
  UTEP: { primary: "#041E42", secondary: "#FF8200" },
  WKU:  { primary: "#B01E24", secondary: "#FFFFFF" },
  // ── MAC ──
  AKR:  { primary: "#041E42", secondary: "#A89968" },
  BALL: { primary: "#BA0C2F", secondary: "#FFFFFF" },
  BGS:  { primary: "#FE5000", secondary: "#4F2C1D" },
  BUFF: { primary: "#005BBB", secondary: "#FFFFFF" },
  CMU:  { primary: "#6A0032", secondary: "#FFC82E" },
  EMU:  { primary: "#046A38", secondary: "#FFFFFF" },
  KENT: { primary: "#002664", secondary: "#EAAB00" },
  MIOH: { primary: "#B61E2E", secondary: "#101820" },
  NIU:  { primary: "#BA0C2F", secondary: "#101820" },
  OHIO: { primary: "#00694E", secondary: "#CDA077" },
  TOL:  { primary: "#15397F", secondary: "#FFD200" },
  WMU:  { primary: "#532E1F", secondary: "#B5A167" },
  // ── Mountain West ──
  AFA:  { primary: "#003594", secondary: "#8A8D8F" },
  BSU:  { primary: "#0033A0", secondary: "#D64309" },
  CSU:  { primary: "#1E4D2B", secondary: "#C8C372" },
  FRES: { primary: "#DB0032", secondary: "#002E6D" },
  HAW:  { primary: "#024731", secondary: "#C8C8C8" },
  NEV:  { primary: "#003366", secondary: "#807F84" },
  SDSU: { primary: "#A6192E", secondary: "#101820" },
  SJSU: { primary: "#0055A2", secondary: "#E5A823" },
  UNLV: { primary: "#CF0A2C", secondary: "#666666" },
  UNM:  { primary: "#BA0C2F", secondary: "#63666A" },
  USU:  { primary: "#0F2439", secondary: "#8A8D8F" },
  WYO:  { primary: "#492F24", secondary: "#FFC425" },
  // ── Sun Belt ──
  APP:   { primary: "#101820", secondary: "#FFCC00" },
  ARKST: { primary: "#CC092F", secondary: "#101820" },
  CCU:   { primary: "#006F71", secondary: "#A27752" },
  GASO:  { primary: "#011E41", secondary: "#87714D" },
  GAST:  { primary: "#0039A6", secondary: "#C60C30" },
  JMU:   { primary: "#450084", secondary: "#CBB677" },
  MARS:  { primary: "#00B140", secondary: "#101820" },
  ODU:   { primary: "#003057", secondary: "#7C878E" },
  SOAL:  { primary: "#00205B", secondary: "#BF0D3E" },
  TROY:  { primary: "#8A2432", secondary: "#C2C4C6" },
  TXST:  { primary: "#501214", secondary: "#8D734A" },
  ULL:   { primary: "#CE181E", secondary: "#FFFFFF" },
  ULM:   { primary: "#840029", secondary: "#FDB913" },
  USM:   { primary: "#101820", secondary: "#FFAB00" },
};

// Alternate abbreviations seen in ESPN feeds and source payloads.
const CFB_ALIASES: Record<string, string> = {
  GS: "GASO",      // Georgia Southern
  ARST: "ARKST",   // Arkansas State
  CCAR: "CCU",     // Coastal Carolina
  MRSH: "MARS",    // Marshall
  CONN: "UCONN",
  USA: "SOAL",     // South Alabama
  UL: "ULL",       // Louisiana
  JVST: "JSU",     // Jacksonville State
  "M-OH": "MIOH",  // Miami (OH)
  APST: "APP",     // Appalachian State
  GST: "GAST",     // Georgia State
};
for (const [alias, key] of Object.entries(CFB_ALIASES)) {
  if (CFB_TEAM_COLORS[key]) CFB_TEAM_COLORS[alias] = CFB_TEAM_COLORS[key];
}

const NFL_ALIASES: Record<string, string> = { JAC: "JAX", LA: "LAR", ARZ: "ARI", OAK: "LV" };
for (const [alias, key] of Object.entries(NFL_ALIASES)) {
  if (NFL_TEAM_COLORS[key]) NFL_TEAM_COLORS[alias] = NFL_TEAM_COLORS[key];
}

const SPORT_MAPS: Record<TeamColorSport, Record<string, TeamColorEntry>> = {
  nba: NBA_TEAM_COLORS,
  mlb: MLB_TEAM_COLORS,
  nfl: NFL_TEAM_COLORS,
  cfb: CFB_TEAM_COLORS,
};

/**
 * Sport-aware color lookup. With a sport, only that league's map is consulted
 * (then the others as a fallback for cross-league abbreviations). Without a
 * sport, the merged lookup preserves the legacy NBA→MLB→NFL→CFB priority.
 */
export function teamColorsFor(abbr?: string | null, sport?: TeamColorSport): TeamColorEntry | null {
  const key = String(abbr ?? "").trim().toUpperCase();
  if (!key) return null;
  if (sport) {
    const exact = SPORT_MAPS[sport][key];
    if (exact) return exact;
  }
  return NBA_TEAM_COLORS[key] ?? MLB_TEAM_COLORS[key] ?? NFL_TEAM_COLORS[key] ?? CFB_TEAM_COLORS[key] ?? null;
}

// Dark, brand-like palette for teams not in any manifest — keeps fallback
// circles colored and deterministic per abbreviation. Never gray.
const UNKNOWN_TEAM_PALETTE: TeamColorEntry[] = [
  { primary: "#1D428A", secondary: "#C4CED4" },
  { primary: "#7A0019", secondary: "#E3D4AD" },
  { primary: "#154734", secondary: "#FFB81C" },
  { primary: "#4F2683", secondary: "#C4CED4" },
  { primary: "#0C2340", secondary: "#94A3B8" },
  { primary: "#841617", secondary: "#FDF9D8" },
  { primary: "#003057", secondary: "#B3A369" },
  { primary: "#5D1725", secondary: "#C8C8C8" },
];

export function deterministicTeamColors(abbr?: string | null): TeamColorEntry {
  const key = String(abbr ?? "").trim().toUpperCase();
  if (!key) return UNKNOWN_TEAM_PALETTE[4];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return UNKNOWN_TEAM_PALETTE[Math.abs(hash) % UNKNOWN_TEAM_PALETTE.length];
}
