"use client";

import { useEffect, useRef, useState } from "react";
import type { MarketView } from "@/lib/markets/types";

/**
 * The chance over time as an inline SVG: the market's line in copper and the
 * Bookie's estimates as periwinkle dots and a dashed level.
 */
export default function ChanceChart({ market, now, height = 180 }: { market: MarketView; now: number; height?: number }) {
  // Draw at the real pixel width so lines and labels never get scaled down.
  const ref = useRef<SVGSVGElement>(null);
  const [W, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = height;
  const pad = { l: 8, r: 40, t: 10, b: 18 };
  const pts = market.history;
  const t0 = Date.parse(market.createdAt);
  const end = market.receipt ? Date.parse(market.receipt.settledAt) : Math.max(now, ...pts.map((p) => Date.parse(p.at)));
  const t1 = Math.max(end, t0 + 60_000);
  const x = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / 100) * (H - pad.t - pad.b);

  // Step line: the price holds until the next change.
  let d = "";
  pts.forEach((p, i) => {
    const px = x(Date.parse(p.at));
    d += i === 0 ? `M${px},${y(p.yes)}` : `H${px}V${y(p.yes)}`;
  });
  d += `H${x(t1)}`;
  const last = pts.at(-1)?.yes ?? market.chance;
  const bookie = market.bookie;

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} role="img" aria-label={`Chance of Yes over time, now ${market.chance}%`}>
      {[25, 50, 75].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#333238" strokeDasharray="2 4" />
          <text x={W - pad.r + 6} y={y(v) + 4} fill="#d2cbd8" fontSize="12" fontFamily="var(--font-num)">
            {v}%
          </text>
        </g>
      ))}
      {bookie && <line x1={pad.l} x2={W - pad.r} y1={y(bookie.chance)} y2={y(bookie.chance)} stroke="#b9c3ff" strokeOpacity="0.5" strokeDasharray="6 5" />}
      <path d={`${d}V${y(0)}H${x(Date.parse(pts[0]?.at ?? market.createdAt))}Z`} fill="#ce4c3b" opacity="0.08" />
      <path d={d} fill="none" stroke="#e2685a" strokeWidth="2.5" strokeLinejoin="round" />
      {pts
        .filter((p) => p.source === "bookie")
        .map((p) => (
          <circle key={p.at} cx={x(Date.parse(p.at))} cy={y(p.yes)} r="5" fill="#b9c3ff" stroke="#1c1b1f" strokeWidth="2">
            <title>The Bookie set {p.yes}%</title>
          </circle>
        ))}
      <circle cx={x(t1)} cy={y(last)} r="4" fill="#e2685a" />
    </svg>
  );
}
