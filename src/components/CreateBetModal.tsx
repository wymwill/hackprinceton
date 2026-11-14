"use client";

import { useEffect, useState } from "react";
import { FRIENDS, bookieOdds } from "@/lib/data";

const CATEGORIES = [
  { id: "Fitness", emoji: "🏋️" },
  { id: "Habits", emoji: "⏰" },
  { id: "Pop Culture", emoji: "🎬" },
  { id: "Projects", emoji: "🚀" },
];
const STAKES = ["50 PTS", "150 PTS", "250 PTS", "500 PTS"];
const DARES = ["50 burpees on camera", "Wear the rival jersey", "Haiku-only for 24h", "Let the wheel decide 🎡"];

export default function CreateBetModal({
  prefill,
  onClose,
  onPosted,
}: {
  prefill: string;
  onClose: () => void;
  onPosted: (title: string) => void;
}) {
  const [title, setTitle] = useState(prefill);
  const [target, setTarget] = useState(FRIENDS[0]);
  const [category, setCategory] = useState("Fitness");
  const [stake, setStake] = useState(STAKES[2]);
  const [dare, setDare] = useState(DARES[0]);
  const odds = bookieOdds(target, category);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-lg font-label-md text-label-md transition-all ${
      active
        ? "bg-primary-container text-on-primary font-bold shadow-[0_0_12px_rgba(52,211,153,0.17)]"
        : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
    }`;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create a bet"
        className="w-[620px] max-w-[92vw] rounded-2xl bg-surface-container border border-outline-variant/40 p-6 flex flex-col gap-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-headline-md text-headline-md text-on-surface">🎲 Make it a bet</h2>
          <button onClick={onClose} className="material-symbols-outlined text-on-surface-variant hover:text-on-surface" aria-label="Close">
            close
          </button>
        </div>

        <label className="flex flex-col gap-2">
          <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">The claim</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Jake hits the gym 4x this week"
            className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 border border-outline-variant/40 focus:outline-none focus:border-primary-container font-body-lg text-body-lg"
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-2">
            <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Who&apos;s on the hook</span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="bg-surface-container-lowest rounded-xl px-3 py-2.5 border border-outline-variant/40 font-body-md text-body-md"
            >
              {FRIENDS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-2">
            <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Category</span>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button key={c.id} className={chip(category === c.id)} onClick={() => setCategory(c.id)}>
                  {c.emoji} {c.id}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Rep stake</span>
            <div className="flex flex-wrap gap-1.5">
              {STAKES.map((s) => (
                <button key={s} className={chip(stake === s)} onClick={() => setStake(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-label-sm text-label-sm uppercase text-secondary">Loser&apos;s dare</span>
            <div className="flex flex-wrap gap-1.5">
              {DARES.map((d) => (
                <button
                  key={d}
                  onClick={() => setDare(d)}
                  className={`px-3 py-1.5 rounded-lg font-label-md text-label-md transition-all ${
                    dare === d ? "bg-secondary-container text-on-secondary-container font-bold" : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3 p-4 rounded-xl bg-tertiary-container/10 border border-tertiary-container/30 shadow-[0_0_20px_rgba(167,139,250,0.07)]">
          <span className="w-9 h-9 shrink-0 rounded-lg bg-on-tertiary-container/40 flex items-center justify-center text-lg">🤖</span>
          <div className="flex flex-col gap-1 flex-1">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm uppercase text-tertiary-container">Bookie&apos;s opening line</span>
              <span className="font-headline-md text-headline-md text-tertiary">{odds.ratio}</span>
            </div>
            <p className="font-body-md text-body-md text-tertiary/90">{odds.roast}</p>
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              Implied chance: {Math.round(odds.p * 100)}% · Settles automatically from connected apps
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-surface-container-high text-on-surface font-headline-sm text-headline-sm hover:bg-surface-bright">
            Cancel
          </button>
          <button
            disabled={!title.trim()}
            onClick={() => onPosted(title.trim())}
            className="flex-[2] py-3 rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm font-bold shadow-[0_0_20px_rgba(52,211,153,0.2)] hover:shadow-[0_0_28px_rgba(52,211,153,0.33)] disabled:opacity-40 disabled:shadow-none transition-all"
          >
            Post to group · {stake}
          </button>
        </div>
      </div>
    </div>
  );
}
