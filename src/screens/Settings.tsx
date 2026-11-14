"use client";

import { useState } from "react";
import type { GroupView } from "@/lib/markets/types";
import Avatar from "@/components/Avatar";
import ShareInvite, { inviteUrl } from "@/components/ShareInvite";
import { useGroup } from "@/components/useGroup";
import { Button, Field, Loading, NotInGroup, Segmented, card, input, label } from "@/components/ui";

export default function Settings() {
  const { state, group, missing } = useGroup();
  if (missing) return <NotInGroup />;
  if (!group || !state) return <Loading />;
  // Remount the form when the group or its saved values change.
  return <SettingsForm key={`${group.id}:${group.name}:${group.emoji}:${group.darePresets.join("|")}:${group.mode}:${group.startingBalance}`} group={group} me={state.me} />;
}

function SettingsForm({ group, me }: { group: GroupView; me: string }) {
  const { updateGroup, resetInvite, removeMember, toast } = useGroup();
  const owner = group.ownerId === me;
  const [name, setName] = useState(group.name);
  const [emoji, setEmoji] = useState(group.emoji);
  const [presets, setPresets] = useState(group.darePresets);
  const [newDare, setNewDare] = useState("");
  const [mode, setMode] = useState(group.mode);
  const [balance, setBalance] = useState(group.startingBalance);

  const save = async () => {
    const patch: Record<string, unknown> = { name, emoji, darePresets: presets };
    if (!group.locked && (mode !== group.mode || balance !== group.startingBalance)) Object.assign(patch, { mode, startingBalance: mode === "tokens" ? balance : undefined });
    if (await updateGroup(patch)) toast("Saved.");
  };

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div>
        <h1 className="font-display text-headline-lg text-on-surface">Settings</h1>
        {!owner && <p className="font-body-md text-body-md text-on-surface-variant">Only the owner can change these.</p>}
      </div>

      <section className={`${card} p-5 flex flex-col gap-3`}>
        <h2 className={label}>Invite friends</h2>
        <p className="font-body-md text-body-md text-on-surface">Send the link. Friends tap it, see the group, and join in one tap.</p>
        <div className="flex flex-wrap items-center gap-2">
          <ShareInvite group={group} />
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(inviteUrl(group.inviteCode));
                toast("Invite link copied.");
              } catch {
                toast("Couldn't copy. Select the link instead.", "warn");
              }
            }}
          >
            Copy link
          </Button>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Or use the code <span className="font-num tracking-[0.2em] text-on-surface">{group.inviteCode}</span> with Join with code in the group menu.
        </p>
        {owner && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={async () => {
                if (!window.confirm("Make a new invite link? The current link and code stop working right away.")) return;
                if (await resetInvite()) toast("New invite link made. The old one no longer works.");
              }}
            >
              New invite link
            </Button>
            <span className="font-body-sm text-body-sm text-on-surface-variant">Use this if the link reached someone it shouldn&apos;t have.</span>
          </div>
        )}
      </section>

      <fieldset disabled={!owner} className={`${card} p-5 flex flex-col gap-4 disabled:opacity-80`}>
        <div className="grid grid-cols-[80px_1fr] gap-3">
          <Field label="Emoji">
            <input className={`${input} text-center text-lg`} value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} />
          </Field>
          <Field label="Name">
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </Field>
        </div>
        <Field label="Play for" hint={group.locked ? "Locked after the first market." : undefined}>
          <div className={group.locked ? "pointer-events-none opacity-50" : ""}>
            <Segmented
              ariaLabel="Currency"
              value={mode}
              onChange={setMode}
              options={[
                { value: "tokens", label: "Tokens" },
                { value: "points", label: "Points" },
              ]}
            />
          </div>
        </Field>
        {mode === "tokens" && (
          <Field label="Starting tokens" hint={group.locked ? "Locked after the first market." : undefined}>
            <input className={input} type="number" min={100} max={100000} step={100} value={balance} disabled={group.locked} onChange={(e) => setBalance(Number(e.target.value))} />
          </Field>
        )}
        <div className="flex flex-col gap-2">
          <span className={label}>Dare presets ({presets.length}/10)</span>
          <ul className="flex flex-col gap-1.5">
            {presets.map((d, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container-lowest">
                <span className="flex-1 font-body-md text-body-md text-on-surface">{d}</span>
                {owner && (
                  <button type="button" onClick={() => setPresets(presets.filter((_, k) => k !== i))} aria-label={`Remove ${d}`} className="text-on-surface-variant hover:text-secondary">
                    <span className="material-symbols-outlined text-[18px] block" aria-hidden>
                      close
                    </span>
                  </button>
                )}
              </li>
            ))}
          </ul>
          {owner && presets.length < 10 && (
            <div className="flex gap-2">
              <input className={input} value={newDare} onChange={(e) => setNewDare(e.target.value)} placeholder="Add a dare" maxLength={80} aria-label="New dare" />
              <Button
                type="button"
                disabled={!newDare.trim()}
                onClick={() => {
                  setPresets([...presets, newDare.trim()]);
                  setNewDare("");
                }}
              >
                Add
              </Button>
            </div>
          )}
        </div>
        {owner && (
          <Button tone="primary" type="button" onClick={save} className="self-start">
            Save changes
          </Button>
        )}
      </fieldset>

      <section className={`${card} p-5 flex flex-col gap-3`}>
        <h2 className={label}>Members ({group.members.length})</h2>
        <ul className="grid sm:grid-cols-2 gap-2">
          {group.members.map((m) => (
            <li key={m.userId} className="flex items-center gap-2">
              <Avatar name={m.name} size={28} />
              <span className="text-on-surface">{m.name}</span>
              <span className="font-label-sm text-xs text-on-surface-variant">{m.role}</span>
              {owner && m.userId !== group.ownerId && (
                <button
                  type="button"
                  className="ml-auto font-label-sm text-xs text-on-surface-variant hover:text-secondary"
                  aria-label={`Remove ${m.name}`}
                  onClick={async () => {
                    if (!window.confirm(`Remove ${m.name} from ${group.name}? They lose access to its markets. Their past results stay.`)) return;
                    if (await removeMember(m.userId)) toast(`${m.name} was removed.`);
                  }}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
