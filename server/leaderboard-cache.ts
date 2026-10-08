/**
 * Edge Setter — 60s TTL cache in front of GET /api/leaderboard.
 *
 * WHY THIS ENDPOINT, AND WHY ONLY A TTL
 * The Oct 2026 request-path audit measured /api/leaderboard at 1,201ms cold and
 * 33ms warm, over four statements. That is nowhere near the 22.6s that forced
 * /api/v2/situations into a worker thread, and it is nowhere near Render's 5s
 * health-check budget — so it does not need a worker, a build queue or a
 * stale-while-revalidate state machine. It needs to stop paying the cold cost on
 * every request.
 *
 * WHERE THE 1.2s IS. `getVerifiedCountBySource` runs
 *
 *     SELECT json_extract(src.value, '$.name'), COUNT(*)
 *     FROM settled_outcomes, json_each(sources) AS src
 *     WHERE hit IS NOT NULL AND excluded_stale = 0
 *     GROUP BY json_extract(src.value, '$.name')
 *
 * which is a full scan of settled_outcomes (75k rows on prod) that parses the
 * `sources` JSON of every row. There is no index that helps a json_each
 * expansion, and the answer is a ~36-row aggregate over the whole table — it
 * changes when settlement runs, not when someone loads the page.
 *
 * NO STALE-WHILE-REVALIDATE, deliberately. better-sqlite3 is synchronous, so
 * "rebuild in the background" has no background to rebuild in: the rebuild would
 * block the loop exactly as the request does. A plain TTL is the whole design —
 * the first request after 60s pays 1.2s, every other request pays nothing.
 *
 * STALENESS IS BOUNDED AT 60s. The leaderboard is an accuracy ledger over
 * settled outcomes; settlement runs on the 15-minute standard tier. A number
 * that moves four times an hour being up to a minute old is not a correctness
 * question. LEADERBOARD_CACHE_TTL_MS retunes it without a deploy, and 0 turns
 * the cache off.
 */
import { storage, getVerifiedCountBySource } from "./storage";

export interface LeaderboardRow {
  readonly source_name: string;
  readonly verified_count: number;
  readonly [column: string]: unknown;
}

export type LeaderboardCacheState = "fresh" | "cold";

export interface LeaderboardResult {
  readonly rows: readonly LeaderboardRow[];
  readonly state: LeaderboardCacheState;
  /** Age of the rows in ms; 0 for rows built by this request. */
  readonly ageMs: number;
}

function ttlMs(): number {
  const raw = Number(process.env.LEADERBOARD_CACHE_TTL_MS);
  if (!Number.isFinite(raw)) return 60_000;
  return Math.min(3_600_000, Math.max(0, Math.round(raw)));
}

let cached: { rows: readonly LeaderboardRow[]; builtAt: number } | null = null;

/**
 * The leaderboard, exactly as the route returned it before this cache existed:
 * every source score, with the verified-outcome count for that source name.
 */
function buildLeaderboard(): readonly LeaderboardRow[] {
  const scores = storage.getSourceScores();
  const verified = getVerifiedCountBySource();
  // Frozen because the rows outlive the request that built them now. The only
  // consumer is res.json, which does not mutate — but a future one that did
  // would corrupt every later response instead of its own, and that is a bug
  // worth making impossible rather than documenting.
  return Object.freeze(scores.map((score) => Object.freeze({
    ...score,
    verified_count: verified.get(score.source_name) ?? 0,
  }) as LeaderboardRow));
}

export function getLeaderboard(): LeaderboardResult {
  const ttl = ttlMs();
  const now = Date.now();
  if (cached && ttl > 0) {
    const ageMs = now - cached.builtAt;
    if (ageMs < ttl) return { rows: cached.rows, state: "fresh", ageMs };
  }
  const rows = buildLeaderboard();
  cached = { rows, builtAt: Date.now() };
  return { rows, state: "cold", ageMs: 0 };
}

/** Drop the cached rows. For tests, and for anything that settles outcomes. */
export function resetLeaderboardCache(): void {
  cached = null;
}
