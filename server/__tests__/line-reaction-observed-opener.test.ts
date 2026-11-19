import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * What checkLineReaction says when the opening line was never observed — and
 * what that silence costs one step downstream.
 *
 * THE READING IT USED TO GIVE. games.open_spread is insert-only and prod's
 * future NFL rows were all created on 2026-08-01, so for
 * NFL_2026_11_22_PIT_PHI this function reported, as market evidence on an
 * injury claim about either club: "NFL line moved +10.0 pts from open
 * (-5.5 → 4.5)". Both numbers are real. The sentence is not: they are four
 * months apart, and nothing we observed connects them.
 *
 * THE KNOCK-ON, which is the reason the second half of this file exists.
 * retrieverAgent (agents.ts) files a market evidence row only when
 * `lineReaction.checked && lineReaction.stance`. Declining therefore does not
 * simply remove a row — when the market reading was the claim's ONLY evidence,
 * the function falls through to its source-tier fallback, which files a
 * different evidence_type at a different authority_level:
 *
 *      market,  authority 3   (what it used to file, on an invented delta)
 *   →  primary, authority 5 / 4 / 3 / 2 by tier  (what it files now)
 *
 * So for a tier-1 source the authority on a lone-evidence claim goes UP, 3 → 5,
 * and for tier 4 it goes DOWN, 3 → 2. That is a real behaviour change and it
 * is pinned here rather than discovered later.
 */

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "es-line-reaction-"));
process.env.PIPELINE_DATA_DIR = TMP_DIR;

/* ─── Doubles ────────────────────────────────────────────────────────── */

const evidenceRows: Array<Record<string, any>> = [];
const fakeStorage = {
  getClaim: vi.fn(),
  getEvent: vi.fn(),
  getSource: vi.fn(),
  createEvidence: vi.fn((e: Record<string, any>) => { evidenceRows.push(e); return e; }),
  logAgentAction: vi.fn(),
};

vi.mock("../storage", () => ({
  storage: fakeStorage,
  // retrieval.ts and store.ts reach for these at import time.
  markBackfillPhase: vi.fn(),
  getBackfillPhase: vi.fn(),
  getAllBackfillProgress: vi.fn(() => []),
  resetBackfillPhases: vi.fn(),
}));

/**
 * Only the two retrieval paths that are not under test are replaced, so
 * checkLineReaction stays the REAL function reading the REAL fixture database.
 * The seam is deliberate: the half this PR changes is exercised for real, and
 * the half it does not is held still.
 */
vi.mock("../retrieval", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../retrieval")>();
  return {
    ...actual,
    findCorroboratingEvents: vi.fn(() => ({
      supporting: 0, contradicting: 0, sourceNames: [], contradictingNames: [],
    })),
    checkOfficialInjuryStatus: vi.fn(async () => ({
      checked: false, stance: null, notes: "", designation: null,
    })),
  };
});

type StoreMod = typeof import("../pipeline/store");
type RetrievalMod = typeof import("../retrieval");
type AgentsMod = typeof import("../agents");

let store: StoreMod;
let retrieval: RetrievalMod;
let agents: AgentsMod;

beforeAll(async () => {
  store = await import("../pipeline/store");
  retrieval = await import("../retrieval");
  agents = await import("../agents");
});

/* ─── Fixture ────────────────────────────────────────────────────────── */

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const GAME_ID = "NFL_2099_11_22_PIT_PHI";
const FUTURE = "2099-11-22T21:25:00.000Z";

function seedGame(openSpread: number, currentSpread: number) {
  store.upsertGame({
    id: GAME_ID, league: "NFL", home_team: "PHI", away_team: "PIT",
    game_time: FUTURE, status: "scheduled",
    spread_line: currentSpread, spread_team: "PHI", total_line: 37.5,
    moneyline_home: 180, moneyline_away: -218,
    open_spread: openSpread, open_total: 42.5,
    home_score: null, away_score: null, source_game_id: "src-1",
  } as any);
}

function snapshotAt(gameId: string, league: string, atMs: number, spread: number) {
  store.insertOddsSnapshot({
    game_id: gameId, league, sportsbook: "pinnacle",
    spread_line: spread, spread_team: "PHI", total_line: 42.5,
    moneyline_home: 180, moneyline_away: -218,
    source_game_id: "src-1", snapshot_at: iso(atMs),
  });
}

/** The prod shape: an August opener, a hole, and NFL ingested right through it. */
function seedGappedHistory() {
  const now = Date.now();
  snapshotAt(GAME_ID, "NFL", now - 110 * DAY, -5.5);
  for (const d of [8, 6, 4, 2, 1]) snapshotAt(GAME_ID, "NFL", now - d * DAY, 4.5);
  snapshotAt("NFL_OTHER", "NFL", now - 60 * DAY, -3);
}

/** The same game, watched without interruption. */
function seedCleanHistory() {
  const now = Date.now();
  for (const d of [8, 6, 4, 2, 1]) snapshotAt(GAME_ID, "NFL", now - d * DAY, -5.5);
}

beforeEach(() => {
  const db = store.getPipelineDb();
  for (const t of ["odds_snapshots", "games", "live_signals"]) {
    try { db.prepare(`DELETE FROM ${t}`).run(); } catch { /* optional */ }
  }
  evidenceRows.length = 0;
  vi.clearAllMocks();
  delete process.env.ODDS_OPEN_REBASELINE_DAYS;
});

/* ═══ 1. checkLineReaction ═══════════════════════════════════════════ */

describe("7. checkLineReaction and the unobserved opener", () => {
  it("T26 — an observed opener still gives a reading, unchanged", () => {
    seedGame(-5.5, -4.0);
    seedCleanHistory();

    const r = retrieval.checkLineReaction("PHI", "NFL", "injury");
    expect(r.checked).toBe(true);
    expect(r.openSpread).toBe(-5.5);
    expect(r.currentSpread).toBe(-4.0);
    expect(r.delta).toBe(1.5);
    expect(r.stance).toBe("support");
    expect(r.notes).toContain("moved +1.5 pts from open");
  });

  it("T27 — the prod shape (August opener, hole, league alive) reports checked:false", () => {
    seedGame(-5.5, 4.5);
    seedGappedHistory();

    const r = retrieval.checkLineReaction("PHI", "NFL", "injury");
    expect(r.checked).toBe(false);
    expect(r.stance).toBeNull();
    expect(r.notes).toContain("not observation-backed");
    // The sentence this replaces, kept here so the test says what it prevents.
    expect(r.notes).not.toContain("+10.0 pts");
    expect(r.notes).not.toContain("moved");
  });

  it("T28 — a league-wide silence also declines, from the other side of the fork", () => {
    seedGame(-5.5, 4.5);
    const now = Date.now();
    snapshotAt(GAME_ID, "NFL", now - 110 * DAY, -5.5);
    for (const d of [8, 6, 4, 2, 1]) snapshotAt(GAME_ID, "NFL", now - d * DAY, 4.5);
    // no other NFL rows anywhere in the hole

    const r = retrieval.checkLineReaction("PHI", "NFL", "injury");
    expect(r.checked).toBe(false);
    expect(r.notes).toContain("gap_league_silent");
  });

  it("T29 — a game with no snapshot history keeps today's behaviour", () => {
    // The pre-snapshot-table population. "No history" is not evidence of a
    // hole, so this must not become a silent, repo-wide switch-off.
    seedGame(-5.5, -4.0);

    const r = retrieval.checkLineReaction("PHI", "NFL", "injury");
    expect(r.checked).toBe(true);
    expect(r.delta).toBe(1.5);
  });

  it("T30 — raising ODDS_OPEN_REBASELINE_DAYS past the hole restores the reading", () => {
    seedGame(-5.5, 4.5);
    seedGappedHistory();
    expect(retrieval.checkLineReaction("PHI", "NFL", "injury").checked).toBe(false);

    process.env.ODDS_OPEN_REBASELINE_DAYS = "200";
    const r = retrieval.checkLineReaction("PHI", "NFL", "injury");
    expect(r.checked).toBe(true);
    expect(r.delta).toBe(10);   // the old answer, behind a knob
  });
});

/* ═══ 2. The agents.ts knock-on ══════════════════════════════════════ */

describe("8. the authority-level knock-on at agents.ts", () => {
  /** A claim whose only possible evidence is the market reading. */
  function stageClaim(tier: string) {
    fakeStorage.getClaim.mockReturnValue({
      id: "claim-1", claim_type: "injury", event_id: "ev-1", source_id: "src-1",
      raw_claim_text: "Hurts limited in practice", created_at: iso(Date.now()),
    });
    fakeStorage.getEvent.mockReturnValue({
      id: "ev-1", player: "Jalen Hurts", team: "PHI", league: "NFL", topic: "injury",
    });
    fakeStorage.getSource.mockReturnValue({ id: "src-1", name: "A Reporter", trust_tier: tier, url: null });
  }

  it("T31 — BEFORE: an observed opener files market evidence at authority 3", async () => {
    seedGame(-5.5, -4.0);
    seedCleanHistory();
    stageClaim("tier1");

    const result = await agents.retrieverAgent("claim-1");

    expect(result.evidence_count).toBe(1);
    expect(evidenceRows).toHaveLength(1);
    expect(evidenceRows[0]).toMatchObject({
      evidence_type: "market",
      authority_level: 3,
      stance: "support",
    });
  });

  it("T32 — AFTER: the same claim on a gapped game files the tier-1 fallback at authority 5", async () => {
    seedGame(-5.5, 4.5);
    seedGappedHistory();
    stageClaim("tier1");

    const result = await agents.retrieverAgent("claim-1");

    expect(result.evidence_count).toBe(1);
    expect(evidenceRows).toHaveLength(1);
    // Not a removed row — a DIFFERENT row. This is the knock-on.
    expect(evidenceRows[0]).toMatchObject({
      evidence_type: "primary",
      authority_level: 5,
      stance: "support",
    });
    expect(evidenceRows[0].evidence_type).not.toBe("market");
  });

  it("T33 — and for a tier-4 source the same change moves authority 3 → 2", async () => {
    seedGame(-5.5, 4.5);
    seedGappedHistory();
    stageClaim("tier4");

    await agents.retrieverAgent("claim-1");

    expect(evidenceRows[0]).toMatchObject({
      evidence_type: "primary",
      authority_level: 2,
      stance: "context",
    });
  });

  it("T34 — when other evidence exists, declining simply removes the market row", async () => {
    // The fallback only fires at evidenceCount === 0, so a claim with
    // corroboration loses the market row and gains nothing in its place.
    const retrievalMod = await import("../retrieval");
    (retrievalMod.findCorroboratingEvents as any).mockReturnValue({
      supporting: 1, contradicting: 0, sourceNames: ["Another Reporter"], contradictingNames: [],
    });

    seedGame(-5.5, 4.5);
    seedGappedHistory();
    stageClaim("tier1");

    const result = await agents.retrieverAgent("claim-1");

    expect(result.evidence_count).toBe(1);
    expect(evidenceRows.map(e => e.evidence_type)).toEqual(["corroborating"]);
  });
});
