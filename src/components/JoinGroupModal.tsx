"use client";

import { useState } from "react";
import { useApp } from "./AppProvider";
import { Button, Field, Modal, input } from "./ui";

export default function JoinGroupModal({ onClose, onJoined }: { onClose: () => void; onJoined: (id: string) => void }) {
  const { joinGroup } = useApp();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await joinGroup(code);
    setBusy(false);
    if (r) onJoined(r.id);
  };
  return (
    <Modal title="Join with a code" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Invite code" hint="Find it in the group's Settings.">
          <input
            className={`${input} font-num tracking-[0.3em] uppercase text-center text-lg`}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
            placeholder="ABCD2345"
            autoFocus
          />
        </Field>
        <Button tone="primary" type="submit" disabled={busy || code.length !== 8}>
          Join group
        </Button>
      </form>
    </Modal>
  );
}
