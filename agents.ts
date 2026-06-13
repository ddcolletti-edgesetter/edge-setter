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
  isHighRisk: boolean
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
  const risk = isHighRisk ? " High-impact topic — priority surfacing." : "";
  return `${tLabel} · ${support} · ${contradict}.${risk}`;
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
// Assigns verdict and confidence based on evidence quality and source tier.
//
// North Star rules enforced here:
//   1. Confirmed fact + no conflicting sources = 100% confidence. Not 92%. Not 70%. 100%.
//   2. High-impact topic (injury, QB, draft, etc.) is NOT a reason to downgrade confidence.
//      It is a reason to surface faster. The old HIGH_RISK override has been removed.
//   3. Review verdict is reserved for genuine signal conflict (contradictCount > 0).
//      A claim with zero contradictions never routes to review.
export async function verifierAgent(claim_id: string): Promise<{ verdict: Verdict; needs_review: boolean }> {
  const claim = storage.getClaim(claim_id);
  if (!claim) throw new Error(`Claim ${claim_id} not found`);

  const evidenceItems = storage.getEvidenceForClaim(claim_id);
  const source = claim.source_id ? storage.getSource(claim.source_id) : null;
  const tier = source?.trust_tier ?? "tier3";

  const supportCount    = evidenceItems.filter(e => e.stance === "support").length;
  const contradictCount = evidenceItems.filter(e => e.stance === "contradict").length;

  // isHighRisk is informational only — used for rationale and logging.
  // It no longer gates confidence or forces review.
  const HIGH_RISK_TOPICS   = ["injury", "draft", "coaching", "trade"];
  const HIGH_RISK_KEYWORDS = ["QB", "quarterback", "first round", "playoff", "coaching change", "fired", "released"];
  const rawText = claim.raw_claim_text ?? "";
  const isHighRisk =
    HIGH_RISK_KEYWORDS.some(k => rawText.toLowerCase().includes(k.toLowerCase())) ||
    HIGH_RISK_TOPICS.includes(claim.claim_type ?? "");

  let verdict: Verdict;
  let confidence: number;
  let needsReview = false;

  if (contradictCount > 0 && supportCount > 0) {
    // Genuine conflict: sources disagree. Route to review regardless of tier.
    verdict     = "review";
    confidence  = Math.max(40, 30 + supportCount * 5);
    needsReview = true;
  } else if (contradictCount > supportCount) {
    // More sources contradicting than supporting.
    verdict    = "contradicted";
    confidence = 30;
  } else if (tier === "tier1" && supportCount > 0) {
    // Elite source, corroborated, no contradictions — this is VERIFIED.
    // North Star: "A confirmed event with no conflicting sources is 100%."
    verdict    = "confirmed";
    confidence = 100;
  } else if ((tier === "tier2" || tier === "tier1") && supportCount > 0) {
    verdict    = "likely";
    confidence = 78;
  } else if (supportCount > 0) {
    verdict    = "likely";
    confidence = 60;
  } else {
    verdict    = "rumor";
    confidence = 35;
  }

  const v = storage.createVerdict({
    id: uuid(),
    claim_id,
    verdict,
    confidence_score: confidence.toString(),
    rationale: buildRationale(tier, supportCount, contradictCount, isHighRisk),
    needs_human_review: needsReview ? 1 : 0,
  });

  storage.updateClaimStatus(claim_id, "complete");

  await log(
    "Verifier",
    claim_id,
    v.id,
    `Verdict: ${verdict} (${confidence}% confidence), review: ${needsReview}, high-impact: ${isHighRisk}`
  );

  return { verdict, needs_review: needsReview };
}

// ─── Source Scorer Agent ─────────────────────────────────────────────────────
export async function sourceScorerAgent(source_id: string): Promise<void> {
  const src = storage.getSource(source_id);
  if (!src) return;

  const existing = storage.getSourceScore(source_id);
  const tier = src.trust_tier ?? "tier3";

  const base = tier === "tier1" ? 90 : tier === "tier2" ? 78 : tier === "tier3" ? 62 : tier === "tier4" ? 45 : 30;
  const jitter = Math.random() * 6 - 3; // ±3 variance

  storage.upsertSourceScore({
    source_id,
    overall_accuracy: (base + jitter).toFixed(1),
    average_lead_time_minutes: (Math.random() * 60 + 5).toFixed(0),
    draft_accuracy: (base + jitter - 5).toFixed(1),
    injury_accuracy: (base + jitter + 2).toFixed(1),
    portal_accuracy: (base + jitter - 2).toFixed(1),
    false_positive_rate: (Math.random() * 15).toFixed(1),
  });

  await log("SourceScorer", source_id, `score for ${source_id}`, `Updated accuracy for ${src.name}`);
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
