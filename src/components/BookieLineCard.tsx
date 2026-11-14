"use client";

import { useNow } from "@/lib/bets/format";
import type { BetView } from "@/lib/bets/types";
import BookieMark, { SourceChip } from "./market/BookieMark";

/** An agent run that hasn't finished after this long has stalled (e.g. the server restarted mid-run). */
const STALE_MS = 2 * 60_000;

/**
 * The AI Bookie's opening line on a bet: the chances it opened at, a take, and a
 * roast. Set by the Deep Agent when a bet is posted (or from stored history when
 * the AI is off). The current estimate lives in the price block and analysis.
 */
export default function BookieLineCard({ bet, compact = false }: { bet: BetView; compact?: boolean }) {
  const now = useNow(15_000);
  const line = bet.bookie;
  if (!line) return null;

  if (line.status === "thinking") {
    if (bet.status === "settled") {
      return compact ? null : (
        <p className="px-3 py-2 rounded-xl bg-surface-container-low ring-1 ring-[#2f384a] font-body-sm text-body-sm text-on-surface-variant">
          🤖 The bet settled before the Bookie set an opening line.
        </p>
      );
    }
    const stale = now > 0 && now - Date.parse(line.at) > STALE_MS;
    return (
      <div
        role="status"
        className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-tertiary-container/10 ring-1 ring-tertiary-container/20 font-body-sm text-body-sm text-tertiary ${compact ? "relative z-10" : ""}`}
      >
        {!stale && <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" aria-hidden />}
        {stale
          ? "🤖 The Bookie didn't finish its opening line. Showing the history-only estimate."
          : "🤖 The Bookie is checking track records and setting the odds…"}
      </div>
    );
  }

  const ai = line.source === "ai";

  if (compact) {
    // On market cards, only show what the card doesn't already: the agent's take or roast.
    if (!ai || !(line.roast || line.take)) return null;
    return (
      <p className="flex items-start gap-1.5 px-3 py-1.5 rounded-xl bg-tertiary-container/10 ring-1 ring-tertiary-container/20 font-body-sm text-[12px] leading-snug text-tertiary line-clamp-2">
        <span aria-hidden>🤖</span>
        <span>{line.roast ? `“${line.roast}”` : line.take}</span>
      </p>
    );
  }

  const opened = line.chances?.map((c, i) => `${bet.outcomes[i]?.label} ${c}%`).join(" · ");
  const sameAsAnalysis = bet.odds?.explanation === line.take;
  // Has the current estimate moved on from the opening line?
  const current = bet.odds && bet.odds.trigger !== "created" ? Math.round((bet.odds.probabilities.find((p) => p.outcomeId === bet.outcomes[0].id)?.p ?? 0) * 100) : null;

  return (
    <section aria-label="Opening line" className="rounded-2xl bg-tertiary-container/[0.07] ring-1 ring-tertiary-container/25 p-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <BookieMark size="sm" label={false} />
        <h2 className="font-headline-sm text-headline-sm text-tertiary">Opening line</h2>
        <SourceChip label={ai ? `Deep Agent · ${line.model ?? "Claude"}` : "History only"} tone={ai ? "ai" : "muted"} />
      </div>
      {opened && (
        <p className="font-label-md text-label-md text-on-surface">
          Opened at <span className="text-tertiary">{opened}</span>
        </p>
      )}
      {current !== null && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          The AI Bookie has re-estimated since: now <b className="text-tertiary">{current}%</b> {bet.outcomes[0].label} (see the analysis below).
        </p>
      )}
      {ai && line.take && !sameAsAnalysis && <p className="font-body-md text-body-md text-on-surface">{line.take}</p>}
      {ai && line.take && sameAsAnalysis && <p className="font-body-sm text-body-sm text-on-surface-variant">Reasoning is in the analysis below.</p>}
      {line.roast && <p className="font-body-md text-body-md text-tertiary italic">“{line.roast}”</p>}
      <p className="font-label-sm text-[11px] text-on-surface-variant">
        Set when the bet was posted. The Bookie&apos;s guess only; payouts come from the pool.
      </p>
    </section>
  );
}
