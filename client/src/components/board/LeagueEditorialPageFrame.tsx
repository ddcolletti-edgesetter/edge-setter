import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowUpRight, Bell, CheckCircle2, Eye, Clock3 } from "lucide-react";

import { AgentCalibrationBadge } from "@/components/AgentCalibration";
import { Button } from "@/components/ui/button";
import { resolveSportsImageAsset } from "@/lib/sportsImageAssets";
import { hasCleanPublicTeamIdentity, hasCleanPublicText, publicFallbackLabel } from "@/lib/publicDisplayHygiene";
import { cn } from "@/lib/utils";
import type { SituationStoryCardData } from "./boardAdapters";

export type EditorialQuickLink = {
  id: string;
  label: string;
  detail?: string;
  active?: boolean;
  onClick?: () => void;
};

export type EditorialHeadlineItem = {
  id: string;
  headline: string;
  meta?: string;
  onClick?: () => void;
};

export type EditorialConversionPrompt = {
  title: string;
  body: string;
  bullets: string[];
  ctaLabel: string;
  onClick?: () => void;
};

interface LeagueEditorialPageFrameProps {
  league: "MLB" | "NBA";
  quickLinks: EditorialQuickLink[];
  headlines: EditorialHeadlineItem[];
  lead: ReactNode;
  brandLine?: string;
  conversion?: EditorialConversionPrompt;
  children?: ReactNode;
  className?: string;
}

interface EditorialLeadStoryProps {
  story: SituationStoryCardData;
  quiet?: boolean;
  onOpen?: () => void;
  onEvidence?: () => void;
}

export function LeagueEditorialPageFrame({ league, quickLinks, headlines, lead, brandLine = "Sports intelligence before the market catches up", conversion, children, className }: LeagueEditorialPageFrameProps) {
  return (
    <section className={cn("league-editorial-page-frame grid min-w-0 gap-3 xl:grid-cols-[190px_minmax(0,1fr)_300px]", className)}>
      <header className="col-span-full min-w-0 rounded-md border border-border bg-card/80 px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <img src="/brand/edgesetter-logo.png" alt="EdgeSetter" className="h-8 w-auto shrink-0 sm:h-9" />
          <div className="min-w-0 flex-1">
            <span className="data-label text-primary">EdgeSetter {league}</span>
            <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{brandLine}</p>
          </div>
          <span className="rounded border border-primary/25 bg-primary/10 px-2 py-1 text-[0.66rem] font-bold uppercase tracking-widest text-primary">
            Live story desk
          </span>
        </div>
      </header>

      <aside className="order-2 min-w-0 rounded-md border border-border/70 bg-card/65 p-3 xl:order-1 xl:sticky xl:top-4 xl:self-start">
        <span className="data-label text-primary">{league} Watch</span>
        <div className="mt-2 grid gap-1.5">
          {quickLinks.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={link.onClick}
              className={cn(
                "min-w-0 rounded border px-2 py-2 text-left transition-colors",
                link.active
                  ? "border-primary/45 bg-primary/10 text-foreground"
                  : "border-border bg-muted/10 text-muted-foreground hover:border-border/80 hover:bg-muted/20 hover:text-foreground",
              )}
            >
              <strong className="block truncate text-sm font-bold">{link.label}</strong>
              {link.detail && <span className="mt-0.5 block truncate text-[0.7rem] font-semibold">{link.detail}</span>}
            </button>
          ))}
        </div>
      </aside>

      <div className="order-1 min-w-0 xl:order-2">
        {lead}
        {children}
      </div>

      <aside className="order-3 min-w-0 rounded-md border border-border/70 bg-card/65 p-3 xl:sticky xl:top-4 xl:self-start">
        <div className="flex items-center justify-between gap-2">
          <span className="data-label text-primary">Top Watch Items</span>
          <span className="text-[0.68rem] font-bold uppercase tracking-widest text-muted-foreground">{headlines.length}</span>
        </div>
        <div className="mt-2 divide-y divide-border/70">
          {headlines.map((rawItem) => {
            const item = sanitizeHeadlineItem(rawItem, league);
            return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className="block w-full min-w-0 py-2.5 text-left hover:text-primary"
            >
              <strong className="block break-words text-sm font-bold leading-snug text-foreground">{item.headline}</strong>
              {item.meta && <span className="mt-1 block truncate text-[0.72rem] font-semibold text-muted-foreground">{item.meta}</span>}
            </button>
          );})}
        </div>
        {conversion && (
          <div className="mt-3 rounded-md border border-primary/25 bg-primary/5 p-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <strong className="min-w-0 text-sm font-bold text-foreground">{conversion.title}</strong>
            </div>
            <p className="mt-2 break-words text-[0.8rem] font-medium leading-snug text-muted-foreground">{conversion.body}</p>
            <div className="mt-2 grid gap-1.5">
              {conversion.bullets.slice(0, 3).map((bullet) => (
                <div key={bullet} className="flex min-w-0 items-start gap-1.5 text-[0.72rem] font-semibold leading-snug text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>{bullet}</span>
                </div>
              ))}
            </div>
            <Button type="button" size="sm" className="mt-3 w-full" onClick={conversion.onClick}>
              {conversion.ctaLabel}
            </Button>
          </div>
        )}
      </aside>
    </section>
  );
}

export function EditorialLeadStory({ story, quiet, onOpen, onEvidence }: EditorialLeadStoryProps) {
  story = sanitizeEditorialStory(story);
  const identity = story.row.sportsIdentity;
  const imageAsset = resolveSportsImageAsset({
    league: story.league,
    sport: identity?.sport,
    team: story.primaryTeam,
    opponent: story.secondaryTeam,
    player: story.player,
    storyType: story.storyType,
    slot: "featured",
  });
  const leadImageCandidates = leadEditorialImageCandidates(story, imageAsset.candidateSrcs);
  const relatedItems = story.relatedItems?.length
    ? story.relatedItems
    : [story.whatHappened, story.whyItMatters, story.watchNext].filter(Boolean);

  return (
    <article className="editorial-lead-story overflow-hidden rounded-md border border-border bg-card/90 shadow-[0_18px_46px_rgba(0,0,0,0.22)]">
      <EditorialImage
        candidateSrcs={leadImageCandidates}
        alt={imageAsset.alt}
        league={story.league}
        className="h-[210px] sm:h-[280px] lg:h-[320px]"
      />

      <div className="min-w-0 p-4 sm:p-5 lg:p-6">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="section-kicker text-primary">{story.sectionTitle ?? story.league ?? "Lead Story"}</span>
          {story.matchup && <span className="truncate text-[0.76rem] font-bold text-muted-foreground">{story.matchup}</span>}
          {story.timestamp && (
            <span className="ml-auto inline-flex min-w-0 items-center gap-1 truncate text-[0.72rem] font-semibold text-muted-foreground tabular-nums">
              <Clock3 className="h-3.5 w-3.5" />
              {story.timestamp}
            </span>
          )}
        </div>

        <h1 className="mt-2 max-w-4xl break-words font-sans text-3xl font-black leading-[0.98] text-foreground sm:text-4xl">
          {story.headline}
        </h1>
        {story.dek && (
          <p className="mt-2.5 max-w-3xl break-words text-base font-medium leading-relaxed text-muted-foreground">
            {story.dek}
          </p>
        )}

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <StoryPoint label="What happened" value={story.whatHappened} />
          <StoryPoint label="Why it matters" value={story.whyItMatters} />
          <StoryPoint label="Watch next" value={story.watchNext} />
        </div>

        <div className="mt-3 border-t border-border/70 pt-3">
          <span className="data-label text-primary">Related Watch Items</span>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {relatedItems.slice(0, 4).map((item) => (
              <p key={item} className="min-w-0 border-l border-border/80 bg-muted/5 py-1.5 pl-3 pr-2 text-[0.82rem] font-semibold leading-snug text-foreground">
                {item}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-border/70 bg-muted/10 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="data-label mr-1 text-primary">EdgeSetter Intelligence</span>
          <ProofPill label="Confidence" value={story.confidence ?? (quiet ? "Monitoring" : "Still forming")} />
          <ProofPill label="Reports" value={story.sourceCount ? `${story.sourceCount} reports` : story.verification ?? "Check pending"} />
          <ProofPill label="Timing" value={story.timing ?? "Monitoring"} />
          <ProofPill label="Evidence" value={story.evidence ?? (quiet ? "No elevated story yet" : "Review attached")} />
          <AgentCalibrationBadge
            compact
            copyVariant="editorial"
            input={{
              confidence: parseConfidence(story.confidence),
              sourceCount: story.sourceCount,
              timingLabel: story.timing,
              storyType: story.storyType,
              marketReaction: story.market,
              sourceSummary: story.verification,
            }}
          />
          <div className="ml-auto flex min-w-0 flex-wrap gap-1.5">
            {onEvidence && (
              <Button type="button" size="sm" variant="ghost" onClick={onEvidence}>
                <Eye className="h-4 w-4" />
                View Evidence
              </Button>
            )}
            {(onOpen || story.ctaLabel) && (
              <Button type="button" size="sm" variant="outline" onClick={onOpen}>
                <ArrowUpRight className="h-4 w-4" />
                {story.ctaLabel ?? "Open Story"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function sanitizeHeadlineItem(item: EditorialHeadlineItem, league: string): EditorialHeadlineItem {
  return {
    ...item,
    headline: hasCleanPublicText(item.headline) ? item.headline : publicFallbackLabel(item.headline, league),
    meta: hasCleanPublicText(item.meta) ? item.meta : "Watch item",
  };
}

function sanitizeEditorialStory(story: SituationStoryCardData): SituationStoryCardData {
  const headlineFallback = publicFallbackLabel(`${story.headline} ${story.storyType}`, story.league ?? "Sports");
  return {
    ...story,
    headline: hasCleanPublicText(story.headline) ? story.headline : headlineFallback,
    dek: hasCleanPublicText(story.dek) ? story.dek : "EdgeSetter is monitoring source support, timing, and sports context before elevating this item.",
    matchup: hasCleanPublicText(story.matchup) ? story.matchup : undefined,
    primaryTeam: hasCleanPublicTeamIdentity(story.primaryTeam) ? story.primaryTeam : undefined,
    secondaryTeam: hasCleanPublicTeamIdentity(story.secondaryTeam) ? story.secondaryTeam : undefined,
    player: hasCleanPublicText(story.player) ? story.player : undefined,
    storyType: hasCleanPublicText(story.storyType) ? story.storyType : headlineFallback,
    whatHappened: hasCleanPublicText(story.whatHappened) ? story.whatHappened : "A watch item changed enough to stay on the board.",
    whyItMatters: hasCleanPublicText(story.whyItMatters) ? story.whyItMatters : "The sports impact is still developing.",
    edgeSetterKnows: hasCleanPublicText(story.edgeSetterKnows) ? story.edgeSetterKnows : "Source support and timing remain under watch.",
    watchNext: hasCleanPublicText(story.watchNext) ? story.watchNext : "Watch for source support, official confirmation, and context movement.",
    relatedItems: story.relatedItems?.filter((item) => hasCleanPublicText(item)),
  };
}

function EditorialImage({ candidateSrcs, alt, league, className }: { candidateSrcs: string[]; alt: string; league?: string; className?: string }) {
  const candidateKey = candidateSrcs.join("|");
  const candidates = useMemo(() => Array.from(new Set(candidateSrcs)), [candidateKey]);
  const [imageIndex, setImageIndex] = useState(0);
  const activeSrc = candidates[imageIndex];
  const exhausted = imageIndex >= candidates.length;
  const posterStyle = activeSrc && !exhausted
    ? {
        backgroundImage: `linear-gradient(135deg, rgba(245,184,65,0.24), rgba(15,23,42,0.34)), url("${activeSrc}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : undefined;

  useEffect(() => {
    setImageIndex(0);
  }, [candidateKey]);

  useEffect(() => {
    if (!activeSrc || exhausted || typeof document === "undefined") return;
    const existing = document.head.querySelector(`link[data-edgesetter-lead-image="${activeSrc}"]`);
    if (existing) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = activeSrc;
    link.setAttribute("fetchpriority", "high");
    link.setAttribute("data-edgesetter-lead-image", activeSrc);
    document.head.appendChild(link);
  }, [activeSrc, exhausted]);

  return (
    <div
      className={cn("relative min-w-0 overflow-hidden bg-[linear-gradient(135deg,rgba(245,184,65,0.2),rgba(15,23,42,0.72)),radial-gradient(circle_at_50%_45%,rgba(248,250,252,0.2),transparent_34%)]", className)}
      style={posterStyle}
    >
      {activeSrc && !exhausted ? (
        <img
          src={activeSrc}
          alt={alt}
          className="relative z-[1] h-full w-full object-cover opacity-100"
          loading="eager"
          decoding="sync"
          ref={(node) => node?.setAttribute("fetchpriority", "high")}
          onError={() => setImageIndex((current) => current + 1)}
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,rgba(245,184,65,0.22),rgba(15,23,42,0.82)),radial-gradient(circle_at_50%_45%,rgba(248,250,252,0.18),transparent_34%)] text-sm font-bold text-foreground">
          {league ? `${league} editorial image` : "Sports editorial image"}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-background/20 via-transparent to-transparent" />
    </div>
  );
}

function leadEditorialImageCandidates(story: SituationStoryCardData, candidates: string[]) {
  const league = story.league?.toLowerCase();
  const leagueEditorial = league
    ? [
        `/sports/${league}/featured-lead.jpg`,
        `/sports/${league}/featured.jpg`,
        `/sports/${league}/hero.jpg`,
        `/sports/${league}/default.jpg`,
      ]
    : [];
  const nonTeamCandidates = candidates.filter((src) => !src.includes("/sports/teams/"));
  const teamCandidates = candidates.filter((src) => src.includes("/sports/teams/"));
  return Array.from(new Set([...leagueEditorial, ...nonTeamCandidates, ...teamCandidates, "/sports/default.jpg"]));
}

function StoryPoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-l border-border/80 bg-muted/5 py-1.5 pl-3 pr-2">
      <span className="data-label text-[0.62rem]">{label}</span>
      <p className="mt-1 break-words text-[0.84rem] font-semibold leading-snug text-foreground">{value}</p>
    </div>
  );
}

function ProofPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded border border-border bg-card/70 px-2 py-1 text-[0.68rem] font-bold text-muted-foreground">
      <span className="data-label text-[0.56rem]">{label}</span>
      <strong className="truncate text-foreground">{value}</strong>
    </span>
  );
}

function parseConfidence(value?: string) {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace("%", ""));
  return Number.isNaN(parsed) ? null : parsed;
}
