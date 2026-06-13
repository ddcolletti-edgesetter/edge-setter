/**
 * Edge Setter — Sports RSS Adapter
 *
 * Polls high-signal sports RSS feeds that work without authentication.
 * These complement the X adapter and fill the gap while X API access is limited.
 *
 * Sources:
 *   - ProFootballTalk (NFL news, injuries, transactions)
 *   - Rotowire (injury reports, lineup news)
 *   - ESPN NFL/CFB RSS
 *   - NFL.com news
 *   - The Athletic (public RSS)
 *   - LockedOn podcast network (team-specific daily updates)
 */

import { insertRawEvent, getRawEvents } from "../store";
import { createHash } from "crypto";

const SPORTS_RSS_FEEDS = [
  // ── NFL ────────────────────────────────────────────────────────────────────
  {
    url: "https://www.profootballtalk.com/feed/",
    label: "profootballtalk",
    league: "NFL" as const,
    sourceName: "Pro Football Talk",
    tier: "tier2",
    confidenceBonus: 5,
  },
  {
    url: "https://www.rotowire.com/rss/news.php?sport=NFL",
    label: "rotowire_nfl",
    league: "NFL" as const,
    sourceName: "Rotowire NFL",
    tier: "tier2",
    confidenceBonus: 8, // Rotowire is structured injury/lineup data
  },
  {
    url: "https://www.rotowire.com/rss/news.php?sport=CFB",
    label: "rotowire_cfb",
    league: "CFB" as const,
    sourceName: "Rotowire CFB",
    tier: "tier2",
    confidenceBonus: 8,
  },
  {
    url: "https://feeds.feedburner.com/nfl/news",
    label: "nfl_official",
    league: "NFL" as const,
    sourceName: "NFL.com",
    tier: "tier1",
    confidenceBonus: 12, // Official source
  },
  {
    url: "https://www.espn.com/espn/rss/nfl/news",
    label: "espn_nfl_rss",
    league: "NFL" as const,
    sourceName: "ESPN NFL",
    tier: "tier2",
    confidenceBonus: 8,
  },
  {
    url: "https://www.espn.com/espn/rss/ncf/news",
    label: "espn_cfb_rss",
    league: "CFB" as const,
    sourceName: "ESPN CFB",
    tier: "tier2",
    confidenceBonus: 8,
  },
  // ── CFB specific ───────────────────────────────────────────────────────────
  {
    url: "https://www.on3.com/transfer-portal/wire/football/",
    label: "on3_transfer_portal",
    league: "CFB" as const,
    sourceName: "On3 Transfer Portal",
    tier: "tier2",
    confidenceBonus: 10,
  },
  {
    url: "https://247sports.com/college/football/recruiting/",
    label: "247_cfb_recruiting",
    league: "CFB" as const,
    sourceName: "247Sports Recruiting",
    tier: "tier2",
    confidenceBonus: 8,
  },
  { url: "https://www.chiefs.com/rss/news", label: "chiefs_official", league: "NFL" as const, sourceName: "Kansas City Chiefs Official", tier: "tier1", confidenceBonus: 12, team: "KC" },
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
];

// ─── LockedOn podcast RSS feeds ───────────────────────────────────────────────
// One per team — episode titles contain practice reports, injury updates
// These are the local beat reporters EdgeSetter needs

const LOCKEDON_NFL_FEEDS = [
  { team: "BUF", url: "https://feeds.simplecast.com/LIaoLB9Y", label: "lockedon_bills" },
  { team: "NE",  url: "https://feeds.simplecast.com/wbru9pmV", label: "lockedon_patriots" },
  { team: "PIT", url: "https://feeds.simplecast.com/y_l5uReM", label: "lockedon_steelers" },
  { team: "DAL", url: "https://feeds.simplecast.com/4NoEmSg7", label: "lockedon_cowboys" },
  { team: "PHI", url: "https://feeds.simplecast.com/rR8B4DDE", label: "lockedon_eagles" },
  { team: "KC",  url: "https://feeds.simplecast.com/9czLVzrJ", label: "lockedon_chiefs" },
];

const LOCKEDON_CFB_FEEDS: { team: string; url: string; label: string }[] = [
];

// ─── Signal classification ────────────────────────────────────────────────────

const ELIGIBILITY_PATTERNS = [/\beligib(?:le|ility)\b/i, /\bwaiver\b/i, /\breinstate/i, /\bcleared\s+to\s+play\b/i, /\bgranted\s+eligibility\b/i];
const COACHING_PATTERNS    = [/\bhired\s+as\b/i, /\bcoaching\s+change\b/i, /\bfired\b/i, /\bhead\s+coach\b/i];
const INJURY_PATTERNS      = [/\binjur(?:ed|y)\b/i, /\btorn\s+(?:acl|mcl|achilles)\b/i, /\bout\s+(?:for\s+)?(?:season|year|game)\b/i, /\bdoubtful\b/i, /\bquestionable\b/i, /\bIR\b/, /\bIL-/i];
const TRANSACTION_PATTERNS = [/\btrad(?:ed|e)\b/i, /\bsign(?:ed|s)\b/i, /\breleased\b/i, /\bwaived\b/i, /\bextension\b/i, /\bdrafted\b/i];
const LINEUP_PATTERNS      = [/\bstarting\b/i, /\binactive\b/i, /\bscratched\b/i, /\bgame\s+time\s+decision\b/i, /\bGTD\b/i, /\bdepth\s+chart\b/i];
const TRANSFER_PATTERNS    = [/\btransfer\s+portal\b/i, /\bcommits?\s+to\b/i, /\bdecommit/i];

type EventType = "eligibility_ruling" | "coaching_change" | "transaction" | "injury_update" | "lineup_change";

function classifyText(text: string, tierBonus: number): { eventType: EventType; confidence: number; signalType: string } | null {
  if (ELIGIBILITY_PATTERNS.some(p => p.test(text))) return { eventType: "eligibility_ruling", confidence: Math.min(95, 88 + tierBonus), signalType: "eligibility_ruling" };
  if (COACHING_PATTERNS.some(p => p.test(text)))    return { eventType: "coaching_change",    confidence: Math.min(95, 82 + tierBonus), signalType: "coaching_change" };
  if (INJURY_PATTERNS.some(p => p.test(text)))      return { eventType: "injury_update",      confidence: Math.min(92, 74 + tierBonus), signalType: "injury_update" };
  if (LINEUP_PATTERNS.some(p => p.test(text)))      return { eventType: "lineup_change",      confidence: Math.min(90, 70 + tierBonus), signalType: "lineup_change" };
  if (TRANSACTION_PATTERNS.some(p => p.test(text))) return { eventType: "transaction",        confidence: Math.min(90, 72 + tierBonus), signalType: "transaction" };
  if (TRANSFER_PATTERNS.some(p => p.test(text)))    return { eventType: "transaction",        confidence: Math.min(88, 76 + tierBonus), signalType: "transfer_portal" };
  return null; // no signal pattern matched
}

function extractPlayer(title: string): string | null {
  const m = title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:is|has|will|out|injured|traded|signs?|commits?|enters?|granted|cleared|hired|fired)/);
  return m ? m[1] : null;
}

// ─── RSS parsing ──────────────────────────────────────────────────────────────

interface RSSItem { title: string; link: string; description: string; pubDate: string; }

function parseRSS(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title       = extractField(block, "title");
    const link        = extractField(block, "link");
    const description = extractField(block, "description");
    const pubDate     = extractField(block, "pubDate");
    if (title) items.push({ title, link, description, pubDate });
  }
  return items;
}

function extractField(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i");
  const m = block.match(re);
  return m ? m[1].trim() : "";
}

function itemHash(label: string, title: string, pubDate: string): string {
  return createHash("sha1").update(`${label}|${title}|${pubDate.substring(0, 10)}`).digest("hex").substring(0, 16);
}

const _seenHashes = new Set<string>();

async function fetchFeed(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "EdgeSetter-NewsMonitor/1.0",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
    });
    clearTimeout(timer);
    if (!res.ok) { console.warn(`[sports-rss] HTTP ${res.status} for ${url}`); return null; }
    return await res.text();
  } catch (err: any) {
    if (err.name !== "AbortError") console.warn(`[sports-rss] Fetch error for ${url}: ${err.message}`);
    return null;
  }
}

// ─── Process one feed ─────────────────────────────────────────────────────────

async function processFeed(
  url: string,
  label: string,
  league: "NFL" | "CFB",
  sourceName: string,
  tier: string,
  confidenceBonus: number,
  team: string | null,
  seenPayloadHashes: Set<string>,
): Promise<{ created: number; skipped: number }> {
  const xml = await fetchFeed(url);
  if (!xml) return { created: 0, skipped: 0 };

  const items = parseRSS(xml);
  let created = 0;
  let skipped = 0;

  for (const item of items) {
    const combined = `${item.title} ${item.description}`;
    const hash = itemHash(label, item.title, item.pubDate);

    if (_seenHashes.has(hash) || seenPayloadHashes.has(hash)) { skipped++; continue; }

    const classified = classifyText(combined, confidenceBonus);
    if (!classified) { skipped++; continue; }

    const player = extractPlayer(item.title);

    try {
      insertRawEvent({
        source_id:   `rss_${label}`,
        source_type: "rss",
        league,
        game_id:     null,
        team:        team ?? null,
        player:      player ?? null,
        event_type:  classified.eventType,
        payload: {
          headline:      item.title,
          notes:         item.description?.substring(0, 300) || item.title,
          source_url:    item.link,
          published_at:  item.pubDate,
          confidence:    classified.confidence,
          confirmation:  classified.confidence >= 85 ? "Corroborated" : "Developing",
          verdict:       classified.confidence >= 85 ? "confirmed" : "likely",
          signal_type:   classified.signalType,
          source_types:  ["rss"],
          source_labels: [sourceName],
          source_count:  1,
          sources:       [{ id: `rss_${label}`, name: sourceName, type: "rss" }],
          rss_feed:      label,
          dedup_hash:    hash,
        },
      });
      _seenHashes.add(hash);
      created++;
    } catch (err: any) {
      if (!err.message?.includes("UNIQUE")) console.warn(`[sports-rss] Failed to store "${item.title}": ${err.message}`);
      skipped++;
    }
  }

  return { created, skipped };
}

// ─── Main exports ─────────────────────────────────────────────────────────────

export async function ingestSportsRSSFeeds(): Promise<{ created: number; skipped: number }> {
  const recentEvents = getRawEvents({ processed: false, limit: 1000 });
  const seenPayloadHashes = new Set<string>(
    recentEvents.map(e => (e.payload as any)?.dedup_hash).filter((h): h is string => !!h)
  );

  const results = await Promise.allSettled([
    ...SPORTS_RSS_FEEDS.map(f =>
      processFeed(f.url, f.label, f.league, f.sourceName, f.tier, f.confidenceBonus, null, seenPayloadHashes)
    ),
  ]);

  let totalCreated = 0;
  let totalSkipped = 0;
  for (const r of results) {
    if (r.status === "fulfilled") { totalCreated += r.value.created; totalSkipped += r.value.skipped; }
  }

  console.log(`[sports-rss] ${totalCreated} RawEvents created, ${totalSkipped} skipped`);
  return { created: totalCreated, skipped: totalSkipped };
}

export async function ingestLockedOnFeeds(): Promise<{ created: number; skipped: number }> {
  const recentEvents = getRawEvents({ processed: false, limit: 1000 });
  const seenPayloadHashes = new Set<string>(
    recentEvents.map(e => (e.payload as any)?.dedup_hash).filter((h): h is string => !!h)
  );

  const allFeeds = [
    ...LOCKEDON_NFL_FEEDS.map(f => ({ ...f, league: "NFL" as const })),
    ...LOCKEDON_CFB_FEEDS.map(f => ({ ...f, league: "CFB" as const })),
  ];

  const results = await Promise.allSettled(
    allFeeds.map(f =>
      processFeed(f.url, f.label, f.league, `LockedOn ${f.team}`, "tier2", 6, f.team, seenPayloadHashes)
    )
  );

  let totalCreated = 0;
  let totalSkipped = 0;
  let failures = 0;
  for (const r of results) {
    if (r.status === "fulfilled") { totalCreated += r.value.created; totalSkipped += r.value.skipped; }
    else failures++;
  }

  if (failures > 0) console.warn(`[lockedon] ${failures}/${allFeeds.length} feeds failed`);
  console.log(`[lockedon] ${totalCreated} RawEvents created, ${totalSkipped} skipped`);
  return { created: totalCreated, skipped: totalSkipped };
}
