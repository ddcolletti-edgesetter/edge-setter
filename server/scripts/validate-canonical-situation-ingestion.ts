import fs from "node:fs";
import path from "node:path";

const validationDir = path.resolve("C:/tmp/edgesetter-canonical-situation-ingestion-validation");
if (!validationDir.startsWith(path.resolve("C:/tmp"))) {
  throw new Error(`Refusing to use validation dir outside C:/tmp: ${validationDir}`);
}

fs.rmSync(validationDir, { recursive: true, force: true });
fs.mkdirSync(validationDir, { recursive: true });
process.env.PIPELINE_DATA_DIR = validationDir;

async function main(): Promise<void> {
  const { insertRawEvent, getLiveSignals } = await import("../pipeline/store");
  const { processRawEvents } = await import("../pipeline/processor");
  const {
    listCanonicalSituations,
    listSituationConfidenceHistory,
    listSituationStateHistory,
    listSituationSnapshots,
  } = await import("../pipeline/situations-store");
  const { verifySituationSnapshotIntegrity } = await import("../pipeline/situations-snapshot");

  insertRawEvent({
    source_id: "beat-alpha",
    source_type: "scrape",
    league: "MLB",
    game_id: "mlb_validation_wsh_atl",
    team: "WSH",
    player: "Example Starter",
    event_type: "injury_update",
    payload: {
      designation: "Questionable",
      body_part: "shoulder",
      notes: "Example Starter is questionable after a bullpen issue.",
      confidence: 65,
      confirmation: "Developing",
      source_count: 1,
      source_types: ["beat_reporter"],
      matchup: "WSH @ ATL",
    },
  }, { eventTime: "2026-05-23T18:00:00.000Z" });

  insertRawEvent({
    source_id: "team-alpha",
    source_type: "api",
    league: "MLB",
    game_id: "mlb_validation_wsh_atl",
    team: "WSH",
    player: "Example Starter",
    event_type: "injury_update",
    payload: {
      designation: "OUT",
      body_part: "shoulder",
      notes: "Example Starter ruled out by the club.",
      confidence: 88,
      confirmation: "Consensus",
      source_count: 3,
      source_types: ["team_official", "beat_reporter", "wire_service"],
      matchup: "WSH @ ATL",
    },
  }, { eventTime: "2026-05-23T18:04:00.000Z" });

  insertRawEvent({
    source_id: "weather-alpha",
    source_type: "api",
    league: "MLB",
    game_id: "mlb_validation_nym_phi",
    team: "PHI",
    player: null,
    event_type: "weather_update",
    payload: {
      wind_mph: 18,
      conditions: "crosswind",
      notes: "Crosswind elevated for NYM @ PHI.",
      source_count: 1,
      source_types: ["weather_api"],
      matchup: "NYM @ PHI",
    },
  }, { eventTime: "2026-05-23T18:08:00.000Z" });

  const processed = await processRawEvents();
  const situations = listCanonicalSituations({ league: "MLB", limit: 10 });
  const starterSituation = situations.find((situation) => situation.players.includes("Example Starter"));
  const weatherSituation = situations.find((situation) => situation.situation_type === "weather");
  const confidenceHistory = starterSituation ? listSituationConfidenceHistory(starterSituation.situation_id) : [];
  const stateHistory = starterSituation ? listSituationStateHistory(starterSituation.situation_id) : [];
  const snapshots = starterSituation ? listSituationSnapshots(starterSituation.situation_id) : [];
  const liveSignals = getLiveSignals({ league: "MLB", limit: 10 });

  const checks = [
    result("raw_event_can_create_new_situation", Boolean(starterSituation), { starterSituationId: starterSituation?.situation_id ?? null }),
    result("related_raw_event_merges_existing_situation", confidenceHistory.length >= 2 && snapshots.length >= 2, {
      confidenceHistory: confidenceHistory.length,
      snapshots: snapshots.length,
    }),
    result("unrelated_raw_event_creates_separate_situation", Boolean(weatherSituation) && situations.length === 2, {
      situationCount: situations.length,
      weatherSituationId: weatherSituation?.situation_id ?? null,
    }),
    result("confidence_changes_append_history", confidenceHistory.length >= 2 && confidenceHistory[0]?.new_confidence !== confidenceHistory.at(-1)?.new_confidence, {
      first: confidenceHistory[0]?.new_confidence ?? null,
      last: confidenceHistory.at(-1)?.new_confidence ?? null,
    }),
    result("lifecycle_changes_append_history", stateHistory.length >= 2 && new Set(stateHistory.map((row) => row.new_state)).size >= 2, {
      states: stateHistory.map((row) => row.new_state),
    }),
    result("snapshots_are_replay_verifiable", snapshots.length >= 2 && snapshots.every(verifySituationSnapshotIntegrity), {
      snapshotHashes: snapshots.map((snapshot) => snapshot.replay_hash),
    }),
    result("existing_live_signals_still_work", processed.processed === 3 && processed.errors === 0 && liveSignals.length === 3, {
      processed,
      liveSignals: liveSignals.length,
    }),
  ];

  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name} ${JSON.stringify(check.details)}`);
  }

  if (checks.some((check) => !check.ok)) process.exitCode = 1;
}

function result(name: string, ok: boolean, details: Record<string, unknown>) {
  return { name, ok, details };
}

void main();
