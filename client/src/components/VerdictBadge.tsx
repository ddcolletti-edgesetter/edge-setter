/* VerdictBadge — Film Ledger palette */
interface Props { verdict?: string | null; }

export default function VerdictBadge({ verdict }: Props) {
  const v = (verdict ?? "").toLowerCase().trim();

  const styles: Record<string, { bg: string; color: string; border: string; label: string }> = {
    confirmed:    { bg: "rgba(56,170,203,0.10)",  color: "#5AC8E0", border: "#5AC8E044", label: "Confirmed" },
    likely:       { bg: "rgba(245,184,65,0.10)",  color: "#FFD166", border: "#FFD16644", label: "Likely" },
    rumor:        { bg: "rgba(120,80,176,0.10)",  color: "#A07ACC", border: "#A07ACC44", label: "Rumor" },
    contradicted: { bg: "rgba(207,74,74,0.10)",   color: "#E08080", border: "#E0808044", label: "Contradicted" },
    review:       { bg: "rgba(78,111,160,0.10)",  color: "#7A9CC8", border: "#7A9CC844", label: "In Review" },
  };

  const key = Object.keys(styles).find(k => v.includes(k)) ?? "review";
  const s = styles[key];

  return (
    <span style={{
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      fontSize: 10, fontWeight: 700,
      letterSpacing: "0.12em", textTransform: "uppercase",
      background: s.bg, color: s.color,
      border: `1px solid ${s.border}`,
      padding: "3px 8px", borderRadius: 2,
      display: "inline-flex", alignItems: "center", gap: 5,
      whiteSpace: "nowrap",
    }}>
      <span style={{
        width: 4, height: 4, borderRadius: "50%",
        background: s.color, display: "inline-block", flexShrink: 0,
      }} />
      {s.label}
    </span>
  );
}
