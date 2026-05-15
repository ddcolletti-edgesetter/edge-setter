/**
 * Signal Ops Agent — Phase 1
 *
 * Narrow workflow, structured JSON output, full observability.
 *
 * Pipeline stages (each stage produces a log entry):
 *   1. Ingest       — accept raw input, validate schema
 *   2. Deduplicate  — reject if same headline appeared within 24h
 *   3. Normalize    — extract player, team, signal_type from headline/body
 *   4. Cluster      — group into an existing cluster or create new one
 *   5. Score        — compute confidence_score (0–100)
 *   6. Decide       — auto_publish | review_required | reject
 *   7. Publish      — write to signals table if auto_publish
 *
 * Output schema (stored in signal_ops_queue):
 * {
 *   signal_id, cluster_id, headline, summary, player, team,
 *   signal_type, confidence_score, decision, reason,
 *   source_count, conflict_flags
 * }
 */

import { storage } from "./storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SignalOpsInput {
  source_name: string;
  source_url?: string;
  timestamp: string;
  headline: string;
  body?: string;
  player_tags?: string[];
  team_tags?: string[];
}

export interface SignalOpsOutput {
  signal_id: string;        // queue item id
  cluster_id: string;
  headline: string;
  summary: string;
  player: string;
  team: string;
  signal_type: string;
  confidence_score: number;
  decision: "auto_publish" | "review_required" | "reject";
  reason: string;
  source_count: number;
  conflict_flags: string[];
}

// ─── Source trust tiers ────────────────────────────────────────────────────────
// Tier 1 = elite beat reporters / verified insiders
// Tier 5 = anonymous / unverified

const SOURCE_TIERS: Record<string, number> = {
  "Adam Schefter": 1,
  "Ian Rapoport": 1,
  "Tom Pelissero": 1,
  "Diana Russini": 1,
  "Jordan Schultz": 2,
  "Josina Anderson": 2,
  "Charles Robinson": 2,
  "Jeremy Fowler": 2,
  "Mike Garafolo": 2,
  "NFL Network": 2,
  "ESPN": 3,
  "The Athletic": 3,
  "Pro Football Talk": 3,
  "PFF": 3,
  "Landry Football": 3,
  "Phil Steele": 3,
  "Beat Reporter": 4,
};

function getSourceTier(sourceName: string): number {
  for (const [key, tier] of Object.entries(SOURCE_TIERS)) {
    if (sourceName.toLowerCase().includes(key.toLowerCase())) return tier;
  }
  return 5; // unknown = lowest trust
}

// Confidence by tier: tier1=90, tier2=80, tier3=65, tier4=50, tier5=35
const TIER_BASE_CONFIDENCE: Record<number, number> = { 1: 90, 2: 80, 3: 65, 4: 50, 5: 35 };

// ─── High-risk topic triggers ──────────────────────────────────────────────────
const HIGH_RISK_PATTERNS = [
  /\bIR\b/i, /injured reserve/i, /season[\s-]ending/i,
  /first.?round/i, /trade/i, /coaching change/i, /fired/i, /released/i,
  /\bQB\b/, /quarterback/i, /torn ACL/i, /torn MCL/i,
];

function isHighRisk(text: string): boolean {
  return HIGH_RISK_PATTERNS.some(p => p.test(text));
}

// ─── Signal type classifier ────────────────────────────────────────────────────
function classifySignalType(headline: string, body = ""): string {
  const text = (headline + " " + body).toLowerCase();
  if (/\bdraft\b/.test(text))       return "draft_intelligence";
  if (/\binjur|\bhurt\b|\bIR\b/i.test(text)) return "injury";
  if (/\btrade\b/.test(text))       return "trade";
  if (/\bsign|\bcontract|\bdeal\b/.test(text)) return "contract";
  if (/\bcoach|\bOC\b|\bDC\b|\bcoordinator/i.test(text)) return "coaching";
  if (/\bfree.?agent|\bFA\b/.test(text)) return "free_agency";
  if (/\bdepth.?chart|\bstarter/i.test(text)) return "depth_chart";
  if (/\bvisit|\bmeeting|\binterview/i.test(text)) return "team_visit";
  return "general";
}

// ─── Normalizer ────────────────────────────────────────────────────────────────
function normalizeHeadline(raw: string): string {
  // Strip leading @handle, timestamps, emoji
  return raw
    .replace(/^@\S+\s*/g, "")
    .replace(/^\[?\d{1,2}:\d{2}(?:am|pm)?\]?\s*/i, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

function extractPlayers(headline: string, body: string, playerTags: string[]): string {
  if (playerTags.length > 0) return playerTags[0];
  // Simple heuristic: find "FirstName LastName" pattern
  const match = (headline + " " + body).match(/([A-Z][a-z]+ [A-Z][a-z']+)/);
  return match ? match[1] : "Unknown";
}

function extractTeam(headline: string, body: string, teamTags: string[]): string {
  if (teamTags.length > 0) return teamTags[0];
  const NFL_TEAMS = [
    "Cardinals","Falcons","Ravens","Bills","Panthers","Bears","Bengals","Browns",
    "Cowboys","Broncos","Lions","Packers","Texans","Colts","Jaguars","Chiefs",
    "Raiders","Chargers","Rams","Dolphins","Vikings","Patriots","Saints","Giants",
    "Jets","Eagles","Steelers","49ers","Seahawks","Buccaneers","Titans","Commanders",
  ];
  const text = headline + " " + body;
  return NFL_TEAMS.find(t => text.includes(t)) ?? "Unknown";
}

// ─── Cluster matching ──────────────────────────────────────────────────────────
function findCluster(player: string, team: string, signalType: string): string | null {
  // Look for an existing queue item in the last 48h with same player+type
  const recent = (storage as any).getSignalOpsQueue() as Record<string, any>[];
  const cutoff = Date.now() - 48 * 3600 * 1000;
  for (const item of recent) {
    if (!item.cluster_id) continue;
    if (new Date(item.created_at).getTime() < cutoff) continue;
    if (item.player === player && item.signal_type === signalType) return item.cluster_id;
  }
  return null;
}

// ─── Conflict detector ──────────────────────────────────────────────────────────
function detectConflicts(player: string, signalType: string, headline: string): string[] {
  const flags: string[] = [];
  const recent = (storage as any).getSignalOpsQueue() as Record<string, any>[];
  const cutoff = Date.now() - 24 * 3600 * 1000;
  for (const item of recent) {
    if (new Date(item.created_at).getTime() < cutoff) continue;
    if (item.player !== player || item.signal_type !== signalType) continue;
    if (item.decision === "reject") continue;
    // Rough conflict: contradicting verbs
    const thisText = headline.toLowerCase();
    const otherText = (item.raw_headline ?? "").toLowerCase();
    const conflictPairs = [
      [/\bsigning\b/, /\bnot signing\b/],
      [/\bstarter\b/, /\bbenched\b/],
      [/\bcleared\b/, /\binjured\b/],
      [/\btraded\b/, /\bnot for trade\b/],
    ];
    for (const [a, b] of conflictPairs) {
      if ((a.test(thisText) && b.test(otherText)) || (b.test(thisText) && a.test(otherText))) {
        flags.push(`Conflicts with prior item: "${item.raw_headline?.slice(0, 80)}"`);
      }
    }
  }
  return flags;
}

// ─── Logger ────────────────────────────────────────────────────────────────────
function agentLog(stage: string, inputRef: string, outputRef: string, summary: string, error?: string) {
  storage.logAgentAction({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    agent_name: `SignalOps/${stage}`,
    input_ref: inputRef,
    output_ref: outputRef,
    decision_summary: summary,
    error_state: error ?? null,
    warning_state: null,
  });
}

// ─── Main entrypoint ───────────────────────────────────────────────────────────

export async function runSignalOps(input: SignalOpsInput): Promise<SignalOpsOutput> {
  const runId = crypto.randomUUID();
  const started = new Date().toISOString();

  // ── Stage 1: Ingest ─────────────────────────────────────────────────────────
  if (!input.headline || !input.source_name) {
    const err = "Missing required fields: headline and source_name";
    agentLog("Ingest", runId, runId, "REJECT — invalid input", err);
    throw new Error(err);
  }
  agentLog("Ingest", runId, runId,
    `Accepted from ${input.source_name}: "${input.headline.slice(0, 80)}"`);

  // ── Stage 2: Deduplicate ────────────────────────────────────────────────────
  const isDuplicate = (storage as any).signalOpsHeadlineExists(input.headline, 24);
  if (isDuplicate) {
    const reason = `Duplicate headline seen within 24h — rejected`;
    const item = (storage as any).createSignalOpsItem({
      source_name: input.source_name,
      source_url: input.source_url ?? null,
      raw_headline: input.headline,
      raw_body: input.body ?? null,
      player_tags: JSON.stringify(input.player_tags ?? []),
      team_tags: JSON.stringify(input.team_tags ?? []),
      ingest_timestamp: input.timestamp,
      decision: "reject",
      reason,
      confidence_score: 0,
      conflict_flags: "[]",
      processed_at: new Date().toISOString(),
    });
    agentLog("Deduplicate", runId, item.id, reason);
    return {
      signal_id: item.id, cluster_id: "", headline: input.headline, summary: "",
      player: "", team: "", signal_type: "", confidence_score: 0,
      decision: "reject", reason, source_count: 0, conflict_flags: [],
    };
  }
  agentLog("Deduplicate", runId, runId, "No duplicate found — proceeding");

  // ── Stage 3: Normalize ──────────────────────────────────────────────────────
  const normHeadline = normalizeHeadline(input.headline);
  const player = extractPlayers(normHeadline, input.body ?? "", input.player_tags ?? []);
  const team = extractTeam(normHeadline, input.body ?? "", input.team_tags ?? []);
  const signalType = classifySignalType(normHeadline, input.body ?? "");
  const summary = input.body
    ? input.body.slice(0, 280).trim()
    : normHeadline;
  agentLog("Normalize", runId, runId,
    `player=${player} team=${team} type=${signalType}`);

  // ── Stage 4: Cluster ─────────────────────────────────────────────────────────
  const existingCluster = findCluster(player, team, signalType);
  const clusterId = existingCluster ?? crypto.randomUUID();
  const isExistingCluster = !!existingCluster;
  agentLog("Cluster", runId, clusterId,
    isExistingCluster ? `Joined cluster ${clusterId}` : `New cluster created ${clusterId}`);

  // Count cluster members (corroboration)
  const clusterItems = ((storage as any).getSignalOpsQueue() as Record<string,any>[])
    .filter(i => i.cluster_id === clusterId && i.decision !== "reject");
  const sourceCount = clusterItems.length + 1;

  // ── Stage 5: Score ──────────────────────────────────────────────────────────
  const tier = getSourceTier(input.source_name);
  let score = TIER_BASE_CONFIDENCE[tier];
  // Corroboration bonus: +5 per additional source, capped at +20
  score += Math.min(20, (sourceCount - 1) * 5);
  // High-risk penalty: -10
  const highRisk = isHighRisk(normHeadline + " " + (input.body ?? ""));
  if (highRisk) score = Math.max(0, score - 10);
  score = Math.min(100, Math.max(0, Math.round(score)));

  agentLog("Score", runId, runId,
    `tier=${tier} corroboration=${sourceCount} highRisk=${highRisk} score=${score}`);

  // ── Stage 6: Decide ──────────────────────────────────────────────────────────
  const conflictFlags = detectConflicts(player, signalType, normHeadline);
  let decision: "auto_publish" | "review_required" | "reject";
  let reason: string;

  if (conflictFlags.length > 0) {
    decision = "review_required";
    reason = `Conflicting reports detected: ${conflictFlags.join("; ")}`;
  } else if (highRisk && score < 80) {
    decision = "review_required";
    reason = `High-risk topic (${signalType}) with confidence ${score} < 80 — requires human review`;
  } else if (score < 50) {
    decision = "review_required";
    reason = `Low confidence score (${score}) — unverified source, no corroboration`;
  } else if (tier >= 4 && sourceCount < 2) {
    decision = "review_required";
    reason = `Tier ${tier} source with no corroboration — requires review`;
  } else {
    decision = "auto_publish";
    reason = `Tier ${tier} source, confidence ${score}, ${sourceCount} source(s), no conflicts`;
  }

  agentLog("Decide", runId, runId, `decision=${decision} reason=${reason}`);

  // ── Stage 7: Write to queue ──────────────────────────────────────────────────
  const verdictMap: Record<string, string> = {
    draft_intelligence: score >= 88 ? "confirmed" : score >= 70 ? "likely" : "rumor",
    injury:            score >= 88 ? "confirmed" : score >= 70 ? "likely" : "rumor",
    trade:             score >= 85 ? "likely"    : "rumor",
    free_agency:       score >= 80 ? "likely"    : "rumor",
    team_visit:        "rumor",
    contract:          score >= 85 ? "confirmed" : "likely",
    coaching:          score >= 80 ? "likely"    : "rumor",
    depth_chart:       score >= 75 ? "confirmed" : "likely",
    general:           score >= 80 ? "likely"    : "rumor",
  };
  const verdict = conflictFlags.length > 0 ? "review" : (verdictMap[signalType] ?? "rumor");

  const item = (storage as any).createSignalOpsItem({
    source_name: input.source_name,
    source_url: input.source_url ?? null,
    raw_headline: input.headline,
    raw_body: input.body ?? null,
    player_tags: JSON.stringify(input.player_tags ?? []),
    team_tags: JSON.stringify(input.team_tags ?? []),
    ingest_timestamp: input.timestamp,
    cluster_id: clusterId,
    normalized_headline: normHeadline,
    normalized_summary: summary,
    player,
    team,
    signal_type: signalType,
    confidence_score: score,
    decision,
    reason,
    source_count: sourceCount,
    conflict_flags: JSON.stringify(conflictFlags),
    processed_at: decision !== "review_required" ? new Date().toISOString() : null,
  });

  // ── Stage 7b: Auto-publish ────────────────────────────────────────────────
  if (decision === "auto_publish") {
    try {
      const signal = storage.createSignal({
        title: normHeadline,
        slug: normHeadline.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80),
        player_name: player,
        team,
        signal_type: signalType,
        status_tag: "verified",
        confidence_score: score,
        source_count: sourceCount,
        topic: signalType,
        verdict,
        summary,
        action_takeaway: `Monitor ${player} situation — ${signalType.replace(/_/g, " ")} signal from ${input.source_name}.`,
        is_featured: false,
        is_public: true,
      });
      (storage as any).resolveSignalOpsItem(item.id, signal.id);
      agentLog("Publish", item.id, signal.id, `Published signal ${signal.id} — ${normHeadline.slice(0, 60)}`);
    } catch (e: any) {
      agentLog("Publish", item.id, item.id, "Publish failed — kept as review_required", e.message);
      (storage as any).updateSignalOpsItem(item.id, { decision: "review_required", reason: `Auto-publish failed: ${e.message}` });
      decision = "review_required";
      reason = `Auto-publish failed: ${e.message}`;
    }
  }

  return {
    signal_id: item.id,
    cluster_id: clusterId,
    headline: normHeadline,
    summary,
    player,
    team,
    signal_type: signalType,
    confidence_score: score,
    decision,
    reason,
    source_count: sourceCount,
    conflict_flags: conflictFlags,
  };
}

// ─── Batch ingest ──────────────────────────────────────────────────────────────
export async function batchSignalOps(inputs: SignalOpsInput[]): Promise<SignalOpsOutput[]> {
  const results: SignalOpsOutput[] = [];
  for (const input of inputs) {
    try {
      results.push(await runSignalOps(input));
    } catch (e: any) {
      results.push({
        signal_id: "", cluster_id: "", headline: input.headline, summary: "",
        player: "", team: "", signal_type: "", confidence_score: 0,
        decision: "reject", reason: `Error: ${e.message}`, source_count: 0, conflict_flags: [],
      });
    }
  }
  return results;
}
