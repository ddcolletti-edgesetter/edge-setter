import { storage } from "./storage";
import { runFullPipeline } from "./agents";

let seeded = false;

export async function seedDemoData() {
  if (seeded) return;
  seeded = true;

  // Already has data? skip
  const existing = storage.getSources();
  if (existing.length > 0) return;

  // ─── Seed Sources ─────────────────────────────────────────────────────────────
  const sourceDefs = [
    { name: "NFL Official", source_type: "official", platform: "nfl.com", url: "https://nfl.com", trust_tier: "tier1", reliability_score: "98", speed_score: "90" },
    { name: "Adam Schefter", source_type: "reporter", platform: "ESPN", url: "https://espn.com", trust_tier: "tier1", reliability_score: "95", speed_score: "98" },
    { name: "Ian Rapoport", source_type: "reporter", platform: "NFL Network", url: "https://nflnetwork.com", trust_tier: "tier1", reliability_score: "94", speed_score: "97" },
    { name: "Tom Pelissero", source_type: "reporter", platform: "NFL Network", url: "https://nflnetwork.com", trust_tier: "tier2", reliability_score: "89", speed_score: "92" },
    { name: "Jay Glazer", source_type: "reporter", platform: "FOX Sports", url: "https://foxsports.com", trust_tier: "tier2", reliability_score: "88", speed_score: "91" },
    { name: "Jeremy Fowler", source_type: "reporter", platform: "ESPN", url: "https://espn.com", trust_tier: "tier2", reliability_score: "87", speed_score: "90" },
    { name: "Field Yates", source_type: "analyst", platform: "ESPN", url: "https://espn.com", trust_tier: "tier2", reliability_score: "85", speed_score: "85" },
    { name: "ProFootballTalk", source_type: "aggregator", platform: "PFT", url: "https://profootballtalk.com", trust_tier: "tier3", reliability_score: "72", speed_score: "80" },
    { name: "Bleacher Report", source_type: "aggregator", platform: "BR", url: "https://bleacherreport.com", trust_tier: "tier3", reliability_score: "68", speed_score: "75" },
    { name: "Reddit r/nfl", source_type: "commentary", platform: "Reddit", url: "https://reddit.com/r/nfl", trust_tier: "tier4", reliability_score: "45", speed_score: "65" },
    { name: "OverTheCap", source_type: "analyst", platform: "OTC", url: "https://overthecap.com", trust_tier: "tier2", reliability_score: "91", speed_score: "70" },
    { name: "The Athletic NFL", source_type: "reporter", platform: "The Athletic", url: "https://theathletic.com", trust_tier: "tier1", reliability_score: "93", speed_score: "88" },
  ];

  const sourceIds: string[] = [];
  for (const s of sourceDefs) {
    const src = storage.createSource(s as any);
    sourceIds.push(src.id);
    // Create source score
    storage.upsertSourceScore({
      id: crypto.randomUUID(),
      source_id: src.id,
      overall_accuracy: s.reliability_score,
      average_lead_time_minutes: String(Math.floor(Math.random() * 120 + 5)),
      draft_accuracy: String(Math.floor(parseFloat(s.reliability_score) - 5 + Math.random() * 10)),
      injury_accuracy: String(Math.floor(parseFloat(s.reliability_score) + Math.random() * 5)),
      portal_accuracy: String(Math.floor(parseFloat(s.reliability_score) - 3 + Math.random() * 6)),
      false_positive_rate: String(Math.floor(Math.random() * 12)),
    });
  }

  // ─── Seed Signal Pipeline Items ───────────────────────────────────────────────
  const pipelineItems = [
    {
      source_id: sourceIds[1], // Schefter
      raw_text: "Patrick Mahomes is officially questionable for the AFC Championship with a right ankle sprain. He did not practice Thursday.",
      player: "Patrick Mahomes", team: "Kansas City Chiefs", league: "NFL", topic: "injury"
    },
    {
      source_id: sourceIds[0], // NFL Official
      raw_text: "The San Francisco 49ers have placed RB Christian McCaffrey on IR. He will miss a minimum of 4 weeks.",
      player: "Christian McCaffrey", team: "San Francisco 49ers", league: "NFL", topic: "injury"
    },
    {
      source_id: sourceIds[2], // Rapoport
      raw_text: "Source: Jets QB Aaron Rodgers is expected to start Week 14 against the Dolphins. He cleared the final injury protocol step.",
      player: "Aaron Rodgers", team: "New York Jets", league: "NFL", topic: "injury"
    },
    {
      source_id: sourceIds[11], // The Athletic
      raw_text: "The Cowboys are actively exploring trade options for WR CeeDee Lamb after failed contract extension talks, per sources.",
      player: "CeeDee Lamb", team: "Dallas Cowboys", league: "NFL", topic: "trade"
    },
    {
      source_id: sourceIds[1], // Schefter
      raw_text: "NFL Draft: USC QB Caleb Williams is the consensus #1 overall pick. Bears have informed agents they will not trade the pick.",
      player: "Caleb Williams", team: "Chicago Bears", league: "NFL", topic: "draft"
    },
    {
      source_id: sourceIds[7], // PFT
      raw_text: "Rumor circulating that Lamar Jackson might request a trade if Ravens don't win the Super Bowl. Source is unnamed.",
      player: "Lamar Jackson", team: "Baltimore Ravens", league: "NFL", topic: "trade"
    },
    {
      source_id: sourceIds[4], // Glazer
      raw_text: "Sean Payton is safe as Broncos head coach despite the 5-win season, per team sources. No change expected.",
      player: "Sean Payton", team: "Denver Broncos", league: "NFL", topic: "coaching"
    },
    {
      source_id: sourceIds[0], // NFL Official
      raw_text: "NFL announces the 2025 schedule release date: May 14. 17-game schedule confirmed with 4 international games.",
      player: null, team: null, league: "NFL", topic: "general"
    },
    {
      source_id: sourceIds[3], // Pelissero
      raw_text: "Jalen Hurts (Eagles) shoulder injury update: limited practice Wednesday but expected to play Sunday vs. Giants.",
      player: "Jalen Hurts", team: "Philadelphia Eagles", league: "NFL", topic: "injury"
    },
    {
      source_id: sourceIds[6], // Field Yates
      raw_text: "Fantasy Alert: Tyreek Hill listed as doubtful (knee) for Miami's Thursday Night Football game vs. Buffalo.",
      player: "Tyreek Hill", team: "Miami Dolphins", league: "NFL", topic: "injury"
    },
    {
      source_id: sourceIds[10], // OverTheCap
      raw_text: "Cap Analysis: The Cowboys have $24.2M in cap space heading into free agency. Expect activity at edge rusher and OL.",
      player: null, team: "Dallas Cowboys", league: "NFL", topic: "transaction"
    },
    {
      source_id: sourceIds[5], // Jeremy Fowler
      raw_text: "Multiple teams have expressed interest in trading for WR DeAndre Hopkins. Patriots and Seahawks among teams in contact.",
      player: "DeAndre Hopkins", team: "Tennessee Titans", league: "NFL", topic: "trade"
    },
    {
      source_id: sourceIds[8], // Bleacher Report
      raw_text: "College Transfer Portal: Ohio State QB Kyle McCord enters transfer portal after backup role reduced significantly.",
      player: "Kyle McCord", team: "Ohio State", league: "College", topic: "draft"
    },
    {
      source_id: sourceIds[1], // Schefter
      raw_text: "BREAKING: Bills sign K Tyler Bass to 4-year extension worth $22M. No longer a free agent concern this offseason.",
      player: "Tyler Bass", team: "Buffalo Bills", league: "NFL", topic: "transaction"
    },
    {
      source_id: sourceIds[2], // Rapoport
      raw_text: "Depth Chart: Ravens WR room shake up — Odell Beckham Jr. moves to slot role after Nelson Agholor named starter.",
      player: "Odell Beckham Jr.", team: "Baltimore Ravens", league: "NFL", topic: "depth_chart"
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
