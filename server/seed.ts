import { storage } from "./storage";
import { runFullPipeline } from "./agents";

let seeded = false;

export async function seedDemoData() {
  if (seeded) return;
  seeded = true;

  // ─── Seed Sources (idempotent — checks by name) ───────────────────────────
  const sourceDefs = [
    // ── NFL ──────────────────────────────────────────────────────────────────
    { name: "NFL Official",      source_type: "official",        platform: "nfl.com",             url: "https://nfl.com",             trust_tier: "tier1", reliability_score: "98", speed_score: "90" },
    { name: "Adam Schefter",     source_type: "reporter",        platform: "ESPN",                url: "https://espn.com",            trust_tier: "tier1", reliability_score: "95", speed_score: "98" },
    { name: "Ian Rapoport",      source_type: "reporter",        platform: "NFL Network",         url: "https://nflnetwork.com",      trust_tier: "tier1", reliability_score: "94", speed_score: "97" },
    { name: "Tom Pelissero",     source_type: "reporter",        platform: "NFL Network",         url: "https://nflnetwork.com",      trust_tier: "tier2", reliability_score: "89", speed_score: "92" },
    { name: "Jay Glazer",        source_type: "reporter",        platform: "FOX Sports",          url: "https://foxsports.com",       trust_tier: "tier2", reliability_score: "88", speed_score: "91" },
    { name: "Jeremy Fowler",     source_type: "reporter",        platform: "ESPN",                url: "https://espn.com",            trust_tier: "tier2", reliability_score: "87", speed_score: "90" },
    { name: "Field Yates",       source_type: "analyst",         platform: "ESPN",                url: "https://espn.com",            trust_tier: "tier2", reliability_score: "85", speed_score: "85" },
    { name: "ProFootballTalk",   source_type: "aggregator",      platform: "PFT",                 url: "https://profootballtalk.com", trust_tier: "tier3", reliability_score: "72", speed_score: "80" },
    { name: "Bleacher Report",   source_type: "aggregator",      platform: "BR",                  url: "https://bleacherreport.com",  trust_tier: "tier3", reliability_score: "68", speed_score: "75" },
    { name: "Reddit r/nfl",      source_type: "commentary",      platform: "Reddit",              url: "https://reddit.com/r/nfl",    trust_tier: "tier4", reliability_score: "45", speed_score: "65" },
    { name: "OverTheCap",        source_type: "analyst",         platform: "OTC",                 url: "https://overthecap.com",      trust_tier: "tier2", reliability_score: "91", speed_score: "70" },
    { name: "The Athletic NFL",  source_type: "reporter",        platform: "The Athletic",        url: "https://theathletic.com",     trust_tier: "tier1", reliability_score: "93", speed_score: "88" },
    { name: "Pro Football Focus",source_type: "analytics",       platform: "PFF",                 url: "https://www.pff.com",         trust_tier: "tier2", reliability_score: "91", speed_score: "60" },
    { name: "Landry Football",   source_type: "scouting",        platform: "LandryFootball.com",  url: "https://landryfootball.com",  trust_tier: "tier2", reliability_score: "88", speed_score: "55" },
    { name: "Phil Steele",       source_type: "college_analyst", platform: "PhilSteele.com",      url: "https://philsteele.com",      trust_tier: "tier2", reliability_score: "85", speed_score: "50" },
    // ── NBA ──────────────────────────────────────────────────────────────────
    { name: "NBA Official",          source_type: "official",   platform: "nba.com",          url: "https://nba.com",            trust_tier: "tier1", reliability_score: "98", speed_score: "90" },
    { name: "Shams Charania",        source_type: "reporter",   platform: "The Athletic",     url: "https://theathletic.com",    trust_tier: "tier1", reliability_score: "96", speed_score: "99" },
    { name: "Adrian Wojnarowski",    source_type: "reporter",   platform: "ESPN",             url: "https://espn.com",           trust_tier: "tier1", reliability_score: "95", speed_score: "99" },
    { name: "The Athletic NBA",      source_type: "reporter",   platform: "The Athletic",     url: "https://theathletic.com",    trust_tier: "tier1", reliability_score: "93", speed_score: "88" },
    { name: "ESPN NBA",              source_type: "aggregator", platform: "ESPN",             url: "https://espn.com",           trust_tier: "tier2", reliability_score: "85", speed_score: "85" },
    { name: "Jake Fischer",          source_type: "reporter",   platform: "Bleacher Report",  url: "https://bleacherreport.com", trust_tier: "tier2", reliability_score: "84", speed_score: "90" },
    { name: "Chris Haynes",          source_type: "reporter",   platform: "TNT Sports",       url: "https://tntsports.com",      trust_tier: "tier2", reliability_score: "83", speed_score: "88" },
    { name: "Bleacher Report NBA",   source_type: "aggregator", platform: "BR",               url: "https://bleacherreport.com", trust_tier: "tier3", reliability_score: "68", speed_score: "75" },
    { name: "Reddit r/nba",          source_type: "commentary", platform: "Reddit",           url: "https://reddit.com/r/nba",   trust_tier: "tier4", reliability_score: "45", speed_score: "65" },
    // ── MLB ──────────────────────────────────────────────────────────────────
    { name: "MLB Official",      source_type: "official",   platform: "mlb.com",          url: "https://mlb.com",               trust_tier: "tier1", reliability_score: "98", speed_score: "90" },
    { name: "Ken Rosenthal",     source_type: "reporter",   platform: "The Athletic",     url: "https://theathletic.com",       trust_tier: "tier1", reliability_score: "95", speed_score: "97" },
    { name: "Jeff Passan",       source_type: "reporter",   platform: "ESPN",             url: "https://espn.com",              trust_tier: "tier1", reliability_score: "94", speed_score: "96" },
    { name: "Jon Heyman",        source_type: "reporter",   platform: "New York Post",    url: "https://nypost.com",            trust_tier: "tier1", reliability_score: "92", speed_score: "95" },
    { name: "ESPN MLB",          source_type: "aggregator", platform: "ESPN",             url: "https://espn.com",              trust_tier: "tier2", reliability_score: "85", speed_score: "83" },
    { name: "Baseball Reference",source_type: "analytics",  platform: "Baseball-Reference",url: "https://baseball-reference.com",trust_tier: "tier2", reliability_score: "90", speed_score: "55" },
    { name: "FanGraphs",         source_type: "analytics",  platform: "FanGraphs",        url: "https://fangraphs.com",         trust_tier: "tier2", reliability_score: "91", speed_score: "55" },
    // ── CFB ──────────────────────────────────────────────────────────────────
    { name: "ESPN CFB",          source_type: "aggregator", platform: "ESPN",             url: "https://espn.com",              trust_tier: "tier2", reliability_score: "84", speed_score: "85" },
    { name: "Todd McShay",       source_type: "analyst",    platform: "ESPN",             url: "https://espn.com",              trust_tier: "tier2", reliability_score: "83", speed_score: "80" },
    { name: "Mel Kiper",         source_type: "analyst",    platform: "ESPN",             url: "https://espn.com",              trust_tier: "tier2", reliability_score: "82", speed_score: "75" },
    { name: "The Athletic CFB",  source_type: "reporter",   platform: "The Athletic",     url: "https://theathletic.com",       trust_tier: "tier1", reliability_score: "91", speed_score: "85" },
    { name: "247Sports",         source_type: "analytics",  platform: "247Sports",        url: "https://247sports.com",         trust_tier: "tier2", reliability_score: "80", speed_score: "78" },
  ];

  const existingByName = new Map(storage.getSources().map(s => [s.name, s]));

  const sourceIds: string[] = [];
  for (const s of sourceDefs) {
    const existing = existingByName.get(s.name);
    if (existing) {
      sourceIds.push(existing.id);
      // Backfill source_name on the score row if it was seeded without it
      const score = storage.getSourceScore(existing.id);
      if (score && !(score as any).source_name) {
        storage.upsertSourceScore({ ...(score as any), source_name: s.name });
      }
      continue;
    }
    const src = storage.createSource(s as any);
    sourceIds.push(src.id);
    storage.upsertSourceScore({
      source_id: src.id,
      source_name: s.name,
      overall_accuracy: s.reliability_score,
      average_lead_time_minutes: String(Math.floor(Math.random() * 120 + 5)),
      draft_accuracy:       String(Math.floor(parseFloat(s.reliability_score) - 5 + Math.random() * 10)),
      injury_accuracy:      String(Math.floor(parseFloat(s.reliability_score) + Math.random() * 5)),
      portal_accuracy:      String(Math.floor(parseFloat(s.reliability_score) - 3 + Math.random() * 6)),
      false_positive_rate:  String(Math.floor(Math.random() * 12)),
    });
  }

  // ─── Seed Signal Pipeline Items ───────────────────────────────────────────
  const nflSchefter  = sourceIds[1];  // Adam Schefter
  const nflOfficial  = sourceIds[0];  // NFL Official
  const nflRapoport  = sourceIds[2];  // Ian Rapoport
  const nflAthletic  = sourceIds[11]; // The Athletic NFL
  const nflPelissero = sourceIds[3];  // Tom Pelissero
  const nflFowler    = sourceIds[5];  // Jeremy Fowler
  const nflYates     = sourceIds[6];  // Field Yates
  const nflPFT       = sourceIds[7];  // ProFootballTalk
  const nflBR        = sourceIds[8];  // Bleacher Report
  const nflOTC       = sourceIds[10]; // OverTheCap
  const nflPFF       = sourceIds[12]; // Pro Football Focus
  const nflLandry    = sourceIds[13]; // Landry Football
  const nflSteele    = sourceIds[14]; // Phil Steele

  const pipelineItems = [
    {
      source_id: nflSchefter,
      raw_text: "Patrick Mahomes is officially questionable for the AFC Championship with a right ankle sprain. He did not practice Thursday.",
      player: "Patrick Mahomes", team: "Kansas City Chiefs", league: "NFL", topic: "injury"
    },
    {
      source_id: nflOfficial,
      raw_text: "The San Francisco 49ers have placed RB Christian McCaffrey on IR. He will miss a minimum of 4 weeks.",
      player: "Christian McCaffrey", team: "San Francisco 49ers", league: "NFL", topic: "injury"
    },
    {
      source_id: nflRapoport,
      raw_text: "Source: Jets QB Aaron Rodgers is expected to start Week 14 against the Dolphins. He cleared the final injury protocol step.",
      player: "Aaron Rodgers", team: "New York Jets", league: "NFL", topic: "injury"
    },
    {
      source_id: nflAthletic,
      raw_text: "The Cowboys are actively exploring trade options for WR CeeDee Lamb after failed contract extension talks, per sources.",
      player: "CeeDee Lamb", team: "Dallas Cowboys", league: "NFL", topic: "trade"
    },
    {
      source_id: nflSchefter,
      raw_text: "NFL Draft: USC QB Caleb Williams is the consensus #1 overall pick. Bears have informed agents they will not trade the pick.",
      player: "Caleb Williams", team: "Chicago Bears", league: "NFL", topic: "draft"
    },
    {
      source_id: nflPFT,
      raw_text: "Rumor circulating that Lamar Jackson might request a trade if Ravens don't win the Super Bowl. Source is unnamed.",
      player: "Lamar Jackson", team: "Baltimore Ravens", league: "NFL", topic: "trade"
    },
    {
      source_id: sourceIds[4], // Jay Glazer
      raw_text: "Sean Payton is safe as Broncos head coach despite the 5-win season, per team sources. No change expected.",
      player: "Sean Payton", team: "Denver Broncos", league: "NFL", topic: "coaching"
    },
    {
      source_id: nflOfficial,
      raw_text: "NFL announces the 2025 schedule release date: May 14. 17-game schedule confirmed with 4 international games.",
      player: null, team: null, league: "NFL", topic: "general"
    },
    {
      source_id: nflPelissero,
      raw_text: "Jalen Hurts (Eagles) shoulder injury update: limited practice Wednesday but expected to play Sunday vs. Giants.",
      player: "Jalen Hurts", team: "Philadelphia Eagles", league: "NFL", topic: "injury"
    },
    {
      source_id: nflYates,
      raw_text: "Fantasy Alert: Tyreek Hill listed as doubtful (knee) for Miami's Thursday Night Football game vs. Buffalo.",
      player: "Tyreek Hill", team: "Miami Dolphins", league: "NFL", topic: "injury"
    },
    {
      source_id: nflOTC,
      raw_text: "Cap Analysis: The Cowboys have $24.2M in cap space heading into free agency. Expect activity at edge rusher and OL.",
      player: null, team: "Dallas Cowboys", league: "NFL", topic: "transaction"
    },
    {
      source_id: nflFowler,
      raw_text: "Multiple teams have expressed interest in trading for WR DeAndre Hopkins. Patriots and Seahawks among teams in contact.",
      player: "DeAndre Hopkins", team: "Tennessee Titans", league: "NFL", topic: "trade"
    },
    {
      source_id: nflBR,
      raw_text: "College Transfer Portal: Ohio State QB Kyle McCord enters transfer portal after backup role reduced significantly.",
      player: "Kyle McCord", team: "Ohio State", league: "College", topic: "draft"
    },
    {
      source_id: nflSchefter,
      raw_text: "BREAKING: Bills sign K Tyler Bass to 4-year extension worth $22M. No longer a free agent concern this offseason.",
      player: "Tyler Bass", team: "Buffalo Bills", league: "NFL", topic: "transaction"
    },
    {
      source_id: nflRapoport,
      raw_text: "Depth Chart: Ravens WR room shake up — Odell Beckham Jr. moves to slot role after Nelson Agholor named starter.",
      player: "Odell Beckham Jr.", team: "Baltimore Ravens", league: "NFL", topic: "depth_chart"
    },
    {
      source_id: nflPFF,
      raw_text: "PFF Grade Report: Fernando Mendoza leads all 2026 draft-eligible QBs with a 96.2 passing grade. His pressure-to-clean pocket differential is the highest PFF has recorded in six years of college grading.",
      player: "Fernando Mendoza", team: "Las Vegas Raiders", league: "NFL", topic: "draft"
    },
    {
      source_id: nflLandry,
      raw_text: "Chris Landry scouting note: Arvell Reese's hand usage and pass-rush plan mirror Myles Garrett's pre-draft profile. Reese is a legitimate chess-piece rusher who can win from either side. Jets scheme under new DC is a wide-9 system — ideal deployment for Reese's bend/burst skill set.",
      player: "Arvell Reese", team: "New York Jets", league: "NFL", topic: "draft"
    },
    {
      source_id: nflSteele,
      raw_text: "Phil Steele college preview context: Jeremiyah Love led Notre Dame in yards after contact (847) and broken tackles (41) in 2025 — both program records. In Steele's annual college rankings, Love graded as the top returning RB in the ACC/Big Ten crossover slate. His production in high-leverage games (7 games vs. Top-25 opponents: 6.4 YPC) reinforces NFL-starter projection.",
      player: "Jeremiyah Love", team: "Tennessee Titans", league: "NFL", topic: "draft"
    },
  ];

  for (const item of pipelineItems) {
    try {
      await runFullPipeline(item as any);
    } catch (e) {
      // non-fatal seed error
    }
  }
}
