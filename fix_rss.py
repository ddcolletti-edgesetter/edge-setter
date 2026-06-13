import re

content = open('server/pipeline/adapters/sports-rss.ts', 'r', encoding='utf-8').read()

new_feeds = '''  { url: "https://www.chiefs.com/rss/news", label: "chiefs_official", league: "NFL" as const, sourceName: "Kansas City Chiefs Official", tier: "tier1", confidenceBonus: 12, team: "KC" },
  { url: "https://www.philadelphiaeagles.com/rss/news", label: "eagles_official", league: "NFL" as const, sourceName: "Philadelphia Eagles Official", tier: "tier1", confidenceBonus: 12, team: "PHI" },
  { url: "https://www.buffalobills.com/rss/news", label: "bills_official", league: "NFL" as const, sourceName: "Buffalo Bills Official", tier: "tier1", confidenceBonus: 12, team: "BUF" },
  { url: "https://www.baltimoreravens.com/rss/news", label: "ravens_official", league: "NFL" as const, sourceName: "Baltimore Ravens Official", tier: "tier1", confidenceBonus: 12, team: "BAL" },
  { url: "https://www.dallascowboys.com/rss/news", label: "cowboys_official", league: "NFL" as const, sourceName: "Dallas Cowboys Official", tier: "tier1", confidenceBonus: 12, team: "DAL" },
  { url: "https://www.49ers.com/rss/news", label: "49ers_official", league: "NFL" as const, sourceName: "San Francisco 49ers Official", tier: "tier1", confidenceBonus: 12, team: "SF" },
  { url: "https://www.miamidolphins.com/rss/news", label: "dolphins_official", league: "NFL" as const, sourceName: "Miami Dolphins Official", tier: "tier1", confidenceBonus: 12, team: "MIA" },
  { url: "https://www.denverbroncos.com/rss/news", label: "broncos_official", league: "NFL" as const, sourceName: "Denver Broncos Official", tier: "tier1", confidenceBonus: 12, team: "DEN" },
  { url: "https://www.seahawks.com/rss/news", label: "seahawks_official", league: "NFL" as const, sourceName: "Seattle Seahawks Official", tier: "tier1", confidenceBonus: 12, team: "SEA" },
  { url: "https://www.detroitlions.com/rss/news", label: "lions_official", league: "NFL" as const, sourceName: "Detroit Lions Official", tier: "tier1", confidenceBonus: 12, team: "DET" },
  { url: "https://www.packers.com/rss/news", label: "packers_official", league: "NFL" as const, sourceName: "Green Bay Packers Official", tier: "tier1", confidenceBonus: 12, team: "GB" },
'''

new_lockedon = '''const LOCKEDON_FEEDS = [
  { team: "BUF", url: "https://feeds.simplecast.com/LIaoLB9Y", label: "lockedon_bills",    league: "NFL" as const },
  { team: "NE",  url: "https://feeds.simplecast.com/wbru9pmV", label: "lockedon_patriots", league: "NFL" as const },
  { team: "PIT", url: "https://feeds.simplecast.com/y_l5uReM", label: "lockedon_steelers", league: "NFL" as const },
  { team: "DAL", url: "https://feeds.simplecast.com/4NoEmSg7", label: "lockedon_cowboys",  league: "NFL" as const },
  { team: "PHI", url: "https://feeds.simplecast.com/rR8B4DDE", label: "lockedon_eagles",   league: "NFL" as const },
  { team: "KC",  url: "https://feeds.simplecast.com/9czLVzrJ", label: "lockedon_chiefs",   league: "NFL" as const },
  { team: None,  url: "https://feeds.simplecast.com/zx_GShic", label: "lockedon_nfl",      league: "NFL" as const },
];'''

idx = content.find('];')
content = content[:idx] + new_feeds + content[idx:]
content = re.sub(r'const LOCKEDON_FEEDS = \[[\s\S]*?\];', new_lockedon, content)

open('server/pipeline/adapters/sports-rss.ts', 'w', encoding='utf-8').write(content)
print('done')
