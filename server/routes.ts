import type { Express } from "express";
import { Server } from "http";
import { storage, getStorageDb, getAlertPreferences, upsertAlertPreferences, getActiveAlertUsers, getPushSubscriptions, upsertPushSubscription, deletePushSubscription, getAllPipelineHealth, getAllBackfillProgress, getVerifiedCountBySource } from "./storage";
import { runFullBackfill } from "./pipeline/backfill";
import { insertSignalSchema, insertWaitlistSchema, type User } from "@shared/schema";
import { sendDailyDigest } from "./email";
import { runFullPipeline, qaAuditAgent, scoutAgent, clustererAgent, retrieverAgent, verifierAgent, sourceScorerAgent, publisherAgent } from "./agents";
import { runSignalOps, batchSignalOps } from "./signal-ops";
import { runSiteWatch } from "./site-watch";
import { runDistributionDraft } from "./distribution-draft";
import { runDailyOps } from "./daily-ops";
import { seedDemoData } from "./seed";
import { seedSignals } from "./seed-signals";
import { getStripe, STRIPE_PRO_PRICE_ID, STRIPE_WEBHOOK_SECRET } from "./stripe";
import { sendWaitlistConfirmation, sendProWelcome, sendBillingRetryEmail } from "./email";
import express from "express";
import { syncToSupabase } from "./supabase-sync";
import { isProUser } from "@shared/pro-utils";
import { getPipelineDb, archiveOldLiveSignals } from "./pipeline/store";
import type { LiveSignal } from "./pipeline/types";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import type Stripe from "stripe";

export function getAutoSeedOwnerEmail(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  return process.env.OWNER_EMAIL?.trim() || null;
}

export function getConfiguredAdminPassword(): string | null {
  return process.env.ADMIN_PASSWORD?.trim() || null;
}

function normalizeSubscriberEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

const BILLING_AUTH_COOKIE = "es_billing_auth";
const BILLING_AUTH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function getBillingAuthSecret(): string | null {
  const billingAuthSecret = process.env.BILLING_AUTH_SECRET?.trim() || null;
  if (process.env.NODE_ENV === "production") return billingAuthSecret;

  return (
    billingAuthSecret
      || process.env.SESSION_SECRET?.trim()
      || process.env.ADMIN_PASSWORD?.trim()
      || process.env.STRIPE_WEBHOOK_SECRET?.trim()
      || null
  );
}

function signBillingPortalIdentity(email: string, expiresAt: number, secret: string): string {
  return createHmac("sha256", secret).update(`${email}.${expiresAt}`).digest("base64url");
}

export function createBillingPortalIdentityToken(email: unknown, nowMs = Date.now()): string | null {
  const normalizedEmail = normalizeSubscriberEmail(email);
  const secret = getBillingAuthSecret();
  if (!normalizedEmail || !secret) return null;

  const expiresAt = nowMs + BILLING_AUTH_MAX_AGE_MS;
  const emailPart = Buffer.from(normalizedEmail, "utf8").toString("base64url");
  const signature = signBillingPortalIdentity(normalizedEmail, expiresAt, secret);
  return `${emailPart}.${expiresAt}.${signature}`;
}

export function verifyBillingPortalIdentityToken(token: unknown, nowMs = Date.now()): string | null {
  if (typeof token !== "string" || !token) return null;
  const secret = getBillingAuthSecret();
  if (!secret) return null;

  const [emailPart, expiresAtPart, signature] = token.split(".");
  if (!emailPart || !expiresAtPart || !signature) return null;

  const expiresAt = Number(expiresAtPart);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) return null;

  let email: string;
  try {
    email = normalizeSubscriberEmail(Buffer.from(emailPart, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!email) return null;

  const expected = signBillingPortalIdentity(email, expiresAt, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  return timingSafeEqual(actualBuffer, expectedBuffer) ? email : null;
}

function readCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  for (const item of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = item.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

function maskedEmail(email: unknown): string {
  const normalizedEmail = normalizeSubscriberEmail(email);
  if (!normalizedEmail) return "missing";
  const [name, domain] = normalizedEmail.split("@");
  const hash = createHash("sha256").update(normalizedEmail).digest("hex").slice(0, 10);
  return `${name?.slice(0, 2) ?? ""}***@${domain ?? "unknown"}#${hash}`;
}

function billingLog(route: string, fields: Record<string, unknown>) {
  console.log(`[billing:${route}] ${JSON.stringify(fields)}`);
}

function setBillingIdentityCookie(res: Response, email: string): boolean {
  const token = createBillingPortalIdentityToken(email);
  if (!token) return false;

  res.cookie(BILLING_AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: BILLING_AUTH_MAX_AGE_MS,
    path: "/",
  });
  return true;
}

type BillingPortalAuthorization =
  | { ok: true; email: string; user: User & { stripe_customer_id: string } }
  | { ok: false; status: 400 | 401 | 403 | 404; error: string };

export function authorizeBillingPortalAccess(
  requestedEmail: unknown,
  identityToken: unknown,
  getUserByEmail: (email: string) => User | undefined,
): BillingPortalAuthorization {
  const email = normalizeSubscriberEmail(requestedEmail);
  if (!email) return { ok: false, status: 400, error: "email required" };

  const verifiedEmail = verifyBillingPortalIdentityToken(identityToken);
  if (!verifiedEmail) return { ok: false, status: 401, error: "Authentication required" };
  if (verifiedEmail !== email) return { ok: false, status: 403, error: "Forbidden" };

  const user = getUserByEmail(verifiedEmail);
  if (!user?.stripe_customer_id || !isProUser(user)) {
    return { ok: false, status: 404, error: "Billing account not found" };
  }

  return { ok: true, email: verifiedEmail, user: { ...user, stripe_customer_id: user.stripe_customer_id } };
}

export function checkoutSessionEmail(session: any): string {
  return normalizeSubscriberEmail(
    session?.metadata?.email
      ?? session?.customer_details?.email
      ?? session?.customer_email,
  );
}

export function checkoutSessionHasPaidSubscription(session: any): boolean {
  return session?.mode === "subscription"
    && session?.status === "complete"
    && session?.payment_status === "paid"
    && typeof session?.subscription === "string"
    && session.subscription.length > 0;
}

export function checkoutSessionMatchesRequestedEmail(session: any, requestedEmail: unknown): boolean {
  const sessionEmail = checkoutSessionEmail(session);
  const email = normalizeSubscriberEmail(requestedEmail);
  return Boolean(sessionEmail && email && sessionEmail === email);
}

export function verifiedUserResponseByEmail(
  requestedEmail: unknown,
  getUserByEmail: (email: string) => any,
): Record<string, any> | null {
  const email = normalizeSubscriberEmail(requestedEmail);
  if (!email) return null;

  const user = getUserByEmail(email);
  if (!user) return null;
  return { ...user, email: normalizeSubscriberEmail(user.email) || email, is_pro: isProUser(user) };
}

export function stripeSubscriptionStatusAllowsProAccess(status: unknown): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

async function verifiedStripeSubscriberResponseByEmail(requestedEmail: unknown): Promise<Record<string, any> | null> {
  const email = normalizeSubscriberEmail(requestedEmail);
  if (!email || !process.env.STRIPE_SECRET_KEY) return null;

  try {
    const stripe = getStripe();
    const customers = await stripe.customers.list({ email, limit: 10 });
    for (const customer of customers.data) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: "all",
        limit: 10,
      });
      const subscription = subscriptions.data.find(sub => stripeSubscriptionStatusAllowsProAccess(sub.status));
      if (!subscription) continue;

      return {
        id: `stripe:${customer.id}`,
        email,
        plan: "pro",
        access_status: "active",
        billing_status: subscription.status === "past_due" ? "past_due" : "active",
        stripe_customer_id: customer.id,
        stripe_subscription_id: subscription.id,
        is_pro: true,
      };
    }
  } catch (e: any) {
    console.warn(`[user] Stripe subscriber verification skipped: ${e.message}`);
  }

  return null;
}

async function verifiedBillingPortalUserByEmail(requestedEmail: unknown): Promise<(User & { stripe_customer_id: string }) | null> {
  const email = normalizeSubscriberEmail(requestedEmail);
  if (!email) return null;

  const localUser = storage.getUserByEmail(email);
  if (localUser?.stripe_customer_id && isProUser(localUser)) {
    return { ...localUser, stripe_customer_id: localUser.stripe_customer_id };
  }

  const stripeUser = await verifiedStripeSubscriberResponseByEmail(email);
  if (!stripeUser?.stripe_customer_id || !stripeUser.is_pro) return null;

  const refreshedUser = storage.upsertUser({
    email,
    stripe_customer_id: stripeUser.stripe_customer_id,
    stripe_subscription_id: stripeUser.stripe_subscription_id,
    plan: "pro",
    access_status: "active",
    billing_status: stripeUser.billing_status ?? "active",
  });
  if (!refreshedUser?.stripe_customer_id || !isProUser(refreshedUser)) return null;
  return { ...refreshedUser, stripe_customer_id: refreshedUser.stripe_customer_id };
}

export async function authorizeBillingSessionRefresh(
  requestedEmail: unknown,
  getVerifiedBillingUser: (email: string) => Promise<(User & { stripe_customer_id: string }) | null>,
): Promise<{ ok: true; email: string } | { ok: false; status: 400 | 404; error: string }> {
  const email = normalizeSubscriberEmail(requestedEmail);
  if (!email) return { ok: false, status: 400, error: "email required" };

  const user = await getVerifiedBillingUser(email);
  if (!user) return { ok: false, status: 404, error: "Billing account not found" };

  return { ok: true, email };
}

function mapLiveSignalToFrontend(s: LiveSignal) {
  return {
    id: s.id,
    league: s.league,
    signal_type: s.signal_type,
    title: s.headline,
    headline: s.headline,
    summary: s.body,
    action_takeaway: s.action_note,
    player_name: s.player,
    team: s.team,
    matchup: s.matchup,
    verdict: s.verdict,
    confidence_score: s.confidence,
    is_public: true,
    is_featured: false,
    score: s.score,
    score_band: s.score_band,
    urgency_label: s.urgency_label,
    why_it_matters: s.why_it_matters,
    body: s.body,
    action_note: s.action_note,
    sources: s.sources,
    source_count: s.source_count,
    confirmation_strength: s.confirmation_strength,
    line_movement: s.line_movement,
    injury_designation: s.injury_designation,
    lineup_status: s.lineup_status,
    betting_relevance: s.betting_relevance,
    fantasy_relevance: s.fantasy_relevance,
    created_at: s.created_at,
  };
}

export function registerRoutes(httpServer: Server, app: Express) {
  // ─── On-boot seeds ────────────────────────────────────────────────────────────
  // Both run only when SEED_ON_BOOT is explicitly set (default off, incl. production).
  // Neither seed dedupes on re-run, so restarts would otherwise stack fabricated demo
  // content (events/claims/verdicts/alerts) and refill an emptied signals table.
  if (process.env.SEED_ON_BOOT === "true") {
    seedDemoData().catch(e => console.error("Seed error:", e));
    seedSignals().catch(e => console.error("Signal seed error:", e));
  } else {
    console.log("[seed] SEED_ON_BOOT not set — skipping demo + signal seed on boot");
  }

  // Hydrate SQLite from Supabase on startup (non-blocking)
  // This ensures sandbox restarts pick up any signals/notes created via Supabase dashboard
  import("./supabase-sync").then(async ({ pullSignalsFromSupabase, pullSourceNotesFromSupabase }) => {
    const remoteSignals = await pullSignalsFromSupabase();
    for (const s of remoteSignals) {
      try { storage.createSignal(s); } catch (_) {}
    }
    const remoteNotes = await pullSourceNotesFromSupabase();
    for (const n of remoteNotes) {
      try { storage.createSourceNote(n); } catch (_) {}
    }
    if (remoteSignals.length > 0) console.log(`[supabase] hydrated ${remoteSignals.length} signals from Supabase`);
  }).catch(() => {});

  // Auto-seed owner as pro on first boot if no active pro users exist.
  // Runs after a short delay to let DB hydration complete.
  setTimeout(() => {
    try {
      const activeUsers = getActiveAlertUsers();
      if (activeUsers.length === 0) {
        const ownerEmail = getAutoSeedOwnerEmail();
        if (!ownerEmail) return;
        storage.upsertUser({ email: ownerEmail, plan: "pro", access_status: "active" });
        const existing = getAlertPreferences(ownerEmail);
        if (!existing) {
          upsertAlertPreferences({
            email:          ownerEmail,
            leagues:        ["NBA", "MLB"],
            signal_types:   [],
            min_confidence: 60,
            channels:       ["email"],
            is_active:      true,
          });
        }
        console.log(`[boot] No pro users found — auto-seeded owner: ${ownerEmail}`);
      }
    } catch (e: any) {
      console.error("[boot] Auto-seed owner failed:", e.message);
    }
  }, 5000);

  // ─── Waitlist ─────────────────────────────────────────────────────────────────
  app.post("/api/waitlist", async (req, res) => {
    try {
      const data = insertWaitlistSchema.parse(req.body);
      if (storage.waitlistEmailExists(data.email)) {
        return res.status(409).json({ error: "Email already registered" });
      }
      const entry = storage.addToWaitlist(data);
      storage.logEvent({ event_name: "request_access_submit", email: data.email, metadata: JSON.stringify({ source: "landing_page" }) });
      syncToSupabase("waitlist", { email: data.email, name: data.name, role: data.role, source: "landing_page" }, "insert").catch(() => {});
      syncToSupabase("event_log", { event_name: "request_access_submit", email: data.email, metadata: { source: "landing_page" } }, "insert").catch(() => {});
      sendWaitlistConfirmation(data.email).catch(() => {});
      return res.json({ success: true, id: entry.id });
    } catch (err: any) {
      return res.status(400).json({ error: err.message ?? "Invalid input" });
    }
  });

  // ─── ESPN CDN Image Proxy ─────────────────────────────────────────────────────
  app.get("/api/img-proxy", async (req, res) => {
    const url = req.query.url as string;
    if (!url || !url.startsWith("https://a.espncdn.com")) {
      return res.status(400).send("Invalid URL");
    }
    try {
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      res.setHeader("Content-Type", response.headers.get("content-type") || "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(Buffer.from(buffer));
    } catch {
      res.status(502).send("Proxy error");
    }
  });

  app.get("/api/waitlist/count", (_req, res) => {
    const list = storage.getWaitlist();
    res.json({ count: list.length });
  });

  // ─── Signal Feed ──────────────────────────────────────────────────────────────
  app.get("/api/signal", (req, res) => {
    const { league } = req.query as Record<string, string>;
    const pdb = getPipelineDb();
    const sql = league
      ? `SELECT * FROM live_signals WHERE league=? ORDER BY created_at DESC LIMIT 100`
      : `SELECT * FROM live_signals ORDER BY created_at DESC LIMIT 100`;
    const rows: any[] = league ? pdb.prepare(sql).all(league) : pdb.prepare(sql).all();
    return res.json(rows.map(row => mapLiveSignalToFrontend({
      ...row,
      sources: JSON.parse(row.sources ?? "[]"),
      line_movement: row.line_movement ? JSON.parse(row.line_movement) : null,
      breakdown: JSON.parse(row.breakdown ?? "{}"),
      raw_event_ids: JSON.parse(row.raw_event_ids ?? "[]"),
      betting_relevance: row.betting_relevance === 1,
      fantasy_relevance: row.fantasy_relevance === 1,
    })));
  });

  // ─── Sources ─────────────────────────────────────────────────────────────────
  app.get("/api/sources", (_req, res) => {
    const srcs = storage.getSources();
    res.json(srcs);
  });

  // ─── Source Leaderboard ───────────────────────────────────────────────────────
  app.get("/api/leaderboard", (_req, res) => {
    const scores = storage.getSourceScores();
    const verifiedMap = getVerifiedCountBySource();
    const result = scores.map(s => ({
      ...s,
      verified_count: verifiedMap.get(s.source_name) ?? 0,
    }));
    res.json(result);
  });

  // ─── Sport Scoreboards (ESPN free API) ───────────────────────────────────────
  app.get("/api/nba/scoreboard", async (_req, res) => {
    try {
      const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard");
      if (!r.ok) return res.json({ games: [] });
      const data: any = await r.json();
      const games = (data.events ?? []).map((ev: any) => {
        const comp = ev.competitions?.[0];
        if (!comp) return null;
        const home = comp.competitors?.find((c: any) => c.homeAway === "home");
        const away = comp.competitors?.find((c: any) => c.homeAway === "away");
        const stName: string = comp.status?.type?.name ?? "";
        const status = stName.includes("FINAL") ? "FINAL" : stName.includes("IN_PROGRESS") ? "LIVE" : "PRE";
        const odds = comp.odds?.[0];
        return {
          id: ev.id,
          away: away?.team?.abbreviation ?? "---",
          home: home?.team?.abbreviation ?? "---",
          time: new Date(ev.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET",
          status,
          awayScore: status !== "PRE" ? parseInt(away?.score ?? "0") : null,
          homeScore: status !== "PRE" ? parseInt(home?.score ?? "0") : null,
          period: status === "LIVE" ? `Q${comp.status?.period ?? ""}` : null,
          spread: odds?.details ?? "--",
          total: odds?.overUnder != null ? String(odds.overUnder) : "--",
          series: comp.series?.title ?? null,
        };
      }).filter(Boolean);
      return res.json({ games });
    } catch (err: any) {
      console.error("[nba-scoreboard]", err.message);
      return res.json({ games: [] });
    }
  });

  app.get("/api/mlb/scoreboard", async (_req, res) => {
    try {
      const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard");
      if (!r.ok) return res.json({ games: [] });
      const data: any = await r.json();
      const games = (data.events ?? []).map((ev: any) => {
        const comp = ev.competitions?.[0];
        if (!comp) return null;
        const home = comp.competitors?.find((c: any) => c.homeAway === "home");
        const away = comp.competitors?.find((c: any) => c.homeAway === "away");
        const stName: string = comp.status?.type?.name ?? "";
        const status = stName.includes("FINAL") ? "FINAL" : stName.includes("IN_PROGRESS") ? "LIVE" : "PRE";
        const odds = comp.odds?.[0];
        const awayPitcher = away?.probables?.[0]?.athlete?.displayName ?? null;
        const homePitcher = home?.probables?.[0]?.athlete?.displayName ?? null;
        return {
          id: ev.id,
          away: away?.team?.abbreviation ?? "---",
          home: home?.team?.abbreviation ?? "---",
          time: new Date(ev.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET",
          status,
          awayScore: status !== "PRE" ? parseInt(away?.score ?? "0") : null,
          homeScore: status !== "PRE" ? parseInt(home?.score ?? "0") : null,
          inning: status === "LIVE" ? (comp.status?.displayClock ?? null) : null,
          spread: odds?.details ?? "--",
          total: odds?.overUnder != null ? String(odds.overUnder) : "--",
          awayPitcher,
          homePitcher,
        };
      }).filter(Boolean);
      return res.json({ games });
    } catch (err: any) {
      console.error("[mlb-scoreboard]", err.message);
      return res.json({ games: [] });
    }
  });

  // ─── Admin DB Debug ───────────────────────────────────────────────────────────
  app.get("/api/admin/debug-db", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const pdb = getPipelineDb();
    const count = (pdb.prepare("SELECT COUNT(*) as n FROM live_signals").get() as any)?.n ?? 0;
    const sample = pdb.prepare("SELECT id, league, player, signal_type, created_at FROM live_signals ORDER BY created_at DESC LIMIT 10").all();
    const rawCount = (pdb.prepare("SELECT COUNT(*) as n FROM raw_events").get() as any)?.n ?? 0;
    const rawUnprocessed = (pdb.prepare("SELECT COUNT(*) as n FROM raw_events WHERE processed=0").get() as any)?.n ?? 0;

    const tableNames = (pdb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map((r: any) => r.name);
    const situationsCount = tableNames.includes("situations")
      ? (pdb.prepare("SELECT COUNT(*) as n FROM situations").get() as any)?.n ?? 0
      : null;
    const confirmationsCount = tableNames.includes("situation_public_confirmations")
      ? (pdb.prepare("SELECT COUNT(*) as n FROM situation_public_confirmations").get() as any)?.n ?? 0
      : null;
    const multiHitRows = tableNames.includes("situation_events") && tableNames.includes("raw_events")
      ? pdb.prepare(`
          SELECT se.situation_id, COUNT(*) as hit_count
          FROM situation_events se
          INNER JOIN raw_events re ON se.raw_event_id = re.id
          WHERE re.processed_at IS NOT NULL
          GROUP BY se.situation_id
          HAVING COUNT(*) > 1
          ORDER BY hit_count DESC
          LIMIT 20
        `).all()
      : [];

    const backlogByDay = pdb.prepare(`
      SELECT
        DATE(received_at) as day,
        COUNT(*) as total,
        SUM(CASE WHEN processed_at IS NOT NULL THEN 1 ELSE 0 END) as processed,
        SUM(CASE WHEN processed_at IS NULL THEN 1 ELSE 0 END) as unprocessed
      FROM raw_events
      GROUP BY DATE(received_at)
      ORDER BY day DESC
    `).all();

    return res.json({
      live_signals_count: count,
      raw_events_count: rawCount,
      raw_unprocessed: rawUnprocessed,
      situations_count: situationsCount,
      confirmations_count: confirmationsCount,
      multi_hit_situations: multiHitRows,
      backlog_by_day: backlogByDay,
      sample,
    });
  });

  // ─── Admin: Source-type audit (confirmation path diagnostics) ────────────────
  app.get("/api/admin/source-audit", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const pdb = getPipelineDb();
    const bySourceType = pdb.prepare(`
      SELECT source_type, COUNT(*) as count
      FROM raw_events
      WHERE processed_at IS NOT NULL
      GROUP BY source_type
      ORDER BY count DESC
    `).all();
    const recentProcessed = pdb.prepare(`
      SELECT
        id, league, event_type, source_type,
        json_extract(payload, '$.source_tier') as tier,
        json_extract(payload, '$.author') as author,
        json_extract(payload, '$.source_name') as source_name,
        processed_at
      FROM raw_events
      WHERE processed_at IS NOT NULL
      ORDER BY processed_at DESC
      LIMIT 10
    `).all();
    const xTier1Events = pdb.prepare(`
      SELECT
        id, league, event_type, source_type,
        json_extract(payload, '$.source_tier') as tier,
        json_extract(payload, '$.author') as author,
        processed_at
      FROM raw_events
      WHERE source_type IN ('x', 'social', 'twitter')
         OR json_extract(payload, '$.source_tier') = 'tier1'
      ORDER BY processed_at DESC
      LIMIT 20
    `).all();
    return res.json({ by_source_type: bySourceType, recent_processed: recentProcessed, x_tier1_events: xTier1Events });
  });

  // ─── Admin: Multi-source situation audit ─────────────────────────────────────
  app.get("/api/admin/situation-source-audit", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const pdb = getPipelineDb();

    const tables = (pdb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map((r: any) => r.name);

    // Multi-source situations: situations touched by both rss and api raw events
    const multiSource = tables.includes("situations") && tables.includes("situation_events") && tables.includes("raw_events")
      ? pdb.prepare(`
          SELECT
            s.situation_id,
            s.league,
            s.situation_type,
            s.players_json,
            COUNT(se.event_id)                                                   AS event_count,
            SUM(CASE WHEN re.source_type = 'rss' THEN 1 ELSE 0 END)             AS rss_count,
            SUM(CASE WHEN re.source_type = 'api' THEN 1 ELSE 0 END)             AS api_count,
            MIN(re.received_at)                                                  AS first_seen,
            MAX(re.received_at)                                                  AS last_seen
          FROM situations s
          JOIN situation_events se ON se.situation_id = s.situation_id
          JOIN raw_events re ON re.id = se.raw_event_id
          GROUP BY s.situation_id
          HAVING rss_count > 0 AND api_count > 0
          ORDER BY event_count DESC
          LIMIT 20
        `).all()
      : null;

    // Creating-source breakdown: what source_type was the first raw event for each situation?
    const byCreatingSource = tables.includes("situations") && tables.includes("situation_events") && tables.includes("raw_events")
      ? pdb.prepare(`
          SELECT
            re.source_type AS creating_source_type,
            COUNT(DISTINCT s.situation_id) AS situation_count
          FROM situations s
          JOIN situation_events se ON se.situation_id = s.situation_id AND se.raw_event_id = s.created_from_event_id
          JOIN raw_events re ON re.id = se.raw_event_id
          GROUP BY re.source_type
          ORDER BY situation_count DESC
        `).all()
      : null;

    // Overall situation event source breakdown
    const eventsBySource = tables.includes("situation_events") && tables.includes("raw_events")
      ? pdb.prepare(`
          SELECT
            re.source_type,
            COUNT(*) AS event_count,
            COUNT(DISTINCT se.situation_id) AS situation_count
          FROM situation_events se
          JOIN raw_events re ON re.id = se.raw_event_id
          GROUP BY re.source_type
          ORDER BY event_count DESC
        `).all()
      : null;

    return res.json({
      tables_present: tables.filter(t => ["situations","situation_events","raw_events","situation_public_confirmations"].includes(t)),
      multi_source_situations: multiSource,
      by_creating_source: byCreatingSource,
      events_by_source: eventsBySource,
    });
  });

  // ─── Admin: Retire stale live signals ────────────────────────────────────────
  // Archives live_signals older than N days (default 7). Archived signals are
  // excluded from getLiveSignals(), so they stop re-entering the distribution
  // queue. Existing distribution_drafts for those signals are left in place —
  // they are harmless once the source signals are archived.
  app.post("/api/admin/retire-stale-signals", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const olderThanDays: number = typeof req.body?.older_than_days === "number"
      ? req.body.older_than_days
      : 7;

    const archived = archiveOldLiveSignals(olderThanDays);

    // Also report how many live_signals are now archived total vs active
    const pdb = getPipelineDb();
    const counts = pdb.prepare(
      "SELECT is_archived, COUNT(*) as n FROM live_signals GROUP BY is_archived"
    ).all() as { is_archived: number; n: number }[];
    const totalArchived = counts.find(r => r.is_archived === 1)?.n ?? 0;
    const totalActive   = counts.find(r => r.is_archived === 0)?.n ?? 0;

    return res.json({
      archived_this_run: archived,
      older_than_days: olderThanDays,
      total_archived: totalArchived,
      total_active: totalActive,
    });
  });

  // ─── Admin: RSS headline audit (temporary) ───────────────────────────────────
  app.get("/api/admin/rss-headline-audit", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const pdb = getPipelineDb();
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    // Last 20 RSS raw events received in the last 2 hours
    const recent = pdb.prepare(`
      SELECT
        id,
        player,
        json_extract(payload, '$.headline')    AS headline,
        json_extract(payload, '$.dedup_hash')  AS dedup_hash,
        received_at
      FROM raw_events
      WHERE source_type = 'rss'
        AND received_at >= ?
      ORDER BY received_at DESC
      LIMIT 20
    `).all(cutoff) as any[];

    // Events where player IS populated (extracted) in last 2 hours
    const withPlayer = pdb.prepare(`
      SELECT
        id,
        player,
        json_extract(payload, '$.headline') AS headline,
        received_at
      FROM raw_events
      WHERE source_type = 'rss'
        AND received_at >= ?
        AND player IS NOT NULL
        AND player != ''
      ORDER BY received_at DESC
      LIMIT 20
    `).all(cutoff) as any[];

    return res.json({ recent_rss: recent, with_player: withPlayer });
  });

  // ─── Admin: Cross-type player pair diagnostic (temporary) ───────────────────
  app.get("/api/admin/cross-type-audit", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const pdb = getPipelineDb();
    const tables = (pdb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map((r: any) => r.name);
    if (!tables.includes("situations")) return res.json({ error: "situations table not present" });

    const crossTypePairs = pdb.prepare(`
      SELECT s1.situation_type as type_a, s2.situation_type as type_b,
             COUNT(*) as pairs
      FROM situations s1
      JOIN situations s2 ON s1.situation_id < s2.situation_id
      WHERE s1.players_json != '[]'
        AND s1.players_json = s2.players_json
        AND s1.league = s2.league
        AND s1.situation_type != s2.situation_type
      GROUP BY s1.situation_type, s2.situation_type
      ORDER BY pairs DESC
    `).all();

    const rssEmptyPlayers = pdb.prepare(`
      SELECT
        COUNT(*) as total_rss,
        SUM(CASE WHEN se.raw_event_id IS NOT NULL AND re.source_type = 'rss'
                      AND (s.players_json = '[]' OR s.players_json IS NULL OR s.players_json = 'null')
                 THEN 1 ELSE 0 END) as rss_empty_players,
        SUM(CASE WHEN se.raw_event_id IS NOT NULL AND re.source_type = 'rss'
                      AND s.players_json != '[]' AND s.players_json IS NOT NULL AND s.players_json != 'null'
                 THEN 1 ELSE 0 END) as rss_with_players
      FROM situations s
      JOIN situation_events se ON se.situation_id = s.situation_id AND se.kind = 'situation_created'
      JOIN raw_events re ON re.id = se.raw_event_id
      WHERE re.source_type = 'rss'
    `).all();

    const rssPlayerSample = pdb.prepare(`
      SELECT s.situation_id, s.league, s.situation_type, s.players_json, s.teams_json
      FROM situations s
      JOIN situation_events se ON se.situation_id = s.situation_id AND se.kind = 'situation_created'
      JOIN raw_events re ON re.id = se.raw_event_id
      WHERE re.source_type = 'rss'
      ORDER BY s.created_at DESC
      LIMIT 15
    `).all();

    return res.json({
      cross_type_pairs: crossTypePairs,
      rss_player_counts: rssEmptyPlayers,
      rss_situation_sample: rssPlayerSample,
    });
  });

  // ─── Admin: Deduplicate source_scores ────────────────────────────────────────
  app.post("/api/admin/source-scores/dedup", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const result = storage.cleanSourceScoreDuplicates();
    return res.json(result);
  });

  // ─── Admin Review Queue ───────────────────────────────────────────────────────
  app.get("/api/admin/review", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const queue = storage.getReviewQueue();
    // Enrich with claim + event data
    const enriched = queue.map(v => {
      const claim = v.claim_id ? storage.getClaim(v.claim_id) : null;
      const event = claim?.event_id ? storage.getEvent(claim.event_id) : null;
      const source = claim?.source_id ? storage.getSource(claim.source_id) : null;
      return { ...v, claim, event, source };
    });
    res.json(enriched);
  });

  app.post("/api/admin/review/:id/resolve", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const verdict = storage.resolveReview(req.params.id);
    if (!verdict) return res.status(404).json({ error: "Not found" });
    // Now publish the alert since it's resolved
    if (verdict.claim_id) {
      publisherAgent(verdict.claim_id).catch(() => {});
    }
    return res.json({ success: true, verdict });
  });

  // ─── Alerts ──────────────────────────────────────────────────────────────────
  app.get("/api/alerts", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const alertList = storage.getAlerts();
    res.json(alertList);
  });

  app.post("/api/alerts/:id/send", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const alert = storage.markAlertSent(req.params.id);
    if (!alert) return res.status(404).json({ error: "Not found" });
    return res.json({ success: true, alert });
  });

  // ─── Agent Pipeline (manual trigger for demo) ─────────────────────────────────
  app.post("/api/pipeline/run", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const { source_id, raw_text, player, team, league, topic } = req.body;
      if (!source_id || !raw_text) {
        return res.status(400).json({ error: "source_id and raw_text are required" });
      }
      const result = await runFullPipeline({ source_id, raw_text, player, team, league, topic });
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── QA Audit ─────────────────────────────────────────────────────────────────
  app.get("/api/qa/audit", async (_req, res) => {
    const result = await qaAuditAgent();
    res.json(result);
  });

  // ─── Agent Logs ───────────────────────────────────────────────────────────────
  app.get("/api/logs", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const limit = parseInt((req.query.limit as string) ?? "50");
    const logs = storage.getAgentLogs(limit);
    res.json(logs);
  });

  // ─── Dashboard Stats ──────────────────────────────────────────────────────────
  app.get("/api/stats", (_req, res) => {
    const feed = storage.getSignalFeed();
    const reviewQueue = storage.getReviewQueue();
    const alerts = storage.getAlerts();
    const sources = storage.getSources();
    const waitlist = storage.getWaitlist();

    const verdictCounts = feed.reduce((acc: Record<string, number>, item) => {
      const v = item.verdict ?? "unknown";
      acc[v] = (acc[v] ?? 0) + 1;
      return acc;
    }, {});

    res.json({
      total_signals: feed.length,
      review_queue: reviewQueue.length,
      alerts_published: alerts.length,
      sources_tracked: sources.length,
      waitlist_count: waitlist.length,
      verdict_breakdown: verdictCounts,
    });
  });

  // ─── Events ──────────────────────────────────────────────────────────────────
  app.get("/api/events", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const evts = storage.getEvents();
    res.json(evts);
  });

  // ─── Verdicts ─────────────────────────────────────────────────────────────────
  app.get("/api/verdicts", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const vdicts = storage.getVerdicts();
    res.json(vdicts);
  });


  // ─── MVP: Signals ─────────────────────────────────────────────────────────────
  app.get("/api/signals", (req, res) => {
    const { league } = req.query as Record<string, string>;
    const pdb = getPipelineDb();
    const sql = league
      ? `SELECT * FROM live_signals WHERE league=? ORDER BY created_at DESC LIMIT 100`
      : `SELECT * FROM live_signals ORDER BY created_at DESC LIMIT 100`;
    const rows: any[] = league ? pdb.prepare(sql).all(league) : pdb.prepare(sql).all();
    return res.json(rows.map(row => mapLiveSignalToFrontend({
      ...row,
      sources: JSON.parse(row.sources ?? "[]"),
      line_movement: row.line_movement ? JSON.parse(row.line_movement) : null,
      breakdown: JSON.parse(row.breakdown ?? "{}"),
      raw_event_ids: JSON.parse(row.raw_event_ids ?? "[]"),
      betting_relevance: row.betting_relevance === 1,
      fantasy_relevance: row.fantasy_relevance === 1,
    })));
  });
  app.get("/api/signals/all", (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(storage.getSignals(false));
  });
  app.get("/api/signals/:id", (req, res) => {
    const sig = storage.getSignal(req.params.id);
    if (!sig) return res.status(404).json({ error: "Not found" });
    res.json(sig);
  });
  app.get("/api/signals/:id/notes", (req, res) => {
    res.json(storage.getSourceNotes(req.params.id));
  });
  app.post("/api/signals", (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const data = insertSignalSchema.parse(req.body);
      return res.json(storage.createSignal(data));
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
  });
  app.patch("/api/signals/:id", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const sig = storage.updateSignal(req.params.id, req.body);
    if (!sig) return res.status(404).json({ error: "Not found" });
    return res.json(sig);
  });

  app.delete("/api/admin/signals/:id", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const exists = storage.getSignal(req.params.id);
    if (!exists) return res.status(404).json({ error: "Signal not found" });
    storage.deleteSignal(req.params.id);
    return res.json({ deleted: true, id: req.params.id });
  });

  app.post("/api/admin/make-pro", (req, res) => {
    if (!requireAdmin(req, res)) return;

    const { email } = req.body ?? {};
    if (!email) return res.status(400).json({ error: "email is required" });

    const user = storage.upsertUser({ email, plan: "pro", access_status: "active" });

    // Seed default alert preferences if none exist so alerts fire immediately
    const existing = getAlertPreferences(email);
    if (!existing) {
      upsertAlertPreferences({
        email,
        leagues:        ["NBA", "MLB"],
        signal_types:   [],
        min_confidence: 60,
        channels:       ["email"],
        is_active:      true,
      });
    }

    return res.json({ success: true, email, plan: user.plan, access_status: user.access_status });
  });

  // ─── MVP: Event Log ────────────────────────────────────────────────────────────
  app.post("/api/events/log", (req, res) => {
    const { event_name, email, user_id, metadata } = req.body;
    if (!event_name) return res.status(400).json({ error: "event_name required" });
    const entry = storage.logEvent({ event_name, email, user_id, metadata: metadata ? JSON.stringify(metadata) : undefined });
    res.json({ success: true, id: entry.id });
  });

  // ─── MVP: Users ────────────────────────────────────────────────────────────────
  app.get("/api/user", async (req, res) => {
    const user = verifiedUserResponseByEmail(req.query.email, email => storage.getUserByEmail(email));
    if (!user?.is_pro) {
      const stripeUser = await verifiedStripeSubscriberResponseByEmail(req.query.email);
      if (stripeUser) return res.json(stripeUser);
    }
    if (!user) return res.json(null);
    // Attach computed is_pro flag — covers both Stripe path and beta_until comp path.
    // Client should prefer this flag over re-implementing the logic.
    return res.json(user);
  });

  // Resolves a usable Stripe customer id for the CURRENT key's mode.
  // A customer id saved under one Stripe mode (test/live) is invalid under
  // the other mode's key — Stripe returns a "resource_missing" error rather
  // than silently working. If the stored id isn't usable, create a fresh
  // customer and persist it so a stale id never reaches checkout or the
  // billing portal again.
  async function resolveStripeCustomerId(
    stripe: Stripe,
    email: string,
    storedCustomerId: string | null | undefined,
  ): Promise<string> {
    if (storedCustomerId) {
      try {
        const existing = await stripe.customers.retrieve(storedCustomerId);
        if (!(existing as any).deleted) return storedCustomerId;
      } catch (e: any) {
        if (e?.code !== "resource_missing") throw e; // real error (network/auth) — don't swallow
        console.warn(`[stripe] stored customer ${storedCustomerId} not usable in current mode for ${maskedEmail(email)}, recreating`);
      }
    }
    const customer = await stripe.customers.create({ email });
    storage.upsertUser({ email, stripe_customer_id: customer.id });
    return customer.id;
  }

  // ─── MVP: Stripe Checkout ──────────────────────────────────────────────────────
  app.post("/api/checkout", async (req, res) => {
    const email = normalizeSubscriberEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: "email required" });
    try {
      const stripe = getStripe();
      const baseUrl = process.env.BASE_URL ?? "https://edgesetter.net";
      const existingUser = storage.getUserByEmail(email);
      const customerId = await resolveStripeCustomerId(stripe, email, existingUser?.stripe_customer_id);
      if (!existingUser) {
        storage.upsertUser({ email, stripe_customer_id: customerId, plan: "free", access_status: "pending" });
      }
      const lineItems: any[] = STRIPE_PRO_PRICE_ID
        ? [{ price: STRIPE_PRO_PRICE_ID, quantity: 1 }]
        : [{
            price_data: {
              currency: "usd", unit_amount: 1900,
              recurring: { interval: "month" },
              product_data: { name: "Edge Setter Pro Intelligence", description: "Full signal feed · confidence scores · source notes · verdict detail" },
            },
            quantity: 1,
          }];
      const session = await stripe.checkout.sessions.create({
        customer: customerId, mode: "subscription",
        line_items: lineItems,
        success_url: `${baseUrl}/?session_id={CHECKOUT_SESSION_ID}&email=${encodeURIComponent(email)}#/success`,
        cancel_url: `${baseUrl}/#/pro`,
        metadata: { email },
      });
      storage.logEvent({ event_name: "checkout_started", email, metadata: JSON.stringify({ session_id: session.id }) });
      syncToSupabase("event_log", { event_name: "checkout_started", email, metadata: { session_id: session.id } }, "insert").catch(() => {});
      return res.json({ url: session.url });
    } catch (e: any) {
      console.error("[checkout]", e.message);
      return res.status(500).json({ error: e.message });
    }
  });

  // ─── Stripe Webhook (hardened) ─────────────────────────────────────────────
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    let event: any;
    try {
      const stripe = getStripe();
      if (STRIPE_WEBHOOK_SECRET && sig) {
        // Verified: signature matches — production path
        // The global express.json() in index.ts consumes the body before the
        // route-level express.raw() runs, so req.body is a parsed object here.
        // Signature verification needs the exact raw bytes, which express.json's
        // verify hook stashed on req.rawBody.
        const rawPayload = Buffer.isBuffer(req.rawBody) ? req.rawBody : req.body;
        event = stripe.webhooks.constructEvent(rawPayload, sig, STRIPE_WEBHOOK_SECRET);
      } else if (!STRIPE_WEBHOOK_SECRET) {
        // No secret configured: allow unsigned (test/local only)
        // req.body may already be parsed by express.json() global middleware
        if (typeof req.body === "object" && req.body !== null && !Buffer.isBuffer(req.body)) {
          event = req.body;
        } else {
          event = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString() : String(req.body));
        }
      } else {
        // Secret set but no signature — reject
        return res.status(400).json({ error: "Missing stripe-signature header" });
      }
    } catch (e: any) { return res.status(400).json({ error: e.message }); }

    try {
      const stripe = getStripe();

      // ── checkout.session.completed ─────────────────────────────────────────
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const email = checkoutSessionEmail(session);
        if (email && checkoutSessionHasPaidSubscription(session)) {
          const proData = {
            email,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            plan: "pro",
            access_status: "active",
            billing_status: "active",
          };
          storage.upsertUser(proData);
          storage.logEvent({ event_name: "subscription_started", email, metadata: JSON.stringify({ session_id: session.id, source: "webhook" }) });
          syncToSupabase("users", proData, "upsert").catch(() => {});
          syncToSupabase("event_log", { event_name: "subscription_started", email, metadata: { session_id: session.id, source: "webhook" } }, "insert").catch(() => {});
          sendProWelcome(email).catch(() => {});
        } else {
          console.warn(`[webhook] checkout.session.completed ignored: session ${session.id ?? "unknown"} is not a paid subscription checkout`);
        }
      }

      // ── customer.subscription.deleted ──────────────────────────────────────
      if (event.type === "customer.subscription.deleted") {
        const sub = event.data.object;
        const user = storage.getUserByStripeCustomer(sub.customer as string);
        if (user) {
          const downgradeData = {
            ...user,
            plan: "free",
            access_status: "canceled",
            billing_status: "canceled",
          };
          storage.upsertUser(downgradeData);
          storage.logEvent({ event_name: "subscription_canceled", email: user.email, metadata: JSON.stringify({ subscription_id: sub.id, customer_id: sub.customer }) });
          syncToSupabase("users", downgradeData, "upsert").catch(() => {});
          syncToSupabase("event_log", { event_name: "subscription_canceled", email: user.email, metadata: { subscription_id: sub.id } }, "insert").catch(() => {});
          console.log(`[webhook] subscription.deleted: ${user.email} downgraded to free`);
        } else {
          console.warn(`[webhook] subscription.deleted: no user found for customer ${sub.customer}`);
        }
      }

      // ── invoice.payment_failed ─────────────────────────────────────────────
      if (event.type === "invoice.payment_failed") {
        const invoice = event.data.object;
        const customerId = invoice.customer as string;
        const user = storage.getUserByStripeCustomer(customerId);
        if (user) {
          // Grace period: keep Pro access alive, but mark billing_status as past_due.
          // Access is revoked only when subscription.deleted fires (after Stripe retries exhaust).
          const failData = {
            ...user,
            billing_status: "past_due",
            billing_email_sent: new Date().toISOString(),
          };
          storage.upsertUser(failData);
          storage.logEvent({ event_name: "payment_failed", email: user.email, metadata: JSON.stringify({ invoice_id: invoice.id, attempt: invoice.attempt_count, next_attempt: invoice.next_payment_attempt }) });
          syncToSupabase("users", failData, "upsert").catch(() => {});
          syncToSupabase("event_log", { event_name: "payment_failed", email: user.email, metadata: { invoice_id: invoice.id, attempt: invoice.attempt_count } }, "insert").catch(() => {});
          // Email stub — fires when Resend is configured
          sendBillingRetryEmail(user.email, invoice.attempt_count ?? 1).catch(() => {});
          console.log(`[webhook] invoice.payment_failed: ${user.email} marked past_due (attempt ${invoice.attempt_count})`);
        }
      }

    } catch (e) { console.error("[webhook]", e); }
    res.json({ received: true });
  });

  // ─── Stripe Customer Portal ────────────────────────────────────────────────
  app.post("/api/billing/session", async (req, res) => {
    const requestedEmail = normalizeSubscriberEmail(req.body?.email);
    billingLog("session:start", {
      email: maskedEmail(requestedEmail),
      hasBillingAuthSecret: Boolean(getBillingAuthSecret()),
      nodeEnv: process.env.NODE_ENV ?? "unset",
    });

    const access = await authorizeBillingSessionRefresh(
      requestedEmail,
      email => verifiedBillingPortalUserByEmail(email),
    );
    if (!access.ok) {
      billingLog("session:fail", {
        email: maskedEmail(requestedEmail),
        reason: access.status === 400 ? "missing_email" : "not_active_or_no_customer",
      });
      return res.status(access.status).json({ error: access.error });
    }

    const cookieSet = setBillingIdentityCookie(res, access.email);
    if (!cookieSet) {
      billingLog("session:fail", {
        email: maskedEmail(access.email),
        reason: "billing_auth_secret_missing",
      });
      return res.status(500).json({ error: "Billing auth is not configured" });
    }
    billingLog("session:success", {
      email: maskedEmail(access.email),
      setCookie: true,
      cookie: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAgeMs: BILLING_AUTH_MAX_AGE_MS },
    });
    return res.json({ success: true });
  });

  app.post("/api/billing/portal", async (req, res) => {
    const requestedEmail = normalizeSubscriberEmail(req.body?.email);
    const billingCookie = readCookie(req, BILLING_AUTH_COOKIE);
    const verifiedCookieEmail = verifyBillingPortalIdentityToken(billingCookie);
    billingLog("portal:start", {
      email: maskedEmail(requestedEmail),
      hasBillingCookie: Boolean(billingCookie),
      billingCookieValid: Boolean(verifiedCookieEmail),
      cookieMatchesEmail: Boolean(verifiedCookieEmail && requestedEmail && verifiedCookieEmail === requestedEmail),
    });

    const access = authorizeBillingPortalAccess(
      requestedEmail,
      billingCookie,
      email => storage.getUserByEmail(email),
    );
    if (!access.ok) {
      const reason =
        access.status === 400 ? "missing_email"
        : access.status === 401 ? "missing_or_invalid_billing_cookie"
        : access.status === 403 ? "cookie_email_mismatch"
        : "not_active_or_no_customer";
      billingLog("portal:fail", {
        email: maskedEmail(requestedEmail),
        reason,
      });
      return res.status(access.status).json({ error: access.error });
    }

    try {
      const stripe = getStripe();
      const customerId = await resolveStripeCustomerId(stripe, access.email, access.user.stripe_customer_id);
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${process.env.BASE_URL ?? "https://edgesetter.net"}/#/pro`,
      });
      storage.logEvent({ event_name: "billing_portal_opened", email: access.email, metadata: JSON.stringify({ customer_id: customerId }) });
      billingLog("portal:success", {
        email: maskedEmail(access.email),
        stripePortalSessionCreated: true,
      });
      return res.json({ url: session.url });
    } catch (e: any) {
      billingLog("portal:stripe_fail", {
        email: maskedEmail(access.email),
        reason: e?.type ?? e?.code ?? "stripe_portal_create_failed",
        statusCode: e?.statusCode ?? null,
      });
      console.error("[billing/portal]", e.message);
      return res.status(500).json({ error: e.message });
    }
  });

  // ─── MVP: Verify subscription after Stripe redirect ───────────────────────────
  app.post("/api/verify-subscription", async (req, res) => {
    const { session_id, email } = req.body;
    if (!session_id || !email) return res.status(400).json({ error: "session_id and email required" });
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(session_id);
      if (!checkoutSessionMatchesRequestedEmail(session, email)) {
        return res.status(403).json({ error: "Session email does not match requested email" });
      }
      if (checkoutSessionHasPaidSubscription(session)) {
        const sessionEmail = checkoutSessionEmail(session);
        const proData = { email: sessionEmail, stripe_customer_id: session.customer as string, stripe_subscription_id: session.subscription as string, plan: "pro", access_status: "active", billing_status: "active" };
        storage.upsertUser(proData);
        setBillingIdentityCookie(res, sessionEmail);
        storage.logEvent({ event_name: "success_page_view", email: sessionEmail, metadata: JSON.stringify({ session_id }) });
        syncToSupabase("users", proData, "upsert").catch(() => {});
        syncToSupabase("event_log", { event_name: "subscription_started", email: sessionEmail, metadata: { session_id } }, "insert").catch(() => {});
        return res.json({ success: true, plan: "pro" });
      }
      return res.json({ success: false, plan: "free" });
    } catch (e: any) {
      console.error("[verify-subscription]", e.message);
      return res.status(500).json({ error: e.message });
    }
  });

  // ─── Digest: Subscribe ──────────────────────────────────────────────────────
  app.post("/api/digest/subscribe", (req, res) => {
    const { email, source } = req.body;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email required" });
    }
    try {
      const { randomUUID } = require("crypto");
      const sub = storage.addDigestSubscriber({
        email: email.trim().toLowerCase(),
        unsubscribe_token: randomUUID(),
        is_active: true,
        source: source ?? "landing_page",
      });
      storage.logEvent({ event_name: "digest_subscribe", email: sub.email, metadata: JSON.stringify({ source: sub.source }) });
      syncToSupabase("event_log", { event_name: "digest_subscribe", email: sub.email, metadata: { source: sub.source } }, "insert").catch(() => {});
      return res.json({ success: true, id: sub.id });
    } catch (err: any) {
      return res.status(500).json({ error: err.message ?? "Subscribe failed" });
    }
  });

  // ─── Digest: Unsubscribe (one-click, GET) ──────────────────────────────────
  app.get("/api/digest/unsubscribe", (req, res) => {
    const token = req.query.token as string;
    if (!token) return res.status(400).send("Missing token");
    const ok = storage.unsubscribeDigest(token);
    const msg = ok
      ? "You've been unsubscribed from the Edge Setter daily digest."
      : "This unsubscribe link has already been used or is invalid.";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed — Edge Setter</title></head><body style="margin:0;padding:40px 20px;background:#0A0B0D;font-family:'Arial Narrow',Arial,sans-serif;color:#F3EFE6;text-align:center"><p style="font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:#CAA85A;margin-bottom:12px">Edge Setter</p><p style="font-size:18px;margin:0 0 16px">${msg}</p><a href="https://edgesetter.net" style="color:#CAA85A;font-size:12px">Return to Edge Setter →</a></body></html>`);
  });

  // ─── Digest: Admin Send (password-gated) ──────────────────────────────────
  app.post("/api/admin/digest/send", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      // Get the top signal (highest confidence, published today)
      const allSignals = storage.getSignals(true);
      if (!allSignals || allSignals.length === 0) {
        return res.status(404).json({ error: "No signals available to send" });
      }
      // Sort by confidence_score desc; top signal is #1
      const sorted = [...allSignals].sort((a, b) => (b.confidence_score ?? 0) - (a.confidence_score ?? 0));
      const topSignal = sorted[0];
      const teaserSignals = sorted.slice(1, 3);

      const subscribers = storage.getDigestSubscribers();
      if (subscribers.length === 0) {
        return res.json({ success: true, sent: 0, message: "No active subscribers" });
      }

      const now = new Date();
      const dateLabel = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

      const results = await Promise.allSettled(
        subscribers.map(sub =>
          sendDailyDigest({
            to: sub.email,
            topSignal,
            teaserSignals,
            unsubToken: sub.unsubscribe_token,
            dateLabel,
          })
        )
      );

      const sent    = results.filter(r => r.status === "fulfilled" && r.value).length;
      const failed  = results.length - sent;

      storage.logEvent({
        event_name: "digest_sent",
        metadata: JSON.stringify({ total: subscribers.length, sent, failed, date: dateLabel }),
      });

      return res.json({ success: true, sent, failed, total: subscribers.length, date: dateLabel });
    } catch (err: any) {
      console.error("[digest/send]", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── MVP: Admin ────────────────────────────────────────────────────────────────
  // ─── Signal Ops Agent routes ───────────────────────────────────────────────

  // POST /api/agent/signal-ops — ingest a single signal
  app.post("/api/agent/signal-ops", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const result = await runSignalOps(req.body);
      return res.json(result);
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
  });

  // POST /api/agent/signal-ops/batch — ingest multiple signals
  app.post("/api/agent/signal-ops/batch", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    if (!Array.isArray(req.body?.inputs)) return res.status(400).json({ error: "inputs[] required" });
    try {
      const results = await batchSignalOps(req.body.inputs);
      return res.json({ count: results.length, results });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // GET /api/agent/signal-ops/queue — view queue (admin only)
  app.get("/api/agent/signal-ops/queue", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const decision = req.query.decision as string | undefined;
    const items = (storage as any).getSignalOpsQueue(decision);
    return res.json({ count: items.length, items });
  });

  // POST /api/agent/signal-ops/queue/:id/approve — human approves review_required item
  app.post("/api/agent/signal-ops/queue/:id/approve", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const item = (storage as any).getSignalOpsItem(req.params.id);
    if (!item) return res.status(404).json({ error: "Item not found" });
    try {
      const verdictMap: Record<string,string> = {
        draft_intelligence:"likely",injury:"likely",trade:"rumor",
        free_agency:"likely",team_visit:"rumor",contract:"likely",
        coaching:"rumor",depth_chart:"likely",general:"rumor",
      };
      const signal = storage.createSignal({
        title: item.normalized_headline ?? item.raw_headline,
        slug: (item.normalized_headline ?? item.raw_headline).toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,80),
        player_name: item.player ?? "Unknown",
        team: item.team ?? "Unknown",
        signal_type: item.signal_type ?? "general",
        status_tag: "verified",
        confidence_score: item.confidence_score ?? 70,
        source_count: item.source_count ?? 1,
        topic: item.signal_type ?? "general",
        verdict: verdictMap[item.signal_type ?? "general"] ?? "rumor",
        summary: item.normalized_summary ?? item.raw_headline,
        action_takeaway: `Human-approved signal — monitor ${item.player ?? "this player"} situation.`,
        is_featured: false,
        is_public: true,
      });
      (storage as any).resolveSignalOpsItem(item.id, signal.id);
      storage.logAgentAction({
        id: crypto.randomUUID(), timestamp: new Date().toISOString(),
        agent_name: "SignalOps/HumanApprove",
        input_ref: item.id, output_ref: signal.id,
        decision_summary: `Human approved queue item ${item.id} → published signal ${signal.id}`,
        error_state: null, warning_state: null,
      });
      return res.json({ success: true, signal_id: signal.id });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // POST /api/agent/signal-ops/queue/:id/reject — human rejects review_required item
  app.post("/api/agent/signal-ops/queue/:id/reject", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const item = (storage as any).getSignalOpsItem(req.params.id);
    if (!item) return res.status(404).json({ error: "Item not found" });
    (storage as any).rejectSignalOpsItem(item.id, req.body?.reason ?? "Human rejected");
    storage.logAgentAction({
      id: crypto.randomUUID(), timestamp: new Date().toISOString(),
      agent_name: "SignalOps/HumanReject",
      input_ref: item.id, output_ref: item.id,
      decision_summary: `Human rejected queue item ${item.id}: ${req.body?.reason ?? "no reason given"}`,
      error_state: null, warning_state: null,
    });
    return res.json({ success: true });
  });

  // ─── Site Watch Agent routes ────────────────────────────────────────────────

  // GET /api/agent/site-watch — latest Site Watch log entries
  app.get("/api/agent/site-watch", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    return res.json((storage as any).getSiteWatchLog(limit));
  });

  // POST /api/agent/site-watch/run — trigger a manual run
  app.post("/api/agent/site-watch/run", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const result = await runSiteWatch();
      return res.json(result);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/waitlist", (req, res) => { if (!requireAdmin(req, res)) return; res.json(storage.getWaitlist()); });
  app.get("/api/admin/waitlist/csv", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const list = storage.getWaitlist();
    const csv = ["id,email,name,role,created_at", ...list.map(r => `${r.id},${r.email},${r.name ?? ""},${r.role ?? ""},${r.created_at}`)].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=waitlist.csv");
    res.send(csv);
  });
  app.get("/api/admin/users", (req, res) => { if (!requireAdmin(req, res)) return; res.json(storage.getAllUsers()); });
  app.get("/api/admin/event-log", (req, res) => { if (!requireAdmin(req, res)) return; res.json(storage.getEventLog()); });

  // ─── Distribution Draft Agent routes ──────────────────────────────────────
  function requireAdmin(req: any, res: any): boolean {
    const ADMIN_PASSWORD = getConfiguredAdminPassword();
    if (!ADMIN_PASSWORD) {
      res.status(503).json({ error: "Admin auth not configured" });
      return false;
    }
    const authHeader = req.headers.authorization ?? "";
    const pw = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : (req.body?.password ?? req.query?.password);
    if (pw !== ADMIN_PASSWORD) { res.status(401).json({ error: "Unauthorized" }); return false; }
    return true;
  }

  // GET /api/agent/distribution-drafts — list drafts (filterable by status/channel)
  app.get("/api/agent/distribution-drafts", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { status, channel, signal_id } = req.query as Record<string, string>;
    const drafts = (storage as any).getDistributionDrafts({ status, channel, signal_id });
    return res.json(drafts);
  });

  // POST /api/agent/distribution-drafts/run — trigger draft generation
  app.post("/api/agent/distribution-drafts/run", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const result = await runDistributionDraft({
        signalId: req.body?.signal_id,
        force:    req.body?.force === true,
      });
      return res.json(result);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/agent/distribution-drafts/:id — update status / copy / notes
  app.patch("/api/agent/distribution-drafts/:id", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { status, copy, notes } = req.body ?? {};
    const updated = (storage as any).updateDistributionDraft(req.params.id, { status, copy, notes });
    if (!updated) return res.status(404).json({ error: "Draft not found" });
    storage.logAgentAction({
      id: crypto.randomUUID(), timestamp: new Date().toISOString(),
      agent_name: "DistributionDraft/HumanAction",
      input_ref: req.params.id, output_ref: req.params.id,
      decision_summary: `Human updated draft ${req.params.id}: status=${status ?? "unchanged"}`,
      error_state: null, warning_state: null,
    });
    return res.json(updated);
  });

  // POST /api/agent/distribution-drafts/:id/approve
  app.post("/api/agent/distribution-drafts/:id/approve", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const updated = (storage as any).updateDistributionDraft(req.params.id, { status: "approved" });
    if (!updated) return res.status(404).json({ error: "Draft not found" });
    storage.logAgentAction({
      id: crypto.randomUUID(), timestamp: new Date().toISOString(),
      agent_name: "DistributionDraft/Approve",
      input_ref: req.params.id, output_ref: req.params.id,
      decision_summary: `Draft ${req.params.id} approved`,
      error_state: null, warning_state: null,
    });
    return res.json({ success: true, draft: updated });
  });

  // POST /api/agent/distribution-drafts/:id/reject
  app.post("/api/agent/distribution-drafts/:id/reject", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const updated = (storage as any).updateDistributionDraft(req.params.id, {
      status: "rejected",
      notes: req.body?.notes ?? "Rejected by operator",
    });
    if (!updated) return res.status(404).json({ error: "Draft not found" });
    storage.logAgentAction({
      id: crypto.randomUUID(), timestamp: new Date().toISOString(),
      agent_name: "DistributionDraft/Reject",
      input_ref: req.params.id, output_ref: req.params.id,
      decision_summary: `Draft ${req.params.id} rejected`,
      error_state: null, warning_state: null,
    });
    return res.json({ success: true, draft: updated });
  });

  // POST /api/agent/distribution-drafts/:id/regenerate — force regen for this signal+channel
  app.post("/api/agent/distribution-drafts/:id/regenerate", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const draft = (storage as any).getDistributionDraft(req.params.id);
    if (!draft) return res.status(404).json({ error: "Draft not found" });
    // Mark old draft rejected, then regenerate with force=true
    (storage as any).updateDistributionDraft(req.params.id, { status: "rejected", notes: "Superseded by regeneration" });
    try {
      const result = await runDistributionDraft({ signalId: draft.signal_id, force: true });
      return res.json(result);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // POST /api/agent/distribution-drafts/:id/post — manually post any draft
  app.post("/api/agent/distribution-drafts/:id/post", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const draft = (storage as any).getDistributionDraft(req.params.id);
    if (!draft) return res.status(404).json({ error: "Draft not found" });
    if (draft.status === "posted") return res.status(409).json({ error: "Already posted" });

    try {
      if (draft.channel === "x") {
        const { postTweet: tweet, canAutoPost } = await import("./twitter");
        if (!canAutoPost()) return res.status(503).json({ error: "Twitter credentials not configured" });
        const result = await tweet(draft.copy);
        if (!result) return res.status(502).json({ error: "Tweet failed — check server logs" });
        const updated = (storage as any).updateDistributionDraft(req.params.id, {
          status: "posted", tweet_id: result.id, tweet_url: result.url,
          posted_at: new Date().toISOString(),
        });
        storage.logAgentAction({
          id: crypto.randomUUID(), timestamp: new Date().toISOString(),
          agent_name: "DistributionDraft/ManualPost",
          input_ref: req.params.id, output_ref: result.id,
          decision_summary: `Manually posted tweet ${result.id} for draft ${req.params.id}`,
          error_state: null, warning_state: null,
        });
        return res.json({ success: true, tweet_id: result.id, tweet_url: result.url, draft: updated });

      } else if (draft.channel === "discord") {
        const { postToDiscord, canPostDiscord } = await import("./discord");
        if (!canPostDiscord()) return res.status(503).json({ error: "DISCORD_WEBHOOK_URL not configured" });
        const ok = await postToDiscord(draft.copy);
        if (!ok) return res.status(502).json({ error: "Discord post failed — check server logs" });
        const updated = (storage as any).updateDistributionDraft(req.params.id, {
          status: "posted", posted_at: new Date().toISOString(),
        });
        storage.logAgentAction({
          id: crypto.randomUUID(), timestamp: new Date().toISOString(),
          agent_name: "DistributionDraft/ManualPost",
          input_ref: req.params.id, output_ref: req.params.id,
          decision_summary: `Manually posted to Discord for draft ${req.params.id}`,
          error_state: null, warning_state: null,
        });
        return res.json({ success: true, channel: "discord", draft: updated });

      } else if (draft.channel === "telegram") {
        const { postToTelegram, canPostTelegram } = await import("./telegram");
        if (!canPostTelegram()) return res.status(503).json({ error: "TELEGRAM_BOT_TOKEN/CHAT_ID not configured" });
        const ok = await postToTelegram(draft.copy);
        if (!ok) return res.status(502).json({ error: "Telegram post failed — check server logs" });
        const updated = (storage as any).updateDistributionDraft(req.params.id, {
          status: "posted", posted_at: new Date().toISOString(),
        });
        storage.logAgentAction({
          id: crypto.randomUUID(), timestamp: new Date().toISOString(),
          agent_name: "DistributionDraft/ManualPost",
          input_ref: req.params.id, output_ref: req.params.id,
          decision_summary: `Manually posted to Telegram for draft ${req.params.id}`,
          error_state: null, warning_state: null,
        });
        return res.json({ success: true, channel: "telegram", draft: updated });

      } else {
        return res.status(400).json({ error: `Channel "${draft.channel}" does not support manual posting` });
      }
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // POST /api/admin/email/test-pro-welcome — manually retrigger the Pro welcome
  // email without a real Stripe charge. Useful for verifying RESEND_API_KEY /
  // deliverability after a config change.
  app.post("/api/admin/email/test-pro-welcome", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const email = normalizeSubscriberEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: "email required" });
    try {
      await sendProWelcome(email);
      return res.json({
        success: true,
        note: process.env.RESEND_API_KEY
          ? "Sent via Resend — check the inbox."
          : "RESEND_API_KEY not set — this only logged to the server console, no email was actually sent.",
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // POST /api/admin/diag/calibration — admin-gated confidence-calibration and
  // distribution-draft integrity diagnostics. Reads the two SQLite DBs prod
  // actually uses at runtime: live_signals lives in pipeline.db (getPipelineDb),
  // while distribution_drafts + signals live in edge_setter.db (getStorageDb).
  // These are separate DB files, so each is queried with its own handle — no
  // cross-DB JOIN / ATTACH. Supabase is a write-only mirror and is never read.
  app.post("/api/admin/diag/calibration", (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const pdb = getPipelineDb();   // pipeline.db   → live_signals
      const sdb = getStorageDb();    // edge_setter.db → distribution_drafts, signals

      const confidence_non_null_count = (pdb
        .prepare("SELECT COUNT(*) AS n FROM live_signals WHERE confidence IS NOT NULL")
        .get() as any).n as number;

      const distinct_confidence_values = (pdb
        .prepare("SELECT DISTINCT confidence FROM live_signals ORDER BY confidence")
        .all() as Array<{ confidence: number | null }>).map(r => r.confidence);

      const distinct_confidence_count = distinct_confidence_values.length;

      // signal_id is NOT NULL and signals.id is a non-null PRIMARY KEY, so
      // linked (IN) + orphaned (NOT IN) partition total exactly — no NULL trap.
      const distribution_drafts_total = (sdb
        .prepare("SELECT COUNT(*) AS n FROM distribution_drafts")
        .get() as any).n as number;

      const distribution_drafts_linked = (sdb
        .prepare("SELECT COUNT(*) AS n FROM distribution_drafts WHERE signal_id IN (SELECT id FROM signals)")
        .get() as any).n as number;

      const distribution_drafts_orphaned = (sdb
        .prepare("SELECT COUNT(*) AS n FROM distribution_drafts WHERE signal_id NOT IN (SELECT id FROM signals)")
        .get() as any).n as number;

      // Recent live_signals score distribution — mirrors the exact eligibility
      // window the distribution-draft batch uses: 48h (DISTRIBUTION_WINDOW_HOURS,
      // distribution-draft.ts:30) + is_archived=0. Hardcoded here to avoid
      // exporting the constant; keep in sync if that window changes.
      const cutoff48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

      const eligible_82_count = (pdb
        .prepare("SELECT COUNT(*) AS n FROM live_signals WHERE is_archived = 0 AND created_at >= ? AND score >= 82")
        .get(cutoff48h) as any).n as number;

      const recent_score_distribution = pdb
        .prepare("SELECT score_band, signal_type, COUNT(*) AS n, MAX(score) AS top FROM live_signals WHERE is_archived = 0 AND created_at >= ? GROUP BY score_band, signal_type ORDER BY n DESC")
        .all(cutoff48h) as Array<{ score_band: string; signal_type: string; n: number; top: number }>;

      const recent_max_score = pdb
        .prepare("SELECT MAX(score) AS max_recent, COUNT(*) AS rows_48h FROM live_signals WHERE is_archived = 0 AND created_at >= ?")
        .get(cutoff48h) as { max_recent: number | null; rows_48h: number };

      return res.json({
        confidence_non_null_count,
        distinct_confidence_values,
        distinct_confidence_count,
        distribution_drafts_total,
        distribution_drafts_linked,
        distribution_drafts_orphaned,
        eligible_82_count,
        recent_score_distribution,
        recent_max_score,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // POST /api/agent/social/test — send a test message to Discord and Telegram
  app.post("/api/agent/social/test", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const text = `✅ Edge Setter — integration test\n\nDraft Intelligence · 97% confidence · 1 source · Test\n#NFL #EdgeSetter`;
    const results: Record<string, any> = {};

    const { postToDiscord, canPostDiscord } = await import("./discord");
    if (canPostDiscord()) {
      results.discord = await postToDiscord(text) ? "ok" : "failed";
    } else {
      results.discord = "not_configured";
    }

    const { postToTelegram, canPostTelegram } = await import("./telegram");
    if (canPostTelegram()) {
      results.telegram = await postToTelegram(text) ? "ok" : "failed";
    } else {
      results.telegram = "not_configured";
    }

    return res.json({ success: true, results });
  });

  // ─── Daily Product Ops Agent routes ────────────────────────────────────────

  // GET /api/agent/daily-ops — list past summaries
  app.get("/api/agent/daily-ops", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const limit = Math.min(Number(req.query.limit ?? 30), 90);
    return res.json((storage as any).getDailyOpsSummaries(limit));
  });

  // GET /api/agent/daily-ops/latest — most recent summary
  app.get("/api/agent/daily-ops/latest", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const latest = (storage as any).getLatestDailyOpsSummary();
    if (!latest) return res.status(404).json({ error: "No summaries yet" });
    return res.json(latest);
  });

  // POST /api/agent/daily-ops/run — trigger manual run
  app.post("/api/agent/daily-ops/run", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const result = await runDailyOps({ sendEmailReport: req.body?.send_email !== false });
      return res.json(result);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ─── Beta Comp Grants ────────────────────────────────────────────────────────
  /**
   * POST /api/admin/grant-beta
   *
   * Grant time-boxed beta Pro access to a user by email.
   * Creates the user record if it doesn't exist yet.
   * Does NOT touch the Stripe subscription — additive override only.
   *
   * Auth: Authorization: Bearer <ADMIN_PASSWORD>  (same token as all admin routes)
   *
   * Body:
   *   { "email": "user@example.com", "beta_until": "2026-05-31T23:59:59Z" }
   *
   * Returns the updated user row + computed is_pro.
   *
   * Example (curl):
   *   curl -X POST http://localhost:5000/api/admin/grant-beta \
   *     -H "Authorization: Bearer $ADMIN_PASSWORD" \
   *     -H "Content-Type: application/json" \
   *     -d '{"email":"tester@example.com","beta_until":"2026-05-31T23:59:59Z"}'
   *
   * To revoke, set beta_until to a past date:
   *   -d '{"email":"tester@example.com","beta_until":"2020-01-01T00:00:00Z"}'
   *
   * To check current status (no admin required):
   *   curl "http://localhost:5000/api/user?email=tester@example.com"
   */
  app.post("/api/admin/grant-beta", (req, res) => {
    if (!requireAdmin(req, res)) return;

    const { email, beta_until } = req.body ?? {};

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "email is required" });
    }
    if (!beta_until || typeof beta_until !== "string") {
      return res.status(400).json({ error: "beta_until is required (ISO 8601 datetime string)" });
    }
    // Validate that beta_until is a parseable date
    const parsed = new Date(beta_until);
    if (isNaN(parsed.getTime())) {
      return res.status(400).json({ error: `beta_until is not a valid date: ${beta_until}` });
    }

    const normalizedEmail = email.toLowerCase().trim();

    try {
      // upsertUser creates if not exists, updates if exists.
      // We only set beta_until; all other fields are preserved on update.
      const user = storage.upsertUser({
        email: normalizedEmail,
        beta_until,
      } as any);

      const isActive = isProUser(user);
      const expiresIn = parsed.getTime() - Date.now();
      const expiresInDays = Math.round(expiresIn / (1000 * 60 * 60 * 24));

      console.log(`[grant-beta] ${normalizedEmail} → beta_until=${beta_until} | is_pro=${isActive} | expires_in=${expiresInDays}d`);
      storage.logEvent({
        event_name: "beta_access_granted",
        email: normalizedEmail,
        metadata: JSON.stringify({ beta_until, granted_at: new Date().toISOString() }),
      });

      return res.json({
        success: true,
        user: { ...user, is_pro: isActive },
        beta_until,
        expires_in_days: expiresInDays,
        message: isActive
          ? `Beta Pro access granted. Expires in ${expiresInDays} day(s).`
          : `beta_until set, but date is in the past — user does NOT have active Pro access.`,
      });
    } catch (err: any) {
      console.error("[grant-beta]", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/admin/grant-beta?email=...
   *
   * Debug: check beta_until and is_pro status for any email.
   * Auth: Authorization: Bearer <ADMIN_PASSWORD>
   *
   * Example:
   *   curl -H "Authorization: Bearer $ADMIN_PASSWORD" \
   *     "http://localhost:5000/api/admin/grant-beta?email=tester@example.com"
   */
  app.get("/api/admin/grant-beta", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const email = (req.query.email as string ?? "").toLowerCase().trim();
    if (!email) return res.status(400).json({ error: "email query param required" });
    const user = storage.getUserByEmail(email);
    if (!user) return res.status(404).json({ error: `No user found for email: ${email}` });
    return res.json({ ...user, is_pro: isProUser(user) });
  });

  /* ─── Ops Dashboard ─────────────────────────────────────────────────────────── */

  app.get("/api/admin/ops-dashboard", (req, res) => {
    if (!requireAdmin(req, res)) return;

    // Pipeline health (edge_setter.db)
    const pipeline_health = getAllPipelineHealth();

    // Signal volume by league — last 24h (pipeline.db)
    let signal_volume: Array<{ league: string; count: number }> = [];
    let alerts_today = 0;
    let source_accuracy: any[] = [];
    try {
      const pdb = getPipelineDb();
      const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      signal_volume = pdb.prepare(
        `SELECT league, COUNT(*) as count FROM live_signals WHERE created_at >= ? GROUP BY league ORDER BY count DESC`
      ).all(cutoff24h) as any[];
      alerts_today = (pdb.prepare(
        `SELECT COUNT(*) as n FROM live_signals WHERE alerted_at >= ?`
      ).get(cutoff24h) as any)?.n ?? 0;
      source_accuracy = pdb.prepare(
        `SELECT * FROM pipeline_source_accuracy WHERE total_signals >= 5 ORDER BY hit_rate DESC LIMIT 10`
      ).all() as any[];
    } catch { /* pipeline.db not yet populated — return empty */ }

    // Subscriber stats (edge_setter.db)
    const allUsers = storage.getAllUsers();
    const activeProUsers = allUsers.filter(u =>
      u.plan === "pro" && u.access_status === "active"
    );
    const betaUsers = allUsers.filter(u =>
      u.beta_until && new Date(u.beta_until) > new Date()
    );
    const subscribers = {
      active: activeProUsers.length,
      mrr:    activeProUsers.length * 19,
      beta:   betaUsers.length,
    };

    // Action log — merge site_watch_log anomalies + agent_logs warnings
    const action_log: Array<{ timestamp: string; component: string; message: string; severity: string }> = [];
    try {
      const watchRows = (storage as any).getSiteWatchLog(20) as any[];
      for (const row of watchRows) {
        const anomalies: string[] = Array.isArray(row.anomalies) ? row.anomalies : [];
        for (const a of anomalies.slice(0, 3)) {
          action_log.push({
            timestamp: row.run_timestamp,
            component: "site-watch",
            message:   typeof a === "string" ? a : JSON.stringify(a),
            severity:  row.status === "critical" ? "error" : "warning",
          });
        }
        if (row.recommended_action) {
          action_log.push({
            timestamp: row.run_timestamp,
            component: "site-watch",
            message:   row.recommended_action,
            severity:  "info",
          });
        }
      }
    } catch { /* skip */ }
    try {
      const agentLogs = storage.getAgentLogs(50);
      for (const log of agentLogs) {
        if (log.error_state) {
          action_log.push({
            timestamp: log.timestamp,
            component: log.agent_name,
            message:   log.error_state,
            severity:  "error",
          });
        } else if (log.warning_state) {
          action_log.push({
            timestamp: log.timestamp,
            component: log.agent_name,
            message:   log.warning_state,
            severity:  "warning",
          });
        }
      }
    } catch { /* skip */ }
    action_log.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return res.json({
      pipeline_health,
      signal_volume,
      subscribers,
      alerts_today,
      source_accuracy,
      action_log: action_log.slice(0, 20),
    });
  });

  /* ─── Alert Preferences ────────────────────────────────────────────────────── */

  app.get("/api/user/alert-preferences", (req, res) => {
    const email = req.query.email as string;
    if (!email) return res.status(400).json({ error: "email required" });
    const user = storage.getUserByEmail(email);
    if (!user || !isProUser(user)) return res.status(403).json({ error: "Pro required" });
    const prefs = getAlertPreferences(email);
    return res.json({ preferences: prefs });
  });

  app.put("/api/user/alert-preferences", (req, res) => {
    const { email, leagues, signal_types, min_confidence, channels, is_active } = req.body ?? {};
    if (!email) return res.status(400).json({ error: "email required" });
    const user = storage.getUserByEmail(email);
    if (!user || !isProUser(user)) return res.status(403).json({ error: "Pro required" });
    upsertAlertPreferences({
      email,
      leagues:        Array.isArray(leagues)      ? leagues      : ["NBA", "MLB"],
      signal_types:   Array.isArray(signal_types) ? signal_types : [],
      min_confidence: typeof min_confidence === "number" ? min_confidence : 80,
      channels:       Array.isArray(channels)     ? channels     : ["email"],
      is_active:      is_active !== false,
    });
    return res.json({ success: true });
  });

  /* ─── Push Subscriptions ────────────────────────────────────────────────────── */

  app.get("/api/alerts/vapid-public-key", (_req, res) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
    res.json({ publicKey: publicKey || null });
  });

  app.post("/api/user/push-subscription", (req, res) => {
    const { email, endpoint, p256dh, auth } = req.body ?? {};
    if (!email || !endpoint || !p256dh || !auth) {
      return res.status(400).json({ error: "email, endpoint, p256dh, auth required" });
    }
    const user = storage.getUserByEmail(email);
    if (!user || !isProUser(user)) return res.status(403).json({ error: "Pro required" });
    upsertPushSubscription({ email, endpoint, p256dh, auth });
    return res.json({ success: true });
  });

  app.delete("/api/user/push-subscription", (req, res) => {
    const { email, endpoint } = req.body ?? {};
    if (!endpoint) return res.status(400).json({ error: "endpoint required" });
    if (email) {
      const user = storage.getUserByEmail(email);
      if (!user || !isProUser(user)) return res.status(403).json({ error: "Pro required" });
    }
    deletePushSubscription(endpoint);
    return res.json({ success: true });
  });

  // ─── Historical Backfill ──────────────────────────────────────────────────────

  // POST /api/pipeline/backfill — kick off historical backfill (runs in background)
  app.post("/api/pipeline/backfill", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { password, ...options } = req.body ?? {};
    res.json({ accepted: true, message: "Backfill started in background — poll /api/pipeline/backfill-status" });
    runFullBackfill(options).then(summary => {
      console.log("[backfill] Complete:", JSON.stringify(summary));
    }).catch(err => {
      console.error("[backfill] Fatal error:", err.message);
    });
  });

  // GET /api/pipeline/backfill-status — show progress phases from persistent storage.db
  app.get("/api/pipeline/backfill-status", (req, res) => {
    if (!requireAdmin(req, res)) return;
    return res.json({ phases: getAllBackfillProgress() });
  });

  // POST /api/admin/seed-social-posts
  // Backfills social_posts from distribution_drafts rows that are already status="posted".
  // Safe to run multiple times — INSERT OR IGNORE means no duplicates.
  app.post("/api/admin/seed-social-posts", (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const drafts = (storage as any).getDistributionDrafts({ status: "posted" }) as Array<{
        signal_id: string; channel: string; posted_at: string | null;
      }>;
      const platforms = new Set(["x", "discord", "telegram"]);
      let seeded = 0;
      let skipped = 0;
      for (const d of drafts) {
        if (!platforms.has(d.channel) || !d.signal_id) { skipped++; continue; }
        if ((storage as any).hasSocialPost(d.signal_id, d.channel)) { skipped++; continue; }
        (storage as any).recordSocialPost(d.signal_id, d.channel);
        seeded++;
      }
      res.json({ ok: true, seeded, skipped, total: drafts.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return httpServer;
}
