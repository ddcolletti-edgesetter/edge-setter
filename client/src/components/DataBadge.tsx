/**
 * DataBadge — consistent LIVE / DEMO / ARCHIVE labeling across all modules.
 *
 * Usage:
 *   <DataBadge type="live" />        → green pulsing dot + "LIVE"
 *   <DataBadge type="demo" />        → gold + "DEMO DATA"
 *   <DataBadge type="archive" />     → muted + "ARCHIVE"
 *   <DataBadge type="live" label="Live · 2026 Offseason" />   → custom label
 */

type DataBadgeType = "live" | "demo" | "archive";

interface DataBadgeProps {
  type: DataBadgeType;
  label?: string;
  className?: string;
}

const CONFIG: Record<DataBadgeType, { dot: string; text: string; bg: string; border: string; pulse: boolean; default: string }> = {
  live:    { dot: "#3DAE72", text: "#3DAE72", bg: "rgba(61,174,114,0.08)",  border: "rgba(61,174,114,0.28)",  pulse: true,  default: "Live" },
  demo:    { dot: "#F5B841", text: "#F5B841", bg: "rgba(245,184,65,0.08)", border: "rgba(245,184,65,0.28)", pulse: false, default: "Demo Data" },
  archive: { dot: "#64748B", text: "#64748B", bg: "rgba(100,116,139,0.08)", border: "rgba(100,116,139,0.22)", pulse: false, default: "Archive" },
};

export default function DataBadge({ type, label, className }: DataBadgeProps) {
  const cfg = CONFIG[type];
  const text = label ?? cfg.default;

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 3,
        border: `1px solid ${cfg.border}`,
        background: cfg.bg,
        fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: cfg.text,
        whiteSpace: "nowrap",
      }}
    >
      <span
        className={cfg.pulse ? "live-dot" : undefined}
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: cfg.dot,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {text}
    </span>
  );
}
