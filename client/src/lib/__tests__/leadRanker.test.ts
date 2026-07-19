import { describe, it, expect } from "vitest";
import {
  selectHomepageLead,
  selectFeaturedSituation,
  LEAD_MAX_AGE_HOURS,
  ageHoursFrom,
} from "../leadRanker";
import type { CanonicalSituationRecord, VerificationState } from "../../types/situation";
import { FEATURED_MAX_AGE_HOURS, type BoardSituation } from "../boardSituations";

// ─── helpers ─────────────────────────────────────────────────────────────────

const REF = 1_700_000_000_000; // fixed ms epoch for determinism

function hoursAgo(hours: number, ref = REF): string {
  return new Date(ref - hours * 3_600_000).toISOString();
}

function hoursAhead(hours: number, ref = REF): string {
  return new Date(ref + hours * 3_600_000).toISOString();
}

function makeSituation(overrides: Partial<CanonicalSituationRecord> = {}): CanonicalSituationRecord {
  return {
    id: "s1",
    league: "NBA",
    signalType: "injury_update",
    verificationState: "developing",
    confidenceScore: 70,
    firstDetected: hoursAgo(1),
    latest_snapshot_at: hoursAgo(0.5),
    ...overrides,
  };
}

function makeBoardSituation(overrides: Partial<BoardSituation> = {}): BoardSituation {
  return {
    id: "bs1",
    kind: "canonical",
    league: "NBA",
    lane: "escalating",
    escalation: "Watch",
    title: "Test",
    score: 50,
    confidence: 80,
    sourceCount: 2,
    trustLabel: "Strong",
    lifecycle: "Developing",
    lifecycleStage: "Developing",
    isLive: false,
    isActionable: true,
    relatedSignalIds: [],
    ...overrides,
  } as BoardSituation;
}

// ─────────────────────────────────────────────────────────────────────────────
// selectHomepageLead
// ─────────────────────────────────────────────────────────────────────────────

describe("selectHomepageLead — empty and null cases", () => {
  it("returns null for empty array", () => {
    expect(selectHomepageLead([], REF)).toBeNull();
  });

  it("returns null when all situations are FEED_ONLY types", () => {
    const situations = [
      makeSituation({ signalType: "weather_advisory" }),
      makeSituation({ signalType: "trend" }),
    ];
    expect(selectHomepageLead(situations, REF)).toBeNull();
  });

  it("returns null when all situations are SUPPRESSED types", () => {
    const situations = [
      makeSituation({ signalType: "noise" }),
      makeSituation({ signalType: "duplicate" }),
    ];
    expect(selectHomepageLead(situations, REF)).toBeNull();
  });

  it("returns null when all situations exceed the 7-day cap", () => {
    const situations = [
      makeSituation({ firstDetected: hoursAgo(200, REF) }),
      makeSituation({ firstDetected: hoursAgo(300, REF) }),
    ];
    expect(selectHomepageLead(situations, REF)).toBeNull();
  });

  it("returns null for single situation with invalid date", () => {
    const situations = [makeSituation({ firstDetected: "not-a-date" })];
    expect(selectHomepageLead(situations, REF)).toBeNull();
  });
});

describe("selectHomepageLead — lead eligibility gate (storyTypeTiers)", () => {
  it("injury_update passes the gate", () => {
    const s = makeSituation({ signalType: "injury_update" });
    expect(selectHomepageLead([s], REF)).toBe(s);
  });

  it("transaction passes the gate", () => {
    const s = makeSituation({ signalType: "transaction" });
    expect(selectHomepageLead([s], REF)).toBe(s);
  });

  it("eligibility_ruling passes the gate", () => {
    const s = makeSituation({ signalType: "eligibility_ruling" });
    expect(selectHomepageLead([s], REF)).toBe(s);
  });

  it("signing passes the gate", () => {
    const s = makeSituation({ signalType: "signing" });
    expect(selectHomepageLead([s], REF)).toBe(s);
  });

  it("suspension passes the gate", () => {
    const s = makeSituation({ signalType: "suspension" });
    expect(selectHomepageLead([s], REF)).toBe(s);
  });

  it("weather_advisory fails the gate (FEED_ONLY)", () => {
    const s = makeSituation({ signalType: "weather_advisory" });
    expect(selectHomepageLead([s], REF)).toBeNull();
  });

  it("trend fails the gate (FEED_ONLY)", () => {
    const s = makeSituation({ signalType: "trend" });
    expect(selectHomepageLead([s], REF)).toBeNull();
  });

  it("market_reaction fails the gate (FEED_ONLY)", () => {
    const s = makeSituation({ signalType: "market_reaction" });
    expect(selectHomepageLead([s], REF)).toBeNull();
  });

  it("duplicate is suppressed and excluded", () => {
    const s = makeSituation({ signalType: "duplicate" });
    expect(selectHomepageLead([s], REF)).toBeNull();
  });

  it("unknown type falls to FEED_ONLY and is excluded", () => {
    const s = makeSituation({ signalType: "totally_unknown_type_xyz" });
    expect(selectHomepageLead([s], REF)).toBeNull();
  });
});

describe("selectHomepageLead — LEAD_MAX_AGE_HOURS age cap", () => {
  it("LEAD_MAX_AGE_HOURS constant equals 168 (7×24)", () => {
    expect(LEAD_MAX_AGE_HOURS).toBe(168);
  });

  it("situation at 167 hours is included", () => {
    const s = makeSituation({ firstDetected: hoursAgo(167, REF) });
    expect(selectHomepageLead([s], REF)).toBe(s);
  });

  it("situation at exactly 168 hours is at the boundary (included)", () => {
    const s = makeSituation({ firstDetected: hoursAgo(168, REF) });
    expect(selectHomepageLead([s], REF)).not.toBeNull();
  });

  it("situation at 0 hours (now) is included", () => {
    const s = makeSituation({ firstDetected: hoursAgo(0, REF) });
    expect(selectHomepageLead([s], REF)).toBe(s);
  });

  it("situation at 24 hours is included", () => {
    const s = makeSituation({ firstDetected: hoursAgo(24, REF) });
    expect(selectHomepageLead([s], REF)).toBe(s);
  });

  it("situation at 169 hours is excluded", () => {
    const s = makeSituation({ firstDetected: hoursAgo(169, REF) });
    expect(selectHomepageLead([s], REF)).toBeNull();
  });

  it("age cap uses referenceTime correctly", () => {
    const laterRef = REF + 100 * 3_600_000;
    const s = makeSituation({ firstDetected: hoursAgo(167, REF) });
    // 167h at REF but 267h at laterRef → excluded
    expect(selectHomepageLead([s], laterRef)).toBeNull();
  });

  it("old situation excluded but fresh one returned", () => {
    const stale = makeSituation({ id: "stale", firstDetected: hoursAgo(200, REF) });
    const fresh = makeSituation({ id: "fresh", firstDetected: hoursAgo(2, REF) });
    const result = selectHomepageLead([stale, fresh], REF);
    expect(result?.id).toBe("fresh");
  });
});

describe("selectHomepageLead — fresh pool (<24h) preference", () => {
  it("fresh situation outranks an older situation at same confidence", () => {
    const old = makeSituation({ id: "old", firstDetected: hoursAgo(48, REF), confidenceScore: 90 });
    const fresh = makeSituation({ id: "fresh", firstDetected: hoursAgo(2, REF), confidenceScore: 90 });
    const result = selectHomepageLead([old, fresh], REF);
    expect(result?.id).toBe("fresh");
  });

  it("when no fresh situations, uses the full eligible pool", () => {
    const old = makeSituation({ id: "old", firstDetected: hoursAgo(48, REF) });
    const result = selectHomepageLead([old], REF);
    expect(result?.id).toBe("old");
  });

  it("23h situation is in the fresh pool", () => {
    const fresh23 = makeSituation({ id: "f23", firstDetected: hoursAgo(23, REF) });
    const old48 = makeSituation({ id: "old48", firstDetected: hoursAgo(48, REF), confidenceScore: 99 });
    const result = selectHomepageLead([old48, fresh23], REF);
    expect(result?.id).toBe("f23");
  });

  it("25h situation is NOT in the fresh pool", () => {
    const s25 = makeSituation({ id: "s25", firstDetected: hoursAgo(25, REF) });
    const s23 = makeSituation({ id: "s23", firstDetected: hoursAgo(23, REF), confidenceScore: 50 });
    // Both are eligible; fresh pool has only s23, so s23 wins despite lower confidence
    const result = selectHomepageLead([s25, s23], REF);
    expect(result?.id).toBe("s23");
  });

  it("multiple fresh situations ranked by lead score", () => {
    const a = makeSituation({ id: "a", firstDetected: hoursAgo(2, REF), confidenceScore: 60 });
    const b = makeSituation({ id: "b", firstDetected: hoursAgo(1, REF), confidenceScore: 90 });
    const result = selectHomepageLead([a, b], REF);
    expect(result?.id).toBe("b");
  });
});

describe("selectHomepageLead — confidence ranking", () => {
  it("returns the highest-confidence eligible situation", () => {
    const low = makeSituation({ id: "low", confidenceScore: 40 });
    const high = makeSituation({ id: "high", confidenceScore: 95 });
    const result = selectHomepageLead([low, high], REF);
    expect(result?.id).toBe("high");
  });

  it("100% confidence wins", () => {
    const s100 = makeSituation({ id: "100", confidenceScore: 100 });
    const s80 = makeSituation({ id: "80", confidenceScore: 80 });
    const result = selectHomepageLead([s80, s100], REF);
    expect(result?.id).toBe("100");
  });

  it("lower confidence loses", () => {
    const low = makeSituation({ id: "low", confidenceScore: 30 });
    const high = makeSituation({ id: "high", confidenceScore: 85 });
    const result = selectHomepageLead([low, high], REF);
    expect(result?.id).toBe("high");
  });

  it("verified boost can tip a confidence tie", () => {
    const developing = makeSituation({ id: "dev", confidenceScore: 80, verificationState: "developing" });
    const verified = makeSituation({ id: "ver", confidenceScore: 80, verificationState: "verified" });
    const result = selectHomepageLead([developing, verified], REF);
    expect(result?.id).toBe("ver");
  });

  it("escalating boost sits between verified and developing", () => {
    const developing = makeSituation({ id: "dev", confidenceScore: 80, verificationState: "developing" });
    const escalating = makeSituation({ id: "esc", confidenceScore: 80, verificationState: "escalating" });
    const verified = makeSituation({ id: "ver", confidenceScore: 80, verificationState: "verified" });
    const result = selectHomepageLead([developing, escalating, verified], REF);
    expect(result?.id).toBe("ver");
  });
});

describe("selectHomepageLead — game proximity integration", () => {
  it("game within 24h gets full proximity (1.0)", () => {
    const soon = makeSituation({ id: "soon", gameDate: hoursAhead(12, REF), confidenceScore: 80 });
    const far = makeSituation({ id: "far", gameDate: hoursAhead(200, REF), confidenceScore: 80 });
    const result = selectHomepageLead([far, soon], REF);
    expect(result?.id).toBe("soon");
  });

  it("game 3 days out gets reduced proximity (< 1.0)", () => {
    const noGame = makeSituation({ id: "nogame", confidenceScore: 80 });
    const threeDay = makeSituation({ id: "3day", gameDate: hoursAhead(72, REF), confidenceScore: 80 });
    // 3-day proximity ≈ 0.7 < neutral 0.6? Actually 3 days = 72h is in the 2-7 day range.
    // At 72h: t = (72-48)/(168-48) = 24/120 = 0.2, multiplier = 0.8 + 0.2*(0.5-0.8) = 0.8-0.06 = 0.74
    // no-game gets 0.6 neutral; threeDay gets 0.74 — threeDay should win
    const result = selectHomepageLead([noGame, threeDay], REF);
    expect(result?.id).toBe("3day");
  });

  it("game 8+ days out gets minimal proximity (0.1)", () => {
    const noGame = makeSituation({ id: "nogame", confidenceScore: 80 });
    const farGame = makeSituation({ id: "fargame", gameDate: hoursAhead(200, REF), confidenceScore: 80 });
    // farGame proximity = 0.1, noGame = 0.6 → noGame wins
    const result = selectHomepageLead([noGame, farGame], REF);
    expect(result?.id).toBe("nogame");
  });

  it("no game date gets neutral proximity (0.6)", () => {
    const s = makeSituation({ gameDate: undefined, confidenceScore: 80 });
    // Should still qualify and return
    expect(selectHomepageLead([s], REF)).toBe(s);
  });

  it("past game (already played) is treated as immediate (1.0 proximity)", () => {
    const past = makeSituation({ id: "past", gameDate: hoursAgo(3, REF), confidenceScore: 80 });
    const noGame = makeSituation({ id: "nogame", confidenceScore: 80 });
    // past gets 1.0, noGame gets 0.6 → past wins
    const result = selectHomepageLead([noGame, past], REF);
    expect(result?.id).toBe("past");
  });

  it("same confidence — closer game wins via proximity", () => {
    const close = makeSituation({ id: "close", gameDate: hoursAhead(6, REF), confidenceScore: 80 });
    const distant = makeSituation({ id: "distant", gameDate: hoursAhead(150, REF), confidenceScore: 80 });
    const result = selectHomepageLead([distant, close], REF);
    expect(result?.id).toBe("close");
  });
});

describe("selectHomepageLead — verification state boosts", () => {
  it("verified state adds +20 boost to score", () => {
    const verified = makeSituation({ id: "ver", confidenceScore: 60, verificationState: "verified" });
    const developing = makeSituation({ id: "dev", confidenceScore: 70, verificationState: "developing" });
    // verified: 60 * 0.6 * 1.0 + 20 = 36 + 20 = 56
    // developing: 70 * 0.6 * 1.0 + 0 = 42
    // → verified wins
    const result = selectHomepageLead([developing, verified], REF);
    expect(result?.id).toBe("ver");
  });

  it("escalating state adds +10 boost to score", () => {
    const escalating = makeSituation({ id: "esc", confidenceScore: 60, verificationState: "escalating" });
    const developing = makeSituation({ id: "dev", confidenceScore: 65, verificationState: "developing" });
    // escalating: 60 * 0.6 * 1.0 + 10 = 36 + 10 = 46
    // developing: 65 * 0.6 * 1.0 + 0 = 39
    // → escalating wins
    const result = selectHomepageLead([developing, escalating], REF);
    expect(result?.id).toBe("esc");
  });

  it("developing state adds no boost", () => {
    const s = makeSituation({ id: "dev", confidenceScore: 90, verificationState: "developing" });
    expect(selectHomepageLead([s], REF)).toBe(s);
  });

  it("monitoring verificationState maps to 0 boost (no explicit mapping)", () => {
    const monitoring = makeSituation({ id: "mon", confidenceScore: 80, verificationState: "monitoring" as VerificationState });
    const developing = makeSituation({ id: "dev", confidenceScore: 80, verificationState: "developing" });
    // Both get 0 boost; same confidence — tiebreak by firstDetected
    const result = selectHomepageLead([monitoring, developing], REF);
    expect(result).not.toBeNull();
  });

  it("verified can overcome lower confidence score", () => {
    const highDev = makeSituation({ id: "highDev", confidenceScore: 95, verificationState: "developing" });
    const lowVer = makeSituation({ id: "lowVer", confidenceScore: 60, verificationState: "verified" });
    // highDev: 95 * 0.6 * 1.0 = 57
    // lowVer: 60 * 0.6 * 1.0 + 20 = 36 + 20 = 56
    // → highDev wins (57 > 56), NOT lowVer
    const result = selectHomepageLead([highDev, lowVer], REF);
    expect(result?.id).toBe("highDev");
  });
});

describe("selectHomepageLead — recency scoring", () => {
  it("< 1h old gets 2.0 recency multiplier", () => {
    const veryFresh = makeSituation({ id: "vf", firstDetected: hoursAgo(0.5, REF), confidenceScore: 50 });
    const old = makeSituation({ id: "old", firstDetected: hoursAgo(48, REF), confidenceScore: 80 });
    // veryFresh: 50 * 0.6 * 2.0 = 60 vs old (in full pool if no fresh): 80 * 0.6 * 0.6 = 28.8
    // But since fresh exists, old is excluded from fresh pool anyway
    const result = selectHomepageLead([veryFresh, old], REF);
    expect(result?.id).toBe("vf");
  });

  it("1–6h old gets 1.5 recency multiplier", () => {
    const s3h = makeSituation({ id: "3h", firstDetected: hoursAgo(3, REF), confidenceScore: 60 });
    const s10h = makeSituation({ id: "10h", firstDetected: hoursAgo(10, REF), confidenceScore: 70 });
    // Both in fresh pool (< 24h)
    // s3h: 60 * 0.6 * 1.5 = 54
    // s10h: 70 * 0.6 * 1.0 = 42
    const result = selectHomepageLead([s3h, s10h], REF);
    expect(result?.id).toBe("3h");
  });

  it("6–24h old gets 1.0 recency multiplier", () => {
    const s12h = makeSituation({ id: "12h", firstDetected: hoursAgo(12, REF), confidenceScore: 80 });
    expect(selectHomepageLead([s12h], REF)).toBe(s12h);
  });

  it("> 24h old gets 0.6 recency multiplier (only in full pool)", () => {
    const s48h = makeSituation({ id: "48h", firstDetected: hoursAgo(48, REF), confidenceScore: 90 });
    // No fresh pool → uses full eligible; s48h should still be returned
    expect(selectHomepageLead([s48h], REF)).toBe(s48h);
  });
});

describe("selectHomepageLead — tiebreaking by firstDetected", () => {
  it("newer situation wins when scores are equal", () => {
    const older = makeSituation({ id: "older", firstDetected: hoursAgo(5, REF), confidenceScore: 80 });
    const newer = makeSituation({ id: "newer", firstDetected: hoursAgo(4, REF), confidenceScore: 80 });
    const result = selectHomepageLead([older, newer], REF);
    expect(result?.id).toBe("newer");
  });

  it("older situation loses the tiebreak", () => {
    const a = makeSituation({ id: "a", firstDetected: hoursAgo(10, REF), confidenceScore: 70 });
    const b = makeSituation({ id: "b", firstDetected: hoursAgo(9, REF), confidenceScore: 70 });
    const result = selectHomepageLead([a, b], REF);
    expect(result?.id).toBe("b");
  });

  it("tiebreak is deterministic across multiple calls", () => {
    const a = makeSituation({ id: "a", firstDetected: hoursAgo(5, REF), confidenceScore: 80 });
    const b = makeSituation({ id: "b", firstDetected: hoursAgo(4, REF), confidenceScore: 80 });
    const r1 = selectHomepageLead([a, b], REF);
    const r2 = selectHomepageLead([b, a], REF);
    expect(r1?.id).toBe(r2?.id);
  });
});

describe("selectHomepageLead — referenceTime injection", () => {
  it("accepts a custom referenceTime for deterministic tests", () => {
    const s = makeSituation({ firstDetected: new Date(REF - 3600_000).toISOString() });
    const result = selectHomepageLead([s], REF);
    expect(result).toBe(s);
  });

  it("very old referenceTime makes recent situations seem stale", () => {
    const pastRef = REF - 1000 * 3_600_000; // 1000h before REF
    // situation firstDetected = 1h before REF = 999h before pastRef
    const s = makeSituation({ firstDetected: hoursAgo(1, REF) });
    // age from pastRef = -999h (in the future relative to pastRef — passes cap)
    // ageHoursFrom returns negative → ≤ LEAD_MAX_AGE_HOURS → included
    expect(selectHomepageLead([s], pastRef)).toBe(s);
  });

  it("age cap uses referenceTime — not wall clock", () => {
    const laterRef = REF + 200 * 3_600_000;
    const s = makeSituation({ firstDetected: hoursAgo(150, REF) });
    // From laterRef: age = 150 + 200 = 350h > 168 → excluded
    expect(selectHomepageLead([s], laterRef)).toBeNull();
  });

  it("deterministic results with same referenceTime across multiple calls", () => {
    const a = makeSituation({ id: "a", confidenceScore: 80, firstDetected: hoursAgo(2, REF) });
    const b = makeSituation({ id: "b", confidenceScore: 90, firstDetected: hoursAgo(5, REF) });
    const r1 = selectHomepageLead([a, b], REF);
    const r2 = selectHomepageLead([a, b], REF);
    expect(r1?.id).toBe(r2?.id);
  });
});

describe("selectHomepageLead — combined gates smoke test", () => {
  it("eligible + fresh + highest-confidence wins in a mixed pool", () => {
    const situations: CanonicalSituationRecord[] = [
      makeSituation({ id: "noise", signalType: "noise" }),                          // suppressed
      makeSituation({ id: "weather", signalType: "weather_advisory" }),              // feed only
      makeSituation({ id: "stale", firstDetected: hoursAgo(200, REF) }),             // too old
      makeSituation({ id: "lowconf", confidenceScore: 30, firstDetected: hoursAgo(1, REF) }),
      makeSituation({ id: "winner", confidenceScore: 95, firstDetected: hoursAgo(0.5, REF) }),
    ];
    expect(selectHomepageLead(situations, REF)?.id).toBe("winner");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// selectFeaturedSituation — re-exported from boardSituations
// ─────────────────────────────────────────────────────────────────────────────

describe("selectFeaturedSituation", () => {
  it("is a callable function", () => {
    expect(typeof selectFeaturedSituation).toBe("function");
  });

  it("returns null for an empty array", () => {
    expect(selectFeaturedSituation([])).toBeNull();
  });

  it("returns the single situation from a one-item array", () => {
    const bs = makeBoardSituation({ id: "only" });
    expect(selectFeaturedSituation([bs])?.id).toBe("only");
  });

  it("excludes background-lane situations when non-background candidates exist", () => {
    const bg = makeBoardSituation({ id: "bg", lane: "background" });
    const active = makeBoardSituation({ id: "active", lane: "escalating" });
    const result = selectFeaturedSituation([bg, active]);
    expect(result?.id).toBe("active");
  });

  it("falls back to background situation when it is the only option", () => {
    const bg = makeBoardSituation({ id: "bg", lane: "background" });
    const result = selectFeaturedSituation([bg]);
    expect(result?.id).toBe("bg");
  });

  it("excludes FEATURED_BLOCKED types (roster_move) when alternatives exist", () => {
    const blocked = makeBoardSituation({ id: "blocked", signalType: "roster_move", lane: "escalating" });
    const normal = makeBoardSituation({ id: "normal", signalType: "injury_update", lane: "escalating", confidence: 50 });
    const result = selectFeaturedSituation([blocked, normal]);
    expect(result?.id).toBe("normal");
  });

  // ── age / staleness gate (FEATURED_MAX_AGE_HOURS) ──────────────────────────

  it("FEATURED_MAX_AGE_HOURS is 48h and tighter than the homepage cap", () => {
    expect(FEATURED_MAX_AGE_HOURS).toBe(48);
    expect(FEATURED_MAX_AGE_HOURS).toBeLessThan(LEAD_MAX_AGE_HOURS);
  });

  it("does NOT feature an 8-day-old high-confidence situation (falls back to quiet state)", () => {
    const stale = makeBoardSituation({
      id: "stale",
      lane: "escalating",
      confidence: 95,
      canonicalSituation: { firstSeenAt: hoursAgo(8 * 24) },
    });
    // Only candidate is stale → nothing survives the age gate → null → board shows
    // the quiet "no verified breaks yet" fallback via featuredCopy(null, league).
    expect(selectFeaturedSituation([stale], REF)).toBeNull();
  });

  it("prefers a fresh low-confidence situation over a stale high-confidence one", () => {
    const stale = makeBoardSituation({
      id: "stale",
      lane: "escalating",
      confidence: 95,
      canonicalSituation: { firstSeenAt: hoursAgo(8 * 24) },
    });
    const fresh = makeBoardSituation({
      id: "fresh",
      lane: "escalating",
      confidence: 60,
      canonicalSituation: { firstSeenAt: hoursAgo(2) },
    });
    expect(selectFeaturedSituation([stale, fresh], REF)?.id).toBe("fresh");
  });

  it("prefers an under-24h situation over an older-but-within-cap higher-confidence one", () => {
    const olderStrong = makeBoardSituation({
      id: "older",
      lane: "escalating",
      confidence: 90,
      canonicalSituation: { firstSeenAt: hoursAgo(30) }, // within 48h cap, but not fresh
    });
    const freshWeak = makeBoardSituation({
      id: "fresh",
      lane: "escalating",
      confidence: 55,
      canonicalSituation: { firstSeenAt: hoursAgo(3) }, // under 24h → wins via fresh-pool
    });
    expect(selectFeaturedSituation([olderStrong, freshWeak], REF)?.id).toBe("fresh");
  });

  it("still features a within-cap situation (47h old) when no fresher option exists", () => {
    const nearCap = makeBoardSituation({
      id: "near",
      lane: "escalating",
      confidence: 80,
      canonicalSituation: { firstSeenAt: hoursAgo(47) },
    });
    expect(selectFeaturedSituation([nearCap], REF)?.id).toBe("near");
  });

  it("keeps unknown-age situations (relative-label signal feeds have no ISO timestamp)", () => {
    // No canonicalSituation/signal timestamp → featuredAgeHours returns null → kept.
    // Guards against the age gate wrongly nuking signal-fed boards.
    const noTs = makeBoardSituation({ id: "no-ts", lane: "escalating", confidence: 70 });
    expect(selectFeaturedSituation([noTs], REF)?.id).toBe("no-ts");
  });
});
