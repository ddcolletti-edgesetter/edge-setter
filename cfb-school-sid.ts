/**
 * Edge Setter — CFB School SID Adapter
 *
 * Polls Power 4 school press release feeds for eligibility rulings, transfer
 * waivers, and roster decisions. This is the primary source for these events —
 * wire services (ESPN, AP) pick them up 20–60 minutes later.
 *
 * This adapter closes the Sorsby gap: cfb-school-sources.ts was built but never
 * imported. This file is the import.
 *
 * Detection strategy:
 *   1. Fetch each school's pressReleaseFeed URL
 *   2. Scan HTML/text for eligibility ruling keywords
 *   3. Emit a raw event with type "eligibility_ruling" for any match not yet seen
 *   4. Deduplication: SHA-1 of (abbreviation + headline + date) stored in seen set
 *
 * Eligibility keywords (from North Star established signal spec):
 *   eligible, eligibility, waiver, reinstate, cleared to play,
 *   granted eligibility, NCAA approved, transfer waiver
 *
 * Returns { created, skipped } matching the ingestion.ts adapter contract.
 */

import { POWER4_SOURCES, type SchoolSource } from "./cfb-school-sources";
import { storage } from "../storage";
import { randomUUID, createHash } from "crypto";

const ELIGIBILITY_PATTERNS = [
  /\beligib(?:le|ility)\b/i,
  /\bwaiver\b/i,
  /\breinstate(?:d|ment)?\b/i,
  /\bcleared\s+to\s+play\b/i,
  /\bgranted\s+eligibility\b/i,
  /\bncaa\s+approved\b/i,
  /\btransfer\s+waiver\b/i,
  /\bimmediate(?:ly)?\s+eligible\b/i,
];

const COACHING_PATTERNS = [
  /\b(?:head\s+)?coach(?:ing\s+change)?\b/i,
  /\bhired\s+as\b/i,
  /\bfired\b/i,
  /\bparts\s+ways\b/i,
  /\bresign(?:s|ed)?\b/i,
];

const TRANSFER_PATTERNS = [
  /\benter(?:s|ed|ing)?\s+(?:the\s+)?transfer\s+portal\b/i,
  /\bcommitt(?:s|ed)?\s+to\b/i,
  /\btransfer(?:red|ring)?\b/i,
];

interface ExtractedItem {
  headline: string;
  url: string | null;
  body: string;
  publishedAt: string;
}

/**
 * Naive HTML/text headline extractor. Looks for <title>, <h1>, <h2>, and
 * news-list link text. Not a full DOM parser — fast and dependency-free.
 */
function extractHeadlines(html: string, baseUrl: string): ExtractedItem[] {
  const items: ExtractedItem[] = [];
  const now = new Date().toISOString();

  // <title> tag
  const titleMatch = html.match(/<title[^>]*>([^<]{10,200})<\/title>/i);
  if (titleMatch) {
    items.push({ headline: titleMatch[1].trim(), url: baseUrl, body: "", publishedAt: now });
  }

  // <h1> and <h2> tags
  const headingRe = /<h[12][^>]*>([^<]{10,200})<\/h[12]>/gi;
  let m;
  while ((m = headingRe.exec(html)) !== null) {
    items.push({ headline: m[1].trim(), url: baseUrl, body: "", publishedAt: now });
  }

  // <a href> within common news-list containers (li, article, .news-item)
  const linkRe = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([^<]{15,200})<\/a>/gi;
  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1].trim();
    const text = m[2].trim();
    if (text.length > 15 && !/^(Home|News|Football|Athletics|Menu|Search)$/i.test(text)) {
      const resolved = href.startsWith("http") ? href : `${new URL(baseUrl).origin}${href.startsWith("/") ? "" : "/"}${href}`;
      items.push({ headline: text, url: resolved, body: "", publishedAt: now });
    }
  }

  // RSS <item><title> (some schools use RSS feeds)
  const rssRe = /<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([^<\]]{10,200})(?:\]\]>)?<\/title>[\s\S]*?(?:<pubDate>([^<]+)<\/pubDate>)?[\s\S]*?(?:<link>([^<]+)<\/link>)?[\s\S]*?<\/item>/gi;
  while ((m = rssRe.exec(html)) !== null) {
    items.push({
      headline: m[1].trim(),
      url: m[3]?.trim() ?? baseUrl,
      body: "",
      publishedAt: m[2]?.trim() ?? now,
    });
  }

  // Deduplicate by headline text
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.headline.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchesEligibility(text: string): boolean {
  return ELIGIBILITY_PATTERNS.some(p => p.test(text));
}

function matchesCoaching(text: string): boolean {
  return COACHING_PATTERNS.some(p => p.test(text));
}

function matchesTransfer(text: string): boolean {
  return TRANSFER_PATTERNS.some(p => p.test(text));
}

function itemHash(school: SchoolSource, headline: string, date: string): string {
  return createHash("sha1")
    .update(`${school.abbreviation}|${headline}|${date.substring(0, 10)}`)
    .digest("hex")
    .substring(0, 16);
}

function classifyEventType(headline: string): "eligibility_ruling" | "coaching_change" | "transaction" {
  if (matchesEligibility(headline)) return "eligibility_ruling";
  if (matchesCoaching(headline)) return "coaching_change";
  return "transaction";
}

function extractPlayerName(headline: string, schoolName: string): string | null {
  // Simple heuristic: a name-like token before an action verb
  // "Brendan Sorsby granted eligibility" → "Brendan Sorsby"
  const nameRe = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:granted|cleared|ruled|reinstated|enters|commits|hired|fired)/;
  const m = headline.match(nameRe);
  return m ? m[1] : null;
}

async function fetchFeed(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "EdgeSetter-SIDMonitor/1.0 (sports intelligence aggregator)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** In-process dedup set. Resets on server restart — acceptable; events are
 *  idempotent via upsert in storage anyway. */
const _seenHashes = new Set<string>();

async function pollSchool(school: SchoolSource): Promise<{ created: number; skipped: number }> {
  const html = await fetchFeed(school.pressReleaseFeed);
  if (!html) return { created: 0, skipped: 0 };

  const items = extractHeadlines(html, school.pressReleaseFeed);
  let created = 0;
  let skipped = 0;

  for (const item of items) {
    const combined = `${item.headline} ${item.body}`;

    if (!matchesEligibility(combined) && !matchesCoaching(combined) && !matchesTransfer(combined)) {
      continue; // Not an actionable signal type
    }

    const hash = itemHash(school, item.headline, item.publishedAt);
    if (_seenHashes.has(hash)) {
      skipped++;
      continue;
    }
    _seenHashes.add(hash);

    const eventType = classifyEventType(combined);
    const player    = extractPlayerName(item.headline, school.school);

    // Eligibility confidence floor = 90 (North Star established signal spec)
    const confidence = eventType === "eligibility_ruling" ? 90 :
                       eventType === "coaching_change"    ? 85 : 75;

    try {
      storage.createRawEvent({
        id: randomUUID(),
        source_id:   `sid_${school.abbreviation.toLowerCase()}`,
        source_type: "school_sid",
        league:      "CFB",
        team:        school.abbreviation,
        player:      player ?? null,
        game_id:     null,
        event_type:  eventType,
        received_at: new Date().toISOString(),
        processed:   0,
        payload: JSON.stringify({
          headline:             item.headline,
          notes:                item.body || item.headline,
          source_url:           item.url,
          confidence,
          confirmation:         "Corroborated",
          verdict:              "confirmed",
          source_types:         ["school_sid"],
          source_labels:        [school.sidTwitter],
          // eligibility_ruling bypasses isRoutineRosterMove suppression (processor.ts)
          signal_type:          eventType,
          school:               school.school,
          conference:           school.conference,
        }),
      });
      created++;
    } catch (err: any) {
      // Duplicate key = already in DB from a prior cycle. Not an error.
      if (!err.message?.includes("UNIQUE")) {
        console.warn(`[cfb-sid] Failed to store event for ${school.school}: ${err.message}`);
      }
      skipped++;
    }
  }

  return { created, skipped };
}

/**
 * Main export — called by ingestion.ts.
 * Polls all Power 4 school SID feeds concurrently (per-school timeout: 8s).
 * Failures on individual schools do not block others.
 */
export async function ingestCFBSchoolSIDFeeds(): Promise<{ created: number; skipped: number }> {
  const results = await Promise.allSettled(
    POWER4_SOURCES.map(school => pollSchool(school))
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
    }
  }

  if (failures > 0) {
    console.warn(`[cfb-sid] ${failures}/${POWER4_SOURCES.length} school feeds failed`);
  }

  return { created: totalCreated, skipped: totalSkipped };
}
