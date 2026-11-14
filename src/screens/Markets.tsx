"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { liveStatus, useBookie } from "@/components/BookieProvider";
import QuickBetSheet from "@/components/QuickBetSheet";
import Sparkline from "@/components/Sparkline";
import { estimatePayout } from "@/lib/bets/payout";
import { timeLeft, useNow } from "@/lib/bets/format";
import type { BetView } from "@/lib/bets/types";

type Filter = "All" | "Ending soon" | "Fitness" | "Habits" | "Pop Culture" | "Projects" | "Needs result" | "Settled";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "All", label: "All" },
  { id: "Ending soon", label: "⏰ Ending soon" },
  { id: "Fitness", label: "🏋️ Fitness" },
  { id: "Habits", label: "⏰ Habits" },
  { id: "Pop Culture", label: "🎬 Pop Culture" },
  { id: "Projects", label: "🚀 Projects" },
  { id: "Needs result", label: "⚖️ Needs result" },
  { id: "Settled", label: "✅ Settled" },
];

const SORTS = {
  trending: { label: "Most points", fn: (a: BetView, b: BetView) => b.pool - a.pool },
  ending: { label: "Ending soon", fn: (a: BetView, b: BetView) => a.deadline.localeCompare(b.deadline) },
  newest: { label: "Newest", fn: (a: BetView, b: BetView) => b.createdAt.localeCompare(a.createdAt) },
  friends: { label: "Most friends", fn: (a: BetView, b: BetView) => b.entries.length - a.entries.length },
};
type SortKey = keyof typeof SORTS;

const RANGES = { Last5: 5, Last10: 10, All: 999 } as const;
type Range = keyof typeof RANGES;
const RANGE_LABEL: Record<Range, string> = { Last5: "Last 5", Last10: "Last 10", All: "All" };

/** Chance of the first outcome after each entry. */
const lead = (b: BetView) => b.history.map((h) => h[0]);
const changeOf = (b: BetView) => {
  const h = lead(b);
  return h[h.length - 1] - h[0];
};

/** Half-circle gauge like a prediction-market card. */
function ChanceGauge({ chance }: { chance: number }) {
  const r = 26;
  const c = Math.PI * r;
  const color = chance >= 50 ? "#ce4c3b" : chance >= 25 ? "#f0a87a" : "#d9a35f";
  return (
    <div className="relative w-[68px] h-[40px] shrink-0">
      <svg viewBox="0 0 68 40" className="w-full h-full">
        <path d="M6,36 A28,28 0 0 1 62,36" fill="none" stroke="#3a3645" strokeWidth="6" strokeLinecap="round" />
        <path
          d="M6,36 A28,28 0 0 1 62,36"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${(chance / 100) * c * 1.08} 999`}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center leading-none">
        <span className="font-headline-sm text-[15px] text-on-surface">{chance}%</span>
        <span className="text-[10px] text-on-surface-variant">chance</span>
      </div>
    </div>
  );
}

export default function Markets() {
  const { state, me, user, openCreateBet } = useBookie();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>("All");
  const [sort, setSort] = useState<SortKey>("trending");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<Range>("All");
  const [sheet, setSheet] = useState<{ betId: string; outcome: number } | null>(null);

  const bets = useMemo(() => state?.bets ?? [], [state]);
  const myId = state?.me;
  const status = (b: BetView) => liveStatus(b, now);
  const myEntry = (b: BetView) => b.entries.find((e) => e.userId === myId);

  const open = bets.filter((b) => status(b) === "open");
  const featured = [...open].sort((a, b) => b.pool - a.pool)[0];

  const list = bets
    .filter((b) => {
      const q = query.trim().toLowerCase();
      if (q && !b.proposition.toLowerCase().includes(q)) return false;
      const s = status(b);
      if (filter === "All") return s !== "settled";
      if (filter === "Settled") return s === "settled";
      if (filter === "Needs result") return s === "closed";
      if (filter === "Ending soon") return s === "open" && Date.parse(b.deadline) - now <= 12 * 3_600_000;
      return s !== "settled" && b.category === filter;
    })
    .sort(SORTS[sort].fn);

  const movers = [...open]
    .filter((b) => b.history.length > 1)
    .sort((a, b) => Math.abs(changeOf(b)) - Math.abs(changeOf(a)))
    .slice(0, 4);

  const mine = bets.filter((b) => myEntry(b));
  const sheetBet = sheet && bets.find((b) => b.id === sheet.betId);

  const joinButtons = (b: BetView, size: "sm" | "lg" = "sm") => {
    const pad = size === "lg" ? "py-3 font-headline-sm text-headline-sm" : "py-2 font-label-lg text-label-lg";
    const [yes, no] = b.outcomes;
    return (
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setSheet({ betId: b.id, outcome: 0 })}
          className={`${pad} rounded-xl bg-primary-container/12 text-primary border border-primary-container/25 hover:bg-primary-container hover:text-on-primary transition-colors truncate px-2`}
        >
          {yes.label} {yes.chance}%
        </button>
        <button
          onClick={() => setSheet({ betId: b.id, outcome: 1 })}
          className={`${pad} rounded-xl bg-[#d9a35f]/12 text-[#e9bf86] border border-[#d9a35f]/25 hover:bg-[#d9a35f] hover:text-[#3a2508] transition-colors truncate px-2`}
        >
          {no.label} {no.chance}%
        </button>
      </div>
    );
  };

  /** What a card shows in place of join buttons once you're in or the bet isn't open. */
  const statusBlock = (b: BetView) => {
    const s = status(b);
    const entry = myEntry(b);
    if (s === "settled" && b.receipt) {
      const won = b.outcomes.find((o) => o.id === b.receipt!.outcomeId)!;
      return (
        <div className="flex items-center justify-between p-3 rounded-xl bg-primary-container/10 border border-primary-container/20">
          <span className="font-label-lg text-label-lg text-primary">✓ Result: {won.label}</span>
          <Link href={`/receipts/${b.id}`} className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface">
            See receipt →
          </Link>
        </div>
      );
    }
    if (s === "closed") {
      return (
        <Link
          href={`/bets/${b.id}`}
          className="flex items-center justify-between p-3 rounded-xl bg-[#f0a87a]/10 border border-[#f0a87a]/25 hover:border-[#f0a87a]/50"
        >
          <span className="font-label-lg text-label-lg text-[#f6caa8]">🔒 Closed · waiting for the result</span>
          {b.creatorId === myId && <span className="font-label-md text-label-md text-[#f6caa8]">Settle →</span>}
        </Link>
      );
    }
    if (entry) {
      const i = b.outcomes.findIndex((o) => o.id === entry.outcomeId);
      return (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-container-low font-label-sm text-label-sm">
          <span className="text-on-surface-variant">
            You: {entry.amount.toLocaleString()} pts on {b.outcomes[i].label}
          </span>
          <span className="text-primary">pays ~{estimatePayout(b.outcomes.map((o) => (o.id === entry.outcomeId ? o.pool - entry.amount : o.pool)), i, entry.amount).toLocaleString()}</span>
        </div>
      );
    }
    return null;
  };

  return (
    <main className="relative pt-16 bg-surface min-h-screen w-full px-gutter-desktop">
      {sheetBet && <QuickBetSheet bet={sheetBet} initialOutcome={sheet!.outcome} onClose={() => setSheet(null)} />}

      <div className="flex flex-col gap-space-lg py-space-lg pb-space-xl">
        {/* Page header */}
        <section className="flex flex-wrap items-end justify-between gap-space-md">
          <div className="flex flex-col gap-1">
            <h1 className="font-headline-lg text-headline-lg text-on-surface">Bets</h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant">Bet points on your friends. Winners split the pool.</p>
          </div>
          <button
            onClick={() => openCreateBet()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-container text-on-primary font-label-lg text-label-lg hover:shadow-[0_4px_14px_rgba(206,76,59,0.25)] transition-shadow"
          >
            <span className="material-symbols-outlined text-lg">add</span> New bet
          </button>
        </section>

        {/* Filters */}
        <section className="flex flex-wrap items-center justify-between gap-space-sm">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((c) => (
              <button
                key={c.id}
                onClick={() => setFilter(c.id)}
                className={`px-3.5 py-1.5 rounded-full font-label-md text-label-md border transition-colors ${
                  filter === c.id
                    ? "bg-on-surface text-surface border-on-surface"
                    : "bg-surface-container-low text-on-surface-variant border-[#3a3645] hover:text-on-surface hover:border-[#4b4657]"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-base text-on-surface-variant">search</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a bet"
                className="w-48 pl-9 pr-3 py-1.5 rounded-full bg-surface-container-low border border-[#3a3645] focus:border-primary-container outline-none font-body-md text-body-md"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort bets"
              className="px-3 py-1.5 rounded-full bg-surface-container-low border border-[#3a3645] font-label-md text-label-md text-on-surface"
            >
              {Object.entries(SORTS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-gutter-desktop items-start">
          <div className="flex flex-col gap-space-lg min-w-0">
            {!state && <p className="font-body-md text-body-md text-on-surface-variant">Loading bets…</p>}

            {/* Featured: the biggest open pool */}
            {featured && filter === "All" && !query && (
              <section className="rounded-2xl bg-surface-container border border-[#3a3645] p-space-lg grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-space-lg">
                <div className="flex flex-col gap-space-md">
                  <div className="flex items-center gap-2 font-label-sm text-label-sm">
                    <span className="px-2 py-0.5 rounded-full bg-[#f0a87a]/15 text-[#f6caa8]">⭐ Biggest pool</span>
                    <span className="text-on-surface-variant">Closes in {timeLeft(featured.deadline, now)}</span>
                  </div>
                  <Link href={`/bets/${featured.id}`} className="font-headline-md text-headline-md text-on-surface hover:text-primary transition-colors">
                    {featured.emoji} {featured.proposition}
                  </Link>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display-lg text-display-lg text-on-surface">{featured.outcomes[0].chance}%</span>
                    <span className="font-body-md text-body-md text-on-surface-variant">{featured.outcomes[0].label}</span>
                    {changeOf(featured) !== 0 && (
                      <span className={`font-label-md text-label-md flex items-center ${changeOf(featured) > 0 ? "text-primary" : "text-[#e9bf86]"}`}>
                        <span className="material-symbols-outlined text-base">{changeOf(featured) > 0 ? "arrow_upward" : "arrow_downward"}</span>
                        {Math.abs(changeOf(featured))} since it opened
                      </span>
                    )}
                  </div>
                  {statusBlock(featured) ??
                    (featured.outcomes.length === 2 ? (
                      joinButtons(featured, "lg")
                    ) : (
                      <button
                        onClick={() => setSheet({ betId: featured.id, outcome: 0 })}
                        className="py-3 rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm"
                      >
                        Pick an answer
                      </button>
                    ))}
                  {featured.dare && (
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-tertiary-container/10 border border-tertiary-container/20">
                      <span className="text-lg">🤖</span>
                      <p className="font-body-md text-body-md text-tertiary">Losers owe a dare: {featured.dare}.</p>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-end gap-1">
                    {(Object.keys(RANGES) as Range[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => setRange(r)}
                        className={`px-2.5 py-1 rounded-lg font-label-sm text-label-sm ${
                          range === r ? "bg-surface-container-highest text-on-surface" : "text-on-surface-variant hover:text-on-surface"
                        }`}
                      >
                        {RANGE_LABEL[r]}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 min-h-[180px] rounded-xl bg-surface-container-low p-3 flex flex-col justify-end">
                    <Sparkline data={lead(featured).slice(-RANGES[range])} height={170} width={400} />
                  </div>
                  <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant">
                    <span>{featured.pool.toLocaleString()} pts in play</span>
                    <span>{featured.entries.length} friends</span>
                    <Link href={`/bets/${featured.id}`} className="text-primary hover:underline">
                      Details →
                    </Link>
                  </div>
                </div>
              </section>
            )}

            {/* Grid */}
            {state && list.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#4b4657] p-10 flex flex-col items-center gap-3 text-center">
                <span className="text-3xl">🤔</span>
                <p className="font-headline-sm text-headline-sm text-on-surface">No bets here yet</p>
                <p className="font-body-md text-body-md text-on-surface-variant">Start one?</p>
                <button onClick={() => openCreateBet(query)} className="px-4 py-2 rounded-xl bg-primary-container text-on-primary font-label-lg text-label-lg">
                  Start a bet
                </button>
              </div>
            ) : (
              <section className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-space-md">
                {list
                  .filter((b) => !(featured && filter === "All" && !query && b.id === featured.id))
                  .map((b) => {
                    const s = status(b);
                    const binary = b.outcomes.length === 2;
                    const block = statusBlock(b);
                    const soon = s === "open" && Date.parse(b.deadline) - now <= 12 * 3_600_000;
                    return (
                      <article
                        key={b.id}
                        className="rounded-2xl bg-surface-container border border-[#3a3645] hover:border-[#4b4657] p-space-md flex flex-col gap-space-md transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <span className="w-10 h-10 shrink-0 rounded-xl bg-surface-container-high flex items-center justify-center text-xl">{b.emoji}</span>
                          <Link href={`/bets/${b.id}`} className="flex-1 font-label-lg text-label-lg text-on-surface leading-snug hover:text-primary">
                            {b.proposition}
                          </Link>
                          {binary && s !== "settled" && <ChanceGauge chance={b.outcomes[0].chance} />}
                        </div>

                        {!binary && s !== "settled" && (
                          <div className="flex flex-col gap-1.5">
                            {b.outcomes.map((o, i) => (
                              <div key={o.id} className="flex items-center gap-2">
                                <span className="flex-1 font-body-md text-body-md text-on-surface truncate">{o.label}</span>
                                <span className="w-10 text-right font-label-lg text-label-lg text-on-surface">{o.chance}%</span>
                                {s === "open" && !myEntry(b) && (
                                  <button
                                    onClick={() => setSheet({ betId: b.id, outcome: i })}
                                    className="px-2.5 py-1 rounded-lg bg-primary-container/12 text-primary font-label-sm text-label-sm hover:bg-primary-container hover:text-on-primary transition-colors"
                                  >
                                    Pick
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {binary && s !== "settled" && b.history.length > 1 && <Sparkline data={lead(b)} height={34} />}
                        {block ?? (binary ? joinButtons(b) : null)}

                        <div className="mt-auto flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant">
                          <span>
                            {b.pool.toLocaleString()} pts · {b.entries.length} friends · by {user(b.creatorId)?.name.split(" ")[0]}
                          </span>
                          <span className={soon ? "text-[#f6caa8]" : ""}>⏱ {s === "settled" ? "Settled" : timeLeft(b.deadline, now)}</span>
                        </div>
                      </article>
                    );
                  })}
              </section>
            )}
          </div>

          {/* Right rail */}
          <aside className="flex flex-col gap-space-md xl:sticky xl:top-20">
            <section className="rounded-2xl bg-surface-container border border-[#3a3645] p-space-md flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Your bets</h2>
                <span className="font-label-sm text-label-sm text-on-surface-variant">{(me?.balance ?? 0).toLocaleString()} pts free</span>
              </div>
              {mine.length === 0 ? (
                <p className="font-body-md text-body-md text-on-surface-variant">Your picks show up here.</p>
              ) : (
                mine.map((b) => {
                  const e = myEntry(b)!;
                  const pick = b.outcomes.find((o) => o.id === e.outcomeId)!;
                  const result = b.receipt?.payouts.find((p) => p.userId === myId);
                  return (
                    <Link key={b.id} href={`/bets/${b.id}`} className="flex flex-col gap-1 p-3 rounded-xl bg-surface-container-low hover:bg-surface-container-high">
                      <span className="font-label-md text-label-md text-on-surface line-clamp-2">{b.proposition}</span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        {e.amount.toLocaleString()} pts on {pick.label} ·{" "}
                        {result ? (
                          <span className={result.net >= 0 ? "text-primary" : "text-[#e9bf86]"}>
                            {result.net >= 0 ? "+" : ""}
                            {result.net.toLocaleString()} pts
                          </span>
                        ) : status(b) === "closed" ? (
                          "waiting for result"
                        ) : (
                          `closes in ${timeLeft(b.deadline, now)}`
                        )}
                      </span>
                    </Link>
                  );
                })
              )}
            </section>

            {movers.length > 0 && (
              <section className="rounded-2xl bg-surface-container border border-[#3a3645] p-space-md flex flex-col gap-3">
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Biggest moves</h2>
                {movers.map((b) => {
                  const d = changeOf(b);
                  return (
                    <Link key={b.id} href={`/bets/${b.id}`} className="flex items-center gap-3">
                      <span className="text-lg">{b.emoji}</span>
                      <span className="flex-1 font-body-sm text-body-sm text-on-surface line-clamp-2">{b.proposition}</span>
                      <span className={`font-label-md text-label-md whitespace-nowrap ${d >= 0 ? "text-primary" : "text-[#e9bf86]"}`}>
                        {d >= 0 ? "▲" : "▼"} {Math.abs(d)}
                      </span>
                    </Link>
                  );
                })}
              </section>
            )}

            <section className="rounded-2xl bg-tertiary-container/10 border border-tertiary-container/20 p-space-md flex flex-col gap-2">
              <h2 className="font-headline-sm text-headline-sm text-tertiary">🤖 How it works</h2>
              <ol className="flex flex-col gap-1.5 font-body-md text-body-md text-on-surface-variant list-decimal pl-5">
                <li>Pick an outcome and stake points.</li>
                <li>Entries close at the deadline.</li>
                <li>The creator records the result.</li>
                <li>Winners split the whole pool.</li>
              </ol>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
