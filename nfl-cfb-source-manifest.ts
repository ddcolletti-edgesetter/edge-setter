/**
 * Edge Setter — NFL + CFB Source Intelligence Manifest  (Sprint 1)
 *
 * Every source has:
 *   handle       — X/Twitter handle (no @)
 *   name         — Full name
 *   outlet       — Publication/network
 *   tier         — tier1 (national insider) | tier2 (senior beat) | tier3 (local/specialist)
 *   league       — NFL | CFB | BOTH
 *   teams        — team abbreviations this source primarily covers
 *   domain       — signal types they reliably break first
 *   confidenceFloor — minimum confidence when this source posts a signal
 *   notes        — why they matter
 */

export interface XSourceAccount {
  handle: string;
  name: string;
  outlet: string;
  tier: "tier1" | "tier2" | "tier3";
  league: "NFL" | "CFB" | "BOTH";
  teams?: string[];
  domain: string[];
  confidenceFloor: number;
  notes: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// NFL — NATIONAL INSIDERS (Tier 1)
// These break league-wide news before anyone. High confidence on everything.
// ─────────────────────────────────────────────────────────────────────────────

export const NFL_NATIONALS: XSourceAccount[] = [
  { handle: "AdamSchefter",   name: "Adam Schefter",   outlet: "ESPN",          tier: "tier1", league: "NFL", domain: ["trade","contract","injury","transaction","roster"],        confidenceFloor: 92, notes: "The standard. Anything posted is confirmed signal." },
  { handle: "RapSheet",       name: "Ian Rapoport",    outlet: "NFL Network",   tier: "tier1", league: "NFL", domain: ["trade","contract","injury","transaction","roster"],        confidenceFloor: 92, notes: "Co-equal with Schefter. Moving to ESPN." },
  { handle: "TomPelissero",   name: "Tom Pelissero",   outlet: "NFL Network",   tier: "tier1", league: "NFL", domain: ["contract","trade","roster","injury"],                      confidenceFloor: 90, notes: "Often co-breaks with Rapoport. Strong on contracts." },
  { handle: "JayGlazer",      name: "Jay Glazer",      outlet: "Fox Sports",    tier: "tier1", league: "NFL", domain: ["injury","coaching","trade"],                               confidenceFloor: 90, notes: "Best injury insider — coaches call him directly. First on game-time decisions." },
  { handle: "MikeGarafolo",   name: "Mike Garafolo",   outlet: "NFL Network",   tier: "tier1", league: "NFL", domain: ["contract","trade","roster","transaction"],                 confidenceFloor: 88, notes: "Consistent co-breaker on signings and transactions." },
  { handle: "JFowlerESPN",    name: "Jeremy Fowler",   outlet: "ESPN",          tier: "tier1", league: "NFL", domain: ["contract","trade","roster","injury"],                      confidenceFloor: 88, notes: "Strong on extensions, signings, depth chart." },
  { handle: "AlbertBreer",    name: "Albert Breer",    outlet: "Sports Illustrated / MMQB", tier: "tier1", league: "NFL", domain: ["trade","contract","coaching","draft"],        confidenceFloor: 86, notes: "MMQB. Deep league sources. Strong on coaching and front office." },
  { handle: "MikeFlorio",     name: "Mike Florio",     outlet: "Pro Football Talk / NBC", tier: "tier1", league: "NFL", domain: ["transaction","contract","injury","trade"],       confidenceFloor: 84, notes: "PFT. High volume. Aggregates and breaks. Good early signal." },
  { handle: "CharlesRobinson", name: "Charles Robinson", outlet: "Yahoo Sports", tier: "tier1", league: "NFL", domain: ["trade","contract","transaction","coaching"],              confidenceFloor: 86, notes: "Yahoo Sports. Consistently breaks major stories." },
  { handle: "diannaESPN",     name: "Dianna Russini",  outlet: "The Athletic",  tier: "tier1", league: "NFL", domain: ["trade","contract","coaching","transaction"],               confidenceFloor: 86, notes: "The Athletic. Strong league-wide sourcing on coaching and transactions." },
  { handle: "FieldYates",     name: "Field Yates",     outlet: "ESPN",          tier: "tier2", league: "NFL", domain: ["injury","roster","fantasy","depth_chart"],                 confidenceFloor: 82, notes: "Fast aggregator of injury designations. High fantasy signal." },
  { handle: "ToddMcShay",     name: "Todd McShay",     outlet: "ESPN",          tier: "tier2", league: "NFL", domain: ["draft","prospect","transaction"],                          confidenceFloor: 82, notes: "NFL Draft. Player evaluations and pre-draft transactions." },
];

// ─────────────────────────────────────────────────────────────────────────────
// NFL — TEAM BEAT WRITERS (Tier 2) — All 32 Teams
// One primary + backup per team. Local beats see practice daily.
// ─────────────────────────────────────────────────────────────────────────────

export const NFL_BEATS: XSourceAccount[] = [

  // ── AFC East ────────────────────────────────────────────────────────────────
  { handle: "JoeBuscaglia",   name: "Joe Buscaglia",   outlet: "The Athletic",  tier: "tier2", league: "NFL", teams: ["BUF"], domain: ["injury","roster","depth_chart"],  confidenceFloor: 80, notes: "Bills primary. Leaves no stone unturned." },
  { handle: "JaySkurski",     name: "Jay Skurski",     outlet: "Buffalo News",  tier: "tier2", league: "NFL", teams: ["BUF"], domain: ["injury","roster"],               confidenceFloor: 76, notes: "Bills backup. Good gameday in-stadium." },

  { handle: "DavidFurones_",  name: "David Furones",   outlet: "Sun Sentinel",  tier: "tier2", league: "NFL", teams: ["MIA"], domain: ["injury","roster","depth_chart"],  confidenceFloor: 78, notes: "Dolphins primary. Strong on McDaniel decisions." },
  { handle: "schadjoe",       name: "Joe Schad",       outlet: "Palm Beach Post", tier: "tier2", league: "NFL", teams: ["MIA"], domain: ["injury","roster"],             confidenceFloor: 76, notes: "Dolphins backup. Quote and stat focused." },

  { handle: "MikeReiss",      name: "Mike Reiss",      outlet: "ESPN",          tier: "tier2", league: "NFL", teams: ["NE"],  domain: ["injury","roster","depth_chart"],  confidenceFloor: 82, notes: "Patriots primary. Go-to for New England depth coverage." },
  { handle: "PhilAPerry",     name: "Phil Perry",      outlet: "NBC Sports Boston", tier: "tier2", league: "NFL", teams: ["NE"], domain: ["injury","roster"],            confidenceFloor: 78, notes: "Patriots backup. Postgame reactions and roster analysis." },

  { handle: "Connor_J_Hughes", name: "Connor Hughes",  outlet: "The Athletic",  tier: "tier2", league: "NFL", teams: ["NYJ"], domain: ["injury","roster","transaction"], confidenceFloor: 78, notes: "Jets primary. Full roster and transaction coverage." },
  { handle: "RichCimini",     name: "Rich Cimini",     outlet: "ESPN",          tier: "tier2", league: "NFL", teams: ["NYJ"], domain: ["injury","roster"],               confidenceFloor: 78, notes: "Jets backup. ESPN beat veteran." },

  // ── AFC North ───────────────────────────────────────────────────────────────
  { handle: "jeffzrebiec",    name: "Jeff Zrebiec",    outlet: "The Athletic",  tier: "tier2", league: "NFL", teams: ["BAL"], domain: ["injury","roster","depth_chart"],  confidenceFloor: 84, notes: "Ravens primary. Best Ravens coverage. Observations column is gold." },
  { handle: "jamisonhensley", name: "Jamison Hensley", outlet: "ESPN",          tier: "tier2", league: "NFL", teams: ["BAL"], domain: ["injury","roster"],               confidenceFloor: 80, notes: "Ravens backup. Stat-focused, clean signal." },
  { handle: "jonas_shaffer",  name: "Jonas Shaffer",   outlet: "Baltimore Banner", tier: "tier2", league: "NFL", teams: ["BAL"], domain: ["injury","roster"],            confidenceFloor: 78, notes: "Ravens in-stadium gameday source." },

  { handle: "Ben_Baby",       name: "Ben Baby",        outlet: "ESPN",          tier: "tier2", league: "NFL", teams: ["CIN"], domain: ["injury","roster","depth_chart"],  confidenceFloor: 80, notes: "Bengals primary. Clean, punctual reporting." },
  { handle: "pauldehnerjr",   name: "Paul Dehner Jr.", outlet: "The Athletic",  tier: "tier2", league: "NFL", teams: ["CIN"], domain: ["injury","roster","transaction"], confidenceFloor: 80, notes: "Bengals backup. Deep team access via podcast." },

  { handle: "MaryKayCabot",   name: "Mary Kay Cabot",  outlet: "Cleveland.com", tier: "tier2", league: "NFL", teams: ["CLE"], domain: ["injury","roster","transaction"], confidenceFloor: 82, notes: "Browns primary. First to many Browns headlines." },
  { handle: "AkronJackson",   name: "Zac Jackson",     outlet: "The Athletic",  tier: "tier2", league: "NFL", teams: ["CLE"], domain: ["injury","roster"],               confidenceFloor: 80, notes: "Browns backup. Good progress reports on availability." },

  { handle: "Steelersdepot",  name: "Alex Kozora",     outlet: "Steelers Depot", tier: "tier2", league: "NFL", teams: ["PIT"], domain: ["injury","roster","depth_chart"], confidenceFloor: 78, notes: "Steelers primary. Deep film and roster tracking." },
  { handle: "Gerry_Dulac",    name: "Gerry Dulac",     outlet: "Pittsburgh Post-Gazette", tier: "tier2", league: "NFL", teams: ["PIT"], domain: ["injury","roster"], confidenceFloor: 78, notes: "Steelers backup. Veteran beat reporter." },

  // ── AFC South ───────────────────────────────────────────────────────────────
  { handle: "jonmalexander",  name: "Jonathan Alexander", outlet: "Houston Chronicle", tier: "tier2", league: "NFL", teams: ["HOU"], domain: ["injury","roster"],        confidenceFloor: 78, notes: "Texans primary." },
  { handle: "Sarah_Barshop",  name: "Sarah Barshop",   outlet: "ESPN",          tier: "tier2", league: "NFL", teams: ["HOU"], domain: ["injury","roster","depth_chart"],  confidenceFloor: 78, notes: "Texans backup. ESPN Texans beat." },

  { handle: "HolderStephen",  name: "Stephen Holder",  outlet: "ESPN",          tier: "tier2", league: "NFL", teams: ["IND"], domain: ["injury","roster","depth_chart"],  confidenceFloor: 80, notes: "Colts primary. Covers opposition matchups too." },
  { handle: "mchappell51",    name: "Mike Chappell",   outlet: "FOX59",         tier: "tier2", league: "NFL", teams: ["IND"], domain: ["injury","roster"],               confidenceFloor: 78, notes: "Colts backup. GM-to-player-level quotes." },

  { handle: "HaysCarlyon",    name: "Hays Carlyon",    outlet: "1010 XL",       tier: "tier2", league: "NFL", teams: ["JAX"], domain: ["injury","roster"],               confidenceFloor: 76, notes: "Jaguars primary. Concise, good game coverage." },
  { handle: "Demetrius82",    name: "Demetrius Harvey", outlet: "Florida Times-Union", tier: "tier2", league: "NFL", teams: ["JAX"], domain: ["injury","roster","depth_chart"], confidenceFloor: 76, notes: "Jaguars backup. Film and numbers focused." },

  { handle: "TDavenport_NFL", name: "Turron Davenport", outlet: "ESPN",         tier: "tier2", league: "NFL", teams: ["TEN"], domain: ["injury","roster","depth_chart"],  confidenceFloor: 78, notes: "Titans primary. Good gameday in-stadium source." },
  { handle: "TerryMcCormick", name: "Terry McCormick", outlet: "Titan Insider", tier: "tier2", league: "NFL", teams: ["TEN"], domain: ["injury","roster"],               confidenceFloor: 76, notes: "Titans backup. Long-tenured Titans beat." },

  // ── AFC West ────────────────────────────────────────────────────────────────
  { handle: "mikeklis",       name: "Mike Klis",       outlet: "9NEWS Denver",  tier: "tier2", league: "NFL", teams: ["DEN"], domain: ["injury","roster","depth_chart"],  confidenceFloor: 80, notes: "Broncos primary. Narrative-focused, strong practice coverage." },
  { handle: "TroyRenck",      name: "Troy Renck",      outlet: "Denver7",       tier: "tier2", league: "NFL", teams: ["DEN"], domain: ["injury","roster"],               confidenceFloor: 76, notes: "Broncos backup. Good sideline reporting." },

  { handle: "mattderrick",    name: "Matt Derrick",    outlet: "Chiefs Digest", tier: "tier2", league: "NFL", teams: ["KC"],  domain: ["injury","roster","depth_chart"],  confidenceFloor: 80, notes: "Chiefs primary. Wrote the Mahomes book. Deep team access." },
  { handle: "adamteicher",    name: "Adam Teicher",    outlet: "ESPN",          tier: "tier2", league: "NFL", teams: ["KC"],  domain: ["injury","roster"],               confidenceFloor: 80, notes: "Chiefs backup. Pure injury and roster info." },

  { handle: "tashanreed",     name: "Tashan Reed",     outlet: "The Athletic",  tier: "tier2", league: "NFL", teams: ["LV"],  domain: ["injury","roster","transaction"], confidenceFloor: 78, notes: "Raiders primary." },
  { handle: "VinnyBonsignore", name: "Vincent Bonsignore", outlet: "Las Vegas Review-Journal", tier: "tier2", league: "NFL", teams: ["LV"], domain: ["injury","roster"], confidenceFloor: 76, notes: "Raiders backup. Good gameday in-stadium." },

  { handle: "krisrhim1",      name: "Kris Rhim",       outlet: "ESPN",          tier: "tier2", league: "NFL", teams: ["LAC"], domain: ["injury","roster","depth_chart"],  confidenceFloor: 78, notes: "Chargers primary. Replaced Lindsey Thiry." },
  { handle: "danielrpopper",  name: "Daniel Popper",   outlet: "The Athletic",  tier: "tier2", league: "NFL", teams: ["LAC"], domain: ["injury","roster"],               confidenceFloor: 78, notes: "Chargers backup. Daily training camp reports are gold." },

  // ── NFC East ────────────────────────────────────────────────────────────────
  { handle: "Jeff_McLane",    name: "Jeff McLane",     outlet: "Philadelphia Inquirer", tier: "tier2", league: "NFL", teams: ["PHI"], domain: ["injury","depth_chart","roster"], confidenceFloor: 84, notes: "Eagles primary. Regarded as best team beat writer for injury/depth chart speed." },
  { handle: "ZackRosenblatt", name: "Zack Rosenblatt", outlet: "The Athletic",  tier: "tier2", league: "NFL", teams: ["NYG","NYJ"], domain: ["injury","roster"],           confidenceFloor: 78, notes: "Giants/Jets coverage for The Athletic." },
  { handle: "DDuggan21",      name: "Dan Duggan",      outlet: "The Athletic",  tier: "tier2", league: "NFL", teams: ["NYG"], domain: ["injury","roster","depth_chart"],   confidenceFloor: 78, notes: "Giants primary for The Athletic." },
  { handle: "toddarcher",     name: "Todd Archer",     outlet: "ESPN",          tier: "tier2", league: "NFL", teams: ["DAL"], domain: ["injury","roster","depth_chart"],   confidenceFloor: 80, notes: "Cowboys primary. ESPN veteran Cowboys beat." },
  { handle: "CalvinWatkins",  name: "Calvin Watkins",  outlet: "Dallas Morning News", tier: "tier2", league: "NFL", teams: ["DAL"], domain: ["injury","roster"],           confidenceFloor: 78, notes: "Cowboys backup. Dallas Morning News beat." },
  { handle: "Nicki_Jhabvala", name: "Nicki Jhabvala",  outlet: "Washington Post", tier: "tier2", league: "NFL", teams: ["WSH"], domain: ["injury","roster","transaction"],  confidenceFloor: 80, notes: "Commanders primary. Washington Post beat." },
  { handle: "BenStandig",     name: "Ben Standig",     outlet: "The Athletic",  tier: "tier2", league: "NFL", teams: ["WSH"], domain: ["injury","roster"],               confidenceFloor: 78, notes: "Commanders backup. Sideline reporter." },

  // ── NFC North ───────────────────────────────────────────────────────────────
  { handle: "adamjahns",      name: "Adam Jahns",      outlet: "The Athletic",  tier: "tier2", league: "NFL", teams: ["CHI"], domain: ["injury","roster","depth_chart"],  confidenceFloor: 80, notes: "Bears primary. Works with Fishbain." },
  { handle: "kfishbain",      name: "Kevin Fishbain",  outlet: "The Athletic",  tier: "tier2", league: "NFL", teams: ["CHI"], domain: ["injury","roster"],               confidenceFloor: 80, notes: "Bears co-primary. Combined with Jahns." },
  { handle: "davebirkett",    name: "Dave Birkett",    outlet: "Detroit Free Press", tier: "tier2", league: "NFL", teams: ["DET"], domain: ["injury","roster","depth_chart"], confidenceFloor: 80, notes: "Lions primary. Old-school beat, drops nuggets before national pickup." },
  { handle: "Justin_Rogers",  name: "Justin Rogers",   outlet: "Detroit Football Network", tier: "tier2", league: "NFL", teams: ["DET"], domain: ["injury","roster","depth_chart"], confidenceFloor: 78, notes: "Lions backup. Names player availability before anyone." },
  { handle: "RobDemovsky",    name: "Rob Demovsky",    outlet: "ESPN",          tier: "tier2", league: "NFL", teams: ["GB"],  domain: ["injury","roster","transaction"],  confidenceFloor: 80, notes: "Packers primary. 25+ seasons on beat. Full roster coverage." },
  { handle: "mattschneidman", name: "Matt Schneidman", outlet: "The Athletic",  tier: "tier2", league: "NFL", teams: ["GB"],  domain: ["injury","roster"],               confidenceFloor: 78, notes: "Packers backup. Good home/away gameday source." },
  { handle: "ArifHasanNFL",   name: "Arif Hasan",      outlet: "WideLeft.football", tier: "tier2", league: "NFL", teams: ["MIN"], domain: ["injury","roster","depth_chart"], confidenceFloor: 78, notes: "Vikings primary. Data-driven, fan-friendly beat." },
  { handle: "LindseyMNSports", name: "Lindsey Young",  outlet: "Vikings Official", tier: "tier2", league: "NFL", teams: ["MIN"], domain: ["injury","roster"],             confidenceFloor: 76, notes: "Vikings team employee. Fast gameday injury designations." },

  // ── NFC South ───────────────────────────────────────────────────────────────
  { handle: "marcraimondi",   name: "Marc Raimondi",   outlet: "ESPN",          tier: "tier2", league: "NFL", teams: ["ATL"], domain: ["injury","roster","depth_chart"],  confidenceFloor: 78, notes: "Falcons primary. Took over ESPN Falcons beat 2024." },
  { handle: "ZachKleinWSB",   name: "Zach Klein",      outlet: "WSB Atlanta",   tier: "tier2", league: "NFL", teams: ["ATL"], domain: ["injury","roster"],               confidenceFloor: 76, notes: "Falcons backup. Local TV lens, good practice video." },
  { handle: "josephperson",   name: "Joe Person",      outlet: "The Athletic",  tier: "tier2", league: "NFL", teams: ["CAR"], domain: ["injury","roster","depth_chart"],  confidenceFloor: 82, notes: "Panthers primary. Fantastic practice detail. Beat the books to news." },
  { handle: "Sheena_Marie3",  name: "Sheena Quick",    outlet: "Fox Sports",    tier: "tier2", league: "NFL", teams: ["CAR"], domain: ["injury","roster"],               confidenceFloor: 78, notes: "Panthers backup. Strong pulse on the team." },
  { handle: "MikeTriplett",   name: "Mike Triplett",   outlet: "NewOrleans.football", tier: "tier2", league: "NFL", teams: ["NO"], domain: ["injury","roster","depth_chart"], confidenceFloor: 80, notes: "Saints primary. Injury-focused, very actionable." },
  { handle: "Kat_Terrell",    name: "Katherine Terrell", outlet: "ESPN",        tier: "tier2", league: "NFL", teams: ["NO"],  domain: ["injury","roster"],               confidenceFloor: 78, notes: "Saints backup. Good retweet network surfaces all Saints news." },
  { handle: "gregauman",      name: "Greg Auman",      outlet: "Fox Sports",    tier: "tier2", league: "NFL", teams: ["TB","NO","ATL","CAR"], domain: ["injury","roster"], confidenceFloor: 80, notes: "NFC South. Former Bucs beat. Best on Tampa." },
  { handle: "JennaLaineESPN", name: "Jenna Laine",     outlet: "ESPN",          tier: "tier2", league: "NFL", teams: ["TB"],  domain: ["injury","roster","transaction"],  confidenceFloor: 80, notes: "Buccaneers primary. ESPN Bucs beat." },

  // ── NFC West ────────────────────────────────────────────────────────────────
  { handle: "LombardiHimself", name: "David Lombardi", outlet: "The Athletic",  tier: "tier2", league: "NFL", teams: ["SF"],  domain: ["injury","depth_chart","roster"],  confidenceFloor: 84, notes: "49ers primary. Best in class for detailed practice roster tracking." },
  { handle: "Eric_Branch",    name: "Eric Branch",     outlet: "SF Chronicle",  tier: "tier2", league: "NFL", teams: ["SF"],  domain: ["injury","roster"],               confidenceFloor: 78, notes: "49ers backup. Practice and game observations." },
  { handle: "JourdanRodrigue", name: "Jourdan Rodrigue", outlet: "The Athletic", tier: "tier2", league: "NFL", teams: ["LAR"], domain: ["injury","roster","depth_chart"],  confidenceFloor: 82, notes: "Rams primary. Lauded as one of best beat writers in country." },
  { handle: "LATimesklein",   name: "Gary Klein",      outlet: "LA Times",      tier: "tier2", league: "NFL", teams: ["LAR"], domain: ["injury","roster"],               confidenceFloor: 76, notes: "Rams backup. Good in-stadium gameday." },
  { handle: "bcondotta",      name: "Bob Condotta",    outlet: "Seattle Times", tier: "tier2", league: "NFL", teams: ["SEA"], domain: ["injury","depth_chart","roster"],  confidenceFloor: 80, notes: "Seahawks primary. Real-time analysis and breaking news." },
  { handle: "gbellseattle",   name: "Gregg Bell",      outlet: "Tacoma News Tribune", tier: "tier2", league: "NFL", teams: ["SEA"], domain: ["injury","depth_chart"],   confidenceFloor: 78, notes: "Seahawks backup. Depth chart and injury focus." },
  { handle: "BoBrack",        name: "Bo Brack",        outlet: "PHNX Sports",   tier: "tier2", league: "NFL", teams: ["ARI"], domain: ["injury","roster","depth_chart"],  confidenceFloor: 78, notes: "Cardinals primary. Media hub for Cardinals content." },
  { handle: "CraigAZSports",  name: "Craig Grialou",   outlet: "Cardinals Official", tier: "tier2", league: "NFL", teams: ["ARI"], domain: ["injury","roster"],          confidenceFloor: 76, notes: "Cardinals team. Factual gameday updates." },
];

// ─────────────────────────────────────────────────────────────────────────────
// CFB — NATIONAL INSIDERS (Tier 1)
// ─────────────────────────────────────────────────────────────────────────────

export const CFB_NATIONALS: XSourceAccount[] = [
  { handle: "PeteThamel",      name: "Pete Thamel",     outlet: "ESPN",           tier: "tier1", league: "CFB", domain: ["transfer","coaching","eligibility","recruiting"],       confidenceFloor: 90, notes: "ESPN senior CFB insider. First on coaching hires, eligibility rulings, major transfers." },
  { handle: "RossDellenger",   name: "Ross Dellenger",  outlet: "Yahoo Sports",   tier: "tier1", league: "CFB", domain: ["transfer","coaching","eligibility","ncaa_policy"],      confidenceFloor: 90, notes: "Yahoo Sports. Strong on NCAA policy, eligibility rulings." },
  { handle: "BruceFeldmanCFB", name: "Bruce Feldman",   outlet: "The Athletic",   tier: "tier1", league: "CFB", domain: ["coaching","recruiting","transfer","roster"],             confidenceFloor: 88, notes: "Deep coaching network. Strong on staff changes." },
  { handle: "JoshPateCFB",     name: "Josh Pate",       outlet: "Late Kick / CBS",tier: "tier1", league: "CFB", domain: ["coaching","recruiting","roster","insider_intel"],        confidenceFloor: 85, notes: "540M X impressions 2025. Behind-the-scenes team insider network." },
  { handle: "Brett_McMurphy",  name: "Brett McMurphy",  outlet: "On3",            tier: "tier1", league: "CFB", domain: ["coaching","transaction","transfer"],                     confidenceFloor: 88, notes: "On3. Breaking news specialist. Fastest on coaching changes." },
  { handle: "AndyStaples",     name: "Andy Staples",    outlet: "On3",            tier: "tier1", league: "CFB", domain: ["recruiting","transfer","coaching","eligibility"],        confidenceFloor: 86, notes: "On3 senior writer. Deep access across all conferences." },
  { handle: "Chris_Lowenstein", name: "Chris Low",      outlet: "ESPN",           tier: "tier1", league: "CFB", domain: ["transfer","recruiting","coaching"],                      confidenceFloor: 86, notes: "ESPN CFB. SEC specialist. Strong on SEC coaching and portal." },
  { handle: "PeteNakos",       name: "Pete Nakos",      outlet: "On3",            tier: "tier1", league: "CFB", domain: ["transfer","recruiting","coaching"],                      confidenceFloor: 84, notes: "On3 national CFB reporter. Transfer portal and coaching." },
  { handle: "NickSchultz_",    name: "Nick Schultz",    outlet: "On3",            tier: "tier2", league: "CFB", domain: ["transfer","eligibility","ncaa_policy"],                  confidenceFloor: 82, notes: "On3. NCAA policy and eligibility rulings. Sorsby-type stories." },
  { handle: "MaxOlsonESPN",    name: "Max Olson",       outlet: "The Athletic",   tier: "tier1", league: "CFB", domain: ["transfer","roster","eligibility"],                       confidenceFloor: 86, notes: "The Athletic. Co-bylines major portal stories with Thamel." },
];

// ─────────────────────────────────────────────────────────────────────────────
// CFB — RECRUITING & TRANSFER PORTAL SPECIALISTS (Tier 2)
// ─────────────────────────────────────────────────────────────────────────────

export const CFB_RECRUITING: XSourceAccount[] = [
  { handle: "HayesFawcett3",   name: "Hayes Fawcett",   outlet: "On3 / Rivals",  tier: "tier2", league: "CFB", domain: ["recruiting","transfer","commitment"],    confidenceFloor: 86, notes: "THE commitment announcement account. Posts graphics before anyone." },
  { handle: "ChadSimmons_",    name: "Chad Simmons",    outlet: "On3",           tier: "tier2", league: "CFB", domain: ["recruiting","commitment","SEC"],         confidenceFloor: 82, notes: "On3 recruiting insider. Strong SEC focus." },
  { handle: "SteveWiltfong_",  name: "Steve Wiltfong",  outlet: "247Sports",     tier: "tier2", league: "CFB", domain: ["recruiting","commitment"],               confidenceFloor: 82, notes: "247Sports director of recruiting. Crystal Ball predictions." },
  { handle: "On3Recruits",     name: "On3 Recruiting",  outlet: "On3",           tier: "tier2", league: "CFB", domain: ["recruiting","transfer","portal"],        confidenceFloor: 80, notes: "On3 official. Portal wire, commitment tracking, NIL." },
  { handle: "247Sports",       name: "247Sports",       outlet: "247Sports",     tier: "tier2", league: "CFB", domain: ["recruiting","transfer"],                 confidenceFloor: 78, notes: "247Sports official. High-volume recruiting and portal signal." },
  { handle: "Rivals",          name: "Rivals",          outlet: "Rivals / Yahoo",tier: "tier2", league: "CFB", domain: ["recruiting","transfer","commitment"],    confidenceFloor: 78, notes: "Rivals official. Commitment and decommitment tracking." },
  { handle: "EvanHulbert_",    name: "Evan Hulbert",    outlet: "On3",           tier: "tier3", league: "CFB", domain: ["transfer","portal"],                    confidenceFloor: 72, notes: "On3 transfer portal specialist." },
  { handle: "JoeTipton",       name: "Joe Tipton",      outlet: "On3",           tier: "tier2", league: "CFB", domain: ["transfer","recruiting","commitment"],    confidenceFloor: 80, notes: "On3. Transfer portal and commitment breaking news." },
  { handle: "TaliaGoodman_",   name: "Talia Goodman",   outlet: "On3",           tier: "tier2", league: "CFB", domain: ["recruiting","transfer"],                 confidenceFloor: 78, notes: "On3 recruiting reporter." },
  { handle: "WilsonAlexander_", name: "Wilson Alexander", outlet: "On3 / Rivals", tier: "tier2", league: "CFB", domain: ["recruiting","commitment"],              confidenceFloor: 78, notes: "On3/Rivals recruiting." },
  { handle: "SamSpiegelman",   name: "Sam Spiegelman",  outlet: "247Sports",     tier: "tier2", league: "CFB", domain: ["recruiting","commitment","SEC"],         confidenceFloor: 78, notes: "247Sports. SEC recruiting specialist." },
  { handle: "AriWasserman",    name: "Ari Wasserman",   outlet: "The Athletic",  tier: "tier2", league: "CFB", domain: ["transfer","coaching","Big10"],           confidenceFloor: 80, notes: "The Athletic. Big Ten focus." },
];

// ─────────────────────────────────────────────────────────────────────────────
// CFB — CONFERENCE / SCHOOL BEAT WRITERS (Tier 2)
// Power 4 — at least one per program
// ─────────────────────────────────────────────────────────────────────────────

export const CFB_BEATS: XSourceAccount[] = [

  // ── SEC ─────────────────────────────────────────────────────────────────────
  { handle: "JoshVitale_247",  name: "Josh Vitale",     outlet: "247Sports",     tier: "tier2", league: "CFB", teams: ["ALA"], domain: ["recruiting","roster","injury"],   confidenceFloor: 80, notes: "Alabama 247Sports beat." },
  { handle: "TedGreenATH",     name: "Ted Green",       outlet: "The Athletic",  tier: "tier2", league: "CFB", teams: ["ALA"], domain: ["roster","coaching","injury"],     confidenceFloor: 80, notes: "Alabama beat for The Athletic." },
  { handle: "chip_towers",     name: "Chip Towers",     outlet: "AJC",           tier: "tier2", league: "CFB", teams: ["UGA"], domain: ["roster","injury","recruiting"],   confidenceFloor: 82, notes: "Georgia primary. AJC. First on Bulldogs roster news." },
  { handle: "Seth_Emerson",    name: "Seth Emerson",    outlet: "The Athletic",  tier: "tier2", league: "CFB", teams: ["UGA"], domain: ["roster","coaching","transfer"],   confidenceFloor: 80, notes: "Georgia backup for The Athletic." },
  { handle: "BrianKallmeyer",  name: "Brian Kallmeyer", outlet: "The Advocate",  tier: "tier2", league: "CFB", teams: ["LSU"], domain: ["roster","injury","recruiting"],   confidenceFloor: 78, notes: "LSU primary beat." },
  { handle: "ErikBacharach",   name: "Erik Bacharach",  outlet: "Knoxville News Sentinel", tier: "tier2", league: "CFB", teams: ["TENN"], domain: ["roster","injury"],    confidenceFloor: 78, notes: "Tennessee primary." },
  { handle: "TerryMcCormick",  name: "Terry McCormick", outlet: "Vol Report",    tier: "tier2", league: "CFB", teams: ["TENN"], domain: ["roster","injury"],             confidenceFloor: 78, notes: "Tennessee backup." },
  { handle: "NickSuss",        name: "Nick Suss",       outlet: "Clarion-Ledger",tier: "tier2", league: "CFB", teams: ["MISS"], domain: ["roster","injury"],             confidenceFloor: 78, notes: "Ole Miss primary." },
  { handle: "Brent_Zwerneman", name: "Brent Zwerneman", outlet: "Houston Chronicle", tier: "tier2", league: "CFB", teams: ["TAMU"], domain: ["roster","coaching","injury"], confidenceFloor: 80, notes: "Texas A&M primary." },
  { handle: "DouglasByrne_",   name: "Douglas Byrne",   outlet: "GatorNation",   tier: "tier2", league: "CFB", teams: ["FLA"], domain: ["roster","injury","recruiting"],  confidenceFloor: 78, notes: "Florida primary." },
  { handle: "EvanCoombs_AU",   name: "Evan Coombs",     outlet: "Auburn beat",   tier: "tier2", league: "CFB", teams: ["AUB"], domain: ["roster","injury"],             confidenceFloor: 76, notes: "Auburn primary." },
  { handle: "AlexScarborough", name: "Alex Scarborough", outlet: "ESPN",         tier: "tier2", league: "CFB", teams: ["ALA","AUB","MISS","LSU"], domain: ["roster","coaching","recruiting"], confidenceFloor: 80, notes: "ESPN SEC reporter. Covers full SEC." },

  // ── Big Ten ──────────────────────────────────────────────────────────────────
  { handle: "PeteSampson_",    name: "Pete Sampson",    outlet: "The Athletic",  tier: "tier2", league: "CFB", teams: ["OSU"], domain: ["roster","coaching","injury"],    confidenceFloor: 82, notes: "Ohio State primary for The Athletic." },
  { handle: "TomMcCulloughKFJ", name: "Tom McCullough", outlet: "Lettermen Row", tier: "tier2", league: "CFB", teams: ["OSU"], domain: ["roster","recruiting","injury"],  confidenceFloor: 78, notes: "Ohio State backup. Lettermen Row." },
  { handle: "nicklang247",     name: "Nick Baumgardner", outlet: "The Athletic", tier: "tier2", league: "CFB", teams: ["MICH"], domain: ["roster","injury","recruiting"], confidenceFloor: 80, notes: "Michigan primary for The Athletic." },
  { handle: "RyanMcFadden_PSU", name: "Ryan McFadden",  outlet: "Penn Live",     tier: "tier2", league: "CFB", teams: ["PSU"], domain: ["roster","injury","recruiting"],  confidenceFloor: 78, notes: "Penn State primary." },
  { handle: "Greg_Pickel",     name: "Greg Pickel",     outlet: "Penn Live",     tier: "tier2", league: "CFB", teams: ["PSU"], domain: ["roster","injury"],             confidenceFloor: 76, notes: "Penn State backup." },
  { handle: "LindseyThiry",    name: "Lindsey Thiry",   outlet: "ESPN",          tier: "tier2", league: "CFB", teams: ["USC"], domain: ["roster","coaching","recruiting"], confidenceFloor: 80, notes: "USC primary for ESPN." },
  { handle: "TomTeleshow",     name: "Tom Teleshow",    outlet: "UCLA beat",     tier: "tier2", league: "CFB", teams: ["UCLA"], domain: ["roster","injury"],            confidenceFloor: 76, notes: "UCLA primary." },
  { handle: "AriWasserman",    name: "Ari Wasserman",   outlet: "The Athletic",  tier: "tier2", league: "CFB", teams: ["MICH","OSU","PSU","NW"], domain: ["transfer","coaching","Big10"], confidenceFloor: 80, notes: "The Athletic Big Ten coverage." },

  // ── Big 12 ──────────────────────────────────────────────────────────────────
  { handle: "DavidUbben",      name: "David Ubben",     outlet: "The Athletic",  tier: "tier2", league: "CFB", teams: ["TEX","OU","KSU","ISU","WVU"], domain: ["roster","coaching","transfer"], confidenceFloor: 80, notes: "The Athletic Big 12. Deep conference access." },
  { handle: "MattTait",        name: "Matt Tait",       outlet: "Lawrence Journal-World", tier: "tier2", league: "CFB", teams: ["KU"], domain: ["roster","injury"],     confidenceFloor: 78, notes: "Kansas primary." },
  { handle: "MaxwellKSN",      name: "Aaron Kaiser",    outlet: "KSN",           tier: "tier2", league: "CFB", teams: ["KSU"], domain: ["roster","injury"],            confidenceFloor: 76, notes: "Kansas State primary." },
  { handle: "CannonSports",    name: "Don Williams",    outlet: "Lubbock Avalanche-Journal", tier: "tier2", league: "CFB", teams: ["TTU"], domain: ["roster","injury","eligibility"], confidenceFloor: 78, notes: "Texas Tech primary. Would have caught Sorsby ruling." },
  { handle: "TomKensler_DP",   name: "Tom Kensler",     outlet: "Denver Post",   tier: "tier2", league: "CFB", teams: ["COL"], domain: ["roster","coaching"],          confidenceFloor: 76, notes: "Colorado primary." },
  { handle: "ZachSandersDS",   name: "Zach Sander",     outlet: "Deseret News",  tier: "tier2", league: "CFB", teams: ["BYU"], domain: ["roster","injury","recruiting"], confidenceFloor: 76, notes: "BYU primary." },
  { handle: "KassidyHill",     name: "Kassidy Hill",    outlet: "Orlando Sentinel", tier: "tier2", league: "CFB", teams: ["UCF"], domain: ["roster","injury"],         confidenceFloor: 76, notes: "UCF primary." },
  { handle: "Fletcher_Page",   name: "Fletcher Page",   outlet: "Cincinnati Enquirer", tier: "tier2", league: "CFB", teams: ["CIN"], domain: ["roster","injury"],      confidenceFloor: 76, notes: "Cincinnati primary." },

  // ── ACC ──────────────────────────────────────────────────────────────────────
  { handle: "TimKiblerHerald", name: "Tim Kibler",      outlet: "Greenville Herald", tier: "tier2", league: "CFB", teams: ["CLEM"], domain: ["roster","injury","recruiting"], confidenceFloor: 78, notes: "Clemson primary." },
  { handle: "TomDNBC6",        name: "Tom D'Angelo",    outlet: "Palm Beach Post", tier: "tier2", league: "CFB", teams: ["FSU"], domain: ["roster","injury"],          confidenceFloor: 78, notes: "Florida State primary." },
  { handle: "CraigMissSun",    name: "Craig Davis",     outlet: "Miami Herald",  tier: "tier2", league: "CFB", teams: ["MIA"], domain: ["roster","injury","recruiting"], confidenceFloor: 76, notes: "Miami primary." },
  { handle: "JimKreager_DHill", name: "Jim Kreager",   outlet: "Durham Herald Sun", tier: "tier2", league: "CFB", teams: ["UNC"], domain: ["roster","injury"],         confidenceFloor: 76, notes: "North Carolina primary." },
  { handle: "MattFortuna",     name: "Matt Fortuna",    outlet: "The Athletic",  tier: "tier2", league: "CFB", teams: ["CLEM","FSU","MIA","UNC"], domain: ["coaching","transfer","roster"], confidenceFloor: 80, notes: "The Athletic ACC coverage." },
];

// ─────────────────────────────────────────────────────────────────────────────
// Unified exports
// ─────────────────────────────────────────────────────────────────────────────

export const ALL_NFL_SOURCES: XSourceAccount[] = [
  ...NFL_NATIONALS,
  ...NFL_BEATS,
];

export const ALL_CFB_SOURCES: XSourceAccount[] = [
  ...CFB_NATIONALS,
  ...CFB_RECRUITING,
  ...CFB_BEATS,
];

export const ALL_SOURCES: XSourceAccount[] = [
  ...ALL_NFL_SOURCES,
  ...ALL_CFB_SOURCES,
];

export function getHandlesToPoll(league?: "NFL" | "CFB"): string[] {
  const src = league === "NFL" ? ALL_NFL_SOURCES
    : league === "CFB" ? ALL_CFB_SOURCES
    : ALL_SOURCES;
  return [...new Set(src.map(s => s.handle))];
}

export function getTier1Handles(league?: "NFL" | "CFB"): string[] {
  const src = league === "NFL" ? ALL_NFL_SOURCES
    : league === "CFB" ? ALL_CFB_SOURCES
    : ALL_SOURCES;
  return src.filter(s => s.tier === "tier1").map(s => s.handle);
}

export function getSourceByHandle(handle: string): XSourceAccount | undefined {
  return ALL_SOURCES.find(s => s.handle.toLowerCase() === handle.toLowerCase());
}

export function getSourcesByTeam(team: string): XSourceAccount[] {
  return ALL_SOURCES.filter(s => s.teams?.includes(team.toUpperCase()));
}
