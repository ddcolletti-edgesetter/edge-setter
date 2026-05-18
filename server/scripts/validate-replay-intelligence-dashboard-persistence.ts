import fs from "fs";
import path from "path";

import {
  getPipelineDb,
  listReplayDashboardAggregateRows,
} from "../pipeline/store";

process.env.PIPELINE_DATA_DIR =
  "C:\\tmp\\edgesetter-replay-dashboard-validation";

const validationDir = process.env.PIPELINE_DATA_DIR;

if (validationDir && fs.existsSync(validationDir)) {
  fs.rmSync(validationDir, {
    recursive: true,
    force: true,
  });
}

fs.mkdirSync(validationDir!, {
  recursive: true,
});

const db = getPipelineDb();

db.prepare(`
  INSERT INTO replay_audits (
    id,
    game_id,
    as_of,
    replay_hash,
    timeline_hash,
    signal_hash,
    snapshot_hash,
    verification_status,
    divergence_count,
    divergence_summary_json,
    provenance_json,
    lineage_json,
    reconstruction_version,
    replay_version,
    created_at
  )
  VALUES (
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?
  )
`).run(
  "audit_1",
  "game_1",
  "2026-05-18T10:00:00.000Z",
  "replay_hash_1",
  "timeline_hash_1",
  "signal_hash_1",
  "snapshot_hash_1",
  "verified",
  2,
  JSON.stringify({
    anomalies: 2,
  }),
  JSON.stringify({
    source: "validation",
  }),
  JSON.stringify({
    parent_replay_hash: null,
  }),
  1,
  1,
  "2026-05-18T10:00:00.000Z",
);

db.prepare(`
  INSERT INTO replay_audits (
    id,
    game_id,
    as_of,
    replay_hash,
    timeline_hash,
    signal_hash,
    snapshot_hash,
    verification_status,
    divergence_count,
    divergence_summary_json,
    provenance_json,
    lineage_json,
    reconstruction_version,
    replay_version,
    created_at
  )
  VALUES (
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?
  )
`).run(
  "audit_2",
  "game_1",
  "2026-05-18T11:00:00.000Z",
  "replay_hash_2",
  "timeline_hash_2",
  "signal_hash_2",
  "snapshot_hash_2",
  "warning",
  4,
  JSON.stringify({
    anomalies: 4,
  }),
  JSON.stringify({
    source: "validation",
  }),
  JSON.stringify({
    parent_replay_hash: "replay_hash_1",
  }),
  1,
  1,
  "2026-05-18T11:00:00.000Z",
);

const rows = listReplayDashboardAggregateRows();

if (rows.length !== 2) {
  throw new Error(`expected 2 rows, received ${rows.length}`);
}

if (rows[0].replay_id !== "replay_hash_2") {
  throw new Error("unexpected replay ordering");
}

if (rows[0].parent_replay_id !== "replay_hash_1") {
  throw new Error("invalid lineage parent mapping");
}

if (rows[0].confidence_score !== 0.75) {
  throw new Error("invalid confidence score");
}

if (rows[0].drift_score !== 0.4) {
  throw new Error("invalid drift score");
}

console.log(
  "Replay intelligence dashboard persistence validation passed.",
);

console.log(
  JSON.stringify(
    {
      rows,
    },
    null,
    2,
  ),
);