import { Clock3, History, ShieldCheck } from "lucide-react";

import { AgentCalibrationBadge, HistoricalPatternMatch } from "@/components/AgentCalibration";
import { ConfidenceMovement, EscalationBadge, SourceChainMini } from "@/components/intelligence/SituationCard";
import type { EscalationState, IntelligenceSituation, TimingWindow } from "@/lib/intelligenceSituationsApi";

export interface EdgeSetterOverlayData {
  escalationState?: EscalationState | null;
  confidence?: {
    current?: number | null;
    delta?: number | null;
    explanation?: string | null;
  } | null;
  sourceSummary?: {
    count?: number | null;
    convergence?: string | null;
  } | null;
  timing?: {
    window?: TimingWindow | string | null;
    freshnessLabel?: string | null;
  } | null;
  replay?: string[];
  status?: string | null;
}

interface EdgeSetterOverlayProps {
  data: EdgeSetterOverlayData;
  situation?: IntelligenceSituation | null;
  compact?: boolean;
  copyVariant?: "legacy" | "editorial";
}

export function EdgeSetterOverlay({ data, situation, compact, copyVariant = "legacy" }: EdgeSetterOverlayProps) {
  const confidence = data.confidence?.current;
  const delta = data.confidence?.delta;
  const publicCopy = copyVariant === "editorial";
  const confidenceLabel = typeof confidence === "number"
    ? publicCopy ? `${Math.round(confidence)}% support from tracked signals` : `${Math.round(confidence)}% support signal`
    : "Awaiting verification";
  const deltaLabel = typeof delta === "number" && delta !== 0 ? `${delta > 0 ? "+" : ""}${Math.round(delta)}` : "Hold";
  const sourceCount = data.sourceSummary?.count ?? 0;
  const sourceLabel = publicSourceLabel(data.sourceSummary?.convergence) ?? (sourceCount > 1 ? "Multiple reports supporting" : sourceCount === 1 ? "Single report under review" : "Report watch");
  const sourcePosture = sourcePostureLabel(sourceCount, sourceLabel);
  const timingWindow = publicCopy ? publicTimingLabel(data.timing?.window) : data.timing?.window;
  const timingLabel = [timingWindow, data.timing?.freshnessLabel].filter(Boolean).join(" / ") || "Timing watch";
  const replay = publicCopy
    ? ["Source trail checked", "Timing window reviewed", "Impact still developing"].slice(0, compact ? 2 : 3)
    : data.replay?.filter(Boolean).slice(0, compact ? 2 : 3) ?? [];
  const calibrationInput = {
    confidence,
    sourceCount,
    timingLabel,
    storyType: publicCopy ? "public-homepage" : data.status ?? situation?.signalType,
    marketReaction: situation?.marketReaction ? `${situation.marketReaction.open} to ${situation.marketReaction.current}` : null,
    sourceSummary: sourcePosture,
  };

  return (
    <div className={compact ? "edge-overlay is-compact" : "edge-overlay"}>
      <div className="edge-overlay-top">
        {publicCopy
          ? <span className="edge-overlay-status">{publicStatusLabel(data.escalationState, data.status)}</span>
          : data.escalationState ? <EscalationBadge state={data.escalationState} /> : <span className="edge-overlay-status">{data.status ?? "Monitoring"}</span>}
        <span>{publicCopy ? "EdgeSetter review" : "EdgeSetter evidence"}</span>
      </div>

      {situation && !compact && !publicCopy ? (
        <div className="edge-overlay-primitives">
          <ConfidenceMovement situation={situation} />
          <SourceChainMini situation={situation} />
        </div>
      ) : (
        <div className="edge-overlay-grid">
          <div>
            <ShieldCheck size={13} />
            <span>Confidence support</span>
            <strong>{confidenceLabel}</strong>
          </div>
          <div>
            <ShieldCheck size={13} />
            <span>Source posture</span>
            <strong>{sourcePosture}</strong>
          </div>
          <div>
            <Clock3 size={13} />
            <span>Timing window</span>
            <strong>{timingLabel}</strong>
          </div>
        </div>
      )}

      <div className="edge-overlay-replay">
        <History size={13} />
        <span>{replay.length ? replay.join(" -> ") : `Verification ${deltaLabel} / ${sourcePosture}`}</span>
      </div>
      <div className="mt-1 flex min-w-0 flex-wrap gap-1.5">
        <AgentCalibrationBadge input={calibrationInput} compact={compact} copyVariant={copyVariant} />
        {!compact && <HistoricalPatternMatch input={calibrationInput} compact />}
      </div>
    </div>
  );
}

function sourcePostureLabel(count: number, label: string) {
  const normalized = label.toLowerCase();
  if (!count) return label;
  const reportWord = count === 1 ? "report" : "reports";
  if (normalized.includes("confirmed") || normalized.includes("corroborat")) return `${count} confirmed ${reportWord}`;
  if (normalized.includes("single")) return "Single report";
  return `${count} ${reportWord} / ${label}`;
}

function publicStatusLabel(state?: EscalationState | null, status?: string | null) {
  if (status === "Quiet coverage") return "Coverage watch";
  if (state === "Confirming") return "Being verified";
  if (state === "Official") return "Official update";
  if (state === "Significant" || state === "Escalating") return "Impact watch";
  if (state === "Emerging") return "Developing story";
  return "Monitoring";
}

function publicSourceLabel(value?: string | null) {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized.includes("official")) return "Official trail checked";
  if (normalized.includes("corroborated") || normalized.includes("confirmed") || normalized.includes("consensus")) return "Supported by multiple signals and reports";
  if (normalized.includes("single")) return "Single report under review";
  if (normalized.includes("awaiting")) return "Source trail still developing";
  return value;
}

function publicTimingLabel(value?: string | null) {
  if (!value) return value;
  const normalized = value.toLowerCase();
  if (normalized === "widely known") return "Public context";
  if (normalized === "early") return "Early window";
  if (normalized === "developing") return "Developing window";
  if (normalized === "closing") return "Late window";
  if (normalized === "stale") return "Old update";
  return value;
}
