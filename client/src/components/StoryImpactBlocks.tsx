import { publicStoryText } from "@/lib/storyLanguage";
import { cn } from "@/lib/utils";

export type StoryImpactInput = {
  text?: string | null;
  market?: string | null;
  fantasyRelevance?: boolean | null;
  bettingRelevance?: boolean | null;
  dfsRelevance?: boolean | null;
  fantasyDetail?: string | null;
  bettingDetail?: string | null;
  dfsDetail?: string | null;
};

export function hasStoryImpacts(input: StoryImpactInput) {
  return storyImpactSections(input).length > 0;
}

export function storyImpactSections(input: StoryImpactInput) {
  const text = `${input.text ?? ""} ${input.market ?? ""}`.toLowerCase();
  const hasFantasy = input.fantasyRelevance === true || /\b(fantasy|usage|minutes|rotation|starter|lineup|availability|injury|scratch|role|player prop|props)\b/.test(text);
  const hasBetting = input.bettingRelevance === true || /\b(betting|market|odds|line move|movement|spread|total|moneyline|pricing|number|props?)\b/.test(text);
  const hasDfs = input.dfsRelevance === true || /\bdfs\b/.test(text);

  return [
    hasFantasy ? {
      label: "Fantasy impact",
      value: cleanImpactText(input.fantasyDetail) || "Role, usage, availability, or lineup context can change projections once the team or player update is confirmed.",
    } : null,
    hasBetting ? {
      label: "Betting/market impact",
      value: cleanImpactText(input.bettingDetail ?? input.market) || "Market reaction is downstream context; compare it with the team, player, lineup, or injury update before treating it as signal.",
    } : null,
    hasDfs ? {
      label: "DFS angle",
      value: cleanImpactText(input.dfsDetail) || "DFS relevance depends on confirmed role, usage, salary, and lineup context.",
    } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;
}

export function StoryImpactBlocks({ input, compact, className }: { input: StoryImpactInput; compact?: boolean; className?: string }) {
  const sections = storyImpactSections(input);
  if (!sections.length) return null;

  return (
    <div className={cn("story-impact-blocks", compact && "is-compact", className)}>
      {sections.map((section) => (
        <div className="story-impact-block" key={section.label}>
          <span>{section.label}</span>
          <p>{section.value}</p>
        </div>
      ))}
    </div>
  );
}

function cleanImpactText(value?: string | null) {
  const cleaned = publicStoryText(value ?? "").trim();
  if (!cleaned) return "";
  return cleaned
    .replace(/\bmarket context on watch\b/gi, "market context under review")
    .replace(/\brole picture on watch\b/gi, "role picture under review")
    .replace(/\bkeeps lineup plan on watch\b/gi, "could change the lineup plan");
}
