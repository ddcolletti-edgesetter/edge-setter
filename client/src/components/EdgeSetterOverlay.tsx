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
  const confidenceLabel = typeof confidence === "number" ? `${Math.round(confidence)}% support signal` : "Awaiting verification";
  const deltaLabel = typeof delta === "number" && delta !== 0 ? `${delta > 0 ? "+" : ""}${Math.round(delta)}` : "Hold";
  const sourceCount = data.sourceSummary?.count ?? 0;
  const sourceLabel = data.sourceSummary?.convergence ?? (sourceCount > 1 ? "Reports corroborating" : sourceCount === 1 ? "Single report" : "Report watch");
  const sourcePosture = sourcePostureLabel(sourceCount, sourceLabel);
  const timingLabel = [data.timing?.window, data.timing?.freshnessLabel].filter(Boolean).join(" / ") || "Timing watch";
  const replay = data.replay?.filter(Boolean).slice(0, compact ? 2 : 3) ?? [];
  const calibrationInput = {
    confidence,
    sourceCount,
    timingLabel,
    storyType: data.status ?? situation?.signalType,
    marketReaction: situation?.marketReaction ? `${situation.marketReaction.open} to ${situation.marketReaction.current}` : null,
    sourceSummary: sourcePosture,
  };

  return (
    <div className={compact ? "edge-overlay is-compact" : "edge-overlay"}>
      <div className="edge-overlay-top">
        {data.escalationState ? <EscalationBadge state={data.escalationState} /> : <span className="edge-overlay-status">{data.status ?? "Monitoring"}</span>}
        <span>{copyVariant === "editorial" ? "View evidence" : "EdgeSetter evidence"}</span>
      </div>

      {situation && !compact ? (
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
  const sourceWord = count === 1 ? "source" : "sources";
  if (normalized.includes("confirmed") || normalized.includes("corroborat")) return `${count} confirmed ${sourceWord}`;
  if (normalized.includes("single")) return "Single source";
  return `${count} ${sourceWord} / ${label}`;
}
