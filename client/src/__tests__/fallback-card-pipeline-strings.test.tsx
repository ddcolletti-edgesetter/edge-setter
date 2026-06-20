import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { toQuietLeagueLeadStory, toSituationStoryCardData } from "@/components/board/boardAdapters";
import { SituationStoryCard } from "@/components/board/SituationStoryCard";

// Raw pipeline strings that must never reach the UI — North Star section 4.5
const SUPPRESSED_PIPELINE_STRINGS = [
  "monitoring",
  "consensus-forming",
  "market-reacting",
  "confirming",
  "watching",
  "cooling",
  "resolved",
  "archived",
  "invalidated",
  "stale signal",
  "no remaining edge",
  "source pressure",
  "context moving",
];

function allStringFields(obj: object): string[] {
  return Object.values(obj).flatMap((value) => {
    if (typeof value === "string") return [value.toLowerCase()];
    if (Array.isArray(value)) return value.filter((item) => typeof item === "string").map((item) => item.toLowerCase());
    if (value && typeof value === "object") return allStringFields(value);
    return [];
  });
}

describe("fallback card pipeline string suppression", () => {
  const leagues = ["NBA", "MLB"] as const;

  for (const league of leagues) {
    describe(`${league} quiet league lead story`, () => {
      it("adapter output contains no raw pipeline state strings", () => {
        const card = toQuietLeagueLeadStory(league);
        const story = toSituationStoryCardData(card.row);
        const fields = allStringFields(story);

        for (const suppressed of SUPPRESSED_PIPELINE_STRINGS) {
          const leak = fields.find(
            (field) =>
              field === suppressed ||
              field.startsWith(`${suppressed} `) ||
              field.endsWith(` ${suppressed}`),
          );
          expect(
            leak,
            `Raw pipeline string "${suppressed}" found in ${league} fallback card adapter output`,
          ).toBeUndefined();
        }
      });

      it("renders no raw pipeline state strings in the DOM", () => {
        const card = toQuietLeagueLeadStory(league);
        const story = toSituationStoryCardData(card.row);

        render(<SituationStoryCard story={story} />);

        const bodyText = document.body.innerText?.toLowerCase() ?? "";
        const bodyHTML = document.body.innerHTML.toLowerCase();

        for (const suppressed of SUPPRESSED_PIPELINE_STRINGS) {
          expect(
            bodyText.includes(suppressed) || bodyHTML.includes(`>${suppressed}<`),
            `Raw pipeline string "${suppressed}" found in ${league} rendered DOM output`,
          ).toBe(false);
        }
      });
    });
  }
});