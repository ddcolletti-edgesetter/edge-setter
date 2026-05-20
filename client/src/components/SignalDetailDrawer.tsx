import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Bell, Bookmark, CheckCircle2, Clock3, History, LineChart, ShieldCheck, TrendingUp, X } from "lucide-react";

type LineMovementLike = {
  open?: string | null;
  current?: string | null;
  direction?: string | null;
  note?: string | null;
};

type SourceLike = string | {
  name?: string | null;
  type?: string | null;
  status?: string | null;
};

type AccuracyContextLike = {
  recentHitRate?: number | string | null;
  confidenceAlignment?: string | null;
  categoryPerformance?: string | null;
  trendDirection?: string | null;
  comparableOutcomes?: string | null;
};

export type SignalDetailLike = {
  id?: number | string;
  headline?: string | null;
  title?: string | null;
  detail?: string | null;
  summary?: string | null;
  player?: string | null;
  player_name?: string | null;
  team?: string | null;
  type?: string | null;
  signal_type?: string | null;
  confidence?: number | null;
  confidence_score?: number | string | null;
  verdict?: string | null;
  status_tag?: string | null;
  action_takeaway?: string | null;
  timestamp?: string | null;
  isoTimestamp?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  sources?: number | string | SourceLike[] | null;
  source_count?: number | string | null;
  sourceTypes?: string[] | null;
  sourceLabels?: string[] | null;
  confirmationStrength?: string | null;
  why_it_matters?: string | null;
  whyItMatters?: string | null;
  lineMovement?: LineMovementLike | null;
  line_movement?: LineMovementLike | null;
  bettingRelevance?: boolean | null;
  fantasyRelevance?: boolean | null;
  lineupStatus?: string | null;
  rotationNote?: string | null;
  matchupEdge?: string | null;
  accuracyContext?: AccuracyContextLike | null;
};

type SignalDetailDrawerProps = {
  open: boolean;
  signal: SignalDetailLike | null;
  sport?: string;
  onClose: () => void;
};

type Tone = "green" | "gold" | "blue" | "red" | "gray";

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

function readConfidence(signal: SignalDetailLike) {
  if (typeof signal.confidence === "number") return clamp(signal.confidence);
  if (typeof signal.confidence_score === "number") return clamp(signal.confidence_score);
  if (typeof signal.confidence_score === "string") {
    const parsed = Number.parseFloat(signal.confidence_score);
    if (!Number.isNaN(parsed)) return clamp(parsed);
  }
  return 0;
}

function readSourceCount(signal: SignalDetailLike) {
  if (typeof signal.sources === "number") return signal.sources;
  if (Array.isArray(signal.sources)) return signal.sources.length;
  if (typeof signal.sources === "string") {
    const parsed = Number.parseInt(signal.sources, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (typeof signal.source_count === "number") return signal.source_count;
  if (typeof signal.source_count === "string") {
    const parsed = Number.parseInt(signal.source_count, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return signal.sourceLabels?.length ?? 0;
}

function signalTimestamp(signal: SignalDetailLike) {
  return signal.isoTimestamp ?? signal.updated_at ?? signal.created_at ?? signal.timestamp ?? null;
}

function signalTitle(signal: SignalDetailLike) {
  return signal.headline ?? signal.title ?? "Signal detail";
}

function signalStorageId(signal: SignalDetailLike) {
  return String(signal.id ?? signalTitle(signal));
}

function signalType(signal: SignalDetailLike) {
  return signal.type ?? signal.signal_type ?? null;
}

function parseAgeMinutes(signal: SignalDetailLike) {
  const absoluteTimestamp = signal.isoTimestamp ?? signal.updated_at ?? signal.created_at;
  if (absoluteTimestamp) {
    const time = new Date(absoluteTimestamp).getTime();
    if (!Number.isNaN(time)) return Math.max(0, Math.round((Date.now() - time) / 60000));
  }

  const value = signal.timestamp?.toLowerCase().trim();
  if (!value) return null;
  const match = value.match(/(\d+)\s*(m|min|minute|minutes|h|hr|hour|hours|d|day|days)/);
  if (!match) return null;
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];
  if (unit.startsWith("m")) return amount;
  if (unit.startsWith("h")) return amount * 60;
  if (unit.startsWith("d")) return amount * 1440;
  return null;
}

function timingProfile(ageMinutes: number | null) {
  if (ageMinutes === null) {
    return { label: "Timing unavailable", tone: "gray" as Tone, adoption: 0, description: "Detection time is not attached to this signal yet." };
  }
  if (ageMinutes <= 45) {
    return { label: "Early", tone: "green" as Tone, adoption: clamp(18 + ageMinutes * 0.7), description: "Signal is still ahead of broad market adoption." };
  }
  if (ageMinutes <= 180) {
    return { label: "Developing", tone: "blue" as Tone, adoption: clamp(42 + ageMinutes * 0.18), description: "Market is reacting, but the window can remain useful." };
  }
  if (ageMinutes <= 720) {
    return { label: "Widely Known", tone: "gold" as Tone, adoption: clamp(68 + ageMinutes * 0.03), description: "Most of the edge may already be reflected in price." };
  }
  return { label: "Late", tone: "red" as Tone, adoption: 92, description: "Treat as context unless a new confirmation changes the signal." };
}

function edgeStrength(confidence: number) {
  if (confidence >= 85) return { label: "Strong edge", tone: "green" as Tone };
  if (confidence >= 72) return { label: "Active edge", tone: "blue" as Tone };
  if (confidence >= 58) return { label: "Watch edge", tone: "gold" as Tone };
  return { label: "Monitor", tone: "gray" as Tone };
}

function freshnessLabel(ageMinutes: number | null, fallback?: string | null) {
  if (ageMinutes === null) return fallback ?? "Unavailable";
  if (ageMinutes < 60) return `${ageMinutes}m ago`;
  if (ageMinutes < 1440) return `${Math.round(ageMinutes / 60)}h ago`;
  return `${Math.round(ageMinutes / 1440)}d ago`;
}

function timingDetectionLabel(ageMinutes: number | null, fallback?: string | null) {
  if (ageMinutes === null && !fallback) return "Detection time unavailable";
  return `${freshnessLabel(ageMinutes, fallback)} since first detection`;
}

function whyItMatters(signal: SignalDetailLike) {
  return (
    signal.why_it_matters ??
    signal.whyItMatters ??
    signal.summary ??
    signal.matchupEdge ??
    signal.rotationNote ??
    signal.lineupStatus ??
    "This signal is relevant because it can affect pricing, projections, roster decisions, or timing before the market fully adjusts."
  );
}

function actionWindow(signal: SignalDetailLike, timing: ReturnType<typeof timingProfile>) {
  if (signal.action_takeaway) return signal.action_takeaway;
  if (timing.label === "Early") return "Best window is now while confirmation is still spreading.";
  if (timing.label === "Developing") return "Review current price against your playable range before the move extends.";
  if (timing.label === "Widely Known") return "Edge may be diminishing. Wait for a better number or a new confirmation.";
  if (timing.label === "Late") return "Use as context unless market price resets.";
  return "Action range will populate as the signal gains confirmations.";
}

function confidenceDrivers(signal: SignalDetailLike, ageMinutes: number | null) {
  const confidence = readConfidence(signal);
  const sources = readSourceCount(signal);
  const movement = signal.lineMovement ?? signal.line_movement;
  const hasMovement = Boolean(movement?.open || movement?.current || movement?.note);
  const timingScore = ageMinutes === null ? 45 : clamp(100 - ageMinutes / 8);
  const sourceScore = clamp(sources * 18 + (signal.confirmationStrength ? 14 : 0));
  const sourceQuality = clamp((signal.sourceTypes?.length ?? 0) * 18 + (sources ? 42 : 24));

  return [
    { label: "Source agreement", value: sources ? sourceScore : Math.max(28, confidence - 35), detail: sources ? `${sources} confirmations attached` : "No confirmations attached" },
    { label: "Source quality", value: sourceQuality, detail: signal.confirmationStrength ?? "Source quality not yet scored" },
    { label: "Market confirmation", value: hasMovement ? 78 : 36, detail: hasMovement ? "Line movement attached" : "No movement attached yet" },
    { label: "Timing freshness", value: timingScore, detail: freshnessLabel(ageMinutes, signalTimestamp(signal)) },
    { label: "Historical alignment", value: confidence ? clamp(confidence - 8) : 42, detail: confidence ? "Aligned to current confidence score" : "Historical sample unavailable" },
  ];
}

function sourceRows(signal: SignalDetailLike) {
  if (Array.isArray(signal.sources) && signal.sources.length) {
    return signal.sources.map((source, index) => {
      if (typeof source === "string") return { label: source, type: "Trusted source", status: "Verified" };
      return {
        label: source.name ?? `Source ${index + 1}`,
        type: source.type ?? "Trusted source",
        status: source.status ?? "Verified",
      };
    });
  }
  const labels = signal.sourceLabels?.length ? signal.sourceLabels : [];
  const types = signal.sourceTypes?.length ? signal.sourceTypes : [];
  if (labels.length) return labels.map((label, index) => ({ label, type: types[index] ?? "Trusted source", status: "Verified" }));
  if (types.length) return types.map((type, index) => ({ label: `Source ${index + 1}`, type, status: "Verified" }));
  return [{ label: "Source stack", type: "No attached confirmations", status: "Unavailable" }];
}

function trustSummary(signal: SignalDetailLike, confidence: number, sources: number, timing: ReturnType<typeof timingProfile>) {
  const reasons: string[] = [];
  if (sources > 1) reasons.push(`${sources} source confirmations are attached`);
  else if (sources === 1) reasons.push("one source confirmation is attached");
  else reasons.push("no source confirmations are attached to this view");

  if (confidence >= 80) reasons.push("confidence is elevated");
  else if (confidence > 0) reasons.push("confidence is measured, not final");
  else reasons.push("confidence scoring is not available");

  if (timing.label === "Early" || timing.label === "Developing") reasons.push(`${timing.label.toLowerCase()} timing preserves context`);
  const movement = signal.lineMovement ?? signal.line_movement;
  if (movement?.open || movement?.current || movement?.note) reasons.push("market reaction is attached");

  return reasons;
}

function accuracyRows(signal: SignalDetailLike) {
  const context = signal.accuracyContext;
  return [
    { label: "Recent hit rate", value: context?.recentHitRate ?? "Unavailable", detail: "Requires settled signal outcomes." },
    { label: "Confidence alignment", value: context?.confidenceAlignment ?? "Unavailable", detail: "Compares current confidence to historical settled ranges." },
    { label: "Category performance", value: context?.categoryPerformance ?? "Unavailable", detail: "Tracks this signal type after outcome review." },
    { label: "Trend direction", value: context?.trendDirection ?? "Unavailable", detail: "Shows whether comparable edges are improving or weakening." },
  ];
}

function StatCard({ label, value, detail, tone = "gray" }: { label: string; value: string; detail: string; tone?: Tone }) {
  return (
    <div className={`signal-detail-stat is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="signal-detail-section">
      <h3>
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function DriverRow({ label, value, detail }: { label: string; value: number; detail: string }) {
  const meterValue = Math.round(clamp(value));

  return (
    <div className="signal-driver-row">
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
      <div className="signal-driver-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={meterValue}>
        <i style={{ width: `${meterValue}%` }} />
      </div>
    </div>
  );
}

export function SignalDetailDrawer({ open, signal, sport, onClose }: SignalDetailDrawerProps) {
  const [watching, setWatching] = useState(false);
  const [following, setFollowing] = useState(false);
  const [alertLevel, setAlertLevel] = useState<"major" | "all">("major");
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      previousActiveElement?.focus();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !signal) return;
    const id = signalStorageId(signal);
    try {
      const followed = JSON.parse(window.localStorage.getItem("edgesetter.followedSignals") ?? "[]") as string[];
      const watched = JSON.parse(window.localStorage.getItem("edgesetter.watchlistSignals") ?? "[]") as string[];
      const recent = JSON.parse(window.localStorage.getItem("edgesetter.recentSignals") ?? "[]") as Array<{ id: string; title: string; sport?: string; viewedAt: string }>;
      setFollowing(followed.includes(id));
      setWatching(watched.includes(id));
      window.localStorage.setItem(
        "edgesetter.recentSignals",
        JSON.stringify([{ id, title: signalTitle(signal), sport, viewedAt: new Date().toISOString() }, ...recent.filter(item => item.id !== id)].slice(0, 8))
      );
    } catch {
      setFollowing(false);
      setWatching(false);
    }
  }, [open, signal, sport]);

  const toggleStoredSignal = (key: string, active: boolean, setter: (value: boolean) => void) => {
    if (!signal) return;
    const id = signalStorageId(signal);
    try {
      const current = JSON.parse(window.localStorage.getItem(key) ?? "[]") as string[];
      const next = active ? current.filter(item => item !== id) : [id, ...current.filter(item => item !== id)].slice(0, 30);
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Local persistence is a convenience; the visible state should still update.
    }
    setter(!active);
  };

  const model = useMemo(() => {
    if (!signal) return null;
    const confidence = readConfidence(signal);
    const ageMinutes = parseAgeMinutes(signal);
    const timing = timingProfile(ageMinutes);
    const edge = edgeStrength(confidence);
    const sources = readSourceCount(signal);
    return { confidence, ageMinutes, timing, edge, sources, drivers: confidenceDrivers(signal, ageMinutes), rows: sourceRows(signal), trust: trustSummary(signal, confidence, sources, timing), accuracy: accuracyRows(signal) };
  }, [signal]);

  if (!open || !signal || !model) return null;

  const movement = signal.lineMovement ?? signal.line_movement;
  const hasLineMovement = Boolean(movement?.open || movement?.current);
  const hasMovementContext = Boolean(hasLineMovement || movement?.note || movement?.direction);
  const adoptionValue = Math.round(model.timing.adoption);
  const meta = [signalType(signal), signal.team, signal.player ?? signal.player_name, freshnessLabel(model.ageMinutes, signalTimestamp(signal))].filter(Boolean).join(" / ");

  return (
    <div className="signal-detail-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="signal-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Signal intelligence detail"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="signal-detail-header">
          <div>
            <div className="signal-detail-kicker">{sport ? `${sport} Intelligence` : "Signal Intelligence"}</div>
            <h2 className="signal-detail-title">{signalTitle(signal)}</h2>
            <div className="signal-detail-meta">{meta}</div>
          </div>
          <button ref={closeButtonRef} className="signal-detail-close ux-button-interactive" type="button" onClick={onClose} aria-label="Close signal detail">
            <X size={18} />
          </button>
        </header>

        <div className="signal-detail-sections">
          <div className="signal-detail-stat-grid">
            <StatCard label="Confidence" value={model.confidence ? `${model.confidence}%` : "Unavailable"} detail="Current signal strength" tone={model.confidence ? (model.confidence >= 80 ? "green" : "blue") : "gray"} />
            <StatCard label="Edge Strength" value={model.edge.label} detail={signal.verdict ?? signal.status_tag ?? "Verdict unavailable"} tone={model.edge.tone} />
            <StatCard label="Timing" value={model.timing.label} detail={model.timing.description} tone={model.timing.tone} />
            <StatCard label="Freshness" value={freshnessLabel(model.ageMinutes, signalTimestamp(signal))} detail="Detection age" tone={model.ageMinutes !== null && model.ageMinutes <= 45 ? "green" : "gray"} />
          </div>

          <Section title="Summary" icon={<CheckCircle2 size={14} />}>
            <p>{signal.detail ?? signal.summary ?? signalTitle(signal)}</p>
          </Section>

          <Section title="Why It Matters" icon={<ShieldCheck size={14} />}>
            <p>{whyItMatters(signal)}</p>
          </Section>

          <Section title="Why This Signal Is Trusted" icon={<ShieldCheck size={14} />}>
            <div className="signal-trust-stack">
              {model.trust.map((reason) => (
                <div className="signal-trust-row" key={reason}>
                  <CheckCircle2 size={13} />
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Market Reaction" icon={<LineChart size={14} />}>
            {hasMovementContext ? (
              <div className="signal-movement-card">
                {hasLineMovement && (
                  <>
                    <div className="signal-movement-row">
                      <span>Opening</span>
                      <strong>{movement?.open ?? "Unavailable"}</strong>
                    </div>
                    <div className="signal-movement-track" role="img" aria-label="Market movement from opening line to current line">
                      <i />
                    </div>
                    <div className="signal-movement-row">
                      <span>Current</span>
                      <strong>{movement?.current ?? "Unavailable"}</strong>
                    </div>
                  </>
                )}
                <div className="signal-movement-note">
                  <TrendingUp size={14} />
                  {movement?.note ?? movement?.direction ?? "Movement direction attached."}
                </div>
              </div>
            ) : (
              <div className="signal-empty-inline">No market movement attached yet. Keep this signal on watch until price reaction is visible.</div>
            )}
          </Section>

          <Section title="Source Confirmation" icon={<ShieldCheck size={14} />}>
            <div className="signal-source-summary">
              <strong>{model.sources ? `${model.sources} verified confirmations` : "No confirmations attached"}</strong>
              <span>{signal.confirmationStrength ?? "Consensus level is unavailable for this signal view."}</span>
            </div>
            <div className="signal-source-stack">
              {model.rows.map((row) => (
                <div className="signal-source-row" key={`${row.label}-${row.type}`}>
                  <span>{row.label}</span>
                  <small>{row.type}</small>
                  <b>{row.status}</b>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Suggested Action Window" icon={<Clock3 size={14} />}>
            <div className={`signal-action-window is-${model.timing.tone}`}>
              <strong>{model.timing.label === "Late" ? "Stale risk" : model.timing.label === "Widely Known" ? "Diminishing edge" : "Window open"}</strong>
              <p>{actionWindow(signal, model.timing)}</p>
            </div>
          </Section>

          <Section title="Confidence Drivers" icon={<LineChart size={14} />}>
            <div className="signal-driver-stack">
              {model.drivers.map((driver) => (
                <DriverRow key={driver.label} {...driver} />
              ))}
            </div>
          </Section>

          <Section title="Timing Advantage" icon={<Clock3 size={14} />}>
            <div className="signal-timing-card">
              <div>
                <strong>{model.timing.label}</strong>
                <span>{timingDetectionLabel(model.ageMinutes, signalTimestamp(signal))}</span>
              </div>
              <div className="signal-adoption-meter" role="meter" aria-label="Estimated market adoption" aria-valuemin={0} aria-valuemax={100} aria-valuenow={adoptionValue}>
                <i style={{ width: `${adoptionValue}%` }} />
              </div>
              <small>Estimated market adoption band: {adoptionValue}%</small>
            </div>
          </Section>

          <Section title="Accuracy Ledger Context" icon={<History size={14} />}>
            <div className="signal-accuracy-grid">
              {model.accuracy.map((row) => (
                <div className="signal-accuracy-card" key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                  <small>{row.detail}</small>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Historical Similar Signals" icon={<LineChart size={14} />}>
            <p>{signal.accuracyContext?.comparableOutcomes ?? "Comparable outcomes are unavailable until enough settled historical samples are attached. Use current confidence, source stack, and market reaction as the active trust context."}</p>
          </Section>

          <Section title="Alert Workflow" icon={<Bell size={14} />}>
            <div className="signal-alert-preview">
              <div>
                <strong>{following ? "Following updates on this edge" : "Follow this edge for update tracking"}</strong>
                <span>{following ? "This signal is marked for your next scanning session." : "Keep this signal in your local workflow for follow-up review."}</span>
              </div>
              <div className="signal-alert-options" role="group" aria-label="Alert preference preview">
                <button type="button" className={alertLevel === "major" ? "is-active" : ""} onClick={() => setAlertLevel("major")}>Major changes</button>
                <button type="button" className={alertLevel === "all" ? "is-active" : ""} onClick={() => setAlertLevel("all")}>All updates</button>
              </div>
            </div>
          </Section>
        </div>

        <footer className="signal-detail-footer">
          <div>
            <strong>{model.edge.label}</strong>
            <span>{actionWindow(signal, model.timing)}</span>
          </div>
          <div className="signal-detail-footer-actions">
            <button className="ux-button-interactive" type="button" aria-pressed={following} onClick={() => toggleStoredSignal("edgesetter.followedSignals", following, setFollowing)}>
              <Bell size={15} />
              {following ? "Following" : "Follow updates"}
            </button>
            <button className="ux-button-interactive" type="button" aria-pressed={watching} onClick={() => toggleStoredSignal("edgesetter.watchlistSignals", watching, setWatching)}>
              <Bookmark size={15} />
              {watching ? "Saved" : "Watchlist"}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
