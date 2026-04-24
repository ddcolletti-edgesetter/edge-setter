/**
 * Distribution Draft Agent — Phase 2
 *
 * Converts approved/live signals into channel-specific copy drafts
 * for human review. Does NOT auto-post to any external platform.
 *
 * Pipeline:
 *   1. Fetch — load eligible live signals (is_public=1, not already drafted)
 *   2. Dedupe — skip signals that already have drafts for a given channel
 *   3. Generate — produce channel-specific copy (X + Reddit)
 *   4. Queue — write to distribution_drafts table with status="draft"
 *   5. Log — structured agent_logs entry for every run
 *
 * Output schema (per draft):
 * {
 *   id, signal_id, channel, status, copy, headline, notes,
 *   created_at, updated_at
 * }
 */

import { storage } from "./storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DraftChannel = "x" | "reddit";
export type DraftStatus = "draft" | "review_required" | "approved" | "rejected";

export interface DistributionDraft {
  id: string;
  signal_id: string;
  channel: DraftChannel;
  status: DraftStatus;
  copy: string;           // main post body
  headline: string;       // short label / subject
  notes: string;          // reason / agent notes
  created_at: string;
  updated_at: string;
}

export interface DistributionDraftRunResult {
  run_id: string;
  timestamp: string;
  signals_checked: number;
  drafts_created: number;
  drafts_skipped: number;
  drafts: DistributionDraft[];
  log: string[];
}

// ─── Copy generators ──────────────────────────────────────────────────────────

/**
 * X post: ≤280 chars, signal-first, no hype.
 * Format: "[VERDICT] Player — Type signal. Confidence N%. Source count."
 */
function generateXCopy(signal: Record<string, any>): string {
  const verdictEmoji: Record<string, string> = {
    confirmed: "✅",
    likely:    "🔵",
    rumor:     "⚪",
    review:    "🔍",
    contradicted: "❌",
  };
  const emoji = verdictEmoji[signal.verdict] ?? "⚪";
  const type  = (signal.signal_type ?? "signal").replace(/_/g, " ");
  const conf  = signal.confidence_score ?? 0;
  const sources = signal.source_count ?? 1;
  const player = signal.player_name ?? signal.player ?? "Unknown";
  const team   = signal.team ?? "";

  // Title line
  const title = signal.title ?? signal.normalized_headline ?? "";
  const titleClean = title.length > 120 ? title.slice(0, 117) + "…" : title;

  // Summary line (truncated)
  const summary = (signal.summary ?? "").slice(0, 80);

  const teamStr = team && team !== "Unknown" ? ` · ${team}` : "";
  const srcStr  = sources > 1 ? `${sources} sources` : "1 source";

  let copy = `${emoji} ${titleClean}\n\n`;
  if (summary && summary !== titleClean) copy += `${summary}\n\n`;
  copy += `${type.charAt(0).toUpperCase() + type.slice(1)} · ${conf}% confidence · ${srcStr}${teamStr}\n`;
  copy += `#NFL #EdgeSetter`;

  // Hard cap at 280
  if (copy.length > 280) {
    copy = copy.slice(0, 277) + "…";
  }

  return copy.trim();
}

/**
 * Reddit post: conversational, more context, clean signal framing.
 * Title + body. No hype, no fake insider language.
 */
function generateRedditCopy(signal: Record<string, any>): string {
  const type  = (signal.signal_type ?? "signal").replace(/_/g, " ");
  const conf  = signal.confidence_score ?? 0;
  const sources = signal.source_count ?? 1;
  const player = signal.player_name ?? signal.player ?? "Unknown";
  const team   = signal.team ?? "";
  const verdict = signal.verdict ?? "rumor";
  const title  = signal.title ?? signal.normalized_headline ?? "";
  const summary = signal.summary ?? "";
  const takeaway = signal.action_takeaway ?? "";

  const teamStr = team && team !== "Unknown" ? ` (${team})` : "";
  const verdictLabel: Record<string, string> = {
    confirmed: "Confirmed",
    likely:    "Likely",
    rumor:     "Unverified / Rumor",
    review:    "Under Review",
    contradicted: "Contradicted",
  };
  const vLabel = verdictLabel[verdict] ?? "Unverified";
  const srcStr = sources === 1 ? "1 source" : `${sources} sources`;

  let copy = `**${title}**\n\n`;
  copy += `**Signal type:** ${type.charAt(0).toUpperCase() + type.slice(1)}\n`;
  copy += `**Player:** ${player}${teamStr}\n`;
  copy += `**Verdict:** ${vLabel}\n`;
  copy += `**Confidence:** ${conf}%\n`;
  copy += `**Sources:** ${srcStr}\n\n`;

  if (summary) {
    copy += `---\n\n${summary}\n\n`;
  }

  if (takeaway) {
    copy += `**Takeaway:** ${takeaway}\n\n`;
  }

  copy += `*Signal sourced via Edge Setter — edgesetter.net*`;

  return copy.trim();
}

// ─── Logger ───────────────────────────────────────────────────────────────────

function agentLog(
  stage: string,
  inputRef: string,
  outputRef: string,
  summary: string,
  error?: string,
) {
  storage.logAgentAction({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    agent_name: `DistributionDraft/${stage}`,
    input_ref: inputRef,
    output_ref: outputRef,
    decision_summary: summary,
    error_state: error ?? null,
    warning_state: null,
  });
}

// ─── Main entrypoint ──────────────────────────────────────────────────────────

export async function runDistributionDraft(
  options: { signalId?: string; force?: boolean } = {},
): Promise<DistributionDraftRunResult> {
  const runId    = crypto.randomUUID();
  const ts       = new Date().toISOString();
  const logLines: string[] = [];
  const created: DistributionDraft[] = [];
  let skipped = 0;

  agentLog("Start", runId, runId, `Run started${options.signalId ? ` for signal ${options.signalId}` : " (batch)"}`);

  // ── Stage 1: Fetch eligible signals ─────────────────────────────────────────
  let signals: Record<string, any>[];
  if (options.signalId) {
    const s = (storage as any).getSignal(options.signalId);
    signals = s ? [s] : [];
  } else {
    signals = ((storage as any).getSignals(true) as Record<string, any>[]).slice(0, 50);
  }

  logLines.push(`[Fetch] ${signals.length} live signal(s) found`);
  agentLog("Fetch", runId, runId, `${signals.length} signals eligible`);

  const channels: DraftChannel[] = ["x", "reddit"];

  for (const sig of signals) {
    for (const channel of channels) {
      // ── Stage 2: Dedupe ─────────────────────────────────────────────────────
      if (!options.force) {
        const exists = (storage as any).distributionDraftExists(sig.id, channel);
        if (exists) {
          skipped++;
          logLines.push(`[Dedupe] signal=${sig.id} channel=${channel} — already has draft, skipping`);
          continue;
        }
      }

      // ── Stage 3: Generate copy ───────────────────────────────────────────────
      let copy: string;
      let headline: string;
      let notes: string;

      try {
        if (channel === "x") {
          copy     = generateXCopy(sig);
          headline = `X post — ${(sig.player_name ?? sig.player ?? "Unknown").slice(0, 40)}`;
          notes    = `Auto-generated X post. Confidence ${sig.confidence_score}%. Verdict: ${sig.verdict}.`;
        } else {
          copy     = generateRedditCopy(sig);
          headline = `Reddit post — ${(sig.player_name ?? sig.player ?? "Unknown").slice(0, 40)}`;
          notes    = `Auto-generated Reddit post. Review tone and accuracy before approving.`;
        }
        agentLog("Generate", sig.id, runId,
          `Generated ${channel} draft for signal ${sig.id} (${sig.player_name ?? sig.player})`);
      } catch (e: any) {
        logLines.push(`[Generate] ERROR signal=${sig.id} channel=${channel}: ${e.message}`);
        agentLog("Generate", sig.id, runId, `Generation failed`, e.message);
        continue;
      }

      // ── Stage 4: Write to queue ──────────────────────────────────────────────
      try {
        const draft = (storage as any).createDistributionDraft({
          signal_id: sig.id,
          channel,
          status: "draft" as DraftStatus,
          copy,
          headline,
          notes,
        }) as DistributionDraft;

        created.push(draft);
        logLines.push(`[Queue] Created ${channel} draft ${draft.id} for signal ${sig.id}`);
        agentLog("Queue", sig.id, draft.id,
          `Draft queued: channel=${channel} signal=${sig.id}`);
      } catch (e: any) {
        logLines.push(`[Queue] ERROR creating draft: ${e.message}`);
        agentLog("Queue", sig.id, runId, `Draft creation failed`, e.message);
      }
    }
  }

  const result: DistributionDraftRunResult = {
    run_id: runId,
    timestamp: ts,
    signals_checked: signals.length,
    drafts_created: created.length,
    drafts_skipped: skipped,
    drafts: created,
    log: logLines,
  };

  agentLog(
    "Complete",
    runId,
    runId,
    `Run complete — checked=${signals.length} created=${created.length} skipped=${skipped}`,
  );

  console.log(
    `[distribution-draft] Run ${runId}: checked=${signals.length} created=${created.length} skipped=${skipped}`,
  );

  return result;
}
