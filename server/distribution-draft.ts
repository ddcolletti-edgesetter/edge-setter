/**
 * Distribution Draft Agent — Phase 2
 *
 * Converts approved/live signals into channel-specific copy drafts.
 * Auto-posts to X/Twitter when confidence ≥ 95 and Twitter credentials are set.
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
import { postTweet, canAutoPost } from "./twitter";
import { postToDiscord, canPostDiscord } from "./discord";
import { postToTelegram, canPostTelegram } from "./telegram";
import { getLiveSignals } from "./pipeline/store";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DraftChannel = "x" | "reddit" | "discord" | "telegram";
export type DraftStatus = "draft" | "review_required" | "approved" | "rejected" | "posted";

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

// Cut at the last sentence end (. ! ?) within max, then word boundary, then hard cut.
function truncateAtBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const sentenceEnd = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
  );
  if (sentenceEnd > max * 0.5) return text.slice(0, sentenceEnd + 1).trim();
  const wordEnd = slice.lastIndexOf(" ");
  if (wordEnd > 0) return slice.slice(0, wordEnd) + "…";
  return slice + "…";
}

const VERDICT_EMOJI: Record<string, string> = {
  confirmed: "✅",
  likely:    "🔵",
  rumor:     "⚪",
  review:    "🔍",
  contradicted: "❌",
};

function signalMeta(signal: Record<string, any>) {
  const type    = (signal.signal_type ?? "signal").replace(/_/g, " ");
  const conf    = signal.confidence_score ?? 0;
  const sources = signal.source_count ?? 1;
  const team    = signal.team ?? "";
  const teamStr = team && team !== "Unknown" ? ` · ${team}` : "";
  const srcStr  = sources > 1 ? `${sources} sources` : "1 source";
  const typeStr = type.charAt(0).toUpperCase() + type.slice(1);
  return { typeStr, conf, srcStr, teamStr };
}

/**
 * X post: ≤280 chars, signal-first, no hype.
 */
function generateXCopy(signal: Record<string, any>): string {
  const emoji = VERDICT_EMOJI[signal.verdict] ?? "⚪";
  const { typeStr, conf, srcStr, teamStr } = signalMeta(signal);

  const title   = signal.title ?? signal.normalized_headline ?? "";
  const titleClean = truncateAtBoundary(title, 120);
  const summary = truncateAtBoundary(signal.summary ?? "", 80);

  let copy = `${emoji} ${titleClean}\n\n`;
  if (summary && summary !== titleClean) copy += `${summary}\n\n`;
  copy += `${typeStr} · ${conf}% confidence · ${srcStr}${teamStr}\n`;
  copy += `#NFL #EdgeSetter`;

  if (copy.length > 280) copy = truncateAtBoundary(copy, 280);

  return copy.trim();
}

/**
 * Discord / Telegram post: same format as X but no character limit —
 * full title and summary, no mid-sentence truncation.
 */
function generateSocialCopy(signal: Record<string, any>): string {
  const emoji = VERDICT_EMOJI[signal.verdict] ?? "⚪";
  const { typeStr, conf, srcStr, teamStr } = signalMeta(signal);

  const title   = signal.title ?? signal.normalized_headline ?? "";
  const summary = signal.summary ?? "";

  let copy = `${emoji} ${title}\n\n`;
  if (summary && summary !== title) copy += `${summary}\n\n`;
  copy += `${typeStr} · ${conf}% confidence · ${srcStr}${teamStr}\n`;
  copy += `#NFL #EdgeSetter`;

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

  // Warn early if Twitter credentials are missing — explains why auto-posts won't fire
  if (!canAutoPost()) {
    const missing = [
      !process.env.TWITTER_API_KEY       && "TWITTER_API_KEY",
      !process.env.TWITTER_API_SECRET    && "TWITTER_API_SECRET",
      !process.env.TWITTER_ACCESS_TOKEN  && "TWITTER_ACCESS_TOKEN",
      !process.env.TWITTER_ACCESS_SECRET && "TWITTER_ACCESS_SECRET",
    ].filter(Boolean).join(", ");
    logLines.push(`[AutoPost] Twitter credentials not configured (${missing}) — auto-posting disabled for this run`);
    console.warn(`[distribution-draft] Auto-posting disabled: missing env vars: ${missing}`);
  }

  // ── Stage 1: Fetch eligible signals ─────────────────────────────────────────
  let signals: Record<string, any>[];
  if (options.signalId) {
    const s = (storage as any).getSignal(options.signalId);
    signals = s ? [s] : [];
  } else {
    // Legacy curated signals (signals table)
    const legacySignals = ((storage as any).getSignals(true) as Record<string, any>[]).slice(0, 50);

    // Pipeline live signals (live_signals table) — normalize field names to match legacy shape
    const pipelineSignals = getLiveSignals({ limit: 50 })
      .filter(s => s.score >= 82) // Elite (≥82) or Strong (≥65) — focus on high-value signals
      .map(s => ({
        id: s.id,
        signal_type: s.signal_type,
        confidence_score: s.score,    // use computed score as the confidence proxy
        source_count: s.source_count,
        player_name: null,
        player: s.player,
        team: s.team,
        title: s.headline,
        normalized_headline: s.headline,
        summary: s.body,
        verdict: s.verdict,
        action_takeaway: s.action_note,
        _source: "pipeline" as const,
      }));

    signals = [...legacySignals, ...pipelineSignals];
  }

  logLines.push(`[Fetch] ${signals.length} live signal(s) found`);
  agentLog("Fetch", runId, runId, `${signals.length} signals eligible`);

  const channels: DraftChannel[] = ["x", "reddit", "discord", "telegram"];

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
        const player = (sig.player_name ?? sig.player ?? "Unknown").slice(0, 40);
        if (channel === "x") {
          copy     = generateXCopy(sig);
          headline = `X post — ${player}`;
          notes    = `Auto-generated X post. Confidence ${sig.confidence_score}%. Verdict: ${sig.verdict}.`;
        } else if (channel === "discord") {
          copy     = generateSocialCopy(sig);
          headline = `Discord post — ${player}`;
          notes    = `Auto-generated Discord post. Confidence ${sig.confidence_score}%. Verdict: ${sig.verdict}.`;
        } else if (channel === "telegram") {
          copy     = generateSocialCopy(sig);
          headline = `Telegram post — ${player}`;
          notes    = `Auto-generated Telegram post. Confidence ${sig.confidence_score}%. Verdict: ${sig.verdict}.`;
        } else {
          copy     = generateRedditCopy(sig);
          headline = `Reddit post — ${player}`;
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

        // ── Stage 5: Auto-post if confidence ≥ 95 ────────────────────────────
        const score = sig.confidence_score ?? 0;

        if (channel === "x" && score >= 95) {
          if ((storage as any).hasSocialPost(sig.id, "x")) {
            logLines.push(`[AutoPost/X] Signal ${sig.id} already posted — skipping`);
          } else if (!canAutoPost()) {
            logLines.push(`[AutoPost/X] Signal ${sig.id} score=${score} qualifies but Twitter credentials not configured`);
          } else {
            logLines.push(`[AutoPost/X] Signal ${sig.id} score=${score} — attempting post`);
            try {
              const tweet = await postTweet(copy);
              if (tweet) {
                (storage as any).updateDistributionDraft(draft.id, {
                  status: "posted", tweet_id: tweet.id, tweet_url: tweet.url,
                  posted_at: new Date().toISOString(),
                  notes: notes + ` | Auto-posted at ${new Date().toISOString()}.`,
                });
                (storage as any).recordSocialPost(sig.id, "x");
                logLines.push(`[AutoPost/X] Posted tweet ${tweet.id} → ${tweet.url}`);
                agentLog("AutoPost", sig.id, draft.id,
                  `Auto-posted tweet ${tweet.id} for signal ${sig.id} (score=${score})`);
              } else {
                logLines.push(`[AutoPost/X] Post returned null — draft stays in queue`);
              }
            } catch (e: any) {
              logLines.push(`[AutoPost/X] ERROR: ${e.message} — draft stays in queue`);
              agentLog("AutoPost", sig.id, draft.id, `X auto-post failed`, e.message);
            }
          }
        }

        if (channel === "discord" && score >= 95) {
          if ((storage as any).hasSocialPost(sig.id, "discord")) {
            logLines.push(`[AutoPost/Discord] Signal ${sig.id} already posted — skipping`);
          } else if (!canPostDiscord()) {
            logLines.push(`[AutoPost/Discord] Signal ${sig.id} score=${score} qualifies but DISCORD_WEBHOOK_URL not configured`);
          } else {
            logLines.push(`[AutoPost/Discord] Signal ${sig.id} score=${score} — attempting post`);
            try {
              const ok = await postToDiscord(copy);
              if (ok) {
                (storage as any).updateDistributionDraft(draft.id, {
                  status: "posted", posted_at: new Date().toISOString(),
                  notes: notes + ` | Auto-posted to Discord at ${new Date().toISOString()}.`,
                });
                (storage as any).recordSocialPost(sig.id, "discord");
                logLines.push(`[AutoPost/Discord] Posted successfully`);
                agentLog("AutoPost", sig.id, draft.id,
                  `Auto-posted to Discord for signal ${sig.id} (score=${score})`);
              } else {
                logLines.push(`[AutoPost/Discord] Post failed — draft stays in queue`);
              }
            } catch (e: any) {
              logLines.push(`[AutoPost/Discord] ERROR: ${e.message} — draft stays in queue`);
              agentLog("AutoPost", sig.id, draft.id, `Discord auto-post failed`, e.message);
            }
          }
        }

        if (channel === "telegram" && score >= 95) {
          if ((storage as any).hasSocialPost(sig.id, "telegram")) {
            logLines.push(`[AutoPost/Telegram] Signal ${sig.id} already posted — skipping`);
          } else if (!canPostTelegram()) {
            logLines.push(`[AutoPost/Telegram] Signal ${sig.id} score=${score} qualifies but TELEGRAM_BOT_TOKEN/CHAT_ID not configured`);
          } else {
            logLines.push(`[AutoPost/Telegram] Signal ${sig.id} score=${score} — attempting post`);
            try {
              const ok = await postToTelegram(copy);
              if (ok) {
                (storage as any).updateDistributionDraft(draft.id, {
                  status: "posted", posted_at: new Date().toISOString(),
                  notes: notes + ` | Auto-posted to Telegram at ${new Date().toISOString()}.`,
                });
                (storage as any).recordSocialPost(sig.id, "telegram");
                logLines.push(`[AutoPost/Telegram] Posted successfully`);
                agentLog("AutoPost", sig.id, draft.id,
                  `Auto-posted to Telegram for signal ${sig.id} (score=${score})`);
              } else {
                logLines.push(`[AutoPost/Telegram] Post failed — draft stays in queue`);
              }
            } catch (e: any) {
              logLines.push(`[AutoPost/Telegram] ERROR: ${e.message} — draft stays in queue`);
              agentLog("AutoPost", sig.id, draft.id, `Telegram auto-post failed`, e.message);
            }
          }
        }
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
