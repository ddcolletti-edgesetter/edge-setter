/**
 * Event-loop lag monitor.
 *
 * Why: Render killed the instance repeatedly (Sept 22 2026, ~10:20-10:35 PM PT)
 * with "HTTP health check failed (timed out after 5 seconds)" while the health
 * endpoint itself answers in 2-30ms. That means the event loop was blocked
 * (better-sqlite3 is synchronous; large JSON work is synchronous). This module
 * detects blocks and logs what was running at the time, so the real blocker is
 * identified from production data instead of guessed.
 *
 * How: a timer is scheduled every CHECK_MS. If it fires more than
 * WARN_THRESHOLD_MS late, the loop was blocked for roughly that long. We log the
 * lag plus every tracked job and in-flight request that was active during it.
 * A job being listed doesn't prove it caused the block, but repeated
 * appearances across events will.
 */

const CHECK_MS = 500;
const WARN_THRESHOLD_MS = 1000;

const activeJobs = new Map<number, { name: string; startedAt: number }>();
const inFlightRequests = new Map<number, { name: string; startedAt: number }>();
let nextId = 1;

/** Wrap a scheduled job so it shows up in lag reports while it runs. */
export async function trackJob<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
  const id = nextId++;
  activeJobs.set(id, { name, startedAt: Date.now() });
  try {
    return await fn();
  } finally {
    activeJobs.delete(id);
  }
}

/** Called by the request logger middleware. Returns a function to call on finish. */
export function trackRequest(label: string): () => void {
  const id = nextId++;
  inFlightRequests.set(id, { name: label, startedAt: Date.now() });
  return () => {
    inFlightRequests.delete(id);
  };
}

function describe(map: Map<number, { name: string; startedAt: number }>): string {
  const now = Date.now();
  const parts = Array.from(map.values()).map((v) => `${v.name} (${now - v.startedAt}ms)`);
  return parts.length ? parts.join(", ") : "none";
}

let started = false;

export function startEventLoopMonitor(): void {
  if (started) return;
  started = true;
  let expected = Date.now() + CHECK_MS;
  const timer = setInterval(() => {
    const now = Date.now();
    const lag = now - expected;
    expected = now + CHECK_MS;
    if (lag >= WARN_THRESHOLD_MS) {
      console.warn(
        `[loop-lag] event loop blocked ~${lag}ms | jobs: ${describe(activeJobs)} | requests: ${describe(inFlightRequests)}`,
      );
    }
  }, CHECK_MS);
  timer.unref();
  console.log(`[loop-lag] monitor started (check every ${CHECK_MS}ms, warn at >=${WARN_THRESHOLD_MS}ms)`);
}
