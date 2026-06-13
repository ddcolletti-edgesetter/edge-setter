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
];

// ─── LockedOn podcast RSS feeds ───────────────────────────────────────────────
// One per team — episode titles contain practice reports, injury updates
// These are the local beat reporters EdgeSetter needs

const LOCKEDON_NFL_FEEDS = [
  { team: "KC",  url: "https://feeds.megaphone.fm/lockedontchiefscast", label: "lockedon_chiefs" },
  { team: "PHI", url: "https://feeds.megaphone.fm/lockedoneagles", label: "lockedon_eagles" },
  { team: "SF",  url: "https://feeds.megaphone.fm/lockedon49ers", label: "lockedon_49ers" },
  { team: "BUF", url: "https://feeds.megaphone.fm/lockedonbills", label: "lockedon_bills" },
  { team: "DAL", url: "https://feeds.megaphone.fm/lockedoncowboys", label: "lockedon_cowboys" },
  { team: "BAL", url: "https://feeds.megaphone.fm/lockedonravens", label: "lockedon_ravens" },
  { team: "CIN", url: "https://feeds.megaphone.fm/lockedonbengals", label: "lockedon_bengals" },
  { team: "MIA", url: "https://feeds.megaphone.fm/lockedondolphins", label: "lockedon_dolphins" },
  { team: "NYJ", url: "https://feeds.megaphone.fm/lockedonjets", label: "lockedon_jets" },
  { team: "NE",  url: "https://feeds.megaphone.fm/lockedonpatriots", label: "lockedon_patriots" },
  { team: "PIT", url: "https://feeds.megaphone.fm/lockedonsteeers", label: "lockedon_steelers" },
  { team: "CLE", url: "https://feeds.megaphone.fm/lockedonclevelandbrowns", label: "lockedon_browns" },
  { team: "HOU", url: "https://feeds.megaphone.fm/lockedontexans", label: "lockedon_texans" },
  { team: "IND", url: "https://feeds.megaphone.fm/lockedoncolts", label: "lockedon_colts" },
  { team: "JAX", url: "https://feeds.megaphone.fm/lockedonjaguars", label: "lockedon_jaguars" },
  { team: "TEN", url: "https://feeds.megaphone.fm/lockedontitans", label: "lockedon_titans" },
  { team: "DEN", url: "https://feeds.megaphone.fm/lockedonbroncos", label: "lockedon_broncos" },
  { team: "LV",  url: "https://feeds.megaphone.fm/lockedonraiders", label: "lockedon_raiders" },
  { team: "LAC", url: "https://feeds.megaphone.fm/lockedonchargers", label: "lockedon_chargers" },
  { team: "GB",  url: "https://feeds.megaphone.fm/lockedonpackers", label: "lockedon_packers" },
  { team: "DET", url: "https://feeds.megaphone.fm/lockedonlions", label: "lockedon_lions" },
  { team: "CHI", url: "https://feeds.megaphone.fm/lockedonbears", label: "lockedon_bears" },
  { team: "MIN", url: "https://feeds.megaphone.fm/lockedonvikings", label: "lockedon_vikings" },
  { team: "TB",  url: "https://feeds.megaphone.fm/lockedonbuccaneers", label: "lockedon_buccaneers" },
  { team: "NO",  url: "https://feeds.megaphone.fm/lockedonsaints", label: "lockedon_saints" },
  { team: "ATL", url: "https://feeds.megaphone.fm/lockedonfalcons", label: "lockedon_falcons" },
  { team: "CAR", url: "https://feeds.megaphone.fm/lockedonpanthers", label: "lockedon_panthers" },
  { team: "SEA", url: "https://feeds.megaphone.fm/lockedonseahawks", label: "lockedon_seahawks" },
  { team: "LAR", url: "https://feeds.megaphone.fm/lockedonrams", label: "lockedon_rams" },
  { team: "ARI", url: "https://feeds.megaphone.fm/lockedoncardinals", label: "lockedon_cardinals" },
  { team: "NYG", url: "https://feeds.megaphone.fm/lockedongiants", label: "lockedon_giants" },
  { team: "WSH", url: "https://feeds.megaphone.fm/lockedoncommanders", label: "lockedon_commanders" },
];

const LOCKEDON_CFB_FEEDS = [
  { team: "ALA",  url: "https://feeds.megaphone.fm/lockedoncrimsontidefootball", label: "lockedon_alabama" },
  { team: "UGA",  url: "https://feeds.megaphone.fm/lockedongeorgiafootball", label: "lockedon_georgia" },
  { team: "OSU",  url: "https://feeds.megaphone.fm/lockedonbuckeyes", label: "lockedon_ohiostate" },
  { team: "MICH", url: "https://feeds.megaphone.fm/lockedonwolverines", label: "lockedon_michigan" },
  { team: "LSU",  url: "https://feeds.megaphone.fm/lockedonthetiger", label: "lockedon_lsu" },
  { team: "TEX",  url: "https://feeds.megaphone.fm/lockedonlonghorns", label: "lockedon_texas" },
  { team: "TENN", url: "https://feeds.megaphone.fm/lockedonvolunteers", label: "lockedon_tennessee" },
  { team: "TAMU", url: "https://feeds.megaphone.fm/lockedontexasam", label: "lockedon_texasam" },
  { team: "PSU",  url: "https://feeds.megaphone.fm/lockedonpennsylvania", label: "lockedon_pennstate" },
  { team: "CLEM", url: "https://feeds.megaphone.fm/lockedonclemson", label: "lockedon_clemson" },
  { team: "OU",   url: "https://feeds.megaphone.fm/lockedonsooners", label: "lockedon_oklahoma" },
  { team: "TTU",  url: "https://feeds.megaphone.fm/lockedontexastech", label: "lockedon_texastech" },
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
