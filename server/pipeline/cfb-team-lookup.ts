/**
 * CFB team display-name → abbreviation lookup.
 *
 * Keys are ESPN displayName values lowercased and trimmed.
 * Covers all 130 CFB programs: P4 (SEC, Big Ten, Big 12, ACC),
 * Independents, AAC, Sun Belt, Conference USA, MAC, Mountain West.
 *
 * Imported by espn-cfb.ts and espn-cfb-transactions.ts.
 * Single source of truth — do not maintain a copy in either adapter.
 */

export const CFB_DISPLAY_TO_ABBR: Record<string, string> = {
  // ── SEC ─────────────────────────────────────────────────────
  "alabama crimson tide": "ALA", "arkansas razorbacks": "ARK", "auburn tigers": "AUB",
  "florida gators": "FLA", "georgia bulldogs": "UGA", "kentucky wildcats": "UK",
  "lsu tigers": "LSU", "ole miss rebels": "MISS", "mississippi rebels": "MISS",
  "mississippi state bulldogs": "MSST", "missouri tigers": "MIZ", "oklahoma sooners": "OU",
  "south carolina gamecocks": "SC", "tennessee volunteers": "TENN", "texas longhorns": "TEX",
  "texas a&m aggies": "TAMU", "vanderbilt commodores": "VAN",

  // ── Big Ten ──────────────────────────────────────────────────
  "illinois fighting illini": "ILL", "indiana hoosiers": "IND", "iowa hawkeyes": "IOWA",
  "maryland terrapins": "MD", "michigan wolverines": "MICH", "michigan state spartans": "MSU",
  "minnesota golden gophers": "MINN", "nebraska cornhuskers": "NEB",
  "northwestern wildcats": "NU", "ohio state buckeyes": "OSU", "ohio state": "OSU",
  "oregon ducks": "ORE", "penn state nittany lions": "PSU", "purdue boilermakers": "PUR",
  "rutgers scarlet knights": "RUT", "ucla bruins": "UCLA", "usc trojans": "USC",
  "washington huskies": "WASH", "wisconsin badgers": "WIS",

  // ── Big 12 ──────────────────────────────────────────────────
  "arizona wildcats": "ARIZ", "arizona state sun devils": "ASU", "baylor bears": "BAY",
  "byu cougars": "BYU", "cincinnati bearcats": "CIN", "colorado buffaloes": "COL",
  "houston cougars": "HOU", "iowa state cyclones": "ISU", "kansas jayhawks": "KU",
  "kansas state wildcats": "KSU", "oklahoma state cowboys": "OKST",
  "tcu horned frogs": "TCU", "texas tech red raiders": "TTU", "ucf knights": "UCF",
  "utah utes": "UTAH", "west virginia mountaineers": "WVU",

  // ── ACC ──────────────────────────────────────────────────────
  "boston college eagles": "BC", "california golden bears": "CAL",
  "clemson tigers": "CLEM", "duke blue devils": "DUKE",
  "florida state seminoles": "FSU", "georgia tech yellow jackets": "GT",
  "louisville cardinals": "LOU", "miami hurricanes": "MIA",
  "north carolina tar heels": "UNC", "nc state wolfpack": "NCST",
  "north carolina state wolfpack": "NCST", "pitt panthers": "PITT",
  "smu mustangs": "SMU", "stanford cardinal": "STAN", "syracuse orange": "SYR",
  "virginia cavaliers": "UVA", "virginia tech hokies": "VT",
  "wake forest demon deacons": "WAKE",

  // ── Independents ─────────────────────────────────────────────
  "notre dame fighting irish": "ND", "uconn huskies": "UCONN",

  // ── AAC ──────────────────────────────────────────────────────
  "army black knights": "ARMY", "charlotte 49ers": "CHAR",
  "ecu pirates": "ECU", "east carolina pirates": "ECU",
  "fau owls": "FAU", "florida atlantic owls": "FAU",
  "memphis tigers": "MEM",
  "navy midshipmen": "NAVY", "rice owls": "RICE", "temple owls": "TEMP",
  "tulane green wave": "TUL", "tulsa golden hurricane": "TULSA",
  "uab blazers": "UAB", "north texas mean green": "UNT",
  "usf bulls": "USF", "south florida bulls": "USF", "utsa roadrunners": "UTSA",

  // ── Sun Belt ─────────────────────────────────────────────────
  "appalachian state mountaineers": "APP", "appalachian state": "APP",
  "arkansas state red wolves": "ARKST", "arkansas state": "ARKST",
  "coastal carolina chanticleers": "CCU", "coastal carolina": "CCU",
  "georgia southern eagles": "GASO", "georgia southern": "GASO",
  "georgia state panthers": "GAST", "georgia state": "GAST",
  "james madison dukes": "JMU", "james madison": "JMU",
  "marshall thundering herd": "MARS", "marshall": "MARS",
  "old dominion monarchs": "ODU", "old dominion": "ODU",
  "south alabama jaguars": "SOAL", "south alabama": "SOAL",
  "troy trojans": "TROY", "troy": "TROY",
  "texas state bobcats": "TXST", "texas state": "TXST",
  "louisiana ragin' cajuns": "ULL", "louisiana": "ULL", "ul lafayette": "ULL",
  "ul monroe warhawks": "ULM", "louisiana monroe warhawks": "ULM",
  "louisiana monroe": "ULM", "ul monroe": "ULM",
  "southern miss golden eagles": "USM", "southern miss": "USM",
  "southern mississippi golden eagles": "USM", "southern mississippi": "USM",

  // ── Conference USA ───────────────────────────────────────────
  "fiu panthers": "FIU", "florida international panthers": "FIU",
  "florida intl panthers": "FIU", "fiu": "FIU",
  "jacksonville state gamecocks": "JSU", "jacksonville state": "JSU",
  "liberty flames": "LIB", "liberty": "LIB",
  "louisiana tech bulldogs": "LT", "louisiana tech": "LT",
  "middle tennessee blue raiders": "MTSU", "middle tennessee": "MTSU",
  "mtsu blue raiders": "MTSU",
  "new mexico state aggies": "NMSU", "new mexico state": "NMSU",
  "sam houston bearkats": "SHSU", "sam houston": "SHSU",
  "sam houston state bearkats": "SHSU", "sam houston state": "SHSU",
  "utep miners": "UTEP", "utep": "UTEP",
  "western kentucky hilltoppers": "WKU", "western kentucky": "WKU",

  // ── MAC ──────────────────────────────────────────────────────
  "akron zips": "AKR", "akron": "AKR",
  "ball state cardinals": "BALL", "ball state": "BALL",
  "bowling green falcons": "BGS", "bowling green": "BGS",
  "buffalo bulls": "BUFF", "buffalo": "BUFF",
  "central michigan chippewas": "CMU", "central michigan": "CMU",
  "eastern michigan eagles": "EMU", "eastern michigan": "EMU",
  "kent state golden flashes": "KENT", "kent state": "KENT",
  "miami (oh) redhawks": "MIOH", "miami ohio redhawks": "MIOH",
  "miami ohio": "MIOH", "miami (oh)": "MIOH",
  "northern illinois huskies": "NIU", "northern illinois": "NIU",
  "ohio bobcats": "OHIO", "ohio": "OHIO",
  "toledo rockets": "TOL", "toledo": "TOL",
  "western michigan broncos": "WMU", "western michigan": "WMU",

  // ── Mountain West ────────────────────────────────────────────
  "air force falcons": "AFA", "air force": "AFA",
  "boise state broncos": "BSU", "boise state": "BSU",
  "colorado state rams": "CSU", "colorado state": "CSU",
  "fresno state bulldogs": "FRES", "fresno state": "FRES",
  "hawaii rainbow warriors": "HAW", "hawaii": "HAW",
  "hawai'i rainbow warriors": "HAW", "hawai'i": "HAW",
  "nevada wolf pack": "NEV", "nevada": "NEV",
  "san diego state aztecs": "SDSU", "san diego state": "SDSU",
  "san jose state spartans": "SJSU", "san jose state": "SJSU",
  "unlv rebels": "UNLV", "unlv": "UNLV",
  "new mexico lobos": "UNM", "new mexico": "UNM",
  "utah state aggies": "USU", "utah state": "USU",
  "wyoming cowboys": "WYO", "wyoming": "WYO",
};
