"use client";

import { useState } from "react";
import type { MarketView } from "@/lib/markets/types";
import { ago } from "@/lib/format";
import { useApp } from "./AppProvider";
import BookieMark, { Confidence, sourceLabel } from "./BookieMark";

/** The Bookie's take on a market: the chance, the likely range, one line of why, and the facts behind it. */
export default function BookieCard({ market: m, now }: { market: MarketView; now: number }) {
  const { recheckOdds, state } = useApp();
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState(false);
  const b = m.bookie;

  return (
    <section className="rounded-2xl bg-tertiary-container/[0.07] ring-1 ring-tertiary-container/30 p-4 flex flex-col gap-3" aria-label="The Bookie's estimate">
      <div className="flex items-center justify-between gap-2">
        <BookieMark />
        {b && <span className="font-label-sm text-xs text-tertiary">{sourceLabel(b.source)}{b.via === "deep-agent" ? " · Deep Agent" : ""} · {ago(b.at, now)}</span>}
      </div>
      {b ? (
        <>
          <div className="flex items-end gap-3">
            <span className="font-num text-[40px] leading-none font-semibold text-tertiary">{b.chance}%</span>
            <span className="pb-1 font-body-sm text-body-sm text-tertiary">
              chance of Yes · likely {b.range[0]} to {b.range[1]}%
            </span>
          </div>
          <p className="font-body-md text-body-md text-on-surface">{b.explanation}</p>
          {b.facts.length > 0 && (
            <ul className="flex flex-col gap-1 pl-3 border-l-2 border-tertiary-container/40">
              {b.facts.map((f) => (
                <li key={f.id} className="font-body-sm text-body-sm text-on-surface-variant">
                  {f.text}
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Confidence level={b.uncertainty} />
            {b.fallbackReason && <span className="font-label-sm text-xs text-on-surface-variant">AI unavailable, used history</span>}
          </div>
        </>
      ) : (
        <p className={`font-body-md text-body-md text-tertiary ${m.status === "open" ? "animate-pulse" : ""}`}>{m.status === "open" ? "Setting the line…" : "No line was set on this one."}</p>
      )}
      <div className="flex items-center gap-3">
        {m.status === "open" && (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await recheckOdds(m.id);
              setBusy(false);
            }}
            className="font-label-md text-label-md text-tertiary hover:underline disabled:opacity-50"
          >
            {busy ? "Checking…" : "Re-check"}
          </button>
        )}
        {m.aiLog.length > 0 && (
          <button onClick={() => setLog(!log)} className="font-label-md text-label-md text-tertiary hover:underline" aria-expanded={log}>
            {log ? "Hide" : "Show"} the Bookie&apos;s log ({m.aiLog.length})
          </button>
        )}
      </div>
      {log && (
        <ol className="flex flex-col gap-2 font-body-sm text-body-sm">
          {[...m.aiLog].reverse().map((a) => (
            <li key={a.id} className="flex flex-col p-2 rounded-lg bg-surface-container-lowest/60">
              <span className="text-on-surface">{a.summary}</span>
              <span className="font-label-sm text-xs text-on-surface-variant">
                {sourceLabel(a.source)}
                {a.model ? ` · ${a.model}` : ""} · {ago(a.at, now)}
              </span>
            </li>
          ))}
          {state?.ai.mode === "off" && <li className="text-on-surface-variant">The AI is off, so the Bookie works from history only.</li>}
        </ol>
      )}
    </section>
  );
}
