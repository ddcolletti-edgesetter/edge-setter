import { describe, it, expect } from "vitest";

// Regression test, Aug 15 2026: checkCorroboration() in x-twitter.ts was
// treating an insider's own outlet republishing their story (e.g. Adam
// Schefter posts on X, ESPN NFL RSS picks up the same story — Schefter
// IS ESPN's insider) as a second, independent corroborating source. That
// silently double-counted one person's report as two sources and pushed
// confidence into the corroborated tier (+5, capped 98) when nothing
// independent actually happened.
//
// Fix: checkCorroboration takes the insider's outlet and skips any RSS
// event whose feed-level source_labels match that outlet.

function checkCorroboration(
  playerName: string | null,
  signalType: string,
  recentEvents: any[],
  excludeOutlet: string | null = null,
): boolean {
  if (!playerName) return false;
  return recentEvents.some(e => {
    const payload = e.payload as any;
    if (!(
      e.player === playerName &&
      payload?.signal_type === signalType &&
      (payload?.on3_feed !== undefined ||
       payload?.sports247_feed !== undefined ||
       payload?.source_type === "rss")
    )) {
      return false;
    }
    if (excludeOutlet) {
      const labels: string[] = payload?.source_labels ?? [];
      const sameOutlet = labels.some((l: string) =>
        l.toLowerCase().includes(excludeOutlet.toLowerCase())
      );
      if (sameOutlet) return false;
    }
    return true;
  });
}

const espnRssEvent = {
  player: "Christen Miller",
  payload: {
    signal_type: "injury",
    source_type: "rss",
    source_labels: ["ESPN NFL"],
  },
};

const pftRssEvent = {
  player: "Christen Miller",
  payload: {
    signal_type: "injury",
    source_type: "rss",
    source_labels: ["Pro Football Talk"],
  },
};

describe("checkCorroboration — same-outlet false-corroboration guard", () => {
  it("does NOT treat an ESPN insider's own outlet RSS pickup as independent corroboration", () => {
    const result = checkCorroboration("Christen Miller", "injury", [espnRssEvent], "ESPN");
    expect(result).toBe(false);
  });

  it("still treats a genuinely different outlet as valid corroboration", () => {
    const result = checkCorroboration("Christen Miller", "injury", [pftRssEvent], "ESPN");
    expect(result).toBe(true);
  });

  it("falls back to prior behavior when no outlet is provided (backward compatible)", () => {
    const result = checkCorroboration("Christen Miller", "injury", [espnRssEvent]);
    expect(result).toBe(true);
  });
});
