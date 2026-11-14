/**
 * The Bookie's mark. Everything the Bookie says sits next to it in periwinkle,
 * and nothing else in the app uses that colour.
 */
export default function BookieMark({ size = "sm", label = true }: { size?: "xs" | "sm" | "md"; label?: boolean }) {
  const box = size === "xs" ? "w-5 h-5 text-[11px] rounded-md" : size === "sm" ? "w-6 h-6 text-sm rounded-lg" : "w-9 h-9 text-lg rounded-xl";
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <span aria-hidden className={`${box} flex items-center justify-center bg-tertiary-container/25 ring-1 ring-tertiary-container/50`}>
        🎩
      </span>
      {label && <span className="font-label-sm text-label-sm font-semibold text-tertiary">The Bookie</span>}
    </span>
  );
}

const UNC = {
  low: { text: "Solid history", bars: 3 },
  medium: { text: "Some history", bars: 2 },
  high: { text: "Mostly a guess", bars: 1 },
};

/** Three bars: fewer bars, less to go on. */
export function Confidence({ level }: { level: "low" | "medium" | "high" }) {
  const u = UNC[level];
  return (
    <span className="inline-flex items-center gap-1.5 font-label-sm text-[11px] text-tertiary/80" title="How much history backs this">
      <span aria-hidden className="inline-flex items-end gap-[2px]">
        {[1, 2, 3].map((b) => (
          <span key={b} className={`w-[3px] rounded-sm ${b <= u.bars ? "bg-tertiary" : "bg-outline-variant"}`} style={{ height: 4 + b * 3 }} />
        ))}
      </span>
      {u.text}
    </span>
  );
}

const SOURCE: Record<string, string> = { claude: "Claude", stub: "Test stub", baseline: "From history", rules: "No AI", stock: "Stock line" };
export const sourceLabel = (s: string) => SOURCE[s] ?? s;
