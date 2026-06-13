/**
 * Edge Setter Agent Workflow
 * Agents: Scout → Clusterer → Retriever → Verifier → Source Scorer → Publisher → QA/Audit
 * All decisions are logged to agent_logs table.
 *
 * VERIFIER CHANGE (Fix 2):
 *   - Removed hard confidence ceiling of 92. tier1 + corroboration + no contradictions = 100.
 *   - Removed blanket HIGH_RISK_TOPICS/HIGH_RISK_KEYWORDS → "review" override.
 *     A confirmed QB injury with no conflicting signals is VERIFIED, not a 70%-capped review item.
 *     The North Star requires these events surface FIRST at FULL confidence.
 *   - Review verdict is now reserved for genuine signal conflict (contradictCount > 0).
 *     Topic importance is not a reason to downgrade — it is a reason to surface faster.
 */
import { storage } from "./storage";
import { type InsertEvent, type InsertClaim, type InsertEvidence, type InsertVerdict, type InsertAlert, type InsertAgentLog } from "@shared/schema";
import { computeDSTConfidence, verdictFromDST, type EvidenceSource, type SourceTier } from "./pipeline/dst-confidence";
import { detectInsiderSignals } from "./pipeline/insider-signals";
import {
  findCorroboratingEvents,
  checkOfficialInjuryStatus,
  checkLineReaction,
} from "./retrieval";

const ALLOWED_VERDICTS = ["confirmed", "likely", "rumor", "contradicted", "review"] as const;
type Verdict = typeof ALLOWED_VERDICTS[number];

function uuid() { return crypto.randomUUID(); }
function ts() { return new Date().toISOString(); }

/** Build a human-readable rationale string — no raw DB metadata exposed. */
function buildRationale(
  tier: string,
  supportCount: number,
  contradictCount: number,
  isHighRisk: boolean,
  belief?: number,
  conflictMass?: number,
): string {
  const tierLabel: Record<string, string> = {
    tier1: "Tier 1 (Elite source)",
    tier2: "Tier 2 (Reliable source)",
    tier3: "Tier 3 (Standard source)",
    tier4: "Tier 4 (Unverified source)",
    tier5: "Tier 5 (Low-confidence source)",
  };
  const tLabel = tierLabel[tier] ?? tier;
  const support = supportCount === 1 ? "1 corroborating report" : supportCount > 1 ? `${supportCount} corroborating reports` : "no corroboration";
  const contradict = contradictCount > 0 ? `${contradictCount} conflicting report${contradictCount > 1 ? "s" : ""}` : "no conflicting reports";
  const parts = [`${tLabel} · ${support} · ${contradict}.`];
  if (belief !== undefined) parts.push(`DST belief: ${(belief * 100).toFixed(1)}%`);
  if (conflictMass !== undefined && conflictMass > 0) parts.push(`Conflict: ${(conflictMass * 100).toFixed(1)}%`);
  if (isHighRisk) parts.push("High-impact topic — priority surfacing.");
  return parts.join(" ");
}

async function log(agent: string, input: string, output: string, summary: string, error?: string) {
  storage.logAgentAction({
    id: uuid(),
    timestamp: ts(),
    agent_name: agent,
    input_ref: input,
    output_ref: output,
    decision_summary: summary,
    error_state: error ?? null,
    warning_state: null,
  });
}

// ─── Scout Agent ──────────────────────────────────────────────────────────────
// Ingests raw source item and creates an event + claim record
export async function scoutAgent(params: {
  source_id: string;
  raw_text: string;
  player?: string;
  team?: string;
  league?: string;
  topic?: string;
}): Promise<{ event_id: string; claim_id: string }> {
  await log("Scout", JSON.stringify(params), "", `Ingesting raw item from source ${params.source_id}`);

  const event = storage.createEvent({
    sport: "football",
    league: params.league ?? "NFL",
    team: params.team ?? null,
    player: params.player ?? null,
    topic: params.topic ?? "general",
    cluster_key: `${params.team ?? ""}_${params.player ?? ""}_${params.topic ?? ""}`.toLowerCase(),
    urgency_score: params.topic === "injury" ? "85" : "50",
    impact_score: params.player ? "70" : "40",
  });

  const claim = storage.createClaim({
    id: uuid(),
    event_id: event.id,
    source_id: params.source_id,
    claim_type: params.topic ?? "general",
    raw_claim_text: params.raw_text,
    normalized_claim: params.raw_text.substring(0, 200),
    claim_status: "pending",
    confidence_score: "0",
  });

  await log("Scout", params.source_id, claim.id, `Created event ${event.id}, claim ${claim.id}`);
  return { event_id: event.id, claim_id: claim.id };
}

// ─── Clusterer Agent ──────────────────────────────────────────────────────────
// Groups duplicate items by cluster_key, deduplicates
export async function clustererAgent(event_id: string): Promise<{ cluster_key: string; duplicate_count: number }> {
  const event = storage.getEvent(event_id);
  if (!event) throw new Error(`Event ${event_id} not found`);

  const allEvents = storage.getEvents();
  const duplicates = allEvents.filter(
    e => e.cluster_key === event.cluster_key && e.id !== event_id
  );

  await log(
    "Clusterer",
    event_id,
    event.cluster_key ?? "",
    `Cluster key: ${event.cluster_key}, found ${duplicates.length} related items`
  );

  return { cluster_key: event.cluster_key ?? "", duplicate_count: duplicates.length };
}

// ─── Retriever Agent ──────────────────────────────────────────────────────────
// Gathers real evidence: pipeline corroboration → official API → line reaction → source-tier fallback
export async function retrieverAgent(claim_id: string): Promise<{ evidence_count: number }> {
  const claim = storage.getClaim(claim_id);
  if (!claim) throw new Error(`Claim ${claim_id} not found`);

  const event  = claim.event_id  ? storage.getEvent(claim.event_id)   : null;
  const source = claim.source_id ? storage.getSource(claim.source_id) : null;
  const tier   = source?.trust_tier ?? "tier3";

  const player     = event?.player ?? null;
  const team       = event?.team   ?? null;
  const league     = event?.league ?? null;
  const claimType  = claim.claim_type ?? null;
  const claimCreatedAt = (claim as any).created_at ?? new Date().toISOString();

  let evidenceCount = 0;

  // ── 1. Pipeline corroboration ──────────────────────────────────────────────
  const corroboration = findCorroboratingEvents(player, team, league, claimType, claimCreatedAt);

  for (const srcName of corroboration.sourceNames) {
    storage.createEvidence({
      id: uuid(), claim_id,
      source_url: null,
      evidence_type: "corroborating",
      stance: "support",
      extracted_text: `${srcName} reports the same ${claimType ?? "event"}`,
      authority_level: Math.min(5, 2 + corroboration.supporting),
    });
    evidenceCount++;
  }

  for (const srcName of corroboration.contradictingNames) {
    storage.createEvidence({
      id: uuid(), claim_id,
      source_url: null,
      evidence_type: "corroborating",
      stance: "contradict",
      extracted_text: `${srcName} contradicts this ${claimType ?? "claim"}`,
      authority_level: 2,
    });
    evidenceCount++;
  }

  // ── 2. Official injury / transaction status ────────────────────────────────
  const officialClaimTypes = ["injury", "transaction"];
  if (officialClaimTypes.includes(claimType ?? "")) {
    const raw = claim.raw_claim_text ?? "";
    const designationMatch = raw.match(/\b(OUT|Doubtful|Questionable|Probable|IL-\d+|DNP|day-to-day)\b/i);
    const claimDesignation = designationMatch?.[1] ?? null;

    const official = await checkOfficialInjuryStatus(player, league, claimDesignation);
    if (official.checked && official.stance) {
      storage.createEvidence({
        id: uuid(), claim_id,
        source_url: null,
        evidence_type: "official",
        stance: official.stance,
        extracted_text: official.notes,
        authority_level: official.stance === "support" ? 5 : 4,
      });
      evidenceCount++;
    }
  }

  // ── 3. Market line reaction ────────────────────────────────────────────────
  const bettingClaimTypes = ["injury", "trade", "depth_chart", "lineup"];
  if (team && bettingClaimTypes.includes(claimType ?? "")) {
    const lineReaction = checkLineReaction(team, league, claimType);
    if (lineReaction.checked && lineReaction.stance) {
      storage.createEvidence({
        id: uuid(), claim_id,
        source_url: null,
        evidence_type: "market",
        stance: lineReaction.stance,
        extracted_text: lineReaction.notes,
        authority_level: 3,
      });
      evidenceCount++;
    }
  }

  // ── 4. Fallback: source-tier logic if no real data found ───────────────────
  if (evidenceCount === 0) {
    const supportStance = tier === "tier1" || tier === "tier2" ? "support" : "context";
    const authLevel = tier === "tier1" ? 5 : tier === "tier2" ? 4 : tier === "tier3" ? 3 : 2;

    storage.createEvidence({
      id: uuid(), claim_id,
      source_url: source?.url ?? null,
      evidence_type: "primary",
      stance: supportStance,
      extracted_text: `Source: ${source?.name ?? "Unknown"} — ${claim.raw_claim_text?.substring(0, 100)}`,
      authority_level: authLevel,
    });
    evidenceCount = 1;
  }

  await log("Retriever", claim_id, `evidence for ${claim_id}`, `Retrieved ${evidenceCount} evidence items`);
  return { evidence_count: evidenceCount };
}

// ─── Verifier Agent ──────────────────────────────────────────────────────────
// Assigns verdict and confidence using Dempster-Shafer Theory of Evidence.
//
// North Star rules:
//   1. Agent consensus IS verification. When DST belief >= 0.95, verdict = VERIFIED/100%.
//   2. High-impact topic (injury, QB, draft) is NOT a confidence penalty — surface faster.
//   3. Review verdict is reserved for genuine evidence conflict (conflictMass > 0.30).
export async function verifierAgent(claim_id: string): Promise<{ verdict: Verdict; needs_review: boolean }> {
  const claim = storage.getClaim(claim_id);
  if (!claim) throw new Error(`Claim ${claim_id} not found`);

  const evidenceItems  = storage.getEvidenceForClaim(claim_id);
  const claimSource    = claim.source_id ? storage.getSource(claim.source_id) : null;
  const claimEvent     = claim.event_id  ? storage.getEvent(claim.event_id)   : null;

  // isHighRisk = informational only, for rationale + logging. Never gates confidence.
  const HIGH_RISK_TOPICS   = ["injury", "draft", "coaching", "trade"];
  const HIGH_RISK_KEYWORDS = ["QB", "quarterback", "first round", "playoff", "coaching change", "fired", "released"];
  const rawText = claim.raw_claim_text ?? "";
  const isHighRisk =
    HIGH_RISK_KEYWORDS.some(k => rawText.toLowerCase().includes(k.toLowerCase())) ||
    HIGH_RISK_TOPICS.includes(claim.claim_type ?? "");

  // Check if this source was first to file on this player+topic within the last 4 hours
  const isFirstReporter = claimEvent?.player
    ? (storage as any).countRecentSignalsForPlayerTopic(
        claimEvent.player,
        claimEvent.topic ?? claim.claim_type ?? "",
        claimEvent.league ?? "",
        240,
      ) <= 1
    : false;

  const dstSources: EvidenceSource[] = [];

  if (claimSource) {
    const accuracyRecord = storage.getSourceScore(claimSource.id);
    const teamAccuracy   = claimEvent?.team
      ? (storage as any).getSourceTeamAccuracy(claimSource.id, claimEvent.team)
      : null;

    const insiderResult = detectInsiderSignals({
      sourceId:               claimSource.id,
      sourceName:             claimSource.name ?? "",
      sourceType:             claimSource.source_type ?? "social",
      league:                 claimEvent?.league ?? "",
      team:                   claimEvent?.team   ?? null,
      player:                 claimEvent?.player ?? null,
      claimText:              rawText,
      isFirstReporterOnStory: isFirstReporter,
      teamAccuracyScore:      teamAccuracy?.accuracy ?? null,
      globalAccuracyScore:    accuracyRecord?.overall_accuracy
        ? parseFloat(String(accuracyRecord.overall_accuracy)) / 100
        : null,
      teamSampleSize: teamAccuracy?.sampleSize ?? 0,
    });

    if (insiderResult.isInsider) {
      await log(
        "Verifier", claim_id, claimSource.id,
        `Insider detected: score=${insiderResult.insiderScore.toFixed(2)} ` +
        `boost=+${insiderResult.effectiveMassBoost.toFixed(2)} | ` +
        insiderResult.reasons.join(", ")
      );
    }

    dstSources.push({
      tier:                   (claimSource.trust_tier as SourceTier) ?? "tier3",
      stance:                 "support",
      sourceAccuracyOverride: accuracyRecord?.overall_accuracy
        ? parseFloat(String(accuracyRecord.overall_accuracy)) / 100
        : undefined,
      insiderMassBoost: insiderResult.effectiveMassBoost,
    });
  }

  // Add corroborating / contradicting evidence items.
  // Evidence rows don't carry source_id (only source_url), so we fall back to tier3.
  for (const e of evidenceItems) {
    dstSources.push({
      tier:    "tier3",
      stance:  e.stance === "contradict" ? "contradict" : "support",
    });
  }

  const dstResult  = computeDSTConfidence(dstSources);
  let { verdict, needsReview, displayConfidence } = verdictFromDST(dstResult);

  // Corroboration gate: confirmed status on a high-impact topic requires ≥2
  // sources — the claim source plus at least one independent evidence item
  // (corroborating report, official status, or market reaction). The
  // source-tier fallback ("primary") restates the claim source and doesn't count.
  const independentSupport = evidenceItems.filter(
    e => e.stance === "support" && e.evidence_type !== "primary"
  ).length;
  if (verdict === "confirmed" && isHighRisk && independentSupport === 0) {
    verdict = "likely";
    displayConfidence = Math.min(displayConfidence, 84);
    await log(
      "Verifier", claim_id, "corroboration_gate",
      `High-impact confirmed downgraded to likely — single uncorroborated source, awaiting second source`
    );
  }

  const v = storage.createVerdict({
    id: uuid(),
    claim_id,
    verdict,
    confidence_score: displayConfidence.toString(),
    rationale: buildRationale(
      claimSource?.trust_tier ?? "tier3",
      dstResult.supportCount,
      dstResult.contradictCount,
      isHighRisk,
      dstResult.belief,
      dstResult.conflictMass,
    ),
    needs_human_review: needsReview ? 1 : 0,
  });

  storage.updateClaimStatus(claim_id, "complete");

  await log(
    "Verifier",
    claim_id,
    v.id,
    `DST belief: ${(dstResult.belief * 100).toFixed(1)}% → display: ${displayConfidence}% | ` +
    `verdict: ${verdict} | conflict: ${(dstResult.conflictMass * 100).toFixed(1)}% | ` +
    `support: ${dstResult.supportCount} contradict: ${dstResult.contradictCount} | ` +
    `high-impact: ${isHighRisk} review: ${needsReview}`
  );

  return { verdict, needs_review: needsReview };
}

// ─── Source Scorer Agent ─────────────────────────────────────────────────────

const ROLLING_WINDOW_DAYS = 90;
const MIN_RESOLVED_FOR_ACCURACY = 5;
const LIKELY_WEIGHT = 0.7;

function getRollingWindowCutoff(): string {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ROLLING_WINDOW_DAYS);
  return cutoff.toISOString();
}

function computeAccuracyPct(confirmed: number, likely: number, total: number): number {
  if (total === 0) return 0;
  return Math.round(((confirmed + likely * LIKELY_WEIGHT) / total) * 100 * 10) / 10;
}

export async function sourceScorerAgent(source_id: string): Promise<void> {
  const src = storage.getSource(source_id);
  if (!src) return;

  const cutoff = getRollingWindowCutoff();

  let sourceClaims: any[];
  if (typeof (storage as any).getClaimsBySourceId === "function") {
    sourceClaims = (storage as any).getClaimsBySourceId(source_id, cutoff);
  } else {
    sourceClaims = storage.getClaims().filter(
      (c: any) => c.source_id === source_id && (!c.created_at || c.created_at >= cutoff)
    );
  }

  const SCOREABLE = ["confirmed", "likely", "contradicted"];
  interface Resolved { verdict: string; claim_type: string | null }
  const resolved: Resolved[] = [];

  for (const claim of sourceClaims) {
    const v = storage.getVerdictForClaim(claim.id);
    if (!v?.verdict || !SCOREABLE.includes(v.verdict)) continue;
    resolved.push({ verdict: v.verdict, claim_type: claim.claim_type ?? null });
  }

  if (resolved.length < MIN_RESOLVED_FOR_ACCURACY) {
    await log(
      "SourceScorer",
      source_id,
      `score for ${source_id}`,
      `Skipped: only ${resolved.length} resolved claim(s) in ${ROLLING_WINDOW_DAYS}-day window (min: ${MIN_RESOLVED_FOR_ACCURACY}). Existing scores preserved.`
    );
    return;
  }

  const confirmed    = resolved.filter(r => r.verdict === "confirmed").length;
  const likely       = resolved.filter(r => r.verdict === "likely").length;
  const contradicted = resolved.filter(r => r.verdict === "contradicted").length;
  const total        = resolved.length;

  function topicAccuracy(topic: string): string {
    const items = resolved.filter(r => r.claim_type === topic);
    if (items.length === 0) return "0";
    const c = items.filter(r => r.verdict === "confirmed").length;
    const l = items.filter(r => r.verdict === "likely").length;
    return computeAccuracyPct(c, l, items.length).toFixed(1);
  }

  const resolvedClaimIds = sourceClaims.map((c: any) => c.id);
  const leadTimes = storage.getSignalLeadTimesForClaims(resolvedClaimIds);
  const validLeadTimes = leadTimes
    .map(lt => lt.lead_time_minutes)
    .filter((m): m is number => m !== null && m >= 0);

  const avgLeadTime = validLeadTimes.length > 0
    ? Math.round(validLeadTimes.reduce((a, b) => a + b, 0) / validLeadTimes.length)
    : null;

  storage.upsertSourceScore({
    source_id,
    overall_accuracy:          computeAccuracyPct(confirmed, likely, total).toFixed(1),
    average_lead_time_minutes: avgLeadTime !== null ? String(avgLeadTime) : null,
    draft_accuracy:            topicAccuracy("draft"),
    injury_accuracy:           topicAccuracy("injury"),
    portal_accuracy:           topicAccuracy("transfer"),
    false_positive_rate:       total > 0 ? (contradicted / total * 100).toFixed(1) : "0",
    sample_size:               total,
    window_days:               ROLLING_WINDOW_DAYS,
    last_computed_at:          ts(),
  });

  await log(
    "SourceScorer",
    source_id,
    `score for ${source_id}`,
    `${src.name}: accuracy=${computeAccuracyPct(confirmed, likely, total)}% | confirmed=${confirmed} likely=${likely} contradicted=${contradicted} / ${total} resolved | lead_time=${avgLeadTime !== null ? `${avgLeadTime}m` : "unavailable"}`
  );
}

// ─── sourceScorerOnOutcome ────────────────────────────────────────────────────
export async function sourceScorerOnOutcome(
  signal_id: string,
  teamKey?: string | null,
): Promise<void> {
  let sourceIds: string[] = [];

  if (typeof (storage as any).getSourceIdsForSignal === "function") {
    sourceIds = (storage as any).getSourceIdsForSignal(signal_id);
  } else {
    await log("SourceScorer", signal_id, "outcome_trigger",
      `WARN: storage.getSourceIdsForSignal not yet implemented.`);
    return;
  }

  if (sourceIds.length === 0) return;

  for (const sid of sourceIds) {
    await sourceScorerAgent(sid);
    // Update team-specific accuracy if the signal was associated with a team
    if (teamKey) {
      const score = storage.getSourceScore(sid);
      // wasCorrect = source has a confirmed verdict on any claim in this signal
      const claimsBySource = (storage as any).getClaimsBySourceId
        ? (storage as any).getClaimsBySourceId(sid)
        : [];
      const wasCorrect = claimsBySource.some((c: any) => {
        const v = storage.getVerdictForClaim(c.id);
        return v?.verdict === "confirmed";
      });
      if (score || claimsBySource.length > 0) {
        (storage as any).updateSourceTeamAccuracy(sid, teamKey, wasCorrect);
      }
    }
  }

  await log("SourceScorer", signal_id, "outcome_rescore",
    `Re-scored ${sourceIds.length} source(s) after signal ${signal_id} resolved.${teamKey ? ` Team: ${teamKey}` : ""}`);
}

// ─── Publisher Agent ──────────────────────────────────────────────────────────
export async function publisherAgent(claim_id: string): Promise<{ alert_id: string | null }> {
  const verdict = storage.getVerdictForClaim(claim_id);
  if (!verdict) return { alert_id: null };
  if (verdict.needs_human_review === 1) return { alert_id: null };

  const publishableVerdicts = ["confirmed", "likely"];
  if (!publishableVerdicts.includes(verdict.verdict ?? "")) return { alert_id: null };

  const claim = storage.getClaim(claim_id);
  const event = claim?.event_id ? storage.getEvent(claim.event_id) : null;

  const playerStr = event?.player ? `${event.player} ` : "";
  const teamStr = event?.team ? `(${event.team}) ` : "";
  const topicStr = event?.topic ? `[${event.topic.toUpperCase()}]` : "";

  const msg = `${topicStr} ${playerStr}${teamStr}— ${claim?.normalized_claim ?? "Signal update"} | Verdict: ${verdict.verdict?.toUpperCase()} (${verdict.confidence_score}% confidence)`;

  const alert = storage.createAlert({
    id: uuid(),
    verdict_id: verdict.id,
    channel: "feed",
    audience: event?.topic === "injury" || event?.topic === "draft" ? "bettor" : "all",
    message_text: msg,
    sent_at: null,
    click_count: 0,
  });

  await log("Publisher", claim_id, alert.id, `Published alert: ${msg.substring(0, 80)}`);
  return { alert_id: alert.id };
}

// ─── QA / Audit Agent ────────────────────────────────────────────────────────
export async function qaAuditAgent(): Promise<{
  total_claims: number;
  verdicts_issued: number;
  review_queue_count: number;
  alerts_published: number;
  invalid_verdicts: number;
  pass: boolean;
}> {
  const allClaims  = storage.getClaims();
  const allVerdicts = storage.getVerdicts();
  const reviewQueue = storage.getReviewQueue();
  const allAlerts   = storage.getAlerts();

  const invalidVerdicts = allVerdicts.filter(
    v => !ALLOWED_VERDICTS.includes((v.verdict ?? "") as Verdict)
  );

  const result = {
    total_claims:      allClaims.length,
    verdicts_issued:   allVerdicts.length,
    review_queue_count: reviewQueue.length,
    alerts_published:  allAlerts.length,
    invalid_verdicts:  invalidVerdicts.length,
    pass:              invalidVerdicts.length === 0,
  };

  await log(
    "QA/Audit",
    "system",
    JSON.stringify(result),
    `QA pass: ${result.pass}. Claims: ${result.total_claims}, Verdicts: ${result.verdicts_issued}, Review: ${result.review_queue_count}`
  );

  return result;
}

// ─── Full Pipeline ────────────────────────────────────────────────────────────
export async function runFullPipeline(params: {
  source_id: string;
  raw_text: string;
  player?: string;
  team?: string;
  league?: string;
  topic?: string;
}): Promise<{
  event_id: string;
  claim_id: string;
  verdict: string | null;
  alert_id: string | null;
  needs_review: boolean;
}> {
  const { event_id, claim_id } = await scoutAgent(params);
  await clustererAgent(event_id);
  await retrieverAgent(claim_id);
  const { verdict, needs_review } = await verifierAgent(claim_id);
  await sourceScorerAgent(params.source_id);
  const { alert_id } = await publisherAgent(claim_id);

  return { event_id, claim_id, verdict, alert_id, needs_review };
}
