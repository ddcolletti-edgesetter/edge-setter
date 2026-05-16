import { computeSpreadOrTotalClv } from "../pipeline/clv";
import { getPipelineDb } from "../pipeline/store";

interface OutcomeRow {
  id: string;
  signal_id: string;
  game_id: string;
  market: string;
  line_at_signal: number | null;
  closing_line: number | null;
  clv: number | null;
}

interface SignalRow {
  id: string;
  created_at: string;
  line_movement: string | null;
}

interface SnapshotRow {
  spread_line: number | null;
}

interface StaleOutcome {
  outcome: OutcomeRow;
  canonical: {
    line_at_signal: number | null;
    closing_line: number | null;
    clv: number | null;
  };
}

function parseLineMovement(raw: string | null): { open?: number | null } | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as { open?: number | null };
  } catch {
    return null;
  }
}

const write = process.argv.includes("--write");
const db = getPipelineDb();

const outcomes = db.prepare(`
  SELECT id, signal_id, game_id, market, line_at_signal, closing_line, clv
  FROM outcomes
  ORDER BY created_at ASC, id ASC
`).all() as OutcomeRow[];

const stale: StaleOutcome[] = [];

for (const outcome of outcomes) {
  const signal = db.prepare(`
    SELECT id, created_at, line_movement
    FROM live_signals
    WHERE id = ?
  `).get(outcome.signal_id) as SignalRow | undefined;

  if (!signal || outcome.market !== "spread") {
    continue;
  }

  const signalSnapshot = db.prepare(`
    SELECT spread_line
    FROM odds_snapshots
    WHERE game_id = ?
      AND snapshot_at <= ?
    ORDER BY snapshot_at DESC
    LIMIT 1
  `).get(outcome.game_id, signal.created_at) as SnapshotRow | undefined;
  const closingSnapshot = db.prepare(`
    SELECT spread_line
    FROM odds_snapshots
    WHERE game_id = ?
    ORDER BY snapshot_at DESC
    LIMIT 1
  `).get(outcome.game_id) as SnapshotRow | undefined;
  const lineMovement = parseLineMovement(signal.line_movement);
  const lineAtSignal = signalSnapshot?.spread_line ?? lineMovement?.open ?? null;
  const closingLine = closingSnapshot?.spread_line ?? null;
  const clv = computeSpreadOrTotalClv(lineAtSignal, closingLine);

  if (
    outcome.line_at_signal !== lineAtSignal
    || outcome.closing_line !== closingLine
    || outcome.clv !== clv
  ) {
    stale.push({
      outcome,
      canonical: {
        line_at_signal: lineAtSignal,
        closing_line: closingLine,
        clv,
      },
    });
  }
}

for (const row of stale) {
  console.log(JSON.stringify({
    outcome_id: row.outcome.id,
    signal_id: row.outcome.signal_id,
    game_id: row.outcome.game_id,
    before: {
      line_at_signal: row.outcome.line_at_signal,
      closing_line: row.outcome.closing_line,
      clv: row.outcome.clv,
    },
    after: row.canonical,
  }, null, 2));
}

if (write && stale.length === 0) {
  console.error("Refusing to write: stale count is 0.");
  process.exit(1);
}

let updated = 0;

if (write) {
  const update = db.prepare(`
    UPDATE outcomes
    SET line_at_signal = ?,
        closing_line = ?,
        clv = ?
    WHERE id = ?
  `);

  const repair = db.transaction((rows: StaleOutcome[]) => {
    for (const row of rows) {
      update.run(
        row.canonical.line_at_signal,
        row.canonical.closing_line,
        row.canonical.clv,
        row.outcome.id,
      );
      updated++;
    }
  });

  repair(stale);
}

console.log(JSON.stringify({
  mode: write ? "write" : "dry-run",
  total_scanned: outcomes.length,
  stale_found: stale.length,
  updated,
}, null, 2));
