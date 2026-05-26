import fs from "node:fs";
import path from "node:path";
import type { NormalizedEvent } from "../pipeline/situations-contract";

const validationDir = path.resolve("C:/tmp/edgesetter-canonical-situation-api-validation");
if (!validationDir.startsWith(path.resolve("C:/tmp"))) {
  throw new Error(`Refusing to use validation dir outside C:/tmp: ${validationDir}`);
}

fs.rmSync(validationDir, { recursive: true, force: true });
fs.mkdirSync(validationDir, { recursive: true });
process.env.PIPELINE_DATA_DIR = validationDir;

async function main(): Promise<void> {
  const { evolveCanonicalSituation } = await import("../pipeline/situations-engine");
  const {
    listCanonicalSituationApiResponses,
    mapCanonicalSituationToApiResponse,
  } = await import("../pipeline/situations-api");
  const { listCanonicalSituations } = await import("../pipeline/situations-store");
  evolveCanonicalSituation({
    event: normalizedEvent({
      normalized_event_id: "ne_api_alpha_1",
      source_id: "beat-alpha",
      source_type: "scrape",
      sport: "baseball",
      league: "MLB",
      game_id: "mlb_api_wsh_atl",
      teams: ["WSH", "ATL"],
      players: ["Example Starter"],
      event_type: "injury_update",
      situation_type: "injury",
      semantic_fingerprint: "example starter shoulder questionable",
      occurred_at: "2026-05-23T18:00:00.000Z",
      received_at: "2026-05-23T18:03:00.000Z",
      summary: "Example Starter moved to questionable before first pitch.",
    }),
    confidence_input: confidenceInput(62, "2026-05-23T18:03:00.000Z"),
    lifecycle_trigger: "evidence_added",
  });

  evolveCanonicalSituation({
    event: normalizedEvent({
      normalized_event_id: "ne_api_alpha_2",
      source_id: "team-alpha",
      source_type: "api",
      sport: "baseball",
      league: "MLB",
      game_id: "mlb_api_wsh_atl",
      teams: ["ATL", "WSH"],
      players: ["Example Starter"],
      event_type: "market_reaction",
      situation_type: "injury",
      semantic_fingerprint: "example starter shoulder questionable",
      occurred_at: "2026-05-23T18:05:00.000Z",
      received_at: "2026-05-23T18:06:00.000Z",
      summary: "Market moved after Example Starter injury reporting converged.",
      market_context: {
        market: "spread",
        open: -1.5,
        current: -0.5,
        delta: 1,
        direction: "up",
        sportsbook: "validation-book",
      },
    }),
    confidence_input: confidenceInput(81, "2026-05-23T18:06:00.000Z"),
    lifecycle_trigger: "market_reaction",
  });

  evolveCanonicalSituation({
    event: normalizedEvent({
      normalized_event_id: "ne_api_beta_1",
      source_id: "weather-alpha",
      source_type: "api",
      sport: "baseball",
      league: "MLB",
      game_id: "mlb_api_nym_phi",
      teams: ["NYM", "PHI"],
      players: [],
      event_type: "weather_update",
      situation_type: "weather",
      semantic_fingerprint: "nym phi crosswind elevated",
      occurred_at: "2026-05-23T18:08:00.000Z",
      received_at: "2026-05-23T18:09:00.000Z",
      summary: "Crosswind elevated for NYM at PHI.",
    }),
    confidence_input: confidenceInput(43, "2026-05-23T18:09:00.000Z"),
    lifecycle_trigger: "evidence_added",
  });

  evolveCanonicalSituation({
    event: normalizedEvent({
      normalized_event_id: "ne_api_gamma_1",
      source_id: "team-beta",
      source_type: "api",
      sport: "football",
      league: "NFL",
      game_id: "nfl_api_lac_den",
      teams: ["LAC", "DEN"],
      players: ["Example Receiver"],
      event_type: "injury_update",
      situation_type: "injury",
      semantic_fingerprint: "example receiver ankle cleared",
      occurred_at: "2026-05-23T18:10:00.000Z",
      received_at: "2026-05-23T18:11:00.000Z",
      summary: "Example Receiver cleared after ankle review.",
    }),
    confidence_input: confidenceInput(84, "2026-05-23T18:11:00.000Z"),
    lifecycle_trigger: "resolution",
  });

  const all = listCanonicalSituationApiResponses({ orderBy: "updated_at", limit: 20 });
  const allAgain = listCanonicalSituationApiResponses({ orderBy: "updated_at", limit: 20 });
  const raw = listCanonicalSituations({ limit: 20 });
  const firstRaw = raw.find((item) => item.situation_id === all[0]?.id);
  const remapped = firstRaw ? mapCanonicalSituationToApiResponse(firstRaw) : null;
  const leagueFiltered = listCanonicalSituationApiResponses({ league: "MLB", limit: 20 });
  const sportFiltered = listCanonicalSituationApiResponses({ sport: "football", limit: 20 });
  const stateFiltered = listCanonicalSituationApiResponses({ lifecycleState: "escalating", limit: 20 });
  const activeOnly = listCanonicalSituationApiResponses({ activeOnly: true, limit: 20 });
  const byVisibility = listCanonicalSituationApiResponses({ orderBy: "operational_visibility_score", limit: 20 });
  const byEscalation = listCanonicalSituationApiResponses({ orderBy: "escalation_score", limit: 20 });
  const byConfidence = listCanonicalSituationApiResponses({ orderBy: "confidence", limit: 20 });
  const limited = listCanonicalSituationApiResponses({ limit: 2 });
  const alpha = all.find((item) => item.players.includes("Example Starter"));

  const checks = [
    result("api_mapper_is_deterministic", stableJson(all) === stableJson(allAgain) && stableJson(remapped) === stableJson(remapped), {
      count: all.length,
      remappedId: remapped?.id ?? null,
    }),
    result("filters_work", leagueFiltered.length === 2 && sportFiltered.length === 1 && stateFiltered.length === 1 && activeOnly.every((item) => !["resolved", "archived", "invalidated"].includes(item.lifecycleState)), {
      leagueFiltered: leagueFiltered.map((item) => item.id),
      sportFiltered: sportFiltered.map((item) => item.id),
      stateFiltered: stateFiltered.map((item) => item.lifecycleState),
      activeOnly: activeOnly.map((item) => item.lifecycleState),
    }),
    result("ordering_works", isDescending(byVisibility.map((item) => item.operationalVisibilityScore)) && isDescending(byEscalation.map((item) => item.escalationScore)) && isDescending(byConfidence.map((item) => item.confidence)) && limited.length === 2, {
      visibility: byVisibility.map((item) => item.operationalVisibilityScore),
      escalation: byEscalation.map((item) => item.escalationScore),
      confidence: byConfidence.map((item) => item.confidence),
      limited: limited.length,
    }),
    result("evidence_previews_are_stable", Boolean(alpha) && alpha!.latestEvidence.length >= 2 && alpha!.latestEvidence.length <= 5 && stableJson(alpha!.latestEvidence) === stableJson(listCanonicalSituationApiResponses({ league: "MLB" }).find((item) => item.id === alpha!.id)?.latestEvidence), {
      evidence: alpha?.latestEvidence ?? [],
    }),
    result("confidence_explanations_are_present", Boolean(alpha) && alpha!.confidenceFactors.whyConfidenceIncreased.length > 0 && alpha!.confidenceFactors.evidenceThatMattersMost.length > 0 && alpha!.confidenceFactors.whatRemainsUncertain.length > 0, {
      confidenceFactors: alpha?.confidenceFactors ?? null,
    }),
    result("lifecycle_explanations_are_present", all.length > 0 && all.every((item) => item.lifecycleExplanation.length > 0), {
      lifecycleExplanations: all.map((item) => [item.lifecycleState, item.lifecycleExplanation]),
    }),
    result("replay_hashes_are_preserved", all.length > 0 && all.every((item) => item.replayHash && item.latestEvidence.every((event) => event.replayHash)), {
      situationReplayHashes: all.map((item) => item.replayHash),
      evidenceReplayHashes: all.flatMap((item) => item.latestEvidence.map((event) => event.replayHash)),
    }),
  ];

  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name} ${JSON.stringify(check.details)}`);
  }

  if (checks.some((check) => !check.ok)) process.exitCode = 1;
}

function normalizedEvent(overrides: Record<string, any>): NormalizedEvent {
  return {
    raw_event_id: `raw_${overrides.normalized_event_id}`,
    payload: { validation: true },
    market_context: undefined,
    roster_context: undefined,
    ...overrides,
  } as unknown as NormalizedEvent;
}

function confidenceInput(score: number, computedAt: string) {
  const caps = [22, 18, 16, 14, score >= 84 ? 20 : 0, 10] as const;
  let remaining = score;
  const values = caps.map((cap) => {
    const value = Math.min(cap, remaining);
    remaining -= value;
    return value;
  });
  return {
    source_reliability: values[0],
    independent_confirmations: values[1],
    market_alignment: values[2],
    validator_agreement: values[3],
    official_confirmation: values[4],
    freshness: values[5],
    contradiction_penalty: 0,
    computed_at: computedAt,
  };
}

function isDescending(values: readonly number[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1] >= value);
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortJson((value as Record<string, unknown>)[key]);
      return acc;
    }, {});
  }
  return value;
}

function result(name: string, ok: boolean, details: Record<string, unknown>) {
  return { name, ok, details };
}

void main();
