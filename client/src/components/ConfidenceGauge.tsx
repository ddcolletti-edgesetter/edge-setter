import { useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// ConfidenceGauge — F1-telemetry-inspired animated arc gauge
//
// Shows confidence score as a sweeping arc with:
//   • Animated percentage counter (ease-out cubic)
//   • Color shift: red → orange → gold → green as confidence rises
//   • Glowing needle tip that travels along the arc
//   • Tick marks (5 major, 10 minor) like a tachometer
//   • Agent consensus dots below
//   • Status label: WATCHING / DEVELOPING / LIKELY / CONFIRMED
//
// Usage:
//   <ConfidenceGauge value={78} agentsAgree={3} agentsTotal={4} />
//   <ConfidenceGauge value={92} size="lg" showAgents={false} />
// ─────────────────────────────────────────────────────────────────────────────

export interface ConfidenceGaugeProps {
  value: number;           // 0–100
  agentsAgree?: number;
  agentsTotal?: number;
  size?: 'sm' | 'md' | 'lg';
  showAgents?: boolean;
  style?: React.CSSProperties;
}

const SIZES = {
  sm: { w: 96,  r: 34, sw: 5, numSz: 17, labSz: 8,  dotSz: 5 },
  md: { w: 120, r: 44, sw: 6, numSz: 22, labSz: 9,  dotSz: 6 },
  lg: { w: 154, r: 56, sw: 7, numSz: 28, labSz: 11, dotSz: 7 },
};

// ── Palette ──────────────────────────────────────────────────────────────────
function arcColor(v: number): string {
  if (v >= 85) return '#18D47B';   // confirmed — green
  if (v >= 65) return '#F5B841';   // likely — gold
  if (v >= 45) return '#E87C2A';   // developing — orange
  return '#ef4444';                 // watching — red
}

function statusLabel(v: number): string {
  if (v >= 85) return 'CONFIRMED';
  if (v >= 65) return 'LIKELY';
  if (v >= 45) return 'DEVELOPING';
  return 'WATCHING';
}

// ── Geometry helpers ─────────────────────────────────────────────────────────
// Arc is a 180° semicircle. The diameter sits at the bottom of the SVG.
// Angle θ ∈ [0, π]: θ=π → left endpoint, θ=0 → right endpoint.
// Point on arc: (cx + r·cos(θ),  cy − r·sin(θ))   [SVG y increases down]
//
// For value pct ∈ [0,100]: the filled arc sweeps left-to-right.
// θ for given pct = π · (1 − pct/100)
//
// stroke-dashoffset drives animation:
//   arcLen = π · r
//   dashOffset = arcLen · (1 − pct/100)   → 0 = fully filled

function anglePct(pct: number): number {
  return Math.PI * (1 - Math.max(0, Math.min(100, pct)) / 100);
}

function arcPoint(cx: number, cy: number, r: number, pct: number) {
  const θ = anglePct(pct);
  return { x: cx + r * Math.cos(θ), y: cy - r * Math.sin(θ) };
}

// ── Tick mark helper ─────────────────────────────────────────────────────────
function Ticks({ cx, cy, r, sw }: { cx: number; cy: number; r: number; sw: number }) {
  const ticks: React.ReactNode[] = [];
  const TOTAL = 20; // 20 segments = 21 ticks
  for (let i = 0; i <= TOTAL; i++) {
    const pct = (i / TOTAL) * 100;
    const θ = anglePct(pct);
    const isMajor = i % 4 === 0;
    const inner = r - sw / 2 - (isMajor ? 5 : 3);
    const outer = r + sw / 2 + (isMajor ? 4 : 2);
    const x1 = cx + inner * Math.cos(θ);
    const y1 = cy - inner * Math.sin(θ);
    const x2 = cx + outer * Math.cos(θ);
    const y2 = cy - outer * Math.sin(θ);
    ticks.push(
      <line
        key={i}
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={isMajor ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)'}
        strokeWidth={isMajor ? 1.2 : 0.7}
        strokeLinecap="round"
      />
    );
  }
  return <g>{ticks}</g>;
}

// ── Main component ────────────────────────────────────────────────────────────
export function ConfidenceGauge({
  value,
  agentsAgree,
  agentsTotal = 4,
  size = 'md',
  showAgents = true,
  style,
}: ConfidenceGaugeProps) {
  const cfg = SIZES[size];
  const PAD_TOP = 10;
  const PAD_BOTTOM = 10;

  // SVG layout
  const W = cfg.w;
  const H = cfg.r + PAD_TOP + PAD_BOTTOM;
  const cx = W / 2;
  const cy = H - PAD_BOTTOM;   // diameter sits at bottom with a small pad

  const arcLen = Math.PI * cfg.r;
  const startX = cx - cfg.r;
  const startY = cy;
  const endX   = cx + cfg.r;
  const endY   = cy;
  const arcPath = `M ${startX},${startY} A ${cfg.r},${cfg.r} 0 0,1 ${endX},${endY}`;

  // Clamp
  const clamped = Math.max(0, Math.min(100, value));
  const color   = arcColor(clamped);
  const dashOff = arcLen * (1 - clamped / 100);

  // Animated counter
  const [displayVal, setDisplayVal] = useState(0);
  const prevRef  = useRef(0);
  const animRef  = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    const to   = clamped;
    prevRef.current = to;
    if (from === to) { setDisplayVal(to); return; }

    const DURATION = 1100;
    const t0 = performance.now();
    const step = (now: number) => {
      const prog = Math.min((now - t0) / DURATION, 1);
      const ease = 1 - Math.pow(1 - prog, 3); // cubic ease-out
      setDisplayVal(Math.round(from + (to - from) * ease));
      if (prog < 1) { animRef.current = requestAnimationFrame(step); }
    };
    cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRef.current);
  }, [clamped]);

  // Needle tip position (tracks the filled arc end)
  const tip = arcPoint(cx, cy, cfg.r, clamped);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        ...style,
      }}
    >
      {/* ── SVG gauge ── */}
      <div style={{ position: 'relative', width: W, height: H }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          style={{ overflow: 'visible', display: 'block' }}
        >
          {/* Track (unfilled) */}
          <path
            d={arcPath}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={cfg.sw}
            strokeLinecap="round"
          />

          {/* Tick marks */}
          <Ticks cx={cx} cy={cy} r={cfg.r} sw={cfg.sw} />

          {/* Filled arc — transitions via stroke-dashoffset */}
          <path
            d={arcPath}
            fill="none"
            stroke={color}
            strokeWidth={cfg.sw}
            strokeLinecap="round"
            strokeDasharray={`${arcLen} ${arcLen}`}
            strokeDashoffset={dashOff}
            style={{
              transition: 'stroke-dashoffset 1.1s cubic-bezier(0.4,0,0.2,1), stroke 0.6s ease',
              filter: `drop-shadow(0 0 5px ${color}88)`,
            }}
          />

          {/* Percentage label */}
          <text
            x={cx}
            y={cy - cfg.r * 0.38}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{
              fontFamily: "'Barlow Condensed', 'Share Tech Mono', monospace",
              fontSize: cfg.numSz,
              fontWeight: 900,
              fill: color,
              letterSpacing: '-0.01em',
              transition: 'fill 0.6s ease',
              filter: `drop-shadow(0 0 8px ${color}99)`,
            }}
          >
            {displayVal}%
          </text>

          {/* Status label */}
          <text
            x={cx}
            y={cy - cfg.r * 0.38 + cfg.numSz * 0.62}
            textAnchor="middle"
            dominantBaseline="hanging"
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: cfg.labSz,
              fontWeight: 700,
              fill: 'rgba(248,250,252,0.38)',
              letterSpacing: '0.14em',
            }}
          >
            {statusLabel(clamped)}
          </text>

          {/* Left / right range labels */}
          <text
            x={startX - 2}
            y={cy + 10}
            textAnchor="end"
            style={{ fontFamily: 'monospace', fontSize: cfg.labSz - 1, fill: 'rgba(255,255,255,0.18)' }}
          >
            0
          </text>
          <text
            x={endX + 2}
            y={cy + 10}
            textAnchor="start"
            style={{ fontFamily: 'monospace', fontSize: cfg.labSz - 1, fill: 'rgba(255,255,255,0.18)' }}
          >
            100
          </text>
        </svg>

        {/* Glowing needle tip — positioned via absolute div */}
        <div
          style={{
            position: 'absolute',
            width:  cfg.sw * 2.4,
            height: cfg.sw * 2.4,
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 10px 3px ${color}88`,
            left: tip.x - cfg.sw * 1.2,
            top:  tip.y - cfg.sw * 1.2,
            pointerEvents: 'none',
            transition: [
              'left 1.1s cubic-bezier(0.4,0,0.2,1)',
              'top 1.1s cubic-bezier(0.4,0,0.2,1)',
              'background 0.6s ease',
              'box-shadow 0.6s ease',
            ].join(', '),
          }}
        />
      </div>

      {/* ── Agent consensus dots ── */}
      {showAgents && agentsAgree !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {Array.from({ length: agentsTotal }).map((_, i) => (
            <div
              key={i}
              title={i < agentsAgree ? 'Agent confirmed' : 'Agent watching'}
              style={{
                width:  cfg.dotSz,
                height: cfg.dotSz,
                borderRadius: '50%',
                background: i < agentsAgree
                  ? color
                  : 'rgba(255,255,255,0.10)',
                boxShadow: i < agentsAgree
                  ? `0 0 5px 1px ${color}77`
                  : 'none',
                transition: 'background 0.5s, box-shadow 0.5s',
              }}
            />
          ))}
          <span
            style={{
              fontSize: cfg.labSz,
              color: 'rgba(248,250,252,0.38)',
              fontFamily: "'Barlow Condensed', sans-serif",
              letterSpacing: '0.04em',
              marginLeft: 3,
            }}
          >
            {agentsAgree} of {agentsTotal} agents
          </span>
        </div>
      )}
    </div>
  );
}

export default ConfidenceGauge;
