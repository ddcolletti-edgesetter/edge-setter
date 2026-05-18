import { diffReplayArchives } from "../pipeline/replay-archive-diff";

const leftArchive = {
  archive_id: "archive-left",
  manifest_hash: "manifest-a",
  bundle_hash: "bundle-a",

  snapshots: [
    {
      game_id: "game-1",
      price: -110,
    },
  ],

  signals: [
    {
      signal_id: "signal-1",
      market: "spread",
      confidence: 0.71,
      edge_score: 4.2,
    },
  ],

  provenance: [
    {
      source_id: "source-1",
      source_name: "local-reporter",
      trust_score: 0.82,
    },
  ],

  settlements: [
    {
      outcome_id: "outcome-1",
      result: "pending",
      clv: 1.2,
    },
  ],
};

const rightArchive = {
  archive_id: "archive-right",
  manifest_hash: "manifest-b",
  bundle_hash: "bundle-b",

  snapshots: [
    {
      game_id: "game-1",
      price: -105,
    },
  ],

  signals: [
    {
      signal_id: "signal-1",
      market: "spread",
      confidence: 0.91,
      edge_score: 5.9,
    },
  ],

  provenance: [
    {
      source_id: "source-1",
      source_name: "local-reporter",
      trust_score: 0.96,
    },
  ],

  settlements: [
    {
      outcome_id: "outcome-1",
      result: "win",
      clv: 2.8,
    },
  ],
};

const diff = diffReplayArchives(leftArchive, rightArchive);

const categories = new Set(
  diff.mismatches.map((mismatch) => mismatch.category),
);

const requiredCategories = [
  "manifest_mismatch",
  "bundle_mismatch",
  "snapshot_mismatch",
  "signal_drift",
  "provenance_evolution",
  "settlement_mutation",
];

for (const category of requiredCategories) {
  if (!categories.has(category as any)) {
    throw new Error(`Missing mismatch category: ${category}`);
  }
}

if (diff.signal_drift.length === 0) {
  throw new Error("Expected signal drift");
}

if (diff.provenance_evolution.length === 0) {
  throw new Error("Expected provenance evolution");
}

if (diff.settlement_mutations.length === 0) {
  throw new Error("Expected settlement mutations");
}

if (diff.equivalent) {
  throw new Error("Expected archives to differ");
}

console.log("Replay archive diff validation passed.");
console.log(
  "Mismatch categories:",
  Array.from(categories).sort().join(","),
);
console.log(
  "Deterministic diff hash:",
  diff.deterministic_hash,
);