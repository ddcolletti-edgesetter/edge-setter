import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import {
  appendSituationEvent,
  buildSituationEvent,
  ensureSituationSchema,
  summarizeSituationEvidence,
} from "../situations-store";

/**
 * Guard for the evidence_count de-inflation fix (Sep 2026).
 *
 * `evidence_count` used to be the raw length of a snapshot's
 * evidence_event_ids — one entry per evolve — so repeated re-polls / re-
 * ingestions of the SAME underlying report each bumped it. Prod measured injury
 * evidence_count at ~14x its distinct observations (138 raw vs ~10 distinct),
 * all from a single source, which trivially cleared the old `evidence_count >= 3`
 * "confirmed" conjunct off one source seen many times.
 *
 * summarizeSituationEvidence now counts DISTINCT observations — distinct
 * (source_id, observed_at) among evidentiary events — and DISTINCT sources.
 * These tests lock that dedup in.
 */

const SITUATION_ID = "sit-dedup-1";

/** Append one evidentiary event (the kind that lands in evidence_event_ids). */
function appendEvidence(
  db: Database.Database,
  opts: { eventKey: string; source_id: string; observed_at: string; matched?: boolean },
): void {
  appendSituationEvent(buildSituationEvent({
    situation_id: SITUATION_ID,
    kind: opts.matched === false ? "situation_created" : "situation_matched",
    // Each physical re-poll is a fresh raw/normalized event with its own id...
    raw_event_id: `raw_${opts.eventKey}`,
    normalized_event_id: `ne_${opts.eventKey}`,
    // ...but the SOURCE and the time it OBSERVED the report are what identify a
    // distinct observation.
    source_id: opts.source_id,
    observed_at: opts.observed_at,
    recorded_at: opts.observed_at,
    payload: {},
  }), db);
}

describe("summarizeSituationEvidence", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    ensureSituationSchema(db);
  });

  it("collapses re-polls of the same (source, observed_at) to ONE distinct observation", () => {
    const observedAt = "2026-09-05T14:00:00.000Z";
    // 12 physical re-ingestions of the identical single-source injury report.
    for (let i = 0; i < 12; i++) {
      appendEvidence(db, { eventKey: `repoll_${i}`, source_id: "espn", observed_at: observedAt, matched: i > 0 });
    }

    const summary = summarizeSituationEvidence(SITUATION_ID, db);
    // Pre-fix this was 12; now it is the honest 1.
    expect(summary.evidenceCount).toBe(1);
    expect(summary.distinctSourceCount).toBe(1);
  });

  it("counts genuine revisions (new observed_at) as separate observations", () => {
    // Questionable -> Doubtful -> Out: three real reports from one source, each
    // re-polled a few times.
    const reports = [
      "2026-09-05T14:00:00.000Z",
      "2026-09-06T16:30:00.000Z",
      "2026-09-07T11:15:00.000Z",
    ];
    reports.forEach((observedAt, r) => {
      for (let i = 0; i < 4; i++) {
        appendEvidence(db, { eventKey: `r${r}_${i}`, source_id: "espn", observed_at: observedAt, matched: !(r === 0 && i === 0) });
      }
    });

    const summary = summarizeSituationEvidence(SITUATION_ID, db);
    expect(summary.evidenceCount).toBe(3);   // 12 physical events -> 3 distinct observations
    expect(summary.distinctSourceCount).toBe(1);
  });

  it("counts independent sources for distinctSourceCount (the corroboration axis)", () => {
    const observedAt = "2026-09-05T14:00:00.000Z";
    appendEvidence(db, { eventKey: "a", source_id: "espn", observed_at: observedAt, matched: false });
    appendEvidence(db, { eventKey: "b", source_id: "the_athletic", observed_at: "2026-09-05T14:05:00.000Z" });
    appendEvidence(db, { eventKey: "c", source_id: "rotowire", observed_at: "2026-09-05T14:09:00.000Z" });
    // A re-poll of espn — must not add a source.
    appendEvidence(db, { eventKey: "a2", source_id: "espn", observed_at: observedAt });

    const summary = summarizeSituationEvidence(SITUATION_ID, db);
    expect(summary.evidenceCount).toBe(3);        // espn re-poll collapses
    expect(summary.distinctSourceCount).toBe(3);  // espn, the_athletic, rotowire
  });

  it("returns zero for a situation with no evidentiary events", () => {
    const summary = summarizeSituationEvidence("sit-empty", db);
    expect(summary).toEqual({ evidenceCount: 0, distinctSourceCount: 0 });
  });
});
