export type SportsImageSlotName = "hero" | "featured" | "drawer" | "matchup" | "quiet";

export interface SportsImageLookupInput {
  league?: string | null;
  sport?: string | null;
  team?: string | null;
  opponent?: string | null;
  player?: string | null;
  storyType?: string | null;
  slot?: SportsImageSlotName;
}

export interface SportsImageAsset {
  alt: string;
  candidateSrcs: string[];
  slot: SportsImageSlotName;
}

const SUPPORTED_LEAGUES = new Set(["mlb", "nba", "nfl", "cfb"]);

export function resolveSportsImageAsset(input: SportsImageLookupInput): SportsImageAsset {
  const league = normalizeLeague(input.league ?? input.sport);
  const slot = input.slot ?? "featured";

  const candidates = [
    league && `/sports/${league}/${slot}.jpg`,
    league && `/sports/${league}/default.jpg`,
    `/sports/${slot}.jpg`,
    "/sports/default.jpg",
  ].filter(Boolean) as string[];

  return {
    alt: buildSportsImageAlt(input, league, slot),
    candidateSrcs: Array.from(new Set(candidates)),
    slot,
  };
}

function normalizeLeague(value?: string | null) {
  const token = normalizeAssetToken(value);
  if (!token) return null;
  if (SUPPORTED_LEAGUES.has(token)) return token;
  if (token === "college-football" || token === "ncaaf") return "cfb";
  return token;
}

function normalizeAssetToken(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildSportsImageAlt(input: SportsImageLookupInput, league: string | null, slot: SportsImageSlotName) {
  const subject = [input.player, input.team, input.opponent].filter(Boolean).join(" / ");
  const context = input.storyType ?? slot.replace(/-/g, " ");
  const leagueLabel = (input.league ?? input.sport ?? league ?? "sports").toString().toUpperCase();
  return subject ? `${leagueLabel} ${context}: ${subject}` : `${leagueLabel} ${context} image`;
}
