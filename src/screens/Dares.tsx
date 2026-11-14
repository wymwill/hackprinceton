"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { DareView } from "@/lib/markets/types";
import { timeLeft, useNow } from "@/lib/format";
import { useApp } from "@/components/AppProvider";
import Avatar from "@/components/Avatar";
import { useGroup } from "@/components/useGroup";
import { Button, Loading, NotInGroup, card, input, label } from "@/components/ui";

const COLUMNS = [
  { id: "todo", title: "To do", hint: "Owed, no proof yet" },
  { id: "voting", title: "Group is voting", hint: "Proof posted" },
  { id: "done", title: "Done", hint: "Approved, or skipped" },
] as const;

export default function Dares() {
  const { state, group, missing } = useGroup();
  const now = useNow(1000);
  if (missing) return <NotInGroup />;
  if (!group || !state || !now) return <Loading />;
  const sorted = [...state.dares].sort((a, b) => b.dueAt.localeCompare(a.dueAt));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-headline-lg text-on-surface">Dares</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">Losers post proof, winners approve it or ask for a redo. No proof by the deadline counts as skipped.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-4 items-start">
        {COLUMNS.map((c) => {
          const list = sorted.filter((d) => (c.id === "done" ? d.status === "done" || d.status === "skipped" : d.status === c.id));
          return (
            <section key={c.id} className="flex flex-col gap-3" aria-label={c.title}>
              <h2 className={`${label} flex items-center justify-between`}>
                <span>
                  {c.title} <span className="font-num">{list.length}</span>
                </span>
                <span className="normal-case tracking-normal font-normal text-[11px]">{c.hint}</span>
              </h2>
              {list.length ? list.map((d) => <DareCard key={d.id} dare={d} groupId={group.id} now={now} />) : <div className="rounded-2xl border border-dashed border-outline-variant p-6 text-center font-body-sm text-body-sm text-on-surface-variant">Nothing here</div>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function DareCard({ dare: d, groupId, now }: { dare: DareView; groupId: string; now: number }) {
  const { state, name, postDareProof, voteDare } = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const me = state?.me;
  const mine = d.owedBy === me;
  const owedToMe = !!me && d.owedTo.includes(me);
  const myVote = me ? d.votes[me] : undefined;
  const approvals = Object.values(d.votes).filter((v) => v === "approve").length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    setBusy(true);
    let ok: boolean;
    if (file) {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("text", text);
      ok = await postDareProof(d.id, fd);
    } else ok = await postDareProof(d.id, { text });
    setBusy(false);
    if (ok) setText("");
  };

  return (
    <article className={`${card} p-4 flex flex-col gap-3 ${d.status === "skipped" ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-2.5">
        <Avatar name={name(d.owedBy)} size={32} />
        <div className="flex-1 min-w-0">
          <p className="font-label-lg text-label-lg text-on-surface">{d.text}</p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {mine ? "You owe" : `${name(d.owedBy)} owes`} {d.owedTo.map(name).join(", ")}
          </p>
        </div>
        {d.status === "done" && <span className="text-primary font-label-md text-label-md">✓ Done</span>}
        {d.status === "skipped" && <span className="text-secondary font-label-md text-label-md">Skipped</span>}
      </div>
      <Link href={`/g/${groupId}/m/${d.marketId}`} className="font-body-sm text-body-sm text-on-surface-variant hover:text-primary line-clamp-1">
        From “{d.question}”
      </Link>
      {d.proof && (
        <div className="p-2.5 rounded-xl bg-surface-container-lowest flex flex-col gap-2">
          {d.proof.text && <p className="font-body-md text-body-md text-on-surface">“{d.proof.text}”</p>}
          {d.proof.imageUrl && <img src={d.proof.imageUrl} alt="Dare proof" className="max-h-40 w-fit rounded-lg" />}
        </div>
      )}
      {(d.status === "todo" || d.status === "voting") && <p className="font-label-sm text-[11px] text-secondary">⏱ {timeLeft(d.dueAt, now)} left</p>}
      {d.status === "voting" && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {approvals} of {d.owedTo.length} approved
        </p>
      )}
      {mine && d.status === "todo" && (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <input className={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="How did it go? Link the video in the chat…" maxLength={300} aria-label="Proof" />
          <div className="flex items-center gap-2">
            <label className="px-3 py-2 rounded-xl bg-surface-container-high font-label-md text-label-md text-on-surface-variant hover:text-on-surface cursor-pointer">
              📷 Photo
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" />
            </label>
            <Button tone="primary" type="submit" className="flex-1" disabled={busy}>
              Post proof
            </Button>
          </div>
        </form>
      )}
      {owedToMe && d.status === "voting" && (
        <div className="grid grid-cols-2 gap-2">
          <Button tone="yes" onClick={() => voteDare(d.id, "approve")} className={myVote === "approve" ? "ring-2" : ""}>
            {myVote === "approve" ? "✓ Approved" : "Approve"}
          </Button>
          <Button tone="no" onClick={() => voteDare(d.id, "redo")} className={myVote === "redo" ? "ring-2" : ""}>
            {myVote === "redo" ? "Asked for redo" : "Redo"}
          </Button>
        </div>
      )}
    </article>
  );
}
