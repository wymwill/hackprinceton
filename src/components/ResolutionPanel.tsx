"use client";

import { useRef, useState } from "react";
import type { GroupView, MarketView, Outcome, Side } from "@/lib/markets/types";
import { ago, timeLeft } from "@/lib/format";
import { useApp } from "./AppProvider";
import Avatar from "./Avatar";
import BookieMark, { sourceLabel } from "./BookieMark";
import { Button, Segmented, card, input, label } from "./ui";

const OUTCOME_LABEL: Record<Outcome, string> = { yes: "Yes", no: "No", void: "Void" };

/** Evidence, the Bookie's review, the host's call, the group's vote, and the receipt. */
export default function ResolutionPanel({ market: m, group, now }: { market: MarketView; group: GroupView; now: number }) {
  const { state } = useApp();
  const isHost = m.hostId === state?.me;

  return (
    <div className="flex flex-col gap-4">
      {m.status === "settled" && m.receipt && <ReceiptCard market={m} group={group} />}
      {m.status === "review" && m.proposal && <ReviewTally market={m} now={now} />}
      {m.status === "closed" && isHost && <HostPanel market={m} />}
      {m.status === "closed" && !isHost && (
        <div className={`${card} p-4 font-body-md text-body-md text-on-surface-variant`}>
          Trading is closed. Post evidence below, then the host calls the result and the group can dispute it.
        </div>
      )}
      {m.status !== "open" && <EvidenceSection market={m} now={now} />}
    </div>
  );
}

function EvidenceSection({ market: m, now }: { market: MarketView; now: number }) {
  const { name, postEvidence } = useApp();
  const [text, setText] = useState("");
  const [claims, setClaims] = useState<Side | "">("");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const canPost = m.status === "closed" || m.status === "review";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    setBusy(true);
    let ok: boolean;
    if (file) {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("text", text);
      if (claims) fd.set("claims", claims);
      ok = await postEvidence(m.id, fd);
    } else {
      ok = await postEvidence(m.id, { text, claims: claims || undefined });
    }
    setBusy(false);
    if (ok) {
      setText("");
      setClaims("");
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <section className={`${card} p-4 flex flex-col gap-3`} aria-label="Evidence">
      <h2 className={label}>Evidence ({m.evidence.length})</h2>
      {m.evidence.length === 0 && <p className="font-body-sm text-body-sm text-on-surface-variant">Nothing posted yet.</p>}
      <ul className="flex flex-col gap-2.5">
        {m.evidence.map((e) => (
          <li key={e.id} className="flex gap-2.5">
            <Avatar name={name(e.userId)} size={28} />
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <span className="font-label-md text-label-md text-on-surface">
                {name(e.userId)}
                {e.app && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-surface-container-high font-label-sm text-[10px] text-on-surface-variant">📱 {e.app}</span>}
                {e.claims && <span className={`ml-1.5 font-label-sm text-[11px] ${e.claims === "yes" ? "text-primary" : "text-secondary"}`}>says {e.claims === "yes" ? "Yes" : "No"}</span>}
                <span className="ml-1.5 font-label-sm text-[11px] text-on-surface-variant">{ago(e.createdAt, now)}</span>
              </span>
              {e.text && <p className="font-body-md text-body-md text-on-surface-variant">{e.text}</p>}
              {e.imageUrl && <img src={e.imageUrl} alt={`Evidence from ${name(e.userId)}`} className="max-h-48 w-fit rounded-lg ring-1 ring-outline-variant/50" />}
            </div>
          </li>
        ))}
      </ul>
      {canPost && (
        <form onSubmit={submit} className="flex flex-col gap-2 pt-2 border-t border-[#3a3645]">
          <textarea className={`${input} min-h-[64px]`} value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened? A check in, a screenshot, a witness…" maxLength={500} aria-label="Evidence" />
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${input} w-auto py-2`} value={claims} onChange={(e) => setClaims(e.target.value as Side | "")} aria-label="What does this show">
              <option value="">Shows…</option>
              <option value="yes">It happened (Yes)</option>
              <option value="no">It didn&apos;t (No)</option>
            </select>
            <label className="px-3 py-2 rounded-xl bg-surface-container-high font-label-md text-label-md text-on-surface-variant hover:text-on-surface cursor-pointer">
              📷 {fileName ? fileName.slice(0, 18) : "Photo"}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
            </label>
            <Button type="submit" className="ml-auto" disabled={busy || (!text.trim() && !fileName)}>
              Post evidence
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function ReviewCard({ market: m }: { market: MarketView }) {
  const r = m.review;
  if (!r) return null;
  return (
    <div className="rounded-xl bg-tertiary-container/[0.08] ring-1 ring-tertiary-container/30 p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <BookieMark size="xs" />
        <span className="font-label-sm text-[11px] text-tertiary/70">{sourceLabel(r.source)}</span>
      </div>
      <p className="font-headline-sm text-headline-sm text-tertiary">
        {r.status === "recommended" ? `Recommends ${OUTCOME_LABEL[r.outcome!]} · ${Math.round((r.confidence ?? 0) * 100)}% sure` : "Needs a human to decide"}
      </p>
      <p className="font-body-sm text-body-sm text-on-surface">{r.explanation}</p>
      {r.issues.length > 0 && (
        <ul className="flex flex-col gap-0.5 font-body-sm text-body-sm text-on-surface-variant list-disc pl-4">
          {r.issues.map((i, k) => (
            <li key={k}>{i.detail}</li>
          ))}
        </ul>
      )}
      <p className="font-label-sm text-[11px] text-tertiary/60">Advice only. The host decides and the group can dispute.</p>
    </div>
  );
}

function HostPanel({ market: m }: { market: MarketView }) {
  const { askBookie, proposeResult } = useApp();
  const [asking, setAsking] = useState(false);
  const rec = m.review?.status === "recommended" ? m.review.outcome : undefined;
  const [choice, setChoice] = useState<Outcome | null>(null);
  const [confirming, setConfirming] = useState(false);
  const picked = choice ?? rec ?? "yes";

  return (
    <section className={`${card} p-4 flex flex-col gap-3`} aria-label="Call the result">
      <h2 className={label}>You&apos;re the host · call the result</h2>
      <ReviewCard market={m} />
      <Button
        tone="bookie"
        disabled={asking}
        onClick={async () => {
          setAsking(true);
          await askBookie(m.id);
          setAsking(false);
        }}
      >
        <BookieMark size="xs" label={false} />
        {asking ? "The Bookie is reading the evidence…" : m.review ? "Ask the Bookie again" : "Ask the Bookie"}
      </Button>
      <Segmented
        ariaLabel="Result"
        value={picked}
        onChange={(v) => (setChoice(v), setConfirming(false))}
        options={[
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
          { value: "void", label: "Void" },
        ]}
      />
      {confirming ? (
        <div className="flex gap-2">
          <Button tone="primary" className="flex-1" onClick={() => proposeResult(m.id, picked)}>
            Propose {OUTCOME_LABEL[picked]}
          </Button>
          <Button onClick={() => setConfirming(false)}>Cancel</Button>
        </div>
      ) : (
        <Button tone="primary" onClick={() => setConfirming(true)}>
          Propose {OUTCOME_LABEL[picked]}…
        </Button>
      )}
      <p className="font-body-sm text-body-sm text-on-surface-variant">Everyone who traded gets a vote. If most dispute, it comes back to you.</p>
    </section>
  );
}

function ReviewTally({ market: m, now }: { market: MarketView; now: number }) {
  const { state, name, vote } = useApp();
  const p = m.proposal!;
  const mine = state ? p.votes[state.me] : undefined;
  const canVote = !!state && p.voters.includes(state.me);
  const confirms = p.voters.filter((v) => p.votes[v] === "confirm").length;
  const disputes = p.voters.filter((v) => p.votes[v] === "dispute").length;

  return (
    <section className={`${card} p-4 flex flex-col gap-3`} aria-label="Group vote">
      <div className="flex items-center justify-between gap-2">
        <h2 className={label}>{name(p.by)} proposed</h2>
        <span className="font-label-sm text-[11px] text-on-surface-variant">Settles in {timeLeft(p.endsAt, now)} unless disputed</span>
      </div>
      <p className={`font-display text-headline-lg ${p.outcome === "yes" ? "text-primary" : p.outcome === "no" ? "text-secondary" : "text-on-surface"}`}>{OUTCOME_LABEL[p.outcome]}</p>
      <div className="flex gap-4 font-body-md text-body-md">
        <span className="text-primary">✓ {confirms} confirm</span>
        <span className="text-secondary">✗ {disputes} dispute</span>
        <span className="text-on-surface-variant">{p.voters.length - confirms - disputes} waiting</span>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {p.voters.map((v) => (
          <li key={v} className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-surface-container-high font-label-sm text-[12px]">
            <Avatar name={name(v)} size={18} />
            {name(v)} {p.votes[v] === "confirm" ? "✓" : p.votes[v] === "dispute" ? "✗" : "…"}
          </li>
        ))}
      </ul>
      {canVote && (
        <div className="grid grid-cols-2 gap-2">
          <Button tone="yes" onClick={() => vote(m.id, "confirm")} className={mine === "confirm" ? "ring-2" : ""}>
            {mine === "confirm" ? "✓ Confirmed" : "Confirm"}
          </Button>
          <Button tone="no" onClick={() => vote(m.id, "dispute")} className={mine === "dispute" ? "ring-2" : ""}>
            {mine === "dispute" ? "✗ Disputed" : "Dispute"}
          </Button>
        </div>
      )}
      <ReviewCard market={m} />
    </section>
  );
}

function ReceiptCard({ market: m, group }: { market: MarketView; group: GroupView }) {
  const { name, state } = useApp();
  const r = m.receipt!;
  const aiRoast = r.roastSource === "claude" || r.roastSource === "stub";
  const dares = state?.dares.filter((d) => d.marketId === m.id) ?? [];
  const rows = [...r.results].sort((a, b) => b.net - a.net);

  return (
    <section className={`${card} p-5 flex flex-col gap-4 relative overflow-hidden`} aria-label="Receipt">
      <div className="flex items-center justify-between">
        <h2 className={label}>Receipt</h2>
        <span className="font-label-sm text-[11px] text-on-surface-variant">{new Date(r.settledAt).toLocaleString()}</span>
      </div>
      <p className={`stamp-in self-start ml-2 px-3 py-0.5 rounded-lg ring-2 font-display text-[30px] leading-tight ${r.outcome === "yes" ? "text-primary ring-primary" : r.outcome === "no" ? "text-secondary ring-secondary" : "text-on-surface-variant ring-outline"}`}>
        {r.voided ? "VOID" : r.outcome.toUpperCase()}
      </p>
      {r.roast && (
        <div className={`flex items-start gap-2 p-3 rounded-xl ${aiRoast ? "bg-tertiary-container/10 ring-1 ring-tertiary-container/30" : "bg-surface-container-high"}`}>
          {aiRoast ? <BookieMark size="xs" label={false} /> : <span aria-hidden>🎤</span>}
          <p className={`font-body-lg text-body-lg italic ${aiRoast ? "text-tertiary" : "text-on-surface"}`}>“{r.roast}”</p>
        </div>
      )}
      {rows.length > 0 && (
        <table className="w-full font-body-md text-body-md">
          <thead>
            <tr className={label}>
              <th className="text-left font-semibold pb-1">Who</th>
              <th className="text-right font-semibold pb-1">{group.mode === "tokens" ? "Paid out" : "Points"}</th>
              <th className="text-right font-semibold pb-1">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.userId} className="border-t border-[#3a3645]">
                <td className="py-1.5">{name(x.userId)}</td>
                <td className="py-1.5 text-right font-num">{group.mode === "tokens" ? x.payout : x.points}</td>
                <td className={`py-1.5 text-right font-num ${x.result === "won" ? "text-primary" : x.result === "lost" ? "text-secondary" : "text-on-surface-variant"}`}>
                  {group.mode === "tokens" ? `${x.net > 0 ? "+" : ""}${x.net}` : x.result === "won" ? `+${x.points}` : "0"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {dares.length > 0 && (
        <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-secondary/10 ring-1 ring-secondary/30">
          <span className="font-label-md text-label-md text-secondary">🔥 Dare owed: {r.dareText}</span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">{dares.map((d) => name(d.owedBy)).join(", ")} · see Dares</span>
        </div>
      )}
    </section>
  );
}
