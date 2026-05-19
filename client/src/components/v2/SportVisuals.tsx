/**
 * Edge Setter v2 — Sport Visual Component System
 * LFL Master Design — War Room Aesthetic
 */

export const T = {
  bg:         "#050505",
  surface1:   "#0A0F1A",
  surface2:   "#101827",
  surface3:   "#101827",
  gold:       "#F5B841",
  goldBright: "#FFD166",
  goldDim:    "rgba(245,184,65,0.15)",
  goldGlow:   "rgba(245,184,65,0.07)",
  text:       "#F8FAFC",
  textMuted:  "#94A3B8",
  textFaint:  "#64748B",
  green:      "#00E676",
  orange:     "#FF8A00",
  cyan:       "#00B7FF",
  danger:     "#FF5252",
  border:     "rgba(245,184,65,0.12)",
};

export const TEAM_COLORS: Record<string, { primary: string; secondary: string }> = {
  LAL: { primary: "#552583", secondary: "#FDB927" },
  GSW: { primary: "#1D428A", secondary: "#FFC72C" },
  BOS: { primary: "#007A33", secondary: "#FFFFFF" },
  MIA: { primary: "#98002E", secondary: "#F9A01B" },
  DEN: { primary: "#0E2240", secondary: "#FEC524" },
  MIN: { primary: "#0C2340", secondary: "#236192" },
  OKC: { primary: "#007AC1", secondary: "#EF3B24" },
  DAL: { primary: "#00538C", secondary: "#B8C4CA" },
  NYK: { primary: "#006BB6", secondary: "#F58426" },
  PHI: { primary: "#006BB6", secondary: "#ED174C" },
  MIL: { primary: "#00471B", secondary: "#EEE1C6" },
  IND: { primary: "#002D62", secondary: "#FDBB30" },
  MEM: { primary: "#5D76A9", secondary: "#12173F" },
  SAS: { primary: "#C4CED4", secondary: "#000000" },
  CLE: { primary: "#860038", secondary: "#FDBB30" },
  PHX: { primary: "#1D1160", secondary: "#E56020" },
  ATL: { primary: "#C8102E", secondary: "#FDB927" },
  CHI: { primary: "#CE1141", secondary: "#000000" },
  SAC: { primary: "#5A2D81", secondary: "#63727A" },
  NYY: { primary: "#132448", secondary: "#C4CED4" },
  LAD: { primary: "#005A9C", secondary: "#EF3E42" },
  BAL: { primary: "#DF4601", secondary: "#000000" },
  CHC: { primary: "#0E3386", secondary: "#CC3433" },
  HOU: { primary: "#002D62", secondary: "#EB6E1F" },
  NYM: { primary: "#002D72", secondary: "#FF5910" },
  DEFAULT: { primary: "#101827", secondary: "#F5B841" },
};

export function getTeamColors(abbr: string) {
  return TEAM_COLORS[abbr?.toUpperCase()] ?? TEAM_COLORS.DEFAULT;
}

const TEAM_NAME_TO_ABBR: Record<string, string> = {
  // NBA
  "atlanta hawks": "ATL", "boston celtics": "BOS", "brooklyn nets": "BKN",
  "charlotte hornets": "CHA", "chicago bulls": "CHI", "cleveland cavaliers": "CLE",
  "dallas mavericks": "DAL", "denver nuggets": "DEN", "detroit pistons": "DET",
  "golden state warriors": "GSW", "houston rockets": "HOU", "indiana pacers": "IND",
  "los angeles clippers": "LAC", "los angeles lakers": "LAL", "memphis grizzlies": "MEM",
  "miami heat": "MIA", "milwaukee bucks": "MIL", "minnesota timberwolves": "MIN",
  "new orleans pelicans": "NOP", "new york knicks": "NYK", "oklahoma city thunder": "OKC",
  "orlando magic": "ORL", "philadelphia 76ers": "PHI", "phoenix suns": "PHX",
  "portland trail blazers": "POR", "sacramento kings": "SAC", "san antonio spurs": "SAS",
  "toronto raptors": "TOR", "utah jazz": "UTA", "washington wizards": "WAS",
  // MLB
  "arizona diamondbacks": "ARI", "atlanta braves": "ATL", "baltimore orioles": "BAL",
  "boston red sox": "BOS", "chicago white sox": "CWS", "chicago cubs": "CHC",
  "cincinnati reds": "CIN", "cleveland guardians": "CLE", "colorado rockies": "COL",
  "detroit tigers": "DET", "houston astros": "HOU", "kansas city royals": "KCR",
  "los angeles angels": "LAA", "los angeles dodgers": "LAD", "miami marlins": "MIA",
  "milwaukee brewers": "MIL", "minnesota twins": "MIN", "new york mets": "NYM",
  "new york yankees": "NYY", "oakland athletics": "OAK", "philadelphia phillies": "PHI",
  "pittsburgh pirates": "PIT", "san diego padres": "SDP", "san francisco giants": "SFG",
  "seattle mariners": "SEA", "st. louis cardinals": "STL", "tampa bay rays": "TBR",
  "texas rangers": "TEX", "toronto blue jays": "TOR", "washington nationals": "WSN",
};

export function toTeamAbbr(name?: string): string {
  if (!name) return "";
  if (name.length <= 4) return name.toUpperCase();
  return TEAM_NAME_TO_ABBR[name.toLowerCase()] ?? name.slice(0, 3).toUpperCase();
}

export const PLAYER_HEADSHOTS: Record<string, string> = {
  "Anthony Davis":         "https://a.espncdn.com/i/headshots/nba/players/full/6583.png",
  "Jaylen Brown":          "https://a.espncdn.com/i/headshots/nba/players/full/6474.png",
  "Nikola Jokic":          "https://a.espncdn.com/i/headshots/nba/players/full/3112335.png",
  "Stephen Curry":         "https://a.espncdn.com/i/headshots/nba/players/full/3975.png",
  "Giannis Antetokounmpo": "https://a.espncdn.com/i/headshots/nba/players/full/3032977.png",
  "Ja Morant":             "https://a.espncdn.com/i/headshots/nba/players/full/4395628.png",
  "Draymond Green":        "https://a.espncdn.com/i/headshots/nba/players/full/2528210.png",
  "Luka Doncic":           "https://a.espncdn.com/i/headshots/nba/players/full/4066648.png",
  "Victor Wembanyama":     "https://a.espncdn.com/i/headshots/nba/players/full/4432816.png",
  "Gerrit Cole":           "https://a.espncdn.com/i/headshots/mlb/players/full/32859.png",
  "Shohei Ohtani":         "https://a.espncdn.com/i/headshots/mlb/players/full/39832.png",
  "Spencer Strider":       "",
  "Cody Bellinger":        "https://a.espncdn.com/i/headshots/mlb/players/full/31867.png",
  "Marcus Stroman":        "https://a.espncdn.com/i/headshots/mlb/players/full/32105.png",
  "G. Cole":               "https://a.espncdn.com/i/headshots/mlb/players/full/32859.png",
  "S. Strider":            "",
  "Y. Yamamoto":           "https://a.espncdn.com/i/headshots/mlb/players/full/4433254.png",
  "M. Fried":              "https://a.espncdn.com/i/headshots/mlb/players/full/32694.png",
  "M. Stroman":            "https://a.espncdn.com/i/headshots/mlb/players/full/32105.png",
};

export function getPlayerHeadshotUrl(name: string): string {
  return PLAYER_HEADSHOTS[name] ?? "";
}

const NBA_LOGO_URLS: Record<string, string> = {
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
  WAS: "https://a.espncdn.com/i/teamlogos/nba/500/wsh.png",
  WSH: "https://a.espncdn.com/i/teamlogos/nba/500/wsh.png",
};

const MLB_LOGO_URLS: Record<string, string> = {
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
  WAS: "https://a.espncdn.com/i/teamlogos/mlb/500/wsh.png",
  WSH: "https://a.espncdn.com/i/teamlogos/mlb/500/wsh.png",
  WSN: "https://a.espncdn.com/i/teamlogos/mlb/500/wsh.png",
};

export const TEAM_LOGO_URLS: Record<string, string> = { ...NBA_LOGO_URLS, ...MLB_LOGO_URLS };

export function getTeamLogoUrl(abbr: string, sport?: "nba" | "mlb"): string {
  const upper = abbr?.toUpperCase();
  if (sport === "mlb") return MLB_LOGO_URLS[upper] ?? "";
  if (sport === "nba") return NBA_LOGO_URLS[upper] ?? "";
  return TEAM_LOGO_URLS[upper] ?? "";
}

interface TeamLogoProps { abbr: string; size?: number; shape?: "circle"|"shield"|"square"; }
export function TeamLogo({ abbr, size = 32, shape = "circle" }: TeamLogoProps) {
  const colors = getTeamColors(abbr);
  const r = shape === "circle" ? "50%" : shape === "shield" ? "4px 4px 8px 8px" : "4px";
  return (
    <div style={{ width: size, height: size, borderRadius: r, background: `linear-gradient(145deg, ${colors.primary}EE, ${colors.primary}99)`, border: `1.5px solid ${colors.secondary}55`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 2px 8px ${colors.primary}66` }}>
      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: size * 0.38, fontWeight: 800, color: colors.secondary, letterSpacing: "-0.01em", lineHeight: 1, textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>{abbr?.slice(0, 3).toUpperCase()}</span>
    </div>
  );
}

interface TeamLogoImgProps { abbr: string; size?: number; shape?: "circle"|"shield"|"square"; src?: string; sport?: "nba" | "mlb"; }
export function TeamLogoImg({ abbr, size = 32, shape = "circle", src, sport }: TeamLogoImgProps) {
  const logoUrl = src ?? getTeamLogoUrl(abbr, sport);
  const colors = getTeamColors(abbr);
  if (!logoUrl) return <TeamLogo abbr={abbr} size={size} shape={shape} />;
  const borderRadius = shape === "circle" ? "50%" : shape === "shield" ? "4px 4px 8px 8px" : "4px";
  return (
    <div style={{ width: size, height: size, borderRadius, overflow: "hidden", flexShrink: 0, position: "relative", background: `${colors.primary}22`, border: `1px solid ${colors.secondary}22`, boxShadow: `0 2px 8px ${colors.primary}44` }}>
      <img src={logoUrl} alt={abbr} width={size} height={size} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        onError={(e) => {
          const target = e.currentTarget as HTMLImageElement;
          const parent = target.parentElement;
          if (parent) {
            parent.innerHTML = "";
            const span = document.createElement("span");
            span.style.cssText = `display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-family:'Barlow Condensed',sans-serif;font-size:${size * 0.38}px;font-weight:800;color:${colors.secondary};`;
            span.textContent = abbr?.slice(0, 3).toUpperCase();
            parent.appendChild(span);
          }
        }}
      />
    </div>
  );
}

export function TeamLogoPair({ away, home, size = 28, useImg = true }: { away: string; home: string; size?: number; useImg?: boolean }) {
  const Logo = useImg ? TeamLogoImg : TeamLogo;
  return (
    <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
      <div style={{ zIndex: 2 }}><Logo abbr={away} size={size} /></div>
      <div style={{ zIndex: 1, marginLeft: -size * 0.2 }}><Logo abbr={home} size={size} /></div>
    </div>
  );
}

type SportPosition = "guard"|"forward"|"center"|"pitcher"|"hitter"|"generic";
function getPositionFromType(type: string): SportPosition {
  if (type === "pitcher") return "pitcher";
  if (type === "hitter") return "hitter";
  if (type === "guard") return "guard";
  if (type === "forward" || type === "center") return type as SportPosition;
  return "guard";
}
const SILHOUETTES: Record<SportPosition, string> = {
  guard:   "M12,8 C13.7,8 15,6.7 15,5 C15,3.3 13.7,2 12,2 C10.3,2 9,3.3 9,5 C9,6.7 10.3,8 12,8 Z M8,10 C7.4,10 7,10.6 7,11.5 L7,18 L9,18 L9,22 L15,22 L15,18 L17,18 L17,11.5 C17,10.6 16.6,10 16,10 Z",
  forward: "M12,8 C13.7,8 15,6.7 15,5 C15,3.3 13.7,2 12,2 C10.3,2 9,3.3 9,5 C9,6.7 10.3,8 12,8 Z M7,11 L7,19 L9.5,19 L9.5,22 L14.5,22 L14.5,19 L17,19 L17,11 L14,10 L12,11 L10,10 Z",
  center:  "M12,7.5 C13.4,7.5 14.5,6.4 14.5,5 C14.5,3.6 13.4,2.5 12,2.5 C10.6,2.5 9.5,3.6 9.5,5 C9.5,6.4 10.6,7.5 12,7.5 Z M6,10.5 L6,20 L9,20 L9,22.5 L15,22.5 L15,20 L18,20 L18,10.5 Z",
  pitcher: "M12,7 C13.5,7 14.7,5.8 14.7,4.3 C14.7,2.8 13.5,1.7 12,1.7 C10.5,1.7 9.3,2.8 9.3,4.3 C9.3,5.8 10.5,7 12,7 Z M8,9.5 L8,16 L10,16 L10,22 L14,22 L14,16 L16,16 L16,9.5 L14,9 L17.5,6.5 L12,9 L6.5,6.5 L10,9 Z",
  hitter:  "M12,7 C13.5,7 14.7,5.8 14.7,4.3 C14.7,2.8 13.5,1.7 12,1.7 C10.5,1.7 9.3,2.8 9.3,4.3 C9.3,5.8 10.5,7 12,7 Z M9,9.5 L9,14 L6,14 L6,17 L9,17 L9,22 L15,22 L15,17 L18,17 L18,14 L15,14 L15,9.5 Z",
  generic: "M12,8 C13.7,8 15,6.7 15,5 C15,3.3 13.7,2 12,2 C10.3,2 9,3.3 9,5 C9,6.7 10.3,8 12,8 Z M8.5,10 L8.5,22 L11,22 L11,16 L13,16 L13,22 L15.5,22 L15.5,10 Z",
};

interface PlayerAvatarProps { name: string; team: string; position?: SportPosition|string; size?: number; showName?: boolean; showTeam?: boolean; }
export function PlayerAvatar({ name, team, position = "generic", size = 40, showName = false, showTeam = false }: PlayerAvatarProps) {
  const colors = getTeamColors(team);
  const pos = getPositionFromType(position) as SportPosition;
  const silPath = SILHOUETTES[pos] ?? SILHOUETTES.generic;
  const initials = name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() ?? "??";
  const innerSize = size * 0.72;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ width: size, height: size, borderRadius: "50%", background: `radial-gradient(circle at 40% 35%, ${colors.primary}EE, ${colors.primary}88)`, border: `2px solid ${colors.secondary}44`, boxShadow: `0 0 0 1px ${colors.primary}66, 0 3px 10px rgba(0,0,0,0.5)`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "40%", background: `linear-gradient(to top, ${colors.primary}99, transparent)` }} />
        <svg width={innerSize} height={innerSize} viewBox="0 0 24 24" style={{ position: "absolute", bottom: -innerSize * 0.1 }}>
          <path d={silPath} fill={colors.secondary} opacity={0.75} />
        </svg>
        <span style={{ position: "absolute", bottom: 2, fontFamily: "'Barlow Condensed', sans-serif", fontSize: size * 0.22, fontWeight: 800, color: `${colors.secondary}CC`, letterSpacing: "0.04em", lineHeight: 1 }}>{initials}</span>
      </div>
      {showName && <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: size * 0.22, fontWeight: 700, color: T.text, textAlign: "center", lineHeight: 1.2, maxWidth: size + 16, wordBreak: "break-word" }}>{name?.split(" ").slice(-1)[0]}</div>}
      {showTeam && <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: size * 0.18, fontWeight: 700, color: T.textFaint, letterSpacing: "0.1em", textTransform: "uppercase" }}>{team}</div>}
    </div>
  );
}

interface PlayerHeadshotProps { name: string; team: string; position?: SportPosition|string; size?: number; shape?: "circle"|"square"; showName?: boolean; showTeam?: boolean; src?: string; }
export function PlayerHeadshot({ name, team, position = "generic", size = 48, shape = "circle", showName = false, showTeam = false, src }: PlayerHeadshotProps) {
  const headshotUrl = src ?? getPlayerHeadshotUrl(name);
  const colors = getTeamColors(team);
  const borderRadius = shape === "circle" ? "50%" : "6px";
  if (!headshotUrl) return <PlayerAvatar name={name} team={team} position={position} size={size} showName={showName} showTeam={showTeam} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div data-testid={`headshot-${name.replace(/\s+/g, "-").toLowerCase()}`} style={{ width: size, height: size, borderRadius, overflow: "hidden", border: `2px solid ${colors.secondary}44`, boxShadow: `0 0 0 1px ${colors.primary}55, 0 3px 12px rgba(0,0,0,0.55)`, background: `${colors.primary}33`, flexShrink: 0, position: "relative" }}>
        <img src={headshotUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }}
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            img.style.display = "none";
            const parent = img.parentElement;
            if (parent && !parent.querySelector(".headshot-fallback")) {
              const fallback = document.createElement("div");
              fallback.className = "headshot-fallback";
              fallback.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 40% 35%,${colors.primary}EE,${colors.primary}88);font-family:'Barlow Condensed',sans-serif;font-size:${size * 0.32}px;font-weight:800;color:${colors.secondary}CC;`;
              fallback.textContent = name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
              parent.appendChild(fallback);
            }
          }}
        />
      </div>
      {showName && <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: size * 0.22, fontWeight: 700, color: T.text, textAlign: "center", lineHeight: 1.2, maxWidth: size + 20, wordBreak: "break-word" }}>{name?.split(" ").slice(-1)[0]}</div>}
      {showTeam && <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: size * 0.18, fontWeight: 700, color: T.textFaint, letterSpacing: "0.1em", textTransform: "uppercase" }}>{team}</div>}
    </div>
  );
}

export function ConfidenceBar({ value, width = 60, height = 4 }: { value: number; width?: number|string; height?: number }) {
  const color = value >= 85 ? T.gold : value >= 70 ? "#FFD166" : value >= 55 ? T.orange : T.textFaint;
  return (
    <div style={{ width, height, background: "rgba(255,255,255,0.08)", borderRadius: height }}>
      <div style={{ width: `${Math.min(value, 100)}%`, height: "100%", background: color, borderRadius: height, transition: "width 0.4s ease" }} />
    </div>
  );
}

export const VERDICT_COLORS: Record<string, string> = {
  confirmed: T.green, likely: T.gold, rumor: T.orange, contradicted: T.danger, review: T.textFaint,
};

export function VerdictBadge({ verdict }: { verdict: string }) {
  const color = VERDICT_COLORS[verdict] ?? T.textFaint;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 2, background: `${color}18`, border: `1px solid ${color}44`, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color }}>
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: color, display: "inline-block" }} />
      {verdict}
    </span>
  );
}

export const TYPE_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  injury:           { bg: "rgba(255,82,82,0.16)",   color: "#FF5252", label: "INJURY"    },
  injury_update:    { bg: "rgba(255,82,82,0.16)",   color: "#FF5252", label: "INJURY"    },
  line_move:        { bg: "rgba(0,230,118,0.14)",  color: "#00E676", label: "LINE MOVE" },
  matchup_edge:     { bg: "rgba(245,184,65,0.14)",  color: "#F5B841", label: "MATCHUP"   },
  rotation:         { bg: "rgba(0,183,255,0.14)",  color: "#00B7FF", label: "ROTATION"  },
  prop:             { bg: "rgba(255,138,0,0.16)",  color: "#FF8A00", label: "PROP"      },
  news:             { bg: "rgba(100,116,139,0.14)",  color: "#94A3B8", label: "NEWS"      },
  trend:            { bg: "rgba(0,183,255,0.12)",  color: "#00B7FF", label: "TREND"     },
  lineup:           { bg: "rgba(0,183,255,0.12)",  color: "#00B7FF", label: "LINEUP"    },
  batting_order:    { bg: "rgba(0,183,255,0.12)",  color: "#00B7FF", label: "LINEUP"    },
  lineup_confirm:   { bg: "rgba(0,183,255,0.12)",  color: "#00B7FF", label: "LINEUP"    },
  pitcher:          { bg: "rgba(0,183,255,0.14)",  color: "#00B7FF", label: "PITCHER"   },
  starting_pitcher: { bg: "rgba(0,183,255,0.14)",  color: "#00B7FF", label: "PITCHER"   },
  bullpen:          { bg: "rgba(0,183,255,0.12)",  color: "#00B7FF", label: "BULLPEN"   },
  weather:          { bg: "rgba(0,183,255,0.10)",  color: "#00B7FF", label: "WEATHER"   },
  sharp:            { bg: "rgba(245,184,65,0.14)",  color: "#F5B841", label: "SHARP"     },
  matchup:          { bg: "rgba(245,184,65,0.14)",  color: "#F5B841", label: "MATCHUP"   },
  transfer:         { bg: "rgba(0,183,255,0.14)",  color: "#AA66EE", label: "TRANSFER"  },
};

export function TypeChip({ type }: { type: string }) {
  const s = TYPE_COLORS[type] ?? { bg: "rgba(255,255,255,0.07)", color: T.textFaint, label: type?.toUpperCase().replace(/_/g, " ") ?? "SIGNAL" };
  return (
    <span style={{ display: "inline-flex", padding: "2px 7px", borderRadius: 2, background: s.bg, color: s.color, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap", border: `1px solid ${s.color}22` }}>
      {s.label}
    </span>
  );
}

interface GameCardProps { away: string; home: string; time: string; series?: string; spread: string; total: string; status?: "upcoming"|"live"|"final"; onClick?: () => void; compact?: boolean; }
export function GameCard({ away, home, time, series, spread, total, status = "upcoming", onClick, compact = false }: GameCardProps) {
  const awayColors = getTeamColors(away);
  const homeColors = getTeamColors(home);
  const isLive = status === "live";
  return (
    <div onClick={onClick} data-testid={`game-card-${away}-${home}`} style={{ background: T.surface2, border: `1px solid ${isLive ? "rgba(0,230,118,0.32)" : T.border}`, borderRadius: 5, overflow: "hidden", cursor: onClick ? "pointer" : "default", transition: "border-color 0.15s, transform 0.12s", position: "relative", flexShrink: 0 }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = "rgba(245,184,65,0.4)"; el.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = isLive ? "rgba(0,230,118,0.32)" : T.border; el.style.transform = "translateY(0)"; }}
    >
      <div style={{ height: 3, background: `linear-gradient(90deg, ${awayColors.secondary}BB, ${awayColors.primary}66 40%, ${homeColors.primary}66 60%, ${homeColors.secondary}BB)` }} />
      <div style={{ padding: compact ? "10px 12px" : "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
            <TeamLogoImg abbr={away} size={compact ? 28 : 34} shape="circle" />
            <div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: compact ? 15 : 18, fontWeight: 800, color: T.text }}>{away}</div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textFaint, textTransform: "uppercase" }}>Away</div>
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, color: T.textFaint }}>@</div>
            {isLive && <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 3 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, display: "inline-block" }} /><span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.green, fontWeight: 700 }}>LIVE</span></div>}
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: compact ? 15 : 18, fontWeight: 800, color: T.text }}>{home}</div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textFaint, textTransform: "uppercase" }}>Home</div>
            </div>
            <TeamLogoImg abbr={home} size={compact ? 28 : 34} shape="circle" />
          </div>
        </div>
        {series && <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: T.gold, fontWeight: 700, textAlign: "center", marginBottom: 8, background: "rgba(245,184,65,0.06)", borderRadius: 2, padding: "2px 6px" }}>{series}</div>}
        <div style={{ display: "flex", gap: 6 }}>
          {[{ label: "Spread", val: spread, color: T.gold, bg: "rgba(245,184,65,0.06)", border: "rgba(245,184,65,0.14)" }, { label: "Total", val: `O/U ${total}`, color: T.text, bg: "rgba(255,255,255,0.04)", border: T.border }, { label: "Time", val: time, color: T.textMuted, bg: "rgba(255,255,255,0.03)", border: "transparent" }].map(s => (
            <div key={s.label} style={{ flex: 1, textAlign: "center", padding: "5px 8px", background: s.bg, borderRadius: 3, border: `1px solid ${s.border}` }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: compact ? 11 : 13, fontWeight: 700, color: s.color }}>{s.val}</div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textFaint, textTransform: "uppercase", marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   FeaturedEdgeCard — THE MONEY SHOT
   Left panel = full team primary color, rich and unmissable.
   DAL = navy. LAL = purple. CHI = red. MIA = dark red.
   This is the war room card. Bold. Immediate. Alive.
══════════════════════════════════════════════════════════════ */
interface FeaturedEdgeProps {
  signal: { headline: string; detail: string; action_takeaway: string; verdict: string; confidence: number; sources: number; type: string; player?: string; team: string; opponent?: string; timestamp: string; tags: string[]; };
  sport?: "NBA"|"MLB";
}
export function FeaturedEdgeCard({ signal, sport = "NBA" }: FeaturedEdgeProps) {
  const teamColors = getTeamColors(signal.team);
  const vColor = VERDICT_COLORS[signal.verdict] ?? T.textFaint;
  const accentColor = sport === "NBA" ? "#00B7FF" : "#00B7FF";

  return (
    <div data-testid="featured-edge-card" style={{ position: "relative", overflow: "hidden", borderRadius: 0, background: T.surface2, border: "none" }}>
      <div style={{ display: "flex" }}>

        {/* LEFT PANEL — FULL RICH TEAM COLOR — the hero visual */}
        <div style={{
          width: 128,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: "18px 0",
          position: "relative",
          overflow: "hidden",
          background: teamColors.primary,
          borderRight: `2px solid ${teamColors.secondary}44`,
        }}>
          {/* Diagonal secondary color slash */}
          <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, background: `radial-gradient(circle, ${teamColors.secondary}25, transparent 70%)`, pointerEvents: "none" }} />
          {/* Bottom fade */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 40, background: `linear-gradient(to top, rgba(0,0,0,0.4), transparent)`, pointerEvents: "none" }} />

          <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            {signal.player
              ? <PlayerHeadshot name={signal.player} team={signal.team} size={64} shape="circle" />
              : <TeamLogoImg abbr={signal.team} size={64} shape="circle" sport={sport === "MLB" ? "mlb" : "nba"} />
            }
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: "3px", color: teamColors.secondary, textShadow: "0 1px 4px rgba(0,0,0,0.7)", lineHeight: 1 }}>
              {signal.team}
            </div>
          </div>
        </div>

        {/* RIGHT CONTENT */}
        <div style={{ flex: 1, padding: "15px 17px", background: `linear-gradient(135deg, ${teamColors.primary}20 0%, ${teamColors.primary}0A 40%, transparent 65%)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7, flexWrap: "wrap" }}>
            <span style={{ padding: "2px 8px", background: `${accentColor}18`, border: `1px solid ${accentColor}44`, borderRadius: 2, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: accentColor }}>⚡ Featured Edge</span>
            <VerdictBadge verdict={signal.verdict} />
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textFaint }}>{signal.timestamp}</span>
          </div>

          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, fontWeight: 700, color: T.text, lineHeight: 1.3, marginBottom: 6, letterSpacing: "0.02em" }}>
            {signal.headline}
          </div>

          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: T.textMuted, lineHeight: 1.5, marginBottom: 9 }}>
            {signal.detail.slice(0, 130)}…
          </div>

          <div style={{ background: "rgba(245,184,65,0.07)", border: "1px solid rgba(245,184,65,0.2)", borderRadius: 2, padding: "7px 10px", marginBottom: 9 }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.gold, marginRight: 6 }}>Action →</span>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, color: T.text }}>{signal.action_takeaway.slice(0, 100)}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 21, color: vColor, lineHeight: 1 }}>{signal.confidence}%</span>
            <div style={{ flex: 1 }}><ConfidenceBar value={signal.confidence} width="100%" height={4} /></div>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint }}>
              {signal.sources} src · {signal.tags.slice(0, 2).join(" · ")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MatchupCardProps { away: string; home: string; time: string; spread: string; total: string; series?: string; signalCount?: number; status?: "upcoming"|"live"|"final"; accentColor?: string; onClick?: () => void; }
export function MatchupCard({ away, home, time, spread, total, series, signalCount, status = "upcoming", accentColor = T.gold, onClick }: MatchupCardProps) {
  const awayC = getTeamColors(away);
  const homeC = getTeamColors(home);
  const isLive = status === "live";
  return (
    <div onClick={onClick} data-testid={`matchup-card-${away}-${home}`} style={{ background: T.surface2, borderRadius: 6, overflow: "hidden", border: `1px solid ${isLive ? "rgba(245,184,65,0.45)" : T.border}`, cursor: onClick ? "pointer" : "default", transition: "transform 0.12s", flexShrink: 0 }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}
    >
      <div style={{ height: 52, background: `linear-gradient(90deg, ${awayC.primary}DD 0%, ${awayC.primary}55 45%, ${homeC.primary}55 55%, ${homeC.primary}DD 100%)`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <TeamLogoImg abbr={away} size={32} shape="circle" />
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 900, color: T.text, textShadow: "0 1px 4px rgba(0,0,0,0.7)" }}>{away}</span>
        </div>
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 700, color: isLive ? T.green : T.textFaint }}>@</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexDirection: "row-reverse" }}>
          <TeamLogoImg abbr={home} size={32} shape="circle" />
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 900, color: T.text, textShadow: "0 1px 4px rgba(0,0,0,0.7)" }}>{home}</span>
        </div>
      </div>
      <div style={{ height: 2, background: `linear-gradient(90deg, ${awayC.secondary}99, ${homeC.secondary}99)` }} />
      <div style={{ padding: "10px 12px" }}>
        {series && <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, color: accentColor, textAlign: "center", marginBottom: 8 }}>{series}</div>}
        <div style={{ display: "flex", gap: 5 }}>
          {[{ label: "SPREAD", val: spread, color: T.gold, bg: "rgba(245,184,65,0.07)" }, { label: "TOTAL", val: `O/U ${total}`, color: T.text, bg: "rgba(255,255,255,0.04)" }, { label: "TIME", val: time, color: T.textMuted, bg: "rgba(255,255,255,0.03)" }].map(s => (
            <div key={s.label} style={{ flex: 1, textAlign: "center", padding: "5px 6px", background: s.bg, borderRadius: 3, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, color: s.color, lineHeight: 1.1 }}>{s.val}</div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint, textTransform: "uppercase", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
        {signalCount !== undefined && signalCount > 0 && <div style={{ marginTop: 7, textAlign: "center" }}><span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, color: accentColor, background: `${accentColor}10`, padding: "2px 8px", borderRadius: 2 }}>⚡ {signalCount} signal{signalCount !== 1 ? "s" : ""}</span></div>}
      </div>
    </div>
  );
}

interface IntelCardProps { headline: string; detail: string; action?: string; verdict?: string; confidence?: number; sources?: number; player?: string; team: string; opponent?: string; timestamp?: string; tags?: string[]; sport?: "NBA"|"MLB"; accentColor?: string; }
export function IntelCard({ headline, detail, action, verdict, confidence, sources, player, team, opponent, timestamp, tags = [], sport = "NBA", accentColor }: IntelCardProps) {
  const teamColors = getTeamColors(team);
  const oppColors = opponent ? getTeamColors(opponent) : null;
  const accent = accentColor ?? (sport === "NBA" ? T.gold : "#00B7FF");
  const vColor = verdict ? (VERDICT_COLORS[verdict] ?? T.textFaint) : null;
  return (
    <div style={{ background: T.surface1, borderRadius: 6, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
      <div style={{ position: "relative", overflow: "hidden", background: `linear-gradient(135deg, ${teamColors.primary}CC 0%, ${teamColors.primary}44 50%, ${oppColors ? oppColors.primary + "33" : "transparent"} 100%)`, padding: "16px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${accent}, transparent)` }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative", zIndex: 1 }}>
          {player ? <PlayerHeadshot name={player} team={team} size={52} shape="circle" /> : <div style={{ display: "flex" }}><TeamLogoImg abbr={team} size={48} />{opponent && <div style={{ marginLeft: -10 }}><TeamLogoImg abbr={opponent} size={36} /></div>}</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            {player ? <><div style={{ fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.2, marginBottom: 3 }}>{player}</div><span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textFaint, letterSpacing: "0.1em", textTransform: "uppercase" }}>{team}{opponent ? ` vs ${opponent}` : ""}</span></> : <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: "0.04em", textTransform: "uppercase" }}>{team}{opponent ? ` @ ${opponent}` : ""}</div>}
          </div>
          {verdict && <VerdictBadge verdict={verdict} />}
        </div>
      </div>
      {confidence !== undefined && <div style={{ padding: "8px 14px 0" }}><ConfidenceBar value={confidence} width="100%" height={4} /></div>}
      <div style={{ padding: "12px 14px 14px" }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.4, marginBottom: 8, letterSpacing: "0.02em" }}>{headline}</div>
        <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.65, marginBottom: 8 }}>{detail}</div>
        {action && <div style={{ background: `${accent}09`, border: `1px solid ${accent}25`, borderRadius: 4, padding: "9px 12px" }}><div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: accent, marginBottom: 4 }}>⚡ Action Takeaway</div><div style={{ fontSize: 13, color: T.text, lineHeight: 1.55 }}>{action}</div></div>}
      </div>
    </div>
  );
}

interface SignalRowVisualProps { player?: string; team: string; opponent?: string; size?: number; }
export function SignalRowVisual({ player, team, opponent, size = 28 }: SignalRowVisualProps) {
  if (player) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <PlayerHeadshot name={player} team={team} size={size} shape="circle" />
        <div>
          <div style={{ fontSize: 12, color: T.text, fontWeight: 600, lineHeight: 1.2 }}>{player.split(" ").slice(-1)[0]}</div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint, letterSpacing: "0.08em", textTransform: "uppercase" }}>{team}</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <TeamLogoImg abbr={team} size={size} />
      {opponent && <><span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, color: T.textFaint }}>@</span><TeamLogoImg abbr={opponent} size={size - 4} /></>}
      {!opponent && <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: T.textMuted, fontWeight: 700, letterSpacing: "0.06em" }}>{team}</div>}
    </div>
  );
}

export default {};
