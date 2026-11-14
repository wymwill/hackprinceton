"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { MarketStatus } from "@/lib/markets/types";
import { ago, timeLeft, useNow } from "@/lib/format";
import BookieMark from "@/components/BookieMark";
import MarketCard from "@/components/MarketCard";
import { useGroup } from "@/components/useGroup";
import { Button, Empty, Loading, NotInGroup, amount, card, label } from "@/components/ui";

const FILTERS: { id: MarketStatus; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "closed", label: "Needs result" },
  { id: "review", label: "In review" },
  { id: "settled", label: "Settled" },
];

const EXPLAINER_KEY = "bwf_explainer_dismissed";

export default function Markets() {
  const { state, group, missing, name, open } = useGroup();
  const params = useSearchParams();
  const now = useNow(1000);
  const [filter, setFilter] = useState<MarketStatus>((params.get("f") as MarketStatus) || "open");
  const [explainer, setExplainer] = useState(false);

  useEffect(() => {
    try {
      const t = setTimeout(() => setExplainer(localStorage.getItem(EXPLAINER_KEY) !== "1"), 0);
      return () => clearTimeout(t);
    } catch {}
  }, []);

  if (missing) return <NotInGroup />;
  if (!group || !state || !now) return <Loading />;

  const markets = state.markets;
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, markets.filter((m) => m.status === f.id).length]));
  const shown = markets.filter((m) => m.status === filter);
  const soon = markets.filter((m) => m.status === "open" && Date.parse(m.deadline) - now < 86400_000).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 4);

  const mine = markets.flatMap((m) => {
    if (m.status === "settled") return [];
    const p = m.positions.find((x) => x.userId === state.me);
    const pk = m.picks.find((x) => x.userId === state.me);
    if (p && (p.yes > 0 || p.no > 0)) return [{ m, text: p.yes > 0 ? `${p.yes} Yes` : `${p.no} No` }];
    if (pk) return [{ m, text: `Picked ${pk.side === "yes" ? "Yes" : "No"}` }];
    return [];
  });

  const activity = markets
    .flatMap((m) => [
      { at: m.createdAt, text: `${name(m.hostId)} posted “${m.question}”`, href: m.id, bookie: false },
      ...(m.bookie ? [{ at: m.bookie.at, text: `Bookie set ${m.bookie.chance}% on “${m.question}”`, href: m.id, bookie: true }] : []),
      ...(m.receipt ? [{ at: m.receipt.settledAt, text: `“${m.question}” settled ${m.receipt.outcome === "void" ? "void" : m.receipt.outcome.toUpperCase()}`, href: m.id, bookie: false }] : []),
    ])
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 10);

  return (
    <div className="grid xl:grid-cols-[1fr_300px] gap-6">
      <div className="flex flex-col gap-5 min-w-0">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-headline-lg text-on-surface">
              {group.emoji} {group.name}
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant">
              {group.members.length} {group.members.length === 1 ? "member" : "friends"} · playing for {group.mode}
            </p>
          </div>
          <Button tone="primary" onClick={() => open("new-market")}>
            + New market
          </Button>
        </div>

        {explainer && (
          <div className={`${card} p-4 flex gap-4 items-start`}>
            <BookieMark size="md" label={false} />
            <div className="flex-1 grid sm:grid-cols-3 gap-3 font-body-sm text-body-sm text-on-surface-variant">
              <p>
                <b className="text-on-surface">Ask Yes or No.</b> The Bookie sets the odds.
              </p>
              <p>
                <b className="text-on-surface">{group.mode === "tokens" ? "Buy Yes or No." : "Make your pick."}</b> {group.mode === "tokens" ? "Price = chance. Wins pay 100." : "Bold calls score more."}
              </p>
              <p>
                <b className="text-on-surface">Settle with proof.</b> Loser does the dare.
              </p>
            </div>
            <button
              onClick={() => {
                setExplainer(false);
                try {
                  localStorage.setItem(EXPLAINER_KEY, "1");
                } catch {}
              }}
              aria-label="Dismiss how it works"
              className="text-on-surface-variant hover:text-on-surface"
            >
              <span className="material-symbols-outlined block" aria-hidden>
                close
              </span>
            </button>
          </div>
        )}

        {soon.length > 0 && (
          <section aria-label="Closing soon" className="flex flex-col gap-2">
            <h2 className={label}>Closing soon</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {soon.map((m) => (
                <Link key={m.id} href={`/g/${group.id}/m/${m.id}`} className={`${card} p-3 hover:ring-outline-variant flex flex-col gap-1.5`}>
                  <span className="font-label-md text-label-md text-on-surface line-clamp-2">{m.question}</span>
                  <span className="flex items-center justify-between font-label-sm text-xs">
                    <span className="font-num text-primary text-[13px]">{m.chance}%</span>
                    <span className="text-secondary">{timeLeft(m.deadline, now)}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div role="tablist" aria-label="Filter markets" className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3.5 py-1.5 rounded-full font-label-md text-label-md ring-1 ${filter === f.id ? "bg-primary-container/20 text-primary ring-primary-container/50" : "bg-surface-container text-on-surface-variant ring-[#333238] hover:text-on-surface"}`}
            >
              {f.label} <span className="font-num opacity-70">{counts[f.id]}</span>
            </button>
          ))}
        </div>

        {shown.length ? (
          <div className="grid md:grid-cols-2 gap-3">
            {shown.map((m) => (
              <MarketCard key={m.id} market={m} group={group} now={now} />
            ))}
          </div>
        ) : (
          <Empty icon="inbox" title={filter === "open" ? "No open markets" : "Nothing here yet"}>
            {filter === "open" && <p>Post one to get started.</p>}
          </Empty>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <section className={`${card} p-4 flex flex-col gap-3`}>
          <h2 className={label}>Your positions</h2>
          {mine.length ? (
            mine.map(({ m, text }) => (
              <Link key={m.id} href={`/g/${group.id}/m/${m.id}`} className="flex items-center justify-between gap-2 hover:text-primary">
                <span className="font-body-sm text-body-sm text-on-surface line-clamp-1">{m.question}</span>
                <span className="font-num text-[12px] text-primary whitespace-nowrap">{text}</span>
              </Link>
            ))
          ) : (
            <p className="font-body-sm text-body-sm text-on-surface-variant">Nothing yet. {group.mode === "tokens" ? `You have ${amount(state.group!.members.find((x) => x.userId === state.me)?.balance ?? 0, "tokens")} tokens to play.` : "Make a pick on any open market."}</p>
          )}
        </section>
        <section className={`${card} p-4 flex flex-col gap-3`}>
          <h2 className={label}>Recent activity</h2>
          <ul className="flex flex-col gap-2.5">
            {activity.map((a, i) => (
              <li key={i}>
                <Link href={`/g/${group.id}/m/${a.href}`} className={`flex flex-col font-body-sm text-body-sm hover:underline ${a.bookie ? "text-tertiary" : "text-on-surface"}`}>
                  <span className="line-clamp-2">{a.text}</span>
                  <span className="font-label-sm text-xs text-on-surface-variant">{ago(a.at, now)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
