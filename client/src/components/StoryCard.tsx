import type React from "react";
import { Fragment } from "react";
import { Link } from "wouter";

import { EdgeSetterOverlay, type EdgeSetterOverlayData } from "@/components/EdgeSetterOverlay";
import { SportsStoryVisual, leagueToSport } from "@/components/SportsMedia";
import type { IntelligenceSituation } from "@/lib/intelligenceSituationsApi";
import type { SportsImageAsset } from "@/lib/sportsImageAssets";
import { hasCleanPublicTeamIdentity, hasCleanPublicText, publicFallbackLabel } from "@/lib/publicDisplayHygiene";
import { publicConfidenceLabel } from "@/lib/storyLanguage";
import { cn } from "@/lib/utils";
import type { LeadCardSlots } from "@/lib/leadCardSlots";
import { TeamLogoImg, type TeamLogoSport } from "@/components/v2/SportVisuals";

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
  /** The lead card's six spec'd slots. Only the lead variant reads it. */
  leadSlots?: LeadCardSlots;
}

interface StoryCardProps {
  story: StoryCardData;
  variant?: "lead" | "feature" | "rail" | "compact";
  className?: string;
  copyVariant?: "legacy" | "public";
  /**
   * When true (homepage flag on), confidence displays render the shared
   * verification word instead of a raw percentage. Threaded down to the
   * EdgeSetterOverlay so the whole card reads one evidence-grounded word.
   */
  verificationStateEnabled?: boolean;
}

type ConfidenceTone = "verified" | "strong" | "developing" | "forming" | "pending";

// North Star: verified → "Verified" (never show % on verified stories)
// escalating (70–89%) → amber, developing (<70%) → info blue
//
// When verificationStateEnabled is on and a pre-computed verification word is
// attached, we surface that word directly (no percentage) — the flag-off path
// keeps the legacy percentage lineage untouched.
export function confidenceDisplay(
  overlay: EdgeSetterOverlayData,
  verificationStateEnabled = false,
): { text: string; tone: ConfidenceTone } {
  if (verificationStateEnabled && overlay.verification) {
    const state = overlay.verification.state;
    const tone: ConfidenceTone = state === "Verified" ? "verified" : state === "Escalating" ? "strong" : "forming";
    return { text: state, tone };
  }
  const confidence = overlay.confidence?.current;
  const verified = overlay.escalationState === "Official" || (typeof confidence === "number" && confidence >= 100);
  if (verified) return { text: "Verified", tone: "verified" };
  if (typeof confidence !== "number") return { text: "Developing", tone: "forming" };
  const rounded = Math.round(confidence);
  const label = publicConfidenceLabel(rounded);
  if (rounded >= 85) return { text: label, tone: "strong" };
  if (rounded >= 70) return { text: label, tone: "developing" };
  return { text: label, tone: "forming" };
}

export function StoryCard({ story, variant = "feature", className, copyVariant = "legacy", verificationStateEnabled = false }: StoryCardProps) {
  const publicCopy = copyVariant === "public";
  const displayStory = publicCopy ? sanitizePublicStory(story) : story;
  const isLead = variant === "lead";
  const freshness = displayStory.overlay.timing?.freshnessLabel;

  // ── Lead card ──────────────────────────────────────────────────────────────
  // Exactly the six slots of the approved build spec ("EdgeSetter lead story
  // card: build spec", Slots + Facts): Kicker, Matchup, Headline, Sentence
  // (never shown), Facts, Button. Content comes from story.leadSlots
  // (lib/leadCardSlots); nothing else on StoryCardData is read here. Anything
  // added to this card goes through the spec doc first.
  if (isLead) {
    const slots = story.leadSlots;
    const card = (
      <article className={cn("story-card story-card-lead story-card-lead-slots grid gap-3 rounded-lg border border-[#6fa4bf]/25 bg-[#0b1220]/80 p-4", className)} style={{ display: "grid", gap: 12, padding: 16 }} data-testid="homepage-lead-card">
        <div className="flex flex-wrap items-center gap-2 text-[0.7rem] font-extrabold uppercase tracking-[0.08em]" data-slot="kicker">
          <span className="text-[#34D17F]">{slots?.kicker.league ?? story.league}</span>
          {slots && (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 normal-case tracking-normal",
                slots.kicker.stale ? "border-[#94a3b8]/40 text-[#94a3b8]" : "border-[#F5B13D]/50 text-[#F5B13D]",
              )}
              data-slot="state-chip"
            >
              {slots.kicker.chip}
            </span>
          )}
          {slots?.kicker.age && <span className="font-semibold normal-case tracking-normal text-[#94a3b8]">{slots.kicker.age}</span>}
        </div>

        {slots?.matchup && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-slot="matchup">
            {slots.matchup.teams.map((team, index) => (
              <Fragment key={`${team.abbr}-${index}`}>
                {index > 0 && <span className="text-[0.75rem] font-bold text-[#64748b]">vs</span>}
                <span className="inline-flex items-center gap-2">
                  {story.league === "CFB" && team.name === team.abbr
                    ? <span className="inline-flex h-7 w-7 items-center justify-center rounded bg-[#334155] text-[0.6rem] font-black text-[#cbd5e1]">{team.abbr}</span>
                    : <TeamLogoImg abbr={team.abbr} size={28} sport={leagueToSport(story.league) as TeamLogoSport} fromGamesTable={story.league === "CFB"} />}
                  <span className="text-[0.95rem] font-bold text-[#e2e8f0]">{team.name}</span>
                </span>
              </Fragment>
            ))}
            {slots.matchup.time && <span className="ml-auto text-[0.78rem] font-semibold text-[#94a3b8]">{slots.matchup.time}</span>}
          </div>
        )}

        <h2 className="line-clamp-2" data-slot="headline">{slots?.headline ?? story.headline}</h2>

        {slots && slots.facts.length > 0 && (
          <dl className="grid gap-3 border-t border-[#6fa4bf]/20 pt-3" style={{ gridTemplateColumns: `repeat(${slots.facts.length}, minmax(0, 1fr))` }} data-slot="facts">
            {slots.facts.map((fact) => (
              <div key={fact.label} className="min-w-0">
                <dt className="text-[0.6rem] font-bold uppercase tracking-[0.07em] text-[#64748b]">{fact.label}</dt>
                <dd className="truncate text-[0.95rem] font-bold text-[#e2e8f0]">{fact.value}</dd>
                {fact.sub && <dd className="truncate text-[0.72rem] text-[#94a3b8]">{fact.sub}</dd>}
              </div>
            ))}
          </dl>
        )}

        {slots && (
          <Link href={slots.button.href} className="inline-flex w-full items-center justify-center rounded-md bg-[#F5B13D] px-4 py-2 text-[0.8rem] font-extrabold text-[#0b1220] sm:w-fit" data-slot="button">
            {slots.button.label}
          </Link>
        )}

        <p className="text-[0.72rem] text-[#94a3b8]" data-testid="homepage-lead-interim-note">
          Interim display: line and report count only. Status returns once sourcing is verified (#114).
        </p>
      </article>
    );
    return card;
  }

  // ── Non-lead variants (feature / rail / compact) ──────────────────────────
  // Rail (homepage "Developing now"): the same cuts as the lead card — no image
  // header, no What happened / Why it matters / Watch next. Not rendered, not
  // hidden. Feature and compact are unchanged.
  const isRail = variant === "rail";
  const card = (
    <article className={cn("story-card", `story-card-${variant}`, className)}>
      {!isRail && <div className="story-card-visual">
        <SportsStoryVisual
          league={displayStory.league}
          sport={leagueToSport(displayStory.league)}
          primaryTeam={displayStory.primaryTeam}
          secondaryTeam={displayStory.secondaryTeam}
          player={displayStory.player}
          title={displayStory.headline}
          storyType={displayStory.storyType ?? displayStory.label ?? "Developing story"}
          detail={displayStory.detail ?? displayStory.watchNext}
          size={variant === "compact" ? "compact" : "feature"}
          imageAsset={displayStory.imageAsset}
        />
      </div>}

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
        <div className="story-card-context">
          {[displayStory.league, displayStory.primaryTeam && displayStory.secondaryTeam ? `${displayStory.primaryTeam} @ ${displayStory.secondaryTeam}` : displayStory.primaryTeam, displayStory.player, displayStory.storyType].filter(Boolean).join(" / ") || "Sports context"}
        </div>
        {displayStory.dek && <p>{displayStory.dek}</p>}

        {!isRail && <div className="story-card-reads">
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
        </div>}

        {/* Rail confidence chip ("Strong pattern match") removed: it reads a hardcoded confidence prior. */}
      </div>

      {/* decorations={false}: no header ("Developing · EdgeSetter review"), replay line, calibration badge or pattern match. */}
      <EdgeSetterOverlay data={displayStory.overlay} situation={displayStory.situation} compact={variant === "rail" || variant === "compact"} copyVariant={publicCopy ? "editorial" : "legacy"} verificationStateEnabled={verificationStateEnabled} decorations={false} />
      {/* "More impact context" removed: fixed fallback sentences. */}
    </article>
  );

  if (!displayStory.href) return card;
  return <Link href={displayStory.href}>{card}</Link>;
}

// Lead headline treatment: gold accent on the opening team/player name only.
// Text content is unchanged, so accessible names and copy tests are unaffected.
function sanitizePublicStory(story: StoryCardData): StoryCardData {
  const headlineFallback = publicFallbackLabel(`${story.headline} ${story.storyType}`, story.league);
  return {
    ...story,
    headline: hasCleanPublicText(story.headline) ? story.headline : headlineFallback,
    // Omitted rather than filled — both render sites below already guard on it.
    dek: hasCleanPublicText(story.dek) ? story.dek : undefined,
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
