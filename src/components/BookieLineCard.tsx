import type { BetView } from "@/lib/bets/types";

/** The AI Bookie's opening line on a bet: per-outcome chances, a take, and a roast. */
export default function BookieLineCard({ bet, compact = false }: { bet: BetView; compact?: boolean }) {
  const line = bet.bookie;
  if (!line) return null;

  if (line.status === "thinking") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-tertiary-container/10 border border-tertiary-container/20 font-body-sm text-body-sm text-tertiary">
        <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
        🤖 The Bookie is checking track records and setting the odds…
      </div>
    );
  }

  if (compact) {
    return (
      <p className="px-3 py-2 rounded-xl bg-tertiary-container/10 border border-tertiary-container/20 font-body-sm text-body-sm text-tertiary">
        🤖 {line.take}
      </p>
    );
  }

  return (
    <section className="rounded-2xl bg-tertiary-container/10 border border-tertiary-container/25 p-space-md flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-headline-sm text-headline-sm text-tertiary">🤖 Bookie&apos;s opening line</h2>
        <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant">
          {line.source === "ai" ? "AI" : "Track records only"}
        </span>
      </div>
      {line.chances && (
        <div className="flex flex-col gap-1.5">
          {bet.outcomes.map((o, i) => (
            <div key={o.id} className="flex items-center gap-3">
              <span className="w-28 truncate font-label-md text-label-md text-on-surface">{o.label}</span>
              <div className="flex-1 h-2 rounded-full bg-surface-container-high overflow-clip">
                <div className="h-full rounded-full bg-tertiary-container" style={{ width: `${line.chances![i]}%` }} />
              </div>
              <span className="w-10 text-right font-label-md text-label-md text-on-surface">{line.chances![i]}%</span>
            </div>
          ))}
        </div>
      )}
      {line.take && <p className="font-body-md text-body-md text-on-surface">{line.take}</p>}
      {line.roast && <p className="font-body-sm text-body-sm text-tertiary italic">“{line.roast}”</p>}
      <p className="font-label-sm text-label-sm text-on-surface-variant">The Bookie&apos;s guess only. Payouts come from the pool.</p>
    </section>
  );
}
