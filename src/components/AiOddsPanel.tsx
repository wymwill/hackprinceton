"use client";

import Link from "next/link";
import { useState } from "react";
import { ago, useNow } from "@/lib/bets/format";
import type { BetView } from "@/lib/bets/types";
import { useBookie } from "./BookieProvider";

const UNCERTAINTY = {
  low: "text-primary",
  medium: "text-[#fcd5a4]",
  high: "text-[#fda4af]",
};

/**
 * The AI Bookie's estimate, shown apart from the pool-implied percentages.
 * Facts come from stored settled bets and link to them; the explanation is the
 * model's words (or the stats summary when the AI is off).
 */
export default function AiOddsPanel({ bet }: { bet: BetView }) {
  const { state, refreshOdds, toast } = useBookie();
  const now = useNow(30_000);
  const [busy, setBusy] = useState(false);
  const est = bet.odds;
  const mode = state?.ai.mode ?? "off";
  if (!est) return null;

  const stats = [...bet.oddsHistory].reverse().find((o) => o.source === "stats");
  const pOf = (id: string, e = est) => Math.round((e.probabilities.find((x) => x.outcomeId === id)?.p ?? 0) * 100);
  const cited = new Set(est.citedFactIds);
  const evidence = bet.evidence.filter((e) => est.citedEvidenceIds.includes(e.id));

  const rerun = async () => {
    setBusy(true);
    const r = await refreshOdds(bet.id);
    setBusy(false);
    if (r) toast(r.source === "claude" ? "🤖 The Bookie updated its odds." : "📊 Odds recalculated from history.", "purple");
  };

  return (
    <section className="rounded-2xl bg-tertiary-container/10 border border-tertiary-container/30 p-space-md flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-headline-sm text-headline-sm text-tertiary">🤖 AI Bookie estimate</h2>
        <span className="px-2 py-0.5 rounded-full bg-tertiary-container/20 font-label-sm text-label-sm text-tertiary">
          {est.source === "claude" ? `Claude · ${est.model}` : "History only"}
        </span>
        <span className="ml-auto font-label-sm text-label-sm text-on-surface-variant">updated {ago(est.at, now || Date.parse(est.at))}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 font-label-sm text-label-sm uppercase text-on-surface-variant">
          <span>Outcome</span>
          <span className="text-right">AI Bookie</span>
          <span className="text-right">Pool</span>
        </div>
        {bet.outcomes.map((o) => (
          <div key={o.id} className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-center">
            <span className="font-label-lg text-label-lg text-on-surface">{o.label}</span>
            <span className="w-16 text-right font-headline-sm text-headline-sm text-tertiary">{pOf(o.id)}%</span>
            <span className="w-16 text-right font-label-lg text-label-lg text-on-surface-variant">{o.chance}%</span>
          </div>
        ))}
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          AI Bookie = estimated chance it actually happens. Pool = share of points staked on each outcome.
        </p>
      </div>

      <p className="font-body-md text-body-md text-on-surface">{est.explanation}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-label-sm text-label-sm">
        <span className={UNCERTAINTY[est.uncertainty]}>Uncertainty: {est.uncertainty}</span>
        {est.range && (
          <span className="text-on-surface-variant">
            Likely range for {bet.outcomes[0].label}: {est.range[0]}–{est.range[1]}%
          </span>
        )}
        {est.source === "claude" && stats && (
          <span className="text-on-surface-variant">
            History-only baseline: {pOf(bet.outcomes[0].id, stats)}% {bet.outcomes[0].label}
          </span>
        )}
      </div>

      {est.facts.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">From stored bets</span>
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
                      <Link key={id} href={`/bets/${id}`} className="hover:text-primary underline-offset-2 hover:underline">
                        {i ? ", " : "("}#{i + 1}
                      </Link>
                    ))}
                    {f.betIds.length > 8 ? ", …)" : ")"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {evidence.length > 0 && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">Also weighed {evidence.length} piece{evidence.length === 1 ? "" : "s"} of submitted evidence.</p>
      )}

      {bet.status !== "settled" && (
        <div className="flex items-center justify-between gap-2">
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            {mode === "claude" ? "Updates when new evidence comes in." : "AI is off, so this uses stored history only."}
          </span>
          <button onClick={rerun} disabled={busy} className="px-3 py-1.5 rounded-lg bg-tertiary-container/20 text-tertiary font-label-md text-label-md disabled:opacity-50">
            {busy ? "Thinking…" : "Re-estimate"}
          </button>
        </div>
      )}
    </section>
  );
}
