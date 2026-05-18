import {
  buildReplayHeatmapResult,
  ReplayHeatmapPoint,
} from "../pipeline/replay-intelligence-heatmap";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const points: ReplayHeatmapPoint[] = [
  {
    category: "nba",
    severity: 0.8,
    confidence_score: 0.92,
  },
  {
    category: "nba",
    severity: 0.7,
    confidence_score: 0.88,
  },
  {
    category: "mlb",
    severity: 0.3,
    confidence_score: 0.6,
  },
  {
    category: "mlb",
    severity: 0.4,
    confidence_score: 0.65,
  },
];

const result = buildReplayHeatmapResult(points);

assert(result.cells.length === 2, "invalid cell count");

const nba = result.cells.find(
  (cell) => cell.category === "nba",
);

const mlb = result.cells.find(
  (cell) => cell.category === "mlb",
);

assert(!!nba, "missing nba cell");
assert(!!mlb, "missing mlb cell");

assert(
  nba!.severity_band === "high",
  "invalid nba severity band",
);

assert(
  nba!.confidence_band === "high",
  "invalid nba confidence band",
);

assert(
  mlb!.severity_band === "low",
  "invalid mlb severity band",
);

assert(
  mlb!.confidence_band === "medium",
  "invalid mlb confidence band",
);

console.log(
  "Replay intelligence heatmap validation passed.",
);

console.log(
  JSON.stringify(
    {
      generated_at: result.generated_at,
      cells: result.cells,
    },
    null,
    2,
  ),
);