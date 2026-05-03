/**
 * Site Watch Agent — Phase 1
 *
 * Runs every 5 minutes (scheduled from index.ts).
 * Checks production health across 6 dimensions.
 * Writes structured JSON output to site_watch_log.
 * Sends alert email on warning/critical if not already alerted in last hour.
 *
 * Output schema:
 * {
 *   timestamp, status: "ok"|"warning"|"critical",
 *   checks: [{ name, status, detail, latency_ms }],
 *   anomalies: [{ type, detail, severity }],
 *   recommended_action
 * }
 */

import { storage } from "./storage";
import { sendEmail } from "./email";

const BASE_URL = process.env.BASE_URL ?? "https://edgesetter.net";
const ALERT_TO  = process.env.ALERT_EMAIL ?? "ddcolletti@gmail.com";
const FETCH_TIMEOUT_MS = 8000;

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CheckResult {
  name: string;
  status: "ok" | "warning" | "critical";
  detail: string;
  latency_ms: number;
}

interface Anomaly {
  type: string;
  detail: string;
  severity: "warning" | "critical";
}

export interface SiteWatchOutput {
  timestamp: string;
  status: "ok" | "warning" | "critical";
  checks: CheckResult[];
  anomalies: Anomaly[];
  recommended_action: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, opts: RequestInit = {}): Promise<{ ok: boolean; status: number; latency_ms: number; body?: string }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    let body: string | undefined;
    try { body = await res.text(); } catch (_) {}
    return { ok: res.ok, status: res.status, latency_ms: Date.now() - start, body };
  } catch (e: any) {
    clearTimeout(timer);
    return { ok: false, status: 0, latency_ms: Date.now() - start, body: e.message };
  }
}

function agentLog(summary: string, error?: string) {
  storage.logAgentAction({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    agent_name: "SiteWatch",
    input_ref: BASE_URL,
    output_ref: "site_watch_log",
    decision_summary: summary,
    error_state: error ?? null,
    warning_state: null,
  });
}

// ─── Individual checks ─────────────────────────────────────────────────────────

async function checkRoute(name: string, path: string): Promise<CheckResult> {
  const r = await fetchWithTimeout(`${BASE_URL}${path}`);
  if (r.status >= 500) {
    return { name, status: "critical", detail: `HTTP ${r.status} — server error`, latency_ms: r.latency_ms };
  }
  if (!r.ok) {
    return { name, status: "warning", detail: `HTTP ${r.status}`, latency_ms: r.latency_ms };
  }
  if (r.latency_ms > 5000) {
    return { name, status: "warning", detail: `Slow response ${r.latency_ms}ms`, latency_ms: r.latency_ms };
  }
  return { name, status: "ok", detail: `HTTP ${r.status} in ${r.latency_ms}ms`, latency_ms: r.latency_ms };
}

async function checkSignalsApi(): Promise<{ check: CheckResult; signalCount: number }> {
  const r = await fetchWithTimeout(`${BASE_URL}/api/v2/signals?limit=50`);
  if (!r.ok) {
    return {
      check: { name: "API /api/v2/signals", status: "critical", detail: `HTTP ${r.status}`, latency_ms: r.latency_ms },
      signalCount: 0,
    };
  }
  let signalCount = 0;
  try {
    const data = JSON.parse(r.body ?? "{}");
    signalCount = data.count ?? (Array.isArray(data.signals) ? data.signals.length : 0);
  } catch (_) {}
  const status = signalCount < 3 ? "warning" : "ok";
  return {
    check: { name: "API /api/v2/signals", status, detail: `${signalCount} signals returned in ${r.latency_ms}ms`, latency_ms: r.latency_ms },
    signalCount,
  };
}

async function checkHomepageContent(): Promise<CheckResult> {
  const r = await fetchWithTimeout(`${BASE_URL}/`);
  if (!r.ok) {
    return { name: "Homepage HTML", status: "critical", detail: `HTTP ${r.status}`, latency_ms: r.latency_ms };
  }
  const body = r.body ?? "";
  const hasTitle = body.includes("Edge Setter");
  const hasScript = body.includes("index-") && body.includes(".js");
  if (!hasTitle || !hasScript) {
    return { name: "Homepage HTML", status: "critical", detail: "Missing expected title or JS bundle", latency_ms: r.latency_ms };
  }
  return { name: "Homepage HTML", status: "ok", detail: `Title ✓ Bundle ✓ (${r.latency_ms}ms)`, latency_ms: r.latency_ms };
}

async function checkSignalOpsQueue(): Promise<CheckResult> {
  try {
    const queue = (storage as any).getSignalOpsQueue("review_required") as Record<string,any>[];
    const count = queue.length;
    if (count > 20) {
      return { name: "Signal Ops Queue", status: "warning", detail: `${count} items pending review — queue depth high`, latency_ms: 0 };
    }
    return { name: "Signal Ops Queue", status: "ok", detail: `${count} items pending review`, latency_ms: 0 };
  } catch (e: any) {
    return { name: "Signal Ops Queue", status: "warning", detail: `Could not read queue: ${e.message}`, latency_ms: 0 };
  }
}

// ─── Funnel anomaly detection ───────────────────────────────────────────────────
// Uses event_log to check analytics events over the last 2h vs prior 2h window.

function checkFunnelAnomalies(): Anomaly[] {
  const anomalies: Anomaly[] = [];
  try {
    const logs = storage.getEventLog(500);
    const now = Date.now();
    const twoH = 2 * 3600 * 1000;

    const recent = logs.filter(e => now - new Date(e.created_at ?? "").getTime() < twoH);
    const prior  = logs.filter(e => {
      const age = now - new Date(e.created_at ?? "").getTime();
      return age >= twoH && age < 4 * 3600 * 1000;
    });

    function count(arr: typeof logs, name: string) {
      return arr.filter(e => e.event_name === name).length;
    }

    const checkoutRecent  = count(recent, "checkout_click");
    const successRecent   = count(recent, "success_page_load");
    const checkoutPrior   = count(prior,  "checkout_click");
    const successPrior    = count(prior,  "success_page_load");

    // Checkout clicks with zero success in same window (>= 3 clicks, 0 success)
    if (checkoutRecent >= 10 && successRecent === 0) {
      anomalies.push({
        type: "funnel_break",
        detail: `${checkoutRecent} checkout clicks in last 2h but 0 success page loads — potential broken checkout`,
        severity: "critical",
      });
    }

    // Significant drop in checkout conversion vs prior window
    if (checkoutPrior >= 5 && checkoutRecent === 0) {
      anomalies.push({
        type: "traffic_drop",
        detail: `Checkout clicks dropped to 0 in last 2h (was ${checkoutPrior} in prior 2h)`,
        severity: "warning",
      });
    }

    // Landing visits with zero downstream events (could indicate JS crash)
    const landingRecent = count(recent, "landing_visit");
    const signalsRecent = count(recent, "signals_visit") + count(recent, "draft_board_visit") + count(recent, "pro_visit");
    if (landingRecent >= 10 && signalsRecent === 0) {
      anomalies.push({
        type: "engagement_drop",
        detail: `${landingRecent} landing visits but 0 downstream page events — possible JS error or broken nav`,
        severity: "warning",
      });
    }

    // Success page loads with no checkout clicks (webhook direct? monitor)
    if (successRecent > 0 && checkoutRecent === 0) {
      anomalies.push({
        type: "funnel_anomaly",
        detail: `${successRecent} success page loads with no checkout_click events — check webhook flow`,
        severity: "warning",
      });
    }

  } catch (e: any) {
    anomalies.push({ type: "funnel_check_error", detail: `Could not read event_log: ${e.message}`, severity: "warning" });
  }
  return anomalies;
}

// ─── Alert rate-limiting ────────────────────────────────────────────────────────
function alertedWithinLastHour(): boolean {
  const logs = (storage as any).getSiteWatchLog(20) as Record<string,any>[];
  const cutoff = Date.now() - 3600 * 1000;
  return logs.some(l => l.alert_sent === 1 && new Date(l.run_timestamp).getTime() > cutoff);
}

// ─── Alert email ─────────────────────────────────────────────────────────────
async function sendSiteWatchAlert(output: SiteWatchOutput): Promise<void> {
  const criticalChecks = output.checks.filter(c => c.status !== "ok");
  const rows = [...criticalChecks.map(c =>
    `<tr><td style="padding:6px 12px;color:#F3EFE6;font-size:13px">${c.name}</td>` +
    `<td style="padding:6px 12px;color:${c.status==="critical"?"#D94B4B":"#D4932A"};font-size:13px;font-weight:700;text-transform:uppercase">${c.status}</td>` +
    `<td style="padding:6px 12px;color:#B7AFA0;font-size:12px">${c.detail}</td></tr>`
  ), ...output.anomalies.map(a =>
    `<tr><td style="padding:6px 12px;color:#F3EFE6;font-size:13px">${a.type}</td>` +
    `<td style="padding:6px 12px;color:${a.severity==="critical"?"#D94B4B":"#D4932A"};font-size:13px;font-weight:700;text-transform:uppercase">${a.severity}</td>` +
    `<td style="padding:6px 12px;color:#B7AFA0;font-size:12px">${a.detail}</td></tr>`
  )].join("");

  await sendEmail({
    to: ALERT_TO,
    subject: `[Edge Setter ${output.status.toUpperCase()}] Site Watch Alert — ${new Date(output.timestamp).toLocaleString()}`,
    html: `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0A0B0D;font-family:'Arial Narrow',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0B0D;padding:32px 16px">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" style="background:#111317;border-top:2px solid ${output.status==="critical"?"#D94B4B":"#D4932A"};padding:32px">
      <tr><td>
        <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${output.status==="critical"?"#D94B4B":"#D4932A"}">
          Site Watch · ${output.status.toUpperCase()}
        </p>
        <h2 style="margin:0 0 8px;font-family:Georgia,serif;font-size:22px;font-weight:900;color:#F3EFE6">
          ${output.status === "critical" ? "Production Issue Detected" : "Warning — Attention Needed"}
        </h2>
        <p style="margin:0 0 24px;font-size:13px;color:#B7AFA0">${new Date(output.timestamp).toLocaleString()} · ${output.recommended_action}</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #1B1F25;border-radius:2px">
          <tr style="background:#1B1F25">
            <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:700;letter-spacing:0.12em;color:#7E776A;text-transform:uppercase">Check</th>
            <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:700;letter-spacing:0.12em;color:#7E776A;text-transform:uppercase">Status</th>
            <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:700;letter-spacing:0.12em;color:#7E776A;text-transform:uppercase">Detail</th>
          </tr>
          ${rows}
        </table>
        <p style="margin:24px 0 0;font-size:12px;color:#7E776A">
          Logged to <a href="${BASE_URL}/#/logs" style="color:#CAA85A">Agent Logs</a> · 
          <a href="${BASE_URL}/#/dashboard" style="color:#CAA85A">Dashboard</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
  });
}

// ─── Main entrypoint ───────────────────────────────────────────────────────────

export async function runSiteWatch(): Promise<SiteWatchOutput> {
  const timestamp = new Date().toISOString();
  const checks: CheckResult[] = [];

  // Run checks in parallel
  const [homepage, signalsResult, apiLeaderboard, apiSources, opsQueue] = await Promise.all([
    checkHomepageContent(),
    checkSignalsApi(),
    checkRoute("API /api/leaderboard", "/api/leaderboard"),
    checkRoute("API /api/sources", "/api/sources"),
    checkSignalOpsQueue(),
  ]);

  checks.push(homepage, signalsResult.check, apiLeaderboard, apiSources, opsQueue);

  // Zero-signal check
  const anomalies: Anomaly[] = [];
  if (signalsResult.signalCount === 0) {
    anomalies.push({
      type: "zero_live_signals",
      detail: "Pipeline signal API returned 0 signals — boards will fall back to mock data",
      severity: "warning",
    });
  } else if (signalsResult.signalCount < 3) {
    anomalies.push({
      type: "low_signal_count",
      detail: `Only ${signalsResult.signalCount} signals live — feed feels sparse`,
      severity: "warning",
    });
  }

  // Funnel anomalies from event_log
  anomalies.push(...checkFunnelAnomalies());

  // Determine overall status
  const hasCritical = checks.some(c => c.status === "critical") || anomalies.some(a => a.severity === "critical");
  const hasWarning  = checks.some(c => c.status === "warning")  || anomalies.some(a => a.severity === "warning");
  const status: "ok" | "warning" | "critical" = hasCritical ? "critical" : hasWarning ? "warning" : "ok";

  // Recommended action
  const criticalChecks = checks.filter(c => c.status === "critical");
  const recommended_action = hasCritical
    ? `URGENT: ${criticalChecks.map(c => c.name).join(", ")} failing — investigate immediately`
    : hasWarning
    ? `Review warnings: ${anomalies.filter(a=>a.severity==="warning").map(a=>a.type).join(", ") || "slow responses"}`
    : "All systems nominal — no action required";

  const output: SiteWatchOutput = { timestamp, status, checks, anomalies, recommended_action };

  // Write to DB
  const run = (storage as any).createSiteWatchRun({ status, checks, anomalies, recommended_action });

  // Log to agent_logs
  agentLog(`${status.toUpperCase()} — ${checks.length} checks, ${anomalies.length} anomalies. ${recommended_action}`);

  // Alert if warning/critical and not already alerted in the last hour
  if (status !== "ok" && !alertedWithinLastHour()) {
    try {
      await sendSiteWatchAlert(output);
      (storage as any).markSiteWatchAlertSent(run.id);
    } catch (e: any) {
      agentLog("Alert send failed", e.message);
    }
  }

  return output;
}
