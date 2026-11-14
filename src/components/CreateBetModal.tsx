"use client";

import { useEffect, useState } from "react";
import { useNow } from "@/lib/bets/format";
import { baselineEstimate, recordsFromViews } from "@/lib/bets/odds";
import type { CreateBetInput } from "@/lib/bets/types";
import { useBookie } from "./BookieProvider";

const CATEGORIES = [
  { id: "Fitness", emoji: "🏋️" },
  { id: "Habits", emoji: "⏰" },
  { id: "Pop Culture", emoji: "🎬" },
  { id: "Projects", emoji: "🚀" },
];
const STAKES = [50, 150, 250, 500];
const DARES = ["50 burpees on camera", "Wear the rival jersey", "Haiku-only for 24h", "Let the wheel decide 🎡"];
const DEADLINES: { id: string; label: string; at: (now: number) => Date }[] = [
  { id: "5m", label: "5 min", at: (now) => new Date(now + 5 * 60_000) },
  { id: "1h", label: "1 hour", at: (now) => new Date(now + 3_600_000) },
  { id: "tonight", label: "Tonight", at: (now) => endOfDay(now, 0) },
  { id: "tomorrow", label: "Tomorrow", at: (now) => endOfDay(now, 1) },
  { id: "week", label: "1 week", at: (now) => new Date(now + 7 * 86_400_000) },
];

function endOfDay(now: number, days: number) {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 0, 0);
  return d;
}

/** Value for <input type="datetime-local"> in local time. */
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export default function CreateBetModal({
  prefill,
  onClose,
  onPosted,
}: {
  prefill: string;
  onClose: () => void;
  onPosted: (bet: { id: string; proposition: string }) => void;
}) {
  const { me, state, createBet } = useBookie();
  const [title, setTitle] = useState(prefill);
  const [subjectId, setSubjectId] = useState("");
  const [category, setCategory] = useState("Fitness");
  const [outcomes, setOutcomes] = useState(["Yes", "No"]);
  const [pick, setPick] = useState(0);
  const [stake, setStake] = useState(150);
  const [deadline, setDeadline] = useState("tomorrow");
  const [custom, setCustom] = useState(() => toLocalInput(endOfDay(Date.now(), 1)));
  const [dare, setDare] = useState(DARES[0]);
  const [busy, setBusy] = useState(false);

  const balance = me?.balance ?? 0;
  const labels = outcomes.map((o) => o.trim());
  // Same history-only estimate the server stores when the bet is posted.
  const preview = baselineEstimate({
    outcomes: labels.map((label, i) => ({ id: `o${i + 1}`, label: label || `Outcome ${i + 1}` })),
    category,
    subjectId: subjectId || undefined,
    subjectName: state?.users.find((u) => u.id === subjectId)?.name,
    history: recordsFromViews(state?.bets ?? []),
  });
  const dupes = new Set(labels.map((l) => l.toLowerCase())).size !== labels.length;
  const now = useNow();
  const deadlineAt = (at: number) => (deadline === "custom" ? new Date(custom) : DEADLINES.find((d) => d.id === deadline)!.at(at));
  const problem = !title.trim()
    ? "Write the claim first"
    : labels.some((l) => !l)
      ? "Name every outcome"
      : dupes
        ? "Outcomes need different names"
        : !(deadlineAt(now).getTime() > now)
          ? "Deadline must be in the future"
          : !Number.isInteger(stake) || stake < 1
            ? "Stake at least 1 pt"
            : stake > balance
              ? `You only have ${balance.toLocaleString()} pts`
              : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (problem || busy) return;
    setBusy(true);
    const input: CreateBetInput = {
      proposition: title.trim(),
      outcomes: labels,
      // Recompute presets at submit time (now ticks every second) so "5 min" means 5 minutes from now.
      deadline: deadlineAt(now).toISOString(),
      stake,
      pick,
      category,
      emoji: CATEGORIES.find((c) => c.id === category)?.emoji,
      dare,
      subjectId: subjectId || undefined,
    };
    const bet = await createBet(input);
    setBusy(false);
    if (bet) onPosted({ id: bet.id, proposition: input.proposition });
  };

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-lg font-label-md text-label-md transition-all ${
      active
        ? "bg-primary-container text-on-primary font-bold shadow-[0_0_12px_rgba(206,76,59,0.17)]"
        : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
    }`;
  const label = "font-label-sm text-label-sm uppercase text-on-surface-variant";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create a bet"
        className="w-[660px] max-w-[92vw] max-h-[92vh] overflow-y-auto rounded-2xl bg-surface-container border border-outline-variant/40 p-6 flex flex-col gap-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-headline-md text-headline-md text-on-surface">🎲 Make it a bet</h2>
          <button onClick={onClose} className="material-symbols-outlined text-on-surface-variant hover:text-on-surface" aria-label="Close">
            close
          </button>
        </div>

        <label className="flex flex-col gap-2">
          <span className={label}>The claim</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={140}
            placeholder="Will Jake hit the gym 4x this week?"
            className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 border border-outline-variant/40 focus:outline-none focus:border-primary-container font-body-lg text-body-lg"
          />
        </label>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className={label}>Outcomes · tap the one you&apos;re backing</span>
            {outcomes.length < 6 && (
              <button
                onClick={() => setOutcomes((o) => [...o, ""])}
                className="font-label-md text-label-md text-primary hover:underline"
              >
                + Add outcome
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {outcomes.map((o, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
                  pick === i ? "border-primary-container bg-primary-container/10" : "border-outline-variant/40 bg-surface-container-lowest"
                }`}
              >
                <input
                  type="radio"
                  name="pick"
                  checked={pick === i}
                  onChange={() => setPick(i)}
                  aria-label={`Back outcome ${i + 1}`}
                  className="accent-[#ce4c3b]"
                />
                <input
                  value={o}
                  maxLength={40}
                  onChange={(e) => setOutcomes((all) => all.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`Outcome ${i + 1}`}
                  className="flex-1 min-w-0 bg-transparent outline-none font-body-md text-body-md"
                />
                {outcomes.length > 2 && (
                  <button
                    onClick={() => {
                      setOutcomes((all) => all.filter((_, j) => j !== i));
                      setPick((p) => (p === i ? 0 : p > i ? p - 1 : p));
                    }}
                    className="material-symbols-outlined text-base text-on-surface-variant hover:text-on-surface"
                    aria-label={`Remove outcome ${i + 1}`}
                  >
                    close
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <span className={label}>Your stake · {balance.toLocaleString()} pts available</span>
            <div className="flex flex-wrap gap-1.5 items-center">
              {STAKES.map((s) => (
                <button key={s} className={chip(stake === s)} onClick={() => setStake(s)} disabled={s > balance}>
                  {s}
                </button>
              ))}
              <input
                type="number"
                min={1}
                value={stake}
                onChange={(e) => setStake(Math.floor(Number(e.target.value) || 0))}
                aria-label="Custom stake"
                className="w-20 px-2 py-1.5 rounded-lg bg-surface-container-lowest border border-outline-variant/40 font-label-md text-label-md"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className={label}>Entries close</span>
            <div className="flex flex-wrap gap-1.5">
              {DEADLINES.map((d) => (
                <button key={d.id} className={chip(deadline === d.id)} onClick={() => setDeadline(d.id)}>
                  {d.label}
                </button>
              ))}
              <button className={chip(deadline === "custom")} onClick={() => setDeadline("custom")}>
                Pick…
              </button>
            </div>
            {deadline === "custom" && (
              <input
                type="datetime-local"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/40 font-body-md text-body-md"
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <span className={label}>Category</span>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button key={c.id} className={chip(category === c.id)} onClick={() => setCategory(c.id)}>
                  {c.emoji} {c.id}
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

        <div className="flex items-start gap-3 p-4 rounded-xl bg-tertiary-container/10 border border-tertiary-container/30 shadow-[0_0_20px_rgba(127,140,232,0.07)]">
          <span className="w-9 h-9 shrink-0 rounded-lg bg-on-tertiary-container/40 flex items-center justify-center text-lg">🤖</span>
          <div className="flex flex-col gap-1 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-label-sm text-label-sm uppercase text-tertiary-container">Who&apos;s on the hook</span>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="bg-transparent font-label-md text-label-md text-tertiary"
                aria-label="Who's on the hook"
              >
                <option value="">Nobody in particular</option>
                {state?.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <span className="ml-auto font-headline-md text-headline-md text-tertiary">
                {Math.round(preview.probabilities[0].p * 100)}%
              </span>
            </div>
            <p className="font-body-md text-body-md text-tertiary/90">{preview.explanation}</p>
            {preview.facts.map((f) => (
              <p key={f.id} className="font-label-sm text-label-sm text-on-surface-variant">
                • {f.text}
              </p>
            ))}
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              Preview from stored history{state?.ai.mode === "claude" ? ". The AI Bookie refines it after you post." : "."} Winners split the pool.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-surface-container-high text-on-surface font-headline-sm text-headline-sm hover:bg-surface-bright">
            Cancel
          </button>
          <button
            disabled={!!problem || busy}
            onClick={submit}
            className="flex-[2] py-3 rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm font-bold shadow-[0_0_20px_rgba(206,76,59,0.2)] hover:shadow-[0_0_28px_rgba(206,76,59,0.33)] disabled:opacity-40 disabled:shadow-none transition-all"
          >
            {busy ? "Posting…" : (problem ?? `Post to group · ${stake.toLocaleString()} pts on ${labels[pick] || "…"}`)}
          </button>
        </div>
      </div>
    </div>
  );
}
