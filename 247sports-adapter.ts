/**
 * Edge Setter — 247Sports Feed Adapter
 *
 * Source: 247sports.com (RSS feeds)
 * No API key required — public RSS feeds.
 *
 * Fetches:
 *   - CFB recruiting news → transaction RawEvents
 *   - Transfer portal → transaction RawEvents
 *   - General CFB news → classified RawEvents
 *
 * 247Sports RSS endpoints:
 *   - https://247sports.com/college/football/Season/2025-Football/Transfers/
 *   - https://247sports.com/Article/rss/ (general news)
 *   - https://247sports.com/college/football/Recruiting/
 *
 * Cross-references with On3 — if both report the same player/event,
 * confidence floor rises to corroborated level (85+).
 */

import { insertRawEvent, getRawEvents } from "../store";
import { createHash } from "crypto";

const SPORTS247_FEEDS = [
  {
    url: "https://247sports.com/Article/rss/college-football/",
    label: "247_cfb_news",
    league: "CFB" as const,
  },
  {
    url: "https://247sports.com/Article/rss/nfl/",
    label: "247_nfl_news",
    league: "NFL" as const,
  },
  {
    url: "https://247sports.com/Article/rss/recruiting/",
    label: "247_recruiting",
    league: "CFB" as const,
  },
];

// ─── Signal classification (same patterns as On3 adapter) ────────────────────
// Shared patterns — in production move to a shared classifier module

const ELIGIBILITY_PATTERNS = [
  /\beligib(?:le|ility)\b/i,
  /\bwaiver\b/i,
  /\breinstate(?:d|ment)?\b/i,
  /\bcleared\s+to\s+play\b/i,
  /\bgranted\s+eligibility\b/i,
  /\bncaa\s+approv(?:ed|al)\b/i,
  /\btransfer\s+waiver\b/i,
  /\bimmediate(?:ly)?\s+eligible\b/i,
];

const COACHING_PATTERNS = [
  /\b(?:named|hired)\s+(?:as\s+)?(?:head\s+)?coach\b/i,
  /\bcoaching\s+change\b/i,
  /\bfired\b/i,
  /\bparts\s+ways\b/i,
  /\bresign(?:s|ed|ing)?\b/i,
  /\bhead\s+coach(?:ing)?\b/i,
];

const TRANSFER_PATTERNS = [
  /\benter(?:s|ed|ing)?\s+(?:the\s+)?transfer\s+portal\b/i,
  /\bcommitt(?:s|ed)?\s+to\b/i,
  /\bdecommitt(?:s|ed)?\b/i,
  /\btransferr(?:ed|ing)?\b/i,
  /\bportal\b/i,
];

const INJURY_PATTERNS = [
  /\binjur(?:ed|y|ies)\b/i,
  /\btorn\s+(?:acl|mcl|achilles)\b/i,
  /\bout\s+for\s+(?:season|year)\b/i,
  /\bsurger(?:y|ies)\b/i,
];

const RECRUITING_PATTERNS = [
  /\bcommits?\s+to\b/i,
  /\bverbal\s+commit\b/i,
  /\b(?:4|5)-star\b/i,
  /\brecruit(?:ing|ment)?\b/i,
  /\bsigning\s+day\b/i,
  /\bcrystal\s+ball\b/i,
];

type EventType = "eligibility_ruling" | "coaching_change" | "transaction" | "injury_update";

interface ClassifiedSignal {
  eventType: EventType;
  confidence: number;
  signalType: string;
}

function classifySignal(text: string): ClassifiedSignal {
  if (ELIGIBILITY_PATTERNS.some(p => p.test(text))) {
    return { eventType: "eligibility_ruling", confidence: 90, signalType: "eligibility_ruling" };
  }
  if (COACHING_PATTERNS.some(p => p.test(text))) {
    return { eventType: "coaching_change", confidence: 85, signalType: "coaching_change" };
  }
  if (INJURY_PATTERNS.some(p => p.test(text))) {
    return { eventType: "injury_update", confidence: 78, signalType: "injury_update" };
  }
  if (TRANSFER_PATTERNS.some(p => p.test(text))) {
    return { eventType: "transaction", confidence: 82, signalType: "transfer_portal" };
  }
  if (RECRUITING_PATTERNS.some(p => p.test(text))) {
    return { eventType: "transaction", confidence: 80, signalType: "recruiting_commitment" };
  }
  return { eventType: "transaction", confidence: 65, signalType: "general_news" };
}

function extractPlayerName(title: string): string | null {
  const patterns = [
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:commits?|transfers?|enters?|signs?|hired|fired|granted|cleared)/,
    /(?:^|\s)([A-Z][a-z]+\s+[A-Z][a-z]+)\s+(?:commits?|transfers?|enters?|signs?)/,
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractTeamName(title: string): string | null {
  const schools = [
    "Alabama", "Georgia", "Ohio State", "Michigan", "LSU", "Texas", "Oklahoma",
    "Clemson", "Florida State", "Penn State", "Notre Dame", "USC", "Oregon",
    "Texas A&M", "Tennessee", "Florida", "Auburn", "Ole Miss", "Miami",
    "Utah", "Washington", "Colorado", "UCLA", "Texas Tech", "TCU", "Baylor",
    "Kansas State", "Iowa State", "West Virginia", "Cincinnati", "UCF", "Houston",
    "BYU", "Arizona State", "Arizona", "Kansas",
  ];
  for (const school of schools) {
    if (title.includes(school)) return school;
  }
  return null;
}

// ─── RSS parsing ──────────────────────────────────────────────────────────────

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  author: string;
  categories: string[];
}

function parseRSS(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];
    const title       = extractXMLField(block, "title");
    const link        = extractXMLField(block, "link");
    const description = extractXMLField(block, "description");
    const pubDate     = extractXMLField(block, "pubDate");
    const author      = extractXMLField(block, "dc:creator") || extractXMLField(block, "author");

    // Extract categories for better classification
    const categories: string[] = [];
    const catRe = /<category[^>]*>(?:<!\[CDATA\[)?([^\]<]+)(?:\]\]>)?<\/category>/gi;
    let catMatch;
    while ((catMatch = catRe.exec(block)) !== null) {
      categories.push(catMatch[1].trim());
    }

    if (title) {
      items.push({ title, link, description, pubDate, author, categories });
    }
  }

  return items;
}

function extractXMLField(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i");
  const m = block.match(re);
  return m ? m[1].trim() : "";
}

// ─── Cross-source corroboration check ────────────────────────────────────────
// If On3 already reported this player/event, confidence rises

function checkCorroboration(
  playerName: string | null,
  signalType: string,
  recentEvents: any[],
): boolean {
  if (!playerName) return false;
  return recentEvents.some(e => {
    const payload = e.payload as any;
    return (
      e.player === playerName &&
      payload?.signal_type === signalType &&
      payload?.on3_feed !== undefined // came from On3
    );
  });
}

// ─── Dedup ────────────────────────────────────────────────────────────────────

function itemHash(feedLabel: string, title: string, pubDate: string): string {
  return createHash("sha1")
    .update(`247|${feedLabel}|${title}|${pubDate.substring(0, 10)}`)
    .digest("hex")
    .substring(0, 16);
}

const _seenHashes = new Set<string>();

// ─── Fetch one feed ───────────────────────────────────────────────────────────

async function fetchFeed(url: string, timeoutMs = 10000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "EdgeSetter-NewsMonitor/1.0 (sports intelligence aggregator)",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[247sports] HTTP ${res.status} for ${url}`);
      return null;
    }
    return await res.text();
  } catch (err: any) {
    if (err.name !== "AbortError") {
      console.warn(`[247sports] Fetch error for ${url}: ${err.message}`);
    }
    return null;
  }
}

// ─── Process one feed ─────────────────────────────────────────────────────────

async function processFeed(
  feedUrl: string,
  feedLabel: string,
  league: "CFB" | "NFL",
  seenPayloadHashes: Set<string>,
  recentEvents: any[],
): Promise<{ created: number; skipped: number }> {
  const xml = await fetchFeed(feedUrl);
  if (!xml) return { created: 0, skipped: 0 };

  const items = parseRSS(xml);
  let created = 0;
  let skipped = 0;

  for (const item of items) {
    const combined = `${item.title} ${item.description} ${item.categories.join(" ")}`;
    const hash = itemHash(feedLabel, item.title, item.pubDate);

    if (_seenHashes.has(hash) || seenPayloadHashes.has(hash)) {
      skipped++;
      continue;
    }

    const classified = classifySignal(combined);

    // Skip low-signal general news
    if (classified.signalType === "general_news" && classified.confidence < 70) {
      skipped++;
      continue;
    }

    const player = extractPlayerName(item.title);
    const team   = extractTeamName(item.title);

    // Check if On3 already reported this — if so bump confidence
    const isCorroborated = checkCorroboration(player, classified.signalType, recentEvents);
    const finalConfidence = isCorroborated
      ? Math.min(95, classified.confidence + 8)
      : classified.confidence;

    try {
      insertRawEvent({
        source_id:   `247sports_${feedLabel}`,
        source_type: "rss",
        league,
        game_id:     null,
        team:        team ?? null,
        player:      player ?? null,
        event_type:  classified.eventType,
        payload: {
          headline:          item.title,
          notes:             item.description?.substring(0, 300) || item.title,
          source_url:        item.link,
          published_at:      item.pubDate,
          author:            item.author,
          categories:        item.categories,
          confidence:        finalConfidence,
          confirmation:      isCorroborated ? "Corroborated" : (finalConfidence >= 85 ? "Corroborated" : "Developing"),
          verdict:           finalConfidence >= 85 ? "confirmed" : "likely",
          signal_type:       classified.signalType,
          corroborated_by:   isCorroborated ? "on3" : null,
          source_types:      ["247sports", "rss"],
          source_labels:     [item.author || "247Sports"],
          source_count:      isCorroborated ? 2 : 1,
          sources: [{
            id:   `247sports_${feedLabel}`,
            name: item.author || "247Sports",
            type: "rss",
          }],
          sports247_feed:    feedLabel,
          dedup_hash:        hash,
        },
      });

      _seenHashes.add(hash);
      created++;
    } catch (err: any) {
      if (!err.message?.includes("UNIQUE")) {
        console.warn(`[247sports] Failed to store item "${item.title}": ${err.message}`);
      }
      skipped++;
    }
  }

  return { created, skipped };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function ingest247SportsFeed(): Promise<{ created: number; skipped: number }> {
  // Build dedup set from recent unprocessed raw events
  const recentEvents = getRawEvents({ processed: false, limit: 1000 });
  const seenPayloadHashes = new Set<string>(
    recentEvents
      .map(e => (e.payload as any)?.dedup_hash)
      .filter((h): h is string => !!h)
  );

  const results = await Promise.allSettled(
    SPORTS247_FEEDS.map(feed =>
      processFeed(feed.url, feed.label, feed.league, seenPayloadHashes, recentEvents)
    )
  );

  let totalCreated = 0;
  let totalSkipped = 0;
  let failures = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      totalCreated += result.value.created;
      totalSkipped += result.value.skipped;
    } else {
      failures++;
      console.warn(`[247sports] Feed failed: ${result.reason}`);
    }
  }

  if (failures > 0) {
    console.warn(`[247sports] ${failures}/${SPORTS247_FEEDS.length} feeds failed`);
  }

  console.log(`[247sports] ${totalCreated} RawEvents created, ${totalSkipped} skipped`);
  return { created: totalCreated, skipped: totalSkipped };
}
