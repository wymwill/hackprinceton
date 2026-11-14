"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import AiOddsPanel from "@/components/AiOddsPanel";
import AuditTrail from "@/components/AuditTrail";
import Avatar from "@/components/Avatar";
import { liveStatus, useBookie } from "@/components/BookieProvider";
import EvidencePanel from "@/components/EvidencePanel";
import BookieMark, { SourceChip, UncertaintyMeter } from "@/components/market/BookieMark";
import ProbabilityChart from "@/components/market/ProbabilityChart";
import TradePanel from "@/components/market/TradePanel";
import SettlementReview from "@/components/SettlementReview";
import { aiP, aiSource, timeline } from "@/lib/bets/market";
import { ago, timeLeft, useNow } from "@/lib/bets/format";

const STATUS = {
  open: { label: "Open", cls: "bg-primary-container/15 text-primary ring-primary-container/30" },
  closed: { label: "Closed · needs result", cls: "bg-[#f0a87a]/15 text-[#f6caa8] ring-[#f0a87a]/30" },
  settled: { label: "Resolved", cls: "bg-tertiary-container/15 text-tertiary ring-tertiary-container/30" },
};

type Tab = "activity" | "evidence" | "audit";

/** One market: price, history, AI analysis, rules, activity, and the participation / settlement panel. */
export default function LiveBet() {
  const { id } = useParams<{ id: string }>();
  const { state, user, closeBet, toast } = useBookie();
  const now = useNow();
  const [chartOutcome, setChartOutcome] = useState(0);
  const [picked, setTab] = useState<Tab | null>(null);

  const bet = state?.bets.find((b) => b.id === id);
  if (!state) return <Shell>Loading…</Shell>;
  if (!bet)
    return (
      <Shell>
        <p className="font-headline-sm text-headline-sm text-on-surface">That market doesn&apos;t exist.</p>
        <Link href="/" className="text-primary hover:underline">
          Back to markets
        </Link>
      </Shell>
    );

  const t = now || Date.parse(state.serverTime);
  const status = liveStatus(bet, t);
  const me = state.me;
  const isCreator = bet.creatorId === me;
  const mine = bet.entries.find((e) => e.userId === me);
  const creator = user(bet.creatorId);
  const subject = bet.subjectId ? user(bet.subjectId) : undefined;
  const winner = bet.receipt && bet.outcomes.find((o) => o.id === bet.receipt!.outcomeId);
  const binary = bet.outcomes.length === 2;
  const src = aiSource(bet.odds, state.ai.mode);
  const series = timeline(bet, chartOutcome);
  const end = bet.receipt ? Date.parse(bet.receipt.settledAt) : Math.max(t, Date.parse(bet.createdAt) + 60_000);
  const myResult = bet.receipt?.payouts.find((p) => p.userId === me);
  // Once entries close, evidence is what matters, so lead with it.
  const tab: Tab = picked ?? (status === "open" ? "activity" : "evidence");

  const tabs: { id: Tab; label: string }[] = [
    { id: "activity", label: `Activity (${bet.entries.length})` },
    { id: "evidence", label: `Evidence (${bet.evidence.length})` },
    { id: "audit", label: `Audit trail (${bet.audit.length})` },
  ];

  return (
    <main className="relative pt-16 bg-surface min-h-screen w-full px-4 sm:px-6 lg:px-gutter-desktop">
      <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_360px] gap-5 lg:gap-6 py-5 pb-space-xl max-w-[1280px]">
        {/* ---------- Header + price (main column, top) ---------- */}
        <div className="flex flex-col gap-4 min-w-0 lg:col-start-1 lg:row-start-1">
          <Link href="/" className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface w-fit">
            ← Markets
          </Link>
          <header className="flex items-start gap-3">
            {subject ? (
              <span className="relative shrink-0">
                <Avatar name={subject.name} src={subject.avatar} size={56} className="rounded-2xl!" />
                <span className="absolute -bottom-1 -right-1 text-lg" aria-hidden>
                  {bet.emoji}
                </span>
              </span>
            ) : (
              <span aria-hidden className="w-14 h-14 shrink-0 rounded-2xl bg-surface-container-high flex items-center justify-center text-3xl">
                {bet.emoji}
              </span>
            )}
            <div className="flex flex-col gap-1.5 min-w-0">
              <h1 className="font-headline-md text-headline-md sm:font-headline-lg sm:text-headline-lg text-on-surface leading-tight">{bet.proposition}</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-label-sm text-label-sm text-on-surface-variant">
                <span className={`px-2 py-0.5 rounded-full ring-1 ${STATUS[status].cls}`}>{STATUS[status].label}</span>
                <span>{bet.category}</span>
                <span>by {creator?.name ?? "someone"}</span>
                {subject && <span>on the hook: {subject.name}</span>}
                <span>{status === "open" ? `⏱ closes in ${timeLeft(bet.deadline, t)}` : `entries closed ${ago(bet.deadline, t)}`}</span>
              </div>
            </div>
          </header>

          {/* Price block: AI estimate vs pool, side by side */}
          <section aria-label="Odds" className="rounded-2xl bg-surface-container ring-1 ring-[#3a3645] p-4 sm:p-5 flex flex-col gap-4">
            {binary ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-tertiary-container/10 ring-1 ring-tertiary-container/25">
                  <div className="flex items-center gap-2 flex-wrap">
                    <BookieMark size="sm" />
                    <SourceChip label={src.label} tone={src.tone} title={"reason" in src ? src.reason : undefined} />
                  </div>
                  {bet.odds ? (
                    <>
                      <span className="font-display-lg text-display-lg leading-none text-tertiary">
                        {aiP(bet, bet.outcomes[0].id)}%<span className="ml-2 font-headline-sm text-headline-sm text-tertiary/80">{bet.outcomes[0].label}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-3">
                        <UncertaintyMeter level={bet.odds.uncertainty} />
                        {bet.odds.range && (
                          <span className="font-label-sm text-[11px] text-on-surface-variant">
                            likely {bet.odds.range[0]}–{bet.odds.range[1]}%
                          </span>
                        )}
                      </span>
                    </>
                  ) : (
                    <span className="font-body-md text-body-md text-on-surface-variant">No estimate yet.</span>
                  )}
                  <span className="font-label-sm text-[11px] text-on-surface-variant">Estimated chance it actually happens.</span>
                </div>
                <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-surface-container-low ring-1 ring-[#3a3645]">
                  <span className="font-label-sm text-label-sm font-semibold text-on-surface-variant">🪙 Pool share</span>
                  <span className="font-display-lg text-display-lg leading-none text-on-surface">
                    {bet.outcomes[0].chance}%<span className="ml-2 font-headline-sm text-headline-sm text-on-surface-variant">{bet.outcomes[0].label}</span>
                  </span>
                  <div className="flex h-2 rounded-full overflow-hidden bg-surface-container-high" aria-hidden>
                    <span className="bg-primary-container/80" style={{ width: `${bet.outcomes[0].chance}%` }} />
                    <span className="bg-[#d9a35f]/70" style={{ width: `${bet.outcomes[1].chance}%` }} />
                  </div>
                  <span className="font-label-sm text-[11px] text-on-surface-variant">
                    {bet.outcomes[0].pool.toLocaleString()} vs {bet.outcomes[1].pool.toLocaleString()} pts staked. Where the points are, not a probability.
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <BookieMark size="sm" />
                  <SourceChip label={src.label} tone={src.tone} title={"reason" in src ? src.reason : undefined} />
                  {bet.odds && <UncertaintyMeter level={bet.odds.uncertainty} />}
                </div>
                <table className="w-full font-body-md text-body-md">
                  <thead>
                    <tr className="font-label-sm text-[11px] uppercase text-on-surface-variant">
                      <th className="text-left font-normal py-1">Outcome</th>
                      <th className="text-right font-normal py-1 text-tertiary">AI Bookie</th>
                      <th className="text-right font-normal py-1">Pool share</th>
                      <th className="text-right font-normal py-1 hidden sm:table-cell">Staked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bet.outcomes.map((o) => (
                      <tr key={o.id} className={`border-t border-[#3a3645] ${winner?.id === o.id ? "text-primary" : "text-on-surface"}`}>
                        <td className="py-2">
                          {winner?.id === o.id && "🏆 "}
                          {o.label}
                        </td>
                        <td className="py-2 text-right font-headline-sm text-headline-sm text-tertiary">{aiP(bet, o.id) ?? "–"}%</td>
                        <td className="py-2 text-right text-on-surface-variant">{o.chance}%</td>
                        <td className="py-2 text-right text-on-surface-variant hidden sm:table-cell">
                          {o.pool.toLocaleString()} · {o.backers}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Chart: recorded data only */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-label-md text-label-md text-on-surface">History · {bet.outcomes[chartOutcome].label}</h2>
                {!binary && (
                  <select
                    value={chartOutcome}
                    onChange={(e) => setChartOutcome(Number(e.target.value))}
                    aria-label="Outcome to chart"
                    className="px-2 py-1 rounded-lg bg-surface-container-low ring-1 ring-[#3a3645] font-label-sm text-label-sm"
                  >
                    {bet.outcomes.map((o, i) => (
                      <option key={o.id} value={i}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <ProbabilityChart ai={series.ai} pool={series.pool} start={Date.parse(bet.createdAt)} end={end} outcome={bet.outcomes[chartOutcome].label} />
            </div>
          </section>
        </div>

        {/* ---------- Side panel: participate / settle (sticky on desktop) ---------- */}
        <aside aria-label={status === "open" ? "Place a bet" : "Settlement"} className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <div className="lg:sticky lg:top-20 flex flex-col gap-4">
            {status === "settled" && bet.receipt ? (
              <section className="rounded-2xl bg-surface-container ring-1 ring-tertiary-container/30 p-4 flex flex-col gap-2">
                <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Resolved</span>
                <span className="font-headline-lg text-headline-lg text-primary">{winner?.label}</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  Settled by {user(bet.receipt.settledBy)?.name} {ago(bet.receipt.settledAt, t)}
                  {bet.receipt.reviewId ? ", confirming the AI Bookie's recommendation" : ""}.
                </span>
                {myResult && (
                  <span className={`font-headline-sm text-headline-sm ${myResult.net >= 0 ? "text-primary" : "text-[#e9bf86]"}`}>
                    {myResult.net > 0 ? `You won ${myResult.net} pts` : myResult.net < 0 ? `You lost ${-myResult.net} pts` : "You got your stake back"}
                  </span>
                )}
                <Link href={`/receipts/${bet.id}`} className="mt-1 py-2.5 text-center rounded-xl bg-primary-container text-on-primary font-label-lg text-label-lg">
                  See the receipt
                </Link>
              </section>
            ) : status === "closed" ? (
              <SettlementReview bet={bet} />
            ) : mine ? (
              <section className="rounded-2xl bg-surface-container ring-1 ring-[#3a3645] p-4 flex flex-col gap-2">
                <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Your position</span>
                <span className="font-headline-md text-headline-md text-on-surface">
                  {mine.amount.toLocaleString()} pts on {bet.outcomes.find((o) => o.id === mine.outcomeId)?.label}
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">One entry per friend. Add evidence below if you see it happen.</span>
              </section>
            ) : (
              <section className="rounded-2xl bg-surface-container ring-1 ring-[#3a3645] p-4 flex flex-col gap-3">
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Place a bet</h2>
                <TradePanel bet={bet} />
              </section>
            )}

            {status === "open" && (
              <section className="rounded-2xl bg-surface-container-low ring-1 ring-[#3a3645] p-4 flex flex-col gap-2">
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  Entries close automatically in <b className="text-on-surface">{timeLeft(bet.deadline, t)}</b>. Then {isCreator ? "you record" : `${creator?.name.split(" ")[0]} records`} the result.
                </span>
                {isCreator && (
                  <button
                    onClick={async () => (await closeBet(bet.id)) && toast("🔒 Entries closed. Collect evidence, then settle.", "purple")}
                    className="py-2 rounded-xl bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-bright"
                  >
                    Close entries now
                  </button>
                )}
              </section>
            )}
          </div>
        </aside>

        {/* ---------- Main column, below the fold ---------- */}
        <div className="flex flex-col gap-5 min-w-0 lg:col-start-1 lg:row-start-2">
          <AiOddsPanel bet={bet} />

          <section aria-labelledby="rules" className="rounded-2xl bg-surface-container ring-1 ring-[#3a3645] p-4 flex flex-col gap-2">
            <h2 id="rules" className="font-headline-sm text-headline-sm text-on-surface">
              Rules
            </h2>
            <ul className="flex flex-col gap-1.5 font-body-md text-body-md text-on-surface-variant list-disc pl-5">
              <li>
                Resolves to one of: {bet.outcomes.map((o) => o.label).join(", ")}.
              </li>
              <li>Entries close {new Date(bet.deadline).toLocaleString()}.</li>
              <li>
                After that, friends in the bet add evidence and can ask the AI Bookie to review it. {creator?.name ?? "The creator"} makes the final call; the AI never settles on its own.
              </li>
              <li>Winners split the whole pool by stake. If nobody backed the result, everyone gets their points back.</li>
              {bet.dare && (
                <li>
                  Loser&apos;s dare: <b className="text-secondary">{bet.dare}</b>
                </li>
              )}
            </ul>
          </section>

          <section className="rounded-2xl bg-surface-container ring-1 ring-[#3a3645] overflow-hidden">
            <div role="tablist" aria-label="Market details" className="flex border-b border-[#3a3645] overflow-x-auto">
              {tabs.map((x) => (
                <button
                  key={x.id}
                  role="tab"
                  id={`tab-${x.id}`}
                  aria-selected={tab === x.id}
                  aria-controls={`panel-${x.id}`}
                  onClick={() => setTab(x.id)}
                  className={`shrink-0 px-4 py-3 font-label-md text-label-md border-b-2 transition-colors ${
                    tab === x.id ? "border-primary-container text-on-surface" : "border-transparent text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {x.label}
                </button>
              ))}
            </div>
            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="p-4">
              {tab === "activity" && (
                <ul className="flex flex-col divide-y divide-[#3a3645]">
                  {bet.entries.map((e) => {
                    const u = user(e.userId);
                    const o = bet.outcomes.find((x) => x.id === e.outcomeId)!;
                    const i = bet.outcomes.indexOf(o);
                    const p = bet.receipt?.payouts.find((x) => x.userId === e.userId);
                    return (
                      <li key={e.id} className="flex items-center gap-3 py-2.5">
                        <Avatar name={u?.name ?? "?"} src={u?.avatar} />
                        <span className="flex-1 min-w-0 font-body-md text-body-md text-on-surface truncate">
                          <b>{u?.name}</b>
                          {e.userId === me && <span className="text-primary"> (you)</span>}
                          <span className="text-on-surface-variant"> · {ago(e.createdAt, t)}</span>
                        </span>
                        <span className={`px-2 py-0.5 rounded-md font-label-sm text-label-sm ${binary && i === 1 ? "bg-[#d9a35f]/15 text-[#e9bf86]" : "bg-primary-container/15 text-primary"}`}>
                          {e.amount.toLocaleString()} on {o.label}
                        </span>
                        {p && (
                          <span className={`w-16 text-right font-label-md text-label-md font-bold ${p.net >= 0 ? "text-primary" : "text-[#e9bf86]"}`}>
                            {p.net >= 0 ? "+" : ""}
                            {p.net}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {tab === "evidence" && <EvidencePanel bet={bet} bare />}
              {tab === "audit" && <AuditTrail bet={bet} bare />}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative pt-16 bg-surface min-h-screen w-full px-4 lg:px-gutter-desktop">
      <div className="py-6 flex flex-col gap-2 font-body-md text-body-md text-on-surface-variant">{children}</div>
    </main>
  );
}
