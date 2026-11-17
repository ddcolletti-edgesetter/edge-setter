/**
 * Team crest fallback, and the alias tokens that were borrowing another
 * league's colors.
 *
 * Abbreviations collide across leagues (MIA, CIN, HOU, ATL, KC, SF, NO, WAS),
 * so teamColorsFor's old cross-league fallback was not a lucky recovery — it
 * attributed one club's brand colors to another. Five tokens did this in
 * production and five more resolved to nothing at all. Each one gets a test
 * that pins the right colors AND asserts it is no longer the wrong team's.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TeamLogoImg, getTeamLogoUrl } from "@/components/v2/SportVisuals";
import {
  CFB_TEAM_COLORS,
  MLB_TEAM_COLORS,
  NBA_TEAM_COLORS,
  NFL_TEAM_COLORS,
  teamColorsFor,
} from "@/lib/teamColors";

const crest = () => document.querySelector('[data-testid="team-crest"]');
const crestPath = () => crest()?.querySelector("path");

/** jsdom reports naturalWidth 0 for everything; this stubs a real decode. */
const loadWith = (img: HTMLImageElement, px: number) => {
  Object.defineProperty(img, "naturalWidth", { value: px, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: px, configurable: true });
  fireEvent.load(img);
};

describe("alias tokens resolve inside their own league", () => {
  const NBA_ALIAS_CASES: Array<[string, string]> = [
    ["BRK", "BKN"],
    ["GS", "GSW"],
    ["NO", "NOP"],
    ["NY", "NYK"],
    ["PHO", "PHX"],
    ["SA", "SAS"],
    ["WSH", "WAS"],
  ];

  it.each(NBA_ALIAS_CASES)("NBA %s resolves to %s's colors", (alias, canonical) => {
    expect(teamColorsFor(alias, "nba")).toEqual(NBA_TEAM_COLORS[canonical]);
  });

  const MLB_ALIAS_CASES: Array<[string, string]> = [
    ["ATH", "OAK"],
    ["SF", "SFG"],
    ["WAS", "WSH"],
  ];

  it.each(MLB_ALIAS_CASES)("MLB %s resolves to %s's colors", (alias, canonical) => {
    expect(teamColorsFor(alias, "mlb")).toEqual(MLB_TEAM_COLORS[canonical]);
  });

  it("no longer borrows the wrong league's colors for the five that did", () => {
    // Each of these was the observed production value before the fix.
    expect(teamColorsFor("GS", "nba")).not.toEqual(CFB_TEAM_COLORS.GASO);   // Georgia Southern
    expect(teamColorsFor("NO", "nba")).not.toEqual(NFL_TEAM_COLORS.NO);     // Saints
    expect(teamColorsFor("WSH", "nba")).not.toEqual(MLB_TEAM_COLORS.WSH);   // Nationals
    expect(teamColorsFor("SF", "mlb")).not.toEqual(NFL_TEAM_COLORS.SF);     // 49ers
    expect(teamColorsFor("WAS", "mlb")).not.toEqual(NBA_TEAM_COLORS.WAS);   // Wizards
  });

  it("returns null rather than crossing leagues for a token its league lacks", () => {
    // CFB has a Buffalo (the Bulls) but no BUF color entry; it must not come
    // back as the Bills. Null sends the crest to the deterministic palette,
    // which is anonymous but never misattributes a brand.
    expect(teamColorsFor("BUF", "cfb")).toBeNull();
    expect(teamColorsFor("BUF", "nfl")).toEqual(NFL_TEAM_COLORS.BUF);
  });

  it("keeps the merged no-sport chain working for callers that cannot name a league", () => {
    // toTeamAbbr probes this path to recognise long abbreviations.
    expect(teamColorsFor("TULSA")).not.toBeNull();
    expect(teamColorsFor("UCONN")).not.toBeNull();
    expect(teamColorsFor("")).toBeNull();
  });
});

describe("CFB manifest spellings reach both a logo and colors", () => {
  const CFB_CASES: Array<[string, string]> = [
    ["ARKST", "ARST"],
    ["BGS", "BGSU"],
    ["CHAR", "CLT"],
    ["MARS", "MRSH"],
    ["TEMP", "TEM"],
    ["TULSA", "TLSA"],
    ["UCONN", "CONN"],
  ];

  it.each(CFB_CASES)("%s resolves the same logo as ESPN's %s", (manifest, espn) => {
    const espnUrl = getTeamLogoUrl(espn, "cfb");
    expect(espnUrl).not.toBe("");
    expect(getTeamLogoUrl(manifest, "cfb")).toBe(espnUrl);
  });

  it.each(CFB_CASES)("%s and %s agree on colors", (manifest, espn) => {
    const colors = teamColorsFor(manifest, "cfb");
    expect(colors).not.toBeNull();
    expect(teamColorsFor(espn, "cfb")).toEqual(colors);
  });
});

describe("TeamLogoImg crest fallback", () => {
  it("draws a shield in the team's primary with a secondary border", () => {
    render(<TeamLogoImg abbr="GS" sport="nba" size={40} />);
    fireEvent.error(screen.getByRole("img"));

    const path = crestPath();
    expect(path).toBeTruthy();
    expect(path?.getAttribute("fill")).toBe(NBA_TEAM_COLORS.GSW.primary);
    expect(path?.getAttribute("stroke")).toBe(NBA_TEAM_COLORS.GSW.secondary);
    expect(crest()).toHaveTextContent("GS");
    expect(crest()?.getAttribute("aria-label")).toBe("GS crest");
  });

  it("uses the condensed bold face for the abbreviation", () => {
    render(<TeamLogoImg abbr="SF" sport="mlb" size={40} />);
    fireEvent.error(screen.getByRole("img"));

    const text = crest()?.querySelector("text");
    expect(text?.getAttribute("font-family")).toContain("Barlow Condensed");
    expect(text?.getAttribute("font-weight")).toBe("800");
    expect(crestPath()?.getAttribute("fill")).toBe(MLB_TEAM_COLORS.SFG.primary);
  });

  it("falls back on a blank image that loads without erroring", () => {
    render(<TeamLogoImg abbr="GS" sport="nba" size={40} />);
    const img = screen.getByRole("img");
    expect(crest()).toBeNull();

    loadWith(img as HTMLImageElement, 1);
    expect(crestPath()?.getAttribute("fill")).toBe(NBA_TEAM_COLORS.GSW.primary);
  });

  it("keeps a real decoded logo and draws no crest", () => {
    render(<TeamLogoImg abbr="GS" sport="nba" size={40} />);
    loadWith(screen.getByRole("img") as HTMLImageElement, 500);

    expect(crest()).toBeNull();
    expect(screen.getByRole("img").tagName).toBe("IMG");
  });

  it("renders the crest straight away when no logo resolves", () => {
    render(<TeamLogoImg abbr="ZZZ" sport="nba" size={40} />);
    expect(crestPath()).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });

  it("still shows the neutral placeholder for a non-team token", () => {
    render(<TeamLogoImg abbr="TBD" sport="nfl" size={40} />);
    expect(crest()).toBeNull();
    expect(screen.getByLabelText("Team pending")).toBeInTheDocument();
  });
});

/**
 * The lettering cannot outgrow the shield when the condensed face is missing.
 *
 * fontSize is picked from the label's length assuming a CONDENSED face. Barlow
 * Condensed is a network font, so before it arrives — or on a device with
 * neither it nor 'Arial Narrow' — the stack lands on Arial, which is far wider,
 * and the svg sets overflow:visible so a four-letter abbreviation spills past
 * the shield rather than clipping.
 */
describe("crest lettering is width-pinned", () => {
  const textFor = (abbr: string) => {
    render(<TeamLogoImg abbr={abbr} sport="cfb" size={40} />);
    fireEvent.error(screen.getAllByRole("img")[0] as HTMLImageElement);
    return crest()?.querySelector("text");
  };

  it("pins a four-letter abbreviation inside the shield's inner span", () => {
    const text = textFor("GASO");
    expect(text).toHaveTextContent("GASO");
    expect(Number(text?.getAttribute("textLength"))).toBe(66);
    expect(text?.getAttribute("lengthAdjust")).toBe("spacingAndGlyphs");
  });

  it.each([
    ["A", 24],
    ["KC", 46],
    ["WSH", 58],
    ["GASO", 66],
  ])("scales the pinned width with the label, so %s is not stretched", (abbr, span) => {
    expect(Number(textFor(abbr)?.getAttribute("textLength"))).toBe(span);
  });

  it("never pins wider than the shield's inner flanks", () => {
    // Shield spans x=9..91 with a 6-unit stroke; anything past this overflows.
    const INNER_SPAN = 91 - 9 - 6;
    for (const abbr of ["A", "KC", "WSH", "GASO"]) {
      expect(Number(textFor(abbr)?.getAttribute("textLength"))).toBeLessThanOrEqual(INNER_SPAN);
    }
  });
});
