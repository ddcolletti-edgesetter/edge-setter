import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { eq, desc, and, or } from "drizzle-orm";
import {
  sources, events, claims, evidence, verdicts,
  source_scores, alerts, waitlist, agent_logs,
  signals, source_notes, users, event_log, digest_subscribers,
  type Source, type InsertSource,
  type Event, type InsertEvent,
  type Claim, type InsertClaim,
  type Evidence, type InsertEvidence,
  type Verdict, type InsertVerdict,
  type SourceScore, type InsertSourceScore,
  type Alert, type InsertAlert,
  type Waitlist, type InsertWaitlist,
  type AgentLog, type InsertAgentLog,
  type SignalFeedItem,
  type Signal, type InsertSignal,
  type SourceNote, type InsertSourceNote,
  type User, type InsertUser,
  type EventLog, type InsertEventLog,
  type DigestSubscriber, type InsertDigestSubscriber,
} from "@shared/schema";

// Resolve a writable directory for SQLite.
// Priority: DATA_DIR env var → /tmp (always writable) → . (local dev)
function resolveDataDir(): string {
  const candidates = [
    process.env.DATA_DIR,
    "/tmp",
    ".",
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      // Probe write access
      const probe = path.join(dir, ".write_probe");
      fs.writeFileSync(probe, "1");
      fs.unlinkSync(probe);
      return dir;
    } catch {
      // Not writable — try next candidate
    }
  }
  return ".";
}

const dataDir = resolveDataDir();
console.log(`[db] SQLite data directory: ${dataDir}`);
const dbPath = path.join(dataDir, "edge_setter.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite);

// ─── Schema init ─────────────────────────────────────────────────────────────
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    team TEXT,
    platform TEXT,
    url TEXT,
    trust_tier TEXT,
    reliability_score NUMERIC DEFAULT 50,
    speed_score NUMERIC DEFAULT 50,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    sport TEXT NOT NULL DEFAULT 'football',
    league TEXT,
    team TEXT,
    player TEXT,
    topic TEXT,
    cluster_key TEXT,
    urgency_score NUMERIC DEFAULT 0,
    impact_score NUMERIC DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY,
    event_id TEXT REFERENCES events(id),
    source_id TEXT REFERENCES sources(id),
    claim_type TEXT,
    raw_claim_text TEXT,
    normalized_claim TEXT,
    claim_status TEXT DEFAULT 'pending',
    confidence_score NUMERIC DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS evidence (
    id TEXT PRIMARY KEY,
    claim_id TEXT REFERENCES claims(id),
    source_url TEXT,
    evidence_type TEXT,
    stance TEXT,
    extracted_text TEXT,
    authority_level INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS verdicts (
    id TEXT PRIMARY KEY,
    claim_id TEXT REFERENCES claims(id),
    verdict TEXT,
    confidence_score NUMERIC,
    rationale TEXT,
    needs_human_review INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS source_scores (
    id TEXT PRIMARY KEY,
    source_id TEXT REFERENCES sources(id),
    overall_accuracy NUMERIC DEFAULT 0,
    average_lead_time_minutes NUMERIC DEFAULT 0,
    draft_accuracy NUMERIC DEFAULT 0,
    injury_accuracy NUMERIC DEFAULT 0,
    portal_accuracy NUMERIC DEFAULT 0,
    false_positive_rate NUMERIC DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    verdict_id TEXT REFERENCES verdicts(id),
    channel TEXT,
    audience TEXT,
    message_text TEXT,
    sent_at TEXT,
    click_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS waitlist (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT,
    role TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    player_name TEXT NOT NULL,
    team TEXT NOT NULL,
    signal_type TEXT NOT NULL,
    status_tag TEXT NOT NULL DEFAULT 'verified',
    confidence_score INTEGER NOT NULL DEFAULT 80,
    source_count INTEGER NOT NULL DEFAULT 1,
    topic TEXT,
    verdict TEXT NOT NULL,
    summary TEXT NOT NULL,
    action_takeaway TEXT NOT NULL,
    published_at TEXT DEFAULT CURRENT_TIMESTAMP,
    is_featured INTEGER DEFAULT 0,
    is_public INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS source_notes (
    id TEXT PRIMARY KEY,
    signal_id TEXT REFERENCES signals(id),
    source_name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    trust_score INTEGER,
    note TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    first_name TEXT,
    plan TEXT NOT NULL DEFAULT 'free',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    access_status TEXT NOT NULL DEFAULT 'pending',
    billing_status TEXT DEFAULT 'active',
    billing_email_sent TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS event_log (
    id TEXT PRIMARY KEY,
    event_name TEXT NOT NULL,
    email TEXT,
    user_id TEXT,
    metadata TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS agent_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    input_ref TEXT,
    output_ref TEXT,
    decision_summary TEXT,
    error_state TEXT,
    warning_state TEXT
  );
  CREATE TABLE IF NOT EXISTS digest_subscribers (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    unsubscribe_token TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    source TEXT NOT NULL DEFAULT 'landing',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

function uuid() {
  return crypto.randomUUID();
}
function now() {
  return new Date().toISOString();
}

// ─── IStorage interface ───────────────────────────────────────────────────────
export interface IStorage {
  // Sources
  getSources(): Source[];
  getSource(id: string): Source | undefined;
  createSource(data: InsertSource): Source;
  // Events
  getEvents(): Event[];
  getEvent(id: string): Event | undefined;
  createEvent(data: InsertEvent): Event;
  // Claims
  getClaims(): Claim[];
  getClaimsByEvent(event_id: string): Claim[];
  getClaim(id: string): Claim | undefined;
  createClaim(data: InsertClaim): Claim;
  updateClaimStatus(id: string, status: string): Claim | undefined;
  // Evidence
  getEvidenceForClaim(claim_id: string): Evidence[];
  createEvidence(data: InsertEvidence): Evidence;
  // Verdicts
  getVerdicts(): Verdict[];
  getVerdictForClaim(claim_id: string): Verdict | undefined;
  createVerdict(data: InsertVerdict): Verdict;
  getReviewQueue(): Verdict[];
  resolveReview(verdict_id: string): Verdict | undefined;
  // Source Scores
  getSourceScores(): (SourceScore & { source_name: string; trust_tier: string | null; source_type: string | null; source_url: string | null })[];
  getSourceScore(source_id: string): SourceScore | undefined;
  upsertSourceScore(data: InsertSourceScore): SourceScore;
  // Alerts
  getAlerts(): Alert[];
  createAlert(data: InsertAlert): Alert;
  markAlertSent(id: string): Alert | undefined;
  // Waitlist
  addToWaitlist(data: InsertWaitlist): Waitlist;
  getWaitlist(): Waitlist[];
  waitlistEmailExists(email: string): boolean;
  // Agent Logs
  logAgentAction(data: InsertAgentLog): AgentLog;
  getAgentLogs(limit?: number): AgentLog[];
  // Signal Feed
  getSignalFeed(filters?: { league?: string; topic?: string; verdict?: string }): SignalFeedItem[];
  // Digest Subscribers
  addDigestSubscriber(data: Omit<InsertDigestSubscriber, 'id'>): DigestSubscriber;
  getDigestSubscribers(): DigestSubscriber[];
  unsubscribeDigest(token: string): boolean;
  digestEmailExists(email: string): boolean;
}

// ─── Implementation ────────────────────────────────────────────────────────────
export class SqliteStorage implements IStorage {
  getSources(): Source[] {
    return db.select().from(sources).orderBy(desc(sources.created_at)).all();
  }
  getSource(id: string): Source | undefined {
    return db.select().from(sources).where(eq(sources.id, id)).get();
  }
  createSource(data: InsertSource): Source {
    const row = { ...data, id: uuid(), created_at: now() };
    return db.insert(sources).values(row).returning().get();
  }

  getEvents(): Event[] {
    return db.select().from(events).orderBy(desc(events.created_at)).all();
  }
  getEvent(id: string): Event | undefined {
    return db.select().from(events).where(eq(events.id, id)).get();
  }
  createEvent(data: InsertEvent): Event {
    const row = { ...data, id: uuid(), created_at: now(), updated_at: now() };
    return db.insert(events).values(row).returning().get();
  }

  getClaims(): Claim[] {
    return db.select().from(claims).orderBy(desc(claims.created_at)).all();
  }
  getClaimsByEvent(event_id: string): Claim[] {
    return db.select().from(claims).where(eq(claims.event_id, event_id)).all();
  }
  getClaim(id: string): Claim | undefined {
    return db.select().from(claims).where(eq(claims.id, id)).get();
  }
  createClaim(data: InsertClaim): Claim {
    const row = { ...data, id: uuid(), created_at: now() };
    return db.insert(claims).values(row).returning().get();
  }
  updateClaimStatus(id: string, status: string): Claim | undefined {
    return db.update(claims).set({ claim_status: status }).where(eq(claims.id, id)).returning().get();
  }

  getEvidenceForClaim(claim_id: string): Evidence[] {
    return db.select().from(evidence).where(eq(evidence.claim_id, claim_id)).all();
  }
  createEvidence(data: InsertEvidence): Evidence {
    const row = { ...data, id: uuid(), created_at: now() };
    return db.insert(evidence).values(row).returning().get();
  }

  getVerdicts(): Verdict[] {
    return db.select().from(verdicts).orderBy(desc(verdicts.created_at)).all();
  }
  getVerdictForClaim(claim_id: string): Verdict | undefined {
    return db.select().from(verdicts).where(eq(verdicts.claim_id, claim_id)).get();
  }
  createVerdict(data: InsertVerdict): Verdict {
    const row = { ...data, id: uuid(), created_at: now() };
    return db.insert(verdicts).values(row).returning().get();
  }
  getReviewQueue(): Verdict[] {
    return db.select().from(verdicts)
      .where(eq(verdicts.needs_human_review, 1))
      .orderBy(desc(verdicts.created_at))
      .all();
  }
  resolveReview(verdict_id: string): Verdict | undefined {
    return db.update(verdicts)
      .set({ needs_human_review: 0 })
      .where(eq(verdicts.id, verdict_id))
      .returning().get();
  }

  getSourceScores(): (SourceScore & { source_name: string; trust_tier: string | null; source_type: string | null; source_url: string | null })[] {
    const rows = db.select().from(source_scores)
      .orderBy(desc(source_scores.overall_accuracy))
      .all();
    return rows.map(r => {
      const src = this.getSource(r.source_id ?? "");
      return {
        ...r,
        source_name: src?.name ?? "Unknown",
        trust_tier: src?.trust_tier ?? null,
        source_type: src?.source_type ?? null,
        source_url: src?.url ?? null,
      };
    });
  }
  getSourceScore(source_id: string): SourceScore | undefined {
    return db.select().from(source_scores).where(eq(source_scores.source_id, source_id)).get();
  }
  upsertSourceScore(data: InsertSourceScore): SourceScore {
    const existing = this.getSourceScore(data.source_id ?? "");
    if (existing) {
      return db.update(source_scores)
        .set({ ...data, updated_at: now() })
        .where(eq(source_scores.source_id, data.source_id ?? ""))
        .returning().get()!;
    }
    const row = { ...data, id: uuid(), updated_at: now() };
    return db.insert(source_scores).values(row).returning().get();
  }

  getAlerts(): Alert[] {
    return db.select().from(alerts).orderBy(desc(alerts.created_at)).all();
  }
  createAlert(data: InsertAlert): Alert {
    const row = { ...data, id: uuid(), created_at: now() };
    return db.insert(alerts).values(row).returning().get();
  }
  markAlertSent(id: string): Alert | undefined {
    return db.update(alerts).set({ sent_at: now() }).where(eq(alerts.id, id)).returning().get();
  }

  addToWaitlist(data: InsertWaitlist): Waitlist {
    const row = { ...data, id: uuid(), created_at: now() };
    return db.insert(waitlist).values(row).returning().get();
  }
  getWaitlist(): Waitlist[] {
    return db.select().from(waitlist).orderBy(desc(waitlist.created_at)).all();
  }
  waitlistEmailExists(email: string): boolean {
    const row = db.select().from(waitlist).where(eq(waitlist.email, email)).get();
    return !!row;
  }

  logAgentAction(data: InsertAgentLog): AgentLog {
    return db.insert(agent_logs).values(data).returning().get();
  }
  getAgentLogs(limit = 100): AgentLog[] {
    return db.select().from(agent_logs)
      .orderBy(desc(agent_logs.timestamp))
      .limit(limit)
      .all();
  }

  getSignalFeed(filters?: { league?: string; topic?: string; verdict?: string }): SignalFeedItem[] {
    // Raw SQL join for the denormalized feed
    let query = `
      SELECT 
        v.id, e.player, e.team, e.league, e.topic,
        c.normalized_claim, v.verdict, v.confidence_score,
        v.needs_human_review, e.urgency_score, e.impact_score,
        s.name as source_name, s.trust_tier,
        v.rationale, e.id as event_id, c.id as claim_id,
        v.created_at
      FROM verdicts v
      LEFT JOIN claims c ON c.id = v.claim_id
      LEFT JOIN events e ON e.id = c.event_id
      LEFT JOIN sources s ON s.id = c.source_id
      WHERE v.needs_human_review = 0
    `;
    const params: string[] = [];
    if (filters?.league) { query += ` AND e.league = ?`; params.push(filters.league); }
    if (filters?.topic) { query += ` AND e.topic = ?`; params.push(filters.topic); }
    if (filters?.verdict) { query += ` AND v.verdict = ?`; params.push(filters.verdict); }
    query += ` ORDER BY v.created_at DESC LIMIT 100`;
    return sqlite.prepare(query).all(...params) as SignalFeedItem[];
  }

  // ─── Signals ───────────────────────────────────────────────────────────────
  getSignals(publicOnly = true): Signal[] {
    if (publicOnly) {
      return db.select().from(signals).where(eq(signals.is_public, true)).orderBy(desc(signals.published_at)).all();
    }
    return db.select().from(signals).orderBy(desc(signals.published_at)).all();
  }
  getSignal(id: string): Signal | undefined {
    return db.select().from(signals).where(eq(signals.id, id)).get();
  }
  getFeaturedSignal(): Signal | undefined {
    return db.select().from(signals).where(and(eq(signals.is_featured, true), eq(signals.is_public, true))).get();
  }
  createSignal(data: InsertSignal): Signal {
    const row = { ...data, id: uuid(), created_at: now(), updated_at: now() };
    return db.insert(signals).values(row).returning().get();
  }
  updateSignal(id: string, data: Partial<InsertSignal>): Signal | undefined {
    return db.update(signals).set({ ...data, updated_at: now() }).where(eq(signals.id, id)).returning().get();
  }
  signalExists(): boolean {
    const row = db.select().from(signals).get();
    return !!row;
  }

  // ─── Source Notes ──────────────────────────────────────────────────────────
  getSourceNotes(signal_id: string): SourceNote[] {
    return db.select().from(source_notes).where(eq(source_notes.signal_id, signal_id)).all();
  }
  createSourceNote(data: InsertSourceNote): SourceNote {
    const row = { ...data, id: uuid(), created_at: now() };
    return db.insert(source_notes).values(row).returning().get();
  }

  // ─── Users ─────────────────────────────────────────────────────────────────
  getUserByEmail(email: string): User | undefined {
    return db.select().from(users).where(eq(users.email, email)).get();
  }
  getUserByStripeCustomer(customerId: string): User | undefined {
    return db.select().from(users).where(eq(users.stripe_customer_id, customerId)).get();
  }
  getUser(id: string): User | undefined {
    return db.select().from(users).where(eq(users.id, id)).get();
  }
  upsertUser(data: InsertUser): User {
    const existing = data.email ? this.getUserByEmail(data.email) : undefined;
    if (existing) {
      return db.update(users).set({ ...data, updated_at: now() }).where(eq(users.id, existing.id)).returning().get()!;
    }
    const row = { ...data, id: uuid(), created_at: now(), updated_at: now() };
    return db.insert(users).values(row).returning().get();
  }
  updateUserByStripeCustomer(customerId: string, data: Partial<InsertUser>): User | undefined {
    return db.update(users).set({ ...data, updated_at: now() }).where(eq(users.stripe_customer_id, customerId)).returning().get();
  }
  getAllUsers(): User[] {
    return db.select().from(users).orderBy(desc(users.created_at)).all();
  }

  // ─── Digest Subscribers ─────────────────────────────────────────────────────
  addDigestSubscriber(data: Omit<InsertDigestSubscriber, 'id'>): DigestSubscriber {
    // Upsert: if email already exists, reactivate
    const existing = db.select().from(digest_subscribers).where(eq(digest_subscribers.email, data.email)).get();
    if (existing) {
      return db.update(digest_subscribers)
        .set({ is_active: true, source: data.source })
        .where(eq(digest_subscribers.id, existing.id))
        .returning().get()!;
    }
    const row = { ...data, id: uuid(), created_at: now() };
    return db.insert(digest_subscribers).values(row).returning().get();
  }
  getDigestSubscribers(): DigestSubscriber[] {
    return db.select().from(digest_subscribers)
      .where(eq(digest_subscribers.is_active, true))
      .orderBy(desc(digest_subscribers.created_at))
      .all();
  }
  unsubscribeDigest(token: string): boolean {
    const row = db.select().from(digest_subscribers).where(eq(digest_subscribers.unsubscribe_token, token)).get();
    if (!row) return false;
    db.update(digest_subscribers).set({ is_active: false }).where(eq(digest_subscribers.id, row.id)).run();
    return true;
  }
  digestEmailExists(email: string): boolean {
    const row = db.select().from(digest_subscribers).where(eq(digest_subscribers.email, email)).get();
    return !!row && row.is_active;
  }

  // ─── Event Log ─────────────────────────────────────────────────────────────
  logEvent(data: InsertEventLog): EventLog {
    const row = { ...data, id: uuid(), created_at: now() };
    return db.insert(event_log).values(row).returning().get();
  }
  getEventLog(limit = 200): EventLog[] {
    return db.select().from(event_log).orderBy(desc(event_log.created_at)).limit(limit).all();
  }
}

export const storage = new SqliteStorage();

