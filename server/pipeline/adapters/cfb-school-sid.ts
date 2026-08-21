/**
 * Edge Setter — CFB School SID Adapter
 *
 * Polls every program in the cfb-school-sources manifest for eligibility
 * rulings, transfer waivers, coaching changes, and roster decisions. School
 * SID posts are the PRIMARY source for these events — wire services (ESPN, AP)
 * pick them up 20–60 minutes later. This is the Sorsby-gap adapter.
 *
 * Two source channels per school:
 *   1. pressReleaseFeed — athletics site news page (RSS / JSON-LD / HTML).
 *      Free and unmetered: every school, every cycle.
 *   2. sidTwitter — official athletics X account. Goes through the shared
 *      X API rate-limit window (15 req/15 min on Basic), so schools are
 *      polled in a round-robin batch each cycle rather than all at once.
 *      At 4 schools per 5-minute fast cycle, every program's X account is
 *      checked roughly every 45 minutes without starving tier1 nationals.
 *
 * Detection strategy:
 *   1. Fetch each school's pressReleaseFeed URL (+ this cycle's X batch)
 *   2. Scan headlines/tweets for eligibility / coaching / transfer keywords
 *   3. Emit RawEvents typed eligibility_ruling | coaching_change | transaction
 *   4. Dedup: SHA-1 of (abbreviation + text + date) kept in-process AND
 *      persisted in payload.dedup_hash so restarts don't re-emit (raw_events
 *      has no UNIQUE constraint — the seen set is the only duplicate guard).
 *
 * Eligibility keywords (from North Star established signal spec):
 *   eligible, eligibility, waiver, reinstate, cleared to play,
 *   granted eligibility, NCAA approved, transfer waiver
 *
 * Returns { created, skipped } matching the ingestion.ts adapter contract.
 */

import { POWER4_SOURCES, type SchoolSource } from "./cfb-school-sources";
import { insertRawEvent, getRawEvents } from "../store";
import { fetchRecentTweets, xSearchRateLimited } from "./x-twitter";
import { createHash } from "crypto";

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
  /\btransfer(?:red|ring)?\b/i,
  /\bsuspend(?:ed|s)?\b/i,
  /\bdismiss(?:ed|es)?\b/i,
];

export type SIDEventType = "eligibility_ruling" | "coaching_change" | "transaction";

export function classifyEventType(text: string): SIDEventType | null {
  if (/\btickets?\b/i.test(text)) return null;
  if (ELIGIBILITY_PATTERNS.some(p => p.test(text))) return "eligibility_ruling";
  if (COACHING_PATTERNS.some(p => p.test(text)))    return "coaching_change";
  if (TRANSFER_PATTERNS.some(p => p.test(text)))    return "transaction";
  return null; // not an actionable SID signal
}

// Eligibility confidence floor = 90 (North Star established signal spec).
// SID posts are primary sources — these are official statements, not rumors.
function confidenceFor(eventType: SIDEventType): number {
  if (eventType === "eligibility_ruling") return 90;
  if (eventType === "coaching_change")    return 85;
  return 75;
}

export function extractHeadlines(html: string, baseUrl: string): Array<{ title: string; url: string; date: string }> {
  const results: Array<{ title: string; url: string; date: string }> = [];
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set<string>();

  const add = (title: string, url: string, date: string) => {
    const key = title.slice(0, 60).toLowerCase();
    if (!seen.has(key) && title.length > 10) {
      seen.add(key);
      results.push({ title: title.trim(), url, date });
    }
  };

  // Strategy A — RSS/Atom
  const rssItems = Array.from(html.matchAll(/<item[\s\S]*?<\/item>/gi));
  for (const item of rssItems) {
    const titleM = item[0].match(/<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkM  = item[0].match(/<link>(.*?)<\/link>/i);
    const dateM  = item[0].match(/<pubDate>(.*?)<\/pubDate>/i);
    if (titleM) {
      const title = (titleM[1] || titleM[2] || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
      const url   = linkM?.[1]?.trim() ?? baseUrl;
      const date  = dateM?.[1] ? new Date(dateM[1]).toISOString().slice(0, 10) : today;
      add(title, url, date);
    }
  }
  if (results.length > 0) return results;

  // Strategy B — JSON-LD
  const jsonLdMatches = Array.from(html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi));
  for (const match of jsonLdMatches) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item.headline && typeof item.headline === "string") {
          const url  = item.url ?? item.mainEntityOfPage?.["@id"] ?? baseUrl;
          const date = item.datePublished?.slice(0, 10) ?? today;
          add(item.headline, url, date);
        }
        if (item["@type"] === "ItemList" && Array.isArray(item.itemListElement)) {
          for (const el of item.itemListElement) {
            if (el.name) add(el.name, el.url ?? baseUrl, today);
          }
        }
      }
    } catch { /* malformed JSON-LD — skip */ }
  }
  if (results.length > 0) return results;

  // Strategy C — og:title
  const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
                ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i);
  if (ogTitle?.[1]) {
    const ogUrl = html.match(/<meta[^>]+property="og:url"[^>]+content="([^"]+)"/i)?.[1] ?? baseUrl;
    add(ogTitle[1], ogUrl, today);
  }

  // Strategy D — HTML anchor fallback
  const anchorRe = /<a\s[^>]*href="([^"]*)"[^>]*>\s*([^<]{15,200})\s*<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const [, href, text] = m;
    if (/\/tickets?(?:\/|\?|$)|\/parking|\/donate|\/shop/i.test(href)) continue;
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length < 15 || clean.length > 250) continue;
    if (/^(home|news|schedule|roster|tickets|donate|shop|give|about|contact|athletics)/i.test(clean)) continue;
    const fullUrl = href.startsWith("http") ? href : new URL(href, baseUrl).toString();
    add(clean, fullUrl, today);
  }

  return results.slice(0, 20);
}

export function extractPlayerName(headline: string): string | null {
  const h = headline.trim();

  const leadName = h.match(
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+(?:cleared|ruled|reinstated|granted|will|expected|named|suspended|dismissed)/
  );
  if (leadName) return leadName[1];

  // Verbs match either case, but the name capture stays case-sensitive — an
  // /i flag here lets [A-Z][a-z]+ swallow lowercase words like "eligibility".
  const grantsClear = h.match(
    /(?:[Gg]rants?|[Cc]lears?|[Rr]einstates?|[Aa]pproves?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+(?:eligibility|to\s+play|for|immediately)/
  );
  if (grantsClear) return grantsClear[1];

  const receives = h.match(
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+(?:[Rr]eceives?|[Ee]arns?|[Gg]ets?|[Oo]btains?)\s+(?:eligibility|waiver|clearance)/
  );
  if (receives) return receives[1];

  const forName = h.match(
    /\bfor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})(?:\s*$|[,.])/
  );
  if (forName) return forName[1];

  return null;
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

/* ─── Dedup ──────────────────────────────────────────────────────────────────
 * raw_events has no UNIQUE constraint, so duplicates are guarded here:
 * in-process set for this server's lifetime, seeded each run from the
 * dedup_hash field of recent unprocessed raw events (survives restarts). */

const _seenHashes = new Set<string>();

function itemHash(school: SchoolSource, text: string, date: string): string {
  return createHash("sha1")
    .update(`${school.abbreviation}|${text.toLowerCase()}|${date.substring(0, 10)}`)
    .digest("hex")
    .substring(0, 16);
}

function seedSeenHashesFromStore(): void {
  const recentEvents = getRawEvents({ processed: false, limit: 1000 });
  for (const event of recentEvents) {
    const hash = (event.payload as any)?.dedup_hash;
    if (typeof hash === "string" && hash) _seenHashes.add(hash);
  }
}

/* ─── Store one classified item ──────────────────────────────────────────── */

function storeSIDEvent(opts: {
  school: SchoolSource;
  eventType: SIDEventType;
  text: string;
  sourceUrl: string;
  publishedAt: string;
  channel: "press_release" | "sid_twitter";
  hash: string;
}): boolean {
  const { school, eventType, text, sourceUrl, publishedAt, channel, hash } = opts;
  const confidence = confidenceFor(eventType);
  const sourceLabel = channel === "sid_twitter"
    ? `${school.school} Athletics (${school.sidTwitter})`
    : `${school.school} Athletics`;

  try {
    insertRawEvent({
      source_id:   `sid_${school.abbreviation.toLowerCase()}`,
      source_type: "scrape",
      league:      "CFB",
      team:        school.abbreviation,
      player:      extractPlayerName(text),
      game_id:     null,
      event_type:  eventType,
      payload: {
        headline:      text.substring(0, 200),
        notes:         text,
        source_url:    sourceUrl,
        published_at:  publishedAt,
        confidence,
        confirmation:  "Corroborated",
        verdict:       "confirmed",
        // eligibility_ruling bypasses isRoutineRosterMove suppression (processor.ts)
        signal_type:   eventType,
        source_types:  ["school_sid", channel === "sid_twitter" ? "social" : "scrape"],
        source_labels: [sourceLabel],
        source_count:  1,
        sources: [{
          id:   `sid_${school.abbreviation.toLowerCase()}`,
          name: sourceLabel,
          type: channel === "sid_twitter" ? "social" : "scrape",
        }],
        school:        school.school,
        conference:    school.conference,
        sid_channel:   channel,
        dedup_hash:    hash,
      },
    });
    return true;
  } catch (err: any) {
    console.warn(`[cfb-sid] Failed to store event for ${school.school}: ${err.message}`);
    return false;
  }
}

/* ─── Channel 1: press release feed ──────────────────────────────────────── */

async function pollSchoolFeed(school: SchoolSource): Promise<{ created: number; skipped: number }> {
  const html = await fetchFeed(school.pressReleaseFeed);
  if (!html) return { created: 0, skipped: 0 };

  const items = extractHeadlines(html, school.pressReleaseFeed);
  let created = 0;
  let skipped = 0;

  for (const item of items) {
    const eventType = classifyEventType(item.title);
    if (!eventType) continue;

    const hash = itemHash(school, item.title, item.date);
    if (_seenHashes.has(hash)) {
      skipped++;
      continue;
    }
    _seenHashes.add(hash);

    if (storeSIDEvent({
      school,
      eventType,
      text: item.title,
      sourceUrl: item.url,
      publishedAt: item.date,
      channel: "press_release",
      hash,
    })) created++;
    else skipped++;
  }

  return { created, skipped };
}

/* ─── Channel 2: SID X/Twitter account ───────────────────────────────────── */

async function pollSchoolTwitter(school: SchoolSource): Promise<{ created: number; skipped: number }> {
  const handle = school.sidTwitter.replace(/^@/, "");
  const tweets = await fetchRecentTweets(handle);
  let created = 0;
  let skipped = 0;

  for (const tweet of tweets) {
    const eventType = classifyEventType(tweet.text);
    if (!eventType) continue;

    const date = tweet.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const hash = itemHash(school, tweet.text.slice(0, 120), date);
    if (_seenHashes.has(hash)) {
      skipped++;
      continue;
    }
    _seenHashes.add(hash);

    if (storeSIDEvent({
      school,
      eventType,
      text: tweet.text,
      sourceUrl: `https://x.com/${handle}/status/${tweet.id}`,
      publishedAt: tweet.created_at ?? new Date().toISOString(),
      channel: "sid_twitter",
      hash,
    })) created++;
    else skipped++;
  }

  return { created, skipped };
}

// Round-robin cursor: which slice of the manifest gets its X account polled
// this cycle. The X Basic tier shares a 15-req/15-min window with tier1/tier2
// nationals, so SID accounts take a small fixed batch per cycle.
const SID_X_BATCH_SIZE = 4;
let _xCursor = 0;

function nextTwitterBatch(): SchoolSource[] {
  if (POWER4_SOURCES.length === 0) return [];
  const batch: SchoolSource[] = [];
  for (let i = 0; i < Math.min(SID_X_BATCH_SIZE, POWER4_SOURCES.length); i++) {
    batch.push(POWER4_SOURCES[(_xCursor + i) % POWER4_SOURCES.length]);
  }
  _xCursor = (_xCursor + batch.length) % POWER4_SOURCES.length;
  return batch;
}

/* ─── Main export — called by ingestion.ts ───────────────────────────────── */

/**
 * Polls every school in the manifest:
 *   - press release feeds concurrently (per-school timeout: 8s)
 *   - this cycle's round-robin batch of SID X accounts (shared rate budget)
 * Failures on individual schools do not block others.
 */
export async function ingestCFBSchoolSIDFeeds(): Promise<{ created: number; skipped: number }> {
  seedSeenHashesFromStore();

  const feedResults = await Promise.allSettled(
    POWER4_SOURCES.map(school => pollSchoolFeed(school))
  );

  let totalCreated = 0;
  let totalSkipped = 0;
  let failures = 0;

  for (const result of feedResults) {
    if (result.status === "fulfilled") {
      totalCreated += result.value.created;
      totalSkipped += result.value.skipped;
    } else {
      failures++;
    }
  }

  if (failures > 0) {
    console.warn(`[cfb-sid] ${failures}/${POWER4_SOURCES.length} school press feeds failed`);
  }

  // SID X accounts: sequential within the shared rate window, stop when capped
  for (const school of nextTwitterBatch()) {
    if (xSearchRateLimited()) break;
    try {
      const result = await pollSchoolTwitter(school);
      totalCreated += result.created;
      totalSkipped += result.skipped;
    } catch (err: any) {
      console.warn(`[cfb-sid] X poll failed for ${school.school}: ${err.message}`);
    }
  }

  if (totalCreated > 0) {
    console.log(`[cfb-sid] ${totalCreated} RawEvents created, ${totalSkipped} skipped across ${POWER4_SOURCES.length} schools`);
  }

  return { created: totalCreated, skipped: totalSkipped };
}
