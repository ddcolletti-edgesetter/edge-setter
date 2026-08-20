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

/** Shared-budget check for other adapters (e.g. CFB school SID X polling)
 *  that fetch through this module's rate-limit window. */
export function xSearchRateLimited(): boolean {
  return !BEARER_TOKEN || isRateLimited();
}

function recordRequest() {
  _requestsThisWindow++;
}

// ─── Fetch-outcome metrics ──────────────────────────────────────────────────────
// Tally WHY fetches fail so a broken token / depleted credits / rate cap is
// legible in logs and health checks instead of vanishing into empty arrays.
export interface XFetchStats {
  ok: number;             // 200 with >=1 tweet
  empty: number;          // 200 with zero tweets
  no_token: number;       // TWITTER_BEARER_TOKEN unset
  rate_limited: number;   // 429
  auth_error: number;     // 401 / 403 — token rejected / forbidden
  usage_cap: number;      // 402 — credits depleted / billing
  http_error: number;     // other non-2xx
  network_error: number;  // fetch threw
  last_error?: string;    // most recent classified failure + body snippet
}

const _fetchStats: XFetchStats = {
  ok: 0, empty: 0, no_token: 0, rate_limited: 0,
  auth_error: 0, usage_cap: 0, http_error: 0, network_error: 0,
};

export function getXFetchStats(): XFetchStats { return { ..._fetchStats }; }

/** Human-readable failure class for a non-2xx X API response. */
function classifyXStatus(status: number, body: string): string {
  if (status === 401) return "AUTH_INVALID (401) — bearer token rejected; regenerate it";
  if (status === 403) return "FORBIDDEN (403) — app suspended or wrong access tier";
  if (status === 402 || /credits.?depleted|usage.?cap/i.test(body))
    return "USAGE_CAP (402) — X API credits depleted / billing; NOT a token issue";
  if (status === 429) return "RATE_LIMITED (429)";
  return `HTTP_${status}`;
}

// ─── X API fetch ──────────────────────────────────────────────────────────────

export interface XTweet {
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


export async function fetchRecentTweets(
  username: string,
  maxResults = 10,
): Promise<XTweet[]> {
  if (!BEARER_TOKEN) { _fetchStats.no_token++; return []; }
  if (isRateLimited()) { _fetchStats.rate_limited++; return []; }

  try {
    const params = new URLSearchParams({
      query: `from:${username} -is:retweet -is:reply`,
      max_results: String(Math.min(maxResults, 10)),
      "tweet.fields": "created_at,author_id",
    });

    const res = await fetch(
      `${X_API_BASE}/tweets/search/recent?${params}`,
      { headers: { Authorization: `Bearer ${BEARER_TOKEN}` } }
    );
    recordRequest();

    if (res.status === 429) {
      const reset = res.headers.get("x-rate-limit-reset");
      if (reset) _rateLimitResetAt = parseInt(reset) * 1000;
      _fetchStats.rate_limited++;
      console.warn(`[x-twitter] Rate limited (429) fetching tweets for ${username}`);
      return [];
    }

    if (!res.ok) {
      // Read the body: X returns a JSON problem doc whose title/detail explains
      // WHY (e.g. {"detail":"credits depleted"}). Dropping it — as before — made
      // a billing/token outage indistinguishable from a transient blip.
      let body = "";
      try { body = await res.text(); } catch { /* ignore */ }
      const reason = classifyXStatus(res.status, body);
      if (res.status === 401 || res.status === 403) _fetchStats.auth_error++;
      else if (res.status === 402 || /credits.?depleted|usage.?cap/i.test(body)) _fetchStats.usage_cap++;
      else _fetchStats.http_error++;
      _fetchStats.last_error = `${reason} :: ${body.slice(0, 200)}`;
      console.warn(`[x-twitter] ${reason} for ${username} — ${body.slice(0, 200)}`);
      return [];
    }

    const data = await res.json() as XTimelineResponse;
    const tweets = (data.data ?? []).map(t => ({ ...t, author_username: username }));
    if (tweets.length === 0) _fetchStats.empty++; else _fetchStats.ok++;
    return tweets;
  } catch (err: any) {
    _fetchStats.network_error++;
    _fetchStats.last_error = `NETWORK :: ${err.message}`;
    console.warn(`[x-twitter] Network error for ${username}: ${err.message}`);
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
  excludeOutlet: string | null = null,
): boolean {
  if (!playerName) return false;
  return recentEvents.some(e => {
    const payload = e.payload as any;
    if (!(
      e.player === playerName &&
      payload?.signal_type === signalType &&
      (payload?.on3_feed !== undefined ||
       payload?.sports247_feed !== undefined ||
       payload?.source_type === "rss")
    )) {
      return false;
    }
    // Guard against false corroboration: an insider's outlet republishing
    // their own reporting on the wire (e.g. Schefter on X + ESPN NFL RSS)
    // is the same underlying source, not independent confirmation. Skip
    // any RSS item whose feed-level label matches the insider's outlet.
    if (excludeOutlet) {
      const labels: string[] = payload?.source_labels ?? [];
      const sameOutlet = labels.some((l: string) =>
        l.toLowerCase().includes(excludeOutlet.toLowerCase())
      );
      if (sameOutlet) return false;
    }
    return true;
  });
}

// ─── Poll one account ─────────────────────────────────────────────────────────

async function pollAccount(
  source: XSourceAccount,
  recentEvents: any[],
  seenHashes: Set<string>,
): Promise<{ created: number; skipped: number; noise: number }> {
  const tweets = await fetchRecentTweets(source.handle);
  if (tweets.length === 0) return { created: 0, skipped: 0, noise: 0 };

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
    const isCorroborated = checkCorroboration(player, classified.signalType, recentEvents, source.outlet);
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
            // Canonical name — must match source_scores.source_name for
            // downstream joins (e.g. getVerifiedCountBySource). Display
            // formatting with the handle lives in source_labels, not here.
            name: source.name,
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
  console.log('[x-twitter] token present:', !!process.env.TWITTER_BEARER_TOKEN, 'length:', process.env.TWITTER_BEARER_TOKEN?.length ?? 0);
  if (!BEARER_TOKEN) {
    console.warn("[x-twitter] TWITTER_BEARER_TOKEN not set — skipping");
    return { created: 0, skipped: 0, noise: 0, rate_limited: false };
  }

  const sources = [
    ...ALL_NFL_SOURCES.filter((s: XSourceAccount) => s.tier === "tier1"),
    ...ALL_CFB_SOURCES.filter((s: XSourceAccount) => s.tier === "tier1"),
  ].filter((s: XSourceAccount) => !league || s.league === league || s.league === "BOTH");

  // Dedupe — some sources appear in both lists
  const unique = [...new Map(sources.map((s: XSourceAccount) => [s.handle, s])).values()];

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
  console.log(`[x-twitter] Tier1 fetch stats: ${JSON.stringify(getXFetchStats())}`);
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
    ...ALL_NFL_SOURCES.filter((s: XSourceAccount) => s.tier === "tier2"),
    ...ALL_CFB_SOURCES.filter((s: XSourceAccount) => s.tier === "tier2"),
  ].filter((s: XSourceAccount) => !league || s.league === league || s.league === "BOTH");

  const unique = [...new Map(sources.map((s: XSourceAccount) => [s.handle, s])).values()];

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
  console.log(`[x-twitter] Tier2 fetch stats: ${JSON.stringify(getXFetchStats())}`);
  return { created: totalCreated, skipped: totalSkipped, noise: totalNoise, rate_limited: false };
}
