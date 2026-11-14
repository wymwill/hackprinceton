"use client";

import Link from "next/link";
import { liveStatus, useBookie } from "../BookieProvider";
import Avatar from "../Avatar";
import BookieMark, { UncertaintyMeter } from "./BookieMark";
import { sideTone } from "./TradePanel";
import { aiP, aiSource, payoutMultiple } from "@/lib/bets/market";
import { timeLeft } from "@/lib/bets/format";
import type { BetView } from "@/lib/bets/types";

const MAX_ROWS = 3;

/**
 * A compact market. The big number is the AI Bookie's estimate (with its mark);
 * the stacked bar underneath is where points are staked, labelled as such.
 */
export default function MarketCard({ bet, now, onPick }: { bet: BetView; now: number; onPick: (betId: string, outcome: number) => void }) {
  const { state, user } = useBookie();
  const status = liveStatus(bet, now);
  const binary = bet.outcomes.length === 2;
  const me = state?.me;
  const mine = bet.entries.find((e) => e.userId === me);
  const subject = bet.subjectId ? user(bet.subjectId) : undefined;
  const src = aiSource(bet.odds, state?.ai.mode ?? "off");
  const winner = bet.receipt && bet.outcomes.find((o) => o.id === bet.receipt!.outcomeId);
  const myResult = bet.receipt?.payouts.find((p) => p.userId === me);
  const soon = status === "open" && Date.parse(bet.deadline) - now < 12 * 3_600_000;
  const href = `/bets/${bet.id}`;
  const friends = [...new Set(bet.entries.map((e) => e.userId))];

  return (
    <article className="group relative flex flex-col gap-3 rounded-2xl bg-surface-container ring-1 ring-[#2f384a] hover:ring-[#414d64] p-4 transition-colors">
      {/* Title */}
      <div className="flex items-start gap-3">
        {subject ? (
          <span className="relative shrink-0">
            <Avatar name={subject.name} src={subject.avatar} size={40} className="rounded-xl!" />
            <span className="absolute -bottom-1 -right-1 text-sm" aria-hidden>
              {bet.emoji}
            </span>
          </span>
        ) : (
          <span aria-hidden className="w-10 h-10 shrink-0 rounded-xl bg-surface-container-high flex items-center justify-center text-xl">
            {bet.emoji}
          </span>
        )}
        <h3 className="flex-1 min-w-0 font-label-lg text-label-lg leading-snug text-on-surface">
          <Link href={href} className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none group-focus-within:underline hover:text-primary">
            {bet.proposition}
          </Link>
        </h3>
        {binary && bet.odds && status !== "settled" && (
          <div className="flex flex-col items-end shrink-0 leading-none" title="AI Bookie's estimated chance">
            <span className="font-headline-md text-headline-md text-tertiary">{aiP(bet, bet.outcomes[0].id)}%</span>
            <span className="font-label-sm text-[10px] text-tertiary/80 mt-1">AI · {bet.outcomes[0].label}</span>
          </div>
        )}
      </div>

      {/* AI source line */}
      {bet.odds && status !== "settled" && (
        <div className="flex items-center gap-2 flex-wrap">
          <BookieMark size="xs" label={false} />
          <span className="font-label-sm text-[11px] text-on-surface-variant">{src.label}</span>
          <UncertaintyMeter level={bet.odds.uncertainty} compact />
        </div>
      )}

      {/* Outcomes */}
      {binary ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex h-2 rounded-full overflow-hidden bg-surface-container-high" aria-hidden>
            <span className="bg-primary-container/80" style={{ width: `${bet.outcomes[0].chance}%` }} />
            <span className="bg-[#fb7185]/70" style={{ width: `${bet.outcomes[1].chance}%` }} />
          </div>
          <div className="flex justify-between font-label-sm text-[11px] text-on-surface-variant">
            <span>
              Pool: <b className="text-primary">{bet.outcomes[0].chance}%</b> {bet.outcomes[0].label}
            </span>
            <span>
              <b className="text-[#fda4af]">{bet.outcomes[1].chance}%</b> {bet.outcomes[1].label}
            </span>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-1" aria-label="Outcomes">
          <li className="grid grid-cols-[1fr_auto_auto] gap-x-3 font-label-sm text-[10px] uppercase text-on-surface-variant">
            <span>Outcome</span>
            <span className="text-right text-tertiary">AI</span>
            <span className="text-right">Pool</span>
          </li>
          {bet.outcomes.slice(0, MAX_ROWS).map((o) => (
            <li key={o.id} className={`grid grid-cols-[1fr_auto_auto] gap-x-3 items-center font-body-sm text-body-sm ${winner?.id === o.id ? "text-primary" : "text-on-surface"}`}>
              <span className="truncate">
                {winner?.id === o.id && "🏆 "}
                {o.label}
              </span>
              <span className="w-10 text-right text-tertiary">{aiP(bet, o.id) ?? "–"}%</span>
              <span className="w-10 text-right text-on-surface-variant">{o.chance}%</span>
            </li>
          ))}
          {bet.outcomes.length > MAX_ROWS && <li className="font-label-sm text-[11px] text-on-surface-variant">+{bet.outcomes.length - MAX_ROWS} more</li>}
        </ul>
      )}

      {/* Action / state */}
      <div className="relative z-10 mt-auto">
        {status === "settled" ? (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-tertiary-container/10 ring-1 ring-tertiary-container/25">
            <span className="font-label-md text-label-md text-on-surface">
              Resolved: <b className="text-primary">{winner?.label}</b>
            </span>
            {myResult && (
              <span className={`font-label-md text-label-md font-bold ${myResult.net >= 0 ? "text-primary" : "text-[#fda4af]"}`}>
                {myResult.net >= 0 ? "+" : ""}
                {myResult.net} pts
              </span>
            )}
          </div>
        ) : status === "closed" ? (
          <Link href={href} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#fbbf77]/10 ring-1 ring-[#fbbf77]/30 hover:ring-[#fbbf77]/60">
            <span className="font-label-md text-label-md text-[#fcd5a4]">🔒 Entries closed · awaiting result</span>
            <span className="font-label-sm text-label-sm text-[#fcd5a4]">{bet.creatorId === me ? "Settle →" : `${bet.evidence.length} evidence`}</span>
          </Link>
        ) : mine ? (
          <Link href={href} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-surface-container-low ring-1 ring-outline-variant/40 hover:ring-outline-variant">
            <span className="font-label-md text-label-md text-on-surface">
              You&apos;re in: {mine.amount} on <b>{bet.outcomes.find((o) => o.id === mine.outcomeId)?.label}</b>
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">View →</span>
          </Link>
        ) : binary ? (
          <div className="grid grid-cols-2 gap-2">
            {bet.outcomes.map((o, i) => (
              <button
                key={o.id}
                onClick={() => onPick(bet.id, i)}
                className={`py-2 rounded-xl ring-1 font-label-lg text-label-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${sideTone(true, i, false)}`}
                aria-label={`Bet ${o.label} on: ${bet.proposition}`}
              >
                {o.label} <span className="font-label-sm text-[11px] opacity-80">· pays ~{payoutMultiple(bet, i).toFixed(1)}×</span>
              </button>
            ))}
          </div>
        ) : (
          <button
            onClick={() => onPick(bet.id, 0)}
            className="w-full py-2 rounded-xl ring-1 font-label-lg text-label-lg bg-primary-container/10 text-primary ring-primary-container/30 hover:bg-primary-container/20"
          >
            Pick an outcome
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 font-label-sm text-[11px] text-on-surface-variant">
        <span className="flex items-center gap-2 min-w-0">
          <span className="flex -space-x-1.5" aria-hidden>
            {friends.slice(0, 4).map((id) => {
              const u = user(id);
              return <Avatar key={id} name={u?.name ?? "?"} src={u?.avatar} size={18} className="ring-2 ring-surface-container" />;
            })}
          </span>
          <span className="truncate">
            {bet.pool.toLocaleString()} pts staked · {friends.length} in
          </span>
        </span>
        <span className={`whitespace-nowrap ${soon ? "text-[#fcd5a4]" : ""}`}>
          {status === "settled" ? "Settled" : status === "closed" ? "Closed" : `⏱ ${timeLeft(bet.deadline, now)}`}
        </span>
      </div>
    </article>
  );
}
