"use client";

import { useState } from "react";
import { aiP } from "@/lib/bets/market";
import { estimatePayout } from "@/lib/bets/payout";
import type { BetView } from "@/lib/bets/types";
import { useBookie } from "../BookieProvider";

const CHIPS = [10, 50, 100];

/** Green for the first outcome of a Yes/No bet, rose for the second, teal for multi-choice. */
export const sideTone = (binary: boolean, i: number, active: boolean) =>
  binary && i === 1
    ? active
      ? "bg-[#fb7185] text-[#3b0a14] ring-[#fb7185]"
      : "bg-[#fb7185]/10 text-[#fda4af] ring-[#fb7185]/30 hover:bg-[#fb7185]/20"
    : active
      ? "bg-primary-container text-on-primary ring-primary-container"
      : "bg-primary-container/10 text-primary ring-primary-container/30 hover:bg-primary-container/20";

/**
 * Join a bet: pick an outcome, stake points, see the estimated payout under the
 * shared-pool rule. Joining goes through the same /entries API as before.
 */
export default function TradePanel({ bet, initialOutcome = 0, onJoined }: { bet: BetView; initialOutcome?: number; onJoined?: () => void }) {
  const { me, joinBet, toast } = useBookie();
  const [pick, setPick] = useState(initialOutcome);
  const [amount, setAmount] = useState(50);
  const [busy, setBusy] = useState(false);
  const balance = me?.balance ?? 0;
  const binary = bet.outcomes.length === 2;
  const outcome = bet.outcomes[pick];
  const win = estimatePayout(bet.outcomes.map((o) => o.pool), pick, amount);
  const problem = !amount ? "Enter an amount" : amount > balance ? "Not enough points" : null;

  const confirm = async () => {
    if (problem || busy) return;
    setBusy(true);
    const ok = await joinBet(bet.id, outcome.id, amount);
    setBusy(false);
    if (ok) {
      toast(`✅ ${amount.toLocaleString()} pts on ${outcome.label}. Est. payout ${win.toLocaleString()} pts if it wins.`, "lime");
      onJoined?.();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant mb-2">Pick an outcome</legend>
        <div className={binary ? "grid grid-cols-2 gap-2" : "flex flex-col gap-1.5"}>
          {bet.outcomes.map((o, i) => {
            const ai = aiP(bet, o.id);
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={pick === i}
                onClick={() => setPick(i)}
                className={`rounded-xl ring-1 px-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${binary ? "py-3 flex flex-col items-center gap-0.5" : "py-2.5 flex items-center justify-between gap-2"} ${sideTone(binary, i, pick === i)}`}
              >
                <span className="font-headline-sm text-headline-sm truncate max-w-full">{o.label}</span>
                <span className="font-label-sm text-[11px] opacity-90">
                  {ai !== undefined && `AI ${ai}% · `}pool {o.chance}%
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor={`stake-${bet.id}`} className="font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">
            Stake
          </label>
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            Available <b className="text-on-surface">{balance.toLocaleString()}</b> pts
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-surface-container-lowest ring-1 ring-outline-variant/50 focus-within:ring-primary-container px-4 py-2.5">
          <input
            id={`stake-${bet.id}`}
            type="number"
            inputMode="numeric"
            min={1}
            value={amount}
            onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            className="flex-1 min-w-0 bg-transparent outline-none font-headline-md text-headline-md text-on-surface [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="font-label-md text-label-md text-on-surface-variant">pts</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setAmount((a) => a + c)}
              className="py-1.5 rounded-lg bg-surface-container-high font-label-md text-label-md text-on-surface hover:bg-surface-container-highest"
            >
              +{c}
            </button>
          ))}
          <button type="button" onClick={() => setAmount(balance)} className="py-1.5 rounded-lg bg-surface-container-high font-label-md text-label-md text-on-surface hover:bg-surface-container-highest">
            Max
          </button>
        </div>
      </div>

      <dl className="flex flex-col gap-1.5 p-3 rounded-xl bg-surface-container-lowest font-body-sm text-body-sm">
        <div className="flex justify-between">
          <dt className="text-on-surface-variant">Pool after you join</dt>
          <dd className="text-on-surface">{(bet.pool + amount).toLocaleString()} pts</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-on-surface-variant">Est. payout if {outcome.label} wins</dt>
          <dd className="text-primary font-bold">{win.toLocaleString()} pts</dd>
        </div>
        <p className="text-[11px] leading-snug text-on-surface-variant">
          Estimate only. Winners split the whole pool by stake, so this shrinks if more people join your side and grows if they join the other.
        </p>
      </dl>

      <button
        type="button"
        disabled={!!problem || busy}
        onClick={confirm}
        className={`py-3 rounded-xl ring-1 font-headline-sm text-headline-sm transition-all disabled:opacity-40 ${sideTone(binary, pick, true)}`}
      >
        {problem ?? (busy ? "Joining…" : `Bet ${amount.toLocaleString()} pts on ${outcome.label}`)}
      </button>
      <p className="-mt-2 text-center font-body-sm text-[11px] text-on-surface-variant">Reputation points only. Never money.</p>
    </div>
  );
}
