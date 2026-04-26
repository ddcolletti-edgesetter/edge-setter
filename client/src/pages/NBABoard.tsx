import React, { useState, useMemo } from "react";
import V2Shell, { SportBadge, useShellTheme } from "../components/V2Shell";
import { NBA_SIGNALS, NBA_TONIGHT, type V2Signal } from "../data/v2MockData";
import { useNBASignals } from "../hooks/useSignals";
import { scoreAndRankSignals, selectFeaturedEdge, type SignalScore, type UrgencyLabel, SCORE_BANDS } from "../lib/signalScorer";
import {
  PlayerHeadshot, TeamLogoImg,
  MatchupCard, FeaturedEdgeCard, IntelCard,
  VerdictBadge, TypeChip, ConfidenceBar,
  SignalRowVisual,
  T, VERDICT_COLORS, getTeamColors,
} from "../components/v2/SportVisuals";
import { ChevronRight, X, Filter, Zap, TrendingUp, AlertCircle } from "lucide-react";
import { useSignalGate, FREE_LIMIT } from "../context/SignalGate";
import { ProRowOverlay, ProBoardBanner, ProActionGate } from "../components/ProGate";
import OutcomePanel from "../components/OutcomePanel";

const FILTERS = ["Today", "Players", "Teams", "Injuries", "Props", "Matchups", "Playoffs"] as const;
type FilterKey = typeof FILTERS[number];

function matchFilter(sig: V2Signal, filter: FilterKey): boolean {
  if (filter === "Today") return true;
  if (filter === "Injuries") return sig.type === "injury";
  if (filter === "Props") return sig.type === "prop";
  if (filter === "Matchups") return sig.type === "matchup_edge";
  if (filter === "Players") return !!sig.player;
  if (filter === "Teams") return !sig.player;
  if (filter === "Playoffs") return sig.tags.some(t =>
    ["playoffs","LAL","BOS","MIA","GSW","DEN","MIN","OKC","DAL","NYK","PHI"].includes(t));
  return true;
}

// Compute signal count per game for slate cards
function signalsForGame(away: string, home: string): number {
  return NBA_SIGNALS.filter(s =>
    s.team === away || s.team === home ||
    s.opponent === away || s.opponent === home
  ).length;
}

/* ── Enhanced Detail panel ── */
function DetailPanel({ sig, onClose }: { sig: V2Signal; onClose: () => void }) {
  const darkMode = useShellTheme();
  const TH = {
    surface1:  darkMode ? T.surface1  : "#FFFFFF",
    surface2:  darkMode ? T.surface2  : "#F5F1EB",
    goldDim:   darkMode ? T.goldDim   : "rgba(202,168,90,0.25)",
    border:    darkMode ? T.border    : "rgba(0,0,0,0.08)",
    text:      darkMode ? T.text      : "#1A1712",
    textMuted: darkMode ? T.textMuted : "#4A443C",
    textFaint: darkMode ? T.textFaint : "#8C8277",
  };
  const teamColors = getTeamColors(sig.team);
  const vColor = VERDICT_COLORS[sig.verdict] ?? TH.textFaint;

  return (
    <div
      data-testid="detail-panel"
      style={{
        width: "100%", maxWidth: 360, background: TH.surface1, borderLeft: `1px solid ${TH.goldDim}`,
        flexShrink: 0, display: "flex", flexDirection: "column", overflowY: "auto",
      }}
    >
      {/* Close */}
      <button onClick={onClose} style={{
        position: "absolute", top: 14, right: 14, zIndex: 10,
        background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%",
        color: TH.textMuted, cursor: "pointer", width: 28, height: 28,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <X size={13} />
      </button>

      {/* Hero band — tall with real headshot or team logo pair */}
      <div style={{
        position: "relative", overflow: "hidden",
        background: `linear-gradient(150deg, ${teamColors.primary}EE 0%, ${teamColors.primary}77 55%, transparent 100%)`,
        padding: sig.player ? "0 0 0 0" : "20px 20px 16px",
        borderBottom: `1px solid ${TH.border}`,
        minHeight: sig.player ? 160 : 100,
      }}>
        {/* Background glow */}
        <div style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(ellipse at 90% 50%, ${teamColors.secondary}22, transparent 60%)`,
          pointerEvents: "none",
        }} />
        {/* Gold accent stripe */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.gold}, ${T.gold}33)` }} />

        {sig.player ? (
          /* Player hero — headshot bleeds to top */
          <div style={{ display: "flex", alignItems: "flex-end", gap: 0, position: "relative", zIndex: 2, paddingBottom: 0 }}>
            {/* Large headshot */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div style={{
                width: 130, height: 155, overflow: "hidden",
                background: `${teamColors.primary}44`,
              }}>
                <img
                  src={`https://a.espncdn.com/i/headshots/nba/players/full/${
                    { "Anthony Davis": 6583, "Jaylen Brown": 6474, "Nikola Jokic": 3112335,
                      "Stephen Curry": 3975, "Giannis Antetokounmpo": 3032977,
                      "Ja Morant": 4395628, "Draymond Green": 2528210,
                      "Luka Dončić": 4066648, "Victor Wembanyama": 4432816,
                    }[sig.player as string] ?? 0
                  }.png`}
                  alt={sig.player}
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              </div>
              {/* Gradient fade at bottom of photo */}
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0, height: 60,
                background: `linear-gradient(to top, ${teamColors.primary}EE, transparent)`,
              }} />
            </div>

            {/* Identity */}
            <div style={{ flex: 1, padding: "20px 16px 16px 12px", position: "relative", zIndex: 2 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: TH.text, lineHeight: 1.2, marginBottom: 6 }}>{sig.player}</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                <TeamLogoImg abbr={sig.team} size={18} />
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 12, color: TH.textFaint, letterSpacing: "0.1em", textTransform: "uppercase",
                }}>{sig.team}{sig.opponent ? ` vs ${sig.opponent}` : ""}</span>
              </div>
              <VerdictBadge verdict={sig.verdict} />
            </div>
          </div>
        ) : (
          /* Team matchup hero */
          <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative", zIndex: 2 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <TeamLogoImg abbr={sig.team} size={54} />
              {sig.opponent && (
                <>
                  <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 18, color: TH.textFaint }}>@</span>
                  <TeamLogoImg abbr={sig.opponent} size={54} />
                </>
              )}
            </div>
            <div>
              <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 16, fontWeight: 800, color: TH.text, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 4 }}>
                {sig.team}{sig.opponent ? ` @ ${sig.opponent}` : ""}
              </div>
              <VerdictBadge verdict={sig.verdict} />
            </div>
          </div>
        )}
      </div>

      {/* Stats row */}
      {(() => {
        const scored = sig as any;
        const sc: SignalScore | undefined = scored._score;
        const URGENCY_COLORS: Record<UrgencyLabel, string> = { LIVE: T.danger, URGENT: T.orange, WATCH: T.gold, NOTE: TH.textFaint };
        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", background: TH.surface2, borderBottom: `1px solid ${TH.border}` }}>
              {[
                { label: "Verdict", value: sig.verdict.toUpperCase(), color: vColor },
                { label: "Confidence", value: `${sig.confidence}%`, color: sig.confidence >= 80 ? T.gold : TH.text },
                { label: "Sources", value: String(sig.sources), color: TH.text },
              ].map((s, i) => (
                <div key={s.label} style={{ padding: "10px 0", textAlign: "center", borderRight: i < 2 ? `1px solid ${TH.border}` : "none" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: s.color, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
                  <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: TH.textFaint, letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            {/* Score strip */}
            {sc && (
              <div style={{ background: darkMode ? "rgba(202,168,90,0.04)" : "rgba(202,168,90,0.06)", borderBottom: `1px solid ${TH.border}`, padding: "8px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: T.gold, fontVariantNumeric: "tabular-nums" }}>{sc.totalScore}</span>
                  <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: TH.textFaint }}>/100</span>
                </div>
                <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: URGENCY_COLORS[sc.urgencyLabel], background: `${URGENCY_COLORS[sc.urgencyLabel]}18`, borderRadius: 3, padding: "1px 7px" }}>{sc.urgencyLabel}</span>
                <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: sc.trustLabel === "Consensus" ? T.green : sc.trustLabel === "Corroborated" ? T.gold : TH.textFaint, background: "rgba(255,255,255,0.04)", borderRadius: 3, padding: "1px 7px" }}>{sc.trustLabel}</span>
                {sc.band && (
                  <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: SCORE_BANDS[sc.band].color, background: `${SCORE_BANDS[sc.band].color}18`, borderRadius: 3, padding: "1px 7px", border: `1px solid ${SCORE_BANDS[sc.band].color}40` }}>{SCORE_BANDS[sc.band].label}</span>
                )}
                <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: TH.textFaint, flex: 1 }}>Top factors: {sc.topFactors.join(", ")}</span>
              </div>
            )}
            {sc && (
              <div style={{ padding: "6px 14px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[
                  { k: "Conf", v: sc.breakdown.confidenceScore },
                  { k: "Src",  v: sc.breakdown.sourceQualityScore },
                  { k: "Fresh",v: sc.breakdown.recencyBonus },
                  { k: "Mkt",  v: sc.breakdown.marketImpactScore },
                  { k: "Rel",  v: sc.breakdown.relevanceScore },
                  { k: "Ctx",  v: sc.breakdown.contextScore },
                ].map(f => (
                  <div key={f.k} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: TH.textMuted, fontVariantNumeric: "tabular-nums" }}>{f.v.toFixed(1)}</div>
                    <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, color: TH.textFaint, letterSpacing: "0.1em" }}>{f.k.toUpperCase()}</div>
                  </div>
                ))}
              </div>
            )}
            {/* Why-this-score explanation */}
            {sc && sc.scoreExplanation && (
              <div style={{ padding: "8px 14px", borderTop: `1px solid ${TH.border}` }}>
                <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: TH.textFaint, marginBottom: 3 }}>Why This Score</div>
                <div style={{ fontSize: 12, color: TH.textMuted, lineHeight: 1.5 }}>{sc.scoreExplanation}</div>
                {sc.urgencyReason && (
                  <div style={{ fontSize: 11, color: TH.textFaint, marginTop: 3, fontStyle: "italic" }}>Urgency: {sc.urgencyReason}</div>
                )}
              </div>
            )}
          </>
        );
      })()}

      {/* Confidence bar */}
      <div style={{ padding: "10px 16px 0" }}>
        <ConfidenceBar value={sig.confidence} width="100%" height={5} />
      </div>

      {/* Body */}
      <div style={{ padding: "14px 16px", flex: 1 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          <TypeChip type={sig.type} />
          {sig.opponent && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <TeamLogoImg abbr={sig.team} size={16} />
              <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: TH.textFaint, letterSpacing: "0.06em", textTransform: "uppercase" }}>vs</span>
              <TeamLogoImg abbr={sig.opponent} size={16} />
            </div>
          )}
        </div>

        <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 15, fontWeight: 700, color: TH.text, lineHeight: 1.4, marginBottom: 12 }}>
          {sig.headline}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: TH.textFaint, marginBottom: 5 }}>Signal Detail</div>
          <div style={{ fontSize: 14, color: TH.textMuted, lineHeight: 1.65 }}>{sig.detail}</div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: TH.textFaint, marginBottom: 5 }}>Why It Matters</div>
          <div style={{ fontSize: 14, color: TH.textMuted, lineHeight: 1.65 }}>{sig.why_it_matters}</div>
        </div>

        <ProActionGate sport="NBA" actionText={sig.action_takeaway} darkMode={darkMode}>
          <div style={{
            background: "rgba(202,168,90,0.07)", border: `1px solid rgba(202,168,90,0.22)`,
            borderRadius: 4, padding: "12px 14px",
          }}>
            <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.gold, marginBottom: 6 }}>
              ⚡ Action Takeaway
            </div>
            <div style={{ fontSize: 14, color: TH.text, lineHeight: 1.65, fontWeight: 500 }}>{sig.action_takeaway}</div>
          </div>
        </ProActionGate>

        {/* ── Outcome + CLV (only renders when outcome exists) ── */}
        {(sig as any)._live && <OutcomePanel signalId={sig.id} darkMode={darkMode} />}

        {/* ── Source metadata ── */}
        {(sig.sourceLabels?.length || sig.sourceTypes?.length || sig.confirmationStrength) && (
          <div style={{
            background: `${TH.border}`, borderRadius: 4, padding: "10px 12px", marginTop: 12,
          }}>
            <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: TH.textFaint, marginBottom: 6 }}>
              Source Coverage
            </div>
            {sig.sourceLabels && sig.sourceLabels.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: sig.confirmationStrength ? 6 : 0 }}>
                {sig.sourceLabels.map(label => (
                  <span key={label} style={{
                    fontSize: 11, color: TH.textMuted, background: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                    borderRadius: 3, padding: "2px 7px", fontWeight: 500,
                  }}>{label}</span>
                ))}
              </div>
            )}
            {sig.confirmationStrength && (
              <div style={{ fontSize: 11, color: sig.confirmationStrength === "consensus" ? T.green : sig.confirmationStrength === "corroborated" ? T.gold : TH.textFaint, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", marginTop: 2 }}>
                {sig.confirmationStrength === "consensus" ? "✓ Consensus" : sig.confirmationStrength === "corroborated" ? "◎ Corroborated" : "△ Single source"}
              </div>
            )}
          </div>
        )}

        {/* ── Line movement ── */}
        {sig.lineMovement && (
          <div style={{
            background: "rgba(76,175,130,0.07)", border: "1px solid rgba(76,175,130,0.18)",
            borderRadius: 4, padding: "10px 12px", marginTop: 10,
          }}>
            <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: T.green, marginBottom: 6 }}>Line Movement</div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: TH.textMuted }}><span style={{ color: TH.textFaint }}>Open:</span> {sig.lineMovement.open}</span>
              <span style={{ color: TH.textFaint }}>→</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.green }}>{sig.lineMovement.current}</span>
            </div>
            {sig.lineMovement.note && (
              <div style={{ fontSize: 11, color: TH.textFaint, marginTop: 5 }}>{sig.lineMovement.note}</div>
            )}
          </div>
        )}

        {/* ── Rotation / matchup intel ── */}
        {(sig.rotationNote || sig.matchupEdge) && (
          <div style={{ marginTop: 10 }}>
            {sig.rotationNote && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: TH.textFaint, marginBottom: 4 }}>Rotation Intel</div>
                <div style={{ fontSize: 13, color: TH.textMuted, lineHeight: 1.5 }}>{sig.rotationNote}</div>
              </div>
            )}
            {sig.matchupEdge && (
              <div>
                <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: TH.textFaint, marginBottom: 4 }}>Matchup Edge</div>
                <div style={{ fontSize: 13, color: TH.textMuted, lineHeight: 1.5 }}>{sig.matchupEdge}</div>
              </div>
            )}
          </div>
        )}

        {/* ── Relevance flags ── */}
        {(sig.bettingRelevance || sig.fantasyRelevance) && (
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            {sig.bettingRelevance && (
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.gold, background: "rgba(202,168,90,0.12)", borderRadius: 3, padding: "2px 8px" }}>Betting Signal</span>
            )}
            {sig.fantasyRelevance && (
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.cyan, background: "rgba(74,168,200,0.12)", borderRadius: 3, padding: "2px 8px" }}>Fantasy Impact</span>
            )}
          </div>
        )}

        {/* Tags with team logos inline */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 12, alignItems: "center" }}>
          {sig.tags.map(tag => {
            const isTeam = tag.length <= 3 && tag === tag.toUpperCase();
            return isTeam ? (
              <div key={tag} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <TeamLogoImg abbr={tag} size={14} />
                <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: TH.textFaint }}>{tag}</span>
              </div>
            ) : (
              <span key={tag} style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                color: TH.textFaint, padding: "2px 6px",
                background: `${TH.border}`, borderRadius: 2,
              }}>{tag}</span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Playoff context band — shows active series for each game ── */
function PlayoffContextBand() {
  const darkMode = useShellTheme();
  const TH = {
    surface1:  darkMode ? T.surface1  : "#FFFFFF",
    surface2:  darkMode ? T.surface2  : "#F5F1EB",
    goldDim:   darkMode ? T.goldDim   : "rgba(202,168,90,0.25)",
    border:    darkMode ? T.border    : "rgba(0,0,0,0.08)",
    text:      darkMode ? T.text      : "#1A1712",
    textMuted: darkMode ? T.textMuted : "#4A443C",
    textFaint: darkMode ? T.textFaint : "#8C8277",
  };
  const series = [
    { away: "LAL", home: "GSW", record: "LAL leads 3-2", game: "G6 Tonight" },
    { away: "MIA", home: "BOS", record: "BOS leads 3-1", game: "G5 Tonight" },
    { away: "MIN", home: "DEN", record: "Tied 2-2", game: "G5 Tonight" },
  ];
  return (
    <div style={{
      display: "flex", gap: 8, padding: "10px 20px",
      borderBottom: `1px solid ${TH.border}`,
      background: "rgba(202,168,90,0.03)",
      overflowX: "auto",
      flexShrink: 0,
    }}>
      <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.gold, marginRight: 4, whiteSpace: "nowrap", alignSelf: "center" }}>
        🏆 Playoffs
      </div>
      {series.map(s => (
        <div key={s.away + s.home} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 10px", borderRadius: 3,
          background: TH.surface2, border: "1px solid rgba(202,168,90,0.12)",
          flexShrink: 0,
        }}>
          <TeamLogoImg abbr={s.away} size={18} />
          <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: TH.textFaint }}>@</span>
          <TeamLogoImg abbr={s.home} size={18} />
          <div style={{ marginLeft: 2 }}>
            <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, color: TH.text, letterSpacing: "0.04em" }}>{s.record}</div>
            <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: T.gold, letterSpacing: "0.06em" }}>{s.game}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Main page ── */
export default function NBABoard() {
  return <V2Shell boardsMode><NBABoardInner /></V2Shell>;
}

function NBABoardInner() {
  const darkMode = useShellTheme();
  const { rowIsFree } = useSignalGate();
  // Theme-aware token overrides (dark is T defaults; light gets warmer palette)
  const TH = {
    bg:        darkMode ? T.bg        : "#F0ECE4",
    surface1:  darkMode ? T.surface1  : "#FFFFFF",
    surface2:  darkMode ? T.surface2  : "#F5F1EB",
    surface3:  darkMode ? T.surface3  : "#EDE9E2",
    goldDim:   darkMode ? T.goldDim   : "rgba(202,168,90,0.25)",
    border:    darkMode ? T.border    : "rgba(0,0,0,0.08)",
    text:      darkMode ? T.text      : "#1A1712",
    textMuted: darkMode ? T.textMuted : "#4A443C",
    textFaint: darkMode ? T.textFaint : "#8C8277",
  };

  const [activeFilter, setActiveFilter] = useState<FilterKey>("Today");
  const [selected, setSelected] = useState<V2Signal | null>(null);
  const [gameFilter, setGameFilter] = useState<string | null>(null);

  // Live signals — falls back to mocks if API unavailable
  const { signals: liveSignals, isLive, error: liveError } = useNBASignals(NBA_SIGNALS);

  // Use live signals; they already carry _score from server — scoreAndRankSignals
  // will sort by _score.totalScore when _score is present, so this is a no-op sort.
  const rankedSignals = useMemo(() => {
    const src = (liveSignals as V2Signal[]).map(s => ({ ...s, sport: "NBA" as const }));
    return src.some(s => (s as any)._score)
      ? [...src].sort((a, b) => ((b as any)._score?.totalScore ?? 0) - ((a as any)._score?.totalScore ?? 0))
      : scoreAndRankSignals(src);
  }, [liveSignals]);

  const filtered = rankedSignals.filter(s =>
    matchFilter(s as V2Signal, activeFilter) &&
    (gameFilter === null || s.team === gameFilter || s.opponent === gameFilter || s.tags.includes(gameFilter))
  );
  const featured = rankedSignals[0] ?? null;

  return (
    <>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .sig-row:hover { background: rgba(202,168,90,0.04) !important; }
        .sig-row:hover .sig-headline { color: #F3EFE6 !important; }
      `}</style>

      <div className="board-main-wrap" style={{ display: "flex", height: "100%", minHeight: "calc(100vh - 48px)" }}>

        {/* ─── Board subnav ─── */}
        <aside className="board-subnav" style={{
          width: 196, background: TH.surface1, borderRight: `1px solid ${TH.goldDim}`,
          flexShrink: 0, padding: "16px 10px", overflowY: "auto",
        }}>
          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
            color: TH.textFaint, padding: "0 8px", marginBottom: 10,
          }}>NBA Board</div>

          {/* Signal Stream — sets filter to Today (shows all) */}
          {([
            { label: "Signal Stream",    filter: "Today" as FilterKey,    icon: <Zap size={11} /> },
            { label: "Injury Reports",   filter: "Injuries" as FilterKey, icon: <AlertCircle size={11} /> },
            { label: "Matchup Edges",    filter: "Matchups" as FilterKey, icon: <TrendingUp size={11} /> },
            { label: "Playoff Tracker",  filter: "Playoffs" as FilterKey, icon: <ChevronRight size={11} /> },
          ] as { label: string; filter: FilterKey; icon: React.ReactNode }[]).map(({ label, filter, icon }) => {
            const isActive = activeFilter === filter;
            return (
              <button
                key={label}
                onClick={() => { setActiveFilter(filter); setSelected(null); }}
                aria-pressed={isActive}
                style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", marginBottom: 1,
                  borderRadius: 3,
                  background: isActive ? "rgba(202,168,90,0.07)" : "transparent",
                  color: isActive ? T.gold : TH.textMuted, cursor: "pointer",
                  transition: "background 0.12s, color 0.12s",
                  width: "100%", textAlign: "left", border: "none",
                  borderLeft: `2px solid ${isActive ? T.gold : "transparent"}`,
                }}
                onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = "rgba(202,168,90,0.04)"; (e.currentTarget as HTMLButtonElement).style.color = TH.text; } }}
                onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = TH.textMuted; } }}
              >
                <span style={{ opacity: isActive ? 1 : 0.5, display: "flex", flexShrink: 0 }}>{icon}</span>
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 14, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
                }}>{label}</span>
              </button>
            );
          })}

          {/* Static section labels — no action yet */}
          <div style={{ margin: "10px 0 4px", padding: "0 10px" }}>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
              color: TH.textFaint, opacity: 0.5, userSelect: "none",
            }}>Coming Soon</div>
          </div>
          {["Line Movement", "Rotation Notes"].map(label => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", marginBottom: 1,
              color: TH.textFaint, opacity: 0.45, cursor: "default", userSelect: "none",
            }}>
              <ChevronRight size={10} style={{ flexShrink: 0 }} />
              <span style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 13, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase",
              }}>{label}</span>
            </div>
          ))}

          <div style={{ margin: "16px 0 10px", borderTop: `1px solid ${TH.goldDim}` }} />

          <div style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
            color: TH.textFaint, padding: "0 8px", marginBottom: 8,
          }}>Quick Teams</div>

          {["LAL", "BOS", "DEN", "GSW", "MIA", "OKC", "NYK", "MIN"].map(tm => {
            const isTeamActive = gameFilter === tm;
            return (
              <button
                key={tm}
                className="team-btn-mob"
                onClick={() => setGameFilter(gf => gf === tm ? null : tm)}
                aria-label={`Filter signals for ${tm}`}
                aria-pressed={isTeamActive}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 3,
                  width: "100%", background: isTeamActive ? "rgba(202,168,90,0.09)" : "transparent",
                  border: `1px solid ${isTeamActive ? "rgba(202,168,90,0.3)" : "transparent"}`,
                  cursor: "pointer", transition: "background 0.1s, border-color 0.1s",
                }}
                onMouseEnter={e => { if (!isTeamActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(202,168,90,0.05)"; }}
                onMouseLeave={e => { if (!isTeamActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                <TeamLogoImg abbr={tm} size={22} />
                <span style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 14, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                  color: isTeamActive ? T.gold : TH.textMuted,
                }}>{tm}</span>
              </button>
            );
          })}
        </aside>

        {/* ─── Main canvas ─── */}
        <div className="board-main-col" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

          {/* Board header */}
          <div style={{
            padding: "12px 20px", borderBottom: `1px solid ${TH.border}`,
            display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
            background: TH.surface1,
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 17, fontWeight: 700, color: TH.text }}>
                  NBA Intelligence Board
                </span>
                <SportBadge status="LIVE" />
              </div>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 13, color: TH.textFaint, letterSpacing: "0.04em",
              }}>
                {isLive ? "Live" : "Cached"} · {rankedSignals.length} signals · Updated continuously
              </div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {[
                { label: "Total", value: rankedSignals.length, color: TH.text },
                { label: "Confirmed", value: rankedSignals.filter(s => s.verdict === "confirmed").length, color: T.green },
                { label: "High Conf", value: rankedSignals.filter(s => s.confidence >= 80).length, color: T.gold },
              ].map(stat => (
                <div key={stat.label} style={{
                  textAlign: "center", padding: "6px 14px",
                  background: TH.surface2, border: `1px solid ${TH.border}`, borderRadius: 3,
                }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: stat.color, fontVariantNumeric: "tabular-nums" }}>{stat.value}</div>
                  <div style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 10, color: TH.textFaint, letterSpacing: "0.12em", textTransform: "uppercase",
                  }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Playoff context band */}
          <PlayoffContextBand />

          {/* ── Tonight's Slate — MatchupCards ── */}
          <div style={{
            padding: "12px 20px 14px", borderBottom: `1px solid ${TH.border}`,
            flexShrink: 0, overflowX: "auto",
          }}>
            <div style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
              color: TH.textFaint, marginBottom: 10,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.gold, display: "inline-block" }} />
              Tonight's NBA Slate
              <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 12, color: T.gold, marginLeft: 4 }}>· Playoffs</span>
            </div>
            <div className="board-slate-strip" style={{ display: "flex", gap: 12 }}>
              {NBA_TONIGHT.map(game => (
                <div key={game.id} className="board-slate-card" style={{ width: 248, flexShrink: 0 }}>
                  <MatchupCard
                    away={game.away} home={game.home}
                    time={game.time} series={game.series}
                    spread={game.spread} total={game.total}
                    signalCount={signalsForGame(game.away, game.home)}
                    accentColor={T.gold}
                    onClick={() => setGameFilter(gf => gf === game.away || gf === game.home ? null : game.away)}
                  />
                  {(gameFilter === game.away || gameFilter === game.home) && (
                    <div style={{ marginTop: 5, padding: "3px 8px", background: "rgba(202,168,90,0.08)", borderRadius: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, color: T.gold, fontWeight: 700 }}>Filtering: {game.away} @ {game.home}</span>
                      <button onClick={() => setGameFilter(null)} style={{ background: "none", border: "none", color: TH.textFaint, cursor: "pointer", fontSize: 13, lineHeight: 1 }}>×</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Featured Edge ── */}
          <div style={{ padding: "14px 20px 0", flexShrink: 0 }}>
            <FeaturedEdgeCard signal={featured} sport="NBA" />
          </div>

          {/* ── Filter chips ── */}
          <div style={{
            padding: "12px 20px", borderBottom: `1px solid ${TH.border}`,
            display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap",
            marginTop: 14,
          }}>
            <Filter size={11} style={{ color: TH.textFaint, marginRight: 4 }} />
            {FILTERS.map(f => {
              const isActive = f === activeFilter;
              return (
                <button
                  key={f}
                  className="filter-chip"
                  data-testid={`filter-${f.toLowerCase()}`}
                  onClick={() => setActiveFilter(f)}
                  style={{
                    padding: "6px 13px", borderRadius: 2,
                    border: `1px solid ${isActive ? T.gold : "rgba(255,255,255,0.1)"}`,
                    background: isActive ? "rgba(202,168,90,0.1)" : "transparent",
                    color: isActive ? T.gold : TH.textMuted,
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 14, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
                    cursor: "pointer", transition: "all 0.12s",
                  }}
                >{f}</button>
              );
            })}
          </div>

          {/* Pro banner — locked signal count */}
          <ProBoardBanner
            freeCount={FREE_LIMIT}
            totalCount={filtered.length}
            sport="NBA"
            darkMode={darkMode}
          />

          {/* ── Signal table ── */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {/* Header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "36px 110px 1fr 130px 80px 80px 68px",
              padding: "6px 20px",
              background: TH.surface2,
              borderBottom: `1px solid ${TH.border}`,
            }}>
              {["", "Type", "Signal", "Player", "Verdict", "Conf", "Time"].map(h => (
                <div key={h} style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
                  color: TH.textFaint,
                }}>{h}</div>
              ))}
            </div>

            {filtered.map((sig, idx) => {
              const isSelected = selected?.id === sig.id;
              const isFree = rowIsFree(idx);
              const typeColor = {
                injury: T.danger, line_move: T.green, matchup_edge: T.gold,
                prop: T.orange, rotation: T.cyan, news: TH.textMuted, trend: T.cyan,
              }[(sig as any).type] ?? TH.textFaint;

              return (
                <div
                  key={sig.id}
                  className="sig-row sig-row-tap"
                  data-testid={`nba-signal-${sig.id}`}
                  onClick={() => isFree ? setSelected(isSelected ? null : sig) : undefined}
                  style={{
                    position: "relative",
                    display: "grid",
                    gridTemplateColumns: "36px 110px 1fr 130px 80px 80px 68px",
                    padding: "10px 20px",
                    borderBottom: `1px solid ${TH.border}`,
                    background: isSelected ? "rgba(202,168,90,0.055)" : "transparent",
                    cursor: isFree ? "pointer" : "default", alignItems: "center",
                    borderLeft: `3px solid ${isSelected ? T.gold : typeColor + "55"}`,
                    transition: "background 0.1s, border-left-color 0.1s",
                  }}
                >
                  {!isFree && <ProRowOverlay sport="NBA" />}
                  {/* Index */}
                  <div style={{
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                    fontSize: 11, color: TH.textFaint, fontVariantNumeric: "tabular-nums",
                  }}>{idx + 1}</div>

                  {/* Type chip */}
                  <div><TypeChip type={sig.type} /></div>

                  {/* Headline + sub */}
                  <div style={{ paddingRight: 14 }}>
                    <div className="sig-headline" style={{ fontSize: 15, color: TH.text, fontWeight: 500, lineHeight: 1.4, marginBottom: 4 }}>
                      {sig.headline}
                    </div>
                    <div style={{
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                      fontSize: 12, color: TH.textFaint, lineHeight: 1.45,
                    }}>
                      {sig.action_takeaway.slice(0, 72)}…
                    </div>
                  </div>

                  {/* Player / team visual — upgraded SignalRowVisual */}
                  <SignalRowVisual
                    player={sig.player}
                    team={sig.team}
                    opponent={sig.opponent}
                    size={28}
                  />

                  {/* Verdict */}
                  <VerdictBadge verdict={sig.verdict} />

                  {/* Confidence */}
                  <div>
                    <div style={{
                      fontSize: 15, fontWeight: 700, color: sig.confidence >= 80 ? T.gold : TH.textMuted,
                      fontVariantNumeric: "tabular-nums", marginBottom: 3,
                    }}>{sig.confidence}%</div>
                    <ConfidenceBar value={sig.confidence} width={50} height={3} />
                  </div>

                  {/* Time + score */}
                  <div style={{ textAlign: "right" }}>
                    {(() => {
                      const sc: SignalScore | undefined = (sig as any)._score;
                      const URGENCY_COLORS: Record<UrgencyLabel, string> = { LIVE: T.danger, URGENT: T.orange, WATCH: T.gold, NOTE: TH.textFaint };
                      return sc ? (
                        <>
                          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: URGENCY_COLORS[sc.urgencyLabel], marginBottom: 2 }}>{sc.urgencyLabel}</div>
                          <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 11, fontWeight: 700, color: T.gold }}>{sc.totalScore}</div>
                        </>
                      ) : null;
                    })()}
                    <div style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", fontSize: 10, color: TH.textFaint, marginTop: 1 }}>{sig.timestamp}</div>
                  </div>
                </div>
              );
            })}

            {/* Stub notice */}
            <div style={{
              margin: "16px 20px", padding: "10px 14px",
              background: "rgba(202,168,90,0.04)", border: `1px solid rgba(202,168,90,0.1)`, borderRadius: 4,
            }}>
              <div style={{
                fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
                fontSize: 11, color: TH.textFaint, lineHeight: 1.5,
              }}>
                {isLive
                ? <><strong style={{ color: T.green }}>LIVE DATA</strong> · {rankedSignals.length} signals from pipeline · Last fetch: just now · Click any row to open the intelligence detail panel →</>
                : <><strong style={{ color: T.gold }}>CACHED DATA</strong> · {rankedSignals.length} signals · {liveError ?? "API not returning data — showing mock fallback"}</>
              }
              </div>
            </div>
          </div>
        </div>

        {/* ─── Detail rail ─── */}
        {selected && (
          <div className="board-detail-rail" style={{ position: "relative" }}>
            <DetailPanel sig={selected} onClose={() => setSelected(null)} />
          </div>
        )}
      </div>
    </>
  );
}
