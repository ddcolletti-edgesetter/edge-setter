/**
 * Edge Setter — On3 Feed Adapter
 *
 * Source: on3.com (RSS feeds + structured news pages)
 * No API key required — public RSS feeds.
 *
 * Fetches:
 *   - Transfer portal wire → transaction RawEvents
 *   - CFB recruiting news → transaction RawEvents
 *   - College football news → transaction / eligibility_ruling / coaching_change RawEvents
 *
 * On3 RSS endpoints:
 *   - https://www.on3.com/feed/ (general CFB news)
 *   - https://www.on3.com/transfer-portal/wire/football/ (portal wire)
 *   - https://www.on3.com/college/football/recruiting/ (recruiting)
 *
 * Signal classification:
 *   Keywords in title/description determine event_type.
 *   Confidence floors match North Star established signal spec.
 */

import { insertRawEvent, getRawEvents } from "../store";
import { createHash } from "crypto";

const ON3_FEEDS = [
  {
    url: "https://www.on3.com/transfer-portal/wire/football/",
    label: "on3_transfer_portal",
    league: "CFB" as const,
  },
];

// ─── Signal classification patterns ──────────────────────────────────────────

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
  /\bfractur(?:ed|e)\b/i,
];

const RECRUITING_PATTERNS = [
  /\bcommits?\s+to\b/i,
  /\bverbal\s+commit\b/i,
  /\b(?:4|5)-star\b/i,
  /\brecruit(?:ing|ment)?\b/i,
  /\bclass\s+of\s+20\d\d\b/i,
  /\bsigning\s+day\b/i,
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
    return { eventType: "transaction", confidence: 78, signalType: "recruiting_commitment" };
  }
  return { eventType: "transaction", confidence: 65, signalType: "general_news" };
}

// ─── Player/team extraction ───────────────────────────────────────────────────

function extractPlayerName(title: string): string | null {
  // "Josh Williams commits to Alabama" → "Josh Williams"
  // "5-star QB John Doe transfers to..." → "John Doe"
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
  // Common school mentions — extend as needed
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
}

function parseRSS(xml: string): RSSItem[] {
  const items: RSSItem[] = [];

  // Match <item> blocks
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];

    const title       = extractXMLField(block, "title");
    const link        = extractXMLField(block, "link");
    const description = extractXMLField(block, "description");
    const pubDate     = extractXMLField(block, "pubDate");
    const author      = extractXMLField(block, "dc:creator") || extractXMLField(block, "author");

    if (title) {
      items.push({ title, link, description, pubDate, author });
    }
  }

  return items;
}

function extractXMLField(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i");
  const m = block.match(re);
  return m ? m[1].trim() : "";
}

// ─── Dedup ────────────────────────────────────────────────────────────────────

function itemHash(feedLabel: string, title: string, pubDate: string): string {
  return createHash("sha1")
    .update(`${feedLabel}|${title}|${pubDate.substring(0, 10)}`)
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
      console.warn(`[on3] HTTP ${res.status} for ${url}`);
      return null;
    }
    return await res.text();
  } catch (err: any) {
    if (err.name !== "AbortError") {
      console.warn(`[on3] Fetch error for ${url}: ${err.message}`);
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
): Promise<{ created: number; skipped: number }> {
  const xml = await fetchFeed(feedUrl);
  if (!xml) return { created: 0, skipped: 0 };

  const items = parseRSS(xml);
  let created = 0;
  let skipped = 0;

  for (const item of items) {
    const combined = `${item.title} ${item.description}`;
    const hash = itemHash(feedLabel, item.title, item.pubDate);

    // Skip if seen in this run or already in DB
    if (_seenHashes.has(hash) || seenPayloadHashes.has(hash)) {
      skipped++;
      continue;
    }

    const classified = classifySignal(combined);

    // Skip low-signal general news that doesn't match any pattern
    if (classified.signalType === "general_news" && classified.confidence < 70) {
      skipped++;
      continue;
    }

    const player = extractPlayerName(item.title);
    const team   = extractTeamName(item.title);

    try {
      insertRawEvent({
        source_id:   `on3_${feedLabel}`,
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
          confidence:        classified.confidence,
          confirmation:      classified.confidence >= 85 ? "Corroborated" : "Developing",
          verdict:           classified.confidence >= 85 ? "confirmed" : "likely",
          signal_type:       classified.signalType,
          source_types:      ["on3", "rss"],
          source_labels:     [item.author || "On3"],
          source_count:      1,
          sources: [{
            id:   `on3_${feedLabel}`,
            name: item.author || "On3",
            type: "rss",
          }],
          on3_feed:          feedLabel,
          dedup_hash:        hash,
        },
      });

      _seenHashes.add(hash);
      created++;
    } catch (err: any) {
      if (!err.message?.includes("UNIQUE")) {
        console.warn(`[on3] Failed to store item "${item.title}": ${err.message}`);
      }
      skipped++;
    }
  }

  return { created, skipped };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function ingestOn3Feeds(): Promise<{ created: number; skipped: number }> {
  // Build dedup set from recent unprocessed raw events
  const recentEvents = getRawEvents({ processed: false, limit: 1000 });
  const seenPayloadHashes = new Set<string>(
    recentEvents
      .map(e => (e.payload as any)?.dedup_hash)
      .filter((h): h is string => !!h)
  );

  const results = await Promise.allSettled(
    ON3_FEEDS.map(feed =>
      processFeed(feed.url, feed.label, feed.league, seenPayloadHashes)
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
      console.warn(`[on3] Feed failed: ${result.reason}`);
    }
  }

  if (failures > 0) {
    console.warn(`[on3] ${failures}/${ON3_FEEDS.length} feeds failed`);
  }

  console.log(`[on3] ${totalCreated} RawEvents created, ${totalSkipped} skipped`);
  return { created: totalCreated, skipped: totalSkipped };
}
