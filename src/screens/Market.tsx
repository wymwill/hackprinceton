"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Side } from "@/lib/markets/types";
import { timeLeft, useNow } from "@/lib/format";
import Avatar from "@/components/Avatar";
import BookieCard from "@/components/BookieCard";
import ChanceChart from "@/components/ChanceChart";
import ResolutionPanel from "@/components/ResolutionPanel";
import TradeTicket from "@/components/TradeTicket";
import { useGroup } from "@/components/useGroup";
import { Button, Empty, Loading, NotInGroup, card, label } from "@/components/ui";

const STATUS = { open: "Open", closed: "Needs a result", review: "Group is voting", settled: "Settled" };

export default function Market() {
  const { state, group, missing, marketId, name, pick, closeMarket } = useGroup();
  const params = useSearchParams();
  const now = useNow(1000);
  if (missing) return <NotInGroup />;
  if (!group || !state || !now) return <Loading />;
  const m = state.markets.find((x) => x.id === marketId);
  if (!m)
    return (
      <Empty icon="search_off" title="Market not found">
        <Link href={`/g/${group.id}`} className="text-primary hover:underline">
          Back to markets
        </Link>
      </Empty>
    );

  const isHost = m.hostId === state.me;
  const initialSide: Side = params.get("side") === "no" ? "no" : "yes";
  const myPick = m.picks.find((p) => p.userId === state.me);
  const dare = m.receipt?.dareText ?? (m.dare?.kind === "wheel" ? "Spin the wheel when it settles" : m.dare && "text" in m.dare ? m.dare.text : undefined);
  const holders = m.positions.filter((p) => p.yes > 0 || p.no > 0);

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/g/${group.id}`} className="self-start inline-flex items-center gap-1 font-label-md text-label-md text-on-surface-variant hover:text-on-surface">
        <span className="material-symbols-outlined text-[18px]" aria-hidden>arrow_back</span>Markets
      </Link>
      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="flex flex-col gap-5 min-w-0">
          <header className="flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap font-label-sm text-label-sm">
              <span className={`px-2 py-0.5 rounded-full ring-1 ${m.status === "open" ? "text-primary ring-primary-container/50" : "text-on-surface-variant ring-outline-variant"}`}>{STATUS[m.status]}</span>
              <span className="text-on-surface-variant">
                Hosted by {name(m.hostId)} · {m.status === "open" ? `closes in ${timeLeft(m.deadline, now)}` : `closed ${new Date(m.deadline).toLocaleDateString()}`}
              </span>
            </div>
            <h1 className="font-display text-headline-lg-mobile sm:text-headline-lg text-on-surface">{m.question}</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-body-sm text-body-sm text-on-surface-variant">
              {m.subjectId && (
                <span className="flex items-center gap-1.5">
                  <Avatar name={name(m.subjectId)} size={18} /> About {name(m.subjectId)}
                </span>
              )}
              {m.rule && <span>How we&apos;ll know: {m.rule}</span>}
              {dare && <span className="text-secondary">Loser&apos;s dare: {dare}</span>}
            </div>
          </header>

          <section className={`${card} p-4 flex flex-col gap-2`}>
            <div className="flex items-end justify-between gap-3">
              <div className="flex items-end gap-2">
                {m.receipt ? (
                  <>
                    <span className="font-display text-[40px] leading-none text-on-surface">{m.receipt.voided ? "Void" : `Settled ${m.receipt.outcome === "yes" ? "Yes" : "No"}`}</span>
                    <span className="pb-1 font-body-sm text-body-sm text-on-surface-variant">last price {m.chance}%</span>
                  </>
                ) : (
                  <>
                    <span className="font-num text-[40px] leading-none font-semibold text-on-surface">{m.chance}%</span>
                    <span className="pb-1 font-body-sm text-body-sm text-on-surface-variant">{group.mode === "tokens" ? "chance of Yes" : "picked Yes"}</span>
                  </>
                )}
              </div>
              <span className="flex items-center gap-3 font-label-sm text-xs text-on-surface-variant">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-primary inline-block" /> Market
                </span>
                {m.bookie && (
                  <span className="flex items-center gap-1 text-tertiary">
                    <span className="w-2 h-2 rounded-full bg-tertiary inline-block" /> Bookie
                  </span>
                )}
              </span>
            </div>
            <ChanceChart market={m} now={now} />
          </section>

          <ResolutionPanel market={m} group={group} now={now} />

          <section className={`${card} p-4 flex flex-col gap-2`} aria-label={group.mode === "tokens" ? "Positions" : "Picks"}>
            <h2 className={label}>{group.mode === "tokens" ? `Who holds what (${holders.length})` : `Picks (${m.picks.length})`}</h2>
            {group.mode === "tokens" ? (
              holders.length ? (
                <ul className="flex flex-col divide-y divide-[#3a3645]">
                  {holders.map((p) => (
                    <li key={p.userId} className="flex items-center justify-between py-2 font-body-md text-body-md">
                      <span className="flex items-center gap-2">
                        <Avatar name={name(p.userId)} size={24} /> {name(p.userId)}
                      </span>
                      <span className="font-num text-[13px]">
                        {p.yes > 0 && <span className="text-primary">{p.yes} Yes</span>}
                        {p.yes > 0 && p.no > 0 && " · "}
                        {p.no > 0 && <span className="text-secondary">{p.no} No</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-body-sm text-body-sm text-on-surface-variant">Nobody has traded yet.</p>
              )
            ) : m.picks.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {m.picks.map((p) => (
                  <li key={p.userId} className={`px-2.5 py-1 rounded-full font-label-md text-label-md ${p.side === "yes" ? "bg-primary-container/15 text-primary" : "bg-secondary/10 text-secondary"}`}>
                    {name(p.userId)} · {p.side === "yes" ? "Yes" : "No"}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-body-sm text-body-sm text-on-surface-variant">No picks yet.</p>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
          {m.status === "open" &&
            (group.mode === "tokens" ? (
              <TradeTicket key={initialSide} market={m} initialSide={initialSide} />
            ) : (
              <section className={`${card} p-4 flex flex-col gap-3`} aria-label="Your pick">
                <h2 className={label}>Your pick</h2>
                <div className="grid grid-cols-2 gap-2">
                  {(["yes", "no"] as const).map((s) => (
                    <Button key={s} tone={s === "yes" ? "yes" : "no"} className={`py-6 text-[18px] ${myPick?.side === s ? "ring-2" : ""}`} onClick={() => pick(m.id, s)}>
                      {myPick?.side === s ? "✓ " : ""}
                      {s === "yes" ? "Yes" : "No"}
                    </Button>
                  ))}
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Change it until it closes. Bold calls score more.</p>
              </section>
            ))}
          {m.status === "open" && isHost && (
            <Button onClick={() => closeMarket(m.id)}>Close trading early</Button>
          )}
          <BookieCard market={m} now={now} />
        </aside>
      </div>
    </div>
  );
}
