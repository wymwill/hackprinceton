"use client";

import Link from "next/link";
import { useState } from "react";
import Avatar from "@/components/Avatar";
import { liveStatus, useBookie } from "@/components/BookieProvider";
import BookieMark from "@/components/market/BookieMark";
import MarketCard from "@/components/market/MarketCard";
import QuickBetSheet from "@/components/QuickBetSheet";
import { activityScore } from "@/lib/bets/market";
import { GROUP } from "@/lib/data";
import { useNow } from "@/lib/bets/format";
import type { BetView } from "@/lib/bets/types";

type Tab = "trending" | "mine" | "ending" | "needs" | "resolved";
const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "trending", label: "🔥 Trending", hint: "Open markets with the most entries and evidence in the last 48 hours" },
  { id: "mine", label: "My bets", hint: "Markets you created or joined" },
  { id: "ending", label: "⏰ Ending soon", hint: "Open markets, soonest deadline first" },
  { id: "needs", label: "⚖️ Needs result", hint: "Entries closed, waiting to be settled" },
  { id: "resolved", label: "✅ Resolved", hint: "Settled markets, most recent first" },
];
const CATEGORIES = ["All", "Fitness", "Habits", "Pop Culture", "Projects"];

const settledAt = (b: BetView) => b.receipt?.settledAt ?? "";

/** Market-first home: a grid of compact market cards with prediction-market style filters. */
export default function MarketsHome() {
  const { state, me, user, openCreateBet } = useBookie();
  const now = useNow();
  const [tab, setTab] = useState<Tab>("trending");
  const [cat, setCat] = useState("All");
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<{ betId: string; outcome: number } | null>(null);

  const bets = state?.bets ?? [];
  const myId = state?.me;
  const s = (b: BetView) => liveStatus(b, now || Date.parse(state?.serverTime ?? "") || 0);
  const involved = (b: BetView) => b.creatorId === myId || b.entries.some((e) => e.userId === myId);

  const byTab: Record<Tab, BetView[]> = {
    trending: bets.filter((b) => s(b) === "open").sort((a, b) => activityScore(b, now) - activityScore(a, now)),
    mine: bets
      .filter(involved)
      .sort((a, b) => ["open", "closed", "settled"].indexOf(s(a)) - ["open", "closed", "settled"].indexOf(s(b)) || a.deadline.localeCompare(b.deadline)),
    ending: bets.filter((b) => s(b) === "open").sort((a, b) => a.deadline.localeCompare(b.deadline)),
    needs: bets.filter((b) => s(b) === "closed").sort((a, b) => a.deadline.localeCompare(b.deadline)),
    resolved: bets.filter((b) => s(b) === "settled").sort((a, b) => settledAt(b).localeCompare(settledAt(a))),
  };
  const q = query.trim().toLowerCase();
  const list = byTab[tab].filter((b) => (cat === "All" || b.category === cat) && (!q || b.proposition.toLowerCase().includes(q)));
  const awaitingMe = byTab.needs.filter((b) => b.creatorId === myId);
  const sheetBet = sheet && bets.find((b) => b.id === sheet.betId);

  const ranked = [...(state?.users ?? [])].sort((a, b) => b.balance - a.balance);
  const myRank = ranked.findIndex((u) => u.id === myId) + 1;

  return (
    <main className="relative pt-16 bg-surface min-h-screen w-full px-4 sm:px-6 lg:px-gutter-desktop">
      {sheetBet && <QuickBetSheet bet={sheetBet} initialOutcome={sheet.outcome} onClose={() => setSheet(null)} />}

      <div className="flex flex-col gap-5 py-5 pb-space-xl max-w-[1400px]">
        {/* Heading */}
        <section className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="font-label-sm text-label-sm uppercase tracking-widest text-primary">
              {GROUP.emoji} {GROUP.name} · {state?.users.length ?? "–"} friends
            </span>
            <h1 className="font-headline-lg text-headline-lg text-on-surface leading-tight">Markets</h1>
            <p className="font-body-md text-body-md text-on-surface-variant">Bet reputation points on your friends. The AI Bookie sets a line; the pool shows where the points are.</p>
          </div>
          <button
            onClick={() => openCreateBet()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-container text-on-primary font-label-lg text-label-lg hover:shadow-[0_4px_14px_rgba(52,211,153,0.25)] transition-shadow"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden>
              add
            </span>
            New market
          </button>
        </section>

        {/* Compact personal summary */}
        {me && (
          <section aria-label="Your summary" className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 rounded-2xl bg-surface-container-low ring-1 ring-[#2f384a] font-label-md text-label-md">
            <span className="flex items-center gap-2 text-on-surface">
              <Avatar name={me.name} src={me.avatar} size={24} />
              <b>{me.name.split(" ")[0]}</b>
            </span>
            <span className="text-on-surface-variant">
              Balance <b className="text-primary">{me.balance.toLocaleString()}</b>
            </span>
            <span className="text-on-surface-variant">
              In play <b className="text-on-surface">{me.atRisk.toLocaleString()}</b>
            </span>
            <span className="text-on-surface-variant">
              Record <b className="text-on-surface">{me.stats.wins}-{me.stats.losses}</b>
            </span>
            <Link href="/leaderboard" className="text-on-surface-variant hover:text-on-surface">
              Rank <b className="text-on-surface">#{myRank}</b> of {ranked.length}
            </Link>
            {awaitingMe.length > 0 && (
              <button
                onClick={() => setTab("needs")}
                className="ml-auto px-3 py-1 rounded-full bg-[#fbbf77]/15 text-[#fcd5a4] ring-1 ring-[#fbbf77]/40 hover:bg-[#fbbf77]/25"
              >
                ⚖️ {awaitingMe.length} {awaitingMe.length === 1 ? "bet needs" : "bets need"} your result
              </button>
            )}
          </section>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6 items-start">
          <div className="flex flex-col gap-4 min-w-0">
            {/* Filters */}
            <div role="tablist" aria-label="Browse markets" className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  title={t.hint}
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 px-3.5 py-2 rounded-xl font-label-md text-label-md transition-colors ${
                    tab === t.id ? "bg-on-surface text-surface font-semibold" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                  }`}
                >
                  {t.label}
                  <span className={`ml-1.5 text-[11px] ${tab === t.id ? "opacity-70" : "opacity-60"}`}>{byTab[t.id].length}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1.5 overflow-x-auto">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    aria-pressed={cat === c}
                    onClick={() => setCat(c)}
                    className={`shrink-0 px-3 py-1 rounded-full font-label-sm text-label-sm ring-1 transition-colors ${
                      cat === c ? "bg-primary-container/15 text-primary ring-primary-container/40" : "text-on-surface-variant ring-[#2f384a] hover:text-on-surface"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <label className="relative ml-auto w-full sm:w-56">
                <span className="sr-only">Search markets</span>
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-base text-on-surface-variant" aria-hidden>
                  search
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search markets"
                  className="w-full pl-9 pr-3 py-1.5 rounded-full bg-surface-container-low ring-1 ring-[#2f384a] focus:ring-primary-container outline-none font-body-md text-body-md"
                />
              </label>
            </div>

            {/* Grid */}
            {!state ? (
              <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4" aria-busy="true">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-56 rounded-2xl bg-surface-container animate-pulse" />
                ))}
              </div>
            ) : list.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#414d64] p-10 flex flex-col items-center gap-3 text-center">
                <span className="text-3xl" aria-hidden>
                  🤔
                </span>
                <p className="font-headline-sm text-headline-sm text-on-surface">Nothing here yet</p>
                <p className="font-body-md text-body-md text-on-surface-variant">{TABS.find((t) => t.id === tab)!.hint}.</p>
                <button onClick={() => openCreateBet(query)} className="px-4 py-2 rounded-xl bg-primary-container text-on-primary font-label-lg text-label-lg">
                  Start a market
                </button>
              </div>
            ) : (
              <section aria-label="Markets" className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
                {list.map((b) => (
                  <MarketCard key={b.id} bet={b} now={now || Date.parse(state.serverTime)} onPick={(betId, outcome) => setSheet({ betId, outcome })} />
                ))}
              </section>
            )}
          </div>

          {/* Rail: no markets repeated here */}
          <aside className="flex flex-col gap-4 xl:sticky xl:top-20">
            <section className="rounded-2xl bg-surface-container ring-1 ring-[#2f384a] p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="font-headline-sm text-headline-sm text-on-surface">🏆 Standings</h2>
                <Link href="/leaderboard" className="font-label-sm text-label-sm text-primary hover:underline">
                  All →
                </Link>
              </div>
              <ol className="flex flex-col gap-1.5">
                {ranked.slice(0, 5).map((u, i) => (
                  <li key={u.id} className={`flex items-center gap-2 font-label-md text-label-md ${u.id === myId ? "text-primary" : "text-on-surface"}`}>
                    <span className="w-5 text-on-surface-variant">{i + 1}</span>
                    <Avatar name={u.name} src={u.avatar} size={22} />
                    <span className="flex-1 truncate">{u.name}</span>
                    <span className="font-semibold">{u.balance.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
              {myRank > 5 && (
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  You: #{myRank} · {me?.balance.toLocaleString()} pts
                </p>
              )}
            </section>

            <section className="rounded-2xl bg-tertiary-container/10 ring-1 ring-tertiary-container/25 p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <BookieMark size="sm" />
                <span className="ml-auto font-label-sm text-[11px] text-on-surface-variant">
                  {state?.ai.mode === "claude" ? `Live · ${state.ai.model}` : state?.ai.mode === "stub" ? "Test stub" : "Offline · history only"}
                </span>
              </div>
              <ol className="flex flex-col gap-1.5 font-body-sm text-body-sm text-on-surface-variant list-decimal pl-4">
                <li>Lavender numbers are the AI Bookie&apos;s estimate, built from your group&apos;s settled bets.</li>
                <li>
                  <span className="text-on-surface">Pool</span> is where points are staked. It isn&apos;t a price or a probability.
                </li>
                <li>Entries close at the deadline. Friends post evidence, the Bookie reviews it, and the creator makes the call.</li>
                <li>Winners split the whole pool. Losers owe the dare.</li>
              </ol>
            </section>

            {user(myId ?? "") && (
              <button onClick={() => setTab("mine")} className="text-left font-label-sm text-label-sm text-on-surface-variant hover:text-on-surface px-1">
                Your positions are under <b>My bets</b>.
              </button>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
