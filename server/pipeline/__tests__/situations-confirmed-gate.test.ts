import { describe, expect, it } from "vitest";

import { transitionSituationLifecycle, type SituationLifecycleInput } from "../situations-lifecycle";

/**
 * Guard for the "confirmed" gate correction (Sep 2026).
 *
 * The confirmed lifecycle state is the promotable, corroboration-CLAIMING state.
 * Its gate is `confidence >= 88 && distinct sources >= 3`. It used to read
 * `confidence >= 88 && evidence_count >= 3`, but evidence_count is raw
 * observation volume (prod avg 6–138 across every type, and ~14x inflated for
 * injury) — so that second conjunct was a no-op that certified "confirmed" off a
 * single source seen many times. The 88 confidence bar is unchanged.
 */

function input(overrides: Partial<SituationLifecycleInput> = {}): SituationLifecycleInput {
  return {
    current_state: "escalating",
    trigger: "evidence_added",
    confidence: 92,
    evidence_count: 5,
    distinct_source_count: 3,
    hours_since_latest_evidence: 1,
    ...overrides,
  };
}

describe("confirmed gate — distinct sources, not evidence volume", () => {
  it("confirms at confidence >= 88 with >= 3 distinct sources", () => {
    expect(transitionSituationLifecycle(input({ distinct_source_count: 3 })).new_state).toBe("confirmed");
    expect(transitionSituationLifecycle(input({ distinct_source_count: 4 })).new_state).toBe("confirmed");
  });

  it("does NOT confirm a single source no matter how inflated evidence_count is", () => {
    // The exact prod failure mode: one source, hundreds of re-poll observations.
    const state = transitionSituationLifecycle(input({ distinct_source_count: 1, evidence_count: 138 })).new_state;
    expect(state).not.toBe("confirmed");
    expect(state).toBe("escalating"); // conf >= 74 && evidence_count >= 2
  });

  it("does NOT confirm with 2 distinct sources (corroboration bar is 3)", () => {
    expect(transitionSituationLifecycle(input({ distinct_source_count: 2 })).new_state).not.toBe("confirmed");
  });

  it("leaves the 88 confidence bar intact: 3 sources at 87 does not confirm", () => {
    expect(transitionSituationLifecycle(input({ confidence: 87, distinct_source_count: 3 })).new_state).not.toBe("confirmed");
  });

  it("treats a missing distinct_source_count as zero (fails closed, never confirms)", () => {
    const { distinct_source_count, ...rest } = input({ evidence_count: 200 });
    void distinct_source_count;
    expect(transitionSituationLifecycle(rest).new_state).not.toBe("confirmed");
  });

  it("records distinct_source_count in the transition metadata for audit", () => {
    const transition = transitionSituationLifecycle(input({ distinct_source_count: 3 }));
    expect(transition.metadata.distinct_source_count).toBe(3);
  });
});
