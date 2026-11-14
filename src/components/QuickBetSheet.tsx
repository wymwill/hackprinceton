"use client";

import { useEffect, useRef } from "react";
import type { BetView } from "@/lib/bets/types";
import TradePanel from "./market/TradePanel";

/** The participation panel in a dialog, opened from a market card's Yes/No buttons. */
export default function QuickBetSheet({ bet, initialOutcome = 0, onClose }: { bet: BetView; initialOutcome?: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("[aria-pressed=true]")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`sheet-${bet.id}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:w-[420px] max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-surface-container border border-[#2f384a] p-5 flex flex-col gap-4 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={`sheet-${bet.id}`} className="font-headline-sm text-headline-sm text-on-surface leading-snug">
            {bet.emoji} {bet.proposition}
          </h2>
          <button onClick={onClose} className="material-symbols-outlined text-on-surface-variant hover:text-on-surface" aria-label="Close">
            close
          </button>
        </div>
        <TradePanel bet={bet} initialOutcome={initialOutcome} onJoined={onClose} />
      </div>
    </div>
  );
}
