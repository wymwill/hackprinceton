"use client";

import { useState } from "react";

export type Vote = "uphold" | "overturn";

const SQUAD: { name: string; vote: Vote | null; note?: string }[] = [
  { name: "Sam Vance", vote: "uphold", note: "I literally have the medal" },
  { name: "Elena Rostova", vote: "uphold" },
  { name: "Jake Harper", vote: "overturn", note: "optical illusion at mile 21" },
  { name: "Marcus Reed", vote: null },
  { name: "Priya Sharma", vote: null },
];

export default function DisputeVoteModal({
  onClose,
  onVoted,
}: {
  onClose: () => void;
  onVoted: (tally: { uphold: number; overturn: number }, mine: Vote) => void;
}) {
  const [mine, setMine] = useState<Vote | null>(null);
  const votes = [...SQUAD.map((m) => m.vote), mine].filter(Boolean) as Vote[];
  const uphold = votes.filter((v) => v === "uphold").length;
  const overturn = votes.filter((v) => v === "overturn").length;
  const total = SQUAD.length + 1;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Dispute vote"
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-[92vw] rounded-2xl bg-surface-container border border-secondary-container/50 p-6 flex flex-col gap-4 shadow-[0_0_40px_rgba(150,105,50,0.17)]"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">⚖️ Squad Tribunal · #BET-8704</h2>
          <button onClick={onClose} className="material-symbols-outlined text-on-surface-variant hover:text-on-surface" aria-label="Close">
            close
          </button>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Jake disputes the verdict. Overturning the AI Bookie needs a <span className="text-secondary font-bold">3/5 majority</span>.
        </p>

        <div className="flex flex-col gap-1.5">
          {SQUAD.map((m) => (
            <div key={m.name} className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container-low">
              <div className="flex flex-col">
                <span className="font-label-md text-label-md text-on-surface font-semibold">{m.name}</span>
                {m.note && <span className="font-body-sm text-body-sm text-on-surface-variant italic">“{m.note}”</span>}
              </div>
              <span
                className={`font-label-sm text-label-sm px-2 py-0.5 rounded-full font-bold ${
                  m.vote === "uphold"
                    ? "bg-primary/15 text-primary"
                    : m.vote === "overturn"
                      ? "bg-secondary-container/40 text-secondary"
                      : "bg-surface-container-highest text-on-surface-variant"
                }`}
              >
                {m.vote === "uphold" ? "UPHOLD" : m.vote === "overturn" ? "OVERTURN" : "THINKING…"}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between font-label-md text-label-md">
            <span className="text-primary font-bold">{uphold} Uphold</span>
            <span className="text-secondary font-bold">{overturn} Overturn</span>
          </div>
          <div className="w-full h-2 rounded-full bg-surface-container-lowest overflow-hidden flex">
            <div className="h-full bg-primary transition-all" style={{ width: `${(uphold / total) * 100}%` }} />
            <div className="flex-1" />
            <div className="h-full bg-secondary transition-all" style={{ width: `${(overturn / total) * 100}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMine("uphold")}
            className={`py-3 rounded-xl font-headline-sm text-headline-sm font-bold transition-all ${
              mine === "uphold" ? "bg-primary-container text-on-primary shadow-[0_0_20px_rgba(206,76,59,0.2)]" : "bg-surface-container-high text-on-surface hover:bg-surface-bright"
            }`}
          >
            👍 Uphold verdict
          </button>
          <button
            onClick={() => setMine("overturn")}
            className={`py-3 rounded-xl font-headline-sm text-headline-sm font-bold transition-all ${
              mine === "overturn" ? "bg-secondary-container text-on-secondary-container shadow-[0_0_20px_rgba(150,105,50,0.23)]" : "bg-surface-container-high text-on-surface hover:bg-surface-bright"
            }`}
          >
            👎 Overturn
          </button>
        </div>
        <button
          disabled={!mine}
          onClick={() => mine && onVoted({ uphold, overturn }, mine)}
          className="py-2.5 rounded-xl bg-surface-container-highest text-on-surface font-label-lg text-label-lg disabled:opacity-40 hover:bg-surface-bright"
        >
          Cast vote
        </button>
      </div>
    </div>
  );
}
