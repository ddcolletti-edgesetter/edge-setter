/**
 * Edge Setter — CFB team map generator
 *
 * Writes two files from one ESPN run, so they can never drift apart:
 *   client/src/lib/cfbTeamLogos.generated.ts   — abbreviation -> logo id (client)
 *   server/pipeline/cfb-espn-teams.generated.ts — team identity + the token the
 *     odds adapter stores in games.home_team/away_team (server, settlement)
 *
 * The server file exists because games rows for CFB are written by the odds
 * adapter as shortCode(<The Odds API team name>), while the ESPN score adapter
 * looks them up by ESPN's own spelling. Those two vocabularies disagree for 92
 * of 136 FBS teams, so findGameByTeams never resolves the game and the game
 * never goes final. See docs/cfb-game-alias.md.
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
const OUT_SERVER_PATH = resolve(ROOT, "server/pipeline/cfb-espn-teams.generated.ts");
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

/**
 * Byte-for-byte replica of the fallback branch of shortCode() in
 * server/pipeline/adapters/the-odds-api.ts:
 *   NAME_TO_CODE[name] ?? name.split(" ").pop()?.slice(0, 3).toUpperCase()
 * For a school NAME_TO_CODE has no entry for, this is literally what the odds
 * adapter writes into games.home_team / games.away_team. It reads the LAST word
 * (the mascot), which is why the forward translation keys off the full display
 * name and never off an abbreviation, and why the token must never be used to
 * pick a logo. Asserted against all 48 NAME_TO_CODE names below.
 */
const mascotSlice = (fullName) =>
  fullName.split(" ").pop()?.slice(0, 3).toUpperCase() ?? fullName.slice(0, 3).toUpperCase();

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

  /* ─── Tokens a games row can hold that are NOT abbreviations ──────────
   *
   * games.home_team for CFB is shortCode(<The Odds API team name>): the
   * NAME_TO_CODE value for the schools that map covers, and otherwise
   * mascotSlice(name). A mascot slice names a mascot, not a school, so two
   * schools can share one and a third school's real abbreviation can collide
   * with it. Measured: "Kent State Golden Flashes" and "Liberty Flames" are
   * both written "FLA", which is also ESPN's abbreviation for Florida — so a
   * Kent State game resolved Florida's logo.
   *
   * A slice is EXCLUDED when every school written as it has that slice as its
   * own ESPN abbreviation: "Illinois Fighting Illini" slices to ILL, which is
   * ESPN's ILL, so the token does identify the school and its logo is right.
   */
  const oddsNameSet = new Set(oddsCodes.map((entry) => entry.name));
  const sliceClaims = new Map();
  for (const team of fbsTeams) {
    if (oddsNameSet.has(team.displayName)) continue; // stored as a real code
    const token = mascotSlice(team.displayName);
    const bucket = sliceClaims.get(token);
    if (bucket) bucket.push(team);
    else sliceClaims.set(token, [team]);
  }
  const mascotSliceTokens = [...sliceClaims.entries()]
    .filter(([token, claimants]) => !claimants.every((team) => team.abbreviation === token))
    .map(([token, claimants]) => ({
      token,
      teams: claimants.map((team) => team.displayName).sort(),
    }))
    .sort((a, b) => a.token.localeCompare(b.token));
  const sliceSelfNaming = [...sliceClaims.entries()]
    .filter(([token, claimants]) => claimants.every((team) => team.abbreviation === token))
    .map(([token]) => token)
    .sort();
  /* ─── The stored-token side (server map) ──────────────────────────────
   *
   * games.home_team for CFB is shortCode(<The Odds API name>). Two branches:
   *   1. the name is a NAME_TO_CODE key  -> the mapped code (48 teams)
   *   2. otherwise                       -> mascotSlice(name) (88 teams)
   * Branch 1 we know exactly: the odds name IS the map key. Branch 2 we derive
   * from ESPN's displayName, which is sound only if the two feeds agree on the
   * mascot word; that is asserted below against all 48 names we can check.
   */
  const storedByEspnId = new Map();
  const mascotDisagreements = [];
  for (const { name, abbr } of oddsCodes) {
    const team = matchName(name);
    if (!team) {
      throw new Error(`odds CFB name "${name}" matched no FBS team — refusing to write a partial map`);
    }
    storedByEspnId.set(String(team.id), abbr);
    if (mascotSlice(name) !== mascotSlice(team.displayName)) {
      mascotDisagreements.push(`${name} -> ${mascotSlice(name)} vs ESPN ${team.displayName} -> ${mascotSlice(team.displayName)}`);
    }
  }
  if (mascotDisagreements.length) {
    throw new Error(
      "the odds feed and ESPN disagree on the mascot word, so mascotSlice(displayName) is not a safe " +
      `stand-in for the unmapped teams: ${mascotDisagreements.join("; ")}`,
    );
  }

  // Every team the emitted key set can reach, by ESPN id.
  const teamById = new Map();
  for (const abbr of Object.keys(ids)) {
    const id = String(ids[abbr]);
    if (!teamById.has(id)) {
      const team = everyTeam.find((t) => String(t.id) === id);
      if (team) teamById.set(id, team);
    }
  }
  for (const team of fbsTeams) if (!teamById.has(String(team.id))) teamById.set(String(team.id), team);

  const storedTokenOf = (team) => storedByEspnId.get(String(team.id)) ?? mascotSlice(team.displayName);

  // A stored token two schools share cannot identify one of them on its own.
  const idsPerStoredToken = new Map();
  for (const [id, team] of teamById) {
    const token = storedTokenOf(team);
    const bucket = idsPerStoredToken.get(token);
    if (bucket) bucket.add(id);
    else idsPerStoredToken.set(token, new Set([id]));
  }
  const ambiguousStored = [...idsPerStoredToken.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([token, set]) => ({
      token,
      teams: [...set].map((id) => teamById.get(id).displayName).sort(),
    }))
    .sort((a, b) => a.token.localeCompare(b.token));

  /* Key set for the server resolver, in two precedence tiers.
   *
   * Tier 1 is identity: every abbreviation spelling the maps carry (ESPN's,
   * the school manifest's, the odds adapter's) and each team's display name,
   * location, short name, slug and mascot, normalized.
   *
   * Tier 2 is the derived stored token, and it only gets a key tier 1 left
   * alone. That ordering is load-bearing: ESPN's abbreviation for Florida is
   * "FLA", which is also the mascot token Kent State's Golden Flashes and
   * Liberty's Flames both derive to. Letting tier 2 compete would drop "FLA"
   * as contested and leave Florida unresolvable from ESPN's own spelling.
   *
   * Within a tier, a key two schools both claim is dropped rather than
   * pointed at one of them.
   */
  const claimsIn = (entries) => {
    const map = new Map();
    for (const [key, id] of entries) {
      if (!key) continue;
      const bucket = map.get(key);
      if (bucket) bucket.add(String(id));
      else map.set(key, new Set([String(id)]));
    }
    return map;
  };

  const tier1Entries = [];
  for (const abbr of Object.keys(ids)) tier1Entries.push([abbr.toUpperCase(), ids[abbr]]);
  for (const [id, team] of teamById) {
    for (const form of [team.displayName, team.location, team.shortDisplayName, team.slug, team.name]) {
      if (form) tier1Entries.push([normalize(form), id]);
    }
  }
  const tier1 = claimsIn(tier1Entries);
  const tier2 = claimsIn([...teamById].map(([id, team]) => [storedTokenOf(team).toUpperCase(), id]));

  const serverKeys = {};
  const droppedKeys = [];
  const describe = (claimants) => [...claimants].map((id) => teamById.get(id)?.displayName ?? id).sort();
  for (const [key, claimants] of [...tier1.entries()].sort()) {
    if (claimants.size === 1) serverKeys[key] = Number([...claimants][0]);
    else droppedKeys.push({ key, tier: 1, teams: describe(claimants) });
  }
  for (const [key, claimants] of [...tier2.entries()].sort()) {
    if (tier1.has(key)) continue;
    if (claimants.size === 1) serverKeys[key] = Number([...claimants][0]);
    else droppedKeys.push({ key, tier: 2, teams: describe(claimants) });
  }
  droppedKeys.sort((a, b) => a.key.localeCompare(b.key));

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
    " * Tokens the odds adapter writes into games.home_team / games.away_team",
    " * that are a mascot slice rather than an abbreviation, with the schools",
    " * written as each. A logo must never be resolved from one of these: the",
    " * slice names a mascot, so it can belong to several schools and can",
    " * collide with a different school's real abbreviation.",
    " *",
    " * Slices that ARE the school's own ESPN abbreviation are excluded, because",
    " * the token does identify the school: " + (sliceSelfNaming.join(", ") || "none"),
    " */",
    "export const CFB_MASCOT_SLICE_TOKENS: ReadonlyArray<{",
    "  readonly token: string;",
    "  readonly teams: readonly string[];",
    "}> = [",
    ...mascotSliceTokens.map((entry) => `  { token: ${JSON.stringify(entry.token)}, teams: ${JSON.stringify(entry.teams)} },`),
    "];",
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

  const tsKey = (k) => (/^[A-Z][A-Z0-9]*$/.test(k) ? k : JSON.stringify(k));
  const serverSorted = Object.keys(serverKeys).sort();
  const teamIdsSorted = [...teamById.keys()].sort((a, b) => Number(a) - Number(b));

  const serverOutput = [
    "/**",
    " * GENERATED FILE — do not edit by hand.",
    " *   npm run generate:cfb-logos",
    " *",
    " * The CFB half of game resolution, from ESPN's own team data.",
    ` *   season        ${SEASON}`,
    ` *   generated     ${new Date().toISOString().slice(0, 10)}`,
    ` *   teams         ${teamIdsSorted.length}`,
    ` *   lookup keys   ${serverSorted.length}`,
    ` *   ambiguous stored tokens ${ambiguousStored.length}`,
    " *",
    " * `stored` is the token the odds adapter writes into games.home_team and",
    " * games.away_team for that school: shortCode(<The Odds API team name>).",
    " * For the schools NAME_TO_CODE covers it is the mapped code; for the rest",
    " * it is the first three letters of the mascot word, which is what",
    " * shortCode falls back to. The generator refuses to write this file unless",
    " * the odds feed and ESPN agree on the mascot word for every NAME_TO_CODE",
    " * name it can check, because that agreement is the only evidence the",
    " * derivation is right for the schools no odds name is on record for.",
    " *",
    " * Nothing here is keyed off an abbreviation alone: identity is ESPN's",
    " * numeric team id, and a key two schools would both claim is dropped",
    " * rather than pointed at one of them.",
    " */",
    "",
    "export interface CfbEspnTeam {",
    "  /** ESPN displayName, verbatim. */",
    "  readonly name: string;",
    "  /** ESPN's own abbreviation for this team. */",
    "  readonly abbr: string;",
    "  /** The token the odds adapter stores in games.home_team / games.away_team. */",
    "  readonly stored: string;",
    "  /** In ESPN's FBS group 80 for the generated season. */",
    "  readonly fbs: boolean;",
    "}",
    "",
    "/** ESPN numeric team id -> that team's identity and stored token. */",
    "export const CFB_ESPN_TEAM_BY_ID: Readonly<Record<string, CfbEspnTeam>> = {",
    ...teamIdsSorted.map((id) => {
      const team = teamById.get(id);
      return `  "${id}": { name: ${JSON.stringify(team.displayName)}, abbr: ${JSON.stringify(team.abbreviation ?? "")}, stored: ${JSON.stringify(storedTokenOf(team))}, fbs: ${fbsIds.has(id)} },`;
    }),
    "};",
    "",
    "/**",
    " * Lookup key -> ESPN numeric team id. Uppercase keys are abbreviation",
    " * spellings (ESPN's, the school manifest's, the odds adapter's, and each",
    " * team's stored token where it is unique); lowercase keys are display",
    " * names, locations, short names and slugs with every non-alphanumeric",
    " * character stripped.",
    " */",
    "export const CFB_TEAM_KEY_TO_ESPN_ID: Readonly<Record<string, string>> = {",
    ...serverSorted.map((k) => `  ${tsKey(k)}: "${serverKeys[k]}",`),
    "};",
    "",
    "/**",
    " * Stored tokens more than one school would be written as, with the schools",
    " * behind each. These are still used to widen a lookup — dropping them would",
    " * cost real matches — but a widened lookup that resolves to more than one",
    " * games row is refused rather than guessed.",
    " */",
    "export const CFB_AMBIGUOUS_STORED_TOKENS: ReadonlyArray<{",
    "  readonly token: string;",
    "  readonly teams: readonly string[];",
    "}> = [",
    ...ambiguousStored.map((a) => `  { token: ${JSON.stringify(a.token)}, teams: ${JSON.stringify(a.teams)} },`),
    "];",
    "",
    "/** Lookup keys two schools both claimed, so neither got them. */",
    "export const CFB_DROPPED_KEYS: ReadonlyArray<{",
    "  readonly key: string;",
    "  readonly tier: number;",
    "  readonly teams: readonly string[];",
    "}> = [",
    ...droppedKeys.map((d) => `  { key: ${JSON.stringify(d.key)}, tier: ${d.tier}, teams: ${JSON.stringify(d.teams)} },`),
    "];",
    "",
  ].join("\n");

  const output = `${header}\n${body}`;

  const outputs = [
    { path: OUT_PATH, label: "cfbTeamLogos.generated.ts", text: output },
    { path: OUT_SERVER_PATH, label: "cfb-espn-teams.generated.ts", text: serverOutput },
  ];

  if (CHECK_ONLY) {
    // The generated date line changes on every run; compare everything else.
    const strip = (text) => text.replace(/^ \*\s+generated\s+.*$/m, "");
    const stale = outputs.filter(({ path, text }) => strip(readFileSync(path, "utf8")) !== strip(text));
    if (stale.length) {
      console.error(`stale — run npm run generate:cfb-logos: ${stale.map((o) => o.label).join(", ")}`);
      process.exit(1);
    }
    console.log(`up to date: ${outputs.map((o) => o.label).join(", ")}`);
    return;
  }

  for (const { path, text } of outputs) writeFileSync(path, text);

  const byHow = (prefix) => sortedKeys.filter((k) => via[k].startsWith(prefix)).length;
  console.log(`FBS teams            ${fbsTeams.length} (season ${SEASON})`);
  console.log(`manifest schools     ${manifest.length}`);
  console.log(`odds CFB codes       ${oddsCodes.length}`);
  console.log(`keys written         ${sortedKeys.length}`);
  console.log(`  via ESPN abbr      ${byHow("espn-abbreviation")}`);
  console.log(`  via school name    ${byHow("name:")}`);
  console.log(`  via non-FBS abbr   ${byHow("non-fbs-unique-abbreviation")}`);
  console.log(`duplicate FBS abbrs  ${duplicateAbbrs.length ? duplicateAbbrs.join("; ") : "none"}`);
  console.log(`mascot-slice tokens  ${mascotSliceTokens.length} (self-naming, excluded: ${sliceSelfNaming.join(", ") || "none"})`);
  for (const entry of mascotSliceTokens.filter((e) => ids[e.token] !== undefined)) {
    console.log(`  COLLIDES WITH A LOGO KEY  ${entry.token} -> ${names[entry.token]}, but stored for ${entry.teams.join(" / ")}`);
  }
  console.log(`gaps                 ${gaps.length}`);
  for (const gap of gaps) console.log(`  ${gap.abbr} (${gap.name}) — ${gap.reason}`);
  console.log(`\nserver map`);
  console.log(`  teams                ${teamIdsSorted.length}`);
  console.log(`  lookup keys          ${serverSorted.length}`);
  console.log(`  via NAME_TO_CODE     ${storedByEspnId.size}`);
  console.log(`  via mascot fallback  ${teamIdsSorted.length - storedByEspnId.size}`);
  console.log(`  ambiguous stored     ${ambiguousStored.length}`);
  for (const a of ambiguousStored) console.log(`    ${a.token}: ${a.teams.join(" / ")}`);
  console.log(`  dropped keys         ${droppedKeys.length}`);
  console.log(`\nwrote ${OUT_PATH}`);
  console.log(`wrote ${OUT_SERVER_PATH}`);
}

main().catch((err) => {
  console.error(`generate-cfb-logo-map failed: ${err.message}`);
  process.exit(1);
});
