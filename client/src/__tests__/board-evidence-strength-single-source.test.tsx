import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FeaturedSituation } from "@/components/board/FeaturedSituation";
import { SituationRow } from "@/components/board/SituationRow";
import { SituationStoryCard } from "@/components/board/SituationStoryCard";
import { toSituationRowData, toSituationStoryCardData, type AnyBoardSignal } from "@/components/board/boardAdapters";
import { SignalDetailDrawer, type SignalDetailLike } from "@/components/SignalDetailDrawer";
import { signalConfidenceNarrative } from "@/lib/signalBoardUx";
import type { BoardSituation } from "@/lib/boardSituations";

/**
 * "Surfaces disagree" regression. PR #31 capped only the drawer's evidence-
 * strength StatCard; the board top card, the stories-to-watch list card, and the
 * confidence narrative kept mapping a high (often single-prior) confidence number
 * to "Strong support" / "Strong evidence support" next to a "1 report" /
 * "single-source" count. The cap now lives in the shared confidence-tier path
 * (publicConfidenceLabel + shouldCapSingleSourceStrength), so EVERY surface that
 * renders the same single-source story must agree — none may read "strong" /
 * "corroborated" / "consensus" / "multiple sources".
 */

// A genuinely single-source, delta-labeled signal — the exact shape that tripped
// the overclaim in prod (one source; confirmation_strength derived from line
// movement rather than a count). confidence 74 is the value the ticket's prod
// case carried and is high enough to trip the "Strong support" evidence tier.
function singleSourceSignal(confidence = 74): AnyBoardSignal & SignalDetailLike {
  return {
    id: "nfl-sf-market",
    headline: "SF: +1.5 -> -1.5 — market movement",
    detail: "Spread flipped from +1.5 to -1.5.",
    team: "SF",
    type: "line_move",
    verdict: "likely",
    confidence,
    confirmationStrength: "corroborated", // delta-derived label, NOT a count
    sources: 1,
    source_count: 1,
    lineMovement: { open: "+1.5", current: "-1.5", note: "Moved -3 pts", direction: "down" } as any,
    timestamp: "10m ago",
  };
}

function singleSourceSituation(confidence = 74): BoardSituation {
  const signal = singleSourceSignal(confidence);
  return {
    id: "nfl-sf-market",
    kind: "signal",
    league: "NFL",
    lane: "background",
    escalation: "Watch",
    title: "SF: +1.5 -> -1.5 — market movement",
    detail: "Spread flipped from +1.5 to -1.5.",
    team: "SF",
    signalType: "line_move",
    statusLabel: "Developing",
    timeLabel: "10m ago",
    score: 62,
    confidence,
    sourceCount: 1,
    trustLabel: "single-source",
    lifecycle: "Developing",
    lifecycleStage: "Developing",
    confidenceNote: signalConfidenceNarrative(signal),
    isLive: false,
    isActionable: false,
    relatedSignalIds: [],
    signal,
  };
}

// Wording a single, unverified source cannot honestly claim. Note the past-tense
// "\bcorroborated\b" — the honest downgrade "corroboration still building" is
// explicitly allowed (same contract as the PR #31 drawer guard).
const OVERCLAIM = /\bstrong\b|\bcorroborated\b|\bconsensus\b|multiple (report|source)/i;

describe("board evidence-strength — single-source story never overclaims across surfaces", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
  });

  it("caps the confidence narrative (Evidence strength note) even at high confidence", () => {
    // signalConfidenceNarrative emits "Strong evidence support" at confidence >= 85;
    // for a lone unverified source that must be held back. Exercise the >= 85 path.
    expect(singleSourceSituation(88).confidenceNote ?? "").not.toMatch(OVERCLAIM);
  });

  it("agrees across the top card, the stories-to-watch row, the story card, and the drawer", () => {
    const situation = singleSourceSituation();
    const row = toSituationRowData(situation);
    const story = toSituationStoryCardData(row);

    // 1. NFL top "Top Developing Story" card (editorial story presentation).
    const topCard = render(<FeaturedSituation situation={row} presentation="story" league="NFL" />);
    expect(topCard.container.textContent ?? "").not.toMatch(OVERCLAIM);
    topCard.unmount();

    // 2. Story card (SituationStoryCard renders the shared story.confidence).
    const storyCard = render(<SituationStoryCard story={story} />);
    expect(storyCard.container.textContent ?? "").not.toMatch(OVERCLAIM);
    storyCard.unmount();

    // 3. Stories-to-watch list row (editorial copy renders "Evidence strength").
    const listRow = render(<SituationRow situation={row} copyVariant="editorial" />);
    const listText = listRow.container.textContent ?? "";
    expect(listText).toContain("Evidence strength");
    expect(listText).not.toMatch(OVERCLAIM);
    listRow.unmount();

    // 4. The drawer for the same underlying single-source signal.
    const drawer = render(
      <SignalDetailDrawer open signal={singleSourceSignal()} sport="NFL" onClose={() => undefined} />,
    );
    const drawerText = document.body.textContent ?? "";
    expect(drawerText).not.toMatch(OVERCLAIM);
    expect(drawerText).toMatch(/1 (report check|source check)/i);
    drawer.unmount();
  });
});
