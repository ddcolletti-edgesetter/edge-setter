import type {
  ReplayIntelligenceSnapshotContract,
} from "./replay-intelligence-contract";

export interface ReplayIntelligenceCacheEntry {
  cache_key: string;

  snapshot:
    ReplayIntelligenceSnapshotContract;

  created_at: string;
  expires_at: string;

  access_count: number;
  last_accessed_at: string;
}

export interface ReplayIntelligenceCacheStore {
  entries: ReplayIntelligenceCacheEntry[];

  total_entries: number;

  generated_at: string;
}

const replayIntelligenceCache =
  new Map<
    string,
    ReplayIntelligenceCacheEntry
  >();

function buildExpirationDate(
  ttlMinutes: number,
): string {
  return new Date(
    Date.now() +
      ttlMinutes * 60 * 1000,
  ).toISOString();
}

export function cacheReplaySnapshot(
  cacheKey: string,
  snapshot: ReplayIntelligenceSnapshotContract,
  ttlMinutes = 60,
): ReplayIntelligenceCacheEntry {
  const now =
    new Date().toISOString();

  const entry: ReplayIntelligenceCacheEntry =
    {
      cache_key: cacheKey,

      snapshot,

      created_at: now,

      expires_at:
        buildExpirationDate(
          ttlMinutes,
        ),

      access_count: 0,

      last_accessed_at: now,
    };

  replayIntelligenceCache.set(
    cacheKey,
    entry,
  );

  return entry;
}

export function getCachedReplaySnapshot(
  cacheKey: string,
): ReplayIntelligenceCacheEntry | null {
  const existing =
    replayIntelligenceCache.get(
      cacheKey,
    );

  if (!existing) {
    return null;
  }

  const now = Date.now();

  const expiration =
    new Date(
      existing.expires_at,
    ).getTime();

  if (expiration <= now) {
    replayIntelligenceCache.delete(
      cacheKey,
    );

    return null;
  }

  existing.access_count += 1;

  existing.last_accessed_at =
    new Date().toISOString();

  replayIntelligenceCache.set(
    cacheKey,
    existing,
  );

  return existing;
}

export function clearReplaySnapshotCache(): void {
  replayIntelligenceCache.clear();
}

export function getReplaySnapshotCacheStore():
  ReplayIntelligenceCacheStore {
  return {
    entries: Array.from(
      replayIntelligenceCache.values(),
    ),

    total_entries:
      replayIntelligenceCache.size,

    generated_at:
      new Date().toISOString(),
  };
}

export function pruneExpiredReplaySnapshots():
  number {
  const now = Date.now();

  let removed = 0;

  replayIntelligenceCache.forEach(
    (entry, key) => {
      const expiration =
        new Date(
          entry.expires_at,
        ).getTime();

      if (expiration <= now) {
        replayIntelligenceCache.delete(
          key,
        );

        removed += 1;
      }
    },
  );

  return removed;
}