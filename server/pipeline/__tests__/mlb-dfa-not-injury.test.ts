import { describe, expect, it, beforeAll, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { classifyMLBTransaction } from "../adapters/mlb-transaction-kind";

/**
 * MLB designated-for-assignment (typeCode "DES") is a roster move, not an
 * injury. It used to fall through the IL-placement branch of
 * ingestMLBTransactions to designation "IL-10" and post as an
 * "IL-10 placement" injury_update. Now it is a plain "transaction" with no
 * injury designation. IL placements and activations are unchanged.
 *
 * Same isolated-pipeline.db harness as injury-designation-source.test.ts.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-mlb-dfa-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;

vi.mock("../../storage", () => ({
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
  storage: { recordSignalStateTransition: vi.fn() },
}));

vi.mock("../../agents", () => ({
  sourceScorerOnOutcome: vi.fn(() => Promise.resolve()),
}));

const DFA_DESC = "New York Yankees designated RHP Test Pitcher for assignment.";

describe("classifyMLBTransaction", () => {
  it("DES is a transaction with no injury designation", () => {
    expect(classifyMLBTransaction({ typeCode: "DES", description: DFA_DESC })).toEqual({
      event_type: "transaction",
      transaction_type: "Designated for assignment",
      designation: undefined,
    });
  });

  it("DES stays a transaction even when the text mentions an IL length", () => {
    // The old fall-through read the description's day count; DES must not.
    const kind = classifyMLBTransaction({
      typeCode: "DES",
      description: "Boston Red Sox designated LHP X for assignment after he cleared the 60-day injured list.",
    });
    expect(kind.event_type).toBe("transaction");
    expect(kind.designation).toBeUndefined();
  });

  it("IL placements and activations are unchanged", () => {
    const sc = (description: string) => classifyMLBTransaction({ typeCode: "SC", description });
    expect(sc("Placed RHP A on the 15-day injured list.")).toEqual({
      event_type: "injury_update", transaction_type: "IL-15 placement", designation: "IL-15",
    });
    expect(sc("Transferred LHP B to the 60-day injured list.")).toEqual({
      event_type: "injury_update", transaction_type: "IL-60 placement", designation: "IL-60",
    });
    expect(sc("Placed CF C on the 10-day injured list.")).toEqual({
      event_type: "injury_update", transaction_type: "IL-10 placement", designation: "IL-10",
    });
    expect(sc("Activated SS D from the 10-day injured list.")).toEqual({
      event_type: "transaction", transaction_type: "IL activation", designation: undefined,
    });
    expect(classifyMLBTransaction({ typeCode: "CU", description: "Recalled E." })).toEqual({
      event_type: "transaction", transaction_type: "IL activation", designation: undefined,
    });
  });
});

describe("ingestMLBTransactions → processOne", () => {
  let store: typeof import("../store");
  let processor: typeof import("../processor");
  let adapter: typeof import("../adapters/mlb-statsapi");

  beforeAll(async () => {
    store = await import("../store");
    processor = await import("../processor");
    adapter = await import("../adapters/mlb-statsapi");
  });

  afterEach(() => vi.unstubAllGlobals());

  it("a DES transaction is stored and processed as a roster move with no injury designation", async () => {
    const team = { id: 147, abbreviation: "NYY", name: "New York Yankees" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      transactions: [
        { id: 900001, person: { fullName: "Dfa Pitcher" }, toTeam: team, date: "2026-11-27",
          typeCode: "DES", typeDesc: "Designated for Assignment", description: DFA_DESC, effectiveDate: "2026-11-27" },
        { id: 900002, person: { fullName: "Il Pitcher" }, toTeam: team, date: "2026-11-27",
          typeCode: "SC", typeDesc: "Status Change", description: "Placed RHP Il Pitcher on the 15-day injured list.",
          effectiveDate: "2026-11-27" },
      ],
    }), { status: 200 })));

    const { created } = await adapter.ingestMLBTransactions();
    expect(created).toBe(2);

    const db = store.getPipelineDb();
    const rows = db.prepare(
      `SELECT * FROM raw_events WHERE source_id = 'mlb_statsapi' ORDER BY json_extract(payload, '$.mlb_transaction_id')`,
    ).all() as any[];
    expect(rows).toHaveLength(2);

    const [dfaRow, ilRow] = rows;
    const dfaPayload = JSON.parse(dfaRow.payload);
    expect(dfaRow.event_type).toBe("transaction");
    expect(dfaPayload.transaction_type).toBe("Designated for assignment");
    expect(dfaPayload.designation).toBeUndefined();
    expect(dfaPayload.transaction_type).not.toMatch(/IL|placement/);

    // Control: the IL placement in the same batch is still an injury.
    expect(ilRow.event_type).toBe("injury_update");
    expect(JSON.parse(ilRow.payload).designation).toBe("IL-15");

    const toRawEvent = (r: any) => ({ ...r, payload: JSON.parse(r.payload), processed: false });
    const dfaSignal = await processor.processOne(toRawEvent(dfaRow));
    expect(dfaSignal).not.toBeNull();
    expect(dfaSignal!.signal_type).toBe("transaction");
    expect(dfaSignal!.injury_designation ?? null).toBeNull();
    expect(dfaSignal!.injury_designation_source ?? null).toBeNull();
    expect(dfaSignal!.headline).toContain("Designated for assignment");
    expect(dfaSignal!.headline).not.toMatch(/IL-10/);

    const ilSignal = await processor.processOne(toRawEvent(ilRow));
    expect(ilSignal!.signal_type).toBe("injury_update");
    expect(ilSignal!.injury_designation).toBe("IL-15");
  });
});
