interface Props {
  verdict: string | null;
  size?: "sm" | "md";
}

const labels: Record<string, string> = {
  confirmed: "Confirmed",
  likely: "Likely",
  rumor: "Rumor",
  contradicted: "Contradicted",
  review: "In Review",
};

export default function VerdictBadge({ verdict, size = "sm" }: Props) {
  const v = verdict ?? "rumor";
  const label = labels[v] ?? v;
  const cls = `verdict-${v}`;
  const sizeClass = size === "md"
    ? "text-[10px] px-2.5 py-0.5 font-semibold tracking-wider"
    : "text-[9px] px-2 py-0.5 font-semibold tracking-wider";

  return (
    <span
      className={`inline-flex items-center rounded ${cls} ${sizeClass} uppercase whitespace-nowrap`}
      data-testid={`badge-verdict-${v}`}
    >
      {label}
    </span>
  );
}
