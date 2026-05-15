/**
 * Daily Product Ops Agent — Phase 2
 *
 * Generates one structured daily summary for operator review.
 * Runs once per day (scheduled from index.ts). Also triggerable manually.
 *
 * Input sources:
 *   - site_watch_log      (last 24h runs)
 *   - signal_ops_queue    (last 24h activity)
 *   - signals             (live signal counts)
 *   - agent_logs          (all agent activity)
 *   - distribution_drafts (queue state)
 *   - Plausible analytics (PLACEHOLDER — not yet wired; marked clearly)
 *
 * Output schema:
 * {
 *   date, site_health, signal_pipeline, content_queue,
 *   funnel, top_actions
 * }
 */

import { storage } from "./storage";
import { sendEmail } from "./email";

const ALERT_TO  = process.env.ALERT_EMAIL ?? "ddcolletti@gmail.com";
const BASE_URL  = process.env.BASE_URL ?? "https://edgesetter.net";

// ─── Output types ─────────────────────────────────────────────────────────────

export interface SiteHealthSummary {
  total_runs: number;
  ok_runs: number;
  warning_runs: number;
  critical_runs: number;
  last_status: string;
  last_run_at: string | null;
  core_routes_healthy: boolean;
  worst_anomaly: string | null;
}

export interface SignalPipelineSummary {
  total_ingested: number;
  auto_published: number;
  review_required: number;
  rejected: number;
  pending: number;
  last_signal_at: string | null;
}

export interface ContentQueueSummary {
  pending_review: number;
  oldest_pending_at: string | null;
  total_signals: number;
  distribution_drafts_pending: number;
  distribution_drafts_approved: number;
  distribution_drafts_rejected: number;
}

export interface FunnelSummary {
  // Plausible data — populated when analytics API is wired
  landing_visits:    number | null;
  signals_visits:    number | null;
  paywall_opens:     number | null;
  checkout_clicks:   number | null;
  success_page_loads: number | null;
  plausible_status:  "not_configured" | "ok" | "error";
  funnel_notes:      string;
}

export interface DailyOpsSummary {
  id: string;
  date: string;
  generated_at: string;
  site_health: SiteHealthSummary;
  signal_pipeline: SignalPipelineSummary;
  content_queue: ContentQueueSummary;
  funnel: FunnelSummary;
  top_actions: string[];
  email_sent: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function agentLog(stage: string, inputRef: string, outputRef: string, summary: string, error?: string) {
  storage.logAgentAction({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    agent_name: `DailyOps/${stage}`,
    input_ref: inputRef,
    output_ref: outputRef,
    decision_summary: summary,
    error_state: error ?? null,
    warning_state: null,
  });
}

function sinceCutoff(hours = 24): string {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

// ─── Section builders ────────────────────────────────────────────────────────

function buildSiteHealth(): SiteHealthSummary {
  const cutoff = sinceCutoff(24);
  const allRuns = (storage as any).getSiteWatchLog(200) as Record<string, any>[];
  const recent  = allRuns.filter((r: any) => r.run_timestamp >= cutoff);

  const ok       = recent.filter((r: any) => r.status === "ok").length;
  const warning  = recent.filter((r: any) => r.status === "warning").length;
  const critical = recent.filter((r: any) => r.status === "critical").length;

  const last = recent[0];
  const worstAnomalies = recent
    .flatMap((r: any) => (r.anomalies ?? []) as any[])
    .filter((a: any) => a.severity === "critical")
    .map((a: any) => a.detail as string);

  // Core routes healthy = last run has no critical checks
  const coreHealthy = last
    ? !(last.checks ?? []).some((c: any) => c.status === "critical")
    : false;

  return {
    total_runs:        recent.length,
    ok_runs:           ok,
    warning_runs:      warning,
    critical_runs:     critical,
    last_status:       last?.status ?? "no_data",
    last_run_at:       last?.run_timestamp ?? null,
    core_routes_healthy: coreHealthy,
    worst_anomaly:     worstAnomalies[0] ?? null,
  };
}

function buildSignalPipeline(): SignalPipelineSummary {
  const cutoff = sinceCutoff(24);
  const queue  = (storage as any).getSignalOpsQueue() as Record<string, any>[];
  const recent = queue.filter((q: any) => q.created_at >= cutoff);

  const published      = recent.filter((q: any) => q.decision === "auto_publish" || q.decision === "published").length;
  const review         = recent.filter((q: any) => q.decision === "review_required").length;
  const rejected       = recent.filter((q: any) => q.decision === "reject").length;
  const pending        = recent.filter((q: any) => q.decision === "pending").length;
  const total          = recent.length;

  // Last signal published
  const lastSig = (storage as any).getSignals(false) as Record<string, any>[];
  const lastSignalAt = lastSig.length > 0 ? lastSig[0].published_at : null;

  return {
    total_ingested:   total,
    auto_published:   published,
    review_required:  review,
    rejected,
    pending,
    last_signal_at:   lastSignalAt,
  };
}

function buildContentQueue(): ContentQueueSummary {
  const reviewQueue = (storage as any).getSignalOpsQueue("review_required") as Record<string, any>[];
  const allSignals  = (storage as any).getSignals(false) as Record<string, any>[];

  // Distribution drafts
  const allDrafts   = (storage as any).getDistributionDrafts() as Record<string, any>[];
  const draftPending   = allDrafts.filter((d: any) => d.status === "draft" || d.status === "review_required").length;
  const draftApproved  = allDrafts.filter((d: any) => d.status === "approved").length;
  const draftRejected  = allDrafts.filter((d: any) => d.status === "rejected").length;

  // Oldest pending item
  const pendingItems = reviewQueue.filter((q: any) => q.decision === "review_required");
  const oldest = pendingItems.length > 0
    ? pendingItems.reduce((a: any, b: any) => a.created_at < b.created_at ? a : b)
    : null;

  return {
    pending_review:              reviewQueue.length,
    oldest_pending_at:           oldest?.created_at ?? null,
    total_signals:               allSignals.length,
    distribution_drafts_pending: draftPending,
    distribution_drafts_approved: draftApproved,
    distribution_drafts_rejected: draftRejected,
  };
}

function buildFunnel(): FunnelSummary {
  // ── PLACEHOLDER ──────────────────────────────────────────────────────────────
  // Plausible analytics API access is NOT yet wired.
  // To enable: set PLAUSIBLE_API_KEY + PLAUSIBLE_SITE_ID env vars.
  // When wired, replace placeholders with live query results.
  // ─────────────────────────────────────────────────────────────────────────────
  const apiKey = process.env.PLAUSIBLE_API_KEY;
  if (!apiKey) {
    return {
      landing_visits:    null,
      signals_visits:    null,
      paywall_opens:     null,
      checkout_clicks:   null,
      success_page_loads: null,
      plausible_status:  "not_configured",
      funnel_notes:
        "Plausible analytics not yet wired. Set PLAUSIBLE_API_KEY + PLAUSIBLE_SITE_ID env vars to enable live funnel data.",
    };
  }

  // Future: fetch from https://plausible.io/api/v1/stats/breakdown
  // when PLAUSIBLE_API_KEY is set.
  return {
    landing_visits:    null,
    signals_visits:    null,
    paywall_opens:     null,
    checkout_clicks:   null,
    success_page_loads: null,
    plausible_status:  "not_configured",
    funnel_notes:      "Plausible API key found but live query not yet implemented.",
  };
}

function deriveTopActions(
  health: SiteHealthSummary,
  pipeline: SignalPipelineSummary,
  queue: ContentQueueSummary,
  funnel: FunnelSummary,
): string[] {
  const actions: Array<{ priority: number; text: string }> = [];

  // Site health issues
  if (health.critical_runs > 0) {
    actions.push({ priority: 1, text: `🔴 Site Watch detected ${health.critical_runs} critical run(s) in last 24h — check /#/site-watch-logs immediately` });
  }
  if (health.warning_runs > 0 && health.critical_runs === 0) {
    actions.push({ priority: 2, text: `🟡 ${health.warning_runs} Site Watch warning(s) in last 24h — review /#/site-watch-logs` });
  }
  if (!health.core_routes_healthy && health.last_run_at) {
    actions.push({ priority: 1, text: `🔴 Core routes not healthy per last Site Watch run — investigate immediately` });
  }

  // Signal pipeline
  if (pipeline.review_required > 5) {
    actions.push({ priority: 2, text: `⚠️ ${pipeline.review_required} signals pending review — clear the queue at /#/signal-ops-queue` });
  }
  if (pipeline.total_ingested === 0) {
    actions.push({ priority: 3, text: `📭 No signals ingested in last 24h — verify Signal Ops pipeline is running` });
  }

  // Distribution drafts
  if (queue.distribution_drafts_pending > 0) {
    actions.push({ priority: 3, text: `📋 ${queue.distribution_drafts_pending} distribution draft(s) pending review — check /#/distribution-drafts` });
  }

  // Queue depth
  if (queue.pending_review > 0) {
    actions.push({ priority: 2, text: `🔍 ${queue.pending_review} signal(s) in review queue — resolve at /#/admin` });
  }

  // Funnel
  if (funnel.plausible_status === "not_configured") {
    actions.push({ priority: 4, text: `📊 Wire Plausible API key (PLAUSIBLE_API_KEY env var) to unlock live funnel data in daily ops` });
  }

  // Fallback
  if (actions.length === 0) {
    actions.push({ priority: 5, text: "✅ All systems nominal — no immediate actions required" });
  }

  // Sort by priority, return top 3
  return actions
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3)
    .map(a => a.text);
}

// ─── Email formatter ──────────────────────────────────────────────────────────

function formatEmailBody(summary: DailyOpsSummary): string {
  const { site_health: h, signal_pipeline: p, content_queue: q, funnel: f, top_actions: actions } = summary;

  const healthIcon = h.critical_runs > 0 ? "🔴" : h.warning_runs > 0 ? "🟡" : "✅";
  const pipelineTotal = p.total_ingested;

  return `
Edge Setter — Daily Ops Summary
${summary.date}
Generated: ${summary.generated_at}

━━━━━━━━━━━━━━━━━━━━━━━━
SITE HEALTH ${healthIcon}
━━━━━━━━━━━━━━━━━━━━━━━━
Runs (24h): ${h.total_runs}  |  OK: ${h.ok_runs}  |  Warnings: ${h.warning_runs}  |  Critical: ${h.critical_runs}
Last status: ${h.last_status}  |  Last run: ${h.last_run_at ?? "N/A"}
Core routes healthy: ${h.core_routes_healthy ? "Yes" : "NO ⚠️"}
${h.worst_anomaly ? `Worst anomaly: ${h.worst_anomaly}` : ""}

━━━━━━━━━━━━━━━━━━━━━━━━
SIGNAL PIPELINE (24h)
━━━━━━━━━━━━━━━━━━━━━━━━
Total ingested:   ${pipelineTotal}
Auto-published:   ${p.auto_published}
Review required:  ${p.review_required}
Rejected:         ${p.rejected}
Pending:          ${p.pending}
Last signal at:   ${p.last_signal_at ?? "N/A"}

━━━━━━━━━━━━━━━━━━━━━━━━
CONTENT QUEUE
━━━━━━━━━━━━━━━━━━━━━━━━
Pending review:            ${q.pending_review}
Oldest pending:            ${q.oldest_pending_at ?? "N/A"}
Total live signals:        ${q.total_signals}
Distribution drafts:
  Pending review:          ${q.distribution_drafts_pending}
  Approved:                ${q.distribution_drafts_approved}
  Rejected:                ${q.distribution_drafts_rejected}

━━━━━━━━━━━━━━━━━━━━━━━━
FUNNEL / TRAFFIC
━━━━━━━━━━━━━━━━━━━━━━━━
Status: ${f.plausible_status}
${f.funnel_notes}
${f.landing_visits !== null ? `
Landing visits:      ${f.landing_visits}
Signals visits:      ${f.signals_visits}
Paywall opens:       ${f.paywall_opens}
Checkout clicks:     ${f.checkout_clicks}
Success page loads:  ${f.success_page_loads}
` : ""}

━━━━━━━━━━━━━━━━━━━━━━━━
TOP 3 ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━
${actions.map((a, i) => `${i + 1}. ${a}`).join("\n")}

━━━━━━━━━━━━━━━━━━━━━━━━
View internal ops: ${BASE_URL}/#/daily-ops
Signal queue:      ${BASE_URL}/#/signal-ops-queue
Distribution:      ${BASE_URL}/#/distribution-drafts
`.trim();
}

// ─── Main entrypoint ──────────────────────────────────────────────────────────

export async function runDailyOps(options: { sendEmailReport?: boolean } = {}): Promise<DailyOpsSummary> {
  const runId = crypto.randomUUID();
  const now   = new Date();
  const date  = now.toISOString().slice(0, 10);

  agentLog("Start", runId, runId, `Daily ops run started for ${date}`);

  // Build all sections
  const site_health    = buildSiteHealth();
  const signal_pipeline = buildSignalPipeline();
  const content_queue  = buildContentQueue();
  const funnel         = buildFunnel();
  const top_actions    = deriveTopActions(site_health, signal_pipeline, content_queue, funnel);

  agentLog("Analyze", runId, runId,
    `site=${site_health.last_status} pipeline_ingested=${signal_pipeline.total_ingested} queue=${content_queue.pending_review} funnel=${funnel.plausible_status}`);

  const summary: DailyOpsSummary = {
    id:           runId,
    date,
    generated_at: now.toISOString(),
    site_health,
    signal_pipeline,
    content_queue,
    funnel,
    top_actions,
    email_sent:   false,
  };

  // Persist to DB
  try {
    (storage as any).createDailyOpsSummary(summary);
    agentLog("Store", runId, runId, `Summary stored for ${date}`);
  } catch (e: any) {
    agentLog("Store", runId, runId, `Store failed`, e.message);
  }

  // Email (optional — on by default if sendEmailReport not false)
  const shouldEmail = options.sendEmailReport !== false;
  if (shouldEmail) {
    try {
      await sendEmail({
        to:      ALERT_TO,
        subject: `Edge Setter Daily Ops — ${date} [${site_health.last_status.toUpperCase()}]`,
        html:    `<pre>${formatEmailBody(summary)}</pre>`,
        text:    formatEmailBody(summary),
      });
      summary.email_sent = true;
      agentLog("Email", runId, runId, `Daily ops email sent to ${ALERT_TO}`);
      // Update email_sent in DB
      try { (storage as any).markDailyOpsSummaryEmailSent(runId); } catch {}
    } catch (e: any) {
      agentLog("Email", runId, runId, `Email delivery failed`, e.message);
      console.error("[daily-ops] Email failed:", e.message);
    }
  }

  console.log(
    `[daily-ops] Run ${runId}: date=${date} site=${site_health.last_status} ` +
    `ingested=${signal_pipeline.total_ingested} queue=${content_queue.pending_review} ` +
    `drafts_pending=${content_queue.distribution_drafts_pending} email=${summary.email_sent}`,
  );

  agentLog("Complete", runId, runId,
    `Daily ops complete — date=${date} email=${summary.email_sent}`);

  return summary;
}
