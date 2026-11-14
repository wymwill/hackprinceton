"use client";

import { useEffect, useState } from "react";
import { MY_BALANCE, payout } from "@/lib/markets";

export type QuickBet = { marketTitle: string; option: string; side: "yes" | "no"; chance: number };

const CHIPS = [10, 50, 100];

export default function QuickBetSheet({
  bet,
  onClose,
  onConfirm,
}: {
  bet: QuickBet;
  onClose: () => void;
  onConfirm: (side: "yes" | "no", amount: number) => void;
}) {
  const [side, setSide] = useState(bet.side);
  const [amount, setAmount] = useState(50);
  const chance = side === "yes" ? bet.chance : 100 - bet.chance;
  const win = payout(amount, chance);
  const tooMuch = amount > MY_BALANCE;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Place a bet"
        onClick={(e) => e.stopPropagation()}
        className="w-[420px] max-w-[92vw] rounded-2xl bg-surface-container-high border border-[#2f384a] p-6 flex flex-col gap-5 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.35),0_8px_10px_-6px_rgba(0,0,0,0.25)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="font-label-sm text-label-sm text-on-surface-variant">{bet.option === "Yes" ? "Your pick" : bet.option}</span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface leading-snug">{bet.marketTitle}</h2>
          </div>
          <button onClick={onClose} className="material-symbols-outlined text-on-surface-variant hover:text-on-surface" aria-label="Close">
            close
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-surface-container-low">
          {(["yes", "no"] as const).map((s) => {
            const c = s === "yes" ? bet.chance : 100 - bet.chance;
            const active = side === s;
            return (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`py-2.5 rounded-lg font-label-lg text-label-lg transition-all ${
                  active
                    ? s === "yes"
                      ? "bg-primary-container text-on-primary"
                      : "bg-[#fb7185] text-[#3b0a14]"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {s === "yes" ? "Yes" : "No"} · {c}%
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-label-md text-label-md text-on-surface-variant">Amount</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">You have {MY_BALANCE.toLocaleString()} pts</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-surface-container-low border border-[#2f384a] focus-within:border-primary-container px-4 py-3">
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
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
                className="flex-1 py-1.5 rounded-full bg-surface-container-low border border-[#2f384a] font-label-md text-label-md text-on-surface hover:border-[#414d64]"
              >
                +{c}
              </button>
            ))}
            <button
              onClick={() => setAmount(MY_BALANCE)}
              className="flex-1 py-1.5 rounded-full bg-surface-container-low border border-[#2f384a] font-label-md text-label-md text-on-surface hover:border-[#414d64]"
            >
              Max
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 p-4 rounded-xl bg-surface-container-low">
          <div className="flex justify-between font-body-md text-body-md">
            <span className="text-on-surface-variant">Chance</span>
            <span className="text-on-surface">{chance}%</span>
          </div>
          <div className="flex justify-between font-body-md text-body-md">
            <span className="text-on-surface-variant">If you&apos;re right, you get</span>
            <span className="text-primary font-bold">{win.toLocaleString()} pts</span>
          </div>
        </div>

        <button
          disabled={!amount || tooMuch}
          onClick={() => onConfirm(side, amount)}
          className={`py-3 rounded-xl font-headline-sm text-headline-sm transition-all disabled:opacity-40 ${
            side === "yes"
              ? "bg-primary-container text-on-primary hover:shadow-[0_4px_14px_rgba(52,211,153,0.25)]"
              : "bg-[#fb7185] text-[#3b0a14] hover:shadow-[0_4px_14px_rgba(251,113,133,0.25)]"
          }`}
        >
          {tooMuch ? "Not enough points" : `Bet ${amount.toLocaleString()} pts on ${side === "yes" ? "Yes" : "No"}`}
        </button>
        <p className="font-body-sm text-body-sm text-on-surface-variant text-center -mt-2">Points only, never money.</p>
      </div>
    </div>
  );
}
