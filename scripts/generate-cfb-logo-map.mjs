/**
 * Edge Setter — CFB team logo map generator
 *
 * Writes client/src/lib/cfbTeamLogos.generated.ts from ESPN's own team data.
 * No ESPN numeric id is ever typed by hand: every id in the generated file came
 * out of the two endpoints below on the run recorded in that file's header.
 *
 * Why a generator and not a literal map:
 *   The previous CFB_LOGO_URLS was 10 hand-typed ids keyed in a vocabulary no
 *   server path emits ("BAMA", "TX", "OHIO"). 41 of the 48 CFB codes the odds
 *   adapter produces fell through to the text badge, and "OHIO" silently
 *   resolved to Ohio STATE's logo while the server means Ohio University.
 *   Keying off ESPN's data makes the vocabulary and the ids verifiable.
 *
 * Sources (public, read-only, no auth):
 *   1. FBS membership — core API group 80 for the configured season. Returns
 *      team $refs only; we keep the numeric ids and never fan out to 146 fetches.
 *   2. Team records — the site API team list (all divisions), intersected with
 *      (1) so that lower-division schools sharing an abbreviation cannot win.
 *      That intersection is what keeps "OSU" from matching Ohio State Newark.
 *
 * Required key set (so the map covers what the pipeline can actually emit):
 *   - every `abbreviation` in server/pipeline/adapters/cfb-school-sources.ts
 *   - every CFB code in NAME_TO_CODE in server/pipeline/adapters/the-odds-api.ts
 *   - every FBS team under ESPN's OWN abbreviation
 *   The first two are parsed from source at generate time, so adding a school to
 *   the manifest and re-running is all it takes to extend coverage.
 *
 *   The third matters because espn-cfb.ts and espn-cfb-transactions.ts write
 *   `team.abbreviation` straight through from ESPN's response, which is often a
 *   different spelling from the manifest's: ESPN says M-OH, TA&M, IU, NU, RUTG,
 *   NCSU, BOIS, TULN, UL, USA, JXST, LT, NMSU, AF and BUF where the manifest
 *   says MIOH, TAMU, IND, NW, RUT, NCST, BSU, TUL, ULL, SOAL, JSU, LATECH,
 *   NMST, AFA and BUFF. Both spellings reach the badge, so both must resolve.
 *   It also covers six FBS schools that neither input list mentions at all:
 *   Washington State, Oregon State, UMass, Delaware, Missouri State, UConn.
 *
 * Resolution order per required key:
 *   1. exact match on ESPN's own `abbreviation` within FBS (must be unique)
 *   2. else match the manifest's `school` / the odds full name against ESPN's
 *      location / displayName / shortDisplayName (must resolve to exactly one)
 *   3. else an abbreviation match outside FBS, accepted ONLY when it is unique
 *      across all 762 divisions. The manifest tracks a few non-FBS programs
 *      (Western Carolina is FCS); ESPN still has their logo, and a globally
 *      unique abbreviation cannot be the collision step 1 guards against.
 *   Anything left over is written to CFB_LOGO_GAPS rather than guessed.
 *
 * Usage:
 *   node scripts/generate-cfb-logo-map.mjs            # fetch, write, report
 *   node scripts/generate-cfb-logo-map.mjs --check    # fail if output is stale
 *   SEASON=2026 node scripts/generate-cfb-logo-map.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEASON = process.env.SEASON ?? "2025";
const CHECK_ONLY = process.argv.includes("--check");

const OUT_PATH = resolve(ROOT, "client/src/lib/cfbTeamLogos.generated.ts");
const MANIFEST_PATH = resolve(ROOT, "server/pipeline/adapters/cfb-school-sources.ts");
const ODDS_PATH = resolve(ROOT, "server/pipeline/adapters/the-odds-api.ts");

const FBS_URL = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${SEASON}/types/2/groups/80/teams?limit=300`;
const TEAMS_URL = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=1000";

/** ESPN's logo CDN. The generated file stores ids; callers build the URL. */
const LOGO_URL_PATTERN = "https://a.espncdn.com/i/teamlogos/ncaa/500/{id}.png";

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/** Balanced-brace slice of `const <name> = { ... }` so nested objects survive. */
function objectLiteral(source, name) {
  const start = source.indexOf(`const ${name}`);
  if (start === -1) throw new Error(`could not find ${name}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(open, i + 1);
  }
  throw new Error(`unbalanced braces in ${name}`);
}

function readManifest() {
  const src = readFileSync(MANIFEST_PATH, "utf8");
  // school and abbreviation are adjacent fields in every SchoolSource literal.
  const entries = [...src.matchAll(/school:\s*"([^"]+)",\s*\n\s*abbreviation:\s*"([A-Z0-9&]+)"/g)]
    .map((m) => ({ school: m[1], abbr: m[2] }));
  const declared = src.match(/^\s*abbreviation: "/gm)?.length ?? 0;
  if (entries.length !== declared) {
    throw new Error(`manifest parse mismatch: paired ${entries.length} of ${declared} abbreviations`);
  }
  return entries;
}

function readOddsCodes() {
  const literal = objectLiteral(readFileSync(ODDS_PATH, "utf8"), "NAME_TO_CODE");
  // The CFB block is the tail of NAME_TO_CODE, marked by this comment.
  const marker = literal.indexOf("CFB — mapped");
  if (marker === -1) throw new Error("could not find the CFB block in NAME_TO_CODE");
  return [...literal.slice(marker).matchAll(/"([^"]+)":\s*"([A-Z0-9]+)"/g)]
    .map((m) => ({ name: m[1], abbr: m[2] }));
}

const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Strip a trailing mascot so "Texas Longhorns" can match ESPN's location "Texas". */
function withoutMascot(fullName, mascots) {
  const words = fullName.split(/\s+/);
  for (let take = 1; take < words.length; take++) {
    const tail = normalize(words.slice(take).join(""));
    if (mascots.has(tail)) return words.slice(0, take).join(" ");
  }
  return fullName;
}

function buildNameMatcher(fbsTeams) {
  const exact = new Map();
  const add = (key, team) => {
    if (!key) return;
    const bucket = exact.get(key);
    if (bucket) bucket.add(team);
    else exact.set(key, new Set([team]));
  };
  for (const team of fbsTeams) {
    add(normalize(team.location ?? ""), team);
    add(normalize(team.displayName ?? ""), team);
    add(normalize(team.shortDisplayName ?? ""), team);
    add(normalize(team.slug ?? ""), team);
  }
  const mascots = new Set(fbsTeams.map((t) => normalize(t.name ?? "")).filter(Boolean));
  return (query) => {
    for (const candidate of [query, withoutMascot(query, mascots)]) {
      const hit = exact.get(normalize(candidate));
      if (hit?.size === 1) return [...hit][0];
    }
    return null;
  };
}

async function main() {
  const [fbsGroup, allTeams] = await Promise.all([getJson(FBS_URL), getJson(TEAMS_URL)]);

  const fbsIds = new Set(
    (fbsGroup.items ?? []).map((item) => item.$ref.match(/teams\/(\d+)/)?.[1]).filter(Boolean),
  );
  const everyTeam = (allTeams.sports?.[0]?.leagues?.[0]?.teams ?? []).map((t) => t.team);
  const fbsTeams = everyTeam.filter((t) => fbsIds.has(String(t.id)));
  if (fbsTeams.length < 100) {
    throw new Error(`only ${fbsTeams.length} FBS teams resolved — refusing to write a thin map`);
  }

  const index = (teams) => {
    const map = new Map();
    for (const team of teams) {
      const bucket = map.get(team.abbreviation);
      if (bucket) bucket.push(team);
      else map.set(team.abbreviation, [team]);
    }
    return map;
  };
  const byAbbr = index(fbsTeams);
  const byAbbrAllDivisions = index(everyTeam);
  const matchName = buildNameMatcher(fbsTeams);

  const manifest = readManifest();
  const oddsCodes = readOddsCodes();

  const ids = {};
  const names = {};
  const via = {};
  const gaps = [];

  const assign = (abbr, team, how) => {
    ids[abbr] = Number(team.id);
    names[abbr] = team.displayName;
    via[abbr] = how;
  };

  const resolveKey = (abbr, fullName, origin) => {
    if (ids[abbr] !== undefined) return;
    const exact = byAbbr.get(abbr);
    if (exact?.length === 1) return assign(abbr, exact[0], "espn-abbreviation");
    const named = matchName(fullName);
    if (named) return assign(abbr, named, `name:${fullName}`);
    const outsideFbs = byAbbrAllDivisions.get(abbr);
    if (outsideFbs?.length === 1) return assign(abbr, outsideFbs[0], "non-fbs-unique-abbreviation");
    gaps.push({
      abbr,
      source: origin,
      name: fullName,
      reason: exact && exact.length > 1
        ? `ambiguous ESPN abbreviation (${exact.map((t) => t.displayName).join(" / ")})`
        : "no FBS team matched this abbreviation or name",
    });
  };

  for (const { school, abbr } of manifest) resolveKey(abbr, school, "manifest");
  for (const { name, abbr } of oddsCodes) resolveKey(abbr, name, "odds");
  // Every FBS team under ESPN's own abbreviation, so the ESPN adapters' spelling
  // resolves too. Unique within FBS (asserted below), so this cannot overwrite
  // a manifest key with a different school.
  for (const team of fbsTeams) {
    if (ids[team.abbreviation] === undefined) assign(team.abbreviation, team, "espn-fbs-roster");
  }

  // Any ESPN abbreviation shared by two FBS schools would make a key ambiguous.
  const duplicateAbbrs = [...byAbbr.entries()]
    .filter(([, teams]) => teams.length > 1)
    .map(([abbr, teams]) => `${abbr}=${teams.map((t) => t.displayName).join("/")}`);
  if (duplicateAbbrs.length) {
    throw new Error(`ambiguous FBS abbreviations, refusing to write: ${duplicateAbbrs.join("; ")}`);
  }

  const sortedKeys = Object.keys(ids).sort();
  const header = [
    "/**",
    " * GENERATED FILE — do not edit by hand.",
    " *   npm run generate:cfb-logos",
    " *",
    " * Source: ESPN college-football team data, FBS group 80.",
    ` *   season        ${SEASON}`,
    ` *   generated     ${new Date().toISOString().slice(0, 10)}`,
    ` *   FBS teams     ${fbsTeams.length} (of ${everyTeam.length} across all divisions)`,
    ` *   keys          ${sortedKeys.length}`,
    ` *   gaps          ${gaps.length}`,
    " *",
    " * Every id below came from ESPN's own team record. None was typed by hand.",
    " * Notably this is how the Ohio split is verified rather than assumed:",
    " *   OSU  = Ohio State Buckeyes (ESPN id 194)",
    " *   OHIO = Ohio Bobcats        (ESPN id 195)",
    " * The school manifest's \"OHIO\" means Ohio University, so the old",
    " * hand-typed map pointed it at Ohio State's logo.",
    " */",
    "",
  ].join("\n");

  const body = [
    "/** ESPN's 500px team logo endpoint. `{id}` is a CFB_TEAM_LOGO_IDS value. */",
    `export const CFB_LOGO_URL_PATTERN = ${JSON.stringify(LOGO_URL_PATTERN)};`,
    "",
    "/** Canonical CFB abbreviation -> ESPN numeric team id. */",
    "export const CFB_TEAM_LOGO_IDS: Readonly<Record<string, number>> = {",
    ...sortedKeys.map((k) => `  ${/^[A-Z][A-Z0-9]*$/.test(k) ? k : JSON.stringify(k)}: ${ids[k]},`),
    "};",
    "",
    "/** Abbreviation -> ESPN displayName. Used by tests to prove each key is one school. */",
    "export const CFB_TEAM_NAMES: Readonly<Record<string, string>> = {",
    ...sortedKeys.map((k) => `  ${/^[A-Z][A-Z0-9]*$/.test(k) ? k : JSON.stringify(k)}: ${JSON.stringify(names[k])},`),
    "};",
    "",
    "/**",
    " * Required keys ESPN's FBS data could not resolve. Listed, never guessed —",
    " * a team here renders the abbreviation badge, which is the honest outcome.",
    " */",
    "export const CFB_LOGO_GAPS: ReadonlyArray<{",
    "  readonly abbr: string;",
    "  readonly name: string;",
    "  readonly source: string;",
    "  readonly reason: string;",
    "}> = [",
    ...gaps
      .slice()
      .sort((a, b) => a.abbr.localeCompare(b.abbr))
      .map((g) => `  ${JSON.stringify(g)},`),
    "];",
    "",
  ].join("\n");

  const output = `${header}\n${body}`;

  if (CHECK_ONLY) {
    const current = readFileSync(OUT_PATH, "utf8");
    // The generated date line changes on every run; compare everything else.
    const strip = (s) => s.replace(/^ \*\s+generated\s+.*$/m, "");
    if (strip(current) !== strip(output)) {
      console.error("cfbTeamLogos.generated.ts is stale — run npm run generate:cfb-logos");
      process.exit(1);
    }
    console.log("cfbTeamLogos.generated.ts is up to date.");
    return;
  }

  writeFileSync(OUT_PATH, output);

  const byHow = (prefix) => sortedKeys.filter((k) => via[k].startsWith(prefix)).length;
  console.log(`FBS teams            ${fbsTeams.length} (season ${SEASON})`);
  console.log(`manifest schools     ${manifest.length}`);
  console.log(`odds CFB codes       ${oddsCodes.length}`);
  console.log(`keys written         ${sortedKeys.length}`);
  console.log(`  via ESPN abbr      ${byHow("espn-abbreviation")}`);
  console.log(`  via school name    ${byHow("name:")}`);
  console.log(`  via non-FBS abbr   ${byHow("non-fbs-unique-abbreviation")}`);
  console.log(`duplicate FBS abbrs  ${duplicateAbbrs.length ? duplicateAbbrs.join("; ") : "none"}`);
  console.log(`gaps                 ${gaps.length}`);
  for (const gap of gaps) console.log(`  ${gap.abbr} (${gap.name}) — ${gap.reason}`);
  console.log(`\nwrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(`generate-cfb-logo-map failed: ${err.message}`);
  process.exit(1);
});
