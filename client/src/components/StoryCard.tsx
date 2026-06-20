import type React from "react";
import { Fragment } from "react";
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

// North Star: verified → "Verified" (never show % on verified stories)
// escalating (70–89%) → amber, developing (<70%) → info blue
export function confidenceDisplay(overlay: EdgeSetterOverlayData): { text: string; tone: ConfidenceTone } {
  const confidence = overlay.confidence?.current;
  const verified = overlay.escalationState === "Official" || (typeof confidence === "number" && confidence >= 100);
  if (verified) return { text: "Verified", tone: "verified" };
  if (typeof confidence !== "number") return { text: "Developing", tone: "forming" };
  const rounded = Math.round(confidence);
  if (rounded >= 85) return { text: `${rounded}% escalating`, tone: "strong" };
  if (rounded >= 70) return { text: `${rounded}% escalating`, tone: "developing" };
  return { text: `${rounded}% developing`, tone: "forming" };
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

export function StoryCard({ story, variant = "feature", className, copyVariant = "legacy" }: StoryCardProps) {
  const publicCopy = copyVariant === "public";
  const displayStory = publicCopy ? sanitizePublicStory(story) : story;
  const isLead = variant === "lead";
  const confidenceRead = confidenceDisplay(displayStory.overlay);
  const agentsAgree = agentsFromOverlay(displayStory.overlay);
  const freshness = displayStory.overlay.timing?.freshnessLabel;
  const sourceCount = displayStory.overlay.sourceSummary?.count ?? 0;

  const timingAdvantage = buildTimingAdvantageNode(displayStory);

  // ── Lead card ──────────────────────────────────────────────────────────────
  // Athletic layer: serif headline + prose body copy.
  // Bloomberg layer: confidence journey + source/agent counts always visible, no click required.
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

        {/* ── Sports story copy (The Athletic layer) ── */}
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

        {/* ── Intelligence strip (Bloomberg layer) — ALWAYS VISIBLE, NO CLICK REQUIRED ── */}
        {/* North Star: source count, ES Agent count, agreement status, confidence journey all visible without interaction */}
        <div className="story-intel-strip">
          <ConfidenceJourney overlay={displayStory.overlay} situation={displayStory.situation} />
          <div className="story-intel-meta">
            <span className="story-intel-sources-count">
              {sourceCount} {sourceCount === 1 ? "source" : "sources"} tracked
            </span>
            <i className="story-intel-sep" aria-hidden="true">·</i>
            <span className="story-intel-agents-count">
              {agentsAgree} ES Agent{agentsAgree !== 1 ? "s" : ""} monitoring
            </span>
            {displayStory.overlay.sourceSummary?.convergence && (
              <>
                <i className="story-intel-sep" aria-hidden="true">·</i>
                <span className="story-intel-agreement">
                  {sourceAgreementLabel(displayStory.overlay.sourceSummary.convergence)}
                </span>
              </>
            )}
            {/* North Star: timing advantage in intel strip — THIS DISPLAY MUST NEVER BE REMOVED. */}
            {displayStory.timingAdvantageLead && (
              <>
                <i className="story-intel-sep" aria-hidden="true">·</i>
                <span className="story-intel-timing-edge">⚡ {displayStory.timingAdvantageLead} early</span>
              </>
            )}
          </div>
        </div>

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

// North Star: timing advantage callout — names source type for CFB where taxonomy exists.
function buildTimingAdvantageNode(story: StoryCardData): React.ReactNode | null {
  const lead = story.timingAdvantageLead;
  if (!lead) return null;
  if (story.league === "CFB" && story.situation?.sources?.length) {
    const src = story.situation.sources[0];
    const isSid = /sid|official|athletic.?dept/i.test(`${src?.type ?? ""} ${src?.name ?? ""}`);
    if (isSid) return <>⚡ EdgeSetter detected via SID post — pickup {lead} later</>;
  }
  if (story.timingAdvantageKind === "pickup") return <>⚡ Detected {lead} before national pickup</>;
  return <>⚡ EdgeSetter flagged {lead} before public confirmation</>;
}

function ConfidenceJourney({ overlay, situation }: {
  overlay: EdgeSetterOverlayData;
  situation?: IntelligenceSituation | null;
}) {
  const esc = overlay.escalationState ?? "Monitoring";
  const isVerified = esc === "Official" || (overlay.confidence?.current ?? 0) >= 100;
  const isEscalating = esc === "Escalating" || esc === "Significant" || esc === "Confirming" || esc === "Emerging";

  const firstSeen = situation?.timing.firstSeen;
  const escalatingEntry = situation?.timeline.find(
    (e) => e.state === "Escalating" || e.state === "Significant" || e.state === "Confirming",
  );
  const verifiedEntry = situation?.timeline.find((e) => e.state === "Official");

  const nodes: Array<{ label: string; time?: string; state: "complete" | "active" | "waiting" }> = [
    { label: "Detected", time: firstSeen ? formatJourneyTime(firstSeen) : undefined, state: "complete" },
    {
      label: "Escalating",
      time: escalatingEntry?.at ? formatJourneyTime(escalatingEntry.at) : undefined,
      state: isVerified ? "complete" : isEscalating ? "active" : "waiting",
    },
    {
      label: "Verified",
      time: verifiedEntry?.at ? formatJourneyTime(verifiedEntry.at) : undefined,
      state: isVerified ? "complete" : "waiting",
    },
  ];

  return (
    <div className="conf-journey" aria-label="Confidence journey">
      {nodes.map((node, i) => (
        <Fragment key={node.label}>
          <div className={`conf-journey-node is-${node.state}`}>
            <div className="conf-journey-dot" />
            {node.time
              ? <time className="conf-journey-time">{node.time}</time>
              : <span className="conf-journey-time conf-journey-time-blank">—</span>}
            <span className="conf-journey-label">{node.label}</span>
          </div>
          {i < nodes.length - 1 && (
            <div className={`conf-journey-line${nodes[i + 1].state !== "waiting" ? " is-filled" : ""}`} aria-hidden="true" />
          )}
        </Fragment>
      ))}
    </div>
  );
}

function formatJourneyTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function sourceAgreementLabel(convergence?: string | null): string {
  const norm = (convergence ?? "").toLowerCase();
  if (norm.includes("official")) return "Official confirmed";
  if (norm.includes("corroborate") || norm.includes("consensus") || norm.includes("confirmed")) return "Sources agree";
  if (norm.includes("single")) return "Single source";
  if (norm.includes("await")) return "Pending";
  return "Sources checked";
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
