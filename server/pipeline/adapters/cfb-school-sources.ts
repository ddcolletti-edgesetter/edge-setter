/**
 * Edge Setter — Power 4 CFB School Source Manifest
 *
 * School SID feeds and beat writers are the PRIMARY source for eligibility
 * rulings, transfer waivers, and roster decisions. Wire services pick these
 * up 20–60 minutes later. This manifest is the coverage gap that caused the
 * Sorsby detection failure.
 *
 * Format:
 *   sidTwitter  — official athletics department X/Twitter account
 *   pressReleaseFeed — athletics.school.edu news RSS or scrape target
 *   beatWriters — primary beat reporters with high eligibility/roster signal rate
 *   conference  — used for pipeline routing and modifier application
 */

export interface SchoolSource {
  school: string;
  abbreviation: string;
  conference: "Big12" | "SEC" | "BigTen" | "ACC";
  sidTwitter: string;
  pressReleaseFeed: string;
  beatWriters: string[];
}

// ─── Big 12 ───────────────────────────────────────────────────────────────────

const BIG12_SOURCES: SchoolSource[] = [
  {
    school: "Texas Tech",
    abbreviation: "TTU",
    conference: "Big12",
    sidTwitter: "@TTUAthletics",
    pressReleaseFeed: "https://texastech.com/sports/football/schedule",
    beatWriters: ["@CannonSports", "@MaxMcNabb_TTU", "@ESPNRoySS"],
  },
  {
    school: "Texas",
    abbreviation: "TEX",
    conference: "Big12",
    sidTwitter: "@TexasLonghorns",
    pressReleaseFeed: "https://texassports.com/sports/football",
    beatWriters: ["@ChrisHaney_UT", "@NickMoyle_SA", "@ESPNMarcus"],
  },
  {
    school: "Oklahoma",
    abbreviation: "OU",
    conference: "Big12",
    sidTwitter: "@OU_Football",
    pressReleaseFeed: "https://soonersports.com/sports/football",
    beatWriters: ["@DanKoob_SN", "@Guerin_Emig", "@TheOUDaily"],
  },
  {
    school: "Oklahoma State",
    abbreviation: "OKST",
    conference: "Big12",
    sidTwitter: "@CowboyFB",
    pressReleaseFeed: "https://okstate.com/sports/football",
    beatWriters: ["@ScottRudeau", "@PokesReport"],
  },
  {
    school: "TCU",
    abbreviation: "TCU",
    conference: "Big12",
    sidTwitter: "@TCUFootball",
    pressReleaseFeed: "https://gofrogs.com/sports/football",
    beatWriters: ["@MaxOlson_ESPN", "@FrogsOWar"],
  },
  {
    school: "Baylor",
    abbreviation: "BAY",
    conference: "Big12",
    sidTwitter: "@BaylorFootball",
    pressReleaseFeed: "https://baylorbears.com/sports/football",
    beatWriters: ["@BruceFeldmanCFB", "@ScottDavis_SI"],
  },
  {
    school: "Kansas State",
    abbreviation: "KSU",
    conference: "Big12",
    sidTwitter: "@KStateFB",
    pressReleaseFeed: "https://kstatesports.com/sports/football",
    beatWriters: ["@AaronKaiserKSN", "@CraigMLahr"],
  },
  {
    school: "Kansas",
    abbreviation: "KU",
    conference: "Big12",
    sidTwitter: "@KUFootball",
    pressReleaseFeed: "https://kuathletics.com/sports/football",
    beatWriters: ["@MattTait_LJW", "@PeteGoble_KU"],
  },
  {
    school: "Iowa State",
    abbreviation: "ISU",
    conference: "Big12",
    sidTwitter: "@CycloneFB",
    pressReleaseFeed: "https://cyclones.com/sports/football",
    beatWriters: ["@ChrisWilliams_IS", "@SethAabergISU"],
  },
  {
    school: "West Virginia",
    abbreviation: "WVU",
    conference: "Big12",
    sidTwitter: "@WVUfootball",
    pressReleaseFeed: "https://wvusports.com/sports/football",
    beatWriters: ["@MetroNewsSports", "@DHomeier_WVU"],
  },
  {
    school: "Cincinnati",
    abbreviation: "CIN",
    conference: "Big12",
    sidTwitter: "@GoBearcatsFB",
    pressReleaseFeed: "https://gobearcats.com/sports/football",
    beatWriters: ["@Fletcher_Page", "@BrendanKing_CIN"],
  },
  {
    school: "UCF",
    abbreviation: "UCF",
    conference: "Big12",
    sidTwitter: "@UCF_Football",
    pressReleaseFeed: "https://ucfknights.com/sports/football",
    beatWriters: ["@KassidyHill", "@DavidSchofieldOS"],
  },
  {
    school: "Houston",
    abbreviation: "HOU",
    conference: "Big12",
    sidTwitter: "@UHCougarFB",
    pressReleaseFeed: "https://uhcougars.com/sports/football",
    beatWriters: ["@ChrisDurso_HOU", "@MarkBerman_Fox26"],
  },
  {
    school: "BYU",
    abbreviation: "BYU",
    conference: "Big12",
    sidTwitter: "@BYUfootball",
    pressReleaseFeed: "https://byucougars.com/sports/football",
    beatWriters: ["@ZachSandersDS", "@KSLSports"],
  },
  {
    school: "Colorado",
    abbreviation: "COL",
    conference: "Big12",
    sidTwitter: "@CUBuffsFootball",
    pressReleaseFeed: "https://cubuffs.com/sports/football",
    beatWriters: ["@TomKensler_DP", "@MarkKiszla"],
  },
  {
    school: "Arizona",
    abbreviation: "ARIZ",
    conference: "Big12",
    sidTwitter: "@ArizonaFBall",
    pressReleaseFeed: "https://arizonawildcats.com/sports/football",
    beatWriters: ["@TheWildcatAuthority", "@GeoffBaker_Wildcat"],
  },
  {
    school: "Arizona State",
    abbreviation: "ASU",
    conference: "Big12",
    sidTwitter: "@ASUFootball",
    pressReleaseFeed: "https://thesundevils.com/sports/football",
    beatWriters: ["@SteveATorre_ASU", "@Doug_Haller"],
  },
  {
    school: "Utah",
    abbreviation: "UTAH",
    conference: "Big12",
    sidTwitter: "@Utah_Football",
    pressReleaseFeed: "https://utahutes.com/sports/football",
    beatWriters: ["@GordonMonson_SLT", "@ChrisaMorton"],
  },
];

// ─── SEC (primary programs) ───────────────────────────────────────────────────

const SEC_SOURCES: SchoolSource[] = [
  {
    school: "Alabama",
    abbreviation: "ALA",
    conference: "SEC",
    sidTwitter: "@AlabamaFTBL",
    pressReleaseFeed: "https://rolltide.com/sports/football",
    beatWriters: ["@JoshVitale_247", "@TedGreenATH", "@LarsAndersonSI"],
  },
  {
    school: "Georgia",
    abbreviation: "UGA",
    conference: "SEC",
    sidTwitter: "@GeorgiaFootball",
    pressReleaseFeed: "https://georgiadogs.com/sports/football",
    beatWriters: ["@DanWolken_USA", "@chip_towers_AJC", "@Seth_Emerson"],
  },
  {
    school: "LSU",
    abbreviation: "LSU",
    conference: "SEC",
    sidTwitter: "@LSUfootball",
    pressReleaseFeed: "https://lsusports.net/sports/football",
    beatWriters: ["@BrianKallmeyer", "@StefAshby"],
  },
  {
    school: "Tennessee",
    abbreviation: "TENN",
    conference: "SEC",
    sidTwitter: "@Vol_Football",
    pressReleaseFeed: "https://utsports.com/sports/football",
    beatWriters: ["@ErikBacharach_KNS", "@TerryMcCormick"],
  },
  {
    school: "Ole Miss",
    abbreviation: "MISS",
    conference: "SEC",
    sidTwitter: "@OleMissFB",
    pressReleaseFeed: "https://olemisssports.com/sports/football",
    beatWriters: ["@NickSuss_CM", "@GSiegel_ClarionLedger"],
  },
  {
    school: "Texas A&M",
    abbreviation: "TAMU",
    conference: "SEC",
    sidTwitter: "@AggieFootball",
    pressReleaseFeed: "https://12thman.com/sports/football",
    beatWriters: ["@Brent_Zwerneman", "@ChrisRamirez_TAMU"],
  },
  {
    school: "Florida",
    abbreviation: "FLA",
    conference: "SEC",
    sidTwitter: "@GatorsFB",
    pressReleaseFeed: "https://floridagators.com/sports/football",
    beatWriters: ["@SaturdayDownSouth", "@DouglasByrne_Gators"],
  },
  {
    school: "Auburn",
    abbreviation: "AUB",
    conference: "SEC",
    sidTwitter: "@AuburnFootball",
    pressReleaseFeed: "https://auburntigers.com/sports/football",
    beatWriters: ["@EvanCoombs_AU", "@BryanHarsin"],
  },
];

// ─── Big Ten (primary programs) ───────────────────────────────────────────────

const BIG10_SOURCES: SchoolSource[] = [
  {
    school: "Michigan",
    abbreviation: "MICH",
    conference: "BigTen",
    sidTwitter: "@UMichFootball",
    pressReleaseFeed: "https://mgoblue.com/sports/football",
    beatWriters: ["@nicklang247", "@JoshTejada_Mich"],
  },
  {
    school: "Ohio State",
    abbreviation: "OSU",
    conference: "BigTen",
    sidTwitter: "@OhioStateFB",
    pressReleaseFeed: "https://ohiostatebuckeyes.com/sports/football",
    beatWriters: ["@PeteSampson_", "@TomMcCulloughKFJ"],
  },
  {
    school: "Penn State",
    abbreviation: "PSU",
    conference: "BigTen",
    sidTwitter: "@PennStateFball",
    pressReleaseFeed: "https://gopsusports.com/sports/football",
    beatWriters: ["@RyanMcFadden_PSU", "@Greg_Pickel"],
  },
  {
    school: "USC",
    abbreviation: "USC",
    conference: "BigTen",
    sidTwitter: "@USCFootball",
    pressReleaseFeed: "https://usctrojans.com/sports/football",
    beatWriters: ["@LindseyThiry", "@JeffMiller_USC"],
  },
  {
    school: "UCLA",
    abbreviation: "UCLA",
    conference: "BigTen",
    sidTwitter: "@UCLAFootball",
    pressReleaseFeed: "https://uclabruins.com/sports/football",
    beatWriters: ["@BruceFeldmanCFB", "@TomTeleshow"],
  },
];

// ─── ACC (primary programs) ───────────────────────────────────────────────────

const ACC_SOURCES: SchoolSource[] = [
  {
    school: "Clemson",
    abbreviation: "CLEM",
    conference: "ACC",
    sidTwitter: "@ClemsonFB",
    pressReleaseFeed: "https://clemsontigers.com/sports/football",
    beatWriters: ["@TimKiblerHerald", "@AndrewCitraCFB"],
  },
  {
    school: "Florida State",
    abbreviation: "FSU",
    conference: "ACC",
    sidTwitter: "@FSUFootball",
    pressReleaseFeed: "https://seminoles.com/sports/football",
    beatWriters: ["@TomDNBC6", "@ImamouleSFT"],
  },
  {
    school: "Miami",
    abbreviation: "MIA",
    conference: "ACC",
    sidTwitter: "@CanesFootball",
    pressReleaseFeed: "https://hurricanesports.com/sports/football",
    beatWriters: ["@CraigMissSun", "@Zach_Meltzer_Miami"],
  },
  {
    school: "North Carolina",
    abbreviation: "UNC",
    conference: "ACC",
    sidTwitter: "@TarHeelFootball",
    pressReleaseFeed: "https://goheels.com/sports/football",
    beatWriters: ["@JimKreager_DHill", "@Steve_Wiseman_DNT"],
  },
];

// ─── Unified export ───────────────────────────────────────────────────────────

export const POWER4_SOURCES: SchoolSource[] = [
  ...BIG12_SOURCES,
  ...SEC_SOURCES,
  ...BIG10_SOURCES,
  ...ACC_SOURCES,
];

export function getSchoolSource(abbreviation: string): SchoolSource | undefined {
  return POWER4_SOURCES.find(s => s.abbreviation.toLowerCase() === abbreviation.toLowerCase());
}

export function getConferenceSources(conference: SchoolSource["conference"]): SchoolSource[] {
  return POWER4_SOURCES.filter(s => s.conference === conference);
}
