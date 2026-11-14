"use client";

import { useEffect, useState } from "react";
import { estimatePayout } from "@/lib/bets/payout";
import type { BetView } from "@/lib/bets/types";
import { useBookie } from "./BookieProvider";

const CHIPS = [10, 50, 100];

/** Join sheet: pick an outcome, choose points, see what you'd win from the pool. */
export default function QuickBetSheet({
  bet,
  initialOutcome = 0,
  onClose,
  onJoined,
}: {
  bet: BetView;
  initialOutcome?: number;
  onClose: () => void;
  onJoined?: () => void;
}) {
  const { me, joinBet, toast } = useBookie();
  const [pick, setPick] = useState(initialOutcome);
  const [amount, setAmount] = useState(50);
  const [busy, setBusy] = useState(false);
  const balance = me?.balance ?? 0;
  const pools = bet.outcomes.map((o) => o.pool);
  const win = estimatePayout(pools, pick, amount);
  const tooMuch = amount > balance;
  const outcome = bet.outcomes[pick];
  const binary = bet.outcomes.length === 2;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await joinBet(bet.id, outcome.id, amount);
    setBusy(false);
    if (ok) {
      toast(`✅ ${amount.toLocaleString()} pts on ${outcome.label}. Win about ${win.toLocaleString()} pts if you're right.`, "lime");
      onJoined?.();
      onClose();
    }
  };

  const tone = (i: number) => (binary && i === 1 ? "bg-[#d9a35f] text-[#3a2508]" : "bg-primary-container text-on-primary");

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Join this bet"
        onClick={(e) => e.stopPropagation()}
        className="w-[420px] max-w-[92vw] rounded-2xl bg-surface-container-high border border-[#3a3645] p-6 flex flex-col gap-5 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.35),0_8px_10px_-6px_rgba(0,0,0,0.25)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Your pick</span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface leading-snug">{bet.proposition}</h2>
          </div>
          <button onClick={onClose} className="material-symbols-outlined text-on-surface-variant hover:text-on-surface" aria-label="Close">
            close
          </button>
        </div>

        <div className={`grid gap-2 p-1 rounded-xl bg-surface-container-low ${binary ? "grid-cols-2" : "grid-cols-1"}`}>
          {bet.outcomes.map((o, i) => (
            <button
              key={o.id}
              onClick={() => setPick(i)}
              className={`py-2.5 px-3 rounded-lg font-label-lg text-label-lg transition-all flex justify-between gap-2 ${
                pick === i ? tone(i) : "text-on-surface-variant hover:text-on-surface"
              } ${binary ? "justify-center" : ""}`}
            >
              <span className="truncate">{o.label}</span>
              <span>{binary ? "· " : ""}{o.chance}%</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-label-md text-label-md text-on-surface-variant">Amount</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">You have {balance.toLocaleString()} pts</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-surface-container-low border border-[#3a3645] focus-within:border-primary-container px-4 py-3">
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className="flex-1 bg-transparent outline-none font-headline-md text-headline-md text-on-surface [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              aria-label="Points to bet"
            />
            <span className="font-label-md text-label-md text-on-surface-variant">pts</span>
          </div>
          <div className="flex gap-2">
            {CHIPS.map((c) => (
              <button
                key={c}
                onClick={() => setAmount((a) => a + c)}
                className="flex-1 py-1.5 rounded-full bg-surface-container-low border border-[#3a3645] font-label-md text-label-md text-on-surface hover:border-[#4b4657]"
              >
                +{c}
              </button>
            ))}
            <button
              onClick={() => setAmount(balance)}
              className="flex-1 py-1.5 rounded-full bg-surface-container-low border border-[#3a3645] font-label-md text-label-md text-on-surface hover:border-[#4b4657]"
            >
              Max
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 p-4 rounded-xl bg-surface-container-low">
          <div className="flex justify-between font-body-md text-body-md">
            <span className="text-on-surface-variant">Pool after you join</span>
            <span className="text-on-surface">{(bet.pool + amount).toLocaleString()} pts</span>
          </div>
          <div className="flex justify-between font-body-md text-body-md">
            <span className="text-on-surface-variant">If {outcome.label} wins, you get</span>
            <span className="text-primary font-bold">{win.toLocaleString()} pts</span>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Changes as more friends join.</p>
        </div>

        <button
          disabled={!amount || tooMuch || busy}
          onClick={confirm}
          className={`py-3 rounded-xl font-headline-sm text-headline-sm transition-all disabled:opacity-40 ${tone(pick)}`}
        >
          {tooMuch ? "Not enough points" : busy ? "Joining…" : `Bet ${amount.toLocaleString()} pts on ${outcome.label}`}
        </button>
        <p className="font-body-sm text-body-sm text-on-surface-variant text-center -mt-2">Points only, never money.</p>
      </div>
    </div>
  );
}
