/**
 * The AI Bookie's visual identity: a lavender robot tile. Every AI-generated
 * number or recommendation in the app sits next to this mark, and nothing
 * else uses lavender, so AI output is never mistaken for pool data.
 */
export default function BookieMark({ size = "sm", label = true }: { size?: "xs" | "sm" | "md"; label?: boolean }) {
  const box = size === "xs" ? "w-5 h-5 text-[11px] rounded-md" : size === "sm" ? "w-6 h-6 text-sm rounded-lg" : "w-9 h-9 text-lg rounded-xl";
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <span aria-hidden className={`${box} flex items-center justify-center bg-tertiary-container/25 ring-1 ring-tertiary-container/50`}>
        🤖
      </span>
      {label && <span className="font-label-sm text-label-sm font-semibold text-tertiary">AI Bookie</span>}
    </span>
  );
}

const TONE = {
  ai: "bg-tertiary-container/15 text-tertiary ring-tertiary-container/40",
  warn: "bg-[#f0a87a]/15 text-[#f6caa8] ring-[#f0a87a]/40",
  muted: "bg-surface-container-high text-on-surface-variant ring-outline-variant/40",
};

/** Small chip saying where an AI number came from (Claude, history only, or a fallback). */
export function SourceChip({ label, tone, title }: { label: string; tone: keyof typeof TONE; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center px-2 py-0.5 rounded-full ring-1 font-label-sm text-[11px] whitespace-nowrap ${TONE[tone]}`}>
      {label}
    </span>
  );
}

const UNC = {
  low: { text: "Low uncertainty", cls: "text-primary", bars: 3 },
  medium: { text: "Medium uncertainty", cls: "text-[#f6caa8]", bars: 2 },
  high: { text: "High uncertainty", cls: "text-secondary", bars: 1 },
};

/** Three-bar confidence meter: fewer bars, less to go on. */
export function UncertaintyMeter({ level, compact = false }: { level: "low" | "medium" | "high"; compact?: boolean }) {
  const u = UNC[level];
  return (
    <span className={`inline-flex items-center gap-1.5 font-label-sm text-[11px] ${u.cls}`} title={`${u.text}: how much data backs the AI estimate`}>
      <span aria-hidden className="inline-flex items-end gap-[2px]">
        {[1, 2, 3].map((b) => (
          <span key={b} className={`w-[3px] rounded-sm ${b <= u.bars ? "bg-current" : "bg-outline-variant"}`} style={{ height: 4 + b * 3 }} />
        ))}
      </span>
      {compact ? <span className="sr-only">{u.text}</span> : u.text}
    </span>
  );
}
