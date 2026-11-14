"use client";

import Link from "next/link";
import type { GroupView, MarketView } from "@/lib/markets/types";
import { timeLeft } from "@/lib/format";
import { priceYes } from "@/lib/markets/lmsr";
import Avatar from "./Avatar";
import BookieMark from "./BookieMark";
import { useApp } from "./AppProvider";

const STATUS = {
  closed: { text: "Needs a result", cls: "bg-secondary/10 text-secondary ring-secondary/30" },
  review: { text: "Group is voting", cls: "bg-surface-container-high text-on-surface ring-outline-variant" },
  settled: { text: "Settled", cls: "bg-surface-container-high text-on-surface-variant ring-outline-variant/50" },
};

/** One market in the list: the chance, the Bookie's take when it differs, and Yes and No prices. */
export default function MarketCard({ market: m, group, now }: { market: MarketView; group: GroupView; now: number }) {
  const { state, name } = useApp();
  const href = `/g/${group.id}/m/${m.id}`;
  const yes = Math.round(priceYes(m.q) * 100);
  const showBookie = m.bookie && m.status !== "settled" && Math.abs(m.bookie.chance - m.chance) >= 5;
  const mine = m.positions.find((p) => p.userId === state?.me);
  const myPick = m.picks.find((p) => p.userId === state?.me);
  const dare = m.receipt?.dareText ?? (m.dare?.kind === "wheel" ? "Wheel" : m.dare && "text" in m.dare ? m.dare.text : undefined);
  const outcome = m.receipt?.outcome;

  return (
    <article className="group relative flex flex-col gap-3 rounded-2xl bg-surface-container ring-1 ring-[#333238] hover:ring-primary-container/50 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(206,76,59,0.45)] p-4 transition-all">
      <div className="flex items-start gap-3">
        {m.subjectId ? <Avatar name={name(m.subjectId)} size={40} className="rounded-xl!" /> : <span className="w-10 h-10 shrink-0 rounded-xl bg-surface-container-high flex items-center justify-center text-on-surface-variant" aria-hidden><span className="material-symbols-outlined text-[20px]">help</span></span>}
        <h3 className="flex-1 min-w-0 font-label-lg text-[15px] leading-snug text-on-surface">
          <Link href={href} className="after:absolute after:inset-0 after:rounded-2xl hover:text-primary">
            {m.question}
          </Link>
        </h3>
        <div className="flex flex-col items-end shrink-0 leading-none">
          {m.status === "settled" ? (
            <span className={`font-headline-md text-headline-md ${outcome === "yes" ? "text-primary" : outcome === "no" ? "text-secondary" : "text-on-surface-variant"}`}>{outcome === "void" ? "Void" : outcome?.toUpperCase()}</span>
          ) : (
            <>
              <span className="font-num text-[26px] font-semibold text-on-surface">{m.chance}%</span>
              <span className="font-label-sm text-xs text-on-surface-variant mt-1">{group.mode === "tokens" ? "chance" : "picked Yes"}</span>
            </>
          )}
        </div>
      </div>

      {showBookie && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-tertiary-container/10 ring-1 ring-tertiary-container/25 w-fit">
          <BookieMark size="xs" label={false} />
          <span className="font-label-md text-label-md text-tertiary">Bookie says {m.bookie!.chance}%</span>
        </div>
      )}

      <div className="relative z-10 mt-auto">
        {m.status === "open" ? (
          group.mode === "tokens" ? (
            <div className="grid grid-cols-2 gap-2">
              <Link href={`${href}?side=yes`} className="flex items-center justify-between px-3 py-2 rounded-xl bg-primary-container/25 text-primary ring-1 ring-primary-container/60 hover:bg-primary-container/35 font-label-lg text-label-lg">
                Yes <span className="font-num">{yes}</span>
              </Link>
              <Link href={`${href}?side=no`} className="flex items-center justify-between px-3 py-2 rounded-xl bg-secondary/25 text-secondary ring-1 ring-secondary/70 hover:bg-secondary/35 font-label-lg text-label-lg">
                No <span className="font-num">{100 - yes}</span>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {(["yes", "no"] as const).map((s) => (
                <Link
                  key={s}
                  href={`${href}?side=${s}`}
                  className={`px-3 py-2 rounded-xl ring-1 font-label-lg text-label-lg text-center ${s === "yes" ? "bg-primary-container/25 text-primary ring-primary-container/60" : "bg-secondary/25 text-secondary ring-secondary/70"} ${myPick?.side === s ? "ring-2" : ""}`}
                >
                  {myPick?.side === s ? "✓ " : ""}Pick {s === "yes" ? "Yes" : "No"}
                </Link>
              ))}
            </div>
          )
        ) : (
          <span className={`inline-flex px-2.5 py-1 rounded-full ring-1 font-label-md text-label-md ${STATUS[m.status].cls}`}>{STATUS[m.status].text}</span>
        )}
      </div>

      <div className="flex items-start justify-between gap-2 font-label-sm text-xs text-on-surface-variant">
        <span className="min-w-0">
          {group.mode === "tokens" ? `${m.volume.toLocaleString()} traded` : `${m.picks.length} picks`}
          {mine && (mine.yes > 0 || mine.no > 0) && <span className="text-primary"> · you hold {mine.yes > 0 ? `${mine.yes} Yes` : `${mine.no} No`}</span>}
          {dare && <span className="text-secondary"> · Dare: {dare}</span>}
        </span>
        {m.status === "open" && <span className="whitespace-nowrap">{timeLeft(m.deadline, now)}</span>}
      </div>
    </article>
  );
}
