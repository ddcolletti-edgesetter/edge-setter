/* Editorial topic badges — combined palette: analytics accent colors on dark surfaces */
const topicColors: Record<string, { bg: string; text: string }> = {
  /* injury: magenta/plum — alert/risk signal */
  injury:      { bg: "hsl(330 42% 18%)", text: "hsl(330 42% 68%)" },
  /* draft: violet — speculative/future */
  draft:       { bg: "hsl(264 41% 18%)", text: "hsl(264 41% 72%)" },
  /* trade: cyan — confirmed/trust adjacent */
  trade:       { bg: "hsl(194 56% 15%)", text: "hsl(194 56% 62%)" },
  /* coaching: amber — caution/strategic */
  coaching:    { bg: "hsl(42  61% 15%)", text: "hsl(42  61% 62%)" },
  /* transaction: green — positive/verified */
  transaction: { bg: "hsl(152 55% 14%)", text: "hsl(152 55% 56%)" },
  /* depth_chart: slate — neutral analytical */
  depth_chart: { bg: "hsl(214 36% 17%)", text: "hsl(214 36% 63%)" },
  /* general: muted dark neutral */
  general:     { bg: "hsl(22 10% 18%)",  text: "hsl(30 10% 58%)"  },
};

interface TopicBadgeProps {
  topic: string | null;
  /** Deprecated — kept for type compatibility, has no effect */
  paper?: boolean;
}

export default function TopicBadge({ topic }: TopicBadgeProps) {
  const t = topic ?? "general";
  const label = t.replace(/_/g, " ");
  const colors = topicColors[t] ?? topicColors.general;

  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
      style={{ background: colors.bg, color: colors.text }}
      data-testid={`badge-topic-${t}`}
    >
      {label}
    </span>
  );
}
