/**
 * ESPN CDN asset helpers — all URLs routed through /api/img-proxy to avoid CORS
 */

const proxy = (url: string) => `/api/img-proxy?url=${encodeURIComponent(url)}`;

const MLB_RAW: Record<string, string> = {
  ARI: "https://a.espncdn.com/i/teamlogos/mlb/500/ari.png",
  ATH: "https://a.espncdn.com/i/teamlogos/mlb/500/ath.png",
  ATL: "https://a.espncdn.com/i/teamlogos/mlb/500/atl.png",
  BAL: "https://a.espncdn.com/i/teamlogos/mlb/500/bal.png",
  BOS: "https://a.espncdn.com/i/teamlogos/mlb/500/bos.png",
  CHC: "https://a.espncdn.com/i/teamlogos/mlb/500/chc.png",
  CHW: "https://a.espncdn.com/i/teamlogos/mlb/500/chw.png",
  CWS: "https://a.espncdn.com/i/teamlogos/mlb/500/chw.png",
  CIN: "https://a.espncdn.com/i/teamlogos/mlb/500/cin.png",
  CLE: "https://a.espncdn.com/i/teamlogos/mlb/500/cle.png",
  COL: "https://a.espncdn.com/i/teamlogos/mlb/500/col.png",
  DET: "https://a.espncdn.com/i/teamlogos/mlb/500/det.png",
  HOU: "https://a.espncdn.com/i/teamlogos/mlb/500/hou.png",
  KC:  "https://a.espncdn.com/i/teamlogos/mlb/500/kc.png",
  KCR: "https://a.espncdn.com/i/teamlogos/mlb/500/kc.png",
  LAA: "https://a.espncdn.com/i/teamlogos/mlb/500/laa.png",
  LAD: "https://a.espncdn.com/i/teamlogos/mlb/500/lad.png",
  MIA: "https://a.espncdn.com/i/teamlogos/mlb/500/mia.png",
  MIL: "https://a.espncdn.com/i/teamlogos/mlb/500/mil.png",
  MIN: "https://a.espncdn.com/i/teamlogos/mlb/500/min.png",
  NYM: "https://a.espncdn.com/i/teamlogos/mlb/500/nym.png",
  NYY: "https://a.espncdn.com/i/teamlogos/mlb/500/nyy.png",
  OAK: "https://a.espncdn.com/i/teamlogos/mlb/500/ath.png",
  PHI: "https://a.espncdn.com/i/teamlogos/mlb/500/phi.png",
  PIT: "https://a.espncdn.com/i/teamlogos/mlb/500/pit.png",
  SD:  "https://a.espncdn.com/i/teamlogos/mlb/500/sd.png",
  SDP: "https://a.espncdn.com/i/teamlogos/mlb/500/sd.png",
  SF:  "https://a.espncdn.com/i/teamlogos/mlb/500/sf.png",
  SFG: "https://a.espncdn.com/i/teamlogos/mlb/500/sf.png",
  SEA: "https://a.espncdn.com/i/teamlogos/mlb/500/sea.png",
  STL: "https://a.espncdn.com/i/teamlogos/mlb/500/stl.png",
  TB:  "https://a.espncdn.com/i/teamlogos/mlb/500/tb.png",
  TBR: "https://a.espncdn.com/i/teamlogos/mlb/500/tb.png",
  TEX: "https://a.espncdn.com/i/teamlogos/mlb/500/tex.png",
  TOR: "https://a.espncdn.com/i/teamlogos/mlb/500/tor.png",
  WSH: "https://a.espncdn.com/i/teamlogos/mlb/500/wsh.png",
  WAS: "https://a.espncdn.com/i/teamlogos/mlb/500/wsh.png",
  WSN: "https://a.espncdn.com/i/teamlogos/mlb/500/wsh.png",
};

const NBA_RAW: Record<string, string> = {
  ATL: "https://a.espncdn.com/i/teamlogos/nba/500/atl.png",
  BOS: "https://a.espncdn.com/i/teamlogos/nba/500/bos.png",
  BKN: "https://a.espncdn.com/i/teamlogos/nba/500/bkn.png",
  BRK: "https://a.espncdn.com/i/teamlogos/nba/500/bkn.png",
  CHA: "https://a.espncdn.com/i/teamlogos/nba/500/cha.png",
  CHI: "https://a.espncdn.com/i/teamlogos/nba/500/chi.png",
  CLE: "https://a.espncdn.com/i/teamlogos/nba/500/cle.png",
  DAL: "https://a.espncdn.com/i/teamlogos/nba/500/dal.png",
  DEN: "https://a.espncdn.com/i/teamlogos/nba/500/den.png",
  DET: "https://a.espncdn.com/i/teamlogos/nba/500/det.png",
  GS:  "https://a.espncdn.com/i/teamlogos/nba/500/gs.png",
  GSW: "https://a.espncdn.com/i/teamlogos/nba/500/gs.png",
  HOU: "https://a.espncdn.com/i/teamlogos/nba/500/hou.png",
  IND: "https://a.espncdn.com/i/teamlogos/nba/500/ind.png",
  LAC: "https://a.espncdn.com/i/teamlogos/nba/500/lac.png",
  LAL: "https://a.espncdn.com/i/teamlogos/nba/500/lal.png",
  MEM: "https://a.espncdn.com/i/teamlogos/nba/500/mem.png",
  MIA: "https://a.espncdn.com/i/teamlogos/nba/500/mia.png",
  MIL: "https://a.espncdn.com/i/teamlogos/nba/500/mil.png",
  MIN: "https://a.espncdn.com/i/teamlogos/nba/500/min.png",
  NO:  "https://a.espncdn.com/i/teamlogos/nba/500/no.png",
  NOP: "https://a.espncdn.com/i/teamlogos/nba/500/no.png",
  NY:  "https://a.espncdn.com/i/teamlogos/nba/500/ny.png",
  NYK: "https://a.espncdn.com/i/teamlogos/nba/500/ny.png",
  OKC: "https://a.espncdn.com/i/teamlogos/nba/500/okc.png",
  ORL: "https://a.espncdn.com/i/teamlogos/nba/500/orl.png",
  PHI: "https://a.espncdn.com/i/teamlogos/nba/500/phi.png",
  PHX: "https://a.espncdn.com/i/teamlogos/nba/500/phx.png",
  PHO: "https://a.espncdn.com/i/teamlogos/nba/500/phx.png",
  POR: "https://a.espncdn.com/i/teamlogos/nba/500/por.png",
  SAC: "https://a.espncdn.com/i/teamlogos/nba/500/sac.png",
  SA:  "https://a.espncdn.com/i/teamlogos/nba/500/sa.png",
  SAS: "https://a.espncdn.com/i/teamlogos/nba/500/sa.png",
  TOR: "https://a.espncdn.com/i/teamlogos/nba/500/tor.png",
  UTA: "https://a.espncdn.com/i/teamlogos/nba/500/utah.png",
  WSH: "https://a.espncdn.com/i/teamlogos/nba/500/wsh.png",
  WAS: "https://a.espncdn.com/i/teamlogos/nba/500/wsh.png",
};

const MLB_NAME_TO_ABBR: Record<string, string> = {
  "arizona diamondbacks": "ARI", "diamondbacks": "ARI", "d-backs": "ARI",
  "athletics": "ATH", "oakland athletics": "ATH", "sacramento athletics": "ATH",
  "atlanta braves": "ATL", "braves": "ATL",
  "baltimore orioles": "BAL", "orioles": "BAL",
  "boston red sox": "BOS", "red sox": "BOS",
  "chicago cubs": "CHC", "cubs": "CHC",
  "chicago white sox": "CHW", "white sox": "CHW",
  "cincinnati reds": "CIN", "reds": "CIN",
  "cleveland guardians": "CLE", "guardians": "CLE",
  "colorado rockies": "COL", "rockies": "COL",
  "detroit tigers": "DET", "tigers": "DET",
  "houston astros": "HOU", "astros": "HOU",
  "kansas city royals": "KC", "royals": "KC",
  "los angeles angels": "LAA", "angels": "LAA",
  "los angeles dodgers": "LAD", "dodgers": "LAD",
  "miami marlins": "MIA", "marlins": "MIA",
  "milwaukee brewers": "MIL", "brewers": "MIL",
  "minnesota twins": "MIN", "twins": "MIN",
  "new york mets": "NYM", "mets": "NYM",
  "new york yankees": "NYY", "yankees": "NYY",
  "philadelphia phillies": "PHI", "phillies": "PHI",
  "pittsburgh pirates": "PIT", "pirates": "PIT",
  "san diego padres": "SD", "padres": "SD",
  "san francisco giants": "SF", "giants": "SF",
  "seattle mariners": "SEA", "mariners": "SEA",
  "st. louis cardinals": "STL", "st louis cardinals": "STL", "cardinals": "STL",
  "tampa bay rays": "TB", "rays": "TB",
  "texas rangers": "TEX", "rangers": "TEX",
  "toronto blue jays": "TOR", "blue jays": "TOR",
  "washington nationals": "WSH", "nationals": "WSH",
};

const NBA_NAME_TO_ABBR: Record<string, string> = {
  "atlanta hawks": "ATL", "hawks": "ATL",
  "boston celtics": "BOS", "celtics": "BOS",
  "brooklyn nets": "BKN", "nets": "BKN",
  "charlotte hornets": "CHA", "hornets": "CHA",
  "chicago bulls": "CHI", "bulls": "CHI",
  "cleveland cavaliers": "CLE", "cavaliers": "CLE", "cavs": "CLE",
  "dallas mavericks": "DAL", "mavericks": "DAL", "mavs": "DAL",
  "denver nuggets": "DEN", "nuggets": "DEN",
  "detroit pistons": "DET", "pistons": "DET",
  "golden state warriors": "GSW", "warriors": "GSW",
  "houston rockets": "HOU", "rockets": "HOU",
  "indiana pacers": "IND", "pacers": "IND",
  "los angeles clippers": "LAC", "clippers": "LAC",
  "los angeles lakers": "LAL", "lakers": "LAL",
  "memphis grizzlies": "MEM", "grizzlies": "MEM",
  "miami heat": "MIA", "heat": "MIA",
  "milwaukee bucks": "MIL", "bucks": "MIL",
  "minnesota timberwolves": "MIN", "timberwolves": "MIN",
  "new orleans pelicans": "NOP", "pelicans": "NOP",
  "new york knicks": "NYK", "knicks": "NYK",
  "oklahoma city thunder": "OKC", "thunder": "OKC",
  "orlando magic": "ORL", "magic": "ORL",
  "philadelphia 76ers": "PHI", "76ers": "PHI", "sixers": "PHI",
  "phoenix suns": "PHX", "suns": "PHX",
  "portland trail blazers": "POR", "trail blazers": "POR", "blazers": "POR",
  "sacramento kings": "SAC", "kings": "SAC",
  "san antonio spurs": "SAS", "spurs": "SAS",
  "toronto raptors": "TOR", "raptors": "TOR",
  "utah jazz": "UTA", "jazz": "UTA",
  "washington wizards": "WSH", "wizards": "WSH",
};

export const MLB_LOGOS: Record<string, string> = Object.fromEntries(
  Object.entries(MLB_RAW).map(([k, v]) => [k, proxy(v)])
);

export const NBA_LOGOS: Record<string, string> = Object.fromEntries(
  Object.entries(NBA_RAW).map(([k, v]) => [k, proxy(v)])
);

export function getTeamLogo(team: string | null | undefined, sport: "mlb" | "nba"): string | null {
  if (!team) return null;
  const logoMap = sport === "mlb" ? MLB_LOGOS : NBA_LOGOS;
  const nameMap = sport === "mlb" ? MLB_NAME_TO_ABBR : NBA_NAME_TO_ABBR;
  const lower = team.toLowerCase().trim();
  const abbrFromName = nameMap[lower];
  if (abbrFromName && logoMap[abbrFromName]) return logoMap[abbrFromName];
  const upper = team.toUpperCase().trim();
  if (logoMap[upper]) return logoMap[upper];
  const firstWord = upper.split(" ")[0];
  return logoMap[firstWord] ?? null;
}

const MLB_PLAYER_IDS: Record<string, number> = {
  "Shohei Ohtani": 39832, "Mookie Betts": 33836, "Freddie Freeman": 30836,
  "Aaron Judge": 33900, "Juan Soto": 41297, "Gerrit Cole": 32978,
  "Spencer Strider": 4917456, "Max Fried": 33153, "Paul Skenes": 5118482,
  "Manny Machado": 31097, "Fernando Tatis Jr.": 41165, "Tarik Skubal": 4917452,
  "Gunnar Henderson": 5118483, "Bobby Witt Jr.": 5118486,
};

const NBA_PLAYER_IDS: Record<string, number> = {
  "LeBron James": 1966, "Stephen Curry": 3975, "Kevin Durant": 3202,
  "Giannis Antetokounmpo": 3032977, "Nikola Jokic": 3112335, "Joel Embiid": 3059318,
  "Luka Doncic": 3945274, "Jayson Tatum": 4065648, "Jaylen Brown": 3136193,
  "Anthony Davis": 6583, "Shai Gilgeous-Alexander": 4278129,
  "Tyrese Haliburton": 4432579, "De'Aaron Fox": 4066261,
  "Victor Wembanyama": 4432815, "Anthony Edwards": 4432816,
  "Jalen Brunson": 4066328, "Ja Morant": 4279888,
  "Bam Adebayo": 3136776, "Dru Smith": 4432580, "Nikola Jovic": 4897429,
  "Myles Turner": 3064514, "Brandon Clarke": 4066421,
};

export function getPlayerHeadshot(playerName: string | null | undefined, sport: "mlb" | "nba"): string | null {
  if (!playerName) return null;
  const idMap = sport === "mlb" ? MLB_PLAYER_IDS : NBA_PLAYER_IDS;
  const id = idMap[playerName.trim()];
  if (!id) return null;
  const rawUrl = `https://a.espncdn.com/combiner/i?img=/i/headshots/${sport}/players/full/${id}.png&w=96&h=70`;
  return proxy(rawUrl);
}

export function getInitialsAvatar(name: string | null | undefined): { initials: string; color: string } {
  if (!name) return { initials: "??", color: "#3A3F4A" };
  const parts = name.trim().split(/\s+/);
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : parts[0].slice(0, 2).toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ["#1D428A","#CE1141","#007A33","#F5B841","#552583","#006BB6","#E03A3E","#00471B","#0E2240","#C8102E"];
  return { initials, color: colors[Math.abs(hash) % colors.length] };
}
