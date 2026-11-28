// @vitest-environment node
import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import type { Server } from "http";

/**
 * GET /api/stats/accuracy-ledger used to report calibration_available: true
 * whenever calibration_weights had any row at all — including a row left over
 * from an earlier graded population, sitting next to a ledger that now grades
 * nothing. Calibration is available only when some ledger row has
 * total_signals > 0 AND some calibration row has sample_size > 0.
 *
 * The real route, mounted on a real Express app, over a real pipeline.db and
 * storage.db in a temp dir.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-ledger-calib-"));
process.env.DATA_DIR = TMP_DIR;
process.env.PIPELINE_DATA_DIR = TMP_DIR;

let store: typeof import("../store");
let server: Server;
let base: string;

const STALE_AT = "2026-09-01T00:00:00.000Z";
const NOW_AT = "2026-11-28T12:00:00.000Z";

beforeAll(async () => {
  store = await import("../store");
  const express = (await import("express")).default;
  const { registerPipelineRoutes } = await import("../routes");
  const app = express();
  app.use(express.json());
  registerPipelineRoutes(app);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // The route reads pipeline_source_accuracy; settlement creates it lazily.
  store.getPipelineDb().exec(`
    CREATE TABLE IF NOT EXISTS pipeline_source_accuracy (
      id TEXT PRIMARY KEY, league TEXT NOT NULL, signal_type TEXT, source_type TEXT,
      source_id TEXT, source_name TEXT,
      total_signals INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0, hit_rate REAL, avg_clv REAL, computed_at TEXT NOT NULL
    );
  `);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  const db = store.getPipelineDb();
  db.prepare("DELETE FROM pipeline_source_accuracy").run();
  db.prepare("DELETE FROM calibration_weights").run();
});

function ledgerRow(id: string, league: string, total: number, wins: number) {
  store.getPipelineDb().prepare(`
    INSERT INTO pipeline_source_accuracy
      (id, league, signal_type, source_type, total_signals, wins, losses, hit_rate, avg_clv, computed_at)
    VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, NULL, ?)
  `).run(id, league, total, wins, total - wins, total > 0 ? wins / total : null, NOW_AT);
}

function calibrationRow(id: string, league: string, sampleSize: number, computedAt: string) {
  store.getPipelineDb().prepare(`
    INSERT INTO calibration_weights (id, league, seasons, weight_type, weights, sample_size, computed_at)
    VALUES (?, ?, '[]', 'signal_type', '{}', ?, ?)
  `).run(id, league, sampleSize, computedAt);
}

async function getLedger(query = "") {
  const res = await fetch(`${base}/api/stats/accuracy-ledger${query}`);
  expect(res.status).toBe(200);
  return res.json() as Promise<{
    count: number;
    ledger: unknown[];
    calibration_available: boolean;
    calibration_computed_at: string | null;
  }>;
}

describe("GET /api/stats/accuracy-ledger calibration fields follow the graded population", () => {
  it("empty ledger + stale calibration row: not available, no computed_at", async () => {
    calibrationRow("signal_type|NFL", "NFL", 120, STALE_AT);

    const body = await getLedger();

    expect(body.count).toBe(0);
    expect(body.calibration_available).toBe(false);
    expect(body.calibration_computed_at).toBeNull();
  });

  it("ledger rows that grade nothing (total_signals 0) + stale calibration row: not available", async () => {
    ledgerRow("NFL|ALL|ALL", "NFL", 0, 0);
    calibrationRow("signal_type|NFL", "NFL", 120, STALE_AT);

    const body = await getLedger();

    expect(body.count).toBe(1);
    expect(body.calibration_available).toBe(false);
    expect(body.calibration_computed_at).toBeNull();
  });

  it("graded ledger but calibration rows with sample_size 0: not available", async () => {
    ledgerRow("NFL|ALL|ALL", "NFL", 10, 6);
    calibrationRow("signal_type|NFL", "NFL", 0, NOW_AT);

    const body = await getLedger();

    expect(body.calibration_available).toBe(false);
    expect(body.calibration_computed_at).toBeNull();
  });

  it("real data: available, computed_at from the newest calibration row that saw samples", async () => {
    ledgerRow("NFL|ALL|ALL", "NFL", 10, 6);
    calibrationRow("signal_type|NFL", "NFL", 10, NOW_AT);
    calibrationRow("signal_type|NBA", "NBA", 4, STALE_AT);

    const body = await getLedger();

    expect(body.count).toBe(1);
    expect(body.calibration_available).toBe(true);
    expect(body.calibration_computed_at).toBe(NOW_AT);
  });
});
