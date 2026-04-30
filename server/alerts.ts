/**
 * Edge Setter — Signal Alert Dispatcher
 *
 * Called after each ingestion cycle's processRawEvents() step.
 *
 * For each new high-confidence signal (score ≥ 70, betting_relevance=1,
 * alerted_at IS NULL), finds active Pro users whose alert preferences
 * match and delivers via email (Resend) and/or Web Push.
 *
 * De-dup guard: live_signals.alerted_at — stamped on first dispatch.
 * A signal is never dispatched more than once regardless of cycle count.
 */

import { getPipelineDb } from "./pipeline/store";
import { sendSignalAlert } from "./email";
import { getActiveAlertUsers, getPushSubscriptions } from "./storage";
import type { LiveSignal } from "./pipeline/types";

/* ─── Web Push (optional dependency) ─────────────────────── */

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_EMAIL   = process.env.VAPID_EMAIL ?? "mailto:hello@edgesetter.com";

async function getWebPush() {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return null;
  try {
    const mod = await import("web-push");
    const wp  = (mod as any).default ?? mod;
    wp.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
    return wp;
  } catch {
    return null;
  }
}

async function sendPush(
  endpoint: string, p256dh: string, auth: string,
  signal: LiveSignal,
): Promise<void> {
  const wp = await getWebPush();
  if (!wp) return;
  try {
    await wp.sendNotification(
      { endpoint, keys: { p256dh, auth } },
      JSON.stringify({
        title: `Edge Setter — ${signal.urgency_label}`,
        body:  signal.headline,
        data:  { signalId: signal.id, league: signal.league },
      }),
    );
  } catch (err: any) {
    // Expired/invalid subscription — caller handles cleanup
    if (err.statusCode === 410) throw err;
    console.warn("[alerts] Push failed:", err.message);
  }
}

/* ─── Ensure alerted_at column exists ────────────────────── */

function ensureAlertedAt(db: ReturnType<typeof getPipelineDb>) {
  try {
    const cols = (db.prepare("PRAGMA table_info(live_signals)").all() as any[]).map((c: any) => c.name);
    if (!cols.includes("alerted_at")) {
      db.prepare("ALTER TABLE live_signals ADD COLUMN alerted_at TEXT").run();
    }
  } catch { /**/ }
}

/* ─── Main dispatch ───────────────────────────────────────── */

export async function dispatchSignalAlerts(): Promise<{
  dispatched: number;
  users_notified: number;
}> {
  let db: ReturnType<typeof getPipelineDb>;
  try { db = getPipelineDb(); } catch {
    return { dispatched: 0, users_notified: 0 };
  }

  ensureAlertedAt(db);

  // Signals created in the last 30 min, high-confidence, not yet alerted
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const rawSignals = db.prepare(`
    SELECT * FROM live_signals
    WHERE created_at >= ?
      AND score >= 70
      AND betting_relevance = 1
      AND alerted_at IS NULL
    ORDER BY score DESC
    LIMIT 20
  `).all(cutoff) as any[];

  if (rawSignals.length === 0) return { dispatched: 0, users_notified: 0 };

  // Active Pro users with preferences
  const alertUsers = getActiveAlertUsers();
  if (alertUsers.length === 0) return { dispatched: 0, users_notified: 0 };

  // Push subscriptions keyed by user email
  const allPushSubs = getPushSubscriptions();
  const pushByEmail = new Map<string, typeof allPushSubs>();
  for (const sub of allPushSubs) {
    if (!pushByEmail.has(sub.email)) pushByEmail.set(sub.email, []);
    pushByEmail.get(sub.email)!.push(sub);
  }

  let dispatched = 0;
  const notifiedEmails = new Set<string>();

  for (const raw of rawSignals) {
    const signal: LiveSignal = {
      ...raw,
      sources:          JSON.parse(raw.sources       ?? "[]"),
      line_movement:    raw.line_movement ? JSON.parse(raw.line_movement) : null,
      breakdown:        JSON.parse(raw.breakdown      ?? "{}"),
      raw_event_ids:    JSON.parse(raw.raw_event_ids  ?? "[]"),
      betting_relevance: raw.betting_relevance === 1,
      fantasy_relevance: raw.fantasy_relevance === 1,
    };

    for (const user of alertUsers) {
      if (!user.leagues.includes(signal.league))              continue;
      if (user.signal_types.length > 0 &&
          !user.signal_types.includes(signal.signal_type))    continue;
      if (signal.score < user.min_confidence)                 continue;

      if (user.channels.includes("email")) {
        await sendSignalAlert(user.email, signal).catch(e =>
          console.warn(`[alerts] Email failed for ${user.email}:`, e.message)
        );
      }

      if (user.channels.includes("push")) {
        const subs = pushByEmail.get(user.email) ?? [];
        for (const sub of subs) {
          await sendPush(sub.endpoint, sub.p256dh, sub.auth, signal).catch(() => {});
        }
      }

      notifiedEmails.add(user.email);
    }

    // Stamp regardless of user matches — prevents re-dispatch on next cycle
    db.prepare("UPDATE live_signals SET alerted_at = ? WHERE id = ?")
      .run(new Date().toISOString(), raw.id);
    dispatched++;
  }

  if (dispatched > 0 || notifiedEmails.size > 0) {
    console.log(`[alerts] ${dispatched} signals dispatched to ${notifiedEmails.size} users`);
  }

  return { dispatched, users_notified: notifiedEmails.size };
}
