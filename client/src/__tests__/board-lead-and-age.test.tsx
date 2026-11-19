/**
 * Three things a board claimed by what it chose to show.
 *
 * ITEM 8 — the LEAD. "Top developing story" was allowed to be a cooling one.
 *   The background LANE was excluded; a Stale or Expiring LIFECYCLE was not,
 *   and the two do not imply each other. On prod the CFB board's lead was a
 *   line move whose lifecycle is Expiring, sitting in the `decision` lane
 *   because it had an action note.
 *
 * ITEM 9 — the RAIL. `SignalRow` prints `player ?? team ?? ""`, so a row with
 *   neither rendered as a bare topic with no subject. The filter has to run
 *   BEFORE `dedupeBySignalType`, which deliberately clears player and team on
 *   the summary rows it builds — filtering after would delete the rail's most
 *   useful rows and keep the broken ones.
 *
 * ITEM 5 — AGE and LENGTH. The boards had no age cut at all and printed every
 *   row they had: 185 cards on NFL, 212 on CFB, with canonical situations up to
 *   30 days old mixed in among this morning's.
 */
import { describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  BOARD_INITIAL_CARD_CAP,
  BOARD_MAX_AGE_DAYS,
  selectFeaturedSituation,
  withinBoardAge,
  type BoardSituation,
} from "@/lib/boardSituations";
import { BoardSignalRail } from "@/components/BoardSignalRail";
import { BoardShowMoreCards, useBoardCardCap } from "@/components/board/BoardCardCap";

const NOW = Date.parse("2026-11-19T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);

function situation(overrides: Partial<BoardSituation> & { id: string }): BoardSituation {
  return {
    kind: "signal",
    league: "NFL",
    lane: "decision",
    escalation: "Watch",
    title: overrides.id,
    score: 50,
    confidence: 70,
    sourceCount: 2,
    trustLabel: "2 source checks",
    lifecycle: "Developing",
    lifecycleStage: "Developing",
    isLive: false,
    isActionable: true,
    relatedSignalIds: [],
    signal: { isoTimestamp: hoursAgo(2) },
    ...overrides,
  } as BoardSituation;
}

/* ── Item 8: the lead ────────────────────────────────────────────────────── */

describe("the board lead is never a cooling story", () => {
  it("passes over an Expiring row for a live one, even when it ranks higher", () => {
    // The shape prod actually had: an Expiring line move in the `decision`
    // lane, so the background-lane exclusion never saw it, and a higher
    // confidence than the live row so it won the rank.
    const expiring = situation({ id: "expiring", lifecycle: "Expiring", confidence: 95 });
    const live = situation({ id: "live", lifecycle: "Developing", confidence: 70 });
    expect(selectFeaturedSituation([expiring, live], NOW)?.id).toBe("live");
  });

  it("passes over a Stale row too", () => {
    const stale = situation({ id: "stale", lifecycle: "Stale", confidence: 99 });
    const live = situation({ id: "live", lifecycle: "Early", confidence: 60 });
    expect(selectFeaturedSituation([stale, live], NOW)?.id).toBe("live");
  });

  it("still excludes the background lane, whatever the lifecycle", () => {
    const background = situation({ id: "bg", lane: "background", confidence: 99 });
    const live = situation({ id: "live", confidence: 60 });
    expect(selectFeaturedSituation([background, live], NOW)?.id).toBe("live");
  });

  it("leads with a cooling row rather than nothing when it is all there is", () => {
    // The cascade is unchanged: the final fallback is the whole within-age
    // pool, so a board of nothing but cooling rows shows a lead instead of
    // dropping to the quiet-board state.
    const expiring = situation({ id: "expiring", lifecycle: "Expiring" });
    const stale = situation({ id: "stale", lifecycle: "Stale" });
    expect(selectFeaturedSituation([expiring, stale], NOW)?.id).toBeTruthy();
  });

  it("returns null only when there is nothing at all", () => {
    expect(selectFeaturedSituation([], NOW)).toBeNull();
  });

  it("does not demote a row whose lifecycle is simply unremarkable", () => {
    const widely = situation({ id: "widely", lifecycle: "Widely Known", confidence: 90 });
    const early = situation({ id: "early", lifecycle: "Early", confidence: 60 });
    expect(selectFeaturedSituation([widely, early], NOW)?.id).toBe("widely");
  });
});

/* ── Item 9: the rail ────────────────────────────────────────────────────── */

const railRows = () =>
  Array.from(document.querySelectorAll(".bloomberg-row")).map((el) => ({
    topic: (el.querySelector(".bloomberg-topic")?.firstChild?.textContent ?? "").trim(),
    subject: (el.querySelector(".bloomberg-topic small")?.textContent ?? "").trim(),
  }));

describe("the signal rail only lists rows it can name", () => {
  it("drops a row with neither a player nor a team", () => {
    cleanup();
    render(<BoardSignalRail situations={[
      situation({ id: "named", signalType: "injury", player: "A Player" }),
      situation({ id: "nameless", signalType: "operator_note" }),
    ]} />);
    const topics = railRows().map((r) => r.topic);
    expect(topics).toContain("Injury");
    expect(topics).not.toContain("Operator note");
    expect(railRows().every((r) => r.subject)).toBe(true);
  });

  it("treats whitespace as no subject at all", () => {
    cleanup();
    render(<BoardSignalRail situations={[situation({ id: "blank", signalType: "injury", team: "   " })]} />);
    expect(railRows()).toHaveLength(0);
  });

  it("KEEPS the summary rows, which have no subject by design", () => {
    // This is the whole reason the filter runs before dedupeBySignalType. A
    // group of same-type rows collapses into one summary row whose player and
    // team are deliberately cleared, because "3 injuries" is about three
    // subjects. Filtering after the dedupe would delete exactly these.
    cleanup();
    render(<BoardSignalRail situations={[
      situation({ id: "i1", signalType: "injury", player: "One" }),
      situation({ id: "i2", signalType: "injury", player: "Two" }),
      situation({ id: "i3", signalType: "injury", player: "Three" }),
    ]} />);
    expect(railRows().map((r) => r.topic)).toEqual(["3 injuries"]);
  });

  it("does not count a nameless row into a summary total", () => {
    cleanup();
    render(<BoardSignalRail situations={[
      situation({ id: "i1", signalType: "injury", player: "One" }),
      situation({ id: "i2", signalType: "injury", player: "Two" }),
      situation({ id: "i3", signalType: "injury" }),
    ]} />);
    // Two, not three: the rail may not claim a signal it cannot attribute.
    expect(railRows().map((r) => r.topic)).toEqual(["2 injuries"]);
  });

  it("keeps the empty state when every row is nameless", () => {
    cleanup();
    render(<BoardSignalRail situations={[situation({ id: "n1", signalType: "injury" })]} />);
    expect(screen.getByText(/no active signals/i)).toBeInTheDocument();
  });
});

/* ── Item 5: the age cut ─────────────────────────────────────────────────── */

describe("withinBoardAge", () => {
  const canonical = (id: string, lastUpdatedAt: string) =>
    situation({ id, kind: "canonical", signal: undefined, canonicalSituation: { lastUpdatedAt } });

  it("is three days", () => {
    expect(BOARD_MAX_AGE_DAYS).toBe(3);
  });

  it("keeps a canonical row that changed inside the window", () => {
    expect(withinBoardAge([canonical("fresh", hoursAgo(1))], NOW).map((s) => s.id)).toEqual(["fresh"]);
    expect(withinBoardAge([canonical("edge", daysAgo(3))], NOW).map((s) => s.id)).toEqual(["edge"]);
  });

  it("drops a canonical row that has not changed since", () => {
    expect(withinBoardAge([canonical("old", daysAgo(4))], NOW)).toEqual([]);
    expect(withinBoardAge([canonical("ancient", daysAgo(30))], NOW)).toEqual([]);
  });

  it("reads lastUpdatedAt, not first-seen — a long-running story that just moved is live", () => {
    const row = situation({
      id: "revived",
      kind: "canonical",
      signal: undefined,
      canonicalSituation: { firstSeenAt: daysAgo(14), lastUpdatedAt: hoursAgo(2) },
    });
    expect(withinBoardAge([row], NOW).map((s) => s.id)).toEqual(["revived"]);
  });

  it("dates a signal row from whichever timestamp it carries", () => {
    expect(withinBoardAge([situation({ id: "a", signal: { updated_at: hoursAgo(2) } })], NOW)).toHaveLength(1);
    expect(withinBoardAge([situation({ id: "b", signal: { isoTimestamp: daysAgo(5) } })], NOW)).toHaveLength(0);
    expect(withinBoardAge([situation({ id: "c", signal: { created_at: daysAgo(5) } })], NOW)).toHaveLength(0);
    // updated_at wins: a signal restated today is live whenever it was created.
    expect(withinBoardAge([situation({ id: "d", signal: { updated_at: hoursAgo(1), created_at: daysAgo(9) } })], NOW)).toHaveLength(1);
  });

  it("keeps a row it cannot date, including every games row", () => {
    // A games row's cachedAt is when WE fetched the fixture, not when anything
    // about it changed, so there is nothing here to read as an age — and
    // publicGamesForLeague has already windowed the slate.
    expect(withinBoardAge([situation({ id: "game", kind: "game", signal: undefined, game: { cachedAt: new Date(NOW) } })], NOW)).toHaveLength(1);
    expect(withinBoardAge([situation({ id: "none", signal: {} })], NOW)).toHaveLength(1);
    expect(withinBoardAge([situation({ id: "junk", signal: { isoTimestamp: "not a date" } })], NOW)).toHaveLength(1);
  });

  it("takes a window override, so a caller can be explicit", () => {
    const row = canonical("row", daysAgo(5));
    expect(withinBoardAge([row], NOW, 7)).toHaveLength(1);
    expect(withinBoardAge([row], NOW, 1)).toHaveLength(0);
  });

  it("preserves order, because the board already ranked them", () => {
    const rows = [canonical("a", hoursAgo(1)), canonical("b", daysAgo(9)), canonical("c", hoursAgo(3))];
    expect(withinBoardAge(rows, NOW).map((s) => s.id)).toEqual(["a", "c"]);
  });
});

/* ── Item 5: the card cap ────────────────────────────────────────────────── */

function CapHarness({ count }: { count: number }) {
  const items = Array.from({ length: count }, (_, i) => `card-${i}`);
  const { visible, hidden, total, showAll } = useBoardCardCap(items);
  return (
    <div>
      <span data-testid="shown">{visible.length}</span>
      <span data-testid="hidden">{hidden}</span>
      <span data-testid="total">{total}</span>
      <BoardShowMoreCards hidden={hidden} onShowAll={showAll} />
    </div>
  );
}

describe("the card cap", () => {
  it("starts at 25", () => {
    expect(BOARD_INITIAL_CARD_CAP).toBe(25);
  });

  it("shows the cap and holds the rest", () => {
    cleanup();
    render(<CapHarness count={212} />);
    expect(screen.getByTestId("shown").textContent).toBe("25");
    expect(screen.getByTestId("hidden").textContent).toBe("187");
    expect(screen.getByTestId("total").textContent).toBe("212");
    expect(screen.getByTestId("board-show-more")).toHaveTextContent("Show 187 more stories");
  });

  it("shows everything once asked, so nothing is unreachable", async () => {
    cleanup();
    render(<CapHarness count={212} />);
    await userEvent.click(screen.getByTestId("board-show-more"));
    expect(screen.getByTestId("shown").textContent).toBe("212");
    expect(screen.getByTestId("hidden").textContent).toBe("0");
    expect(screen.queryByTestId("board-show-more")).toBeNull();
  });

  it("leaves a board shorter than the cap exactly as it was", () => {
    cleanup();
    render(<CapHarness count={22} />);
    expect(screen.getByTestId("shown").textContent).toBe("22");
    expect(screen.getByTestId("hidden").textContent).toBe("0");
    expect(screen.queryByTestId("board-show-more")).toBeNull();
  });

  it("renders no control for an empty board", () => {
    cleanup();
    render(<CapHarness count={0} />);
    expect(screen.queryByTestId("board-show-more")).toBeNull();
  });
});
