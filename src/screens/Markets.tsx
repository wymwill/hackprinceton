"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useBookie } from "@/components/BookieProvider";
import Countdown from "@/components/Countdown";
import QuickBetSheet, { type QuickBet } from "@/components/QuickBetSheet";
import Sparkline from "@/components/Sparkline";
import { MARKETS, MY_BALANCE, chanceOf, changeOf, payout, type Category, type Market } from "@/lib/markets";

const CATEGORIES: { id: "All" | Category | "Ending soon" | "Settled"; label: string }[] = [
  { id: "All", label: "All" },
  { id: "Ending soon", label: "⏰ Ending soon" },
  { id: "Fitness", label: "🏋️ Fitness" },
  { id: "Habits", label: "🌱 Habits" },
  { id: "Movies", label: "🎬 Movies & TV" },
  { id: "Projects", label: "🚀 Projects" },
  { id: "Games", label: "🎮 Games" },
  { id: "Settled", label: "✅ Settled" },
];

const SORTS = {
  trending: { label: "Trending", fn: (a: Market, b: Market) => b.comments + b.volume / 100 - (a.comments + a.volume / 100) },
  ending: { label: "Ending soon", fn: (a: Market, b: Market) => a.closesHours - b.closesHours },
  newest: { label: "Newest", fn: (a: Market, b: Market) => a.createdDaysAgo - b.createdDaysAgo },
  points: { label: "Most points", fn: (a: Market, b: Market) => b.volume - a.volume },
};
type SortKey = keyof typeof SORTS;

const RANGES = { "1D": 6, "1W": 10, All: 99 } as const;
type Range = keyof typeof RANGES;

type Position = { side: "yes" | "no"; option: string; amount: number; chance: number };

/** Half-circle gauge like a prediction-market card. */
function ChanceGauge({ chance }: { chance: number }) {
  const r = 26;
  const c = Math.PI * r;
  const color = chance >= 50 ? "#34d399" : chance >= 25 ? "#fbbf77" : "#fb7185";
  return (
    <div className="relative w-[68px] h-[40px] shrink-0">
      <svg viewBox="0 0 68 40" className="w-full h-full">
        <path d="M6,36 A28,28 0 0 1 62,36" fill="none" stroke="#2f384a" strokeWidth="6" strokeLinecap="round" />
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
  const { toast, openCreateBet } = useBookie();
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]["id"]>("All");
  const [sort, setSort] = useState<SortKey>("trending");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<Range>("1W");
  const [sheet, setSheet] = useState<(QuickBet & { marketId: string }) | null>(null);
  const [positions, setPositions] = useState<Record<string, Position>>({});

  const featured = MARKETS[0];
  const featuredChance = chanceOf(featured);
  const featuredHistory = featured.history.slice(-RANGES[range]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MARKETS.filter((m) => {
      if (q && !m.title.toLowerCase().includes(q)) return false;
      if (cat === "All") return !m.resolved;
      if (cat === "Settled") return !!m.resolved;
      if (cat === "Ending soon") return !m.resolved && m.closesHours <= 12;
      return !m.resolved && m.category === cat;
    }).sort(SORTS[sort].fn);
  }, [cat, sort, query]);

  const movers = useMemo(
    () => [...MARKETS].filter((m) => !m.resolved && !m.outcomes).sort((a, b) => Math.abs(changeOf(b)) - Math.abs(changeOf(a))).slice(0, 4),
    []
  );

  const open = (m: Market, side: "yes" | "no", option = "Yes", chance = chanceOf(m)) =>
    setSheet({ marketId: m.id, marketTitle: m.title, option, side, chance });

  const yesNo = (m: Market, size: "sm" | "lg" = "sm") => {
    const c = chanceOf(m);
    const pad = size === "lg" ? "py-3 font-headline-sm text-headline-sm" : "py-2 font-label-lg text-label-lg";
    return (
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => open(m, "yes")}
          className={`${pad} rounded-xl bg-primary-container/12 text-primary border border-primary-container/25 hover:bg-primary-container hover:text-on-primary transition-colors`}
        >
          Yes {c}%
        </button>
        <button
          onClick={() => open(m, "no")}
          className={`${pad} rounded-xl bg-[#fb7185]/12 text-[#fda4af] border border-[#fb7185]/25 hover:bg-[#fb7185] hover:text-[#3b0a14] transition-colors`}
        >
          No {100 - c}%
        </button>
      </div>
    );
  };

  const positionList = Object.entries(positions);

  return (
    <main className="relative pt-16 bg-surface min-h-screen w-full px-gutter-desktop">
      {sheet && (
        <QuickBetSheet
          bet={sheet}
          onClose={() => setSheet(null)}
          onConfirm={(side, amount) => {
            const chance = side === "yes" ? sheet.chance : 100 - sheet.chance;
            setPositions((p) => ({ ...p, [sheet.marketId]: { side, option: sheet.option, amount, chance } }));
            toast(
              `✅ ${amount} pts on ${side === "yes" ? "Yes" : "No"}${sheet.option !== "Yes" ? ` for ${sheet.option}` : ""}. Win ${payout(amount, chance).toLocaleString()} pts if you're right.`,
              "lime"
            );
            setSheet(null);
          }}
        />
      )}

      <div className="flex flex-col gap-space-lg py-space-lg pb-space-xl">
        {/* Page header */}
        <section className="flex flex-wrap items-end justify-between gap-space-md">
          <div className="flex flex-col gap-1">
            <h1 className="font-headline-lg text-headline-lg text-on-surface">Bets</h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant">
              Bet points on your friends. The AI sets the odds.
            </p>
          </div>
          <button
            onClick={() => openCreateBet()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-container text-on-primary font-label-lg text-label-lg hover:shadow-[0_4px_14px_rgba(52,211,153,0.25)] transition-shadow"
          >
            <span className="material-symbols-outlined text-lg">add</span> New bet
          </button>
        </section>

        {/* Filters */}
        <section className="flex flex-wrap items-center justify-between gap-space-sm">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={`px-3.5 py-1.5 rounded-full font-label-md text-label-md border transition-colors ${
                  cat === c.id
                    ? "bg-on-surface text-surface border-on-surface"
                    : "bg-surface-container-low text-on-surface-variant border-[#2f384a] hover:text-on-surface hover:border-[#414d64]"
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
                className="w-48 pl-9 pr-3 py-1.5 rounded-full bg-surface-container-low border border-[#2f384a] focus:border-primary-container outline-none font-body-md text-body-md"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort bets"
              className="px-3 py-1.5 rounded-full bg-surface-container-low border border-[#2f384a] font-label-md text-label-md text-on-surface"
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
            {/* Featured market */}
            {cat === "All" && !query && (
              <section className="rounded-2xl bg-surface-container border border-[#2f384a] p-space-lg grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-space-lg">
                <div className="flex flex-col gap-space-md">
                  <div className="flex items-center gap-2 font-label-sm text-label-sm">
                    <span className="px-2 py-0.5 rounded-full bg-[#fbbf77]/15 text-[#fcd5a4]">⭐ Featured</span>
                    <span className="text-on-surface-variant">
                      Closes in <Countdown seconds={13692} />
                    </span>
                  </div>
                  <Link href={featured.href!} className="font-headline-md text-headline-md text-on-surface hover:text-primary transition-colors">
                    {featured.emoji} {featured.title}
                  </Link>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display-lg text-display-lg text-on-surface">{featuredChance}%</span>
                    <span className="font-body-md text-body-md text-on-surface-variant">chance</span>
                    <span className="font-label-md text-label-md text-[#fda4af] flex items-center">
                      <span className="material-symbols-outlined text-base">arrow_downward</span>
                      {Math.abs(changeOf(featured))} pts this week
                    </span>
                  </div>
                  {yesNo(featured, "lg")}
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-tertiary-container/10 border border-tertiary-container/20">
                    <span className="text-lg">🤖</span>
                    <p className="font-body-md text-body-md text-tertiary">{featured.bookie}</p>
                  </div>
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
                        {r}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 min-h-[180px] rounded-xl bg-surface-container-low p-3 flex flex-col justify-end">
                    <Sparkline data={featuredHistory} height={170} width={400} />
                  </div>
                  <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant">
                    <span>{featured.volume.toLocaleString()} pts in play</span>
                    <span>{featured.friends} friends</span>
                    <span>💬 {featured.comments}</span>
                    <Link href={featured.href!} className="text-primary hover:underline">
                      Details →
                    </Link>
                  </div>
                </div>
              </section>
            )}

            {/* Grid */}
            {list.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#414d64] p-10 flex flex-col items-center gap-3 text-center">
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
                  .filter((m) => !(cat === "All" && !query && m.id === featured.id))
                  .map((m) => {
                    const c = chanceOf(m);
                    const pos = positions[m.id];
                    return (
                      <article
                        key={m.id}
                        className="rounded-2xl bg-surface-container border border-[#2f384a] hover:border-[#414d64] p-space-md flex flex-col gap-space-md transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <span className="w-10 h-10 shrink-0 rounded-xl bg-surface-container-high flex items-center justify-center text-xl">{m.emoji}</span>
                          {m.href ? (
                            <Link href={m.href} className="flex-1 font-label-lg text-label-lg text-on-surface leading-snug hover:text-primary">
                              {m.title}
                            </Link>
                          ) : (
                            <p className="flex-1 font-label-lg text-label-lg text-on-surface leading-snug">{m.title}</p>
                          )}
                          {!m.outcomes && !m.resolved && <ChanceGauge chance={c} />}
                        </div>

                        {m.resolved ? (
                          <div className="flex items-center justify-between p-3 rounded-xl bg-primary-container/10 border border-primary-container/20">
                            <span className="font-label-lg text-label-lg text-primary">✓ Resolved: {m.resolved.result}</span>
                            {m.resolved.href && (
                              <Link href={m.resolved.href} className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface">
                                See receipt →
                              </Link>
                            )}
                          </div>
                        ) : m.outcomes ? (
                          <div className="flex flex-col gap-1.5">
                            {m.outcomes.map((o) => (
                              <div key={o.label} className="flex items-center gap-2">
                                <span className="flex-1 font-body-md text-body-md text-on-surface truncate">{o.label}</span>
                                <span className="w-10 text-right font-label-lg text-label-lg text-on-surface">{o.chance}%</span>
                                <button
                                  onClick={() => open(m, "yes", o.label, o.chance)}
                                  className="px-2.5 py-1 rounded-lg bg-primary-container/12 text-primary font-label-sm text-label-sm hover:bg-primary-container hover:text-on-primary transition-colors"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={() => open(m, "no", o.label, o.chance)}
                                  className="px-2.5 py-1 rounded-lg bg-[#fb7185]/12 text-[#fda4af] font-label-sm text-label-sm hover:bg-[#fb7185] hover:text-[#3b0a14] transition-colors"
                                >
                                  No
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <>
                            <Sparkline data={m.history} height={34} />
                            {yesNo(m)}
                          </>
                        )}

                        {pos && (
                          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-container-low font-label-sm text-label-sm">
                            <span className="text-on-surface-variant">
                              You: {pos.amount} pts on {pos.side === "yes" ? "Yes" : "No"}
                              {pos.option !== "Yes" ? ` · ${pos.option}` : ""}
                            </span>
                            <span className="text-primary">wins {payout(pos.amount, pos.chance).toLocaleString()}</span>
                          </div>
                        )}

                        <div className="mt-auto flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant">
                          <span>{m.volume.toLocaleString()} pts · {m.friends} friends</span>
                          <span className="flex items-center gap-3">
                            <span>💬 {m.comments}</span>
                            <span className={m.closesHours > 0 && m.closesHours <= 12 ? "text-[#fcd5a4]" : ""}>⏱ {m.closesIn}</span>
                          </span>
                        </div>
                      </article>
                    );
                  })}
              </section>
            )}
          </div>

          {/* Right rail */}
          <aside className="flex flex-col gap-space-md xl:sticky xl:top-20">
            <section className="rounded-2xl bg-surface-container border border-[#2f384a] p-space-md flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Your bets</h2>
                <span className="font-label-sm text-label-sm text-on-surface-variant">{MY_BALANCE.toLocaleString()} pts free</span>
              </div>
              {positionList.length === 0 ? (
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Your picks show up here.
                </p>
              ) : (
                positionList.map(([id, p]) => {
                  const m = MARKETS.find((x) => x.id === id)!;
                  return (
                    <div key={id} className="flex flex-col gap-1 p-3 rounded-xl bg-surface-container-low">
                      <span className="font-label-md text-label-md text-on-surface line-clamp-2">{m.title}</span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        {p.amount} pts on {p.side === "yes" ? "Yes" : "No"}
                        {p.option !== "Yes" ? ` · ${p.option}` : ""} · wins{" "}
                        <span className="text-primary">{payout(p.amount, p.chance).toLocaleString()}</span>
                      </span>
                    </div>
                  );
                })
              )}
            </section>

            <section className="rounded-2xl bg-surface-container border border-[#2f384a] p-space-md flex flex-col gap-3">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Biggest moves this week</h2>
              {movers.map((m) => {
                const d = changeOf(m);
                return (
                  <div key={m.id} className="flex items-center gap-3">
                    <span className="text-lg">{m.emoji}</span>
                    <span className="flex-1 font-body-sm text-body-sm text-on-surface line-clamp-2">{m.title}</span>
                    <span className={`font-label-md text-label-md whitespace-nowrap ${d >= 0 ? "text-primary" : "text-[#fda4af]"}`}>
                      {d >= 0 ? "▲" : "▼"} {Math.abs(d)}
                    </span>
                  </div>
                );
              })}
            </section>

            <section className="rounded-2xl bg-tertiary-container/10 border border-tertiary-container/20 p-space-md flex flex-col gap-2">
              <h2 className="font-headline-sm text-headline-sm text-tertiary">🤖 How it works</h2>
              <ol className="flex flex-col gap-1.5 font-body-md text-body-md text-on-surface-variant list-decimal pl-5">
                <li>Pick Yes or No.</li>
                <li>Lower chance, bigger win.</li>
                <li>Losers owe a dare.</li>
              </ol>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
