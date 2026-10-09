/**
 * CFB team logo coverage guard.
 *
 * The hand-typed CFB_LOGO_URLS held ten ids keyed in a vocabulary no server
 * path emits ("BAMA", "TX", "OHIO"), so 41 of the 48 CFB codes the odds adapter
 * produces fell through to the abbreviation badge, and "OHIO" — which the
 * school manifest uses for Ohio University — resolved to Ohio State's logo.
 *
 * These tests pin the three things that regressed silently before:
 *   1. coverage: every school we poll resolves, or is a declared gap
 *   2. identity: an abbreviation points at the school the server means by it
 *   3. fallback: no logo means the text badge, never an invisible <img>
 */

import { describe, expect, it } from "vitest";

import { ALL_CFB_SOURCES } from "../../../server/pipeline/adapters/cfb-school-sources";
import {
  CFB_ABBR_ALIASES,
  CFB_MASCOT_SLICE_TOKEN_SET,
  CFB_TEAM_ABBRS,
  cfbSchoolsForMascotSlice,
  cfbTeamName,
} from "../lib/cfbTeamLogos";
import {
  CFB_LOGO_GAPS,
  CFB_MASCOT_SLICE_TOKENS,
  CFB_TEAM_LOGO_IDS,
  CFB_TEAM_NAMES,
} from "../lib/cfbTeamLogos.generated";
import { getTeamLogoUrl } from "../components/v2/SportVisuals";
import { isValidTeamToken } from "../lib/publicDisplayHygiene";

/** The 41 odds-adapter CFB codes that rendered a text badge before this change. */
const PREVIOUSLY_FELL_BACK = [
  "ALA", "OSU", "TEX", "ORE", "PSU", "OU", "TAMU", "TENN", "UTAH", "IOWA",
  "WIS", "TCU", "ARK", "AUB", "MIZ", "MSU", "OKST", "WASH", "MISS", "MSST",
  "KSU", "ISU", "BAY", "COLO", "UNC", "LOU", "VT", "WVU", "PITT", "NCST",
  "DUKE", "UCLA", "STAN", "CAL", "ARIZ", "ASU", "USU", "BSU", "AFA", "ARMY",
  "NAVY",
] as const;

/** The 7 that already resolved. Together with the 41 these are all 48 CFB codes. */
const ALREADY_RESOLVED = ["UGA", "MICH", "ND", "FSU", "LSU", "CLEM", "USC"] as const;

/**
 * Manifest school names that differ in form from ESPN's displayName but are the
 * same school. Each is a spelling difference, not an identity question.
 */
const KNOWN_NAME_VARIANTS: Record<string, string> = {
  SJSU: "San José State Spartans",   // manifest drops the accent
  ULM: "UL Monroe Warhawks",         // manifest says "Louisiana Monroe"
  FIU: "Florida International Panthers", // manifest uses the abbreviation as the name
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

describe("CFB logo map — coverage", () => {
  it("resolves every school in the source manifest, or declares it a gap", () => {
    const unexplained = ALL_CFB_SOURCES
      .filter(({ abbreviation }) => CFB_TEAM_LOGO_IDS[abbreviation] === undefined)
      .filter(({ abbreviation }) => !CFB_LOGO_GAPS.some((gap) => gap.abbr === abbreviation))
      .map(({ school, abbreviation }) => `${abbreviation} (${school})`);

    expect(unexplained).toEqual([]);
  });

  it("declares exactly the one school ESPN has no FBS football team for", () => {
    // Wichita State has not fielded a football team since 1986, so ESPN's
    // college-football data has no record of it at all. A gap here is correct;
    // a guessed logo would not be.
    expect(CFB_LOGO_GAPS.map((gap) => gap.abbr)).toEqual(["WST"]);
  });

  it("covers the whole manifest apart from that gap", () => {
    const resolved = ALL_CFB_SOURCES.filter(
      ({ abbreviation }) => CFB_TEAM_LOGO_IDS[abbreviation] !== undefined,
    );
    expect(resolved).toHaveLength(ALL_CFB_SOURCES.length - CFB_LOGO_GAPS.length);
    expect(ALL_CFB_SOURCES).toHaveLength(130);
  });

  it("resolves all 41 odds codes that previously fell back to a text badge", () => {
    const stillFallingBack = PREVIOUSLY_FELL_BACK.filter(
      (code) => getTeamLogoUrl(code, "cfb") === "",
    );
    expect(stillFallingBack).toEqual([]);
  });

  it("keeps the 7 odds codes that already resolved", () => {
    for (const code of ALREADY_RESOLVED) {
      expect(getTeamLogoUrl(code, "cfb")).toMatch(/\/ncaa\/500\/\d+\.png$/);
    }
  });

  it("keeps the 247Sports/On3 full-name aliases working", () => {
    // These adapters write "Alabama" and "Texas"; toTeamAbbr folds them to
    // BAMA and TX, which are not ESPN's vocabulary but are still live.
    expect(getTeamLogoUrl("Alabama", "cfb")).toBe(getTeamLogoUrl("ALA", "cfb"));
    expect(getTeamLogoUrl("Texas", "cfb")).toBe(getTeamLogoUrl("TEX", "cfb"));
    for (const alias of Object.keys(CFB_ABBR_ALIASES)) {
      expect(getTeamLogoUrl(alias, "cfb")).not.toBe("");
    }
  });

  it("resolves ESPN's own spelling, which the ESPN adapters emit directly", () => {
    // espn-cfb.ts and espn-cfb-transactions.ts write team.abbreviation straight
    // through, and ESPN spells these differently from the school manifest.
    const espnSpellings: Record<string, string> = {
      "M-OH": "MIOH", "TA&M": "TAMU", IU: "IND", NU: "NW", RUTG: "RUT",
      NCSU: "NCST", BOIS: "BSU", TULN: "TUL", UL: "ULL", USA: "SOAL",
      JXST: "JSU", LT: "LATECH", NMSU: "NMST", AF: "AFA", BUF: "BUFF",
    };
    for (const [espnAbbr, manifestAbbr] of Object.entries(espnSpellings)) {
      expect(getTeamLogoUrl(espnAbbr, "cfb"), `ESPN ${espnAbbr}`).not.toBe("");
      expect(cfbTeamName(espnAbbr), `${espnAbbr} vs ${manifestAbbr}`).toBe(cfbTeamName(manifestAbbr));
    }
  });

  it("resolves the FBS schools neither input list mentions", () => {
    // Not in the school manifest and not in the odds adapter's CFB codes, but
    // they play FBS football and ESPN has their logo.
    const expected: Record<string, string> = {
      WSU: "Washington State Cougars",
      ORST: "Oregon State Beavers",
      MASS: "Massachusetts Minutemen",
      DEL: "Delaware Blue Hens",
      MOST: "Missouri State Bears",
      CONN: "UConn Huskies",
    };
    for (const [abbr, school] of Object.entries(expected)) {
      expect(cfbTeamName(abbr)).toBe(school);
      expect(getTeamLogoUrl(abbr, "cfb")).not.toBe("");
    }
  });

  it("builds every logo URL from ESPN's numeric id", () => {
    for (const code of [...PREVIOUSLY_FELL_BACK, ...ALREADY_RESOLVED]) {
      expect(getTeamLogoUrl(code, "cfb")).toMatch(
        /^https:\/\/a\.espncdn\.com\/i\/teamlogos\/ncaa\/500\/\d+\.png$/,
      );
    }
  });
});

describe("CFB logo map — team identity", () => {
  it("never points one abbreviation at two schools", () => {
    for (const [abbr, name] of Object.entries(CFB_TEAM_NAMES)) {
      expect(typeof name).toBe("string");
      expect(name.length).toBeGreaterThan(0);
      expect(CFB_TEAM_LOGO_IDS[abbr]).toBeTypeOf("number");
    }
  });

  it("only lets abbreviations share an id when they are spellings of one school", () => {
    // Several abbreviations legitimately point at the same school, because the
    // manifest, the odds adapter and ESPN each spell it differently (MIOH and
    // M-OH, TAMU and TA&M, COL and COLO). That is fine. What must never happen
    // is one abbreviation standing for two different schools — the OHIO bug.
    const byId = new Map<number, string[]>();
    for (const [abbr, id] of Object.entries(CFB_TEAM_LOGO_IDS)) {
      byId.set(id, [...(byId.get(id) ?? []), abbr]);
    }

    for (const [id, abbrs] of byId) {
      const schools = new Set(abbrs.map((abbr) => CFB_TEAM_NAMES[abbr]));
      expect(schools.size, `id ${id} is shared by ${abbrs.join("/")}`).toBe(1);
    }

    // And no school is reachable under an abbreviation that means another school.
    const abbrsPerSchool = new Map<string, Set<number>>();
    for (const [abbr, id] of Object.entries(CFB_TEAM_LOGO_IDS)) {
      const name = CFB_TEAM_NAMES[abbr];
      abbrsPerSchool.set(name, (abbrsPerSchool.get(name) ?? new Set()).add(id));
    }
    for (const [school, idsForSchool] of abbrsPerSchool) {
      expect(idsForSchool.size, `${school} resolved to ${[...idsForSchool].join("/")}`).toBe(1);
    }
  });

  it("resolves the collision-prone abbreviations to the right school", () => {
    // Each pair below is two different schools whose abbreviations look alike
    // or whose names overlap. OHIO/OSU is the one that was actually wrong: the
    // manifest means Ohio University by "OHIO", but the old map sent it to
    // Ohio State's logo.
    const expected: Record<string, string> = {
      USC: "USC Trojans",
      SC: "South Carolina Gamecocks",
      WASH: "Washington Huskies",
      WSU: "Washington State Cougars",
      MIA: "Miami Hurricanes",
      MIOH: "Miami (OH) RedHawks",
      "M-OH": "Miami (OH) RedHawks",
      OSU: "Ohio State Buckeyes",
      OHIO: "Ohio Bobcats",
      ORST: "Oregon State Beavers",
      ORE: "Oregon Ducks",
      TEX: "Texas Longhorns",
      TAMU: "Texas A&M Aggies",
      "TA&M": "Texas A&M Aggies",
      TTU: "Texas Tech Red Raiders",
      ALA: "Alabama Crimson Tide",
      STAN: "Stanford Cardinal",
      UAB: "UAB Blazers",
      MEM: "Memphis Tigers",
    };

    for (const [abbr, school] of Object.entries(expected)) {
      expect(cfbTeamName(abbr), `${abbr} should be ${school}`).toBe(school);
    }
  });

  it("gives Ohio State and Ohio different logos", () => {
    expect(getTeamLogoUrl("OSU", "cfb")).not.toBe(getTeamLogoUrl("OHIO", "cfb"));
    expect(CFB_TEAM_LOGO_IDS.OSU).toBe(194);
    expect(CFB_TEAM_LOGO_IDS.OHIO).toBe(195);
  });

  it("resolves each alias to the same school as its canonical abbreviation", () => {
    for (const [alias, canonical] of Object.entries(CFB_ABBR_ALIASES)) {
      expect(cfbTeamName(alias)).toBe(cfbTeamName(canonical));
    }
  });

  it("agrees with the source manifest about which school each abbreviation is", () => {
    const disagreements = ALL_CFB_SOURCES
      .filter(({ abbreviation }) => CFB_TEAM_NAMES[abbreviation] !== undefined)
      .filter(({ school, abbreviation }) => {
        const espnName = CFB_TEAM_NAMES[abbreviation];
        if (KNOWN_NAME_VARIANTS[abbreviation] === espnName) return false;
        return !normalize(espnName).startsWith(normalize(school));
      })
      .map(({ school, abbreviation }) => `${abbreviation}: manifest "${school}" vs ESPN "${CFB_TEAM_NAMES[abbreviation]}"`);

    expect(disagreements).toEqual([]);
  });
});

describe("logo fallback — a missing team shows the text badge, not a blank image", () => {
  // getTeamLogoUrl used to delegate to a token->slug resolver whose "no match"
  // sentinel was a transparent SVG data URI, compared against a different
  // constant. The comparison could never match, so the sentinel was returned as
  // a real src: an <img> that renders invisibly and never fires onError. Ten
  // teams were affected, and the per-league maps were unreachable.
  it("returns a real ESPN logo for the MLB teams that used to render blank", () => {
    // ATH is the relocated Athletics; LAD is the Dodgers. Neither is an alias
    // of anything — both were simply missing keys in the deleted resolver,
    // which carried OAK and LA instead of the codes the odds adapter emits.
    expect(getTeamLogoUrl("ATH", "mlb")).toBe("https://a.espncdn.com/i/teamlogos/mlb/500/ath.png");
    expect(getTeamLogoUrl("LAD", "mlb")).toBe("https://a.espncdn.com/i/teamlogos/mlb/500/lad.png");
  });

  it("returns a real ESPN logo for the NBA and NFL teams that used to render blank", () => {
    for (const abbr of ["NYK", "GSW", "LAL", "NOP", "SAS", "WAS"]) {
      expect(getTeamLogoUrl(abbr, "nba"), `NBA ${abbr}`).not.toBe("");
    }
    for (const abbr of ["LAR", "JAX"]) {
      expect(getTeamLogoUrl(abbr, "nfl"), `NFL ${abbr}`).not.toBe("");
    }
  });

  it("uses ESPN's real filename where it differs from the team code", () => {
    // The deleted resolver built its URL from the code itself, lowercased.
    // nba/500/uta.png does not exist (checked: 404) — the Jazz are utah.png, so
    // UTA rendered a broken image. mlb/500/cws.png does happen to exist and is
    // a real White Sox mark, but chw.png is ESPN's current primary, so the
    // curated map is still the one to trust.
    expect(getTeamLogoUrl("UTA", "nba")).toContain("/utah.png");
    expect(getTeamLogoUrl("CWS", "mlb")).toContain("/chw.png");
  });

  it("returns an empty string for an unknown team so the badge renders", () => {
    for (const [abbr, sport] of [
      ["ZZZ", "mlb"], ["ZZZ", "nba"], ["ZZZ", "nfl"], ["ZZZ", "cfb"],
    ] as const) {
      expect(getTeamLogoUrl(abbr, sport), `${sport} ${abbr}`).toBe("");
    }
  });

  it("never returns a data URI", () => {
    const sports = ["mlb", "nba", "nfl", "cfb"] as const;
    const probes = ["ZZZ", "ATH", "LAD", "NYK", "LAR", "ALA", "OHIO", "UNK", ""];
    for (const sport of sports) {
      for (const probe of probes) {
        expect(getTeamLogoUrl(probe, sport)).not.toMatch(/^data:/);
      }
    }
  });

  it("lets the pro leagues win a shared token when no sport is given", () => {
    // Adding full FBS coverage introduced more college tokens that also name a
    // pro team. TEAM_LOGO_URLS spreads CFB first so it loses those ties.
    for (const abbr of ["BUF", "CIN", "COL", "HOU", "IND", "MEM", "MIA", "TEX"]) {
      const flat = getTeamLogoUrl(abbr);
      expect(flat, `${abbr} with no sport`).not.toContain("/ncaa/");
      expect(flat, `${abbr} with no sport`).not.toBe("");
    }
    // A college-only token still resolves on the flat path.
    expect(getTeamLogoUrl("ALA")).toContain("/ncaa/");
  });

  it("keeps colliding tokens apart per sport", () => {
    // This is what the deleted resolver existed to guarantee (SF Giants vs SF
    // 49ers). Branching on sport already does it, so the guard lives here now.
    expect(getTeamLogoUrl("SF", "mlb")).toContain("/mlb/");
    expect(getTeamLogoUrl("SF", "nfl")).toContain("/nfl/");
    expect(getTeamLogoUrl("SF", "mlb")).not.toBe(getTeamLogoUrl("SF", "nfl"));
    expect(getTeamLogoUrl("MIA", "mlb")).not.toBe(getTeamLogoUrl("MIA", "nfl"));
    expect(getTeamLogoUrl("MIA", "cfb")).toContain("/ncaa/");
  });
});

describe("isValidTeamToken — CFB short abbreviations", () => {
  it("accepts the real two-letter programmes it used to suppress", () => {
    // Before, the CFB set was literally ["ND", "TX"], so these nine real
    // schools were treated as pipeline artifacts and hidden from public surfaces.
    for (const abbr of ["BC", "GT", "KU", "MD", "NW", "OU", "SC", "UK", "VT"]) {
      expect(isValidTeamToken(abbr, "cfb"), `${abbr} is a real CFB programme`).toBe(true);
    }
  });

  it("still accepts the two it already allowed", () => {
    expect(isValidTeamToken("ND", "cfb")).toBe(true);
    expect(isValidTeamToken("TX", "cfb")).toBe(true);
  });

  it("still rejects tokens that are not CFB abbreviations", () => {
    expect(isValidTeamToken("NO", "cfb")).toBe(false);  // NFL Saints leaking in
    expect(isValidTeamToken("AU", "cfb")).toBe(false);  // Auburn is AUB
    expect(isValidTeamToken("N", "cfb")).toBe(false);
    expect(isValidTeamToken("ZZ", "cfb")).toBe(false);
  });

  it("derives the CFB set from the generated map rather than a literal", () => {
    expect(CFB_TEAM_ABBRS.has("ALA")).toBe(true);
    expect(CFB_TEAM_ABBRS.has("OHIO")).toBe(true);
    expect(CFB_TEAM_ABBRS.size).toBeGreaterThan(130);
  });
});

/* ─── Mascot-slice tokens out of the games table ────────────────────────
 *
 * games.home_team for CFB is shortCode(<The Odds API team name>), which for a
 * school NAME_TO_CODE does not cover is the first three letters of the MASCOT
 * word. That token names a mascot, not a school, so a logo resolved from it can
 * belong to the wrong school entirely.
 */
describe("mascot-slice tokens never pick a logo for a games-sourced badge", () => {
  it("is the set the generator measured, not a hand-written list", () => {
    expect(CFB_MASCOT_SLICE_TOKENS.length).toBe(62);
    expect(CFB_MASCOT_SLICE_TOKEN_SET.size).toBe(62);
    // Every entry names the schools behind it, so the diff shows the damage.
    for (const entry of CFB_MASCOT_SLICE_TOKENS) {
      expect(entry.teams.length).toBeGreaterThan(0);
      expect(entry.token).toMatch(/^[A-Z0-9]{1,3}$/);
    }
  });

  it("FLA is the one slice that collides with a real logo key", () => {
    // Kent State's Golden Flashes and Liberty's Flames are both stored "FLA",
    // which is ESPN's abbreviation for Florida — so before this guard a Kent
    // State game rendered the Gators' logo.
    const collide = CFB_MASCOT_SLICE_TOKENS
      .filter((entry) => CFB_TEAM_LOGO_IDS[entry.token] !== undefined)
      .map((entry) => `${entry.token} -> ${cfbTeamName(entry.token)}, stored for ${entry.teams.join(" / ")}`);

    expect(collide).toEqual([
      "FLA -> Florida Gators, stored for Kent State Golden Flashes / Liberty Flames",
    ]);
    expect(cfbSchoolsForMascotSlice("FLA")).toEqual([
      "Kent State Golden Flashes",
      "Liberty Flames",
    ]);
  });

  it("a games-sourced slice gets the text badge, not a logo", () => {
    expect(getTeamLogoUrl("FLA", "cfb", { fromGamesTable: true })).toBe("");
    for (const entry of CFB_MASCOT_SLICE_TOKENS) {
      expect(getTeamLogoUrl(entry.token, "cfb", { fromGamesTable: true }), entry.token).toBe("");
    }
  });

  it("keeps Florida's logo on the injury path, where FLA really is Florida", () => {
    // CFB_DISPLAY_TO_ABBR maps Florida to FLA, Kent State to KENT and Liberty
    // to LIB, so a non-games FLA is unambiguous. Suppressing it everywhere
    // would cost Florida its logo to fix Kent State's.
    expect(getTeamLogoUrl("FLA", "cfb")).not.toBe("");
    expect(cfbTeamName("FLA")).toBe("Florida Gators");
  });

  it("does not suppress a slice that is the school's own abbreviation", () => {
    // "Illinois Fighting Illini" slices to ILL, which IS ESPN's ILL, so the
    // token identifies the school and the logo is right either way.
    expect(CFB_MASCOT_SLICE_TOKEN_SET.has("ILL")).toBe(false);
    expect(getTeamLogoUrl("ILL", "cfb", { fromGamesTable: true })).not.toBe("");
    expect(cfbTeamName("ILL")).toBe("Illinois Fighting Illini");
  });

  it("leaves every other league alone", () => {
    // MIN is a slice (UMass Minutemen, UTEP Miners) and an NFL/MLB/NBA token.
    // The guard is CFB-only and opt-in, so the pro maps are untouched.
    expect(CFB_MASCOT_SLICE_TOKEN_SET.has("MIN")).toBe(true);
    expect(getTeamLogoUrl("MIN", "nfl", { fromGamesTable: true })).not.toBe("");
    expect(getTeamLogoUrl("MIN", "mlb", { fromGamesTable: true })).not.toBe("");
  });

  it("names the slices still reachable when the caller omits sport", () => {
    // The guard needs sport === "cfb": `fromGamesTable` alone cannot justify
    // suppressing MIN, because an NFL games row legitimately stores MIN. So
    // with no sport these five slices still resolve a logo —
    //   CAR -> NFL Panthers      (stored for Ball State Cardinals)
    //   CHA -> NBA Hornets       (stored for Coastal Carolina Chanticleers)
    //   CHI -> NFL Bears         (stored for Central Michigan Chippewas)
    //   MIN -> NFL Vikings       (stored for UMass Minutemen, UTEP Miners)
    //   FLA -> Florida Gators    (stored for Kent State, Liberty)
    // TEAM_LOGO_URLS spreads CFB first, so the pro maps win every shared token.
    // Not reachable from any current call site — all 13 pass `sport` — but it is
    // one missing prop away, so the set is pinned rather than left implicit.
    const sportless = [...CFB_MASCOT_SLICE_TOKEN_SET]
      .filter((token) => getTeamLogoUrl(token, undefined, { fromGamesTable: true }) !== "")
      .sort();

    expect(sportless).toEqual(["CAR", "CHA", "CHI", "FLA", "MIN"]);
  });
});
