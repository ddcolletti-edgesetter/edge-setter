/* TopicBadge — Film Ledger palette */
interface Props { topic?: string | null; }

const TOPIC_LABELS: Record<string, string> = {
  injury:       "Injury",
  draft:        "Draft",
  trade:        "Trade",
  coaching:     "Coaching",
  transaction:  "Transaction",
  depth_chart:  "Depth Chart",
  general:      "General",
};

export default function TopicBadge({ topic }: Props) {
  if (!topic) return null;
  const label = TOPIC_LABELS[topic.toLowerCase()] ?? topic;

  return (
    <span style={{
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: 10, fontWeight: 700,
      letterSpacing: "0.12em", textTransform: "uppercase",
      background: "rgba(245,184,65,0.06)",
      color: "#64748B",
      border: "1px solid rgba(245,184,65,0.14)",
      padding: "3px 8px", borderRadius: 2,
      display: "inline-flex", alignItems: "center",
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}
