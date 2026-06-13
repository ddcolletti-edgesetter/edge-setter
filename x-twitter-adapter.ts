/**
 * Edge Setter — X/Twitter Adapter
 *
 * Source: X API v2 (Basic tier)
 * Auth: Bearer Token (app-only, read-only)
 *
 * Polls curated high-signal accounts for CFB and NFL breaking news.
 * Basic tier constraints:
 *   - 500k tweet reads/month (~16k/day)
 *   - 15-minute rate limit windows
 *   - Recent search: last 7 days only
 *   - No real-time filtered stream (Pro only)
 *
 * Strategy:
 *   - Tier 1 nationals polled every 15 min (matches ingestion cycle)
 *   - Tier 2 beats polled every 30 min (separate scheduler call)
 *   - Uses user timeline endpoint — pulls last 10 tweets per account
 *   - Deduplicates by tweet ID stored in seen set
 *   - Cross-references: if same player/event seen from 2+ sources → confidence bump
 *
 * Rate limit budget (Basic, 500k/month):
 *   - 12 tier1 accounts × 10 tweets × 96 cycles/day = 11,520/day
 *   - 60 tier2 accounts × 10 tweets × 48 cycles/day = 28,800/day
 *   - Total: ~40,320/day × 30 = ~1.2M/month
 *   - OVER BUDGET on tier2 at full frequency
 *   - Solution: tier2 polls only during active hours (8am-midnight ET = 16hrs)
 *     60 × 10 × 32 cycles = 19,200/day → safe
 */

import { insertRawEvent, getRawEvents } from "../store";
import { createHash } from "crypto";
import {
  ALL_NFL_SOURCES,
  ALL_CFB_SOURCES,
  getSourceByHandle,
  type XSourceAccount,
} from "./x-source-manifest";

const BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
const X_API_BASE   = "https://api.twitter.com/2";

// ─── Rate limit state ─────────────────────────────────────────────────────────

let _rateLimitResetAt: number = 0;
let _requestsThisWindow: number = 0;
const MAX_REQUESTS_PER_WINDOW = 15; // Basic tier: 15 requests per 15-min window

function isRateLimited(): boolean {
  if (Date.now() > _rateLimitResetAt) {
    _requestsThisWindow = 0;
    _rateLimitResetAt = Date.now() + 15 * 60 * 1000;
  }
  return _requestsThisWindow >= MAX_REQUESTS_PER_WINDOW;
}

function recordRequest() {
  _requestsThisWindow++;
}

// ─── X API fetch ──────────────────────────────────────────────────────────────

interface XTweet {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  author_username?: string;
}

interface XUserLookupResponse {
  data?: { id: string; username: string; name: string };
  errors?: Array<{ message: string }>;
}

interface XTimelineResponse {
  data?: XTweet[];
  meta?: { newest_id: string; oldest_id: string; result_count: number };
  errors?: Array<{ message: string }>;
}

// Cache username → user_id lookups to avoid repeated API calls
const _userIdCache = new Map<string, string>();

async function getUserId(username: string): Promise<string | null> {
  if (_userIdCache.has(username)) return _userIdCache.get(username)!;
  if (!BEARER_TOKEN) return null;
  if (isRateLimited()) return null;

  try {
    const res = await fetch(`${X_API_BASE}/users/by/username/${username}`, {
      headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
    });
    recordRequest();

    if (res.status === 429) {
      const reset = res.headers.get("x-rate-limit-reset");
      if (reset) _rateLimitResetAt = parseInt(reset) * 1000;
      console.warn(`[x-twitter] Rate limited fetching user ID for ${username}`);
      return null;
    }

    if (!res.ok) {
      console.warn(`[x-twitter] HTTP ${res.status} for user lookup: ${username}`);
      return null;
    }

    const data = await res.json() as XUserLookupResponse;
    if (data.data?.id) {
      _userIdCache.set(username, data.data.id);
      return data.data.id;
    }
    return null;
  } catch (err: any) {
    console.warn(`[x-twitter] User lookup error for ${username}: ${err.message}`);
    return null;
  }
}

async function fetchRecentTweets(
  userId: string,
  username: string,
  sinceId?: string,
  maxResults = 10,
): Promise<XTweet[]> {
  if (!BEARER_TOKEN) return [];
  if (isRateLimited()) {
    console.warn(`[x-twitter] Rate limited — skipping ${username}`);
    return [];
  }

  try {
    const params = new URLSearchParams({
      max_results: String(Math.min(maxResults, 100)),
      "tweet.fields": "created_at,author_id",
      expansions: "author_id",
      exclude: "retweets,replies", // only original tweets — signal, not noise
    });

    if (sinceId) params.set("since_id", sinceId);

    const res = await fetch(
      `${X_API_BASE}/users/${userId}/tweets?${params}`,
      { headers: { Authorization: `Bearer ${BEARER_TOKEN}` } }
    );
    recordRequest();

    if (res.status === 429) {
      const reset = res.headers.get("x-rate-limit-reset");
      if (reset) _rateLimitResetAt = parseInt(reset) * 1000;
      console.warn(`[x-twitter] Rate limited fetching tweets for ${username}`);
      return [];
    }

    if (!res.ok) {
      console.warn(`[x-twitter] HTTP ${res.status} fetching tweets for ${username}`);
      return [];
    }

    const data = await res.json() as XTimelineResponse;
    return (data.data ?? []).map(t => ({ ...t, author_username: username }));
  } catch (err: any) {
    console.warn(`[x-twitter] Timeline error for ${username}: ${err.message}`);
    return [];
  }
}

// ─── Signal classification ────────────────────────────────────────────────────

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
];

const INJURY_PATTERNS = [
  /\binjur(?:ed|y|ies)\b/i,
  /\btorn\s+(?:acl|mcl|achilles)\b/i,
  /\bout\s+(?:for\s+)?(?:season|year|game|sunday|monday|tonight)\b/i,
  /\bdoubtful\b/i,
  /\bquestionable\b/i,
  /\bsurger(?:y|ies)\b/i,
  /\bfractur(?:ed|e)\b/i,
  /\bplace(?:d)?\s+on\s+(?:the\s+)?(?:ir|il|injured\s+reserve)\b/i,
];

const TRANSACTION_PATTERNS = [
  /\btrad(?:ed|e)\b/i,
  /\bsign(?:ed|s|ing)\b/i,
  /\breleas(?:ed|e)\b/i,
  /\bcut\b/i,
  /\bwaiv(?:ed|er)\b/i,
  /\bfree\s+agent\b/i,
  /\bextension\b/i,
  /\bcontract\b/i,
  /\bdraft(?:ed)?\b/i,
];

const LINEUP_PATTERNS = [
  /\bstarting\b/i,
  /\bstarter\b/i,
  /\bdepth\s+chart\b/i,
  /\bscratched\b/i,
  /\bactive\b/i,
  /\binactive\b/i,
  /\bgame\s+time\s+decision\b/i,
  /\bgtd\b/i,
];

// High-impact position keywords — raise confidence floor
const HIGH_IMPACT_POSITIONS = [
  /\bQB\b/, /\bquarterback\b/i,
  /\bRB\b/, /\brunning\s+back\b/i,
  /\bWR1\b/, /\bstar\s+receiver\b/i,
  /\bcoach\b/i,
  /\bhead\s+coach\b/i,
];

type EventType = "eligibility_ruling" | "coaching_change" | "transaction" | "injury_update" | "lineup_change";

interface ClassifiedTweet {
  eventType: EventType;
  confidence: number;
  signalType: string;
  isHighImpact: boolean;
}

function classifyTweet(text: string, source: XSourceAccount): ClassifiedTweet {
  const isHighImpact = HIGH_IMPACT_POSITIONS.some(p => p.test(text));
  const tierBonus = source.tier === "tier1" ? 10 : source.tier === "tier2" ? 5 : 0;

  if (ELIGIBILITY_PATTERNS.some(p => p.test(text))) {
    return { eventType: "eligibility_ruling", confidence: Math.min(95, 90 + tierBonus), signalType: "eligibility_ruling", isHighImpact: true };
  }
  if (COACHING_PATTERNS.some(p => p.test(text))) {
    return { eventType: "coaching_change", confidence: Math.min(95, 82 + tierBonus), signalType: "coaching_change", isHighImpact: true };
  }
  if (INJURY_PATTERNS.some(p => p.test(text))) {
    const base = isHighImpact ? 80 : 72;
    return { eventType: "injury_update", confidence: Math.min(95, base + tierBonus), signalType: "injury_update", isHighImpact };
  }
  if (LINEUP_PATTERNS.some(p => p.test(text))) {
    return { eventType: "lineup_change", confidence: Math.min(90, 72 + tierBonus), signalType: "lineup_change", isHighImpact };
  }
  if (TRANSACTION_PATTERNS.some(p => p.test(text))) {
    return { eventType: "transaction", confidence: Math.min(92, 75 + tierBonus), signalType: "transaction", isHighImpact };
  }
  if (TRANSFER_PATTERNS.some(p => p.test(text))) {
    return { eventType: "transaction", confidence: Math.min(88, 78 + tierBonus), signalType: "transfer_portal", isHighImpact: false };
  }

  // Doesn't match any signal pattern — not worth storing
  return { eventType: "transaction", confidence: 0, signalType: "noise", isHighImpact: false };
}

function extractPlayerName(text: string): string | null {
  const patterns = [
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:is\s+)?(?:out|injured|traded|signs?|signed|committed?|enters?|granted|cleared|hired|fired)/,
    /(?:^|\n)([A-Z][a-z]+\s+[A-Z][a-z]+)\s+(?:has|is|will)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractTeam(text: string, source: XSourceAccount): string | null {
  // If source covers specific teams, check those first
  if (source.teams?.length === 1) return source.teams[0];

  // Common team abbreviations in tweet text
  const teamPatterns: [RegExp, string][] = [
    [/\b(Chiefs|KC)\b/i, "KC"], [/\b(Eagles|PHI)\b/i, "PHI"],
    [/\b(49ers|SF)\b/i, "SF"], [/\b(Bills|BUF)\b/i, "BUF"],
    [/\b(Cowboys|DAL)\b/i, "DAL"], [/\b(Ravens|BAL)\b/i, "BAL"],
    [/\b(Bengals|CIN)\b/i, "CIN"], [/\b(Rams|LAR)\b/i, "LAR"],
    [/\b(Dolphins|MIA)\b/i, "MIA"], [/\b(Packers|GB)\b/i, "GB"],
    [/\b(Lions|DET)\b/i, "DET"], [/\b(Bears|CHI)\b/i, "CHI"],
    [/\b(Vikings|MIN)\b/i, "MIN"], [/\b(Steelers|PIT)\b/i, "PIT"],
    [/\b(Browns|CLE)\b/i, "CLE"], [/\b(Texans|HOU)\b/i, "HOU"],
    [/\b(Colts|IND)\b/i, "IND"], [/\b(Jaguars|JAX)\b/i, "JAX"],
    [/\b(Titans|TEN)\b/i, "TEN"], [/\b(Broncos|DEN)\b/i, "DEN"],
    [/\b(Raiders|LV)\b/i, "LV"], [/\b(Chargers|LAC)\b/i, "LAC"],
    [/\b(Patriots|NE)\b/i, "NE"], [/\b(Jets|NYJ)\b/i, "NYJ"],
    [/\b(Giants|NYG)\b/i, "NYG"], [/\b(Commanders|WSH)\b/i, "WSH"],
    [/\b(Falcons|ATL)\b/i, "ATL"], [/\b(Panthers|CAR)\b/i, "CAR"],
    [/\b(Saints|NO)\b/i, "NO"], [/\b(Buccaneers|TB)\b/i, "TB"],
    [/\b(Seahawks|SEA)\b/i, "SEA"], [/\b(Cardinals|ARI)\b/i, "ARI"],
    // CFB
    [/\bAlabama\b/i, "ALA"], [/\bGeorgia\b/i, "UGA"],
    [/\bOhio\s+State\b/i, "OSU"], [/\bMichigan\b/i, "MICH"],
    [/\bTexas\s+A&M\b/i, "TAMU"], [/\bLSU\b/i, "LSU"],
    [/\bTennessee\b/i, "TENN"], [/\bOle\s+Miss\b/i, "MISS"],
    [/\bTexas\s+Tech\b/i, "TTU"], [/\bClemson\b/i, "CLEM"],
    [/\bFlorida\s+State\b/i, "FSU"], [/\bPenn\s+State\b/i, "PSU"],
  ];

  for (const [pattern, abbr] of teamPatterns) {
    if (pattern.test(text)) return abbr;
  }
  return null;
}

// ─── Dedup ────────────────────────────────────────────────────────────────────

const _seenTweetIds = new Set<string>();
// Persist since_id per account to avoid re-fetching old tweets
const _sinceIds = new Map<string, string>();

function tweetHash(tweetId: string): string {
  return createHash("sha1").update(tweetId).digest("hex").substring(0, 16);
}

// ─── Cross-source corroboration ───────────────────────────────────────────────

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
      (payload?.on3_feed !== undefined ||
       payload?.sports247_feed !== undefined ||
       payload?.source_type === "rss")
    );
  });
}

// ─── Poll one account ─────────────────────────────────────────────────────────

async function pollAccount(
  source: XSourceAccount,
  recentEvents: any[],
  seenHashes: Set<string>,
): Promise<{ created: number; skipped: number; noise: number }> {
  const userId = await getUserId(source.handle);
  if (!userId) return { created: 0, skipped: 0, noise: 0 };

  const sinceId = _sinceIds.get(source.handle);
  const tweets = await fetchRecentTweets(userId, source.handle, sinceId);

  if (tweets.length === 0) return { created: 0, skipped: 0, noise: 0 };

  // Update since_id to newest tweet seen
  const newestId = tweets[0]?.id;
  if (newestId) _sinceIds.set(source.handle, newestId);

  let created = 0;
  let skipped = 0;
  let noise = 0;

  for (const tweet of tweets) {
    if (_seenTweetIds.has(tweet.id)) { skipped++; continue; }

    const hash = tweetHash(tweet.id);
    if (seenHashes.has(hash)) { skipped++; continue; }

    const classified = classifyTweet(tweet.text, source);

    // Skip noise — no matching signal pattern
    if (classified.signalType === "noise" || classified.confidence === 0) {
      noise++;
      _seenTweetIds.add(tweet.id);
      continue;
    }

    const player = extractPlayerName(tweet.text);
    const team   = extractTeam(tweet.text, source);
    const league = source.league === "BOTH"
      ? (team && ["KC","PHI","SF","BUF","DAL"].includes(team) ? "NFL" : "CFB")
      : source.league;

    // Check corroboration from RSS sources
    const isCorroborated = checkCorroboration(player, classified.signalType, recentEvents);
    const finalConfidence = isCorroborated
      ? Math.min(98, classified.confidence + 5)
      : classified.confidence;

    const tweetUrl = `https://x.com/${source.handle}/status/${tweet.id}`;

    try {
      insertRawEvent({
        source_id:   `x_${source.handle.toLowerCase()}`,
        source_type: "scrape",
        league:      league as any,
        game_id:     null,
        team:        team ?? null,
        player:      player ?? null,
        event_type:  classified.eventType,
        payload: {
          headline:          tweet.text.substring(0, 200),
          notes:             tweet.text,
          source_url:        tweetUrl,
          published_at:      tweet.created_at,
          author:            source.name,
          author_handle:     source.handle,
          outlet:            source.outlet,
          confidence:        finalConfidence,
          confirmation:      isCorroborated ? "Corroborated"
            : source.tier === "tier1" ? "Corroborated"
            : "Developing",
          verdict:           finalConfidence >= 85 ? "confirmed" : "likely",
          signal_type:       classified.signalType,
          is_high_impact:    classified.isHighImpact,
          corroborated_by:   isCorroborated ? "rss_source" : null,
          source_tier:       source.tier,
          source_types:      ["x", "social"],
          source_labels:     [`${source.name} (@${source.handle})`],
          source_count:      isCorroborated ? 2 : 1,
          sources: [{
            id:   `x_${source.handle.toLowerCase()}`,
            name: `${source.name} (@${source.handle})`,
            type: "social",
          }],
          tweet_id:          tweet.id,
          dedup_hash:        hash,
        },
      });

      _seenTweetIds.add(tweet.id);
      created++;
    } catch (err: any) {
      if (!err.message?.includes("UNIQUE")) {
        console.warn(`[x-twitter] Failed to store tweet ${tweet.id}: ${err.message}`);
      }
      skipped++;
    }
  }

  return { created, skipped, noise };
}

// ─── Main exports ─────────────────────────────────────────────────────────────

/**
 * Poll tier 1 national insiders — called every 15 min (main ingestion cycle).
 * These break league-wide news first. Budget: ~11,520 reads/day.
 */
export async function ingestXTier1(
  league?: "NFL" | "CFB"
): Promise<{ created: number; skipped: number; noise: number; rate_limited: boolean }> {
  if (!BEARER_TOKEN) {
    console.warn("[x-twitter] TWITTER_BEARER_TOKEN not set — skipping");
    return { created: 0, skipped: 0, noise: 0, rate_limited: false };
  }

  const sources = [
    ...ALL_NFL_SOURCES.filter(s => s.tier === "tier1"),
    ...ALL_CFB_SOURCES.filter(s => s.tier === "tier1"),
  ].filter(s => !league || s.league === league || s.league === "BOTH");

  // Dedupe — some sources appear in both lists
  const unique = [...new Map(sources.map(s => [s.handle, s])).values()];

  const recentEvents = getRawEvents({ processed: false, limit: 1000 });
  const seenHashes = new Set<string>(
    recentEvents
      .map(e => (e.payload as any)?.dedup_hash)
      .filter((h): h is string => !!h)
  );

  let totalCreated = 0;
  let totalSkipped = 0;
  let totalNoise = 0;

  for (const source of unique) {
    if (isRateLimited()) {
      console.warn(`[x-twitter] Rate limit hit after ${totalCreated} created — stopping tier1 poll`);
      return { created: totalCreated, skipped: totalSkipped, noise: totalNoise, rate_limited: true };
    }

    const result = await pollAccount(source, recentEvents, seenHashes);
    totalCreated += result.created;
    totalSkipped += result.skipped;
    totalNoise   += result.noise;

    // Small delay between accounts to be a good API citizen
    await new Promise(r => setTimeout(r, 250));
  }

  console.log(`[x-twitter] Tier1: ${totalCreated} created, ${totalSkipped} skipped, ${totalNoise} noise filtered`);
  return { created: totalCreated, skipped: totalSkipped, noise: totalNoise, rate_limited: false };
}

/**
 * Poll tier 2 beat writers — called every 30 min during active hours only.
 * Team-specific injuries, depth chart, practice reports.
 * Budget: ~19,200 reads/day during active hours.
 */
export async function ingestXTier2(
  league?: "NFL" | "CFB"
): Promise<{ created: number; skipped: number; noise: number; rate_limited: boolean }> {
  if (!BEARER_TOKEN) {
    console.warn("[x-twitter] TWITTER_BEARER_TOKEN not set — skipping");
    return { created: 0, skipped: 0, noise: 0, rate_limited: false };
  }

  const sources = [
    ...ALL_NFL_SOURCES.filter(s => s.tier === "tier2"),
    ...ALL_CFB_SOURCES.filter(s => s.tier === "tier2"),
  ].filter(s => !league || s.league === league || s.league === "BOTH");

  const unique = [...new Map(sources.map(s => [s.handle, s])).values()];

  const recentEvents = getRawEvents({ processed: false, limit: 1000 });
  const seenHashes = new Set<string>(
    recentEvents
      .map(e => (e.payload as any)?.dedup_hash)
      .filter((h): h is string => !!h)
  );

  let totalCreated = 0;
  let totalSkipped = 0;
  let totalNoise = 0;

  for (const source of unique) {
    if (isRateLimited()) {
      console.warn(`[x-twitter] Rate limit hit after ${totalCreated} created — stopping tier2 poll`);
      return { created: totalCreated, skipped: totalSkipped, noise: totalNoise, rate_limited: true };
    }

    const result = await pollAccount(source, recentEvents, seenHashes);
    totalCreated += result.created;
    totalSkipped += result.skipped;
    totalNoise   += result.noise;

    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`[x-twitter] Tier2: ${totalCreated} created, ${totalSkipped} skipped, ${totalNoise} noise filtered`);
  return { created: totalCreated, skipped: totalSkipped, noise: totalNoise, rate_limited: false };
}
