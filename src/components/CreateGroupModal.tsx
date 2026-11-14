"use client";

import { useState } from "react";
import { useApp } from "./AppProvider";
import { Button, Field, Modal, Segmented, input } from "./ui";

const EMOJI = ["🎲", "🔥", "🏋️", "🍕", "🎮", "📚", "☕", "🌙"];

export default function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { createGroup } = useApp();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🎲");
  const [mode, setMode] = useState<"tokens" | "points">("tokens");
  const [balance, setBalance] = useState(1000);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await createGroup({ name, emoji, mode, startingBalance: mode === "tokens" ? balance : undefined });
    setBusy(false);
    if (r) onCreated(r.id);
  };

  return (
    <Modal title="Create a group" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Roommates, the gym crew…" maxLength={40} autoFocus />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Emoji</span>
          <div className="flex gap-1.5 flex-wrap">
            {EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                aria-label={`Use ${e}`}
                aria-pressed={emoji === e}
                className={`w-10 h-10 rounded-xl text-lg ${emoji === e ? "bg-primary-container/25 ring-1 ring-primary-container" : "bg-surface-container-high"}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <Field label="Play for" hint={mode === "tokens" ? "Everyone gets the same starting tokens and trades Yes or No." : "No spending. Everyone makes a pick, and calling it against the crowd scores more."}>
          <Segmented
            ariaLabel="Currency"
            value={mode}
            onChange={setMode}
            options={[
              { value: "tokens", label: "Tokens" },
              { value: "points", label: "Points" },
            ]}
          />
        </Field>
        {mode === "tokens" && (
          <Field label="Starting tokens">
            <input className={input} type="number" min={100} max={100000} step={100} value={balance} onChange={(e) => setBalance(Number(e.target.value))} />
          </Field>
        )}
        <Button tone="primary" type="submit" disabled={busy || name.trim().length < 2}>
          Create group
        </Button>
      </form>
    </Modal>
  );
}
