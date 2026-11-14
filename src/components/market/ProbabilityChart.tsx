"use client";

import { useEffect, useRef, useState } from "react";
import type { Point } from "@/lib/bets/market";

const PAD = { l: 34, r: 12, t: 12, b: 26 };

const AI_COLOR = "#a78bfa";
const POOL_COLOR = "#7c8aa0";

/**
 * Step chart of recorded history only: one point per stored AI estimate and one
 * per entry. Lines hold their last value until `end`. Nothing is interpolated
 * or simulated.
 */
export default function ProbabilityChart({
  ai,
  pool,
  start,
  end,
  outcome,
  openingAt,
}: {
  ai: Point[];
  pool: Point[];
  start: number;
  end: number;
  outcome: string;
  /** Timestamp of the opening-line estimate, marked with a ring. */
  openingAt?: number;
}) {
  // Draw at the container's real width so labels keep their pixel size on phones.
  const ref = useRef<HTMLElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 480 ? 180 : 220;
  const span = Math.max(1, end - start);
  const x = (t: number) => PAD.l + ((Math.min(Math.max(t, start), end) - start) / span) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b);
  const path = (pts: Point[]) => {
    if (!pts.length) return "";
    let d = `M${x(pts[0].t).toFixed(1)},${y(pts[0].v).toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) d += ` H${x(pts[i].t).toFixed(1)} V${y(pts[i].v).toFixed(1)}`;
    return d + ` H${x(end).toFixed(1)}`;
  };
  const short = span < 2 * 86_400_000;
  const fmt = (t: number) =>
    new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: short ? "numeric" : undefined, minute: short ? "2-digit" : undefined });
  const last = (pts: Point[]) => pts[pts.length - 1];
  const summary = `${outcome}: AI Bookie estimate ${ai.length ? `went from ${ai[0].v}% to ${last(ai).v}% over ${ai.length} estimates` : "has no history"}; pool share went from ${pool[0]?.v ?? 0}% to ${last(pool)?.v ?? 0}% over ${pool.length - 1} entries.`;

  return (
    <figure ref={ref} className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="w-full h-auto" role="img" aria-label={summary}>
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#2f384a" strokeDasharray={v === 50 ? "4 4" : undefined} />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#7c8aa0">
              {v}%
            </text>
          </g>
        ))}
        <text x={PAD.l} y={H - 6} fontSize="11" fill="#7c8aa0">
          {fmt(start)}
        </text>
        <text x={W - PAD.r} y={H - 6} fontSize="11" fill="#7c8aa0" textAnchor="end">
          {fmt(end)}
        </text>
        <path d={path(pool)} fill="none" stroke={POOL_COLOR} strokeWidth="2" strokeDasharray="5 4" />
        <path d={path(ai)} fill="none" stroke={AI_COLOR} strokeWidth="2.5" />
        {pool.map((p, i) => (
          <circle key={`p${i}`} cx={x(p.t)} cy={y(p.v)} r="3" fill={POOL_COLOR}>
            <title>{`Pool share ${p.v}% · ${new Date(p.t).toLocaleString()}`}</title>
          </circle>
        ))}
        {ai.map((p, i) => (
          <circle key={`a${i}`} cx={x(p.t)} cy={y(p.v)} r="3.5" fill={AI_COLOR}>
            <title>{`${p.t === openingAt ? "Opening line" : "AI Bookie re-estimate"} ${p.v}% · ${new Date(p.t).toLocaleString()}`}</title>
          </circle>
        ))}
        {openingAt !== undefined &&
          ai
            .filter((p) => p.t === openingAt)
            .slice(-1)
            .map((p) => {
              // Put the label on the side away from where the line goes next.
              const next = ai.find((q) => q.t > p.t);
              const below = next ? next.v >= p.v : p.v > 50;
              const ty = Math.min(H - PAD.b - 4, Math.max(PAD.t + 10, y(p.v) + (below ? 18 : -10)));
              return (
                <g key="opening">
                  <circle cx={x(p.t)} cy={y(p.v)} r="7" fill="none" stroke={AI_COLOR} strokeWidth="1.5" />
                  <text x={x(p.t) + 10} y={ty} fontSize="11" fill={AI_COLOR}>
                    Opening {p.v}%
                  </text>
                </g>
              );
            })}
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 font-label-sm text-[11px] text-on-surface-variant">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-[3px] rounded" style={{ background: AI_COLOR }} /> AI Bookie: opening line (ringed) and re-estimates ({ai.length} recorded)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-0 border-t-2 border-dashed" style={{ borderColor: POOL_COLOR }} /> Pool share ({pool.length - 1} entries)
        </span>
        <span>Each dot is a stored data point. Nothing between dots is simulated.</span>
      </figcaption>
    </figure>
  );
}
