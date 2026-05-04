import type { Express } from "express";
import { Server } from "http";
import { storage, getAlertPreferences, upsertAlertPreferences, getActiveAlertUsers, getPushSubscriptions, upsertPushSubscription, deletePushSubscription, getAllPipelineHealth } from "./storage";
import { insertWaitlistSchema } from "@shared/schema";
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
import { getPipelineDb } from "./pipeline/store";
import type { LiveSignal } from "./pipeline/types";

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
  // ─── Seed demo data on startup (non-blocking) ─────────────────────────────────
  seedDemoData().catch(e => console.error("Seed error:", e));
  seedSignals().catch(e => console.error("Signal seed error:", e));

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
        const ownerEmail = process.env.OWNER_EMAIL ?? "ddcolletti@gmail.com";
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
    res.json(scores);
  });

  // ─── Admin DB Debug ───────────────────────────────────────────────────────────
  app.get("/api/admin/debug-db", (_req, res) => {
    const pdb = getPipelineDb();
    const count = (pdb.prepare("SELECT COUNT(*) as n FROM live_signals").get() as any)?.n ?? 0;
    const sample = pdb.prepare("SELECT id, league, player, signal_type, created_at FROM live_signals ORDER BY created_at DESC LIMIT 10").all();
    const rawCount = (pdb.prepare("SELECT COUNT(*) as n FROM raw_events").get() as any)?.n ?? 0;
    const rawUnprocessed = (pdb.prepare("SELECT COUNT(*) as n FROM raw_events WHERE processed=0").get() as any)?.n ?? 0;
    return res.json({ live_signals_count: count, raw_events_count: rawCount, raw_unprocessed: rawUnprocessed, sample });
  });

  // ─── Admin Review Queue ───────────────────────────────────────────────────────
  app.get("/api/admin/review", (_req, res) => {
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
    const verdict = storage.resolveReview(req.params.id);
    if (!verdict) return res.status(404).json({ error: "Not found" });
    // Now publish the alert since it's resolved
    if (verdict.claim_id) {
      publisherAgent(verdict.claim_id).catch(() => {});
    }
    return res.json({ success: true, verdict });
  });

  // ─── Alerts ──────────────────────────────────────────────────────────────────
  app.get("/api/alerts", (_req, res) => {
    const alertList = storage.getAlerts();
    res.json(alertList);
  });

  app.post("/api/alerts/:id/send", (req, res) => {
    const alert = storage.markAlertSent(req.params.id);
    if (!alert) return res.status(404).json({ error: "Not found" });
    return res.json({ success: true, alert });
  });

  // ─── Agent Pipeline (manual trigger for demo) ─────────────────────────────────
  app.post("/api/pipeline/run", async (req, res) => {
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
  app.get("/api/events", (_req, res) => {
    const evts = storage.getEvents();
    res.json(evts);
  });

  // ─── Verdicts ─────────────────────────────────────────────────────────────────
  app.get("/api/verdicts", (_req, res) => {
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
  app.get("/api/signals/all", (_req, res) => {
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
    try {
      const data = insertSignalSchema.parse(req.body);
      return res.json(storage.createSignal(data));
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
  });
  app.patch("/api/signals/:id", (req, res) => {
    const sig = storage.updateSignal(req.params.id, req.body);
    if (!sig) return res.status(404).json({ error: "Not found" });
    return res.json(sig);
  });

  app.delete("/api/admin/signals/:id", (req, res) => {
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "edgesetter-admin-2026";
    const auth = req.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
    const exists = storage.getSignal(req.params.id);
    if (!exists) return res.status(404).json({ error: "Signal not found" });
    storage.deleteSignal(req.params.id);
    return res.json({ deleted: true, id: req.params.id });
  });

  app.post("/api/admin/make-pro", (req, res) => {
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "edgesetter-admin-2026";
    const auth = req.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });

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
  app.get("/api/user", (req, res) => {
    const email = req.query.email as string;
    if (!email) return res.json(null);
    const user = storage.getUserByEmail(email) ?? null;
    if (!user) return res.json(null);
    // Attach computed is_pro flag — covers both Stripe path and beta_until comp path.
    // Client should prefer this flag over re-implementing the logic.
    return res.json({ ...user, is_pro: isProUser(user) });
  });

  // ─── MVP: Stripe Checkout ──────────────────────────────────────────────────────
  app.post("/api/checkout", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "email required" });
    try {
      const stripe = getStripe();
      const baseUrl = process.env.BASE_URL ?? "https://edgesetter.net";
      let customerId: string | undefined;
      const existingUser = storage.getUserByEmail(email);
      if (existingUser?.stripe_customer_id) {
        customerId = existingUser.stripe_customer_id;
      } else {
        const customer = await stripe.customers.create({ email });
        customerId = customer.id;
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
        cancel_url: `${baseUrl}/#/signals`,
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
        // express.raw() gives us a Buffer here when Content-Type is application/json
        event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
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
        const email = session.metadata?.email ?? session.customer_email;
        if (email) {
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
  app.post("/api/billing/portal", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "email required" });
    try {
      const stripe = getStripe();
      const user = storage.getUserByEmail(email);
      if (!user?.stripe_customer_id) return res.status(404).json({ error: "No billing account found for this email" });
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        return_url: `${process.env.BASE_URL ?? "https://edgesetter.net"}/#/pro`,
      });
      storage.logEvent({ event_name: "billing_portal_opened", email, metadata: JSON.stringify({ customer_id: user.stripe_customer_id }) });
      return res.json({ url: session.url });
    } catch (e: any) {
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
      if (session.payment_status === "paid" || session.status === "complete") {
        const proData = { email, stripe_customer_id: session.customer as string, stripe_subscription_id: session.subscription as string, plan: "pro", access_status: "active" };
        storage.upsertUser(proData);
        storage.logEvent({ event_name: "success_page_view", email, metadata: JSON.stringify({ session_id }) });
        syncToSupabase("users", proData, "upsert").catch(() => {});
        syncToSupabase("event_log", { event_name: "subscription_started", email, metadata: { session_id } }, "insert").catch(() => {});
        sendProWelcome(email).catch(() => {});
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
    const { password } = req.body;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "edgesetter-admin-2026";
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Unauthorized" });
    }
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
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "edgesetter-admin-2026";
    const authHeader = req.headers.authorization ?? "";
    const password = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : req.body?.password;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
    try {
      const result = await runSignalOps(req.body);
      return res.json(result);
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
  });

  // POST /api/agent/signal-ops/batch — ingest multiple signals
  app.post("/api/agent/signal-ops/batch", async (req, res) => {
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "edgesetter-admin-2026";
    const authHeader = req.headers.authorization ?? "";
    const password = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : req.body?.password;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
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
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "edgesetter-admin-2026";
    const authHeader = req.headers.authorization ?? "";
    const password = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : (req.query.password as string);
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
    const decision = req.query.decision as string | undefined;
    const items = (storage as any).getSignalOpsQueue(decision);
    return res.json({ count: items.length, items });
  });

  // POST /api/agent/signal-ops/queue/:id/approve — human approves review_required item
  app.post("/api/agent/signal-ops/queue/:id/approve", async (req, res) => {
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "edgesetter-admin-2026";
    const password = req.body?.password;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
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
        is_featured: 0,
        is_public: 1,
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
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "edgesetter-admin-2026";
    const password = req.body?.password;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
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
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "edgesetter-admin-2026";
    const authHeader = req.headers.authorization ?? "";
    const password = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : (req.query.password as string);
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    return res.json((storage as any).getSiteWatchLog(limit));
  });

  // POST /api/agent/site-watch/run — trigger a manual run
  app.post("/api/agent/site-watch/run", async (req, res) => {
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "edgesetter-admin-2026";
    const authHeader = req.headers.authorization ?? "";
    const password = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : req.body?.password;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
    try {
      const result = await runSiteWatch();
      return res.json(result);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/waitlist", (_req, res) => { res.json(storage.getWaitlist()); });
  app.get("/api/admin/waitlist/csv", (_req, res) => {
    const list = storage.getWaitlist();
    const csv = ["id,email,name,role,created_at", ...list.map(r => `${r.id},${r.email},${r.name ?? ""},${r.role ?? ""},${r.created_at}`)].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=waitlist.csv");
    res.send(csv);
  });
  app.get("/api/admin/users", (_req, res) => { res.json(storage.getAllUsers()); });
  app.get("/api/admin/event-log", (_req, res) => { res.json(storage.getEventLog()); });

  // ─── Distribution Draft Agent routes ──────────────────────────────────────
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "edgesetter-admin-2026";

  function requireAdmin(req: any, res: any): boolean {
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
   *     -H "Authorization: Bearer edgesetter-admin-2026" \
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
   *   curl -H "Authorization: Bearer edgesetter-admin-2026" \
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