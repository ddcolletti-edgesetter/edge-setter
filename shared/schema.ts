import { sqliteTable, text, numeric, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Sources ────────────────────────────────────────────────────────────────
export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  source_type: text("source_type").notNull(), // official | reporter | analyst | aggregator
  team: text("team"),
  platform: text("platform"),
  url: text("url"),
  trust_tier: text("trust_tier"), // tier1 | tier2 | tier3 | tier4 | tier5
  reliability_score: numeric("reliability_score").default("50"),
  speed_score: numeric("speed_score").default("50"),
  created_at: text("created_at").default(new Date().toISOString()),
});

export const insertSourceSchema = createInsertSchema(sources).omit({ created_at: true });
export type InsertSource = z.infer<typeof insertSourceSchema>;
export type Source = typeof sources.$inferSelect;

// ─── Events ─────────────────────────────────────────────────────────────────
export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  sport: text("sport").notNull().default("football"),
  league: text("league"),
  team: text("team"),
  player: text("player"),
  topic: text("topic"), // injury | draft | trade | depth_chart | coaching | transaction | game
  cluster_key: text("cluster_key"),
  urgency_score: numeric("urgency_score").default("0"),
  impact_score: numeric("impact_score").default("0"),
  created_at: text("created_at").default(new Date().toISOString()),
  updated_at: text("updated_at").default(new Date().toISOString()),
});

export const insertEventSchema = createInsertSchema(events).omit({ created_at: true, updated_at: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

// ─── Claims ──────────────────────────────────────────────────────────────────
export const claims = sqliteTable("claims", {
  id: text("id").primaryKey(),
  event_id: text("event_id").references(() => events.id),
  source_id: text("source_id").references(() => sources.id),
  claim_type: text("claim_type"),
  raw_claim_text: text("raw_claim_text"),
  normalized_claim: text("normalized_claim"),
  claim_status: text("claim_status").default("pending"), // pending | processing | complete | review
  confidence_score: numeric("confidence_score").default("0"),
  created_at: text("created_at").default(new Date().toISOString()),
});

export const insertClaimSchema = createInsertSchema(claims).omit({ created_at: true });
export type InsertClaim = z.infer<typeof insertClaimSchema>;
export type Claim = typeof claims.$inferSelect;

// ─── Evidence ────────────────────────────────────────────────────────────────
export const evidence = sqliteTable("evidence", {
  id: text("id").primaryKey(),
  claim_id: text("claim_id").references(() => claims.id),
  source_url: text("source_url"),
  evidence_type: text("evidence_type"),
  stance: text("stance"), // support | contradict | context
  extracted_text: text("extracted_text"),
  authority_level: integer("authority_level").default(1),
  created_at: text("created_at").default(new Date().toISOString()),
});

export const insertEvidenceSchema = createInsertSchema(evidence).omit({ created_at: true });
export type InsertEvidence = z.infer<typeof insertEvidenceSchema>;
export type Evidence = typeof evidence.$inferSelect;

// ─── Verdicts ────────────────────────────────────────────────────────────────
export const verdicts = sqliteTable("verdicts", {
  id: text("id").primaryKey(),
  claim_id: text("claim_id").references(() => claims.id),
  verdict: text("verdict"), // confirmed | likely | rumor | contradicted | review
  confidence_score: numeric("confidence_score"),
  rationale: text("rationale"),
  needs_human_review: integer("needs_human_review").default(0), // 0=false, 1=true
  created_at: text("created_at").default(new Date().toISOString()),
});

export const insertVerdictSchema = createInsertSchema(verdicts).omit({ created_at: true });
export type InsertVerdict = z.infer<typeof insertVerdictSchema>;
export type Verdict = typeof verdicts.$inferSelect;

// ─── Source Scores ────────────────────────────────────────────────────────────
export const source_scores = sqliteTable("source_scores", {
  id: text("id").primaryKey(),
  source_id: text("source_id").references(() => sources.id),
  overall_accuracy: numeric("overall_accuracy").default("0"),
  average_lead_time_minutes: numeric("average_lead_time_minutes").default("0"),
  draft_accuracy: numeric("draft_accuracy").default("0"),
  injury_accuracy: numeric("injury_accuracy").default("0"),
  portal_accuracy: numeric("portal_accuracy").default("0"),
  false_positive_rate: numeric("false_positive_rate").default("0"),
  updated_at: text("updated_at").default(new Date().toISOString()),
});

export const insertSourceScoreSchema = createInsertSchema(source_scores).omit({ updated_at: true });
export type InsertSourceScore = z.infer<typeof insertSourceScoreSchema>;
export type SourceScore = typeof source_scores.$inferSelect;

// ─── Alerts ──────────────────────────────────────────────────────────────────
export const alerts = sqliteTable("alerts", {
  id: text("id").primaryKey(),
  verdict_id: text("verdict_id").references(() => verdicts.id),
  channel: text("channel"), // email | push | feed
  audience: text("audience"), // bettor | fantasy | all | pro
  message_text: text("message_text"),
  sent_at: text("sent_at"),
  click_count: integer("click_count").default(0),
  created_at: text("created_at").default(new Date().toISOString()),
});

export const insertAlertSchema = createInsertSchema(alerts).omit({ created_at: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alerts.$inferSelect;

// ─── Waitlist ─────────────────────────────────────────────────────────────────
export const waitlist = sqliteTable("waitlist", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  role: text("role"), // bettor | fantasy | both | media
  created_at: text("created_at").default(new Date().toISOString()),
});

export const insertWaitlistSchema = createInsertSchema(waitlist)
  .omit({ created_at: true, id: true })
  .extend({ email: z.string().email("Valid email required") });
export type InsertWaitlist = z.infer<typeof insertWaitlistSchema>;
export type Waitlist = typeof waitlist.$inferSelect;

// ─── Signals (MVP public board) ─────────────────────────────────────────────
export const signals = sqliteTable("signals", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  player_name: text("player_name").notNull(),
  team: text("team").notNull(),
  signal_type: text("signal_type").notNull(),
  status_tag: text("status_tag").notNull().default("verified"), // verified | high-risk | speculative
  confidence_score: integer("confidence_score").notNull().default(80),
  source_count: integer("source_count").notNull().default(1),
  verdict: text("verdict").notNull(),
  summary: text("summary").notNull(),
  action_takeaway: text("action_takeaway").notNull(),
  published_at: text("published_at").default(new Date().toISOString()),
  is_featured: integer("is_featured", { mode: "boolean" }).default(false),
  is_public: integer("is_public", { mode: "boolean" }).default(true),
  created_at: text("created_at").default(new Date().toISOString()),
  updated_at: text("updated_at").default(new Date().toISOString()),
});

export const insertSignalSchema = createInsertSchema(signals).omit({ created_at: true, updated_at: true });
export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type Signal = typeof signals.$inferSelect;

// ─── Source Notes ─────────────────────────────────────────────────────────────
export const source_notes = sqliteTable("source_notes", {
  id: text("id").primaryKey(),
  signal_id: text("signal_id").references(() => signals.id),
  source_name: text("source_name").notNull(),
  source_type: text("source_type").notNull(),
  trust_score: integer("trust_score"),
  note: text("note").notNull(),
  created_at: text("created_at").default(new Date().toISOString()),
});

export const insertSourceNoteSchema = createInsertSchema(source_notes).omit({ created_at: true });
export type InsertSourceNote = z.infer<typeof insertSourceNoteSchema>;
export type SourceNote = typeof source_notes.$inferSelect;

// ─── Users (subscribers) ──────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  first_name: text("first_name"),
  plan: text("plan").notNull().default("free"), // free | pro
  stripe_customer_id: text("stripe_customer_id"),
  stripe_subscription_id: text("stripe_subscription_id"),
  access_status: text("access_status").notNull().default("pending"), // pending | active | canceled
  billing_status: text("billing_status").default("active"), // active | past_due | payment_failed | canceled
  billing_email_sent: text("billing_email_sent"), // ISO timestamp of last billing retry email sent
  created_at: text("created_at").default(new Date().toISOString()),
  updated_at: text("updated_at").default(new Date().toISOString()),
});

export const insertUserSchema = createInsertSchema(users).omit({ created_at: true, updated_at: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ─── Event Log (analytics) ────────────────────────────────────────────────────
export const event_log = sqliteTable("event_log", {
  id: text("id").primaryKey(),
  event_name: text("event_name").notNull(),
  email: text("email"),
  user_id: text("user_id"),
  metadata: text("metadata"), // JSON string
  created_at: text("created_at").default(new Date().toISOString()),
});

export const insertEventLogSchema = createInsertSchema(event_log).omit({ created_at: true });
export type InsertEventLog = z.infer<typeof insertEventLogSchema>;
export type EventLog = typeof event_log.$inferSelect;

// ─── Digest Subscribers ─────────────────────────────────────────────────────
export const digest_subscribers = sqliteTable("digest_subscribers", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  unsubscribe_token: text("unsubscribe_token").notNull(),
  is_active: integer("is_active", { mode: "boolean" }).notNull().default(true),
  source: text("source").notNull().default("landing"), // landing | waitlist | checkout
  created_at: text("created_at").default(new Date().toISOString()),
});

export const insertDigestSubscriberSchema = createInsertSchema(digest_subscribers).omit({ created_at: true });
export type InsertDigestSubscriber = z.infer<typeof insertDigestSubscriberSchema>;
export type DigestSubscriber = typeof digest_subscribers.$inferSelect;

// ─── Agent Logs ───────────────────────────────────────────────────────────────
export const agent_logs = sqliteTable("agent_logs", {
  id: text("id").primaryKey(),
  timestamp: text("timestamp").notNull(),
  agent_name: text("agent_name").notNull(),
  input_ref: text("input_ref"),
  output_ref: text("output_ref"),
  decision_summary: text("decision_summary"),
  error_state: text("error_state"),
  warning_state: text("warning_state"),
});

export const insertAgentLogSchema = createInsertSchema(agent_logs);
export type InsertAgentLog = z.infer<typeof insertAgentLogSchema>;
export type AgentLog = typeof agent_logs.$inferSelect;

// ─── Signal Feed (denormalized view for dashboard) ────────────────────────────
export interface SignalFeedItem {
  id: string;
  player: string | null;
  team: string | null;
  league: string | null;
  topic: string | null;
  normalized_claim: string | null;
  verdict: string | null;
  confidence_score: string | null;
  needs_human_review: number | null;
  urgency_score: string | null;
  impact_score: string | null;
  source_name: string | null;
  trust_tier: string | null;
  rationale: string | null;
  event_id: string | null;
  claim_id: string | null;
  created_at: string | null;
}
