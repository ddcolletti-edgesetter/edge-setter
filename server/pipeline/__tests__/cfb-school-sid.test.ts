import { describe, expect, it } from "vitest";

import { classifyEventType, extractHeadlines, extractPlayerName } from "../adapters/cfb-school-sid";
import { POWER4_SOURCES } from "../adapters/cfb-school-sources";

describe("CFB school SID adapter", () => {
  it("classifies eligibility rulings — the Sorsby case", () => {
    expect(classifyEventType("Brendan Sorsby granted eligibility by NCAA")).toBe("eligibility_ruling");
    expect(classifyEventType("QB cleared to play after transfer waiver approval")).toBe("eligibility_ruling");
    expect(classifyEventType("NCAA approves immediate eligibility for transfer WR")).toBe("eligibility_ruling");
    expect(classifyEventType("Linebacker reinstated following review")).toBe("eligibility_ruling");
  });

  it("classifies coaching changes and roster transactions", () => {
    expect(classifyEventType("Smith named head coach of the Red Raiders")).toBe("coaching_change");
    expect(classifyEventType("Offensive coordinator parts ways with program")).toBe("coaching_change");
    expect(classifyEventType("Starting RB enters the transfer portal")).toBe("transaction");
    expect(classifyEventType("Defensive back suspended for two games")).toBe("transaction");
  });

  it("ignores non-actionable athletics headlines", () => {
    expect(classifyEventType("Red Raiders host annual youth football camp")).toBeNull();
    expect(classifyEventType("Football single-game tickets on sale Monday")).toBeNull();
  });

  it("extracts headlines from RSS feeds", () => {
    const xml = `
      <rss><channel>
        <item>
          <title><![CDATA[Brendan Sorsby granted eligibility by NCAA]]></title>
          <link>https://texastech.com/news/sorsby-eligible</link>
          <pubDate>Wed, 10 Jun 2026 14:00:00 GMT</pubDate>
        </item>
        <item>
          <title>Volleyball adds two transfers</title>
          <link>https://texastech.com/news/volleyball</link>
          <pubDate>Wed, 10 Jun 2026 12:00:00 GMT</pubDate>
        </item>
      </channel></rss>`;

    const items = extractHeadlines(xml, "https://texastech.com/sports/football");
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Brendan Sorsby granted eligibility by NCAA");
    expect(items[0].url).toBe("https://texastech.com/news/sorsby-eligible");
    expect(items[0].date).toBe("2026-06-10");
  });

  it("extracts player names from SID headline grammar", () => {
    expect(extractPlayerName("Brendan Sorsby granted eligibility by NCAA")).toBe("Brendan Sorsby");
    expect(extractPlayerName("NCAA grants Jalen Carter eligibility for 2026 season")).toBe("Jalen Carter");
    expect(extractPlayerName("Transfer waiver approved for Marcus Webb.")).toBe("Marcus Webb");
  });

  it("manifest covers every Power 4 conference with both source channels", () => {
    expect(POWER4_SOURCES.length).toBeGreaterThanOrEqual(34);
    for (const school of POWER4_SOURCES) {
      expect(school.sidTwitter).toMatch(/^@/);
      expect(school.pressReleaseFeed).toMatch(/^https:\/\//);
    }
    const conferences = new Set(POWER4_SOURCES.map(s => s.conference));
    expect(conferences).toEqual(new Set(["Big12", "SEC", "BigTen", "ACC"]));
  });
});
