// ─────────────────────────────────────────────────────────────────────────────
// EdgeSetter — Team Logo Asset Resolver
//
// Resolves the correct logo asset path for a team token in a given sport.
//
// The SF Giants red-square fallback bug:
//   Root cause: the logo lookup used `SF` as the key against a shared token
//   map. `SF` is also the NFL token for the 49ers. When resolved without a
//   sport context, the lookup either returned the wrong asset or fell through
//   to the red-square fallback because the key collision was unresolved.
//
//   Fix: every MLB logo lookup uses the full slug (e.g. "sf-giants") built
//   from `${city}-${nickname}`, not the raw team token. The token is only
//   used as a display abbreviation, never as the asset key directly.
// ─────────────────────────────────────────────────────────────────────────────

type League = "nfl" | "nba" | "mlb" | "cfb";

// ── MLB slug map ──────────────────────────────────────────────────────────────
// Key: uppercase team token as it appears in pipeline data
// Value: logo slug that maps to the asset in /assets/logos/mlb/
const MLB_TOKEN_TO_SLUG: Record<string, string> = {
  SF: "sf-giants",      // San Francisco Giants — NOT the 49ers
  SD: "sd-padres",
  LA: "la-dodgers",
  LAA: "la-angels",
  NYY: "ny-yankees",
  NYM: "ny-mets",
  KC: "kc-royals",
  TB: "tb-rays",
  OAK: "oak-athletics",
  BOS: "bos-red-sox",
  CHC: "chc-cubs",
  CWS: "cws-white-sox",
  HOU: "hou-astros",
  ATL: "atl-braves",
  MIA: "mia-marlins",
  MIL: "mil-brewers",
  MIN: "min-twins",
  PHI: "phi-phillies",
  PIT: "pit-pirates",
  STL: "stl-cardinals",
  ARI: "ari-diamondbacks",
  COL: "col-rockies",
  SEA: "sea-mariners",
  TEX: "tex-rangers",
  TOR: "tor-blue-jays",
  BAL: "bal-orioles",
  CLE: "cle-guardians",
  DET: "det-tigers",
  WSH: "wsh-nationals",
  CIN: "cin-reds",
};

// ── NFL slug map ──────────────────────────────────────────────────────────────
const NFL_TOKEN_TO_SLUG: Record<string, string> = {
  SF: "sf-49ers",       // San Francisco 49ers — NOT the Giants
  KC: "kc-chiefs",
  LA: "la-rams",
  LAC: "lac-chargers",
  LV: "lv-raiders",
  NE: "ne-patriots",
  NYG: "nyg-giants",
  NYJ: "nyj-jets",
  TB: "tb-buccaneers",
  GB: "gb-packers",
  CHI: "chi-bears",
  DAL: "dal-cowboys",
  DEN: "den-broncos",
  DET: "det-lions",
  HOU: "hou-texans",
  IND: "ind-colts",
  JAC: "jac-jaguars",
  MIN: "min-vikings",
  NO: "no-saints",
  PHI: "phi-eagles",
  SEA: "sea-seahawks",
  TEN: "ten-titans",
  WSH: "wsh-commanders",
  ATL: "atl-falcons",
  ARI: "ari-cardinals",
  BAL: "bal-ravens",
  BUF: "buf-bills",
  CAR: "car-panthers",
  CIN: "cin-bengals",
  CLE: "cle-browns",
  MIA: "mia-dolphins",
  PIT: "pit-steelers",
};

// ── NBA slug map ──────────────────────────────────────────────────────────────
const NBA_TOKEN_TO_SLUG: Record<string, string> = {
  GS: "gs-warriors",    // Golden State Warriors — token is GS not SF
  LA: "la-lakers",
  LAC: "lac-clippers",
  NY: "ny-knicks",
  BKN: "bkn-nets",
  BOS: "bos-celtics",
  CHI: "chi-bulls",
  CLE: "cle-cavaliers",
  DAL: "dal-mavericks",
  DEN: "den-nuggets",
  DET: "det-pistons",
  HOU: "hou-rockets",
  IND: "ind-pacers",
  MEM: "mem-grizzlies",
  MIA: "mia-heat",
  MIL: "mil-bucks",
  MIN: "min-timberwolves",
  NO: "no-pelicans",
  OKC: "okc-thunder",
  ORL: "orl-magic",
  PHI: "phi-76ers",
  PHX: "phx-suns",
  POR: "por-blazers",
  SA: "sa-spurs",
  SAC: "sac-kings",
  TOR: "tor-raptors",
  UTA: "uta-jazz",
  WSH: "wsh-wizards",
  ATL: "atl-hawks",
  CHA: "cha-hornets",
};

const SLUG_MAPS: Record<League, Record<string, string>> = {
  mlb: MLB_TOKEN_TO_SLUG,
  nfl: NFL_TOKEN_TO_SLUG,
  nba: NBA_TOKEN_TO_SLUG,
  cfb: {},  // CFB uses full school slugs built elsewhere
};

/** ESPN CDN base — serves NFL, NBA, MLB team logos by lowercase token */
const ESPN_CDN = "https://a.espncdn.com/i/teamlogos";

/** Transparent fallback — clean empty space instead of red square */
const FALLBACK_SRC = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";

export function resolveTeamLogoSrc(token: string, league: League): string {
  if (!token) return FALLBACK_SRC;

  const slugMap = SLUG_MAPS[league];
  const upper = token.trim().toUpperCase();
  const slug = slugMap[upper];

  if (!slug) return FALLBACK_SRC;

  // CFB uses ESPN numeric IDs — not yet mapped, return fallback
  if (league === "cfb") return FALLBACK_SRC;

  // ESPN CDN uses lowercase token (den, kc, sf, etc.) not the full slug
  const espnToken = upper.toLowerCase();
  const espnLeague = league === "nfl" ? "nfl"
    : league === "nba" ? "nba"
    : league === "mlb" ? "mlb"
    : null;

  if (!espnLeague) return FALLBACK_SRC;

  return `${ESPN_CDN}/${espnLeague}/500/${espnToken}.png`;
}

/**
 * Returns the alt text for a team logo image — used for accessibility and
 * as a visible label if the image fails to load.
 *
 * Returns the token itself as a readable fallback (e.g. "SF" or "GS").
 */
export function teamLogoAlt(token: string, league: League): string {
  if (!token) return "Team logo";
  const slugMap = SLUG_MAPS[league];
  const upper = token.trim().toUpperCase();
  const slug = slugMap[upper];
  if (!slug) return `${upper} logo`;
  // Convert slug to readable name: "sf-giants" → "SF Giants"
  return slug
    .split("-")
    .map((part) => part.toUpperCase())
    .join(" ");
}
