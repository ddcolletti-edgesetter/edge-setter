import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SignalDetailDrawer } from "@/components/SignalDetailDrawer";
import { SituationStoryCard } from "@/components/board/SituationStoryCard";
import { toSituationStoryCardData } from "@/components/board/boardAdapters";
import type { SituationRowData } from "@/components/board/SituationRow";

const baseRow: SituationRowData = {
  id: "story-hierarchy-1",
  title: "LAD @ ARI movement puts ARI market context on watch",
  // "lineup", not "roster": this fixture is an MLB lineup story that moved the
  // line, and storyImpactSections derives the Fantasy block from the card's
  // words. It used to find them in storyWhyItMatters' per-league sentence
  // ("...lineup, pitcher, injury, weather, bullpen, or availability..."), which
  // is deleted — so the row now has to say what it means itself. Measured on
  // prod: 30 cards lose the Fantasy block, every one of them a `market` row
  // with no player, whose block body was the generic fallback.
  subtitle: "Late lineup context changed before first pitch.",
  league: "MLB",
  matchup: "LAD @ ARI",
  market: "Market reaction detected",
  marketReaction: "Line moved after late roster context.",
  sourceCount: 3,
  urgencyScore: 82,
  statusLabel: "Context Moving",
  lifecycleLabel: "Context Moving",
  timingStageLabel: "Early market reaction",
  // This row's own evidence growth. storyWhyItMatters no longer falls back to a
  // per-league sentence, so without it the "Why it matters" tile is omitted and
  // the ordering assertions below would have nothing to order. The omission
  // itself is covered in board-copy-honesty.test.ts.
  evidenceGrowthLabel: "A second report attached overnight",
  sportsIdentity: {
    sport: "mlb",
    awayTeam: "LAD",
    homeTeam: "ARI",
    team: "ARI",
    opponent: "LAD",
  },
};

describe("sports story hierarchy", () => {
  it("keeps fantasy and betting downstream of core story sections on board cards", () => {
    const story = toSituationStoryCardData(baseRow);
    render(<SituationStoryCard story={story} />);

    const text = document.body.textContent ?? "";
    expect(story.headline).not.toMatch(/market context on watch|role picture on watch|keeps .* on watch/i);
    // Was "LAD-ARI line movement follows late roster context" — a cause this
    // row asserts and cannot support. The headline now states only what the
    // row knows; this test is about section order, so it pins the subject.
    expect(story.headline).toContain("LAD-ARI");
    expect(story.headline).not.toMatch(/follows late (roster|availability) context/i);
    expect(screen.getByText("More impact context")).toBeInTheDocument();
    expect(screen.getByText("Fantasy impact")).toBeInTheDocument();
    expect(screen.getByText("Betting/market impact")).toBeInTheDocument();

    const whatChanged = text.indexOf("What happened");
    const whyItMatters = text.indexOf("Why it matters");
    const watchNext = text.indexOf("Watch next");
    const moreContext = text.indexOf("More impact context");
    const fantasy = text.indexOf("Fantasy impact");
    const betting = text.indexOf("Betting/market impact");

    expect(whatChanged).toBeGreaterThanOrEqual(0);
    expect(whyItMatters).toBeGreaterThan(whatChanged);
    expect(watchNext).toBeGreaterThan(whyItMatters);
    expect(moreContext).toBeGreaterThan(watchNext);
    expect(fantasy).toBeGreaterThan(moreContext);
    expect(betting).toBeGreaterThan(fantasy);
  });

  it("keeps board-card proof language compact before lower impact context", () => {
    const story = toSituationStoryCardData({
      ...baseRow,
      id: "cfb-card-1",
      title: "Ohio State availability update changes second-half rotation read",
      subtitle: "Beat and team context changed the Buckeyes rotation picture.",
      league: "CFB",
      matchup: "Ohio State vs Michigan",
      market: "Number moved after the availability update.",
      marketReaction: "Number moved after the availability update.",
      statusLabel: "Developing",
      timingStageLabel: "Late-week update",
      sportsIdentity: {
        sport: "cfb",
        team: "Ohio State",
        opponent: "Michigan",
      },
    });

    render(<SituationStoryCard story={story} featured />);

    const text = document.body.textContent ?? "";
    expect(text).toContain("Source trail");
    expect(text).toContain("Timing");
    expect(text).toContain("Evidence");
    expect(text).not.toContain("Evidence review");
    expect(text).not.toContain("source check complete");
    expect(text).not.toContain("timing check complete");

    const whyItMatters = text.indexOf("Why it matters");
    const sourceTrail = text.indexOf("Source trail");
    const moreContext = text.indexOf("More impact context");
    const fantasy = text.indexOf("Fantasy impact");
    const betting = text.indexOf("Betting/market impact");
    expect(sourceTrail).toBeGreaterThan(whyItMatters);
    expect(moreContext).toBeGreaterThan(sourceTrail);
    expect(fantasy).toBeGreaterThan(moreContext);
    expect(betting).toBeGreaterThan(fantasy);
  });

  it("orders Open Story detail as sports story, evidence, then fantasy and market impact", () => {
    render(
      <SignalDetailDrawer
        open
        sport="MLB"
        onClose={vi.fn()}
        signal={{
          id: "drawer-story-1",
          headline: "Late Dodgers roster context changes Diamondbacks matchup",
          detail: "A late roster update changed the matchup read before first pitch.",
          why_it_matters: "The roster change can alter lineup planning and how both teams handle the matchup.",
          action_takeaway: "Watch confirmed lineups, roster notes, and whether the number keeps moving.",
          type: "lineup",
          team: "ARI",
          confidence: 84,
          sources: 3,
          source_count: 3,
          bettingRelevance: true,
          fantasyRelevance: true,
          lineupStatus: "Lineup context affects how both teams set their matchup.",
          lineMovement: { open: "-110", current: "-125", note: "Line moved after late roster context." },
          timestamp: "10m ago",
        }}
      />,
    );

    const text = document.body.textContent ?? "";
    const changed = text.indexOf("What changed");
    const matters = text.indexOf("Why it matters");
    const next = text.indexOf("What to watch next");
    const evidence = text.indexOf("Source trail / timing / evidence");
    const fantasy = text.indexOf("Fantasy impact");
    const market = text.indexOf("Betting/market impact");

    expect(changed).toBeGreaterThanOrEqual(0);
    expect(matters).toBeGreaterThan(changed);
    expect(next).toBeGreaterThan(matters);
    expect(evidence).toBeGreaterThan(next);
    expect(fantasy).toBeGreaterThan(evidence);
    expect(market).toBeGreaterThan(fantasy);
    expect(text).toContain("Line moved after late roster context.");
  });
});
