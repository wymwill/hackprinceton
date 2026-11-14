"use client";

import Link from "next/link";
import { useState } from "react";
import { ago, timeLeft, useNow } from "@/lib/bets/format";
import Avatar from "./Avatar";
import { liveStatus, useBookie } from "./BookieProvider";
import QuickBetSheet from "./QuickBetSheet";

/** The group's real bets, newest first, as feed cards you can join from. */
export default function GroupFeed({ groupId = "gym-arc" }: { groupId?: string }) {
  const { state, user, openCreateBet } = useBookie();
  const now = useNow();
  const [sheet, setSheet] = useState<{ betId: string; outcome: number } | null>(null);
  if (!state) return null;

  const bets = state.bets.filter((b) => b.groupId === groupId);
  const sheetBet = sheet && bets.find((b) => b.id === sheet.betId);

  return (
    <div className="flex flex-col gap-space-md">
      {sheetBet && <QuickBetSheet bet={sheetBet} initialOutcome={sheet.outcome} onClose={() => setSheet(null)} />}
      <div className="flex items-center justify-between">
        <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-semibold">Group bets</span>
        <button onClick={() => openCreateBet()} className="font-label-md text-label-md text-primary hover:underline">
          + New bet
        </button>
      </div>
      {bets.length === 0 && (
        <p className="p-space-md rounded-xl bg-surface-container font-body-md text-body-md text-on-surface-variant">No bets yet. Start one.</p>
      )}
      {bets.map((b) => {
        const s = liveStatus(b, now);
        const creator = user(b.creatorId);
        const mine = b.entries.find((e) => e.userId === state.me);
        const winner = b.receipt && b.outcomes.find((o) => o.id === b.receipt!.outcomeId);
        return (
          <article key={b.id} className="relative overflow-clip rounded-xl bg-surface-container p-space-md shadow-md flex flex-col gap-space-sm">
            <div className={`absolute top-0 left-0 bottom-0 w-1 ${s === "open" ? "bg-primary-container" : s === "closed" ? "bg-[#fbbf77]" : "bg-tertiary"}`} />
            <div className="flex items-center gap-space-xs font-body-sm text-body-sm text-on-surface-variant">
              <Avatar name={creator?.name ?? "?"} src={creator?.avatar} size={22} />
              <span>
                <b className="text-on-surface">{creator?.name}</b> posted a bet · {ago(b.createdAt, now)}
              </span>
              <span className="ml-auto font-label-sm text-label-sm">
                {s === "open" ? `⏱ ${timeLeft(b.deadline, now)}` : s === "closed" ? "🔒 Closed" : "✅ Settled"}
              </span>
            </div>
            <Link href={`/bets/${b.id}`} className="font-headline-sm text-headline-sm text-on-surface hover:text-primary leading-snug">
              {b.emoji} {b.proposition}
            </Link>
            <div className="flex flex-wrap gap-2">
              {b.outcomes.map((o, i) => (
                <button
                  key={o.id}
                  disabled={s !== "open" || !!mine}
                  onClick={() => setSheet({ betId: b.id, outcome: i })}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-label-md text-label-md border transition-colors ${
                    winner?.id === o.id
                      ? "bg-primary-container text-on-primary border-primary-container"
                      : mine?.outcomeId === o.id
                        ? "bg-primary-container/15 text-primary border-primary-container/40"
                        : "bg-surface-container-high text-on-surface border-transparent enabled:hover:border-primary-container/40 disabled:opacity-70"
                  }`}
                >
                  {winner?.id === o.id && "🏆"} {o.label} <span className="opacity-70" title="Share of points staked">{o.chance}% pool</span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant">
              <span>
                {b.pool.toLocaleString()} pts · {b.entries.length} in
                {mine && ` · you: ${mine.amount} on ${b.outcomes.find((o) => o.id === mine.outcomeId)!.label}`}
                {b.odds && s !== "settled" && (
                  <span className="text-tertiary">
                    {" "}· 🤖 AI {Math.round((b.odds.probabilities[0]?.p ?? 0) * 100)}% {b.outcomes[0].label}
                  </span>
                )}
              </span>
              {s === "settled" ? (
                <Link href={`/receipts/${b.id}`} className="text-primary hover:underline">
                  Receipt →
                </Link>
              ) : s === "closed" && b.creatorId === state.me ? (
                <Link href={`/bets/${b.id}`} className="text-[#fcd5a4] hover:underline">
                  Record the result →
                </Link>
              ) : (
                <Link href={`/bets/${b.id}`} className="hover:text-on-surface">
                  Details →
                </Link>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
