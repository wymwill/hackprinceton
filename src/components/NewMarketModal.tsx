"use client";

import { useState } from "react";
import { CATEGORIES, type DareSpec } from "@/lib/markets/types";
import { useApp } from "./AppProvider";
import BookieMark from "./BookieMark";
import { Button, Field, Modal, input, label } from "./ui";

const PRESETS = [
  { id: "1h", label: "1 hour", at: () => Date.now() + 3600_000 },
  {
    id: "tonight",
    label: "Tonight",
    at: () => {
      const d = new Date();
      d.setHours(23, 59, 0, 0);
      return d.getTime() > Date.now() + 15 * 60_000 ? d.getTime() : d.getTime() + 86400_000;
    },
  },
  { id: "1d", label: "1 day", at: () => Date.now() + 86400_000 },
  { id: "1w", label: "1 week", at: () => Date.now() + 7 * 86400_000 },
] as const;

type DareKind = "none" | "preset" | "bookie" | "wheel" | "custom";

export default function NewMarketModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { state, createMarket, suggestDare } = useApp();
  const group = state?.group;
  const [question, setQuestion] = useState("");
  const [rule, setRule] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [category, setCategory] = useState<string>("fitness");
  const [when, setWhen] = useState<string>("1d");
  const [custom, setCustom] = useState("");
  const [chance, setChance] = useState(50);
  const [dareKind, setDareKind] = useState<DareKind>("preset");
  const [dareText, setDareText] = useState(group?.darePresets[0] ?? "");
  const [suggesting, setSuggesting] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!group) return null;

  const deadline = () => {
    const p = PRESETS.find((x) => x.id === when);
    return new Date(p ? p.at() : Date.parse(custom)).toISOString();
  };

  const askBookie = async () => {
    if (question.trim().length < 3) return;
    setSuggesting(true);
    setDareKind("bookie");
    const r = await suggestDare(question, rule || undefined);
    setSuggesting(false);
    if (r) setDareText(r.text);
  };

  const dare = (): DareSpec =>
    dareKind === "none" ? { kind: "none" } : dareKind === "wheel" ? { kind: "wheel" } : { kind: dareKind, text: dareText.trim() };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (when === "custom" && !custom) return;
    setBusy(true);
    const r = await createMarket({
      question,
      rule: rule || undefined,
      deadline: deadline(),
      chance: group.mode === "tokens" ? chance : undefined,
      dare: dare(),
      subjectId: subjectId || undefined,
      category,
    });
    setBusy(false);
    if (r) onCreated(r.id);
  };

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full font-label-md text-label-md ring-1 transition-colors ${active ? "bg-primary-container/20 text-primary ring-primary-container/50" : "bg-surface-container-high text-on-surface-variant ring-transparent hover:text-on-surface"}`;
  const needsText = dareKind === "preset" || dareKind === "custom" || dareKind === "bookie";

  return (
    <Modal title="New market" onClose={onClose} wide>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="The question">
          <input className={input} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Will Jake make 6 AM leg day?" maxLength={140} autoFocus />
        </Field>
        <Field label="How we'll know">
          <input className={input} value={rule} onChange={(e) => setRule(e.target.value)} placeholder="Gym check in before 6:15" maxLength={160} />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Who's it about" hint="The Bookie checks their track record.">
            <select className={input} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Nobody in particular</option>
              {group.members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kind of thing">
            <select className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c[0].toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={label}>Closes</span>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" className={chip(when === p.id)} onClick={() => setWhen(p.id)}>
                {p.label}
              </button>
            ))}
            <button type="button" className={chip(when === "custom")} onClick={() => setWhen("custom")}>
              Pick a time
            </button>
          </div>
          {when === "custom" && <input type="datetime-local" className={input} value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Closing time" />}
        </div>
        {group.mode === "tokens" && (
          <Field label={`Starting chance: ${chance}%`} hint="The Bookie will adjust this before anyone trades.">
            <input type="range" min={5} max={95} value={chance} onChange={(e) => setChance(Number(e.target.value))} className="accent-[#ce4c3b]" />
          </Field>
        )}
        <div className="flex flex-col gap-1.5">
          <span className={label}>Loser&apos;s dare</span>
          <div className="flex flex-wrap gap-1.5">
            {group.darePresets.slice(0, 4).map((d) => (
              <button
                key={d}
                type="button"
                className={chip(dareKind === "preset" && dareText === d)}
                onClick={() => {
                  setDareKind("preset");
                  setDareText(d);
                }}
              >
                {d}
              </button>
            ))}
            <button type="button" className={chip(dareKind === "wheel")} onClick={() => setDareKind("wheel")}>
              Spin the wheel
            </button>
            <button type="button" className={chip(dareKind === "custom")} onClick={() => (setDareKind("custom"), setDareText(""))}>
              Write my own
            </button>
            <button type="button" className={chip(dareKind === "none")} onClick={() => setDareKind("none")}>
              No dare
            </button>
          </div>
          <button
            type="button"
            onClick={askBookie}
            disabled={question.trim().length < 3 || suggesting}
            className={`self-start mt-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-full ring-1 font-label-md text-label-md disabled:opacity-40 ${dareKind === "bookie" ? "bg-tertiary-container/25 ring-tertiary-container text-tertiary" : "bg-tertiary-container/10 ring-tertiary-container/40 text-tertiary"}`}
          >
            <BookieMark size="xs" label={false} />
            {suggesting ? "Thinking…" : "Ask the Bookie for one"}
          </button>
          {(dareKind === "custom" || dareKind === "bookie") && (
            <input className={input} value={dareText} onChange={(e) => setDareText(e.target.value)} placeholder="What does the loser do?" maxLength={80} aria-label="Dare" />
          )}
          {dareKind === "wheel" && <p className="font-body-sm text-body-sm text-on-surface-variant">Picks one of the group&apos;s dares when the market settles.</p>}
        </div>
        <Button tone="primary" type="submit" disabled={busy || question.trim().length < 3 || (needsText && !dareText.trim()) || (when === "custom" && !custom)}>
          Post market
        </Button>
      </form>
    </Modal>
  );
}
