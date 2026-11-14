"use client";

import Link from "next/link";
import { useState } from "react";
import { aiP, aiSource } from "@/lib/bets/market";
import { ago, useNow } from "@/lib/bets/format";
import type { BetView } from "@/lib/bets/types";
import { useBookie } from "./BookieProvider";
import BookieMark, { SourceChip, UncertaintyMeter } from "./market/BookieMark";

/**
 * The AI Bookie's reasoning. The numbers live in the price block above; this
 * panel explains them. Facts come from stored settled bets and link to them.
 */
export default function AiOddsPanel({ bet }: { bet: BetView }) {
  const { state, refreshOdds, toast } = useBookie();
  const now = useNow(30_000);
  const [busy, setBusy] = useState(false);
  const est = bet.odds;
  if (!est) return null;

  const src = aiSource(est, state?.ai.mode ?? "off");
  const stats = [...bet.oddsHistory].reverse().find((o) => o.source === "stats");
  const cited = new Set(est.citedFactIds);
  const evidenceCount = bet.evidence.filter((e) => est.citedEvidenceIds.includes(e.id)).length;

  const rerun = async () => {
    setBusy(true);
    const r = await refreshOdds(bet.id);
    setBusy(false);
    if (r) toast(r.source === "claude" ? "🤖 The Bookie updated its odds." : "📊 Odds recalculated from stored history.", "purple");
  };

  return (
    <section aria-labelledby={`ai-${bet.id}`} className="rounded-2xl bg-tertiary-container/[0.07] ring-1 ring-tertiary-container/30 p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <BookieMark size="md" label={false} />
        <h2 id={`ai-${bet.id}`} className="font-headline-sm text-headline-sm text-tertiary">
          AI Bookie analysis
        </h2>
        <SourceChip label={src.label} tone={src.tone} title={"reason" in src ? src.reason : undefined} />
        <UncertaintyMeter level={est.uncertainty} />
        <span className="ml-auto font-label-sm text-[11px] text-on-surface-variant">updated {ago(est.at, now || Date.parse(est.at))}</span>
      </div>

      <p className="font-body-md text-body-md text-on-surface">{est.explanation}</p>

      {src.fallback && "reason" in src && (
        <p className="font-body-sm text-body-sm text-[#f6caa8]">Claude couldn&apos;t answer ({src.reason}), so this is the history-only estimate.</p>
      )}
      {est.uncertainty === "high" && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">There&apos;s little relevant history here, so treat this number as a rough guess.</p>
      )}

      {(est.facts.length > 0 || evidenceCount > 0 || (est.source === "claude" && stats)) && (
        <details className="group">
          <summary className="cursor-pointer w-fit font-label-md text-label-md text-tertiary hover:underline">What this is based on</summary>
          <div className="flex flex-col gap-2 pt-2">
            {est.facts.length > 0 && (
              <ul className="flex flex-col gap-1">
                {est.facts.map((f) => (
                  <li key={f.id} className="font-body-sm text-body-sm text-on-surface flex flex-wrap gap-x-2">
                    <span>
                      {cited.has(f.id) ? "• " : "◦ "}
                      {f.text}
                    </span>
                    {f.betIds.length > 0 && (
                      <span className="text-on-surface-variant">
                        {f.betIds.slice(0, 8).map((id, i) => (
                          <Link key={id} href={`/bets/${id}`} className="hover:text-primary hover:underline">
                            {i ? ", " : "("}#{i + 1}
                          </Link>
                        ))}
                        {f.betIds.length > 8 ? ", …)" : ")"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {evidenceCount > 0 && <p className="font-body-sm text-body-sm text-on-surface-variant">Also weighed {evidenceCount} piece{evidenceCount === 1 ? "" : "s"} of submitted evidence.</p>}
            {est.source === "claude" && stats && (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                History-only baseline: {aiP(bet, bet.outcomes[0].id, stats)}% {bet.outcomes[0].label}.
              </p>
            )}
            <p className="font-body-sm text-[11px] text-on-surface-variant">Facts are computed from settled bets in this group. Numbers in brackets link to them.</p>
          </div>
        </details>
      )}

      {bet.status !== "settled" && (
        <div className="flex items-center justify-between gap-2">
          <span className="font-body-sm text-[11px] text-on-surface-variant">
            {state?.ai.mode === "claude"
              ? "Updates when new evidence comes in."
              : state?.ai.mode === "stub"
                ? "Test stub mode: odds use stored history only."
                : "AI is offline, so this uses stored history only."}
          </span>
          <button onClick={rerun} disabled={busy} className="shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg bg-tertiary-container/20 text-tertiary font-label-md text-label-md disabled:opacity-50">
            {busy ? "Thinking…" : "Re-estimate"}
          </button>
        </div>
      )}
    </section>
  );
}
