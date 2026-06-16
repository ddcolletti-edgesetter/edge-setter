import { useState, type MouseEvent } from "react";
import { Link } from "wouter";

import { EdgeSetterOverlay, type EdgeSetterOverlayData } from "@/components/EdgeSetterOverlay";
import { StoryImpactBlocks } from "@/components/StoryImpactBlocks";
import { SportsStoryVisual, leagueToSport } from "@/components/SportsMedia";
import type { IntelligenceSituation } from "@/lib/intelligenceSituationsApi";
import type { SportsImageAsset } from "@/lib/sportsImageAssets";
import { hasCleanPublicTeamIdentity, hasCleanPublicText, publicFallbackLabel } from "@/lib/publicDisplayHygiene";
import { cn } from "@/lib/utils";

export interface StoryCardData {
  id: string;
  league: string;
  headline: string;
  dek?: string;
  label?: string;
  href?: string;
  primaryTeam?: string;
  secondaryTeam?: string;
  player?: string;
  storyType?: string;
  detail?: string;
  whatChanged?: string;
  whyItMatters?: string;
  watchNext?: string;
  fantasyRelevance?: boolean | null;
  bettingRelevance?: boolean | null;
  dfsRelevance?: boolean | null;
  fantasyDetail?: string | null;
  bettingDetail?: string | null;
  dfsDetail?: string | null;
  overlay: EdgeSetterOverlayData;
  situation?: IntelligenceSituation | null;
  imageAsset?: SportsImageAsset | null;
  timingAdvantageLead?: string | null;
  timingAdvantageKind?: "confirmation" | "pickup" | null;
}

interface StoryCardProps {
  story: StoryCardData;
  variant?: "lead" | "feature" | "rail" | "compact";
  className?: string;
  copyVariant?: "legacy" | "public";
}

type ConfidenceTone = "verified" | "strong" | "developing" | "forming" | "pending";

/**
 * North Star confidence display rules:
 * verified → "100% verified" (teal), 85-99 → strong (teal), 70-84 → developing
 * (amber), under 70 → forming (muted). Never a percentage next to "confirmed".
 */
export function confidenceDisplay(overlay: EdgeSetterOverlayData): { text: string; tone: ConfidenceTone } {
  const confidence = overlay.confidence?.current;
  const verified = overlay.escalationState === "Official" || (typeof confidence === "number" && confidence >= 100);
  if (verified) return { text: "100% verified", tone: "verified" };
  if (typeof confidence !== "number") return { text: "Pending review", tone: "pending" };
  const rounded = Math.round(confidence);
  if (rounded >= 85) return { text: `${rounded}% strong`, tone: "strong" };
  if (rounded >= 70) return { text: `${rounded}% developing`, tone: "developing" };
  return { text: `${rounded}% forming`, tone: "forming" };
}

// Same agreement thresholds as the signal detail drawer (4-agent consensus).
function agentsFromOverlay(overlay: EdgeSetterOverlayData): number {
  const confidence = overlay.confidence?.current ?? 0;
  const sources = overlay.sourceSummary?.count ?? 0;
  if (overlay.escalationState === "Official") return 4;
  if (confidence >= 85 && sources >= 2) return 4;
  if (confidence >= 72 && sources >= 2) return 3;
  if (confidence >= 58 || sources >= 2) return 2;
  if (confidence > 0 || sources >= 1) return 1;
  return 0;
}

type LeadIntelPanel = "fantasy" | "sources" | "weakens";

export function StoryCard({ story, variant = "feature", className, copyVariant = "legacy" }: StoryCardProps) {
  const publicCopy = copyVariant === "public";
  const displayStory = publicCopy ? sanitizePublicStory(story) : story;
  const [openPanel, setOpenPanel] = useState<LeadIntelPanel | null>(null);
  // Lead card: intelligence zone is collapsed by default — user clicks teaser to expand
  const [intelExpanded, setIntelExpanded] = useState(false);
  const isLead = variant === "lead";
  const confidenceRead = confidenceDisplay(displayStory.overlay);
  const agentsAgree = agentsFromOverlay(displayStory.overlay);
  const freshness = displayStory.overlay.timing?.freshnessLabel;
  const sourceCount = displayStory.overlay.sourceSummary?.count ?? 0;

  const togglePanel = (panel: LeadIntelPanel) => (event: MouseEvent<HTMLButtonElement>) => {
    // The card is wrapped in a navigation link; intel actions expand in place.
    event.preventDefault();
    event.stopPropagation();
    setOpenPanel((current) => (current === panel ? null : panel));
  };

  const toggleIntel = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIntelExpanded((v) => !v);
  };

  const timingAdvantage = displayStory.timingAdvantageLead
    ? displayStory.timingAdvantageKind === "pickup"
      ? <>⚡ Detected {displayStory.timingAdvantageLead} before national pickup</>
      : <>⚡ EdgeSetter flagged {displayStory.timingAdvantageLead} before public confirmation</>
    : null;

  // ── Lead card ──────────────────────────────────────────────────────────────
  // Layout: image → copy (headline + dek + reads) → intelligence teaser strip
  // The teaser strip shows confidence + source count + timing edge inline.
  // Clicking it expands the full intelligence zone beneath.
  if (isLead) {
    const card = (
      <article className={cn("story-card story-card-lead", className)}>
        {/* ── Sports story visual ── */}
        <div className="story-card-visual">
          <SportsStoryVisual
            league={displayStory.league}
            sport={leagueToSport(displayStory.league)}
            primaryTeam={displayStory.primaryTeam}
            secondaryTeam={displayStory.secondaryTeam}
            player={displayStory.player}
            title={displayStory.headline}
            storyType={displayStory.storyType ?? displayStory.label ?? "Developing story"}
            detail={displayStory.detail ?? displayStory.watchNext}
            size="hero"
            imageAsset={displayStory.imageAsset}
          />
          {/* North Star: timing advantage — THIS DISPLAY MUST NEVER BE REMOVED. */}
          {timingAdvantage && (
            <div className="story-card-timing-advantage story-hero-timing-banner">{timingAdvantage}</div>
          )}
        </div>

        {/* ── Sports story copy ── */}
        <div className="story-card-copy">
          <div className="story-card-kicker">
            <span>{displayStory.league}</span>
            <i className="story-card-kicker-sep" aria-hidden="true">·</i>
            <strong>{displayStory.storyType ?? displayStory.label ?? "Developing story"}</strong>
            {freshness && (
              <>
                <i className="story-card-kicker-sep" aria-hidden="true">·</i>
                <small className="story-card-kicker-time">{freshness}</small>
              </>
            )}
          </div>
          <h2>{leadHeadlineNode(displayStory)}</h2>
          {displayStory.dek && <p className="story-lead-dek">{displayStory.dek}</p>}

          <div className="story-card-reads">
            {displayStory.whatChanged && (
              <div>
                <span>{publicCopy ? "What happened: " : "What changed: "}</span>
                <strong>{displayStory.whatChanged}</strong>
              </div>
            )}
            {displayStory.whyItMatters && (
              <div>
                <span>Why it matters: </span>
                <strong>{displayStory.whyItMatters}</strong>
              </div>
            )}
            {displayStory.watchNext && (
              <div>
                <span>Watch next: </span>
                <strong>{displayStory.watchNext}</strong>
              </div>
            )}
          </div>
        </div>

        {/* ── Intelligence teaser strip (always visible, no click required for key stats) ── */}
        {/* North Star: source count and agreement visible without clicking */}
        <div className="story-intel-teaser">
          <div className="story-intel-teaser-stats">
            <span className={`story-intel-teaser-conf is-${confidenceRead.tone}`}>
              {confidenceRead.tone === "verified" || confidenceRead.tone === "strong" ? "✓" : "◉"} {confidenceRead.text}
            </span>
            <span className="story-intel-teaser-sources">
              {sourceCount} {sourceCount === 1 ? "source" : "sources"}
              {sourceCount > 1 ? " · tracking" : " · attached"}
            </span>
            {agentsAgree > 0 && (
              <span className="story-intel-teaser-agents">
                {agentsAgree}/4 ES Agents
              </span>
            )}
            {displayStory.timingAdvantageLead && (
              <span className="story-intel-teaser-timing">
                ⚡ {displayStory.timingAdvantageLead} early
              </span>
            )}
          </div>
          <button
            type="button"
           className={`story-intel-teaser-toggle${intelExpanded ? " is-open" : ""}`}
data-testid="story-intel-toggle"
            onClick={toggleIntel}
            aria-expanded={intelExpanded}
            aria-label="EdgeSetter intelligence details"
          >
            EdgeSetter Intelligence {intelExpanded ? "▴" : "▾"}
          </button>
        </div>

        {/* ── Full intelligence zone (collapsed by default) ── */}
        {intelExpanded && (
          <div className="story-intel-zone">
            <div className="story-intel-zone-label">
              EdgeSetter Intelligence
              <span>What the agents found</span>
            </div>
            <div className="story-intel-stats">
              <div>
                <span>Confidence</span>
                <strong className={`story-card-conf is-${confidenceRead.tone}`}>{confidenceRead.text}</strong>
              </div>
              <div>
                <span>Sources</span>
                <strong>{sourceCount} attached</strong>
              </div>
              <div>
                <span>Timing edge</span>
                <strong>{displayStory.timingAdvantageLead ? `${displayStory.timingAdvantageLead} early` : "None yet"}</strong>
              </div>
              <div>
                <span>Line impact</span>
                <strong>{lineImpactLabel(displayStory)}</strong>
              </div>
            </div>
            <div className="story-intel-agents" aria-label={`${agentsAgree} of 4 ES Agents in agreement`}>
              {[0, 1, 2, 3].map((slot) => (
                <i key={slot} className={slot < agentsAgree ? "is-filled" : ""} />
              ))}
              <span>{agentsAgree} of 4 ES Agents agree</span>
            </div>
            <div className="story-intel-actions">
              <button type="button" className={openPanel === "fantasy" ? "is-open" : ""} onClick={togglePanel("fantasy")}>Fantasy</button>
              <button type="button" className={openPanel === "sources" ? "is-open" : ""} onClick={togglePanel("sources")}>Source trail</button>
              <button type="button" className={openPanel === "weakens" ? "is-open" : ""} onClick={togglePanel("weakens")}>Weakens if</button>
            </div>
            {openPanel && <p className="story-intel-panel">{intelPanelText(openPanel, displayStory)}</p>}
            <EdgeSetterOverlay data={displayStory.overlay} situation={displayStory.situation} compact={false} copyVariant={publicCopy ? "editorial" : "legacy"} />
            <StoryImpactBlocks
              compact={false}
              input={{
                text: [displayStory.headline, displayStory.dek, displayStory.whatChanged, displayStory.whyItMatters, displayStory.watchNext, displayStory.storyType].filter(Boolean).join(" "),
                fantasyRelevance: displayStory.fantasyRelevance,
                bettingRelevance: displayStory.bettingRelevance,
                dfsRelevance: displayStory.dfsRelevance,
                fantasyDetail: displayStory.fantasyDetail,
                bettingDetail: displayStory.bettingDetail,
                dfsDetail: displayStory.dfsDetail,
              }}
            />
          </div>
        )}
      </article>
    );

    if (!displayStory.href) return card;
    return <Link href={displayStory.href}>{card}</Link>;
  }

  // ── Non-lead variants (feature / rail / compact) — unchanged ──────────────
  const card = (
    <article className={cn("story-card", `story-card-${variant}`, className)}>
      <div className="story-card-visual">
        <SportsStoryVisual
          league={displayStory.league}
          sport={leagueToSport(displayStory.league)}
          primaryTeam={displayStory.primaryTeam}
          secondaryTeam={displayStory.secondaryTeam}
          player={displayStory.player}
          title={displayStory.headline}
          storyType={displayStory.storyType ?? displayStory.label ?? "Developing story"}
          detail={displayStory.detail ?? displayStory.watchNext}
          size={variant === "compact" || variant === "rail" ? "compact" : "feature"}
          imageAsset={displayStory.imageAsset}
        />
        {/* North Star: timing advantage — THIS DISPLAY MUST NEVER BE REMOVED. */}
      </div>

      <div className="story-card-copy">
        <div className="story-card-kicker">
          <span>{displayStory.league}</span>
          {" "}
          <strong>{displayStory.label ?? displayStory.storyType ?? "Developing story"}</strong>
          {freshness && (
            <small className="story-card-kicker-time">{freshness}</small>
          )}
        </div>
        <h2>{displayStory.headline}</h2>
        {/* North Star: timing advantage — THIS DISPLAY MUST NEVER BE REMOVED. */}
        {variant !== "rail" && timingAdvantage && (
          <div className="story-card-timing-advantage mt-1.5 inline-flex max-w-full flex-wrap items-center gap-1 rounded border border-[rgba(45,212,191,0.4)] bg-[rgba(45,212,191,0.08)] px-2 py-1 text-[0.72rem] font-extrabold leading-snug text-[#2DD4BF]">
            {timingAdvantage}
          </div>
        )}
        <div className="story-card-context">
          {[displayStory.league, displayStory.primaryTeam && displayStory.secondaryTeam ? `${displayStory.primaryTeam} @ ${displayStory.secondaryTeam}` : displayStory.primaryTeam, displayStory.player, displayStory.storyType].filter(Boolean).join(" / ") || "Sports context"}
        </div>
        {displayStory.dek && <p>{displayStory.dek}</p>}

        <div className="story-card-reads">
          {displayStory.whatChanged && (
            <div>
              <span>{publicCopy ? "What happened: " : "What changed: "}</span>
              <strong>{displayStory.whatChanged}</strong>
            </div>
          )}
          {displayStory.whyItMatters && (
            <div>
              <span>Why it matters: </span>
              <strong>{displayStory.whyItMatters}</strong>
            </div>
          )}
          {displayStory.watchNext && (
            <div>
              <span>Watch next: </span>
              <strong>{displayStory.watchNext}</strong>
            </div>
          )}
        </div>

        {variant === "rail" && (
          <div className="story-card-footer">
            <strong className={`story-card-conf is-${confidenceRead.tone}`}>{confidenceRead.text}</strong>
            <span className="story-card-agents">{agentsAgree}/4 ES Agents</span>
            {/* North Star: timing advantage — THIS DISPLAY MUST NEVER BE REMOVED. */}
            {timingAdvantage && confidenceRead.tone === "verified" && (
              <span className="story-card-timing-advantage story-card-timing-pill">
                ⚡ {displayStory.timingAdvantageLead} early
              </span>
            )}
          </div>
        )}
      </div>

      <EdgeSetterOverlay data={displayStory.overlay} situation={displayStory.situation} compact={variant === "rail" || variant === "compact"} copyVariant={publicCopy ? "editorial" : "legacy"} />
      <StoryImpactBlocks
        compact={variant === "rail" || variant === "compact"}
        input={{
          text: [displayStory.headline, displayStory.dek, displayStory.whatChanged, displayStory.whyItMatters, displayStory.watchNext, displayStory.storyType].filter(Boolean).join(" "),
          fantasyRelevance: displayStory.fantasyRelevance,
          bettingRelevance: displayStory.bettingRelevance,
          dfsRelevance: displayStory.dfsRelevance,
          fantasyDetail: displayStory.fantasyDetail,
          bettingDetail: displayStory.bettingDetail,
          dfsDetail: displayStory.dfsDetail,
        }}
      />
    </article>
  );

  if (!displayStory.href) return card;
  return <Link href={displayStory.href}>{card}</Link>;
}

// Lead headline treatment: gold accent on the opening team/player name only.
// Text content is unchanged, so accessible names and copy tests are unaffected.
function leadHeadlineNode(story: StoryCardData) {
  const headline = story.headline;
  const candidates = [story.player, story.primaryTeam].filter((name): name is string => Boolean(name && name.length > 1));
  for (const name of candidates) {
    if (headline.toLowerCase().startsWith(name.toLowerCase())) {
      return (
        <>
          <span className="story-headline-accent">{headline.slice(0, name.length)}</span>
          {headline.slice(name.length)}
        </>
      );
    }
  }
  return headline;
}

function lineImpactLabel(story: StoryCardData) {
  const reaction = story.situation?.marketReaction;
  if (!reaction) return "None yet";
  if (reaction.delta) return reaction.delta;
  if (reaction.open && reaction.current && reaction.open !== reaction.current) return `${reaction.open} → ${reaction.current}`;
  return "Reacting";
}

function intelPanelText(panel: LeadIntelPanel, story: StoryCardData) {
  if (panel === "fantasy") {
    if (hasCleanPublicText(story.fantasyDetail)) return story.fantasyDetail!;
    if (story.fantasyRelevance ?? story.situation?.raw.fantasy_relevance) {
      return "Role, usage, and availability context may change. Check exposure before lineups lock.";
    }
    return "No verified fantasy angle yet. The sports story is still the read.";
  }
  if (panel === "sources") {
    const count = story.overlay.sourceSummary?.count ?? 0;
    const convergence = story.overlay.sourceSummary?.convergence ?? "Source trail still developing";
    const names = (story.situation?.sources ?? [])
      .map((source) => source.name)
      .filter((name) => hasCleanPublicText(name))
      .slice(0, 4);
    const trail = names.length ? ` Trail: ${names.join(", ")}.` : "";
    return `${count} report${count === 1 ? "" : "s"} tracked. ${convergence}.${trail}`;
  }
  return "Conflicting reports, a stale source trail, or an official update that points the other way would lower this read's confidence.";
}

function sanitizePublicStory(story: StoryCardData): StoryCardData {
  const headlineFallback = publicFallbackLabel(`${story.headline} ${story.storyType}`, story.league);
  return {
    ...story,
    headline: hasCleanPublicText(story.headline) ? story.headline : headlineFallback,
    dek: hasCleanPublicText(story.dek) ? story.dek : "EdgeSetter is monitoring source support, timing, and sports context before elevating this item.",
    label: hasCleanPublicText(story.label) ? story.label : headlineFallback,
    primaryTeam: hasCleanPublicTeamIdentity(story.primaryTeam) ? story.primaryTeam : undefined,
    secondaryTeam: hasCleanPublicTeamIdentity(story.secondaryTeam) ? story.secondaryTeam : undefined,
    player: hasCleanPublicText(story.player) ? story.player : undefined,
    storyType: hasCleanPublicText(story.storyType) ? story.storyType : headlineFallback,
    detail: hasCleanPublicText(story.detail) ? story.detail : headlineFallback,
    whatChanged: hasCleanPublicText(story.whatChanged) ? story.whatChanged : "ES Agents flagged a change — details still developing.",
    whyItMatters: hasCleanPublicText(story.whyItMatters) ? story.whyItMatters : "Impact window is open. ES Agents are tracking.",
    watchNext: hasCleanPublicText(story.watchNext) && story.watchNext !== "public confirmation"
      ? story.watchNext
      : "Watch for source convergence and official movement.",
  };
}
