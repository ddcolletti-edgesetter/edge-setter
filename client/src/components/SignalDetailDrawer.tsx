import { useEffect } from "react";
import { X } from "lucide-react";

export type SignalDetailLike = {
  id?: number | string;
  headline?: string | null;
  detail?: string | null;
  player?: string | null;
  team?: string | null;
  type?: string | null;
  confidence?: number | null;
  verdict?: string | null;
  action_takeaway?: string | null;
  timestamp?: string | null;
  sources?: number | string | null;
  sourceLabels?: string[] | null;
  why_it_matters?: string | null;
  whyItMatters?: string | null;
};

type SignalDetailDrawerProps = {
  open: boolean;
  signal: SignalDetailLike | null;
  sport?: string;
  onClose: () => void;
};

function sectionCopy(signal: SignalDetailLike, key: string) {
  const confidence = typeof signal.confidence === "number" ? `${signal.confidence}% confidence` : "Confidence scoring pending.";
  const action = signal.action_takeaway ?? "Actionability notes will populate as confirmations are attached.";

  const copy: Record<string, string> = {
    summary: signal.detail ?? signal.headline ?? "Signal summary will appear here.",
    confidence: `${confidence}. Explanation scaffolding is ready for source-weight, timing, and agreement logic.`,
    confirmations: "Source confirmation details will populate from trusted feeds and analyst checks.",
    movement: "Market movement context will show line changes, velocity, and current price windows.",
    timing: signal.timestamp ? `Detected ${signal.timestamp}. Timeline events will render here.` : "Signal timing and event timeline will render here.",
    actionability: action,
    sources: signal.sourceLabels?.join(", ") ?? (signal.sources ? `${signal.sources} source confirmations` : "Source list pending."),
  };

  return copy[key];
}

export function SignalDetailDrawer({ open, signal, sport, onClose }: SignalDetailDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !signal) return null;

  const sections = [
    ["summary", "Summary"],
    ["confidence", "Confidence Explanation"],
    ["confirmations", "Source Confirmations"],
    ["movement", "Market Movement"],
    ["timing", "Timing / Timeline"],
    ["actionability", "Actionability"],
    ["sources", "Sources"],
  ];

  return (
    <div className="signal-detail-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="signal-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Signal detail"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="signal-detail-header">
          <div>
            <div className="signal-detail-kicker">{sport ? `${sport} Signal` : "Signal Detail"}</div>
            <h2 className="signal-detail-title">{signal.headline ?? "Signal detail"}</h2>
            <div className="signal-detail-meta">
              {[signal.type, signal.team, signal.player, signal.timestamp].filter(Boolean).join(" / ")}
            </div>
          </div>
          <button className="signal-detail-close ux-button-interactive" type="button" onClick={onClose} aria-label="Close signal detail">
            <X size={18} />
          </button>
        </header>

        <div className="signal-detail-sections">
          {sections.map(([key, label]) => (
            <section className="signal-detail-section" key={key}>
              <h3>{label}</h3>
              <p>{sectionCopy(signal, key)}</p>
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}
